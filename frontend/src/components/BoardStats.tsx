"use client";

import type { BoardData } from "@/lib/kanban";

type BoardStatsProps = {
  board: BoardData;
};

export const BoardStats = ({ board }: BoardStatsProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cards = Object.values(board.cards);
  const total = cards.length;

  let overdueCount = 0;
  let withPriorityCount = 0;
  let withLabelsCount = 0;

  for (const card of cards) {
    if (card.due_date) {
      const [y, m, d] = card.due_date.split("-").map(Number);
      const due = new Date(y, m - 1, d);
      if (due < today) overdueCount++;
    }
    if (card.priority) withPriorityCount++;
    if (card.labels && card.labels.length > 0) withLabelsCount++;
  }

  const columnStats = board.columns.map((col) => ({
    title: col.title,
    count: col.cardIds.length,
    pct: total > 0 ? Math.round((col.cardIds.length / total) * 100) : 0,
  }));

  const COLUMN_COLORS = [
    "bg-[var(--gray-text)]",
    "bg-[var(--primary-blue)]",
    "bg-[var(--accent-yellow)]",
    "bg-[var(--secondary-purple)]",
    "bg-green-500",
  ];

  return (
    <section
      className="rounded-xl border border-[var(--stroke)] bg-white/80 px-5 py-4 shadow-sm backdrop-blur"
      aria-label="Board statistics"
    >
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex-1 min-w-[200px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Distribution
          </p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--stroke)]">
            {columnStats.map((col, i) =>
              col.count > 0 ? (
                <div
                  key={col.title}
                  className={`${COLUMN_COLORS[i]} transition-all duration-300`}
                  style={{ width: `${col.pct}%` }}
                  title={`${col.title}: ${col.count}`}
                />
              ) : null
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {columnStats.map((col, i) => (
              <span key={col.title} className="flex items-center gap-1 text-[10px] text-[var(--gray-text)]">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${COLUMN_COLORS[i]}`} />
                {col.title} {col.count}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <Stat label="Total" value={total} />
          {overdueCount > 0 ? (
            <Stat label="Overdue" value={overdueCount} accent="text-red-600" />
          ) : null}
          {withPriorityCount > 0 ? (
            <Stat label="Prioritized" value={withPriorityCount} />
          ) : null}
          {withLabelsCount > 0 ? (
            <Stat label="Labelled" value={withLabelsCount} />
          ) : null}
        </div>
      </div>
    </section>
  );
};

const Stat = ({
  label,
  value,
  accent = "text-[var(--navy-dark)]",
}: {
  label: string;
  value: number;
  accent?: string;
}) => (
  <div className="text-center">
    <p className={`text-xl font-bold tabular-nums ${accent}`}>{value}</p>
    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--gray-text)]">
      {label}
    </p>
  </div>
);
