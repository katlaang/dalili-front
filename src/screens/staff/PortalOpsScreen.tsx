import React, { useEffect, useState } from "react";
import { clinicalPortalApi, patientApi } from "../../api/services";
import type { PatientResponse } from "../../api/types";
import { AccessReasonModal, ActionButton, Card, InlineActions, InputField, JsonPanel, MessageBanner, ToggleField } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

interface PortalOpsScreenProps {
  prefillPatientId?: string;
  prefillPatientName?: string;
  onPrefillConsumed?: () => void;
}

export function PortalOpsScreen({
  prefillPatientId,
  prefillPatientName,
  onPrefillConsumed
}: PortalOpsScreenProps) {
  const { apiContext, role } = useSession();
  const [patientId, setPatientId] = useState("");
  const [resolvedPatient, setResolvedPatient] = useState<PatientResponse | null>(null);
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
  const [pendingProtectedAction, setPendingProtectedAction] = useState<"scope" | "overview" | "emergency" | null>(null);

  useEffect(() => {
    if (!prefillPatientId) {
      return;
    }
    setPatientId(prefillPatientId);
    setMessage(`Patient ready: ${prefillPatientName || prefillPatientId}`);
    setTone("success");
    onPrefillConsumed?.();
  }, [onPrefillConsumed, prefillPatientId, prefillPatientName]);

  if (!apiContext) {
    return (
      <Card title="Patient Services">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  if (role === "NURSE") {
    return (
      <Card title="Patient Services">
        <MessageBanner message="This workspace is not part of the nurse workflow." tone="info" />
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

  const resolvePatientRecord = async (rawValue = patientId) => {
    const value = rawValue.trim();
    if (!value) {
      throw new Error("Patient ID is required");
    }

    try {
      const patient = await patientApi.getByMrn(apiContext, value);
      setResolvedPatient(patient);
      setPatientId(patient.mrn || value);
      return patient;
    } catch {
      try {
        const patient = await patientApi.getById(apiContext, value);
        setResolvedPatient(patient);
        setPatientId(patient.mrn || value);
        return patient;
      } catch {
        throw new Error("Patient not found. Use the patient ID from registration or lookup.");
      }
    }
  };

  const runProtectedAction = async (action: "scope" | "overview" | "emergency", reason: string, detail?: string) => {
    try {
      const patient = await resolvePatientRecord();
      await clinicalPortalApi.recordChartAccess(apiContext, patient.id, {
        reason,
        detail: detail || null,
        viewedArea: "Portal Operations",
        viewedResource:
          action === "scope"
            ? "Access Decision"
            : action === "overview"
              ? "Patient Summary"
              : "Emergency Data",
        accessScope: action === "emergency" ? "EMERGENCY" : "CLINICAL_SUMMARY",
      });
      if (action === "scope") {
        const data = await clinicalPortalApi.getScope(apiContext, patient.id);
        setScope(data);
        showSuccess("Access checked and logged");
      } else if (action === "overview") {
        const data = await clinicalPortalApi.getOverview(apiContext, patient.id);
        setOverview(data);
        showSuccess("Patient summary opened and logged");
      } else {
        const data = await clinicalPortalApi.getEmergencyData(apiContext, patient.id);
        setEmergencyData(data);
        showSuccess("Emergency details opened and logged");
      }
      setPendingProtectedAction(null);
    } catch (error) {
      showError(error);
    }
  };

  const breakGlass = async () => {
    try {
      const patient = await resolvePatientRecord();
      const data = await clinicalPortalApi.breakGlass(apiContext, patient.id, justification);
      setLastResponse(data);
      showSuccess("Emergency break-glass recorded");
    } catch (error) {
      showError(error);
    }
  };

  const recordNokApproval = async () => {
    try {
      const patient = await resolvePatientRecord();
      const data = await clinicalPortalApi.nextOfKinApproval(apiContext, patient.id, {
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
      showSuccess("Pending requests ready");
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

  const loadPatientLabs = async () => {
    try {
      const patient = await resolvePatientRecord();
      const data = await clinicalPortalApi.getPatientLabs(apiContext, patient.id);
      setPatientLabs(data);
      showSuccess("Lab results ready");
    } catch (error) {
      showError(error);
    }
  };

  const loadPatientReferrals = async () => {
    try {
      const patient = await resolvePatientRecord();
      const data = await clinicalPortalApi.getPatientReferrals(apiContext, patient.id);
      setPatientReferrals(data);
      showSuccess("Referrals ready");
    } catch (error) {
      showError(error);
    }
  };

  const addLab = async () => {
    try {
      const patient = await resolvePatientRecord();
      const data = await clinicalPortalApi.addLab(apiContext, patient.id, {
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
      const patient = await resolvePatientRecord();
      const data = await clinicalPortalApi.addReferral(apiContext, patient.id, {
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
      showSuccess("Referral preview ready");
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
        throw new Error("Referral ID is required");
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
      <AccessReasonModal
        visible={pendingProtectedAction !== null}
        title="Open Protected Patient Data"
        patientLabel={resolvedPatient ? `${resolvedPatient.fullName} (${resolvedPatient.mrn})` : undefined}
        resourceLabel={
          pendingProtectedAction === "scope"
            ? "Access Decision"
            : pendingProtectedAction === "overview"
              ? "Patient Summary"
              : pendingProtectedAction === "emergency"
                ? "Emergency Data"
                : undefined
        }
        confirmLabel="Log Access and Open"
        onCancel={() => setPendingProtectedAction(null)}
        onConfirm={({ reason, detail }) => {
          if (pendingProtectedAction) {
            void runProtectedAction(pendingProtectedAction, reason, detail);
          }
        }}
      />

      <Card title="Patient Access">
        <InputField
          label="Patient ID"
          value={patientId}
          onChangeText={(value) => {
            setPatientId(value);
            setResolvedPatient(null);
          }}
        />
        {resolvedPatient ? (
          <MessageBanner
            message={`Selected patient: ${resolvedPatient.fullName} · ${resolvedPatient.mrn}`}
            tone="info"
          />
        ) : null}
        <InlineActions>
          <ActionButton label="Check Access" onPress={() => setPendingProtectedAction("scope")} />
          <ActionButton label="View Summary" onPress={() => setPendingProtectedAction("overview")} variant="secondary" />
          <ActionButton label="View Emergency Details" onPress={() => setPendingProtectedAction("emergency")} variant="secondary" />
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

      <Card title="Requests">
        <InlineActions>
          <ActionButton label="Review Pending Requests" onPress={loadPendingQueues} />
        </InlineActions>
        <InputField label="Request ID" value={reviewRequestId} onChangeText={setReviewRequestId} />
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

      <Card title="Clinical Records">
        <MessageBanner
          message="Patient messaging has moved to the dedicated Messages tab. Use this screen for clinical records and referral operations."
          tone="info"
        />
        <InlineActions>
          <ActionButton label="Review Lab Results" onPress={loadPatientLabs} variant="secondary" />
          <ActionButton label="Review Referrals" onPress={loadPatientReferrals} variant="secondary" />
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
          label="Referral ID"
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
          <ActionButton label="Preview Referral" onPress={loadPrintableReferral} variant="secondary" />
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
