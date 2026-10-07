import Foundation

// Notificaciones, viáticos, KPIs, proyectos, almacén, vehículos, clientes,
// perfil y datos sueltos de la sesión de la demostración.

struct DemoNoticeSeed {
    let id: Int
    let type: String
    let category: String
    let title: String
    let message: String
    let ago: Int
    let unread: Bool
    let trigger: Int?
    let url: String
    let entityType: String
    let entityId: Int
    let high: Bool
}

struct DemoKpiSeed {
    let id: Int
    let late: Int
    let lateMinutes: Int
    let missing: Int
    let productivity: Double
    let uniform: Double
    let extra: Int
    /// Entregas de una semana de 5 días (07-10): a tiempo, tarde y vencidas sin entregar.
    var aTiempo = 0
    var tarde = 0
    var sinEntregar = 0
    /// De lo entregado y revisado: aprobadas a la primera y devueltas.
    var aLaPrimera = 0
    var devueltas = 0
    /// Entregadas que pasaron su tiempo máximo («Tiempo adecuado»).
    var fueraDeTiempo = 0
}

/// Los números de una persona (o del equipo entero) en el rango, ya escalados a sus días.
struct DemoKpiCuenta {
    var dias = 0
    var withWork = 0
    var missing = 0
    var late = 0
    var lateMinutes = 0
    var extra = 0
    var worked = 0
    var productive = 0
    var reviewed = 0
    var okCount = 0
    var aTiempo = 0
    var tarde = 0
    var sinEntregar = 0
    var aLaPrimera = 0
    var devueltas = 0
    var enTiempoAdecuado = 0

    var medidas: Int { aTiempo + tarde + sinEntregar }
    var entregadas: Int { aTiempo + tarde }
    var revisadas: Int { aLaPrimera + devueltas }
    /// Días laborables en que entró a tiempo (un día sin checar cuenta como no).
    var puntuales: Int { max(0, withWork - late) }

    mutating func suma(_ o: DemoKpiCuenta) {
        dias += o.dias
        withWork += o.withWork
        missing += o.missing
        late += o.late
        lateMinutes += o.lateMinutes
        extra += o.extra
        worked += o.worked
        productive += o.productive
        reviewed += o.reviewed
        okCount += o.okCount
        aTiempo += o.aTiempo
        tarde += o.tarde
        sinEntregar += o.sinEntregar
        aLaPrimera += o.aLaPrimera
        devueltas += o.devueltas
        enTiempoAdecuado += o.enTiempoAdecuado
    }
}

extension DemoStore {
    // MARK: Notificaciones

    static let notices: [DemoNoticeSeed] = [
        DemoNoticeSeed(id: 9101, type: "EVIDENCE_SUBMITTED", category: "evidence",
                       title: "Fernanda envió evidencias para revisar",
                       message: "Soporte remoto de red · Parque Industrial San José está lista para aprobarse.",
                       ago: 40, unread: true, trigger: 103, url: "/erp/actividades/5144/evidencias",
                       entityType: "activity", entityId: 5144, high: false),
        DemoNoticeSeed(id: 9102, type: "SLA_ALERT", category: "sla-alert",
                       title: "Javier va atrasado",
                       message: "Cableado estructurado · Bodega Norte pasó su hora máxima hace 45 min.",
                       ago: 45, unread: true, trigger: 104, url: "/erp/actividades/5145",
                       entityType: "activity", entityId: 5145, high: true),
        DemoNoticeSeed(id: 9103, type: "EVIDENCE_SUBMITTED", category: "evidence",
                       title: "Paola envió evidencias para revisar",
                       message: "Alta de expediente · Colegio Montebello está lista para aprobarse.",
                       ago: 75, unread: true, trigger: 107, url: "/erp/actividades/5147/evidencias",
                       entityType: "activity", entityId: 5147, high: false),
        DemoNoticeSeed(id: 9104, type: "ATTENDANCE_CHECKIN", category: "attendance",
                       title: "Sofía entró a trabajar",
                       message: "Checó entrada con foto y ubicación.",
                       ago: 150, unread: true, trigger: 105, url: "/erp/asistencias",
                       entityType: "attendance", entityId: 0, high: false),
        DemoNoticeSeed(id: 9105, type: "ACTIVITY_STARTED", category: "activities",
                       title: "Diego inició una actividad",
                       message: "Mantenimiento preventivo de clima · Hotel Casa Azul.",
                       ago: 95, unread: false, trigger: 102, url: "/erp/actividades/5143",
                       entityType: "activity", entityId: 5143, high: false),
        DemoNoticeSeed(id: 9106, type: "LUNCH_CHECKOUT", category: "lunch_break",
                       title: "Javier regresó de comer a destiempo",
                       message: "Falta tu aprobación de la hora de comida.",
                       ago: 25, unread: true, trigger: 104, url: "/erp/asistencias?tab=comidas",
                       entityType: "lunch_break", entityId: 0, high: false),
        DemoNoticeSeed(id: 9107, type: "CHAT_MENTION", category: "chat",
                       title: "Mariana te mencionó en #operaciones",
                       message: "Listo, ya quedó el tablero del acceso principal. Van 5 de 8 circuitos.",
                       ago: 6, unread: true, trigger: 101, url: "",
                       entityType: "chat_channel", entityId: 201, high: false),
        DemoNoticeSeed(id: 9108, type: "BIRTHDAY", category: "celebraciones",
                       title: "Hoy es cumpleaños de Ricardo",
                       message: "Mándale una felicitación.",
                       ago: 300, unread: false, trigger: 106, url: "/erp/pizarra",
                       entityType: "", entityId: 0, high: false),
        DemoNoticeSeed(id: 9109, type: "USER_ACTION_CONFIRMED", category: "profile",
                       title: "Nuevo inicio de sesión en iPhone",
                       message: "Iniciaste sesión desde iPhone · app NEXARA. Si no fuiste tú, cambia tu contraseña.",
                       ago: 400, unread: false, trigger: nil, url: "/erp/my-profile",
                       entityType: "", entityId: 0, high: false),
    ]

