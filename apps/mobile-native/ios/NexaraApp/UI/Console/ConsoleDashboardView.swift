import SwiftUI

// MARK: – ViewModel

@MainActor
final class ConsoleDashboardVM: ObservableObject {
    @Published var activities: [[String: Any]] = []
    @Published var viatics:    [[String: Any]] = []
    @Published var attendance: [[String: Any]] = []
    @Published var isLoading  = false
    @Published var error: String?

    func load() {
        isLoading = true
        error = nil
        Task {
            async let acts  = ExtraRepository.shared.activities()
            async let viats = ExtraRepository.shared.viatics()
            async let atts  = ExtraRepository.shared.attendance()
            let (a, v, t)   = await (acts, viats, atts)
            activities = a
            viatics    = v
            attendance = t
            isLoading  = false
        }
    }
}

// MARK: – Main view

struct ConsoleDashboardView: View {
    @StateObject private var vm = ConsoleDashboardVM()
    @EnvironmentObject var session: SessionStore

    var body: some View {
        Group {
            if vm.isLoading && vm.activities.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else if let err = vm.error {
                VStack(spacing: 12) {
                    Text("No se pudo cargar").font(.headline)
                    Text(err).font(.footnote).foregroundColor(.secondary)
                    Button("Reintentar") { vm.load() }.buttonStyle(.bordered)
                }.padding()
            } else {
                dashContent
            }
        }
        .navigationTitle("Resumen ejecutivo")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load() }
        .task { vm.load() }
    }

    private var dashContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                headerSection
                kpiSection
                if !vm.activities.isEmpty { statusBreakdownSection }
                recentActivitiesSection
                if !vm.viatics.isEmpty { recentViaticsSection }
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }

    // ── Header
    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let name = session.currentUser?.nombre {
                Text("Hola, \(name.components(separatedBy: " ").first ?? name)")
                    .font(.title2).bold()
            }
            Text("Semana: \(dashWeekRange())")
                .font(.caption).foregroundColor(.secondary)
        }
        .padding(.horizontal)
    }

    // ── KPI cards
    private var kpiSection: some View {
        let actTotal   = vm.activities.count
        let actPending = vm.activities.filter { dashIsPending(dVal($0, "estatus", "status")) }.count
        let actDone    = vm.activities.filter { dashIsDone(dVal($0, "estatus", "status")) }.count
        let viaticAmt  = vm.viatics.compactMap { asDouble($0["montoSolicitado"] ?? $0["monto"]) }.reduce(0, +)
        let viaticPend = vm.viatics.filter { dVal($0, "estatusPago", "status").localizedLowercase.contains("pendiente") }.count
        let attUsers   = Set(vm.attendance.compactMap { dVal($0, "userId", "user_id") }).count

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            DashKpiCard(icon: "🗂️", label: "Actividades", value: "\(actTotal)",
                        detail: "\(actPending) pendientes · \(actDone) fin.", accent: .teal)
            DashKpiCard(icon: "💼", label: "Viáticos", value: fmtMxn(viaticAmt),
                        detail: "\(viaticPend) por aprobar", accent: .blue)
            DashKpiCard(icon: "🕒", label: "Asistencia", value: "\(vm.attendance.count) reg.",
                        detail: "\(attUsers) usuarios", accent: .green)
            DashKpiCard(icon: "✅", label: "Viáticos totales", value: "\(vm.viatics.count)",
                        detail: "\(vm.viatics.filter { dashIsDone(dVal($0, "estatusPago","status")) }.count) aprobados",
                        accent: .orange)
        }
        .padding(.horizontal)
    }

    // ── Status breakdown
    private var statusBreakdownSection: some View {
        let groups = Dictionary(grouping: vm.activities) {
            dVal($0, "estatus", "status").ifEmpty("Sin estatus")
        }.sorted { $0.value.count > $1.value.count }
        let total = vm.activities.count

        return VStack(alignment: .leading, spacing: 10) {
            DashSectionHeader(title: "Estado de actividades", detail: "\(total) total")
                .padding(.horizontal)

            VStack(spacing: 10) {
                ForEach(groups, id: \.key) { key, list in
                    let pct = Double(list.count) / Double(max(total, 1))
                    DashStatusRow(status: key, count: list.count, percent: pct)
                }
            }
            .padding()
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal)
        }
    }

    // ── Recent activities
    private var recentActivitiesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            DashSectionHeader(title: "Actividades recientes", detail: "Últimas 8")
                .padding(.horizontal)
            ForEach(vm.activities.prefix(8), id: \.dashId) { a in
                DashActivityCard(item: a).padding(.horizontal)
            }
        }
    }

    // ── Recent viatics
    private var recentViaticsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            DashSectionHeader(title: "Viáticos recientes", detail: "\(vm.viatics.count) registros")
                .padding(.horizontal)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(vm.viatics.prefix(10), id: \.dashId) { v in
                        DashViaticCard(item: v)
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

// MARK: – Subviews

private struct DashKpiCard: View {
    let icon: String; let label: String; let value: String; let detail: String; let accent: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(icon).font(.title3)
                Text(label).font(.caption).foregroundColor(accent).lineLimit(1)
            }
            Text(value).font(.title2).bold()
            Text(detail).font(.caption2).foregroundColor(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(accent.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct DashSectionHeader: View {
    let title: String; let detail: String
    var body: some View {
        HStack {
            Text(title).font(.headline)
            Spacer()
            Text(detail).font(.caption).foregroundColor(.secondary)
        }
    }
}

private struct DashStatusRow: View {
    let status: String; let count: Int; let percent: Double
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(status).font(.subheadline)
                Spacer()
                Text("\(count)  (\(Int(percent * 100))%)").font(.caption).foregroundColor(.secondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(Color(.systemFill)).frame(height: 6)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(dashStatusColor(status))
                        .frame(width: geo.size.width * CGFloat(max(0, min(percent, 1))), height: 6)
                }
            }
            .frame(height: 6)
        }
    }
}

