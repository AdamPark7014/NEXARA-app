import SwiftUI

/// El estado de la cotización con el tono del design system (Android `Estado.tono()`).
extension CotizacionesRules.Estado {
    var tono: NxTone {
        switch self {
        case .borrador: return .neutral
        case .enviada: return .info
        case .aprobada: return .success
        case .rechazada: return .danger
        case .vencida: return .warning
        case .desconocido: return .neutral
        }
    }
}

/// Cotizaciones (`/erp/cotizaciones`) en el teléfono — espejo de
/// `CotizacionesScreen.kt`.
///
/// La web trae una tabla de nueve columnas y el editor completo de la propuesta.
/// Aquí no se cotiza: se consulta. Cada cotización es una tarjeta que contesta,
/// en este orden, **de quién es y cuánto** (folio, cliente y monto), **en qué
/// va** (el estado) y **si urge** (una enviada a punto de vencer).
///
/// Un fallo al refrescar no borra lo que ya se veía: la primera carga fallida
/// es un bloque de error; un refresco fallido deja los datos y avisa en una cinta.
/// El filtro y la búsqueda no vuelven a pedir nada al servidor.
///
/// Va dentro del `NavigationStack` del hub «Más» (o de la cubierta del shell):
/// aquí no se crea otro. La barra teal la pone quien abre la pantalla; el
/// detalle que se apila desde aquí la recibe en `navigationDestination`.
struct CotizacionesView: View {
    @State private var datos: [CotizacionResumen]?
    @State private var cargando = true
    @State private var error: String?
    @State private var avisoRefresco: String?
    @State private var filtro: CotizacionesRules.Filtro = .todas
    @State private var consulta = ""
    @State private var arrancado = false
    @State private var destino: CotizacionDestino?

    private var hayDatos: Bool { datos != nil }
    private var todas: [CotizacionResumen] { datos ?? [] }

