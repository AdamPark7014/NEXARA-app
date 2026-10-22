import Foundation

// Acciones de superior sobre una actividad: «Cancelar actividad» y «Pasar a otro
// compañero», las dos con motivo. Espejo de `GET activities/:id/acciones`
// (`activity-team.service.ts › superiorActions`) y de `ActivitySuperiorActions.tsx`
// de la web. La app solo esconde lo que no aplica: el API vuelve a validar al guardar.

/// Persona cuyo lugar puede pasar a otro compañero quien consulta.
struct ActivitySuperiorPerson: Decodable, Identifiable, Hashable {
    let userId: Int
    let nombre: String
    /// LEAD | TECNICO | APOYO
    let rol: String?
    let responsable: Bool
    let ejecuta: Bool

    var id: Int { userId }

    /// «Ana López · responsable», «Luis · apoyo» (mismas etiquetas que la web).
    var etiqueta: String {
        if responsable { return "\(nombre) · responsable" }
        if (rol ?? "").uppercased() == "APOYO" { return "\(nombre) · apoyo" }
        return nombre
    }

    private enum CodingKeys: String, CodingKey {
        case userId, nombre, rol, responsable, ejecuta
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        userId = try container.decode(Int.self, forKey: .userId)
        let name = ((try? container.decode(String.self, forKey: .nombre)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        nombre = name.isEmpty ? "Sin nombre" : name
        rol = try? container.decode(String.self, forKey: .rol)
        responsable = (try? container.decode(Bool.self, forKey: .responsable)) ?? false
        ejecuta = (try? container.decode(Bool.self, forKey: .ejecuta)) ?? false
    }
}

/// Causa del catálogo de incumplimiento: `clave` para el API, `etiqueta` para la gente.
struct ActivityNonComplianceCause: Decodable, Identifiable, Hashable {
    let clave: String
    let etiqueta: String

    var id: String { clave }

    /// Respaldo si el API no manda el catálogo; la primera es la del cierre de jornada.
    static let catalogo: [ActivityNonComplianceCause] = [
        ActivityNonComplianceCause(clave: "SIN_ENTREGA", etiqueta: "Sin entrega al cierre de la jornada"),
        ActivityNonComplianceCause(clave: "MATERIAL", etiqueta: "Falta de material, herramienta o equipo"),
        ActivityNonComplianceCause(clave: "ACCESO", etiqueta: "Sin acceso al sitio o cliente no disponible"),
        ActivityNonComplianceCause(clave: "PERSONAL", etiqueta: "Personal asignado no disponible"),
        ActivityNonComplianceCause(clave: "PLANEACION", etiqueta: "Alcance o tiempo mal planeado"),
        ActivityNonComplianceCause(clave: "CALIDAD", etiqueta: "La entrega no cumple lo solicitado"),
        ActivityNonComplianceCause(clave: "OTRA", etiqueta: "Otra causa"),
    ]

