export type SessionActor = "STAFF" | "PATIENT" | "KIOSK";

export interface ApiContext {
  baseUrl: string;
  token: string;
}

export interface ApiErrorShape {
  status: number;
  message: string;
  details?: unknown;
}

export interface LoginResponse {
  token: string | null;
  message: string;
  role?: string | null;
}

export interface HealthResponse {
  status?: string;
  message?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface QueueTicket {
  id: string;
  patientId: string;
  queueDate: string;
  ticketNumber: string;
  category: string;
  triageLevel: string;
  status: string;
  triaged: boolean;
  triageAssessmentId?: string;
  effectivePriority?: number;
  initialComplaint?: string;
  triageSummary?: string;
  suggestedPrimaryDiagnosis?: string;
  suggestedDiagnoses?: string;
  targetWaitMinutes: number;
  overdue: boolean;
  waitTimeMinutes: number;
  missedCallCount: number;
  ambulanceArrival: boolean;
  createdAt: string;
  triagedAt?: string;
  calledAt?: string;
  calledByStaffName?: string;
  counterNumber?: string;
  startedAt?: string;
  completedAt?: string;
  escalationReason?: string;
  admissionReason?: string;
  appointmentId?: string;
  appointmentScheduledAt?: string;
  appointmentWindowOpensAt?: string;
  appointmentWindowClosesAt?: string;
  appointmentPriorityBoostApplied?: boolean;
  appointmentPriorityBoostAppliedAt?: string;
  assignedClinicianUserId?: string;
  assignedClinicianName?: string;
  assignedClinicianEmployeeId?: string;
  clinicianAssignmentSource?: string;
  clinicianHandoffNotes?: string;
  clinicianAssignedAt?: string;
  clinicianAssignedByStaffId?: string;
  clinicianAssignedByStaffName?: string;
  clinicianHandoffAcceptedAt?: string;
  clinicianHandoffAcceptedByStaffId?: string;
  clinicianHandoffAcceptedByStaffName?: string;
}

export interface QueueStats {
  [key: string]: unknown;
}

export interface KioskCheckInResponse {
  patientId: string;
  patientMrn: string;
  patientName: string;
  ticketId: string;
  ticketNumber: string;
  category: string;
  triageLevel: string;
  estimatedWaitMinutes: number;
  consentRecorded?: boolean;
  message: string;
}

export interface PatientResponse {
  id: string;
  mrn: string;
  nationalId?: string;
  fullName: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  sex: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  consentGiven: boolean;
  consentAt?: string;
  active: boolean;
  registeredAt: string;
  lastVisitAt?: string;
}

export interface TriageAssessment {
  id: string;
  patientId: string;
  queueTicketId: string;
  chiefComplaint: string;
  systemTriageLevel?: string;
  finalTriageLevel?: string;
  triageOverridden?: boolean;
  overrideReason?: string;
  assessedAt?: string;
  [key: string]: unknown;
}

export interface EncounterSummary {
  id: string;
  encounterType: string;
  status: string;
  chiefComplaint: string;
  clinicianName: string;
  startedAt: string;
  completedAt?: string;
  diagnosisCount: number;
  medicationCount: number;
  addendumCount: number;
}

export interface EncounterPreview {
  patient?: Record<string, unknown>;
  queue?: Record<string, unknown>;
  triage?: Record<string, unknown>;
  activeMedications?: unknown[];
  alerts?: unknown[];
  recentEncounters?: unknown[];
  repeatCareSummary?: {
    repeatPatientWithCurrentClinician?: boolean;
    currentClinicianId?: string;
    currentClinicianName?: string;
    visitsWithCurrentClinician?: number;
    totalCompletedVisits?: number;
    lastVisitWithCurrentClinicianAt?: string;
  };
  diagnosisHistory?: Array<{
    encounterId?: string;
    date?: string;
    icdCode?: string;
    description?: string;
    primary?: boolean;
    clinicianName?: string;
    fromCurrentClinician?: boolean;
  }>;
  vitalTrends?: Array<{
    assessmentId?: string;
    date?: string;
    bloodPressureSystolic?: number;
    bloodPressureDiastolic?: number;
    heartRateBpm?: number;
    oxygenSaturation?: number;
    temperatureCelsius?: number;
    painScore?: number;
  }>;
  carePlanHistory?: Array<{
    encounterId?: string;
    date?: string;
    clinicianName?: string;
    suggestionSummary?: string;
  }>;
  [key: string]: unknown;
}

export interface EncounterResponse {
  id: string;
  patientId: string;
  queueTicketId?: string;
  triageAssessmentId?: string;
  clinicianId: string;
  clinicianName: string;
  clinicianRole: string;
  encounterType: string;
  status: string;
  chiefComplaint: string;
  hasTranscript: boolean;
  hasAiDraft: boolean;
  hasPhysicianNote: boolean;
  noteConfirmed: boolean;
  aiAccuracyRating?: string;
  transcriptAccuracyScore?: number;
  transcriptDiscrepancySummary?: string;
  diagnosisCount: number;
  medicationCount: number;
  startedAt: string;
  completedAt?: string;
  carePlanAgreementRequired?: boolean;
  carePlanAgreed?: boolean;
  carePlanAgreedAt?: string;
  carePlanAgreedBy?: string;
  diagnosisAgreementRequired?: boolean;
  diagnosisAgreed?: boolean;
  diagnosisAgreedAt?: string;
  diagnosisAgreedBy?: string;
  canModify: boolean;
  canHaveAddendum: boolean;
}

export interface SuggestedMedication {
  name: string;
  dose: string;
  frequency: string;
  route: string;
  reason: string;
  interactionWarnings: string[];
  allergyWarnings: string[];
}

export interface CarePlanSuggestionResult {
  encounterId: string;
  advisoryOnly: boolean;
  warning: string;
  requiresPhysicianAgreement: boolean;
  carePlanAgreed: boolean;
  suggestedAt?: string;
  agreedAt?: string;
  agreedBy?: string;
  diagnosisBasis: string[];
  suggestedLabs: string[];
  suggestedTreatmentPlan: string[];
  suggestedMedications: SuggestedMedication[];
  interactionAlerts: string[];
}

export interface CarePlanAgreementResult {
  encounterId: string;
  carePlanAgreed: boolean;
  agreedAt?: string;
  agreedBy?: string;
}

export interface PrescriptionContent {
  encounterId: string;
  patientName: string;
  mrn: string;
  clinicName: string;
  orderedBy: string;
  orderDate: string;
  prescriptionText: string;
  medicationCount: number;
}

export interface AmbientTranscriptionResult {
  available: boolean;
  transcript?: string;
  provider?: string;
  model?: string;
  latencyMs: number;
  generatedAt?: string;
  errorMessage?: string;
}

export interface AiDraftGenerationResult {
  encounterId: string;
  available: boolean;
  draftNote?: string;
  extractedSymptoms: string[];
  flaggedItems: string[];
  confidence?: string;
  provider?: string;
  model?: string;
  latencyMs: number;
  generatedAt?: string;
  persisted: boolean;
  errorMessage?: string;
}

export interface TriageOutcomeResult {
  assessmentId: string;
  queueTicketId: string;
  ticketNumber: string;
  queueStatus: string;
  queuePosition: number;
  effectivePriority: number;
  waitTimeMinutes: number;
  targetWaitMinutes: number;
  systemTriageLevel: string;
  finalTriageLevel: string;
  triageOverridden: boolean;
  overrideReason?: string;
  triageSummary?: string;
  queueUpdated: boolean;
  returnedToWaitingQueue: boolean;
  suggestedPrimaryDiagnosis?: string;
  suggestedDiagnoses?: string[];
  differential: unknown;
}

export interface PatientPortalProfile {
  id: string;
  mrn: string;
  fullName: string;
  dateOfBirth: string;
  sex: string;
  ageYears?: number;
  phoneNumber?: string;
  email?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface PatientPortalQueueTicket {
  id: string;
  ticketNumber: string;
  category: string;
  triageLevel: string;
  status: string;
  initialComplaint?: string;
  counterNumber?: string;
  active: boolean;
  waitTimeMinutes: number;
  targetWaitMinutes: number;
  queueDate: string;
  createdAt?: string;
  calledAt?: string;
  startedAt?: string;
  completedAt?: string;
  triageSummary?: string;
  suggestedPrimaryDiagnosis?: string;
  admissionReason?: string;
  appointmentId?: string;
  appointmentScheduledAt?: string;
  appointmentWindowOpensAt?: string;
  appointmentWindowClosesAt?: string;
  appointmentPriorityBoostApplied?: boolean;
}

export interface PatientPortalEncounter {
  id: string;
  encounterType: string;
  status: string;
  chiefComplaint?: string;
  clinicianName: string;
  diagnosisCount: number;
  medicationCount: number;
  noteConfirmed: boolean;
  startedAt?: string;
  completedAt?: string;
}

export interface PatientPortalMedication {
  id: string;
  medicationName: string;
  brandName?: string;
  dosage: string;
  dosageForm?: string;
  frequency: string;
  route?: string;
  durationDays: number;
  quantity: number;
  instructions?: string;
  indication?: string;
  status: string;
  orderedByName: string;
  orderedAt?: string;
  printedAt?: string;
  dispensedAt?: string;
}

export interface PatientPortalSnapshot {
  profile: PatientPortalProfile;
  queue: PatientPortalQueueTicket[];
  activeQueueTicket?: PatientPortalQueueTicket;
  recentEncounters: PatientPortalEncounter[];
  recentMedications: PatientPortalMedication[];
  recentLabs?: LabResultView[];
  recentReferrals?: ReferralView[];
  recentNotes?: EncounterNoteView[];
  recentMessages?: PortalMessageView[];
  renewalRequests?: RenewalRequestView[];
  transferRequests?: TransferRequestView[];
  accessScope?: string;
  unreadMessageCount?: number;
}

export interface MedicationWithWarningsView {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  status?: string;
  contraindicationWarnings: string[];
}

export interface ContraindicationResponse {
  knownAllergies?: string;
  medications: MedicationWithWarningsView[];
}

export interface LabResultView {
  id: string;
  encounterId?: string;
  testName: string;
  resultValue?: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
  criticalResult: boolean;
  recordedAt?: string;
  recordedByName?: string;
}

export interface ReferralView {
  id: string;
  encounterId?: string;
  referredToFacility: string;
  specialty: string;
  reason: string;
  status?: string;
  referredAt?: string;
  referredByName?: string;
  notes?: string;
  outputFormat?: string;
  destinationUsesDalili?: boolean;
  printedAt?: string;
}

export interface EncounterNoteView {
  encounterId: string;
  encounterType?: string;
  status?: string;
  clinicianName?: string;
  physicianAuthoredNote?: string;
  finalNote?: string;
  aiDiscrepancySummary?: string;
  transcriptAccuracyScore?: number;
  noteConfirmed: boolean;
  startedAt?: string;
  completedAt?: string;
}

export interface PortalMessageView {
  id: string;
  direction?: string;
  category?: string;
  senderName?: string;
  recipientName?: string;
  subject?: string;
  body: string;
  createdAt?: string;
  readAt?: string;
}

export interface RenewalRequestView {
  id: string;
  medicationOrderId: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  status?: string;
  requestNote?: string;
  requestedAt?: string;
  reviewedAt?: string;
  reviewComments?: string;
}

export interface TransferRequestView {
  id: string;
  sourceFacilityCode: string;
  targetFacilityCode: string;
  reason?: string;
  status?: string;
  emergencyBlocked: boolean;
  destinationUsesDalili?: boolean;
  linkedReferralId?: string;
  requestedAt?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface AuthorizationView {
  id: string;
  authorizationType?: string;
  dataAccessScope?: string;
  authorizerRole?: string;
  authorizerName?: string;
  grantedAt?: string;
  expiresAt?: string;
  revoked: boolean;
}

export interface AccessResolution {
  scope: string;
  reason: string;
  admittedOverride: boolean;
}

export interface AppointmentView {
  id: string;
  appointmentNumber?: string;
  patientId?: string;
  patientName?: string;
  status: string;
  scheduledAt?: string;
  checkInWindowOpensAt?: string;
  checkInWindowClosesAt?: string;
  checkInEligibleNow?: boolean;
  kioskAccessCode?: string;
  kioskQrToken?: string;
  clinicianName?: string;
  clinicianEmployeeId?: string;
  departmentName?: string;
  facilityCode?: string;
  facilityName?: string;
  reason?: string;
  checkedInAt?: string;
  queueTicketId?: string;
  deactivationReason?: string;
}

export interface AppointmentCheckInResponse {
  appointment: AppointmentView;
  queueTicket: QueueTicket;
}

export interface FacilityWorkflowConfig {
  facilityCode: string;
  facilityName: string;
  emergencyFlowEnabled: boolean;
  appointmentFlowEnabled: boolean;
  kioskEnabled: boolean;
  qrCheckInEnabled: boolean;
  patientPortalEnabled: boolean;
  prescriptionRenewalEnabled: boolean;
  aiTranscriptionEnabled: boolean;
  aiDifferentialEnabled: boolean;
  crossFacilityDataEnabled: boolean;
  referralPrintingEnabled: boolean;
  appointmentCheckInWindowMinutes: number;
  appointmentPriorityBoostEnabled: boolean;
  appointmentPriorityBoostMinutesBefore: number;
  appointmentPriorityBoostMinutesAfter: number;
  consentValidityHours: number;
  requireTriageForAppointments: boolean;
  updatedAt?: string;
  updatedBy?: string;
}
