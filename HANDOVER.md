# 64 Pad Explorer — 別インスタンス引継ぎ指示書

**作成**: 2026-03-04
**目的**: バグ修正・改善をまとめて実施し、1回のビルドで反映する

---

## 現在の状態

### ローカル未コミット変更（音源エンジン削除）
前回セッションで実施済み。`git diff --stat` で確認可能。

| ファイル | 内容 |
|---------|------|
| `audio.js` | 800→90行に削減。WebAudioFont全削除、no-opスタブ残置 |
| `jrhodes3c-samples.js` | **削除**（36MBサンプラーデータ） |
| `index.html` | CDNスクリプト15本削除、Sound関連UI削除 |
| `render.js` | showSound/soundExpanded/toggleSoundExpand削除 |
| `data.js` | showSound保存/読込削除 |
| `main.js` | Sound関連DOM参照削除 |
| `guide.html` | Sound説明削除 |
| `sw.js` | audio.jsキャッシュ削除、v3.8.0に更新 |
| `builder.js` | コメント更新 |
| `practical_scale_guide.md` | 削除（不要） |
| `tasks.md` | 削除（ダッシュボードに移行済み） |

### バージョン
- CLAUDE.md記載: V3.7
- DAW表示: V3.5（sync-webuiで取り込んだ時点のバージョン）
- **→ 全修正後にバージョンを統一すること**

---

## 今回やるべきタスク（優先順）

### 🔴 バグ修正（最優先）

**#640 Studio One/Bitwigで読み込めない**
- Abletonでは動作OK、他DAWでNG
- ビルドはRelease版（CMakeLists.txt: `CMAKE_BUILD_TYPE=Release`）
- デスクトッププロジェクト: `/Users/nozakidaikai/Obsidian/プロジェクト/64パッドアプリ-desktop/`
- `build.sh` → `sync-webui.sh` → CMake → Ninja
- JUCE設定・プラグインフォーマット設定を確認
- VST3/AUの署名・Entitlements・Info.plistを確認

**#634 MIDI PLAYが書き出しになっている（VST版）**
- DAW内のプラグインウィンドウで「MIDI Play ▶」ボタンのラベルか挙動が間違い
- Web版の `builder.js` または `plain.js` の該当箇所を確認

### 🟡 改善（音源削除と一緒にやる）

**#633 欲しいものリストは不要**
- `index.html` のナビバーから「欲しいものリスト」リンク削除
- 関連する `wishlist` 系のコード・データがあれば削除

**#632 MIDIなどを任意のファイルに書き出せるようにしたら便利**
- 現在: MIDI Export All → ブラウザダウンロード
- 要望: ファイルパス指定で書き出し（主にDesktop版で有用）
- JUCEのFileChooser APIを使う方向

**#635 メモリーからAbletonにD&D出来る構成**
- メモリースロットからDAWのトラックにドラッグ&ドロップでMIDI送信
- JUCE側のD&D実装が必要（DragAndDropContainer）

### 🟢 調査

**#626 AbletonのMPCについて調べる**
- Ableton Push/MPCの64パッドレイアウトとの違い
- 調査結果をCLAUDE.mdまたはDaily noteに記録

**#533 VST3/AUのDAW動作検証**
- Logic Pro、Ableton、Studio One、Bitwigでの動作確認
- #640の修正後に実施

---

## リポジトリ構成

### Web版（メイン）
- `/Users/nozakidaikai/64-pad-visualizer/`
- GitHub: `daikainozaki-cyber/64-pad-visualizer` (private)
- デプロイ: GitHub Actions → Xserver (`murinaikurashi.com/apps/64-pad/`)

### Desktop版（JUCE）
- `/Users/nozakidaikai/Obsidian/プロジェクト/64パッドアプリ-desktop/`
- `sync-webui.sh` でWeb版のファイルを `WebUI/` にコピー
- `build.sh` でCMake + Ninja → VST3/AU/Standalone
- ビルド出力: `build/PadExplorer_artefacts/Release/`

---

## 作業手順

1. **まずWeb版の未コミット変更を確認**（`git diff` で音源削除の内容確認）
2. **#633, #634 のWeb版修正を追加**
3. **全変更をコミット・プッシュ**（GitHub Actions でXserverにデプロイされる）
4. **Desktop版に移動** → `sync-webui.sh` → `build.sh`
5. **#640 のDAW互換性調査・修正**（JUCE設定）
6. **#632, #635 のDesktop版機能追加**（ファイル書き出し、D&D）
7. **各DAWで動作確認**（#533）
8. **バージョン統一**（Web=Desktop=同じバージョン番号）
9. **完了したタスクを即 `dashboard_task.py complete ID` で消す**

---

## 注意事項

- **タスク完了したら即消す**（`dashboard_task.py complete ID`）
- **タスク報告は「#ID 内容」のセットで**（番号だけはNG）
- **context欄**: 7者のタスクは `@7者`
- Desktop版のCLAUDE.md: `/Users/nozakidaikai/Obsidian/プロジェクト/64パッドアプリ-desktop/CLAUDE.md`
- Web版のCLAUDE.md: `/Users/nozakidaikai/64-pad-visualizer/CLAUDE.md`
