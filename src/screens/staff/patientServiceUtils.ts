import { patientApi } from "../../api/services";
import type { ApiContext, PatientResponse } from "../../api/types";

export async function resolvePatientByInput(apiContext: ApiContext, rawValue: string): Promise<PatientResponse> {
  const value = rawValue.trim();
  if (!value) {
    throw new Error("Patient ID is required");
  }

  try {
    return await patientApi.getByMrn(apiContext, value);
  } catch {
    try {
      return await patientApi.getById(apiContext, value);
    } catch {
      throw new Error("Patient not found. Use the patient ID from registration or lookup.");
    }
  }
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
}

export function formatFieldLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

export function summarizeUnknown(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map(item => summarizeUnknown(item))
      .filter(Boolean)
      .join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
