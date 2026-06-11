from pathlib import Path
from copy import deepcopy
import sqlite3

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.ai_client import (
    OPENROUTER_MODEL,
    AiChatPayload,
    AiStructuredResponse,
    build_ai_chat_prompt,
    build_openrouter_request,
    parse_ai_response,
)
from app.board_store import DEFAULT_BOARD, initialize_database
from app.main import create_app


def write_static_index(static_dir: Path) -> None:
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<h1>Kanban Studio</h1>", encoding="utf-8")


def make_client(tmp_path: Path) -> TestClient:
    static_dir = tmp_path / "static"
    write_static_index(static_dir)
    return TestClient(create_app(static_dir, tmp_path / "pm.sqlite3"))


def login(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200
    return {"X-PM-Session": response.json()["sessionToken"]}


def test_health_api_returns_ok(tmp_path: Path) -> None:
    response = make_client(tmp_path).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "project-management-api",
    }


def test_ai_client_uses_openrouter_model() -> None:
    request = build_openrouter_request("What is 2+2?")

    assert request["model"] == OPENROUTER_MODEL
    assert request["messages"] == [{"role": "user", "content": "What is 2+2?"}]
    assert request["temperature"] == 0


def test_ai_chat_prompt_includes_history_and_board() -> None:
    prompt = build_ai_chat_prompt(
        AiChatPayload(
            message="Move the roadmap card to Done.",
            history=[
                {
                    "role": "user",
                    "content": "Show me what is in backlog.",
                },
                {
                    "role": "assistant",
                    "content": "There are two backlog cards.",
                },
            ],
        ),
        DEFAULT_BOARD,
    )

    assert "Respond with valid JSON only." in prompt
    assert "Move the roadmap card to Done." in prompt
    assert "There are two backlog cards." in prompt
    assert "card-1" in prompt
    assert "col-backlog" in prompt


def test_ai_response_parser_accepts_structured_json() -> None:
    parsed = parse_ai_response(
        '{"assistantMessage":"I updated the board.","board":null}'
    )

    assert parsed.assistantMessage == "I updated the board."
    assert parsed.board is None


def test_ai_response_parser_rejects_invalid_json() -> None:
    try:
        parse_ai_response("not json")
    except HTTPException as error:
        assert error.status_code == 502
        assert error.detail == "AI returned invalid JSON."
    else:
        raise AssertionError("Expected invalid AI JSON to raise HTTPException.")



def test_ai_chat_requires_user_session(tmp_path: Path) -> None:
    response = make_client(tmp_path).post(
        "/api/ai/chat",
        json={"message": "What should I do next?"},
    )

    assert response.status_code == 401