private struct DashActivityCard: View {
    let item: [String: Any]
    var body: some View {
        let title  = dVal(item, "titulo", "title").ifEmpty("Actividad")
        let status = dVal(item, "estatus", "status")
        let assign = dValOpt(item, "responsable.nombre", "asignadoNombre")
        let color  = dashStatusColor(status)
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 10).fill(color.opacity(0.15))
                .frame(width: 42, height: 42)
                .overlay(Text("🗂️").font(.title3))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline).bold().lineLimit(1)
                HStack(spacing: 6) {
                    Text(status.ifEmpty("–"))
                        .font(.caption2).bold().foregroundColor(color)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(color.opacity(0.15)).clipShape(Capsule())
                    if let a = assign {
                        Text("· \(a)").font(.caption).foregroundColor(.secondary).lineLimit(1)
                    }
                }
            }
            Spacer()
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct DashViaticCard: View {
    let item: [String: Any]
    var body: some View {
        let amount = asDouble(item["montoSolicitado"] ?? item["monto"]) ?? 0
        let reason = dVal(item, "razonGasto", "concepto", "descripcion").ifEmpty("Sin descripción")
        let status = dVal(item, "estatusPago", "status", "estatus")
        let color  = dashViaticColor(status)
        VStack(alignment: .leading, spacing: 6) {
            Text("💼").font(.title2)
            Text(fmtMxn(amount)).font(.headline).bold()
            Text(reason).font(.caption).foregroundColor(.secondary).lineLimit(2)
            Text(status.ifEmpty("–"))
                .font(.caption2).bold().foregroundColor(color)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(color.opacity(0.15)).clipShape(Capsule())
        }
        .frame(width: 160)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: – Helpers (private to this file, prefixed to avoid conflicts)

private func dVal(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let str: String
            if let ss = v as? String { str = ss }
            else if let n = v as? NSNumber { str = n.stringValue }
            else { str = String(describing: v) }
            if !str.isEmpty && str != "null" { return str }
        }
    }
    return ""
}

private func dValOpt(_ m: [String: Any], _ keys: String...) -> String? {
    for k in keys {
        if let v = m[k] {
            let str: String
            if let ss = v as? String { str = ss }
            else if let n = v as? NSNumber { str = n.stringValue }
            else { str = String(describing: v) }
            if !str.isEmpty && str != "null" { return str }
        }
    }
    return nil
}

private func asDouble(_ v: Any?) -> Double? {
    if let d = v as? Double { return d }
    if let n = v as? NSNumber { return n.doubleValue }
    if let s = v as? String { return Double(s) }
    return nil
}

private func fmtMxn(_ v: Double) -> String {
    let n = NumberFormatter()
    n.numberStyle = .currency; n.currencySymbol = "$"; n.maximumFractionDigits = 0
    return n.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

private func dashWeekRange() -> String {
    let cal = Calendar.current
    let today = Date()
    guard let monday = cal.dateInterval(of: .weekOfYear, for: today)?.start else { return "" }
    let sunday = cal.date(byAdding: .day, value: 6, to: monday)!
    let fmt = DateFormatter(); fmt.dateFormat = "d MMM"; fmt.locale = Locale(identifier: "es_MX")
    return "\(fmt.string(from: monday)) – \(fmt.string(from: sunday))"
}

private func dashIsPending(_ s: String) -> Bool {
    let l = s.localizedLowercase
    return l.contains("pendiente") || l.contains("proceso") || l.contains("asignad")
}
private func dashIsDone(_ s: String) -> Bool {
    let l = s.localizedLowercase
    return l.contains("finaliz") || l.contains("complet") || l.contains("aprobad")
}

private func dashStatusColor(_ s: String) -> Color {
    let l = s.localizedLowercase
    if l.contains("finaliz") || l.contains("complet") { return .green }
    if l.contains("proceso") || l.contains("progreso") { return .blue }
    if l.contains("pendiente") || l.contains("asignad") { return .orange }
    if l.contains("cancelad") || l.contains("rechazad") { return .red }
    return .purple
}

private func dashViaticColor(_ s: String) -> Color {
    let l = s.localizedLowercase
    if l.contains("aprobad") { return .green }
    if l.contains("pendiente") { return .orange }
    return Color.secondary
}

extension String {
    fileprivate func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var dashId: String {
        if let n = self["id"] as? Int { return String(n) }
        if let s = self["id"] as? String { return s }
        return UUID().uuidString
    }
}
