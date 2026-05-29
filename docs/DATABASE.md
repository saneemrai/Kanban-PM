# Database design

The MVP will use SQLite with normalized tables for users, sessions, boards, columns, and cards. The backend can still expose simple full-board API responses shaped like the current frontend `BoardData`, but the database should store the Kanban structure relationally.

## Database file

Use a local SQLite file created by the backend if it does not exist.

Recommended path:

```text
backend/data/pm.sqlite3
```

When running in Docker, the start scripts mount `backend/data` to `/app/backend/data` so SQLite data persists across container restarts.

## Tables

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'Project Board',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards (id),
  UNIQUE (board_id, key),
  UNIQUE (board_id, position)
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT NOT NULL,
  board_id INTEGER NOT NULL,
  column_key TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (board_id, id),
  FOREIGN KEY (board_id) REFERENCES boards (id),
  FOREIGN KEY (board_id, column_key) REFERENCES columns (board_id, key),
  UNIQUE (board_id, column_key, position)
);

CREATE TABLE IF NOT EXISTS sessions (
  user_id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);
```

## MVP user

The backend should create the hardcoded MVP user during database initialization if missing:

```text
username: user
password: password
```

The password does not need to be stored for the MVP because authentication is hardcoded. The database only needs the `users.username` row so the board can belong to a user and the schema can support multiple users later.

## Sessions

The backend stores one active session token per user:

```sql
PRIMARY KEY (sessions.user_id)
```

Creating a new session replaces the user's previous token. This prevents the same MVP user from keeping two valid browser sessions open at the same time.

## Board ownership

For the MVP, each user has exactly one board:

```sql
UNIQUE (boards.user_id)
```

This keeps the data model ready for multiple users while avoiding multi-board UI or API complexity.

## Columns

For the MVP, each board starts with five fixed columns:

```text
col-backlog
col-discovery
col-progress
col-review
col-done
```

Column titles may be renamed by the user, but API column IDs and column count should remain fixed. The database stores API column IDs in `columns.key` so each user's board can reuse keys like `col-backlog`. Column order is stored in `columns.position`.

Initial column rows:

| key | title | position |
| --- | --- | --- |
| `col-backlog` | `Backlog` | `0` |
| `col-discovery` | `Discovery` | `1` |
| `col-progress` | `In Progress` | `2` |
| `col-review` | `Review` | `3` |
| `col-done` | `Done` | `4` |

## Cards

Cards belong to one board and one column. Card order within a column is stored in `cards.position`. Card IDs only need to be unique within a board.

The initial seed cards should match the current `initialData` in `frontend/src/lib/kanban.ts`.

Example seed row:

| id | column_key | title | details | position |
| --- | --- | --- | --- | --- |
| `card-1` | `col-backlog` | `Align roadmap themes` | `Draft quarterly themes with impact statements and metrics.` | `0` |

## API shape

The backend should return board data to the frontend in the existing shape:

```ts
type Card = {
  id: string;
  title: string;
  details: string;
};

type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};
```

The backend builds this response by:

1. Loading the user's board.
2. Loading columns ordered by `position`.
3. Loading cards ordered by `column_id`, then `position`.
4. Building `columns[].cardIds` from cards in each column.
5. Building `cards` as a record keyed by card ID.

## Initialization

On backend startup or first database access:

1. Create the database file directory if it does not exist.
2. Create all tables if they do not exist.
3. Insert the `user` row if missing.
4. Insert one board for `user` if missing.
5. Insert the five fixed columns for the board if missing.
6. Insert the default seed cards if the board has no cards.

## Updates

The API stays simple:

```text
POST /api/login
POST /api/logout
GET /api/board
PUT /api/board
```

Board routes require the MVP session header returned by `POST /api/login`:

```text
X-PM-Session: <session token>
```

For `PUT /api/board`, the backend can accept the full `BoardData` shape and update normalized rows in a transaction:

1. Validate the incoming board.
2. Update column titles and positions.
3. Upsert cards by ID.
4. Update each card's `column_id` and `position` from `columns[].cardIds`.
5. Delete cards that exist in the database but are missing from the incoming board.
6. Commit only if the whole update succeeds.

This keeps frontend integration simple while preserving a normalized database.

## Validation

Before saving board data, the backend should verify:

- `columns` is a list.
- `cards` is an object keyed by card ID.
- There are exactly five columns.
- Required column IDs are present once each.
- Every column has `id`, `title`, and `cardIds`.
- Every card has `id`, `title`, and `details`.
- Every `cardIds` value references an existing card.
- No card ID appears in more than one column.
- No card exists in `cards` unless it appears in one column's `cardIds`.

## Future path

This design supports multiple users by adding more rows to `users` and one board row per user. It also gives the backend a clean path to partial endpoints later, such as renaming a column, moving a card, or editing a card without replacing the whole board.
