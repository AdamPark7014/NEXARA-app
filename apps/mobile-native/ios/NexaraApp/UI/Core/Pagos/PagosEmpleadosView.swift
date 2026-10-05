import SwiftUI

/// Pagos a empleados (`/erp/finance/employee-payments`) en el teléfono — espejo
/// de `PagosScreen.kt` (`PagosEmpleadosScreen`).
///
/// La web es una tabla con alta, edición, comprobantes y anulación. Aquí **no
/// se paga nada**: se consulta. Cada pago es una fila densa que contesta **a
/// quién**, **cuánto**, **de qué periodo** y **si el dinero ya salió**.
///
/// Los cuatro estados de la pantalla —cargando, error, vacío y contenido— no
/// pueden coincidir (igual que `nxEstadoPantalla` de Android). Quién puede ver
/// los pagos de quién **lo decide el servidor** (`CONTABILIDAD_MANAGE` ve toda la
/// empresa; sin él, solo su departamento): esta pantalla no manda ningún filtro.
///
/// Va dentro del `NavigationStack` del hub «Más»: aquí no se crea otro.
struct PagosEmpleadosView: View {
    @State private var datos: [PagoEmpleado]?
    @State private var cargando = true
    @State private var error: String?
    @State private var avisoRefresco: String?
    @State private var filtro: PagosRules.Filtro = .todos
    @State private var consulta = ""
    @State private var arrancado = false

    /// A partir de cuántos pagos aparece el buscador. Con menos, estorba.
    private static let umbralBusqueda = 6

    private enum EstadoPantalla { case cargando, error, vacio, contenido }

    var body: some View {
        let todos = datos ?? []
        let visibles = PagosRules.aplicar(todos, filtro: filtro, consulta: consulta)
        // «Hay datos» es «hay filas que enseñar», no «ya contestó el servidor»:
        // una empresa sin un solo pago ve el vacío que explica de dónde sale el
        // primero, no una barra de filtros en ceros.
        let estado = Self.estadoPantalla(cargando: cargando, error: error, hayDatos: !todos.isEmpty)

        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                // La cinta de «esto es de hace un momento» convive con el contenido.
                if let aviso = avisoRefresco {
                    MoreAvisoDesactualizado(mensaje: aviso, onCerrar: { avisoRefresco = nil })
                }

                switch estado {
                case .cargando:
                    NxSkeletonList(itemCount: 5, itemHeight: 72)
                case .error:
                    NxErrorBlock(message: error ?? "", onRetry: { Task { await cargar(refresco: datos != nil) } })
                case .vacio:
                    NxEmptyState(
                        title: "Sin pagos registrados",
                        subtitle: "Todavía no hay ningún pago al personal en esta empresa. "
                            + "El primero se captura desde la computadora, con su comprobante."
                    )
                case .contenido:
                    contenido(todos: todos, visibles: visibles)
                }

                MoreNotaDeAlcance(texto: PagosRules.limite)
                Spacer().frame(height: 8)
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
    }

    @ViewBuilder
    private func contenido(todos: [PagoEmpleado], visibles: [PagoEmpleado]) -> some View {
        let conteos = PagosRules.conteos(todos)

        // La tira solo aparece cuando hay filas que contar; tocar una celda filtra.
        NxMetricStrip(
            items: PagosRules.metricas(todos),
            seleccion: PagosRules.metricaDeFiltro(filtro),
            onSelect: { clave in
                if let elegido = PagosRules.filtroDeMetrica(clave) { alternarFiltro(elegido) }
            }
        )

        // Lo único que puede hacer que una cifra de arriba esté mal.
        if let texto = PagosRules.avisoImportesTexto(todos) {
            AvisoDeImportes(texto: texto)
        }

        // Una sola fila de filtros, sin caja y sin fondo.
        NxFilterBar(horizontalPadding: 0) {
            ForEach(PagosRules.Filtro.allCases, id: \.self) { opcion in
                NxFilterPill(
                    label: opcion.etiqueta,
                    count: conteos[opcion],
                    selected: opcion == filtro,
                    color: PagosRules.colorDeFiltro(opcion),
                    onClick: { alternarFiltro(opcion) }
                )
            }
        }

        if todos.count > Self.umbralBusqueda {
            NxSearchField(text: $consulta, placeholder: "Buscar por empleado, concepto o folio")
        }

        if visibles.isEmpty {
            sinCoincidencias
        } else {
            NxDenseSectionHeader(title: PagosRules.tituloLista(filtro), hint: "Del más reciente al más viejo.") {
                Text("\(visibles.count)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(NxColors.fg2)
            }
            // UNA superficie con filas separadas por una línea de 1 px, no una
            // tarjeta por pago dentro de otra caja.
            VStack(spacing: 0) {
                ForEach(Array(visibles.enumerated()), id: \.element.claveLista) { indice, pago in
                    if indice > 0 { NxRowDivider() }
                    FilaDePago(pago: pago)
                }
            }
            .background(NxColors.card)
            .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(NxColors.border, lineWidth: 1)
            )
        }
    }

