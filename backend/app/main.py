from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).parent / "static"


def create_app(static_dir: Path = STATIC_DIR) -> FastAPI:
    app = FastAPI(title="Project Management API")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "project-management-api"}

    app.mount(
        "/",
        StaticFiles(directory=static_dir, html=True),
        name="static",
    )

    return app


app = create_app()
