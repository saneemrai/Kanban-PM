import hashlib
import json
import secrets
from datetime import datetime
from pathlib import Path
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "pm.sqlite3"

DEFAULT_USERNAME = "user"
DEFAULT_PASSWORD = "password"

FIXED_COLUMN_IDS = [
    "col-backlog",
    "col-discovery",
    "col-progress",
    "col-review",
    "col-done",
]

SCHEMA_VERSION = 17


VALID_PRIORITIES = {"low", "medium", "high", "critical"}
VALID_COLORS = {"red", "orange", "yellow", "green", "blue", "purple", "pink", "gray"}


class Card(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    details: str
    priority: str | None = None
    due_date: str | None = None
    labels: list[str] = []
    estimate: int | None = None
    assignee: str | None = None
    color: str | None = None


class Column(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    cardIds: list[str]
    wip_limit: int | None = None


class BoardData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[Column]
    cards: dict[str, Card]


class Comment(BaseModel):
    id: int
    author: str
    body: str
    created_at: str


class BoardSummary(BaseModel):
    id: int
    title: str
    description: str
    cardCount: int
    overdueCount: int
    updatedAt: str


class LoginPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str


class RegisterPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str


VALID_TEMPLATES = {"default", "sprint", "kanban", "feature"}

TEMPLATE_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "default": [
        ("col-backlog", "Backlog"),
        ("col-discovery", "Discovery"),
        ("col-progress", "In Progress"),
        ("col-review", "Review"),
        ("col-done", "Done"),
    ],
    "sprint": [
        ("col-backlog", "Backlog"),
        ("col-discovery", "Selected"),
        ("col-progress", "In Progress"),
        ("col-review", "Testing"),
        ("col-done", "Done"),
    ],
    "kanban": [
        ("col-backlog", "Backlog"),
        ("col-discovery", "Ready"),
        ("col-progress", "In Progress"),
        ("col-review", "Review"),
        ("col-done", "Done"),
    ],
    "feature": [
        ("col-backlog", "Ideas"),
        ("col-discovery", "Design"),
        ("col-progress", "Build"),
        ("col-review", "Test"),
        ("col-done", "Released"),
    ],
}


# Keep in sync with frontend/src/lib/kanban.ts initialData
DEFAULT_COLUMNS = [
    Column(id="col-backlog", title="Backlog", cardIds=["card-1", "card-2"]),
    Column(id="col-discovery", title="Discovery", cardIds=["card-3"]),
    Column(id="col-progress", title="In Progress", cardIds=["card-4", "card-5"]),
    Column(id="col-review", title="Review", cardIds=["card-6"]),
    Column(id="col-done", title="Done", cardIds=["card-7", "card-8"]),
]

DEFAULT_CARDS = {
    "card-1": Card(
        id="card-1",
        title="Align roadmap themes",
        details="Draft quarterly themes with impact statements and metrics.",
    ),
    "card-2": Card(
        id="card-2",
        title="Gather customer signals",
        details="Review support tags, sales notes, and churn feedback.",
    ),
    "card-3": Card(
        id="card-3",
        title="Prototype analytics view",
        details="Sketch initial dashboard layout and key drill-downs.",
    ),
    "card-4": Card(
        id="card-4",
        title="Refine status language",
        details="Standardize column labels and tone across the board.",
    ),
    "card-5": Card(
        id="card-5",
        title="Design card layout",
        details="Add hierarchy and spacing for scanning dense lists.",
    ),
    "card-6": Card(
        id="card-6",
        title="QA micro-interactions",
        details="Verify hover, focus, and loading states.",
    ),
    "card-7": Card(
        id="card-7",
        title="Ship marketing page",
        details="Final copy approved and asset pack delivered.",
    ),
    "card-8": Card(
        id="card-8",
        title="Close onboarding sprint",
        details="Document release notes and share internally.",
    ),
}

DEFAULT_BOARD = BoardData(columns=DEFAULT_COLUMNS, cards=DEFAULT_CARDS)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"pbkdf2:sha256:260000:{salt}:{key.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    parts = password_hash.split(":")
    if len(parts) != 5 or parts[0] != "pbkdf2" or parts[1] != "sha256":
        return False
    _, _, iterations_str, salt, stored_key = parts
    key = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), int(iterations_str)
    )
    return secrets.compare_digest(key.hex(), stored_key)


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(db_path: Path) -> None:
    with connect(db_path) as connection:
        _run_migrations(connection)
        _ensure_default_user(connection)


