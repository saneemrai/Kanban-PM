import type { BoardData } from "@/lib/kanban";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

type LoginResponse = {
  username: string;
  sessionToken: string;
};

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiChatResponse = {
  message: string;
  boardChanged: boolean;
  board: BoardData | null;
};

export type BoardSummary = {
  id: number;
  title: string;
  description: string;
  cardCount: number;
  overdueCount: number;
  updatedAt: string;
};

const sessionHeaders = (sessionToken: string) => ({
  "X-PM-Session": sessionToken,
});

const parseResponse = async (response: Response) => {
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
  return response.json();
};

export const register = async (
  username: string,
  password: string
): Promise<LoginResponse> => {
  const response = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return parseResponse(response);
};

export const login = async (
  username: string,
  password: string
): Promise<LoginResponse> => {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  return parseResponse(response);
};

export const logout = async (sessionToken: string): Promise<void> => {
  await fetch("/api/logout", {
    method: "POST",
    headers: sessionHeaders(sessionToken),
  });
};

export const changePassword = async (
  sessionToken: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const response = await fetch("/api/user/password", {
    method: "POST",
    headers: { ...sessionHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
};

export const checkSession = async (sessionToken: string): Promise<void> => {
  const response = await fetch("/api/session", {
    headers: sessionHeaders(sessionToken),
  });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
};

export const fetchBoards = async (sessionToken: string): Promise<BoardSummary[]> => {
  const response = await fetch("/api/boards", {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export type BoardTemplate = "default" | "sprint" | "kanban" | "feature";

export const BOARD_TEMPLATES: { value: BoardTemplate; label: string; description: string }[] = [
  { value: "default", label: "Project Board", description: "Backlog / Discovery / In Progress / Review / Done" },
  { value: "sprint", label: "Sprint Board", description: "Backlog / Selected / In Progress / Testing / Done" },
  { value: "kanban", label: "Kanban Flow", description: "Backlog / Ready / In Progress / Review / Done" },
  { value: "feature", label: "Feature Pipeline", description: "Ideas / Design / Build / Test / Released" },
];

export const createBoard = async (
  sessionToken: string,
  title: string,
  template: BoardTemplate = "default",
  description = ""
): Promise<BoardSummary> => {
  const response = await fetch("/api/boards", {
    method: "POST",
    headers: {
      ...sessionHeaders(sessionToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, template, description }),
  });
  return parseResponse(response);
};

export const updateBoardMeta = async (
  sessionToken: string,
  boardId: number,
  title: string,
  description: string
): Promise<void> => {
  const response = await fetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    headers: {
      ...sessionHeaders(sessionToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, description }),
  });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
};

export const renameBoard = async (
  sessionToken: string,
  boardId: number,
  title: string
): Promise<void> => updateBoardMeta(sessionToken, boardId, title, "");

export const deleteBoard = async (
  sessionToken: string,
  boardId: number
): Promise<void> => {
  const response = await fetch(`/api/boards/${boardId}`, {
    method: "DELETE",
    headers: sessionHeaders(sessionToken),
  });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
};

export const fetchBoard = async (
  sessionToken: string,
  boardId: number
): Promise<BoardData> => {
  const response = await fetch(`/api/boards/${boardId}/data`, {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const saveBoard = async (
  sessionToken: string,
  boardId: number,
  board: BoardData
): Promise<BoardData> => {
  const response = await fetch(`/api/boards/${boardId}/data`, {
    method: "PUT",
    headers: {
      ...sessionHeaders(sessionToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(board),
  });
  return parseResponse(response);
};

export type ActivityEvent = {
  id: number;
  actor: string;
  action: string;
  cardId: string | null;
  cardTitle: string | null;
  meta: Record<string, string>;
  createdAt: string;
};

export const listActivity = async (
  sessionToken: string,
  boardId: number
): Promise<ActivityEvent[]> => {
  const response = await fetch(`/api/boards/${boardId}/activity`, {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export type ArchivedCard = {
  id: string;
  title: string;
  details: string;
  priority: string | null;
  due_date: string | null;
  labels: string[];
};

export const listArchivedCards = async (
  sessionToken: string,
  boardId: number
): Promise<ArchivedCard[]> => {
  const response = await fetch(`/api/boards/${boardId}/archive`, {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const archiveCard = async (
  sessionToken: string,
  boardId: number,
  cardId: string
): Promise<import("@/lib/kanban").BoardData> => {
  const response = await fetch(`/api/boards/${boardId}/cards/${cardId}/archive`, {
    method: "POST",
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const restoreCard = async (
  sessionToken: string,
  boardId: number,
  cardId: string
): Promise<import("@/lib/kanban").BoardData> => {
  const response = await fetch(`/api/boards/${boardId}/cards/${cardId}/restore`, {
    method: "POST",
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export type ChecklistItem = {
  id: number;
  text: string;
  done: boolean;
};

export const listChecklist = async (
  sessionToken: string,
  boardId: number,
  cardId: string
): Promise<ChecklistItem[]> => {
  const response = await fetch(`/api/boards/${boardId}/cards/${cardId}/checklist`, {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const addChecklistItem = async (
  sessionToken: string,
  boardId: number,
  cardId: string,
  text: string
): Promise<ChecklistItem> => {
  const response = await fetch(`/api/boards/${boardId}/cards/${cardId}/checklist`, {
    method: "POST",
    headers: { ...sessionHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return parseResponse(response);
};

export const toggleChecklistItem = async (
  sessionToken: string,
  boardId: number,
  itemId: number,
  done: boolean
): Promise<ChecklistItem> => {
  const response = await fetch(`/api/boards/${boardId}/checklist/${itemId}`, {
    method: "PATCH",
    headers: { ...sessionHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ done }),
  });
  return parseResponse(response);
};

export const deleteChecklistItem = async (
  sessionToken: string,
  boardId: number,
  itemId: number
): Promise<void> => {
  const response = await fetch(`/api/boards/${boardId}/checklist/${itemId}`, {
    method: "DELETE",
    headers: sessionHeaders(sessionToken),
  });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
};

export type Comment = {
  id: number;
  author: string;
  body: string;
  created_at: string;
};

export const listComments = async (
  sessionToken: string,
  boardId: number,
  cardId: string
): Promise<Comment[]> => {
  const response = await fetch(`/api/boards/${boardId}/cards/${cardId}/comments`, {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const addComment = async (
  sessionToken: string,
  boardId: number,
  cardId: string,
  body: string
): Promise<Comment> => {
  const response = await fetch(`/api/boards/${boardId}/cards/${cardId}/comments`, {
    method: "POST",
    headers: { ...sessionHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return parseResponse(response);
};

export const deleteComment = async (
  sessionToken: string,
  boardId: number,
  commentId: number
): Promise<void> => {
  const response = await fetch(`/api/boards/${boardId}/comments/${commentId}`, {
    method: "DELETE",
    headers: sessionHeaders(sessionToken),
  });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
};

export type CardLinkEntry = { id: string; title: string };
export type CardLinks = { blocking: CardLinkEntry[]; blockedBy: CardLinkEntry[] };

export const listCardLinks = async (
  sessionToken: string,
  boardId: number,
  cardId: string
): Promise<CardLinks> => {
  const response = await fetch(`/api/boards/${boardId}/cards/${cardId}/links`, {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const addCardLink = async (
  sessionToken: string,
  boardId: number,
  fromCardId: string,
  toCardId: string
): Promise<CardLinks> => {
  const response = await fetch(`/api/boards/${boardId}/cards/${fromCardId}/links`, {
    method: "POST",
    headers: { ...sessionHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ toCardId }),
  });
  return parseResponse(response);
};

export const deleteCardLink = async (
  sessionToken: string,
  boardId: number,
  fromCardId: string,
  toCardId: string
): Promise<CardLinks> => {
  const response = await fetch(`/api/boards/${boardId}/cards/${fromCardId}/links/${toCardId}`, {
    method: "DELETE",
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export type SessionInfo = { id: number; createdAt: string; isCurrent: boolean };

export const listSessions = async (sessionToken: string): Promise<SessionInfo[]> => {
  const response = await fetch("/api/user/sessions", {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const revokeSession = async (sessionToken: string, sessionId: number): Promise<void> => {
  const response = await fetch(`/api/user/sessions/${sessionId}`, {
    method: "DELETE",
    headers: sessionHeaders(sessionToken),
  });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
};

export type BoardLabel = { id: number; name: string; color: string };

export const LABEL_COLORS: { value: string; label: string }[] = [
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Yellow" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
  { value: "gray", label: "Gray" },
];

export const listBoardLabels = async (sessionToken: string, boardId: number): Promise<BoardLabel[]> => {
  const response = await fetch(`/api/boards/${boardId}/labels`, {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const addBoardLabel = async (sessionToken: string, boardId: number, name: string, color: string): Promise<BoardLabel> => {
  const response = await fetch(`/api/boards/${boardId}/labels`, {
    method: "POST",
    headers: { ...sessionHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  return parseResponse(response);
};

export const updateBoardLabel = async (sessionToken: string, boardId: number, labelId: number, name?: string, color?: string): Promise<BoardLabel> => {
  const response = await fetch(`/api/boards/${boardId}/labels/${labelId}`, {
    method: "PATCH",
    headers: { ...sessionHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  return parseResponse(response);
};

export const deleteBoardLabel = async (sessionToken: string, boardId: number, labelId: number): Promise<void> => {
  const response = await fetch(`/api/boards/${boardId}/labels/${labelId}`, {
    method: "DELETE",
    headers: sessionHeaders(sessionToken),
  });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
};

export type SearchResult = {
  type: "board" | "card";
  boardId: number;
  boardTitle: string;
  cardId: string | null;
  cardTitle: string | null;
  cardDetails: string | null;
  columnTitle: string | null;
};

export type ColumnStats = {
  columnKey: string;
  columnTitle: string;
  cardCount: number;
  totalPoints: number;
};

export type BoardStats = {
  totalCards: number;
  doneCards: number;
  overdueCards: number;
  completionRate: number;
  totalPoints: number;
  donePoints: number;
  byColumn: ColumnStats[];
  byPriority: Record<string, number>;
  byAssignee: { assignee: string; count: number }[];
};

export const fetchBoardStats = async (sessionToken: string, boardId: number): Promise<BoardStats> => {
  const response = await fetch(`/api/boards/${boardId}/stats`, {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const cloneBoard = async (
  sessionToken: string,
  boardId: number,
  title: string
): Promise<BoardSummary> => {
  const response = await fetch(`/api/boards/${boardId}/clone`, {
    method: "POST",
    headers: { ...sessionHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return parseResponse(response);
};

export const searchAll = async (
  sessionToken: string,
  query: string
): Promise<SearchResult[]> => {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const sendAiChatMessage = async (
  sessionToken: string,
  boardId: number,
  message: string,
  history: AiChatMessage[]
): Promise<AiChatResponse> => {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      ...sessionHeaders(sessionToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, history, boardId }),
  });
  return parseResponse(response);
};
