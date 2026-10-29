import Foundation

/// Inicio de dirección general en el teléfono (canvas «App · Inicio CEO», 29-10): lo que ve en la
/// web, con los mismos endpoints que ya usa la app — `me/board` (equipo de hoy), `me/revisiones`
/// (por validar), `workflow/my-pending` (aprobaciones), `employee-payments` (pagos en borrador) y
/// `me/kpis/equipo` (desempeño de 7 días). Cada sección es opcional: si su endpoint falla o el rol
/// no lo ve, no se pinta.
///
/// Espejo de `InicioCeoRules.kt` de Android (y de su prueba, `InicioCeoRulesTest`, que trae los
/// textos exactos). Sin SwiftUI: lógica pura.
enum InicioCeoRules {

    // MARK: Equipo de hoy (la banda oscura)

    struct EquipoHoy: Equatable {
        /// Checaron entrada hoy (los que siguen y los que ya salieron).
        let enJornada: Int
        let total: Int
        let trabajando: Int
        /// En jornada y sin nada abierto.
        let sinActividad: Int
        let atrasadas: Int
    }

    /// nil con la pizarra vacía: la banda no se pinta.
    static func equipoHoy(_ users: [TeamBoardUser]) -> EquipoHoy? {
        guard !users.isEmpty else { return nil }
        let r = ActividadesEquipo.resumen(users)
        return EquipoHoy(
            enJornada: max(0, r.total - r.sinEntrada),
            total: r.total,
            trabajando: r.trabajando,
            sinActividad: r.sinNada,
            atrasadas: r.atrasados
        )
    }

    // MARK: «Requiere tu atención»

    static let claveRevision = "revision"
    static let claveAprobaciones = "aprobaciones"
    static let clavePagos = "pagos"

    struct Pendiente: Equatable, Identifiable {
        let clave: String
        let titulo: String
        let detalle: String
        let cuenta: Int

        var id: String { clave }
    }

    /// Solo lo que tiene algo, en orden de lo que más se acumula: evidencias, aprobaciones y
    /// pagos en borrador. Una lista nil (endpoint caído o rol que no la ve) no sale.
    static func pendientes(
        revisiones: [RevisionPendiente]?,
        aprobaciones: [AprobacionPendiente]?,
        pagos: [PagoEmpleado]?,
        ahora: Date = Date()
    ) -> [Pendiente] {
        var out: [Pendiente] = []
        if let lista = revisiones, !lista.isEmpty {
            let vieja = EnEsperaRevision.ordenar(lista).first
            let detalle = EnEsperaRevision.minutosEsperando(vieja?.enviadaAt, ahora: ahora)
                .map { "La más vieja, de \(EnEsperaRevision.textoEspera($0))" }
                ?? "Lo que tu equipo envió"
            out.append(Pendiente(clave: claveRevision, titulo: "Evidencias por validar", detalle: detalle, cuenta: lista.count))
        }
        if let lista = aprobaciones, !lista.isEmpty {
            out.append(Pendiente(
                clave: claveAprobaciones,
                titulo: "Aprobaciones",
                detalle: "Solicitudes que esperan tu firma",
                cuenta: lista.count
            ))
        }
        if let lista = pagos {
            let borradores = lista.filter { PagosRules.estadoDe($0) == .borrador }
            if !borradores.isEmpty {
                // Un importe ilegible no suma (ni se da por cero en el texto: si nada se lee, no hay cifra).
                let total = borradores.reduce(0) { $0 + (PagosRules.centavosDe($1) ?? 0) }
                let detalle = "\(borradores.count) en borrador" + (total > 0 ? " · \(Dinero.pesos(total))" : "")
                out.append(Pendiente(clave: clavePagos, titulo: "Pagos por autorizar", detalle: detalle, cuenta: borradores.count))
            }
        }
        return out
    }

    // MARK: Desempeño · 7 días

    struct Desempeno: Equatable {
        /// 0–100 para el anillo; nil si el rango no tuvo entregas que medir.
        let cumplimientoPct: Int?
        /// «Entregas a tiempo 41 de 47» · «Asistencia puntual 92 % · ocupación 78 %».
        let renglones: [String]
    }

