import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
APP_TITLE = "Project Management MVP"


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
