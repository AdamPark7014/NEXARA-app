import Foundation

// Lo que cada rol ve y hace además de lo suyo, en la sesión ficticia:
//  - Herramientas: préstamos de toda la empresa, inventario, kits de la gente, prórrogas por
//    decidir, búsqueda para pedir, pedir, reportar daño, aprobar, rechazar, entregar, recibir y
//    dar de alta (`tool-requests`, las formas de `HerramientasRepository.swift`).
//  - Almacén: movimientos con quién los hizo (`stock/movements`).
//  - Pagos a empleados: lista, registrar y marcar pagado (`employee-payments`).
//  - Vehículos: solicitudes por aprobar y dar de alta unidades (`vehicles`, `vehicles/inventory`).
//
// Cada pantalla trae sus estados para que se vea con datos en las capturas. Nada es real: los
// días van como el día de México + `T12:00:00.000Z` y los instantes son relativos a la entrada
// al demo, como el resto.

/// Un opcional para el JSON del demo: el valor o `null`.
private func porRolNulo(_ valor: Any?) -> Any {
    valor ?? NSNull()
}

/// Campos de texto de un `multipart/form-data` (las fotos se ignoran).
private func porRolCampos(_ body: Data?) -> [String: String] {
    guard let body, !body.isEmpty else { return [:] }
    let texto = String(decoding: body, as: UTF8.self)
    guard let regex = try? NSRegularExpression(pattern: "name=\"([^\"]+)\"\\r\\n\\r\\n([^\\r]*)\\r\\n") else {
        return [:]
    }
    var campos: [String: String] = [:]
    let rango = NSRange(texto.startIndex..<texto.endIndex, in: texto)
    regex.enumerateMatches(in: texto, options: [], range: rango) { coincidencia, _, _ in
        guard let coincidencia,
              let clave = Range(coincidencia.range(at: 1), in: texto),
              let valor = Range(coincidencia.range(at: 2), in: texto) else { return }
        campos[String(texto[clave])] = String(texto[valor])
    }
    return campos
}

/// Lo que el usuario «hace» en estas pantallas. Vive fuera de `DemoStore` para no tocar su
/// `seed()`: se vuelve a sembrar cuando cambia el epoch (cada entrada al demo) y solo se usa
/// con `DemoStore.lock` tomado.
private final class PorRolDemoEstado {
    static let shared = PorRolDemoEstado()
    var epoch: Date?
    var prestamos: [DemoJSON] = []
    var renovaciones: [DemoJSON] = []
    var inventario: [DemoJSON] = []
    var kits: [DemoJSON] = []
    var misNuevos: [DemoJSON] = []
    var partes: [Int: [DemoJSON]] = [:]
    var pagos: [DemoJSON] = []
    var solicitudes: [DemoJSON] = []
    var unidades: [DemoJSON] = []
    var siguienteId = 9600
}

extension DemoStore {

    // MARK: Siembra

    private func porRolAsegurar() {
        let estado = PorRolDemoEstado.shared
        guard estado.epoch != epoch else { return }
        estado.epoch = epoch
        estado.inventario = porRolSembrarInventario()
        estado.prestamos = porRolSembrarPrestamos()
        estado.renovaciones = porRolSembrarRenovaciones()
        estado.kits = porRolSembrarKits()
        estado.misNuevos = []
        estado.partes = [:]
        estado.pagos = fxPagosEmpleados()
        estado.solicitudes = porRolSembrarSolicitudes()
        estado.unidades = []
        estado.siguienteId = 9600
    }

    private func porRolSiguienteId() -> Int {
        let estado = PorRolDemoEstado.shared
        estado.siguienteId += 1
        return estado.siguienteId
    }

    private func porRolError(_ status: Int, _ mensaje: String) -> DemoRespuesta {
        (status, dj(["statusCode": status, "message": mensaje]))
    }

    /// `AAAA-MM-DDT12:00:00.000Z` del día de México que cae `dias` después de hoy.
    private func porRolDia(_ dias: Int) -> String {
        HerramientasReglas.fechaParaApi(HerramientasReglas.Dia.hoy(epoch).sumando(dias: dias))
    }

    private func porRolHace(dias: Int, horas: Int = 0) -> String {
        iso(-(dias * 24 * 60) - horas * 60)
    }

