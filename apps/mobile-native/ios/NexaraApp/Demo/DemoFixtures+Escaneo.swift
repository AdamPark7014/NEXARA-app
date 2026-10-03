import Foundation

// Reloj por sesiones (pausar / reanudar) y escáner de Almacén y Herramientas en la
// demostración. Las formas salen de `CoreModels.swift` y `EscaneoRepository.swift`.
// Cada ruteo devuelve `DemoRespuesta`; `DemoBackend` la serializa.

/// Pausa de una actividad en la demo: cuándo, quién y por qué.
struct DemoPausa {
    let at: Date
    let motivo: String?
    let porId: Int
}

typealias DemoRespuesta = (status: Int, payload: Any)

extension DemoStore {

    private func error(_ status: Int, _ mensaje: String) -> DemoRespuesta {
        (status, dj(["statusCode": status, "message": mensaje]))
    }

    // MARK: Sesión de trabajo

    /// Cuándo arrancó su reloj quien la ejecuta; nil si no la ha iniciado.
    private func inicioDeSesion(_ a: DemoActivity) -> Date? {
        if let inicio = startedAt[a.id] ?? evidence[a.id]?.entryAt { return inicio }
        return effectiveStatus(a) == "En Proceso" ? at(a.startMin) : nil
    }

    /// Campos de sesión (`enCurso`, `enPausa`…) de quien ejecuta `a`.
    func sesionJSON(_ a: DemoActivity) -> DemoJSON {
        guard !isClosed(a), let inicio = inicioDeSesion(a) else {
            return dj(["enCurso": false, "enPausa": false])
        }
        if let pausa = pausas[a.id] {
            let quien = DemoData.person(pausa.porId)
            var json = dj([
                "enCurso": false,
                "enPausa": true,
                "pausaTipo": "PAUSA",
                "pausadaAt": DemoClock.iso(pausa.at),
                "pausadaPor": dj(["id": quien.id, "nombre": quien.nombre]),
            ])
            if let motivo = pausa.motivo { json["motivoPausa"] = motivo }
            return json
        }
        return dj([
            "enCurso": true,
            "enPausa": false,
            "sesionAbiertaDesde": DemoClock.iso(sesionDesde[a.id] ?? inicio),
        ])
    }

    private func estadoSesion(_ id: Int) -> DemoJSON {
        guard let a = activity(id) else { return dj(["ok": true]) }
        var json = sesionJSON(a)
        json["ok"] = true
        json["minutosReales"] = DemoClock.minutes(from: inicioDeSesion(a) ?? at(a.startMin), to: Date())
        return json
    }

