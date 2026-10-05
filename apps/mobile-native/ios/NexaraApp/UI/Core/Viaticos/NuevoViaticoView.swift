import SwiftUI

/// «Pedir viático» (Android `NuevoViaticoScreen`): cuánto, en qué, el concepto,
/// la actividad y la foto del ticket.
///
/// La foto se toma con la **misma cámara en vivo de las evidencias**
/// (`GeoPhotoCaptureView`); no hay galería. El servidor exige evidencia, así que
/// sin ella no se manda nada.
///
/// El reparto entre actividades no está aquí a propósito: viaja en el detalle,
/// porque un multipart no lleva listas anidadas y porque a menudo se sabe qué
/// visitas cubrió el viaje solo al volver.
///
/// Se apila sobre la lista; la barra teal «Pedir viático» la pone quien la abre.
struct NuevoViaticoView: View {
    /// Recibe el mensaje que hay que enseñar (enviado, o en cola sin conexión).
    let onCreado: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var importe = ""
    @State private var categoria = Viatico.categorias.first?.clave ?? "COMBUSTIBLE"
    @State private var motivo = ""
    @State private var actividad: MyActivityItem?
    @State private var actividades: [MyActivityItem] = []
    @State private var ticket: CapturedGeoPhoto?
    @State private var camara = false
    @State private var eligiendoActividad = false
    @State private var enviando = false
    @State private var error: String?
    @State private var intentado = false

    private var centavos: Int { Dinero.parsearCentavos(importe) ?? 0 }

    private var errorImporte: String? {
        guard intentado else { return nil }
        if importe.trimmingCharacters(in: .whitespaces).isEmpty { return "Captura cuánto gastaste" }
        if centavos <= 0 { return "El importe tiene que ser mayor que cero" }
        return nil
    }

    private var errorMotivo: String? {
        intentado && motivo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Di en qué se gastó" : nil
    }

    private var completo: Bool {
        centavos > 0 && !motivo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && ticket != nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                CampoImporte(
                    titulo: "¿Cuánto?",
                    crudo: $importe,
                    ayuda: "Lo que pusiste de tu bolsa, con centavos.",
                    error: errorImporte,
                    habilitado: !enviando
                )

                VStack(alignment: .leading, spacing: 8) {
                    NxSectionHeader(title: "¿En qué?")
                    CoreFlowLayout(spacing: 8) {
                        ForEach(Viatico.categorias, id: \.clave) { item in
                            ChipDeFiltroMaterial(
                                texto: item.etiqueta,
                                seleccionado: categoria == item.clave,
                                // `FilterChip` sin colores propios: secondaryContainer del tema.
                                fondoActivo: NxColors.brandSoft2,
                                textoActivo: NxColors.brandDeep,
                                alto: viaticoAlturaToque,
                                habilitado: !enviando
                            ) {
                                categoria = item.clave
                            }
                        }
                    }
                }

                CampoDelineado(
                    etiqueta: "Concepto",
                    texto: $motivo,
                    error: errorMotivo,
                    multilinea: true,
                    minLineas: 2,
                    habilitado: !enviando
                )

                selectorActividad

                fotoDelTicket

                if let error {
                    NxErrorBlock(message: error)
                }

                VStack(spacing: 10) {
                    Button {
                        pedir()
                    } label: {
                        HStack(spacing: 10) {
                            if enviando {
                                SpinnerDeBoton()
                                Text("Enviando…")
                            } else {
                                Text("Pedir viático").fontWeight(.bold)
                            }
                        }
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 56, llenaAncho: true))
                    .disabled(enviando)

                    Button("Cancelar") { dismiss() }
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                        .disabled(enviando)

                    Text("Sin señal se guarda en la cola con su foto y sale solo al volver la red.")
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(NxSpacing.l)
        }
        .scrollDismissesKeyboard(.interactively)
        .nxScreenBackground()
        .task { await cargarActividades() }
        .fullScreenCover(isPresented: $camara) {
            GeoPhotoCaptureView(
                title: "Foto del ticket",
                confirmLabel: "Usar esta foto",
                // Un ticket se fotografía donde caiga —gasolinera, caseta,
                // sótano—: la ubicación viaja si la hay, pero no bloquea el gasto.
                requireLocation: false,
                onConfirm: { foto in
                    ticket = foto
                    camara = false
                    return nil
                },
                onCancel: { camara = false }
            )
        }
        .sheet(isPresented: $eligiendoActividad) {
            HojaElegirActividadViatico(
                titulo: "¿A qué actividad se carga?",
                pista: "Si el viaje cubrió varias, elige una ahora y repártelo después desde el detalle.",
                actividades: actividades,
                textoVacio: "No traes actividades abiertas."
            ) { item in
                actividad = item
                eligiendoActividad = false
            }
        }
    }

    // MARK: Piezas

    /// Qué actividad carga el gasto (Android `SelectorActividad`). Opcional:
    /// hay viáticos que no son de ninguna.
    private var selectorActividad: some View {
        HStack(alignment: .center, spacing: 10) {
            Button {
                eligiendoActividad = true
            } label: {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Actividad")
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                    Text(actividad.map { ViaticoTextos.etiqueta($0) } ?? "Sin actividad (opcional)")
                        .font(NxType.bodyLarge)
                        .foregroundStyle(actividad == nil ? NxColors.muted : NxColors.fg)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, minHeight: viaticoAlturaToque, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(NxPressableStyle())
            .disabled(enviando)

            if actividad != nil {
                Button("Quitar") { actividad = nil }
                    .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                    .disabled(enviando)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nxCardSurface()
    }

    /// La evidencia (Android `FotoDelTicket`). Sin ella el servidor rechaza el
    /// alta, así que se pide de frente.
    private var fotoDelTicket: some View {
        NxPanelShell {
            VStack(alignment: .leading, spacing: 10) {
                NxSectionHeader(title: "Foto del ticket", subtitle: "Obligatoria: es el comprobante del gasto.")
                if let ticket {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: 180)
                        .overlay {
                            Image(uiImage: ticket.image)
                                .resizable()
                                .scaledToFill()
                        }
                        .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                        .accessibilityElement()
                        .accessibilityLabel("Ticket fotografiado")
                }
                Button {
                    camara = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                        Text(ticket == nil ? "Tomar foto del ticket" : "Tomar otra")
                    }
                }
                .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                .disabled(enviando)
            }
        }
    }

    // MARK: Datos

    /// Aparte: sin actividades se puede pedir igual un viático suelto.
    private func cargarActividades() async {
        if let abiertas = try? await CoreRepository.shared.myActivities().open {
            actividades = abiertas
        }
    }

    /// Mientras falle, la pantalla se queda con lo que la persona tecleó.
    private func pedir() {
        intentado = true
        guard completo, let ticket, !enviando else { return }
        enviando = true
        error = nil
        Task {
            do {
                let encolado = try await ViaticosRepository.shared.crear(
                    centavos: centavos,
                    motivo: motivo,
                    categoria: categoria,
                    actividadId: actividad?.id,
                    ticket: ticket
                )
                enviando = false
                onCreado(
                    encolado
                        ? "Sin conexión: tu viático quedó en la cola con su foto y sale solo al volver la señal."
                        : "Viático solicitado"
                )
                dismiss()
            } catch {
                enviando = false
                self.error = error.toUserMessage(fallback: "No se pudo pedir el viático")
            }
        }
    }
}