    private func porRolPersona(_ id: Int) -> DemoJSON {
        let persona = DemoData.person(id)
        return dj(["id": persona.id, "nombre": persona.nombre, "email": persona.email, "puesto": persona.puesto, "avatarUrl": NSNull()])
    }

    // MARK: Herramientas · inventario

    private func porRolPieza(_ id: Int, _ nombre: String, _ modelo: String, _ serie: String, _ codigo: String, _ estado: String) -> DemoJSON {
        dj([
            "id": id, "toolName": nombre, "model": modelo, "serialNumber": serie,
            "codigoInterno": codigo, "barcode": codigo, "status": estado,
            "panoramicPhotoUrl": "demo/panoramica.jpg", "serialPhotoUrl": "demo/serie.jpg",
        ])
    }

    private func porRolSembrarInventario() -> [DemoJSON] {
        [
            porRolPieza(5605, "Cámara termográfica", "FLIR E8-XT", "FLIR-E8-7731", "CAM-00005", "AVAILABLE"),
            porRolPieza(5603, "Escalera de tijera", "Fibra de vidrio 6 peldaños", "ES-6001", "ESC-00003", "AVAILABLE"),
            porRolPieza(5606, "Fusionadora de fibra óptica", "Fujikura 41S", "FJ41S-0093", "FUS-00006", "IN_REPAIR"),
            porRolPieza(5602, "Multímetro digital", "Fluke 117", "FK-30117", "MUL-00002", "AVAILABLE"),
            porRolPieza(5607, "Pinza amperimétrica", "Fluke 323", "FK323-55810", "PIN-00007", "ASSIGNED"),
            porRolPieza(5604, "Rotomartillo SDS Plus", "Bosch GBH 2-28 L", "BH-55120", "ROT-00004", "ASSIGNED"),
            porRolPieza(5601, "Taladro inalámbrico", "DeWalt DCD771 18 V", "TL-88213", "TAL-00001", "ASSIGNED"),
            porRolPieza(5609, "Taladro percutor", "Bosch GSB 13 RE", "GSB-20417", "TAL-00009", "AVAILABLE"),
            porRolPieza(5608, "Arnés de seguridad", "3M DBI-SALA Delta", "DS-1109872", "ARN-00008", "AVAILABLE"),
        ]
    }

    private func porRolInventarioOrdenado() -> [DemoJSON] {
        PorRolDemoEstado.shared.inventario.sorted {
            ($0["toolName"] as? String ?? "") < ($1["toolName"] as? String ?? "")
        }
    }

    private func porRolAjustarPieza(_ id: Any?, estado nuevo: String) {
        guard let id = id as? Int else { return }
        let estado = PorRolDemoEstado.shared
        guard let indice = estado.inventario.firstIndex(where: { ($0["id"] as? Int) == id }) else { return }
        estado.inventario[indice]["status"] = nuevo
    }

    // MARK: Herramientas · préstamos

    private func porRolPrestamo(
        id: Int,
        pieza: Int?,
        de persona: Int,
        estado: String,
        devolver: Int,
        pedidoHaceDias: Int,
        motivo: String,
        codigo: String? = nil,
        danio: String? = nil,
        notas: String? = nil
    ) -> DemoJSON {
        let datos = PorRolDemoEstado.shared.inventario.first { ($0["id"] as? Int) == pieza }
        return dj([
            "id": id,
            "usuarioId": persona,
            "inventoryItemId": porRolNulo(pieza),
            "toolName": porRolNulo(datos?["toolName"]),
            "model": porRolNulo(datos?["model"]),
            "serialNumber": porRolNulo(datos?["serialNumber"]),
            "reason": motivo,
            "status": estado,
            "startDate": porRolDia(-pedidoHaceDias),
            "expectedReturnDate": porRolDia(devolver),
            "requestDate": porRolHace(dias: pedidoHaceDias, horas: 3),
            "approvalDate": NSNull(),
            "deliveryDate": NSNull(),
            "returnDate": NSNull(),
            "damageDescription": porRolNulo(danio),
            "adminNotes": porRolNulo(notas),
            "renewalCount": 0,
            "activityId": NSNull(),
            "pickupCode": porRolNulo(codigo),
            // El código sirve 48 h desde que se aprueba (`PICKUP_VIGENCIA_HORAS`).
            "pickupExpiresAt": porRolNulo(codigo == nil ? nil : iso(36 * 60)),
            "pickedUpAt": NSNull(),
            "approver": NSNull(),
            "usuario": porRolPersona(persona),
        ])
    }

