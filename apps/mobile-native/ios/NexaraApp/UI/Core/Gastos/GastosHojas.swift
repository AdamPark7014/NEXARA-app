import SwiftUI

/// Las dos hojas de Gastos (`GastosHojas.kt`): la ficha de uno y el alta de
/// otro nuevo. Van en hojas porque ninguna es un sitio donde uno se quede: se
/// abren, se resuelve una cosa y se cierran volviendo a la lista.
///
/// Ninguna dibuja tarjetas por dentro: la hoja ya es una superficie (#F8FAFC,
/// `surfaceContainerLow` del tema de Android), y meterle recuadros sería la caja
/// dentro de la caja.

// MARK: - Ficha de un gasto

/// La ficha de un gasto y lo que se puede decidir sobre él: **qué se compró y
/// cuánto**, **en qué va**, **dónde está el papel** y **qué puedo hacer**. El
/// comprobante se enseña aquí mismo: quien autoriza necesita mirar el ticket
/// antes de decir que sí.
///
/// Los botones de decidir solo aparecen cuando el estado los permite y la
/// sesión administra contabilidad; la autoridad sigue siendo el 403 del servidor.
struct HojaDeGasto: View {
    let clave: String
    @ObservedObject var modelo: GastosModelo
    let onCerrar: () -> Void

    /// El rechazo pide motivo, y se teclea aquí mismo.
    @State private var pidiendoMotivo = false
    @State private var motivo = ""

    var body: some View {
        Group {
            if let gasto = modelo.gasto(clave: clave) {
                ScrollView {
                    ficha(gasto)
                        .padding(.horizontal, 20)
                        .padding(.top, 24)
                        .padding(.bottom, 28)
                }
                .scrollDismissesKeyboard(.interactively)
            } else {
                // El gasto ya no está en la lista (otro lo borró): nada que enseñar.
                Color.clear.onAppear { onCerrar() }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(NxColors.surface)
        .presentationCornerRadius(28)
        .interactiveDismissDisabled(modelo.enviando)
    }

    @ViewBuilder
    private func ficha(_ gasto: Gasto) -> some View {
        let estado = GastosRules.estadoDe(gasto)
        let faltaTicket = GastosRules.sinComprobante(gasto)

        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(GastosRules.conceptoTexto(gasto))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(alignment: .center, spacing: 10) {
                    Text(GastosRules.montoTexto(gasto))
                        .font(.system(size: 26, weight: .bold).monospacedDigit())
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    NxStatusDot(
                        text: GastosRules.etiquetaEstado(gasto),
                        color: GastosRules.colorEstado(estado),
                        fontSize: 13,
                        fontWeight: .semibold
                    )
                }
            }

            VStack(spacing: 0) {
                DatoDeGasto(etiqueta: "Fecha del gasto", valor: GastosRules.fechaLarga(gasto.fechaGasto ?? gasto.fechaSolicitud))
                DatoDeGasto(etiqueta: "Categoría", valor: GastosRules.categoriaTexto(gasto))
                DatoDeGasto(etiqueta: "De quién", valor: GastosRules.solicitanteTexto(gasto))
                DatoDeGasto(etiqueta: "Se repite cada mes", valor: gasto.esRecurrente == true ? "Sí" : nil)
                // El folio de la póliza solo existe cuando el API ya lo escribió.
                DatoDeGasto(etiqueta: "Folio contable", valor: gasto.contabilidadRef)
            }

            VStack(alignment: .leading, spacing: 8) {
                NxDenseSectionHeader(
                    title: "Comprobante",
                    hint: faltaTicket ? "Sin él, el gasto no se puede deducir" : nil
                )
                if faltaTicket {
                    NxStatusDot(
                        text: "Este gasto no tiene comprobante",
                        color: GastosRules.colorEstado(.rechazado),
                        fontSize: 13,
                        fontWeight: .semibold,
                        maxLines: 2
                    )
                } else {
                    AuthenticatedImage(
                        url: gasto.ticketEvidenciaUrl,
                        contentMode: .fit,
                        background: NxColors.sunken
                    )
                    .frame(maxWidth: .infinity)
                    .frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                    .accessibilityLabel("Comprobante del gasto")
                }
            }

            if let id = gasto.idServidor {
                if modelo.puedeDecidir {
                    acciones(id: id, gasto: gasto)
                } else {
                    Text("Autorizar y pagar los hace contabilidad.")
                        .font(.system(size: 12))
                        .foregroundStyle(NxColors.muted)
                }
            }
        }
    }

