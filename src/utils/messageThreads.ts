import type { MessageThreadDetail, MessageThreadSummary, PortalMessageView, SessionActor } from "../api/types";

function normalizeValue(value?: string | null) {
  return (value || "").trim();
}

export function getThreadLocalKey(message: Pick<PortalMessageView, "threadId" | "patientId" | "subject" | "category">) {
  if (message.threadId) return `thread:${message.threadId}`;
  return [
    "fallback",
    normalizeValue(message.patientId) || "unknown-patient",
    normalizeValue(message.subject) || "untitled",
    normalizeValue(message.category) || "general",
  ].join("::");
}

function getLatestTimestamp(message: PortalMessageView) {
  return message.createdAt || message.readAt || "";
}

function isUnreadForActor(message: PortalMessageView, actor: SessionActor) {
  if (message.readAt) return false;
  const senderRole = (message.senderRole || "").toUpperCase();
  if (actor === "PATIENT") {
    return senderRole !== "PATIENT";
  }
  return senderRole === "PATIENT";
}

export function buildMessageThreadSummaries(messages: PortalMessageView[], actor: SessionActor): MessageThreadSummary[] {
  const buckets = new Map<string, PortalMessageView[]>();

  messages.forEach((message) => {
    const key = getThreadLocalKey(message);
    const existing = buckets.get(key) || [];
    existing.push(message);
    buckets.set(key, existing);
  });

  return Array.from(buckets.entries())
    .map(([, bucket]) => {
      const ordered = [...bucket].sort((a, b) => {
        const aTime = new Date(getLatestTimestamp(a)).getTime();
        const bTime = new Date(getLatestTimestamp(b)).getTime();
        return bTime - aTime;
      });
      const latest = ordered[0];
      return {
        threadId: latest.threadId ?? null,
        patientId: latest.patientId ?? null,
        patientMrn: latest.patientMrn ?? null,
        patientName: latest.patientName ?? latest.recipientName ?? latest.senderName ?? null,
        subject: latest.subject ?? null,
        category: latest.category ?? null,
        latestPreview: latest.body || null,
        latestMessageId: latest.id,
        latestTimestamp: latest.createdAt ?? latest.readAt ?? null,
        latestSenderName: latest.senderName ?? null,
        latestSenderRole: latest.senderRole ?? null,
        latestFromPatient: (latest.senderRole || "").toUpperCase() === "PATIENT",
        unreadCount: ordered.filter((message) => isUnreadForActor(message, actor)).length,
        messageCount: ordered.length,
      } satisfies MessageThreadSummary;
    })
    .sort((a, b) => {
      const aTime = new Date(a.latestTimestamp || 0).getTime();
      const bTime = new Date(b.latestTimestamp || 0).getTime();
      return bTime - aTime;
    });
}

export function buildMessageThreadDetail(
  messages: PortalMessageView[],
  summary: Pick<MessageThreadSummary, "threadId" | "patientId" | "subject" | "category">,
  actor: SessionActor
): MessageThreadDetail {
  const key = summary.threadId
    ? `thread:${summary.threadId}`
    : [
        "fallback",
        normalizeValue(summary.patientId) || "unknown-patient",
        normalizeValue(summary.subject) || "untitled",
        normalizeValue(summary.category) || "general",
      ].join("::");

  const ordered = messages
    .filter((message) => getThreadLocalKey(message) === key)
    .sort((a, b) => {
      const aTime = new Date(getLatestTimestamp(a)).getTime();
      const bTime = new Date(getLatestTimestamp(b)).getTime();
      return aTime - bTime;
    });

  const latest = ordered[ordered.length - 1];
  return {
    threadId: summary.threadId ?? null,
    patientId: summary.patientId ?? latest?.patientId ?? null,
    patientMrn: latest?.patientMrn ?? null,
    patientName: latest?.patientName ?? latest?.recipientName ?? latest?.senderName ?? null,
    subject: summary.subject ?? latest?.subject ?? null,
    category: summary.category ?? latest?.category ?? null,
    latestTimestamp: latest?.createdAt ?? latest?.readAt ?? null,
    unreadCount: ordered.filter((message) => isUnreadForActor(message, actor)).length,
    messages: ordered,
  };
}