    private func porRolSembrarPrestamos() -> [DemoJSON] {
        [
            porRolPrestamo(
                id: 6301, pieza: 5605, de: 102, estado: "PENDING", devolver: 8, pedidoHaceDias: 1,
                motivo: "Revisión de tableros en Colegio Montebello antes del mantenimiento preventivo."
            ),
            porRolPrestamo(
                id: 6302, pieza: 5603, de: 106, estado: "PENDING", devolver: 3, pedidoHaceDias: 0,
                motivo: "Instalación de cámaras en la fachada de Hotel Casa Azul."
            ),
            porRolPrestamo(
                id: 6303, pieza: 5602, de: 104, estado: "APPROVED", devolver: 6, pedidoHaceDias: 2,
                motivo: "Pruebas del tablero de Corporativo Atlixco.", codigo: "KQ7M3H"
            ),
            porRolPrestamo(
                id: 6304, pieza: 5601, de: 101, estado: "IN_USE", devolver: -2, pedidoHaceDias: 9,
                motivo: "Anclajes del rack en el site de Corporativo Atlixco."
            ),
            porRolPrestamo(
                id: 6305, pieza: 5604, de: 103, estado: "IN_USE", devolver: 5, pedidoHaceDias: 12,
                motivo: "Perforación de losa para canalización en Grupo Textil."
            ),
            porRolPrestamo(
                id: 6306, pieza: 5608, de: 105, estado: "RETURNED", devolver: -12, pedidoHaceDias: 20,
                motivo: "Trabajo en altura en la nave de almacenaje."
            ),
            porRolPrestamo(
                id: 6307, pieza: 5606, de: 108, estado: "DAMAGED", devolver: -20, pedidoHaceDias: 30,
                motivo: "Empalmes del enlace de fibra entre edificios.",
                danio: "Regresó con la pantalla estrellada; queda en reparación."
            ),
            porRolPrestamo(
                id: 6308, pieza: nil, de: 109, estado: "REJECTED", devolver: 4, pedidoHaceDias: 5,
                motivo: "Respaldo de energía para la puesta en marcha.",
                notas: "No hay generador libre esta semana; pídelo de nuevo el lunes."
            ),
        ]
    }

    private func porRolSembrarRenovaciones() -> [DemoJSON] {
        let prestamo = PorRolDemoEstado.shared.prestamos.first { ($0["id"] as? Int) == 6305 } ?? DemoJSON()
        return [
            dj([
                "id": 8801,
                "toolRequestId": 6305,
                "previousReturnDate": porRolDia(5),
                "newReturnDate": porRolDia(15),
                "renewalReason": "La canalización se alargó una semana más.",
                "status": "PENDING",
                "requestDate": porRolHace(dias: 0, horas: 4),
                "toolRequest": prestamo,
            ]),
        ]
    }

    private func porRolSembrarKits() -> [DemoJSON] {
        [
            dj([
                "id": 7201,
                "inventoryItemId": 5607,
                "assignmentType": "KIT",
                "assignedAt": porRolHace(dias: 150),
                "isActive": true,
                "returnedAt": NSNull(),
                "events": [DemoJSON](),
                "user": porRolPersona(102),
            ]),
        ]
    }

    // MARK: Herramientas · ruteo

    /// Lo que no es de `routeMisHerramientas` ni del escáner. `nil` = no es de aquí.
    func routeHerramientasPorRol(
        method: String,
        parts: [String],
        query: [String: String],
        json: DemoJSON,
        body: Data?
    ) -> DemoRespuesta? {
        porRolAsegurar()
        let sub = parts.count > 1 ? parts[1] : ""
        if method == "GET" {
            return porRolLecturaHerramientas(parts: parts, sub: sub, query: query)
        }
        guard method == "POST" else { return nil }
        if parts.count == 1 { return porRolPedir(json) }
        if sub == "inventory", parts.count == 2 { return porRolAltaHerramienta(porRolCampos(body)) }
        if sub == "kits", parts.count >= 4, parts[3] == "report", let id = Int(parts[2]) {
            return porRolReportar(asignacionId: id, json: json)
        }
        if sub == "renewals", parts.count >= 4, let id = Int(parts[2]) {
            return porRolDecidirRenovacion(id: id, accion: parts[3])
        }
        if parts.count >= 3, let id = Int(sub) {
            return porRolAccionDePrestamo(id: id, accion: parts[2], json: json)
        }
        return nil
    }

