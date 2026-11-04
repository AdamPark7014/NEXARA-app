import SwiftUI

/// Almacén (`/erp/almacen`) en iPhone — Android `AlmacenScreen`.
///
/// Cada quien ve lo suyo (`AlmacenReglas.Perfil`):
/// - **Dirección**: sin escáner. Existencias, bajo mínimo y movimientos con quién los hizo.
/// - **Quien opera (Iván, `stock.manage`)**: arriba el escáner (`EscanerDeAlmacen`) para
///   buscar un producto, darlo de alta y registrar entradas o salidas; debajo, lo mismo
///   que dirección.
/// - **Los demás**: consulta de existencias, sin escáner.
///
/// La pregunta en campo es «¿alcanza o hay que pedir?», así que la pantalla
/// **abre en lo que está bajo mínimo** —la lista de compras— y el inventario
/// completo queda en la otra pastilla. El costo no sale: en el bolsillo no se
/// decide un precio, y sí se enseña delante de un cliente.
///
/// Es una `List` de filas transparentes: cada fila es una tarjeta de «Más»,
/// el escáner incluido (una `MoreTarjeta` con sus campos).
struct AlmacenView: View {
    @ObservedObject private var session = SessionStore.shared

    @State private var estado = CoreExtrasEstado<AlmacenConsulta>()
    @State private var movimientos = CoreExtrasEstado<[MovimientoDeAlmacen]>()
    @State private var vista: AlmacenReglas.Vista = .bajoMinimo
    @State private var consulta = ""

    private var perfil: AlmacenReglas.Perfil { AlmacenReglas.perfil(de: session.currentUser) }

