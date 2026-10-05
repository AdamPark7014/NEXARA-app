import SwiftUI

/// Proyectos (`/erp/proyectos`) en iPhone — Android `ProyectosScreen`.
///
/// La web trae una tabla con nueve columnas. Aquí cada proyecto es una tarjeta
/// con la jerarquía invertida respecto de la tabla: primero **la salud** —el
/// semáforo que pidió dirección—, luego cuánto va, qué toca (el próximo hito) y
/// al final cliente y responsable. El orden pone arriba lo que va tarde.
struct ProyectosView: View {
    @State private var estado = CoreExtrasEstado<[ProyectoResumenFila]>()
    @State private var filtro: ProyectosRules.Filtro = .activos
    @State private var consulta = ""

    private var todos: [ProyectoResumenFila] { estado.datos ?? [] }

    var body: some View {
        let visibles = ProyectosRules.aplicar(todos, filtro: filtro, consulta: consulta)
        let conteos = ProyectosRules.conteos(todos)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: NxSpacing.m) {
                FilaDePastillasDeConsulta(pastillas: ProyectosRules.Filtro.allCases.map { opcion in
                    PastillaDeConsulta(
                        etiqueta: opcion.etiqueta,
                        conteo: conteos[opcion],
                        seleccionada: opcion == filtro,
                        onClick: { filtro = opcion }
                    )
                })

                if let aviso = estado.avisoDesactualizado {
                    MoreAvisoDesactualizado(mensaje: aviso) { estado.avisoDesactualizado = nil }
                }

                if estado.mostrandoEsqueleto {
                    NxSkeletonList(itemCount: 4, itemHeight: 136)
                }

                if let error = estado.error, !estado.hayDatos {
                    NxErrorBlock(message: error, onRetry: { Task { await cargar() } })
                }

                if estado.hayDatos {
                    if todos.count > 6 {
                        NxSearchField(text: $consulta, placeholder: "Buscar por proyecto, cliente o responsable")
                    }
                    if visibles.isEmpty {
                        vacio
                    } else {
                        MoreCabecera(
                            titulo: filtro.etiqueta,
                            subtitulo: "Primero lo que va tarde",
                            trailing: "\(visibles.count)"
                        )
                        ForEach(visibles) { TarjetaDeProyecto(proyecto: $0) }
                    }
                }

                MoreNotaDeAlcance(texto: ProyectosRules.limite)
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .refreshable { await cargar() }
        .task { if !estado.hayDatos { await cargar() } }
    }

    @ViewBuilder
    private var vacio: some View {
        if todos.isEmpty {
            NxEmptyState(
                title: "Sin proyectos",
                subtitle: "Todavía no hay proyectos dados de alta en esta empresa."
            )
        } else if !consulta.trimmingCharacters(in: .whitespaces).isEmpty {
            NxEmptyState(
                title: "Sin coincidencias",
                subtitle: "Ningún proyecto coincide con «\(consulta)».",
                actionLabel: "Limpiar búsqueda",
                onAction: { consulta = "" }
            )
        } else {
            NxEmptyState(
                title: "Nada en «\(filtro.etiqueta.lowercased())»",
                subtitle: filtro == .atencion
                    ? "Ningún proyecto está retrasado ni en riesgo. Buena señal."
                    : "No hay proyectos en este filtro.",
                actionLabel: "Ver todos",
                onAction: { filtro = .todos }
            )
        }
    }

    private func cargar() async {
        estado.empezar()
        do {
            estado.exito(try await CoreExtrasRepository.shared.proyectos())
        } catch {
            estado.fallo(error.toUserMessage(fallback: "No se pudieron cargar los proyectos"))
        }
    }
}

/// Un proyecto: salud arriba, qué toca en medio, contexto abajo.
private struct TarjetaDeProyecto: View {
    let proyecto: ProyectoResumenFila

