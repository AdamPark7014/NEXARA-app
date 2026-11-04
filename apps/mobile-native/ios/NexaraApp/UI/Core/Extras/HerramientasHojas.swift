import SwiftUI

/// Las hojas de Herramientas: pedir préstamo, dar de alta una pieza y las decisiones que
/// piden una línea de texto (rechazar, reportar un daño, entregar y recibir).

/// Qué hoja está abierta. Lleva el registro completo porque la hoja lo necesita entero.
enum HojaDeHerramientas: Identifiable {
    case pedir
    case nueva
    case reportar(KitAsignacion)
    case rechazar(PrestamoHerramienta)
    case rechazarRenovacion(RenovacionHerramienta)
    case entregar(PrestamoHerramienta)
    case recibir(PrestamoHerramienta)

    var id: String {
        switch self {
        case .pedir: return "pedir"
        case .nueva: return "nueva"
        case .reportar(let asignacion): return "reportar-\(asignacion.id)"
        case .rechazar(let prestamo): return "rechazar-\(prestamo.id)"
        case .rechazarRenovacion(let renovacion): return "rechazar-renovacion-\(renovacion.id)"
        case .entregar(let prestamo): return "entregar-\(prestamo.id)"
        case .recibir(let prestamo): return "recibir-\(prestamo.id)"
        }
    }
}

// MARK: - Hoja con un motivo

/// Una decisión con una línea de texto: quién y qué arriba, el campo y el botón.
/// La usan Herramientas y las solicitudes de Vehículos.
struct HojaConMotivo: View {
    let sobretitulo: String
    let titulo: String
    var explicacion: String? = nil
    let etiqueta: String
    let confirmar: String
    /// `false` = se puede mandar sin escribir nada.
    var obligatorio: Bool = true
    let enviando: Bool
    let error: String?
    let onCerrar: () -> Void
    let onConfirmar: (String) -> Void

    @State private var texto = ""

    private var listo: Bool { !obligatorio || texto.nilSiVacio != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(sobretitulo)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(NxColors.muted)
                    Text(titulo)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                if let explicacion {
                    Text(explicacion)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                CampoDelineado(
                    etiqueta: etiqueta,
                    texto: $texto,
                    multilinea: true,
                    minLineas: 3,
                    habilitado: !enviando,
                    maxLargo: 500
                )

                if let error {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    Button("Cancelar", action: onCerrar)
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                        .disabled(enviando)
                    Button(enviando ? "Enviando…" : confirmar) { onConfirmar(texto) }
                        .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 48))
                        .disabled(enviando || !listo)
                }
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial(detents: [.medium, .large])
    }
}

/// `HojaConMotivo` unida al estado vivo del VM (enviando, error) mientras está abierta.
struct HojaDeHerramientaConMotivo: View {
    @ObservedObject var vm: HerramientasViewModel
    let sobretitulo: String
    let titulo: String
    let explicacion: String
    let etiqueta: String
    let confirmar: String
    let onCerrar: () -> Void
    let onConfirmar: (String) -> Void

    var body: some View {
        HojaConMotivo(
            sobretitulo: sobretitulo,
            titulo: titulo,
            explicacion: explicacion,
            etiqueta: etiqueta,
            confirmar: confirmar,
            enviando: vm.estado.enviando,
            error: vm.estado.accionError,
            onCerrar: onCerrar,
            onConfirmar: onConfirmar
        )
    }
}

// MARK: - Entregar y recibir

/// Registrar la salida: quien la recoge enseña su código y aquí se teclea.
struct HojaEntregarHerramienta: View {
    @ObservedObject var vm: HerramientasViewModel
    let prestamo: PrestamoHerramienta
    let onCerrar: () -> Void

    @State private var codigo = ""

    private var pideCodigo: Bool { HerramientasReglas.pideCodigoAlEntregar(prestamo) }
    private var listo: Bool { !pideCodigo || codigo.nilSiVacio != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ENTREGAR")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(NxColors.muted)
                    Text(HerramientasReglas.tituloPrestamo(prestamo))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("A \(HerramientasReglas.nombreDe(prestamo))")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                if pideCodigo {
                    Text("Teclea el código de recolección que enseña quien la recoge.")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    CampoDelineado(
                        etiqueta: "Código de recolección",
                        texto: $codigo,
                        mayusculas: true,
                        habilitado: !vm.estado.enviando,
                        maxLargo: 12
                    )
                }

                if let error = vm.estado.accionError {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    Button("Cancelar", action: onCerrar)
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                        .disabled(vm.estado.enviando)
                    Button(vm.estado.enviando ? "Registrando…" : "Registrar salida") {
                        Task { if await vm.entregar(prestamo, codigo: codigo) { onCerrar() } }
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 48))
                    .disabled(vm.estado.enviando || !listo)
                }
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(vm.estado.enviando)
        .hojaMaterial(detents: [.medium, .large])
    }
}

