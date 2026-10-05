import Foundation

/// Dock inferior y lista de pasos del detalle de actividad (rediseño v2).
/// Espejo regla por regla de `ActivityDockRules.kt` de Android.
///
/// Decide QUÉ dice el botón grande al alcance del pulgar y cómo va cada paso de
/// evidencia (hecho · actual · pendiente). No captura nada: la cámara, el PDF y
/// el formulario siguen en `EvidenceCaptureFlowView`; el dock solo lleva ahí o,
/// cuando ese flujo está en pantalla, repite su botón (`EvidenceDockAction`).
enum ActivityDockRules {

    enum Kind: Equatable {
        /// `me/activities/:id/iniciar`: marca la hora real y abre Evidencias.
        case iniciar
        /// `me/activities/:id/reanudar`.
        case reanudar
        /// Abre la pestaña Evidencias en el paso actual.
        case evidencias
        /// Enviada o aprobada: solo consultar.
        case ver
    }

    struct Dock: Equatable {
        let kind: Kind
        let label: String
        /// Una línea bajo el dock: qué falta o qué pasa al tocar.
        let hint: String?
        /// Se ofrece «Pausar» como secundaria.
        let pausable: Bool

        /// Icono del botón (Android: PlayArrow · PHOTO · sin icono en «Ver evidencias»).
        var systemImage: String? {
            switch kind {
            case .iniciar, .reanudar: return "play.fill"
            case .evidencias: return "camera"
            case .ver: return nil
            }
        }
    }

    enum PasoEstado: Equatable { case hecho, actual, pendiente }

    struct Paso: Equatable, Identifiable {
        let step: String
        let label: String
        let estado: PasoEstado
        let detalle: String
        var id: String { step }

        /// Icono del paso (Android `glyphFor`: ENTRY · EXIT · PROCEDURE · DOCUMENTATION · PHOTO).
        var systemImage: String { ActivityDockRules.glyph(for: step) }
    }

    /// SF Symbol equivalente al `NxGlyph` de cada paso en Android.
    static func glyph(for step: String) -> String {
        switch step {
        case CoreEvidence.entryPhoto: return "arrow.right.to.line"
        case CoreEvidence.exitPhoto: return "rectangle.portrait.and.arrow.right"
        case CoreEvidence.serviceSheetPdf: return "doc.text"
        case CoreEvidence.serviceSheetData: return "square.and.pencil"
        default: return "camera"
        }
    }

    /// Fotos en sitio que pide la actividad. Mismo rango que el API
    /// (`clampEvidencePhotoRequired`: 2 a 8, 4 por omisión). El API ya las guarda
    /// así al crear la actividad, por eso coincide con Android (`?: 4`, mínimo 1).
    static func fotosRequeridas(_ raw: Int?) -> Int {
        min(8, max(2, raw ?? 4))
    }

