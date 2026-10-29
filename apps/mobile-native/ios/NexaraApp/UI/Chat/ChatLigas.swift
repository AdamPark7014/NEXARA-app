import Foundation

// Ligas del chat: qué se puede ligar en un mensaje, cómo se reconoce y a dónde
// lleva al tocarla. Paridad Android `ui/chat/ChatLigas.kt` y la web
// (`apps/web/lib/ligas.ts`, `apps/web/components/chat/folios.ts`); la tabla de
// rutas es la de `apps/api/src/chat/ligas/ligas.ts`:
//
//   actividad    /erp/actividades/20
//   evidencia    /erp/actividades/20/evidencias            (?evidencia=7)
//   cotización   /erp/cotizaciones/12
//   cliente      /erp/clientes/5
//   proyecto     /erp/proyectos/3
//   asistencia   /erp/asistencias/indicadores/7?desde=2026-10-29&hasta=2026-10-29
//   viático      /erp/finance/viatics?highlight=44
//   factura      /erp/invoicing/9
//
// Los folios escritos sueltos (`AN-0031`, `NEX-…`, `NXR-…`) se piden como
// `folio:AN-0031`. La tarjeta la arma el API con los permisos de quien la ve.

enum ChatTipoLiga: String, CaseIterable {
    case actividad, evidencia, cotizacion, cliente, proyecto, asistencia, viatico, factura

    var etiqueta: String {
        switch self {
        case .actividad: return "Actividad"
        case .evidencia: return "Evidencia"
        case .cotizacion: return "Cotización"
        case .cliente: return "Cliente"
        case .proyecto: return "Proyecto"
        case .asistencia: return "Asistencia"
        case .viatico: return "Viático"
        case .factura: return "Factura"
        }
    }

    /// Comercial y dinero en verde de marca; operación en azul (igual que la web).
    var esDeMarca: Bool {
        self == .cotizacion || self == .cliente || self == .viatico || self == .factura
    }

    /// Icono de la tarjeta y de la pestaña del selector.
    var systemImage: String {
        switch self {
        case .actividad: return "doc.text"
        case .evidencia: return "photo"
        case .cotizacion: return "doc.richtext"
        case .cliente: return "building.2"
        case .proyecto: return "folder"
        case .asistencia: return "person.crop.circle.badge.checkmark"
        case .viatico: return "airplane"
        case .factura: return "doc.plaintext"
        }
    }

    /// Lista del tipo en la web, para la tarjeta de un folio que no pudo cargarse.
    var lista: String {
        switch self {
        case .actividad, .evidencia: return "/erp/actividades"
        case .cotizacion: return "/erp/cotizaciones"
        case .cliente: return "/erp/clientes"
        case .proyecto: return "/erp/proyectos"
        case .asistencia: return "/erp/asistencias"
        case .viatico: return "/erp/finance/viatics"
        case .factura: return "/erp/invoicing"
        }
    }
}

/// Ruta guardada en el token, ya leída.
struct ChatLigaParseada: Equatable {
    let tipo: ChatTipoLiga
    let id: Int64
    /// Asistencia: día AAAA-MM-DD.
    var fecha: String? = nil
    /// Evidencia concreta dentro de la actividad.
    var evidenciaId: Int64? = nil
}

/// Lo que se pide al API (la ruta o `folio:AN-0031`) y lo que se pinta mientras carga.
struct ChatRefLiga: Equatable, Identifiable {
    let ref: String
    let tipo: ChatTipoLiga
    /// Folio que ya se lee en el mensaje.
    let folio: String?

    var id: String { ref }
}

/// Folio escrito en el texto.
struct ChatFolioDetectado: Equatable {
    let tipo: ChatTipoLiga
    let folio: String
    /// Id de la actividad cuando el mensaje trae la pastilla con su ruta.
    let id: Int64?
}

/// Pestaña del selector «Ligar» (`GET chat/mentions?kind=`).
struct ChatPestanaLigar: Equatable {
    let kind: String
    let etiqueta: String
    let buscar: String

