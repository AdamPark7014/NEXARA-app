import SwiftUI
import PDFKit
import QuickLook
import UIKit

/// Visor PDF nativo con PDFKit (scroll, zoom, seleccionar texto).
struct PDFViewerView: UIViewRepresentable {
    let data: Data

    func makeUIView(context: Context) -> PDFView {
        let v = PDFView()
        v.autoScales = true
        v.displayMode = .singlePageContinuous
        v.displayDirection = .vertical
        v.document = PDFDocument(data: data)
        return v
    }

    func updateUIView(_ uiView: PDFView, context: Context) {
        if uiView.document == nil {
            uiView.document = PDFDocument(data: data)
        }
    }
}

/// Un PDF a pantalla completa, con «Guardar en Archivos» y «Compartir».
///
/// Antes se compartían los bytes sueltos (`ShareLink(item: data)`): iOS los entrega como
/// «datos» sin nombre ni tipo, y WhatsApp, Correo o «Guardar en Archivos» se quedaban
/// esperando un archivo que nunca llegaba (Adam, 07-10: «intento descargar o enviar por
/// WhatsApp las cotizaciones y se queda trabado»). Ahora se escribe primero un archivo
/// temporal con su nombre y su extensión, y eso es lo que se comparte o se guarda.
struct PDFViewerScreen: View {
    let title: String
    let data: Data

    var body: some View {
        PDFViewerView(data: data)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .nxAccionesDeArchivo(data: data, nombre: title, extensionPorOmision: "pdf")
    }
}

/// Cualquier documento (PDF, Excel, Word, imagen…) embebido con Vista Rápida de iOS, con
/// «Guardar en Archivos» y «Compartir». `url` es un archivo local (ver `NxArchivoTemporal`).
struct DocumentoScreen: View {
    let titulo: String
    let url: URL

    var body: some View {
        NxVistaRapida(url: url)
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle(titulo)
            .navigationBarTitleDisplayMode(.inline)
            .nxAccionesDeArchivo(url: url, nombre: titulo)
    }
}

// MARK: - Archivo temporal

/// Bytes escritos como archivo de verdad, con un nombre legible y su extensión: así iOS sabe
/// qué es (PDF, Excel…) y lo ofrece a WhatsApp, Correo o Archivos con ese nombre.
enum NxArchivoTemporal {
    /// Cada archivo va en su propia carpeta para conservar el nombre tal cual sin chocar
    /// con otro igual («Cotización COT-0012.pdf» dos veces).
    static func escribir(_ data: Data, nombre: String, extensionPorOmision: String) throws -> URL {
        var base = nombre.trimmingCharacters(in: .whitespacesAndNewlines)
        base = base.replacingOccurrences(of: "[/\\\\:?%*|\"<>\\n\\r]", with: "-", options: .regularExpression)
        if base.isEmpty { base = "documento" }
        // Se fuerza aunque el nombre ya tenga un punto: los folios con varios participantes
        // llevan uno («NEX-…-JA.CE-R2») y sin `.pdf` iOS volvería a no saber qué es.
        if !extensionPorOmision.isEmpty, !base.lowercased().hasSuffix(".\(extensionPorOmision.lowercased())") {
            base += ".\(extensionPorOmision)"
        }
        let carpeta = FileManager.default.temporaryDirectory
            .appendingPathComponent("Compartir", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        let url = carpeta.appendingPathComponent(base)
        try data.write(to: url, options: .atomic)
        return url
    }
}

// MARK: - Guardar y compartir

private struct NxAccionesDeArchivo: ViewModifier {
    /// Uno de los dos: bytes que hay que escribir primero, o un archivo local ya escrito.
    let data: Data?
    let urlListo: URL?
    let nombre: String
    let extensionPorOmision: String

    @State private var archivo: URL?
    @State private var guardando = false
    @State private var error: String?

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if let archivo {
                        Button {
                            guardando = true
                        } label: {
                            Image(systemName: "square.and.arrow.down")
                        }
                        .accessibilityLabel("Guardar en Archivos")

                        ShareLink(item: archivo) {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .accessibilityLabel("Compartir")
                    }
                }
            }
            .task {
                guard archivo == nil else { return }
                if let urlListo {
                    archivo = urlListo
                } else if let data {
                    do {
                        archivo = try NxArchivoTemporal.escribir(data, nombre: nombre, extensionPorOmision: extensionPorOmision)
                    } catch {
                        self.error = "No se pudo preparar el archivo para compartir."
                    }
                }
            }
            .sheet(isPresented: $guardando) {
                if let archivo {
                    NxGuardarEnArchivos(url: archivo) { guardando = false }
                        .ignoresSafeArea()
                }
            }
            .alert(
                "No se pudo preparar el archivo",
                isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })
            ) {
                Button("Aceptar", role: .cancel) { error = nil }
            } message: {
                Text(error ?? "")
            }
    }
}

extension View {
    /// «Guardar en Archivos» y «Compartir» en la barra, para unos bytes (se escriben como archivo).
    func nxAccionesDeArchivo(data: Data, nombre: String, extensionPorOmision: String) -> some View {
        modifier(NxAccionesDeArchivo(data: data, urlListo: nil, nombre: nombre, extensionPorOmision: extensionPorOmision))
    }

    /// «Guardar en Archivos» y «Compartir» en la barra, para un archivo local.
    func nxAccionesDeArchivo(url: URL, nombre: String) -> some View {
        modifier(NxAccionesDeArchivo(data: nil, urlListo: url, nombre: nombre, extensionPorOmision: ""))
    }
}

/// «Guardar en Archivos»: el selector de iOS para elegir carpeta (iCloud, En mi iPhone…).
struct NxGuardarEnArchivos: UIViewControllerRepresentable {
    let url: URL
    var onTerminar: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onTerminar: onTerminar) }

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onTerminar: () -> Void
        init(onTerminar: @escaping () -> Void) { self.onTerminar = onTerminar }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onTerminar()
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            onTerminar()
        }
    }
}

// MARK: - Vista Rápida embebida

/// Vista Rápida (QuickLook) dentro de la pantalla: PDF, Excel, Word, PowerPoint, imágenes y
/// texto, sin salir de la app y sin otra app instalada.
struct NxVistaRapida: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {
        if context.coordinator.url != url {
            context.coordinator.url = url
            controller.reloadData()
        }
    }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        var url: URL
        init(url: URL) { self.url = url }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}
