# 64 Pad Explorer - CLAUDE.md

**最終更新**: 2026-02-09
**担当人格**: 蔵人（実装）、継次（設計）、フロ男（テンション・ボイシング設計）
**バージョン**: V1.7.3（2026-02-09）

---

## 第1層：存在意義

**64パッド上のスケール・コード・手形（指番号）を可視化し、うりなみさんの身体知をデジタル化する。**

三井田くんの川三64パッド（スプレッドシート v2.0.1）を超え、テンションコード・8音スケール・指番号表示をWebアプリで実現する。

### 公開・ライセンス方針

- **Web版は無料公開（全機能）**。参入障壁はツールではなく人（うりなみさん）にある
- **コピー・改変は自由**。条件は「うりなみ」のクレジット表記のみ
- **iOSネイティブ版は有料**（買い切り）。USB-C接続の体験が対価
- **CHS Export（Chordcatフォーマット）はChordcat社との交渉後に公開**
- リポジトリは将来public化を視野（現在private）

### HPS専用コンテンツ（2026-02-09 確定）

**ツール無料 / コンテンツHPS専用**モデル。ツールの機能制限はしない。

```
【無料（誰でも）】ツール本体
  - スケール・コード・手形表示
  - コード入力（CHS形式）
  - コード判定
  - MIDI/CHS書き出し
  - 全モード（plain/chord/edit）

【HPS専用（有料メンバーシップ）】コンテンツ
  - ストックボイシング（よく使われるかっこいいボイシング集）
  - トップノート分析データ
  - レッスン教材用プリセット
```

**技術実装**:
- ツール本体 → GitHub Pages（認証なし）
- HPS専用データ → HPSポータル経由（Cloudflare Access認証）
- 同じアプリ、データ層だけで切り分け。HPS会員がログインするとストックボイシング等が追加で見える

**全ツール共通モデル**: 64 Pad Explorer、リズム譜アプリ等すべて同じ構造で展開

---

## 第2層：設計方針

### スプレッドシートの構造的限界（Web化の理由）

| 限界 | 詳細 |
|------|------|
| **スケール** | 7音前提のグリッドレイアウト → Bebop Scale（8音）、Half-Whole Diminished（8音）で破綻 |
| **コード** | 4音まで（テトラッド）→ 9th, 11th, 13th等のテンションボイシングが表現できない |
| **指番号** | そもそも存在しない。スプレッドシートでは表現困難 |
| **拡張性** | 列数・条件付き書式の爆発。GASなしの力技で限界 |

### アーキテクチャ

```
64パッドアプリ/
├── index.html      (366行)  HTML構造 + script tags
├── style.css       (359行)  CSS全量
├── data.js         (247行)  定数・スケール・コード・状態オブジェクト・onReady()
├── audio.js        (307行)  オーディオエンジン・エフェクト・noteOn/Off
├── theory.js       (687行)  ボイシング計算・コード理論・ダイアトニック
├── render.js      (1136行)  描画(パッド・五線譜・楽器)・render()統合
├── plain.js        (666行)  Plainモード・メモリースロット・MIDI/CHS書き出し
├── builder.js      (885行)  モード管理・ビルダーUI・コード検出・Web MIDI
├── main.js         (204行)  初期化・キーボードショートカット
└── .github/workflows/
    ├── deploy.yml            mainへのpush → 自動デプロイ
    └── deploy-dev.yml        手動トリガー → dev環境デプロイ
```

**読み込み順序**: data.js → audio.js → theory.js → render.js → plain.js → builder.js → main.js
（body末尾の`<script src>`方式。DOMContentLoaded対策に`onReady()`ユーティリティをdata.jsに配置）

**五度圏アプリとは別アプリ**（でかくなるため）。データ層は将来的に共有。

### コード入力方式: Clover Chord System方式（3ステップ）

