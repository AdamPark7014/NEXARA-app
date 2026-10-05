import Combine
import SwiftUI

/// Bandeja de notificaciones — igual que `NotificationsScreen` de Android (y el
/// centro web `/erp/notifications-center`).
///
/// - Una sola fila de chips que se desliza: «Nuevos (N)» · Todas / Actividades /
///   Asistencia / Chat / Otras con su conteo (las vacías no salen) · «Actividad
///   reciente».
/// - Abrir la bandeja la da por vista: un solo «leer todo» al cargar (y al
///   deslizar para actualizar). Lo que llegó sin leer se queda marcado «Nuevo»
///   (fondo de marca tenue y punto) mientras sigas aquí.
/// - Tocar un aviso lo abre por el mismo camino que un push; el menú ⋮ lo elimina.
struct NotificationsCenterView: View {
    let onBack: () -> Void

    @State private var rows: [[String: Any]] = []
    @State private var isLoading = true
    @State private var saving = false
    @State private var error: String?
    @State private var aviso: String?
    @State private var unreadCount = 0
    /// Avisos que llegaron sin leer en esta visita (Android `newIds`).
    @State private var newIds: Set<Int64> = []
    @State private var soloNuevos = false
    @State private var categoria: NotifCategoria = .todas
    @State private var verFeed = false
    @State private var feedItems: [[String: Any]] = []
    @State private var feedLoading = false
    @State private var feedError: String?
    @State private var ultimoEvento = Date.distantPast

    // MARK: Reglas (Android `visibleNotificationRows` / `NotificationSeen`)

    private func id(_ n: [String: Any]) -> Int64 { ConsoleHelpers.mapInt64(n, "id") ?? -1 }
    private func leida(_ n: [String: Any]) -> Bool { (n["isRead"] as? Bool) == true }
    private func esNueva(_ n: [String: Any]) -> Bool { newIds.contains(id(n)) || !leida(n) }

    /// Sin los avisos de módulos que ya no están en Core.
    private var nucleo: [[String: Any]] {
        rows.filter { !NotifCategoria.esHeredada(ConsoleHelpers.mapStr($0, "category")) }
    }

    private var visibles: [[String: Any]] {
        nucleo
            .filter { !soloNuevos || esNueva($0) }
            .filter { categoria == .todas || NotifCategoria.de(ConsoleHelpers.mapStr($0, "category")) == categoria }
    }

    private var nuevos: Int { nucleo.filter { esNueva($0) }.count }

    private func conteo(_ cat: NotifCategoria) -> Int {
        cat == .todas ? nucleo.count : nucleo.filter { NotifCategoria.de(ConsoleHelpers.mapStr($0, "category")) == cat }.count
    }

    // MARK: Vista

