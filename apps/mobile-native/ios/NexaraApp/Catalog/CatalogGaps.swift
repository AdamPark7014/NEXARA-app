import Foundation

/// Huecos de catálogo restantes para merge en `ModuleCatalog.swift`.
/// Foundation ya metió `chat`/`reuniones` en console, `smart-quote`+`chat` en ventas
/// y `chat` en lab. Quedan contabilidad + studio (paridad Android).
///
/// Router (este turno): MeetingsView + ChatView (incl. contabilidad/studio/web) + SmartQuoteView.
enum CatalogGaps {
    /// Aún ausente en `ModuleCatalog.contabilidad`.
    static let contabilidadExtras: [ModuleEntry] = [
        ModuleEntry("chat", "Chat equipo", "💬", "/erp/chat"),
    ]

    /// Aún ausente en `ModuleCatalog.studio` / `web`.
    static let studioExtras: [ModuleEntry] = [
        ModuleEntry("chat", "Chat equipo", "💬", "/erp/chat"),
    ]

    /// Ya mergeado en ModuleCatalog — se deja documentado para el parent.
    static let alreadyMerged: [(key: String, where: String)] = [
        ("reuniones", "ModuleCatalog.console"),
        ("chat", "ModuleCatalog.console + ventas + lab"),
        ("smart-quote", "ModuleCatalog.ventas"),
    ]

    static let parityNotes: [(key: String, panels: String, router: String, catalog: String, screen: String)] = [
        ("reuniones", "console/ERP", "MeetingsView ✅", "MERGED console", "MeetingsView ✅"),
        ("chat", "console+ventas+lab (+ contabilidad/studio pending)", "ChatView ✅", "MERGED console/ventas/lab; falta contabilidad+studio", "ChatView ✅"),
        ("smart-quote", "ventas", "SmartQuoteView ✅", "MERGED ventas", "SmartQuoteView ✅"),
    ]
}
