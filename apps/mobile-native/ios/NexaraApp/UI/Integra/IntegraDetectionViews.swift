import SwiftUI

struct IntegraDetectionCamera: Identifiable, Hashable {
    let id: String
    var name: String
    var region: String?
    var profileEnabled: Bool
    var sensitivity: Int?
    /// Zone polygon vertices — display only; never edit on device.
    var polygonPoints: [CGPoint]
}

struct IntegraCapabilityRow: Identifiable, Hashable {
    let id: String
    var label: String
    var stateLabel: String
    var supported: Bool
}

enum IntegraDetectionDataStub {
    static func cameras() async throws -> [IntegraDetectionCamera] {
        let cams = try await IntegraDetectionRepository.shared.cameras()
        return cams.map {
            IntegraDetectionCamera(
                id: $0.id,
                name: $0.name,
                region: $0.region,
                profileEnabled: false,
                sensitivity: nil,
                polygonPoints: []
            )
        }
    }

    static func capabilities() async throws -> [IntegraCapabilityRow] {
        let rows = try await IntegraDetectionRepository.shared.siteCapabilities()
        return rows.map { row in
            let fd = row.capabilities.flags.first { $0.key.lowercased().contains("field") }
            let state = fd?.state ?? .unverified
            let label: String = {
                switch state {
                case .supported: return "Soportado"
                case .unsupported: return "No"
                case .unverified: return "Sin sondear"
                }
            }()
            return IntegraCapabilityRow(
                id: row.cameraId,
                label: row.cameraId,
                stateLabel: label,
                supported: state == .supported
            )
        }
    }

    static func saveProfile(cameraId: String, enabled: Bool, sensitivity: Double, confidence: Double) async throws {
        let conf: String = {
            switch confidence {
            case ..<25: return "low"
            case ..<50: return "mediumLow"
            case ..<75: return "mediumHigh"
            default: return "high"
            }
        }()
        let draft = DetectionDraft(
            enabled: enabled,
            sensitivity: Int(sensitivity),
            alarmConfidence: conf,
            detectionTarget: "human",
            window: defaultDetectionWindow
        )
        _ = try await IntegraDetectionRepository.shared.saveProfile(cameraId: cameraId, draft: draft)
    }

    static func applyToDevice(cameraId: String) async throws {
        _ = try await IntegraDetectionRepository.shared.apply(cameraId: cameraId)
    }
}

// MARK: - Cameras list

struct IntegraDetectionCamerasView: View {
    var onOpenCamera: (String) -> Void = { _ in }
    var onOpenCapabilities: () -> Void = {}

