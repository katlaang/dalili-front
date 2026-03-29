import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { clinicalPortalApi } from "../../api/services";
import type { PatientResponse, PortalMessageView } from "../../api/types";
import { ActionButton, Card, InlineActions, InputField, MessageBanner, useTheme } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import { formatDateTime, resolvePatientByInput } from "./patientServiceUtils";

interface PatientMessagingScreenProps {
  prefillPatientId?: string;
  prefillPatientName?: string;
  onPrefillConsumed?: () => void;
}

export function PatientMessagingScreen({
  prefillPatientId,
  prefillPatientName,
  onPrefillConsumed,
}: PatientMessagingScreenProps) {
  const { apiContext } = useSession();
  const { theme: T } = useTheme();
  const [patientId, setPatientId] = useState("");
  const [resolvedPatient, setResolvedPatient] = useState<PatientResponse | null>(null);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messages, setMessages] = useState<PortalMessageView[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    if (!prefillPatientId || !apiContext) {
      return;
    }

    resolvePatientByInput(apiContext, prefillPatientId)
      .then(patient => {
        setResolvedPatient(patient);
        setPatientId(patient.mrn || prefillPatientId);
        if (!messageSubject.trim()) {
          setMessageSubject(`Message for ${prefillPatientName || patient.fullName}`);
        }
        setStatusMessage(`Patient ready: ${prefillPatientName || patient.fullName}`);
        setTone("success");
      })
      .catch(error => {
        setPatientId(prefillPatientId);
        setStatusMessage(toErrorMessage(error));
        setTone("error");
      })
      .finally(() => onPrefillConsumed?.());
  }, [apiContext, messageSubject, onPrefillConsumed, prefillPatientId, prefillPatientName]);

  if (!apiContext) {
    return (
      <Card title="Patient Messages">
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

  const loadMessages = async () => {
    try {
      const patient = await resolvePatientRecord();
      const list = await clinicalPortalApi.getInbox(apiContext, patient.id);
      setMessages(list);
      showSuccess(`Showing ${list.length} message(s) for ${patient.fullName}`);
    } catch (error) {
      showError(error);
    }
  };

  const sendMessage = async () => {
    try {
      const patient = await resolvePatientRecord();
      const sent = await clinicalPortalApi.sendToPatient(apiContext, patient.id, {
        category: "GENERAL",
        subject: messageSubject || undefined,
        body: messageBody,
      });
      setMessages(previous => [sent, ...previous]);
      setMessageBody("");
      showSuccess(`Message sent to ${patient.fullName}`);
    } catch (error) {
      showError(error);
    }
  };

  const markRead = async (messageId: string) => {
    try {
      const updated = await clinicalPortalApi.markMessageRead(apiContext, messageId);
      setMessages(previous =>
        previous.map(item => (item.id === messageId ? updated : item))
      );
      showSuccess("Message marked as read");
    } catch (error) {
      showError(error);
    }
  };

  return (
    <>
      <Card title="Patient Messages">
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
            <Text style={[styles.patientName, { color: T.text }]}>{resolvedPatient.fullName}</Text>
            <Text style={[styles.patientMeta, { color: T.textMid }]}>{resolvedPatient.mrn}</Text>
          </View>
        ) : null}

        <InlineActions>
          <ActionButton label="View Messages" onPress={loadMessages} variant="secondary" />
        </InlineActions>

        <InputField label="Subject" value={messageSubject} onChangeText={setMessageSubject} />
        <InputField
          label="Message"
          value={messageBody}
          onChangeText={setMessageBody}
          multiline
          placeholder="Write the message for the patient."
        />

        <InlineActions>
          <ActionButton label="Send Message" onPress={sendMessage} />
        </InlineActions>

        <MessageBanner message={statusMessage} tone={tone} />
      </Card>

      <Card title="Conversation">
        {messages.length > 0 ? (
          <View style={styles.messageList}>
            {messages.map((message) => {
              const unread = !message.readAt;
              return (
                <View
                  key={message.id}
                  style={[styles.messageCard, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}
                >
                  <View style={styles.messageHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.messageSubject, { color: T.text }]}>
                        {message.subject || "Untitled message"}
                      </Text>
                      <Text style={[styles.messageMeta, { color: T.textMid }]}>
                        {message.senderName || "Clinician"}  |  {formatDateTime(message.createdAt)}
                      </Text>
                    </View>
                    {unread ? (
                      <ActionButton label="Mark Read" onPress={() => void markRead(message.id)} variant="secondary" />
                    ) : (
                      <Text style={[styles.readTag, { color: T.teal }]}>Read</Text>
                    )}
                  </View>
                  <Text style={[styles.messageBody, { color: T.text }]}>{message.body}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <MessageBanner message="No patient messages loaded yet." tone="info" />
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
  messageList: {
    gap: 10,
  },
  messageCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  messageSubject: {
    fontSize: 15,
    fontWeight: "700",
  },
  messageMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  readTag: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
});