    var body: some View {
        VStack(spacing: 0) {
            filtros
            ScrollView {
                LazyVStack(alignment: .leading, spacing: NxSpacing.listGap) {
                    if verFeed {
                        feed
                    } else {
                        bandeja
                    }
                }
                .padding(.horizontal, NxSpacing.l)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .refreshable {
                // Deslizar para actualizar es mirar la lista: lo nuevo también queda visto.
                if verFeed { await loadFeed() } else { await refresh(inicial: false, marcarVisto: true) }
            }
        }
        .nxScreenBackground()
        .nxAvisoCorto($aviso)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: onBack) {
                    Image(systemName: "chevron.backward")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.white)
                }
                .tint(Color.white)
                .accessibilityLabel("Cerrar")
            }
        }
        .task { await refresh(inicial: true, marcarVisto: true) }
        .onReceive(RealtimeBus.shared.events.receive(on: DispatchQueue.main)) { event in
            let model = (event.model ?? "").trimmingCharacters(in: .whitespaces).lowercased()
            guard model.isEmpty || model == "notification" else { return }
            // Ráfagas de eventos: como Android, una recarga cada 750 ms como mucho.
            let ahora = Date()
            guard ahora.timeIntervalSince(ultimoEvento) >= 0.75 else { return }
            ultimoEvento = ahora
            Task { await refresh(inicial: false, marcarVisto: false) }
        }
    }

    // MARK: Fila de filtros

    private var filtros: some View {
        // Categorías vacías no ocupan lugar; la elegida se queda aunque ya no tenga avisos.
        let categorias = NotifCategoria.allCases.filter { $0 == .todas || conteo($0) > 0 || $0 == categoria }
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .center, spacing: NxSpacing.s) {
                // «Nuevos» solo existe si esta visita trajo algo nuevo (o si ya está elegido).
                if nuevos > 0 || soloNuevos {
                    NxFiltroChipM3(label: "Nuevos (\(nuevos))", selected: !verFeed && soloNuevos) {
                        verFeed = false
                        soloNuevos.toggle()
                    }
                    NxDivisorVertical()
                }
                ForEach(categorias) { cat in
                    NxFiltroChipM3(label: "\(cat.titulo) (\(conteo(cat)))", selected: !verFeed && categoria == cat) {
                        verFeed = false
                        categoria = cat
                    }
                }
                NxDivisorVertical()
                NxFiltroChipM3(label: "Actividad reciente", selected: verFeed) {
                    verFeed.toggle()
                    if verFeed && feedItems.isEmpty { Task { await loadFeed() } }
                }
            }
            .padding(.horizontal, NxSpacing.l)
        }
        .padding(.vertical, 6)
    }

    // MARK: Bandeja

    @ViewBuilder
    private var bandeja: some View {
        if isLoading && rows.isEmpty {
            NxSkeletonList()
        } else {
            if let error {
                NxErrorBlock(message: error) { Task { await refresh(inicial: true, marcarVisto: true) } }
            }
            let lista = visibles
            if lista.isEmpty {
                if error == nil {
                    if soloNuevos || categoria != .todas {
                        NxEmptyState(
                            title: "Nada con este filtro",
                            subtitle: "No hay avisos que coincidan.",
                            actionLabel: "Ver todos",
                            onAction: {
                                soloNuevos = false
                                categoria = .todas
                            }
                        )
                    } else {
                        NxEmptyState(
                            title: "Todo al día",
                            subtitle: "Cuando algo necesite tu atención aparecerá aquí."
                        )
                    }
                }
            } else {
                ForEach(lista.indices, id: \.self) { i in
                    tarjeta(lista[i])
                }
            }
        }
    }

    private func tarjeta(_ n: [String: Any]) -> some View {
        let nueva = esNueva(n)
        let destino = NotificationDeepLinkResolver.resolve(notification: n)
        let titulo = ConsoleHelpers.mapStr(n, "title")
        let mensaje = ConsoleHelpers.mapStr(n, "message")
        let meta = [
            NotifCategoria.etiqueta(ConsoleHelpers.mapStr(n, "category")),
            Self.haceCuanto(ConsoleHelpers.mapStr(n, "createdAt")),
        ]
        .filter { !$0.isEmpty }
        .joined(separator: " · ")

        let contenido = HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(nueva ? NxColors.brand : Color.clear)
                .frame(width: 8, height: 8)
                .padding(.top, 7)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                if nueva {
                    Text("Nuevo")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(NxColors.brand)
                }
                Text(titulo.isEmpty ? "Notificación" : titulo)
                    .font(.system(size: 14, weight: nueva ? .semibold : .regular))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                if !mensaje.isEmpty {
                    Text(mensaje)
                        .nxTextStyle(.bodyMedium)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(3)
                }
                if !meta.isEmpty {
                    Text(meta)
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())

        return HStack(alignment: .top, spacing: 0) {
            if let destino {
                Button { abrir(n, destino) } label: { contenido }
                    .buttonStyle(NxPressableStyle())
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Abre el aviso")
            } else {
                contenido
                    .accessibilityElement(children: .combine)
            }
            Menu {
                Button(role: .destructive) {
                    Task { await eliminar(n) }
                } label: {
                    Text("Eliminar")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .rotationEffect(.degrees(90))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(NxColors.muted)
                    .frame(width: 44, height: 48)
                    .contentShape(Rectangle())
            }
            .disabled(saving)
            .accessibilityLabel("Opciones de la notificación")
            .padding(.trailing, 4)
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            nueva ? NxColors.brandTint : NxColors.card,
            in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
        )
    }

    // MARK: Actividad reciente

    @ViewBuilder
    private var feed: some View {
        if feedLoading && feedItems.isEmpty {
            NxSkeletonList()
        } else if let feedError, feedItems.isEmpty {
            NxErrorBlock(message: feedError) { Task { await loadFeed() } }
        } else if feedItems.isEmpty {
            NxEmptyState(
                title: "Sin actividad reciente",
                subtitle: "Aquí verás lo último que pasó en tu equipo."
            )
        } else {
            ForEach(feedItems.indices, id: \.self) { i in
                let item = feedItems[i]
                let titulo = ConsoleHelpers.mapStr(item, "title")
                let sub = ConsoleHelpers.mapStr(item, "subtitle")
                VStack(alignment: .leading, spacing: 0) {
                    Text(titulo.isEmpty ? "Evento" : titulo)
                        .font(NxType.titleSmall)
                        .foregroundStyle(NxColors.fg)
                    if !sub.isEmpty {
                        Text(sub)
                            .font(NxType.bodySmall)
                            .foregroundStyle(NxColors.muted)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: Datos

    /// `marcarVisto`: la persona está mirando la lista (al abrir y al deslizar);
    /// lo que llegue sin leer se da por visto. Los refrescos en vivo no marcan nada.
    private func refresh(inicial: Bool, marcarVisto: Bool) async {
        if inicial { isLoading = true }
        error = nil
        do {
            let count = try await NotificationsRepository.shared.unreadCount()
            let list = try await NotificationsRepository.shared.list(limit: 50)
            rows = list
            unreadCount = count
            newIds.formUnion(list.filter { !leida($0) }.map { id($0) })
            isLoading = false
            if marcarVisto && (count > 0 || list.contains { !leida($0) }) {
                await marcarTodoVisto()
            }
        } catch {
            isLoading = false
            self.error = error.toUserMessage(fallback: "No se pudieron cargar notificaciones")
        }
    }

    /// Abrir la bandeja = verla: el mismo «leer todo» del API, una vez por carga y
    /// sin avisos en pantalla. Si falla (sin red) no pasa nada visible: los avisos
    /// siguen sin leer y se vuelve a intentar la próxima vez.
    private func marcarTodoVisto() async {
        do {
            try await NotificationsRepository.shared.markAllRead()
            rows = rows.map { fila in
                var copia = fila
                copia["isRead"] = true
                return copia
            }
            unreadCount = 0
            await NotificationsBadgeStore.shared.refresh()
        } catch {
            // Silencioso, como Android.
        }
    }

    private func loadFeed() async {
        feedLoading = true
        feedError = nil
        do {
            feedItems = try await NotificationsRepository.shared.activityFeed(limit: 40)
        } catch {
            feedError = error.toUserMessage(fallback: "No se pudo cargar el feed")
        }
        feedLoading = false
    }

    /// Abre el aviso por el mismo camino que un push. Si seguía sin leer, primero
    /// se marca; si eso falla, se queda aquí con el error (como Android).
    private func abrir(_ n: [String: Any], _ destino: DeepLinkDestination) {
        Task { @MainActor in
            if !leida(n), id(n) > 0 {
                saving = true
                do {
                    try await NotificationsRepository.shared.markRead(id: id(n))
                    saving = false
                    await NotificationsBadgeStore.shared.refresh()
                } catch {
                    saving = false
                    self.error = error.toUserMessage(fallback: "No se pudo marcar")
                    return
                }
            }
            // Primero se cierra la bandeja y, cuando ya bajó, el destino entra por el
            // camino de un push. En el mismo instante la cubierta nueva no se presenta.
            onBack()
            try? await Task.sleep(nanoseconds: 450_000_000)
            DeepLinkCoordinator.shared.ingest(destination: destino)
        }
    }

    private func eliminar(_ n: [String: Any]) async {
        let nid = id(n)
        guard nid > 0 else { return }
        saving = true
        error = nil
        do {
            try await NotificationsRepository.shared.delete(id: nid)
            saving = false
            aviso = "Eliminada"
            await refresh(inicial: false, marcarVisto: false)
            await NotificationsBadgeStore.shared.refresh()
        } catch {
            saving = false
            self.error = error.toUserMessage(fallback: "No se pudo eliminar")
        }
    }

    /// «Justo ahora», «Hace 12 min», «Hace 3h», «Hace 2d» (Android `relativeTime`).
    static func haceCuanto(_ iso: String, ahora: Date = Date()) -> String {
        guard let date = NxFormat.parseISO(iso) else { return "" }
        let diff = ahora.timeIntervalSince(date)
        let mins = Int((abs(diff) / 60).rounded())
        if mins < 2 { return "Justo ahora" }
        let fmt: (String) -> String = { diff < 0 ? "En \($0)" : "Hace \($0)" }
        if mins < 60 { return fmt("\(mins) min") }
        let hrs = Int((Double(mins) / 60).rounded())
        if hrs < 24 { return fmt("\(hrs)h") }
        return fmt("\(Int((Double(hrs) / 24).rounded()))d")
    }
}

/// Cubos de categoría del centro web (`bucketCategory` en
/// `apps/web/app/(panels)/erp/notifications-center`) = `NotificationCategory` de Android.
private enum NotifCategoria: String, CaseIterable, Identifiable {
    case todas, actividades, asistencia, chat, otras

    var id: String { rawValue }

    var titulo: String {
        switch self {
        case .todas: return "Todas"
        case .actividades: return "Actividades"
        case .asistencia: return "Asistencia"
        case .chat: return "Chat"
        case .otras: return "Otras"
        }
    }

    static func de(_ category: String) -> NotifCategoria {
        let c = category.trimmingCharacters(in: .whitespaces).lowercased()
        if c.contains("sla") || c.hasPrefix("activit") || c.hasPrefix("evidence")
            || c == "approval" || c == "confirmations" || c == "erp" {
            return .actividades
        }
        if c == "attendance" || c.hasPrefix("lunch") { return .asistencia }
        if c == "chat" { return .chat }
        return .otras
    }

    /// Categorías de módulos retirados de Core: sus avisos viejos no se listan.
    static func esHeredada(_ category: String) -> Bool {
        let c = category.trimmingCharacters(in: .whitespaces).lowercased()
        return [
            "quotes", "sales", "crm", "tool", "tools", "viatics", "vehicles", "fines", "tickets",
            "orders", "stock-alert", "margin-alert", "workflow", "asc", "ops-acs", "finance",
        ].contains(c)
    }

    /// Etiqueta legible de la categoría cruda (`CATEGORY_LABEL` de la web, solo Core).
    static func etiqueta(_ category: String) -> String {
        let raw = category.trimmingCharacters(in: .whitespaces)
        switch raw.lowercased() {
        case "attendance": return "Asistencia"
        case "lunch_break", "lunch_breaks": return "Comida"
        case "activity", "activities": return "Actividad"
        case "approval": return "Aprobación"
        case "evidence", "evidences": return "Evidencias"
        case "sla-alert", "sla-breach": return "Atraso"
        case "chat": return "Chat"
        case "profile": return "Perfil"
        case "confirmations": return "Confirmación"
        case "security": return "Seguridad"
        case "celebraciones": return "Celebraciones"
        default: return raw
        }
    }
}