def _run_migrations(connection: sqlite3.Connection) -> None:
    connection.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)"
    )
    row = connection.execute("SELECT version FROM schema_version").fetchone()
    if row is None:
        tables = {
            r["name"]
            for r in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        version = 1 if "users" in tables else 0
        connection.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))
    else:
        version = row["version"]

    if version < 2:
        _migrate_to_v2(connection)
        connection.execute("UPDATE schema_version SET version = 2")

    if version < 3:
        _migrate_to_v3(connection)
        connection.execute("UPDATE schema_version SET version = 3")

    if version < 4:
        _migrate_to_v4(connection)
        connection.execute("UPDATE schema_version SET version = 4")

    if version < 5:
        _migrate_to_v5(connection)
        connection.execute("UPDATE schema_version SET version = 5")

    if version < 6:
        _migrate_to_v6(connection)
        connection.execute("UPDATE schema_version SET version = 6")

    if version < 7:
        _migrate_to_v7(connection)
        connection.execute("UPDATE schema_version SET version = 7")

    if version < 8:
        _migrate_to_v8(connection)
        connection.execute("UPDATE schema_version SET version = 8")

    if version < 9:
        _migrate_to_v9(connection)
        connection.execute("UPDATE schema_version SET version = 9")

    if version < 10:
        _migrate_to_v10(connection)
        connection.execute("UPDATE schema_version SET version = 10")

    if version < 11:
        _migrate_to_v11(connection)
        connection.execute("UPDATE schema_version SET version = 11")

    if version < 12:
        _migrate_to_v12(connection)
        connection.execute("UPDATE schema_version SET version = 12")

    if version < 13:
        _migrate_to_v13(connection)
        connection.execute("UPDATE schema_version SET version = 13")

    if version < 14:
        _migrate_to_v14(connection)
        connection.execute("UPDATE schema_version SET version = 14")

    if version < 15:
        _migrate_to_v15(connection)
        connection.execute("UPDATE schema_version SET version = 15")

    if version < 16:
        _migrate_to_v16(connection)
        connection.execute("UPDATE schema_version SET version = 16")

    if version < 17:
        _migrate_to_v17(connection)
        connection.execute("UPDATE schema_version SET version = 17")


def _migrate_to_v2(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    user_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(users)").fetchall()
    }
    if "password_hash" not in user_cols:
        connection.execute(
            "ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''"
        )

    boards_row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='boards'"
    ).fetchone()

    if boards_row is None:
        connection.execute(
            """
            CREATE TABLE boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL DEFAULT 'Project Board',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )
    elif _boards_has_unique_user_id(boards_row["sql"] or ""):
        # executescript issues COMMIT first, ensuring FK can be toggled
        connection.executescript(
            """
            PRAGMA foreign_keys = OFF;

            CREATE TABLE boards_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL DEFAULT 'Project Board',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );

            INSERT INTO boards_v2 SELECT * FROM boards;
            DROP TABLE boards;
            ALTER TABLE boards_v2 RENAME TO boards;

            PRAGMA foreign_keys = ON;
            """
        )

    connection.execute(
        """
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
        )
        """
    )

    connection.execute(
        """
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
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            user_id INTEGER PRIMARY KEY,
            token TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )


def _migrate_to_v3(connection: sqlite3.Connection) -> None:
    card_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(cards)").fetchall()
    }
    if "priority" not in card_cols:
        connection.execute("ALTER TABLE cards ADD COLUMN priority TEXT")


def _migrate_to_v4(connection: sqlite3.Connection) -> None:
    card_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(cards)").fetchall()
    }
    if "due_date" not in card_cols:
        connection.execute("ALTER TABLE cards ADD COLUMN due_date TEXT")


def _migrate_to_v17(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS board_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT 'blue',
            FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE,
            UNIQUE (board_id, name)
        )
        """
    )


def _migrate_to_v16(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS card_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            from_card_id TEXT NOT NULL,
            to_card_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards (id),
            UNIQUE (board_id, from_card_id, to_card_id)
        )
        """
    )


def _migrate_to_v15(connection: sqlite3.Connection) -> None:
    """Replace single-session-per-user sessions table with multi-session."""
    sessions_row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).fetchone()
    if sessions_row is None:
        connection.execute(
            """
            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )
        return
    sql = sessions_row["sql"] or ""
    if "user_id INTEGER PRIMARY KEY" in sql:
        connection.executescript(
            """
            PRAGMA foreign_keys = OFF;

            CREATE TABLE sessions_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );

            INSERT INTO sessions_v2 (user_id, token, created_at)
            SELECT user_id, token, created_at FROM sessions;

            DROP TABLE sessions;
            ALTER TABLE sessions_v2 RENAME TO sessions;

            PRAGMA foreign_keys = ON;
            """
        )


def _migrate_to_v14(connection: sqlite3.Connection) -> None:
    board_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(boards)").fetchall()
    }
    if "description" not in board_cols:
        connection.execute(
            "ALTER TABLE boards ADD COLUMN description TEXT NOT NULL DEFAULT ''"
        )


def _migrate_to_v13(connection: sqlite3.Connection) -> None:
    card_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(cards)").fetchall()
    }
    if "color" not in card_cols:
        connection.execute("ALTER TABLE cards ADD COLUMN color TEXT")


def _migrate_to_v12(connection: sqlite3.Connection) -> None:
    card_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(cards)").fetchall()
    }
    if "assignee" not in card_cols:
        connection.execute("ALTER TABLE cards ADD COLUMN assignee TEXT")


def _migrate_to_v11(connection: sqlite3.Connection) -> None:
    card_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(cards)").fetchall()
    }
    if "estimate" not in card_cols:
        connection.execute("ALTER TABLE cards ADD COLUMN estimate INTEGER")


def _migrate_to_v10(connection: sqlite3.Connection) -> None:
    col_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(columns)").fetchall()
    }
    if "wip_limit" not in col_cols:
        connection.execute("ALTER TABLE columns ADD COLUMN wip_limit INTEGER")


def _migrate_to_v9(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS checklist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            card_id TEXT NOT NULL,
            text TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards (id)
        )
        """
    )


def _migrate_to_v8(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            card_id TEXT,
            card_title TEXT,
            meta TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )


def _migrate_to_v7(connection: sqlite3.Connection) -> None:
    card_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(cards)").fetchall()
    }
    if "archived" not in card_cols:
        connection.execute(
            "ALTER TABLE cards ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"
        )


def _migrate_to_v6(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            card_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )


