import SwiftUI

/// App entry. A menu bar item with a window-style popover.
///
/// LSUIElement in Info.plist keeps this a menu-bar-only agent (no Dock icon).
@main
struct ClaudeUsageApp: App {
    @StateObject private var model = UsageModel()

    var body: some Scene {
        MenuBarExtra {
            UsagePopover().environmentObject(model)
        } label: {
            MenuBarLabel().environmentObject(model)
        }
        .menuBarExtraStyle(.window)
    }
}