    func noticeJSON(_ n: DemoNoticeSeed) -> DemoJSON {
        let read = !n.unread || notifRead.contains(n.id)
        var json = dj([
            "id": n.id,
            "userId": DemoMode.meId,
            "type": n.type,
            "category": n.category,
            "title": n.title,
            "message": n.message,
            "priority": n.high ? "high" : "normal",
            "isRead": read,
            "companyId": 1,
            "createdAt": iso(-n.ago),
        ])
        if read { json["readAt"] = iso(-max(1, n.ago - 5)) }
        if !n.url.isEmpty { json["relatedUrl"] = n.url }
        if !n.entityType.isEmpty { json["entityType"] = n.entityType }
        if n.entityId > 0 { json["relatedEntityId"] = n.entityId }
        if let trigger = n.trigger {
            json["triggerUserId"] = trigger
            json["triggerUser"] = authorJSON(trigger)
        }
        return json
    }

    func visibleNotices() -> [DemoNoticeSeed] {
        DemoStore.notices.filter { !notifRemoved.contains($0.id) }
    }

    func fxNotifications() -> [DemoJSON] {
        visibleNotices().map { noticeJSON($0) }
    }

    func fxUnreadCount() -> DemoJSON {
        let unread = visibleNotices().filter { $0.unread && !notifRead.contains($0.id) }.count
        return dj(["unreadCount": unread])
    }

    func fxActivityFeed() -> DemoJSON {
        dj([
            "items": [
                dj(["title": "Fernanda envió evidencias", "subtitle": "AN-0144 · Soporte remoto de red"]),
                dj(["title": "Javier superó su hora máxima", "subtitle": "AN-0145 · Cableado estructurado"]),
                dj(["title": "Diego inició una actividad", "subtitle": "AN-0143 · Mantenimiento de clima"]),
                dj(["title": "Mariana avanzó en su actividad", "subtitle": "AN-0142 · Tablero eléctrico"]),
            ],
        ])
    }

    // MARK: Viáticos

    func liquidacionJSON(entregado: Double, comprobado: Double?) -> DemoJSON {
        var json = dj(["entregado": entregado])
        guard let comprobado else {
            json["estado"] = "SIN_COMPROBAR"
            return json
        }
        let saldo = ((entregado - comprobado) * 100).rounded() / 100
        json["comprobado"] = comprobado
        json["saldo"] = saldo
        if saldo == 0 {
            json["estado"] = "CUADRADO"
        } else if saldo > 0 {
            json["estado"] = "POR_DEVOLVER"
        } else {
            json["estado"] = "POR_REEMBOLSAR"
        }
        return json
    }

    func activityRef(_ id: Int) -> DemoJSON? {
        guard let a = DemoData.activity(id) else { return nil }
        return dj(["id": a.id, "anNumber": a.folio, "titulo": a.titulo])
    }

    func makeViatico(
        id: Int,
        userId: Int,
        estatus: String,
        categoria: String,
        motivo: String,
        solicitado: Double,
        aprobado: Double?,
        comprobado: Double?,
        daysAgo: Int,
        actividadId: Int?
    ) -> DemoJSON {
        let person = DemoData.person(userId)
        var json = dj([
            "id": id,
            "usuarioId": userId,
            "estatus": estatus,
            "categoria": categoria,
            "motivo": motivo,
            "montoSolicitado": solicitado,
            "fechaSolicitud": iso(-daysAgo * 1440),
            "usuario": dj(["id": person.id, "nombre": person.nombre]),
            "repartos": [DemoJSON](),
            "_ticket": true,
        ])
        if let aprobado { json["montoAprobado"] = aprobado }
        if let comprobado {
            json["montoComprobado"] = comprobado
            json["fechaComprobacion"] = iso(-max(0, daysAgo - 1) * 1440)
        }
        if let actividadId {
            json["actividadId"] = actividadId
            if let ref = activityRef(actividadId) { json["actividad"] = ref }
        }
        if estatus == "Aprobado" || estatus == "Pagado" {
            json["liquidacion"] = liquidacionJSON(entregado: aprobado ?? solicitado, comprobado: comprobado)
        }
        if estatus == "Pagado" { json["contabilidadRef"] = "POL-2026-0412" }
        return json
    }

