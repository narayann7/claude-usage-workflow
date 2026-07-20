import Foundation
import SwiftUI
import Combine

/// A single window's presentable state: percent plus reset timestamp.
struct WindowState: Equatable {
    var pct: Double
    var resetsAt: String
}

/// Config keys, kept in one place so views and the model agree.
enum ConfigKey {
    static let titleWindows = "titleWindows"   // "both" | "w" | "c"
    static let showSeverity = "showSeverity"   // Bool
    static let refreshSeconds = "refreshSeconds" // Int
    static let userAgent = "userAgent"         // String
    static let cacheSeconds = "cacheSeconds"   // Int
}

/// Observable state for the menu bar: current windows, loading, errors, and the
/// refresh timer. Holds an in-memory last-good cache so a failed refresh keeps
/// showing the previous numbers with a stale marker.
@MainActor
final class UsageModel: ObservableObject {

    @Published var session: WindowState?   // C, five_hour
    @Published var weekly: WindowState?    // W, seven_day
    @Published var sonnet: WindowState?    // seven_day_sonnet (display only)
    @Published var lastError: UsageError?
    @Published var isLoading: Bool = false
    @Published var isStale: Bool = false
    @Published var lastUpdated: Date?

    private var timer: Timer?
    private var lastGoodAt: Date?

    // Config, read from UserDefaults with built-in defaults. There is no
    // in-app Settings UI; advanced users can override via `defaults write`.
    private var refreshSeconds: Int {
        let v = UserDefaults.standard.integer(forKey: ConfigKey.refreshSeconds)
        return v > 0 ? v : 180
    }
    private var cacheSeconds: Int {
        let v = UserDefaults.standard.integer(forKey: ConfigKey.cacheSeconds)
        return v > 0 ? v : 180
    }
    private var userAgent: String {
        let v = UserDefaults.standard.string(forKey: ConfigKey.userAgent)
        if let v = v, !v.isEmpty { return v }
        return UserAgentDetector.detect()
    }

    init() {
        start()
    }

    /// Start the refresh timer and do an immediate refresh.
    func start() {
        scheduleTimer()
        Task { await refresh() }
    }

    /// Rebuild the timer, e.g. if the refresh interval default changes.
    func scheduleTimer() {
        timer?.invalidate()
        let interval = TimeInterval(refreshSeconds)
        let t = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    /// True if the cached data is older than the cache window.
    var cacheIsStale: Bool {
        guard let at = lastGoodAt else { return true }
        return Date().timeIntervalSince(at) > TimeInterval(cacheSeconds)
    }

    /// Refresh only when the cache is stale (used on popover open).
    func refreshIfStale() async {
        if cacheIsStale { await refresh() }
    }

    /// Fetch fresh usage. On success, replace state. On failure, keep the last
    /// good numbers and flag them stale (except no-token, which clears state).
    func refresh() async {
        if isLoading { return }
        isLoading = true
        defer { isLoading = false }

        guard let token = TokenStore.resolveToken() else {
            lastError = .noToken
            session = nil
            weekly = nil
            sonnet = nil
            isStale = false
            return
        }

        do {
            let resp = try await fetchUsage(token: token, userAgent: userAgent)
            session = WindowState(pct: percent(from: resp.five_hour.utilization),
                                  resetsAt: resp.five_hour.resets_at)
            weekly = WindowState(pct: percent(from: resp.seven_day.utilization),
                                 resetsAt: resp.seven_day.resets_at)
            if let s = resp.seven_day_sonnet {
                sonnet = WindowState(pct: percent(from: s.utilization),
                                     resetsAt: s.resets_at)
            } else {
                sonnet = nil
            }
            lastError = nil
            isStale = false
            lastGoodAt = Date()
            lastUpdated = lastGoodAt
        } catch let err as UsageError {
            lastError = err
            // Keep last-good on transient errors; mark stale if we have data.
            isStale = (session != nil || weekly != nil)
        } catch {
            lastError = .decode
            isStale = (session != nil || weekly != nil)
        }
    }
}

/// Detects the User-Agent string, preferring the installed CLI version.
enum UserAgentDetector {
    static let fallback = "claude-code/1.0.0"

    static func detect() -> String {
        if let version = cliVersion() {
            return "claude-code/\(version)"
        }
        return fallback
    }

    /// Runs `claude --version` and extracts a version number, e.g. "1.2.3".
    private static func cliVersion() -> String? {
        let candidates = [
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude",
            "\(NSHomeDirectory())/.local/bin/claude"
        ]
        guard let path = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            return nil
        }

        let task = Process()
        task.executableURL = URL(fileURLWithPath: path)
        task.arguments = ["--version"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        do {
            try task.run()
            task.waitUntilExit()
        } catch {
            return nil
        }
        guard task.terminationStatus == 0 else { return nil }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let out = String(data: data, encoding: .utf8) else { return nil }
        // Match the first dotted version token like 1.2.3.
        if let range = out.range(of: #"\d+\.\d+\.\d+"#, options: .regularExpression) {
            return String(out[range])
        }
        return nil
    }
}
