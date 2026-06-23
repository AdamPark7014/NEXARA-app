import Foundation
import UIKit

/// Descarga con Bearer token, guarda en Documents/NEXARA y ofrece share sheet.
enum Downloads {
    struct Saved {
        let localURL: URL
        let mimeType: String
        let displayName: String
    }

    static func download(url: String, displayName: String, mimeType: String) async throws -> Saved {
        guard let u = URL(string: url) else { throw NSError(domain: "dl", code: -1) }
        var req = URLRequest(url: u)
        if !SessionStore.shared.token.isEmpty {
            req.setValue("Bearer \(SessionStore.shared.token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let http = response as? HTTPURLResponse
        let finalMime = http?.value(forHTTPHeaderField: "Content-Type")?
            .components(separatedBy: ";").first?
            .trimmingCharacters(in: .whitespaces)
            .nilIfEmpty ?? mimeType

        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let folder = docs.appendingPathComponent("NEXARA", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let safe = displayName.replacingOccurrences(of: "/", with: "_")
        let target = folder.appendingPathComponent(safe)
        try data.write(to: target, options: .atomic)
        return Saved(localURL: target, mimeType: finalMime, displayName: safe)
    }

    static func share(saved: Saved, from source: UIViewController?) {
        let activity = UIActivityViewController(activityItems: [saved.localURL], applicationActivities: nil)
        (source ?? topViewController())?.present(activity, animated: true)
    }

    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.keyWindow?.rootViewController
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
