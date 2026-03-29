import { ApiError, authedRequest, request } from "./client";
import type {
  AccessResolution,
  AdminActiveSession,
  AdminAuditEvent,
  AdminStaffAccount,
  AdminUserAccount,
  AppointmentCheckInResponse,
  AppointmentView,
  AiDraftGenerationResult,
  AmbientTranscriptionResult,
  ApiContext,
  ClinicalDashboard,
  CarePlanAgreementResult,
  CarePlanSuggestionResult,
  ContraindicationResponse,
  CurrentUserProfile,
  ChartAccessLogEntry,
  ChartAccessLogResponse,
  EncounterAccessLogEntry,
  EncounterPreview,
  EncounterNoteView,
  EncounterResponse,
  EncounterSummary,
  FacilityWorkflowConfig,
  FrontDeskPatientLookup,
  HealthResponse,
  LabResultView,
  KioskCheckInResponse,
  LoginResponse,
  MessageThreadDetail,
  MessageThreadSummary,
  PortalMessageView,
  PatientPortalEncounter,
  PatientPortalMedication,
  PatientPortalProfile,
  PatientPortalQueueTicket,
  PatientPortalSnapshot,
  PatientResponse,
  QueueStats,
  QueueTicket,
  ReferralView,
  RenewalRequestView,
  PrescriptionContent,
  TransferRequestView,
  TriageOutcomeResult,
  TriageAssessment,
  AuthorizationView,
  DelegatedInstructionView,
  StaffRecipientView,
} from "./types";

type UploadAudioPart = Blob | { uri: string; name: string; type: string };

async function parseUnknownResponse(response: Response): Promise<unknown> {
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

async function requestWithFallback<T>(
  ctx: ApiContext,
  attempts: Array<{ path: string; body?: Record<string, unknown> }>
) {
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      return await authedRequest<T>(ctx, attempt.path, {
        method: "POST",
        body: attempt.body,
      });
    } catch (error) {
      lastError = error;
      if (!(error instanceof ApiError) || ![400, 404, 405].includes(error.status)) {
        throw error;
      }
    }
  }

  throw lastError;
}

export const authApi = {
  loginStaff: (baseUrl: string, username: string, password: string) =>
    request<LoginResponse>(baseUrl, "/api/auth/staff/login", {
      method: "POST",
      body: { username, password }
    }),

  loginPatient: (baseUrl: string, username: string, password: string) =>
    request<LoginResponse>(baseUrl, "/api/auth/patient/login", {
      method: "POST",
      body: { username, password }
    }),

  loginKioskDevice: (baseUrl: string, deviceId: string, deviceSecret: string) =>
    request<LoginResponse>(baseUrl, "/api/auth/kiosk/login", {
      method: "POST",
      body: { deviceId, deviceSecret }
    }),

  kioskCheckIn: (baseUrl: string, kioskDeviceId: string, mrn: string, dateOfBirth: string) =>
    request<LoginResponse>(baseUrl, "/api/auth/kiosk/checkin", {
      method: "POST",
      body: { kioskDeviceId, mrn, dateOfBirth }
    }),

  kioskIdentifyByName: (
    baseUrl: string,
    kioskDeviceId: string,
    givenName: string,
    familyName: string,
    dateOfBirth: string,
    sex: string
  ) =>
    request<LoginResponse>(baseUrl, "/api/auth/kiosk/identify", {
      method: "POST",
      body: { kioskDeviceId, givenName, familyName, dateOfBirth, sex }
    }),

  logout: (ctx: ApiContext) =>
    authedRequest<{ message: string }>(ctx, "/api/auth/logout", {
      method: "POST"
    }),

  changePassword: (
    ctx: ApiContext,
    payload: { currentPassword: string; newPassword: string }
  ) =>
    authedRequest<{ message: string }>(ctx, "/api/auth/change-password", {
      method: "POST",
      body: payload
    }),

  getCurrentProfile: (ctx: ApiContext) =>
    authedRequest<CurrentUserProfile>(ctx, "/api/auth/me"),

  bootstrapSuperAdmin: (
    baseUrl: string,
    payload: {
      username: string;
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      company: string;
    }
  ) =>
    request<{ userId: string; username: string; message: string }>(baseUrl, "/api/auth/super-admin/bootstrap", {
      method: "POST",
      body: payload
    }),

  getSuperAdminBootstrapStatus: (baseUrl: string) =>
    request<{ bootstrapAllowed: boolean }>(baseUrl, "/api/auth/super-admin/bootstrap-status"),

  registerAdmin: (
    ctx: ApiContext,
    payload: {
      username: string;
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      company: string;
    }
  ) =>
    authedRequest<{ userId: string; username: string; message: string }>(ctx, "/api/auth/admin/register", {
      method: "POST",
      body: payload
    }),

  registerStaff: (
    ctx: ApiContext,
    payload: {
      username: string;
      password: string;
      firstName: string;
      lastName: string;
      email: string;
      role: string;
    }
  ) =>
    authedRequest<{ userId: string; message: string }>(ctx, "/api/auth/staff/register", {
      method: "POST",
      body: payload
    }),

  registerPatientUser: (
    ctx: ApiContext,
    payload: { username: string; password: string; patientId: string }
  ) =>
    authedRequest<{ userId: string; message: string }>(ctx, "/api/auth/patient/register", {
      method: "POST",
      body: payload
    }),

  registerKiosk: (
    ctx: ApiContext,
    payload: { deviceId: string; deviceSecret: string; locationDescription: string }
  ) =>
    authedRequest<{ userId: string; message: string }>(ctx, "/api/auth/kiosk/register", {
      method: "POST",
      body: payload
    })
};

