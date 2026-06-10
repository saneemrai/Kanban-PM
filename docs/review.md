# Kanban Studio — Code Review

**Date:** 2026-06-10  
**Reviewer:** Claude Sonnet 4.6  
**Scope:** Full-stack MVP — FastAPI backend, SQLite persistence, OpenRouter AI integration, Next.js/React frontend

---

## Executive Summary

Kanban Studio is a clean, well-structured MVP. The architecture is simple and intentional, all SQL is parameterised, React renders text via JSX (no `dangerouslySetInnerHTML`), and Pydantic validates every API boundary. The test coverage is solid. XSS and SQL injection surface area is effectively zero.

The issues below range from a real security concern (an unauthenticated endpoint that burns API credits) to several correctness and robustness gaps that would surface under realistic use. None require architectural changes.

---

## Findings by Severity

### Critical

#### C-1 — Unauthenticated `/api/ai/test` endpoint makes live paid API calls
**File:** `backend/app/main.py`, lines 35–40

The `POST /api/ai/test` route calls `call_openrouter()` with no session check. Any anonymous HTTP client can hit this endpoint, burn API credits, and confirm which model is in use. FastAPI also exposes `/docs` and `/openapi.json` to anyone who can reach port 8000, and the Docker container binds to `0.0.0.0`.

**Fix:** Add the same `get_username_for_session` guard used by `/api/ai/chat`, or remove the endpoint entirely. Disable auto-generated docs in production:

```python
app = FastAPI(title="Project Management API", docs_url=None, redoc_url=None)
```

---

### High

#### H-1 — Unbounded conversation history inflates prompt size and API cost
**Files:** `frontend/src/components/AiChatSidebar.tsx` lines 43–50; `backend/app/ai_client.py` lines 77–97

Every AI request sends the entire conversation history with no cap. A long session will exceed the model's context window (triggering a 502 from OpenRouter) and inflate latency and cost on every turn.

**Fix:** Cap history to a rolling window. Add field-level validators on the backend:

```python
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)

class AiChatPayload(BaseModel):
    message: str = Field(max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
```

#### H-2 — No length limits on card/column fields; prompt injection surface
**Files:** `backend/app/board_store.py` lines 358–403; `backend/app/ai_client.py` line 94

`parse_and_validate_board` checks that titles are non-empty but imposes no upper bound. A client can submit a card with megabytes in the `details` field. That data is stored in SQLite and then serialised verbatim into the AI prompt via `json.dumps(board.model_dump())`, which can crowd out system instructions or exceed the context window. Card content is also a prompt injection vector.

**Fix:**

```python
class Card(BaseModel):
    id: str = Field(max_length=128)
    title: str = Field(max_length=200)
    details: str = Field(max_length=2000)
```

Add a matching `max_length=100` to `Column.title`.

#### H-3 — `save_board` deletes then reinserts cards across two connections
**File:** `backend/app/board_store.py`, lines 304–323

`save_board` opens one connection, deletes all cards, and reinserts them. It then calls `get_board` on a separate connection. A concurrent read between delete and reinsert returns an empty card list. With a single uvicorn worker this is unlikely, but the design is inherently fragile.

**Fix:** Return the already-validated in-memory board object directly from `save_board` instead of doing a second DB round-trip:

```python
def save_board(db_path: Path, username: str, payload: dict[str, Any]) -> BoardData:
    board = parse_and_validate_board(payload)
    with connect(db_path) as connection:
        board_id = get_board_id(connection, username)
        # ... writes ...
    return board  # already validated — no second read needed
```

---

### Medium

#### M-1 — Rename column debounce timer not cleared on unmount
**File:** `frontend/src/components/KanbanBoard.tsx`, lines 63, 179–189

`handleRenameColumn` sets a `setTimeout` in a `useRef` but there is no `useEffect` cleanup to clear it on unmount. If the user renames a column and logs out within 400 ms, `commitBoard` fires against a cleared session token.

**Fix:**

```typescript
useEffect(() => {
  return () => {
    if (renameTimer.current) clearTimeout(renameTimer.current);
  };
}, []);
```

#### M-2 — Rename timer closes over stale board; AI update during debounce is silently discarded
**File:** `frontend/src/components/KanbanBoard.tsx`, lines 179–189

`handleRenameColumn` closes over the `nextBoard` snapshot in the `setTimeout` callback. If an AI-triggered board update arrives and calls `setBoard(nextBoard)` while the timer is pending, the timer fires 400 ms later with the pre-update snapshot and overwrites the AI change on the server.

**Fix:** Store only the pending rename metadata in the ref; read the latest board state inside the callback:

```typescript
const pendingRename = useRef<{ columnId: string; title: string } | null>(null);

const handleRenameColumn = (columnId: string, title: string) => {
  setBoard((prev) => ({
    ...prev,
    columns: prev.columns.map((col) =>
      col.id === columnId ? { ...col, title } : col
    ),
  }));
  pendingRename.current = { columnId, title };
  if (renameTimer.current) clearTimeout(renameTimer.current);
  renameTimer.current = setTimeout(() => {
    setBoard((latest) => { commitBoard(latest); return latest; });
  }, 400);
};
```

#### M-3 — `board.cards[cardId]` can be `undefined`; no guard before rendering
**File:** `frontend/src/components/KanbanBoard.tsx`, line 349

```tsx
cards={column.cardIds.map((cardId) => board.cards[cardId])}
```

If `cardIds` references an ID absent from `cards` (possible from an AI-returned board or during in-flight state), the mapped value is `undefined`. `KanbanCard` immediately accesses `card.id`, `card.title`, and `card.details` without a guard, causing a runtime error.

**Fix:**

```tsx
cards={column.cardIds.flatMap((cardId) => {
  const card = board.cards[cardId];
  return card ? [card] : [];
})}
```

