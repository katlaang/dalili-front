import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { clinicalPortalApi } from "../../api/services";
import type { LabResultView, PatientResponse, ReferralView } from "../../api/types";
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
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import { formatDateOnly, formatDateTime, resolvePatientByInput, summarizeUnknown } from "./patientServiceUtils";

type ReferralTemplate =
  | "Specialist Consultation"
  | "Diagnostic Imaging"
  | "Higher-Level Care"
  | "Follow-Up Review"
  | "Custom";

const REFERRAL_TEMPLATES: readonly ReferralTemplate[] = [
  "Specialist Consultation",
  "Diagnostic Imaging",
  "Higher-Level Care",
  "Follow-Up Review",
  "Custom",
];

const REFERRAL_STATUSES = ["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"] as const;

interface ReferralsScreenProps {
  prefillPatientId?: string;
  prefillPatientName?: string;
  onPrefillConsumed?: () => void;
}

function buildReferralPreview(params: {
  template: ReferralTemplate;
  patient: PatientResponse | null;
  destination: string;
  specialty: string;
  reason: string;
  clinicalQuestion: string;
  customNarrative: string;
  sharePatientData: boolean;
  shareDemographics: boolean;
  shareContact: boolean;
  shareSummary: boolean;
  shareLabs: boolean;
  summary: Record<string, unknown> | null;
  labs: LabResultView[];
  destinationUsesDalili: boolean;
}) {
  const {
    template,
    patient,
    destination,
    specialty,
    reason,
    clinicalQuestion,
    customNarrative,
    sharePatientData,
    shareDemographics,
    shareContact,
    shareSummary,
    shareLabs,
    summary,
    labs,
    destinationUsesDalili,
  } = params;

  const sections: string[] = [];
  const lead = {
    "Specialist Consultation": `Please review ${patient?.fullName || "this patient"} for specialist consultation in ${specialty || "the requested specialty"}.`,
    "Diagnostic Imaging": `Please arrange diagnostic imaging support for ${patient?.fullName || "this patient"} to clarify the current clinical concern.`,
    "Higher-Level Care": `Please assess ${patient?.fullName || "this patient"} for transfer or escalation to a higher level of care.`,
    "Follow-Up Review": `Please review ${patient?.fullName || "this patient"} for follow-up assessment and continuity planning.`,
    Custom: customNarrative || `Referral requested for ${patient?.fullName || "this patient"}.`,
  }[template];

  sections.push(lead);

  if (destination || specialty) {
    sections.push(
      [
        destination ? `Receiving facility: ${destination}` : null,
        specialty ? `Requested service: ${specialty}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (reason) {
    sections.push(`Reason for referral:\n${reason}`);
  }

  if (clinicalQuestion) {
    sections.push(`Clinical question / handoff request:\n${clinicalQuestion}`);
  }

  if (sharePatientData && patient) {
    const patientSections: string[] = [];

    if (shareDemographics) {
      patientSections.push(
        [
          `Patient name: ${patient.fullName}`,
          `Patient ID: ${patient.mrn}`,
          `Date of birth: ${formatDateOnly(patient.dateOfBirth)}`,
          `Sex: ${patient.sex || "Unknown"}`,
        ].join("\n")
      );
    }

    if (shareContact) {
      const contactLines = [
        patient.phoneNumber ? `Phone: ${patient.phoneNumber}` : null,
        patient.email ? `Email: ${patient.email}` : null,
        patient.address ? `Address: ${patient.address}` : null,
        patient.emergencyContactName ? `Emergency contact: ${patient.emergencyContactName}` : null,
        patient.emergencyContactPhone ? `Emergency contact phone: ${patient.emergencyContactPhone}` : null,
      ].filter(Boolean);

      if (contactLines.length > 0) {
        patientSections.push(contactLines.join("\n"));
      }
    }

    if (shareSummary && summary) {
      const summaryLines = Object.entries(summary)
        .slice(0, 6)
        .map(([key, value]) => `${key.replace(/([a-z])([A-Z])/g, "$1 $2")}: ${summarizeUnknown(value)}`);
      if (summaryLines.length > 0) {
        patientSections.push(`Clinical summary:\n${summaryLines.join("\n")}`);
      }
    }

    if (shareLabs && labs.length > 0) {
      const labLines = labs.slice(0, 5).map((lab) =>
        [
          lab.testName,
          lab.resultValue ? `${lab.resultValue}${lab.unit ? ` ${lab.unit}` : ""}` : "No numeric result",
          lab.recordedAt ? `Recorded ${formatDateTime(lab.recordedAt)}` : null,
          lab.interpretation || null,
        ]
          .filter(Boolean)
          .join(" | ")
      );
      patientSections.push(`Attached data:\n${labLines.join("\n")}`);
    }

    if (patientSections.length > 0) {
      sections.push(patientSections.join("\n\n"));
    }
  }

  sections.push(
    destinationUsesDalili
      ? "Destination uses Dalili. Send the referral with in-system clinical handoff."
      : "Destination does not use Dalili. Prepare an external referral packet for printing or secure sharing."
  );

  return sections.filter(Boolean).join("\n\n");
}

export function ReferralsScreen({
  prefillPatientId,
  prefillPatientName,
  onPrefillConsumed,
}: ReferralsScreenProps) {
  const { apiContext } = useSession();
  const { theme: T } = useTheme();
  const [patientId, setPatientId] = useState("");
  const [resolvedPatient, setResolvedPatient] = useState<PatientResponse | null>(null);
  const [template, setTemplate] = useState<ReferralTemplate>("Specialist Consultation");
  const [destination, setDestination] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [reason, setReason] = useState("");
  const [clinicalQuestion, setClinicalQuestion] = useState("");
  const [customNarrative, setCustomNarrative] = useState("");
  const [destinationUsesDalili, setDestinationUsesDalili] = useState(true);
  const [sharePatientData, setSharePatientData] = useState(true);
  const [shareDemographics, setShareDemographics] = useState(true);
  const [shareContact, setShareContact] = useState(true);
  const [shareSummary, setShareSummary] = useState(true);
  const [shareLabs, setShareLabs] = useState(false);
  const [patientSummary, setPatientSummary] = useState<Record<string, unknown> | null>(null);
  const [patientLabs, setPatientLabs] = useState<LabResultView[]>([]);
  const [referrals, setReferrals] = useState<ReferralView[]>([]);
  const [printableReferral, setPrintableReferral] = useState<Record<string, unknown> | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    if (!prefillPatientId || !apiContext) {
      return;
    }

    resolvePatientByInput(apiContext, prefillPatientId)
      .then((patient) => {
        setResolvedPatient(patient);
        setPatientId(patient.mrn || prefillPatientId);
        setStatusMessage(`Patient ready: ${prefillPatientName || patient.fullName}`);
        setTone("success");
      })
      .catch((error) => {
        setPatientId(prefillPatientId);
        setStatusMessage(toErrorMessage(error));
        setTone("error");
      })
      .finally(() => onPrefillConsumed?.());
  }, [apiContext, onPrefillConsumed, prefillPatientId, prefillPatientName]);

  const previewText = useMemo(
    () =>
      buildReferralPreview({
        template,
        patient: resolvedPatient,
        destination,
        specialty,
        reason,
        clinicalQuestion,
        customNarrative,
        sharePatientData,
        shareDemographics,
        shareContact,
        shareSummary,
        shareLabs,
        summary: patientSummary,
        labs: patientLabs,
        destinationUsesDalili,
      }),
    [
      clinicalQuestion,
      customNarrative,
      destination,
      destinationUsesDalili,
      patientLabs,
      patientSummary,
      reason,
      resolvedPatient,
      shareContact,
      shareDemographics,
      shareLabs,
      sharePatientData,
      shareSummary,
      specialty,
      template,
    ]
  );

  if (!apiContext) {
    return (
      <Card title="Referrals">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  const showError = (error: unknown) => {
    setStatusMessage(toErrorMessage(error));
    setTone("error");
  };

  const showSuccess = (text: string) => {
    setStatusMessage(text);
    setTone("success");
  };

  const resolvePatientRecord = async () => {
    const patient = await resolvePatientByInput(apiContext, patientId);
    setResolvedPatient(patient);
    setPatientId(patient.mrn || patientId.trim());
    return patient;
  };

  const refreshPatientContext = async (patientOverride?: PatientResponse) => {
    const patient = patientOverride || (await resolvePatientRecord());
    const shouldLoadSummary = sharePatientData && shareSummary;
    const shouldLoadLabs = sharePatientData && shareLabs;

    const [summary, labs] = await Promise.all([
      shouldLoadSummary ? clinicalPortalApi.getOverview(apiContext, patient.id) : Promise.resolve(patientSummary),
      shouldLoadLabs ? clinicalPortalApi.getPatientLabs(apiContext, patient.id) : Promise.resolve(patientLabs),
    ]);

    setPatientSummary((summary || null) as Record<string, unknown> | null);
    setPatientLabs(labs || []);
    return { patient, summary: (summary || null) as Record<string, unknown> | null, labs: labs || [] };
  };

  const loadReferrals = async () => {
    try {
      const patient = await resolvePatientRecord();
      const list = await clinicalPortalApi.getPatientReferrals(apiContext, patient.id);
      setReferrals(list);
      setStatusDrafts((previous) =>
        list.reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = previous[item.id] || item.status || "PENDING";
          return acc;
        }, {})
      );
      showSuccess(`Loaded ${list.length} referral(s) for ${patient.fullName}`);
    } catch (error) {
      showError(error);
    }
  };

  const refreshReferralContext = async () => {
    try {
      await refreshPatientContext();
      showSuccess("Referral context refreshed");
    } catch (error) {
      showError(error);
    }
  };

  const createReferral = async () => {
    try {
      const patient = await resolvePatientRecord();
      let summary = patientSummary;
      let labs = patientLabs;

      if (sharePatientData && (shareSummary || shareLabs)) {
        const context = await refreshPatientContext(patient);
        summary = context.summary;
        labs = context.labs;
      }

      const notes = buildReferralPreview({
        template,
        patient,
        destination,
        specialty,
        reason,
        clinicalQuestion,
        customNarrative,
        sharePatientData,
        shareDemographics,
        shareContact,
        shareSummary,
        shareLabs,
        summary,
        labs,
        destinationUsesDalili,
      });

      const created = await clinicalPortalApi.addReferral(apiContext, patient.id, {
        referredToFacility: destination,
        specialty,
        reason,
        notes,
        destinationUsesDalili,
      });

      setReferrals((previous) => [created, ...previous]);
      setStatusDrafts((previous) => ({ ...previous, [created.id]: created.status || "PENDING" }));
      setPrintableReferral(null);
      showSuccess(`Referral created for ${patient.fullName}`);
    } catch (error) {
      showError(error);
    }
  };

  const previewExistingReferral = async (referralId: string) => {
    try {
      const result = await clinicalPortalApi.getPrintableReferral(apiContext, referralId);
      setPrintableReferral(result);
      showSuccess("Referral preview ready");
    } catch (error) {
      showError(error);
    }
  };

  const markPrinted = async (referralId: string) => {
    try {
      const updated = await clinicalPortalApi.markReferralPrinted(apiContext, referralId);
      setReferrals((previous) => previous.map((item) => (item.id === referralId ? updated : item)));
      showSuccess("Referral marked as printed");
    } catch (error) {
      showError(error);
    }
  };

  const updateReferralStatus = async (referralId: string) => {
    try {
      const nextStatus = statusDrafts[referralId] || "PENDING";
      const nextNotes = statusNotes[referralId] || undefined;
      const updated = await clinicalPortalApi.updateReferralStatus(apiContext, referralId, nextStatus, nextNotes);
      setReferrals((previous) => previous.map((item) => (item.id === referralId ? updated : item)));
      showSuccess("Referral status updated");
    } catch (error) {
      showError(error);
    }
  };

  return (
    <>
      <Card title="Referrals">
        <InputField
          label="Patient ID"
          value={patientId}
          onChangeText={(value) => {
            setPatientId(value);
            setResolvedPatient(null);
            setPatientSummary(null);
            setPatientLabs([]);
            setReferrals([]);
            setPrintableReferral(null);
          }}
        />

        {resolvedPatient ? (
          <View style={[styles.patientBanner, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
            <Text style={[styles.patientName, { color: T.text }]}>{resolvedPatient.fullName}</Text>
            <Text style={[styles.patientMeta, { color: T.textMid }]}>
              {resolvedPatient.mrn}  |  DOB {formatDateOnly(resolvedPatient.dateOfBirth)}
            </Text>
          </View>
        ) : null}

        <ChoiceChips
          label="Referral Template"
          options={REFERRAL_TEMPLATES}
          value={template}
          onChange={(value) => setTemplate(value as ReferralTemplate)}
        />

        <InputField label="Receiving Facility" value={destination} onChangeText={setDestination} />
        <InputField label="Requested Service / Specialty" value={specialty} onChangeText={setSpecialty} />
        <InputField
          label="Reason For Referral"
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder="Explain the clinical reason for referral."
        />
        <InputField
          label="Clinical Question / Handoff Request"
          value={clinicalQuestion}
          onChangeText={setClinicalQuestion}
          multiline
          placeholder="What should the receiving team assess or continue?"
        />

        {template === "Custom" ? (
          <InputField
            label="Custom Referral Narrative"
            value={customNarrative}
            onChangeText={setCustomNarrative}
            multiline
            placeholder="Write the exact referral wording you want to send."
          />
        ) : null}

        <ToggleField
          label="Receiving facility uses Dalili"
          value={destinationUsesDalili}
          onChange={setDestinationUsesDalili}
        />
        <ToggleField
          label="Include patient data with the referral"
          value={sharePatientData}
          onChange={setSharePatientData}
        />

        {sharePatientData ? (
          <View style={styles.dataOptions}>
            <ToggleField label="Include demographics" value={shareDemographics} onChange={setShareDemographics} />
            <ToggleField label="Include contact details" value={shareContact} onChange={setShareContact} />
            <ToggleField label="Include clinical summary" value={shareSummary} onChange={setShareSummary} />
            <ToggleField label="Include recent labs" value={shareLabs} onChange={setShareLabs} />
          </View>
        ) : null}

        <InlineActions>
          <ActionButton label="Refresh Referral Context" onPress={() => void refreshReferralContext()} variant="secondary" />
          <ActionButton label="Create Referral" onPress={() => void createReferral()} />
          <ActionButton label="View Existing Referrals" onPress={() => void loadReferrals()} variant="secondary" />
        </InlineActions>

        <MessageBanner message={statusMessage} tone={tone} />
      </Card>

      <Card title="Referral Preview">
        <Text style={[styles.previewText, { color: T.text }]}>{previewText || "Complete the referral form to generate a preview."}</Text>
      </Card>

      {printableReferral ? (
        <Card title="Printable Referral">
          <View style={styles.detailList}>
            {Object.entries(printableReferral).map(([key, value]) => (
              <View key={key} style={[styles.detailRow, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
                <Text style={[styles.detailLabel, { color: T.textMuted }]}>{key}</Text>
                <Text style={[styles.detailValue, { color: T.text }]}>{summarizeUnknown(value)}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card title="Referral History">
        {referrals.length > 0 ? (
          <View style={styles.referralList}>
            {referrals.map((referral) => (
              <View
                key={referral.id}
                style={[styles.referralCard, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}
              >
                <View style={styles.referralHeader}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.referralTitle, { color: T.text }]}>
                      {referral.specialty || "Referral"}  |  {referral.referredToFacility || "Destination pending"}
                    </Text>
                    <Text style={[styles.referralMeta, { color: T.textMid }]}>
                      {referral.status || "PENDING"}  |  {formatDateTime(referral.referredAt)}
                    </Text>
                  </View>
                  <Text style={[styles.patientMeta, { color: T.textMid }]}>ID {resolvedPatient?.mrn || patientId || "-"}</Text>
                </View>

                <Text style={[styles.referralBody, { color: T.text }]}>{referral.reason}</Text>
                {referral.notes ? (
                  <Text style={[styles.referralNotes, { color: T.textMid }]} numberOfLines={5}>
                    {referral.notes}
                  </Text>
                ) : null}

                <ChoiceChips
                  label="Update Status"
                  options={REFERRAL_STATUSES}
                  value={statusDrafts[referral.id] || referral.status || "PENDING"}
                  onChange={(value) => setStatusDrafts((previous) => ({ ...previous, [referral.id]: value }))}
                />

                <InputField
                  label="Status Note"
                  value={statusNotes[referral.id] || ""}
                  onChangeText={(value) => setStatusNotes((previous) => ({ ...previous, [referral.id]: value }))}
                  placeholder="Optional note for the receiving team or audit trail."
                />

                <InlineActions>
                  <ActionButton label="Preview Referral" onPress={() => void previewExistingReferral(referral.id)} variant="secondary" />
                  <ActionButton label="Mark Printed" onPress={() => void markPrinted(referral.id)} />
                  <ActionButton label="Save Status" onPress={() => void updateReferralStatus(referral.id)} variant="secondary" />
                </InlineActions>
              </View>
            ))}
          </View>
        ) : (
          <MessageBanner message="No referrals loaded yet." tone="info" />
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  patientBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  patientName: {
    fontSize: 16,
    fontWeight: "800",
  },
  patientMeta: {
    fontSize: 12,
  },
  dataOptions: {
    gap: 8,
  },
  previewText: {
    fontSize: 14,
    lineHeight: 22,
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
  referralList: {
    gap: 12,
  },
  referralCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  referralHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  referralTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  referralMeta: {
    fontSize: 12,
  },
  referralBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  referralNotes: {
    fontSize: 12,
    lineHeight: 18,
  },
});
