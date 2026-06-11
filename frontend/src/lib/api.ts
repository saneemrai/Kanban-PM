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
