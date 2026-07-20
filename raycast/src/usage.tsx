import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  openExtensionPreferences,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import {
  getUsage,
  reasonFor,
  summaryLine,
  UsageResult,
  Window,
} from "./lib/client";

// green < 50, yellow < 80, red otherwise. Shared with the menu bar's dot logic.
function severityColor(pct: number): Color {
  if (pct < 50) return Color.Green;
  if (pct < 80) return Color.Yellow;
  return Color.Red;
}

function bar(pct: number, width = 14): string {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round((clamped / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function resetRelative(iso: string, now = new Date()): string {
  const target = new Date(iso).getTime();
  const diffMs = target - now.getTime();
  if (!Number.isFinite(target) || diffMs <= 0) return "resets soon";
  const totalMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return hours > 0 ? `resets in ${hours}h ${mins}m` : `resets in ${mins}m`;
}

function resetLocal(iso: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "resets soon";
  const day = target.toLocaleDateString("en-US", { weekday: "short" });
  const time = target.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `resets ${day} ${time}`;
}

type Row = {
  key: string;
  title: string;
  window: Window;
  reset: (iso: string) => string;
};

function rowsFrom(data: UsageResult): Row[] {
  return [
    {
      key: "session",
      title: "Current session",
      window: data.fiveHour,
      reset: (iso) => resetRelative(iso),
    },
    {
      key: "weekly",
      title: "Weekly (all models)",
      window: data.sevenDay,
      reset: (iso) => resetLocal(iso),
    },
    {
      key: "sonnet",
      title: "Weekly (Sonnet)",
      window: data.sevenDaySonnet,
      reset: (iso) => resetLocal(iso),
    },
  ];
}

export default function Command() {
  const { data, isLoading, error, revalidate } = useCachedPromise(
    getUsage,
    [],
    {
      keepPreviousData: true,
    },
  );

  const sharedActions = (
    <ActionPanel>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        onAction={revalidate}
      />
      <Action
        title="Open Preferences"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
    </ActionPanel>
  );

  if (error) {
    return (
      <List isLoading={isLoading}>
        <List.EmptyView
          icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
          title={reasonFor(error)}
          description="Press Enter to refresh, or open preferences."
          actions={sharedActions}
        />
      </List>
    );
  }

  if (!data && isLoading) {
    return <List isLoading />;
  }

  if (!data) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.QuestionMark}
          title="No usage data"
          actions={sharedActions}
        />
      </List>
    );
  }

  const summary = summaryLine(data);
  const rows = rowsFrom(data);

  return (
    <List isLoading={isLoading}>
      {rows.map((row) => {
        const pct = row.window.pct;
        return (
          <List.Item
            key={row.key}
            icon={{ source: Icon.CircleFilled, tintColor: severityColor(pct) }}
            title={row.title}
            subtitle={`${bar(pct)} ${pct}%`}
            accessories={[{ text: row.reset(row.window.resetsAt) }]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy Summary"
                  content={summary}
                  icon={Icon.Clipboard}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  onAction={revalidate}
                />
                <Action
                  title="Open Preferences"
                  icon={Icon.Gear}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
