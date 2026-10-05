import Foundation

/// Herramientas de Core — espejo de `HerramientasApi.kt` / `HerramientasRepository.kt`
/// en Android y de `apps/api/src/tool-requests/tool-requests.controller.ts`.
///
/// Solo están los endpoints que **una persona de campo puede llamar** (`tools.view`):
///
/// | Qué                 | Endpoint                                      |
/// |---------------------|-----------------------------------------------|
/// | Mi kit              | `GET tool-requests/kits/my`                   |
/// | Mis préstamos       | `GET tool-requests/my-requests`               |
/// | Pedir más plazo     | `POST tool-requests/:id/renewal-request`      |
///
/// Lo demás del controlador (inventario, kits de otros, aprobar, rechazar) exige
/// `tools.manage`; declararlo solo serviría para pintar botones que contestan 403.
/// Tampoco está `POST tool-requests` (pedir prestada): `assertCanCreateToolLoan` lo
/// limita por correo y exige elegir una pieza del inventario que esas personas no
/// pueden leer. El escáner de etiquetas (buscar, entregar, recibir) vive en
/// `EscaneoRepository`.
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

    private enum CodingKeys: String, CodingKey {
        case id, inventoryItemId, assignmentType, assignedAt, dueReturnDate, returnedAt, isActive
        case replacementCount, notes, inspeccionCadaDias, proximaInspeccion, inventoryItem, events
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
    }
}

/// Quién autorizó el préstamo.
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

    private enum CodingKeys: String, CodingKey {
        case id, usuarioId, toolName, model, serialNumber, reason, status, startDate
        case expectedReturnDate, requestDate, approvalDate, deliveryDate, returnDate
        case damageDescription, adminNotes, renewalCount, activityId
        case pickupCode, pickupExpiresAt, pickedUpAt, approver
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
    }
}

/// `POST tool-requests/:id/renewal-request` — `newReturnDate` viaja como texto ISO
/// porque el controlador hace `new Date(data.newReturnDate)`.
private struct PedirRenovacionBody: Encodable {
    let newReturnDate: String
    let renewalReason: String?
}

// MARK: - Repositorio

final class HerramientasRepository {
    static let shared = HerramientasRepository()
    private let api = ApiClient.shared
    private init() {}

    /// Todo lo de la pantalla en una lectura. Una lista vacía no distingue entre «no
    /// tienes nada» y «no se pudo leer», así que cada mitad guarda su propio fallo.
    struct Datos {
        var kit: [KitAsignacion] = []
        var prestamos: [PrestamoHerramienta] = []
        var falloKit: Error?
        var falloPrestamos: Error?

        /// Las dos mitades cayeron: no hay nada que enseñar y toca pantalla de error.
        var todoFallo: Bool { falloKit != nil && falloPrestamos != nil }
    }

    /// Las dos listas a la vez, cada una con su fallo por su lado: quien no tiene
    /// kit pero sí préstamos —o al revés— no se queda sin pantalla por un 403 en la
    /// mitad que no le toca.
    func cargar() async -> Datos {
        async let kit = leerKit()
        async let prestamos = leerPrestamos()
        let (k, p) = await (kit, prestamos)
        var datos = Datos()
        switch k {
        case .success(let lista): datos.kit = lista
        case .failure(let error): datos.falloKit = error
        }
        switch p {
        case .success(let lista): datos.prestamos = lista
        case .failure(let error): datos.falloPrestamos = error
        }
        return datos
    }

    private func leerKit() async -> Result<[KitAsignacion], Error> {
        do {
            let data = try await api.get("tool-requests/kits/my")
            let lista: [KitAsignacion] = try ApiClient.decodeList(data)
            return .success(lista)
        } catch {
            return .failure(error)
        }
    }

    private func leerPrestamos() async -> Result<[PrestamoHerramienta], Error> {
        do {
            let data = try await api.get("tool-requests/my-requests")
            let lista: [PrestamoHerramienta] = try ApiClient.decodeList(data)
            return .success(lista)
        } catch {
            return .failure(error)
        }
    }

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
