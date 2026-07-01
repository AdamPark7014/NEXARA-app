import Foundation

/// Origen de assets (uploads) — paridad con Android `ApiUrls.kt`.
enum ApiUrls {
    static var assetOrigin: String {
        let base = ApiClient.shared.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if base.hasSuffix("/api") {
            return String(base.dropLast(4))
        }
        return base
    }

    static func absoluteAsset(_ maybeRelative: String?) -> String {
        let url = (maybeRelative ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if url.isEmpty { return "" }
        if url.hasPrefix("http://") || url.hasPrefix("https://") { return url }
        let origin = assetOrigin.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let path = url.hasPrefix("/") ? url : "/\(url)"
        return origin + path
    }
}
