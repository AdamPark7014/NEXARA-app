import Foundation

/// Viáticos de Core (`apps/api/src/viaticos`): el circuito completo del anticipo
/// —pedir con la foto del ticket, autorizar, repartir entre actividades,
/// comprobar y pagar— desde el teléfono.
///
/// El API ya viene filtrado por persona y por jefe: `GET viatics` devuelve lo
/// propio a quien solo pide viáticos y, a quien los administra, lo de su gente.
/// La app no decide quién ve qué; solo pinta lo que llega.
///
/// Todo campo que el API pueda mandar en `null` se decodifica con valor por
/// omisión: un registro raro deja la tarjeta incompleta, nunca tumba la pantalla.

// MARK: - DTOs

/// Una parte del reparto tal como la devuelve el API.
struct ViaticoReparto: Decodable, Identifiable, Hashable {
    var id: Int = 0
    var actividadId: Int = 0
    var monto: Double = 0
    var nota: String?
    /// Solo en el detalle (`GET viatics/:id`).
    var actividad: ViaticoActividadRef?

    private enum CodingKeys: String, CodingKey { case id, actividadId, monto, nota, actividad }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        actividadId = (try? c.decode(Int.self, forKey: .actividadId)) ?? 0
        monto = (try? c.decode(Double.self, forKey: .monto)) ?? 0
        nota = try? c.decode(String.self, forKey: .nota)
        actividad = try? c.decode(ViaticoActividadRef.self, forKey: .actividad)
    }

    var centavos: Int { Dinero.deApi(monto) }

    var titulo: String {
        if let actividad {
            let etiqueta = [actividad.anNumber, actividad.titulo]
                .compactMap { $0 }
                .first { !$0.isEmpty }
            if let etiqueta { return etiqueta }
        }
        return "Actividad #\(actividadId)"
    }
}

struct ViaticoActividadRef: Decodable, Hashable {
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

/// Estado del anticipo (`resumenLiquidacion` del servidor): qué se entregó, qué
/// se comprobó y quién le debe a quién.
struct ViaticoLiquidacion: Decodable, Hashable {
    /// `SIN_COMPROBAR` | `CUADRADO` | `POR_DEVOLVER` | `POR_REEMBOLSAR`.
    enum Estado: String {
        case sinComprobar = "SIN_COMPROBAR"
        case cuadrado = "CUADRADO"
        case porDevolver = "POR_DEVOLVER"
        case porReembolsar = "POR_REEMBOLSAR"
    }

    var entregado: Double = 0
    var comprobado: Double?
    var saldo: Double?
    var estadoRaw: String = ""

    private enum CodingKeys: String, CodingKey {
        case entregado, comprobado, saldo
        case estadoRaw = "estado"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        entregado = (try? c.decode(Double.self, forKey: .entregado)) ?? 0
        comprobado = try? c.decode(Double.self, forKey: .comprobado)
        saldo = try? c.decode(Double.self, forKey: .saldo)
        estadoRaw = (try? c.decode(String.self, forKey: .estadoRaw)) ?? ""
    }

    var estado: Estado? { Estado(rawValue: estadoRaw.uppercased()) }

    var saldoCentavos: Int? { saldo.map { Dinero.deApi($0) } }

    /// Una línea corta para el chip de la lista.
    var resumenCorto: String? {
        guard let estado else { return nil }
        let saldo = abs(saldoCentavos ?? 0)
        switch estado {
        case .sinComprobar: return "Falta comprobar"
        case .cuadrado: return "Cuadrado"
        case .porDevolver: return "Por devolver \(Dinero.pesos(saldo))"
        case .porReembolsar: return "Te deben \(Dinero.pesos(saldo))"
        }
    }

    /// La explicación larga, para el detalle.
    var explicacion: String? {
        guard let estado else { return nil }
        let saldo = abs(saldoCentavos ?? 0)
        switch estado {
        case .sinComprobar: return "Todavía no subes tickets contra este anticipo."
        case .cuadrado: return "Los tickets cuadran con lo que se entregó. No hay nada pendiente."
        case .porDevolver: return "Sobraron \(Dinero.pesos(saldo)): hay que devolverlos a la empresa."
        case .porReembolsar: return "Gastaste \(Dinero.pesos(saldo)) de más: la empresa te los debe."
        }
    }

