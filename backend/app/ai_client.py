import json
import os
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.board_store import BoardData

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
APP_TITLE = "Project Management MVP"


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str


class AiChatPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    history: list[ChatMessage] = Field(default_factory=list)


class AiStructuredResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistantMessage: str
    board: dict[str, Any] | None = None


def load_root_env(root: Path | None = None) -> None:
    env_path = (root or Path(__file__).resolve().parents[2]) / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        clean_line = line.strip()
        if not clean_line or clean_line.startswith("#") or "=" not in clean_line:
            continue
        key, value = clean_line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def get_openrouter_api_key() -> str:
    load_root_env()
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY is not configured.",
        )
    return api_key


def build_openrouter_request(prompt: str) -> dict[str, Any]:
    return {
        "model": OPENROUTER_MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "temperature": 0,
    }


def build_ai_chat_prompt(payload: AiChatPayload, board: BoardData) -> str:
    history = [
        {"role": message.role, "content": message.content}
        for message in payload.history
    ]
    return "\n".join(
        [
            "You are the AI assistant for a local project management Kanban app.",
            "Respond with valid JSON only. Do not wrap it in markdown.",
            "The JSON response must match this shape:",
            '{"assistantMessage":"short reply","board":null}',
            "Set board to null when no board change is needed.",
            "When changing the board, return the full board JSON in board.",
            "The board must keep exactly the same five column IDs in the same order.",
            "Every card must appear in exactly one column cardIds array.",
            "Every card in cards must have id, title, and details.",
            f"Conversation history JSON: {json.dumps(history, ensure_ascii=True)}",
            f"Current board JSON: {json.dumps(board.model_dump(), ensure_ascii=True)}",
            f"User message: {payload.message}",
        ]
    )


def parse_ai_response(content: str) -> AiStructuredResponse:
    try:
        data = json.loads(content)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=502,
            detail="AI returned invalid JSON.",
        ) from error

    try:
        parsed = AiStructuredResponse.model_validate(data)
    except ValueError as error:
        raise HTTPException(
            status_code=502,
            detail="AI returned an invalid response shape.",
        ) from error

    if not parsed.assistantMessage.strip():
        raise HTTPException(
            status_code=502,
            detail="AI returned an empty assistant message.",
        )
    return parsed


def call_ai_chat(payload: AiChatPayload, board: BoardData) -> AiStructuredResponse:
    return parse_ai_response(call_openrouter(build_ai_chat_prompt(payload, board)))


def call_openrouter(prompt: str = "What is 2+2? Answer with only the number.") -> str:
    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {get_openrouter_api_key()}",
                "Content-Type": "application/json",
                "X-OpenRouter-Title": APP_TITLE,
            },
            json=build_openrouter_request(prompt),
            timeout=30,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail="OpenRouter returned an error.",
        ) from error
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=502,
            detail="OpenRouter could not be reached.",
        ) from error

    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise HTTPException(
            status_code=502,
            detail="OpenRouter returned an unexpected response.",
        ) from error

    if not isinstance(content, str) or not content.strip():
        raise HTTPException(
            status_code=502,
            detail="OpenRouter returned an empty response.",
        )
    return content.strip()
