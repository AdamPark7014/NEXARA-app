import SwiftUI

/// Quién está escribiendo ahora mismo en el canal abierto (`chat:typing`).
struct ChatTypingUser {
    let nombre: String
    let at: Date
}

/// Menciones de personas mientras se escribe (`@…`, como la web): el token que
/// entiende el API es `[@Nombre](user:id)` (ver `notifyUserMentions` en `chat.service.ts`).
enum ChatMentionFormat {
    /// Texto tras la última `@` mientras la mención sigue abierta.
    static func pendingMention(in text: String) -> String? {
        guard let at = text.lastIndex(of: "@") else { return nil }
        var precededByBoundary = true
        if at != text.startIndex {
            let prev = text[text.index(before: at)]
            precededByBoundary = prev.isWhitespace || prev.isNewline
        }
        guard precededByBoundary else { return nil }
        let partial = String(text[text.index(after: at)...])
        guard partial.count < 40,
              !partial.contains(where: { $0.isWhitespace || $0.isNewline }) else { return nil }
        return partial
    }

    /// Cambia el `@…` a medio escribir por el token de mención.
    static func replacePending(in text: String, label: String, userId: Int64) -> String {
        guard let at = text.lastIndex(of: "@") else { return text }
        let name = label
            .split(separator: "·")
            .first
            .map { $0.trimmingCharacters(in: .whitespaces) } ?? label
        let token = userId > 0 ? "[@\(name)](user:\(userId)) " : "@\(name) "
        return String(text[text.startIndex..<at]) + token
    }
}

// MARK: - Horas y fechas (America/Mexico_City)

/// Horas del chat SIEMPRE en America/Mexico_City (Android `formatMessageTime`,
/// `formatChannelTime`, `chatDayLabel`): un teléfono con otro huso no debe mover
/// la hora de un mensaje.
enum ChatTime {
    static let zone = TimeZone(identifier: "America/Mexico_City") ?? .current

    static let calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = zone
        cal.locale = Locale(identifier: "es_MX")
        return cal
    }()

    private static func formatter(_ pattern: String, locale: String = "en_US_POSIX") -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = zone
        f.locale = Locale(identifier: locale)
        f.dateFormat = pattern
        return f
    }

    private static let hourFormatter = formatter("HH:mm")
    private static let channelFormatter = formatter("dd/MM HH:mm")
    private static let dayKeyFormatter = formatter("yyyy-MM-dd")
    /// «lunes 5 de octubre» (Android `EEEE d 'de' MMMM`, es-MX).
    private static let dayFormatter = formatter("EEEE d 'de' MMMM", locale: "es_MX")
    /// Fecha local sin huso que mandan algunos registros viejos.
    private static let localFormatter = formatter("yyyy-MM-dd'T'HH:mm:ss")

    static func parse(_ iso: String) -> Date? {
        let raw = iso.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        if let date = NxFormat.parseISO(raw) { return date }
        return localFormatter.date(from: String(raw.prefix(19)))
    }

    /// «14:05».
    static func messageTime(_ iso: String) -> String {
        guard let date = parse(iso) else { return String(iso.prefix(16)) }
        return hourFormatter.string(from: date)
    }

    /// Lista de conversaciones: hoy «14:05», ayer «Ayer», antes «03/10 14:05».
    static func channelTime(_ iso: String, now: Date = Date()) -> String {
        guard let date = parse(iso) else { return String(iso.prefix(16)) }
        if calendar.isDate(date, inSameDayAs: now) { return hourFormatter.string(from: date) }
        if let ayer = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: ayer) {
            return "Ayer"
        }
        return channelFormatter.string(from: date)
    }

    static func dayKey(_ iso: String) -> String {
        guard let date = parse(iso) else { return String(iso.prefix(10)) }
        return dayKeyFormatter.string(from: date)
    }

    /// Divisor de fecha: «Hoy», «Ayer» o «lunes 5 de octubre».
    static func dayLabel(_ iso: String, now: Date = Date()) -> String {
        guard let date = parse(iso) else { return String(iso.prefix(10)) }
        if calendar.isDate(date, inSameDayAs: now) { return "Hoy" }
        if let ayer = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: ayer) {
            return "Ayer"
        }
        return dayFormatter.string(from: date)
    }

    /// Hoja de reacciones: «ahora», «hace 5 min», «hace 2 h», «hace 3 d» o la fecha.
    static func relativeReaction(_ iso: String, now: Date = Date()) -> String {
        guard let date = parse(iso) else { return "" }
        let seconds = max(0, now.timeIntervalSince(date))
        let minutes = Int(seconds / 60)
        if minutes < 1 { return "ahora" }
        if minutes < 60 { return "hace \(minutes) min" }
        let hours = minutes / 60
        if hours < 24 { return "hace \(hours) h" }
        let days = hours / 24
        if days < 7 { return "hace \(days) d" }
        return dayFormatter.string(from: date)
    }
}

