import Foundation

/// Aprobaciones (workflow) en el teléfono — espejo de
/// `apps/api/src/workflow/workflow.controller.ts` y de `AprobacionesApi.kt` /
/// `AprobacionesRepository.kt` de Android:
///
/// | Pantalla | Endpoint                               |
/// |----------|----------------------------------------|
/// | Bandeja  | `GET workflow/my-pending`              |
/// | Decidir  | `POST workflow/approvals/{id}/decide`  |
///
/// **Permisos.** Los dos piden `workflow.view`, `workflow.manage` o
/// `console.admin`. `decide` además comprueba que quien firma sea el aprobador
/// de **ese** paso; un 403 es una respuesta legítima y se enseña tal cual.
///
/// **No es idempotente.** `decide` exige que la aprobación siga `PENDING`; si
/// no, 400 «Esta aprobación ya fue decidida» (dos directores con el mismo rol
/// ven la misma fila). Por eso la pantalla no borra nada hasta que el servidor
/// confirma, y por eso **no hay cola sin conexión**: una decisión que sale tarde
/// puede llegar cuando otro ya decidió.
///
/// Reglas de los DTO: todo anulable con valor por omisión, y todo importe como
/// texto (un `Decimal` de Prisma llega como número o como cadena).

// MARK: - DTOs

/// Persona del flujo. El servidor usa `nombre`, no `name`.
struct WfPersona: Decodable, Hashable {
    var id: Int?
    var nombre: String?
    var role: WfRol?

    init(id: Int? = nil, nombre: String? = nil, role: WfRol? = nil) {
        self.id = id
        self.nombre = nombre
        self.role = role
    }

    private enum CodingKeys: String, CodingKey { case id, nombre, role }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.wfEntero(.id)
        nombre = try? c.decode(String.self, forKey: .nombre)
        role = try? c.decode(WfRol.self, forKey: .role)
    }
}

struct WfRol: Decodable, Hashable {
    var nombre: String?

    init(nombre: String? = nil) { self.nombre = nombre }

    private enum CodingKeys: String, CodingKey { case nombre }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        nombre = try? c.decode(String.self, forKey: .nombre)
    }
}

/// Un paso de la definición del flujo. El aprobador es **o** un usuario
/// (`approverUser`) **o** un rol (`approverRole`), nunca los dos.
struct WfPaso: Decodable, Hashable {
    var id: Int?
    var stepNumber: Int?
    var name: String?
    var description: String?
    var approverRoleId: Int?
    var approverUserId: Int?
    var approverRole: WfRol?
    var approverUser: WfPersona?

    init(
        id: Int? = nil,
        stepNumber: Int? = nil,
        name: String? = nil,
        approverRole: WfRol? = nil,
        approverUser: WfPersona? = nil
    ) {
        self.id = id
        self.stepNumber = stepNumber
        self.name = name
        self.approverRole = approverRole
        self.approverUser = approverUser
    }

    private enum CodingKeys: String, CodingKey {
        case id, stepNumber, name, description, approverRoleId, approverUserId, approverRole, approverUser
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.wfEntero(.id)
        stepNumber = c.wfEntero(.stepNumber)
        name = try? c.decode(String.self, forKey: .name)
        description = try? c.decode(String.self, forKey: .description)
        approverRoleId = c.wfEntero(.approverRoleId)
        approverUserId = c.wfEntero(.approverUserId)
        approverRole = try? c.decode(WfRol.self, forKey: .approverRole)
        approverUser = try? c.decode(WfPersona.self, forKey: .approverUser)
    }
}

/// La definición del flujo, con su cadena de pasos ya ordenada por el servidor.
struct WfDefinicion: Decodable, Hashable {
    var name: String?
    var entityType: String?
    var steps: [WfPaso]?

    private enum CodingKeys: String, CodingKey { case name, entityType, steps }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try? c.decode(String.self, forKey: .name)
        entityType = try? c.decode(String.self, forKey: .entityType)
        steps = try? c.decode([WfPaso].self, forKey: .steps)
    }
}

