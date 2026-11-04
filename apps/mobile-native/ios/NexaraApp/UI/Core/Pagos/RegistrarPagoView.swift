import SwiftUI

/// «Registrar pago»: a quién, cuánto, de qué, qué periodo cubre, una nota y el comprobante.
///
/// Nace en borrador: el dinero no se mueve hasta que alguien lo marque pagado, con su
/// confirmación. Solo se manda con señal y la lista se relee con lo que diga el servidor;
/// mientras falle, la hoja se queda con lo que se escribió y enseña su mensaje.
///
/// Espejo de `AsignarViaticoView` (elegir persona) y `NuevoViaticoView` (la foto).
struct RegistrarPagoView: View {
    let onRegistrado: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var personas: [PersonaAsignable] = []
    @State private var cargandoPersonas = true
    @State private var consulta = ""
    @State private var persona: PersonaAsignable?
    @State private var importe = ""
    @State private var concepto = ""
    @State private var desde = Date()
    @State private var hasta = Date()
    @State private var nota = ""
    @State private var comprobante: CapturedGeoPhoto?
    @State private var camara = false
    @State private var enviando = false
    @State private var error: String?

    private var centavos: Int { Dinero.parsearCentavos(importe) ?? 0 }

    private var falta: String? {
        PagosRules.faltaParaRegistrar(
            personaId: persona?.id,
            centavos: centavos,
            concepto: concepto,
            desde: desde,
            hasta: hasta
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Registrar pago")
                    .font(NxType.headlineSmall)
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)

                quien

                CampoImporte(titulo: "¿Cuánto?", crudo: $importe, ayuda: nil, error: nil, habilitado: !enviando)

                CampoDelineado(
                    etiqueta: "Concepto",
                    texto: $concepto,
                    ayuda: "Por ejemplo: quincena, bono o anticipo.",
                    habilitado: !enviando,
                    maxLargo: 255
                )

                VStack(alignment: .leading, spacing: 8) {
                    NxSectionHeader(title: "Periodo que cubre")
                    DatePicker("Desde", selection: $desde, displayedComponents: .date)
                        .font(NxType.bodyMedium)
                        .tint(NxColors.brand)
                        .disabled(enviando)
                    DatePicker("Hasta", selection: $hasta, in: desde..., displayedComponents: .date)
                        .font(NxType.bodyMedium)
                        .tint(NxColors.brand)
                        .disabled(enviando)
                }

                CampoDelineado(
                    etiqueta: "Nota (opcional)",
                    texto: $nota,
                    multilinea: true,
                    minLineas: 2,
                    habilitado: !enviando,
                    maxLargo: 500
                )

                FotoDeFormulario(
                    titulo: "Comprobante (opcional)",
                    pista: "La foto de la transferencia o el recibo.",
                    foto: comprobante,
                    habilitado: !enviando,
                    onTomar: { camara = true }
                )

                if let error {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(spacing: 10) {
                    Button {
                        registrar()
                    } label: {
                        HStack(spacing: 10) {
                            if enviando {
                                SpinnerDeBoton()
                                Text("Enviando…")
                            } else {
                                Text("Registrar pago").fontWeight(.bold)
                            }
                        }
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 56, llenaAncho: true))
                    .disabled(enviando || falta != nil)

                    Button("Cancelar") { dismiss() }
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                        .disabled(enviando)

                    Text(falta ?? "Queda en borrador: el dinero no se mueve hasta que lo marques pagado.")
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial()
        .task {
            if personas.isEmpty {
                personas = await CoreRepository.shared.personasAsignables()
                    .sorted { $0.nombre.localizedCaseInsensitiveCompare($1.nombre) == .orderedAscending }
            }
            cargandoPersonas = false
        }
        .fullScreenCover(isPresented: $camara) {
            GeoPhotoCaptureView(
                title: "Comprobante",
                confirmLabel: "Usar esta foto",
                // El comprobante se fotografía donde sea: la ubicación no bloquea el pago.
                requireLocation: false,
                onConfirm: { foto in
                    comprobante = foto
                    camara = false
                    return nil
                },
                onCancel: { camara = false }
            )
        }
    }

    /// La persona: elegida se enseña sola y un toque la deshace.
    @ViewBuilder
    private var quien: some View {
        NxSectionHeader(title: "¿A quién?")
        if let persona {
            ChipDeFiltroMaterial(
                texto: persona.nombre,
                seleccionado: true,
                fondoActivo: NxColors.brandSoft2,
                textoActivo: NxColors.brandDeep,
                alto: viaticoAlturaToque,
                llenaAncho: true,
                habilitado: !enviando
            ) {
                self.persona = nil
            }
        } else {
            CampoDelineado(etiqueta: "Buscar persona", texto: $consulta)
            if cargandoPersonas {
                NxSkeletonList(itemCount: 3, itemHeight: 40)
            } else if personas.isEmpty {
                Text("No se pudo leer la lista de personas. Cierra esta hoja e intenta de nuevo.")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(AsignarViaticoRules.filtrar(personas, consulta: consulta)) { p in
                    Button {
                        persona = p
                    } label: {
                        Text(p.nombre)
                            .font(.system(size: 15))
                            .foregroundStyle(NxColors.fg)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func registrar() {
        guard falta == nil, let persona, !enviando else { return }
        enviando = true
        error = nil
        let usuarioId = persona.id
        let cifra = centavos
        let texto = concepto
        let inicio = desde
        let fin = hasta
        let observacion = nota
        let foto = comprobante
        Task { @MainActor in
            do {
                try await PagosEmpleadosRepository.shared.registrar(
                    usuarioId: usuarioId,
                    centavos: cifra,
                    concepto: texto,
                    desde: inicio,
                    hasta: fin,
                    nota: observacion,
                    comprobante: foto
                )
                enviando = false
                onRegistrado()
                dismiss()
            } catch {
                enviando = false
                self.error = error.toUserMessage(fallback: "No se pudo registrar el pago")
            }
        }
    }
}
