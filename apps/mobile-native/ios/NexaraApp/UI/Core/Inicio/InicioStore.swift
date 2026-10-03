import Foundation

/// Lo de actividades de Inicio (`GET me/activities`). Vive en el shell para que
/// la pestaña Actividades tenga su insignia sin pedir la lista dos veces. La
/// jornada la lleva `AttendanceVM` (misma checada con foto y GPS que Asistencias).
@MainActor
final class InicioStore: ObservableObject {
    @Published private(set) var data: MyActivitiesResponse?
    @Published private(set) var loading = true
    @Published private(set) var error: String?
    /// Actividad sobre la que corre «Iniciar» o «Reanudar».
    @Published private(set) var accionEnCurso: Int?
    @Published var accionError: String?

    var open: [MyActivityItem] { data?.open ?? [] }
    var hechasHoy: Int { data?.doneToday.count ?? 0 }
    var actual: MyActivityItem? { InicioRules.actual(open) }
    var siguientes: [MyActivityItem] { InicioRules.siguientes(open, actual: actual) }
    var pendientes: Int { InicioRules.pendientes(open) }

    /// `enabled` = el rol abre Actividades; sin eso no se pide nada.
    func load(enabled: Bool) async {
        guard enabled else {
            data = nil
            loading = false
            return
        }
        do {
            data = try await CoreRepository.shared.myActivities()
            error = nil
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudieron cargar tus actividades")
        }
        loading = false
    }

    /// «Iniciar»: guarda la hora real de inicio. `true` si quedó.
    func iniciar(_ activityId: Int) async -> Bool {
        await accion(activityId, fallback: "No se pudo iniciar la actividad") {
            try await CoreRepository.shared.iniciarActividad(activityId: activityId)
        }
    }

    /// «Reanudar»: el reloj vuelve a correr en esa actividad. `true` si quedó.
    func reanudar(_ activityId: Int) async -> Bool {
        await accion(activityId, fallback: "No se pudo reanudar la actividad") {
            try await CoreRepository.shared.reanudarActividad(activityId: activityId)
        }
    }

    private func accion(_ activityId: Int, fallback: String, call: () async throws -> Void) async -> Bool {
        guard accionEnCurso == nil else { return false }
        accionEnCurso = activityId
        accionError = nil
        defer { accionEnCurso = nil }
        do {
            try await call()
            await load(enabled: true)
            return true
        } catch {
            accionError = error.toUserMessage(fallback: fallback)
            return false
        }
    }
}
