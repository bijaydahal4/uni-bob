#!/usr/bin/env python3
"""Narration for the demo video, made with a voice installed on this Mac (no online service).

Usage: python3 tools/video/voice.py [--voice "Serena (Premium)"] [--rate 150]
Writes video/voice/<scene>.wav (48 kHz mono) and video/voice/durations.json.
"""
import argparse
import json
import os
import subprocess
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "video", "voice")
# Most natural British female voices first; Apple's Premium/Enhanced ones are free downloads
# (System Settings → Accessibility → Spoken Content → System voice → Manage Voices).
# Identifiers starting "com.apple." are Siri-style voices that `say` can't use; tools/video/speak.swift renders them.
PREFERRED = ["Serena (Premium)", "Stephanie (Premium)", "Kate (Premium)", "Serena (Enhanced)",
             "Stephanie (Enhanced)", "Kate (Enhanced)", "com.apple.ttsbundle.siri_martha_en-GB_compact", "Flo (English (UK))"]
SPEAK = os.path.join(ROOT, "video", "speak")


def installed():
    out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    return [line.split("  ")[0].strip() for line in out.splitlines() if line.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice")
    ap.add_argument("--rate", type=int, default=150, help="words a minute for `say` voices")
    ap.add_argument("--speed", type=float, default=0.5, help="0–1 speaking rate for Siri-style voices")
    a = ap.parse_args()
    have = installed()
    src = os.path.join(os.path.dirname(__file__), "speak.swift")
    if not os.path.exists(SPEAK) or os.path.getmtime(SPEAK) < os.path.getmtime(src):
        subprocess.run(["swiftc", "-O", src, "-o", SPEAK], check=True)
    have += [v for v in PREFERRED if v.startswith("com.apple.")]   # speak.swift reports if one is missing
    voice = a.voice or next((v for v in PREFERRED if v in have), None)
    if not voice or voice not in have:
        raise SystemExit(f"Voice not installed: {voice}. Installed British voices: {[v for v in have if 'UK' in v or v in PREFERRED]}")
    os.makedirs(OUT, exist_ok=True)
    scenes = json.load(open(os.path.join(os.path.dirname(__file__), "script.json")))["scenes"]
    durations = {}
    for s in scenes:
        aiff, wav = os.path.join(OUT, s["id"] + ".aiff"), os.path.join(OUT, s["id"] + ".wav")
        if voice.startswith("com.apple."):
            subprocess.run([SPEAK, voice, str(a.speed), aiff, s["say"]], check=True, capture_output=True)
        else:
            subprocess.run(["say", "-v", voice, "-r", str(a.rate), "-o", aiff, s["say"]], check=True)
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@48000", "-c", "1", aiff, wav], check=True)
        os.remove(aiff)
        with wave.open(wav) as w:
            durations[s["id"]] = round(w.getnframes() / w.getframerate(), 3)
    json.dump({"voice": voice, "rate": a.rate, "speed": a.speed, "durations": durations}, open(os.path.join(OUT, "durations.json"), "w"), indent=1)
    total = sum(durations.values())
    words = sum(len(s["caption"].split()) for s in scenes)
    print(f"{voice}: {total:.1f}s of narration, {words} words ≈ {words / total * 60:.0f} words a minute")
    for k, v in durations.items():
        print(f"  {k:11} {v:5.1f}s")


if __name__ == "__main__":
    main()
