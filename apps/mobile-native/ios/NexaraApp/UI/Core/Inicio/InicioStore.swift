import Foundation

/// Lo que ve dirección general en su inicio (Android `CeoInicio`). Cada lista es nil si su
/// endpoint falló o el rol no la ve: esa sección no se pinta y las demás siguen.
struct CeoInicio {
    var equipo: [TeamBoardUser]?
    var revisiones: [RevisionPendiente]?
    var aprobaciones: [AprobacionPendiente]?
    var pagos: [PagoEmpleado]?
    var kpis: KpisEquipoResumen?
}

/// Lo de actividades de Inicio (`GET me/activities`). Vive en el shell para que
/// la pestaña Actividades tenga su insignia sin pedir la lista dos veces. La
/// jornada la lleva `AttendanceVM` (misma checada con foto y GPS que Asistencias).
@MainActor
final class InicioStore: ObservableObject {
    @Published private(set) var data: MyActivitiesResponse?
    /// Cuándo llegó `data`. `minutosReales` viene calculado a esa hora: el reloj de la banda
    /// de «Mi día» le suma lo que pasó desde entonces (Android `remember(a)` en `ActualCard`).
    @Published private(set) var cargadoEn = Date()
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
            let respuesta = try await CoreRepository.shared.myActivities()
            cargadoEn = Date()
            data = respuesta
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

    // MARK: Dirección general (Android `cargarCeo`)

    /// Dirección general: su tablero (`InicioCeoRules`); nil hasta la primera carga.
    @Published private(set) var ceo: CeoInicio?
    /// Primera carga del tablero en curso (sin nada que enseñar todavía).
    @Published private(set) var ceoCargando = true
    /// Fallaron todas las consultas: el aviso con «Reintentar» y la tarjeta de la pizarra.
    @Published private(set) var ceoError: String?
    /// Última carga del tablero: los avisos en vivo no lo vuelven a pedir antes de 30 s.
    private var ceoCargadoEn: Date?

    /// El tablero de dirección: cinco consultas a la vez, cada una por su lado (si una falla,
    /// su sección no se pinta). `enVivo` = lo pidió un aviso en vivo, no la persona: se espacia.
    func cargarCeo(enVivo: Bool = false) async {
        let ahora = Date()
        if enVivo, ceo != nil, let previa = ceoCargadoEn, ahora.timeIntervalSince(previa) < 30 { return }
        ceoCargadoEn = ahora
        if ceo == nil { ceoCargando = true }
        let rango = InicioCeoRules.rangoSieteDias(hoy: ahora)
        async let tablero = try? await CoreRepository.shared.teamBoard()
        async let porValidar = try? await CoreRepository.shared.revisionesPendientes()
        async let firmas = try? await AprobacionesRepository.shared.pendientes()
        async let nomina = try? await PagosEmpleadosRepository.shared.lista()
        async let kpis = try? await CoreExtrasRepository.shared.kpisEquipo(desde: rango.desde, hasta: rango.hasta)
        let equipo = await tablero
        let revisiones = await porValidar
        let aprobaciones = await firmas
        let pagos = await nomina
        let desempeno = await kpis
        let nuevo = CeoInicio(
            equipo: equipo?.users,
            revisiones: revisiones,
            aprobaciones: aprobaciones,
            pagos: pagos,
            kpis: desempeno
        )
        // Como Android: sin pizarra, revisiones, aprobaciones ni KPI no hay tablero que enseñar.
        let nada = nuevo.equipo == nil && nuevo.revisiones == nil && nuevo.aprobaciones == nil && nuevo.kpis == nil
        ceo = nuevo
        ceoError = nada ? "No se pudo cargar el tablero de hoy" : nil
        ceoCargando = false
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
