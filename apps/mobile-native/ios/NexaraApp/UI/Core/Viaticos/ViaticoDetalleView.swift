import SwiftUI

/// «Viático» (Android `ViaticoDetalleScreen`): cuánto se pidió, cuánto se
/// autorizó, cuánto se comprobó y qué falta. Desde aquí se reparte entre
/// actividades, se suben los tickets y —si me toca— se autoriza, se rechaza o
/// se marca pagado.
///
/// Se apila sobre la lista; la barra teal «Viático» la pone quien la abre.
struct ViaticoDetalleView: View {
    let viaticoId: Int
    /// La lista de arriba quedó desfasada: que relea.
    var onCambio: () -> Void = {}

    @State private var viatico: Viatico?
    @State private var cargando = true
    @State private var error: String?
    @State private var accionError: String?
    @State private var mensaje: String?
    @State private var comprobando = false
    @State private var decidiendo = false
    @State private var confirmandoPago = false
    @State private var repartiendo = false
    @State private var enviando = false

    private var miId: Int? { ViaticoSesion.miId }
    private var administra: Bool { ViaticoSesion.administra }

    private var esMio: Bool {
        guard let viatico else { return false }
        return viatico.usuarioId == nil || miId == nil || viatico.usuarioId == miId
    }

    /// Repartir es de quien lo pidió: es quien sabe qué visitas cubrió el viaje.
    /// Un viático pagado ya salió en una póliza y no se vuelve a repartir.
    private var puedeRepartir: Bool {
        guard let viatico else { return false }
        return esMio && !viatico.estaPagado && !viatico.estaRechazado
    }

    /// Solo se comprueba contra dinero ya entregado: `Aprobado` o `Pagado`.
    private var puedeComprobar: Bool {
        guard let viatico else { return false }
        return (viatico.estaAprobado || viatico.estaPagado) && (esMio || administra)
    }

    /// Nadie autoriza lo suyo: la cadena de aprobación del servidor tampoco lo permite.
    private var puedeDecidir: Bool {
        guard let viatico else { return false }
        return administra && !esMio && viatico.estaPendiente
    }

    private var puedePagar: Bool {
        guard let viatico else { return false }
        return administra && viatico.estaAprobado
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let error {
                    NxAlertBanner(
                        alert: NxAlert(
                            id: "viatico-error",
                            title: error,
                            subtitle: viatico == nil ? nil : "Abajo sigue lo último que se pudo leer.",
                            tone: .danger
                        ),
                        actionLabel: "Reintentar",
                        onAction: { Task { await cargar() } }
                    )
                }

                if let viatico {
                    encabezado(viatico)
                    importes(viatico)
                    reparto(viatico)
                    if let url = viatico.ticketEvidenciaUrl, !url.trimmingCharacters(in: .whitespaces).isEmpty {
                        comprobante(url)
                    }
                    if let accionError {
                        NxErrorBlock(message: accionError)
                    }
                    acciones
                    Color.clear.frame(height: 16)
                } else if cargando {
                    NxLoadingState(text: "Abriendo el viático…")
                }
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .refreshable { await cargar() }
        .task { await cargar() }
        .avisoSnackbar($mensaje)
        .navigationDestination(isPresented: $repartiendo) {
            RepartoViaticoView(viaticoId: viaticoId) { texto in
                avisar(texto)
            }
            .nxBrandNavBar(title: "Repartir viático")
        }
        .sheet(isPresented: $comprobando) {
            if let viatico {
                HojaComprobarViatico(viatico: viatico) { texto in
                    comprobando = false
                    avisar(texto)
                }
            }
        }
        .sheet(isPresented: $decidiendo) {
            if let viatico {
                HojaDecisionViatico(viatico: viatico) { texto in
                    decidiendo = false
                    avisar(texto)
                }
            }
        }
        .alert("¿Marcar como pagado?", isPresented: $confirmandoPago) {
            Button("Cancelar", role: .cancel) {}
            Button("Sí, pagado") { marcarPagado() }
        } message: {
            Text(
                "Se levanta la póliza contable con lo autorizado. Después de esto el "
                    + "viático ya no se puede repartir entre actividades: el asiento ya salió."
            )
        }
    }

    // MARK: Bloques