[Clover Chord Systems](https://clover-japon.com/en/) のUIを参考にする。うりなみさんが実際に使用中。

```
ステップ1: Root選択    → C, C#, D, D#, E, F, F#, G, G#, A, A#, B（12種）
ステップ2: Quality選択 → Maj, m, aug, dim, sus2, sus4, (Maj b5)（7種+）
ステップ3: Tension選択 → 7, △7, 6, 9, b9, #9, 11, #11, 13, b13（10種+）
```

**メリット**:
- 3クリックで任意のコードを生成 → テンションの制限なし
- ダイアトニックコードは1クリック（キー追従）
- スプレッドシートの「31種固定」問題を完全解決

### 技術スタック

| レイヤー | 選択 | 理由 |
|---------|------|------|
| 描画 | Canvas or SVG | 8×8グリッドの動的描画 |
| ロジック | Pure JavaScript | 五度圏アプリと統一（ビルドツールなし） |
| データ | JSON | スケール・コード・指番号すべて |
| ホスティング | Xserver | 五度圏アプリと同じ |
| デプロイ | GitHub Actions | 五度圏アプリと同じ |

### デプロイ設定

| 項目 | 値 |
|------|-----|
| **GitHubリポジトリ** | https://github.com/daikainozaki-cyber/64-pad-visualizer (private) |
| **公開URL** | https://murinaikurashi.com/apps/64-pad/ |
| **デプロイトリガー** | mainブランチへのpush（自動） |
| **Xserverホスト** | xs071284.xsrv.jp:10022 |
| **デプロイ先** | ~/murinaikurashi.com/public_html/apps/64-pad/ |
| **認証** | GitHub Secrets `XSERVER_SSH_KEY`（五度圏アプリと同じ鍵） |
| **ワークフロー** | `.github/workflows/deploy.yml`（rsync-deployments@6.0.0） |
| **除外ファイル** | .git, .github, CLAUDE.md, deploy.sh, config.sh |

**pushすれば自動でデプロイされる。手動操作は不要。**

### テスト環境（Dev）

| 項目 | 値 |
|------|-----|
| **公開URL** | https://murinaikurashi.com/apps/64-pad-dev/ |
| **デプロイトリガー** | 手動（GitHub Actions → Run workflow） |
| **デプロイ先** | ~/murinaikurashi.com/public_html/apps/64-pad-dev/ |
| **ワークフロー** | `.github/workflows/deploy-dev.yml` |
| **ブランチ** | main（本番と同じ。コードの分岐なし） |

**用途**: HTTPS環境でのshowSaveFilePicker検証、新機能テスト等。本番に影響を与えずにHTTPS動作を確認できる。

---

## 第3層：データ定義

### スケール（28種 + 拡張可能）

スプレッドシートから抽出済み。Pitch Class Setで定義。

| カテゴリ | スケール数 | 備考 |
|---------|-----------|------|
| ダイアトニック（○） | 7 | Major〜Locrian |
| ハーモニックマイナー（■） | 7 | HM1〜HM7 |
| メロディックマイナー（◆） | 7 | MM1〜MM7 |
| ペンタトニック等 | 5 | Major/Minor Penta, Blues |
| 対称スケール | 2 | Whole Tone, Chromatic |
| **8音スケール** | **4+** | **Half-Whole Dim, Whole-Half Dim, Bebop Major, Bebop Dominant** |

**Bebop系スケール（スプレッドシートに未収録・追加必須）**:
- Bebop Major: 1 2 3 4 5 #5 6 7（8音）
- Bebop Dominant: 1 2 3 4 5 6 b7 7（8音）
- Bebop Dorian: 1 2 b3 3 4 5 6 b7（8音）
- Bebop Melodic Minor: 1 2 b3 4 5 #5 6 7（8音）

**コードとスケールの関係（Available Note Scale）**: コードに対してどのスケールが使えるかの対応表。これがないとコード表示だけでは片手落ち。

### コード（31種 + テンション拡張が必要）

| CN | 種類 | 現状 |
|----|------|------|
| 2 | インターバル | 11種（スプレッドシートから） |
| 3 | トライアド | 8種（スプレッドシートから） |
| 4 | テトラッド | 12種（スプレッドシートから） |
| **5+** | **テンション** | **未定義（要追加）** |

**テンション拡張例**: 9th, m9, Maj9, 11th, #11, 13th, b13, add9, 6/9, sus等

### 64パッドのグリッド配列

**デフォルト: 4度のクロマチック**

```
行の関係: 各行は5半音（完全4度）上
列の関係: 各列は1半音（クロマチック）上
最低音: C1（MIDI 36）
※ Ableton Live / ヤマハ(XG) = 同じC3派（Middle C = C3 = MIDI 60）
※ 国際式(Roland/GM) ではC4派（Middle C = C4）。ラベルが1オクターブずれるだけ

Row 7: B3   C4   C#4  D4   D#4  E4   F4   F#4
Row 6: F#3  G3   G#3  A3   A#3  B3   C4   C#4
Row 5: C#3  D3   D#3  E3   F3   F#3  G3   G#3
Row 4: G#2  A2   A#2  B2   C3   C#3  D3   D#3
Row 3: D#2  E2   F2   F#2  G2   G#2  A2   A#2
Row 2: A#1  B1   C2   C#2  D2   D#2  E2   F2
Row 1: F1   F#1  G1   G#1  A1   A#1  B1   C2
Row 0: C1   C#1  D1   D#1  E1   F1   F#1  G1
```

**音域**: C1〜F#4（MIDI 36〜78、約3.5オクターブ）

**重要**: 同じPitch Classが複数パッドに存在する（例: C4はRow 7 col 1とRow 6 col 7）。
ポジション選択がボイシングの核心。

### 指番号のロジック（うりなみさんの身体知）

**基本ルール（2025-12-31 Daily noteより）**:
- パッドを**4分割**する
- **最低音を右手/左手どちらで抑えるか**で判定
- → 指番号が**一意に決まる**

**ucosarvさんの「注目領域（attention area）」**も参考。

**このロジックが言語化・実装できれば、全コード × 全キー × 全ボイシングの手形を自動生成可能。**

---

## 第4層：データ収集パイプライン

### ソース1: Obsidian内のHPS記事（400本+）

```
note.com/urinami の記事 → Obsidianに同期済み
  ↓
記事内のボイシング説明・パッド図・コード解説を認識
  ↓
Gemini（画像認識）+ Claude（テキスト解析）で構造化
  ↓
fingerings.json に蓄積
```

**ポイント**: 記事にはコードの押さえ方、ボイシングの選択理由、運指の注意点が大量に含まれている。これらをパッドデータとして認識・抽出する。

### ソース2: Discord話題（45日分+）

Discord話題にはボイシング・運指の実践知が蓄積されている。
例: Drop2ボイシング、回内/回外、クロマチックアプローチの運指等。

### ソース3: うりなみさんとの壁打ち

```
うりなみさんが指示 → パッドを押さえる → MCP Webcamで撮影
  ↓
Claude / Gemini が指位置を判定
  ↓
fingerings.json に追加
```

### ソース4: ロジックの自動生成

うりなみさんのルール（4分割 + 最低音の手判定）が実装できたら：
```
コード名 + ボイシング + キー
  ↓
ステップ1: Pitch Class Set算出（自動）
ステップ2: 4度配列上のパッド位置算出（複数候補）
ステップ3: 4分割ルール + 最低音の手判定 → ポジション一意決定
ステップ4: 指番号割り当て（ルール適用）
  ↓
手形データ（自動生成）
```

---

## 第5層：ツール

| ツール | 用途 | 状態 |
|--------|------|------|
| gog CLI | Googleスプレッドシート読み取り（元データ参照） | 導入済み（daikainozaki@gmail.com） |
| MCP Webcam | カメラで手の撮影・指番号判定 | 導入済み |
| Gemini CLI | 画像認識（パッド図・手の写真から指位置抽出） | 利用可能 |
| Playwright | 記事スクレイピング（note.com等） | 利用可能 |

---

## 第6層：実装フェーズ

### 実装戦略（2026-02-01確定）

```
64パッドアプリで単体でロジックを開発・検証
  ↓ モジュール化
五度圏アプリに手形表示として転用
```

**理由**: 五度圏アプリの中でロジックを書くと既存機能との絡みでバグが出やすい。独立した場所で作って検証してからモジュールとして持っていく。64パッドアプリ単体でもHPSコンテンツとしての価値がある。

### フェーズ

| フェーズ | 内容 | 状態 | 備考 |
|---------|------|------|------|
| Phase 0 | スプレッドシート分析・仕様抽出 | **完了** | |
| Phase 1 | JSONデータ層 + パッドグリッド描画 | **完了** | gogで読み込み→JS内にデータ埋め込み |
| Phase 2 | **スケール表示** | **完了** | 31スケール（Bebop含む8音対応）、12キー切り替え |
| Phase 3 | **コード入力システム**（Clover Chord System方式） | **完了** | 3ステップUI: Root(ピアノ鍵盤)→Quality(4×3)→Tension(9行グリッド) + オンコード |
| Phase 4 | テンションコード拡張（5音以上） | **完了** | 9th,11th,13th,altered全対応、テンショングリッドで組み合わせ生成 |
| Phase 4.5 | **UI改善** | **完了** | 五線譜（Scale/Chord両対応）、ギター度数トグル、楽器切替式表示、レイアウト最適化 |
| Phase 4.6 | **UIレイアウト再構築 + アクセシビリティ** | **完了** | Okabe-Ito配色、レイアウト安定化、3カラム配置、五線譜ディグリー表示 |
| Phase 4.7 | **音源エンジン** | **完了** | ORGAN(4プリセット) + E.PIANO(7プリセット)、フェイザー/フランジャー/トレモロ/リバーブ |
| Phase 4.8 | **コードリファクタリング** | **完了** | セクションバナー統一、重複排除(getShellIntervals/computeAndDrawVoicingBoxes)、render()5分割、名前空間オブジェクト化(AppState/BuilderState/VoicingState/AudioState/GRID)、セクション整理 |
| Phase 4.9 | **ボイシングポジション切替** | **完了** | バッジタップで代替配置を循環（calcAllVoicingPositions）、候補数表示(1/3等)、脈動インジケーター |
| Phase 4.95 | **テンション理論フィルタ + ボイシングUI改善** | **完了** | 6カテゴリ(A〜F)のテンション非表示ルール、ボイシングボックス選択時改善 |
| Phase 4.96 | **プレーン判定モード** | **完了** | Capture/Edit/Endワークフロー、13メモリースロット、MIDI/CHS書き出し、全モード共通スロット保存 |
| Phase 4.97 | **ファイル分割** | **完了** | 単一HTML(4,846行/202KB)→9ファイル(HTML+CSS+JS×7)。`<script src>`方式、ビルドツール不要 |
| Phase 5 | **指番号判定ロジック** | 未着手 | 4分割×最低音判定。うりなみさんと壁打ち |
| Phase 6 | **モジュール化** | 未着手 | ロジックを共有モジュールとして切り出し。ファイル分割は4.97で完了済み |
| Phase 7 | **五度圏アプリに手形表示を統合** | 未着手 | モジュールを五度圏アプリにインポート |
| Phase 8 | 記事からのデータ抽出パイプライン | 未着手 | 指番号データの自動蓄積 |

**Phase 1〜2はコード表示・スケール表示まで。うりなみさん見積: 約2時間。**

### Phase 4.5 詳細（2026-02-01実装）

| 機能 | 内容 |
|------|------|
| **五線譜（Scale対応）** | Scaleモードでも五線譜にスケール音を表示（1オクターブ昇順） |
| **五線譜（Chord リアルタイム）** | コード構築中もリアルタイム更新（ルートのみ→Quality→Tension） |
| **五線譜bassMidi修正** | `bassMidi = 48` → `48 + rootPC` に修正。G7でG,B,D,Fが正しく表示 |
| **ギター度数トグル** | 音名(C,D,E)↔度数(R,2,3)切り替えボタン。選択マーカーも連動 |
| **楽器切替式表示** | ギター/鍵盤を独立トグル。片方のみ表示時はサイズ拡大 |
| **五線譜位置変更** | 右パネル内→パッド下部に移動（クリック干渉防止） |
| **五線譜オン・オフ** | Guitar/Piano/Staffの3つを独立トグル |
| **テンションラベル順序修正** | 小さい数字が上に来るよう全マルチラインラベルを修正（音楽表記の慣習） |

### Phase 4.6 詳細（2026-02-01実装）

| 機能 | 内容 |
|------|------|
| **Okabe-Ito配色** | 色覚障害対応。Root=オレンジ, Scale/Chord=スカイブルー, 特性音=黄, Guide3=ローズピンク, Guide7=グリーン |
| **レイアウト安定化** | pad-footer固定高さ(50px)、step-container min-height(340px)、app-layout gap縮小(6px) |
| **3カラム配置** | [パッド+ギター+ピアノ] [Scale/Chord操作] [五線譜+オルガン] |
| **五線譜ディグリー表示** | 音符の上にR, 2, 3, b7等のディグリーを表示。Rootはオレンジ色 |
| **五線譜の役割明確化** | スケール/コードの構成音を固定オクターブで表示（MIDI入力のリアルタイム反映はなし） |

### Phase 4.9 詳細（2026-02-03実装）

| 機能 | 内容 |
|------|------|
| **calcAllVoicingPositions** | 再帰探索で全有効配置を収集（最大10件）、コンパクト順ソート。元calcVoicingPositionsはラッパーに |
| **lastBoxes拡張** | `{midiNotes, alternatives: [...], currentAlt}` 構造。cycleIndicesで循環状態管理 |
| **3段階クリック** | 未選択→選択、選択済+代替あり→循環、選択済+代替なし→解除 |
| **バッジ表示** | 循環可能バッジは脈動アニメ + サイズ拡大(28px)。選択中は「1/3」形式で現在位置/全候補数表示 |
| **resetVoicingSelection()** | selectedBoxIdx + cycleIndicesを一括リセット。コード変更・キー変更時に自動呼出 |

### Phase 4.95 詳細（2026-02-03実装）

| 機能 | 内容 |
|------|------|
| **カテゴリA: トライアド制御非表示** | 3音コード選択時にShell/Drop/3rd Invを非表示（使えないため） |
| **カテゴリB: no-opテンション非表示** | PCS計算で変化なしのテンションを非表示（例: augコードでaug） |
| **カテゴリC: 重複テンション非表示** | 同じPCS結果になる複合テンションのうち複雑な方を非表示 |
| **カテゴリD: 7thなしオルタード制限** | 7thなしコードではsus4以外のオルタード（#5,b5,b9,#9,b13,13系）を非表示 |
| **カテゴリE: 7thありで6系非表示** | 7thありコードでは6/6,9/6,9(#11)を非表示（13thとして扱うべき） |
| **カテゴリF: sus4はドミナント7のみ** | 7thありでドミナント7以外（△7,m7,dim7等）ではsus4を非表示 |
| **ボイシングボックス改善** | 選択時に他のボックス非表示 + 個別パッドに白枠表示 |

**音楽理論ルール**:
- `has7th = pcs.includes(10) || pcs.includes(11) || (pcs.includes(9) && pcs.includes(6))`
- `isDominant7 = pcs.includes(4) && pcs.includes(10) && !pcs.includes(11)` — C7sus4は標準、Cmaj7sus4は非標準
- 7thなしでもsus4/add9/6/6,9/omit3/omit5は許可（コード変形・単独追加）
- 6コードで9,11,#11は許可（リディアン等）。マイナーコードで6,9,11も許可

### Phase 4.96 詳細（プレーン判定モード、2026-02-06実装）

**目的**: 理論フィルタなしでパッドを自由に押さえ → コード名を即座に判定。Chordcatのコードセット作成の入力装置にもなる。

| 機能 | 内容 |
|------|------|
| **Plainモード追加** | `AppState.mode` に `'plain'` を追加。Scale/Chord/Plainの3モード切替 |
| **subModeワークフロー** | idle → `c`キーでCapture → パッドクリックでon/off → `e`キーでEnd → idle。idle時は`e`キーでEdit(直近スロット再編集) |
| **リアルタイムコード判定** | 既存 `detectChord()` でコード名をリアルタイム表示。一音変えると即更新 |
| **13メモリースロット** | Chordcat互換（13コード対応）。`1-0`でスロット1-10呼出（Plain時） |
| **全モード共通スロット保存** | `Shift+1-0`で現在のコードをスロットに保存（Scale/Chord/Plain全モード） |
| **MIDI書き出し** | メモリースロットをSMF Type 0で書き出し。各スロット=四分音符1拍。ライブラリ不要 |
| **CHS書き出し** | Chordcat .chs形式（4096バイト）のバイナリ書き出し。13スロット対応 |
| **Memory Slotsパネル** | 右パネルに常時表示。全モードでスロット状態が見える。MIDI/CHS Exportボタン付き |
| **五線譜・楽器連動** | Plainモードでも五線譜・ギター・ピアノに選択音を表示 |

**PlainState構造**:
```js
const PlainState = {
  activeNotes: new Set(),       // クリックでon/offされたMIDIノート
  memory: Array(13).fill(null), // [{midiNotes: [...], chordName: string}] × 13
  currentSlot: null,            // 現在のスロット (0-12)
  subMode: 'idle',              // 'idle' | 'capture' | 'edit'
};
```

**ショートカット（Plainモード時）**:
- `c`: Capture開始（新規コード構築）
- `e`: End(Capture終了→スロット保存) / Edit(idle時に直近スロット再編集)
- `1-0`: メモリー呼び出し（Plainモードではダイアトニック不要）
- `←→`: 半音移動（全ノート±1半音トランスポーズ）
- `↑↓`: 転回形（↑=最低音を1oct上へ、↓=最高音を1oct下へ）
- `x`: 全クリア

**ショートカット（全モード共通）**:
- `Shift+1-0`: 現在のコードをメモリースロットに保存（`e.code`で判定、キーボードレイアウト非依存）

**クロスモードデータ取得**: `getCurrentChordMidiNotes()` — Plainモード:activeNotes、Chord/Scaleモード:ボイシングボックス優先→ビルダーコード

**Plain → Chord転送**: `transferToChordMode()` — PlainのactiveNotesからdetectChord()でコード判定 → BUILDER_QUALITIESからquality逆引き → TENSION_ROWSからtension逆引き → BuilderStateにセットしてChordモードへ切替。テンション付きコードも正しく転送。

**再利用コード**: `detectChord()`, `updateInstrumentInput()`, `highlightInstrumentPads()`, `noteOn()/noteOff()`, `transferToChordMode()`

### V1.0リリース（2026-02-04）

| 項目 | 内容 |
|------|------|
| **ヘッダーバー** | アプリ名 + V1.0タグ + ?ヘルプボタン |
| **ヘルプモーダル** | 全機能の使い方ガイド（Scale/Chord/Voicing/Display/Sound/MIDI/色の意味） |
| **Google Analytics** | G-ZWTBLDWP7P（五度圏アプリと共有） |
| **HPSポータルリンク** | ヘッダー・フッターに「64 Pad Explorer」として追加 |
| **公開方針** | 無償公開。参入障壁はツールではなく人にある |

### V1.1（2026-02-04 バグ修正）

| 修正 | 内容 |
|------|------|
| **度数ラベル修正** | 五線譜・ギターでテンション表記を正しく（2→9, 4→11等）。`chordDegreeName()`をChordモードで使用 |
| **異名同音修正** | b7コンテキストでA#→Bb。五線譜・ギター・パッド情報テキスト全箇所。度数に基づくflat/sharp判定 |
| **五線譜重複音除去** | ボイシングボックスのオクターブ重複をピッチクラスでフィルタ |

### V1.2（2026-02-04 ショートカットキー + UI改善）

| 機能 | 内容 |
|------|------|
| **キーボードショートカット** | `1-7`ダイアトニック、`A-I`ボイシングボックス、`↑↓`転回、`←→`半音移動、`O`Omit5、`S`Shell循環、`D`Drop循環、`Esc`選択解除 |
| **#9テンション色修正** | tensionPCSにある音をguide3/guide7から除外。メジャー3rdがある場合のpc=3は#9（テンション） |
| **バッジ改善** | 数字→大文字アルファベット(A,B,C)、フォントサイズ14px |
| **ボイシングボックス白黒化** | バッジ・枠線を白黒に統一。パッドのOkabe-Ito色体系と分離（操作UI vs 音楽的意味） |
| **ヘルプモーダル** | ショートカットキーセクション追加 |

**キーボードショートカット設計思想**:
- 数字 = 音楽的度数（ダイアトニック）
- アルファベット = 空間的位置（ボイシングボックス）
- 矢印 = 変形（上下=転回、左右=トランスポーズ）
- 単一キー = ボイシング操作（O/S/D）

### V1.3（2026-02-04 Avoidノート + UI改善）

| 機能 | 内容 |
|------|------|
| **Avoidノート色表示** | テンション選択時にAvoidノートを専用色（赤紫）で表示。Avoid=コードトーンの半音上のスケール音 |
| **?キーショートカット** | `?`キーでヘルプモーダル開閉、`Esc`でヘルプも閉じる |
| **ボイシングボックスdim表示** | ボイシングボックス選択時に非選択パッドをopacity 0.3で薄暗く表示 |

### V1.4（2026-02-04 オンコードベース音完全対応）

| 機能 | 内容 |
|------|------|
| **オンコードベース音完全対応** | ボイシングボックス・五線譜・ギター・ピアノすべてにベース音を反映 |

**オンコードの2ケースロジック**:
- **Case 1（構成音ベース: C/E等）**: ベースが構成音 → 転回形として処理。inversionIndexを強制設定
- **Case 2（非構成音ベース: F/G等）**: ベースが非構成音 → コードの下にベース音を挿入
- ヘルパー関数: `getBassCase(bassPC, rootPC, chordPCS)` + `applyOnChordBass(voiced, rootPC, bassPC)`
- ギター・ピアノではベース音をオレンジ（`#ff9800`）で表示（Root > Bass > Active の優先順位）
- オーディオ: ボイシングボックスにベースが含まれる場合は二重追加を防止

### V1.5（2026-02-06 プレーン判定モード + 全モード共通メモリースロット）

| 機能 | 内容 |
|------|------|
| **Plainモード** | Scale/Chord/Plainの3モード切替。理論フィルタなしでパッドを自由にon/off → リアルタイムコード判定 |
| **subModeワークフロー** | idle→Capture(c)→End(e)→idle。idle→Edit(e)→idle。idleではパッド操作不可（誤操作防止） |
| **13メモリースロット** | Chordcat互換。スロット保存・呼出・UI表示。全モードから保存可能 |
| **全モード共通Shift+数字保存** | Scale/Chord/PlainどのモードでもShift+1-0でスロット保存。`e.code`で判定（キーボードレイアウト非依存） |
| **クロスモードデータ取得** | `getCurrentChordMidiNotes()` — ボイシングボックス→ビルダー→activeNotesの優先順位でMIDIノート取得 |
| **Memory Slotsパネル** | 右パネルに常時表示。全モードでスロット状態・MIDI/CHS Exportボタンが見える |
| **MIDI書き出し** | メモリースロットをSMF Type 0で書き出し（手組み、ライブラリ不要） |
| **CHS書き出し** | Chordcat .chs形式（4096バイト）バイナリ書き出し。magic bytes `83 49`、13スロット対応 |
| **トースト通知** | スロット保存時に画面中央にフローティング通知（「Slot 2 ← Dm7」形式） |
| **detectChord()** | トライアド18種+テトラッド31種のDBからコード判定。全転回形・異名同音対応 |
| **矢印キー（Plain）** | ←→で全ノート半音移動、↑↓で転回形（最低音↑1oct / 最高音↓1oct） |
| **Plain→Chord転送** | `transferToChordMode()` — Plainで作ったコードをChordモードのビルダーに転送。Quality+Tension逆引きマッチ |

### V1.6（2026-02-06 HTTPSダウンロード対応 + テスト環境構築）

| 機能 | 内容 |
|------|------|
| **HTTPS対応ダウンロード** | Safari→share sheet、HTTPS+Chrome→`showSaveFilePicker`（ネイティブ保存ダイアログ）、フォールバック→リンク付きトースト |
| **3秒タイムアウト** | `showSaveFilePicker`がハングした場合（ヘッドレス環境等）、3秒後にリンクフォールバック |
| **テスト環境（Dev）** | `https://murinaikurashi.com/apps/64-pad-dev/` — `deploy-dev.yml`（手動トリガー）で本番に影響せずHTTPS動作を検証 |
| **Chrome blob URLダウンロード問題の知見** | `http://localhost`ではblob URLの`download`属性が無視される（Chromium bug #892133）。HTTPS環境で解決 |

### V1.7（2026-02-06 MIDI改善 + スロット再生 + UX改善）

| 機能 | 内容 |
|------|------|
| **MIDI: 1小節化** | 各コードが全音符（4拍=1小節）で書き出し。DAWでの使い勝手向上 |
| **MIDI: ASCII化** | △→M変換（ファイル名+メタイベント）。Abletonでの文字化け解消。CM7=C Major 7 |
| **動的ラベル** | Export/Playボタンが選択状態に応じてラベル変更: 未選択→「MIDI Export All (3)」、選択→「MIDI: CM7」 |
| **スロット再生** | Memory Slotsに`Play ▶`ボタン追加。全スロット順次再生（1.5秒/コード）+ 再生中スロットハイライト |
| **選択/全体切替** | Play/Export共通: スロット選択中→その1つだけ、未選択→全スロット。ボタンラベルで明示 |

### Phase 4.97 詳細（ファイル分割、2026-02-07実装）

**目的**: 単一HTML(4,846行/202KB)を複数ファイルに分割。機能追加前にファイルサイズの限界を解消。

| ファイル | 行数 | 内容 |
|---------|------|------|
| index.html | 366 | HTML構造 + `<script src>` tags |
| style.css | 359 | CSS全量 |
| data.js | 247 | 定数(SCALES, QUALITIES, TENSIONS)、GRID、状態オブジェクト(AppState/BuilderState/VoicingState/PlainState)、`onReady()` |
| audio.js | 307 | AudioContext、エフェクトチェーン、AudioState、setEngine/setPreset、noteOn/Off |
| theory.js | 687 | baseMidi、ボイシング計算(getShellIntervals/calcVoicingOffsets/calcAllVoicingPositions)、コード理論、ダイアトニック |
| render.js | 1136 | computeRenderState、renderPads、renderVoicingBoxes、render()統合、五線譜、ギター、ピアノ、楽器入力 |
| plain.js | 666 | transferToChordMode、togglePlainNote、plainCapture/End、initMemorySlots、exportPlainMidi/Chs |
| builder.js | 885 | setMode、initKeyButtons、setBuilderStep、selectRoot/Quality/Tension、buildChordDB、detectChord、initWebMIDI |
| main.js | 204 | 初期化シーケンス、keydownハンドラ、render()初回呼び出し |

**技術的対応**:
- `<script src>`方式（ビルドツール不要、ES modules不使用）
- body末尾で読み込み（DOM構築後）
- `onReady(fn)`: DOMContentLoaded発火済みの場合を考慮したユーティリティ（data.jsに配置）
- audio.js/builder.jsの`DOMContentLoaded`を`onReady()`に置き換え
- deploy.ymlに`--exclude='*.bak'`を追加

### V1.7.1（2026-02-07 度数ラベルバグ修正）

| 修正 | 内容 |
|------|------|
| **chordDegreeName絶対PC→インターバル変換バグ修正** | `chordDegreeName()`の第3引数`finalPCS`に絶対ピッチクラスSet（activePCS）を渡していたが、関数はインターバルSetを期待。キーC以外で度数ラベルが誤表示（例: キーGのF#m7(b5)でAが"m3"ではなく"#9"と表示）。`activeIvPCS`（インターバル変換済みSet）を計算して全4箇所（パッド・五線譜・ギターダイアグラム×2）で使用するよう修正 |

**原因詳細**: `case 3: if (finalPCS && finalPCS.has(4)) return '#9'; return 'm3';` — F#m7(b5)のactivePCS={6,9,0,4}でE(b7)の絶対PC=4が`has(4)`にマッチし、interval 3(A=m3)を"#9"と誤判定。rootPC=0（キーC）のみ絶対PC=インターバルなので正しく動作していた。

### V1.7.2（2026-02-07 コード判定修正）

| 修正 | 内容 |
|------|------|
| **7(#11,13)判定修正** | コード判定でテンション組み合わせ `#11,13` が正しく認識されない問題を修正 |

### V1.7.3（2026-02-09 Lo Cut / Hi Cut フィルタ）

| 機能 | 内容 |
|------|------|
| **LO CUT（ハイパスフィルタ）** | BiquadFilterNode(highpass)、20Hz〜500Hz、デフォルト80Hz。トグルON/OFFとスライダー |
| **HI CUT（ローパスフィルタ）** | BiquadFilterNode(lowpass)、1000Hz〜20000Hz、デフォルト10000Hz。トグルON/OFFとスライダー |
| **バイパス方式** | OFF時はオーディオグラフから完全に外す（CPU負荷ゼロ・音質劣化なし）。Q=0.707（Butterworth特性） |
| **HPS専用コンテンツモデル追加** | ツール無料（全機能）/ ストックボイシング・トップノート分析はHPS専用（Cloudflare Access認証） |

**バグ修正**: `setValueAtTime(val, 0)` はAudioContext停止中（Chrome autoplay policy）に無視される → `.value = val` に変更

### 次の実装目標

| 順番 | 機能 | 内容 | 方針 |
|------|------|------|------|
| ~~1~~ | ~~**ファイル分割**~~ | ~~単一HTMLから複数JSファイルへ分割~~ | **Phase 4.97で完了**（2026-02-07） |
| 2 | **ピボットコード / スケール可能性表示** | コード選択時に「このコードが属しうる全キー + 度数 + 使えるスケール」を逆引き表示 | 3スケールシステム(Major/Harmonic Minor/Melodic Minor)×7度=21パターン。壁打ち必要。**ここまででコード・スケール編完成** |
| 3 | **16パッド演奏モード + シーケンサー** | メモリースロットのコードを16パッドにアサインし、タップでリアルタイム演奏。叩いた順序・タイミングを記録→MIDI書き出し | ネイバーコード（C6+Ddim7等）の各転回形をパッドに並べ、メロディに合わせてハモる等のユースケース。学習→演奏の橋渡し。内部シーケンサー。マスターリズム譜と統合。HPSポータルシーケンサー・将来DAW開発の土台にもなる |
| 4 | **モジュール化** | 音源エンジン・コード判定・シーケンサー等を再利用可能な単位に切り出し | シーケンサー完成後に境界が確定してから。五度圏アプリ統合・HPSポータル転用のため |
| 5 | **PWA化** | manifest.json + Service Worker。ホーム画面追加でフルスクリーン+オフライン対応 | 携帯UIデザインが必要なため、機能が揃ってから着手 |
| 6 | **iOSネイティブアプリ** | Capacitor + CoreMIDIブリッジ。iPad+パッドのUSB-C接続でMIDI入力対応 | Apple Developer年99ドル。**買い切りアプリとして販売**（Web版は無償のまま）。USB-C接続で即音が出る体験が差別化 |

**実装済み（記録漏れ）**: シェル+テンション — シェルボイシング状態でテンションを選択すると、シェル音にテンション音が加わる。実際の演奏に近い操作感。

### 既知の制限事項

#### MIDI/CHS Export: テスト環境（http://localhost）でのChromeダウンロード問題（2026-02-06確認）

**症状**: `http://localhost:8765`でChrome使用時、blob URLダウンロード（`<a download>`属性）でファイル名がUUIDになる。`showSaveFilePicker`（File System Access API）はダイアログが開かない。プログラム的`a.click()`もブロックされる。

**原因**: Chromiumの既知バグ（[bug #892133](https://bugs.chromium.org/p/chromium/issues/detail?id=892133)）。blob URLの`download`属性がChromeで無視される。`showSaveFilePicker`はlocalhost環境で原因不明のサイレント失敗。

**動作状況**:

| 環境 | ブラウザ | 方式 | 状態 |
|------|---------|------|------|
| `http://localhost` | Chrome | blob URL `<a download>` | ファイル名UUID（バグ） |
| `http://localhost` | Chrome | `showSaveFilePicker` | ダイアログが開かない |
| `http://localhost` | Chrome | プログラム的`a.click()` | ブロックされる |
| `http://localhost` | Safari | `navigator.share()` シェアシート | **動作確認済み** |
| `http://localhost` | Playwright (Chromium) | blob URL | **動作確認済み**（テスト環境のみ） |
| `https://` (本番) | Chrome | `showSaveFilePicker` | **未検証（動く可能性高い）** |
| ネイティブアプリ | Capacitor | ファイルシステム直接 | **確実** |

**現在のコード**: ダウンロードリンクをトースト内に表示する方式。ユーザーが直接クリックしてダウンロード。

**今後の方針**: 本番環境（HTTPS）デプロイ時に`showSaveFilePicker`を再検証。iOSネイティブアプリ（Capacitor）では問題なし。Web MIDI APIもChromium専用（Safari非対応）。

#### CHS Export: 本番非公開（Chordcatリバースエンジニアリング）

**状況**: CHS形式（`.chs`、4096バイト）はChordcatアプリのバイナリフォーマットをリバースエンジニアリングしたもの。Chordcatの会社との交渉前に本番公開するのはNG。

**現在の対応**:
- `IS_DEV = location.pathname.indexOf('64-pad-dev') !== -1` でURL判定
- 本番（`/apps/64-pad/`）→ CHS Exportボタン非表示
- テスト環境（`/apps/64-pad-dev/`）→ CHS Export表示（HPS内輪デバッグ用）

**解除条件**: Chordcatの会社と交渉し、許可を得たら `IS_DEV` チェックを外す

---

## 第7層：元データ参照

| データ | 場所 |
|--------|------|
| スプレッドシート | `1NUPhquxUkWtWi66QSSekocceIaiB-o9oid8CnBMUdN0`（Google Sheets） |
| 五度圏アプリ | `/デジタル百姓総本部/プロジェクト/五度圏アプリ/` |
| 指番号ロジック | Daily notes/2025-12-31.md（17:41のメッセージ） |
| HPS記事 | `/デジタル百姓総本部/HPS/記事/` + note.com/urinami |
| Discord話題 | `/デジタル百姓総本部/AI関連/Discord話題/` |

---

**われわれは連帯して、あらがいます。**
