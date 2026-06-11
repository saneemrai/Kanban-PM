from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles

from app.ai_client import (
    AiChatPayload,
    call_ai_chat,
)
from app.board_store import (
    DEFAULT_DB_PATH,
    BoardSummary,
    LoginPayload,
    RegisterPayload,
    add_card_comment,
    archive_card,
    change_user_password,
    connect as db_connect,
    create_board,
    create_session,
    delete_board,
    delete_card_comment,
    delete_session,
    get_board,
    get_board_by_id,
    get_username_for_session,
    initialize_database,
    list_activity,
    list_archived_cards,
    list_boards,
    list_card_comments,
    register_user,
    rename_board,
    restore_card,
    save_board,
    save_board_by_id,
    _get_first_board_id,
)

STATIC_DIR = Path(__file__).parent / "static"


def create_app(static_dir: Path = STATIC_DIR, db_path: Path = DEFAULT_DB_PATH) -> FastAPI:
    app = FastAPI(title="Project Management API", docs_url=None, redoc_url=None)
    app.state.db_path = db_path
    initialize_database(db_path)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "project-management-api"}

    @app.post("/api/register", status_code=201)
    def register(payload: RegisterPayload):
        register_user(app.state.db_path, payload.username, payload.password)
        token = create_session(app.state.db_path, payload.username, payload.password)
        return {"username": payload.username, "sessionToken": token}

    @app.post("/api/login")
    def login(payload: LoginPayload):
        token = create_session(
            app.state.db_path,
            payload.username,
            payload.password,
        )
        return {"username": payload.username, "sessionToken": token}

    @app.post("/api/logout")
    def logout(x_pm_session: str | None = Header(default=None)):
        if x_pm_session is not None:
            delete_session(app.state.db_path, x_pm_session)
        return {"status": "ok"}

    @app.get("/api/session")
    def read_session(x_pm_session: str | None = Header(default=None)):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return {"username": username}

    @app.get("/api/boards")
    def read_boards(x_pm_session: str | None = Header(default=None)) -> list[BoardSummary]:
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return list_boards(app.state.db_path, username)

    @app.post("/api/boards", status_code=201)
    def create_new_board(
        payload: dict,
        x_pm_session: str | None = Header(default=None),
    ) -> BoardSummary:
        username = get_username_for_session(app.state.db_path, x_pm_session)
        title = payload.get("title", "").strip()
        if not title:
            raise HTTPException(status_code=422, detail="Board title is required.")
        return create_board(app.state.db_path, username, title)

    @app.patch("/api/boards/{board_id}")
    def update_board_meta(
        board_id: int,
        payload: dict,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        title = payload.get("title", "").strip()
        if not title:
            raise HTTPException(status_code=422, detail="Board title is required.")
        rename_board(app.state.db_path, username, board_id, title)
        return {"status": "ok"}

    @app.delete("/api/boards/{board_id}", status_code=204)
    def remove_board(
        board_id: int,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        delete_board(app.state.db_path, username, board_id)

    @app.get("/api/boards/{board_id}/data")
    def read_board_by_id(
        board_id: int,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return get_board_by_id(app.state.db_path, username, board_id).model_dump()

    @app.put("/api/boards/{board_id}/data")
    def update_board_by_id(
        board_id: int,
        payload: dict,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return save_board_by_id(
            app.state.db_path, username, board_id, payload
        ).model_dump()

    @app.post("/api/ai/chat")
    def chat_with_ai(
        payload: AiChatPayload,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        if payload.boardId is not None:
            board = get_board_by_id(app.state.db_path, username, payload.boardId)
        else:
            board = get_board(app.state.db_path, username)
        ai_response = call_ai_chat(payload, board)

        if ai_response.board is None:
            return {
                "message": ai_response.assistantMessage,
                "boardChanged": False,
                "board": None,
            }

        board_id = payload.boardId
        if board_id is None:
            with db_connect(app.state.db_path) as conn:
                board_id = _get_first_board_id(conn, username)

        try:
            saved_board = save_board_by_id(
                app.state.db_path, username, board_id, ai_response.board
            )
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

    @app.get("/api/boards/{board_id}/activity")
    def read_board_activity(
        board_id: int,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return list_activity(app.state.db_path, username, board_id)

    @app.get("/api/boards/{board_id}/archive")
    def read_archived_cards(
        board_id: int,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return list_archived_cards(app.state.db_path, username, board_id)

    @app.post("/api/boards/{board_id}/cards/{card_id}/archive")
    def archive_card_endpoint(
        board_id: int,
        card_id: str,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return archive_card(app.state.db_path, username, board_id, card_id).model_dump()

    @app.post("/api/boards/{board_id}/cards/{card_id}/restore")
    def restore_card_endpoint(
        board_id: int,
        card_id: str,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return restore_card(app.state.db_path, username, board_id, card_id).model_dump()

    @app.get("/api/boards/{board_id}/cards/{card_id}/comments")
    def read_card_comments(
        board_id: int,
        card_id: str,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        comments = list_card_comments(app.state.db_path, username, board_id, card_id)
        return [c.model_dump() for c in comments]

    @app.post("/api/boards/{board_id}/cards/{card_id}/comments", status_code=201)
    def create_card_comment(
        board_id: int,
        card_id: str,
        payload: dict,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        body = payload.get("body", "")
        comment = add_card_comment(
            app.state.db_path, username, board_id, card_id, body
        )
        return comment.model_dump()

    @app.delete("/api/boards/{board_id}/comments/{comment_id}", status_code=204)
    def remove_card_comment(
        board_id: int,
        comment_id: int,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        delete_card_comment(app.state.db_path, username, board_id, comment_id)

    @app.post("/api/user/password")
    def update_password(
        payload: dict,
        x_pm_session: str | None = Header(default=None),
    ):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        current = payload.get("currentPassword", "")
        new = payload.get("newPassword", "")
        change_user_password(app.state.db_path, username, current, new)
        return {"status": "ok"}

    # Backward-compat aliases (use first board)
    @app.get("/api/board")
    def read_board(x_pm_session: str | None = Header(default=None)):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return get_board(app.state.db_path, username).model_dump()

    @app.put("/api/board")
    def update_board(payload: dict, x_pm_session: str | None = Header(default=None)):
        username = get_username_for_session(app.state.db_path, x_pm_session)
        return save_board(app.state.db_path, username, payload).model_dump()

    app.mount(
        "/",
        StaticFiles(directory=static_dir, html=True),
        name="static",
    )

    return app


app = create_app()
