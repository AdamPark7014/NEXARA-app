import SwiftUI

/// Lo que decide el detalle de un proyecto. Adam (04-11-2026): «en proyectos aparece pero no deja apretar
/// nada ni ver nada». Mismas etiquetas que la web. Espejo de `ProyectoDetalleRules.kt`.
enum ProyectoDetalleRules {
    enum Seccion: String, CaseIterable, Identifiable {
        case resumen = "Resumen"
        case cronograma = "Cronograma"
        case alcance = "Alcance"
        case equipo = "Equipo"
        case documentos = "Documentos"
        case actividades = "Actividades"
        var id: String { rawValue }
    }

    /// Las secciones sin nada no salen: una pestaña vacía es un toque perdido.
    static func secciones(_ p: ProyectoDetalle) -> [Seccion] {
        Seccion.allCases.filter { s in
            switch s {
            case .resumen: return true
            case .cronograma: return !(p.milestones ?? []).isEmpty
            case .alcance: return !(p.scopeItems ?? []).isEmpty || !(p.requirements ?? []).isEmpty
            case .equipo: return !(p.members ?? []).isEmpty
            case .documentos: return !(p.documents ?? []).isEmpty
            case .actividades: return !(p.activities ?? []).isEmpty
            }
        }
    }

    static func etiquetaEstado(_ status: String?) -> String {
        switch status {
        case "PLANNED": return "Planeado"
        case "ACTIVE": return "En curso"
        case "ON_HOLD": return "En pausa"
        case "COMPLETED": return "Terminado"
        case "CANCELLED": return "Cancelado"
        default: return "Sin estado"
        }
    }

    static func etiquetaEtapa(_ status: String?) -> String {
        switch status {
        case "PENDIENTE": return "Pendiente"
        case "EN_CURSO": return "En curso"
        case "CUMPLIDO": return "Cumplida"
        case "CANCELADO": return "Cancelada"
        default: return "Sin estado"
        }
    }

    static func etiquetaRequerimiento(_ status: String?) -> String {
        switch status {
        case "PENDIENTE": return "Pendiente"
        case "EN_PROCESO": return "En proceso"
        case "CUMPLIDO": return "Listo"
        case "NO_APLICA": return "No aplica"
        default: return "Sin estado"
        }
    }

    static func etiquetaRol(_ m: ProyectoMiembro) -> String {
        if let e = m.rolEtiqueta?.trimmingCharacters(in: .whitespaces), !e.isEmpty { return e }
        switch m.role {
        case "RESPONSABLE": return "Responsable"
        case "COORDINADOR": return "Coordinador"
        case "INGENIERO": return "Ingeniero"
        case "INSTALADOR": return "Instalador"
        case "ADMINISTRATIVO": return "Administrativo"
        case "APOYO": return "Apoyo"
        default: return "Equipo"
        }
    }

    static func tituloAlcance(_ kind: String?) -> String {
        switch kind {
        case "ENTREGABLE": return "Qué entregamos"
        case "EXCLUSION": return "Qué no incluye"
        case "SUPUESTO": return "De qué partimos"
        default: return "Alcance"
        }
    }

    static func alcancePorTipo(_ items: [ProyectoAlcance]?) -> [(titulo: String, renglones: [ProyectoAlcance])] {
        let orden = ["ENTREGABLE", "EXCLUSION", "SUPUESTO"]
        let grupos = Dictionary(grouping: items ?? []) { $0.kind ?? "" }
        return grupos.keys
            .sorted { (orden.firstIndex(of: $0) ?? orden.count) < (orden.firstIndex(of: $1) ?? orden.count) }
            .map { k in
                (tituloAlcance(k), (grupos[k] ?? []).sorted { ($0.orden ?? 0) < ($1.orden ?? 0) })
            }
    }

    static func etapasEnOrden(_ etapas: [ProyectoEtapa]?) -> [ProyectoEtapa] {
        (etapas ?? []).sorted { ($0.orden ?? Int.max) < ($1.orden ?? Int.max) }
    }

    static func estadosPosibles(_ actual: String?) -> [String] {
        ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"].filter { $0 != actual }
    }

    static func pideMotivo(_ estado: String) -> Bool { estado == "CANCELLED" }

    static func motivoValido(_ estado: String, _ motivo: String) -> Bool {
        !pideMotivo(estado) || motivo.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3
    }

