import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ActionButton, Card, InlineActions, useTheme } from "../../components/ui";
import { useSession } from "../../state/session";
import { AdminScreen } from "./AdminScreen";
import { AppointmentsScreen } from "./AppointmentsScreen";
import { EncountersScreen } from "./EncountersScreen";
import { MessagesScreen } from "./MessagesScreen";
import { OverviewScreen } from "./OverviewScreen";
import { PatientAccessScreen } from "./PatientAccessScreen";
import { PatientsScreen } from "./PatientsScreen";
import { ProfileScreen } from "./ProfileScreen";
import { QueueScreen } from "./QueueScreen";
import { ReferralsScreen } from "./ReferralsScreen";
import { RequestsScreen } from "./RequestsScreen";
import { TriageScreen } from "./TriageScreen";
import { UsersScreen } from "./UsersScreen";

const ALL_TABS = [
  "profile",
  "overview",
  "admin",
  "users",
  "patients",
  "appointments",
  "queue",
  "triage",
  "encounters",
  "patient_access",
  "messages",
  "referrals",
  "requests",
] as const;

type StaffTab = (typeof ALL_TABS)[number];

const TAB_LABELS: Record<StaffTab, string> = {
  profile: "My Profile",
  overview: "Dashboard",
  admin: "Admin Portal",
  users: "Users",
  patients: "Patients",
  appointments: "Appointments",
  queue: "Queue",
  triage: "Triage",
  encounters: "Doctor Workspace",
  patient_access: "Data Access",
  messages: "Messages",
  referrals: "Referrals",
  requests: "Requests",
};

function tabsForRole(role: string | null): StaffTab[] {
  const normalized = (role || "").toUpperCase();
  switch (normalized) {
    case "SUPER_ADMIN":
      return [...ALL_TABS];
    case "ADMIN":
      return [...ALL_TABS];
    case "RECEPTIONIST":
      return ["profile", "appointments", "queue"];
    case "NURSE":
      return ["profile", "overview", "patients", "appointments", "queue", "triage", "patient_access", "messages", "referrals"];
    case "PHYSICIAN":
      return [
        "profile",
        "overview",
        "patients",
        "appointments",
        "queue",
        "encounters",
        "patient_access",
        "messages",
        "referrals",
        "requests",
      ];
    case "PHARMACIST":
    case "LAB_TECHNICIAN":
      return ["profile", "overview", "patient_access", "messages", "referrals", "requests"];
    default:
      return [...ALL_TABS];
  }
}

interface StaffWorkspaceScreenProps {
  requestedTab?: StaffTab | null;
  onRequestedTabHandled?: () => void;
  onOpenChangePassword?: () => void;
}

