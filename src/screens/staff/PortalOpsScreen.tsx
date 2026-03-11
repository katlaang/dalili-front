import React, { useState } from "react";
import { clinicalPortalApi } from "../../api/services";
import { ActionButton, Card, InlineActions, InputField, JsonPanel, MessageBanner, ToggleField } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

export function PortalOpsScreen() {
  const { apiContext } = useSession();
  const [patientId, setPatientId] = useState("");
  const [justification, setJustification] = useState("");
  const [nokApproverName, setNokApproverName] = useState("");
  const [nokName, setNokName] = useState("");
  const [nokPhone, setNokPhone] = useState("");
  const [nokRelationship, setNokRelationship] = useState("");
  const [scope, setScope] = useState<unknown>(null);
  const [overview, setOverview] = useState<unknown>(null);
  const [emergencyData, setEmergencyData] = useState<unknown>(null);
  const [pendingRenewals, setPendingRenewals] = useState<unknown>(null);
  const [pendingTransfers, setPendingTransfers] = useState<unknown>(null);
  const [reviewRequestId, setReviewRequestId] = useState("");
  const [reviewComments, setReviewComments] = useState("");
  const [inbox, setInbox] = useState<unknown>(null);
  const [messageIdToMarkRead, setMessageIdToMarkRead] = useState("");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [patientLabs, setPatientLabs] = useState<unknown>(null);
  const [patientReferrals, setPatientReferrals] = useState<unknown>(null);
  const [labTestName, setLabTestName] = useState("");
  const [labResult, setLabResult] = useState("");
  const [referralFacility, setReferralFacility] = useState("");
  const [referralSpecialty, setReferralSpecialty] = useState("");
  const [referralReason, setReferralReason] = useState("");
  const [referralStatus, setReferralStatus] = useState("COMPLETED");
  const [referralStatusNotes, setReferralStatusNotes] = useState("");
  const [referralDestinationUsesDalili, setReferralDestinationUsesDalili] = useState(true);
  const [referralIdForPrint, setReferralIdForPrint] = useState("");
  const [printableReferral, setPrintableReferral] = useState<unknown>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");

  if (!apiContext) {
    return (
      <Card title="Portal Ops">
        <MessageBanner message="No authenticated session." tone="error" />
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

  const loadScope = async () => {
    try {
      const data = await clinicalPortalApi.getScope(apiContext, patientId.trim());
      setScope(data);
      showSuccess("Access scope loaded");
    } catch (error) {
      showError(error);
    }
  };

  const loadOverview = async () => {
    try {
      const data = await clinicalPortalApi.getOverview(apiContext, patientId.trim());
      setOverview(data);
      showSuccess("Patient overview loaded");
    } catch (error) {
      showError(error);
    }
  };

  const loadEmergencyData = async () => {
    try {
      const data = await clinicalPortalApi.getEmergencyData(apiContext, patientId.trim());
      setEmergencyData(data);
      showSuccess("Emergency data loaded");
    } catch (error) {
      showError(error);
    }
  };

  const breakGlass = async () => {
    try {
      const data = await clinicalPortalApi.breakGlass(apiContext, patientId.trim(), justification);
      setLastResponse(data);
      showSuccess("Emergency break-glass recorded");
    } catch (error) {
      showError(error);
    }
  };

  const recordNokApproval = async () => {
    try {
      const data = await clinicalPortalApi.nextOfKinApproval(apiContext, patientId.trim(), {
        approverName: nokApproverName || undefined,
        nextOfKinName: nokName,
        nextOfKinPhone: nokPhone || undefined,
        relationship: nokRelationship || undefined,
        verificationMethod: "VERBAL_CONFIRMED"
      });
      setLastResponse(data);
      showSuccess("Next-of-kin approval recorded");
    } catch (error) {
      showError(error);
    }
  };

  const loadPendingQueues = async () => {
    try {
      const [renewals, transfers] = await Promise.all([
        clinicalPortalApi.getPendingRenewals(apiContext),
        clinicalPortalApi.getPendingTransfers(apiContext)
      ]);
      setPendingRenewals(renewals);
      setPendingTransfers(transfers);
      showSuccess("Pending renewals and transfers loaded");
    } catch (error) {
      showError(error);
    }
  };

  const approveRenewal = async () => {
    try {
      const data = await clinicalPortalApi.reviewRenewal(apiContext, reviewRequestId.trim(), true, reviewComments || undefined);
      setLastResponse(data);
      showSuccess("Renewal approved");
    } catch (error) {
      showError(error);
    }
  };

  const rejectRenewal = async () => {
    try {
      const data = await clinicalPortalApi.reviewRenewal(apiContext, reviewRequestId.trim(), false, reviewComments || undefined);
      setLastResponse(data);
      showSuccess("Renewal rejected");
    } catch (error) {
      showError(error);
    }
  };

  const approveTransfer = async () => {
    try {
      const data = await clinicalPortalApi.reviewTransfer(apiContext, reviewRequestId.trim(), true, reviewComments || undefined);
      setLastResponse(data);
      showSuccess("Transfer approved");
    } catch (error) {
      showError(error);
    }
  };

  const rejectTransfer = async () => {
    try {
      const data = await clinicalPortalApi.reviewTransfer(apiContext, reviewRequestId.trim(), false, reviewComments || undefined);
      setLastResponse(data);
      showSuccess("Transfer rejected");
    } catch (error) {
      showError(error);
    }
  };

  const loadInbox = async () => {
    try {
      const data = await clinicalPortalApi.getInbox(apiContext, patientId.trim() || undefined);
      setInbox(data);
      showSuccess("Clinician inbox loaded");
    } catch (error) {
      showError(error);
    }
  };

  const markInboxMessageRead = async () => {
    try {
      const id = messageIdToMarkRead.trim();
      if (!id) {
        throw new Error("Message UUID is required");
      }
      const data = await clinicalPortalApi.markMessageRead(apiContext, id);
      setLastResponse(data);
      await loadInbox();
      showSuccess("Inbox message marked as read");
    } catch (error) {
      showError(error);
    }
  };

  const loadPatientLabs = async () => {
    try {
      const data = await clinicalPortalApi.getPatientLabs(apiContext, patientId.trim());
      setPatientLabs(data);
      showSuccess("Patient labs loaded");
    } catch (error) {
      showError(error);
    }
  };

  const loadPatientReferrals = async () => {
    try {
      const data = await clinicalPortalApi.getPatientReferrals(apiContext, patientId.trim());
      setPatientReferrals(data);
      showSuccess("Patient referrals loaded");
    } catch (error) {
      showError(error);
    }
  };

  const sendMessageToPatient = async () => {
    try {
      const data = await clinicalPortalApi.sendToPatient(apiContext, patientId.trim(), {
        category: "GENERAL",
        subject: messageSubject || undefined,
        body: messageBody
      });
      setLastResponse(data);
      showSuccess("Message sent to patient");
    } catch (error) {
      showError(error);
    }
  };

  const addLab = async () => {
    try {
      const data = await clinicalPortalApi.addLab(apiContext, patientId.trim(), {
        testName: labTestName,
        resultValue: labResult,
        criticalResult: false
      });
      setLastResponse(data);
      showSuccess("Lab result added");
    } catch (error) {
      showError(error);
    }
  };

  const addReferral = async () => {
    try {
      const data = await clinicalPortalApi.addReferral(apiContext, patientId.trim(), {
        referredToFacility: referralFacility,
        specialty: referralSpecialty,
        reason: referralReason,
        destinationUsesDalili: referralDestinationUsesDalili
      });
      setLastResponse(data);
      showSuccess("Referral added");
    } catch (error) {
      showError(error);
    }
  };

  const loadPrintableReferral = async () => {
    try {
      const data = await clinicalPortalApi.getPrintableReferral(apiContext, referralIdForPrint.trim());
      setPrintableReferral(data);
      showSuccess("Printable referral loaded");
    } catch (error) {
      showError(error);
    }
  };

  const markReferralPrinted = async () => {
    try {
      const data = await clinicalPortalApi.markReferralPrinted(apiContext, referralIdForPrint.trim());
      setLastResponse(data);
      showSuccess("Referral marked as printed");
    } catch (error) {
      showError(error);
    }
  };

  const updateReferralStatus = async () => {
    try {
      const id = referralIdForPrint.trim();
      if (!id) {
        throw new Error("Referral UUID is required");
      }
      const data = await clinicalPortalApi.updateReferralStatus(apiContext, id, referralStatus, referralStatusNotes || undefined);
      setLastResponse(data);
      showSuccess("Referral status updated");
    } catch (error) {
      showError(error);
    }
  };

  return (
    <>
      <Card title="Patient Data Access Controls">
        <InputField label="Patient UUID" value={patientId} onChangeText={setPatientId} />
        <InlineActions>
          <ActionButton label="Load Scope" onPress={loadScope} />
          <ActionButton label="Load Overview" onPress={loadOverview} variant="secondary" />
          <ActionButton label="Load Emergency Data" onPress={loadEmergencyData} variant="secondary" />
        </InlineActions>
        <InputField label="Emergency Justification" value={justification} onChangeText={setJustification} multiline />
        <InlineActions>
          <ActionButton label="Break-Glass Access" onPress={breakGlass} variant="danger" />
        </InlineActions>
        <InputField label="NOK Approver Name" value={nokApproverName} onChangeText={setNokApproverName} />
        <InputField label="Next of Kin Name" value={nokName} onChangeText={setNokName} />
        <InputField label="Next of Kin Phone" value={nokPhone} onChangeText={setNokPhone} />
        <InputField label="Relationship" value={nokRelationship} onChangeText={setNokRelationship} />
        <InlineActions>
          <ActionButton label="Record NOK Approval" onPress={recordNokApproval} />
        </InlineActions>
        <MessageBanner message={message} tone={tone} />
      </Card>

      <Card title="Pending Reviews">
        <InlineActions>
          <ActionButton label="Load Pending Renewals/Transfers" onPress={loadPendingQueues} />
        </InlineActions>
        <InputField label="Request UUID (Renewal or Transfer)" value={reviewRequestId} onChangeText={setReviewRequestId} />
        <InputField label="Review Comments" value={reviewComments} onChangeText={setReviewComments} multiline />
        <InlineActions>
          <ActionButton label="Approve Renewal" onPress={approveRenewal} />
          <ActionButton label="Reject Renewal" onPress={rejectRenewal} variant="danger" />
        </InlineActions>
        <InlineActions>
          <ActionButton label="Approve Transfer" onPress={approveTransfer} />
          <ActionButton label="Reject Transfer" onPress={rejectTransfer} variant="danger" />
        </InlineActions>
      </Card>

      <Card title="Messaging & Clinical Records">
        <InlineActions>
          <ActionButton label="Load Inbox" onPress={loadInbox} />
          <ActionButton label="Load Patient Labs" onPress={loadPatientLabs} variant="secondary" />
          <ActionButton label="Load Patient Referrals" onPress={loadPatientReferrals} variant="secondary" />
        </InlineActions>
        <InputField
          label="Inbox Message UUID to Mark Read"
          value={messageIdToMarkRead}
          onChangeText={setMessageIdToMarkRead}
        />
        <InputField label="Message Subject" value={messageSubject} onChangeText={setMessageSubject} />
        <InputField label="Message Body" value={messageBody} onChangeText={setMessageBody} multiline />
        <InlineActions>
          <ActionButton label="Send Message to Patient" onPress={sendMessageToPatient} />
          <ActionButton label="Mark Inbox Message Read" onPress={markInboxMessageRead} variant="secondary" />
        </InlineActions>
        <InputField label="Lab Test Name" value={labTestName} onChangeText={setLabTestName} />
        <InputField label="Lab Result" value={labResult} onChangeText={setLabResult} />
        <InlineActions>
          <ActionButton label="Add Lab Result" onPress={addLab} />
        </InlineActions>
        <InputField label="Referral Facility" value={referralFacility} onChangeText={setReferralFacility} />
        <InputField label="Referral Specialty" value={referralSpecialty} onChangeText={setReferralSpecialty} />
        <InputField label="Referral Reason" value={referralReason} onChangeText={setReferralReason} multiline />
        <ToggleField
          label="Destination uses Dalili system"
          value={referralDestinationUsesDalili}
          onChange={setReferralDestinationUsesDalili}
        />
        <InlineActions>
          <ActionButton label="Add Referral" onPress={addReferral} />
        </InlineActions>
        <InputField
          label="Referral UUID for Printable/Print"
          value={referralIdForPrint}
          onChangeText={setReferralIdForPrint}
        />
        <InputField
          label="Referral Status"
          value={referralStatus}
          onChangeText={setReferralStatus}
          placeholder="PENDING / ACCEPTED / COMPLETED / CANCELLED"
        />
        <InputField
          label="Referral Status Notes (optional)"
          value={referralStatusNotes}
          onChangeText={setReferralStatusNotes}
          multiline
        />
        <InlineActions>
          <ActionButton label="Load Printable Referral" onPress={loadPrintableReferral} variant="secondary" />
          <ActionButton label="Mark Referral Printed" onPress={markReferralPrinted} />
          <ActionButton label="Update Referral Status" onPress={updateReferralStatus} variant="secondary" />
        </InlineActions>
      </Card>

      {scope ? (
        <Card title="Access Scope">
          <JsonPanel value={scope} />
        </Card>
      ) : null}

      {overview ? (
        <Card title="Patient Overview">
          <JsonPanel value={overview} />
        </Card>
      ) : null}

      {emergencyData ? (
        <Card title="Emergency Data">
          <JsonPanel value={emergencyData} />
        </Card>
      ) : null}

      {pendingRenewals ? (
        <Card title="Pending Renewals">
          <JsonPanel value={pendingRenewals} />
        </Card>
      ) : null}

      {pendingTransfers ? (
        <Card title="Pending Transfers">
          <JsonPanel value={pendingTransfers} />
        </Card>
      ) : null}

      {inbox ? (
        <Card title="Clinician Inbox">
          <JsonPanel value={inbox} />
        </Card>
      ) : null}

      {patientLabs ? (
        <Card title="Patient Labs">
          <JsonPanel value={patientLabs} />
        </Card>
      ) : null}

      {patientReferrals ? (
        <Card title="Patient Referrals">
          <JsonPanel value={patientReferrals} />
        </Card>
      ) : null}

      {printableReferral ? (
        <Card title="Printable Referral">
          <JsonPanel value={printableReferral} />
        </Card>
      ) : null}

      {lastResponse ? (
        <Card title="Last Action Response">
          <JsonPanel value={lastResponse} />
        </Card>
      ) : null}
    </>
  );
}
