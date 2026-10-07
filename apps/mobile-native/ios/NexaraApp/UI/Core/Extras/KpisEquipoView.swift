import SwiftUI

/// KPIs del equipo (`/erp/asistencias/indicadores`) en iPhone — Android
/// `KpisEquipoScreen`.
///
/// La web pone una tabla de doce columnas por persona. Aquí arriba va el rango
/// (Hoy · Semana · Mes, el mismo de la pizarra), luego cómo va el equipo entero
/// y después una tarjeta por persona con su semáforo y tres números; el resto
/// sale al tocarla. Desde el 07-10 las personas van por cumplimiento en tiempo y
/// forma, del que más cumple al que menos (Adam quiere ver quién entrega a
/// tiempo); el semáforo sigue en cada tarjeta. Con la API vieja, sin
/// cumplimiento, se queda el orden de antes: de peor a mejor.
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

/// Una persona. Cerrada enseña nombre, puesto, semáforo y tres números
/// (cumplimiento, entregas y puntualidad; con la API vieja, puntualidad,
/// productividad y horas); abierta, de qué sale su cumplimiento, el tiempo en
/// actividades, las horas, el uniforme, el tiempo extra, las jornadas sin cerrar
/// y por qué su semáforo está en ese color.
private struct TarjetaDePersonaKpi: View {
    let fila: KpiPersonaFila
    @State private var abierta = false

