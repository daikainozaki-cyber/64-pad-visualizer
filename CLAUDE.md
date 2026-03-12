# 64 Pad Explorer - CLAUDE.md

**最終更新**: 2026-03-11
**担当人格**: 蔵人（実装）、継次（設計・レビュー）、フロ男（テンション・ボイシング設計）、マケ子（UI/UX外部視点）
**バージョン**: V3.30.13（2026-03-11）

---

## 第1層：存在意義

**ブラウザDAW — 「叩いて、並べて、書き出す」をブラウザだけで完結させる。**

DAWの複雑さは圧縮されるべきもの。パッドを叩く体験は圧縮されない。
ツールは限界まで簡素にして、人間の体験を邪魔しない。

**現在地（2026-03-09）**: サンプラー・シーケンサー・コードビルダー・楽器入力・エフェクト・MIDI I/Oは稼働中。DAWの部品は既に揃いつつある。残りは入力拡張（マイク/Audio）と出力拡張（録音/アプリ間連携）。PADDAWは未来の目標ではなく現在進行形。

三井田くんの川三64パッド（スプレッドシート v2.0.1）を超え、スケール・コード・ボイシング可視化からシーケンス・MIDI書き出しまでをWebアプリで実現する。

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
├── pad-core/       git submodule — 理論計算・データ定義のSSOT
│   ├── data.js       定数: SCALES, KEY_SPELLINGS, BUILDER_QUALITIES, TENSION_ROWS, GRID
│   ├── theory.js     純粋理論関数: padCalcVoicingOffsets, padFindParentScales等
│   └── render.js     SVGパッド描画: padRenderGrid, padComputeBoxes等
├── index.html      HTML構造 + script tags + data-i18n属性
├── style.css       CSS全量
├── i18n.js         i18nエンジン（t()関数、言語検出、DOM更新）
├── lang-*.js       9言語ファイル
├── data.js         AppState・BuilderState等の状態 + pad-coreアダプタ層
├── audio.js        オーディオエンジン・エフェクト・noteOn/Off
├── theory.js       ボイシング計算アダプタ層（pad-core関数を呼ぶ薄いラッパー）+ DOM操作
├── render.js       描画(パッド・五線譜・楽器)・render()統合
├── plain.js        Plainモード・メモリースロット・MIDI/CHS書き出し
├── builder.js      モード管理・ビルダーUI・コード検出・Web MIDI
├── perform.js      Performモード（16パッドでメモリースロット演奏）
├── main.js         初期化・キーボードショートカット
└── .github/workflows/
    ├── deploy.yml            mainへのpush → 自動デプロイ
    └── deploy-dev.yml        手動トリガー → dev環境デプロイ
```

**読み込み順序**: pad-core/data.js → pad-core/theory.js → pad-core/render.js → i18n.js → lang-*.js(9言語) → data.js → audio.js → theory.js → render.js → plain.js → builder.js → perform.js → main.js
（body末尾の`<script src>`方式。pad-coreが最初に読み込まれ、アプリ側がアダプタ経由で使用する）

### 参照ルール（pad-core SSOT）
- **理論計算の変更はpad-coreで行う。このリポには書かない。**
- AppState→pad-core関数引数の変換（アダプタ層）だけがこのリポの責務
- 理論関数をアプリ側に直接書いてはいけない（封鎖）

**五度圏アプリとは別アプリ**（でかくなるため）。データ層は将来的に共有。

### コード入力方式: Clover Chord System方式（3ステップ）

[Clover Chord Systems](https://clover-japon.com/en/) のUIを参考にする。うりなみさんが実際に使用中。

```
ステップ1: Root選択    → C, C#, D, D#, E, F, F#, G, G#, A, A#, B（12種）
ステップ2: Quality選択 → Maj, m, aug, dim, sus4, (Maj b5)（6種+）
※ sus2はsus4の転回形として扱う（ジャズ理論。例: Csus2 = Gsus4転回形）。理論的には独立コードとする解釈もあるが、うりなみさんの立場に従う
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

### Service Worker キャッシュバスト（必須ルール）

**コードを変更したら必ずバージョンを上げる。**これを忘れるとユーザーのブラウザに古いコードがキャッシュされたまま残り、変更が反映されない。最大の罠。

| ファイル | 変更箇所 |
|---------|---------|
| `sw.js` | `CACHE_NAME = '64pad-vX.Y.Z'` + 全ASSETS行の `?v=X.Y.Z` |
| `index.html` | 全 `<script src>` と `<link>` の `?v=X.Y.Z` |

**手順**: sw.js と index.html の両方で `replace_all` を使い旧バージョン → 新バージョンに一括置換。2ファイルだけ。

**ローカルサーバー起動は必ず `-c-1`（no-cache）**: `npx http-server -p 8081 -c-1`
デフォルトの http-server は `max-age=3600`（1時間キャッシュ）。これを忘れると全ファイルが古いまま配信され、コード変更が一切反映されない。2026-03-11に1時間無駄にした元凶。

**それでもキャッシュが効く場合**: `clear-cache.html` をブラウザで開く（SW解除+キャッシュ全削除+自動リダイレクト）。

**version-tag を JS で上書きするな。** 2026-03-11にaudio.jsの `_AUDIO_BUILD` がversion-tagをハードコードで上書きしていたため、HTMLのバージョンと表示が乖離し、キャッシュ問題と誤認して1時間以上無駄にした。version-tagの真実はHTMLの1箇所だけ。JSから触るな。

**sw.js の install で `cache: 'reload'` を使え。** `cache.addAll()` はブラウザHTTPキャッシュをバイパスしない。Pythonサーバーやno-cacheなしのサーバーで一度古いファイルがHTTPキャッシュに入ると、SW再インストール時にも古いファイルがキャッシュされ続ける。現在のsw.jsは `fetch(url, { cache: 'reload' })` + `cache.put()` で常にサーバーから取得する実装に修正済み。

**Python SimpleHTTPServerは絶対使うな。** `python3 -m http.server` はCache-Controlヘッダーを送らない。必ず `npx http-server -c-1` を使う。

### テスト環境（Dev）

| 項目 | 値 |
|------|-----|
| **公開URL** | https://murinaikurashi.com/apps/64-pad-dev/ |
| **デプロイトリガー** | 手動（GitHub Actions → Run workflow） |
| **デプロイ先** | ~/murinaikurashi.com/public_html/apps/64-pad-dev/ |
| **ワークフロー** | `.github/workflows/deploy-dev.yml` |
| **ブランチ** | main（本番と同じ。コードの分岐なし） |

