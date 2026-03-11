export const staffRoleOptions = [
  "PHYSICIAN",
  "NURSE",
  "PHARMACIST",
  "LAB_TECHNICIAN",
  "RECEPTIONIST"
] as const;

export const queueCategoryOptions = [
  "GENERAL",
  "EMERGENCY",
  "MATERNAL",
  "PEDIATRIC",
  "FOLLOW_UP",
  "LABORATORY",
  "PHARMACY",
  "RADIOLOGY"
] as const;

export const queueViewOptions = [
  "triage",
  "consultation",
  "waiting",
  "today",
  "overdue"
] as const;

export const triageLevelOptions = [
  "RED",
  "ORANGE",
  "YELLOW",
  "GREEN",
  "BLUE"
] as const;

export const sexOptions = ["MALE", "FEMALE", "OTHER", "UNKNOWN"] as const;

export const consciousnessOptions = ["ALERT", "VOICE", "PAIN", "UNRESPONSIVE"] as const;

export const encounterTypeOptions = [
  "NEW_VISIT",
  "FOLLOW_UP",
  "EMERGENCY",
  "ROUTINE_CHECKUP",
  "PROCEDURE"
] as const;

export const diagnosisTypeOptions = [
  "CONFIRMED",
  "WORKING",
  "DIFFERENTIAL",
  "RULED_OUT"
] as const;

export const dosageFormOptions = [
  "TABLET",
  "CAPSULE",
  "SYRUP",
  "SUSPENSION",
  "INJECTION",
  "CREAM",
  "OINTMENT",
  "DROPS",
  "INHALER",
  "SUPPOSITORY",
  "PATCH",
  "POWDER"
] as const;

export const routeOptions = [
  "ORAL",
  "SUBLINGUAL",
  "TOPICAL",
  "INTRAMUSCULAR",
  "INTRAVENOUS",
  "SUBCUTANEOUS",
  "RECTAL",
  "VAGINAL",
  "INHALATION",
  "OPHTHALMIC",
  "OTIC",
  "NASAL"
] as const;

export const addendumTypeOptions = [
  "ADDITION",
  "CORRECTION",
  "CLARIFICATION",
  "LATE_ENTRY",
  "FOLLOW_UP",
  "RESULT_INTERPRETATION",
  "QUERY_RESPONSE"
] as const;

export const addendumReasonOptions = [
  "ERROR_CORRECTION",
  "NEW_INFORMATION",
  "CLARIFICATION_REQUESTED",
  "DELAYED_DOCUMENTATION",
  "TEST_RESULTS",
  "PATIENT_UPDATE",
  "CONSULTATION_FINDINGS",
  "MEDICATION_UPDATE",
  "DIAGNOSIS_REFINEMENT",
  "QUALITY_REVIEW",
  "LEGAL_REQUIREMENT",
  "OTHER"
] as const;
