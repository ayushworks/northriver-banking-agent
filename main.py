"""NorthRiver Banking Agent — FastAPI server with live audio WebSocket."""

import asyncio
import base64
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.apps.app import App, EventsCompactionConfig
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.cloud import firestore
from google.genai import types

from banking_agent.agent import root_agent
from banking_agent import ui_events

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("northriver_banking")

# ---------------------------------------------------------------------------
# Application-level singletons
# ---------------------------------------------------------------------------

APP_NAME = "northriver_banking_agent"

session_service = InMemorySessionService()

# Wrap the root agent in an App so we can enable context compaction.
# EventsCompactionConfig removes the hard 10-minute Vertex AI session limit
# by summarising older conversation history as the context window fills up,
# allowing sessions to run indefinitely.
_app = App(
    name=APP_NAME,
    root_agent=root_agent,
    events_compaction_config=EventsCompactionConfig(
        compaction_interval=20,  # summarise every 20 events
        overlap_size=3,          # keep last 3 events in the next window for continuity
    ),
)

runner = Runner(
    app=_app,
    session_service=session_service,
)

_db: Optional[firestore.Client] = None


def get_db() -> firestore.Client:
    global _db
    if _db is None:
        project = os.getenv("FIRESTORE_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
        _db = firestore.Client(project=project)
    return _db


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="NorthRiver Banking Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    username: str
    password: str


class SessionResponse(BaseModel):
    session_id: str
    user_id: str
    customer_name: str
    balance: float
    iban: str


def _load_demo_credentials() -> dict[str, dict]:
    """Parse DEMO_CREDENTIALS env var into a lookup dict keyed by username.

    Format: ``username:password:account_id:user_id`` entries separated by commas.
    Example:
        sophie:nova1234:acc_demo_01:user_demo_01,liam:nova1234:acc_demo_02:user_demo_02
    """
    raw = os.getenv(
        "DEMO_CREDENTIALS",
        "sophie:nova1234:acc_demo_01:user_demo_01,liam:nova1234:acc_demo_02:user_demo_02",
    )
    creds: dict[str, dict] = {}
    for entry in raw.split(","):
        parts = entry.strip().split(":")
        if len(parts) == 4:
            username, password, account_id, user_id = parts
            creds[username.lower()] = {
                "password": password,
                "account_id": account_id,
                "user_id": user_id,
            }
    return creds


@app.post("/api/auth/login", response_model=SessionResponse)
async def login(body: LoginRequest):
    """Authenticate with username/password and create an ADK banking session."""
    creds = _load_demo_credentials()
    entry = creds.get(body.username.lower())

    if not entry or entry["password"] != body.password:
        logger.warning(f"[AUTH] Failed login attempt for username='{body.username}'")
        raise HTTPException(status_code=401, detail="Invalid username or password")

    account_id = entry["account_id"]
    user_id = entry["user_id"]

    db = get_db()
    acc_doc = db.collection("accounts").document(account_id).get()
    if not acc_doc.exists:
        raise HTTPException(status_code=404, detail="Account not found")

    acc_data = acc_doc.to_dict()
    session_id = str(uuid.uuid4())

    logger.info(
        f"[AUTH] Login successful username='{body.username}' "
        f"user={user_id} account={account_id} customer='{acc_data['name']}'"
    )
    logger.info(
        f"[SESSION] Creating session={session_id} user={user_id} "
        f"account={account_id} customer='{acc_data['name']}'"
    )

    await session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
        state={
            "customer_name":  acc_data["name"],
            "account_id":     account_id,
            "account_number": acc_data["iban"],
            "balance":        acc_data["balance"],
            # Stored so tools can look up the ui_events queue by session_id.
            "session_id":     session_id,
        },
    )

    return SessionResponse(
        session_id=session_id,
        user_id=user_id,
        customer_name=acc_data["name"],
        balance=acc_data["balance"],
        iban=acc_data["iban"],
    )


# ---------------------------------------------------------------------------
# WebSocket — live audio + image streaming
# ---------------------------------------------------------------------------


