from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient

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
