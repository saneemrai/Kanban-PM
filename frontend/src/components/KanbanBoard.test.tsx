import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders five columns", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    expect(within(column).getByText("2 cards")).toBeInTheDocument();
  });

  it("uses a singular card count label", async () => {
    render(<KanbanBoard />);
    const column = screen.getByTestId("column-col-discovery");

    expect(within(column).getByText("1 card")).toBeInTheDocument();
  });

  it("loads and saves the board through the API when a user is provided", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Response.json(JSON.parse(init.body as string) as BoardData);
      }
      return Response.json(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard sessionToken="session-1" />);

    const column = await screen.findByTestId("column-col-backlog");
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "API card"
    );
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await screen.findByText("All changes saved")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "X-PM-Session": "session-1" }),
      })
    );
    expect(screen.getByText("API card")).toBeInTheDocument();
  });

  it("shows AI chat responses without changing the board", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/ai/chat") {
        return Response.json({
          message: "The board is already in good shape.",
          boardChanged: false,
          board: null,
        });
      }
      return Response.json(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard sessionToken="session-1" />);

    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.type(screen.getByLabelText("Message"), "Summarize the board.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("The board is already in good shape.")
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-PM-Session": "session-1" }),
      })
    );
  });

  it("applies AI board updates", async () => {
    const nextBoard: BoardData = {
      ...initialData,
      columns: initialData.columns.map((column) =>
        column.id === "col-backlog"
          ? { ...column, cardIds: [...column.cardIds, "card-ai"] }
          : column
      ),
      cards: {
        ...initialData.cards,
        "card-ai": {
          id: "card-ai",
          title: "AI-created card",
          details: "Added by AI.",
        },
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/ai/chat") {
        return Response.json({
          message: "Added a card.",
          boardChanged: true,
          board: nextBoard,
        });
      }
      return Response.json(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard sessionToken="session-1" />);

    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.type(screen.getByLabelText("Message"), "Add an AI card.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Added a card.")).toBeVisible();
    expect(screen.getByText("AI-created card")).toBeVisible();
  });
});
