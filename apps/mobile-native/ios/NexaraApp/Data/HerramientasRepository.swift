import Foundation

/// Herramientas de Core — espejo de `HerramientasApi.kt` / `HerramientasRepository.kt`
/// en Android y de `apps/api/src/tool-requests/tool-requests.controller.ts`.
///
/// Lo propio, que tiene todo el personal (`tools.view` / `tools.request`):
///
/// | Qué                 | Endpoint                                      |
/// |---------------------|-----------------------------------------------|
/// | Mi kit              | `GET tool-requests/kits/my`                   |
/// | Mis préstamos       | `GET tool-requests/my-requests`               |
/// | Pedir más plazo     | `POST tool-requests/:id/renewal-request`      |
/// | Reportar daño       | `POST tool-requests/kits/:id/report`          |
/// | Buscar para pedir   | `GET tool-requests/inventory/search?q=`       |
/// | ¿Para qué actividad?| `GET tool-requests/mis-actividades`           |
/// | Pedir préstamo      | `POST tool-requests`                          |
///
/// Lo de quien administra y lo que consulta dirección (`tools.manage`):
///
/// | Qué                 | Endpoint                                      |
/// |---------------------|-----------------------------------------------|
/// | Préstamos           | `GET tool-requests`                           |
/// | Inventario          | `GET tool-requests/inventory`                 |
/// | Kits de la gente    | `GET tool-requests/kits/users`                |
/// | Prórrogas           | `GET tool-requests/renewals/pending`          |
/// | Aprobar y rechazar  | `POST tool-requests/:id/approve` y `/reject`  |
/// | Decidir prórrogas   | `POST tool-requests/renewals/:id/approve` y `/reject` |
/// | Nueva herramienta   | `POST tool-requests/inventory` (multipart)    |
///
/// Quién ve qué botón es pista (`HerramientasReglas.perfil`): el servidor decide y
/// su 403 se enseña tal cual. Entregar y recibir viven en `EscaneoRepository`, que
/// los comparte con el escáner.
///
/// Todo campo llega opcional con valor por omisión: un registro raro deja la
/// tarjeta incompleta, nunca tumba la pantalla.

// MARK: - Modelos

/// La pieza física del inventario detrás de una asignación de kit.
struct KitPieza: Decodable, Hashable {
    var id: Int?
    var toolName: String?
    var model: String?
    var serialNumber: String?
    /// Nomenclatura interna de NEXARA (p. ej. `MUL-12345`), la que va en la etiqueta.
    var codigoInterno: String?
    var barcode: String?
    /// `AVAILABLE` | `ASSIGNED` | `IN_REPAIR` | `RETIRED`.
    var status: String?

    private enum CodingKeys: String, CodingKey {
        case id, toolName, model, serialNumber, codigoInterno, barcode, status
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decode(Int.self, forKey: .id)
        toolName = try? c.decode(String.self, forKey: .toolName)
        model = try? c.decode(String.self, forKey: .model)
        serialNumber = try? c.decode(String.self, forKey: .serialNumber)
        codigoInterno = try? c.decode(String.self, forKey: .codigoInterno)
        barcode = try? c.decode(String.self, forKey: .barcode)
        status = try? c.decode(String.self, forKey: .status)
    }
}

/// Un parte de daño o incidencia sobre una herramienta del kit. `resolution` es
/// `PENDING` mientras nadie ha dictaminado si fue mal uso o falla del equipo.
struct KitEvento: Decodable, Hashable {
    var id: Int?
    var description: String?
    var resolution: String?
    var reportedAt: String?
    var resolvedAt: String?

    private enum CodingKeys: String, CodingKey { case id, description, resolution, reportedAt, resolvedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decode(Int.self, forKey: .id)
        description = try? c.decode(String.self, forKey: .description)
        resolution = try? c.decode(String.self, forKey: .resolution)
        reportedAt = try? c.decode(String.self, forKey: .reportedAt)
        resolvedAt = try? c.decode(String.self, forKey: .resolvedAt)
    }
}

/// Una herramienta asignada a mí de forma permanente (`GET tool-requests/kits/my`).
/// No es un préstamo: el kit es lo que la persona trae siempre y de lo que responde.
struct KitAsignacion: Decodable, Hashable, Identifiable {
    var id: Int = 0
    var inventoryItemId: Int?
    /// `KIT` (permanente) | `LOAN`.
    var assignmentType: String?
    var assignedAt: String?
    var dueReturnDate: String?
    var returnedAt: String?
    var isActive: Bool?
    var replacementCount: Int?
    var notes: String?
    /// Cada cuántos días toca revisión. `nil` = sin revisión periódica.
    var inspeccionCadaDias: Int?
    var proximaInspeccion: String?
    var inventoryItem: KitPieza?
    /// Las 20 últimas incidencias, de la más reciente a la más vieja.
    var events: [KitEvento] = []
    /// Solo en `GET tool-requests/kits/users`: de quién es el kit.
    var user: HerramientaAprobador? = nil

