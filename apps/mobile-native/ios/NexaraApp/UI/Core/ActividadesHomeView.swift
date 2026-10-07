import SwiftUI

/// Última vista elegida en Actividades (misma clave que la web).
let coreActividadesVistaKey = "nx-actividades-vista"

/// A dónde lleva un toque dentro de Actividades. Se empuja en la misma pila y
/// quien empuja le pone la barra teal (`nxBrandNavBar`).
enum ActividadesRuta: Hashable {
    case actividad(id: Int, tab: String?)
    case persona(id: Int, nombre: String)

    @MainActor @ViewBuilder
    func destino(myId: Int?) -> some View {
        switch self {
        case .actividad(let id, let tab):
            ActivityCoreDetailView(activityId: id, initialTab: tab)
                .nxBrandNavBar()
        case .persona(let id, let nombre):
            TeamMemberDetailView(userId: id, nombre: nombre, isSelf: id == myId)
                .nxBrandNavBar()
        }
    }
}

/// «Actividades» (Android `ActividadesScreen`):
/// - CEO: solo la pizarra del equipo (asigna, no ejecuta).
/// - Con gente a su cargo: pestañas «Mis actividades» / «Mi equipo» (se recuerda la última).
/// - Los demás: su lista directo, sin esperar a la pizarra.
/// Arriba, los cumpleaños y aniversarios del día.
struct ActividadesHomeView: View {
    static let vistaMias = "mias"
    static let vistaEquipo = "equipo"

    @ObservedObject private var session = SessionStore.shared
    @AppStorage(coreActividadesVistaKey) private var vista: String = ActividadesHomeView.vistaMias
    @State private var board: TeamBoardResponse?
    @State private var boardError: String?
    @State private var boardLoading = true
    /// Contrato C: Hoy · Semana · Mes para la pizarra y para «Asignadas por mí».
    @State private var rango: ActividadesRango = .hoy
    @State private var asignadasPorMi: [BoardAsignadaPorMi] = []
    @State private var ruta: ActividadesRuta?

    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    /// En demo la persona ve «Mis actividades» y «Mi equipo» (no solo la pizarra de dirección).
    private var isCeo: Bool { !DemoMode.isActive && CoreOrg.isCeo(session.currentUser?.email) }

    /// Uno mismo primero.
    private var users: [TeamBoardUser] {
        let list = board?.users ?? []
        guard let myId else { return list }
        return list.filter { $0.id == myId } + list.filter { $0.id != myId }
    }

    private var equipoElegido: Bool { vista == Self.vistaEquipo }
    private var conPestanas: Bool { !isCeo && users.contains { $0.id != myId } }
    private var cargandoEquipo: Bool { !isCeo && board == nil && boardError == nil }
    private var viendoEquipo: Bool { isCeo || (conPestanas && equipoElegido) }
    private var verMias: Bool { !isCeo && (!conPestanas || !equipoElegido) }

    private var vistaSeleccion: Binding<String> {
        Binding(
            get: { equipoElegido ? Self.vistaEquipo : Self.vistaMias },
            set: { vista = $0 }
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            CelebracionesBanner()
            if conPestanas {
                NxUnderlineTabs(
                    tabs: [
                        NxUnderlineTab(id: Self.vistaMias, title: "Mis actividades", systemImage: "checkmark.seal"),
                        NxUnderlineTab(id: Self.vistaEquipo, title: "Mi equipo", systemImage: "person.2"),
                    ],
                    selection: vistaSeleccion
                )
            }
            contenido
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(NxColors.surface)
        .task(id: rango) { await cargarPizarra() }
        // La pizarra se actualiza sola cada 30 s mientras se está viendo, en el rango elegido.
        .task(id: viendoEquipo ? rango.rawValue : "") {
            guard viendoEquipo else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                if Task.isCancelled { break }
                await refrescarPizarra()
            }
        }
        .navigationDestination(item: $ruta) { destino in
            destino.destino(myId: myId)
        }
    }

    @ViewBuilder
    private var contenido: some View {
        if cargandoEquipo && equipoElegido {
            // Solo quien volvió a «Mi equipo» espera a la pizarra.
            ScrollView {
                NxSkeletonList(itemCount: 4, itemHeight: 96)
                    .padding(16)
            }
        } else if verMias {
            MisActividadesView(
                onOpenActivity: { id, tab in ruta = .actividad(id: id, tab: tab) },
                onOpenPerson: { id in ruta = .persona(id: id, nombre: nombre(de: id)) }
            )
        } else {
            TeamBoardView(
                users: users,
                meId: myId,
                loading: boardLoading,
                error: boardError,
                rango: $rango,
                asignadasPorMi: asignadasPorMi,
                onRefresh: { await cargarPizarra() },
                onOpenPerson: { user in ruta = .persona(id: user.id, nombre: user.nombre) },
                onOpenActivity: { id in ruta = .actividad(id: id, tab: nil) }
            )
        }
    }

