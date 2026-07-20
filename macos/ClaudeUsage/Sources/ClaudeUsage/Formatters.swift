import Foundation

/// Formatting helpers shared across the UI: percent, unicode bar, reset strings.
enum Formatters {

    /// Whole-number percent, e.g. 35.0 becomes "35%".
    static func pct(_ value: Double) -> String {
        return "\(Int(value.rounded()))%"
    }

    /// A fixed-width unicode meter, e.g. "█████░░░░░" for 50 percent.
    static func bar(_ value: Double, width: Int = 10) -> String {
        let clamped = max(0.0, min(100.0, value))
        let filled = Int((clamped / 100.0 * Double(width)).rounded())
        let empty = max(0, width - filled)
        return String(repeating: "█", count: filled) + String(repeating: "░", count: empty)
    }

    /// A relative reset string, e.g. "resets in 2h 49m".
    ///
    /// Parses the ISO-UTC reset timestamp and describes the gap from now.
    static func resetRelative(_ isoString: String) -> String {
        guard let date = parseISO(isoString) else { return "" }
        let delta = date.timeIntervalSinceNow
        if delta <= 0 { return "resets now" }

        let totalMinutes = Int(delta / 60.0)
        let days = totalMinutes / (60 * 24)
        let hours = (totalMinutes % (60 * 24)) / 60
        let minutes = totalMinutes % 60

        if days > 0 {
            return "resets in \(days)d \(hours)h"
        } else if hours > 0 {
            return "resets in \(hours)h \(minutes)m"
        } else {
            return "resets in \(minutes)m"
        }
    }

    /// A local wall-clock reset string, e.g. "resets Wed 10:29 PM".
    static func resetLocal(_ isoString: String) -> String {
        guard let date = parseISO(isoString) else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US")
        fmt.dateFormat = "EEE h:mm a"
        return "resets \(fmt.string(from: date))"
    }

    // MARK: ISO parsing

    private static let isoWithFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static func parseISO(_ s: String) -> Date? {
        if let d = isoWithFraction.date(from: s) { return d }
        return isoPlain.date(from: s)
    }
}
