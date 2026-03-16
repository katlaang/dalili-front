import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ActionButton, Card, InlineActions, useTheme } from "../../components/ui";
import { useSession } from "../../state/session";
import { AdminScreen }        from "./AdminScreen";
import { AppointmentsScreen } from "./AppointmentsScreen";
import { EncountersScreen }   from "./EncountersScreen";
import { OverviewScreen }     from "./OverviewScreen";
import { PatientsScreen }     from "./PatientsScreen";
import { PortalOpsScreen }    from "./PortalOpsScreen";
import { ProfileScreen }      from "./ProfileScreen";
import { QueueScreen }        from "./QueueScreen";
import { TriageScreen }       from "./TriageScreen";

// ─── STAFF WORKSPACE ─────────────────────────────────────────────────────────
// Role → tabs mapping (the label "Doctor Workspace" is used instead of "Encounters"):
//   SUPER_ADMIN / ADMIN   → Profile · Admin Portal
//   RECEPTIONIST          → Profile · Appointments · Queue
//   NURSE                 → Profile · Overview · Patients · Appointments · Queue · Triage · Doctor Workspace · Portal Ops
//   PHYSICIAN             → Profile · Overview · Patients · Appointments · Queue · Doctor Workspace · Portal Ops
//   PHARMACIST / LAB_TECH → Profile · Overview · Portal Ops
//
// Key design rules:
//   • Role name is never shown to the user — only the permitted tabs are visible
//   • No role switcher
//   • Profile tab does NOT navigate away from clinical context — it opens as the active tab
//     while preserving all clinical state (ticket IDs etc.)
//   • Receptionist can book appointments (via AppointmentsScreen) and issue queue tickets
//   • Nurse can book appointments, message patients, open full triage view per patient
//   • Physician messages patients from inside the encounter workspace

const ALL_TABS = [
  "profile", "overview", "admin", "patients",
  "appointments", "queue", "triage", "encounters", "portal_ops",
] as const;
type StaffTab = (typeof ALL_TABS)[number];

const TAB_LABELS: Record<StaffTab, string> = {
  profile:      "My Profile",
  overview:     "Overview",
  admin:        "Admin Portal",
  patients:     "Patients",
  appointments: "Appointments",
  queue:        "Queue",
  triage:       "Triage",
  encounters:   "Doctor Workspace",
  portal_ops:   "Portal Ops",
};

function tabsForRole(role: string | null): StaffTab[] {
  const r = (role || "").toUpperCase();
  switch (r) {
    case "SUPER_ADMIN": return ["profile", "admin"];
    case "ADMIN":       return ["profile", "admin"];
    case "RECEPTIONIST":return ["profile", "appointments", "queue"];
    case "NURSE":       return ["profile", "overview", "patients", "appointments", "queue", "triage", "encounters", "portal_ops"];
    case "PHYSICIAN":   return ["profile", "overview", "patients", "appointments", "queue", "encounters", "portal_ops"];
    case "PHARMACIST":
    case "LAB_TECHNICIAN": return ["profile", "overview", "portal_ops"];
    default:            return [...ALL_TABS];
  }
}

interface StaffWorkspaceScreenProps {
  requestedTab?:          StaffTab | null;
  onRequestedTabHandled?: () => void;
}

