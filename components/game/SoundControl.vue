<script setup lang="ts">
/* ============================================================
   サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

   文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
   何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

   ・ミュートボタン … 音を出すか、出さないか
   ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
   0% ＝ ミュートなので、2つはいつも同じ状態になる
   （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る）

   ■ 音量スライダーを出さない置き場所もある（showVolume）
     A画面（起動画面）は、まだBGMが鳴っていない画面
     音量を動かしても、その場ではほとんど何も聞こえない＝手ごたえがないので、
     ここではミュートボタンだけにして、スライダーは出さない
     （「はじめる」を押す前に音を消しておける、という役目はミュートボタンが果たす）
     音が鳴っている画面（B画面・おやつ選択・あそびかた・ゲーム本編・ミニゲーム・
     サウンドトラック）では、これまでどおり2つとも出す

   ■ このコンポーネントは「いまの状態を出して、押されたことを親へ伝えるだけ」
     音を鳴らす・止める・音量を変える処理は、ぜんぶ親（pages/index.vue）にある
     BGM・効果音・localStorage も、今までどおり親のまま

   ■ 置き場所によって大きさが変わる（variant）
     title  … A画面・B画面・おやつ選択・あそびかた
               枠いっぱいには広げず、コンパクトな横ならび
     status … ゲーム本編の上部ステータスバー
               濃い青の上で見えるよう、明るい色にする（--bar）
               スマホでは、決めた長さのまま右はしに置く
     どちらも、入りきらないときだけ音量バーが縮んで場所をゆずる
     （大きさ・置き場所の指定は assets/css/game/sound.css・sound-control.css）
   ============================================================ */

import { ref } from 'vue';

withDefaults(
  defineProps<{
    /* いま音が出る状態か（アイコンと aria-pressed に使う） */
    soundEnabled: boolean;

    /* いまの音量（0〜100） */
    soundVolumePercent: number;

    /* どこに置くか（上の説明を参照） */
    variant?: 'title' | 'status';

    /* 音量スライダーを出すか（上の「showVolume」の説明を参照）
       ふだんは出す。出さないのは、まだ音が鳴っていないA画面だけ */
    showVolume?: boolean;
  }>(),
  { variant: 'title', showVolume: true },
);

defineEmits<{
  /* ミュートボタンが押された */
  toggle: [];

  /* スライダーが動かされた（中身は親の changeSoundVolume() がそのまま受け取る） */
  volumeChange: [event: Event];
}>();

/* キーボード操作のために、親から中のボタン・スライダーを見られるようにしておく

   A画面・B画面では、Tabやカーソルキーでの行き来のときに
   pages/index.vue がこの2つを直接さわる（focus を当てる・いちばん最後の項目として使う）
   上部ステータスバーのほうは使わないので、親から ref を付けていない

   ※ スライダーを出していないとき（A画面）は、volumeSlider は null のまま
     親（useKeyboardControls）は、そのときミュートボタンを
     いちばん最後の項目として使うようにしてある */
const toggleButton = ref<HTMLButtonElement | null>(null);
const volumeSlider = ref<HTMLInputElement | null>(null);

defineExpose({ toggleButton, volumeSlider });
</script>

<template>
  <div class="sound-control" :class="{ 'sound-control--bar': variant === 'status' }">
    <button
      ref="toggleButton"
      type="button"
      class="sound-toggle"
      :class="{ 'sound-toggle--bar': variant === 'status' }"
      :aria-pressed="soundEnabled"
      :aria-label="soundEnabled ? 'サウンドをミュート' : 'サウンドをオン'"
      @click="$emit('toggle')">
      <!-- スピーカーは、ONでもOFFでも同じ絵文字のまま
           OFFのときだけ、右どなりに「×」を出す（🔊×）。スピーカーには重ねない
           ミュートの絵文字 🔇 のような「斜めの線」だけの表しかたはしていない
           小さく出すと、音が出ない状態なのかどうかが、ぱっと見では分かりにくいため -->
      <span class="sound-toggle__icon">
        <!-- ON用（🔊）とOFF用（🔊×）を、同じマスに重ねて置いてある
             いま使わないほうを見えなくするだけなので、
             ボタンの幅はいつも長いほう（🔊×）のままで、押しても変わらない -->
        <span class="sound-toggle__state sound-toggle__state--on">🔊</span>

        <span class="sound-toggle__state sound-toggle__state--off">
          <span class="sound-toggle__speaker">🔊</span>
          <span class="sound-toggle__muteMark">×</span>
        </span>
      </span>

      <span class="sound-control__tooltip" aria-hidden="true">{{ soundEnabled ? 'サウンドをミュート' : 'サウンドをオン' }}</span>
    </button>

    <!-- 音量のスライダー（BGMも効果音も、まとめて変わる）

         showVolume が false のとき（A画面）は、まるごと出さない
         まだ音が鳴っていない画面では、動かしても何も聞こえないため
         （→ このファイルの先頭の「showVolume」の説明）

         吹き出しは input の中には置けないので、外側の span でかこって、そこに出している
         :style で渡している --volume-progress は、レールの「塗ったところ」の境目の位置
         （サウンドトラックページの音量スライダーと同じ作りかた）

         0%まで下げるとミュート、そこから上げるとミュート解除になる
         （スピーカーのアイコンも、いっしょに切りかわる） -->
    <span v-if="showVolume" class="sound-control__sliderWrap">
      <input
        ref="volumeSlider"
        type="range"
        class="sound-control__slider"
        min="0"
        max="100"
        step="1"
        :value="soundVolumePercent"
        :style="{ '--volume-progress': soundVolumePercent + '%' }"
        aria-label="音量"
        :aria-valuetext="soundVolumePercent + 'パーセント'"
        @input="$emit('volumeChange', $event)" />

      <span class="sound-control__tooltip" aria-hidden="true">音量 {{ soundVolumePercent }}%</span>
    </span>
  </div>
</template>

<!-- 見た目は、このコンポーネント専用の assets/css/game/sound-control.css だけを読みこむ
     （理由は components/game/StatusBar.vue の <style> の説明と同じ。
       index.vue の scoped CSS は、このコンポーネントの中の要素には届かないため）

     ■ game.css まるごとではなく sound-control.css だけにした理由
       game.css を読むと、結果カードやコマンド欄など、ここでは使わないCSSまで
       このコンポーネントぶんとして、もう一度ビルド結果に出てしまう

     ※ 「どこに・どの大きさで置くか」（.title-card__tools／.status-area の中）は
       sound.css にあり、これまでどおり game.css から読みこまれる
     ※ sound-control.css は game.css からは読みこまない（二重出力になるため） -->
<style scoped src="~/assets/css/game/sound-control.css"></style>
