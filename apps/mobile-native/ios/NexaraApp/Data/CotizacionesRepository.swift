import Foundation

/// Cotizaciones de Core en el teléfono — espejo de `apps/api/src/cotizaciones`
/// y de `CotizacionesApi.kt` / `CotizacionesRepository.kt` de Android:
///
/// | Pantalla            | Endpoint                          |
/// |---------------------|-----------------------------------|
/// | Lista               | `GET cotizaciones/core`           |
/// | Detalle             | `GET cotizaciones/core/:id`       |
/// | PDF de la propuesta | `GET cotizaciones/:id/pdf`        |
/// | PDF interno         | `GET cotizaciones/:id/pdf/internal` |
///
/// Se usan **las rutas de Core** (`/core`) porque el servidor ya las devuelve
/// presentadas: estado y segmento en español, partidas agrupadas en Equipos /
/// Materiales / Mano de obra y la cadena de quienes intervinieron. Traducir eso
/// en el teléfono sería tener dos verdades.
///
/// Todas piden `cotizaciones.access` (el PDF admite además `sales.view` y
/// `panel.ventas`), así que un 403 es una respuesta legítima: se enseña el
/// mensaje del servidor, que es quien decide.
///
/// Reglas de los modelos, iguales que en Android: **todo es opcional**, para que
/// un campo que el servidor deje de mandar no tumbe la pantalla, y **todo importe
/// se guarda como texto**: los `Decimal` de Prisma viajan unas veces como número
/// (`listaCore` hace `Number(...)`) y otras como texto. Quien necesita la cifra
/// llama a `CotizacionesRules.centavos`, que nunca inventa un cero.

// MARK: - Lectura tolerante

/// Lee un campo sin tumbar el registro entero cuando viene con otro tipo.
fileprivate enum CotizacionLectura {
    /// Texto o número como texto (`14500.5` → `"14500.5"`).
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

    static func booleano<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Bool? {
        if let valor = try? c.decodeIfPresent(Bool.self, forKey: key) { return valor }
        return nil
    }

    static func objeto<T: Decodable, K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K, _ tipo: T.Type) -> T? {
        if let valor = try? c.decodeIfPresent(tipo, forKey: key) { return valor }
        return nil
    }

    static func lista<T: Decodable, K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K, _ tipo: T.Type) -> [T]? {
        if let valor = try? c.decodeIfPresent([T].self, forKey: key) { return valor }
        return nil
    }

    /// Lista de textos; si trae algo que no es texto se queda con lo legible.
    static func textos<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> [String]? {
        if let valor = try? c.decodeIfPresent([String].self, forKey: key) { return valor }
        if let valor = try? c.decodeIfPresent([JSONValue].self, forKey: key) {
            return valor.compactMap { $0.stringValue }
        }
        return nil
    }
}

/// Error con una frase que se puede enseñar tal cual.
fileprivate struct CotizacionesErrorLegible: LocalizedError {
    let mensaje: String
    var errorDescription: String? { mensaje }
}

// MARK: - Piezas compartidas por la lista y el detalle

/// Quien elaboró la cotización, con la clave de RH congelada en el folio.
struct CotizacionPersona: Decodable, Hashable {
    var id: Int?
    var nombre: String?
    /// Nomenclatura con la que se emitió el folio.
    var clave: String?
    var siglas: String?
    var puesto: String?

    private enum CodingKeys: String, CodingKey { case id, nombre, clave, siglas, puesto }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        id = CotizacionLectura.entero(c, .id)
        nombre = CotizacionLectura.texto(c, .nombre)
        clave = CotizacionLectura.texto(c, .clave)
        siglas = CotizacionLectura.texto(c, .siglas)
        puesto = CotizacionLectura.texto(c, .puesto)
    }
}

/// Quién intervino y con qué papel. `rol` es `ELABORO` · `LEVANTAMIENTO` ·
/// `REVISO` · `APROBO` · `ENVIO`; `rolEtiqueta` ya viene en español.
struct CotizacionParticipante: Decodable, Hashable {
    var userId: Int?
    var nombre: String?
    var puesto: String?
    var avatarUrl: String?
    var clave: String?
    var siglas: String?
    var rol: String?
    var rolEtiqueta: String?
    var at: String?

