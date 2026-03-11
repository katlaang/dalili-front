import React, { useEffect, useMemo, useState } from "react";
import { facilityApi, queueApi } from "../../api/services";
import { queueCategoryOptions, queueViewOptions, triageLevelOptions } from "../../config/options";
import {
  ActionButton,
  Card,
  ChoiceChips,
  InlineActions,
  InputField,
  JsonPanel,
  MessageBanner
} from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

interface QueueScreenProps {
  onMoveToTriage?: (ticketId: string) => void;
  onMoveToEncounter?: (ticketId: string) => void;
}

const extractTicketId = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || !("id" in value)) {
    return null;
  }
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
};

export function QueueScreen({ onMoveToTriage, onMoveToEncounter }: QueueScreenProps) {
  const { apiContext, role } = useSession();
  const isReceptionist = role === "RECEPTIONIST";
  const [emergencyFlowEnabled, setEmergencyFlowEnabled] = useState(true);
  const [appointmentFlowEnabled, setAppointmentFlowEnabled] = useState(true);
  const [queueKind, setQueueKind] = useState<(typeof queueViewOptions)[number]>("waiting");
  const [queueRows, setQueueRows] = useState<unknown[]>([]);
  const [queueStats, setQueueStats] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "success">("success");

  const [issuePatientId, setIssuePatientId] = useState("");
  const [issueCategory, setIssueCategory] = useState("GENERAL");
  const [issueComplaint, setIssueComplaint] = useState("");
  const [issueEmergency, setIssueEmergency] = useState(false);

  const [counterTriage, setCounterTriage] = useState("Triage Room 1");
  const [counterConsultation, setCounterConsultation] = useState("Consult Room 1");

  const [ticketId, setTicketId] = useState("");
  const [ticketCounter, setTicketCounter] = useState("Desk 1");
  const [escalationLevel, setEscalationLevel] = useState("ORANGE");
  const [escalationReason, setEscalationReason] = useState("");
  const [admissionReason, setAdmissionReason] = useState("");
  const [outcomePhysicalExam, setOutcomePhysicalExam] = useState("");
  const [triageOutcome, setTriageOutcome] = useState<unknown>(null);
  const [latestTicket, setLatestTicket] = useState<unknown>(null);
  const [handoffClinicianName, setHandoffClinicianName] = useState("");
  const [handoffClinicianEmployeeId, setHandoffClinicianEmployeeId] = useState("");
  const [handoffClinicianUserId, setHandoffClinicianUserId] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");

  const availableCategoryOptions = useMemo(
    () =>
      queueCategoryOptions.filter(
        (category) =>
          (emergencyFlowEnabled || category !== "EMERGENCY") &&
          (appointmentFlowEnabled || category !== "FOLLOW_UP")
      ),
    [appointmentFlowEnabled, emergencyFlowEnabled]
  );

  if (!apiContext) {
    return (
      <Card title="Queue">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  useEffect(() => {
    if (!apiContext) {
      return;
    }
    facilityApi
      .getWorkflowConfig(apiContext)
      .then((config) => {
        setEmergencyFlowEnabled(config.emergencyFlowEnabled);
        setAppointmentFlowEnabled(config.appointmentFlowEnabled);
      })
      .catch((error) => {
        setMessage(toErrorMessage(error));
        setTone("error");
      });
  }, [apiContext]);

  useEffect(() => {
    if (!availableCategoryOptions.length) {
      return;
    }
    if (!availableCategoryOptions.includes(issueCategory as (typeof availableCategoryOptions)[number])) {
      setIssueCategory(availableCategoryOptions[0]);
    }
  }, [availableCategoryOptions, issueCategory]);

  useEffect(() => {
    if (!emergencyFlowEnabled && issueEmergency) {
      setIssueEmergency(false);
    }
  }, [emergencyFlowEnabled, issueEmergency]);

  const showError = (error: unknown) => {
    setMessage(toErrorMessage(error));
    setTone("error");
  };

  const showSuccess = (text: string) => {
    setMessage(text);
    setTone("success");
  };

  const loadQueue = async () => {
    try {
      const data = await queueApi.getQueue(apiContext, queueKind);
      setQueueRows(data);
      showSuccess(`Loaded ${queueKind} queue`);
    } catch (error) {
      showError(error);
    }
  };

  const loadStats = async () => {
    try {
      const stats = await queueApi.getStats(apiContext);
      setQueueStats(stats);
      showSuccess("Queue stats loaded");
    } catch (error) {
      showError(error);
    }
  };

  const issueTicket = async () => {
    try {
      if (issueEmergency && !emergencyFlowEnabled) {
        throw new Error("Emergency workflow is disabled for this facility");
      }
      const ticket = issueEmergency
        ? await queueApi.issueEmergencyTicket(apiContext, {
            patientId: issuePatientId.trim(),
            initialComplaint: issueComplaint
          })
        : await queueApi.issueTicket(apiContext, {
            patientId: issuePatientId.trim(),
            category: issueCategory,
            initialComplaint: isReceptionist ? null : issueComplaint || null
          });
      setLatestTicket(ticket);
      setTicketId(ticket.id);
      showSuccess(issueEmergency ? "Emergency ticket issued" : "Queue ticket issued");
    } catch (error) {
      showError(error);
    }
  };

  const callNextTriage = async () => {
    try {
      const ticket = await queueApi.callNextTriage(apiContext, counterTriage);
      setLatestTicket(ticket);
      setTicketId(ticket.id);
      showSuccess("Called next triage patient");
    } catch (error) {
      showError(error);
    }
  };

  const callNextConsultation = async () => {
    try {
      const ticket = await queueApi.callNextConsultation(apiContext, counterConsultation);
      setLatestTicket(ticket);
      setTicketId(ticket.id);
      showSuccess("Called next consultation patient");
    } catch (error) {
      showError(error);
    }
  };

  const callNextConsultationAndOpen = async () => {
    try {
      const ticket = await queueApi.callNextConsultation(apiContext, counterConsultation);
      setLatestTicket(ticket);
      setTicketId(ticket.id);
      onMoveToEncounter?.(ticket.id);
      showSuccess("Called next consultation patient and moved to encounter workflow");
    } catch (error) {
      showError(error);
    }
  };

  const callSpecific = async () => {
    try {
      const ticket = await queueApi.callTicket(apiContext, ticketId.trim(), ticketCounter);
      setLatestTicket(ticket);
      showSuccess("Called specific patient");
    } catch (error) {
      showError(error);
    }
  };

  const runTicketAction = async (action: "missed" | "start" | "return_waiting" | "complete" | "admit" | "no_show" | "cancel") => {
    try {
      const id = ticketId.trim();
      let ticket: unknown;

      if (action === "missed") {
        ticket = await queueApi.markMissedCall(apiContext, id);
      } else if (action === "start") {
        ticket = await queueApi.startTicket(apiContext, id);
      } else if (action === "return_waiting") {
        ticket = await queueApi.returnToWaiting(apiContext, id);
      } else if (action === "complete") {
        ticket = await queueApi.completeTicket(apiContext, id);
      } else if (action === "admit") {
        ticket = await queueApi.admitTicket(apiContext, id, admissionReason || undefined);
      } else if (action === "no_show") {
        ticket = await queueApi.markNoShow(apiContext, id);
      } else {
        ticket = await queueApi.cancelTicket(apiContext, id);
      }

      setLatestTicket(ticket);
      showSuccess(`Ticket action completed: ${action}`);
    } catch (error) {
      showError(error);
    }
  };

  const escalate = async () => {
    try {
      const ticket = await queueApi.escalateTicket(apiContext, ticketId.trim(), escalationLevel, escalationReason);
      setLatestTicket(ticket);
      showSuccess("Ticket escalated");
    } catch (error) {
      showError(error);
    }
  };

  const loadTriageOutcome = async () => {
    try {
      const id = ticketId.trim();
      if (!id) {
        throw new Error("Ticket UUID is required");
      }
      const outcome = await queueApi.getTriageOutcome(apiContext, id, outcomePhysicalExam || undefined);
      setTriageOutcome(outcome);
      const refreshedQueue = await queueApi.getQueue(apiContext, queueKind);
      setQueueRows(refreshedQueue);
      showSuccess("Triage outcome synced to queue with suggested diagnoses");
    } catch (error) {
      showError(error);
    }
  };

  const handoffToClinician = async () => {
    try {
      const id = ticketId.trim();
      if (!id) {
        throw new Error("Ticket UUID is required");
      }
      const ticket = await queueApi.handoffToClinician(apiContext, id, {
        clinicianName: handoffClinicianName.trim(),
        clinicianEmployeeId: handoffClinicianEmployeeId.trim(),
        clinicianUserId: handoffClinicianUserId.trim() || null,
        handoffNotes: handoffNotes || null
      });
      setLatestTicket(ticket);
      showSuccess("Triage handoff to clinician recorded");
    } catch (error) {
      showError(error);
    }
  };

  const continueToTriage = () => {
    const id = ticketId.trim() || extractTicketId(latestTicket);
    if (!id) {
      showError(new Error("Ticket UUID is required"));
      return;
    }
    setTicketId(id);
    onMoveToTriage?.(id);
    showSuccess("Moved to triage workflow with selected ticket");
  };

  const continueToEncounter = () => {
    const id = ticketId.trim() || extractTicketId(latestTicket);
    if (!id) {
      showError(new Error("Ticket UUID is required"));
      return;
    }
    setTicketId(id);
    onMoveToEncounter?.(id);
    showSuccess("Moved to encounter workflow with selected ticket");
  };

  return (
    <>
      <Card title="Queue Overview">
        <ChoiceChips label="Queue View" options={queueViewOptions} value={queueKind} onChange={(value) => setQueueKind(value as typeof queueKind)} />
        <InlineActions>
          <ActionButton label="Load Queue" onPress={loadQueue} />
          <ActionButton label="Load Stats" onPress={loadStats} variant="secondary" />
        </InlineActions>
        <MessageBanner message={message} tone={tone} />
      </Card>

      <Card title="Issue Ticket">
        <InputField label="Patient UUID" value={issuePatientId} onChangeText={setIssuePatientId} />
        <ChoiceChips label="Category" options={availableCategoryOptions} value={issueCategory} onChange={setIssueCategory} />
        {!emergencyFlowEnabled ? (
          <MessageBanner message="Emergency workflow is currently disabled by facility configuration." tone="error" />
        ) : null}
        {!appointmentFlowEnabled ? (
          <MessageBanner message="Appointment/follow-up workflow is currently disabled by facility configuration." tone="error" />
        ) : null}
        {isReceptionist ? (
          <MessageBanner
            message="Reception role privacy mode: symptoms/complaints are not collected before triage."
            tone="success"
          />
        ) : (
          <InputField label="Complaint" value={issueComplaint} onChangeText={setIssueComplaint} multiline />
        )}
        <InlineActions>
          <ActionButton
            label={issueEmergency ? "Issue Emergency Ticket" : "Issue Standard Ticket"}
            onPress={issueTicket}
            variant={issueEmergency ? "danger" : "primary"}
          />
          {!isReceptionist && emergencyFlowEnabled ? (
            <ActionButton
              label={issueEmergency ? "Switch to Standard" : "Switch to Emergency"}
              onPress={() => setIssueEmergency((value) => !value)}
              variant="ghost"
            />
          ) : null}
        </InlineActions>
      </Card>

      <Card title="Call Next">
        <InputField label="Triage Counter" value={counterTriage} onChangeText={setCounterTriage} />
        <InlineActions>
          <ActionButton label="Call Next Triage" onPress={callNextTriage} />
        </InlineActions>
        <InputField label="Consultation Counter" value={counterConsultation} onChangeText={setCounterConsultation} />
        <InlineActions>
          <ActionButton label="Call Next Consultation" onPress={callNextConsultation} variant="secondary" />
          <ActionButton label="Call Next + Open Encounter" onPress={callNextConsultationAndOpen} variant="secondary" />
        </InlineActions>
      </Card>

      <Card title="Ticket Actions">
        <InputField label="Ticket UUID" value={ticketId} onChangeText={setTicketId} />
        <InputField label="Assigned Clinician Name" value={handoffClinicianName} onChangeText={setHandoffClinicianName} />
        <InputField
          label="Assigned Clinician Employee ID"
          value={handoffClinicianEmployeeId}
          onChangeText={setHandoffClinicianEmployeeId}
        />
        <InputField
          label="Assigned Clinician User UUID (optional)"
          value={handoffClinicianUserId}
          onChangeText={setHandoffClinicianUserId}
        />
        <InputField label="Handoff Notes (optional)" value={handoffNotes} onChangeText={setHandoffNotes} multiline />
        <InlineActions>
          <ActionButton label="Handoff to Clinician" onPress={handoffToClinician} />
        </InlineActions>
        <InputField label="Counter for specific call" value={ticketCounter} onChangeText={setTicketCounter} />
        <InlineActions>
          <ActionButton label="Call Specific Ticket" onPress={callSpecific} />
          <ActionButton label="Missed Call" onPress={() => runTicketAction("missed")} variant="ghost" />
          <ActionButton label="Start Session" onPress={() => runTicketAction("start")} variant="secondary" />
          <ActionButton label="Return to Waiting" onPress={() => runTicketAction("return_waiting")} variant="secondary" />
          <ActionButton label="Complete Session" onPress={() => runTicketAction("complete")} variant="secondary" />
          <ActionButton label="Admit Patient" onPress={() => runTicketAction("admit")} variant="secondary" />
          <ActionButton label="No-Show" onPress={() => runTicketAction("no_show")} variant="danger" />
          <ActionButton label="Cancel Ticket" onPress={() => runTicketAction("cancel")} variant="danger" />
        </InlineActions>
        <InlineActions>
          <ActionButton label="Continue to Triage" onPress={continueToTriage} variant="secondary" />
          <ActionButton label="Continue to Encounter" onPress={continueToEncounter} variant="secondary" />
        </InlineActions>
        <InputField label="Admission Reason (optional)" value={admissionReason} onChangeText={setAdmissionReason} multiline />
        <ChoiceChips label="Escalate to" options={triageLevelOptions} value={escalationLevel} onChange={setEscalationLevel} />
        <InputField label="Escalation Reason" value={escalationReason} onChangeText={setEscalationReason} multiline />
        <InlineActions>
          <ActionButton label="Escalate Priority" onPress={escalate} variant="danger" />
        </InlineActions>
        <InputField
          label="Outcome Physical Exam (optional)"
          value={outcomePhysicalExam}
          onChangeText={setOutcomePhysicalExam}
          multiline
        />
        <InlineActions>
          <ActionButton label="Sync Triage Outcome to Queue" onPress={loadTriageOutcome} />
        </InlineActions>
      </Card>

      {queueRows.length ? (
        <Card title={`Queue Rows (${queueRows.length})`}>
          <JsonPanel value={queueRows} />
        </Card>
      ) : null}

      {queueStats ? (
        <Card title="Queue Stats">
          <JsonPanel value={queueStats} />
        </Card>
      ) : null}

      {latestTicket ? (
        <Card title="Latest Ticket Response">
          <JsonPanel value={latestTicket} />
        </Card>
      ) : null}

      {triageOutcome ? (
        <Card title="Triage Outcome (Queue + Suggested Diagnosis)">
          <JsonPanel value={triageOutcome} />
        </Card>
      ) : null}
    </>
  );
}
