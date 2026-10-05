import SwiftUI
import PDFKit

/// Una cotización por dentro — espejo de `CotizacionDetalleScreen.kt`.
///
/// El editor de la web tiene cinco secciones porque ahí se **arma** la
/// propuesta. Aquí se consulta, así que el orden es otro: primero de quién es y
/// cuánto, luego el PDF (el documento que el cliente ya tiene, para enseñarlo o
/// reenviarlo), los importes, en qué se va el dinero —las partidas agrupadas en
/// Equipos, Materiales y Mano de obra—, lo que se prometió (términos) y quién
/// respondió por ella.
///
/// El PDF se abre dentro de la app (visor de PDFKit con «Compartir»), nunca en
/// el navegador.
struct CotizacionDetalleView: View {
    let cotizacionId: Int

    @State private var cotizacion: CotizacionDetalle?
    @State private var cargando = true
    @State private var error: String?
    @State private var avisoRefresco: String?
    @State private var descargandoPdf = false
    @State private var errorPdf: String?
    /// Cuál falló por última vez, para que «Reintentar» pida ESE PDF.
    @State private var ultimoPdfInterno = false
    @State private var pdfAbierto: CotizacionPdfAbierto?
    @State private var gruposCerrados: Set<String> = []
    @State private var terminosAbiertos = false
    @State private var arrancado = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let aviso = avisoRefresco {
                    MoreAvisoDesactualizado(mensaje: aviso, onCerrar: { avisoRefresco = nil })
                }

                if cargando && cotizacion == nil {
                    NxSkeletonList(itemCount: 3, itemHeight: 150)
                }

                // Error y vacío nunca coinciden: el error solo se pinta cuando no
                // hay detalle cargado.
                if let error, cotizacion == nil {
                    NxErrorBlock(message: error, onRetry: { Task { await cargar(refresco: false) } })
                }

                if let cotizacion {
                    CabezaDeCotizacion(cotizacion: cotizacion)

                    BotonesDePdf(
                        descargando: descargandoPdf,
                        error: errorPdf,
                        onAbrir: { Task { await bajarPdf(interno: false) } },
                        onAbrirInterno: { Task { await bajarPdf(interno: true) } },
                        onReintentar: {
                            errorPdf = nil
                            let interno = ultimoPdfInterno
                            Task { await bajarPdf(interno: interno) }
                        }
                    )

                    ImportesDeCotizacion(cotizacion: cotizacion)

                    partidas(cotizacion)

                    terminos(cotizacion)

                    ParticipantesDeCotizacion(cotizacion: cotizacion)
                }