    var body: some View {
        let todas = self.todas
        let visibles = CotizacionesRules.aplicar(todas, filtro: filtro, consulta: consulta)
        let conteos = CotizacionesRules.conteos(todas)
        // El aviso de vigencia se calcula contra el día de hoy (en México); se
        // fija una vez por dibujo para que todas las tarjetas cuenten igual.
        let hoy = CotizacionesRules.hoyEnMexico()

        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                FilaDePastillasDeCotizacion(
                    conteos: conteos,
                    seleccion: filtro,
                    onSelect: { filtro = $0 }
                )

                if let aviso = avisoRefresco {
                    MoreAvisoDesactualizado(mensaje: aviso, onCerrar: { avisoRefresco = nil })
                }

                if cargando && !hayDatos {
                    NxSkeletonList(itemCount: 4, itemHeight: 132)
                }

                // Error y vacío nunca coinciden: el error solo existe cuando no
                // hay nada cargado, y el vacío solo cuando la carga sí llegó.
                if let error, !hayDatos {
                    NxErrorBlock(message: error, onRetry: { Task { await cargar(refresco: hayDatos) } })
                }

                if hayDatos {
                    if !todas.isEmpty {
                        CifrasDeCotizaciones(cifras: CotizacionesRules.cifras(todas))
                    }

                    if todas.count > 6 {
                        NxSearchField(text: $consulta, placeholder: "Buscar por folio, cliente o quien la hizo")
                    }

                    if visibles.isEmpty {
                        vacio(sinRegistros: todas.isEmpty)
                    } else {
                        MoreCabecera(
                            titulo: filtro.etiqueta,
                            subtitulo: "De la más reciente a la más vieja",
                            trailing: "\(visibles.count)"
                        )
                        ForEach(visibles, id: \.claveLista) { cotizacion in
                            TarjetaDeCotizacion(cotizacion: cotizacion, hoy: hoy) {
                                if let id = cotizacion.id { destino = CotizacionDestino(id: id) }
                            }
                        }
                    }
                }

                MoreNotaDeAlcance(texto: CotizacionesRules.limite)
            }
            .padding(16)
        }
        .nxScreenBackground()
        .refreshable { await cargar(refresco: true) }
        .task {
            // La primera carga, una sola vez: volver del detalle no lo pide todo otra vez.
            guard !arrancado else { return }
            arrancado = true
            await cargar(refresco: false)
        }
        .navigationDestination(item: $destino) { item in
            CotizacionDetalleView(cotizacionId: item.id)
                .nxBrandNavBar(title: "Cotización")
        }
    }

    /// El vacío, que es distinto según por qué está vacío.
    ///
    /// Sin registros es una empresa que todavía no cotiza; con registros pero sin
    /// coincidencias es un filtro o una búsqueda, y lo útil es el botón que lo
    /// deshace. Decir «no hay cotizaciones» con treinta detrás de un filtro sería mentir.
    @ViewBuilder
    private func vacio(sinRegistros: Bool) -> some View {
        if sinRegistros {
            NxEmptyState(
                title: "Sin cotizaciones",
                subtitle: "Todavía no hay ninguna cotización en esta empresa. La primera se arma desde la computadora."
            )
        } else if !consulta.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            NxEmptyState(
                title: "Sin coincidencias",
                subtitle: "Ninguna cotización coincide con «\(consulta)».",
                actionLabel: "Limpiar búsqueda",
                onAction: { consulta = "" }
            )
        } else {
            NxEmptyState(
                title: "Nada en «\(filtro.etiqueta.lowercased())»",
                subtitle: Self.subtituloVacio(filtro),
                actionLabel: "Ver todas",
                onAction: { filtro = .todas }
            )
        }
    }

    private static func subtituloVacio(_ filtro: CotizacionesRules.Filtro) -> String {
        switch filtro {
        case .porCerrar: return "No hay cotizaciones enviadas esperando respuesta del cliente."
        case .borradores: return "No queda ningún borrador por terminar."
        case .aprobadas: return "Todavía no hay ninguna aprobada."
        case .perdidas: return "Ninguna se rechazó ni se venció. Buena señal."
        case .todas: return "No hay cotizaciones en este filtro."
        }
    }

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
            let filas = try await CotizacionesRepository.shared.lista()
            datos = filas
            cargando = false
            error = nil
            avisoRefresco = nil
        } catch {
            cargando = false
            // Una carga cancelada (la pantalla se fue a medias) no es un error:
            // se vuelve a intentar la próxima vez que aparezca.
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
                if datos == nil { arrancado = false }
                return
            }
            let mensaje = error.toUserMessage(fallback: "No se pudieron cargar las cotizaciones")
            if datos != nil {
                avisoRefresco = mensaje
            } else {
                self.error = mensaje
            }
        }
    }
}

/// `Int` no es `Identifiable`, y `navigationDestination(item:)` lo exige.
struct CotizacionDestino: Identifiable, Hashable {
    let id: Int
}

// MARK: - Pastillas de filtro

/// Fila de pastillas que se desplaza en horizontal (Android `MoreFilaDePastillas`,
/// un `FilterChip` de Material 3): 32 de alto, radio 8, «Todas · 12»; la
/// elegida en `brandSoft` con letra de marca oscura y sin borde.
private struct FilaDePastillasDeCotizacion: View {
    let conteos: [CotizacionesRules.Filtro: Int]
    let seleccion: CotizacionesRules.Filtro
    let onSelect: (CotizacionesRules.Filtro) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(CotizacionesRules.Filtro.allCases, id: \.self) { opcion in
                    PastillaDeCotizacion(
                        texto: conteos[opcion].map { "\(opcion.etiqueta) · \($0)" } ?? opcion.etiqueta,
                        seleccionada: opcion == seleccion,
                        onClick: { onSelect(opcion) }
                    )
                }
            }
            .padding(.horizontal, 2)
            .padding(.vertical, 1)
        }
    }
}