export const adminPortalApi = {
  getUsers: (ctx: ApiContext) =>
    authedRequest<AdminUserAccount[]>(ctx, "/api/admin/users"),

  getStaffAccounts: (ctx: ApiContext) =>
    authedRequest<AdminStaffAccount[]>(ctx, "/api/admin/super/staff-accounts"),

  getActiveSessions: (ctx: ApiContext) =>
    authedRequest<AdminActiveSession[]>(ctx, "/api/admin/super/active-sessions"),

  getAuditEvents: (ctx: ApiContext, limit = 100) =>
    authedRequest<AdminAuditEvent[]>(
      ctx,
      `/api/admin/super/audit-events?limit=${encodeURIComponent(String(limit))}`
    )
};

export const healthApi = {
  getHealth: (baseUrl: string) => request<HealthResponse>(baseUrl, "/health"),
  getAuditHealth: (baseUrl: string) => request<HealthResponse>(baseUrl, "/audit/health")
};

export const facilityApi = {
  getWorkflowConfig: (ctx: ApiContext) =>
    authedRequest<FacilityWorkflowConfig>(ctx, "/api/facility/workflow-config"),

  updateWorkflowConfig: (ctx: ApiContext, payload: Partial<FacilityWorkflowConfig>) =>
    authedRequest<FacilityWorkflowConfig>(ctx, "/api/facility/workflow-config", {
      method: "PUT",
      body: payload
    })
};

export const patientApi = {
  registerFull: (ctx: ApiContext, payload: Record<string, unknown>) =>
    authedRequest<PatientResponse>(ctx, "/api/patients/register/full", {
      method: "POST",
      body: payload
    }),

  getByMrn: (ctx: ApiContext, mrn: string) =>
    authedRequest<PatientResponse>(ctx, `/api/patients/mrn/${encodeURIComponent(mrn)}`),

  getById: (ctx: ApiContext, patientId: string) => authedRequest<PatientResponse>(ctx, `/api/patients/${patientId}`),

  updateContact: (
    ctx: ApiContext,
    patientId: string,
    payload: { phoneNumber?: string; email?: string; address?: string }
  ) =>
    authedRequest<PatientResponse>(ctx, `/api/patients/${patientId}/contact`, {
      method: "PUT",
      body: payload
    }),

  updateEmergencyContact: (
    ctx: ApiContext,
    patientId: string,
    payload: { name?: string; phone?: string }
  ) =>
    authedRequest<PatientResponse>(ctx, `/api/patients/${patientId}/emergency-contact`, {
      method: "PUT",
      body: payload
    }),

  recordConsent: (ctx: ApiContext, patientId: string) =>
    authedRequest<PatientResponse>(ctx, `/api/patients/${patientId}/consent`, {
      method: "POST"
    })
};

export const frontDeskApi = {
  lookupPatientByMrnAndDob: (ctx: ApiContext, mrn: string, dateOfBirth: string) =>
    authedRequest<FrontDeskPatientLookup>(
      ctx,
      `/api/frontdesk/patient-lookup?mrn=${encodeURIComponent(mrn)}&dateOfBirth=${encodeURIComponent(dateOfBirth)}`
    )
};

