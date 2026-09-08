import SwiftUI

/// Vista detallada de servicios — `GET activities/detailed` (permiso
/// `console.admin`), con el reporte PDF de cada ticket
/// (`GET activities/:id/report`).
///
/// Qué añade sobre la lista normal de actividades: el conteo de evidencias y,
/// sobre todo, **cuántas de ellas traen coordenada**. Es la respuesta a la queja
/// del dueño de que en móvil "todo era un clic": aquí se ve de un vistazo qué
/// servicios se cerraron con evidencia georreferenciada y cuáles no.
struct OpsDetailedActivitiesView: View {
    @StateObject private var vm = OpsDetailedActivitiesVM()

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando servicios…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let err = vm.loadError, vm.items.isEmpty {
                NxEmptyState(
                    title: "No se pudo cargar",
                    subtitle: err,
                    actionLabel: "Reintentar",
                    onAction: { Task { await vm.load() } }
                )
            } else if vm.items.isEmpty {
                NxEmptyState(
                    title: "Sin servicios",
                    subtitle: "No hay actividades con detalle disponible."
                )
            } else {
                list
            }
        }
        .navigationTitle("Servicios · detalle")
        .searchable(text: $vm.query, prompt: "Buscar por AN, cliente o sucursal")
        .task { if vm.items.isEmpty { await vm.load() } }
        .refreshable { await vm.load() }
        .sheet(item: $vm.report) { rep in
            NavigationStack {
                PDFViewerScreen(title: rep.title, data: rep.data)
            }
        }
        .alert("Reporte", isPresented: Binding(
            get: { vm.reportError != nil },
            set: { if !$0 { vm.reportError = nil } }
        )) {
            Button("Entendido", role: .cancel) { vm.reportError = nil }
        } message: {
            Text(vm.reportError ?? "")
        }
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: 10) {
                summaryStrip
                ForEach(vm.filtered) { item in
                    OpsDetailedActivityCard(
                        item: item,
                        busy: vm.reportBusyId == item.id,
                        onReport: { Task { await vm.openReport(item) } }
                    )
                }
                Spacer(minLength: 20)
            }
            .padding(14)
        }
    }

    private var summaryStrip: some View {
        let total = vm.filtered.count
        let conGeo = vm.filtered.filter { $0.geoEvidenceCount > 0 }.count
        let sinEvidencia = vm.filtered.filter { $0.evidenceCount == 0 }.count
        return HStack(spacing: 0) {
            OpsDetailChip(label: "Servicios", value: "\(total)", tone: .primary)
            Divider().frame(height: 34)
            OpsDetailChip(label: "Con GPS", value: "\(conGeo)", tone: .green)
            Divider().frame(height: 34)
            OpsDetailChip(label: "Sin evidencia", value: "\(sinEvidencia)", tone: sinEvidencia > 0 ? .red : .secondary)
        }
        .padding(.vertical, 8)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

/// PDF ya descargado, listo para el visor. `Identifiable` para que `.sheet(item:)`
/// lo acepte.
struct OpsTicketReport: Identifiable {
    let id: Int64
    let title: String
    let data: Data
}

@MainActor
final class OpsDetailedActivitiesVM: ObservableObject {
    @Published var items: [ActivityDetailedItem] = []
    @Published var query = ""
    @Published var loading = false
    @Published var loadError: String?
    @Published var report: OpsTicketReport?
    @Published var reportError: String?
    @Published var reportBusyId: Int64?

    private let repo = FieldOpsActivityRepository.shared

    var filtered: [ActivityDetailedItem] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return items }
        return items.filter {
            $0.anNumber.lowercased().contains(q)
                || $0.titulo.lowercased().contains(q)
                || $0.clientName.lowercased().contains(q)
                || $0.locationLine.lowercased().contains(q)
                || $0.responsable.lowercased().contains(q)
        }
    }

    func load() async {
        loading = true
        loadError = nil
        defer { loading = false }
        do {
            items = try await repo.detailedActivities()
        } catch {
            // No se cae a una lista de otro endpoint: `detailed` exige
            // `console.admin` y enseñar datos de otra consulta haría creer que la
            // pantalla funciona cuando en realidad falta el permiso.
            loadError = error.toUserMessage(fallback: "No se pudo cargar el detalle de servicios")
        }
    }

    func openReport(_ item: ActivityDetailedItem) async {
        reportBusyId = item.id
        reportError = nil
        defer { reportBusyId = nil }
        do {
            let data = try await repo.ticketReportPdf(activityId: item.id)
            guard !data.isEmpty else {
                reportError = "El servidor devolvió un reporte vacío."
                return
            }
            let name = item.anNumber.isEmpty ? "Ticket \(item.id)" : item.anNumber
            report = OpsTicketReport(id: item.id, title: name, data: data)
        } catch {
            reportError = error.toUserMessage(fallback: "No se pudo generar el reporte")
        }
    }
}

// MARK: – Subvistas

private struct OpsDetailedActivityCard: View {
    let item: ActivityDetailedItem
    let busy: Bool
    let onReport: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.anNumber.isEmpty ? "Sin AN" : item.anNumber)
                        .font(.caption2.bold()).foregroundColor(.teal)
                    Text(item.titulo.isEmpty ? "Servicio \(item.id)" : item.titulo)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                }
                Spacer()
                Text(item.estatus.isEmpty ? "—" : item.estatus)
                    .font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.secondary.opacity(0.15))
                    .clipShape(Capsule())
            }

            if !item.clientName.isEmpty || !item.locationLine.isEmpty {
                Text([item.clientName, item.locationLine].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundColor(.secondary)
            }
            if !item.responsable.isEmpty {
                Text("Responsable: \(item.responsable)").font(.caption2).foregroundColor(.secondary)
            }

            HStack(spacing: 10) {
                // La distinción evidencias / con GPS es el punto de la pantalla:
                // "4 fotos" sin coordenada no prueba que alguien fuera al sitio.
                OpsEvidenceBadge(
                    icon: "photo.on.rectangle",
                    text: "\(item.evidenceCount) evidencia(s)",
                    tone: item.evidenceCount > 0 ? .primary : .red
                )
                OpsEvidenceBadge(
                    icon: "location.fill",
                    text: "\(item.geoEvidenceCount) con GPS",
                    tone: item.geoEvidenceCount > 0 ? .green : .orange
                )
                if !item.serviceSheetPdfUrl.isEmpty {
                    OpsEvidenceBadge(icon: "doc.richtext", text: "Hoja", tone: .teal)
                }
            }

            if item.clientRating > 0 {
                Text("Cliente: \(String(repeating: "★", count: min(item.clientRating, 5)))"
                     + (item.clientComments.isEmpty ? "" : " · \(item.clientComments)"))
                    .font(.caption2).foregroundColor(.secondary).lineLimit(2)
            }

            Button(action: onReport) {
                Label(busy ? "Generando…" : "Reporte PDF", systemImage: "doc.text.magnifyingglass")
                    .font(.caption)
            }
            .buttonStyle(.bordered)
            .disabled(busy)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct OpsEvidenceBadge: View {
    let icon: String
    let text: String
    let tone: Color

    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption2)
            .foregroundColor(tone)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(tone.opacity(0.12))
            .clipShape(Capsule())
    }
}

private struct OpsDetailChip: View {
    let label: String
    let value: String
    let tone: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline.bold()).foregroundColor(tone)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
