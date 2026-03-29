import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { clinicalPortalApi } from "../../api/services";
import type { MessageThreadDetail, MessageThreadSummary, PatientResponse, PortalMessageView } from "../../api/types";
import {
  ActionButton,
  Card,
  InputField,
  InlineActions,
  MessageBanner,
  useTheme,
} from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import { buildMessageThreadDetail, buildMessageThreadSummaries, getThreadLocalKey } from "../../utils/messageThreads";
import { formatDateTime, resolvePatientByInput } from "./patientServiceUtils";

interface MessagesScreenProps {
  prefillPatientId?: string;
  prefillPatientName?: string;
  onPrefillConsumed?: () => void;
}

function getSummaryKey(summary: Pick<MessageThreadSummary, "threadId" | "patientId" | "subject" | "category">) {
  return summary.threadId
    ? `thread:${summary.threadId}`
    : getThreadLocalKey({
        threadId: undefined,
        patientId: summary.patientId ?? undefined,
        subject: summary.subject ?? undefined,
        category: summary.category ?? undefined,
      });
}

export function MessagesScreen({
  prefillPatientId,
  prefillPatientName,
  onPrefillConsumed,
}: MessagesScreenProps) {
  const { apiContext } = useSession();
  const { theme: T } = useTheme();
  const { width } = useWindowDimensions();
  const isNarrow = width < 980;

  const [patientInput, setPatientInput] = useState("");
  const [resolvedPatient, setResolvedPatient] = useState<PatientResponse | null>(null);
  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [flatMessages, setFlatMessages] = useState<PortalMessageView[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<MessageThreadDetail | null>(null);
  const [detailMode, setDetailMode] = useState<"thread" | "new">("new");
  const [pendingAutoOpenPatientId, setPendingAutoOpenPatientId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    if (!prefillPatientId || !apiContext) return;

    resolvePatientByInput(apiContext, prefillPatientId)
      .then((patient) => {
        setResolvedPatient(patient);
        setPatientInput(patient.mrn || prefillPatientId);
        setStatusMessage(`Patient ready: ${prefillPatientName || patient.fullName}`);
        setTone("success");
        setDetailMode("new");
        setPendingAutoOpenPatientId(patient.id);
        void loadThreads(patient.id);
      })
      .catch((error) => {
        setPatientInput(prefillPatientId);
        setStatusMessage(toErrorMessage(error));
        setTone("error");
      })
      .finally(() => onPrefillConsumed?.());
  }, [apiContext, onPrefillConsumed, prefillPatientId, prefillPatientName]);

  const showError = (error: unknown) => {
    setStatusMessage(toErrorMessage(error));
    setTone("error");
  };

  const showSuccess = (text: string) => {
    setStatusMessage(text);
    setTone("success");
  };

  const resolvePatientRecord = async () => {
    const patient = await resolvePatientByInput(apiContext!, patientInput);
    setResolvedPatient(patient);
    setPatientInput(patient.mrn || patientInput.trim());
    return patient;
  };

  const loadThreads = async (patientIdOverride?: string) => {
    if (!apiContext) return;

    try {
      const summaries = await clinicalPortalApi.getMessageThreads(apiContext, patientIdOverride);
      setThreads(summaries);
      setFlatMessages([]);
      showSuccess(`Showing ${summaries.length} conversation(s)`);
    } catch (threadError) {
      try {
        const messages = await clinicalPortalApi.getInbox(apiContext, patientIdOverride);
        setFlatMessages(messages);
        setThreads(buildMessageThreadSummaries(messages, "STAFF"));
        showSuccess(`Showing ${messages.length} message(s) in fallback inbox mode`);
      } catch (fallbackError) {
        showError(fallbackError || threadError);
      }
    }
  };

  const selectThread = async (summary: MessageThreadSummary) => {
    if (!apiContext) return;
    const nextKey = getSummaryKey(summary);
    setSelectedKey(nextKey);
    setDetailMode("thread");
    setSubject(summary.subject || "");

    if (summary.patientId) {
      setPatientInput(summary.patientMrn || summary.patientId);
    }
    if (summary.patientId && !resolvedPatient) {
      resolvePatientByInput(apiContext, summary.patientId)
        .then(setResolvedPatient)
        .catch(() => undefined);
    }

    if (summary.threadId) {
      try {
        const detail = await clinicalPortalApi.getMessageThread(apiContext, summary.threadId);
        setSelectedThread(detail);
        return;
      } catch {
      }
    }

    if (flatMessages.length > 0) {
      setSelectedThread(buildMessageThreadDetail(flatMessages, summary, "STAFF"));
      return;
    }

    try {
      const patientId = summary.patientId || undefined;
      const messages = await clinicalPortalApi.getInbox(apiContext, patientId);
      setFlatMessages(messages);
      setSelectedThread(buildMessageThreadDetail(messages, summary, "STAFF"));
    } catch (error) {
      showError(error);
    }
  };

  const refreshSelectedThread = async () => {
    if (!selectedThread) return;
    const matching = threads.find((entry) => getSummaryKey(entry) === selectedKey);
    if (matching) {
      await selectThread(matching);
      return;
    }
    await loadThreads(selectedThread.patientId || undefined);
  };

  const startNewThread = async () => {
    if (!apiContext) return;
    try {
      const patient = await resolvePatientRecord();
      if (!body.trim()) {
        throw new Error("Message body is required");
      }

      try {
        const detail = await clinicalPortalApi.createMessageThread(apiContext, patient.id, {
          category,
          subject: subject.trim() || undefined,
          body: body.trim(),
        });
        setSelectedThread(detail);
        setSelectedKey(detail.threadId ? `thread:${detail.threadId}` : null);
        setBody("");
        setDetailMode("thread");
        showSuccess(`Conversation started with ${patient.fullName}`);
      } catch {
        await clinicalPortalApi.sendToPatient(apiContext, patient.id, {
          category,
          subject: subject.trim() || undefined,
          body: body.trim(),
        });
        setBody("");
        showSuccess(`Message sent to ${patient.fullName}`);
      }

      await loadThreads(patient.id);
    } catch (error) {
      showError(error);
    }
  };

  const replyToThread = async () => {
    if (!apiContext || !selectedThread) return;
    try {
      const patientId = selectedThread.patientId || resolvedPatient?.id;
      if (!patientId) {
        throw new Error("Patient context is required before replying.");
      }
      if (!body.trim()) {
        throw new Error("Reply body is required");
      }

      if (selectedThread.threadId) {
        try {
          const detail = await clinicalPortalApi.replyToThread(apiContext, selectedThread.threadId, {
            category: selectedThread.category || category,
            body: body.trim(),
          });
          setSelectedThread(detail);
          setBody("");
          showSuccess("Reply sent");
          await loadThreads(patientId);
          return;
        } catch {
        }
      }

      await clinicalPortalApi.sendToPatient(apiContext, patientId, {
        category: selectedThread.category || category,
        subject: selectedThread.subject || subject || undefined,
        body: body.trim(),
      });
      setBody("");
      showSuccess("Reply sent");
      await loadThreads(patientId);
      await refreshSelectedThread();
    } catch (error) {
      showError(error);
    }
  };

  const markThreadRead = async () => {
    if (!apiContext || !selectedThread) return;
    try {
      const unread = selectedThread.messages.filter(
        (message) => !message.readAt && (message.senderRole || "").toUpperCase() === "PATIENT"
      );
      await Promise.all(unread.map((message) => clinicalPortalApi.markMessageRead(apiContext, message.id)));
      showSuccess("Conversation marked as read");
      await refreshSelectedThread();
    } catch (error) {
      showError(error);
    }
  };

  useEffect(() => {
    if (!apiContext) return;
    void loadThreads();
  }, [apiContext]);

  useEffect(() => {
    if (!pendingAutoOpenPatientId || threads.length === 0) return;
    const existing = threads
      .filter((thread) => thread.patientId === pendingAutoOpenPatientId)
      .sort((left, right) => {
        const leftTime = new Date(left.latestTimestamp || 0).getTime();
        const rightTime = new Date(right.latestTimestamp || 0).getTime();
        return rightTime - leftTime;
      })[0];

    if (existing) {
      void selectThread(existing);
    }
    setPendingAutoOpenPatientId(null);
  }, [pendingAutoOpenPatientId, threads]);

  const selectedConversation = useMemo(
    () => threads.find((entry) => getSummaryKey(entry) === selectedKey) || null,
    [selectedKey, threads]
  );

  const composerPatientLabel = resolvedPatient?.fullName || selectedThread?.patientName || selectedConversation?.patientName || "";

  if (!apiContext) {
    return (
      <Card title="Messages">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  const threadList = (
    <Card title="Conversations" style={isNarrow && detailMode === "thread" ? styles.hiddenPane : undefined}>
      <InlineActions>
        <ActionButton label="Refresh Messages" onPress={() => void loadThreads(resolvedPatient?.id)} />
        <ActionButton
          label="New Chain"
          onPress={() => {
            setDetailMode("new");
            setSelectedKey(null);
            setSelectedThread(null);
            setBody("");
          }}
          variant="secondary"
        />
      </InlineActions>
      <InputField
        label="Patient ID"
        value={patientInput}
        onChangeText={(value) => {
          setPatientInput(value);
          setResolvedPatient(null);
        }}
        placeholder="Patient ID to filter or start a new thread"
      />
      <InlineActions>
        <ActionButton
          label="Filter by Patient"
          onPress={async () => {
            try {
              const patient = await resolvePatientRecord();
              await loadThreads(patient.id);
            } catch (error) {
              showError(error);
            }
          }}
          variant="ghost"
        />
      </InlineActions>
      <MessageBanner message={statusMessage} tone={tone} />
      <View style={styles.threadList}>
        {threads.length > 0 ? (
          threads.map((thread) => {
            const active = getSummaryKey(thread) === selectedKey;
            return (
              <Pressable
                key={getSummaryKey(thread)}
                onPress={() => void selectThread(thread)}
                style={[
                  styles.threadCard,
                  { backgroundColor: T.surfaceAlt as string, borderColor: T.border },
                  active && { borderColor: T.teal, backgroundColor: T.tealGlow },
                ]}
              >
                <View style={styles.threadTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.threadPatient, { color: T.text }]}>
                      {thread.patientName || "Patient"}
                    </Text>
                    <Text style={[styles.threadMeta, { color: T.textMid }]}>
                      {thread.patientMrn || thread.patientId || "Unknown patient"}
                    </Text>
                  </View>
                  <Text style={[styles.threadMeta, { color: T.textMuted }]}>
                    {formatDateTime(thread.latestTimestamp)}
                  </Text>
                </View>
                <Text style={[styles.threadSubject, { color: T.text }]}>
                  {thread.subject || "Untitled conversation"}
                </Text>
                <Text numberOfLines={2} style={[styles.threadPreview, { color: T.textMid }]}>
                  {thread.latestPreview || "No preview yet"}
                </Text>
                <View style={styles.threadFooter}>
                  <Text style={[styles.threadMeta, { color: T.textMuted }]}>
                    {thread.latestFromPatient ? "Latest from patient" : "Latest from staff"}
                  </Text>
                  {thread.unreadCount > 0 ? (
                    <View style={[styles.unreadBadge, { backgroundColor: T.teal }]}>
                      <Text style={styles.unreadText}>{thread.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        ) : (
          <MessageBanner message="No conversations available yet." tone="info" />
        )}
      </View>
    </Card>
  );

  const detailPane = (
    <Card
      title={detailMode === "thread" ? "Thread" : "New Message"}
      style={isNarrow && detailMode !== "thread" ? undefined : undefined}
    >
      {isNarrow && detailMode === "thread" ? (
        <InlineActions>
          <ActionButton label="Back to Conversations" onPress={() => setDetailMode("new")} variant="ghost" />
        </InlineActions>
      ) : null}
      {detailMode === "thread" && selectedThread ? (
        <>
          <View style={[styles.threadHeader, { borderColor: T.border, backgroundColor: T.surfaceAlt as string }]}>
            <Text style={[styles.threadPatient, { color: T.text }]}>
              {selectedThread.patientName || composerPatientLabel || "Patient"}
            </Text>
            <Text style={[styles.threadMeta, { color: T.textMid }]}>
              {selectedThread.patientMrn || selectedThread.patientId || patientInput || "Unknown patient"}
            </Text>
            <Text style={[styles.threadSubject, { color: T.text }]}>
              {selectedThread.subject || "Untitled conversation"}
            </Text>
          </View>
          <InlineActions>
            <ActionButton label="Mark Thread Read" onPress={() => void markThreadRead()} variant="secondary" />
          </InlineActions>
          <View style={styles.messageList}>
            {selectedThread.messages.map((message) => {
              const fromPatient = (message.senderRole || "").toUpperCase() === "PATIENT";
              return (
                <View
                  key={message.id}
                  style={[
                    styles.messageBubble,
                    {
                      alignSelf: fromPatient ? "flex-start" : "flex-end",
                      backgroundColor: fromPatient ? T.surfaceAlt as string : T.tealGlow,
                      borderColor: fromPatient ? T.border : T.teal,
                    },
                  ]}
                >
                  <Text style={[styles.messageSender, { color: fromPatient ? T.textMid : T.teal }]}>
                    {message.senderName || (fromPatient ? "Patient" : "Staff")}
                  </Text>
                  <Text style={[styles.messageBody, { color: T.text }]}>{message.body}</Text>
                  <Text style={[styles.messageTime, { color: T.textMuted }]}>
                    {formatDateTime(message.createdAt)}
                  </Text>
                </View>
              );
            })}
          </View>
          <InputField label="Reply" value={body} onChangeText={setBody} multiline placeholder="Write your reply." />
          <InlineActions>
            <ActionButton label="Send Reply" onPress={() => void replyToThread()} />
          </InlineActions>
        </>
      ) : (
        <>
          <InputField
            label="Patient ID"
            value={patientInput}
            onChangeText={(value) => {
              setPatientInput(value);
              setResolvedPatient(null);
            }}
            placeholder="Patient ID"
          />
          {composerPatientLabel ? (
            <Text style={[styles.selectedPatientText, { color: T.textMid }]}>
              Patient: {composerPatientLabel}
            </Text>
          ) : null}
          <InputField label="Subject" value={subject} onChangeText={setSubject} placeholder="Subject" />
          <InputField label="Category" value={category} onChangeText={setCategory} placeholder="GENERAL" />
          <InputField label="Message" value={body} onChangeText={setBody} multiline placeholder="Write the message for the patient." />
          <InlineActions>
            <ActionButton label="Send Message" onPress={() => void startNewThread()} />
          </InlineActions>
        </>
      )}
    </Card>
  );

  return (
    <View style={[styles.layout, isNarrow ? styles.layoutNarrow : undefined]}>
      {threadList}
      {(!isNarrow || detailMode === "thread" || threads.length === 0) ? detailPane : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  layoutNarrow: {
    flexDirection: "column",
  },
  hiddenPane: {
    display: "none",
  },
  threadList: {
    gap: 10,
  },
  threadCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  threadTopRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  threadPatient: {
    fontSize: 15,
    fontWeight: "800",
  },
  threadSubject: {
    fontSize: 14,
    fontWeight: "700",
  },
  threadMeta: {
    fontSize: 12,
  },
  threadPreview: {
    fontSize: 13,
    lineHeight: 18,
  },
  threadFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  unreadBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: "center",
  },
  unreadText: {
    color: "#0b1623",
    fontSize: 11,
    fontWeight: "800",
  },
  threadHeader: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  messageList: {
    gap: 10,
  },
  messageBubble: {
    maxWidth: "88%",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  messageSender: {
    fontSize: 12,
    fontWeight: "800",
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
  },
  selectedPatientText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
