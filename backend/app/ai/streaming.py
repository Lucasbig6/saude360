from __future__ import annotations

import json
from collections.abc import AsyncIterator

from app.ai.schemas import StreamEvent


def sse_format(event: StreamEvent) -> str:
    """Serializa um evento no formato Server-Sent Events.

    Formato::

        event: tool_call
        data: {"toolCallId": "...", ...}

    """
    payload = json.dumps(event.data, ensure_ascii=False, default=str)
    return f"event: {event.type}\ndata: {payload}\n\n"


async def sse_stream(
    events: AsyncIterator[StreamEvent],
) -> AsyncIterator[str]:
    async for event in events:
        yield sse_format(event)
