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
    /// Evidencias en espera: lo que más le llega a dirección y a los encargados.
    @Published private(set) var evidencias = BandejaRules.Evidencias()
    /// Viáticos del equipo por autorizar; abren su pantalla.
    @Published private(set) var viaticos = 0
    /// Gastos por autorizar; abren su pantalla.
    @Published private(set) var gastos = 0
    /// Va en camino un lote. Bloquea también las decisiones sueltas.
    @Published private(set) var aprobandoLote = false

    private let repo = AprobacionesRepository.shared
    private var arrancado = false

    /// `hayDatos` es «hay filas»: una bandeja limpia cae en VACÍO y enseña la
    /// buena noticia, no una barra de filtros en ceros.
    var estadoPantalla: EstadoPantalla {
        if BandejaRules.hayAlgo(filas: filas.count, evidencias: evidencias, viaticos: viaticos, gastos: gastos) { return .contenido }
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
            // A varios mandos el flujo de firmas les contesta 403 y aun así tienen evidencias que
            // revisar: la bandeja solo falla si no se pudo leer ninguna de las dos.
            let revisiones = try? await CoreRepository.shared.revisionesPendientes()
            var firmas: [AprobacionesRules.Pendiente]?
            var fallaFirmas: Error?
            do {
                firmas = AprobacionesRules.ordenadas(try await repo.pendientes())
            } catch let problema {
                fallaFirmas = problema
            }
            if revisiones == nil, let fallaFirmas { throw fallaFirmas }
            viaticos = await contarViaticos()
            gastos = await contarGastos()
            evidencias = BandejaRules.separar(revisiones ?? [])
            filas = firmas ?? []
            cargando = false
            refrescando = false
            error = nil
            avisoRefresco = nil
        } catch let problema {
            // El mensaje del servidor viene rescatado: un 403 dice qué permiso falta.
            let mensaje = problema.toUserMessage(fallback: "No se pudieron cargar las aprobaciones")
            cargando = false
            refrescando = false
            if !BandejaRules.hayAlgo(filas: filas.count, evidencias: evidencias, viaticos: viaticos, gastos: gastos) {
                error = mensaje
            } else {
                avisoRefresco = mensaje
            }
        }
    }

    /// Lo de otras pantallas es un extra: si falla, esa fila no sale y la bandeja sigue.
    private func contarViaticos() async -> Int {
        guard ViaticoSesion.administra, let yo = ViaticoSesion.miId,
              let lista = try? await ViaticosRepository.shared.lista() else { return 0 }
        return lista.filter { $0.usuarioId != nil && $0.usuarioId != yo && $0.estaPendiente }.count
    }

    private func contarGastos() async -> Int {
        guard GastosRepository.administraGastos(),
              let lista = try? await GastosRepository.shared.lista() else { return 0 }
        return lista.filter(GastosRules.puedeAutorizar).count
    }

    /// Aprueba lo que te toca de un jalón; lo que no pasó se queda en la lista, con su motivo por separado.
    func aprobarLote(estrellas: Int, nota: String) {
        guard !aprobandoLote, decidiendo == nil else { return }
        let items = BandejaRules.loteDe(evidencias)
        guard !items.isEmpty, BandejaRules.calificacionValida(estrellas), BandejaRules.notaValida(nota) else { return }
        aprobandoLote = true
        errorDecision = nil
        avisoDecision = nil
        Task {
            do {
                let r = try await CoreRepository.shared.aprobarRevisionesLote(
                    items: items,
                    calificacion: estrellas,
                    observaciones: nota.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                avisoDecision = BandejaRules.mensajeLote(aprobadas: r.aprobadas?.count ?? 0, fallidas: r.fallidas?.count ?? 0)
            } catch let problema {
                errorDecision = problema.toUserMessage(fallback: "No se pudieron aprobar")
            }
            aprobandoLote = false
            await cargar(refresco: true)
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

// MARK: - Evidencias y lo que vive en otra pantalla

/// Lo que espera revisión: cuántas te tocan, las más viejas a la vista y un botón para el lote.
private struct SeccionEvidencias: View {
    let evidencias: BandejaRules.Evidencias
    let bloqueada: Bool
    let enviando: Bool
    let onLote: () -> Void

    var body: some View {
        let cuantas = BandejaRules.loteDe(evidencias).count
        let aLaVista = Array((evidencias.teTocan + evidencias.deOtros).prefix(BandejaRules.filasALaVista))
        let ahora = Date()
        VStack(alignment: .leading, spacing: 10) {
            Text("Evidencias")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(NxColors.fg)
            Text(BandejaRules.resumen(evidencias))
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
            if cuantas > 0 {
                Button(action: onLote) {
                    Group {
                        if enviando {
                            ProgressView()
                        } else {
                            Text(BandejaRules.textoBotonLote(cuantas)).fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(NxColors.brand)
                .disabled(bloqueada)
            }
            ForEach(aLaVista) { r in
                NavigationLink {
                    ActivityCoreDetailView(activityId: r.activityId, initialTab: "evidencias")
                        .nxBrandNavBar(title: "Actividad")
                } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(BandejaRules.titulo(r))
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(NxColors.fg)
                                .lineLimit(1)
                            Text(BandejaRules.detalle(r, ahora: ahora))
                                .font(.system(size: 12.5))
                                .foregroundStyle(NxColors.muted)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text("Revisar")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(NxColors.brandText)
                    }
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            let faltan = evidencias.total - aLaVista.count
            if faltan > 0 {
                Text("Y \(faltan) más. Las más viejas salen primero.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.muted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nxCardSurface(radius: 14)
    }
}

/// Lo que se autoriza en su propia pantalla: aquí solo se avisa cuántos esperan.
private struct FilaDeOtraPantalla: View {
    let titulo: String
    let detalle: String

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                Text(detalle)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("Abrir")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(NxColors.brandText)
        }
        .padding(14)
        .nxCardSurface(radius: 14)
    }
}

/// Las estrellas se eligen, como al revisar una sola; la nota se puede editar. Igual que en la web.
private struct HojaDeLote: View {
    let cuantas: Int
    let onConfirmar: (Int, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var estrellas = 0
    @State private var nota = BandejaRules.notaLote

    private var valido: Bool { BandejaRules.calificacionValida(estrellas) && BandejaRules.notaValida(nota) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 8) {
                        ForEach(1...5, id: \.self) { n in
                            Button {
                                estrellas = n
                            } label: {
                                Image(systemName: n <= estrellas ? "star.fill" : "star")
                                    .font(.system(size: 26))
                                    .foregroundStyle(n <= estrellas ? NxColors.brand : NxColors.muted)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(n) de 5 estrellas")
                        }
                    }
                } footer: {
                    Text("Cada persona recibe su aviso, con la misma calificación y la misma nota.")
                }
                Section("Nota") {
                    TextField("Nota", text: $nota, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle(BandejaRules.textoBotonLote(cuantas))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Aprobar") { onConfirmar(estrellas, nota) }
                        .disabled(!valido)
                }
            }
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
    @State private var pidiendoLote = false

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
        .sheet(isPresented: $pidiendoLote) {
            HojaDeLote(cuantas: BandejaRules.loteDe(modelo.evidencias).count) { estrellas, nota in
                pidiendoLote = false
                modelo.aprobarLote(estrellas: estrellas, nota: nota)
            }
        }
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
        if modelo.evidencias.total > 0 {
            SeccionEvidencias(
                evidencias: modelo.evidencias,
                bloqueada: modelo.aprobandoLote || modelo.decidiendo != nil,
                enviando: modelo.aprobandoLote,
                onLote: { pidiendoLote = true }
            )
        }
        if modelo.viaticos > 0 {
            NavigationLink {
                ViaticosView().nxBrandNavBar(title: CoreExtraModule.viaticos.title)
            } label: {
                FilaDeOtraPantalla(titulo: "Viáticos", detalle: "\(modelo.viaticos) por autorizar")
            }
            .buttonStyle(.plain)
        }
        if modelo.gastos > 0 {
            NavigationLink {
                GastosView().nxBrandNavBar(title: CoreExtraModule.gastos.title)
            } label: {
                FilaDeOtraPantalla(titulo: "Gastos", detalle: "\(modelo.gastos) por autorizar")
            }
            .buttonStyle(.plain)
        }
        if !todas.isEmpty {
            bandejaDeFirmas(todas)
        }
    }

    @ViewBuilder
    private func bandejaDeFirmas(_ todas: [AprobacionesRules.Pendiente]) -> some View {
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
