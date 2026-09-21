import SwiftUI

/// Piezas compartidas de Viáticos: el campo de importe y el vocabulario de
/// estados. Viven aparte porque las usan las cuatro pantallas del módulo.

/// Campo de importe: teclado numérico, moneda agrupada mientras se escribe y
/// cifra grande.
///
/// `crudo` guarda el texto **sin formato** —dígitos y a lo sumo un punto—, que
/// es lo que `Dinero.parsearCentavos` entiende. Las comas de millares solo se
/// pintan, a través de un `Binding` que formatea al leer y limpia al escribir:
/// así nunca acaba una coma dentro de la petición.
struct CampoImporte: View {
    let titulo: String
    @Binding var crudo: String
    var ayuda: String?
    var error: String?
    var habilitado: Bool = true

    private var texto: Binding<String> {
        Binding(
            get: { Dinero.formatearEntrada(crudo) },
            set: { crudo = Dinero.sanitizarEntrada($0) }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(titulo)
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                Text("$")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField("0.00", text: texto)
                    .keyboardType(.decimalPad)
                    .font(.system(.title, design: .rounded).weight(.bold))
                    .multilineTextAlignment(.trailing)
                    .disabled(!habilitado)
                    .accessibilityLabel(titulo)
                    .accessibilityValue(
                        Dinero.parsearCentavos(crudo).map { Dinero.pesos($0) } ?? "sin capturar"
                    )
            }
            .padding(.horizontal, 14)
            // 56 pt de alto: se toca con guantes y sin mirar.
            .frame(minHeight: 56)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(error == nil ? Color.clear : NxTone.danger.fg, lineWidth: 1)
            )

            if let error {
                Text(error).font(.caption).foregroundStyle(NxTone.danger.fg)
            } else if let ayuda, !ayuda.isEmpty {
                Text(ayuda).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// Un importe con su etiqueta. `nil` se lee «—»: no es cero, es que no lo hay.
struct ImporteLabel: View {
    let titulo: String
    let centavos: Int?
    var tono: NxTone = .neutral

    private var texto: String { centavos.map { Dinero.pesos($0) } ?? "—" }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(titulo).font(.caption).foregroundStyle(.secondary)
            Text(texto)
                .font(.title3.weight(.bold))
                .foregroundStyle(tono == .neutral ? Color.primary : tono.fg)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(titulo): \(centavos == nil ? "sin dato" : texto)")
    }
}

/// Estado y liquidación de un viático, en chips.
struct ChipsDeViatico: View {
    let viatico: Viatico

    var body: some View {
        HStack(spacing: 6) {
            NxStatusChip(text: viatico.estatus.isEmpty ? "—" : viatico.estatus, tone: viatico.tonoEstatus)
            if let resumen = viatico.liquidacion?.resumenCorto {
                NxStatusChip(text: resumen, tone: viatico.liquidacion?.tono ?? .neutral)
            }
            if !viatico.repartos.isEmpty {
                NxStatusChip(text: "Repartido en \(viatico.repartos.count)", tone: .info)
            }
        }
    }
}
