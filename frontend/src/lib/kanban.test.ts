import { columnEndDropId, moveCard, sortCards, type Card, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("reorders cards after a target card in the same column", () => {
    const result = moveCard(baseColumns, "card-1", "card-2", "after");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("drops cards to a column end target", () => {
    const result = moveCard(baseColumns, "card-1", columnEndDropId("col-b"));
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves cards after a target card in another column", () => {
    const result = moveCard(baseColumns, "card-1", "card-3", "after");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("sortCards", () => {
  const cards: Card[] = [
    { id: "c1", title: "Zebra task", details: "", priority: "low" },
    { id: "c2", title: "Alpha task", details: "", priority: "critical", due_date: "2025-01-10" },
    { id: "c3", title: "Middle task", details: "", priority: "high", due_date: "2025-03-05" },
    { id: "c4", title: "Beta task", details: "", priority: undefined, due_date: "2025-02-20" },
  ];

  it("default mode preserves order", () => {
    expect(sortCards(cards, "default").map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("title mode sorts alphabetically", () => {
    expect(sortCards(cards, "title").map((c) => c.id)).toEqual(["c2", "c4", "c3", "c1"]);
  });

  it("priority mode sorts critical first, no-priority last", () => {
    const ids = sortCards(cards, "priority").map((c) => c.id);
    expect(ids[0]).toBe("c2");
    expect(ids[ids.length - 1]).toBe("c4");
  });

  it("due_date mode sorts earliest first, no-date last", () => {
    const ids = sortCards(cards, "due_date").map((c) => c.id);
    expect(ids[0]).toBe("c2");
    expect(ids[ids.length - 1]).toBe("c1");
  });
});
