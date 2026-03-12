import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ActionButton, Card, InlineActions } from "../../components/ui";
import { colors, typography } from "../../constants/theme";
import { useSession } from "../../state/session";
import { AdminScreen } from "./AdminScreen";
import { AppointmentsScreen } from "./AppointmentsScreen";
import { EncountersScreen } from "./EncountersScreen";
import { OverviewScreen } from "./OverviewScreen";
import { PatientsScreen } from "./PatientsScreen";
import { PortalOpsScreen } from "./PortalOpsScreen";
import { ProfileScreen } from "./ProfileScreen";
import { QueueScreen } from "./QueueScreen";
import { TriageScreen } from "./TriageScreen";

const allTabs = ["profile", "overview", "admin", "patients", "appointments", "queue", "triage", "encounters", "portal_ops"] as const;
type StaffTab = (typeof allTabs)[number];

const tabLabels: Record<StaffTab, string> = {
  profile: "Profile",
  overview: "Overview",
  admin: "Admin Portal",
  patients: "Patients",
  appointments: "Appointments",
  queue: "Queue",
  triage: "Triage",
  encounters: "Doctor Workspace",
  portal_ops: "Portal Ops"
};

interface StaffWorkspaceScreenProps {
  requestedTab?: StaffTab | null;
  onRequestedTabHandled?: () => void;
}

export function StaffWorkspaceScreen({ requestedTab = null, onRequestedTabHandled }: StaffWorkspaceScreenProps) {
  const { width } = useWindowDimensions();
  const { role } = useSession();
  const [tab, setTab] = useState<StaffTab>("profile");
  const [activeQueueTicketId, setActiveQueueTicketId] = useState("");
  const [activeTriageAssessmentId, setActiveTriageAssessmentId] = useState("");
  const [activeEncounterId, setActiveEncounterId] = useState("");
  const roleForView = role || "RECEPTIONIST";

  const availableTabs = useMemo<StaffTab[]>(() => {
    if (roleForView === "SUPER_ADMIN") {
      return ["profile", "admin"];
    }
    if (roleForView === "ADMIN") {
      return ["profile", "admin"];
    }
    if (roleForView === "RECEPTIONIST") {
      return ["profile", "patients"];
    }
    if (roleForView === "NURSE") {
      return ["profile", "overview", "patients", "appointments", "queue", "triage", "encounters"];
    }
    if (roleForView === "PHYSICIAN") {
      return ["profile", "overview", "patients", "appointments", "queue", "triage", "encounters", "portal_ops"];
    }
    if (roleForView === "PHARMACIST" || roleForView === "LAB_TECHNICIAN") {
      return ["profile", "overview", "portal_ops"];
    }
    return [...allTabs];
  }, [roleForView]);

  const isDesktopLayout = width >= 980;

  useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab]);

  useEffect(() => {
    if (!requestedTab) {
      return;
    }
    if (!availableTabs.includes(requestedTab)) {
      onRequestedTabHandled?.();
      return;
    }
    setTab(requestedTab);
    onRequestedTabHandled?.();
  }, [availableTabs, onRequestedTabHandled, requestedTab]);

  const content = useMemo(() => {
    if (tab === "profile") {
      return <ProfileScreen />;
    }
    if (tab === "patients") {
      return <PatientsScreen />;
    }
    if (tab === "admin") {
      return <AdminScreen />;
    }
    if (tab === "appointments") {
      return (
        <AppointmentsScreen
          onQueueTicketLinked={(ticketId) => {
            setActiveQueueTicketId(ticketId);
            setTab("queue");
          }}
        />
      );
    }
    if (tab === "queue") {
      return (
        <QueueScreen
          onMoveToTriage={(ticketId) => {
            setActiveQueueTicketId(ticketId);
            setTab("triage");
          }}
          onMoveToEncounter={(ticketId) => {
            setActiveQueueTicketId(ticketId);
            setTab("encounters");
          }}
        />
      );
    }
    if (tab === "triage") {
      return (
        <TriageScreen
          initialQueueTicketId={activeQueueTicketId}
          initialAssessmentId={activeTriageAssessmentId}
          onAssessmentLinked={(payload) => {
            if (payload.queueTicketId) {
              setActiveQueueTicketId(payload.queueTicketId);
            }
            if (payload.assessmentId) {
              setActiveTriageAssessmentId(payload.assessmentId);
            }
          }}
          onMoveToEncounter={(queueTicketId) => {
            setActiveQueueTicketId(queueTicketId);
            setTab("encounters");
          }}
        />
      );
    }
    if (tab === "encounters") {
      return (
        <EncountersScreen
          initialQueueTicketId={activeQueueTicketId}
          initialEncounterId={activeEncounterId}
          onEncounterLinked={(encounterId) => setActiveEncounterId(encounterId)}
        />
      );
    }
    if (tab === "portal_ops") {
      return <PortalOpsScreen />;
    }
    return <OverviewScreen />;
  }, [activeEncounterId, activeQueueTicketId, activeTriageAssessmentId, tab]);

  return (
    <View style={[styles.layout, isDesktopLayout ? styles.layoutDesktop : null]}>
      <Card title="Navigation" style={[styles.navCard, isDesktopLayout ? styles.navCardDesktop : null]}>
        <View style={isDesktopLayout ? styles.navDesktopItems : styles.navMobileItems}>
          {availableTabs.map((tabOption) => {
            const isActive = tabOption === tab;
            return (
              <Pressable
                key={tabOption}
                style={[styles.navItem, isActive ? styles.navItemActive : null]}
                onPress={() => setTab(tabOption)}
              >
                <Text style={[styles.navItemText, isActive ? styles.navItemTextActive : null]}>{tabLabels[tabOption]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View style={styles.contentArea}>
        {availableTabs.some((value) => ["patients", "appointments", "queue", "triage", "encounters"].includes(value)) ? (
          <Card title="Workflow Handoff">
            <InlineActions>
              {availableTabs.includes("patients") ? (
                <ActionButton
                  label="Patients"
                  onPress={() => setTab("patients")}
                  variant={tab === "patients" ? "primary" : "secondary"}
                />
              ) : null}
              {availableTabs.includes("appointments") ? (
                <ActionButton
                  label="Appointments"
                  onPress={() => setTab("appointments")}
                  variant={tab === "appointments" ? "primary" : "secondary"}
                />
              ) : null}
              {availableTabs.includes("queue") ? (
                <ActionButton label="Queue" onPress={() => setTab("queue")} variant={tab === "queue" ? "primary" : "secondary"} />
              ) : null}
              {availableTabs.includes("triage") ? (
                <ActionButton label="Triage" onPress={() => setTab("triage")} variant={tab === "triage" ? "primary" : "secondary"} />
              ) : null}
              {availableTabs.includes("encounters") ? (
                <ActionButton
                  label="Doctor Workspace"
                  onPress={() => setTab("encounters")}
                  variant={tab === "encounters" ? "primary" : "secondary"}
                />
              ) : null}
            </InlineActions>
          </Card>
        ) : null}

        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    gap: 16
  },
  layoutDesktop: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  navCard: {
    gap: 10
  },
  navCardDesktop: {
    width: 250,
    alignSelf: "stretch"
  },
  navDesktopItems: {
    gap: 8
  },
  navMobileItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  navItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  navItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  navItemText: {
    color: colors.text,
    fontFamily: typography.bodyFamily
  },
  navItemTextActive: {
    color: "#fffaf1"
  },
  contentArea: {
    flex: 1,
    gap: 16
  }
});
