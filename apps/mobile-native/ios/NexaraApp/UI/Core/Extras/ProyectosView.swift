import SwiftUI

/// Proyectos (`/erp/proyectos`) en iPhone.
///
/// La web trae una tabla con nueve columnas. Aquí es una lista agrupada con un
/// `Picker` segmentado arriba para el corte, y en cada fila la jerarquía
/// invertida respecto de la tabla: primero **la salud** —el semáforo que pidió
/// dirección—, luego cuánto va, qué toca (el próximo hito) y al final cliente y
/// responsable. El orden pone arriba lo que va tarde: en una lista de una
/// columna nadie baja hasta la fila catorce a buscarlo.
struct ProyectosView: View {
    /// Cortes de la lista. El de entrada es «Activos», que es lo que se mira a
    /// diario; los cerrados casi nunca, y por eso no estorban de salida.
    enum Corte: String, CaseIterable, Identifiable {
        case atencion = "Atención"
        case activos = "Activos"
        case todos = "Todos"
        case cerrados = "Cerrados"

        var id: String { rawValue }
    }

    @State private var estado = CoreExtrasEstado<[ProyectoResumenFila]>()
    @State private var corte: Corte = .activos
    @State private var busqueda = ""

    private var visibles: [ProyectoResumenFila] {
        let todos = estado.datos ?? []
        let q = busqueda.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return todos
            .filter { ProyectosView.cumple($0, corte) }
            .filter { proyecto in
                q.isEmpty || [proyecto.title, proyecto.client?.name, proyecto.responsable?.nombre]
                    .compactMap { $0?.lowercased() }
                    .contains { $0.contains(q) }
            }
            .sorted { a, b in
                let pa = ProyectosView.peso(a)
                let pb = ProyectosView.peso(b)
                if pa != pb { return pa < pb }
                return a.title.localizedCaseInsensitiveCompare(b.title) == .orderedAscending
            }
    }

