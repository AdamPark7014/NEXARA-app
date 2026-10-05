import Foundation

/// Pagos a empleados en el teléfono — espejo de
/// `apps/api/src/employee-payments/employee-payments.controller.ts` y de
/// `EmployeePaymentsApi.kt` / `PagosEmpleadosRepository.kt` de Android:
///
/// | Pantalla | Endpoint                  | Permiso              |
/// |----------|---------------------------|----------------------|
/// | Lista    | `GET employee-payments`   | `CONTABILIDAD_VIEW`  |
///
/// **Un solo endpoint, y sin parámetros**, igual que la web y que Android. El
/// controlador acepta además `from`, `to`, `userId` y `status`, pero la web no
/// los usa: filtra sobre la lista completa. Mandar filtros que la web no manda
/// sería ampliar por la puerta de atrás lo que se consulta de la nómina ajena
/// (el alcance —toda la empresa o solo el departamento— lo decide el servidor).
///
/// Sin `limit`, el servicio devuelve el arreglo entero (no el sobre paginado).
///
/// Reglas de los modelos, iguales que en Android: **todo es opcional** y **todo
/// importe se guarda como texto** (`amount` es un `Decimal(12,2)` de Prisma y
/// viaja como texto). Quien necesita la cifra llama a `PagosRules.centavos`,
/// que devuelve `nil` cuando no entiende en vez de un cero que nadie cobró.

// MARK: - Lectura tolerante

fileprivate enum PagoLectura {
    static func texto<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> String? {
        if let valor = try? c.decodeIfPresent(String.self, forKey: key) { return valor }
        if let valor = try? c.decodeIfPresent(Int64.self, forKey: key) { return String(valor) }
        if let valor = try? c.decodeIfPresent(Double.self, forKey: key), valor.isFinite { return String(valor) }
        return nil
    }

    static func entero<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Int? {
        if let valor = try? c.decodeIfPresent(Int.self, forKey: key) { return valor }
        if let valor = try? c.decodeIfPresent(Double.self, forKey: key), valor.isFinite, abs(valor) < 9e15 {
            return Int(valor)
        }
        if let valor = try? c.decodeIfPresent(String.self, forKey: key) {
            return Int(valor.trimmingCharacters(in: .whitespaces))
        }
        return nil
    }

    static func persona<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> PagoEmpleadoPersona? {
        if let valor = try? c.decodeIfPresent(PagoEmpleadoPersona.self, forKey: key) { return valor }
        return nil
    }

    /// Comprobantes: una columna `Json` del servidor. Se queda con los textos.
    static func textos<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> [String]? {
        if let valor = try? c.decodeIfPresent([String].self, forKey: key) { return valor }
        if let valor = try? c.decodeIfPresent([JSONValue].self, forKey: key) {
            return valor.compactMap { $0.stringValue }
        }
        return nil
    }
}

fileprivate struct PagosErrorLegible: LocalizedError {
    let mensaje: String
    var errorDescription: String? { mensaje }
}

// MARK: - Modelos

/// El empleado del pago, o quien lo capturó. Es un `User` de Prisma recortado.
struct PagoEmpleadoPersona: Decodable, Hashable {
    var id: Int?
    var nombre: String?
    var email: String?
    var avatarUrl: String?
    var puesto: String?

    private enum CodingKeys: String, CodingKey { case id, nombre, email, avatarUrl, puesto }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        id = PagoLectura.entero(c, .id)
        nombre = PagoLectura.texto(c, .nombre)
        email = PagoLectura.texto(c, .email)
        avatarUrl = PagoLectura.texto(c, .avatarUrl)
        puesto = PagoLectura.texto(c, .puesto)
    }
}