    private enum CodingKeys: String, CodingKey {
        case id, inventoryItemId, assignmentType, assignedAt, dueReturnDate, returnedAt, isActive
        case replacementCount, notes, inspeccionCadaDias, proximaInspeccion, inventoryItem, events, user
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        inventoryItemId = try? c.decode(Int.self, forKey: .inventoryItemId)
        assignmentType = try? c.decode(String.self, forKey: .assignmentType)
        assignedAt = try? c.decode(String.self, forKey: .assignedAt)
        dueReturnDate = try? c.decode(String.self, forKey: .dueReturnDate)
        returnedAt = try? c.decode(String.self, forKey: .returnedAt)
        isActive = try? c.decode(Bool.self, forKey: .isActive)
        replacementCount = try? c.decode(Int.self, forKey: .replacementCount)
        notes = try? c.decode(String.self, forKey: .notes)
        inspeccionCadaDias = try? c.decode(Int.self, forKey: .inspeccionCadaDias)
        proximaInspeccion = try? c.decode(String.self, forKey: .proximaInspeccion)
        inventoryItem = try? c.decode(KitPieza.self, forKey: .inventoryItem)
        events = (try? c.decode([KitEvento].self, forKey: .events)) ?? []
        user = try? c.decode(HerramientaAprobador.self, forKey: .user)
    }
}

/// Una persona ligada a una herramienta: quien autorizó el préstamo, quien lo pidió o
/// de quién es el kit.
struct HerramientaAprobador: Decodable, Hashable {
    var id: Int?
    var nombre: String?
    var email: String?

    private enum CodingKeys: String, CodingKey { case id, nombre, email }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decode(Int.self, forKey: .id)
        nombre = try? c.decode(String.self, forKey: .nombre)
        email = try? c.decode(String.self, forKey: .email)
    }
}

/// Un préstamo de herramienta (`GET tool-requests/my-requests`).
///
/// `status` es `ToolRequestStatus`: `PENDING` | `APPROVED` | `IN_USE` | `RETURNED` |
/// `DAMAGED` | `REJECTED`. `pickupCode` es el código que el almacén teclea al
/// entregar y que caduca en `pickupExpiresAt`.
struct PrestamoHerramienta: Decodable, Hashable, Identifiable {
    var id: Int = 0
    var usuarioId: Int?
    var toolName: String?
    var model: String?
    var serialNumber: String?
    var reason: String?
    var status: String?
    var startDate: String?
    var expectedReturnDate: String?
    var requestDate: String?
    var approvalDate: String?
    var deliveryDate: String?
    var returnDate: String?
    var damageDescription: String?
    var adminNotes: String?
    var renewalCount: Int?
    /// OT para la que se pidió. `nil` = préstamo suelto.
    var activityId: Int?
    var pickupCode: String?
    var pickupExpiresAt: String?
    var pickedUpAt: String?
    var approver: HerramientaAprobador?
    /// La pieza del inventario; con ella se sabe quién trae cada una.
    var inventoryItemId: Int? = nil
    /// Quien lo pidió. Solo en las listas de toda la empresa (`GET tool-requests`).
    var usuario: HerramientaAprobador? = nil

    private enum CodingKeys: String, CodingKey {
        case id, usuarioId, toolName, model, serialNumber, reason, status, startDate
        case expectedReturnDate, requestDate, approvalDate, deliveryDate, returnDate
        case damageDescription, adminNotes, renewalCount, activityId
        case pickupCode, pickupExpiresAt, pickedUpAt, approver, inventoryItemId, usuario
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func texto(_ k: CodingKeys) -> String? { try? c.decode(String.self, forKey: k) }
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        usuarioId = try? c.decode(Int.self, forKey: .usuarioId)
        toolName = texto(.toolName)
        model = texto(.model)
        serialNumber = texto(.serialNumber)
        reason = texto(.reason)
        status = texto(.status)
        startDate = texto(.startDate)
        expectedReturnDate = texto(.expectedReturnDate)
        requestDate = texto(.requestDate)
        approvalDate = texto(.approvalDate)
        deliveryDate = texto(.deliveryDate)
        returnDate = texto(.returnDate)
        damageDescription = texto(.damageDescription)
        adminNotes = texto(.adminNotes)
        renewalCount = try? c.decode(Int.self, forKey: .renewalCount)
        activityId = try? c.decode(Int.self, forKey: .activityId)
        pickupCode = texto(.pickupCode)
        pickupExpiresAt = texto(.pickupExpiresAt)
        pickedUpAt = texto(.pickedUpAt)
        approver = try? c.decode(HerramientaAprobador.self, forKey: .approver)
        inventoryItemId = try? c.decode(Int.self, forKey: .inventoryItemId)
        usuario = try? c.decode(HerramientaAprobador.self, forKey: .usuario)
    }
}

