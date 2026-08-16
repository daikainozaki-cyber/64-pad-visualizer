#!/usr/bin/env python3
"""pwsh ステップ内のネイティブコマンド呼び出しに $LASTEXITCODE ガードがあるか検査する.

なぜ必要か: PowerShell の $ErrorActionPreference = 'Stop' は cmdlet にしか効かない。
cmake.exe / nuget.exe / python.exe などのネイティブコマンドが非0で終了しても例外は
飛ばないので、後続のコマンドが成功するとステップ全体が success になる（偽の緑）。
GitHub Actions の pwsh は最後の $LASTEXITCODE で終了コードを決めるため、
「失敗したコマンドの後に成功するコマンドがある」形が危険。

2026-08-16 Antigravity 監査が2周にわたって1件ずつ指摘したので、機械検査に置き換える。
"""
import sys
import yaml

NATIVE = {"cmake", "ctest", "nuget", "python", "python3", "msbuild", "git", "7z", "dotnet"}


def check_run_block(run: str):
    """ガードの無いネイティブ呼び出しを (行番号, 行) で返す."""
    lines = run.splitlines()
    problems = []
    i = 0
    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()
        # コメント・空行は飛ばす
        if not stripped or stripped.startswith("#"):
            i += 1
            continue
        first = stripped.split()[0] if stripped.split() else ""
        if first in NATIVE:
            # バッククォート継続行を食う
            j = i
            while lines[j].rstrip().endswith("`") and j + 1 < len(lines):
                j += 1
            # 直後の非空・非コメント行がガードか
            k = j + 1
            while k < len(lines) and (not lines[k].strip() or lines[k].strip().startswith("#")):
                k += 1
            nxt = lines[k].strip() if k < len(lines) else ""
            if "$LASTEXITCODE" not in nxt:
                problems.append((i + 1, stripped))
            i = j + 1
            continue
        i += 1
    return problems


def main(paths):
    failed = False
    for path in paths:
        doc = yaml.safe_load(open(path))
        name = path.split("/")[-1]
        for job_name, job in (doc.get("jobs") or {}).items():
            for step in job.get("steps") or []:
                if step.get("shell") != "pwsh":
                    continue
                run = step.get("run") or ""
                for lineno, line in check_run_block(run):
                    failed = True
                    print(f"UNGUARDED  {name} :: {step.get('name')} :: line {lineno}: {line}")
    if failed:
        print("\nRESULT: FAIL - unguarded native command(s) in pwsh step(s)")
        return 1
    print("RESULT: PASS - every native command in pwsh steps is followed by a $LASTEXITCODE check")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
