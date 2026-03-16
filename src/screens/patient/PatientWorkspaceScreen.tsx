import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { patientAppointmentApi, patientPortalApi } from "../../api/services";
import type {
  AppointmentCheckInResponse,
  AppointmentView,
  AuthorizationView,
  EncounterNoteView,
  LabResultView,
  PatientPortalEncounter,
  ReferralView,
} from "../../api/types";
import {
  ActionButton,
  Card,
  InlineActions,
  InputField,
  MessageBanner,
  SectionTabs,
  ToggleField,
  useTheme,
} from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import type { CheckInDeepLinkPrefill } from "../../hooks/useCheckInDeepLink";

// ─── PATIENT WORKSPACE ────────────────────────────────────────────────────────
// Tabs: Appointments · Labs · Diagnosis · Access Log · Visit Notes · Imaging · Physiotherapy
//
// Labs tab: current vs historic side-by-side, click a date to drill in, bar-trend chart.
// Diagnosis tab: timeline with date + clinician.
// Access Log: who viewed data and when (populated from authorization/access records).
// Visit Notes: physician note summaries per encounter.
// Imaging / Physiotherapy: filtered from referral records by specialty/reason keyword.

interface PatientWorkspaceScreenProps {
  deepLinkCheckInPrefill?: CheckInDeepLinkPrefill | null;
}

const PORTAL_TABS = [
  "Appointments", "Labs", "Diagnosis",
  "Access Log", "Visit Notes", "Imaging", "Physiotherapy",
] as const;
type PortalTab = (typeof PORTAL_TABS)[number];

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};
const fmtDateTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
};
const toDateKey = (iso?: string) => {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};
const truncate = (s?: string, max = 200) => {
  if (!s) return "Not provided";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
};

