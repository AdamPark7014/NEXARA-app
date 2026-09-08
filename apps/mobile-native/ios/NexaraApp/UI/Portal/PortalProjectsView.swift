import SwiftUI

/// GET `client-portal/projects` — los proyectos operativos vivos del cliente en
/// sesión, con su avance. Paridad con `TicketsRepository.projects()` de Android.
///
/// SOLO LECTURA, y no por falta de trabajo: la API expone únicamente el `GET`
/// para el portal del cliente. El cliente ve el avance de sus proyectos; quien
/// los edita es la consola, desde otro módulo.
struct PortalProjectsView: View {
    @State private var projects: [PortalClientProject] = []
    @State private var isLoading = true
    @State private var query = ""

    private var filtered: [PortalClientProject] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return projects }
        return projects.filter {
            $0.title.lowercased().contains(q)
                || $0.projectType.lowercased().contains(q)
                || $0.scopeSummary.lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando proyectos…")
            } else if filtered.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "chart.bar.doc.horizontal")
                        .font(.largeTitle).foregroundColor(.secondary)
                    Text(projects.isEmpty ? "Sin proyectos activos" : "Sin resultados")
                        .font(.headline)
                    Text(projects.isEmpty
                         ? "Aquí aparecerán tus proyectos en curso o en pausa."
                         : "Prueba con otro término.")
                        .font(.footnote).foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
            } else {
                List {
                    Section {
                        ForEach(filtered) { p in projectRow(p) }
                    } footer: {
                        Text("Resumen global: \(completedTotal) de \(activityTotal) actividades finalizadas.")
                            .font(.caption)
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .searchable(text: $query, prompt: "Buscar proyecto…")
        .navigationTitle("Mis proyectos")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var activityTotal: Int { projects.reduce(0) { $0 + $1.activityCount } }
    private var completedTotal: Int { projects.reduce(0) { $0 + $1.completedActivities } }

    private func projectRow(_ p: PortalClientProject) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(p.displayTitle).font(.headline)
                Spacer()
                OpsStatusChip(text: p.isOnHold ? "En pausa" : "Activo")
            }

            if !p.subtitle.isEmpty {
                Text(p.subtitle).font(.caption).foregroundColor(.secondary)
            }

            if !p.scopeSummary.isEmpty {
                Text(p.scopeSummary)
                    .font(.footnote).foregroundColor(.secondary)
                    .lineLimit(3)
            }

            // El avance es lo único que el cliente mira de verdad: barra + cifras.
            ProgressView(value: p.progressFraction)
                .tint(p.isOnHold ? .orange : .teal)

            HStack {
                Text("\(Int(p.progressFraction * 100)) %").font(.caption).bold()
                Spacer()
                if p.activityCount > 0 {
                    Text("\(p.completedActivities)/\(p.activityCount) actividades")
                        .font(.caption).foregroundColor(.secondary)
                }
            }

            let fechas = [p.startDate, p.endDate]
                .map { String($0.prefix(10)) }
                .filter { !$0.isEmpty }
            if !fechas.isEmpty {
                Text(fechas.joined(separator: " → "))
                    .font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        projects = await PortalExtraRepository.shared.clientProjects()
    }
}