// MARK: - Texto de los mensajes

/// Un trozo del cuerpo: texto llano o un enlace `[etiqueta](destino)`.
enum ChatMarkupPiece {
    case text(String)
    case link(label: String, href: String)
}

/// Marcado de los mensajes (Android `buildChatMessageAnnotatedString`,
/// `readableChatText`, `formatLastMessagePreview`, `formatEntityMentionToken`).
enum ChatMarkup {
    /// `[etiqueta](destino)`: la etiqueta sin `]` ni salto de línea y el destino sin `)`.
    private static let linkRegex = try? NSRegularExpression(pattern: "\\[([^\\]\\n]+)\\]\\(([^)]+)\\)")
    /// Esquema interno para que un enlace del texto se abra dentro de la app.
    static let linkScheme = "nexara-chat"

    static func pieces(_ text: String) -> [ChatMarkupPiece] {
        guard let regex = linkRegex else { return [.text(text)] }
        let ns = text as NSString
        var result: [ChatMarkupPiece] = []
        var last = 0
        for match in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            if match.range.location > last {
                result.append(.text(ns.substring(with: NSRange(location: last, length: match.range.location - last))))
            }
            let label = ns.substring(with: match.range(at: 1))
            let href = ns.substring(with: match.range(at: 2))
            result.append(.link(label: label, href: href))
            last = match.range.location + match.range.length
        }
        if last < ns.length {
            result.append(.text(ns.substring(from: last)))
        }
        return result
    }

    /// Cuerpo con estilo: menciones `[@Nombre](user:2)` en semibold y enlaces a
    /// actividades/evidencias subrayados y tocables (se abren con `openURL`).
    static func attributed(_ text: String, primary: Color, mention: Color) -> AttributedString {
        // Claves explícitas: `run.underlineStyle = .single` es ambiguo entre
        // SwiftUI y UIKit.
        typealias UI = AttributeScopes.SwiftUIAttributes
        var out = AttributedString()
        for piece in pieces(text) {
            switch piece {
            case .text(let plain):
                var run = AttributedString(plain)
                run[UI.ForegroundColorAttribute.self] = primary
                out.append(run)
            case .link(let label, let href):
                var run = AttributedString(label)
                if href.hasPrefix("user:") {
                    run[UI.ForegroundColorAttribute.self] = mention
                    run[UI.FontAttribute.self] = Font.system(size: 14, weight: .semibold)
                } else {
                    run[UI.FontAttribute.self] = Font.system(size: 14, weight: .medium)
                    run[UI.UnderlineStyleAttribute.self] = Text.LineStyle.single
                    run[AttributeScopes.FoundationAttributes.LinkAttribute.self] = linkURL(href)
                }
                out.append(run)
            }
        }
        return out
    }

    /// Lleva el destino del enlace dentro de una URL propia, para abrirlo en la app.
    static func linkURL(_ href: String) -> URL? {
        var components = URLComponents()
        components.scheme = linkScheme
        components.host = "open"
        components.queryItems = [URLQueryItem(name: "href", value: href)]
        return components.url
    }

    static func href(from url: URL) -> String? {
        guard url.scheme == linkScheme else { return nil }
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "href" })?
            .value
    }

    /// Texto legible para listas y avisos: `[@Nombre](user:2)` → `@Nombre`,
    /// `[etiqueta](/ruta)` → `etiqueta`, sin emojis de mensajes viejos.
    static func readable(_ body: String) -> String {
        var out = ""
        for piece in pieces(body) {
            switch piece {
            case .text(let plain):
                out += plain
            case .link(let label, let href):
                if href.hasPrefix("user:") {
                    out += label.hasPrefix("@") ? label : "@" + label
                } else {
                    out += label
                }
            }
        }
        return stripEmoji(out).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Quita los emojis de los rangos U+1F300–1FAFF y U+2600–27BF (con su
    /// variante FE0F y un espacio detrás), como el preview de Android.
    static func stripEmoji(_ text: String) -> String {
        var scalars = String.UnicodeScalarView()
        var skipNext = false
        var skipSpace = false
        for scalar in text.unicodeScalars {
            let value = scalar.value
            if skipNext, value == 0xFE0F {
                skipNext = false
                continue
            }
            skipNext = false
            if skipSpace, scalar.properties.isWhitespace {
                skipSpace = false
                continue
            }
            skipSpace = false
            if (0x1F300...0x1FAFF).contains(value) || (0x2600...0x27BF).contains(value) {
                skipNext = true
                skipSpace = true
                continue
            }
            scalars.append(scalar)
        }
        return String(scalars)
    }

    /// Vista previa de la fila: texto (72 caracteres) y si es un adjunto
    /// (`Archivo: …`, que lleva el clip delante y sin el prefijo).
    static func preview(_ raw: String) -> (text: String, isAttachment: Bool)? {
        let collapsed = readable(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        guard !collapsed.isEmpty else { return nil }
        if collapsed.lowercased().hasPrefix("archivo:") {
            let rest = String(collapsed.dropFirst("archivo:".count)).trimmingCharacters(in: .whitespaces)
            return (rest, true)
        }
        if collapsed.count > 72 {
            let cut = String(collapsed.prefix(72)).trimmingCharacters(in: .whitespaces)
            return (cut + "…", false)
        }
        return (collapsed, false)
    }

    /// `[AN-0142 · Título](/erp/actividades/5142)`: el token que se pega en el
    /// mensaje al «Mencionar actividad» o «Mencionar evidencia».
    static func entityToken(_ entity: ChatMentionRow) -> String {
        let cleanLabel = entity.label
            .filter { !"[]()".contains($0) }
            .trimmingCharacters(in: .whitespaces)
        var href = entity.href.trimmingCharacters(in: .whitespacesAndNewlines)
        if href.isEmpty {
            switch entity.kind {
            case "ACTIVITY": href = "/erp/actividades/\(entity.entityId)"
            case "EVIDENCE": href = "/erp/actividades"
            default: href = "/"
            }
        }
        return "[\(cleanLabel)](\(href))"
    }

    /// Agrega el token al borrador con un espacio antes (si hace falta) y otro después.
    static func append(token: String, to current: String) -> String {
        let spacer = (!current.isEmpty && !(current.last?.isWhitespace ?? true)) ? " " : ""
        return current + spacer + token + " "
    }

    static func isPdf(name: String, url: String) -> Bool {
        let hint = (name.isEmpty ? url : name).lowercased()
        return hint.hasSuffix(".pdf")
    }

    static func isImage(name: String, url: String) -> Bool {
        if isPdf(name: name, url: url) { return false }
        let hint = (name.isEmpty ? url : name).lowercased()
        return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic"].contains { hint.hasSuffix($0) }
            || hint.contains("image/")
    }
}

// MARK: - Canales

/// Prefijo, icono y tipo de un canal (Android `channelPrefix`, `channelIcon`, `channelKindLabel`).
enum ChatChannelKind {
    static func prefix(_ kind: String) -> String {
        switch kind.uppercased() {
        case "DIRECT", "PRIVATE": return ""
        default: return "# "
        }
    }

    /// Candado de contorno solo en los privados.
    static func systemImage(_ kind: String) -> String? {
        kind.uppercased() == "PRIVATE" ? "lock" : nil
    }

    static func label(_ kind: String) -> String {
        switch kind.uppercased() {
        case "DIRECT": return "Mensaje directo"
        case "PRIVATE": return "Canal privado"
        default: return "Canal público"
        }
    }

    static func title(_ channel: ChatChannelRow) -> String {
        prefix(channel.kind) + channel.name
    }

    /// «X está escribiendo…» (Android `ChatTypingIndicator`).
    static func typingLabel(_ names: [String]) -> String {
        let clean = names.filter { !$0.isEmpty }
        switch clean.count {
        case 0: return ""
        case 1: return "\(clean[0]) está escribiendo…"
        case 2: return "\(clean[0]) y \(clean[1]) están escribiendo…"
        default: return "\(clean.prefix(2).joined(separator: ", ")) y otros están escribiendo…"
        }
    }
}
