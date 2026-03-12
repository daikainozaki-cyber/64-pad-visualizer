# チュートリアルシステム引継書

**更新日**: 2026-03-12
**Phase 1実装者**: 蔵人（実装）、継次（レビュー）
**Phase 2実装者**: ナビ子（設計）、蔵人（実装）、ミナミ（全問解く＝全ステップ確認）、継次（レビュー）
**Phase 4実装者**: 蔵人

---

## 1. Phase 1 完了（V3.33.0）

### アーキテクチャ

```
tutorial-data.js   — TutorialRegistry（データ定義）
tutorial.js        — TutorialEngine（エンジン + セレクターUI） + TutorialHints（文脈ヒント）
```

- `lang-*.js`と同じパターンでデータとエンジンを分離
- `TutorialRegistry.add(id, {...})` でチュートリアルを追加するだけで増やせる
- i18nは `tut.*` namespace（全9言語対応済み）

---

## 2. Phase 2 完了（V3.33.0, commits e3c1bc1 + 141b801）

### 実装済みチュートリアル（全12個）

| ID | カテゴリ | ステップ数 | 備考 |
|----|---------|-----------|------|
| `onboarding` | getting-started | 5 | 旧tutorial.jsから移行。lsKey=`64pad-tutorial-complete`（後方互換） |
| `scale_mode` | getting-started | 4 | beforeShowでScaleモード自動切替 |
| `chord_mode` | getting-started | 5 | beforeShowでChordモード自動切替。step4(tension)はdisplay:none問題回避済み |
| `input_mode` | getting-started | 4 | beforeShowでInputモード自動切替 |
| `diatonic` | features | 4 | ダイアトニックバー→3和音/4和音切替→Chord連動 |
| `memory` | features | 5 | 保存→呼び出し→バンク切替→Perform |
| `voicing` | features | 5 | Shell/Omit/Rootless/Inversion/Drop |
| `sound` | features | 4 | プリセット→音量→MIDI Out |
| `tasty` | advanced | 4 | HPS専用。display:noneでも安全（nullガード） |
| `stock` | advanced | 4 | HPS専用。display:noneでも安全（nullガード） |
| `circle` | advanced | 3 | beforeShowで五度圏パネル表示 |
| `settings` | advanced | 4 | 視覚多様性/パッドレイアウト/32パッド |

### i18n

全9言語対応済み: EN, JA, ZH, ES, FR, PT, DE, KO, IT

### UI

- **ヘッダーボタン**: 本アイコン（Save💾と?の間）。`id="tut-btn"`
- **パルスアニメーション**: 未クリックユーザーにボタンが青く点滅（`64pad-tut-noticed` localStorage）
- **セレクターモーダル**: `.help-overlay`パターン再利用。カードグリッド、完了バッジ✓、カテゴリ別表示
- **進捗**: localStorage `64pad-tut-{id}` = '1'（完了）

---

## 3. Phase 4 完了（V3.34.0）— 文脈ヒント

初めて機能に触れた時に「チュートリアルがありますよ」とトーストで提案する導線。

### 仕組み

- `TutorialHints` オブジェクト（tutorial.js内）
- 対象要素のクリックを検知 → チュートリアル未完了 & ヒント未表示 → トースト表示
- トーストは6秒で自動消去。「やってみる」ボタンでチュートリアル開始
- onboarding完了前はヒント非表示（新規ユーザーを圧倒しない）

### ヒントマッピング

| 要素 | チュートリアルID |
|------|----------------|
| `#mode-scale` | `scale_mode` |
| `#mode-chord` | `chord_mode` |
| `#mode-input` | `input_mode` |
| `#diatonic-bar` | `diatonic` |
| `#memory-section` | `memory` |
| `#shell-bar` | `voicing` |
| `#sound-expand-btn` | `sound` |
| `#tasty-bar` | `tasty` |
| `#stock-bar` | `stock` |
| `#inst-toggle-circle` | `circle` |
| `#inst-toggle-bar` | `settings` |

### localStorage

- `64pad-hint-{id}` = '1'（ヒント表示済み、各チュートリアルにつき1回のみ）

---

## 4. 未完了: メディア（Phase 3）

- `img/tutorial/` にスクショ配置。`loading="lazy"`。SW ASSETSには**入れない**
- ステップ定義に `media: { type: 'img', src: 'img/tutorial/xxx.png' }` で追加
- 動画: YouTube embed (`media: { type: 'video', src: 'https://youtube.com/embed/xxx' }`)
- うりなみさんにスクショ撮影依頼済み（Dashboard mail 2026-03-12）

---

## 5. チュートリアル追加の手順（コピペ用）

```javascript
// tutorial-data.js に追加
TutorialRegistry.add('new_feature', {
  titleKey: 'tut.new_feature_title',
  descKey: 'tut.new_feature_desc',
  category: 'features',  // 'getting-started' | 'features' | 'advanced'
  steps: [
    {
      type: 'info',           // 'info' | 'action' | 'highlight' | 'media'
      id: 'step_id',
      targets: ['#selector'],  // dashed border
      highlight: '#element',   // pulse outline
      titleKey: 'tut.new_feature.step1_title',
      msgKey: 'tut.new_feature.step1_msg',
      waitFor: 'next',        // 'next' | 'close' | 'preset-change'
      // beforeShow: function() { ... },  // optional
      // media: { type: 'img', src: 'img/tutorial/xxx.png' },  // optional
    },
  ]
});

// lang-en.js の tut オブジェクトに追加
new_feature_title: 'New Feature',
new_feature_desc: 'Learn this feature',
new_feature: {
  step1_title: '...',
  step1_msg: '...',
},

// lang-ja.js も同様
// 文脈ヒントを追加する場合: tutorial.js の TutorialHints._map に追加
```

---

## 6. 注意事項

- **display:none要素のhighlight禁止**: Chord step2(tension-grid)は未選択時非表示。beforeShowで表示するかテキストで案内
- **beforeShowでsetMode()**: モード切替系チュートリアルは必須。Scaleチュートリアル中にChordモードだと意味がない
- **セレクターは毎回rebuild**: showSelector()は完了状態を反映するため毎回DOM再構築
- **旧tutorial.*キー**: 後方互換で残している。ENフォールバックで動く
- **文脈ヒントはonboarding完了後のみ**: 新規ユーザーにヒント連打しない

---

## 7. ファイル構成

```
tutorial-data.js     — TutorialRegistry + 全チュートリアル定義（12個）
tutorial.js          — TutorialEngine + TutorialHints
style.css            — .tut-selector-*, .tut-pulse, .tutorial-media, .tut-hint-toast
index.html           — #tut-btn (header), <script> tags
lang-*.js (9言語)    — tut.* namespace
sw.js                — ASSETS (tutorial-data.js含む)
```

---

## 8. 起動手順

```
引継書を読んで。/Users/nozakidaikai/64-pad-visualizer/TUTORIAL_HANDOFF.md
メディア（スクショ/動画）をステップに追加して。
```

**設計原則**: やってみたくなる文を書く。理由は書かない。理由は使えばわかる。
