import {
  Color,
  getPreferenceValues,
  Icon,
  MenuBarExtra,
  openExtensionPreferences,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { getUsage, reasonFor, UsageResult } from "./lib/client";

type Preferences = {
  titleWindows?: "both" | "w" | "c";
};

function severityColor(pct: number): Color {
  if (pct < 50) return Color.Green;
  if (pct < 80) return Color.Yellow;
  return Color.Red;
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

function titleFor(data: UsageResult, mode: "both" | "w" | "c"): string {
  const w = `W ${data.sevenDay.pct}%`;
  const c = `C ${data.fiveHour.pct}%`;
  if (mode === "w") return w;
  if (mode === "c") return c;
  return `${w} · ${c}`;
}

export default function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const mode = prefs.titleWindows ?? "both";

  const { data, isLoading, error, revalidate } = useCachedPromise(
    getUsage,
    [],
    {
      keepPreviousData: true,
    },
  );

  // Never blank the title: fall back to a marker when there is no data yet.
  if (error && !data) {
    return (
      <MenuBarExtra
        icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
        title="Claude ?"
      >
        <MenuBarExtra.Item title={reasonFor(error)} />
        <MenuBarExtra.Separator />
        <MenuBarExtra.Item
          title="Refresh"
          icon={Icon.ArrowClockwise}
          onAction={revalidate}
        />
        <MenuBarExtra.Item
          title="Open Preferences"
          icon={Icon.Gear}
          onAction={openExtensionPreferences}
        />
      </MenuBarExtra>
    );
  }

  if (!data) {
    return <MenuBarExtra isLoading={isLoading} title="Claude ..." />;
  }

  return (
    <MenuBarExtra isLoading={isLoading} title={titleFor(data, mode)}>
      <MenuBarExtra.Item
        icon={{
          source: Icon.CircleFilled,
          tintColor: severityColor(data.fiveHour.pct),
        }}
        title={`Current session: ${data.fiveHour.pct}%`}
        subtitle={resetRelative(data.fiveHour.resetsAt)}
      />
      <MenuBarExtra.Item
        icon={{
          source: Icon.CircleFilled,
          tintColor: severityColor(data.sevenDay.pct),
        }}
        title={`Weekly (all models): ${data.sevenDay.pct}%`}
        subtitle={resetLocal(data.sevenDay.resetsAt)}
      />
      <MenuBarExtra.Item
        icon={{
          source: Icon.CircleFilled,
          tintColor: severityColor(data.sevenDaySonnet.pct),
        }}
        title={`Weekly (Sonnet): ${data.sevenDaySonnet.pct}%`}
        subtitle={resetLocal(data.sevenDaySonnet.resetsAt)}
      />
      <MenuBarExtra.Separator />
      <MenuBarExtra.Item
        title="Refresh"
        icon={Icon.ArrowClockwise}
        onAction={revalidate}
      />
      <MenuBarExtra.Item
        title="Open Preferences"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
    </MenuBarExtra>
  );
}
