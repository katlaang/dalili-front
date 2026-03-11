import React, { useState } from "react";
import { Text } from "react-native";
import type { FacilityWorkflowConfig } from "../../api/types";
import { authApi, facilityApi, healthApi, queueApi } from "../../api/services";
import { staffRoleOptions } from "../../config/options";
import { ActionButton, Card, ChoiceChips, InlineActions, InputField, JsonPanel, MessageBanner, ToggleField } from "../../components/ui";
import { useSession } from "../../state/session";
import { colors } from "../../constants/theme";
import { toErrorMessage } from "../../utils/format";

export function OverviewScreen() {
  const { apiContext, baseUrl, username, role } = useSession();
  const isSuperAdmin = role === "SUPER_ADMIN";
  const canProvisionStaff = role === "ADMIN" || role === "SUPER_ADMIN";
  const [healthData, setHealthData] = useState<unknown>(null);
  const [auditHealthData, setAuditHealthData] = useState<unknown>(null);
  const [queueStats, setQueueStats] = useState<unknown>(null);
  const [workflowConfig, setWorkflowConfig] = useState<FacilityWorkflowConfig | null>(null);
  const [workflowDraft, setWorkflowDraft] = useState<FacilityWorkflowConfig | null>(null);
  const [newStaffUsername, setNewStaffUsername] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffFullName, setNewStaffFullName] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("RECEPTIONIST");
  const [staffProvisionResult, setStaffProvisionResult] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadHealth = async () => {
    try {
      setMessage(null);
      const [health, audit] = await Promise.all([healthApi.getHealth(baseUrl), healthApi.getAuditHealth(baseUrl)]);
      setHealthData(health);
      setAuditHealthData(audit);
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  };

  const loadQueueStats = async () => {
    if (!apiContext) {
      return;
    }
    try {
      setMessage(null);
      const stats = await queueApi.getStats(apiContext);
      setQueueStats(stats);
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  };

  const loadWorkflowConfig = async () => {
    if (!apiContext) {
      return;
    }
    try {
      setMessage(null);
      const config = await facilityApi.getWorkflowConfig(apiContext);
      setWorkflowConfig(config);
      setWorkflowDraft(config);
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  };

  const updateWorkflowBoolean = (field: keyof FacilityWorkflowConfig, value: boolean) => {
    setWorkflowDraft((previous) => (previous ? { ...previous, [field]: value } : previous));
  };

  const updateWorkflowNumber = (field: keyof FacilityWorkflowConfig, raw: string) => {
    const parsed = Number(raw);
    setWorkflowDraft((previous) => (previous ? { ...previous, [field]: Number.isFinite(parsed) ? parsed : 0 } : previous));
  };

  const saveWorkflowConfig = async () => {
    if (!apiContext || !workflowDraft) {
      return;
    }
    try {
      setMessage(null);
      const updated = await facilityApi.updateWorkflowConfig(apiContext, {
        emergencyFlowEnabled: workflowDraft.emergencyFlowEnabled,
        appointmentFlowEnabled: workflowDraft.appointmentFlowEnabled,
        kioskEnabled: workflowDraft.kioskEnabled,
        qrCheckInEnabled: workflowDraft.qrCheckInEnabled,
        patientPortalEnabled: workflowDraft.patientPortalEnabled,
        prescriptionRenewalEnabled: workflowDraft.prescriptionRenewalEnabled,
        aiTranscriptionEnabled: workflowDraft.aiTranscriptionEnabled,
        aiDifferentialEnabled: workflowDraft.aiDifferentialEnabled,
        crossFacilityDataEnabled: workflowDraft.crossFacilityDataEnabled,
        referralPrintingEnabled: workflowDraft.referralPrintingEnabled,
        appointmentCheckInWindowMinutes: workflowDraft.appointmentCheckInWindowMinutes,
        appointmentPriorityBoostEnabled: workflowDraft.appointmentPriorityBoostEnabled,
        appointmentPriorityBoostMinutesBefore: workflowDraft.appointmentPriorityBoostMinutesBefore,
        appointmentPriorityBoostMinutesAfter: workflowDraft.appointmentPriorityBoostMinutesAfter,
        consentValidityHours: workflowDraft.consentValidityHours,
        requireTriageForAppointments: workflowDraft.requireTriageForAppointments
      });
      setWorkflowConfig(updated);
      setWorkflowDraft(updated);
      setMessage("Facility workflow flags saved");
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  };

  const registerStaff = async () => {
    if (!apiContext) {
      return;
    }
    try {
      setMessage(null);
      const result = await authApi.registerStaff(apiContext, {
        username: newStaffUsername.trim(),
        password: newStaffPassword,
        fullName: newStaffFullName,
        role: newStaffRole
      });
      setStaffProvisionResult(result);
      setMessage("Staff account registered");
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  };

  return (
    <>
      <Card title="Session Snapshot">
        <Text style={{ color: colors.text }}>Signed in as: {username || "unknown"}</Text>
        <Text style={{ color: colors.text }}>API URL: {baseUrl}</Text>
        <Text style={{ color: colors.text }}>Role: {role || "unknown"}</Text>
      </Card>

      <Card title="Operational Checks">
        <InlineActions>
          <ActionButton label="Load Health Endpoints" onPress={loadHealth} />
          <ActionButton label="Load Queue Stats" onPress={loadQueueStats} variant="secondary" />
          {isSuperAdmin ? (
            <ActionButton label="Load Workflow Flags" onPress={loadWorkflowConfig} variant="secondary" />
          ) : null}
        </InlineActions>
        <MessageBanner message={message} tone="error" />
      </Card>

      {isSuperAdmin && workflowDraft ? (
        <Card title="Facility Workflow Flags (Super Admin)">
          <ToggleField
            label="Emergency Flow Enabled"
            value={workflowDraft.emergencyFlowEnabled}
            onChange={(value) => updateWorkflowBoolean("emergencyFlowEnabled", value)}
          />
          <ToggleField
            label="Appointment Flow Enabled"
            value={workflowDraft.appointmentFlowEnabled}
            onChange={(value) => updateWorkflowBoolean("appointmentFlowEnabled", value)}
          />
          <ToggleField
            label="Kiosk Enabled"
            value={workflowDraft.kioskEnabled}
            onChange={(value) => updateWorkflowBoolean("kioskEnabled", value)}
          />
          <ToggleField
            label="QR Check-In Enabled"
            value={workflowDraft.qrCheckInEnabled}
            onChange={(value) => updateWorkflowBoolean("qrCheckInEnabled", value)}
          />
          <ToggleField
            label="Patient Portal Enabled"
            value={workflowDraft.patientPortalEnabled}
            onChange={(value) => updateWorkflowBoolean("patientPortalEnabled", value)}
          />
          <ToggleField
            label="Prescription Renewal Enabled"
            value={workflowDraft.prescriptionRenewalEnabled}
            onChange={(value) => updateWorkflowBoolean("prescriptionRenewalEnabled", value)}
          />
          <ToggleField
            label="AI Transcription Enabled"
            value={workflowDraft.aiTranscriptionEnabled}
            onChange={(value) => updateWorkflowBoolean("aiTranscriptionEnabled", value)}
          />
          <ToggleField
            label="AI Differential Enabled"
            value={workflowDraft.aiDifferentialEnabled}
            onChange={(value) => updateWorkflowBoolean("aiDifferentialEnabled", value)}
          />
          <ToggleField
            label="Cross Facility Data Enabled"
            value={workflowDraft.crossFacilityDataEnabled}
            onChange={(value) => updateWorkflowBoolean("crossFacilityDataEnabled", value)}
          />
          <ToggleField
            label="Referral Printing Enabled"
            value={workflowDraft.referralPrintingEnabled}
            onChange={(value) => updateWorkflowBoolean("referralPrintingEnabled", value)}
          />
          <ToggleField
            label="Appointment Priority Boost Enabled"
            value={workflowDraft.appointmentPriorityBoostEnabled}
            onChange={(value) => updateWorkflowBoolean("appointmentPriorityBoostEnabled", value)}
          />
          <ToggleField
            label="Require Triage For Appointments"
            value={workflowDraft.requireTriageForAppointments}
            onChange={(value) => updateWorkflowBoolean("requireTriageForAppointments", value)}
          />
          <InputField
            label="Appointment Check-In Window Minutes"
            value={String(workflowDraft.appointmentCheckInWindowMinutes)}
            onChangeText={(value) => updateWorkflowNumber("appointmentCheckInWindowMinutes", value)}
          />
          <InputField
            label="Appointment Priority Boost Minutes Before"
            value={String(workflowDraft.appointmentPriorityBoostMinutesBefore)}
            onChangeText={(value) => updateWorkflowNumber("appointmentPriorityBoostMinutesBefore", value)}
          />
          <InputField
            label="Appointment Priority Boost Minutes After"
            value={String(workflowDraft.appointmentPriorityBoostMinutesAfter)}
            onChangeText={(value) => updateWorkflowNumber("appointmentPriorityBoostMinutesAfter", value)}
          />
          <InputField
            label="Consent Validity Hours"
            value={String(workflowDraft.consentValidityHours)}
            onChangeText={(value) => updateWorkflowNumber("consentValidityHours", value)}
          />
          <InlineActions>
            <ActionButton label="Save Workflow Flags" onPress={saveWorkflowConfig} />
            <ActionButton label="Reload Current Flags" onPress={loadWorkflowConfig} variant="secondary" />
          </InlineActions>
        </Card>
      ) : null}

      {canProvisionStaff ? (
        <Card title="Staff Provisioning">
          <InputField label="Username" value={newStaffUsername} onChangeText={setNewStaffUsername} />
          <InputField label="Password" value={newStaffPassword} onChangeText={setNewStaffPassword} secureTextEntry />
          <InputField label="Full Name" value={newStaffFullName} onChangeText={setNewStaffFullName} />
          <ChoiceChips label="Role" options={staffRoleOptions} value={newStaffRole} onChange={setNewStaffRole} />
          <InlineActions>
            <ActionButton label="Register Staff User" onPress={registerStaff} />
          </InlineActions>
        </Card>
      ) : null}

      {healthData ? (
        <Card title="GET /health">
          <JsonPanel value={healthData} />
        </Card>
      ) : null}

      {auditHealthData ? (
        <Card title="GET /audit/health">
          <JsonPanel value={auditHealthData} />
        </Card>
      ) : null}

      {queueStats ? (
        <Card title="GET /api/queue/stats">
          <JsonPanel value={queueStats} />
        </Card>
      ) : null}

      {workflowConfig ? (
        <Card title="Current Facility Workflow Flags">
          <JsonPanel value={workflowConfig} />
        </Card>
      ) : null}

      {staffProvisionResult ? (
        <Card title="Staff Provision Result">
          <JsonPanel value={staffProvisionResult} />
        </Card>
      ) : null}
    </>
  );
}
