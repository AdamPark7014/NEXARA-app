import SwiftUI

// MARK: - Estado de la pantalla

/// La pantalla de Gastos: la lista, sus filtros y las cuatro cosas que se
/// pueden hacer con un gasto desde el teléfono (`GastosViewModel.kt`).
///
/// **Un fallo al refrescar no borra lo que ya se veía**: la primera carga
/// fallida va a `error`; un refresco fallido deja los datos y avisa en una cinta.
/// Filtro y búsqueda no vuelven a pedir nada: la lista llega entera y
/// `GastosRules` la filtra en memoria.
@MainActor
final class GastosModelo: ObservableObject {
    enum EstadoPantalla { case cargando, error, vacio, contenido }

    @Published private(set) var datos: [Gasto]?
    @Published private(set) var cargando = true
    @Published private(set) var refrescando = false
    @Published private(set) var error: String?
    @Published var avisoRefresco: String?

    @Published private(set) var filtro: GastosRules.Filtro = .todos
    @Published var consulta = ""

    /// Lo que pasa con una acción: registrar, autorizar, rechazar o pagar.
    @Published private(set) var enviando = false
    @Published var errorAccion: String?
    @Published var avisoAccion: String?

    /// Si se enseñan los botones de decidir (`contabilidad.manage`). Pista, no autoridad.
    let puedeDecidir: Bool = GastosRepository.administraGastos()

    private let repo = GastosRepository.shared
    private var arrancado = false

    var todos: [Gasto] { datos ?? [] }
    var hayDatos: Bool { datos != nil }

    /// Los cuatro estados son excluyentes (`nxEstadoPantalla` de Android).
    /// «Hay datos» es que haya **filas**: una empresa sin gastos cae en VACÍO.
    var estadoPantalla: EstadoPantalla {
        if !todos.isEmpty { return .contenido }
        if cargando { return .cargando }
        if let error, !error.isEmpty { return .error }
        return .vacio
    }

    func gasto(clave: String) -> Gasto? { todos.first { $0.id == clave } }

    /// La primera carga la dispara la pantalla, y solo una vez.
    func arrancar() async {
        guard !arrancado else { return }
        arrancado = true
        await lanzar(refresco: false)
    }

    func refrescar() async { await lanzar(refresco: true) }

    func reintentar() {
        let refresco = hayDatos
        Task { await lanzar(refresco: refresco) }
    }

    func descartarAviso() { avisoRefresco = nil }

    func cambiarFiltro(_ nuevo: GastosRules.Filtro) { filtro = nuevo }

    /// Tocar el filtro que ya está puesto vuelve a «Todos».
    func alternarFiltro(_ nuevo: GastosRules.Filtro) {
        filtro = filtro == nuevo ? .todos : nuevo
    }

    /// La tira de cifras manda la clave de la celda que se tocó.
    func alternarPorClave(_ clave: String) {
        if let nuevo = GastosRules.Filtro.porClave(clave) { alternarFiltro(nuevo) }
    }

    func limpiarAccion() {
        errorAccion = nil
        avisoAccion = nil
    }

    func autorizar(_ id: Int) {
        ejecutar(
            hecho: "Gasto autorizado",
            enCola: "Sin conexión: la autorización quedó en la cola y se mandará al recuperar señal",
            fallo: "No se pudo autorizar el gasto"
        ) { [repo] in try await repo.resolver(id: id, aprobar: true, nota: nil) }
    }

    /// El motivo es obligatorio en la pantalla aunque el servidor lo acepte vacío:
    /// se concatena al concepto del lado del servidor y queda en el registro.
    func rechazar(_ id: Int, motivo: String) {
        ejecutar(
            hecho: "Gasto rechazado",
            enCola: "Sin conexión: el rechazo quedó en la cola y se mandará al recuperar señal",
            fallo: "No se pudo rechazar el gasto"
        ) { [repo] in try await repo.resolver(id: id, aprobar: false, nota: motivo) }
    }

    /// Marca el pago; el servidor levanta el asiento contable y sella el folio.
    func marcarPagado(_ id: Int) {
        ejecutar(
            hecho: "Gasto marcado como pagado",
            enCola: "Sin conexión: el pago quedó en la cola y se mandará al recuperar señal",
            fallo: "No se pudo marcar el gasto como pagado"
        ) { [repo] in try await repo.marcarPagado(id: id) }
    }

