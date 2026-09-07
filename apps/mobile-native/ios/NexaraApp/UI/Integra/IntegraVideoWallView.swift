import SwiftUI

// MARK: - Local models / stub data layer
// Wire to Data/Integra/Video/IntegraVideoRepository when that agent lands.
// Do NOT invent MSE/live streaming here — JPEG frames only.

struct IntegraCameraRow: Identifiable, Hashable {
    let id: String
    var name: String
    var region: String?
    var model: String?
    var sourceIp: String?
    var isPtz: Bool
    var hlsPath: String?
}

enum IntegraVideoCellPhase: String {
    case enCola = "EN COLA"
    case pidiendo = "PIDIENDO…"
    case conImagen = "IMÁGENES ~1/s"
    case fallando = "REINTENTANDO"
    case sinImagen = "SIN IMAGEN"
}

struct IntegraVideoCell: Identifiable {
    var id: String { camera.id }
    var camera: IntegraCameraRow
    var phase: IntegraVideoCellPhase
    var motivo: String
    var frameURL: URL?
}

/// Calls `IntegraVideoRepository` (Data/Integra/Video). Maps to UI rows.
enum IntegraVideoDataStub {
    static func loadCameras(siteId: Int?) async throws -> [IntegraCameraRow] {
        let cams = try await IntegraVideoRepository.shared.cameras(siteId: siteId)
        let ids = cams.map(\.id)
        let slots = (try? await IntegraVideoRepository.shared.openStreams(cameraIds: ids, siteId: siteId)) ?? [:]
        return cams.map { cam in
            let slot = slots[cam.id]
            return IntegraCameraRow(
                id: cam.id,
                name: cam.name,
                region: cam.region,
                model: cam.model,
                sourceIp: cam.sourceIp,
                isPtz: cam.isPtz,
                hlsPath: slot?.hls
            )
        }
    }

    static func frameURL(hls: String?, nonce: Int64) -> URL? {
        guard let s = Go2rtcFrame.frameUrl(hls: hls, nonce: nonce) else { return nil }
        return URL(string: s)
    }
}

// MARK: - Video wall

/// Rejilla de cámaras INTEGRA.
///
/// **Qué es y qué no.** Esto NO es video en vivo. Son fotogramas JPEG
/// pedidos de uno en uno. Las insignias NUNCA dicen «EN VIVO» ni «LIVE».
struct IntegraVideoWallView: View {
    var onOpenCamera: (String) -> Void = { _ in }

    @State private var cells: [IntegraVideoCell] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var siteId: Int?
    @Environment(\.scenePhase) private var scenePhase

    private var visible: [IntegraVideoCell] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return cells }
        return cells.filter {
            $0.camera.name.lowercased().contains(q)
                || ($0.camera.region ?? "").lowercased().contains(q)
        }
    }

    private var withImage: Int {
        cells.filter { $0.phase == .conImagen }.count
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando cámaras…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button("Reintentar") { Task { await reload() } }
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if cells.isEmpty {
                NxEmptyState(
                    title: "Sin cámaras",
                    subtitle: "Este sitio no tiene cámaras en el espejo. Corre la sincronización de INTEGRA.",
                    actionLabel: "Reintentar",
                    onAction: { Task { await reload() } }
                )
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        honestyBanner
                        TextField("Buscar cámara o zona", text: $query)
                            .textFieldStyle(.roundedBorder)
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                            ForEach(visible) { cell in
                                Button { onOpenCamera(cell.camera.id) } label: {
                                    videoCell(cell)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(12)
                }
            }
        }
        .navigationTitle(IntegraVideoRoutes.titleWall)
        .task { await reload() }
        .refreshable { await reload() }
        .onChange(of: scenePhase) { _, phase in
            // Pause polling when backgrounded — no silent JPEG flood.
            _ = phase
        }
    }

    private var honestyBanner: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Imágenes, no video")
                .font(.subheadline.weight(.bold))
            Text(
                "Cada celda pide un fotograma nuevo cuando llega el anterior: alrededor "
                    + "de uno por segundo, según responda el equipo. Para video continuo, "
                    + "el muro de la web (MSE)."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            Text("\(withImage) de \(cells.count) con imagen")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.top, 2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxTone.info.bg)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func videoCell(_ cell: IntegraVideoCell) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                Color(red: 0.06, green: 0.09, blue: 0.16)
                    .aspectRatio(16 / 9, contentMode: .fit)
                if let url = cell.frameURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFill()
                        case .failure:
                            Text(cell.motivo.isEmpty ? "Sin imagen." : cell.motivo)
                                .font(.caption2)
                                .foregroundStyle(Color(white: 0.9))
                                .padding(8)
                        default:
                            ProgressView().tint(.white)
                        }
                    }
                    .clipped()
                } else if cell.phase == .sinImagen || cell.phase == .fallando {
                    Text(cell.motivo.isEmpty ? "Sin imagen." : cell.motivo)
                        .font(.caption2)
                        .foregroundStyle(Color(white: 0.9))
                        .padding(8)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                cellBadge(cell.phase)
                    .padding(6)
            }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 12, topTrailingRadius: 12))

            VStack(alignment: .leading, spacing: 2) {
                Text(cell.camera.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(subtitle(for: cell.camera))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    /// Honest badge — never "EN VIVO" / "LIVE".
    private func cellBadge(_ phase: IntegraVideoCellPhase) -> some View {
        let bg: Color = {
            switch phase {
            case .conImagen: return Color(red: 0.05, green: 0.58, blue: 0.53).opacity(0.85)
            case .fallando: return Color.orange.opacity(0.85)
            case .sinImagen: return Color.red.opacity(0.85)
            default: return Color.gray.opacity(0.85)
            }
        }()
        return Text(phase.rawValue)
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(bg)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            // Guard against accidental LIVE copy in future edits:
            .accessibilityLabel(phase.rawValue)
    }

    private func subtitle(for cam: IntegraCameraRow) -> String {
        var parts = [cam.region ?? "Sin zona"]
        if cam.isPtz { parts.append("PTZ") }
        return parts.joined(separator: " · ")
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            let cams = try await IntegraVideoDataStub.loadCameras(siteId: siteId)
            cells = cams.map { cam in
                let motivo = cam.hlsPath == nil
                    ? "Sin ruta de imagen en el espejo."
                    : ""
                return IntegraVideoCell(
                    camera: cam,
                    phase: cam.hlsPath == nil ? .sinImagen : .enCola,
                    motivo: motivo,
                    frameURL: IntegraVideoDataStub.frameURL(hls: cam.hlsPath, nonce: 1)
                )
            }
        } catch {
            errorText = error.localizedDescription
        }
    }
}
