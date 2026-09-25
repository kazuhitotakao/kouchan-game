<script setup lang="ts">
/* ============================================================
   ミニゲームのページの外枠（背景 ＋ 全体をかこむ枠 ＋ 上部ツールバー）

   ミニゲームの一覧（pages/minigame/index.vue）と、
   それぞれのミニゲームのページ（pages/minigame/<id>.vue）で使う
   中身は <slot> に入れてもらう

   ■ 上部ツールバー（← 戻る ／ 🔊 ミュートボタン ＋ 音量バー）
     はじめの画面（A画面・B画面）の上のツールバーと同じ置きかた（まわりに枠をつけず、全体の枠の中に直接ならべる）。色だけミニゲーム用の紫
     ・下の中身の列と同じ幅で、全体をかこむ枠（.mg-frame）の いちばん上に置く
       （画面いっぱいに広げると、広い画面では戻るボタンと音量バーが左右のはしまで離れてしまうため）
     ・戻る先はページごとにちがうので、押されたことを親へ知らせる（back）
       決定音を鳴らす・曲を止める・ページを移る、は親がする
     ・サウンドは、親の useAudio() の値と操作を受け取って、SoundControl.vue へそのまま渡す

   ■ 色の名前（--navy など）は、いちばん外の .minigame が決める（上部ツールバーの中だけは、紫に置きかえている）
     中の SecretPathField.vue（secret-path-field.css）なども、この色を使う（CSS の変数は子へ受けつがれる）
   ============================================================ */

import { computed, ref } from 'vue';

import SoundControl from '~/components/game/SoundControl.vue';

withDefaults(
  defineProps<{
    /* 戻るボタンの文字（広い画面）と、スマホ幅での短い文字・読み上げ用の名前 */
    backLabel: string;
    backLabelShort?: string;
    backAriaLabel: string;

    /* サウンド（親の useAudio() の値） */
    soundEnabled: boolean;
    soundVolumePercent: number;

    /* 全体の枠の大きさと置きかた
       ・menu … ミニゲームの一覧。はじめの画面（A画面・B画面）のカードと同じ大きさにして、画面の上下まん中に置く
                 （横幅は最大 714px、高さは 494px 以上。スマホ幅では 462px 以上）
                 ミニゲームが増えてカードが入りきらなくなったら、そのときに大きさを考えなおす
       ・game … それぞれのミニゲーム（書かなければ こちら） */
    variant?: 'menu' | 'game';

    /* 全体の枠を、画面の上下まん中に置くか（variant が menu のときは、いつも まん中）
       「どこまで行ける？」は、はじまる前・遊んでいる最中・結果の画面のどれも まん中に置く
       （遊んでいる最中のフィールドの高さは、そのページが画面の高さから決めている → pages/minigame/secret-path.vue） */
    centered?: boolean;
  }>(),
  { backLabelShort: '← 戻る', variant: 'game', centered: false },
);

defineEmits<{
  back: [];
  toggleSound: [];
  volumeChange: [event: Event];
}>();

/* 上の行のボタン（← 戻る ／ サウンドのミュートボタン）

   矢印キーでボタンを移動するときの行き先として、ページ側から見えるようにしておく
   （→ composables/useMinigameKeyboardNav.ts。使いかたは はじめの画面と同じ）
   サウンドのボタンは SoundControl.vue の中にあるので、その部品が見せている toggleButton を借りる */
const backButton = ref<HTMLButtonElement | null>(null);
const soundControl = ref<InstanceType<typeof SoundControl> | null>(null);
const soundToggleButton = computed<HTMLButtonElement | null>(() => soundControl.value?.toggleButton ?? null);

defineExpose({ backButton, soundToggleButton });
</script>

<template>
  <main class="minigame" :class="[`minigame--${variant}`, { 'minigame--centered': centered || variant === 'menu' }]">
    <!-- 全体の枠（上部ツールバー ＋ 中身をまとめてかこむ。はじめの画面のカードと同じ形で、色はミニゲーム用の紫） -->
    <div class="mg-frame">
      <div class="mg-toolbar">
        <!-- スマホ幅では、短い文字（「← 戻る」）に入れかえる（→ style の @media (max-width: 700px)）
             読み上げは、どちらの幅でも aria-label だけにする -->
        <button ref="backButton" type="button" class="mg-back" :aria-label="backAriaLabel" @click="$emit('back')">
          <span class="mg-back__textFull" aria-hidden="true">{{ backLabel }}</span>
          <span class="mg-back__textShort" aria-hidden="true">{{ backLabelShort }}</span>
        </button>

        <SoundControl ref="soundControl" :sound-enabled="soundEnabled" :sound-volume-percent="soundVolumePercent" @toggle="$emit('toggleSound')" @volume-change="$emit('volumeChange', $event)" />
      </div>

      <slot />
    </div>
  </main>
