# ~/.zshrc で使っていた alias をここに移植する。
# alias 構文は zsh / bash / Alpine の sh(busybox ash)で共通なので、
# 基本はそのままコピペで動く。
#
# ※ zsh 固有のもの(alias -g / alias -s、関数、setopt など)は sh では動かないので注意。
# ※ alias を消す/リネームしたときは、既存ターミナルには残り続けるので
#    ターミナルを開き直すか unalias する。

# --- ファイル操作 ---
alias ll='ls -la'
alias la='ls -A'

# --- npm ---
alias dev='npm run dev'

# --- git ---
alias gb='git branch'
alias gbd='git branch -d'
alias gs='git switch'
alias gsc='git switch -c'
alias gd='git diff'
alias fet='git fetch'
alias pull='git pull'
alias push='git push origin HEAD'
alias log='git log --pretty=fuller -3'
alias reset='git reset --soft HEAD~1'
alias rebase='git rebase develop'

# --- Git ブランチをプロンプトに表示 ---
# busybox ash は PS1 を表示のたびに展開するので、$(...) がその都度評価される。
# git-prompt.sh は bash/zsh 向けなので使わず、ash で動く小さい関数で代替する。
git_branch() {
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

  if [ "$branch" != "" ]; then
    # 未コミットの変更や未追跡ファイルがあれば * を付ける(Mac 側の表示に合わせる)。
    dirty=''
    if [ "$(git status --porcelain 2>/dev/null)" != "" ]; then
      dirty=' *'
    fi

    printf ' (%s%s)' "$branch" "$dirty"
  fi
}

PS1='$(pwd)$(git_branch)
# '
