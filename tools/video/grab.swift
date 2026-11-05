// Saves stills from a finished video for checking: video/grab <video.mp4> <outdir> <seconds>…
import AVFoundation
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
let gen = AVAssetImageGenerator(asset: AVURLAsset(url: URL(fileURLWithPath: a[1])))
gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
try? FileManager.default.createDirectory(atPath: a[2], withIntermediateDirectories: true)
for s in a.dropFirst(3) {
    let img = try! gen.copyCGImage(at: CMTime(seconds: Double(s)!, preferredTimescale: 600), actualTime: nil)
    let url = URL(fileURLWithPath: a[2]).appendingPathComponent("t\(s).jpg")
    let d = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, img, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
    CGImageDestinationFinalize(d)
}
