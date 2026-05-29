# Project plan

This plan covers the full MVP for the local Project Management web app. Work should proceed part by part. Do not start implementation for a later part until the current part is complete, tested, and accepted where an approval gate is listed.

## Part 1: Plan

Goal: turn the high-level project outline into an executable plan and document the existing frontend demo.

Checklist:
- [x] Expand `docs/PLAN.md` into detailed steps for the full project.
- [x] Include tests and success criteria for every part.
- [x] Create `frontend/AGENTS.md` describing the current frontend structure, conventions, scripts, and test stack.
- [x] Confirm `.env` at the project root is the source of truth for `OPENROUTER_API_KEY`.
- [x] Confirm SQLite is the database choice.
- [x] Confirm the simplest available local default ports will be used.
- [x] Get user approval before Part 2 begins.

Tests:
- Documentation-only change; no automated test run is required.
- Manually review the plan for consistency with `AGENTS.md`.

Success criteria:
- The plan is clear enough for an agent to execute from scaffolding through AI chat.
- `frontend/AGENTS.md` accurately reflects the current frontend demo.
- The user approves moving to Part 2.

## Part 2: Scaffolding

Goal: create the local Docker and FastAPI foundation before integrating the real frontend.

Checklist:
- [x] Review the current repository layout and existing `backend/` and `scripts/` contents.
- [x] Create a minimal FastAPI backend in `backend/`.
- [x] Add a health API route, such as `GET /api/health`.
- [x] Serve a temporary static HTML page from `/`.
- [x] Add Docker infrastructure for a single local container.
- [x] Use `uv` for Python dependency management inside the container.
- [x] Add start and stop scripts for Windows, macOS, and Linux in `scripts/`.
- [x] Keep runtime configuration simple and read environment variables from the project-root `.env`.
- [x] Document minimal local usage in the root README if a root README exists, or create a concise one if needed.

Tests:
- [x] Backend unit test verifies the health API response.
- [x] Backend integration test verifies `/` serves the temporary HTML.
- [x] Docker build completes successfully.
- [x] Container starts locally through the relevant start script.
- [x] A browser or HTTP request can load `/` and call `/api/health`.
- [x] Stop script stops the running local container.

Success criteria:
- The app runs locally in Docker.
- `/` returns the temporary page.
- `/api/health` returns a successful JSON response.
- Start and stop scripts work on at least the current development platform, with scripts present for all required platforms.

## Part 3: Add In Frontend

Goal: statically build the existing NextJS frontend and serve it from FastAPI at `/`.

Checklist:
- [x] Review the current frontend build output options.
- [x] Configure NextJS for static export if required.
- [x] Update Docker build steps to install frontend dependencies and build the static site.
- [x] Copy the frontend static output into the backend-served static directory.
- [x] Replace the temporary static HTML with the built Kanban app.
- [x] Preserve the current Kanban behavior: five columns, rename columns, add cards, remove cards, drag and drop cards.
- [x] Keep API routes under `/api/*` so they do not conflict with static frontend routing.

Tests:
- [x] Run frontend unit/component tests with Vitest.
- [x] Run frontend Playwright tests against the frontend in development mode.
- [x] Add or update an integration test that verifies FastAPI serves the built frontend at `/`.
- [x] Run Docker build and confirm the container serves the built frontend.
- [x] Run Playwright against the Docker-served app if practical.

Success criteria:
- Loading `/` from the Docker container shows the Kanban board.
- Existing frontend tests pass.
- FastAPI still serves `/api/health`.
- No frontend-only dev server is required for normal local container usage.

## Part 4: Fake User Sign In Experience

Goal: require a local MVP sign in before showing the Kanban board.

Checklist:
- [x] Add a sign in screen at `/` when no user session is active.
- [x] Accept only username `user` and password `password`.
- [x] Store the MVP session in the simplest appropriate local mechanism.
- [x] Show the Kanban board after successful sign in.
- [x] Add a logout control that returns the user to the sign in screen.
- [x] Keep the database model ready for multiple users later, even though only one hardcoded user can sign in now.
- [x] Avoid adding user registration, password reset, roles, or other non-MVP auth features.

Tests:
- [x] Unit/component test verifies sign in form validation and successful sign in.
- [x] Unit/component test verifies logout.
- [x] Playwright test verifies `/` initially shows sign in.
- [x] Playwright test verifies invalid credentials are rejected.
- [x] Playwright test verifies valid credentials show the Kanban board.
- [x] Playwright test verifies logout returns to sign in.

Success criteria:
- Anonymous users cannot see the board.
- `user` / `password` signs in successfully.
- Logout works.
- Existing Kanban tests are updated for the authenticated flow and pass.

## Part 5: Database Modeling

Goal: propose and document the SQLite persistence approach before writing backend persistence code.

Checklist:
- [x] Create a database design document in `docs/`.
- [x] Use SQLite as the local database.
- [x] Model users so the database can support multiple users later.
- [x] Model one board per signed-in user for the MVP.
- [x] Store Kanban data in normalized board, column, and card tables.
- [x] Define how API board data maps to columns, cards, and ordering.
- [x] Define how initial seed data is created for the hardcoded user.
- [x] Define basic migration or initialization behavior for a missing database.
- [x] Get user approval before Part 6 begins.

Tests:
- Documentation-only part; no automated test run is required.
- Review the schema proposal against current frontend `BoardData`.

Success criteria:
- The database design is documented clearly.
- The design supports the MVP without over-engineering.
- The user approves the database approach.

## Part 6: Backend

Goal: add backend persistence APIs for reading and changing the Kanban board for the signed-in user.

