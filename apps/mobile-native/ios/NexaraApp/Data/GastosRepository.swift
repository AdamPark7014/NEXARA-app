import Foundation

/// Gastos administrativos de Core — espejo de `apps/api/src/expenses/expenses.controller.ts`
/// y de `GastosApi.kt` / `GastosRepository.kt` de Android:
///
/// | Qué                  | Endpoint                        | Permiso              |
/// |----------------------|---------------------------------|----------------------|
/// | Lista                | `GET expenses`                  | `contabilidad.view`  |
/// | Registrar con ticket | `POST expenses` (multipart)     | `contabilidad.view`  |
/// | Autorizar / rechazar | `PATCH expenses/:id/approve`    | `contabilidad.manage`|
/// | Marcar pagado        | `PATCH expenses/:id/pagado`     | `contabilidad.manage`|
///
/// Registrar pide **el mismo permiso que ver**: quien captura el gasto es quien
/// lo pagó de su bolsa, y quien lo autoriza es otro. Por eso la pantalla enseña
/// «Registrar» a todos y las decisiones solo a quien administra contabilidad; el
/// 403 del API sigue siendo la única autoridad.
///
/// El servidor filtra solo: quien administra ve toda la empresa y el resto su
/// departamento (`findByDepartment`). La app pinta lo que llega.
///
/// **Todo importe se guarda como texto.** `montoSolicitado` es un `Decimal` de
/// Prisma y llega unas veces como número JSON y otras como cadena; se lee de las
/// dos formas y quien necesita la cifra llama a `GastosRules.centavos`.

// MARK: - DTOs

/// Quien capturó o a quien se le repone el gasto. El nombre puede faltar en filas viejas.
struct GastoPersona: Decodable, Hashable {
    var id: Int?
    var nombre: String?
    var puesto: String?

    init(id: Int? = nil, nombre: String? = nil, puesto: String? = nil) {
        self.id = id
        self.nombre = nombre
        self.puesto = puesto
    }

    private enum CodingKeys: String, CodingKey { case id, nombre, puesto }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.enteroFlexible(.id)
        nombre = try? c.decode(String.self, forKey: .nombre)
        puesto = try? c.decode(String.self, forKey: .puesto)
    }
}

/// La OT a la que se cargó. Los administrativos cuelgan de `SYS-ADMIN-GASTOS`.
struct GastoActividad: Decodable, Hashable {
    var id: Int?
    var anNumber: String?
    var titulo: String?

    private enum CodingKeys: String, CodingKey { case id, anNumber, titulo }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.enteroFlexible(.id)
        anNumber = try? c.decode(String.self, forKey: .anNumber)
        titulo = try? c.decode(String.self, forKey: .titulo)
    }
}

/// Una fila de `GET expenses`: el modelo `Expense` de Prisma tal cual, con
/// `usuario`, `actividad` y `createdBy` incluidos.
///
/// Todo campo es opcional: un registro viejo al que le falte el concepto deja
/// la fila incompleta, nunca tumba la pantalla.
struct Gasto: Decodable, Identifiable, Hashable {
    /// El `id` del servidor. Anulable como en Android (`GastoDto.id: Long?`).
    var idServidor: Int?
    var concepto: String?
    var razonGasto: String?
    var categoria: String?
    /// `Decimal(10,2)` de Prisma, como texto (llegue como número o como cadena).
    var montoSolicitado: String?
    /// `Pendiente` · `Aprobado` · `Pagado` · `Rechazado`.
    var estatusPago: String?
    var fechaGasto: String?
    var fechaSolicitud: String?
    var esRecurrente: Bool?
    var isAdministrative: Bool?
    var ticketEvidenciaUrl: String?
    /// Folio de la póliza; el API lo escribe al autorizar o al pagar.
    var contabilidadRef: String?
    var usuarioId: Int?
    /// De quién es el gasto (a quien se le repone).
    var usuario: GastoPersona?
    /// Quién lo capturó, si no fue el mismo.
    var createdBy: GastoPersona?
    var actividad: GastoActividad?

