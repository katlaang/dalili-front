import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { authApi } from "../../api/services";
import type { CurrentUserProfile } from "../../api/types";
import { ActionButton, Card, MessageBanner, SectionTabs, useTheme } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

const PROFILE_TABS = ["Account", "Support Code"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

function formatRole(value: string | null | undefined) {
  return (value || "Unavailable").replaceAll("_", " ");
}

function getInitials(fullName: string | null | undefined, fallback: string | null | undefined) {
  const parts = (fullName || "")
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const fallbackClean = (fallback || "").replace(/[^a-z0-9]/gi, "").slice(0, 2);
  return fallbackClean ? fallbackClean.toUpperCase() : "DH";
}

function buildSupportCode(userId: string | null | undefined) {
  const clean = (userId || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!clean) {
    return "UNAVAILABLE";
  }
  if (clean.length <= 12) {
    return clean.match(/.{1,4}/g)?.join("-") || clean;
  }
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(-4)}`;
}

interface ProfileScreenProps {
  onOpenChangePassword?: () => void;
}

function buildPhotoStorageKey(username: string) {
  return `dalili.profile.photo.${username.toLowerCase()}`;
}

export function ProfileScreen({ onOpenChangePassword }: ProfileScreenProps) {
  const { apiContext, username, role } = useSession();
  const { theme: T } = useTheme();
  const { width } = useWindowDimensions();

  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error" | "info">("info");
  const [activeTab, setActiveTab] = useState<ProfileTab>("Account");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const loadProfile = async () => {
    if (!apiContext) {
      return;
    }
    try {
      const result = await authApi.getCurrentProfile(apiContext);
      setProfile(result);
      setMessage(null);
      setMessageTone("info");
    } catch (error) {
      setProfile(null);
      setMessage(toErrorMessage(error));
      setMessageTone("error");
    }
  };

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, [apiContext]);

  const profileName = profile?.fullName || username || "Unknown user";
  const profileUsername = profile?.username || username || "Unavailable";
  const profileRole = formatRole(profile?.role || role);
  const supportCode = useMemo(() => buildSupportCode(profile?.userId), [profile?.userId]);
  const initials = useMemo(
    () => getInitials(profile?.fullName, profile?.username || username),
    [profile?.fullName, profile?.username, username]
  );
  const photoStorageKey = useMemo(() => buildPhotoStorageKey(profileUsername), [profileUsername]);
  const isWide = width >= 860;

  useEffect(() => {
    AsyncStorage.getItem(photoStorageKey)
      .then((stored) => setPhotoUri(stored))
      .catch(() => setPhotoUri(null));
  }, [photoStorageKey]);

  const pickPhoto = async () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      setMessage("Profile photo upload is currently available on the web workspace.");
      setMessageTone("info");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result !== "string") {
          setMessage("Unable to read the selected image.");
          setMessageTone("error");
          return;
        }
        try {
          await AsyncStorage.setItem(photoStorageKey, reader.result);
          setPhotoUri(reader.result);
          setMessage("Profile picture updated.");
          setMessageTone("success");
        } catch (error) {
          setMessage(toErrorMessage(error));
          setMessageTone("error");
        }
      };
      reader.onerror = () => {
        setMessage("Unable to load the selected image.");
        setMessageTone("error");
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const removePhoto = async () => {
    try {
      await AsyncStorage.removeItem(photoStorageKey);
      setPhotoUri(null);
      setMessage("Profile picture removed.");
      setMessageTone("success");
    } catch (error) {
      setMessage(toErrorMessage(error));
      setMessageTone("error");
    }
  };

  return (
    <Card title="Profile">
      <View style={[ps.layout, isWide && ps.layoutWide]}>
        <View style={[ps.identityPane, { backgroundColor: T.surfaceAlt, borderColor: T.borderLight }]}>
          <View style={[ps.avatarFrame, { backgroundColor: T.tealGlow, borderColor: T.teal + "55" }]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={ps.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={[ps.avatarText, { color: T.teal }]}>{initials}</Text>
            )}
          </View>

          <Text style={[ps.name, { color: T.text }]}>{profileName}</Text>
          <Text style={[ps.username, { color: T.textMid }]}>{profileUsername}</Text>

          <View style={[ps.roleBadge, { backgroundColor: T.navActive, borderColor: T.border }]}>
            <Text style={[ps.roleBadgeText, { color: T.text }]}>{profileRole}</Text>
          </View>

          <View style={ps.photoActions}>
            <ActionButton label={photoUri ? "Change Picture" : "Upload Picture"} onPress={() => void pickPhoto()} variant="secondary" />
            <ActionButton label="Remove Picture" onPress={() => void removePhoto()} variant="ghost" disabled={!photoUri} />
          </View>

          <Text style={[ps.photoHint, { color: T.textMuted }]}>
            This photo stays with your signed-in account on this device.
          </Text>
        </View>

        <View style={ps.detailsPane}>
          <SectionTabs
            tabs={PROFILE_TABS}
            value={activeTab}
            onChange={value => setActiveTab(value as ProfileTab)}
          />

          {activeTab === "Account" ? (
            <>
              <Text style={[ps.sectionTitle, { color: T.text }]}>Account details</Text>

              <View style={ps.detailList}>
                <View style={[ps.detailCard, { backgroundColor: T.surfaceAlt, borderColor: T.border }]}>
                  <Text style={[ps.detailLabel, { color: T.textMuted }]}>Full name</Text>
                  <Text style={[ps.detailValue, { color: T.text }]}>{profileName}</Text>
                </View>

                <View style={[ps.detailCard, { backgroundColor: T.surfaceAlt, borderColor: T.border }]}>
                  <Text style={[ps.detailLabel, { color: T.textMuted }]}>Username</Text>
                  <Text style={[ps.detailValue, { color: T.text }]}>{profileUsername}</Text>
                </View>

                <View style={[ps.detailCard, { backgroundColor: T.surfaceAlt, borderColor: T.border }]}>
                  <Text style={[ps.detailLabel, { color: T.textMuted }]}>Access role</Text>
                  <Text style={[ps.detailValue, { color: T.text }]}>{profileRole}</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={[ps.sectionTitle, { color: T.text }]}>Support code</Text>

              <View style={[ps.detailCard, ps.supportCard, { backgroundColor: T.tealGlow, borderColor: T.teal + "40" }]}>
                <Text style={[ps.detailLabel, { color: T.textMid }]}>Support code</Text>
                <Text style={[ps.supportValue, { color: T.text }]}>{supportCode}</Text>
              </View>
            </>
          )}

          <View style={ps.actions}>
            <ActionButton label="Refresh Profile" onPress={loadProfile} variant="secondary" />
            {onOpenChangePassword ? (
              <ActionButton label="Change Password" onPress={onOpenChangePassword} />
            ) : null}
          </View>
        </View>
      </View>

      <MessageBanner message={message} tone={messageTone} />
    </Card>
  );
}

const ps = StyleSheet.create({
  layout: {
    gap: 16,
  },
  layoutWide: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  identityPane: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    minWidth: 240,
  },
  avatarFrame: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 1,
  },
  name: {
    fontSize: 24,
    fontWeight: "800",
  },
  username: {
    fontSize: 15,
    fontWeight: "600",
  },
  roleBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  photoHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  photoActions: {
    width: "100%",
    gap: 8,
  },
  detailsPane: {
    flex: 1,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  detailList: {
    gap: 10,
  },
  detailCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  supportCard: {
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  supportValue: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "flex-start",
  },
});
