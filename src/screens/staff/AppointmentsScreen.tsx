import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { appointmentApi, patientApi } from "../../api/services";
import type { AppointmentCheckInResponse, AppointmentView, PatientResponse } from "../../api/types";
import {
  ActionButton, Card, InlineActions,
  InputField, MessageBanner,
  ToggleField, useTheme,
} from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

// ─── APPOINTMENTS SCREEN ──────────────────────────────────────────────────────
// Roles:
//   PHYSICIAN   — sees "My Assigned Appointments"
//   RECEPTIONIST / NURSE — sees all assigned + today's list
// On successful staff check-in the queue ticket ID is bubbled up via
// onQueueTicketLinked so the parent can pre-populate the Queue / Triage tabs.
//
// Queue number display: after check-in the server returns trackingNumber
// (YYYYMMDD-G-042) and ticketNumber (G-042). We display trackingNumber
// as the reference and ticketNumber for human-readable confirmation.

interface AppointmentsScreenProps {
  onQueueTicketLinked?: (queueTicketId: string) => void;
}

const toNullableNumber = (value: string): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleString();
};

// Status pill colours aligned with the Dalili triage palette
const apptStatusStyle = (status: string): { bg: string; text: string; border: string } => {
  const s = status.toUpperCase();
  if (s.includes("CANCEL") || s.includes("NO_SHOW"))
    return { bg: "#7f1d1d22", text: "#fca5a5", border: "#ef444455" };
  if (s.includes("CHECKED") || s.includes("COMPLETE"))
    return { bg: "#14532d22", text: "#86efac", border: "#22c55e55" };
  return { bg: "#1e3a5f22", text: "#93c5fd", border: "#3b82f655" };
};