                MoreNotaDeAlcance(texto: CotizacionesRules.limite)
            }
            .padding(16)
        }
        .nxScreenBackground()
        .refreshable { await cargar(refresco: true) }
        .task {
            guard !arrancado else { return }
            arrancado = true
            await cargar(refresco: false)
        }
        .navigationDestination(item: $pdfAbierto) { pdf in
            PDFViewerScreen(title: pdf.titulo, data: pdf.data)
                .nxBrandNavBar(title: pdf.titulo, showsBell: false)
        }
    }

    // MARK: Partidas

    /// Las partidas, agrupadas como en la propuesta técnica. Los grupos llegan
    /// abiertos: quien entra quiere ver en qué se va el dinero. Se pueden cerrar
    /// para llegar antes al total cuando la propuesta tiene veinte conceptos.
    @ViewBuilder
    private func partidas(_ cotizacion: CotizacionDetalle) -> some View {
        let grupos = CotizacionesRules.gruposConPartidas(cotizacion)
        let total = CotizacionesRules.totalPartidas(cotizacion)

        MoreCabecera(
            titulo: "Partidas",
            subtitulo: "Equipos, materiales y mano de obra",
            trailing: total > 0 ? "\(total)" : nil
        )

        if grupos.isEmpty {
            NxEmptyState(
                title: "Sin partidas",
                subtitle: "Esta cotización todavía no tiene conceptos capturados. Se agregan desde la computadora."
            )
        } else {
            // La clave lleva el índice además del grupo: dos grupos con la misma
            // clave (o sin ninguna) no pueden compartir el interruptor.
            ForEach(Array(grupos.enumerated()), id: \.offset) { indice, grupo in
                let clave = "\(indice)-\(grupo.grupo ?? "")"
                GrupoDePartidas(
                    grupo: grupo,
                    abierto: !gruposCerrados.contains(clave),
                    onAlternar: {
                        if gruposCerrados.contains(clave) {
                            gruposCerrados.remove(clave)
                        } else {
                            gruposCerrados.insert(clave)
                        }
                    }
                )
            }
        }
    }

    // MARK: Términos

    /// Términos y condiciones: cerrados, porque es texto largo que no se lee de pie.
    @ViewBuilder
    private func terminos(_ cotizacion: CotizacionDetalle) -> some View {
        let partes = (cotizacion.terminos?.partes ?? []).filter {
            !($0.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        if !partes.isEmpty {
            MoreTarjeta {
                Button {
                    terminosAbiertos.toggle()
                } label: {
                    HStack(alignment: .center, spacing: 8) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(Self.limpio(cotizacion.terminos?.titulo) ?? "Términos y condiciones")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(NxColors.fg)
                            Text("Lo que se le prometió al cliente · \(partes.count)")
                                .font(NxType.labelSmall)
                                .foregroundStyle(NxColors.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: terminosAbiertos ? "chevron.up" : "chevron.down")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(NxColors.muted)
                            .frame(width: 20, height: 20)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(terminosAbiertos ? "Cerrar los términos" : "Abrir los términos")

                if terminosAbiertos {
                    ForEach(Array(partes.enumerated()), id: \.offset) { _, parte in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Self.limpio(parte.titulo) ?? "Condición")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(NxColors.fg)
                            Text(parte.texto ?? "")
                                .font(NxType.bodySmall)
                                .foregroundStyle(NxColors.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.bottom, 2)
                    }
                }
            }
        }
    }

    // MARK: Datos

    @MainActor
    private func cargar(refresco: Bool) async {
        if refresco {
            avisoRefresco = nil
        } else {
            cargando = true
            error = nil
            avisoRefresco = nil
        }
        do {
            let detalle = try await CotizacionesRepository.shared.detalle(id: cotizacionId)
            cotizacion = detalle
            cargando = false
            error = nil
            avisoRefresco = nil
        } catch {
            cargando = false
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
                if cotizacion == nil { arrancado = false }
                return
            }
            let mensaje = error.toUserMessage(fallback: "No se pudo abrir la cotización")
            if cotizacion != nil {
                avisoRefresco = mensaje
            } else {
                self.error = mensaje
            }
        }
    }

    /// Descarga el PDF con la sesión y lo abre en el visor de la app.
    ///
    /// Un fallo aquí no toca el detalle que está en pantalla: se avisa aparte,
    /// porque no poder bajar el PDF no invalida lo que se está leyendo.
    @MainActor
    private func bajarPdf(interno: Bool) async {
        guard !descargandoPdf else { return }
        descargandoPdf = true
        errorPdf = nil
        ultimoPdfInterno = interno
        let fallo = interno ? "No se pudo abrir el PDF interno" : "No se pudo abrir el PDF de la cotización"
        do {
            let bytes: Data
            if interno {
                bytes = try await CotizacionesRepository.shared.pdfInterno(id: cotizacionId)
            } else {
                bytes = try await CotizacionesRepository.shared.pdf(id: cotizacionId)
            }
            descargandoPdf = false
            // Lo que llegó tiene que ser un PDF de verdad: un visor en blanco no avisa de nada.
            guard !bytes.isEmpty, PDFDocument(data: bytes) != nil else {
                errorPdf = "\(fallo): el archivo que mandó el servidor no es un PDF."
                return
            }
            let nombre = CotizacionesRules.nombreArchivoPdf(id: cotizacionId, folio: cotizacion?.folio, interno: interno)
            let titulo = nombre.hasSuffix(".pdf") ? String(nombre.dropLast(4)) : nombre
            pdfAbierto = CotizacionPdfAbierto(titulo: titulo, data: bytes)
        } catch {
            descargandoPdf = false
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled { return }
            errorPdf = error.toUserMessage(fallback: fallo)
        }
    }

    fileprivate static func limpio(_ valor: String?) -> String? {
        guard let texto = valor?.trimmingCharacters(in: .whitespacesAndNewlines), !texto.isEmpty else { return nil }
        return texto
    }
}

/// Un PDF ya descargado, listo para el visor. Se compara por `id`: comparar los
/// bytes del documento en cada redibujo no tiene sentido.
struct CotizacionPdfAbierto: Identifiable, Hashable {
    let id = UUID()
    let titulo: String
    let data: Data