    private func porRolLecturaHerramientas(parts: [String], sub: String, query: [String: String]) -> DemoRespuesta? {
        let estado = PorRolDemoEstado.shared
        if parts.count == 1 { return (200, estado.prestamos) }
        switch sub {
        case "inventory" where parts.count == 2:
            return (200, porRolInventarioOrdenado())
        case "inventory" where parts.count >= 3 && parts[2] == "search":
            return (200, porRolBuscar(query["q"] ?? ""))
        case "renewals" where parts.count >= 3 && parts[2] == "pending":
            let pendientes = estado.renovaciones.filter { ($0["status"] as? String) == "PENDING" }
            return (200, pendientes)
        case "kits" where parts.count >= 3 && parts[2] == "users":
            return (200, estado.kits)
        case "mis-actividades":
            return (200, porRolMisActividades())
        default:
            return nil
        }
    }

    /// Como `searchInventoryOptions`: solo lo libre, y sin nada escrito no contesta nada.
    private func porRolBuscar(_ consulta: String) -> [DemoJSON] {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        return porRolInventarioOrdenado().filter { pieza in
            guard (pieza["status"] as? String) == "AVAILABLE" else { return false }
            let textos = ["toolName", "model", "serialNumber", "codigoInterno", "barcode"]
                .compactMap { pieza[$0] as? String }
            return textos.contains { $0.lowercased().contains(q) }
        }
    }

    private func porRolMisActividades() -> [DemoJSON] {
        DemoData.myOpenIds.compactMap { id -> DemoJSON? in
            guard let actividad = activity(id) else { return nil }
            return dj(["id": actividad.id, "anNumber": actividad.folio, "titulo": actividad.titulo, "estatus": actividad.estatus])
        }
    }

    /// `POST tool-requests`, con las revisiones de `create`: dirección no pide y la pieza
    /// tiene que estar libre y sin otra solicitud activa.
    private func porRolPedir(_ json: DemoJSON) -> DemoRespuesta {
        guard DemoMode.rol != nil else {
            return porRolError(403, "Dirección no pide herramientas prestadas: las administra.")
        }
        guard let piezaId = json["inventoryItemId"] as? Int else {
            return porRolError(400, "Debes seleccionar una herramienta del inventario")
        }
        let estado = PorRolDemoEstado.shared
        guard let pieza = estado.inventario.first(where: { ($0["id"] as? Int) == piezaId }),
              (pieza["status"] as? String) == "AVAILABLE" else {
            return porRolError(400, "La herramienta seleccionada no está disponible en inventario")
        }
        let activa = estado.prestamos.contains { prestamo in
            (prestamo["inventoryItemId"] as? Int) == piezaId
                && ["PENDING", "APPROVED", "IN_USE"].contains(prestamo["status"] as? String ?? "")
        }
        guard !activa else {
            return porRolError(400, "La herramienta ya tiene una solicitud activa y no puede duplicarse")
        }
        var nuevo = porRolPrestamo(
            id: porRolSiguienteId(), pieza: piezaId, de: DemoMode.meId, estado: "PENDING",
            devolver: 7, pedidoHaceDias: 0, motivo: json["reason"] as? String ?? ""
        )
        nuevo["expectedReturnDate"] = json["expectedReturnDate"] as? String ?? porRolDia(7)
        nuevo["activityId"] = porRolNulo(json["activityId"])
        estado.prestamos.insert(nuevo, at: 0)
        estado.misNuevos.insert(nuevo, at: 0)
        return (201, nuevo)
    }