    private func nombre(de id: Int) -> String {
        users.first { $0.id == id }?.nombre ?? session.currentUser?.nombre ?? ""
    }

    @MainActor
    private func cargarPizarra() async {
        boardLoading = true
        let (desde, hasta) = ActividadesRango.fechas(rango)
        do {
            board = try await CoreRepository.shared.teamBoard(desde: desde, hasta: hasta)
            boardError = nil
        } catch {
            if Task.isCancelled { return }
            boardError = error.toUserMessage(fallback: "No se pudo cargar Actividades")
        }
        boardLoading = false
        // El endpoint puede no existir todavía: sin lista, la sección no aparece.
        asignadasPorMi = (try? await CoreRepository.shared.boardAsignadasPorMi(desde: desde, hasta: hasta)) ?? []
    }

    /// Refresco silencioso: sin red se queda la última pizarra.
    @MainActor
    private func refrescarPizarra() async {
        let (desde, hasta) = ActividadesRango.fechas(rango)
        if let nuevo = try? await CoreRepository.shared.teamBoard(desde: desde, hasta: hasta) {
            board = nuevo
        }
    }
}

// MARK: - Pizarra del equipo

/// Android `TeamBoardContent`: rango y filtros en la MISMA fila, tira de cifras
/// que también filtra, «Para atender hoy» (solo con «Hoy»), rejilla de personas y
/// «Asignadas por mí».
struct TeamBoardView: View {
    let users: [TeamBoardUser]
    let meId: Int?
    let loading: Bool
    let error: String?
    @Binding var rango: ActividadesRango
    let asignadasPorMi: [BoardAsignadaPorMi]
    let onRefresh: () async -> Void
    let onOpenPerson: (TeamBoardUser) -> Void
    let onOpenActivity: (Int) -> Void

    /// Aro elegido en la barra; nil = todos.
    @State private var filtro: ActividadesAro?

    private var estado: ActividadesPantalla {
        .de(cargando: loading, error: error, hayDatos: !users.isEmpty)
    }

    private var visibles: [TeamBoardUser] { ActividadesEquipo.filtrar(users, filtro) }

    private var rangoIndice: Int { ActividadesRango.allCases.firstIndex(of: rango) ?? 0 }

