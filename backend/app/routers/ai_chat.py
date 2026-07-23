"""
AI Chat Router
==============
Streaming and non-streaming AI assistant endpoints.
"""
from typing import List, Dict
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..services.data_pipeline import get_data
from ..services.ai_service import stream_ai_response

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Streaming AI chat endpoint.
    Returns Server-Sent Events (SSE).
    """
    data = get_data()
    messages = [m.dict() for m in request.messages]

    return StreamingResponse(
        stream_ai_response(messages, data),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
