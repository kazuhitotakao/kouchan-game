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

# --- プロンプト(Mac の ~/.zshrc の見た目に合わせる) ---
# 色は ANSI エスケープ。zsh の %F{...} のような「表示幅ゼロ」指定が ash には
# 無いので、色は改行より前の行だけに付け、入力行(# )は無色にしてある。
_ps_green=$(printf '\033[32m')
_ps_cyan=$(printf '\033[36m')
_ps_red=$(printf '\033[31m')
_ps_reset=$(printf '\033[0m')
_ps_userhost="$(whoami)@$(hostname)"

# Mac の %~ と同じく、ホームディレクトリ配下は ~ に省略する。
_ps_pwd() {
  home=${HOME:-/root}

  case "$PWD" in
    "$home")   printf '~' ;;
    "$home"/*) printf '~%s' "${PWD#$home}" ;;
    *)         printf '%s' "$PWD" ;;
  esac
}

# ~/.zsh/git-prompt.sh と同じ書式で (ブランチ名 記号) を組み立てる。
#   *  コミットしていない編集がある(unstaged)
#   +  git add 済みの変更がある(staged)
#   $  stash がある
#   %  未追跡ファイルがある
#   =  upstream と同じ / <  遅れている / >  進んでいる / <> 両方
git_branch() {
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

  if [ "$branch" = "" ]; then
    return
  fi

  marks=''
  git diff --quiet 2>/dev/null || marks="$marks*"
  git diff --cached --quiet 2>/dev/null || marks="$marks+"
  git rev-parse --verify --quiet refs/stash >/dev/null 2>&1 && marks="$marks\$"
  [ "$(git ls-files --others --exclude-standard 2>/dev/null)" != "" ] && marks="$marks%"

  # upstream との進み/遅れ。upstream 未設定なら何も出さない。
  counts=$(git rev-list --count --left-right @{upstream}...HEAD 2>/dev/null)
  if [ "$counts" != "" ]; then
    set -- $counts
    if [ "$1" != 0 ] && [ "$2" != 0 ]; then
      marks="$marks<>"
    elif [ "$1" != 0 ]; then
      marks="$marks<"
    elif [ "$2" != 0 ]; then
      marks="$marks>"
    else
      marks="$marks="
    fi
  fi

  if [ "$marks" = "" ]; then
    printf ' (%s)' "$branch"
  else
    printf ' (%s %s)' "$branch" "$marks"
  fi
}

# busybox ash は PS1 を表示のたびに展開するので、$(...) がその都度評価される。
PS1='${_ps_green}${_ps_userhost}${_ps_reset}: ${_ps_cyan}$(_ps_pwd)${_ps_reset}${_ps_red}$(git_branch)${_ps_reset}
# '
