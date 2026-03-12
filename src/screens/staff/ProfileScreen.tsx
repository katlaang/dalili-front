import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { authApi } from "../../api/services";
import type { CurrentUserProfile } from "../../api/types";
import { ActionButton, Card, InlineActions, MessageBanner } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

export function ProfileScreen() {
  const { apiContext, username, role } = useSession();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadProfile = async () => {
    if (!apiContext) {
      return;
    }
    try {
      const result = await authApi.getCurrentProfile(apiContext);
      setProfile(result);
      setMessage(null);
    } catch (error) {
      setProfile(null);
      setMessage(toErrorMessage(error));
    }
  };

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, [apiContext]);

  return (
    <Card title="Profile">
      <Text>Name: {profile?.fullName || username || "Unknown"}</Text>
      <Text>User ID: {profile?.userId || "Unavailable"}</Text>
      <Text>Role: {profile?.role || role || "Unavailable"}</Text>
      <InlineActions>
        <ActionButton label="Refresh Profile" onPress={loadProfile} variant="secondary" />
      </InlineActions>
      <MessageBanner message={message} tone="error" />
    </Card>
  );
}

