import SwiftUI

/// El escáner de Almacén y el de Herramientas son el mismo (Adam, 07-10: «las que se
/// escanean son las de almacén»): cualquiera de los dos resuelve una etiqueta de
/// herramienta o un código de artículo (`EscaneoReglas.resolver` decide qué se busca
/// primero) y pinta lo encontrado con las tarjetas de siempre:
/// - herramienta → `HerramientaEscaneadaVista` + `AccionDeHerramienta` (entregar/recibir);
/// - artículo → `ProductoEscaneadoVista` + `MovimientoPorCodigoVista` (entrada/salida);
/// - no existe → `AltaPorCodigoVista` si se puede dar de alta; si no, «No es una
///   herramienta registrada.» con el código debajo.
///
/// Quien no puede abrir Almacén (`CoreNavigation.canOpenExtra`) solo busca herramientas,
/// como antes. `enAlmacen` solo cambia textos: el título y cómo se explica un 403.
/// Una tarjeta blanca (`MoreTarjeta`). Espejo de `EscanerUnificado.kt` en Android.
struct EscanerDeCodigos: View {
    let enAlmacen: Bool
    let onMovimiento: () -> Void

    @ObservedObject private var session = SessionStore.shared
    @State private var buscando = false
    @State private var error: String?
    @State private var aviso: String?
    @State private var resultado: ResultadoEscaneo?
    @State private var almacenes: [StockAlmacenRef]?

    /// En Almacén, por estar ahí (el shell solo la abre así); en Herramientas, si su rol
    /// también abre Almacén. Se relee con la sesión: el menú se actualiza solo.
    private var puedeAbrirAlmacen: Bool {
        enAlmacen || CoreNavigation.canOpenExtra(session.currentUser, .almacen)
    }

    private var titulo: String {
        EscaneoReglas.tituloEscaner(enAlmacen: enAlmacen, puedeAbrirAlmacen: puedeAbrirAlmacen)
    }

    /// Code 128 va en los dos; con Almacén se suman EAN/UPC de los artículos. En
    /// Herramientas la muestra de la demostración sigue siendo una herramienta.
    private var formatos: FormatosDeEscaneo {
        if enAlmacen { return .producto }
        return puedeAbrirAlmacen ? .herramientaOProducto : .etiquetaHerramienta
    }

    var body: some View {
        MoreTarjeta {
            Text(titulo)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .accessibilityAddTraits(.isHeader)
            Text(EscaneoReglas.subtituloEscaner(enAlmacen: enAlmacen, puedeAbrirAlmacen: puedeAbrirAlmacen))
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)

            EscanearOEscribirCodigo(
                titulo: titulo,
                formatos: formatos,
                buscando: buscando,
                etiquetaCampo: EscaneoReglas.etiquetaCampoEscaner(puedeAbrirAlmacen: puedeAbrirAlmacen),
                mayusculas: !enAlmacen
            ) { valor in
                Task { await buscar(valor) }
            }

            if let error {
                Text(error)
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let aviso {
                Text(aviso)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.success)
                    .fixedSize(horizontal: false, vertical: true)
            }

            resultadoVista
        }
    }

    @ViewBuilder
    private var resultadoVista: some View {
        switch resultado {
        case .herramienta(let r):
            HerrDivisor()
            HerramientaEscaneadaVista(r: r)
            if let accion = EscaneoReglas.accion(r), let prestamoId = r.prestamo?.id {
                AccionDeHerramienta(r: r, accion: accion, prestamoId: prestamoId) { mensaje in
                    onMovimiento()
                    Task { await buscar(r.codigo ?? "", avisoPrevio: mensaje) }
                }
                .id(prestamoId)
            }
            Button("Escanear otra") { reiniciar() }
                .buttonStyle(HerrBotonTextoStyle())
        case .articulo(let r):
            HerrDivisor()
            ProductoEscaneadoVista(r: r)
            MovimientoPorCodigoVista(r: r, almacenes: almacenes) { mensaje in
                onMovimiento()
                Task { await buscar(r.codigoBarras ?? r.product?.sku ?? "", avisoPrevio: mensaje) }
            }
            // Android `remember(r.codigoBarras)`: otro código empieza el formulario de cero.
            .id(r.codigoBarras ?? r.product?.sku ?? "")
            Button("Escanear otro") { reiniciar() }
                .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
        case .noEncontrado(let codigo, let puedeDarDeAlta):
            HerrDivisor()
            if puedeDarDeAlta {
                AltaPorCodigoVista(
                    codigo: codigo,
                    onCreado: { Task { await buscar(codigo, avisoPrevio: "Producto dado de alta.") } },
                    onCancelar: { resultado = nil }
                )
                .id(codigo)
            } else {
                Text(EscaneoReglas.noEsHerramienta)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Código «\(codigo)»")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                Button("Escanear otra") { reiniciar() }
                    .buttonStyle(HerrBotonTextoStyle())
            }
        case nil:
            EmptyView()
        }
    }

    private func reiniciar() {
        resultado = nil
        aviso = nil
        error = nil
    }

    @MainActor
    private func buscar(_ valor: String, avisoPrevio: String? = nil) async {
        let puedeAlmacen = puedeAbrirAlmacen
        if let motivo = EscaneoReglas.motivoInvalido(valor, puedeAbrirAlmacen: puedeAlmacen) {
            error = motivo
            return
        }
        buscando = true
        error = nil
        aviso = avisoPrevio
        defer { buscando = false }
        do {
            let nuevo = try await EscaneoRepository.shared.resolver(valor, puedeAbrirAlmacen: puedeAlmacen)
            resultado = nuevo
            if case .articulo = nuevo, almacenes == nil {
                almacenes = (try? await EscaneoRepository.shared.almacenes()) ?? []
            }
        } catch {
            resultado = nil
            self.error = EscaneoReglas.mensaje(
                error,
                accion: enAlmacen ? "consultar el almacén" : "consultar herramientas",
                fallback: "No se pudo buscar el código"
            )
        }
    }
}
