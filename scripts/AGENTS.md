# Scripts notes

This folder contains Docker start and stop scripts for local development.

- `start.ps1` and `stop.ps1` are for Windows PowerShell.
- `start-mac.sh` and `stop-mac.sh` are for macOS.
- `start-linux.sh` and `stop-linux.sh` are for Linux.

All start scripts build the `pm-app` Docker image, replace any existing `pm-app` container, pass the project-root `.env` file to Docker, mount `backend/data` for SQLite persistence, and publish the app at `http://127.0.0.1:8000`.