    /// El vacío de «hay pagos, pero ninguno aquí»: lo útil es el botón que
    /// deshace el filtro o la búsqueda.
    @ViewBuilder
    private var sinCoincidencias: some View {
        if !consulta.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            NxEmptyState(
                title: "Sin coincidencias",
                subtitle: "Ningún pago coincide con «\(consulta)».",
                actionLabel: "Limpiar búsqueda",
                onAction: { consulta = "" }
            )
        } else {
            NxEmptyState(
                title: "Nada en «\(filtro.etiqueta.lowercased())»",
                subtitle: Self.subtituloVacio(filtro),
                actionLabel: "Ver todos",
                onAction: { filtro = .todos }
            )
        }
    }

    private static func subtituloVacio(_ filtro: PagosRules.Filtro) -> String {
        switch filtro {
        case .pagados: return "Todavía no se ha liquidado ningún pago."
        case .borradores: return "No queda ningún pago esperando autorización."
        case .anulados: return "No se ha anulado ningún pago. Buena señal."
        case .todos: return "No hay pagos en este filtro."
        }
    }

    private static func estadoPantalla(cargando: Bool, error: String?, hayDatos: Bool) -> EstadoPantalla {
        if hayDatos { return .contenido }
        if cargando { return .cargando }
        if let error, !error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .error }
        return .vacio
    }

    /// Tocar la celda o la pastilla ya marcada vuelve a «Todos».
    private func alternarFiltro(_ nuevo: PagosRules.Filtro) {
        filtro = filtro == nuevo ? .todos : nuevo
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
            let filas = try await PagosEmpleadosRepository.shared.lista()
            datos = filas
            cargando = false
            error = nil
            avisoRefresco = nil
        } catch {
            cargando = false
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
                if datos == nil { arrancado = false }
                return
            }
            // Un 403 aquí es una respuesta legítima (`CONTABILIDAD_VIEW` lo decide
            // el servidor) y su mensaje se enseña tal cual.
            let mensaje = error.toUserMessage(fallback: "No se pudieron cargar los pagos a empleados")
            if datos != nil {
                avisoRefresco = mensaje
            } else {
                self.error = mensaje
            }
        }
    }
}

// MARK: - Fila

/// Un pago, en una fila: a la izquierda quién y de qué; a la derecha **el
/// importe, alineado a la derecha** y debajo el estado como punto y palabra.
/// Toda la fila se lee de una vez con VoiceOver.
private struct FilaDePago: View {
    let pago: PagoEmpleado

    var body: some View {
        let empleado = PagosRules.empleadoTexto(pago)
        let concepto = PagosRules.conceptoTexto(pago)
        let contexto = PagosRules.contextoTexto(pago)
        let monto = PagosRules.montoTexto(pago)
        let estado = PagosRules.estadoDe(pago)
        let pagadoEl = PagosRules.pagadoElTexto(pago)

        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(empleado)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                Text(concepto)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.fg2)
                    .lineLimit(2)
                if let contexto {
                    Text(contexto)
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(2)
                }
                if let pagadoEl {
                    Text(pagadoEl)
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 4) {
                Text(monto)
                    .font(.system(size: 16, weight: .bold))
                    // Un importe ilegible no grita en rojo, pero tampoco se disfraza
                    // de cifra: va en gris y dice «—».
                    .foregroundStyle(monto == PagosRules.sinDato ? NxColors.muted : NxColors.fg)
                    .lineLimit(1)
                    .multilineTextAlignment(.trailing)
                NxStatusDot(text: estado.etiqueta, color: PagosRules.colorDe(estado))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(descripcion(empleado: empleado, concepto: concepto, monto: monto,
                                        estado: estado, contexto: contexto, pagadoEl: pagadoEl))
    }

    /// «—» se lee fatal en voz alta: se dice con palabras qué pasa.
    private func descripcion(
        empleado: String,
        concepto: String,
        monto: String,
        estado: PagosRules.Estado,
        contexto: String?,
        pagadoEl: String?
    ) -> String {
        var texto = "\(empleado). \(concepto). "
        texto += monto == PagosRules.sinDato ? "Importe no disponible. " : "\(monto). "
        texto += "\(estado.etiqueta). "
        if let contexto { texto += "\(contexto). " }
        if let pagadoEl { texto += "\(pagadoEl). " }
        return texto
    }
}

/// El aviso de que alguna cifra de arriba se quedó corta: arriba, con color y
/// con palabras.
private struct AvisoDeImportes: View {
    let texto: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(NxColors.warning)
                .frame(width: 18, height: 18)
                .accessibilityHidden(true)
            Text(texto)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.fg)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(NxColors.warningSoft, in: RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous))
    }
}
