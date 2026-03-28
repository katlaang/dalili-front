import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { queueApi, triageApi } from "../../api/services";
import type {
  PregnancyStatus,
  QueueTicket,
  TriageAssessment,
  TriageOutcomeResult,
  VulnerabilityIndicator,
} from "../../api/types";
import {
  consciousnessOptions,
  pregnancyStatusOptions,
  triageLevelOptions,
  vulnerabilityIndicatorOptions,
} from "../../config/options";
import {
  ActionButton,
  Card,
  ChoiceChips,
  InlineActions,
  InputField,
  MessageBanner,
  ToggleField,
  useTheme,
} from "../../components/ui";
import { triagePalette } from "../../constants/theme";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import { getVulnerabilityBadgeColors, getVulnerabilityMarkers } from "../../utils/vulnerability";

interface VitalsForm {
  temperatureCelsius: string;
  heartRateBpm: string;
  bloodPressureSystolic: string;
  bloodPressureDiastolic: string;
  respiratoryRate: string;
  oxygenSaturation: string;
  weightKg: string;
  heightCm: string;
  painScore: string;
  bloodGlucoseMmol: string;
  consciousnessLevel: string;
}

type MeasurementSystem = "METRIC" | "IMPERIAL";

const defaultVitals: VitalsForm = {
  temperatureCelsius: "",
  heartRateBpm: "",
  bloodPressureSystolic: "",
  bloodPressureDiastolic: "",
  respiratoryRate: "",
  oxygenSaturation: "",
  weightKg: "",
  heightCm: "",
  painScore: "",
  bloodGlucoseMmol: "",
  consciousnessLevel: "ALERT",
};

interface RedFlagsForm {
  chestPain: boolean;
  difficultyBreathing: boolean;
  strokeSymptoms: boolean;
  severebleeding: boolean;
  allergicReaction: boolean;
  alteredMentalStatus: boolean;
  pregnancyConcern: boolean;
  severeAbdominalPain: boolean;
}

const defaultRedFlags: RedFlagsForm = {
  chestPain: false,
  difficultyBreathing: false,
  strokeSymptoms: false,
  severebleeding: false,
  allergicReaction: false,
  alteredMentalStatus: false,
  pregnancyConcern: false,
  severeAbdominalPain: false,
};

const parseNum = (value: string) => (value.trim() ? Number(value) : undefined);
const asInput = (value: unknown) => (value == null ? "" : String(value));
const isApiStatus = (error: unknown, status: number) =>
  typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === status;

const convertNumericString = (
  value: string,
  convert: (input: number) => number,
  decimals = 1
) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return value;
  return String(Number(convert(numeric).toFixed(decimals)));
};

const convertVitalsBetweenSystems = (
  values: VitalsForm,
  from: MeasurementSystem,
  to: MeasurementSystem
): VitalsForm => {
  if (from === to) return values;

  const metricToImperial = from === "METRIC" && to === "IMPERIAL";

  return {
    ...values,
    temperatureCelsius: convertNumericString(
      values.temperatureCelsius,
      metricToImperial
        ? (input) => (input * 9) / 5 + 32
        : (input) => ((input - 32) * 5) / 9
    ),
    weightKg: convertNumericString(
      values.weightKg,
      metricToImperial
        ? (input) => input * 2.20462
        : (input) => input / 2.20462
    ),
    heightCm: convertNumericString(
      values.heightCm,
      metricToImperial
        ? (input) => input / 2.54
        : (input) => input * 2.54
    ),
    bloodGlucoseMmol: convertNumericString(
      values.bloodGlucoseMmol,
      metricToImperial
        ? (input) => input * 18
        : (input) => input / 18,
      metricToImperial ? 0 : 1
    ),
  };
};

