import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { patientApi, queueApi, triageApi } from "../../api/services";
import type {
  PatientResponse,
  PregnancyStatus,
  PregnancyTestStatus,
  QueueTicket,
  TriageAssessment,
  TriageOutcomeResult,
  VulnerabilityIndicator,
} from "../../api/types";
import {
  consciousnessOptions,
  pregnancyStatusOptions,
  pregnancyTestStatusOptions,
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

type MeasurementSystem = "METRIC" | "IMPERIAL";
type TriageSection = "queue" | "assessment" | "disposition";
type TriageKey = keyof typeof triagePalette;

const TRIAGE_SECTIONS: ReadonlyArray<TriageSection> = ["queue", "assessment", "disposition"];

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

function normalizeDateInput(value?: string | null) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function formatTime(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatStatus(status?: string | null) {
  const normalized = (status || "").replace(/_/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatChoiceLabel(value?: string | null) {
  const normalized = (value || "").replace(/_/g, " ").trim();
  if (!normalized) return "Not recorded";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function convertNumericString(value: string, convert: (input: number) => number, decimals = 1) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return value;
  return String(Number(convert(numeric).toFixed(decimals)));
}

function convertVitalsBetweenSystems(values: VitalsForm, from: MeasurementSystem, to: MeasurementSystem): VitalsForm {
  if (from === to) return values;
  const metricToImperial = from === "METRIC" && to === "IMPERIAL";

  return {
    ...values,
    temperatureCelsius: convertNumericString(
      values.temperatureCelsius,
      metricToImperial ? (input) => (input * 9) / 5 + 32 : (input) => ((input - 32) * 5) / 9
    ),
    weightKg: convertNumericString(
      values.weightKg,
      metricToImperial ? (input) => input * 2.20462 : (input) => input / 2.20462
    ),
    heightCm: convertNumericString(
      values.heightCm,
      metricToImperial ? (input) => input / 2.54 : (input) => input * 2.54
    ),
    bloodGlucoseMmol: convertNumericString(
      values.bloodGlucoseMmol,
      metricToImperial ? (input) => input * 18 : (input) => input / 18,
      metricToImperial ? 0 : 1
    ),
  };
}

function splitObservationNotes(notes?: string | null) {
  const lines = (notes || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const state = {
    nursingNotes: [] as string[],
    symptomOnset: "",
    symptomDuration: "",
    painLocation: "",
    additionalSymptoms: "",
    exposure: "",
  };

  lines.forEach((line) => {
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

function calculateBmi(weightKg?: number, heightCm?: number) {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const heightMeters = heightCm / 100;
  if (heightMeters <= 0) return null;
  return Number((weightKg / (heightMeters * heightMeters)).toFixed(1));
}

function isEmergentLevel(level?: string | null) {
  const normalized = (level || "").toUpperCase();
  return normalized === "RED" || normalized === "ORANGE";
}

function hasCompletedPregnancyTest(status: PregnancyTestStatus) {
  return status === "NEGATIVE" || status === "POSITIVE" || status === "NOT_APPLICABLE";
}

function isPregnancyHoldActive(ticket?: QueueTicket | null) {
  if (!ticket) return false;
  if (ticket.waitingForPregnancyTest) return true;
  if ((ticket.ancillaryStepCode || "").toUpperCase() === "PREGNANCY_TEST") return true;
  return ticket.ancillaryHold === true && /pregnancy/i.test(`${ticket.ancillaryHoldReason || ""} ${ticket.ancillaryStepLabel || ""}`);
}

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
  const [activePatient, setActivePatient] = useState<PatientResponse | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [vitals, setVitals] = useState<VitalsForm>(defaultVitals);
  const [redFlags, setRedFlags] = useState<RedFlagsForm>(defaultRedFlags);
  const [manualRedFlag, setManualRedFlag] = useState(false);
  const [manualRedFlagReason, setManualRedFlagReason] = useState("");
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
  const [pregnancyTestStatus, setPregnancyTestStatus] = useState<PregnancyTestStatus>("UNKNOWN");
  const [lastMenstrualPeriodDate, setLastMenstrualPeriodDate] = useState("");
  const [remembersLastMenstrualPeriod, setRemembersLastMenstrualPeriod] = useState(true);
  const [fetalHealthCheckRequired, setFetalHealthCheckRequired] = useState(false);
  const [fetalHealthNotes, setFetalHealthNotes] = useState("");
  const [vulnerabilityIndicators, setVulnerabilityIndicators] = useState<VulnerabilityIndicator[]>([]);
  const [vulnerabilityNotes, setVulnerabilityNotes] = useState("");
  const [overrideLevel, setOverrideLevel] = useState("ORANGE");
  const [overrideReason, setOverrideReason] = useState("");
  const [physicalExam, setPhysicalExam] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TriageOutcomeResult | null>(null);
  const [currentAssessment, setCurrentAssessment] = useState<TriageAssessment | null>(null);
  const [section, setSection] = useState<TriageSection>(
    initialQueueTicketId || initialAssessmentId ? "assessment" : "queue"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [measurementSystem, setMeasurementSystem] = useState<MeasurementSystem>("METRIC");
  const [handoffClinician, setHandoffClinician] = useState("");
  const [handoffEmpId, setHandoffEmpId] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");

  const ok = useCallback((text: string) => {
    setMessage(text);
    setTone("success");
  }, []);

  const err = useCallback((error: unknown) => {
    setMessage(toErrorMessage(error));
    setTone("error");
  }, []);

  const resetTicketForm = useCallback((ticket?: QueueTicket | null, patient?: PatientResponse | null) => {
    const female = (patient?.sex || "").toUpperCase() === "FEMALE";
    setAssessmentId("");
    setChiefComplaint(ticket?.initialComplaint || "");
    setVitals(defaultVitals);
    setRedFlags(defaultRedFlags);
    setManualRedFlag(false);
    setManualRedFlagReason("");
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
    setPregnancyStatus(female ? "UNKNOWN" : "NOT_APPLICABLE");
    setPregnancyTestStatus(female ? "UNKNOWN" : "NOT_APPLICABLE");
    setLastMenstrualPeriodDate("");
    setRemembersLastMenstrualPeriod(female);
    setFetalHealthCheckRequired(false);
    setFetalHealthNotes("");
    setVulnerabilityIndicators([]);
    setVulnerabilityNotes("");
    setOverrideLevel("ORANGE");
    setOverrideReason("");
    setPhysicalExam("");
    setSummary(null);
    setOutcome(null);
    setCurrentAssessment(null);
    setHandoffClinician("");
    setHandoffEmpId("");
    setHandoffNotes("");
  }, []);

  const clearWorkspaceSelection = useCallback(() => {
    setQueueTicketId("");
    setAssessmentId("");
    setActiveTicket(null);
    setActivePatient(null);
    resetTicketForm();
    setSection("queue");
  }, [resetTicketForm]);

  const hydrateAssessment = useCallback((assessment: TriageAssessment, patient?: PatientResponse | null) => {
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
    const female = ((patient?.sex || assessment.patientSex || "").toUpperCase() === "FEMALE");

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
    setManualRedFlag(!!assessment.manualRedFlag);
    setManualRedFlagReason(assessment.manualRedFlagReason || "");
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
    setPregnancyStatus(
      (assessment.pregnancyStatus as PregnancyStatus | null)
      || (female ? "UNKNOWN" : "NOT_APPLICABLE")
    );
    setPregnancyTestStatus(
      (assessment.pregnancyTestStatus as PregnancyTestStatus | null)
      || (female ? "UNKNOWN" : "NOT_APPLICABLE")
    );
    setLastMenstrualPeriodDate(normalizeDateInput(assessment.lastMenstrualPeriodDate));
    setRemembersLastMenstrualPeriod(
      assessment.remembersLastMenstrualPeriod
      ?? Boolean(normalizeDateInput(assessment.lastMenstrualPeriodDate))
    );
    setFetalHealthCheckRequired(!!assessment.fetalHealthCheckRequired);
    setFetalHealthNotes(assessment.fetalHealthNotes || "");
    setVulnerabilityIndicators((assessment.vulnerabilityIndicators || []) as VulnerabilityIndicator[]);
    setVulnerabilityNotes(assessment.vulnerabilityNotes || "");
    setOverrideLevel(assessment.finalTriageLevel || assessment.systemTriageLevel || "ORANGE");
    setOverrideReason(assessment.overrideReason || "");
    setCurrentAssessment(assessment);
  }, [measurementSystem]);

  const refreshWorkspace = useCallback(async (quiet = false) => {
    if (!apiContext) return;

    try {
      const [waitingRows, todayRows] = await Promise.all([
        queueApi.getQueue(apiContext!, "triage"),
        queueApi.getQueue(apiContext!, "today"),
      ]);
      const activeRows = todayRows.filter(
        (ticket) => !ticket.triaged && ["CALLED", "IN_PROGRESS"].includes((ticket.status || "").toUpperCase())
      );
      setTriageRows(waitingRows);
      setActiveTriageRows(activeRows);

      if (!quiet) {
        ok(`Showing ${waitingRows.length} waiting and ${activeRows.length} active triage patient(s)`);
      }
    } catch (error) {
      err(error);
    }
  }, [apiContext, err, ok]);

  const loadTicketWorkspace = useCallback(async (ticketIdValue: string, fallbackTicket?: QueueTicket, quiet = false) => {
    if (!apiContext) return;

    const id = ticketIdValue.trim();
    if (!id) {
      err(new Error("Select a queue ticket first"));
      return;
    }

    try {
      const ticket = fallbackTicket ? fallbackTicket : await queueApi.getTicket(apiContext!, id);
      const [assessment, patient] = await Promise.all([
        triageApi.getAssessmentForTicket(apiContext!, ticket.id).catch((error) => {
          if (isApiStatus(error, 404)) return null;
          throw error;
        }),
        ticket.patientId
          ? patientApi.getById(apiContext!, ticket.patientId).catch(() => null)
          : Promise.resolve(null),
      ]);

      setQueueTicketId(ticket.id);
      setActiveTicket(ticket);
      setActivePatient(patient);
      setSummary(null);
      setOutcome(null);
      setHandoffClinician("");
      setHandoffEmpId("");
      setHandoffNotes("");
      setSection("assessment");

      if (assessment) {
        hydrateAssessment(assessment, patient);
        onAssessmentLinked?.({ queueTicketId: ticket.id, assessmentId: assessment.id });
      } else {
        resetTicketForm(ticket, patient);
      }

      if (!quiet) {
        const ref = ticket.workflowNumber || ticket.ticketNumber || ticket.id.slice(0, 8);
        ok(assessment ? `Resumed ${ref} from live triage data` : `Opened ${ref} in triage`);
      }
    } catch (error) {
      err(error);
    }
  }, [apiContext, err, hydrateAssessment, ok, onAssessmentLinked, resetTicketForm]);

  const loadAssessmentWorkspace = useCallback(async (assessmentIdValue: string, quiet = false) => {
    if (!apiContext) return;

    const id = assessmentIdValue.trim();
    if (!id) {
      err(new Error("Open or begin an assessment first"));
      return;
    }

    try {
      const assessment = await triageApi.getAssessment(apiContext!, id);
      const ticket = await queueApi.getTicket(apiContext!, assessment.queueTicketId);
      const patient = assessment.patientId
        ? await patientApi.getById(apiContext!, assessment.patientId).catch(() => null)
        : null;

      setQueueTicketId(ticket.id);
      setActiveTicket(ticket);
      setActivePatient(patient);
      setSummary(null);
      setOutcome(null);
      setHandoffClinician("");
      setHandoffEmpId("");
      setHandoffNotes("");
      setSection("assessment");
      hydrateAssessment(assessment, patient);
      onAssessmentLinked?.({ queueTicketId: ticket.id, assessmentId: assessment.id });

      if (!quiet) {
        const ref = ticket.workflowNumber || ticket.ticketNumber || ticket.id.slice(0, 8);
        ok(`Restored ${ref} assessment from live data`);
      }
    } catch (error) {
      err(error);
    }
  }, [apiContext, err, hydrateAssessment, ok, onAssessmentLinked]);

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

  useEffect(() => {
    if (pregnancyStatus !== "PREGNANT") {
      setFetalHealthCheckRequired(false);
      setFetalHealthNotes("");
    }
  }, [pregnancyStatus]);

  const metricVitals = useMemo(
    () => measurementSystem === "IMPERIAL"
      ? convertVitalsBetweenSystems(vitals, "IMPERIAL", "METRIC")
      : vitals,
    [measurementSystem, vitals]
  );

  const liveBmi = useMemo(
    () => calculateBmi(parseNum(metricVitals.weightKg), parseNum(metricVitals.heightCm)),
    [metricVitals]
  );

  const savedBmi = currentAssessment?.bmi ?? null;
  const showPregnancySection = ((activePatient?.sex || currentAssessment?.patientSex || "").toUpperCase() === "FEMALE");
  const lmpUnknown = showPregnancySection && (!remembersLastMenstrualPeriod || !lastMenstrualPeriodDate.trim());
  const effectiveTriageLevel = outcome?.finalTriageLevel
    || currentAssessment?.finalTriageLevel
    || currentAssessment?.systemTriageLevel
    || activeTicket?.triageLevel
    || overrideLevel;
  const emergentCase = isEmergentLevel(effectiveTriageLevel) || manualRedFlag || !!currentAssessment?.manualRedFlag;
  const pregnancyHoldRecommended =
    showPregnancySection
    && lmpUnknown
    && !emergentCase
    && !hasCompletedPregnancyTest(pregnancyTestStatus);
  const pregnancyHoldActive = isPregnancyHoldActive(activeTicket);
  const recordedVulnerabilityMarkers = getVulnerabilityMarkers({
    ageYears: currentAssessment?.patientAgeYears ?? activePatient?.ageYears,
    ageInDays: currentAssessment?.patientAgeInDays ?? activePatient?.ageInDays,
    pregnancyStatus: currentAssessment?.pregnancyStatus || pregnancyStatus,
    isPregnant: currentAssessment?.pregnant ?? activePatient?.isPregnant,
    newborn: currentAssessment?.newborn,
    elderly: currentAssessment?.elderly,
    manualRedFlag: currentAssessment?.manualRedFlag ?? manualRedFlag,
    vulnerabilityIndicators: currentAssessment?.vulnerabilityIndicators || vulnerabilityIndicators,
  });
  const triageKey = ((activeTicket?.triageLevel || currentAssessment?.finalTriageLevel || "").toUpperCase()) as TriageKey;
  const triageColor = triagePalette[triageKey];
  const canOpenAssessment = Boolean(activeTicket);
  const canOpenDisposition = Boolean(activeTicket && assessmentId.trim());

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

  const toggleVulnerabilityIndicator = useCallback((indicator: VulnerabilityIndicator) => {
    setVulnerabilityIndicators((previous) =>
      previous.includes(indicator)
        ? previous.filter((value) => value !== indicator)
        : [...previous, indicator]
    );
  }, []);

  const renderMarkerBadges = (markers: ReturnType<typeof getVulnerabilityMarkers>) => {
    if (markers.length === 0) return null;

    return (
      <View style={styles.vulnerabilityBadgeWrap}>
        {markers.map((marker) => {
          const colors = getVulnerabilityBadgeColors(marker.tone);
          return (
            <View
              key={marker.key}
              style={[
                styles.vulnerabilityBadge,
                {
                  backgroundColor: colors.backgroundColor,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              <Text style={[styles.vulnerabilityBadgeText, { color: colors.color }]}>
                {marker.label}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const beginAssessment = async () => {
    if (!queueTicketId.trim()) {
      err(new Error("Select a patient from Queue first"));
      return;
    }

    try {
      const assessment = await triageApi.beginAssessment(apiContext!, queueTicketId.trim(), chiefComplaint);
      hydrateAssessment(assessment, activePatient);
      setSection("assessment");
      onAssessmentLinked?.({ queueTicketId: queueTicketId.trim(), assessmentId: assessment.id });
      await refreshWorkspace(true);
      ok("Assessment started");
    } catch (error) {
      err(error);
    }
  };

  const beginReassessment = async () => {
    if (!queueTicketId.trim()) {
      err(new Error("Select a patient from Queue first"));
      return;
    }

    try {
      const assessment = await triageApi.beginReassessment(apiContext!, queueTicketId.trim());
      hydrateAssessment(assessment, activePatient);
      setSection("assessment");
      onAssessmentLinked?.({ queueTicketId: queueTicketId.trim(), assessmentId: assessment.id });
      await refreshWorkspace(true);
      ok("Reassessment started");
    } catch (error) {
      err(error);
    }
  };

  const recordVitals = async () => {
    if (!assessmentId.trim()) {
      err(new Error("Begin an assessment first"));
      return;
    }

    try {
      const assessment = await triageApi.recordVitals(apiContext!, assessmentId.trim(), {
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
      hydrateAssessment(assessment, activePatient);
      ok("Vitals recorded");
    } catch (error) {
      err(error);
    }
  };

  const recordRedFlags = async () => {
    if (!assessmentId.trim()) {
      err(new Error("Begin an assessment first"));
      return;
    }
    if (manualRedFlag && !manualRedFlagReason.trim()) {
      err(new Error("Manual red flag reason is required"));
      return;
    }

    try {
      const assessment = await triageApi.recordRedFlags(apiContext!, assessmentId.trim(), {
        ...redFlags,
        manualRedFlag,
        manualRedFlagReason: manualRedFlag ? manualRedFlagReason.trim() : null,
      });
      hydrateAssessment(assessment, activePatient);
      ok("Red flags recorded");
    } catch (error) {
      err(error);
    }
  };

  const recordObservations = async () => {
    if (!assessmentId.trim()) {
      err(new Error("Begin an assessment first"));
      return;
    }
    if (manualRedFlag && !manualRedFlagReason.trim()) {
      err(new Error("Manual red flag reason is required"));
      return;
    }

    try {
      const combinedNotes = [
        nursingNotes.trim() || null,
        symptomOnset.trim() ? `Onset: ${symptomOnset.trim()}` : null,
        symptomDuration.trim() ? `Duration: ${symptomDuration.trim()}` : null,
        painLocation.trim() ? `Pain location: ${painLocation.trim()}` : null,
        additionalSymptoms.trim() ? `Additional: ${additionalSymptoms.trim()}` : null,
        exposure.trim() ? `Exposure/travel: ${exposure.trim()}` : null,
      ].filter(Boolean).join("\n");

      const assessment = await triageApi.recordObservations(apiContext!, assessmentId.trim(), {
        historyOfPresentIllness: hpi || null,
        allergies: allergies || null,
        currentMedications: medications || null,
        pastMedicalHistory: pastHistory || null,
        nursingNotes: combinedNotes || null,
        pregnancyStatus: showPregnancySection ? pregnancyStatus : "NOT_APPLICABLE",
        lastMenstrualPeriodDate:
          showPregnancySection && remembersLastMenstrualPeriod && lastMenstrualPeriodDate.trim()
            ? normalizeDateInput(lastMenstrualPeriodDate.trim())
            : null,
        remembersLastMenstrualPeriod: showPregnancySection ? remembersLastMenstrualPeriod : null,
        pregnancyTestStatus: showPregnancySection ? pregnancyTestStatus : "NOT_APPLICABLE",
        fetalHealthCheckRequired: showPregnancySection && pregnancyStatus === "PREGNANT" ? fetalHealthCheckRequired : false,
        fetalHealthNotes:
          showPregnancySection && pregnancyStatus === "PREGNANT" && fetalHealthCheckRequired && fetalHealthNotes.trim()
            ? fetalHealthNotes.trim()
            : null,
        manualRedFlag,
        manualRedFlagReason: manualRedFlag ? manualRedFlagReason.trim() : null,
        vulnerabilityIndicators,
        vulnerabilityNotes: vulnerabilityNotes.trim() || null,
      });
      hydrateAssessment(assessment, activePatient);
      ok("Observations recorded");
    } catch (error) {
      err(error);
    }
  };

  const acceptSystem = async () => {
    if (!assessmentId.trim()) {
      err(new Error("Begin an assessment first"));
      return;
    }

    try {
      const assessment = await triageApi.acceptSystemTriage(apiContext!, assessmentId.trim());
      hydrateAssessment(assessment, activePatient);
      ok("System triage accepted");
    } catch (error) {
      err(error);
    }
  };

  const overrideTriage = async () => {
    if (!assessmentId.trim()) {
      err(new Error("Begin an assessment first"));
      return;
    }

    try {
      const assessment = await triageApi.overrideTriage(apiContext!, assessmentId.trim(), {
        newTriageLevel: overrideLevel,
        reason: overrideReason,
      });
      hydrateAssessment(assessment, activePatient);
      ok("Triage overridden");
    } catch (error) {
      err(error);
    }
  };

  const loadSummary = async () => {
    if (!assessmentId.trim()) {
      err(new Error("Begin an assessment first"));
      return;
    }

    try {
      const response = await triageApi.getSummary(apiContext!, assessmentId.trim());
      setSummary(response.summary);
      ok("Clinical summary ready");
    } catch (error) {
      err(error);
    }
  };

  const loadOutcome = async () => {
    if (!assessmentId.trim()) {
      err(new Error("Begin an assessment first"));
      return;
    }

    try {
      const response = await triageApi.getOutcome(apiContext!, assessmentId.trim(), physicalExam || undefined);
      setOutcome(response);
      setSection("disposition");
      ok("Disposition ready");
    } catch (error) {
      err(error);
    }
  };

  const holdForPregnancyTest = async () => {
    if (!queueTicketId.trim()) {
      err(new Error("Select a queue ticket first"));
      return;
    }

    try {
      const held = await queueApi.holdForPregnancyTest(apiContext!, queueTicketId.trim(), {
        assessmentId: assessmentId.trim() || null,
        reason: "Waiting for pregnancy test",
        notes: lmpUnknown
          ? "LMP unknown before clinician review."
          : "Pregnancy test required before clinician review.",
      });
      setActiveTicket(held);
      await refreshWorkspace(true);
      clearWorkspaceSelection();
      ok("Patient returned to waiting area for pregnancy test");
    } catch (error) {
      err(error);
    }
  };

  const resumePregnancyTestHold = async () => {
    if (!queueTicketId.trim()) {
      err(new Error("Select a queue ticket first"));
      return;
    }

    try {
      const resumed = await queueApi.resumeAncillaryHold(apiContext!, queueTicketId.trim(), {
        ancillaryStepCode: "PREGNANCY_TEST",
        notes: "Pregnancy test review complete",
      });
      setActiveTicket(resumed);
      ok("Pregnancy-test hold cleared. You can now place the patient in doctor queue.");
      await refreshWorkspace(true);
    } catch (error) {
      err(error);
    }
  };

  const sendToDoctorQueue = async (path: "clinician" | "pregnancy_test" = "clinician") => {
    if (path === "pregnancy_test") {
      await holdForPregnancyTest();
      return;
    }

    try {
      const id = queueTicketId.trim();
      if (!id) throw new Error("Select a queue ticket first");

      if (pregnancyHoldActive) {
        await queueApi.resumeAncillaryHold(apiContext!, id, {
          ancillaryStepCode: "PREGNANCY_TEST",
          notes: "Pregnancy test cleared before clinician queue",
        }).catch(() => undefined);
      }

      try {
        await queueApi.startTicket(apiContext!, id);
      } catch {
      }

      let moved: QueueTicket | null = null;
      try {
        moved = await queueApi.returnToWaiting(apiContext!, id);
      } catch {
        const consultationQueue = await queueApi.getQueue(apiContext!, "consultation");
        moved = consultationQueue.find((ticket) => ticket.id === id) || null;
        if (!moved) {
          throw new Error("Patient not yet eligible for doctor queue. Complete triage first.");
        }
      }

      await refreshWorkspace(true);
      clearWorkspaceSelection();

      const displayId = moved.workflowNumber || moved.ticketNumber || id.slice(0, 8);
      const patientNumberSuffix = moved.patientNumber && moved.patientNumber !== moved.ticketNumber
        ? ` | Patient # ${moved.patientNumber}`
        : "";
      const messageText = moved.appointmentId
        ? `Placed in doctor queue - ${displayId}${patientNumberSuffix} | Appointment at ${formatTime(moved.appointmentScheduledAt)}${moved.assignedClinicianName ? ` | ${moved.assignedClinicianName}` : ""}`
        : `Placed in doctor queue - ${displayId}${patientNumberSuffix} (FIFO order)`;
      ok(messageText);
    } catch (error) {
      err(error);
    }
  };

  const returnToWaitingRoom = async () => {
    if (!queueTicketId.trim()) {
      err(new Error("Select a queue ticket first"));
      return;
    }

    try {
      await queueApi.returnToWaiting(apiContext!, queueTicketId.trim());
      await refreshWorkspace(true);
      clearWorkspaceSelection();
      ok("Patient returned to the waiting room");
    } catch (error) {
      err(error);
    }
  };

  const handoffToClinician = async () => {
    if (!queueTicketId.trim()) {
      err(new Error("Select a queue ticket first"));
      return;
    }

    try {
      await queueApi.handoffToClinician(apiContext!, queueTicketId.trim(), {
        clinicianName: handoffClinician.trim(),
        clinicianEmployeeId: handoffEmpId.trim(),
        clinicianUserId: null,
        handoffNotes: handoffNotes.trim() || null,
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

  if (!apiContext) {
    return <Card title="Triage"><MessageBanner message="No authenticated session." tone="error" /></Card>;
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 14 }}>
      <Card title="Triage">
        <View style={styles.headerRow}>
          {onBack ? (
            <Pressable onPress={onBack} style={[styles.backBtn, { borderColor: T.border }]}>
              <Text style={[styles.backBtnText, { color: T.teal }]}>Back to Queue</Text>
            </Pressable>
          ) : null}
          {activeTicket ? (
            <View style={[styles.patientBanner, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.patientName, { color: T.text }]}>
                  {activeTicket.patientName || activePatient?.fullName || activeTicket.patientId || "Patient"}
                </Text>
                <Text style={[styles.patientSub, { color: T.textMuted }]}>
                  {activeTicket.workflowNumber || activeTicket.ticketNumber || activeTicket.id.slice(0, 8)}
                  {activeTicket.patientNumber && activeTicket.patientNumber !== activeTicket.ticketNumber
                    ? ` | Patient # ${activeTicket.patientNumber}`
                    : ""}
                  {activeTicket.appointmentId
                    ? ` | Appointment ${formatTime(activeTicket.appointmentScheduledAt)}`
                    : " | Walk-in"}
                  {activeTicket.status ? ` | ${formatStatus(activeTicket.status)}` : ""}
                </Text>
                {renderMarkerBadges(recordedVulnerabilityMarkers)}
              </View>
              {triageColor ? (
                <View
                  style={[
                    styles.triagePill,
                    {
                      backgroundColor: T.scheme === "dark" ? triageColor.bgDark : triageColor.bgLight,
                      borderColor: triageColor.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "800",
                      color: T.scheme === "dark" ? triageColor.textDark : triageColor.textLight,
                    }}
                  >
                    {triageColor.label}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.sectionTabs}>
          {TRIAGE_SECTIONS.map((entry) => {
            const enabled = entry === "queue"
              ? true
              : entry === "assessment"
                ? canOpenAssessment
                : canOpenDisposition;
            const active = section === entry;

            return (
              <Pressable
                key={entry}
                onPress={() => {
                  if (enabled) setSection(entry);
                }}
                style={[
                  styles.sectionTab,
                  {
                    borderColor: active ? T.teal : T.border,
                    backgroundColor: active ? T.teal : T.surfaceAlt as string,
                    opacity: enabled ? 1 : 0.45,
                  },
                ]}
              >
                <Text style={[styles.sectionTabText, { color: active ? "#fff" : T.textMid }]}>
                  {entry === "queue" ? "Queue" : entry === "assessment" ? "Assessment" : "Disposition"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <InlineActions>
          {section !== "queue" ? (
            <ActionButton label="Patient Queue" onPress={() => setSection("queue")} variant="secondary" />
          ) : null}
          {section === "assessment" && canOpenDisposition ? (
            <ActionButton label="Disposition" onPress={() => setSection("disposition")} variant="secondary" />
          ) : null}
          {section === "disposition" ? (
            <ActionButton label="Assessment" onPress={() => setSection("assessment")} variant="secondary" />
          ) : null}
          <ActionButton label="Refresh Queue" onPress={() => void refreshWorkspace()} variant="ghost" />
        </InlineActions>

        {section !== "queue" && !activeTicket ? (
          <MessageBanner message="Choose a patient from Queue to open the assessment form." tone="info" />
        ) : null}

        <MessageBanner message={message} tone={tone} />
      </Card>

      {section === "queue" ? (
        <Card title="Patient Queue">
          {activeTriageRows.length > 0 ? (
            <View style={{ gap: 6, marginBottom: 10 }}>
              <Text style={[styles.sectionLabel, { color: T.textMuted }]}>Active Triage Sessions</Text>
              {activeTriageRows.map((ticket) => (
                <Pressable
                  key={ticket.id}
                  onPress={() => void loadTicketWorkspace(ticket.id, ticket)}
                  style={[
                    styles.queueRow,
                    {
                      backgroundColor: queueTicketId === ticket.id ? T.teal + "22" : T.surfaceAlt as string,
                      borderColor: queueTicketId === ticket.id ? T.teal : T.border,
                    },
                  ]}
                >
                  <Text style={[styles.queueRowNum, { color: T.teal }]}>
                    {ticket.workflowNumber || ticket.ticketNumber || "-"}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.queueRowName, { color: T.text }]}>
                      {ticket.patientName || ticket.patientId || "Patient"}
                    </Text>
                    <Text style={[styles.queueRowComplaint, { color: T.textMuted }]} numberOfLines={1}>
                      {formatStatus(ticket.status)}
                      {ticket.counterNumber ? ` | ${ticket.counterNumber}` : ""}
                    </Text>
                  </View>
                  <Text style={[styles.rowAction, { color: T.text }]}>
                    {queueTicketId === ticket.id ? "Active" : "Open"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={[styles.sectionLabel, { color: T.textMuted }]}>Patients Waiting For Triage</Text>
          {triageRows.length > 0 ? (
            <View style={{ gap: 6 }}>
              {triageRows.map((ticket) => (
                <Pressable
                  key={ticket.id}
                  onPress={() => void loadTicketWorkspace(ticket.id, ticket)}
                  style={[
                    styles.queueRow,
                    {
                      backgroundColor: queueTicketId === ticket.id ? T.teal + "22" : T.surfaceAlt as string,
                      borderColor: queueTicketId === ticket.id ? T.teal : T.border,
                    },
                  ]}
                >
                  <Text style={[styles.queueRowNum, { color: T.teal }]}>
                    {ticket.workflowNumber || ticket.ticketNumber || "-"}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.queueRowName, { color: T.text }]}>
                      {ticket.patientName || ticket.patientId || "Patient"}
                    </Text>
                    {ticket.initialComplaint ? (
                      <Text style={[styles.queueRowComplaint, { color: T.textMuted }]} numberOfLines={1}>
                        {ticket.initialComplaint}
                      </Text>
                    ) : null}
                    {ticket.appointmentId ? (
                      <Text style={[styles.queueRowMeta, { color: T.textMuted }]}>
                        Scheduled visit {formatTime(ticket.appointmentScheduledAt)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.rowAction, { color: T.text }]}>
                    {queueTicketId === ticket.id ? "Active" : "Open"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <MessageBanner
              message={
                activeTriageRows.length > 0
                  ? "No new patients are waiting. Resume one of the active triage sessions above."
                  : "No patients waiting in triage queue."
              }
              tone="info"
            />
          )}
        </Card>
      ) : null}

      {section === "assessment" ? (
        <>
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
                setVitals((previous) => convertVitalsBetweenSystems(previous, measurementSystem, nextSystem));
                setMeasurementSystem(nextSystem);
              }}
            />
            <MessageBanner
              message={
                measurementSystem === "METRIC"
                  ? "Measurements are being entered in metric and saved to the chart as metric."
                  : "Measurements are being entered in imperial and converted back to metric when saved."
              }
              tone="info"
            />
            {vitalFieldLabels.map(([label, key]) => (
              <InputField
                key={key}
                label={label}
                value={vitals[key]}
                onChangeText={(value) => setVitals((previous) => ({ ...previous, [key]: value }))}
              />
            ))}
            <ChoiceChips
              label="Consciousness Level"
              options={consciousnessOptions}
              value={vitals.consciousnessLevel}
              onChange={(value) => setVitals((previous) => ({ ...previous, consciousnessLevel: value }))}
            />
            <View style={styles.metricsRow}>
              <View style={[styles.metricTile, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
                <Text style={[styles.metricLabel, { color: T.textMuted }]}>Live BMI</Text>
                <Text style={[styles.metricValue, { color: T.text }]}>
                  {liveBmi != null ? liveBmi.toFixed(1) : "-"}
                </Text>
              </View>
              <View style={[styles.metricTile, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
                <Text style={[styles.metricLabel, { color: T.textMuted }]}>Saved BMI</Text>
                <Text style={[styles.metricValue, { color: T.text }]}>
                  {savedBmi != null ? savedBmi.toFixed(1) : "-"}
                </Text>
              </View>
            </View>
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
                onChange={(value) => setRedFlags((previous) => ({ ...previous, [key]: value }))}
              />
            ))}
            <ToggleField label="Manual Red Flag" value={manualRedFlag} onChange={setManualRedFlag} />
            {manualRedFlag ? (
              <InputField
                label="Manual Red Flag Reason"
                value={manualRedFlagReason}
                onChangeText={setManualRedFlagReason}
                multiline
                placeholder="Explain why this needs urgent clinician attention"
              />
            ) : null}
            <InlineActions>
              <ActionButton label="Save Red Flags" onPress={recordRedFlags} variant="secondary" />
            </InlineActions>
          </Card>

          <Card title="Vulnerability">
            <View style={{ gap: 6 }}>
              <Text style={[styles.sectionLabel, { color: T.textMuted }]}>Vulnerability Indicators</Text>
              <View style={styles.vulnerabilityChoiceWrap}>
                {vulnerabilityIndicatorOptions.map((option) => {
                  const selected = vulnerabilityIndicators.includes(option);
                  return (
                    <Pressable
                      key={option}
                      onPress={() => toggleVulnerabilityIndicator(option)}
                      style={[
                        styles.vulnerabilityChoiceChip,
                        {
                          borderColor: selected ? T.teal : T.border,
                          backgroundColor: selected ? T.teal : T.surfaceAlt as string,
                        },
                      ]}
                    >
                      <Text style={[styles.vulnerabilityChoiceText, { color: selected ? "#fff" : T.textMid }]}>
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
            {currentAssessment ? (
              <View style={[styles.summaryBox, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
                <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Recorded Vulnerability Summary</Text>
                {renderMarkerBadges(recordedVulnerabilityMarkers)}
                {currentAssessment.vulnerabilityNotes ? (
                  <Text style={[styles.summaryText, { color: T.text }]}>{currentAssessment.vulnerabilityNotes}</Text>
                ) : (
                  <Text style={[styles.summaryText, { color: T.text }]}>No explicit vulnerability notes recorded.</Text>
                )}
              </View>
            ) : null}
          </Card>

          {showPregnancySection ? (
            <Card title="Pregnancy Screening">
              <ChoiceChips
                label="Pregnancy Status"
                options={pregnancyStatusOptions}
                value={pregnancyStatus}
                onChange={(value) => setPregnancyStatus(value as PregnancyStatus)}
              />
              <ToggleField
                label="Patient Remembers Last Menstrual Period"
                value={remembersLastMenstrualPeriod}
                onChange={(value) => {
                  setRemembersLastMenstrualPeriod(value);
                  if (!value) setLastMenstrualPeriodDate("");
                }}
              />
              {remembersLastMenstrualPeriod ? (
                <InputField
                  label="Last Menstrual Period Date"
                  value={lastMenstrualPeriodDate}
                  onChangeText={setLastMenstrualPeriodDate}
                  placeholder="YYYY-MM-DD"
                />
              ) : (
                <MessageBanner
                  message="LMP is currently unknown. If the case is not emergent, hold the patient for pregnancy test before clinician review."
                  tone="info"
                />
              )}
              <ChoiceChips
                label="Pregnancy Test Status"
                options={pregnancyTestStatusOptions}
                value={pregnancyTestStatus}
                onChange={(value) => setPregnancyTestStatus(value as PregnancyTestStatus)}
              />
              {pregnancyStatus === "PREGNANT" ? (
                <>
                  <ToggleField
                    label="Fetal Health Check Required"
                    value={fetalHealthCheckRequired}
                    onChange={setFetalHealthCheckRequired}
                  />
                  {fetalHealthCheckRequired ? (
                    <InputField
                      label="Fetal Health Notes"
                      value={fetalHealthNotes}
                      onChangeText={setFetalHealthNotes}
                      multiline
                      placeholder="Document fetal concerns or required monitoring"
                    />
                  ) : null}
                </>
              ) : null}
            </Card>
          ) : null}

          <Card title="Clinical Observations">
            <InputField label="History of Present Illness" value={hpi} onChangeText={setHpi} multiline />
            <InputField label="Symptom Onset" value={symptomOnset} onChangeText={setSymptomOnset} placeholder="When did symptoms start?" />
            <InputField label="Symptom Duration" value={symptomDuration} onChangeText={setSymptomDuration} placeholder="How long?" />
            <InputField label="Pain Location / Severity" value={painLocation} onChangeText={setPainLocation} placeholder="Location and 0-10 scale" />
            <InputField label="Additional Symptoms" value={additionalSymptoms} onChangeText={setAdditionalSymptoms} multiline placeholder="Cough, nausea, dizziness" />
            <InputField label="Exposure / Travel / Infection Risk" value={exposure} onChangeText={setExposure} multiline />
            <InputField label="Allergies" value={allergies} onChangeText={setAllergies} />
            <InputField label="Current Medications" value={medications} onChangeText={setMedications} multiline />
            <InputField label="Past Medical History" value={pastHistory} onChangeText={setPastHistory} multiline />
            <InputField label="Nursing Notes" value={nursingNotes} onChangeText={setNursingNotes} multiline />
            <InlineActions>
              <ActionButton label="Save Observations" onPress={recordObservations} />
            </InlineActions>
          </Card>
        </>
      ) : null}

      {section === "disposition" ? (
        <Card title="Disposition">
          <InlineActions>
            <ActionButton label="Accept System Triage" onPress={acceptSystem} variant="secondary" />
          </InlineActions>
          <ChoiceChips label="Override Level" options={triageLevelOptions} value={overrideLevel} onChange={setOverrideLevel} />
          <InputField label="Override Reason" value={overrideReason} onChangeText={setOverrideReason} multiline />
          <InlineActions>
            <ActionButton label="Override Triage" onPress={overrideTriage} variant="danger" />
            <ActionButton label="Clinical Summary" onPress={loadSummary} variant="ghost" />
          </InlineActions>
          {summary ? (
            <View style={[styles.summaryBox, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
              <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Clinical Summary</Text>
              <Text style={[styles.summaryText, { color: T.text }]}>{summary}</Text>
            </View>
          ) : null}

          <InputField label="Physical Exam (optional, for AI suggestions)" value={physicalExam} onChangeText={setPhysicalExam} multiline />
          <InlineActions>
            <ActionButton label="Review Outcome + Suggestions" onPress={loadOutcome} />
          </InlineActions>

          {pregnancyHoldRecommended ? (
            <MessageBanner
              message="LMP is unknown and this case is not emergent. Hold the patient in waiting for pregnancy test before clinician queue."
              tone="info"
            />
          ) : null}
          {pregnancyHoldActive ? (
            <MessageBanner
              message="This patient is currently on ancillary hold for pregnancy test."
              tone="info"
            />
          ) : null}

          <InputField label="Assigned Physician Name (optional)" value={handoffClinician} onChangeText={setHandoffClinician} />
          <InputField label="Physician Employee ID (optional)" value={handoffEmpId} onChangeText={setHandoffEmpId} />
          <InputField label="Handoff Notes (optional)" value={handoffNotes} onChangeText={setHandoffNotes} multiline />
          <InlineActions>
            <ActionButton label="Record Handoff" onPress={handoffToClinician} variant="secondary" />
          </InlineActions>

          <InlineActions>
            {showPregnancySection ? (
              pregnancyHoldActive ? (
                <ActionButton label="Resume After Pregnancy Test" onPress={resumePregnancyTestHold} variant="secondary" />
              ) : (
                <ActionButton
                  label="Hold for Pregnancy Test"
                  onPress={() => void sendToDoctorQueue("pregnancy_test")}
                  variant="secondary"
                />
              )
            ) : null}
            <ActionButton label="Return to Waiting Room" onPress={returnToWaitingRoom} variant="ghost" />
            <ActionButton label="Place in Doctor Queue" onPress={() => void sendToDoctorQueue("clinician")} />
            {onMoveToEncounter ? (
              <ActionButton label="Proceed to Encounter" onPress={proceedToEncounter} variant="secondary" />
            ) : null}
          </InlineActions>

          {outcome ? (
            <View style={[styles.summaryBox, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
              <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Outcome</Text>
              <View style={styles.outcomeGrid}>
                <View style={[styles.outcomeItem, { borderColor: T.borderLight }]}>
                  <Text style={[styles.outcomeItemLabel, { color: T.textMuted }]}>Final triage</Text>
                  <Text style={[styles.outcomeItemValue, { color: T.text }]}>{outcome.finalTriageLevel || "-"}</Text>
                </View>
                <View style={[styles.outcomeItem, { borderColor: T.borderLight }]}>
                  <Text style={[styles.outcomeItemLabel, { color: T.textMuted }]}>Queue status</Text>
                  <Text style={[styles.outcomeItemValue, { color: T.text }]}>{outcome.queueStatus || "-"}</Text>
                </View>
                <View style={[styles.outcomeItem, { borderColor: T.borderLight }]}>
                  <Text style={[styles.outcomeItemLabel, { color: T.textMuted }]}>Queue position</Text>
                  <Text style={[styles.outcomeItemValue, { color: T.text }]}>{String(outcome.queuePosition ?? "-")}</Text>
                </View>
                <View style={[styles.outcomeItem, { borderColor: T.borderLight }]}>
                  <Text style={[styles.outcomeItemLabel, { color: T.textMuted }]}>Expected wait</Text>
                  <Text style={[styles.outcomeItemValue, { color: T.text }]}>{`${outcome.waitTimeMinutes ?? 0} min`}</Text>
                </View>
              </View>
              {outcome.triageSummary ? (
                <Text style={[styles.summaryText, { color: T.text }]}>{outcome.triageSummary}</Text>
              ) : null}
              {outcome.suggestedPrimaryDiagnosis ? (
                <Text style={[styles.summaryMeta, { color: T.textMid }]}>
                  Primary diagnosis: {outcome.suggestedPrimaryDiagnosis}
                </Text>
              ) : null}
              {outcome.suggestedDiagnoses?.length ? (
                <Text style={[styles.summaryMeta, { color: T.textMid }]}>
                  Other suggestions: {outcome.suggestedDiagnoses.join(", ")}
                </Text>
              ) : null}
              {renderMarkerBadges(recordedVulnerabilityMarkers)}
              {manualRedFlagReason ? (
                <Text style={[styles.summaryMeta, { color: T.textMid }]}>
                  Manual red flag reason: {manualRedFlagReason}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { gap: 10, marginBottom: 4 },
  backBtn: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  backBtnText: { fontSize: 13, fontWeight: "600" },
  sectionTabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4, marginBottom: 4 },
  sectionTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5 },
  sectionTabText: { fontSize: 12, fontWeight: "700" },
  patientBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  patientName: { fontSize: 16, fontWeight: "800" },
  patientSub: { fontSize: 12, marginTop: 2 },
  triagePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5, alignSelf: "flex-start" },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  queueRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  queueRowNum: { fontSize: 14, fontWeight: "800", width: 55 },
  queueRowName: { fontSize: 13, fontWeight: "700" },
  queueRowComplaint: { fontSize: 11 },
  queueRowMeta: { fontSize: 11, fontWeight: "600" },
  rowAction: { fontSize: 12, fontWeight: "700" },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricTile: { borderWidth: 1, borderRadius: 12, padding: 12, minWidth: 140, gap: 4 },
  metricLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { fontSize: 18, fontWeight: "800" },
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
