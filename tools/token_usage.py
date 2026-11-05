#!/usr/bin/env python3
"""How many tokens Claude Code used on this project, read from its local transcripts (nothing is sent anywhere).

Usage: python3 tools/token_usage.py
Counts the main conversation(s) and every helper agent, by model, and estimates what the same usage would cost
at public API prices (on a Claude plan you pay the plan fee instead; usage counts towards its limits).
"""
import collections
import glob
import json
import os

PROJECT = os.path.expanduser("~/.claude/projects/-Users-bijaydahal-uni-bob/")
# $ per million tokens: input, cache read, cache write (1-hour cache = 2× input), output. Public API prices, Oct 2026.
PRICES = {"claude-opus-5-5": (4, 0.20, 8, 20), "claude-sonnet-5-5": (2, 0.20, 4, 10)}
KEYS = ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens")


def calls(path):
    """Usage per model reply (a reply can be logged more than once while it streams; keep the largest)."""
    best = {}
    for line in open(path, errors="ignore"):
        try:
            o = json.loads(line)
        except ValueError:
            continue
        m = o.get("message") or {}
        if o.get("type") != "assistant" or not m.get("usage"):
            continue
        u, prev = m["usage"], best.get(m.get("id"), {})
        best[m.get("id") or id(o)] = {"model": m.get("model"), **{k: max(u.get(k, 0) or 0, prev.get(k, 0)) for k in KEYS}}
    return best.values()


def main():
    tot = collections.defaultdict(collections.Counter)
    main_files = glob.glob(PROJECT + "*.jsonl")
    agent_files = glob.glob(PROJECT + "*/**/*.jsonl", recursive=True)
    for group, files in (("main conversation", main_files), ("helper agents", agent_files)):
        for f in files:
            for c in calls(f):
                if c["model"] in PRICES:
                    tot[(group, c["model"])].update({k: c[k] for k in KEYS})
    names = {"input_tokens": "new input", "cache_read_input_tokens": "cache reads", "cache_creation_input_tokens": "cache writes",
             "output_tokens": "output"}
    grand = collections.Counter()
    cost = 0.0
    print(f"{len(main_files)} main conversation file(s), {len(agent_files)} helper agents\n")
    for (group, model), t in sorted(tot.items()):
        dollars = sum(t[k] / 1e6 * p for k, p in zip(KEYS, PRICES[model]))
        cost += dollars
        grand.update(t)
        print(f"{group}, {model}: {sum(t.values()) / 1e6:,.1f}M tokens  (≈ ${dollars:,.0f} at API prices)")
    print("\nAll together:")
    for k in KEYS:
        print(f"  {names[k]:13} {grand[k] / 1e6:9,.1f}M")
    print(f"  {'total':13} {sum(grand.values()) / 1e6:9,.1f}M tokens  ≈ ${cost:,.0f} at API prices")


if __name__ == "__main__":
    main()