    var systemImage: String { ChatLigas.tipoDeKind(kind)?.systemImage ?? "person" }
}

/// Tono del chip de estado de una tarjeta.
enum ChatTonoEstado {
    case proceso, validacion, finalizada, alerta, neutro

    var tone: NxTone {
        switch self {
        case .proceso: return .info
        case .validacion: return .warning
        case .finalizada: return .success
        case .alerta: return .danger
        case .neutro: return .neutral
        }
    }
}

/// A dónde lleva una liga.
enum ChatDestinoLiga: Equatable {
    /// Una pantalla de la app (el shell la abre).
    case app(DeepLinkDestination)
    /// La ficha de la cotización: el chat la abre encima (el shell todavía abre la lista).
    case cotizacion(id: Int)
    /// La app no tiene esa pantalla: la misma ruta en la web del panel.
    case web(URL)
}

enum ChatLigas {
    /// Tope de tarjetas por mensaje: un mensaje con diez folios no debe volverse un tablero.
    static let maxTarjetas = 3
    /// Donde vive la web de Core (Android `CoreMenu.CORE_WEB_BASE`).
    static let webBase = "https://core.nexara.com.mx"

    static let sinAcceso = "Sin acceso"
    static let noSePudoCargar = "No se pudo cargar"

    /// Orden del selector «Ligar»: el mismo de la web, lo que más se liga primero.
    static let pestanas: [ChatPestanaLigar] = [
        ChatPestanaLigar(kind: "ACTIVITY", etiqueta: "Actividades", buscar: "Buscar por AN, título o estado…"),
        ChatPestanaLigar(kind: "USER", etiqueta: "Personas", buscar: "Buscar por nombre o correo…"),
        ChatPestanaLigar(kind: "QUOTE", etiqueta: "Cotizaciones", buscar: "Folio, cliente o proyecto…"),
        ChatPestanaLigar(kind: "ATTENDANCE", etiqueta: "Asistencia", buscar: "¿De quién? (hoy)"),
        ChatPestanaLigar(kind: "CLIENT", etiqueta: "Clientes", buscar: "Nombre o razón social…"),
        ChatPestanaLigar(kind: "PROJECT", etiqueta: "Proyectos", buscar: "Proyecto o cliente…"),
        ChatPestanaLigar(kind: "EVIDENCE", etiqueta: "Evidencias", buscar: "Evidencia, actividad o comentario…"),
        ChatPestanaLigar(kind: "VIATIC", etiqueta: "Viáticos", buscar: "Motivo, categoría o persona…"),
        ChatPestanaLigar(kind: "INVOICE", etiqueta: "Facturas", buscar: "Folio o cliente…"),
    ]

    /// Tipo de liga de una pestaña (`USER` no es liga: es mencionar a alguien).
    static func tipoDeKind(_ kind: String) -> ChatTipoLiga? {
        switch kind.uppercased() {
        case "ACTIVITY": return .actividad
        case "EVIDENCE": return .evidencia
        case "QUOTE": return .cotizacion
        case "CLIENT": return .cliente
        case "PROJECT": return .proyecto
        case "ATTENDANCE": return .asistencia
        case "VIATIC": return .viatico
        case "INVOICE": return .factura
        default: return nil
        }
    }

    // MARK: Rutas

    /// Entero positivo escrito solo con dígitos (como `\d+` del API).
    private static func entero(_ raw: String?) -> Int64? {
        guard let raw, !raw.isEmpty, raw.allSatisfy({ $0.isASCII && $0.isNumber }),
              let value = Int64(raw), value > 0 else { return nil }
        return value
    }

    private static func parametros(_ query: String) -> [String: String] {
        var out: [String: String] = [:]
        for par in query.split(separator: "&") {
            let partes = par.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard partes.count == 2, !partes[0].isEmpty else { continue }
            let nombre = String(partes[0]).removingPercentEncoding ?? String(partes[0])
            let valor = String(partes[1]).replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? String(partes[1])
            if out[nombre] == nil { out[nombre] = valor }
        }
        return out
    }

