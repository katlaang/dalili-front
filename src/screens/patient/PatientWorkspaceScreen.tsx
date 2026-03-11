import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { patientAppointmentApi, patientPortalApi } from "../../api/services";
import type { AppointmentCheckInResponse, AppointmentView, EncounterNoteView, LabResultView, ReferralView } from "../../api/types";
import { ActionButton, Card, InlineActions, InputField, JsonPanel, MessageBanner, ToggleField } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import type { CheckInDeepLinkPrefill } from "../../hooks/useCheckInDeepLink";

interface PatientWorkspaceScreenProps {
  deepLinkCheckInPrefill?: CheckInDeepLinkPrefill | null;
}

export function PatientWorkspaceScreen({ deepLinkCheckInPrefill }: PatientWorkspaceScreenProps) {
  const { apiContext } = useSession();
  const [labs, setLabs] = useState<LabResultView[]>([]);
  const [referrals, setReferrals] = useState<ReferralView[]>([]);
  const [notes, setNotes] = useState<EncounterNoteView[]>([]);
  const [pendingAppointments, setPendingAppointments] = useState<AppointmentView[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [complaint, setComplaint] = useState("");
  const [consentForDataAccess, setConsentForDataAccess] = useState(true);
  const [checkInResponse, setCheckInResponse] = useState<AppointmentCheckInResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");

  const formatDateTime = (value?: string) => {
    if (!value) {
      return "Not set";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString();
  };

  useEffect(() => {
    if (!deepLinkCheckInPrefill) {
      return;
    }
    if (deepLinkCheckInPrefill.complaint != null) {
      setComplaint(deepLinkCheckInPrefill.complaint);
    }
    if (deepLinkCheckInPrefill.consentForDataAccess != null) {
      setConsentForDataAccess(deepLinkCheckInPrefill.consentForDataAccess);
    }
  }, [deepLinkCheckInPrefill?.receivedAt]);

  if (!apiContext) {
    return (
      <Card title="Patient Portal">
        <MessageBanner message="No authenticated patient session." tone="error" />
      </Card>
    );
  }

  const showError = (error: unknown) => {
    setMessage(toErrorMessage(error));
    setTone("error");
  };

  const showSuccess = (text: string) => {
    setMessage(text);
    setTone("success");
  };

  const loadResults = async () => {
    try {
      const [labsData, referralsData, notesData] = await Promise.all([
        patientPortalApi.getLabs(apiContext),
        patientPortalApi.getReferrals(apiContext),
        patientPortalApi.getNotes(apiContext)
      ]);
      setLabs(labsData);
      setReferrals(referralsData);
      setNotes(notesData);
      showSuccess("Results loaded");
    } catch (error) {
      showError(error);
    }
  };

  const loadPendingAppointments = async () => {
    try {
      const pending = await patientAppointmentApi.getPending(apiContext);
      setPendingAppointments(pending);
      if (pending.length) {
        setSelectedAppointmentId(pending[0].id);
      }
      showSuccess(`Loaded ${pending.length} pending appointment(s)`);
    } catch (error) {
      showError(error);
    }
  };

  const confirmAppointment = async () => {
    try {
      const appointmentId = selectedAppointmentId.trim();
      if (!appointmentId) {
        throw new Error("Appointment ID is required");
      }
      const result = await patientAppointmentApi.checkIn(apiContext, appointmentId, {
        complaint: complaint.trim() || undefined,
        consentForDataAccess
      });
      setCheckInResponse(result);
      showSuccess(`Appointment confirmed. Queue number: ${result.queueTicket.ticketNumber}`);
      await loadPendingAppointments();
    } catch (error) {
      showError(error);
    }
  };

  return (
    <>
      <Card title="Patient Portal">
        <MessageBanner
          message="Patient portal access is limited to viewing results and confirming appointments."
          tone="info"
        />
        <MessageBanner message={message} tone={tone} />
      </Card>

      <Card title="View Results">
        <InlineActions>
          <ActionButton label="Load Results" onPress={loadResults} />
        </InlineActions>
      </Card>

      <Card title="Confirm Appointment">
        <InputField label="Selected Appointment ID" value={selectedAppointmentId} onChangeText={setSelectedAppointmentId} />
        <InputField label="Complaint (optional)" value={complaint} onChangeText={setComplaint} multiline />
        <ToggleField
          label="Consent for same-hospital historical data access"
          value={consentForDataAccess}
          onChange={setConsentForDataAccess}
        />
        <InlineActions>
          <ActionButton label="Load Pending Appointments" onPress={loadPendingAppointments} variant="secondary" />
          <ActionButton label="Confirm Appointment" onPress={confirmAppointment} />
        </InlineActions>
        {pendingAppointments.length ? (
          <View style={{ gap: 10 }}>
            {pendingAppointments.map((appointment) => (
              <View
                key={appointment.id}
                style={{
                  borderWidth: 1,
                  borderColor: "#d8d2c8",
                  borderRadius: 10,
                  padding: 10,
                  gap: 4,
                  backgroundColor: selectedAppointmentId === appointment.id ? "#eef7f4" : "#fff"
                }}
              >
                <Text style={{ fontWeight: "700" }}>
                  {appointment.appointmentNumber || appointment.id}
                </Text>
                <Text>Date/Time: {formatDateTime(appointment.scheduledAt)}</Text>
                <Text>Hospital: {appointment.facilityName || "Current Facility"}</Text>
                <Text>Doctor: {appointment.clinicianName || "Unassigned"}</Text>
                <Text>Reason: {appointment.reason || "Not provided"}</Text>
                <Text>Status: {appointment.status}</Text>
                <InlineActions>
                  <ActionButton
                    label="Select"
                    onPress={() => setSelectedAppointmentId(appointment.id)}
                    variant={selectedAppointmentId === appointment.id ? "primary" : "secondary"}
                  />
                </InlineActions>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {checkInResponse ? (
        <Card title="Queue Number Issued">
          <Text style={{ fontWeight: "700", fontSize: 20 }}>{checkInResponse.queueTicket.ticketNumber}</Text>
          <Text>Appointment: {checkInResponse.appointment.appointmentNumber || checkInResponse.appointment.id}</Text>
          <Text>Hospital: {checkInResponse.appointment.facilityName || "Current Facility"}</Text>
        </Card>
      ) : null}

      {labs.length ? (
        <Card title="Lab Results">
          <JsonPanel value={labs} />
        </Card>
      ) : null}

      {referrals.length ? (
        <Card title="Referral Results">
          <JsonPanel value={referrals} />
        </Card>
      ) : null}

      {notes.length ? (
        <Card title="Doctor Notes">
          <JsonPanel value={notes} />
        </Card>
      ) : null}
    </>
  );
}
