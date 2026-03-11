import React, { useEffect, useMemo, useState } from "react";
import { ActionButton, Card, ChoiceChips, InlineActions, JsonPanel, SectionTabs } from "../../components/ui";
import { useSession } from "../../state/session";
import { AdminScreen } from "./AdminScreen";
import { AppointmentsScreen } from "./AppointmentsScreen";
import { EncountersScreen } from "./EncountersScreen";
import { OverviewScreen } from "./OverviewScreen";
import { PatientsScreen } from "./PatientsScreen";
import { PortalOpsScreen } from "./PortalOpsScreen";
import { QueueScreen } from "./QueueScreen";
import { TriageScreen } from "./TriageScreen";

const allTabs = ["overview", "admin", "patients", "appointments", "queue", "triage", "encounters", "portal_ops"] as const;
type StaffTab = (typeof allTabs)[number];
const clinicalViewRoles = ["RECEPTIONIST", "NURSE", "PHYSICIAN", "ADMIN", "SUPER_ADMIN"] as const;

export function StaffWorkspaceScreen() {
  const { role, setRole } = useSession();
  const [tab, setTab] = useState<StaffTab>("overview");
  const [activeQueueTicketId, setActiveQueueTicketId] = useState("");
  const [activeTriageAssessmentId, setActiveTriageAssessmentId] = useState("");
  const [activeEncounterId, setActiveEncounterId] = useState("");
  const roleForView = role || "RECEPTIONIST";
  const roleViewOptions = useMemo<string[]>(() => {
    const options: string[] = [...clinicalViewRoles];
    if (role && !options.includes(role)) {
      options.unshift(role);
    }
    return options;
  }, [role]);

  const switchRoleView = (nextRole: string) => {
    setRole(nextRole).catch(() => undefined);
  };

  const availableTabs = useMemo<StaffTab[]>(() => {
    if (roleForView === "RECEPTIONIST") {
      return ["overview", "patients", "appointments", "queue"];
    }
    if (roleForView === "NURSE") {
      return ["overview", "patients", "appointments", "queue", "triage", "encounters"];
    }
    if (roleForView === "PHYSICIAN") {
      return ["overview", "patients", "appointments", "queue", "triage", "encounters", "portal_ops"];
    }
    if (roleForView === "PHARMACIST" || roleForView === "LAB_TECHNICIAN") {
      return ["overview", "portal_ops"];
    }
    if (roleForView === "ADMIN" || roleForView === "SUPER_ADMIN") {
      return [...allTabs];
    }
    return [...allTabs];
  }, [roleForView]);

  useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab]);

  const content = useMemo(() => {
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
    <>
      <Card title="Testing View Switch">
        <ChoiceChips
          label="Frontend role view"
          options={roleViewOptions}
          value={roleForView}
          onChange={switchRoleView}
        />
        <InlineActions>
          <ActionButton label="Reception View" onPress={() => switchRoleView("RECEPTIONIST")} variant="secondary" />
          <ActionButton label="Nurse View" onPress={() => switchRoleView("NURSE")} variant="secondary" />
          <ActionButton label="Doctor View" onPress={() => switchRoleView("PHYSICIAN")} variant="secondary" />
          <ActionButton label="Admin View" onPress={() => switchRoleView("SUPER_ADMIN")} variant="secondary" />
        </InlineActions>
      </Card>
      <SectionTabs tabs={availableTabs} value={tab} onChange={(value) => setTab(value as StaffTab)} />
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
              label="Encounters"
              onPress={() => setTab("encounters")}
              variant={tab === "encounters" ? "primary" : "secondary"}
            />
          ) : null}
          {availableTabs.includes("portal_ops") ? (
            <ActionButton
              label="Portal Ops"
              onPress={() => setTab("portal_ops")}
              variant={tab === "portal_ops" ? "primary" : "secondary"}
            />
          ) : null}
          {availableTabs.includes("admin") ? (
            <ActionButton
              label="Admin"
              onPress={() => setTab("admin")}
              variant={tab === "admin" ? "primary" : "secondary"}
            />
          ) : null}
        </InlineActions>
        <JsonPanel
          value={{
            role: roleForView,
            availableTabs,
            activeQueueTicketId: activeQueueTicketId || null,
            activeTriageAssessmentId: activeTriageAssessmentId || null,
            activeEncounterId: activeEncounterId || null
          }}
        />
      </Card>
      {content}
    </>
  );
}