    /// Viáticos del guion: tres míos y tres del equipo (dos por autorizar).
    func seedViaticos() -> [DemoJSON] {
        [
            makeViatico(id: 9001, userId: 1, estatus: "Aprobado", categoria: "COMBUSTIBLE",
                        motivo: "Gasolina · visitas de supervisión", solicitado: 850, aprobado: 850,
                        comprobado: nil, daysAgo: 1, actividadId: 5150),
            makeViatico(id: 9002, userId: 1, estatus: "Pagado", categoria: "CASETA",
                        motivo: "Casetas Puebla–CDMX · junta con cliente", solicitado: 620, aprobado: 620,
                        comprobado: 590, daysAgo: 5, actividadId: nil),
            makeViatico(id: 9003, userId: 1, estatus: "Pendiente", categoria: "ALIMENTACION",
                        motivo: "Comida con cliente · Hotel Casa Azul", solicitado: 480, aprobado: nil,
                        comprobado: nil, daysAgo: 0, actividadId: 5151),
            makeViatico(id: 9004, userId: 104, estatus: "Pendiente", categoria: "HOSPEDAJE",
                        motivo: "Hospedaje 2 noches · obra Tehuacán", solicitado: 1800, aprobado: nil,
                        comprobado: nil, daysAgo: 0, actividadId: 5145),
            makeViatico(id: 9005, userId: 102, estatus: "Pendiente", categoria: "COMBUSTIBLE",
                        motivo: "Gasolina · mantenimiento del hotel", solicitado: 520, aprobado: nil,
                        comprobado: nil, daysAgo: 1, actividadId: 5143),
            makeViatico(id: 9006, userId: 101, estatus: "Aprobado", categoria: "TRANSPORTE",
                        motivo: "Traslado de material · Atlixco", solicitado: 950, aprobado: 900,
                        comprobado: 900, daysAgo: 2, actividadId: 5142),
        ]
    }

    func fxViaticos() -> [DemoJSON] { viaticos }

    func fxViatico(_ id: Int) -> DemoJSON {
        guard var json = viaticos.first(where: { ($0["id"] as? Int) == id }) else { return [:] }
        if (json["_ticket"] as? Bool) == true { json["ticketEvidenciaUrl"] = DemoImages.dataURL(.ticket) }
        // El detalle trae el nombre de cada actividad del reparto.
        if var repartos = json["repartos"] as? [DemoJSON] {
            for index in repartos.indices {
                if let activityId = repartos[index]["actividadId"] as? Int, let ref = activityRef(activityId) {
                    repartos[index]["actividad"] = ref
                }
            }
            json["repartos"] = repartos
        }
        return json
    }

    /// Cambia un viático en su sitio. Devuelve `false` si no existe.
    @discardableResult
    func updateViatico(_ id: Int, _ change: (inout DemoJSON) -> Void) -> Bool {
        guard let index = viaticos.firstIndex(where: { ($0["id"] as? Int) == id }) else { return false }
        var json = viaticos[index]
        change(&json)
        viaticos[index] = json
        return true
    }

    // MARK: KPIs del equipo

    /// Una semana de 5 días por persona. Quien más cumple en tiempo y forma son Luis
    /// Fernando y Sofía (todo a tiempo, nada devuelto) aunque su «tiempo en actividades»
    /// no sea el más alto; Javier se va al fondo con entregas tarde y sin entregar, y
    /// Andrea (almacén) no tuvo entregas que medir: sin cumplimiento, al final.
    static let kpiSeeds: [DemoKpiSeed] = [
        DemoKpiSeed(id: 101, late: 1, lateMinutes: 12, missing: 0, productivity: 91, uniform: 100, extra: 120,
                    aTiempo: 11, tarde: 1, sinEntregar: 0, aLaPrimera: 10, devueltas: 1, fueraDeTiempo: 1),
        DemoKpiSeed(id: 102, late: 0, lateMinutes: 0, missing: 0, productivity: 88, uniform: 100, extra: 60,
                    aTiempo: 9, tarde: 1, sinEntregar: 0, aLaPrimera: 8, devueltas: 1, fueraDeTiempo: 1),
        DemoKpiSeed(id: 103, late: 2, lateMinutes: 25, missing: 0, productivity: 84, uniform: 95, extra: 0,
                    aTiempo: 6, tarde: 1, sinEntregar: 1, aLaPrimera: 6, devueltas: 1, fueraDeTiempo: 2),
        DemoKpiSeed(id: 104, late: 4, lateMinutes: 62, missing: 1, productivity: 66, uniform: 80, extra: 0,
                    aTiempo: 5, tarde: 2, sinEntregar: 2, aLaPrimera: 4, devueltas: 3, fueraDeTiempo: 3),
        DemoKpiSeed(id: 105, late: 0, lateMinutes: 0, missing: 0, productivity: 82, uniform: 100, extra: 30,
                    aTiempo: 11, tarde: 0, sinEntregar: 0, aLaPrimera: 10, devueltas: 0, fueraDeTiempo: 0),
        DemoKpiSeed(id: 106, late: 3, lateMinutes: 41, missing: 0, productivity: 79, uniform: 90, extra: 0,
                    aTiempo: 5, tarde: 2, sinEntregar: 0, aLaPrimera: 5, devueltas: 2, fueraDeTiempo: 2),
        DemoKpiSeed(id: 107, late: 0, lateMinutes: 0, missing: 0, productivity: 95, uniform: 100, extra: 0,
                    aTiempo: 6, tarde: 0, sinEntregar: 1, aLaPrimera: 5, devueltas: 0, fueraDeTiempo: 1),
        DemoKpiSeed(id: 108, late: 0, lateMinutes: 0, missing: 0, productivity: 76, uniform: 100, extra: 90,
                    aTiempo: 14, tarde: 0, sinEntregar: 0, aLaPrimera: 13, devueltas: 0, fueraDeTiempo: 0),
        DemoKpiSeed(id: 109, late: 0, lateMinutes: 0, missing: 0, productivity: 90, uniform: 100, extra: 0),
    ]

