import SwiftUI

/// Fila genérica (equivalente a SimpleRow de Android).
struct SimpleRow: Identifiable, Hashable {
    var id: String
    var title: String
    var subtitle: String?
    var trailing: String?
    var meta: String?
}

/// Vista reutilizable con estados loading/error/empty/list + búsqueda (paridad Android).
struct SimpleListView: View {
    let title: String
    let rows: [SimpleRow]
    let isLoading: Bool
    let errorMessage: String?
    let onRetry: () -> Void
    let header: String?

    @State private var query = ""

    private var filtered: [SimpleRow] {
        guard !query.isEmpty else { return rows }
        let q = query.lowercased()
        return rows.filter { row in
            [row.title, row.subtitle, row.meta, row.trailing]
                .compactMap { $0 }
                .joined(separator: " ")
                .lowercased()
                .contains(q)
        }
    }

    var body: some View {
        List {
            if let header, !header.isEmpty {
                Section { Text(header).font(.footnote).foregroundColor(.secondary) }
            }
            if !isLoading && errorMessage == nil && !rows.isEmpty {
                Section {
                    Text("\(filtered.count) de \(rows.count) registros")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    HStack {
                        Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                        TextField("Buscar en \(title)", text: $query)
                            .autocorrectionDisabled()
                    }
                }
            }
            if isLoading {
                HStack { Spacer(); ProgressView(); Spacer() }
                    .listRowSeparator(.hidden)
            } else if let errorMessage {
                VStack(spacing: 8) {
                    Text("Error").bold()
                    Text(errorMessage).font(.footnote).foregroundColor(.secondary)
                    Button("Reintentar", action: onRetry).buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
                .listRowSeparator(.hidden)
            } else if rows.isEmpty {
                HStack {
                    Spacer()
                    Text("Sin registros").foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.vertical, 24)
                .listRowSeparator(.hidden)
            } else if filtered.isEmpty && !rows.isEmpty {
                Text("Sin resultados con ese filtro.").foregroundColor(.secondary)
                    .frame(maxWidth: .infinity).padding(.vertical, 24)
                    .listRowSeparator(.hidden)
            } else {
                ForEach(filtered) { row in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(row.title).font(.body).bold()
                            Spacer()
                            if let t = row.trailing {
                                Text(t).font(.caption)
                                    .padding(.horizontal, 8).padding(.vertical, 2)
                                    .background(Color.secondary.opacity(0.15))
                                    .clipShape(Capsule())
                            }
                        }
                        if let s = row.subtitle, !s.isEmpty {
                            Text(s).font(.caption).foregroundColor(.secondary)
                        }
                        if let m = row.meta, !m.isEmpty {
                            Text(m).font(.caption2).foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle(title)
        .listStyle(.plain)
        .refreshable { onRetry() }
    }
}
