import SwiftUI

/// The compact title shown in the menu bar, e.g. "W 35% . C 18%".
///
/// Content depends on the `titleWindows` config. Shows a loading placeholder on
/// first load and an error marker when a fetch failed with no cached data.
struct MenuBarLabel: View {
    @EnvironmentObject var model: UsageModel
    @AppStorage(ConfigKey.titleWindows) private var titleWindows: String = "both"
    @AppStorage(ConfigKey.showSeverity) private var showSeverity: Bool = true

    var body: some View {
        HStack(spacing: 4) {
            if showSeverity, let color = severityColor {
                Image(systemName: "circle.fill")
                    .foregroundStyle(color)
                    .font(.system(size: 7))
            }
            Text(titleText)
        }
    }

    /// The text portion of the label.
    private var titleText: String {
        // No data yet plus an error means we cannot show numbers.
        if model.session == nil && model.weekly == nil {
            if model.lastError != nil { return "Claude !" }
            if model.isLoading { return "Claude ..." }
            return "Claude ..."
        }

        let w = model.weekly.map { "W \(Formatters.pct($0.pct))" }
        let c = model.session.map { "C \(Formatters.pct($0.pct))" }

        let base: String
        switch titleWindows {
        case "w": base = w ?? "W ?"
        case "c": base = c ?? "C ?"
        default:  base = [w, c].compactMap { $0 }.joined(separator: " . ")
        }
        return model.isStale ? base + " *" : base
    }

    /// Severity color from the worst of the shown windows.
    private var severityColor: Color? {
        var values: [Double] = []
        switch titleWindows {
        case "w": if let w = model.weekly { values.append(w.pct) }
        case "c": if let c = model.session { values.append(c.pct) }
        default:
            if let w = model.weekly { values.append(w.pct) }
            if let c = model.session { values.append(c.pct) }
        }
        guard let worst = values.max() else { return nil }
        return Self.color(for: worst)
    }

    /// Green under 50, yellow under 80, red at or above 80.
    static func color(for pct: Double) -> Color {
        if pct < 50 { return .green }
        if pct < 80 { return .yellow }
        return .red
    }
}
