import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { authApi } from "../../api/services";
import { AppShell, ActionButton, Card, ChoiceChips, InputField, InlineActions, MessageBanner } from "../../components/ui";
import { useSession } from "../../state/session";
import { colors } from "../../constants/theme";
import { toErrorMessage } from "../../utils/format";

type LoginMode = "STAFF" | "PATIENT" | "KIOSK";
type AuthPanel = "LOGIN" | "ADMIN_LOGIN" | "ADMIN_SETUP";
const clinicOptions = ["Dalili Health Clinic", "Sunrise Community Clinic"] as const;

export function LoginScreen() {
  const { baseUrl, setBaseUrl, signIn } = useSession();
  const autoOpenedFromQrRef = useRef(false);

  const [panel, setPanel] = useState<AuthPanel>("LOGIN");
  const [mode, setMode] = useState<LoginMode>("PATIENT");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [setupUsername, setSetupUsername] = useState("");
  const [setupFirstName, setSetupFirstName] = useState("");
  const [setupLastName, setSetupLastName] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupCompany, setSetupCompany] = useState("Dalili Health Clinic");
  const [bootstrapAllowed, setBootstrapAllowed] = useState(false);
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

  useEffect(() => {
    let active = true;
    authApi
      .getSuperAdminBootstrapStatus(baseUrl)
      .then((status) => {
        if (!active) {
          return;
        }
        setBootstrapAllowed(Boolean(status.bootstrapAllowed));
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setBootstrapAllowed(false);
      });
    return () => {
      active = false;
    };
  }, [baseUrl]);

  useEffect(() => {
    if (!bootstrapAllowed && panel === "ADMIN_SETUP") {
      setPanel("LOGIN");
    }
  }, [bootstrapAllowed, panel]);

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
        const role = (response.role || "").toUpperCase();
        if (role === "ADMIN" || role === "SUPER_ADMIN") {
          throw new Error("Use the Admin tab for admin accounts.");
        }
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

  const handleAdminLogin = async () => {
    try {
      setLoading(true);
      setMessage(null);

      const response = await authApi.loginStaff(baseUrl, adminUsername.trim(), adminPassword);
      const resolvedRole = (response.role || "").toUpperCase();
      if (resolvedRole !== "ADMIN" && resolvedRole !== "SUPER_ADMIN") {
        throw new Error("This login is only for admin and super-admin accounts.");
      }
      if (!response.token) {
        throw new Error("No token returned by backend");
      }

      await signIn({
        token: response.token,
        actor: "STAFF",
        username: adminUsername.trim(),
        role: response.role || null
      });
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const bootstrapFirstAdmin = async () => {
    try {
      setLoading(true);
      setMessage(null);
      const response = await authApi.bootstrapSuperAdmin(baseUrl, {
        username: setupUsername.trim(),
        firstName: setupFirstName.trim(),
        lastName: setupLastName.trim(),
        email: setupEmail.trim(),
        password: setupPassword,
        company: setupCompany.trim()
      });
      setBootstrapAllowed(false);
      setPanel("ADMIN_LOGIN");
      setAdminUsername(response.username || "");
      setSetupPassword("");
      setMessage(`Admin account created. Username: ${response.username}`);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell
      title="Dalili Health Platform"
      subtitle={`Sign in as patient or staff, or open kiosk mode. API: ${baseUrl}`}
      rightAction={
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {panel === "ADMIN_SETUP" ? (
            <ActionButton label="Back to Login" onPress={() => setPanel("LOGIN")} variant="ghost" />
          ) : (
            <>
              <ActionButton
                label={panel === "ADMIN_LOGIN" ? "Back to Login" : "Admin"}
                onPress={() => setPanel(panel === "ADMIN_LOGIN" ? "LOGIN" : "ADMIN_LOGIN")}
                variant="ghost"
              />
              {bootstrapAllowed ? (
                <ActionButton
                  label="Create First Admin"
                  onPress={() => setPanel("ADMIN_SETUP")}
                  variant="ghost"
                />
              ) : null}
            </>
          )}
        </View>
      }
    >
      {panel === "ADMIN_SETUP" && bootstrapAllowed ? (
        <Card title="Create First Admin">
          <InputField label="Username (SA...)" value={setupUsername} onChangeText={setSetupUsername} placeholder="SA-001" />
          <InputField label="First Name" value={setupFirstName} onChangeText={setSetupFirstName} placeholder="Jane" />
          <InputField label="Last Name" value={setupLastName} onChangeText={setSetupLastName} placeholder="Doe" />
          <InputField label="Email" value={setupEmail} onChangeText={setSetupEmail} placeholder="jane@clinic.com" />
          <InputField
            label="Password"
            value={setupPassword}
            onChangeText={setSetupPassword}
            secureTextEntry
            placeholder="At least 8 characters"
            onSubmitEditing={bootstrapFirstAdmin}
          />
          <ChoiceChips
            label="Company / Clinic Name"
            options={clinicOptions}
            value={setupCompany}
            onChange={(value) => setSetupCompany(value)}
          />
          <InlineActions>
            <ActionButton label="Create Admin" onPress={bootstrapFirstAdmin} disabled={loading} />
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
          </InlineActions>
          <MessageBanner message={message} tone={message && message.toLowerCase().includes("created") ? "success" : "error"} />
        </Card>
      ) : panel === "ADMIN_LOGIN" ? (
        <Card title="Admin Login">
          <InputField
            label="Username"
            value={adminUsername}
            onChangeText={setAdminUsername}
            placeholder="AD-001 or SA-001"
          />
          <InputField
            label="Password"
            value={adminPassword}
            onChangeText={setAdminPassword}
            secureTextEntry
            placeholder="password"
            onSubmitEditing={handleAdminLogin}
          />
          <InlineActions>
            <ActionButton label="Login" onPress={handleAdminLogin} disabled={loading} />
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
          </InlineActions>
          <MessageBanner message={message} tone="error" />
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
              <InputField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="password"
                onSubmitEditing={handleLogin}
              />
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
