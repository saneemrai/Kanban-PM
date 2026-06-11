import { useState, type FormEvent } from "react";
import type { Priority } from "@/lib/kanban";

const initialFormState = { title: "", details: "", dueDate: "", priority: "" as Priority | "" };

type NewCardFormProps = {
  onAdd: (title: string, details: string, dueDate?: string, priority?: Priority) => void;
};

const QUICK_PRIORITIES: { value: Priority; label: string; style: string }[] = [
  { value: "low", label: "Low", style: "bg-[rgba(32,157,215,0.12)] text-[var(--primary-blue)]" },
  { value: "medium", label: "Med", style: "bg-[rgba(236,173,10,0.15)] text-[#a07800]" },
  { value: "high", label: "High", style: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Crit", style: "bg-red-100 text-red-700" },
];

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      return;
    }
    onAdd(
      formState.title.trim(),
      formState.details.trim(),
      formState.dueDate || undefined,
      formState.priority || undefined
    );
    setFormState(initialFormState);
    setIsOpen(false);
  };

  return (
    <div className="mt-4">
      {isOpen ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={formState.title}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, title: event.target.value }))
            }
            placeholder="Card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={formState.details}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, details: event.target.value }))
            }
            placeholder="Details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={formState.dueDate}
              onChange={(e) => setFormState((prev) => ({ ...prev, dueDate: e.target.value }))}
              aria-label="Due date"
              className="rounded-xl border border-[var(--stroke)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
            <div className="flex gap-1">
              {QUICK_PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() =>
                    setFormState((prev) => ({
                      ...prev,
                      priority: prev.priority === p.value ? "" : p.value,
                    }))
                  }
                  aria-pressed={formState.priority === p.value}
                  className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                    formState.priority === p.value
                      ? p.style
                      : "border border-[var(--stroke)] text-[var(--gray-text)] hover:opacity-80"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setFormState(initialFormState);
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Add a card
        </button>
      )}
    </div>
  );
};
