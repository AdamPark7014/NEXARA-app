import SwiftUI

/// Escáner de Almacén: lee EAN-13/EAN-8/UPC-A/UPC-E/Code 128 con la cámara (o se teclea),
/// enseña el producto con sus existencias y deja registrar una entrada o una salida. Si el
/// código no existe, ofrece darlo de alta con los datos del catálogo internacional ya
/// puestos. Espejo de `AlmacenEscaneo.kt` en Android. Pinta secciones: va dentro de la
/// `List` de `AlmacenView`.
struct EscanerDeAlmacen: View {
    let onMovimiento: () -> Void

    private enum Estado: Equatable {
        case encontrado(ProductoPorCodigo)
        case noExiste(String)
    }

    @State private var buscando = false
    @State private var error: String?
    @State private var aviso: String?
    @State private var estado: Estado?
    @State private var almacenes: [StockAlmacenRef]?

    var body: some View {
        Section {
            EscanearOEscribirCodigo(
                titulo: "Escanear producto",
                formatos: .producto,
                buscando: buscando
            ) { valor in
                Task { await buscar(valor) }
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(CorePalette.red)
            }
            if let aviso {
                NxIconText(systemName: "checkmark.circle.fill", text: aviso, tint: CorePalette.green)
                    .font(.footnote.weight(.semibold))
            }
        } header: {
            Text("Escanear producto")
        } footer: {
            if estado == nil {
                Text("Lee el código de barras o escríbelo para ver existencias y registrar entradas o salidas.")
            }
        }

        switch estado {
        case .encontrado(let r):
            productoSection(r)
            MovimientoPorCodigoSection(r: r, almacenes: almacenes) { mensaje in
                onMovimiento()
                Task { await buscar(r.codigoBarras ?? r.product?.sku ?? "", avisoPrevio: mensaje) }
            }
            .id(r.codigoBarras ?? r.product?.sku ?? "")
            Section {
                Button("Escanear otro") { limpiar() }
            }
        case .noExiste(let codigo):
            AltaPorCodigoSection(
                codigo: codigo,
                onCreado: { Task { await buscar(codigo, avisoPrevio: "Producto dado de alta.") } },
                onCancelar: { limpiar() }
            )
            .id(codigo)
        case nil:
            EmptyView()
        }
    }

    private func limpiar() {
        estado = nil
        aviso = nil
        error = nil
    }

    @ViewBuilder
    private func productoSection(_ r: ProductoPorCodigo) -> some View {
        let existencias = r.existencias ?? []
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(r.product?.nombre ?? "Producto").font(.headline)
                let tipo = CodigoBarras.clasificar(r.codigoBarras).tipo.etiqueta
                let partes = [
                    r.product?.sku?.nilSiVacio.map { "Clave \($0)" },
                    r.codigoBarras?.nilSiVacio.map { "\(tipo) \($0)" },
                ].compactMap { $0 }
                if !partes.isEmpty {
                    Text(partes.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                }
                if r.esCaja {
                    Text("Leíste una caja: las cantidades cuentan \(EscaneoReglas.unidad(r)).")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 2)
            LabeledContent("Existencia total") {
                Text(CoreExtrasFormato.numero(EscaneoReglas.totalExistencia(existencias)))
                    .font(.body.weight(.semibold))
            }
            if existencias.isEmpty {
                Text("Sin existencia en ningún almacén.").foregroundStyle(.secondary)
            }
            ForEach(Array(existencias.enumerated()), id: \.offset) { _, e in
                LabeledContent(e.almacen?.nilSiVacio ?? "Almacén") {
                    let apartado = (e.reservado ?? 0) > 0
                        ? " (\(CoreExtrasFormato.numero(e.reservado)) apartado)"
                        : ""
                    Text("\(CoreExtrasFormato.numero(e.cantidad))\(apartado)")
                }
            }
        } header: {
            Text("Producto")
        }
    }

    @MainActor
    private func buscar(_ valor: String, avisoPrevio: String? = nil) async {
        if let motivo = CodigoBarras.motivoInvalido(valor) {
            error = motivo
            return
        }
        let codigo = CodigoBarras.limpiar(valor)
        buscando = true
        error = nil
        aviso = avisoPrevio
        defer { buscando = false }
        do {
            estado = .encontrado(try await EscaneoRepository.shared.productoPorCodigo(codigo))
            if almacenes == nil {
                almacenes = (try? await EscaneoRepository.shared.almacenes()) ?? []
            }
        } catch {
            if EscaneoReglas.codigoHttp(error) == 404 {
                estado = .noExiste(codigo)
            } else {
                estado = nil
                self.error = EscaneoReglas.mensaje(
                    error, accion: "consultar el almacén", fallback: "No se pudo buscar el código"
                )
            }
        }
    }
}