def _migrate_to_v5(connection: sqlite3.Connection) -> None:
    card_cols = {
        r["name"]
        for r in connection.execute("PRAGMA table_info(cards)").fetchall()
    }
    if "labels" not in card_cols:
        connection.execute(
            "ALTER TABLE cards ADD COLUMN labels TEXT NOT NULL DEFAULT '[]'"
        )


def _boards_has_unique_user_id(sql: str) -> bool:
    sql_upper = sql.upper()
    return "UNIQUE" in sql_upper and "USER_ID" in sql_upper


def _ensure_default_user(connection: sqlite3.Connection) -> None:
    connection.execute(
        "INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)",
        (DEFAULT_USERNAME, hash_password(DEFAULT_PASSWORD)),
    )

    row = connection.execute(
        "SELECT id, password_hash FROM users WHERE username = ?",
        (DEFAULT_USERNAME,),
    ).fetchone()

    if row and not row["password_hash"]:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (hash_password(DEFAULT_PASSWORD), DEFAULT_USERNAME),
        )
        row = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?",
            (DEFAULT_USERNAME,),
        ).fetchone()

    user_id = row["id"]

    board_count = connection.execute(
        "SELECT COUNT(*) AS count FROM boards WHERE user_id = ?",
        (user_id,),
    ).fetchone()["count"]

    if board_count == 0:
        _create_board_with_seed_data(connection, user_id, "My Board")
    else:
        board_id = connection.execute(
            "SELECT id FROM boards WHERE user_id = ? ORDER BY id ASC LIMIT 1",
            (user_id,),
        ).fetchone()["id"]

        col_count = connection.execute(
            "SELECT COUNT(*) AS count FROM columns WHERE board_id = ?",
            (board_id,),
        ).fetchone()["count"]
        if col_count == 0:
            for position, column in enumerate(DEFAULT_BOARD.columns):
                connection.execute(
                    "INSERT INTO columns (board_id, key, title, position) VALUES (?, ?, ?, ?)",
                    (board_id, column.id, column.title, position),
                )

        card_count = connection.execute(
            "SELECT COUNT(*) AS count FROM cards WHERE board_id = ?",
            (board_id,),
        ).fetchone()["count"]
        if card_count == 0:
            insert_board_cards(connection, board_id, DEFAULT_BOARD)


def _create_board_with_seed_data(
    connection: sqlite3.Connection, user_id: int, title: str, template: str = "default", description: str = ""
) -> int:
    connection.execute(
        "INSERT INTO boards (user_id, title, description) VALUES (?, ?, ?)",
        (user_id, title, description),
    )
    board_id = connection.execute(
        "SELECT id FROM boards WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        (user_id,),
    ).fetchone()["id"]
    col_defs = TEMPLATE_COLUMNS.get(template, TEMPLATE_COLUMNS["default"])
    for position, column in enumerate(DEFAULT_BOARD.columns):
        col_title = col_defs[position][1] if position < len(col_defs) else column.title
        connection.execute(
            "INSERT INTO columns (board_id, key, title, position) VALUES (?, ?, ?, ?)",
            (board_id, column.id, col_title, position),
        )
    if template == "default":
        insert_board_cards(connection, board_id, DEFAULT_BOARD)
    return board_id


def register_user(db_path: Path, username: str, password: str) -> None:
    username = username.strip()
    if not username or not password:
        raise HTTPException(
            status_code=422, detail="Username and password are required."
        )
    if len(username) < 3 or len(username) > 50:
        raise HTTPException(
            status_code=422, detail="Username must be 3-50 characters."
        )
    if len(password) < 6:
        raise HTTPException(
            status_code=422, detail="Password must be at least 6 characters."
        )

    password_hash = hash_password(password)
    with connect(db_path) as connection:
        try:
            connection.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, password_hash),
            )
        except sqlite3.IntegrityError as error:
            raise HTTPException(
                status_code=409, detail="Username already taken."
            ) from error
        user_id = connection.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,),
        ).fetchone()["id"]
        _create_board_with_seed_data(connection, user_id, "My Board")


def create_session(db_path: Path, username: str, password: str) -> str:
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if row is None or not verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials.")
        user_id = row["id"]
        token = uuid4().hex
        connection.execute(
            "INSERT INTO sessions (user_id, token) VALUES (?, ?)",
            (user_id, token),
        )
    return token


def list_sessions(db_path: Path, username: str, current_token: str) -> list[dict]:
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT s.id, s.created_at, s.token = ? AS is_current
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE u.username = ?
            ORDER BY s.created_at DESC
            """,
            (current_token, username),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "createdAt": row["created_at"],
            "isCurrent": bool(row["is_current"]),
        }
        for row in rows
    ]


def revoke_session(db_path: Path, username: str, session_id: int) -> None:
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT s.id FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND u.username = ?
            """,
            (session_id, username),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        connection.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


def change_user_password(
    db_path: Path, username: str, current_password: str, new_password: str
) -> None:
    if len(new_password) < 6:
        raise HTTPException(
            status_code=422, detail="New password must be at least 6 characters."
        )
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row is None or not verify_password(current_password, row["password_hash"]):
            raise HTTPException(
                status_code=401, detail="Current password is incorrect."
            )
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (hash_password(new_password), username),
        )


def delete_session(db_path: Path, token: str) -> None:
    with connect(db_path) as connection:
        connection.execute("DELETE FROM sessions WHERE token = ?", (token,))


