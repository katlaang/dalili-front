import { Audio } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { encounterApi } from "../../api/services";
import type { DelegatedInstructionView, EncounterPreview, StaffRecipientView } from "../../api/types";
import {
  addendumReasonOptions, addendumTypeOptions, delegatedInstructionPriorityOptions, delegatedInstructionTypeOptions, diagnosisTypeOptions,
  dosageFormOptions, encounterTypeOptions, routeOptions,
} from "../../config/options";
import {
  ActionButton, Card, ChoiceChips, InlineActions,
  InputField, JsonPanel, MessageBanner, ToggleField, useTheme,
} from "../../components/ui";
import { triagePalette } from "../../constants/theme";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import {
  getPrimaryVulnerabilityColor,
  getVulnerabilityBadgeColors,
  getVulnerabilityMarkers,
} from "../../utils/vulnerability";

// ─── ENCOUNTERS SCREEN ────────────────────────────────────────────────────────
//
// KEY BEHAVIOURS:
//
// 1. END SESSION (completeEncounter) — 5-step sequence:
//    a) Stop ambient recording if still running
//    b) Transcribe the captured audio
//    c) Merge / append resulting text onto the existing transcript buffer
//    d) Persist transcript exactly once (idempotent — safe if already saved)
//    e) Call encounter.complete()
//
// 2. POST-COMPLETION ACCESS LOG:
//    Opening a completed encounter requires a mandatory "Access Reason" modal.
//    The reason is sent to encounterApi.logAccess() before the data loads.
//    A local session log is shown at the bottom of the screen.
//
// 3. PATIENT NUMBER OVER QUEUE NUMBER:
//    After triage, the patient's MRN is the primary display identifier.
//    The queue ticket number is retained internally for API calls but is
//    surfaced only as "(ticket retired)" context.
//
// 4. ADDENDUM — available only after encounter completion (canHaveAddendum).

interface EncountersScreenProps {
  initialQueueTicketId?: string;
  initialEncounterId?:   string;
  onEncounterLinked?:    (encounterId: string) => void;
  onOpenMessaging?:      (patientId: string, patientName: string) => void;
}

const toPositiveInt = (s: string) => Math.max(1, Number(s || "1"));

const formatDateTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const formatTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

type TriageKey = keyof typeof triagePalette;

