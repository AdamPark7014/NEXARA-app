import UIKit

// Finanzas y ventas de la sesión ficticia: Cotizaciones (`cotizaciones/core`,
// `cotizaciones/core/:id` y sus dos PDF), Pagos a empleados (`employee-payments`),
// Gastos (`expenses`: lista, alta con ticket, autorizar/rechazar y pagado) y la
// bandeja de Aprobaciones (`workflow/my-pending` y `decide`). Las formas son las de
// `CotizacionesRepository`, `PagosRepository`, `GastosRepository` y
// `AprobacionesRepository` (las del API).
//
// Cifras en pesos con IVA; los días van como el día + `T12:00:00.000Z` (como los
// guarda el API) y los instantes son relativos a la entrada al demo, como el resto.
// Cada pantalla trae todos sus estados para que ningún filtro salga vacío.

/// Lo que el usuario «hace» en estas pantallas durante el demo. Vive fuera de
/// `DemoStore` para no tocar su `seed()`: se vuelve a sembrar cuando cambia el
/// epoch (cada entrada al demo) y solo se usa con `DemoStore.lock` tomado.
private final class FinDemoEstado {
    static let shared = FinDemoEstado()
    var epoch: Date?
    var gastos: [DemoJSON] = []
    var siguienteGasto = 6500
    var decididas: Set<Int> = []
}

private struct FinPartida {
    let grupo: String
    let nombre: String
    let unidad: String
    let cantidad: Double
    let precio: Double
    /// Costo unitario: solo sale en el PDF interno.
    let costo: Double
}

private struct FinCotizacionSemilla {
    let id: Int
    let consecutivo: Int
    let estado: String
    let segmento: String
    let clienteId: Int
    let contacto: String
    let proyecto: String
    let alcance: String
    let emitidaHaceDias: Int
    let vigenciaDias: Int
    let enviadaHaceDias: Int?
    let elaboroId: Int
    let revisoId: Int?
    let revision: Int
    let actividadId: Int?
    let rechazo: String?
    let partidas: [FinPartida]
}

private struct FinAprobacionSemilla {
    let id: Int
    let entidad: String
    let entidadId: Int
    let flujo: String
    /// (nombre del paso, id del aprobador si es persona, rol si es rol)
    let pasos: [(String, Int?, String?)]
    /// El paso que te toca (1…n). Los anteriores ya están aprobados.
    let miPaso: Int
    let solicitanteId: Int
    let haceMinutos: Int
    let titulo: String?
    let detalle: String?
    let monto: Double?
    let moneda: String
}

/// Un opcional para el JSON del demo: el valor o `null`.
private func finNulo(_ valor: Any?) -> Any {
    valor ?? NSNull()
}

private func finRedondeo(_ valor: Double) -> Double {
    (valor * 100).rounded() / 100
}

private func finCentavos(_ valor: Double) -> Int {
    Int((valor * 100).rounded())
}

extension DemoStore {

    /// Rutas de Cotizaciones, Pagos a empleados, Gastos y Aprobaciones; `nil` si la
    /// petición no es de estas pantallas (el despacho contesta entonces `{}`).
    func routeFinanzas(method: String, parts: [String], json: DemoJSON, body: Data?) -> DemoReply? {
        finAsegurarEstado()
        switch parts.first ?? "" {
        case "cotizaciones":
            return finRutaCotizaciones(method: method, parts: parts)
        case "employee-payments":
            return method == "GET" && parts.count == 1 ? finRespuesta(fxPagosEmpleados()) : nil
        case "expenses":
            return finRutaGastos(method: method, parts: parts, json: json, body: body)
        case "workflow":
            return finRutaWorkflow(method: method, parts: parts, json: json)
        default:
            return nil
        }
    }

    // MARK: Utilidades

    private func finAsegurarEstado() {
        let estado = FinDemoEstado.shared
        guard estado.epoch != epoch else { return }
        estado.epoch = epoch
        estado.gastos = finSembrarGastos()
        estado.siguienteGasto = 6500
        estado.decididas = []
    }