    /// `POST tool-requests/inventory`. Las fotos son obligatorias en el servidor; aquí basta
    /// con los datos, porque el demo las pone solas.
    private func porRolAltaHerramienta(_ campos: [String: String]) -> DemoRespuesta {
        let nombre = (campos["toolName"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !nombre.isEmpty else { return porRolError(400, "Escribe el nombre de la herramienta") }
        let id = porRolSiguienteId()
        let prefijo = String(nombre.prefix(3)).uppercased()
        let pieza = porRolPieza(
            id, nombre, campos["model"] ?? "", campos["serialNumber"] ?? "",
            String(format: "%@-%05d", prefijo, id), "AVAILABLE"
        )
        PorRolDemoEstado.shared.inventario.append(pieza)
        return (201, pieza)
    }

    private func porRolReportar(asignacionId: Int, json: DemoJSON) -> DemoRespuesta {
        let parte = dj([
            "id": porRolSiguienteId(),
            "description": json["description"] as? String ?? "",
            "resolution": "PENDING",
            "reportedAt": DemoClock.iso(Date()),
            "resolvedAt": NSNull(),
        ])
        let estado = PorRolDemoEstado.shared
        estado.partes[asignacionId, default: []].insert(parte, at: 0)
        return (201, parte)
    }

    private func porRolDecidirRenovacion(id: Int, accion: String) -> DemoRespuesta? {
        guard accion == "approve" || accion == "reject" else { return nil }
        let estado = PorRolDemoEstado.shared
        guard let indice = estado.renovaciones.firstIndex(where: { ($0["id"] as? Int) == id }) else {
            return porRolError(404, "Renovación no encontrada")
        }
        estado.renovaciones[indice]["status"] = accion == "approve" ? "APPROVED" : "REJECTED"
        return (200, estado.renovaciones[indice])
    }

    /// Aprobar, rechazar, entregar y recibir. `nil` si el préstamo no es de esta lista: los del
    /// escáner los atiende `routeHerramientas`.
    private func porRolAccionDePrestamo(id: Int, accion: String, json: DemoJSON) -> DemoRespuesta? {
        let estado = PorRolDemoEstado.shared
        guard ["approve", "reject", "deliver", "return"].contains(accion),
              let indice = estado.prestamos.firstIndex(where: { ($0["id"] as? Int) == id }) else { return nil }
        let pieza = estado.prestamos[indice]["inventoryItemId"]
        switch accion {
        case "approve":
            estado.prestamos[indice]["status"] = "APPROVED"
            estado.prestamos[indice]["pickupCode"] = "PK\(id % 1000)"
            estado.prestamos[indice]["pickupExpiresAt"] = iso(48 * 60)
        case "reject":
            estado.prestamos[indice]["status"] = "REJECTED"
            estado.prestamos[indice]["adminNotes"] = json["adminNotes"] as? String ?? ""
        case "deliver":
            guard (estado.prestamos[indice]["status"] as? String) == "APPROVED" else {
                return porRolError(400, "Ese préstamo no está aprobado")
            }
            let esperado = (estado.prestamos[indice]["pickupCode"] as? String ?? "").uppercased()
            guard esperado.isEmpty || (json["pickupCode"] as? String ?? "").uppercased() == esperado else {
                return porRolError(400, "El código de recolección no coincide")
            }
            estado.prestamos[indice]["status"] = "IN_USE"
            porRolAjustarPieza(pieza, estado: "ASSIGNED")
        default:
            let danio = (json["damageDescription"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            estado.prestamos[indice]["status"] = danio.isEmpty ? "RETURNED" : "DAMAGED"
            estado.prestamos[indice]["damageDescription"] = danio.isEmpty ? NSNull() as Any : danio as Any
            porRolAjustarPieza(pieza, estado: danio.isEmpty ? "AVAILABLE" : "IN_REPAIR")
        }
        return (200, estado.prestamos[indice])
    }

    // MARK: Herramientas · lo que suma a «Mi kit» y «Mis préstamos»

    /// Lo que se pidió en esta sesión. `fxMisPrestamos` lo pone primero.
    func porRolMisPrestamosNuevos() -> [DemoJSON] {
        porRolAsegurar()
        return PorRolDemoEstado.shared.misNuevos
    }

    /// El kit con los daños reportados en esta sesión.
    func porRolConPartesNuevos(_ kit: [DemoJSON]) -> [DemoJSON] {
        porRolAsegurar()
        let partes = PorRolDemoEstado.shared.partes
        return kit.map { asignacion -> DemoJSON in
            guard let id = asignacion["id"] as? Int, let nuevos = partes[id] else { return asignacion }
            var conPartes = asignacion
            conPartes["events"] = nuevos + (asignacion["events"] as? [DemoJSON] ?? [])
            return conPartes
        }
    }

    // MARK: Almacén

    /// `GET stock/movements`: lo último que se movió, con quién lo hizo.
    func fxMovimientosAlmacen() -> [DemoJSON] {
        func movimiento(
            _ id: Int, _ tipo: String, _ cantidad: String, producto indice: Int, de origen: Int?, a destino: Int?,
            quien: Int, hace minutos: Int, nota: String? = nil
        ) -> DemoJSON {
            let semilla = DemoData.stock[indice]
            func almacen(_ almacenId: Int?) -> Any {
                guard let almacenId, let dato = DemoData.warehouses.first(where: { $0.id == almacenId }) else { return NSNull() }
                return dj(["id": dato.id, "code": dato.code, "name": dato.name])
            }
            let persona = DemoData.person(quien)
            return dj([
                "id": id,
                "movementNumber": "MOV-2026-\(id)",
                "type": tipo,
                "quantity": cantidad,
                "notes": porRolNulo(nota),
                "createdAt": iso(-minutos),
                "product": dj(["id": 300 + semilla.id, "name": semilla.name, "sku": semilla.sku]),
                "fromWarehouse": almacen(origen),
                "toWarehouse": almacen(destino),
                "createdBy": dj(["id": persona.id, "nombre": persona.nombre]),
            ])
        }
        return [
            movimiento(4412, "DISPATCH", "2", producto: 0, de: 1, a: nil, quien: 109, hace: 95, nota: "Para el site de Corporativo Atlixco."),
            movimiento(4411, "RECEIPT", "50", producto: 1, de: nil, a: 1, quien: 109, hace: 240),
            movimiento(4410, "TRANSFER", "6", producto: 7, de: 1, a: 2, quien: 104, hace: 26 * 60, nota: "Se van a la obra de Atlixco."),
            movimiento(4409, "DISPATCH", "12", producto: 3, de: 1, a: nil, quien: 109, hace: 30 * 60),
            movimiento(4408, "ADJUSTMENT", "3", producto: 5, de: nil, a: 1, quien: 101, hace: 3 * 24 * 60, nota: "Conteo físico de fin de mes."),
            movimiento(4407, "RECEIPT", "20", producto: 9, de: nil, a: 2, quien: 109, hace: 4 * 24 * 60),
            movimiento(4406, "DISPATCH", "4", producto: 4, de: 2, a: nil, quien: 106, hace: 5 * 24 * 60),
        ]
    }

    // MARK: Pagos a empleados

    /// `employee-payments`: la lista, `POST` (nace en borrador, como pide la app) y `:id/pagado`.
    func routePagosPorRol(method: String, parts: [String], body: Data?) -> DemoRespuesta {
        porRolAsegurar()
        let estado = PorRolDemoEstado.shared
        if method == "GET", parts.count == 1 { return (200, estado.pagos) }
        if method == "POST", parts.count == 1 { return porRolRegistrarPago(porRolCampos(body)) }
        if method == "PATCH", parts.count >= 3, parts[2] == "pagado", let id = Int(parts[1]) {
            guard let indice = estado.pagos.firstIndex(where: { ($0["id"] as? Int) == id }) else {
                return porRolError(404, "Pago no encontrado")
            }
            guard (estado.pagos[indice]["status"] as? String) != "Anulado" else {
                return porRolError(400, "No se puede pagar un registro anulado")
            }
            estado.pagos[indice]["status"] = "Pagado"
            estado.pagos[indice]["paidAt"] = DemoClock.iso(Date())
            estado.pagos[indice]["contabilidadRef"] = "PAG-2026-\(id % 1000)"
            estado.pagos[indice]["journalEntryId"] = 4000 + id % 1000
            return (200, estado.pagos[indice])
        }
        return (200, method == "GET" ? [DemoJSON]() as Any : DemoJSON() as Any)
    }

    private func porRolRegistrarPago(_ campos: [String: String]) -> DemoRespuesta {
        guard let userId = Int(campos["userId"] ?? ""), userId > 0 else { return porRolError(400, "Empleado invalido") }
        guard let desde = campos["periodFrom"], let hasta = campos["periodTo"], !desde.isEmpty, desde <= hasta else {
            return porRolError(400, "Rango invalido")
        }
        guard let monto = campos["amount"], (Double(monto) ?? 0) > 0 else { return porRolError(400, "Monto invalido") }
        let id = porRolSiguienteId()
        let concepto = (campos["concepto"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let pago = dj([
            "id": id,
            "userId": userId,
            "periodFrom": "\(desde)T00:00:00.000Z",
            "periodTo": "\(hasta)T00:00:00.000Z",
            "totalMinutes": 0,
            "amount": monto,
            "concepto": concepto.isEmpty ? "Pago a empleado" : concepto,
            "note": porRolNulo(campos["note"]),
            "status": campos["status"] ?? "Borrador",
            "paidAt": NSNull(),
            "contabilidadRef": NSNull(),
            "journalEntryId": NSNull(),
            "evidenceUrls": [String](),
            "createdAt": DemoClock.iso(Date()),
            "user": porRolPersona(userId),
            "createdBy": porRolPersona(DemoMode.meId),
        ])
        PorRolDemoEstado.shared.pagos.insert(pago, at: 0)
        return (201, pago)
    }

    // MARK: Vehículos

    private func porRolSolicitud(
        _ id: Int, _ nombre: String, _ placas: String, _ vehiculoId: Int, de persona: Int,
        estatus: String, motivo: String, inicio: Int, fin: Int, actividad: String
    ) -> DemoJSON {
        let quien = DemoData.person(persona)
        return dj([
            "id": id,
            "nombreVehiculo": nombre,
            "placasVehiculo": placas,
            "motivoUso": motivo,
            "estatusAprobacion": estatus,
            "entregaEstatus": "",
            "fechaInicioSolicitada": iso(inicio),
            "fechaFinSolicitada": iso(fin),
            "solicitante": dj(["id": quien.id, "nombre": quien.nombre]),
            "vehiculo": dj(["id": vehiculoId, "nombre": nombre, "placas": placas]),
            "actividad": dj(["id": id + 1000, "anNumber": "AN-0\(id % 1000)", "titulo": actividad]),
        ])
    }

    private func porRolSembrarSolicitudes() -> [DemoJSON] {
        [
            porRolSolicitud(
                9501, "Nissan NP300", "DEM-456-B", 12, de: 102, estatus: "Pendiente",
                motivo: "Levantamiento y traslado de material a la obra.", inicio: 1500, fin: 1900,
                actividad: "Modernización eléctrica · Torre A"
            ),
            porRolSolicitud(
                9502, "Chevrolet Aveo", "DEM-789-C", 13, de: 105, estatus: "Pendiente",
                motivo: "Visita al cliente para revisar la propuesta.", inicio: 2900, fin: 3100,
                actividad: "Ampliación de aulas · Fase 2"
            ),
            porRolSolicitud(
                9503, "Ford Ranger", "DEM-123-A", 11, de: 101, estatus: "Aprobado",
                motivo: "Instalación de cámaras.", inicio: -180, fin: 300,
                actividad: "Instalación de cámaras"
            ),
        ]
    }

    /// Las unidades dadas de alta en esta sesión. `fxVehicles` las suma a las libres.
    func porRolUnidadesNuevas() -> [DemoJSON] {
        porRolAsegurar()
        return PorRolDemoEstado.shared.unidades
    }

    /// `GET vehicles`, `PATCH vehicles/:id/approve` y `POST vehicles/inventory`. `nil` = lo demás
    /// de `routeVehicles`.
    func routeVehiculosPorRol(method: String, parts: [String], json: DemoJSON) -> DemoRespuesta? {
        porRolAsegurar()
        let estado = PorRolDemoEstado.shared
        if method == "GET", parts.count == 1 { return (200, estado.solicitudes) }
        if method == "POST", parts.count == 2, parts[1] == "inventory" {
            let nombre = (json["nombre"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !nombre.isEmpty else { return porRolError(400, "Nombre requerido") }
            let unidad = dj([
                "id": porRolSiguienteId(),
                "nombre": nombre,
                "placas": porRolNulo(json["placas"]),
                "estatus": "Disponible",
                "activo": true,
                "disponible": true,
                "tieneRastreador": false,
            ])
            estado.unidades.append(unidad)
            return (201, unidad)
        }
        if method == "PATCH", parts.count >= 3, parts[2] == "approve", let id = Int(parts[1]) {
            guard let indice = estado.solicitudes.firstIndex(where: { ($0["id"] as? Int) == id }) else {
                return porRolError(404, "Solicitud no encontrada")
            }
            guard (estado.solicitudes[indice]["estatusAprobacion"] as? String) == "Pendiente" else {
                return porRolError(400, "Esta solicitud ya fue cerrada")
            }
            let aprobar = (json["action"] as? String ?? "approve") != "reject"
            estado.solicitudes[indice]["estatusAprobacion"] = aprobar ? "Aprobado" : "Rechazado"
            return (200, estado.solicitudes[indice])
        }
        return nil
    }
}