    var body: some View {
        let tono = ProyectosRules.tono(ProyectosRules.salud(proyecto.resumen?.salud))
        let avance = proyecto.resumen?.avance?.porcentaje
        MoreTarjeta {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(proyecto.title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(3)
                    Text(proyecto.contextoTexto)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                NxStatusChip(text: ProyectosRules.etiquetaSalud(proyecto), tone: tono)
            }

            MoreBarra(
                progreso: avance.map { Double($0) / 100 },
                etiqueta: (avance.map { "\($0) % · " } ?? "Avance desconocido · ")
                    + (proyecto.resumen?.avance?.texto ?? "Sin avance que calcular"),
                tono: tono
            )

            HStack(alignment: .center, spacing: NxSpacing.s) {
                Text(ProyectosRules.plazoTexto(proyecto))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(tono == .danger || tono == .warning ? tono.fg : NxColors.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if proyecto.equipoCount > 0 {
                    Text("\(proyecto.equipoCount) en el equipo")
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                }
            }

            if let hito = ProyectosRules.proximoHitoTexto(proyecto) {
                HStack(alignment: .center, spacing: 6) {
                    Image(systemName: "flag.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(NxColors.brand)
                        .frame(width: 14, height: 14)
                        .accessibilityHidden(true)
                    Text(hito)
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                }
            }

            if let req = proyecto.resumen?.requerimientos, req.total > 0 {
                Text("Requerimientos: \(req.cumplidos) de \(req.total) cumplidos")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Filtros, orden y textos de la tarjeta (Android `ProyectosRules`).
enum ProyectosRules {
    /// `SaludProyecto` del servidor (`apps/api/src/projects/proyecto-salud.ts`).
    enum Salud: String {
        case enRiesgo = "EN_RIESGO"
        case retrasado = "RETRASADO"
        case enTiempo = "EN_TIEMPO"
        case planeado = "PLANEADO"
        case sinPlan = "SIN_PLAN"
        case terminado = "TERMINADO"
        case cancelado = "CANCELADO"
        case desconocida = ""

        var etiqueta: String {
            switch self {
            case .enRiesgo: return "En riesgo"
            case .retrasado: return "Retrasado"
            case .enTiempo: return "En tiempo"
            case .planeado: return "Planeado"
            case .sinPlan: return "Sin fecha de fin"
            case .terminado: return "Terminado"
            case .cancelado: return "Cancelado"
            case .desconocida: return "Sin clasificar"
            }
        }

        /// Lo que arde primero.
        var peso: Int {
            switch self {
            case .retrasado: return 0
            case .enRiesgo: return 1
            case .sinPlan: return 2
            case .enTiempo: return 3
            case .planeado: return 4
            case .desconocida: return 5
            case .terminado: return 6
            case .cancelado: return 7
            }
        }
    }

    /// Los filtros de arriba. `todos` no filtra; `atencion` junta retrasado y en riesgo.
    enum Filtro: String, CaseIterable, Identifiable, Hashable {
        case todos, atencion, activos, cerrados

        var id: String { rawValue }

        var etiqueta: String {
            switch self {
            case .todos: return "Todos"
            case .atencion: return "Necesitan atención"
            case .activos: return "Activos"
            case .cerrados: return "Cerrados"
            }
        }
    }

    static let limite = "Consulta. Crear proyectos, mover hitos y subir documentos se hacen desde la computadora."

    static func salud(_ valor: String?) -> Salud {
        let clave = (valor ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        guard !clave.isEmpty, let s = Salud(rawValue: clave) else { return .desconocida }
        return s
    }

    static func tono(_ salud: Salud) -> NxTone {
        switch salud {
        case .retrasado: return .danger
        case .enRiesgo: return .warning
        case .enTiempo, .terminado: return .success
        case .planeado: return .info
        default: return .neutral
        }
    }

    static func cumple(_ proyecto: ProyectoResumenFila, _ filtro: Filtro) -> Bool {
        let s = salud(proyecto.resumen?.salud)
        switch filtro {
        case .todos: return true
        case .atencion: return s == .retrasado || s == .enRiesgo || proyecto.resumen?.enRiesgo == true
        case .activos: return s != .terminado && s != .cancelado
        case .cerrados: return s == .terminado || s == .cancelado
        }
    }

    /// Filtro + búsqueda por título, cliente o responsable, ya ordenado.
    static func aplicar(_ proyectos: [ProyectoResumenFila], filtro: Filtro, consulta: String) -> [ProyectoResumenFila] {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return proyectos
            .filter { p in
                cumple(p, filtro) && (q.isEmpty || [p.title, p.client?.name, p.responsable?.nombre]
                    .compactMap { $0?.lowercased() }
                    .contains { $0.contains(q) })
            }
            .sorted { a, b in
                let pa = salud(a.resumen?.salud).peso
                let pb = salud(b.resumen?.salud).peso
                if pa != pb { return pa < pb }
                return a.title.lowercased() < b.title.lowercased()
            }
    }

    /// Cuántos hay en cada filtro, para el número de la pastilla.
    static func conteos(_ proyectos: [ProyectoResumenFila]) -> [Filtro: Int] {
        var out: [Filtro: Int] = [:]
        for filtro in Filtro.allCases {
            out[filtro] = proyectos.filter { cumple($0, filtro) }.count
        }
        return out
    }

    /// La etiqueta del servidor si viene; si no, la nuestra.
    static func etiquetaSalud(_ proyecto: ProyectoResumenFila) -> String {
        proyecto.resumen?.etiqueta.nilSiVacio ?? salud(proyecto.resumen?.salud).etiqueta
    }

    /// «Retrasado 6 días» · «Quedan 3 días» · el motivo del servidor.
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

    /// «Próximo: Entrega de equipos · 25 sept» · `nil` si no hay cronograma.
    static func proximoHitoTexto(_ proyecto: ProyectoResumenFila) -> String? {
        guard let hito = proyecto.proximoHito, let nombre = hito.name.nilSiVacio else { return nil }
        guard let fecha = fechaCorta(hito.plannedDate) else { return "Próximo: \(nombre)" }
        return "Próximo: \(nombre) · \(fecha)"
    }

    /// «25 sept» del día de calendario del API (los 10 primeros caracteres, sin
    /// mover de zona); `nil` si no se puede leer.
    static func fechaCorta(_ iso: String?) -> String? {
        let texto = (iso ?? "").trimmingCharacters(in: .whitespaces)
        guard texto.count >= 10, let leida = FechaMexico.leer(String(texto.prefix(10))) else { return nil }
        return FechaMexico.diaCorto(leida.fecha)
    }
}
