import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { clinicalPortalApi } from "../../api/services";
import type { RenewalRequestView, TransferRequestView } from "../../api/types";
import { ActionButton, Card, InlineActions, InputField, MessageBanner, useTheme } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import { formatDateTime } from "./patientServiceUtils";

export function RequestsScreen() {
  const { apiContext } = useSession();
  const { theme: T } = useTheme();
  const [renewals, setRenewals] = useState<RenewalRequestView[]>([]);
  const [transfers, setTransfers] = useState<TransferRequestView[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");

  if (!apiContext) {
    return (
      <Card title="Requests">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  const showError = (error: unknown) => {
    setStatusMessage(toErrorMessage(error));
    setTone("error");
  };

  const showSuccess = (text: string) => {
    setStatusMessage(text);
    setTone("success");
  };

  const refreshRequests = async () => {
    try {
      const [renewalRows, transferRows] = await Promise.all([
        clinicalPortalApi.getPendingRenewals(apiContext),
        clinicalPortalApi.getPendingTransfers(apiContext),
      ]);
      setRenewals(renewalRows);
      setTransfers(transferRows);
      showSuccess("Pending requests refreshed");
    } catch (error) {
      showError(error);
    }
  };

  const reviewRenewal = async (requestId: string, approve: boolean) => {
    try {
      const updated = await clinicalPortalApi.reviewRenewal(
        apiContext,
        requestId,
        approve,
        reviewNotes[requestId] || undefined
      );
      setRenewals((previous) => previous.map((item) => (item.id === requestId ? updated : item)));
      showSuccess(approve ? "Renewal approved" : "Renewal rejected");
    } catch (error) {
      showError(error);
    }
  };

  const reviewTransfer = async (requestId: string, approve: boolean) => {
    try {
      const updated = await clinicalPortalApi.reviewTransfer(
        apiContext,
        requestId,
        approve,
        reviewNotes[requestId] || undefined
      );
      setTransfers((previous) => previous.map((item) => (item.id === requestId ? updated : item)));
      showSuccess(approve ? "Transfer approved" : "Transfer rejected");
    } catch (error) {
      showError(error);
    }
  };

  return (
    <>
      <Card title="Pending Reviews">
        <InlineActions>
          <ActionButton label="Refresh Requests" onPress={() => void refreshRequests()} />
        </InlineActions>
        <MessageBanner message={statusMessage} tone={tone} />
      </Card>

      <Card title="Medication Renewals">
        {renewals.length > 0 ? (
          <View style={styles.list}>
            {renewals.map((renewal) => (
              <View
                key={renewal.id}
                style={[styles.itemCard, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}
              >
                <Text style={[styles.itemTitle, { color: T.text }]}>{renewal.medicationName}</Text>
                <Text style={[styles.itemMeta, { color: T.textMid }]}>
                  {renewal.dosage}  |  {renewal.frequency}  |  Requested {formatDateTime(renewal.requestedAt)}
                </Text>
                {renewal.requestNote ? (
                  <Text style={[styles.itemBody, { color: T.text }]}>{renewal.requestNote}</Text>
                ) : null}
                <InputField
                  label="Review Note"
                  value={reviewNotes[renewal.id] || ""}
                  onChangeText={(value) => setReviewNotes((previous) => ({ ...previous, [renewal.id]: value }))}
                  placeholder="Optional approval or rejection note."
                />
                <InlineActions>
                  <ActionButton label="Approve" onPress={() => void reviewRenewal(renewal.id, true)} />
                  <ActionButton label="Reject" onPress={() => void reviewRenewal(renewal.id, false)} variant="danger" />
                </InlineActions>
              </View>
            ))}
          </View>
        ) : (
          <MessageBanner message="No renewal requests loaded." tone="info" />
        )}
      </Card>

      <Card title="Transfer Requests">
        {transfers.length > 0 ? (
          <View style={styles.list}>
            {transfers.map((transfer) => (
              <View
                key={transfer.id}
                style={[styles.itemCard, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}
              >
                <Text style={[styles.itemTitle, { color: T.text }]}>
                  {transfer.sourceFacilityCode}{" to "}{transfer.targetFacilityCode}
                </Text>
                <Text style={[styles.itemMeta, { color: T.textMid }]}>
                  Requested {formatDateTime(transfer.requestedAt)}
                </Text>
                {transfer.reason ? (
                  <Text style={[styles.itemBody, { color: T.text }]}>{transfer.reason}</Text>
                ) : null}
                <InputField
                  label="Review Note"
                  value={reviewNotes[transfer.id] || ""}
                  onChangeText={(value) => setReviewNotes((previous) => ({ ...previous, [transfer.id]: value }))}
                  placeholder="Optional transfer decision note."
                />
                <InlineActions>
                  <ActionButton label="Approve" onPress={() => void reviewTransfer(transfer.id, true)} />
                  <ActionButton label="Reject" onPress={() => void reviewTransfer(transfer.id, false)} variant="danger" />
                </InlineActions>
              </View>
            ))}
          </View>
        ) : (
          <MessageBanner message="No transfer requests loaded." tone="info" />
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  itemMeta: {
    fontSize: 12,
  },
  itemBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});
