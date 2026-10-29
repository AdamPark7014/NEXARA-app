import SwiftUI

// Tarjetas de las ligas de un mensaje y panel del asistente de #general —
// paridad Android `ui/chat/ChatLigaViews.kt` y la web
// (`apps/web/components/chat/EntityCards.tsx`, `AsistentePanel.tsx`).

// MARK: - Caché de tarjetas en el entorno

private struct ChatLigaTarjetasKey: EnvironmentKey {
    static let defaultValue: [String: ChatTarjetaLiga] = [:]
}

extension EnvironmentValues {
    /// Tarjetas ya pedidas por el chat (`ChatStore.ligaTarjetas`). La conversación
    /// y la hoja del hilo las ponen; las burbujas las leen.
    var chatLigaTarjetas: [String: ChatTarjetaLiga] {
        get { self[ChatLigaTarjetasKey.self] }
        set { self[ChatLigaTarjetasKey.self] = newValue }
    }
}

// MARK: - Cotización abierta desde una liga

/// Cotización que se abre encima del chat al tocar su liga (el shell todavía
/// abre la lista con un enlace de cotización; desde el chat se ve la ficha).
struct ChatCotizacionLiga: Identifiable, Equatable {
    let id: Int
}

/// Quién presenta la ficha: la conversación, o la hoja del hilo si está abierta.
@MainActor
final class ChatLigaSheets: ObservableObject {
    static let shared = ChatLigaSheets()
    @Published var cotizacion: ChatCotizacionLiga?
    private init() {}
}

/// La ficha de la cotización en una hoja con «Cerrar».
struct ChatCotizacionSheet: View {
    let item: ChatCotizacionLiga
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            CotizacionDetalleView(cotizacionId: item.id)
                .nxBrandNavBar(title: "Cotización", showsBell: false)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cerrar", action: onClose)
                    }
                }
        }
    }
}

// MARK: - Tarjetas

/// Tarjetas de las ligas que trae el cuerpo de un mensaje (hasta tres):
/// pastillas `[…](/erp/…)` y folios escritos sueltos. Sin dato todavía, «Cargando…».
struct ChatLigaCards: View {
    let body_: String
    @Environment(\.chatLigaTarjetas) private var tarjetas

    init(body: String) {
        body_ = body
    }