def get_username_for_session(db_path: Path, token: str | None) -> str:
    if token is None:
        raise HTTPException(status_code=401, detail="Missing user session.")

    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT users.username
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=401, detail="Invalid or expired user session.")
    return row["username"]


def list_boards(db_path: Path, username: str) -> list[BoardSummary]:
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT b.id, b.title, b.description, b.updated_at,
                   COUNT(c.id) AS card_count,
                   SUM(CASE WHEN c.due_date IS NOT NULL AND c.due_date < date('now')
                            AND c.archived = 0 THEN 1 ELSE 0 END) AS overdue_count
            FROM boards b
            JOIN users u ON u.id = b.user_id
            LEFT JOIN cards c ON c.board_id = b.id
            WHERE u.username = ?
            GROUP BY b.id
            ORDER BY b.id ASC
            """,
            (username,),
        ).fetchall()
    return [
        BoardSummary(
            id=row["id"],
            title=row["title"],
            description=row["description"] or "",
            cardCount=row["card_count"],
            overdueCount=row["overdue_count"] or 0,
            updatedAt=row["updated_at"],
        )
        for row in rows
    ]


def create_board(db_path: Path, username: str, title: str, template: str = "default", description: str = "") -> BoardSummary:
    title = title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Board title is required.")
    if template not in VALID_TEMPLATES:
        raise HTTPException(status_code=422, detail=f"Invalid template '{template}'.")
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found.")
        user_id = row["id"]
        board_id = _create_board_with_seed_data(connection, user_id, title, template, description)
        row = connection.execute(
            """
            SELECT b.id, b.title, b.description, b.updated_at, COUNT(c.id) AS card_count
            FROM boards b
            LEFT JOIN cards c ON c.board_id = b.id
            WHERE b.id = ?
            GROUP BY b.id
            """,
            (board_id,),
        ).fetchone()
    return BoardSummary(
        id=row["id"],
        title=row["title"],
        description=row["description"] or "",
        cardCount=row["card_count"],
        overdueCount=0,
        updatedAt=row["updated_at"],
    )


def clone_board(db_path: Path, username: str, source_board_id: int, new_title: str) -> BoardSummary:
    new_title = new_title.strip()
    if not new_title:
        raise HTTPException(status_code=422, detail="Board title is required.")
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, source_board_id)

        src = connection.execute(
            "SELECT user_id, description FROM boards WHERE id = ?", (source_board_id,)
        ).fetchone()
        user_id = src["user_id"]
        description = src["description"] or ""

        cursor = connection.execute(
            "INSERT INTO boards (user_id, title, description) VALUES (?, ?, ?)",
            (user_id, new_title, description),
        )
        new_board_id = cursor.lastrowid

        columns = connection.execute(
            "SELECT key, title, position, wip_limit FROM columns WHERE board_id = ? ORDER BY position",
            (source_board_id,),
        ).fetchall()
        for col in columns:
            connection.execute(
                "INSERT INTO columns (board_id, key, title, position, wip_limit) VALUES (?, ?, ?, ?, ?)",
                (new_board_id, col["key"], col["title"], col["position"], col["wip_limit"]),
            )

        cards = connection.execute(
            "SELECT id, column_key, title, details, priority, due_date, labels, estimate, assignee, color, position FROM cards WHERE board_id = ? AND archived = 0",
            (source_board_id,),
        ).fetchall()
        id_map: dict[str, str] = {}
        for card in cards:
            new_id = f"card-{uuid4().hex[:8]}"
            id_map[card["id"]] = new_id
            connection.execute(
                "INSERT INTO cards (id, board_id, column_key, title, details, priority, due_date, labels, estimate, assignee, color, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (new_id, new_board_id, card["column_key"], card["title"], card["details"], card["priority"], card["due_date"], card["labels"], card["estimate"], card["assignee"], card["color"], card["position"]),
            )

        labels = connection.execute(
            "SELECT name, color FROM board_labels WHERE board_id = ?", (source_board_id,)
        ).fetchall()
        for lbl in labels:
            connection.execute(
                "INSERT INTO board_labels (board_id, name, color) VALUES (?, ?, ?)",
                (new_board_id, lbl["name"], lbl["color"]),
            )

        card_count = len(cards)
    return BoardSummary(
        id=new_board_id,
        title=new_title,
        description=description,
        cardCount=card_count,
        overdueCount=0,
        updatedAt=datetime.now().isoformat(),
    )


def rename_board(db_path: Path, username: str, board_id: int, title: str, description: str | None = None) -> None:
    title = title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Board title is required.")
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        old_title = connection.execute(
            "SELECT title FROM boards WHERE id = ?", (board_id,)
        ).fetchone()["title"]
        if description is None:
            connection.execute(
                "UPDATE boards SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (title, board_id),
            )
        else:
            connection.execute(
                "UPDATE boards SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (title, description, board_id),
            )
        _log_activity(
            connection, board_id, username, "board_renamed",
            meta={"from": old_title, "to": title}
        )


def delete_board(db_path: Path, username: str, board_id: int) -> None:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        board_count = connection.execute(
            """
            SELECT COUNT(*) AS count FROM boards
            WHERE user_id = (SELECT user_id FROM boards WHERE id = ?)
            """,
            (board_id,),
        ).fetchone()["count"]
        if board_count <= 1:
            raise HTTPException(
                status_code=422, detail="Cannot delete the last board."
            )
        connection.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        connection.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))
        connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def get_board_by_id(db_path: Path, username: str, board_id: int) -> BoardData:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
    return _load_board_data(db_path, board_id)


def save_board_by_id(
    db_path: Path, username: str, board_id: int, payload: dict[str, Any]
) -> BoardData:
    board = parse_and_validate_board(payload)
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        existing_rows = connection.execute(
            "SELECT id, column_key FROM cards WHERE board_id = ? AND archived = 0",
            (board_id,),
        ).fetchall()
        existing_column: dict[str, str] = {row["id"]: row["column_key"] for row in existing_rows}
        existing_ids = set(existing_column.keys())
        new_ids = set(board.cards.keys())
        created_ids = new_ids - existing_ids
        deleted_ids = existing_ids - new_ids
        moved_cards: list[tuple[str, str, str, str]] = []
        for column in board.columns:
            for card_id in column.cardIds:
                if card_id in existing_column and existing_column[card_id] != column.id:
                    moved_cards.append((card_id, board.cards[card_id].title, existing_column[card_id], column.id))
        for position, column in enumerate(board.columns):
            connection.execute(
                """
                UPDATE columns
                SET title = ?, position = ?, wip_limit = ?, updated_at = CURRENT_TIMESTAMP
                WHERE board_id = ? AND key = ?
                """,
                (column.title, position, column.wip_limit, board_id, column.id),
            )
        connection.execute(
            "DELETE FROM cards WHERE board_id = ? AND archived = 0", (board_id,)
        )
        insert_board_cards(connection, board_id, board)
        connection.execute(
            "UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (board_id,),
        )
        for card_id in created_ids:
            card = board.cards[card_id]
            _log_activity(
                connection, board_id, username, "card_created",
                card_id=card_id, card_title=card.title
            )
        for card_id in deleted_ids:
            _log_activity(
                connection, board_id, username, "card_deleted", card_id=card_id
            )
        for card_id, card_title, from_col, to_col in moved_cards:
            _log_activity(
                connection, board_id, username, "card_moved",
                card_id=card_id, card_title=card_title,
                meta={"from": from_col, "to": to_col}
            )
    return _load_board_data(db_path, board_id)


def get_board(db_path: Path, username: str) -> BoardData:
    with connect(db_path) as connection:
        board_id = _get_first_board_id(connection, username)
    return _load_board_data(db_path, board_id)


def save_board(db_path: Path, username: str, payload: dict[str, Any]) -> BoardData:
    with connect(db_path) as connection:
        board_id = _get_first_board_id(connection, username)
    return save_board_by_id(db_path, username, board_id, payload)


def _load_board_data(db_path: Path, board_id: int) -> BoardData:
    with connect(db_path) as connection:
        columns = connection.execute(
            "SELECT key, title, wip_limit FROM columns WHERE board_id = ? ORDER BY position",
            (board_id,),
        ).fetchall()
        cards = connection.execute(
            """
            SELECT id, column_key, title, details, priority, due_date, labels, estimate, assignee, color
            FROM cards
            WHERE board_id = ? AND archived = 0
            ORDER BY column_key, position
            """,
            (board_id,),
        ).fetchall()

    cards_by_column: dict[str, list[str]] = {col["key"]: [] for col in columns}
    cards_by_id: dict[str, Card] = {}
    for card in cards:
        cards_by_column[card["column_key"]].append(card["id"])
        cards_by_id[card["id"]] = Card(
            id=card["id"],
            title=card["title"],
            details=card["details"],
            priority=card["priority"],
            due_date=card["due_date"],
            labels=json.loads(card["labels"] or "[]"),
            estimate=card["estimate"],
            assignee=card["assignee"],
            color=card["color"],
        )

    return BoardData(
        columns=[
            Column(
                id=col["key"],
                title=col["title"],
                cardIds=cards_by_column[col["key"]],
                wip_limit=col["wip_limit"],
            )
            for col in columns
        ],
        cards=cards_by_id,
    )


def _get_first_board_id(connection: sqlite3.Connection, username: str) -> int:
    row = connection.execute(
        """
        SELECT boards.id
        FROM boards
        JOIN users ON users.id = boards.user_id
        WHERE users.username = ?
        ORDER BY boards.id ASC
        LIMIT 1
        """,
        (username,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Board not found.")
    return row["id"]


def _verify_board_ownership(
    connection: sqlite3.Connection, username: str, board_id: int
) -> None:
    row = connection.execute(
        """
        SELECT boards.id FROM boards
        JOIN users ON users.id = boards.user_id
        WHERE boards.id = ? AND users.username = ?
        """,
        (board_id, username),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Board not found.")


def get_board_id(connection: sqlite3.Connection, username: str) -> int:
    return _get_first_board_id(connection, username)


def insert_board_cards(
    connection: sqlite3.Connection,
    board_id: int,
    board: BoardData,
) -> None:
    for column in board.columns:
        for position, card_id in enumerate(column.cardIds):
            card = board.cards[card_id]
            connection.execute(
                """
                INSERT INTO cards (id, board_id, column_key, title, details, position, priority, due_date, labels, estimate, assignee, color)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (card.id, board_id, column.id, card.title, card.details, position, card.priority, card.due_date, json.dumps(card.labels), card.estimate, card.assignee, card.color),
            )


