import Foundation

/// Quién está escribiendo ahora mismo en el canal abierto (`chat:typing`).
struct ChatTypingUser {
    let nombre: String
    let at: Date
}

/// Menciones del chat: el `@…` que se está escribiendo, el token que entiende
/// el API (`[@Nombre](user:id)`, ver `notifyUserMentions` en `chat.service.ts`)
/// y su versión legible al pintar el mensaje.
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

    /// `[@Nombre](user:12)` → `@Nombre`; `[texto](/ruta)` → `texto`.
    static func display(_ body: String) -> String {
        var out = body
        // Patrones con delimitadores equilibrados a propósito: `.+?` en vez de
        // clases negadas, que descuadran el chequeo estático sin Mac.
        let rules: [(pattern: String, template: String)] = [
            (#"\[@?(.+?)\]\(user:\d+\)"#, "@$1"),
            (#"\[(.+?)\]\(/.+?\)"#, "$1"),
        ]
        for rule in rules {
            guard let re = try? NSRegularExpression(pattern: rule.pattern) else { continue }
            out = re.stringByReplacingMatches(
                in: out,
                range: NSRange(out.startIndex..., in: out),
                withTemplate: rule.template
            )
        }
        return out
    }
}
