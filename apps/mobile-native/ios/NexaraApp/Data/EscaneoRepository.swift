import Foundation

/// Lo que se hace al escanear con la cámara en Almacén y Herramientas. Espejo de
/// `apps/api/src/warehouse/stock.controller.ts` (búsqueda, alta y movimiento por código)
/// y de `tool-requests.controller.ts` (etiqueta de herramienta, entregar y recibir).
/// Mismo contrato que `EscaneoApi.kt` en Android.
///
/// Aquí sí hay mutaciones que exigen `stock.manage` o `tools.manage`: la app no esconde
/// los botones por permiso (el rol puede cambiar sin cerrar sesión), los enseña y
/// traduce el 403 a un mensaje claro. Ninguna se encola sin conexión
/// (`ApiClient.isNeverQueued`): el API decide si el código existe y si el préstamo sigue
/// en el estado que se vio.
///
/// Las búsquedas usan la variante con `?code=` porque un código con «/» no cabe en un
/// segmento de ruta.

// MARK: - Almacén

/// Número o texto (Prisma `Decimal`), lo que mande el servidor.
private func numeroFlexible<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Double? {
    if let d = try? c.decode(Double.self, forKey: key) { return d }
    if let s = try? c.decode(String.self, forKey: key) { return StockParse.dbl(s) }
    return nil
}

struct ProductoCodigo: Decodable, Hashable {
    let id: Int?
    let sku: String?
    let name: String?
    let ean: String?
    let upc: String?
    let codigoBarras: String?
    let unitName: String?
    let imageUrl: String?

    var nombre: String { name?.nilSiVacio ?? sku?.nilSiVacio ?? "Producto sin nombre" }
}

/// Presentación (caja) cuyo código se escaneó: la cantidad del movimiento cuenta cajas.
struct EmpaqueCodigo: Decodable, Hashable {
    var id: Int?
    var nombre: String?
    var piezasPorUnidad: Double?

    private enum CodingKeys: String, CodingKey { case id, nombre, piezasPorUnidad }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decode(Int.self, forKey: .id)
        nombre = try? c.decode(String.self, forKey: .nombre)
        piezasPorUnidad = numeroFlexible(c, .piezasPorUnidad)
    }
}

struct ExistenciaCodigo: Decodable, Hashable {
    var warehouseId: Int?
    var almacen: String?
    var cantidad: Double?
    var reservado: Double?

    private enum CodingKeys: String, CodingKey { case warehouseId, almacen, cantidad, reservado }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        warehouseId = try? c.decode(Int.self, forKey: .warehouseId)
        almacen = try? c.decode(String.self, forKey: .almacen)
        cantidad = numeroFlexible(c, .cantidad)
        reservado = numeroFlexible(c, .reservado)
    }

    /// Disponible: cantidad menos reservado, nunca negativo.
    var disponible: Double { max(0, (cantidad ?? 0) - (reservado ?? 0)) }
}

/// `GET stock/barcode?code=`: producto o caja, con existencias. 404 si no existe.
struct ProductoPorCodigo: Decodable, Hashable {
    /// `empaque` (se leyó una caja) | `producto`.
    let match: String?
    let codigoBarras: String?
    /// UPC_A | EAN_13 | EAN_8 | GTIN_14 | INTERNO
    let tipo: String?
    let packaging: EmpaqueCodigo?
    let product: ProductoCodigo?
    let existencias: [ExistenciaCodigo]?

    /// Se leyó una caja (Android `r.match == "empaque"`): la cantidad cuenta cajas y la
    /// existencia (en piezas) no se compara contra ella.
    var esCaja: Bool { match == "empaque" }
}

struct ProductoUpc: Decodable, Hashable {
    let codigo: String?
    let nombre: String?
    let marca: String?
    let modelo: String?
    let descripcion: String?
    let imagenUrl: String?
    let categoria: String?
}

/// `GET stock/upc-lookup/:code`: catálogo internacional. Siempre 200.
struct ConsultaUpc: Decodable, Hashable {
    let encontrado: Bool?
    let codigo: String?
    let fuente: String?
    let producto: ProductoUpc?
    let motivo: String?
    let mensaje: String?
}

struct AltaPorCodigoBody: Encodable {
    let codigo: String
    let name: String
    var sku: String?
    var marca: String?
    var modelo: String?
    var descripcion: String?
    var imagenUrl: String?
    var categoria: String?
    var unidad: String?
}