    /// Registra un gasto con la foto del ticket. El importe se convierte a
    /// centavos aquí: la cifra que viaja es la que validó `faltaParaRegistrar`.
    func registrar(
        concepto: String,
        importe: String,
        categoria: String,
        esRecurrente: Bool,
        fecha: String,
        ticket: CapturedGeoPhoto
    ) {
        guard let centavos = Dinero.parsearCentavos(importe), centavos > 0 else {
            errorAccion = "Ese importe no se entiende"
            return
        }
        ejecutar(
            hecho: "Gasto registrado; queda por autorizar",
            enCola: "Sin conexión: el gasto quedó en la cola con su foto y se mandará al recuperar señal",
            fallo: "No se pudo registrar el gasto"
        ) { [repo] in
            try await repo.registrar(
                concepto: concepto,
                centavos: centavos,
                categoria: categoria,
                esRecurrente: esRecurrente,
                fecha: fecha,
                ticket: ticket
            )
        }
    }

    /// El molde de las cuatro acciones: avisar que se está enviando, contar la
    /// verdad del resultado y releer del servidor (que sella folios y pólizas).
    /// «En cola» es un resultado distinto de «hecho», no un éxito con otro nombre.
    private func ejecutar(
        hecho: String,
        enCola: String,
        fallo: String,
        bloque: @escaping () async throws -> Bool
    ) {
        guard !enviando else { return }
        enviando = true
        errorAccion = nil
        avisoAccion = nil
        Task {
            do {
                let seEncolo = try await bloque()
                enviando = false
                avisoAccion = seEncolo ? enCola : hecho
                if !seEncolo { await lanzar(refresco: true) }
            } catch let problema {
                enviando = false
                errorAccion = problema.toUserMessage(fallback: fallo)
            }
        }
    }

    private func lanzar(refresco: Bool) async {
        if refresco {
            refrescando = true
            avisoRefresco = nil
        } else {
            cargando = true
            error = nil
            avisoRefresco = nil
        }
        do {
            let lista = try await repo.lista()
            datos = lista
            cargando = false
            refrescando = false
            error = nil
            avisoRefresco = nil
        } catch let problema {
            let mensaje = problema.toUserMessage(fallback: "No se pudieron cargar los gastos")
            cargando = false
            refrescando = false
            if hayDatos {
                avisoRefresco = mensaje
            } else {
                error = mensaje
            }
        }
    }
}

// MARK: - Pantalla

/// Gastos administrativos (`/erp/finance/expenses`) en el teléfono
/// (`GastosScreen.kt`).
///
/// Aquí se hace lo que se hace con el teléfono en la mano: **registrar el gasto
/// con la foto del ticket** y **autorizarlo o marcarlo pagado**. Corregir y
/// reportar siguen en la computadora, y la nota del pie lo dice sin echar a
/// nadie al navegador.
///
/// Arriba, una sola fila de filtros; debajo, la tira de cifras (que también
/// filtra), el buscador, el encabezado denso y las filas pegadas con el monto a
/// la derecha. Un único botón primario, el flotante «Registrar gasto».
///
/// Va dentro del `NavigationStack` del hub «Más»: aquí no se crea otro.
struct GastosView: View {
    @StateObject private var modelo = GastosModelo()

    /// Qué hoja está abierta. Se guarda la clave y no la fila: al releer del
    /// servidor, la hoja enseña el gasto nuevo, no la copia vieja.
    @State private var abierto: GastoHojaClave?
    @State private var altaAbierta = false
    @State private var snackbar: String?

    /// A partir de cuántos gastos vale la pena ofrecer el buscador.
    private static let umbralBusqueda = 6