/// Registrar la entrada, con el daño si llegó con alguno.
struct HojaRecibirHerramienta: View {
    @ObservedObject var vm: HerramientasViewModel
    let prestamo: PrestamoHerramienta
    let onCerrar: () -> Void

    @State private var danio = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("RECIBIR")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(NxColors.muted)
                    Text(HerramientasReglas.tituloPrestamo(prestamo))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("La trae \(HerramientasReglas.nombreDe(prestamo))")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                CampoDelineado(
                    etiqueta: "¿Llegó con daño? Descríbelo (opcional)",
                    texto: $danio,
                    ayuda: "Con daño queda en reparación.",
                    multilinea: true,
                    minLineas: 2,
                    habilitado: !vm.estado.enviando,
                    maxLargo: 500
                )

                if let error = vm.estado.accionError {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    Button("Cancelar", action: onCerrar)
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                        .disabled(vm.estado.enviando)
                    Button(vm.estado.enviando ? "Registrando…" : "Registrar entrada") {
                        Task { if await vm.recibir(prestamo, danio: danio) { onCerrar() } }
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 48))
                    .disabled(vm.estado.enviando)
                }
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(vm.estado.enviando)
        .hojaMaterial(detents: [.medium, .large])
    }
}

// MARK: - Pedir préstamo

/// «Pedir préstamo»: busca la pieza, di hasta cuándo y para qué. Queda por aprobar.
struct PedirPrestamoView: View {
    let usuarioId: Int?
    let hoy: HerramientasReglas.Dia
    let onCreado: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var consulta = ""
    @State private var resultados: [PiezaDeInventario] = []
    @State private var buscando = false
    /// Ya contestó el servidor para lo que está escrito: antes de eso, «sin resultados» sería falso.
    @State private var contesto = false
    @State private var errorBusqueda: String?
    @State private var pieza: PiezaDeInventario?
    @State private var plazo = HerramientasReglas.plazoPorOmision
    @State private var motivo = ""
    @State private var actividades: [ActividadDeSolicitud] = []
    @State private var actividadId: Int?
    @State private var enviando = false
    @State private var error: String?

    private var plazos: [HerramientasReglas.OpcionPlazo] { HerramientasReglas.plazosParaPedir(hoy: hoy) }

    private var fecha: HerramientasReglas.Dia? {
        plazos.indices.contains(plazo) ? plazos[plazo].fecha : nil
    }

    private var escrito: String { consulta.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Pedir préstamo")
                    .font(NxType.headlineSmall)
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)

