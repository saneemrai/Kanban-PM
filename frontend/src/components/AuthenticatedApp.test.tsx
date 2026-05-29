import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";

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
      screen.getByRole("heading", { name: "Kanban Studio" })
    ).toBeVisible();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("logs out", async () => {
    render(<AuthenticatedApp />);

    const user = await signIn();
    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Kanban Studio" })
    ).not.toBeInTheDocument();
  });
});
