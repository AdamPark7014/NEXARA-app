import SwiftUI

/// Chip de estatus (naranja) que usan las pantallas del portal de clientes.
struct OpsStatusChip: View {
    let text: String
    var body: some View {
        Text(text).font(.caption2).bold()
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Color.orange.opacity(0.15)).foregroundColor(.orange)
            .clipShape(Capsule())
    }
}