export function StaffWorkspaceScreen({
  requestedTab = null,
  onRequestedTabHandled,
  onOpenChangePassword,
}: StaffWorkspaceScreenProps) {
  const { width } = useWindowDimensions();
  const { role } = useSession();
  const { theme: T } = useTheme();
  const availableTabs = useMemo(() => tabsForRole(role), [role]);
  const sidebarTabs = useMemo(() => availableTabs.filter((entry) => entry !== "profile"), [availableTabs]);
  const defaultTab = useMemo<StaffTab>(() => sidebarTabs[0] ?? availableTabs[0] ?? "profile", [availableTabs, sidebarTabs]);

  const [tab, setTab] = useState<StaffTab>(defaultTab);
  const [activeQueueTicketId, setActiveQueueTicketId] = useState("");
  const [activeTriageAssessmentId, setActiveTriageAssessmentId] = useState("");
  const [activeEncounterId, setActiveEncounterId] = useState("");
  const [messagingPatientId, setMessagingPatientId] = useState<string | null>(null);
  const [messagingPatientName, setMessagingPatientName] = useState("");
  const [patientAccessPatientId, setPatientAccessPatientId] = useState<string | null>(null);
  const [patientAccessPatientName, setPatientAccessPatientName] = useState("");

  const isDesktop = width >= 980;
  const canMessageFromWorkspace = availableTabs.includes("messages");

  React.useEffect(() => {
    if (!requestedTab) return;
    if (availableTabs.includes(requestedTab)) {
      setTab(requestedTab);
    }
    onRequestedTabHandled?.();
  }, [availableTabs, onRequestedTabHandled, requestedTab]);

  React.useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(defaultTab);
    }
  }, [availableTabs, defaultTab, tab]);

  const consumePrefill = useCallback(() => {
    setMessagingPatientId(null);
    setMessagingPatientName("");
    setPatientAccessPatientId(null);
    setPatientAccessPatientName("");
  }, []);

  const handleOpenMessaging = useCallback((patientId: string, name: string) => {
    setMessagingPatientId(patientId);
    setMessagingPatientName(name);
    setTab("messages");
  }, []);

  const handleOpenPatientAccess = useCallback((patientId: string, name: string) => {
    setPatientAccessPatientId(patientId);
    setPatientAccessPatientName(name);
    setTab("patient_access");
  }, []);

  const content = useMemo(() => {
    switch (tab) {
      case "profile":
        return <ProfileScreen onOpenChangePassword={onOpenChangePassword} />;

      case "patients":
        return (
          <PatientsScreen
            onOpenMessaging={canMessageFromWorkspace ? handleOpenMessaging : undefined}
            onOpenPatientAccess={availableTabs.includes("patient_access") ? handleOpenPatientAccess : undefined}
          />
        );

      case "admin":
        return <AdminScreen />;

      case "users":
        return <UsersScreen />;

      case "appointments":
        return (
          <AppointmentsScreen
            onQueueTicketLinked={(ticketId) => {
              setActiveQueueTicketId(ticketId);
              setTab("queue");
            }}
          />
        );

      case "queue":
        return (
          <QueueScreen
            onMoveToTriage={(ticketId) => {
              setActiveQueueTicketId(ticketId);
              setTab("triage");
            }}
            onMoveToEncounter={
              availableTabs.includes("encounters")
                ? (ticketId) => {
                    setActiveQueueTicketId(ticketId);
                    setTab("encounters");
                  }
                : undefined
            }
            onOpenMessaging={canMessageFromWorkspace ? handleOpenMessaging : undefined}
          />
        );

      case "triage":
        return (
          <TriageScreen
            initialQueueTicketId={activeQueueTicketId}
            initialAssessmentId={activeTriageAssessmentId}
            onAssessmentLinked={(payload) => {
              if (payload.queueTicketId) setActiveQueueTicketId(payload.queueTicketId);
              if (payload.assessmentId) setActiveTriageAssessmentId(payload.assessmentId);
            }}
            onMoveToEncounter={
              availableTabs.includes("encounters")
                ? (queueTicketId) => {
                    setActiveQueueTicketId(queueTicketId);
                    setTab("encounters");
                  }
                : undefined
            }
            onBack={() => setTab("queue")}
          />
        );

      case "encounters":
        return (
          <EncountersScreen
            initialQueueTicketId={activeQueueTicketId}
            initialEncounterId={activeEncounterId}
            onEncounterLinked={(id) => setActiveEncounterId(id)}
            onOpenMessaging={canMessageFromWorkspace ? handleOpenMessaging : undefined}
          />
        );

      case "patient_access":
        return (
          <PatientAccessScreen
            prefillPatientId={patientAccessPatientId || undefined}
            prefillPatientName={patientAccessPatientName || undefined}
            onPrefillConsumed={consumePrefill}
          />
        );

      case "messages":
        return (
          <MessagesScreen
            prefillPatientId={messagingPatientId || undefined}
            prefillPatientName={messagingPatientName || undefined}
            onPrefillConsumed={consumePrefill}
          />
        );

      case "referrals":
        return (
          <ReferralsScreen
            prefillPatientId={messagingPatientId || undefined}
            prefillPatientName={messagingPatientName || undefined}
            onPrefillConsumed={consumePrefill}
          />
        );

      case "requests":
        return <RequestsScreen />;

      default:
        return <OverviewScreen />;
    }
  }, [
    activeEncounterId,
    activeQueueTicketId,
    activeTriageAssessmentId,
    availableTabs,
    canMessageFromWorkspace,
    consumePrefill,
    handleOpenMessaging,
    handleOpenPatientAccess,
    messagingPatientId,
    messagingPatientName,
    onOpenChangePassword,
    patientAccessPatientId,
    patientAccessPatientName,
    tab,
  ]);

  const workflowTabs: StaffTab[] = ["patients", "appointments", "queue", "triage", "encounters"];
  const showWorkflow = availableTabs.some((entry) => workflowTabs.includes(entry));

  return (
    <View style={[ss.layout, isDesktop && ss.layoutDesktop]}>
      <Card title="" style={[ss.navCard, isDesktop && ss.navCardDesktop]}>
        <View style={isDesktop ? ss.navDesktop : ss.navMobile}>
          {sidebarTabs.map((entry) => (
            <Pressable
              key={entry}
              onPress={() => setTab(entry)}
              style={[
                ss.navItem,
                { borderColor: T.border, backgroundColor: T.surfaceAlt as string },
                entry === tab && { backgroundColor: T.teal, borderColor: T.teal },
              ]}
            >
              <Text
                style={[
                  ss.navItemText,
                  { color: T.textMid },
                  entry === tab && { color: "#fff" },
                ]}
              >
                {TAB_LABELS[entry]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={ss.content}>
        {showWorkflow && tab !== "profile" ? (
          <Card title="">
            <InlineActions>
              {workflowTabs
                .filter((entry) => availableTabs.includes(entry))
                .map((entry) => (
                  <ActionButton
                    key={entry}
                    label={TAB_LABELS[entry]}
                    onPress={() => setTab(entry)}
                    variant={tab === entry ? "primary" : "secondary"}
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
  layout: { gap: 14 },
  layoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  navCard: { padding: 10, gap: 8 },
  navCardDesktop: { width: 210, alignSelf: "stretch" },
  navDesktop: { gap: 7 },
  navMobile: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  navItem: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  navItemText: { fontSize: 13, fontWeight: "600" },
  content: { flex: 1, gap: 14 },
});