    /// Clave estable de lista y de la hoja abierta.
    var id: String {
        if let idServidor { return "gasto-\(idServidor)" }
        return "gasto-sin-id-\(fechaSolicitud ?? "")-\(concepto ?? razonGasto ?? "")"
    }

    init(
        idServidor: Int? = nil,
        concepto: String? = nil,
        razonGasto: String? = nil,
        categoria: String? = nil,
        montoSolicitado: String? = nil,
        estatusPago: String? = nil,
        fechaGasto: String? = nil,
        fechaSolicitud: String? = nil,
        esRecurrente: Bool? = nil,
        ticketEvidenciaUrl: String? = nil,
        contabilidadRef: String? = nil,
        usuario: GastoPersona? = nil,
        createdBy: GastoPersona? = nil
    ) {
        self.idServidor = idServidor
        self.concepto = concepto
        self.razonGasto = razonGasto
        self.categoria = categoria
        self.montoSolicitado = montoSolicitado
        self.estatusPago = estatusPago
        self.fechaGasto = fechaGasto
        self.fechaSolicitud = fechaSolicitud
        self.esRecurrente = esRecurrente
        self.ticketEvidenciaUrl = ticketEvidenciaUrl
        self.contabilidadRef = contabilidadRef
        self.usuario = usuario
        self.createdBy = createdBy
    }

    private enum CodingKeys: String, CodingKey {
        case idServidor = "id"
        case concepto, razonGasto, categoria, montoSolicitado, estatusPago
        case fechaGasto, fechaSolicitud, esRecurrente, isAdministrative
        case ticketEvidenciaUrl, contabilidadRef, usuarioId, usuario, createdBy, actividad
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        idServidor = c.enteroFlexible(.idServidor)
        concepto = try? c.decode(String.self, forKey: .concepto)
        razonGasto = try? c.decode(String.self, forKey: .razonGasto)
        categoria = try? c.decode(String.self, forKey: .categoria)
        montoSolicitado = c.textoONumero(.montoSolicitado)
        estatusPago = try? c.decode(String.self, forKey: .estatusPago)
        fechaGasto = try? c.decode(String.self, forKey: .fechaGasto)
        fechaSolicitud = try? c.decode(String.self, forKey: .fechaSolicitud)
        esRecurrente = try? c.decode(Bool.self, forKey: .esRecurrente)
        isAdministrative = try? c.decode(Bool.self, forKey: .isAdministrative)
        ticketEvidenciaUrl = try? c.decode(String.self, forKey: .ticketEvidenciaUrl)
        contabilidadRef = try? c.decode(String.self, forKey: .contabilidadRef)
        usuarioId = c.enteroFlexible(.usuarioId)
        usuario = try? c.decode(GastoPersona.self, forKey: .usuario)
        createdBy = try? c.decode(GastoPersona.self, forKey: .createdBy)
        actividad = try? c.decode(GastoActividad.self, forKey: .actividad)
    }
}

/// Lectura tolerante de números del API: un `Decimal` de Prisma llega como
/// número o como texto, y un id a veces como cadena.
fileprivate extension KeyedDecodingContainer {
    func textoONumero(_ key: Key) -> String? {
        if let texto = try? decode(String.self, forKey: key) { return texto }
        if let entero = try? decode(Int.self, forKey: key) { return String(entero) }
        if let doble = try? decode(Double.self, forKey: key), doble.isFinite { return String(doble) }
        return nil
    }

    func enteroFlexible(_ key: Key) -> Int? {
        if let entero = try? decode(Int.self, forKey: key) { return entero }
        if let texto = try? decode(String.self, forKey: key) {
            return Int(texto.trimmingCharacters(in: .whitespaces))
        }
        return nil
    }
}

// MARK: - Repositorio

/// Registrar gastos con el ticket, autorizarlos y marcarlos pagados.
///
/// Los importes entran y salen de la pantalla en **centavos enteros** y solo se
/// vuelven texto aquí, al armar la petición — igual que en Viáticos.
final class GastosRepository {
    static let shared = GastosRepository()
    private let api = ApiClient.shared
    private init() {}

