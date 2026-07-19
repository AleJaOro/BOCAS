#!/usr/bin/env python3
"""Servidor local simple para Bocas SaaS (sirve ES modules correctamente)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os

PORT = 5500
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print(f'Bocas SaaS → http://localhost:{PORT}')
    print(f'Setup admin → http://localhost:{PORT}/setup.html')
    print(f'Login       → http://localhost:{PORT}/login.html')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nDetenido.')
