# DOJO Windows CI — 経路の実態メモ

このリポジトリは DOJO の Windows ビルドを回す場所です。AI / 人が同じ壁を叩き直さないための事実メモ。
**最終確認: 2026-09-17**

## 1. セルフホストランナーは存在しない

Runners 画面での実測:

| repo | Self-hosted ランナー |
|---|---|
| `pad-sensei/dojo` | **0 available runners** |
| `daikainozaki-cyber/64-pad-visualizer`（このrepo） | **There are no runners configured** |

`pad-sensei/dojo` の `windows-alpha-build.yml` と `windows-v035-release-build.yml` は
`runs-on: [self-hosted, Windows, X64, dojo-windows]` を指定しているが、**そのランナーは居ない**。
dispatch しても落ちずに **永久に queue に残る**ので気づきにくい。

「セルフホストで回している」は **Mac の話**（`dojo-mac-local` / macOS ARM64 / label `dojo-audio`）。
Mac のビルド・署名・公証はそこで動く。Windows と混同しないこと。

## 2. 実績のある経路

**このリポジトリ（public）の GitHub-hosted `windows-2022`。**
public なので Windows の無料枠が無制限。`pad-sensei/dojo`（private org repo）で
GitHub-hosted Windows を使うと課金されるため使わない。

成功例:

- `dojo-v0357-windows-repair-full.yml` → run 34847010379（success、約55分）
- `dojo-v0357-windows-installer-from-green.yml` → run 34936597948（success）

## 3. ソースの受け渡し

Windows runner は `pad-sensei/dojo` を直接 checkout **しない**。
private ミラー `daikainozaki-cyber/dojo-ci` から deploy key（secret `DOJO_SOURCE_DEPLOY_KEY`）で取る。

既存の Windows workflow 4本は、ビルド対象の SHA / tree を `env:` に**ハードコード**していて
**workflow_dispatch の入力を持たない**。したがって新しい head を回す手順は必ず2段になる。

1. `daikainozaki-cyber/dojo-ci` に対象 commit を ref として push する
2. その SHA / tree に固定した workflow をこのリポジトリに用意して dispatch する

ミラー push は commit object をそのまま送ること。cherry-pick / squash / commit 再作成をすると
SHA が変わり、workflow 側の provenance 検査（expected SHA / tree の一致）で落ちる。

```bash
git push <dojo-ci remote> <commit>:refs/heads/<ref名>
```

## 4. 現在あるミラー ref

| ref | commit | tree | 用途 |
|---|---|---|---|
| `verify/pr517-exact-217e41f6-20260917` | `217e41f66f3c73cf0e665f1ba313d223955dde08` | `a3ccd24c07302bbcdca6ac23004758729339d973` | PR #517（Sandbox editor DSP gate）の Windows machine gate 用。version 0.35.7 |

PR #517 は Mac 実機 Human Gate PASS 済み（2026-09-17）。Windows 側は未実施。

## 5. トークンについて

fine-grained PAT は **Resource owner を1つしか持てない**。
`daikainozaki-cyber` 所有のトークンでは `pad-sensei/*` を読み書きできない（404）。
逆に org 側を読めるトークンでは個人 repo へ書けない。**同時には成立しない。**

`gh api repos/<owner>/<repo> --jq .permissions` の `push` / `admin` は
**リポジトリ上の役割であってトークンの実権限ではない**。書き込み可否は実際の書き込みで測ること。

```bash
git push --dry-run <remote> <sha>:refs/heads/tmp-probe
```
