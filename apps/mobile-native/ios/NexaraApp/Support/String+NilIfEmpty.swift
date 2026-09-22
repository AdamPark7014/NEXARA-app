import Foundation

// Shared helper: single source of truth for nilIfEmpty across the iOS app.
extension String {
    /// Returns nil when the string is empty; otherwise returns the original string.
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