    private static func esFecha(_ s: String) -> Bool {
        let partes = s.split(separator: "-", omittingEmptySubsequences: false)
        guard partes.count == 3 else { return false }
        let largos = [4, 2, 2]
        return zip(partes, largos).allSatisfy { parte, largo in
            parte.count == largo && parte.allSatisfy { $0.isASCII && $0.isNumber }
        }
    }

    /// Ruta guardada en el token → tipo e id; `nil` si no es una liga conocida.
    static func parsearLiga(_ href: String) -> ChatLigaParseada? {
        let limpio = href.trimmingCharacters(in: .whitespacesAndNewlines)
        guard limpio.hasPrefix("/erp/") else { return nil }
        let corte = limpio.firstIndex(of: "?")
        var ruta = corte.map { String(limpio[limpio.startIndex..<$0]) } ?? limpio
        while ruta.hasSuffix("/") { ruta.removeLast() }
        let params = corte.map { parametros(String(limpio[limpio.index(after: $0)...])) } ?? [:]
        let s = ruta.split(separator: "/", omittingEmptySubsequences: false).dropFirst().map(String.init)
        // s[0] == "erp"
        guard s.count >= 3, s[0] == "erp" else {
            return nil
        }
        switch (s[1], s.count) {
        case ("actividades", 4) where s[3] == "evidencias":
            guard let id = entero(s[2]) else { return nil }
            return ChatLigaParseada(tipo: .evidencia, id: id, evidenciaId: entero(params["evidencia"]))
        case ("actividades", 3):
            return entero(s[2]).map { ChatLigaParseada(tipo: .actividad, id: $0) }
        case ("cotizaciones", 3):
            return entero(s[2]).map { ChatLigaParseada(tipo: .cotizacion, id: $0) }
        case ("clientes", 3):
            return entero(s[2]).map { ChatLigaParseada(tipo: .cliente, id: $0) }
        case ("proyectos", 3):
            return entero(s[2]).map { ChatLigaParseada(tipo: .proyecto, id: $0) }
        case ("asistencias", 4) where s[2] == "indicadores":
            guard let id = entero(s[3]), let fecha = params["desde"], esFecha(fecha) else { return nil }
            return ChatLigaParseada(tipo: .asistencia, id: id, fecha: fecha)
        case ("finance", 3) where s[2] == "viatics":
            return entero(params["highlight"]).map { ChatLigaParseada(tipo: .viatico, id: $0) }
        case ("invoicing", 3):
            return entero(s[2]).map { ChatLigaParseada(tipo: .factura, id: $0) }
        default:
            return nil
        }
    }

    // MARK: Folios sueltos (folios.ts)

    private static func regex(_ pattern: String, _ options: NSRegularExpression.Options = []) -> NSRegularExpression? {
        try? NSRegularExpression(pattern: pattern, options: options)
    }

    private static let pastillaActividad = regex("\\[(AN-\\d{3,})[^\\]\\n]*\\]\\(/erp/actividades/(\\d+)\\)")
    private static let folioActividad = regex("(?<![A-Za-z0-9-])AN-\\d{3,}(?![\\dA-Za-z])")
    private static let folioCotizacion = regex(
        "(?<![A-Za-z0-9-])(?:NEX-[A-Z]{2}\\d{8}-\\d{4,}(?:-[A-Z]{2}(?:\\.[A-Z]{2})*)?(?:-R\\d+)?|NXR-\\d{4}-\\d{3,})(?![\\dA-Za-z])"
    )
    /// Token de liga a una ruta interna (no `user:`).
    private static let tokenRuta = regex("\\[([^\\]\\n]+)\\]\\((/[^)\\s]*)\\)")
    private static let folioAlInicio = regex("^(AN-\\d{3,})", .caseInsensitive)
    private static let folioCotAlInicio = regex("^(NEX-\\S+|NXR-\\S+)", .caseInsensitive)