export const patientPortalApi = {
  getSnapshot: (ctx: ApiContext) =>
    authedRequest<PatientPortalSnapshot>(ctx, "/api/patient/portal/snapshot"),

  getAllRecords: (ctx: ApiContext) =>
    authedRequest<Record<string, unknown>>(ctx, "/api/patient/portal/records"),

  getProfile: (ctx: ApiContext) =>
    authedRequest<PatientPortalProfile>(ctx, "/api/patient/portal/profile"),

  getQueue: (ctx: ApiContext) =>
    authedRequest<PatientPortalQueueTicket[]>(ctx, "/api/patient/portal/queue"),

  checkIn: (
    ctx: ApiContext,
    payload: { category: string; complaint?: string; consentForDataAccess?: boolean }
  ) =>
    authedRequest<PatientPortalQueueTicket>(ctx, "/api/patient/portal/checkin", {
      method: "POST",
      body: payload
    }),

  getEncounters: (ctx: ApiContext) =>
    authedRequest<PatientPortalEncounter[]>(ctx, "/api/patient/portal/encounters"),

  getMedications: (ctx: ApiContext) =>
    authedRequest<PatientPortalMedication[]>(ctx, "/api/patient/portal/medications"),

  getMedicationContraindications: (ctx: ApiContext) =>
    authedRequest<ContraindicationResponse>(ctx, "/api/patient/portal/medications/contraindications"),

  getLabs: (ctx: ApiContext) =>
    authedRequest<LabResultView[]>(ctx, "/api/patient/portal/labs"),

  getReferrals: (ctx: ApiContext) =>
    authedRequest<ReferralView[]>(ctx, "/api/patient/portal/referrals"),

  getNotes: (ctx: ApiContext) =>
    authedRequest<EncounterNoteView[]>(ctx, "/api/patient/portal/notes"),

  getMessages: (ctx: ApiContext) =>
    authedRequest<PortalMessageView[]>(ctx, "/api/patient/portal/messages"),

  getMessageThreads: (ctx: ApiContext) =>
    authedRequest<MessageThreadSummary[]>(ctx, "/api/patient/portal/messages/threads"),

  getMessageThread: (ctx: ApiContext, threadId: string) =>
    authedRequest<MessageThreadDetail>(ctx, `/api/patient/portal/messages/threads/${threadId}`),

  sendMessage: (
    ctx: ApiContext,
    payload: {
      category?: string;
      subject?: string;
      body: string;
      targetStaffId?: string;
      linkedEncounterId?: string;
      linkedMedicationOrderId?: string;
      linkedLabResultId?: string;
      linkedReferralId?: string;
    }
  ) =>
    authedRequest<PortalMessageView>(ctx, "/api/patient/portal/messages", {
      method: "POST",
      body: payload
    }),

  createMessageThread: (
    ctx: ApiContext,
    payload: {
      category?: string;
      subject?: string;
      body: string;
      targetStaffId?: string;
      linkedEncounterId?: string;
      linkedMedicationOrderId?: string;
      linkedLabResultId?: string;
      linkedReferralId?: string;
    }
  ) =>
    authedRequest<MessageThreadDetail>(ctx, "/api/patient/portal/messages/threads", {
      method: "POST",
      body: payload
    }),

  replyToThread: (
    ctx: ApiContext,
    threadId: string,
    payload: {
      body: string;
      category?: string;
      linkedEncounterId?: string;
      linkedMedicationOrderId?: string;
      linkedLabResultId?: string;
      linkedReferralId?: string;
    }
  ) =>
    authedRequest<MessageThreadDetail>(ctx, `/api/patient/portal/messages/threads/${threadId}/reply`, {
      method: "POST",
      body: payload
    }),

  markMessageRead: (ctx: ApiContext, messageId: string) =>
    authedRequest<PortalMessageView>(ctx, `/api/patient/portal/messages/${messageId}/read`, {
      method: "POST"
    }),

  getRenewals: (ctx: ApiContext) =>
    authedRequest<RenewalRequestView[]>(ctx, "/api/patient/portal/renewals"),

  requestRenewal: (ctx: ApiContext, medicationOrderId: string, note?: string) =>
    authedRequest<RenewalRequestView>(ctx, "/api/patient/portal/renewals/request", {
      method: "POST",
      body: { medicationOrderId, note }
    }),

  getTransferRequests: (ctx: ApiContext) =>
    authedRequest<TransferRequestView[]>(ctx, "/api/patient/portal/transfers"),

  requestTransfer: (
    ctx: ApiContext,
    payload: {
      sourceFacilityCode: string;
      targetFacilityCode: string;
      reason?: string;
      destinationUsesDalili?: boolean;
    }
  ) =>
    authedRequest<TransferRequestView>(ctx, "/api/patient/portal/transfers/request", {
      method: "POST",
      body: payload
    }),

  recordConsent: (ctx: ApiContext) =>
    authedRequest<AuthorizationView>(ctx, "/api/patient/portal/consent", {
      method: "POST"
    }),

  getAuthorizations: (ctx: ApiContext) =>
    authedRequest<AuthorizationView[]>(ctx, "/api/patient/portal/authorizations"),

  getAccessHistory: (ctx: ApiContext) =>
    authedRequest<ChartAccessLogResponse>(ctx, "/api/patient/portal/access-log")
};

export const patientAppointmentApi = {
  getPending: (ctx: ApiContext) =>
    authedRequest<AppointmentView[]>(ctx, "/api/patient/appointments/pending"),

  getHistory: (ctx: ApiContext) =>
    authedRequest<AppointmentView[]>(ctx, "/api/patient/appointments/history"),

  checkIn: (
    ctx: ApiContext,
    appointmentId: string,
    payload?: { complaint?: string; consentForDataAccess?: boolean }
  ) =>
    authedRequest<AppointmentCheckInResponse>(ctx, `/api/patient/appointments/${appointmentId}/checkin`, {
      method: "POST",
      body: payload ?? {}
    })
};

export const appointmentApi = {
  schedule: (
    ctx: ApiContext,
    payload: {
      patientId: string;
      scheduledAt: string;
      durationMinutes?: number;
      clinicianId?: string;
      clinicianName?: string;
      clinicianEmployeeId?: string;
      departmentCode?: string;
      departmentName?: string;
      reason?: string;
    }
  ) =>
    authedRequest<AppointmentView>(ctx, "/api/appointments/schedule", {
      method: "POST",
      body: payload
    }),

  getToday: (ctx: ApiContext) =>
    authedRequest<AppointmentView[]>(ctx, "/api/appointments/today"),

  getPendingForPatient: (ctx: ApiContext, patientId: string) =>
    authedRequest<AppointmentView[]>(ctx, `/api/appointments/patient/${patientId}/pending`),

  getAssignedPending: (ctx: ApiContext) =>
    authedRequest<AppointmentView[]>(ctx, "/api/appointments/assigned/pending"),

  checkInByStaff: (
    ctx: ApiContext,
    appointmentId: string,
    payload: { patientId: string; complaint?: string; consentForDataAccess?: boolean }
  ) =>
    authedRequest<AppointmentCheckInResponse>(ctx, `/api/appointments/${appointmentId}/checkin`, {
      method: "POST",
      body: payload
    }),

  cancel: (ctx: ApiContext, appointmentId: string, reason?: string) =>
    authedRequest<AppointmentView>(ctx, `/api/appointments/${appointmentId}/cancel`, {
      method: "POST",
      body: reason ? { reason } : {}
    })
};

