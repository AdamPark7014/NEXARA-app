#!/usr/bin/env swift
import Foundation
import AppKit

func flattenPng(at url: URL) throws {
    guard let img = NSImage(contentsOf: url) else {
        throw NSError(domain: "flatten", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to load \(url.path)"])
    }
    var width = Int(img.size.width)
    var height = Int(img.size.height)
    if let rep = img.representations.first {
        if rep.pixelsWide > 0 { width = rep.pixelsWide }
        if rep.pixelsHigh > 0 { height = rep.pixelsHigh }
    }
    guard width > 0, height > 0 else {
        throw NSError(domain: "flatten", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid image size for \(url.path)"])
    }
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil,
                                        pixelsWide: width,
                                        pixelsHigh: height,
                                        bitsPerSample: 8,
                                        samplesPerPixel: 3,
                                        hasAlpha: false,
                                        isPlanar: false,
                                        colorSpaceName: .deviceRGB,
                                        bytesPerRow: 0,
                                        bitsPerPixel: 24) else {
        throw NSError(domain: "flatten", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to create bitmap for \(url.path)"])
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    img.draw(in: NSRect(x: 0, y: 0, width: width, height: height), from: .zero, operation: .sourceOver, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "flatten", code: 4, userInfo: [NSLocalizedDescriptionKey: "Failed to encode PNG for \(url.path)"])
    }
    try data.write(to: url, options: .atomic)
    FileHandle.standardOutput.write(("Flattened \(url.lastPathComponent) \(width)x\(height)\n").data(using: .utf8)!)
}

func main() throws {
    let args = CommandLine.arguments
    guard args.count == 2 else {
        FileHandle.standardError.write("Usage: flatten_app_icons.swift <AppIcon.appiconset dir>\n".data(using: .utf8)!)
        exit(2)
    }
    let dir = URL(fileURLWithPath: args[1])
    let fm = FileManager.default
    guard let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil, options: []) else {
        throw NSError(domain: "flatten", code: 5, userInfo: [NSLocalizedDescriptionKey: "Cannot list directory \(dir.path)"])
    }
    var failures = 0
    for url in items where url.pathExtension.lowercased() == "png" {
        do { try autoreleasepool { try flattenPng(at: url) } }
        catch {
            failures += 1
            FileHandle.standardError.write(("WARN: \(error)\n").data(using: .utf8)!)
        }
    }
    if failures > 0 {
        FileHandle.standardError.write(("Completed with \(failures) failures\n").data(using: .utf8)!)
    }
}

do { try main() } catch {
    FileHandle.standardError.write(("ERROR: \(error)\n").data(using: .utf8)!)
    exit(1)
}