def parse_and_validate_board(payload: dict[str, Any]) -> BoardData:
    try:
        board = BoardData.model_validate(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    column_ids = [column.id for column in board.columns]
    if column_ids != FIXED_COLUMN_IDS:
        raise HTTPException(
            status_code=422,
            detail="Board must contain the five fixed columns in order.",
        )

    seen_card_ids: set[str] = set()
    for column in board.columns:
        if not column.title.strip():
            raise HTTPException(status_code=422, detail="Column title is required.")
        if column.wip_limit is not None and column.wip_limit < 1:
            raise HTTPException(
                status_code=422, detail="WIP limit must be a positive integer."
            )
        for card_id in column.cardIds:
            if card_id in seen_card_ids:
                raise HTTPException(
                    status_code=422,
                    detail="Card IDs cannot appear in more than one column.",
                )
            if card_id not in board.cards:
                raise HTTPException(
                    status_code=422,
                    detail="Column references a card that does not exist.",
                )
            seen_card_ids.add(card_id)

    if set(board.cards.keys()) != seen_card_ids:
        raise HTTPException(
            status_code=422,
            detail="Every card must appear in exactly one column.",
        )

    for card_id, card in board.cards.items():
        if card.id != card_id:
            raise HTTPException(
                status_code=422,
                detail="Card record keys must match card IDs.",
            )
        if not card.title.strip():
            raise HTTPException(status_code=422, detail="Card title is required.")
        if card.color is not None and card.color not in VALID_COLORS:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid color '{card.color}'. Must be one of: {', '.join(sorted(VALID_COLORS))}.",
            )
        if card.assignee is not None and (not card.assignee.strip() or len(card.assignee) > 100):
            raise HTTPException(
                status_code=422, detail="Assignee must be 1-100 characters."
            )
        if card.estimate is not None and card.estimate < 1:
            raise HTTPException(
                status_code=422, detail="Card estimate must be a positive integer."
            )
        if card.priority is not None and card.priority not in VALID_PRIORITIES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid priority '{card.priority}'. Must be one of: {', '.join(sorted(VALID_PRIORITIES))}.",
            )
        if card.due_date is not None:
            try:
                datetime.strptime(card.due_date, "%Y-%m-%d")
            except ValueError as error:
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid due_date '{card.due_date}'. Must be YYYY-MM-DD.",
                ) from error
        if len(card.labels) > 10:
            raise HTTPException(
                status_code=422, detail="A card may have at most 10 labels."
            )
        for label in card.labels:
            if not isinstance(label, str) or not label.strip():
                raise HTTPException(
                    status_code=422, detail="Labels must be non-empty strings."
                )
            if len(label) > 30:
                raise HTTPException(
                    status_code=422,
                    detail="Each label must be 30 characters or fewer.",
                )

    return board