    var body: some View {
        let refs = ChatLigas.refsDelMensaje(body_)
        if !refs.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(refs) { ref in
                    ChatLigaCard(ref: ref, tarjeta: tarjetas[ref.ref])
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct ChatLigaCard: View {
    let ref: ChatRefLiga
    let tarjeta: ChatTarjetaLiga?

    private var tipo: ChatTipoLiga { tarjeta.flatMap { ChatTipoLiga(rawValue: $0.tipo) } ?? ref.tipo }
    private var folio: String? { tarjeta?.folio ?? ref.folio }
    private var franja: Color { tipo.esDeMarca ? NxColors.brand : NxColors.info }

    private var href: String {
        if let h = tarjeta?.href, !h.isEmpty { return h }
        return ref.ref.hasPrefix("/") ? ref.ref : tipo.lista
    }

    private var descripcion: String {
        var partes = [tipo.etiqueta + (folio.map { " \($0)" } ?? "")]
        if let tarjeta, tarjeta.acceso { partes.append(tarjeta.titulo) }
        if let estado = tarjeta?.estado { partes.append(estado) }
        if let tarjeta, !tarjeta.acceso, let motivo = tarjeta.motivo { partes.append(motivo) }
        return partes.joined(separator: ", ")
    }

    var body: some View {
        Button {
            ChatLinks.open(href)
        } label: {
            HStack(spacing: 0) {
                Rectangle()
                    .fill(franja)
                    .frame(width: 3)
                VStack(alignment: .leading, spacing: 3) {
                    encabezado
                    contenido
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(NxColors.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(NxColors.border, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(descripcion)
        .accessibilityHint("Abre el registro")
    }

    private var encabezado: some View {
        HStack(spacing: 4) {
            Image(systemName: tipo.systemImage)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(franja)
            Text(tipo.etiqueta)
                .font(NxType.labelSmall.weight(.semibold))
                .foregroundStyle(NxColors.muted)
            if let folio, !folio.isEmpty {
                Text(folio)
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer(minLength: 4)
            if let tarjeta, tarjeta.acceso, let estado = tarjeta.estado, !estado.isEmpty {
                NxStatusChip(text: estado, tone: ChatLigas.tonoDeEstado(estado).tone)
            }
        }
    }

    @ViewBuilder
    private var contenido: some View {
        if let tarjeta {
            if tarjeta.acceso {
                Text(tarjeta.titulo.isEmpty ? ChatLigas.tituloGenerico(tipo, folio: folio) : tarjeta.titulo)
                    .font(NxType.bodyMedium.weight(.semibold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if !tarjeta.detalle.isEmpty {
                    Text(tarjeta.detalle.joined(separator: " · "))
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    if let monto = tarjeta.monto {
                        Text(ChatLigas.formatoMonto(monto.total, moneda: monto.moneda))
                            .font(NxType.labelLarge.weight(.bold))
                            .foregroundStyle(NxColors.fg)
                        Text(monto.moneda)
                            .font(NxType.labelSmall)
                            .foregroundStyle(NxColors.muted)
                    }
                    Spacer(minLength: 0)
                    abrir
                }
            } else {
                HStack(spacing: 4) {
                    Text(tarjeta.motivo ?? ChatLigas.sinAcceso)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                    Spacer(minLength: 0)
                    abrir
                }
            }
        } else {
            Text("Cargando…")
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.muted)
        }
    }

    private var abrir: some View {
        HStack(spacing: 2) {
            Text("Abrir")
                .font(NxType.labelMedium.weight(.semibold))
            Image(systemName: "arrow.up.right.square")
                .font(.system(size: 11, weight: .semibold))
        }
        .foregroundStyle(NxColors.brand)
    }
}

// MARK: - Asistente

/// Conversación con el asistente dentro de #general, encima del redactor. Solo
/// la ve quien pregunta y se borra al cerrar la app: el canal no recibe nada.
/// Las propuestas de «asígnale a…» se crean una por una con «Crear», nunca solas.
private struct ChatAsistenteAltoKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

struct ChatAsistentePanel: View {
    @ObservedObject var store: ChatStore
    /// Alto del contenido: el panel crece con él hasta 300 pt y luego se desplaza.
    @State private var alto: CGFloat = 0

    var body: some View {
        if !store.asistenteTurnos.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                header
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(store.asistenteTurnos) { turno in
                                turnoView(turno)
                                    .id(turno.id)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.bottom, 12)
                        .background(
                            GeometryReader { geo in
                                Color.clear.preference(key: ChatAsistenteAltoKey.self, value: geo.size.height)
                            }
                        )
                    }
                    .frame(height: min(max(alto, 44), 300))
                    .onPreferenceChange(ChatAsistenteAltoKey.self) { alto = $0 }
                    .onChange(of: store.asistenteTurnos) { _, turnos in
                        guard let ultimo = turnos.last?.id else { return }
                        withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(ultimo, anchor: .bottom) }
                    }
                }
            }
            .background(NxColors.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(NxColors.brand.opacity(0.25), lineWidth: 1)
            )
            .nxElevation(2)
            .padding(.horizontal, 12)
            .padding(.top, 4)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Asistente NEXARA")
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "sparkles")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(NxColors.brand)
                .frame(width: 26, height: 26)
                .background(NxColors.brandSoft, in: Circle())
                .accessibilityHidden(true)
            Text("Asistente NEXARA")
                .font(NxType.titleSmall.weight(.bold))
                .foregroundStyle(NxColors.fg)
            Text("Solo tú lo ves")
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.brandText)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(NxColors.brandSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Spacer(minLength: 0)
            Button {
                store.cerrarAsistente()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(NxColors.muted)
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar el asistente")
        }
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .padding(.top, 4)
    }

    @ViewBuilder
    private func turnoView(_ turno: ChatTurnoAsistente) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Spacer(minLength: 40)
                Text(ChatAsistente.preguntaVisible(turno.pregunta).nilIfEmpty ?? "…")
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.fg)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(NxColors.brandTint, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            switch turno.estado {
            case .esperando:
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small).tint(NxColors.brand)
                    Text("Buscando…")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
            case .error:
                Text(turno.error ?? "El asistente no respondió: intenta de nuevo.")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.dangerText)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(NxColors.dangerSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityAddTraits(.isStaticText)
            case .listo:
                if let respuesta = turno.respuesta {
                    respuestaView(turno, respuesta)
                }
            }
        }
    }

    @ViewBuilder
    private func respuestaView(_ turno: ChatTurnoAsistente, _ respuesta: ChatRespuestaAsistente) -> some View {
        Text(ChatMarkup.attributed(respuesta.texto, primary: NxColors.fg, mention: NxColors.brand))
            .font(NxType.bodyMedium)
            .tint(NxColors.brand)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        ChatLigaCards(body: respuesta.texto)
        ForEach(Array(respuesta.propuestas.enumerated()), id: \.offset) { indice, propuesta in
            propuestaView(turno: turno, indice: indice, propuesta: propuesta)
        }
        if !respuesta.sugerencias.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(respuesta.sugerencias, id: \.self) { sugerencia in
                        Button {
                            store.preguntarSugerencia(sugerencia)
                        } label: {
                            Text(sugerencia)
                                .font(NxType.labelMedium)
                                .foregroundStyle(NxColors.brandText)
                                .padding(.horizontal, 12)
                                .frame(minHeight: 34)
                                .background(NxColors.brandSoft, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        Text(ChatAsistente.etiquetaFuente(respuesta.fuente))
            .font(NxType.labelSmall)
            .foregroundStyle(NxColors.muted)
    }

    @ViewBuilder
    private func propuestaView(turno: ChatTurnoAsistente, indice: Int, propuesta: ChatPropuestaAsistente) -> some View {
        let estado = store.asistentePropuestas[ChatStore.clavePropuesta(turno.id, indice)]
        if estado != .descartada {
            VStack(alignment: .leading, spacing: 4) {
                Text(propuesta.titulo)
                    .font(NxType.bodyMedium.weight(.semibold))
                    .foregroundStyle(NxColors.fg)
                Text([propuesta.responsable.map { "Para \($0)" } ?? "Sin responsable", propuesta.cuando]
                    .compactMap { $0 }
                    .joined(separator: " · "))
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                if !propuesta.faltantes.isEmpty {
                    Text("Falta: \(propuesta.faltantes.joined(separator: ", ")). Complétala en Mi equipo › Asignar.")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.dangerText)
                }
                ForEach(propuesta.avisos, id: \.self) { aviso in
                    Text(aviso)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
                acciones(turno: turno, indice: indice, propuesta: propuesta, estado: estado)
                if case .fallo(let mensaje) = estado {
                    Text(mensaje)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.dangerText)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NxColors.brandTint, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(NxColors.brand.opacity(0.2), lineWidth: 1)
            )
        }
    }

    @ViewBuilder
    private func acciones(
        turno: ChatTurnoAsistente,
        indice: Int,
        propuesta: ChatPropuestaAsistente,
        estado: ChatCreacionPropuesta?
    ) -> some View {
        switch estado {
        case .creada(let id, let anNumber):
            Button("Creada \(anNumber ?? "") · Abrir") {
                ChatLinks.open("/erp/actividades/\(id)")
            }
            .buttonStyle(ChatTextButtonStyle())
        case .enCola:
            Text("Sin señal: se creará al volver la conexión.")
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.muted)
        default:
            let creando = estado == .creando
            HStack(spacing: 4) {
                Button(creando ? "Creando…" : "Crear") {
                    store.crearPropuesta(turnoId: turno.id, indice: indice, propuesta: propuesta)
                }
                .buttonStyle(ChatTextButtonStyle())
                .disabled(creando || !propuesta.faltantes.isEmpty)
                .opacity(creando || !propuesta.faltantes.isEmpty ? 0.45 : 1)
                Button("Descartar") {
                    store.descartarPropuesta(turnoId: turno.id, indice: indice)
                }
                .buttonStyle(ChatTextButtonStyle(color: NxColors.muted))
                .disabled(creando)
            }
        }
    }
}