    /// Un botón por lo que el estado permite ahora mismo: sobre un pendiente se
    /// autoriza o se rechaza, sobre un autorizado se paga, y un pagado o un
    /// rechazado ya no admite nada.
    @ViewBuilder
    private func acciones(id: Int, gasto: Gasto) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if pidiendoMotivo {
                FinanzasCampoContorno(
                    etiqueta: "¿Por qué se rechaza?",
                    texto: $motivo,
                    error: motivo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ? "Sin motivo, quien lo pidió tendrá que preguntarlo" : nil,
                    multilinea: true,
                    lineasMinimas: 2,
                    habilitado: !modelo.enviando,
                    fondo: NxColors.surface
                )
                errorDeAccion
                BotonDeAccionGasto(
                    texto: "Rechazar el gasto",
                    enviando: modelo.enviando,
                    habilitado: !motivo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                    accion: { modelo.rechazar(id, motivo: motivo) }
                )
                Button("Mejor no") {
                    pidiendoMotivo = false
                    motivo = ""
                }
                .font(NxType.labelLarge)
                .buttonStyle(FinanzasBotonEstilo(tipo: .texto))
                .disabled(modelo.enviando)
            } else if GastosRules.puedeAutorizar(gasto) {
                errorDeAccion
                BotonDeAccionGasto(
                    texto: "Autorizar",
                    enviando: modelo.enviando,
                    habilitado: true,
                    accion: { modelo.autorizar(id) }
                )
                Button("Rechazar") { pidiendoMotivo = true }
                    .font(NxType.labelLarge)
                    .buttonStyle(FinanzasBotonEstilo(tipo: .contorno))
                    .disabled(modelo.enviando)
            } else if GastosRules.puedePagar(gasto) {
                errorDeAccion
                BotonDeAccionGasto(
                    texto: "Marcar como pagado",
                    enviando: modelo.enviando,
                    habilitado: true,
                    accion: { modelo.marcarPagado(id) }
                )
                Text("Al marcarlo, el sistema levanta la póliza contable con su folio.")
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.muted)
            } else {
                Text("Este gasto ya está cerrado; no queda nada por decidir.")
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.muted)
            }
        }
    }

    /// Lo que contestó el servidor cuando dijo que no. En Android sale en la
    /// cinta de la pantalla; aquí la hoja la taparía, así que se dice en la hoja.
    @ViewBuilder
    private var errorDeAccion: some View {
        if let error = modelo.errorAccion {
            NxStatusDot(text: error, color: NxColors.danger, fontSize: 12.5, fontWeight: .semibold, maxLines: 4)
        }
    }
}

/// Una línea de la ficha: etiqueta a la izquierda, dato a la derecha. Con
/// `valor` vacío **no se dibuja nada**: una ficha llena de «—» hace creer que
/// faltan datos que no aplican.
private struct DatoDeGasto: View {
    let etiqueta: String
    let valor: String?

    var body: some View {
        if let texto = valor?.trimmingCharacters(in: .whitespacesAndNewlines), !texto.isEmpty {
            VStack(spacing: 0) {
                FinanzasFilaPonderada(pesos: [1, 1.4], espacio: 12) {
                    Text(etiqueta)
                        .font(.system(size: 12.5))
                        .foregroundStyle(NxColors.fg2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(texto)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .padding(.vertical, 9)
                NxRowDivider()
            }
            .accessibilityElement(children: .combine)
        }
    }
}

/// El botón principal de una hoja (`BotonDeAccion`): píldora de marca de 56,
/// con su «Enviando…» a la vista.
private struct BotonDeAccionGasto: View {
    let texto: String
    let enviando: Bool
    let habilitado: Bool
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            if enviando {
                HStack(spacing: 10) {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                        .frame(width: 20, height: 20)
                    Text("Enviando…").font(NxType.labelLarge)
                }
            } else {
                Text(texto).font(.system(size: 14, weight: .bold))
            }
        }
        .buttonStyle(FinanzasBotonEstilo(tipo: .lleno, alto: 56))
        .disabled(!habilitado || enviando)
    }
}

// MARK: - Alta

/// El alta: cuánto, en qué, de cuándo y la foto del ticket. Es la razón de que
/// este módulo tenga pantalla en el teléfono. La foto se toma con la **misma
/// cámara en vivo de las evidencias** (`GeoPhotoCaptureView`, como en Viáticos);
/// no hay galería, porque el servidor exige comprobante.
///
/// El botón dice qué falta en vez de quedarse gris y callado.
struct HojaDeAltaDeGasto: View {
    @ObservedObject var modelo: GastosModelo
    let onCerrar: () -> Void

    @State private var importe = ""
    @State private var concepto = ""
    @State private var categoria = GastosRules.categoriaPorOmision
    @State private var recurrente = false
    @State private var ticket: CapturedGeoPhoto?
    @State private var camaraAbierta = false
    /// Los días se fijan al abrir: si la hoja sigue abierta a medianoche, «Hoy»
    /// no cambia de significado a media captura.
    @State private var dias: [GastosRules.OpcionFecha]
    @State private var diaElegido: String