    private func finRespuesta(_ payload: Any, status: Int = 200) -> DemoReply {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
            return DemoReply(status: status, data: Data("{}".utf8))
        }
        return DemoReply(status: status, data: data)
    }

    private func finFallo(_ status: Int, _ mensaje: String) -> DemoReply {
        finRespuesta(dj(["statusCode": status, "message": mensaje]), status: status)
    }

    /// `AAAA-MM-DDT12:00:00.000Z` del día que cae `dias` respecto a la entrada al demo.
    private func finDia(_ dias: Int) -> String {
        DemoClock.day(at(dias * 24 * 60)) + "T12:00:00.000Z"
    }

    /// Un `@db.Date`: el día a medianoche UTC, como lo serializa Prisma.
    private func finFecha(_ dias: Int) -> String {
        DemoClock.day(at(dias * 24 * 60)) + "T00:00:00.000Z"
    }

    /// Instante `dias` días, `horas` horas y `minutos` minutos antes de entrar al demo.
    private func finHace(dias: Int = 0, horas: Int = 0, minutos: Int = 0) -> String {
        iso(-(dias * 24 * 60 + horas * 60 + minutos))
    }

    private func finGente(_ id: Int) -> DemoPerson {
        DemoData.people.first { $0.id == id } ?? DemoData.people[0]
    }

    private func finPersona(_ id: Int) -> DemoJSON {
        let p = finGente(id)
        return dj(["id": p.id, "nombre": p.nombre, "email": p.email, "puesto": p.puesto, "avatarUrl": NSNull()])
    }

    private func finSiglas(_ nombre: String) -> String {
        String(nombre.split(separator: " ").prefix(3).compactMap { $0.first }).uppercased()
    }

    // MARK: Cotizaciones

    private var finCotizaciones: [FinCotizacionSemilla] {
        [
            FinCotizacionSemilla(
                id: 7312, consecutivo: 12, estado: "ENVIADA", segmento: "SERVICIO", clienteId: 3102,
                contacto: "Arq. Lucía Ferrer", proyecto: "Renovación de climas · torre B",
                alcance: "Sustitución de 6 equipos minisplit inverter en habitaciones de la torre B, con desmontaje y retiro de los equipos actuales.",
                emitidaHaceDias: 3, vigenciaDias: 15, enviadaHaceDias: 2, elaboroId: 101, revisoId: 1,
                revision: 1, actividadId: nil, rechazo: nil,
                partidas: [
                    FinPartida(grupo: "EQUIPOS", nombre: "Minisplit inverter 1.5 TR 220 V", unidad: "pza", cantidad: 6, precio: 14_850, costo: 11_200),
                    FinPartida(grupo: "MATERIALES", nombre: "Tubería de cobre 1/4\" y 1/2\" con aislante", unidad: "m", cantidad: 48, precio: 285, costo: 190),
                    FinPartida(grupo: "MATERIALES", nombre: "Soportería y tornillería", unidad: "lote", cantidad: 1, precio: 2_400, costo: 1_500),
                    FinPartida(grupo: "MANO_DE_OBRA", nombre: "Instalación y arranque por equipo", unidad: "serv", cantidad: 6, precio: 2_950, costo: 1_700),
                ]
            ),
            FinCotizacionSemilla(
                id: 7311, consecutivo: 11, estado: "ENVIADA", segmento: "OBRA", clienteId: 3101,
                contacto: "Ing. Roberto Salinas", proyecto: "Cableado estructurado · piso 4",
                alcance: "Red de voz y datos categoría 6 para 64 nodos, con gabinete, organizadores y certificación de cada nodo.",
                emitidaHaceDias: 9, vigenciaDias: 30, enviadaHaceDias: 8, elaboroId: 108, revisoId: 103,
                revision: 2, actividadId: nil, rechazo: nil,
                partidas: [
                    FinPartida(grupo: "EQUIPOS", nombre: "Switch administrable 48 puertos PoE+", unidad: "pza", cantidad: 2, precio: 18_900, costo: 14_100),
                    FinPartida(grupo: "EQUIPOS", nombre: "Gabinete de piso 42U", unidad: "pza", cantidad: 1, precio: 12_400, costo: 9_300),
                    FinPartida(grupo: "MATERIALES", nombre: "Cable UTP Cat6 (caja 305 m)", unidad: "caja", cantidad: 9, precio: 3_150, costo: 2_380),
                    FinPartida(grupo: "MATERIALES", nombre: "Jack Cat6 y placa de 2 salidas", unidad: "pza", cantidad: 64, precio: 165, costo: 98),
                    FinPartida(grupo: "MANO_DE_OBRA", nombre: "Tendido, ponchado y certificación por nodo", unidad: "nodo", cantidad: 64, precio: 690, costo: 380),
                ]
            ),
            FinCotizacionSemilla(
                id: 7310, consecutivo: 10, estado: "BORRADOR", segmento: "COMERCIAL", clienteId: 3106,
                contacto: "Dra. Elena Pacheco", proyecto: "CCTV para recepción y estacionamiento",
                alcance: "Ocho cámaras IP de 4 MP con grabador de 30 días, monitor en recepción y app para dirección.",
                emitidaHaceDias: 0, vigenciaDias: 15, enviadaHaceDias: nil, elaboroId: 1, revisoId: nil,
                revision: 1, actividadId: nil, rechazo: nil,
                partidas: [
                    FinPartida(grupo: "EQUIPOS", nombre: "Cámara IP domo 4 MP", unidad: "pza", cantidad: 8, precio: 2_890, costo: 1_950),
                    FinPartida(grupo: "EQUIPOS", nombre: "NVR 16 canales con disco de 4 TB", unidad: "pza", cantidad: 1, precio: 9_800, costo: 7_100),
                    FinPartida(grupo: "MATERIALES", nombre: "Cable UTP exterior y conectores", unidad: "lote", cantidad: 1, precio: 3_600, costo: 2_300),
                    FinPartida(grupo: "MANO_DE_OBRA", nombre: "Instalación y configuración", unidad: "serv", cantidad: 1, precio: 7_500, costo: 4_200),
                ]
            ),
            FinCotizacionSemilla(
                id: 7309, consecutivo: 9, estado: "BORRADOR", segmento: "LICITACION", clienteId: 3105,
                contacto: "Lic. Óscar Medina", proyecto: "Alumbrado perimetral LED",
                alcance: "Sustitución de 40 luminarias de vapor de sodio por LED de 150 W en el perímetro del parque.",
                emitidaHaceDias: 1, vigenciaDias: 20, enviadaHaceDias: nil, elaboroId: 103, revisoId: nil,
                revision: 1, actividadId: nil, rechazo: nil,
                partidas: [
                    FinPartida(grupo: "EQUIPOS", nombre: "Luminaria LED vial 150 W", unidad: "pza", cantidad: 40, precio: 4_350, costo: 3_050),
                    FinPartida(grupo: "MANO_DE_OBRA", nombre: "Desmontaje e instalación con grúa", unidad: "pza", cantidad: 40, precio: 980, costo: 560),
                ]
            ),
            FinCotizacionSemilla(
                id: 7307, consecutivo: 7, estado: "APROBADA", segmento: "SERVICIO", clienteId: 3102,
                contacto: "Arq. Lucía Ferrer", proyecto: "Mantenimiento preventivo de clima",
                alcance: "Mantenimiento preventivo trimestral a 14 equipos de aire acondicionado del lobby y salones.",
                emitidaHaceDias: 21, vigenciaDias: 15, enviadaHaceDias: 20, elaboroId: 101, revisoId: 1,
                revision: 1, actividadId: 5143, rechazo: nil,
                partidas: [
                    FinPartida(grupo: "MATERIALES", nombre: "Filtros, gas refrigerante y limpiador", unidad: "lote", cantidad: 1, precio: 6_200, costo: 4_100),
                    FinPartida(grupo: "MANO_DE_OBRA", nombre: "Mantenimiento preventivo por equipo", unidad: "equipo", cantidad: 14, precio: 1_150, costo: 620),
                ]
            ),
            FinCotizacionSemilla(
                id: 7305, consecutivo: 5, estado: "APROBADA", segmento: "OBRA", clienteId: 3104,
                contacto: "C.P. Martha Gil", proyecto: "Tablero general de baja tensión",
                alcance: "Suministro e instalación de tablero general con interruptor principal de 800 A y medición.",
                emitidaHaceDias: 34, vigenciaDias: 30, enviadaHaceDias: 33, elaboroId: 108, revisoId: 103,
                revision: 3, actividadId: nil, rechazo: nil,
                partidas: [
                    FinPartida(grupo: "EQUIPOS", nombre: "Tablero autosoportado con interruptor 800 A", unidad: "pza", cantidad: 1, precio: 168_000, costo: 131_000),
                    FinPartida(grupo: "MATERIALES", nombre: "Cable THW calibre 4/0 y zapatas", unidad: "m", cantidad: 60, precio: 610, costo: 455),
                    FinPartida(grupo: "MANO_DE_OBRA", nombre: "Montaje, conexión y pruebas", unidad: "serv", cantidad: 1, precio: 32_500, costo: 19_800),
                ]
            ),
            FinCotizacionSemilla(
                id: 7304, consecutivo: 4, estado: "RECHAZADA", segmento: "COMERCIAL", clienteId: 3103,
                contacto: "Mtra. Laura Benítez", proyecto: "Control de acceso para alumnos",
                alcance: "Torniquetes con lector facial en la entrada principal y reporte de asistencia para la dirección.",
                emitidaHaceDias: 26, vigenciaDias: 15, enviadaHaceDias: 25, elaboroId: 105, revisoId: 101,
                revision: 2, actividadId: nil,
                rechazo: "El patronato aprobó un presupuesto menor; lo retomamos el próximo ciclo escolar.",
                partidas: [
                    FinPartida(grupo: "EQUIPOS", nombre: "Torniquete de cuerpo completo con lector facial", unidad: "pza", cantidad: 2, precio: 46_500, costo: 35_800),
                    FinPartida(grupo: "MANO_DE_OBRA", nombre: "Obra civil, instalación y alta de usuarios", unidad: "serv", cantidad: 1, precio: 18_900, costo: 11_000),
                ]
            ),
            FinCotizacionSemilla(
                id: 7302, consecutivo: 2, estado: "VENCIDA", segmento: "SERVICIO", clienteId: 3101,
                contacto: "Ing. Roberto Salinas", proyecto: "Póliza anual de soporte de red",
                alcance: "Póliza de soporte 8×5 con dos visitas preventivas al mes y atención remota.",
                emitidaHaceDias: 48, vigenciaDias: 15, enviadaHaceDias: 47, elaboroId: 103, revisoId: nil,
                revision: 1, actividadId: nil, rechazo: nil,
                partidas: [
                    FinPartida(grupo: "MANO_DE_OBRA", nombre: "Póliza de soporte mensual", unidad: "mes", cantidad: 12, precio: 7_900, costo: 4_600),
                ]
            ),
        ]
    }

    private func finRutaCotizaciones(method: String, parts: [String]) -> DemoReply? {
        guard method == "GET" else { return nil }
        // cotizaciones/core · cotizaciones/core/:id
        if parts.count >= 2, parts[1] == "core" {
            if parts.count == 2 { return finRespuesta(finCotizaciones.map { finCotizacionResumen($0) }) }
            guard let id = Int(parts[2]), let semilla = finCotizaciones.first(where: { $0.id == id }) else {
                return finFallo(404, "Cotización no encontrada")
            }
            return finRespuesta(finCotizacionDetalle(semilla))
        }
        // cotizaciones/:id/pdf · cotizaciones/:id/pdf/internal
        if parts.count >= 3, parts[2] == "pdf", let id = Int(parts[1]),
           let semilla = finCotizaciones.first(where: { $0.id == id }) {
            let interno = parts.count >= 4 && parts[3] == "internal"
            return DemoReply(status: 200, data: finPdf(semilla, interno: interno))
        }
        return nil
    }

    private func finFolio(_ s: FinCotizacionSemilla) -> String {
        String(format: "NEX-VM75100126-%04d", s.consecutivo)
    }

    private func finEstadoEtiqueta(_ estado: String) -> String {
        switch estado {
        case "BORRADOR": return "Borrador"
        case "ENVIADA": return "Enviada"
        case "APROBADA": return "Aprobada"
        case "RECHAZADA": return "Rechazada"
        case "VENCIDA": return "Vencida"
        default: return estado.capitalized
        }
    }

    private func finSegmentoEtiqueta(_ segmento: String) -> String {
        switch segmento {
        case "COMERCIAL": return "Comercial"
        case "OBRA": return "Obra"
        case "LICITACION": return "Licitación"
        case "SERVICIO": return "Servicio"
        default: return segmento.capitalized
        }
    }

    private func finSubtotal(_ s: FinCotizacionSemilla) -> Double {
        finRedondeo(s.partidas.reduce(0) { $0 + $1.cantidad * $1.precio })
    }

    private func finIva(_ s: FinCotizacionSemilla) -> Double { finRedondeo(finSubtotal(s) * 0.16) }

    private func finTotal(_ s: FinCotizacionSemilla) -> Double { finRedondeo(finSubtotal(s) + finIva(s)) }

    private func finElaboro(_ s: FinCotizacionSemilla) -> DemoJSON {
        let p = finGente(s.elaboroId)
        return dj([
            "id": p.id, "nombre": p.nombre, "puesto": p.puesto,
            "clave": "VM751\(p.id % 100)", "siglas": finSiglas(p.nombre),
        ])
    }

    private func finParticipantes(_ s: FinCotizacionSemilla) -> [DemoJSON] {
        let autor = finGente(s.elaboroId)
        var lista: [DemoJSON] = [
            dj([
                "userId": autor.id, "nombre": autor.nombre, "puesto": autor.puesto, "avatarUrl": NSNull(),
                "clave": "VM751\(autor.id % 100)", "siglas": finSiglas(autor.nombre),
                "rol": "ELABORO", "rolEtiqueta": "Elaboró", "at": finHace(dias: s.emitidaHaceDias, horas: 3),
            ]),
        ]
        if let revisoId = s.revisoId {
            let p = finGente(revisoId)
            lista.append(dj([
                "userId": p.id, "nombre": p.nombre, "puesto": p.puesto, "avatarUrl": NSNull(),
                "clave": "VM751\(p.id % 100)", "siglas": finSiglas(p.nombre),
                "rol": "REVISO", "rolEtiqueta": "Revisó", "at": finHace(dias: s.emitidaHaceDias, horas: 1),
            ]))
        }
        return lista
    }

    private func finActividades(_ s: FinCotizacionSemilla) -> [DemoJSON] {
        guard let id = s.actividadId, let actividad = DemoData.activities.first(where: { $0.id == id }) else { return [] }
        return [dj(["id": actividad.id, "anNumber": actividad.folio, "titulo": actividad.titulo, "estatus": actividad.estatus])]
    }

    private func finCotizacionResumen(_ s: FinCotizacionSemilla) -> DemoJSON {
        let cliente = DemoData.clients.first { $0.id == s.clienteId }
        let folio = finFolio(s)
        return dj([
            "id": s.id,
            "folio": folio,
            "conNomenclatura": true,
            "necesitaRefolio": false,
            "folioNomenclatura": folio,
            "folioConsecutivo": s.consecutivo,
            "projectName": s.proyecto,
            "createdAt": finHace(dias: s.emitidaHaceDias, horas: 3),
            "updatedAt": finHace(dias: s.enviadaHaceDias ?? s.emitidaHaceDias, horas: 1),
            "clienteNombre": s.contacto,
            "clienteEmpresa": finNulo(cliente?.name),
            "segmento": s.segmento,
            "segmentoEtiqueta": finSegmentoEtiqueta(s.segmento),
            "estado": s.estado,
            "estadoEtiqueta": finEstadoEtiqueta(s.estado),
            "total": finTotal(s),
            "currency": "MXN",
            "issueDate": finDia(-s.emitidaHaceDias),
            "validUntil": finDia(s.vigenciaDias - s.emitidaHaceDias),
            "sentAt": finNulo(s.enviadaHaceDias.map { finHace(dias: $0, horas: 1) }),
            "revision": s.revision,
            "elaboro": finElaboro(s),
            "intervinieron": finParticipantes(s),
            "actividades": finActividades(s),
        ])
    }

    private func finCotizacionDetalle(_ s: FinCotizacionSemilla) -> DemoJSON {
        var detalle = finCotizacionResumen(s)
        let cliente = DemoData.clients.first { $0.id == s.clienteId }
        let etiquetas = ["EQUIPOS": "Equipos", "MATERIALES": "Materiales", "MANO_DE_OBRA": "Mano de obra"]
        var grupos: [DemoJSON] = []
        var totales: DemoJSON = ["EQUIPOS": 0.0, "MATERIALES": 0.0, "MANO_DE_OBRA": 0.0]
        for grupo in ["EQUIPOS", "MATERIALES", "MANO_DE_OBRA"] {
            let propias = s.partidas.enumerated().filter { $0.element.grupo == grupo }
            if propias.isEmpty { continue }
            let partidas: [DemoJSON] = propias.map { indice, p in
                dj([
                    "id": s.id * 100 + indice, "grupo": grupo, "category": etiquetas[grupo] ?? grupo,
                    "name": p.nombre, "description": NSNull(), "unit": p.unidad,
                    "qty": p.cantidad, "unitPrice": p.precio, "lineTotal": finRedondeo(p.cantidad * p.precio),
                ])
            }
            let subtotal = finRedondeo(propias.reduce(0) { $0 + $1.element.cantidad * $1.element.precio })
            totales[grupo] = subtotal
            grupos.append(dj(["grupo": grupo, "etiqueta": etiquetas[grupo] ?? grupo, "subtotal": subtotal, "partidas": partidas]))
        }
        let correo = s.contacto.lowercased()
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_MX"))
            .split(separator: " ").suffix(2).joined(separator: ".")
        let dominio = (cliente?.name ?? "cliente").lowercased()
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_MX"))
            .replacingOccurrences(of: " ", with: "")
        let siglas = finParticipantes(s).compactMap { $0["siglas"] as? String }.joined(separator: " / ")
        let condiciones: [DemoJSON] = [
            dj(["clave": "VIGENCIA", "titulo": "Vigencia",
                "texto": "Esta propuesta es válida por \(s.vigenciaDias) días naturales a partir de su fecha de emisión.",
                "personalizado": false]),
            dj(["clave": "PAGO", "titulo": "Forma de pago",
                "texto": "50 % de anticipo para iniciar y 50 % contra entrega, por transferencia.", "personalizado": false]),
            dj(["clave": "ENTREGA", "titulo": "Tiempo de entrega",
                "texto": "De 10 a 15 días hábiles después de recibir el anticipo.", "personalizado": s.segmento == "OBRA"]),
            dj(["clave": "GARANTIA", "titulo": "Garantía",
                "texto": "Un año en equipos contra defectos de fábrica y 90 días en mano de obra.", "personalizado": false]),
        ]
        detalle["folioBase"] = finFolio(s)
        detalle["quoteNumber"] = "COT-\(s.id)"
        detalle["cadenaParticipantes"] = siglas
        detalle["bloqueada"] = s.estado != "BORRADOR"
        detalle["clientName"] = s.contacto
        detalle["clientCompany"] = finNulo(cliente?.name)
        detalle["clientEmail"] = "\(correo)@\(dominio).example"
        detalle["clientPhone"] = "222 \(400 + s.consecutivo) \(1000 + s.id % 1000)"
        detalle["clientAddress"] = finNulo(cliente.map { "\($0.city), Puebla" })
        detalle["scope"] = s.alcance
        detalle["sentToEmail"] = finNulo(s.enviadaHaceDias == nil ? nil : "\(correo)@\(dominio).example")
        detalle["subtotal"] = finSubtotal(s)
        detalle["taxTotal"] = finIva(s)
        detalle["depositPercent"] = 50
        detalle["rejectedReason"] = finNulo(s.rechazo)
        detalle["rejectedByName"] = finNulo(s.rechazo == nil ? nil : s.contacto)
        detalle["incluyeInstalacion"] = s.partidas.contains { $0.grupo == "MANO_DE_OBRA" }
        if s.estado == "APROBADA" {
            let tecnico = finGente(106)
            let coordina = finGente(101)
            detalle["asignadoA"] = dj(["id": tecnico.id, "nombre": tecnico.nombre, "puesto": tecnico.puesto])
            detalle["asignadoPor"] = dj(["id": coordina.id, "nombre": coordina.nombre, "puesto": coordina.puesto])
            detalle["asignadoNota"] = "Programar con el cliente la primera visita."
            detalle["asignadoEn"] = finHace(dias: max(0, (s.enviadaHaceDias ?? 1) - 2), horas: 4)
        }
        detalle["grupos"] = grupos
        detalle["totalesPorGrupo"] = totales
        detalle["terminos"] = dj(["modalidad": "ESTANDAR", "titulo": "Términos y condiciones", "lineas": [String](), "partes": condiciones])
        detalle["participantes"] = finParticipantes(s)
        return detalle
    }

    /// El PDF de la propuesta, dibujado aquí mismo. El interno agrega costo y margen.
    private func finPdf(_ s: FinCotizacionSemilla, interno: Bool) -> Data {
        let cliente = DemoData.clients.first { $0.id == s.clienteId }?.name ?? s.contacto
        let pesos: (Double) -> String = { Dinero.pesos(finCentavos($0)) }
        var renglones: [(String, String, String, String)] = s.partidas.map { p in
            let total = p.cantidad * p.precio
            if interno {
                let margen = p.precio > 0 ? Int(((p.precio - p.costo) / p.precio * 100).rounded()) : 0
                return (p.nombre, pesos(p.costo * p.cantidad), pesos(total), "\(margen) %")
            }
            return (p.nombre, String(format: "%g %@", p.cantidad, p.unidad), pesos(p.precio), pesos(total))
        }
        renglones.insert(interno ? ("Concepto", "Costo", "Precio", "Margen") : ("Concepto", "Cantidad", "P. unitario", "Importe"), at: 0)
        let cabecera = [
            ("NEXARA · Propuesta \(interno ? "interna (costo y margen)" : "comercial")", CGFloat(18), UIFont.Weight.bold),
            ("Folio \(finFolio(s)) · Revisión \(s.revision)", CGFloat(11), UIFont.Weight.medium),
            ("\(cliente) · \(s.contacto)", CGFloat(13), UIFont.Weight.semibold),
            (s.proyecto, CGFloat(12), UIFont.Weight.regular),
        ]
        let alcance = s.alcance
        let pie = [
            "Subtotal: \(pesos(finSubtotal(s)))",
            "IVA 16 %: \(pesos(finIva(s)))",
            "Total: \(pesos(finTotal(s))) MXN",
        ]
        let gris = UIColor(red: 0.28, green: 0.33, blue: 0.41, alpha: 1)
        let tinta = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1)
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 612, height: 792))
        return renderer.pdfData { contexto in
            contexto.beginPage()
            var y: CGFloat = 48
            for (texto, tam, peso) in cabecera {
                (texto as NSString).draw(
                    at: CGPoint(x: 48, y: y),
                    withAttributes: [.font: UIFont.systemFont(ofSize: tam, weight: peso), .foregroundColor: tinta]
                )
                y += tam + 10
            }
            let parrafo = NSString(string: alcance)
            let caja = CGRect(x: 48, y: y + 4, width: 516, height: 60)
            parrafo.draw(in: caja, withAttributes: [.font: UIFont.systemFont(ofSize: 11), .foregroundColor: gris])
            y += 76
            for (indice, renglon) in renglones.enumerated() {
                let fuente = UIFont.systemFont(ofSize: 10.5, weight: indice == 0 ? .semibold : .regular)
                let atributos: [NSAttributedString.Key: Any] = [.font: fuente, .foregroundColor: indice == 0 ? gris : tinta]
                NSString(string: renglon.0).draw(in: CGRect(x: 48, y: y, width: 290, height: 28), withAttributes: atributos)
                NSString(string: renglon.1).draw(at: CGPoint(x: 350, y: y), withAttributes: atributos)
                NSString(string: renglon.2).draw(at: CGPoint(x: 430, y: y), withAttributes: atributos)
                NSString(string: renglon.3).draw(at: CGPoint(x: 510, y: y), withAttributes: atributos)
                y += 26
            }
            y += 12
            for linea in pie {
                NSString(string: linea).draw(
                    at: CGPoint(x: 400, y: y),
                    withAttributes: [.font: UIFont.systemFont(ofSize: 12, weight: .semibold), .foregroundColor: tinta]
                )
                y += 20
            }
        }
    }

    // MARK: Pagos a empleados

    /// `GET employee-payments`: dos quincenas pagadas, la actual en borrador y un anulado.
    func fxPagosEmpleados() -> [DemoJSON] {
        let paola = finPersona(107)
        func pago(
            _ id: Int, _ userId: Int, desde: Int, hasta: Int, minutos: Int, monto: String,
            concepto: String, nota: String? = nil, estatus: String, pagadoHaceDias: Int? = nil, folio: String? = nil
        ) -> DemoJSON {
            dj([
                "id": id,
                "userId": userId,
                "periodFrom": finFecha(desde),
                "periodTo": finFecha(hasta),
                "totalMinutes": minutos,
                "amount": monto,
                "concepto": concepto,
                "note": finNulo(nota),
                "status": estatus,
                "paidAt": finNulo(pagadoHaceDias.map { finHace(dias: $0, horas: 5) }),
                "contabilidadRef": finNulo(folio),
                "journalEntryId": finNulo(folio == nil ? nil : 4000 + id % 1000),
                "evidenceUrls": [String](),
                "createdAt": finHace(dias: max(0, -hasta) + 1, horas: 2),
                "user": finPersona(userId),
                "createdBy": paola,
            ])
        }
        return [
            pago(6214, 102, desde: -4, hasta: 10, minutos: 2_880, monto: "7850.00",
                 concepto: "Quincena", nota: "Se paga al cierre de la quincena.", estatus: "Borrador"),
            pago(6213, 104, desde: -4, hasta: 10, minutos: 2_640, monto: "6420.00",
                 concepto: "Quincena", estatus: "Borrador"),
            pago(6212, 106, desde: -10, hasta: -5, minutos: 540, monto: "1350.00",
                 concepto: "Horas extra · Hotel Casa Azul", nota: "Arranque de climas fuera de horario.",
                 estatus: "Pagado", pagadoHaceDias: 4, folio: "PAG-2026-0193"),
            pago(6211, 102, desde: -19, hasta: -5, minutos: 4_800, monto: "7850.00",
                 concepto: "Quincena", estatus: "Pagado", pagadoHaceDias: 5, folio: "PAG-2026-0192"),
            pago(6210, 104, desde: -19, hasta: -5, minutos: 4_560, monto: "6420.00",
                 concepto: "Quincena", estatus: "Pagado", pagadoHaceDias: 5, folio: "PAG-2026-0191"),
            pago(6209, 106, desde: -19, hasta: -5, minutos: 4_800, monto: "6900.00",
                 concepto: "Quincena", estatus: "Pagado", pagadoHaceDias: 5, folio: "PAG-2026-0190"),
            pago(6208, 109, desde: -19, hasta: -5, minutos: 4_680, monto: "6150.00",
                 concepto: "Quincena", estatus: "Pagado", pagadoHaceDias: 5, folio: "PAG-2026-0189"),
            pago(6207, 108, desde: -19, hasta: -5, minutos: 0, monto: "2500.00",
                 concepto: "Bono por certificación de red", nota: "Se capturó dos veces; queda el pago 6206.",
                 estatus: "Anulado"),
            pago(6206, 108, desde: -19, hasta: -5, minutos: 0, monto: "2500.00",
                 concepto: "Bono por certificación de red", estatus: "Pagado", pagadoHaceDias: 6, folio: "PAG-2026-0187"),
            pago(6205, 102, desde: -34, hasta: -20, minutos: 4_800, monto: "7850.00",
                 concepto: "Quincena", estatus: "Pagado", pagadoHaceDias: 20, folio: "PAG-2026-0176"),
        ]
    }

    // MARK: Gastos

    private func finGasto(
        _ id: Int, concepto: String, categoria: String, monto: String, estatus: String,
        dias: Int, de usuarioId: Int, ticket: Bool = true, recurrente: Bool = false,
        folio: String? = nil, actividadId: Int? = nil
    ) -> DemoJSON {
        let actividad = actividadId.flatMap { id in DemoData.activities.first { $0.id == id } }
        return dj([
            "id": id,
            "concepto": concepto,
            "razonGasto": concepto,
            "categoria": categoria,
            "montoSolicitado": monto,
            "estatusPago": estatus,
            "fechaGasto": finDia(-dias),
            "fechaSolicitud": finHace(dias: dias, horas: 2),
            "esRecurrente": recurrente,
            "isAdministrative": false,
            "ticketEvidenciaUrl": finNulo(ticket ? DemoImages.dataURL(.ticket) : nil),
            "contabilidadRef": finNulo(folio),
            "usuarioId": usuarioId,
            "usuario": finPersona(usuarioId),
            "createdBy": finPersona(usuarioId),
            "actividad": finNulo(actividad.map { dj(["id": $0.id, "anNumber": $0.folio, "titulo": $0.titulo]) }),
        ])
    }

    private func finSembrarGastos() -> [DemoJSON] {
        [
            finGasto(6410, concepto: "Cable THW y conectores para tablero", categoria: "Material", monto: "1284.50",
                     estatus: "Pendiente", dias: 0, de: 102, actividadId: 5143),
            finGasto(6409, concepto: "Estacionamiento y casetas · visita a Corporativo Atlixco", categoria: "Servicios",
                     monto: "386.00", estatus: "Pendiente", dias: 1, de: 104, ticket: false),
            finGasto(6408, concepto: "Licencia mensual de AutoCAD LT", categoria: "Suscripciones", monto: "1105.00",
                     estatus: "Pendiente", dias: 2, de: 105, recurrente: true),
            finGasto(6407, concepto: "Escalera de tijera de 8 escalones", categoria: "Equipo", monto: "3490.00",
                     estatus: "Aprobado", dias: 4, de: 106, folio: "POL-2026-0447"),
            finGasto(6406, concepto: "Internet de la oficina", categoria: "Servicios", monto: "899.00",
                     estatus: "Aprobado", dias: 5, de: 107, recurrente: true),
            finGasto(6405, concepto: "Renta mensual de la bodega de obra", categoria: "Renta", monto: "12500.00",
                     estatus: "Pagado", dias: 9, de: 107, recurrente: true, folio: "POL-2026-0431"),
            finGasto(6404, concepto: "Tornillería y taquetes para soportería", categoria: "Material", monto: "642.80",
                     estatus: "Pagado", dias: 12, de: 104, folio: "POL-2026-0428"),
            finGasto(6403, concepto: "Comida del equipo sin factura", categoria: "Otro", monto: "1860.00",
                     estatus: "Rechazado", dias: 8, de: 108, ticket: false),
            finGasto(6402, concepto: "Lona impresa para la obra del piso 4", categoria: "Publicidad", monto: "1150.00",
                     estatus: "Pagado", dias: 15, de: 101, folio: "POL-2026-0402"),
        ]
    }

    private func finRutaGastos(method: String, parts: [String], json: DemoJSON, body: Data?) -> DemoReply? {
        let estado = FinDemoEstado.shared
        if parts.count == 1 {
            if method == "GET" { return finRespuesta(estado.gastos) }
            if method == "POST" { return finAltaDeGasto(finCamposMultipart(body)) }
            return nil
        }
        guard let id = Int(parts[1]), let indice = estado.gastos.firstIndex(where: { ($0["id"] as? Int) == id }) else {
            return method == "GET" ? finFallo(404, "Gasto no encontrado") : nil
        }
        let accion = parts.count > 2 ? parts[2] : ""
        let estatus = estado.gastos[indice]["estatusPago"] as? String ?? ""
        switch (method, accion) {
        case ("GET", ""):
            return finRespuesta(estado.gastos[indice])
        case ("PATCH", "approve"):
            guard estatus == "Pendiente" else { return finFallo(400, "Solo se pueden autorizar gastos pendientes") }
            let aprobar = (json["action"] as? String ?? "approve") == "approve"
            estado.gastos[indice]["estatusPago"] = aprobar ? "Aprobado" : "Rechazado"
            return finRespuesta(estado.gastos[indice])
        case ("PATCH", "pagado"):
            guard estatus == "Aprobado" else {
                return finFallo(400, "El gasto debe estar aprobado para marcarlo como pagado")
            }
            estado.gastos[indice]["estatusPago"] = "Pagado"
            estado.gastos[indice]["contabilidadRef"] = "POL-2026-05\(id % 100)"
            return finRespuesta(estado.gastos[indice])
        default:
            return nil
        }
    }

    private func finAltaDeGasto(_ campos: [String: String]) -> DemoReply {
        let concepto = (campos["concepto"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !concepto.isEmpty else { return finFallo(400, "Concepto requerido") }
        guard let monto = Double(campos["monto"] ?? ""), monto > 0 else { return finFallo(400, "Monto inválido") }
        let estado = FinDemoEstado.shared
        estado.siguienteGasto += 1
        let id = estado.siguienteGasto
        var gasto = finGasto(
            id, concepto: concepto, categoria: campos["categoria"] ?? "Otro",
            monto: String(format: "%.2f", monto), estatus: "Pendiente", dias: 0, de: DemoMode.meId,
            recurrente: campos["esRecurrente"] == "true"
        )
        if let fecha = campos["fecha"], fecha.count >= 10 { gasto["fechaGasto"] = String(fecha.prefix(10)) + "T12:00:00.000Z" }
        gasto["fechaSolicitud"] = DemoClock.iso(Date())
        estado.gastos.insert(gasto, at: 0)
        return finRespuesta(gasto, status: 201)
    }

    /// Campos de texto de un `multipart/form-data` (la foto se ignora).
    private func finCamposMultipart(_ body: Data?) -> [String: String] {
        guard let body, !body.isEmpty else { return [:] }
        let texto = String(decoding: body, as: UTF8.self)
        guard let regex = try? NSRegularExpression(pattern: "name=\"([^\"]+)\"\\r\\n\\r\\n([^\\r]*)\\r\\n") else { return [:] }
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

    // MARK: Aprobaciones

    private var finAprobaciones: [FinAprobacionSemilla] {
        [
            FinAprobacionSemilla(
                id: 8802, entidad: "PURCHASE_ORDER", entidadId: 1187, flujo: "Autorización de órdenes de compra",
                pasos: [("Compras", nil, "Compras"), ("Dirección de Operaciones", 1, nil), ("Finanzas", nil, "Finanzas")],
                miPaso: 2, solicitanteId: 109, haceMinutos: 3 * 24 * 60 + 140,
                titulo: "OC-1187 · Distribuidora Eléctrica del Valle", detalle: "Material para el tablero general",
                monto: 48_720.50, moneda: "MXN"
            ),
            FinAprobacionSemilla(
                id: 8805, entidad: "VACATION", entidadId: 33, flujo: "Solicitud de vacaciones",
                pasos: [("Jefe directo", 1, nil)],
                miPaso: 1, solicitanteId: 103, haceMinutos: 2 * 24 * 60 + 190,
                titulo: nil, detalle: nil, monto: nil, moneda: "MXN"
            ),
            FinAprobacionSemilla(
                id: 8804, entidad: "VIATIC", entidadId: 9004, flujo: "Autorización de viáticos",
                pasos: [("Jefe directo", 1, nil), ("Contabilidad", nil, "Contabilidad")],
                miPaso: 1, solicitanteId: 102, haceMinutos: 26 * 60 + 15,
                titulo: "Viático · Diego Ramírez Soto", detalle: "Visita técnica a Atlixco",
                monto: 1_850, moneda: "MXN"
            ),
            FinAprobacionSemilla(
                id: 8806, entidad: "PURCHASE_ORDER", entidadId: 1192, flujo: "Autorización de órdenes de compra",
                pasos: [("Dirección de Operaciones", 1, nil), ("Finanzas", nil, "Finanzas")],
                miPaso: 1, solicitanteId: 108, haceMinutos: 7 * 60 + 20,
                titulo: "OC-1192 · Access points importados", detalle: "Proveedor en dólares",
                monto: 2_340, moneda: "USD"
            ),
            FinAprobacionSemilla(
                id: 8801, entidad: "EXPENSE", entidadId: 6399, flujo: "Aprobación de gasto operativo",
                pasos: [("Jefe directo", 101, nil), ("Dirección de Operaciones", 1, nil)],
                miPaso: 2, solicitanteId: 104, haceMinutos: 5 * 60 + 5,
                titulo: "Compra de herramienta eléctrica", detalle: "Equipo",
                monto: 7_850, moneda: "MXN"
            ),
            FinAprobacionSemilla(
                id: 8803, entidad: "COTIZACION_MONTO", entidadId: 7309, flujo: "Autorización de dirección por monto · Cotización",
                pasos: [("Dirección", 1, nil)],
                miPaso: 1, solicitanteId: 103, haceMinutos: 40,
                titulo: "Alumbrado perimetral LED", detalle: "Parque Industrial San José",
                monto: 247_312, moneda: "MXN"
            ),
        ]
    }

    private func finRutaWorkflow(method: String, parts: [String], json: DemoJSON) -> DemoReply? {
        let estado = FinDemoEstado.shared
        if method == "GET", parts.count == 2, parts[1] == "my-pending" {
            let vivas = finAprobaciones.filter { !estado.decididas.contains($0.id) }
            return finRespuesta(vivas.map { finAprobacion($0) })
        }
        // workflow/approvals/:id/decide
        guard method == "POST", parts.count == 4, parts[1] == "approvals", parts[3] == "decide",
              let id = Int(parts[2]) else { return nil }
        guard let semilla = finAprobaciones.first(where: { $0.id == id }), !estado.decididas.contains(id) else {
            return finFallo(400, "Esta aprobación ya fue decidida")
        }
        estado.decididas.insert(id)
        if (json["decision"] as? String) == "REJECTED" {
            return finRespuesta(dj(["decided": true, "complete": true, "cancelled": true]))
        }
        if semilla.miPaso < semilla.pasos.count {
            return finRespuesta(dj(["decided": true, "complete": false, "nextStep": semilla.miPaso + 1]))
        }
        return finRespuesta(dj(["decided": true, "complete": true]))
    }

    private func finWfPersona(_ id: Int) -> DemoJSON {
        let p = finGente(id)
        return dj(["id": p.id, "nombre": p.nombre, "role": dj(["nombre": p.puesto])])
    }

    private func finAprobacion(_ s: FinAprobacionSemilla) -> DemoJSON {
        let pasos: [DemoJSON] = s.pasos.enumerated().map { indice, paso in
            dj([
                "id": s.id * 10 + indice + 1,
                "stepNumber": indice + 1,
                "name": paso.0,
                "approverUserId": finNulo(paso.1),
                "approverRoleId": finNulo(paso.2 == nil ? nil : 30 + indice),
                "approverUser": finNulo(paso.1.map { finWfPersona($0) }),
                "approverRole": finNulo(paso.2.map { dj(["nombre": $0]) }),
            ])
        }
        // Los pasos anteriores al tuyo ya firmaron; el tuyo espera; los de después aún no existen.
        var aprobaciones: [DemoJSON] = []
        for numero in 1...s.miPaso {
            let paso = s.pasos[numero - 1]
            let esMio = numero == s.miPaso
            let firmante = paso.1 ?? (paso.2 == "Compras" ? 109 : 107)
            aprobaciones.append(dj([
                "id": esMio ? s.id : s.id * 100 + numero,
                "stepId": s.id * 10 + numero,
                "status": esMio ? "PENDING" : "APPROVED",
                "comments": NSNull(),
                "decidedAt": finNulo(esMio ? nil : finHace(minutos: s.haceMinutos + 30)),
                "createdAt": finHace(minutos: s.haceMinutos + (esMio ? 0 : 90)),
                "decidedBy": finNulo(esMio ? nil : finWfPersona(firmante)),
            ]))
        }
        let instancia = dj([
            "id": s.id - 8000 + 500,
            "entityId": s.entidadId,
            "entityType": s.entidad,
            "currentStep": s.miPaso,
            "isComplete": false,
            "isCancelled": false,
            "startedAt": finHace(minutos: s.haceMinutos + 120),
            "completedAt": NSNull(),
            "workflow": dj(["name": s.flujo, "entityType": s.entidad, "steps": pasos]),
            "startedBy": finWfPersona(s.solicitanteId),
            "approvals": aprobaciones,
        ])
        var fila = dj([
            "id": s.id,
            "stepId": s.id * 10 + s.miPaso,
            "status": "PENDING",
            "comments": NSNull(),
            "createdAt": finHace(minutos: s.haceMinutos),
            "step": pasos[s.miPaso - 1],
            "instance": instancia,
        ])
        if let titulo = s.titulo {
            fila["resumen"] = dj([
                "titulo": titulo,
                "detalle": finNulo(s.detalle),
                "monto": finNulo(s.monto),
                "moneda": s.moneda,
            ])
        }
        return fila
    }
}
