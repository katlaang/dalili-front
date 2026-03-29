import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { clinicalPortalApi } from "../../api/services";
import type { PatientResponse } from "../../api/types";
import { AccessReasonModal, ActionButton, Card, InlineActions, InputField, MessageBanner, useTheme } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import { formatDateOnly, formatFieldLabel, resolvePatientByInput, summarizeUnknown } from "./patientServiceUtils";

interface PatientAccessScreenProps {
  prefillPatientId?: string;
  prefillPatientName?: string;
  onPrefillConsumed?: () => void;
}

function KeyValueCard({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  const { theme: T } = useTheme();

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return (
      <Card title={title}>
        <Text style={{ color: T.text }}>{summarizeUnknown(value)}</Text>
      </Card>
    );
  }

  return (
    <Card title={title}>
      <View style={styles.detailList}>
        {Object.entries(value).map(([key, entry]) => (
          <View
            key={key}
            style={[styles.detailRow, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}
          >
            <Text style={[styles.detailLabel, { color: T.textMuted }]}>{formatFieldLabel(key)}</Text>
            <Text style={[styles.detailValue, { color: T.text }]}>{summarizeUnknown(entry)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function PatientAccessScreen({
  prefillPatientId,
  prefillPatientName,
  onPrefillConsumed,
}: PatientAccessScreenProps) {
  const { apiContext } = useSession();
  const { theme: T } = useTheme();
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
  const [lastAuthorization, setLastAuthorization] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");
  const [pendingProtectedAction, setPendingProtectedAction] = useState<"scope" | "overview" | "emergency" | null>(null);

  useEffect(() => {
    if (!prefillPatientId || !apiContext) {
      return;
    }

    resolvePatientByInput(apiContext, prefillPatientId)
      .then(patient => {
        setPatientId(patient.mrn || prefillPatientId);
        setResolvedPatient(patient);
        setMessage(`Patient ready: ${prefillPatientName || patient.fullName}`);
        setTone("success");
      })
      .catch(error => {
        setPatientId(prefillPatientId);
        setMessage(toErrorMessage(error));
        setTone("error");
      })
      .finally(() => onPrefillConsumed?.());
  }, [apiContext, onPrefillConsumed, prefillPatientId, prefillPatientName]);

  if (!apiContext) {
    return (
      <Card title="Patient Access">
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

  const resolvePatientRecord = async () => {
    const patient = await resolvePatientByInput(apiContext, patientId);
    setResolvedPatient(patient);
    setPatientId(patient.mrn || patientId.trim());
    return patient;
  };

  const performProtectedAction = async (action: "scope" | "overview" | "emergency", reason: string, detail?: string) => {
    try {
      const patient = await resolvePatientRecord();
      await clinicalPortalApi.recordChartAccess(apiContext, patient.id, {
        reason,
        detail: detail || null,
        viewedArea: "Patient Access",
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
        showSuccess("Patient access checked and logged");
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
      setLastAuthorization(data);
      showSuccess("Emergency access recorded");
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
        verificationMethod: "VERBAL_CONFIRMED",
      });
      setLastAuthorization(data);
      showSuccess("Next-of-kin approval recorded");
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
            void performProtectedAction(pendingProtectedAction, reason, detail);
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
          <View style={[styles.patientBanner, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
            <View>
              <Text style={[styles.patientName, { color: T.text }]}>{resolvedPatient.fullName}</Text>
              <Text style={[styles.patientMeta, { color: T.textMid }]}>
                {resolvedPatient.mrn}  |  DOB {formatDateOnly(resolvedPatient.dateOfBirth)}
              </Text>
            </View>
          </View>
        ) : null}

        <InlineActions>
          <ActionButton label="Check Access" onPress={() => setPendingProtectedAction("scope")} />
          <ActionButton label="View Summary" onPress={() => setPendingProtectedAction("overview")} variant="secondary" />
          <ActionButton label="View Emergency Details" onPress={() => setPendingProtectedAction("emergency")} variant="secondary" />
        </InlineActions>

        <InputField
          label="Emergency Justification"
          value={justification}
          onChangeText={setJustification}
          multiline
          placeholder="Why do you need emergency-only access?"
        />
        <InlineActions>
          <ActionButton label="Record Emergency Access" onPress={breakGlass} variant="danger" />
        </InlineActions>

        <InputField label="Approver Name" value={nokApproverName} onChangeText={setNokApproverName} />
        <InputField label="Next of Kin Name" value={nokName} onChangeText={setNokName} />
        <InputField label="Next of Kin Phone" value={nokPhone} onChangeText={setNokPhone} />
        <InputField label="Relationship" value={nokRelationship} onChangeText={setNokRelationship} />
        <InlineActions>
          <ActionButton label="Record Next-of-Kin Approval" onPress={recordNokApproval} />
        </InlineActions>

        <MessageBanner message={message} tone={tone} />
      </Card>

      {scope ? <KeyValueCard title="Access Decision" value={scope} /> : null}
      {overview ? <KeyValueCard title="Patient Summary" value={overview} /> : null}
      {emergencyData ? <KeyValueCard title="Emergency Data" value={emergencyData} /> : null}
      {lastAuthorization ? <KeyValueCard title="Latest Authorization" value={lastAuthorization} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  patientBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  patientName: {
    fontSize: 16,
    fontWeight: "800",
  },
  patientMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  detailList: {
    gap: 10,
  },
  detailRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 20,
  },
});