export function StaffWorkspaceScreen({ requestedTab = null, onRequestedTabHandled }: StaffWorkspaceScreenProps) {
  const { width }   = useWindowDimensions();
  const { role }    = useSession();
  const { theme: T }= useTheme();

  const [tab,                      setTab]                      = useState<StaffTab>("queue");
  const [activeQueueTicketId,      setActiveQueueTicketId]      = useState("");
  const [activeTriageAssessmentId, setActiveTriageAssessmentId] = useState("");
  const [activeEncounterId,        setActiveEncounterId]        = useState("");
  const [messagingPatientId,       setMessagingPatientId]       = useState<string | null>(null);
  const [messagingPatientName,     setMessagingPatientName]     = useState("");

  const availableTabs  = useMemo(() => tabsForRole(role), [role]);
  const isDesktop      = width >= 980;
  const isNurse        = role === "NURSE";
  const isPhysician    = role === "PHYSICIAN";

  // External tab request (e.g. "Profile" button in header)
  React.useEffect(() => {
    if (!requestedTab) return;
    if (availableTabs.includes(requestedTab)) setTab(requestedTab);
    onRequestedTabHandled?.();
  }, [requestedTab, availableTabs, onRequestedTabHandled]);

  // Ensure current tab is always valid
  React.useEffect(() => {
    if (!availableTabs.includes(tab)) setTab(availableTabs[0] ?? "profile");
  }, [availableTabs, tab]);

  // ── Messaging handler (nurse / physician) ────────────────────────────────
  const handleOpenMessaging = useCallback((patientId: string, name: string) => {
    setMessagingPatientId(patientId);
    setMessagingPatientName(name);
    setTab("portal_ops");
  }, []);

  const handleBookAppointment = useCallback(() => {
    setTab("appointments");
  }, []);

  // ── Content rendering ────────────────────────────────────────────────────
  const content = useMemo(() => {
    switch (tab) {
      case "profile":
        return <ProfileScreen />;

      case "patients":
        return <PatientsScreen />;

      case "admin":
        return <AdminScreen />;

      case "appointments":
        return (
          <AppointmentsScreen
            onQueueTicketLinked={ticketId => {
              setActiveQueueTicketId(ticketId);
              setTab("queue");
            }}
          />
        );

      case "queue":
        return (
          <QueueScreen
            onMoveToTriage={ticketId => {
              setActiveQueueTicketId(ticketId);
              setTab("triage");
            }}
            onMoveToEncounter={ticketId => {
              setActiveQueueTicketId(ticketId);
              setTab("encounters");
            }}
            onOpenMessaging={(isNurse || isPhysician) ? handleOpenMessaging : undefined}
            onBookAppointment={handleBookAppointment}
          />
        );

      case "triage":
        return (
          <TriageScreen
            initialQueueTicketId={activeQueueTicketId}
            initialAssessmentId={activeTriageAssessmentId}
            onAssessmentLinked={payload => {
              if (payload.queueTicketId)  setActiveQueueTicketId(payload.queueTicketId);
              if (payload.assessmentId)   setActiveTriageAssessmentId(payload.assessmentId);
            }}
            onMoveToEncounter={queueTicketId => {
              setActiveQueueTicketId(queueTicketId);
              setTab("encounters");
            }}
            onBack={() => setTab("queue")}
          />
        );

      case "encounters":
        return (
          <EncountersScreen
            initialQueueTicketId={activeQueueTicketId}
            initialEncounterId={activeEncounterId}
            onEncounterLinked={id => setActiveEncounterId(id)}
            onOpenMessaging={(isNurse || isPhysician) ? handleOpenMessaging : undefined}
          />
        );

      case "portal_ops":
        return (
          <PortalOpsScreen
            prefillPatientId={messagingPatientId || undefined}
            prefillPatientName={messagingPatientName || undefined}
            onPrefillConsumed={() => { setMessagingPatientId(null); setMessagingPatientName(""); }}
          />
        );

      default:
        return <OverviewScreen />;
    }
  }, [
    tab, activeQueueTicketId, activeTriageAssessmentId, activeEncounterId,
    isNurse, isPhysician, handleOpenMessaging, handleBookAppointment,
    messagingPatientId, messagingPatientName,
  ]);

  const workflowTabs: StaffTab[] = ["patients", "appointments", "queue", "triage", "encounters"];
  const showWorkflow = availableTabs.some(t => workflowTabs.includes(t));

  return (
    <View style={[ss.layout, isDesktop && ss.layoutDesktop]}>
      {/* ── Sidebar nav ── */}
      <Card title="" style={[ss.navCard, isDesktop && ss.navCardDesktop]}>
        <View style={isDesktop ? ss.navDesktop : ss.navMobile}>
          {availableTabs.map(t => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[
                ss.navItem,
                { borderColor: T.border, backgroundColor: T.surfaceAlt as string },
                t === tab && { backgroundColor: T.teal, borderColor: T.teal },
              ]}
            >
              <Text style={[ss.navItemText, { color: T.textMid },
                t === tab && { color: "#fff" }
              ]}>
                {TAB_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {/* ── Content ── */}
      <View style={ss.content}>
        {/* Workflow shortcut strip (not shown for admin-only roles) */}
        {showWorkflow ? (
          <Card title="">
            <InlineActions>
              {workflowTabs
                .filter(t => availableTabs.includes(t))
                .map(t => (
                  <ActionButton
                    key={t}
                    label={TAB_LABELS[t]}
                    onPress={() => setTab(t)}
                    variant={tab === t ? "primary" : "secondary"}
                  />
                ))}
            </InlineActions>
          </Card>
        ) : null}

        {content}
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  layout:         { gap: 14 },
  layoutDesktop:  { flexDirection: "row", alignItems: "flex-start" },
  navCard:        { padding: 10, gap: 8 },
  navCardDesktop: { width: 210, alignSelf: "stretch" },
  navDesktop:     { gap: 7 },
  navMobile:      { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  navItem:        { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  navItemText:    { fontSize: 13, fontWeight: "600" },
  content:        { flex: 1, gap: 14 },
});
