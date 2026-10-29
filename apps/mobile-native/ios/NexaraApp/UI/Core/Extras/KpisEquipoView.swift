import SwiftUI

/// Desempeño del equipo (`/erp/asistencias/indicadores`) en iPhone — Android
/// `KpisEquipoScreen`, con el índice v2 (29-10).
///
/// La web pone una banda con el índice del equipo, una tabla por persona con los
/// cuatro pilares (Confiabilidad, Calidad, Rendimiento y Disciplina) y la lectura de
/// quien se elija. Aquí arriba va el rango (Hoy · Semana · Mes, el mismo de la
/// pizarra), luego la banda en datos (índice del equipo, entregas a tiempo, tiempo en
/// actividades y extra por decidir) y después una tarjeta por persona con su semáforo
/// y tres números (índice, entregas y disciplina); al tocarla sale la lectura: horas
/// estándar ganadas, calificación, disciplina, «Su equipo» si coordina, de qué sale el
/// índice pilar por pilar y el diagnóstico aparte. Las personas van por índice, del
/// más alto al más bajo; con la API vieja, sin índice, se queda el orden de antes: de
/// peor a mejor.
struct KpisEquipoView: View {
    @State private var estado = CoreExtrasEstado<KpisEquipoResumen>()
    @State private var rango: ActividadesRango = .semana
    @State private var consulta = ""

