import type { ApiContext, ApiErrorShape } from "./types";

export class ApiError extends Error implements ApiErrorShape {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

function joinUrl(baseUrl: string, path: string): string {
  const left = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const right = path.startsWith("/") ? path : `/${path}`;
  return `${left}${right}`;
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const record = body as Record<string, unknown>;
  const message =
    (typeof record.error === "string" && record.error) ||
    (typeof record.message === "string" && record.message) ||
    (typeof record.details === "string" && record.details);

  return message || fallback;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function request<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const response = await fetch(joinUrl(baseUrl, path), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const body = await parseResponseBody(response);
  if (!response.ok) {
    throw new ApiError(response.status, extractErrorMessage(body, `HTTP ${response.status}`), body);
  }

  return body as T;
}

export async function authedRequest<T>(
  ctx: ApiContext,
  path: string,
  options: Omit<RequestOptions, "token"> = {}
): Promise<T> {
  return request<T>(ctx.baseUrl, path, { ...options, token: ctx.token });
}
