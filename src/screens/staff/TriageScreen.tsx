import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { queueApi, triageApi } from "../../api/services";
import type { QueueTicket } from "../../api/types";
import { consciousnessOptions, triageLevelOptions } from "../../config/options";
import {
  ActionButton,
  Card,
  ChoiceChips,
  InlineActions,
  InputField,
  JsonPanel,
  MessageBanner,
  ToggleField,
  useTheme,
} from "../../components/ui";
import { triagePalette } from "../../constants/theme";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

// ─── TRIAGE SCREEN ────────────────────────────────────────────────────────────
// Opens full-page when nurse clicks "View →" in the Triage Queue.
// Covers: patient info header → vitals → red flags → clinical observations → finalize.
// "Send to Doctor Queue" uses FIFO unless patient has an appointment assigned to a
// specific physician, in which case the handoff message shows the appointment time.

interface VitalsForm {
  temperatureCelsius:     string;
  heartRateBpm:           string;
  bloodPressureSystolic:  string;
  bloodPressureDiastolic: string;
  respiratoryRate:        string;
  oxygenSaturation:       string;
  weightKg:               string;
  heightCm:               string;
  painScore:              string;
  bloodGlucoseMmol:       string;
  consciousnessLevel:     string;
}
const defaultVitals: VitalsForm = {
  temperatureCelsius: "", heartRateBpm: "", bloodPressureSystolic: "",
  bloodPressureDiastolic: "", respiratoryRate: "", oxygenSaturation: "",
  weightKg: "", heightCm: "", painScore: "", bloodGlucoseMmol: "",
  consciousnessLevel: "ALERT",
};

interface RedFlagsForm {
  chestPain:          boolean;
  difficultyBreathing:boolean;
  strokeSymptoms:     boolean;
  severebleeding:     boolean;
  allergicReaction:   boolean;
  alteredMentalStatus:boolean;
  pregnancyConcern:   boolean;
  severeAbdominalPain:boolean;
}
const defaultRedFlags: RedFlagsForm = {
  chestPain: false, difficultyBreathing: false, strokeSymptoms: false,
  severebleeding: false, allergicReaction: false, alteredMentalStatus: false,
  pregnancyConcern: false, severeAbdominalPain: false,
};

const parseNum = (s: string) => (s.trim() ? Number(s) : undefined);

const formatTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

type TriageKey = keyof typeof triagePalette;

interface TriageScreenProps {
  initialQueueTicketId?: string;
  initialAssessmentId?:  string;
  onAssessmentLinked?:   (payload: { queueTicketId: string; assessmentId: string }) => void;
  onMoveToEncounter?:    (queueTicketId: string) => void;
  onBack?:               () => void; // back to queue list
}