    var body: some View {
        let datos = estado.datos
        let personas = KpisEquipoRules.ordenar(KpisEquipoRules.filtrar(datos?.personas ?? [], consulta))
        let totalPersonas = datos?.personas.count ?? 0
        let porCumplimiento = KpisEquipoRules.ordenaPorCumplimiento(datos?.personas ?? [])
        ScrollView {
            LazyVStack(alignment: .leading, spacing: NxSpacing.m) {
                VStack(alignment: .leading, spacing: 6) {
                    FilaDePastillasDeConsulta(pastillas: ActividadesRango.allCases.map { opcion in
                        PastillaDeConsulta(
                            etiqueta: opcion.etiqueta,
                            seleccionada: opcion == rango,
                            onClick: { rango = opcion }
                        )
                    })
                    Text(ActividadesRango.descripcion(rango))
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .padding(.horizontal, 2)
                }

                if let aviso = estado.avisoDesactualizado {
                    MoreAvisoDesactualizado(mensaje: aviso) { estado.avisoDesactualizado = nil }
                }

                if estado.mostrandoEsqueleto {
                    NxSkeletonList(itemCount: 5, itemHeight: 104)
                }

                if let error = estado.error, !estado.hayDatos {
                    NxErrorBlock(message: error, onRetry: { Task { await cargar() } })
                }

                if let datos {
                    ResumenDelEquipo(datos: datos)

                    if totalPersonas > 6 {
                        NxSearchField(text: $consulta, placeholder: "Buscar a alguien del equipo")
                    }

                    MoreCabecera(
                        titulo: "Persona por persona",
                        subtitulo: KpisEquipoRules.ordenTexto(porCumplimiento: porCumplimiento),
                        trailing: consulta.trimmingCharacters(in: .whitespaces).isEmpty
                            ? "\(totalPersonas)"
                            : "\(personas.count) de \(totalPersonas)"
                    )

                    if personas.isEmpty {
                        if consulta.trimmingCharacters(in: .whitespaces).isEmpty {
                            NxEmptyState(
                                title: "Nadie en tu alcance",
                                subtitle: "En este periodo no hay personas de las que puedas ver indicadores."
                            )
                        } else {
                            NxEmptyState(
                                title: "Sin coincidencias",
                                subtitle: "Nadie del equipo coincide con «\(consulta)».",
                                actionLabel: "Limpiar búsqueda",
                                onAction: { consulta = "" }
                            )
                        }
                    } else {
                        ForEach(personas) { TarjetaDePersonaKpi(fila: $0) }
                    }

                    if !datos.supuestos.isEmpty {
                        SupuestosKpi(supuestos: datos.supuestos)
                    }

                    if porCumplimiento {
                        MoreNotaDeAlcance(texto: KpisEquipoRules.notaIndice)
                    }
                }

                MoreNotaDeAlcance(texto: KpisEquipoRules.limite)
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .refreshable { await cargar() }
        .task(id: rango) {
            // Cambiar de periodo es pedir otra cosa, no refrescar la misma: se
            // descarta lo anterior para que no se lea como si fuera del nuevo.
            await cargar(descartando: true)
        }
    }

    private func cargar(descartando: Bool = false) async {
        if descartando { estado.datos = nil }
        estado.empezar()
        let fechas = ActividadesRango.fechas(rango)
        do {
            let datos = try await CoreExtrasRepository.shared.kpisEquipo(desde: fechas.desde, hasta: fechas.hasta)
            estado.exito(datos)
        } catch {
            estado.fallo(error.toUserMessage(fallback: "No se pudieron cargar los KPIs del equipo"))
        }
    }
}

// MARK: - Piezas

/// Cómo va el equipo entero: el semáforo, cuatro números y por qué está así.
private struct ResumenDelEquipo: View {
    let datos: KpisEquipoResumen

    var body: some View {
        let semaforo = CoreExtrasSemaforo(datos.equipo?.semaforo)
        let motivos = datos.equipo?.motivos ?? []
        VStack(spacing: 10) {
            MoreTarjeta {
                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(datos.alcanceTexto)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(NxColors.fg)
                        Text("\(datos.personas.count) personas en el periodo")
                            .font(NxType.labelMedium)
                            .foregroundStyle(NxColors.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    MoreChipSemaforo(semaforo: semaforo)
                }
                if !motivos.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(motivos, id: \.self) { motivo in
                            Text("· \(motivo)")
                                .font(NxType.bodySmall)
                                .foregroundStyle(NxColors.fg)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            MoreRejillaDeDatos(datos: KpisEquipoRules.datosEquipo(datos))
        }
    }
}

/// Una persona. Cerrada enseña nombre, puesto y confianza, semáforo y tres números
/// (índice, entregas y disciplina; con la API vieja, puntualidad, productividad y
/// horas); abierta, la lectura de la web, de qué sale su índice pilar por pilar, el
/// diagnóstico que no pesa, el tiempo extra, las jornadas sin cerrar y por qué su
/// semáforo está en ese color.
private struct TarjetaDePersonaKpi: View {
    let fila: KpiPersonaFila
    @State private var abierta = false

    var body: some View {
        let semaforo = CoreExtrasSemaforo(fila.semaforo)
        let nombre = fila.persona?.nombre.nilSiVacio ?? "Sin nombre"
        let totales = fila.totales
        let conIndice = totales?.traeCumplimiento == true
        MoreTarjeta(onClick: { withAnimation(.easeInOut(duration: 0.2)) { abierta.toggle() } }) {
            HStack(alignment: .center, spacing: 10) {
                NxAvatar(nombre: nombre, url: fila.persona?.avatarUrl, size: 40)
                VStack(alignment: .leading, spacing: 0) {
                    Text(nombre)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    if let subtitulo = KpisEquipoRules.subtituloPersona(fila) {
                        Text(subtitulo)
                            .font(NxType.labelMedium)
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                MoreChipSemaforo(semaforo: semaforo)
                Image(systemName: abierta ? "chevron.up" : "chevron.down")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.muted)
                    .frame(width: 20, height: 20)
                    .accessibilityLabel(abierta ? "Ocultar el detalle de \(nombre)" : "Ver el detalle de \(nombre)")
            }

            MoreRejillaDeDatos(datos: KpisEquipoRules.datosPersona(fila), columnas: 3)

            if abierta {
                VStack(alignment: .leading, spacing: NxSpacing.s) {
                    if conIndice {
                        Text(KpisEquipoRules.resumen(totales))
                            .font(NxType.bodySmall)
                            .foregroundStyle(NxColors.fg)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    // La lectura de la web, el tiempo en actividades y las horas. Con la API
                    // vieja no hay nada: esos números siguen en la tarjeta.
                    ForEach(Array(KpisEquipoRules.lineasDesplegadas(totales).enumerated()), id: \.offset) { _, linea in
                        DetalleLineaKpi(etiqueta: linea.etiqueta, valor: linea.valor)
                    }
                    if conIndice {
                        PilaresDelIndiceKpi(totales: totales)
                        DiagnosticoKpi(lineas: KpisEquipoRules.diagnostico(totales))
                    }
                    DetalleLineaKpi(etiqueta: "Horario", valor: fila.horario?.etiqueta.nilSiVacio ?? "Sin horario")
                    if !conIndice {
                        // Con índice, el uniforme ya va en la lectura.
                        DetalleLineaKpi(
                            etiqueta: "Uniforme",
                            valor: "\(KpisEquipoRules.pct(totales?.uniforme?.pct)) · \(KpisEquipoRules.uniformePie(totales))"
                        )
                    }
                    DetalleLineaKpi(
                        etiqueta: "Tiempo extra",
                        valor: "\(KpisEquipoRules.horas(totales?.minutosExtra)) · \(KpisEquipoRules.extraPie(totales))"
                    )
                    DetalleLineaKpi(etiqueta: "Inactividad", valor: KpisEquipoRules.horas(totales?.minutosInactivos))
                    if let jornadas = KpisEquipoRules.jornadasDetalle(totales) {
                        DetalleLineaKpi(etiqueta: "Jornadas", valor: jornadas)
                    }
                    if !fila.motivos.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Por qué está en \(semaforo.etiqueta.lowercased())")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(NxColors.fg)
                            ForEach(fila.motivos, id: \.self) { motivo in
                                Text("· \(motivo)")
                                    .font(NxType.bodySmall)
                                    .foregroundStyle(NxColors.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                .transition(.opacity)
            }
        }
    }
}

/// «De qué sale el 86»: los cuatro pilares, cada uno con su número, su barra y las
/// partes que lo forman con lo que pesan. Un pilar sin dato no pesa y lo dice.
private struct PilaresDelIndiceKpi: View {
    let totales: KpiTotales?

    var body: some View {
        VStack(alignment: .leading, spacing: NxSpacing.s) {
            Text(KpisEquipoRules.tituloPilares(totales))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            ForEach(KpisEquipoRules.pilares(totales)) { pilar in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .center, spacing: 8) {
                        Text(pilar.etiqueta)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(pilar.pct.map { "\($0)" } ?? "—")
                            .font(.system(size: 13, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(NxColors.fg)
                    }
                    MoreBarra(
                        progreso: pilar.pct.map { Double($0) / 100 },
                        etiqueta: KpisEquipoRules.partesDelPilar(pilar),
                        tono: pilar.tono.tono
                    )
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// El diagnóstico (peso 0): se lee, pero no pesa en el índice ni lo multiplica.
private struct DiagnosticoKpi: View {
    let lineas: [KpisEquipoRules.Linea]

    var body: some View {
        if !lineas.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text("No pesa, para leer")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                ForEach(Array(lineas.enumerated()), id: \.offset) { _, linea in
                    Text("· \(linea.etiqueta): \(linea.valor)")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

private struct DetalleLineaKpi: View {
    let etiqueta: String
    let valor: String

    var body: some View {
        HStack(alignment: .top, spacing: NxSpacing.m) {
            Text(etiqueta)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .frame(width: 112, alignment: .leading)
            Text(valor)
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Lo que se dio por supuesto al contar; el API lo manda en español.
private struct SupuestosKpi: View {
    let supuestos: [String]
    @State private var abierto = false

    var body: some View {
        MoreTarjeta(onClick: { withAnimation(.easeInOut(duration: 0.2)) { abierto.toggle() } }) {
            HStack(alignment: .center, spacing: NxSpacing.s) {
                Text("Cómo se calculan estos números")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: abierto ? "chevron.up" : "chevron.down")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.muted)
                    .frame(width: 20, height: 20)
                    .accessibilityLabel(abierto ? "Ocultar los supuestos" : "Ver los supuestos")
            }
            if abierto {
                VStack(alignment: .leading, spacing: NxSpacing.xs) {
                    ForEach(supuestos, id: \.self) { texto in
                        Text("· \(texto)")
                            .font(NxType.bodySmall)
                            .foregroundStyle(NxColors.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .transition(.opacity)
            }
        }
    }
}

// MARK: - Reglas (Android `KpisEquipoRules`)

/// Los números del equipo ya masticados para pintar — la lectura de
/// `apps/web/lib/desempeno.ts` (índice v2). Lo que el API no manda sale «—»; no se
/// inventa un cero, que parece un dato y no lo es. Semáforo, confianza y pilares: el API
/// los manda ya calculados desde f2dc7130 (`semaforoIndice`, `confianza`, `pilares[]` y
/// `cumplimientoPartes[].semaforo`, con cortes únicos ≥ 90 verde, ≥ 75 ámbar) y se usan tal
/// cual. Sin ellos (un API anterior), se calculan aquí con los mismos cortes y la confianza
/// de la web (provisional con menos de 10 entregas).
enum KpisEquipoRules {
    static let limite = "Consulta del periodo. Aprobar tiempo extra y descargar el Excel se hacen desde la computadora."
    /// La nota de la web bajo la lectura: el índice ayuda, no decide.
    static let notaIndice = "El número lo calcula el sistema con reglas fijas. Es una ayuda para el jefe: ninguna decisión de pago o sanción sale sola de aquí."

    private static func peso(_ s: CoreExtrasSemaforo) -> Int {
        switch s {
        case .rojo: return 0
        case .amarillo: return 1
        case .verde: return 2
        case .sinDatos: return 3
        }
    }

    /// Con el índice del API: por índice. Con la API vieja, como antes: primero lo que
    /// está mal y, dentro de un nivel, por nombre.
    static func ordenar(_ personas: [KpiPersonaFila]) -> [KpiPersonaFila] {
        if ordenaPorCumplimiento(personas) { return ordenarPorCumplimiento(personas) }
        return personas.sorted { a, b in
            let pa = peso(CoreExtrasSemaforo(a.semaforo))
            let pb = peso(CoreExtrasSemaforo(b.semaforo))
            if pa != pb { return pa < pb }
            return antesPorNombre(a, b)
        }
    }

    /// Por nombre como lo ordena una persona: «Ángel» va con la A, no después de la Z.
    private static func antesPorNombre(_ a: KpiPersonaFila, _ b: KpiPersonaFila) -> Bool {
        let na = (a.persona?.nombre ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let nb = (b.persona?.nombre ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return na.compare(nb, options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "es_MX"))
            == .orderedAscending
    }

    /// ¿El API ya manda el índice? Basta con que alguna fila traiga la clave.
    static func ordenaPorCumplimiento(_ personas: [KpiPersonaFila]) -> Bool {
        personas.contains { $0.totales?.traeCumplimiento == true }
    }

    /// Web `ordenaRanking(…, "cumplimiento")`: índice más alto arriba y sin dato al
    /// final; a igualdad, más entregas a tiempo; luego por nombre.
    static func ordenarPorCumplimiento(_ personas: [KpiPersonaFila]) -> [KpiPersonaFila] {
        personas.sorted { a, b in
            if let mayor = mayorPrimero(a.totales?.cumplimientoPct, b.totales?.cumplimientoPct) { return mayor }
            let ea = a.totales?.entregas?.aTiempo ?? 0
            let eb = b.totales?.entregas?.aTiempo ?? 0
            if ea != eb { return ea > eb }
            return antesPorNombre(a, b)
        }
    }

    /// `true` si `a` va antes, `false` si va después y `nil` si empatan. Sin dato, al final.
    private static func mayorPrimero(_ a: Double?, _ b: Double?) -> Bool? {
        switch (a, b) {
        case (nil, nil): return nil
        case (nil, _): return false
        case (_, nil): return true
        case let (x?, y?): return x == y ? nil : x > y
        }
    }

    /// Lo que se lee bajo «Persona por persona».
    static func ordenTexto(porCumplimiento: Bool) -> String {
        porCumplimiento
            ? "Por índice, de mayor a menor"
            : "De peor a mejor, para no tener que buscarlo"
    }

    /// Bajo el nombre, como la web: «Técnico · confianza alta». Con la API vieja, el
    /// puesto o el horario, como antes.
    static func subtituloPersona(_ fila: KpiPersonaFila) -> String? {
        let area = fila.persona?.puesto?.nilSiVacio ?? fila.horario?.etiqueta.nilSiVacio
        guard fila.totales?.traeCumplimiento == true else { return area }
        let conf = confianza(fila).etiqueta
        if let area { return "\(area) · \(conf)" }
        return conf.prefix(1).uppercased() + conf.dropFirst()
    }

    // MARK: Semáforo del API y cortes del API

    /// El semáforo que manda el API en una parte: texto (`verde` · `amarillo` · `rojo` ·
    /// `sin_datos`, o los tonos de la web `ok` · `atencion` · `critico`) u objeto con
    /// `semaforo`, `nivel`, `color` o `tono`. `nil` si no viene o no se entiende.
    static func semaforoDelApi(_ valor: KpiTextoFlexible?) -> CoreExtrasSemaforo? {
        guard let texto = valor?.valor(["semaforo", "nivel", "color", "tono"])?.lowercased() else { return nil }
        switch texto {
        case "verde", "ok": return .verde
        case "amarillo", "atencion", "atención": return .amarillo
        case "rojo", "critico", "crítico": return .rojo
        case "sin_datos": return .sinDatos
        default: return nil
        }
    }

    /// Índice, pilares y entregas a tiempo: ≥ 90 verde, ≥ 75 ámbar (`entregasVerde`, `formaVerde`).
    static let cumplimientoBueno = 90.0
    static let cumplimientoRegular = 75.0
    /// Tiempo en actividades: ≥ 70 verde, ≥ 50 ámbar (`productividadVerde`). Solo informa.
    static let productividadBuena = 70.0
    static let productividadRegular = 50.0
    /// Uniforme ✓ de lo revisado: ≥ 95 verde, ≥ 80 ámbar (`uniformeVerde`).
    static let uniformeBueno = 95.0
    static let uniformeRegular = 80.0
    /// Retardos en el rango: 1–2 ámbar, 3 o más rojo.
    static let retardosAmarillo = 1
    static let retardosRojo = 3

    private static func corte(_ valor: Double?, _ bueno: Double, _ regular: Double) -> CoreExtrasSemaforo {
        guard let valor, valor.isFinite else { return .sinDatos }
        if valor >= bueno { return .verde }
        if valor >= regular { return .amarillo }
        return .rojo
    }

    /// Verde ≥ 90, ámbar ≥ 75, rojo debajo; gris sin dato.
    static func tonoCumplimiento(_ valor: Double?) -> CoreExtrasSemaforo {
        corte(valor, cumplimientoBueno, cumplimientoRegular)
    }

    /// Color del índice: el `semaforoIndice` que manda el API (f2dc7130); sin él, el corte
    /// 90/75 sobre `cumplimientoPct`. Lo usan la tira del equipo, la tarjeta de cada persona y
    /// el anillo del inicio de dirección.
    static func tonoIndice(_ t: KpiTotales?) -> CoreExtrasSemaforo {
        semaforoDelApi(t?.semaforoIndice) ?? tonoCumplimiento(t?.cumplimientoPct)
    }

    /// Verde ≥ 70, ámbar ≥ 50, rojo debajo; gris sin dato.
    static func tonoProductividad(_ valor: Double?) -> CoreExtrasSemaforo {
        corte(valor, productividadBuena, productividadRegular)
    }

    /// Verde ≥ 95, ámbar ≥ 80, rojo debajo; gris sin dato.
    static func tonoUniforme(_ valor: Double?) -> CoreExtrasSemaforo {
        corte(valor, uniformeBueno, uniformeRegular)
    }

    /// Sin retardos verde, 1–2 ámbar, 3 o más rojo; gris sin días con jornada.
    static func tonoRetardos(_ t: KpiTotales?) -> CoreExtrasSemaforo {
        guard let t, t.diasConJornada > 0 else { return .sinDatos }
        if t.retardos >= retardosRojo { return .rojo }
        if t.retardos >= retardosAmarillo { return .amarillo }
        return .verde
    }

    private static func plural(_ n: Int, _ uno: String, _ varios: String) -> String {
        "\(n) \(n == 1 ? uno : varios)"
    }

    /// Redondeo al entero (Kotlin `roundToInt`); `nil` si no hay número legible.
    private static func entero(_ valor: Double?) -> Int? {
        guard let valor, valor.isFinite else { return nil }
        return Int(min(max(valor, -1_000_000), 1_000_000).rounded())
    }

    /// «86» · «—»: el índice y sus pilares van de 0 a 100, sin «%», como en la web.
    static func indice(_ valor: Double?) -> String {
        entero(valor).map { "\($0)" } ?? "—"
    }

    // MARK: Confianza (web `confianzaDe`)

    enum Confianza: String {
        case alta, media, baja

        var etiqueta: String { "confianza \(rawValue)" }
    }

    /// §7.2: con 20 entregas medidas o más es alta; de 10 a 19, media; con menos, baja.
    static let entregasConfianzaAlta = 20
    static let entregasConfianzaMedia = 10

    /// `"alta"` · `"media"` · `"baja"`, o un objeto con `nivel` / `valor` / `clave` / `confianza`.
    static func confianzaDelApi(_ valor: KpiTextoFlexible?) -> Confianza? {
        guard let texto = valor?.valor(["nivel", "valor", "clave", "confianza"])?.lowercased() else { return nil }
        return Confianza(rawValue: texto)
    }

    /// La del API si la manda (en la fila o en los totales); si no, la de la web por entregas medidas.
    static func confianza(_ t: KpiTotales?, delApi: KpiTextoFlexible? = nil) -> Confianza {
        if let c = confianzaDelApi(delApi) ?? confianzaDelApi(t?.confianza) { return c }
        let n = t?.entregas?.medidas ?? 0
        if n >= entregasConfianzaAlta { return .alta }
        if n >= entregasConfianzaMedia { return .media }
        return .baja
    }

    static func confianza(_ fila: KpiPersonaFila) -> Confianza {
        confianza(fila.totales, delApi: fila.confianza)
    }

    /// Pie del índice: «Confianza alta» · «Confianza media» · «Provisional · 7 entregas»
    /// (con menos de 10 entregas el índice es provisional y no se publica) · «Sin datos que medir».
    static func indicePie(_ t: KpiTotales?, confianza conf: Confianza? = nil) -> String {
        guard let t, let pct = t.cumplimientoPct, pct.isFinite else { return "Sin datos que medir" }
        switch conf ?? confianza(t) {
        case .baja:
            let n = t.entregas?.medidas ?? 0
            return n > 0 ? "Provisional · \(plural(n, "entrega", "entregas"))" : "Provisional · sin entregas"
        case .media: return "Confianza media"
        case .alta: return "Confianza alta"
        }
    }

    // MARK: Pilares del índice v2 (web `pilaresDe`)

    /// Un pilar: su promedio ponderado (0–100) y las partes que lo forman.
    struct Pilar: Identifiable {
        let id: String
        let etiqueta: String
        let ayuda: String
        /// `nil` = sin dato en el rango: no pesa.
        let pct: Int?
        let partes: [KpiParteCumplimiento]
        let tono: CoreExtrasSemaforo
    }

    private struct DefPilar {
        let id: String
        let etiqueta: String
        let claves: Set<String>
        let ayuda: String
    }

    /// 30 Confiabilidad + 25 Calidad + 30 Rendimiento + 15 Disciplina (los pesos vienen en cada parte).
    private static let definicionPilares: [DefPilar] = [
        DefPilar(id: "confiabilidad", etiqueta: "Confiabilidad", claves: ["entregas"],
                 ayuda: "Entrega antes de su límite (en coordinación, su equipo y revisar a tiempo)"),
        DefPilar(id: "calidad", etiqueta: "Calidad", claves: ["forma"],
                 ayuda: "Aprobadas a la primera y su calificación calibrada"),
        DefPilar(id: "rendimiento", etiqueta: "Rendimiento", claves: ["estandar"],
                 ayuda: "Horas estándar ganadas contra sus horas en jornada"),
        DefPilar(id: "disciplina", etiqueta: "Disciplina", claves: ["asistencia", "uniforme"],
                 ayuda: "Puntualidad graduada, registro completo y uniforme"),
    ]

    private static func pesoPositivo(_ p: KpiParteCumplimiento) -> Double? {
        guard let w = p.peso, w.isFinite, w > 0 else { return nil }
        return w
    }

    /// Los cuatro pilares, siempre en el mismo orden. Si el API manda `pilares[]` (f2dc7130),
    /// cada uno sale de ahí tal cual (etiqueta, pct y semáforo). Si no lo manda (o le falta
    /// alguno), se agrupa aquí como la web: el promedio ponderado (por su peso) de las partes
    /// con peso > 0 que le tocan, `nil` si no tiene dato, con el tono que mande el API en sus
    /// partes (el peor) o, si no, los cortes del índice. En los dos casos el pilar lleva sus
    /// partes, para pintarlas debajo. Las de peso 0 son diagnóstico y no entran.
    static func pilares(_ t: KpiTotales?) -> [Pilar] {
        let lista = t?.cumplimientoPartes ?? []
        let delApi = t?.pilares ?? []
        return definicionPilares.map { def -> Pilar in
            let suyas = lista.filter { p in
                def.claves.contains(p.clave.trimmingCharacters(in: .whitespaces)) && pesoPositivo(p) != nil
            }
            if let api = delApi.first(where: { $0.id.trimmingCharacters(in: .whitespaces).lowercased() == def.id }) {
                let pctApi = entero(api.pct)
                return Pilar(
                    id: def.id,
                    etiqueta: api.label.nilSiVacio ?? def.etiqueta,
                    ayuda: def.ayuda,
                    pct: pctApi,
                    partes: suyas,
                    tono: semaforoDelApi(api.semaforo) ?? tonoCumplimiento(pctApi.map { Double($0) })
                )
            }
            let medibles = suyas.filter { $0.pct?.isFinite == true }
            let pesoTotal = medibles.reduce(0.0) { $0 + (pesoPositivo($1) ?? 0) }
            let suma = medibles.reduce(0.0) { $0 + ($1.pct ?? 0) * (pesoPositivo($1) ?? 0) }
            let pct: Int? = pesoTotal > 0 ? entero(suma / pesoTotal) : nil
            let deSusPartes = suyas.compactMap { semaforoDelApi($0.semaforo) }
            let tono = deSusPartes.min { peso($0) < peso($1) } ?? tonoCumplimiento(pct.map { Double($0) })
            return Pilar(id: def.id, etiqueta: def.etiqueta, ayuda: def.ayuda, pct: pct, partes: suyas, tono: tono)
        }
    }

    /// «De qué sale el 86» · «De qué sale el índice» sin número.
    static func tituloPilares(_ t: KpiTotales?) -> String {
        let n = indice(t?.cumplimientoPct)
        return n == "—" ? "De qué sale el índice" : "De qué sale el \(n)"
    }

    /// Las partes de un pilar, una por renglón, como la web: «Entregas a tiempo: 17 de 18
    /// · pesa 30». Sin partes: «Sin dato en estas fechas: no pesa.»
    static func partesDelPilar(_ p: Pilar) -> String {
        guard !p.partes.isEmpty else { return "Sin dato en estas fechas: no pesa." }
        return p.partes.map { x -> String in
            let etiqueta = x.etiqueta.nilSiVacio ?? ActividadesTexto.humanizar(x.clave)
            let peso = pesoPositivo(x).map { " · pesa \(numeroCorto($0))" } ?? ""
            if let detalle = x.detalle.nilSiVacio { return "\(etiqueta): \(detalle)\(peso)" }
            return "\(etiqueta)\(peso)"
        }.joined(separator: "\n")
    }

    /// El diagnóstico (partes de peso 0) que vale la pena leer: lo que va por debajo de su
    /// referencia (web `diagnosticoDe`). No pesa en el índice ni lo multiplica.
    static func diagnostico(_ t: KpiTotales?) -> [Linea] {
        (t?.cumplimientoPartes ?? []).compactMap { p -> Linea? in
            guard let w = p.peso, w == 0, (p.pct ?? 0) < 100 else { return nil }
            guard let etiqueta = p.etiqueta.nilSiVacio ?? ActividadesTexto.humanizar(p.clave).nilSiVacio else {
                return nil
            }
            var detalle = p.detalle.trimmingCharacters(in: .whitespacesAndNewlines)
            let sufijo = "· diagnóstico"
            if detalle.hasSuffix(sufijo) {
                detalle = String(detalle.dropLast(sufijo.count)).trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return Linea(etiqueta: etiqueta, valor: detalle.isEmpty ? pct(p.pct) : detalle)
        }
    }

    // MARK: Puntualidad graduada (la Disciplina del índice)

    /// ¿Viene la Disciplina del índice (puntualidad graduada)?
    private static func graduada(_ t: KpiTotales?) -> Bool {
        guard let d = t?.disciplina, d.esperados > 0, let p = d.pct, p.isFinite else { return false }
        return true
    }

    /// Puntualidad graduada: `disciplina.pct` del API (hasta 15 min tarde cuenta 1, 16–30
    /// 0.6, 31–60 0.3 y más 0, × registro completo). Sin ese dato (API anterior), la binaria
    /// de siempre. `nil` sin un día que contar — que no es 100 %.
    static func puntualidadPct(_ t: KpiTotales?) -> Double? {
        if graduada(t) { return t?.disciplina?.pct }
        guard let t, t.diasConJornada > 0 else { return nil }
        let retardos = min(max(t.retardos, 0), t.diasConJornada)
        return Double(t.diasConJornada - retardos) * 100.0 / Double(t.diasConJornada)
    }

    /// Graduada: con los cortes del índice. Binaria: por retardos, como el semáforo del API.
    static func tonoPuntualidad(_ t: KpiTotales?) -> CoreExtrasSemaforo {
        graduada(t) ? tonoCumplimiento(t?.disciplina?.pct) : tonoRetardos(t)
    }

    static func puntualidadPie(_ t: KpiTotales?) -> String {
        graduada(t) ? disciplinaPie(t) : puntualidadPieBinaria(t)
    }

    private static func puntualidadPieBinaria(_ t: KpiTotales?) -> String {
        let dias = t?.diasConJornada ?? 0
        guard dias > 0 else { return "Sin días con jornada" }
        let retardos = t?.retardos ?? 0
        guard retardos > 0 else { return "Sin retardos en \(dias) \(dias == 1 ? "día" : "días")" }
        let etiqueta = retardos == 1 ? "1 retardo" : "\(retardos) retardos"
        let tarde = t?.minutosTarde ?? 0
        return tarde > 0 ? "\(etiqueta) · \(horas(tarde)) tarde" : etiqueta
    }

    /// Pie corto de la Disciplina: «2 retardos · registro 4/5», «3 retardos = 1 falta»,
    /// «Sin retardos». Sin el dato graduado, el de la puntualidad binaria.
    static func disciplinaPie(_ t: KpiTotales?) -> String {
        guard let d = t?.disciplina, d.esperados > 0 else { return puntualidadPieBinaria(t) }
        var partes: [String] = []
        if d.retardos <= 0 {
            partes.append("Sin retardos")
        } else {
            let faltas = d.faltasPorRetardos > 0 ? " = \(plural(d.faltasPorRetardos, "falta", "faltas"))" : ""
            partes.append(plural(d.retardos, "retardo", "retardos") + faltas)
        }
        if d.jornadasRevisables > 0 && d.registroCompleto < d.jornadasRevisables {
            partes.append("registro \(d.registroCompleto)/\(d.jornadasRevisables)")
        }
        return partes.joined(separator: " · ")
    }

    /// Puntualidad graduada y registro completo en una línea (web `disciplinaTexto`): «4.6
    /// de 5 días en puntos · 3 retardos = 1 falta (no se descuenta sola) · registro completo
    /// 4 de 5». `nil` sin días que medir.
    static func disciplinaTexto(_ t: KpiTotales?) -> String? {
        guard let d = t?.disciplina, d.esperados > 0 else { return nil }
        var partes = ["\(numeroCorto(d.puntos)) de \(d.esperados) días en puntos"]
        if d.faltasPorRetardos > 0 {
            let f = d.faltasPorRetardos
            partes.append("\(d.retardos) retardos = \(f) \(f == 1 ? "falta" : "faltas") (no se descuenta sola)")
        }
        if d.jornadasRevisables > 0 {
            partes.append("registro completo \(d.registroCompleto) de \(d.jornadasRevisables)")
        }
        return partes.joined(separator: " · ")
    }

    // MARK: La lectura de la persona (web `Lectura`)

    /// «12 h 30 m · 58 % de su jornada» y «9 entregas con estándar · eficiencia 87 %»
    /// (pilar Rendimiento). `nil` si no entregó nada con tiempo estándar.
    static func estandarGanado(_ t: KpiTotales?) -> (valor: String, detalle: String)? {
        guard let t, let e = t.entregas, e.conEstandar > 0, e.minutosEstandarGanados > 0 else { return nil }
        let ganados = e.minutosEstandarGanados
        let rendimiento = t.minutosLaborados > 0 ? entero(Double(ganados) * 100 / Double(t.minutosLaborados)) : nil
        var partes = ["\(plural(e.conEstandar, "entrega", "entregas")) con estándar"]
        if let ef = entero(e.pctEficienciaEstandar) { partes.append("eficiencia \(ef) %") }
        let valor = rendimiento.map { "\(horas(ganados)) · \($0) % de su jornada" } ?? horas(ganados)
        return (valor, partes.joined(separator: " · "))
    }

    /// «Entregó 31 de 33 a tiempo. Tuvo una actividad corriendo 128 h de 212 h en jornada.»
    static func resumen(_ t: KpiTotales?) -> String {
        var frases: [String] = []
        if let e = t?.entregas, e.medidas > 0 {
            let resto = e.sinEntregar > 0
                ? " y \(e.sinEntregar) \(e.sinEntregar == 1 ? "quedó" : "quedaron") sin entregar"
                : ""
            frases.append("Entregó \(e.aTiempo) de \(e.medidas) a tiempo\(resto).")
        } else {
            frases.append("No tuvo entregas que medir en estas fechas.")
        }
        if let t, t.minutosLaborados > 0 {
            frases.append("Tuvo una actividad corriendo \(horas(t.minutosProductivos)) de \(horas(t.minutosLaborados)) en jornada.")
        }
        return frases.joined(separator: " ")
    }

    /// Los datos de la lectura, en el orden de la web: «Su equipo» (solo coordinadores),
    /// horas estándar ganadas, aprobadas a la primera, calificación calibrada, retardos,
    /// puntualidad y registro, y uniforme.
    static func lectura(_ t: KpiTotales?) -> [Linea] {
        guard let t else { return [] }
        var out: [Linea] = []
        if let q = t.equipo {
            let total = q.revisiones?.total ?? 0
            let revisiones = total > 0 ? " · revisó \(q.revisiones?.enPlazo ?? 0) de \(total) en 24 h hábiles" : ""
            out.append(Linea(
                etiqueta: "Su equipo",
                valor: "\(plural(q.personas, "persona", "personas")) · \(q.aTiempo) de \(q.medidas) a tiempo\(revisiones)"
            ))
        }
        let estandar = estandarGanado(t)
        out.append(Linea(
            etiqueta: "Horas estándar ganadas",
            valor: estandar.map { "\($0.valor) (\($0.detalle))" } ?? "Sin entregas con tiempo estándar"
        ))
        let revisadas = t.entregas?.revisadas ?? 0
        out.append(Linea(
            etiqueta: "Aprobadas a la primera",
            valor: revisadas > 0 ? "\(t.entregas?.aprobadasALaPrimera ?? 0) de \(revisadas)" : "Sin revisar"
        ))
        if let cal = t.calificacion, cal.n > 0, let p = entero(cal.pct) {
            out.append(Linea(etiqueta: "Calificación calibrada", valor: "\(p) de 100 (\(cal.n))"))
        } else {
            out.append(Linea(etiqueta: "Calificación calibrada", valor: "Sin calificar"))
        }
        out.append(Linea(etiqueta: "Retardos", valor: t.retardos > 0 ? "\(t.retardos) · \(horas(t.minutosTarde))" : "Ninguno"))
        let esperados = t.asistenciaPuntual?.esperados ?? 0
        out.append(Linea(
            etiqueta: "Puntualidad y registro",
            valor: disciplinaTexto(t)
                ?? (esperados > 0 ? "\(t.asistenciaPuntual?.puntuales ?? 0) de \(esperados) días" : "—")
        ))
        let u = t.uniforme
        out.append(Linea(etiqueta: "Uniforme", valor: (u?.revisadas ?? 0) > 0 ? "\(u?.ok ?? 0) de \(u?.revisadas ?? 0)" : "Sin revisar"))
        return out
    }

    // MARK: Entregas

    /// % de entregas a tiempo; si el API no lo trae, se saca de los conteos.
    static func pctATiempo(_ e: KpiEntregas?) -> Double? {
        guard let e, e.medidas > 0 else { return nil }
        return e.pctATiempo ?? Double(e.aTiempo) * 100.0 / Double(e.medidas)
    }

    /// «17/18» · «—» sin entregas que medir (no es un cero).
    static func entregasValor(_ e: KpiEntregas?) -> String {
        guard let e, e.medidas > 0 else { return "—" }
        return "\(e.aTiempo)/\(e.medidas)"
    }

    /// «a tiempo · 18/18 a la primera» · «a tiempo» sin revisiones · «Sin entregas».
    static func entregasPie(_ e: KpiEntregas?) -> String {
        guard let e, e.medidas > 0 else { return "Sin entregas" }
        guard e.revisadas > 0 else { return "a tiempo" }
        return "a tiempo · \(e.aprobadasALaPrimera)/\(e.revisadas) a la primera"
    }

    /// Un renglón de lo desplegado: etiqueta a la izquierda, lo que dice a la derecha.
    struct Linea: Hashable {
        let etiqueta: String
        let valor: String
    }

    /// «40» · «12.5» · «4.6»: el número como viene, sin decimales de más.
    private static func numeroCorto(_ valor: Double) -> String {
        let decimas = (valor * 10).rounded()
        guard abs(decimas) < 1e12 else { return "—" }
        let entero = Int(decimas)
        return entero % 10 == 0 ? "\(entero / 10)" : "\(entero / 10).\(abs(entero % 10))"
    }

    /// Lo que sale al desplegar la tarjeta, antes de los pilares: con índice, la lectura de
    /// la web, el tiempo en actividades y las horas. Con la API vieja, nada.
    static func lineasDesplegadas(_ t: KpiTotales?) -> [Linea] {
        guard let t, t.traeCumplimiento else { return [] }
        return lectura(t) + [
            Linea(etiqueta: "Tiempo en actividades", valor: "\(pct(t.productividadPct)) · \(productividadPie(t))"),
            Linea(etiqueta: "Horas", valor: "\(horas(t.minutosLaborados)) · \(jornadasPie(t))"),
        ]
    }

    /// Por nombre, puesto o correo; sin texto devuelve todo.
    static func filtrar(_ personas: [KpiPersonaFila], _ consulta: String) -> [KpiPersonaFila] {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return personas }
        return personas.filter { fila in
            [fila.persona?.nombre, fila.persona?.puesto, fila.persona?.email]
                .compactMap { $0?.lowercased() }
                .contains { $0.contains(q) }
        }
    }

    /// «83 %» · «—» cuando no hay porcentaje que dar.
    static func pct(_ valor: Double?) -> String {
        guard let valor, valor.isFinite else { return "—" }
        return "\(Int(valor.rounded())) %"
    }

    /// «7 h 30 m» · «45 m» · «—». Minutos negativos se leen igual que positivos.
    static func horas(_ minutos: Int?) -> String {
        guard let m = minutos else { return "—" }
        let total = abs(m)
        let h = total / 60
        let resto = total % 60
        let signo = m < 0 ? "-" : ""
        if h == 0 { return "\(signo)\(resto) m" }
        if resto == 0 { return "\(signo)\(h) h" }
        return "\(signo)\(h) h \(resto) m"
    }

    /// «6 h 10 m de 7 h 45 m» — productivo contra laborado.
    static func productividadPie(_ t: KpiTotales?) -> String {
        guard let t else { return "Sin horas registradas" }
        return "\(horas(t.minutosProductivos)) de \(horas(t.minutosLaborados))"
    }

    /// «5 días · 1 sin checar» — de qué se compone el total de horas.
    static func jornadasPie(_ t: KpiTotales?) -> String {
        let dias = t?.diasConJornada ?? 0
        var partes = ["\(dias) \(dias == 1 ? "día" : "días")"]
        let sinChecar = t?.diasSinChecada ?? 0
        let justificadas = t?.faltasJustificadas ?? 0
        if sinChecar > 0 { partes.append("\(sinChecar) sin checar") }
        if justificadas > 0 { partes.append("\(justificadas) justificada\(justificadas == 1 ? "" : "s")") }
        return partes.joined(separator: " · ")
    }

    /// «2 abiertas · 1 sin salida · 1 cerrada sola»; `nil` si no hay nada que decir.
    static func jornadasDetalle(_ t: KpiTotales?) -> String? {
        let abiertas = t?.jornadasAbiertas ?? 0
        let sinSalida = t?.jornadasSinSalida ?? 0
        let automaticos = t?.cierresAutomaticos ?? 0
        guard abiertas > 0 || sinSalida > 0 || automaticos > 0 else { return nil }
        var partes: [String] = []
        if abiertas > 0 { partes.append("\(abiertas) abierta\(abiertas == 1 ? "" : "s")") }
        if sinSalida > 0 { partes.append("\(sinSalida) sin salida") }
        if automaticos > 0 {
            let s = automaticos == 1 ? "" : "s"
            partes.append("\(automaticos) cerrada\(s) sola\(s)")
        }
        return partes.joined(separator: " · ")
    }

    /// «12 de 15 revisadas» · «Nadie ha revisado».
    static func uniformePie(_ t: KpiTotales?) -> String {
        guard let u = t?.uniforme, u.revisadas > 0 else { return "Nadie ha revisado" }
        return "\(u.ok) de \(u.revisadas) revisadas"
    }

    /// Lo que importa del tiempo extra es lo que nadie ha decidido todavía.
    static func extraPie(_ t: KpiTotales?) -> String {
        guard let t, t.minutosExtra != nil else { return "Sin horario fijo" }
        if t.minutosExtraPendientes > 0 {
            let dias = t.diasExtraPendientes
            let sufijo = dias > 0 ? " en \(dias) \(dias == 1 ? "día" : "días")" : ""
            return "\(horas(t.minutosExtraPendientes)) por aprobar\(sufijo)"
        }
        return t.minutosExtraAprobados > 0 ? "\(horas(t.minutosExtraAprobados)) aprobadas" : "Nada pendiente"
    }

    static func extraTono(_ t: KpiTotales?) -> CoreExtrasSemaforo {
        guard let t, t.minutosExtra != nil else { return .sinDatos }
        return t.minutosExtraPendientes > 0 ? .amarillo : .verde
    }

    // MARK: Tarjetas

    static func datosPersona(_ fila: KpiPersonaFila) -> [MoreDato] {
        datosPersona(fila.totales, confianzaDelApi: fila.confianza)
    }

    /// Disciplina de la tarjeta: el pilar (puntualidad graduada × registro, con el uniforme
    /// cuando pesa), como la columna de la web. Sin partes, el `disciplina.pct`.
    static func disciplinaDato(_ t: KpiTotales?) -> MoreDato {
        let pilar = pilares(t).first { $0.id == "disciplina" }
        let delPilar = pilar?.pct.map { Double($0) }
        let respaldo: Double? = (t?.disciplina?.esperados ?? 0) > 0 ? t?.disciplina?.pct : nil
        let valor = delPilar ?? respaldo
        let tono = (delPilar != nil ? pilar?.tono : nil) ?? tonoCumplimiento(valor)
        return MoreDato(etiqueta: "Disciplina", valor: indice(valor), pie: disciplinaPie(t), tono: tono.tono)
    }

    /// Los tres números que caben en una tarjeta de persona sin apretarla: índice (con su
    /// confianza; provisional con menos de 10 entregas), entregas y disciplina. Con la API
    /// vieja, puntualidad, productividad y horas.
    static func datosPersona(_ t: KpiTotales?, confianzaDelApi: KpiTextoFlexible? = nil) -> [MoreDato] {
        guard t?.traeCumplimiento == true else {
            return [
                MoreDato(etiqueta: "Puntualidad", valor: pct(puntualidadPct(t)), pie: puntualidadPie(t),
                         tono: tonoPuntualidad(t).tono),
                MoreDato(etiqueta: "Productividad", valor: pct(t?.productividadPct), pie: productividadPie(t),
                         tono: tonoProductividad(t?.productividadPct).tono),
                MoreDato(etiqueta: "Horas", valor: horas(t?.minutosLaborados), pie: jornadasPie(t), tono: .neutral),
            ]
        }
        let conf = confianza(t, delApi: confianzaDelApi)
        return [
            MoreDato(etiqueta: "Índice", valor: indice(t?.cumplimientoPct), pie: indicePie(t, confianza: conf),
                     tono: tonoIndice(t).tono),
            MoreDato(etiqueta: "Entregas", valor: entregasValor(t?.entregas), pie: entregasPie(t?.entregas),
                     tono: tonoCumplimiento(pctATiempo(t?.entregas)).tono),
            disciplinaDato(t),
        ]
    }

    /// Cómo va el equipo entero en el periodo. Con índice, la banda de la web: índice del
    /// equipo (cuántos con confianza alta), entregas a tiempo, tiempo en actividades (sin
    /// semáforo: mide reloj corriendo) y extra por decidir. Con la API vieja, la tira de
    /// siempre, con los cortes del API.
    static func datosEquipo(_ datos: KpisEquipoResumen) -> [MoreDato] {
        guard let t = datos.equipo?.totales else { return [] }
        guard t.traeCumplimiento else {
            return [
                MoreDato(etiqueta: "Puntualidad", valor: pct(puntualidadPct(t)), pie: puntualidadPie(t),
                         tono: tonoPuntualidad(t).tono),
                MoreDato(etiqueta: "Productividad", valor: pct(t.productividadPct), pie: productividadPie(t),
                         tono: tonoProductividad(t.productividadPct).tono),
                MoreDato(etiqueta: "Uniforme", valor: pct(t.uniforme?.pct), pie: uniformePie(t),
                         tono: tonoUniforme(t.uniforme?.pct).tono),
                MoreDato(etiqueta: "Tiempo extra", valor: horas(t.minutosExtra), pie: extraPie(t),
                         tono: extraTono(t).tono),
            ]
        }
        let e = t.entregas
        let medidas = e?.medidas ?? 0
        let altas = datos.personas.filter { confianza($0) == .alta }.count
        let entregasPieEquipo = medidas > 0
            ? "\(pct(pctATiempo(e))) · \(e?.sinEntregar ?? 0) sin entregar"
            : "Sin entregas que medir"
        let porDecidir = t.diasExtraPendientes > 0
        return [
            MoreDato(etiqueta: "Índice del equipo", valor: indice(t.cumplimientoPct),
                     pie: "\(plural(datos.personas.count, "persona", "personas")) · \(altas) con confianza alta",
                     tono: tonoIndice(t).tono),
            MoreDato(etiqueta: "Entregas a tiempo",
                     valor: medidas > 0 ? "\(e?.aTiempo ?? 0) de \(medidas)" : "—",
                     pie: entregasPieEquipo,
                     tono: tonoCumplimiento(pctATiempo(e)).tono),
            MoreDato(etiqueta: "Tiempo en actividades", valor: horas(t.minutosProductivos),
                     pie: "de \(horas(t.minutosLaborados)) en jornada · \(pct(t.productividadPct))", tono: .neutral),
            MoreDato(etiqueta: "Extra por decidir", valor: "\(t.diasExtraPendientes)",
                     pie: porDecidir ? "\(horas(t.minutosExtraPendientes)) sin aprobar" : "Todo decidido",
                     tono: porDecidir ? CoreExtrasSemaforo.amarillo.tono : CoreExtrasSemaforo.verde.tono),
        ]
    }
}