struct MovimientoPorCodigoBody: Encodable {
    let codigo: String
    /// RECEIPT (entrada) | DISPATCH (salida).
    let type: String
    let quantity: Double
    var fromWarehouseId: Int?
    var toWarehouseId: Int?
    var notes: String?
}

// MARK: - Herramientas

struct HerramientaPersona: Decodable, Hashable {
    let id: Int?
    let nombre: String?
    let email: String?
}

struct HerramientaActividad: Decodable, Hashable {
    let id: Int?
    let anNumber: String?
    let titulo: String?
}

struct HerramientaEscaneada: Decodable, Hashable {
    let id: Int?
    let toolName: String?
    let model: String?
    let serialNumber: String?
    let codigoInterno: String?
    let barcode: String?
    /// AVAILABLE | ASSIGNED | IN_REPAIR | RETIRED
    let status: String?
}

struct PrestamoEscaneado: Decodable, Hashable {
    let id: Int?
    /// PENDING | APPROVED | IN_USE
    let status: String?
    let usuario: HerramientaPersona?
    let activity: HerramientaActividad?
    let expectedReturnDate: String?
    /// Solo llega a quien gestiona herramientas.
    let pickupCode: String?
    let pickupExpiresAt: String?
    let vencido: Bool?
}

struct KitEscaneado: Decodable, Hashable {
    let id: Int?
    let assignmentType: String?
    let assignedAt: String?
    let user: HerramientaPersona?
}

/// `GET tool-requests/inventory/por-codigo?code=`.
struct HerramientaPorCodigo: Decodable, Hashable {
    let codigo: String?
    let item: HerramientaEscaneada?
    let prestamo: PrestamoEscaneado?
    let kit: KitEscaneado?
    /// La tiene (o la pidió) quien escanea.
    let esMia: Bool?
}

// MARK: - Repositorio