/// Un pago a un empleado (`model EmployeePayment` de `schema.prisma`).
///
/// Ojo con las dos clases de fecha, que no se leen igual:
/// - `periodFrom` y `periodTo` son `@db.Date`: **días**, guardados a medianoche
///   UTC. Hay que quedarse con los diez primeros caracteres; pasarlos a la hora
///   de México los correría un día hacia atrás.
/// - `paidAt` y `createdAt` son instantes de verdad: ahí sí se pasa por la zona
///   de México (un pago marcado a las 19:00 es `01:00Z` del día siguiente).
struct PagoEmpleado: Decodable, Hashable {
    var id: Int?
    var userId: Int?
    var periodFrom: String?
    var periodTo: String?
    /// Minutos de asistencia que respaldan el pago; `0` = no se calculó por horas.
    var totalMinutes: Int?
    /// `Decimal(12,2)` como texto.
    var amount: String?
    var concepto: String?
    var note: String?
    /// `Borrador` · `Pagado` · `Anulado`.
    var status: String?
    /// Instante en que se marcó pagado; `nil` mientras siga en borrador.
    var paidAt: String?
    /// Folio de la póliza contable que generó el pago (`PAG-…`).
    var contabilidadRef: String?
    var journalEntryId: Int?
    /// Comprobantes subidos al capturar (`/uploads/employee-payments/…`).
    var evidenceUrls: [String]?
    var createdAt: String?
    var user: PagoEmpleadoPersona?
    var createdBy: PagoEmpleadoPersona?

    private enum CodingKeys: String, CodingKey {
        case id, userId, periodFrom, periodTo, totalMinutes, amount, concepto, note, status
        case paidAt, contabilidadRef, journalEntryId, evidenceUrls, createdAt, user, createdBy
    }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        id = PagoLectura.entero(c, .id)
        userId = PagoLectura.entero(c, .userId)
        periodFrom = PagoLectura.texto(c, .periodFrom)
        periodTo = PagoLectura.texto(c, .periodTo)
        totalMinutes = PagoLectura.entero(c, .totalMinutes)
        amount = PagoLectura.texto(c, .amount)
        concepto = PagoLectura.texto(c, .concepto)
        note = PagoLectura.texto(c, .note)
        status = PagoLectura.texto(c, .status)
        paidAt = PagoLectura.texto(c, .paidAt)
        contabilidadRef = PagoLectura.texto(c, .contabilidadRef)
        journalEntryId = PagoLectura.entero(c, .journalEntryId)
        evidenceUrls = PagoLectura.textos(c, .evidenceUrls)
        createdAt = PagoLectura.texto(c, .createdAt)
        user = PagoLectura.persona(c, .user)
        createdBy = PagoLectura.persona(c, .createdBy)
    }

    /// Clave estable para la lista: el id; sin id, empleado y fecha.
    var claveLista: String {
        if let id { return "id-\(id)" }
        return "sin-id-\(userId ?? 0)-\(createdAt ?? "")-\(amount ?? "")"
    }
}

// MARK: - Repositorio

/// Lectura de Pagos a empleados (`/erp/finance/employee-payments`).
///
/// **Solo lectura, y a propósito** (igual que Android): crear, editar, marcar
/// pagado y anular piden `CONTABILIDAD_MANAGE` y mueven contabilidad de verdad
/// —marcar pagado asienta una póliza—. Eso se hace en la computadora.
final class PagosEmpleadosRepository {
    static let shared = PagosEmpleadosRepository()

    private init() {}

    /// La lista completa, sin filtros de servidor: el periodo, el estado y la
    /// búsqueda se resuelven en el teléfono (`PagosRules`).
    func lista() async throws -> [PagoEmpleado] {
        let data = try await ApiClient.shared.get("employee-payments")
        if let filas = try? JSONDecoder().decode([PagoEmpleado].self, from: data) {
            return filas
        }
        if let objeto = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           ["items", "data", "results", "rows"].contains(where: { objeto[$0] is [Any] }) {
            return try ApiClient.decodeList(data)
        }
        // Una respuesta que no es una lista no es «sin pagos»: en nómina eso sería mentir.
        throw PagosErrorLegible(mensaje: "No se pudieron leer los pagos que mandó el servidor.")
    }
}