    var body: some View {
        VStack(spacing: 0) {
            NxFilterBar {
                NxSegmented(
                    options: ActividadesRango.allCases.map(\.etiqueta),
                    selectedIndex: rangoIndice,
                    onSelect: { i in rango = ActividadesRango.allCases[i] }
                )
                ForEach(ActividadesEquipo.filtros(users), id: \.etiqueta) { f in
                    NxFilterPill(label: f.etiqueta, count: f.conteo, selected: filtro == f.aro, color: f.color) {
                        // Tocar el filtro activo vuelve a «Todos».
                        filtro = filtro == f.aro ? nil : f.aro
                    }
                }
            }
            .padding(.vertical, 10)

            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    contenido
                    asignadas
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 16)
            }
            .refreshable { await onRefresh() }
        }
    }

    @ViewBuilder
    private var contenido: some View {
        switch estado {
        case .cargando:
            NxSkeletonList(itemCount: 4, itemHeight: 96)
        case .error:
            NxErrorBlock(message: error) { Task { await onRefresh() } }
        case .vacio:
            NxEmptyState(
                title: "Nadie en tu equipo por ahora",
                subtitle: "Cuando alguien quede a tu cargo aparecerá aquí.",
                actionLabel: "Actualizar",
                onAction: { Task { await onRefresh() } }
            )
        case .contenido:
            NxMetricStrip(
                items: ActividadesEquipo.metricas(users),
                seleccion: filtro?.clave,
                onSelect: { clave in
                    let aro = ActividadesAro.allCases.first { $0.clave == clave }
                    filtro = filtro == aro ? nil : aro
                }
            )
            // «Desde hace cuánto» es de hoy: con otros rangos el panel no aplica (web).
            if rango == .hoy {
                AtencionEquipoPanel(users: users, onOpenPerson: onOpenPerson)
            }
            if visibles.isEmpty {
                NxEmptyState(
                    title: "Nadie en «\(filtro?.etiqueta ?? "")»",
                    subtitle: "Nadie de tu equipo está en ese estado ahora.",
                    actionLabel: "Ver a todos",
                    onAction: { filtro = nil }
                )
            } else {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 150), spacing: 10, alignment: .top)],
                    spacing: 10
                ) {
                    ForEach(visibles) { user in
                        Button { onOpenPerson(user) } label: {
                            PersonBoardCard(user: user, meId: meId)
                        }
                        .buttonStyle(NxPressableStyle())
                    }
                }
            }
        }
    }

    /// Contrato C: lo que yo asigné en el rango, con persona, estado y semáforo.
    @ViewBuilder
    private var asignadas: some View {
        if !asignadasPorMi.isEmpty {
            NxDenseSectionHeader(
                title: "Asignadas por mí (\(asignadasPorMi.count))",
                hint: "Lo que repartiste \(Self.primeraMinuscula(ActividadesRango.descripcion(rango)))."
            )
            .padding(.top, 6)
            // Una sola superficie con filas separadas por una línea: no doce tarjetas.
            VStack(spacing: 0) {
                ForEach(Array(asignadasPorMi.enumerated()), id: \.element.id) { i, a in
                    if i > 0 {
                        Rectangle().fill(NxColors.borderSubtle).frame(height: 1)
                    }
                    Button { onOpenActivity(a.id) } label: {
                        AsignadaPorMiRow(a: a)
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(NxColors.card)
            .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(NxColors.border, lineWidth: 1)
            )
        }
    }

    private static func primeraMinuscula(_ texto: String) -> String {
        texto.prefix(1).lowercased() + texto.dropFirst()
    }
}

/// Una actividad que yo repartí: a quién, cómo va y su semáforo.
private struct AsignadaPorMiRow: View {
    let a: BoardAsignadaPorMi

    private var titulo: String {
        let partes = [a.anNumber, a.titulo].compactMap { ActividadesTexto.limpio($0) }
        return partes.isEmpty ? "Actividad #\(a.id)" : partes.joined(separator: " · ")
    }

    private var planReal: String? {
        ActividadesSemaforo.planRealTexto(plan: a.minutosPlan?.value, real: a.minutosReales?.value)
    }

    private var sinIniciar: Bool {
        ActividadesSemaforo.sinIniciar(aceptacion: a.aceptacion, inicioRealAt: a.inicioRealAt, estatus: a.estatus)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(titulo)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            if let quien = ActividadesTexto.limpio(a.quien?.nombre) {
                ActLineaIcono(systemName: "person", text: CoreFormat.shortName(quien))
            }
            ActividadesFlow {
                if let luz = ActividadesSemaforo.luz(a.semaforo) {
                    NxStatusDot(text: luz.etiqueta, color: ActividadesUx.colorSemaforo(a.semaforo))
                }
                NxStatusDot(text: CoreStatusUI.estatus(a.estatus).label, color: ActividadesUx.colorEstatus(a.estatus))
                if sinIniciar {
                    NxStatusDot(text: ActividadesSemaforo.chipSinIniciar, color: NxColors.naranja)
                }
                if let planReal {
                    Text(planReal)
                        .font(.system(size: 12.5))
                        .foregroundStyle(a.excedida == true ? NxColors.rojo : NxColors.muted)
                        .lineLimit(1)
                }
            }
            if ActividadesSemaforo.fueRechazada(a.aceptacion) {
                Text(ActividadesSemaforo.rechazadaTexto(a.motivoRechazo))
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.rojo)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

// MARK: - Para atender hoy (web `AtencionEquipo`, Android `ParaAtenderHoy`)

/// Debajo de la tira de cifras y solo con «Hoy»: a quién hay que ir a ver y por qué.
/// Tres grupos que se apilan —atrasados con su actividad y el motivo, a quién dejaron
/// sin nada asignado (desde cuándo y qué fue lo último que terminó) y quién no ha
/// checado entrada—, cada uno en la misma superficie con filas que «Asignadas por mí»
/// y con cinco renglones antes de «Ver N más». Un grupo vacío no se pinta; si nadie
/// pide atención, la sección tampoco. Tocar un renglón abre a la persona.
private struct AtencionEquipoPanel: View {
    let users: [TeamBoardUser]
    let onOpenPerson: (TeamBoardUser) -> Void

    var body: some View {
        let grupos = AtencionGrupoDatos.de(ActividadesEquipo.atencion(users))
        if !grupos.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                NxDenseSectionHeader(title: "Para atender hoy")
                ForEach(grupos) { grupo in
                    AtencionGrupo(grupo: grupo, onOpenPerson: onOpenPerson)
                }
            }
            .padding(.top, 6)
        }
    }
}

/// Un renglón del panel, ya dicho en palabras.
private struct AtencionRenglon: Identifiable {
    let persona: TeamBoardUser
    let principal: String
    /// nil = tinta normal.
    var principalColor: Color? = nil
    var secundaria: String? = nil
    /// nil = el gris de siempre.
    var secundariaColor: Color? = nil
    /// Dato corto a la derecha del nombre («hace 2 días»).
    var meta: String? = nil

    var id: Int { persona.id }
}

/// Un grupo del panel: título, el color de su punto (nil = gris) y sus renglones.
private struct AtencionGrupoDatos: Identifiable {
    let clave: String
    let titulo: String
    let color: Color?
    let renglones: [AtencionRenglon]

    var id: String { clave }

    /// Atrasados (lo suyo y el atraso en rojo), sin nada asignado (su jornada en ámbar
    /// y lo último que terminó) y sin entrada hoy (lo último y hace cuánto). Los vacíos
    /// no salen.
    static func de(_ a: ActividadesEquipo.Atencion) -> [AtencionGrupoDatos] {
        let atrasados = a.atrasados.map { x -> AtencionRenglon in
            AtencionRenglon(
                persona: x.persona,
                principal: x.actividad.isEmpty ? "Actividad sin datos" : x.actividad,
                secundaria: x.detalle,
                secundariaColor: NxColors.rojo
            )
        }
        let sinNada = a.sinNada.map { x -> AtencionRenglon in
            if let jornada = x.jornada {
                return AtencionRenglon(
                    persona: x.persona,
                    principal: jornada,
                    principalColor: NxColors.naranja,
                    secundaria: x.ultima
                )
            }
            // API vieja: no se sabe desde cuándo; queda lo último que terminó.
            return AtencionRenglon(persona: x.persona, principal: x.ultima)
        }
        let sinEntrada = a.sinEntrada.map { x -> AtencionRenglon in
            AtencionRenglon(persona: x.persona, principal: x.ultima, meta: x.haceCuanto)
        }
        return [
            AtencionGrupoDatos(clave: "atrasados", titulo: "Atrasados", color: NxColors.rojo, renglones: atrasados),
            AtencionGrupoDatos(clave: "sin-nada", titulo: "Sin nada asignado", color: NxColors.naranja, renglones: sinNada),
            AtencionGrupoDatos(clave: "sin-entrada", titulo: "Sin entrada hoy", color: nil, renglones: sinEntrada),
        ].filter { !$0.renglones.isEmpty }
    }
}

/// Un grupo: punto y palabra con cuántos son, sus renglones separados por una línea y
/// «Ver N más» / «Ver menos».
private struct AtencionGrupo: View {
    let grupo: AtencionGrupoDatos
    let onOpenPerson: (TeamBoardUser) -> Void

    @State private var todos = false
    private static let visibles = 5

    private var forma: RoundedRectangle { RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous) }

    var body: some View {
        let vista = todos ? grupo.renglones : Array(grupo.renglones.prefix(Self.visibles))
        let resto = grupo.renglones.count - Self.visibles
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 8) {
                NxStatusDot(text: grupo.titulo, color: grupo.color, fontSize: 13, fontWeight: .bold)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(grupo.renglones.count)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(NxColors.muted)
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 10)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            ForEach(vista) { renglon in
                NxRowDivider()
                Button { onOpenPerson(renglon.persona) } label: {
                    AtencionFila(renglon: renglon)
                }
                .buttonStyle(.plain)
            }
            if resto > 0 {
                NxRowDivider()
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { todos.toggle() }
                } label: {
                    Text(todos ? "Ver menos" : "Ver \(resto) más")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(NxColors.brand)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(NxColors.card)
        .clipShape(forma)
        .overlay(forma.strokeBorder(NxColors.border, lineWidth: 1))
    }
}