    /// ¿Se ofrece «Iniciar actividad»? `ActivitySemaforo.puedeIniciar` de Android:
    /// mientras no tenga hora real de inicio, aunque la hubiera aceptado o rechazado
    /// antes de la regla del 18-09. No a quien solo reparte un despacho ni a lo cerrado.
    /// Sin `aceptacion` (API anterior al contrato) no se sabe: la foto de entrada
    /// sigue marcando el inicio como siempre.
    static func puedeIniciar(aceptacion: String?, inicioRealAt: String?, despachador: Bool, estatus: String?) -> Bool {
        let acepta = (aceptacion ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if acepta.isEmpty { return false }
        if despachador { return false }
        if SesionActividad.cerrada(estatus) { return false }
        return (inicioRealAt ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// ¿Hay algo que pausar? (`pausable` del detalle de Android): mi reloj corre,
    /// no solo reparto y la actividad sigue abierta.
    static func pausable(sesion: SesionActividad?, despachador: Bool, estatus: String?) -> Bool {
        guard let sesion else { return false }
        return !despachador && sesion.puedePausar(estatus: estatus)
    }

    /// Acción principal del dock en las pestañas Detalle e Historial. En Evidencias
    /// la manda el propio flujo de captura. `nil` = sin dock (cerrada, o quien mira
    /// no ejecuta ni puede iniciar); el detalle decide entonces si ofrece
    /// «Pausar actividad» sola, igual que Android.
    static func principal(
        puedeIniciar: Bool,
        sesion: SesionActividad?,
        despachador: Bool,
        estatus: String?,
        captura: Bool,
        flow: EvidenceFlowState?,
        coreKind: String?,
        fotosRequeridas: Int
    ) -> Dock? {
        if SesionActividad.cerrada(estatus) { return nil }
        if puedeIniciar {
            return Dock(kind: .iniciar, label: MyActivityItem.accionIniciar, hint: "Queda registrada tu hora real de inicio.", pausable: false)
        }
        if let sesion, sesion.puedeReanudar(despachador: despachador, estatus: estatus) {
            return Dock(
                kind: .reanudar,
                label: "Reanudar actividad",
                hint: sesion.textoPausa(propia: true) ?? "Tu reloj vuelve a correr.",
                pausable: false
            )
        }
        guard captura else { return nil }
        let pausable = pausable(sesion: sesion, despachador: despachador, estatus: estatus)
        let step = flow?.status ?? CoreEvidence.entryPhoto
        let reviewStatus = flow?.reviewStatus
        if isEvidenceLocked(status: step, reviewStatus: reviewStatus) {
            return Dock(
                kind: .ver,
                label: "Ver evidencias",
                hint: reviewStatus == "APPROVED" ? "Tu evidencia fue aprobada." : "Enviada: tu superior la aprueba o te la devuelve.",
                pausable: false
            )
        }
        let correccion = reviewStatus == "REJECTED"
        let steps = CoreEvidence.steps(for: coreKind)
        let campos = CoreEvidence.ordered(flow?.campos)
        let porCampos = !campos.isEmpty
        let fotos = flow?.photoList.count ?? 0
        let faltan = max(0, fotosRequeridas - fotos)
        let comercial = CoreEvidence.isComercial(coreKind)
        let label: String
        switch step {
        case CoreEvidence.entryPhoto:
            label = comercial ? "Tomar foto de inicio" : "Tomar foto de entrada"
        case CoreEvidence.evidencePhotos:
            if porCampos { label = "Fotos por campo" }
            else if faltan > 0 { label = "Tomar fotos · \(fotos) de \(fotosRequeridas)" }
            else { label = "Enviar fotos · \(fotos) de \(fotosRequeridas)" }
        case CoreEvidence.serviceSheetPdf:
            label = "Cargar hoja de servicio"
        case CoreEvidence.serviceSheetData:
            label = "Llenar formulario"
        case CoreEvidence.exitPhoto:
            label = comercial ? "Tomar foto de conclusión" : "Tomar foto de salida"
        default:
            label = "Continuar evidencias"
        }
        let numero = (steps.firstIndex(of: step) ?? -1) + 1
        let hint: String?
        switch step {
        case CoreEvidence.evidencePhotos:
            if porCampos {
                hint = CoreEvidence.exitBlockedByCampos(campos) ?? "Ya documentaste todos los campos: sigue al siguiente paso."
            } else if faltan > 0 {
                hint = "Faltan \(faltan) foto\(faltan == 1 ? "" : "s") para seguir."
            } else {
                hint = "Ya tienes las fotos: envíalas para seguir."
            }
        case CoreEvidence.exitPhoto:
            hint = "Con la foto de salida mandas la actividad a revisión."
        default:
            hint = numero > 0 ? "Paso \(numero) de \(steps.count)" : nil
        }
        return Dock(kind: .evidencias, label: correccion ? "Corregir · \(label)" : label, hint: hint, pausable: pausable)
    }

    /// Pasos de evidencia para la lista del detalle. Sin flujo = nada empezado:
    /// todo pendiente salvo el primero, que es el actual.
    static func pasos(flow: EvidenceFlowState?, coreKind: String?, fotosRequeridas: Int) -> [Paso] {
        let steps = CoreEvidence.steps(for: coreKind)
        let current = flow?.status ?? CoreEvidence.entryPhoto
        let reviewStatus = flow?.reviewStatus
        let locked = isEvidenceLocked(status: current, reviewStatus: reviewStatus)
        let rejected = flow?.rejectedList ?? []
        let campos = CoreEvidence.ordered(flow?.campos)
        let fotos = flow?.photoList.count ?? 0
        return steps.map { s in
            let done: Bool
            switch s {
            case CoreEvidence.entryPhoto:
                done = hasText(flow?.entryPhotoUrl)
            case CoreEvidence.evidencePhotos:
                done = !(flow?.photoList.isEmpty ?? true) || (!campos.isEmpty && CoreEvidence.camposDone(campos))
            case CoreEvidence.serviceSheetPdf:
                done = hasText(flow?.serviceSheetPdfUrl)
            case CoreEvidence.serviceSheetData:
                done = flow?.serviceSheetData != nil
            default:
                done = hasText(flow?.exitPhotoUrl)
            }
            let estado: PasoEstado
            if locked { estado = .hecho }
            else if s == current { estado = .actual }
            else if done { estado = .hecho }
            else { estado = .pendiente }

            let detalle: String
            if locked && s == CoreEvidence.exitPhoto {
                detalle = "Enviada a revisión"
            } else if estado == .hecho && s == CoreEvidence.evidencePhotos {
                detalle = campos.isEmpty ? "\(fotos) foto\(fotos == 1 ? "" : "s")" : "Campos completos"
            } else if estado == .hecho {
                detalle = "Listo"
            } else if rejected.contains(s) && reviewStatus == "REJECTED" {
                detalle = "Por corregir"
            } else if estado == .actual && s == CoreEvidence.evidencePhotos {
                detalle = campos.isEmpty ? "\(fotos) de \(fotosRequeridas) fotos" : CoreEvidence.camposSummary(campos)
            } else if estado == .actual {
                detalle = "Sigue"
            } else {
                detalle = "Pendiente"
            }
            return Paso(step: s, label: CoreEvidence.label(s, coreKind: coreKind), estado: estado, detalle: detalle)
        }
    }

    /// «3 de 5» del encabezado de la lista de pasos.
    static func hechos(_ pasos: [Paso]) -> Int { pasos.filter { $0.estado == .hecho }.count }

    /// Enviada y sin devolución: ya no se toca hasta que la revisen
    /// (`CoreActivityRules.isEvidenceLocked`).
    static func isEvidenceLocked(status: String?, reviewStatus: String?) -> Bool {
        reviewStatus != "REJECTED" && status == CoreEvidence.completed
    }

    private static func hasText(_ value: String?) -> Bool {
        !(value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
