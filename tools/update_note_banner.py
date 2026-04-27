#!/usr/bin/env python3
"""
3つのRSSから最新記事を取得し、index.html のお知らせバナー3ブロックを更新します。

- ブログ:     murinaikurashi.com/feed/     → 📝 ブログ更新「...」
- HPS:        note.com/urinami/rss         → 🎹 HPS更新「...」
- Pad Sensei: urinami.substack.com/feed    → 📰 Pad Sensei「...」

Notes:
- note.com は 2026-04 以降 HPS のみ更新される前提でフィードの最新記事をそのまま採用します。
- べき等: 何回実行しても同じ結果になります。
- フォールバック: 任意のRSS取得が失敗しても、他のブロックだけ更新して続行します。
"""

import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

FEEDS = [
    {
        "key": "blog",
        "url": "https://murinaikurashi.com/feed/",
        "icon": "\U0001F4DD",   # 📝
        "label": "ブログ更新",
    },
    {
        "key": "hps",
        "url": "https://note.com/urinami/rss",
        "icon": "\U0001F3B9",   # 🎹
        "label": "HPS更新",
    },
    {
        "key": "padsensei",
        "url": "https://urinami.substack.com/feed",
        "icon": "\U0001F4F0",   # 📰
        "label": "Pad Sensei",
    },
]

TIMEOUT_SEC = 10
USER_AGENT = "64PadExplorer-Deploy/2.0"


def fetch_latest(rss_url: str) -> tuple[str, str] | None:
    """RSSから最新記事のタイトルとリンクを取得します。失敗時はNoneを返します。"""
    try:
        req = urllib.request.Request(rss_url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
            xml_bytes = resp.read()
    except Exception as e:
        print(f"[note-banner] RSS取得失敗 {rss_url}: {e}", file=sys.stderr)
        return None

    try:
        root = ET.fromstring(xml_bytes)
        item = root.find(".//channel/item")
        if item is None:
            print(f"[note-banner] item なし {rss_url}", file=sys.stderr)
            return None
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        # WordPress パスワード保護記事の prefix を除去 (urinami が公開状態に
        # 戻した後も RSS キャッシュに「保護中: 」が残るため)
        for prefix in ("保護中: ", "Protected: "):
            if title.startswith(prefix):
                title = title[len(prefix):]
                break
        if not title or not link:
            print(f"[note-banner] title/link 空 {rss_url}", file=sys.stderr)
            return None
        return title, link
    except ET.ParseError as e:
        print(f"[note-banner] XMLパースエラー {rss_url}: {e}", file=sys.stderr)
        return None


def update_block(content: str, feed: dict, title: str, url: str) -> tuple[str, int]:
    """
    icon + label「<a ...>旧タイトル</a>」→ 同構造で最新記事に置換します。
    Returns (new_content, count).
    """
    icon = feed["icon"]
    label = re.escape(feed["label"])
    pattern = (
        re.escape(icon)
        + r"\s*"
        + label
        + r'「<a href="[^"]*" target="_blank" style="color:var\(--accent\);text-decoration:underline;">[^<]*</a>」'
    )
    display_title = title.replace("\u3000", " ")
    replacement = (
        f'{icon} {feed["label"]}「'
        f'<a href="{url}" target="_blank" '
        f'style="color:var(--accent);text-decoration:underline;">'
        f'{display_title}</a>」'
    )
    new_content, count = re.subn(pattern, replacement, content, count=1)
    return new_content, count


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    html_path = project_root / "index.html"

    if not html_path.exists():
        print(f"[note-banner] {html_path} が見つからない", file=sys.stderr)
        return 1

    content = html_path.read_text(encoding="utf-8")
    original = content

    for feed in FEEDS:
        result = fetch_latest(feed["url"])
        if result is None:
            print(f"[note-banner] {feed['key']} 取得失敗→既存保持")
            continue
        title, url = result
        new_content, count = update_block(content, feed, title, url)
        if count == 0:
            print(f"[note-banner] {feed['key']} パターン不一致（index.html の構造が変わった可能性）", file=sys.stderr)
            continue
        if new_content != content:
            print(f"[note-banner] {feed['key']} 更新: {title.replace(chr(0x3000), ' ')}")
            print(f"[note-banner]   URL: {url}")
            content = new_content
        else:
            print(f"[note-banner] {feed['key']} 既に最新: {title.replace(chr(0x3000), ' ')}")

    if content != original:
        html_path.write_text(content, encoding="utf-8")
        print("[note-banner] index.html を更新しました")
    else:
        print("[note-banner] 変更なし")
    return 0


if __name__ == "__main__":
    sys.exit(main())