private struct AtencionFila: View {
    let renglon: AtencionRenglon

    var body: some View {
        let p = renglon.persona
        HStack(alignment: .top, spacing: 10) {
            NxAvatar(nombre: p.nombre, url: p.avatarUrl, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .center, spacing: 8) {
                    Text(p.nombre.isEmpty ? "—" : p.nombre)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let meta = renglon.meta {
                        Text(meta)
                            .font(.system(size: 12))
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(1)
                    }
                }
                Text(renglon.principal)
                    .font(.system(size: 12.5, weight: renglon.principalColor != nil ? .semibold : .regular))
                    .foregroundStyle(renglon.principalColor ?? NxColors.fg)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let secundaria = renglon.secundaria {
                    Text(secundaria)
                        .font(.system(size: 12, weight: renglon.secundariaColor != nil ? .semibold : .regular))
                        .foregroundStyle(renglon.secundariaColor ?? NxColors.muted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Abre el día de \(CoreFormat.shortName(p.nombre))")
    }
}

/// Una persona en la pizarra: el aro de color dice el estado, y debajo se lee en
/// dos renglones qué está haciendo y en qué situación está.
private struct PersonBoardCard: View {
    let user: TeamBoardUser
    let meId: Int?

    private var aro: ActividadesAro { ActividadesEquipo.aro(user.status) }
    private var esYo: Bool { meId != nil && user.id == meId }
    private var marcas: [ActividadesEquipo.Marca] { ActividadesEquipo.marcas(user, meId: meId) }
    private var forma: RoundedRectangle { RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous) }

    var body: some View {
        VStack(spacing: 6) {
            // El aro ES el estado: no hace falta además un punto, una pastilla y una leyenda.
            NxAvatar(nombre: user.nombre, url: user.avatarUrl, size: 58)
                .padding(4)
                .overlay(Circle().strokeBorder(aro.color, lineWidth: 3))
            Text(user.nombre.isEmpty ? "—" : user.nombre)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .lineLimit(1)
            if let puesto = ActividadesTexto.limpio(user.puesto) {
                Text(puesto)
                    .font(.system(size: 11))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
            }
            Text(ActividadesEquipo.queHace(user))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(NxColors.fg)
                .lineLimit(2)
            Text(ActividadesEquipo.contexto(user))
                .font(.system(size: 11))
                .foregroundStyle(aro == .retraso ? aro.color : NxColors.muted)
                .lineLimit(2)
            // Sin nada abierto: folio y cuándo terminó lo último («Última: AN-0091 · ayer 18:11»).
            if let ultima = ActividadesEquipo.ultimaEnTarjeta(user) {
                Text(ultima)
                    .font(.system(size: 11))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
            }
            // El avance de lo que trae entre manos: es dato, no adorno.
            if let pct = user.openActivities?.first?.progressPct {
                ActBarraAvance(pct: pct)
            }
            if !marcas.isEmpty {
                HStack(spacing: 8) {
                    ForEach(marcas, id: \.texto) { marca in
                        NxStatusDot(text: marca.texto, color: marca.color, fontSize: 11)
                    }
                }
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 10)
        .padding(.vertical, 14)
        .background(NxColors.card, in: forma)
        .overlay(forma.strokeBorder(esYo ? NxColors.brand.opacity(0.55) : NxColors.border, lineWidth: 1))
        .contentShape(forma)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Abre el día de \(esYo ? "ti" : CoreFormat.shortName(user.nombre))")
    }
}

// MARK: - Día de una persona (GET me/board/:userId + history)

/// Android `BoardPersonScreen`: cabecera con aro de estado, rango, KPI, tres
/// cifras del día, lo que trae en curso, el reloj de sus actividades, despachos
/// pendientes (uno mismo), historial y «Asignar actividad».
struct TeamMemberDetailView: View {
    let userId: Int
    let nombre: String
    var isSelf: Bool = false

    @ObservedObject private var session = SessionStore.shared
    @State private var member: TeamBoardUser?
    @State private var history: [TeamBoardHistoryItem] = []
    @State private var loading = true
    @State private var error: String?
    @State private var rango: ActividadesRango = .hoy
    @State private var expandedId: Int?
    @State private var avisoPausa: String?
    @State private var notice: String?
    @State private var ruta: ActividadesRuta?
    @State private var asignando = false

    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }

    var body: some View {
        Group {
            if let member {
                contenido(member)
            } else if loading {
                ScrollView {
                    NxSkeletonList(itemCount: 4, itemHeight: 96)
                        .padding(16)
                }
            } else {
                NxErrorState(message: error ?? "No se encontró a esta persona.") {
                    Task { await load() }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NxColors.surface)
        .navigationTitle(CoreFormat.shortName(member?.nombre ?? nombre))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: rango) {
            await load()
            // Se actualiza sola cada 30 s mientras está a la vista.
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                if Task.isCancelled { break }
                await load()
            }
        }
        .navigationDestination(item: $ruta) { destino in
            destino.destino(myId: myId)
        }
        .navigationDestination(isPresented: $asignando) {
            CoreAssignActivityView(userId: userId) { message in
                notice = message
                Task { await load() }
            }
            .nxBrandNavBar()
        }
    }

    private func contenido(_ p: TeamBoardUser) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let error {
                    NxRefreshErrorBanner(
                        message: error,
                        onRetry: { Task { await load() } },
                        onDismiss: { self.error = nil }
                    )
                }
                if let notice {
                    NxIconText(systemName: "checkmark.circle.fill", text: notice, tint: NxColors.verde)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(NxColors.verde)
                }
                cabecera(p)
                ActRangoSelector(rango: $rango)
                kpis(p)
                cifras(p)
                enCurso(p)
                pausas(p)
                if isSelf {
                    DespachoPendingPanel(
                        managerEmail: session.currentUser?.email ?? p.email,
                        managerUserId: p.id,
                        pending: p.openActivities ?? [],
                        onDone: { Task { await load() } }
                    )
                }
                historial(p)
                if !isSelf {
                    NxPrimaryButton("Asignar actividad") { asignando = true }
                }
                Color.clear.frame(height: 24)
            }
            .padding(16)
        }
        .refreshable { await load() }
    }

    private func cabecera(_ p: TeamBoardUser) -> some View {
        let color = ActividadesTexto.colorPizarra(p.status)
        return NxPanelShell {
            HStack(alignment: .center, spacing: 16) {
                NxAvatar(nombre: p.nombre, url: p.avatarUrl, size: 80)
                VStack(alignment: .leading, spacing: 0) {
                    Text(p.nombre.isEmpty ? "—" : p.nombre)
                        .font(.system(size: 22, weight: .heavy))
                        .foregroundStyle(NxColors.fg)
                    Text(ActividadesTexto.limpio(p.puesto) ?? (p.email ?? ""))
                        .font(.system(size: 13.5))
                        .foregroundStyle(NxColors.muted)
                    HStack(spacing: 8) {
                        Circle().fill(color).frame(width: 10, height: 10)
                        Text(ActividadesTexto.estadoTexto(p))
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(color)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(color.opacity(0.14), in: Capsule())
                    .padding(.top, 8)
                    ActEstadoExtras(user: p)
                        .padding(.top, 6)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    /// Contrato C: a tiempo, eficiencia, productividad y cerradas del rango.
    @ViewBuilder
    private func kpis(_ p: TeamBoardUser) -> some View {
        let tiles = ActividadesKpis.tiles(p.kpis)
        if !tiles.isEmpty {
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)],
                spacing: 8
            ) {
                ForEach(tiles, id: \.etiqueta) { tile in
                    ActKpiTile(tile: tile)
                }
            }
        }
    }

    private func cifras(_ p: TeamBoardUser) -> some View {
        HStack(alignment: .top, spacing: 8) {
            ActPersonStat(
                label: "Entrada hoy",
                value: p.clockInAt != nil ? ActividadesTexto.hora(p.clockInAt) : "Sin entrada",
                hint: p.clockInAt != nil ? "Check-in" : "Sin registro"
            )
            ActPersonStat(
                label: "Tiempo en sitio",
                value: ActividadesTexto.minutosPizarra(p.workedMinutes),
                hint: "Desde la entrada"
            )
            ActPersonStat(
                label: "En actividad",
                value: ActividadesTexto.minutosPizarra(p.activityElapsedMinutes),
                hint: p.activityStartedAt != nil ? "Desde \(ActividadesTexto.hora(p.activityStartedAt))" : "Sin actividad"
            )
        }
    }

    private func enCurso(_ p: TeamBoardUser) -> some View {
        NxPanelShell {
            Text("ACTIVIDAD EN CURSO")
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(NxColors.muted)
                .padding(.bottom, 6)
            if let act = p.currentActivity {
                if let folio = ActividadesTexto.limpio(act.anNumber) {
                    Text(folio)
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(NxColors.fg)
                }
                Text(act.titulo ?? "")
                    .font(.system(size: 16))
                    .foregroundStyle(NxColors.fg)
                if ActividadesTexto.limpio(act.estatus) != nil {
                    NxStatusDot(text: CoreStatusUI.estatus(act.estatus).label, color: ActividadesUx.colorEstatus(act.estatus))
                        .padding(.top, 6)
                }
                Button { ruta = .actividad(id: act.id, tab: nil) } label: {
                    Text("Abrir actividad →")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(NxColors.brand)
                        .frame(minHeight: 48)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Text("Sin actividad abierta en este momento.")
                    .font(.system(size: 14))
                    .foregroundStyle(NxColors.muted)
            }
        }
    }

    /// Su jefe (o el CEO) le pausa una actividad con el reloj corriendo, con motivo.
    @ViewBuilder
    private func pausas(_ p: TeamBoardUser) -> some View {
        let conReloj = (p.openActivities ?? []).filter { $0.enCurso == true || $0.enPausa == true }
        if !isSelf && p.puedePausar == true && (!conReloj.isEmpty || avisoPausa != nil) {
            NxPanelShell(spacing: 6) {
                if let avisoPausa {
                    Text(avisoPausa)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(NxColors.verde)
                }
                PausarDeEquipoSection(userId: p.id, nombre: p.nombre, actividades: conReloj) { mensaje in
                    avisoPausa = mensaje
                    Task { await load() }
                }
            }
        }
    }

    @ViewBuilder
    private func historial(_ p: TeamBoardUser) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("HISTORIAL DE ACTIVIDADES")
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(NxColors.muted)
            Text(ActividadesRango.descripcion(rango))
                .font(.system(size: 12))
                .foregroundStyle(NxColors.muted)
        }
        if history.isEmpty {
            Text("Sin historial todavía.")
                .font(.system(size: 14))
                .foregroundStyle(NxColors.muted)
        }
        ForEach(history) { h in
            ActHistorialCard(
                h: h,
                abierta: expandedId == h.id,
                onToggle: { expandedId = expandedId == h.id ? nil : h.id },
                onOpen: { ruta = .actividad(id: h.id, tab: nil) }
            )
        }
    }

    @MainActor
    private func load() async {
        loading = true
        defer { loading = false }
        let (desde, hasta) = ActividadesRango.fechas(rango)
        do {
            async let memberTask = CoreRepository.shared.teamBoardUser(userId: userId, desde: desde, hasta: hasta)
            async let historyTask = CoreRepository.shared.teamBoardHistory(userId: userId, desde: desde, hasta: hasta)
            member = try await memberTask
            // Si el historial falla en un refresco, se queda el que ya se veía.
            if let nuevo = try? await historyTask {
                history = nuevo
            }
            error = nil
        } catch {
            if Task.isCancelled { return }
            self.error = error.toUserMessage(fallback: "No se pudo cargar el perfil")
        }
    }
}

