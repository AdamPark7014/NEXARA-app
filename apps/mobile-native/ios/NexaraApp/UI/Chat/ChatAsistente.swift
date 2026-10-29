import Foundation

// Asistente de NEXARA en #general (`POST chat/asistente`) — paridad Android
// `ui/chat/ChatAsistente.kt` y la regla de la web (`send` de
// `apps/web/components/WorkspaceChat.tsx`): un mensaje del canal —no una
// respuesta de hilo—, sin adjunto, en #general y que mencione al asistente NO se
// publica; va al asistente y la respuesta solo la ve quien preguntó.

enum ChatAsistente {
    /// `MENCION_ASISTENTE` de la web y del API (`ai/asistente-chat/texto.ts`).
    private static let mencion = try? NSRegularExpression(
        pattern: "\\[@?asistente[^\\]]*\\]\\(user:0\\)|(^|\\s)@asistente\\b",
        options: [.caseInsensitive]
    )
    private static let pastilla = try? NSRegularExpression(
        pattern: "\\[@?asistente[^\\]]*\\]\\(user:0\\)",
        options: [.caseInsensitive]
    )
    private static let escrita = try? NSRegularExpression(
        pattern: "(^|\\s)@asistente\\b[,:]?",
        options: [.caseInsensitive]
    )

    /// El asistente solo vive en este canal (el API rechaza cualquier otro con 400).
    static let slugGeneral = "general"
    /// Placeholder del redactor en #general.
    static let placeholderGeneral = "Escribe o pregunta a @asistente…"
    /// Cuántos turnos guarda el panel (la web guarda 20).
    static let maxTurnos = 20

    static func esMencion(_ texto: String) -> Bool {
        guard let mencion else { return false }
        return mencion.firstMatch(in: texto, range: NSRange(location: 0, length: (texto as NSString).length)) != nil
    }

    /// ¿Este envío va al asistente en vez de publicarse? `parentId` es el hilo o
    /// la respuesta a la que iría (con él se publica normal, como en la web).
    static func debePreguntar(_ texto: String, slug: String?, parentId: Int64?, conAdjunto: Bool) -> Bool {
        guard parentId == nil, !conAdjunto else { return false }
        guard slug?.trimmingCharacters(in: .whitespaces).lowercased() == slugGeneral else { return false }
        guard !texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return esMencion(texto)
    }

    private static func reemplazar(_ re: NSRegularExpression?, en texto: String) -> String {
        guard let re else { return texto }
        return re.stringByReplacingMatches(
            in: texto,
            range: NSRange(location: 0, length: (texto as NSString).length),
            withTemplate: " "
        )
    }

    /// La pregunta como se ve en el panel: sin la mención al asistente.
    static func preguntaVisible(_ markup: String) -> String {
        reemplazar(escrita, en: reemplazar(pastilla, en: markup))
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// Texto con el que se manda una sugerencia tocada.
    static func textoDeSugerencia(_ sugerencia: String) -> String {
        "@asistente " + sugerencia.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Pie de cada respuesta: de dónde salió.
    static func etiquetaFuente(_ fuente: String) -> String {
        fuente == "ia" ? "Respondido con IA" : "Respondido con datos de NEXARA"
    }
}

/// Turno con el asistente: solo vive en este teléfono y solo lo ve quien preguntó.
struct ChatTurnoAsistente: Identifiable, Equatable {
    enum Estado: Equatable { case esperando, listo, error }

    let id: String
    /// Lo que se escribió, con la mención al asistente.
    let pregunta: String
    var estado: Estado
    var respuesta: ChatRespuestaAsistente?
    var error: String?
}

/// Qué pasó con una propuesta de «asígnale a…».
enum ChatCreacionPropuesta: Equatable {
    case creando
    case creada(id: Int64, anNumber: String?)
    /// Sin señal: la cola la manda al volver la red.
    case enCola
    case fallo(String)
    case descartada
}