export const queueApi = {
  issueTicket: (
    ctx: ApiContext,
    payload: { patientId: string; category: string; initialComplaint?: string | null }
  ) =>
    authedRequest<QueueTicket>(ctx, "/api/queue/issue", {
      method: "POST",
      body: payload
    }),

  issueEmergencyTicket: (ctx: ApiContext, payload: { patientId: string; initialComplaint: string }) =>
    authedRequest<QueueTicket>(ctx, "/api/queue/emergency", {
      method: "POST",
      body: payload
    }),

  getTicket: (ctx: ApiContext, ticketId: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}`),

  getQueue: (ctx: ApiContext, queueKind: "triage" | "consultation" | "waiting" | "today" | "overdue") =>
    authedRequest<QueueTicket[]>(ctx, `/api/queue/${queueKind}`),

  getStats: (ctx: ApiContext) => authedRequest<QueueStats>(ctx, "/api/queue/stats"),

  callNextTriage: (ctx: ApiContext, counterNumber: string) =>
    authedRequest<QueueTicket>(ctx, "/api/queue/call-next/triage", {
      method: "POST",
      body: { counterNumber }
    }),

  callNextConsultation: (ctx: ApiContext, counterNumber: string) =>
    authedRequest<QueueTicket>(ctx, "/api/queue/call-next/consultation", {
      method: "POST",
      body: { counterNumber }
    }),

  callTicket: (ctx: ApiContext, ticketId: string, counterNumber: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/call`, {
      method: "POST",
      body: { counterNumber }
    }),

  markMissedCall: (ctx: ApiContext, ticketId: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/missed-call`, {
      method: "POST"
    }),

  startTicket: (ctx: ApiContext, ticketId: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/start`, {
      method: "POST"
    }),

  returnToWaiting: (ctx: ApiContext, ticketId: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/return-to-waiting`, {
      method: "POST"
    }),

  holdForPregnancyTest: (
    ctx: ApiContext,
    ticketId: string,
    payload?: {
      assessmentId?: string | null;
      reason?: string | null;
      notes?: string | null;
    }
  ) =>
    requestWithFallback<QueueTicket>(ctx, [
      {
        path: `/api/queue/${ticketId}/hold/pregnancy-test`,
        body: payload ?? {},
      },
      {
        path: `/api/queue/${ticketId}/hold/ancillary`,
        body: {
          ancillaryStepCode: "PREGNANCY_TEST",
          ancillaryStepLabel: "Pregnancy Test",
          ...payload,
        },
      },
      {
        path: `/api/queue/${ticketId}/waiting-for-pregnancy-test`,
        body: payload ?? {},
      },
    ]),

  resumeAncillaryHold: (
    ctx: ApiContext,
    ticketId: string,
    payload?: {
      ancillaryStepCode?: string | null;
      notes?: string | null;
    }
  ) =>
    requestWithFallback<QueueTicket>(ctx, [
      {
        path: `/api/queue/${ticketId}/resume/pregnancy-test`,
        body: payload ?? {},
      },
      {
        path: `/api/queue/${ticketId}/resume/ancillary`,
        body: {
          ancillaryStepCode: payload?.ancillaryStepCode ?? "PREGNANCY_TEST",
          notes: payload?.notes ?? null,
        },
      },
      {
        path: `/api/queue/${ticketId}/resume`,
        body: {
          ancillaryStepCode: payload?.ancillaryStepCode ?? "PREGNANCY_TEST",
          notes: payload?.notes ?? null,
        },
      },
    ]),

  completeTicket: (ctx: ApiContext, ticketId: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/complete`, {
      method: "POST"
    }),

  admitTicket: (ctx: ApiContext, ticketId: string, reason?: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/admit`, {
      method: "POST",
      body: reason ? { reason } : {}
    }),

  markNoShow: (ctx: ApiContext, ticketId: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/no-show`, {
      method: "POST"
    }),

  cancelTicket: (ctx: ApiContext, ticketId: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/cancel`, {
      method: "POST"
    }),

  escalateTicket: (ctx: ApiContext, ticketId: string, newTriageLevel: string, reason: string) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/escalate`, {
      method: "POST",
      body: { newTriageLevel, reason }
    }),

  handoffToClinician: (
    ctx: ApiContext,
    ticketId: string,
    payload: {
      clinicianName: string;
      clinicianEmployeeId: string;
      clinicianUserId?: string | null;
      handoffNotes?: string | null;
    }
  ) =>
    authedRequest<QueueTicket>(ctx, `/api/queue/${ticketId}/handoff`, {
      method: "POST",
      body: payload
    }),

  getTriageOutcome: (ctx: ApiContext, ticketId: string, physicalExam?: string) =>
    authedRequest<TriageOutcomeResult>(ctx, `/api/queue/${ticketId}/triage-outcome`, {
      method: "POST",
      body: physicalExam ? { physicalExam } : {}
    })
};

