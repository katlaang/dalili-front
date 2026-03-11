import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { authApi } from "../../api/services";
import { AppShell, ActionButton, Card, ChoiceChips, InputField, InlineActions, MessageBanner } from "../../components/ui";
import { useSession } from "../../state/session";
import { colors } from "../../constants/theme";
import { toErrorMessage } from "../../utils/format";

type LoginMode = "STAFF" | "PATIENT" | "KIOSK";
type AuthPanel = "LOGIN" | "ADMIN_SETUP";

export function LoginScreen() {
  const { baseUrl, setBaseUrl, signIn } = useSession();
  const autoOpenedFromQrRef = useRef(false);

  const [panel, setPanel] = useState<AuthPanel>("LOGIN");
  const [mode, setMode] = useState<LoginMode>("PATIENT");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminCompany, setAdminCompany] = useState("Dalili Health Clinic");
  const [baseUrlDraft, setBaseUrlDraft] = useState(baseUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loginLabel = useMemo(() => {
    if (mode === "KIOSK") {
      return "Open Kiosk";
    }
    return `${mode} Login`;
  }, [mode]);

  const openKioskSession = async (requestedBaseUrl?: string | null) => {
    if (requestedBaseUrl && requestedBaseUrl.trim()) {
      const normalized = requestedBaseUrl.trim();
      await setBaseUrl(normalized);
      setBaseUrlDraft(normalized);
    }
    await signIn({
      token: "kiosk-public-session",
      actor: "KIOSK",
      username: "KIOSK",
      role: "KIOSK"
    });
  };

  useEffect(() => {
    if (typeof window === "undefined" || autoOpenedFromQrRef.current) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("kiosk") !== "1") {
      return;
    }
    autoOpenedFromQrRef.current = true;
    setPanel("LOGIN");
    setMode("KIOSK");
    const requestedBaseUrl = params.get("api");
    setLoading(true);
    setMessage(null);
    openKioskSession(requestedBaseUrl)
      .catch((error) => setMessage(toErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [setBaseUrl, signIn]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setMessage(null);

      let token: string | null = null;
      let actor: LoginMode = mode;
      let resolvedUsername = username.trim();
      let resolvedRole: string | null = null;

      if (mode === "STAFF") {
        const response = await authApi.loginStaff(baseUrl, username.trim(), password);
        token = response.token;
        resolvedRole = response.role || null;
      } else if (mode === "PATIENT") {
        const response = await authApi.loginPatient(baseUrl, username.trim(), password);
        token = response.token;
        resolvedRole = response.role || "PATIENT";
      } else {
        await openKioskSession(null);
        return;
      }

      if (!token) {
        throw new Error("No token returned by backend");
      }

      await signIn({ token, actor, username: resolvedUsername, role: resolvedRole });
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const saveBaseUrl = async () => {
    try {
      await setBaseUrl(baseUrlDraft);
      setMessage("API URL saved");
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  };

  const bootstrapSuperAdmin = async () => {
    try {
      setLoading(true);
      setMessage(null);

      const response = await authApi.bootstrapSuperAdmin(baseUrl, {
        fullName: adminFullName.trim(),
        password: adminPassword,
        company: adminCompany.trim()
      });

      setMode("STAFF");
      setPanel("LOGIN");
      setUsername(response.username || "");
      setPassword("");
      setAdminPassword("");
      setMessage(`Super admin created. Username: ${response.username}`);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell
      title="Dalili Cross-Platform Frontend"
      subtitle="Single React Native codebase for web + mobile against your Spring API."
      rightAction={
        <ActionButton
          label={panel === "ADMIN_SETUP" ? "Back to Login" : "Admin"}
          onPress={() => setPanel(panel === "ADMIN_SETUP" ? "LOGIN" : "ADMIN_SETUP")}
          variant="ghost"
        />
      }
    >
      <Card title="Connection">
        <InputField
          label="Backend Base URL"
          value={baseUrlDraft}
          onChangeText={setBaseUrlDraft}
          placeholder="http://localhost:8080"
        />
        <InlineActions>
          <ActionButton label="Save Base URL" onPress={saveBaseUrl} variant="secondary" />
        </InlineActions>
        <Text style={{ color: colors.textMuted }}>
          Android emulator usually needs <Text style={{ fontWeight: "700" }}>http://10.0.2.2:8181</Text>.
        </Text>
      </Card>

      {panel === "ADMIN_SETUP" ? (
        <Card title="Admin Setup">
          <MessageBanner
            message="Use this for first super admin bootstrap (name + password + company)."
            tone="info"
          />
          <InputField
            label="Full Name"
            value={adminFullName}
            onChangeText={setAdminFullName}
            placeholder="Jane Doe"
          />
          <InputField
            label="Password"
            value={adminPassword}
            onChangeText={setAdminPassword}
            secureTextEntry
            placeholder="At least 8 characters"
          />
          <InputField
            label="Company / Clinic Name"
            value={adminCompany}
            onChangeText={setAdminCompany}
            placeholder="Dalili Health Clinic"
          />
          <InlineActions>
            <ActionButton label="Create First Super Admin" onPress={bootstrapSuperAdmin} disabled={loading} />
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
          </InlineActions>
          <MessageBanner message={message} tone={message && message.toLowerCase().includes("created") ? "success" : "error"} />
        </Card>
      ) : (
        <Card title="Authenticate">
          <ChoiceChips label="Mode" options={["PATIENT", "KIOSK", "STAFF"]} value={mode} onChange={(value) => setMode(value as LoginMode)} />

          {mode === "KIOSK" ? (
            <View style={{ gap: 10 }}>
              <MessageBanner
                message="Kiosk mode is public and does not require login."
                tone="info"
              />
              <Text style={{ color: colors.textMuted }}>
                After opening kiosk mode, patients will choose Existing Appointment or No Appointment.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <InputField label="Username" value={username} onChangeText={setUsername} placeholder="username" />
              <InputField label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="password" />
            </View>
          )}

          <InlineActions>
            <ActionButton label={loginLabel} onPress={handleLogin} disabled={loading} />
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
          </InlineActions>
          <MessageBanner message={message} tone={message && message.toLowerCase().includes("saved") ? "success" : "error"} />
        </Card>
      )}
    </AppShell>
  );
}
