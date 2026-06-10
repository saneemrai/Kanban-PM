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

export const createBoard = async (
  sessionToken: string,
  title: string
): Promise<BoardSummary> => {
  const response = await fetch("/api/boards", {
    method: "POST",
    headers: {
      ...sessionHeaders(sessionToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  return parseResponse(response);
};

export const renameBoard = async (
  sessionToken: string,
  boardId: number,
  title: string
): Promise<void> => {
  const response = await fetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    headers: {
      ...sessionHeaders(sessionToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
};

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