    init(modelo: GastosModelo, onCerrar: @escaping () -> Void) {
        _modelo = ObservedObject(wrappedValue: modelo)
        self.onCerrar = onCerrar
        let opciones = GastosRules.opcionesDeFecha()
        _dias = State(initialValue: opciones)
        _diaElegido = State(initialValue: opciones.first?.id ?? "")
    }

    private var falta: String? {
        GastosRules.faltaParaRegistrar(concepto: concepto, importe: importe, tieneTicket: ticket != nil)
    }

    var body: some View {
        let enviando = modelo.enviando
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Registrar un gasto")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(NxColors.fg)

                FinanzasCampoImporte(
                    etiqueta: "¿Cuánto?",
                    crudo: $importe,
                    ayuda: "Pesos, con IVA incluido.",
                    habilitado: !enviando,
                    fondo: NxColors.surface
                )

                FinanzasCampoContorno(
                    etiqueta: "¿En qué se gastó?",
                    texto: $concepto,
                    multilinea: true,
                    lineasMinimas: 2,
                    habilitado: !enviando,
                    fondo: NxColors.surface
                )

                VStack(alignment: .leading, spacing: 8) {
                    NxDenseSectionHeader(title: "Categoría")
                    CoreFlowLayout(spacing: 8) {
                        ForEach(GastosRules.categorias, id: \.self) { opcion in
                            FinanzasChip(texto: opcion, elegido: categoria == opcion, habilitado: !enviando) {
                                categoria = opcion
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    NxDenseSectionHeader(
                        title: "¿Cuándo?",
                        hint: "Un gasto de más atrás se captura en la computadora."
                    )
                    CoreFlowLayout(spacing: 8) {
                        ForEach(dias) { opcion in
                            FinanzasChip(texto: opcion.etiqueta, elegido: diaElegido == opcion.id, habilitado: !enviando) {
                                diaElegido = opcion.id
                            }
                        }
                    }
                }

                FinanzasChip(texto: "Se repite cada mes", elegido: recurrente, habilitado: !enviando) {
                    recurrente.toggle()
                }

                VStack(alignment: .leading, spacing: 10) {
                    NxDenseSectionHeader(
                        title: "Foto del ticket",
                        hint: "Obligatoria: sin ella el gasto no se puede deducir."
                    )
                    if let ticket {
                        Image(uiImage: ticket.image)
                            .resizable()
                            .scaledToFill()
                            .frame(maxWidth: .infinity)
                            .frame(height: 180)
                            .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                            .accessibilityLabel("Ticket fotografiado")
                    }
                    Button {
                        camaraAbierta = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 16))
                                .frame(width: 18, height: 18)
                                .accessibilityHidden(true)
                            Text(ticket == nil ? "Tomar foto del ticket" : "Tomar otra")
                                .font(NxType.labelLarge)
                        }
                    }
                    .buttonStyle(FinanzasBotonEstilo(tipo: .contorno))
                    .disabled(enviando)
                }

                if let error = modelo.errorAccion {
                    NxStatusDot(text: error, color: NxColors.danger, fontSize: 12.5, fontWeight: .semibold, maxLines: 4)
                }

                BotonDeAccionGasto(
                    texto: "Registrar gasto",
                    enviando: enviando,
                    habilitado: falta == nil,
                    accion: registrar
                )
                // Lo que falta, o lo que pasa si no hay señal. Nunca los dos.
                Text(falta ?? "Sin señal se guarda en la cola con su foto y sale solo al volver la red.")
                    .font(.system(size: 12))
                    .foregroundStyle(falta != nil ? NxColors.warning : NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)

                Button("Cancelar", action: onCerrar)
                    .font(NxType.labelLarge)
                    .buttonStyle(FinanzasBotonEstilo(tipo: .texto))
                    .disabled(enviando)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 28)
        }
        .scrollDismissesKeyboard(.interactively)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(NxColors.surface)
        .presentationCornerRadius(28)
        .interactiveDismissDisabled(enviando)
        .fullScreenCover(isPresented: $camaraAbierta) {
            GeoPhotoCaptureView(
                title: "Foto del ticket",
                confirmLabel: "Usar esta foto",
                // Un ticket se fotografía donde caiga —oficina, tienda, sótano—:
                // la ubicación viaja si la hay, pero no bloquea el gasto.
                requireLocation: false,
                onConfirm: { foto in
                    ticket = foto
                    camaraAbierta = false
                    return nil
                },
                onCancel: { camaraAbierta = false }
            )
        }
    }

    private func registrar() {
        guard falta == nil, let foto = ticket else { return }
        let fecha = dias.first(where: { $0.id == diaElegido })?.valorApi ?? dias.first?.valorApi ?? ""
        modelo.registrar(
            concepto: concepto,
            importe: importe,
            categoria: categoria,
            esRecurrente: recurrente,
            fecha: fecha,
            ticket: foto
        )
    }
}