    /// «Cómo se calculan estos números», en las palabras del API (`supuestosKpi`).
    static let kpiSupuestos: [String] = [
        "Cumplimiento (en tiempo y forma): promedio ponderado de sus partes; cada parte dice cuánto pesa. "
            + "Lo que no tiene dato no pesa; sin ninguna entrega en las fechas no se califica.",
        "Entrega a tiempo: la persona la entregó antes de su límite. Se mide con la hora en que ENTREGÓ, "
            + "no con la hora en que el jefe la aprobó.",
        "Sin entregar: su límite cayó en estas fechas, ya pasó y no la ha entregado.",
        "Aprobada a la primera: la primera revisión de su evidencia fue «aprobada»; si se la devolvieron, "
            + "no cuenta aunque luego se aprobara.",
        "Asistencia puntual: días laborables en que entró a tiempo, de los que debía checar.",
        "Tiempo en actividades (antes «productividad»): tiempo con el reloj de una actividad corriendo, "
            + "dentro de las horas laboradas. Informa cuánto se usó el reloj; no califica.",
        "Retardo: entrada después de su hora (10:00; la salida normal es a las 18:00) más los minutos de "
            + "gracia, de lunes a viernes.",
        "Semáforo: el peor de entregas a tiempo, aprobadas a la primera, retardos, uniforme y días sin checada.",
    ]

    /// Pesos de las partes del cumplimiento en el demo. El API manda los suyos con cada
    /// parte; la app no los conoce de antemano (pinta la lista que llegue).
    static let kpiPesos: [String: Int] = [
        "entregas": 20, "forma": 10, "tiempo": 15, "ritmo": 20,
        "carga": 10, "ocupacion": 10, "asistencia": 10, "uniforme": 5,
    ]

    /// La semilla es de una semana de 5 días: se escala a los días del rango y nunca hay
    /// más faltas, retardos ni devoluciones que días o entregas (con «Semana» un lunes solo
    /// hay uno). Jornada 10:00–18:00 y una hora de comida; con lo que cada quien se queda
    /// de más, ~450 min netos al día.
    func kpiCuenta(_ seed: DemoKpiSeed, workdays: Int) -> DemoKpiCuenta {
        let dias = max(1, workdays)
        func escala(_ valor: Int) -> Int { Int((Double(valor) * Double(dias) / 5).rounded()) }
        var c = DemoKpiCuenta()
        c.dias = dias
        c.missing = min(escala(seed.missing), dias)
        c.withWork = max(0, dias - c.missing)
        c.late = min(escala(seed.late), c.withWork)
        c.lateMinutes = seed.late > 0 ? seed.lateMinutes * c.late / seed.late : 0
        c.extra = escala(seed.extra)
        c.worked = c.withWork * 450
        c.productive = Int(Double(c.worked) * seed.productivity / 100)
        c.reviewed = c.withWork
        c.okCount = min(c.reviewed, Int((Double(c.reviewed) * seed.uniform / 100).rounded()))
        c.aTiempo = escala(seed.aTiempo)
        c.tarde = escala(seed.tarde)
        c.sinEntregar = escala(seed.sinEntregar)
        c.devueltas = min(escala(seed.devueltas), c.entregadas)
        c.aLaPrimera = min(escala(seed.aLaPrimera), c.entregadas - c.devueltas)
        c.enTiempoAdecuado = max(0, c.entregadas - min(escala(seed.fueraDeTiempo), c.entregadas))
        return c
    }

    /// `num ÷ den` en % redondeado; nil sin denominador.
    private func kpiPct(_ num: Int, _ den: Int) -> Int? {
        den > 0 ? Int((Double(num) * 100 / Double(den)).rounded()) : nil
    }

    private func kpiNulo(_ valor: Int?) -> Any {
        if let valor { return valor }
        return NSNull()
    }

    /// «29 h 10 min» · «45 min».
    private func kpiHoras(_ minutos: Int) -> String {
        let h = minutos / 60
        let m = minutos % 60
        if h == 0 { return "\(m) min" }
        return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }

    /// Ritmo de referencia del equipo, como el API: las entregas por día de quien va en el
    /// percentil 75 (entre quienes trabajaron y entregaron algo).
    func kpiReferenciaRitmo(_ cuentas: [DemoKpiCuenta]) -> Double? {
        let ritmos = cuentas
            .filter { $0.withWork > 0 && $0.entregadas > 0 }
            .map { Double($0.entregadas) / Double($0.withWork) }
            .sorted()
        guard !ritmos.isEmpty else { return nil }
        let i = min(ritmos.count - 1, Int((Double(ritmos.count - 1) * 0.75).rounded()))
        return (ritmos[i] * 10).rounded() / 10
    }

