import SwiftUI

struct LabFlagsView: View {
    @State private var flags: [[String: Any]] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var actingKey: String?

    var body: some View {
        List {
            if let error {
                Text(error).foregroundColor(.red).font(.footnote)
            }
            if isLoading { ProgressView() }
            ForEach(flags, id: \.flagKey) { f in
                let key = ConsoleHelpers.mapStr(f, "key")
                let enabled = f["enabled"] as? Bool == true
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(key).font(.headline)
                        Text(ConsoleHelpers.mapStr(f, "scope", "description"))
                            .font(.caption).foregroundColor(.secondary)
                    }
                    Spacer()
                    if actingKey == key {
                        ProgressView()
                    } else {
                        Toggle("", isOn: Binding(
                            get: { enabled },
                            set: { newVal in Task { await toggle(key, newVal) } }
                        ))
                        .labelsHidden()
                    }
                }
            }
        }
        .navigationTitle("Feature flags")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            flags = try await LabRepository.shared.flags()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func toggle(_ key: String, _ enabled: Bool) async {
        actingKey = key
        defer { actingKey = nil }
        do {
            _ = try await LabRepository.shared.setFlag(key: key, enabled: enabled)
            await reload()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension [String: Any] {
    fileprivate var flagKey: String { "ff-\(self["key"] ?? UUID().uuidString)" }
}
