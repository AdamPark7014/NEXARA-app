import SwiftUI

/// Incidencias y recomendaciones de un servicio.
/// Equivalente de `ActivityIssuesTab` (Android, `ActivityDetailTabs.kt`).
///
/// Se monta como pestaña dentro del detalle de actividad, que es donde el
/// técnico ya está cuando le pasa algo en sitio. Una pantalla suelta en el menú
/// obligaría a buscar la OT otra vez y nadie registraría nada.
struct OpsActivityIssuesView: View {
    let activityId: Int64
    /// Registrar/resolver exige `activities.manage` en el API. Si no lo tienes,
    /// la vista es de solo lectura y no se enseñan botones que darían 403.
    let canManage: Bool

    @StateObject private var vm = OpsActivityIssuesVM()

    var body: some View {
        Group {
            if vm.loading {
                ProgressView("Cargando incidencias…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        if let msg = vm.actionError {
                            Text(msg)
                                .font(.caption)
                                .foregroundColor(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(Color.red.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }

                        incidentsSection
                        Divider()
                        recommendationsSection

                        Spacer(minLength: 20)
                    }
                    .padding(16)
                }
            }
        }
        .task(id: activityId) { await vm.load(activityId: activityId) }
        .refreshable { await vm.load(activityId: activityId) }
    }

    // MARK: – Incidencias

    private var incidentsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Incidencias (\(vm.incidents.count))").font(.subheadline.bold())
                Spacer()
                if canManage {
                    Button(vm.showIncidentForm ? "Cancelar" : "Registrar") {
                        vm.showIncidentForm.toggle()
                        vm.showRecForm = false
                    }
                    .buttonStyle(.bordered)
                    .font(.caption)
                }
            }
            Text("Lo que impidió o retrasó el trabajo en sitio.")
                .font(.caption).foregroundColor(.secondary)

            if vm.showIncidentForm { incidentForm }

            if vm.incidents.isEmpty {
                Text("Sin incidencias registradas en este servicio.")
                    .font(.caption).foregroundColor(.secondary)
            } else {
                ForEach(vm.incidents) { inc in
                    OpsIncidentCard(
                        incident: inc,
                        canManage: canManage,
                        busy: vm.busyIncidentId == inc.id,
                        onToggle: { Task { await vm.toggleIncident(activityId: activityId, incident: inc) } }
                    )
                }
            }
        }
    }

    private var incidentForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            OpsChipPicker(
                title: "Tipo",
                options: FieldOpsCatalog.incidentTypes,
                label: FieldOpsCatalog.incidentTypeLabel,
                selection: $vm.incidentTipo
            )
            OpsChipPicker(
                title: "Severidad",
                options: FieldOpsCatalog.incidentSeverities,
                label: FieldOpsCatalog.severityLabel,
                selection: $vm.incidentSeveridad
            )
            TextField("Horas perdidas (opcional)", text: $vm.incidentHoras)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
            TextField("Qué pasó", text: $vm.incidentDescripcion, axis: .vertical)
                .lineLimit(2...5)
                .textFieldStyle(.roundedBorder)
            TextField("Acción tomada (opcional)", text: $vm.incidentAccion)
                .textFieldStyle(.roundedBorder)
            Button {
                Task { await vm.submitIncident(activityId: activityId) }
            } label: {
                Text(vm.savingIncident ? "Guardando…" : "Registrar incidencia")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
            .disabled(vm.savingIncident || vm.incidentDescripcion.trimmed.isEmpty)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: – Recomendaciones

    private var recommendationsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Recomendaciones (\(vm.recommendations.count))").font(.subheadline.bold())
                Spacer()
                if canManage {
                    Button(vm.showRecForm ? "Cancelar" : "Registrar") {
                        vm.showRecForm.toggle()
                        vm.showIncidentForm = false
                    }
                    .buttonStyle(.bordered)
                    .font(.caption)
                }
            }
            Text("Lo que el técnico recomienda al cliente; Ventas lo convierte en cotización.")
                .font(.caption).foregroundColor(.secondary)

            if vm.showRecForm { recommendationForm }

            if vm.recommendations.isEmpty {
                Text("Sin recomendaciones registradas en este servicio.")
                    .font(.caption).foregroundColor(.secondary)
            } else {
                ForEach(vm.recommendations) { rec in
                    OpsRecommendationCard(
                        recommendation: rec,
                        canManage: canManage,
                        busy: vm.busyRecommendationId == rec.id,
                        onDiscard: { Task { await vm.discardRecommendation(activityId: activityId, rec: rec) } }
                    )
                }
            }
        }
    }

    private var recommendationForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            OpsChipPicker(
                title: "Tipo",
                options: FieldOpsCatalog.recommendationTypes,
                label: FieldOpsCatalog.recommendationTypeLabel,
                selection: $vm.recTipo
            )
            OpsChipPicker(
                title: "Prioridad",
                options: FieldOpsCatalog.recommendationPriorities,
                label: FieldOpsCatalog.priorityLabel,
                selection: $vm.recPrioridad
            )
            TextField("Costo estimado (opcional)", text: $vm.recCosto)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
            TextField("Qué se recomienda y por qué", text: $vm.recDescripcion, axis: .vertical)
                .lineLimit(2...5)
                .textFieldStyle(.roundedBorder)
            Button {
                Task { await vm.submitRecommendation(activityId: activityId) }
            } label: {
                Text(vm.savingRec ? "Guardando…" : "Registrar recomendación")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.teal)
            .disabled(vm.savingRec || vm.recDescripcion.trimmed.isEmpty)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – ViewModel

