"use client";

import { useEffect, useState } from "react";
import {
  LABEL_COLORS,
  addBoardLabel,
  deleteBoardLabel,
  listBoardLabels,
  updateBoardLabel,
  type BoardLabel,
} from "@/lib/api";

const LABEL_COLOR_CLASSES: Record<string, string> = {
  blue: "bg-[rgba(32,157,215,0.15)] text-[var(--primary-blue)]",
  purple: "bg-[rgba(117,57,145,0.15)] text-[var(--secondary-purple)]",
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  yellow: "bg-[rgba(236,173,10,0.15)] text-[#a07800]",
  green: "bg-green-100 text-green-700",
  pink: "bg-pink-100 text-pink-700",
  gray: "bg-gray-100 text-gray-600",
};

export const labelColorClass = (color: string) =>
  LABEL_COLOR_CLASSES[color] ?? LABEL_COLOR_CLASSES.blue;

type LabelsDrawerProps = {
  sessionToken: string;
  boardId: number;
  onClose: () => void;
  onLabelsChanged: (labels: BoardLabel[]) => void;
};

export const LabelsDrawer = ({
  sessionToken,
  boardId,
  onClose,
  onLabelsChanged,
}: LabelsDrawerProps) => {
  const [labels, setLabels] = useState<BoardLabel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("blue");

  useEffect(() => {
    listBoardLabels(sessionToken, boardId)
      .then((fetched) => {
        setLabels(fetched);
        onLabelsChanged(fetched);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [sessionToken, boardId, onLabelsChanged]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || isAdding) return;
    setIsAdding(true);
    setAddError("");
    try {
      const created = await addBoardLabel(sessionToken, boardId, name, newColor);
      const next = [...labels, created].sort((a, b) => a.name.localeCompare(b.name));
      setLabels(next);
      onLabelsChanged(next);
      setNewName("");
      setNewColor("blue");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setAddError(msg.includes("409") ? "A label with that name already exists." : "Could not add label.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (labelId: number) => {
    setDeletingId(labelId);
    try {
      await deleteBoardLabel(sessionToken, boardId, labelId);
      const next = labels.filter((l) => l.id !== labelId);
      setLabels(next);
      onLabelsChanged(next);
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (label: BoardLabel) => {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
  };

  const handleSaveEdit = async (labelId: number) => {
    const name = editName.trim();
    if (!name) return;
    try {
      const updated = await updateBoardLabel(sessionToken, boardId, labelId, name, editColor);
      const next = labels.map((l) => (l.id === labelId ? updated : l)).sort((a, b) => a.name.localeCompare(b.name));
      setLabels(next);
      onLabelsChanged(next);
      setEditingId(null);
    } catch {
      setEditingId(null);
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
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl sm:w-[380px]"
        role="dialog"
        aria-label="Label palette"
      >
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            Label Palette
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-4 text-xs text-[var(--gray-text)]">
            Define reusable labels with consistent colors for this board. Labels here appear as suggestions when editing cards.
          </p>

          {isLoading ? (
            <p className="text-sm text-[var(--gray-text)]">Loading...</p>
          ) : labels.length === 0 ? (
            <p className="text-sm text-[var(--gray-text)]">No labels yet. Add one below.</p>
          ) : (
            <ul className="mb-6 space-y-2">
              {labels.map((label) => (
                <li
                  key={label.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--stroke)] px-3 py-2.5"
                >
                  {editingId === label.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleSaveEdit(label.id); }}
                        maxLength={40}
                        autoFocus
                        aria-label="Edit label name"
                        className="min-w-0 flex-1 border border-[var(--stroke)] px-2 py-1 text-xs font-medium text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                      />
                      <select
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        aria-label="Edit label color"
                        className="rounded border border-[var(--stroke)] px-1.5 py-1 text-xs outline-none focus:border-[var(--primary-blue)]"
                      >
                        {LABEL_COLORS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(label.id)}
                        className="text-xs font-semibold text-[var(--primary-blue)] hover:underline"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${labelColorClass(label.color)}`}
                      >
                        {label.name}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(label)}
                          aria-label={`Edit label ${label.name}`}
                          className="rounded p-1 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
                        >
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L3.5 10.5l-3 .5.5-3 7.5-6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(label.id)}
                          disabled={deletingId === label.id}
                          aria-label={`Delete label ${label.name}`}
                          className="rounded p-1 text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                        >
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M1 3h10M4 3V2h4v1M2 3l.6 7.3a.7.7 0 0 0 .7.7h5.4a.7.7 0 0 0 .7-.7L10 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-xl border border-dashed border-[var(--stroke)] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              New label
            </h3>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
              placeholder="Label name"
              maxLength={40}
              aria-label="New label name"
              className="w-full border border-[var(--stroke)] px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
            <div className="flex flex-wrap gap-1.5">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setNewColor(c.value)}
                  aria-label={c.label}
                  aria-pressed={newColor === c.value}
                  className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold transition ${labelColorClass(c.value)} ${newColor === c.value ? "ring-2 ring-offset-1 ring-[var(--primary-blue)]" : "opacity-70 hover:opacity-100"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {addError ? (
              <p className="text-xs font-semibold text-[var(--secondary-purple)]">{addError}</p>
            ) : null}
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding || !newName.trim()}
              className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-55"
            >
              {isAdding ? "Adding..." : "Add label"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
