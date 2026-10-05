<script setup lang="ts">
/* ============================================================
   サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

   文字は出さず、アイコンとスライダーだけ（何のボタンかは aria-label と吹き出しで伝える）
   0% ＝ ミュートなので、ミュートボタンとスライダーはいつも同じ状態になる

   ・いまの状態を出して、押されたことを親へ伝えるだけ（音の処理は、ぜんぶ親）
   ・スライダーを出さないとき
     ・A画面（showVolume が false）… まだ音が鳴っていないので、動かしても手ごたえがないため
     ・スマホ・タブレット … 音量は本体のボタンで変えるため（見分けかたは utils/touchDevice.ts）
   ・variant … title（タイトル系の画面）／status（上部ステータスバー。濃い青の上なので明るい色）
     （大きさ・置き場所の指定は sound.css・sound-control.css）
   ============================================================ */

import { onMounted, ref } from 'vue';

import { isTouchOnlyDevice } from '~/utils/touchDevice';

withDefaults(
  defineProps<{
    /* いま音が出る状態か（アイコンと aria-pressed に使う） */
    soundEnabled: boolean;

    /* いまの音量（0〜100） */
    soundVolumePercent: number;

    /* どこに置くか（上の説明を参照） */
    variant?: 'title' | 'status';

    /* 音量スライダーを出すか（出さないのは、まだ音が鳴っていないA画面だけ） */
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
   （スライダーを出していないときは volumeSlider が null になり、親はミュートボタンを最後の項目として使う） */
const toggleButton = ref<HTMLButtonElement | null>(null);
const volumeSlider = ref<HTMLInputElement | null>(null);

defineExpose({ toggleButton, volumeSlider });

/* スマホ・タブレットか（サーバー側では分からないので、ブラウザで動きはじめてから見分ける） */
const isTouchOnly = ref(false);

onMounted(() => {
  isTouchOnly.value = isTouchOnlyDevice();
});

/* Tab で、ミュートボタンと音量スライダーを行き来する
   ・ミュートボタンで Tab → 音量スライダー ／ 音量スライダーで Shift + Tab → ミュートボタン
   ブラウザにまかせると、Safari（はじめの設定）では Tab がボタンやスライダーに止まらず、スライダーへ行けないため
   ※ stopPropagation … ページ側の Tab の回りこみ（いちばん後ろで Tab → いちばん前へ）が、
     動かしたあとのフォーカスを見て、もう一度動かしてしまわないように（ここで動かすのは、まとまりの中だけ） */
function handleKeydown(event: KeyboardEvent) {
  // スライダーが無い・CSS でかくしている（細い画面など）ときは、ブラウザにまかせる
  if (event.key !== 'Tab' || !volumeSlider.value || !toggleButton.value || volumeSlider.value.getClientRects().length === 0) {
    return;
  }

  const next = !event.shiftKey && event.target === toggleButton.value ? volumeSlider.value : event.shiftKey && event.target === volumeSlider.value ? toggleButton.value : null;

  if (!next) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  next.focus();
}
</script>

<template>
  <div class="sound-control" :class="{ 'sound-control--bar': variant === 'status' }" @keydown="handleKeydown">
    <button
      ref="toggleButton"
      type="button"
      class="sound-toggle"
      :class="{ 'sound-toggle--bar': variant === 'status' }"
      :aria-pressed="soundEnabled"
      :aria-label="soundEnabled ? 'サウンドをミュート' : 'サウンドをオン'"
      @click="$emit('toggle')">
      <!-- OFFのときだけ、右どなりに「×」を出す（🔊×）
           🔇 の「斜めの線」だけだと、小さいと音が出ない状態か分かりにくいため -->
      <span class="sound-toggle__icon">
        <!-- ON用とOFF用を同じマスに重ねて置く（押してもボタンの幅が変わらない） -->
        <span class="sound-toggle__state sound-toggle__state--on">🔊</span>

        <span class="sound-toggle__state sound-toggle__state--off">
          <span class="sound-toggle__speaker">🔊</span>
          <span class="sound-toggle__muteMark">×</span>
        </span>
      </span>

      <span class="sound-control__tooltip" aria-hidden="true">{{ soundEnabled ? 'サウンドをミュート' : 'サウンドをオン' }}</span>
    </button>

    <!-- 音量のスライダー（BGMも効果音も、まとめて変わる）
         吹き出しは input の中には置けないので、外側の span でかこっている
         --volume-progress は、レールの「塗ったところ」の境目の位置 -->
    <span v-if="showVolume && !isTouchOnly" class="sound-control__sliderWrap">
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

<!-- 見た目は sound-control.css だけ（game.css をまるごと読むと、使わないCSSまで二重に出力されるため）
     置き場所ごとの大きさは sound.css（game.css から読みこむ） -->
<style scoped src="~/assets/css/game/sound-control.css"></style>