    /// Título, de quién, cuándo y su estado (Android `Encabezado`).
    private func encabezado(_ viatico: Viatico) -> some View {
        NxPanelShell {
            VStack(alignment: .leading, spacing: 8) {
                Text(viatico.titulo)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                Text(
                    [
                        Viatico.etiquetaCategoria(viatico.categoria),
                        (viatico.usuario?.nombre ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                        FechaMexico.dia(iso: viatico.fechaSolicitud) ?? "",
                        (viatico.actividad?.anNumber ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                        (viatico.contabilidadRef ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                    ]
                    .filter { !$0.isEmpty }
                    .joined(separator: " · ")
                )
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
                ChipsDeViatico(viatico: viatico)
            }
        }
    }

    /// Solicitado, autorizado, comprobado y el saldo (Android `BloqueImportes`).
    private func importes(_ viatico: Viatico) -> some View {
        let solicitado = viatico.solicitadoCentavos
        let aprobado = viatico.aprobadoCentavos
        let comprobado = viatico.comprobadoCentavos
        let saldo = viatico.liquidacion?.saldoCentavos
        let recortado = aprobado.map { $0 < solicitado } ?? false
        let tonoSaldo: NxTone = {
            guard let saldo, saldo != 0 else { return .success }
            return saldo > 0 ? .info : .brand
        }()

        return NxPanelShell {
            VStack(alignment: .leading, spacing: 14) {
                NxSectionHeader(title: "Importes")
                ParDeImportes(
                    izquierda: "Solicitado",
                    izquierdaCentavos: solicitado,
                    derecha: "Autorizado",
                    derechaCentavos: aprobado,
                    derechaTono: recortado ? .warning : .success
                )
                if recortado, let aprobado {
                    Text("Se autorizó \(Dinero.pesos(solicitado - aprobado)) menos de lo que pediste.")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.warning)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Rectangle().fill(NxColors.border).frame(height: 1)
                ParDeImportes(
                    izquierda: "Comprobado",
                    izquierdaCentavos: comprobado ?? 0,
                    derecha: "Saldo",
                    derechaCentavos: saldo,
                    derechaTono: tonoSaldo
                )
                if let explicacion = viatico.liquidacion?.explicacion {
                    Text(explicacion)
                        .font(NxType.bodyMedium)
                        .foregroundStyle(NxColors.fg)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if comprobado == nil {
                    Text("Falta subir tickets por \(Dinero.pesos(abs(aprobado ?? solicitado))).")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
            }
        }
    }

    /// Entre qué actividades se reparte el gasto, y el botón para cambiarlo
    /// (Android `BloqueReparto`).
    private func reparto(_ viatico: Viatico) -> some View {
        NxPanelShell {
            VStack(alignment: .leading, spacing: 10) {
                NxSectionHeader(
                    title: "Reparto entre actividades",
                    subtitle: viatico.repartos.isEmpty
                        ? "Todo el costo cae en una sola actividad."
                        : "El costo se divide en \(viatico.repartos.count) actividades."
                )
                ForEach(viatico.repartos) { parte in
                    HStack(alignment: .center, spacing: 10) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(parte.titulo)
                                .font(NxType.bodyMedium)
                                .foregroundStyle(NxColors.fg)
                                .lineLimit(2)
                            if let nota = parte.nota?.trimmingCharacters(in: .whitespacesAndNewlines), !nota.isEmpty {
                                Text(nota)
                                    .font(NxType.labelSmall)
                                    .foregroundStyle(NxColors.muted)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text(Dinero.pesos(parte.centavos))
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(NxColors.fg)
                    }
                    .accessibilityElement(children: .combine)
                }
                if puedeRepartir {
                    Button {
                        repartiendo = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.triangle.branch")
                                .font(.system(size: 15, weight: .semibold))
                                .frame(width: 18, height: 18)
                                .accessibilityHidden(true)
                            Text(viatico.repartos.isEmpty ? "Repartir entre actividades" : "Cambiar el reparto")
                        }
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                } else if viatico.estaPagado {
                    ChipLargoViatico(texto: "Pagado: el asiento contable ya salió y el reparto queda fijo")
                } else if viatico.estaRechazado {
                    ChipLargoViatico(texto: "Rechazado: no hay costo que repartir")
                }
            }
        }
    }

    /// La foto del ticket (Android `BloqueTicket`).
    private func comprobante(_ url: String) -> some View {
        NxPanelShell {
            VStack(alignment: .leading, spacing: 10) {
                NxSectionHeader(title: "Comprobante")
                AuthenticatedImage(url: url, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                    .accessibilityLabel("Foto del ticket del viático")
            }
        }
    }

    /// Lo que toca hacer, cada cosa en su hoja (Android `Acciones`).
    @ViewBuilder
    private var acciones: some View {
        if puedeDecidir || puedeComprobar || puedePagar {
            VStack(spacing: 10) {
                if puedeDecidir {
                    Button {
                        decidiendo = true
                    } label: {
                        Text("Autorizar o rechazar").fontWeight(.bold)
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 56, llenaAncho: true))
                    .disabled(enviando)
                }
                if puedeComprobar {
                    Button {
                        comprobando = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "doc.plaintext")
                                .font(.system(size: 15, weight: .semibold))
                                .frame(width: 18, height: 18)
                                .accessibilityHidden(true)
                            Text("Comprobar con tickets").fontWeight(.bold)
                        }
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.success), alto: 56, llenaAncho: true))
                    .disabled(enviando)
                }
                if puedePagar {
                    Button {
                        confirmandoPago = true
                    } label: {
                        HStack(spacing: 10) {
                            if enviando { SpinnerDeBoton(color: NxColors.brand) }
                            Text("Marcar como pagado")
                        }
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                    .disabled(enviando)
                }
            }
        }
    }

    // MARK: Datos

    private func cargar() async {
        if viatico == nil { cargando = true }
        do {
            viatico = try await ViaticosRepository.shared.detalle(id: viaticoId)
            error = nil
        } catch {
            // Lo que ya se veía se queda: el aviso va arriba.
            self.error = error.toUserMessage(fallback: "No se pudo abrir el viático")
        }
        cargando = false
    }

    /// Una mutación salió: snackbar, se relee el detalle y la lista se entera.
    private func avisar(_ texto: String) {
        accionError = nil
        mensaje = texto
        Task { await cargar() }
        onCambio()
    }

    private func marcarPagado() {
        guard !enviando else { return }
        enviando = true
        accionError = nil
        Task {
            do {
                try await ViaticosRepository.shared.marcarPagado(id: viaticoId)
                enviando = false
                avisar("Marcado como pagado")
            } catch {
                enviando = false
                accionError = error.toUserMessage(fallback: "No se pudo marcar como pagado")
            }
        }
    }
}

// MARK: - Comprobar

/// «Comprobar el anticipo» (Android `HojaComprobar`): cuánto se gastó de verdad
/// y, si hay, la foto del comprobante. Si falla, la hoja se queda abierta con
/// lo escrito y el error del servidor debajo.
struct HojaComprobarViatico: View {
    let viatico: Viatico
    let onListo: (String) -> Void

    @State private var importe = ""
    @State private var nota = ""
    @State private var foto: CapturedGeoPhoto?
    @State private var camara = false
    @State private var enviando = false
    @State private var error: String?

    private var entregado: Int { viatico.vigenteCentavos }
    private var centavos: Int? { Dinero.parsearCentavos(importe) }

    private var ayuda: String {
        guard let centavos else { return "Si no gastaste nada, captura 0." }
        let diferencia = entregado - centavos
        if diferencia == 0 { return "Cuadra exacto con lo entregado." }
        if diferencia > 0 { return "Sobran \(Dinero.pesos(diferencia)): hay que devolverlos." }
        return "Gastaste \(Dinero.pesos(-diferencia)) de más: la empresa te los debe."
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Comprobar el anticipo")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                Text("Se te entregaron \(Dinero.pesos(entregado)). Captura cuánto suman tus tickets.")
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
                CampoImporte(
                    titulo: "Total de los tickets",
                    crudo: $importe,
                    ayuda: ayuda,
                    error: nil,
                    habilitado: !enviando
                )
                CampoDelineado(
                    etiqueta: "Nota (opcional)",
                    texto: $nota,
                    multilinea: true,
                    minLineas: 2,
                    habilitado: !enviando
                )
                if let foto {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: 160)
                        .overlay {
                            Image(uiImage: foto.image)
                                .resizable()
                                .scaledToFill()
                        }
                        .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                        .accessibilityElement()
                        .accessibilityLabel("Comprobante fotografiado")
                }
                Button {
                    camara = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                        Text(foto == nil ? "Foto del comprobante (opcional)" : "Tomar otra")
                    }
                }
                .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                .disabled(enviando)

                if let error {
                    NxErrorBlock(message: error)
                }

                Button {
                    enviar()
                } label: {
                    if enviando {
                        SpinnerDeBoton()
                    } else {
                        Text("Enviar comprobación").fontWeight(.bold)
                    }
                }
                .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.success), alto: 56, llenaAncho: true))
                .disabled(enviando || centavos == nil)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 28)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial(detents: [.large])
        .fullScreenCover(isPresented: $camara) {
            GeoPhotoCaptureView(
                title: "Foto del comprobante",
                confirmLabel: "Usar esta foto",
                requireLocation: false,
                onConfirm: { capturada in
                    foto = capturada
                    camara = false
                    return nil
                },
                onCancel: { camara = false }
            )
        }
    }

    private func enviar() {
        guard let centavos, !enviando else { return }
        enviando = true
        error = nil
        Task {
            do {
                let encolado = try await ViaticosRepository.shared.comprobar(
                    id: viatico.id,
                    centavosComprobados: centavos,
                    nota: nota,
                    ticket: foto
                )
                enviando = false
                onListo(
                    encolado
                        ? "Sin conexión: la comprobación quedó en la cola y sale al volver la señal."
                        : "Comprobación registrada"
                )
            } catch {
                enviando = false
                self.error = error.toUserMessage(fallback: "No se pudo comprobar el viático")
            }
        }
    }
}

