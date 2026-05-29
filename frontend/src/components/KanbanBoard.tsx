"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ApiError, fetchBoard, saveBoard } from "@/lib/api";
import {
  columnEndDropId,
  createId,
  initialData,
  moveCard,
  type BoardData,
} from "@/lib/kanban";

type KanbanBoardProps = {
  sessionToken?: string;
  onLogout?: () => void;
  onSessionExpired?: () => void;
};

const getClientY = (event: Event): number | null => {
  return "clientY" in event && typeof event.clientY === "number"
    ? event.clientY
    : null;
};

export const KanbanBoard = ({
  sessionToken,
  onLogout,
  onSessionExpired,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(sessionToken));
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveRequestId = useRef(0);
  const dragStartY = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);
  const saveStatusLabel =
    saveState === "saving" ? "Saving changes" : "All changes saved";

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    let isCurrent = true;
    fetchBoard(sessionToken)
      .then((nextBoard) => {
        if (isCurrent) {
          setBoard(nextBoard);
          setLoadError("");
        }
      })
      .catch((error) => {
        if (isCurrent) {
          if (error instanceof ApiError && error.status === 401) {
            onSessionExpired?.();
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
  }, [sessionToken, onSessionExpired]);

  const commitBoard = (nextBoard: BoardData) => {
    setBoard(nextBoard);
    if (!sessionToken) {
      return;
    }

    const requestId = saveRequestId.current + 1;
    saveRequestId.current = requestId;
    setSaveError("");
    setSaveState("saving");

    saveBoard(sessionToken, nextBoard)
      .then((savedBoard) => {
        if (saveRequestId.current === requestId) {
          setBoard(savedBoard);
          setSaveState("saved");
        }
      })
      .catch((error) => {
        if (saveRequestId.current === requestId) {
          if (error instanceof ApiError && error.status === 401) {
            onSessionExpired?.();
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
    commitBoard({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    });
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    commitBoard({
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details: details || "No details yet." },
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

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                  Single Board Kanban
                </p>
                {sessionToken && saveState !== "idle" ? (
                  <div
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-white px-3 py-1 text-xs font-semibold text-[var(--navy-dark)] shadow-[0_8px_18px_rgba(3,33,71,0.06)]"
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className={
                        saveState === "saving"
                          ? "h-2 w-2 rounded-full bg-[var(--primary-blue)]"
                          : "h-2 w-2 rounded-full bg-[var(--accent-yellow)]"
                      }
                    />
                    {saveStatusLabel}
                  </div>
                ) : null}
              </div>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
              {saveError ? (
                <p className="mt-3 text-sm font-semibold text-[var(--secondary-purple)]">
                  {saveError}
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="mt-4 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                >
                  Log out
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
