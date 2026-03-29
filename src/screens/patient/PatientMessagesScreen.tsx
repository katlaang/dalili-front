import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { patientPortalApi } from "../../api/services";
import type { MessageThreadDetail, MessageThreadSummary, PortalMessageView } from "../../api/types";
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
import { formatDateTime } from "../staff/patientServiceUtils";

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

export function PatientMessagesScreen() {
  const { apiContext } = useSession();
  const { theme: T } = useTheme();
  const { width } = useWindowDimensions();
  const isNarrow = width < 980;

  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [flatMessages, setFlatMessages] = useState<PortalMessageView[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<MessageThreadDetail | null>(null);
  const [detailMode, setDetailMode] = useState<"thread" | "new">("new");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");

  const showError = (error: unknown) => {
    setStatusMessage(toErrorMessage(error));
    setTone("error");
  };

  const showSuccess = (text: string) => {
    setStatusMessage(text);
    setTone("success");
  };

  const loadThreads = async () => {
    if (!apiContext) return;
    try {
      const summaries = await patientPortalApi.getMessageThreads(apiContext);
      setThreads(summaries);
      setFlatMessages([]);
      showSuccess(`Showing ${summaries.length} conversation(s)`);
    } catch (threadError) {
      try {
        const messages = await patientPortalApi.getMessages(apiContext);
        setFlatMessages(messages);
        setThreads(buildMessageThreadSummaries(messages, "PATIENT"));
        showSuccess(`Showing ${messages.length} message(s) in fallback inbox mode`);
      } catch (fallbackError) {
        showError(fallbackError || threadError);
      }
    }
  };

  const selectThread = async (summary: MessageThreadSummary) => {
    if (!apiContext) return;
    setSelectedKey(getSummaryKey(summary));
    setDetailMode("thread");
    setSubject(summary.subject || "");

    if (summary.threadId) {
      try {
        const detail = await patientPortalApi.getMessageThread(apiContext, summary.threadId);
        setSelectedThread(detail);
        return;
      } catch {
      }
    }

    if (flatMessages.length > 0) {
      setSelectedThread(buildMessageThreadDetail(flatMessages, summary, "PATIENT"));
      return;
    }

    try {
      const messages = await patientPortalApi.getMessages(apiContext);
      setFlatMessages(messages);
      setSelectedThread(buildMessageThreadDetail(messages, summary, "PATIENT"));
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
    await loadThreads();
  };

  const startThread = async () => {
    if (!apiContext) return;
    try {
      if (!body.trim()) {
        throw new Error("Message body is required");
      }

      try {
        const detail = await patientPortalApi.createMessageThread(apiContext, {
          category,
          subject: subject.trim() || undefined,
          body: body.trim(),
        });
        setSelectedThread(detail);
        setSelectedKey(detail.threadId ? `thread:${detail.threadId}` : null);
        setDetailMode("thread");
      } catch {
        await patientPortalApi.sendMessage(apiContext, {
          category,
          subject: subject.trim() || undefined,
          body: body.trim(),
        });
      }

      setBody("");
      showSuccess("Message sent");
      await loadThreads();
    } catch (error) {
      showError(error);
    }
  };

  const replyToThread = async () => {
    if (!apiContext || !selectedThread) return;
    try {
      if (!body.trim()) {
        throw new Error("Reply body is required");
      }

      if (selectedThread.threadId) {
        try {
          const detail = await patientPortalApi.replyToThread(apiContext, selectedThread.threadId, {
            category: selectedThread.category || category,
            body: body.trim(),
          });
          setSelectedThread(detail);
          setBody("");
          showSuccess("Reply sent");
          await loadThreads();
          return;
        } catch {
        }
      }

      await patientPortalApi.sendMessage(apiContext, {
        category: selectedThread.category || category,
        subject: selectedThread.subject || subject || undefined,
        body: body.trim(),
      });
      setBody("");
      showSuccess("Reply sent");
      await loadThreads();
      await refreshSelectedThread();
    } catch (error) {
      showError(error);
    }
  };

  const markThreadRead = async () => {
    if (!apiContext || !selectedThread) return;
    try {
      const unread = selectedThread.messages.filter(
        (message) => !message.readAt && (message.senderRole || "").toUpperCase() !== "PATIENT"
      );
      await Promise.all(unread.map((message) => patientPortalApi.markMessageRead(apiContext, message.id)));
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

  const selectedConversation = useMemo(
    () => threads.find((entry) => getSummaryKey(entry) === selectedKey) || null,
    [selectedKey, threads]
  );

  if (!apiContext) {
    return (
      <Card title="Messages">
        <MessageBanner message="No authenticated patient session." tone="error" />
      </Card>
    );
  }

  const listPane = (
    <Card title="Messages" style={isNarrow && detailMode === "thread" ? styles.hiddenPane : undefined}>
      <InlineActions>
        <ActionButton label="Refresh Messages" onPress={() => void loadThreads()} />
        <ActionButton
          label="New Chain"
          onPress={() => {
            setSelectedKey(null);
            setSelectedThread(null);
            setDetailMode("new");
            setBody("");
          }}
          variant="secondary"
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
                      {thread.subject || "Untitled conversation"}
                    </Text>
                    <Text style={[styles.threadMeta, { color: T.textMid }]}>
                      {thread.latestFromPatient ? "Latest from you" : "Latest from staff"}
                    </Text>
                  </View>
                  <Text style={[styles.threadMeta, { color: T.textMuted }]}>
                    {formatDateTime(thread.latestTimestamp)}
                  </Text>
                </View>
                <Text numberOfLines={2} style={[styles.threadPreview, { color: T.textMid }]}>
                  {thread.latestPreview || "No preview yet"}
                </Text>
                <View style={styles.threadFooter}>
                  <Text style={[styles.threadMeta, { color: T.textMuted }]}>
                    {thread.messageCount} message{thread.messageCount === 1 ? "" : "s"}
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
    <Card title={detailMode === "thread" ? "Conversation" : "New Message"}>
      {isNarrow && detailMode === "thread" ? (
        <InlineActions>
          <ActionButton label="Back to Messages" onPress={() => setDetailMode("new")} variant="ghost" />
        </InlineActions>
      ) : null}
      {detailMode === "thread" && selectedThread ? (
        <>
          <View style={[styles.threadHeader, { borderColor: T.border, backgroundColor: T.surfaceAlt as string }]}>
            <Text style={[styles.threadPatient, { color: T.text }]}>
              {selectedThread.subject || selectedConversation?.subject || "Conversation"}
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
                      alignSelf: fromPatient ? "flex-end" : "flex-start",
                      backgroundColor: fromPatient ? T.tealGlow : T.surfaceAlt as string,
                      borderColor: fromPatient ? T.teal : T.border,
                    },
                  ]}
                >
                  <Text style={[styles.messageSender, { color: fromPatient ? T.teal : T.textMid }]}>
                    {message.senderName || (fromPatient ? "You" : "Staff")}
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
          <InputField label="Subject" value={subject} onChangeText={setSubject} placeholder="Subject" />
          <InputField label="Category" value={category} onChangeText={setCategory} placeholder="GENERAL" />
          <InputField label="Message" value={body} onChangeText={setBody} multiline placeholder="Write your message." />
          <InlineActions>
            <ActionButton label="Send Message" onPress={() => void startThread()} />
          </InlineActions>
        </>
      )}
    </Card>
  );

  return (
    <View style={[styles.layout, isNarrow ? styles.layoutNarrow : undefined]}>
      {listPane}
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
});