#### M-4 — Card IDs use `Math.random()`, which is not cryptographically secure
**File:** `frontend/src/lib/kanban.ts`, lines 182–186

`Math.random()` is seeded by the browser PRNG. Collisions are improbable but possible when cards are created rapidly (e.g. in bulk via the AI). A collision causes the backend to reject the board with a 422 ("Card IDs cannot appear in more than one column").

**Fix:**

```typescript
export const createId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
```

`crypto.randomUUID()` is available in all modern browsers and Next.js.

#### M-5 — No timing-safe comparison or brute-force protection on `/api/login`
**File:** `backend/app/board_store.py`, lines 172–188

The login endpoint uses a plain `==` comparison, which is vulnerable to timing attacks. There is also no rate limiting, no lockout, and no account-level throttle.

**Fix:** Use `secrets.compare_digest` to prevent timing attacks. Document that rate limiting should be added via a reverse proxy before any networked deployment:

```python
import secrets
if not (username == MVP_USERNAME and secrets.compare_digest(password, MVP_PASSWORD)):
    raise HTTPException(status_code=401, detail="Invalid credentials.")
```

#### M-6 — CLAUDE.md contains an inaccuracy about `initialize_database`
**File:** `CLAUDE.md`, line 63

The docs state "`initialize_database` is idempotent — called on each request." In the code it is called once at application startup inside `create_app` (`main.py` line 29), not per request.

**Fix:** Update CLAUDE.md:
> `initialize_database` is idempotent and is called once at application startup inside `create_app`.

---

### Low

#### L-1 — `pydantic` is not declared as a direct dependency
**File:** `backend/pyproject.toml`

`pydantic` is imported directly in `board_store.py` and `ai_client.py` but only present transitively through `fastapi`. If FastAPI ever relaxes its Pydantic pin the dependency will fail to resolve.

**Fix:** Add `"pydantic"` to the `dependencies` list in `pyproject.toml`.

#### L-2 — Session token stored in `localStorage` is accessible to JavaScript
**File:** `frontend/src/components/AuthenticatedApp.tsx`, lines 17–19, 31

`localStorage` is readable by any script on the page. For this single-user, local-deployment MVP the risk is acceptable, but it is a known limitation for any future networked deployment. An `HttpOnly` cookie is the standard mitigation.

**Recommendation:** Document as a known limitation. No immediate action required for the MVP scope.

#### L-3 — FastAPI `/docs` and `/redoc` are publicly exposed
**File:** `backend/app/main.py`, line 27

FastAPI mounts interactive API docs at startup by default, exposing all routes and schemas to any client that can reach the server.

**Fix:** Disable unconditionally (the frontend is the only intended client) or gate on a debug flag:

```python
app = FastAPI(
    title="Project Management API",
    docs_url=None,
    redoc_url=None,
)
```

#### L-4 — Message `key` in AI chat list uses array index
**File:** `frontend/src/components/AiChatSidebar.tsx`, line 103

```tsx
key={`${message.role}-${index}`}
```

Array index as key is fragile if messages are ever prepended or reordered. For an append-only list it works, but it is a maintenance trap.

**Fix:** Assign a monotonic ID when pushing messages and use that as the key.

#### L-5 — No index on `cards.board_id`
**File:** `backend/app/board_store.py` (schema)

The `cards` table is queried by `board_id` on every board load but has no index on that column. Irrelevant at MVP scale; worth adding before growth.

**Fix:**

```sql
CREATE INDEX IF NOT EXISTS idx_cards_board_id ON cards(board_id);
```

---

## Summary Table

| ID  | Severity | File | Description |
|-----|----------|------|-------------|
| C-1 | Critical | `main.py:35` | Unauthenticated `/api/ai/test` makes live paid API calls |
| H-1 | High | `AiChatSidebar.tsx:43`, `ai_client.py:77` | Unbounded conversation history inflates prompt and cost |
| H-2 | High | `board_store.py:358`, `ai_client.py:94` | No field length limits; prompt injection surface |
| H-3 | High | `board_store.py:304` | Save uses delete-then-reinsert with a second connection for the read |
| M-1 | Medium | `KanbanBoard.tsx:63` | Rename debounce timer not cleared on unmount |
| M-2 | Medium | `KanbanBoard.tsx:179` | Rename timer closes over stale board; AI update during debounce is silently overwritten |
| M-3 | Medium | `KanbanBoard.tsx:349` | `board.cards[cardId]` can be `undefined` with no guard before rendering |
| M-4 | Medium | `kanban.ts:182` | `Math.random()` used for card IDs — not cryptographically secure |
| M-5 | Medium | `board_store.py:172` | No timing-safe comparison or rate limiting on login |
| M-6 | Medium | `CLAUDE.md:63` | `initialize_database` documented as per-request; actually called once at startup |
| L-1 | Low | `pyproject.toml` | `pydantic` used directly but not declared as a dependency |
| L-2 | Low | `AuthenticatedApp.tsx:31` | Session token in `localStorage` — known MVP trade-off |
| L-3 | Low | `main.py:27` | FastAPI `/docs` and `/redoc` publicly exposed |
| L-4 | Low | `AiChatSidebar.tsx:103` | Message `key` uses array index |
| L-5 | Low | `board_store.py` schema | No index on `cards.board_id` |

---

## Conclusion

The codebase is well written for an MVP — clean data model, thorough validation, parameterised SQL throughout, and a solid test suite. The most actionable findings are **C-1** (fix before any networked deployment — free credit-burn vector), **H-1** and **H-2** (add field length caps to prevent context blowouts and runaway costs), and **M-2** (stale-closure rename bug that silently discards AI board updates). Everything else is polish.