    var tono: NxTone {
        switch estado {
        case .cuadrado: return .success
        case .porDevolver: return .info
        case .porReembolsar: return .brand
        case .sinComprobar, .none: return .warning
        }
    }
}

struct ViaticoPersonaRef: Decodable, Hashable {
    var id: Int = 0
    var nombre: String = ""

    private enum CodingKeys: String, CodingKey { case id, nombre }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? ""
    }
}

/// Un viático. `Pendiente` | `Aprobado` | `Rechazado` | `Pagado`.
///
/// `montoAprobado` se sella al autorizar (el jefe puede recortar la cifra) y es
/// contra eso —no contra lo solicitado— que se comprueban los tickets. El
/// **reparto**, en cambio, va contra `montoSolicitado`: es lo que valida
/// `setReparto` del otro lado.
struct Viatico: Decodable, Identifiable, Hashable {
    var id: Int = 0
    var usuarioId: Int?
    var estatus: String = ""
    var categoria: String = ""
    var motivo: String = ""
    var montoSolicitado: Double = 0
    var montoAprobado: Double?
    var montoComprobado: Double?
    var fechaSolicitud: String?
    var fechaComprobacion: String?
    var ticketEvidenciaUrl: String?
    var contabilidadRef: String?
    var actividadId: Int?
    var actividad: ViaticoActividadRef?
    var usuario: ViaticoPersonaRef?
    var repartos: [ViaticoReparto] = []
    var liquidacion: ViaticoLiquidacion?

    private enum CodingKeys: String, CodingKey {
        case id, usuarioId, estatus, categoria, motivo
        case montoSolicitado, montoAprobado, montoComprobado
        case fechaSolicitud, fechaComprobacion, ticketEvidenciaUrl, contabilidadRef
        case actividadId, actividad, usuario, repartos, liquidacion
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        usuarioId = try? c.decode(Int.self, forKey: .usuarioId)
        estatus = (try? c.decode(String.self, forKey: .estatus)) ?? ""
        categoria = (try? c.decode(String.self, forKey: .categoria)) ?? ""
        motivo = (try? c.decode(String.self, forKey: .motivo)) ?? ""
        montoSolicitado = (try? c.decode(Double.self, forKey: .montoSolicitado)) ?? 0
        montoAprobado = try? c.decode(Double.self, forKey: .montoAprobado)
        montoComprobado = try? c.decode(Double.self, forKey: .montoComprobado)
        fechaSolicitud = try? c.decode(String.self, forKey: .fechaSolicitud)
        fechaComprobacion = try? c.decode(String.self, forKey: .fechaComprobacion)
        ticketEvidenciaUrl = try? c.decode(String.self, forKey: .ticketEvidenciaUrl)
        contabilidadRef = try? c.decode(String.self, forKey: .contabilidadRef)
        actividadId = try? c.decode(Int.self, forKey: .actividadId)
        actividad = try? c.decode(ViaticoActividadRef.self, forKey: .actividad)
        usuario = try? c.decode(ViaticoPersonaRef.self, forKey: .usuario)
        repartos = (try? c.decode([ViaticoReparto].self, forKey: .repartos)) ?? []
        liquidacion = try? c.decode(ViaticoLiquidacion.self, forKey: .liquidacion)
    }

    // MARK: Estado

    var estaPendiente: Bool { estatus.caseInsensitiveCompare("Pendiente") == .orderedSame }
    var estaAprobado: Bool { estatus.caseInsensitiveCompare("Aprobado") == .orderedSame }
    var estaRechazado: Bool { estatus.caseInsensitiveCompare("Rechazado") == .orderedSame }
    var estaPagado: Bool { estatus.caseInsensitiveCompare("Pagado") == .orderedSame }

