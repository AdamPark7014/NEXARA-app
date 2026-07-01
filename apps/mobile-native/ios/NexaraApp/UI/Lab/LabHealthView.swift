import SwiftUI

struct LabHealthView: View {
    @State private var basic = ""
    @State private var summary: [String: Any] = [:]
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundColor(.red) }
            }
            Section("Health endpoint") {
                if isLoading { ProgressView() }
                else {
                    Text(basic.isEmpty ? "—" : basic)
                        .font(.system(.caption, design: .monospaced))
                }
            }
            if !summary.isEmpty {
                Section("Resumen LAB") {
                    row("Timestamp", ConsoleHelpers.mapStr(summary, "timestamp").prefix(19).description)
                    row("Uptime", formatUptime(summary["uptime"]))
                    row("Memoria RSS", "\(ConsoleHelpers.mapStr(summary, "memoryMB")) MB")
                    if let counts = summary["counts"] as? [String: Any] {
                        row("Usuarios", ConsoleHelpers.mapStr(counts, "users"))
                        row("Proyectos", ConsoleHelpers.mapStr(counts, "projects"))
                        row("OT abiertas", ConsoleHelpers.mapStr(counts, "openTickets"))
                    }
                }
            }
            Section {
                Button("Actualizar") { Task { await load() } }
            }
        }
        .navigationTitle("API Health")
        .task { await load() }
    }

    @ViewBuilder
    private func row(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label); Spacer(); Text(value).foregroundColor(.secondary) }
        }
    }

    private func formatUptime(_ value: Any?) -> String {
        let sec: Double
        if let d = value as? Double { sec = d }
        else if let n = value as? NSNumber { sec = n.doubleValue }
        else { return "" }
        let h = Int(sec) / 3600
        let m = (Int(sec) % 3600) / 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            async let b = LabRepository.shared.basicHealth()
            async let s = LabRepository.shared.healthSummary()
            basic = try await b
            summary = try await s
        } catch {
            self.error = error.localizedDescription
        }
    }
}
