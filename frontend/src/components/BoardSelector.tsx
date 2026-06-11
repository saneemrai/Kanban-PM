"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, BOARD_TEMPLATES, createBoard, deleteBoard, searchAll, updateBoardMeta, type BoardSummary, type BoardTemplate, type SearchResult } from "@/lib/api";

type BoardSelectorProps = {
  sessionToken: string;
  username: string;
  boards: BoardSummary[];
  onSelectBoard: (boardId: number) => void;
  onBoardsChanged: (boards: BoardSummary[]) => void;
  onSessionExpired: () => void;
  onLogout: () => void;
};

type EditState = { title: string; description: string };

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
  const [newBoardDescription, setNewBoardDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<BoardTemplate>("default");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ title: "", description: "" });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchAll(sessionToken, searchQuery.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, sessionToken]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newBoardTitle.trim();
    if (!title || isCreating) return;

    setIsCreating(true);
    setCreateError("");
    try {
      const created = await createBoard(sessionToken, title, selectedTemplate, newBoardDescription.trim());
      onBoardsChanged([...boards, created]);
      setNewBoardTitle("");
      setNewBoardDescription("");
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

  const startEdit = (board: BoardSummary) => {
    setEditingId(board.id);
    setEditState({ title: board.title, description: board.description });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (boardId: number) => {
    const title = editState.title.trim();
    if (!title || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await updateBoardMeta(sessionToken, boardId, title, editState.description.trim());
      onBoardsChanged(
        boards.map((b) =>
          b.id === boardId ? { ...b, title, description: editState.description.trim() } : b
        )
      );
      setEditingId(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
    } finally {
      setIsSavingEdit(false);
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

        <div className="relative">
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 shadow-[var(--shadow)]">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-[var(--gray-text)]">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search boards and cards..."
              aria-label="Search boards and cards"
              className="flex-1 bg-transparent text-sm font-medium text-[var(--navy-dark)] outline-none placeholder:text-[var(--gray-text)]"
            />
            {isSearching ? (
              <span className="text-xs text-[var(--gray-text)]">Searching...</span>
            ) : null}
          </div>
          {searchQuery.trim().length >= 2 ? (
            <div className="mt-2 rounded-2xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]">
              {searchResults.length === 0 && !isSearching ? (
                <p className="px-4 py-3 text-sm text-[var(--gray-text)]">No results found.</p>
              ) : (
                <ul role="list" aria-label="Search results">
                  {searchResults.map((result, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          onSelectBoard(result.boardId);
                        }}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface)] first:rounded-t-2xl last:rounded-b-2xl"
                      >
                        {result.type === "board" ? (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary-blue)]">
                            <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                            <path d="M1 5.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            <path d="M4 8.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--secondary-purple)]">
                            <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                            <path d="M4 5h6M4 8h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--navy-dark)]">
                            {result.type === "card" ? result.cardTitle : result.boardTitle}
                          </p>
                          <p className="truncate text-xs text-[var(--gray-text)]">
                            {result.type === "card"
                              ? `${result.boardTitle} · ${result.columnTitle}`
                              : "Board"}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <div
              key={board.id}
              className="group relative flex flex-col gap-4 rounded-2xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]"
            >
              {editingId === board.id ? (
                <div className="flex flex-col gap-3">
                  <input
                    value={editState.title}
                    onChange={(e) => setEditState((s) => ({ ...s, title: e.target.value }))}
                    maxLength={80}
                    aria-label="Board title"
                    autoFocus
                    className="w-full border border-[var(--stroke)] px-3 py-2 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  />
                  <textarea
                    value={editState.description}
                    onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                    maxLength={300}
                    rows={2}
                    placeholder="Board description (optional)"
                    aria-label="Board description"
                    className="w-full resize-none border border-[var(--stroke)] px-3 py-2 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(board.id)}
                      disabled={isSavingEdit || !editState.title.trim()}
                      className="flex-1 rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)] leading-tight">
                        {board.title}
                      </h2>
                      {board.description ? (
                        <p className="mt-1 text-xs text-[var(--gray-text)] line-clamp-2">
                          {board.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(board)}
                        aria-label={`Edit ${board.title}`}
                        className="rounded-lg p-1.5 text-[var(--gray-text)] opacity-0 transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)] group-hover:opacity-100"
                      >
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {boards.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(board.id)}
                          disabled={deletingId === board.id}
                          aria-label={`Delete ${board.title}`}
                          className="rounded-lg p-1.5 text-[var(--gray-text)] opacity-0 transition hover:bg-[var(--surface)] hover:text-[var(--secondary-purple)] group-hover:opacity-100 disabled:opacity-40"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="M2 4h10M5 4V2.5A.5.5 0 0 1 5.5 2h3a.5.5 0 0 1 .5.5V4M6 7v4M8 7v4M3 4l.7 7.3A.7.7 0 0 0 4.4 12h5.2a.7.7 0 0 0 .7-.7L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
                    <span className="text-xs font-medium text-[var(--gray-text)]">
                      {board.cardCount} {board.cardCount === 1 ? "card" : "cards"}
                    </span>
                    {board.overdueCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        {board.overdueCount} overdue
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectBoard(board.id)}
                    className="mt-auto w-full rounded-full bg-[var(--primary-blue)] px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                  >
                    Open board
                  </button>
                </>
              )}
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
                aria-label="New board title"
                className="w-full border border-[var(--stroke)] px-3 py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
              <textarea
                value={newBoardDescription}
                onChange={(e) => setNewBoardDescription(e.target.value)}
                placeholder="Description (optional)"
                maxLength={300}
                rows={2}
                aria-label="New board description"
                className="w-full resize-none border border-[var(--stroke)] px-3 py-2 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
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
