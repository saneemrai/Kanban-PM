# Frontend notes

This directory contains the existing frontend-only Kanban demo for the Project Management MVP.

## Current stack

- NextJS 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4 through `@tailwindcss/postcss`
- `@dnd-kit` for drag and drop
- Vitest, React Testing Library, and jsdom for unit/component tests
- Playwright for browser tests

## Structure

- `src/app/page.tsx` renders the Kanban board.
- `src/components/AuthenticatedApp.tsx` owns the MVP sign in/logout state.
- `src/app/layout.tsx` defines metadata and loads Google fonts.
- `src/app/globals.css` contains Tailwind import, theme variables, and global styles.
- `src/components/KanbanBoard.tsx` owns the current in-memory board state and drag/drop handlers.
- `src/components/KanbanColumn.tsx` renders one droppable column, the editable column title, cards, and new card form.
- `src/components/KanbanCard.tsx` renders a sortable card and delete button.
- `src/components/KanbanCardPreview.tsx` renders the drag overlay preview.
- `src/components/NewCardForm.tsx` handles local card creation input.
- `src/lib/kanban.ts` contains the board types, initial demo data, ID creation, and `moveCard` helper.
- `src/test/` contains Vitest setup files.
- `tests/kanban.spec.ts` contains Playwright end-to-end coverage.

## Current behavior

- The app is a frontend-only demo behind a local MVP sign in screen.
- Sign in accepts only username `user` and password `password`.
- The MVP session is stored in browser `localStorage`.
- Board data starts from `initialData` in `src/lib/kanban.ts`.
- Board changes are stored only in React state and are lost on refresh.
- The board has five fixed columns.
- Column titles can be renamed.
- Cards can be added, removed, reordered, and moved across columns.
- There is no backend API, persistence, or AI chat yet.
- NextJS is configured for static export so the Docker build can serve `frontend/out` from FastAPI.

## Scripts

Run commands from the `frontend/` directory:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test:unit
npm run test:e2e
npm run test:all
```

## Testing guidance

- Use Vitest for pure logic and component behavior under `src/**/*.{test,spec}.{ts,tsx}`.
- Use Playwright for browser-level flows under `tests/`.
- Existing Playwright config starts the Next dev server on `127.0.0.1:3000`.
- Set `PLAYWRIGHT_BASE_URL` to run the same Playwright tests against an already running app, such as the Docker-served app on `http://127.0.0.1:8000`.
- Existing Playwright board tests sign in before asserting the board.
- When backend persistence is added, include refresh-based tests that prove board changes are saved.

## Implementation guidance

- Keep board shape compatible with `BoardData` unless the database design explicitly changes it.
- Keep API calls same-origin under `/api/*` once the FastAPI backend is serving the static frontend.
- Preserve the current color variables from `src/app/globals.css` unless the root project instructions change.
- Keep the MVP simple: do not add registration, multiple boards, model selection, chat streaming, or extra settings unless requested.
- Prefer focused changes to the existing components over broad redesigns.
