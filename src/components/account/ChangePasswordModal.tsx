import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { authApi } from "../../api/services";
import { ActionButton, InlineActions, InputField, MessageBanner, useTheme } from "../ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export function ChangePasswordModal({ visible, onClose, onSuccess }: ChangePasswordModalProps) {
  const { apiContext } = useSession();
  const { theme: T } = useTheme();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "success" | "info">("info");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(null);
      setTone("info");
      setLoading(false);
    }
  }, [visible]);

  const submit = async () => {
    if (!apiContext) {
      setTone("error");
      setMessage("No authenticated session.");
      return;
    }

    if (!currentPassword) {
      setTone("error");
      setMessage("Current password is required.");
      return;
    }

    if (newPassword.length < 8) {
      setTone("error");
      setMessage("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setTone("error");
      setMessage("New password and confirmation do not match.");
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      const response = await authApi.changePassword(apiContext, {
        currentPassword,
        newPassword,
      });
      onSuccess?.(response.message || "Password changed successfully");
      onClose();
    } catch (error) {
      setTone("error");
      setMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={cp.overlay}>
        <View style={[cp.card, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[cp.title, { color: T.text }]}>Change password</Text>
          <Text style={[cp.body, { color: T.textMid }]}>
            Update your own sign-in password. You will keep your current session after the change.
          </Text>

          <InputField
            label="Current Password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
          />
          <InputField
            label="New Password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
          <InputField
            label="Confirm New Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            onSubmitEditing={submit}
          />

          <MessageBanner message={message} tone={tone} />

          <InlineActions>
            <ActionButton label="Cancel" onPress={onClose} variant="ghost" />
            <ActionButton
              label={loading ? "Saving..." : "Save Password"}
              onPress={submit}
              disabled={loading}
            />
          </InlineActions>

          {loading ? <ActivityIndicator color={T.teal} size="small" /> : null}
        </View>
      </View>
    </Modal>
  );
}

const cp = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(3, 10, 18, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
});