    private enum CodingKeys: String, CodingKey {
        case userId, nombre, puesto, avatarUrl, clave, siglas, rol, rolEtiqueta, at
    }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        userId = CotizacionLectura.entero(c, .userId)
        nombre = CotizacionLectura.texto(c, .nombre)
        puesto = CotizacionLectura.texto(c, .puesto)
        avatarUrl = CotizacionLectura.texto(c, .avatarUrl)
        clave = CotizacionLectura.texto(c, .clave)
        siglas = CotizacionLectura.texto(c, .siglas)
        rol = CotizacionLectura.texto(c, .rol)
        rolEtiqueta = CotizacionLectura.texto(c, .rolEtiqueta)
        at = CotizacionLectura.texto(c, .at)
    }
}

/// Actividad comercial ligada a la cotización (`AN-####`).
struct CotizacionActividad: Decodable, Hashable {
    var id: Int?
    var anNumber: String?
    var titulo: String?
    var estatus: String?

    private enum CodingKeys: String, CodingKey { case id, anNumber, titulo, estatus }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        id = CotizacionLectura.entero(c, .id)
        anNumber = CotizacionLectura.texto(c, .anNumber)
        titulo = CotizacionLectura.texto(c, .titulo)
        estatus = CotizacionLectura.texto(c, .estatus)
    }
}

// MARK: - Lista

/// Una fila de `GET cotizaciones/core` (`listaCore`).
struct CotizacionResumen: Decodable, Hashable {
    var id: Int?
    var folio: String?
    /// El folio sigue la nomenclatura de RH (`NEX-LJ75100126-0007…`); los viejos no.
    var conNomenclatura: Bool?
    var necesitaRefolio: Bool?
    var folioNomenclatura: String?
    var folioConsecutivo: Int?
    var projectName: String?
    var createdAt: String?
    var updatedAt: String?
    var clienteNombre: String?
    var clienteEmpresa: String?
    /// `COMERCIAL` · `OBRA` · `LICITACION` · `SERVICIO`.
    var segmento: String?
    var segmentoEtiqueta: String?
    /// `BORRADOR` · `ENVIADA` · `APROBADA` · `RECHAZADA` · `VENCIDA`.
    var estado: String?
    var estadoEtiqueta: String?
    var total: String?
    var currency: String?
    var issueDate: String?
    var validUntil: String?
    var sentAt: String?
    var revision: Int?
    var elaboro: CotizacionPersona?
    var intervinieron: [CotizacionParticipante]?
    var actividades: [CotizacionActividad]?

    private enum CodingKeys: String, CodingKey {
        case id, folio, conNomenclatura, necesitaRefolio, folioNomenclatura, folioConsecutivo
        case projectName, createdAt, updatedAt, clienteNombre, clienteEmpresa
        case segmento, segmentoEtiqueta, estado, estadoEtiqueta, total, currency
        case issueDate, validUntil, sentAt, revision, elaboro, intervinieron, actividades
    }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        id = CotizacionLectura.entero(c, .id)
        folio = CotizacionLectura.texto(c, .folio)
        conNomenclatura = CotizacionLectura.booleano(c, .conNomenclatura)
        necesitaRefolio = CotizacionLectura.booleano(c, .necesitaRefolio)
        folioNomenclatura = CotizacionLectura.texto(c, .folioNomenclatura)
        folioConsecutivo = CotizacionLectura.entero(c, .folioConsecutivo)
        projectName = CotizacionLectura.texto(c, .projectName)
        createdAt = CotizacionLectura.texto(c, .createdAt)
        updatedAt = CotizacionLectura.texto(c, .updatedAt)
        clienteNombre = CotizacionLectura.texto(c, .clienteNombre)
        clienteEmpresa = CotizacionLectura.texto(c, .clienteEmpresa)
        segmento = CotizacionLectura.texto(c, .segmento)
        segmentoEtiqueta = CotizacionLectura.texto(c, .segmentoEtiqueta)
        estado = CotizacionLectura.texto(c, .estado)
        estadoEtiqueta = CotizacionLectura.texto(c, .estadoEtiqueta)
        total = CotizacionLectura.texto(c, .total)
        currency = CotizacionLectura.texto(c, .currency)
        issueDate = CotizacionLectura.texto(c, .issueDate)
        validUntil = CotizacionLectura.texto(c, .validUntil)
        sentAt = CotizacionLectura.texto(c, .sentAt)
        revision = CotizacionLectura.entero(c, .revision)
        elaboro = CotizacionLectura.objeto(c, .elaboro, CotizacionPersona.self)
        intervinieron = CotizacionLectura.lista(c, .intervinieron, CotizacionParticipante.self)
        actividades = CotizacionLectura.lista(c, .actividades, CotizacionActividad.self)
    }

    /// Clave estable para la lista: el id; sin id, folio y fecha.
    var claveLista: String {
        if let id { return "id-\(id)" }
        return "sin-id-\(folio ?? "")-\(createdAt ?? "")"
    }
}