**用途**: HTTPS環境でのshowSaveFilePicker検証、新機能テスト等。本番に影響を与えずにHTTPS動作を確認できる。

### タスク管理ルール

作業中に出たタスクは**必ずDashboardの「64 Pad Explorer」プロジェクトに登録する**（`dashboard_task.py add --project "64 Pad Explorer"`）。朝会で僕らの仕事が見えるようにするため。後回しのものだけでなく、今やるものも含む。完了したら`dashboard_task.py complete`。

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

### ソース1: Obsidian内のHPS記事（97本+）

**パス**: `/Users/nozakidaikai/Obsidian/ハードコア・パッドスタイル　note/`（全角スペース注意）
**整理表**: `/AI関連/discord-bot/data/HPS本編　内容.md`（本編8回+LOD+レッスンのクロスリファレンス）

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

### ソース2: うりなみさんの音楽理論資料（/notes/）

**パス**: `/Users/nozakidaikai/Obsidian/notes/`（100+ファイル）

うりなみさんが音楽書籍・実践知から整理した資料群。**AIの学習データにない「実践での重み付け」がここにある。**

| カテゴリ | 主要ファイル |
|---------|------------|
| **スケール選択** | `practical_scale_guide.md`（プロジェクト/64パッドアプリ/）、`Last Chord Scale Chart *.md`（4調性） |
| **ストックボイシング** | `ストックボイシング.md`、`ゴスペル的な６音スケールをDrop２でボイシング.md` |
| **ドミナント7th** | `ドミナント7th系スケール.md`、`ドミナント7thのテンション.md`、`ドミナント7thのテンションをコードの組み合わせで作る.md` |
| **ディミニッシュ** | `ディミニッシュ　資料.md`、`コンビネーション・オブ・ディミニッシュスケール.md`、`6th Diminished Scale.md` |
| **テンション** | `メジャー・ダイアトニックのテンション.md`、`マイナー・ダイアトニックのテンション.md`、`UST.md`、`アッパーストラクチャートライアド.md` |
| **コード進行** | `chord_progressions.md`、`バックドア進行.md`、`Chromatic Mediant.md`、`半音上に解決するソウルフルなコード.md` |
| **サブドミナントマイナー** | `サブドミナントマイナー.md`、`サブドミナント・マイナーの解決.md`、`サブドミナント・マイナーのテンション（代理コードを含む）.md` |
| **ゴスペル/ブルース** | `ゴスペル的な6音スケール.md`、`ゴスペル的なディミニッシュの使い方.md`、`ブルース・メロディ理論.md`、`Gospel-Jazz Piano Techniques and Reharmonization.md` |
| **ハイブリッドコード** | `ハイブリッド・コードをドミナント7thとして使うやり方.md`、`４度堆積コード.md` |
| **パッド演奏** | `パッドでのコードワーク.md`、`1コードものアプローチ.md` |

**なぜこれが重要か**: AIの学習データは理論を「教科書的に正しく」知っている。しかし「実践での重み付け」（例: iii7にはPhrygianではなくDorianを使う、HMモードは実戦で2つしか使わない）は学習データにない。このフォルダがその差分。

### ソース3: Discord話題（45日分+）

Discord話題にはボイシング・運指の実践知が蓄積されている。
例: Drop2ボイシング、回内/回外、クロマチックアプローチの運指等。
**パス**: `/デジタル百姓総本部/AI関連/Discord話題/`（月別アーカイブ）

### ソース4: うりなみさんとの壁打ち

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
| Phase 4.96 | **プレーン判定モード** | **完了** | Capture/Edit/Endワークフロー、16メモリースロット、MIDI/CHS書き出し、全モード共通スロット保存 |
| Phase 4.97 | **ファイル分割** | **完了** | 単一HTML(4,846行/202KB)→9ファイル(HTML+CSS+JS×7)。`<script src>`方式、ビルドツール不要 |
| Phase 4.975 | **Performモード + 16スロット + Undo** | **完了** | 16パッドリアルタイム演奏、キーボード4×4グリッド、MIDIパッド対応、D&D並び替え、Undo(30回) |
| Phase 4.98 | **多言語対応（i18n）** | **完了** | 9言語(en/zh/es/fr/pt/de/ja/ko/it)、`t()`関数+`data-i18n`属性方式、ビルドツール不要 |
| Phase 4.99 | **Parent Scale逆引き** | **完了** | 4スケールシステム(○/NM/■/◆)×7度×12キー。テンションフィルタ、五度圏距離ソート、行クリックでスケール切替。**コード・スケール編完成** |
| ~~Phase 5~~ | ~~指番号判定ロジック~~ | **廃止** | 指番号はツール自動化より人間が教える価値。HPSの参入障壁そのもの |
| Phase 6 | **ダイアグラム描画モジュール化** | 未着手 | ギター/ベース/ピアノ描画を再利用可能な単位に切り出し |
| Phase 7 | **五度圏アプリにダイアグラム統合** | 未着手 | モジュールを五度圏アプリにインポート |
| ~~Phase 8~~ | ~~記事からのデータ抽出パイプライン~~ | **廃止** | Phase 5廃止に伴い不要 |
| Phase A | **Audio Input（マイク→コード判定）** | 未着手 | getUserMedia+AnalyserNode→Chromagram(FFT→12PC)→padDetectChord。ギターユーザー取り込みの入口 |
| Phase R | **マルチトラック録音** | 未着手 | MediaRecorder+Web Audio。マイク+内部音源の複数トラック→WAV書き出し。デモ録り・レッスン記録品質 |
| Phase X | **アプリ間連携（PADDAW基盤）** | 未着手 | 同一オリジンlocalStorage+BroadcastChannelで64PE↔MRC↔五度圏を接続。MIDI転送、コード進行共有。各アプリ単独完成品＋組合せでDAW |
| Phase D | **Desktop/Pluginパイプライン** | 未着手 | Web push→Desktop自動sync→JUCEビルド→DMG/VST3/AU生成。手動sync-webui.shの自動化 |
| Phase M | **モバイルPlay対応（iPhone限定）** | **設計完了** | View=64パッド(縦持ち)、Play=32パッド(横持ち4×8)。詳細: `docs/mobile-play-design.md` |

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
| **16メモリースロット** | Chordcat互換（13コード対応）。`1-0`でスロット1-10呼出（Plain時） |
| **全モード共通スロット保存** | `Shift+1-0`で現在のコードをスロットに保存（Scale/Chord/Plain全モード） |
| **MIDI書き出し** | メモリースロットをSMF Type 0で書き出し。各スロット=四分音符1拍。ライブラリ不要 |
| **CHS書き出し** | Chordcat .chs形式（4096バイト）のバイナリ書き出し。13スロット対応 |
| **Memory Slotsパネル** | 右パネルに常時表示。全モードでスロット状態が見える。MIDI/CHS Exportボタン付き |
| **五線譜・楽器連動** | Plainモードでも五線譜・ギター・ピアノに選択音を表示 |

