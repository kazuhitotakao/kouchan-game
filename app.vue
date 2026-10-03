<script setup lang="ts">
/* 何もしないクリック処理
   iPhone で、すばやく2回タップしても画面が拡大しないようにするためのもの（→ 下の .app-root の説明） */
function acceptTap() {}
</script>

<template>
  <VitePwaManifest />
  <div class="app-root" @click="acceptTap">
    <NuxtPage />
  </div>
</template>

<!-- ここのCSSには scoped を付けない（ページ全体に効く共通のCSS）
     ページの入れかわりのクラスは Nuxt がページの外側から付けるので、ページの中に書いても効かないため -->
<style>
/* いくつもの scoped CSS から使うものは、ここ（scoped なし）から読みこむ（理由は、それぞれのファイルの先頭）
   ※ @import は、CSSの決まりで <style> のいちばん先頭に置く必要がある */
@import '~/assets/css/game/keyframes.css';

/* ナイス対応／こもれびボーナスの枠（ResultCard.vue と pages/index.vue の両方で使う） */
@import '~/assets/css/game/event-flash.css';

/* 「どうする？」のコマンド欄（CommandBox.vue と pages/index.vue の両方で使う） */
@import '~/assets/css/game/command-shared.css';

/* ============================================================
   スクロールバーの場所を、いつも空けておく

   スクロールバーが出るページと出ないページを行き来すると、
   中身の幅が変わって、画面が15pxほど左右にカクッと動いてしまうため
   （空けてあるのは場所だけで、灰色のバーがいつも見えるわけではない）
   ============================================================ */
html {
  scrollbar-gutter: stable;
}

/* ============================================================
   画面のはしで、ページ全体が「ばね」のように動かないようにする

   スマホで、スクロールしない場所をフリックしたときや、はしまでスクロールしたあとに、
   ページ全体が上下にぐにゃっと動いてしまうため（スクロールそのものは止めない）
   ※ ブラウザで開いたときは、引っぱって再読み込みする操作もできなくなる
   ============================================================ */
html,
body {
  overscroll-behavior: none;
}

/* ============================================================
   スマホでダブルタップしても、画面が拡大しないようにする

   iPhone では user-scalable=no が効かず、拡大したあと元に戻せなくなることがある
   （秘密の小道のフィールドは touch-action: none なので、2本指でも縮められない）

   touch-action: manipulation … ダブルタップの拡大だけを止める（2本指の拡大やスクロールはできる）
   ・* に付けているのは、iPhone では中でスクロールする箱のところで効き目がリセットされるため
   ・* は詳細度が 0 なので、クラスで touch-action を決めている場所は、そちらが効く
   ※ これだけでは止まらない拡大があるので、下の .app-root でも止めている
   ============================================================ */
* {
  touch-action: manipulation;
}

/* ============================================================
   すばやく2回タップしたときの拡大も止める

   iPhone は、2回目のタップが「クリックに反応しない場所」（文字・余白など）に当たると、
   touch-action とは別のしくみで拡大してしまう
   そこで、ページぜんたいを包む .app-root に何もしないクリック処理（acceptTap）を付けて、
   どこをタップしても「クリックに反応する場所」として扱われるようにしている
   ・body より内がわの箱に付けること（body や window では、iPhone はクリックできる場所とみなさない）
   ・小道のフィールドや吹き出しは pointerdown などで見ているので、クリックが届いても動きは変わらない

   -webkit-tap-highlight-color … このままでは、タップするたびに画面ぜんたいが灰色に光ってしまうので、
   .app-root だけ色なしにして、中の要素は :where()（詳細度 0）でブラウザのはじめの色へ戻す
   ============================================================ */
.app-root {
  -webkit-tap-highlight-color: transparent;
}

:where(.app-root *) {
  -webkit-tap-highlight-color: initial;
}

/* ============================================================
   ページ全体がスクロールしても、iPhone の時計の欄の下に中身がもぐらないようにする

   ホーム画面に追加したアプリでは、時計の欄の下まで画面が描かれる（viewport-fit=cover）
   ページ全体がスクロールする画面では、中身が時計の文字と重なってしまうので、
   時計の欄の高さぶんの帯を position: fixed で置いて隠す
   ・帯の色は、それぞれの画面の背景のいちばん上の色とそろえる
   ・よける場所が無い画面では高さ 0 なので、何も出ない
   ・z-index は、ふだんの中身より手前、いやいや発生の演出などの暗い背景（1000〜）より奥
   ============================================================ */
.app-root::before {
  position: fixed;
  z-index: 900;
  top: 0;
  right: 0;
  left: 0;
  height: env(safe-area-inset-top);
  background: #d6f0fb;
  content: '';
  pointer-events: none;
}

/* ============================================================
   ページの切りかえのフェード（nuxt.config.ts の pageTransition）
   （ゲーム本編の中の画面の切りかえは、pages/index.vue の screen-fade）

   mode: 'out-in' … 前のページが消えきってから、次のページを出す（2ページが同時に出ないので、ガタッと動かない）
   動き（opacity・2〜4px の上下・0.18秒）は、ゲーム本編の画面の切りかえとそろえてある
   ============================================================ */
.page-fade-enter-active,
.page-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

/* 出てくるとき：4pxだけ下から、すっと上がりながら現れる */
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

/* 消えるとき：2pxだけ上へ抜けながら消える */
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

/* 消えかけのページは、もう押せないようにする（前のページのボタンを続けて押せてしまわないように） */
.page-fade-leave-active {
  pointer-events: none;
}

/* 動きを減らす設定のときは、フェードをほとんど無くす */
@media (prefers-reduced-motion: reduce) {
  .page-fade-enter-active,
  .page-fade-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
