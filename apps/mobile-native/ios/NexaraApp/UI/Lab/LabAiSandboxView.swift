import SwiftUI

struct LabAiSandboxView: View {
    @State private var model = "gpt-4o-mini"
    @State private var systemPrompt = ""
    @State private var prompt = ""
    @State private var output = ""
    @State private var meta = ""
    @State private var running = false

    private let models = ["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet-20241022"]

    var body: some View {
        Form {
            Section("Modelo") {
                Picker("Modelo", selection: $model) {
                    ForEach(models, id: \.self) { Text($0).tag($0) }
                }
            }
            Section("System prompt (opcional)") {
                TextEditor(text: $systemPrompt)
                    .frame(minHeight: 60)
            }
            Section("Prompt") {
                TextEditor(text: $prompt)
                    .frame(minHeight: 100)
            }
            Section {
                Button(running ? "Ejecutando…" : "Ejecutar") { Task { await run() } }
                    .disabled(running || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if !meta.isEmpty {
                Section("Meta") {
                    Text(meta).font(.caption).foregroundColor(.secondary)
                }
            }
            if !output.isEmpty {
                Section("Salida") {
                    Text(output)
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                }
            }
        }
        .navigationTitle("AI Sandbox")
    }

    private func run() async {
        running = true
        defer { running = false }
        output = ""
        meta = ""
        do {
            let res = try await LabRepository.shared.runAi(
                model: model,
                prompt: prompt,
                systemPrompt: systemPrompt.nilIfEmpty
            )
            output = ConsoleHelpers.mapStr(res, "output")
            let provider = ConsoleHelpers.mapStr(res, "provider")
            let elapsed = ConsoleHelpers.mapStr(res, "elapsedMs")
            let mock = (res["isMock"] as? Bool) == true ? " · mock" : ""
            meta = "\(provider) · \(elapsed) ms\(mock)"
        } catch {
            output = error.localizedDescription
        }
    }
}
