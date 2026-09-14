import SwiftUI
import UIKit

/// Descarga de archivos protegidos. `/uploads/*` exige `Authorization` y
/// `AsyncImage` no deja mandar cabeceras, así que las fotos y PDF de evidencia
/// pasan por aquí (con caché en memoria y sin duplicar descargas en curso).
actor AuthenticatedAssetLoader {
    static let shared = AuthenticatedAssetLoader()

    private let cache = NSCache<NSString, NSData>()
    private var inFlight: [String: Task<Data, Error>] = [:]

    /// Carpetas que el API guarda sin el prefijo `/uploads` (ver `saveBase64Photo`).
    private static let uploadFolders: Set<String> = [
        "activities", "evidences", "activity-evidence", "documents",
        "user-docs", "users", "clients", "vehicles", "attendance",
    ]

    init() {
        cache.totalCostLimit = 60 * 1024 * 1024
    }

    func data(for rawValue: String) async throws -> Data {
        let raw = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.lowercased().hasPrefix("data:") {
            guard let decoded = AuthenticatedAssetLoader.decodeDataUrl(raw) else { throw ApiError.invalidURL }
            return decoded
        }
        guard let url = AuthenticatedAssetLoader.resolve(raw) else { throw ApiError.invalidURL }
        let key = url.absoluteString
        if let hit = cache.object(forKey: key as NSString) {
            return hit as Data
        }
        if let running = inFlight[key] {
            return try await running.value
        }
        let task = Task<Data, Error> {
            try await AuthenticatedAssetLoader.fetch(url)
        }
        inFlight[key] = task
        do {
            let data = try await task.value
            inFlight[key] = nil
            cache.setObject(data as NSData, forKey: key as NSString, cost: data.count)
            return data
        } catch {
            inFlight[key] = nil
            throw error
        }
    }

    /// URL absoluta contra el origen del API (la base sin `/api`), igual que
    /// `resolveAssetUrl` de la web.
    static func resolve(_ rawValue: String?) -> URL? {
        var raw = (rawValue ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\", with: "/")
        guard !raw.isEmpty else { return nil }
        let origin = ApiUrls.assetOrigin.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        let lower = raw.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") {
            guard let absolute = URL(string: raw)
                ?? URL(string: raw.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "") else {
                return nil
            }
            guard isUploadPath(absolute.path) else { return absolute }
            // Archivos del API guardados con otro host (p. ej. localhost): se
            // re-anclan al origen actual.
            raw = absolute.path
            if let query = absolute.query, !query.isEmpty { raw += "?" + query }
        }

        var path = raw.hasPrefix("/") ? raw : "/" + raw
        if path.lowercased().hasPrefix("/api/uploads/") {
            path = String(path.dropFirst(4))
        }
        if !path.lowercased().hasPrefix("/uploads/") {
            let first = path.split(separator: "/").first.map { $0.lowercased() } ?? ""
            if uploadFolders.contains(first) {
                path = "/uploads" + path
            }
        }
        let full = origin + path
        return URL(string: full)
            ?? URL(string: full.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")
    }

    static func decodeDataUrl(_ value: String) -> Data? {
        guard let comma = value.firstIndex(of: ",") else { return nil }
        let header = value[..<comma].lowercased()
        let payload = String(value[value.index(after: comma)...])
        if header.contains(";base64") {
            return Data(base64Encoded: payload, options: .ignoreUnknownCharacters)
        }
        return payload.removingPercentEncoding.map { Data($0.utf8) }
    }

    private static func isUploadPath(_ path: String) -> Bool {
        let lower = path.lowercased()
        if lower.hasPrefix("/uploads/") || lower.hasPrefix("/api/uploads/") { return true }
        let first = lower.split(separator: "/").first.map { String($0) } ?? ""
        return uploadFolders.contains(first)
    }

    /// El token solo viaja a nuestro propio origen.
    private static func isOwnOrigin(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased(),
              let own = URL(string: ApiUrls.assetOrigin)?.host?.lowercased() else { return false }
        return host == own
    }

    private static func fetch(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        if isOwnOrigin(url) {
            if let token = SessionStore.shared.token {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            if let companyId = SessionStore.shared.currentUser?.companyId, companyId > 0 {
                request.setValue(String(companyId), forHTTPHeaderField: "X-Company-Id")
            }
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(status) else {
            throw ApiError.http(status, nil)
        }
        return data
    }
}

/// Imagen de `/uploads` con la sesión del usuario.
struct AuthenticatedImage: View {
    let url: String?
    var contentMode: ContentMode = .fill
    var background: Color = Color(.secondarySystemBackground)

    @State private var image: UIImage?
    @State private var failed = false
    /// El servidor respondió 404: el archivo ya no existe.
    @State private var missing = false

    var body: some View {
        ZStack {
            background
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else if missing {
                VStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.title3)
                    Text("Archivo no disponible")
                        .font(.caption2.weight(.semibold))
                        .multilineTextAlignment(.center)
                }
                .foregroundStyle(.secondary)
                .padding(6)
            } else if failed {
                Image(systemName: "photo")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
        .clipped()
        .task(id: url) { await load() }
    }

    @MainActor
    private func load() async {
        image = nil
        failed = false
        missing = false
        guard let url, !url.isEmpty else {
            missing = true
            return
        }
        do {
            let data = try await AuthenticatedAssetLoader.shared.data(for: url)
            if let decoded = UIImage(data: data) {
                image = decoded
            } else {
                failed = true
            }
        } catch let ApiError.http(code, _) where code == 404 || code == 410 {
            missing = true
        } catch {
            if !Task.isCancelled { failed = true }
        }
    }
}

/// PDF protegido: se descarga con la sesión y se muestra con PDFKit.
struct AuthenticatedPDFScreen: View {
    let title: String
    let url: String

    @State private var data: Data?
    @State private var error: String?

    var body: some View {
        Group {
            if let data {
                PDFViewerScreen(title: title, data: data)
            } else if let error {
                ContentUnavailableView(
                    "No se pudo abrir el PDF",
                    systemImage: "doc.richtext",
                    description: Text(error)
                )
                .navigationTitle(title)
            } else {
                ProgressView("Cargando PDF…")
                    .navigationTitle(title)
            }
        }
        .task(id: url) { await load() }
    }

    @MainActor
    private func load() async {
        error = nil
        do {
            let downloaded = try await AuthenticatedAssetLoader.shared.data(for: url)
            if downloaded.isEmpty {
                error = "El archivo está vacío."
            } else {
                data = downloaded
            }
        } catch let ApiError.http(code, _) where code == 404 || code == 410 {
            self.error = "Archivo no disponible: el PDF ya no está en el servidor."
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo descargar el PDF")
        }
    }
}
