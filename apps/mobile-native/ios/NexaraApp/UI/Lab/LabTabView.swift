import SwiftUI

/// Hub LAB — paridad Android `LabNavHost` y web `/lab`.
struct LabTabView: View {
    let onExit: () -> Void
    @State private var path: [String] = []
    @State private var deepLinkModuleKey: String?
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared

    var body: some View {
        NavigationStack(path: $path) {
            LabHomeView(onOpen: { path.append($0) }, onExit: onExit)
                .navigationDestination(for: String.self) { key in
                    labScreen(key)
                }
        }
        .deepLinkModulePresenter(panel: .lab, presentedKey: $deepLinkModuleKey)
        .onAppear { if let k = deepLink.consumeModule(for: .lab) { deepLinkModuleKey = k } }
        .onChange(of: deepLink.pending) { _, _ in
            if let k = deepLink.consumeModule(for: .lab) { deepLinkModuleKey = k }
        }
    }

    @ViewBuilder
    private func labScreen(_ key: String) -> some View {
        switch key {
        case "health": LabHealthView()
        case "flags": LabFlagsView()
        case "ai": LabAiSandboxView()
        default: LabHealthView()
        }
    }
}

private struct LabHomeView: View {
    let onOpen: (String) -> Void
    let onExit: () -> Void
    @State private var summary: [String: Any] = [:]
    @State private var loading = true

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("NEXARA LAB").font(.title2).bold()
                    Text("Sandbox técnico — health, flags y AI.")
                        .font(.footnote).foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }
            if loading {
                Section { ProgressView() }
            } else if !summary.isEmpty {
                Section("Estado API") {
                    if let counts = summary["counts"] as? [String: Any] {
                        metric("Usuarios", ConsoleHelpers.mapStr(counts, "users"))
                        metric("Proyectos", ConsoleHelpers.mapStr(counts, "projects"))
                        metric("OT abiertas", ConsoleHelpers.mapStr(counts, "openTickets"))
                    }
                    metric("Memoria", "\(ConsoleHelpers.mapStr(summary, "memoryMB")) MB")
                    metric("Uptime", formatUptime(summary["uptime"]))
                }
            }
            Section("Herramientas") {
                toolRow("health", "❤️", "API Health", "Estado de servicios y métricas")
                toolRow("flags", "🚩", "Feature flags", "Activar o desactivar flags")
                toolRow("ai", "🤖", "AI Sandbox", "Probar prompts contra el motor IA")
            }
            Section {
                Button("Cambiar panel", role: .destructive) { onExit() }
            }
        }
        .navigationTitle("LAB")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Paneles", action: onExit)
            }
        }
        .task { await loadSummary() }
    }

    private func toolRow(_ key: String, _ icon: String, _ title: String, _ subtitle: String) -> some View {
        Button { onOpen(key) } label: {
            HStack(spacing: 12) {
                Text(icon).font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundColor(.primary)
                    Text(subtitle).font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundColor(.secondary)
            }
        }
    }

    @ViewBuilder
    private func metric(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack {
                Text(label)
                Spacer()
                Text(value).foregroundColor(.secondary).monospacedDigit()
            }
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

    private func loadSummary() async {
        loading = true
        defer { loading = false }
        summary = (try? await LabRepository.shared.healthSummary()) ?? [:]
    }
}