/// Bajo el estado: a qué hora terminó (libre) y las marcas de corrección y espera
/// (Android `BoardStatusExtras`).
private struct ActEstadoExtras: View {
    let user: TeamBoardUser

    private var fin: TeamBoardLastFinished? { user.status == "libre" ? user.lastFinished : nil }
    private var enCorreccion: Int { user.enCorreccion ?? 0 }
    private var enEspera: Int { user.enEsperaAprobacion ?? 0 }

    var body: some View {
        if fin != nil || enCorreccion > 0 || enEspera > 0 {
            VStack(alignment: .leading, spacing: 6) {
                if let fin {
                    Text(ActividadesTexto.terminoTexto(finishedAt: fin.finishedAt, lateMinutes: fin.lateMinutes))
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle((fin.lateMinutes ?? 0) > 0 ? NxColors.rojo : NxColors.verde)
                }
                if enCorreccion > 0 || enEspera > 0 {
                    ActividadesFlow(horizontal: 4, vertical: 4) {
                        if enCorreccion > 0 {
                            NxChip(text: "Corrigiendo evidencia", color: NxColors.naranja, systemImage: "arrow.uturn.backward")
                        }
                        if enEspera > 0 {
                            NxChip(text: ActividadesTexto.enEsperaTexto(enEspera), color: NxColors.morado)
                        }
                    }
                }
            }
        }
    }
}