    /// Las partes del cumplimiento y su promedio ponderado, como el API: lo que no tiene
    /// dato no pesa y sin ninguna entrega que medir no hay cumplimiento (nulo).
    func kpiCumplimiento(_ c: DemoKpiCuenta, referenciaRitmo: Double?) -> (pct: Int?, partes: [DemoJSON]) {
        var partes: [(clave: String, etiqueta: String, razon: Double, detalle: String)] = []
        func agrega(_ clave: String, _ etiqueta: String, _ razon: Double, _ detalle: String) {
            partes.append((clave, etiqueta, min(1, max(0, razon)), detalle))
        }
        func parte(_ clave: String, _ etiqueta: String, _ num: Int, _ den: Int, _ detalle: String) {
            if den > 0 { agrega(clave, etiqueta, Double(num) / Double(den), detalle) }
        }
        parte("entregas", "Entregas a tiempo", c.aTiempo, c.medidas, "\(c.aTiempo) de \(c.medidas)")
        parte("forma", "Aprobadas a la primera", c.aLaPrimera, c.revisadas, "\(c.aLaPrimera) de \(c.revisadas)")
        parte("tiempo", "Tiempo adecuado", c.enTiempoAdecuado, c.entregadas,
              "\(c.enTiempoAdecuado) de \(c.entregadas) sin pasar su tiempo máximo")
        if let ref = referenciaRitmo, ref > 0, c.withWork > 0 {
            let porDia = Double(c.entregadas) / Double(c.withWork)
            agrega("ritmo", "Ritmo de entregas", porDia / ref,
                   "\(String(format: "%.1f", porDia)) por día · el equipo va a \(String(format: "%.1f", ref))")
        }
        if c.worked > 0 {
            let carga = Int(Double(c.productive) * 0.92)
            let pctCarga = kpiPct(carga, c.worked) ?? 0
            agrega("carga", "Carga de trabajo", Double(carga) / Double(c.worked) / 0.70,
                   "\(kpiHoras(carga)) de trabajo entregado en \(kpiHoras(c.worked)) (\(pctCarga) %; meta 70 %)")
            let ocupado = min(c.worked, Int(Double(c.productive) * 1.08))
            let pctOcupado = kpiPct(ocupado, c.worked) ?? 0
            agrega("ocupacion", "Siempre con algo", Double(ocupado) / Double(c.worked) / 0.85,
                   "\(kpiHoras(ocupado)) con una actividad de \(kpiHoras(c.worked)) (\(pctOcupado) %; meta 85 %)")
        }
        parte("asistencia", "Asistencia puntual", c.puntuales, c.dias,
              "\(c.puntuales) de \(c.dias) \(c.dias == 1 ? "día" : "días")")
        parte("uniforme", "Uniforme", c.okCount, c.reviewed, "\(c.okCount) de \(c.reviewed)")

        let pesoDe = { (clave: String) -> Int in DemoStore.kpiPesos[clave] ?? 0 }
        let pesoTotal = partes.reduce(0) { $0 + pesoDe($1.clave) }
        var pct: Int?
        if c.medidas > 0 && pesoTotal > 0 {
            let suma = partes.reduce(0.0) { $0 + $1.razon * Double(pesoDe($1.clave)) }
            pct = Int((suma / Double(pesoTotal) * 100).rounded())
        }
        let json = partes.map { p in
            dj([
                "clave": p.clave,
                "etiqueta": p.etiqueta,
                "pct": Int((p.razon * 100).rounded()),
                "peso": pesoDe(p.clave),
                "detalle": p.detalle,
            ])
        }
        return (pct, json)
    }

    /// Semáforo del API: el peor de entregas a tiempo, aprobadas a la primera, retardos,
    /// uniforme y días sin checar (el tiempo en actividades ya no lo pinta).
    func kpiSemaforo(_ c: DemoKpiCuenta) -> (semaforo: String, motivos: [String]) {
        let peso = ["sin_datos": 0, "verde": 1, "amarillo": 2, "rojo": 3]
        var peor = "sin_datos"
        var motivos: [(nivel: String, texto: String)] = []
        func marca(_ nivel: String, _ texto: String) {
            if (peso[nivel] ?? 0) > (peso[peor] ?? 0) { peor = nivel }
            if nivel != "verde" { motivos.append((nivel, texto)) }
        }
        func corte(_ pct: Int, verde: Int, amarillo: Int) -> String {
            pct >= verde ? "verde" : (pct >= amarillo ? "amarillo" : "rojo")
        }
        if let p = kpiPct(c.aTiempo, c.medidas) {
            let fuera = [c.tarde > 0 ? "\(c.tarde) tarde" : "", c.sinEntregar > 0 ? "\(c.sinEntregar) sin entregar" : ""]
                .filter { !$0.isEmpty }
                .joined(separator: ", ")
            marca(corte(p, verde: 90, amarillo: 75),
                  "\(c.aTiempo) de \(c.medidas) entregas a tiempo\(fuera.isEmpty ? "" : " (\(fuera))")")
        }
        if let p = kpiPct(c.aLaPrimera, c.revisadas) {
            marca(corte(p, verde: 90, amarillo: 75),
                  "\(c.devueltas) \(c.devueltas == 1 ? "entrega devuelta" : "entregas devueltas") de \(c.revisadas) revisadas")
        }
        if c.withWork > 0 {
            let r = c.late
            marca(r >= 3 ? "rojo" : (r >= 1 ? "amarillo" : "verde"),
                  "\(r) retardo\(r == 1 ? "" : "s") (\(c.lateMinutes) min tarde)")
        }
        if let p = kpiPct(c.okCount, c.reviewed) {
            marca(corte(p, verde: 95, amarillo: 80), "Uniforme \(p) %")
        }
        if c.missing > 0 {
            let f = c.missing
            marca(f >= 2 ? "rojo" : "amarillo", "\(f) día\(f == 1 ? "" : "s") sin checada")
        }
        let ordenados = motivos.sorted { (peso[$0.nivel] ?? 0) > (peso[$1.nivel] ?? 0) }.map { $0.texto }
        return (peor, ordenados)
    }

