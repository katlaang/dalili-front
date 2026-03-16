import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { kioskApi } from "../../api/services";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

// ─── KIOSK WORKSPACE ─────────────────────────────────────────────────────────
// Patient-facing only. No clinical data visible. No staff navigation.
// Runs on a dedicated kiosk device / URL — staff never land here.
// Always uses the light colour scheme.
// Auto-resets after 3 minutes of inactivity.

type Screen      = "home" | "appt-method" | "appt-number" | "appt-name" | "walkin" | "success-appt" | "success-walkin";
type ApptMethod  = "number" | "name";

const TEAL   = "#0d9488";
const TEAL_D = "#0f766e";
const TEAL_L = "#e0f2f1";
const BG     = "#f0f7fc";
const SURF   = "#ffffff";
const TXT    = "#0f2d42";
const TXT2   = "#2e6b88";
const TXT3   = "#7aacbf";
const BDR    = "#c8dfe9";
const RED    = "#dc2626";
const RED_BG = "#fef2f2";

// Satin wave + watermark (web only)
function SatinBackground() {
  if (typeof document === "undefined") return null;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* @ts-ignore */}
      <svg width="100%" height="100%" viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, opacity: 0.10 }}>
        <defs>
          <linearGradient id="kw1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#2DD4BF" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0.5"/>
          </linearGradient>
          <linearGradient id="kw2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#0d9488" stopOpacity="0.7"/>
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.6"/>
          </linearGradient>
        </defs>
        <path d="M-200 200 C 300 100,700 300,1100 150 S1500 80,1800 250"  stroke="url(#kw1)" strokeWidth="130" fill="none" opacity="0.65"/>
        <path d="M-100 480 C 400 360,820 560,1220 420 S1640 350,1900 500" stroke="url(#kw2)" strokeWidth="95"  fill="none" opacity="0.55"/>
        <path d="M   0 720 C 360 600,760 800,1140 670 S1540 600,1860 740" stroke="url(#kw1)" strokeWidth="110" fill="none" opacity="0.45"/>
        <path d="M 200 920 C 560 810,940 990,1320 880 S1720 810,2000 960" stroke="url(#kw2)" strokeWidth="75"  fill="none" opacity="0.40"/>
      </svg>
      {/* @ts-ignore */}
      <svg width="100%" height="100%" viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}>
        <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle"
          fontSize="210" fontWeight="900" letterSpacing="28"
          fill="#0d9488" opacity="0.04"
          fontFamily="'Outfit','Trebuchet MS',sans-serif">
          DALILI
        </text>
      </svg>
    </View>
  );
}

