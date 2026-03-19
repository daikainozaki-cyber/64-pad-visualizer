# Phase 6: pad-core ビルダー＆パッドモジュール化設計

**作成日**: 2026-03-09
**更新**: 2026-03-09（64PE統合完了、転回形表示追加）
**Status**: IN PROGRESS — 64PE側Step 0-3完了、MRC側未着手
**関連**: [[64PE_機能哲学マッピング]], [[pad-core]]

---

## スコープ決定（うりなみさん判断）

| 項目 | 判断 | 理由 |
|------|------|------|
| ビルダー（Quality/Tension/Voicing） | **今やる** | LocalStorage連携の前提 |
| パッドグリッド | **今やる** | MRC入れ替え対象 |
| インクリメンタル入力 | **今やる** | MRC→64PE移植元、共通化必須 |
| ダイアグラム（ギター/ベース） | **後** | 64PE内部統合のみ。MRC不要 |
| ピアノ表示 | **後** | ストックボイシングUIと同時設計 |

**モジュール化しないとドエライことになる** — LocalStorage連携で同じロジックが2箇所にある状態は地獄

---

## 現状分析

### pad-core 現構成（4ファイル, 2600行）
| File | Lines | Role |
|------|-------|------|
| data.js | 469 | 定数・マッピング |
| theory.js | 1303 | 計算（18+ pure functions） |
| render.js | 272 | パッドグリッドSVG |
| circle.js | 556 | Circle of Fifths SVG |

### 重複コード（現状の問題）

| 重複箇所 | 64PE | MRC | 重複量 |
|---------|------|-----|--------|
| コードビルダー（Quality/Tension grid） | builder.js | builder.js | ~400-500行 |
| テンション可視性ロジック（8カテゴリ） | builder.js | builder.js | ~135行（完全一致） |
| ピアノキーボード描画 | builder.js | builder.js | ~40行 |
| ボイシングトグル | builder.js | builder.js | ~65行 |
| インクリメンタル入力コア | feature branch | incremental.js | ~200行（候補生成＋ドロップダウン） |
| 色分類チェーン | render.js 6箇所+ | — | 各10行×6+ |

### pad-core サブモジュール同期状態
- **64PE**: 最新（padDetectChord, Stock voicing含む）
- **MRC**: 6コミット遅れ（padDetectChord等なし）
- **→ Step 0で同期必須**

---

## 設計方針

### 原則
1. **Pure functions only** — グローバルState読み取りゼロ（pad-core既存踏襲）
2. **パラメータで全て受け取る** — 呼び出し側がStateから値を取り出して渡す
3. **browser + Node dual** — `var` + `module.exports`（既存パターン）
4. **色はテーマオブジェクトで注入** — Okabe-Itoがデフォルト、MRC等で差し替え可能
5. **既存APIは壊さない** — 既存のpadRenderGrid等はそのまま

### 新ファイル構成

```
pad-core/
  data.js         (既存 + カラーテーマ追加)
  theory.js       (既存 + padClassifyPC追加)
  render.js       (既存: パッドグリッド)
  circle.js       (既存: Circle of Fifths)
  builder-ui.js   (NEW: ビルダー共通UIロジック)
  incremental.js  (NEW: インクリメンタル入力コア)
```

**後で追加（今回スコープ外）**:
- `diagram.js` — ギター/ベス/ピアノダイアグラム（ストックボイシング開発時）

---

## Step 0: pad-core サブモジュール同期

**作業**: MRC側のpad-coreを64PE最新に更新
**リスク**: MRC側で未使用の新関数が増えるだけ。既存関数のAPI変更なし→**安全**

```bash
cd ~/master-rhythm-chart
git submodule update --remote pad-core
# テスト実行で既存動作確認
```

---

## Step 1: 色分類関数の抽出（theory.js追加）

### 問題
色分類チェーンが64PE render.js内に6箇所以上重複:
```javascript
const color = pc === rootPC ? ROOT_COLOR
  : guide3Set.has(pc) ? GUIDE3_COLOR
  : guide7Set.has(pc) ? GUIDE7_COLOR
  : tensionSet.has(pc) ? TENSION_COLOR
  : CHORD_COLOR;
```

### 解決: `padClassifyPC()` をtheory.jsに追加

```javascript
// Returns: 'root' | 'bass' | 'guide3' | 'guide7' | 'tension' | 'chord' | 'inactive'
function padClassifyPC(pc, rootPC, bassPC, activePCS, guide3Set, guide7Set) {
  if (!activePCS.has(pc)) return 'inactive';
  if (pc === rootPC) return 'root';
  if (bassPC !== null && pc === bassPC && pc !== rootPC) return 'bass';
  if (guide3Set.has(pc)) return 'guide3';
  if (guide7Set.has(pc)) return 'guide7';
  if (activePCS.has(pc)) return 'tension';  // active but not classified above
  return 'inactive';
}
```