**PlainState構造**:
```js
const PlainState = {
  activeNotes: new Set(),       // クリックでon/offされたMIDIノート
  memory: Array(16).fill(null), // [{midiNotes: [...], chordName: string}] × 16
  currentSlot: null,            // 現在のスロット (0-15)
  subMode: 'idle',              // 'idle' | 'capture' | 'edit'
  captureIndex: 0,              // 次にキャプチャするスロット番号
};
```

**ショートカット（Plainモード時）**:
- `c`: Capture開始（新規コード構築）
- `e`: End(Capture終了→スロット保存) / Edit(idle時に直近スロット再編集)
- `1-0`: メモリー呼び出し（Plainモードではダイアトニック不要）
- `←→`: 半音移動（全ノート±1半音トランスポーズ）
- `↑↓`: 転回形（↑=最低音を1oct上へ、↓=最高音を1oct下へ）
- `x`: 全クリア

**ショートカット（Performモード時）**:
- `1234`/`qwer`/`asdf`/`zxcv`: 4×4グリッドでスロット1〜16を発音
- MIDIパッド（ノート36〜54）でも発音可能

**ショートカット（全モード共通）**:
- `p`: Perform表示の切り替え
- `Cmd/Ctrl+Z`: メモリースロットのUndo（最大30回）
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
| **16メモリースロット** | Chordcat互換。スロット保存・呼出・UI表示。全モードから保存可能 |
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

### V1.8（Performモード + 16スロット + Undo + D&D）

| 機能 | 内容 |
|------|------|
| **Performモード** | Memory/Perform切替ボタンで表示を切り替え。Perform表示ではメモリースロットのコードをリアルタイム演奏 |
| **16スロット化** | メモリースロットを13→16に拡張。4×4パッドグリッドに対応 |
| **キーボード4×4グリッド** | `1234`/`qwer`/`asdf`/`zxcv` でスロット1〜16を発音（Performモード時のみ） |
| **MIDIパッド対応** | MIDIノート36〜54（4×4パッド標準配列）でスロットをトリガー |
| **Undo（Cmd/Ctrl+Z）** | メモリースロットの変更を最大30回まで巻き戻し。`pushUndoState()` で変更前の状態をスタックに保存 |
| **ドラッグ&ドロップ** | メモリースロットをD&Dで並び替え（スワップ方式） |
| **`p` キー** | Performビューの切り替え（全モード共通） |

**Performモード設計**:
- `perform.js` — `PERFORM_KEY_MAP`（キーボード→スロットIdx）、`PERFORM_MIDI_MAP`（MIDIノート→スロットIdx）、`performPadTap()`（スロット再生）
- `PerformState.activePad` — 現在再生中のパッドインデックス
- Performモード中はキーボードの文字/数字キーがパッドトリガーに優先される（`handlePerformKey()` が最高優先度）
- Memory表示に戻ると `PerformState.activePad` がリセットされる

**キーボード4×4グリッド配置**:
```
1 2 3 4   → slot 1-4
q w e r   → slot 5-8
a s d f   → slot 9-12
z x c v   → slot 13-16
```

**MIDI 4×4パッド配置**:
```
51 52 53 54  → slot 13-16
46 47 48 49  → slot 9-12
41 42 43 44  → slot 5-8
36 37 38 39  → slot 1-4
```

**Undoスタック**: `undoStack[]`（最大30件）。`pushUndoState()` はスロット保存・削除・D&Dスワップの直前に呼ばれる。`undoMemory()` でpop→復元→トースト通知。

### V1.9（2026-02-13 多言語対応 i18n）

| 機能 | 内容 |
|------|------|
| **9言語対応** | en, zh, es, fr, pt, de, ja, ko, it（世界人口90%+カバー） |
| **i18nエンジン** | `i18n.js` — `t(key, vars)` 関数、`data-i18n` DOM更新、言語検出、localStorage永続化 |
| **言語自動検出** | `navigator.language` → 対応言語マッチング → フォールバック英語 |
| **言語セレクタ** | ヘッダーバーの `?` ボタン横に `<select>` 配置。2文字コード表示（EN/JA/ZH等） |
| **音楽用語は英語固定** | Scale, Chord, Root, Quality, Tension, Shell, Drop, Inversion等は全言語で英語のまま |
| **日本語固有表現** | 「特性音」「音名」「度数」等は日本語のみ日本語表記 |

**アーキテクチャ**:
- `I18N.addLang(code, data)` — 各 `lang-xx.js` が自己登録
- `t(key, vars)` — ドット記法キー解決 + `{var}` 変数展開。フォールバック: 現在言語 → en → キー名
- `data-i18n` 属性 — 静的HTML要素。`I18N.updateDOM()` で一括更新（innerHTML対応）
- `I18N.setLang(code)` — DOM更新 + Plain/Memory/Info/Legend等の動的UI全更新 + localStorage保存

**翻訳対象（説明文・ガイダンス）**:

| カテゴリ | 内容 |
|---------|------|
| `help.*` | ヘルプモーダル全文 |
| `plain.*` | Plainモードのステータス（idle/capturing/editing） |
| `notify.*` | トースト通知（slot saved/selected/cleared/undo） |
| `legend.*` | 凡例（特性音、スケール音等） |
| `label.*` | 音名/度数切替 |
| `info.*` | 音数表示（「7 notes」等） |
| `builder.*` | ステップラベル（Select root等） |
| `midi.*` | MIDIデバイス関連 |
| `memory.*` | スロット操作（Play/Stop/Empty等） |
| `ui.*` | 閉じる、ヒント等 |