    private static func coincidencias(_ re: NSRegularExpression?, _ text: String) -> [NSTextCheckingResult] {
        guard let re else { return [] }
        return re.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length))
    }

    private static func grupo(_ m: NSTextCheckingResult, _ i: Int, _ text: String) -> String {
        let r = m.range(at: i)
        guard r.location != NSNotFound else { return "" }
        return (text as NSString).substring(with: r)
    }

    /// Folios del mensaje en orden de aparición y sin repetir. Una pastilla de
    /// actividad gana sobre el mismo folio suelto porque trae el id.
    static func detectarFolios(_ body: String, max: Int = maxTarjetas) -> [ChatFolioDetectado] {
        var idPorFolio: [String: Int64] = [:]
        for m in coincidencias(pastillaActividad, body) {
            let folio = grupo(m, 1, body).uppercased()
            if idPorFolio[folio] == nil, let id = entero(grupo(m, 2, body)) { idPorFolio[folio] = id }
        }
        var hallados: [(tipo: ChatTipoLiga, folio: String, pos: Int)] = []
        for m in coincidencias(folioActividad, body) {
            hallados.append((.actividad, grupo(m, 0, body).uppercased(), m.range.location))
        }
        for m in coincidencias(folioCotizacion, body) {
            hallados.append((.cotizacion, grupo(m, 0, body).uppercased(), m.range.location))
        }
        hallados.sort { $0.pos < $1.pos }
        var vistos = Set<String>()
        var out: [ChatFolioDetectado] = []
        for h in hallados {
            guard vistos.insert("\(h.tipo.rawValue):\(h.folio)").inserted else { continue }
            let id = h.tipo == .actividad ? idPorFolio[h.folio] : nil
            out.append(ChatFolioDetectado(tipo: h.tipo, folio: h.folio, id: id))
            if out.count >= max { break }
        }
        return out
    }

    /// Ligas del mensaje en orden, sin repetir y con tope: primero las pastillas
    /// (traen la ruta exacta) y luego los folios sueltos que no venían en una.
    static func refsDelMensaje(_ body: String, max: Int = maxTarjetas) -> [ChatRefLiga] {
        var out: [ChatRefLiga] = []
        var vistos = Set<String>()
        var cubiertos = Set<String>()
        for m in coincidencias(tokenRuta, body) {
            let etiqueta = grupo(m, 1, body).trimmingCharacters(in: .whitespaces)
            let href = grupo(m, 2, body)
            guard let tipo = parsearLiga(href)?.tipo, vistos.insert(href).inserted else { continue }
            let folio = coincidencias(folioAlInicio, etiqueta).first.map { grupo($0, 1, etiqueta).uppercased() }
            let folioCot = coincidencias(folioCotAlInicio, etiqueta).first.map { grupo($0, 1, etiqueta).uppercased() }
            if let folio { cubiertos.insert(folio) }
            if let folioCot { cubiertos.insert(folioCot) }
            out.append(ChatRefLiga(ref: href, tipo: tipo, folio: folio ?? folioCot))
        }
        for f in detectarFolios(body, max: 10) where f.id == nil && !cubiertos.contains(f.folio) {
            let ref = "folio:\(f.folio)"
            guard vistos.insert(ref).inserted else { continue }
            out.append(ChatRefLiga(ref: ref, tipo: f.tipo, folio: f.folio))
        }
        return Array(out.prefix(max))
    }

    /// Todas las refs distintas de varios mensajes, en orden (una sola petición).
    static func refsDeMensajes(_ bodies: [String]) -> [String] {
        var vistas = Set<String>()
        var out: [String] = []
        for body in bodies {
            for ref in refsDelMensaje(body) where vistas.insert(ref.ref).inserted {
                out.append(ref.ref)
            }
        }
        return out
    }

    /// Título mientras carga o si no se pudo pedir: «Actividad AN-0031».
    static func tituloGenerico(_ tipo: ChatTipoLiga, folio: String?) -> String {
        guard let folio, !folio.isEmpty else { return tipo.etiqueta }
        return "\(tipo.etiqueta) \(folio)"
    }

    /// Tarjeta compacta de una ref que no se pudo pedir.
    static func tarjetaSinCargar(_ ref: String) -> ChatTarjetaLiga {
        let esFolio = ref.hasPrefix("folio:")
        let folio = esFolio ? String(ref.dropFirst("folio:".count)) : nil
        let tipo = refsDelMensaje(esFolio ? (folio ?? "") : "[liga](\(ref))").first?.tipo ?? .actividad
        return ChatTarjetaLiga(
            ref: ref,
            tipo: tipo.rawValue,
            acceso: false,
            folio: folio,
            titulo: tituloGenerico(tipo, folio: folio),
            href: ref.hasPrefix("/") ? ref : tipo.lista,
            motivo: noSePudoCargar
        )
    }

    /// Tono del chip según el texto del API (`tonoDeEstado` de la web).
    static func tonoDeEstado(_ estado: String?) -> ChatTonoEstado {
        let e = (estado ?? "")
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_MX"))
            .lowercased()
        if e.trimmingCharacters(in: .whitespaces).isEmpty { return .neutro }
        func tiene(_ partes: [String]) -> Bool { partes.contains { e.contains($0) } }
        if tiene(["cancel", "rechaz", "vencid", "perdid", "no cumplid", "incumplid"]) { return .alerta }
        if tiene(["finaliz", "complet", "cerrad", "aprob", "firmad", "ganad", "aceptad"]) { return .finalizada }
        if tiene(["valid", "revis", "pendiente de", "espera"]) { return .validacion }
        if tiene(["proceso", "curso", "enviad", "asignad", "progreso"]) { return .proceso }
        return .neutro
    }

    /// «$12,500.00» con la moneda del API (MXN por omisión).
    static func formatoMonto(_ total: Double, moneda: String?) -> String {
        let pedida = (moneda ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        let codigo = pedida.count == 3 ? pedida : "MXN"
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = Locale(identifier: "es_MX")
        f.currencyCode = codigo
        // En es-MX el peso se escribe «$»; otra moneda lleva su símbolo o su código.
        if codigo == "MXN" { f.currencySymbol = "$" }
        return f.string(from: NSNumber(value: total)) ?? String(format: "$%.2f", total)
    }

    // MARK: A dónde lleva

    /// Rutas que de verdad son la casa de Core (no «no la encontré»).
    private static let rutasCasa: Set<String> = ["erp", "erp/actividades", "erp/activities", "erp/pizarra", "core"]

    /// URL de la web del panel para una ruta interna.
    static func urlWeb(_ path: String) -> URL? {
        let ruta = path.hasPrefix("/") ? path : "/" + path
        return URL(string: webBase + ruta)
            ?? URL(string: webBase + (ruta.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""))
    }

    /// Destino de una ruta interna (`/erp/…`): la ficha cuando la app la tiene,
    /// su sección si no, y la web del panel cuando la app no tiene la pantalla
    /// (facturas, la asistencia de otra persona). Nunca deja a nadie en Inicio sin
    /// explicación. `nil` si no es una ruta interna (persona, URL externa).
    static func destino(_ href: String, usuarioActualId: Int64) -> ChatDestinoLiga? {
        let limpio = href.trimmingCharacters(in: .whitespacesAndNewlines)
        guard limpio.hasPrefix("/") else { return nil }
        let web = urlWeb(limpio).map { ChatDestinoLiga.web($0) }
        if let liga = parsearLiga(limpio) {
            switch liga.tipo {
            case .asistencia:
                let propia = DeepLinkDestination.core(CoreLink(module: .asistencias))
                if usuarioActualId > 0, liga.id == usuarioActualId { return .app(propia) }
                return web ?? .app(propia)
            case .factura:
                return web
            case .cotizacion:
                return .cotizacion(id: Int(liga.id))
            default:
                break
            }
        }
        guard let destino = DeepLinkParser.parseWebPath(limpio) else { return web }
        if destino == .core(CoreLink.home) {
            let ruta = String(limpio.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first ?? "")
                .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                .lowercased()
            if !rutasCasa.contains(ruta) { return web ?? .app(destino) }
        }
        return .app(destino)
    }
}
