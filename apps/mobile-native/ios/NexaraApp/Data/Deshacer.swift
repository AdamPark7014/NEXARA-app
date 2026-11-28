import Foundation

/// «Deshacer» estilo Instagram (Adam, 27-11-2026). Paridad con `data/deshacer/Deshacer.kt` de Android y
/// `components/AvisoDeshacer` de la web.
///
/// Tras asignar una actividad o pedir un viático, la pantalla llama a `ofrecer` y el aviso de abajo
/// (`.avisoDeshacer()`, montado en la raíz) muestra «Deshacer» 5 s aunque la pantalla ya se haya cerrado.
/// La API decide de verdad: acepta a quien lo hizo en los primeros segundos o a un superior suyo cuando
/// sea, y a quien recibe no le llega aviso hasta que pasa el plazo.
@MainActor
final class DeshacerCentro: ObservableObject {
    static let shared = DeshacerCentro()
    private init() {}

    static let plazo: TimeInterval = 5
    static let tipoActividad = "actividad"
    static let tipoViatico = "viatico"
    /// Se publica al deshacer bien: las listas abiertas lo escuchan para recargarse. `object` = tipo.
    static let deshecho = Notification.Name("nx.deshacer.deshecho")

    struct Oferta: Equatable, Identifiable {
        let id: UUID
        let mensaje: String
        let tipo: String
        let ids: [Int]
        let detalle: String?
    }

    @Published private(set) var oferta: Oferta?

    /// Sin ids (quedó en la cola sin conexión) no hay nada que deshacer: no se muestra.
    func ofrecer(_ mensaje: String, tipo: String, ids: [Int], detalle: String? = nil) {
        var vistos = Set<Int>()
        let validos = ids.filter { $0 > 0 && vistos.insert($0).inserted }
        guard !validos.isEmpty else { return }
        oferta = Oferta(id: UUID(), mensaje: mensaje, tipo: tipo, ids: validos, detalle: detalle)
    }

    func descartar(_ id: UUID) {
        if oferta?.id == id { oferta = nil }
    }

    /// `POST deshacer`. Solo en línea (`ApiClient.isOnlineOnly`): vale segundos.
    /// 410 = ya pasó el plazo; 409 = ya avanzó; 403 = no es suyo ni de su gente.
    func deshacer(_ oferta: Oferta) async throws {
        struct Cuerpo: Encodable {
            let tipo: String
            let ids: [Int]
        }
        _ = try await ApiClient.shared.postJSON("deshacer", body: Cuerpo(tipo: oferta.tipo, ids: oferta.ids))
        NotificationCenter.default.post(name: Self.deshecho, object: oferta.tipo)
    }
}
