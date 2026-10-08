import SwiftUI

/// Escáner de la pantalla de Almacén. Desde el 07-10 es el escáner único
/// (`EscanerDeCodigos`, «Escanear artículo o herramienta»): lee EAN-13/EAN-8/UPC-A/UPC-E/
/// Code 128 con la cámara (o se teclea). Un artículo enseña sus existencias por almacén y
/// deja registrar una entrada o una salida; si el código no existe, ofrece darlo de alta
/// con los datos del catálogo internacional ya puestos. Una etiqueta de herramienta
/// enseña la herramienta y deja entregarla o recibirla.
///
/// Espejo de `AlmacenEscaneo.kt` en Android. Va como primera fila de la lista de
/// `AlmacenView`. Aquí siguen las piezas del artículo (producto, movimiento y alta).
struct EscanerDeAlmacen: View {
    let onMovimiento: () -> Void

    var body: some View {
        EscanerDeCodigos(enAlmacen: true, onMovimiento: onMovimiento)
    }
}

// MARK: - Piezas de Material 3

/// `HorizontalDivider` de Material 3: 1 de alto en `outlineVariant` (#E2E8F0).
private struct DivisorDeEscaner: View {
    var body: some View {
        Rectangle()
            .fill(NxColors.border)
            .frame(maxWidth: .infinity)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

/// Error de un paso del escáner: 14 normal en rojo.
private struct TextoDeError: View {
    let texto: String

    var body: some View {
        Text(texto)
            .font(NxType.bodyMedium)
            .foregroundStyle(NxColors.danger)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// `RadioButton` de Material 3: círculo de 20 con filo de 2 (marca elegido, gris si no)
/// y punto de 10, en un área de toque de 48.
private struct RadioMaterial: View {
    let seleccionado: Bool

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(seleccionado ? NxColors.brand : NxColors.muted, lineWidth: 2)
                .frame(width: 20, height: 20)
            if seleccionado {
                Circle()
                    .fill(NxColors.brand)
                    .frame(width: 10, height: 10)
            }
        }
        .frame(width: 48, height: 48)
        .accessibilityHidden(true)
    }
}

/// `Button` lleno de marca con letra Bold (los botones de acción de Android).
@MainActor
private func botonLleno(alto: CGFloat, llenaAncho: Bool = false) -> BotonMaterialStyle {
    BotonMaterialStyle(
        tipo: .lleno(NxColors.brand),
        alto: alto,
        llenaAncho: llenaAncho,
        fuente: .system(size: 14, weight: .bold)
    )
}

// MARK: - Producto

/// Android `ProductoEscaneado`: nombre, clave y tipo de código, aviso de caja, la
/// existencia total y un renglón por almacén con lo apartado.
struct ProductoEscaneadoVista: View {
    let r: ProductoPorCodigo

    private var detalle: String {
        let tipo = CodigoBarras.clasificar(r.codigoBarras).tipo.etiqueta
        return [
            r.product?.sku?.nilSiVacio.map { "Clave \($0)" },
            r.codigoBarras.map { "\(tipo) \($0)" },
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    var body: some View {
        let existencias = r.existencias ?? []
        VStack(alignment: .leading, spacing: 8) {
            Text(r.product?.name?.nilSiVacio ?? "Producto")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
            if !detalle.isEmpty {
                Text(detalle)
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
            }
            if r.esCaja {
                Text("Leíste una caja: las cantidades cuentan \(EscaneoReglas.unidad(r)).")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("Existencia total: \(CoreExtrasFormato.numero(EscaneoReglas.totalExistencia(existencias)))")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            if existencias.isEmpty {
                Text("Sin existencia en ningún almacén.")
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.muted)
            }
            ForEach(Array(existencias.enumerated()), id: \.offset) { _, e in
                HStack(alignment: .top, spacing: 8) {
                    Text(e.almacen?.nilSiVacio ?? "Almacén")
                        .font(NxType.bodyMedium)
                        .foregroundStyle(NxColors.fg)
                    Spacer(minLength: 8)
                    Text(cantidadTexto(e))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .multilineTextAlignment(.trailing)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// «14 (4 apartado)» o solo «14».
    private func cantidadTexto(_ e: ExistenciaCodigo) -> String {
        let cantidad = CoreExtrasFormato.numero(e.cantidad)
        guard let reservado = e.reservado, reservado > 0 else { return cantidad }
        return "\(cantidad) (\(CoreExtrasFormato.numero(reservado)) apartado)"
    }
}

// MARK: - Movimiento

/// Android `MovimientoPorCodigo`: entrada o salida, el almacén (en salida solo donde hay
/// existencia), la cantidad en la unidad de lo escaneado y una nota opcional.
struct MovimientoPorCodigoVista: View {
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
        let lista = opciones
        if let almacenId, lista.contains(where: { $0.id == almacenId }) { return almacenId }
        return lista.count == 1 ? lista.first?.id : nil
    }

    private var unidad: String { EscaneoReglas.unidad(r) }

    var body: some View {
        let lista = opciones
        let seleccion = elegido
        VStack(alignment: .leading, spacing: 8) {
            DivisorDeEscaner()
            Text("Registrar movimiento")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .accessibilityAddTraits(.isHeader)

            HStack(alignment: .center, spacing: 8) {
                ForEach(EscaneoReglas.Movimiento.allCases) { opcion in
                    if opcion == movimiento {
                        Button(opcion.etiqueta) {}
                            .buttonStyle(botonLleno(alto: 48, llenaAncho: true))
                            .accessibilityAddTraits(AccessibilityTraits.isSelected)
                    } else {
                        Button(opcion.etiqueta) {
                            movimiento = opcion
                            error = nil
                        }
                        .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: 48, llenaAncho: true))
                    }
                }
            }

            Text(movimiento == .salida ? "¿De qué almacén sale?" : "¿A qué almacén entra?")
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
            if lista.isEmpty {
                Text(movimiento == .salida
                     ? "No hay existencia de este producto en ningún almacén."
                     : "No se pudieron leer los almacenes de la empresa.")
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(lista) { opcion in
                Button {
                    almacenId = opcion.id
                } label: {
                    HStack(alignment: .center, spacing: 0) {
                        RadioMaterial(seleccionado: seleccion == opcion.id)
                        Text(opcion.nombre)
                            .font(NxType.bodyMedium)
                            .foregroundStyle(NxColors.fg)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(seleccion == opcion.id ? AccessibilityTraits.isSelected : [])
            }

            CampoDelineadoDeEscaneo(
                etiqueta: "Cantidad (\(unidad))",
                texto: $cantidadTexto,
                maxLargo: 12,
                teclado: .decimalPad
            )
            CampoDelineadoDeEscaneo(
                etiqueta: "Nota (opcional)",
                texto: $notas,
                maxLargo: 300,
                mayusculas: .sentences,
                autocorreccion: true,
                multilinea: true
            )

            if let error {
                TextoDeError(texto: error)
            }
            Button(guardando ? "Registrando…" : "Registrar \(movimiento.etiqueta.lowercased())") {
                Task { await registrar() }
            }
            .buttonStyle(botonLleno(alto: 52, llenaAncho: true))
            .disabled(guardando)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @MainActor
    private func registrar() async {
        let cantidadLeida = CodigoBarras.parseCantidad(cantidadTexto)
        let almacenElegido = elegido
        let disponible = r.existencias?.first(where: { $0.warehouseId == almacenElegido })?.disponible
        if let invalido = EscaneoReglas.errorMovimiento(
            cantidad: cantidadLeida,
            almacenId: almacenElegido,
            // En cajas no se compara: la existencia está en piezas.
            disponibleEnOrigen: r.esCaja ? nil : disponible,
            movimiento: movimiento
        ) {
            error = invalido
            return
        }
        guard let cantidad = cantidadLeida, let almacen = almacenElegido else { return }
        guardando = true
        error = nil
        defer { guardando = false }
        let nota = notas.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await EscaneoRepository.shared.movimientoPorCodigo(MovimientoPorCodigoBody(
                codigo: r.codigoBarras ?? r.product?.sku ?? "",
                type: movimiento.api,
                quantity: cantidad,
                fromWarehouseId: movimiento == .salida ? almacen : nil,
                toWarehouseId: movimiento == .entrada ? almacen : nil,
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

/// Android `AltaPorCodigo`: el código no existe; «Dar de alta» abre el formulario con lo
/// que sepa el catálogo internacional (solo UPC/EAN de 12 a 14 dígitos).
struct AltaPorCodigoVista: View {
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
        VStack(alignment: .leading, spacing: 8) {
            Text("No hay producto con el código «\(codigo)».")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
            if !abierto {
                Text("Si es un producto nuevo, puedes darlo de alta con este código.")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(alignment: .top, spacing: 8) {
                    Button("Dar de alta") { abrir() }
                        .buttonStyle(botonLleno(alto: 48))
                    Button("Cancelar", action: onCancelar)
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                }
            } else {
                formulario
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var formulario: some View {
        if consultando {
            Text("Buscando datos del código…")
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
        }
        if let fuente {
            Text(fuente)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        CampoDelineadoDeEscaneo(
            etiqueta: "Nombre del producto *",
            texto: $nombre,
            maxLargo: 255,
            mayusculas: .sentences,
            autocorreccion: true,
            multilinea: true
        )
        CampoDelineadoDeEscaneo(
            etiqueta: "Clave / SKU (opcional, se genera sola)",
            texto: $sku,
            maxLargo: 60,
            teclado: .asciiCapable
        )
        HStack(alignment: .top, spacing: 8) {
            CampoDelineadoDeEscaneo(etiqueta: "Marca", texto: $marca, maxLargo: 200, mayusculas: .words)
            CampoDelineadoDeEscaneo(etiqueta: "Modelo", texto: $modelo, maxLargo: 120)
        }
        CampoDelineadoDeEscaneo(etiqueta: "Unidad (pieza, metro, caja…)", texto: $unidad, maxLargo: 50)
        if let error {
            TextoDeError(texto: error)
        }
        HStack(alignment: .top, spacing: 8) {
            Button(guardando ? "Guardando…" : "Crear producto") {
                Task { await crear() }
            }
            .buttonStyle(botonLleno(alto: 52, llenaAncho: true))
            .disabled(guardando)
            Button("Cancelar", action: onCancelar)
                .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                .disabled(guardando)
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
                // Lo que la persona ya escribió no se pisa.
                if nombre.nilSiVacio == nil { nombre = p.nombre ?? "" }
                if marca.nilSiVacio == nil { marca = p.marca ?? "" }
                if modelo.nilSiVacio == nil { modelo = p.modelo ?? "" }
                if descripcion.nilSiVacio == nil { descripcion = p.descripcion ?? "" }
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
