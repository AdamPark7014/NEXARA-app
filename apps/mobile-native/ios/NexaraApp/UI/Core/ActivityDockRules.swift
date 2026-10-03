import Foundation

/// Dock inferior y lista de pasos del detalle de actividad (rediseño v2,
/// `.ai/ui-maquetas/movil-actividad-ios.png`). Espejo de `ActivityDockRules.kt`.
///
/// Decide QUÉ dice el botón grande al alcance del pulgar y cómo va cada paso de
/// evidencia (hecho · actual · pendiente). No captura nada: la cámara, el PDF y
/// el formulario siguen en `EvidenceCaptureFlowView`; el dock solo lleva ahí.
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
        /// Con el reloj corriendo pero sin captura propia: solo «Pausar».
        case pausar
    }

    struct Dock: Equatable {
        let kind: Kind
        let label: String
        /// Una línea bajo el dock: qué falta o qué pasa al tocar.
        let hint: String?
        /// Se ofrece «Pausar» como secundaria.
        let pausable: Bool

        var systemImage: String? {
            switch kind {
            case .iniciar, .reanudar: return "play.fill"
            case .evidencias: return "camera"
            case .ver: return "doc.text.magnifyingglass"
            case .pausar: return "pause"
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

        var systemImage: String {
            switch step {
            case CoreEvidence.entryPhoto: return "arrow.down.to.line"
            case CoreEvidence.exitPhoto: return "arrow.up.to.line"
            case CoreEvidence.serviceSheetPdf: return "doc.richtext"
            case CoreEvidence.serviceSheetData: return "list.clipboard"
            default: return "camera"
            }
        }
    }

    /// ¿Se ofrece «Iniciar actividad»? Mismo criterio que `MyActivityItem.puedeIniciar`
    /// y `ActivitySemaforo.puedeIniciar` de Android, con la fila propia del detalle.
    static func puedeIniciar(aceptacion: String?, inicioRealAt: String?, despachador: Bool, estatus: String?) -> Bool {
        guard let aceptacion, !aceptacion.isEmpty else { return false }
        if despachador { return false }
        if SesionActividad.cerrada(estatus) { return false }
        return (inicioRealAt ?? "").isEmpty
    }

    /// Acción principal del dock. `nil` = sin dock (cerrada, o quien mira no ejecuta).
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
                hint: sesion.textoPausa(propia: true) ?? SesionActividad.ayudaReanudar,
                pausable: false
            )
        }
        let pausable = sesion.map { !despachador && $0.puedePausar(estatus: estatus) } ?? false
        guard captura else {
            if pausable, let sesion {
                return Dock(kind: .pausar, label: "Pausar actividad", hint: sesion.textoCorriendo, pausable: false)
            }
            return nil
        }
        let step = flow?.status ?? CoreEvidence.entryPhoto
        if flow?.isLocked == true {
            return Dock(
                kind: .ver,
                label: "Ver evidencias",
                hint: flow?.reviewStatus == "APPROVED" ? "Tu evidencia fue aprobada." : "Enviada: tu superior la aprueba o te la devuelve.",
                pausable: false
            )
        }
        let correccion = flow?.isCorrection == true
        let steps = CoreEvidence.steps(for: coreKind)
        let campos = flow?.campos ?? []
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
            hint = CoreEvidence.exitBlockedByCampos(campos) ?? "Con la foto de salida mandas la actividad a revisión."
        default:
            if let i = steps.firstIndex(of: step) {
                hint = "Paso \(i + 1) de \(steps.count)"
            } else {
                hint = nil
            }
        }
        return Dock(kind: .evidencias, label: correccion ? "Corregir · \(label)" : label, hint: hint, pausable: pausable)
    }

    /// Pasos de evidencia para la lista del detalle. Sin flujo = nada empezado:
    /// todo pendiente salvo el primero, que es el actual.
    static func pasos(flow: EvidenceFlowState?, coreKind: String?, fotosRequeridas: Int) -> [Paso] {
        let steps = CoreEvidence.steps(for: coreKind)
        let current = flow?.status ?? CoreEvidence.entryPhoto
        let locked = flow?.isLocked == true
        let rejected = flow?.rejectedList ?? []
        let correccion = flow?.isCorrection == true
        let campos = flow?.campos ?? []
        let fotos = flow?.photoList.count ?? 0
        return steps.map { s in
            let done: Bool
            if s == CoreEvidence.evidencePhotos {
                done = (flow?.isDone(s) ?? false) || (!campos.isEmpty && CoreEvidence.camposDone(campos))
            } else {
                done = flow?.isDone(s) ?? false
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
            } else if correccion && rejected.contains(s) {
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
}
