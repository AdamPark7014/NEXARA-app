import SwiftUI

/// «Vas a empezar ésta y tienes otra de más prioridad» (contrato B). Espejo de
/// `JustificarOrdenDialog` de Android.
///
/// Es un aviso suave: «Continuar» sigue **siempre**, con o sin texto. Lo que se
/// escriba viaja como `justificacionOrden` junto con la foto de entrada; el
/// servidor marca `saltoPrioridad` y avisa a los jefes, pero no bloquea a nadie —
/// quien está en campo sabrá por qué lo hace.
struct JustificarOrdenSheet: View {
    let aviso: String
    /// «Mejor no»: ni foto ni justificación. Se queda donde estaba por si prefiere
    /// ir primero a la otra actividad.
    let onCancelar: () -> Void
    let onContinuar: (String?) -> Void

    /// Mismo tope que el API (`justificacionOrden.trim().slice(0, 500)`).
    private static let maximo = 500

    @State private var justificacion = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(aviso)
                        .font(.subheadline)
                    Text("Puedes seguir sin escribir nada. Si dices por qué, queda guardado junto a la actividad y tus jefes lo ven.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Orden de tus actividades")
                }

                Section("¿Por qué ésta primero? (opcional)") {
                    TextField(
                        "Ej. Ya estoy en el sitio y la otra es hasta la tarde.",
                        text: $justificacion,
                        axis: .vertical
                    )
                    .lineLimit(2...5)
                    .onChange(of: justificacion) { _, nuevo in
                        if nuevo.count > Self.maximo {
                            justificacion = String(nuevo.prefix(Self.maximo))
                        }
                    }
                }
            }
            .navigationTitle("¿Empiezas ésta?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Mejor no") { onCancelar() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Continuar") {
                        let texto = justificacion.trimmingCharacters(in: .whitespacesAndNewlines)
                        onContinuar(texto.isEmpty ? nil : texto)
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}
