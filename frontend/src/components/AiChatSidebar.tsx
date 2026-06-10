"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  sendAiChatMessage,
  type AiChatMessage,
} from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type AiChatSidebarProps = {
  sessionToken: string;
  onBoardUpdate: (board: BoardData) => void;
  onSessionExpired?: () => void;
  onClose?: () => void;
};

export const AiChatSidebar = ({
  sessionToken,
  onBoardUpdate,
  onSessionExpired,
  onClose,
}: AiChatSidebarProps) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) {
      return;
    }

    const history = messages;
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");
    setError("");
    setIsSending(true);

    try {
      const response = await sendAiChatMessage(sessionToken, message, history);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: response.message },
      ]);
      if (response.boardChanged && response.board) {
        onBoardUpdate(response.board);
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired?.();
        return;
      }
      setError("AI response could not be completed.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="flex h-full flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)]">
      <div className="flex items-start justify-between border-b border-[var(--stroke)] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            AI assistant
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Project chat
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        ) : null}
      </div>

      <div
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            No messages yet.
          </p>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "ml-6 border border-[var(--primary-blue)] bg-[rgba(32,157,215,0.08)] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]"
                : "mr-6 border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]"
            }
          >
            {message.content}
          </div>
        ))}
        {isSending ? (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Thinking
          </p>
        ) : null}
        {error ? (
          <p className="text-sm font-semibold text-[var(--secondary-purple)]">
            {error}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--stroke)] px-5 py-4"
      >
        <label className="block text-sm font-semibold text-[var(--navy-dark)]">
          Message
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="mt-2 min-h-24 w-full resize-none border border-[var(--stroke)] px-3 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            placeholder="Move the roadmap card to Done"
          />
        </label>
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="mt-3 w-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isSending ? "Sending" : "Send"}
        </button>
      </form>
    </aside>
  );
};
