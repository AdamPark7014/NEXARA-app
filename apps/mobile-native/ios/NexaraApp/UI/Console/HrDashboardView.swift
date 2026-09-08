import SwiftUI

/// Panel de personas — `GET hr/dashboard`.
///
/// Es la misma carga que dibuja `/erp/hr/kpis` en la web. La app tenía una
/// `HrKpisView` que sacaba la plantilla de `users/hr-staff` y calculaba la
/// rotación a mano en el teléfono; ese número no coincidía con el de la web
/// porque el servidor la calcula sobre altas y bajas de 12 meses, no sobre el
/// listado visible. Aquí se enseña lo que calcula el servidor, sin recalcular.
struct HrDashboardView: View {
    @StateObject private var vm = HrDashboardVM()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if vm.isLoading && vm.data == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                } else if let error = vm.errorText {
                    Text(error).font(.footnote).foregroundColor(.red).padding(.horizontal)
                } else if let data = vm.data {
                    if data.isEmpty {
                        Text("El servidor no devolvió cifras de personas.")
                            .font(.footnote).foregroundColor(.secondary)
                            .frame(maxWidth: .infinity).padding(.top, 40)
                    } else {
                        content(data)
                    }
                }
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
        .navigationTitle("RR. HH. · Personas")
        .refreshable { await vm.load() }
        .task { await vm.load() }
    }

    /// Partido en dos mitades a propósito: `@ViewBuilder` sólo compone hasta
    /// diez hijos por bloque y este panel los rozaba.
    @ViewBuilder
    private func content(_ data: HrPeopleDashboard) -> some View {
        cifras(data)
        detalle(data)
    }

    @ViewBuilder
    private func cifras(_ data: HrPeopleDashboard) -> some View {
        HrDashSection(title: "Plantilla") {
            HrDashGrid(cells: [
                HrDashCell(label: "Headcount", value: "\(data.headcount)"),
                HrDashCell(label: "Bajas / inactivos", value: "\(data.inactiveOrBaja)"),
                HrDashCell(label: "Rotación", value: pct(data.turnoverPct)),
                HrDashCell(label: "Altas 12 m", value: "\(data.hires12m)"),
            ])
        }

        HrDashSection(title: "Asistencia (30 días)") {
            HrDashGrid(cells: [
                HrDashCell(label: "Puntualidad", value: pct(data.punctualityPct)),
                HrDashCell(label: "Retardos", value: "\(data.lateEvents30d)"),
                HrDashCell(label: "Comidas tarde", value: "\(data.lunchLate30d)"),
                HrDashCell(label: "Presentes/día", value: oneDecimal(data.avgDailyPresent)),
            ])
            if data.openAttendanceDays > 0 {
                // Un día abierto es alguien que fichó entrada y no salida: es
                // una incidencia que corregir, no una métrica de rendimiento.
                Text("\(data.openAttendanceDays) día(s) de asistencia sin cerrar")
                    .font(.caption).foregroundColor(.orange)
            }
        }

        HrDashSection(title: "Permisos y desempeño") {
            HrDashGrid(cells: [
                HrDashCell(label: "Pendientes", value: "\(data.pendingLeaves)"),
                HrDashCell(label: "Aprobados (mes)", value: "\(data.approvedLeavesThisMonth)"),
                HrDashCell(label: "Evaluaciones", value: "\(data.reviewsCount)"),
                HrDashCell(label: "Nota media", value: oneDecimal(data.avgPerformanceRating)),
            ])
        }

    }

    @ViewBuilder
    private func detalle(_ data: HrPeopleDashboard) -> some View {
        if !data.present14d.isEmpty {
            HrDashSection(title: "Presencia (14 días)") {
                HrDashBars(points: data.present14d)
            }
        }

        if !data.byDepartment.isEmpty {
            HrDashSection(title: "Plantilla por departamento") {
                let top = Array(data.byDepartment.prefix(8))
                let peak = top.map(\.count).max() ?? 0
                ForEach(top) { row in
                    HrDashRatioRow(label: row.name, value: "\(row.count)",
                                   ratio: peak > 0 ? Double(row.count) / Double(peak) : 0)
                }
            }
        }

        if !data.workloadTop.isEmpty {
            HrDashSection(title: "Carga de trabajo (30 días)") {
                ForEach(data.workloadTop.prefix(10)) { row in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(row.nombre).font(.subheadline.bold())
                            Spacer()
                            Text(row.avgWorkedText).font(.caption).foregroundColor(.secondary)
                        }
                        Text("\(row.department) · \(row.daysPresent) días · \(row.lateCount) retardos")
                            .font(.caption2).foregroundColor(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
        }

        if !data.lateLeaders.isEmpty {
            HrDashSection(title: "Más retardos (30 días)") {
                ForEach(data.lateLeaders.prefix(8)) { row in
                    HStack {
                        Text(row.nombre).font(.subheadline)
                        Spacer()
                        Text("\(row.lateCount)").font(.subheadline.bold()).foregroundColor(.orange)
                    }
                }
            }
        }

        if !data.pendingLeaveQueue.isEmpty {
            HrDashSection(title: "Permisos esperando decisión") {
                ForEach(data.pendingLeaveQueue.prefix(10)) { leave in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(leave.userName.isEmpty ? leave.displayReason : leave.userName)
                                .font(.subheadline.bold())
                            Spacer()
                            Text(leave.typeLabel).font(.caption2).foregroundColor(.secondary)
                        }
                        if !leave.dateRange.isEmpty {
                            Text("\(leave.dateRange) · \(leave.days) día(s)")
                                .font(.caption2).foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
                Text("Se aprueban desde RR. HH. · Permisos.")
                    .font(.caption2).foregroundColor(.secondary)
            }
        }

        if !data.recentReviews.isEmpty {
            HrDashSection(title: "Evaluaciones recientes") {
                ForEach(data.recentReviews.prefix(8)) { review in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(review.userName.isEmpty ? review.displayPeriod : review.userName)
                                .font(.subheadline.bold())
                            Text(review.displayPeriod).font(.caption2).foregroundColor(.secondary)
                        }
                        Spacer()
                        Text(review.ratingText).font(.subheadline.bold())
                    }
                }
            }
        }

        if !data.generatedAt.isEmpty {
            Text("Calculado por el servidor el \(String(data.generatedAt.prefix(19)).replacingOccurrences(of: "T", with: " "))")
                .font(.caption2).foregroundColor(.secondary)
                .padding(.horizontal)
        }
    }

    private func pct(_ value: Double) -> String { String(format: "%.1f %%", value) }
    private func oneDecimal(_ value: Double) -> String { String(format: "%.1f", value) }
}

