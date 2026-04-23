#!/usr/bin/env python3
"""HTTP server with no-cache headers for 64 Pad Explorer local dev.

**この repo は PWA 採用中 (sw.js 現役)**。したがって `dev-server-nocache` ルール
の "sw.js 404" / "Clear-Site-Data: executionContexts" は**適用除外**。
SW を強制解除すると PWA が壊れる。

このサーバーは純粋な no-cache のみ。ブラウザキャッシュ層は無効化するが、
Service Worker の制御には干渉しない。SW 自体の更新は
`updateViaCache: 'none'` + ASSETS バージョン bump で行う (既存運用)。

詳細: ~/Obsidian/デジタル百姓総本部/.claude/rules/dev-server-nocache.md
     §"PWA repo への適用除外" (2026-04-22)
"""
import http.server
import socketserver
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', port), NoCacheHandler) as srv:
        print(f'64 Pad Explorer dev server on http://localhost:{port}/ (no-cache only, PWA-safe)')
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print('\nstopped.')


if __name__ == '__main__':
    main()
