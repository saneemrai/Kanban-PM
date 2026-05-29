# Project Management MVP

## Run locally

Windows:

```bash
scripts/start.ps1
```

macOS:

```bash
bash scripts/start-mac.sh
```

Linux:

```bash
bash scripts/start-linux.sh
```

Open `http://127.0.0.1:8000`.

SQLite data is stored under `backend/data`.

## Stop locally

Windows:

```bash
scripts/stop.ps1
```

macOS:

```bash
bash scripts/stop-mac.sh
```

Linux:

```bash
bash scripts/stop-linux.sh
```

## Backend tests

```bash
cd backend
uv sync
uv run pytest
```
