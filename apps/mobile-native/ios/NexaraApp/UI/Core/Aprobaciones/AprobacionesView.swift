import SwiftUI

// MARK: - Estado de la bandeja

/// Aprobaciones: cargar la bandeja y decidir (`AprobacionesViewModel.kt`).
///
/// 1. **Una decisión a la vez.** Mientras una viaja, los botones de toda la
///    lista quedan bloqueados: con dos en vuelo, la recarga de la primera
///    reordenaría la lista bajo el dedo que iba a pulsar la segunda.
/// 2. **La fila sale cuando el servidor confirma**, no cuando se pulsa: si otro
///    director ya decidió ese paso, el servidor contesta 400 y la aprobación
///    sigue viva.
///
/// Pase lo que pase, se recarga contra el servidor.
@MainActor
final class AprobacionesModelo: ObservableObject {
    enum EstadoPantalla { case cargando, error, vacio, contenido }

    @Published private(set) var cargando = true
    @Published private(set) var refrescando = false
    /// Primera carga fallida: no hay nada que enseñar.
    @Published private(set) var error: String?
    @Published private(set) var filas: [AprobacionesRules.Pendiente] = []
    /// Refresco fallido con la bandeja vieja todavía en pantalla.
    @Published var avisoRefresco: String?
    /// La aprobación cuya decisión va en camino. Bloquea los botones de todas.
    @Published private(set) var decidiendo: Int?
    /// El servidor NO aceptó la decisión, y dice por qué.
    @Published var errorDecision: String?
    /// El servidor confirmó, y dice exactamente qué hizo.
    @Published var avisoDecision: String?
    @Published private(set) var filtro: AprobacionesRules.Filtro = .todas

    private let repo = AprobacionesRepository.shared
    private var arrancado = false

    /// `hayDatos` es «hay filas»: una bandeja limpia cae en VACÍO y enseña la
    /// buena noticia, no una barra de filtros en ceros.
    var estadoPantalla: EstadoPantalla {
        if !filas.isEmpty { return .contenido }
        if cargando { return .cargando }
        if let error, !error.isEmpty { return .error }
        return .vacio
    }

    func arrancar() async {
        guard !arrancado else { return }
        arrancado = true
        await cargar(refresco: false)
    }

    func refrescar() async { await cargar(refresco: true) }

    func reintentar() {
        let refresco = !filas.isEmpty
        Task { await cargar(refresco: refresco) }
    }

    func descartarAvisoRefresco() { avisoRefresco = nil }

    func descartarAvisoDecision() {
        avisoDecision = nil
        errorDecision = nil
    }

    /// Volver a tocar la celda o pastilla que ya filtra la quita.
    func alternarFiltro(_ opcion: AprobacionesRules.Filtro) {
        filtro = filtro == opcion ? .todas : opcion
    }

    func aprobar(_ aprobacionId: Int) { decidir(aprobacionId, aprobar: true, motivo: nil) }

    func rechazar(_ aprobacionId: Int, motivo: String) { decidir(aprobacionId, aprobar: false, motivo: motivo) }

    private func cargar(refresco: Bool) async {
        if refresco {
            refrescando = true
            avisoRefresco = nil
        } else {
            cargando = true
            error = nil
            avisoRefresco = nil
        }
        do {
            let nuevas = AprobacionesRules.ordenadas(try await repo.pendientes())
            filas = nuevas
            cargando = false
            refrescando = false
            error = nil
            avisoRefresco = nil
        } catch let problema {
            // El mensaje del servidor viene rescatado: un 403 dice qué permiso falta.
            let mensaje = problema.toUserMessage(fallback: "No se pudieron cargar las aprobaciones")
            cargando = false
            refrescando = false
            if filas.isEmpty {
                error = mensaje
            } else {
                avisoRefresco = mensaje
            }
        }
    }

