import SwiftUI

/// Almacén (`/erp/almacen`) en iPhone — Android `AlmacenScreen`: arriba el
/// escáner de códigos de barras (`EscanerDeAlmacen`) para buscar un producto y
/// registrar entradas o salidas con permiso de inventario; debajo, la consulta
/// de existencias.
///
/// La pregunta en campo es «¿alcanza o hay que pedir?», así que la pantalla
/// **abre en lo que está bajo mínimo** —la lista de compras— y el inventario
/// completo queda en la otra pastilla. El costo no sale: en el bolsillo no se
/// decide un precio, y sí se enseña delante de un cliente.
///
/// Es una `List` de filas transparentes: cada fila es una tarjeta de «Más»,
/// el escáner incluido (una `MoreTarjeta` con sus campos).
struct AlmacenView: View {
    enum Vista: String, CaseIterable, Identifiable {
        case bajoMinimo
        case todo

        var id: String { rawValue }

        var etiqueta: String {
            switch self {
            case .bajoMinimo: return "Bajo mínimo"
            case .todo: return "Todo el inventario"
            }
        }
    }

    static let limite = "Con el escáner se consultan productos y se registran entradas y salidas (si tu usuario "
        + "puede mover inventario). Traspasos, ajustes y costos se hacen desde la computadora."

    @State private var estado = CoreExtrasEstado<AlmacenConsulta>()
    @State private var vista: Vista = .bajoMinimo
    @State private var consulta = ""

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
        case .todo:
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

    /// «3 sin existencia · 11 bajo mínimo»; `nil` si no hay nada que pedir.
    private var resumenAlertas: String? {
        guard let bajos = estado.datos?.bajoMinimo, !bajos.isEmpty else { return nil }
        let agotados = bajos.filter(\.agotado).count
        var partes: [String] = []
        if agotados > 0 { partes.append("\(agotados) sin existencia") }
        let resto = bajos.count - agotados
        if resto > 0 { partes.append("\(resto) bajo mínimo") }
        return partes.joined(separator: " · ")
    }

    var body: some View {
        List {
            Group {
                // El escáner es una tarjeta más, arriba de todo (Android `item(key = "escaner")`).
                EscanerDeAlmacen(onMovimiento: { Task { await cargar() } })

                FilaDePastillasDeConsulta(pastillas: Vista.allCases.map { opcion in
                    PastillaDeConsulta(
                        etiqueta: opcion.etiqueta,
                        conteo: opcion == .bajoMinimo ? estado.datos?.bajoMinimo.count : estado.datos?.niveles.count,
                        seleccionada: opcion == vista,
                        onClick: { vista = opcion }
                    )
                })

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

                MoreNotaDeAlcance(texto: Self.limite)
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
            NxEmptyState(
                title: "Sin existencias",
                subtitle: "Todavía no hay productos con existencia en los almacenes de esta empresa."
            )
        }
    }

    private func cargar() async {
        estado.empezar()
        do {
            estado.exito(try await CoreExtrasRepository.shared.almacen())
        } catch {
            estado.fallo(error.toUserMessage(fallback: "No se pudo cargar el almacén"))
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