/// Una pieza del inventario (`GET tool-requests/inventory` y `inventory/search`).
/// `status` es `ToolInventoryStatus`: `AVAILABLE` | `ASSIGNED` | `IN_REPAIR` | `RETIRED`.
struct PiezaDeInventario: Decodable, Hashable, Identifiable {
    var id: Int = 0
    var toolName: String?
    var model: String?
    var serialNumber: String?
    var codigoInterno: String?
    var barcode: String?
    var status: String?

    private enum CodingKeys: String, CodingKey {
        case id, toolName, model, serialNumber, codigoInterno, barcode, status
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        toolName = try? c.decode(String.self, forKey: .toolName)
        model = try? c.decode(String.self, forKey: .model)
        serialNumber = try? c.decode(String.self, forKey: .serialNumber)
        codigoInterno = try? c.decode(String.self, forKey: .codigoInterno)
        barcode = try? c.decode(String.self, forKey: .barcode)
        status = try? c.decode(String.self, forKey: .status)
    }
}

/// Una prórroga por decidir (`GET tool-requests/renewals/pending`), con su préstamo dentro.
struct RenovacionHerramienta: Decodable, Hashable, Identifiable {
    var id: Int = 0
    var toolRequestId: Int?
    var previousReturnDate: String?
    var newReturnDate: String?
    var renewalReason: String?
    /// `PENDING` | `APPROVED` | `REJECTED`.
    var status: String?
    var requestDate: String?
    var toolRequest: PrestamoHerramienta?

    private enum CodingKeys: String, CodingKey {
        case id, toolRequestId, previousReturnDate, newReturnDate, renewalReason, status
        case requestDate, toolRequest
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        toolRequestId = try? c.decode(Int.self, forKey: .toolRequestId)
        previousReturnDate = try? c.decode(String.self, forKey: .previousReturnDate)
        newReturnDate = try? c.decode(String.self, forKey: .newReturnDate)
        renewalReason = try? c.decode(String.self, forKey: .renewalReason)
        status = try? c.decode(String.self, forKey: .status)
        requestDate = try? c.decode(String.self, forKey: .requestDate)
        toolRequest = try? c.decode(PrestamoHerramienta.self, forKey: .toolRequest)
    }
}

/// Una actividad propia y abierta, para «¿para qué actividad?» (`GET tool-requests/mis-actividades`).
struct ActividadDeSolicitud: Decodable, Hashable, Identifiable {
    var id: Int = 0
    var anNumber: String?
    var titulo: String?

    private enum CodingKeys: String, CodingKey { case id, anNumber, titulo }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        anNumber = try? c.decode(String.self, forKey: .anNumber)
        titulo = try? c.decode(String.self, forKey: .titulo)
    }
}

/// `POST tool-requests/:id/renewal-request` — `newReturnDate` viaja como texto ISO
/// porque el controlador hace `new Date(data.newReturnDate)`.
private struct PedirRenovacionBody: Encodable {
    let newReturnDate: String
    let renewalReason: String?
}

/// `POST tool-requests`. `usuarioId` es el propio: el controlador rechaza cualquier otro.
private struct PedirPrestamoBody: Encodable {
    let usuarioId: Int
    let inventoryItemId: Int
    let reason: String
    let startDate: String
    let expectedReturnDate: String
    let activityId: Int?
}

/// Para las acciones del API que no llevan cuerpo.
private struct HerramientaSinCuerpo: Encodable {}

// MARK: - Repositorio

final class HerramientasRepository {
    static let shared = HerramientasRepository()
    private let api = ApiClient.shared
    private init() {}