    private func decidir(_ aprobacionId: Int, aprobar: Bool, motivo: String?) {
        guard decidiendo == nil else { return }
        if !aprobar && !AprobacionesRules.motivoValido(motivo) {
            errorDecision = "Escribe el motivo del rechazo."
            return
        }
        decidiendo = aprobacionId
        errorDecision = nil
        avisoDecision = nil

        Task {
            do {
                let respuesta = try await repo.decidir(aprobacionId: aprobacionId, aprobar: aprobar, motivo: motivo)
                decidiendo = nil
                // Ahora sí: el servidor confirmó, la fila puede irse.
                filas.removeAll { $0.aprobacionId == aprobacionId }
                avisoDecision = AprobacionesRules.mensajeDeDecision(aprobado: aprobar, respuesta: respuesta)
            } catch let problema {
                decidiendo = nil
                errorDecision = problema.toUserMessage(fallback: "No se pudo registrar la decisión")
            }
            // Falle o no, la bandeja vuelve a pedirse: si otro decidió mientras
            // tanto, esa fila tiene que desaparecer aunque tu decisión fallara.
            await cargar(refresco: true)
        }
    }
}

// MARK: - Pantalla

/// Aprobaciones (`/erp/approvals`) en el teléfono (`AprobacionesScreen.kt`).
///
///  · **Qué es, de quién y cuánto, antes de los botones**, con la cadena de firmas.
///  · **Un solo botón primario**: «Aprobar», de marca y más ancho, a la derecha;
///    «Rechazar» con contorno a la izquierda. Los dos miden 52.
///  · **Difícil por accidente, fácil a propósito**: aprobar es un toque; rechazar
///    abre un diálogo y pide motivo.
///
/// Va dentro del `NavigationStack` del hub «Más»: aquí no se crea otro.
struct AprobacionesView: View {
    @StateObject private var modelo = AprobacionesModelo()

    /// Qué se está rechazando. El motivo se pide en un diálogo y no en la
    /// tarjeta: un campo entre los dos botones hace que se toque el que no era.
    @State private var rechazando: AprobacionesRules.Pendiente?