export function TriageScreen({
  initialQueueTicketId,
  initialAssessmentId,
  onAssessmentLinked,
  onMoveToEncounter,
  onBack,
}: TriageScreenProps) {
  const { apiContext } = useSession();
  const { theme: T }   = useTheme();

  const [queueTicketId,   setQueueTicketId]   = useState(initialQueueTicketId || "");
  const [assessmentId,    setAssessmentId]    = useState(initialAssessmentId  || "");
  const [triageRows,      setTriageRows]      = useState<QueueTicket[]>([]);
  const [activeTicket,    setActiveTicket]    = useState<QueueTicket | null>(null);
  const [chiefComplaint,  setChiefComplaint]  = useState("");
  const [vitals,          setVitals]          = useState<VitalsForm>(defaultVitals);
  const [redFlags,        setRedFlags]        = useState<RedFlagsForm>(defaultRedFlags);
  const [hpi,             setHpi]             = useState("");
  const [symptomOnset,    setSymptomOnset]    = useState("");
  const [symptomDuration, setSymptomDuration] = useState("");
  const [painLocation,    setPainLocation]    = useState("");
  const [additionalSymptoms, setAdditionalSymptoms] = useState("");
  const [exposure,        setExposure]        = useState("");
  const [allergies,       setAllergies]       = useState("");
  const [medications,     setMedications]     = useState("");
  const [pastHistory,     setPastHistory]     = useState("");
  const [nursingNotes,    setNursingNotes]    = useState("");
  const [overrideLevel,   setOverrideLevel]   = useState("ORANGE");
  const [overrideReason,  setOverrideReason]  = useState("");
  const [physicalExam,    setPhysicalExam]    = useState("");
  const [summary,         setSummary]         = useState<string | null>(null);
  const [outcome,         setOutcome]         = useState<unknown>(null);
  const [result,          setResult]          = useState<unknown>(null);
  const [message,         setMessage]         = useState<string | null>(null);
  const [tone,            setTone]            = useState<"success" | "error">("success");

  const [handoffClinician, setHandoffClinician]   = useState("");
  const [handoffEmpId,     setHandoffEmpId]        = useState("");
  const [handoffUserId,    setHandoffUserId]        = useState("");
  const [handoffNotes,     setHandoffNotes]         = useState("");

  const err = (e: unknown) => { setMessage(toErrorMessage(e)); setTone("error"); };
  const ok  = (s: string)  => { setMessage(s); setTone("success"); };

  // Sync incoming props
  useEffect(() => {
    if (initialQueueTicketId && initialQueueTicketId !== queueTicketId)
      setQueueTicketId(initialQueueTicketId);
  }, [initialQueueTicketId]);
  useEffect(() => {
    if (initialAssessmentId && initialAssessmentId !== assessmentId)
      setAssessmentId(initialAssessmentId);
  }, [initialAssessmentId]);

  // Auto-load triage queue on mount
  useEffect(() => {
    if (!apiContext) return;
    queueApi.getQueue(apiContext, "triage")
      .then(r => setTriageRows(r))
      .catch(() => {});
  }, [apiContext]);

  if (!apiContext) {
    return <Card title="Triage"><MessageBanner message="No authenticated session." tone="error" /></Card>;
  }

  const loadQueue = async () => {
    try {
      const rows = await queueApi.getQueue(apiContext, "triage");
      setTriageRows(rows); ok(`Triage queue: ${rows.length}`);
    } catch (e) { err(e); }
  };

  const selectTicket = (t: QueueTicket) => {
    setQueueTicketId(t.id);
    setActiveTicket(t);
    setChiefComplaint(prev => prev || t.initialComplaint || "");
    ok(`Loaded ${t.workflowNumber || t.ticketNumber || t.id.slice(0, 8)} into triage workspace`);
  };

  const beginAssessment = async () => {
    try {
      const a = await triageApi.beginAssessment(apiContext, queueTicketId.trim(), chiefComplaint);
      setAssessmentId(a.id); setResult(a);
      onAssessmentLinked?.({ queueTicketId: queueTicketId.trim(), assessmentId: a.id });
      ok("Assessment started");
    } catch (e) { err(e); }
  };

  const beginReassessment = async () => {
    try {
      const a = await triageApi.beginReassessment(apiContext, queueTicketId.trim());
      setAssessmentId(a.id); setResult(a);
      onAssessmentLinked?.({ queueTicketId: queueTicketId.trim(), assessmentId: a.id });
      ok("Reassessment started");
    } catch (e) { err(e); }
  };

  const recordVitals = async () => {
    try {
      const a = await triageApi.recordVitals(apiContext, assessmentId.trim(), {
        temperatureCelsius:     parseNum(vitals.temperatureCelsius),
        heartRateBpm:           parseNum(vitals.heartRateBpm),
        bloodPressureSystolic:  parseNum(vitals.bloodPressureSystolic),
        bloodPressureDiastolic: parseNum(vitals.bloodPressureDiastolic),
        respiratoryRate:        parseNum(vitals.respiratoryRate),
        oxygenSaturation:       parseNum(vitals.oxygenSaturation),
        weightKg:               parseNum(vitals.weightKg),
        heightCm:               parseNum(vitals.heightCm),
        painScore:              parseNum(vitals.painScore),
        bloodGlucoseMmol:       parseNum(vitals.bloodGlucoseMmol),
        consciousnessLevel:     vitals.consciousnessLevel,
      });
      setResult(a); ok("Vitals recorded");
    } catch (e) { err(e); }
  };

  const recordRedFlags = async () => {
    try {
      const a = await triageApi.recordRedFlags(apiContext, assessmentId.trim(), redFlags);
      setResult(a); ok("Red flags recorded");
    } catch (e) { err(e); }
  };

  const recordObservations = async () => {
    try {
      const combinedNotes = [
        nursingNotes.trim() || null,
        symptomOnset.trim()    ? `Onset: ${symptomOnset.trim()}`          : null,
        symptomDuration.trim() ? `Duration: ${symptomDuration.trim()}`    : null,
        painLocation.trim()    ? `Pain location: ${painLocation.trim()}`  : null,
        additionalSymptoms.trim() ? `Additional: ${additionalSymptoms.trim()}` : null,
        exposure.trim()        ? `Exposure/travel: ${exposure.trim()}`    : null,
      ].filter(Boolean).join("\n");

      const a = await triageApi.recordObservations(apiContext, assessmentId.trim(), {
        historyOfPresentIllness: hpi,
        allergies, currentMedications: medications,
        pastMedicalHistory: pastHistory,
        nursingNotes: combinedNotes,
      });
      setResult(a); ok("Observations recorded");
    } catch (e) { err(e); }
  };

  const acceptSystem = async () => {
    try {
      const a = await triageApi.acceptSystemTriage(apiContext, assessmentId.trim());
      setResult(a); ok("System triage accepted");
    } catch (e) { err(e); }
  };

  const overrideTriage = async () => {
    try {
      const a = await triageApi.overrideTriage(apiContext, assessmentId.trim(), {
        newTriageLevel: overrideLevel, reason: overrideReason,
      });
      setResult(a); ok("Triage overridden");
    } catch (e) { err(e); }
  };

  const loadSummary = async () => {
    try {
      const r = await triageApi.getSummary(apiContext, assessmentId.trim());
      setSummary(r.summary); ok("Summary loaded");
    } catch (e) { err(e); }
  };

  const loadOutcome = async () => {
    try {
      const r = await triageApi.getOutcome(apiContext, assessmentId.trim(), physicalExam || undefined);
      setOutcome(r); ok("Outcome loaded");
    } catch (e) { err(e); }
  };

  const sendToDoctorQueue = async () => {
    try {
      const id = queueTicketId.trim();
      if (!id) throw new Error("Queue ticket UUID required");
      try { await queueApi.startTicket(apiContext, id); } catch {}
      let moved: QueueTicket | null = null;
      try {
        moved = await queueApi.returnToWaiting(apiContext, id);
      } catch {
        const dq = await queueApi.getQueue(apiContext, "consultation");
        moved = dq.find(t => t.id === id) || null;
        if (!moved) throw new Error("Patient not yet eligible for doctor queue. Complete triage first.");
      }
      setResult(moved);
      await loadQueue();

      // After triage completes, the backend sets workflowNumber = patientNumber.
      // We surface the patientNumber (permanent MRN-style identifier) in the
      // success message so staff see the transition from queue number to patient number.
      const displayId = moved?.workflowNumber || moved?.ticketNumber || id.slice(0, 8);
      const patientNum = moved?.patientNumber;
      const patientNumSuffix = patientNum && patientNum !== moved?.ticketNumber
        ? `  ·  Patient # ${patientNum}`
        : "";
      const msg = moved?.appointmentId
        ? `Sent to Doctor Queue — ${displayId}${patientNumSuffix}  ·  Appointment at ${formatTime(moved.appointmentScheduledAt)}${moved.assignedClinicianName ? ` · ${moved.assignedClinicianName}` : ""}`
        : `Sent to Doctor Queue — ${displayId}${patientNumSuffix} (FIFO order)`;
      ok(msg);
    } catch (e) { err(e); }
  };

  const handoffToClinician = async () => {
    try {
      await queueApi.handoffToClinician(apiContext, queueTicketId.trim(), {
        clinicianName:      handoffClinician.trim(),
        clinicianEmployeeId: handoffEmpId.trim(),
        clinicianUserId:    handoffUserId.trim() || null,
        handoffNotes:       handoffNotes || null,
      });
      ok(`Handoff recorded to ${handoffClinician}`);
    } catch (e) { err(e); }
  };

  const proceedToEncounter = () => {
    const id = queueTicketId.trim();
    if (!id) { err(new Error("Queue ticket UUID required")); return; }
    onMoveToEncounter?.(id);
  };

  // ─── Triage level pill colour ─────────────────────────────────────────────
  const tlKey = ((activeTicket?.triageLevel || "").toUpperCase()) as TriageKey;
  const tlPal = triagePalette[tlKey];

  return (
    <ScrollView contentContainerStyle={{ gap: 14 }}>
      {/* Header: back + patient info */}
      <Card title="Triage Workspace">
        <View style={ts.headerRow}>
          {onBack ? (
            <Pressable onPress={onBack} style={[ts.backBtn, { borderColor: T.border }]}>
              <Text style={[ts.backBtnText, { color: T.teal }]}>← Back to Queue</Text>
            </Pressable>
          ) : null}
          {activeTicket ? (
            <View style={[ts.patientBanner, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
              <View>
                <Text style={[ts.patientName, { color: T.text }]}>
                  {activeTicket.patientName || activeTicket.patientId || "Patient"}
                </Text>
                <Text style={[ts.patientSub, { color: T.textMuted }]}>
                  {/* Before triage: workflowNumber = ticketNumber (e.g. G-042).
                      After triage:  workflowNumber = patientNumber (permanent MRN-style).
                      Always show workflowNumber; append patientNumber label if it differs. */}
                  {activeTicket.workflowNumber || activeTicket.ticketNumber || activeTicket.id.slice(0, 8)}
                  {activeTicket.patientNumber && activeTicket.patientNumber !== activeTicket.ticketNumber
                    ? `  ·  Patient # ${activeTicket.patientNumber}` : ""}
                  {activeTicket.appointmentId
                    ? `  ·  Appointment ${formatTime(activeTicket.appointmentScheduledAt)}`
                    : "  ·  Walk-in"}
                </Text>
              </View>
              {tlPal ? (
                <View style={[ts.triagePill, {
                  backgroundColor: T.scheme === "dark" ? tlPal.bgDark : tlPal.bgLight,
                  borderColor: tlPal.border,
                }]}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: T.scheme === "dark" ? tlPal.textDark : tlPal.textLight }}>
                    {tlPal.label}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Triage queue mini-list */}
        <InlineActions>
          <ActionButton label="Refresh Triage Queue" onPress={loadQueue} variant="secondary" />
        </InlineActions>
        {triageRows.length > 0 ? (
          <View style={{ gap: 6 }}>
            {triageRows.map(t => (
              <Pressable key={t.id} onPress={() => selectTicket(t)}
                style={[ts.queueRow, {
                  backgroundColor: queueTicketId === t.id ? T.teal + "22" : T.surfaceAlt as string,
                  borderColor: queueTicketId === t.id ? T.teal : T.border,
                }]}>
                <Text style={[ts.queueRowNum, { color: T.teal }]}>{t.workflowNumber || t.ticketNumber || "—"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[ts.queueRowName, { color: T.text }]}>
                    {t.patientName || t.patientId || "Patient"}
                  </Text>
                  {t.initialComplaint ? (
                    <Text style={[ts.queueRowComplaint, { color: T.textMuted }]} numberOfLines={1}>
                      {t.initialComplaint}
                    </Text>
                  ) : null}
                  {t.appointmentId ? (
                    <Text style={[{ fontSize: 11, color: T.teal, fontWeight: "600" }]}>
                      📅 Appt {formatTime(t.appointmentScheduledAt)}
                    </Text>
                  ) : null}
                </View>
                <Text style={[{ fontSize: 12, fontWeight: "700", color: T.text }]}>
                  {queueTicketId === t.id ? "✓ Active" : "Select"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <MessageBanner message="No patients waiting in triage queue." tone="info" />
        )}

        <InputField label="Queue Ticket UUID (manual)" value={queueTicketId} onChangeText={setQueueTicketId} />
        <MessageBanner message={message} tone={tone} />
      </Card>

      {/* Assessment start */}
      <Card title="Assessment">
        <InputField label="Chief Complaint" value={chiefComplaint} onChangeText={setChiefComplaint} multiline />
        <InlineActions>
          <ActionButton label="Begin Assessment"    onPress={beginAssessment} />
          <ActionButton label="Reassessment"        onPress={beginReassessment} variant="secondary" />
        </InlineActions>
        <InputField label="Assessment UUID" value={assessmentId} onChangeText={setAssessmentId} />
        <InlineActions>
          <ActionButton label="Load Assessment" variant="ghost"
            onPress={async () => {
              try {
                const a = await triageApi.getAssessment(apiContext, assessmentId.trim());
                setResult(a); ok("Assessment loaded");
              } catch (e) { err(e); }
            }}
          />
        </InlineActions>
      </Card>

      {/* Vital Signs */}
      <Card title="Vital Signs">
        {[
          ["Temperature (°C)", "temperatureCelsius"],
          ["Heart Rate (bpm)", "heartRateBpm"],
          ["BP Systolic",      "bloodPressureSystolic"],
          ["BP Diastolic",     "bloodPressureDiastolic"],
          ["Respiratory Rate", "respiratoryRate"],
          ["SpO₂ (%)",         "oxygenSaturation"],
          ["Weight (kg)",      "weightKg"],
          ["Height (cm)",      "heightCm"],
          ["Pain Score (0-10)","painScore"],
          ["Blood Glucose (mmol/L)", "bloodGlucoseMmol"],
        ].map(([label, key]) => (
          <InputField
            key={key}
            label={label}
            value={(vitals as any)[key]}
            onChangeText={v => setVitals(prev => ({ ...prev, [key]: v }))}
          />
        ))}
        <ChoiceChips
          label="Consciousness Level"
          options={consciousnessOptions}
          value={vitals.consciousnessLevel}
          onChange={v => setVitals(prev => ({ ...prev, consciousnessLevel: v }))}
        />
        <InlineActions>
          <ActionButton label="Save Vitals" onPress={recordVitals} />
        </InlineActions>
      </Card>

      {/* Red Flags */}
      <Card title="Red Flags">
        {([
          ["Chest Pain",             "chestPain"],
          ["Difficulty Breathing",   "difficultyBreathing"],
          ["Stroke Symptoms",        "strokeSymptoms"],
          ["Severe Bleeding",        "severebleeding"],
          ["Allergic Reaction",      "allergicReaction"],
          ["Altered Mental Status",  "alteredMentalStatus"],
          ["Pregnancy Concern",      "pregnancyConcern"],
          ["Severe Abdominal Pain",  "severeAbdominalPain"],
        ] as [string, keyof RedFlagsForm][]).map(([label, key]) => (
          <ToggleField key={key} label={label} value={redFlags[key]}
            onChange={v => setRedFlags(prev => ({ ...prev, [key]: v }))} />
        ))}
        <InlineActions>
          <ActionButton label="Save Red Flags" onPress={recordRedFlags} variant="secondary" />
        </InlineActions>
      </Card>

      {/* Clinical Observations */}
      <Card title="Clinical Observations">
        <InputField label="History of Present Illness" value={hpi} onChangeText={setHpi} multiline />
        <InputField label="Symptom Onset"     value={symptomOnset}    onChangeText={setSymptomOnset}    placeholder="When did symptoms start?" />
        <InputField label="Symptom Duration"  value={symptomDuration} onChangeText={setSymptomDuration} placeholder="How long?" />
        <InputField label="Pain Location / Severity" value={painLocation} onChangeText={setPainLocation} placeholder="Location + 0-10 scale" />
        <InputField label="Additional Symptoms" value={additionalSymptoms} onChangeText={setAdditionalSymptoms} multiline placeholder="Cough, nausea, dizziness…" />
        <InputField label="Exposure / Travel / Infection Risk" value={exposure} onChangeText={setExposure} multiline />
        <InputField label="Allergies"          value={allergies}   onChangeText={setAllergies} />
        <InputField label="Current Medications" value={medications} onChangeText={setMedications} multiline />
        <InputField label="Past Medical History" value={pastHistory} onChangeText={setPastHistory} multiline />
        <InputField label="Nursing Notes"       value={nursingNotes} onChangeText={setNursingNotes} multiline />
        <InlineActions>
          <ActionButton label="Save Observations" onPress={recordObservations} />
        </InlineActions>
      </Card>

      {/* Finalize */}
      <Card title="Finalize Triage">
        <InlineActions>
          <ActionButton label="Accept System Triage" onPress={acceptSystem} variant="secondary" />
        </InlineActions>
        <ChoiceChips label="Override Level" options={triageLevelOptions} value={overrideLevel} onChange={setOverrideLevel} />
        <InputField label="Override Reason" value={overrideReason} onChangeText={setOverrideReason} multiline />
        <InlineActions>
          <ActionButton label="Override Triage"      onPress={overrideTriage} variant="danger" />
          <ActionButton label="Load Summary"         onPress={loadSummary}   variant="ghost" />
        </InlineActions>
        {summary ? <JsonPanel value={{ summary }} /> : null}

        <InputField label="Physical Exam (optional, for AI suggestions)" value={physicalExam} onChangeText={setPhysicalExam} multiline />
        <InlineActions>
          <ActionButton label="Load Outcome + Suggestions" onPress={loadOutcome} />
        </InlineActions>

        {/* Handoff to specific physician (optional) */}
        <InputField label="Assigned Physician Name (optional)"     value={handoffClinician} onChangeText={setHandoffClinician} />
        <InputField label="Physician Employee ID (optional)"       value={handoffEmpId}     onChangeText={setHandoffEmpId} />
        <InputField label="Physician User UUID (optional)"         value={handoffUserId}    onChangeText={setHandoffUserId} />
        <InputField label="Handoff Notes (optional)"               value={handoffNotes}     onChangeText={setHandoffNotes} multiline />
        <InlineActions>
          <ActionButton label="Record Handoff"       onPress={handoffToClinician} variant="secondary" />
        </InlineActions>

        <InlineActions>
          <ActionButton label="Send to Doctor Queue" onPress={sendToDoctorQueue} />
          <ActionButton label="Proceed to Encounter" onPress={proceedToEncounter} variant="secondary" />
        </InlineActions>

        {outcome ? <JsonPanel value={outcome} /> : null}
      </Card>

      {result ? <Card title="Assessment Result"><JsonPanel value={result} /></Card> : null}
    </ScrollView>
  );
}

const ts = StyleSheet.create({
  headerRow:     { gap: 10, marginBottom: 4 },
  backBtn:       { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  backBtnText:   { fontSize: 13, fontWeight: "600" },
  patientBanner: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  patientName:   { fontSize: 16, fontWeight: "800" },
  patientSub:    { fontSize: 12, marginTop: 2 },
  triagePill:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5 },
  queueRow:      { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  queueRowNum:   { fontSize: 14, fontWeight: "800", width: 55 },
  queueRowName:  { fontSize: 13, fontWeight: "700" },
  queueRowComplaint: { fontSize: 11 },
});
