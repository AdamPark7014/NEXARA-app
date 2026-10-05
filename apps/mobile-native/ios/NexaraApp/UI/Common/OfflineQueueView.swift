import SwiftUI

/// Tipo de cambio en cola, deducido de la ruta (Android `OfflineMutationKind`).
private enum OfflineMutationKind {
    case evidencia, actividad, chat, asistencia, gps, generico

    init(url: String) {
        let path = (URL(string: url)?.path ?? url).lowercased()
        if path.contains("evidencia") || path.contains("evidence") {
            self = .evidencia
        } else if path.contains("actividad") || path.contains("activity") || path.contains("activities") {
            self = .actividad
        } else if path.contains("chat") || path.contains("message") {
            self = .chat
        } else if path.contains("asistencia") || path.contains("attendance") || path.contains("lunch") {
            self = .asistencia
        } else if path.contains("gps") || path.contains("location") {
            self = .gps
        } else {
            self = .generico
        }
    }

    var label: String {
        switch self {
        case .evidencia: return "Evidencia"
        case .actividad: return "Actividad"
        case .chat: return "Chat"
        case .asistencia: return "Asistencia"
        case .gps: return "GPS"
        case .generico: return "Mutación"
        }
    }

    var systemImage: String {
        switch self {
        case .evidencia: return "camera"
        case .actividad: return "calendar"
        case .chat: return "message"
        case .asistencia: return "list.clipboard"
        case .gps: return "location"
        case .generico: return "arrow.triangle.2.circlepath.icloud"
        }
    }

    var tint: Color {
        switch self {
        case .evidencia: return NxColors.info
        case .actividad: return NxColors.brand
        case .chat: return NxColors.rgb(0x6366F1)
        case .asistencia: return NxColors.brandText
        case .gps: return NxColors.accent
        case .generico: return NxColors.muted
        }
    }
}

/// Cola de cambios sin conexión — igual que `OfflineQueueScreen` de Android:
/// encabezado con el estado de la red, tarjeta de pendientes / con reintentos /
/// red, «Sincronizar ahora» y «Vaciar cola», y una línea de tiempo de cambios
/// que se desliza a la derecha para reintentar y a la izquierda para descartar
/// (los dos con su botón, y descartar siempre con confirmación). Al volver la
/// red se sincroniza sola.
struct OfflineQueueView: View {
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var items: [QueuedMutation] = []
    @State private var syncing = false
    @State private var autoSync = false
    @State private var message: String?
    @State private var messageError = false
    @State private var confirmarVaciar = false
    @State private var porDescartar: QueuedMutation?

    private var withErrors: Int { items.filter { $0.attempts > 0 }.count }
    private var ocupado: Bool { syncing || autoSync }

