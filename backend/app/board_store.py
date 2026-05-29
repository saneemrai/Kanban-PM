from pathlib import Path
import sqlite3
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "pm.sqlite3"
MVP_USERNAME = "user"
FIXED_COLUMN_IDS = [
    "col-backlog",
    "col-discovery",
    "col-progress",
    "col-review",
    "col-done",
]


class Card(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    details: str


class Column(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[Column]
    cards: dict[str, Card]


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


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(db_path: Path) -> None:
    with connect(db_path) as connection:
        connection.executescript(
            """
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
            """
        )
        ensure_user_board(connection, MVP_USERNAME)


def ensure_user_board(connection: sqlite3.Connection, username: str) -> int:
    connection.execute(
        "INSERT OR IGNORE INTO users (username) VALUES (?)",
        (username,),
    )
    user_id = connection.execute(
        "SELECT id FROM users WHERE username = ?",
        (username,),
    ).fetchone()["id"]
    connection.execute(
        "INSERT OR IGNORE INTO boards (user_id) VALUES (?)",
        (user_id,),
    )
    board_id = connection.execute(
        "SELECT id FROM boards WHERE user_id = ?",
        (user_id,),
    ).fetchone()["id"]

    column_count = connection.execute(
        "SELECT COUNT(*) AS count FROM columns WHERE board_id = ?",
        (board_id,),
    ).fetchone()["count"]
    if column_count == 0:
        for position, column in enumerate(DEFAULT_BOARD.columns):
            connection.execute(
                """
                INSERT INTO columns (board_id, key, title, position)
                VALUES (?, ?, ?, ?)
                """,
                (board_id, column.id, column.title, position),
            )

    card_count = connection.execute(
        "SELECT COUNT(*) AS count FROM cards WHERE board_id = ?",
        (board_id,),
    ).fetchone()["count"]
    if card_count == 0:
        insert_board_cards(connection, board_id, DEFAULT_BOARD)

    return board_id


def get_board(db_path: Path, username: str) -> BoardData:
    with connect(db_path) as connection:
        board_id = get_board_id(connection, username)
        columns = connection.execute(
            """
            SELECT key, title
            FROM columns
            WHERE board_id = ?
            ORDER BY position
            """,
            (board_id,),
        ).fetchall()
        cards = connection.execute(
            """
            SELECT id, column_key, title, details
            FROM cards
            WHERE board_id = ?
            ORDER BY column_key, position
            """,
            (board_id,),
        ).fetchall()

    cards_by_column: dict[str, list[str]] = {column["key"]: [] for column in columns}
    cards_by_id: dict[str, Card] = {}
    for card in cards:
        cards_by_column[card["column_key"]].append(card["id"])
        cards_by_id[card["id"]] = Card(
            id=card["id"],
            title=card["title"],
            details=card["details"],
        )

    return BoardData(
        columns=[
            Column(
                id=column["key"],
                title=column["title"],
                cardIds=cards_by_column[column["key"]],
            )
            for column in columns
        ],
        cards=cards_by_id,
    )


def save_board(db_path: Path, username: str, payload: dict[str, Any]) -> BoardData:
    board = parse_and_validate_board(payload)
    with connect(db_path) as connection:
        board_id = get_board_id(connection, username)
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
    return get_board(db_path, username)


def get_board_id(connection: sqlite3.Connection, username: str) -> int:
    row = connection.execute(
        """
        SELECT boards.id
        FROM boards
        JOIN users ON users.id = boards.user_id
        WHERE users.username = ?
        """,
        (username,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Board not found.")
    return row["id"]


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
                INSERT INTO cards (id, board_id, column_key, title, details, position)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (card.id, board_id, column.id, card.title, card.details, position),
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

    return board