// MARK: - Detalle

/// Una partida de la propuesta, ya dentro de su grupo.
struct CotizacionPartida: Decodable, Hashable {
    var id: Int?
    /// `EQUIPOS` · `MATERIALES` · `MANO_DE_OBRA` cuando quien cotiza lo eligió.
    var grupo: String?
    var category: String?
    var name: String?
    var description: String?
    var unit: String?
    var qty: String?
    var unitPrice: String?
    var laborHours: String?
    var laborRate: String?
    var lineTotal: String?
    var paqueteClave: String?
    var paqueteCantidad: String?

    private enum CodingKeys: String, CodingKey {
        case id, grupo, category, name, description, unit, qty, unitPrice
        case laborHours, laborRate, lineTotal, paqueteClave, paqueteCantidad
    }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        id = CotizacionLectura.entero(c, .id)
        grupo = CotizacionLectura.texto(c, .grupo)
        category = CotizacionLectura.texto(c, .category)
        name = CotizacionLectura.texto(c, .name)
        description = CotizacionLectura.texto(c, .description)
        unit = CotizacionLectura.texto(c, .unit)
        qty = CotizacionLectura.texto(c, .qty)
        unitPrice = CotizacionLectura.texto(c, .unitPrice)
        laborHours = CotizacionLectura.texto(c, .laborHours)
        laborRate = CotizacionLectura.texto(c, .laborRate)
        lineTotal = CotizacionLectura.texto(c, .lineTotal)
        paqueteClave = CotizacionLectura.texto(c, .paqueteClave)
        paqueteCantidad = CotizacionLectura.texto(c, .paqueteCantidad)
    }
}

/// Un grupo de la propuesta técnica con su subtotal. El servidor ya los manda en
/// orden Equipos → Materiales → Mano de obra y sin los vacíos (`agruparPartidas`).
struct CotizacionGrupo: Decodable, Hashable {
    var grupo: String?
    var etiqueta: String?
    var subtotal: String?
    var partidas: [CotizacionPartida]?

    private enum CodingKeys: String, CodingKey { case grupo, etiqueta, subtotal, partidas }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        grupo = CotizacionLectura.texto(c, .grupo)
        etiqueta = CotizacionLectura.texto(c, .etiqueta)
        subtotal = CotizacionLectura.texto(c, .subtotal)
        partidas = CotizacionLectura.lista(c, .partidas, CotizacionPartida.self)
    }
}

/// Subtotal de cada grupo, siempre los tres (`totalesPorGrupo`).
struct CotizacionTotalesGrupo: Decodable, Hashable {
    var equipos: String?
    var materiales: String?
    var manoDeObra: String?

    private enum CodingKeys: String, CodingKey {
        case equipos = "EQUIPOS"
        case materiales = "MATERIALES"
        case manoDeObra = "MANO_DE_OBRA"
    }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        equipos = CotizacionLectura.texto(c, .equipos)
        materiales = CotizacionLectura.texto(c, .materiales)
        manoDeObra = CotizacionLectura.texto(c, .manoDeObra)
    }
}

/// Una condición de los términos, con su título ya en español.
struct CotizacionTerminoParte: Decodable, Hashable {
    var clave: String?
    var titulo: String?
    var texto: String?
    /// Lo reescribió quien cotiza; no es el texto por omisión del segmento.
    var personalizado: Bool?

    private enum CodingKeys: String, CodingKey { case clave, titulo, texto, personalizado }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        clave = CotizacionLectura.texto(c, .clave)
        titulo = CotizacionLectura.texto(c, .titulo)
        texto = CotizacionLectura.texto(c, .texto)
        personalizado = CotizacionLectura.booleano(c, .personalizado)
    }
}

/// `terminos` del detalle: lo que el cliente lee al final de la propuesta.
struct CotizacionTerminos: Decodable, Hashable {
    var modalidad: String?
    var titulo: String?
    var lineas: [String]?
    var partes: [CotizacionTerminoParte]?