    var tonoEstatus: NxTone {
        if estaAprobado { return .success }
        if estaPagado { return .brand }
        if estaRechazado { return .danger }
        if estaPendiente { return .warning }
        return .neutral
    }

    // MARK: Importes, en centavos

    var solicitadoCentavos: Int { Dinero.deApi(montoSolicitado) }
    var aprobadoCentavos: Int? { montoAprobado.map { Dinero.deApi($0) } }
    var comprobadoCentavos: Int? { montoComprobado.map { Dinero.deApi($0) } }

    /// Lo entregado: lo autorizado si ya lo hay; si no, lo solicitado.
    var vigenteCentavos: Int { aprobadoCentavos ?? solicitadoCentavos }

    /// El jefe recortó la cifra respecto de lo pedido.
    var fueRecortado: Bool {
        guard let aprobado = aprobadoCentavos else { return false }
        return aprobado != solicitadoCentavos
    }

    var titulo: String {
        let limpio = motivo.trimmingCharacters(in: .whitespacesAndNewlines)
        return limpio.isEmpty ? Self.etiquetaCategoria(categoria) : limpio
    }

    var fechaCorta: String { String((fechaSolicitud ?? "").prefix(10)) }

    /// Categorías que acepta el servidor (`VIATIC_CATEGORIES`), con su nombre en pantalla.
    static let categorias: [(clave: String, etiqueta: String)] = [
        ("COMBUSTIBLE", "Gasolina"),
        ("CASETA", "Casetas"),
        ("ALIMENTACION", "Comidas"),
        ("HOSPEDAJE", "Hospedaje"),
        ("TRANSPORTE", "Transporte"),
        ("OTROS", "Otro"),
    ]

    static func etiquetaCategoria(_ categoria: String) -> String {
        let clave = categoria.trimmingCharacters(in: .whitespaces).uppercased()
        if let match = categorias.first(where: { $0.clave == clave }) { return match.etiqueta }
        guard !clave.isEmpty else { return "Viático" }
        return clave.lowercased().prefix(1).uppercased() + clave.lowercased().dropFirst()
    }
}

// MARK: - Repositorio

final class ViaticosRepository {
    static let shared = ViaticosRepository()
    private let api = ApiClient.shared
    private init() {}

