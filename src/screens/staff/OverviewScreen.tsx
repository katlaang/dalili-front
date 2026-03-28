import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { encounterApi } from "../../api/services";
import type { ClinicalDashboard, DashboardAgeBucket, DashboardBreakdownItem } from "../../api/types";
import { ActionButton, Card, InlineActions, MessageBanner, useTheme } from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import { getVulnerabilityBadgeColors } from "../../utils/vulnerability";

const WEEK_RECURRING_THRESHOLD = 3;
const MONTH_RECURRING_THRESHOLD = 6;
const AGE_BUCKETS = [
  { key: "0_5", label: "0-5" },
  { key: "6_17", label: "6-17" },
  { key: "18_34", label: "18-34" },
  { key: "35_49", label: "35-49" },
  { key: "50_64", label: "50-64" },
  { key: "65_PLUS", label: "65+" },
] as const;

function formatRoleTitle(role: string | null) {
  switch ((role || "").toUpperCase()) {
    case "NURSE":
      return "Nursing Dashboard";
    case "PHYSICIAN":
      return "Doctor Dashboard";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "Clinical Dashboard";
    default:
      return "Dashboard";
  }
}

function formatCount(value?: number | null) {
  return String(value ?? 0);
}

function formatComplaint(complaint?: { label?: string | null; count?: number | null } | null) {
  if (!complaint?.label) {
    return {
      title: "No complaint trend yet",
      detail: "No repeated complaint data is available for this period.",
    };
  }

  return {
    title: complaint.label,
    detail: `${complaint.count ?? 0} patient${complaint.count === 1 ? "" : "s"} this period`,
  };
}

function formatMinutes(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value)}%`;
}

function toWidth(count: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.max(8, Math.round((count / total) * 100))}%`;
}

function normalizeAgeBuckets(items: DashboardAgeBucket[]) {
  const counts = new Map<string, number>();

  items.forEach(item => {
    const normalizedKey = `${item.key || ""}`.toUpperCase();
    const normalizedLabel = `${item.label || ""}`.toUpperCase();

    if (normalizedKey.includes("0") && normalizedKey.includes("5")) counts.set("0_5", item.count);
    else if (normalizedKey.includes("6") && normalizedKey.includes("17")) counts.set("6_17", item.count);
    else if (normalizedKey.includes("18") && normalizedKey.includes("34")) counts.set("18_34", item.count);
    else if (normalizedKey.includes("35") && normalizedKey.includes("49")) counts.set("35_49", item.count);
    else if (normalizedKey.includes("50") && normalizedKey.includes("64")) counts.set("50_64", item.count);
    else if (normalizedKey.includes("65") || normalizedLabel.includes("65")) counts.set("65_PLUS", item.count);
    else if (normalizedLabel.includes("0-5")) counts.set("0_5", item.count);
    else if (normalizedLabel.includes("6-17")) counts.set("6_17", item.count);
    else if (normalizedLabel.includes("18-34")) counts.set("18_34", item.count);
    else if (normalizedLabel.includes("35-49")) counts.set("35_49", item.count);
    else if (normalizedLabel.includes("50-64")) counts.set("50_64", item.count);
  });

  return AGE_BUCKETS.map(bucket => ({
    ...bucket,
    count: counts.get(bucket.key) ?? 0,
  }));
}

function KpiCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  const { theme: T } = useTheme();

  return (
    <View style={[styles.kpiCard, { backgroundColor: T.surfaceAlt as string, borderColor: T.border }]}>
      <Text style={[styles.cardEyebrow, { color: T.textMuted }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: T.teal }]}>{value}</Text>
      <Text style={[styles.kpiHelper, { color: T.text }]}>{helper}</Text>
    </View>
  );
}

