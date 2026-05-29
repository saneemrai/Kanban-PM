"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ApiError, checkSession, login, logout } from "@/lib/api";

const SESSION_TOKEN_KEY = "pm-session-token";

export const AuthenticatedApp = () => {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setSessionToken(window.localStorage.getItem(SESSION_TOKEN_KEY));
    });
  }, []);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
    setSessionToken(null);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const session = await login(username, password);
      window.localStorage.setItem(SESSION_TOKEN_KEY, session.sessionToken);
      setSessionToken(session.sessionToken);
      setUsername("");
      setPassword("");
      setError("");
    } catch {
      setError("Invalid username or password.");
    }
  };

  const handleLogout = () => {
    if (sessionToken) {
      void logout(sessionToken);
    }
    clearSession();
  };

  const handleSessionExpired = useCallback(() => {
    clearSession();
    setError("Signed out because this user signed in somewhere else.");
  }, [clearSession]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    let isCurrent = true;
    const verifySession = async () => {
      try {
        await checkSession(sessionToken);
      } catch (error) {
        if (
          isCurrent &&
          error instanceof ApiError &&
          error.status === 401
        ) {
          handleSessionExpired();
        }
      }
    };
    const handleFocus = () => {
      void verifySession();
    };
    const intervalId = window.setInterval(verifySession, 10000);

    window.addEventListener("focus", handleFocus);
    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [handleSessionExpired, sessionToken]);

  if (sessionToken) {
    return (
      <KanbanBoard
        sessionToken={sessionToken}
        onLogout={handleLogout}
        onSessionExpired={handleSessionExpired}
      />
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-6 py-12">
      <section className="w-full max-w-sm border-t-4 border-[var(--accent-yellow)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
          Kanban Studio
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Sign in
        </h1>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full border border-[var(--stroke)] px-3 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full border border-[var(--stroke)] px-3 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? (
            <p className="text-sm font-semibold text-[var(--secondary-purple)]">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="w-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
};
