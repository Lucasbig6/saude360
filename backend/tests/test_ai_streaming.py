from __future__ import annotations

import json

from app.ai.schemas import (
    EVENT_CONFIRMATION_REQUIRED,
    EVENT_ERROR,
    EVENT_MESSAGE_COMPLETE,
    EVENT_MESSAGE_START,
    EVENT_TOKEN,
    EVENT_TOOL_CALL,
    EVENT_TOOL_RESULT,
    StreamEvent,
)
from app.ai.streaming import sse_format, sse_stream


def test_sse_format_shape():
    payload = sse_format(StreamEvent(EVENT_TOKEN, {"delta": "Olá"}))
    assert payload == 'event: token\ndata: {"delta": "Olá"}\n\n'


def test_sse_format_preserves_unicode():
    payload = sse_format(StreamEvent(EVENT_MESSAGE_COMPLETE, {"content": "ação"}))
    assert "ação" in payload
    # dados JSON permanecem em UTF-8 (não-ascii escrito diretamente)
    body = payload.split("data: ", 1)[1]
    assert json.loads(body) == {"content": "ação"}


def test_sse_format_serializes_nested_structures():
    payload = sse_format(
        StreamEvent(
            EVENT_TOOL_RESULT,
            {"toolCallId": "c1", "data": {"rows": [{"a": 1}]}, "durationMs": 12},
        )
    )
    body = json.loads(payload.split("data: ", 1)[1].strip())
    assert body["data"]["rows"] == [{"a": 1}]


async def test_sse_stream_yields_every_event():
    events = [
        StreamEvent(EVENT_MESSAGE_START, {}),
        StreamEvent(EVENT_TOKEN, {"delta": "x"}),
        StreamEvent(EVENT_TOOL_CALL, {"toolCallId": "c1"}),
        StreamEvent(EVENT_TOOL_RESULT, {"toolCallId": "c1"}),
        StreamEvent(EVENT_CONFIRMATION_REQUIRED, {"toolCallId": "c2"}),
        StreamEvent(EVENT_MESSAGE_COMPLETE, {}),
        StreamEvent(EVENT_ERROR, {"code": "max_steps"}),
    ]

    async def generator():
        for event in events:
            yield event

    chunks = [chunk async for chunk in sse_stream(generator())]
    assert len(chunks) == len(events)
    assert chunks[0].startswith("event: message_start")
    assert chunks[-1].startswith("event: error")
    for chunk in chunks:
        assert chunk.endswith("\n\n")
        assert "data: " in chunk
