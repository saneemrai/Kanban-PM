# Backend notes

This directory contains the FastAPI backend for the Project Management MVP.

## Current stack

- Python
- FastAPI
- Uvicorn
- uv for dependency management
- Pytest for backend tests

## Structure

- `app/main.py` defines the FastAPI app, `/api/health`, session routes, board routes, and static frontend serving.
- `tests/` contains backend tests.
- `pyproject.toml` defines backend dependencies and test configuration.

## Current behavior

- `GET /` serves the static frontend build in Docker.
- `GET /api/health` returns a JSON health response.
- `POST /api/login` accepts the MVP `user` / `password` credentials and returns a session token.
- `POST /api/logout` invalidates the current session token.
- `POST /api/ai/test` performs a backend-only OpenRouter connectivity check.
- `GET /api/board` returns the current user's Kanban board.
- `PUT /api/board` replaces the current user's Kanban board.
- Board persistence uses SQLite with normalized users, sessions, boards, columns, and cards tables.
- Board API routes require the MVP `X-PM-Session` header.
- A new login replaces that user's previous session, so only one browser can be signed in for the MVP user at a time.
- AI connectivity uses OpenRouter with model `openai/gpt-oss-120b` and reads `OPENROUTER_API_KEY`.

## Commands

Run commands from the `backend/` directory:

```bash
uv sync
uv run pytest
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```
