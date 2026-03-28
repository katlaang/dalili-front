import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { facilityApi, patientApi, queueApi } from "../../api/services";
import type { QueueTicket } from "../../api/types";
import { queueCategoryOptions, triageLevelOptions } from "../../config/options";
import {
  ActionButton,
  Card,
  ChoiceChips,
  InlineActions,
  InputField,
  JsonPanel,
  MessageBanner,
  useTheme,
} from "../../components/ui";
import { triagePalette } from "../../constants/theme";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import {
  getPrimaryVulnerabilityColor,
  getVulnerabilityBadgeColors,
  getVulnerabilityMarkers,
} from "../../utils/vulnerability";

// ─── QUEUE SCREEN ─────────────────────────────────────────────────────────────
// Two completely separate queues:
//   • Triage Queue  — nurse calls patients here, performs triage, then sends to Doctor Queue
//   • Doctor Queue  — physician sees only this queue; label never says "physician queue"
//
// FIFO within the Doctor Queue, UNLESS the ticket has an appointment assigned to a
// specific physician — those rows show "Appointment · HH:MM" label and physician name.
//
// Receptionist: can issue tickets and book appointments. Cannot view clinical data.
// Nurse: sees Triage Queue + can open full triage view per patient.
// Physician: sees Doctor Queue only; clicking a row opens the encounter workspace.

interface QueueScreenProps {
  onMoveToTriage?:    (ticketId: string) => void;
  onMoveToEncounter?: (ticketId: string) => void;
  onOpenMessaging?:   (patientId: string, patientName: string) => void;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const formatTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDateTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const waitLabel = (mins?: number | null) => {
  if (mins == null) return "—";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

type TriageKey = keyof typeof triagePalette;
const TRIAGE_KEYS = Object.keys(triagePalette) as TriageKey[];

function TriageBadge({ level, scheme }: { level?: string | null; scheme: "dark" | "light" }) {
  if (!level) return null;
  const key = (level.toUpperCase().replace(" ", "_")) as TriageKey;
  const pal = triagePalette[key];
  if (!pal) return <Text style={{ fontSize: 11, color: "#888" }}>{level}</Text>;
  return (
    <View style={[qss.triageBadge, {
      backgroundColor: scheme === "dark" ? pal.bgDark : pal.bgLight,
      borderColor: pal.border,
    }]}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: scheme === "dark" ? pal.textDark : pal.textLight }}>
        {pal.label}
      </Text>
    </View>
  );
}

