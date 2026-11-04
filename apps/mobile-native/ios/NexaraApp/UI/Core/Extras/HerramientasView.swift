import SwiftUI

/// Herramientas (`/erp/almacen/herramientas`) en iPhone — paridad con
/// `HerramientasScreen.kt` de Android.
///
/// Cada quien ve lo suyo (Adam, 04-11-2026: «el que debe dar de alta es Iván todo en el
/// sistema, y la gente debe poder solamente solicitar préstamos»). `HerramientasReglas`
/// lo decide igual que el servidor:
/// - **Dirección**: sin escáner ni kit. Préstamos de toda la empresa e inventario con
///   quién trae cada pieza. Solo lectura.
/// - **Quien administra (Iván)**: escáner arriba, «Por aprobar», «Préstamos» (entregar y
///   recibir), «Inventario» con «Nueva herramienta», y su propio kit y préstamos.
/// - **Personal**: sin escáner. «Mi kit» con «Reportar daño», «Mis préstamos» y el botón
///   principal «Pedir préstamo».
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
    /// La hoja abierta: pedir, dar de alta, reportar, rechazar, entregar o recibir.
    @State private var hoja: HojaDeHerramientas?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NxSpacing.listGap) {
                if HerramientasReglas.muestraEscaner(vm.perfil) {
                    EscanerDeHerramientas(onMovimiento: { Task { await vm.refrescar() } })
                }

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
                    // Una parte caída (normalmente un 403 en lo que el rol no tiene): se
                    // dice arriba, pero no tapa lo que sí llegó.
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
                    case .porAprobar:
                        seccionPorAprobar
                    case .prestamosEmpresa:
                        seccionEmpresa
                    case .inventario:
                        seccionInventario
                    case .kit:
                        seccionKit
                    case .prestamos:
                        seccionPrestamos
                    }
                }

                MoreNotaDeAlcance(texto: HerramientasReglas.limite(vm.perfil))
            }
            .padding(.horizontal, NxSpacing.screenH)
            .padding(.top, NxSpacing.screenH)
            // Con botón flotante, lo último de la lista no se queda debajo de él.
            .padding(.bottom, vm.botonPrincipal == nil ? NxSpacing.screenH : 88)
        }
        .refreshable { await vm.refrescar() }
        .nxScreenBackground()
        .nxFab(
            vm.botonPrincipal?.etiqueta ?? "",
            systemImage: "plus",
            visible: vm.botonPrincipal != nil && vm.estado.cargado,
            action: { abrirBotonPrincipal() }
        )
        .overlay(alignment: .bottom) {
            // Aviso pasajero al pie (Android `NxSnackbarHost`).
            ZStack {
                if let mensaje = vm.mensaje {
                    HerrSnackbar(texto: mensaje, onCerrar: { vm.cerrarMensaje() })
                        .padding(.horizontal, NxSpacing.screenH)
                        .padding(.bottom, vm.botonPrincipal == nil ? NxSpacing.l : 80)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.2), value: vm.mensaje)
        }
        .fullScreenCover(item: $renovando) { prestamo in
            DialogoRenovarContenedor(vm: vm, prestamo: prestamo, onCerrar: { cerrarDialogo() })
                .presentationBackground(.clear)
        }
        .sheet(item: $hoja, onDismiss: { vm.limpiarAccionError() }) { cual in
            contenidoDeHoja(cual)
        }
        .task { await vm.arrancar() }
    }

    private func abrirBotonPrincipal() {
        vm.limpiarAccionError()
        switch vm.botonPrincipal {
        case .pedirPrestamo: hoja = .pedir
        case .nuevaHerramienta: hoja = .nueva
        case nil: break
        }
    }

    // MARK: Pastillas

    /// Una por pestaña de este perfil, con su cuenta cuando ya se sabe.
    private var pastillasDeVista: some View {
        let pastillas = HerramientasReglas.vistas(vm.perfil).map { opcion -> HerrPastilla in
            HerrPastilla(
                id: opcion.etiqueta,
                etiqueta: opcion.etiqueta,
                conteo: conteo(de: opcion),
                seleccionada: opcion == vm.vista,
                onClick: { vm.cambiarVista(opcion) }
            )
        }
        return HerrFilaDePastillas(pastillas: pastillas)
    }

    private func conteo(de opcion: HerramientasReglas.Vista) -> Int? {
        guard vm.estado.cargado else { return nil }
        switch opcion {
        case .porAprobar:
            return vm.pendientes.count + vm.renovacionesPendientes.count
        case .prestamosEmpresa:
            return HerramientasReglas.prestamosDeEmpresa(
                vm.estado.empresa, perfil: vm.perfil, filtro: .abiertos, hoy: vm.hoy
            ).count
        case .inventario:
            return vm.estado.inventario.count
        case .kit:
            return HerramientasReglas.kitActivo(vm.estado.kit).count
        case .prestamos:
            return vm.estado.prestamos.filter { HerramientasReglas.estaAbierto($0) }.count
        }
    }

    // MARK: «Por aprobar»

    /// Préstamos pendientes y prórrogas: lo que espera la firma de quien administra.
    @ViewBuilder
    private var seccionPorAprobar: some View {
        let pendientes = vm.pendientes
        let renovaciones = vm.renovacionesPendientes

        if pendientes.isEmpty && renovaciones.isEmpty {
            NxEmptyState(
                title: "Nada por aprobar",
                subtitle: "Cuando alguien pida una herramienta o más plazo, aparece aquí para que lo decidas."
            )
        }
        if !pendientes.isEmpty {
            MoreCabecera(
                titulo: "Préstamos por aprobar",
                subtitulo: "Primero el que lleva más tiempo esperando",
                trailing: "\(pendientes.count)"
            )
            ForEach(pendientes) { prestamo in
                TarjetaPorAprobar(
                    prestamo: prestamo,
                    enviando: vm.estado.enviando,
                    onAprobar: { Task { await vm.aprobar(prestamo) } },
                    onRechazar: { abrir(.rechazar(prestamo)) }
                )
            }
        }
        if !renovaciones.isEmpty {
            MoreCabecera(titulo: "Prórrogas por aprobar", subtitulo: "Más plazo para lo que ya se prestó", trailing: "\(renovaciones.count)")
            ForEach(renovaciones) { renovacion in
                TarjetaRenovacion(
                    renovacion: renovacion,
                    enviando: vm.estado.enviando,
                    onAprobar: { Task { await vm.aprobarRenovacion(renovacion) } },
                    onRechazar: { abrir(.rechazarRenovacion(renovacion)) }
                )
            }
        }
    }

    // MARK: «Préstamos» de toda la empresa

    @ViewBuilder
    private var seccionEmpresa: some View {
        let prestamos = vm.empresaVisibles
        let total = vm.estado.empresa.count
        let consulta = vm.consulta

        if let resumen = HerramientasReglas.resumenPrestamos(vm.estado.empresa, hoy: vm.hoy) {
            MoreTarjeta {
                Text("En toda la empresa")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                Text(resumen)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
            }
        }

        HerrFilaDePastillas(pastillas: HerramientasReglas.FiltroEmpresa.allCases.map { opcion in
            HerrPastilla(
                id: opcion.etiqueta,
                etiqueta: opcion.etiqueta,
                seleccionada: opcion == vm.filtroEmpresa,
                onClick: { vm.cambiarFiltroEmpresa(opcion) }
            )
        })

        if total > 6 {
            NxSearchField(text: $vm.consulta, placeholder: "Buscar por herramienta, serie o persona")
        }

        if prestamos.isEmpty {
            if !consulta.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                NxEmptyState(
                    title: "Sin coincidencias",
                    subtitle: "Ningún préstamo coincide con «\(consulta)».",
                    actionLabel: "Limpiar búsqueda",
                    onAction: { vm.consulta = "" }
                )
            } else if total == 0 {
                NxEmptyState(title: "Todavía no hay préstamos", subtitle: vacioEmpresa)
            } else {
                NxEmptyState(
                    title: "Nada en «\(vm.filtroEmpresa.etiqueta.lowercased())»",
                    subtitle: vm.filtroEmpresa == .vencidos
                        ? "Ningún préstamo está pasado de fecha. Al día."
                        : "Ahora mismo nadie trae una herramienta prestada.",
                    actionLabel: "Ver el historial",
                    onAction: { vm.cambiarFiltroEmpresa(.historial) }
                )
            }
        } else {
            MoreCabecera(
                titulo: vm.filtroEmpresa.etiqueta,
                subtitulo: "Primero lo vencido y lo que vence antes",
                trailing: "\(prestamos.count)"
            )
            ForEach(prestamos) { prestamo in
                TarjetaPrestamoEmpresa(
                    prestamo: prestamo,
                    hoy: vm.hoy,
                    // Dirección solo consulta: entregar y recibir son de la ventanilla.
                    accion: vm.perfil == .administra ? HerramientasReglas.accionDePrestamo(prestamo) : nil,
                    enviando: vm.estado.enviando,
                    onAccion: { accion in
                        abrir(accion == .entregar ? .entregar(prestamo) : .recibir(prestamo))
                    }
                )
            }
        }
    }

    private var vacioEmpresa: String {
        vm.perfil == .administra
            ? "Cuando alguien pida una herramienta te llega a «Por aprobar». Aprobada, aquí la entregas y la recibes."
            : "Cuando alguien del equipo pida una herramienta y se la aprueben, aquí ves quién la trae y para cuándo."
    }

    // MARK: «Inventario»

    @ViewBuilder
    private var seccionInventario: some View {
        let piezas = vm.inventarioVisible
        let total = vm.estado.inventario.count
        let consulta = vm.consulta

        if total > 6 {
            NxSearchField(text: $vm.consulta, placeholder: "Buscar por nombre, modelo, serie o código")
        }

        if piezas.isEmpty {
            if !consulta.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                NxEmptyState(
                    title: "Sin coincidencias",
                    subtitle: "Ninguna herramienta coincide con «\(consulta)».",
                    actionLabel: "Limpiar búsqueda",
                    onAction: { vm.consulta = "" }
                )
            } else {
                NxEmptyState(
                    title: HerramientasReglas.vacioBusquedaTitulo,
                    subtitle: vm.perfil == .administra
                        ? "Da de alta la primera con «Nueva herramienta»: nombre, modelo, serie y dos fotos."
                        : "Almacén las da de alta. En cuanto estén, aquí ves cada pieza y quién la trae."
                )
            }
        } else {
            MoreCabecera(titulo: "Inventario", subtitulo: "Cada pieza y quién la trae", trailing: "\(piezas.count)")
            ForEach(piezas) { pieza in
                TarjetaInventario(
                    pieza: pieza,
                    quien: HerramientasReglas.quienLaTrae(
                        pieza,
                        prestamos: vm.estado.empresa,
                        kits: vm.estado.kitsEmpresa
                    )
                )
            }
        }
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
                Text("Almacén revisa cada daño reportado y decide qué sigue.")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }

        if kit.isEmpty {
            let titulo = "No traes herramienta asignada"
            let texto = "Tu kit está vacío: nadie te ha asignado una herramienta de forma "
                + "permanente. Si necesitas una para un trabajo, pídela prestada."
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
                TarjetaKit(
                    asignacion: asignacion,
                    hoy: vm.hoy,
                    onReportar: { abrir(.reportar(asignacion)) }
                )
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
                    subtitle: "Toca «Pedir préstamo», busca la herramienta y di hasta cuándo la ocupas. "
                        + "Aquí verás si te la aprueban, su fecha de devolución y su código para recogerla."
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

    // MARK: Hojas

    private func abrir(_ cual: HojaDeHerramientas) {
        vm.limpiarAccionError()
        hoja = cual
    }

    @ViewBuilder
    private func contenidoDeHoja(_ cual: HojaDeHerramientas) -> some View {
        switch cual {
        case .pedir:
            PedirPrestamoView(
                usuarioId: SessionStore.shared.currentUser.flatMap { Int($0.id) },
                hoy: vm.hoy,
                onCreado: { vm.alCrear("Préstamo pedido: queda pendiente de que lo aprueben.") }
            )
        case .nueva:
            NuevaHerramientaView(onCreada: { nombre in vm.alCrear("Herramienta dada de alta: \(nombre).") })
        case .reportar(let asignacion):
            HojaDeHerramientaConMotivo(
                vm: vm,
                sobretitulo: "REPORTAR DAÑO",
                titulo: HerramientasReglas.tituloPieza(asignacion),
                explicacion: "Almacén lo revisa y decide si se repara o se cambia.",
                etiqueta: "¿Qué le pasó?",
                confirmar: "Reportar daño",
                onCerrar: { hoja = nil },
                onConfirmar: { texto in
                    Task { if await vm.reportarDanio(asignacion, descripcion: texto) { hoja = nil } }
                }
            )
        case .rechazar(let prestamo):
            HojaDeHerramientaConMotivo(
                vm: vm,
                sobretitulo: "RECHAZAR PRÉSTAMO",
                titulo: HerramientasReglas.tituloPrestamo(prestamo),
                explicacion: "\(HerramientasReglas.nombreDe(prestamo)) verá este motivo.",
                etiqueta: "¿Por qué no?",
                confirmar: "Rechazar",
                onCerrar: { hoja = nil },
                onConfirmar: { texto in
                    Task { if await vm.rechazar(prestamo, motivo: texto) { hoja = nil } }
                }
            )
        case .rechazarRenovacion(let renovacion):
            HojaDeHerramientaConMotivo(
                vm: vm,
                sobretitulo: "RECHAZAR PRÓRROGA",
                titulo: HerramientasReglas.tituloRenovacion(renovacion),
                explicacion: "\(HerramientasReglas.nombreDe(renovacion)) verá este motivo.",
                etiqueta: "¿Por qué no?",
                confirmar: "Rechazar",
                onCerrar: { hoja = nil },
                onConfirmar: { texto in
                    Task { if await vm.rechazarRenovacion(renovacion, motivo: texto) { hoja = nil } }
                }
            )
        case .entregar(let prestamo):
            HojaEntregarHerramienta(vm: vm, prestamo: prestamo, onCerrar: { hoja = nil })
        case .recibir(let prestamo):
            HojaRecibirHerramienta(vm: vm, prestamo: prestamo, onCerrar: { hoja = nil })
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
