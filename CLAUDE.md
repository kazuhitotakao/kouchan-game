# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業するときのルールをまとめたものです。

## Git運用ルール

### コミットメッセージ

- **日本語で書く**
- **1行目は、PRタイトルとしてそのまま使える簡潔な内容にする**
  - `.github/workflows/auto-merge.yml` が、コミットメッセージの1行目をPRタイトル、2行目以降をPR本文として使うため
- **Conventional Commits形式**（`feat` / `fix` / `refactor` / `chore` など）を使う
- 必要に応じて、2行目以降に変更内容を箇条書きで書く

例：

```
feat: ころんだ時に転倒効果音「ヒュッ、ポテッ」を追加

- playFallDownSound() を追加（音声ファイルは増やさず、既存の playTone() を使う）
- 決定音と重ならないよう、0.45秒の間を空けてから鳴らしはじめる
```

### push

- **コミットしたら、現在のブランチを `origin` に push する**
- **`develop` と `main` には直接 push しない**
  - 作業は必ずブランチを切って行い、`develop` への反映はPR経由にする

### ブランチ名

- コミットメッセージの接頭辞に合わせて、`feat/` `feature/` `fix/` `refactor/` `chore/` のいずれかで始める
  - 例：`feat/falldown-sound`、`fix/layout`
- これらのブランチに push すると、`.github/workflows/auto-merge.yml` が
  ビルド確認 → PR自動作成 → `develop` へ squash マージ（ブランチ削除）まで自動で行う
- ほかの名前のブランチは自動PRの対象外なので、PRは手動で作る