@MainActor
final class OpsActivityIssuesVM: ObservableObject {
    @Published var incidents: [ActivityIncident] = []
    @Published var recommendations: [ActivityRecommendation] = []
    @Published var loading = true
    @Published var actionError: String?

    @Published var showIncidentForm = false
    @Published var showRecForm = false
    @Published var savingIncident = false
    @Published var savingRec = false
    @Published var busyIncidentId: Int64?
    @Published var busyRecommendationId: Int64?

    // Valores por defecto iguales a los del Android para que las dos apps
    // produzcan estadísticas comparables.
    @Published var incidentTipo = "FALTA_MATERIAL"
    @Published var incidentSeveridad = "MEDIA"
    @Published var incidentDescripcion = ""
    @Published var incidentAccion = ""
    @Published var incidentHoras = ""

    @Published var recTipo = "MEJORA"
    @Published var recPrioridad = "MEDIA"
    @Published var recDescripcion = ""
    @Published var recCosto = ""

    private let repo = FieldOpsActivityRepository.shared

    func load(activityId: Int64) async {
        guard activityId > 0 else { loading = false; return }
        loading = true
        // Las dos listas se piden en paralelo: si una falla por permisos, la otra
        // se sigue viendo. Un 403 en recomendaciones no debe dejar en blanco las
        // incidencias que el técnico acaba de registrar.
        async let incTask = repo.incidents(activityId: activityId)
        async let recTask = repo.recommendations(activityId: activityId)
        incidents = (try? await incTask) ?? []
        recommendations = (try? await recTask) ?? []
        loading = false
    }

    func submitIncident(activityId: Int64) async {
        let desc = incidentDescripcion.trimmed
        guard !desc.isEmpty else { return }
        savingIncident = true
        actionError = nil
        defer { savingIncident = false }
        do {
            _ = try await repo.addIncident(
                activityId: activityId,
                tipo: incidentTipo,
                severidad: incidentSeveridad,
                descripcion: desc,
                accionTomada: incidentAccion.trimmed,
                horasPerdidas: Double(incidentHoras.replacingOccurrences(of: ",", with: "."))
            )
            incidentDescripcion = ""
            incidentAccion = ""
            incidentHoras = ""
            showIncidentForm = false
            await load(activityId: activityId)
        } catch {
            actionError = error.toUserMessage(fallback: "No se pudo registrar la incidencia")
        }
    }

    func toggleIncident(activityId: Int64, incident: ActivityIncident) async {
        busyIncidentId = incident.id
        actionError = nil
        defer { busyIncidentId = nil }
        do {
            if incident.isResolved {
                try await repo.reopenIncident(activityId: activityId, incidentId: incident.id)
            } else {
                try await repo.resolveIncident(
                    activityId: activityId,
                    incidentId: incident.id,
                    accionTomada: nil
                )
            }
            await load(activityId: activityId)
        } catch {
            actionError = error.toUserMessage(fallback: "No se pudo actualizar la incidencia")
        }
    }

    func submitRecommendation(activityId: Int64) async {
        let desc = recDescripcion.trimmed
        guard !desc.isEmpty else { return }
        savingRec = true
        actionError = nil
        defer { savingRec = false }
        do {
            _ = try await repo.addRecommendation(
                activityId: activityId,
                tipo: recTipo,
                prioridad: recPrioridad,
                descripcion: desc,
                costoEstimado: Double(recCosto.replacingOccurrences(of: ",", with: "."))
            )
            recDescripcion = ""
            recCosto = ""
            showRecForm = false
            await load(activityId: activityId)
        } catch {
            actionError = error.toUserMessage(fallback: "No se pudo registrar la recomendación")
        }
    }

