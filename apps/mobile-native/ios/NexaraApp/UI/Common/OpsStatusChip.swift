import SwiftUI

/// Chip de estatus que usan las pantallas del portal de clientes. Recibe el
/// estado crudo del API y lo pinta en palabras y con el color de su tono.
struct OpsStatusChip: View {
    let text: String

    var body: some View {
        NxStatusChip(status: text)
    }
}