    var body: some View {
        let todas = modelo.filas
        let estado = modelo.estadoPantalla

        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                // Avisos sobre lo que ya se ve: no son estados de pantalla.
                if let aviso = modelo.avisoRefresco {
                    MoreAvisoDesactualizado(mensaje: aviso, onCerrar: { modelo.descartarAvisoRefresco() })
                }
                if let texto = modelo.errorDecision ?? modelo.avisoDecision {
                    CintaDeDecision(
                        texto: texto,
                        fallo: modelo.errorDecision != nil,
                        onCerrar: { modelo.descartarAvisoDecision() }
                    )
                }

                switch estado {
                case .cargando:
                    NxSkeletonList(itemCount: 3, itemHeight: 196)
                case .error:
                    NxErrorBlock(message: modelo.error, onRetry: { modelo.reintentar() })
                case .vacio:
                    // El vacío aquí es una buena noticia y se dice como tal.
                    NxEmptyState(
                        title: "No hay nada esperándote",
                        subtitle: "Ninguna solicitud está detenida en tu firma. "
                            + "Cuando alguien te necesite, aparece aquí y te llega el aviso.",
                        systemImage: CoreExtraModule.aprobaciones.systemImage,
                        actionLabel: "Volver a revisar",
                        onAction: { Task { await modelo.refrescar() } }
                    )
                case .contenido:
                    contenido(todas)
                }
            }
            .padding(NxSpacing.l)
        }
        .refreshable { await modelo.refrescar() }
        .nxScreenBackground()
        .task { await modelo.arrancar() }
        .fullScreenCover(item: $rechazando) { fila in
            DialogoDeRechazo(
                fila: fila,
                onCancelar: { cerrarDialogo() },
                onConfirmar: { motivo in
                    cerrarDialogo()
                    modelo.rechazar(fila.aprobacionId, motivo: motivo)
                }
            )
            .presentationBackground(.clear)
        }
    }

    @ViewBuilder
    private func contenido(_ todas: [AprobacionesRules.Pendiente]) -> some View {
        let filtro = modelo.filtro
        let visibles = AprobacionesRules.aplicar(todas, filtro)
        let conteos = AprobacionesRules.conteos(todas)

        // La tira aparece porque hay filas que contar; tocar una celda filtra.
        NxMetricStrip(
            items: AprobacionesRules.metricas(todas),
            seleccion: AprobacionesRules.metricaDeFiltro(filtro),
            onSelect: { clave in
                if let nuevo = AprobacionesRules.filtroDeMetrica(clave) { modelo.alternarFiltro(nuevo) }
            }
        )

        // Una sola fila de filtros, sin caja y sin fondo.
        NxFilterBar(horizontalPadding: 0) {
            ForEach(AprobacionesRules.Filtro.allCases) { opcion in
                NxFilterPill(
                    label: opcion.etiqueta,
                    count: conteos[opcion],
                    selected: opcion == filtro,
                    color: AprobacionesRules.colorDeFiltro(opcion),
                    onClick: { modelo.alternarFiltro(opcion) }
                )
            }
        }

        if visibles.isEmpty {
            NxEmptyState(
                title: "Nada en «\(filtro.etiqueta.lowercased())»",
                subtitle: Self.subtituloVacio(filtro),
                systemImage: CoreExtraModule.aprobaciones.systemImage,
                actionLabel: "Ver todas",
                onAction: { modelo.alternarFiltro(.todas) }
            )
        } else {
            NxDenseSectionHeader(title: filtro.etiqueta, hint: "Lo que lleva más tiempo parado, primero.") {
                Text("\(visibles.count)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(NxColors.fg2)
            }
            ForEach(visibles) { fila in
                TarjetaDeAprobacion(
                    fila: fila,
                    enviando: modelo.decidiendo == fila.aprobacionId,
                    bloqueada: modelo.decidiendo != nil,
                    onAprobar: { modelo.aprobar(fila.aprobacionId) },
                    onRechazar: { abrirDialogo(fila) }
                )
            }
        }
    }

    private static func subtituloVacio(_ filtro: AprobacionesRules.Filtro) -> String {
        switch filtro {
        case .atrasadas: return "Ninguna lleva más de dos días parada. Vas al día."
        case .cierran: return "Ninguna se cierra con tu firma: todas pasan a otro después de ti."
        case .todas: return "No hay nada en este filtro."
        }
    }

    /// El diálogo aparece encima de todo (barra y pestañas incluidas), como el
    /// `AlertDialog` de Android, sin la animación de hoja que sube.
    private func abrirDialogo(_ fila: AprobacionesRules.Pendiente) {
        var sinAnimacion = Transaction()
        sinAnimacion.disablesAnimations = true
        withTransaction(sinAnimacion) { rechazando = fila }
    }

    private func cerrarDialogo() {
        var sinAnimacion = Transaction()
        sinAnimacion.disablesAnimations = true
        withTransaction(sinAnimacion) { rechazando = nil }
    }
}

// MARK: - Una pendiente

/// Una solicitud esperando tu firma (`TarjetaDeAprobacion` de Android): una
/// sola caja blanca con borde #E2E8F0 y radio 12; dentro no hay cajas.
private struct TarjetaDeAprobacion: View {
    let fila: AprobacionesRules.Pendiente
    let enviando: Bool
    let bloqueada: Bool
    let onAprobar: () -> Void
    let onRechazar: () -> Void

    /// 52, no 44: aquí se pulsa caminando y equivocarse cuesta cancelar la
    /// solicitud de otra persona.
    private static let altoBoton: CGFloat = 52

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
        VStack(alignment: .leading, spacing: 12) {
            // QUÉ es
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(fila.titulo)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    Text(fila.flujo)
                        .font(.system(size: 12.5))
                        .foregroundStyle(NxColors.fg2)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                // Un punto y una palabra. Color solo cuando urge.
                NxStatusDot(
                    text: fila.esperaTexto,
                    color: fila.atrasada ? AprobacionesRules.rojo : nil,
                    maxLines: 2
                )
                .fixedSize(horizontal: false, vertical: true)
            }

