import SwiftUI

/// Extrae primer valor no vacío entre varias keys.
func s(_ m: [String: Any], _ keys: String...) -> String? {
    for k in keys {
        if let v = m[k] {
            let str: String
            if let ss = v as? String { str = ss }
            else if let n = v as? NSNumber { str = n.stringValue }
            else if let b = v as? Bool { str = b ? "true" : "false" }
            else { str = String(describing: v) }
            if !str.isEmpty && str != "null" && str != "<null>" { return str }
        }
    }
    return nil
}

func id(_ m: [String: Any]) -> String {
    s(m, "id", "uuid", "_id", "folio", "code", "number") ?? UUID().uuidString
}

/// Convierte un Map arbitrario en una SimpleRow aplicando keys de preferencia.
func toRow(_ m: [String: Any],
           title: [String],
           subtitle: [String] = [],
           meta: [String] = ["createdAt", "updatedAt", "date", "fecha", "fechaCreacion"],
           status: [String] = ["status", "estatus", "state", "estado"]) -> SimpleRow {
    SimpleRow(
        id: id(m),
        title: s(m, title: title) ?? "#\(id(m))",
        subtitle: s(m, title: subtitle),
        trailing: s(m, title: status),
        meta: s(m, title: meta)
    )
}

/// Overload conveniencia que acepta arrays.
func s(_ m: [String: Any], title keys: [String]) -> String? {
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

// MARK: - ViewModel genérico

@MainActor
final class SimpleListVM: ObservableObject {
    @Published var rows: [SimpleRow] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    var loader: (() async -> [SimpleRow])?

    func load() {
        guard let loader else { return }
        Task {
            isLoading = true
            errorMessage = nil
            let result = await loader()
            rows = result
            isLoading = false
        }
    }
}

// MARK: - Pantalla genérica

struct GenericListModuleView: View {
    let title: String
    let loader: () async -> [SimpleRow]

    @StateObject private var vm = SimpleListVM()

    var body: some View {
        SimpleListView(
            title: title,
            rows: vm.rows,
            isLoading: vm.isLoading,
            errorMessage: vm.errorMessage,
            onRetry: { vm.load() },
            header: nil
        )
        .onAppear {
            if vm.loader == nil {
                vm.loader = loader
                vm.load()
            }
        }
    }
}
