import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// PDF protegido a mostrar en hoja.
struct CorePdfItem: Identifiable {
    let id = UUID()
    let title: String
    let url: String
}

/// Hueco de un campo al que va la imagen adjunta (galería o archivo).
private struct CampoAdjunto: Equatable {
    let id: Int
    let momento: String
}

private struct CameraRequest: Identifiable {
    let id = UUID()
    let step: String
    /// Evidencia por campos: qué campo y en qué momento se está fotografiando.
    var campoId: Int? = nil
    var momento: String? = nil
}

/// Foto de entrada ya tomada, a la espera de que la persona conteste lo del salto
/// de prioridad (contrato B). La foto se guarda aquí para no obligarla a repetirla.
private struct JustificacionOrdenPendiente: Identifiable {
    let id = UUID()
    let aviso: String
    let photo: CapturedGeoPhoto
}

/// Captura de evidencias del ejecutor, paridad con `ActivityEvidenceFlow` web:
/// ENTRY_PHOTO → EVIDENCE_PHOTOS → SERVICE_SHEET_PDF (solo servicio) →
/// SERVICE_SHEET_DATA (formulario real por tipo) → EXIT_PHOTO. Cámara en vivo
/// con GPS en cada foto (entrada y salida obligatoria) y modo corrección: si te
/// devolvieron pasos, solo esos se rehacen vía `resubmit`.
///
/// **Evidencia por campos.** Si la actividad trae `campos`, las fotos en sitio
/// dejan de ser libres: cada campo («Cámara 1», «Rack») pide foto en los
/// momentos que marque el API — antes, en progreso, después — y la foto de
/// salida no se habilita hasta que no falte ninguna. La actividad sin campos se
/// captura exactamente igual que antes.
struct EvidenceCaptureFlowView: View {
    let activityId: Int
    var fallbackCoreKind: String? = nil
    var fallbackPhotoRequired: Int? = nil
    /// Indicaciones generales del detalle, por si el flujo no las trae.
    var fallbackIndicaciones: String? = nil
    /// Prioridad del detalle, por si `me/activities` no trae esta actividad.
    var fallbackPrioridad: String? = nil
    /// Dentro de otro ScrollView (no pone el suyo).
    var embedded: Bool = false
    var onChanged: (() -> Void)? = nil
    /// Si viene, el botón principal de cada paso se publica al dock del detalle
    /// y no se pinta dentro de la tarjeta (Android `dockHost`).
    var dockHost: ((EvidenceDockAction?) -> Void)? = nil

    /// Tope de fotos libres por actividad (Android `MAX_EVIDENCE_PHOTOS`).
    private static let maxEvidencePhotos = 12

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
    /// Urls ya confirmadas en el servidor para esta evidencia (recuperadas del GET + las que se
    /// van mandando en cuanto se toman). Fuente de verdad para el envío final; `pendingPhotos` es
    /// solo lo capturado en esta sesión, para pintar la miniatura real.
    @State private var confirmedPhotoURLs: [String] = []
    @State private var form: [String: String] = [:]
    @State private var formPrefilled = false
    @State private var showPdfImporter = false
    /// Galería o archivo de una evidencia. La entrada y la salida no lo usan.
    @State private var showAttachMenu = false
    @State private var showImagePicker = false
    @State private var imagePickerItem: PhotosPickerItem?
    @State private var showImageImporter = false
    @State private var campoAdjunto: CampoAdjunto?
    @State private var pdfSheet: CorePdfItem?
    /// Sube para que la tarjeta de ubicación se recargue tras cada envío.
    @State private var geofenceRefresh = 0
    /// Leyendo el GPS antes de abrir la cámara de salida.
    @State private var checkingExitZone = false
    /// Motivo por el que no se puede tomar la salida (fuera de la zona o 400 del API).
    @State private var exitBlocked: String?
    /// Evidencia por campos: vacío contra la API de hoy (el flujo no cambia).
    @State private var campos: [EvidenceCampo] = []
    /// Miniatura local del hueco recién tomado, mientras no vuelve el GET.
    @State private var campoThumbs: [String: UIImage] = [:]
    /// Contrato B: hay otra de más prioridad sin empezar. `nil` = no hay salto.
    @State private var avisoOrden: String?
    /// Ya se preguntó una vez; no se vuelve a preguntar aunque se repita la foto.
    @State private var ordenResuelto = false
    /// Foto de entrada esperando a que conteste lo del salto de prioridad.
    @State private var preguntaOrden: JustificacionOrdenPendiente?

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

    /// La actividad se captura por campos (y no con fotos libres).
    private var porCampos: Bool { !campos.isEmpty }

    /// Texto de bloqueo de la salida por campos incompletos; `nil` si ya se puede.
    private var camposBlockingExit: String? { CoreEvidence.exitBlockedByCampos(campos) }

    private func campoSlotKey(_ campoId: Int?, _ momento: String) -> String {
        "\(campoId ?? 0):\(momento)"
    }