def test_ai_chat_route_returns_response_without_board_change(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.main.call_ai_chat",
        lambda payload, board: AiStructuredResponse(
            assistantMessage="No board changes needed.",
            board=None,
        ),
    )
    client = make_client(tmp_path)

    response = client.post(
        "/api/ai/chat",
        headers=login(client),
        json={
            "message": "Summarize the board.",
            "history": [{"role": "user", "content": "Hello"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "No board changes needed.",
        "boardChanged": False,
        "board": None,
    }


def test_ai_chat_route_saves_valid_board_update(
    tmp_path: Path,
    monkeypatch,
) -> None:
    next_board = deepcopy(DEFAULT_BOARD.model_dump())
    next_board["columns"][0]["cardIds"].remove("card-1")
    next_board["columns"][4]["cardIds"].append("card-1")

    monkeypatch.setattr(
        "app.main.call_ai_chat",
        lambda payload, board: AiStructuredResponse(
            assistantMessage="Moved the roadmap card to Done.",
            board=next_board,
        ),
    )
    client = make_client(tmp_path)
    headers = login(client)

    response = client.post(
        "/api/ai/chat",
        headers=headers,
        json={"message": "Move the roadmap card to Done."},
    )
    persisted = client.get("/api/board", headers=headers)

    assert response.status_code == 200
    assert response.json()["boardChanged"] is True
    assert "card-1" in persisted.json()["columns"][4]["cardIds"]


def test_ai_chat_route_rejects_invalid_board_without_saving(
    tmp_path: Path,
    monkeypatch,
) -> None:
    invalid_board = deepcopy(DEFAULT_BOARD.model_dump())
    invalid_board["columns"] = invalid_board["columns"][:-1]

    monkeypatch.setattr(
        "app.main.call_ai_chat",
        lambda payload, board: AiStructuredResponse(
            assistantMessage="I changed the board.",
            board=invalid_board,
        ),
    )
    client = make_client(tmp_path)
    headers = login(client)
    before = client.get("/api/board", headers=headers).json()

    response = client.post(
        "/api/ai/chat",
        headers=headers,
        json={"message": "Move something."},
    )
    after = client.get("/api/board", headers=headers).json()

    assert response.status_code == 502
    assert response.json() == {"detail": "AI returned invalid board data."}
    assert after == before


def test_root_serves_static_frontend(tmp_path: Path) -> None:
    response = make_client(tmp_path).get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Kanban Studio" in response.text


def test_database_initialization_creates_seed_board(tmp_path: Path) -> None:
    db_path = tmp_path / "data" / "pm.sqlite3"

    initialize_database(db_path)

    assert db_path.exists()
    with sqlite3.connect(db_path) as connection:
        user_count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        board_count = connection.execute("SELECT COUNT(*) FROM boards").fetchone()[0]
        column_count = connection.execute("SELECT COUNT(*) FROM columns").fetchone()[0]
        card_count = connection.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
        session_count = connection.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]

    assert user_count == 1
    assert board_count == 1
    assert column_count == 5
    assert card_count == 8
    assert session_count == 0


def test_board_api_requires_user_session(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    missing_response = client.get("/api/board")
    invalid_response = client.get("/api/board", headers={"X-PM-Session": "bad"})

    assert missing_response.status_code == 401
    assert invalid_response.status_code == 401


def test_login_rejects_invalid_credentials(tmp_path: Path) -> None:
    response = make_client(tmp_path).post(
        "/api/login",
        json={"username": "user", "password": "wrong"},
    )

    assert response.status_code == 401


def test_second_login_invalidates_first_session(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    first_headers = login(client)
    second_headers = login(client)

    first_response = client.get("/api/session", headers=first_headers)
    second_response = client.get("/api/session", headers=second_headers)

    assert first_response.status_code == 401
    assert second_response.status_code == 200


def test_logout_invalidates_session(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)

    logout_response = client.post("/api/logout", headers=headers)
    board_response = client.get("/api/board", headers=headers)

    assert logout_response.status_code == 200
    assert board_response.status_code == 401


def test_board_api_returns_seed_board(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    response = client.get("/api/board", headers=login(client))

    assert response.status_code == 200
    assert response.json() == DEFAULT_BOARD.model_dump()


def test_board_api_updates_and_persists_board(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.sqlite3"
    static_dir = tmp_path / "static"
    write_static_index(static_dir)
    client = TestClient(create_app(static_dir, db_path))

    headers = login(client)
    board = client.get("/api/board", headers=headers).json()
    board["columns"][0]["title"] = "Ideas"
    board["columns"][0]["cardIds"].remove("card-2")
    board["columns"][4]["cardIds"].append("card-2")
    board["cards"]["card-9"] = {
        "id": "card-9",
        "title": "Persisted card",
        "details": "Saved by the API.",
    }
    board["columns"][1]["cardIds"].append("card-9")
    del board["cards"]["card-8"]
    board["columns"][4]["cardIds"].remove("card-8")

    update_response = client.put("/api/board", json=board, headers=headers)
    next_client = TestClient(create_app(static_dir, db_path))
    persisted_response = next_client.get("/api/board", headers=headers)

    assert update_response.status_code == 200
    assert persisted_response.status_code == 200
    persisted_board = persisted_response.json()
    assert persisted_board["columns"][0]["title"] == "Ideas"
    assert "card-2" in persisted_board["columns"][4]["cardIds"]
    assert persisted_board["cards"]["card-9"]["title"] == "Persisted card"
    assert "card-8" not in persisted_board["cards"]


def test_board_api_rejects_invalid_board_payload(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board = client.get("/api/board", headers=headers).json()
    board["columns"] = board["columns"][:-1]

    response = client.put("/api/board", json=board, headers=headers)

    assert response.status_code == 422


# --- Registration tests ---

def test_register_creates_user_and_returns_session(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.post(
        "/api/register",
        json={"username": "alice", "password": "s3cr3t!"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "alice"
    assert "sessionToken" in data and len(data["sessionToken"]) > 0


def test_register_then_login_works(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    client.post("/api/register", json={"username": "bob", "password": "hunter2!"})

    response = client.post("/api/login", json={"username": "bob", "password": "hunter2!"})

    assert response.status_code == 200
    assert response.json()["username"] == "bob"


def test_register_rejects_duplicate_username(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    client.post("/api/register", json={"username": "alice", "password": "s3cr3t!"})

    response = client.post(
        "/api/register",
        json={"username": "alice", "password": "other123"},
    )

    assert response.status_code == 409


def test_register_rejects_short_username(tmp_path: Path) -> None:
    response = make_client(tmp_path).post(
        "/api/register",
        json={"username": "ab", "password": "s3cr3t!"},
    )

    assert response.status_code == 422


def test_register_rejects_short_password(tmp_path: Path) -> None:
    response = make_client(tmp_path).post(
        "/api/register",
        json={"username": "alice", "password": "hi"},
    )

    assert response.status_code == 422


def test_register_rejects_existing_default_username(tmp_path: Path) -> None:
    response = make_client(tmp_path).post(
        "/api/register",
        json={"username": "user", "password": "newpass1"},
    )

    assert response.status_code == 409


def test_registered_user_gets_seed_board(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    reg = client.post("/api/register", json={"username": "carol", "password": "correct1"})
    headers = {"X-PM-Session": reg.json()["sessionToken"]}

    boards = client.get("/api/boards", headers=headers).json()

    assert len(boards) == 1
    assert boards[0]["title"] == "My Board"
    assert boards[0]["cardCount"] == 8


# --- Multi-board tests ---

def _register_and_headers(client: TestClient, username: str = "alice") -> dict[str, str]:
    reg = client.post(
        "/api/register",
        json={"username": username, "password": "s3cr3t!"},
    )
    return {"X-PM-Session": reg.json()["sessionToken"]}


def test_list_boards_returns_default_board(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)

    response = client.get("/api/boards", headers=headers)

    assert response.status_code == 200
    boards = response.json()
    assert len(boards) == 1
    assert boards[0]["id"] > 0
    assert boards[0]["cardCount"] == 8


def test_create_board_adds_second_board(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)

    response = client.post("/api/boards", json={"title": "Sprint 2"}, headers=headers)

    assert response.status_code == 201
    new_board = response.json()
    assert new_board["title"] == "Sprint 2"
    assert new_board["cardCount"] == 8

    all_boards = client.get("/api/boards", headers=headers).json()
    assert len(all_boards) == 2


def test_create_board_rejects_empty_title(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)

    response = client.post("/api/boards", json={"title": "  "}, headers=headers)

    assert response.status_code == 422


def test_create_board_requires_session(tmp_path: Path) -> None:
    response = make_client(tmp_path).post("/api/boards", json={"title": "X"})

    assert response.status_code == 401


def test_rename_board_updates_title(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    response = client.patch(
        f"/api/boards/{board_id}",
        json={"title": "Q4 Roadmap"},
        headers=headers,
    )
    boards = client.get("/api/boards", headers=headers).json()

    assert response.status_code == 200
    assert boards[0]["title"] == "Q4 Roadmap"


def test_rename_board_rejects_empty_title(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    response = client.patch(
        f"/api/boards/{board_id}",
        json={"title": ""},
        headers=headers,
    )

    assert response.status_code == 422


def test_delete_board_removes_it(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    client.post("/api/boards", json={"title": "Extra"}, headers=headers)
    boards = client.get("/api/boards", headers=headers).json()
    assert len(boards) == 2
    delete_id = boards[1]["id"]

    response = client.delete(f"/api/boards/{delete_id}", headers=headers)
    remaining = client.get("/api/boards", headers=headers).json()

    assert response.status_code == 204
    assert len(remaining) == 1


def test_delete_last_board_is_rejected(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    response = client.delete(f"/api/boards/{board_id}", headers=headers)

    assert response.status_code == 422


def test_delete_board_requires_ownership(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    user_headers = login(client)
    alice_headers = _register_and_headers(client)

    user_board_id = client.get("/api/boards", headers=user_headers).json()[0]["id"]

    response = client.delete(f"/api/boards/{user_board_id}", headers=alice_headers)

    assert response.status_code == 404


def test_get_board_by_id_returns_data(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    response = client.get(f"/api/boards/{board_id}/data", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert len(data["columns"]) == 5
    assert len(data["cards"]) == 8


def test_get_board_by_id_requires_ownership(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    user_headers = login(client)
    alice_headers = _register_and_headers(client)

    user_board_id = client.get("/api/boards", headers=user_headers).json()[0]["id"]
    response = client.get(f"/api/boards/{user_board_id}/data", headers=alice_headers)

    assert response.status_code == 404


def test_update_board_by_id_persists(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()
    board["columns"][0]["title"] = "Backlog Modified"

    response = client.put(
        f"/api/boards/{board_id}/data", json=board, headers=headers
    )

    assert response.status_code == 200
    assert response.json()["columns"][0]["title"] == "Backlog Modified"


def test_boards_are_isolated_between_users(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    user_headers = login(client)
    alice_headers = _register_and_headers(client)

    user_board_id = client.get("/api/boards", headers=user_headers).json()[0]["id"]
    board = client.get(f"/api/boards/{user_board_id}/data", headers=user_headers).json()
    board["columns"][0]["title"] = "User Only Change"
    client.put(f"/api/boards/{user_board_id}/data", json=board, headers=user_headers)

    alice_boards = client.get("/api/boards", headers=alice_headers).json()
    alice_board = client.get(
        f"/api/boards/{alice_boards[0]['id']}/data", headers=alice_headers
    ).json()

    assert alice_board["columns"][0]["title"] != "User Only Change"


def test_ai_chat_with_board_id(tmp_path: Path, monkeypatch) -> None:
    from copy import deepcopy
    from app.board_store import DEFAULT_BOARD
    from app.ai_client import AiStructuredResponse

    client = make_client(tmp_path)
    headers = login(client)
    client.post("/api/boards", json={"title": "Second Board"}, headers=headers)
    boards = client.get("/api/boards", headers=headers).json()
    second_board_id = boards[1]["id"]

    next_board = deepcopy(DEFAULT_BOARD.model_dump())
    next_board["columns"][0]["cardIds"].remove("card-1")
    next_board["columns"][4]["cardIds"].append("card-1")

    monkeypatch.setattr(
        "app.main.call_ai_chat",
        lambda payload, board: AiStructuredResponse(
            assistantMessage="Moved card-1 to Done.",
            board=next_board,
        ),
    )

    response = client.post(
        "/api/ai/chat",
        headers=headers,
        json={"message": "Move card-1 to Done.", "boardId": second_board_id},
    )
    second_board_data = client.get(
        f"/api/boards/{second_board_id}/data", headers=headers
    ).json()

    assert response.status_code == 200
    assert response.json()["boardChanged"] is True
    assert "card-1" in second_board_data["columns"][4]["cardIds"]


def test_card_due_date_roundtrip(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["due_date"] = "2025-12-31"

    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)
    saved = response.json()

    assert response.status_code == 200
    assert saved["cards"]["card-1"]["due_date"] == "2025-12-31"


def test_card_due_date_rejects_invalid_format(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()
    board["cards"]["card-1"]["due_date"] = "31-12-2025"

    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422


def test_card_due_date_null_clears_value(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["due_date"] = "2025-06-01"
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    board["cards"]["card-1"]["due_date"] = None
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["due_date"] is None


def test_card_priority_roundtrip(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["priority"] = "high"

    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)
    saved = response.json()

    assert response.status_code == 200
    assert saved["cards"]["card-1"]["priority"] == "high"


def test_card_priority_rejects_invalid_value(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()
    board["cards"]["card-1"]["priority"] = "urgent"

    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422


def test_card_priority_null_clears_priority(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["priority"] = "critical"
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    board["cards"]["card-1"]["priority"] = None
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["priority"] is None


def test_schema_migration_from_v1_to_v2(tmp_path: Path) -> None:
    """Verify that a v1 schema (single-board, no password_hash) migrates correctly."""
    from app.board_store import connect, DEFAULT_BOARD, insert_board_cards

    db_path = tmp_path / "v1.sqlite3"
    # Create a simulated v1 database (no schema_version, boards has UNIQUE user_id)
    with connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                title TEXT NOT NULL DEFAULT 'Project Board',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );
            CREATE TABLE columns (
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
            CREATE TABLE cards (
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
            CREATE TABLE sessions (
                user_id INTEGER PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );
            INSERT INTO users (username) VALUES ('user');
            INSERT INTO boards (user_id, title) VALUES (1, 'Project Board');
            """
        )
        for position, col in enumerate(DEFAULT_BOARD.columns):
            conn.execute(
                "INSERT INTO columns (board_id, key, title, position) VALUES (1, ?, ?, ?)",
                (col.id, col.title, position),
            )
        # Seed v1 cards without priority column
        for col in DEFAULT_BOARD.columns:
            for position, card_id in enumerate(col.cardIds):
                card = DEFAULT_BOARD.cards[card_id]
                conn.execute(
                    "INSERT INTO cards (id, board_id, column_key, title, details, position)"
                    " VALUES (?, 1, ?, ?, ?, ?)",
                    (card.id, col.id, card.title, card.details, position),
                )

    from app.board_store import initialize_database, get_board

    initialize_database(db_path)

    # After migration, user should be able to log in and second board should be creatable
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE username = 'user'"
        ).fetchone()
        assert row["password_hash"] != ""

        boards_sql = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'boards'"
        ).fetchone()["sql"]
        assert "UNIQUE" not in boards_sql.upper() or "USER_ID" not in boards_sql.upper()

    board = get_board(db_path, "user")
    assert len(board.columns) == 5


def test_card_labels_roundtrip(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["labels"] = ["bug", "urgent"]

    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["labels"] == ["bug", "urgent"]


def test_card_labels_default_to_empty_list(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    assert board["cards"]["card-1"]["labels"] == []


def test_card_labels_rejects_more_than_ten(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["labels"] = [str(i) for i in range(11)]
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422


def test_card_labels_rejects_label_over_30_chars(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["labels"] = ["x" * 31]
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422


def test_change_password_accepts_valid_current_password(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)

    response = client.post(
        "/api/user/password",
        json={"currentPassword": "password", "newPassword": "newpass1"},
        headers=headers,
    )

    assert response.status_code == 200
    # Old credentials should no longer work
    assert client.post("/api/login", json={"username": "user", "password": "password"}).status_code == 401
    # New credentials should work
    assert client.post("/api/login", json={"username": "user", "password": "newpass1"}).status_code == 200


def test_change_password_rejects_wrong_current_password(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)

    response = client.post(
        "/api/user/password",
        json={"currentPassword": "wrongpassword", "newPassword": "newpass1"},
        headers=headers,
    )

    assert response.status_code == 401


def test_change_password_rejects_short_new_password(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)

    response = client.post(
        "/api/user/password",
        json={"currentPassword": "password", "newPassword": "abc"},
        headers=headers,
    )

    assert response.status_code == 422


def test_change_password_requires_session(tmp_path: Path) -> None:
    response = make_client(tmp_path).post(
        "/api/user/password",
        json={"currentPassword": "password", "newPassword": "newpass1"},
    )

    assert response.status_code == 401


# --- Comment tests ---

def _board_and_card(client: TestClient, headers: dict) -> tuple[int, str]:
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    card_id = "card-1"
    return board_id, card_id


def test_comments_list_empty_initially(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    response = client.get(
        f"/api/boards/{board_id}/cards/{card_id}/comments", headers=headers
    )

    assert response.status_code == 200
    assert response.json() == []


def test_add_comment_returns_comment(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    response = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments",
        json={"body": "Great progress!"},
        headers=headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["body"] == "Great progress!"
    assert data["author"] == "user"
    assert "id" in data
    assert "created_at" in data


def test_comments_list_shows_added_comment(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    client.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments",
        json={"body": "First"},
        headers=headers,
    )
    client.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments",
        json={"body": "Second"},
        headers=headers,
    )

    comments = client.get(
        f"/api/boards/{board_id}/cards/{card_id}/comments", headers=headers
    ).json()

    assert len(comments) == 2
    assert comments[0]["body"] == "First"
    assert comments[1]["body"] == "Second"


def test_add_comment_rejects_empty_body(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    response = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments",
        json={"body": "   "},
        headers=headers,
    )

    assert response.status_code == 422


def test_add_comment_rejects_body_over_2000_chars(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    response = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments",
        json={"body": "x" * 2001},
        headers=headers,
    )

    assert response.status_code == 422


def test_add_comment_rejects_nonexistent_card(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    response = client.post(
        f"/api/boards/{board_id}/cards/no-such-card/comments",
        json={"body": "Hello"},
        headers=headers,
    )

    assert response.status_code == 404


def test_delete_comment_removes_it(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    comment_id = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments",
        json={"body": "Delete me"},
        headers=headers,
    ).json()["id"]

    response = client.delete(
        f"/api/boards/{board_id}/comments/{comment_id}", headers=headers
    )
    remaining = client.get(
        f"/api/boards/{board_id}/cards/{card_id}/comments", headers=headers
    ).json()

    assert response.status_code == 204
    assert remaining == []


def test_delete_comment_forbidden_for_other_user(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    user_headers = login(client)
    alice_headers = _register_and_headers(client)
    board_id, card_id = _board_and_card(client, user_headers)
    comment_id = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments",
        json={"body": "Only mine"},
        headers=user_headers,
    ).json()["id"]

    alice_board_id = client.get("/api/boards", headers=alice_headers).json()[0]["id"]
    response = client.delete(
        f"/api/boards/{alice_board_id}/comments/{comment_id}", headers=alice_headers
    )

    assert response.status_code == 404


def test_comments_require_session(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    assert client.get(f"/api/boards/{board_id}/cards/{card_id}/comments").status_code == 401
    assert client.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "x"}
    ).status_code == 401


# --- Archive tests ---

def test_archive_card_removes_from_board(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    response = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/archive", headers=headers
    )

    assert response.status_code == 200
    board = response.json()
    all_card_ids = [cid for col in board["columns"] for cid in col["cardIds"]]
    assert card_id not in all_card_ids
    assert card_id not in board["cards"]


def test_archive_list_shows_archived_card(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/archive", headers=headers)

    response = client.get(f"/api/boards/{board_id}/archive", headers=headers)

    assert response.status_code == 200
    archived = response.json()
    assert len(archived) == 1
    assert archived[0]["id"] == card_id


def test_archive_card_not_in_board_data(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/archive", headers=headers)

    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    all_card_ids = [cid for col in board["columns"] for cid in col["cardIds"]]
    assert card_id not in all_card_ids


def test_restore_card_appears_in_backlog(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/archive", headers=headers)

    response = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/restore", headers=headers
    )

    assert response.status_code == 200
    board = response.json()
    backlog = next(col for col in board["columns"] if col["id"] == "col-backlog")
    assert card_id in backlog["cardIds"]
    assert card_id in board["cards"]


def test_restore_removes_from_archive(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/archive", headers=headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/restore", headers=headers)

    archived = client.get(f"/api/boards/{board_id}/archive", headers=headers).json()

    assert len(archived) == 0


def test_save_board_preserves_archived_cards(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/archive", headers=headers)

    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()
    board["columns"][0]["title"] = "Modified"
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    archived = client.get(f"/api/boards/{board_id}/archive", headers=headers).json()
    assert any(a["id"] == card_id for a in archived)


def test_archive_nonexistent_card_returns_404(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    response = client.post(
        f"/api/boards/{board_id}/cards/no-such-card/archive", headers=headers
    )

    assert response.status_code == 404


# --- Activity log tests ---

def test_activity_log_empty_initially(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    response = client.get(f"/api/boards/{board_id}/activity", headers=headers)

    assert response.status_code == 200
    assert response.json() == []


def test_activity_logs_card_creation(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    new_id = "card-new-test"
    board["cards"][new_id] = {"id": new_id, "title": "New test card", "details": "d", "labels": []}
    board["columns"][0]["cardIds"].append(new_id)
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    activity = client.get(f"/api/boards/{board_id}/activity", headers=headers).json()
    assert any(a["action"] == "card_created" and a["cardId"] == new_id for a in activity)


def test_activity_logs_card_deletion(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    card_id = board["columns"][0]["cardIds"][0]
    board["cards"].pop(card_id)
    board["columns"][0]["cardIds"].remove(card_id)
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    activity = client.get(f"/api/boards/{board_id}/activity", headers=headers).json()
    assert any(a["action"] == "card_deleted" and a["cardId"] == card_id for a in activity)


def test_activity_logs_card_archive(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/archive", headers=headers)

    activity = client.get(f"/api/boards/{board_id}/activity", headers=headers).json()
    assert any(a["action"] == "card_archived" and a["cardId"] == card_id for a in activity)


def test_activity_logs_card_restore(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/archive", headers=headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/restore", headers=headers)

    activity = client.get(f"/api/boards/{board_id}/activity", headers=headers).json()
    assert any(a["action"] == "card_restored" and a["cardId"] == card_id for a in activity)


def test_activity_logs_board_rename(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    client.patch(f"/api/boards/{board_id}", json={"title": "Renamed Board"}, headers=headers)

    activity = client.get(f"/api/boards/{board_id}/activity", headers=headers).json()
    rename_events = [a for a in activity if a["action"] == "board_renamed"]
    assert len(rename_events) == 1
    assert rename_events[0]["meta"]["to"] == "Renamed Board"


def test_activity_logs_card_move(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    card_id = board["columns"][0]["cardIds"][0]
    board["columns"][0]["cardIds"].remove(card_id)
    board["columns"][1]["cardIds"].append(card_id)
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    activity = client.get(f"/api/boards/{board_id}/activity", headers=headers).json()
    move_events = [a for a in activity if a["action"] == "card_moved"]
    assert len(move_events) == 1
    assert move_events[0]["cardId"] == card_id
    assert move_events[0]["meta"]["from"] == "col-backlog"
    assert move_events[0]["meta"]["to"] == "col-discovery"


def test_activity_requires_session(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    assert client.get(f"/api/boards/{board_id}/activity").status_code == 401


def test_archive_requires_session(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    assert client.post(f"/api/boards/{board_id}/cards/{card_id}/archive").status_code == 401
    assert client.get(f"/api/boards/{board_id}/archive").status_code == 401


# --- Checklist tests ---

def test_checklist_empty_initially(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    response = client.get(
        f"/api/boards/{board_id}/cards/{card_id}/checklist", headers=headers
    )

    assert response.status_code == 200
    assert response.json() == []


def test_add_checklist_item_returns_item(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    response = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist",
        json={"text": "Write unit tests"},
        headers=headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["text"] == "Write unit tests"
    assert data["done"] is False
    assert "id" in data


def test_checklist_list_shows_items(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"text": "First"}, headers=headers)
    client.post(f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"text": "Second"}, headers=headers)

    items = client.get(f"/api/boards/{board_id}/cards/{card_id}/checklist", headers=headers).json()

    assert len(items) == 2
    assert items[0]["text"] == "First"
    assert items[1]["text"] == "Second"


def test_toggle_checklist_item_marks_done(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    item_id = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist",
        json={"text": "Todo"},
        headers=headers,
    ).json()["id"]

    response = client.patch(
        f"/api/boards/{board_id}/checklist/{item_id}",
        json={"done": True},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["done"] is True


def test_delete_checklist_item_removes_it(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)
    item_id = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist",
        json={"text": "Delete me"},
        headers=headers,
    ).json()["id"]

    response = client.delete(f"/api/boards/{board_id}/checklist/{item_id}", headers=headers)
    items = client.get(f"/api/boards/{board_id}/cards/{card_id}/checklist", headers=headers).json()

    assert response.status_code == 204
    assert items == []


def test_checklist_rejects_empty_text(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    response = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist",
        json={"text": "  "},
        headers=headers,
    )

    assert response.status_code == 422


def test_checklist_rejects_text_over_200_chars(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    response = client.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist",
        json={"text": "x" * 201},
        headers=headers,
    )

    assert response.status_code == 422


def test_checklist_requires_session(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id, card_id = _board_and_card(client, headers)

    assert client.get(f"/api/boards/{board_id}/cards/{card_id}/checklist").status_code == 401
    assert client.post(f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"text": "x"}).status_code == 401


# --- WIP limit tests ---

def test_wip_limit_defaults_to_null(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    for col in board["columns"]:
        assert col["wip_limit"] is None


def test_wip_limit_saves_and_loads(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["columns"][0]["wip_limit"] = 3
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 200
    updated = response.json()
    assert updated["columns"][0]["wip_limit"] == 3
    assert updated["columns"][1]["wip_limit"] is None


def test_wip_limit_can_be_cleared(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["columns"][0]["wip_limit"] = 5
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    board["columns"][0]["wip_limit"] = None
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 200
    assert response.json()["columns"][0]["wip_limit"] is None


def test_wip_limit_rejects_zero(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["columns"][0]["wip_limit"] = 0
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422


def test_wip_limit_rejects_negative(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["columns"][0]["wip_limit"] = -1
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422


def test_wip_limit_persists_across_reload(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["columns"][2]["wip_limit"] = 2
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    reloaded = client.get(f"/api/boards/{board_id}/data", headers=headers).json()
    assert reloaded["columns"][2]["wip_limit"] == 2


# --- Story point (estimate) tests ---

def test_estimate_defaults_to_null(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    for card in board["cards"].values():
        assert card["estimate"] is None


def test_estimate_saves_and_loads(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["estimate"] = 5
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["estimate"] == 5
    assert response.json()["cards"]["card-2"]["estimate"] is None


def test_estimate_can_be_cleared(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["estimate"] = 3
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    board["cards"]["card-1"]["estimate"] = None
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["estimate"] is None


def test_estimate_rejects_zero(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["estimate"] = 0
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422


def test_estimate_rejects_negative(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["estimate"] = -2
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422


def test_estimate_persists_across_reload(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-3"]["estimate"] = 8
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    reloaded = client.get(f"/api/boards/{board_id}/data", headers=headers).json()
    assert reloaded["cards"]["card-3"]["estimate"] == 8


# --- Assignee tests ---

def test_assignee_defaults_to_null(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]

    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    for card in board["cards"].values():
        assert card["assignee"] is None


def test_assignee_saves_and_loads(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["assignee"] = "Alice"
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["assignee"] == "Alice"
    assert response.json()["cards"]["card-2"]["assignee"] is None


def test_assignee_can_be_cleared(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["assignee"] = "Bob"
    client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    board["cards"]["card-1"]["assignee"] = None
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["assignee"] is None


def test_assignee_rejects_empty_string(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["assignee"] = "   "
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422


def test_assignee_rejects_over_100_chars(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    headers = login(client)
    board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}/data", headers=headers).json()

    board["cards"]["card-1"]["assignee"] = "x" * 101
    response = client.put(f"/api/boards/{board_id}/data", json=board, headers=headers)

    assert response.status_code == 422
