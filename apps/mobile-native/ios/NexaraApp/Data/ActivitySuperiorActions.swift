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

struct ActivitySuperiorActions: Decodable {
    /// Mínimo del motivo si el API no lo manda (`MOTIVO_MINIMO`).
    static let motivoMinimoPorOmision = 10

    let puedeCancelar: Bool
    let puedePasar: Bool
    let personas: [ActivitySuperiorPerson]
    let cerrada: Bool
    let estatus: String?
    let motivoMinimo: Int

    var hayAlgo: Bool { !cerrada && (puedeCancelar || puedePasar) }

    private enum CodingKeys: String, CodingKey {
        case puedeCancelar, puedePasar, personas, cerrada, estatus, motivoMinimo
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
    }
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