/// Hoy · Semana · Mes de la pizarra de una persona; lo elegido va como `desde`/`hasta`.
private struct ActRangoSelector: View {
    @Binding var rango: ActividadesRango

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                ForEach(ActividadesRango.allCases) { opcion in
                    boton(opcion)
                }
            }
            .padding(4)
            .background(NxColors.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(NxColors.border, lineWidth: 1)
            )
            Text(ActividadesRango.descripcion(rango))
                .font(.system(size: 11.5))
                .foregroundStyle(NxColors.muted)
        }
    }

    private func boton(_ opcion: ActividadesRango) -> some View {
        let on = opcion == rango
        return Button { rango = opcion } label: {
            Text(opcion.etiqueta)
                .font(.system(size: 13.5, weight: on ? .heavy : .semibold))
                .foregroundStyle(on ? Color.white : NxColors.fg)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(on ? NxColors.brand : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? AccessibilityTraits.isSelected : [])
    }
}

/// Un número de la tira de KPI (a tiempo, eficiencia, productividad, cerradas).
private struct ActKpiTile: View {
    let tile: ActividadesKpis.Tile

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(tile.etiqueta)
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundStyle(NxColors.muted)
                .lineLimit(1)
            Text(tile.valor)
                .font(.system(size: 20, weight: .heavy))
                .foregroundStyle(tile.color)
                .lineLimit(1)
            Text(tile.pie)
                .font(.system(size: 11))
                .foregroundStyle(NxColors.muted)
                .lineLimit(2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                .strokeBorder(tile.color.opacity(0.3), lineWidth: 1)
        )
    }
}