    private var visibles: [StockNivel] {
        guard let datos = estado.datos else { return [] }
        let base: [StockNivel]
        switch vista {
        case .bajoMinimo:
            // Primero lo agotado, después lo más cerca del mínimo.
            base = datos.bajoMinimo.sorted { a, b in
                if a.agotado != b.agotado { return a.agotado }
                let pa = a.progreso ?? 1
                let pb = b.progreso ?? 1
                if pa != pb { return pa < pb }
                return a.titulo.lowercased() < b.titulo.lowercased()
            }
        case .todo, .movimientos:
            base = datos.niveles.sorted { a, b in
                let ta = a.titulo.lowercased()
                let tb = b.titulo.lowercased()
                if ta != tb { return ta < tb }
                return a.ubicacionTexto.lowercased() < b.ubicacionTexto.lowercased()
            }
        }
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return base }
        return base.filter { nivel in
            [nivel.product?.name, nivel.product?.sku, nivel.warehouse?.name, nivel.warehouse?.code]
                .compactMap { $0?.lowercased() }
                .contains { $0.contains(q) }
        }
    }

    /// «sin existencia» y «bajo mínimo», uno por renglón; `nil` si no hay nada que pedir.
    private var resumenAlertas: String? {
        guard let bajos = estado.datos?.bajoMinimo, !bajos.isEmpty else { return nil }
        let agotados = bajos.filter(\.agotado).count
        var partes: [String] = []
        if agotados > 0 { partes.append("\(agotados) sin existencia") }
        let resto = bajos.count - agotados
        if resto > 0 { partes.append("\(resto) bajo mínimo") }
        return partes.joined(separator: "\n")
    }

    var body: some View {
        List {
            Group {
                // El escáner es una tarjeta más, arriba de todo (Android `item(key = "escaner")`).
                if AlmacenReglas.muestraEscaner(perfil) {
                    EscanerDeAlmacen(onMovimiento: { Task { await cargar() } })
                }

                FilaDePastillasDeConsulta(pastillas: AlmacenReglas.vistas(perfil).map { opcion in
                    PastillaDeConsulta(
                        etiqueta: opcion.etiqueta,
                        conteo: conteo(de: opcion),
                        seleccionada: opcion == vista,
                        onClick: { cambiarVista(opcion) }
                    )
                })

                if vista == .movimientos {
                    seccionMovimientos
                } else {
                    if let aviso = estado.avisoDesactualizado {
                        MoreAvisoDesactualizado(mensaje: aviso) { estado.avisoDesactualizado = nil }
                    }

                    if estado.mostrandoEsqueleto {
                        NxSkeletonList(itemCount: 6, itemHeight: 88)
                    }

                    if let error = estado.error, !estado.hayDatos {
                        NxErrorBlock(message: error, onRetry: { Task { await cargar() } })
                    }

                    if let datos = estado.datos {
                        contenido(datos)
                    }
                }

                MoreNotaDeAlcance(texto: AlmacenReglas.limite(perfil))
            }
            // El margen lateral lo pone la lista agrupada.
            .listRowInsets(EdgeInsets(top: 5, leading: 0, bottom: 5, trailing: 0))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
        }
        .listStyle(.insetGrouped)
        // El teclado de la cantidad (decimal) no trae «Listo»: se baja al deslizar.
        .scrollDismissesKeyboard(.interactively)
        .nxListBackground()
        .refreshable { await cargar() }
        .task { if !estado.hayDatos { await cargar() } }
    }

    private func conteo(de opcion: AlmacenReglas.Vista) -> Int? {
        switch opcion {
        case .bajoMinimo: return estado.datos?.bajoMinimo.count
        case .todo: return estado.datos?.niveles.count
        case .movimientos: return movimientos.datos?.count
        }
    }

    /// La búsqueda es de la pestaña en que se escribió: en otra lista no significa nada.
    private func cambiarVista(_ nueva: AlmacenReglas.Vista) {
        if nueva != vista { consulta = "" }
        vista = nueva
    }

    @ViewBuilder
    private func contenido(_ datos: AlmacenConsulta) -> some View {
        if let resumen = resumenAlertas {
            MoreTarjeta {
                Text("Hay que pedir")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                Text(resumen)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.danger)
                Text("De \(datos.niveles.count) existencias en total")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
        }

        if vista == .todo || datos.bajoMinimo.count > 6 {
            NxSearchField(text: $consulta, placeholder: "Buscar por producto, SKU o almacén")
        }

        let filas = visibles
        if filas.isEmpty {
            vacio(total: datos.niveles.count)
        } else {
            MoreCabecera(
                titulo: vista.etiqueta,
                subtitulo: vista == .bajoMinimo ? "Primero lo que ya se acabó" : "En orden alfabético",
                trailing: "\(filas.count)"
            )
            ForEach(filas) { FilaDeExistencia(nivel: $0) }
        }
    }

    @ViewBuilder
    private func vacio(total: Int) -> some View {
        if !consulta.trimmingCharacters(in: .whitespaces).isEmpty {
            NxEmptyState(
                title: "Sin coincidencias",
                subtitle: "Ningún producto coincide con «\(consulta)».",
                actionLabel: "Limpiar búsqueda",
                onAction: { consulta = "" }
            )
        } else if vista == .bajoMinimo && total > 0 {
            NxEmptyState(
                title: "Nada bajo mínimo",
                subtitle: "Ningún producto con punto de reorden está por acabarse.",
                actionLabel: "Ver todo el inventario",
                onAction: { vista = .todo }
            )
        } else {
            NxEmptyState(title: "Sin existencias", subtitle: AlmacenReglas.vacioExistencias(perfil))
        }
    }

    // MARK: Movimientos

    /// Qué se movió y quién lo hizo. Lista aparte: si falla, las existencias siguen ahí.
    @ViewBuilder
    private var seccionMovimientos: some View {
        if let aviso = movimientos.avisoDesactualizado {
            MoreAvisoDesactualizado(mensaje: aviso) { movimientos.avisoDesactualizado = nil }
        }
        if movimientos.mostrandoEsqueleto {
            NxSkeletonList(itemCount: 6, itemHeight: 88)
        }
        if let error = movimientos.error, !movimientos.hayDatos {
            NxErrorBlock(message: error, onRetry: { Task { await cargarMovimientos() } })
        }
        if let lista = movimientos.datos {
            if lista.count > 6 {
                NxSearchField(text: $consulta, placeholder: "Buscar por producto, persona o almacén")
            }
            let filas = AlmacenReglas.buscarMovimientos(lista, consulta: consulta)
            if lista.isEmpty {
                NxEmptyState(title: "Sin movimientos", subtitle: AlmacenReglas.vacioMovimientos(perfil))
            } else if filas.isEmpty {
                NxEmptyState(
                    title: "Sin coincidencias",
                    subtitle: "Ningún movimiento coincide con «\(consulta)».",
                    actionLabel: "Limpiar búsqueda",
                    onAction: { consulta = "" }
                )
            } else {
                MoreCabecera(titulo: "Movimientos", subtitulo: "Del más reciente al más viejo", trailing: "\(filas.count)")
                ForEach(filas) { FilaDeMovimiento(movimiento: $0) }
            }
        }
    }

    // MARK: Datos

    private func cargar() async {
        estado.empezar()
        do {
            estado.exito(try await CoreExtrasRepository.shared.almacen())
        } catch {
            estado.fallo(error.toUserMessage(fallback: "No se pudo cargar el almacén"))
        }
        if AlmacenReglas.vistas(perfil).contains(.movimientos) {
            await cargarMovimientos()
        }
    }

    private func cargarMovimientos() async {
        movimientos.empezar()
        do {
            movimientos.exito(try await CoreExtrasRepository.shared.movimientosAlmacen())
        } catch {
            movimientos.fallo(error.toUserMessage(fallback: "No se pudieron cargar los movimientos"))
        }
    }
}