    func kpiTotalesJSON(_ c: DemoKpiCuenta, referenciaRitmo: Double?) -> DemoJSON {
        let cumplimiento = kpiCumplimiento(c, referenciaRitmo: referenciaRitmo)
        return dj([
            "diasConJornada": c.withWork,
            "diasSinChecada": c.missing,
            "faltasJustificadas": 0,
            "retardos": c.late,
            "minutosTarde": c.lateMinutes,
            "uniforme": dj([
                "revisadas": c.reviewed,
                "ok": c.okCount,
                "noOk": c.reviewed - c.okCount,
                "sinRevisar": 0,
                "pct": kpiNulo(kpiPct(c.okCount, c.reviewed)),
            ]),
            "minutosLaborados": c.worked,
            "minutosProductivos": c.productive,
            "minutosInactivos": c.worked - c.productive,
            "productividadPct": kpiNulo(kpiPct(c.productive, c.worked)),
            "minutosExtra": c.extra,
            "minutosExtraAprobados": c.extra / 2,
            "minutosExtraPendientes": c.extra - c.extra / 2,
            "diasExtraPendientes": c.extra > 0 ? 1 : 0,
            "jornadasAbiertas": 0,
            "jornadasSinSalida": 0,
            "cierresAutomaticos": 0,
            // 07-10: el «en tiempo y forma».
            "entregas": dj([
                "medidas": c.medidas,
                "aTiempo": c.aTiempo,
                "tarde": c.tarde,
                "sinEntregar": c.sinEntregar,
                "revisadas": c.revisadas,
                "aprobadasALaPrimera": c.aLaPrimera,
                "devueltas": c.devueltas,
                "pctATiempo": kpiNulo(kpiPct(c.aTiempo, c.medidas)),
                "pctALaPrimera": kpiNulo(kpiPct(c.aLaPrimera, c.revisadas)),
            ]),
            "asistenciaPuntual": dj([
                "esperados": c.dias,
                "puntuales": c.puntuales,
                "pct": kpiNulo(kpiPct(c.puntuales, c.dias)),
            ]),
            "cumplimientoPct": kpiNulo(cumplimiento.pct),
            "cumplimientoPartes": cumplimiento.partes,
        ])
    }

    func fxKpis(desde: String, hasta: String) -> DemoJSON {
        let days = DemoClock.daysBetween(desde, hasta)
        let workdays = max(1, days * 5 / 7)
        // Primero las cuentas de todos: el ritmo de cada quien se mide contra el del equipo.
        let cuentas = DemoStore.kpiSeeds.map { (seed: $0, cuenta: kpiCuenta($0, workdays: workdays)) }
        let referencia = kpiReferenciaRitmo(cuentas.map { $0.cuenta })
        var equipo = DemoKpiCuenta()
        var people: [DemoJSON] = []
        for item in cuentas {
            let p = DemoData.person(item.seed.id)
            equipo.suma(item.cuenta)
            let semaforo = kpiSemaforo(item.cuenta)
            people.append(dj([
                "persona": dj(["id": p.id, "nombre": p.nombre, "email": p.email, "puesto": p.puesto]),
                "horario": dj(["etiqueta": "Lun–Vie · 10:00 a 18:00", "entrada": "10:00", "salida": "18:00"]),
                "totales": kpiTotalesJSON(item.cuenta, referenciaRitmo: referencia),
                "semaforo": semaforo.semaforo,
                "motivos": semaforo.motivos,
            ]))
        }
        let semaforoEquipo = kpiSemaforo(equipo)
        return dj([
            "scope": "company",
            "desde": desde,
            "hasta": hasta,
            "supuestos": DemoStore.kpiSupuestos,
            "equipo": dj([
                "totales": kpiTotalesJSON(equipo, referenciaRitmo: referencia),
                "semaforo": semaforoEquipo.semaforo,
                "motivos": semaforoEquipo.motivos,
            ]),
            "personas": people,
        ])
    }

    // MARK: Proyectos

    func projectRow(
        id: Int,
        title: String,
        clientId: Int,
        responsible: Int,
        team: Int,
        health: String,
        label: String,
        late: Int,
        remaining: Int?,
        reason: String,
        total: Int,
        closed: Int,
        milestone: String?
    ) -> DemoJSON {
        let client = DemoData.client(serviceId: clientId)
        let person = DemoData.person(responsible)
        let percent = total == 0 ? 0 : closed * 100 / total
        var resumen = dj([
            "salud": health,
            "etiqueta": label,
            "enRiesgo": health == "RETRASADO" || health == "EN_RIESGO",
            "diasDeRetraso": late,
            "motivo": reason,
            "avance": dj([
                "total": total,
                "cerradas": closed,
                "abiertas": total - closed,
                "porcentaje": percent,
                "origen": "actividades",
            ]),
            "requerimientos": dj(["total": 6, "cumplidos": max(0, min(6, closed / 2))]),
        ])
        if let remaining { resumen["diasRestantes"] = remaining }
        var json = dj([
            "id": id,
            "title": title,
            "client": dj(["id": clientId, "name": client?.name ?? "Cliente"]),
            "responsable": dj(["id": person.id, "nombre": person.nombre]),
            "equipoCount": team,
            "resumen": resumen,
        ])
        if let milestone {
            json["proximoHito"] = dj([
                "id": id * 10,
                "name": milestone,
                "plannedDate": DemoClock.day(epoch.addingTimeInterval(TimeInterval(remaining ?? 10) * 86400 / 3)),
            ])
        }
        return json
    }