private struct ActPersonStat: View {
    let label: String
    let value: String
    let hint: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundStyle(NxColors.muted)
                .lineLimit(1)
            Text(value)
                .font(.system(size: 18, weight: .heavy))
                .foregroundStyle(NxColors.fg)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(hint)
                .font(.system(size: 11))
                .foregroundStyle(NxColors.muted)
                .lineLimit(2)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }
}

/// Una actividad del historial: se toca para ver lo que capturó.
private struct ActHistorialCard: View {
    let h: TeamBoardHistoryItem
    let abierta: Bool
    let onToggle: () -> Void
    let onOpen: () -> Void

    private var titulo: String {
        [h.anNumber, h.titulo].compactMap { ActividadesTexto.limpio($0) }.joined(separator: " · ")
    }

    private var subtitulo: String {
        let partes: [String?] = [
            ActividadesTexto.limpio(h.estatus),
            h.evidence?.progressPct.map { "avance \(Int($0.rounded()))%" },
            ActividadesTexto.limpio(h.coreKind).map { CoreStatusUI.kind($0, ticketTypeCustom: h.ticketTypeCustom) },
            ActividadesEquipo.cargaTexto(h.assignmentCharge),
        ]
        return partes.compactMap { $0 }.joined(separator: " · ")
    }

    private var planReal: String? {
        ActividadesSemaforo.planRealTexto(plan: h.minutosPlan?.value, real: h.minutosReales?.value)
    }

