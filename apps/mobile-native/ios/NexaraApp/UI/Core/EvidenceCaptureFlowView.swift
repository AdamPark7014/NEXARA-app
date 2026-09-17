import SwiftUI
import UniformTypeIdentifiers

/// PDF protegido a mostrar en hoja.
struct CorePdfItem: Identifiable {
    let id = UUID()
    let title: String
    let url: String
}

private struct CameraRequest: Identifiable {
    let id = UUID()
    let step: String
}

/// Captura de evidencias del ejecutor, paridad con `ActivityEvidenceFlow` web:
/// ENTRY_PHOTO → EVIDENCE_PHOTOS → SERVICE_SHEET_PDF (solo servicio) →
/// SERVICE_SHEET_DATA (formulario real por tipo) → EXIT_PHOTO. Cámara en vivo
/// con GPS en cada foto (entrada y salida obligatoria) y modo corrección: si te
/// devolvieron pasos, solo esos se rehacen vía `resubmit`.
struct EvidenceCaptureFlowView: View {
    let activityId: Int
    var fallbackCoreKind: String? = nil
    var fallbackPhotoRequired: Int? = nil
    /// Dentro de otro ScrollView (no pone el suyo).
    var embedded: Bool = false
    var onChanged: (() -> Void)? = nil

    @State private var flow: EvidenceFlowState?
    @State private var loaded = false
    @State private var loadError: String?
    @State private var detailFetched = false
    @State private var detailCoreKind: String?
    @State private var detailPhotoRequired: Int?
    @State private var busy = false
    @State private var message: String?
    @State private var errorText: String?
    @State private var camera: CameraRequest?
    @State private var pendingPhotos: [CapturedGeoPhoto] = []
    @State private var form: [String: String] = [:]
    @State private var formPrefilled = false
    @State private var showPdfImporter = false
    @State private var pdfSheet: CorePdfItem?
    /// Sube para que la tarjeta de ubicación se recargue tras cada envío.
    @State private var geofenceRefresh = 0
    /// Leyendo el GPS antes de abrir la cámara de salida.
    @State private var checkingExitZone = false
    /// Motivo por el que no se puede tomar la salida (fuera de la zona o 400 del API).
    @State private var exitBlocked: String?

    // MARK: Derivados

    private var coreKind: String? {
        flow?.activity?.coreKind ?? fallbackCoreKind ?? detailCoreKind
    }

    private var steps: [String] { CoreEvidence.steps(for: coreKind) }

    /// Mismo rango que el API (`clampEvidencePhotoRequired`): 2 a 8, 4 por omisión.
    private var photoRequired: Int {
        let value = flow?.activity?.evidencePhotoRequired ?? fallbackPhotoRequired ?? detailPhotoRequired ?? 4
        return min(8, max(2, value))
    }

    private var currentStep: String { flow?.status ?? CoreEvidence.entryPhoto }
    private var isCorrection: Bool { flow?.isCorrection ?? false }
    private var rejected: [String] { flow?.rejectedList ?? [] }
    private var isApproved: Bool { flow?.reviewStatus == "APPROVED" }
    private var isLocked: Bool { flow?.isLocked ?? false }

    private func canAct(on step: String) -> Bool {
        guard loaded, !isApproved else { return false }
        if isCorrection { return rejected.contains(step) }
        if isLocked { return false }
        return step == currentStep
    }

    private var questionKeys: Set<String> { ["queSeHizo", "queHiciste"] }