    /// ¿Le enseñamos los botones de decidir?
    ///
    /// Es una pista para no ofrecer lo que casi seguro va a fallar, **no** la
    /// autoridad: manda `contabilidad.manage` del servidor, y su 403 se enseña
    /// tal cual. Misma lista que `GastosRepository.administraGastos()` de Android.
    static func administraGastos() -> Bool {
        guard let user = SessionStore.shared.currentUser else { return false }
        if user.isSuperAdmin { return true }
        return user.permissions.contains {
            $0 == "contabilidad.manage" || $0 == "console.admin" || $0 == "CONSOLE_ADMIN"
        }
    }

    /// `GET expenses` — sin `limit`, el controlador devuelve el arreglo completo.
    ///
    /// Con `limit` contestaría `{ data, meta }` y toparía en 100 filas
    /// (`PaginationQueryDto`). Aquí se pide entero y se filtra en el teléfono.
    func lista() async throws -> [Gasto] {
        let data = try await api.get("expenses")
        do {
            return try JSONDecoder().decode([Gasto].self, from: data)
        } catch {
            // Por si algún día el API pagina sin que se lo pidan.
            let paginada = (try? (ApiClient.decodeList(data) as [Gasto])) ?? []
            if !paginada.isEmpty { return paginada }
            throw ApiError.decoding(error)
        }
    }

    /// `POST expenses` (multipart) — alta con la foto del ticket.
    ///
    /// El servidor exige comprobante («Debes adjuntar el comprobante del gasto»).
    /// `fecha` viaja como `YYYY-MM-DD` y el servidor la lee a mediodía, así que el
    /// día que se captura es el día que se guarda.
    ///
    /// Devuelve `true` si se quedó en la cola sin conexión: un alta sí se puede
    /// encolar (es del propio interesado y no mueve dinero por sí sola).
    func registrar(
        concepto: String,
        centavos: Int,
        categoria: String,
        esRecurrente: Bool,
        fecha: String,
        ticket: CapturedGeoPhoto
    ) async throws -> Bool {
        let campos: [String: String] = [
            "concepto": concepto.trimmingCharacters(in: .whitespacesAndNewlines),
            // `Number(body.monto)`: una coma de millares lo volvería `NaN`.
            "monto": Dinero.textoApi(centavos),
            "categoria": categoria.trimmingCharacters(in: .whitespacesAndNewlines),
            "esRecurrente": esRecurrente ? "true" : "false",
            "fecha": fecha,
        ]
        let data = try await api.uploadMultipartFiles(
            "expenses",
            fields: campos,
            files: [(field: "ticketEvidencia", data: ticket.jpeg, fileName: "ticket-gasto.jpg", mimeType: "image/jpeg")]
        )
        return CoreRepository.isQueuedOffline(data)
    }

    /// `PATCH expenses/:id/approve` — autoriza o rechaza; solo sobre pendientes.
    ///
    /// Devuelve `true` si se quedó en la cola: a diferencia de los viáticos, esta
    /// ruta **sí** se encola sin conexión (igual que en Android), y la pantalla lo
    /// dice con esas palabras en vez de dar por hecho un dinero que nadie autorizó.
    func resolver(id: Int, aprobar: Bool, nota: String?) async throws -> Bool {
        struct Body: Encodable {
            let action: String
            let note: String?
        }
        let limpia = nota?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = Body(
            action: aprobar ? "approve" : "reject",
            note: (limpia?.isEmpty ?? true) ? nil : limpia
        )
        let data = try await api.patchJSON("expenses/\(id)/approve", body: body)
        return CoreRepository.isQueuedOffline(data)
    }

    /// `PATCH expenses/:id/pagado` — marca el pago y levanta la póliza contable.
    /// El controlador no lee cuerpo. Mismo aviso de cola que `resolver`.
    func marcarPagado(id: Int) async throws -> Bool {
        struct Vacio: Encodable {}
        let data = try await api.patchJSON("expenses/\(id)/pagado", body: Vacio())
        return CoreRepository.isQueuedOffline(data)
    }
}
