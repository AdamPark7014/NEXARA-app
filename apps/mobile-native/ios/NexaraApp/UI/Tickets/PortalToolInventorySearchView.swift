import SwiftUI

/// GET `tool-requests/inventory/search?q=` — buscador de inventario de
/// herramienta por nombre, modelo o número de serie.
///
/// Honestidad sobre el alcance: en Android este endpoint está cableado en
/// `ConsoleRepository.toolInventorySearch` pero NINGUNA pantalla lo usa todavía.
/// Aquí sí hay pantalla, pero es de consulta: la API no expone un `POST` de
/// solicitud de herramienta que el móvil pueda llamar, así que esto localiza la
/// pieza y su estado, no la reserva.
struct PortalToolInventorySearchView: View {
    /// Cuando se abre como selector desde otra pantalla, esto recoge la elección.
    var onPick: ((PortalToolInventoryOption) -> Void)?

    @State private var query = ""
    @State private var results: [PortalToolInventoryOption] = []
    @State private var isSearching = false
    @State private var searched = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Nombre, modelo o serie…", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { Task { await search() } }
                if !query.isEmpty {
                    Button {
                        query = ""; results = []; searched = false
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding()

            if isSearching {
                Spacer(); ProgressView("Buscando…"); Spacer()
            } else if results.isEmpty {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "wrench.and.screwdriver")
                        .font(.largeTitle).foregroundColor(.secondary)
                    Text(searched ? "Sin coincidencias" : "Busca una herramienta")
                        .font(.headline)
                    Text(searched
                         ? "Prueba con el número de serie completo."
                         : "Escribe y pulsa intro para buscar en el inventario.")
                        .font(.footnote).foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
                Spacer()
            } else {
                List(results) { opt in
                    if let onPick {
                        Button { onPick(opt) } label: { row(opt) }
                            .buttonStyle(.plain)
                            .disabled(!opt.isAvailable)
                    } else {
                        row(opt)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Inventario de herramienta")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ opt: PortalToolInventoryOption) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(opt.displayTitle).font(.subheadline).bold()
                if !opt.subtitle.isEmpty {
                    Text(opt.subtitle).font(.caption).foregroundColor(.secondary)
                }
            }
            Spacer()
            // Lo no disponible se lista igual, en gris: saber que existe y está
            // asignado a otro es información útil, esconderlo no.
            Text(opt.status.isEmpty ? "—" : opt.status)
                .font(.caption2).bold()
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background((opt.isAvailable ? Color.green : Color.gray).opacity(0.15))
                .foregroundColor(opt.isAvailable ? .green : .gray)
                .clipShape(Capsule())
        }
        .padding(.vertical, 3)
    }

    private func search() async {
        isSearching = true
        defer { isSearching = false; searched = true }
        results = await PortalExtraRepository.shared.searchToolInventory(q: query)
    }
}