    private var formComplete: Bool {
        let fields = CoreEvidence.formFields(for: coreKind)
        let required = fields.filter { questionKeys.contains($0.key) }
        let keys = required.isEmpty ? fields.map(\.key) : required.map(\.key)
        return keys.allSatisfy { !(form[$0] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private func noVacio(_ texto: String?) -> String? {
        guard let limpio = texto?.trimmingCharacters(in: .whitespacesAndNewlines), !limpio.isEmpty else { return nil }
        return limpio
    }

    // MARK: Dock

    /// Paso que manda el dock: el actual o, en corrección, el primero devuelto.
    private var dockStep: String? {
        guard loaded, flow != nil || loadError == nil else { return nil }
        if isCorrection { return steps.first { canAct(on: $0) } }
        return canAct(on: currentStep) ? currentStep : nil
    }

    /// El mismo botón de cada paso, al alcance del pulgar (Android `dockAction`).
    private var dockAction: EvidenceDockAction? {
        guard dockHost != nil, let step = dockStep else { return nil }
        let comercial = CoreEvidence.isComercial(coreKind)
        switch step {
        case CoreEvidence.entryPhoto:
            return EvidenceDockAction(
                label: comercial ? "Tomar foto de inicio" : "Tomar foto de entrada",
                enabled: !busy,
                systemImage: "camera.fill",
                hint: comercial ? "Se guarda con tu ubicación GPS." : "Tómala al llegar al sitio; se guarda con tu ubicación GPS.",
                onPrimary: {
                    message = nil
                    errorText = nil
                    camera = CameraRequest(step: CoreEvidence.entryPhoto)
                }
            )
        case CoreEvidence.evidencePhotos where porCampos:
            return EvidenceDockAction(
                label: busy ? "Guardando…" : "Siguiente paso",
                enabled: !busy,
                systemImage: nil,
                hint: camposBlockingExit ?? "Ya documentaste todos los campos.",
                onPrimary: { Task { await sendEvidencePhotos() } }
            )
        case CoreEvidence.evidencePhotos:
            let tomadas = confirmedPhotoURLs.count
            let tomarFoto: () -> Void = {
                message = nil
                errorText = nil
                camera = CameraRequest(step: CoreEvidence.evidencePhotos)
            }
            if tomadas < photoRequired {
                let faltan = photoRequired - tomadas
                return EvidenceDockAction(
                    label: "Tomar foto · \(tomadas) de \(photoRequired)",
                    enabled: !busy && tomadas < Self.maxEvidencePhotos,
                    systemImage: "camera.fill",
                    hint: "Faltan \(faltan) foto\(faltan == 1 ? "" : "s") para seguir.",
                    onPrimary: tomarFoto,
                    secondaryLabel: "Adjuntar",
                    onSecondary: {
                        errorText = nil
                        campoAdjunto = nil
                        showAttachMenu = true
                    }
                )
            }
            return EvidenceDockAction(
                label: busy ? "Guardando…" : "Siguiente paso · \(tomadas) de \(photoRequired)",
                enabled: !busy,
                systemImage: nil,
                hint: "Ya tienes las fotos. Puedes tomar más antes de seguir.",
                onPrimary: { Task { await sendEvidencePhotos() } },
                secondaryLabel: "Tomar otra",
                secondarySystemImage: "camera.fill",
                onSecondary: tomadas < Self.maxEvidencePhotos ? tomarFoto : nil
            )
        case CoreEvidence.serviceSheetPdf:
            return EvidenceDockAction(
                label: busy ? "Subiendo…" : "Seleccionar PDF",
                enabled: !busy,
                systemImage: busy ? nil : "doc.text",
                hint: "Carga la hoja de servicio firmada. Solo PDF.",
                onPrimary: {
                    message = nil
                    errorText = nil
                    showPdfImporter = true
                }
            )
        case CoreEvidence.serviceSheetData:
            return EvidenceDockAction(
                label: busy ? "Guardando…" : "Guardar formulario",
                enabled: !busy,
                systemImage: nil,
                hint: "Completa los datos de esta actividad y guarda.",
                onPrimary: { Task { await sendForm() } }
            )
        case CoreEvidence.exitPhoto:
            let bloqueo = camposBlockingExit
            return EvidenceDockAction(
                label: checkingExitZone
                    ? "Verificando ubicación…"
                    : (comercial ? "Tomar foto de conclusión" : "Tomar foto de salida"),
                enabled: !busy && !checkingExitZone && bloqueo == nil,
                systemImage: "camera.fill",
                hint: bloqueo ?? exitBlocked ?? "Con esta foto mandas la actividad a revisión.",
                onPrimary: {
                    message = nil
                    errorText = nil
                    Task { await openExitCamera() }
                }
            )
        default:
            return nil
        }
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
        // Se revisa cada vez que cambia el paso: solo aplica a la foto de entrada
        // de un alta, nunca a una corrección.
        .task(id: "\(currentStep)|\(isCorrection)") { await revisarOrdenDePrioridad() }
        // El detalle solo repinta el dock cuando cambia lo que se ve (`look`).
        .onAppear { dockHost?(dockAction) }
        .onChange(of: dockAction?.look) { _, _ in dockHost?(dockAction) }
        .onDisappear { dockHost?(nil) }
        .fullScreenCover(item: $camera) { request in
            cameraView(for: request)
        }
        .sheet(item: $preguntaOrden) { pendiente in
            JustificarOrdenSheet(
                aviso: pendiente.aviso,
                onCancelar: { preguntaOrden = nil },
                onContinuar: { justificacion in
                    preguntaOrden = nil
                    // Contestada una vez, no se vuelve a preguntar por esta actividad.
                    ordenResuelto = true
                    Task { @MainActor in
                        if let fallo = await sendGeoPhoto(
                            step: CoreEvidence.entryPhoto,
                            photo: pendiente.photo,
                            justificacionOrden: justificacion
                        ) {
                            errorText = fallo
                        }
                    }
                }
            )
        }
        .fileImporter(isPresented: $showPdfImporter, allowedContentTypes: [.pdf]) { result in
            handlePdf(result)
        }
        .confirmationDialog("Adjuntar imagen", isPresented: $showAttachMenu, titleVisibility: .visible) {
            Button("Galería o capturas") { showImagePicker = true }
            Button("Archivo") { showImageImporter = true }
            Button("Cancelar", role: .cancel) { campoAdjunto = nil }
        }
        .photosPicker(isPresented: $showImagePicker, selection: $imagePickerItem, matching: .images)
        .onChange(of: imagePickerItem) { item in
            guard let item else { return }
            Task { await loadPickedEvidence(item) }
        }
        .fileImporter(isPresented: $showImageImporter, allowedContentTypes: [.image]) { result in
            switch result {
            case .success(let url):
                Task { await loadEvidenceFile(url) }
            case .failure:
                errorText = "No se pudo abrir el archivo."
                campoAdjunto = nil
            }
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
                NxLoadingState(text: "Cargando tu evidencia…")
            } else {
                if let loadError {
                    NxIconText(systemName: "exclamationmark.triangle.fill", text: loadError)
                        .font(.footnote)
                        .foregroundStyle(CorePalette.red)
                }
                statusBanner
                // El avance lo calcula el API; aquí solo se pinta.
                if let pct = flow?.progressPct {
                    CoreProgressBar(percent: pct)
                }
                if porCampos {
                    camposCard
                }
                if let general = noVacio(flow?.activity?.indicaciones) ?? noVacio(fallbackIndicaciones) {
                    ActivitySoftNote(text: general, title: "Indicaciones generales")
                }
                if let paraTi = noVacio(flow?.assigneeIndicaciones) {
                    ActivitySoftNote(text: paraTi, title: "Indicaciones para ti")
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
            let labels = rejected.map { CoreEvidence.label($0, coreKind: coreKind) }.joined(separator: ", ")
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

    // MARK: Evidencia por campos

    /// Lista de campos con sus huecos. En cada uno, «Tomar foto» abre la
    /// cámara y «Adjuntar» abre galería o archivo.
    private var camposCard: some View {
        let faltan = CoreEvidence.missingCampoPhotos(campos)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "camera.on.rectangle")
                    .symbolRenderingMode(.hierarchical)
                Text("Fotos por campo").font(.subheadline.weight(.bold))
                Spacer()
                CoreChip(
                    text: faltan == 0 ? "Completo" : "Faltan \(faltan)",
                    color: faltan == 0 ? CorePalette.green : CorePalette.orange
                )
            }
            Text(CoreEvidence.camposSummary(campos))
                .font(.caption.weight(.semibold))
                .foregroundStyle(faltan == 0 ? CorePalette.green : Color.secondary)
            Text("En cada punto: Tomar foto (cámara) o Adjuntar (galería o archivo).")
                .font(.caption)
                .foregroundStyle(Color.secondary)
            ForEach(CoreEvidence.ordered(campos), id: \.rowKey) { campo in
                campoRow(campo)
            }
        }
        .coreCard(highlight: faltan == 0 ? nil : CorePalette.orange)
    }

    @ViewBuilder
    private func campoRow(_ campo: EvidenceCampo) -> some View {
        let momentos = CoreEvidence.momentosPedidos(of: campo)
        if !momentos.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(CoreEvidence.campoName(campo))
                        .font(.footnote.weight(.bold))
                    Spacer()
                    if CoreEvidence.isCampoDone(campo) {
                        CoreChip(text: "Listo", color: CorePalette.green)
                    } else {
                        CoreChip(
                            text: "Faltan \(CoreEvidence.missingMomentos(of: campo).count)",
                            color: CorePalette.orange
                        )
                    }
                }
                HStack(alignment: .top, spacing: 8) {
                    ForEach(momentos, id: \.self) { momento in
                        campoSlot(campo, momento: momento)
                    }
                    // Los campos de menos de tres momentos no estiran los huecos.
                    if momentos.count < CoreEvidence.momentos.count {
                        ForEach(0..<(CoreEvidence.momentos.count - momentos.count), id: \.self) { _ in
                            Color.clear.frame(maxWidth: .infinity).frame(height: 1)
                        }
                    }
                }
            }
        }
    }

