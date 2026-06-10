"use client";

import { useState, type FormEvent } from "react";
import type { Card, Priority } from "@/lib/kanban";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const PRIORITY_ACTIVE: Record<Priority, string> = {
  low: "bg-[var(--primary-blue)] text-white",
  medium: "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
  high: "bg-orange-500 text-white",
  critical: "bg-red-600 text-white",
};

type CardDetailModalProps = {
  card: Card;
  onSave: (updates: Pick<Card, "title" | "details" | "priority">) => void;
  onClose: () => void;
};

export const CardDetailModal = ({ card, onSave, onClose }: CardDetailModalProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority | null>(card.priority ?? null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ title: title.trim() || card.title, details, priority });
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col bg-white shadow-2xl sm:w-[420px]"
        role="dialog"
        aria-label="Edit card"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            Edit card
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full border border-[var(--stroke)] px-3 py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Details
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              className="mt-2 w-full resize-none border border-[var(--stroke)] px-3 py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
          </label>
          <div>
            <p className="text-sm font-semibold text-[var(--navy-dark)]">Priority</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPriority(null)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  priority === null
                    ? "bg-[var(--navy-dark)] text-white"
                    : "border border-[var(--stroke)] text-[var(--gray-text)] hover:bg-[var(--surface)]"
                }`}
              >
                None
              </button>
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    priority === p.value
                      ? PRIORITY_ACTIVE[p.value]
                      : "border border-[var(--stroke)] text-[var(--gray-text)] hover:bg-[var(--surface)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-auto flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-[var(--stroke)] px-4 py-2.5 text-sm font-semibold text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-full bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
