// Turns the recorded frames into the finished demo video (1920×1080, 30 fps, H.264 + AAC).
// Draws the cursor, click ripples, highlights, gentle zooms, captions, title cards and fades on top of
// the real app screenshots. Built and run by tools/video/build.py:
//   swiftc -O tools/video/compose.swift -o video/compose && video/compose video
import AVFoundation
import CoreText
import Foundation
import ImageIO

let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "video")
func json(_ name: String) -> [String: Any] {
    let data = try! Data(contentsOf: dir.appendingPathComponent(name))
    return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
}
let timeline = json("timeline.json")
let frames = timeline["frames"] as! [[String: Any]]
let titles = timeline["titles"] as! [[String: Any]]
let captions = (json("captions.json")["captions"] as! [[String: Any]])
let fps = timeline["fps"] as! Int
let W = 1920, H = 1080
let total = Double(frames.count) / Double(fps)
let outURL = dir.appendingPathComponent("uni-bob-demo.mp4")
try? FileManager.default.removeItem(at: outURL)

let space = CGColorSpace(name: CGColorSpace.sRGB)!
func rgb(_ hex: Int, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: a)
}
let pink = 0xF2A7C1

// ---- text --------------------------------------------------------------------------------------
func font(_ size: CGFloat, _ weight: CGFloat) -> CTFont {
    let base = CTFontCreateUIFontForLanguage(.system, size, nil)!
    let traits = [kCTFontWeightTrait: weight] as CFDictionary
    let desc = CTFontDescriptorCreateCopyWithAttributes(CTFontCopyFontDescriptor(base), [kCTFontTraitsAttribute: traits] as CFDictionary)
    return CTFontCreateWithFontDescriptor(desc, size, nil)
}
func attributed(_ s: String, _ f: CTFont, _ color: CGColor, center: Bool = true) -> NSAttributedString {
    var align = center ? CTTextAlignment.center : .left
    let settings = [CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: &align)]
    let para = CTParagraphStyleCreate(settings, 1)
    return NSAttributedString(string: s, attributes: [kCTFontAttributeName as NSAttributedString.Key: f,
        kCTForegroundColorAttributeName as NSAttributedString.Key: color, kCTParagraphStyleAttributeName as NSAttributedString.Key: para])
}
/// Draws text centred horizontally with its top at `top` (pixels from the top of the frame); returns the box drawn.
func drawText(_ ctx: CGContext, _ str: NSAttributedString, maxWidth: CGFloat, top: CGFloat? = nil, bottom: CGFloat? = nil,
              box: CGColor? = nil, pad: CGSize = .zero) {
    let fs = CTFramesetterCreateWithAttributedString(str)
    let size = CTFramesetterSuggestFrameSizeWithConstraints(fs, CFRange(), nil, CGSize(width: maxWidth, height: 2000), nil)
    let w = ceil(size.width), h = ceil(size.height)
    let x = (CGFloat(W) - w) / 2
    let yTop = top ?? (CGFloat(H) - bottom! - h)
    let rect = CGRect(x: x, y: CGFloat(H) - yTop - h, width: w, height: h)   // CoreGraphics origin is bottom-left
    if let box = box {
        let r = rect.insetBy(dx: -pad.width, dy: -pad.height)
        ctx.addPath(CGPath(roundedRect: r, cornerWidth: 18, cornerHeight: 18, transform: nil))
        ctx.setFillColor(box)
        ctx.fillPath()
    }
    CTFrameDraw(CTFramesetterCreateFrame(fs, CFRange(), CGPath(rect: rect, transform: nil), nil), ctx)
}

// ---- pictures ----------------------------------------------------------------------------------
var cacheIndex = -1
var cacheImage: CGImage?
func image(_ i: Int) -> CGImage {
    if i != cacheIndex {
        let url = dir.appendingPathComponent("frames").appendingPathComponent(String(format: "%05d.jpg", i))
        let src = CGImageSourceCreateWithURL(url as CFURL, nil)!
        cacheImage = CGImageSourceCreateImageAtIndex(src, 0, nil)
        cacheIndex = i
    }
    return cacheImage!
}
func num(_ v: Any?) -> Double? { (v as? NSNumber)?.doubleValue }
func fade(_ t: Double, _ start: Double, _ end: Double, _ edge: Double = 0.4) -> CGFloat {
    if t < start || t > end { return 0 }
    return CGFloat(min(1, (t - start) / edge, (end - t) / edge))
}
func cursorPath() -> CGPath {
    let p = CGMutablePath()   // classic arrow pointer, tip at (0, 0), y pointing down
    let pts: [(CGFloat, CGFloat)] = [(0, 0), (0, 25), (6.2, 19.2), (10.3, 28.4), (14, 26.8), (10, 17.8), (17.6, 17.8)]
    p.move(to: CGPoint(x: pts[0].0, y: pts[0].1))
    for q in pts.dropFirst() { p.addLine(to: CGPoint(x: q.0, y: q.1)) }
    p.closeSubpath()
    return p
}
let arrow = cursorPath()
let captionFont = font(46, 0.23)
let titleFont = font(104, 0.4)
let subFont = font(46, 0.0)