// ─── Vital trend alert ────────────────────────────────────────────────────────
function VitalTrendAlert({
  trend, T, onAcknowledge, acknowledged,
}: {
  trend: { systolic: number; firstSystolic: number } | null;
  T: Record<string, string>;
  onAcknowledge: () => void;
  acknowledged: boolean;
}) {
  if (!trend || acknowledged) return null;
  if (Math.abs(trend.systolic - trend.firstSystolic) < 15) return null;
  return (
    <View style={[es.alertBanner, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
      <Text style={[es.alertBannerText, { color: "#dc2626", flex: 1 }]}>
        ⚠ Vital trend alert — significant BP increase detected across visits.
      </Text>
      <Pressable onPress={onAcknowledge} style={[es.acknowledgeBtn, { borderColor: "#dc2626" }]}>
        <Text style={{ color: "#dc2626", fontWeight: "700", fontSize: 13 }}>Acknowledge</Text>
      </Pressable>
    </View>
  );
}

// ─── Access Reason Modal ──────────────────────────────────────────────────────
// Mandatory gate before a completed encounter is loaded.
function AccessReasonModal({
  visible, onConfirm, onCancel, T,
}: {
  visible: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  T: Record<string, string>;
}) {
  const [reason, setReason] = useState("");
  const [error,  setError]  = useState("");

  const handleConfirm = () => {
    if (!reason.trim()) { setError("A reason is required to access a completed encounter."); return; }
    const r = reason.trim();
    setReason(""); setError("");
    onConfirm(r);
  };

  const handleCancel = () => { setReason(""); setError(""); onCancel(); };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={es.modalOverlay}>
        <View style={[es.modalCard, { backgroundColor: T.surface }]}>
          <Text style={[es.modalTitle, { color: T.text }]}>Access completed encounter</Text>
          <Text style={[es.modalBody, { color: T.textMid }]}>
            This encounter has been completed. Your access will be logged for audit. Please provide a clinical reason for reviewing this record.
          </Text>
          <InputField
            label="Reason for access"
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder="e.g. Patient follow-up, addendum required, clinical review…"
          />
          {error ? <MessageBanner message={error} tone="error" /> : null}
          <InlineActions>
            <ActionButton label="Confirm & Open" onPress={handleConfirm} />
            <ActionButton label="Cancel"         onPress={handleCancel} variant="ghost" />
          </InlineActions>
        </View>
      </View>
    </Modal>
  );
}

// ─── History / Nurse Intake Side Panel ───────────────────────────────────────
function HistoryPanel({ preview, T, scheme }: {
  preview: EncounterPreview | null;
  T: Record<string, string>;
  scheme: "dark" | "light";
}) {
  if (!preview) {
    return (
      <Card title="Patient History">
        <MessageBanner message="Open a queue ticket to see patient history." tone="info" />
      </Card>
    );
  }

  const patient = preview.patient || null;
  const triage = preview.triage || null;
  const q = preview.queue || null;
  const patientMrn = patient?.mrn || null;

  // Once triage completes the MRN is the primary identifier.
  // The queue ticket number is shown only as historical context.
  const displayRef  = patientMrn || q?.workflowNumber || q?.ticketNumber || "—";
  const isPostTriage = Boolean(patientMrn);

  const vitalColor = (val: number | null, low: number, high: number, color: string) => {
    if (val == null) return T.textMuted;
    if (val < low)   return "#3b82f6";
    if (val > high)  return color;
    return T.teal;
  };

  const tlKey = ((q?.triageLevel || triage?.finalTriageLevel || "").toUpperCase()) as TriageKey;
  const tlPal = triagePalette[tlKey];
  const vulnerabilityMarkers = getVulnerabilityMarkers({
    dateOfBirth: patient?.dateOfBirth || q?.patientDateOfBirth,
    ageYears: patient?.ageYears ?? q?.patientAgeYears,
    ageInDays: q?.patientAgeInDays,
    pregnancyStatus: triage?.pregnancyStatus || q?.pregnancyStatus,
    isPregnant: triage?.pregnant ?? q?.isPregnant,
    newborn: triage?.newborn,
    elderly: triage?.elderly,
    manualRedFlag: triage?.manualRedFlag ?? q?.manualRedFlag,
    vulnerabilityIndicators: triage?.vulnerabilityIndicators || q?.vulnerabilityIndicators,
  });
  const vulnerabilityAccent = getPrimaryVulnerabilityColor(vulnerabilityMarkers);

  return (
    <ScrollView contentContainerStyle={{ gap: 12 }}>
      <Card title="Queue Info">
        <View style={[es.infoRow, { backgroundColor: T.surfaceAlt as string, borderColor: T.teal + "60" }]}>
          <Text style={{ fontSize: 11, color: T.textMuted, fontWeight: "700" }}>
            {isPostTriage ? "PATIENT NUMBER (MRN)" : "QUEUE NUMBER"}
          </Text>
          <Text style={{ fontSize: 20, fontWeight: "800", color: T.teal }}>{displayRef}</Text>
          {isPostTriage && (q?.workflowNumber || q?.ticketNumber) ? (
            <Text style={{ fontSize: 11, color: T.textMuted }}>
              Queue ticket {q.workflowNumber || q.ticketNumber} retired
            </Text>
          ) : null}
        </View>

        {tlPal ? (
          <View style={[es.triagePill, {
            backgroundColor: scheme === "dark" ? tlPal.bgDark : tlPal.bgLight,
            borderColor: tlPal.border, alignSelf: "flex-start",
          }]}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: scheme === "dark" ? tlPal.textDark : tlPal.textLight }}>
              {tlPal.label}
            </Text>
          </View>
        ) : null}

        {q?.appointmentScheduledAt ? (
          <View style={[es.infoRow, { backgroundColor: T.surfaceAlt as string, borderColor: T.teal + "60" }]}>
            <Text style={{ fontSize: 12, color: T.teal, fontWeight: "700" }}>
              📅 Appointment: {formatTime(q.appointmentScheduledAt)}
            </Text>
            {q.assignedClinicianName ? (
              <Text style={{ fontSize: 12, color: T.textMid }}>Dr. {q.assignedClinicianName}</Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      {(patient?.fullName || patient?.dateOfBirth || vulnerabilityMarkers.length > 0) ? (
        <Card title="Patient Summary">
          <View
            style={[
              es.infoBox,
              es.patientSummaryBox,
              {
                backgroundColor: T.surfaceAlt as string,
                borderColor: T.borderLight,
                borderLeftColor: vulnerabilityAccent || T.borderLight,
              },
            ]}
          >
            {patient?.fullName ? (
              <Text style={[es.patientSummaryName, { color: T.text }]}>{patient.fullName}</Text>
            ) : null}
            <View style={es.patientSummaryMeta}>
              {patient?.mrn ? (
                <Text style={[es.patientSummaryMetaText, { color: T.textMid }]}>Patient ID {patient.mrn}</Text>
              ) : null}
              {patient?.dateOfBirth ? (
                <Text style={[es.patientSummaryMetaText, { color: T.textMid }]}>
                  DOB {new Date(patient.dateOfBirth).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              ) : null}
              {typeof patient?.ageYears === "number" ? (
                <Text style={[es.patientSummaryMetaText, { color: T.textMid }]}>
                  Age {patient.ageYears}
                </Text>
              ) : null}
              {triage?.pregnancyStatus ? (
                <Text style={[es.patientSummaryMetaText, { color: T.textMid }]}>
                  Pregnancy {triage.pregnancyStatus.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase())}
                </Text>
              ) : null}
            </View>
            {vulnerabilityMarkers.length > 0 ? (
              <View style={es.vulnerabilityWrap}>
                {vulnerabilityMarkers.map(marker => {
                  const colors = getVulnerabilityBadgeColors(marker.tone);
                  return (
                    <View
                      key={marker.key}
                      style={[
                        es.vulnerabilityBadge,
                        {
                          backgroundColor: colors.backgroundColor,
                          borderColor: colors.borderColor,
                        },
                      ]}
                    >
                      <Text style={[es.vulnerabilityBadgeText, { color: colors.color }]}>{marker.label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {triage?.vulnerabilityNotes ? (
              <Text style={[es.patientSummaryNote, { color: T.text }]}>
                {triage.vulnerabilityNotes}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      {triage?.chiefComplaint ? (
        <Card title="Chief Complaint">
          <View style={[es.infoBox, { backgroundColor: T.surfaceAlt as string, borderColor: T.borderLight }]}>
            <Text style={{ color: T.text, fontSize: 14, lineHeight: 20 }}>{triage.chiefComplaint}</Text>
          </View>
        </Card>
      ) : null}

      {triage && (triage.bloodPressureSystolic != null || triage.heartRateBpm != null) ? (
        <Card title="Vitals">
          <View style={es.vitalsGrid}>
            {[
              { label: "BP",   val: triage.bloodPressureSystolic != null ? `${triage.bloodPressureSystolic}/${triage.bloodPressureDiastolic}` : null, numVal: triage.bloodPressureSystolic, low: 90, high: 140, color: "#f97316" },
              { label: "HR",   val: triage.heartRateBpm != null ? `${triage.heartRateBpm} bpm` : null, numVal: triage.heartRateBpm, low: 60, high: 100, color: "#f97316" },
              { label: "SpO₂", val: triage.oxygenSaturation != null ? `${triage.oxygenSaturation}%` : null, numVal: triage.oxygenSaturation, low: 95, high: 100, color: "#3b82f6" },
              { label: "Temp", val: triage.temperatureCelsius != null ? `${triage.temperatureCelsius}°C` : null, numVal: triage.temperatureCelsius, low: 36.1, high: 37.2, color: "#f97316" },
              { label: "RR",   val: triage.respiratoryRate != null ? `${triage.respiratoryRate}/min` : null, numVal: triage.respiratoryRate, low: 12, high: 20, color: "#f97316" },
            ].map(v => (
              <View key={v.label} style={[es.vitalCard, { backgroundColor: T.surfaceAlt as string, borderColor: T.borderLight }]}>
                <Text style={[es.vitalLabel, { color: T.textMuted }]}>{v.label}</Text>
                <Text style={[es.vitalValue, { color: v.numVal != null ? vitalColor(v.numVal, v.low, v.high, v.color) : T.textMuted }]}>
                  {v.val || "—"}
                </Text>
              </View>
            ))}
          </View>

          {preview.vitalTrends && preview.vitalTrends.length > 1 ? (
            <View style={{ marginTop: 8 }}>
              <Text style={[es.panelSectionTitle, { color: T.textMid }]}>VITAL TRENDS</Text>
              <View style={es.sparkWrap}>
                {preview.vitalTrends.map((pt, i) => {
                  const all = preview.vitalTrends!.map(p => p.bloodPressureSystolic || 0);
                  const max = Math.max(...all, 1);
                  const h = Math.max(4, Math.round(((pt.bloodPressureSystolic || 0) / max) * 60));
                  return (
                    <View key={i} style={es.sparkBarWrap}>
                      <View style={[es.sparkBar, { height: h, backgroundColor: "#ef4444" }]} />
                      <Text style={[es.sparkLabel, { color: T.textMuted }]}>{pt.bloodPressureSystolic || 0}</Text>
                    </View>
                  );
                })}
              </View>
              {(() => {
                const latest = preview.vitalTrends[preview.vitalTrends.length - 1].bloodPressureSystolic || 0;
                const first  = preview.vitalTrends[0].bloodPressureSystolic || 0;
                if (latest - first >= 15) return (
                  <View style={[es.trendAlert, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
                    <Text style={{ color: "#dc2626", fontSize: 12, fontWeight: "600" }}>
                      ⚠ BP rising — latest {latest} vs {first} mmHg at first visit
                    </Text>
                  </View>
                );
                return null;
              })()}
            </View>
          ) : null}
        </Card>
      ) : null}

      {triage ? (
        <Card title="Nurse Intake">
          {[
            ["Allergies",               triage.allergies],
            ["Current Medications",     triage.currentMedications],
            ["Past Medical History",    triage.pastMedicalHistory],
            ["History of Present Illness", triage.historyOfPresentIllness],
            ["Nursing Notes",           triage.nursingNotes],
          ].filter(([, v]) => v).map(([label, val]) => (
            <View key={label as string} style={{ gap: 2 }}>
              <Text style={[es.panelLabel, { color: T.textMuted }]}>{label as string}</Text>
              <Text style={{ color: T.text, fontSize: 13, lineHeight: 18 }}>{val as string}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {preview.alerts && preview.alerts.length > 0 ? (
        <Card title="Clinical Alerts">
          {preview.alerts.map((a: any, i: number) => (
            <View key={i} style={[es.alertRow, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
              <Text style={{ color: "#dc2626", fontSize: 12 }}>⚠ {a.message || JSON.stringify(a)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {preview.diagnosisHistory && preview.diagnosisHistory.length > 0 ? (
        <Card title="Previous Diagnoses">
          {preview.diagnosisHistory.slice(0, 8).map((d: any, i: number) => (
            <View key={i} style={[es.diagRow, { borderColor: T.border, backgroundColor: T.surfaceAlt as string }]}>
              <Text style={{ color: T.teal, fontWeight: "700", fontSize: 12 }}>{d.icdCode || "—"}</Text>
              <Text style={{ color: T.text, fontSize: 12, flex: 1 }}>{d.description || d.icdCode || "—"}</Text>
              <Text style={{ color: T.textMuted, fontSize: 11 }}>{formatDateTime(d.diagnosedAt)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {preview.carePlanHistory && preview.carePlanHistory.length > 0 ? (
        <Card title="Previous Care Plans">
          <JsonPanel value={preview.carePlanHistory} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export function EncountersScreen({
  initialQueueTicketId, initialEncounterId, onEncounterLinked, onOpenMessaging,
}: EncountersScreenProps) {
  const { apiContext, role } = useSession();
  const { theme: T }         = useTheme();
  const { width }            = useWindowDimensions();
  const normalizedRole = (role || "").toUpperCase();
  const isSuperAdmin = normalizedRole === "SUPER_ADMIN";
  const isAdmin = normalizedRole === "ADMIN";
  const isPhysician = normalizedRole === "PHYSICIAN";
  const isNurse = normalizedRole === "NURSE";
  const isReceptionist = normalizedRole === "RECEPTIONIST";
  const hasPlatformVisibility = isAdmin || isSuperAdmin;
  const canSeePhysicianNotes = isPhysician || hasPlatformVisibility;

  // ── Core ──────────────────────────────────────────────────────────────────
  const [queueTicketId,        setQueueTicketId]        = useState(initialQueueTicketId || "");
  const [encounterType,        setEncounterType]        = useState("NEW_VISIT");
  const [standalonePatientId,  setStandalonePatientId]  = useState("");
  const [standaloneChiefComplaint, setStandaloneChiefComplaint] = useState("");
  const [encounterId,          setEncounterId]          = useState(initialEncounterId || "");
  const [preview,              setPreview]              = useState<EncounterPreview | null>(null);
  const [encounter,            setEncounter]            = useState<unknown>(null);
  const [myOpen,               setMyOpen]               = useState<unknown>(null);
  const [readiness,            setReadiness]            = useState<unknown>(null);
  const [addendums,            setAddendums]            = useState<unknown>(null);
  const [historyPanelVisible,  setHistoryPanelVisible]  = useState(true);
  const [alertAcknowledged,    setAlertAcknowledged]    = useState(false);
  const [nurseRecipients,      setNurseRecipients]      = useState<StaffRecipientView[]>([]);
  const [delegatedInstructions,setDelegatedInstructions]= useState<DelegatedInstructionView[]>([]);
  const [selectedNurseId,      setSelectedNurseId]      = useState("");
  const [instructionType,      setInstructionType]      = useState("PREPARE_REFERRAL");
  const [instructionPriority,  setInstructionPriority]  = useState("ROUTINE");
  const [instructionSubject,   setInstructionSubject]   = useState("");
  const [instructionBody,      setInstructionBody]      = useState("");

  // ── Access log / reason modal ─────────────────────────────────────────────
  const [accessModalVisible,   setAccessModalVisible]   = useState(false);
  const [pendingEncounterId,   setPendingEncounterId]   = useState("");
  const [accessLog,            setAccessLog]            = useState<Array<{ encounterId: string; reason: string; accessedAt: string }>>([]);

  // ── Ambient ───────────────────────────────────────────────────────────────
  const [transcript,           setTranscript]           = useState("");
  const [ambientPrompt,        setAmbientPrompt]        = useState("");
  const [ambientLanguage,      setAmbientLanguage]      = useState("en");
  const [isListening,          setIsListening]          = useState(false);
  const [listenSeconds,        setListenSeconds]        = useState(0);
  const [ambientResult,        setAmbientResult]        = useState<unknown>(null);

  // ── Documentation ─────────────────────────────────────────────────────────
  const [draftNote,            setDraftNote]            = useState("");
  const [modelVersion,         setModelVersion]         = useState("llama-3.1-70b-versatile");
  const [promptVersion,        setPromptVersion]        = useState("v1");
  const [persistDraft,         setPersistDraft]         = useState(false);
  const [generatedDraft,       setGeneratedDraft]       = useState<unknown>(null);
  const [physicianNote,        setPhysicianNote]        = useState("");
  const [finalNote,            setFinalNote]            = useState("");
  const [correctionComments,   setCorrectionComments]   = useState("");
  const [physicalExam,         setPhysicalExam]         = useState("");

  // ── Clinical ──────────────────────────────────────────────────────────────
  const [differentials,        setDifferentials]        = useState<unknown>(null);
  const [carePlan,             setCarePlan]             = useState<unknown>(null);
  const [carePlanAgreement,    setCarePlanAgreement]    = useState<unknown>(null);
  const [diagnosisAgreement,   setDiagnosisAgreement]   = useState<unknown>(null);
  const [prescription,         setPrescription]         = useState<unknown>(null);
  const [icdCode,              setIcdCode]              = useState("");
  const [diagnosisDescription, setDiagnosisDescription] = useState("");
  const [diagnosisType,        setDiagnosisType]        = useState("CONFIRMED");
  const [primaryDiagnosis,     setPrimaryDiagnosis]     = useState(true);

  // ── Medication ────────────────────────────────────────────────────────────
  const [medicationName,  setMedicationName]  = useState("");
  const [brandName,       setBrandName]       = useState("");
  const [dosage,          setDosage]          = useState("");
  const [dosageForm,      setDosageForm]      = useState("TABLET");
  const [frequency,       setFrequency]       = useState("BD");
  const [route,           setRoute]           = useState("ORAL");
  const [durationDays,    setDurationDays]    = useState("5");
  const [quantity,        setQuantity]        = useState("10");
  const [instructions,    setInstructions]    = useState("");
  const [indication,      setIndication]      = useState("");

  // ── Completion ────────────────────────────────────────────────────────────
  const [cancelReason,         setCancelReason]         = useState("");
  const [addendumType,         setAddendumType]         = useState("ADDITION");
  const [addendumReason,       setAddendumReason]       = useState("NEW_INFORMATION");
  const [addendumContent,      setAddendumContent]      = useState("");
  const [showAddendumComposer, setShowAddendumComposer] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [tone,    setTone]    = useState<"success" | "error">("success");

  // ── Recording refs ────────────────────────────────────────────────────────
  const nativeRecRef = useRef<Audio.Recording | null>(null);
  const webRecRef    = useRef<any>(null);
  const webChunks    = useRef<Blob[]>([]);
  const webStream    = useRef<any>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const err = (e: unknown) => { setMessage(toErrorMessage(e)); setTone("error"); };
  const ok  = (s: string)  => { setMessage(s); setTone("success"); };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialQueueTicketId && initialQueueTicketId !== queueTicketId) setQueueTicketId(initialQueueTicketId);
  }, [initialQueueTicketId]);

  useEffect(() => {
    if (initialEncounterId && initialEncounterId !== encounterId) setEncounterId(initialEncounterId);
  }, [initialEncounterId]);

  useEffect(() => {
    const id = queueTicketId.trim();
    if (!apiContext || !id) return;
    encounterApi.getPreview(apiContext, id)
      .then(d => { setPreview(d); setHistoryPanelVisible(true); })
      .catch(() => {});
  }, [apiContext, queueTicketId]);

  useEffect(() => { setAlertAcknowledged(false); }, [queueTicketId]);

  useEffect(() => {
    if (!apiContext || !canSeePhysicianNotes) return;
    encounterApi.getNurseRecipients(apiContext)
      .then((recipients) => setNurseRecipients(recipients))
      .catch(() => {});
  }, [apiContext, canSeePhysicianNotes]);

  useEffect(() => {
    const id = encounterId.trim();
    if (!apiContext || !id) return;
    encounterApi.getDelegatedInstructions(apiContext, id)
      .then((items) => setDelegatedInstructions(items))
      .catch(() => setDelegatedInstructions([]));
  }, [apiContext, encounterId]);

  useEffect(() => {
    if (!isListening) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => setListenSeconds(s => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isListening]);

  if (!apiContext) return <Card title="Encounters"><MessageBanner message="No authenticated session." tone="error" /></Card>;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const setEncounterResult = (data: unknown) => {
    setEncounter(data);
    if (data && typeof data === "object" && "id" in data) {
      const id = (data as { id?: string }).id;
      if (id) { setEncounterId(id); onEncounterLinked?.(id); }
    }
  };

  const isEncounterCompleted = (() => {
    if (!encounter || typeof encounter !== "object") return false;
    const s = ((encounter as any).status || "").toUpperCase();
    return s === "COMPLETED" || s === "COMPLETE";
  })();

  const canAddAddendum = encounter &&
    typeof encounter === "object" &&
    "canHaveAddendum" in encounter &&
    Boolean((encounter as any).canHaveAddendum);

  // ── Access log & gated load ───────────────────────────────────────────────
  const logAccessAndLoad = async (eid: string, reason: string) => {
    // Log access server-side — failure is non-blocking
    try {
      await encounterApi.logAccess(apiContext, eid, reason);
    } catch { /* non-blocking */ }
    setAccessLog(prev => [...prev, {
      encounterId: eid,
      reason,
      accessedAt: new Date().toISOString(),
    }]);
    const data = await encounterApi.getEncounter(apiContext, eid);
    setEncounterResult(data);
    ok("Completed encounter opened — access logged");
  };

  const loadEncounter = async () => {
    try {
      const id = encounterId.trim();
      if (!id) throw new Error("Encounter UUID required");

      // Peek at status to decide whether to gate
      const data   = await encounterApi.getEncounter(apiContext, id);
      const status = ((data as any)?.status || "").toUpperCase();

      if (status === "COMPLETED" || status === "COMPLETE") {
        // Force reason before exposing data
        setPendingEncounterId(id);
        setAccessModalVisible(true);
      } else {
        setEncounterResult(data);
        ok("Encounter loaded");
      }
    } catch (e) { err(e); }
  };

  const handleAccessConfirm = async (reason: string) => {
    setAccessModalVisible(false);
    try { await logAccessAndLoad(pendingEncounterId, reason); }
    catch (e) { err(e); }
    setPendingEncounterId("");
  };

  const handleAccessCancel = () => {
    setAccessModalVisible(false);
    setPendingEncounterId("");
    ok("Access cancelled — encounter not loaded");
  };

  // ── Ambient recording ─────────────────────────────────────────────────────
  const startAmbient = async () => {
    try {
      if (!encounterId.trim()) throw new Error("Encounter UUID required before recording");
      setAmbientResult(null); setListenSeconds(0);
      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webChunks.current = [];
        const rec = new (globalThis as any).MediaRecorder(stream);
        rec.ondataavailable = (e: any) => { if (e.data?.size > 0) webChunks.current.push(e.data); };
        rec.start();
        webRecRef.current = rec; webStream.current = stream;
      } else {
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) throw new Error("Microphone permission required");
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await recording.startAsync();
        nativeRecRef.current = recording;
      }
      setIsListening(true); ok("Ambient listening started");
    } catch (e) { err(e); }
  };

  // stopAmbient — returns the merged transcript string.
  // silent: suppress toast. throwOnError: re-throw so completeEncounter aborts.
  const stopAmbient = async (options?: { silent?: boolean; throwOnError?: boolean }): Promise<string> => {
    const silent     = options?.silent      ?? false;
    const throwOnErr = options?.throwOnError ?? false;
    try {
      if (!isListening) return transcript;
      setIsListening(false);

      let result: any;
      if (Platform.OS === "web") {
        const rec = webRecRef.current;
        if (!rec) throw new Error("No active recorder");
        const blob: Blob = await new Promise((res, rej) => {
          rec.onerror = () => rej(new Error("Recording failed"));
          rec.onstop  = () => res(new Blob(webChunks.current, { type: rec.mimeType || "audio/webm" }));
          rec.stop();
        });
        webStream.current?.getTracks?.().forEach((t: any) => t.stop());
        result = await encounterApi.transcribeAmbient(apiContext, encounterId.trim(), {
          audio: blob, fileName: `ambient-${Date.now()}.webm`,
          mimeType: blob.type || "audio/webm",
          language: ambientLanguage || undefined, prompt: ambientPrompt || undefined,
        });
      } else {
        const recording = nativeRecRef.current;
        if (!recording) throw new Error("No active recording");
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        if (!uri) throw new Error("Unable to read audio");
        result = await encounterApi.transcribeAmbient(apiContext, encounterId.trim(), {
          audio: { uri, name: `ambient-${Date.now()}.m4a`, type: "audio/m4a" },
          fileName: `ambient-${Date.now()}.m4a`, mimeType: "audio/m4a",
          language: ambientLanguage || undefined, prompt: ambientPrompt || undefined,
        });
      }

      nativeRecRef.current = null; webRecRef.current = null; webStream.current = null;
      setAmbientResult(result);

      if (!result.available) throw new Error(result.errorMessage || "Ambient transcription unavailable");

      const merged = result.transcript
        ? (transcript ? `${transcript}\n${result.transcript}` : result.transcript)
        : transcript;

      if (result.transcript) setTranscript(merged);
      if (!silent) ok("Transcription complete — transcript updated");
      return merged;
    } catch (e) {
      nativeRecRef.current = null; webRecRef.current = null; webStream.current = null;
      if (!silent) err(e);
      if (throwOnErr) throw e;
      return transcript;
    }
  };

  // ── persistTranscriptIfNeeded ─────────────────────────────────────────────
  // Idempotent — skips if already saved or empty.
  const persistTranscriptIfNeeded = async (text: string): Promise<boolean> => {
    const cleaned = text.trim();
    if (!cleaned) return false;
    const alreadySaved =
      encounter &&
      typeof encounter === "object" &&
      "hasTranscript" in encounter &&
      Boolean((encounter as any).hasTranscript);
    if (alreadySaved) return false;
    try {
      const updated = await encounterApi.recordTranscript(apiContext, encounterId.trim(), cleaned);
      setEncounterResult(updated);
      return true;
    } catch (e) {
      const msg = toErrorMessage(e).toLowerCase();
      if (msg.includes("transcript") && (msg.includes("already") || msg.includes("once"))) return false;
      throw e;
    }
  };

  // ── completeEncounter (End Session) — 5-step sequence ─────────────────────
  const completeEncounter = async () => {
    try {
      const id = encounterId.trim();
      if (!id) throw new Error("Encounter UUID is required");

      // Steps 1–3: stop recording, transcribe, merge
      const fullTranscript = isListening
        ? await stopAmbient({ silent: true, throwOnError: true })
        : transcript;

      // Step 4: persist once (idempotent)
      const saved = await persistTranscriptIfNeeded(fullTranscript);

      // Step 5: complete
      const d = await encounterApi.complete(apiContext, id);
      setEncounterResult(d);

      ok(saved
        ? "Encounter completed — ambient recording stopped, transcript saved."
        : "Encounter completed.");
    } catch (e) { err(e); }
  };

  // ── Other API actions ─────────────────────────────────────────────────────
  const loadPreview = async () => {
    try {
      const d = await encounterApi.getPreview(apiContext, queueTicketId.trim());
      setPreview(d); setHistoryPanelVisible(true);
      ok("Patient history loaded");
    } catch (e) { err(e); }
  };

  const createFromQueue = async () => {
    try {
      const d = await encounterApi.createFromQueue(apiContext, queueTicketId.trim(), encounterType);
      setEncounterResult(d); ok("Encounter created");
    } catch (e) { err(e); }
  };

  const createStandalone = async () => {
    try {
      const d = await encounterApi.createStandalone(apiContext, {
        patientId: standalonePatientId.trim(), encounterType, chiefComplaint: standaloneChiefComplaint,
      });
      setEncounterResult(d); ok("Standalone encounter created");
    } catch (e) { err(e); }
  };

  const loadMyOpen = async () => {
    try { setMyOpen(await encounterApi.getMyOpen(apiContext)); ok("Open encounters loaded"); }
    catch (e) { err(e); }
  };

  const addDiagnosis = async () => {
    try {
      const d = await encounterApi.addDiagnosis(apiContext, encounterId.trim(), {
        icdCode, description: diagnosisDescription, isPrimary: primaryDiagnosis, type: diagnosisType,
      });
      setEncounterResult(d);
      try { setCarePlan(await encounterApi.suggestCarePlan(apiContext, encounterId.trim())); ok("Diagnosis added + care plan generated"); }
      catch { ok("Diagnosis added"); }
    } catch (e) { err(e); }
  };

  const addMedication = async () => {
    try {
      const d = await encounterApi.addMedication(apiContext, encounterId.trim(), {
        medicationName, brandName: brandName || null, dosage, dosageForm, frequency,
        route, durationDays: toPositiveInt(durationDays), quantity: toPositiveInt(quantity),
        instructions: instructions || null, indication: indication || null,
      });
      setEncounterResult(d); ok("Medication added");
    } catch (e) { err(e); }
  };

  const printPrescription = async () => {
    try {
      const id = encounterId.trim();
      const current = prescription || (await encounterApi.getPrescription(apiContext, id));
      setPrescription(current);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const c = current as any;
        const w = window.open("", "_blank");
        if (!w) throw new Error("Popup blocked");
        w.document.write(`<html><head><title>Prescription</title></head><body>
          <h2>${c.clinicName || "Prescription"}</h2><div>Patient: ${c.patientName || ""}</div>
          <div>Date: ${c.orderDate || ""}</div>
          <pre style="white-space:pre-wrap;font-family:monospace">${c.prescriptionText || ""}</pre>
          </body></html>`);
        w.document.close(); w.focus(); w.print();
      } else {
        const c = current as any;
        await Share.share({ title: `${c.clinicName || "Prescription"} - ${c.patientName || ""}`, message: `Prescription Date: ${c.orderDate || ""}\n\n${c.prescriptionText || ""}` });
      }
      setEncounterResult(await encounterApi.markPrescriptionPrinted(apiContext, id));
      ok("Prescription printed");
    } catch (e) { err(e); }
  };

  const createDelegatedInstruction = async () => {
    try {
      const id = encounterId.trim();
      if (!id) throw new Error("Open or create an encounter before sending instructions.");
      if (!selectedNurseId.trim()) throw new Error("Select the nurse who should receive this instruction.");
      if (!instructionSubject.trim()) throw new Error("Instruction subject is required.");
      if (!instructionBody.trim()) throw new Error("Instruction details are required.");

      const created = await encounterApi.createDelegatedInstruction(apiContext, id, {
        recipientUserId: selectedNurseId,
        instructionType,
        subject: instructionSubject.trim(),
        body: instructionBody.trim(),
        patientId: preview?.patient?.patientId || q?.patientId || null,
        priority: instructionPriority || null,
      });

      setDelegatedInstructions(prev => [created, ...prev.filter(item => item.id !== created.id)]);
      setInstructionSubject("");
      setInstructionBody("");
      ok("Instruction sent to selected nurse");
    } catch (e) { err(e); }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const vitalTrendAlert = (() => {
    if (!preview?.vitalTrends || preview.vitalTrends.length < 2) return null;
    const latest = preview.vitalTrends[preview.vitalTrends.length - 1].bloodPressureSystolic;
    const first  = preview.vitalTrends[0].bloodPressureSystolic;
    if (!latest || !first || latest - first < 15) return null;
    return { systolic: latest, firstSystolic: first };
  })();

  const isWide     = width >= 1180;
  const triage     = preview?.triage as Record<string, any> | null;
  const q          = preview?.queue  as Record<string, any> | null;
  const patientMrn = (preview?.patient as any)?.mrn || null;

  const RESTRICTED_FIELDS = new Set([
    "aiAccuracyRating",
    "transcriptAccuracyScore",
    "transcriptDiscrepancySummary",
    "aiCorrectionComments",
    "noteConfirmedBy",
    "noteConfirmedAt",
    "noteConfirmed",
    "physicianAuthoredNote",
    "finalNote",
    "draftNote",
    "correctionComments",
  ]);
  const scrubAiFields = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(scrubAiFields);
    if (!v || typeof v !== "object") return v;
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .filter(([k]) => canSeePhysicianNotes || !RESTRICTED_FIELDS.has(k))
      .map(([k, val]) => [k, scrubAiFields(val)]));
  };

  const encounterPanelData = hasPlatformVisibility ? encounter : scrubAiFields(encounter);

  const apptInfo = q?.appointmentId ? {
    time: formatTime(q.appointmentScheduledAt),
    clinician: q.assignedClinicianName || null,
  } : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[es.layout, isWide && es.layoutWide]}>

      {/* Mandatory access reason modal for completed encounters */}
      <AccessReasonModal
        visible={accessModalVisible}
        onConfirm={handleAccessConfirm}
        onCancel={handleAccessCancel}
        T={T as any}
      />

      <View style={es.mainCol}>

        {/* Vital trend alert */}
        <VitalTrendAlert
          trend={vitalTrendAlert} T={T as any}
          onAcknowledge={() => setAlertAcknowledged(true)}
          acknowledged={alertAcknowledged}
        />

        {/* Appointment banner */}
        {apptInfo ? (
          <View style={[es.apptBanner, { backgroundColor: T.teal + "22", borderColor: T.teal + "60" }]}>
            <Text style={{ color: T.teal, fontWeight: "700", fontSize: 13 }}>
              📅 Appointment · {apptInfo.time}{apptInfo.clinician ? `  ·  ${apptInfo.clinician}` : ""}
            </Text>
          </View>
        ) : null}

        {/* Patient number banner — once triage completes the MRN is primary */}
        {patientMrn ? (
          <View style={[es.apptBanner, { backgroundColor: T.teal + "15", borderColor: T.teal + "40" }]}>
            <Text style={{ color: T.teal, fontWeight: "700", fontSize: 13 }}>
              🪪 Patient number: {patientMrn}
              {q?.workflowNumber ? `  ·  Queue ticket ${q.workflowNumber} retired` : ""}
            </Text>
          </View>
        ) : null}

        {/* Create & Open */}
        <Card title="Create & Open">
          <InputField label="Queue Ticket UUID" value={queueTicketId} onChangeText={setQueueTicketId} />
          <ChoiceChips label="Encounter Type" options={encounterTypeOptions} value={encounterType} onChange={setEncounterType} />
          <InlineActions>
            <ActionButton label="Patient History" onPress={loadPreview} />
            <ActionButton label="Create from Queue"   onPress={createFromQueue} variant="secondary" />
            <ActionButton
              label={historyPanelVisible ? "Hide History" : "Show History"}
              onPress={() => setHistoryPanelVisible(v => !v)}
              variant="ghost"
            />
          </InlineActions>
          {onOpenMessaging && preview ? (
            <InlineActions>
              <ActionButton
                label="✉ Message Patient"
                onPress={() =>
                  onOpenMessaging(
                    q?.patientId || "",
                    (preview?.patient as { fullName?: string } | undefined)?.fullName || q?.patientName || "Patient"
                  )
                }
                variant="secondary"
              />
            </InlineActions>
          ) : null}
          <InputField label="Standalone Patient UUID"    value={standalonePatientId}      onChangeText={setStandalonePatientId} />
          <InputField label="Standalone Chief Complaint" value={standaloneChiefComplaint} onChangeText={setStandaloneChiefComplaint} multiline />
          <InlineActions>
            <ActionButton label="Create Standalone" onPress={createStandalone} variant="ghost" />
          </InlineActions>
          <InputField label="Encounter UUID" value={encounterId} onChangeText={setEncounterId} />
          <InlineActions>
            {/* Completed encounters trigger the access-reason modal before loading */}
            <ActionButton label="Open Encounter"     onPress={loadEncounter} />
            <ActionButton label="My Open Encounters" onPress={loadMyOpen} variant="secondary" />
          </InlineActions>
          <MessageBanner message={message} tone={tone} />
        </Card>

        {/* History panel inline on narrow screens */}
        {!isWide && historyPanelVisible ? (
          <HistoryPanel preview={preview} T={T as any} scheme={T.scheme} />
        ) : null}

        {canSeePhysicianNotes ? (
          <>
        {/* Documentation */}
        <Card title="Documentation">
          <InputField label="Ambient Language (ISO)" value={ambientLanguage} onChangeText={setAmbientLanguage} placeholder="en" />
          <InputField label="Ambient Prompt (optional)" value={ambientPrompt} onChangeText={setAmbientPrompt} multiline placeholder="Focus on clinical conversation…" />
          <InlineActions>
            <ActionButton
              label={isListening ? `Listening (${listenSeconds}s)` : "Start Ambient Listening"}
              onPress={startAmbient} variant={isListening ? "secondary" : "primary"} disabled={isListening}
            />
            <ActionButton label="Stop & Transcribe" onPress={() => stopAmbient()} variant="danger" disabled={!isListening} />
          </InlineActions>
          {isSuperAdmin && ambientResult ? <JsonPanel value={ambientResult} /> : null}

          <InputField label="Transcript" value={transcript} onChangeText={setTranscript} multiline />
          <InlineActions>
            <ActionButton label="Save Transcript" onPress={async () => {
              try { setEncounterResult(await encounterApi.recordTranscript(apiContext, encounterId.trim(), transcript)); ok("Transcript saved"); }
              catch (e) { err(e); }
            }} />
          </InlineActions>

          <InputField label="AI Draft Note" value={draftNote} onChangeText={setDraftNote} multiline />
          <InputField label="Model Version" value={modelVersion} onChangeText={setModelVersion} />
          <InputField label="Prompt Version" value={promptVersion} onChangeText={setPromptVersion} />
          <ToggleField label="Persist generated AI draft" value={persistDraft} onChange={setPersistDraft} />
          <InlineActions>
            <ActionButton label="Save AI Draft" variant="secondary" onPress={async () => {
              try { setEncounterResult(await encounterApi.recordAiDraft(apiContext, encounterId.trim(), { draftNote, modelVersion, promptVersion })); ok("AI draft saved"); }
              catch (e) { err(e); }
            }} />
            <ActionButton label="Generate from Transcript" variant="ghost" onPress={async () => {
              try {
                const d = await encounterApi.generateAiDraftFromTranscript(apiContext, encounterId.trim(), { persist: persistDraft, promptVersion: "ambient-soap-v1" });
                setGeneratedDraft(d); if (d.draftNote) setDraftNote(d.draftNote);
                ok(d.persisted ? "AI draft generated + persisted" : "AI draft generated");
              } catch (e) { err(e); }
            }} />
          </InlineActions>
          {isSuperAdmin && generatedDraft ? <JsonPanel value={generatedDraft} /> : null}

          <InputField label="Physician Note" value={physicianNote} onChangeText={setPhysicianNote} multiline />
          <InlineActions>
            <ActionButton label="Save Physician Note" onPress={async () => {
              try { setEncounterResult(await encounterApi.recordPhysicianNote(apiContext, encounterId.trim(), physicianNote)); ok("Physician note saved"); }
              catch (e) { err(e); }
            }} />
          </InlineActions>

          <InputField label="Final Note" value={finalNote} onChangeText={setFinalNote} multiline />
          <InputField label="Correction Comments" value={correctionComments} onChangeText={setCorrectionComments} multiline />
          <InlineActions>
            <ActionButton label="Confirm Final Note" variant="secondary" onPress={async () => {
              try { setEncounterResult(await encounterApi.confirmNote(apiContext, encounterId.trim(), { finalNote, correctionComments })); ok("Final note confirmed"); }
              catch (e) { err(e); }
            }} />
          </InlineActions>
        </Card>

        <Card title="Doctor Instructions for Nurse">
          <MessageBanner
            message="Doctors can send nurse-safe follow-up tasks here without exposing physician-authored notes."
            tone="info"
          />
          <Text style={{ color: T.textMid, fontSize: 12 }}>
            Linked patient: {preview?.patient?.fullName || q?.patientName || "No patient selected"}
          </Text>
          <View style={es.recipientWrap}>
            {nurseRecipients.length > 0 ? nurseRecipients.map((recipient) => {
              const active = recipient.id === selectedNurseId;
              const label = recipient.fullName || recipient.username || recipient.employeeId || recipient.id;
              const subtitle = [recipient.role, recipient.employeeId].filter(Boolean).join(" · ");
              return (
                <Pressable
                  key={recipient.id}
                  onPress={() => setSelectedNurseId(recipient.id)}
                  style={[
                    es.recipientChip,
                    {
                      borderColor: active ? T.teal : T.border,
                      backgroundColor: active ? T.tealGlow : T.surfaceAlt as string,
                    },
                  ]}
                >
                  <Text style={{ color: active ? T.teal : T.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
                  {subtitle ? (
                    <Text style={{ color: T.textMid, fontSize: 11 }}>{subtitle}</Text>
                  ) : null}
                </Pressable>
              );
            }) : (
              <MessageBanner message="No nurse recipients available yet." tone="info" />
            )}
          </View>
          <ChoiceChips
            label="Instruction Type"
            options={delegatedInstructionTypeOptions}
            value={instructionType}
            onChange={setInstructionType}
          />
          <ChoiceChips
            label="Priority"
            options={delegatedInstructionPriorityOptions}
            value={instructionPriority}
            onChange={setInstructionPriority}
          />
          <InputField label="Subject" value={instructionSubject} onChangeText={setInstructionSubject} placeholder="Short task summary" />
          <InputField label="Instruction Body" value={instructionBody} onChangeText={setInstructionBody} multiline placeholder="Explain what the assigned nurse should do." />
          <InlineActions>
            <ActionButton label="Send to Selected Nurse" onPress={createDelegatedInstruction} />
            <ActionButton
              label="Refresh Instructions"
              onPress={async () => {
                try {
                  const id = encounterId.trim();
                  if (!id) throw new Error("Encounter must be open before refreshing instructions.");
                  setDelegatedInstructions(await encounterApi.getDelegatedInstructions(apiContext, id));
                  ok("Instructions refreshed");
                } catch (e) { err(e); }
              }}
              variant="secondary"
            />
          </InlineActions>
          {delegatedInstructions.length > 0 ? (
            <View style={{ gap: 10 }}>
              {delegatedInstructions.map((instruction) => (
                <View
                  key={instruction.id}
                  style={[
                    es.infoBox,
                    { backgroundColor: T.surfaceAlt as string, borderColor: T.borderLight },
                  ]}
                >
                  <Text style={{ color: T.text, fontSize: 15, fontWeight: "800" }}>{instruction.subject}</Text>
                  <Text style={{ color: T.textMid, fontSize: 12 }}>
                    {instruction.recipientName || "Assigned nurse"} · {instruction.instructionType.replace(/_/g, " ")}{instruction.priority ? ` · ${instruction.priority}` : ""}
                  </Text>
                  <Text style={{ color: T.text, fontSize: 13, lineHeight: 20 }}>{instruction.body}</Text>
                  <Text style={{ color: T.textMuted, fontSize: 11 }}>
                    Sent {formatDateTime(instruction.createdAt ?? undefined)} by {instruction.createdByName || "Doctor"}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        {/* Diagnosis & Medication */}
        <Card title="Diagnosis & Medication">
          <InputField label="ICD-10 Code" value={icdCode} onChangeText={setIcdCode} placeholder="J06.9" />
          <InputField label="Diagnosis Description" value={diagnosisDescription} onChangeText={setDiagnosisDescription} />
          <ChoiceChips label="Diagnosis Type" options={diagnosisTypeOptions} value={diagnosisType} onChange={setDiagnosisType} />
          <ToggleField label="Primary Diagnosis" value={primaryDiagnosis} onChange={setPrimaryDiagnosis} />
          <InlineActions>
            <ActionButton label="Add Diagnosis"   onPress={addDiagnosis} />
            <ActionButton label="Agree Diagnosis" variant="secondary" onPress={async () => {
              try {
                const d = await encounterApi.agreeDiagnosis(apiContext, encounterId.trim());
                setEncounterResult(d);
                setDiagnosisAgreement({ diagnosisAgreed: d.diagnosisAgreed, diagnosisAgreedAt: d.diagnosisAgreedAt, diagnosisAgreedBy: d.diagnosisAgreedBy });
                ok("Diagnosis agreement recorded");
              } catch (e) { err(e); }
            }} />
          </InlineActions>
          {diagnosisAgreement ? <JsonPanel value={diagnosisAgreement} /> : null}

          <InputField label="Medication Name" value={medicationName} onChangeText={setMedicationName} />
          <InputField label="Brand Name"      value={brandName}      onChangeText={setBrandName} />
          <InputField label="Dosage"          value={dosage}         onChangeText={setDosage}    placeholder="500mg" />
          <ChoiceChips label="Dosage Form"    options={dosageFormOptions} value={dosageForm} onChange={setDosageForm} />
          <InputField label="Frequency"       value={frequency}      onChangeText={setFrequency} placeholder="TDS" />
          <ChoiceChips label="Route"          options={routeOptions}  value={route}          onChange={setRoute} />
          <InputField label="Duration Days"   value={durationDays}   onChangeText={setDurationDays} />
          <InputField label="Quantity"        value={quantity}       onChangeText={setQuantity} />
          <InputField label="Instructions"    value={instructions}   onChangeText={setInstructions} multiline />
          <InputField label="Indication"      value={indication}     onChangeText={setIndication} multiline />
          <InlineActions>
            <ActionButton label="Add Medication" onPress={addMedication} variant="secondary" />
          </InlineActions>
        </Card>

        {/* AI Clinical Support */}
        <Card title="AI Clinical Support">
          <InputField label="Physical Exam (optional)" value={physicalExam} onChangeText={setPhysicalExam} multiline />
          <InlineActions>
            <ActionButton label="Generate Differentials" onPress={async () => {
              try { setDifferentials(await encounterApi.generateDifferentials(apiContext, encounterId.trim(), physicalExam || undefined)); ok("Differentials generated"); }
              catch (e) { err(e); }
            }} />
            <ActionButton label="Suggest Care Plan" variant="secondary" onPress={async () => {
              try { setCarePlan(await encounterApi.suggestCarePlan(apiContext, encounterId.trim())); ok("Care plan suggestions generated"); }
              catch (e) { err(e); }
            }} />
            <ActionButton label="Agree Care Plan" variant="ghost" onPress={async () => {
              try {
                setCarePlanAgreement(await encounterApi.agreeCarePlan(apiContext, encounterId.trim()));
                setEncounterResult(await encounterApi.getEncounter(apiContext, encounterId.trim()));
                ok("Care plan agreement recorded");
              } catch (e) { err(e); }
            }} />
          </InlineActions>
          {differentials ? <JsonPanel value={differentials} /> : null}
          {carePlan      ? <JsonPanel value={carePlan} /> : null}
          {carePlanAgreement ? <JsonPanel value={carePlanAgreement} /> : null}
        </Card>

        {/* Prescription */}
        <Card title="Prescription">
          <InlineActions>
            <ActionButton label="Generate Prescription" onPress={async () => {
              try { setPrescription(await encounterApi.getPrescription(apiContext, encounterId.trim())); ok("Prescription generated"); }
              catch (e) { err(e); }
            }} />
            <ActionButton label="Print Prescription" onPress={printPrescription} variant="secondary" />
          </InlineActions>
          {prescription ? <JsonPanel value={prescription} /> : null}
        </Card>

        {/* Completion & Addendums */}
        <Card title="Completion & Addendums">
          {isEncounterCompleted ? (
            <View style={[es.completedBanner, { backgroundColor: T.teal + "18", borderColor: T.teal + "50" }]}>
              <Text style={{ color: T.teal, fontWeight: "700", fontSize: 13 }}>✓ Encounter completed</Text>
              <Text style={{ color: T.textMid, fontSize: 12, marginTop: 2 }}>
                Re-opening this record requires a clinical reason (logged for audit).
              </Text>
            </View>
          ) : null}

          {!isEncounterCompleted ? (
            <InlineActions>
              <ActionButton label="Check Readiness" onPress={async () => {
                try { setReadiness(await encounterApi.getCompletionReadiness(apiContext, encounterId.trim())); ok("Readiness loaded"); }
                catch (e) { err(e); }
              }} />
              <ActionButton
                label={isListening ? "End Session (stop recording)" : "End Session"}
                variant="secondary"
                onPress={completeEncounter}
              />
            </InlineActions>
          ) : null}

          <InputField label="Cancel Reason" value={cancelReason} onChangeText={setCancelReason} multiline />
          <InlineActions>
            <ActionButton label="Cancel Encounter" variant="danger" onPress={async () => {
              try { setEncounterResult(await encounterApi.cancel(apiContext, encounterId.trim(), cancelReason)); ok("Encounter cancelled"); }
              catch (e) { err(e); }
            }} />
          </InlineActions>

          {/* Addendum section — only after completion */}
          {canAddAddendum ? (
            <>
              <View style={[es.addendumDivider, { borderColor: T.border }]}>
                <Text style={[es.addendumLabel, { color: T.textMid }]}>ADDENDUM</Text>
              </View>
              <ActionButton
                label={showAddendumComposer ? "Hide Addendum Composer" : "Add Addendum"}
                onPress={() => setShowAddendumComposer(v => !v)}
                variant="ghost"
              />
              {showAddendumComposer ? (
                <>
                  <ChoiceChips label="Addendum Type"   options={addendumTypeOptions}   value={addendumType}   onChange={setAddendumType} />
                  <ChoiceChips label="Addendum Reason" options={addendumReasonOptions} value={addendumReason} onChange={setAddendumReason} />
                  <InputField  label="Addendum Content" value={addendumContent} onChangeText={setAddendumContent} multiline />
                  <InlineActions>
                    <ActionButton label="Create Addendum" onPress={async () => {
                      try {
                        setAddendums(await encounterApi.createAddendum(apiContext, encounterId.trim(), { type: addendumType, reason: addendumReason, content: addendumContent }));
                        ok("Addendum created");
                      } catch (e) { err(e); }
                    }} />
                    <ActionButton label="View Addendums" variant="ghost" onPress={async () => {
                      try { setAddendums(await encounterApi.listAddendums(apiContext, encounterId.trim())); ok("Addendums loaded"); }
                      catch (e) { err(e); }
                    }} />
                  </InlineActions>
                </>
              ) : (
                <InlineActions>
                  <ActionButton label="View Addendums" variant="ghost" onPress={async () => {
                    try { setAddendums(await encounterApi.listAddendums(apiContext, encounterId.trim())); ok("Addendums loaded"); }
                    catch (e) { err(e); }
                  }} />
                </InlineActions>
              )}
            </>
          ) : (
            <Text style={{ color: T.textMuted, fontSize: 12, marginTop: 6 }}>
              Addendum can be added after the encounter is completed.
            </Text>
          )}
        </Card>

        {/* Session access log — shown when completed encounters were opened */}
          </>
        ) : (
          <Card title="Clinician Handoff">
            <MessageBanner
              message="Only the treating doctor can write or review physician notes here. Nurses and receptionists receive separate delegated instructions instead."
              tone="info"
            />
          </Card>
        )}

        {accessLog.length > 0 ? (
          <Card title="Access Log (this session)">
            {accessLog.map((entry, i) => (
              <View key={i} style={[es.accessLogRow, { borderColor: T.border, backgroundColor: T.surfaceAlt as string }]}>
                <Text style={{ color: T.text,    fontSize: 12, fontWeight: "700" }}>{formatDateTime(entry.accessedAt)}</Text>
                <Text style={{ color: T.textMid, fontSize: 12 }}>Reason: {entry.reason}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {encounter && !hasPlatformVisibility ? (
          <Card title="Encounter Status">
            <Text style={{ color: T.text, fontSize: 14, fontWeight: "700" }}>
              {(encounter as any)?.status || "Encounter active"}
            </Text>
            <Text style={{ color: T.textMid, fontSize: 12 }}>
              {preview?.patient?.fullName || q?.patientName || "Patient"} · {preview?.patient?.mrn || q?.patientId || "Unknown patient ID"}
            </Text>
          </Card>
        ) : null}
        {hasPlatformVisibility && encounter ? <Card title="Encounter"><JsonPanel value={encounterPanelData} /></Card> : null}
        {hasPlatformVisibility && myOpen ? <Card title="My Open Encounters"><JsonPanel value={myOpen} /></Card> : null}
        {hasPlatformVisibility && readiness ? <Card title="Readiness"><JsonPanel value={readiness} /></Card> : null}
        {hasPlatformVisibility && addendums ? <Card title="Addendums"><JsonPanel value={addendums} /></Card> : null}

        {hasPlatformVisibility && encounter && typeof encounter === "object" ? (
          <Card title={isSuperAdmin ? "AI Comparison Audit (Super Admin)" : "AI Comparison Audit (Admin)"}>
            <JsonPanel value={{
              noteConfirmed: (encounter as any).noteConfirmed,
              aiAccuracyRating: (encounter as any).aiAccuracyRating,
              transcriptAccuracyScore: (encounter as any).transcriptAccuracyScore,
              transcriptDiscrepancySummary: (encounter as any).transcriptDiscrepancySummary,
            }} />
          </Card>
        ) : null}

      </View>

      {/* History side panel — wide screens */}
      {isWide && historyPanelVisible ? (
        <View style={es.sidePanel}>
          <HistoryPanel preview={preview} T={T as any} scheme={T.scheme} />
        </View>
      ) : null}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const es = StyleSheet.create({
  layout:            { gap: 14 },
  layoutWide:        { flexDirection: "row", alignItems: "flex-start" },
  mainCol:           { flex: 1, gap: 14 },
  sidePanel:         { width: 380, gap: 0 },
  apptBanner:        { borderWidth: 1.5, borderRadius: 10, padding: 10 },
  completedBanner:   { borderWidth: 1.5, borderRadius: 10, padding: 12, marginBottom: 10 },
  alertBanner:       { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 10, padding: 12 },
  alertBannerText:   { fontSize: 13, fontWeight: "600", flex: 1 },
  acknowledgeBtn:    { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 2 },
  triagePill:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5 },
  infoRow:           { borderWidth: 1, borderRadius: 8, padding: 10, gap: 3 },
  infoBox:           { borderWidth: 1, borderRadius: 10, padding: 12 },
  patientSummaryBox: { borderLeftWidth: 4, gap: 10 },
  patientSummaryName:{ fontSize: 18, fontWeight: "800" },
  patientSummaryMeta:{ flexDirection: "row", flexWrap: "wrap", gap: 10 },
  patientSummaryMetaText: { fontSize: 12, fontWeight: "600" },
  patientSummaryNote:{ fontSize: 13, lineHeight: 19 },
  vulnerabilityWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  vulnerabilityBadge:{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  vulnerabilityBadgeText: { fontSize: 10, fontWeight: "700" },
  recipientWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  recipientChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minWidth: 180, gap: 3 },
  vitalsGrid:        { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  vitalCard:         { width: "30%", minWidth: 80, borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  vitalLabel:        { fontSize: 10, fontWeight: "700" },
  vitalValue:        { fontSize: 16, fontWeight: "800" },
  panelLabel:        { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  panelSectionTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  sparkWrap:         { flexDirection: "row", alignItems: "flex-end", gap: 5, height: 70, marginTop: 8 },
  sparkBarWrap:      { alignItems: "center", gap: 2 },
  sparkBar:          { width: 16, borderRadius: 3 },
  sparkLabel:        { fontSize: 9 },
  trendAlert:        { borderWidth: 1.5, borderRadius: 8, padding: 10, marginTop: 8 },
  alertRow:          { borderWidth: 1, borderRadius: 8, padding: 10 },
  diagRow:           { flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderRadius: 8, padding: 8 },
  addendumDivider:   { borderTopWidth: 1, marginVertical: 12, paddingTop: 8 },
  addendumLabel:     { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  accessLogRow:      { borderWidth: 1, borderRadius: 8, padding: 10, gap: 4, marginBottom: 6 },
  // Modal
  modalOverlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard:         { width: "100%", maxWidth: 480, borderRadius: 16, padding: 24, gap: 12 },
  modalTitle:        { fontSize: 17, fontWeight: "700" },
  modalBody:         { fontSize: 13, lineHeight: 20 },
});