</template>

<style scoped>
/* ============================================================
   ページ全体の下地（ゲーム本編・サウンドトラックと同じ）

   ブラウザがはじめから付けている body のまわりの余白（8px）を消して、外がわを暗くする
   本編（assets/css/game/base.css）・サウンドトラック（pages/soundtrack.vue）にも同じ指定がある
   それぞれのページのCSSは、そのページを開いたときにしか読みこまれないので、
   ミニゲームのページをアドレスから直接開いたときにも効くよう、ここにも書いておく
   （書かないと、はじめの画面と外枠の位置が 8px ずれる）
   ============================================================ */
:global(html),
:global(body) {
  margin: 0;
  padding: 0;
  background: #101d2c;
}

/* ============================================================
   ページ全体（ゲーム本編・サウンドトラックと同じ色と背景）
   ============================================================ */
.minigame {
  --navy: #2a768f;
  --navy-deep: #226981;
  --navy-line: #86c6dd;
  --paper: #fffdf9;
  --ink: #4e5860;
  --gold: #ffd166;
  --parent-calm: #ffa3a3;

  /* 「いま選ばれているボタン」の水色（本編の .game と同じ。@keyframes command-selected-glow が使う） */
  --command-selected: 103 232 249;

  display: flex;
  flex-direction: column;
  box-sizing: border-box;

  /* iPhone のノッチ・ホームインジケーターをよける余白（ゲーム画面の .game と同じ考えかた） */
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  width: 100%;
  max-width: 1180px;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  background: linear-gradient(180deg, #d6f0fb 0%, #e8f6ee 45%, #fffdf2 100%);
  color: var(--ink);
  font-family:
    system-ui,
    -apple-system,
    'Hiragino Kaku Gothic ProN',
    'Yu Gothic',
    Meiryo,
    sans-serif;
  font-size: 16px;
  line-height: 1.7;
  box-shadow: 0 0 60px rgb(42 118 143 / 35%);
}

/* 全体の枠を画面の上下まん中に置く（ミニゲームの一覧／それぞれのミニゲーム）

   .minigame は たてに積む flex で、高さは画面いっぱい（min-height: 100dvh）なので、
   justify-content: center で、中の枠が上下のまん中に来る
   safe center … 枠が画面より高いときは、上が切れないよう、ふつうに上から並べる（はじめの画面と同じ）
   枠の上下の margin（.mg-frame）は同じ値なので、まん中の位置はずれない */
.minigame--centered {
  justify-content: center;
  justify-content: safe center;
}

/* ===== 全体の枠（上部ツールバー ＋ 中身） =====

   はじめの画面（A画面・B画面）のカード（base.css の .title-card）と同じ形にして、色だけミニゲーム用の紫にする
   ・ふち 3px・角丸 20px・下に色つきの影（ぺたっと下へずらした影で、カードが少し浮いて見える）
   ・上下の margin … 画面のいちばん上・下に貼りつかないよう、少しあける
     画面の高さの 5%（800px の画面なら 40px）。16px より小さく・48px より大きくはしない
   ・幅 … 中身の列（それぞれのページの .mg-stage。max-width 620px）＋ ふち（3px × 2）が入る 626px
     せまい画面では、左右に 16px ずつあける（スマホ幅の値は、下の @media (max-width: 700px)）
   ・左右の padding は 0 … 中の左右のすき間は、ツールバーの幅と、中身の列の padding がつくる
     （ツールバーと中身のカードの左右のはしが、そろうように） */
.mg-frame {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: calc(100% - 32px);
  max-width: 626px;
  margin: clamp(16px, 5vh, 48px) auto;
  padding: 20px 0 4px;
  border: 3px solid #8f6ad4;
  border-radius: 20px;
  background: var(--paper);
  box-shadow: 0 12px 0 rgb(127 92 200 / 18%);
}

/* メニュー（ミニゲームの一覧）の枠は、はじめの画面のカード（base.css の .title-card）と同じ大きさ・置きかたにする
   ・横幅 … 最大 714px。せまい画面では、左右に 24px ずつあける（はじめの画面の .title-screen の padding と同じ）
   ・高さ … 494px 以上（中身が少なくても、はじめの画面のカードと同じ高さになる）
   ・上下の margin … 32px（はじめの画面の .title-screen の padding と同じ）
   ・上の padding … 22px（はじめの画面のツールバーが、カードの上のふちから 22px の所にあるのと同じ）
   スマホ幅の値は、下の @media (max-width: 700px) */
.minigame--menu .mg-frame {
  width: calc(100% - 48px);
  max-width: 714px;
  min-height: 494px;
  margin: 32px auto;
  padding-top: 22px;
}

/* ===== 上部ツールバー（← 戻る ／ サウンド） =====

   はじめの画面（A画面・B画面）の上のツールバー（base.css の .title-card__tools）と同じ置きかた
   ・まわりに枠はつけず、全体の枠（.mg-frame）の中の いちばん上に、左の戻るボタンと右のサウンドを直接ならべる
   ・ボタンの大きさ・形も、はじめの画面の「← はじめの画面へ戻る」（.title-card__back）と同じ
   ・色だけミニゲーム用の紫にする（一覧のカードや秘密の小道と同じ、こもれびの広場のカード .place-card--secret の色）

   ・幅は、中身の列（それぞれのページの .mg-stage。max-width 620px・左右の padding 20px）の中身と同じ 580px
   ・width: calc(100% - 40px) … せまい画面でも、下のカードと左右のはしをそろえる
   ・画面の上からの位置は、外の枠（.mg-frame）の margin と padding で決まる

   ■ 中の色の名前を、紫に置きかえている
     右のサウンド（SoundControl.vue）は --navy・--navy-deep・--navy-line で色が決まる作りなので、
     このツールバーの中だけ、その3つを紫にして、ミュートボタンと音量バーも紫にそろえる
     （部品のCSSは さわらない。ほかの画面のサウンドは、今までどおり紺色のまま） */
.mg-toolbar {
  --navy: #8f6ad4;
  --navy-deep: #6b4fb0;
  --navy-line: #cbb5f0;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-sizing: border-box;
  width: calc(100% - 40px);
  max-width: 580px;
  margin: 0 auto;
}

/* メニュー（ミニゲームの一覧）では、はじめの画面のツールバーと同じ幅にする
   はじめの画面では、カードの中身の幅（左右の padding 44px の内がわ）より、左右に 12px ずつはみ出している
   → 枠の内がわの幅から 64px（(44 - 12) × 2）を引いた幅 */
.minigame--menu .mg-toolbar {
  width: calc(100% - 64px);
  max-width: none;
}

/* 戻るボタン（はじめの画面の .title-card__back と同じ、うすいふちの白っぽい丸。色だけ紫） */
.mg-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 8px 14px;
  border: 1px solid var(--navy-line);
  border-radius: 999px;
  background: rgb(255 255 255 / 55%);
  color: var(--navy-deep);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.02em;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
}

