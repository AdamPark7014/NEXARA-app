import SwiftUI

/// Herramientas (`/erp/almacen/herramientas`) en iPhone — paridad con
/// `HerramientasScreen.kt` de Android.
///
/// La web enseña hasta siete pestañas porque mete en la misma página a quien pide y
/// a quien administra. En el teléfono solo está quien pide: el guard del API deja
/// pasar con `tools.view` lo **propio** —mi kit, mis préstamos— y la única mutación
/// que permite es pedir más plazo. Así que la pantalla es el escáner de etiquetas,
/// dos listas y un botón, que es exactamente lo que se puede hacer desde la calle.
///
/// Abre en «Mi kit» a propósito: es lo que la persona trae encima y de lo que
/// responde. Los préstamos son la excepción, no la regla.
///
/// Error y vacío nunca salen juntos: mientras la primera carga esté fallando se ve el
/// bloque de error y nada más, porque un «no tienes herramientas» sobre una lista que
/// no se pudo leer es mentira. Las cuentas viven en `HerramientasReglas`.
///
/// El título de la barra («Herramientas») lo pone quien abre la pantalla (el hub
/// «Más» o el shell), con `.nxBrandNavBar`.
struct HerramientasView: View {
    @StateObject private var vm = HerramientasViewModel()

    /// Préstamo al que se le está pidiendo prórroga; `nil` = sin diálogo abierto.
    @State private var renovando: PrestamoHerramienta?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NxSpacing.listGap) {
                EscanerDeHerramientas(onMovimiento: { Task { await vm.refrescar() } })

                pastillasDeVista

                if let aviso = vm.estado.avisoRefresco {
                    MoreAvisoDesactualizado(mensaje: aviso, onCerrar: { vm.descartarAviso() })
                }

                if vm.estado.cargando && !vm.estado.cargado {
                    NxSkeletonList(itemCount: 5, itemHeight: 104)
                }

                if vm.soloError {
                    NxErrorBlock(message: vm.estado.error, onRetry: { Task { await vm.reintentar() } })
                } else if vm.estado.cargado {
                    // Media pantalla caída (normalmente un 403 en la mitad que el rol no
                    // tiene): se dice arriba, pero no tapa lo que sí llegó.
                    if let parcial = vm.estado.avisoParcial {
                        NxAlertBanner(
                            alert: NxAlert(
                                id: "herramientas-parcial",
                                title: parcial,
                                subtitle: "Lo demás de esta pantalla sí se pudo leer.",
                                tone: .warning
                            ),
                            actionLabel: "Reintentar",
                            onAction: { Task { await vm.refrescar() } }
                        )
                    }

                    switch vm.vista {
                    case .kit:
                        seccionKit
                    case .prestamos:
                        seccionPrestamos
                    }
                }

                MoreNotaDeAlcance(texto: HerramientasReglas.limite)
            }
            .padding(NxSpacing.screenH)
        }
        .refreshable { await vm.refrescar() }
        .nxScreenBackground()
        .overlay(alignment: .bottom) {
            // Aviso pasajero al pie (Android `NxSnackbarHost`).
            ZStack {
                if let mensaje = vm.mensaje {
                    HerrSnackbar(texto: mensaje, onCerrar: { vm.cerrarMensaje() })
                        .padding(.horizontal, NxSpacing.screenH)
                        .padding(.bottom, NxSpacing.l)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.2), value: vm.mensaje)
        }
        .fullScreenCover(item: $renovando) { prestamo in
            DialogoRenovarContenedor(vm: vm, prestamo: prestamo, onCerrar: { cerrarDialogo() })
                .presentationBackground(.clear)
        }
        .task { await vm.arrancar() }
    }

    // MARK: Pastillas «Mi kit · N» | «Mis préstamos · N»

    private var pastillasDeVista: some View {
        let cargado = vm.estado.cargado
        let pastillas = HerramientasReglas.Vista.allCases.map { opcion -> HerrPastilla in
            let conteo: Int?
            switch opcion {
            case .kit:
                conteo = cargado ? HerramientasReglas.kitActivo(vm.estado.kit).count : nil
            case .prestamos:
                conteo = cargado ? vm.estado.prestamos.filter { HerramientasReglas.estaAbierto($0) }.count : nil
            }
            return HerrPastilla(
                id: opcion.etiqueta,
                etiqueta: opcion.etiqueta,
                conteo: conteo,
                seleccionada: opcion == vm.vista,
                onClick: { vm.cambiarVista(opcion) }
            )
        }
        return HerrFilaDePastillas(pastillas: pastillas)
    }

    // MARK: «Mi kit»

    /// Lo que traigo asignado. El vacío no es un fallo —la mayoría del personal
    /// administrativo no tiene kit—, así que se ofrece la otra mitad de la pantalla.
    @ViewBuilder
    private var seccionKit: some View {
        let kit = vm.kitVisible
        if let resumen = HerramientasReglas.resumenKit(vm.estado.kit, hoy: vm.hoy) {
            MoreTarjeta {
                Text("Tu kit necesita atención")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                Text(resumen)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Repórtalo en almacén: el dictamen de un daño no se hace desde el teléfono.")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }

        if kit.isEmpty {
            let titulo = "No traes herramienta asignada"
            let texto = "Tu kit está vacío: nadie te ha asignado una herramienta de forma "
                + "permanente. Almacén es quien las reparte."
            if vm.estado.prestamos.isEmpty {
                NxEmptyState(title: titulo, subtitle: texto)
            } else {
                NxEmptyState(
                    title: titulo,
                    subtitle: texto,
                    actionLabel: "Ver mis préstamos",
                    onAction: { vm.cambiarVista(.prestamos) }
                )
            }
        } else {
            MoreCabecera(titulo: "Mi kit", subtitulo: "Primero lo que reclama atención", trailing: "\(kit.count)")
            ForEach(kit) { asignacion in
                TarjetaKit(asignacion: asignacion, hoy: vm.hoy)
            }
        }
    }

    // MARK: «Mis préstamos»

    /// Lo que pedí y todavía debo. Abre en «Abiertos» porque la pregunta de campo es
    /// «¿qué tengo que devolver?»; el historial completo está a una pastilla.
    @ViewBuilder
    private var seccionPrestamos: some View {
        let prestamos = vm.prestamosVisibles
        let total = vm.estado.prestamos.count
        let consulta = vm.consulta

        if let resumen = HerramientasReglas.resumenPrestamos(vm.estado.prestamos, hoy: vm.hoy) {
            MoreTarjeta {
                Text("Tienes prestado")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                Text(resumen)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
            }
        }

        HerrFilaDePastillas(pastillas: HerramientasReglas.FiltroPrestamo.allCases.map { opcion in
            HerrPastilla(
                id: opcion.etiqueta,
                etiqueta: opcion.etiqueta,
                seleccionada: opcion == vm.filtro,
                onClick: { vm.cambiarFiltro(opcion) }
            )
        })

        // El buscador solo cuando hay lista que valga la pena filtrar: con tres
        // renglones estorba más de lo que ayuda.
        if total > 6 {
            NxSearchField(text: $vm.consulta, placeholder: "Buscar por herramienta, modelo o serie")
        }

        if prestamos.isEmpty {
            if !consulta.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                NxEmptyState(
                    title: "Sin coincidencias",
                    subtitle: "Ninguna herramienta tuya coincide con «\(consulta)».",
                    actionLabel: "Limpiar búsqueda",
                    onAction: { vm.consulta = "" }
                )
            } else if vm.filtro == .abiertos && total > 0 {
                NxEmptyState(
                    title: "No debes ninguna",
                    subtitle: "No tienes préstamos abiertos: todo lo que pediste ya se cerró.",
                    actionLabel: "Ver el historial",
                    onAction: { vm.cambiarFiltro(.todos) }
                )
            } else {
                NxEmptyState(
                    title: "Todavía no pides herramienta prestada",
                    subtitle: "Los préstamos se dan de alta en almacén. Cuando te presten algo, "
                        + "aparecerá aquí con su fecha de devolución y su código para recogerlo."
                )
            }
        } else {
            MoreCabecera(
                titulo: vm.filtro.etiqueta,
                subtitulo: "Primero lo vencido y lo que vence antes",
                trailing: "\(prestamos.count)"
            )
            ForEach(prestamos) { prestamo in
                TarjetaPrestamo(
                    prestamo: prestamo,
                    hoy: vm.hoy,
                    ahora: vm.ahora,
                    onRenovar: { abrirDialogo(prestamo) }
                )
            }
        }
    }

    // MARK: Diálogo

    /// Sin la animación de hoja: el diálogo aparece en su sitio, como el de Android.
    private func abrirDialogo(_ prestamo: PrestamoHerramienta) {
        vm.limpiarAccionError()
        var transaccion = Transaction()
        transaccion.disablesAnimations = true
        withTransaction(transaccion) { renovando = prestamo }
    }

    private func cerrarDialogo() {
        var transaccion = Transaction()
        transaccion.disablesAnimations = true
        withTransaction(transaccion) { renovando = nil }
        vm.limpiarAccionError()
    }
}

/// Une el diálogo con el estado vivo del VM (enviando, error) mientras está abierto.
private struct DialogoRenovarContenedor: View {
    @ObservedObject var vm: HerramientasViewModel
    let prestamo: PrestamoHerramienta
    let onCerrar: () -> Void

    var body: some View {
        DialogoRenovar(
            prestamo: prestamo,
            hoy: vm.hoy,
            enviando: vm.estado.enviando,
            error: vm.estado.accionError,
            onCerrar: { if !vm.estado.enviando { onCerrar() } },
            onConfirmar: { fecha, motivo in
                Task {
                    if await vm.renovar(prestamo, fecha: fecha, motivo: motivo) { onCerrar() }
                }
            }
        )
        .id(prestamo.id)
    }
}
