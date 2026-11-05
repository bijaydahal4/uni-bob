// Renders text to a WAV with any macOS voice, including the Siri-style ones `say` can't use.
// video/speak <voice identifier> <rate 0–1> <out.wav> <text…>
import AVFoundation
let a = CommandLine.arguments
let synth = AVSpeechSynthesizer()
let u = AVSpeechUtterance(string: a[4...].joined(separator: " "))
u.voice = AVSpeechSynthesisVoice(identifier: a[1])
u.rate = Float(a[2])!
var file: AVAudioFile?
var finished = false
synth.write(u) { buf in
    guard let pcm = buf as? AVAudioPCMBuffer else { return }
    if pcm.frameLength == 0 { finished = true; return }
    if file == nil { file = try! AVAudioFile(forWriting: URL(fileURLWithPath: a[3]), settings: pcm.format.settings,
                                             commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved) }
    try! file!.write(from: pcm)
}
let deadline = Date().addingTimeInterval(120)
while !finished && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
if !finished { print("timed out"); exit(1) }
let seconds = file.map { Double($0.length) / $0.processingFormat.sampleRate }
file = nil   // closes the file
print(seconds.map { String(format: "%.2fs", $0) } ?? "no audio")
