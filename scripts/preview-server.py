#!/usr/bin/env python3
"""Local preview server for whatimado.

Plain `python3 -m http.server` sends no Cache-Control or ETag, so browsers fall
back to heuristic freshness and can reuse a cached app.html without revalidating.
A stale app.html keeps pointing at the previous ?v= asset URLs, so CSS and JS
edits silently do not appear. Everything here is served no-store instead.

Usage: python3 scripts/preview-server.py [port]
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_header(self, keyword, value):
        # Drop the inherited validator so browsers cannot serve a 304 from cache.
        if keyword.lower() == "last-modified":
            return
        super().send_header(keyword, value)


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"whatimado preview (no-store) → http://127.0.0.1:{PORT}/app.html")
        print(f"serving {ROOT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