**翻訳しないもの（英語固定）**: Scale, Chord, Plain, Perform, Memory, Root, Quality, Tension, Shell, Drop, Inversion, Omit, Rootless, Voicing, Staff, Guitar, Bass, Piano, Sound, MIDI, CHS, Export, Capture, Edit, Clear, Play, Save, ORGAN, E.PIANO, VOL, REV, PHASE, FLANG, TREM, SPEED, LO CUT, HI CUT, Panic, Omit 5/3, Drop 2/3, Root/1st/2nd/3rd

**修正ファイル**: index.html（`data-i18n`属性80+箇所）、render.js（7箇所）、plain.js（16箇所、`const t`→`const toast`リネーム含む）、builder.js（4箇所）、main.js（`I18N.init()`追加）

**注意**: plain.jsの`exportPlainMidi()`/`exportPlainChs()`内にあった`const t = document.getElementById('slot-save-toast')`はグローバル`t()`関数とのシャドウイングを避けるため`const toast`にリネーム済み

### V2.1（2026-02-13 楽器入力UI修正 + Audio事前ウォーミング）

| 修正 | 内容 |
|------|------|
| **Clear/Playボタン非表示制御** | Guitar/Bass/Pianoでフレット/鍵盤未選択時はClear/Playボタンを非表示。選択時のみ表示（`updateInstrumentInput` + `clearInstrumentInput`） |
| **Audio事前ウォーミング** | フレット初回選択時に`ensureAudioResumed()`を呼び出し、AudioContext resume + SoundFontデコードをPlayクリック前に完了させる |

**修正ファイル**: render.js（`updateInstrumentInput`に controls表示制御 + `ensureAudioResumed()`追加、`clearInstrumentInput`にcontrols非表示追加）、index.html（`#instrument-controls`初期`display:none`、キャッシュバスト`?v=2.0.2`）

**技術背景**: Chrome autoplay policyにより、AudioContextはユーザージェスチャーなしでは`suspended`のまま。Guitar/Bass/Pianoのフレットクリックはユーザージェスチャーとして認識されるため、この時点で`ensureAudioResumed()`を呼ぶことでPlayボタン押下前にデコードが完了する。

### V2.2（2026-02-16 Parent Scale Available Tensions + Scale Filter + バグ修正）