    /// Todo lo de la pantalla en una lectura. Una lista vacía no distingue entre «no
    /// tienes nada» y «no se pudo leer», así que cada parte guarda su propio fallo.
    struct Datos {
        var kit: [KitAsignacion] = []
        var prestamos: [PrestamoHerramienta] = []
        var empresa: [PrestamoHerramienta] = []
        var renovaciones: [RenovacionHerramienta] = []
        var inventario: [PiezaDeInventario] = []
        var kitsEmpresa: [KitAsignacion] = []
        var falloKit: Error?
        var falloPrestamos: Error?
        var falloEmpresa: Error?
        var falloRenovaciones: Error?
        var falloInventario: Error?
        /// Cuántas partes le tocan a quien mira. Los kits de la gente no cuentan: solo
        /// sirven para decir quién trae cada pieza.
        var pedidas = 0

        private var caidas: Int {
            let fallos: [Error?] = [falloKit, falloPrestamos, falloEmpresa, falloRenovaciones, falloInventario]
            return fallos.compactMap { $0 }.count
        }

        /// Todo cayó: no hay nada que enseñar y toca pantalla de error.
        var todoFallo: Bool { pedidas > 0 && caidas >= pedidas }
    }

    /// Lo que le toca a cada perfil, a la vez y cada parte con su fallo por su lado: un
    /// 403 en una parte no deja sin pantalla a quien sí puede leer las otras.
    func cargar(perfil: HerramientasReglas.Perfil) async -> Datos {
        let propio = perfil != .direccion
        let deEmpresa = perfil != .personal
        let decide = perfil == .administra

        async let kit: Result<[KitAsignacion], Error> = leer("tool-requests/kits/my", si: propio)
        async let prestamos: Result<[PrestamoHerramienta], Error> = leer("tool-requests/my-requests", si: propio)
        async let empresa: Result<[PrestamoHerramienta], Error> = leer("tool-requests", si: deEmpresa)
        async let renovaciones: Result<[RenovacionHerramienta], Error> = leer("tool-requests/renewals/pending", si: decide)
        async let inventario: Result<[PiezaDeInventario], Error> = leer("tool-requests/inventory", si: deEmpresa)
        async let kits: Result<[KitAsignacion], Error> = leer("tool-requests/kits/users", si: deEmpresa)

        let resultadoKit = await kit
        let resultadoPrestamos = await prestamos
        let resultadoEmpresa = await empresa
        let resultadoRenovaciones = await renovaciones
        let resultadoInventario = await inventario
        let resultadoKits = await kits

        var datos = Datos()
        datos.pedidas = (propio ? 2 : 0) + (deEmpresa ? 2 : 0) + (decide ? 1 : 0)
        switch resultadoKit {
        case .success(let lista): datos.kit = lista
        case .failure(let error): datos.falloKit = error
        }
        switch resultadoPrestamos {
        case .success(let lista): datos.prestamos = lista
        case .failure(let error): datos.falloPrestamos = error
        }
        switch resultadoEmpresa {
        case .success(let lista): datos.empresa = lista
        case .failure(let error): datos.falloEmpresa = error
        }
        switch resultadoRenovaciones {
        case .success(let lista): datos.renovaciones = lista
        case .failure(let error): datos.falloRenovaciones = error
        }
        switch resultadoInventario {
        case .success(let lista): datos.inventario = lista
        case .failure(let error): datos.falloInventario = error
        }
        if case .success(let lista) = resultadoKits { datos.kitsEmpresa = lista }
        return datos
    }

    /// Una lista del API. Con `si: false` ni se pide: esa parte no le toca a quien mira.
    private func leer<T: Decodable>(_ ruta: String, si pedir: Bool) async -> Result<[T], Error> {
        guard pedir else { return .success([]) }
        do {
            let data = try await api.get(ruta)
            let lista: [T] = try ApiClient.decodeList(data)
            return .success(lista)
        } catch {
            return .failure(error)
        }
    }

    // MARK: Pedir préstamo

    /// `GET tool-requests/inventory/search?q=`: solo piezas libres, 15 como mucho.
    func buscarInventario(_ consulta: String) async throws -> [PiezaDeInventario] {
        let data = try await api.get("tool-requests/inventory/search", query: ["q": consulta])
        return try ApiClient.decodeList(data)
    }

    /// `GET tool-requests/mis-actividades`: lo propio y abierto.
    func misActividades() async throws -> [ActividadDeSolicitud] {
        let data = try await api.get("tool-requests/mis-actividades")
        return try ApiClient.decodeList(data)
    }

