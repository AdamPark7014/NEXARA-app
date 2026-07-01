import SwiftUI

struct LabHealthView: View {
    @State private var status = "Comprobando…"
    @State private var isLoading = true

    var body: some View {
        List {
            Section("API") {
                if isLoading {
                    ProgressView()
                } else {
                    Text(status)
                        .font(.system(.body, design: .monospaced))
                }
            }
            Section {
                Text("NEXARA LAB — sandbox técnico. Paridad con el panel web /lab.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
        }
        .navigationTitle("API Health")
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await ApiClient.shared.get("health")
            status = String(data: data, encoding: .utf8) ?? "OK"
        } catch {
            status = error.localizedDescription
        }
    }
}