/// Una aprobación ya registrada en la instancia: sirve para dibujar la cadena.
struct WfAprobacion: Decodable, Hashable {
    var id: Int = 0
    var stepId: Int?
    var status: String?
    var comments: String?
    var decidedAt: String?
    var createdAt: String?
    var decidedBy: WfPersona?

    private enum CodingKeys: String, CodingKey { case id, stepId, status, comments, decidedAt, createdAt, decidedBy }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.wfEntero(.id) ?? 0
        stepId = c.wfEntero(.stepId)
        status = try? c.decode(String.self, forKey: .status)
        comments = try? c.decode(String.self, forKey: .comments)
        decidedAt = try? c.decode(String.self, forKey: .decidedAt)
        createdAt = try? c.decode(String.self, forKey: .createdAt)
        decidedBy = try? c.decode(WfPersona.self, forKey: .decidedBy)
    }
}

/// La solicitud concreta sobre una entidad (el gasto #482, la cotización #77).
///
/// `amount` y `total` no los manda hoy `my-pending` (el `WorkflowInstance` no
/// guarda importe); se declaran por si el backend los incluye, como en Android.
struct WfInstancia: Decodable, Hashable {
    var id: Int = 0
    var entityId: Int?
    var entityType: String?
    var currentStep: Int?
    var isComplete: Bool = false
    var isCancelled: Bool = false
    var startedAt: String?
    var completedAt: String?
    var workflow: WfDefinicion?
    var startedBy: WfPersona?
    var approvals: [WfAprobacion]?
    var amount: String?
    var total: String?

    private enum CodingKeys: String, CodingKey {
        case id, entityId, entityType, currentStep, isComplete, isCancelled, startedAt, completedAt
        case workflow, startedBy, approvals, amount, total
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.wfEntero(.id) ?? 0
        entityId = c.wfEntero(.entityId)
        entityType = try? c.decode(String.self, forKey: .entityType)
        currentStep = c.wfEntero(.currentStep)
        isComplete = (try? c.decode(Bool.self, forKey: .isComplete)) ?? false
        isCancelled = (try? c.decode(Bool.self, forKey: .isCancelled)) ?? false
        startedAt = try? c.decode(String.self, forKey: .startedAt)
        completedAt = try? c.decode(String.self, forKey: .completedAt)
        workflow = try? c.decode(WfDefinicion.self, forKey: .workflow)
        startedBy = try? c.decode(WfPersona.self, forKey: .startedBy)
        approvals = try? c.decode([WfAprobacion].self, forKey: .approvals)
        amount = c.wfTexto(.amount)
        total = c.wfTexto(.total)
    }
}

/// De qué es y de cuánto (`resumen` de `listMyPending`, armado por
/// `apps/api/src/workflow/entity-summary.ts`). Ausente en API antiguos y en
/// tipos sin resumen (vacaciones, contratación…).
struct WfResumen: Decodable, Hashable {
    var titulo: String?
    var detalle: String?
    /// Importe en la moneda de la entidad; `nil` si el tipo no lo tiene.
    var monto: String?
    var moneda: String?

    private enum CodingKeys: String, CodingKey { case titulo, detalle, monto, moneda }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        titulo = try? c.decode(String.self, forKey: .titulo)
        detalle = try? c.decode(String.self, forKey: .detalle)
        monto = c.wfTexto(.monto)
        moneda = try? c.decode(String.self, forKey: .moneda)
    }
}

/// Una fila de `GET workflow/my-pending`: tu paso pendiente y su instancia.
struct AprobacionPendiente: Decodable, Hashable {
    var id: Int = 0
    var stepId: Int?
    var status: String?
    var comments: String?
    var createdAt: String?
    var step: WfPaso?
    var instance: WfInstancia?
    var resumen: WfResumen?

    private enum CodingKeys: String, CodingKey { case id, stepId, status, comments, createdAt, step, instance, resumen }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.wfEntero(.id) ?? 0
        stepId = c.wfEntero(.stepId)
        status = try? c.decode(String.self, forKey: .status)
        comments = try? c.decode(String.self, forKey: .comments)
        createdAt = try? c.decode(String.self, forKey: .createdAt)
        step = try? c.decode(WfPaso.self, forKey: .step)
        instance = try? c.decode(WfInstancia.self, forKey: .instance)
        resumen = try? c.decode(WfResumen.self, forKey: .resumen)
    }
}

