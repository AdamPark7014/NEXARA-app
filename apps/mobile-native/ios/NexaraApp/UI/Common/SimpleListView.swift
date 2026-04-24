import SwiftUI

/// Fila genérica (equivalente a SimpleRow de Android).
struct SimpleRow: Identifiable, Hashable {
    var id: String
    var title: String
    var subtitle: String?
    var trailing: String?
    var meta: String?
}

/// Vista reutilizable con estados loading/error/empty/list.
struct SimpleListView: View {
    let title: String
    let rows: [SimpleRow]
    let isLoading: Bool
    let errorMessage: String?
    let onRetry: () -> Void
    let header: String?

    var body: some View {
        List {
            if let header, !header.isEmpty {
                Section { Text(header).font(.footnote).foregroundColor(.secondary) }
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
            } else {
                ForEach(rows) { row in
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
