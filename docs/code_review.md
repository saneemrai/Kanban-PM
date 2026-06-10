# Code Review

> Review date: 2026-06-10
> Scope: Full project — frontend, backend, Docker, scripts, tests, documentation.

---

## Overview

The project follows a clean client-server architecture: a Next.js frontend (static export) served by a Python FastAPI backend inside a single Docker container. The monorepo layout is well-organized with clear separation between frontend, backend, scripts, and documentation.

---

## Backend (`backend/`)

### Strengths

- Pydantic models validate every API request and response shape (`BoardData`, `Card`, `Column`, `AiChatPayload`, `AiStructuredResponse`).
- Database schema is normalized across five tables (users, boards, columns, cards, sessions) and future-proof for multi-user support.
- `initialize_database` is idempotent — safe to call on every startup.
- Board validation (`parse_and_validate_board`) enforces all invariants: exactly five fixed columns in order, no duplicate card IDs, every card in exactly one column, titles are non-empty.
- Session management is simple but correct: one session per user, replaced on new login, single-token model prevents stale sessions.
- AI integration is properly isolated in `ai_client.py` with structured response parsing and error handling for each failure mode (network, HTTP, parse, empty response).
- Full-board replacement in `save_board` is wrapped in a single transaction.

### Issues

**1. `save_board` uses DELETE + re-INSERT for cards** (`board_store.py:317`)

```python
connection.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
insert_board_cards(connection, board_id, board)
```

This loses `created_at` timestamps on every save and prevents tracking card history. An UPSERT approach (INSERT ... ON CONFLICT DO UPDATE) would preserve creation times and be more efficient.

**2. httpx client created per request** (`ai_client.py:165`)

```python
response = httpx.post(OPENROUTER_URL, ...)
```

No connection pooling or client reuse. Creates a new TCP connection for each AI call. Fine for MVP but should use a shared `httpx.Client` for production.

**3. `load_root_env()` runs at module import time** (`ai_client.py:53`)

```python
load_root_env()
```

Side effect at import time makes environment setup implicit. Prefer explicit initialization (e.g., called once from `create_app()` or a lifespan handler) to improve testability and predictability.

**4. AI prompt lacks few-shot example for board updates** (`ai_client.py:80`)

The prompt only shows `"board":null` as the example response. Providing an example of a valid full-board update would improve AI output reliability, especially for the `openai/gpt-oss-120b` model.

**5. Hardcoded password** (`board_store.py:11`)

```python
MVP_USERNAME = "user"
MVP_PASSWORD = "password"
```

Known MVP limitation documented in `DATABASE.md`. Still worth flagging: the password comparison is a simple string match on line 173 with no hashing. Should be moved to an environment variable or secrets mechanism before any production use.

---

## Frontend (`frontend/`)

### Strengths

- Clean component hierarchy: `AuthenticatedApp` -> `KanbanBoard` -> `KanbanColumn` -> `KanbanCard`.
- `@dnd-kit` integration is well-implemented with a custom collision detection strategy that handles empty columns correctly.
- API layer (`api.ts`) is clean, consistently typed, and follows a single pattern with `sessionHeaders` and `parseResponse`.
- AI chat integration correctly sends full history and applies board updates from the backend response.
- Slide-out chat panel (layout option 1) is elegantly implemented with backdrop dismiss, fixed positioning, and responsive widths.
- Tailwind CSS with CSS custom properties for the color scheme — consistent with the design spec.
- Column rename uses debounced saves (400ms) to avoid excessive API calls.

### Issues

**1. `sessionToken` as optional parameter enables implicit test-only path** (`KanbanBoard.tsx:54`)

```tsx
const [board, setBoard] = useState<BoardData>(() => initialData);
```

When `sessionToken` is undefined (tests), the component falls back to `initialData`. This mixes a test convenience into production code. Prefer injecting seed data via a prop or wrapping the component in a test provider.

**2. AI board updates skip the save indicator** (`KanbanBoard.tsx:225-229`)

```tsx
const handleAiBoardUpdate = (nextBoard: BoardData) => {
  setBoard(nextBoard);
  setSaveError("");
  setSaveState("saved");
};
```

The AI backend already persisted changes, so not calling `saveBoard` is correct. However, setting save status to "saved" without an actual save call is semantically misleading. Consider a separate status track for AI updates.

**3. Full conversation history sent with every AI message** (`AiChatSidebar.tsx:43`)

```tsx
const history = messages;
```

Every request includes the entire history plus the current board JSON. For long sessions this payload will grow without bound. No truncation or summarization strategy is implemented.

**4. Typo in test name** (`KanbanBoard.test.tsx:53`)

```
"uses a singular card count label"
```

Should be `"uses a singular card count label"` (singular -> singular).

**5. `checkSession` response data is discarded** (`api.ts:60-67`)

