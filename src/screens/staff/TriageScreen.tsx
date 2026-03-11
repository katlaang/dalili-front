import React, { useEffect, useState } from "react";
import { queueApi, triageApi } from "../../api/services";
import { consciousnessOptions, triageLevelOptions } from "../../config/options";
import {
  ActionButton,
  Card,
  ChoiceChips,
  InlineActions,
  InputField,
  JsonPanel,
  MessageBanner,
  ToggleField
} from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

interface VitalsForm {
  temperatureCelsius: string;
  heartRateBpm: string;
  bloodPressureSystolic: string;
  bloodPressureDiastolic: string;
  respiratoryRate: string;
  oxygenSaturation: string;
  weightKg: string;
  heightCm: string;
  painScore: string;
  bloodGlucoseMmol: string;
  consciousnessLevel: string;
}

const defaultVitals: VitalsForm = {
  temperatureCelsius: "",
  heartRateBpm: "",
  bloodPressureSystolic: "",
  bloodPressureDiastolic: "",
  respiratoryRate: "",
  oxygenSaturation: "",
  weightKg: "",
  heightCm: "",
  painScore: "",
  bloodGlucoseMmol: "",
  consciousnessLevel: "ALERT"
};

interface RedFlagsForm {
  chestPain: boolean;
  difficultyBreathing: boolean;
  strokeSymptoms: boolean;
  severebleeding: boolean;
  allergicReaction: boolean;
  alteredMentalStatus: boolean;
  pregnancyConcern: boolean;
  severeAbdominalPain: boolean;
}

const defaultRedFlags: RedFlagsForm = {
  chestPain: false,
  difficultyBreathing: false,
  strokeSymptoms: false,
  severebleeding: false,
  allergicReaction: false,
  alteredMentalStatus: false,
  pregnancyConcern: false,
  severeAbdominalPain: false
};

const parseNullableNumber = (value: string): number | undefined => {
  if (!value.trim()) {
    return undefined;
  }
  return Number(value);
};

interface TriageScreenProps {
  initialQueueTicketId?: string;
  initialAssessmentId?: string;
  onAssessmentLinked?: (payload: { queueTicketId: string; assessmentId: string }) => void;
  onMoveToEncounter?: (queueTicketId: string) => void;
}

