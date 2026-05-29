import { expect, test, type Page } from "@playwright/test";
import { initialData, type BoardData } from "../src/lib/kanban";

const cloneBoard = () => JSON.parse(JSON.stringify(initialData)) as BoardData;

const setupBoardApi = async (page: Page) => {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    const loginResponse = await page.request.post("/api/login", {
      data: { username: "user", password: "password" },
    });
    const session = await loginResponse.json();
    await page.request.put("/api/board", {
      headers: { "X-PM-Session": session.sessionToken },
      data: cloneBoard(),
    });
    return;
  }

  let board = cloneBoard();
  let sessionToken = "";
  await page.route("**/api/board", async (route) => {
    const request = route.request();
    if (request.headers()["x-pm-session"] !== sessionToken) {
      await route.fulfill({ status: 401, json: { detail: "Expired" } });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ json: board });
      return;
    }
    if (request.method() === "PUT") {
      board = request.postDataJSON() as BoardData;
      await route.fulfill({ json: board });
      return;
    }
    await route.fulfill({ status: 405, json: { detail: "Method not allowed" } });
  });
  await page.route("**/api/session", async (route) => {
    if (route.request().headers()["x-pm-session"] !== sessionToken) {
      await route.fulfill({ status: 401, json: { detail: "Expired" } });
      return;
    }
    await route.fulfill({ json: { username: "user" } });
  });
  await page.route("**/api/login", async (route) => {
    const body = route.request().postDataJSON() as {
      username: string;
      password: string;
    };
    if (body.username === "user" && body.password === "password") {
      sessionToken = `session-${Date.now()}`;
      await route.fulfill({ json: { username: "user", sessionToken } });
      return;
    }
    await route.fulfill({ status: 401, json: { detail: "Invalid credentials." } });
  });
  await page.route("**/api/logout", async (route) => {
    await route.fulfill({ json: { status: "ok" } });
  });
};

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await setupBoardApi(page);
});

test("requires sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).not.toBeVisible();
});

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
});

test("loads the kanban board", async ({ page }) => {
  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
  await expect(page.getByText("All changes saved")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const targetColumnEnd = page.getByTestId("drop-end-col-review");
  const cardBox = await card.boundingBox();
  const columnEndBox = await targetColumnEnd.boundingBox();
  if (!cardBox || !columnEndBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnEndBox.x + columnEndBox.width / 2,
    columnEndBox.y + columnEndBox.height / 2,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  await expect(
    targetColumn.locator('[data-testid^="card-"]').last()
  ).toHaveAttribute("data-testid", "card-card-1");
  await expect(page.getByText("All changes saved")).toBeVisible();

  await page.reload();

  await expect(
    page.getByTestId("column-col-review").getByTestId("card-card-1")
  ).toBeVisible();
  await expect(
    page.getByTestId("column-col-review").locator('[data-testid^="card-"]').last()
  ).toHaveAttribute("data-testid", "card-card-1");
});

test("logs out", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).not.toBeVisible();
});

test("persists a column rename after refresh", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.getByTestId("column-col-backlog");

  await firstColumn.getByLabel("Column title").fill("Persistent Ideas");
  await expect(page.getByText("All changes saved")).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).toBeVisible();
  await expect(
    page.getByTestId("column-col-backlog").getByLabel("Column title")
  ).toHaveValue("Persistent Ideas");
});

test("expires the current browser when the user signs in elsewhere", async ({
  page,
}) => {
  await signIn(page);

  await page.evaluate(async () => {
    await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "user", password: "password" }),
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(
    page.getByText("Signed out because this user signed in somewhere else.")
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
