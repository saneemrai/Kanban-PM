"use client";

import { useEffect, useState } from "react";
import { listArchivedCards, restoreCard, type ArchivedCard } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ArchiveDrawerProps = {
  sessionToken: string;
  boardId: number;
  onClose: () => void;
  onRestore: (board: BoardData) => void;
};

export const ArchiveDrawer = ({
  sessionToken,
  boardId,
  onClose,
  onRestore,
}: ArchiveDrawerProps) => {
  const [cards, setCards] = useState<ArchivedCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listArchivedCards(sessionToken, boardId)
      .then((archived) => {
        setCards(archived);
        setIsLoading(false);
      })
      .catch(() => {
        setError("Could not load archive.");
        setIsLoading(false);
      });
  }, [sessionToken, boardId]);

  const handleRestore = async (cardId: string) => {
    setRestoringId(cardId);
    try {
      const updatedBoard = await restoreCard(sessionToken, boardId, cardId);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      onRestore(updatedBoard);
    } catch {
      setError("Could not restore card.");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col bg-white shadow-2xl sm:w-[380px]"
        role="dialog"
        aria-label="Card archive"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              Archive
            </h2>
            <p className="text-xs text-[var(--gray-text)]">
              Archived cards can be restored to Backlog
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close archive"
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
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-12 text-center">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-[var(--gray-text)]" aria-hidden="true">
                <rect x="2" y="6" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2 12h28M10 17h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="text-sm font-medium text-[var(--gray-text)]">No archived cards</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {cards.map((card) => (
                <li
                  key={card.id}
                  className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-[var(--navy-dark)] leading-snug">
                        {card.title}
                      </p>
                      {card.details ? (
                        <p className="mt-0.5 text-xs text-[var(--gray-text)] line-clamp-2">
                          {card.details}
                        </p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {card.priority ? (
                          <span className="rounded-full bg-[var(--stroke)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--gray-text)]">
                            {card.priority}
                          </span>
                        ) : null}
                        {card.due_date ? (
                          <span className="rounded-full bg-[var(--stroke)] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--gray-text)]">
                            {card.due_date}
                          </span>
                        ) : null}
                        {card.labels.map((label) => (
                          <span
                            key={label}
                            className="rounded-full bg-[var(--stroke)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gray-text)]"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestore(card.id)}
                      disabled={restoringId === card.id}
                      aria-label={`Restore ${card.title}`}
                      className="shrink-0 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] transition hover:bg-white disabled:opacity-50"
                    >
                      {restoringId === card.id ? "…" : "Restore"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};