    func fxProyectos() -> [DemoJSON] {
        [
            projectRow(id: 7001, title: "Modernización eléctrica · Torre A", clientId: 4101, responsible: 101, team: 5,
                       health: "EN_TIEMPO", label: "En tiempo", late: 0, remaining: 42, reason: "",
                       total: 12, closed: 8, milestone: "Energizar tablero principal"),
            projectRow(id: 7002, title: "Remodelación del lobby", clientId: 4102, responsible: 102, team: 4,
                       health: "EN_RIESGO", label: "En riesgo", late: 0, remaining: 9, reason: "Falta confirmar el material de acabados.",
                       total: 10, closed: 6, milestone: "Entrega de acabados"),
            projectRow(id: 7003, title: "Ampliación de aulas · Fase 2", clientId: 4103, responsible: 105, team: 3,
                       health: "RETRASADO", label: "Retrasado", late: 6, remaining: nil, reason: "Permiso de obra pendiente con el municipio.",
                       total: 9, closed: 3, milestone: "Cimentación de aulas"),
            projectRow(id: 7004, title: "Cableado de planta textil", clientId: 4104, responsible: 108, team: 4,
                       health: "TERMINADO", label: "Terminado", late: 0, remaining: nil, reason: "",
                       total: 14, closed: 14, milestone: nil),
            projectRow(id: 7005, title: "Nave de almacenaje · Etapa 1", clientId: 4105, responsible: 101, team: 2,
                       health: "PLANEADO", label: "Planeado", late: 0, remaining: 80, reason: "",
                       total: 0, closed: 0, milestone: "Arranque de obra"),
        ]
    }

    func fxOperationalProjects() -> [DemoJSON] {
        DemoData.projects.enumerated().map { entry -> DemoJSON in
            let project = entry.element
            let client = DemoData.client(serviceId: project.clientServiceId)
            return dj([
                "id": project.id,
                "title": project.title,
                "status": project.status,
                "startDate": DemoClock.day(epoch.addingTimeInterval(-TimeInterval(30 + entry.offset * 20) * 86400)),
                "client": dj(["id": project.clientServiceId, "name": client?.name ?? "Cliente"]),
            ])
        }
    }

    // MARK: Almacén

    func stockLevelJSON(_ s: DemoStockSeed) -> DemoJSON {
        let warehouse = DemoData.warehouses.first { $0.id == s.warehouseId } ?? DemoData.warehouses[0]
        return dj([
            "id": s.id,
            // Con lo que se haya movido con el escáner en esta sesión.
            "quantity": cantidadDemo(s),
            "reservedQty": s.reserved,
            "reorderPoint": s.reorder,
            "product": dj(["id": 300 + s.id, "name": s.name, "sku": s.sku]),
            "warehouse": dj(["id": warehouse.id, "code": warehouse.code, "name": warehouse.name]),
        ])
    }

    func fxStockLevels() -> [DemoJSON] {
        DemoData.stock.map { stockLevelJSON($0) }
    }

    func fxLowStock() -> [DemoJSON] {
        // Con lo movido por el escáner, como `quantity` de `stockLevelJSON` (si no, una
        // salida que deja el producto bajo mínimo no aparecía en «Bajo mínimo»).
        DemoData.stock.filter { $0.reorder > 0 && cantidadDemo($0) <= $0.reorder }.map { stockLevelJSON($0) }
    }

    // MARK: Vehículos

    func fxVehicles() -> DemoJSON {
        var solicitudes: [DemoJSON] = [
            dj([
                "id": 88,
                "nombreVehiculo": "Nissan NP300",
                "placasVehiculo": "DEM-456-B",
                "estatusAprobacion": "Pendiente",
                "entregaEstatus": "",
                "fechaInicioSolicitada": iso(1500),
                "fechaFinSolicitada": iso(1900),
            ]),
        ]
        solicitudes.append(contentsOf: vehicleRequests)
        let disponibles: [DemoJSON] = [
            dj(["id": 12, "nombre": "Nissan NP300", "placas": "DEM-456-B", "estatus": "Disponible", "activo": true,
                "disponible": true, "odometroUltimo": 63120, "combustibleUltimoPct": 50, "tieneRastreador": true]),
            dj(["id": 13, "nombre": "Chevrolet Aveo", "placas": "DEM-789-C", "estatus": "Disponible", "activo": true,
                "disponible": true, "odometroUltimo": 41870, "combustibleUltimoPct": 75, "tieneRastreador": false]),
            dj(["id": 14, "nombre": "Toyota Hilux", "placas": "DEM-321-D", "estatus": "En uso", "activo": true,
                "disponible": false, "conductor": dj(["id": 102, "nombre": DemoData.person(102).nombre]),
                "odometroUltimo": 88240, "combustibleUltimoPct": 25, "tieneRastreador": true]),
        ]
        var json = dj(["solicitudes": solicitudes, "disponibles": disponibles])
        if vehicleAssigned {
            json["activa"] = dj([
                "id": 61,
                "origen": "solicitud",
                "vehiculo": dj(["id": 11, "nombre": "Ford Ranger", "placas": "DEM-123-A"]),
                "inicio": iso(-180),
                "fin": iso(300),
                "odometroInicio": 48210,
                "combustibleInicioPct": 75,
                "requiereSalida": false,
                "requiereDevolucion": true,
            ])
        }
        return json
    }