/* PCでカーソルを当てたときだけ、うすい紫になって少し上へ動く（はじめの画面と同じ動き） */
.mg-back:hover {
  border-color: var(--navy);
  background: #f3ecff;
  transform: translateY(-1px);
}

.mg-back:active {
  transform: translateY(1px);
}

.mg-back:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 2px;
}

/* 戻るボタンの短い表示（「← 戻る」）。スマホ幅のときだけ入れかえる */
.mg-back__textShort {
  display: none;
}

/* サウンドのコントロールの大きさ（タイトル画面と同じくらい） */
.mg-toolbar :deep(.sound-control) {
  --sound-button-size: 38px;
  --sound-icon-size: 20px;
  --sound-slider-width: 110px;
}

/* ===== スマホ幅 ===== */
@media (max-width: 700px) {
  /* 全体の枠は、左右 8px ずつあけて、画面の幅をできるだけ中身に使う
     上下の margin … 844px の画面なら約17px（8〜20px のあいだ） */
  .mg-frame {
    width: calc(100% - 16px);
    margin: clamp(8px, 2vh, 20px) auto;
    padding-top: 16px;
    border-radius: 18px;
    box-shadow: 0 8px 0 rgb(127 92 200 / 18%);
  }

  /* メニューの枠は、はじめの画面のスマホ幅のカードと同じ（左右 12px あけて、高さは 462px 以上）
     上下の margin 16px・上の padding 20px も、はじめの画面のスマホ幅と同じ */
  .minigame--menu .mg-frame {
    width: calc(100% - 24px);
    min-height: 462px;
    margin: 16px auto;
    padding-top: 20px;
  }

  /* 下の中身の列（それぞれのページの .mg-stage の左右の padding 12px）と、左右のはしをそろえる
     メニューも同じ幅（はじめの画面のスマホ幅のツールバーも、カードの内がわから 24px 引いた幅） */
  .mg-toolbar,
  .minigame--menu .mg-toolbar {
    gap: 8px;
    width: calc(100% - 24px);
  }

  /* はじめの画面のスマホ幅と同じ大きさ */
  .mg-back {
    min-height: 36px;
    padding: 7px 11px;
    font-size: 13.5px;
  }

  .mg-back__textFull {
    display: none;
  }

  .mg-back__textShort {
    display: inline;
  }

  .mg-toolbar :deep(.sound-control) {
    --sound-button-size: 36px;
    --sound-icon-size: 19px;
    --sound-slider-width: 84px;
  }
}

/* 動きを減らす設定のときは、ボタンの動きも止める */
@media (prefers-reduced-motion: reduce) {
  .mg-back {
    transition-duration: 0.01ms;
  }
}
</style>
