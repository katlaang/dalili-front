import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError } from "../../api/client";
import { authApi } from "../../api/services";
import type { LoginResponse } from "../../api/types";
import { DEFAULT_KIOSK_DEVICE_ID, DEFAULT_KIOSK_DEVICE_SECRET, IS_PATIENT_APP, IS_STAFF_APP } from "../../config/env";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
// This login screen is variant-driven.
// Staff app: STAFF only, plus admin and localhost kiosk entry.
// Patient app: PATIENT only.
// Kiosk runs on its own dedicated screen and never uses this login form.

type LoginMode  = "PATIENT" | "STAFF";
type AuthPanel  = "LOGIN" | "ADMIN_LOGIN" | "ADMIN_SETUP";
const LOGIN_MODES: LoginMode[] = IS_PATIENT_APP ? ["PATIENT"] : ["STAFF"];

const LIGHT = {
  bg:        "#f0f7fc",
  surface:   "rgba(255,255,255,0.93)",
  border:    "#c8dfe9",
  text:      "#0f2d42",
  textMid:   "#2e6b88",
  textMuted: "#7aacbf",
  teal:      "#0d9488",
  inputBg:   "rgba(255,255,255,0.85)",
} as const;

const CLINIC_OPTIONS = ["Dalili Health Clinic", "Sunrise Community Clinic"] as const;

// Satin wave + watermark (web only — degrades gracefully on native)
function SatinBackground() {
  if (typeof document === "undefined") return null;
  const teal = "#0d9488";
  const waveOpacity = 0.10;
  return (
    <View style={[StyleSheet.absoluteFillObject, { pointerEvents: "none" }]}>
      {/* @ts-ignore — SVG renders fine in RN Web */}
      <svg
        width="100%" height="100%"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, opacity: waveOpacity }}
      >
        <defs>
          <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#2DD4BF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="lg2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#0d9488" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {/* wide satin bands */}
        <path d="M-200 160 C 200 80,  550 230, 880 130 S1280  60,1680 190" stroke="url(#lg1)" strokeWidth="90" fill="none" opacity="0.65"/>
        <path d="M-100 400 C 320 310, 680 460,1020 350 S1420 270,1760 410" stroke="url(#lg2)" strokeWidth="70" fill="none" opacity="0.55"/>
        <path d="M   0 610 C 380 510, 740 660,1080 550 S1460 470,1780 620" stroke="url(#lg1)" strokeWidth="80" fill="none" opacity="0.45"/>
        <path d="M-120 820 C 280 720, 640 860, 980 760 S1380 680,1700 830" stroke="url(#lg2)" strokeWidth="60" fill="none" opacity="0.50"/>
        {/* sheen highlights */}
        <path d="M 350   0 C 520 180,430 400, 660 570 S 760 820, 940 980" stroke="url(#lg2)" strokeWidth="38" fill="none" opacity="0.28"/>
        <path d="M 980 -30 C1150 150,1060 370,1280 540 S1380 790,1180 980" stroke="url(#lg1)" strokeWidth="30" fill="none" opacity="0.23"/>
      </svg>
      {/* DALILI watermark */}
      {/* @ts-ignore */}
      <svg
        width="100%" height="100%"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}
      >
        <text
          x="50%" y="52%"
          dominantBaseline="middle" textAnchor="middle"
          fontSize="210" fontWeight="900" letterSpacing="28"
          fill={teal} opacity="0.04"
          fontFamily="'Outfit','Trebuchet MS',sans-serif"
        >
          DALILI
        </text>
      </svg>
    </View>
  );
}

function getUsernameVariants(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  return Array.from(new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()]));
}

function getLoginScheme(): "dark" | "light" {
  return "light";
}

function canRetryWithDifferentUsernameCase(error: unknown) {
  if (error instanceof ApiError) {
    return error.status === 400 || error.status === 401 || error.status === 404;
  }

  const message = toErrorMessage(error).toLowerCase();
  return message.includes("invalid") || message.includes("credential") || message.includes("not found");
}