// MARK: – ViewModel

@MainActor
final class HrDashboardVM: ObservableObject {
    @Published var data: HrPeopleDashboard?
    @Published var isLoading = false
    @Published var errorText: String?

    func load() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            data = try await HrRepository.shared.dashboard()
        } catch {
            errorText = error.toUserMessage(fallback: "No se pudo cargar el panel de personas")
        }
    }
}

// MARK: – Piezas de presentación

private struct HrDashSection<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.caption2.bold())
                .foregroundColor(.secondary)
            content
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}

private struct HrDashCell: Identifiable {
    let label: String
    let value: String
    var id: String { label }
}

private struct HrDashGrid: View {
    let cells: [HrDashCell]

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(cells) { cell in
                VStack(alignment: .leading, spacing: 2) {
                    Text(cell.value).font(.title3.bold())
                    Text(cell.label).font(.caption2).foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct HrDashRatioRow: View {
    let label: String
    let value: String
    let ratio: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label).font(.caption)
                Spacer()
                Text(value).font(.caption.bold())
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.secondary.opacity(0.15))
                    Capsule().fill(Color.accentColor)
                        .frame(width: max(2, geo.size.width * ratio))
                }
            }
            .frame(height: 6)
        }
        .padding(.vertical, 2)
    }
}

/// Barras de la serie diaria, dibujadas a mano.
/// El resto de la app no importa `Charts` en ningún sitio; con la altura
/// relativa basta y no se añade un marco nuevo por una sola pantalla.
private struct HrDashBars: View {
    let points: [HrDatedCount]

    var body: some View {
        let maxCount = points.map(\.count).max() ?? 0
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(points) { point in
                VStack(spacing: 2) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.accentColor.opacity(0.75))
                        .frame(height: barHeight(point.count, max: maxCount))
                    Text(String(point.date.suffix(2)))
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 64, alignment: .bottom)
    }

    /// Una barra siempre mide algo: a cero se dibuja el mínimo para que el día
    /// exista en la serie y no parezca que falta el dato.
    private func barHeight(_ count: Int, max maxCount: Int) -> CGFloat {
        guard maxCount > 0 else { return 2 }
        return CGFloat(2 + (Double(count) / Double(maxCount)) * 46)
    }
}