export function AppointmentsScreen({ onQueueTicketLinked }: AppointmentsScreenProps) {
  const { apiContext, role } = useSession();
  const { theme: T }         = useTheme();

  // ── Schedule fields ────────────────────────────────────────────────────────
  const [patientMrn,         setPatientMrn]         = useState("");
  const [scheduledAt,        setScheduledAt]        = useState("");
  const [durationMinutes,    setDurationMinutes]    = useState("20");
  const [clinicianName,      setClinicianName]      = useState("");
  const [clinicianEmployeeId,setClinicianEmployeeId]= useState("");
  const [departmentCode,     setDepartmentCode]     = useState("");
  const [departmentName,     setDepartmentName]     = useState("");
  const [reason,             setReason]             = useState("");

  // ── Check-in / lookup fields ───────────────────────────────────────────────
  const [lookupPatientMrn,    setLookupPatientMrn]    = useState("");
  const [checkInAppointmentId,setCheckInAppointmentId]= useState("");
  const [checkInPatientId,    setCheckInPatientId]    = useState("");
  const [checkInComplaint,    setCheckInComplaint]    = useState("");
  const [checkInConsent,      setCheckInConsent]      = useState(true);

  // ── Cancel fields ──────────────────────────────────────────────────────────
  const [cancelAppointmentId, setCancelAppointmentId] = useState("");
  const [cancelAppointmentNumber, setCancelAppointmentNumber] = useState("");
  const [cancelReason,        setCancelReason]        = useState("");

  // ── Data ───────────────────────────────────────────────────────────────────
  const [todayAppointments,    setTodayAppointments]    = useState<AppointmentView[]>([]);
  const [assignedAppointments, setAssignedAppointments] = useState<AppointmentView[]>([]);
  const [pendingByPatient,     setPendingByPatient]     = useState<AppointmentView[]>([]);
  const [selectedPatient,      setSelectedPatient]      = useState<PatientResponse | null>(null);
  const [latestCheckIn,        setLatestCheckIn]        = useState<AppointmentCheckInResponse | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [tone,    setTone]    = useState<"success" | "error">("success");

  if (!apiContext) {
    return (
      <Card title="Appointments">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  const err = (e: unknown) => { setMessage(toErrorMessage(e)); setTone("error"); };
  const ok  = (s: string)  => { setMessage(s); setTone("success"); };

  const loadPatientByMrn = async (mrn: string) => {
    const trimmed = mrn.trim();
    if (!trimmed) {
      throw new Error("Patient ID is required");
    }
    const patient = await patientApi.getByMrn(apiContext, trimmed);
    setSelectedPatient(patient);
    return patient;
  };

  const findAppointmentByNumber = (appointmentNumber: string) => {
    const target = appointmentNumber.trim().toUpperCase();
    if (!target) {
      throw new Error("Appointment number is required");
    }

    const match = [...assignedAppointments, ...todayAppointments, ...pendingByPatient]
      .find((appointment) => (appointment.appointmentNumber || "").trim().toUpperCase() === target);

    if (!match) {
      throw new Error("Open the appointment list first, then select or enter a valid appointment number.");
    }

    return match;
  };

  const selectForCheckIn = async (appt: AppointmentView) => {
    setCheckInAppointmentId(appt.id);
    if (appt.patientId) {
      setCheckInPatientId(appt.patientId);
      try {
        setSelectedPatient(await patientApi.getById(apiContext, appt.patientId));
      } catch {
        // Keep check-in usable even if the patient summary lookup fails.
      }
    }
    setCancelAppointmentId(appt.id);
    setCancelAppointmentNumber(appt.appointmentNumber || "");
  };

  // ── API actions ────────────────────────────────────────────────────────────
  const scheduleAppointment = async () => {
    try {
      const patient = await loadPatientByMrn(patientMrn);
      const created = await appointmentApi.schedule(apiContext, {
        patientId: patient.id,
        scheduledAt: scheduledAt.trim(),
        durationMinutes: toNullableNumber(durationMinutes),
        clinicianName: clinicianName || undefined,
        clinicianEmployeeId: clinicianEmployeeId || undefined,
        departmentCode: departmentCode || undefined,
        departmentName: departmentName || undefined,
        reason: reason.trim() || undefined,
      });
      setCancelAppointmentId(created.id);
      setCancelAppointmentNumber(created.appointmentNumber || "");
      ok(`Appointment scheduled for ${patient.fullName}`);
    } catch (e) { err(e); }
  };

  const loadToday = async () => {
    try {
      const list = await appointmentApi.getToday(apiContext);
      setTodayAppointments(list);
      ok(`${list.length} appointment(s) ready for today`);
    } catch (e) { err(e); }
  };

  const loadAssignedPending = async () => {
    try {
      const list = await appointmentApi.getAssignedPending(apiContext);
      setAssignedAppointments(list);
      if (list.length) selectForCheckIn(list[0]);
      ok(`${list.length} assigned appointment(s) ready`);
    } catch (e) { err(e); }
  };

  const loadPendingForPatient = async () => {
    try {
      const patient = await loadPatientByMrn(lookupPatientMrn);
      const list = await appointmentApi.getPendingForPatient(apiContext, patient.id);
      setPendingByPatient(list);
      if (list.length) selectForCheckIn(list[0]);
      ok(`${list.length} pending appointment(s) ready for ${patient.fullName}`);
    } catch (e) { err(e); }
  };

  const staffCheckIn = async () => {
    try {
      const response = await appointmentApi.checkInByStaff(
        apiContext,
        checkInAppointmentId.trim(),
        {
          patientId: checkInPatientId.trim(),
          complaint: checkInComplaint || undefined,
          consentForDataAccess: checkInConsent,
        },
      );
      setLatestCheckIn(response);
      if (response.queueTicket?.id) onQueueTicketLinked?.(response.queueTicket.id);

      // Show tracking number (full date-scoped) and short ticket number
      const ref = response.queueTicket.trackingNumber
        ? `${response.queueTicket.trackingNumber} (${response.queueTicket.ticketNumber})`
        : response.queueTicket.ticketNumber;
      ok(`Checked in. Queue number: ${ref}`);
    } catch (e) { err(e); }
  };

  const cancelAppointment = async () => {
    try {
      const appointment = findAppointmentByNumber(cancelAppointmentNumber);
      const response = await appointmentApi.cancel(
        apiContext,
        appointment.id,
        cancelReason || undefined,
      );
      setCancelAppointmentId(response.id);
      setCancelAppointmentNumber(response.appointmentNumber || appointment.appointmentNumber || "");
      ok(`Appointment cancelled: ${response.appointmentNumber || appointment.appointmentNumber || "selected appointment"}`);
    } catch (e) { err(e); }
  };

  // ── Appointment list renderer ──────────────────────────────────────────────
  const renderAppointmentList = (title: string, list: AppointmentView[]) => {
    if (!list.length) return null;
    return (
      <Card title={title}>
        <View style={{ gap: 10 }}>
          {list.map(appt => {
            const pill = apptStatusStyle(appt.status);
            const isSelected = checkInAppointmentId === appt.id;
            return (
              <View
                key={appt.id}
                style={[
                  as.apptRow,
                  {
                    borderColor: isSelected ? T.teal : T.border,
                    backgroundColor: isSelected
                      ? (T.teal + "12")
                      : (T.surfaceAlt as string),
                  },
                ]}
              >
                {/* Header row */}
                <View style={as.apptRowHeader}>
                  <Text style={[as.apptNumber, { color: T.teal }]}>
                    {appt.appointmentNumber || "Pending appointment number"}
                  </Text>
                  <View style={[as.statusPill, { backgroundColor: pill.bg, borderColor: pill.border }]}>
                    <Text style={[as.statusPillText, { color: pill.text }]}>{appt.status}</Text>
                  </View>
                </View>

                {/* Details */}
                {[
                  ["Patient",   appt.patientName || "Patient"],
                  ["Date/Time", formatDateTime(appt.scheduledAt)],
                  ["Hospital",  appt.facilityName || "Current facility"],
                  ["Doctor",    appt.clinicianName || "Unassigned"],
                  ["Reason",    appt.reason || "—"],
                ].map(([label, value]) => (
                  <View key={label} style={as.apptDetail}>
                    <Text style={[as.apptLabel, { color: T.textMuted }]}>{label}</Text>
                    <Text style={[as.apptValue, { color: T.text }]} numberOfLines={1}>{value}</Text>
                  </View>
                ))}

                {/* Check-in window chips */}
                {appt.checkInEligibleNow ? (
                  <View style={[as.checkInChip, { backgroundColor: T.teal + "20", borderColor: T.teal + "60" }]}>
                    <Text style={[as.checkInChipText, { color: T.teal }]}>✓ Check-in window open</Text>
                  </View>
                ) : null}

                <InlineActions>
                  <ActionButton
                    label={isSelected ? "Selected ✓" : "Select for check-in"}
                    onPress={() => selectForCheckIn(appt)}
                    variant={isSelected ? "primary" : "secondary"}
                  />
                </InlineActions>
              </View>
            );
          })}
        </View>
      </Card>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Schedule */}
      <Card title="Schedule Appointment">
        <InputField label="Patient ID"            value={patientMrn}      onChangeText={setPatientMrn} />
        <InputField
          label="Scheduled at (ISO-8601)"
          value={scheduledAt}
          onChangeText={setScheduledAt}
          placeholder="2026-03-11T14:30:00Z"
        />
        <InputField label="Duration (minutes)"   value={durationMinutes}     onChangeText={setDurationMinutes} />
        <InputField label="Clinician name (opt)" value={clinicianName}       onChangeText={setClinicianName} />
        <InputField label="Clinician employee ID" value={clinicianEmployeeId} onChangeText={setClinicianEmployeeId} />
        <InputField label="Department code (opt)" value={departmentCode}      onChangeText={setDepartmentCode} />
        <InputField label="Department name (opt)" value={departmentName}      onChangeText={setDepartmentName} />
        <InputField label="Reason"               value={reason}              onChangeText={setReason} multiline />
        <InlineActions>
          <ActionButton label="Schedule"                onPress={scheduleAppointment} />
          <ActionButton label="Today's Appointments"   onPress={loadToday}         variant="secondary" />
          <ActionButton label="Assigned Appointments"  onPress={loadAssignedPending} variant="secondary" />
        </InlineActions>
        <MessageBanner message={message} tone={tone} />
      </Card>

      {/* Check-in */}
      <Card title="Pending / Check-In">
        <InputField
          label="Patient ID"
          value={lookupPatientMrn}
          onChangeText={setLookupPatientMrn}
          placeholder="Load pending appointments for one patient"
        />
        <InlineActions>
          <ActionButton label="Pending For Patient" onPress={loadPendingForPatient} />
        </InlineActions>
        <InputField label="Selected Appointment Number" value={cancelAppointmentNumber} onChangeText={setCancelAppointmentNumber} />
        <InputField label="Selected Patient Name" value={selectedPatient?.fullName || ""} onChangeText={() => undefined} />
        <InputField label="Selected Patient ID" value={selectedPatient?.mrn || lookupPatientMrn} onChangeText={setLookupPatientMrn} />
        <InputField label="Complaint (optional)"  value={checkInComplaint}     onChangeText={setCheckInComplaint} multiline />
        <ToggleField
          label="Consent for same-hospital historical data access"
          value={checkInConsent}
          onChange={setCheckInConsent}
        />
        <InlineActions>
          <ActionButton label="Check In Appointment" onPress={staffCheckIn} />
        </InlineActions>
      </Card>

      {/* Cancel */}
      <Card title="Cancel Appointment">
        <InputField label="Appointment Number"        value={cancelAppointmentNumber} onChangeText={setCancelAppointmentNumber} />
        <InputField label="Cancel reason (optional)"  value={cancelReason}        onChangeText={setCancelReason} multiline />
        <InlineActions>
          <ActionButton label="Cancel Appointment" onPress={cancelAppointment} variant="danger" />
        </InlineActions>
      </Card>

      {/* Appointment lists */}
      {renderAppointmentList(
        role === "PHYSICIAN" ? "My Assigned Appointments" : "Assigned Appointments",
        assignedAppointments,
      )}
      {renderAppointmentList("Today's Appointments", todayAppointments)}
      {renderAppointmentList("Pending Appointments (Patient)", pendingByPatient)}

      {/* Check-in result — shows queue number prominently */}
      {latestCheckIn ? (
        <Card title="Check-In Confirmed">
          <View style={[as.queueNumberBox, { backgroundColor: T.teal + "12", borderColor: T.teal + "60" }]}>
            <Text style={[as.queueNumberLabel, { color: T.textMuted }]}>QUEUE NUMBER</Text>
            <Text style={[as.queueNumber, { color: T.teal }]}>
              {latestCheckIn.queueTicket.ticketNumber}
            </Text>
            {latestCheckIn.queueTicket.trackingNumber ? (
              <Text style={[as.queueNumberTracking, { color: T.textMid }]}>
                Ref: {latestCheckIn.queueTicket.trackingNumber}
              </Text>
            ) : null}
          </View>
          <View style={{ gap: 4, marginTop: 10 }}>
            <Text style={{ color: T.textMid, fontSize: 13 }}>
              Appointment: {latestCheckIn.appointment.appointmentNumber || "Confirmed appointment"}
            </Text>
            <Text style={{ color: T.textMid, fontSize: 13 }}>
              Hospital: {latestCheckIn.appointment.facilityName || "Current Facility"}
            </Text>
          </View>
        </Card>
      ) : null}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const as = StyleSheet.create({
  apptRow:        { borderWidth: 1.5, borderRadius: 12, padding: 14, gap: 6, transition: "border-color 0.2s" } as any,
  apptRowHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  apptNumber:     { fontSize: 14, fontWeight: "700" },
  statusPill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusPillText: { fontSize: 10, fontWeight: "700" },
  apptDetail:     { flexDirection: "row", gap: 6, alignItems: "baseline" },
  apptLabel:      { fontSize: 11, fontWeight: "700", minWidth: 68 },
  apptValue:      { fontSize: 12, flex: 1 },
  checkInChip:    { borderWidth: 1, borderRadius: 6, padding: 6, alignSelf: "flex-start", marginTop: 4 },
  checkInChipText:{ fontSize: 11, fontWeight: "600" },
  queueNumberBox: { borderWidth: 1.5, borderRadius: 12, padding: 18, alignItems: "center", gap: 4 },
  queueNumberLabel:{ fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  queueNumber:    { fontSize: 56, fontWeight: "900", lineHeight: 64 },
  queueNumberTracking: { fontSize: 12, marginTop: 2 },
});
