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


def test_ai_connectivity_route_returns_response(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.call_openrouter", lambda: "4")

    response = make_client(tmp_path).post("/api/ai/test")

    assert response.status_code == 200
    assert response.json() == {"model": OPENROUTER_MODEL, "response": "4"}


def test_ai_connectivity_route_returns_upstream_error(
    tmp_path: Path,
    monkeypatch,
) -> None:
    def fail_openrouter() -> str:
        raise HTTPException(status_code=502, detail="OpenRouter returned an error.")

    monkeypatch.setattr("app.main.call_openrouter", fail_openrouter)

    response = make_client(tmp_path).post("/api/ai/test")

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenRouter returned an error."}


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