    private enum CodingKeys: String, CodingKey { case modalidad, titulo, lineas, partes }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        modalidad = CotizacionLectura.texto(c, .modalidad)
        titulo = CotizacionLectura.texto(c, .titulo)
        lineas = CotizacionLectura.textos(c, .lineas)
        partes = CotizacionLectura.lista(c, .partes, CotizacionTerminoParte.self)
    }
}

/// A quién se le pasó la cotización por dentro (no sale en el PDF).
struct CotizacionAsignacion: Decodable, Hashable {
    var id: Int?
    var nombre: String?
    var puesto: String?

    private enum CodingKeys: String, CodingKey { case id, nombre, puesto }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        id = CotizacionLectura.entero(c, .id)
        nombre = CotizacionLectura.texto(c, .nombre)
        puesto = CotizacionLectura.texto(c, .puesto)
    }
}

/// `GET cotizaciones/core/:id` (`detalleCore` → `presentar`).
///
/// Trae mucho más de lo que la app enseña (objetivo, bloques de alcance, planos,
/// personalización): eso se edita en la computadora y aquí ni se declara.
struct CotizacionDetalle: Decodable, Hashable {
    var id: Int?
    var folio: String?
    var folioBase: String?
    var quoteNumber: String?
    var conNomenclatura: Bool?
    var necesitaRefolio: Bool?
    var revision: Int?
    var cadenaParticipantes: String?
    var estado: String?
    var estadoEtiqueta: String?
    /// Enviada o cerrada: en la web editarla crea una versión nueva.
    var bloqueada: Bool?
    var segmento: String?
    var segmentoEtiqueta: String?
    var clientName: String?
    var clientCompany: String?
    var clientEmail: String?
    var clientPhone: String?
    var clientAddress: String?
    var projectName: String?
    var scope: String?
    var issueDate: String?
    var validUntil: String?
    var sentAt: String?
    var sentToEmail: String?
    var currency: String?
    var subtotal: String?
    var taxTotal: String?
    var total: String?
    var depositPercent: String?
    var rejectedReason: String?
    var rejectedByName: String?
    var incluyeInstalacion: Bool?
    var elaboro: CotizacionPersona?
    var asignadoA: CotizacionAsignacion?
    var asignadoPor: CotizacionAsignacion?
    var asignadoNota: String?
    var asignadoEn: String?
    var grupos: [CotizacionGrupo]?
    var totalesPorGrupo: CotizacionTotalesGrupo?
    var terminos: CotizacionTerminos?
    var participantes: [CotizacionParticipante]?
    var actividades: [CotizacionActividad]?

