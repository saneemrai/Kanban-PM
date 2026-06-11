import { useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { columnEndDropId, type Card, type Column, type Priority } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import type { BoardLabel } from "@/lib/api";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  isFiltered?: boolean;
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string, dueDate?: string, priority?: Priority) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string) => void;
  onArchiveCard?: (cardId: string) => void;
  onDuplicateCard?: (columnId: string, cardId: string) => void;
  onSetWipLimit?: (columnId: string, limit: number | null) => void;
  onMoveCard?: (cardId: string, toColumnId: string) => void;
  allColumns?: { id: string; title: string }[];
  boardLabels?: BoardLabel[];
};

export const KanbanColumn = ({
  column,
  cards,
  isFiltered = false,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onArchiveCard,
  onDuplicateCard,
  onSetWipLimit,
  onMoveCard,
  allColumns,
  boardLabels,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const { setNodeRef: setEndDropRef, isOver: isEndOver } = useDroppable({
    id: columnEndDropId(column.id),
  });
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");

  const totalCards = column.cardIds.length;
  const wipLimit = column.wip_limit ?? null;
  const wipExceeded = wipLimit !== null && totalCards > wipLimit;
  const wipAtLimit = wipLimit !== null && totalCards === wipLimit;
  const totalPoints = cards.reduce((sum, c) => sum + (c.estimate ?? 0), 0);

  const countLabel = isFiltered
    ? `${cards.length} ${cards.length === 1 ? "match" : "matches"}`
    : wipLimit !== null
      ? `${totalCards} / ${wipLimit}`
      : `${cards.length} ${cards.length === 1 ? "card" : "cards"}`;

  const barColor = wipExceeded
    ? "bg-red-400"
    : wipAtLimit
      ? "bg-[var(--accent-yellow)]"
      : "bg-[var(--accent-yellow)]";

  const countColor = wipExceeded
    ? "text-red-500"
    : wipAtLimit
      ? "text-[var(--accent-yellow)]"
      : "text-[var(--gray-text)]";

  const handleLimitSubmit = () => {
    const val = parseInt(limitDraft, 10);
    if (!limitDraft.trim()) {
      onSetWipLimit?.(column.id, null);
    } else if (!isNaN(val) && val >= 1) {
      onSetWipLimit?.(column.id, val);
    }
    setIsEditingLimit(false);
    setLimitDraft("");
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]",
        wipExceeded && "ring-2 ring-red-300"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className={clsx("h-2 w-10 rounded-full", barColor)} />
            <span className={clsx("text-xs font-semibold uppercase tracking-[0.2em]", countColor)}>
              {countLabel}
            </span>
            {wipExceeded && (
              <span className="text-xs font-bold text-red-500 uppercase tracking-wide">over</span>
            )}
            {totalPoints > 0 && (
              <span className="text-xs font-semibold text-[var(--secondary-purple)]">
                {totalPoints} SP
              </span>
            )}
            {isEditingLimit ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => { e.preventDefault(); handleLimitSubmit(); }}
              >
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={limitDraft}
                  onChange={(e) => setLimitDraft(e.target.value)}
                  placeholder={wipLimit !== null ? String(wipLimit) : "limit"}
                  className="w-14 rounded border border-[var(--stroke)] bg-white px-1.5 py-0.5 text-xs text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                  aria-label="WIP limit"
                  autoFocus
                />
                <button
                  type="submit"
                  className="text-xs font-semibold text-[var(--primary-blue)] hover:underline"
                  aria-label="Set WIP limit"
                >
                  set
                </button>
                {wipLimit !== null && (
                  <button
                    type="button"
                    onClick={() => { onSetWipLimit?.(column.id, null); setIsEditingLimit(false); setLimitDraft(""); }}
                    className="text-xs font-semibold text-[var(--gray-text)] hover:text-red-500"
                    aria-label="Clear WIP limit"
                  >
                    clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setIsEditingLimit(false); setLimitDraft(""); }}
                  className="text-xs text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                  aria-label="Cancel"
                >
                  cancel
                </button>
              </form>
            ) : onSetWipLimit ? (
              <button
                type="button"
                onClick={() => { setIsEditingLimit(true); setLimitDraft(wipLimit !== null ? String(wipLimit) : ""); }}
                aria-label={wipLimit !== null ? "Edit WIP limit" : "Set WIP limit"}
                className="rounded px-1 text-xs text-[var(--gray-text)] opacity-0 transition hover:bg-[var(--surface)] hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
              >
                {wipLimit !== null ? (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L3.5 10.5l-3 .5.5-3 7.5-6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
            ) : null}
          </div>
          <input
            value={column.title}
            onChange={(event) => onRename(column.id, event.target.value)}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
              onArchive={onArchiveCard}
              onDuplicate={onDuplicateCard ? (cardId) => onDuplicateCard(column.id, cardId) : undefined}
              onMove={onMoveCard ? (toColumnId) => onMoveCard(card.id, toColumnId) : undefined}
              otherColumns={allColumns ? allColumns.filter((c) => c.id !== column.id) : undefined}
              boardLabels={boardLabels}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {isFiltered ? "No matches" : "Drop a card here"}
          </div>
        )}
        <div
          ref={setEndDropRef}
          className={clsx(
            "min-h-10 rounded-2xl border border-dashed border-transparent transition",
            isEndOver && "border-[var(--accent-yellow)] bg-[rgba(236,173,10,0.08)]"
          )}
          data-testid={`drop-end-${column.id}`}
        />
      </div>
      <NewCardForm
        onAdd={(title, details, dueDate, priority) => onAddCard(column.id, title, details, dueDate, priority)}
      />
    </section>
  );
};