export const triageApi = {
  beginAssessment: (ctx: ApiContext, queueTicketId: string, chiefComplaint: string) =>
    authedRequest<TriageAssessment>(ctx, "/api/triage/begin", {
      method: "POST",
      body: { queueTicketId, chiefComplaint }
    }),

  beginReassessment: (ctx: ApiContext, queueTicketId: string) =>
    authedRequest<TriageAssessment>(ctx, `/api/triage/reassess/${queueTicketId}`, {
      method: "POST"
    }),

  recordVitals: (ctx: ApiContext, assessmentId: string, payload: unknown) =>
    authedRequest<TriageAssessment>(ctx, `/api/triage/${assessmentId}/vitals`, {
      method: "POST",
      body: payload
    }),

  recordRedFlags: (ctx: ApiContext, assessmentId: string, payload: unknown) =>
    authedRequest<TriageAssessment>(ctx, `/api/triage/${assessmentId}/red-flags`, {
      method: "POST",
      body: payload
    }),

  recordObservations: (ctx: ApiContext, assessmentId: string, payload: unknown) =>
    authedRequest<TriageAssessment>(ctx, `/api/triage/${assessmentId}/observations`, {
      method: "POST",
      body: payload
    }),

  acceptSystemTriage: (ctx: ApiContext, assessmentId: string) =>
    authedRequest<TriageAssessment>(ctx, `/api/triage/${assessmentId}/accept`, {
      method: "POST"
    }),

  overrideTriage: (ctx: ApiContext, assessmentId: string, payload: { newTriageLevel: string; reason: string }) =>
    authedRequest<TriageAssessment>(ctx, `/api/triage/${assessmentId}/override`, {
      method: "POST",
      body: payload
    }),

  getAssessment: (ctx: ApiContext, assessmentId: string) =>
    authedRequest<TriageAssessment>(ctx, `/api/triage/${assessmentId}`),

  getAssessmentForTicket: (ctx: ApiContext, queueTicketId: string) =>
    authedRequest<TriageAssessment>(ctx, `/api/triage/ticket/${queueTicketId}`),

  getSummary: (ctx: ApiContext, assessmentId: string) =>
    authedRequest<{ summary: string }>(ctx, `/api/triage/${assessmentId}/summary`),

  getOutcome: (ctx: ApiContext, assessmentId: string, physicalExam?: string) =>
    authedRequest<TriageOutcomeResult>(ctx, `/api/triage/${assessmentId}/outcome`, {
      method: "POST",
      body: physicalExam ? { physicalExam } : {}
    })
};