    var body: some View {
        List {
            fila {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Cola offline")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .accessibilityAddTraits(.isHeader)
                    Text(network.isOnline
                         ? "Con conexión — los cambios se sincronizan automáticamente"
                         : "Sin conexión — los cambios se encolan aquí")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
            }

            if ocupado {
                fila { indicadorAutoSync }
            }

            if let message, !message.isEmpty {
                fila {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: messageError ? "exclamationmark.circle" : "checkmark.circle")
                            .accessibilityHidden(true)
                        Text(message)
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(messageError ? NxColors.danger : NxColors.success)
                }
            }

            fila { tarjetaEstado }

            fila {
                HStack(spacing: NxSpacing.s) {
                    Button(ocupado ? "Sincronizando…" : "Sincronizar ahora") {
                        Task { await syncNow() }
                    }
                    .buttonStyle(NxPillButtonStyle(fill: NxColors.brand, foreground: .white))
                    .disabled(ocupado || !network.isOnline || items.isEmpty)
                    if !items.isEmpty {
                        NxBotonContorno(title: "Vaciar cola") { confirmarVaciar = true }
                    }
                }
            }

            if items.isEmpty {
                fila {
                    NxEmptyState(
                        title: "Todo sincronizado",
                        subtitle: "No hay mutaciones pendientes en este dispositivo."
                    )
                }
            } else {
                fila {
                    Text("Desliza → reintentar · ← descartar")
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                }
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    renglon(item, primero: index == 0, ultimo: index == items.count - 1)
                        .listRowInsets(EdgeInsets(top: 5, leading: NxSpacing.l, bottom: 5, trailing: NxSpacing.l))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            if network.isOnline {
                                Button { Task { await retry(item) } } label: {
                                    Label("Reintentar", systemImage: "arrow.clockwise")
                                }
                                .tint(NxColors.brand)
                            }
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            // Regresa a su lugar: el diálogo de confirmación decide si se borra.
                            Button { porDescartar = item } label: {
                                Label("Descartar", systemImage: "trash")
                            }
                            .tint(NxColors.danger)
                        }
                }
            }

            fila { Spacer().frame(height: 24) }
        }
        .listStyle(.plain)
        .environment(\.defaultMinListRowHeight, 1)
        .nxListBackground()
        .task { refresh() }
        .onReceive(NotificationCenter.default.publisher(for: .nexaraOfflineQueueChanged)) { _ in
            refresh()
        }
        .onChange(of: network.isOnline) { wasOnline, isOnline in
            // Al volver la red, se manda lo pendiente sin que nadie lo pida.
            guard isOnline, !wasOnline, !items.isEmpty else { return }
            Task {
                autoSync = true
                await OfflineSyncCoordinator.shared.replay()
                refresh()
                autoSync = false
            }
        }
        .alert("¿Vaciar la cola?", isPresented: $confirmarVaciar) {
            Button("Cancelar", role: .cancel) {}
            Button("Vaciar cola", role: .destructive) { vaciar() }
        } message: {
            Text("Se pierden las \(items.count) mutaciones sin sincronizar de este aparato (fotos, cambios de actividad) y no se pueden recuperar.")
        }
        .alert(
            "¿Descartar este cambio?",
            isPresented: Binding(get: { porDescartar != nil }, set: { if !$0 { porDescartar = nil } }),
            presenting: porDescartar
        ) { pendiente in
            Button("Cancelar", role: .cancel) {}
            Button("Descartar", role: .destructive) { descartar(pendiente) }
        } message: { pendiente in
            Text("El cambio de \(OfflineMutationKind(url: pendiente.url).label.lowercased()) nunca llegará al servidor y no se puede recuperar.")
        }
    }

    /// Renglón sin fondo ni separador, con el margen de 16 de la pantalla.
    private func fila<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .listRowInsets(EdgeInsets(top: 5, leading: NxSpacing.l, bottom: 5, trailing: NxSpacing.l))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }

    // MARK: Piezas

    private var indicadorAutoSync: some View {
        HStack(spacing: 10) {
            ProgressView()
                .controlSize(.small)
                .tint(NxColors.brand)
                .frame(width: 18, height: 18)
            Text("Sincronizando al recuperar conexión…")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(NxColors.brand)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.brandSoft, in: RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous))
    }

    private var tarjetaEstado: some View {
        HStack(alignment: .top, spacing: 16) {
            cifra("\(items.count)", "Pendientes", color: NxColors.fg, grande: true)
            cifra("\(withErrors)", "Con reintentos", color: NxColors.warning, grande: true)
            cifra(network.isOnline ? "Online" : "Offline", "Red",
                  color: network.isOnline ? NxColors.success : NxColors.warning, grande: false)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            items.isEmpty ? NxColors.successSoft : NxColors.warningSoft,
            in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
        )
        .accessibilityElement(children: .combine)
    }

    private func cifra(_ valor: String, _ etiqueta: String, color: Color, grande: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(valor)
                .font(.system(size: grande ? 22 : 14, weight: .bold))
                .foregroundStyle(color)
            Text(etiqueta)
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.muted)
        }
    }

    private func renglon(_ item: QueuedMutation, primero: Bool, ultimo: Bool) -> some View {
        let kind = OfflineMutationKind(url: item.url)
        return HStack(alignment: .top, spacing: 8) {
            VStack(spacing: 0) {
                if !primero {
                    Rectangle().fill(NxColors.muted.opacity(0.35)).frame(width: 2, height: 8)
                }
                Image(systemName: kind.systemImage)
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(kind.tint)
                    .frame(width: 36, height: 36)
                    .background(kind.tint.opacity(0.12), in: Circle())
                    .accessibilityLabel(kind.label)
                if !ultimo {
                    Rectangle().fill(NxColors.muted.opacity(0.35)).frame(width: 2, height: 24)
                }
            }
            .frame(width: 44)

            NxPanelShell(padding: 12) {
                HStack(alignment: .center, spacing: 0) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(kind.label)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(NxColors.fg)
                            Text(item.method)
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(NxColors.brand)
                        }
                        Text(Self.shortPath(item.url))
                            .font(NxType.bodySmall)
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(2)
                        if item.attempts > 0 {
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                                    .font(.system(size: 11))
                                    .accessibilityHidden(true)
                                Text("Intentos: \(item.attempts)" + (item.lastError.map { " · \($0)" } ?? ""))
                                    .lineLimit(2)
                            }
                            .font(NxType.labelSmall)
                            .foregroundStyle(NxColors.warning)
                        }
                        // `nexara-media://` (fotos en JSON) y `nexara-media-bin://` (multipart guardado en disco).
                        if (item.body ?? "").contains("nexara-media") {
                            Text("Incluye media local")
                                .font(NxType.labelSmall)
                                .foregroundStyle(NxColors.info)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if network.isOnline {
                        Button { Task { await retry(item) } } label: {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 18, weight: .regular))
                                .foregroundStyle(NxColors.brand)
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Reintentar")
                    }
                    Button { porDescartar = item } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 18, weight: .regular))
                            .foregroundStyle(NxColors.danger)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Descartar")
                }
            }
        }
    }

    // MARK: Acciones

    private func refresh() {
        items = OfflineMutationQueue.shared.load()
    }

    private func syncNow() async {
        syncing = true
        message = nil
        await OfflineSyncCoordinator.shared.replay()
        refresh()
        messageError = false
        message = items.isEmpty ? "Todo sincronizado" : "Quedan \(items.count) pendientes"
        syncing = false
    }

    /// Reintenta este cambio ya, sin esperar el compás de reintentos: se le quita
    /// la hora del último intento y se manda la cola (lo demás pendiente también
    /// sale, que es lo que tocaba de todos modos).
    private func retry(_ item: QueuedMutation) async {
        var listo = item
        listo.lastAttemptAt = nil
        OfflineMutationQueue.shared.upsert(listo)
        await OfflineSyncCoordinator.shared.replay()
        refresh()
        let ok = !items.contains { $0.id == item.id }
        messageError = !ok
        message = ok ? "Enviado" : "No se pudo enviar — revisa el error"
    }

    private func vaciar() {
        for item in items {
            OfflineMediaStore.shared.purgeRefs(in: item.body)
        }
        OfflineMutationQueue.shared.removeIds(Set(items.map(\.id)))
        refresh()
        messageError = false
        message = "Cola descartada"
    }

    private func descartar(_ item: QueuedMutation) {
        OfflineMediaStore.shared.purgeRefs(in: item.body)
        OfflineMutationQueue.shared.removeIds([item.id])
        refresh()
        messageError = false
        message = "Cambio descartado"
    }

    private static func shortPath(_ url: String) -> String {
        guard let u = URL(string: url) else { return url }
        var path = u.path
        if path.hasPrefix("/api/") { path = String(path.dropFirst(5)) }
        return path
    }
}