def list_checklist_items(
    db_path: Path, username: str, board_id: int, card_id: str
) -> list[dict]:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        rows = connection.execute(
            "SELECT id, text, done FROM checklist_items WHERE board_id = ? AND card_id = ? ORDER BY position, id",
            (board_id, card_id),
        ).fetchall()
    return [{"id": row["id"], "text": row["text"], "done": bool(row["done"])} for row in rows]


def add_checklist_item(
    db_path: Path, username: str, board_id: int, card_id: str, text: str
) -> dict:
    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Item text is required.")
    if len(text) > 200:
        raise HTTPException(status_code=422, detail="Item text must be 200 characters or fewer.")
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        card_exists = connection.execute(
            "SELECT 1 FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id)
        ).fetchone()
        if card_exists is None:
            raise HTTPException(status_code=404, detail="Card not found.")
        max_pos = connection.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM checklist_items WHERE board_id = ? AND card_id = ?",
            (board_id, card_id),
        ).fetchone()["pos"]
        connection.execute(
            "INSERT INTO checklist_items (board_id, card_id, text, position) VALUES (?, ?, ?, ?)",
            (board_id, card_id, text, max_pos),
        )
        row = connection.execute(
            "SELECT id, text, done FROM checklist_items WHERE id = last_insert_rowid()"
        ).fetchone()
    return {"id": row["id"], "text": row["text"], "done": bool(row["done"])}


