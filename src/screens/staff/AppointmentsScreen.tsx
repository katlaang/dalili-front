import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { appointmentApi } from "../../api/services";
import type { AppointmentCheckInResponse, AppointmentView } from "../../api/types";
import {
  ActionButton, Card, InlineActions,
  InputField, JsonPanel, MessageBanner,
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
  const [patientId,          setPatientId]          = useState("");
  const [scheduledAt,        setScheduledAt]        = useState("");
  const [durationMinutes,    setDurationMinutes]    = useState("20");
  const [clinicianId,        setClinicianId]        = useState("");
  const [clinicianName,      setClinicianName]      = useState("");
  const [clinicianEmployeeId,setClinicianEmployeeId]= useState("");
  const [departmentCode,     setDepartmentCode]     = useState("");
  const [departmentName,     setDepartmentName]     = useState("");
  const [reason,             setReason]             = useState("");

  // ── Check-in / lookup fields ───────────────────────────────────────────────
  const [lookupPatientId,     setLookupPatientId]     = useState("");
  const [checkInAppointmentId,setCheckInAppointmentId]= useState("");
  const [checkInPatientId,    setCheckInPatientId]    = useState("");
  const [checkInComplaint,    setCheckInComplaint]    = useState("");
  const [checkInConsent,      setCheckInConsent]      = useState(true);

  // ── Cancel fields ──────────────────────────────────────────────────────────
  const [cancelAppointmentId, setCancelAppointmentId] = useState("");
  const [cancelReason,        setCancelReason]        = useState("");

  // ── Data ───────────────────────────────────────────────────────────────────
  const [todayAppointments,    setTodayAppointments]    = useState<AppointmentView[]>([]);
  const [assignedAppointments, setAssignedAppointments] = useState<AppointmentView[]>([]);
  const [pendingByPatient,     setPendingByPatient]     = useState<AppointmentView[]>([]);
  const [latestCheckIn,        setLatestCheckIn]        = useState<AppointmentCheckInResponse | null>(null);
  const [lastResponse,         setLastResponse]         = useState<unknown>(null);

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

  const selectForCheckIn = (appt: AppointmentView) => {
    setCheckInAppointmentId(appt.id);
    if (appt.patientId) setCheckInPatientId(appt.patientId);
  };

  // ── API actions ────────────────────────────────────────────────────────────
  const scheduleAppointment = async () => {
    try {
      const created = await appointmentApi.schedule(apiContext, {
        patientId: patientId.trim(),
        scheduledAt: scheduledAt.trim(),
        durationMinutes: toNullableNumber(durationMinutes),
        clinicianId: clinicianId.trim() || undefined,
        clinicianName: clinicianName || undefined,
        clinicianEmployeeId: clinicianEmployeeId || undefined,
        departmentCode: departmentCode || undefined,
        departmentName: departmentName || undefined,
        reason: reason.trim() || undefined,
      });
      setLastResponse(created);
      setCancelAppointmentId(created.id);
      ok("Appointment scheduled");
    } catch (e) { err(e); }
  };

  const loadToday = async () => {
    try {
      const list = await appointmentApi.getToday(apiContext);
      setTodayAppointments(list);
      ok(`Loaded ${list.length} appointment(s) for today`);
    } catch (e) { err(e); }
  };

  const loadAssignedPending = async () => {
    try {
      const list = await appointmentApi.getAssignedPending(apiContext);
      setAssignedAppointments(list);
      if (list.length) selectForCheckIn(list[0]);
      ok(`Loaded ${list.length} assigned appointment(s)`);
    } catch (e) { err(e); }
  };

  const loadPendingForPatient = async () => {
    try {
      const list = await appointmentApi.getPendingForPatient(apiContext, lookupPatientId.trim());
      setPendingByPatient(list);
      if (list.length) selectForCheckIn(list[0]);
      ok(`Loaded ${list.length} pending appointment(s)`);
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
      setLastResponse(response);
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
      const response = await appointmentApi.cancel(
        apiContext,
        cancelAppointmentId.trim(),
        cancelReason || undefined,
      );
      setLastResponse(response);
      ok("Appointment cancelled");
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
                    {appt.appointmentNumber || appt.id.slice(0, 8)}
                  </Text>
                  <View style={[as.statusPill, { backgroundColor: pill.bg, borderColor: pill.border }]}>
                    <Text style={[as.statusPillText, { color: pill.text }]}>{appt.status}</Text>
                  </View>
                </View>

                {/* Details */}
                {[
                  ["Patient",   appt.patientName || appt.patientId || "—"],
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
        <InputField label="Patient UUID"          value={patientId}       onChangeText={setPatientId} />
        <InputField
          label="Scheduled at (ISO-8601)"
          value={scheduledAt}
          onChangeText={setScheduledAt}
          placeholder="2026-03-11T14:30:00Z"
        />
        <InputField label="Duration (minutes)"   value={durationMinutes}     onChangeText={setDurationMinutes} />
        <InputField label="Clinician UUID (opt)" value={clinicianId}         onChangeText={setClinicianId} />
        <InputField label="Clinician name (opt)" value={clinicianName}       onChangeText={setClinicianName} />
        <InputField label="Clinician employee ID" value={clinicianEmployeeId} onChangeText={setClinicianEmployeeId} />
        <InputField label="Department code (opt)" value={departmentCode}      onChangeText={setDepartmentCode} />
        <InputField label="Department name (opt)" value={departmentName}      onChangeText={setDepartmentName} />
        <InputField label="Reason"               value={reason}              onChangeText={setReason} multiline />
        <InlineActions>
          <ActionButton label="Schedule"                onPress={scheduleAppointment} />
          <ActionButton label="Load today's"           onPress={loadToday}         variant="secondary" />
          <ActionButton label="Load assigned pending"   onPress={loadAssignedPending} variant="secondary" />
        </InlineActions>
        <MessageBanner message={message} tone={tone} />
      </Card>

      {/* Check-in */}
      <Card title="Pending / Check-In">
        <InputField
          label="Patient UUID (pending lookup)"
          value={lookupPatientId}
          onChangeText={setLookupPatientId}
          placeholder="Load pending appointments for one patient"
        />
        <InlineActions>
          <ActionButton label="Load pending for patient" onPress={loadPendingForPatient} />
        </InlineActions>
        <InputField label="Appointment UUID"      value={checkInAppointmentId} onChangeText={setCheckInAppointmentId} />
        <InputField label="Patient UUID"          value={checkInPatientId}     onChangeText={setCheckInPatientId} />
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
        <InputField label="Appointment UUID"          value={cancelAppointmentId} onChangeText={setCancelAppointmentId} />
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
              Appointment: {latestCheckIn.appointment.appointmentNumber || latestCheckIn.appointment.id}
            </Text>
            <Text style={{ color: T.textMid, fontSize: 13 }}>
              Hospital: {latestCheckIn.appointment.facilityName || "Current Facility"}
            </Text>
          </View>
          <JsonPanel value={latestCheckIn} />
        </Card>
      ) : null}

      {lastResponse && !latestCheckIn ? (
        <Card title="Last Action Response">
          <JsonPanel value={lastResponse} />
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