    @State private var items: [IntegraDetectionCamera] = []
    @State private var isLoading = true
    @State private var errorText: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando detección…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, items.isEmpty {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else {
                List {
                    Section {
                        Text(
                            "Sensibilidad, confianza, objetivo y horario se editan de verdad. "
                                + "Los polígonos de zona se ven pero NO se editan en el teléfono "
                                + "(solo lectura → consola web)."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        Button("Capacidades del parque", action: onOpenCapabilities)
                    }
                    if items.isEmpty {
                        NxEmptyState(
                            title: "Sin cámaras de detección",
                            subtitle: "No hay perfiles de detección en el espejo de este sitio."
                        )
                    } else {
                        ForEach(items) { cam in
                            Button { onOpenCamera(cam.id) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(cam.name).font(.headline)
                                        Text(cam.region ?? "Sin zona")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    NxStatusChip(
                                        text: cam.profileEnabled ? "Activo" : "Apagado",
                                        tone: cam.profileEnabled ? .success : .neutral
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Detección")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do { items = try await IntegraDetectionDataStub.cameras() }
        catch { errorText = error.localizedDescription }
    }
}

// MARK: - Tuning (polygons READ-ONLY)

struct IntegraDetectionTuningView: View {
    let cameraId: String

    @State private var camera: IntegraDetectionCamera?
    @State private var enabled = false
    @State private var sensitivity: Double = 50
    @State private var confidence: Double = 50
    @State private var isLoading = true
    @State private var saving = false
    @State private var applying = false
    @State private var message: String?
    @State private var errorText: String?
    @State private var confirmApply = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Sintonizando…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, camera == nil {
                Text(errorText).foregroundStyle(.secondary).padding()
            } else {
                Form {
                    Section {
                        Toggle("Perfil activo", isOn: $enabled)
                        VStack(alignment: .leading) {
                            Text("Sensibilidad \(Int(sensitivity))")
                            Slider(value: $sensitivity, in: 0...100, step: 1)
                        }
                        VStack(alignment: .leading) {
                            Text("Confianza \(Int(confidence))")
                            Slider(value: $confidence, in: 0...100, step: 1)
                        }
                    }
                    Section("Zona (solo lectura)") {
                        Text(
                            "Los polígonos se muestran para contexto. Editar vértices con el "
                                + "dedo escribiría zonas imprecisas en el equipo del cliente; "
                                + "eso se hace en la consola web."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        DetectionRegionPreview(points: camera?.polygonPoints ?? [])
                            .frame(height: 160)
                            .allowsHitTesting(false)
                    }
                    if let message {
                        Section { Text(message).foregroundStyle(NxTone.success.fg) }
                    }
                    Section {
                        Button(saving ? "Guardando…" : "Guardar en base") {
                            Task { await save() }
                        }
                        .disabled(saving)
                        Button(applying ? "Aplicando…" : "Aplicar al equipo") {
                            confirmApply = true
                        }
                        .disabled(applying)
                    } footer: {
                        Text("Guardar cambia la fila de la base; Aplicar escribe en la cámara. Son dos pasos distintos.")
                    }
                }
            }
        }
        .navigationTitle(camera?.name ?? "Sintonizar cámara")
        .task { await load() }
        .confirmationDialog(
            "¿Aplicar perfil al equipo?",
            isPresented: $confirmApply,
            titleVisibility: .visible
        ) {
            Button("Aplicar al equipo", role: .destructive) {
                Task { await apply() }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Esto escribe la sintonización en la cámara física, no solo en la base de datos.")
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let cams = try await IntegraDetectionDataStub.cameras()
            camera = cams.first { $0.id == cameraId }
            enabled = camera?.profileEnabled ?? false
            sensitivity = Double(camera?.sensitivity ?? 50)
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await IntegraDetectionDataStub.saveProfile(
                cameraId: cameraId, enabled: enabled,
                sensitivity: sensitivity, confidence: confidence
            )
            message = "Guardado en base (aún no aplicado al equipo)."
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func apply() async {
        applying = true
        defer { applying = false }
        do {
            try await IntegraDetectionDataStub.applyToDevice(cameraId: cameraId)
            message = "Perfil aplicado al equipo."
        } catch {
            errorText = error.localizedDescription
        }
    }
}

/// Read-only polygon overlay. No drag handles, no vertex insert/delete.
struct DetectionRegionPreview: View {
    let points: [CGPoint]

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color(red: 0.06, green: 0.09, blue: 0.16)
                if points.count >= 3 {
                    Path { path in
                        let mapped = points.map {
                            CGPoint(x: $0.x * geo.size.width, y: $0.y * geo.size.height)
                        }
                        path.move(to: mapped[0])
                        for p in mapped.dropFirst() { path.addLine(to: p) }
                        path.closeSubpath()
                    }
                    .stroke(Color.teal, lineWidth: 2)
                    .background(
                        Path { path in
                            let mapped = points.map {
                                CGPoint(x: $0.x * geo.size.width, y: $0.y * geo.size.height)
                            }
                            path.move(to: mapped[0])
                            for p in mapped.dropFirst() { path.addLine(to: p) }
                            path.closeSubpath()
                        }
                        .fill(Color.teal.opacity(0.2))
                    )
                } else {
                    Text("Sin polígono de zona")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.7))
                }
                Text("SOLO LECTURA")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.black.opacity(0.55))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(6)
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}

// MARK: - Capabilities

struct IntegraDetectionCapabilitiesView: View {
    @State private var rows: [IntegraCapabilityRow] = []
    @State private var isLoading = true
    @State private var errorText: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Sondeando capacidades…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, rows.isEmpty {
                Text(errorText).foregroundStyle(.secondary).padding()
            } else if rows.isEmpty {
                NxEmptyState(
                    title: "Sin capacidades",
                    subtitle: "El sondeo no devolvió filas para este parque."
                )
            } else {
                List(rows) { row in
                    HStack {
                        Text(row.label)
                        Spacer()
                        NxStatusChip(
                            text: row.stateLabel,
                            tone: row.supported ? .success : .neutral
                        )
                    }
                }
            }
        }
        .navigationTitle("Capacidades del parque")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do { rows = try await IntegraDetectionDataStub.capabilities() }
        catch { errorText = error.localizedDescription }
    }
}