    var body: some View {
        let todos = modelo.todos
        let estado = modelo.estadoPantalla

        VStack(spacing: 0) {
            // Una sola fila de filtros, sin caja; solo cuando hay algo que filtrar.
            if estado == .contenido {
                let conteos = GastosRules.conteos(todos)
                NxFilterBar {
                    ForEach(GastosRules.Filtro.allCases) { opcion in
                        NxFilterPill(
                            label: opcion.etiqueta,
                            count: conteos[opcion],
                            selected: opcion == modelo.filtro,
                            onClick: { modelo.alternarFiltro(opcion) }
                        )
                    }
                }
                .padding(.vertical, 10)
            }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if let aviso = modelo.avisoRefresco {
                        MoreAvisoDesactualizado(mensaje: aviso, onCerrar: { modelo.descartarAviso() })
                            .padding(.bottom, 12)
                    }

                    switch estado {
                    case .cargando:
                        NxSkeletonList(itemCount: 5, itemHeight: 68)
                    case .error:
                        NxErrorBlock(message: modelo.error, onRetry: { modelo.reintentar() })
                    case .vacio:
                        NxEmptyState(
                            title: "Todavía no hay gastos",
                            subtitle: "Aquí se juntan la renta, los servicios, las suscripciones y lo que "
                                + "se paga de la bolsa. El primero se registra con la foto de su ticket.",
                            systemImage: CoreExtraModule.gastos.systemImage,
                            actionLabel: "Registrar un gasto",
                            onAction: { altaAbierta = true }
                        )
                    case .contenido:
                        contenido(todos)
                    }

                    MoreNotaDeAlcance(texto: GastosRules.limite)
                        .padding(.top, 12)
                }
                .padding(.horizontal, NxSpacing.screenH)
                .padding(.top, 4)
                .padding(.bottom, 96)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await modelo.refrescar() }
            .sheet(isPresented: $altaAbierta, onDismiss: { modelo.errorAccion = nil }) {
                HojaDeAltaDeGasto(modelo: modelo, onCerrar: { altaAbierta = false })
            }
        }
        .nxScreenBackground()
        .nxFab("Registrar gasto", systemImage: "plus") { altaAbierta = true }
        .overlay(alignment: .bottom) {
            if let snackbar {
                FinanzasSnackbar(mensaje: snackbar)
                    .padding(.bottom, 72)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .sheet(item: $abierto, onDismiss: { modelo.errorAccion = nil }) { clave in
            HojaDeGasto(clave: clave.id, modelo: modelo, onCerrar: { abierto = nil })
        }
        .task { await modelo.arrancar() }
        // El resultado bueno se cuenta una vez y cierra la hoja que lo pidió:
        // dejarla abierta sobre una lista que ya cambió invita a repetir.
        .onChange(of: modelo.avisoAccion) { _, nuevo in
            guard let nuevo else { return }
            abierto = nil
            altaAbierta = false
            modelo.limpiarAccion()
            mostrar(nuevo)
        }
        // Un fallo con una hoja abierta lo cuenta la hoja; sin hoja, la cinta.
        .onChange(of: modelo.errorAccion) { _, nuevo in
            guard let nuevo, abierto == nil, !altaAbierta else { return }
            modelo.errorAccion = nil
            mostrar(nuevo)
        }
    }

    @ViewBuilder
    private func contenido(_ todos: [Gasto]) -> some View {
        let visibles = GastosRules.aplicar(todos, filtro: modelo.filtro, consulta: modelo.consulta)
        let cifras = GastosRules.cifras(todos)

        // La tira aparece porque hay filas que contar; tocar una celda filtra.
        if !cifras.isEmpty {
            NxMetricStrip(
                items: cifras,
                seleccion: modelo.filtro.clave,
                onSelect: { modelo.alternarPorClave($0) }
            )
            .padding(.bottom, 12)
        }

        // Con pocos gastos, buscar es más trabajo que mirar.
        if todos.count > Self.umbralBusqueda {
            NxSearchField(text: $modelo.consulta, placeholder: "Buscar por concepto, persona o categoría")
                .padding(.bottom, 12)
        }

        if visibles.isEmpty {
            vacioDeFiltro
        } else {
            NxDenseSectionHeader(title: modelo.filtro.etiqueta, hint: "Del más reciente al más viejo") {
                Text("\(visibles.count)")
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.muted)
            }
            .padding(.bottom, 8)

            ForEach(Array(visibles.enumerated()), id: \.element.id) { indice, gasto in
                FilaDeGasto(
                    gasto: gasto,
                    primera: indice == 0,
                    ultima: indice == visibles.count - 1,
                    onAbrir: { abierto = GastoHojaClave(id: gasto.id) }
                )
            }
        }
    }

    /// El vacío de un filtro no es el de una empresa sin gastos: se nombra el
    /// filtro y se ofrece deshacerlo.
    @ViewBuilder
    private var vacioDeFiltro: some View {
        let consulta = modelo.consulta
        if !consulta.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            NxEmptyState(
                title: "Sin coincidencias",
                subtitle: "Ningún gasto coincide con «\(consulta)».",
                systemImage: "magnifyingglass",
                actionLabel: "Limpiar búsqueda",
                onAction: { modelo.consulta = "" }
            )
        } else {
            let filtro = modelo.filtro
            NxEmptyState(
                title: "Nada en «\(filtro.etiqueta.lowercased())»",
                subtitle: Self.subtituloVacio(filtro),
                systemImage: CoreExtraModule.gastos.systemImage,
                actionLabel: "Ver todos",
                onAction: { modelo.cambiarFiltro(.todos) }
            )
        }
    }

    private static func subtituloVacio(_ filtro: GastosRules.Filtro) -> String {
        switch filtro {
        case .porAutorizar: return "No hay gastos esperando visto bueno. Al día."
        case .porPagar: return "No queda ningún gasto autorizado sin pagar."
        case .sinComprobante: return "Todos los gastos tienen su comprobante. Nada bloquea el cierre."
        case .pagados: return "Todavía no se ha liquidado ningún gasto."
        case .rechazados: return "No se ha rechazado ninguno. Buena señal."
        case .todos: return "No hay gastos en este filtro."
        }
    }

    /// `showSnackbar` de Android: dura lo que el «Short» de Material (4 s).
    private func mostrar(_ texto: String) {
        withAnimation(.easeOut(duration: 0.2)) { snackbar = texto }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if snackbar == texto {
                withAnimation(.easeIn(duration: 0.2)) { snackbar = nil }
            }
        }
    }
}

