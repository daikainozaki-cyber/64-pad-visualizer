# 64PE Desktop: BOOTH + itch.io 出品チェックリスト

**作成日**: 2026-03-13
**タスク**: #563
**担当**: マケ子（市場調査）、蔵人（実装）

---

## プラットフォーム比較

| 項目 | BOOTH | itch.io |
|------|-------|---------|
| **手数料** | 5.6% + 22円/件 | 10%デフォルト(0-100%調整可) + ~3%決済 |
| **日本顧客** | ◎ コンビニ/銀行振込対応 | △ USD決済のみ |
| **海外顧客** | △ 限定的 | ◎ インディーゲーム/ツール層 |
| **ソフト売り場** | △ 同人/アート中心 | ◎ ツール/ゲーム向け |
| **通貨** | JPY | USD |
| **初期費用** | 無料 | 無料（Tax Interviewあり） |
| **PWYW** | なし | あり（最低価格+上乗せ） |
| **更新方法** | 手動再アップ | butler CLIで差分更新 |

**結論**: **両方出す**。BOOTHは日本のHPSコミュニティ（コンビニ払い重要）、itch.ioは海外パッド/音楽制作層。維持コストは低い。

---

## 先決事項（出品前に必要）

### 方針（2026-03-13 うりなみさん決定）

- **macOSのみ**。Windowsはださない
- **音源なし**。Desktop/Pluginは可視化+MIDI出力に特化。音はDAW側で鳴らす

### コード署名

| 項目 | 費用 | 必要性 |
|------|------|--------|
| Apple Developer Program | $99/年 | **必須**（macOS notarization） |
| ~~Windows OV Code Signing~~ | ~~$130-300/年~~ | **不要**（Windows非対応） |

**合計**: $99/年のみ。

### ライセンス確認

- Electron/JUCE: MIT ✅
- ~~WebAudioFont: GPL-3.0~~ → **Desktop/Pluginに音源を含めないため問題なし**
- audio.js, jrhodes3c-samples.js = **Web版専用**。Desktop/Pluginには含めない

---

## BOOTH 出品チェック

- [ ] pixivアカウント作成
- [ ] BOOTHショップ開設（サブドメイン設定）
- [ ] 日本の銀行口座登録（振込先）
- [ ] 商品ページ作成
  - [ ] macOSビルドアップ（**1ファイル1.2GB以下**、Windowsなし）
  - [ ] 価格設定（JPY）— **App price > HPS月額 > Web(無料)**
  - [ ] 商品説明文（日本語）
  - [ ] サムネイル/スクリーンショット
  - [ ] 種別「ダウンロード」
- [ ] ショップ公開
- [ ] **ライセンスキー**: BOOTH にはDRM/キー発行なし。ダウンロードのみで十分か判断

## itch.io 出品チェック

- [ ] アカウント作成
- [ ] **Tax Interview（最重要）**: W-8BEN + マイナンバー提出 → 源泉徴収0%（未提出だと**30%**課税）
- [ ] 支払い方法設定（推奨: Collected by itch.io + Payoneer）
- [ ] butler CLIインストール
- [ ] プロジェクトページ作成
  - [ ] 種別「Tool」に設定
  - [ ] macOSビルド: `butler push` with `osx` channel（Windowsなし）
  - [ ] 最低価格（USD）設定
  - [ ] PWYW有効化
  - [ ] 商品説明（英語）
  - [ ] カバー画像 + スクリーンショット
  - [ ] タグ: `music`, `music-tool`, `pad`, `music-theory`
- [ ] 別アカウントでダウンロードテスト

---

## 作業フロー

```
前提: #509 Apple Developer登録 + #682 Desktop外部検証
  ↓
1. コード署名（macOS notarization + Windows OV）
2. ライセンス整理（WebAudioFont商用ライセンス取得）
3. クリーンマシンでビルドテスト
4. マーケティング素材（スクショ5枚+説明文 JA/EN）
5. BOOTH出品（日本市場）
6. itch.io出品（海外市場）
7. 購入→DLフロー検証
```

---

## 注意事項

- BOOTHはPC software不人気カテゴリ。過度な期待は禁物
- itch.ioのTax Interviewは**初売上の前に**必ず完了
- Windows EV Code Signingは法人のみ → うりなみさんは個人事業主のためOVで
- itch.ioの「Direct to you」モードはPayPal Marketplace経由で日本から問題報告あり → 「Collected by itch.io」推奨

---

[[プロジェクト/64パッドアプリ/CLAUDE|64PE CLAUDE.md]] | [[64PE導線強化_提案]]
