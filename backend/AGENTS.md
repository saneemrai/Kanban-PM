# Backend notes

This directory contains the FastAPI backend for the Project Management MVP.

## Current stack

- Python
- FastAPI
- Uvicorn
- uv for dependency management
- Pytest for backend tests

## Structure

- `app/main.py` defines the FastAPI app, `/api/health`, and temporary static page serving for Part 2.
- `app/static/index.html` is the temporary HTML page used before the real frontend is statically built and served.
- `tests/` contains backend tests.
- `pyproject.toml` defines backend dependencies and test configuration.

## Current behavior

- `GET /` serves the static frontend build in Docker.
- `GET /api/health` returns a JSON health response.
- `GET /api/board` returns the current user's Kanban board.
- `PUT /api/board` replaces the current user's Kanban board.
- Board persistence uses SQLite with normalized users, boards, columns, and cards tables.
- Board API routes require the MVP `X-PM-User: user` header.
- There is no AI integration yet.

## Commands

Run commands from the `backend/` directory:

```bash
uv sync
uv run pytest
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```
