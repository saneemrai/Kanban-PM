"use client";

import { useEffect, useState } from "react";
import { listActivity, type ActivityEvent } from "@/lib/api";

const ACTION_LABELS: Record<string, string> = {
  card_created: "created card",
  card_deleted: "deleted card",
  card_archived: "archived card",
  card_restored: "restored card",
  board_renamed: "renamed board",
};

const ACTION_ICONS: Record<string, string> = {
  card_created: "bg-green-100 text-green-700",
  card_deleted: "bg-red-100 text-red-700",
  card_archived: "bg-[rgba(236,173,10,0.15)] text-[#a07800]",
  card_restored: "bg-[rgba(32,157,215,0.15)] text-[var(--primary-blue)]",
  board_renamed: "bg-[rgba(117,57,145,0.15)] text-[var(--secondary-purple)]",
};

const formatTime = (createdAt: string) => {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

type ActivityDrawerProps = {
  sessionToken: string;
  boardId: number;
  onClose: () => void;
};

export const ActivityDrawer = ({
  sessionToken,
  boardId,
  onClose,
}: ActivityDrawerProps) => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listActivity(sessionToken, boardId)
      .then((data) => {
        setEvents(data);
        setIsLoading(false);
      })
      .catch(() => {
        setError("Could not load activity.");
        setIsLoading(false);
      });
  }, [sessionToken, boardId]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col bg-white shadow-2xl sm:w-[360px]"
        role="dialog"
        aria-label="Board activity"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              Activity
            </h2>
            <p className="text-xs text-[var(--gray-text)]">Recent board events</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close activity"
            className="rounded-lg p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <p className="text-sm text-[var(--gray-text)]">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-12 text-center">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-[var(--gray-text)]" aria-hidden="true">
                <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M16 9v7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="text-sm font-medium text-[var(--gray-text)]">No activity yet</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {events.map((event) => {
                const label = ACTION_LABELS[event.action] ?? event.action;
                const style = ACTION_ICONS[event.action] ?? "bg-[var(--stroke)] text-[var(--gray-text)]";
                const description =
                  event.action === "board_renamed"
                    ? `"${event.meta.from}" → "${event.meta.to}"`
                    : event.cardTitle
                    ? `"${event.cardTitle}"`
                    : null;
                return (
                  <li
                    key={event.id}
                    className="flex items-start gap-3 rounded-xl p-3 hover:bg-[var(--surface)] transition"
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style}`}
                    >
                      {event.action.replace("_", " ").split(" ")[1] ?? event.action}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--navy-dark)]">
                        <span className="font-semibold">{event.actor}</span>{" "}
                        {label}
                      </p>
                      {description ? (
                        <p className="text-xs text-[var(--gray-text)] truncate">{description}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] text-[var(--gray-text)] whitespace-nowrap">
                      {formatTime(event.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};