export const encounterApi = {
  getClinicalDashboard: (ctx: ApiContext) =>
    authedRequest<ClinicalDashboard>(ctx, "/api/encounters/dashboard/clinical"),

  getPreview: (ctx: ApiContext, queueTicketId: string) =>
    authedRequest<EncounterPreview>(ctx, `/api/encounters/preview/queue/${queueTicketId}`),

  createFromQueue: (ctx: ApiContext, queueTicketId: string, encounterType: string) =>
    authedRequest<EncounterResponse>(ctx, "/api/encounters/from-queue", {
      method: "POST",
      body: { queueTicketId, encounterType }
    }),

  createStandalone: (ctx: ApiContext, payload: { patientId: string; encounterType: string; chiefComplaint: string }) =>
    authedRequest<EncounterResponse>(ctx, "/api/encounters/standalone", {
      method: "POST",
      body: payload
    }),

  getEncounter: (ctx: ApiContext, encounterId: string) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}`),

  getMyOpen: (ctx: ApiContext) => authedRequest<EncounterSummary[]>(ctx, "/api/encounters/my/open"),

  logAccess: async (ctx: ApiContext, encounterId: string, accessReason: string) => {
    const attempts: Array<{ path: string; body: Record<string, string> }> = [
      { path: `/api/encounters/${encounterId}/access-log`, body: { accessReason } },
      { path: `/api/encounters/${encounterId}/access-log`, body: { reason: accessReason } },
      { path: `/api/encounters/${encounterId}/access`, body: { accessReason } },
      { path: `/api/encounters/${encounterId}/access`, body: { reason: accessReason } },
    ];

    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        return await authedRequest<EncounterAccessLogEntry>(ctx, attempt.path, {
          method: "POST",
          body: attempt.body,
        });
      } catch (error) {
        lastError = error;
        if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 404)) {
          throw error;
        }
      }
    }

    throw lastError;
  },

  getDelegatedInstructions: (ctx: ApiContext, encounterId: string) =>
    authedRequest<DelegatedInstructionView[]>(ctx, `/api/encounters/${encounterId}/delegated-instructions`),

  getNurseRecipients: (ctx: ApiContext) =>
    authedRequest<StaffRecipientView[]>(ctx, "/api/encounters/nurse-recipients"),

  createDelegatedInstruction: (
    ctx: ApiContext,
    encounterId: string,
    payload: {
      recipientUserId: string;
      instructionType: string;
      subject: string;
      body: string;
      patientId?: string | null;
      linkedReferralId?: string | null;
      linkedLabResultId?: string | null;
      linkedImagingOrderId?: string | null;
      priority?: string | null;
    }
  ) =>
    authedRequest<DelegatedInstructionView>(ctx, `/api/encounters/${encounterId}/delegated-instructions`, {
      method: "POST",
      body: payload
    }),

  recordTranscript: (ctx: ApiContext, encounterId: string, transcript: string) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/transcript`, {
      method: "POST",
      body: { transcript }
    }),

  recordAiDraft: (
    ctx: ApiContext,
    encounterId: string,
    payload: { draftNote: string; modelVersion: string; promptVersion: string }
  ) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/ai-draft`, {
      method: "POST",
      body: payload
    }),

  generateAiDraftFromTranscript: (
    ctx: ApiContext,
    encounterId: string,
    payload?: { persist?: boolean; promptVersion?: string }
  ) =>
    authedRequest<AiDraftGenerationResult>(ctx, `/api/encounters/${encounterId}/ai-draft/generate`, {
      method: "POST",
      body: {
        persist: payload?.persist ?? false,
        promptVersion: payload?.promptVersion ?? "ambient-soap-v1"
      }
    }),

  recordPhysicianNote: (ctx: ApiContext, encounterId: string, note: string) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/physician-note`, {
      method: "POST",
      body: { note }
    }),

  transcribeAmbient: async (
    ctx: ApiContext,
    encounterId: string,
    payload: {
      audio: UploadAudioPart;
      fileName: string;
      mimeType: string;
      language?: string;
      prompt?: string;
    }
  ) => {
    const formData = new FormData();
    if (typeof Blob !== "undefined" && payload.audio instanceof Blob) {
      formData.append("audio", payload.audio, payload.fileName);
    } else {
      formData.append("audio", payload.audio as unknown as Blob);
    }
    if (payload.language) {
      formData.append("language", payload.language);
    }
    if (payload.prompt) {
      formData.append("prompt", payload.prompt);
    }

    const response = await fetch(`${ctx.baseUrl}/api/encounters/${encounterId}/ambient/transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.token}`
      },
      body: formData
    });

    const body = await parseUnknownResponse(response);
    if (!response.ok) {
      const message =
        typeof body === "object" && body !== null && "error" in body && typeof (body as { error?: unknown }).error === "string"
          ? ((body as { error: string }).error as string)
          : `HTTP ${response.status}`;
      throw new ApiError(response.status, message, body);
    }

    return body as AmbientTranscriptionResult;
  },

  generateDifferentials: (ctx: ApiContext, encounterId: string, physicalExam?: string) =>
    authedRequest<unknown>(ctx, `/api/encounters/${encounterId}/differentials/generate`, {
      method: "POST",
      body: physicalExam ? { physicalExam } : {}
    }),

  confirmNote: (
    ctx: ApiContext,
    encounterId: string,
    payload: { finalNote: string; correctionComments?: string }
  ) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/confirm-note`, {
      method: "POST",
      body: payload
    }),

  addDiagnosis: (
    ctx: ApiContext,
    encounterId: string,
    payload: { icdCode: string; description: string; isPrimary: boolean; type: string }
  ) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/diagnoses`, {
      method: "POST",
      body: payload
    }),

  agreeDiagnosis: (ctx: ApiContext, encounterId: string) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/diagnoses/agree`, {
      method: "POST"
    }),

  addMedication: (ctx: ApiContext, encounterId: string, payload: Record<string, unknown>) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/medications`, {
      method: "POST",
      body: payload
    }),

  suggestCarePlan: (ctx: ApiContext, encounterId: string) =>
    authedRequest<CarePlanSuggestionResult>(ctx, `/api/encounters/${encounterId}/care-plan/suggest`, {
      method: "POST"
    }),

  agreeCarePlan: (ctx: ApiContext, encounterId: string) =>
    authedRequest<CarePlanAgreementResult>(ctx, `/api/encounters/${encounterId}/care-plan/agree`, {
      method: "POST"
    }),

  getPrescription: (ctx: ApiContext, encounterId: string) =>
    authedRequest<PrescriptionContent>(ctx, `/api/encounters/${encounterId}/prescription`),

  markPrescriptionPrinted: (ctx: ApiContext, encounterId: string) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/prescription/print`, {
      method: "POST"
    }),

  getCompletionReadiness: (ctx: ApiContext, encounterId: string) =>
    authedRequest<Record<string, unknown>>(ctx, `/api/encounters/${encounterId}/completion-readiness`),

  complete: (ctx: ApiContext, encounterId: string) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/complete`, {
      method: "POST"
    }),

  cancel: (ctx: ApiContext, encounterId: string, reason: string) =>
    authedRequest<EncounterResponse>(ctx, `/api/encounters/${encounterId}/cancel`, {
      method: "POST",
      body: { reason }
    }),

  createAddendum: (
    ctx: ApiContext,
    encounterId: string,
    payload: { type: string; reason: string; content: string }
  ) =>
    authedRequest<Record<string, unknown>>(ctx, `/api/encounters/${encounterId}/addendums`, {
      method: "POST",
      body: payload
    }),

  listAddendums: (ctx: ApiContext, encounterId: string) =>
    authedRequest<Record<string, unknown>[]>(ctx, `/api/encounters/${encounterId}/addendums`)
};