final class EscaneoRepository {
    static let shared = EscaneoRepository()
    private let api = ApiClient.shared
    private init() {}

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    private func mutar(_ data: Data) throws {
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `GET stock/barcode?code=` (`stock.view`). 404 = el código no existe (se ofrece el alta).
    func productoPorCodigo(_ codigo: String) async throws -> ProductoPorCodigo {
        let data = try await api.get("stock/barcode", query: ["code": codigo])
        return try decode(ProductoPorCodigo.self, from: data)
    }

    /// `GET stock/upc-lookup/:code` (`stock.manage`). Solo GTIN: son dígitos, caben en la ruta.
    func consultaUpc(_ codigo: String) async throws -> ConsultaUpc {
        let data = try await api.get("stock/upc-lookup/\(codigo)")
        return try decode(ConsultaUpc.self, from: data)
    }

    /// `POST stock/products/por-codigo` (`stock.manage`): alta con el código ya puesto.
    func altaPorCodigo(_ body: AltaPorCodigoBody) async throws {
        try await CoreRepository.requireOnline()
        try mutar(try await api.postJSON("stock/products/por-codigo", body: body))
    }

    /// `POST stock/movements/por-codigo` (`stock.manage`): entrada o salida con solo el código.
    func movimientoPorCodigo(_ body: MovimientoPorCodigoBody) async throws {
        try await CoreRepository.requireOnline()
        try mutar(try await api.postJSON("stock/movements/por-codigo", body: body))
    }

    /// `GET warehouse` (`warehouse.view`): almacenes de la empresa, para elegir destino.
    func almacenes() async throws -> [StockAlmacenRef] {
        let data = try await api.get("warehouse")
        return try ApiClient.decodeList(data)
    }

    /// `GET tool-requests/inventory/por-codigo?code=`.
    func herramientaPorCodigo(_ codigo: String) async throws -> HerramientaPorCodigo {
        let data = try await api.get("tool-requests/inventory/por-codigo", query: ["code": codigo])
        return try decode(HerramientaPorCodigo.self, from: data)
    }

    /// `POST tool-requests/:id/deliver` (`tools.manage`): salida de almacén de un préstamo aprobado.
    func entregarHerramienta(prestamoId: Int, pickupCode: String?) async throws {
        struct Body: Encodable { let pickupCode: String? }
        let codigo = (pickupCode ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        try await CoreRepository.requireOnline()
        try mutar(try await api.postJSON(
            "tool-requests/\(prestamoId)/deliver",
            body: Body(pickupCode: codigo.isEmpty ? nil : codigo)
        ))
    }

    /// `POST tool-requests/:id/return` (`tools.manage`): entrada a almacén; con daño queda en reparación.
    func recibirHerramienta(prestamoId: Int, damageDescription: String?) async throws {
        struct Body: Encodable { let damageDescription: String? }
        let dano = (damageDescription ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        try await CoreRepository.requireOnline()
        try mutar(try await api.postJSON(
            "tool-requests/\(prestamoId)/return",
            body: Body(damageDescription: dano.isEmpty ? nil : dano)
        ))
    }
}

// MARK: - Reglas puras

/// Qué movimiento se ofrece, en qué almacén, en qué unidad, qué acción tiene una
/// herramienta escaneada y cómo se explica un 403. Espejo de `EscaneoRules.kt`.
enum EscaneoReglas {

    enum Movimiento: String, CaseIterable, Identifiable {
        case entrada
        case salida

        var id: String { rawValue }
        var api: String { self == .entrada ? "RECEIPT" : "DISPATCH" }
        var etiqueta: String { self == .entrada ? "Entrada" : "Salida" }
        var verbo: String { self == .entrada ? "Entrada registrada" : "Salida registrada" }
    }

    struct OpcionAlmacen: Identifiable, Hashable {
        let id: Int
        let nombre: String
    }

    /// Lo que hay en todos los almacenes (sin restar lo reservado).
    static func totalExistencia(_ existencias: [ExistenciaCodigo]?) -> Double {
        (existencias ?? []).reduce(0) { $0 + ($1.cantidad ?? 0) }
    }

    /// Salida: solo donde hay existencia (sacar de donde no hay da 400). Entrada: todos
    /// los de la empresa; si no se pudieron leer, al menos los que ya tienen el producto.
    static func almacenesPara(
        _ movimiento: Movimiento,
        existencias: [ExistenciaCodigo]?,
        almacenes: [StockAlmacenRef]?
    ) -> [OpcionAlmacen] {
        typealias ConProducto = (id: Int, nombre: String, cantidad: Double)
        let conProducto: [ConProducto] = (existencias ?? []).compactMap { e -> ConProducto? in
            guard let id = e.warehouseId else { return nil }
            return (id: id, nombre: e.almacen?.nilSiVacio ?? "Almacén \(id)", cantidad: e.cantidad ?? 0)
        }
        let opciones: [OpcionAlmacen]
        switch movimiento {
        case .salida:
            opciones = conProducto.filter { $0.cantidad > 0 }.map { OpcionAlmacen(id: $0.id, nombre: $0.nombre) }
        case .entrada:
            let todos = (almacenes ?? []).compactMap { a -> OpcionAlmacen? in
                guard a.id > 0 else { return nil }
                return OpcionAlmacen(id: a.id, nombre: a.name.nilSiVacio ?? a.code.nilSiVacio ?? "Almacén \(a.id)")
            }
            opciones = todos.isEmpty ? conProducto.map { OpcionAlmacen(id: $0.id, nombre: $0.nombre) } : todos
        }
        var vistos = Set<Int>()
        return opciones.filter { vistos.insert($0.id).inserted }
    }

    /// En qué se cuenta la cantidad: cajas si se escaneó una caja, si no la unidad del producto.
    static func unidad(_ r: ProductoPorCodigo) -> String {
        if r.esCaja, let empaque = r.packaging {
            let nombre = empaque.nombre?.nilSiVacio ?? "Caja"
            if let piezas = empaque.piezasPorUnidad, piezas > 0 {
                return "\(nombre) (\(CoreExtrasFormato.numero(piezas)) pz c/u)"
            }
            return nombre
        }
        return r.product?.unitName?.nilSiVacio ?? "piezas"
    }

    static func avisoMovimiento(_ movimiento: Movimiento, cantidad: Double, unidad: String, producto: String?) -> String {
        let nombre = producto?.nilSiVacio ?? "el producto"
        return "\(movimiento.verbo): \(CoreExtrasFormato.numero(cantidad)) \(unidad) de \(nombre)."
    }

    /// Validación antes de mandar el movimiento; nil si se puede.
    static func errorMovimiento(
        cantidad: Double?,
        almacenId: Int?,
        disponibleEnOrigen: Double?,
        movimiento: Movimiento
    ) -> String? {
        guard let cantidad else { return "Escribe una cantidad mayor a cero." }
        guard almacenId != nil else {
            return movimiento == .salida ? "Elige de qué almacén sale." : "Elige a qué almacén entra."
        }
        if movimiento == .salida, let disponible = disponibleEnOrigen, cantidad > disponible {
            return "No alcanza: en ese almacén hay \(CoreExtrasFormato.numero(disponible))."
        }
        return nil
    }

    // MARK: Herramientas

    enum AccionHerramienta {
        /// Préstamo aprobado: sale del almacén con quien la recoge.
        case entregar
        /// Préstamo en uso: regresa al almacén.
        case recibir

        var etiqueta: String { self == .entregar ? "Registrar salida" : "Registrar entrada" }
    }

    static func accion(_ r: HerramientaPorCodigo) -> AccionHerramienta? {
        switch r.prestamo?.status {
        case "APPROVED": return .entregar
        case "IN_USE": return .recibir
        default: return nil
        }
    }

    static func estadoHerramienta(_ status: String?) -> String {
        switch status {
        case "AVAILABLE": return "En almacén"
        case "ASSIGNED": return "Asignada"
        case "IN_REPAIR": return "En reparación"
        case "RETIRED": return "Dada de baja"
        case nil, "": return "Sin estado"
        default: return status ?? "Sin estado"
        }
    }

    static func estadoPrestamo(_ status: String?) -> String {
        switch status {
        case "PENDING": return "Préstamo pendiente de aprobar"
        case "APPROVED": return "Préstamo aprobado, falta entregarla"
        case "IN_USE": return "Prestada"
        default: return "Sin préstamo abierto"
        }
    }

    /// «La tiene Juan Pérez · AN-0123» o «En el kit de Ana López»; nil si está libre.
    static func quienLaTiene(_ r: HerramientaPorCodigo) -> String? {
        if let p = r.prestamo {
            let quien = p.usuario?.nombre?.nilSiVacio ?? "alguien"
            let verbo = p.status == "IN_USE" ? "La tiene" : "La pidió"
            return ["\(verbo) \(quien)", p.activity?.anNumber?.nilSiVacio].compactMap { $0 }.joined(separator: " · ")
        }
        guard let kit = r.kit else { return nil }
        return "En el kit de \(kit.user?.nombre?.nilSiVacio ?? "alguien")"
    }

    static func nombreHerramienta(_ r: HerramientaPorCodigo) -> String {
        let partes = [r.item?.toolName?.nilSiVacio, r.item?.model?.nilSiVacio].compactMap { $0 }
        return partes.isEmpty ? "Herramienta" : partes.joined(separator: " · ")
    }

    static let permisoGenerico = "No tienes permisos para esta acción"

    /// Un 403 explicado: qué no puede hacer y a quién pedírselo. Si el servidor dio un
    /// motivo propio (p. ej. «Solo almacén entrega herramientas»), se respeta.
    static func textoSinPermiso(_ accion: String, servidor: String?) -> String {
        var propio = (servidor ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        while propio.hasSuffix(".") { propio.removeLast() }
        let generico = propio.isEmpty
            || propio.caseInsensitiveCompare(permisoGenerico) == .orderedSame
            || propio.lowercased().hasPrefix("sin permisos")
            || propio.lowercased().hasPrefix("forbidden")
        let base = "Tu usuario no tiene permiso para \(accion). Pídele a un administrador que te lo active."
        return generico ? base : "\(propio). \(base)"
    }

    /// Código HTTP del error, si vino del servidor.
    static func codigoHttp(_ error: Error) -> Int? {
        if case .http(let code, _)? = error as? ApiError { return code }
        return nil
    }

    /// Mensaje del servidor de un error HTTP (sin traducir), para explicar un 403.
    static func mensajeServidor(_ error: Error) -> String? {
        if case .http(_, let body)? = error as? ApiError { return ApiError.parseServerErrorBody(body) }
        return nil
    }

    /// Texto para la persona: un 403 dice qué no puede hacer y a quién pedirlo; lo demás,
    /// el mensaje de siempre.
    static func mensaje(_ error: Error, accion: String, fallback: String) -> String {
        if codigoHttp(error) == 403 {
            return textoSinPermiso(accion, servidor: mensajeServidor(error))
        }
        return error.toUserMessage(fallback: fallback)
    }
}
