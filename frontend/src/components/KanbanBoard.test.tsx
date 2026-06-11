import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

const defaultProps = {
  sessionToken: "session-1",
  boardId: 1,
  boardTitle: "Test Board",
  onLogout: vi.fn(),
  onSessionExpired: vi.fn(),
  onBackToBoards: vi.fn(),
};

const mockBoardFetch = (board: BoardData = initialData) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/data") && init?.method === "PUT") {
      return Response.json(JSON.parse(init.body as string) as BoardData);
    }
    if (url.includes("/data")) {
      return Response.json(board);
    }
    if (url.includes("/comments") && init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({ id: 1, author: "user", body: body.body, created_at: new Date().toISOString() }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/comments") && init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (url.includes("/comments")) {
      return Response.json([]);
    }
    if (url.includes("/activity")) {
      return Response.json([]);
    }
    if (url.includes("/checklist") && init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({ id: 1, text: body.text, done: false }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/checklist") && init?.method === "PATCH") {
      const body = JSON.parse(init.body as string);
      return Response.json({ id: 1, text: "item", done: body.done });
    }
    if (url.includes("/checklist") && init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (url.includes("/checklist")) {
      return Response.json([]);
    }
    if (url.includes("/archive") && !url.includes("/cards/") && init?.method !== "POST") {
      return Response.json([]);
    }
    if (url.includes("/archive") && init?.method === "POST") {
      const nextBoard = { ...board, columns: board.columns.map((c, i) => i === 0 ? { ...c, cardIds: c.cardIds.slice(1) } : c), cards: Object.fromEntries(Object.entries(board.cards).filter(([id]) => id !== "card-1")) };
      return Response.json(nextBoard);
    }
    if (url.includes("/restore") && init?.method === "POST") {
      return Response.json(board);
    }
    return Response.json(board);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("KanbanBoard", () => {
  beforeEach(() => {
    mockBoardFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders five columns", async () => {
    render(<KanbanBoard {...defaultProps} />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard {...defaultProps} />);
    const column = await screen.findByTestId("column-col-backlog");
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard {...defaultProps} />);
    const column = await screen.findByTestId("column-col-backlog");
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
    render(<KanbanBoard {...defaultProps} />);
    const column = await screen.findByTestId("column-col-discovery");
    expect(within(column).getByText("1 card")).toBeInTheDocument();
  });

  it("saves the board through the API after changes", async () => {
    const fetchMock = mockBoardFetch();
    render(<KanbanBoard {...defaultProps} />);

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
      "/api/boards/1/data",
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

    render(<KanbanBoard {...defaultProps} />);

    await screen.findByRole("heading", { name: "Test Board" });
    await userEvent.click(screen.getByRole("button", { name: /chat/i }));
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

    render(<KanbanBoard {...defaultProps} />);

    await screen.findByRole("heading", { name: "Test Board" });
    await userEvent.click(screen.getByRole("button", { name: /chat/i }));
    await userEvent.type(screen.getByLabelText("Message"), "Add an AI card.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Added a card.")).toBeVisible();
    expect(screen.getByText("AI-created card")).toBeVisible();
  });

  it("opens card edit modal and saves updated title and priority", async () => {
    const fetchMock = mockBoardFetch();
    render(<KanbanBoard {...defaultProps} />);

    await screen.findAllByTestId(/column-/i);

    const editButton = screen.getAllByRole("button", { name: /edit /i })[0];
    await userEvent.click(editButton);

    expect(screen.getByRole("dialog", { name: /edit card/i })).toBeVisible();

    const titleInput = screen.getByDisplayValue("Align roadmap themes");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");

    await userEvent.click(screen.getByRole("button", { name: "High" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Updated title")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/data",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("shows priority badge on cards that have one", async () => {
    const boardWithPriority = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { ...initialData.cards["card-1"], priority: "critical" as const },
      },
    };
    mockBoardFetch(boardWithPriority);
    render(<KanbanBoard {...defaultProps} />);

    await screen.findAllByTestId(/column-/i);

    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("shows back-to-boards button and calls handler on click", async () => {
    const onBackToBoards = vi.fn();
    render(<KanbanBoard {...defaultProps} onBackToBoards={onBackToBoards} />);

    await screen.findByRole("button", { name: /back to boards/i });
    await userEvent.click(screen.getByRole("button", { name: /back to boards/i }));

    expect(onBackToBoards).toHaveBeenCalledOnce();
  });

  it("filters cards by search text", async () => {
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    const searchInput = screen.getByLabelText("Search cards");
    await userEvent.type(searchInput, "roadmap");

    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
  });

  it("filters cards by priority", async () => {
    const boardWithPriorities: BoardData = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { ...initialData.cards["card-1"], priority: "high" as const },
        "card-2": { ...initialData.cards["card-2"], priority: "low" as const },
      },
    };
    mockBoardFetch(boardWithPriorities);
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getByRole("button", { name: "Filter by high priority" }));

    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
  });

  it("clears filters with the clear button", async () => {
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    const searchInput = screen.getByLabelText("Search cards");
    await userEvent.type(searchInput, "roadmap");

    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByText("Gather customer signals")).toBeInTheDocument();
  });

  it("adds and displays a label on a card", async () => {
    const fetchMock = mockBoardFetch();
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getAllByRole("button", { name: /edit /i })[0]);
    expect(screen.getByRole("dialog", { name: /edit card/i })).toBeVisible();

    await userEvent.type(screen.getByLabelText("Add label"), "backend");
    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("backend")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/data",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("shows match counts per column when filter is active", async () => {
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");

    const backlogColumn = screen.getByTestId("column-col-backlog");
    expect(within(backlogColumn).getByText("1 match")).toBeInTheDocument();
  });

  it("filters cards by label", async () => {
    const boardWithLabels: BoardData = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { ...initialData.cards["card-1"], labels: ["backend"] },
        "card-2": { ...initialData.cards["card-2"], labels: ["frontend"] },
      },
    };
    mockBoardFetch(boardWithLabels);
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.type(screen.getByLabelText("Filter by label"), "back");

    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
  });

  it("shows board statistics panel", async () => {
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    const stats = screen.getByRole("region", { name: /board statistics/i });
    expect(stats).toBeInTheDocument();
    expect(within(stats).getByText("8")).toBeInTheDocument();
  });

  it("quick-adds a card with due date and priority", async () => {
    const fetchMock = mockBoardFetch();
    render(<KanbanBoard {...defaultProps} />);
    const column = await screen.findByTestId("column-col-backlog");

    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Quick card");
    await userEvent.type(within(column).getByLabelText("Due date"), "2026-12-31");
    await userEvent.click(within(column).getByRole("button", { name: /^High$/i }));
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("Quick card")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/data",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"due_date":"2026-12-31"'),
      })
    );
  });

  it("archives a card via the archive button", async () => {
    mockBoardFetch();
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /archive Align roadmap themes/i }));

    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("duplicates a card", async () => {
    mockBoardFetch();
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    expect(screen.getAllByText("Align roadmap themes")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /duplicate Align roadmap themes/i }));

    expect(screen.getByText("Align roadmap themes (copy)")).toBeInTheDocument();
  });

  it("opens activity drawer from header button", async () => {
    mockBoardFetch();
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getByRole("button", { name: /open activity/i }));

    expect(await screen.findByRole("dialog", { name: /board activity/i })).toBeVisible();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("opens archive drawer from header button", async () => {
    mockBoardFetch();
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getByRole("button", { name: /open archive/i }));

    expect(await screen.findByRole("dialog", { name: /card archive/i })).toBeVisible();
    expect(screen.getByText("No archived cards")).toBeInTheDocument();
  });

  it("shows checklist section in card modal and adds an item", async () => {
    mockBoardFetch();
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getAllByRole("button", { name: /edit /i })[0]);
    expect(screen.getByRole("region", { name: /checklist/i })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Add checklist item"), "Write tests");
    await userEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    expect(await screen.findByText("Write tests")).toBeInTheDocument();
  });

  it("shows comments section in card modal and posts a comment", async () => {
    mockBoardFetch();
    render(<KanbanBoard {...defaultProps} username="user" />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getAllByRole("button", { name: /edit /i })[0]);
    expect(screen.getByRole("region", { name: /comments/i })).toBeInTheDocument();
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Add a comment"), "Looks great!");
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));

    expect(await screen.findByText("Looks great!")).toBeInTheDocument();
  });

  it("shows wip limit count in column header when set", async () => {
    const boardWithLimit = {
      ...initialData,
      columns: initialData.columns.map((c, i) =>
        i === 0 ? { ...c, wip_limit: 5 } : c
      ),
    };
    mockBoardFetch(boardWithLimit);
    render(<KanbanBoard {...defaultProps} />);

    const column = await screen.findByTestId("column-col-backlog");
    expect(within(column).getByText(/2 \/ 5/i)).toBeInTheDocument();
  });

  it("shows over-limit warning when cards exceed wip limit", async () => {
    const boardOverLimit = {
      ...initialData,
      columns: initialData.columns.map((c, i) =>
        i === 0 ? { ...c, wip_limit: 1 } : c
      ),
    };
    mockBoardFetch(boardOverLimit);
    render(<KanbanBoard {...defaultProps} />);

    const column = await screen.findByTestId("column-col-backlog");
    expect(within(column).getByText(/over/i)).toBeInTheDocument();
    expect(within(column).getByText(/2 \/ 1/i)).toBeInTheDocument();
  });

  it("shows story points badge on card and SP total in column when estimate is set", async () => {
    const boardWithEstimates = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { ...initialData.cards["card-1"], estimate: 5 },
        "card-2": { ...initialData.cards["card-2"], estimate: 3 },
      },
    };
    mockBoardFetch(boardWithEstimates);
    render(<KanbanBoard {...defaultProps} />);

    const card1 = await screen.findByTestId("card-card-1");
    expect(within(card1).getByText("5 SP")).toBeInTheDocument();

    const column = screen.getByTestId("column-col-backlog");
    expect(within(column).getByText("8 SP")).toBeInTheDocument();
  });
});