// MARK: - Decisión del jefe

/// Autorizar (con recorte opcional) o rechazar (Android `HojaDecision`).
///
/// El recorte no puede pasarse de lo solicitado —el servidor lo rechaza— y la
/// hoja lo dice antes de intentarlo.
struct HojaDecisionViatico: View {
    let viatico: Viatico
    let onResuelto: (String) -> Void

    @State private var recorte = ""
    @State private var nota = ""
    @State private var enviando = false
    @State private var error: String?

    private var solicitado: Int { viatico.solicitadoCentavos }
    private var centavosRecorte: Int? { Dinero.parsearCentavos(recorte) }

    private var errorRecorte: String? {
        guard !recorte.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        guard let centavosRecorte, centavosRecorte > 0 else {
            return "Captura un importe mayor que cero"
        }
        if centavosRecorte > solicitado {
            return "No puedes autorizar más de \(Dinero.pesos(solicitado)). "
                + "Si hace falta más, que levante otro viático por la diferencia."
        }
        return nil
    }

    private var tituloBoton: String {
        if !recorte.trimmingCharacters(in: .whitespaces).isEmpty, errorRecorte == nil, let centavosRecorte {
            return "Autorizar \(Dinero.pesos(centavosRecorte))"
        }
        return "Autorizar \(Dinero.pesos(solicitado))"
    }

