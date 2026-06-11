import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card, Priority } from "@/lib/kanban";

const CARD_COLORS: Record<string, string> = {
  red: "border-l-4 border-l-red-400",
  orange: "border-l-4 border-l-orange-400",
  yellow: "border-l-4 border-l-yellow-400",
  green: "border-l-4 border-l-green-400",
  blue: "border-l-4 border-l-blue-400",
  purple: "border-l-4 border-l-purple-400",
  pink: "border-l-4 border-l-pink-400",
  gray: "border-l-4 border-l-gray-400",
};

const LABEL_COLORS = [
  "bg-[rgba(32,157,215,0.15)] text-[var(--primary-blue)]",
  "bg-[rgba(117,57,145,0.15)] text-[var(--secondary-purple)]",
  "bg-orange-100 text-orange-700",
  "bg-green-100 text-green-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
];

const labelColor = (label: string) =>
  LABEL_COLORS[
    label.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % LABEL_COLORS.length
  ];

const PRIORITY_BADGE: Record<Priority, string> = {
  low: "bg-[rgba(32,157,215,0.12)] text-[var(--primary-blue)]",
  medium: "bg-[rgba(236,173,10,0.15)] text-[#a07800]",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const formatDueDate = (due: string): { label: string; style: string } => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = due.split("-").map(Number);
  const dueDay = new Date(y, m - 1, d);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      label: diffDays === -1 ? "Due yesterday" : `${Math.abs(diffDays)}d overdue`,
      style: "bg-red-100 text-red-700",
    };
  }
  if (diffDays === 0) {
    return { label: "Due today", style: "bg-[rgba(236,173,10,0.2)] text-[#a07800]" };
  }
  if (diffDays === 1) {
    return { label: "Due tomorrow", style: "bg-orange-100 text-orange-700" };
  }
  const fmt = dueDay.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label: `Due ${fmt}`, style: "bg-[rgba(32,157,215,0.12)] text-[var(--primary-blue)]" };
};

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string) => void;
  onArchive?: (cardId: string) => void;
  onDuplicate?: (cardId: string) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit, onArchive, onDuplicate }: KanbanCardProps) => {
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
        card.color && CARD_COLORS[card.color],
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {card.labels && card.labels.length > 0 ? (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {card.labels.map((label) => (
                <span
                  key={label}
                  className={clsx(
                    "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    labelColor(label)
                  )}
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mb-1.5 flex flex-wrap gap-1">
            {card.priority ? (
              <span
                className={clsx(
                  "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  PRIORITY_BADGE[card.priority]
                )}
              >
                {card.priority}
              </span>
            ) : null}
            {card.due_date ? (() => {
              const { label, style } = formatDueDate(card.due_date);
              return (
                <span className={clsx("inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide", style)}>
                  {label}
                </span>
              );
            })() : null}
            {card.estimate != null ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[rgba(117,57,145,0.12)] px-2 py-0.5 text-[10px] font-bold text-[var(--secondary-purple)]">
                {card.estimate} SP
              </span>
            ) : null}
          </div>
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)] leading-snug">
            {card.title}
          </h4>
          <p className="mt-1.5 text-sm leading-5 text-[var(--gray-text)]">
            {card.details}
          </p>
          {card.assignee ? (
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--secondary-purple)] text-[9px] font-bold uppercase text-white"
                aria-hidden="true"
              >
                {card.assignee[0]}
              </span>
              <span className="text-xs font-medium text-[var(--gray-text)]">{card.assignee}</span>
            </div>
          ) : null}
        </div>
        <div className="mt-0.5 flex shrink-0 flex-col gap-1">
          {onDuplicate ? (
            <button
              type="button"
              onClick={() => onDuplicate(card.id)}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-lg p-1.5 text-[var(--gray-text)] opacity-0 transition-all hover:bg-[var(--surface)] hover:text-[var(--navy-dark)] group-hover:opacity-100"
              aria-label={`Duplicate ${card.title}`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="1" y="3" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M4 3V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          ) : null}
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
          {onArchive ? (
            <button
              type="button"
              onClick={() => onArchive(card.id)}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-lg p-1.5 text-[var(--gray-text)] opacity-0 transition-all hover:bg-[rgba(236,173,10,0.12)] hover:text-[#a07800] group-hover:opacity-100"
              aria-label={`Archive ${card.title}`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="1" y="2" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M1 5h10M4 7.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          ) : null}
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