// MARK: - Movimiento

private struct MovimientoPorCodigoSection: View {
    let r: ProductoPorCodigo
    let almacenes: [StockAlmacenRef]?
    let onHecho: (String) -> Void

    @State private var movimiento: EscaneoReglas.Movimiento = .entrada
    @State private var almacenId: Int?
    @State private var cantidadTexto = ""
    @State private var notas = ""
    @State private var guardando = false
    @State private var error: String?

    private var opciones: [EscaneoReglas.OpcionAlmacen] {
        EscaneoReglas.almacenesPara(movimiento, existencias: r.existencias, almacenes: almacenes)
    }

    /// Lo elegido deja de valer si cambia el tipo de movimiento; con una sola opción no hay que elegir.
    private var elegido: Int? {
        if let almacenId, opciones.contains(where: { $0.id == almacenId }) { return almacenId }
        return opciones.count == 1 ? opciones.first?.id : nil
    }

    private var unidad: String { EscaneoReglas.unidad(r) }

    var body: some View {
        Section {
            Picker("Movimiento", selection: $movimiento) {
                ForEach(EscaneoReglas.Movimiento.allCases) { Text($0.etiqueta).tag($0) }
            }
            .pickerStyle(.segmented)
            .onChange(of: movimiento) { _, _ in error = nil }

            if opciones.isEmpty {
                Text(movimiento == .salida
                     ? "No hay existencia de este producto en ningún almacén."
                     : "No se pudieron leer los almacenes de la empresa.")
                    .foregroundStyle(.secondary)
            }
            ForEach(opciones) { opcion in
                Button {
                    almacenId = opcion.id
                } label: {
                    HStack {
                        Text(opcion.nombre).foregroundStyle(Color.primary)
                        Spacer()
                        if elegido == opcion.id {
                            Image(systemName: "checkmark").foregroundStyle(NxBrand.primary)
                        }
                    }
                }
                .accessibilityAddTraits(elegido == opcion.id ? .isSelected : [])
            }

            TextField("Cantidad (\(unidad))", text: $cantidadTexto)
                .keyboardType(.decimalPad)
            TextField("Nota (opcional)", text: $notas, axis: .vertical)
                .lineLimit(1...3)

            if let error {
                Text(error).font(.footnote).foregroundStyle(CorePalette.red)
            }
            Button {
                Task { await registrar() }
            } label: {
                Text(guardando ? "Registrando…" : "Registrar \(movimiento.etiqueta.lowercased())")
            }
            .buttonStyle(NxPrimaryButtonStyle())
            .disabled(guardando)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        } header: {
            Text("Registrar movimiento")
        } footer: {
            Text(movimiento == .salida ? "¿De qué almacén sale?" : "¿A qué almacén entra?")
        }
    }

    @MainActor
    private func registrar() async {
        let cantidadLeida = CodigoBarras.parseCantidad(cantidadTexto)
        let almacenElegido = elegido
        let disponible = r.existencias?.first(where: { $0.warehouseId == almacenElegido })?.disponible
        // En cajas no se compara: la existencia está en piezas.
        if let invalido = EscaneoReglas.errorMovimiento(
            cantidad: cantidadLeida,
            almacenId: almacenElegido,
            disponibleEnOrigen: r.esCaja ? nil : disponible,
            movimiento: movimiento
        ) {
            error = invalido
            return
        }
        guard let cantidad = cantidadLeida, let destino = almacenElegido else { return }
        guardando = true
        error = nil
        defer { guardando = false }
        let nota = notas.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await EscaneoRepository.shared.movimientoPorCodigo(MovimientoPorCodigoBody(
                codigo: r.codigoBarras ?? r.product?.sku ?? "",
                type: movimiento.api,
                quantity: cantidad,
                fromWarehouseId: movimiento == .salida ? destino : nil,
                toWarehouseId: movimiento == .entrada ? destino : nil,
                notes: nota.isEmpty ? nil : nota
            ))
            onHecho(EscaneoReglas.avisoMovimiento(movimiento, cantidad: cantidad, unidad: unidad, producto: r.product?.name))
        } catch {
            self.error = EscaneoReglas.mensaje(
                error, accion: "registrar movimientos de almacén", fallback: "No se pudo registrar el movimiento"
            )
        }
    }
}

