import SwiftUI

/// KPIs del equipo (`/erp/asistencias/indicadores`) en iPhone.
///
/// La web pone una tabla de doce columnas por persona. Aquí es una lista
/// agrupada de iOS: arriba un `Picker` segmentado para el corte del periodo,
/// luego cómo va el equipo entero, y después una sección por persona en
/// `DisclosureGroup` —cerrada enseña el semáforo y lo justo, abierta el
/// detalle—. Las personas se ordenan de peor a mejor: en una lista de una
/// columna, quien está en rojo tiene que salir primero o nadie lo ve.
///
/// El orden y las cuentas son los mismos que en Android; la **forma** no, y a
/// propósito: `LabeledContent` en lista agrupada es lo que un iPhone hace con
/// pares etiqueta-valor, y aguanta la letra grande sin cortar nada.
struct KpisEquipoView: View {
    /// Cortes del periodo. Se quedan en tres: más opciones en un segmentado se
    /// vuelven ilegibles, y estos tres son los que se usan.
    private enum Periodo: String, CaseIterable, Identifiable {
        case hoy = "Hoy"
        case semana = "7 días"
        case mes = "30 días"

        var id: String { rawValue }
        var dias: Int {
            switch self {
            case .hoy: return 1
            case .semana: return 7
            case .mes: return 30
            }
        }
    }

    @State private var estado = CoreExtrasEstado<KpisEquipoResumen>()
    @State private var periodo: Periodo = .semana
    @State private var busqueda = ""

    private var personas: [KpiPersonaFila] {
        let todas = estado.datos?.personas ?? []
        let q = busqueda.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let filtradas = q.isEmpty ? todas : todas.filter { fila in
            [fila.persona?.nombre, fila.persona?.puesto, fila.persona?.email]
                .compactMap { $0?.lowercased() }
                .contains { $0.contains(q) }
        }
        // Primero lo que está mal; dentro de un nivel, por nombre.
        return filtradas.sorted { a, b in
            let pa = KpisEquipoView.peso(CoreExtrasSemaforo(a.semaforo))
            let pb = KpisEquipoView.peso(CoreExtrasSemaforo(b.semaforo))
            if pa != pb { return pa < pb }
            return (a.persona?.nombre ?? "").localizedCaseInsensitiveCompare(b.persona?.nombre ?? "")
                == .orderedAscending
        }
    }

