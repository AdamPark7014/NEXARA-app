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

    /// Lo que «lee» la cámara de la demostración en Almacén (en el simulador no hay
    /// cámara): el cable UTP de la bodega central, con existencia y algo apartado.
    static var codigoDeMuestraAlmacen: String { eanDemo(DemoData.stock[0]) }

    /// Lo que «lee» la cámara de la demostración en Herramientas: un préstamo en uso.
    static var codigoDeMuestraHerramienta: String { herramientas.first?.codigo ?? "TAL-0001" }

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

    /// Llave de `stockAjustes` para lo que el escáner metió en un almacén que no es el del
    /// producto (cada semilla vive en uno solo): `id × 1000 + almacén`. Las llaves 1…999
    /// siguen siendo el ajuste del almacén propio, el que leen `cantidadDemo` y la lista.
    private static func llaveOtroAlmacen(_ seedId: Int, _ warehouseId: Int) -> Int {
        seedId * 1000 + warehouseId
    }

    /// Disponible (cantidad − apartado) de un producto de la semilla en un almacén.
    private func disponibleDemo(_ seed: DemoStockSeed, almacen: Int) -> Double {
        if almacen == seed.warehouseId { return max(0, cantidadDemo(seed) - seed.reserved) }
        return max(0, stockAjustes[Self.llaveOtroAlmacen(seed.id, almacen)] ?? 0)
    }

    private static func porNombreDeAlmacen(_ a: DemoJSON, _ b: DemoJSON) -> Bool {
        (a["almacen"] as? String ?? "").localizedCompare(b["almacen"] as? String ?? "") == .orderedAscending
    }

    /// Existencias por almacén, ordenadas por nombre como las da el API (`existenciasDeProducto`).
    private func existenciasDemo(_ seed: DemoStockSeed) -> [DemoJSON] {
        DemoData.warehouses
            .compactMap { almacen -> DemoJSON? in
                if almacen.id == seed.warehouseId {
                    return dj([
                        "warehouseId": almacen.id, "almacen": almacen.name,
                        "cantidad": cantidadDemo(seed), "reservado": seed.reserved,
                    ])
                }
                guard let extra = stockAjustes[Self.llaveOtroAlmacen(seed.id, almacen.id)] else { return nil }
                return dj(["warehouseId": almacen.id, "almacen": almacen.name, "cantidad": max(0, extra), "reservado": 0.0])
            }
            .sorted(by: Self.porNombreDeAlmacen)
    }

    /// Como `findByBarcode`: `codigoBarras` y `tipo` son los del código buscado (EAN o clave).
    private func productoPorCodigoJSON(_ seed: DemoStockSeed, codigo: String) -> DemoJSON {
        let ean = DemoStore.eanDemo(seed)
        return dj([
            "match": "producto",
            "codigoBarras": codigo,
            "tipo": CodigoBarras.clasificar(codigo).tipo.rawValue,
            "product": dj([
                "id": 300 + seed.id, "sku": seed.sku, "name": seed.name, "ean": ean,
                "codigoBarras": ean, "unitName": "piezas",
            ]),
            "existencias": existenciasDemo(seed),
        ])
    }

    /// Llave en `stockAltas` del código buscado: como el API, el UPC-A y su EAN-13 con 0
    /// son el mismo, y la clave (SKU) se compara sin mayúsculas.
    private func llaveDeAlta(_ codigo: String) -> String? {
        var variantes: Set<String> = [codigo, "0" + codigo]
        if codigo.hasPrefix("0") { variantes.insert(String(codigo.dropFirst())) }
        if let llave = stockAltas.keys.first(where: { variantes.contains($0) }) { return llave }
        let buscado = codigo.uppercased()
        return stockAltas.first(where: { entrada in
            ((entrada.value["product"] as? DemoJSON)?["sku"] as? String)?.uppercased() == buscado
        })?.key
    }

    /// `stock/barcode`, `stock/upc-lookup/:code`, `stock/products/por-codigo` y `stock/movements/por-codigo`.
    func routeStockEscaneo(method: String, parts: [String], query: [String: String], json: DemoJSON) -> DemoRespuesta? {
        let sub = parts.count > 1 ? parts[1] : ""
        switch (method, sub) {
        case ("GET", "barcode"):
            let codigo = CodigoBarras.limpiar(query["code"] ?? (parts.count > 2 ? parts[2] : ""))
            guard !codigo.isEmpty else { return error(400, "Escanea o escribe un código de barras") }
            if let seed = seedPorCodigo(codigo) { return (200, productoPorCodigoJSON(seed, codigo: codigo)) }
            if let llave = llaveDeAlta(codigo), let alta = stockAltas[llave] { return (200, alta) }
            return error(404, "No hay producto con código «\(codigo)»")
        case ("GET", "upc-lookup"):
            let codigo = CodigoBarras.limpiar(parts.count > 2 ? parts[2] : "")
            guard CodigoBarras.esConsultableInternacional(codigo) else {
                return (200, dj([
                    "encontrado": false, "codigo": codigo, "motivo": "CODIGO_NO_CONSULTABLE",
                    "mensaje": "Este código no es un UPC/EAN: captura los datos a mano.",
                ]))
            }
            return (200, dj([
                "encontrado": true, "codigo": codigo, "fuente": "demo",
                "producto": dj([
                    "codigo": codigo, "nombre": "Contacto dúplex polarizado 15 A",
                    "marca": "Volteck", "modelo": "CDP-15", "categoria": "Material eléctrico",
                ]),
            ]))
        case ("POST", "products") where parts.count > 2 && parts[2] == "por-codigo":
            return altaPorCodigoDemo(json)
        case ("POST", "movements") where parts.count > 2 && parts[2] == "por-codigo":
            return movimientoPorCodigoDemo(json)
        default:
            return nil
        }
    }

    /// `POST stock/products/por-codigo`: mismas validaciones y textos que `altaPorCodigo` del API.
    private func altaPorCodigoDemo(_ json: DemoJSON) -> DemoRespuesta {
        let codigo = CodigoBarras.limpiar(json["codigo"] as? String)
        if let motivo = CodigoBarras.motivoInvalido(codigo) { return error(400, motivo) }
        let nombre = (json["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !nombre.isEmpty else { return error(400, "Escribe el nombre del producto") }
        if let seed = seedPorCodigo(codigo) {
            return error(409, "El código \(codigo) ya es de «\(seed.name)» (clave \(seed.sku))")
        }
        if let llave = llaveDeAlta(codigo) {
            let otro = stockAltas[llave]?["product"] as? DemoJSON
            let nombreOtro = otro?["name"] as? String ?? "otro producto"
            let skuOtro = otro?["sku"] as? String ?? ""
            return error(409, "El código \(codigo) ya es de «\(nombreOtro)» (clave \(skuOtro))")
        }
        let id = 900 + stockAltas.count
        let tipo = CodigoBarras.clasificar(codigo).tipo
        var producto = dj([
            "id": id,
            "sku": (json["sku"] as? String)?.nilSiVacio ?? "DEMO-\(id)",
            "name": nombre,
            "unitName": (json["unidad"] as? String)?.nilSiVacio ?? "piezas",
        ])
        // El mismo campo que elige el API (`campoParaCodigo`).
        switch tipo {
        case .upcA: producto["upc"] = codigo
        case .ean13, .ean8: producto["ean"] = codigo
        default: producto["codigoBarras"] = codigo
        }
        stockAltas[codigo] = dj([
            "match": "producto", "codigoBarras": codigo, "tipo": tipo.rawValue,
            "product": producto, "existencias": [DemoJSON](),
        ])
        return (201, producto)
    }

    private func stockInsuficiente(_ disponible: Double, _ solicitado: Double) -> DemoRespuesta {
        error(400, "Stock insuficiente en el almacén de origen: disponible "
              + "\(CoreExtrasFormato.numero(disponible)), solicitado \(CoreExtrasFormato.numero(solicitado))")
    }

    /// `POST stock/movements/por-codigo`: entra o sale del almacén ELEGIDO (antes todo iba
    /// al almacén de la semilla y la salida se comparaba contra el total), con las reglas
    /// y los textos de `createStockMovement`. Lo dado de alta en la sesión también se mueve.
    private func movimientoPorCodigoDemo(_ json: DemoJSON) -> DemoRespuesta {
        let codigo = CodigoBarras.limpiar(json["codigo"] as? String)
        guard !codigo.isEmpty else { return error(400, "Escanea o escribe un código de barras") }
        let cantidad = (json["quantity"] as? Double) ?? Double(json["quantity"] as? Int ?? 0)
        guard cantidad.isFinite, cantidad > 0 else { return error(400, "Indica una cantidad mayor a cero") }
        let tipo = (json["type"] as? String ?? "").uppercased()
        let salida = tipo == "DISPATCH" || tipo == "OUT"
        guard salida || tipo == "RECEIPT" || tipo == "IN" else { return error(400, "Indica el tipo de movimiento") }
        guard let almacenId = (salida ? json["fromWarehouseId"] : json["toWarehouseId"]) as? Int else {
            return error(400, "El movimiento requiere almacén de origen y/o destino")
        }
        guard let almacen = DemoData.warehouses.first(where: { $0.id == almacenId }) else {
            return error(400, salida ? "Almacén de origen inválido" : "Almacén de destino inválido")
        }
        var movimiento = dj(["type": salida ? "DISPATCH" : "RECEIPT", "quantity": cantidad])

        if let seed = seedPorCodigo(codigo) {
            let disponible = disponibleDemo(seed, almacen: almacen.id)
            if salida && cantidad > disponible { return stockInsuficiente(disponible, cantidad) }
            let llave = almacen.id == seed.warehouseId ? seed.id : Self.llaveOtroAlmacen(seed.id, almacen.id)
            stockAjustes[llave, default: 0] += salida ? -cantidad : cantidad
            movimiento["id"] = 7000 + seed.id
            return (201, dj([
                "match": "producto", "codigoBarras": codigo,
                "product": dj(["id": 300 + seed.id, "sku": seed.sku, "name": seed.name]),
                "movement": movimiento,
            ]))
        }

        guard let llave = llaveDeAlta(codigo), var alta = stockAltas[llave] else {
            return error(404, "No hay producto con código «\(codigo)»")
        }
        var existencias = alta["existencias"] as? [DemoJSON] ?? []
        let indice = existencias.firstIndex { ($0["warehouseId"] as? Int) == almacen.id }
        let actual = indice.flatMap { existencias[$0]["cantidad"] as? Double } ?? 0
        if salida && cantidad > actual { return stockInsuficiente(actual, cantidad) }
        let nueva = actual + (salida ? -cantidad : cantidad)
        if let indice {
            existencias[indice]["cantidad"] = nueva
        } else {
            existencias.append(dj([
                "warehouseId": almacen.id, "almacen": almacen.name, "cantidad": nueva, "reservado": 0.0,
            ]))
        }
        alta["existencias"] = existencias.sorted(by: Self.porNombreDeAlmacen)
        stockAltas[llave] = alta
        movimiento["id"] = 7900 + stockAltas.count
        return (201, dj([
            "match": "producto", "codigoBarras": llave,
            "product": alta["product"] ?? DemoJSON(),
            "movement": movimiento,
        ]))
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

extension FormatosDeEscaneo {
    /// Código que entrega la cámara de la demostración (botón «Usar código de muestra»):
    /// un producto con existencias en Almacén y una herramienta prestada en Herramientas.
    var codigoDeMuestraDemo: String {
        switch self {
        case .producto: return DemoStore.codigoDeMuestraAlmacen
        case .etiquetaHerramienta: return DemoStore.codigoDeMuestraHerramienta
        }
    }
}
