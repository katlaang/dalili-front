export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Request failed";
}

export function safeTrim(value: string): string {
  return value.trim();
}
