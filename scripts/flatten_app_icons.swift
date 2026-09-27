#!/usr/bin/env swift
import Foundation
import CoreGraphics
import ImageIO

func flattenPNG(at url: URL) throws {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        throw NSError(domain: "flatten", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to load \(url.path)"])
    }
    let width = cg.width
    let height = cg.height
    guard width > 0 && height > 0 else {
        throw NSError(domain: "flatten", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid image size for \(url.path)"])
    }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    // 32-bit RGB (no alpha) using noneSkipLast
    let bitmapInfo = CGBitmapInfo.byteOrder32Big.union(CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue))
    guard let ctx = CGContext(data: nil,
                              width: width,
                              height: height,
                              bitsPerComponent: 8,
                              bytesPerRow: 0,
                              space: colorSpace,
                              bitmapInfo: bitmapInfo.rawValue) else {
        throw NSError(domain: "flatten", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to create CGContext for \(url.path)"])
    }
    // Fill white background
    ctx.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    // Draw source image
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let outImage = ctx.makeImage() else {
        throw NSError(domain: "flatten", code: 4, userInfo: [NSLocalizedDescriptionKey: "Failed to create output image for \(url.path)"])
    }
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
        throw NSError(domain: "flatten", code: 5, userInfo: [NSLocalizedDescriptionKey: "Failed to create destination for \(url.path)"])
    }
    CGImageDestinationAddImage(dest, outImage, nil)
    if !CGImageDestinationFinalize(dest) {
        throw NSError(domain: "flatten", code: 6, userInfo: [NSLocalizedDescriptionKey: "Failed to finalize PNG for \(url.path)"])
    }
    FileHandle.standardOutput.write(("Flattened \(url.lastPathComponent) \(width)x\(height)\n").data(using: .utf8)!)
}

func main() -> Int32 {
    let args = CommandLine.arguments
    guard args.count == 2 else {
        fputs("Usage: flatten_app_icons.swift <AppIcon.appiconset dir>\n", stderr)
        return 2
    }
    let dirURL = URL(fileURLWithPath: args[1])
    guard let items = try? FileManager.default.contentsOfDirectory(at: dirURL, includingPropertiesForKeys: nil, options: []) else {
        fputs("Cannot list directory \(dirURL.path)\n", stderr)
        return 2
    }
    var failures = 0
    for url in items where url.pathExtension.lowercased() == "png" {
        do { try flattenPNG(at: url) }
        catch {
            failures += 1
            fputs("WARN: \(error)\n", stderr)
        }
    }
    return failures == 0 ? 0 : 1
}

exit(main())

