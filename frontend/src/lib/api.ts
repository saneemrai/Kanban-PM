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

const sessionHeaders = (sessionToken: string) => ({
  "X-PM-Session": sessionToken,
});

const parseResponse = async (response: Response) => {
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
  return response.json();
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

export const fetchBoard = async (sessionToken: string): Promise<BoardData> => {
  const response = await fetch("/api/board", {
    headers: sessionHeaders(sessionToken),
  });
  return parseResponse(response);
};

export const saveBoard = async (
  sessionToken: string,
  board: BoardData
): Promise<BoardData> => {
  const response = await fetch("/api/board", {
    method: "PUT",
    headers: {
      ...sessionHeaders(sessionToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(board),
  });
  return parseResponse(response);
};