    var body: some View {
        List {
            Section {
                Picker("Corte", selection: $corte) {
                    ForEach(Corte.allCases) { Text($0.rawValue).tag($0) }
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

            if estado.hayDatos {
                Section {
                    if visibles.isEmpty {
                        vacio
                    } else {
                        ForEach(visibles) { proyecto in
                            fila(proyecto)
                        }
                    }
                } header: {
                    Text(corte.rawValue)
                } footer: {
                    if !visibles.isEmpty {
                        Text("\(visibles.count) \(visibles.count == 1 ? "proyecto" : "proyectos") · primero lo que va tarde.")
                    }
                }
            }

            Section {
                CoreExtrasNotaDeAlcance(
                    texto: "Consulta. Crear proyectos, mover hitos y subir documentos se hacen desde la computadora."
                )
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Proyectos")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $busqueda, prompt: "Buscar por proyecto, cliente o responsable")
        .refreshable { await cargar() }
        .overlay {
            if let error = estado.error, !estado.hayDatos {
                CoreExtrasError(mensaje: error) { Task { await cargar() } }
            }
        }
        .task { if !estado.hayDatos { await cargar() } }
    }

    @ViewBuilder
    private var vacio: some View {
        if (estado.datos ?? []).isEmpty {
            Text("Todavía no hay proyectos dados de alta en esta empresa.")
                .foregroundStyle(.secondary)
        } else if !busqueda.isEmpty {
            Text("Ningún proyecto coincide con «\(busqueda)».")
                .foregroundStyle(.secondary)
        } else if corte == .atencion {
            Text("Ningún proyecto está retrasado ni en riesgo. Buena señal.")
                .foregroundStyle(.secondary)
        } else {
            Text("No hay proyectos en este corte.")
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func fila(_ proyecto: ProyectoResumenFila) -> some View {
        let semaforo = ProyectosView.semaforo(proyecto)
        let avance = proyecto.resumen?.avance?.porcentaje
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(proyecto.title).font(.body.weight(.semibold))
                    Text(proyecto.contextoTexto).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                CoreExtrasSemaforoBadge(
                    semaforo: semaforo,
                    texto: ProyectosView.etiquetaSalud(proyecto)
                )
            }

            CoreExtrasBarra(
                valor: avance.map { Double($0) / 100 },
                etiqueta: (avance.map { "\($0) % · " } ?? "Avance desconocido · ")
                    + (proyecto.resumen?.avance?.texto ?? "Sin avance que calcular"),
                color: semaforo == .sinDatos ? NxBrand.primary : semaforo.color
            )

            HStack(spacing: 8) {
                Text(ProyectosView.plazoTexto(proyecto))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(semaforo == .rojo || semaforo == .amarillo ? semaforo.color : .secondary)
                Spacer(minLength: 4)
                if proyecto.equipoCount > 0 {
                    Text("\(proyecto.equipoCount) en el equipo")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if let hito = ProyectosView.proximoHitoTexto(proyecto) {
                Label(hito, systemImage: "flag")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let req = proyecto.resumen?.requerimientos, req.total > 0 {
                Text("Requerimientos: \(req.cumplidos) de \(req.total) cumplidos")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    // MARK: Reglas

    /// `SaludProyecto` del servidor (`apps/api/src/projects/proyecto-salud.ts`).
    static func semaforo(_ proyecto: ProyectoResumenFila) -> CoreExtrasSemaforo {
        switch (proyecto.resumen?.salud ?? "").uppercased() {
        case "RETRASADO": return .rojo
        case "EN_RIESGO": return .amarillo
        case "EN_TIEMPO", "TERMINADO": return .verde
        default: return .sinDatos
        }
    }

    /// La etiqueta del servidor si viene; si no, una nuestra. Un estado que la
    /// app no conoce no se pinta como si fuera bueno.
    static func etiquetaSalud(_ proyecto: ProyectoResumenFila) -> String {
        if let etiqueta = proyecto.resumen?.etiqueta.nilSiVacio { return etiqueta }
        switch (proyecto.resumen?.salud ?? "").uppercased() {
        case "RETRASADO": return "Retrasado"
        case "EN_RIESGO": return "En riesgo"
        case "EN_TIEMPO": return "En tiempo"
        case "PLANEADO": return "Planeado"
        case "SIN_PLAN": return "Sin fecha de fin"
        case "TERMINADO": return "Terminado"
        case "CANCELADO": return "Cancelado"
        default: return "Sin clasificar"
        }
    }

    /// Lo que arde primero.
    static func peso(_ proyecto: ProyectoResumenFila) -> Int {
        switch (proyecto.resumen?.salud ?? "").uppercased() {
        case "RETRASADO": return 0
        case "EN_RIESGO": return 1
        case "SIN_PLAN": return 2
        case "EN_TIEMPO": return 3
        case "PLANEADO": return 4
        case "TERMINADO": return 6
        case "CANCELADO": return 7
        default: return 5
        }
    }

    static func cumple(_ proyecto: ProyectoResumenFila, _ corte: Corte) -> Bool {
        let salud = (proyecto.resumen?.salud ?? "").uppercased()
        let cerrado = salud == "TERMINADO" || salud == "CANCELADO"
        switch corte {
        case .todos: return true
        case .atencion:
            return salud == "RETRASADO" || salud == "EN_RIESGO" || proyecto.resumen?.enRiesgo == true
        case .activos: return !cerrado
        case .cerrados: return cerrado
        }
    }

    /// «Retrasado 6 días» · «Quedan 3 días» · el motivo del servidor. Es la línea
    /// que se puede enseñar al cliente sin traducir nada.
    static func plazoTexto(_ proyecto: ProyectoResumenFila) -> String {
        guard let r = proyecto.resumen else { return "Sin plan de fechas" }
        if r.diasDeRetraso > 0 {
            return "Retrasado \(r.diasDeRetraso) \(r.diasDeRetraso == 1 ? "día" : "días")"
        }
        if let faltan = r.diasRestantes {
            if faltan <= 0 { return "Vence hoy" }
            if faltan == 1 { return "Queda 1 día" }
            return "Quedan \(faltan) días"
        }
        return r.motivo.nilSiVacio ?? "Sin fecha de fin"
    }

    /// «Próximo: Entrega · 25 sep» · `nil` si no hay cronograma.
    static func proximoHitoTexto(_ proyecto: ProyectoResumenFila) -> String? {
        guard let hito = proyecto.proximoHito, let nombre = hito.name.nilSiVacio else { return nil }
        if let fecha = CoreExtrasFormato.fechaCorta(hito.plannedDate) {
            return "Próximo: \(nombre) · \(fecha)"
        }
        return "Próximo: \(nombre)"
    }

    // MARK: Carga

    private func cargar() async {
        estado.empezar()
        do {
            estado.exito(try await CoreExtrasRepository.shared.proyectos())
        } catch {
            estado.fallo(error.toUserMessage(fallback: "No se pudieron cargar los proyectos"))
        }
    }
}
