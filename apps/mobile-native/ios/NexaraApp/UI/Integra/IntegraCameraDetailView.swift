import SwiftUI

struct IntegraPtzPresetRow: Identifiable, Hashable {
    let id: Int
    var name: String
}

/// Detalle de cámara: preview JPEG, PTZ presets, captura.
/// Labels honestos: preview / refresh — nunca «EN VIVO» / «LIVE».
struct IntegraCameraDetailView: View {
    let cameraId: String

    @State private var camera: IntegraCameraRow?
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var hasImage = false
    @State private var motivo = ""
    @State private var frameURL: URL?
    @State private var nonce: Int64 = 1
    @State private var presets: [IntegraPtzPresetRow] = []
    @State private var presetsLoaded = false
    @State private var moving = false
    @State private var capturing = false
    @State private var message: String?
    @State private var actionError: String?
    @State private var rtsp: String?
    @State private var hls: String?
    @State private var fallos: Int = 0
    @State private var pacingTask: Task<Void, Never>?
    @State private var paused = false
    @Environment(\.scenePhase) private var scenePhase

    private var showsPtz: Bool { camera?.isPtz == true }

    private var resolvedFrameURL: URL? {
        guard motivo.isEmpty,
              let s = Go2rtcFrame.frameUrl(hls: hls, nonce: nonce) else { return nil }
        return URL(string: s)
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Abriendo cámara…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await load() } }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        previewBox
                        metaBlock
                        if let message {
                            Text(message).font(.caption).foregroundStyle(NxTone.success.fg)
                        }
                        if let actionError {
                            Text(actionError).font(.caption).foregroundStyle(NxTone.danger.fg)
                        }
                        actionRow
                        if showsPtz {
                            NxSectionHeader(title: "Control PTZ", subtitle: "Cada toque mueve medio segundo")
                            ptzPad
                            presetsBlock
                        } else {
                            Text("Esta cámara no está marcada como PTZ en el inventario, así que no se ofrece control de movimiento.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        techBlock
                    }
                    .padding(12)
                }
            }
        }
        .navigationTitle(camera?.name ?? IntegraVideoRoutes.titleDetail)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await refreshFrame() }
        .onChange(of: scenePhase) { _, phase in
            paused = phase != .active
            if phase == .active { schedulePace(immediate: true) }
            else { pacingTask?.cancel() }
        }
        .onDisappear { pacingTask?.cancel() }
    }

    private var previewBox: some View {
        ZStack(alignment: .topLeading) {
            Color(red: 0.06, green: 0.09, blue: 0.16)
                .aspectRatio(16 / 9, contentMode: .fit)
            if let resolvedFrameURL {
                AsyncImage(url: resolvedFrameURL) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFit()
                            .onAppear { onFrameOk() }
                    case .failure:
                        Text(motivo.isEmpty ? "Sin respuesta del equipo. Reintentando." : motivo)
                            .font(.caption)
                            .foregroundStyle(Color(white: 0.9))
                            .padding()
                            .onAppear { onFrameFail() }
                    default:
                        ProgressView().tint(.white)
                    }
                }
                .id(nonce)
            } else {
                Text(motivo.isEmpty ? "Sin imagen." : motivo)
                    .font(.caption)
                    .foregroundStyle(Color(white: 0.9))
                    .padding()
            }
            Text(hasImage ? "IMÁGENES ~1/s" : "SIN IMAGEN")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(hasImage
                    ? Color(red: 0.05, green: 0.58, blue: 0.53).opacity(0.85)
                    : Color.red.opacity(0.85))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .padding(8)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var metaBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(camera?.name ?? cameraId)
                .font(.title3.weight(.semibold))
            Text(metaLine)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(
                "Esta pantalla muestra fotogramas sueltos (preview / refresh), no video continuo. "
                    + "El video en vivo (MSE) sigue estando solo en el muro de la web."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.top, 2)
            Button("Actualizar preview") {
                Task { await refreshFrame() }
            }
            .font(.caption.weight(.semibold))
        }
    }

    private var metaLine: String {
        var parts: [String] = [camera?.region ?? "Sin zona"]
        if let model = camera?.model { parts.append(model) }
        if let ip = camera?.sourceIp { parts.append(ip) }
        return parts.joined(separator: " · ")
    }

    private var actionRow: some View {
        HStack(spacing: 8) {
            Button(capturing ? "Capturando…" : "Captura") {
                Task { await capture() }
            }
            .buttonStyle(.borderedProminent)
            .tint(.teal)
            .disabled(capturing)
            if showsPtz {
                Button("Detener domo") {
                    Task { await ptzStop() }
                }
                .buttonStyle(.bordered)
                .disabled(moving)
            }
        }
    }

    private var ptzPad: some View {
        let step = 60
        return VStack(spacing: 8) {
            ptzButton("arrow.up", "Arriba") { Task { await ptzMove(pan: 0, tilt: step, zoom: 0) } }
            HStack(spacing: 24) {
                ptzButton("arrow.left", "Izquierda") { Task { await ptzMove(pan: -step, tilt: 0, zoom: 0) } }
                ptzButton("arrow.right", "Derecha") { Task { await ptzMove(pan: step, tilt: 0, zoom: 0) } }
            }
            ptzButton("arrow.down", "Abajo") { Task { await ptzMove(pan: 0, tilt: -step, zoom: 0) } }
            HStack {
                Button("Zoom +") { Task { await ptzMove(pan: 0, tilt: 0, zoom: step) } }
                    .buttonStyle(.bordered).disabled(moving)
                Button("Zoom −") { Task { await ptzMove(pan: 0, tilt: 0, zoom: -step) } }
                    .buttonStyle(.bordered).disabled(moving)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func ptzButton(_ system: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .frame(width: 56, height: 56)
        }
        .buttonStyle(.bordered)
        .disabled(moving)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private var presetsBlock: some View {
        if presets.isEmpty {
            Text(
                presetsLoaded
                    ? "Esta cámara no declara posiciones memorizadas, o el sitio no es ISAPI (los presets solo existen ahí)."
                    : "Consultando presets…"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        } else {
            FlowLayout(spacing: 6) {
                ForEach(presets) { p in
                    Button(p.name) {
                        Task { await goPreset(p) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(moving)
                }
            }
        }
    }

    @ViewBuilder
    private var techBlock: some View {
        if rtsp != nil || hls != nil {
            VStack(alignment: .leading, spacing: 4) {
                Text("Datos técnicos").font(.caption.weight(.semibold))
                if let hls { Text("HLS: \(hls)").font(.caption2).foregroundStyle(.secondary) }
                if let rtsp {
                    Text("RTSP: \(rtsp)").font(.caption2).foregroundStyle(.secondary)
                    Text("La app no reproduce RTSP; este dato es para diagnóstico.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.tertiarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func load() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        guard !cameraId.isEmpty else {
            errorText = "Cámara sin identificador"
            return
        }
        do {
            // IntegraVideoRepository — cameras(), openStream(id), ptzPresets(id)
            let cams = try await IntegraVideoRepository.shared.cameras()
            let cam = cams.first { $0.id == cameraId }
            camera = cam.map {
                IntegraCameraRow(
                    id: $0.id, name: $0.name, region: $0.region,
                    model: $0.model, sourceIp: $0.sourceIp, isPtz: $0.isPtz, hlsPath: nil
                )
            }
            let slot = try await IntegraVideoRepository.shared.openStream(cameraId: cameraId)
            hls = slot.hls
            rtsp = slot.rtsp
            motivo = motivoSinImagen(slot)
            frameURL = resolvedFrameURL
            if cam?.isPtz == true {
                await loadPresets()
            } else {
                presetsLoaded = true
            }
            if motivo.isEmpty {
                schedulePace(immediate: true)
            }
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func loadPresets() async {
        let list = (try? await IntegraVideoRepository.shared.ptzPresets(cameraId: cameraId)) ?? []
        presets = list.map { IntegraPtzPresetRow(id: $0.id, name: $0.name) }
        presetsLoaded = true
    }

    private func refreshFrame() async {
        nonce += 1
        frameURL = resolvedFrameURL
        message = "Preview actualizado"
    }

    private func schedulePace(immediate: Bool) {
        pacingTask?.cancel()
        guard !paused, motivo.isEmpty || fallos > 0, hls != nil else { return }
        let failures = fallos
        pacingTask = Task {
            if !immediate {
                let ms = FramePacing.nextDelayMs(consecutiveFailures: failures)
                try? await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000)
            }
            guard !Task.isCancelled, !paused else { return }
            await MainActor.run {
                nonce += 1
                frameURL = resolvedFrameURL
            }
        }
    }

    private func onFrameOk() {
        hasImage = true
        fallos = 0
        if motivo.lowercased().contains("sin respuesta") { motivo = "" }
        schedulePace(immediate: false)
    }

    private func onFrameFail() {
        fallos += 1
        hasImage = false
        if fallos >= 3 {
            let sec = FramePacing.nextDelayMs(consecutiveFailures: fallos) / 1000
            motivo = "Sin respuesta del equipo. Reintentando cada \(sec) s."
        }
        schedulePace(immediate: false)
    }

    private func capture() async {
        capturing = true
        actionError = nil
        defer { capturing = false }
        do {
            let res = try await IntegraVideoRepository.shared.capture(cameraId: cameraId)
            message = res.picUrl != nil
                ? "Captura solicitada. El equipo la guardó en su almacenamiento (no en la galería del teléfono)."
                : "Captura solicitada al equipo."
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func ptzMove(pan: Int, tilt: Int, zoom: Int) async {
        moving = true
        actionError = nil
        defer { moving = false }
        do {
            try await IntegraVideoRepository.shared.ptzMove(
                cameraId: cameraId, pan: pan, tilt: tilt, zoom: zoom
            )
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func goPreset(_ preset: IntegraPtzPresetRow) async {
        moving = true
        actionError = nil
        defer { moving = false }
        do {
            try await IntegraVideoRepository.shared.ptzGoToPreset(cameraId: cameraId, preset: preset.id)
            message = "Moviendo a «\(preset.name)»"
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func ptzStop() async {
        do {
            try await IntegraVideoRepository.shared.ptzStop(cameraId: cameraId)
            message = "Domo detenida"
        } catch {
            actionError = error.localizedDescription
        }
    }
}

/// Minimal wrapping layout for preset chips (avoids extra dependencies).
private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0
        var height: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > maxW, x > 0 {
                x = 0
                y += rowH + spacing
                rowH = 0
            }
            rowH = max(rowH, size.height)
            x += size.width + spacing
            height = y + rowH
        }
        return CGSize(width: maxW.isFinite ? maxW : x, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowH + spacing
                rowH = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
    }
}
