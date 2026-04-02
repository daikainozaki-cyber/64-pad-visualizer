#!/usr/bin/env python3
"""
note.com RSS から最新記事を取得し、index.html のお知らせバナーを更新する。

- べき等: 何回実行しても同じ結果
- フォールバック: RSS取得失敗時は既存テキストを保持
- 手動メッセージ（<br>以降）は一切触らない
"""

import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

RSS_URL = "https://note.com/urinami/rss"
TIMEOUT_SEC = 10


def fetch_latest_article(rss_url: str) -> tuple[str, str] | None:
    """RSSから最新記事のタイトルとURLを取得。失敗時はNone。"""
    try:
        req = urllib.request.Request(rss_url, headers={"User-Agent": "64PadExplorer-Deploy/1.0"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
            xml_bytes = resp.read()
    except Exception as e:
        print(f"[note-banner] RSS取得失敗（スキップ）: {e}", file=sys.stderr)
        return None

    try:
        root = ET.fromstring(xml_bytes)
        # RSS 2.0: channel > item
        item = root.find(".//channel/item")
        if item is None:
            print("[note-banner] RSS に item が見つからない（スキップ）", file=sys.stderr)
            return None
        title = item.findtext("title", "").strip()
        link = item.findtext("link", "").strip()
        if not title or not link:
            print("[note-banner] title または link が空（スキップ）", file=sys.stderr)
            return None
        return title, link
    except ET.ParseError as e:
        print(f"[note-banner] XMLパースエラー（スキップ）: {e}", file=sys.stderr)
        return None


def update_banner(html_path: Path, title: str, url: str) -> bool:
    """
    index.html のバナー1行目（記事リンク部分）を更新する。
    <br>以降の手動メッセージは保持。
    Returns True if file was modified.
    """
    content = html_path.read_text(encoding="utf-8")

    # パターン: span#update-notice-text の中身、<br> の前まで
    # 「新記事更新しました〜「<a href="..." ...>タイトル</a>」」の部分を置換
    pattern = (
        r'(<span id="update-notice-text">)'    # グループ1: 開始タグ
        r'新記事更新しました〜「'                  # 固定テキスト
        r'<a href="[^"]*"'                       # 旧URL
        r' target="_blank"'
        r' style="color:var\(--text-muted\);text-decoration:underline;">'
        r'[^<]*'                                 # 旧タイトル
        r'</a>」'
    )

    # 全角スペースを半角に正規化したタイトル（note.comのRSSは全角スペース使用だが表示用に半角にする）
    display_title = title.replace("\u3000", " ")

    replacement = (
        r'\1'
        f'新記事更新しました〜「'
        f'<a href="{url}"'
        f' target="_blank"'
        f' style="color:var(--text-muted);text-decoration:underline;">'
        f'{display_title}'
        f'</a>」'
    )

    new_content, count = re.subn(pattern, replacement, content, count=1)

    if count == 0:
        print("[note-banner] バナーパターンが見つからない（スキップ）", file=sys.stderr)
        return False

    if new_content == content:
        print(f"[note-banner] 既に最新: {display_title}")
        return False

    html_path.write_text(new_content, encoding="utf-8")
    print(f"[note-banner] 更新完了: {display_title}")
    print(f"[note-banner] URL: {url}")
    return True


def main():
    # index.html のパスを決定
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    html_path = project_root / "index.html"

    if not html_path.exists():
        print(f"[note-banner] {html_path} が見つからない", file=sys.stderr)
        sys.exit(1)

    result = fetch_latest_article(RSS_URL)
    if result is None:
        # フォールバック: 何もしない
        sys.exit(0)

    title, url = result
    update_banner(html_path, title, url)


if __name__ == "__main__":
    main()