    private var formComplete: Bool {
        let fields = CoreEvidence.formFields(for: coreKind)
        let required = fields.filter { questionKeys.contains($0.key) }
        let keys = required.isEmpty ? fields.map(\.key) : required.map(\.key)
        return keys.allSatisfy { !(form[$0] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    // MARK: Vista

    var body: some View {
        Group {
            if embedded {
                content
            } else {
                ScrollView {
                    content.padding()
                }
            }
        }
        .task { await load() }
        .fullScreenCover(item: $camera) { request in
            cameraView(for: request)
        }
        .fileImporter(isPresented: $showPdfImporter, allowedContentTypes: [.pdf]) { result in
            handlePdf(result)
        }
        .sheet(item: $pdfSheet) { item in
            NavigationStack {
                AuthenticatedPDFScreen(title: item.title, url: item.url)
            }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !loaded {
                ProgressView("Cargando tu evidencia…")
                    .frame(maxWidth: .infinity)
            } else {
                if let loadError {
                    Text(loadError).font(.footnote).foregroundStyle(CorePalette.red)
                }
                statusBanner
                if let indicaciones = flow?.assigneeIndicaciones ?? flow?.activity?.indicaciones, !indicaciones.isEmpty {
                    NxIconText(systemName: "text.bubble", text: indicaciones)
                        .font(.footnote)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                }
                // Se la pasaron: lo que dejó quien la tenía, solo para consulta.
                ForEach(flow?.previousProgress ?? []) { item in
                    ActivityPreviousProgressCard(item: item, coreKind: coreKind)
                }
                ForEach(Array(steps.enumerated()), id: \.element) { index, step in
                    stepCard(step, number: index + 1)
                }
                if flow?.isDone(CoreEvidence.entryPhoto) == true {
                    ActivityGeofenceCard(activityId: activityId, refreshToken: geofenceRefresh)
                }
                if let message {
                    NxIconText(systemName: "checkmark.circle.fill", text: message)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(CorePalette.green)
                }
                if let errorText {
                    Text(errorText).font(.footnote.weight(.semibold)).foregroundStyle(CorePalette.red)
                }
            }
        }
    }

    @ViewBuilder
    private var statusBanner: some View {
        if isApproved {
            bannerText("Tu evidencia fue aprobada.", icon: "checkmark.seal.fill", color: CorePalette.green)
        } else if isCorrection {
            let labels = rejected.map { CoreEvidence.label($0) }.joined(separator: ", ")
            let notes = (flow?.reviewNotes ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            bannerText(
                "Te devolvieron: \(labels.isEmpty ? "algunos pasos" : labels). Corrige solo eso."
                    + (notes.isEmpty ? "" : "\n«\(notes)»"),
                icon: "arrow.uturn.backward.circle.fill",
                color: CorePalette.orange
            )
        } else if isLocked {
            bannerText("Enviada. Queda en revisión: tu superior la aprueba o te la devuelve.", icon: "paperplane.fill", color: CorePalette.blue)
        } else {
            let index = (steps.firstIndex(of: currentStep) ?? 0) + 1
            Text("Paso \(min(index, steps.count)) de \(steps.count)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }

    private func bannerText(_ text: String, icon: String, color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: icon)
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(color)
            Text(text)
        }
        .font(.footnote.weight(.semibold))
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
    }

    private func stepTitle(_ step: String) -> String {
        switch step {
        case CoreEvidence.evidencePhotos: return "Fotos en sitio (mínimo \(photoRequired))"
        default: return CoreEvidence.label(step)
        }
    }

    private func stepCard(_ step: String, number: Int) -> some View {
        let done = flow?.isDone(step) ?? false
        let toFix = isCorrection && rejected.contains(step)
        let active = canAct(on: step)
        let icon = toFix ? "arrow.uturn.backward.circle.fill" : (done ? "checkmark.circle.fill" : (active ? "largecircle.fill.circle" : "circle"))
        let tone: Color = toFix ? CorePalette.orange : (done ? CorePalette.green : (active ? Color.accentColor : Color.secondary))
        let highlight: Color? = active ? (toFix ? CorePalette.orange : Color.accentColor) : nil

        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon).foregroundStyle(tone)
                Text("\(number). \(stepTitle(step))").font(.subheadline.weight(.bold))
                Spacer()
                if toFix {
                    CoreChip(text: "Por corregir", color: CorePalette.orange)
                } else if done {
                    CoreChip(text: "Hecho", color: CorePalette.green)
                }
            }
            if active {
                stepAction(step)
            } else if done {
                stepSummary(step)
            }
        }
        .coreCard(highlight: highlight)
    }

    // MARK: Acciones por paso

    @ViewBuilder
    private func stepAction(_ step: String) -> some View {
        switch step {
        case CoreEvidence.entryPhoto, CoreEvidence.exitPhoto:
            let isEntry = step == CoreEvidence.entryPhoto
            VStack(alignment: .leading, spacing: 8) {
                Text(isEntry
                     ? "Tómala al llegar. Se guarda con tu ubicación y marca el centro de tu zona de \(ActivityGeofence.radioM) m."
                     : "Tómala al terminar, a \(ActivityGeofence.radioM) m o menos de donde iniciaste. Con esta foto envías tu evidencia.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button {
                    errorText = nil
                    if isEntry {
                        camera = CameraRequest(step: step)
                    } else {
                        Task { await openExitCamera() }
                    }
                } label: {
                    Label(
                        isEntry ? "Tomar foto de entrada" : (checkingExitZone ? "Verificando ubicación…" : "Tomar foto de salida"),
                        systemImage: "camera.fill"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || checkingExitZone)
                if !isEntry, let exitBlocked {
                    NxIconText(systemName: "location.slash", text: exitBlocked, tint: CorePalette.red)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(CorePalette.red)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(CorePalette.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                }
            }
        case CoreEvidence.evidencePhotos:
            evidencePhotosAction
        case CoreEvidence.serviceSheetPdf:
            VStack(alignment: .leading, spacing: 8) {
                Text("Sube el PDF de la hoja de servicio firmada.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button {
                    errorText = nil
                    showPdfImporter = true
                } label: {
                    Label(busy ? "Subiendo…" : "Elegir PDF", systemImage: "doc.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy)
            }
        case CoreEvidence.serviceSheetData:
            formAction
        default:
            EmptyView()
        }
    }

    private var evidencePhotosAction: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Toma al menos \(photoRequired) fotos del trabajo. Cada una guarda dónde se tomó.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if isCorrection && !(flow?.photoList.isEmpty ?? true) {
                Text("Las fotos que envíes reemplazan a las anteriores.")
                    .font(.caption)
                    .foregroundStyle(CorePalette.orange)
            }
            if !pendingPhotos.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 8)], spacing: 8) {
                    ForEach(pendingPhotos) { photo in
                        ZStack(alignment: .topTrailing) {
                            Image(uiImage: photo.image)
                                .resizable()
                                .scaledToFill()
                                .frame(minWidth: 0, maxWidth: .infinity)
                                .frame(height: 90)
                                .clipped()
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            Button {
                                pendingPhotos.removeAll { $0.id == photo.id }
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.title3)
                                    .foregroundStyle(Color.white, Color.black.opacity(0.6))
                            }
                            .padding(4)
                            .disabled(busy)
                        }
                        .overlay(alignment: .bottomLeading) {
                            if photo.coords != nil {
                                Image(systemName: "location.fill")
                                    .font(.caption2)
                                    .foregroundStyle(Color.white)
                                    .padding(4)
                                    .background(Color.black.opacity(0.55), in: Circle())
                                    .padding(4)
                            }
                        }
                    }
                }
            }
            Text("\(pendingPhotos.count) de \(photoRequired) fotos")
                .font(.caption.weight(.semibold))
                .foregroundStyle(pendingPhotos.count >= photoRequired ? CorePalette.green : Color.secondary)
            HStack(spacing: 8) {
                Button {
                    errorText = nil
                    camera = CameraRequest(step: CoreEvidence.evidencePhotos)
                } label: {
                    Label("Tomar foto", systemImage: "camera.fill")
                }
                .buttonStyle(.bordered)
                .disabled(busy)

                Button {
                    Task { await sendEvidencePhotos() }
                } label: {
                    Label(busy ? "Enviando…" : "Enviar \(pendingPhotos.count) fotos", systemImage: "paperplane.fill")
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || pendingPhotos.count < photoRequired)
            }
            .font(.subheadline)
        }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(
            get: { form[key] ?? "" },
            set: { form[key] = $0 }
        )
    }

    private var formAction: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(CoreEvidence.formFields(for: coreKind)) { field in
                VStack(alignment: .leading, spacing: 4) {
                    Text(field.label).font(.caption.weight(.semibold))
                    TextField(field.label, text: binding(for: field.key), axis: .vertical)
                        .lineLimit(questionKeys.contains(field.key) || field.key == "observaciones" ? 2...6 : 1...3)
                        .textFieldStyle(.roundedBorder)
                        .disabled(busy)
                }
            }
            Button {
                Task { await sendForm() }
            } label: {
                Label(busy ? "Guardando…" : "Guardar formulario", systemImage: "checkmark")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || !formComplete)
            if !formComplete {
                Text("Cuenta qué se hizo para continuar.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Resumen de pasos hechos

    @ViewBuilder
    private func stepSummary(_ step: String) -> some View {
        switch step {
        case CoreEvidence.entryPhoto:
            photoSummary(
                url: flow?.entryPhotoUrl,
                time: flow?.entryPhotoUploadedAt,
                latitude: flow?.entryLatitude?.value,
                longitude: flow?.entryLongitude?.value,
                label: "Foto de entrada"
            )
        case CoreEvidence.exitPhoto:
            photoSummary(
                url: flow?.exitPhotoUrl,
                time: flow?.exitPhotoUploadedAt,
                latitude: flow?.exitLatitude?.value,
                longitude: flow?.exitLongitude?.value,
                label: "Foto de salida"
            )
        case CoreEvidence.evidencePhotos:
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array((flow?.photoList ?? []).enumerated()), id: \.offset) { _, url in
                        AuthenticatedImage(url: url)
                            .frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        case CoreEvidence.serviceSheetPdf:
            if let url = flow?.serviceSheetPdfUrl, !url.isEmpty {
                Button {
                    pdfSheet = CorePdfItem(title: "Hoja de servicio", url: url)
                } label: {
                    Label("Ver PDF", systemImage: "doc.richtext")
                }
                .buttonStyle(.bordered)
            }
        case CoreEvidence.serviceSheetData:
            let values = flow?.serviceSheetData?.objectValue ?? [:]
            VStack(alignment: .leading, spacing: 4) {
                ForEach(CoreEvidence.formFields(for: coreKind)) { field in
                    if let value = values[field.key]?.displayText {
                        (Text("\(field.label): ").bold() + Text(value))
                            .font(.caption)
                    }
                }
            }
        default:
            EmptyView()
        }
    }

    private func photoSummary(url: String?, time: String?, latitude: Double?, longitude: Double?, label: String) -> some View {
        HStack(spacing: 10) {
            AuthenticatedImage(url: url)
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 4) {
                if let when = CoreFormat.when(time) {
                    Text(when).font(.caption).foregroundStyle(.secondary)
                }
                if let mapUrl = CoreMaps.url(latitude: latitude, longitude: longitude, label: label) {
                    Link(destination: mapUrl) {
                        Label("Ver en mapa", systemImage: "mappin.and.ellipse")
                    }
                    .font(.caption.weight(.semibold))
                }
            }
        }
    }

    // MARK: Cámara

    @ViewBuilder
    private func cameraView(for request: CameraRequest) -> some View {
        switch request.step {
        case CoreEvidence.entryPhoto:
            GeoPhotoCaptureView(
                title: "Tu foto de entrada",
                confirmLabel: "Enviar esta foto",
                requireLocation: true,
                onConfirm: { photo in await sendGeoPhoto(step: CoreEvidence.entryPhoto, photo: photo) },
                onCancel: { camera = nil }
            )
        case CoreEvidence.exitPhoto:
            GeoPhotoCaptureView(
                title: "Tu foto de salida",
                confirmLabel: "Enviar esta foto",
                requireLocation: true,
                onConfirm: { photo in await sendGeoPhoto(step: CoreEvidence.exitPhoto, photo: photo) },
                onCancel: { camera = nil }
            )
        default:
            GeoPhotoCaptureView(
                title: "Tu foto en sitio \(pendingPhotos.count + 1)",
                confirmLabel: "Usar esta foto",
                requireLocation: false,
                onConfirm: { photo in
                    pendingPhotos.append(photo)
                    camera = nil
                    return nil
                },
                onCancel: { camera = nil }
            )
        }
    }

    // MARK: Envíos

    @MainActor
    private func load() async {
        do {
            flow = try await CoreRepository.shared.evidenceFlow(activityId: activityId)
            loadError = nil
        } catch {
            loadError = error.toUserMessage(fallback: "No se pudo cargar tu evidencia")
        }
        // Sin flujo todavía (404) no llega `activity`: tipo y fotos se leen del detalle.
        if flow?.activity == nil && !detailFetched && (fallbackCoreKind == nil || fallbackPhotoRequired == nil) {
            detailFetched = true
            let map = (try? await CoreRepository.shared.activityDetail(activityId: activityId)) ?? [:]
            let kind = ActivityParse.str(map["coreKind"])
            detailCoreKind = kind.isEmpty ? nil : kind
            detailPhotoRequired = ActivityParse.int(map["evidencePhotoRequired"])
        }
        loaded = true
        prefillForm()
    }

    /// Precarga el formulario con lo ya guardado (corrección) una sola vez.
    private func prefillForm() {
        guard !formPrefilled else { return }
        formPrefilled = true
        let saved = flow?.serviceSheetData?.objectValue ?? [:]
        var initial: [String: String] = [:]
        for field in CoreEvidence.formFields(for: coreKind) {
            initial[field.key] = saved[field.key]?.displayText ?? ""
        }
        form = initial
    }

    @MainActor
    private func afterSave(_ saved: EvidenceFlowState?, step: String, correction: Bool) async {
        errorText = nil
        guard let saved else {
            message = CoreError.queuedOffline.errorDescription
            return
        }
        // Las respuestas de guardado no traen `activity`: se recarga el flujo.
        await load()
        geofenceRefresh += 1
        let status = saved.status ?? flow?.status ?? ""
        if status == CoreEvidence.completed {
            message = correction
                ? "¡Corrección enviada! Tu evidencia será revisada nuevamente."
                : "¡Evidencia enviada! Queda en revisión."
        } else if correction {
            message = "Paso corregido. Siguiente: \(CoreEvidence.label(status))"
        } else {
            message = "Listo: \(CoreEvidence.label(step)). Siguiente: \(CoreEvidence.label(status))"
        }
        onChanged?()
    }

    // MARK: Geocerca de la salida

    /// Hay punto de inicio real (foto de entrada con GPS) contra el cual medir.
    private var hasEntryOrigin: Bool {
        ActivityGeofence.esPuntoReal(latitude: flow?.entryLatitude?.value, longitude: flow?.entryLongitude?.value)
    }

    /// Mensaje de bloqueo si el punto queda a más de 100 m de la foto de entrada
    /// (mismo texto que el API); `nil` si la salida se puede registrar ahí.
    private func exitZoneMessage(latitude: Double?, longitude: Double?) -> String? {
        guard let distancia = ActivityGeofence.distanciaAlOrigen(
            origenLat: flow?.entryLatitude?.value,
            origenLng: flow?.entryLongitude?.value,
            latitude: latitude,
            longitude: longitude
        ), ActivityGeofence.fueraDeZona(distancia) else { return nil }
        return ActivityGeofence.mensajeSalidaFueraDeZona(distancia: distancia)
    }

    /// Antes de abrir la cámara de salida se mide dónde está: fuera de la zona
    /// no tiene caso tomar una foto que el API va a rechazar.
    @MainActor
    private func openExitCamera() async {
        exitBlocked = nil
        if hasEntryOrigin {
            checkingExitZone = true
            let coords = await DeviceLocation.shared.current()
            checkingExitZone = false
            if let blocked = exitZoneMessage(latitude: coords?.latitude, longitude: coords?.longitude) {
                exitBlocked = blocked
                geofenceRefresh += 1
                return
            }
        }
        camera = CameraRequest(step: CoreEvidence.exitPhoto)
    }

    @MainActor
    private func sendGeoPhoto(step: String, photo: CapturedGeoPhoto) async -> String? {
        guard let coords = photo.coords else { return GeoPhotoCaptureView.locationError }
        let isExit = step == CoreEvidence.exitPhoto
        // La salida se mide con la misma ubicación que viaja en la foto, como el API.
        if isExit, let blocked = exitZoneMessage(latitude: coords.latitude, longitude: coords.longitude) {
            exitBlocked = blocked
            geofenceRefresh += 1
            return blocked
        }
        busy = true
        defer { busy = false }
        let payload = GeoPhotoPayload(photoUrl: photo.dataUrl, latitude: coords.latitude, longitude: coords.longitude)
        let correction = isCorrection
        do {
            let saved: EvidenceFlowState?
            if step == CoreEvidence.entryPhoto {
                saved = try await CoreRepository.shared.submitEntryPhoto(activityId: activityId, photo: payload, correction: correction)
                // Los puntos del GPS de jornada viajan ligados a esta actividad hasta la salida.
                if !correction { ShiftGpsTracker.currentActivityId = activityId }
            } else {
                saved = try await CoreRepository.shared.submitExitPhoto(activityId: activityId, photo: payload, correction: correction)
                if ShiftGpsTracker.currentActivityId == activityId {
                    ShiftGpsTracker.currentActivityId = nil
                }
            }
            if isExit { exitBlocked = nil }
            camera = nil
            await afterSave(saved, step: step, correction: correction)
            return nil
        } catch {
            let text = error.toUserMessage(fallback: "No se pudo guardar la foto")
            if isExit {
                // El 400 de «fuera de zona» (u otro rechazo) también queda visible al cerrar la cámara.
                exitBlocked = text
                geofenceRefresh += 1
            }
            return text
        }
    }

    @MainActor
    private func sendEvidencePhotos() async {
        guard pendingPhotos.count >= photoRequired else {
            errorText = "Se requieren al menos \(photoRequired) fotos de evidencia."
            return
        }
        busy = true
        defer { busy = false }
        let urls = pendingPhotos.map(\.dataUrl)
        let geo: [PhotoGeoPayload?] = pendingPhotos.map { photo -> PhotoGeoPayload? in
            guard let coords = photo.coords else { return nil }
            return PhotoGeoPayload(
                latitude: coords.latitude,
                longitude: coords.longitude,
                capturedAt: CoreFormat.isoString(photo.capturedAt)
            )
        }
        let correction = isCorrection
        do {
            let saved = try await CoreRepository.shared.submitEvidencePhotos(
                activityId: activityId,
                photos: EvidencePhotosPayload(photoUrls: urls, photoGeo: geo),
                correction: correction
            )
            pendingPhotos = []
            await afterSave(saved, step: CoreEvidence.evidencePhotos, correction: correction)
        } catch {
            errorText = error.toUserMessage(fallback: "No se pudieron guardar las fotos")
        }
    }

    private func handlePdf(_ result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            let access = url.startAccessingSecurityScopedResource()
            defer {
                if access { url.stopAccessingSecurityScopedResource() }
            }
            guard let data = try? Data(contentsOf: url), !data.isEmpty else {
                errorText = "No se pudo leer el PDF."
                return
            }
            guard data.count <= 20 * 1024 * 1024 else {
                errorText = "El PDF pesa demasiado (máximo 20 MB)."
                return
            }
            let dataUrl = "data:application/pdf;base64,\(data.base64EncodedString())"
            Task { await sendPdf(dataUrl) }
        case .failure(let error):
            errorText = error.toUserMessage(fallback: "No se pudo abrir el archivo")
        }
    }

    @MainActor
    private func sendPdf(_ dataUrl: String) async {
        busy = true
        defer { busy = false }
        let correction = isCorrection
        do {
            let saved = try await CoreRepository.shared.submitServiceSheetPdf(
                activityId: activityId,
                pdfDataUrl: dataUrl,
                correction: correction
            )
            await afterSave(saved, step: CoreEvidence.serviceSheetPdf, correction: correction)
        } catch {
            errorText = error.toUserMessage(fallback: "No se pudo guardar el PDF")
        }
    }

    @MainActor
    private func sendForm() async {
        guard formComplete else {
            errorText = "Cuenta qué se hizo para continuar."
            return
        }
        busy = true
        defer { busy = false }
        var fields: [String: String] = [:]
        for field in CoreEvidence.formFields(for: coreKind) {
            fields[field.key] = (form[field.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let correction = isCorrection
        do {
            let saved = try await CoreRepository.shared.submitServiceSheetData(
                activityId: activityId,
                fields: fields,
                correction: correction
            )
            await afterSave(saved, step: CoreEvidence.serviceSheetData, correction: correction)
        } catch {
            errorText = error.toUserMessage(fallback: "No se pudo guardar el formulario")
        }
    }
}
