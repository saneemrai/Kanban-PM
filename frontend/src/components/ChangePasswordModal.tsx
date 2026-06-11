"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, changePassword, listSessions, revokeSession, type SessionInfo } from "@/lib/api";

type ChangePasswordModalProps = {
  sessionToken: string;
  onClose: () => void;
  onSessionRevoked?: () => void;
};

const formatSessionDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export const ChangePasswordModal = ({ sessionToken, onClose, onSessionRevoked }: ChangePasswordModalProps) => {
  const [tab, setTab] = useState<"password" | "sessions">("password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  useEffect(() => {
    listSessions(sessionToken)
      .then(setSessions)
      .catch(() => {});
  }, [sessionToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(sessionToken, currentPassword, newPassword);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Current password is incorrect.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (sessionId: number, isCurrent: boolean) => {
    setRevokingId(sessionId);
    try {
      await revokeSession(sessionToken, sessionId);
      if (isCurrent) {
        onSessionRevoked?.();
        onClose();
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      // silently fail
    } finally {
      setRevokingId(null);
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
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        role="dialog"
        aria-label="Account settings"
        aria-modal="true"
      >
        <div className="w-full max-w-sm border-t-4 border-[var(--secondary-purple)] bg-white shadow-2xl">
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
              Account
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

          <div className="flex border-b border-[var(--stroke)] px-6">
            {(["password", "sessions"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 pb-3 pt-1 text-xs font-semibold uppercase tracking-wide transition border-b-2 mr-2 ${
                  tab === t
                    ? "border-[var(--secondary-purple)] text-[var(--secondary-purple)]"
                    : "border-transparent text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                }`}
              >
                {t === "password" ? "Password" : `Sessions${sessions.length > 0 ? ` (${sessions.length})` : ""}`}
              </button>
            ))}
          </div>

          <div className="px-6 pb-6 pt-5">
            {tab === "password" ? (
              success ? (
                <div>
                  <p className="text-sm font-semibold text-green-700">
                    Password changed successfully.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 w-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <label className="block text-sm font-semibold text-[var(--navy-dark)]">
                    Current password
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="mt-2 w-full border border-[var(--stroke)] px-3 py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold text-[var(--navy-dark)]">
                    New password
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="mt-2 w-full border border-[var(--stroke)] px-3 py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold text-[var(--navy-dark)]">
                    Confirm new password
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="mt-2 w-full border border-[var(--stroke)] px-3 py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  {error ? (
                    <p className="text-sm font-semibold text-[var(--secondary-purple)]">{error}</p>
                  ) : null}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 rounded-full border border-[var(--stroke)] px-4 py-2.5 text-sm font-semibold text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
                    >
                      {isSubmitting ? "Saving..." : "Change"}
                    </button>
                  </div>
                </form>
              )
            ) : (
              <div>
                <p className="text-xs text-[var(--gray-text)] mb-3">
                  Active sessions across all devices. Revoking your current session will sign you out.
                </p>
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                        s.isCurrent ? "border-[var(--primary-blue)] bg-[rgba(32,157,215,0.06)]" : "border-[var(--stroke)]"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-semibold text-[var(--navy-dark)]">
                          {s.isCurrent ? "This session" : "Other session"}
                        </p>
                        <p className="text-[10px] text-[var(--gray-text)]">
                          {formatSessionDate(s.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevoke(s.id, s.isCurrent)}
                        disabled={revokingId === s.id}
                        aria-label={`Revoke session from ${formatSessionDate(s.createdAt)}`}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
                          s.isCurrent
                            ? "border border-red-300 text-red-600 hover:bg-red-50"
                            : "border border-[var(--stroke)] text-[var(--gray-text)] hover:bg-[var(--surface)]"
                        }`}
                      >
                        {revokingId === s.id ? "..." : s.isCurrent ? "Sign out" : "Revoke"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