                if let pieza {
                    elegida(pieza)
                    formulario
                } else {
                    busqueda
                }
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial()
        .task(id: consulta) { await buscar() }
        .task { await cargarActividades() }
    }

    // MARK: Buscar

    @ViewBuilder
    private var busqueda: some View {
        NxSearchField(text: $consulta, placeholder: "Nombre, modelo, serie o código")

        if escrito.isEmpty {
            Text("Escribe qué herramienta necesitas: solo salen las que están libres.")
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
        } else if buscando && !contesto {
            NxSkeletonList(itemCount: 3, itemHeight: 56)
        } else if let errorBusqueda {
            NxErrorBlock(message: errorBusqueda, onRetry: { Task { await buscar() } })
        } else if contesto && resultados.isEmpty {
            NxEmptyState(
                title: HerramientasReglas.vacioBusquedaTitulo,
                subtitle: HerramientasReglas.vacioBusquedaTexto(consulta: escrito)
            )
        } else {
            ForEach(resultados) { opcion in
                MoreTarjeta(onClick: { pieza = opcion }) {
                    Text(HerramientasReglas.tituloPieza(opcion))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    let renglones = HerramientasReglas.renglonesPieza(opcion)
                    if !renglones.isEmpty {
                        Text(renglones.joined(separator: " · "))
                            .font(NxType.labelMedium)
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(2)
                    }
                }
            }
        }

        Button("Cancelar") { dismiss() }
            .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
    }

    // MARK: Formulario

    private func elegida(_ opcion: PiezaDeInventario) -> some View {
        MoreTarjeta {
            Text(HerramientasReglas.tituloPieza(opcion))
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
            let renglones = HerramientasReglas.renglonesPieza(opcion)
            if !renglones.isEmpty {
                Text(renglones.joined(separator: "\n"))
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button("Cambiar de herramienta") { pieza = nil }
                .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                .disabled(enviando)
        }
    }

    @ViewBuilder
    private var formulario: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("¿Cuándo la regresas?")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .accessibilityAddTraits(.isHeader)
            HerrFilaDePastillas(pastillas: plazos.enumerated().map { indice, opcion in
                HerrPastilla(
                    id: opcion.etiqueta,
                    etiqueta: opcion.etiqueta,
                    seleccionada: indice == plazo,
                    onClick: { plazo = indice }
                )
            })
            if let fecha {
                Text("La regresarías el \(HerramientasReglas.fechaCorta(fecha))")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
            }
        }

        CampoDelineado(
            etiqueta: "¿Para qué la necesitas?",
            texto: $motivo,
            multilinea: true,
            minLineas: 2,
            habilitado: !enviando,
            maxLargo: 500
        )

        selectorActividad

        if let error {
            Text(error)
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.danger)
                .fixedSize(horizontal: false, vertical: true)
        }

        VStack(spacing: 10) {
            Button {
                pedir()
            } label: {
                HStack(spacing: 10) {
                    if enviando {
                        SpinnerDeBoton()
                        Text("Enviando…")
                    } else {
                        Text("Pedir préstamo").fontWeight(.bold)
                    }
                }
            }
            .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 56, llenaAncho: true))
            .disabled(enviando || HerramientasReglas.faltaParaPedir(tienePieza: pieza != nil, motivo: motivo) != nil)

            Button("Cancelar") { dismiss() }
                .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                .disabled(enviando)

            Text("Queda por aprobar. Cuando te la aprueben, tu código para recogerla sale en «Mis préstamos».")
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Opcional: la actividad para la que se pide. Sin actividades abiertas no se ofrece.
    @ViewBuilder
    private var selectorActividad: some View {
        if !actividades.isEmpty {
            let elegida = actividades.first { $0.id == actividadId }
            Menu {
                Button("Sin actividad") { actividadId = nil }
                ForEach(actividades) { actividad in
                    Button(HerramientasReglas.etiquetaActividad(actividad)) { actividadId = actividad.id }
                }
            } label: {
                Text(elegida.map { HerramientasReglas.etiquetaActividad($0) } ?? "Para una actividad (opcional)")
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(2)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), llenaAncho: true))
            .disabled(enviando)
        }
    }

    // MARK: Datos

    /// Espera a que se deje de teclear. El vacío se decide con la respuesta, no con un cero inicial.
    @MainActor
    private func buscar() async {
        let q = escrito
        contesto = false
        errorBusqueda = nil
        guard !q.isEmpty else {
            resultados = []
            buscando = false
            return
        }
        buscando = true
        try? await Task.sleep(nanoseconds: 350_000_000)
        guard !Task.isCancelled else { return }
        do {
            let lista = try await HerramientasRepository.shared.buscarInventario(q)
            guard !Task.isCancelled else { return }
            resultados = lista
            contesto = true
        } catch {
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled { return }
            resultados = []
            errorBusqueda = error.toUserMessage(fallback: "No se pudo buscar la herramienta")
        }
        buscando = false
    }

    /// Aparte: sin actividades se puede pedir igual un préstamo suelto.
    @MainActor
    private func cargarActividades() async {
        actividades = (try? await HerramientasRepository.shared.misActividades()) ?? []
    }

    private func pedir() {
        guard let pieza, let fecha, !enviando else { return }
        guard let usuarioId else {
            error = "No se pudo leer tu usuario. Cierra sesión y vuelve a entrar."
            return
        }
        enviando = true
        error = nil
        let inventarioId = pieza.id
        let actividad = actividadId
        let texto = motivo
        let desde = hoy
        Task { @MainActor in
            do {
                try await HerramientasRepository.shared.pedirPrestamo(
                    usuarioId: usuarioId,
                    inventarioId: inventarioId,
                    motivo: texto,
                    desde: desde,
                    hasta: fecha,
                    actividadId: actividad
                )
                enviando = false
                onCreado()
                dismiss()
            } catch {
                enviando = false
                self.error = error.toUserMessage(fallback: "No se pudo pedir el préstamo")
            }
        }
    }
}

// MARK: - Nueva herramienta

/// «Nueva herramienta»: nombre, modelo, serie y las dos fotos que el servidor exige.
/// El código interno y la etiqueta los calcula él.
struct NuevaHerramientaView: View {
    /// Recibe el nombre con que quedó.
    let onCreada: (String) -> Void

    private enum Foto: String, Identifiable {
        case panoramica, serie

        var id: String { rawValue }

        var titulo: String {
            self == .panoramica ? "Foto de la herramienta completa" : "Foto del modelo y la serie"
        }
    }

    @Environment(\.dismiss) private var dismiss

    @State private var nombre = ""
    @State private var modelo = ""
    @State private var serie = ""
    @State private var panoramica: CapturedGeoPhoto?
    @State private var fotoDeSerie: CapturedGeoPhoto?
    @State private var camara: Foto?
    @State private var enviando = false
    @State private var error: String?

