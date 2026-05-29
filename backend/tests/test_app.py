from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def test_health_api_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "project-management-api",
    }


def test_root_serves_static_frontend(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<h1>Kanban Studio</h1>", encoding="utf-8")

    response = TestClient(create_app(tmp_path)).get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Kanban Studio" in response.text
