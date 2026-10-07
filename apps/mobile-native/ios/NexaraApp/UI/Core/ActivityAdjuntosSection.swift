import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// «Archivos de evidencia» del detalle de una actividad comercial: la propuesta en
/// Excel, la minuta en Word, el PDF del cliente. Lista con icono por tipo, «Adjuntar
/// archivo» (varios a la vez, desde Archivos o desde Fotos) y, al tocar uno, el
/// documento embebido con Vista Rápida + «Guardar en Archivos» y «Compartir»
/// (`DocumentoScreen`). Quitar, solo si el API dice `puedeQuitar`.
struct ActivityAdjuntosSection: View {
    let activityId: Int
    /// El equipo de la actividad o quien la gestiona. El API vuelve a validar al subir.
    let puedeAdjuntar: Bool
    /// Sube cuando el detalle se recarga (deslizar para actualizar).
    var refreshToken: Int = 0
    /// Aviso corto abajo (el snackbar del detalle).
    var onAviso: ((String) -> Void)? = nil

    @State private var adjuntos: [ActivityAdjunto] = []
    @State private var cargando = true
    @State private var cargado = false
    @State private var errorCarga: String?
    @State private var recarga = 0

    @State private var eligiendoArchivos = false
    @State private var eligiendoFotos = false
    @State private var fotos: [PhotosPickerItem] = []
    @State private var subiendo = false
    /// Lo que salió mal al subir, abrir o quitar (con el mensaje del API).
    @State private var errorAccion: String?

    @State private var abriendo: Int?
    @State private var abierto: AdjuntoAbierto?
    @State private var porQuitar: ActivityAdjunto?
    @State private var quitando: Int?

    private let repo = ActivityAdjuntosRepository.shared

