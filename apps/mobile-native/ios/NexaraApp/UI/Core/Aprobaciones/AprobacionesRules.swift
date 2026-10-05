import SwiftUI

/// Aprobaciones en el teléfono: qué dice cada pendiente antes de pedir una
/// decisión, en qué orden salen y qué cifras van arriba. Traducción de
/// `AprobacionesRules.kt` de Android (probado en `AprobacionesRulesTest.kt`).
///
/// **La regla que manda:** una aprobación se presenta con **qué es, de quién y
/// cuánto** antes de enseñar los botones. Y lo que no se sabe se dice: un
/// importe ilegible sale como «—», nunca como $0.00.
///
/// Diferencia deliberada con Android: el importe se lee además de `resumen.monto`,
/// el campo con el que `listMyPending` ya manda de cuánto es cada solicitud
/// (`apps/api/src/workflow/entity-summary.ts`, el mismo que usa la web). Android
/// solo mira `instance.amount` / `instance.total`, que el API nunca manda, y por
/// eso su celda dice siempre «—»: su propio comentario dice que «el día que el
/// backend lo mande, la cifra aparece sola», y ese día ya llegó.
enum AprobacionesRules {

    /// La zona en la que trabaja la gente; con ella se decide qué día fue un instante.
    static let zona: TimeZone = TimeZone(identifier: "America/Mexico_City") ?? .current

    /// Lo que se escribe cuando el dato no se puede leer. Nunca un cero fingido.
    static let sinDato = "—"

    // MARK: Dinero

    static func centavos(_ valor: String?) -> Int? { DineroApi.centavos(valor) }

    /// `"$12,345.67"`, o «—» si no hay cifra.
    static func pesos(_ valor: String?) -> String { centavos(valor).map { Dinero.pesos($0) } ?? sinDato }

    /// Cuánto vale la solicitud en centavos de **pesos**: `amount`, `total` y, al
    /// final, el `resumen` del API cuando su moneda es MXN. `nil` si no hay cifra.
    static func centavosDe(_ dto: AprobacionPendiente) -> Int? {
        if let instancia = dto.instance,
           let propio = centavos(instancia.amount) ?? centavos(instancia.total) {
            return propio
        }
        guard let resumen = dto.resumen, esPeso(resumen.moneda) else { return nil }
        return centavos(resumen.monto)
    }

    /// El importe listo para leer. Un resumen en dólares se enseña como tal
    /// («US$…») y no entra en la suma de pesos de la tira.
    static func importeTexto(_ dto: AprobacionPendiente) -> String {
        if let pesos = centavosDe(dto) { return Dinero.pesos(pesos) }
        if let resumen = dto.resumen, !esPeso(resumen.moneda), let c = centavos(resumen.monto) {
            let moneda = (resumen.moneda ?? "").trimmingCharacters(in: .whitespaces).uppercased()
            return moneda == "USD" ? "US" + Dinero.pesos(c) : "\(Dinero.pesos(c)) \(moneda)"
        }
        return sinDato
    }

