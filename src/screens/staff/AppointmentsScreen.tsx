import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { appointmentApi, patientApi } from "../../api/services";
import type { AppointmentView, PatientResponse } from "../../api/types";
import {
  ActionButton,
  Card,
  InlineActions,
  InputField,
  Label,
  MessageBanner,
  ToggleField,
  useTheme,
} from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import { formatDateOnly, formatDateTime, resolvePatientByInput } from "./patientServiceUtils";

type AppointmentSection = "book" | "upcoming" | "checkin" | "cancel" | "reassign";

const APPOINTMENT_SECTIONS: readonly AppointmentSection[] = [
  "book",
  "upcoming",
  "checkin",
  "cancel",
  "reassign",
];

const APPOINTMENT_SECTION_LABELS: Record<AppointmentSection, string> = {
  book: "Book Appointment",
  upcoming: "Upcoming Appointments",
  checkin: "Check In",
  cancel: "Cancel",
  reassign: "Reassign",
};

const DEFAULT_DURATION_MINUTES = 20;
const DEFAULT_EXISTING_DURATION_MINUTES = 30;
const DOB_PLACEHOLDER = "MM/DD/YYYY";

interface AppointmentsScreenProps {
  onQueueTicketLinked?: (ticketId: string) => void;
}

interface AppointmentSearchState {
  query: string;
  dob: string;
  time: string;
}

const defaultSearchState: AppointmentSearchState = {
  query: "",
  dob: "",
  time: "",
};