    /// Etiqueta del catálogo local; «Otra causa» si la clave no se conoce.
    static func etiquetaDe(_ clave: String?) -> String {
        let k = (clave ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return catalogo.first { $0.clave == k }?.etiqueta ?? "Otra causa"
    }

    init(clave: String, etiqueta: String) {
        self.clave = clave
        self.etiqueta = etiqueta
    }

    private enum CodingKeys: String, CodingKey {
        case clave, etiqueta
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let key = ((try? container.decode(String.self, forKey: .clave)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let label = ((try? container.decode(String.self, forKey: .etiqueta)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        clave = key
        etiqueta = label.isEmpty ? Self.etiquetaDe(key) : label
    }
}

struct ActivitySuperiorActions: Decodable {
    /// Mínimo del motivo si el API no lo manda (`MOTIVO_MINIMO`).
    static let motivoMinimoPorOmision = 10

    let puedeCancelar: Bool
    let puedePasar: Bool
    let personas: [ActivitySuperiorPerson]
    let cerrada: Bool
    let estatus: String?
    let motivoMinimo: Int
    /// «Registrar incumplimiento» (los mismos superiores que pueden cancelar).
    let puedeRegistrarIncumplimiento: Bool
    /// Llega con la actividad cerrada como «No cumplida»: reprogramar la reabre.
    let puedeReprogramar: Bool
    /// Catálogo del API sin claves vacías, o el de respaldo.
    let causasIncumplimiento: [ActivityNonComplianceCause]

    // Cerrada solo deja «Reprogramar» (Android `ActivitySuperiorRules.botones`).
    var muestraPasar: Bool { !cerrada && puedePasar }
    var muestraCancelar: Bool { !cerrada && puedeCancelar }
    var muestraNoCumplida: Bool { !cerrada && puedeRegistrarIncumplimiento }
    var muestraReprogramar: Bool { puedeReprogramar }

    var hayAlgo: Bool { muestraPasar || muestraCancelar || muestraNoCumplida || muestraReprogramar }

    private enum CodingKeys: String, CodingKey {
        case puedeCancelar, puedePasar, personas, cerrada, estatus, motivoMinimo
        case puedeRegistrarIncumplimiento, puedeReprogramar, causasIncumplimiento
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        puedeCancelar = (try? container.decode(Bool.self, forKey: .puedeCancelar)) ?? false
        personas = (try? container.decode([ActivitySuperiorPerson].self, forKey: .personas)) ?? []
        puedePasar = ((try? container.decode(Bool.self, forKey: .puedePasar)) ?? false) && !personas.isEmpty
        cerrada = (try? container.decode(Bool.self, forKey: .cerrada)) ?? false
        estatus = try? container.decode(String.self, forKey: .estatus)
        let minimo = (try? container.decode(Int.self, forKey: .motivoMinimo)) ?? Self.motivoMinimoPorOmision
        motivoMinimo = max(1, minimo)
        // API vieja: sin estos campos se ve igual que antes.
        puedeRegistrarIncumplimiento = (try? container.decode(Bool.self, forKey: .puedeRegistrarIncumplimiento)) ?? false
        puedeReprogramar = (try? container.decode(Bool.self, forKey: .puedeReprogramar)) ?? false
        let delApi = ((try? container.decode([ActivityNonComplianceCause].self, forKey: .causasIncumplimiento)) ?? [])
            .filter { !$0.clave.isEmpty }
        var vistas = Set<String>()
        let unicas = delApi.filter { vistas.insert($0.clave).inserted }
        causasIncumplimiento = unicas.isEmpty ? ActivityNonComplianceCause.catalogo : unicas
    }
}

// MARK: - No cumplida (detalle `incumplimiento`)

/// Último registro de «No cumplida» del detalle (`GET activities/:id › incumplimiento`).
/// Sigue llegando aunque se haya reprogramado: entonces es historial, no el estado actual.
/// El detalle de iOS es un mapa crudo, así que se arma desde el diccionario.
struct ActivityNonCompliance {
    /// CIERRE_JORNADA | MANUAL
    let origen: String
    let causa: String
    let causaEtiqueta: String
    let observaciones: String?
    let registradoAt: String?
    /// Vacío = lo cerró el sistema al terminar la jornada.
    let registradoPor: String
    /// Quienes no entregaron.
    let pendientes: [String]
    let reprogramadaAt: String?
    let reprogramadaPara: String?
    let reprogramadaPor: String
    let motivoReprogramacion: String?

    /// `nil` si el detalle no trae registro (API vieja o nunca se incumplió).
    init?(map value: Any?) {
        guard let m = value as? [String: Any] else { return nil }
        func texto(_ key: String) -> String? {
            let s = ActivityParse.str(m[key]).trimmingCharacters(in: .whitespacesAndNewlines)
            return s.isEmpty ? nil : s
        }
        func nombre(_ key: String) -> String {
            ActivityParse.str((m[key] as? [String: Any])?["nombre"]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let clave = texto("causa") ?? ""
        origen = texto("origen") ?? ""
        causa = clave
        causaEtiqueta = texto("causaEtiqueta") ?? (clave.isEmpty ? "" : ActivityNonComplianceCause.etiquetaDe(clave))
        observaciones = texto("observaciones")
        registradoAt = texto("registradoAt")
        registradoPor = nombre("registradoPor")
        var vistos = Set<String>()
        pendientes = ((m["pendientes"] as? [[String: Any]]) ?? [])
            .map { ActivityParse.str($0["nombre"]).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && vistos.insert($0).inserted }
        reprogramadaAt = texto("reprogramadaAt")
        reprogramadaPara = texto("reprogramadaPara")
        reprogramadaPor = nombre("reprogramadaPor")
        motivoReprogramacion = texto("motivoReprogramacion")
    }

    /// Lo cerró el sistema al terminar la jornada (o no hay quién lo registró).
    var automatica: Bool { origen.uppercased() == "CIERRE_JORNADA" || registradoPor.isEmpty }
}

/// Aviso rojo del detalle de una «No cumplida» (Android `ActivitySuperiorRules.avisoNoCumplida`).
struct ActivityNoCumplidaAviso: Equatable {
    let titulo: String
    let origen: String
    let registradoAt: String?
    let observaciones: String?
    let pendientes: String?
}

/// Aviso «Cancelada por X · motivo» del detalle (`cancelReason` y `cancelledBy.nombre`).
enum ActivityCancelNotice {
    static func text(motivo: String?, canceladaPor: String?) -> String? {
        let reason = (motivo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let by = (canceladaPor ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !reason.isEmpty || !by.isEmpty else { return nil }
        let quien = by.isEmpty ? "Cancelada" : "Cancelada por \(by)"
        return reason.isEmpty ? quien : "\(quien) · \(reason)"
    }
}

// MARK: - Avance anterior (GET activity-evidence/:activityId › avancesAnteriores)

/// Lo que dejó quien tenía la actividad antes de que se la pasaran a esta persona.
/// Solo lectura: quien continúa toma sus propias fotos de entrada y salida.
struct ActivityPreviousProgress: Decodable, Identifiable, Hashable {
    let userId: Int
    let nombre: String
    /// «Avance anterior de <nombre>».
    let titulo: String
    let motivo: String?
    let reasignadaAt: String?
    let movidaPor: String?
    let progressPct: Double
    let evidence: TeamEvidenceData?

    var id: String { "\(userId)-\(reasignadaAt ?? "")" }

    private enum CodingKeys: String, CodingKey {
        case userId, nombre, titulo, motivo, reasignadaAt, movidaPor, progressPct, evidence
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        userId = (try? container.decode(Int.self, forKey: .userId)) ?? 0
        let name = ((try? container.decode(String.self, forKey: .nombre)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        nombre = name.isEmpty ? "un compañero" : name
        let title = ((try? container.decode(String.self, forKey: .titulo)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        titulo = title.isEmpty ? "Avance anterior de \(nombre)" : title
        motivo = try? container.decode(String.self, forKey: .motivo)
        reasignadaAt = try? container.decode(String.self, forKey: .reasignadaAt)
        movidaPor = try? container.decode(String.self, forKey: .movidaPor)
        progressPct = (try? container.decode(FlexDouble.self, forKey: .progressPct))?.value ?? 0
        evidence = try? container.decode(TeamEvidenceData.self, forKey: .evidence)
    }
}

/// Lista tolerante: una entrada que no cuadra se salta sin tumbar el flujo de captura.
struct ActivityPreviousProgressList: Decodable, Hashable {
    let items: [ActivityPreviousProgress]

    init(from decoder: Decoder) throws {
        var list: [ActivityPreviousProgress] = []
        if var container = try? decoder.unkeyedContainer() {
            while !container.isAtEnd {
                if let item = try? container.decode(ActivityPreviousProgress.self) {
                    list.append(item)
                } else if (try? container.decode(JSONValue.self)) == nil {
                    break
                }
            }
        }
        items = list
    }
}
