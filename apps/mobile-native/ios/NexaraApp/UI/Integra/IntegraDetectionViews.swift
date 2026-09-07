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

private func confidenceIndex(_ key: String, options: [String]) -> Double {
    guard let i = options.firstIndex(of: key) else { return Double(options.count / 2) }
    return Double(i)
}

private func confidenceKey(_ index: Double, options: [String]) -> String {
    guard !options.isEmpty else { return "mediumHigh" }
    let i = Int(index.rounded()).clamped(to: 0...(options.count - 1))
    return options[i]
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
        do {
            let cams = try await IntegraDetectionRepository.shared.cameras()
            var rows: [IntegraDetectionCamera] = []
            for cam in cams {
                let profile = try? await IntegraDetectionRepository.shared.profile(cameraId: cam.id)
                rows.append(
                    IntegraDetectionCamera(
                        id: cam.id,
                        name: cam.name,
                        region: cam.region,
                        profileEnabled: profile?.enabled ?? false,
                        sensitivity: profile?.sensitivity,
                        polygonPoints: profile?.regionPolygons.first ?? []
                    )
                )
            }
            items = rows
        } catch {
            errorText = error.localizedDescription
        }
    }
}

// MARK: - Tuning (polygons READ-ONLY)

struct IntegraDetectionTuningView: View {
    let cameraId: String

    @State private var profile: DetectionProfile?
    @State private var enabled = false
    @State private var sensitivity: Double = 50
    @State private var confidenceIdx: Double = 2
    @State private var target = "human"
    @State private var windowStart = "00:00"
    @State private var windowEnd = "23:59"
    @State private var windowDays: Set<Int> = [0, 1, 2, 3, 4, 5, 6]
    @State private var polygonPoints: [CGPoint] = []
    @State private var confidenceOptions: [String] = DetectionDefaults.confidenceOrder
    @State private var targetOptions: [String] = DetectionDefaults.targetOrder
    @State private var sensMin: Double = 0
    @State private var sensMax: Double = 100
    @State private var isLoading = true
    @State private var saving = false
    @State private var applying = false
    @State private var message: String?
    @State private var errorText: String?
    @State private var confirmApply = false

    private let dayLabels = ["D", "L", "M", "X", "J", "V", "S"]

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Sintonizando…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, profile == nil {
                Text(errorText).foregroundStyle(.secondary).padding()
            } else {
                Form {
                    Section {
                        Toggle("Perfil activo", isOn: $enabled)
                        VStack(alignment: .leading) {
                            Text("Sensibilidad \(Int(sensitivity))")
                            Slider(value: $sensitivity, in: sensMin...sensMax, step: 1)
                        }
                        VStack(alignment: .leading) {
                            let key = confidenceKey(confidenceIdx, options: confidenceOptions)
                            Text("Confianza: \(key)")
                            Slider(
                                value: $confidenceIdx,
                                in: 0...Double(max(confidenceOptions.count - 1, 0)),
                                step: 1
                            )
                            .disabled(confidenceOptions.count <= 1)
                        }
                        Picker("Objetivo", selection: $target) {
                            ForEach(targetOptions, id: \.self) { Text(targetLabel($0)).tag($0) }
                        }
                    }
                    Section("Horario de detección (sitio)") {
                        TextField("Inicio HH:MM", text: $windowStart)
                            .textInputAutocapitalization(.never)
                        TextField("Fin HH:MM", text: $windowEnd)
                            .textInputAutocapitalization(.never)
                        HStack {
                            ForEach(0..<7, id: \.self) { d in
                                Button(dayLabels[d]) {
                                    if windowDays.contains(d) { windowDays.remove(d) }
                                    else { windowDays.insert(d) }
                                }
                                .buttonStyle(.bordered)
                                .tint(windowDays.contains(d) ? .teal : .gray)
                            }
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
                        DetectionRegionPreview(points: polygonPoints)
                            .frame(height: 160)
                            .allowsHitTesting(false)
                    }
                    if let message {
                        Section { Text(message).foregroundStyle(NxTone.success.fg) }
                    }
                    if let errorText {
                        Section { Text(errorText).foregroundStyle(NxTone.danger.fg) }
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
        .navigationTitle(profile?.cameraName ?? "Sintonizar cámara")
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

    private func targetLabel(_ t: String) -> String {
        switch t {
        case "human": return "Persona"
        case "vehicle": return "Vehículo"
        case "human,vehicle": return "Persona y vehículo"
        default: return t
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let p = try await IntegraDetectionRepository.shared.profile(cameraId: cameraId)
            profile = p
            enabled = p.enabled
            sensitivity = Double(p.sensitivity)
            sensMin = Double(p.limits.sensitivityMin)
            sensMax = Double(p.limits.sensitivityMax)
            confidenceOptions = p.limits.alarmConfidences.isEmpty
                ? DetectionDefaults.confidenceOrder
                : p.limits.alarmConfidences
            targetOptions = p.limits.detectionTargets.isEmpty
                ? DetectionDefaults.targetOrder
                : p.limits.detectionTargets
            confidenceIdx = confidenceIndex(p.alarmConfidence, options: confidenceOptions)
            target = p.detectionTarget
            let w = p.window ?? defaultDetectionWindow
            windowStart = w.start
            windowEnd = w.end
            windowDays = Set(w.days)
            polygonPoints = p.regionPolygons.first ?? []
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let draft = DetectionDraft(
            enabled: enabled,
            sensitivity: Int(sensitivity),
            alarmConfidence: confidenceKey(confidenceIdx, options: confidenceOptions),
            detectionTarget: target,
            window: DetectionWindow(
                start: windowStart,
                end: windowEnd,
                days: windowDays.sorted()
            )
        )
        do {
            let saved = try await IntegraDetectionRepository.shared.saveProfile(
                cameraId: cameraId,
                draft: draft
            )
            profile = saved
            message = "Guardado en base (aún no aplicado al equipo)."
            errorText = nil
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func apply() async {
        applying = true
        defer { applying = false }
        do {
            let outcome = try await IntegraDetectionRepository.shared.apply(cameraId: cameraId)
            message = outcome.note.isEmpty
                ? (outcome.applied ? "Perfil aplicado al equipo." : "El servidor no confirmó la aplicación.")
                : outcome.note
            errorText = nil
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
                    Text("Sin polígono de zona (fotograma completo)")
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
    @State private var probing = false
    @State private var probeNote: String?

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
                List {
                    if let probeNote {
                        Section { Text(probeNote).font(.caption).foregroundStyle(.secondary) }
                    }
                    Section {
                        Button(probing ? "Sondeando sitio…" : "Sondear parque completo") {
                            Task { await probeSite() }
                        }
                        .disabled(probing)
                    }
                    ForEach(rows) { row in
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
        }
        .navigationTitle("Capacidades del parque")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let caps = try await IntegraDetectionRepository.shared.siteCapabilities()
            rows = caps.map { row in
                let fd = row.capabilities.flags.first {
                    $0.key.lowercased().contains("field") || $0.key == "fieldDetection"
                }
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
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func probeSite() async {
        probing = true
        defer { probing = false }
        do {
            let outcome = try await IntegraDetectionRepository.shared.probeSite()
            probeNote = "Sondeo: \(outcome.ok)/\(outcome.total) OK"
            await reload()
        } catch {
            errorText = error.localizedDescription
        }
    }
}

private extension Int {
    func clamped(to range: ClosedRange<Int>) -> Int {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