    private var falta: String? {
        HerramientasReglas.faltaParaAlta(
            nombre: nombre,
            modelo: modelo,
            serie: serie,
            conPanoramica: panoramica != nil,
            conFotoDeSerie: fotoDeSerie != nil
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Nueva herramienta")
                    .font(NxType.headlineSmall)
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)

                CampoDelineado(etiqueta: "Nombre", texto: $nombre, habilitado: !enviando, maxLargo: 200)
                CampoDelineado(etiqueta: "Modelo", texto: $modelo, habilitado: !enviando, maxLargo: 200)
                CampoDelineado(etiqueta: "Número de serie", texto: $serie, mayusculas: true, habilitado: !enviando, maxLargo: 200)

                FotoDeFormulario(
                    titulo: Foto.panoramica.titulo,
                    pista: "Que se vea entera: con esta se reconoce.",
                    foto: panoramica,
                    habilitado: !enviando,
                    onTomar: { camara = .panoramica }
                )
                FotoDeFormulario(
                    titulo: Foto.serie.titulo,
                    pista: "La placa o etiqueta, que se lea.",
                    foto: fotoDeSerie,
                    habilitado: !enviando,
                    onTomar: { camara = .serie }
                )

                if let error {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(spacing: 10) {
                    Button {
                        darDeAlta()
                    } label: {
                        HStack(spacing: 10) {
                            if enviando {
                                SpinnerDeBoton()
                                Text("Guardando…")
                            } else {
                                Text("Dar de alta").fontWeight(.bold)
                            }
                        }
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 56, llenaAncho: true))
                    .disabled(enviando || falta != nil)

                    Button("Cancelar") { dismiss() }
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                        .disabled(enviando)

                    if let falta {
                        Text(falta)
                            .font(NxType.labelMedium)
                            .foregroundStyle(NxColors.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial()
        .fullScreenCover(item: $camara) { cual in
            GeoPhotoCaptureView(
                title: cual.titulo,
                confirmLabel: "Usar esta foto",
                // Se toma en el almacén, a veces sin GPS: la ubicación no bloquea el alta.
                requireLocation: false,
                onConfirm: { foto in
                    if cual == .panoramica {
                        panoramica = foto
                    } else {
                        fotoDeSerie = foto
                    }
                    camara = nil
                    return nil
                },
                onCancel: { camara = nil }
            )
        }
    }

    private func darDeAlta() {
        guard falta == nil, let panoramica, let fotoDeSerie, !enviando else { return }
        enviando = true
        error = nil
        let nombreLimpio = nombre.trimmingCharacters(in: .whitespacesAndNewlines)
        let modeloLimpio = modelo
        let serieLimpia = serie
        Task { @MainActor in
            do {
                try await HerramientasRepository.shared.nuevaHerramienta(
                    nombre: nombreLimpio,
                    modelo: modeloLimpio,
                    serie: serieLimpia,
                    panoramica: panoramica,
                    fotoDeSerie: fotoDeSerie
                )
                enviando = false
                onCreada(nombreLimpio)
                dismiss()
            } catch {
                enviando = false
                self.error = error.toUserMessage(fallback: "No se pudo dar de alta la herramienta")
            }
        }
    }
}

// MARK: - Foto de un formulario

/// Una foto de un formulario, con la misma cámara en vivo de las evidencias: la vista
/// previa si ya hay y el botón para tomarla. La usan Herramientas y Pagos.
struct FotoDeFormulario: View {
    let titulo: String
    var pista: String? = nil
    let foto: CapturedGeoPhoto?
    var habilitado: Bool = true
    let onTomar: () -> Void

    /// Dos fotos en el mismo formulario: VoiceOver y las pruebas dicen de cuál se trata.
    private var etiquetaDelBoton: String {
        let accion = foto == nil ? "Tomar foto" : "Tomar otra"
        return "\(accion): \(titulo)"
    }

    var body: some View {
        NxPanelShell {
            VStack(alignment: .leading, spacing: 10) {
                NxSectionHeader(title: titulo, subtitle: pista)
                if let foto {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: 160)
                        .overlay {
                            Image(uiImage: foto.image)
                                .resizable()
                                .scaledToFill()
                        }
                        .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                        .accessibilityElement()
                        .accessibilityLabel("Foto tomada: \(titulo)")
                }
                Button(action: onTomar) {
                    HStack(spacing: 8) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                        Text(foto == nil ? "Tomar foto" : "Tomar otra")
                    }
                }
                .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                .disabled(!habilitado)
                .accessibilityLabel(etiquetaDelBoton)
            }
        }
    }
}