    private var titulo: String {
        let nombre = (viatico.usuario?.nombre ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return nombre.isEmpty
            ? "Pide \(Dinero.pesos(solicitado))"
            : "\(nombre) pide \(Dinero.pesos(solicitado))"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(titulo)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                let motivo = viatico.motivo.trimmingCharacters(in: .whitespacesAndNewlines)
                if !motivo.isEmpty {
                    Text(motivo)
                        .font(NxType.bodyMedium)
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                CampoImporte(
                    titulo: "Autorizar otra cantidad (opcional)",
                    crudo: $recorte,
                    ayuda: "Vacío autoriza los \(Dinero.pesos(solicitado)) completos.",
                    error: errorRecorte,
                    habilitado: !enviando
                )
                CampoDelineado(
                    etiqueta: "Nota para quien lo pidió",
                    texto: $nota,
                    multilinea: true,
                    minLineas: 2,
                    habilitado: !enviando
                )

                if let error {
                    NxErrorBlock(message: error)
                }

                Button {
                    resolver(aprobar: true)
                } label: {
                    if enviando {
                        SpinnerDeBoton()
                    } else {
                        Text(tituloBoton).fontWeight(.bold)
                    }
                }
                .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.success), alto: 56, llenaAncho: true))
                .disabled(enviando || errorRecorte != nil)

                Button("Rechazar") {
                    resolver(aprobar: false)
                }
                .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.danger), alto: viaticoAlturaToque, llenaAncho: true))
                .disabled(enviando)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 28)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial(detents: [.large])
    }

    private func resolver(aprobar: Bool) {
        guard !enviando else { return }
        enviando = true
        error = nil
        Task {
            do {
                if aprobar {
                    try await ViaticosRepository.shared.aprobar(
                        id: viatico.id,
                        centavosAprobados: recorte.trimmingCharacters(in: .whitespaces).isEmpty ? nil : centavosRecorte,
                        nota: nota
                    )
                } else {
                    try await ViaticosRepository.shared.rechazar(id: viatico.id, nota: nota)
                }
                enviando = false
                onResuelto(aprobar ? "Viático autorizado" : "Viático rechazado")
            } catch {
                enviando = false
                self.error = error.toUserMessage(fallback: aprobar ? "No se pudo autorizar" : "No se pudo rechazar")
            }
        }
    }
}
