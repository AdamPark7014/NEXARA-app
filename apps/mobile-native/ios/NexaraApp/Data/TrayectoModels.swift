import Foundation

/// Un tramo del trayecto (`GET me/activities/:id/trayectos`): ida al sitio o regreso a la
/// oficina, medido aparte del reloj de la actividad. Espejo de `TrayectoDto` de Android y de
/// `trayectoDto` en apps/api/src/activities/trayectos/trayectos.ts.
struct ActivityTrayecto: Decodable, Hashable, Identifiable {
    let id: Int
    let activityId: Int?
    let userId: Int?
    /// IDA | REGRESO
    let tipo: String?
    /// AUTO | TRANSPORTE
    let modo: String?
    let startedAt: String?
    /// nil = sigue en camino.
    let endedAt: String?
    /// LLEGADA | INICIO | SALIDA | NUEVO
    let finMotivo: String?
    let minutos: Double?
    let estimadoMin: Double?
    /// google | osrm | aproximado
    let estimadoFuente: String?
    /// en_tiempo | excedido (ruta + 25 %); nil mientras va en camino o sin estimado.
    let estado: String?
}

/// `POST me/activities/:id/trayectos`: «Iniciar trayecto» (IDA) o «Regreso a la oficina»
/// (REGRESO), con el punto de salida si se tiene. Los nil no viajan.
struct IniciarTrayectoPayload: Encodable {
    let tipo: String
    let lat: Double?
    let lng: Double?
}

/// `POST me/activities/:id/trayectos/terminar`: «Llegué».
struct TerminarTrayectoPayload: Encodable {
    let lat: Double?
    let lng: Double?
}
