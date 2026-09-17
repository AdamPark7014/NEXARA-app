import SwiftUI
import PhotosUI
import UIKit

/// Textos y colores de la geocerca, iguales en la captura del ejecutor y en las
/// evidencias del equipo.
enum ActivityGeofenceUI {
    static func alertStatus(_ alert: ActivityGeofenceAlert) -> (label: String, icon: String, color: Color) {
        if alert.isJustified { return ("Justificada", "checkmark.seal", CorePalette.green) }
        return ("Sin justificar", "exclamationmark.bubble", CorePalette.orange)
    }

    /// Estado de la zona según la última lectura.
    static func zoneStatus(_ state: ActivityGeofenceState) -> (label: String, icon: String, color: Color) {
        if !state.seguimientoActivo { return ("Seguimiento terminado", "flag.checkered", CorePalette.slate) }
        if state.origen == nil { return ("Sin punto de inicio", "location.slash", CorePalette.slate) }
        switch state.dentro {
        case .some(true): return ("Dentro de la zona", "checkmark.circle", CorePalette.green)
        case .some(false): return ("Fuera de la zona", "location.slash", CorePalette.red)
        case .none: return ("Sin lecturas todavía", "location", CorePalette.slate)
        }
    }

    static func distance(_ meters: Int?) -> String {
        guard let meters else { return "sin distancia" }
        return "\(meters) m"
    }
}

// MARK: - Fila de una salida de zona

/// Una salida de zona: distancias, horas, estado, justificación y foto.
struct ActivityGeofenceAlertRow: View {
    let alert: ActivityGeofenceAlert
    /// «Saliste…» para quien ejecuta; «Salió…» en las evidencias del equipo.
    var firstPerson: Bool = true
    var photoTitle: String = "Justificación de salida de zona"
    var onPhoto: ((CorePhotoItem) -> Void)? = nil
    /// Solo quien salió puede justificar.
    var onJustify: (() -> Void)? = nil

    private var tone: Color { alert.abierta ? CorePalette.red : (alert.isJustified ? CorePalette.green : CorePalette.orange) }