```tsx
export const checkSession = async (sessionToken: string): Promise<void> => {
  const response = await fetch("/api/session", {
    headers: sessionHeaders(sessionToken),
  });
```

The API returns `{"username": "..."}` but the frontend only uses the status code. Either return `void` explicitly or remove the parse step since it's unused.

**6. No per-action loading states** (`KanbanBoard.tsx`)

The board shows a loading state on initial fetch, but individual operations (adding a card, deleting, dragging) have no per-action loading indicator. The save status shows "Saving changes" but it's a global state, not per-operation.

---

## Docker & DevOps (`Dockerfile`, `scripts/`)

### Strengths

- Multi-stage Docker build: Node 24 for frontend build, Python 3.13 slim for runtime.
- Volume mount for SQLite persistence across container restarts.
- Start/stop scripts for Windows (PowerShell), macOS, and Linux — consistent behavior across platforms.
- `.dockerignore` is comprehensive and excludes dev artifacts.
- `uv` is used for Python dependency management as specified in the requirements.

### Issues

**1. Detached mode hides startup errors** (`scripts/start.ps1:17`)

```powershell
docker run -d ... | Out-Null
```

If the container exits immediately (e.g., port conflict, missing env vars), the user sees "App running at..." with no indication of failure. Consider showing container logs or using `docker run --rm` in foreground first.

**2. No Docker health check** (`Dockerfile`)

No `HEALTHCHECK` instruction. Docker has no way to determine if the app is actually serving requests. Add `HEALTHCHECK CMD curl --fail http://localhost:8000/api/health || exit 1` (requires `curl` in the runtime image).

---

## Testing

### Strengths

- Comprehensive coverage: 20 backend tests (pytest), 18 frontend tests (Vitest), 9 e2e tests (Playwright).
- Backend tests use `tmp_path` fixtures for complete isolation.
- Frontend tests mock `fetch` at the global level with `vi.stubGlobal`.
- Playwright tests test persistence across page reloads — the most important MVP behavior.
- AI responses are properly mocked in both backend and frontend tests.
- Backend tests verify both success (valid AI board update saves) and failure (invalid AI board rejected without corrupting state).

### Issues

**1. Playwright `setupBoardApi` is overly complex** (`tests/kanban.spec.ts:6-87`)

The dual-mode routing (with/without `PLAYWRIGHT_BASE_URL`) makes the setup function hard to follow. Consider separating into two helper functions or using a fixture.

**2. Heavy `monkeypatch` usage in backend tests**

Backend tests patch module-level functions extensively. While functional, this couples tests to implementation details. Consider restructuring `ai_client.py` to accept a callable or client instance for easier dependency injection.

---

## Configuration & Build

### Strengths

- `pyproject.toml` is minimal and focused — only three runtime dependencies.
- `next.config.ts` uses `output: "export"` for static export as required by the Docker setup.
- `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts` are all properly configured.
- ESLint config is present (`eslint.config.mjs`).

### Notes

- `uv.lock` is committed — good practice for reproducible builds.
- `package-lock.json` is committed — good practice.
- Backend has no linting or type-checking configured (no `ruff`, `mypy`, or `pyright` in `pyproject.toml`). Consider adding a basic linter.

---

## Documentation

### Strengths

- `README.md` is concise and covers run/stop instructions.
- `AGENTS.md` provides comprehensive guidance for AI coding assistants.
- `CLAUDE.md` mirrors `AGENTS.md` with additional architecture details.
- `docs/PLAN.md` is thorough with detailed checklists, tests, and success criteria for each part.
- `docs/DATABASE.md` documents the schema, initialization, API shape, and validation rules.
- `docs/CHAT_LAYOUT_OPTIONS.md` explores layout alternatives with clear rationale.

### Issues

- `README.md` references `127.0.0.1:8000` but doesn't explain that the app runs in Docker.
- No architecture diagram or request flow documentation (covered in `CLAUDE.md` but not in user-facing docs).

---

## Overall Assessment

The codebase is well-structured, consistently styled, and appropriately scoped for an MVP. The architectural decisions (Pydantic validation, normalized database, slide-out chat panel, full-board replacement API) are sound and avoid over-engineering.

### Top 5 Recommendations

1. **Replace DELETE+INSERT with UPSERT** in `save_board` to preserve card timestamps.
2. **Share httpx client** across AI calls for connection pooling.
3. **Add few-shot board update example** to the AI prompt to improve output reliability.
4. **Add Docker HEALTHCHECK** so container orchestration can detect app failures.
5. **Move `load_root_env()` out of module scope** into explicit initialization for better test isolation.

### Summary Table

| Area | Lines of Code | Tests | Issues |
|---|---|---|---|
| Backend | ~530 | 20 | 5 |
| Frontend | ~1200 | 27 (18 unit + 9 e2e) | 6 |
| Docker/Scripts | ~100 | 0 | 2 |
| Docs | ~750 | 0 | 0 |