    /// `POST me/activities/:id/pausar` (motivo opcional) y `…/reanudar`.
    func routeSesionPropia(action: String, activityId: Int, json: DemoJSON, now: Date) -> DemoRespuesta {
        guard let a = activity(activityId), !isClosed(a), inicioDeSesion(a) != nil else {
            return error(400, "Esta actividad no tiene el reloj corriendo.")
        }
        if action == "pausar" {
            let motivo = (json["motivo"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            pausas[activityId] = DemoPausa(at: now, motivo: motivo?.isEmpty == false ? motivo : nil, porId: DemoMode.meId)
        } else {
            pausas[activityId] = nil
            sesionDesde[activityId] = now
        }
        return (200, estadoSesion(activityId))
    }

    /// `POST me/board/:userId/activities/:id/pausar`: el jefe pausa, con motivo (≥ 10).
    func routePausaDeEquipo(activityId: Int, json: DemoJSON, now: Date) -> DemoRespuesta {
        let motivo = (json["motivo"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard motivo.count >= 10 else {
            return error(400, "Escribe por qué la pausas (mínimo 10 caracteres).")
        }
        guard let a = activity(activityId), !isClosed(a), inicioDeSesion(a) != nil, pausas[activityId] == nil else {
            return error(400, "Esa actividad no tiene el reloj corriendo.")
        }
        pausas[activityId] = DemoPausa(at: now, motivo: motivo, porId: DemoMode.meId)
        return (200, estadoSesion(activityId))
    }

    /// Subir evidencia reanuda el reloj (lo hace el servidor).
    func reanudarPorEvidencia(_ activityId: Int, now: Date) {
        guard pausas[activityId] != nil else { return }
        pausas[activityId] = nil
        sesionDesde[activityId] = now
    }

    // MARK: Almacén

    /// EAN-13 de muestra de cada producto: «7501000000» + id a dos dígitos + verificador.
    static func eanDemo(_ seed: DemoStockSeed) -> String {
        let cuerpo = "7501000000" + String(format: "%02d", seed.id)
        return cuerpo + String(CodigoBarras.digitoVerificadorGtin(cuerpo) ?? 0)
    }

    private func seedPorCodigo(_ codigo: String) -> DemoStockSeed? {
        let buscado = codigo.uppercased()
        return DemoData.stock.first { seed in
            let ean = DemoStore.eanDemo(seed)
            return seed.sku.uppercased() == buscado || ean == buscado || ean == "0" + buscado
        }
    }

    func cantidadDemo(_ seed: DemoStockSeed) -> Double {
        max(0, seed.qty + (stockAjustes[seed.id] ?? 0))
    }

    private func productoPorCodigoJSON(_ seed: DemoStockSeed) -> DemoJSON {
        let almacen = DemoData.warehouses.first { $0.id == seed.warehouseId } ?? DemoData.warehouses[0]
        let ean = DemoStore.eanDemo(seed)
        return dj([
            "match": "producto",
            "codigoBarras": ean,
            "tipo": "EAN_13",
            "product": dj([
                "id": 300 + seed.id, "sku": seed.sku, "name": seed.name, "ean": ean,
                "codigoBarras": ean, "unitName": "piezas",
            ]),
            "existencias": [
                dj([
                    "warehouseId": almacen.id, "almacen": almacen.name,
                    "cantidad": cantidadDemo(seed), "reservado": seed.reserved,
                ]),
            ],
        ])
    }

    /// `stock/barcode`, `stock/upc-lookup/:code`, `stock/products/por-codigo` y `stock/movements/por-codigo`.
    func routeStockEscaneo(method: String, parts: [String], query: [String: String], json: DemoJSON) -> DemoRespuesta? {
        let sub = parts.count > 1 ? parts[1] : ""
        switch (method, sub) {
        case ("GET", "barcode"):
            let codigo = CodigoBarras.limpiar(query["code"] ?? (parts.count > 2 ? parts[2] : ""))
            if let seed = seedPorCodigo(codigo) { return (200, productoPorCodigoJSON(seed)) }
            if let alta = stockAltas[codigo] { return (200, alta) }
            return error(404, "No hay producto con el código \(codigo)")
        case ("GET", "upc-lookup"):
            let codigo = parts.count > 2 ? parts[2] : ""
            return (200, dj([
                "encontrado": true, "codigo": codigo, "fuente": "demo",
                "producto": dj([
                    "codigo": codigo, "nombre": "Contacto dúplex polarizado 15 A",
                    "marca": "Volteck", "modelo": "CDP-15", "categoria": "Material eléctrico",
                ]),
            ]))
        case ("POST", "products") where parts.count > 2 && parts[2] == "por-codigo":
            let codigo = CodigoBarras.limpiar(json["codigo"] as? String)
            let nombre = (json["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !codigo.isEmpty, !nombre.isEmpty else { return error(400, "Falta el nombre o el código") }
            let id = 900 + stockAltas.count
            let producto = dj([
                "id": id, "sku": (json["sku"] as? String) ?? "DEMO-\(id)", "name": nombre,
                "codigoBarras": codigo, "unitName": (json["unidad"] as? String) ?? "piezas",
            ])
            stockAltas[codigo] = dj([
                "match": "producto", "codigoBarras": codigo,
                "tipo": CodigoBarras.clasificar(codigo).tipo.rawValue,
                "product": producto, "existencias": [DemoJSON](),
            ])
            return (201, producto)
        case ("POST", "movements") where parts.count > 2 && parts[2] == "por-codigo":
            let codigo = CodigoBarras.limpiar(json["codigo"] as? String)
            let cantidad = (json["quantity"] as? Double) ?? Double(json["quantity"] as? Int ?? 0)
            guard cantidad > 0 else { return error(400, "La cantidad debe ser mayor a cero") }
            guard let seed = seedPorCodigo(codigo) else {
                return error(400, "Ese producto todavía no tiene existencias en la demostración")
            }
            let salida = (json["type"] as? String) == "DISPATCH"
            if salida && cantidad > cantidadDemo(seed) {
                return error(400, "No alcanza: en ese almacén hay \(CoreExtrasFormato.numero(cantidadDemo(seed))).")
            }
            stockAjustes[seed.id, default: 0] += salida ? -cantidad : cantidad
            return (201, dj([
                "match": "producto", "codigoBarras": codigo,
                "movement": dj(["id": 7000 + seed.id, "type": salida ? "DISPATCH" : "RECEIPT", "quantity": cantidad]),
            ]))
        default:
            return nil
        }
    }

    /// `GET warehouse`.
    func fxAlmacenes() -> [DemoJSON] {
        DemoData.warehouses.map { dj(["id": $0.id, "code": $0.code, "name": $0.name]) }
    }

    // MARK: Herramientas

    private struct HerramientaDemo {
        let codigo: String
        let nombre: String
        let modelo: String
        let serie: String
        let prestamoId: Int?
        /// Estado inicial del préstamo: APPROVED | IN_USE | nil.
        let prestamo: String?
        let personaId: Int?
    }

    private static let herramientas: [HerramientaDemo] = [
        HerramientaDemo(codigo: "TAL-0001", nombre: "Taladro inalámbrico", modelo: "DCD771 18 V",
                        serie: "TL-88213", prestamoId: 610, prestamo: "IN_USE", personaId: 101),
        HerramientaDemo(codigo: "MUL-0002", nombre: "Multímetro digital", modelo: "Fluke 117",
                        serie: "FK-30117", prestamoId: 611, prestamo: "APPROVED", personaId: 102),
        HerramientaDemo(codigo: "ESC-0003", nombre: "Escalera de tijera", modelo: "Fibra de vidrio 6 peldaños",
                        serie: "ES-6001", prestamoId: nil, prestamo: nil, personaId: nil),
    ]

    private func herramientaJSON(_ h: HerramientaDemo) -> DemoJSON {
        let estadoPrestamo = h.prestamoId.flatMap { prestamosHerramienta[$0] } ?? h.prestamo
        let enUso = estadoPrestamo == "IN_USE"
        var json = dj([
            "codigo": h.codigo,
            "item": dj([
                "id": 400 + (h.prestamoId ?? 0), "toolName": h.nombre, "model": h.modelo,
                "serialNumber": h.serie, "codigoInterno": h.codigo, "barcode": h.codigo,
                "status": enUso ? "ASSIGNED" : "AVAILABLE",
            ]),
            "esMia": false,
        ])
        if let prestamoId = h.prestamoId, let estado = estadoPrestamo, estado != "RETURNED",
           let personaId = h.personaId {
            let persona = DemoData.person(personaId)
            json["prestamo"] = dj([
                "id": prestamoId, "status": estado,
                "usuario": dj(["id": persona.id, "nombre": persona.nombre, "email": persona.email]),
                "expectedReturnDate": iso(600),
                "pickupCode": "K7Q2", "pickupExpiresAt": iso(240), "vencido": false,
            ])
        }
        return json
    }

    /// `tool-requests/inventory/por-codigo`, `tool-requests/:id/deliver` y `…/return`.
    func routeHerramientas(method: String, parts: [String], query: [String: String], json: DemoJSON) -> DemoRespuesta {
        if method == "GET", parts.count >= 3, parts[1] == "inventory", parts[2] == "por-codigo" {
            let codigo = CodigoBarras.normalizarEtiquetaHerramienta(query["code"])
            guard let h = DemoStore.herramientas.first(where: { $0.codigo == codigo }) else {
                return error(404, "No hay herramienta con la etiqueta \(codigo)")
            }
            return (200, herramientaJSON(h))
        }
        if method == "POST", parts.count >= 3, let prestamoId = Int(parts[1]) {
            guard let h = DemoStore.herramientas.first(where: { $0.prestamoId == prestamoId }) else {
                return error(404, "Préstamo no encontrado")
            }
            let estado = prestamosHerramienta[prestamoId] ?? h.prestamo
            switch parts[2] {
            case "deliver":
                guard estado == "APPROVED" else { return error(400, "Ese préstamo no está aprobado") }
                let codigo = (json["pickupCode"] as? String ?? "").uppercased()
                guard codigo == "K7Q2" else { return error(400, "El código de recolección no coincide") }
                prestamosHerramienta[prestamoId] = "IN_USE"
            case "return":
                guard estado == "IN_USE" else { return error(400, "Esa herramienta no está prestada") }
                prestamosHerramienta[prestamoId] = "RETURNED"
            default:
                return (200, DemoJSON())
            }
            return (200, dj(["id": prestamoId, "status": prestamosHerramienta[prestamoId] ?? ""]))
        }
        return (200, method == "GET" ? [DemoJSON]() as Any : DemoJSON() as Any)
    }
}