            // DE QUIÉN y CUÁNTO
            FinanzasFilaPonderada(pesos: [1.3, 1, 1], espacio: 12) {
                DatoDeAprobacion(etiqueta: "Solicita", valor: fila.solicita, pie: fila.solicitaRol)
                // El importe es el dato por el que se abre esta pantalla: más grande.
                DatoDeAprobacion(etiqueta: "Importe", valor: fila.importe, destacado: true)
                DatoDeAprobacion(etiqueta: "Recibida", valor: fila.recibida)
            }

            Text(fila.paso)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(NxColors.fg)

            if !fila.cadena.isEmpty {
                CadenaDeFirmas(pasos: fila.cadena)
            }

            if fila.cierraElFlujo {
                NxStatusDot(
                    text: "Tu firma cierra el flujo: después de ti no queda nadie.",
                    color: AprobacionesRules.ambar,
                    maxLines: 2
                )
            }

            // Rechazar a la izquierda, gris y con borde; Aprobar a la derecha,
            // más ancho y en marca.
            FinanzasFilaPonderada(pesos: [1, 1.6], espacio: 10) {
                Button(action: onRechazar) {
                    Text("Rechazar").font(.system(size: 15, weight: .medium))
                }
                .buttonStyle(FinanzasBotonEstilo(tipo: .contorno, alto: Self.altoBoton, radio: NxRadius.s, letra: NxColors.fg2))
                .disabled(bloqueada)

                Button(action: onAprobar) {
                    if enviando {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                            .frame(width: 20, height: 20)
                    } else {
                        Text("Aprobar").font(.system(size: 16, weight: .semibold))
                    }
                }
                .buttonStyle(FinanzasBotonEstilo(tipo: .lleno, alto: Self.altoBoton, radio: NxRadius.s))
                .disabled(bloqueada)
                .accessibilityLabel(enviando ? "Enviando la aprobación" : "Aprobar")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: forma)
        .overlay(forma.strokeBorder(NxColors.border, lineWidth: 1))
        .accessibilityElement(children: .contain)
    }
}

/// Celda etiqueta/valor de la ficha. Sin caja: la caja ya es la tarjeta.
private struct DatoDeAprobacion: View {
    let etiqueta: String
    let valor: String
    var pie: String? = nil
    var destacado: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiqueta.uppercased())
                .font(.system(size: 11, weight: .medium))
                .tracking(0.4)
                .foregroundStyle(NxColors.muted)
                .lineLimit(1)
            Text(valor)
                .font(.system(size: destacado ? 17 : 14, weight: destacado ? .bold : .medium))
                .foregroundStyle(NxColors.fg)
                .lineLimit(2)
                .minimumScaleFactor(destacado ? 0.75 : 1)
            if let pie, !pie.trimmingCharacters(in: .whitespaces).isEmpty {
                Text(pie)
                    .font(.system(size: 11))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // Se lee como una frase, no como tres palabras sueltas.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([ "\(etiqueta): \(valor)", pie ].compactMap { $0 }.joined(separator: ", "))
    }
}

/// Quién ya firmó, dónde estás tú y quién falta. El punto hueco marca los pasos
/// que ni siquiera han empezado.
private struct CadenaDeFirmas: View {
    let pasos: [AprobacionesRules.PasoCadena]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(pasos.enumerated()), id: \.offset) { _, paso in
                let texto = "\(paso.numero). \(paso.aprobador) · \(Self.situacion(paso))"
                if paso.estado == .enEspera {
                    HStack(alignment: .center, spacing: 6) {
                        Circle()
                            .strokeBorder(NxColors.borderStrong, lineWidth: 1)
                            .frame(width: 6, height: 6)
                        Text(texto)
                            .font(.system(size: 12.5, weight: .medium))
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(2)
                    }
                    .accessibilityElement(children: .combine)
                } else {
                    NxStatusDot(
                        text: texto,
                        color: Self.color(paso),
                        fontWeight: paso.esElTuyo ? .bold : .medium,
                        maxLines: 2
                    )
                }
            }
        }
    }

    /// El tuyo se distingue por el texto, no por el color.
    private static func color(_ paso: AprobacionesRules.PasoCadena) -> Color? {
        if paso.esElTuyo { return nil }
        switch paso.estado {
        case .aprobado: return AprobacionesRules.verde
        case .rechazado: return AprobacionesRules.rojo
        case .pendiente: return AprobacionesRules.ambar
        case .enEspera: return AprobacionesRules.gris
        }
    }

    private static func situacion(_ paso: AprobacionesRules.PasoCadena) -> String {
        if paso.esElTuyo { return "te toca a ti" }
        switch paso.estado {
        case .aprobado: return paso.decidioNombre.map { "aprobó \($0)" } ?? "aprobado"
        case .rechazado: return "rechazado"
        case .pendiente: return "pendiente"
        case .enEspera: return "aún no le toca"
        }
    }
}

