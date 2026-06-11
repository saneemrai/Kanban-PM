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

SCHEMA_VERSION = 5


VALID_PRIORITIES = {"low", "medium", "high", "critical"}


class Card(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    details: str
    priority: str | None = None
    due_date: str | None = None
    labels: list[str] = []


class Column(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[Column]
    cards: dict[str, Card]


class BoardSummary(BaseModel):
    id: int
    title: str
    cardCount: int
    updatedAt: str


class LoginPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str


class RegisterPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str


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
    connection: sqlite3.Connection, user_id: int, title: str
) -> int:
    connection.execute(
        "INSERT INTO boards (user_id, title) VALUES (?, ?)",
        (user_id, title),
    )
    board_id = connection.execute(
        "SELECT id FROM boards WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        (user_id,),
    ).fetchone()["id"]
    for position, column in enumerate(DEFAULT_BOARD.columns):
        connection.execute(
            "INSERT INTO columns (board_id, key, title, position) VALUES (?, ?, ?, ?)",
            (board_id, column.id, column.title, position),
        )
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
            """
            INSERT INTO sessions (user_id, token)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              token = excluded.token,
              created_at = CURRENT_TIMESTAMP
            """,
            (user_id, token),
        )
    return token


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
            SELECT b.id, b.title, b.updated_at,
                   COUNT(c.id) AS card_count
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
            cardCount=row["card_count"],
            updatedAt=row["updated_at"],
        )
        for row in rows
    ]


def create_board(db_path: Path, username: str, title: str) -> BoardSummary:
    title = title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Board title is required.")
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found.")
        user_id = row["id"]
        board_id = _create_board_with_seed_data(connection, user_id, title)
        row = connection.execute(
            """
            SELECT b.id, b.title, b.updated_at, COUNT(c.id) AS card_count
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
        cardCount=row["card_count"],
        updatedAt=row["updated_at"],
    )


def rename_board(db_path: Path, username: str, board_id: int, title: str) -> None:
    title = title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Board title is required.")
    with connect(db_path) as connection:
        _verify_board_ownership(connection, username, board_id)
        connection.execute(
            "UPDATE boards SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (title, board_id),
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
        for position, column in enumerate(board.columns):
            connection.execute(
                """
                UPDATE columns
                SET title = ?, position = ?, updated_at = CURRENT_TIMESTAMP
                WHERE board_id = ? AND key = ?
                """,
                (column.title, position, board_id, column.id),
            )
        connection.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        insert_board_cards(connection, board_id, board)
        connection.execute(
            "UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (board_id,),
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
            "SELECT key, title FROM columns WHERE board_id = ? ORDER BY position",
            (board_id,),
        ).fetchall()
        cards = connection.execute(
            """
            SELECT id, column_key, title, details, priority, due_date, labels
            FROM cards
            WHERE board_id = ?
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
        )

    return BoardData(
        columns=[
            Column(
                id=col["key"],
                title=col["title"],
                cardIds=cards_by_column[col["key"]],
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
                INSERT INTO cards (id, board_id, column_key, title, details, position, priority, due_date, labels)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (card.id, board_id, column.id, card.title, card.details, position, card.priority, card.due_date, json.dumps(card.labels)),
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