private struct PastillaDeCotizacion: View {
    let texto: String
    let seleccionada: Bool
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            Text(texto)
                .font(NxType.labelLarge)
                .foregroundStyle(seleccionada ? NxColors.brandText : NxColors.fg2)
                .lineLimit(1)
                .padding(.horizontal, 16)
                .frame(height: 32)
                .background(
                    seleccionada ? NxColors.brandSoft : Color.clear,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(seleccionada ? Color.clear : NxColors.borderStrong, lineWidth: 1)
                )
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        // Material reserva 48 de alto para tocarla aunque la pastilla mida 32.
        .frame(minHeight: 48)
        .accessibilityAddTraits(seleccionada ? AccessibilityTraits.isSelected : [])
    }
}

// MARK: - Cifras

/// Lo que está en la mesa y lo que ya se ganó, en una sola tarjeta.
private struct CifrasDeCotizaciones: View {
    let cifras: CotizacionesRules.Cifras

    var body: some View {
        MoreTarjeta {
            HStack(alignment: .top, spacing: 12) {
                CifraSuelta(
                    etiqueta: "Por cerrar",
                    valor: Dinero.pesos(cifras.porCerrarCentavos),
                    pie: cifras.porCerrar == 1 ? "1 enviada" : "\(cifras.porCerrar) enviadas",
                    color: NxColors.brand
                )
                CifraSuelta(
                    etiqueta: "Aprobadas",
                    valor: Dinero.pesos(cifras.aprobadoCentavos),
                    pie: cifras.aprobadas == 1 ? "1 aprobada" : "\(cifras.aprobadas) aprobadas",
                    color: NxColors.success
                )
            }
        }
    }
}

private struct CifraSuelta: View {
    let etiqueta: String
    let valor: String
    let pie: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiqueta)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
            Text(valor)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(color)
                .lineLimit(1)
                .truncationMode(.tail)
            Text(pie)
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(etiqueta): \(valor), \(pie)")
    }
}

// MARK: - Tarjeta

/// Una cotización: folio y estado arriba, cliente en medio, monto grande abajo.
///
/// El folio va en monoespaciado porque es un código que se compara carácter a
/// carácter contra un correo o un WhatsApp.
private struct TarjetaDeCotizacion: View {
    let cotizacion: CotizacionResumen
    let hoy: CotizacionesRules.Dia
    let onAbrir: () -> Void

    var body: some View {
        let estado = CotizacionesRules.estadoDe(cotizacion)
        let vigencia = CotizacionesRules.vigenciaTexto(cotizacion, hoy: hoy)
        let vigenciaTono: NxTone = CotizacionesRules.vigenciaVencida(cotizacion, hoy: hoy) ? .danger : .warning
        let siglas = CotizacionesRules.siglas(cotizacion)
        let autoria = CotizacionesRules.autoriaTexto(cotizacion)

        MoreTarjeta(onClick: onAbrir) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(folio)
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    Text(CotizacionesRules.clienteTexto(cotizacion))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    if let contexto = CotizacionesRules.contextoTexto(cotizacion) {
                        Text(contexto)
                            .font(NxType.bodySmall)
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                NxStatusChip(text: CotizacionesRules.etiquetaEstado(cotizacion), tone: estado.tono)
            }

            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(CotizacionesRules.montoTexto(cotizacion))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let fecha = CotizacionesRules.fechaTexto(cotizacion) {
                    Text(fecha)
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                        .multilineTextAlignment(.trailing)
                }
            }

            // La única alarma de la lista: una enviada que se acaba (o ya se acabó).
            if let vigencia {
                HStack(alignment: .center, spacing: 6) {
                    Image(systemName: "clock.badge.exclamationmark")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 14, height: 14)
                        .accessibilityHidden(true)
                    Text(vigencia)
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundStyle(vigenciaTono.fg)
            }

            if !siglas.isEmpty || autoria != nil {
                Text(
                    [autoria, siglas.isEmpty ? nil : siglas.joined(separator: " · ")]
                        .compactMap { $0 }
                        .joined(separator: " — ")
                )
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.muted)
                .lineLimit(2)
            }
        }
        .accessibilityHint("Abre la cotización")
    }

    private var folio: String {
        let texto = (cotizacion.folio ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return texto.isEmpty ? "Sin folio" : texto
    }
}