export function TriageScreen({
  initialQueueTicketId,
  initialAssessmentId,
  onAssessmentLinked,
  onMoveToEncounter
}: TriageScreenProps) {
  const { apiContext } = useSession();
  const [queueTicketId, setQueueTicketId] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [vitals, setVitals] = useState<VitalsForm>(defaultVitals);
  const [redFlags, setRedFlags] = useState<RedFlagsForm>(defaultRedFlags);
  const [historyOfPresentIllness, setHistoryOfPresentIllness] = useState("");
  const [allergies, setAllergies] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");
  const [pastMedicalHistory, setPastMedicalHistory] = useState("");
  const [nursingNotes, setNursingNotes] = useState("");
  const [overrideLevel, setOverrideLevel] = useState("ORANGE");
  const [overrideReason, setOverrideReason] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [outcomePhysicalExam, setOutcomePhysicalExam] = useState("");
  const [outcome, setOutcome] = useState<unknown>(null);
  const [handoffClinicianName, setHandoffClinicianName] = useState("");
  const [handoffClinicianEmployeeId, setHandoffClinicianEmployeeId] = useState("");
  const [handoffClinicianUserId, setHandoffClinicianUserId] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "success">("success");

  useEffect(() => {
    if (initialQueueTicketId && initialQueueTicketId !== queueTicketId) {
      setQueueTicketId(initialQueueTicketId);
    }
  }, [initialQueueTicketId, queueTicketId]);

  useEffect(() => {
    if (initialAssessmentId && initialAssessmentId !== assessmentId) {
      setAssessmentId(initialAssessmentId);
    }
  }, [assessmentId, initialAssessmentId]);

  if (!apiContext) {
    return (
      <Card title="Triage">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  const updateVitals = (key: keyof VitalsForm, value: string) => {
    setVitals((previous) => ({ ...previous, [key]: value }));
  };

  const updateFlag = (key: keyof RedFlagsForm, value: boolean) => {
    setRedFlags((previous) => ({ ...previous, [key]: value }));
  };

  const showError = (error: unknown) => {
    setMessage(toErrorMessage(error));
    setTone("error");
  };

  const showSuccess = (text: string) => {
    setMessage(text);
    setTone("success");
  };

  const beginAssessment = async () => {
    try {
      const assessment = await triageApi.beginAssessment(apiContext, queueTicketId.trim(), chiefComplaint);
      setAssessmentId(assessment.id);
      setResult(assessment);
      onAssessmentLinked?.({ queueTicketId: queueTicketId.trim(), assessmentId: assessment.id });
      showSuccess("Triage assessment started");
    } catch (error) {
      showError(error);
    }
  };

  const beginReassessment = async () => {
    try {
      const assessment = await triageApi.beginReassessment(apiContext, queueTicketId.trim());
      setAssessmentId(assessment.id);
      setResult(assessment);
      onAssessmentLinked?.({ queueTicketId: queueTicketId.trim(), assessmentId: assessment.id });
      showSuccess("Reassessment started");
    } catch (error) {
      showError(error);
    }
  };

  const loadAssessment = async () => {
    try {
      const assessment = await triageApi.getAssessment(apiContext, assessmentId.trim());
      setResult(assessment);
      onAssessmentLinked?.({ queueTicketId: queueTicketId.trim(), assessmentId: assessment.id });
      showSuccess("Assessment loaded");
    } catch (error) {
      showError(error);
    }
  };

  const recordVitals = async () => {
    try {
      const assessment = await triageApi.recordVitals(apiContext, assessmentId.trim(), {
        temperatureCelsius: parseNullableNumber(vitals.temperatureCelsius),
        heartRateBpm: parseNullableNumber(vitals.heartRateBpm),
        bloodPressureSystolic: parseNullableNumber(vitals.bloodPressureSystolic),
        bloodPressureDiastolic: parseNullableNumber(vitals.bloodPressureDiastolic),
        respiratoryRate: parseNullableNumber(vitals.respiratoryRate),
        oxygenSaturation: parseNullableNumber(vitals.oxygenSaturation),
        weightKg: parseNullableNumber(vitals.weightKg),
        heightCm: parseNullableNumber(vitals.heightCm),
        painScore: parseNullableNumber(vitals.painScore),
        bloodGlucoseMmol: parseNullableNumber(vitals.bloodGlucoseMmol),
        consciousnessLevel: vitals.consciousnessLevel
      });
      setResult(assessment);
      showSuccess("Vitals recorded");
    } catch (error) {
      showError(error);
    }
  };

  const recordRedFlags = async () => {
    try {
      const assessment = await triageApi.recordRedFlags(apiContext, assessmentId.trim(), redFlags);
      setResult(assessment);
      showSuccess("Red flags recorded");
    } catch (error) {
      showError(error);
    }
  };

  const recordObservations = async () => {
    try {
      const assessment = await triageApi.recordObservations(apiContext, assessmentId.trim(), {
        historyOfPresentIllness,
        allergies,
        currentMedications,
        pastMedicalHistory,
        nursingNotes
      });
      setResult(assessment);
      showSuccess("Observations recorded");
    } catch (error) {
      showError(error);
    }
  };

  const accept = async () => {
    try {
      const assessment = await triageApi.acceptSystemTriage(apiContext, assessmentId.trim());
      setResult(assessment);
      showSuccess("System triage accepted");
    } catch (error) {
      showError(error);
    }
  };

  const override = async () => {
    try {
      const assessment = await triageApi.overrideTriage(apiContext, assessmentId.trim(), {
        newTriageLevel: overrideLevel,
        reason: overrideReason
      });
      setResult(assessment);
      showSuccess("Triage overridden");
    } catch (error) {
      showError(error);
    }
  };

  const loadSummary = async () => {
    try {
      const response = await triageApi.getSummary(apiContext, assessmentId.trim());
      setSummary(response.summary);
      showSuccess("Summary loaded");
    } catch (error) {
      showError(error);
    }
  };

  const loadOutcome = async () => {
    try {
      const response = await triageApi.getOutcome(apiContext, assessmentId.trim(), outcomePhysicalExam || undefined);
      setOutcome(response);
      showSuccess("Triage outcome synced (queue impact + suggested diagnoses)");
    } catch (error) {
      showError(error);
    }
  };

  const proceedToEncounter = () => {
    const id = queueTicketId.trim();
    if (!id) {
      showError(new Error("Queue ticket UUID is required"));
      return;
    }
    onMoveToEncounter?.(id);
    showSuccess("Moved to encounters workflow with this queue ticket");
  };

  const handoffToClinician = async () => {
    try {
      const ticket = await queueApi.handoffToClinician(apiContext, queueTicketId.trim(), {
        clinicianName: handoffClinicianName.trim(),
        clinicianEmployeeId: handoffClinicianEmployeeId.trim(),
        clinicianUserId: handoffClinicianUserId.trim() || null,
        handoffNotes: handoffNotes || null
      });
      showSuccess(`Handoff recorded to ${ticket.assignedClinicianName || handoffClinicianName}`);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <>
      <Card title="Assessment Start">
        <InputField label="Queue Ticket UUID" value={queueTicketId} onChangeText={setQueueTicketId} />
        <InputField label="Chief Complaint" value={chiefComplaint} onChangeText={setChiefComplaint} multiline />
        <InlineActions>
          <ActionButton label="Begin Assessment" onPress={beginAssessment} />
          <ActionButton label="Begin Reassessment" onPress={beginReassessment} variant="secondary" />
        </InlineActions>
        <InputField label="Assessment UUID" value={assessmentId} onChangeText={setAssessmentId} />
        <InlineActions>
          <ActionButton label="Load Assessment" onPress={loadAssessment} variant="ghost" />
        </InlineActions>
        <MessageBanner message={message} tone={tone} />
      </Card>

      <Card title="Vital Signs">
        <InputField label="Temperature C" value={vitals.temperatureCelsius} onChangeText={(value) => updateVitals("temperatureCelsius", value)} />
        <InputField label="Heart Rate BPM" value={vitals.heartRateBpm} onChangeText={(value) => updateVitals("heartRateBpm", value)} />
        <InputField
          label="Blood Pressure Systolic"
          value={vitals.bloodPressureSystolic}
          onChangeText={(value) => updateVitals("bloodPressureSystolic", value)}
        />
        <InputField
          label="Blood Pressure Diastolic"
          value={vitals.bloodPressureDiastolic}
          onChangeText={(value) => updateVitals("bloodPressureDiastolic", value)}
        />
        <InputField
          label="Respiratory Rate"
          value={vitals.respiratoryRate}
          onChangeText={(value) => updateVitals("respiratoryRate", value)}
        />
        <InputField
          label="Oxygen Saturation"
          value={vitals.oxygenSaturation}
          onChangeText={(value) => updateVitals("oxygenSaturation", value)}
        />
        <InputField label="Weight Kg" value={vitals.weightKg} onChangeText={(value) => updateVitals("weightKg", value)} />
        <InputField label="Height Cm" value={vitals.heightCm} onChangeText={(value) => updateVitals("heightCm", value)} />
        <InputField label="Pain Score" value={vitals.painScore} onChangeText={(value) => updateVitals("painScore", value)} />
        <InputField
          label="Blood Glucose mmol/L"
          value={vitals.bloodGlucoseMmol}
          onChangeText={(value) => updateVitals("bloodGlucoseMmol", value)}
        />
        <ChoiceChips
          label="Consciousness Level"
          options={consciousnessOptions}
          value={vitals.consciousnessLevel}
          onChange={(value) => updateVitals("consciousnessLevel", value)}
        />
        <InlineActions>
          <ActionButton label="Record Vitals" onPress={recordVitals} />
        </InlineActions>
      </Card>

      <Card title="Red Flags">
        <ToggleField label="Chest Pain" value={redFlags.chestPain} onChange={(value) => updateFlag("chestPain", value)} />
        <ToggleField
          label="Difficulty Breathing"
          value={redFlags.difficultyBreathing}
          onChange={(value) => updateFlag("difficultyBreathing", value)}
        />
        <ToggleField label="Stroke Symptoms" value={redFlags.strokeSymptoms} onChange={(value) => updateFlag("strokeSymptoms", value)} />
        <ToggleField label="Severe Bleeding" value={redFlags.severebleeding} onChange={(value) => updateFlag("severebleeding", value)} />
        <ToggleField label="Allergic Reaction" value={redFlags.allergicReaction} onChange={(value) => updateFlag("allergicReaction", value)} />
        <ToggleField
          label="Altered Mental Status"
          value={redFlags.alteredMentalStatus}
          onChange={(value) => updateFlag("alteredMentalStatus", value)}
        />
        <ToggleField label="Pregnancy Concern" value={redFlags.pregnancyConcern} onChange={(value) => updateFlag("pregnancyConcern", value)} />
        <ToggleField
          label="Severe Abdominal Pain"
          value={redFlags.severeAbdominalPain}
          onChange={(value) => updateFlag("severeAbdominalPain", value)}
        />
        <InlineActions>
          <ActionButton label="Record Red Flags" onPress={recordRedFlags} variant="secondary" />
        </InlineActions>
      </Card>

      <Card title="Clinical Observations">
        <InputField label="History of Present Illness" value={historyOfPresentIllness} onChangeText={setHistoryOfPresentIllness} multiline />
        <InputField label="Allergies" value={allergies} onChangeText={setAllergies} />
        <InputField label="Current Medications" value={currentMedications} onChangeText={setCurrentMedications} multiline />
        <InputField label="Past Medical History" value={pastMedicalHistory} onChangeText={setPastMedicalHistory} multiline />
        <InputField label="Nursing Notes" value={nursingNotes} onChangeText={setNursingNotes} multiline />
        <InlineActions>
          <ActionButton label="Record Observations" onPress={recordObservations} />
        </InlineActions>
      </Card>

      <Card title="Finalize Triage">
        <InlineActions>
          <ActionButton label="Accept System Triage" onPress={accept} variant="secondary" />
        </InlineActions>
        <ChoiceChips label="Override Level" options={triageLevelOptions} value={overrideLevel} onChange={setOverrideLevel} />
        <InputField label="Override Reason" value={overrideReason} onChangeText={setOverrideReason} multiline />
        <InlineActions>
          <ActionButton label="Override Triage" onPress={override} variant="danger" />
          <ActionButton label="Load Triage Summary" onPress={loadSummary} variant="ghost" />
        </InlineActions>
        {summary ? <JsonPanel value={{ summary }} /> : null}
        <InputField
          label="Physical Exam (optional for AI suggestions)"
          value={outcomePhysicalExam}
          onChangeText={setOutcomePhysicalExam}
          multiline
        />
        <InlineActions>
          <ActionButton label="Load Outcome + Suggestions" onPress={loadOutcome} />
          <ActionButton label="Proceed to Encounter" onPress={proceedToEncounter} variant="secondary" />
        </InlineActions>
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
        {outcome ? <JsonPanel value={outcome} /> : null}
      </Card>

      {result ? (
        <Card title="Assessment Result">
          <JsonPanel value={result} />
        </Card>
      ) : null}
    </>
  );
}
