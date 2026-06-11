import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { initialData } from "@/lib/kanban";

const MOCK_BOARDS = [{ id: 1, title: "My Board", cardCount: 8, updatedAt: "2024-01-01" }];

const mockFetch = (options: { loginFails?: boolean; boardsFails?: boolean } = {}) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/login") {
      const body = JSON.parse(init?.body as string) as {
        username: string;
        password: string;
      };
      if (options.loginFails || !(body.username === "user" && body.password === "password")) {
        return Response.json({ detail: "Invalid credentials." }, { status: 401 });
      }
      return Response.json({ username: "user", sessionToken: "session-1" });
    }
    if (url === "/api/logout") {
      return Response.json({ status: "ok" });
    }
    if (url === "/api/session") {
      if (options.boardsFails) {
        return Response.json({ detail: "Expired" }, { status: 401 });
      }
      return Response.json({ username: "user" });
    }
    if (url === "/api/boards") {
      if (options.boardsFails) {
        return Response.json({ detail: "Expired" }, { status: 401 });
      }
      return Response.json(MOCK_BOARDS);
    }
    if (url.includes("/data")) {
      return Response.json(initialData);
    }
    return Response.json(initialData);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const signIn = async () => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Username"), "user");
  await user.type(screen.getByLabelText("Password"), "password");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  return user;
};

describe("AuthenticatedApp", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows sign in before the board", () => {
    render(<AuthenticatedApp />);

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(
      screen.queryByTestId(/column-/i)
    ).not.toBeInTheDocument();
  });

  it("rejects invalid credentials", async () => {
    const user = userEvent.setup();
    render(<AuthenticatedApp />);

    await user.type(screen.getByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText("Invalid username or password.")).toBeVisible();
    expect(
      screen.queryByTestId(/column-/i)
    ).not.toBeInTheDocument();
  });

  it("shows the board after sign in when there is exactly one board", async () => {
    render(<AuthenticatedApp />);

    await signIn();

    // With a single board, the app auto-navigates to it
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByRole("heading", { name: "My Board" })).toBeVisible();
  });

  it("shows board selector when there are multiple boards", async () => {
    const multiBoards = [
      { id: 1, title: "Board One", cardCount: 8, updatedAt: "2024-01-01" },
      { id: 2, title: "Board Two", cardCount: 3, updatedAt: "2024-01-02" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/login") {
          return Response.json({ username: "user", sessionToken: "session-1" });
        }
        if (url === "/api/boards") return Response.json(multiBoards);
        if (url.includes("/data")) return Response.json(initialData);
        return Response.json(initialData);
      })
    );

    render(<AuthenticatedApp />);
    await signIn();

    expect(await screen.findByRole("heading", { name: "My Boards" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Board One" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Board Two" })).toBeVisible();
  });

  it("navigates to board on selection", async () => {
    const multiBoards = [
      { id: 1, title: "Board One", cardCount: 8, updatedAt: "2024-01-01" },
      { id: 2, title: "Board Two", cardCount: 3, updatedAt: "2024-01-02" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/login") {
          return Response.json({ username: "user", sessionToken: "session-1" });
        }
        if (url === "/api/boards") return Response.json(multiBoards);
        if (url.includes("/data")) return Response.json(initialData);
        return Response.json(initialData);
      })
    );

    render(<AuthenticatedApp />);
    const user = await signIn();

    await screen.findByRole("heading", { name: "My Boards" });
    await user.click(screen.getAllByRole("button", { name: /open board/i })[0]);

    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("shows register form when toggled", async () => {
    render(<AuthenticatedApp />);

    await userEvent.click(screen.getByRole("button", { name: /create one/i }));

    expect(screen.getByRole("heading", { name: "Create account" })).toBeVisible();
    expect(screen.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  it("logs out", async () => {
    render(<AuthenticatedApp />);

    await signIn();
    // waitFor retries until the button is present, handling any transient re-mounts.
    // fireEvent.click is synchronous so once getByRole succeeds the handler fires.
    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    });

    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.queryAllByTestId(/column-/i)).toHaveLength(0);
  });

  it("returns to sign in when the session expires", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/login") {
        return Response.json({ username: "user", sessionToken: "stale-session" });
      }
      return Response.json({ detail: "Expired" }, { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthenticatedApp />);

    await signIn();

    expect(
      await screen.findByText("Signed out because this user signed in somewhere else.")
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