func render(_ ctx: CGContext, _ n: Int) {
    let f = frames[n]
    let t = Double(n) / Double(fps)
    let z = (f["zoom"] as! [NSNumber]).map { CGFloat($0.doubleValue) }
    let s = z[0], cw = CGFloat(W) / s, ch = CGFloat(H) / s
    let left = min(max(z[1] - cw / 2, 0), CGFloat(W) - cw), top = min(max(z[2] - ch / 2, 0), CGFloat(H) - ch)
    func screen(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: (x - left) * s, y: CGFloat(H) - (y - top) * s) }

    ctx.interpolationQuality = .high
    ctx.draw(image(f["img"] as! Int), in: CGRect(x: -left * s, y: CGFloat(H) - (CGFloat(H) - top) * s, width: CGFloat(W) * s, height: CGFloat(H) * s))

    if let hl = f["hl"] as? [NSNumber] {   // highlight ring
        let v = hl.map { CGFloat($0.doubleValue) }
        let a = screen(v[0], v[1]), b = screen(v[0] + v[2], v[1] + v[3])
        let r = CGRect(x: a.x, y: b.y, width: b.x - a.x, height: a.y - b.y)
        let path = CGPath(roundedRect: r, cornerWidth: 18 * s, cornerHeight: 18 * s, transform: nil)
        ctx.addPath(path); ctx.setFillColor(rgb(pink, 0.10 * v[4])); ctx.fillPath()
        ctx.addPath(path); ctx.setStrokeColor(rgb(pink, 0.95 * v[4])); ctx.setLineWidth(5); ctx.strokePath()
    }

    let cur = (f["cur"] as! [NSNumber]).map { CGFloat($0.doubleValue) }
    let p = screen(cur[0], cur[1])
    if let c = num(f["click"]) {   // click ripple
        let k = CGFloat(c / 0.6)
        let rad = 14 + 46 * k
        ctx.setFillColor(rgb(pink, 0.38 * (1 - k)))
        ctx.fillEllipse(in: CGRect(x: p.x - rad, y: p.y - rad, width: rad * 2, height: rad * 2))
    }
    ctx.saveGState()   // cursor (same size at any zoom)
    ctx.translateBy(x: p.x, y: p.y)
    ctx.scaleBy(x: 1.45, y: -1.45)
    ctx.setShadow(offset: CGSize(width: 0, height: -2), blur: 6, color: rgb(0, 0.45))
    ctx.addPath(arrow); ctx.setFillColor(rgb(0x000000)); ctx.fillPath()
    ctx.setShadow(offset: .zero, blur: 0, color: nil)
    ctx.addPath(arrow); ctx.setStrokeColor(rgb(0xFFFFFF)); ctx.setLineWidth(1.6); ctx.setLineJoin(.round); ctx.strokePath()
    ctx.restoreGState()

    for ti in titles {   // title cards
        let a = fade(t, num(ti["start"])!, num(ti["end"])!, 0.6)
        if a <= 0 { continue }
        ctx.setFillColor(rgb(0x000000, 0.62 * a)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        drawText(ctx, attributed(ti["text"] as! String, titleFont, rgb(0xFFFFFF, a)), maxWidth: 1600, top: 400)
        drawText(ctx, attributed(ti["sub"] as! String, subFont, rgb(pink, a)), maxWidth: 1600, top: 540)
    }

    for c in captions {   // captions
        let a = fade(t, num(c["start"])!, num(c["end"])!, 0.12)
        if a <= 0 { continue }
        drawText(ctx, attributed(c["text"] as! String, captionFont, rgb(0xFFFFFF, a)), maxWidth: 1480, bottom: 64,
                 box: rgb(0x0B0B0F, 0.80 * a), pad: CGSize(width: 30, height: 16))
    }

    let black = max(0, 1 - t / 0.5, 1 - (total - t) / 1.0)   // fade in from / out to black
    if black > 0 { ctx.setFillColor(rgb(0x000000, CGFloat(min(1, black)))); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H)) }
}

// ---- encode ------------------------------------------------------------------------------------
let writer = try! AVAssetWriter(outputURL: outURL, fileType: .mp4)
let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 14_000_000, AVVideoExpectedSourceFrameRateKey: fps,
                                      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: fps * 2]])
vIn.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vIn, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(vIn)

let audioAsset = AVURLAsset(url: dir.appendingPathComponent("audio.wav"))
let reader = try! AVAssetReader(asset: audioAsset)
let pcm: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false,
                          AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false]
let aOut = AVAssetReaderTrackOutput(track: audioAsset.tracks(withMediaType: .audio)[0], outputSettings: pcm)
reader.add(aOut)
let aIn = AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000,
                                                                 AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 192_000])
aIn.expectsMediaDataInRealTime = false
writer.add(aIn)

writer.startWriting(); reader.startReading()
writer.startSession(atSourceTime: .zero)
let group = DispatchGroup()
var n = 0
group.enter()
vIn.requestMediaDataWhenReady(on: DispatchQueue(label: "video")) {
    while vIn.isReadyForMoreMediaData {
        if n >= frames.count { vIn.markAsFinished(); group.leave(); return }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
        CVPixelBufferLockBaseAddress(pb!, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: W, height: H, bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: space,
                            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
        render(ctx, n)
        CVPixelBufferUnlockBaseAddress(pb!, [])
        adaptor.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: CMTimeScale(fps)))
        n += 1
        if n % 300 == 0 { print("  \(n)/\(frames.count) frames") }
    }
}
group.enter()
aIn.requestMediaDataWhenReady(on: DispatchQueue(label: "audio")) {
    while aIn.isReadyForMoreMediaData {
        if let buf = aOut.copyNextSampleBuffer() { aIn.append(buf) } else { aIn.markAsFinished(); group.leave(); return }
    }
}
group.wait()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { print("FAILED: \(String(describing: writer.error))"); exit(1) }
print("Wrote \(outURL.path) (\(String(format: "%.1f", total))s)")