// ─── Lab trend bar chart ──────────────────────────────────────────────────────
function LabTrendChart({ series, testName, T }: {
  series: LabResultView[];
  testName: string;
  T: Record<string, string>;
}) {
  const points = useMemo(() =>
    [...series].reverse()
      .map(r => ({ label: toDateKey(r.recordedAt), value: Number(r.resultValue) }))
      .filter(p => Number.isFinite(p.value)),
    [series]
  );
  if (!points.length) return (
    <Text style={{ color: T.textMuted, fontSize: 13 }}>No numeric trend available for {testName}.</Text>
  );
  const max = Math.max(...points.map(p => p.value), 1);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[pw.sectionLabel, { color: T.textMuted }]}>TREND OVER TIME</Text>
      {points.map(p => {
        const pct = `${Math.max(4, Math.round((p.value / max) * 100))}%` as `${number}%`;
        return (
          <View key={`${testName}-${p.label}`} style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: T.textMid, fontSize: 12 }}>{p.label}</Text>
              <Text style={{ color: T.text, fontSize: 12, fontWeight: "700" }}>{p.value}</Text>
            </View>
            <View style={[pw.barTrack, { backgroundColor: T.scheme === "dark" ? "#1a3045" : "#e0f2f1" }]}>
              <View style={[pw.bar, { width: pct, backgroundColor: T.teal }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export function PatientWorkspaceScreen({ deepLinkCheckInPrefill }: PatientWorkspaceScreenProps) {
  const { apiContext }      = useSession();
  const { theme: T }        = useTheme();
  const [activeTab, setActiveTab] = useState<PortalTab>("Appointments");

  const [labs,          setLabs]          = useState<LabResultView[]>([]);
  const [referrals,     setReferrals]     = useState<ReferralView[]>([]);
  const [notes,         setNotes]         = useState<EncounterNoteView[]>([]);
  const [encounters,    setEncounters]    = useState<PatientPortalEncounter[]>([]);
  const [authorizations,setAuthorizations]= useState<AuthorizationView[]>([]);

  const [pendingAppts,  setPendingAppts]  = useState<AppointmentView[]>([]);
  const [selectedApptId,setSelectedApptId]= useState("");
  const [complaint,     setComplaint]     = useState("");
  const [consent,       setConsent]       = useState(true);
  const [checkInResp,   setCheckInResp]   = useState<AppointmentCheckInResponse | null>(null);

  const [selectedTest,  setSelectedTest]  = useState("");
  const [selectedDate,  setSelectedDate]  = useState("");
  const [message,       setMessage]       = useState<string | null>(null);
  const [tone,          setTone]          = useState<"success" | "error">("success");

  const err = (e: unknown) => { setMessage(toErrorMessage(e)); setTone("error"); };
  const ok  = (s: string)  => { setMessage(s); setTone("success"); };

  // Deep link prefill
  useEffect(() => {
    if (!deepLinkCheckInPrefill) return;
    if (deepLinkCheckInPrefill.complaint != null) setComplaint(deepLinkCheckInPrefill.complaint);
    if (deepLinkCheckInPrefill.consentForDataAccess != null) setConsent(deepLinkCheckInPrefill.consentForDataAccess);
  }, [deepLinkCheckInPrefill?.receivedAt]);

  if (!apiContext) {
    return <Card title="Patient Portal"><MessageBanner message="No authenticated patient session." tone="error" /></Card>;
  }

  const loadAllData = async () => {
    try {
      const [labsD, refD, notesD, encD, authD] = await Promise.all([
        patientPortalApi.getLabs(apiContext),
        patientPortalApi.getReferrals(apiContext),
        patientPortalApi.getNotes(apiContext),
        patientPortalApi.getEncounters(apiContext),
        patientPortalApi.getAuthorizations(apiContext),
      ]);
      setLabs(labsD); setReferrals(refD); setNotes(notesD);
      setEncounters(encD); setAuthorizations(authD);
      ok("Portal data refreshed");
    } catch (e) { err(e); }
  };

  const loadPending = async () => {
    try {
      const pending = await patientAppointmentApi.getPending(apiContext);
      setPendingAppts(pending);
      if (pending.length) setSelectedApptId(pending[0].id);
      ok(`${pending.length} pending appointment(s) loaded`);
    } catch (e) { err(e); }
  };

  const confirmAppointment = async () => {
    try {
      if (!selectedApptId.trim()) throw new Error("Appointment ID required");
      const r = await patientAppointmentApi.checkIn(apiContext, selectedApptId.trim(), {
        complaint: complaint.trim() || undefined,
        consentForDataAccess: consent,
      });
      setCheckInResp(r);
      ok(`Queue number: ${r.queueTicket.ticketNumber}`);
      await loadPending();
    } catch (e) { err(e); }
  };

  // ─── Lab grouping ─────────────────────────────────────────────────────────
  const labsByTest = useMemo(() => {
    const m = new Map<string, LabResultView[]>();
    labs.forEach(r => {
      const key = r.testName || "Unknown Test";
      const arr = m.get(key) || [];
      arr.push(r);
      arr.sort((a, b) => new Date(b.recordedAt || 0).getTime() - new Date(a.recordedAt || 0).getTime());
      m.set(key, arr);
    });
    return m;
  }, [labs]);

  const testNames = useMemo(() => Array.from(labsByTest.keys()), [labsByTest]);

  useEffect(() => {
    if (!testNames.length) { setSelectedTest(""); return; }
    if (!selectedTest || !labsByTest.has(selectedTest)) setSelectedTest(testNames[0]);
  }, [testNames, labsByTest, selectedTest]);

  const selectedSeries = labsByTest.get(selectedTest) || [];
  const dateOptions = useMemo(() =>
    [...new Set(selectedSeries.map(r => toDateKey(r.recordedAt)))],
    [selectedSeries]
  );
  useEffect(() => {
    if (!dateOptions.length) { setSelectedDate(""); return; }
    if (!selectedDate || !dateOptions.includes(selectedDate)) setSelectedDate(dateOptions[0]);
  }, [dateOptions, selectedDate]);

  const currentLab  = selectedSeries[0] || null;
  const historicLabs = selectedSeries.slice(1);
  const selectedLabRecord = selectedSeries.find(r => toDateKey(r.recordedAt) === selectedDate) || null;

  // ─── Referral filters ─────────────────────────────────────────────────────
  const imagingReferrals = useMemo(() =>
    referrals.filter(r => /imaging|radiology|x-ray|xray|ct|mri|ultrasound/i.test(
      `${r.specialty || ""} ${r.reason || ""} ${r.referredToFacility || ""}`
    )), [referrals]);

  const physioReferrals = useMemo(() =>
    referrals.filter(r => /physio|physiotherapy|physical therapy|rehab/i.test(
      `${r.specialty || ""} ${r.reason || ""} ${r.referredToFacility || ""}`
    )), [referrals]);

  // ─── Diagnosis timeline ───────────────────────────────────────────────────
  const diagnosisTimeline = useMemo(() =>
    encounters.filter(e => (e.diagnosisCount || 0) > 0),
    [encounters]
  );

  // ─── Shared row style ─────────────────────────────────────────────────────
  const rowStyle = [pw.row, { backgroundColor: T.surface as string, borderColor: T.border }];
  const labelStyle = [pw.rowLabel, { color: T.textMuted }];
  const valueStyle = [pw.rowValue, { color: T.text }];

  return (
    <>
      {/* Tab header */}
      <Card title="Patient Portal">
        <InlineActions>
          <ActionButton label="Refresh All Data"        onPress={loadAllData} />
          <ActionButton label="Load Pending Appointments" onPress={loadPending} variant="secondary" />
        </InlineActions>
        <SectionTabs tabs={PORTAL_TABS} value={activeTab} onChange={v => setActiveTab(v as PortalTab)} />
        <MessageBanner message={message} tone={tone} />
      </Card>

      {/* ── APPOINTMENTS ── */}
      {activeTab === "Appointments" ? (
        <Card title="Confirm Appointment">
          <InputField label="Selected Appointment ID" value={selectedApptId} onChangeText={setSelectedApptId} />
          <InputField label="Complaint (optional)" value={complaint} onChangeText={setComplaint} multiline />
          <ToggleField label="Consent for same-hospital historical data access" value={consent} onChange={setConsent} />
          <InlineActions>
            <ActionButton label="Load Pending"        onPress={loadPending}          variant="secondary" />
            <ActionButton label="Confirm Appointment" onPress={confirmAppointment} />
          </InlineActions>

          {pendingAppts.length > 0 ? (
            <View style={{ gap: 10, marginTop: 6 }}>
              {pendingAppts.map(appt => (
                <Pressable key={appt.id} onPress={() => setSelectedApptId(appt.id)}
                  style={[rowStyle, selectedApptId === appt.id && {
                    backgroundColor: T.teal + "22", borderColor: T.teal + "60",
                  }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[{ fontWeight: "800", color: T.text, fontSize: 14 }]}>
                      {appt.appointmentNumber || appt.id.slice(0, 8)}
                    </Text>
                    <View style={[pw.statusChip, { backgroundColor: T.teal + "22", borderColor: T.teal + "60" }]}>
                      <Text style={{ color: T.teal, fontSize: 11, fontWeight: "700" }}>{appt.status}</Text>
                    </View>
                  </View>
                  <Text style={labelStyle}>Date/Time</Text>
                  <Text style={valueStyle}>{fmtDateTime(appt.scheduledAt)}</Text>
                  <Text style={labelStyle}>Hospital</Text>
                  <Text style={valueStyle}>{appt.facilityName || "Current Facility"}</Text>
                  <Text style={labelStyle}>Doctor</Text>
                  <Text style={valueStyle}>{appt.clinicianName || "Unassigned"}</Text>
                  <Text style={labelStyle}>Reason</Text>
                  <Text style={valueStyle}>{appt.reason || "Not provided"}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <MessageBanner message="No pending appointments loaded." tone="info" />
          )}

          {checkInResp ? (
            <View style={[rowStyle, { marginTop: 8, borderColor: T.teal + "60", backgroundColor: T.teal + "11" }]}>
              <Text style={[{ fontWeight: "800", fontSize: 28, color: T.teal }]}>
                #{checkInResp.queueTicket.ticketNumber}
              </Text>
              <Text style={valueStyle}>{checkInResp.appointment.facilityName || "Current Facility"}</Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* ── LABS ── */}
      {activeTab === "Labs" ? (
        <>
          <Card title="Lab Results">
            {!testNames.length ? (
              <MessageBanner message="No lab records available yet." tone="info" />
            ) : (
              <>
                {/* Test picker */}
                <Text style={[pw.sectionLabel, { color: T.textMuted }]}>SELECT TEST</Text>
                <View style={pw.chipRow}>
                  {testNames.map(name => (
                    <Pressable key={name} onPress={() => setSelectedTest(name)}
                      style={[pw.chip, {
                        backgroundColor: selectedTest === name ? T.teal : T.surfaceAlt as string,
                        borderColor: selectedTest === name ? T.teal : T.border,
                      }]}>
                      <Text style={[pw.chipText, { color: selectedTest === name ? "#fff" : T.textMid }]}>{name}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Current result */}
                {currentLab ? (
                  <View style={[rowStyle, { borderColor: T.teal + "60" }]}>
                    <Text style={[pw.sectionLabel, { color: T.teal }]}>CURRENT RESULT</Text>
                    <Text style={[{ fontSize: 22, fontWeight: "900", color: T.teal }]}>
                      {currentLab.resultValue || "N/A"} {currentLab.unit || ""}
                    </Text>
                    <Text style={labelStyle}>Date</Text>
                    <Text style={valueStyle}>{fmtDateTime(currentLab.recordedAt)}</Text>
                    <Text style={labelStyle}>Reference Range</Text>
                    <Text style={valueStyle}>{currentLab.referenceRange || "Not set"}</Text>
                    <Text style={labelStyle}>Interpretation</Text>
                    <Text style={valueStyle}>{currentLab.interpretation || "Not set"}</Text>
                    <Text style={labelStyle}>Recorded By</Text>
                    <Text style={valueStyle}>{currentLab.recordedByName || "Unknown"}</Text>
                  </View>
                ) : null}

                {/* Historic count */}
                {historicLabs.length > 0 ? (
                  <Text style={[{ color: T.textMid, fontSize: 13 }]}>
                    {historicLabs.length} historic result(s) — click a date below to view
                  </Text>
                ) : null}
              </>
            )}
          </Card>

          {/* Date drilldown */}
          {selectedSeries.length > 0 ? (
            <Card title="Historic Records">
              <Text style={[pw.sectionLabel, { color: T.textMuted }]}>SELECT DATE</Text>
              <View style={pw.chipRow}>
                {dateOptions.map(d => (
                  <Pressable key={d} onPress={() => setSelectedDate(d)}
                    style={[pw.chip, {
                      backgroundColor: selectedDate === d ? T.teal : T.surfaceAlt as string,
                      borderColor: selectedDate === d ? T.teal : T.border,
                    }]}>
                    <Text style={[pw.chipText, { color: selectedDate === d ? "#fff" : T.textMid }]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
              {selectedLabRecord ? (
                <View style={[rowStyle, { marginTop: 8 }]}>
                  <Text style={labelStyle}>Date</Text>
                  <Text style={valueStyle}>{fmtDateTime(selectedLabRecord.recordedAt)}</Text>
                  <Text style={labelStyle}>Result</Text>
                  <Text style={[{ fontSize: 18, fontWeight: "800", color: T.teal }]}>
                    {selectedLabRecord.resultValue || "N/A"} {selectedLabRecord.unit || ""}
                  </Text>
                  <Text style={labelStyle}>Interpretation</Text>
                  <Text style={valueStyle}>{selectedLabRecord.interpretation || "Not set"}</Text>
                  <Text style={labelStyle}>Recorded By</Text>
                  <Text style={valueStyle}>{selectedLabRecord.recordedByName || "Unknown"}</Text>
                </View>
              ) : null}
            </Card>
          ) : null}

          {/* Trend chart */}
          {selectedSeries.length > 1 ? (
            <Card title="Trend Chart">
              <LabTrendChart series={selectedSeries} testName={selectedTest} T={T as any} />
            </Card>
          ) : null}
        </>
      ) : null}

      {/* ── DIAGNOSIS ── */}
      {activeTab === "Diagnosis" ? (
        <Card title="Diagnosis Timeline">
          {diagnosisTimeline.length ? (
            <View style={{ gap: 10 }}>
              {diagnosisTimeline.map(enc => (
                <View key={enc.id} style={rowStyle}>
                  <Text style={[{ fontWeight: "800", color: T.text, fontSize: 14 }]}>
                    {fmtDateTime(enc.completedAt || enc.startedAt)}
                  </Text>
                  <Text style={labelStyle}>Clinician</Text>
                  <Text style={valueStyle}>{enc.clinicianName || "Unknown"}</Text>
                  <Text style={labelStyle}>Encounter Type</Text>
                  <Text style={valueStyle}>{enc.encounterType || "Unknown"}</Text>
                  <Text style={labelStyle}>Chief Complaint</Text>
                  <Text style={valueStyle}>{enc.chiefComplaint || "Not documented"}</Text>
                  <View style={[pw.diagCountChip, { backgroundColor: T.teal + "22", borderColor: T.teal + "60" }]}>
                    <Text style={{ color: T.teal, fontSize: 12, fontWeight: "700" }}>
                      {enc.diagnosisCount} diagnosis{enc.diagnosisCount !== 1 ? "es" : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <MessageBanner message="No diagnosis entries found in completed encounters." tone="info" />
          )}
        </Card>
      ) : null}

      {/* ── ACCESS LOG ── */}
      {activeTab === "Access Log" ? (
        <Card title="Data Access History">
          <MessageBanner
            message="Shows who viewed your data, consent grants, and access events."
            tone="info"
          />
          {authorizations.length ? (
            <View style={{ gap: 10, marginTop: 6 }}>
              {authorizations.map(entry => (
                <View key={entry.id} style={rowStyle}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[{ fontWeight: "800", color: T.text, fontSize: 13 }]}>
                      {entry.authorizationType || "ACCESS"}
                    </Text>
                    <View style={[pw.statusChip, {
                      backgroundColor: entry.revoked ? "#fef2f2" : T.teal + "22",
                      borderColor: entry.revoked ? "#fca5a5" : T.teal + "60",
                    }]}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: entry.revoked ? "#dc2626" : T.teal }}>
                        {entry.revoked ? "Revoked" : "Active"}
                      </Text>
                    </View>
                  </View>
                  <Text style={labelStyle}>Viewed / Granted By</Text>
                  <Text style={valueStyle}>{entry.authorizerName || "N/A"} · {entry.authorizerRole || "N/A"}</Text>
                  <Text style={labelStyle}>Scope</Text>
                  <Text style={valueStyle}>{entry.dataAccessScope || "N/A"}</Text>
                  <Text style={labelStyle}>Date &amp; Time</Text>
                  <Text style={valueStyle}>{fmtDateTime(entry.grantedAt)}</Text>
                  {entry.expiresAt ? (
                    <>
                      <Text style={labelStyle}>Expires</Text>
                      <Text style={valueStyle}>{fmtDateTime(entry.expiresAt)}</Text>
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <MessageBanner message="No access records available yet." tone="info" />
          )}
        </Card>
      ) : null}

      {/* ── VISIT NOTES ── */}
      {activeTab === "Visit Notes" ? (
        <Card title="Visit Notes & Summaries">
          {notes.length ? (
            <View style={{ gap: 10 }}>
              {notes.map(note => (
                <View key={note.encounterId} style={rowStyle}>
                  <Text style={[{ fontWeight: "800", color: T.text, fontSize: 14 }]}>
                    {fmtDateTime(note.completedAt || note.startedAt)}
                  </Text>
                  <Text style={labelStyle}>Clinician</Text>
                  <Text style={valueStyle}>{note.clinicianName || "Unknown"}</Text>
                  <Text style={labelStyle}>Encounter Type</Text>
                  <Text style={valueStyle}>{note.encounterType || "N/A"}</Text>
                  <Text style={labelStyle}>Summary</Text>
                  <Text style={[valueStyle, { lineHeight: 20 }]}>
                    {truncate(note.finalNote || note.physicianAuthoredNote)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <MessageBanner message="No visit notes found." tone="info" />
          )}
        </Card>
      ) : null}

      {/* ── IMAGING ── */}
      {activeTab === "Imaging" ? (
        <Card title="Imaging Records">
          {imagingReferrals.length ? (
            <View style={{ gap: 10 }}>
              {imagingReferrals.map(r => (
                <View key={r.id} style={rowStyle}>
                  <Text style={[{ fontWeight: "800", color: T.text, fontSize: 14 }]}>
                    {r.specialty || "Imaging"}
                  </Text>
                  <Text style={labelStyle}>Date</Text>
                  <Text style={valueStyle}>{fmtDateTime(r.referredAt)}</Text>
                  <Text style={labelStyle}>Facility</Text>
                  <Text style={valueStyle}>{r.referredToFacility || "Unknown"}</Text>
                  <Text style={labelStyle}>Reason</Text>
                  <Text style={valueStyle}>{r.reason || "Not provided"}</Text>
                  <Text style={labelStyle}>Status</Text>
                  <Text style={valueStyle}>{r.status || "N/A"}</Text>
                </View>
              ))}
            </View>
          ) : (
            <MessageBanner message="No imaging records found." tone="info" />
          )}
        </Card>
      ) : null}

      {/* ── PHYSIOTHERAPY ── */}
      {activeTab === "Physiotherapy" ? (
        <Card title="Physiotherapy Records">
          {physioReferrals.length ? (
            <View style={{ gap: 10 }}>
              {physioReferrals.map(r => (
                <View key={r.id} style={rowStyle}>
                  <Text style={[{ fontWeight: "800", color: T.text, fontSize: 14 }]}>
                    {r.specialty || "Physiotherapy"}
                  </Text>
                  <Text style={labelStyle}>Date</Text>
                  <Text style={valueStyle}>{fmtDateTime(r.referredAt)}</Text>
                  <Text style={labelStyle}>Facility</Text>
                  <Text style={valueStyle}>{r.referredToFacility || "Unknown"}</Text>
                  <Text style={labelStyle}>Reason</Text>
                  <Text style={valueStyle}>{r.reason || "Not provided"}</Text>
                  <Text style={labelStyle}>Status</Text>
                  <Text style={valueStyle}>{r.status || "N/A"}</Text>
                </View>
              ))}
            </View>
          ) : (
            <MessageBanner message="No physiotherapy records found." tone="info" />
          )}
        </Card>
      ) : null}
    </>
  );
}

const pw = StyleSheet.create({
  sectionLabel:  { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  row:           { borderWidth: 1, borderRadius: 12, padding: 14, gap: 5 },
  rowLabel:      { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  rowValue:      { fontSize: 13, fontWeight: "500", lineHeight: 18 },
  chipRow:       { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip:          { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  chipText:      { fontSize: 12, fontWeight: "700" },
  statusChip:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  diagCountChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, marginTop: 4 },
  barTrack:      { height: 10, borderRadius: 999, overflow: "hidden" },
  bar:           { height: 10, borderRadius: 999 },
});