export const clinicalPortalApi = {
  recordChartAccess: async (
    ctx: ApiContext,
    patientId: string,
    payload: {
      reason: string;
      detail?: string | null;
      viewedArea?: string | null;
      viewedResource?: string | null;
      accessScope?: string | null;
    }
  ) => {
    const attempts: Array<{ path: string; body: Record<string, unknown> }> = [
      {
        path: `/api/clinical/patient-data/${patientId}/access-log`,
        body: {
          reason: payload.reason,
          detail: payload.detail ?? null,
          viewedArea: payload.viewedArea ?? null,
          viewedResource: payload.viewedResource ?? null,
          accessScope: payload.accessScope ?? null,
        },
      },
      {
        path: `/api/clinical/patient-data/${patientId}/access`,
        body: {
          accessReason: payload.reason,
          detail: payload.detail ?? null,
          viewedArea: payload.viewedArea ?? null,
          viewedResource: payload.viewedResource ?? null,
          accessScope: payload.accessScope ?? null,
        },
      },
    ];

    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        return await authedRequest<ChartAccessLogEntry>(ctx, attempt.path, {
          method: "POST",
          body: attempt.body,
        });
      } catch (error) {
        lastError = error;
        if (!(error instanceof ApiError) || ![400, 404].includes(error.status)) {
          throw error;
        }
      }
    }

    throw lastError;
  },

  getScope: (ctx: ApiContext, patientId: string) =>
    authedRequest<AccessResolution>(ctx, `/api/clinical/patient-data/${patientId}/scope`),

  getOverview: (ctx: ApiContext, patientId: string) =>
    authedRequest<Record<string, unknown>>(ctx, `/api/clinical/patient-data/${patientId}/overview`),

  getEmergencyData: (ctx: ApiContext, patientId: string) =>
    authedRequest<Record<string, unknown>>(ctx, `/api/clinical/patient-data/${patientId}/emergency`),

  breakGlass: (ctx: ApiContext, patientId: string, justification: string) =>
    authedRequest<AuthorizationView>(ctx, `/api/clinical/patient-data/${patientId}/break-glass`, {
      method: "POST",
      body: { justification }
    }),

  nextOfKinApproval: (
    ctx: ApiContext,
    patientId: string,
    payload: {
      approverName?: string;
      nextOfKinName: string;
      nextOfKinPhone?: string;
      relationship?: string;
      verificationMethod?: string;
      expiresAt?: string;
    }
  ) =>
    authedRequest<AuthorizationView>(ctx, `/api/clinical/patient-data/${patientId}/next-of-kin-approval`, {
      method: "POST",
      body: payload
    }),

  getPendingRenewals: (ctx: ApiContext) =>
    authedRequest<RenewalRequestView[]>(ctx, "/api/clinical/patient-data/renewals/pending"),

  reviewRenewal: (ctx: ApiContext, renewalRequestId: string, approve: boolean, comments?: string) =>
    authedRequest<RenewalRequestView>(ctx, `/api/clinical/patient-data/renewals/${renewalRequestId}/review`, {
      method: "POST",
      body: { approve, comments }
    }),

  getPendingTransfers: (ctx: ApiContext) =>
    authedRequest<TransferRequestView[]>(ctx, "/api/clinical/patient-data/transfers/pending"),

  reviewTransfer: (ctx: ApiContext, requestId: string, approve: boolean, comments?: string) =>
    authedRequest<TransferRequestView>(ctx, `/api/clinical/patient-data/transfers/${requestId}/review`, {
      method: "POST",
      body: { approve, comments }
    }),

  getInbox: (ctx: ApiContext, patientId?: string) =>
    authedRequest<PortalMessageView[]>(
      ctx,
      patientId
        ? `/api/clinical/patient-data/messages/inbox?patientId=${encodeURIComponent(patientId)}`
        : "/api/clinical/patient-data/messages/inbox"
    ),

  getMessageThreads: (ctx: ApiContext, patientId?: string) =>
    authedRequest<MessageThreadSummary[]>(
      ctx,
      patientId
        ? `/api/clinical/patient-data/messages/threads?patientId=${encodeURIComponent(patientId)}`
        : "/api/clinical/patient-data/messages/threads"
    ),

  getMessageThread: (ctx: ApiContext, threadId: string) =>
    authedRequest<MessageThreadDetail>(ctx, `/api/clinical/patient-data/messages/threads/${threadId}`),

  markMessageRead: (ctx: ApiContext, messageId: string) =>
    authedRequest<PortalMessageView>(ctx, `/api/clinical/patient-data/messages/${messageId}/read`, {
      method: "POST"
    }),

  sendToPatient: (
    ctx: ApiContext,
    patientId: string,
    payload: {
      category?: string;
      subject?: string;
      body: string;
      linkedEncounterId?: string;
      linkedMedicationOrderId?: string;
      linkedLabResultId?: string;
      linkedReferralId?: string;
    }
  ) =>
    authedRequest<PortalMessageView>(ctx, `/api/clinical/patient-data/${patientId}/messages`, {
      method: "POST",
      body: payload
    }),

  createMessageThread: (
    ctx: ApiContext,
    patientId: string,
    payload: {
      category?: string;
      subject?: string;
      body: string;
      linkedEncounterId?: string;
      linkedMedicationOrderId?: string;
      linkedLabResultId?: string;
      linkedReferralId?: string;
    }
  ) =>
    authedRequest<MessageThreadDetail>(ctx, "/api/clinical/patient-data/messages/threads", {
      method: "POST",
      body: {
        patientId,
        ...payload,
      }
    }),

  replyToThread: (
    ctx: ApiContext,
    threadId: string,
    payload: {
      body: string;
      category?: string;
      linkedEncounterId?: string;
      linkedMedicationOrderId?: string;
      linkedLabResultId?: string;
      linkedReferralId?: string;
    }
  ) =>
    authedRequest<MessageThreadDetail>(ctx, `/api/clinical/patient-data/messages/threads/${threadId}/reply`, {
      method: "POST",
      body: payload
    }),

  addLab: (
    ctx: ApiContext,
    patientId: string,
    payload: {
      encounterId?: string;
      testName: string;
      resultValue?: string;
      unit?: string;
      referenceRange?: string;
      interpretation?: string;
      criticalResult?: boolean;
    }
  ) =>
    authedRequest<LabResultView>(ctx, `/api/clinical/patient-data/${patientId}/labs`, {
      method: "POST",
      body: payload
    }),

  getPatientLabs: (ctx: ApiContext, patientId: string) =>
    authedRequest<LabResultView[]>(ctx, `/api/clinical/patient-data/${patientId}/labs`),

  addReferral: (
    ctx: ApiContext,
    patientId: string,
    payload: {
      encounterId?: string;
      referredToFacility: string;
      specialty: string;
      reason: string;
      notes?: string;
      destinationUsesDalili?: boolean;
    }
  ) =>
    authedRequest<ReferralView>(ctx, `/api/clinical/patient-data/${patientId}/referrals`, {
      method: "POST",
      body: payload
    }),

  getPatientReferrals: (ctx: ApiContext, patientId: string) =>
    authedRequest<ReferralView[]>(ctx, `/api/clinical/patient-data/${patientId}/referrals`),

  updateReferralStatus: (ctx: ApiContext, referralId: string, status: string, notes?: string) =>
    authedRequest<ReferralView>(ctx, `/api/clinical/patient-data/referrals/${referralId}/status`, {
      method: "POST",
      body: { status, notes }
    }),

  getPrintableReferral: (ctx: ApiContext, referralId: string) =>
    authedRequest<Record<string, unknown>>(ctx, `/api/clinical/patient-data/referrals/${referralId}/printable`),

  markReferralPrinted: (ctx: ApiContext, referralId: string) =>
    authedRequest<ReferralView>(ctx, `/api/clinical/patient-data/referrals/${referralId}/print`, {
      method: "POST"
    })
};

