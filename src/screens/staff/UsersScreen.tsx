import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "../../api/client";
import { adminPortalApi } from "../../api/services";
import type { AdminUserAccount } from "../../api/types";
import { ActionButton, Card, InlineActions, JsonPanel, MessageBanner, useTheme } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

type GroupedUserSet = {
  key: string;
  title: string;
  description: string;
  items: AdminUserAccount[];
};

type UserGroupDefinition = {
  key: string;
  title: string;
  description: string;
  matches: (account: AdminUserAccount) => boolean;
};

const USER_GROUPS: UserGroupDefinition[] = [
  {
    key: "super_admins",
    title: "Super Admins",
    description: "Highest-access platform administrators.",
    matches: account => account.role === "SUPER_ADMIN",
  },
  {
    key: "admins",
    title: "Admins",
    description: "Administrative users managing staff, patients, and kiosks.",
    matches: account => account.role === "ADMIN",
  },
  {
    key: "nurses",
    title: "Nurses",
    description: "Clinical staff with triage and patient workflow access.",
    matches: account => account.role === "NURSE",
  },
  {
    key: "receptionists",
    title: "Receptionists",
    description: "Front-desk users handling appointments and queue intake.",
    matches: account => account.role === "RECEPTIONIST",
  },
  {
    key: "consultants",
    title: "Consultants",
    description: "Consultant or physician accounts created from the admin portal.",
    matches: account => account.role === "PHYSICIAN",
  },
  {
    key: "patients",
    title: "Patients",
    description: "Patient portal login accounts.",
    matches: account => account.role === "PATIENT",
  },
  {
    key: "kiosks",
    title: "Kiosks",
    description: "Registered kiosk device identities.",
    matches: account => account.role === "KIOSK",
  },
  {
    key: "other_staff",
    title: "Other Staff",
    description: "Other managed staff accounts such as pharmacy or lab users.",
    matches: account => ["PHARMACIST", "LAB_TECHNICIAN"].includes(account.role),
  },
];

function normalizeRole(role: string | null | undefined) {
  return (role || "").toUpperCase();
}

function formatRoleLabel(role: string) {
  return role.replace(/_/g, " ");
}

function sortAccounts(accounts: AdminUserAccount[]) {
  return [...accounts].sort((left, right) => {
    const leftName = (left.fullName || left.username).toLowerCase();
    const rightName = (right.fullName || right.username).toLowerCase();
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }
    return left.username.toLowerCase().localeCompare(right.username.toLowerCase());
  });
}