    private func campoSlot(_ campo: EvidenceCampo, momento: String) -> some View {
        let url = CoreEvidence.photo(of: campo, momento: momento)
        let thumb = campoThumbs[campoSlotKey(campo.id, momento)]
        let taken = url != nil || thumb != nil
        let canCapture = loaded && !busy && !isApproved && !isLocked && campo.id != nil
        return VStack(spacing: 4) {
            Button {
                guard let campoId = campo.id else { return }
                errorText = nil
                message = nil
                camera = CameraRequest(step: CoreEvidence.evidencePhotos, campoId: campoId, momento: momento)
            } label: {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(taken ? Color.black : Color.secondary.opacity(0.14))
                    if let thumb {
                        Image(uiImage: thumb)
                            .resizable()
                            .scaledToFill()
                    } else if let url {
                        AuthenticatedImage(url: url)
                    } else {
                        Image(systemName: "camera.fill")
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(height: 84)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(taken ? CorePalette.green : Color.secondary.opacity(0.3), lineWidth: 1)
                )
                .overlay(alignment: .topTrailing) {
                    if taken {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.footnote)
                            .foregroundStyle(Color.white, CorePalette.green)
                            .padding(4)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(!canCapture)
            Text(CoreEvidence.momentoLabel(momento))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(taken ? Color.primary : Color.secondary)
            HStack(spacing: 4) {
                Button {
                    guard let campoId = campo.id else { return }
                    errorText = nil
                    message = nil
                    camera = CameraRequest(step: CoreEvidence.evidencePhotos, campoId: campoId, momento: momento)
                } label: {
                    Text("Tomar foto")
                        .font(.caption2.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.bordered)
                .disabled(!canCapture)
                Button {
                    guard let campoId = campo.id else { return }
                    errorText = nil
                    message = nil
                    campoAdjunto = CampoAdjunto(id: campoId, momento: momento)
                    showAttachMenu = true
                } label: {
                    Text("Adjuntar")
                        .font(.caption2.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.bordered)
                .disabled(!canCapture)
            }
        }
    }

    private func stepTitle(_ step: String) -> String {
        switch step {
        case CoreEvidence.evidencePhotos:
            return porCampos ? "Fotos en sitio (por campo)" : "Fotos en sitio (mínimo \(photoRequired))"
        default: return CoreEvidence.label(step, coreKind: coreKind)
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
            // Comercial no es trabajo «en sitio»: se inicia y se concluye la actividad,
            // y su conclusión no tiene que registrarse donde inició.
            let comercial = CoreEvidence.isComercial(coreKind)
            VStack(alignment: .leading, spacing: 8) {
                Text(comercial
                     ? (isEntry
                        ? "Tómala al iniciar la actividad. Se guarda con tu ubicación."
                        : "Tómala al concluir la actividad. Se guarda con tu ubicación; no tiene que ser donde iniciaste. Con esta foto envías tu evidencia.")
                     : (isEntry
                        ? "Tómala al llegar. Se guarda con tu ubicación y marca el centro de tu zona de \(ActivityGeofence.radioM) m."
                        : "Tómala al terminar. Si tu actividad lo pide, a \(ActivityGeofence.radioM) m o menos de donde iniciaste. Con esta foto envías tu evidencia."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if dockHost == nil {
                    Button {
                        errorText = nil
                        if isEntry {
                            camera = CameraRequest(step: step)
                        } else {
                            Task { await openExitCamera() }
                        }
                    } label: {
                        Label(
                            isEntry
                                ? (comercial ? "Tomar foto de inicio" : "Tomar foto de entrada")
                                : (checkingExitZone ? "Verificando ubicación…" : (comercial ? "Tomar foto de conclusión" : "Tomar foto de salida")),
                            systemImage: "camera.fill"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || checkingExitZone || (!isEntry && camposBlockingExit != nil))
                }
                if !isEntry, let bloqueo = camposBlockingExit {
                    ActivitySoftNote(text: bloqueo, color: CorePalette.orange)
                }
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
            if porCampos {
                camposStepAction
            } else {
                evidencePhotosAction
            }
        case CoreEvidence.serviceSheetPdf:
            VStack(alignment: .leading, spacing: 8) {
                Text("Carga el PDF de la hoja de servicio firmada. Solo PDF.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if dockHost == nil {
                    Button {
                        errorText = nil
                        showPdfImporter = true
                    } label: {
                        Label(busy ? "Subiendo…" : "Seleccionar PDF", systemImage: "doc.badge.plus")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy)
                }
            }
        case CoreEvidence.serviceSheetData:
            formAction
        default:
            EmptyView()
        }
    }

    /// Con campos, las fotos ya viajaron una por una desde «Fotos por campo»:
    /// este paso solo avanza cuando no falta ninguna.
    private var camposStepAction: some View {
        let faltan = CoreEvidence.missingCampoPhotos(campos)
        return VStack(alignment: .leading, spacing: 10) {
            Text(faltan == 0
                 ? "Ya documentaste todos los campos. Continúa al siguiente paso."
                 : "Toma o adjunta las fotos de cada campo en «Fotos por campo». Faltan \(faltan).")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if dockHost == nil {
                Button {
                    Task { await sendEvidencePhotos() }
                } label: {
                    Label(busy ? "Enviando…" : "Continuar", systemImage: "arrow.right.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || faltan > 0)
            }
        }
    }

    private var evidencePhotosAction: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Toma o adjunta al menos \(photoRequired) fotos del trabajo. Si hay GPS se guarda; si no, la foto igual vale.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if isCorrection && !(flow?.photoList.isEmpty ?? true) {
                Text("Las fotos que envíes reemplazan a las anteriores.")
                    .font(.caption)
                    .foregroundStyle(CorePalette.orange)
            }
            // Miniaturas: las de esta sesión (UIImage) + las ya guardadas al salir y volver
            // (AuthenticatedImage). Antes solo se veían las de esta sesión y la gente creía
            // que había que empezar de cero aunque el contador sí las sumaba.
            if !confirmedPhotoURLs.isEmpty || !pendingPhotos.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 8)], spacing: 8) {
                    ForEach(Array(confirmedPhotoURLs.enumerated()), id: \.offset) { index, url in
                        let local = pendingPhotoMatching(url: url, index: index)
                        ZStack(alignment: .topTrailing) {
                            Group {
                                if let local {
                                    Image(uiImage: local.image)
                                        .resizable()
                                        .scaledToFill()
                                } else {
                                    AuthenticatedImage(url: url)
                                }
                            }
                            .frame(minWidth: 0, maxWidth: .infinity)
                            .frame(height: 90)
                            .clipped()
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            Button {
                                Task { await removeConfirmedPhoto(at: index, local: local) }
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.title3)
                                    .foregroundStyle(Color.white, Color.black.opacity(0.6))
                                    .frame(width: NxMetrics.minTap, height: NxMetrics.minTap, alignment: .topTrailing)
                                    .contentShape(Rectangle())
                            }
                            .accessibilityLabel("Quitar foto")
                            .disabled(busy)
                        }
                        .overlay(alignment: .bottomLeading) {
                            if local?.coords != nil {
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
            Text("\(confirmedPhotoURLs.count) de \(photoRequired) fotos")
                .font(.caption.weight(.semibold))
                .foregroundStyle(confirmedPhotoURLs.count >= photoRequired ? CorePalette.green : Color.secondary)
            if confirmedPhotoURLs.count > pendingPhotos.count {
                Text("Ya tienes \(confirmedPhotoURLs.count - pendingPhotos.count) guardada(s) de antes: puedes seguir agregando o quitarlas.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                Button {
                    errorText = nil
                    camera = CameraRequest(step: CoreEvidence.evidencePhotos)
                } label: {
                    Label("Tomar foto", systemImage: "camera.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(busy || confirmedPhotoURLs.count >= Self.maxEvidencePhotos)

                Button {
                    errorText = nil
                    campoAdjunto = nil
                    showAttachMenu = true
                } label: {
                    Label("Adjuntar", systemImage: "paperclip")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(busy || confirmedPhotoURLs.count >= Self.maxEvidencePhotos)
            }
            .font(.subheadline)
            if dockHost == nil {
                Button {
                    Task { await sendEvidencePhotos() }
                } label: {
                    Label(busy ? "Enviando…" : "Enviar \(confirmedPhotoURLs.count) fotos", systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || confirmedPhotoURLs.count < photoRequired)
            }
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
            if dockHost == nil {
                Button {
                    Task { await sendForm() }
                } label: {
                    Label(busy ? "Guardando…" : "Guardar formulario", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || !formComplete)
            }
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
                label: CoreEvidence.label(CoreEvidence.entryPhoto, coreKind: coreKind)
            )
        case CoreEvidence.exitPhoto:
            photoSummary(
                url: flow?.exitPhotoUrl,
                time: flow?.exitPhotoUploadedAt,
                latitude: flow?.exitLatitude?.value,
                longitude: flow?.exitLongitude?.value,
                label: CoreEvidence.label(CoreEvidence.exitPhoto, coreKind: coreKind)
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

    /// «Cámara 1 · Antes»: lo que se está fotografiando.
    private func campoCameraTitle(campoId: Int, momento: String) -> String {
        let nombre = campos.first(where: { $0.id == campoId }).map { CoreEvidence.campoName($0) } ?? "Campo"
        return "\(nombre) · \(CoreEvidence.momentoLabel(momento))"
    }

    @ViewBuilder
    private func cameraView(for request: CameraRequest) -> some View {
        if let campoId = request.campoId, let momento = request.momento {
            // Evidencia por campos: la foto viaja sola al campo y momento que se tocó.
            GeoPhotoCaptureView(
                title: campoCameraTitle(campoId: campoId, momento: momento),
                confirmLabel: "Enviar esta foto",
                // El campo se fotografía donde esté; la ubicación viaja si la hay.
                requireLocation: false,
                onConfirm: { photo in await sendCampoPhoto(campoId: campoId, momento: momento, photo: photo) },
                onCancel: { camera = nil }
            )
        } else {
            stepCameraView(for: request)
        }
    }

    @ViewBuilder
    private func stepCameraView(for request: CameraRequest) -> some View {
        switch request.step {
        case CoreEvidence.entryPhoto:
            GeoPhotoCaptureView(
                title: CoreEvidence.isComercial(coreKind) ? "Tu foto de inicio de actividad" : "Tu foto de entrada",
                confirmLabel: "Enviar esta foto",
                requireLocation: true,
                onConfirm: { photo in
                    // Hay otra de más prioridad sin empezar: se pregunta ANTES de
                    // mandar la foto, igual que Android. La foto no se pierde.
                    if let aviso = avisoOrden, !ordenResuelto {
                        await MainActor.run { camera = nil }
                        // Cerrar la cámara y abrir la hoja en el mismo instante no
                        // la presenta; se le deja un respiro (mismo truco que
                        // `CoreShellView.present`). Tras el `await` ya no se está en
                        // el hilo principal, así que el estado se toca dentro de
                        // `MainActor.run`.
                        try? await Task.sleep(nanoseconds: 450_000_000)
                        await MainActor.run {
                            preguntaOrden = JustificacionOrdenPendiente(aviso: aviso, photo: photo)
                        }
                        return nil
                    }
                    return await sendGeoPhoto(step: CoreEvidence.entryPhoto, photo: photo)
                },
                onCancel: { camera = nil }
            )
        case CoreEvidence.exitPhoto:
            GeoPhotoCaptureView(
                title: CoreEvidence.isComercial(coreKind) ? "Tu foto de conclusión de actividad" : "Tu foto de salida",
                confirmLabel: "Enviar esta foto",
                requireLocation: true,
                onConfirm: { photo in await sendGeoPhoto(step: CoreEvidence.exitPhoto, photo: photo) },
                onCancel: { camera = nil }
            )
        default:
            GeoPhotoCaptureView(
                title: "Tu foto en sitio \(confirmedPhotoURLs.count + 1)",
                confirmLabel: "Usar esta foto",
                requireLocation: false,
                onConfirm: { photo in
                    let error = await sendEvidencePhoto(photo)
                    if error == nil { camera = nil }
                    return error
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
            // Solo el GET trae los campos: los POST de cada paso no los mandan.
            campos = flow?.campos ?? []
            // Recupera fotos libres ya guardadas (de un intento anterior que se interrumpió):
            // `pendingPhotos` empieza vacío porque no hay imagen local que mostrar, pero el envío
            // final las incluye igual — nada se pierde ni se duplica.
            if flow?.status == CoreEvidence.evidencePhotos {
                confirmedPhotoURLs = flow?.photoList ?? []
            }
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

    /// Contrato B: empezar ésta teniendo otra de más prioridad sin terminar no
    /// bloquea nada; solo se pregunta (una vez) si quiere decir por qué.
    ///
    /// Se calcula con `GET me/activities`, que es la misma lista que ve en «Mis
    /// actividades»: si el API falla, `avisoOrden` se queda como estaba y la foto
    /// sale sin preguntar. Nunca se le impide entregar su trabajo por esto.
    @MainActor
    private func revisarOrdenDePrioridad() async {
        guard currentStep == CoreEvidence.entryPhoto, !isCorrection else {
            avisoOrden = nil
            return
        }
        guard let datos = try? await CoreRepository.shared.myActivities() else { return }
        let abiertas = datos.open
        let pendientes = abiertas
            // Lo de mañana no cuenta como salto: nadie se salta el orden por adelantarse.
            .filter { ActivityPriorityJump.esDelDiaOAntes($0.fechaInicio ?? $0.fechaMaxima) }
            .map {
                ActivityPriorityJump.Pendiente(
                    id: $0.id,
                    prioridad: $0.prioridad,
                    iniciada: $0.inicioRealAt != nil || !($0.evidenceStatus ?? "").isEmpty,
                    terminada: $0.fechaFinalizacion != nil
                )
            }
        // La prioridad de la que se va a empezar solo la trae `me/activities`:
        // `EvidenceFlowActivityInfo` no la manda. Sin ella cuenta como media, que es
        // el mismo valor por omisión de la regla.
        let mia = abiertas.first { $0.id == activityId }
        guard let mayor = ActivityPriorityJump.mayorPendiente(
            actualId: activityId,
            actualPrioridad: mia?.prioridad ?? noVacio(fallbackPrioridad),
            otras: pendientes
        ) else {
            avisoOrden = nil
            return
        }
        avisoOrden = ActivityPriorityJump.aviso(
            titulo: abiertas.first { $0.id == mayor.id }?.titulo,
            prioridad: mayor.prioridad
        )
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
            message = "Paso corregido. Siguiente: \(CoreEvidence.label(status, coreKind: coreKind))"
        } else {
            message = "Listo: \(CoreEvidence.label(step, coreKind: coreKind)). Siguiente: \(CoreEvidence.label(status, coreKind: coreKind))"
        }
        onChanged?()
    }

    // MARK: Geocerca de la salida

    /// Hay punto de inicio real (foto de entrada con GPS) contra el cual medir.
    private var hasEntryOrigin: Bool {
        ActivityGeofence.esPuntoReal(latitude: flow?.entryLatitude?.value, longitude: flow?.entryLongitude?.value)
    }

    /// Mensaje de bloqueo si el punto queda fuera del radio y el API exige la misma
    /// ubicación (según el tipo de actividad). Sin la bandera, o en false, no se pre-bloquea.
    private func exitZoneMessage(latitude: Double?, longitude: Double?) async -> String? {
        let state = try? await ActivityGeofenceRepository.shared.estado(activityId: activityId)
        guard state?.exigeMismaUbicacion == true else { return nil }
        let radio = state?.radioM ?? ActivityGeofence.radioM
        guard let distancia = ActivityGeofence.distanciaAlOrigen(
            origenLat: flow?.entryLatitude?.value,
            origenLng: flow?.entryLongitude?.value,
            latitude: latitude,
            longitude: longitude
        ), ActivityGeofence.fueraDeZona(distancia, radioM: radio) else { return nil }
        return ActivityGeofence.mensajeSalidaFueraDeZona(distancia: distancia, radioM: radio)
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
            if let blocked = await exitZoneMessage(latitude: coords?.latitude, longitude: coords?.longitude) {
                exitBlocked = blocked
                geofenceRefresh += 1
                return
            }
        }
        camera = CameraRequest(step: CoreEvidence.exitPhoto)
    }

    /// - Parameter justificacionOrden: solo la foto de entrada, y solo cuando hubo
    ///   salto de prioridad y la persona quiso explicarlo (contrato B).
    @MainActor
    private func sendGeoPhoto(
        step: String,
        photo: CapturedGeoPhoto,
        justificacionOrden: String? = nil
    ) async -> String? {
        guard let coords = photo.coords else { return GeoPhotoCaptureView.locationError }
        let isExit = step == CoreEvidence.exitPhoto
        // La salida se mide con la misma ubicación que viaja en la foto, como el API.
        if isExit, let blocked = await exitZoneMessage(latitude: coords.latitude, longitude: coords.longitude) {
            exitBlocked = blocked
            geofenceRefresh += 1
            return blocked
        }
        busy = true
        defer { busy = false }
        let payload = GeoPhotoPayload(
            photoUrl: photo.dataUrl,
            latitude: coords.latitude,
            longitude: coords.longitude,
            mockLocation: coords.mock
        )
        let correction = isCorrection
        do {
            let saved: EvidenceFlowState?
            if step == CoreEvidence.entryPhoto {
                saved = try await CoreRepository.shared.submitEntryPhoto(
                    activityId: activityId,
                    photo: payload,
                    correction: correction,
                    justificacionOrden: justificacionOrden
                )
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

    /// Evidencia por campos: la foto de un campo en un momento. El API responde
    /// con todos los campos y esa lista reemplaza la local; sin conexión el hueco
    /// se marca igual para que no se vuelva a tomar la misma foto.
    @MainActor
    private func sendCampoPhoto(campoId: Int, momento: String, photo: CapturedGeoPhoto) async -> String? {
        busy = true
        defer { busy = false }
        do {
            let respuesta = try await CoreRepository.shared.submitCampoPhoto(
                activityId: activityId,
                campoId: campoId,
                momento: momento,
                photoUrl: photo.dataUrl,
                latitude: photo.coords?.latitude,
                longitude: photo.coords?.longitude,
                capturedAt: CoreFormat.isoString(photo.capturedAt)
            )
            campos = CoreEvidence.camposAfterPhoto(
                campos,
                respuesta: respuesta,
                campoId: campoId,
                momento: momento,
                localUrl: photo.dataUrl
            )
            campoThumbs[campoSlotKey(campoId, momento)] = photo.image
            errorText = nil
            if respuesta == nil {
                message = CoreError.queuedOffline.errorDescription
            } else {
                message = "Foto guardada · \(CoreEvidence.momentoLabel(momento))"
            }
            camera = nil
            onChanged?()
            return nil
        } catch {
            return error.toUserMessage(fallback: "No se pudo guardar la foto del campo")
        }
    }

    /// Foto de evidencia libre («fotos en sitio», sin campos): se manda de inmediato, igual que
    /// `sendCampoPhoto`. Antes solo se acumulaba en `pendingPhotos` (memoria) y se perdía si la
    /// persona salía de la pantalla o la app moría en segundo plano antes de tocar «enviar».
    @MainActor
    private func sendEvidencePhoto(_ photo: CapturedGeoPhoto) async -> String? {
        busy = true
        defer { busy = false }
        let geo = photo.coords.map {
            PhotoGeoPayload(latitude: $0.latitude, longitude: $0.longitude, capturedAt: CoreFormat.isoString(photo.capturedAt))
        }
        do {
            let saved = try await CoreRepository.shared.addEvidencePhotoDraft(
                activityId: activityId,
                photoUrl: photo.dataUrl,
                geo: geo
            )
            pendingPhotos.append(photo)
            errorText = nil
            if saved == nil {
                // En cola sin conexión: no está en el GET todavía, pero sí sobrevive un reinicio
                // de la app (la cola de ApiClient queda en disco).
                confirmedPhotoURLs.append(photo.dataUrl)
                message = CoreError.queuedOffline.errorDescription
            } else {
                confirmedPhotoURLs = saved?.photoList ?? confirmedPhotoURLs + [photo.dataUrl]
                message = "Foto agregada (\(confirmedPhotoURLs.count) de \(photoRequired))"
            }
            return nil
        } catch {
            return error.toUserMessage(fallback: "No se pudo guardar la foto")
        }
    }

    /// Quita una foto en borrador — ya viajó al servidor, hay que avisarle también. El índice del
    /// servidor es el de `pendingPhotos` corrido por las que se recuperaron de un intento anterior
    /// (esas van primero en `confirmedPhotoURLs`).
    @MainActor
    private func removeDraftPhoto(_ photo: CapturedGeoPhoto) async {
        guard let localIndex = pendingPhotos.firstIndex(where: { $0.id == photo.id }) else { return }
        let recoveredCount = max(0, confirmedPhotoURLs.count - pendingPhotos.count)
        let serverIndex = recoveredCount + localIndex
        await removeConfirmedPhoto(at: serverIndex, local: photo)
    }

    /// Empareja una URL confirmada con la miniatura local de esta sesión (si la hay).
    private func pendingPhotoMatching(url: String, index: Int) -> CapturedGeoPhoto? {
        if let exact = pendingPhotos.first(where: { $0.dataUrl == url }) { return exact }
        // Tras el draft el servidor devuelve `/uploads/…`, no el data URL: las locales van al final.
        let recoveredCount = max(0, confirmedPhotoURLs.count - pendingPhotos.count)
        let localIndex = index - recoveredCount
        guard localIndex >= 0, localIndex < pendingPhotos.count else { return nil }
        return pendingPhotos[localIndex]
    }

    @MainActor
    private func removeConfirmedPhoto(at serverIndex: Int, local: CapturedGeoPhoto?) async {
        guard serverIndex >= 0, serverIndex < confirmedPhotoURLs.count else { return }
        busy = true
        defer { busy = false }
        do {
            let saved = try await CoreRepository.shared.removeEvidencePhoto(activityId: activityId, index: serverIndex)
            if let local {
                pendingPhotos.removeAll { $0.id == local.id }
            }
            if let saved {
                confirmedPhotoURLs = saved.photoList
            } else {
                confirmedPhotoURLs.remove(at: serverIndex)
            }
            errorText = nil
        } catch {
            errorText = error.toUserMessage(fallback: "No se pudo quitar la foto")
        }
    }

    @MainActor
    private func sendEvidencePhotos() async {
        if porCampos {
            let faltan = CoreEvidence.missingCampoPhotos(campos)
            guard faltan == 0 else {
                errorText = faltan == 1 ? "Falta 1 foto por campo." : "Faltan \(faltan) fotos por campo."
                return
            }
        } else {
            guard confirmedPhotoURLs.count >= photoRequired else {
                errorText = "Se requieren al menos \(photoRequired) fotos de evidencia."
                return
            }
        }
        busy = true
        defer { busy = false }
        // Con campos se manda la lista vacía: el API ya las tiene por campo, y
        // reenviarlas las guardaba otra vez como fotos libres (salían dobles en el ZIP).
        // Sin campos, las fotos libres ya viajaron una a una (`addEvidencePhotoDraft`): aquí solo
        // se reenvía la lista ya confirmada, para que el API valide el mínimo y avance el paso.
        var urls: [String] = []
        var geo: [PhotoGeoPayload?] = []
        if !porCampos {
            urls = confirmedPhotoURLs
            // Las recuperadas de un intento anterior no traen geo (el GET no la incluye); las de
            // esta sesión sí, y van al final porque `confirmedPhotoURLs` se llena en ese orden.
            let recoveredCount = max(0, confirmedPhotoURLs.count - pendingPhotos.count)
            geo = Array(repeating: nil, count: recoveredCount) + pendingPhotos.map { photo -> PhotoGeoPayload? in
                guard let coords = photo.coords else { return nil }
                return PhotoGeoPayload(
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    capturedAt: CoreFormat.isoString(photo.capturedAt)
                )
            }
        }
        let correction = isCorrection
        do {
            let saved = try await CoreRepository.shared.submitEvidencePhotos(
                activityId: activityId,
                photos: EvidencePhotosPayload(photoUrls: urls, photoGeo: geo),
                correction: correction
            )
            pendingPhotos = []
            confirmedPhotoURLs = []
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

    // MARK: Adjuntar imagen (no entra ni sale por aquí)

    @MainActor
    private func loadPickedEvidence(_ item: PhotosPickerItem) async {
        defer { imagePickerItem = nil }
        guard let data = try? await item.loadTransferable(type: Data.self) else {
            errorText = "No se pudo leer la foto. Intenta con otra."
            campoAdjunto = nil
            return
        }
        await ingestEvidenceImage(data)
    }

    @MainActor
    private func loadEvidenceFile(_ url: URL) async {
        let started = url.startAccessingSecurityScopedResource()
        defer { if started { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            errorText = "No se pudo leer el archivo."
            campoAdjunto = nil
            return
        }
        await ingestEvidenceImage(data)
    }

    /// Misma compresión que la cámara (`CorePhotoProcessing.jpeg`: 1280 px, JPEG 0.6).
    @MainActor
    private func ingestEvidenceImage(_ data: Data) async {
        if data.starts(with: Data("%PDF".utf8)) {
            errorText = "Esta evidencia solo acepta imagen. El PDF se carga en la hoja de servicio."
            campoAdjunto = nil
            return
        }
        if data.isEmpty {
            errorText = "El archivo está vacío."
            campoAdjunto = nil
            return
        }
        if data.count > 15 * 1024 * 1024 {
            errorText = "La imagen pesa más de 15 MB. Elige una más pequeña."
            campoAdjunto = nil
            return
        }
        guard let image = UIImage(data: data) else {
            errorText = "No se pudo leer la imagen. Usa JPG o PNG."
            campoAdjunto = nil
            return
        }
        var jpeg = CorePhotoProcessing.jpeg(from: image)
        if let actual = jpeg, actual.count > 5 * 1024 * 1024 {
            jpeg = CorePhotoProcessing.jpeg(from: image, quality: 0.35)
        }
        guard let jpeg, jpeg.count <= 5 * 1024 * 1024 else {
            errorText = "La imagen sigue pesando más de 5 MB después de comprimirla."
            campoAdjunto = nil
            return
        }
        busy = true
        let coords = await ubicacionSiHayPermiso()
        let limpio: DeviceCoords? = {
            guard let coords, !(coords.latitude == 0 && coords.longitude == 0) else { return nil }
            return coords
        }()
        let photo = CapturedGeoPhoto(
            image: UIImage(data: jpeg) ?? image,
            jpeg: jpeg,
            coords: limpio,
            capturedAt: Date()
        )
        if let destino = campoAdjunto {
            campoAdjunto = nil
            busy = false
            if let fallo = await sendCampoPhoto(campoId: destino.id, momento: destino.momento, photo: photo) {
                errorText = fallo
            }
        } else {
            busy = false
            if let fallo = await sendEvidencePhoto(photo) {
                errorText = fallo
            }
        }
    }

    /// Si no hay permiso, la evidencia se guarda sin GPS. No pide el permiso ni falla.
    @MainActor
    private func ubicacionSiHayPermiso() async -> DeviceCoords? {
        guard DeviceLocation.shared.hasPermission else { return nil }
        return await DeviceLocation.shared.current()
    }
}
