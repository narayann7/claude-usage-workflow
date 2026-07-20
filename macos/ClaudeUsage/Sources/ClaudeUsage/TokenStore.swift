import Foundation

/// Resolves the Claude Code OAuth access token, same order as the shared core.
///
/// 1. macOS Keychain, via the `security` CLI (avoids SecItem ACL prompts).
/// 2. Fallback file: ~/.claude/.credentials.json.
///
/// Both hold a JSON blob with the token at `.claudeAiOauth.accessToken`.
enum TokenStore {

    /// Shape of the stored credentials blob.
    private struct Credentials: Decodable {
        struct OAuth: Decodable { let accessToken: String? }
        let claudeAiOauth: OAuth?
    }

    /// Returns the access token, or nil if no login was found.
    static func resolveToken() -> String? {
        if let fromKeychain = tokenFromKeychain() { return fromKeychain }
        if let fromFile = tokenFromFile() { return fromFile }
        return nil
    }

    // MARK: Keychain (via `security` CLI)

    private static func tokenFromKeychain() -> String? {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        task.arguments = ["find-generic-password", "-s", "Claude Code-credentials", "-w"]

        let outPipe = Pipe()
        let errPipe = Pipe()
        task.standardOutput = outPipe
        task.standardError = errPipe

        do {
            try task.run()
            task.waitUntilExit()
        } catch {
            return nil
        }
        guard task.terminationStatus == 0 else { return nil }

        let data = outPipe.fileHandleForReading.readDataToEndOfFile()
        guard let raw = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !raw.isEmpty else { return nil }

        return parseToken(from: Data(raw.utf8))
    }

    // MARK: Fallback file

    private static func tokenFromFile() -> String? {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let url = home.appendingPathComponent(".claude/.credentials.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return parseToken(from: data)
    }

    // MARK: JSON parse

    private static func parseToken(from data: Data) -> String? {
        guard let creds = try? JSONDecoder().decode(Credentials.self, from: data),
            let token = creds.claudeAiOauth?.accessToken,
            !token.isEmpty else { return nil }
        return token
    }
}