    static func unir(_ partes: String?...) -> String {
        partes.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// Un proyecto completo. Cada actividad abre su detalle. Va dentro del `NavigationStack` de quien la abre.
struct ProyectoDetalleView: View {
    let proyectoId: Int

    @State private var proyecto: ProyectoDetalle?
    @State private var cargando = true
    @State private var error: String?
    @State private var seccion = ProyectoDetalleRules.Seccion.resumen
    @State private var cambiando = false
    @State private var ocupado = false
    @State private var errorCambio: String?

    /// Lo mismo que pide el servidor para cambiar el estado; si no tiene, ni se ofrece.
    private var puedeCambiarEstado: Bool {
        guard let u = SessionStore.shared.currentUser else { return false }
        return u.isSuperAdmin || u.permissions.contains("activities.manage")
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: NxSpacing.m) {
                if let p = proyecto {
                    contenido(p)
                } else if cargando {
                    NxSkeletonList(itemCount: 4, itemHeight: 96)
                } else {
                    NxErrorBlock(message: error ?? "No se pudo abrir el proyecto", onRetry: { Task { await cargar() } })
                }
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .refreshable { await cargar() }
        .task { if proyecto == nil { await cargar() } }
        .sheet(isPresented: $cambiando) {
            HojaCambiarEstado(actual: proyecto?.status) { estado, motivo in
                cambiando = false
                cambiar(estado, motivo)
            }
        }
    }

    @ViewBuilder
    private func contenido(_ p: ProyectoDetalle) -> some View {
        let secciones = ProyectoDetalleRules.secciones(p)
        let actual = secciones.contains(seccion) ? seccion : .resumen
        VStack(alignment: .leading, spacing: 4) {
            Text((p.title ?? "").isEmpty ? "Proyecto sin título" : (p.title ?? ""))
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(NxColors.fg)
            if let cliente = p.client?.name, !cliente.isEmpty {
                Text(cliente)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
            }
        }
        if secciones.count > 1 {
            NxFilterBar(horizontalPadding: 0) {
                ForEach(secciones) { s in
                    NxFilterPill(label: s.rawValue, selected: s == actual, onClick: { seccion = s })
                }
            }
        }
        switch actual {
        case .resumen:
            resumen(p)
        case .cronograma:
            ForEach(ProyectoDetalleRules.etapasEnOrden(p.milestones)) { e in
                Renglon(
                    titulo: e.name ?? "",
                    detalle: ProyectoDetalleRules.unir(ProyectosRules.fechaCorta(e.actualDate ?? e.plannedDate), e.responsable?.nombre),
                    estado: ProyectoDetalleRules.etiquetaEtapa(e.status)
                )
            }
        case .alcance:
            ForEach(ProyectoDetalleRules.alcancePorTipo(p.scopeItems), id: \.titulo) { grupo in
                Subtitulo(texto: grupo.titulo)
                ForEach(grupo.renglones) { r in
                    Renglon(titulo: r.titulo ?? "", detalle: r.detalle ?? "")
                }
            }
            if let requerimientos = p.requirements, !requerimientos.isEmpty {
                Subtitulo(texto: "Requerimientos")
                ForEach(requerimientos) { r in
                    Renglon(
                        titulo: r.titulo ?? "",
                        detalle: ProyectoDetalleRules.unir(ProyectosRules.fechaCorta(r.dueDate), r.responsable?.nombre),
                        estado: ProyectoDetalleRules.etiquetaRequerimiento(r.status)
                    )
                }
            }
        case .equipo:
            ForEach(p.members ?? []) { m in
                Renglon(titulo: m.user?.nombre ?? "", detalle: ProyectoDetalleRules.etiquetaRol(m))
            }
        case .documentos:
            ForEach(p.documents ?? []) { d in
                Renglon(titulo: d.nombre ?? "", detalle: "Se abre desde la computadora")
            }
        case .actividades:
            ForEach(p.activities ?? []) { a in
                NavigationLink {
                    ActivityCoreDetailView(activityId: a.id, initialTab: nil)
                        .nxBrandNavBar(title: "Actividad")
                } label: {
                    Renglon(
                        titulo: (a.titulo ?? "").isEmpty ? (a.anNumber ?? "Actividad \(a.id)") : (a.titulo ?? ""),
                        detalle: ProyectoDetalleRules.unir(a.responsable?.nombre, a.branchName, ProyectosRules.fechaCorta(a.fechaEntregaEsperada)),
                        estado: a.estatus
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func resumen(_ p: ProyectoDetalle) -> some View {
        MoreTarjeta {
            Dato(etiqueta: "Estado", valor: ProyectoDetalleRules.etiquetaEstado(p.status))
            if let avance = p.resumen?.avance?.porcentaje {
                Dato(etiqueta: "Avance", valor: "\(avance) %")
            }
            Dato(etiqueta: "Etapas", valor: "\(p.milestones?.count ?? 0)")
            if let inicio = ProyectosRules.fechaCorta(p.startDate) {
                Dato(etiqueta: "Inicio", valor: inicio)
            }
            if let fin = ProyectosRules.fechaCorta(p.actualEndDate ?? p.endDate) {
                Dato(etiqueta: "Fin", valor: fin)
            }
            if let responsable = p.responsable?.nombre, !responsable.isEmpty {
                Dato(etiqueta: "Responsable", valor: responsable)
            }
            if let objetivo = p.objective, !objetivo.isEmpty {
                Dato(etiqueta: "Objetivo", valor: objetivo)
            }
            if let descripcion = p.description, !descripcion.isEmpty {
                Dato(etiqueta: "Descripción", valor: descripcion)
            }
            if let motivo = p.cancelReason, !motivo.isEmpty {
                Dato(etiqueta: "Por qué se canceló", valor: motivo)
            }
            if let errorCambio {
                Text(errorCambio)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.danger)
            }
            if puedeCambiarEstado {
                Button("Cambiar estado") { cambiando = true }
                    .buttonStyle(.bordered)
                    .tint(NxColors.brand)
                    .disabled(ocupado)
            }
        }
    }

    private func cargar() async {
        cargando = true
        do {
            proyecto = try await CoreExtrasRepository.shared.proyecto(id: proyectoId)
            error = nil
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo abrir el proyecto")
        }
        cargando = false
    }

    private func cambiar(_ estado: String, _ motivo: String) {
        ocupado = true
        errorCambio = nil
        Task { @MainActor in
            do {
                proyecto = try await CoreExtrasRepository.shared.cambiarEstadoProyecto(id: proyectoId, estado: estado, motivo: motivo)
            } catch {
                errorCambio = error.toUserMessage(fallback: "No se pudo cambiar el estado")
            }
            ocupado = false
        }
    }
}

private struct Subtitulo: View {
    let texto: String
    var body: some View {
        Text(texto)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(NxColors.muted)
    }
}

private struct Dato: View {
    let etiqueta: String
    let valor: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(etiqueta)
                .font(.system(size: 12.5))
                .foregroundStyle(NxColors.muted)
            Text(valor)
                .font(.system(size: 14))
                .foregroundStyle(NxColors.fg)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct Renglon: View {
    let titulo: String
    var detalle: String = ""
    var estado: String? = nil

    var body: some View {
        MoreTarjeta {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                    if !detalle.isEmpty {
                        Text(detalle)
                            .font(.system(size: 12.5))
                            .foregroundStyle(NxColors.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let estado, !estado.isEmpty {
                    Text(estado)
                        .font(.system(size: 12.5))
                        .foregroundStyle(NxColors.muted)
                }
            }
        }
    }
}

private struct HojaCambiarEstado: View {
    let actual: String?
    let onConfirmar: (String, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var elegido: String?
    @State private var motivo = ""

    private var valido: Bool {
        guard let elegido else { return false }
        return ProyectoDetalleRules.motivoValido(elegido, motivo)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(ProyectoDetalleRules.estadosPosibles(actual), id: \.self) { e in
                        Button {
                            elegido = e
                        } label: {
                            HStack {
                                Text(ProyectoDetalleRules.etiquetaEstado(e))
                                    .foregroundStyle(NxColors.fg)
                                Spacer()
                                if e == elegido {
                                    Image(systemName: "checkmark").foregroundStyle(NxColors.brand)
                                }
                            }
                        }
                    }
                }
                if let elegido, ProyectoDetalleRules.pideMotivo(elegido) {
                    Section("Motivo") {
                        TextField("Motivo", text: $motivo, axis: .vertical)
                            .lineLimit(2...5)
                    }
                }
            }
            .navigationTitle("Cambiar estado")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Cambiar") {
                        if let elegido { onConfirmar(elegido, motivo) }
                    }
                    .disabled(!valido)
                }
            }
        }
    }
}
