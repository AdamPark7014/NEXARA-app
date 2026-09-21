import SwiftUI

/// Almacén (`/erp/almacen`) en iPhone, **solo consulta**.
///
/// La tabla de la web tiene nueve columnas: producto, SKU, almacén, ubicación,
/// cantidad, reservado, disponible, punto de reorden y costo. En un teléfono eso
/// no se lee, y además no es la pregunta que se hace en campo. La pregunta es
/// «¿alcanza o hay que pedir?», así que la pantalla **abre en lo que está bajo
/// mínimo** —que es la lista de compras— y el inventario completo queda en el
/// otro segmento, con `.searchable`.
///
/// Cada fila lleva el producto, dónde está, la cantidad grande a la derecha y
/// una barra que compara lo que hay contra el punto de reorden. El costo no
/// sale: en el bolsillo no se decide un precio, y sí se enseña delante de un
/// cliente.
struct AlmacenView: View {
    enum Vista: String, CaseIterable, Identifiable {
        case bajoMinimo = "Bajo mínimo"
        case todo = "Todo"

        var id: String { rawValue }
    }

    @State private var estado = CoreExtrasEstado<AlmacenConsulta>()
    @State private var vista: Vista = .bajoMinimo
    @State private var busqueda = ""

    private var visibles: [StockNivel] {
        guard let datos = estado.datos else { return [] }
        let base: [StockNivel]
        switch vista {
        case .bajoMinimo:
            // Primero lo agotado, después lo más cerca del mínimo: así la
            // primera pantalla ya es la lista de compras.
            base = datos.bajoMinimo.sorted { a, b in
                if a.agotado != b.agotado { return a.agotado }
                let pa = a.progreso ?? 1
                let pb = b.progreso ?? 1
                if pa != pb { return pa < pb }
                return a.titulo.localizedCaseInsensitiveCompare(b.titulo) == .orderedAscending
            }
        case .todo:
            base = datos.niveles.sorted {
                $0.titulo.localizedCaseInsensitiveCompare($1.titulo) == .orderedAscending
            }
        }
        let q = busqueda.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
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
            Section {
                Picker("Vista", selection: $vista) {
                    ForEach(Vista.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }

            if let aviso = estado.avisoDesactualizado {
                Section { CoreExtrasAvisoDesactualizado(mensaje: aviso) }
            }

            if estado.mostrandoEsqueleto {
                Section { CoreExtrasCargando() }
            }

            if let datos = estado.datos {
                if let resumen = resumenAlertas {
                    Section {
                        LabeledContent("Hay que pedir") {
                            Text(resumen).foregroundStyle(.red).font(.body.weight(.semibold))
                        }
                    } footer: {
                        Text("De \(datos.niveles.count) existencias en total.")
                    }
                }

                Section {
                    if visibles.isEmpty {
                        vacio(total: datos.niveles.count)
                    } else {
                        ForEach(visibles) { nivel in
                            fila(nivel)
                        }
                    }
                } header: {
                    Text(vista == .bajoMinimo ? "Bajo mínimo" : "Todo el inventario")
                } footer: {
                    if !visibles.isEmpty {
                        Text(vista == .bajoMinimo
                             ? "Primero lo que ya se acabó."
                             : "En orden alfabético.")
                    }
                }
            }

            Section {
                CoreExtrasNotaDeAlcance(
                    texto: "Consulta. Entradas, salidas y traspasos de inventario se hacen desde la computadora."
                )
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Almacén")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $busqueda, prompt: "Buscar por producto, SKU o almacén")
        .refreshable { await cargar() }
        .overlay {
            if let error = estado.error, !estado.hayDatos {
                CoreExtrasError(mensaje: error) { Task { await cargar() } }
            }
        }
        .task { if !estado.hayDatos { await cargar() } }
    }

    @ViewBuilder
    private func vacio(total: Int) -> some View {
        if !busqueda.isEmpty {
            Text("Ningún producto coincide con «\(busqueda)».").foregroundStyle(.secondary)
        } else if vista == .bajoMinimo && total > 0 {
            Text("Ningún producto con punto de reorden está por acabarse.")
                .foregroundStyle(.secondary)
        } else {
            Text("Todavía no hay productos con existencia en los almacenes de esta empresa.")
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func fila(_ nivel: StockNivel) -> some View {
        let semaforo: CoreExtrasSemaforo = nivel.agotado ? .rojo : (nivel.bajoMinimo ? .amarillo : .verde)
        let estadoTexto = nivel.agotado ? "Agotado" : (nivel.bajoMinimo ? "Bajo mínimo" : "Con existencia")
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(nivel.titulo).font(.body.weight(.medium))
                    Text(nivel.ubicacionTexto).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(CoreExtrasFormato.numero(nivel.cantidad))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(semaforo.color)
                    Text("en existencia").font(.caption2).foregroundStyle(.secondary)
                }
            }
            CoreExtrasBarra(
                valor: nivel.progreso,
                etiqueta: nivel.detalleTexto,
                color: semaforo.color
            )
            CoreExtrasSemaforoBadge(semaforo: semaforo, texto: estadoTexto)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
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