    var body: some View {
        let status = ActivityGeofenceUI.alertStatus(alert)
        HStack(alignment: .top, spacing: 10) {
            NxIconBadge(systemName: "location.slash", tint: tone, size: 32, circle: true)
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(firstPerson ? "Saliste" : "Salió") a \(alert.distanciaM) m del inicio")
                        .font(.subheadline.weight(.semibold))
                    Spacer(minLength: 4)
                    CoreChip(icon: status.icon, text: status.label, color: status.color)
                }
                Text("Máximo \(alert.maxDistanciaM) m · zona de \(alert.radioM) m")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                times
                if alert.hasJustificationText {
                    justification
                }
                if let url = alert.fotoUrl, !url.isEmpty {
                    Button {
                        onPhoto?(CorePhotoItem(title: photoTitle, url: url, time: alert.justificadaAt))
                    } label: {
                        AuthenticatedImage(url: url)
                            .frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .disabled(onPhoto == nil)
                    .accessibilityLabel("Ver foto de la justificación")
                }
                if let mapUrl = CoreMaps.url(latitude: alert.latitude, longitude: alert.longitude, label: "Salida de zona") {
                    Link(destination: mapUrl) {
                        Label("Dónde se detectó", systemImage: "mappin.and.ellipse")
                    }
                    .font(.caption.weight(.semibold))
                }
                if let onJustify, !alert.isJustified {
                    Button(action: onJustify) {
                        Label("Justificar", systemImage: "square.and.pencil")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(CorePalette.orange)
                    .font(.subheadline)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tone.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }

    private var times: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let detected = CoreFormat.when(alert.detectedAt) {
                NxIconText(systemName: "clock", text: "Detectada \(detected)")
            }
            if alert.abierta {
                NxIconText(
                    systemName: "exclamationmark.triangle",
                    text: firstPerson ? "Sigues fuera de la zona" : "Sigue fuera de la zona",
                    tint: CorePalette.red
                )
            } else if let back = CoreFormat.when(alert.returnedAt) {
                NxIconText(systemName: "arrow.uturn.backward", text: "\(firstPerson ? "Regresaste" : "Regresó") \(back)")
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private var justification: some View {
        VStack(alignment: .leading, spacing: 2) {
            NxIconText(systemName: "text.bubble", text: "«\(alert.justificacion ?? "")»")
                .font(.footnote)
            if let when = CoreFormat.when(alert.justificadaAt) {
                Text("Justificada \(when)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Tarjeta del ejecutor

/// «Ubicación de la actividad»: punto de inicio, radio, última distancia,
/// dentro/fuera, recorrido reciente y salidas de zona con «Justificar».
/// Se actualiza sola cada minuto mientras el seguimiento está activo.
struct ActivityGeofenceCard: View {
    let activityId: Int
    var refreshToken: Int = 0

    @ObservedObject private var tracker = ShiftGpsTracker.shared
    @State private var state: ActivityGeofenceState?
    @State private var loading = false
    @State private var error: String?
    @State private var notice: String?
    @State private var showsAllPoints = false
    @State private var justifying: ActivityGeofenceAlert?
    @State private var photo: CorePhotoItem?

    private static let visiblePoints = 5
    private static let refreshSeconds: UInt64 = 60

    private var highlight: Color? {
        guard let state else { return nil }
        if state.seguimientoActivo && state.dentro == false { return CorePalette.red }
        if !state.pendingAlerts.isEmpty { return CorePalette.orange }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if let state {
                content(state)
            } else if loading {
                ProgressView("Cargando ubicación…")
                    .frame(maxWidth: .infinity)
            }
            if let error {
                VStack(alignment: .leading, spacing: 4) {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(CorePalette.red)
                    if state == nil {
                        Button("Reintentar") { Task { await load() } }
                            .font(.caption.weight(.semibold))
                    }
                }
            }
        }
        .coreCard(highlight: highlight)
        .task(id: refreshToken) {
            await load()
            while !Task.isCancelled, state?.seguimientoActivo == true {
                try? await Task.sleep(nanoseconds: ActivityGeofenceCard.refreshSeconds * 1_000_000_000)
                if Task.isCancelled { break }
                await load()
            }
        }
        .sheet(item: $justifying) { alert in
            ActivityGeofenceJustifySheet(activityId: activityId, alert: alert) { _, message in
                notice = message
                Task { await load() }
            }
        }
        .fullScreenCover(item: $photo) { item in
            CorePhotoViewer(item: item)
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            NxIconBadge(systemName: "location.circle", tint: NxBrand.primary, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text("Ubicación de la actividad").font(.subheadline.weight(.bold))
                Text("Zona de \(state?.radioM ?? ActivityGeofence.radioM) m alrededor de tu foto de entrada")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            Button {
                Task { await load() }
            } label: {
                if loading && state != nil {
                    ProgressView()
                } else {
                    Image(systemName: "arrow.clockwise")
                }
            }
            .buttonStyle(.borderless)
            .disabled(loading)
            .accessibilityLabel("Actualizar ubicación")
        }
    }

    @ViewBuilder
    private func content(_ state: ActivityGeofenceState) -> some View {
        let zone = ActivityGeofenceUI.zoneStatus(state)
        let pending = state.pendingAlerts.count
        CoreFlowLayout {
            CoreChip(icon: zone.icon, text: zone.label, color: zone.color)
            if pending > 0 {
                CoreChip(
                    icon: "exclamationmark.bubble",
                    text: pending == 1 ? "1 salida por justificar" : "\(pending) salidas por justificar",
                    color: CorePalette.orange
                )
            }
        }

        if let notice {
            NxIconText(systemName: "checkmark.circle.fill", text: notice, tint: CorePalette.green)
                .font(.footnote.weight(.semibold))
        }

        VStack(alignment: .leading, spacing: 4) {
            if let origen = state.origen {
                NxIconText(systemName: "clock", text: "Inicio: \(CoreFormat.when(origen.at) ?? "sin hora")")
            }
            NxIconText(systemName: "scope", text: "Radio: \(state.radioM) m")
            if let ultimo = state.ultimo {
                let hora = CoreFormat.time(ultimo.at).map { " · \($0)" } ?? ""
                NxIconText(
                    systemName: "location",
                    text: "Última distancia: \(ActivityGeofenceUI.distance(ultimo.distanciaM))\(hora)",
                    tint: state.dentro == false ? CorePalette.red : nil
                )
            }
        }
        .font(.footnote)

        if let origen = state.origen,
           let mapUrl = CoreMaps.url(latitude: origen.latitude, longitude: origen.longitude, label: "Inicio de la actividad") {
            Link(destination: mapUrl) {
                Label("Ver punto de inicio en mapa", systemImage: "mappin.and.ellipse")
            }
            .font(.caption.weight(.semibold))
        }

        if state.origen == nil {
            Text("Tu foto de entrada no guardó ubicación: no hay punto contra el cual medir.")
                .font(.caption)
                .foregroundStyle(.secondary)
        } else if state.seguimientoActivo {
            Text("La foto de salida solo se acepta a \(state.radioM) m o menos de donde iniciaste. Si sales de la zona, justifica el motivo.")
                .font(.caption)
                .foregroundStyle(.secondary)
            if !tracker.isTracking {
                NxIconText(
                    systemName: "location.slash",
                    text: "Tu recorrido se mide con el GPS de tu jornada: marca tu entrada para que se registre.",
                    tint: CorePalette.orange
                )
                .font(.caption)
            }
        }

        if !state.alertas.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Salidas de zona").font(.caption.weight(.bold))
                ForEach(state.alertas) { alert in
                    ActivityGeofenceAlertRow(
                        alert: alert,
                        firstPerson: true,
                        onPhoto: { photo = $0 },
                        onJustify: { justifying = alert }
                    )
                }
            }
        }

        if state.origen != nil {
            trail(state)
        }
    }

    private func trail(_ state: ActivityGeofenceState) -> some View {
        let visible = showsAllPoints ? state.puntos : Array(state.puntos.prefix(ActivityGeofenceCard.visiblePoints))
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Seguimiento").font(.caption.weight(.bold))
                Spacer()
                if !state.puntos.isEmpty {
                    Text(state.puntos.count == 1 ? "1 lectura" : "\(state.puntos.count) lecturas")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            if state.puntos.isEmpty {
                Text("Todavía no hay lecturas de GPS desde que iniciaste.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(Array(visible.enumerated()), id: \.offset) { _, point in
                pointRow(point, radioM: state.radioM)
            }
            if state.puntos.count > ActivityGeofenceCard.visiblePoints {
                Button(showsAllPoints ? "Ver menos" : "Ver todo el recorrido (\(state.puntos.count))") {
                    showsAllPoints.toggle()
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.borderless)
            }
        }
    }

    private func pointRow(_ point: ActivityGeofencePoint, radioM: Int) -> some View {
        let inside = point.isInside(radioM: radioM)
        let icon = inside == nil ? "circle" : (inside == true ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
        let color: Color = inside == nil ? Color.secondary : (inside == true ? CorePalette.green : CorePalette.red)
        return HStack(spacing: 8) {
            Image(systemName: icon)
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(color)
                .accessibilityHidden(true)
            Text("\(CoreFormat.time(point.at) ?? "--:--") · \(ActivityGeofenceUI.distance(point.distanciaM))")
            Spacer(minLength: 4)
            if inside == false {
                Text("Fuera")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(CorePalette.red)
            }
        }
        .font(.caption)
    }

    @MainActor
    private func load() async {
        loading = true
        defer { loading = false }
        do {
            state = try await ActivityGeofenceRepository.shared.estado(activityId: activityId)
            error = nil
        } catch {
            if Task.isCancelled { return }
            if let core = error as? CoreError, case .queuedOffline = core { return }
            self.error = error.toUserMessage(fallback: "No se pudo cargar la ubicación de la actividad")
        }
    }
}

// MARK: - Hoja de justificación

/// Motivo (mínimo 5 caracteres) y foto opcional de cámara o galería.
struct ActivityGeofenceJustifySheet: View {
    let activityId: Int
    let alert: ActivityGeofenceAlert
    /// Alerta actualizada (`nil` si quedó en la cola sin conexión) y el aviso a mostrar.
    let onDone: (ActivityGeofenceAlert?, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var motivo = ""
    @State private var photo: CapturedGeoPhoto?
    @State private var showsCamera = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var loadingPhoto = false
    @State private var saving = false
    @State private var error: String?

    private static let minMotivo = 5

    private var trimmed: String { motivo.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var detail: String {
        var parts: [String] = []
        if let when = CoreFormat.when(alert.detectedAt) { parts.append("Detectada \(when)") }
        if alert.maxDistanciaM > alert.distanciaM { parts.append("máximo \(alert.maxDistanciaM) m") }
        parts.append(alert.abierta ? "sigues fuera" : "ya regresaste")
        return parts.joined(separator: " · ")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(alignment: .top, spacing: 10) {
                        NxIconBadge(systemName: "location.slash", tint: CorePalette.orange, size: 34, circle: true)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Saliste a \(alert.distanciaM) m del punto de inicio")
                                .font(.subheadline.weight(.semibold))
                            Text(detail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } footer: {
                    Text("Tus jefes y los responsables de la actividad reciben tu motivo.")
                }

                Section {
                    TextEditor(text: $motivo)
                        .frame(minHeight: 120)
                        .disabled(saving)
                } header: {
                    Text("Motivo")
                } footer: {
                    Text("Mínimo \(ActivityGeofenceJustifySheet.minMotivo) caracteres.")
                }

                Section {
                    if let photo {
                        Image(uiImage: photo.image)
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: .infinity, maxHeight: 220)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        Button(role: .destructive) {
                            self.photo = nil
                        } label: {
                            Label("Quitar foto", systemImage: "trash")
                        }
                        .disabled(saving)
                    }
                    Button {
                        error = nil
                        showsCamera = true
                    } label: {
                        Label(photo == nil ? "Tomar foto" : "Tomar otra", systemImage: "camera.fill")
                    }
                    .disabled(saving || loadingPhoto)
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Label("Elegir de la galería", systemImage: "photo.on.rectangle")
                    }
                    .disabled(saving || loadingPhoto)
                    if loadingPhoto {
                        ProgressView("Preparando foto…")
                    }
                } header: {
                    Text("Foto")
                } footer: {
                    Text("Opcional, pero ayuda a entender por qué saliste.")
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }
            }
            .navigationTitle("Justificar salida")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Enviando…" : "Enviar") {
                        Task { await submit() }
                    }
                    .disabled(saving || loadingPhoto || trimmed.count < ActivityGeofenceJustifySheet.minMotivo)
                }
            }
            .interactiveDismissDisabled(saving)
            .onChange(of: pickerItem) { item in
                guard let item else { return }
                Task { await loadPicked(item) }
            }
            .fullScreenCover(isPresented: $showsCamera) {
                GeoPhotoCaptureView(
                    title: "Foto de la justificación",
                    confirmLabel: "Usar esta foto",
                    requireLocation: false,
                    onConfirm: { captured in
                        photo = captured
                        showsCamera = false
                        return nil
                    },
                    onCancel: { showsCamera = false }
                )
            }
        }
    }

    @MainActor
    private func loadPicked(_ item: PhotosPickerItem) async {
        loadingPhoto = true
        error = nil
        defer {
            loadingPhoto = false
            pickerItem = nil
        }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data),
              let jpeg = CorePhotoProcessing.jpeg(from: image) else {
            error = "No se pudo leer la foto. Intenta con otra."
            return
        }
        photo = CapturedGeoPhoto(image: UIImage(data: jpeg) ?? image, jpeg: jpeg, coords: nil, capturedAt: Date())
    }

    @MainActor
    private func submit() async {
        guard trimmed.count >= ActivityGeofenceJustifySheet.minMotivo else {
            error = "Escribe el motivo (al menos \(ActivityGeofenceJustifySheet.minMotivo) caracteres)."
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let updated = try await ActivityGeofenceRepository.shared.justificar(
                activityId: activityId,
                alertId: alert.id,
                motivo: trimmed,
                fotoBase64: photo?.dataUrl
            )
            let message = updated == nil
                ? (CoreError.queuedOffline.errorDescription ?? "Sin conexión: se enviará al regresar la señal.")
                : "Justificación enviada."
            onDone(updated, message)
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo enviar la justificación")
        }
    }
}