    private static func esPeso(_ moneda: String?) -> Bool {
        let m = (moneda ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        return m.isEmpty || m == "MXN"
    }

    // MARK: Tipo de entidad

    /// Qué se está autorizando, en español (`entityApprovalHref` de la web más
    /// `buildEntityContext`). Lo desconocido se capitaliza, no se esconde.
    private static let etiquetaEntidad: [String: String] = [
        "PURCHASE_ORDER": "Orden de compra",
        "PURCHASE_REQUISITION": "Requisición",
        "REQUISITION": "Requisición",
        "EXPENSE": "Gasto",
        "VIATIC": "Viático",
        "VIATICS": "Viático",
        "QUOTE": "Cotización",
        "COTIZACION": "Cotización",
        "DISCOUNT": "Descuento",
        "HIRING": "Contratación",
        "VACATION": "Vacaciones",
        "CONTRACT": "Contrato",
        "MAINTENANCE_CONTRACT": "Contrato",
        "PROJECT": "Proyecto",
        "SALES_PROJECT": "Proyecto",
        "OPPORTUNITY": "Oportunidad",
    ]

    static func etiquetaTipo(_ tipo: String?) -> String {
        let crudo = (tipo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if crudo.isEmpty { return "Solicitud" }
        // El flujo de autorización por monto llega como `COTIZACION_MONTO` (`tipoBase` del API).
        var clave = crudo.uppercased(with: espanol)
        if clave.hasSuffix("_MONTO") { clave = String(clave.dropLast("_MONTO".count)) }
        if let conocida = etiquetaEntidad[clave] { return conocida }
        let minusculas = crudo.lowercased(with: espanol)
        return String(minusculas.prefix(1)).uppercased(with: espanol) + String(minusculas.dropFirst())
    }

    /// La persona si el paso nombra una; si no, el rol; si no, el nombre del paso.
    static func etiquetaAprobador(_ paso: WfPaso?) -> String {
        guard let paso else { return "Aprobador" }
        return noVacio(paso.approverUser?.nombre)
            ?? noVacio(paso.approverRole?.nombre)
            ?? noVacio(paso.name)
            ?? "Aprobador"
    }

    // MARK: Fechas

    private static let isoConFraccion: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoSinFraccion: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Un **instante** del API (`createdAt`). Admite `Z` y desfase explícito.
    static func instante(_ iso: String?) -> Date? {
        guard let texto = iso?.trimmingCharacters(in: .whitespacesAndNewlines),
              !texto.isEmpty, texto != "null" else { return nil }
        return isoConFraccion.date(from: texto) ?? isoSinFraccion.date(from: texto)
    }

    private static var calendario: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zona
        return c
    }

    /// Cuándo llegó: «Hoy 18:30», «Ayer 09:05», «14 sept 09:15». Siempre en la
    /// hora de México: medianoche en Greenwich es el día anterior aquí.
    static func recibidaTexto(_ iso: String?, ahora: Date = Date()) -> String {
        guard let momento = instante(iso) else { return sinDato }
        let cal = calendario
        let c = cal.dateComponents([.year, .month, .day, .hour, .minute], from: momento)
        let hora = String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
        let hoy = cal.startOfDay(for: ahora)
        let dia = cal.startOfDay(for: momento)
        if dia == hoy { return "Hoy \(hora)" }
        if let ayer = cal.date(byAdding: .day, value: -1, to: hoy), dia == ayer { return "Ayer \(hora)" }
        let mes = GastosRules.mesesCortos[max(0, min(11, (c.month ?? 1) - 1))]
        return "\(c.day ?? 0) \(mes) \(hora)"
    }

    /// Horas completas que lleva parada la solicitud. `nil` si no trae fecha.
    static func horasEsperando(_ iso: String?, ahora: Date = Date()) -> Int? {
        guard let momento = instante(iso) else { return nil }
        let horas = Int(ahora.timeIntervalSince(momento) / 3600)
        return max(horas, 0)
    }

    /// Dos días: el `timeout` más corto de `workflow-seed.service.ts` es de 48 h.
    static let horasAtrasada = 48

    static func estaAtrasada(_ horas: Int?) -> Bool { (horas ?? -1) >= horasAtrasada }

    /// «Llegó hace un momento» · «Lleva 5 h parada» · «Lleva 3 días parada».
    static func esperaTexto(_ horas: Int?) -> String {
        guard let horas else { return "Sin fecha de solicitud" }
        if horas < 1 { return "Llegó hace un momento" }
        if horas == 1 { return "Lleva 1 h parada" }
        if horas < 24 { return "Lleva \(horas) h parada" }
        if horas < 48 { return "Lleva 1 día parada" }
        return "Lleva \(horas / 24) días parada"
    }

    // MARK: Cadena de pasos

    enum EstadoPaso { case aprobado, rechazado, pendiente, enEspera }

    struct PasoCadena: Hashable {
        let numero: Int
        let nombre: String
        let aprobador: String
        let estado: EstadoPaso
        /// El paso que te toca a ti. Solo puede haber uno.
        let esElTuyo: Bool
        /// Quién lo decidió, cuando ya está decidido.
        let decidioNombre: String?
    }

    /// Quién ya firmó, dónde estás tú y quién falta. Un paso sin aprobación
    /// creada todavía está «en espera»: el servidor las crea de una en una.
    static func cadena(_ dto: AprobacionPendiente) -> [PasoCadena] {
        guard let instancia = dto.instance else { return [] }
        let pasos = (instancia.workflow?.steps ?? []).sorted { ($0.stepNumber ?? 0) < ($1.stepNumber ?? 0) }
        if pasos.isEmpty { return [] }

        var porPaso: [Int: WfAprobacion] = [:]
        for aprobacion in instancia.approvals ?? [] {
            if let stepId = aprobacion.stepId { porPaso[stepId] = aprobacion }
        }
        return pasos.enumerated().map { indice, paso in
            let aprobacion = paso.id.flatMap { porPaso[$0] }
            let estado: EstadoPaso
            switch (aprobacion?.status ?? "").trimmingCharacters(in: .whitespaces).uppercased() {
            case "APPROVED": estado = .aprobado
            case "REJECTED": estado = .rechazado
            case "PENDING": estado = .pendiente
            default: estado = .enEspera
            }
            return PasoCadena(
                numero: paso.stepNumber ?? (indice + 1),
                nombre: noVacio(paso.name) ?? "Paso \(indice + 1)",
                aprobador: etiquetaAprobador(paso),
                estado: estado,
                esElTuyo: aprobacion != nil && aprobacion?.id == dto.id,
                decidioNombre: noVacio(aprobacion?.decidedBy?.nombre)
            )
        }
    }

    // MARK: La fila que se pinta

    struct Pendiente: Identifiable, Hashable {
        let aprobacionId: Int
        let instanciaId: Int
        /// QUÉ: «Gasto», «Viático», «Orden de compra».
        let tipo: String
        /// Titular: «Gasto #482».
        let titulo: String
        /// El flujo configurado: «Autorización de gastos».
        let flujo: String
        /// «Paso 2 de 3 · Autorización Dirección».
        let paso: String
        /// Al firmar tú se cierra el flujo: no queda nadie después.
        let cierraElFlujo: Bool
        /// DE QUIÉN.
        let solicita: String
        let solicitaRol: String
        /// CUÁNTO, ya formateado. «—» cuando no hay importe.
        let importe: String
        let importeCentavos: Int?
        let recibida: String
        let horasEsperando: Int?
        let atrasada: Bool
        let esperaTexto: String
        let cadena: [PasoCadena]

        /// Clave estable de lista: la aprobación es única por paso e instancia.
        var id: String { "aprobacion-\(aprobacionId)" }
    }

    static func aPendiente(_ dto: AprobacionPendiente, ahora: Date = Date()) -> Pendiente {
        let instancia = dto.instance
        let tipo = etiquetaTipo(instancia?.entityType ?? instancia?.workflow?.entityType)
        let laCadena = Self.cadena(dto)

        let miPaso = dto.step?.stepNumber ?? instancia?.currentStep
        let total = laCadena.isEmpty ? (instancia?.workflow?.steps?.count ?? 0) : laCadena.count
        let nombrePaso = noVacio(dto.step?.name) ?? etiquetaAprobador(dto.step)
        let horas = horasEsperando(dto.createdAt, ahora: ahora)

        let paso: String
        if let miPaso, total > 0 {
            paso = "Paso \(miPaso) de \(total) · \(nombrePaso)"
        } else if let miPaso {
            paso = "Paso \(miPaso) · \(nombrePaso)"
        } else {
            paso = nombrePaso
        }

        return Pendiente(
            aprobacionId: dto.id,
            instanciaId: instancia?.id ?? 0,
            tipo: tipo,
            titulo: instancia?.entityId.map { "\(tipo) #\($0)" } ?? tipo,
            flujo: noVacio(instancia?.workflow?.name) ?? tipo,
            paso: paso,
            // Sin saber cuántos pasos hay no se puede afirmar que cierras el flujo.
            cierraElFlujo: total > 0 && miPaso != nil && (miPaso ?? 0) >= total,
            solicita: noVacio(instancia?.startedBy?.nombre) ?? "Sin solicitante",
            solicitaRol: noVacio(instancia?.startedBy?.role?.nombre) ?? sinDato,
            importe: importeTexto(dto),
            importeCentavos: centavosDe(dto),
            recibida: recibidaTexto(dto.createdAt, ahora: ahora),
            horasEsperando: horas,
            atrasada: estaAtrasada(horas),
            esperaTexto: esperaTexto(horas),
            cadena: laCadena
        )
    }

    /// Lo que lleva más tiempo parado, primero; lo que no trae fecha, al final.
    static func ordenadas(_ dtos: [AprobacionPendiente], ahora: Date = Date()) -> [Pendiente] {
        dtos.map { aPendiente($0, ahora: ahora) }
            .sorted { a, b in
                let ha = a.horasEsperando ?? -1
                let hb = b.horasEsperando ?? -1
                if ha != hb { return ha > hb }
                return a.aprobacionId < b.aprobacionId
            }
    }

    // MARK: Filtros

    /// **Atrasadas**: más de dos días paradas. **Cierran contigo**: tu firma
    /// acaba el flujo, y después de ti no queda nadie que lo revise.
    enum Filtro: CaseIterable, Identifiable {
        case todas, atrasadas, cierran

        var id: String { etiqueta }

        var etiqueta: String {
            switch self {
            case .todas: return "Todas"
            case .atrasadas: return "Atrasadas"
            case .cierran: return "Cierran contigo"
            }
        }
    }

    static func cumple(_ fila: Pendiente, _ filtro: Filtro) -> Bool {
        switch filtro {
        case .todas: return true
        case .atrasadas: return fila.atrasada
        case .cierran: return fila.cierraElFlujo
        }
    }

    static func aplicar(_ filas: [Pendiente], _ filtro: Filtro) -> [Pendiente] {
        filas.filter { cumple($0, filtro) }
    }

    static func conteos(_ filas: [Pendiente]) -> [Filtro: Int] {
        var resultado: [Filtro: Int] = [:]
        for filtro in Filtro.allCases { resultado[filtro] = filas.filter { cumple($0, filtro) }.count }
        return resultado
    }

    static func colorDeFiltro(_ filtro: Filtro) -> Color? {
        switch filtro {
        case .atrasadas: return rojo
        case .cierran: return ambar
        case .todas: return nil
        }
    }

    // MARK: Tira de cifras

    struct Cifras {
        let pendientes: Int
        let cierranContigo: Int
        let atrasadas: Int
        /// Suma de lo que SÍ trae importe en pesos.
        let importeCentavos: Int
        let conImporte: Int
    }

    static func cifras(_ filas: [Pendiente]) -> Cifras {
        let importes = filas.compactMap(\.importeCentavos)
        return Cifras(
            pendientes: filas.count,
            cierranContigo: filas.filter(\.cierraElFlujo).count,
            atrasadas: filas.filter(\.atrasada).count,
            importeCentavos: importes.reduce(0, +),
            conImporte: importes.count
        )
    }

    /// Las celdas de arriba. Vacía = no se pinta la tira (por el conteo de filas,
    /// no porque las cifras den cero). La de importe solo si alguna fila trae cifra.
    static func metricas(_ filas: [Pendiente]) -> [NxMetric] {
        if filas.isEmpty { return [] }
        let c = cifras(filas)
        var celdas: [NxMetric] = [
            NxMetric(
                clave: metricaPendientes,
                etiqueta: "Pendientes",
                valor: String(c.pendientes),
                pista: c.pendientes == 1 ? "espera tu firma" : "esperan tu firma"
            ),
            NxMetric(
                clave: metricaCierran,
                etiqueta: "Cierran contigo",
                valor: String(c.cierranContigo),
                pista: c.cierranContigo == 0 ? "ninguna es la última" : "último paso del flujo",
                color: c.cierranContigo > 0 ? ambar : nil
            ),
            NxMetric(
                clave: metricaAtrasadas,
                etiqueta: "Atrasadas",
                valor: String(c.atrasadas),
                pista: c.atrasadas == 0 ? "nada parado" : "más de 2 días",
                color: c.atrasadas > 0 ? rojo : nil
            ),
        ]
        if c.conImporte > 0 {
            celdas.append(
                NxMetric(
                    clave: metricaImporte,
                    etiqueta: "Importe",
                    valor: Dinero.pesos(c.importeCentavos),
                    pista: c.conImporte == c.pendientes ? "suma de todas" : "solo \(c.conImporte) traen cifra"
                )
            )
        }
        return celdas
    }

    /// Qué filtro pone cada celda de la tira.
    static func filtroDeMetrica(_ clave: String) -> Filtro? {
        switch clave {
        case metricaAtrasadas: return .atrasadas
        case metricaCierran: return .cierran
        default: return nil
        }
    }

    /// Y al revés: qué celda queda marcada con el filtro puesto.
    static func metricaDeFiltro(_ filtro: Filtro) -> String? {
        switch filtro {
        case .atrasadas: return metricaAtrasadas
        case .cierran: return metricaCierran
        case .todas: return nil
        }
    }

    // MARK: Decidir

    /// Lo mínimo que se acepta como motivo de rechazo, en caracteres.
    static let minimoMotivo = 4

    /// Rechazar cancela la instancia entera y avisa al solicitante con el motivo:
    /// un «no» sin explicación lo obliga a ir a preguntar.
    static func motivoValido(_ motivo: String?) -> Bool {
        (motivo ?? "").trimmingCharacters(in: .whitespacesAndNewlines).count >= minimoMotivo
    }

    /// Qué se le dice a quien acaba de decidir. Manda la respuesta del servidor
    /// sobre la intención: es él quien acaba de escribir en la base.
    static func mensajeDeDecision(aprobado: Bool, respuesta: DecisionRespuesta) -> String {
        if !aprobado || respuesta.cancelled {
            return "Rechazada. La solicitud queda cancelada y el solicitante ya fue avisado."
        }
        if let siguiente = respuesta.nextStep { return "Aprobada. Pasa al paso \(siguiente)." }
        if respuesta.complete { return "Aprobada. El flujo queda cerrado." }
        return "Aprobada."
    }

    // MARK: Constantes

    static let metricaPendientes = "pendientes"
    static let metricaCierran = "cierran"
    static let metricaAtrasadas = "atrasadas"
    static let metricaImporte = "importe"

    /// Los colores de `AprobacionesRules.kt` (ARGB) en el tema de la app.
    static let ambar = NxColors.naranja   // #D97706
    static let rojo = NxColors.rojo       // #DC2626
    static let verde = NxColors.verde     // #16A34A
    static let gris = NxColors.gris       // #94A3B8

    private static let espanol = Locale(identifier: "es_MX")

    private static func noVacio(_ texto: String?) -> String? {
        guard let limpio = texto?.trimmingCharacters(in: .whitespacesAndNewlines), !limpio.isEmpty else { return nil }
        return limpio
    }
}