export function UsersScreen() {
  const { apiContext, role } = useSession();
  const { theme: T } = useTheme();

  const [users, setUsers] = useState<AdminUserAccount[]>([]);
  const [activeSessions, setActiveSessions] = useState<unknown>(null);
  const [auditEvents, setAuditEvents] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "success">("success");

  const normalizedRole = normalizeRole(role);
  const canViewUsers = normalizedRole === "ADMIN" || normalizedRole === "SUPER_ADMIN";
  const canViewSuperAdminData = normalizedRole === "SUPER_ADMIN";

  const loadUsers = async () => {
    if (!apiContext) {
      return;
    }
    try {
      const response = await adminPortalApi.getUsers(apiContext);
      setUsers(response);
      setMessage("Users loaded.");
      setTone("success");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403 && canViewSuperAdminData) {
        try {
          const response = await adminPortalApi.getStaffAccounts(apiContext);
          setUsers(response.map(account => ({ ...account })));
          setMessage("Loaded non-patient accounts from the super-admin endpoint. Restart the backend if you also want patient portal users listed here.");
          setTone("success");
          return;
        } catch (fallbackError) {
          setMessage(toErrorMessage(fallbackError));
          setTone("error");
          return;
        }
      }
      setMessage(toErrorMessage(error));
      setTone("error");
    }
  };

  const loadActiveSessions = async () => {
    if (!apiContext) {
      return;
    }
    try {
      const response = await adminPortalApi.getActiveSessions(apiContext);
      setActiveSessions(response);
      setMessage("Active sessions loaded.");
      setTone("success");
    } catch (error) {
      setMessage(toErrorMessage(error));
      setTone("error");
    }
  };

  const loadAuditEvents = async () => {
    if (!apiContext) {
      return;
    }
    try {
      const response = await adminPortalApi.getAuditEvents(apiContext, 100);
      setAuditEvents(response);
      setMessage("Audit logs loaded.");
      setTone("success");
    } catch (error) {
      setMessage(toErrorMessage(error));
      setTone("error");
    }
  };

  useEffect(() => {
    if (!canViewUsers || !apiContext) {
      return;
    }
    loadUsers().catch(() => undefined);
  }, [apiContext, canViewUsers]);

  const groupedUsers = useMemo<GroupedUserSet[]>(() => {
    const matchedIds = new Set<string>();
    const groups: GroupedUserSet[] = USER_GROUPS.map(group => {
      const items = sortAccounts(users.filter(account => group.matches(account)));
      items.forEach(account => matchedIds.add(account.userId));
      return {
        key: group.key,
        title: group.title,
        description: group.description,
        items,
      };
    });

    const uncategorized = sortAccounts(users.filter(account => !matchedIds.has(account.userId)));
    if (uncategorized.length) {
      groups.push({
        key: "uncategorized",
        title: "Uncategorized",
        description: "Managed accounts with a role not yet grouped in the UI.",
        items: uncategorized,
      });
    }

    return groups;
  }, [users]);

  if (!apiContext) {
    return (
      <Card title="Users">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  if (!canViewUsers) {
    return (
      <Card title="Users">
        <MessageBanner message="Only admins and super admins can view user accounts." tone="error" />
      </Card>
    );
  }

  return (
    <>
      <Card title="Users">
        <MessageBanner
          message="Created accounts are grouped below by type so you can quickly find nurses, receptionists, patients, consultants, and other user categories."
          tone="info"
        />
        <InlineActions>
          <ActionButton label="Refresh Users" onPress={loadUsers} />
          {canViewSuperAdminData ? (
            <ActionButton label="Load Sessions" onPress={loadActiveSessions} variant="secondary" />
          ) : null}
          {canViewSuperAdminData ? (
            <ActionButton label="Load Audit Logs" onPress={loadAuditEvents} variant="secondary" />
          ) : null}
        </InlineActions>
        <MessageBanner message={message} tone={tone} />

        <View style={styles.summaryGrid}>
          {groupedUsers.map(group => (
            <View
              key={group.key}
              style={[
                styles.summaryTile,
                { backgroundColor: T.surfaceAlt as string, borderColor: T.border },
              ]}
            >
              <Text style={[styles.summaryCount, { color: T.text }]}>{group.items.length}</Text>
              <Text style={[styles.summaryLabel, { color: T.textMid }]}>{group.title}</Text>
            </View>
          ))}
        </View>
      </Card>

      {groupedUsers.map(group => (
        <Card key={group.key} title={`${group.title} (${group.items.length})`}>
          <Text style={[styles.groupDescription, { color: T.textMid }]}>{group.description}</Text>
          {group.items.length ? (
            <View style={styles.accountList}>
              {group.items.map(account => (
                <View
                  key={account.userId}
                  style={[
                    styles.accountRow,
                    { backgroundColor: T.surfaceAlt as string, borderColor: T.border },
                  ]}
                >
                  <View style={styles.accountIdentity}>
                    <Text style={[styles.accountName, { color: T.text }]}>
                      {account.fullName || account.username}
                    </Text>
                    <Text style={[styles.accountMeta, { color: T.textMid }]}>
                      {account.email ? `@${account.username}  |  ${account.email}` : `@${account.username}`}
                    </Text>
                  </View>

                  <View style={styles.accountBadges}>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: T.tealGlow as string, borderColor: T.border },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: T.teal }]}>{formatRoleLabel(account.role)}</Text>
                    </View>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: account.active ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                          borderColor: account.active ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: account.active ? T.success : T.danger },
                        ]}
                      >
                        {account.active ? "Active" : "Inactive"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <MessageBanner message={`No ${group.title.toLowerCase()} found.`} tone="info" />
          )}
        </Card>
      ))}

      {canViewSuperAdminData && activeSessions ? (
        <Card title="Active Sessions">
          <JsonPanel value={activeSessions} />
        </Card>
      ) : null}

      {canViewSuperAdminData && auditEvents ? (
        <Card title="Audit Logs (Redacted)">
          <JsonPanel value={auditEvents} />
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },
  summaryTile: {
    minWidth: 120,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryCount: {
    fontSize: 22,
    fontWeight: "900",
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  groupDescription: {
    fontSize: 13,
    marginBottom: 14,
  },
  accountList: {
    gap: 10,
  },
  accountRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  accountIdentity: {
    flex: 1,
    minWidth: 220,
  },
  accountName: {
    fontSize: 16,
    fontWeight: "800",
  },
  accountMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  accountBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
});
