"use client";

import { useState, type FormEvent } from "react";
import { ApiError, changePassword } from "@/lib/api";

type ChangePasswordModalProps = {
  sessionToken: string;
  onClose: () => void;
};

export const ChangePasswordModal = ({ sessionToken, onClose }: ChangePasswordModalProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        aria-label="Change password"
        aria-modal="true"
      >
        <div className="w-full max-w-sm border-t-4 border-[var(--secondary-purple)] bg-white p-8 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
              Change password
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

          {success ? (
            <div className="mt-6">
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
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
          )}
        </div>
      </div>
    </>
  );
};
