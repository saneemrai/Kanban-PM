"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BoardSelector } from "@/components/BoardSelector";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ApiError, checkSession, fetchBoards, login, logout, register } from "@/lib/api";
import type { BoardSummary } from "@/lib/api";

const SESSION_TOKEN_KEY = "pm-session-token";
const SESSION_USERNAME_KEY = "pm-session-username";

type AuthMode = "login" | "register";

export const AuthenticatedApp = () => {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [storedUsername, setStoredUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [error, setError] = useState("");
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem(SESSION_TOKEN_KEY);
    const uname = window.localStorage.getItem(SESSION_USERNAME_KEY) ?? "";
    setSessionToken(token);
    setStoredUsername(uname);
  }, []);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
    window.localStorage.removeItem(SESSION_USERNAME_KEY);
    setSessionToken(null);
    setStoredUsername("");
    setBoards([]);
    setSelectedBoardId(null);
  }, []);

  const handleSessionExpired = useCallback(() => {
    clearSession();
    setError("Signed out because this user signed in somewhere else.");
  }, [clearSession]);

  const loadBoards = useCallback(
    async (token: string) => {
      setIsLoadingBoards(true);
      try {
        const fetched = await fetchBoards(token);
        setBoards(fetched);
        if (fetched.length === 1) {
          setSelectedBoardId(fetched[0].id);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleSessionExpired();
        }
      } finally {
        setIsLoadingBoards(false);
      }
    },
    [handleSessionExpired]
  );

  useEffect(() => {
    if (sessionToken) {
      void loadBoards(sessionToken);
    }
  }, [sessionToken, loadBoards]);

  const persistSession = (token: string, uname: string) => {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    window.localStorage.setItem(SESSION_USERNAME_KEY, uname);
    setSessionToken(token);
    setStoredUsername(uname);
    setUsername("");
    setPassword("");
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      if (authMode === "register") {
        const session = await register(username, password);
        persistSession(session.sessionToken, session.username);
      } else {
        const session = await login(username, password);
        persistSession(session.sessionToken, session.username);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError("Username already taken. Please choose another.");
        } else if (err.status === 422) {
          setError(
            authMode === "register"
              ? "Username must be 3-50 characters and password at least 6 characters."
              : "Invalid username or password."
          );
        } else {
          setError("Invalid username or password.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  };

  const handleLogout = () => {
    if (sessionToken) {
      void logout(sessionToken);
    }
    clearSession();
  };

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    let isCurrent = true;
    const verifySession = async () => {
      try {
        await checkSession(sessionToken);
      } catch (err) {
        if (isCurrent && err instanceof ApiError && err.status === 401) {
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
    if (isLoadingBoards) {
      return (
        <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-6 py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Loading
          </p>
        </main>
      );
    }

    if (selectedBoardId !== null) {
      const boardTitle = boards.find((b) => b.id === selectedBoardId)?.title ?? "Board";
      return (
        <KanbanBoard
          sessionToken={sessionToken}
          boardId={selectedBoardId}
          boardTitle={boardTitle}
          onLogout={handleLogout}
          onSessionExpired={handleSessionExpired}
          onBackToBoards={() => {
            setSelectedBoardId(null);
            void loadBoards(sessionToken);
          }}
        />
      );
    }

    return (
      <BoardSelector
        sessionToken={sessionToken}
        username={storedUsername}
        boards={boards}
        onSelectBoard={setSelectedBoardId}
        onBoardsChanged={setBoards}
        onSessionExpired={handleSessionExpired}
        onLogout={handleLogout}
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
          {authMode === "register" ? "Create account" : "Sign in"}
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
              autoComplete={authMode === "register" ? "new-password" : "current-password"}
              required
            />
          </label>
          {authMode === "register" ? (
            <p className="text-xs text-[var(--gray-text)]">
              Username: 3-50 chars. Password: 6+ chars.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm font-semibold text-[var(--secondary-purple)]">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="w-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            {authMode === "register" ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {authMode === "register" ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => { setAuthMode("login"); setError(""); }}
                className="font-semibold text-[var(--primary-blue)] hover:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              No account yet?{" "}
              <button
                type="button"
                onClick={() => { setAuthMode("register"); setError(""); }}
                className="font-semibold text-[var(--primary-blue)] hover:underline"
              >
                Create one
              </button>
            </>
          )}
        </p>
      </section>
    </main>
  );
};