function normalizeText(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function parseDateTime(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoDateTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toISOString();
}

function toDateTimeLocalValue(value?: string | null) {
  const parsed = parseDateTime(value);
  if (!parsed) return "";
  const pad = (entry: number) => String(entry).padStart(2, "0");
  return [
    parsed.getFullYear(),
    pad(parsed.getMonth() + 1),
    pad(parsed.getDate()),
  ].join("-") + `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function formatTimeOnly(value?: string | null) {
  const parsed = parseDateTime(value);
  if (!parsed) return "-";
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDobInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isoToDobDisplay(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return "";
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}

function isoToDobLongDisplay(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function dobDisplayToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!displayMatch) {
    throw new Error(`Please enter date of birth as ${DOB_PLACEHOLDER}.`);
  }

  const [, monthValue, dayValue, yearValue] = displayMatch;
  const month = Number(monthValue);
  const day = Number(dayValue);
  const year = Number(yearValue);

  if (month < 1 || month > 12) {
    throw new Error("Month must be between 01 and 12.");
  }

  const lastDayOfMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > lastDayOfMonth) {
    throw new Error("Please enter a valid calendar date.");
  }

  return `${yearValue}-${monthValue}-${dayValue}`;
}

function tryDobToIso(value: string) {
  try {
    return dobDisplayToIso(value);
  } catch {
    return "";
  }
}

function mergeAppointments(...lists: AppointmentView[][]) {
  const merged = new Map<string, AppointmentView>();
  lists.flat().forEach((appointment) => {
    if (!appointment?.id) return;
    const previous = merged.get(appointment.id);
    merged.set(appointment.id, previous ? { ...previous, ...appointment } : appointment);
  });
  return Array.from(merged.values()).sort((left, right) => {
    const leftTime = parseDateTime(left.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightTime = parseDateTime(right.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
}

function getAppointmentWindow(appointment: AppointmentView) {
  const scheduledAt = parseDateTime(appointment.scheduledAt);
  if (!scheduledAt) {
    return { opensAt: null, closesAt: null };
  }

  const opensAt =
    parseDateTime(appointment.checkInWindowOpensAt) ||
    new Date(scheduledAt.getTime() - 15 * 60 * 1000);
  const closesAt =
    parseDateTime(appointment.checkInWindowClosesAt) ||
    new Date(scheduledAt.getTime() + 30 * 60 * 1000);

  return { opensAt, closesAt };
}

function getCheckInWindowLabel(appointment: AppointmentView) {
  const { opensAt, closesAt } = getAppointmentWindow(appointment);
  if (!opensAt || !closesAt) {
    return "Check-in window unavailable";
  }
  return `${formatTimeOnly(opensAt.toISOString())} to ${formatTimeOnly(closesAt.toISOString())}`;
}

function getCheckInState(appointment: AppointmentView) {
  const { opensAt, closesAt } = getAppointmentWindow(appointment);
  const now = new Date();
  const checkedIn = Boolean(appointment.checkedInAt || appointment.queueTicketId);

  if (checkedIn) {
    return {
      canCheckIn: false,
      missed: false,
      label: "Already checked in",
    };
  }

  if (!opensAt || !closesAt) {
    return {
      canCheckIn: Boolean(appointment.checkInEligibleNow),
      missed: false,
      label: appointment.checkInEligibleNow ? "Eligible now" : "Check-in timing unavailable",
    };
  }

  if (now < opensAt) {
    return {
      canCheckIn: false,
      missed: false,
      label: `Check-in opens at ${formatTimeOnly(opensAt.toISOString())}`,
    };
  }

  if (now > closesAt) {
    return {
      canCheckIn: false,
      missed: true,
      label: `Past check-in window. Backend should auto-cancel after ${formatTimeOnly(closesAt.toISOString())}.`,
    };
  }

  return {
    canCheckIn: true,
    missed: false,
    label: `Eligible now until ${formatTimeOnly(closesAt.toISOString())}`,
  };
}

function isActiveAppointment(appointment: AppointmentView) {
  const status = (appointment.status || "").toUpperCase();
  return !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(status);
}

function isCancellableAppointment(appointment: AppointmentView) {
  const status = (appointment.status || "").toUpperCase();
  return !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(status);
}

function matchesTime(appointment: AppointmentView, timeValue: string) {
  const parsed = parseDateTime(appointment.scheduledAt);
  if (!parsed) return false;
  const pad = (entry: number) => String(entry).padStart(2, "0");
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}` === timeValue;
}

function getPatientDisplay(appointment: AppointmentView, patient?: PatientResponse | null) {
  return {
    name: patient?.fullName || appointment.patientName || "Unknown patient",
    mrn: patient?.mrn || appointment.patientId || "-",
    dob: patient?.dateOfBirth || null,
  };
}

function getVisibleClinicians(appointments: AppointmentView[]) {
  const loads = new Map<string, number>();
  appointments.forEach((appointment) => {
    const clinician = appointment.clinicianName?.trim();
    if (!clinician) return;
    loads.set(clinician, (loads.get(clinician) || 0) + 1);
  });
  return Array.from(loads.entries())
    .sort((left, right) => {
      if (left[1] === right[1]) return left[0].localeCompare(right[0]);
      return left[1] - right[1];
    })
    .map(([name, count]) => ({ name, count }));
}

function hasSchedulingConflict(
  appointments: AppointmentView[],
  clinicianName: string,
  scheduledAt: string,
  durationMinutes: number,
  ignoreAppointmentId?: string | null
) {
  const desiredStart = parseDateTime(scheduledAt);
  if (!desiredStart) return false;
  const desiredEnd = new Date(desiredStart.getTime() + durationMinutes * 60 * 1000);

  return appointments.some((appointment) => {
    if (ignoreAppointmentId && appointment.id === ignoreAppointmentId) return false;
    if (normalizeText(appointment.clinicianName) !== normalizeText(clinicianName)) return false;
    const start = parseDateTime(appointment.scheduledAt);
    if (!start) return false;
    const end = new Date(start.getTime() + DEFAULT_EXISTING_DURATION_MINUTES * 60 * 1000);
    return desiredStart < end && start < desiredEnd;
  });
}

function buildClinicianSuggestion(
  appointments: AppointmentView[],
  patient: PatientResponse | null,
  scheduledAt: string,
  durationMinutes: number,
  preferredClinicianName: string
) {
  const clinicians = getVisibleClinicians(appointments);
  if (!clinicians.length) {
    return {
      recommendation: "",
      explanation: "No clinician schedule is visible yet. Enter a clinician name if needed.",
      alternatives: [] as string[],
      preferredConflict: false,
    };
  }

  const patientHistory = patient
    ? appointments.filter((entry) => entry.patientId === patient.id && entry.clinicianName)
    : [];

  const repeatClinician = patientHistory
    .sort((left, right) => {
      const leftTime = parseDateTime(left.scheduledAt)?.getTime() ?? 0;
      const rightTime = parseDateTime(right.scheduledAt)?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .map((entry) => entry.clinicianName?.trim() || "")
    .find(Boolean);

  const availableClinicians = clinicians.filter(
    ({ name }) => !scheduledAt || !hasSchedulingConflict(appointments, name, scheduledAt, durationMinutes)
  );

  const preferred = preferredClinicianName.trim();
  const preferredConflict =
    Boolean(preferred) && Boolean(scheduledAt) && hasSchedulingConflict(appointments, preferred, scheduledAt, durationMinutes);

  if (preferred) {
    return {
      recommendation: preferred,
      explanation: preferredConflict
        ? `${preferred} already appears booked at that time in the visible calendar. Choose another clinician or move the appointment.`
        : `${preferred} looks available in the visible calendar.`,
      alternatives: availableClinicians.map((entry) => entry.name).slice(0, 6),
      preferredConflict,
    };
  }

  if (repeatClinician && !hasSchedulingConflict(appointments, repeatClinician, scheduledAt, durationMinutes)) {
    return {
      recommendation: repeatClinician,
      explanation: `Repeat patient match: ${repeatClinician} is available at the selected time.`,
      alternatives: availableClinicians.map((entry) => entry.name).slice(0, 6),
      preferredConflict: false,
    };
  }

  const leastLoaded = availableClinicians[0]?.name || clinicians[0]?.name || "";
  return {
    recommendation: leastLoaded,
    explanation: leastLoaded
      ? `Suggested next available clinician based on the visible schedule load: ${leastLoaded}.`
      : "Enter a clinician name to continue.",
    alternatives: availableClinicians.map((entry) => entry.name).slice(0, 6),
    preferredConflict: false,
  };
}

function DateOfBirthField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { theme: T } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const textInputRef = useRef<TextInput | null>(null);
  const webDateInputRef = useRef<HTMLInputElement | null>(null);
  const WebInput = "input" as any;
  const isoValue = tryDobToIso(value);
  const longDisplay = isoValue ? isoToDobLongDisplay(isoValue) : "";
  const showLongDisplay = !isEditing && Boolean(longDisplay);

  useEffect(() => {
    if (!isEditing) return;
    const timeoutId = setTimeout(() => textInputRef.current?.focus(), 0);
    return () => clearTimeout(timeoutId);
  }, [isEditing]);

  const openCalendar = () => {
    const input = webDateInputRef.current;
    if (!input) return;

    if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
      (input as HTMLInputElement & { showPicker: () => void }).showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <View style={styles.dateRow}>
        {showLongDisplay ? (
          <Pressable
            onPress={() => setIsEditing(true)}
            style={[
              styles.dateField,
              styles.dateTextInput,
              { backgroundColor: T.inputBg, borderColor: T.border },
            ]}
          >
            <Text style={[styles.dateReadonlyText, { color: T.text }]}>{longDisplay}</Text>
          </Pressable>
        ) : (
          <TextInput
            ref={textInputRef}
            value={value}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            onChangeText={(text) => onChangeText(formatDobInput(text))}
            placeholder={DOB_PLACEHOLDER}
            placeholderTextColor={T.textMuted}
            keyboardType="number-pad"
            maxLength={10}
            style={[
              styles.dateField,
              styles.dateTextInput,
              { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
            ]}
          />
        )}
        {Platform.OS === "web" && typeof document !== "undefined" ? (
          <View style={styles.calendarWrap}>
            <Pressable
              onPress={openCalendar}
              style={[styles.calendarBtn, { backgroundColor: T.inputBg, borderColor: T.border }]}
            >
              <Text style={styles.calendarBtnText}>Cal</Text>
            </Pressable>
            <WebInput
              type="date"
              ref={(node: HTMLInputElement | null) => {
                webDateInputRef.current = node;
              }}
              value={isoValue}
              onChange={(event: { target: { value: string } }) => {
                onChangeText(isoToDobDisplay(event.target.value));
                setIsEditing(false);
              }}
              aria-label={label}
              tabIndex={-1}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DateTimeField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { theme: T } = useTheme();
  if (Platform.OS === "web") {
    return (
      <View style={styles.field}>
        <Label>{label}</Label>
        <input
          type="datetime-local"
          value={value}
          onChange={(event) => onChangeText(event.currentTarget.value)}
          style={{
            minHeight: 44,
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            padding: "10px 12px",
            backgroundColor: T.inputBg,
            color: T.text,
          }}
        />
      </View>
    );
  }

  return (
    <InputField
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder="2026-03-28T14:30"
    />
  );
}

function TimeField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { theme: T } = useTheme();
  if (Platform.OS === "web") {
    return (
      <View style={styles.field}>
        <Label>{label}</Label>
        <input
          type="time"
          value={value}
          onChange={(event) => onChangeText(event.currentTarget.value)}
          style={{
            minHeight: 44,
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            padding: "10px 12px",
            backgroundColor: T.inputBg,
            color: T.text,
          }}
        />
      </View>
    );
  }

  return <InputField label={label} value={value} onChangeText={onChangeText} placeholder="14:30" />;
}

function AppointmentSummaryCard({
  title,
  appointment,
  patient,
}: {
  title: string;
  appointment: AppointmentView | null;
  patient: PatientResponse | null;
}) {
  const { theme: T } = useTheme();

  if (!appointment) {
    return (
      <Card title={title}>
        <MessageBanner message="Select an appointment from the results list first." tone="info" />
      </Card>
    );
  }

  const patientInfo = getPatientDisplay(appointment, patient);
  const checkInState = getCheckInState(appointment);

  return (
    <Card title={title}>
      <View style={styles.summaryGrid}>
        {[
          ["Patient Name", patientInfo.name],
          ["Patient ID", patientInfo.mrn],
          ["Date of Birth", patientInfo.dob ? formatDateOnly(patientInfo.dob) : "-"],
          ["Appointment Number", appointment.appointmentNumber || "-"],
          ["Scheduled Time", formatDateTime(appointment.scheduledAt)],
          ["Clinician", appointment.clinicianName || "-"],
          ["Status", appointment.status || "-"],
          ["Check-In Window", getCheckInWindowLabel(appointment)],
          ["Window Status", checkInState.label],
        ].map(([label, value]) => (
          <View key={label} style={[styles.summaryItem, { borderColor: T.borderLight }]}>
            <Text style={[styles.summaryLabel, { color: T.textMuted }]}>{label}</Text>
            <Text style={[styles.summaryValue, { color: T.text }]}>{value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function AppointmentResultCard({
  appointment,
  patient,
  selected,
  selectionLabel,
  onSelect,
  onJumpToCheckIn,
  onJumpToCancel,
  onJumpToReassign,
}: {
  appointment: AppointmentView;
  patient: PatientResponse | null;
  selected: boolean;
  selectionLabel: string;
  onSelect: () => void;
  onJumpToCheckIn?: () => void;
  onJumpToCancel?: () => void;
  onJumpToReassign?: () => void;
}) {
  const { theme: T } = useTheme();
  const patientInfo = getPatientDisplay(appointment, patient);
  const checkInState = getCheckInState(appointment);

  return (
    <Pressable
      onPress={onSelect}
      style={[
        styles.resultCard,
        {
          backgroundColor: T.surfaceAlt as string,
          borderColor: selected ? T.teal : T.border,
        },
      ]}
    >
      <View style={styles.resultHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.resultTitle, { color: T.text }]}>{patientInfo.name}</Text>
          <Text style={[styles.resultMeta, { color: T.textMid }]}>
            {patientInfo.mrn}  |  {appointment.appointmentNumber || "No appointment number"}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: selected ? T.teal : T.surface,
              borderColor: selected ? T.teal : T.border,
            },
          ]}
        >
          <Text style={[styles.statusBadgeText, { color: selected ? "#fff" : T.textMid }]}>
            {appointment.status || "Scheduled"}
          </Text>
        </View>
      </View>

      <View style={styles.resultFacts}>
        <Text style={[styles.resultFact, { color: T.text }]}>
          {formatDateTime(appointment.scheduledAt)}
        </Text>
        <Text style={[styles.resultFact, { color: T.textMid }]}>
          {appointment.clinicianName || "Clinician not assigned"}
        </Text>
        <Text style={[styles.resultFact, { color: checkInState.missed ? T.danger : T.textMid }]}>
          {checkInState.label}
        </Text>
      </View>

      <InlineActions>
        <ActionButton label={selectionLabel} onPress={onSelect} variant={selected ? "primary" : "secondary"} />
        {onJumpToCheckIn ? <ActionButton label="Check In" onPress={onJumpToCheckIn} variant="ghost" /> : null}
        {onJumpToCancel ? <ActionButton label="Cancel" onPress={onJumpToCancel} variant="ghost" /> : null}
        {onJumpToReassign ? <ActionButton label="Reassign" onPress={onJumpToReassign} variant="ghost" /> : null}
      </InlineActions>
    </Pressable>
  );
}

export function AppointmentsScreen({ onQueueTicketLinked }: AppointmentsScreenProps) {
  const { apiContext } = useSession();
  const { theme: T } = useTheme();
  const [section, setSection] = useState<AppointmentSection>("book");
  const [appointments, setAppointments] = useState<AppointmentView[]>([]);
  const [patientIndex, setPatientIndex] = useState<Record<string, PatientResponse>>({});
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error" | "info">("info");
  const [search, setSearch] = useState<AppointmentSearchState>(defaultSearchState);
  const [checkInComplaint, setCheckInComplaint] = useState("");
  const [checkInConsent, setCheckInConsent] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [reassignClinicianName, setReassignClinicianName] = useState("");
  const [reassignDateTime, setReassignDateTime] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [bookPatientQuery, setBookPatientQuery] = useState("");
  const [bookPatientDob, setBookPatientDob] = useState("");
  const [bookedPatient, setBookedPatient] = useState<PatientResponse | null>(null);
  const [bookPatientMatches, setBookPatientMatches] = useState<PatientResponse[]>([]);
  const [bookDateTime, setBookDateTime] = useState("");
  const [bookDurationMinutes, setBookDurationMinutes] = useState(String(DEFAULT_DURATION_MINUTES));
  const [bookReason, setBookReason] = useState("");
  const [preferredClinicianName, setPreferredClinicianName] = useState("");

  useEffect(() => {
    if (!apiContext) return;
    void refreshAppointments();
  }, [apiContext]);

  useEffect(() => {
    if (!selectedAppointmentId) return;
    const selected = appointments.find((entry) => entry.id === selectedAppointmentId);
    if (!selected) return;
    setReassignClinicianName(selected.clinicianName || "");
    setReassignDateTime(toDateTimeLocalValue(selected.scheduledAt));
  }, [appointments, selectedAppointmentId]);

  const showError = (error: unknown) => {
    setStatusMessage(toErrorMessage(error));
    setStatusTone("error");
  };

  const showSuccess = (message: string, tone: "success" | "info" = "success") => {
    setStatusMessage(message);
    setStatusTone(tone);
  };

  async function refreshAppointments() {
    const ctx = apiContext;
    if (!ctx) return;
    setLoadingAppointments(true);
    try {
      const [todayAppointments, assignedAppointments] = await Promise.all([
        appointmentApi.getToday(ctx),
        appointmentApi.getAssignedPending(ctx),
      ]);
      const merged = mergeAppointments(todayAppointments, assignedAppointments).filter(isActiveAppointment);
      const missingPatientIds = Array.from(
        new Set(
          merged
            .map((entry) => entry.patientId)
            .filter((entry): entry is string => typeof entry === "string" && !(entry in patientIndex))
        )
      );
      let nextPatientIndex = patientIndex;
      if (missingPatientIds.length > 0) {
        const loadedPatients = await Promise.all(
          missingPatientIds.map(async (patientId) => {
            try {
              return await patientApi.getById(ctx, patientId);
            } catch {
              return null;
            }
          })
        );
        nextPatientIndex = {
          ...patientIndex,
          ...Object.fromEntries(
            loadedPatients
              .filter((entry): entry is PatientResponse => Boolean(entry))
              .map((entry) => [entry.id, entry])
          ),
        };
        setPatientIndex(nextPatientIndex);
      }
      setAppointments(merged);
      if (!selectedAppointmentId && merged[0]?.id) {
        setSelectedAppointmentId(merged[0].id);
      }
      showSuccess(`Showing ${merged.length} upcoming appointment(s).`, "info");
    } catch (error) {
      showError(error);
    } finally {
      setLoadingAppointments(false);
    }
  }

  const searchDobIso = tryDobToIso(search.dob);
  const filteredAppointments = useMemo(() => {
    const query = normalizeText(search.query);
    return appointments.filter((appointment) => {
      const patient = appointment.patientId ? patientIndex[appointment.patientId] : null;
      const patientInfo = getPatientDisplay(appointment, patient);
      const matchesQuery =
        !query ||
        [
          patientInfo.name,
          patientInfo.mrn,
          appointment.appointmentNumber,
          appointment.clinicianName,
        ].some((value) => normalizeText(value).includes(query));
      if (!matchesQuery) return false;
      if (searchDobIso && patient?.dateOfBirth !== searchDobIso) return false;
      if (search.time && !matchesTime(appointment, search.time)) return false;
      return true;
    });
  }, [appointments, patientIndex, search.dob, search.query, search.time, searchDobIso]);

  const selectedAppointment =
    appointments.find((entry) => entry.id === selectedAppointmentId) ||
    filteredAppointments[0] ||
    null;
  const selectedPatient =
    selectedAppointment?.patientId ? patientIndex[selectedAppointment.patientId] || null : null;

  const clinicianSuggestion = useMemo(() => {
    const duration = Number.parseInt(bookDurationMinutes, 10) || DEFAULT_DURATION_MINUTES;
    return buildClinicianSuggestion(
      appointments,
      bookedPatient,
      toIsoDateTime(bookDateTime),
      duration,
      preferredClinicianName
    );
  }, [appointments, bookedPatient, bookDateTime, bookDurationMinutes, preferredClinicianName]);

  const setSelectedAppointment = (appointmentId: string, nextSection?: AppointmentSection) => {
    setSelectedAppointmentId(appointmentId);
    if (nextSection) {
      setSection(nextSection);
    }
  };

  const findPatientForBooking = async () => {
    try {
      const ctx = apiContext;
      if (!ctx) throw new Error("No authenticated session.");
      const query = bookPatientQuery.trim();
      if (!query) {
        throw new Error("Enter patient name or patient ID.");
      }

      const dobIso = bookPatientDob.trim() ? dobDisplayToIso(bookPatientDob) : "";

      try {
        const patient = await resolvePatientByInput(ctx, query);
        if (dobIso && patient.dateOfBirth !== dobIso) {
          throw new Error("Patient ID and date of birth do not match.");
        }
        setBookedPatient(patient);
        setBookPatientMatches([]);
        showSuccess(`Patient ready for booking: ${patient.fullName}`);
        return;
      } catch {
        const matches = Object.values(patientIndex).filter((patient) => {
          const fullName = normalizeText(patient.fullName);
          const givenName = normalizeText(patient.givenName);
          const familyName = normalizeText(patient.familyName);
          const nameMatches =
            fullName.includes(normalizeText(query)) ||
            `${givenName} ${familyName}`.includes(normalizeText(query));
          const dobMatches = !dobIso || patient.dateOfBirth === dobIso;
          return nameMatches && dobMatches;
        });

        if (matches.length === 1) {
          setBookedPatient(matches[0]);
          setBookPatientMatches([]);
          showSuccess(`Patient ready for booking: ${matches[0].fullName}`);
          return;
        }

        if (matches.length > 1) {
          setBookedPatient(null);
          setBookPatientMatches(matches);
          showSuccess(`Found ${matches.length} matching patients. Select the correct one.`, "info");
          return;
        }
      }

      throw new Error("Patient not found. Search by patient name + date of birth from upcoming appointments, or use the patient ID.");
    } catch (error) {
      showError(error);
    }
  };

  const bookAppointment = async () => {
    try {
      const ctx = apiContext;
      if (!ctx) throw new Error("No authenticated session.");
      if (!bookedPatient) {
        throw new Error("Find and select a patient before booking.");
      }
      if (!bookDateTime.trim()) {
        throw new Error("Appointment date and time are required.");
      }

      const scheduledAt = toIsoDateTime(bookDateTime);
      const durationMinutes = Math.max(Number.parseInt(bookDurationMinutes, 10) || DEFAULT_DURATION_MINUTES, 10);
      const clinicianName =
        preferredClinicianName.trim() || clinicianSuggestion.recommendation || undefined;

      if (clinicianName && hasSchedulingConflict(appointments, clinicianName, scheduledAt, durationMinutes)) {
        throw new Error(`${clinicianName} already appears booked at that time in the visible calendar.`);
      }

      const created = await appointmentApi.schedule(ctx, {
        patientId: bookedPatient.id,
        scheduledAt,
        durationMinutes,
        clinicianName,
        reason: bookReason.trim() || undefined,
      });

      setPreferredClinicianName(clinicianName || "");
      setSelectedAppointmentId(created.id);
      setSection("upcoming");
      setBookReason("");
      showSuccess(
        `Appointment booked for ${bookedPatient.fullName}${created.appointmentNumber ? ` | ${created.appointmentNumber}` : ""}.`
      );
      await refreshAppointments();
    } catch (error) {
      showError(error);
    }
  };

  const checkInPatient = async () => {
    try {
      const ctx = apiContext;
      if (!ctx) throw new Error("No authenticated session.");
      if (!selectedAppointment) {
        throw new Error("Select an appointment first.");
      }
      if (!selectedAppointment.patientId) {
        throw new Error("This appointment is missing patient context.");
      }
      const checkInState = getCheckInState(selectedAppointment);
      if (!checkInState.canCheckIn) {
        throw new Error(checkInState.label);
      }

      const checkedIn = await appointmentApi.checkInByStaff(ctx, selectedAppointment.id, {
        patientId: selectedAppointment.patientId,
        complaint: checkInComplaint.trim() || undefined,
        consentForDataAccess: checkInConsent,
      });

      setCheckInComplaint("");
      setCheckInConsent(false);
      showSuccess(
        `Checked in ${checkedIn.appointment.patientName || selectedPatient?.fullName || "patient"}. Queue ticket ${checkedIn.queueTicket.ticketNumber}.`
      );
      await refreshAppointments();
      onQueueTicketLinked?.(checkedIn.queueTicket.id);
    } catch (error) {
      showError(error);
    }
  };

  const cancelAppointment = async () => {
    try {
      const ctx = apiContext;
      if (!ctx) throw new Error("No authenticated session.");
      if (!selectedAppointment) {
        throw new Error("Select an appointment first.");
      }
      await appointmentApi.cancel(ctx, selectedAppointment.id, cancelReason.trim() || undefined);
      setCancelReason("");
      showSuccess(`Appointment ${selectedAppointment.appointmentNumber || ""} cancelled.`);
      await refreshAppointments();
    } catch (error) {
      showError(error);
    }
  };

  const reassignAppointment = async () => {
    try {
      const ctx = apiContext;
      if (!ctx) throw new Error("No authenticated session.");
      if (!selectedAppointment) {
        throw new Error("Select an appointment first.");
      }
      if (!selectedAppointment.patientId) {
        throw new Error("This appointment is missing patient context.");
      }
      const nextClinician = reassignClinicianName.trim();
      if (!nextClinician) {
        throw new Error("Enter the replacement clinician name.");
      }

      const nextScheduledAt = toIsoDateTime(reassignDateTime || toDateTimeLocalValue(selectedAppointment.scheduledAt));
      if (!nextScheduledAt) {
        throw new Error("Appointment date and time are required.");
      }

      if (hasSchedulingConflict(appointments, nextClinician, nextScheduledAt, DEFAULT_DURATION_MINUTES, selectedAppointment.id)) {
        throw new Error(`${nextClinician} already appears booked at that time in the visible calendar.`);
      }

      const replacement = await appointmentApi.schedule(ctx, {
        patientId: selectedAppointment.patientId,
        scheduledAt: nextScheduledAt,
        durationMinutes: DEFAULT_DURATION_MINUTES,
        clinicianName: nextClinician,
        reason: selectedAppointment.reason || undefined,
      });

      try {
        await appointmentApi.cancel(
          ctx,
          selectedAppointment.id,
          `Reassigned to ${nextClinician}${reassignReason.trim() ? `: ${reassignReason.trim()}` : ""}`
        );
      } catch (error) {
        throw new Error(
          `Replacement appointment ${replacement.appointmentNumber || replacement.id} was created, but the original appointment could not be cancelled: ${toErrorMessage(error)}`
        );
      }

      setSelectedAppointmentId(replacement.id);
      showSuccess(
        `Appointment reassigned to ${nextClinician}${replacement.appointmentNumber ? ` | ${replacement.appointmentNumber}` : ""}.`
      );
      await refreshAppointments();
    } catch (error) {
      showError(error);
    }
  };

  const clinicianLoadSummary = getVisibleClinicians(appointments);
  const checkInState = selectedAppointment ? getCheckInState(selectedAppointment) : null;
  const cancellableResults = filteredAppointments.filter(isCancellableAppointment);

  if (!apiContext) {
    return (
      <Card title="Appointments">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  return (
    <>
      <Card title="">
        <View style={styles.sectionTabs}>
          {APPOINTMENT_SECTIONS.map((entry) => (
            <Pressable
              key={entry}
              onPress={() => setSection(entry)}
              style={[
                styles.sectionTab,
                { borderColor: T.border, backgroundColor: T.surfaceAlt as string },
                section === entry && { backgroundColor: T.teal, borderColor: T.teal },
              ]}
            >
              <Text
                style={[
                  styles.sectionTabText,
                  { color: section === entry ? "#fff" : T.textMid },
                ]}
              >
                {APPOINTMENT_SECTION_LABELS[entry]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {statusMessage ? (
        <Card title="">
          <MessageBanner message={statusMessage} tone={statusTone} />
        </Card>
      ) : null}

      {section === "book" ? (
        <>
          <Card title="Find Patient">
            <InputField
              label="Patient Name or Patient ID"
              value={bookPatientQuery}
              onChangeText={setBookPatientQuery}
              placeholder="Search by patient name or patient ID"
            />
            <DateOfBirthField label="Date of Birth (optional)" value={bookPatientDob} onChangeText={setBookPatientDob} />
            <InlineActions>
              <ActionButton label="Find Patient" onPress={() => void findPatientForBooking()} />
              <ActionButton label="Refresh Upcoming" onPress={() => void refreshAppointments()} variant="secondary" />
            </InlineActions>
            <MessageBanner
              message="Use patient name + date of birth when needed. New patients should be registered first in the Patients workspace."
              tone="info"
            />
          </Card>

          {bookPatientMatches.length > 1 ? (
            <Card title="Select Patient">
              <View style={styles.matchList}>
                {bookPatientMatches.map((patient) => (
                  <Pressable
                    key={patient.id}
                    onPress={() => {
                      setBookedPatient(patient);
                      setBookPatientMatches([]);
                      showSuccess(`Patient ready for booking: ${patient.fullName}`);
                    }}
                    style={[styles.matchCard, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}
                  >
                    <Text style={[styles.matchTitle, { color: T.text }]}>{patient.fullName}</Text>
                    <Text style={[styles.matchMeta, { color: T.textMid }]}>
                      {patient.mrn}  |  {formatDateOnly(patient.dateOfBirth)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          <Card title="Patient Ready for Booking">
            {bookedPatient ? (
              <View style={styles.summaryGrid}>
                {[
                  ["Patient Name", bookedPatient.fullName],
                  ["Patient ID", bookedPatient.mrn],
                  ["Date of Birth", formatDateOnly(bookedPatient.dateOfBirth)],
                  ["Phone", bookedPatient.phoneNumber || "-"],
                  ["Email", bookedPatient.email || "-"],
                ].map(([label, value]) => (
                  <View key={label} style={[styles.summaryItem, { borderColor: T.borderLight }]}>
                    <Text style={[styles.summaryLabel, { color: T.textMuted }]}>{label}</Text>
                    <Text style={[styles.summaryValue, { color: T.text }]}>{value}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <MessageBanner message="Find and select the patient before booking the appointment." tone="info" />
            )}
          </Card>

          <Card title="Book Appointment">
            <DateTimeField label="Appointment Date & Time" value={bookDateTime} onChangeText={setBookDateTime} />
            <InputField
              label="Duration (minutes)"
              value={bookDurationMinutes}
              onChangeText={setBookDurationMinutes}
              placeholder="20"
            />
            <InputField
              label="Preferred Clinician Name (optional)"
              value={preferredClinicianName}
              onChangeText={setPreferredClinicianName}
              placeholder="Start typing a clinician name"
            />
            <InputField
              label="Reason"
              value={bookReason}
              onChangeText={setBookReason}
              placeholder="Brief reason for the visit"
              multiline
            />

            <View style={[styles.callout, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
              <Text style={[styles.calloutTitle, { color: T.text }]}>Clinician Availability</Text>
              <Text style={[styles.calloutBody, { color: T.textMid }]}>{clinicianSuggestion.explanation}</Text>
              {clinicianSuggestion.recommendation ? (
                <InlineActions>
                  <ActionButton
                    label={`Use ${clinicianSuggestion.recommendation}`}
                    onPress={() => setPreferredClinicianName(clinicianSuggestion.recommendation)}
                    variant="secondary"
                  />
                </InlineActions>
              ) : null}
              {clinicianSuggestion.alternatives.length > 0 ? (
                <View style={styles.clinicianChips}>
                  {clinicianSuggestion.alternatives.map((name) => (
                    <Pressable
                      key={name}
                      onPress={() => setPreferredClinicianName(name)}
                      style={[styles.clinicianChip, { borderColor: T.border, backgroundColor: T.surface }]}
                    >
                      <Text style={[styles.clinicianChipText, { color: T.text }]}>{name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <InlineActions>
              <ActionButton label="Book Appointment" onPress={() => void bookAppointment()} />
              <ActionButton label="Refresh Upcoming" onPress={() => void refreshAppointments()} variant="secondary" />
            </InlineActions>
          </Card>

          <Card title="Visible Clinician Load">
            {clinicianLoadSummary.length > 0 ? (
              <View style={styles.loadList}>
                {clinicianLoadSummary.map((entry) => (
                  <View key={entry.name} style={[styles.loadItem, { borderColor: T.borderLight }]}>
                    <Text style={[styles.loadName, { color: T.text }]}>{entry.name}</Text>
                    <Text style={[styles.loadCount, { color: T.textMid }]}>
                      {entry.count} upcoming appointment{entry.count === 1 ? "" : "s"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <MessageBanner message="No visible clinician schedule yet." tone="info" />
            )}
          </Card>
        </>
      ) : null}

      {section !== "book" ? (
        <>
          <Card title="Search Upcoming Appointments">
            <InputField
              label="Patient Name, Patient ID, Appointment Number, or Clinician"
              value={search.query}
              onChangeText={(value) => setSearch((previous) => ({ ...previous, query: value }))}
              placeholder="Search by patient name or patient ID"
            />
            <DateOfBirthField
              label="Date of Birth (optional)"
              value={search.dob}
              onChangeText={(value) => setSearch((previous) => ({ ...previous, dob: value }))}
            />
            <TimeField
              label="Appointment Time (optional)"
              value={search.time}
              onChangeText={(value) => setSearch((previous) => ({ ...previous, time: value }))}
            />
            <InlineActions>
              <ActionButton label="Refresh Upcoming" onPress={() => void refreshAppointments()} variant="secondary" />
              <ActionButton
                label="Clear Search"
                onPress={() => setSearch(defaultSearchState)}
                variant="ghost"
              />
            </InlineActions>
            <MessageBanner
              message="Search supports patient name, patient ID, appointment number, and clinician. Add date of birth or appointment time to narrow it further."
              tone="info"
            />
          </Card>

          <Card title={section === "upcoming" ? "Upcoming Appointments" : "Search Results"}>
            {loadingAppointments ? (
              <MessageBanner message="Refreshing appointment board..." tone="info" />
            ) : null}
            {filteredAppointments.length > 0 ? (
              <View style={styles.resultList}>
                {filteredAppointments.map((appointment) => (
                  <AppointmentResultCard
                    key={appointment.id}
                    appointment={appointment}
                    patient={appointment.patientId ? patientIndex[appointment.patientId] || null : null}
                    selected={appointment.id === selectedAppointment?.id}
                    selectionLabel={
                      section === "checkin"
                        ? "Use for Check-In"
                        : section === "cancel"
                          ? "Use for Cancellation"
                          : section === "reassign"
                            ? "Use for Reassign"
                            : "Select"
                    }
                    onSelect={() => setSelectedAppointment(appointment.id)}
                    onJumpToCheckIn={() => setSelectedAppointment(appointment.id, "checkin")}
                    onJumpToCancel={() => setSelectedAppointment(appointment.id, "cancel")}
                    onJumpToReassign={() => setSelectedAppointment(appointment.id, "reassign")}
                  />
                ))}
              </View>
            ) : (
              <MessageBanner message="No appointments match the current search." tone="info" />
            )}
          </Card>
        </>
      ) : null}

      {section === "upcoming" ? (
        <AppointmentSummaryCard
          title="Selected Appointment"
          appointment={selectedAppointment}
          patient={selectedPatient}
        />
      ) : null}

      {section === "checkin" ? (
        <>
          <AppointmentSummaryCard
            title="Appointment Ready for Check-In"
            appointment={selectedAppointment}
            patient={selectedPatient}
          />

          <Card title="Check In Patient">
            <MessageBanner
              message="Patients can check in starting 15 minutes before the appointment time and up to 30 minutes after."
              tone="info"
            />
            {checkInState ? (
              <MessageBanner
                message={checkInState.label}
                tone={checkInState.canCheckIn ? "success" : checkInState.missed ? "error" : "info"}
              />
            ) : null}
            <InputField
              label="Complaint (optional)"
              value={checkInComplaint}
              onChangeText={setCheckInComplaint}
              placeholder="Optional note for this visit"
              multiline
            />
            <ToggleField
              label="Consent for same-hospital historical data access"
              value={checkInConsent}
              onChange={setCheckInConsent}
            />
            <InlineActions>
              <ActionButton
                label="Check In Patient"
                onPress={() => void checkInPatient()}
                disabled={!selectedAppointment || !checkInState?.canCheckIn}
              />
              <ActionButton
                label="Back to Upcoming"
                onPress={() => setSection("upcoming")}
                variant="secondary"
              />
            </InlineActions>
          </Card>
        </>
      ) : null}

      {section === "cancel" ? (
        <>
          <AppointmentSummaryCard
            title="Appointment Ready for Cancellation"
            appointment={selectedAppointment}
            patient={selectedPatient}
          />

          <Card title="Cancel Appointment">
            <MessageBanner
              message="Use the upcoming list or search by patient name, patient ID, date of birth, and appointment time."
              tone="info"
            />
            <InputField
              label="Cancellation Reason (optional)"
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Reason for cancellation"
              multiline
            />
            <InlineActions>
              <ActionButton
                label="Cancel Appointment"
                onPress={() => void cancelAppointment()}
                variant="danger"
                disabled={!selectedAppointment || !cancellableResults.some((entry) => entry.id === selectedAppointment.id)}
              />
              <ActionButton
                label="Back to Upcoming"
                onPress={() => setSection("upcoming")}
                variant="secondary"
              />
            </InlineActions>
          </Card>
        </>
      ) : null}

      {section === "reassign" ? (
        <>
          <AppointmentSummaryCard
            title="Appointment Ready for Reassignment"
            appointment={selectedAppointment}
            patient={selectedPatient}
          />

          <Card title="Reassign Clinician">
            <MessageBanner
              message="Use clinician name only here. The frontend will create the replacement appointment and then cancel the original one."
              tone="info"
            />
            <InputField
              label="Replacement Clinician Name"
              value={reassignClinicianName}
              onChangeText={setReassignClinicianName}
              placeholder="Dr. Jane Doe"
            />
            <DateTimeField label="New Appointment Time" value={reassignDateTime} onChangeText={setReassignDateTime} />
            <InputField
              label="Reason for Reassignment (optional)"
              value={reassignReason}
              onChangeText={setReassignReason}
              placeholder="Doctor unavailable"
              multiline
            />
            {clinicianLoadSummary.length > 0 ? (
              <View style={styles.clinicianChips}>
                {clinicianLoadSummary.slice(0, 8).map((entry) => (
                  <Pressable
                    key={entry.name}
                    onPress={() => setReassignClinicianName(entry.name)}
                    style={[styles.clinicianChip, { borderColor: T.border, backgroundColor: T.surface }]}
                  >
                    <Text style={[styles.clinicianChipText, { color: T.text }]}>
                      {entry.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <InlineActions>
              <ActionButton
                label="Reassign Appointment"
                onPress={() => void reassignAppointment()}
                disabled={!selectedAppointment}
              />
              <ActionButton
                label="Back to Upcoming"
                onPress={() => setSection("upcoming")}
                variant="secondary"
              />
            </InlineActions>
          </Card>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sectionTab: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionTabText: {
    fontSize: 13,
    fontWeight: "700",
  },
  field: {
    gap: 8,
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateField: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  dateTextInput: {
    flex: 1,
  },
  dateReadonlyText: {
    fontSize: 16,
  },
  calendarWrap: {
    position: "relative",
  },
  calendarBtn: {
    minWidth: 52,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  calendarBtnText: {
    fontSize: 20,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryItem: {
    minWidth: 180,
    flexBasis: "30%",
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  resultList: {
    gap: 10,
  },
  resultCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  resultHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  resultMeta: {
    fontSize: 12,
  },
  resultFacts: {
    gap: 4,
  },
  resultFact: {
    fontSize: 13,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  matchList: {
    gap: 10,
  },
  matchCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  matchTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  matchMeta: {
    fontSize: 12,
  },
  callout: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  calloutTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  calloutBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  clinicianChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  clinicianChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clinicianChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  loadList: {
    gap: 10,
  },
  loadItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  loadName: {
    fontSize: 15,
    fontWeight: "700",
  },
  loadCount: {
    fontSize: 13,
  },
});
