import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { authApi } from "../api/services";
import { ChangePasswordModal } from "../components/account/ChangePasswordModal";
import { ActionButton, AppShell, MessageBanner, ThemeToggleButton, useTheme } from "../components/ui";
import { IS_PATIENT_APP } from "../config/env";
import { useClientIdleLogout } from "../hooks/useClientIdleLogout";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { KioskWorkspaceScreen } from "../screens/kiosk/KioskWorkspaceScreen";
import { PatientWorkspaceScreen } from "../screens/patient/PatientWorkspaceScreen";
import { StaffWorkspaceScreen } from "../screens/staff/StaffWorkspaceScreen";
import { useSession } from "../state/session";
import { useCheckInDeepLink } from "../hooks/useCheckInDeepLink";

const CLIENT_IDLE_TIMEOUT_MS = 300_000;

export function AuthenticatedRoot() {
  const { actor, username, apiContext, signOut, bootstrapped } = useSession();
  const { theme: T } = useTheme();

  const [banner, setBanner] = useState<{ text: string; tone: "success" | "error" | "info" } | null>(null);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
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
    if (actor) setBanner(null);
  }, [actor]);

  useEffect(() => {
    if (!bootstrapped || !actor) return;
    const actorAllowed = IS_PATIENT_APP ? actor === "PATIENT" : actor === "STAFF" || actor === "KIOSK";
    if (actorAllowed) return;

    void (async () => {
      await signOut();
      setBanner({
        text: IS_PATIENT_APP
          ? "This app is for patient portal access only."
          : "Patient portal access has been moved to the separate patient app.",
        tone: "info",
      });
    })();
  }, [actor, bootstrapped, signOut]);

  const isIdleLogoutEnabled = actor === "STAFF" || actor === "PATIENT";

  const logout = useCallback(async (payload?: { text: string; tone: "success" | "error" | "info" }) => {
    if (!apiContext) {
      await signOut();
      if (payload) {
        setBanner(payload);
      }
      return;
    }
    try { await authApi.logout(apiContext); } catch { /* still clear local state */ }
    finally {
      await signOut();
      setBanner(payload || { text: "Signed out", tone: "success" });
    }
  }, [apiContext, signOut]);

  const markClientActivity = useClientIdleLogout({
    enabled: isIdleLogoutEnabled,
    timeoutMs: CLIENT_IDLE_TIMEOUT_MS,
    onTimeout: () => logout({ text: "Session timed out after 5 minutes of inactivity", tone: "error" }),
  });

  if (!bootstrapped) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: T.bg }}>
        <ActivityIndicator size="large" color={T.teal} />
      </View>
    );
  }

  if (!actor || !apiContext) {
    return (
      <View style={{ flex: 1 }}>
        <LoginScreen />
        {banner ? (
          <View style={{ position: "absolute", top: 72, left: 16, right: 16, zIndex: 30 }}>
            <MessageBanner message={banner.text} tone={banner.tone} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} onTouchStart={markClientActivity}>
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
              {actor === "PATIENT" ? (
                <ActionButton
                  label="Change Password"
                  onPress={() => setChangePasswordVisible(true)}
                  variant="ghost"
                />
              ) : null}
              <ActionButton label="Sign Out" onPress={() => logout()} variant="ghost" />
            </View>
          )
        }
      >
        <MessageBanner message={banner?.text || null} tone={banner?.tone || "success"} />
        <ChangePasswordModal
          visible={changePasswordVisible}
          onClose={() => setChangePasswordVisible(false)}
          onSuccess={(nextMessage) => setBanner({ text: nextMessage, tone: "success" })}
        />

        {actor === "STAFF" && (
          <StaffWorkspaceScreen
            requestedTab={staffRequestedTab}
            onRequestedTabHandled={() => setStaffRequestedTab(null)}
            onOpenChangePassword={() => setChangePasswordVisible(true)}
          />
        )}
        {actor === "KIOSK"   && <KioskWorkspaceScreen />}
        {actor === "PATIENT" && <PatientWorkspaceScreen deepLinkCheckInPrefill={checkInDeepLinkPrefill} />}
      </AppShell>
    </View>
  );
}
