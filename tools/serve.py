#!/usr/bin/env python3
"""Serve the app locally: python3 tools/serve.py [port]  →  http://localhost:8000/

Serves the project root with the right content types for ES modules and the web app manifest.
"""
import functools
import http.server
import os
import socketserver
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        if os.environ.get("SERVE_LOG"):
            super().log_message(*args)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start(port=8000, root=ROOT):
    """Start in a background thread (used by the test scripts). Returns the server."""
    httpd = Server(("127.0.0.1", port), functools.partial(Handler, directory=root))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = Server(("127.0.0.1", port), functools.partial(Handler, directory=ROOT))
    print(f"Uni Bob running at http://localhost:{port}/  (Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