    private enum CodingKeys: String, CodingKey {
        case id, folio, folioBase, quoteNumber, conNomenclatura, necesitaRefolio, revision
        case cadenaParticipantes, estado, estadoEtiqueta, bloqueada, segmento, segmentoEtiqueta
        case clientName, clientCompany, clientEmail, clientPhone, clientAddress, projectName, scope
        case issueDate, validUntil, sentAt, sentToEmail, currency, subtotal, taxTotal, total
        case depositPercent, rejectedReason, rejectedByName, incluyeInstalacion, elaboro
        case asignadoA, asignadoPor, asignadoNota, asignadoEn, grupos, totalesPorGrupo
        case terminos, participantes, actividades
    }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        id = CotizacionLectura.entero(c, .id)
        folio = CotizacionLectura.texto(c, .folio)
        folioBase = CotizacionLectura.texto(c, .folioBase)
        quoteNumber = CotizacionLectura.texto(c, .quoteNumber)
        conNomenclatura = CotizacionLectura.booleano(c, .conNomenclatura)
        necesitaRefolio = CotizacionLectura.booleano(c, .necesitaRefolio)
        revision = CotizacionLectura.entero(c, .revision)
        cadenaParticipantes = CotizacionLectura.texto(c, .cadenaParticipantes)
        estado = CotizacionLectura.texto(c, .estado)
        estadoEtiqueta = CotizacionLectura.texto(c, .estadoEtiqueta)
        bloqueada = CotizacionLectura.booleano(c, .bloqueada)
        segmento = CotizacionLectura.texto(c, .segmento)
        segmentoEtiqueta = CotizacionLectura.texto(c, .segmentoEtiqueta)
        clientName = CotizacionLectura.texto(c, .clientName)
        clientCompany = CotizacionLectura.texto(c, .clientCompany)
        clientEmail = CotizacionLectura.texto(c, .clientEmail)
        clientPhone = CotizacionLectura.texto(c, .clientPhone)
        clientAddress = CotizacionLectura.texto(c, .clientAddress)
        projectName = CotizacionLectura.texto(c, .projectName)
        scope = CotizacionLectura.texto(c, .scope)
        issueDate = CotizacionLectura.texto(c, .issueDate)
        validUntil = CotizacionLectura.texto(c, .validUntil)
        sentAt = CotizacionLectura.texto(c, .sentAt)
        sentToEmail = CotizacionLectura.texto(c, .sentToEmail)
        currency = CotizacionLectura.texto(c, .currency)
        subtotal = CotizacionLectura.texto(c, .subtotal)
        taxTotal = CotizacionLectura.texto(c, .taxTotal)
        total = CotizacionLectura.texto(c, .total)
        depositPercent = CotizacionLectura.texto(c, .depositPercent)
        rejectedReason = CotizacionLectura.texto(c, .rejectedReason)
        rejectedByName = CotizacionLectura.texto(c, .rejectedByName)
        incluyeInstalacion = CotizacionLectura.booleano(c, .incluyeInstalacion)
        elaboro = CotizacionLectura.objeto(c, .elaboro, CotizacionPersona.self)
        asignadoA = CotizacionLectura.objeto(c, .asignadoA, CotizacionAsignacion.self)
        asignadoPor = CotizacionLectura.objeto(c, .asignadoPor, CotizacionAsignacion.self)
        asignadoNota = CotizacionLectura.texto(c, .asignadoNota)
        asignadoEn = CotizacionLectura.texto(c, .asignadoEn)
        grupos = CotizacionLectura.lista(c, .grupos, CotizacionGrupo.self)
        totalesPorGrupo = CotizacionLectura.objeto(c, .totalesPorGrupo, CotizacionTotalesGrupo.self)
        terminos = CotizacionLectura.objeto(c, .terminos, CotizacionTerminos.self)
        participantes = CotizacionLectura.lista(c, .participantes, CotizacionParticipante.self)
        actividades = CotizacionLectura.lista(c, .actividades, CotizacionActividad.self)
    }
}

// MARK: - Repositorio

/// Lectura de Cotizaciones de Core.
///
/// Es de solo lectura a propósito (igual que Android): la propuesta se arma en
/// la computadora —objetivo, alcance, partidas, planos y el envío al cliente— y
/// el teléfono es para consultarla, enseñarla y mandar el PDF desde donde estés.
/// Lo que la app no hace lo dice la pantalla; ningún botón echa al navegador.
final class CotizacionesRepository {
    static let shared = CotizacionesRepository()

    private init() {}

    /// La lista completa, sin `search`.
    ///
    /// El filtro y la búsqueda se hacen en el teléfono (`CotizacionesRules`): la
    /// lista de Core cabe de sobra en memoria y filtrar sin red es instantáneo.
    func lista() async throws -> [CotizacionResumen] {
        let data = try await ApiClient.shared.get("cotizaciones/core")
        if let filas = try? JSONDecoder().decode([CotizacionResumen].self, from: data) {
            return filas
        }
        // Sobre paginado (`{ data: [...] }`), por si algún día se pide con `limit`.
        if let objeto = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           ["items", "data", "results", "rows"].contains(where: { objeto[$0] is [Any] }) {
            return try ApiClient.decodeList(data)
        }
        // Una respuesta que no es una lista no es «cero cotizaciones»: se dice.
        throw CotizacionesErrorLegible(mensaje: "No se pudieron leer las cotizaciones que mandó el servidor.")
    }

    func detalle(id: Int) async throws -> CotizacionDetalle {
        let data = try await ApiClient.shared.get("cotizaciones/core/\(id)")
        guard let objeto = try? JSONSerialization.jsonObject(with: data) as? [String: Any], !objeto.isEmpty,
              let detalle = try? JSONDecoder().decode(CotizacionDetalle.self, from: data) else {
            throw CotizacionesErrorLegible(mensaje: "No se pudo leer la cotización que mandó el servidor.")
        }
        return detalle
    }

    /// El PDF de la propuesta tal como lo recibe el cliente, en bytes.
    func pdf(id: Int) async throws -> Data {
        try await ApiClient.shared.getBinary("cotizaciones/\(id)/pdf")
    }

    /// PDF interno: costo, markup y precio. La API responde 403 si el rol no ve costos.
    func pdfInterno(id: Int) async throws -> Data {
        try await ApiClient.shared.getBinary("cotizaciones/\(id)/pdf/internal")
    }
}
