"""Side-channel for pushing structured UI events from tool code to the WebSocket layer.

Problem: tools run inside ADK's runner and have no direct reference to the
WebSocket. This module provides a lightweight per-session asyncio.Queue that:
  - main.py registers when a WebSocket session opens
  - tool code writes to via emit()
  - main.py drains on every event loop iteration and forwards to the client

Because everything runs in the same asyncio event loop, put_nowait() from sync
tool code and get_nowait() from async WebSocket code are both safe.
"""
from __future__ import annotations

import asyncio
from typing import Optional

# session_id → Queue of dicts to send to the frontend
_queues: dict[str, asyncio.Queue] = {}


def register(session_id: str) -> asyncio.Queue:
    """Called by the WebSocket handler when a session opens."""
    q: asyncio.Queue = asyncio.Queue()
    _queues[session_id] = q
    return q


def deregister(session_id: str) -> None:
    """Called by the WebSocket handler when a session closes."""
    _queues.pop(session_id, None)


def emit(session_id: str, event: dict) -> None:
    """Push a UI event from synchronous tool code onto the session queue.

    Safe to call from sync context — uses put_nowait() which never blocks.
    Silently no-ops if the session has no registered queue.
    """
    q: Optional[asyncio.Queue] = _queues.get(session_id)
    if q is not None:
        q.put_nowait(event)
