import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card, Priority } from "@/lib/kanban";

const PRIORITY_BADGE: Record<Priority, string> = {
  low: "bg-[rgba(32,157,215,0.12)] text-[var(--primary-blue)]",
  medium: "bg-[rgba(236,173,10,0.15)] text-[#a07800]",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group rounded-2xl border border-transparent bg-white px-4 py-3.5 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {card.priority ? (
            <span
              className={clsx(
                "mb-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                PRIORITY_BADGE[card.priority]
              )}
            >
              {card.priority}
            </span>
          ) : null}
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)] leading-snug">
            {card.title}
          </h4>
          <p className="mt-1.5 text-sm leading-5 text-[var(--gray-text)]">
            {card.details}
          </p>
        </div>
        <div className="mt-0.5 flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => onEdit(card.id)}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg p-1.5 text-[var(--gray-text)] opacity-0 transition-all hover:bg-[var(--surface)] hover:text-[var(--navy-dark)] group-hover:opacity-100"
            aria-label={`Edit ${card.title}`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L3.5 10.5l-3 .5.5-3 7.5-6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onDelete(card.id)}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg p-1.5 text-[var(--gray-text)] opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
            aria-label={`Delete ${card.title}`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
};