async function loginIgnoringUsernameCase(
  username: string,
  login: (candidate: string) => Promise<LoginResponse>
) {
  const candidates = getUsernameVariants(username);
  if (candidates.length === 0) {
    throw new Error("Username is required.");
  }

  let lastError: unknown = new Error("Username is required.");

  for (const candidate of candidates) {
    try {
      const response = await login(candidate);
      return { response, username: candidate };
    } catch (error) {
      lastError = error;
      if (!canRetryWithDifferentUsernameCase(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

export function LoginScreen() {
  const { baseUrl, signIn } = useSession();

  const scheme = getLoginScheme();
  const setScheme = (_next: "dark" | "light" | ((current: "dark" | "light") => "dark" | "light")) => undefined;
  const [panel,  setPanel]      = useState<AuthPanel>("LOGIN");
  const [mode,   setMode]       = useState<LoginMode>(LOGIN_MODES[0] || "STAFF");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [setupUsername,  setSetupUsername]  = useState("");
  const [setupFirstName, setSetupFirstName] = useState("");
  const [setupLastName,  setSetupLastName]  = useState("");
  const [setupEmail,     setSetupEmail]     = useState("");
  const [setupPassword,  setSetupPassword]  = useState("");
  const [setupCompany,   setSetupCompany]   = useState<string>(CLINIC_OPTIONS[0]);

  const [bootstrapAllowed, setBootstrapAllowed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showLocalKioskEntry =
    IS_STAFF_APP &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  const T = LIGHT;

  useEffect(() => {
    if (IS_PATIENT_APP) {
      setBootstrapAllowed(false);
      return;
    }
    let active = true;
    authApi.getSuperAdminBootstrapStatus(baseUrl)
      .then(s => { if (active) setBootstrapAllowed(Boolean(s.bootstrapAllowed)); })
      .catch(() => { if (active) setBootstrapAllowed(false); });
    return () => { active = false; };
  }, [baseUrl]);

  useEffect(() => {
    setMode(LOGIN_MODES[0] || "STAFF");
    setPanel("LOGIN");
  }, []);

  useEffect(() => {
    if (!bootstrapAllowed && panel === "ADMIN_SETUP") setPanel("LOGIN");
  }, [bootstrapAllowed, panel]);

  const handleLogin = async () => {
    try {
      setLoading(true); setMessage(null);
      let token: string | null = null;
      let resolvedRole: string | null = null;
      let resolvedUsername = "";

      if (mode === "STAFF") {
        const { response: r, username: matchedUsername } = await loginIgnoringUsernameCase(
          username,
          candidate => authApi.loginStaff(baseUrl, candidate, password)
        );
        if (["ADMIN", "SUPER_ADMIN"].includes((r.role || "").toUpperCase()))
          throw new Error("Use the Admin panel for admin accounts.");
        token = r.token;
        resolvedRole = r.role || null;
        resolvedUsername = matchedUsername;
      } else {
        const { response: r, username: matchedUsername } = await loginIgnoringUsernameCase(
          username,
          candidate => authApi.loginPatient(baseUrl, candidate, password)
        );
        token = r.token;
        resolvedRole = r.role || "PATIENT";
        resolvedUsername = matchedUsername;
      }

      if (!token) throw new Error("No token returned by server");
      await signIn({ token, actor: mode, username: resolvedUsername, role: resolvedRole });
    } catch (e) {
      setMessage(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async () => {
    try {
      setLoading(true); setMessage(null);
      const { response: r, username: matchedUsername } = await loginIgnoringUsernameCase(
        adminUsername,
        candidate => authApi.loginStaff(baseUrl, candidate, adminPassword)
      );
      if (!["ADMIN", "SUPER_ADMIN"].includes((r.role || "").toUpperCase()))
        throw new Error("Admin accounts only.");
      if (!r.token) throw new Error("No token returned by server");
      await signIn({ token: r.token, actor: "STAFF", username: matchedUsername, role: r.role || null });
    } catch (e) {
      setMessage(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const bootstrapAdmin = async () => {
    try {
      setLoading(true); setMessage(null);
      const r = await authApi.bootstrapSuperAdmin(baseUrl, {
        username: setupUsername.trim(), firstName: setupFirstName.trim(),
        lastName: setupLastName.trim(), email: setupEmail.trim(),
        password: setupPassword, company: setupCompany.trim(),
      });
      setBootstrapAllowed(false);
      setPanel("ADMIN_LOGIN");
      setAdminUsername(r.username || "");
      setSetupPassword("");
      setMessage(`Admin account created. Username: ${r.username}`);
    } catch (e) {
      setMessage(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const enterKiosk = async () => {
    try {
      setLoading(true);
      setMessage(null);
      const response = await authApi.loginKioskDevice(
        baseUrl,
        DEFAULT_KIOSK_DEVICE_ID,
        DEFAULT_KIOSK_DEVICE_SECRET
      );
      if (!response.token) throw new Error("No token returned by server");
      await signIn({
        token: response.token,
        actor: "KIOSK",
        username: DEFAULT_KIOSK_DEVICE_ID,
        role: response.role || "KIOSK"
      });
    } catch (error) {
      const fallback =
        "Kiosk sign-in failed. Register the default kiosk device first or update the kiosk credentials in env.ts.";
      setMessage(error instanceof ApiError ? `${toErrorMessage(error)}. ${fallback}` : toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [
    ls.input,
    { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
  ];

  const isSuccess = !!message?.toLowerCase().includes("created");

  return (
    <View style={[ls.root, { backgroundColor: T.bg }]}>
      <SatinBackground />

      {/* Theme toggle */}
      <View style={ls.toggleWrap}>
        <Pressable
          onPress={() => setScheme(s => s === "dark" ? "light" : "dark")}
          style={[ls.toggleBtn, { borderColor: T.border, backgroundColor: T.surface }]}
        >
          <Text style={[ls.toggleText, { color: T.textMid }]}>
            {scheme === "dark" ? "☀ Light" : "◑ Dark"}
          </Text>
        </Pressable>
      </View>

      <View style={ls.centre}>
        {/* Logo */}
        <View style={ls.logoRow}>
          <View style={[ls.ring1, { borderColor: T.teal + "70" }]}>
            <View style={[ls.ring2, { borderColor: T.teal + "40" }]}>
              <View style={[ls.dot, { backgroundColor: T.teal }]} />
            </View>
          </View>
          <Text style={[ls.logoText, { color: T.teal }]}>DALILI</Text>
        </View>
        <Text style={[ls.byline, { color: T.textMuted }]}>Clinical Platform · Secure Access</Text>

        {/* Card */}
        <View style={[ls.card, { backgroundColor: T.surface, borderColor: T.border }]}>

          {/* Admin / back row */}
          {IS_STAFF_APP ? (
          <View style={ls.adminRow}>
            {panel === "ADMIN_SETUP" ? (
              <Pressable onPress={() => setPanel("LOGIN")}>
                <Text style={[ls.link, { color: T.teal }]}>← Back to Login</Text>
              </Pressable>
            ) : (
              <>
                <Pressable onPress={() => setPanel(panel === "ADMIN_LOGIN" ? "LOGIN" : "ADMIN_LOGIN")}>
                  <Text style={[ls.link, { color: T.teal }]}>
                    {panel === "ADMIN_LOGIN" ? "← Back" : "Admin →"}
                  </Text>
                </Pressable>
                {bootstrapAllowed && (
                  <Pressable onPress={() => setPanel("ADMIN_SETUP")} style={{ marginLeft: 16 }}>
                    <Text style={[ls.link, { color: T.teal }]}>First-Time Setup</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
          ) : null}

          {/* ── MAIN LOGIN ── */}
          {panel === "LOGIN" && (
            <>
              {/* PATIENT / STAFF only — no kiosk */}
              {LOGIN_MODES.length > 1 ? <View style={ls.chips}>
                {LOGIN_MODES.map(m => (
                  <Pressable
                    key={m}
                    onPress={() => { setMode(m); setMessage(null); }}
                    style={[
                      ls.chip,
                      { borderColor: mode === m ? T.teal : T.border },
                      mode === m ? { backgroundColor: T.teal } : { backgroundColor: "transparent" },
                    ]}
                  >
                    <Text style={[ls.chipText, { color: mode === m ? (scheme === "dark" ? "#0b1623" : "#fff") : T.textMuted }]}>
                      {m}
                    </Text>
                  </Pressable>
                ))}
              </View> : null}

              <Text style={[ls.label, { color: T.textMuted }]}>Username</Text>
              <TextInput
                value={username}
                onChangeText={v => { setUsername(v); setMessage(null); }}
                placeholder={mode === "STAFF" ? "CL-001 or NS-001" : "Patient username"}
                placeholderTextColor={T.textMuted}
                style={inputStyle}
              />

              <Text style={[ls.label, { color: T.textMuted }]}>Password</Text>
              <TextInput
                value={password}
                onChangeText={v => { setPassword(v); setMessage(null); }}
                placeholder="••••••••"
                placeholderTextColor={T.textMuted}
                secureTextEntry
                onSubmitEditing={handleLogin}
                style={inputStyle}
              />

              {message ? <Text style={[ls.msg, { color: isSuccess ? T.teal : "#f87171" }]}>{message}</Text> : null}

              <Pressable
                onPress={handleLogin}
                disabled={loading}
                style={[ls.btn, { backgroundColor: loading ? T.border : T.teal }]}
              >
                {loading
                  ? <ActivityIndicator color={T.textMuted} size="small" />
                  : <Text style={[ls.btnText, { color: scheme === "dark" ? "#0b1623" : "#fff" }]}>Sign In →</Text>
                }
              </Pressable>
              {showLocalKioskEntry ? (
                <>
                  <Text style={[ls.devHint, { color: T.textMuted }]}>
                    Localhost only: enter kiosk mode with the configured kiosk device.
                  </Text>
                  <Pressable
                    onPress={enterKiosk}
                    disabled={loading}
                    style={[
                      ls.secondaryBtn,
                      { borderColor: T.border, backgroundColor: loading ? T.border : "transparent" }
                    ]}
                  >
                    <Text style={[ls.secondaryBtnText, { color: T.text }]}>Enter Kiosk</Text>
                  </Pressable>
                </>
              ) : null}
            </>
          )}

          {/* ── ADMIN LOGIN ── */}
          {panel === "ADMIN_LOGIN" && (
            <>
              <Text style={[ls.label, { color: T.textMuted }]}>Username</Text>
              <TextInput value={adminUsername} onChangeText={setAdminUsername}
                placeholder="AD-001 or SA-001" placeholderTextColor={T.textMuted} style={inputStyle} />
              <Text style={[ls.label, { color: T.textMuted }]}>Password</Text>
              <TextInput value={adminPassword} onChangeText={setAdminPassword}
                placeholder="password" placeholderTextColor={T.textMuted} secureTextEntry
                onSubmitEditing={handleAdminLogin} style={inputStyle} />
              {message ? <Text style={[ls.msg, { color: isSuccess ? T.teal : "#f87171" }]}>{message}</Text> : null}
              <Pressable onPress={handleAdminLogin} disabled={loading}
                style={[ls.btn, { backgroundColor: loading ? T.border : T.teal }]}>
                {loading
                  ? <ActivityIndicator color={T.textMuted} size="small" />
                  : <Text style={[ls.btnText, { color: scheme === "dark" ? "#0b1623" : "#fff" }]}>Admin Sign In →</Text>
                }
              </Pressable>
            </>
          )}

          {/* ── ADMIN SETUP ── */}
          {panel === "ADMIN_SETUP" && bootstrapAllowed && (
            <>
              {([
                ["Username (SA…)", setupUsername,  setSetupUsername,  "SA-001",              false],
                ["First Name",     setupFirstName, setSetupFirstName, "Jane",                false],
                ["Last Name",      setupLastName,  setSetupLastName,  "Doe",                 false],
                ["Email",          setupEmail,     setSetupEmail,     "jane@clinic.com",     false],
                ["Password",       setupPassword,  setSetupPassword,  "Min. 8 characters",   true ],
              ] as [string, string, (v: string) => void, string, boolean][]).map(([lbl, val, setter, ph, sec]) => (
                <View key={lbl}>
                  <Text style={[ls.label, { color: T.textMuted }]}>{lbl}</Text>
                  <TextInput value={val} onChangeText={setter} placeholder={ph}
                    placeholderTextColor={T.textMuted} secureTextEntry={sec} style={inputStyle} />
                </View>
              ))}

              <Text style={[ls.label, { color: T.textMuted, marginTop: 4 }]}>Company / Clinic</Text>
              <View style={ls.chips}>
                {CLINIC_OPTIONS.map(c => (
                  <Pressable key={c} onPress={() => setSetupCompany(c)}
                    style={[ls.chip, { borderColor: setupCompany === c ? T.teal : T.border, flex: 1 },
                      setupCompany === c ? { backgroundColor: T.teal } : { backgroundColor: "transparent" }]}>
                    <Text style={[ls.chipText, { color: setupCompany === c ? "#fff" : T.textMuted, fontSize: 11 }]}>{c}</Text>
                  </Pressable>
                ))}
              </View>

              {message ? <Text style={[ls.msg, { color: isSuccess ? T.teal : "#f87171" }]}>{message}</Text> : null}
              <Pressable onPress={bootstrapAdmin} disabled={loading}
                style={[ls.btn, { backgroundColor: loading ? T.border : T.teal }]}>
                {loading
                  ? <ActivityIndicator color={T.textMuted} size="small" />
                  : <Text style={[ls.btnText, { color: scheme === "dark" ? "#0b1623" : "#fff" }]}>Create Admin Account</Text>
                }
              </Pressable>
            </>
          )}
        </View>

        <Text style={[ls.footer, { color: T.textMuted }]}>© 2026 Dalili Health</Text>
      </View>
    </View>
  );
}

const ls = StyleSheet.create({
  root:       { flex: 1 },
  toggleWrap: { position: "absolute", top: 18, right: 22, zIndex: 20, display: "none" },
  toggleBtn:  { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  toggleText: { fontSize: 12, fontWeight: "600" },
  centre:     { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  logoRow:    { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
  ring1:      { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  ring2:      { width: 30, height: 30, borderRadius: 15, borderWidth: 1.2, alignItems: "center", justifyContent: "center" },
  dot:        { width: 10, height: 10, borderRadius: 5 },
  logoText:   { fontSize: 32, fontWeight: "900", letterSpacing: 6 },
  byline:     { fontSize: 12, letterSpacing: 0.4, marginBottom: 22 },
  card:       { width: "100%", maxWidth: 400, borderRadius: 18, borderWidth: 1, padding: 26 },
  adminRow:   { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  link:       { fontSize: 12, fontWeight: "600" },
  chips:      { flexDirection: "row", gap: 6, marginBottom: 16 },
  chip:       { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, borderWidth: 1.5, alignItems: "center" },
  chipText:   { fontSize: 12, fontWeight: "700" },
  label:      { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, marginTop: 2 },
  input:      { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  msg:        { fontSize: 13, marginBottom: 10, textAlign: "center" },
  btn:        { borderRadius: 10, paddingVertical: 13, alignItems: "center", justifyContent: "center", marginTop: 2 },
  btnText:    { fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
  devHint:    { fontSize: 11, textAlign: "center", marginTop: 12, marginBottom: 8 },
  secondaryBtn: { borderRadius: 10, borderWidth: 1.5, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  secondaryBtnText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },
  footer:     { marginTop: 18, fontSize: 11 },
});
