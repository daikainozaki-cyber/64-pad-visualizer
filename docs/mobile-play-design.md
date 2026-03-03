# 64 Pad Explorer iPhone演奏対応設計書

**作成日**: 2026-03-03
**担当**: 蔵人（実装）、ナビ子（設計判断）
**状態**: うりなみさん確認待ち

---

## スコープ

**iPhone限定**。iPadは現状のタブレットレイアウトで問題なし（パッドが十分大きい）。

## うりなみさんの方向性（確定済み）

1. **Viewモード**: 64パッド表示 = フィンガリング確認用（縦持ち）
2. **Playモード**: 32パッド = iPhone演奏用（**横持ち**）
3. **Play は横にして使うのが現実的**

---

## 現状のモバイルUI

| 向き | レイアウト | 内容 |
|------|-----------|------|
| **Portrait** | 3画面スワイプ（scroll-snap） | Screen1=64パッド, Screen2=コントロール, Screen3=Staff+Sound |
| **Landscape** | 2カラム（パッド左、タブ切替右） | Control/Infoタブ切替 |

**問題点**:
- Portrait 64パッドは見れるが弾けない（パッドが小さすぎる）
- Landscapeも8×8のまま。弾くためのUIがない

---

## 設計: View / Play モード切替

### Portrait（縦持ち）= View専用

- **既存の3画面スワイプをそのまま使う**（変更なし）
- 64パッド（8×8）でフィンガリング・ボイシングを確認
- 音は出せる（タップで発音）が、演奏向けではない

### Landscape（横持ち）= Play モード

画面回転で自動的にPlayモードへ。パッドグリッドを4×8に変更。

```
┌─────────────────────────────────────────────────┐
│ [Key: C] [Scale: Major] [Sound: ON/OFF]         │  ← ミニコントロールバー
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐      │
│  │  │ │  │ │  │ │  │ │  │ │  │ │  │ │  │ Row 4  │  ← 4行×8列 = 32パッド
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘      │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐      │
│  │  │ │  │ │  │ │  │ │  │ │  │ │  │ │  │ Row 3  │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘      │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐      │
│  │  │ │  │ │  │ │  │ │  │ │  │ │  │ │  │ Row 2  │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘      │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐      │
│  │  │ │  │ │  │ │  │ │  │ │  │ │  │ │  │ Row 1  │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘      │
│                                                   │
│ [Oct ▼▲] [Chord: Cmaj7]            [View ⟲]    │  ← フッター
└─────────────────────────────────────────────────┘
```

**パッドサイズ計算（iPhone SE〜15 Pro Max）**:

| 機種 | 画面幅（landscape） | 8列パッド+gap | パッドサイズ |
|------|---------------------|---------------|-------------|
| iPhone SE | 667px | (8×PAD + 7×GAP + 2×MARGIN) | ~72px |
| iPhone 15 | 852px | 同上 | ~95px |
| iPhone 15 Pro Max | 932px | 同上 | ~105px |

**十分弾ける大きさ**（Push 3の物理パッドは約30mm = 113px @96dpi）

---

## 技術的な変更点

### 1. GRID定数の動的切替

```javascript
// data.js に追加
const GRID_PLAY = {
  ROWS: 4, COLS: 8,
  BASE_MIDI: 36, ROW_INTERVAL: 5, COL_INTERVAL: 1,
  PAD_SIZE: 0, PAD_GAP: 4, MARGIN: 8,  // PAD_SIZEはviewportから動的計算
};

function getPlayPadSize() {
  const vw = window.innerWidth;
  return Math.floor((vw - GRID_PLAY.MARGIN * 2 - (GRID_PLAY.COLS - 1) * GRID_PLAY.PAD_GAP) / GRID_PLAY.COLS);
}
```

### 2. render() の分岐

```javascript
function render() {
  const grid = (_isLandscape && _isMobileDevice) ? GRID_PLAY : GRID;
  const { ROWS: rows, COLS: cols, PAD_SIZE: padSize, PAD_GAP: padGap, MARGIN: margin } = grid;
  // ... 既存のrender()を rows/cols/padSize で再計算
}
```

### 3. Landscapeレイアウトの刷新（iPhone限定）

既存のメディアクエリ `@media (max-width: 812px) and (max-height: 500px) and (orientation: landscape)` がiPhoneのlandscapeを正確にターゲットしている（iPadは除外済み）。これを拡張:

- ヘッダー非表示（既存）
- パッドがフルスクリーン（コントロールパネルを隠す）
- ミニコントロールバー（Key/Scale/Sound toggle）をオーバーレイ
- フッター（Octave/Chord名/View切替ボタン）

### 4. タッチイベント最適化

```javascript
// Playモード専用のタッチハンドラ
// - multitouch対応（同時押し）
// - touchstart/touchend（clickではなく）
// - pointer-events: none で誤タップ防止
// - haptic feedback (navigator.vibrate)
```

### 5. View ⟲ ボタン

landscapeでも「View」に戻せるボタン。押すとフル64パッド表示（読み取り専用）に切替。

---

## やらないこと

- **iPad対応**（現状のタブレットレイアウトで十分。パッドサイズも弾けるレベル）
- Portrait でのPlayモード（iPhone縦持ちでは画面が狭すぎて実用的でない）
- 6×6や5×5などの中間サイズ（4×8が最適。Push/Maschineの下半分）
- PCレイアウトへの影響（PCは常に8×8のまま）
- MIDIコントローラー接続時のレイアウト変更（物理パッドがあれば画面は見るだけ）

---

## 実装フェーズ

### Phase 1: Landscape 4×8パッド（最小限）
- GRID_PLAY定数追加
- render()の行/列分岐
- Landscape CSSでパッドフルスクリーン
- タッチイベント基本対応

### Phase 2: ミニコントロール
- Key/Scale/Sound のコンパクトUI
- Octaveシフト
- コード名表示

### Phase 3: タッチ最適化
- マルチタッチ同時押し
- ベロシティ（タッチ面積 or 長押し）
- Haptic feedback
- 遅延最小化（Web Audio latency対策）

### Phase 4: PWA最適化
- manifest.json: `"display": "fullscreen"`, `"orientation": "any"`
- ホーム画面追加時のフルスクリーン対応
- Safe area対応（iPhone notch/Dynamic Island）

---

## 確認事項（うりなみさんへ）

1. **4×8で良いか？** — 4行 = 20半音のレンジ（C1〜G#2）。オクターブシフトで上下可能
2. **landscapeで自動Playモード切替 vs 手動切替？** — 自動の方がシンプル
3. **コード/スケール切替はPlay中に必要？** — 最小限のKey/Scale切替は欲しい？
4. **Performモードとの関係** — 既存のPerformモード（16メモリースロット再生）はPlay画面でも使える？
