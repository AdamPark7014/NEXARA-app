import SwiftUI
import PDFKit

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

struct PDFViewerScreen: View {
    let title: String
    let data: Data

    var body: some View {
        PDFViewerView(data: data)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: data, preview: SharePreview(title, image: Image(systemName: "doc.richtext")))
                }
            }
    }
}