    // MARK: Clientes

    var allClients: [DemoClient] { DemoData.clients + extraClients }

    func clientJSON(_ c: DemoClient) -> DemoJSON {
        var sectors: [DemoJSON] = []
        for (index, sector) in c.sectors.enumerated() {
            sectors.append(dj([
                "id": c.id * 10 + index,
                "salesClientId": c.id,
                "sector": sector,
                "companyId": 1,
                "createdAt": iso(-40 * 1440),
            ]))
        }
        let slug = String(c.name.lowercased().filter { $0.isLetter })
        let phone = "222 555 0\(100 + c.id % 100)"
        var json = dj([
            "id": c.id,
            "name": c.name,
            "legalName": c.legalName,
            "taxId": c.taxId,
            "fiscalAddress": c.city,
            "fiscalZipCode": "72000",
            "fiscalRegime": "601",
            "billingEmail": "facturacion@\(slug).example",
            "billingPhone": phone,
            "status": "Activo",
            "serviceClientId": c.serviceId,
            "companyId": 1,
            "createdAt": iso(-40 * 1440),
            "updatedAt": iso(-2 * 1440),
            "sectors": sectors,
            "serviceClient": dj(["id": c.serviceId, "name": c.name, "isActive": true]),
        ])
        if let ownerId = c.ownerId {
            let owner = DemoData.person(ownerId)
            json["ownerId"] = ownerId
            json["owner"] = dj(["id": owner.id, "nombre": owner.nombre, "email": owner.email])
        }
        return json
    }

    func fxClients(sector: String?) -> [DemoJSON] {
        let wanted = (sector ?? "").uppercased()
        return allClients
            .filter { wanted.isEmpty || $0.sectors.contains(wanted) }
            .map { clientJSON($0) }
    }

    func fxClient(_ id: Int) -> DemoJSON {
        guard let client = allClients.first(where: { $0.id == id }) else { return [:] }
        return clientJSON(client)
    }

    func fxClientPermissions() -> DemoJSON {
        dj(["puedeAgregar": true, "puedeEditar": true, "puedeDesactivar": false, "puedeEliminar": false])
    }

    // MARK: Perfil y sesión

    static let defaultProfileFields: [String: String] = [
        "telefono": "222 555 0101",
        "fechaNacimiento": "1988-04-12",
        "direccion": "Av. Reforma 123",
        "colonia": "Centro",
        "ciudad": "Puebla",
        "estado": "Puebla",
        "codigoPostal": "72000",
        "pais": "México",
        "curp": "XEXX010101HNEXXXA4",
        "rfc": "XAXX010101000",
        "ineNumero": "",
        "nss": "",
        "contactoEmergenciaNombre": "Contacto de ejemplo",
        "contactoEmergenciaTelefono": "222 555 0199",
    ]

    func fxProfileMe() -> DemoJSON {
        dj([
            "nombre": DemoData.me.nombre,
            "email": DemoData.me.email,
            "employeeNumber": "E-0001",
            "role": dj(["nombre": DemoData.me.puesto]),
            "department": dj(["nombre": DemoData.me.departamento]),
            "perfil": profileFields,
        ])
    }

    func fxIdentity() -> DemoJSON {
        dj([
            "status": "linked",
            "user": dj(["employeeNumber": "E-0001", "companyEmployeeNumber": "AUR-0001"]),
            "acsPerson": dj(["personId": "A-0001", "personName": DemoData.me.corto]),
        ])
    }

    func fxAuthProfile() -> DemoJSON {
        dj([
            "id": DemoMode.meId,
            "nombre": DemoData.me.nombre,
            "email": DemoData.me.email,
            "role": DemoData.me.puesto,
            "roleKey": "ceo",
            "orgRoleKey": "ceo",
            "department": DemoData.me.departamento,
            "permissions": DemoData.permissions,
            "isSuperAdmin": true,
        ])
    }

    func fxNavigation() -> DemoJSON {
        dj([
            "roleKey": "ceo",
            "orgRoleKey": "ceo",
            "panels": ["erp"],
            "moduleKeys": DemoData.navModules,
            "webModuleIds": [String](),
        ])
    }

    func fxCompanyMine() -> [DemoJSON] {
        [dj(["id": 1, "name": "Constructora Aurora (demo)", "isPrimary": true])]
    }

    func fxCelebraciones(now: Date) -> DemoJSON {
        dj([
            "fecha": DemoClock.day(now),
            "celebraciones": [
                dj(["userId": 106, "nombre": DemoData.person(106).nombre, "tipo": "cumpleanos", "soyYo": false]),
                dj(["userId": 105, "nombre": DemoData.person(105).nombre, "tipo": "aniversario", "anios": 3, "soyYo": false]),
            ],
        ])
    }
}