### デフォルトカラーテーマ（data.jsに追加）
```javascript
var PAD_THEME_OKABE_ITO = {
  root:     '#E69F00',
  bass:     '#ff9800',
  guide3:   '#009E73',
  guide7:   '#CC79A7',
  tension:  '#56B4E9',
  chord:    '#56B4E9',
  inactive: '#2a2a3e',
  mute:     '#D55E00'   // vermillion (muted strings)
};
```

**影響範囲**: theory.js + data.jsへの**追加**のみ。既存API変更なし
**テスト**: padClassifyPC単体テスト（12ケース）

---

## Step 2: builder-ui.js — コードビルダー共通UIロジック

### 問題
64PEとMRCで重複しているUIロジック:
- ピアノキーボード描画 (`buildPianoKeyboard`) ~40行 **完全一致**
- Quality grid初期化 (`initQualityGrid`) ~15行コア **完全一致**
- Tension grid初期化 (`initTensionGrid`) ~25行コア **完全一致**
- テンション可視性ロジック (`updateControlsForQuality`) ~135行 **完全一致**（8カテゴリA-H）
- Voicingトグル群 ~65行 **完全一致** (Shell/Drop/Inversion/Omit/Rootless)

### API設計

```javascript
// ===== Piano Keyboard (root選択用) =====
function padBuildPianoKeyboard(container, onSelect) { ... }
// Returns: { highlight(pc), clear() }

// ===== Quality Grid =====
function padBuildQualityGrid(container, onSelect) { ... }
// BUILDER_QUALITIES (data.js) を使ってグリッド生成
// Returns: { highlight(quality), clear() }

// ===== Tension Grid =====
function padBuildTensionGrid(container, onToggle) { ... }
// TENSION_ROWS (data.js) を使ってグリッド生成
// Returns: { highlight(tension), clear() }

// ===== テンション可視性（8カテゴリ） =====
function padUpdateTensionVisibility(container, quality) { ... }
// Category A-H のロジック（現在 updateControlsForQuality の大部分）
// VoicingState は呼び出し側で管理。この関数は DOM class 操作のみ

// ===== Voicing Controls =====
function padBuildVoicingControls(container, opts) { ... }
// opts = { onShell, onDrop, onInversion, onOmit5, onOmit3, onRootless }
// Returns: { update(voicingState) }
```

### 移行パターン（両アプリ共通）

```
Before: builder.js の initQualityGrid() → DOM生成 + State直接変更
After:  builder.js の initQualityGrid() → padBuildQualityGrid(el, onQualityChange)
        onQualityChange 内でアプリ固有の State 更新 + commitBuilderChord()
```

**State操作は絶対にpad-core内に入れない。** コールバックで呼び出し側に返す。

### 差分（アプリ固有で残る部分）

| 機能 | MRC | 64PE |
|------|-----|------|
| Quality選択後 | `commitBuilderChord()` → `placeChord()` + `advanceCursor()` | `render()` + `updateDisplay()` |
| Tension選択後 | `replaceLastPlacedChord()` | `render()` |
| Memory slots | 16枠 + Sortable.js D&D | 16x16 banks + Option+D&D copy |
| Diatonic bar | ChartState.key + ChartState.scaleType | AppState.key + scale select |
| Slash chord | `selectBass()` → `replaceLastPlacedChord()` | `setBass()` → `render()` |

---

## Step 3: incremental.js — インクリメンタルコード入力コア

### 背景
- MRCの `incremental.js` (410行) が元。64PEの `feature/text-chord-input` ブランチに移植予定
- **LocalStorageで64PE↔MRC間のコード受け渡し**が将来目標
- 同じ入力ロジックが2箇所にあると、パースの差異でLocalStorageデータ不整合が起きる

### 共通化する部分（pad-core/incremental.js）

```javascript
// ===== 候補生成（pure function） =====
function padGenerateCandidates(input, qualityKeys, parseChordNameFn) { ... }
// Returns: [{type:'chord', name, quality, exactMatch}, ...]

function padGenerateSlashCandidates(rootStr, quality, bassInput, parseChordNameFn) { ... }

function padGenerateExtensionCandidates(baseName, qualityKeys, parseChordNameFn) { ... }

// ===== ドロップダウンUI =====
function padRenderDropdown(container, candidates, selectedIndex, onCommit) { ... }
// Returns: { updateSelection(index), close() }

// ===== キーボードハンドラ（ナビゲーション部分のみ） =====
function padIncrementalKeyHandler(e, state, callbacks) { ... }
// callbacks = { onCommit, onExtend, onClose, onNavigateUp, onNavigateDown, ... }
// アプリ固有操作（advanceCursor, setCursor等）はコールバックで委譲
```

