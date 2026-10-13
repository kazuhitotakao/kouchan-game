<script setup lang="ts">
/* 何もしないクリック処理
   iPhone で、すばやく2回タップしても画面が拡大しないようにするためのもの（→ 下の .app-root の説明） */
function acceptTap() {}
</script>

<template>
  <VitePwaManifest />
  <div class="app-root" @click="acceptTap">
    <!-- 時計の欄の帯（→ 下の CSS の .safe-top-band） -->
    <div class="safe-top-band" aria-hidden="true"></div>

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
   iPhone の時計の欄をよける、上の余白の高さ（--safe-top）

   ふつうは env(safe-area-inset-top)（時計の欄・ノッチの高さ。よける場所が無い画面では 0）
   画面の上の余白は、どこもこの値を使う（ゲーム画面・サウンドトラック・ミニゲーム・下の時計の欄の帯）

   ■ iPhone・iPad のホーム画面アプリ（縦向き）だけは、12px 以上とる
     iOS 26.1 から、ホーム画面アプリのページは時計の欄の下から始まり（env(safe-area-inset-top) は 0）、
     ページの上のはし 約 35pt に、OS がぼかしと暗い影をかける（https://bugs.webkit.org/show_bug.cgi?id=301994）
     iOS 27.0.1 の iPhone SE では、ゲームの上部の時計（09:00 ／ 12:00）の行がぼやけた
     ・OS は、ページの上のはしを単色の固定の箱が覆っていると、ぼかしをやめて、その色で時計の欄をぬる
       → 下の .safe-top-band を、この高さで置く（10px 以下の箱は OS が見ない、と報告されているので、それより高くする）
       （iPhone SE で、24px の帯にしたら、ぼかしと影が消えて、時計の欄が帯の色になった）
     ・12px … 10px より少し余裕をもたせた高さ（44px → 24px → 14px と、帯のぶん中身が下がりすぎないよう、つめてきた）
     ・data-ios-standalone は、nuxt.config.ts の head の script が、画面が出る前に付ける
     ・横向きでは時計の欄が出ないので、足さない
   ============================================================ */
:root {
  --safe-top: env(safe-area-inset-top);
}

@media (orientation: portrait) {
  html[data-ios-standalone] {
    --safe-top: max(env(safe-area-inset-top), 12px);
  }
}

/* ============================================================
   iPhone・iPad のホーム画面アプリでは、ページの下地を、黒っぽい色から空色にする

   ページの下地（base.css の html・body）は、パソコンでゲームの枠の外を暗くするための色（#101d2c）
   ページを行き来するフェード（下の .page-fade-〜。サウンドトラック・ミニゲーム ⇄ はじめの画面）のあいだは、
   ページの下地が見えるので、スマホでは画面ぜんたいが一瞬 暗くなってしまう
   ゲームの枠が画面の幅いっぱいになる幅（--frame の 1180px 以下）だけ（それより広いと、枠の外が見えるので、暗いままにする）
   ============================================================ */
@media (max-width: 1180px) {
  html[data-ios-standalone],
  html[data-ios-standalone] body {
    background: #d6f0fb;
  }
}

/* ============================================================
   時計の欄の帯（上の余白 --safe-top と同じ高さ）

   ・ホーム画面アプリでは、時計の欄の下まで画面が描かれることがある（viewport-fit=cover）
     ページ全体がスクロールする画面でも、中身が時計の文字と重ならないよう、position: fixed で隠す
   ・iPhone のホーム画面アプリでは、この帯がページの上のはしを覆うことで、OS のぼかしを止める（→ 上の --safe-top）
     そのため ::before ではなく、本物の要素にしている（OS は ::before を見ない、と報告されている）
   ・色は、どの画面でも空色（背景のいちばん上の色）の1色にする（ゲーム中も、上部ステータスの色にはしない）
     画面ごとに色を変えると、OS は時計の欄を 約0.1秒かけて塗りかえるので
     （WebKit の WKColorExtensionView の animationDuration
       https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/Cocoa/WKColorExtensionView.mm）、
     中断・はじめに戻る・ゲームを始めるたびに、時計の欄だけ前の色が一瞬残った
     （帯を2本にして入れかえても、ずれは消えなかった。ゲームの状態で切りかえる・帯の見た目も0.1秒かけて変える、も試したうえで、
       色を切りかえない方針にした）
   ・よける場所が無い画面では高さ 0 なので、何も出ない
   ・z-index は、ふだんの中身より手前、いやいや発生の演出などの暗い背景（1000〜）より奥
   ============================================================ */
.safe-top-band {
  position: fixed;
  z-index: 900;
  top: 0;
  right: 0;
  left: 0;
  height: var(--safe-top);
  background: #d6f0fb;
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
