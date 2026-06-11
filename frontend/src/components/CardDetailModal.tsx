"use client";

import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import type { Card, Priority } from "@/lib/kanban";
import { addComment, deleteComment, listComments, type Comment } from "@/lib/api";

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

const formatCommentTime = (createdAt: string) => {
  const date = new Date(createdAt);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

type CardDetailModalProps = {
  card: Card;
  sessionToken: string;
  boardId: number;
  username?: string;
  onSave: (updates: Pick<Card, "title" | "details" | "priority" | "due_date" | "labels">) => void;
  onClose: () => void;
};

export const CardDetailModal = ({
  card,
  sessionToken,
  boardId,
  username,
  onSave,
  onClose,
}: CardDetailModalProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority | null>(card.priority ?? null);
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [labels, setLabels] = useState<string[]>(card.labels ?? []);
  const [labelInput, setLabelInput] = useState("");
  const labelInputRef = useRef<HTMLInputElement>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState("");
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listComments(sessionToken, boardId, card.id)
      .then(setComments)
      .catch(() => {});
  }, [sessionToken, boardId, card.id]);

  const scrollToLatestComment = () => {
    commentsEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setIsSubmittingComment(true);
    setCommentError("");
    try {
      const newComment = await addComment(sessionToken, boardId, card.id, commentBody);
      setComments((prev) => [...prev, newComment]);
      setCommentBody("");
      setTimeout(scrollToLatestComment, 50);
    } catch {
      setCommentError("Failed to post comment.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await deleteComment(sessionToken, boardId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      setCommentError("Failed to delete comment.");
    }
  };

  const addLabel = (raw: string) => {
    const label = raw.trim().slice(0, 30);
    if (label && !labels.includes(label) && labels.length < 10) {
      setLabels([...labels, label]);
    }
    setLabelInput("");
  };

  const handleLabelKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addLabel(labelInput);
    } else if (e.key === "Backspace" && !labelInput && labels.length > 0) {
      setLabels(labels.slice(0, -1));
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const finalLabels = labelInput.trim() ? [...labels, labelInput.trim().slice(0, 30)].filter((l, i, arr) => arr.indexOf(l) === i).slice(0, 10) : labels;
    onSave({ title: title.trim() || card.title, details, priority, due_date: dueDate || null, labels: finalLabels });
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
        <div className="flex flex-1 flex-col overflow-y-auto">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
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
            <label className="block text-sm font-semibold text-[var(--navy-dark)]">
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-2 w-full border border-[var(--stroke)] px-3 py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
            </label>
            <div>
              <p className="text-sm font-semibold text-[var(--navy-dark)]">Labels</p>
              <div
                className="mt-2 flex min-h-[40px] flex-wrap gap-1.5 rounded border border-[var(--stroke)] px-3 py-2 transition focus-within:border-[var(--primary-blue)] cursor-text"
                onClick={() => labelInputRef.current?.focus()}
                aria-label="Labels"
              >
                {labels.map((label) => (
                  <span
                    key={label}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${labelColor(label)}`}
                  >
                    {label}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLabels(labels.filter((l) => l !== label));
                      }}
                      aria-label={`Remove label ${label}`}
                      className="hover:opacity-70"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  ref={labelInputRef}
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={handleLabelKeyDown}
                  onBlur={() => { if (labelInput.trim()) addLabel(labelInput); }}
                  placeholder={labels.length === 0 ? "Type a label and press Enter" : ""}
                  aria-label="Add label"
                  className="min-w-[120px] flex-1 bg-transparent text-sm font-medium text-[var(--navy-dark)] outline-none placeholder:text-[var(--gray-text)]"
                />
              </div>
            </div>

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
            <div className="flex gap-3 pt-4">
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

          <section
            aria-label="Comments"
            className="border-t border-[var(--stroke)] px-6 pb-6 pt-5"
          >
            <p className="text-sm font-semibold text-[var(--navy-dark)]">
              Comments {comments.length > 0 ? <span className="ml-1 text-xs font-normal text-[var(--gray-text)]">({comments.length})</span> : null}
            </p>
            {comments.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {comments.map((comment) => (
                  <li
                    key={comment.id}
                    className="group rounded-lg border border-[var(--stroke)] bg-[var(--surface)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-bold text-[var(--navy-dark)]">
                            {comment.author}
                          </span>
                          <span className="text-[10px] text-[var(--gray-text)]">
                            {formatCommentTime(comment.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--navy-dark)]">
                          {comment.body}
                        </p>
                      </div>
                      {comment.author === username ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          aria-label="Delete comment"
                          className="shrink-0 rounded p-1 text-[var(--gray-text)] opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                        >
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
                <div ref={commentsEndRef} />
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--gray-text)]">No comments yet.</p>
            )}
            {commentError ? (
              <p className="mt-2 text-xs text-red-600">{commentError}</p>
            ) : null}
            <form onSubmit={handleAddComment} className="mt-3 flex flex-col gap-2">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Add a comment…"
                aria-label="Add a comment"
                rows={2}
                className="w-full resize-none border border-[var(--stroke)] px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
              <button
                type="submit"
                disabled={isSubmittingComment || !commentBody.trim()}
                className="self-end rounded-full bg-[var(--primary-blue)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {isSubmittingComment ? "Posting…" : "Post comment"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
};