### アプリ固有で残る部分

| 機能 | MRC | 64PE |
|------|-----|------|
| `commitIncremental()` | `placeChord()` + `advanceCursor()` + `saveChart()` | builder State更新 + `render()` |
| Memory呼び出し | `recallMemorySlot()` → chart配置 | bank slot呼び出し |
| 矢印キー（入力空時） | `setCursor()` + `advanceCursor()` | モード依存のナビゲーション |
| Space | `togglePlay()` | playback toggle |

### LocalStorage連携（将来、今回の共通化が前提）

```
64PE chord → localStorage('pad-chord-state') → MRC読み取り → placeChord()
MRC chart → localStorage('mrc-current-chord') → 64PE読み取り → ビルダー反映
```

**同じ `parseChordName()` を使っているから整合する。** pad-coreの `padParseChordName()` がSSOT。

---

## Step 4: MRC パッドグリッド入れ替え

### 現状
MRCの`pad-panel.js`(341行)は既にpad-coreの`padRenderGrid`/`padDrawBoxes`を使用。
ただしpad-coreが古いバージョン。

### 作業
1. Step 0でサブモジュール同期済み
2. pad-panel.js内の呼び出しを確認、新APIとの互換性チェック
3. 必要に応じてアダプター追加

**リスク**: 低。既にpad-core関数を使っているため。

---

## 実行順序と工数見積

| Step | 内容 | 影響範囲 | 見積 | Status |
|------|------|---------|------|--------|
| **0** | pad-core同期 | MRC submodule | 小（git操作のみ） | **pad-core済 / MRC未** |
| **1** | padClassifyPC + テーマ | theory.js, data.js追加 | 小（~50行 + テスト） | **pad-core済** |
| **2** | builder-ui.js | **新ファイル** + 64PE/MRC builder.jsリファクタ | **中**（~300行新規 + 両側アダプター化） | **64PE済 (-285行)** / MRC未 |
| **3** | incremental.js | **新ファイル** + MRC/64PE共通化 | **中**（~200行新規 + 両側アダプター化） | **pad-core済** / 64PE scriptタグ追加済（呼び出し未） / MRC未 |
| **4** | MRC パッド入れ替え | MRC pad-panel.js | 小（確認＋微調整） | **未着手** |

### 推奨実行順
```
Step 0 → Step 1 → Step 2 → Step 3 → Step 4
                    ↑ ここが主要作業
```

**Step 2が主要**: ビルダーUI共通化。テンション8カテゴリの正確な移植が肝。
**Step 3は比較的安全**: MRCに動作実績あり、候補生成ロジックを pure function 化するだけ。

### ブランチ戦略
```
pad-core:
  main → feature/phase6-builder-module
         ├── Step 0-1: padClassifyPC + テーマ
         ├── Step 2: builder-ui.js
         └── Step 3: incremental.js

64-pad-visualizer:
  main → feature/phase6-builder-integration

master-rhythm-chart:
  main → feature/phase6-builder-integration
```

**3リポジトリに跨る。pad-coreを先に完成 → 64PE/MRC側で統合。**

**AI構造的弱点への対策**:
- マルチセッション → **必ずブランチ** (CLAUDE.md準拠)
- 64PE ↔ MRC ↔ pad-core → **pwd確認してから触る**
- 3リポ作業 → **pad-core完了をゲートにする**（順序強制）
- デプロイ後 → **本番E2Eテスト**

---

## リスクと対策

| リスク | 対策 |
|--------|------|
| テンション8カテゴリの移植漏れ | MRC builder.js L229-413を全行読み、ロジックを完全リスト化 |
| MRCとの互換性問題 | Step 0で同期後、MRC手動動作確認（E2Eテスト未整備） |
| builder-ui.jsのState結合 | State操作は**絶対に**呼び出し側に残す。pad-core内でStateを触らない |
| 3リポ同時作業でpwd取り違え | 各Step開始時に`pwd`実行。CLAUDE.md既存ルール遵守 |
| incremental.jsの入力体験の差異 | MRC: commitでadvanceCursor、64PE: commitでrender。コールバック分離で吸収 |
| LocalStorageキー衝突 | 名前空間: `pad-core-chord-state` / `pad-core-memory` で統一（将来） |

---

## 将来拡張（今回スコープ外）

| 項目 | 時期 | 依存 |
|------|------|------|
| diagram.js（ギター/ベース統合） | ストックボイシング開発時 | padClassifyPC (Step 1) |
| ピアノ表示モジュール | ストックボイシングUI設計と同時 | diagram.js |
| LocalStorage連携 | builder-ui + incremental完了後 | Step 2-3 |
| Memory共通化 | LocalStorage連携と同時 | builder-ui.js |

---

**われわれは連帯して、あらがいます。**