    /// `POST tool-requests`. Solo con señal: el servidor revisa si la pieza sigue libre, y
    /// encolado se enteraría horas después de que ya se la llevó otro.
    func pedirPrestamo(
        usuarioId: Int,
        inventarioId: Int,
        motivo: String,
        desde: HerramientasReglas.Dia,
        hasta: HerramientasReglas.Dia,
        actividadId: Int?
    ) async throws {
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON(
            "tool-requests",
            body: PedirPrestamoBody(
                usuarioId: usuarioId,
                inventoryItemId: inventarioId,
                reason: motivo.trimmingCharacters(in: .whitespacesAndNewlines),
                startDate: HerramientasReglas.fechaParaApi(desde),
                expectedReturnDate: HerramientasReglas.fechaParaApi(hasta),
                activityId: actividadId
            )
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `POST tool-requests/kits/:id/report`. Devuelve `true` cuando se quedó en la cola sin
    /// conexión: un parte de daño sí puede esperar, el servidor lo deja en `PENDING`.
    func reportarDanio(asignacionId: Int, descripcion: String) async throws -> Bool {
        struct Body: Encodable { let description: String }
        let data = try await api.postJSON(
            "tool-requests/kits/\(asignacionId)/report",
            body: Body(description: descripcion.trimmingCharacters(in: .whitespacesAndNewlines))
        )
        return CoreRepository.isQueuedOffline(data)
    }

    // MARK: Decidir

    /// `POST tool-requests/:id/approve`. El servidor genera el código de recolección.
    func aprobar(prestamoId: Int) async throws {
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON("tool-requests/\(prestamoId)/approve", body: HerramientaSinCuerpo())
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `POST tool-requests/:id/reject`: el motivo le llega a quien la pidió.
    func rechazar(prestamoId: Int, motivo: String) async throws {
        struct Body: Encodable { let adminNotes: String }
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON(
            "tool-requests/\(prestamoId)/reject",
            body: Body(adminNotes: motivo.trimmingCharacters(in: .whitespacesAndNewlines))
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `POST tool-requests/renewals/:id/approve`.
    func aprobarRenovacion(id: Int) async throws {
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON("tool-requests/renewals/\(id)/approve", body: HerramientaSinCuerpo())
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `POST tool-requests/renewals/:id/reject`.
    func rechazarRenovacion(id: Int, motivo: String) async throws {
        struct Body: Encodable { let reason: String }
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON(
            "tool-requests/renewals/\(id)/reject",
            body: Body(reason: motivo.trimmingCharacters(in: .whitespacesAndNewlines))
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    // MARK: Nueva herramienta

    /// `POST tool-requests/inventory` (multipart). Las dos fotos son obligatorias: sin ellas
    /// el servidor contesta 403. El código interno lo calcula él.
    func nuevaHerramienta(
        nombre: String,
        modelo: String,
        serie: String,
        panoramica: CapturedGeoPhoto,
        fotoDeSerie: CapturedGeoPhoto
    ) async throws {
        try await CoreRepository.requireOnline()
        let archivos: [(field: String, data: Data, fileName: String, mimeType: String)] = [
            (field: "panoramicPhoto", data: panoramica.jpeg, fileName: "panoramica.jpg", mimeType: "image/jpeg"),
            (field: "serialPhoto", data: fotoDeSerie.jpeg, fileName: "serie.jpg", mimeType: "image/jpeg"),
        ]
        let data = try await api.uploadMultipartFiles(
            "tool-requests/inventory",
            fields: [
                "toolName": nombre.trimmingCharacters(in: .whitespacesAndNewlines),
                "model": modelo.trimmingCharacters(in: .whitespacesAndNewlines),
                "serialNumber": serie.trimmingCharacters(in: .whitespacesAndNewlines),
            ],
            files: archivos
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    // MARK: Prórroga

    /// Pide más plazo para un préstamo propio. Devuelve `true` cuando se quedó en la
    /// cola sin conexión, para decirlo con esas palabras en vez de fingir que salió.
    /// Encolarla es correcto: el servidor la crea en `PENDING` y alguien la decide después.
    func pedirRenovacion(prestamoId: Int, nuevaFecha: HerramientasReglas.Dia, motivo: String?) async throws -> Bool {
        let data = try await api.postJSON(
            "tool-requests/\(prestamoId)/renewal-request",
            body: PedirRenovacionBody(
                newReturnDate: HerramientasReglas.fechaParaApi(nuevaFecha),
                renewalReason: motivo?.nilSiVacio
            )
        )
        return CoreRepository.isQueuedOffline(data)
    }
}