function BreakdownBars({
  items,
  emptyMessage,
}: {
  items: DashboardBreakdownItem[];
  emptyMessage: string;
}) {
  const { theme: T } = useTheme();
  const total = items.reduce((sum, item) => sum + (item.count || 0), 0);

  if (items.length === 0) {
    return <MessageBanner message={emptyMessage} tone="info" />;
  }

  return (
    <View style={styles.breakdownList}>
      {items.map(item => (
        <View key={`${item.key}-${item.label}`} style={styles.breakdownRow}>
          <View style={styles.breakdownHeader}>
            <Text style={[styles.breakdownLabel, { color: T.text }]}>{item.label}</Text>
            <Text style={[styles.breakdownCount, { color: T.textMid }]}>{item.count}</Text>
          </View>
          <View style={[styles.breakdownTrack, { backgroundColor: T.borderLight }]}>
            <View
              style={[
                styles.breakdownFill,
                { backgroundColor: T.teal, width: toWidth(item.count || 0, total) as any },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function AgeChart({ buckets }: { buckets: Array<{ key: string; label: string; count: number }> }) {
  const { theme: T } = useTheme();
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  if (total === 0) {
    return <MessageBanner message="No monthly patient-age mix is available yet." tone="info" />;
  }

  const max = Math.max(...buckets.map(bucket => bucket.count), 1);

  return (
    <View style={styles.ageChartWrap}>
      <View style={styles.ageChart}>
        {buckets.map(bucket => (
          <View key={bucket.key} style={styles.ageColumn}>
            <View style={[styles.ageTrack, { backgroundColor: T.borderLight }]}>
              <View
                style={[
                  styles.ageBar,
                  {
                    backgroundColor: T.teal,
                    height: `${Math.max(8, Math.round((bucket.count / max) * 100))}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.ageCount, { color: T.text }]}>{bucket.count}</Text>
            <Text style={[styles.ageLabel, { color: T.textMuted }]}>{bucket.label}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.ageFootnote, { color: T.textMid }]}>
        Monthly patient mix across fixed age buckets.
      </Text>
    </View>
  );
}

export function OverviewScreen() {
  const { apiContext, role } = useSession();
  const { theme: T } = useTheme();
  const [dashboard, setDashboard] = useState<ClinicalDashboard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshDashboard = useCallback(async () => {
    if (!apiContext) return;
    setRefreshing(true);
    try {
      const response = await encounterApi.getClinicalDashboard(apiContext);
      setDashboard(response);
      setMessage(null);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [apiContext]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const title = formatRoleTitle(role);
  const complaintWeek = formatComplaint(dashboard?.mostCommonComplaintWeek);
  const complaintMonth = formatComplaint(dashboard?.mostCommonComplaintMonth);
  const recurringTopComplaintMatches =
    !!dashboard?.mostCommonComplaintWeek?.key &&
    dashboard.mostCommonComplaintWeek.key === dashboard?.mostCommonComplaintMonth?.key;
  const showRecurringBanner =
    !!dashboard &&
    recurringTopComplaintMatches &&
    (dashboard.mostCommonComplaintWeek?.count ?? 0) >= WEEK_RECURRING_THRESHOLD &&
    (dashboard.mostCommonComplaintMonth?.count ?? 0) >= MONTH_RECURRING_THRESHOLD &&
    dashboard.recurringIssueFlagged;
  const ageBuckets = useMemo(
    () => normalizeAgeBuckets(dashboard?.ageDistributionMonth || []),
    [dashboard?.ageDistributionMonth]
  );
  const elderlyBucket = ageBuckets.find(bucket => bucket.key === "65_PLUS")?.count ?? 0;
  const showAiCard =
    dashboard?.aiTranscriptionCorrectnessWeekPercent != null ||
    dashboard?.aiTranscriptionCorrectnessMonthPercent != null ||
    ["PHYSICIAN", "ADMIN", "SUPER_ADMIN"].includes((role || "").toUpperCase());
  const generatedAt = dashboard?.generatedAt
    ? new Date(dashboard.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  if (!apiContext) {
    return (
      <Card title={title}>
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  return (
    <>
      <Card title={title}>
        <Text style={[styles.pageLead, { color: T.textMid }]}>
          Real-time clinical operations for the signed-in role, backed by the encounter dashboard service.
        </Text>
        <InlineActions>
          <ActionButton
            label={refreshing ? "Refreshing Dashboard..." : "Refresh Dashboard"}
            onPress={() => void refreshDashboard()}
            disabled={refreshing}
          />
        </InlineActions>
        {generatedAt ? (
          <Text style={[styles.generatedAt, { color: T.textMuted }]}>Updated at {generatedAt}</Text>
        ) : null}
        <MessageBanner message={message} tone="error" />
      </Card>

      {dashboard ? (
        <>
          <Card title="Activity">
            <View style={styles.kpiStrip}>
              <KpiCard
                label="Today"
                value={formatCount(dashboard.patientsSeenToday)}
                helper={`${dashboard.activityLabel || "Patients"} today`}
              />
              <KpiCard
                label="This week"
                value={formatCount(dashboard.patientsSeenWeek)}
                helper={`${dashboard.activityLabel || "Patients"} this week`}
              />
              <KpiCard
                label="This month"
                value={formatCount(dashboard.patientsSeenMonth)}
                helper={`${dashboard.activityLabel || "Patients"} this month`}
              />
            </View>
          </Card>

          <View style={styles.twoUpGrid}>
            <Card title="Most Common Complaint This Week" style={styles.panelCard}>
              <Text style={[styles.complaintTitle, { color: T.text }]}>{complaintWeek.title}</Text>
              <Text style={[styles.complaintDetail, { color: T.textMid }]}>{complaintWeek.detail}</Text>
            </Card>
            <Card title="Most Common Complaint This Month" style={styles.panelCard}>
              <Text style={[styles.complaintTitle, { color: T.text }]}>{complaintMonth.title}</Text>
              <Text style={[styles.complaintDetail, { color: T.textMid }]}>{complaintMonth.detail}</Text>
            </Card>
          </View>

          {showRecurringBanner ? (
            <Card title="Recurring Issue Flag">
              <View style={[styles.recurringBanner, { backgroundColor: T.warning + "18", borderColor: T.warning + "66" }]}>
                <Text style={[styles.recurringTitle, { color: T.warning }]}>
                  Repeated complaint pattern detected
                </Text>
                <Text style={[styles.recurringBody, { color: T.text }]}>
                  {dashboard.recurringIssueMessage ||
                    `${dashboard.mostCommonComplaintWeek?.label} is leading both the weekly and monthly complaint trends.`}
                </Text>
              </View>
            </Card>
          ) : null}

          <View style={styles.twoUpGrid}>
            <Card title="Processing Time Today" style={styles.panelCard}>
              <Text style={[styles.metricPrimary, { color: T.teal }]}>
                {formatMinutes(dashboard.processingTimeToday?.averageMinutes)}
              </Text>
              <Text style={[styles.metricSecondary, { color: T.textMid }]}>
                {dashboard.processingTimeToday?.label || "Average processing time"}
              </Text>
              <Text style={[styles.metricFootnote, { color: T.text }]}>
                Range {formatMinutes(dashboard.processingTimeToday?.minMinutes)} to{" "}
                {formatMinutes(dashboard.processingTimeToday?.maxMinutes)} across{" "}
                {dashboard.processingTimeToday?.sampleSize ?? 0} case(s).
              </Text>
            </Card>

            {showAiCard ? (
              <Card title="AI Correctness" style={styles.panelCard}>
                <Text style={[styles.metricPrimary, { color: T.teal }]}>
                  {formatPercent(dashboard.aiTranscriptionCorrectnessWeekPercent)}
                </Text>
                <Text style={[styles.metricSecondary, { color: T.textMid }]}>
                  This week
                </Text>
                <Text style={[styles.metricFootnote, { color: T.text }]}>
                  This month: {formatPercent(dashboard.aiTranscriptionCorrectnessMonthPercent)}
                </Text>
              </Card>
            ) : null}
          </View>

          <View style={styles.twoUpGrid}>
            <Card title="Today By Service Category" style={styles.panelCard}>
              <BreakdownBars
                items={dashboard.todayCategoryBreakdown || []}
                emptyMessage="No category activity available for today."
              />
            </Card>

            <Card title="Today By Urgency" style={styles.panelCard}>
              <BreakdownBars
                items={dashboard.todayUrgencyBreakdown || []}
                emptyMessage="No urgency activity available for today."
              />
            </Card>
          </View>

          <Card title="Monthly Patient Age Mix">
            <AgeChart buckets={ageBuckets} />
            {elderlyBucket > 0 ? (
              <View style={styles.dashboardMarkerWrap}>
                <View
                  style={[
                    styles.dashboardMarker,
                    {
                      backgroundColor: getVulnerabilityBadgeColors("elderly").backgroundColor,
                      borderColor: getVulnerabilityBadgeColors("elderly").borderColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dashboardMarkerText,
                      { color: getVulnerabilityBadgeColors("elderly").color },
                    ]}
                  >
                    Elderly patients this month: {elderlyBucket}
                  </Text>
                </View>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pageLead: {
    fontSize: 13,
    lineHeight: 20,
  },
  generatedAt: {
    fontSize: 12,
  },
  kpiStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  kpiCard: {
    flexGrow: 1,
    minWidth: 190,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  kpiValue: {
    fontSize: 30,
    fontWeight: "800",
  },
  kpiHelper: {
    fontSize: 13,
    lineHeight: 18,
  },
  twoUpGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  panelCard: {
    flex: 1,
    minWidth: 280,
  },
  complaintTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  complaintDetail: {
    fontSize: 13,
    lineHeight: 20,
  },
  recurringBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  recurringTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  recurringBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  metricPrimary: {
    fontSize: 28,
    fontWeight: "800",
  },
  metricSecondary: {
    fontSize: 13,
    fontWeight: "700",
  },
  metricFootnote: {
    fontSize: 13,
    lineHeight: 20,
  },
  breakdownList: {
    gap: 12,
  },
  breakdownRow: {
    gap: 6,
  },
  breakdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  breakdownCount: {
    fontSize: 12,
    fontWeight: "700",
  },
  breakdownTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  breakdownFill: {
    height: "100%",
    borderRadius: 999,
  },
  ageChartWrap: {
    gap: 10,
  },
  ageChart: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-end",
    minHeight: 180,
  },
  ageColumn: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  ageTrack: {
    width: "100%",
    maxWidth: 78,
    height: 120,
    borderRadius: 16,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  ageBar: {
    width: "100%",
    borderRadius: 16,
  },
  ageCount: {
    fontSize: 14,
    fontWeight: "800",
  },
  ageLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  ageFootnote: {
    fontSize: 12,
  },
  dashboardMarkerWrap: {
    marginTop: 8,
  },
  dashboardMarker: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  dashboardMarkerText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