| 機能/修正 | 内容 |
|-----------|------|
| **findParentScales() containment方式に書き換え** | quality-tetradマッチングから、コードトーンのPCS⊂スケールトーンの包含チェック方式に変更。Alteredスケール等が正しく表示されるように |
| **SCALE_AVAIL_TENSIONS（HOW TO IMPROVISE）** | スケールごとの利用可能テンション・アボイドノートデータ。31スケール対応。data.jsに追加 |
| **PC_TO_TENSION_NAME / TENSION_NAME_TO_PC** | ピッチクラス↔テンション名の変換テーブル。`{1:'b9', 2:'9', 3:'#9', 5:'11', 6:'#11', 8:'b13', 9:'13'}` |
| **Parent Scale行にAvailable Tensions表示** | 各Parent Scale結果にそのスケールで使えるテンション名を表示（例: `9 13`, `b9 b13`） |
| **Parent Scale行クリックでテンションフィルタ** | 行クリックでスケール選択→テンショングリッドの非対応ボタンをdashed+低opacity+pointer-events:none化 |
| **Avoid Conflict警告** | 現在のコードのテンションがスケールのavoidノートに含まれる場合、行にavoid警告を表示（opacity低下） |
| **↗ボタンでScale mode遷移** | 行クリック（選択/フィルタ）と↗クリック（Scaleモード遷移）を分離 |
| **b5→#11命名変換** | 7thコード文脈でのb5をgetBuilderChordName()で#11に変換。b5はqualityの変形(5th置換)、#11はテンション(5th保持) |
| **tensionAbsPCS修正** | render.jsでのテンション絶対PCS計算のバグ修正（rootPC加算漏れ） |
| **重複テンション除去** | data.jsの(b9,#9,b13)重複エントリ削除、欠落テンション(#9,b13),(b9,13),(#9,#11)追加 |
| **CSS視覚フィードバック強化** | 選択行: 左ボーダー3px+accent色スケール名。非対応テンション: opacity 0.2+dashed（クリック可能） |
| **Parent Scaleオートセレクト** | ダイアトニックコード選択時にParent Scaleを自動選択→テンションフィルタを即座に適用。パネル未展開でも動作 |
| **コードフィンガープリント** | `root:qualityName:tensionLabel` でコードコンテキスト変化を検出→オートセレクトをリセット |
| **手動オーバーライド** | ユーザーが行クリックで手動選択/解除するとオートセレクト無効化。次のコード変更で再有効化 |

**修正ファイル**: data.js（SCALE_AVAIL_TENSIONS, PC_TO_TENSION_NAME, TENSION_NAME_TO_PC追加、テンション重複修正）、render.js（renderParentScales書き換え、onPSSelect/onParentScaleGo/applyParentScaleFilter追加、tensionAbsPCS修正、オートセレクトロジック）、theory.js（findParentScales containment方式、b5→#11変換）、style.css（Parent Scale選択/avoid/フィルタCSS）

**_selectedPS**: `{parentKey, scaleIdx}` — 現在選択中のParent Scale。行クリックでトグル。コード変更時にオートセレクトで自動設定。

**_psAutoSelect**: `true`=オートセレクト有効（コード変更時にリセット）、`false`=ユーザーが手動操作済み。

**_psChordFP**: `root:qualityName:tensionLabel` — コードフィンガープリント。変化検出でオートセレクトを再有効化。

**applyParentScaleFilter()**: テンショングリッドの各ボタンのadd/sharp5/flat5 PCをSCALE_AVAIL_TENSIONSと照合。replace3(sus4)は質の変更なのでフィルタ対象外。非対応テンションはopacity 0.2+dashed表示だがクリック可能（学習用途でnon-standardテンションも試せる）。

**オートセレクトのテスト結果**:
| コード | 自動選択スケール | unavailable/total |
|--------|-----------------|-------------------|
| C△7 (I△7) | Ionian | 24/66 |
| Dm7 (ii7) | Dorian | — |
| Em7 (iii7) | Phrygian | 21/63 |
| G7 (V7) | Mixolydian | 25/69 |
| Am7 (vi7) | Aeolian | — |
| Bm7(b5) (viiø7) | Locrian | 17/59 |

### V2.3（2026-02-16 Scale Overlay on Chord Mode）

| 機能/修正 | 内容 |
|-----------|------|
| **Scale Overlay** | Chord modeでAvailable Scaleの行を選択すると、スケール音をパッドグリッドにオーバーレイ表示。コードトーンと同時にスケール音が見え「このコードの上でどの音が使えるか」が一目瞭然 |
| **オーバーレイ色** | 通常スケール音: dim sky blue（`--pad-overlay: rgba(86,180,233,0.2)`）、特性音: dim yellow（`--pad-overlay-char: rgba(240,228,66,0.3)`） |
| **度数ラベル** | オーバーレイ音にスケール度数ラベル（R, b2, 2, b3, 3, 4...）を表示。`SCALE_DEGREE_NAMES[interval]`を使用 |
| **凡例更新** | オーバーレイアクティブ時に「Scale」項目を凡例に追加（`#legend-overlay`） |
| **色優先チェーン** | plain → omitted → root → bass → guide3 → guide7 → char → avoid → tension → active → **overlay**（最低優先） |
| **onPSSelect→render()** | `onPSSelect()`が`renderParentScales()`のみ呼び出していた → `render()`に変更。パッドオーバーレイが即時反映 |

**修正ファイル**: render.js（computeRenderState + renderPads + renderLegend + onPSSelect）、style.css（CSS変数2件）、index.html（バージョン+キャッシュバスト+凡例HTML+Version History）

**バグ修正**:
- **TDZ ReferenceError**: `const isOverlay`がstroke計算より後に宣言されていた → フラグ定義群（line ~150）に移動
- **onPSSelect未反映**: `renderParentScales()`→`render()`に変更

**computeRenderState()追加フィールド**:
- `overlayPCS` — 選択中スケールの絶対PCS（Set）。null when no overlay
- `overlayCharPCS` — 特性音の絶対PCS（Set）

### 実践的スケール選択リファレンス（2026-02-16）

**詳細: `practical_scale_guide.md`**（うりなみさんの実践知を重み付きで記録）

要点:
- **大原則**: アボイド=0優先 + 解決先の2択（メジャー/マイナー）
- ダイアトニック: I△7→Lydian, iii7/vi7→Dorian, viiø7→Locrian #2
- Dom7系: →メジャー解決=Mixolydian, →マイナー解決=Altered/HMP5↓
- 裏コード=Lydian b7, dim7=コンディミ, 7sus4=Mixolydian sus4
- MMモード★4つが実戦主力、HMモードはHMP5↓とFunc.Dimだけ実戦的

### V2.5（2026-02-17 Practical Sort + ピボットコード思考 + テンションdimming）

| 機能/修正 | 内容 |
|-----------|------|
| **SCALE_AVAIL_TENSIONS データ修正** | Phrygian: avoid `['b9']` → `['b9','b13']`（avoidCount 1→2）。Aeolian: avoidなし → `['b13']`（avoidCount 0→1）。b13(pc=8)は5th(pc=7)の半音上でavoid |
| **avoidCountフィールド追加** | `findParentScales()`の結果オブジェクトに`avoidCount`を追加。SCALE_AVAIL_TENSIONSから取得 |
| **Practical / Diatonic トグル** | Parent Scaleパネルヘッダーにトグルボタン追加。Practical: avoidCount優先ソート。Diatonic: distance優先ソート（V2.3以前の動作）。localStorage永続化 |
| **DIATONIC_AUTO_PREF** | ダイアトニック度数ごとの推奨scaleIdx。I△7→Lydian, iii7→Dorian, vi7→Dorian, viiø7→Locrian ♮2 等 |
| **findBestAutoSelect()** | Practicalモードではダイアトニック度数から推奨スケールを自動選択。Diatonicモードでは従来通りresults[0] |
| **closeResults選択結果包含** | 自動選択されたスケールがdistance>1でも常にcloseResultsに含まれ表示される |
| **omit5Matchソート追加** | Practical/Diatonic両方のソートにomit5Match（非omit5優先）を追加 |
| **ダイアトニックバー非表示（手動コード構築時）** | Chordモードで手動Root→Quality選択時にダイアトニックバーを非表示。`BuilderState._fromDiatonic`フラグで管理。ダイアトニック経由なら表示維持。**ピボットコード思考**: キーから切り離されたコードが「どのキーに属しうるか」をAvailable Scaleで可視化 |
| **○スケール常時表示（近親調）** | closeResultsフィルタに`r.system === '○'`を追加。ダイアトニック（○）のParent Scaleは五度圏距離に関わらず常に表示。近親調の可視化 |
| **Parent Scaleパネル視覚強化** | フォントサイズ+0.1rem全体、opacity増加、padding増加、max-height 200→240px |
| **Category G: テンションdimming** | 非ドミナント7thコード（△7, m7, m△7, dim7等）でb9/#9/b13/aug/b5を含むテンションをopacity 0.35で薄表示。ドミナント7はdimmingなし（オルタードが標準）。`.tension-uncommon`クラス。クリック可能（学習用） |

**修正ファイル**: data.js, theory.js, render.js, builder.js, style.css, index.html, lang-*.js×9, practical_scale_guide.md

**Practicalモードの自動選択結果（Key=C）**:

| コード | Practical | Diatonic（V2.3） |
|--------|-----------|------------------|
| C△7 (I) | **Lydian** | Ionian |
| Dm7 (ii) | Dorian | Dorian |
| Em7 (iii) | **Dorian** | Phrygian |
| F△7 (IV) | **Lydian** | Lydian |
| G7 (V) | Mixolydian | Mixolydian |
| Am7 (vi) | **Dorian** | Aeolian |
| Bm7b5 (vii) | **Locrian ♮2** | Locrian |

**テンションdimming設計**:
- **ドミナント7**: dimming なし（b9/#9/b13/aug/b5はオルタードとして標準）
- **その他の7thコード**: b9(pc=1), #9(pc=3), b13(pc=8), aug(mods.sharp5), b5(mods.flat5)を含むテンションを薄表示
- **7thなしコード**: Category Dで既にオルタード非表示（変更なし）
- **理由**: 近親調から考えてもb9/#9/b13がメジャー7thやマイナー7thに乗ることは稀。存在は示すが目立たせない
- **m7(13)はdimmingしない**: ナチュラル13th=ドリアンの特性音。II-V-Iで標準使用されるため、モード意識なしで普通に使う（詳細: `practical_scale_guide.md`）

**ピボットコード設計思想**:
- **Key→Chord方向**（ダイアトニックバー）: キーの中でコードを見る。伝統的な音楽理論アプローチ
- **Chord→Key方向**（Available Scale）: コード単体からどのキーに属しうるかを見る。ピボットコード思考
- 手動コード入力時にダイアトニックバーを消すことで、キーの呪縛から解放。**両方の視点を持てるのが64 Pad Explorerの独自性**

### V2.6（2026-02-18 ガイドページ仕上げ + SEO）

| 機能/修正 | 内容 |
|-----------|------|
| **Available Scaleチャート** | コード→スケール対応表をguide.htmlに追加（前セッション） |
| **ペンタトニック注釈** | Available Scaleセクションにペンタトニック/ブルーススケールの補足説明。全9言語の`ss_parent_note`追加 |
| **YouTube動画3本埋め込み** | guide.htmlにレスポンシブiframe。概要、メモリー/MIDI、Available Scaleの3本 |
| **Plain Mode文言修正** | `ss_plain_desc`を「理論フィルタなし」→「理論を知らなくてもコードがわかります」に変更（全9言語） |
| **メタディスクリプション追加** | index.html/guide.htmlに`<meta name="description">`追加。「コードがわからなくても大丈夫」「ギター・鍵盤からのコード判定」「音源内蔵、インストール不要」等のSEOキーワード |

**修正ファイル**: guide.html, index.html, lang-*.js×9

### V2.7（2026-02-18 楽器入力×Chordモード統合）

| 機能/修正 | 内容 |
|-----------|------|
| **楽器入力とChordモード統合** | ギター/ベース/ピアノで入力した音をBuilderコードと合成してコード判定・Available Scale絞り込み |
| **renderParentScales() dual path** | 楽器入力あり→楽器音のPCをfullAbsSetに追加、なし→既存処理 |
| **builderClear()に楽器クリア統合** | builderClear()で楽器入力も一括クリア |

**修正ファイル**: render.js, builder.js, index.html

### V2.8（2026-02-18 テンション追加モード完成）

| 機能/修正 | 内容 |
|-----------|------|
| **全4入力対応** | 64パッド・ギター・ベース・鍵盤で追加音トグル（クリックでON、同一音でOFF） |
| **padExtNotes** | MIDI note保存、computeRenderStateでオーバーライド、ビルダーコードを初期シードに |
| **applyNotesToBuilder()** | パッドトグル→detectChord→BuilderState逆マッピング（root/quality/tension自動設定） |
| **clearInstrumentInput()** | クリア後にrender()呼び出し追加 |

**修正ファイル**: render.js, plain.js, index.html

### V2.9（2026-02-18 パッドビルダー更新 + スペースキー再生）

| 機能/修正 | 内容 |
|-----------|------|
| **パッドでビルダー直接更新** | C△7設定中にパッドのD音を押す→テンションパネルの「9」が自動選択→C△7(9)に変化 |
| **スペースキー = 現在コード再生** | Spaceキーショートカット追加（main.js） |
| **i18n更新** | sc_space/sc_pad_explore 全9言語追加、footer V2.9更新 |

**修正ファイル**: render.js, main.js, index.html, guide.html, lang-*.js×9

### V2.13（2026-02-20 ギター/ベースにスケールオーバーレイ）

| 機能 | 内容 |
|------|------|
| **楽器スケールオーバーレイ** | Chordモードでスケール選択時、ギター/ベースフレットボードにもスケール音を半透明で表示 |
| **描画順修正** | render.js内のrenderScaleOverlayの呼び出し順を修正し、楽器ダイアグラムにオーバーレイが反映されるよう対応 |

**修正ファイル**: render.js, index.html

### V2.14（2026-02-20 オクターブ変更で再生音連動 + Wishlistリンク）

| 機能 | 内容 |
|------|------|
| **オクターブ連動再生** | `playCurrentChord()`, `getCurrentChordMidiNotes()`, `playVoicingBoxAudio()`にoctaveShiftオフセット追加。shiftOctave()でplayCurrentChord()を呼ぶよう変更 |
| **Wishlistリンク** | ヘッダーナビにAmazon Wishlistリンク追加 |

**修正ファイル**: theory.js, plain.js, index.html

### V2.15（2026-02-20 メモリー再生時のパッド反映）

| 機能 | 内容 |
|------|------|
| **highlightPlaybackPads()** | メモリー再生時にパッドを緑色でハイライト + 音名 + 度数ラベル表示。detectChord()でルート判定 |
| **再生連動** | playMemorySlots()でhighlightPlaybackPads呼出、stopSlotPlayback()でクリア |

**修正ファイル**: builder.js, plain.js, index.html

### V2.16（2026-02-20 音色デフォルト保存）

| 機能 | 内容 |
|------|------|
| **saveSoundSettings()** | エンジン/プリセット/全スライダー値/フィルタトグルをlocalStorage `64pad-sound`に保存 |
| **loadSoundSettings()** | onReady時にlocalStorageから復元。dispatchEvent('input')で既存ハンドラをトリガー |

**修正ファイル**: audio.js, index.html

### V2.17（2026-02-20 MIDI入力デバイス設定保存）

| 機能 | 内容 |
|------|------|
| **デバイス名保存** | MIDIデバイスIDは不安定なため、デバイス名をlocalStorage `64pad-midi-device`に保存 |
| **自動選択** | refreshDeviceList()で保存済みデバイス名とoption.textContentを照合して自動選択 |

**修正ファイル**: builder.js, index.html

### 次の実装目標（2026-03-11更新）

#### TASTY エンジン — **完了** (V3.31.5, 2026-03-12)

- レシピ→コード変換（129レシピ）、TASTY Voicing Engine（128度数ベースボイシング）
- ボイシングボックスA/B/C/D + 選択→exact-MIDI表示、未選択→全オクターブpitch class表示
- Escape: TASTY+box→boxのみ解除（TASTYは維持）、TASTY only→TASTY解除
- UIバー: ビルダー表記 + 構成音 + TOP + ◀▶循環
- 五線譜: TASTY対応済み。ギター/ピアノ: pitch classレベルで反映（十分）
- `?hps` パラメータで表示/非表示

**設計判断**: TASTY = パッドで弾けるもののみ。ピアノ専用ボイシングはStock Voicingで別管理

#### TASTY 表示バグ修正 (V3.31.3→V3.31.4, 2026-03-11)

**コンセプト**: TASTY = 元々のコードを変形させる。表記はビルダーと合わせる（m9ではなくm7(9)）

**認知フロー（うりなみさん確定）**:
1. TASTYを押す（かっこよくしたい） → 2. 聴く（かっこよくなった） → 3. TASTYバーを見る →「Cm7(9)として考えてるんだ」+ 構成音確認 → 4. パッドに視線移動 → ボトムから上へ度数構造を読む

**発見されたバグと修正**:

| # | 問題 | 原因 | 修正 | Ver |
|---|------|------|------|-----|
| 1 | 6音中3音しかパッドに表示されない | `_voicingPass`がinstrument filterを適用 | TASTY有効時は`_voicingPass`をバイパス | 3.31.3 |
| 2 | tension色分けなし | tensionPCSリセット後に再分類なし | degreeMapからguide3/guide7/tensionPCSに分類 | 3.31.3 |
| 3 | TASTYバーが情報不足 | recipe.name + TOPだけ表示 | ビルダー表記（Cm7(9)）+ 構成音 + TOP + ラベル | 3.31.4 |
| 4 | TASTY時ABCDボックスがビルダー基準 | ボックスがTASTYの音ではなくビルダーで計算 | TASTY時はボックス非表示 | 3.31.3 |
| 5 | パッドのTOPテキストラベル冗長 | バー+白ボーダー+テキストの3重表示 | テキスト削除、白ボーダーのみ | 3.31.3 |
| 6 | TASTY時パッドに白い枠線（白カッコ） | コードトーンの`stroke: rgba(255,255,255,0.3)`が目立つ | TASTY時はコードトーンの`stroke=none`、TOPのみ白ボーダー | 3.31.4 |

**教訓**:
- instrument filterとTASTYは独立モード。モード間のフィルタ干渉に注意
- **SWキャッシュ**: バージョンバンプしないとSWが古いコードを返す。ローカル開発でもclear-cache.html必須
- **Playwright検証でもSWが登録される**: SW解除→リロード→検証の手順を踏む

#### 既存の目標（旧）

| Ver | 機能 | 内容 | 重さ |
|-----|------|------|------|
| **V2.18** | **マイナーコンバージョン対応** | うりなみさんから理論説明を受けてから着手。Practical Sortとは別コンセプト | 中 |
| **V2.19** | **音名/キー表記の見直し** | A#キー→Bb等、実用的な異名同音表記。壁打ちで方針決定してから | 中 |
| **V3.0** | **Plainモード廃止（Single Mode Architecture）** | Scale/Chordをトグル化、モード概念をなくす。パッドは常にラッチ+判定 | 重 |

### 将来の実装（優先度低）

| 機能 | 内容 | 方針 |
|------|------|------|
| **Sequenceモード** | Performで叩いたコード進行を時間軸に配置→音価編集→MIDI書き出し | **→ PAD DAWプロジェクトに分離**（`プロジェクト/PAD DAW/CLAUDE.md`参照） |
| **ダイアグラム描画モジュール化** | ギター/ベース/ピアノ描画を再利用可能な単位に切り出し | 五度圏アプリ統合のため |
| **五度圏アプリにダイアグラム統合** | モジュールを五度圏アプリにインポート | 縮小ダイアグラムとして配置 |
| **PWA化** | manifest.json + Service Worker | 携帯UIデザインが必要なため、機能が揃ってから |
| ~~iOSネイティブアプリ~~ | ~~Capacitor + CoreMIDIブリッジ~~ | **見送り**（2026-02-16決定） |

**実装済み（記録漏れ）**: シェル+テンション — シェルボイシング状態でテンションを選択すると、シェル音にテンション音が加わる。実際の演奏に近い操作感。

### モバイルPlay設計（iPhone限定、2026-03-03設計）

**スコープ**: iPhone限定。iPadは現状のタブレットレイアウトで問題なし（パッドが十分大きい）。

**コンセプト**: View / Play モード切替
- **Portrait（縦持ち）= View専用**: 既存の3画面スワイプ（8×8 = 64パッド）でフィンガリング・ボイシング確認
- **Landscape（横持ち）= Play モード**: 画面回転で自動切替、4×8 = 32パッド（演奏向け）

**GRID_PLAY定数**:
```javascript
GRID_PLAY = { ROWS: 4, COLS: 8, BASE_MIDI: 36, ROW_INTERVAL: 5, COL_INTERVAL: 1, PAD_GAP: 4, MARGIN: 8 }
// PAD_SIZEはviewportから動的計算: Math.floor((vw - MARGIN*2 - 7*PAD_GAP) / 8)
```

**パッドサイズ**: iPhone SE ~72px、iPhone 15 ~95px、iPhone 15 Pro Max ~105px（十分弾ける大きさ）

**既存メディアクエリ活用**: `@media (max-width: 812px) and (max-height: 500px) and (orientation: landscape)` がiPhone landscapeを正確にターゲット（iPad除外済み）

**技術変更**: render()でGRID/GRID_PLAYを分岐、Landscape CSSでパッドフルスクリーン、ミニコントロールバー（Key/Scale/Sound）、タッチイベント最適化（multitouch、haptic feedback）

**実装フェーズ**: Phase M1=4×8パッド基本 → M2=ミニコントロール → M3=タッチ最適化 → M4=PWA最適化

**詳細設計書**: `docs/mobile-play-design.md`

**うりなみさん確認待ち**: ①4×8でOK？ ②自動切替？ ③Play中のコントロール？ ④Performモード統合？

### MIDI Timeline Playback (V3.5, 2026-03-02)

MIDIファイルをインポートしてタイムライン再生し、パッドを点灯させる機能。

**アーキテクチャ**:
```
[MIDI File] → importMidiTimeline() → parseMidiToTimeline()
                                           ↓
                                   [{tick, startMs, endMs, notes[], chordName}]
                                           ↓
                                     MidiSequencer (rAF loop)
                                           ↓
                           ┌───────────────┼───────────────┐
                           ↓               ↓               ↓
                     noteOn()/Off()  highlightPlaybackPads()  UI更新
                     (既存・音)      (既存・視覚)            (進捗バー)
```

**ファイル**: plain.js（parseMidiToTimeline, MidiSequencer, importMidiTimeline）+ index.html（midi-player-section）

**対応**: テンポメタイベント(FF 51)解析、VLQデルタ、ランニングステータス、マーカー(FF 06)、コード自動検出

**V3.7修正 (2026-03-02)**:
- `tickToMs()`: tick 0にデフォルト+MIDIメタの重複tempoChangeでタイミング3倍膨張 → `tc.tick > prevTick`ガードで修正
- `_tick()` note-off: 毎フレームrender()呼び出し → hadNotesフラグで遷移時1回のみに削減
- Performモード/Play All/MIDI再生すべてでパッドグリッド・五線譜・コード検出を表示統一

**三面等価アーキテクチャでの位置**:
- 64 Pad Explorer: MIDI import → パッド点灯（手形表示）
- DAW VST3/AU: processBlock → パッド点灯（既に実装済み）
- リズム譜アプリ: MIDI export → 64 Pad Explorerにimport → パッド点灯

### 音源ライセンス状況 (2026-03-02)

| 音源 | ライセンス | 商用利用 | 状態 |
|------|-----------|----------|------|
| jRhodes3c | CC-BY-4.0 | OK | クレジット必須 |
| FluidR3 GM | MIT | OK | クレジット推奨 |
| GeneralUserGS | Custom Permissive | OK | クレジット必要 |
| Chaos Bank | CC0 | OK | 不要 |
| ~~JCLive~~ | 不明 | 不可 | **V3.5で除外** |
| ~~SBLive~~ | E-mu著作権 | 不可 | **V3.5で除外** |
| WebAudioFontPlayer | **GPL-3.0** | 要注意 | Web版OK、Desktop有料版は商用ライセンス要 |

### Desktop版サウンド戦略 (V3.6, 2026-03-02)

**Desktop版は内蔵音源ゼロ。純粋なVSTホスト+可視化ツール。**

| フォーマット | サウンド | UI |
|-------------|---------|-----|
| Web版（ブラウザ） | WebAudioFont + jRhodes3c（内蔵） | ORGAN/E.PIANOボタン表示 |
| Desktop Standalone | VSTプラグイン（ユーザーがロード） | 「Load a VST/AU plugin」メッセージ |
| Desktop VST3/AU | DAW側の音源 | サウンドUI非表示 |

**理由**:
1. WebAudioFontPlayer = GPL-3.0 → 有料Desktop版に同梱するとGPL感染リスク
2. うりなみさんの経験: サンプル音源プロジェクトがライセンス問題で数年分消滅
3. ユーザーは自分のVSTを持っている（Desktop版を買う層は中級者以上）
4. DAWでVST3/AUとして使う場合、DAW側に音源があるので内蔵は不要

**実装**: `_initDesktopSoundMode()` in audio.js
- `_isDesktop`時にORGAN/E.PIANO/エフェクト/プリセットUIを非表示
- VOLスライダーのみ表示（C++ masterGain制御）
- noteOn/Off/allNotesOffは常にC++にルーティング（`_useNativeAudio`チェック不要）
- VSTロード前はC++のサイン波フォールバック

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
- `IS_DEV` でURL判定（`64-pad-dev` または `64-pad-chs` パスで有効）
- 本番（`/apps/64-pad/`）→ CHS Exportボタン非表示
- CHS専用（`/apps/64-pad-chs/`）→ CHS Export表示（deploy-chs.yml workflow_dispatch）
- テスト環境（`/apps/64-pad-dev/`）→ CHS Export表示

**解除条件**: Chordcatの会社と交渉し、許可を得たら `IS_DEV` チェックを外す

#### CHS フォーマット解析（2026-02-25更新）

**ファイル構造** (4096バイト、Chordcat native exportとの比較で確定):
- `0x00-0x01`: マジック `83 49`
- `0x02-0x0F`: ヘッダ（0x0Fは0x00/0x10混在、コードセットにより変動）
- `0x10-0x77`: 13スロット × 8バイト（+0=00, +1〜+6=MIDIノート降順・右詰め, +7=00）
- `0x78-0x87`: Chordset名（NULL終端）
- `0x88`: Chordcat内部スロットID（Manager UI上のID番号に対応）
- `0x8A`, `0x8C`: 不明メタデータ（BPM等の設定値？コードセットにより変動）
- `0xFB4-0xFC0`: Chordset名の複製

**PadExplorer export修正済み（2026-02-25）**:
- ノート格納: バイト1-6、6音まで、右詰め（少ない音数は左側が0x00パディング）
- 名前: 0x78 + 0xFB4 の両方に書き込み
- ヘッダ/メタデータ: 固定値を書かない（0x00、Managerに任せる）

**Chordcat Manager転送バグ（2026-02-25確定）**:
- ManagerからCHSファイルを転送すると名前とIDは反映されるがコードデータが反映されない
- Chordcat本体から書き出したCHSファイルを再読み込みしても同じ症状（コードデータ空）
- つまりChordcat自身のexportすら再importできない = Manager側のバグ確定
- AlphaThetaに動画付きでバグ報告済み（2026-02-25）
- 2026-02-26に担当者と話す予定

---

## 第7層：元データ参照

| データ | 場所 |
|--------|------|
| スプレッドシート | `1NUPhquxUkWtWi66QSSekocceIaiB-o9oid8CnBMUdN0`（Google Sheets） |
| 五度圏アプリ | `/デジタル百姓総本部/プロジェクト/五度圏アプリ/` |
| 指番号ロジック | Daily notes/2025-12-31.md（17:41のメッセージ） |
| HPS記事 | `/デジタル百姓総本部/HPS/記事/` + note.com/urinami |
| Discord話題 | `/デジタル百姓総本部/AI関連/Discord話題/` |

### 参照変更プリフライトチェック（URL・パス・インフラ変更時）

1. **ハードコードされたURL/パスはないか？** → `grep -r "localhost\|murinaikurashi"` で検出
2. **書き込み経路は一本か？** → SSOTと書き込み元を列挙
3. **派生データは全て洗い出したか？** → 変更元を参照しているファイルを全検索
4. **ドキュメントの参照は更新したか？** → CLAUDE.md、忘れやすいこと.md
5. **元に戻せるか？** → バックアップの確認

**出典**: 哲学駆動型開発 — 参照の完全性（参照は一方向・一経路のみ）

---

**われわれは連帯して、あらがいます。**
