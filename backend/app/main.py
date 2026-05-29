from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles

from app.ai_client import (
    OPENROUTER_MODEL,
    AiChatPayload,
    call_ai_chat,
    call_openrouter,
)
from app.board_store import (
    DEFAULT_DB_PATH,
    LoginPayload,
    create_session,
    delete_session,
    get_username_for_session,
    initialize_database,
    get_board,
    save_board,
)

STATIC_DIR = Path(__file__).parent / "static"


def create_app(static_dir: Path = STATIC_DIR, db_path: Path = DEFAULT_DB_PATH) -> FastAPI:
    app = FastAPI(title="Project Management API")
    app.state.db_path = db_path

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "project-management-api"}

    @app.post("/api/ai/test")
    def test_ai_connectivity() -> dict[str, str]:
        return {
            "model": OPENROUTER_MODEL,
            "response": call_openrouter(),
        }

    @app.post("/api/ai/chat")
    def chat_with_ai(
        payload: AiChatPayload,
        x_pm_session: str | None = Header(default=None),
    ):
        initialize_database(app.state.db_path)
        username = get_username_for_session(app.state.db_path, x_pm_session)
        board = get_board(app.state.db_path, username)
        ai_response = call_ai_chat(payload, board)

        if ai_response.board is None:
            return {
                "message": ai_response.assistantMessage,
                "boardChanged": False,
                "board": None,
            }

        try:
            saved_board = save_board(app.state.db_path, username, ai_response.board)
        except HTTPException as error:
            if error.status_code == 422:
                raise HTTPException(
                    status_code=502,
                    detail="AI returned invalid board data.",
                ) from error
            raise
        return {
            "message": ai_response.assistantMessage,
            "boardChanged": True,
            "board": saved_board.model_dump(),
        }

    @app.post("/api/login")
    def login(payload: LoginPayload):
        initialize_database(app.state.db_path)
        token = create_session(
            app.state.db_path,
            payload.username,
            payload.password,
        )
        return {"username": payload.username, "sessionToken": token}

    @app.post("/api/logout")
    def logout(x_pm_session: str | None = Header(default=None)):
        initialize_database(app.state.db_path)
        if x_pm_session is not None:
            delete_session(app.state.db_path, x_pm_session)
        return {"status": "ok"}

    @app.get("/api/session")
    def read_session(x_pm_session: str | None = Header(default=None)):
        initialize_database(app.state.db_path)
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return {"username": username}

    @app.get("/api/board")
    def read_board(x_pm_session: str | None = Header(default=None)):
        initialize_database(app.state.db_path)
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return get_board(app.state.db_path, username).model_dump()

    @app.put("/api/board")
    def update_board(payload: dict, x_pm_session: str | None = Header(default=None)):
        initialize_database(app.state.db_path)
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return save_board(app.state.db_path, username, payload).model_dump()

    app.mount(
        "/",
        StaticFiles(directory=static_dir, html=True),
        name="static",
    )

    return app


app = create_app()
