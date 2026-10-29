import Foundation

// Ligas y asistente del chat — paridad Android `ChatTarjetaLigaDto`,
// `ChatRespuestaAsistenteDto` (`data/api/ChatApi.kt`) y la web
// (`apps/web/lib/ligas.ts`, `apps/web/lib/asistente-chat-api.ts`).

/// Monto de una tarjeta (cotización, viático, factura).
struct ChatLigaMonto: Equatable {
    let total: Double
    let moneda: String
}

/// `TarjetaLiga` del API (`apps/api/src/chat/ligas/ligas.ts`), ya filtrada por
/// los permisos de quien la ve: sin acceso solo trae el título genérico.
struct ChatTarjetaLiga: Equatable {
    let ref: String
    let tipo: String
    /// `false`: sin permiso o ya no existe; solo título genérico y `motivo`.
    let acceso: Bool
    let folio: String?
    let titulo: String
    let estado: String?
    /// Renglones cortos (responsable, fecha, cliente…), ya en español.
    let detalle: [String]
    let monto: ChatLigaMonto?
    let href: String
    /// «Sin acceso», «No se encontró», «No se pudo cargar».
    let motivo: String?

    init(
        ref: String,
        tipo: String,
        acceso: Bool,
        folio: String?,
        titulo: String,
        estado: String? = nil,
        detalle: [String] = [],
        monto: ChatLigaMonto? = nil,
        href: String,
        motivo: String? = nil
    ) {
        self.ref = ref
        self.tipo = tipo
        self.acceso = acceso
        self.folio = folio
        self.titulo = titulo
        self.estado = estado
        self.detalle = detalle
        self.monto = monto
        self.href = href
        self.motivo = motivo
    }

    init(raw: [String: Any]) {
        ref = StockParse.str(raw["ref"])
        tipo = StockParse.str(raw["tipo"])
        acceso = ChatJSON.bool(raw["acceso"])
        folio = StockParse.str(raw["folio"]).nilIfEmpty
        titulo = StockParse.str(raw["titulo"])
        estado = StockParse.str(raw["estado"]).nilIfEmpty
        detalle = ((raw["detalle"] as? [Any]) ?? []).map { StockParse.str($0) }.filter { !$0.isEmpty }
        if let m = raw["monto"] as? [String: Any], let total = StockParse.dbl(m["total"]) {
            monto = ChatLigaMonto(total: total, moneda: StockParse.str(m["moneda"]).nilIfEmpty ?? "MXN")
        } else {
            monto = nil
        }
        href = StockParse.str(raw["href"])
        motivo = StockParse.str(raw["motivo"]).nilIfEmpty
    }
}

/// Valor JSON cualquiera, para reenviar tal cual el `payload` de una propuesta
/// del asistente (`POST activities`).
enum ChatJSONValue: Encodable, Equatable {
    case null
    case bool(Bool)
    case int(Int64)
    case double(Double)
    case string(String)
    case array([ChatJSONValue])
    case object([String: ChatJSONValue])

    init(_ value: Any?) {
        switch value {
        case nil, is NSNull:
            self = .null
        case let number as NSNumber:
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                self = .bool(number.boolValue)
            } else if CFNumberIsFloatType(number) {
                self = .double(number.doubleValue)
            } else {
                self = .int(number.int64Value)
            }
        case let text as String:
            self = .string(text)
        case let list as [Any]:
            self = .array(list.map { ChatJSONValue($0) })
        case let map as [String: Any]:
            self = .object(map.mapValues { ChatJSONValue($0) })
        default:
            self = .null
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .double(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}

/// «Asígnale a…» (solo CEO): se crea solo al tocar «Crear», con `POST activities`.
struct ChatPropuestaAsistente: Equatable {
    let resumen: String
    let titulo: String
    let responsable: String?
    let cuando: String?
    let faltantes: [String]
    let avisos: [String]
    /// Cuerpo listo para `POST activities`; se reenvía tal cual.
    let payload: ChatJSONValue

    init(raw: [String: Any]) {
        resumen = StockParse.str(raw["resumen"])
        titulo = StockParse.str(raw["titulo"])
        responsable = StockParse.str(raw["responsable"]).nilIfEmpty
        cuando = StockParse.str(raw["cuando"]).nilIfEmpty
        faltantes = ((raw["faltantes"] as? [Any]) ?? []).map { StockParse.str($0) }.filter { !$0.isEmpty }
        avisos = ((raw["avisos"] as? [Any]) ?? []).map { StockParse.str($0) }.filter { !$0.isEmpty }
        payload = ChatJSONValue(raw["payload"] as? [String: Any] ?? [:])
    }
}

/// Respuesta de `POST chat/asistente`. Solo la ve quien preguntó.
struct ChatRespuestaAsistente: Equatable {
    let intencion: String
    /// `codigo`: reglas y base de datos; `ia`: Claude por la puerta.
    let fuente: String
    /// Markdown del chat: sus ligas `[…](/erp/…)` se pintan como tarjetas.
    let texto: String
    let sugerencias: [String]
    let propuestas: [ChatPropuestaAsistente]

    init(raw: [String: Any]) {
        intencion = StockParse.str(raw["intencion"])
        fuente = StockParse.str(raw["fuente"]).nilIfEmpty ?? "codigo"
        texto = StockParse.str(raw["texto"])
        sugerencias = ((raw["sugerencias"] as? [Any]) ?? []).map { StockParse.str($0) }.filter { !$0.isEmpty }
        let accion = raw["accion"] as? [String: Any]
        propuestas = ((accion?["propuestas"] as? [[String: Any]]) ?? []).map(ChatPropuestaAsistente.init)
    }
}

/// Resultado de crear la actividad de una propuesta.
struct ChatActividadCreada {
    let id: Int64
    let anNumber: String?
    /// La cola sin conexión contesta `{queued:true}`: se creará al volver la señal.
    let enCola: Bool
}