const formatTime = (iso?: string) => {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatStatus = (status?: string | null) => {
  const normalized = (status || "").replace(/_/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, char => char.toUpperCase());
};

const formatChoiceLabel = (value?: string | null) => {
  const normalized = (value || "").replace(/_/g, " ").trim();
  if (!normalized) return "Not recorded";
  return normalized.replace(/\b\w/g, char => char.toUpperCase());
};

function splitObservationNotes(notes?: string | null) {
  const lines = (notes || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const state = {
    nursingNotes: [] as string[],
    symptomOnset: "",
    symptomDuration: "",
    painLocation: "",
    additionalSymptoms: "",
    exposure: "",
  };

  lines.forEach(line => {
    if (line.startsWith("Onset: ")) state.symptomOnset = line.slice("Onset: ".length);
    else if (line.startsWith("Duration: ")) state.symptomDuration = line.slice("Duration: ".length);
    else if (line.startsWith("Pain location: ")) state.painLocation = line.slice("Pain location: ".length);
    else if (line.startsWith("Additional: ")) state.additionalSymptoms = line.slice("Additional: ".length);
    else if (line.startsWith("Exposure/travel: ")) state.exposure = line.slice("Exposure/travel: ".length);
    else state.nursingNotes.push(line);
  });

  return {
    nursingNotes: state.nursingNotes.join("\n"),
    symptomOnset: state.symptomOnset,
    symptomDuration: state.symptomDuration,
    painLocation: state.painLocation,
    additionalSymptoms: state.additionalSymptoms,
    exposure: state.exposure,
  };
}

type TriageKey = keyof typeof triagePalette;
const TRIAGE_SECTIONS = ["queue", "assessment", "disposition"] as const;
type TriageSection = (typeof TRIAGE_SECTIONS)[number];

interface TriageScreenProps {
  initialQueueTicketId?: string;
  initialAssessmentId?: string;
  onAssessmentLinked?: (payload: { queueTicketId: string; assessmentId: string }) => void;
  onMoveToEncounter?: (queueTicketId: string) => void;
  onBack?: () => void;
}

export function TriageScreen({
  initialQueueTicketId,
  initialAssessmentId,
  onAssessmentLinked,
  onMoveToEncounter,
  onBack,
}: TriageScreenProps) {
  const { apiContext } = useSession();
  const { theme: T } = useTheme();

  const [queueTicketId, setQueueTicketId] = useState(initialQueueTicketId || "");
  const [assessmentId, setAssessmentId] = useState(initialAssessmentId || "");
  const [triageRows, setTriageRows] = useState<QueueTicket[]>([]);
  const [activeTriageRows, setActiveTriageRows] = useState<QueueTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<QueueTicket | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [vitals, setVitals] = useState<VitalsForm>(defaultVitals);
  const [redFlags, setRedFlags] = useState<RedFlagsForm>(defaultRedFlags);
  const [hpi, setHpi] = useState("");
  const [symptomOnset, setSymptomOnset] = useState("");
  const [symptomDuration, setSymptomDuration] = useState("");
  const [painLocation, setPainLocation] = useState("");
  const [additionalSymptoms, setAdditionalSymptoms] = useState("");
  const [exposure, setExposure] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [pastHistory, setPastHistory] = useState("");
  const [nursingNotes, setNursingNotes] = useState("");
  const [pregnancyStatus, setPregnancyStatus] = useState<PregnancyStatus>("UNKNOWN");
  const [vulnerabilityIndicators, setVulnerabilityIndicators] = useState<VulnerabilityIndicator[]>([]);
  const [vulnerabilityNotes, setVulnerabilityNotes] = useState("");
  const [overrideLevel, setOverrideLevel] = useState("ORANGE");
  const [overrideReason, setOverrideReason] = useState("");
  const [physicalExam, setPhysicalExam] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TriageOutcomeResult | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [currentAssessment, setCurrentAssessment] = useState<TriageAssessment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [measurementSystem, setMeasurementSystem] = useState<MeasurementSystem>("METRIC");
  const [handoffClinician, setHandoffClinician] = useState("");
  const [handoffEmpId, setHandoffEmpId] = useState("");
  const [handoffUserId, setHandoffUserId] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");

  const err = (error: unknown) => {
    setMessage(toErrorMessage(error));
    setTone("error");
  };

  const ok = (text: string) => {
    setMessage(text);
    setTone("success");
  };

  const resetTicketForm = useCallback((ticket?: QueueTicket | null) => {
    setAssessmentId("");
    setChiefComplaint(ticket?.initialComplaint || "");
    setVitals(defaultVitals);
    setRedFlags(defaultRedFlags);
    setHpi("");
    setSymptomOnset("");
    setSymptomDuration("");
    setPainLocation("");
    setAdditionalSymptoms("");
    setExposure("");
    setAllergies("");
    setMedications("");
    setPastHistory("");
    setNursingNotes("");
    setPregnancyStatus("UNKNOWN");
    setVulnerabilityIndicators([]);
    setVulnerabilityNotes("");
    setOverrideLevel("ORANGE");
    setOverrideReason("");
    setPhysicalExam("");
    setSummary(null);
    setOutcome(null);
    setResult(null);
    setCurrentAssessment(null);
    setHandoffClinician("");
    setHandoffEmpId("");
    setHandoffUserId("");
    setHandoffNotes("");
  }, []);

  const hydrateAssessment = useCallback((assessment: TriageAssessment) => {
    const noteParts = splitObservationNotes(assessment.nursingNotes);
    const metricVitals: VitalsForm = {
      temperatureCelsius: asInput(assessment.temperatureCelsius),
      heartRateBpm: asInput(assessment.heartRateBpm),
      bloodPressureSystolic: asInput(assessment.bloodPressureSystolic),
      bloodPressureDiastolic: asInput(assessment.bloodPressureDiastolic),
      respiratoryRate: asInput(assessment.respiratoryRate),
      oxygenSaturation: asInput(assessment.oxygenSaturation),
      weightKg: asInput(assessment.weightKg),
      heightCm: asInput(assessment.heightCm),
      painScore: asInput(assessment.painScore),
      bloodGlucoseMmol: asInput(assessment.bloodGlucoseMmol),
      consciousnessLevel: assessment.consciousnessLevel || "ALERT",
    };
    setAssessmentId(assessment.id);
    setChiefComplaint(assessment.chiefComplaint || "");
    setVitals(
      measurementSystem === "IMPERIAL"
        ? convertVitalsBetweenSystems(metricVitals, "METRIC", "IMPERIAL")
        : metricVitals
    );
    setRedFlags({
      chestPain: !!assessment.chestPain,
      difficultyBreathing: !!assessment.difficultyBreathing,
      strokeSymptoms: !!assessment.strokeSymptoms,
      severebleeding: !!assessment.severebleeding,
      allergicReaction: !!assessment.allergicReaction,
      alteredMentalStatus: !!assessment.alteredMentalStatus,
      pregnancyConcern: !!assessment.pregnancyConcern,
      severeAbdominalPain: !!assessment.severeAbdominalPain,
    });
    setHpi(assessment.historyOfPresentIllness || "");
    setSymptomOnset(noteParts.symptomOnset);
    setSymptomDuration(noteParts.symptomDuration);
    setPainLocation(noteParts.painLocation);
    setAdditionalSymptoms(noteParts.additionalSymptoms);
    setExposure(noteParts.exposure);
    setAllergies(assessment.allergies || "");
    setMedications(assessment.currentMedications || "");
    setPastHistory(assessment.pastMedicalHistory || "");
    setNursingNotes(noteParts.nursingNotes);
    setPregnancyStatus((assessment.pregnancyStatus as PregnancyStatus | null) || "UNKNOWN");
    setVulnerabilityIndicators((assessment.vulnerabilityIndicators || []) as VulnerabilityIndicator[]);
    setVulnerabilityNotes(assessment.vulnerabilityNotes || "");
    setOverrideLevel(assessment.finalTriageLevel || assessment.systemTriageLevel || "ORANGE");
    setOverrideReason(assessment.overrideReason || "");
    setResult(assessment);
    setCurrentAssessment(assessment);
  }, [measurementSystem]);

  const refreshWorkspace = useCallback(async (quiet = false) => {
    if (!apiContext) return;
    try {
      const [waitingRows, todayRows] = await Promise.all([
        queueApi.getQueue(apiContext, "triage"),
        queueApi.getQueue(apiContext, "today"),
      ]);
      const activeRows = todayRows.filter(ticket =>
        !ticket.triaged && ["CALLED", "IN_PROGRESS"].includes((ticket.status || "").toUpperCase())
      );
      setTriageRows(waitingRows);
      setActiveTriageRows(activeRows);
      if (!quiet) ok(`Loaded ${waitingRows.length} waiting and ${activeRows.length} active triage patient(s)`);
    } catch (error) {
      err(error);
    }
  }, [apiContext]);

  const loadTicketWorkspace = useCallback(async (ticketIdValue: string, fallbackTicket?: QueueTicket, quiet = false) => {
    if (!apiContext) return;
    const id = ticketIdValue.trim();
    if (!id) {
      err(new Error("Select a queue ticket first"));
      return;
    }
    try {
      const [ticket, assessment] = await Promise.all([
        fallbackTicket ? Promise.resolve(fallbackTicket) : queueApi.getTicket(apiContext, id),
        triageApi.getAssessmentForTicket(apiContext, id).catch(error => {
          if (isApiStatus(error, 404)) return null;
          throw error;
        }),
      ]);
      setQueueTicketId(ticket.id);
      setActiveTicket(ticket);
      setSummary(null);
      setOutcome(null);
      setPhysicalExam("");
      setHandoffClinician("");
      setHandoffEmpId("");
      setHandoffUserId("");
      setHandoffNotes("");
      if (assessment) {
        hydrateAssessment(assessment);
        onAssessmentLinked?.({ queueTicketId: ticket.id, assessmentId: assessment.id });
      } else {
        resetTicketForm(ticket);
      }
      if (!quiet) {
        const ref = ticket.workflowNumber || ticket.ticketNumber || ticket.id.slice(0, 8);
        ok(assessment ? `Resumed ${ref} from live triage data` : `Loaded ${ref} into triage workspace`);
      }
    } catch (error) {
      err(error);
    }
  }, [apiContext, hydrateAssessment, onAssessmentLinked, resetTicketForm]);

  const loadAssessmentWorkspace = useCallback(async (assessmentIdValue: string, quiet = false) => {
    if (!apiContext) return;
    const id = assessmentIdValue.trim();
    if (!id) {
      err(new Error("Load or begin an assessment first"));
      return;
    }
    try {
      const assessment = await triageApi.getAssessment(apiContext, id);
      const ticket = await queueApi.getTicket(apiContext, assessment.queueTicketId);
      setQueueTicketId(ticket.id);
      setActiveTicket(ticket);
      setSummary(null);
      setOutcome(null);
      setPhysicalExam("");
      setHandoffClinician("");
      setHandoffEmpId("");
      setHandoffUserId("");
      setHandoffNotes("");
      hydrateAssessment(assessment);
      onAssessmentLinked?.({ queueTicketId: ticket.id, assessmentId: assessment.id });
      if (!quiet) {
        const ref = ticket.workflowNumber || ticket.ticketNumber || ticket.id.slice(0, 8);
        ok(`Restored ${ref} assessment from live data`);
      }
    } catch (error) {
      err(error);
    }
  }, [apiContext, hydrateAssessment, onAssessmentLinked]);

  useEffect(() => {
    void refreshWorkspace(true);
  }, [refreshWorkspace]);

  useEffect(() => {
    if (initialAssessmentId) {
      void loadAssessmentWorkspace(initialAssessmentId, true);
      return;
    }
    if (initialQueueTicketId) {
      void loadTicketWorkspace(initialQueueTicketId, undefined, true);
    }
  }, [initialAssessmentId, initialQueueTicketId, loadAssessmentWorkspace, loadTicketWorkspace]);

  useEffect(() => {
    if (queueTicketId || assessmentId || activeTriageRows.length !== 1) return;
    void loadTicketWorkspace(activeTriageRows[0].id, activeTriageRows[0], true);
  }, [activeTriageRows, assessmentId, loadTicketWorkspace, queueTicketId]);

  if (!apiContext) {
    return <Card title="Triage"><MessageBanner message="No authenticated session." tone="error" /></Card>;
  }

  const beginAssessment = async () => {
    try {
      const assessment = await triageApi.beginAssessment(apiContext, queueTicketId.trim(), chiefComplaint);
      setAssessmentId(assessment.id);
      setResult(assessment);
      setCurrentAssessment(assessment);
      onAssessmentLinked?.({ queueTicketId: queueTicketId.trim(), assessmentId: assessment.id });
      await refreshWorkspace(true);
      ok("Assessment started");
    } catch (error) {
      err(error);
    }
  };

  const beginReassessment = async () => {
    try {
      const assessment = await triageApi.beginReassessment(apiContext, queueTicketId.trim());
      setAssessmentId(assessment.id);
      setResult(assessment);
      setCurrentAssessment(assessment);
      onAssessmentLinked?.({ queueTicketId: queueTicketId.trim(), assessmentId: assessment.id });
      await refreshWorkspace(true);
      ok("Reassessment started");
    } catch (error) {
      err(error);
    }
  };

  const recordVitals = async () => {
    try {
      const metricVitals = measurementSystem === "IMPERIAL"
        ? convertVitalsBetweenSystems(vitals, "IMPERIAL", "METRIC")
        : vitals;
      const assessment = await triageApi.recordVitals(apiContext, assessmentId.trim(), {
        temperatureCelsius: parseNum(metricVitals.temperatureCelsius),
        heartRateBpm: parseNum(metricVitals.heartRateBpm),
        bloodPressureSystolic: parseNum(metricVitals.bloodPressureSystolic),
        bloodPressureDiastolic: parseNum(metricVitals.bloodPressureDiastolic),
        respiratoryRate: parseNum(metricVitals.respiratoryRate),
        oxygenSaturation: parseNum(metricVitals.oxygenSaturation),
        weightKg: parseNum(metricVitals.weightKg),
        heightCm: parseNum(metricVitals.heightCm),
        painScore: parseNum(metricVitals.painScore),
        bloodGlucoseMmol: parseNum(metricVitals.bloodGlucoseMmol),
        consciousnessLevel: metricVitals.consciousnessLevel,
      });
      setResult(assessment);
      setCurrentAssessment(assessment);
      ok("Vitals recorded");
    } catch (error) {
      err(error);
    }
  };

  const recordRedFlags = async () => {
    try {
      const assessment = await triageApi.recordRedFlags(apiContext, assessmentId.trim(), redFlags);
      setResult(assessment);
      setCurrentAssessment(assessment);
      ok("Red flags recorded");
    } catch (error) {
      err(error);
    }
  };

  const recordObservations = async () => {
    try {
      const combinedNotes = [
        nursingNotes.trim() || null,
        symptomOnset.trim() ? `Onset: ${symptomOnset.trim()}` : null,
        symptomDuration.trim() ? `Duration: ${symptomDuration.trim()}` : null,
        painLocation.trim() ? `Pain location: ${painLocation.trim()}` : null,
        additionalSymptoms.trim() ? `Additional: ${additionalSymptoms.trim()}` : null,
        exposure.trim() ? `Exposure/travel: ${exposure.trim()}` : null,
      ].filter(Boolean).join("\n");

      const assessment = await triageApi.recordObservations(apiContext, assessmentId.trim(), {
        historyOfPresentIllness: hpi,
        allergies,
        currentMedications: medications,
        pastMedicalHistory: pastHistory,
        nursingNotes: combinedNotes,
        pregnancyStatus,
        vulnerabilityIndicators,
        vulnerabilityNotes: vulnerabilityNotes || null,
      });
      setResult(assessment);
      setCurrentAssessment(assessment);
      ok("Observations recorded");
    } catch (error) {
      err(error);
    }
  };

  const acceptSystem = async () => {
    try {
      const assessment = await triageApi.acceptSystemTriage(apiContext, assessmentId.trim());
      setResult(assessment);
      setCurrentAssessment(assessment);
      ok("System triage accepted");
    } catch (error) {
      err(error);
    }
  };

  const overrideTriage = async () => {
    try {
      const assessment = await triageApi.overrideTriage(apiContext, assessmentId.trim(), {
        newTriageLevel: overrideLevel,
        reason: overrideReason,
      });
      setResult(assessment);
      setCurrentAssessment(assessment);
      ok("Triage overridden");
    } catch (error) {
      err(error);
    }
  };

  const loadSummary = async () => {
    try {
      const response = await triageApi.getSummary(apiContext, assessmentId.trim());
      setSummary(response.summary);
      ok("Summary loaded");
    } catch (error) {
      err(error);
    }
  };

  const loadOutcome = async () => {
    try {
      const response = await triageApi.getOutcome(apiContext, assessmentId.trim(), physicalExam || undefined);
      setOutcome(response);
      ok("Outcome loaded");
    } catch (error) {
      err(error);
    }
  };

  const sendToDoctorQueue = async () => {
    try {
      const id = queueTicketId.trim();
      if (!id) throw new Error("Select a queue ticket first");

      try {
        await queueApi.startTicket(apiContext, id);
      } catch {
      }

      let moved: QueueTicket | null = null;
      try {
        moved = await queueApi.returnToWaiting(apiContext, id);
      } catch {
        const consultationQueue = await queueApi.getQueue(apiContext, "consultation");
        moved = consultationQueue.find(ticket => ticket.id === id) || null;
        if (!moved) throw new Error("Patient not yet eligible for doctor queue. Complete triage first.");
      }

      setResult(moved);
      setActiveTicket(moved);
      await refreshWorkspace(true);

      const displayId = moved.workflowNumber || moved.ticketNumber || id.slice(0, 8);
      const patientNumberSuffix = moved.patientNumber && moved.patientNumber !== moved.ticketNumber
        ? `  ·  Patient # ${moved.patientNumber}`
        : "";
      const messageText = moved.appointmentId
        ? `Sent to Doctor Queue - ${displayId}${patientNumberSuffix}  ·  Appointment at ${formatTime(moved.appointmentScheduledAt)}${moved.assignedClinicianName ? ` · ${moved.assignedClinicianName}` : ""}`
        : `Sent to Doctor Queue - ${displayId}${patientNumberSuffix} (FIFO order)`;
      ok(messageText);
    } catch (error) {
      err(error);
    }
  };

  const handoffToClinician = async () => {
    try {
      await queueApi.handoffToClinician(apiContext, queueTicketId.trim(), {
        clinicianName: handoffClinician.trim(),
        clinicianEmployeeId: handoffEmpId.trim(),
        clinicianUserId: handoffUserId.trim() || null,
        handoffNotes: handoffNotes || null,
      });
      ok(`Handoff recorded to ${handoffClinician}`);
    } catch (error) {
      err(error);
    }
  };

  const proceedToEncounter = () => {
    const id = queueTicketId.trim();
    if (!id) {
      err(new Error("Select a queue ticket first"));
      return;
    }
    onMoveToEncounter?.(id);
  };

  const triageKey = ((activeTicket?.triageLevel || "").toUpperCase()) as TriageKey;
  const triageColor = triagePalette[triageKey];
  const recordedVulnerabilityMarkers = getVulnerabilityMarkers({
    ageYears: currentAssessment?.patientAgeYears,
    ageInDays: currentAssessment?.patientAgeInDays,
    pregnancyStatus: currentAssessment?.pregnancyStatus || pregnancyStatus,
    isPregnant: currentAssessment?.pregnant,
    newborn: currentAssessment?.newborn,
    elderly: currentAssessment?.elderly,
    vulnerabilityIndicators: currentAssessment?.vulnerabilityIndicators || vulnerabilityIndicators,
  });
  const vitalFieldLabels: Array<[string, keyof VitalsForm]> = [
    [measurementSystem === "METRIC" ? "Temperature (C)" : "Temperature (F)", "temperatureCelsius"],
    ["Heart Rate (bpm)", "heartRateBpm"],
    ["BP Systolic", "bloodPressureSystolic"],
    ["BP Diastolic", "bloodPressureDiastolic"],
    ["Respiratory Rate", "respiratoryRate"],
    ["SpO2 (%)", "oxygenSaturation"],
    [measurementSystem === "METRIC" ? "Weight (kg)" : "Weight (lb)", "weightKg"],
    [measurementSystem === "METRIC" ? "Height (cm)" : "Height (in)", "heightCm"],
    ["Pain Score (0-10)", "painScore"],
    [measurementSystem === "METRIC" ? "Blood Glucose (mmol/L)" : "Blood Glucose (mg/dL)", "bloodGlucoseMmol"],
  ];
  const toggleVulnerabilityIndicator = (indicator: VulnerabilityIndicator) => {
    setVulnerabilityIndicators(previous =>
      previous.includes(indicator)
        ? previous.filter(value => value !== indicator)
        : [...previous, indicator]
    );
  };

  return (
    <ScrollView contentContainerStyle={{ gap: 14 }}>
      <Card title="Triage Workspace">
        <View style={ts.headerRow}>
          {onBack ? (
            <Pressable onPress={onBack} style={[ts.backBtn, { borderColor: T.border }]}>
              <Text style={[ts.backBtnText, { color: T.teal }]}>Back to Queue</Text>
            </Pressable>
          ) : null}
          {activeTicket ? (
            <View style={[ts.patientBanner, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
              <View>
                <Text style={[ts.patientName, { color: T.text }]}>
                  {activeTicket.patientName || activeTicket.patientId || "Patient"}
                </Text>
                <Text style={[ts.patientSub, { color: T.textMuted }]}>
                  {activeTicket.workflowNumber || activeTicket.ticketNumber || activeTicket.id.slice(0, 8)}
                  {activeTicket.patientNumber && activeTicket.patientNumber !== activeTicket.ticketNumber
                    ? `  ·  Patient # ${activeTicket.patientNumber}`
                    : ""}
                  {activeTicket.appointmentId
                    ? `  ·  Appointment ${formatTime(activeTicket.appointmentScheduledAt)}`
                    : "  ·  Walk-in"}
                  {activeTicket.status ? `  ·  ${formatStatus(activeTicket.status)}` : ""}
                </Text>
              </View>
              {triageColor ? (
                <View style={[ts.triagePill, {
                  backgroundColor: T.scheme === "dark" ? triageColor.bgDark : triageColor.bgLight,
                  borderColor: triageColor.border,
                }]}>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: T.scheme === "dark" ? triageColor.textDark : triageColor.textLight,
                  }}>
                    {triageColor.label}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <InlineActions>
          <ActionButton label="Refresh Triage Workspace" onPress={() => void refreshWorkspace()} variant="secondary" />
          <ActionButton label="Load Ticket Workspace" onPress={() => void loadTicketWorkspace(queueTicketId)} variant="ghost" />
        </InlineActions>

        {activeTriageRows.length > 0 ? (
          <View style={{ gap: 6, marginBottom: 10 }}>
            <Text style={[ts.sectionLabel, { color: T.textMuted }]}>Active Triage Sessions</Text>
            {activeTriageRows.map(ticket => (
              <Pressable
                key={ticket.id}
                onPress={() => void loadTicketWorkspace(ticket.id, ticket)}
                style={[ts.queueRow, {
                  backgroundColor: queueTicketId === ticket.id ? T.teal + "22" : T.surfaceAlt as string,
                  borderColor: queueTicketId === ticket.id ? T.teal : T.border,
                }]}
              >
                <Text style={[ts.queueRowNum, { color: T.teal }]}>
                  {ticket.workflowNumber || ticket.ticketNumber || "-"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[ts.queueRowName, { color: T.text }]}>
                    {ticket.patientName || ticket.patientId || "Patient"}
                  </Text>
                  <Text style={[ts.queueRowComplaint, { color: T.textMuted }]} numberOfLines={1}>
                    {formatStatus(ticket.status)}{ticket.counterNumber ? `  ·  ${ticket.counterNumber}` : ""}
                  </Text>
                </View>
                <Text style={[ts.rowAction, { color: T.text }]}>
                  {queueTicketId === ticket.id ? "Active" : "Resume"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[ts.sectionLabel, { color: T.textMuted }]}>Patients Waiting For Triage</Text>
        {triageRows.length > 0 ? (
          <View style={{ gap: 6 }}>
            {triageRows.map(ticket => (
              <Pressable
                key={ticket.id}
                onPress={() => void loadTicketWorkspace(ticket.id, ticket)}
                style={[ts.queueRow, {
                  backgroundColor: queueTicketId === ticket.id ? T.teal + "22" : T.surfaceAlt as string,
                  borderColor: queueTicketId === ticket.id ? T.teal : T.border,
                }]}
              >
                <Text style={[ts.queueRowNum, { color: T.teal }]}>
                  {ticket.workflowNumber || ticket.ticketNumber || "-"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[ts.queueRowName, { color: T.text }]}>
                    {ticket.patientName || ticket.patientId || "Patient"}
                  </Text>
                  {ticket.initialComplaint ? (
                    <Text style={[ts.queueRowComplaint, { color: T.textMuted }]} numberOfLines={1}>
                      {ticket.initialComplaint}
                    </Text>
                  ) : null}
                  {ticket.appointmentId ? (
                    <Text style={[ts.queueRowMeta, { color: T.teal }]}>
                      Appointment {formatTime(ticket.appointmentScheduledAt)}
                    </Text>
                  ) : null}
                </View>
                <Text style={[ts.rowAction, { color: T.text }]}>
                  {queueTicketId === ticket.id ? "Active" : "Select"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <MessageBanner
            message={activeTriageRows.length > 0
              ? "No new patients are waiting. Use Active Triage Sessions above to resume in-progress work."
              : "No patients waiting in triage queue."}
            tone="info"
          />
        )}

        <MessageBanner message={message} tone={tone} />
      </Card>

      <Card title="Assessment">
        <InputField label="Chief Complaint" value={chiefComplaint} onChangeText={setChiefComplaint} multiline />
        <InlineActions>
          <ActionButton label="Begin Assessment" onPress={beginAssessment} />
          <ActionButton label="Reassessment" onPress={beginReassessment} variant="secondary" />
        </InlineActions>
      </Card>

      <Card title="Vital Signs">
        <ChoiceChips
          label="Measurement System"
          options={["METRIC", "IMPERIAL"]}
          value={measurementSystem}
          onChange={(value) => {
            const nextSystem = value as MeasurementSystem;
            setVitals(previous => convertVitalsBetweenSystems(previous, measurementSystem, nextSystem));
            setMeasurementSystem(nextSystem);
          }}
        />
        <MessageBanner
          message={measurementSystem === "METRIC"
            ? "Measurements are being entered in metric and saved to the chart as metric."
            : "Measurements are being entered in imperial and converted back to metric when saved."}
          tone="info"
        />
        {vitalFieldLabels.map(([label, key]) => (
          <InputField
            key={key}
            label={label}
            value={vitals[key]}
            onChangeText={value => setVitals(prev => ({ ...prev, [key]: value }))}
          />
        ))}
        <ChoiceChips
          label="Consciousness Level"
          options={consciousnessOptions}
          value={vitals.consciousnessLevel}
          onChange={value => setVitals(prev => ({ ...prev, consciousnessLevel: value }))}
        />
        <InlineActions>
          <ActionButton label="Save Vitals" onPress={recordVitals} />
        </InlineActions>
      </Card>

      <Card title="Red Flags">
        {([
          ["Chest Pain", "chestPain"],
          ["Difficulty Breathing", "difficultyBreathing"],
          ["Stroke Symptoms", "strokeSymptoms"],
          ["Severe Bleeding", "severebleeding"],
          ["Allergic Reaction", "allergicReaction"],
          ["Altered Mental Status", "alteredMentalStatus"],
          ["Pregnancy Concern", "pregnancyConcern"],
          ["Severe Abdominal Pain", "severeAbdominalPain"],
        ] as [string, keyof RedFlagsForm][]).map(([label, key]) => (
          <ToggleField
            key={key}
            label={label}
            value={redFlags[key]}
            onChange={value => setRedFlags(prev => ({ ...prev, [key]: value }))}
          />
        ))}
        <InlineActions>
          <ActionButton label="Save Red Flags" onPress={recordRedFlags} variant="secondary" />
        </InlineActions>
      </Card>

      <Card title="Clinical Observations">
        <InputField label="History of Present Illness" value={hpi} onChangeText={setHpi} multiline />
        <InputField label="Symptom Onset" value={symptomOnset} onChangeText={setSymptomOnset} placeholder="When did symptoms start?" />
        <InputField label="Symptom Duration" value={symptomDuration} onChangeText={setSymptomDuration} placeholder="How long?" />
        <InputField label="Pain Location / Severity" value={painLocation} onChangeText={setPainLocation} placeholder="Location + 0-10 scale" />
        <InputField label="Additional Symptoms" value={additionalSymptoms} onChangeText={setAdditionalSymptoms} multiline placeholder="Cough, nausea, dizziness" />
        <InputField label="Exposure / Travel / Infection Risk" value={exposure} onChangeText={setExposure} multiline />
        <InputField label="Allergies" value={allergies} onChangeText={setAllergies} />
        <InputField label="Current Medications" value={medications} onChangeText={setMedications} multiline />
        <InputField label="Past Medical History" value={pastHistory} onChangeText={setPastHistory} multiline />
        <InputField label="Nursing Notes" value={nursingNotes} onChangeText={setNursingNotes} multiline />
        <ChoiceChips
          label="Pregnancy Status"
          options={pregnancyStatusOptions}
          value={pregnancyStatus}
          onChange={(value) => setPregnancyStatus(value as PregnancyStatus)}
        />
        <View style={{ gap: 6 }}>
          <Text style={[ts.sectionLabel, { color: T.textMuted }]}>Vulnerability Indicators</Text>
          <View style={ts.vulnerabilityChoiceWrap}>
            {vulnerabilityIndicatorOptions.map(option => {
              const selected = vulnerabilityIndicators.includes(option);
              return (
                <Pressable
                  key={option}
                  onPress={() => toggleVulnerabilityIndicator(option)}
                  style={[
                    ts.vulnerabilityChoiceChip,
                    {
                      borderColor: selected ? T.teal : T.border,
                      backgroundColor: selected ? T.teal : T.surfaceAlt as string,
                    },
                  ]}
                >
                  <Text style={[ts.vulnerabilityChoiceText, { color: selected ? "#fff" : T.textMid }]}>
                    {formatChoiceLabel(option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <InputField
          label="Vulnerability Notes"
          value={vulnerabilityNotes}
          onChangeText={setVulnerabilityNotes}
          multiline
          placeholder="Safeguarding, support, or vulnerability notes"
        />
        <InlineActions>
          <ActionButton label="Save Observations" onPress={recordObservations} />
        </InlineActions>
        {currentAssessment ? (
          <View style={[ts.summaryBox, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
            <Text style={[ts.summaryLabel, { color: T.textMuted }]}>Recorded Vulnerability Summary</Text>
            <Text style={[ts.summaryMeta, { color: T.textMid }]}>
              Pregnancy status: {formatChoiceLabel(currentAssessment.pregnancyStatus || pregnancyStatus)}
            </Text>
            {recordedVulnerabilityMarkers.length > 0 ? (
              <View style={ts.vulnerabilityBadgeWrap}>
                {recordedVulnerabilityMarkers.map(marker => {
                  const colors = getVulnerabilityBadgeColors(marker.tone);
                  return (
                    <View
                      key={marker.key}
                      style={[
                        ts.vulnerabilityBadge,
                        {
                          backgroundColor: colors.backgroundColor,
                          borderColor: colors.borderColor,
                        },
                      ]}
                    >
                      <Text style={[ts.vulnerabilityBadgeText, { color: colors.color }]}>
                        {marker.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={[ts.summaryText, { color: T.text }]}>No explicit vulnerability markers recorded.</Text>
            )}
            {currentAssessment.vulnerabilityNotes ? (
              <Text style={[ts.summaryText, { color: T.text }]}>{currentAssessment.vulnerabilityNotes}</Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card title="Finalize Triage">
        <InlineActions>
          <ActionButton label="Accept System Triage" onPress={acceptSystem} variant="secondary" />
        </InlineActions>
        <ChoiceChips label="Override Level" options={triageLevelOptions} value={overrideLevel} onChange={setOverrideLevel} />
        <InputField label="Override Reason" value={overrideReason} onChangeText={setOverrideReason} multiline />
        <InlineActions>
          <ActionButton label="Override Triage" onPress={overrideTriage} variant="danger" />
          <ActionButton label="Load Summary" onPress={loadSummary} variant="ghost" />
        </InlineActions>
        {summary ? (
          <View style={[ts.summaryBox, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
            <Text style={[ts.summaryLabel, { color: T.textMuted }]}>Clinical Summary</Text>
            <Text style={[ts.summaryText, { color: T.text }]}>{summary}</Text>
          </View>
        ) : null}

        <InputField label="Physical Exam (optional, for AI suggestions)" value={physicalExam} onChangeText={setPhysicalExam} multiline />
        <InlineActions>
          <ActionButton label="Load Outcome + Suggestions" onPress={loadOutcome} />
        </InlineActions>

        <InputField label="Assigned Physician Name (optional)" value={handoffClinician} onChangeText={setHandoffClinician} />
        <InputField label="Physician Employee ID (optional)" value={handoffEmpId} onChangeText={setHandoffEmpId} />
        <InputField label="Handoff Notes (optional)" value={handoffNotes} onChangeText={setHandoffNotes} multiline />
        <InlineActions>
          <ActionButton label="Record Handoff" onPress={handoffToClinician} variant="secondary" />
        </InlineActions>

        <InlineActions>
          <ActionButton label="Send to Doctor Queue" onPress={sendToDoctorQueue} />
          {onMoveToEncounter ? (
            <ActionButton label="Proceed to Encounter" onPress={proceedToEncounter} variant="secondary" />
          ) : null}
        </InlineActions>

        {outcome ? (
          <View style={[ts.summaryBox, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
            <Text style={[ts.summaryLabel, { color: T.textMuted }]}>Outcome</Text>
            <View style={ts.outcomeGrid}>
              <View style={[ts.outcomeItem, { borderColor: T.borderLight }]}>
                <Text style={[ts.outcomeItemLabel, { color: T.textMuted }]}>Final triage</Text>
                <Text style={[ts.outcomeItemValue, { color: T.text }]}>{outcome.finalTriageLevel || "-"}</Text>
              </View>
              <View style={[ts.outcomeItem, { borderColor: T.borderLight }]}>
                <Text style={[ts.outcomeItemLabel, { color: T.textMuted }]}>Queue status</Text>
                <Text style={[ts.outcomeItemValue, { color: T.text }]}>{outcome.queueStatus || "-"}</Text>
              </View>
              <View style={[ts.outcomeItem, { borderColor: T.borderLight }]}>
                <Text style={[ts.outcomeItemLabel, { color: T.textMuted }]}>Queue position</Text>
                <Text style={[ts.outcomeItemValue, { color: T.text }]}>{String(outcome.queuePosition ?? "-")}</Text>
              </View>
              <View style={[ts.outcomeItem, { borderColor: T.borderLight }]}>
                <Text style={[ts.outcomeItemLabel, { color: T.textMuted }]}>Expected wait</Text>
                <Text style={[ts.outcomeItemValue, { color: T.text }]}>{`${outcome.waitTimeMinutes ?? 0} min`}</Text>
              </View>
            </View>

            {outcome.triageSummary ? (
              <Text style={[ts.summaryText, { color: T.text }]}>{outcome.triageSummary}</Text>
            ) : null}
            {outcome.suggestedPrimaryDiagnosis ? (
              <Text style={[ts.summaryMeta, { color: T.textMid }]}>
                Primary diagnosis: {outcome.suggestedPrimaryDiagnosis}
              </Text>
            ) : null}
            {outcome.suggestedDiagnoses?.length ? (
              <Text style={[ts.summaryMeta, { color: T.textMid }]}>
                Other suggestions: {outcome.suggestedDiagnoses.join(", ")}
              </Text>
            ) : null}
            {currentAssessment ? (
              <>
                <Text style={[ts.summaryMeta, { color: T.textMid }]}>
                  Pregnancy status: {formatChoiceLabel(currentAssessment.pregnancyStatus || pregnancyStatus)}
                </Text>
                {recordedVulnerabilityMarkers.length > 0 ? (
                  <View style={ts.vulnerabilityBadgeWrap}>
                    {recordedVulnerabilityMarkers.map(marker => {
                      const colors = getVulnerabilityBadgeColors(marker.tone);
                      return (
                        <View
                          key={`outcome-${marker.key}`}
                          style={[
                            ts.vulnerabilityBadge,
                            {
                              backgroundColor: colors.backgroundColor,
                              borderColor: colors.borderColor,
                            },
                          ]}
                        >
                          <Text style={[ts.vulnerabilityBadgeText, { color: colors.color }]}>
                            {marker.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const ts = StyleSheet.create({
  headerRow: { gap: 10, marginBottom: 4 },
  backBtn: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  backBtnText: { fontSize: 13, fontWeight: "600" },
  patientBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  patientName: { fontSize: 16, fontWeight: "800" },
  patientSub: { fontSize: 12, marginTop: 2 },
  triagePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  queueRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  queueRowNum: { fontSize: 14, fontWeight: "800", width: 55 },
  queueRowName: { fontSize: 13, fontWeight: "700" },
  queueRowComplaint: { fontSize: 11 },
  queueRowMeta: { fontSize: 11, fontWeight: "600" },
  rowAction: { fontSize: 12, fontWeight: "700" },
  summaryBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, marginTop: 10 },
  summaryLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  summaryText: { fontSize: 13, lineHeight: 20 },
  summaryMeta: { fontSize: 12, lineHeight: 18 },
  vulnerabilityChoiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  vulnerabilityChoiceChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  vulnerabilityChoiceText: { fontSize: 12, fontWeight: "600" },
  vulnerabilityBadgeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  vulnerabilityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  vulnerabilityBadgeText: { fontSize: 10, fontWeight: "700" },
  outcomeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  outcomeItem: { borderWidth: 1, borderRadius: 10, padding: 10, minWidth: 120, gap: 2 },
  outcomeItemLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  outcomeItemValue: { fontSize: 14, fontWeight: "800" },
});