    var body: some View {
        NxPanelShell(spacing: 10) {
            encabezado
            contenido
            if let errorAccion {
                Text(errorAccion)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if puedeAdjuntar {
                botonAdjuntar
                    .padding(.top, 2)
            }
        }
        .task(id: "\(activityId)-\(refreshToken)-\(recarga)") { await cargar() }
        .fileImporter(
            isPresented: $eligiendoArchivos,
            allowedContentTypes: ActivityAdjuntosRules.tiposImportables,
            allowsMultipleSelection: true
        ) { resultado in
            switch resultado {
            case .success(let urls):
                Task { await subirArchivos(urls) }
            case .failure:
                errorAccion = "No se pudo abrir el archivo."
            }
        }
        .photosPicker(
            isPresented: $eligiendoFotos,
            selection: $fotos,
            maxSelectionCount: ActivityAdjuntosRules.maximoPorEnvio,
            matching: .images
        )
        .onChange(of: fotos) { _, elegidas in
            guard !elegidas.isEmpty else { return }
            Task { await subirFotos(elegidas) }
        }
        .fullScreenCover(item: $abierto) { documento in
            NavigationStack {
                DocumentoScreen(titulo: documento.titulo, url: documento.url)
                    .nxBrandNavBar(title: documento.titulo, showsBell: false)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cerrar") { abierto = nil }
                        }
                    }
            }
        }
        .alert(
            "Quitar archivo",
            isPresented: Binding(get: { porQuitar != nil }, set: { if !$0 { porQuitar = nil } }),
            presenting: porQuitar
        ) { adjunto in
            Button("Quitar", role: .destructive) {
                Task { await quitar(adjunto) }
            }
            Button("Cancelar", role: .cancel) { porQuitar = nil }
        } message: { adjunto in
            Text("Se quitará «\(adjunto.nombre)» de la actividad.")
        }
    }

    // MARK: Piezas

    private var encabezado: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(ActivityAdjuntosRules.titulo)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                if !adjuntos.isEmpty {
                    Text("\(adjuntos.count)")
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(NxColors.fg2)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 1)
                        .background(NxColors.sunken, in: Capsule())
                        .accessibilityLabel("\(adjuntos.count) archivos")
                }
            }
            Text(ActivityAdjuntosRules.subtitulo)
                .font(.system(size: 12.5))
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var contenido: some View {
        if cargando && !cargado {
            VStack(spacing: 8) {
                NxSkeletonBlock(height: 48, cornerRadius: 10)
                NxSkeletonBlock(height: 48, cornerRadius: 10)
            }
        } else if let errorCarga, !cargado {
            NxErrorBlock(message: errorCarga) { recarga += 1 }
        } else if adjuntos.isEmpty {
            Text(ActivityAdjuntosRules.vacio)
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 4)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(adjuntos.enumerated()), id: \.element.id) { indice, adjunto in
                    if indice > 0 { NxRowDivider() }
                    AdjuntoFila(
                        adjunto: adjunto,
                        ocupado: abriendo == adjunto.id || quitando == adjunto.id,
                        bloqueado: abriendo != nil || quitando == adjunto.id,
                        onAbrir: { Task { await abrir(adjunto) } },
                        onQuitar: adjunto.puedeQuitar == true ? { porQuitar = adjunto } : nil
                    )
                }
            }
        }
    }

    /// «Adjuntar archivo» con el contorno de `NxSecondaryButton`; ofrece Archivos y Fotos.
    private var botonAdjuntar: some View {
        Menu {
            Button {
                errorAccion = nil
                eligiendoArchivos = true
            } label: {
                Label("Desde Archivos", systemImage: "folder")
            }
            Button {
                errorAccion = nil
                eligiendoFotos = true
            } label: {
                Label("Desde Fotos", systemImage: "photo.on.rectangle")
            }
        } label: {
            HStack(spacing: 8) {
                if subiendo {
                    ProgressView()
                        .controlSize(.small)
                        .tint(NxColors.brand)
                        .frame(width: 18, height: 18)
                } else {
                    Image(systemName: "paperclip")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 18, height: 18)
                        .accessibilityHidden(true)
                }
                Text(subiendo ? ActivityAdjuntosRules.subiendo : ActivityAdjuntosRules.adjuntar)
                    .font(NxType.labelLarge)
                    .lineLimit(1)
            }
            .foregroundStyle(subiendo ? NxColors.fg.opacity(0.38) : NxColors.brand)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: NxMetrics.primaryButtonHeight)
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(subiendo ? NxColors.fg.opacity(0.12) : NxColors.borderStrong, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .disabled(subiendo)
        .accessibilityIdentifier("adjuntar-archivo")
    }

    // MARK: Acciones

    @MainActor
    private func cargar() async {
        cargando = true
        defer { cargando = false }
        do {
            let lista = try await repo.listar(activityId: activityId)
            if Task.isCancelled { return }
            adjuntos = lista
            errorCarga = nil
            cargado = true
        } catch {
            if Task.isCancelled || error is CancellationError { return }
            errorCarga = error.toUserMessage(fallback: "No se pudieron cargar los archivos")
        }
    }

    /// Los archivos que se eligieron en Archivos: se leen (permiso temporal), se revisa
    /// tipo y tamaño y se suben.
    @MainActor
    private func subirArchivos(_ urls: [URL]) async {
        guard !urls.isEmpty, !subiendo else { return }
        subiendo = true
        errorAccion = nil
        defer { subiendo = false }
        var listos: [ActivityAdjuntoArchivo] = []
        var avisos: [String] = []
        for url in urls {
            do {
                listos.append(try await repo.leer(url))
            } catch {
                avisos.append(error.toUserMessage(fallback: "No se pudo leer «\(url.lastPathComponent)»."))
            }
        }
        await enviar(listos, avisos: avisos)
    }

    /// Fotos de la galería: se mandan como JPEG (un HEIC no se ve en todas partes).
    @MainActor
    private func subirFotos(_ elegidas: [PhotosPickerItem]) async {
        fotos = []
        guard !subiendo else { return }
        subiendo = true
        errorAccion = nil
        defer { subiendo = false }
        var listos: [ActivityAdjuntoArchivo] = []
        var avisos: [String] = []
        let ahora = Date()
        for (indice, item) in elegidas.enumerated() {
            let nombre = ActivityAdjuntosRules.nombreDeFoto(ahora, indice: indice, total: elegidas.count)
            do {
                guard let bytes = try await item.loadTransferable(type: Data.self),
                      let jpeg = UIImage(data: bytes)?.jpegData(compressionQuality: 0.85) else {
                    avisos.append("No se pudo leer una de las fotos.")
                    continue
                }
                if let aviso = ActivityAdjuntosRules.rechazo(nombre: nombre, bytes: jpeg.count) {
                    avisos.append(aviso)
                    continue
                }
                listos.append(ActivityAdjuntoArchivo(nombre: nombre, mimeType: "image/jpeg", data: jpeg))
            } catch {
                avisos.append("No se pudo leer una de las fotos.")
            }
        }
        await enviar(listos, avisos: avisos)
    }

    /// Sube de 10 en 10 (el máximo del API por envío) y deja la lista al día.
    @MainActor
    private func enviar(_ archivos: [ActivityAdjuntoArchivo], avisos inicial: [String]) async {
        var avisos = inicial
        var nuevos: [ActivityAdjunto] = []
        var enCola = false
        var inicio = 0
        var fallo = false
        while inicio < archivos.count, !fallo {
            let fin = min(inicio + ActivityAdjuntosRules.maximoPorEnvio, archivos.count)
            let lote = Array(archivos[inicio..<fin])
            inicio = fin
            do {
                switch try await repo.subir(activityId: activityId, archivos: lote) {
                case .subidos(let creados):
                    nuevos.append(contentsOf: creados)
                case .enCola:
                    enCola = true
                }
            } catch {
                avisos.append(error.toUserMessage(fallback: "No se pudieron subir los archivos"))
                fallo = true
            }
        }
        if !nuevos.isEmpty {
            let ids = Set(nuevos.map(\.id))
            adjuntos = nuevos + adjuntos.filter { !ids.contains($0.id) }
            cargado = true
            onAviso?(nuevos.count == 1 ? "Archivo adjuntado" : "\(nuevos.count) archivos adjuntados")
        }
        if enCola {
            onAviso?(CoreError.queuedOffline.errorDescription ?? "Sin conexión: quedó en cola.")
        } else if !archivos.isEmpty && !fallo {
            // Lo que contestó el servidor manda (orden, quién lo subió, si se puede quitar).
            recarga += 1
        }
        errorAccion = avisos.isEmpty ? nil : avisos.joined(separator: "\n")
    }

    /// Baja el archivo con la sesión, lo escribe con su nombre y lo abre embebido.
    @MainActor
    private func abrir(_ adjunto: ActivityAdjunto) async {
        guard abriendo == nil else { return }
        abriendo = adjunto.id
        errorAccion = nil
        defer { abriendo = nil }
        do {
            let data = try await repo.archivo(activityId: activityId, adjuntoId: adjunto.id)
            let url = try NxArchivoTemporal.escribir(
                data,
                nombre: adjunto.nombre,
                extensionPorOmision: ActivityAdjuntosRules.extensionParaGuardar(adjunto)
            )
            abierto = AdjuntoAbierto(titulo: adjunto.nombre, url: url)
        } catch {
            if Task.isCancelled || error is CancellationError { return }
            errorAccion = error.toUserMessage(fallback: "No se pudo abrir el archivo")
        }
    }

    @MainActor
    private func quitar(_ adjunto: ActivityAdjunto) async {
        porQuitar = nil
        quitando = adjunto.id
        errorAccion = nil
        defer { quitando = nil }
        do {
            try await repo.quitar(activityId: activityId, adjuntoId: adjunto.id)
            adjuntos.removeAll { $0.id == adjunto.id }
            onAviso?("Archivo quitado")
        } catch {
            errorAccion = error.toUserMessage(fallback: "No se pudo quitar el archivo")
        }
    }
}

