from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles

from app.board_store import (
    DEFAULT_DB_PATH,
    MVP_USERNAME,
    initialize_database,
    get_board,
    save_board,
)

STATIC_DIR = Path(__file__).parent / "static"


def get_current_username(x_pm_user: str | None = Header(default=None)) -> str:
    if x_pm_user is None:
        raise HTTPException(status_code=401, detail="Missing user session.")
    if x_pm_user != MVP_USERNAME:
        raise HTTPException(status_code=401, detail="Invalid user session.")
    return x_pm_user


def create_app(static_dir: Path = STATIC_DIR, db_path: Path = DEFAULT_DB_PATH) -> FastAPI:
    app = FastAPI(title="Project Management API")
    app.state.db_path = db_path

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "project-management-api"}

    @app.get("/api/board")
    def read_board(x_pm_user: str | None = Header(default=None)):
        username = get_current_username(x_pm_user)
        initialize_database(app.state.db_path)
        return get_board(app.state.db_path, username).model_dump()

    @app.put("/api/board")
    def update_board(payload: dict, x_pm_user: str | None = Header(default=None)):
        username = get_current_username(x_pm_user)
        initialize_database(app.state.db_path)
        return save_board(app.state.db_path, username, payload).model_dump()

    app.mount(
        "/",
        StaticFiles(directory=static_dir, html=True),
        name="static",
    )

    return app


app = create_app()