// Large touch-friendly input
function KioskInput({
  label, value, onChange, placeholder,
  secureTextEntry = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; secureTextEntry?: boolean;
}) {
  return (
    <View style={ks.field}>
      <Text style={ks.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={TXT3}
        secureTextEntry={secureTextEntry}
        style={ks.fieldInput}
      />
    </View>
  );
}

// Big tap button
function BigButton({
  icon, label, sublabel, onPress, primary = false,
}: {
  icon: string; label: string; sublabel?: string;
  onPress: () => void; primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        ks.bigBtn,
        primary ? ks.bigBtnPrimary : ks.bigBtnSecondary,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={ks.bigBtnIcon}>{icon}</Text>
      <Text style={[ks.bigBtnLabel, { color: primary ? "#fff" : TXT }]}>{label}</Text>
      {sublabel ? (
        <Text style={[ks.bigBtnSub, { color: primary ? "rgba(255,255,255,0.75)" : TXT3 }]}>{sublabel}</Text>
      ) : null}
    </Pressable>
  );
}

// Success number display
// ticketNumber   = short display form shown to patient (e.g. "G-042" or "A-012")
// trackingNumber = full date-scoped token (e.g. "20260314-G-042") printed as reference
function SuccessScreen({
  ticketNumber, trackingNumber, isAppointment, onReset, onPrint,
}: {
  ticketNumber: string;
  trackingNumber?: string | null;
  isAppointment: boolean;
  onReset: () => void;
  onPrint: () => void;
}) {
  return (
    <View style={ks.successWrap}>
      <Text style={ks.successLabel}>Your queue number is</Text>
      <Text style={ks.successNumber}>{ticketNumber}</Text>

      {/* Full date-scoped reference — uniquely identifies this visit across days */}
      {trackingNumber && trackingNumber !== ticketNumber ? (
        <Text style={ks.successRef}>Ref: {trackingNumber}</Text>
      ) : null}

      {isAppointment && (
        <View style={ks.apptNote}>
          <Text style={ks.apptNoteText}>
            ✓ Appointment checked in — you have priority placement in the nurse queue
          </Text>
        </View>
      )}

      <Text style={ks.successHint}>
        Please keep this number.{"\n"}You will be called when it's your turn.
      </Text>

      <View style={ks.successBtns}>
        <Pressable onPress={onPrint} style={ks.printBtn}>
          <Text style={ks.printBtnText}>🖨  Print Queue Number</Text>
        </Pressable>
        <Pressable onPress={onReset} style={ks.doneBtn}>
          <Text style={ks.doneBtnText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function KioskWorkspaceScreen() {
  const { baseUrl, signOut } = useSession();

  const [screen,        setScreen]       = useState<Screen>("home");
  const [firstName,     setFirstName]    = useState("");
  const [lastName,      setLastName]     = useState("");
  const [dob,           setDob]          = useState("");
  const [symptoms,      setSymptoms]     = useState("");
  const [apptNumber,    setApptNumber]   = useState("");
  const [ticketNumber,  setTicketNumber]  = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [isAppt,        setIsAppt]        = useState(false);
  const [error,         setError]        = useState<string | null>(null);
  const [loading,       setLoading]      = useState(false);
  const [clock,         setClock]        = useState(new Date());

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-reset after 3 minutes idle
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (screen !== "home") {
      idleTimer.current = setTimeout(resetAll, 180_000);
    }
  };
  useEffect(() => { resetIdle(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current); }; }, [screen]);

  // URL param support for QR deep-link flows
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const flow = p.get("flow");
    if (flow === "EXISTING_APPOINTMENT") setScreen("appt-method");
    if (flow === "NO_APPOINTMENT")       setScreen("walkin");
  }, []);

  const resetAll = () => {
    setScreen("home");
    setFirstName(""); setLastName(""); setDob(""); setSymptoms(""); setApptNumber("");
    setTicketNumber(null); setTrackingNumber(null); setIsAppt(false); setError(null); setLoading(false);
  };

  // printTicket renders a minimal thermal-style slip.
  // ticketNumber   = short form shown large (e.g. "G-042")
  // trackingNumber = full date-scoped token printed small as reference (e.g. "20260314-G-042")
  const printTicket = (num: string, tracking?: string | null) => {
    if (typeof window === "undefined") return;
    const w = window.open("", "_blank", "width=360,height=480");
    if (!w) { setError("Unable to open print window. Please allow popups."); return; }
    const refLine = tracking && tracking !== num
      ? `<div class="ref">Ref: ${tracking}</div>` : "";
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Queue</title>
      <style>
        body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial,sans-serif;flex-direction:column;gap:8px}
        .n{font-size:80px;font-weight:900;line-height:1}
        .ref{font-size:14px;color:#555;letter-spacing:.5px}
      </style></head>
      <body>
        <div class="n">${num}</div>
        ${refLine}
        <script>window.focus();window.print();window.close();<\/script>
      </body></html>`);
    w.document.close();
  };

  const fmtError = (e: unknown) => {
    const msg = toErrorMessage(e);
    if (msg.toLowerCase().includes("failed to fetch"))
      return `Cannot reach server at ${baseUrl}. Check network connection.`;
    return msg;
  };

  const confirmAppointment = async () => {
    if (!firstName.trim() || !lastName.trim() || !dob.trim()) {
      setError("Please fill in all required fields."); return;
    }
    setLoading(true); setError(null);
    try {
      const res = await kioskApi.publicConfirmAppointmentByNumber(baseUrl, {
        appointmentNumber: apptNumber.trim(),
        givenName: firstName.trim(), familyName: lastName.trim(),
        dateOfBirth: dob.trim(),
        complaint: symptoms.trim() || undefined,
      });
      const num      = res.queueTicket.ticketNumber;
      const tracking = res.queueTicket.trackingNumber || null;
      setTicketNumber(num); setTrackingNumber(tracking);
      setIsAppt(true); setScreen("success-appt");
      printTicket(num, tracking);
    } catch (e) {
      setError(fmtError(e));
    } finally {
      setLoading(false);
    }
  };

  const confirmByName = async () => {
    if (!firstName.trim() || !lastName.trim() || !dob.trim()) {
      setError("Please fill in all required fields."); return;
    }
    setLoading(true); setError(null);
    try {
      // name+DOB lookup falls through to walk-in check-in which will match
      // an existing appointment on the backend if one exists
      const res = await kioskApi.publicNoAppointmentCheckIn(baseUrl, {
        givenName: firstName.trim(), familyName: lastName.trim(),
        dateOfBirth: dob.trim(),
        complaint: symptoms.trim() || undefined,
      });
      const num      = res.ticketNumber;
      const tracking = res.trackingNumber || null;
      setTicketNumber(num); setTrackingNumber(tracking);
      setIsAppt(true); setScreen("success-appt");
      printTicket(num, tracking);
    } catch (e) {
      setError(fmtError(e));
    } finally {
      setLoading(false);
    }
  };

  const walkInCheckIn = async () => {
    if (!firstName.trim() || !lastName.trim() || !dob.trim()) {
      setError("Please fill in all required fields."); return;
    }
    setLoading(true); setError(null);
    try {
      const res = await kioskApi.publicNoAppointmentCheckIn(baseUrl, {
        givenName: firstName.trim(), familyName: lastName.trim(),
        dateOfBirth: dob.trim(),
        complaint: symptoms.trim() || undefined,
      });
      const num      = res.ticketNumber;
      const tracking = res.trackingNumber || null;
      setTicketNumber(num); setTrackingNumber(tracking);
      setIsAppt(false); setScreen("success-walkin");
      printTicket(num, tracking);
    } catch (e) {
      setError(fmtError(e));
    } finally {
      setLoading(false);
    }
  };

  const timeStr = clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = clock.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <View style={ks.root} onTouchStart={resetIdle}>
      <SatinBackground />

      {/* Header */}
      <View style={ks.header}>
        <View style={ks.logoRow}>
          <View style={ks.logoRing}><Text style={ks.logoRingText}>◎</Text></View>
          <View>
            <Text style={ks.logoText}>DALILI</Text>
            <Text style={ks.logoSub}>Kanifing General Hospital</Text>
          </View>
        </View>
        <View>
          <Text style={ks.clockTime}>{timeStr}</Text>
          <Text style={ks.clockDate}>{dateStr}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, position: "relative", zIndex: 1 }}
        contentContainerStyle={ks.body}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── HOME ── */}
        {screen === "home" && (
          <View style={ks.page}>
            <Text style={ks.pageTitle}>Welcome</Text>
            <Text style={ks.pageSub}>Please select how you are visiting today</Text>
            <View style={ks.homeGrid}>
              <BigButton
                icon="📋" label="I have an appointment"
                sublabel="Check in with your appointment number or name"
                onPress={() => setScreen("appt-method")} primary
              />
              <BigButton
                icon="🚶" label="No appointment"
                sublabel="Walk-in visit"
                onPress={() => setScreen("walkin")}
              />
            </View>
            <Text style={ks.homeHint}>Touch a button to begin · Need help? Please speak to reception</Text>
          </View>
        )}

        {/* ── APPOINTMENT METHOD ── */}
        {screen === "appt-method" && (
          <View style={ks.page}>
            <Pressable onPress={() => setScreen("home")} style={ks.back}>
              <Text style={ks.backText}>← Back</Text>
            </Pressable>
            <Text style={ks.formTitle}>Appointment Check-In</Text>
            <Text style={ks.formSub}>How would you like to find your appointment?</Text>
            <View style={{ gap: 12 }}>
              <BigButton
                icon="🔢" label="I have my appointment number"
                sublabel="From your booking confirmation"
                onPress={() => setScreen("appt-number")} primary
              />
              <BigButton
                icon="👤" label="Use my name and date of birth"
                sublabel="We'll find your appointment for you"
                onPress={() => setScreen("appt-name")}
              />
            </View>
          </View>
        )}

        {/* ── APPOINTMENT BY NUMBER ── */}
        {screen === "appt-number" && (
          <View style={ks.page}>
            <Pressable onPress={() => setScreen("appt-method")} style={ks.back}>
              <Text style={ks.backText}>← Back</Text>
            </Pressable>
            <Text style={ks.formTitle}>Enter Your Details</Text>
            <KioskInput label="Appointment Number" value={apptNumber} onChange={setApptNumber} placeholder="APT-20240312-001" />
            <View style={ks.twoCol}>
              <View style={{ flex: 1 }}>
                <KioskInput label="First Name *" value={firstName} onChange={setFirstName} placeholder="Amara" />
              </View>
              <View style={{ flex: 1 }}>
                <KioskInput label="Last Name *" value={lastName} onChange={setLastName} placeholder="Keita" />
              </View>
            </View>
            <KioskInput label="Date of Birth *" value={dob} onChange={setDob} placeholder="YYYY-MM-DD" />
            <KioskInput label="Main Symptoms (optional)" value={symptoms} onChange={setSymptoms} placeholder="Describe your main complaint…" />
            <View style={ks.infoBox}>
              <Text style={ks.infoBoxText}>
                <Text style={{ fontWeight: "700" }}>Check-in window: </Text>
                You can check in up to 30 minutes before or after your appointment time.
                Appointments not checked in within 30 minutes after the scheduled time are automatically cancelled.
              </Text>
            </View>
            {error ? <View style={ks.errorBox}><Text style={ks.errorText}>⚠ {error}</Text></View> : null}
            <Pressable onPress={confirmAppointment} disabled={loading} style={[ks.submitBtn, loading && ks.submitBtnDisabled]}>
              <Text style={ks.submitBtnText}>{loading ? "Checking in…" : "Get Queue Number →"}</Text>
            </Pressable>
          </View>
        )}

        {/* ── APPOINTMENT BY NAME ── */}
        {screen === "appt-name" && (
          <View style={ks.page}>
            <Pressable onPress={() => setScreen("appt-method")} style={ks.back}>
              <Text style={ks.backText}>← Back</Text>
            </Pressable>
            <Text style={ks.formTitle}>Enter Your Details</Text>
            <View style={ks.twoCol}>
              <View style={{ flex: 1 }}>
                <KioskInput label="First Name *" value={firstName} onChange={setFirstName} placeholder="Amara" />
              </View>
              <View style={{ flex: 1 }}>
                <KioskInput label="Last Name *" value={lastName} onChange={setLastName} placeholder="Keita" />
              </View>
            </View>
            <KioskInput label="Date of Birth *" value={dob} onChange={setDob} placeholder="YYYY-MM-DD" />
            <KioskInput label="Main Symptoms (optional)" value={symptoms} onChange={setSymptoms} placeholder="Describe your main complaint…" />
            <View style={ks.infoBox}>
              <Text style={ks.infoBoxText}>
                <Text style={{ fontWeight: "700" }}>Check-in window: </Text>
                Up to 30 minutes before or after your appointment time.
              </Text>
            </View>
            {error ? <View style={ks.errorBox}><Text style={ks.errorText}>⚠ {error}</Text></View> : null}
            <Pressable onPress={confirmByName} disabled={loading} style={[ks.submitBtn, loading && ks.submitBtnDisabled]}>
              <Text style={ks.submitBtnText}>{loading ? "Looking up…" : "Get Queue Number →"}</Text>
            </Pressable>
          </View>
        )}

        {/* ── WALK-IN ── */}
        {screen === "walkin" && (
          <View style={ks.page}>
            <Pressable onPress={() => setScreen("home")} style={ks.back}>
              <Text style={ks.backText}>← Back</Text>
            </Pressable>
            <Text style={ks.formTitle}>Walk-In Check-In</Text>
            <View style={ks.emergBox}>
              <Text style={ks.emergIcon}>🚨</Text>
              <View style={{ flex: 1 }}>
                <Text style={ks.emergTitle}>Medical Emergency?</Text>
                <Text style={ks.emergText}>
                  If this is life-threatening — chest pain, difficulty breathing, loss of consciousness —
                  go directly to the Emergency desk or call for help immediately.{" "}
                  <Text style={{ fontWeight: "700" }}>Do not use this kiosk.</Text>
                </Text>
              </View>
            </View>
            <View style={ks.twoCol}>
              <View style={{ flex: 1 }}>
                <KioskInput label="First Name *" value={firstName} onChange={setFirstName} placeholder="Amara" />
              </View>
              <View style={{ flex: 1 }}>
                <KioskInput label="Last Name *" value={lastName} onChange={setLastName} placeholder="Keita" />
              </View>
            </View>
            <KioskInput label="Date of Birth *" value={dob} onChange={setDob} placeholder="YYYY-MM-DD" />
            <KioskInput label="Main Symptoms (optional)" value={symptoms} onChange={setSymptoms} placeholder="Describe your main complaint…" />
            {error ? <View style={ks.errorBox}><Text style={ks.errorText}>⚠ {error}</Text></View> : null}
            <Pressable onPress={walkInCheckIn} disabled={loading} style={[ks.submitBtn, loading && ks.submitBtnDisabled]}>
              <Text style={ks.submitBtnText}>{loading ? "Generating number…" : "Get Queue Number →"}</Text>
            </Pressable>
          </View>
        )}

        {/* ── SUCCESS ── */}
        {(screen === "success-appt" || screen === "success-walkin") && ticketNumber && (
          <View style={ks.page}>
            <SuccessScreen
              ticketNumber={ticketNumber}
              isAppointment={screen === "success-appt"}
              onReset={resetAll}
              onPrint={() => printTicket(ticketNumber)}
            />
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={ks.footer}>
        <Text style={ks.footerText}>© 2026 Dalili Health</Text>
        <Text style={ks.footerText}>Need help? Please speak to the receptionist.</Text>
      </View>
    </View>
  );
}

const ks = StyleSheet.create({
  root:               { flex: 1, backgroundColor: BG },
  header:             { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingHorizontal: 24, backgroundColor: "rgba(255,255,255,0.88)", borderBottomWidth: 1.5, borderBottomColor: BDR, position: "relative", zIndex: 2 },
  logoRow:            { flexDirection: "row", alignItems: "center", gap: 10 },
  logoRing:           { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: TEAL, backgroundColor: TEAL_L, alignItems: "center", justifyContent: "center" },
  logoRingText:       { fontSize: 16, color: TEAL },
  logoText:           { fontSize: 17, fontWeight: "900", color: TEAL, letterSpacing: 4 },
  logoSub:            { fontSize: 10, color: TXT2, fontWeight: "600" },
  clockTime:          { fontSize: 22, fontWeight: "800", color: TXT, textAlign: "right" },
  clockDate:          { fontSize: 10, color: TXT3, textAlign: "right" },
  body:               { padding: 24, alignItems: "center", flexGrow: 1 },
  page:               { width: "100%", maxWidth: 560 },
  pageTitle:          { fontSize: 30, fontWeight: "900", color: TXT, textAlign: "center", marginBottom: 6 },
  pageSub:            { fontSize: 15, color: TXT2, textAlign: "center", marginBottom: 24 },
  homeGrid:           { flexDirection: "row", gap: 12, marginBottom: 16 },
  homeHint:           { fontSize: 12, color: TXT3, textAlign: "center" },
  bigBtn:             { flex: 1, borderRadius: 16, padding: 20, alignItems: "center", gap: 6, borderWidth: 2.5, minHeight: 120 },
  bigBtnPrimary:      { backgroundColor: TEAL, borderColor: TEAL_D },
  bigBtnSecondary:    { backgroundColor: SURF, borderColor: BDR },
  bigBtnIcon:         { fontSize: 26 },
  bigBtnLabel:        { fontSize: 14, fontWeight: "800", textAlign: "center" },
  bigBtnSub:          { fontSize: 11, textAlign: "center", marginTop: 2 },
  back:               { marginBottom: 14 },
  backText:           { fontSize: 14, fontWeight: "600", color: TXT2 },
  formTitle:          { fontSize: 22, fontWeight: "800", color: TXT, marginBottom: 14 },
  formSub:            { fontSize: 13, color: TXT2, marginBottom: 18 },
  twoCol:             { flexDirection: "row", gap: 12 },
  field:              { marginBottom: 12 },
  fieldLabel:         { fontSize: 13, fontWeight: "700", color: TXT, marginBottom: 6 },
  fieldInput:         { width: "100%", padding: 13, borderWidth: 2.5, borderColor: BDR, borderRadius: 10, fontSize: 16, color: TXT, backgroundColor: SURF },
  infoBox:            { backgroundColor: TEAL_L, borderWidth: 1.5, borderColor: "#99d6d0", borderRadius: 9, padding: 11, marginBottom: 12 },
  infoBoxText:        { fontSize: 12, color: "#0f5950", lineHeight: 18 },
  emergBox:           { flexDirection: "row", gap: 12, backgroundColor: RED_BG, borderWidth: 2, borderColor: "#fca5a5", borderRadius: 12, padding: 14, marginBottom: 18, alignItems: "flex-start" },
  emergIcon:          { fontSize: 22 },
  emergTitle:         { fontSize: 14, fontWeight: "800", color: RED, marginBottom: 3 },
  emergText:          { fontSize: 12, color: "#7f1d1d", lineHeight: 18 },
  errorBox:           { backgroundColor: RED_BG, borderWidth: 1.5, borderColor: "#fca5a5", borderRadius: 9, padding: 11, marginBottom: 12 },
  errorText:          { fontSize: 13, color: RED, fontWeight: "600" },
  submitBtn:          { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 6 },
  submitBtnDisabled:  { opacity: 0.6 },
  submitBtnText:      { fontSize: 17, fontWeight: "800", color: "#fff" },
  successWrap:        { alignItems: "center", paddingVertical: 24 },
  successLabel:       { fontSize: 16, color: TXT2, fontWeight: "600", marginBottom: 4 },
  successNumber:      { fontSize: 90, fontWeight: "900", color: TEAL, lineHeight: 100, marginBottom: 10 },
  successRef:         { fontSize: 13, color: TXT2, marginBottom: 14, letterSpacing: 0.4 },
  apptNote:           { backgroundColor: TEAL_L, borderWidth: 1.5, borderColor: "#99d6d0", borderRadius: 10, padding: 12, marginBottom: 16, maxWidth: 440 },
  apptNoteText:       { fontSize: 13, color: "#0f5950", fontWeight: "600", textAlign: "center" },
  successHint:        { fontSize: 15, color: TXT3, textAlign: "center", lineHeight: 22, marginBottom: 24 },
  successBtns:        { flexDirection: "row", gap: 12 },
  printBtn:           { backgroundColor: TEAL, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 22 },
  printBtnText:       { fontSize: 14, fontWeight: "700", color: "#fff" },
  doneBtn:            { backgroundColor: SURF, borderWidth: 2, borderColor: BDR, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 22 },
  doneBtnText:        { fontSize: 14, fontWeight: "600", color: TXT },
  footer:             { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 12, backgroundColor: "rgba(255,255,255,0.7)", borderTopWidth: 1, borderTopColor: BDR, position: "relative", zIndex: 2 },
  footerText:         { fontSize: 10, color: TXT3 },
});
