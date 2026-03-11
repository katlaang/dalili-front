import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { authApi } from "../api/services";
import { ActionButton, AppShell, MessageBanner } from "../components/ui";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { KioskWorkspaceScreen } from "../screens/kiosk/KioskWorkspaceScreen";
import { PatientWorkspaceScreen } from "../screens/patient/PatientWorkspaceScreen";
import { StaffWorkspaceScreen } from "../screens/staff/StaffWorkspaceScreen";
import { useSession } from "../state/session";
import { colors } from "../constants/theme";
import { useCheckInDeepLink } from "../hooks/useCheckInDeepLink";

export function AuthenticatedRoot() {
  const { actor, username, apiContext, signOut, bootstrapped } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const checkInDeepLinkPrefill = useCheckInDeepLink();

  const title = useMemo(() => {
    if (actor === "KIOSK") {
      return "Dalili Kiosk Workspace";
    }
    if (actor === "PATIENT") {
      return "Dalili Patient Workspace";
    }
    return "Dalili Staff Workspace";
  }, [actor]);

  const subtitle = useMemo(() => {
    if (!username) {
      return "Authenticated session";
    }
    return `Signed in as ${username}`;
  }, [username]);

  useEffect(() => {
    if (actor) {
      setMessage(null);
    }
  }, [actor]);

  if (!bootstrapped) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!actor || !apiContext) {
    return <LoginScreen />;
  }

  const logout = async () => {
    try {
      await authApi.logout(apiContext);
    } catch {
      // The frontend should still clear local session even if backend logout fails.
    } finally {
      await signOut();
      setMessage("Logged out");
    }
  };

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      rightAction={actor === "KIOSK" ? undefined : <ActionButton label="Logout" onPress={logout} variant="ghost" />}
    >
      <MessageBanner message={message} tone="success" />
      {actor === "STAFF" ? <StaffWorkspaceScreen /> : null}
      {actor === "KIOSK" ? <KioskWorkspaceScreen /> : null}
      {actor === "PATIENT" ? <PatientWorkspaceScreen deepLinkCheckInPrefill={checkInDeepLinkPrefill} /> : null}
    </AppShell>
  );
}