// MARK: - Cinta del resultado

/// Qué pasó con lo último que se firmó. Cuando el servidor dice que no, su texto
/// se enseña tal cual: es la única pista de por qué no pasó nada al pulsar.
private struct CintaDeDecision: View {
    let texto: String
    let fallo: Bool
    let onCerrar: () -> Void

    var body: some View {
        let tinta = fallo ? NxColors.danger : NxColors.success
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(fallo ? "La decisión no se registró" : "Listo")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(tinta)
                Text(texto)
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onCerrar) {
                Text("Cerrar")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(NxColors.fg2)
                    .padding(.horizontal, 12)
                    .nxTapTarget()
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 14)
        .padding(.trailing, 4)
        .padding(.vertical, 10)
        .background(
            fallo ? NxColors.dangerSoft : NxColors.successSoft,
            in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
        )
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Diálogo de rechazo

/// Rechazar cancela la instancia entera y avisa al solicitante con el motivo:
/// confirmación aparte del botón y motivo obligatorio. El diálogo repite qué y
/// de quién es (`AlertDialog` de Android: radio 20, relleno 24, velo del 32 %).
private struct DialogoDeRechazo: View {
    let fila: AprobacionesRules.Pendiente
    let onCancelar: () -> Void
    let onConfirmar: (String) -> Void

    @State private var motivo = ""
    @State private var visible = false

    private var valido: Bool { AprobacionesRules.motivoValido(motivo) }

    var body: some View {
        ZStack {
            Color.black.opacity(visible ? 0.32 : 0)
                .ignoresSafeArea()
                .onTapGesture { onCancelar() }
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 0) {
                Text("¿Rechazar \(fila.titulo)?")
                    .font(NxType.headlineSmall)
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 16)
                    .accessibilityAddTraits(.isHeader)

                VStack(alignment: .leading, spacing: 10) {
                    Text("La solicitud de \(fila.solicita) queda cancelada —no pasa al siguiente paso— "
                        + "y se le avisa con el motivo que escribas.")
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.fg2)
                        .fixedSize(horizontal: false, vertical: true)
                    if fila.importeCentavos != nil {
                        Text("Importe: \(fila.importe)")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                    }
                    FinanzasCampoContorno(
                        etiqueta: "Motivo",
                        texto: $motivo,
                        placeholder: "Ej. falta la factura del proveedor",
                        multilinea: true,
                        lineasMinimas: 2,
                        fondo: NxColors.card
                    )
                    .padding(.top, 6)
                }

                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    Button(action: onCancelar) {
                        Text("Cancelar")
                            .font(NxType.labelLarge)
                            .foregroundStyle(NxColors.fg2)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 40)
                    }
                    .buttonStyle(.plain)
                    Button {
                        onConfirmar(motivo.trimmingCharacters(in: .whitespacesAndNewlines))
                    } label: {
                        Text("Rechazar")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(valido ? NxColors.danger : NxColors.muted)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 40)
                    }
                    .buttonStyle(.plain)
                    .disabled(!valido)
                }
                .padding(.top, 24)
            }
            .padding(24)
            .frame(maxWidth: 560)
            .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
            .nxElevation(6)
            .padding(.horizontal, 24)
            .opacity(visible ? 1 : 0)
            .scaleEffect(visible ? 1 : 0.96)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.18)) { visible = true }
        }
    }
}