    var body: some View {
        let semaforo = CoreExtrasSemaforo(fila.semaforo)
        let nombre = fila.persona?.nombre.nilSiVacio ?? "Sin nombre"
        let totales = fila.totales
        MoreTarjeta(onClick: { withAnimation(.easeInOut(duration: 0.2)) { abierta.toggle() } }) {
            HStack(alignment: .center, spacing: 10) {
                NxAvatar(nombre: nombre, url: fila.persona?.avatarUrl, size: 40)
                VStack(alignment: .leading, spacing: 0) {
                    Text(nombre)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    if let subtitulo = fila.persona?.puesto?.nilSiVacio ?? fila.horario?.etiqueta.nilSiVacio {
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

            MoreRejillaDeDatos(datos: KpisEquipoRules.datosPersona(totales), columnas: 3)

            if abierta {
                VStack(alignment: .leading, spacing: NxSpacing.s) {
                    // De qué sale el cumplimiento (cada parte que mande el API, con su dato y
                    // lo que pesa), el tiempo en actividades y las horas. Con la API vieja no
                    // hay nada: esos números siguen en la tarjeta.
                    ForEach(Array(KpisEquipoRules.lineasDesplegadas(totales).enumerated()), id: \.offset) { _, linea in
                        DetalleLineaKpi(etiqueta: linea.etiqueta, valor: linea.valor)
                    }
                    DetalleLineaKpi(etiqueta: "Horario", valor: fila.horario?.etiqueta.nilSiVacio ?? "Sin horario")
                    DetalleLineaKpi(
                        etiqueta: "Uniforme",
                        valor: "\(KpisEquipoRules.pct(totales?.uniforme?.pct)) · \(KpisEquipoRules.uniformePie(totales))"
                    )
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

/// Los números del equipo ya masticados para pintar. Lo que el API no manda sale
/// «—»; no se inventa un cero, que parece un dato y no lo es.
enum KpisEquipoRules {
    static let limite = "Consulta del periodo. Aprobar tiempo extra y descargar el Excel se hacen desde la computadora."

    private static func peso(_ s: CoreExtrasSemaforo) -> Int {
        switch s {
        case .rojo: return 0
        case .amarillo: return 1
        case .verde: return 2
        case .sinDatos: return 3
        }
    }

    /// Con el cumplimiento del API (07-10): por cumplimiento. Con la API vieja, como
    /// antes: primero lo que está mal y, dentro de un nivel, por nombre.
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

    /// ¿El API ya manda el cumplimiento? Basta con que alguna fila traiga la clave.
    static func ordenaPorCumplimiento(_ personas: [KpiPersonaFila]) -> Bool {
        personas.contains { $0.totales?.traeCumplimiento == true }
    }

    /// Web `ordenaRanking(…, "cumplimiento")`: mayor cumplimiento arriba y sin dato al
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
            ? "Por cumplimiento, de mayor a menor"
            : "De peor a mejor, para no tener que buscarlo"
    }

    /// Cumplimiento en tiempo y forma (los cortes del semáforo de entregas del API):
    /// verde ≥ 90, ámbar ≥ 75, rojo debajo; gris sin dato.
    static func tonoCumplimiento(_ valor: Double?) -> CoreExtrasSemaforo {
        guard let valor, valor.isFinite else { return .sinDatos }
        if valor >= 90 { return .verde }
        if valor >= 75 { return .amarillo }
        return .rojo
    }

    private static func plural(_ n: Int, _ uno: String, _ varios: String) -> String {
        "\(n) \(n == 1 ? uno : varios)"
    }

    /// Pie del cumplimiento del equipo: «17 de 18 entregas a tiempo · 0 devueltas».
    static func entregasDelEquipo(_ e: KpiEntregas?) -> String {
        guard let e, e.medidas > 0 else { return "Sin entregas en estas fechas" }
        return "\(e.aTiempo) de \(plural(e.medidas, "entrega", "entregas")) a tiempo · "
            + plural(e.devueltas, "devuelta", "devueltas")
    }

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

    /// Sin entregas no hay cumplimiento (el API lo manda nulo).
    static func cumplimientoPie(_ t: KpiTotales?) -> String {
        t?.cumplimientoPct == nil ? "Sin entregas" : "En tiempo y forma"
    }

    /// «92 h de 189 h en jornada» (web): lo que es, tiempo con el reloj corriendo.
    static func tiempoEnActividadesPie(_ t: KpiTotales?) -> String {
        guard let t else { return productividadPie(nil) }
        let productivas = Int((Double(t.minutosProductivos) / 60).rounded())
        let laboradas = Int((Double(t.minutosLaborados) / 60).rounded())
        return "\(productivas) h de \(laboradas) h en jornada"
    }

    /// Un renglón de lo desplegado: etiqueta a la izquierda, lo que dice a la derecha.
    struct Linea: Hashable {
        let etiqueta: String
        let valor: String
    }

    /// «40» · «12.5»: el peso como viene, sin decimales de más.
    private static func numeroCorto(_ valor: Double) -> String {
        let decimas = (valor * 10).rounded()
        guard abs(decimas) < 1e12 else { return "—" }
        let entero = Int(decimas)
        return entero % 10 == 0 ? "\(entero / 10)" : "\(entero / 10).\(abs(entero % 10))"
    }

    /// De qué está hecho el cumplimiento, una parte por renglón: «Entregas a tiempo» →
    /// «17 de 18 · 94 % · pesa 40 %». Se recorre la lista que mande el API tal cual: ni
    /// cuántas partes son, ni sus claves, ni sus pesos están escritos aquí. Una parte
    /// sin etiqueta se nombra por su clave; sin ninguna de las dos, no se pinta.
    static func partesCumplimiento(_ t: KpiTotales?) -> [Linea] {
        (t?.cumplimientoPartes ?? []).compactMap { p -> Linea? in
            guard let etiqueta = p.etiqueta.nilSiVacio ?? ActividadesTexto.humanizar(p.clave).nilSiVacio else {
                return nil
            }
            var partes: [String] = []
            if let detalle = p.detalle.nilSiVacio { partes.append(detalle) }
            if let valor = p.pct, valor.isFinite { partes.append(pct(valor)) }
            if let peso = p.peso, peso.isFinite { partes.append("pesa \(numeroCorto(peso)) %") }
            return Linea(etiqueta: etiqueta, valor: partes.isEmpty ? "—" : partes.joined(separator: " · "))
        }
    }

    /// Lo que sale al desplegar la tarjeta, antes del horario y el uniforme: con
    /// cumplimiento, sus partes, el tiempo en actividades y las horas (lo que antes eran
    /// dos de los tres números de la tarjeta). Con la API vieja, nada.
    static func lineasDesplegadas(_ t: KpiTotales?) -> [Linea] {
        guard let t, t.traeCumplimiento else { return [] }
        return partesCumplimiento(t) + [
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

    /// De los días con jornada, cuántos sin retardo. `nil` sin un día que contar
    /// — que no es 100 %.
    static func puntualidadPct(_ t: KpiTotales?) -> Double? {
        guard let t, t.diasConJornada > 0 else { return nil }
        let retardos = min(max(t.retardos, 0), t.diasConJornada)
        return Double(t.diasConJornada - retardos) * 100.0 / Double(t.diasConJornada)
    }

    static func puntualidadPie(_ t: KpiTotales?) -> String {
        let dias = t?.diasConJornada ?? 0
        guard dias > 0 else { return "Sin días con jornada" }
        let retardos = t?.retardos ?? 0
        guard retardos > 0 else { return "Sin retardos en \(dias) \(dias == 1 ? "día" : "días")" }
        let etiqueta = retardos == 1 ? "1 retardo" : "\(retardos) retardos"
        let tarde = t?.minutosTarde ?? 0
        return tarde > 0 ? "\(etiqueta) · \(horas(tarde)) tarde" : etiqueta
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

    /// Los tres números que caben en una tarjeta de persona sin apretarla: con el
    /// cumplimiento del API, cumplimiento, entregas y puntualidad; con la API vieja,
    /// puntualidad, productividad y horas (el tiempo en actividades y las horas pasan
    /// a lo que se ve al desplegar).
    static func datosPersona(_ t: KpiTotales?) -> [MoreDato] {
        let puntualidad = puntualidadPct(t)
        if t?.traeCumplimiento == true {
            return [
                MoreDato(etiqueta: "Cumplimiento", valor: pct(t?.cumplimientoPct), pie: cumplimientoPie(t),
                         tono: tonoCumplimiento(t?.cumplimientoPct).tono),
                MoreDato(etiqueta: "Entregas", valor: entregasValor(t?.entregas), pie: entregasPie(t?.entregas),
                         tono: tonoCumplimiento(pctATiempo(t?.entregas)).tono),
                MoreDato(etiqueta: "Puntualidad", valor: pct(puntualidad), pie: puntualidadPie(t),
                         tono: CoreExtrasSemaforo.dePorcentaje(puntualidad).tono),
            ]
        }
        return [
            MoreDato(etiqueta: "Puntualidad", valor: pct(puntualidad), pie: puntualidadPie(t),
                     tono: CoreExtrasSemaforo.dePorcentaje(puntualidad).tono),
            MoreDato(etiqueta: "Productividad", valor: pct(t?.productividadPct), pie: productividadPie(t),
                     tono: CoreExtrasSemaforo.dePorcentaje(t?.productividadPct).tono),
            MoreDato(etiqueta: "Horas", valor: horas(t?.minutosLaborados), pie: jornadasPie(t), tono: .neutral),
        ]
    }

    /// Cómo va el equipo entero en el periodo. Con el cumplimiento del API: cumplimiento,
    /// puntualidad, tiempo en actividades (sin semáforo: mide reloj corriendo, no si
    /// entregó a tiempo), uniforme y tiempo extra. Con la API vieja, la tira de siempre.
    static func datosEquipo(_ datos: KpisEquipoResumen) -> [MoreDato] {
        guard let t = datos.equipo?.totales else { return [] }
        let puntualidad = puntualidadPct(t)
        if t.traeCumplimiento {
            return [
                MoreDato(etiqueta: "Cumplimiento", valor: pct(t.cumplimientoPct), pie: entregasDelEquipo(t.entregas),
                         tono: tonoCumplimiento(t.cumplimientoPct).tono),
                MoreDato(etiqueta: "Puntualidad", valor: pct(puntualidad), pie: puntualidadPie(t),
                         tono: CoreExtrasSemaforo.dePorcentaje(puntualidad).tono),
                MoreDato(etiqueta: "Tiempo en actividades", valor: pct(t.productividadPct),
                         pie: tiempoEnActividadesPie(t), tono: .neutral),
                MoreDato(etiqueta: "Uniforme", valor: pct(t.uniforme?.pct), pie: uniformePie(t),
                         tono: CoreExtrasSemaforo.dePorcentaje(t.uniforme?.pct).tono),
                MoreDato(etiqueta: "Tiempo extra", valor: horas(t.minutosExtra), pie: extraPie(t),
                         tono: extraTono(t).tono),
            ]
        }
        return [
            MoreDato(etiqueta: "Puntualidad", valor: pct(puntualidad), pie: puntualidadPie(t),
                     tono: CoreExtrasSemaforo.dePorcentaje(puntualidad).tono),
            MoreDato(etiqueta: "Productividad", valor: pct(t.productividadPct), pie: productividadPie(t),
                     tono: CoreExtrasSemaforo.dePorcentaje(t.productividadPct).tono),
            MoreDato(etiqueta: "Uniforme", valor: pct(t.uniforme?.pct), pie: uniformePie(t),
                     tono: CoreExtrasSemaforo.dePorcentaje(t.uniforme?.pct).tono),
            MoreDato(etiqueta: "Tiempo extra", valor: horas(t.minutosExtra), pie: extraPie(t),
                     tono: extraTono(t).tono),
        ]
    }
}
