"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

// pointerWithin returns droppables that contain the pointer, sorted by closest-edge
// distance (most specific target first). This correctly identifies an empty column
// section when the pointer is inside it, rather than picking a corner-close card in
// an adjacent column as closestCorners would.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCorners(args);
};
import { ActivityDrawer } from "@/components/ActivityDrawer";
import { AiChatSidebar } from "@/components/AiChatSidebar";
import { ArchiveDrawer } from "@/components/ArchiveDrawer";
import { BoardStats } from "@/components/BoardStats";
import { CardDetailModal } from "@/components/CardDetailModal";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { FilterBar, defaultFilter, isFilterActive, type FilterState } from "@/components/FilterBar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ApiError, archiveCard, fetchBoard, renameBoard, saveBoard } from "@/lib/api";
import {
  columnEndDropId,
  createId,
  initialData,
  matchesFilter,
  moveCard,
  sortCards,
  type BoardData,
  type Card,
} from "@/lib/kanban";

type KanbanBoardProps = {
  sessionToken: string;
  boardId: number;
  boardTitle: string;
  username?: string;
  onLogout: () => void;
  onSessionExpired: () => void;
  onBackToBoards: () => void;
};

const getClientY = (event: Event): number | null => {
  return "clientY" in event && typeof event.clientY === "number"
    ? event.clientY
    : null;
};