    static func == (a: CotizacionPdfAbierto, b: CotizacionPdfAbierto) -> Bool { a.id == b.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - Cabeza

/// Folio, estado, cliente y proyecto: de quién es esta cotización.
private struct CabezaDeCotizacion: View {
    let cotizacion: CotizacionDetalle

    var body: some View {
        let estado = CotizacionesRules.estado(cotizacion.estado)

        MoreTarjeta {
            HStack(alignment: .top, spacing: 10) {
                Text(CotizacionDetalleView.limpio(cotizacion.folio) ?? "Sin folio")
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                NxStatusChip(text: CotizacionesRules.etiquetaEstado(cotizacion), tone: estado.tono)
            }

            if let empresa = CotizacionDetalleView.limpio(cotizacion.clientCompany) {
                Text(empresa)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
            }
            LineaDeDato(etiqueta: "Contacto", valor: cotizacion.clientName)
            LineaDeDato(etiqueta: "Proyecto", valor: cotizacion.projectName)
            LineaDeDato(etiqueta: "Segmento", valor: cotizacion.segmentoEtiqueta)
            LineaDeDato(etiqueta: "Emisión", valor: CotizacionesRules.fechaLarga(cotizacion.issueDate))
            LineaDeDato(etiqueta: "Vigente hasta", valor: CotizacionesRules.fechaLarga(cotizacion.validUntil))
            LineaDeDato(etiqueta: "Enviada", valor: CotizacionesRules.fechaLarga(cotizacion.sentAt))
            LineaDeDato(etiqueta: "Al correo", valor: cotizacion.sentToEmail)
            LineaDeDato(etiqueta: "Elaboró", valor: cotizacion.elaboro?.nombre)

            if let asignacion = CotizacionesRules.asignacionTexto(cotizacion) {
                Text(asignacion)
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.brand)
            }
            if let nota = CotizacionDetalleView.limpio(cotizacion.asignadoNota) {
                Text("«\(nota)»")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let rechazo = CotizacionesRules.rechazoTexto(cotizacion) {
                Text(rechazo)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// «Etiqueta — valor» en una fila (42 % / 58 %, como los pesos de Android); no
/// se pinta nada si el valor está vacío.
private struct LineaDeDato: View {
    let etiqueta: String
    let valor: String?

    var body: some View {
        if let texto = CotizacionDetalleView.limpio(valor) {
            DosColumnas(proporcion: 0.42, espacio: 10).callAsFunction {
                Text(etiqueta)
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(texto)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        }
    }
}

/// Dos columnas con un reparto fijo del ancho (el `Modifier.weight` de Android).
private struct DosColumnas: Layout {
    var proporcion: CGFloat
    var espacio: CGFloat

    private func anchos(_ total: CGFloat) -> (CGFloat, CGFloat) {
        let disponible = max(total - espacio, 0)
        let primero = disponible * proporcion
        return (primero, disponible - primero)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let total = proposal.width ?? 320
        let (a, b) = anchos(total)
        let altoA = subviews.first?.sizeThatFits(ProposedViewSize(width: a, height: nil)).height ?? 0
        let altoB = subviews.count > 1 ? subviews[1].sizeThatFits(ProposedViewSize(width: b, height: nil)).height : 0
        return CGSize(width: total, height: max(altoA, altoB))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let (a, b) = anchos(bounds.width)
        if let primero = subviews.first {
            primero.place(
                at: CGPoint(x: bounds.minX, y: bounds.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: a, height: nil)
            )
        }
        if subviews.count > 1 {
            subviews[1].place(
                at: CGPoint(x: bounds.minX + a + espacio, y: bounds.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: b, height: nil)
            )
        }
    }
}

// MARK: - PDF

/// El PDF de la propuesta: lo único que esta pantalla «hace», y por eso va
/// arriba. Mientras baja, los botones se bloquean y lo dicen; si falla, el aviso
/// va aparte y no toca el detalle.
private struct BotonesDePdf: View {
    let descargando: Bool
    let error: String?
    let onAbrir: () -> Void
    let onAbrirInterno: () -> Void
    let onReintentar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onAbrir) {
                HStack(spacing: 0) {
                    if descargando {
                        ProgressView()
                            .controlSize(.small)
                            .tint(Color.white)
                            .frame(width: 16, height: 16)
                        Spacer().frame(width: 10)
                        Text("Bajando el PDF…")
                    } else {
                        Image(systemName: "doc.richtext.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                        Spacer().frame(width: 8)
                        Text("PDF final")
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(NxPillButtonStyle(fill: NxColors.brand, foreground: .white))
            .disabled(descargando)

            Button(action: onAbrirInterno) {
                Text("PDF interno (costo y margen)")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand, border: NxColors.borderStrong))
            .disabled(descargando)

            if let error {
                NxErrorBlock(message: error, onRetry: onReintentar)
            }
        }
    }
}

// MARK: - Importes

/// Subtotal, impuestos y total, con el total destacado.
private struct ImportesDeCotizacion: View {
    let cotizacion: CotizacionDetalle

    var body: some View {
        let moneda = CotizacionDetalleView.limpio(cotizacion.currency)?.uppercased()
        let sufijo = (moneda != nil && moneda != "MXN") ? " \(moneda ?? "")" : ""

        MoreTarjeta {
            FilaImporte(etiqueta: "Subtotal", valor: CotizacionesRules.pesos(cotizacion.subtotal))
            FilaImporte(etiqueta: "Impuestos", valor: CotizacionesRules.pesos(cotizacion.taxTotal))
            Rectangle().fill(NxColors.surface).frame(height: 1)
            FilaImporte(etiqueta: "Total", valor: CotizacionesRules.pesos(cotizacion.total) + sufijo, destacado: true)
            if let porGrupo = textoPorGrupo {
                Text(porGrupo)
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if cotizacion.incluyeInstalacion == false {
                Text("Solo suministro: esta propuesta no cobra instalación.")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
        }
    }

    private var textoPorGrupo: String? {
        guard let porGrupo = cotizacion.totalesPorGrupo else { return nil }
        let partes = [
            porGrupo.equipos.map { "equipos \(CotizacionesRules.pesos($0))" },
            porGrupo.materiales.map { "materiales \(CotizacionesRules.pesos($0))" },
            porGrupo.manoDeObra.map { "mano de obra \(CotizacionesRules.pesos($0))" },
        ].compactMap { $0 }
        return partes.isEmpty ? nil : "Por grupo: " + partes.joined(separator: " · ")
    }
}

private struct FilaImporte: View {
    let etiqueta: String
    let valor: String
    var destacado = false

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(etiqueta)
                .font(destacado ? Font.system(size: 14, weight: .bold) : NxType.bodySmall)
                .foregroundStyle(destacado ? NxColors.fg : NxColors.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(valor)
                .font(destacado ? Font.system(size: 16, weight: .bold) : NxType.bodySmall)
                .foregroundStyle(NxColors.fg)
                .multilineTextAlignment(.trailing)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Partidas

/// Un grupo de partidas. Solo la cabecera abre y cierra: si toda la tarjeta
/// fuera el interruptor, intentar leer una partida larga la cerraría de un dedazo.
private struct GrupoDePartidas: View {
    let grupo: CotizacionGrupo
    let abierto: Bool
    let onAlternar: () -> Void

    var body: some View {
        let partidas = grupo.partidas ?? []

        MoreTarjeta {
            Button(action: onAlternar) {
                HStack(alignment: .center, spacing: 8) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(CotizacionesRules.etiquetaGrupo(grupo))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(NxColors.fg)
                        Text(partidas.count == 1 ? "1 concepto" : "\(partidas.count) conceptos")
                            .font(NxType.labelSmall)
                            .foregroundStyle(NxColors.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(CotizacionesRules.pesos(grupo.subtotal))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                    Image(systemName: abierto ? "chevron.up" : "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NxColors.muted)
                        .frame(width: 20, height: 20)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(abierto ? "Cerrar el grupo" : "Abrir el grupo")

            if abierto {
                ForEach(Array(partidas.enumerated()), id: \.offset) { indice, partida in
                    if indice > 0 {
                        Rectangle().fill(NxColors.surface).frame(height: 1)
                    }
                    FilaDePartida(partida: partida)
                }
            }
        }
    }
}

private struct FilaDePartida: View {
    let partida: CotizacionPartida

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(CotizacionesRules.partidaTitulo(partida))
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                if let descripcion = CotizacionDetalleView.limpio(partida.description) {
                    Text(descripcion)
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(4)
                }
                if let cantidad = CotizacionesRules.partidaCantidadTexto(partida) {
                    Text(cantidad)
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(CotizacionesRules.partidaImporteTexto(partida))
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Quién intervino

/// Quién respondió por esta cotización. El folio lleva las siglas de quienes
/// intervinieron, y esta lista es la que lo explica.
private struct ParticipantesDeCotizacion: View {
    let cotizacion: CotizacionDetalle

    var body: some View {
        let participantes = (cotizacion.participantes ?? []).filter {
            CotizacionDetalleView.limpio($0.nombre) != nil
        }
        if !participantes.isEmpty {
            MoreTarjeta {
                Text("Quién intervino")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                if let cadena = CotizacionDetalleView.limpio(cotizacion.cadenaParticipantes) {
                    Text(cadena)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(NxColors.muted)
                }
                ForEach(Array(participantes.enumerated()), id: \.offset) { _, persona in
                    HStack(alignment: .center, spacing: 8) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(persona.nombre ?? "")
                                .font(.system(size: 12.5, weight: .semibold))
                                .foregroundStyle(NxColors.fg)
                            if let pie = pie(persona) {
                                Text(pie)
                                    .font(NxType.labelSmall)
                                    .foregroundStyle(NxColors.muted)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        NxStatusChip(
                            text: CotizacionDetalleView.limpio(persona.rolEtiqueta) ?? (persona.rol ?? ""),
                            tone: .neutral
                        )
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func pie(_ persona: CotizacionParticipante) -> String? {
        let partes = [CotizacionDetalleView.limpio(persona.puesto), CotizacionesRules.fechaCorta(persona.at)]
            .compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }
}