function VulnerabilityBadges({
  markers,
}: {
  markers: ReturnType<typeof getVulnerabilityMarkers>;
}) {
  if (markers.length === 0) return null;

  return (
    <View style={qss.vulnerabilityWrap}>
      {markers.map(marker => {
        const colors = getVulnerabilityBadgeColors(marker.tone);
        return (
          <View
            key={marker.key}
            style={[
              qss.vulnerabilityBadge,
              {
                backgroundColor: colors.backgroundColor,
                borderColor: colors.borderColor,
              },
            ]}
          >
            <Text style={[qss.vulnerabilityBadgeText, { color: colors.color }]}>{marker.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Patient Profile Modal (nurse + physician only) ───────────────────────────
interface ProfileModalProps {
  ticket:    QueueTicket;
  onClose:   () => void;
  onTriage?:     (ticketId: string) => void;
  onEncounter?:  (ticketId: string) => void;
  onMessage?:    (patientId: string, name: string) => void;
  scheme:    "dark" | "light";
  T:         Record<string, string>;
}

function PatientProfileModal({ ticket, onClose, onTriage, onEncounter, onMessage, scheme, T }: ProfileModalProps) {
  const name = ticket.patientName || ticket.patientId || "Patient";
  const vitals = (ticket as any).latestVitals || null;
  const vulnerabilityMarkers = getVulnerabilityMarkers({
    dateOfBirth: ticket.patientDateOfBirth,
    ageYears: ticket.patientAgeYears,
    ageInDays: ticket.patientAgeInDays,
    pregnancyStatus: ticket.pregnancyStatus,
    isPregnant: ticket.isPregnant,
    newborn: ticket.newborn,
    elderly: ticket.elderly,
    vulnerabilityIndicators: ticket.vulnerabilityIndicators,
  });
  const vulnerabilityAccent = getPrimaryVulnerabilityColor(vulnerabilityMarkers);

  const vitalColor = (val: number | null | undefined, low: number, high: number) => {
    if (val == null) return T.textMuted;
    if (val < low)   return "#3b82f6"; // blue = low
    if (val > high)  return "#f97316"; // orange = high
    return T.teal;                      // green = normal
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={[qss.modalOverlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
        <View style={[qss.modalCard, { backgroundColor: T.surface as string, borderColor: T.border }]}>
          <View style={qss.modalHeader}>
            <View>
              <Text style={[qss.modalTitle, { color: T.text }]}>{name}</Text>
              <Text style={[qss.modalSub, { color: T.textMuted }]}>
                {/* After triage completes, workflowNumber === patientNumber (permanent MRN-style ID).
                    Before triage it equals ticketNumber (e.g. G-042).  Always use workflowNumber. */}
                {ticket.workflowNumber || ticket.ticketNumber || ticket.id.slice(0, 8)}
                {ticket.triaged && ticket.patientNumber && ticket.patientNumber !== ticket.ticketNumber
                  ? `  ·  MRN ${ticket.patientNumber}` : ""}
                {ticket.appointmentId
                  ? `  ·  Appointment ${formatTime(ticket.appointmentScheduledAt)}`
                  : "  ·  Walk-in"}
              </Text>
              <VulnerabilityBadges markers={vulnerabilityMarkers} />
            </View>
            <Pressable onPress={onClose} style={qss.closeBtn}>
              <Text style={[qss.closeBtnText, { color: T.teal }]}>✕ Close</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, padding: 16 }}>
            {/* Triage level */}
            {ticket.triageLevel ? (
              <View style={qss.modalSection}>
                <Text style={[qss.modalSectionTitle, { color: T.textMid }]}>TRIAGE LEVEL</Text>
                <TriageBadge level={ticket.triageLevel} scheme={scheme} />
              </View>
            ) : null}

            {vulnerabilityMarkers.length > 0 ? (
              <View style={qss.modalSection}>
                <Text style={[qss.modalSectionTitle, { color: T.textMid }]}>VULNERABILITY MARKERS</Text>
                <View
                  style={[
                    qss.infoBox,
                    qss.vulnerabilityPanel,
                    {
                      backgroundColor: T.surfaceAlt as string,
                      borderColor: T.borderLight,
                      borderLeftColor: vulnerabilityAccent || T.borderLight,
                    },
                  ]}
                >
                  <VulnerabilityBadges markers={vulnerabilityMarkers} />
                </View>
              </View>
            ) : null}

            {/* Chief complaint */}
            {ticket.initialComplaint ? (
              <View style={qss.modalSection}>
                <Text style={[qss.modalSectionTitle, { color: T.textMid }]}>CHIEF COMPLAINT</Text>
                <View style={[qss.infoBox, { backgroundColor: T.surfaceAlt as string, borderColor: T.borderLight }]}>
                  <Text style={[{ color: T.text, fontSize: 14, lineHeight: 20 }]}>{ticket.initialComplaint}</Text>
                </View>
              </View>
            ) : null}

            {/* Vitals grid */}
            {vitals ? (
              <View style={qss.modalSection}>
                <Text style={[qss.modalSectionTitle, { color: T.textMid }]}>VITALS</Text>
                <View style={qss.vitalsGrid}>
                  {[
                    { label: "BP", value: vitals.bloodPressureSystolic != null ? `${vitals.bloodPressureSystolic}/${vitals.bloodPressureDiastolic}` : null, low: 90, high: 140, unit: "mmHg" },
                    { label: "HR", value: vitals.heartRateBpm, low: 60, high: 100, unit: "bpm" },
                    { label: "SpO₂", value: vitals.oxygenSaturation, low: 95, high: 100, unit: "%" },
                    { label: "Temp", value: vitals.temperatureCelsius, low: 36.1, high: 37.2, unit: "°C" },
                    { label: "RR", value: vitals.respiratoryRate, low: 12, high: 20, unit: "/min" },
                    { label: "Pain", value: vitals.painScore, low: 0, high: 3, unit: "/10" },
                  ].map(v => (
                    <View key={v.label} style={[qss.vitalCard, { backgroundColor: T.surfaceAlt as string, borderColor: T.borderLight }]}>
                      <Text style={[qss.vitalLabel, { color: T.textMuted }]}>{v.label}</Text>
                      <Text style={[qss.vitalValue, {
                        color: typeof v.value === "number"
                          ? vitalColor(v.value, v.low, v.high)
                          : v.value != null ? T.teal : T.textMuted
                      }]}>
                        {v.value != null ? `${v.value}${v.unit}` : "—"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Appointment info */}
            {ticket.appointmentId ? (
              <View style={qss.modalSection}>
                <Text style={[qss.modalSectionTitle, { color: T.textMid }]}>APPOINTMENT</Text>
                <View style={[qss.infoBox, { backgroundColor: T.surfaceAlt as string, borderColor: T.borderLight }]}>
                  <Text style={[{ color: T.text, fontSize: 13 }]}>
                    {formatDateTime(ticket.appointmentScheduledAt)}
                  </Text>
                  {ticket.assignedClinicianName ? (
                    <Text style={[{ color: T.textMid, fontSize: 13, marginTop: 4 }]}>
                      Physician: {ticket.assignedClinicianName}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Wait time */}
            <View style={qss.modalSection}>
              <Text style={[qss.modalSectionTitle, { color: T.textMid }]}>WAIT TIME</Text>
              <Text style={[{ color: T.text, fontSize: 18, fontWeight: "700" }]}>
                {waitLabel(ticket.waitTimeMinutes)}
              </Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={[qss.modalActions, { borderTopColor: T.border }]}>
            {onMessage && ticket.patientId ? (
              <Pressable
                onPress={() => onMessage(ticket.patientId!, name)}
                style={[qss.modalActionBtn, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}
              >
                <Text style={[qss.modalActionBtnText, { color: T.teal }]}>✉ Message</Text>
              </Pressable>
            ) : null}
            {onTriage ? (
              <Pressable
                onPress={() => { onTriage(ticket.id); onClose(); }}
                style={[qss.modalActionBtn, { backgroundColor: T.teal, borderColor: T.teal }]}
              >
                <Text style={[qss.modalActionBtnText, { color: "#fff" }]}>Open Triage →</Text>
              </Pressable>
            ) : null}
            {onEncounter ? (
              <Pressable
                onPress={() => { onEncounter(ticket.id); onClose(); }}
                style={[qss.modalActionBtn, { backgroundColor: T.teal, borderColor: T.teal }]}
              >
                <Text style={[qss.modalActionBtnText, { color: "#fff" }]}>Begin Encounter →</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Queue Row ────────────────────────────────────────────────────────────────
function QueueRow({
  ticket, role, onView, T, scheme,
}: {
  ticket: QueueTicket;
  role: string | null;
  onView: (t: QueueTicket) => void;
  T: Record<string, string>;
  scheme: "dark" | "light";
}) {
  const isAppt = !!ticket.appointmentId;
  const key = (ticket.triageLevel?.toUpperCase() || "") as TriageKey;
  const pal = triagePalette[key];
  const borderColor = pal?.border || T.border;
  const vulnerabilityMarkers = getVulnerabilityMarkers({
    dateOfBirth: ticket.patientDateOfBirth,
    ageYears: ticket.patientAgeYears,
    ageInDays: ticket.patientAgeInDays,
    pregnancyStatus: ticket.pregnancyStatus,
    isPregnant: ticket.isPregnant,
    newborn: ticket.newborn,
    elderly: ticket.elderly,
    vulnerabilityIndicators: ticket.vulnerabilityIndicators,
  });
  const vulnerabilityAccent = getPrimaryVulnerabilityColor(vulnerabilityMarkers);

  return (
    <View style={[qss.row, {
      backgroundColor: T.surface as string,
      borderColor: T.border,
      borderLeftColor: borderColor,
    }]}>
      {/* Left: identifier + triage badge.
           workflowNumber === patientNumber (permanent MRN-style) after triage completes.
           workflowNumber === ticketNumber (e.g. G-042) before triage.
           Always render workflowNumber so the correct identifier is shown automatically. */}
      <View style={qss.rowLeft}>
        <Text style={[qss.rowTicket, { color: T.teal }]}>
          {ticket.workflowNumber || ticket.ticketNumber || "—"}
        </Text>
        {ticket.triaged && ticket.patientNumber && ticket.patientNumber !== ticket.ticketNumber ? (
          <Text style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>
            MRN {ticket.patientNumber}
          </Text>
        ) : null}
        {ticket.triageLevel ? (
          <TriageBadge level={ticket.triageLevel} scheme={scheme} />
        ) : null}
      </View>

      {/* Centre: name / appointment label */}
      <View style={qss.rowCentre}>
        {vulnerabilityAccent ? (
          <View style={[qss.vulnerabilityAccentBlock, { borderLeftColor: vulnerabilityAccent }]} />
        ) : null}
        <VulnerabilityBadges markers={vulnerabilityMarkers} />
        <Text style={[qss.rowName, { color: T.text }]} numberOfLines={1}>
          {ticket.patientName || ticket.patientId || "—"}
        </Text>
        {isAppt ? (
          <View style={[qss.apptChip, { backgroundColor: scheme === "dark" ? "#1a3a52" : "#e0f2f1", borderColor: T.teal + "60" }]}>
            <Text style={[qss.apptChipText, { color: T.teal }]}>
              📅 Appointment · {formatTime(ticket.appointmentScheduledAt)}
              {ticket.assignedClinicianName ? `  · ${ticket.assignedClinicianName}` : ""}
            </Text>
          </View>
        ) : (
          <Text style={[qss.rowSub, { color: T.textMuted }]}>Walk-in</Text>
        )}
        {ticket.initialComplaint ? (
          <Text style={[qss.rowComplaint, { color: T.textMid }]} numberOfLines={1}>
            {ticket.initialComplaint}
          </Text>
        ) : null}
      </View>

      {/* Right: wait + action */}
      <View style={qss.rowRight}>
        <Text style={[qss.rowWait, { color: T.textMuted }]}>{waitLabel(ticket.waitTimeMinutes)}</Text>
        {(role === "NURSE" || role === "PHYSICIAN") ? (
          <Pressable onPress={() => onView(ticket)}
            style={[qss.viewBtn, { backgroundColor: T.teal }]}>
            <Text style={qss.viewBtnText}>View →</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export function QueueScreen({ onMoveToTriage, onMoveToEncounter, onOpenMessaging }: QueueScreenProps) {
  const { apiContext, role } = useSession();
  const { theme: T } = useTheme();

  const isNurse        = role === "NURSE";
  const isPhysician    = role === "PHYSICIAN";
  const isReceptionist = role === "RECEPTIONIST";
  const canClinical    = isNurse || isPhysician;

  // Which queue does this role see by default?
  const defaultQueueView = isPhysician ? "consultation" : "triage";
  const [queueView, setQueueView]         = useState(defaultQueueView);
  const [rows,      setRows]              = useState<QueueTicket[]>([]);
  const [stats,     setStats]             = useState<unknown>(null);
  const [selected,  setSelected]          = useState<QueueTicket | null>(null);
  const [message,   setMessage]           = useState<string | null>(null);
  const [tone,      setTone]              = useState<"success" | "error">("success");

  // Issue ticket form
  const [issuePatientId,   setIssuePatientId]   = useState("");
  const [issueCategory,    setIssueCategory]    = useState("GENERAL");
  const [issueComplaint,   setIssueComplaint]   = useState("");
  const [issueEmergency,   setIssueEmergency]   = useState(false);
  const [emergencyEnabled, setEmergencyEnabled] = useState(true);

  // Call-next counters
  const [triageCounter, setTriageCounter]       = useState("Triage Room 1");
  const [doctorCounter, setDoctorCounter]       = useState("Consult Room 1");

  // Ticket actions
  const [ticketId, setTicketId]       = useState("");
  const [escalateLevel, setEscalateLevel] = useState("ORANGE");
  const [escalateReason, setEscalateReason] = useState("");
  const [admitReason, setAdmitReason] = useState("");
  const [latestTicket, setLatestTicket] = useState<unknown>(null);

  const err = (e: unknown) => { setMessage(toErrorMessage(e)); setTone("error"); };
  const ok  = (s: string)  => { setMessage(s); setTone("success"); };

  useEffect(() => {
    if (!apiContext) return;
    facilityApi.getWorkflowConfig(apiContext)
      .then(c => { setEmergencyEnabled(c.emergencyFlowEnabled); })
      .catch(() => {});
  }, [apiContext]);

  // Physician only ever sees the doctor queue — don't offer other views
  const availableViews = useMemo(() => {
    if (isPhysician) return [{ key: "consultation", label: "Doctor Queue" }];
    if (isNurse)     return [
      { key: "triage",        label: "Triage Queue"  },
      { key: "consultation",  label: "Doctor Queue"  },
      { key: "waiting",       label: "All Waiting"   },
      { key: "today",         label: "Today"         },
    ];
    return [
      { key: "triage",       label: "Triage Queue"  },
      { key: "consultation", label: "Doctor Queue"  },
      { key: "today",        label: "Today"         },
    ];
  }, [isPhysician, isNurse]);

  useEffect(() => {
    const valid = availableViews.some(v => v.key === queueView);
    if (!valid) setQueueView(availableViews[0].key);
  }, [availableViews, queueView]);

  const loadQueue = async () => {
    if (!apiContext) return;
    try {
      const data = await queueApi.getQueue(apiContext, queueView as any);
      setRows(data);
      ok(`Loaded ${data.length} ticket(s)`);
    } catch (e) { err(e); }
  };

  const loadStats = async () => {
    if (!apiContext) return;
    try { setStats(await queueApi.getStats(apiContext)); ok("Stats loaded"); }
    catch (e) { err(e); }
  };

  const issueTicket = async () => {
    if (!apiContext) return;
    try {
      const patient = await patientApi.getByMrn(apiContext, issuePatientId.trim());
      const t = issueEmergency
        ? await queueApi.issueEmergencyTicket(apiContext, { patientId: patient.id, initialComplaint: issueComplaint })
        : await queueApi.issueTicket(apiContext, { patientId: patient.id, category: issueCategory, initialComplaint: isReceptionist ? null : issueComplaint || null });
      setLatestTicket(t); setTicketId(t.id);
      ok(issueEmergency ? "Emergency ticket issued" : "Ticket issued");
    } catch (e) { err(e); }
  };

  const callNextTriage = async () => {
    if (!apiContext) return;
    try {
      const t = await queueApi.callNextTriage(apiContext, triageCounter);
      setLatestTicket(t); setTicketId(t.id);
      ok("Called next triage patient");
    } catch (e) { err(e); }
  };

  const callNextDoctor = async () => {
    if (!apiContext) return;
    try {
      const t = await queueApi.callNextConsultation(apiContext, doctorCounter);
      setLatestTicket(t); setTicketId(t.id);
      ok("Called next patient");
    } catch (e) { err(e); }
  };

  const callNextDoctorAndOpen = async () => {
    if (!apiContext) return;
    try {
      const t = await queueApi.callNextConsultation(apiContext, doctorCounter);
      setLatestTicket(t); setTicketId(t.id);
      onMoveToEncounter?.(t.id);
    } catch (e) { err(e); }
  };

  const ticketAction = async (action: "missed" | "start" | "return_waiting" | "complete" | "admit" | "no_show" | "cancel") => {
    if (!apiContext) return;
    try {
      const id = ticketId.trim();
      let t: unknown;
      if (action === "missed")         t = await queueApi.markMissedCall(apiContext, id);
      else if (action === "start")     t = await queueApi.startTicket(apiContext, id);
      else if (action === "return_waiting") t = await queueApi.returnToWaiting(apiContext, id);
      else if (action === "complete")  t = await queueApi.completeTicket(apiContext, id);
      else if (action === "admit")     t = await queueApi.admitTicket(apiContext, id, admitReason || undefined);
      else if (action === "no_show")   t = await queueApi.markNoShow(apiContext, id);
      else                             t = await queueApi.cancelTicket(apiContext, id);
      setLatestTicket(t); ok(`Action: ${action}`);
    } catch (e) { err(e); }
  };

  const escalate = async () => {
    if (!apiContext) return;
    try {
      const t = await queueApi.escalateTicket(apiContext, ticketId.trim(), escalateLevel, escalateReason);
      setLatestTicket(t); ok("Escalated");
    } catch (e) { err(e); }
  };

  // Patient profile row click
  const handleRowView = (ticket: QueueTicket) => {
    setTicketId(ticket.id);
    setSelected(ticket);
  };

  const handleProfileTriage = (id: string) => {
    setSelected(null);
    onMoveToTriage?.(id);
  };

  const handleProfileEncounter = (id: string) => {
    setSelected(null);
    onMoveToEncounter?.(id);
  };

  if (!apiContext) {
    return <Card title="Queue"><MessageBanner message="No authenticated session." tone="error" /></Card>;
  }

  const currentViewLabel = availableViews.find(v => v.key === queueView)?.label || queueView;

  return (
    <>
      {/* Patient profile modal */}
      {selected ? (
        <PatientProfileModal
          ticket={selected}
          onClose={() => setSelected(null)}
          onTriage={isNurse && !selected.triaged ? handleProfileTriage : undefined}
          onEncounter={(isNurse && selected.triaged) || isPhysician ? handleProfileEncounter : undefined}
          onMessage={(isNurse || isPhysician) && onOpenMessaging ? onOpenMessaging : undefined}
          scheme={T.scheme}
          T={T as any}
        />
      ) : null}

      {/* Queue view selector */}
      <Card title="Queue">
        <View style={qss.viewTabs}>
          {availableViews.map(v => (
            <Pressable key={v.key} onPress={() => setQueueView(v.key)}
              style={[qss.viewTab, { borderColor: T.border, backgroundColor: T.surfaceAlt as string },
                queueView === v.key && { backgroundColor: T.teal, borderColor: T.teal }
              ]}>
              <Text style={[qss.viewTabText, { color: queueView === v.key ? "#fff" : T.textMid }]}>{v.label}</Text>
            </Pressable>
          ))}
        </View>
        <InlineActions>
          <ActionButton label="Refresh Queue" onPress={loadQueue} />
          <ActionButton label="Queue Stats" onPress={loadStats} variant="secondary" />
        </InlineActions>
        <MessageBanner message={message} tone={tone} />
      </Card>

      {/* Live queue rows */}
      {canClinical && rows.length > 0 ? (
        <Card title={`${currentViewLabel} (${rows.length})`}>
          <View style={{ gap: 8 }}>
            {rows.map(r => (
              <QueueRow
                key={r.id}
                ticket={r}
                role={role}
                onView={handleRowView}
                T={T as any}
                scheme={T.scheme}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {/* Issue ticket — all roles */}
      <Card title="Issue Ticket">
        <InputField label="Patient ID" value={issuePatientId} onChangeText={setIssuePatientId} />
        <ChoiceChips label="Category" options={queueCategoryOptions} value={issueCategory} onChange={setIssueCategory} />
        {!isReceptionist ? (
          <InputField label="Chief Complaint" value={issueComplaint} onChangeText={setIssueComplaint} multiline />
        ) : (
          <MessageBanner message="Reception mode: symptoms are not collected before triage." tone="info" />
        )}
        <InlineActions>
          <ActionButton
            label={issueEmergency ? "Issue Emergency Ticket" : "Issue Standard Ticket"}
            onPress={issueTicket}
            variant={issueEmergency ? "danger" : "primary"}
          />
          {emergencyEnabled && !isReceptionist ? (
            <ActionButton
              label={issueEmergency ? "Switch to Standard" : "Switch to Emergency"}
              onPress={() => setIssueEmergency(v => !v)}
              variant="ghost"
            />
          ) : null}
        </InlineActions>
      </Card>

      {/* Appointment booking — receptionist + nurse */}
      {/* Call Next */}
      <Card title="Call Next">
        {!isPhysician ? (
          <>
            <InputField label="Triage Counter" value={triageCounter} onChangeText={setTriageCounter} />
            <InlineActions>
              <ActionButton label="Call Next — Triage" onPress={callNextTriage} />
            </InlineActions>
          </>
        ) : null}
        {!isNurse ? (
          <>
            <InputField label="Doctor Queue Counter" value={doctorCounter} onChangeText={setDoctorCounter} />
            <InlineActions>
              <ActionButton label="Call Next — Doctor Queue" onPress={callNextDoctor} variant="secondary" />
              <ActionButton label="Call Next + Open Encounter" onPress={callNextDoctorAndOpen} variant="secondary" />
            </InlineActions>
          </>
        ) : null}
      </Card>

      {/* Ticket Actions */}
      {!canClinical ? (
      <Card title="Ticket Actions">
        <InputField label="Selected Ticket" value={ticketId} onChangeText={setTicketId} />
        <InlineActions>
          <ActionButton label="Start Session"     onPress={() => ticketAction("start")}          variant="secondary" />
          <ActionButton label="Return to Waiting" onPress={() => ticketAction("return_waiting")} variant="secondary" />
          <ActionButton label="Complete"          onPress={() => ticketAction("complete")}        variant="secondary" />
          <ActionButton label="Missed Call"       onPress={() => ticketAction("missed")}          variant="ghost"     />
          <ActionButton label="Admit Patient"     onPress={() => ticketAction("admit")}           variant="secondary" />
          <ActionButton label="No-Show"           onPress={() => ticketAction("no_show")}         variant="danger"    />
          <ActionButton label="Cancel"            onPress={() => ticketAction("cancel")}          variant="danger"    />
        </InlineActions>
        <InputField label="Admission Reason (optional)" value={admitReason} onChangeText={setAdmitReason} multiline />
        <ChoiceChips label="Escalate to" options={triageLevelOptions} value={escalateLevel} onChange={setEscalateLevel} />
        <InputField label="Escalation Reason" value={escalateReason} onChangeText={setEscalateReason} multiline />
        <InlineActions>
          <ActionButton label="Escalate Priority" onPress={escalate} variant="danger" />
          <ActionButton label="→ Triage"          onPress={() => { if (ticketId.trim()) { onMoveToTriage?.(ticketId.trim()); }}}   variant="secondary" />
          {onMoveToEncounter ? (
            <ActionButton label="→ Encounter" onPress={() => { if (ticketId.trim()) { onMoveToEncounter(ticketId.trim()); }}} variant="secondary" />
          ) : null}
        </InlineActions>
      </Card>
      ) : null}

      {stats ? (
        <Card title="Queue Stats"><JsonPanel value={stats} /></Card>
      ) : null}
      {latestTicket ? (
        <Card title="Latest Ticket"><JsonPanel value={latestTicket} /></Card>
      ) : null}
    </>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const qss = StyleSheet.create({
  viewTabs:      { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  viewTab:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  viewTabText:   { fontSize: 12, fontWeight: "700" },
  row:           { borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  rowLeft:       { width: 70, gap: 5, alignItems: "flex-start" },
  rowTicket:     { fontSize: 14, fontWeight: "800" },
  rowCentre:     { flex: 1, gap: 4 },
  rowNameWrap:   { flexDirection: "row", alignItems: "center", gap: 8 },
  rowName:       { fontSize: 14, fontWeight: "700" },
  rowSub:        { fontSize: 11 },
  rowComplaint:  { fontSize: 12 },
  vulnerabilityAccent: { width: 4, minHeight: 18, borderRadius: 999 },
  vulnerabilityAccentBlock: { alignSelf: "stretch", borderLeftWidth: 4, borderRadius: 999, minHeight: 18 },
  vulnerabilityWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  vulnerabilityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  vulnerabilityBadgeText: { fontSize: 10, fontWeight: "700" },
  rowRight:      { alignItems: "flex-end", gap: 6 },
  rowWait:       { fontSize: 11 },
  viewBtn:       { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  viewBtnText:   { fontSize: 12, fontWeight: "700", color: "#fff" },
  triageBadge:   { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  apptChip:      { flexDirection: "row", alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  apptChipText:  { fontSize: 11, fontWeight: "600" },
  // Modal
  modalOverlay:  { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard:     { width: "100%", maxWidth: 520, maxHeight: "90%", borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  modalHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  modalTitle:    { fontSize: 18, fontWeight: "800" },
  modalSub:      { fontSize: 12, marginTop: 3 },
  closeBtn:      { padding: 4 },
  closeBtnText:  { fontSize: 13, fontWeight: "700" },
  modalSection:  { gap: 6 },
  modalSectionTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  infoBox:       { borderWidth: 1, borderRadius: 10, padding: 12 },
  vulnerabilityPanel: { borderLeftWidth: 4 },
  vitalsGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  vitalCard:     { width: "30%", minWidth: 80, borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  vitalLabel:    { fontSize: 10, fontWeight: "700" },
  vitalValue:    { fontSize: 16, fontWeight: "800" },
  modalActions:  { flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, flexWrap: "wrap" },
  modalActionBtn:{ flex: 1, minWidth: 100, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  modalActionBtnText: { fontSize: 13, fontWeight: "700" },
});