def update_checklist_item(
    db_path: Path, username: str, board_id: int, item_id: int, done: bool
) -> dict:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        row = connection.execute(
            "SELECT id, text, done FROM checklist_items WHERE id = ? AND board_id = ?",
            (item_id, board_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Checklist item not found.")
        connection.execute(
            "UPDATE checklist_items SET done = ? WHERE id = ?",
            (1 if done else 0, item_id),
        )
    return {"id": row["id"], "text": row["text"], "done": done}


def delete_checklist_item(
    db_path: Path, username: str, board_id: int, item_id: int
) -> None:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        row = connection.execute(
            "SELECT id FROM checklist_items WHERE id = ? AND board_id = ?",
            (item_id, board_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Checklist item not found.")
        connection.execute("DELETE FROM checklist_items WHERE id = ?", (item_id,))


def list_card_comments(
    db_path: Path, username: str, board_id: int, card_id: str
) -> list[Comment]:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        rows = connection.execute(
            """
            SELECT c.id, u.username AS author, c.body, c.created_at
            FROM comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.board_id = ? AND c.card_id = ?
            ORDER BY c.created_at ASC
            """,
            (board_id, card_id),
        ).fetchall()
    return [
        Comment(
            id=row["id"],
            author=row["author"],
            body=row["body"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


def add_card_comment(
    db_path: Path, username: str, board_id: int, card_id: str, body: str
) -> Comment:
    body = body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="Comment body is required.")
    if len(body) > 2000:
        raise HTTPException(
            status_code=422, detail="Comment must be 2000 characters or fewer."
        )
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        card_exists = connection.execute(
            "SELECT 1 FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id)
        ).fetchone()
        if card_exists is None:
            raise HTTPException(status_code=404, detail="Card not found.")
        user_id = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()["id"]
        connection.execute(
            "INSERT INTO comments (board_id, card_id, user_id, body) VALUES (?, ?, ?, ?)",
            (board_id, card_id, user_id, body),
        )
        row = connection.execute(
            """
            SELECT c.id, u.username AS author, c.body, c.created_at
            FROM comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.id = last_insert_rowid()
            """
        ).fetchone()
    return Comment(
        id=row["id"],
        author=row["author"],
        body=row["body"],
        created_at=row["created_at"],
    )


def _log_activity(
    connection: sqlite3.Connection,
    board_id: int,
    username: str,
    action: str,
    card_id: str | None = None,
    card_title: str | None = None,
    meta: dict | None = None,
) -> None:
    row = connection.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        return
    connection.execute(
        "INSERT INTO activity (board_id, user_id, action, card_id, card_title, meta) VALUES (?, ?, ?, ?, ?, ?)",
        (board_id, row["id"], action, card_id, card_title, json.dumps(meta or {})),
    )


def list_activity(
    db_path: Path, username: str, board_id: int, limit: int = 50
) -> list[dict]:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        rows = connection.execute(
            """
            SELECT a.id, u.username AS actor, a.action, a.card_id, a.card_title,
                   a.meta, a.created_at
            FROM activity a
            JOIN users u ON u.id = a.user_id
            WHERE a.board_id = ?
            ORDER BY a.created_at DESC
            LIMIT ?
            """,
            (board_id, limit),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "actor": row["actor"],
            "action": row["action"],
            "cardId": row["card_id"],
            "cardTitle": row["card_title"],
            "meta": json.loads(row["meta"] or "{}"),
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def list_archived_cards(db_path: Path, username: str, board_id: int) -> list[dict]:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        rows = connection.execute(
            """
            SELECT id, title, details, priority, due_date, labels
            FROM cards
            WHERE board_id = ? AND archived = 1
            ORDER BY updated_at DESC
            """,
            (board_id,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "details": row["details"],
            "priority": row["priority"],
            "due_date": row["due_date"],
            "labels": json.loads(row["labels"] or "[]"),
        }
        for row in rows
    ]


def archive_card(db_path: Path, username: str, board_id: int, card_id: str) -> BoardData:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        row = connection.execute(
            "SELECT id, archived FROM cards WHERE board_id = ? AND id = ?",
            (board_id, card_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Card not found.")
        if row["archived"]:
            raise HTTPException(status_code=422, detail="Card is already archived.")
        min_pos = connection.execute(
            "SELECT COALESCE(MIN(position), 0) - 1 AS min_pos FROM cards WHERE board_id = ? AND archived = 1",
            (board_id,),
        ).fetchone()["min_pos"]
        card_title = connection.execute(
            "SELECT title FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id)
        ).fetchone()["title"]
        connection.execute(
            "UPDATE cards SET archived = 1, position = ? WHERE board_id = ? AND id = ?",
            (min_pos, board_id, card_id),
        )
        connection.execute(
            "UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (board_id,),
        )
        _log_activity(
            connection, board_id, username, "card_archived",
            card_id=card_id, card_title=card_title
        )
    return _load_board_data(db_path, board_id)


def restore_card(db_path: Path, username: str, board_id: int, card_id: str) -> BoardData:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        row = connection.execute(
            "SELECT id, archived FROM cards WHERE board_id = ? AND id = ?",
            (board_id, card_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Card not found.")
        if not row["archived"]:
            raise HTTPException(status_code=422, detail="Card is not archived.")
        max_pos = connection.execute(
            "SELECT COALESCE(MAX(position), -1) AS max_pos FROM cards WHERE board_id = ? AND column_key = ? AND archived = 0",
            (board_id, "col-backlog"),
        ).fetchone()["max_pos"]
        card_title = connection.execute(
            "SELECT title FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id)
        ).fetchone()["title"]
        connection.execute(
            "UPDATE cards SET archived = 0, column_key = 'col-backlog', position = ? WHERE board_id = ? AND id = ?",
            (max_pos + 1, board_id, card_id),
        )
        connection.execute(
            "UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (board_id,),
        )
        _log_activity(
            connection, board_id, username, "card_restored",
            card_id=card_id, card_title=card_title
        )
    return _load_board_data(db_path, board_id)


def delete_card_comment(
    db_path: Path, username: str, board_id: int, comment_id: int
) -> None:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        row = connection.execute(
            """
            SELECT c.id, u.username AS author
            FROM comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.id = ? AND c.board_id = ?
            """,
            (comment_id, board_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Comment not found.")
        if row["author"] != username:
            raise HTTPException(
                status_code=403, detail="You can only delete your own comments."
            )
        connection.execute("DELETE FROM comments WHERE id = ?", (comment_id,))


def list_card_links(
    db_path: Path, username: str, board_id: int, card_id: str
) -> dict:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        blocking_rows = connection.execute(
            """
            SELECT cl.to_card_id AS id, c.title
            FROM card_links cl
            JOIN cards c ON c.board_id = cl.board_id AND c.id = cl.to_card_id
            WHERE cl.board_id = ? AND cl.from_card_id = ? AND c.archived = 0
            """,
            (board_id, card_id),
        ).fetchall()
        blocked_by_rows = connection.execute(
            """
            SELECT cl.from_card_id AS id, c.title
            FROM card_links cl
            JOIN cards c ON c.board_id = cl.board_id AND c.id = cl.from_card_id
            WHERE cl.board_id = ? AND cl.to_card_id = ? AND c.archived = 0
            """,
            (board_id, card_id),
        ).fetchall()
    return {
        "blocking": [{"id": r["id"], "title": r["title"]} for r in blocking_rows],
        "blockedBy": [{"id": r["id"], "title": r["title"]} for r in blocked_by_rows],
    }


def add_card_link(
    db_path: Path, username: str, board_id: int, from_card_id: str, to_card_id: str
) -> dict:
    if from_card_id == to_card_id:
        raise HTTPException(status_code=422, detail="A card cannot link to itself.")
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        for cid in (from_card_id, to_card_id):
            row = connection.execute(
                "SELECT id FROM cards WHERE board_id = ? AND id = ? AND archived = 0",
                (board_id, cid),
            ).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"Card '{cid}' not found.")
        try:
            connection.execute(
                "INSERT INTO card_links (board_id, from_card_id, to_card_id) VALUES (?, ?, ?)",
                (board_id, from_card_id, to_card_id),
            )
        except sqlite3.IntegrityError as error:
            raise HTTPException(status_code=409, detail="Link already exists.") from error
    return list_card_links(db_path, username, board_id, from_card_id)


def delete_card_link(
    db_path: Path, username: str, board_id: int, from_card_id: str, to_card_id: str
) -> dict:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        row = connection.execute(
            "SELECT id FROM card_links WHERE board_id = ? AND from_card_id = ? AND to_card_id = ?",
            (board_id, from_card_id, to_card_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Link not found.")
        connection.execute(
            "DELETE FROM card_links WHERE board_id = ? AND from_card_id = ? AND to_card_id = ?",
            (board_id, from_card_id, to_card_id),
        )
    return list_card_links(db_path, username, board_id, from_card_id)


_VALID_LABEL_COLORS = {"red", "orange", "yellow", "green", "blue", "purple", "pink", "gray"}


def list_board_labels(db_path: Path, username: str, board_id: int) -> list[dict]:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        rows = connection.execute(
            "SELECT id, name, color FROM board_labels WHERE board_id = ? ORDER BY name",
            (board_id,),
        ).fetchall()
    return [{"id": row["id"], "name": row["name"], "color": row["color"]} for row in rows]


def add_board_label(db_path: Path, username: str, board_id: int, name: str, color: str) -> dict:
    name = name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Label name is required.")
    if color not in _VALID_LABEL_COLORS:
        raise HTTPException(status_code=422, detail=f"Invalid color '{color}'.")
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        try:
            cursor = connection.execute(
                "INSERT INTO board_labels (board_id, name, color) VALUES (?, ?, ?)",
                (board_id, name, color),
            )
            label_id = cursor.lastrowid
        except sqlite3.IntegrityError as err:
            raise HTTPException(status_code=409, detail="A label with that name already exists.") from err
    return {"id": label_id, "name": name, "color": color}


def delete_board_label(db_path: Path, username: str, board_id: int, label_id: int) -> None:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        row = connection.execute(
            "SELECT id FROM board_labels WHERE id = ? AND board_id = ?",
            (label_id, board_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Label not found.")
        connection.execute("DELETE FROM board_labels WHERE id = ?", (label_id,))


def update_board_label(db_path: Path, username: str, board_id: int, label_id: int, name: str | None, color: str | None) -> dict:
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        row = connection.execute(
            "SELECT id, name, color FROM board_labels WHERE id = ? AND board_id = ?",
            (label_id, board_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Label not found.")
        new_name = name.strip() if name is not None else row["name"]
        new_color = color if color is not None else row["color"]
        if not new_name:
            raise HTTPException(status_code=422, detail="Label name is required.")
        if new_color not in _VALID_LABEL_COLORS:
            raise HTTPException(status_code=422, detail=f"Invalid color '{new_color}'.")
        try:
            connection.execute(
                "UPDATE board_labels SET name = ?, color = ? WHERE id = ?",
                (new_name, new_color, label_id),
            )
        except sqlite3.IntegrityError as err:
            raise HTTPException(status_code=409, detail="A label with that name already exists.") from err
    return {"id": label_id, "name": new_name, "color": new_color}


def search_boards_and_cards(db_path: Path, username: str, query: str) -> list[dict]:
    query = query.strip()
    if len(query) < 2:
        return []

    like = f"%{query}%"
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT 'board' AS type, b.id AS board_id, b.title AS board_title,
                   NULL AS card_id, NULL AS card_title, NULL AS card_details,
                   NULL AS column_title
            FROM boards b
            JOIN users u ON b.user_id = u.id
            WHERE u.username = ? AND (b.title LIKE ? OR b.description LIKE ?)

            UNION ALL

            SELECT 'card', b.id, b.title,
                   c.id, c.title, c.details,
                   col.title
            FROM cards c
            JOIN boards b ON c.board_id = b.id
            JOIN users u ON b.user_id = u.id
            JOIN columns col ON col.board_id = b.id AND col.key = c.column_key
            WHERE u.username = ? AND c.archived = 0
              AND (c.title LIKE ? OR c.details LIKE ? OR c.assignee LIKE ?)

            ORDER BY board_title, type DESC, card_title
            LIMIT 30
            """,
            (username, like, like, username, like, like, like),
        ).fetchall()

    return [
        {
            "type": row["type"],
            "boardId": row["board_id"],
            "boardTitle": row["board_title"],
            "cardId": row["card_id"],
            "cardTitle": row["card_title"],
            "cardDetails": row["card_details"],
            "columnTitle": row["column_title"],
        }
        for row in rows
    ]