    private static func peso(_ s: CoreExtrasSemaforo) -> Int {
        switch s {
        case .rojo: return 0
        case .amarillo: return 1
        case .verde: return 2
        case .sinDatos: return 3
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Periodo", selection: $periodo) {
                    ForEach(Periodo.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }

            if let aviso = estado.avisoDesactualizado {
                Section { CoreExtrasAvisoDesactualizado(mensaje: aviso) }
            }

            if estado.mostrandoEsqueleto {
                Section { CoreExtrasCargando() }
            }

            if let datos = estado.datos {
                seccionDelEquipo(datos)
                seccionDePersonas(total: datos.personas.count)
                if !datos.supuestos.isEmpty {
                    Section("Cómo se calculan estos números") {
                        ForEach(datos.supuestos, id: \.self) { texto in
                            Text(texto).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section {
                CoreExtrasNotaDeAlcance(
                    texto: "Consulta del periodo. Aprobar tiempo extra y descargar el Excel se hacen desde la computadora."
                )
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("KPIs del equipo")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $busqueda, prompt: "Buscar a alguien del equipo")
        .refreshable { await cargar() }
        .overlay {
            if let error = estado.error, !estado.hayDatos {
                CoreExtrasError(mensaje: error) { Task { await cargar() } }
            }
        }
        .task(id: periodo) {
            // Cambiar de periodo es pedir otra cosa, no refrescar la misma: se
            // descarta lo anterior para que no se lea como si fuera del nuevo.
            await cargar(descartando: true)
        }
    }

    // MARK: Secciones

    @ViewBuilder
    private func seccionDelEquipo(_ datos: KpisEquipoResumen) -> some View {
        let semaforo = CoreExtrasSemaforo(datos.equipo?.semaforo)
        let totales = datos.equipo?.totales
        Section {
            LabeledContent(datos.alcanceTexto) {
                CoreExtrasSemaforoBadge(semaforo: semaforo)
            }
            CoreExtrasDatoFila(
                etiqueta: "Puntualidad",
                valor: CoreExtrasFormato.pct(KpisEquipoView.puntualidad(totales)),
                pie: KpisEquipoView.puntualidadPie(totales),
                semaforo: .dePorcentaje(KpisEquipoView.puntualidad(totales))
            )
            CoreExtrasDatoFila(
                etiqueta: "Productividad",
                valor: CoreExtrasFormato.pct(totales?.productividadPct),
                pie: "\(CoreExtrasFormato.horas(totales?.minutosProductivos)) de \(CoreExtrasFormato.horas(totales?.minutosLaborados))",
                semaforo: .dePorcentaje(totales?.productividadPct)
            )
            CoreExtrasDatoFila(
                etiqueta: "Uniforme",
                valor: CoreExtrasFormato.pct(totales?.uniforme?.pct),
                pie: KpisEquipoView.uniformePie(totales),
                semaforo: .dePorcentaje(totales?.uniforme?.pct)
            )
            CoreExtrasDatoFila(
                etiqueta: "Tiempo extra",
                valor: CoreExtrasFormato.horas(totales?.minutosExtra),
                pie: KpisEquipoView.extraPie(totales),
                semaforo: KpisEquipoView.extraSemaforo(totales)
            )
            ForEach(datos.equipo?.motivos ?? [], id: \.self) { motivo in
                Text(motivo).font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            Text("El equipo")
        } footer: {
            Text("\(datos.personas.count) personas · del \(datos.desde) al \(datos.hasta)")
        }
    }

    @ViewBuilder
    private func seccionDePersonas(total: Int) -> some View {
        Section {
            if personas.isEmpty {
                if busqueda.isEmpty {
                    Text("Nadie en tu alcance en este periodo.")
                        .foregroundStyle(.secondary)
                } else {
                    Text("Nadie coincide con «\(busqueda)».")
                        .foregroundStyle(.secondary)
                }
            } else {
                ForEach(personas) { fila in
                    filaDePersona(fila)
                }
            }
        } header: {
            Text(busqueda.isEmpty ? "Persona por persona" : "\(personas.count) de \(total)")
        } footer: {
            if !personas.isEmpty {
                Text("De peor a mejor, para no tener que buscarlo.")
            }
        }
    }

    /// Cerrada: quién es y cómo va. Abierta: el resto de sus números y por qué
    /// su semáforo está en ese color.
    @ViewBuilder
    private func filaDePersona(_ fila: KpiPersonaFila) -> some View {
        let semaforo = CoreExtrasSemaforo(fila.semaforo)
        let totales = fila.totales
        DisclosureGroup {
            CoreExtrasDatoFila(
                etiqueta: "Puntualidad",
                valor: CoreExtrasFormato.pct(KpisEquipoView.puntualidad(totales)),
                pie: KpisEquipoView.puntualidadPie(totales),
                semaforo: .dePorcentaje(KpisEquipoView.puntualidad(totales))
            )
            CoreExtrasDatoFila(
                etiqueta: "Productividad",
                valor: CoreExtrasFormato.pct(totales?.productividadPct),
                pie: "\(CoreExtrasFormato.horas(totales?.minutosProductivos)) de \(CoreExtrasFormato.horas(totales?.minutosLaborados))",
                semaforo: .dePorcentaje(totales?.productividadPct)
            )
            CoreExtrasDatoFila(
                etiqueta: "Horas laboradas",
                valor: CoreExtrasFormato.horas(totales?.minutosLaborados),
                pie: KpisEquipoView.jornadasPie(totales)
            )
            CoreExtrasDatoFila(
                etiqueta: "Tiempo extra",
                valor: CoreExtrasFormato.horas(totales?.minutosExtra),
                pie: KpisEquipoView.extraPie(totales),
                semaforo: KpisEquipoView.extraSemaforo(totales)
            )
            CoreExtrasDatoFila(
                etiqueta: "Inactividad",
                valor: CoreExtrasFormato.horas(totales?.minutosInactivos)
            )
            if let horario = fila.horario?.etiqueta, !horario.isEmpty {
                LabeledContent("Horario", value: horario)
            }
            ForEach(fila.motivos, id: \.self) { motivo in
                Text(motivo).font(.footnote).foregroundStyle(.secondary)
            }
        } label: {
            HStack(spacing: 12) {
                CoreExtrasAvatar(
                    nombre: fila.persona?.nombre ?? "",
                    url: fila.persona?.avatarUrl
                )
                VStack(alignment: .leading, spacing: 2) {
                    Text(fila.persona?.nombre.nilSiVacio ?? "Sin nombre")
                        .font(.body.weight(.semibold))
                    if let puesto = fila.persona?.puesto?.nilSiVacio {
                        Text(puesto).font(.caption).foregroundStyle(.secondary)
                    }
                    CoreExtrasSemaforoBadge(semaforo: semaforo)
                }
            }
            .padding(.vertical, 2)
        }
    }

    // MARK: Textos

    /// De los días con jornada, cuántos sin retardo. `nil` sin un día que contar
    /// — que no es 100 %.
    static func puntualidad(_ t: KpiTotales?) -> Double? {
        guard let t, t.diasConJornada > 0 else { return nil }
        let retardos = min(max(t.retardos, 0), t.diasConJornada)
        return Double(t.diasConJornada - retardos) * 100.0 / Double(t.diasConJornada)
    }

    static func puntualidadPie(_ t: KpiTotales?) -> String {
        guard let t, t.diasConJornada > 0 else { return "Sin días con jornada" }
        guard t.retardos > 0 else {
            return "Sin retardos en \(t.diasConJornada) \(t.diasConJornada == 1 ? "día" : "días")"
        }
        let etiqueta = t.retardos == 1 ? "1 retardo" : "\(t.retardos) retardos"
        return t.minutosTarde > 0 ? "\(etiqueta) · \(CoreExtrasFormato.horas(t.minutosTarde)) tarde" : etiqueta
    }

    static func jornadasPie(_ t: KpiTotales?) -> String {
        guard let t else { return "Sin días registrados" }
        var partes = ["\(t.diasConJornada) \(t.diasConJornada == 1 ? "día" : "días")"]
        if t.diasSinChecada > 0 { partes.append("\(t.diasSinChecada) sin checar") }
        if t.faltasJustificadas > 0 {
            partes.append("\(t.faltasJustificadas) justificada\(t.faltasJustificadas == 1 ? "" : "s")")
        }
        return partes.joined(separator: " · ")
    }

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
            return "\(CoreExtrasFormato.horas(t.minutosExtraPendientes)) por aprobar\(sufijo)"
        }
        return t.minutosExtraAprobados > 0
            ? "\(CoreExtrasFormato.horas(t.minutosExtraAprobados)) aprobadas"
            : "Nada pendiente"
    }

    static func extraSemaforo(_ t: KpiTotales?) -> CoreExtrasSemaforo {
        guard let t, t.minutosExtra != nil else { return .sinDatos }
        return t.minutosExtraPendientes > 0 ? .amarillo : .verde
    }

    // MARK: Carga

    private func cargar(descartando: Bool = false) async {
        if descartando { estado.datos = nil }
        estado.empezar()
        let rango = CoreExtrasFormato.rango(dias: periodo.dias)
        do {
            let datos = try await CoreExtrasRepository.shared.kpisEquipo(
                desde: rango.desde,
                hasta: rango.hasta
            )
            estado.exito(datos)
        } catch {
            estado.fallo(error.toUserMessage(fallback: "No se pudieron cargar los KPIs del equipo"))
        }
    }
}
