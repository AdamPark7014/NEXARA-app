import AVFoundation
import UIKit

/// Saca los 8 cuadros de la vuelta del video grabado en el teléfono, con los mismos tiempos que la web
/// y Android (`CapturaGuiadaRules.tiemposCuadros`: el centro de cada octavo), y deja el video en MP4
/// para que la web lo reproduzca en cualquier navegador.
enum CuadrosVuelta {

    struct Resultado {
        let duracionSeg: Double
        /// JPEG por slot (`vuelta-1` … `vuelta-8`).
        let cuadros: [String: Data]
    }

    /// Solo la duración, para el contador y para validar antes de extraer.
    static func duracionSeg(_ video: URL) async -> Double? {
        let asset = AVURLAsset(url: video)
        guard let duracion = try? await asset.load(.duration) else { return nil }
        let segundos: Double = CMTimeGetSeconds(duracion)
        guard segundos.isFinite, segundos > 0 else { return nil }
        return segundos
    }

    /// - Parameter ladoMax: el lado largo del cuadro; 1280 basta para ver un rayón y no infla la subida.
    static func extraer(_ video: URL, ladoMax: CGFloat = 1280, calidad: CGFloat = 0.85) async throws -> Resultado {
        guard let duracion = await duracionSeg(video) else {
            throw CoreError.message("No se pudo leer el video de la vuelta; vuelve a grabarlo")
        }
        let generador = AVAssetImageGenerator(asset: AVURLAsset(url: video))
        // Respeta la orientación con que se grabó (vertical u horizontal).
        generador.appliesPreferredTrackTransform = true
        // El cuadro exacto, no el keyframe más cercano: si no, dos vistas pueden salir iguales.
        generador.requestedTimeToleranceBefore = .zero
        generador.requestedTimeToleranceAfter = .zero
        generador.maximumSize = CGSize(width: ladoMax, height: ladoMax)

        var cuadros: [String: Data] = [:]
        let slots = CapturaGuiadaRules.slotsVuelta
        for (i, t) in CapturaGuiadaRules.tiemposCuadros(duracion, cuadros: slots.count).enumerated() {
            let imagen: CGImage
            do {
                imagen = try await generador.image(at: CMTime(seconds: t, preferredTimescale: 600)).image
            } catch {
                throw CoreError.message("No se pudo sacar un cuadro del video; vuelve a grabarlo")
            }
            guard let jpeg = UIImage(cgImage: imagen).jpegData(compressionQuality: calidad) else {
                throw CoreError.message("No se pudo sacar un cuadro del video; vuelve a grabarlo")
            }
            cuadros[slots[i]] = jpeg
        }
        return Resultado(duracionSeg: duracion, cuadros: cuadros)
    }

    /// La cámara de iOS graba `.mov`. Lo pasa a `.mp4` sin recomprimir (mismo video, otro contenedor).
    /// Si ya es MP4 o no se puede, regresa el mismo archivo: la API acepta los dos.
    static func aMp4(_ video: URL) async -> URL {
        guard video.pathExtension.lowercased() == "mov" else { return video }
        let asset = AVURLAsset(url: video)
        guard let sesion = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough),
              sesion.supportedFileTypes.contains(.mp4) else { return video }
        let destino = video.deletingPathExtension().appendingPathExtension("mp4")
        try? FileManager.default.removeItem(at: destino)
        sesion.outputURL = destino
        sesion.outputFileType = .mp4
        sesion.shouldOptimizeForNetworkUse = true
        await withCheckedContinuation { (fin: CheckedContinuation<Void, Never>) in
            sesion.exportAsynchronously { fin.resume() }
        }
        return sesion.status == .completed ? destino : video
    }
}
