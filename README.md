# NorthRiver Banking Agent

> **Voice-first AI banking assistant powered by Google ADK & Gemini Live**
> Gemini Live Agent Challenge submission — March 2026

NorthRiver Bank introduces **River** — a voice AI that lets customers check balances, transfer money, and pay bills by photo, entirely through natural conversation. No taps, no forms, no branch visits. Just speak.

---

## Architectural Diagram

![NorthRiver Banking Agent Architecture](assets/architecture.svg)

---

## Demo Flows

| # | Flow | How it works |
|---|------|-------------|
| 1 | **Spending Query** | *"How much did I spend on coffee last year?"* → River queries Firestore and answers in plain speech |
| 2 | **Contact Transfer** | *"Send €50 to David"* → River looks up IBAN, confirms details, executes transfer |
| 3 | **QR Bill Payment** | Snap a photo of a bill → River reads the SEPA EPC QR code, confirms amount, pays instantly |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Model | Gemini Live 2.5 Flash Native Audio (Vertex AI) |
| Agent Framework | Google ADK (`runner.run_live()`) |
| Backend | Python, FastAPI, WebSocket |
| Database | Google Firestore |
| Frontend | React, Vite, Web Audio API, AudioWorklet |
| Infrastructure | Docker, Google Cloud Run, Cloud Build |

---

## Project Structure

```
banking-agent/
├── banking_agent/
│   ├── agent.py          # Root orchestrator (River)
│   ├── account_info.py   # Account & transaction domain agent
│   ├── payments.py       # Transfers & QR payment domain agent
│   └── db.py             # Firestore client singleton
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── BankingInterface.jsx   # Main UI
│   │   │   ├── LoginScreen.jsx        # Auth screen
│   │   │   ├── MicButton.jsx          # Record / speaking states
│   │   │   ├── TranscriptDisplay.jsx  # Live conversation bubbles
│   │   │   └── ImageCapture.jsx       # Bill photo uploader
│   │   ├── AudioCapture.js            # getUserMedia → PCM16 via AudioWorklet
│   │   └── AudioPlayer.js             # PCM16 (24kHz) → Web Audio playback
│   └── index.html
├── assets/
│   ├── architecture.svg               # Architecture diagram
│   └── vattenfall_bill_qr.png         # Demo SEPA EPC QR bill
├── main.py                            # FastAPI server + WebSocket handler
├── seed_data.py                       # Populate Firestore with demo data
├── deploy.sh                          # Cloud Run deployment script
├── cloudbuild.yaml                    # CI/CD pipeline
├── Dockerfile                         # Multi-stage Node + Python build
└── .env.example                       # Environment variable template
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- Google Cloud project with Vertex AI & Firestore enabled
- `gcloud` CLI authenticated

### 1. Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/northriver-banking-agent.git
cd northriver-banking-agent
cp .env.example .env
# Edit .env with your GCP project details
```

### 2. Install dependencies

```bash
# Python
pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

### 3. Seed Firestore

```bash
python seed_data.py
```

This creates the demo account (Sophie van den Berg), contact (David), and generates the Vattenfall demo QR bill in `assets/`.

### 4. Run locally

```bash
# Terminal 1 — backend
uvicorn main:app --port 8080

# Terminal 2 — frontend dev server
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and sign in with:

| Username | Password |
|----------|----------|
| `sophie` | `nova1234` |
| `liam`   | `nova1234` |

---

## WebSocket Protocol

**Endpoint:** `ws://{host}/ws/{user_id}/{session_id}`

| Direction | Frame type | Payload |
|-----------|-----------|---------|
| Client → Server | Binary | Raw PCM16 audio at 16kHz |
| Client → Server | JSON text | `{"type": "image", "data": "<base64_jpeg>"}` |
| Client → Server | JSON text | `{"type": "text", "content": "..."}` |
| Server → Client | JSON text | `{"type": "audio", "data": "<base64_pcm24>"}` |
| Server → Client | JSON text | `{"type": "transcript_input", "text": "...", "finished": bool}` |
| Server → Client | JSON text | `{"type": "transcript_output", "text": "...", "finished": bool}` |
| Server → Client | JSON text | `{"type": "turn_complete"}` |

---

## Deploy to Cloud Run

```bash
./deploy.sh --project YOUR_GCP_PROJECT --region europe-west4
```

Or with Firestore seeding in one step:

```bash
./deploy.sh --project YOUR_GCP_PROJECT --seed
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | GCP project ID |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI region (e.g. `us-central1`) |
| `GOOGLE_GENAI_USE_VERTEXAI` | Set to `TRUE` for Vertex AI |
| `AGENT_MODEL` | Gemini model alias (default: `gemini-live-2.5-flash-native-audio`) |
| `FIRESTORE_PROJECT` | Firestore project ID (defaults to `GOOGLE_CLOUD_PROJECT`) |
| `DEMO_CREDENTIALS` | Comma-separated `user:pass:account_id:user_id` entries |

---

## Agent Architecture

River uses a **multi-agent hierarchy** built on Google ADK:

```
northriver_orchestrator  (River — greets & routes)
├── account_info_agent   (balances, transactions, spending)
└── payments_agent       (transfers, QR bill payments)
```

The orchestrator routes silently — customers never know sub-agents exist. Each sub-agent has access to a scoped set of Firestore tools and a tightly focused system prompt.

---

## License

MIT