    /// Descartar es la única transición que el móvil hace sobre una
    /// recomendación. Cotizarla o aceptarla es trabajo de Ventas en la web, con
    /// el número de cotización delante; hacerlo aquí a ciegas sería inventarlo.
    func discardRecommendation(activityId: Int64, rec: ActivityRecommendation) async {
        busyRecommendationId = rec.id
        actionError = nil
        defer { busyRecommendationId = nil }
        do {
            _ = try await repo.updateRecommendation(
                activityId: activityId,
                recommendationId: rec.id,
                estado: "DESCARTADA"
            )
            await load(activityId: activityId)
        } catch {
            actionError = error.toUserMessage(fallback: "No se pudo actualizar la recomendación")
        }
    }
}

// MARK: – Tarjetas

private struct OpsIncidentCard: View {
    let incident: ActivityIncident
    let canManage: Bool
    let busy: Bool
    let onToggle: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Rectangle()
                .fill(incident.isResolved ? Color.gray.opacity(0.35) : OpsIssueTone.severity(incident.severidad))
                .frame(width: 4)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(FieldOpsCatalog.incidentTypeLabel(incident.tipo))
                        .font(.subheadline.weight(.semibold))
                    Text(FieldOpsCatalog.severityLabel(incident.severidad))
                        .font(.caption2.bold())
                        .foregroundColor(OpsIssueTone.severity(incident.severidad))
                }
                Text(incident.descripcion).font(.footnote)
                if !incident.accionTomada.isEmpty {
                    Text("Acción: \(incident.accionTomada)")
                        .font(.caption).foregroundColor(.secondary)
                }
                if !metaLine.isEmpty {
                    Text(metaLine).font(.caption2).foregroundColor(.secondary)
                }
            }
            .padding(12)
            Spacer(minLength: 0)
            if canManage {
                Button(incident.isResolved ? "Reabrir" : "Resolver", action: onToggle)
                    .font(.caption)
                    .buttonStyle(.bordered)
                    .disabled(busy)
                    .padding(.trailing, 10)
                    .padding(.top, 12)
            }
        }
        .background(incident.isResolved
                    ? Color(.tertiarySystemGroupedBackground)
                    : Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var metaLine: String {
        var parts: [String] = []
        if !incident.reportadoPor.isEmpty { parts.append("Reportó \(incident.reportadoPor)") }
        if incident.horasPerdidas > 0 {
            parts.append(String(format: "%.1f h perdidas", incident.horasPerdidas))
        }
        if incident.isResolved {
            parts.append(incident.resueltoPor.isEmpty
                         ? "resuelta"
                         : "resuelta por \(incident.resueltoPor)")
        }
        return parts.joined(separator: " · ")
    }
}

private struct OpsRecommendationCard: View {
    let recommendation: ActivityRecommendation
    let canManage: Bool
    let busy: Bool
    let onDiscard: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(FieldOpsCatalog.recommendationTypeLabel(recommendation.tipo))
                        .font(.subheadline.weight(.semibold))
                    Text("\(FieldOpsCatalog.priorityLabel(recommendation.prioridad)) · \(FieldOpsCatalog.recommendationStatusLabel(recommendation.estado))")
                        .font(.caption2).foregroundColor(.secondary)
                }
                Spacer()
                if canManage && recommendation.isOpen {
                    Button("Descartar", action: onDiscard)
                        .font(.caption)
                        .buttonStyle(.bordered)
                        .disabled(busy)
                }
            }
            Text(recommendation.descripcion).font(.footnote)
            if !metaLine.isEmpty {
                Text(metaLine).font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var metaLine: String {
        var parts: [String] = []
        if !recommendation.creadoPor.isEmpty { parts.append("Propuso \(recommendation.creadoPor)") }
        if recommendation.costoEstimado > 0 {
            parts.append(String(format: "estimado $%.2f", recommendation.costoEstimado))
        }
        if !recommendation.cotizacionNumero.isEmpty {
            parts.append("cotización \(recommendation.cotizacionNumero)")
        }
        return parts.joined(separator: " · ")
    }
}

// MARK: – Piezas compartidas

/// Selector horizontal de códigos de catálogo. Enseña la etiqueta en castellano
/// y guarda el código que espera el API; así el usuario no ve `DANO_INSTALACION`
/// y el backend nunca recibe "Daño en la instalación".
struct OpsChipPicker: View {
    let title: String
    let options: [String]
    let label: (String) -> String
    @Binding var selection: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption.weight(.medium)).foregroundColor(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(options, id: \.self) { opt in
                        let active = selection == opt
                        Text(label(opt))
                            .font(.caption)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(active ? Color.teal.opacity(0.18) : Color(.tertiarySystemFill))
                            .foregroundColor(active ? .teal : .primary)
                            .clipShape(Capsule())
                            .onTapGesture { selection = opt }
                    }
                }
                .padding(.horizontal, 1)
            }
        }
    }
}

enum OpsIssueTone {
    static func severity(_ code: String) -> Color {
        switch code.uppercased() {
        case "CRITICA": return .red
        case "ALTA": return .orange
        case "MEDIA": return .yellow
        default: return .secondary
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