    private var luz: ActividadesSemaforo.Luz? { ActividadesSemaforo.luz(h.semaforo) }

    private var entradas: [(label: String, value: String)] {
        ActividadesTexto.formEntries(h.evidence?.serviceSheetData, coreKind: h.coreKind)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onToggle) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(titulo.isEmpty ? "Actividad #\(h.id)" : titulo)
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(NxColors.fg)
                        .multilineTextAlignment(.leading)
                    if !subtitulo.isEmpty {
                        Text(subtitulo)
                            .font(.system(size: 12))
                            .foregroundStyle(NxColors.muted)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if h.retirado == true || luz != nil || planReal != nil {
                ActividadesFlow(horizontal: 6, vertical: 6) {
                    // Contrato C: sigue en su historial aunque la hayan sacado de la actividad.
                    if h.retirado == true {
                        NxChip(text: "Retirado", color: NxColors.morado)
                    }
                    if let luz {
                        NxChip(text: luz.etiqueta, color: luz.color, dot: true)
                    }
                    if let planReal {
                        NxChip(text: planReal, color: ActividadesSemaforo.planRealColor(excedida: h.excedida))
                    }
                }
            }
            if abierta {
                if h.evidence != nil {
                    ForEach(Array(entradas.enumerated()), id: \.offset) { _, entrada in
                        (Text("\(entrada.label): ").bold() + Text(entrada.value))
                            .font(.system(size: 13))
                            .foregroundStyle(NxColors.fg)
                    }
                } else {
                    Text("Sin evidencia de esta persona.")
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.muted)
                }
                Button(action: onOpen) {
                    Text("Abrir actividad →")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(NxColors.brand)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }
}

// MARK: - Piezas compartidas de Actividades

/// Ícono de 15 y texto de 12,5 gris en una línea (Android `NxIconText` de las tarjetas).
struct ActLineaIcono: View {
    let systemName: String
    let text: String
    var color: Color = NxColors.muted
    var fontSize: CGFloat = 12.5
    var lineLimit: Int? = nil
    /// Tinte propio del ícono (la palomita verde de «Hechas hoy»); nil = el del texto.
    var iconColor: Color? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Image(systemName: systemName)
                .font(.system(size: fontSize))
                .foregroundStyle(iconColor ?? color)
                .accessibilityHidden(true)
            Text(text)
                .font(.system(size: fontSize))
                .foregroundStyle(color)
                .lineLimit(lineLimit)
                .multilineTextAlignment(.leading)
        }
    }
}

/// Texto con una línea vertical a la izquierda: agrupa sin dibujar otra caja.
struct ActNotaConMargen: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(NxColors.fg2)
            .lineSpacing(3)
            .padding(.leading, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .leading) {
                Rectangle().fill(NxColors.borderStrong).frame(width: 2)
            }
    }
}

/// Barra de avance de 4 (verde al 100 %, de marca antes).
struct ActBarraAvance: View {
    let pct: Double

    private var valor: Double { min(max(pct, 0), 100) }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(NxColors.borderSubtle)
                Capsule()
                    .fill(valor >= 100 ? NxColors.verde : NxColors.brand)
                    .frame(width: geo.size.width * valor / 100)
            }
        }
        .frame(height: 4)
        .accessibilityLabel("Avance \(Int(valor)) %")
    }
}

/// Fila que salta de renglón (Android `FlowRow`): separación horizontal y
/// vertical por separado, alineada a la izquierda.
struct ActividadesFlow: Layout {
    var horizontal: CGFloat = 14
    var vertical: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        acomodo(ancho: proposal.width ?? .infinity, subviews: subviews).tamano
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let r = acomodo(ancho: bounds.width, subviews: subviews)
        for (indice, subview) in subviews.enumerated() {
            let punto = r.puntos[indice]
            subview.place(
                at: CGPoint(x: bounds.minX + punto.x, y: bounds.minY + punto.y),
                proposal: ProposedViewSize(r.tamanos[indice])
            )
        }
    }

    private func acomodo(ancho maximo: CGFloat, subviews: Subviews) -> (puntos: [CGPoint], tamanos: [CGSize], tamano: CGSize) {
        var puntos: [CGPoint] = []
        var tamanos: [CGSize] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var altoFila: CGFloat = 0
        var anchoMax: CGFloat = 0
        for subview in subviews {
            var t = subview.sizeThatFits(ProposedViewSize(width: maximo, height: nil))
            t.width = min(t.width, maximo)
            if x > 0 && x + t.width > maximo {
                x = 0
                y += altoFila + vertical
                altoFila = 0
            }
            puntos.append(CGPoint(x: x, y: y))
            tamanos.append(t)
            anchoMax = max(anchoMax, x + t.width)
            x += t.width + horizontal
            altoFila = max(altoFila, t.height)
        }
        return (puntos, tamanos, CGSize(width: anchoMax, height: y + altoFila))
    }
}