// MARK: - Alta

private struct AltaPorCodigoSection: View {
    let codigo: String
    let onCreado: () -> Void
    let onCancelar: () -> Void

    @State private var abierto = false
    @State private var consultando = false
    @State private var fuente: String?
    @State private var nombre = ""
    @State private var sku = ""
    @State private var marca = ""
    @State private var modelo = ""
    @State private var unidad = ""
    @State private var descripcion = ""
    @State private var imagenUrl: String?
    @State private var categoria: String?
    @State private var guardando = false
    @State private var error: String?

    var body: some View {
        Section {
            Text("No hay producto con el código «\(codigo)».").font(.body.weight(.semibold))
            if !abierto {
                Button {
                    abrir()
                } label: {
                    Text("Dar de alta")
                }
                .buttonStyle(NxPrimaryButtonStyle())
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                Button("Cancelar", role: .cancel, action: onCancelar)
            } else {
                if consultando {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Buscando datos del código…").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                if let fuente {
                    Text(fuente).font(.footnote).foregroundStyle(.secondary)
                }
                TextField("Nombre del producto *", text: $nombre, axis: .vertical)
                    .lineLimit(1...3)
                TextField("Clave / SKU (opcional, se genera sola)", text: $sku)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                TextField("Marca", text: $marca)
                TextField("Modelo", text: $modelo)
                TextField("Unidad (pieza, metro, caja…)", text: $unidad)
                    .textInputAutocapitalization(.never)
                if let error {
                    Text(error).font(.footnote).foregroundStyle(CorePalette.red)
                }
                Button {
                    Task { await crear() }
                } label: {
                    Text(guardando ? "Guardando…" : "Crear producto")
                }
                .buttonStyle(NxPrimaryButtonStyle())
                .disabled(guardando)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                Button("Cancelar", role: .cancel, action: onCancelar)
                    .disabled(guardando)
            }
        } header: {
            Text("Producto nuevo")
        } footer: {
            if !abierto {
                Text("Si es un producto nuevo, puedes darlo de alta con este código.")
            }
        }
    }

    private func abrir() {
        abierto = true
        guard CodigoBarras.esConsultableInternacional(codigo) else { return }
        Task { await consultarCatalogo() }
    }

    @MainActor
    private func consultarCatalogo() async {
        consultando = true
        defer { consultando = false }
        do {
            let r = try await EscaneoRepository.shared.consultaUpc(codigo)
            if r.encontrado == true, let p = r.producto {
                if nombre.isEmpty { nombre = p.nombre ?? "" }
                if marca.isEmpty { marca = p.marca ?? "" }
                if modelo.isEmpty { modelo = p.modelo ?? "" }
                if descripcion.isEmpty { descripcion = p.descripcion ?? "" }
                imagenUrl = p.imagenUrl
                categoria = p.categoria
                fuente = "Datos sugeridos del catálogo internacional. Revísalos antes de guardar."
            } else {
                fuente = r.mensaje?.nilSiVacio
                    ?? "El catálogo internacional no conoce este código: escribe los datos."
            }
        } catch {
            // Sin catálogo se captura a mano; un 403 aquí anticipa el del alta.
            fuente = EscaneoReglas.codigoHttp(error) == 403
                ? EscaneoReglas.textoSinPermiso("dar de alta productos", servidor: EscaneoReglas.mensajeServidor(error))
                : "No se pudo consultar el catálogo internacional: escribe los datos."
        }
    }

    @MainActor
    private func crear() async {
        guard let nombreLimpio = nombre.nilSiVacio else {
            error = "Escribe el nombre del producto"
            return
        }
        guardando = true
        error = nil
        defer { guardando = false }
        do {
            try await EscaneoRepository.shared.altaPorCodigo(AltaPorCodigoBody(
                codigo: codigo,
                name: nombreLimpio,
                sku: sku.nilSiVacio,
                marca: marca.nilSiVacio,
                modelo: modelo.nilSiVacio,
                descripcion: descripcion.nilSiVacio,
                imagenUrl: imagenUrl,
                categoria: categoria,
                unidad: unidad.nilSiVacio
            ))
            onCreado()
        } catch {
            self.error = EscaneoReglas.mensaje(
                error, accion: "dar de alta productos", fallback: "No se pudo dar de alta el producto"
            )
        }
    }
}