export const KanbanBoard = ({
  sessionToken,
  boardId,
  boardTitle,
  username,
  onLogout,
  onSessionExpired,
  onBackToBoards,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [filter, setFilter] = useState<FilterState>(defaultFilter);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(boardTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleBeforeEdit = useRef(boardTitle);
  const saveRequestId = useRef(0);
  const dragStartY = useRef<number | null>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);
  const filteredCardIds = useMemo(() => {
    if (!isFilterActive(filter)) return null;
    const ids = new Set<string>();
    for (const card of Object.values(board.cards)) {
      if (matchesFilter(card, filter.searchText, filter.priority, filter.dueDate, filter.label)) {
        ids.add(card.id);
      }
    }
    return ids;
  }, [board.cards, filter]);
  const saveStatusLabel =
    saveState === "saving" ? "Saving changes" : "All changes saved";

  useEffect(() => {
    let isCurrent = true;
    fetchBoard(sessionToken, boardId)
      .then((nextBoard) => {
        if (isCurrent) {
          setBoard(nextBoard);
          setLoadError("");
        }
      })
      .catch((error) => {
        if (isCurrent) {
          if (error instanceof ApiError && error.status === 401) {
            onSessionExpired();
            return;
          }
          setLoadError("Board could not be loaded.");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [sessionToken, boardId, onSessionExpired]);

  const commitBoard = (nextBoard: BoardData) => {
    setBoard(nextBoard);

    const requestId = saveRequestId.current + 1;
    saveRequestId.current = requestId;
    setSaveError("");
    setSaveState("saving");

    saveBoard(sessionToken, boardId, nextBoard)
      .then((savedBoard) => {
        if (saveRequestId.current === requestId) {
          setBoard(savedBoard);
          setSaveState("saved");
        }
      })
      .catch((error) => {
        if (saveRequestId.current === requestId) {
          if (error instanceof ApiError && error.status === 401) {
            onSessionExpired();
            return;
          }
          setSaveError("Board changes could not be saved.");
          setSaveState("idle");
        }
      });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
    dragStartY.current = getClientY(event.activatorEvent);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeRect = active.rect.current.translated ?? active.rect.current.initial;
    if (!activeRect) {
      return;
    }

    const pointerY =
      dragStartY.current === null
        ? activeRect.top + activeRect.height / 2
        : dragStartY.current + delta.y;
    const overCenterY = over.rect.top + over.rect.height / 2;
    const isOverColumn = board.columns.some(
      (column) => column.id === over.id || columnEndDropId(column.id) === over.id
    );
    const dropPosition =
      !isOverColumn && pointerY > overCenterY ? "after" : "before";
    dragStartY.current = null;

    commitBoard({
      ...board,
      columns: moveCard(
        board.columns,
        active.id as string,
        over.id as string,
        dropPosition
      ),
    });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    const nextBoard = {
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    };
    setBoard(nextBoard);
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => commitBoard(nextBoard), 400);
  };

  const handleAddCard = (columnId: string, title: string, details: string, dueDate?: string, priority?: Card["priority"]) => {
    const id = createId("card");
    commitBoard({
      ...board,
      cards: {
        ...board.cards,
        [id]: {
          id,
          title,
          details: details || "No details yet.",
          due_date: dueDate ?? null,
          priority: priority ?? null,
        },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    commitBoard({
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    });
  };

  const handleSaveTitle = async () => {
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(titleBeforeEdit.current);
      return;
    }
    if (trimmed === titleBeforeEdit.current) return;
    try {
      await renameBoard(sessionToken, boardId, trimmed);
      titleBeforeEdit.current = trimmed;
    } catch {
      setTitleDraft(titleBeforeEdit.current);
      setSaveError("Could not rename board.");
    }
  };

  const handleSaveCard = (updates: Pick<Card, "title" | "details" | "priority" | "due_date" | "labels">) => {
    if (!editingCardId) return;
    commitBoard({
      ...board,
      cards: {
        ...board.cards,
        [editingCardId]: { ...board.cards[editingCardId], ...updates },
      },
    });
  };

  const handleSetWipLimit = (columnId: string, limit: number | null) => {
    commitBoard({
      ...board,
      columns: board.columns.map((col) =>
        col.id === columnId ? { ...col, wip_limit: limit } : col
      ),
    });
  };

  const handleDuplicateCard = (columnId: string, cardId: string) => {
    const source = board.cards[cardId];
    if (!source) return;
    const newId = createId("card");
    commitBoard({
      ...board,
      cards: {
        ...board.cards,
        [newId]: { ...source, id: newId, title: `${source.title} (copy)` },
      },
      columns: board.columns.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cardIds: [
                ...col.cardIds.slice(0, col.cardIds.indexOf(cardId) + 1),
                newId,
                ...col.cardIds.slice(col.cardIds.indexOf(cardId) + 1),
              ],
            }
          : col
      ),
    });
  };

  const handleArchiveCard = async (cardId: string) => {
    try {
      const updatedBoard = await archiveCard(sessionToken, boardId, cardId);
      setBoard(updatedBoard);
      setSaveState("saved");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      setSaveError("Could not archive card.");
    }
  };

  const handleAiBoardUpdate = (nextBoard: BoardData) => {
    setBoard(nextBoard);
    setSaveError("");
    setSaveState("saved");
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Loading board
        </p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-6 py-12">
        <p className="text-sm font-semibold text-[var(--secondary-purple)]">
          {loadError}
        </p>
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-6 px-6 pb-10 pt-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-6 py-4 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToBoards}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
              aria-label="Back to boards"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M7.5 10.5L3 6l4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Boards
            </button>
            {isEditingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void handleSaveTitle()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveTitle();
                  if (e.key === "Escape") {
                    setTitleDraft(titleBeforeEdit.current);
                    setIsEditingTitle(false);
                  }
                }}
                className="font-display text-xl font-semibold text-[var(--navy-dark)] bg-transparent border-b-2 border-[var(--primary-blue)] outline-none min-w-0 max-w-xs"
                aria-label="Board title"
                autoFocus
              />
            ) : (
              <>
                <h1 className="font-display text-xl font-semibold text-[var(--navy-dark)] whitespace-nowrap truncate">
                  {titleDraft}
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    titleBeforeEdit.current = titleDraft;
                    setIsEditingTitle(true);
                  }}
                  aria-label="Rename board"
                  className="shrink-0 rounded-lg p-1 text-[var(--gray-text)] opacity-0 transition hover:bg-[var(--surface)] hover:opacity-100 focus:opacity-100"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L3.5 10.5l-3 .5.5-3 7.5-6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            )}
            {saveState !== "idle" ? (
              <div
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stroke)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--navy-dark)] shadow-sm whitespace-nowrap"
                role="status"
                aria-live="polite"
              >
                <span
                  className={
                    saveState === "saving"
                      ? "h-1.5 w-1.5 rounded-full bg-[var(--primary-blue)]"
                      : "h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]"
                  }
                />
                {saveStatusLabel}
              </div>
            ) : null}
            {saveError ? (
              <p className="text-sm font-semibold text-[var(--secondary-purple)]">
                {saveError}
              </p>
            ) : null}
          </div>

          <div className="hidden xl:flex items-center gap-2 flex-1 justify-center flex-wrap">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--navy-dark)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsActivityOpen(true)}
              aria-label="Open activity"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-medium text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7 4v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Activity
            </button>
            <button
              type="button"
              onClick={() => setIsArchiveOpen(true)}
              aria-label="Open archive"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-medium text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1 6h12M5 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Archive
            </button>
            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--primary-blue)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2v-2H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Chat
            </button>
            <button
              type="button"
              onClick={() => setIsChangingPassword(true)}
              aria-label="Change password"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-medium text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1.5 12.5c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {username ? <span className="max-w-[80px] truncate">{username}</span> : null}
            </button>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Log out"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5 12H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3M9.5 10L13 7l-3.5-3M13 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Log out
            </button>
          </div>
        </header>

        <BoardStats board={board} />
        <FilterBar filter={filter} onChange={setFilter} />

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto">
            <section className="grid grid-cols-5 gap-4 min-w-[960px]">
              {board.columns.map((column) => {
                const allCards = column.cardIds.map((cardId) => board.cards[cardId]).filter(Boolean);
                const filtered = filteredCardIds
                  ? allCards.filter((card) => filteredCardIds.has(card.id))
                  : allCards;
                const visibleCards = sortCards(filtered, filter.sortBy);
                return (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cards={visibleCards}
                    isFiltered={filteredCardIds !== null}
                    onRename={handleRenameColumn}
                    onAddCard={(colId, title, details, dueDate, priority) => handleAddCard(colId, title, details, dueDate, priority)}
                    onDeleteCard={handleDeleteCard}
                    onEditCard={setEditingCardId}
                    onArchiveCard={handleArchiveCard}
                    onDuplicateCard={handleDuplicateCard}
                    onSetWipLimit={handleSetWipLimit}
                  />
                );
              })}
            </section>
          </div>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[240px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {editingCardId && board.cards[editingCardId] ? (
          <CardDetailModal
            card={board.cards[editingCardId]}
            sessionToken={sessionToken}
            boardId={boardId}
            username={username}
            onSave={handleSaveCard}
            onClose={() => setEditingCardId(null)}
          />
        ) : null}

        {isChangingPassword ? (
          <ChangePasswordModal
            sessionToken={sessionToken}
            onClose={() => setIsChangingPassword(false)}
          />
        ) : null}

        {isActivityOpen ? (
          <ActivityDrawer
            sessionToken={sessionToken}
            boardId={boardId}
            onClose={() => setIsActivityOpen(false)}
          />
        ) : null}

        {isArchiveOpen ? (
          <ArchiveDrawer
            sessionToken={sessionToken}
            boardId={boardId}
            onClose={() => setIsArchiveOpen(false)}
            onRestore={(updatedBoard) => {
              setBoard(updatedBoard);
              setSaveState("saved");
            }}
          />
        ) : null}

        {isChatOpen ? (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/10"
              onClick={() => setIsChatOpen(false)}
            />
            <div className="fixed bottom-0 right-0 top-0 z-50 w-full sm:w-[380px]">
              <AiChatSidebar
                sessionToken={sessionToken}
                boardId={boardId}
                onBoardUpdate={handleAiBoardUpdate}
                onSessionExpired={onSessionExpired}
                onClose={() => setIsChatOpen(false)}
              />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
};
