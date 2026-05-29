import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { initialData } from "@/lib/kanban";

const mockFetch = () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/login") {
      const body = JSON.parse(init?.body as string) as {
        username: string;
        password: string;
      };
      if (body.username === "user" && body.password === "password") {
        return Response.json({ username: "user", sessionToken: "session-1" });
      }
      return Response.json({ detail: "Invalid credentials." }, { status: 401 });
    }
    if (input === "/api/logout") {
      return Response.json({ status: "ok" });
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
      screen.queryByRole("heading", { name: "Kanban Studio" })
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
      screen.queryByRole("heading", { name: "Kanban Studio" })
    ).not.toBeInTheDocument();
  });

  it("shows the board after sign in", async () => {
    render(<AuthenticatedApp />);

    await signIn();

    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeVisible();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("logs out", async () => {
    render(<AuthenticatedApp />);

    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: /log out/i }));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Kanban Studio" })
    ).not.toBeInTheDocument();
  });

  it("returns to sign in when the session expires", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/login") {
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
