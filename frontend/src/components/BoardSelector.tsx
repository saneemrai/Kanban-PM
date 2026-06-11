"use client";

import { useState, type FormEvent } from "react";
import { ApiError, BOARD_TEMPLATES, createBoard, deleteBoard, type BoardSummary, type BoardTemplate } from "@/lib/api";

type BoardSelectorProps = {
  sessionToken: string;
  username: string;
  boards: BoardSummary[];
  onSelectBoard: (boardId: number) => void;
  onBoardsChanged: (boards: BoardSummary[]) => void;
  onSessionExpired: () => void;
  onLogout: () => void;
};

export const BoardSelector = ({
  sessionToken,
  username,
  boards,
  onSelectBoard,
  onBoardsChanged,
  onSessionExpired,
  onLogout,
}: BoardSelectorProps) => {
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<BoardTemplate>("default");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newBoardTitle.trim();
    if (!title || isCreating) return;

    setIsCreating(true);
    setCreateError("");
    try {
      const created = await createBoard(sessionToken, title, selectedTemplate);
      onBoardsChanged([...boards, created]);
      setNewBoardTitle("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      setCreateError("Board could not be created.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (boardId: number) => {
    if (boards.length <= 1) return;
    setDeletingId(boardId);
    try {
      await deleteBoard(sessionToken, boardId);
      onBoardsChanged(boards.filter((b) => b.id !== boardId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1100px] flex-col gap-8 px-6 pb-10 pt-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-6 py-4 shadow-[var(--shadow)] backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
              Kanban Studio
            </p>
            <h1 className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]">
              My Boards
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--gray-text)]">{username}</span>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5 12H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3M9.5 10L13 7l-3.5-3M13 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Log out
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <div
              key={board.id}
              className="group relative flex flex-col gap-4 rounded-2xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)] leading-tight">
                  {board.title}
                </h2>
                {boards.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(board.id)}
                    disabled={deletingId === board.id}
                    aria-label={`Delete ${board.title}`}
                    className="shrink-0 rounded-lg p-1.5 text-[var(--gray-text)] opacity-0 transition hover:bg-[var(--surface)] hover:text-[var(--secondary-purple)] group-hover:opacity-100 disabled:opacity-40"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M2 4h10M5 4V2.5A.5.5 0 0 1 5.5 2h3a.5.5 0 0 1 .5.5V4M6 7v4M8 7v4M3 4l.7 7.3A.7.7 0 0 0 4.4 12h5.2a.7.7 0 0 0 .7-.7L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
                <span className="text-xs font-medium text-[var(--gray-text)]">
                  {board.cardCount} {board.cardCount === 1 ? "card" : "cards"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onSelectBoard(board.id)}
                className="mt-auto w-full rounded-full bg-[var(--primary-blue)] px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
              >
                Open board
              </button>
            </div>
          ))}

          <div className="flex flex-col gap-4 rounded-2xl border-2 border-dashed border-[var(--stroke)] bg-white/50 p-6">
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              New board
            </h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <input
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                placeholder="Board title"
                maxLength={80}
                className="w-full border border-[var(--stroke)] px-3 py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
              <p className="text-xs font-semibold text-[var(--gray-text)] mt-1">Template</p>
              <div className="grid grid-cols-1 gap-2">
                {BOARD_TEMPLATES.map((tpl) => (
                  <label
                    key={tpl.value}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                      selectedTemplate === tpl.value
                        ? "border-[var(--primary-blue)] bg-[rgba(32,157,215,0.06)]"
                        : "border-[var(--stroke)] hover:border-[var(--primary-blue)]/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={tpl.value}
                      checked={selectedTemplate === tpl.value}
                      onChange={() => setSelectedTemplate(tpl.value)}
                      className="mt-0.5 accent-[var(--primary-blue)]"
                    />
                    <div>
                      <p className="text-xs font-semibold text-[var(--navy-dark)]">{tpl.label}</p>
                      <p className="text-[10px] text-[var(--gray-text)]">{tpl.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              {createError ? (
                <p className="text-xs font-semibold text-[var(--secondary-purple)]">
                  {createError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={isCreating || !newBoardTitle.trim()}
                className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isCreating ? "Creating" : "Create board"}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
};