/// Documento ya escrito en disco, listo para Vista Rápida.
private struct AdjuntoAbierto: Identifiable {
    let id = UUID()
    let titulo: String
    let url: URL
}

/// Un renglón: icono del tipo, nombre (2 líneas) y «2.3 MB · Luis Joel · hoy 13:39».
/// Tocarlo lo abre; «…» (o mantenerlo presionado) ofrece Quitar si se puede.
private struct AdjuntoFila: View {
    let adjunto: ActivityAdjunto
    /// Se está abriendo o quitando este.
    let ocupado: Bool
    /// No se puede tocar ahora (hay otro abriéndose).
    let bloqueado: Bool
    let onAbrir: () -> Void
    let onQuitar: (() -> Void)?

    var body: some View {
        let tipo = ActivityAdjuntosRules.tipo(adjunto)
        let meta = ActivityAdjuntosRules.meta(adjunto)
        HStack(alignment: .center, spacing: 8) {
            Button(action: onAbrir) {
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: tipo.simbolo)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(tipo.color)
                        .frame(width: 40, height: 40)
                        .background(tipo.color.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(adjunto.nombre)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        if !meta.isEmpty {
                            Text(meta)
                                .font(.system(size: 12))
                                .foregroundStyle(NxColors.muted)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(NxPressableStyle())
            .disabled(bloqueado)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(tipo.etiqueta), \(adjunto.nombre)")
            .accessibilityValue(meta)
            .accessibilityHint("Abre el archivo")

            if ocupado {
                ProgressView()
                    .controlSize(.small)
                    .tint(NxColors.brand)
                    .frame(width: 44, height: 44)
            } else if let onQuitar {
                Menu {
                    Button(role: .destructive, action: onQuitar) {
                        Label("Quitar", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(NxColors.muted)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Más acciones de \(adjunto.nombre)")
            }
        }
        .modifier(AdjuntoMenuContextual(onQuitar: ocupado ? nil : onQuitar))
    }
}

/// Mantener presionado el renglón ofrece «Quitar» (solo si se puede).
private struct AdjuntoMenuContextual: ViewModifier {
    let onQuitar: (() -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let onQuitar {
            content.contextMenu {
                Button(role: .destructive, action: onQuitar) {
                    Label("Quitar", systemImage: "trash")
                }
            }
        } else {
            content
        }
    }
}
