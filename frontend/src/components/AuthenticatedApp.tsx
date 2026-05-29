"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

const SESSION_KEY = "pm-session-user";
const VALID_USERNAME = "user";
const VALID_PASSWORD = "password";

export const AuthenticatedApp = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setIsSignedIn(window.localStorage.getItem(SESSION_KEY) === VALID_USERNAME);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      window.localStorage.setItem(SESSION_KEY, VALID_USERNAME);
      setIsSignedIn(true);
      setUsername("");
      setPassword("");
      setError("");
      return;
    }

    setError("Invalid username or password.");
  };

  const handleLogout = () => {
    window.localStorage.removeItem(SESSION_KEY);
    setIsSignedIn(false);
  };

  if (isSignedIn) {
    return <KanbanBoard onLogout={handleLogout} />;
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
