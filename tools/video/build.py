#!/usr/bin/env python3
"""Finish the demo video: captions (.srt too), background music, audio mix, then the Swift compositor.

Usage: python3 tools/video/build.py      (after voice.py and record.py)
Writes video/uni-bob-demo.mp4 and video/uni-bob-demo.srt.
The music is generated here (soft chords and a gentle arpeggio), so there are no licensing questions.
"""
import array
import json
import math
import os
import re
import subprocess
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.join(os.path.dirname(os.path.dirname(HERE)), "video")
RATE = 48000
# How the voice says the figures, so captions with numbers are timed like the speech.
SPOKEN = {"436": "four hundred and thirty-six", "64": "sixty-four", "130": "a hundred and thirty", "59": "fifty-nine",
          "2028": "twenty twenty-eight", "2028.": "twenty twenty-eight.", "GCSEs,": "G C S E s,"}


WEAK = {"a", "an", "the", "and", "or", "but", "to", "of", "in", "at", "if", "for", "with", "by", "from", "what's",
        "your", "you", "each", "how", "whether", "can", "that", "this", "it", "is", "are", "be", "so", "as"}


def chunks(text, max_words=14, max_chars=84):
    """Caption lines: break at punctuation where possible, never right after a small joining word."""
    words, out, cur = text.split(), [], []
    for w in words:
        cur.append(w)
        if re.search(r"[,.:;?!]$", w) and len(cur) >= 4:
            out.append(cur); cur = []
        elif len(cur) >= max_words or len(" ".join(cur)) >= max_chars:
            keep = len(cur)
            while keep > 3 and cur[keep - 1].lower().strip(",.") in WEAK:
                keep -= 1
            out.append(cur[:keep]); cur = cur[keep:]
    if cur:
        if out and len(cur) <= 2:
            out[-1] += cur
        else:
            out.append(cur)
    return [" ".join(c) for c in out]


def weight(chunk):
    return sum(len(SPOKEN.get(w, w)) + 1 for w in chunk.split())


def captions(tl, script):
    text = {s["id"]: s["caption"] for s in script["scenes"]}
    caps = []
    for sc in tl["scenes"]:
        parts = chunks(text[sc["id"]])
        total = sum(weight(p) for p in parts)
        t = sc["voice"]
        for p in parts:
            d = sc["dur"] * weight(p) / total
            caps.append({"start": round(t, 2), "end": round(t + d - 0.04, 2), "text": p})
            t += d
    return caps


def srt(caps):
    def ts(x):
        ms = int(round(x * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    return "\n".join(f"{i}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}\n" for i, c in enumerate(caps, 1))


def note(n):  # MIDI note → Hz
    return 440 * 2 ** ((n - 69) / 12)


def music(seconds):
    """Calm 4-chord loop (C – G – Am – F, 84 bpm): a soft pad, a light arpeggio and a low bass. Mono floats."""
    bar = 4 * 60 / 84
    chords = [[48, 60, 64, 67], [43, 59, 62, 67], [45, 60, 64, 69], [41, 57, 60, 65]]
    nb = int(bar * RATE)
    loop = []
    for ch in chords:
        seg = [0.0] * nb
        for k, m in enumerate(ch):   # pad: sine partials with a slow swell
            f, amp = note(m), (0.22 if k == 0 else 0.13)
            w = 2 * math.pi * f / RATE
            for i in range(nb):
                env = min(1, i / (0.35 * RATE), (nb - i) / (0.4 * RATE))
                seg[i] += amp * env * (math.sin(w * i) + 0.18 * math.sin(2 * w * i))
        step = nb // 8   # arpeggio: eighth notes an octave up, quick decay
        for j in range(8):
            f = note(ch[1 + j % 3] + 12)
            w = 2 * math.pi * f / RATE
            for i in range(min(step * 2, nb - j * step)):
                seg[j * step + i] += 0.09 * math.exp(-i / (0.18 * RATE)) * math.sin(w * i)
        loop.extend(seg)
    n = int(seconds * RATE)
    return [loop[i % len(loop)] for i in range(n)]


def mix(tl, total):
    n = int(total * RATE)
    voice = [0.0] * n
    speaking = [0.0] * n
    for sc in tl["scenes"]:
        with wave.open(os.path.join(V, "voice", sc["id"] + ".wav")) as w:
            data = array.array("h", w.readframes(w.getnframes()))
        o = int(sc["voice"] * RATE)
        for i, v in enumerate(data):
            if o + i < n:
                voice[o + i] = v / 32768
        for i in range(max(0, o - RATE // 3), min(n, o + len(data) + RATE // 3)):
            speaking[i] = 1.0
    bed = music(total)
    out = array.array("h")
    duck = 0.0
    for i in range(n):
        duck += (speaking[i] - duck) * 0.0004                     # smooth ducking under the voice
        g = 0.20 - 0.11 * duck
        fade = min(1.0, i / (1.5 * RATE), (n - i) / (2.5 * RATE))   # music fades in and out
        m = bed[i] * g * fade
        v = voice[i] * 0.95
        left, right = v + m * 0.92, v + m
        out.append(max(-32767, min(32767, int(left * 32767))))
        out.append(max(-32767, min(32767, int(right * 32767))))
    with wave.open(os.path.join(V, "audio.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(out.tobytes())


def main():
    tl = json.load(open(os.path.join(V, "timeline.json")))
    script = json.load(open(os.path.join(HERE, "script.json")))
    caps = captions(tl, script)
    json.dump({"captions": caps}, open(os.path.join(V, "captions.json"), "w"), indent=1)
    open(os.path.join(V, "uni-bob-demo.srt"), "w").write(srt(caps))
    total = len(tl["frames"]) / tl["fps"]
    print(f"{len(caps)} captions; mixing {total:.1f}s of audio…")
    mix(tl, total)
    binary = os.path.join(V, "compose")
    src = os.path.join(HERE, "compose.swift")
    if not os.path.exists(binary) or os.path.getmtime(binary) < os.path.getmtime(src):
        subprocess.run(["swiftc", "-O", src, "-o", binary], check=True)
    subprocess.run([binary, V], check=True)


if __name__ == "__main__":
    main()
