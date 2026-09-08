import SwiftUI

/// GET `sla/insights?from=` — cumplimiento de SLA, backlog y ranking.
///
/// Ni Android ni iOS lo tenían; sólo la web, en `ops/support/sla`. Encaja en un
/// teléfono porque quien mira esto es el jefe de soporte, y lo mira cuando algo
/// se está incumpliendo, no sentado en el escritorio.
///
/// SOLO LECTURA: el endpoint es un `GET` de agregados, no hay nada que mutar.
struct PortalSlaInsightsView: View {
    @State private var insights: PortalSlaInsights?
    @State private var isLoading = true
    @State private var daysBack = 30

    /// Las mismas ventanas que ofrece la web.
    private static let windows = [7, 30, 90]

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Calculando cumplimiento…")
            } else if let s = insights, !s.isEmpty {
                List {
                    windowPicker
                    complianceSection(s)
                    backlogSection(s)
                    if !s.alerts.isEmpty { alertsSection(s) }
                    if !s.breaches.isEmpty { breachesSection(s) }
                    if !s.oldest.isEmpty { oldestSection(s) }
                    if !s.techRanking.isEmpty { rankingSection(s) }
                    if !s.inboxByStatus.isEmpty { inboxSection(s) }
                }
                .listStyle(.insetGrouped)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "timer")
                        .font(.largeTitle).foregroundColor(.secondary)
                    Text("Sin datos de SLA").font(.headline)
                    Text("No hay actividades en la ventana elegida, o el rol no tiene acceso.")
                        .font(.footnote).foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Reintentar") { Task { await reload() } }
                        .buttonStyle(.bordered)
                        .padding(.top, 4)
                }
                .padding()
            }
        }
        .navigationTitle("Cumplimiento SLA")
        .task { await reload() }
        .refreshable { await reload() }
    }

    // MARK: Secciones

    private var windowPicker: some View {
        Section {
            Picker("Ventana", selection: $daysBack) {
                ForEach(Self.windows, id: \.self) { d in
                    Text("\(d) días").tag(d)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: daysBack) { _, _ in Task { await reload() } }
        }
    }

    private func complianceSection(_ s: PortalSlaInsights) -> some View {
        Section("Cumplimiento") {
            metricRow("Actividades en ventana", "\(s.total)")
            metricRow("Aún abiertas", "\(s.stillOpen)", tint: s.stillOpen > 0 ? .orange : nil)

            complianceBar(
                title: "Respuesta",
                pct: s.responseCompliancePct,
                onTime: s.responseOnTime,
                late: s.responseLate,
                avgHours: s.responseAvgHours
            )
            complianceBar(
                title: "Resolución",
                pct: s.resolutionCompliancePct,
                onTime: s.resolutionOnTime,
                late: s.resolutionLate,
                avgHours: s.resolutionAvgHours
            )

            metricRow("MTTR medio", String(format: "%.1f h", s.mttrMeanHours))
            metricRow("MTTR mediano", String(format: "%.1f h", s.mttrMedianHours))
            metricRow("Muestra MTTR", "\(s.mttrSampleSize)")

            HStack {
                severityPill("Alta", s.high, .red)
                severityPill("Media", s.medium, .orange)
                severityPill("Baja", s.low, .green)
            }
            .padding(.vertical, 2)
        }
    }

    private func backlogSection(_ s: PortalSlaInsights) -> some View {
        Section("Backlog abierto (\(s.backlogOpen))") {
            agingRow("Menos de 24 h", s.aging0to24, .green)
            agingRow("1 a 3 días", s.aging1to3d, .yellow)
            agingRow("3 a 7 días", s.aging3to7d, .orange)
            agingRow("Más de 7 días", s.aging7dPlus, .red)
        }
    }

    private func alertsSection(_ s: PortalSlaInsights) -> some View {
        Section("Alertas") {
            ForEach(s.alerts.indices, id: \.self) { i in
                let a = s.alerts[i]
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: Self.alertIcon(a.severity))
                        .foregroundColor(Self.alertColor(a.severity))
                    Text(a.message).font(.footnote)
                }
            }
        }
    }

    private func breachesSection(_ s: PortalSlaInsights) -> some View {
        Section("Incumplimientos (\(s.breaches.count))") {
            ForEach(s.breaches) { b in
                VStack(alignment: .leading, spacing: 4) {
                    Text(b.displayTitle).font(.subheadline).bold()
                    HStack(spacing: 8) {
                        OpsStatusChip(text: b.typeLabel)
                        Text(b.hoursLateLabel).font(.caption).foregroundColor(.red)
                        if !b.priority.isEmpty {
                            Text(b.priority).font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func oldestSection(_ s: PortalSlaInsights) -> some View {
        Section("Lo más viejo sin cerrar") {
            ForEach(s.oldest) { o in
                VStack(alignment: .leading, spacing: 3) {
                    Text(o.displayTitle).font(.subheadline).bold()
                    if !o.title.isEmpty && !o.anNumber.isEmpty {
                        Text(o.title).font(.caption).foregroundColor(.secondary).lineLimit(1)
                    }
                    HStack(spacing: 8) {
                        Text(o.ageLabel).font(.caption).bold().foregroundColor(.orange)
                        if !o.assignee.isEmpty {
                            Text(o.assignee).font(.caption).foregroundColor(.secondary)
                        }
                        if !o.priority.isEmpty {
                            Text(o.priority).font(.caption2).foregroundColor(.secondary)
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func rankingSection(_ s: PortalSlaInsights) -> some View {
        Section("Ranking de técnicos") {
            ForEach(s.techRanking) { t in
                HStack {
                    Text(t.name.isEmpty ? "Técnico \(t.userId)" : t.name)
                        .font(.subheadline)
                    Spacer()
                    Text("\(t.closed) cerradas").font(.caption).foregroundColor(.secondary)
                    Text(t.mttrLabel).font(.caption).bold()
                }
            }
        }
    }

    private func inboxSection(_ s: PortalSlaInsights) -> some View {
        Section("Bandeja por estado") {
            ForEach(s.inboxByStatus.indices, id: \.self) { i in
                let row = s.inboxByStatus[i]
                HStack {
                    Text(row.status).font(.subheadline)
                    Spacer()
                    Text("\(row.count)").font(.subheadline).bold()
                }
            }
        }
    }

    // MARK: Piezas

    private func metricRow(_ label: String, _ value: String, tint: Color? = nil) -> some View {
        HStack {
            Text(label).font(.subheadline)
            Spacer()
            Text(value).font(.subheadline).bold().foregroundColor(tint ?? .primary)
        }
    }

    private func complianceBar(
        title: String, pct: Double, onTime: Int, late: Int, avgHours: Double
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(.subheadline).bold()
                Spacer()
                Text(String(format: "%.0f %%", pct))
                    .font(.subheadline).bold()
                    .foregroundColor(Self.complianceColor(pct))
            }
            ProgressView(value: min(1, max(0, pct / 100)))
                .tint(Self.complianceColor(pct))
            Text("\(onTime) a tiempo · \(late) tarde · media \(String(format: "%.1f", avgHours)) h")
                .font(.caption2).foregroundColor(.secondary)
        }
        .padding(.vertical, 2)
    }

    private func severityPill(_ label: String, _ count: Int, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(count)").font(.headline).foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(color.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func agingRow(_ label: String, _ count: Int, _ color: Color) -> some View {
        HStack {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label).font(.subheadline)
            Spacer()
            Text("\(count)").font(.subheadline).bold()
        }
    }

    /// Verde por encima del 95 %, ámbar por encima del 85, rojo por debajo:
    /// los mismos cortes que usa la web para no contar dos historias distintas.
    private static func complianceColor(_ pct: Double) -> Color {
        if pct >= 95 { return .green }
        if pct >= 85 { return .orange }
        return .red
    }

    private static func alertIcon(_ severity: String) -> String {
        switch severity.lowercased() {
        case "critical", "high": return "exclamationmark.octagon.fill"
        case "warning", "medium": return "exclamationmark.triangle.fill"
        default: return "info.circle"
        }
    }

    private static func alertColor(_ severity: String) -> Color {
        switch severity.lowercased() {
        case "critical", "high": return .red
        case "warning", "medium": return .orange
        default: return .secondary
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        insights = await PortalExtraRepository.shared.slaInsights(daysBack: daysBack)
    }
}