/// Respuesta del `decide`. Tres formas que no significan lo mismo:
///  · rechazo               → `{ decided, complete: true, cancelled: true }`
///  · aprobado, quedan pasos → `{ decided, complete: false, nextStep: N }`
///  · aprobado y cerrado     → `{ decided, complete: true }`
struct DecisionRespuesta: Decodable, Hashable {
    var decided: Bool = false
    var complete: Bool = false
    var cancelled: Bool = false
    var nextStep: Int?

    init(decided: Bool = false, complete: Bool = false, cancelled: Bool = false, nextStep: Int? = nil) {
        self.decided = decided
        self.complete = complete
        self.cancelled = cancelled
        self.nextStep = nextStep
    }

    private enum CodingKeys: String, CodingKey { case decided, complete, cancelled, nextStep }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        decided = (try? c.decode(Bool.self, forKey: .decided)) ?? false
        complete = (try? c.decode(Bool.self, forKey: .complete)) ?? false
        cancelled = (try? c.decode(Bool.self, forKey: .cancelled)) ?? false
        nextStep = c.wfEntero(.nextStep)
    }
}

fileprivate extension KeyedDecodingContainer {
    /// Importe como texto, llegue como número JSON o como cadena.
    func wfTexto(_ key: Key) -> String? {
        if let texto = try? decode(String.self, forKey: key) { return texto }
        if let entero = try? decode(Int.self, forKey: key) { return String(entero) }
        if let doble = try? decode(Double.self, forKey: key), doble.isFinite { return String(doble) }
        return nil
    }

    func wfEntero(_ key: Key) -> Int? {
        if let entero = try? decode(Int.self, forKey: key) { return entero }
        if let texto = try? decode(String.self, forKey: key) {
            return Int(texto.trimmingCharacters(in: .whitespaces))
        }
        return nil
    }
}

// MARK: - Repositorio

/// Aprobaciones de Core: cargar la bandeja y decidir. Lo demás del flujo
/// —definir pasos, elegir aprobadores— sigue en la computadora.
final class AprobacionesRepository {
    static let shared = AprobacionesRepository()
    private let api = ApiClient.shared
    private init() {}

    /// Los dos únicos valores que acepta el controlador.
    private static let decisionAprobar = "APPROVED"
    private static let decisionRechazar = "REJECTED"

    /// Lo que espera tu firma, con la cadena completa de cada solicitud.
    func pendientes() async throws -> [AprobacionPendiente] {
        let data = try await api.get("workflow/my-pending")
        do {
            return try JSONDecoder().decode([AprobacionPendiente].self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// Aprobar o rechazar un paso.
    ///
    /// Exige señal: sin conexión falla a la vista (`requireOnline`) en vez de
    /// quedar en la cola dando por firmado algo que el servidor todavía puede
    /// rechazar. El motivo solo viaja si trae algo.
    func decidir(aprobacionId: Int, aprobar: Bool, motivo: String?) async throws -> DecisionRespuesta {
        struct Body: Encodable {
            let decision: String
            let comments: String?
        }
        try await CoreRepository.requireOnline()
        let limpio = motivo?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = Body(
            decision: aprobar ? Self.decisionAprobar : Self.decisionRechazar,
            comments: (limpio?.isEmpty ?? true) ? nil : limpio
        )
        let data = try await api.postJSON("workflow/approvals/\(aprobacionId)/decide", body: body)
        if CoreRepository.isQueuedOffline(data) {
            throw CoreError.message("Sin conexión: la decisión no se registró. Inténtalo cuando regrese la señal.")
        }
        do {
            return try JSONDecoder().decode(DecisionRespuesta.self, from: data)
        } catch {
            // El servidor confirmó con 2xx aunque el cuerpo no se entienda: la
            // decisión sí quedó; se cuenta como «Aprobada./Rechazada.» sin más.
            return DecisionRespuesta(decided: true)
        }
    }
}