Checklist:
- [x] Implement SQLite database initialization when the database file does not exist.
- [x] Create the hardcoded MVP user during initialization if missing.
- [x] Store one normalized board for the user across board, column, and card tables.
- [x] Add `GET /api/board` for the current user.
- [x] Add `PUT /api/board` or equivalent simple update route for replacing the current board data.
- [x] Add focused validation for the board data shape.
- [x] Keep API auth simple and aligned with Part 4's MVP session approach.
- [x] Return clear HTTP errors for invalid credentials, missing session, and invalid board data.
- [x] Avoid partial card-specific endpoints unless required by frontend integration.

Tests:
- [x] Backend unit tests for database initialization.
- [x] Backend unit tests for seed user and seed board creation.
- [x] Backend API tests for reading the board.
- [x] Backend API tests for updating the board.
- [x] Backend API tests for invalid board payloads.
- [x] Backend API tests verify persistence across app/database access.

Success criteria:
- A missing database is created automatically.
- The hardcoded user has a board.
- Board reads and writes work through the API.
- Backend tests pass.

## Part 7: Frontend + Backend

Goal: connect the frontend Kanban UI to the backend API so the board is persistent.

Checklist:
- [x] Replace local-only initial board state with API loading after sign in.
- [x] Save column renames to the backend.
- [x] Save card creation to the backend.
- [x] Save card deletion to the backend.
- [x] Save drag and drop moves to the backend.
- [x] Add simple loading and error states.
- [x] Keep the UI responsive and avoid broad redesign work.
- [x] Ensure static frontend API calls use the same origin under `/api/*`.

Tests:
- [x] Frontend unit/component tests for API-backed board loading and updates.
- [x] Playwright test verifies sign in, board load, edit, refresh, and persistence.
- [x] Playwright test verifies drag and drop persistence after refresh.
- [x] Backend tests continue to pass.
- [x] Docker-served integration flow works locally.

Success criteria:
- The board persists after browser refresh.
- All existing Kanban interactions still work.
- The frontend uses backend APIs rather than local seed state as the source of truth.

## Part 8: AI Connectivity

Goal: prove the backend can call OpenRouter with the configured model.

Checklist:
- [x] Read `OPENROUTER_API_KEY` from the project-root `.env`.
- [x] Use OpenRouter with model `openai/gpt-oss-120b`.
- [x] Add a minimal backend AI route or test utility for connectivity.
- [x] Run a simple `2+2` connectivity check.
- [x] Keep secrets out of logs, code, and committed files.
- [x] Document required environment variable names concisely.

Tests:
- [x] Unit test verifies AI client configuration without making a network call.
- [x] Mocked backend test verifies the AI route handles a successful response.
- [x] Mocked backend test verifies an upstream AI error returns a clear backend error.
- [x] Manual or explicitly marked integration test verifies the real `2+2` OpenRouter call when an API key is available.

Success criteria:
- [x] Backend AI client is configured for OpenRouter.
- [x] A real connectivity check can succeed with the project-root `.env` key.
- [x] Normal automated tests do not require live OpenRouter access.

## Part 9: AI Board Updates

Goal: send board context and chat history to the AI, then apply structured board updates when returned.

Checklist:
- [ ] Define the AI request shape: user message, conversation history, and current board JSON.
- [ ] Define the structured AI response shape: assistant message plus optional board JSON update.
- [ ] Instruct the model to preserve valid board structure and fixed columns.
- [ ] Validate any returned board update before saving it.
- [ ] Save a valid AI-updated board to SQLite.
- [ ] Return the assistant response and whether the board changed.
- [ ] Reject invalid AI board updates without corrupting stored board data.
- [ ] Keep the first version simple: full-board JSON replacement is acceptable for MVP.

Tests:
- [ ] Unit test for prompt/request construction.
- [ ] Unit test for structured response parsing.
- [ ] Unit test for valid board update application.
- [ ] Unit test for invalid board update rejection.
- [ ] Mocked API test verifies chat response without board changes.
- [ ] Mocked API test verifies chat response with board changes.
- [ ] Persistence test verifies AI board changes are saved.

Success criteria:
- The backend sends the AI enough context to reason about the board.
- The AI can create, edit, or move one or more cards through structured output.
- Invalid AI output does not damage persisted board state.

## Part 10: AI Chat Sidebar

Goal: add the AI chat UI and refresh the Kanban board when the AI changes it.

Checklist:
- [ ] Add a sidebar chat widget to the Kanban screen.
- [ ] Support sending user messages and rendering assistant responses.
- [ ] Keep conversation history in the frontend for the active session.
- [ ] Call the backend AI chat endpoint with the current message and history.
- [ ] Show clear pending and error states.
- [ ] Refresh or replace the board state automatically when the backend reports a board update.
- [ ] Preserve existing Kanban interactions while the sidebar is present.
- [ ] Keep the visual style aligned with the defined color scheme and existing frontend.
- [ ] Avoid non-MVP chat features such as streaming, file upload, multiple conversations, or model selection unless explicitly requested.

Tests:
- [ ] Frontend unit/component tests for chat rendering and submit behavior.
- [ ] Frontend unit/component tests for board refresh after AI update.
- [ ] Playwright test verifies user can sign in, send chat, receive response, and continue using the board.
- [ ] Playwright test verifies an AI-created or moved card appears after the mocked AI response.
- [ ] Backend mocked AI tests continue to pass.
- [ ] Docker-served end-to-end smoke test passes.

Success criteria:
- The sidebar supports a complete AI chat loop.
- The AI can update the persisted Kanban board through the backend.
- The UI refreshes automatically after AI updates.
- The completed MVP runs locally in Docker.
