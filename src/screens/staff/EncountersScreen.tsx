import { Audio } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Share, Text, View } from "react-native";
import { encounterApi } from "../../api/services";
import type { EncounterPreview } from "../../api/types";
import {
  addendumReasonOptions,
  addendumTypeOptions,
  diagnosisTypeOptions,
  dosageFormOptions,
  encounterTypeOptions,
  routeOptions
} from "../../config/options";
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

const toPositiveInt = (value: string): number => Math.max(1, Number(value || "1"));

interface EncountersScreenProps {
  initialQueueTicketId?: string;
  initialEncounterId?: string;
  onEncounterLinked?: (encounterId: string) => void;
}

export function EncountersScreen({ initialQueueTicketId, initialEncounterId, onEncounterLinked }: EncountersScreenProps) {
  const { apiContext, role } = useSession();
  const isSuperAdmin = role === "SUPER_ADMIN";

  const [queueTicketId, setQueueTicketId] = useState("");
  const [encounterType, setEncounterType] = useState("NEW_VISIT");
  const [standalonePatientId, setStandalonePatientId] = useState("");
  const [standaloneChiefComplaint, setStandaloneChiefComplaint] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [preview, setPreview] = useState<EncounterPreview | null>(null);
  const [encounter, setEncounter] = useState<unknown>(null);
  const [myOpen, setMyOpen] = useState<unknown>(null);
  const [readiness, setReadiness] = useState<unknown>(null);
  const [addendums, setAddendums] = useState<unknown>(null);

  const [transcript, setTranscript] = useState("");
  const [ambientPrompt, setAmbientPrompt] = useState("");
  const [ambientLanguage, setAmbientLanguage] = useState("en");
  const [isListening, setIsListening] = useState(false);
  const [listenSeconds, setListenSeconds] = useState(0);
  const [ambientResult, setAmbientResult] = useState<unknown>(null);
  const [draftNote, setDraftNote] = useState("");
  const [modelVersion, setModelVersion] = useState("llama-3.1-70b-versatile");
  const [promptVersion, setPromptVersion] = useState("v1");
  const [persistGeneratedDraft, setPersistGeneratedDraft] = useState(false);
  const [generatedDraftResult, setGeneratedDraftResult] = useState<unknown>(null);
  const [physicianNote, setPhysicianNote] = useState("");
  const [finalNote, setFinalNote] = useState("");
  const [correctionComments, setCorrectionComments] = useState("");
  const [physicalExam, setPhysicalExam] = useState("");
  const [differentials, setDifferentials] = useState<unknown>(null);
  const [carePlan, setCarePlan] = useState<unknown>(null);
  const [carePlanAgreement, setCarePlanAgreement] = useState<unknown>(null);
  const [diagnosisAgreement, setDiagnosisAgreement] = useState<unknown>(null);
  const [prescription, setPrescription] = useState<unknown>(null);

  const [icdCode, setIcdCode] = useState("");
  const [diagnosisDescription, setDiagnosisDescription] = useState("");
  const [diagnosisType, setDiagnosisType] = useState("CONFIRMED");
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState(true);

  const [medicationName, setMedicationName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [dosage, setDosage] = useState("");
  const [dosageForm, setDosageForm] = useState("TABLET");
  const [frequency, setFrequency] = useState("BD");
  const [route, setRoute] = useState("ORAL");
  const [durationDays, setDurationDays] = useState("5");
  const [quantity, setQuantity] = useState("10");
  const [instructions, setInstructions] = useState("");
  const [indication, setIndication] = useState("");

  const [cancelReason, setCancelReason] = useState("");
  const [addendumType, setAddendumType] = useState("ADDITION");
  const [addendumReason, setAddendumReason] = useState("NEW_INFORMATION");
  const [addendumContent, setAddendumContent] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");

  const nativeRecordingRef = useRef<Audio.Recording | null>(null);
  const webRecorderRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webStreamRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!apiContext) {
    return (
      <Card title="Encounters">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  useEffect(() => {
    if (!isListening) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setListenSeconds((value) => value + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isListening]);

  useEffect(() => {
    if (initialQueueTicketId && initialQueueTicketId !== queueTicketId) {
      setQueueTicketId(initialQueueTicketId);
    }
  }, [initialQueueTicketId, queueTicketId]);

  useEffect(() => {
    if (initialEncounterId && initialEncounterId !== encounterId) {
      setEncounterId(initialEncounterId);
    }
  }, [encounterId, initialEncounterId]);

  useEffect(() => {
    const id = queueTicketId.trim();
    if (!apiContext || !id) {
      return;
    }

    encounterApi
      .getPreview(apiContext, id)
      .then((data) => setPreview(data))
      .catch(() => {
        // Keep manual load action and avoid noisy errors during intermediate typing.
      });
  }, [apiContext, queueTicketId]);

  const showError = (error: unknown) => {
    setMessage(toErrorMessage(error));
    setTone("error");
  };

  const showSuccess = (text: string) => {
    setMessage(text);
    setTone("success");
  };

  const setEncounterResult = (data: { id?: string } | unknown) => {
    setEncounter(data);
    if (data && typeof data === "object" && "id" in data) {
      const value = (data as { id?: string }).id;
      if (value) {
        setEncounterId(value);
        onEncounterLinked?.(value);
      }
    }
  };

  const loadPreview = async () => {
    try {
      const data = await encounterApi.getPreview(apiContext, queueTicketId.trim());
      setPreview(data);
      showSuccess("Pre-encounter preview loaded with repeat history and trends");
    } catch (error) {
      showError(error);
    }
  };

  const createFromQueue = async () => {
    try {
      const data = await encounterApi.createFromQueue(apiContext, queueTicketId.trim(), encounterType);
      setEncounterResult(data);
      showSuccess("Encounter created from queue");
    } catch (error) {
      showError(error);
    }
  };

  const createStandalone = async () => {
    try {
      const data = await encounterApi.createStandalone(apiContext, {
        patientId: standalonePatientId.trim(),
        encounterType,
        chiefComplaint: standaloneChiefComplaint
      });
      setEncounterResult(data);
      showSuccess("Standalone encounter created");
    } catch (error) {
      showError(error);
    }
  };

  const loadEncounter = async () => {
    try {
      const data = await encounterApi.getEncounter(apiContext, encounterId.trim());
      setEncounterResult(data);
      showSuccess("Encounter loaded");
    } catch (error) {
      showError(error);
    }
  };

  const loadMyOpen = async () => {
    try {
      const data = await encounterApi.getMyOpen(apiContext);
      setMyOpen(data);
      showSuccess("Open encounters loaded");
    } catch (error) {
      showError(error);
    }
  };

  const startAmbientListening = async () => {
    try {
      if (!encounterId.trim()) {
        throw new Error("Encounter UUID is required before recording");
      }
      setAmbientResult(null);
      setListenSeconds(0);

      if (Platform.OS === "web") {
        const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
        if (!mediaDevices?.getUserMedia) {
          throw new Error("Browser does not support microphone recording");
        }
        const stream = await mediaDevices.getUserMedia({ audio: true });
        const RecorderClass = (globalThis as any).MediaRecorder;
        if (!RecorderClass) {
          throw new Error("MediaRecorder is not available in this browser");
        }

        webChunksRef.current = [];
        const recorder = new RecorderClass(stream);
        recorder.ondataavailable = (event: any) => {
          if (event.data && event.data.size > 0) {
            webChunksRef.current.push(event.data);
          }
        };
        recorder.start();
        webRecorderRef.current = recorder;
        webStreamRef.current = stream;
      } else {
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Microphone permission is required");
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true
        });

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await recording.startAsync();
        nativeRecordingRef.current = recording;
      }

      setIsListening(true);
      showSuccess("Ambient listening started");
    } catch (error) {
      showError(error);
    }
  };

  const stopAmbientListening = async () => {
    try {
      if (!isListening) {
        return;
      }
      setIsListening(false);

      let result;
      if (Platform.OS === "web") {
        const recorder = webRecorderRef.current;
        if (!recorder) {
          throw new Error("No active web recorder");
        }

        const audioBlob: Blob = await new Promise((resolve, reject) => {
          recorder.onerror = () => reject(new Error("Recording failed"));
          recorder.onstop = () => {
            resolve(new Blob(webChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
          };
          recorder.stop();
        });

        if (webStreamRef.current?.getTracks) {
          webStreamRef.current.getTracks().forEach((track: any) => track.stop());
        }

        result = await encounterApi.transcribeAmbient(apiContext, encounterId.trim(), {
          audio: audioBlob,
          fileName: `ambient-${Date.now()}.webm`,
          mimeType: audioBlob.type || "audio/webm",
          language: ambientLanguage || undefined,
          prompt: ambientPrompt || undefined
        });
      } else {
        const recording = nativeRecordingRef.current;
        if (!recording) {
          throw new Error("No active recording");
        }
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false
        });
        if (!uri) {
          throw new Error("Unable to read audio recording");
        }

        result = await encounterApi.transcribeAmbient(apiContext, encounterId.trim(), {
          audio: {
            uri,
            name: `ambient-${Date.now()}.m4a`,
            type: "audio/m4a"
          },
          fileName: `ambient-${Date.now()}.m4a`,
          mimeType: "audio/m4a",
          language: ambientLanguage || undefined,
          prompt: ambientPrompt || undefined
        });
      }

      nativeRecordingRef.current = null;
      webRecorderRef.current = null;
      webStreamRef.current = null;
      setAmbientResult(result);

      if (result.transcript) {
        setTranscript((previous) => (previous ? `${previous}\n${result.transcript}` : result.transcript || ""));
      }

      if (result.available) {
        showSuccess("Ambient transcription complete and appended to transcript");
      } else {
        showError(result.errorMessage || "Ambient transcription unavailable");
      }
    } catch (error) {
      showError(error);
    }
  };

  const recordTranscript = async () => {
    try {
      const data = await encounterApi.recordTranscript(apiContext, encounterId.trim(), transcript);
      setEncounterResult(data);
      showSuccess("Transcript recorded");
    } catch (error) {
      showError(error);
    }
  };

  const recordAiDraft = async () => {
    try {
      const data = await encounterApi.recordAiDraft(apiContext, encounterId.trim(), {
        draftNote,
        modelVersion,
        promptVersion
      });
      setEncounterResult(data);
      showSuccess("AI draft recorded");
    } catch (error) {
      showError(error);
    }
  };

  const generateAiDraft = async () => {
    try {
      const data = await encounterApi.generateAiDraftFromTranscript(apiContext, encounterId.trim(), {
        persist: persistGeneratedDraft,
        promptVersion: "ambient-soap-v1"
      });
      setGeneratedDraftResult(data);
      if (data.draftNote) {
        setDraftNote(data.draftNote);
      }
      showSuccess(data.persisted ? "AI draft generated and persisted" : "AI draft generated");
    } catch (error) {
      showError(error);
    }
  };

  const recordPhysician = async () => {
    try {
      const data = await encounterApi.recordPhysicianNote(apiContext, encounterId.trim(), physicianNote);
      setEncounterResult(data);
      showSuccess("Physician note saved");
    } catch (error) {
      showError(error);
    }
  };

  const confirmFinalNote = async () => {
    try {
      const data = await encounterApi.confirmNote(apiContext, encounterId.trim(), {
        finalNote,
        correctionComments
      });
      setEncounterResult(data);
      showSuccess("Final note confirmed with system transcript discrepancy analysis");
    } catch (error) {
      showError(error);
    }
  };

  const addDiagnosis = async () => {
    try {
      const data = await encounterApi.addDiagnosis(apiContext, encounterId.trim(), {
        icdCode,
        description: diagnosisDescription,
        isPrimary: primaryDiagnosis,
        type: diagnosisType
      });
      setEncounterResult(data);
      try {
        const suggestion = await encounterApi.suggestCarePlan(apiContext, encounterId.trim());
        setCarePlan(suggestion);
        showSuccess("Diagnosis added and advisory care plan suggestions generated");
      } catch {
        showSuccess("Diagnosis added");
      }
    } catch (error) {
      showError(error);
    }
  };

  const agreeDiagnosis = async () => {
    try {
      const data = await encounterApi.agreeDiagnosis(apiContext, encounterId.trim());
      setEncounterResult(data);
      setDiagnosisAgreement({
        diagnosisAgreed: data.diagnosisAgreed,
        diagnosisAgreedAt: data.diagnosisAgreedAt,
        diagnosisAgreedBy: data.diagnosisAgreedBy
      });
      showSuccess("Physician diagnosis agreement recorded");
    } catch (error) {
      showError(error);
    }
  };

  const addMedication = async () => {
    try {
      const data = await encounterApi.addMedication(apiContext, encounterId.trim(), {
        medicationName,
        brandName: brandName || null,
        dosage,
        dosageForm,
        frequency,
        route,
        durationDays: toPositiveInt(durationDays),
        quantity: toPositiveInt(quantity),
        instructions: instructions || null,
        indication: indication || null
      });
      setEncounterResult(data);
      showSuccess("Medication order added");
    } catch (error) {
      showError(error);
    }
  };

  const generateDifferentials = async () => {
    try {
      const data = await encounterApi.generateDifferentials(apiContext, encounterId.trim(), physicalExam || undefined);
      setDifferentials(data);
      showSuccess("Differential suggestions generated");
    } catch (error) {
      showError(error);
    }
  };

  const suggestCarePlan = async () => {
    try {
      const data = await encounterApi.suggestCarePlan(apiContext, encounterId.trim());
      setCarePlan(data);
      showSuccess("Advisory care plan suggestions generated");
    } catch (error) {
      showError(error);
    }
  };

  const agreeCarePlan = async () => {
    try {
      const data = await encounterApi.agreeCarePlan(apiContext, encounterId.trim());
      setCarePlanAgreement(data);
      const refreshed = await encounterApi.getEncounter(apiContext, encounterId.trim());
      setEncounterResult(refreshed);
      showSuccess("Physician agreement recorded for care plan suggestions");
    } catch (error) {
      showError(error);
    }
  };

  const generatePrescription = async () => {
    try {
      const data = await encounterApi.getPrescription(apiContext, encounterId.trim());
      setPrescription(data);
      showSuccess("Prescription generated");
    } catch (error) {
      showError(error);
    }
  };

  const printPrescription = async () => {
    try {
      const id = encounterId.trim();
      const current = prescription || (await encounterApi.getPrescription(apiContext, id));
      setPrescription(current);

      if (Platform.OS === "web" && typeof window !== "undefined") {
        const content = current as { prescriptionText?: string; clinicName?: string; patientName?: string; orderDate?: string };
        const printable = window.open("", "_blank");
        if (!printable) {
          throw new Error("Popup blocked by browser");
        }
        printable.document.write("<html><head><title>Prescription</title></head><body>");
        printable.document.write(`<h2>${content.clinicName || "Prescription"}</h2>`);
        printable.document.write(`<div>Patient: ${content.patientName || ""}</div>`);
        printable.document.write(`<div>Date: ${content.orderDate || ""}</div>`);
        printable.document.write("<pre style='white-space: pre-wrap; font-family: monospace;'>");
        printable.document.write(content.prescriptionText || "");
        printable.document.write("</pre></body></html>");
        printable.document.close();
        printable.focus();
        printable.print();
      } else {
        const content = current as { prescriptionText?: string; clinicName?: string; patientName?: string; orderDate?: string };
        await Share.share({
          title: `${content.clinicName || "Prescription"} - ${content.patientName || ""}`,
          message: `Prescription Date: ${content.orderDate || ""}\n\n${content.prescriptionText || ""}`
        });
      }

      const updatedEncounter = await encounterApi.markPrescriptionPrinted(apiContext, id);
      setEncounterResult(updatedEncounter);
      showSuccess("Prescription marked as printed");
    } catch (error) {
      showError(error);
    }
  };

  const loadReadiness = async () => {
    try {
      const data = await encounterApi.getCompletionReadiness(apiContext, encounterId.trim());
      setReadiness(data);
      showSuccess("Completion readiness loaded");
    } catch (error) {
      showError(error);
    }
  };

  const completeEncounter = async () => {
    try {
      const data = await encounterApi.complete(apiContext, encounterId.trim());
      setEncounterResult(data);
      showSuccess("Encounter completed");
    } catch (error) {
      showError(error);
    }
  };

  const cancelEncounter = async () => {
    try {
      const data = await encounterApi.cancel(apiContext, encounterId.trim(), cancelReason);
      setEncounterResult(data);
      showSuccess("Encounter cancelled");
    } catch (error) {
      showError(error);
    }
  };

  const createAddendum = async () => {
    try {
      const data = await encounterApi.createAddendum(apiContext, encounterId.trim(), {
        type: addendumType,
        reason: addendumReason,
        content: addendumContent
      });
      setAddendums(data);
      showSuccess("Addendum created");
    } catch (error) {
      showError(error);
    }
  };

  const loadAddendums = async () => {
    try {
      const data = await encounterApi.listAddendums(apiContext, encounterId.trim());
      setAddendums(data);
      showSuccess("Addendums loaded");
    } catch (error) {
      showError(error);
    }
  };

  const renderVitalsTrend = () => {
    const points = preview?.vitalTrends;
    if (!points || points.length === 0) {
      return null;
    }

    const systolicMax = Math.max(...points.map((item) => item.bloodPressureSystolic || 0), 1);
    const diastolicMax = Math.max(...points.map((item) => item.bloodPressureDiastolic || 0), 1);

    return (
      <View style={{ gap: 8 }}>
        {points.map((point, index) => {
          const systolic = point.bloodPressureSystolic || 0;
          const diastolic = point.bloodPressureDiastolic || 0;
          const systolicWidth = `${Math.max(4, Math.round((systolic / systolicMax) * 100))}%` as `${number}%`;
          const diastolicWidth = `${Math.max(4, Math.round((diastolic / diastolicMax) * 100))}%` as `${number}%`;
          const key = point.assessmentId || `${point.date || "unknown"}-${index}`;

          return (
            <View key={key} style={{ borderWidth: 1, borderColor: "#d6ccbe", borderRadius: 8, padding: 8, gap: 4 }}>
              <Text>
                {point.date || "Unknown date"} | BP {systolic || "-"} / {diastolic || "-"}
              </Text>
              <Text style={{ fontSize: 12 }}>Systolic trend</Text>
              <View style={{ height: 8, backgroundColor: "#ece4d8", borderRadius: 999, overflow: "hidden" }}>
                <View style={{ height: 8, width: systolicWidth, backgroundColor: "#1f7a8c" }} />
              </View>
              <Text style={{ fontSize: 12 }}>Diastolic trend</Text>
              <View style={{ height: 8, backgroundColor: "#ece4d8", borderRadius: 999, overflow: "hidden" }}>
                <View style={{ height: 8, width: diastolicWidth, backgroundColor: "#4aa3b5" }} />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const adminAiComparison = (() => {
    if (!isSuperAdmin || !encounter || typeof encounter !== "object") {
      return null;
    }
    const source = encounter as Record<string, unknown>;
    return {
      encounterId: typeof source.id === "string" ? source.id : null,
      noteConfirmed: source.noteConfirmed ?? null,
      aiAccuracyRating: source.aiAccuracyRating ?? null,
      transcriptAccuracyScore: source.transcriptAccuracyScore ?? null,
      transcriptDiscrepancySummary: source.transcriptDiscrepancySummary ?? null,
      diagnosisAgreementRequired: source.diagnosisAgreementRequired ?? null,
      diagnosisAgreed: source.diagnosisAgreed ?? null,
      diagnosisAgreedAt: source.diagnosisAgreedAt ?? null,
      carePlanAgreementRequired: source.carePlanAgreementRequired ?? null,
      carePlanAgreed: source.carePlanAgreed ?? null,
      carePlanAgreedAt: source.carePlanAgreedAt ?? null
    };
  })();

  const aiComparisonFields = new Set([
    "aiAccuracyRating",
    "transcriptAccuracyScore",
    "transcriptDiscrepancySummary",
    "aiCorrectionComments",
    "noteConfirmedBy",
    "noteConfirmedAt",
    "noteConfirmed"
  ]);

  const scrubAiComparison = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => scrubAiComparison(item));
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const source = value as Record<string, unknown>;
    const entries = Object.entries(source)
      .filter(([key]) => !aiComparisonFields.has(key))
      .map(([key, current]) => [key, scrubAiComparison(current)]);
    return Object.fromEntries(entries);
  };

  const encounterPanelData = isSuperAdmin ? encounter : scrubAiComparison(encounter);
  const myOpenPanelData = isSuperAdmin ? myOpen : scrubAiComparison(myOpen);

  return (
    <>
      <Card title="Create & Load">
        <InputField label="Queue Ticket UUID" value={queueTicketId} onChangeText={setQueueTicketId} />
        <ChoiceChips label="Encounter Type" options={encounterTypeOptions} value={encounterType} onChange={setEncounterType} />
        <InlineActions>
          <ActionButton label="Preview Queue Ticket" onPress={loadPreview} />
          <ActionButton label="Create from Queue" onPress={createFromQueue} variant="secondary" />
        </InlineActions>
        <InputField label="Standalone Patient UUID" value={standalonePatientId} onChangeText={setStandalonePatientId} />
        <InputField label="Standalone Chief Complaint" value={standaloneChiefComplaint} onChangeText={setStandaloneChiefComplaint} multiline />
        <InlineActions>
          <ActionButton label="Create Standalone" onPress={createStandalone} variant="ghost" />
        </InlineActions>
        <InputField label="Encounter UUID" value={encounterId} onChangeText={setEncounterId} />
        <InlineActions>
          <ActionButton label="Load Encounter" onPress={loadEncounter} />
          <ActionButton label="Load My Open Encounters" onPress={loadMyOpen} variant="secondary" />
        </InlineActions>
        <MessageBanner message={message} tone={tone} />
      </Card>

      <Card title="Documentation">
        <InputField label="Ambient Language (ISO code)" value={ambientLanguage} onChangeText={setAmbientLanguage} placeholder="en" />
        <InputField
          label="Ambient Prompt (optional)"
          value={ambientPrompt}
          onChangeText={setAmbientPrompt}
          placeholder="Focus on clinical conversation and medications"
          multiline
        />
        <InlineActions>
          <ActionButton
            label={isListening ? `Listening (${listenSeconds}s)` : "Start Ambient Listening"}
            onPress={startAmbientListening}
            variant={isListening ? "secondary" : "primary"}
            disabled={isListening}
          />
          <ActionButton label="Stop & Transcribe" onPress={stopAmbientListening} variant="danger" disabled={!isListening} />
        </InlineActions>
        {isListening ? <Text>Microphone capture in progress... {listenSeconds}s</Text> : null}
        {ambientResult ? <JsonPanel value={ambientResult} /> : null}

        <InputField label="Transcript" value={transcript} onChangeText={setTranscript} multiline />
        <InlineActions>
          <ActionButton label="Save Transcript" onPress={recordTranscript} />
        </InlineActions>

        <InputField label="AI Draft Note" value={draftNote} onChangeText={setDraftNote} multiline />
        <InputField label="Model Version" value={modelVersion} onChangeText={setModelVersion} />
        <InputField label="Prompt Version" value={promptVersion} onChangeText={setPromptVersion} />
        <ToggleField label="Persist generated AI draft" value={persistGeneratedDraft} onChange={setPersistGeneratedDraft} />
        <InlineActions>
          <ActionButton label="Save AI Draft" onPress={recordAiDraft} variant="secondary" />
          <ActionButton label="Generate AI Draft from Transcript" onPress={generateAiDraft} variant="ghost" />
        </InlineActions>
        {generatedDraftResult ? <JsonPanel value={generatedDraftResult} /> : null}

        <InputField label="Physician Note" value={physicianNote} onChangeText={setPhysicianNote} multiline />
        <InlineActions>
          <ActionButton label="Save Physician Note" onPress={recordPhysician} />
        </InlineActions>

        <InputField label="Final Note" value={finalNote} onChangeText={setFinalNote} multiline />
        <Text>AI/Transcript accuracy is system-computed and not manually editable.</Text>
        <InputField label="Correction Comments" value={correctionComments} onChangeText={setCorrectionComments} multiline />
        <InlineActions>
          <ActionButton label="Confirm Final Note" onPress={confirmFinalNote} variant="secondary" />
        </InlineActions>
      </Card>

      <Card title="Diagnosis & Medication">
        <InputField label="ICD-10 Code" value={icdCode} onChangeText={setIcdCode} placeholder="J06.9" />
        <InputField label="Diagnosis Description" value={diagnosisDescription} onChangeText={setDiagnosisDescription} />
        <ChoiceChips label="Diagnosis Type" options={diagnosisTypeOptions} value={diagnosisType} onChange={setDiagnosisType} />
        <ToggleField label="Primary Diagnosis" value={primaryDiagnosis} onChange={setPrimaryDiagnosis} />
        <InlineActions>
          <ActionButton label="Add Diagnosis" onPress={addDiagnosis} />
          <ActionButton label="Agree Diagnosis" onPress={agreeDiagnosis} variant="secondary" />
        </InlineActions>
        {diagnosisAgreement ? <JsonPanel value={diagnosisAgreement} /> : null}

        <InputField label="Medication Name" value={medicationName} onChangeText={setMedicationName} />
        <InputField label="Brand Name" value={brandName} onChangeText={setBrandName} />
        <InputField label="Dosage" value={dosage} onChangeText={setDosage} placeholder="500mg" />
        <ChoiceChips label="Dosage Form" options={dosageFormOptions} value={dosageForm} onChange={setDosageForm} />
        <InputField label="Frequency" value={frequency} onChangeText={setFrequency} placeholder="TDS" />
        <ChoiceChips label="Route" options={routeOptions} value={route} onChange={setRoute} />
        <InputField label="Duration Days" value={durationDays} onChangeText={setDurationDays} />
        <InputField label="Quantity" value={quantity} onChangeText={setQuantity} />
        <InputField label="Instructions" value={instructions} onChangeText={setInstructions} multiline />
        <InputField label="Indication" value={indication} onChangeText={setIndication} multiline />
        <InlineActions>
          <ActionButton label="Add Medication" onPress={addMedication} variant="secondary" />
        </InlineActions>
      </Card>

      <Card title="AI Differential Suggestions">
        <InputField label="Physical Exam (optional)" value={physicalExam} onChangeText={setPhysicalExam} multiline />
        <InlineActions>
          <ActionButton label="Generate Differentials" onPress={generateDifferentials} />
        </InlineActions>
        {differentials ? <JsonPanel value={differentials} /> : null}
      </Card>

      <Card title="Advisory Care Plan (Labs/Medication/Treatment)">
        <Text>
          Suggestions only. Physician must review and click Agree before completion when care-plan suggestions are generated.
        </Text>
        <InlineActions>
          <ActionButton label="Generate Care Plan Suggestions" onPress={suggestCarePlan} />
          <ActionButton label="Agree with Suggestions" onPress={agreeCarePlan} variant="secondary" />
        </InlineActions>
        {carePlan ? <JsonPanel value={carePlan} /> : null}
        {carePlanAgreement ? <JsonPanel value={carePlanAgreement} /> : null}
      </Card>

      <Card title="Prescription">
        <InlineActions>
          <ActionButton label="Generate Prescription" onPress={generatePrescription} />
          <ActionButton label="Print Prescription" onPress={printPrescription} variant="secondary" />
        </InlineActions>
        {prescription ? <JsonPanel value={prescription} /> : null}
      </Card>

      <Card title="Completion & Addendums">
        <InlineActions>
          <ActionButton label="Load Completion Readiness" onPress={loadReadiness} />
          <ActionButton label="Complete Encounter" onPress={completeEncounter} variant="secondary" />
        </InlineActions>
        <InputField label="Cancel Reason" value={cancelReason} onChangeText={setCancelReason} multiline />
        <InlineActions>
          <ActionButton label="Cancel Encounter" onPress={cancelEncounter} variant="danger" />
        </InlineActions>

        <ChoiceChips label="Addendum Type" options={addendumTypeOptions} value={addendumType} onChange={setAddendumType} />
        <ChoiceChips label="Addendum Reason" options={addendumReasonOptions} value={addendumReason} onChange={setAddendumReason} />
        <InputField label="Addendum Content" value={addendumContent} onChangeText={setAddendumContent} multiline />
        <InlineActions>
          <ActionButton label="Create Addendum" onPress={createAddendum} />
          <ActionButton label="Load Addendums" onPress={loadAddendums} variant="ghost" />
        </InlineActions>
      </Card>

      {preview ? (
        <Card title="Preview">
          {preview.repeatCareSummary ? (
            <View style={{ gap: 4 }}>
              <Text>
                Repeat with current clinician: {preview.repeatCareSummary.repeatPatientWithCurrentClinician ? "Yes" : "No"}
              </Text>
              <Text>Visits with current clinician: {preview.repeatCareSummary.visitsWithCurrentClinician || 0}</Text>
              <Text>Total completed visits: {preview.repeatCareSummary.totalCompletedVisits || 0}</Text>
              <Text>
                Last visit with current clinician: {preview.repeatCareSummary.lastVisitWithCurrentClinicianAt || "N/A"}
              </Text>
            </View>
          ) : null}
          {preview.diagnosisHistory && preview.diagnosisHistory.length ? (
            <JsonPanel value={preview.diagnosisHistory.slice(0, 12)} />
          ) : null}
          {renderVitalsTrend()}
          {preview.carePlanHistory && preview.carePlanHistory.length ? <JsonPanel value={preview.carePlanHistory} /> : null}
          <JsonPanel value={preview} />
        </Card>
      ) : null}

      {encounter ? (
        <Card title="Encounter">
          <JsonPanel value={encounterPanelData} />
        </Card>
      ) : null}

      {adminAiComparison ? (
        <Card title="AI Comparison Audit (Super Admin)">
          <JsonPanel value={adminAiComparison} />
        </Card>
      ) : null}

      {myOpen ? (
        <Card title="My Open Encounters">
          <JsonPanel value={myOpenPanelData} />
        </Card>
      ) : null}

      {readiness ? (
        <Card title="Readiness">
          <JsonPanel value={readiness} />
        </Card>
      ) : null}

      {addendums ? (
        <Card title="Addendum Data">
          <JsonPanel value={addendums} />
        </Card>
      ) : null}
    </>
  );
}
