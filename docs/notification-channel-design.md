# 64Pad Explorer 通知チャネル設計

## 目的

64Pad Explorer の通知面は、単なるリリースノートではない。ブログ、HPS、Pad Sensei の各プロダクトへ人を流す販売チャネルとして扱う。

Web / Standalone は同じ通知データを読み、表示面は `#update-notice` 一つだけにする。固定HTMLの告知や、形態ごとに別々の古い情報を残さない。

## 成功状態

- ブログの最新記事、HPSの最新記事、Pad Senseiの最新記事、各プロダクトの公開中アップデートが同じ通知フィードへ入る。
- Web と Standalone は、形態に合う項目だけを一つの通知面に表示する。
- 新しい記事の公開とアプリのリリースは、互いに別の作業として更新できる。記事更新のためにアプリ本体をcommit / deployしない。
- 通知は販売導線として常に辿れる。閉じる操作は当セッションだけの折りたたみにし、永続的に全通知を消さない。
- 古い固定文言、過去バージョン、存在しない製品名は表示されない。

## 現状と問題

現在の `tools/update_note_banner.py` は次の3 RSSを取得して `index.html` の文字列を直接置換している。

- 無理ない暮らし: `https://murinaikurashi.com/feed/`
- HPS: `https://note.com/urinami/rss`
- Pad Sensei: `https://urinami.substack.com/feed`

`tools/auto_update_banner.sh` はこの差分を毎時commit / pushし、アプリを再デプロイする。一方、プロダクト更新は `64-pad-explorer-update.js` という別系統である。この構造では、通知の表示面が二つになり、記事更新とアプリ公開も混ざる。

## データフロー

```text
ブログ RSS ─────────┐
HPS RSS ───────────┼─> notification-feed builder ─> 公開JSON
Pad Sensei RSS ────┤                                  ↓
プロダクト更新台帳 ─┘                    Web / Standalone の #update-notice
```

### 公開JSON

公開先はアプリ配下ではなく、Pad Sensei 共通のURLに置く。

```text
https://murinaikurashi.com/pad-sensei/notification-feed.json
```

各項目の最小形式:

```json
{
  "id": "hps-2026-07-12-example",
  "channel": "blog | hps | padsensei | product",
  "product": "64pad-explorer | pad-sensei-mk1 | ...",
  "title": "読者に見せる題名",
  "url": "https://...",
  "publishedAt": "2026-07-12T00:00:00+09:00",
  "scope": "all | web | standalone",
  "status": "active"
}
```

- フィード全体は `generatedAt`、`items`、`sources` を持つ。`sources.<channel>` は `status`（`healthy | warning | stale`）、毎回の試行時刻 `attemptedAt`、最後の成功時刻 `lastSuccessAt`、`consecutiveFailures` を持つ。画面側は、項目の公開日時と取得の健全性を区別して扱う。
- RSS項目はbuilderが取得する。
- プロダクト項目は、各リリース手順が更新する共通のプロダクト更新台帳を正とする。GumroadやアプリHTMLを正本にしない。
- `id` は不変にし、題名を直しても既読判定が壊れないようにする。

### 運用責務と鮮度保証

- 共通の `notification-feed` リポジトリ（または同等の専用管理領域）を通知データの正本にする。Web / Standalone のリポジトリは消費者であり、RSS取得・JSON生成・公開を担当しない。
- builderの定期実行、JSONの原子的な公開、取得失敗の監視と通知は、この共通管理領域の運用責務とする。個別アプリの自動commit / pushでは代替しない。
- builderは毎時実行する。全sourceの取得と検証が成功した時だけ、新しい `items` を含む正常スナップショットを原子的に公開する。
- 1系統でもRSS取得が失敗した時は、部分取得の項目を混ぜない。直前の正常スナップショットの `items` を維持しつつ、失敗channelの `attemptedAt` を今回の試行時刻に、`consecutiveFailures` を `+ 1` にする状態JSONを原子的に公開する。最初の失敗は `warning`、`consecutiveFailures >= 2` または `lastSuccessAt` から2時間超は `stale` とする。
- `warning` / `stale` のchannelの既存項目は画面に表示しない。通知面には、そのchannelが一時的に取得確認中であることだけを短く示す。失敗が `stale` に達した時点で運用者へ通知する。全sourceが成功して `healthy` に戻るまで、健全な更新として扱わない。
- プロダクト更新台帳の追加は、当該リリース手順の完了条件にする。台帳への反映が成功して公開JSONに現れた時だけ、通知導線まで含むリリース完了とする。

## 表示規約

- 表示コンテナは `#update-notice` だけ。
- 常時表示する内容は、ブログ最新1件、HPS最新1件、Pad Sensei最新1件、公開中プロダクト更新を同じ行に並べる。横幅が足りない時は横スクロールまたは「すべての更新」への導線を使い、二段目の固定バナーを作らない。
- Webは `scope: all | web`、Standaloneは `scope: all | standalone` を読む。
- プロダクト更新は、製品の購入・マニュアル・更新履歴へ直接進めるURLを持つ。
- Closeはこの起動中だけ折りたたむ。ヘッダーの通知入口で再表示できる。新しい項目の追加は自動で再表示する。
- `#sales-banner` は廃止する。販売導線は通知フィード内のプロダクト項目として表現する。

## 更新責務

| 変更 | 正本 | 通知フィードへの反映 |
|---|---|---|
| ブログ記事 | WordPress公開記事 | RSS取得で自動反映 |
| HPS記事 | note公開記事 | RSS取得で自動反映 |
| Pad Sensei記事 | Substack公開記事 | RSS取得で自動反映 |
| プロダクト更新 | プロダクト更新台帳 | リリース手順で項目追加 |

記事の公開は通知JSONだけを更新する。アプリ本体のHTML、バージョン、service worker、Desktopパッケージには触れない。

## 移行

1. 共通のプロダクト更新台帳とnotification-feed builderを作る。
2. builderが公開JSONを生成・配置できることを確認する。
3. Webの `#update-notice` を公開JSON読みに切り替える。
4. Standaloneも同じJSONを読む。現在の `64-pad-explorer-update.js` は移行期間だけ互換入力として扱う。
5. `#sales-banner` と `tools/update_note_banner.py` のHTML書換えを廃止する。
6. `tools/auto_update_banner.sh` のアプリ本体commit / pushを廃止し、通知JSONだけを更新する経路へ置き換える。
7. Web / Standalone の実画面で、ブログ・HPS・プロダクト更新が一つの通知面に入ることを確認する。

## テスト

- builder: 各RSS成功、1系統失敗時の正常JSON保持と `stale` 記録、鮮度監視通知、プロダクト更新台帳の読込、ID重複、URL不正をテストする。
- Web / Standalone: `#update-notice` が一つだけで、`#sales-banner` が存在しないことを確認する。
- 表示: 各channelの項目、scope分岐、セッション折りたたみ、新規項目での再表示、リンク先を確認する。
- リリース: プロダクト更新台帳に対象バージョンがない場合は、該当プロダクトのリリースを完了扱いにしない。

## 公開境界

この設計の実装は、通知チャネルの仕組みを作る作業であり、個別プロダクトのリリースではない。ただし公開JSONの配信変更とWeb表示変更は本番影響があるため、実装時は公開前テスト・外部監査・明示された公開判断を通す。