/// Una existencia: la cantidad grande a la derecha, la barra contra el punto de
/// reorden y el estado con palabras para quien no ve el color.
private struct FilaDeExistencia: View {
    let nivel: StockNivel

    var body: some View {
        let tono: NxTone = nivel.agotado ? .danger : (nivel.bajoMinimo ? .warning : .success)
        let estadoTexto = nivel.agotado ? "Agotado" : (nivel.bajoMinimo ? "Bajo mínimo" : "Con existencia")
        MoreTarjeta {
            HStack(alignment: .top, spacing: NxSpacing.m) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(nivel.titulo)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    Text(nivel.ubicacionTexto)
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(CoreExtrasFormato.numero(nivel.cantidad))
                        .font(NxType.headlineSmall.bold())
                        .foregroundStyle(tono.fg)
                        .lineLimit(1)
                    Text("en existencia")
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                }
            }
            MoreBarra(progreso: nivel.progreso, etiqueta: nivel.detalleTexto, tono: tono)
            NxStatusChip(text: estadoTexto, tone: tono)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Un movimiento: qué producto, cuánto, de dónde a dónde, quién lo hizo y cuándo.
private struct FilaDeMovimiento: View {
    let movimiento: MovimientoDeAlmacen

    var body: some View {
        let ruta = AlmacenReglas.rutaMovimiento(movimiento)
        let cuando = FechaMexico.diaHora(iso: movimiento.createdAt)
        MoreTarjeta {
            HStack(alignment: .top, spacing: NxSpacing.m) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(AlmacenReglas.tituloMovimiento(movimiento))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    if let ruta {
                        Text(ruta)
                            .font(NxType.labelMedium)
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(CoreExtrasFormato.numero(movimiento.cantidad))
                        .font(NxType.headlineSmall.bold())
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(1)
                    Text(AlmacenReglas.etiquetaMovimiento(movimiento.type))
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                }
            }
            Text(AlmacenReglas.quienLoHizo(movimiento))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            if let cuando {
                Text(cuando)
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
            if let nota = movimiento.notes?.nilSiVacio {
                Text(nota)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(3)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
