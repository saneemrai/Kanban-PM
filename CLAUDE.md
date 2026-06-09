# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Kanban Studio — a project management MVP with a Next.js frontend, Python FastAPI backend, SQLite database, and an AI chat sidebar that can create/edit/move cards via OpenRouter. Everything ships as a single Docker container; the backend serves the static Next.js build at `/`.

## Commands

### Run / stop (Docker)

```powershell
scripts/start.ps1      # builds image, starts container at http://127.0.0.1:8000
scripts/stop.ps1
```

Mac/Linux equivalents: `bash scripts/start-mac.sh` / `bash scripts/start-linux.sh`.

### Backend tests

```bash
cd backend
uv sync
uv run pytest                        # all tests
uv run pytest tests/test_app.py      # single file
```

### Frontend

```bash
cd frontend
npm run dev           # dev server
npm run build         # Next.js static export
npm run lint
npm run test          # Vitest unit tests (same as test:unit)
npm run test:e2e      # Playwright
npm run test:all      # unit + e2e
```

## Architecture

```
frontend/src/
  app/            Next.js app router entry points
  components/     React components (KanbanBoard, KanbanCard*, KanbanColumn, AiChatSidebar, AuthenticatedApp)
  lib/
    api.ts        All fetch calls to the backend; session token sent as X-PM-Session header
    kanban.ts     Board data types and pure helpers

backend/app/
  main.py         FastAPI app factory (create_app); all API routes defined here
  board_store.py  SQLite persistence — schema, BoardData/Card/Column models, CRUD
  ai_client.py    OpenRouter integration; prompt building and response parsing
```

**Request flow:** Frontend stores session token in `localStorage` (`pm-session-token`). Every authenticated request passes it as the `X-PM-Session` header. The backend validates it against the `sessions` table, then resolves the username → board.

**Board invariants** (enforced in `board_store.parse_and_validate_board`): the board always has exactly five columns with fixed IDs in order: `col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`. Column count and IDs cannot change. Every card must appear in exactly one column.

**AI chat:** `POST /api/ai/chat` passes the current board + conversation history to OpenRouter (`openai/gpt-oss-120b`) and expects a JSON response `{assistantMessage, board}`. If `board` is non-null the full board is saved. The backend validates AI-returned board data with the same rules as direct saves.

**Database:** SQLite at `backend/data/pm.sqlite3` (volume-mounted in Docker). `initialize_database` is idempotent — called on each request. MVP has one hardcoded user (`user` / `password`).

## Environment

`OPENROUTER_API_KEY` must be in the project-root `.env` file. The backend loads it via `ai_client.load_root_env()`.

## Coding standards

- Keep it simple — no over-engineering, no unnecessary defensive programming.
- Identify root cause before attempting a fix; prove with evidence.
- No emojis anywhere in code or comments.
- Use latest idiomatic approaches for both Python and TypeScript.

## Color scheme (CSS variables)

| Variable | Hex | Use |
|---|---|---|
| `--accent-yellow` | `#ecad0a` | Accent lines, highlights |
| `--primary-blue` | `#209dd7` | Links, key sections |
| `--secondary-purple` | `#753991` | Submit buttons, important actions |
| `--navy-dark` | `#032147` | Main headings |
| `--gray-text` | `#888888` | Supporting text, labels |