/// `Int`/`String` no es `Identifiable`, y `sheet(item:)` lo exige.
struct GastoHojaClave: Identifiable, Hashable {
    let id: String
}

// MARK: - Fila

/// Una fila de la tabla densa (`FilaDeGasto` de Android).
///
/// Las filas comparten una sola superficie blanca con las esquinas redondeadas
/// (12) arriba y abajo del bloque, y se separan con una línea de 1: es una
/// tabla, no una pila de tarjetas con sombra. Concepto y contexto a la
/// izquierda; **monto a la derecha en cifras de ancho fijo**, y debajo la fecha
/// y el estado. La única alarma —que falte el comprobante— va bajo el concepto.
private struct FilaDeGasto: View {
    let gasto: Gasto
    let primera: Bool
    let ultima: Bool
    let onAbrir: () -> Void

    /// Ancho mínimo de la columna del monto: que la cifra no baile de fila en fila.
    private static let anchoMonto: CGFloat = 96

    var body: some View {
        let estado = GastosRules.estadoDe(gasto)
        let concepto = GastosRules.conceptoTexto(gasto)
        let monto = GastosRules.montoTexto(gasto)
        let fecha = GastosRules.fechaTexto(gasto)
        let faltaTicket = GastosRules.sinComprobante(gasto)
        let forma = UnevenRoundedRectangle(
            topLeadingRadius: primera ? NxRadius.m : 0,
            bottomLeadingRadius: ultima ? NxRadius.m : 0,
            bottomTrailingRadius: ultima ? NxRadius.m : 0,
            topTrailingRadius: primera ? NxRadius.m : 0,
            style: .continuous
        )

        Button(action: onAbrir) {
            VStack(spacing: 0) {
                // La línea va arriba de cada fila menos la primera.
                if !primera {
                    NxRowDivider().padding(.leading, 12)
                }
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(concepto)
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        Text(GastosRules.contextoTexto(gasto))
                            .font(.system(size: 11.5))
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        if faltaTicket {
                            NxStatusDot(
                                text: "Sin comprobante",
                                color: GastosRules.colorEstado(.rechazado),
                                fontSize: 11.5,
                                fontWeight: .semibold
                            )
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    VStack(alignment: .trailing, spacing: 2) {
                        Text(monto)
                            .font(.system(size: 14.5, weight: .bold).monospacedDigit())
                            .foregroundStyle(NxColors.fg)
                            .lineLimit(1)
                        Text(fecha)
                            .font(.system(size: 11.5))
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(1)
                        NxStatusDot(
                            text: GastosRules.etiquetaEstado(gasto),
                            color: GastosRules.colorEstado(estado),
                            fontSize: 11.5
                        )
                    }
                    .frame(minWidth: Self.anchoMonto, alignment: .trailing)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NxColors.card, in: forma)
            .clipShape(forma)
            .contentShape(forma)
        }
        .buttonStyle(NxPressableStyle())
        // La fila entera se lee de una vez con VoiceOver.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(concepto), \(monto), \(GastosRules.etiquetaEstado(gasto)), \(fecha)"
                + (faltaTicket ? ", sin comprobante" : "")
        )
        .accessibilityAddTraits(.isButton)
    }
}
