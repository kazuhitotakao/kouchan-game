# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業するときのルールをまとめたものです。

## Git運用ルール

### 基本方針

- `develop` と `main` には直接 push しない
- 作業するときは必ず作業ブランチを作る
- 作業ブランチから `develop` へ Pull Request を作成する
- `develop` へのマージは GitHub Actions に任せる

### ブランチ名

作業ブランチは、変更内容に応じて以下のいずれかで始める。

- `feat/`
- `feature/`
- `fix/`
- `refactor/`
- `chore/`

例：

```text
feat/sound-effect
fix/layout
refactor/audio
chore/update-deps
```

### コミット

- コミットメッセージは日本語で作成する
- **Conventional Commits形式**を使う

例：

```text
feat: 新しい効果音を追加
fix: スマホ表示の崩れを修正
refactor: 効果音処理を整理
chore: 開発環境の設定を更新
```

1つの作業ブランチで複数回コミットしてよい。

例：

- `feat: 効果音を追加`
- `fix: 効果音の音量を調整`
- `refactor: 効果音処理を整理`

### push・Pull Request

- コミットしただけでは自動で push しない
- 作業中は必要に応じて複数回コミットしてよい

ユーザーから

- 「pushして」
- 「コミットしてpushして」
- 「PR作って」
- 「pushしてPR作って」
- 「コミットしてpushしてPR作って」

など、push またはPR作成の指示があった場合は、作業完了の指示として扱う。

その場合、以下を一連の処理として行う。

1. `develop` の最新状態を取得する
2. `develop` と現在のブランチとの差分を確認する
3. 現在のブランチに含まれるすべてのコミットを確認する
4. ブランチ全体の変更内容を要約してPRタイトルを作成する
5. ブランチ全体の変更内容からPR本文を作成する
6. 現在の作業ブランチを `origin` に push する
7. `develop` 向けのPull Requestを作成する

- `develop` と `main` には直接 push しない
- PR作成後、自分でmergeしない
- build確認と `develop` へのマージは GitHub Actions に任せる

#### 1〜3. 差分・コミットの確認

PRタイトルを作る前に、**必ずブランチ全体の変更内容を確認する。**

以下のような情報を確認する。

```bash
git fetch origin develop
git log origin/develop..HEAD
git diff origin/develop...HEAD
```

**最後のコミットだけを見てPRタイトルを決めない。**

その作業ブランチに含まれる

- すべてのコミット
- `develop` との差分
- 実際に変更されたファイル

を確認し、ブランチ全体の目的を要約する。

#### 4. PRタイトル

PRタイトルは、ブランチ全体の変更内容を表す簡潔な日本語にする。

Conventional Commits形式を使う。

例：

複数コミットが、

```text
feat: 転倒効果音を追加
fix: 転倒音の音量を調整
refactor: 効果音処理を整理
```

だった場合でも、最後のコミットをそのままタイトルにするのではなく、
ブランチ全体を要約して、

```text
feat: 転倒イベントの効果音を追加・調整
```

のようなPRタイトルを作る。

#### 5. PR本文

PR本文もブランチ全体の変更内容から作成する。

基本的に以下の形式にする。

```markdown
## 概要

今回の変更内容を簡潔に説明する。

## 変更内容

- 変更点1
- 変更点2
- 変更点3

## 動作確認

- 実際に行った確認内容
```

**実際に確認していない内容を「確認済み」と書かない。**

必要に応じて、関連する補足事項も記載する。

#### 6〜7. push・PR作成

現在の作業ブランチがまだpushされていない場合は、先にpushする。

```bash
git push -u origin HEAD
```

その後、`develop` をbaseにPull Requestを作成する。

```bash
gh pr create \
  --base develop \
  --head 現在のブランチ \
  --title "作成したPRタイトル" \
  --body "作成したPR本文"
```

**PR作成後、自分でmergeしない。**

build確認と `develop` へのmergeは、
`.github/workflows/auto-merge.yml` の GitHub Actions に任せる。

### 普段の使い方

作業途中では、

> ここまでコミットして

と指示すれば、コミットだけ行う。

さらに作業したあと、

> ここもコミットして

と指示して、同じブランチに複数コミットしてよい。

作業が完了したら、

> pushしてPR作って

と指示する。

そのときClaude Codeは、

1. `develop` との差分を確認
2. ブランチ内のすべてのコミットを確認
3. PRタイトルを作成
4. PR本文を作成
5. 現在のブランチをpush
6. `develop` 向けPRを作成

まで行う。

その後の

```text
build確認
↓
squash merge
↓
リモート作業ブランチ削除
```

は GitHub Actions が行う。
