import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { authApi } from "../api/services";
import { ActionButton, AppShell, MessageBanner, ThemeToggleButton, useTheme } from "../components/ui";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { KioskWorkspaceScreen } from "../screens/kiosk/KioskWorkspaceScreen";
import { PatientWorkspaceScreen } from "../screens/patient/PatientWorkspaceScreen";
import { StaffWorkspaceScreen } from "../screens/staff/StaffWorkspaceScreen";
import { useSession } from "../state/session";
import { useCheckInDeepLink } from "../hooks/useCheckInDeepLink";

export function AuthenticatedRoot() {
  const { actor, username, apiContext, signOut, bootstrapped } = useSession();
  const { theme: T } = useTheme();

  const [message, setMessage] = useState<string | null>(null);
  const [staffRequestedTab, setStaffRequestedTab] = useState<"profile" | null>(null);
  const checkInDeepLinkPrefill = useCheckInDeepLink();

  const title = useMemo(() => {
    if (actor === "KIOSK")   return "Dalili Kiosk";
    if (actor === "PATIENT") return "Dalili Patient Portal";
    return "Dalili Health Platform";
  }, [actor]);

  const subtitle = useMemo(() => {
    if (!username) return "Authenticated session";
    return `Signed in as ${username}`;
  }, [username]);

  useEffect(() => {
    if (actor) setMessage(null);
  }, [actor]);

  if (!bootstrapped) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: T.bg }}>
        <ActivityIndicator size="large" color={T.teal} />
      </View>
    );
  }

  if (!actor || !apiContext) {
    return <LoginScreen />;
  }

  const logout = async () => {
    try { await authApi.logout(apiContext); } catch { /* still clear local state */ }
    finally { await signOut(); setMessage("Signed out"); }
  };

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      rightAction={
        actor === "KIOSK" ? undefined : (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {/* Theme toggle is always available to staff and patients */}
            <ThemeToggleButton />
            {actor === "STAFF" && (
              <ActionButton
                label="Profile"
                onPress={() => setStaffRequestedTab("profile")}
                variant="ghost"
              />
            )}
            <ActionButton label="Sign Out" onPress={logout} variant="ghost" />
          </View>
        )
      }
    >
      <MessageBanner message={message} tone="success" />

      {actor === "STAFF" && (
        <StaffWorkspaceScreen
          requestedTab={staffRequestedTab}
          onRequestedTabHandled={() => setStaffRequestedTab(null)}
        />
      )}
      {actor === "KIOSK"   && <KioskWorkspaceScreen />}
      {actor === "PATIENT" && <PatientWorkspaceScreen deepLinkCheckInPrefill={checkInDeepLinkPrefill} />}
    </AppShell>
  );
}