    /// nil sin totales del equipo, o si no hay ni cumplimiento ni renglones que decir.
    static func desempeno(_ k: KpisEquipoResumen?) -> Desempeno? {
        guard let t = k?.equipo?.totales else { return nil }
        var renglones: [String] = []
        if let e = t.entregas, e.medidas > 0 {
            renglones.append("Entregas a tiempo \(e.aTiempo) de \(e.medidas)")
        }
        let puntual = entero(t.asistenciaPuntual?.pct).map { "Asistencia puntual \($0) %" }
        let ocupacion = entero(t.productividadPct).map { "ocupación \($0) %" }
        let linea = [puntual, ocupacion].compactMap { $0 }.joined(separator: " · ")
        if !linea.isEmpty {
            renglones.append(linea.prefix(1).uppercased() + linea.dropFirst())
        }
        let pct = entero(t.cumplimientoPct).map { min(100, max(0, $0)) }
        if pct == nil && renglones.isEmpty { return nil }
        return Desempeno(cumplimientoPct: pct, renglones: renglones)
    }

    /// Redondeo al entero (Kotlin `roundToInt`); nil si no hay número legible.
    private static func entero(_ valor: Double?) -> Int? {
        guard let valor, valor.isFinite else { return nil }
        return Int(min(max(valor, -1_000_000), 1_000_000).rounded())
    }

    // MARK: Rango de los KPI

    private static let zona = TimeZone(identifier: "America/Mexico_City") ?? .current

    private static var calendario: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zona
        return c
    }

    private static let isoDia: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = zona
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Los últimos 7 días, de hoy hacia atrás, en hora de México (`desde`, `hasta`).
    static func rangoSieteDias(hoy: Date = Date()) -> (desde: String, hasta: String) {
        let inicio = calendario.date(byAdding: .day, value: -6, to: hoy) ?? hoy
        return (isoDia.string(from: inicio), isoDia.string(from: hoy))
    }

    // MARK: «Para atender»

    /// Un renglón de «Para atender»: la persona, por qué y lo suyo en una línea.
    struct Atender: Equatable, Identifiable {
        let personaId: Int
        /// «Marco Silva · con retraso».
        let titulo: String
        let detalle: String?
        /// Grupo de la pizarra (`atrasados`, `sin-nada`, `sin-entrada`): el color del punto.
        let grupo: String

        var id: Int { personaId }
    }

    /// Los primeros renglones de «Para atender hoy» de la pizarra (`ActividadesEquipo.atencion`):
    /// atrasados, luego sin nada asignado y luego sin entrada, hasta `maximo`.
    static func paraAtender(_ users: [TeamBoardUser], maximo: Int = 4, ahora: Date = Date()) -> [Atender] {
        let a = ActividadesEquipo.atencion(users, ahora: ahora)
        let atrasados = a.atrasados.map { x in
            Atender(
                personaId: x.persona.id,
                titulo: "\(nombreCorto(x.persona.nombre)) · con retraso",
                detalle: enUnRenglon(x.actividad.isEmpty ? x.detalle : x.actividad),
                grupo: "atrasados"
            )
        }
        let sinNada = a.sinNada.map { x in
            Atender(
                personaId: x.persona.id,
                titulo: "\(nombreCorto(x.persona.nombre)) · sin nada asignado",
                detalle: enUnRenglon(x.jornada ?? x.ultima),
                grupo: "sin-nada"
            )
        }
        let sinEntrada = a.sinEntrada.map { x in
            Atender(
                personaId: x.persona.id,
                titulo: "\(nombreCorto(x.persona.nombre)) · sin entrada hoy",
                detalle: enUnRenglon(x.ultima),
                grupo: "sin-entrada"
            )
        }
        return Array((atrasados + sinNada + sinEntrada).prefix(max(0, maximo)))
    }

    /// Nombre y primer apellido («Marco Antonio Silva» → «Marco Antonio»), como Android.
    private static func nombreCorto(_ nombre: String) -> String {
        let partes = nombre.split(whereSeparator: { $0.isWhitespace }).prefix(2)
        return partes.isEmpty ? "Sin nombre" : partes.joined(separator: " ")
    }

    /// Los renglones de la pizarra van separados por salto de línea; aquí caben en uno.
    private static func enUnRenglon(_ texto: String) -> String? {
        let limpio = texto
            .split(separator: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        return limpio.isEmpty ? nil : limpio
    }

    // MARK: ¿Hay algo que pintar?

    /// Falso si ninguna sección tiene nada (pizarra vacía, nada pendiente y sin KPI): entonces
    /// Inicio enseña la tarjeta de la pizarra en vez de quedarse en blanco.
    static func hayAlgo(_ ceo: CeoInicio, ahora: Date = Date()) -> Bool {
        let equipo = ceo.equipo ?? []
        return equipoHoy(equipo) != nil
            || !pendientes(revisiones: ceo.revisiones, aprobaciones: ceo.aprobaciones, pagos: ceo.pagos, ahora: ahora).isEmpty
            || desempeno(ceo.kpis) != nil
    }
}