@app.websocket("/ws/{user_id}/{session_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, session_id: str):
    """Bidirectional WebSocket for live audio conversation.

    Client → Server:
      Binary frames: raw PCM16 audio at 16kHz
      Text frames (JSON):
        {"type": "image", "data": "<base64_jpeg>"}  — bill photo
        {"type": "text", "content": "..."}           — fallback text input

    Server → Client (JSON text frames):
      {"type": "audio", "data": "<base64_pcm24>"}
      {"type": "transcript_input", "text": "...", "finished": bool}
      {"type": "transcript_output", "text": "...", "finished": bool}
      {"type": "tool_call", "name": "...", "label": "..."}
      {"type": "turn_complete"}
      {"type": "error", "message": "..."}
    """
    await websocket.accept()
    logger.info(f"[WS] Connected user={user_id} session={session_id}")

    # Verify session exists
    session = await session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )
    if not session:
        logger.warning(f"[WS] Session not found user={user_id} session={session_id}")
        await websocket.send_text(json.dumps({"type": "error", "message": "Session not found"}))
        await websocket.close()
        return

    live_request_queue = LiveRequestQueue()

    # Register a UI-events queue for this session so tools (e.g. get_transactions)
    # can push structured display data to the frontend without going through the
    # agent's spoken response.
    ui_queue = ui_events.register(session_id)

    # Trigger the agent to speak first as soon as the session opens.
    # The queue buffers this; run_live consumes it the moment the connection
    # is established, so River greets the customer without waiting for them to speak.
    live_request_queue.send_content(
        types.Content(
            role="user",
            parts=[types.Part(text="[session_start]")],
        )
    )

    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore")
            )
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )

    # Tool name → friendly display label for the UI
    TOOL_LABELS = {
        "get_account_balance": "Checking your balance…",
        "get_transactions": "Looking up transactions…",
        "find_contact": "Looking up contact…",
        "make_transfer": "Processing transfer…",
        "process_qr_payment": "Processing payment…",
    }

    async def upstream_task():
        """Receive from WebSocket and forward to LiveRequestQueue."""
        try:
            while True:
                message = await websocket.receive()

                if "bytes" in message and message["bytes"]:
                    # Binary frame = PCM16 audio
                    chunk_size = len(message["bytes"])
                    logger.debug(f"[UPSTREAM] audio chunk={chunk_size} bytes")
                    audio_blob = types.Blob(
                        mime_type="audio/pcm;rate=16000",
                        data=message["bytes"],
                    )
                    live_request_queue.send_realtime(audio_blob)

                elif "text" in message and message["text"]:
                    payload = json.loads(message["text"])

                    if payload.get("type") == "image":
                        image_bytes = base64.b64decode(payload["data"])
                        mime_type = payload.get("mimeType", "image/jpeg")
                        prompt = payload.get("prompt", "").strip()
                        logger.info(
                            f"[UPSTREAM] image received size={len(image_bytes)} bytes "
                            f"mime={mime_type} prompt='{prompt}'"
                        )

                        # Build a multi-part Content: image inline_data + the
                        # user's intent text bundled in the same turn.
                        # send_content() stores the turn in the session history
                        # so both the orchestrator AND any sub-agent it delegates
                        # to (e.g. payments_agent) see the image and intent
                        # together.  send_realtime() is for the continuous audio
                        # stream and does not propagate to sub-agents.
                        parts = [
                            types.Part(
                                inline_data=types.Blob(
                                    mime_type=mime_type,
                                    data=image_bytes,
                                )
                            )
                        ]
                        if prompt:
                            parts.append(types.Part(text=prompt))

                        live_request_queue.send_content(
                            types.Content(role="user", parts=parts)
                        )

                    elif payload.get("type") == "text":
                        logger.info(f"[UPSTREAM] text message: '{payload.get('content', '')}'")
                        live_request_queue.send_content(
                            types.Content(
                                role="user",
                                parts=[types.Part(text=payload["content"])],
                            )
                        )

        except WebSocketDisconnect:
            logger.info(f"[WS] Client disconnected (upstream) user={user_id}")
        except Exception as e:
            logger.error(f"[WS] Upstream error: {e}", exc_info=True)
            try:
                await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
            except Exception:
                pass

    async def downstream_task():
        """Receive ADK events and forward to WebSocket client.

        Output transcription is buffered until the turn is complete before
        being sent to the client. This avoids streaming partial/garbled text
        and sidesteps uncertainty about whether Vertex AI sends cumulative or
        chunk-based transcription events.

        Input transcription still uses cursor-based delta normalisation
        (Vertex AI sends full cumulative text per event for input).
        """
        # Input cursor: tracks how many chars of input transcription we have
        # already forwarded. Vertex AI sends cumulative text so we only send
        # the new suffix on each event.
        _input_cursor: int = 0

        # Output buffer: accumulate output transcription until the turn ends.
        # Flushed on finished=True from the transcription event, or on
        # turn_complete as a safety fallback.
        _output_buffer: str = ""

        event_count = 0

        async for event in runner.run_live(
            user_id=user_id,
            session_id=session_id,
            live_request_queue=live_request_queue,
            run_config=run_config,
        ):
            event_count += 1
            try:
                # ── Summarise every event at INFO level ──────────────────────
                has_audio = bool(
                    event.content
                    and event.content.parts
                    and any(
                        p.inline_data and p.inline_data.mime_type.startswith("audio/")
                        for p in event.content.parts
                    )
                )
                logger.info(
                    f"[EVENT #{event_count}] "
                    f"audio={has_audio} "
                    f"input_tx={bool(event.input_transcription)} "
                    f"output_tx={bool(event.output_transcription)} "
                    f"interrupted={bool(event.interrupted)} "
                    f"turn_complete={bool(event.turn_complete)}"
                )

                # ── UI events side-channel (tool → frontend) ─────────────────
                # Drain any events that tools pushed onto the session queue.
                # get_transactions() writes the transaction list here so the
                # frontend can render a table without the agent speaking each row.
                while not ui_queue.empty():
                    ui_event = ui_queue.get_nowait()
                    logger.info(
                        f"[UI_EVENT] type={ui_event.get('type')} "
                        f"count={ui_event.get('count', '—')}"
                    )
                    await websocket.send_text(json.dumps(ui_event))

                # ── Audio output ─────────────────────────────────────────────
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.inline_data and part.inline_data.mime_type.startswith("audio/pcm"):
                            chunk_size = len(part.inline_data.data)
                            logger.debug(f"[AUDIO] sending chunk={chunk_size} bytes")
                            await websocket.send_text(
                                json.dumps(
                                    {
                                        "type": "audio",
                                        "data": base64.b64encode(part.inline_data.data).decode(),
                                        "mimeType": part.inline_data.mime_type,
                                    }
                                )
                            )

                # ── Input transcription (customer speech) ────────────────────
                if event.input_transcription and event.input_transcription.text:
                    full_text = event.input_transcription.text
                    finished = event.input_transcription.finished
                    delta = full_text[_input_cursor:]
                    prev_cursor = _input_cursor
                    _input_cursor = 0 if finished else len(full_text)

                    logger.info(
                        f"[TRANSCRIPT_IN] "
                        f"full='{full_text}' "
                        f"finished={finished} "
                        f"cursor_before={prev_cursor} "
                        f"delta='{delta}'"
                    )

                    if delta:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "transcript_input",
                                    "text": delta,
                                    "finished": finished,
                                }
                            )
                        )

                # ── Output transcription (agent speech) ──────────────────────
                # Buffer all chunks; flush only when finished=True or on
                # turn_complete. Never stream partial output transcription.
                if event.output_transcription and event.output_transcription.text:
                    full_text = event.output_transcription.text
                    finished = event.output_transcription.finished

                    # Detect whether Vertex AI is sending cumulative text or
                    # independent chunks and accumulate accordingly.
                    if full_text.startswith(_output_buffer):
                        # Cumulative: new text is a superset of what we have.
                        # Replace the buffer with the latest (longer) version.
                        strategy = "cumulative"
                        _output_buffer = full_text
                    else:
                        # Non-cumulative chunks: append with space if needed.
                        strategy = "chunk"
                        sep = (
                            ""
                            if not _output_buffer
                            or _output_buffer.endswith(" ")
                            or full_text.startswith(" ")
                            else " "
                        )
                        _output_buffer += sep + full_text

                    logger.info(
                        f"[TRANSCRIPT_OUT] "
                        f"raw='{full_text}' "
                        f"finished={finished} "
                        f"strategy={strategy} "
                        f"buffer='{_output_buffer}'"
                    )

                    if finished and _output_buffer:
                        logger.info(
                            f"[FLUSH_OUTPUT] reason=finished text='{_output_buffer}'"
                        )
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "transcript_output",
                                    "text": _output_buffer,
                                    "finished": True,
                                }
                            )
                        )
                        _output_buffer = ""

                # ── Interruption (barge-in detected by model) ────────────────
                if event.interrupted:
                    logger.info(
                        f"[INTERRUPTED] Barge-in detected. "
                        f"Discarding output_buffer='{_output_buffer}'"
                    )
                    _output_buffer = ""  # discard partial agent response
                    _input_cursor = 0   # reset ready for the fresh user turn
                    await websocket.send_text(json.dumps({"type": "interrupted"}))

                # ── Turn complete ────────────────────────────────────────────
                if event.turn_complete:
                    logger.info(
                        f"[TURN_COMPLETE] output_buffer='{_output_buffer}' "
                        f"(total events this session: {event_count})"
                    )

                    # Flush any output transcript that didn't get a finished=True
                    if _output_buffer:
                        logger.info(
                            f"[FLUSH_OUTPUT] reason=turn_complete text='{_output_buffer}'"
                        )
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "transcript_output",
                                    "text": _output_buffer,
                                    "finished": True,
                                }
                            )
                        )
                        _output_buffer = ""

                    await websocket.send_text(json.dumps({"type": "turn_complete"}))

            except WebSocketDisconnect:
                logger.info(f"[WS] Client disconnected (downstream) user={user_id}")
                break
            except Exception as e:
                logger.error(f"[EVENT #{event_count}] Processing error: {e}", exc_info=True)

        logger.info(
            f"[WS] ADK stream ended user={user_id} total_events={event_count}"
        )

    try:
        await asyncio.gather(
            upstream_task(),
            downstream_task(),
            return_exceptions=True,
        )
    finally:
        logger.info(f"[WS] Closing connection user={user_id} session={session_id}")
        live_request_queue.close()
        ui_events.deregister(session_id)


# ---------------------------------------------------------------------------
# Static file serving (React build)
# ---------------------------------------------------------------------------

_frontend_dist = Path(__file__).parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
