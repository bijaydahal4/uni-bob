#!/usr/bin/env python3
"""Where did a research agent's usage go? Summarises agent transcripts (JSONL) without printing them.

Usage: python3 tools/agent_cost.py LABEL=path/to/transcript.jsonl [LABEL=…]
For each agent: model turns, tool calls by kind, output tokens, newly cached context, cached context re-read,
and the biggest tool results (what bloated the context).
"""
import json
import re
import sys


def kind(name, inp):
    if name in ("Read",):
        p = inp.get("file_path", "")
        return "read: instructions" if "INSTRUCTIONS" in p else "read: packet" if "packets/" in p else "read: other file"
    if name in ("Write", "Edit"):
        return "write builder/json"
    if name in ("WebSearch",):
        return "web search"
    if name in ("WebFetch",):
        return "web fetch (AI summary)"
    if name == "Bash":
        c = inp.get("command", "")
        if "digest.py" in c:
            return "page read: digest"
        if "page_text.py" in c and "--links" in c:
            return "discovery: links"
        if "page_text.py" in c:
            return "page read: page_text"
        if re.search(r"check_evidence|auto_verify", c) and "build" in c:
            return "run builder + checks"
        if re.search(r"check_evidence|auto_verify", c):
            return "checks"
        if "research/tmp/build" in c or "python3 -c" in c and "json" in c:
            return "run builder / inspect json"
        if re.search(r"\b(sed|grep|head|tail|cat|awk)\b", c):
            return "re-read part of a saved page"
        if re.search(r"\bls\b|find ", c):
            return "list files"
        if "curl" in c:
            return "api call"
        return "other shell"
    return f"other: {name}"


def analyse(path):
    calls, results, usage = [], {}, {"turns": 0, "out": 0, "create": 0, "read": 0, "fresh": 0}
    per_msg = {}  # one API response can be split over several transcript lines; count it once (max of each field)
    for line in open(path, encoding="utf-8"):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        m = d.get("message") or {}
        if not isinstance(m, dict):
            continue
        if m.get("role") == "assistant":
            u = m.get("usage") or {}
            mid = m.get("id") or d.get("uuid")
            prev = per_msg.get(mid, {})
            per_msg[mid] = {k: max(prev.get(k, 0), u.get(k, 0) or 0) for k in
                            ("output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "input_tokens")}
            for b in m.get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    calls.append((b["id"], kind(b.get("name"), b.get("input") or {})))
        elif m.get("role") == "user":
            for b in m.get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    c = b.get("content")
                    text = c if isinstance(c, str) else " ".join(x.get("text", "") for x in (c or []) if isinstance(x, dict))
                    results[b.get("tool_use_id")] = len(text)
    for u in per_msg.values():
        usage["turns"] += 1
        usage["out"] += u["output_tokens"]
        usage["create"] += u["cache_creation_input_tokens"]
        usage["read"] += u["cache_read_input_tokens"]
        usage["fresh"] += u["input_tokens"]
    by = {}
    for cid, k in calls:
        n, chars = by.get(k, (0, 0))
        by[k] = (n + 1, chars + results.get(cid, 0))
    return usage, by, len(calls)


def main():
    rows = []
    for arg in sys.argv[1:]:
        label, path = arg.split("=", 1)
        usage, by, n = analyse(path)
        rows.append((label, usage, by, n))
        print(f"\n== {label}: {n} tool calls, {usage['turns']} model turns · output {usage['out']:,} tok · "
              f"new context {usage['create'] + usage['fresh']:,} tok · context re-read {usage['read']:,} tok")
        for k, (c, chars) in sorted(by.items(), key=lambda x: -x[1][0]):
            print(f"   {c:3} × {k:30} results {chars / 1000:7.1f}k chars")


if __name__ == "__main__":
    main()