    /// `GET viatics` — sin `limit`, el API devuelve el arreglo completo (tope de
    /// 200 del lado del servidor). Trae ya los repartos y la liquidación.
    func lista() async throws -> [Viatico] {
        let data = try await api.get("viatics")
        do {
            return try JSONDecoder().decode([Viatico].self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// `GET viatics/:id` — el detalle trae además el nombre de cada actividad del reparto.
    func detalle(id: Int) async throws -> Viatico {
        let data = try await api.get("viatics/\(id)")
        do {
            return try JSONDecoder().decode(Viatico.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// `POST viatics` — alta con la foto del ticket.
    ///
    /// El servidor exige evidencia: sin `ticketEvidencia` contesta 400 («Debes
    /// adjuntar el ticket o comprobante»). El reparto no viaja aquí —un
    /// multipart no lleva listas anidadas—: se guarda después desde el detalle.
    ///
    /// Devuelve `true` si se quedó en la cola sin conexión, para decirlo con
    /// esas palabras en vez de fingir que se envió.
    func crear(
        centavos: Int,
        motivo: String,
        categoria: String,
        actividadId: Int?,
        ticket: CapturedGeoPhoto
    ) async throws -> Bool {
        var campos: [String: String] = [
            "montoSolicitado": Dinero.textoApi(centavos),
            "motivo": motivo.trimmingCharacters(in: .whitespacesAndNewlines),
            "categoria": categoria,
        ]
        // Vacío no: `class-transformer` lo volvería `NaN` y `@IsInt()` lo tira.
        if let actividadId, actividadId > 0 {
            campos["actividadId"] = String(actividadId)
        }
        let data = try await api.uploadMultipartFiles(
            "viatics",
            fields: campos,
            files: [(field: "ticketEvidencia", data: ticket.jpeg, fileName: "ticket.jpg", mimeType: "image/jpeg")]
        )
        return CoreRepository.isQueuedOffline(data)
    }

    /// `PUT viatics/:id/reparto` — la suma tiene que ser el total, al centavo.
    ///
    /// El cuadre ya se comprobó en pantalla (`RepartoViatico`), pero el servidor
    /// lo vuelve a validar en centavos y contesta 400 con el desglose («faltan
    /// $12.30») si el monto cambió mientras tanto.
    func guardarReparto(id: Int, partes: [ParteReparto]) async throws -> Bool {
        struct ParteBody: Encodable {
            let actividadId: Int
            let monto: Double
            let nota: String?
        }
        struct Body: Encodable { let partes: [ParteBody] }

        let body = Body(partes: partes.map { parte in
            let nota = parte.nota?.trimmingCharacters(in: .whitespacesAndNewlines)
            return ParteBody(
                actividadId: parte.actividadId,
                monto: Dinero.aApi(parte.centavos),
                nota: (nota?.isEmpty ?? true) ? nil : nota
            )
        })
        let data = try await api.putJSON("viatics/\(id)/reparto", body: body)
        return CoreRepository.isQueuedOffline(data)
    }

    /// `PATCH viatics/:id/comprobar` — tickets contra el anticipo. La foto es
    /// opcional: puede ir solo la cifra.
    func comprobar(
        id: Int,
        centavosComprobados: Int,
        nota: String?,
        ticket: CapturedGeoPhoto?
    ) async throws -> Bool {
        var campos: [String: String] = ["montoComprobado": Dinero.textoApi(centavosComprobados)]
        let limpia = nota?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let limpia, !limpia.isEmpty { campos["nota"] = limpia }

        var archivos: [(field: String, data: Data, fileName: String, mimeType: String)] = []
        if let ticket {
            archivos.append((field: "ticketEvidencia", data: ticket.jpeg, fileName: "comprobante.jpg", mimeType: "image/jpeg"))
        }
        let data = try await api.uploadMultipartFiles(
            "viatics/\(id)/comprobar",
            method: "PATCH",
            fields: campos,
            files: archivos
        )
        return CoreRepository.isQueuedOffline(data)
    }

    /// `PATCH viatics/:id/approve` con `action: approve`.
    ///
    /// `centavosAprobados` recorta la cifra («te doy 800, no 1,200»); `nil`
    /// autoriza lo solicitado. El servidor no admite subirla.
    ///
    /// Autorizar, rechazar y marcar pagado exigen señal: son decisiones que el
    /// API todavía puede rechazar, y encoladas darían por hecho un dinero que
    /// nadie autorizó.
    func aprobar(id: Int, centavosAprobados: Int?, nota: String?) async throws {
        try await resolver(id: id, accion: "approve", centavos: centavosAprobados, nota: nota)
    }

    func rechazar(id: Int, nota: String?) async throws {
        try await resolver(id: id, accion: "reject", centavos: nil, nota: nota)
    }

    private func resolver(id: Int, accion: String, centavos: Int?, nota: String?) async throws {
        struct Body: Encodable {
            let action: String
            let note: String?
            let montoAprobado: Double?
        }
        try await CoreRepository.requireOnline()
        let limpia = nota?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = Body(
            action: accion,
            note: (limpia?.isEmpty ?? true) ? nil : limpia,
            montoAprobado: (centavos.map { $0 > 0 } ?? false) ? Dinero.aApi(centavos!) : nil
        )
        let data = try await api.patchJSON("viatics/\(id)/approve", body: body)
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `PATCH viatics/:id/pagado` — marca el pago y levanta la póliza contable.
    /// A partir de aquí el viático ya no se reparte.
    func marcarPagado(id: Int) async throws {
        struct Vacio: Encodable {}
        try await CoreRepository.requireOnline()
        let data = try await api.patchJSON("viatics/\(id)/pagado", body: Vacio())
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }
}
