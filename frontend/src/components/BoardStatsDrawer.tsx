"use client";

import { useEffect, useState } from "react";
import { fetchBoardStats, type BoardStats } from "@/lib/api";

type Props = {
  sessionToken: string;
  boardId: number;
  onClose: () => void;
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-blue-400",
  none: "bg-gray-200",
};

export const BoardStatsDrawer = ({ sessionToken, boardId, onClose }: Props) => {
  const [stats, setStats] = useState<BoardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBoardStats(sessionToken, boardId)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [sessionToken, boardId]);

  const maxColumnCount = stats ? Math.max(...stats.byColumn.map((c) => c.cardCount), 1) : 1;

  return (
    <>
      <div
        className="fixed inset-0 z-30"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="Board statistics"
        className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col overflow-y-auto border-l border-[var(--stroke)] bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
          <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            Board Statistics
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close statistics"
            className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-[var(--gray-text)]">Loading...</p>
          </div>
        ) : stats ? (
          <div className="flex flex-col gap-6 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--stroke)] p-3 text-center">
                <p className="text-2xl font-bold text-[var(--navy-dark)]">{stats.totalCards}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-text)]">Total cards</p>
              </div>
              <div className="rounded-xl border border-[var(--stroke)] p-3 text-center">
                <p className="text-2xl font-bold text-[var(--primary-blue)]">{stats.completionRate}%</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-text)]">Complete</p>
              </div>
              <div className="rounded-xl border border-[var(--stroke)] p-3 text-center">
                <p className="text-2xl font-bold text-[var(--secondary-purple)]">{stats.totalPoints}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-text)]">Total pts</p>
              </div>
              <div className="rounded-xl border border-[var(--stroke)] p-3 text-center">
                <p className={`text-2xl font-bold ${stats.overdueCards > 0 ? "text-red-600" : "text-[var(--gray-text)]"}`}>
                  {stats.overdueCards}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-text)]">Overdue</p>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                Cards by column
              </h3>
              <div className="flex flex-col gap-2" role="list" aria-label="Cards per column">
                {stats.byColumn.map((col) => (
                  <div key={col.columnKey} role="listitem">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--navy-dark)]">{col.columnTitle}</span>
                      <span className="text-xs font-semibold text-[var(--gray-text)]">{col.cardCount}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--surface)]">
                      <div
                        className="h-2 rounded-full bg-[var(--primary-blue)] transition-all"
                        style={{ width: `${(col.cardCount / maxColumnCount) * 100}%` }}
                        aria-label={`${col.cardCount} cards`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                Cards by priority
              </h3>
              <div className="flex flex-col gap-1.5">
                {(["critical", "high", "medium", "low", "none"] as const).map((p) => {
                  const count = stats.byPriority[p] ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={p} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${PRIORITY_COLOR[p]}`} />
                      <span className="flex-1 text-xs text-[var(--navy-dark)]">{PRIORITY_LABEL[p]}</span>
                      <span className="text-xs font-semibold text-[var(--gray-text)]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {stats.byAssignee.length > 0 ? (
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                  Cards by assignee
                </h3>
                <div className="flex flex-col gap-1.5">
                  {stats.byAssignee.map(({ assignee, count }) => (
                    <div key={assignee} className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--secondary-purple)] text-[10px] font-bold text-white">
                        {assignee[0].toUpperCase()}
                      </span>
                      <span className="flex-1 truncate text-xs text-[var(--navy-dark)]">{assignee}</span>
                      <span className="text-xs font-semibold text-[var(--gray-text)]">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {stats.totalPoints > 0 ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                  Story points
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex-1 rounded-full bg-[var(--surface)] h-3 overflow-hidden">
                    <div
                      className="h-3 rounded-full bg-[var(--accent-yellow)]"
                      style={{ width: `${(stats.donePoints / stats.totalPoints) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-[var(--gray-text)] shrink-0">
                    {stats.donePoints} / {stats.totalPoints} pts
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-[var(--gray-text)]">Failed to load stats.</p>
          </div>
        )}
      </aside>
    </>
  );
};