export const kioskApi = {
  publicConfirmAppointmentByNumber: (
    baseUrl: string,
    payload: {
      appointmentNumber: string;
      givenName: string;
      familyName: string;
      dateOfBirth: string;
      complaint?: string;
    }
  ) =>
    request<AppointmentCheckInResponse>(baseUrl, "/api/kiosk/public/appointments/confirm-by-number", {
      method: "POST",
      body: payload
    }),

  publicConfirmAppointmentByQr: (
    baseUrl: string,
    payload: {
      qrToken: string;
      givenName: string;
      familyName: string;
      dateOfBirth: string;
      complaint?: string;
    }
  ) =>
    request<AppointmentCheckInResponse>(baseUrl, "/api/kiosk/public/appointments/confirm-by-qr", {
      method: "POST",
      body: payload
    }),

  publicNoAppointmentCheckIn: (
    baseUrl: string,
    payload: {
      givenName: string;
      familyName: string;
      dateOfBirth: string;
      complaint?: string;
    }
  ) =>
    request<KioskCheckInResponse>(baseUrl, "/api/kiosk/public/queue/checkin", {
      method: "POST",
      body: payload
    }),

  getCategories: (ctx: ApiContext) =>
    authedRequest<Array<{ code: string; displayName: string; prefix: string }>>(ctx, "/api/kiosk/queue/categories"),

  checkInQueue: (ctx: ApiContext, payload: { category: string; complaint?: string; consentForDataAccess?: boolean }) =>
    authedRequest<KioskCheckInResponse>(ctx, "/api/kiosk/queue/checkin", {
      method: "POST",
      body: payload
    }),

  recordConsent: (ctx: ApiContext) =>
    authedRequest<Record<string, unknown>>(ctx, "/api/kiosk/patient/consent", {
      method: "POST"
    }),

  getPendingAppointments: (ctx: ApiContext) =>
    authedRequest<AppointmentView[]>(ctx, "/api/kiosk/appointments/pending"),

  verifyAppointmentAccess: (
    ctx: ApiContext,
    payload: { patientId: string; accessCode?: string; qrToken?: string }
  ) =>
    authedRequest<AppointmentView[]>(ctx, "/api/kiosk/appointments/verify", {
      method: "POST",
      body: payload
    }),

  confirmAppointmentCheckIn: (
    ctx: ApiContext,
    payload: {
      patientId: string;
      appointmentId: string;
      accessCode?: string;
      qrToken?: string;
      complaint?: string;
      consentForDataAccess?: boolean;
    }
  ) =>
    authedRequest<AppointmentCheckInResponse>(ctx, "/api/kiosk/appointments/confirm", {
      method: "POST",
      body: payload
    }),

  confirmAppointmentByNumber: (
    ctx: ApiContext,
    payload: {
      appointmentNumber: string;
      complaint?: string;
      consentForDataAccess?: boolean;
    }
  ) =>
    authedRequest<AppointmentCheckInResponse>(ctx, "/api/kiosk/appointments/confirm-by-number", {
      method: "POST",
      body: payload
    }),

  checkInAppointment: (
    ctx: ApiContext,
    appointmentId: string,
    payload?: { complaint?: string; consentForDataAccess?: boolean }
  ) =>
    authedRequest<AppointmentCheckInResponse>(ctx, `/api/kiosk/appointments/${appointmentId}/checkin`, {
      method: "POST",
      body: payload ?? {}
    }),

  checkInNoAppointment: (
    ctx: ApiContext,
    payload: {
      givenName: string;
      familyName: string;
      dateOfBirth: string;
      sex: string;
      category: string;
      complaint?: string;
      consentForDataAccess?: boolean;
    }
  ) =>
    authedRequest<KioskCheckInResponse>(ctx, "/api/kiosk/queue/no-appointment-checkin", {
      method: "POST",
      body: payload
    })
};
