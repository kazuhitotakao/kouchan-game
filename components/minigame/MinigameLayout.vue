<script setup lang="ts">
/* ============================================================
   ミニゲームのページの外枠（背景 ＋ 全体をかこむ枠 ＋ 上部ツールバー）

   ミニゲームの一覧と、それぞれのミニゲームのページで使う（中身は <slot>）

   ■ 上部ツールバー（← 戻る ／ サウンド）
     はじめの画面のツールバーと同じ置きかたで、色だけミニゲーム用の紫
     ・中身の列と同じ幅にする（画面いっぱいだと、広い画面でボタンが左右に離れすぎるため）
     ・戻る先はページごとにちがうので、押されたことを親へ知らせるだけ（back）
     ・サウンドは、親の useAudio() の値と操作を SoundControl.vue へそのまま渡す

   ■ 色の名前（--navy など）は、いちばん外の .minigame が決める（中の部品もこの色を使う）

   ■ fitScreen … 全体の枠を、画面の高さより高くしない（ページ全体はスクロールさせない）
     中身が画面に収まるときは、ふだんどおりの高さ。収まらないときだけ、画面の高さで止まる
     上のツールバーは いつも見えたまま。中身（<slot>）は残りの高さに収まるので、
     はみ出すぶんのスクロールは、ページ側が中身の中で用意する（枝の上のてんとう虫 が使う）

   ■ 一時停止（遊んでいる最中のミニゲームだけ。状態を持つのは composables/useMinigamePause.ts）
     ・canPause が true のあいだ、ツールバーのサウンドの左に「一時停止」ボタンを出す
     ・止まっているあいだは、一時停止の画面（MinigamePauseOverlay.vue）を重ね、
       全体の枠の中のCSSの動き（てんとう虫の足・こうちゃんの歩き など）も止める。枠の中は押せない（inert）

   ■ あそびかた（説明をいつも並べず、ボタンで開くミニゲームだけ）
     ・canShowHowTo が true のあいだ、ツールバーのサウンドの左に「? あそびかた」ボタンを出す（スマホ幅では「?」だけ）
     ・howToOpen のあいだは、あそびかた（MinigameHowToDialog.vue）を重ね、枠の中は押せない（inert）
       中身は、ページの <template #howto> に書く。開く・とじるは、押されたことを親へ知らせるだけ（openHowTo ／ closeHowTo）
   ============================================================ */

import { computed, nextTick, ref, watch } from 'vue';

import SoundControl from '~/components/game/SoundControl.vue';
import MinigameHowToDialog from '~/components/minigame/MinigameHowToDialog.vue';
import MinigamePauseOverlay from '~/components/minigame/MinigamePauseOverlay.vue';
import type { MinigamePauseState } from '~/composables/useMinigamePause';

const props = withDefaults(
  defineProps<{
    /* 戻るボタンの文字（広い画面）と、スマホ幅での短い文字・読み上げ用の名前 */
    backLabel: string;
    backLabelShort?: string;
    backAriaLabel: string;

    /* サウンド（親の useAudio() の値） */
    soundEnabled: boolean;
    soundVolumePercent: number;

    /* 全体の枠の大きさと置きかた
       ・menu … ミニゲームの一覧。はじめの画面のカードと同じ大きさで、上下まん中に置く
       ・game … それぞれのミニゲーム（書かなければ こちら） */
    variant?: 'menu' | 'game';

    /* 全体の枠を、画面の上下まん中に置くか（menu のときは、いつも まん中） */
    centered?: boolean;

    /* 全体の枠を、画面の高さより高くしないか（上の「■ fitScreen」を参照） */
    fitScreen?: boolean;

    /* 一時停止（上の「■ 一時停止」を参照。一時停止の無いページは書かなくてよい） */
    canPause?: boolean;
    pauseState?: MinigamePauseState;

    /* あそびかた（上の「■ あそびかた」を参照。あそびかたの無いページは書かなくてよい） */
    canShowHowTo?: boolean;
    howToOpen?: boolean;
  }>(),
  {
    backLabelShort: '← 戻る',
    variant: 'game',
    centered: false,
    fitScreen: false,
    canPause: false,
    pauseState: 'running',
    canShowHowTo: false,
    howToOpen: false,
  },
);

defineEmits<{
  back: [];
  toggleSound: [];
  volumeChange: [event: Event];
  pause: [];
  resume: [];
  quit: [];
  openHowTo: [];
  closeHowTo: [];
}>();

/* 上の行のボタン（矢印キーで移動するときの行き先として、ページ側から見えるようにしておく） */
const backButton = ref<HTMLButtonElement | null>(null);
const howToButton = ref<HTMLButtonElement | null>(null);
const soundControl = ref<InstanceType<typeof SoundControl> | null>(null);
const soundToggleButton = computed<HTMLButtonElement | null>(() => soundControl.value?.toggleButton ?? null);

defineExpose({ backButton, howToButton, soundToggleButton });

/* あそびかたを とじたら、開いたボタンへフォーカスを戻す（キーボードで続けて操作できるように） */
watch(
  () => props.howToOpen,
  async (open, wasOpen) => {
    if (!open && wasOpen) {
      await nextTick();
      howToButton.value?.focus();
    }
  },
);
</script>

<template>
  <main
    class="minigame"
    :class="[`minigame--${variant}`, { 'minigame--centered': centered || variant === 'menu', 'minigame--fit': fitScreen, 'minigame--pausable': canPause, 'minigame--paused': pauseState !== 'running' }]">
    <!-- 全体の枠（上部ツールバー ＋ 中身） -->
    <div class="mg-frame" :inert="pauseState !== 'running' || howToOpen || undefined">
      <div class="mg-toolbar">
        <!-- スマホ幅では短い文字に入れかえる（読み上げは、どちらも aria-label だけ） -->
        <button ref="backButton" type="button" class="mg-back" :aria-label="backAriaLabel" @click="$emit('back')">
          <span class="mg-back__textFull" aria-hidden="true">{{ backLabel }}</span>
          <span class="mg-back__textShort" aria-hidden="true">{{ backLabelShort }}</span>
        </button>

        <!-- あそびかた（本編の「? あそびかた」と同じ。スマホ幅では「?」だけにするので、読み上げ用の名前は aria-label に持たせる） -->
        <button v-if="canShowHowTo" ref="howToButton" type="button" class="mg-back mg-howto-button" aria-label="あそびかた" @click="$emit('openHowTo')">
          <span class="mg-howto-button__icon" aria-hidden="true">?</span>
          <span class="mg-howto-button__text" aria-hidden="true">あそびかた</span>
        </button>

        <!-- 一時停止（遊んでいる最中だけ。キーボードでは Esc でも止められる） -->
        <button v-if="canPause" type="button" class="mg-back mg-pause-button" title="一時停止（Esc）" @click="$emit('pause')">
          <span aria-hidden="true">⏸</span> 一時停止
        </button>

        <SoundControl ref="soundControl" :sound-enabled="soundEnabled" :sound-volume-percent="soundVolumePercent" @toggle="$emit('toggleSound')" @volume-change="$emit('volumeChange', $event)" />
      </div>

      <slot />
    </div>

    <!-- 一時停止の画面（枠の外に置く。枠の中の動きを止めても、こちらは止めないため） -->
    <MinigamePauseOverlay :state="pauseState" @resume="$emit('resume')" @quit="$emit('quit')" />

    <!-- あそびかた（一時停止の画面と同じく、枠の外に重ねる。中身はページの #howto） -->
    <MinigameHowToDialog v-if="howToOpen" @close="$emit('closeHowTo')">
      <slot name="howto" />
    </MinigameHowToDialog>
  </main>
</template>

<style scoped>
/* ============================================================
   ページ全体の下地（body の余白を消して、外がわを暗くする）
   本編・サウンドトラックにも同じ指定があるが、直接開いたときにも効くよう、ここにも書く
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

  /* iPhone のノッチ・ホームインジケーターをよける余白（ゲーム画面の .game と同じ考えかた。上は --safe-top → app.vue） */
  padding: var(--safe-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
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

/* 全体の枠を画面の上下まん中に置く
   safe center … 枠が画面より高いときは、上が切れないよう、ふつうに上から並べる */
.minigame--centered {
  justify-content: center;
  justify-content: safe center;
}

/* ===== 全体の枠（上部ツールバー ＋ 中身） =====
   はじめの画面のカード（base.css の .title-card）と同じ形で、色だけ紫にする
   ・幅 626px … 中身の列（620px）＋ ふち（3px × 2）
   ・左右の padding は 0 … ツールバーと中身のカードの左右のはしが、そろうように */
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

/* 画面の高さより高くしない（fitScreen）
   ・ページは画面の高さで止める
   ・枠は中身の高さのまま（背の高い画面で、下に大きな空白ができないように）。
     画面に入りきらないときだけ縮む（min-height: 0。はみ出すぶんは、中身の中でスクロールする）
   ・枠の上下の あき（margin）と、上下まん中に置くかどうか（centered）は、ふだんと同じ
   ・ツールバーは縮めない（いつも同じ大きさで、上に見えたまま） */
.minigame--fit {
  height: 100vh;
  height: 100dvh;
}

.minigame--fit .mg-frame {
  flex: 0 1 auto;
  min-height: 0;
}

.minigame--fit .mg-toolbar {
  flex: none;
}

/* メニュー（ミニゲームの一覧）の枠は、はじめの画面のカードと同じ大きさ・置きかた
   （数字は base.css の .title-screen・.title-card とそろえてある） */
.minigame--menu .mg-frame {
  width: calc(100% - 48px);
  max-width: 714px;
  min-height: 494px;
  margin: 32px auto;
  padding-top: 22px;
}

/* ===== 上部ツールバー（← 戻る ／ サウンド） =====
   はじめの画面のツールバー（.title-card__tools）と同じ置きかたで、色だけ紫
   幅は、中身の列の内がわと同じ（下のカードと左右のはしをそろえる）

   ■ 色の名前を紫に置きかえている
     サウンド（SoundControl.vue）は --navy などで色が決まるので、この中だけ紫にして、部品のCSSはさわらない */
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

/* メニューでは、はじめの画面のツールバーと同じ幅（(44px - 12px) × 2 を引いた幅） */
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

/* 一時停止ボタン（戻るボタンと同じ形。サウンドのとなり＝右へ寄せる） */
.mg-pause-button {
  gap: 4px;
  margin-left: auto;
}

/* あそびかたボタン（戻るボタンと同じ形。サウンドのとなり＝右へ寄せる）
   「?」は本編の .title-card__howtoIcon と同じく、色の丸に入れる（色はミニゲームの紫） */
.mg-howto-button {
  gap: 7px;
  margin-left: auto;
}

.mg-howto-button__icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--navy);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  letter-spacing: 0;
}

/* 止まっているあいだは、枠の中のCSSの動きも止める（ゲームの時計で動かしているものは、ゲーム側で止まる） */
.minigame--paused .mg-frame :deep(*),
.minigame--paused .mg-frame :deep(*::before),
.minigame--paused .mg-frame :deep(*::after) {
  animation-play-state: paused !important;
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

/* 「一時停止」ボタンを出しているときの、細い画面（幅 400px まで）は、音量スライダーを出さない
   ボタンが1つふえたぶん、パソコンの細い窓ではツールバーに入りきらず、右へはみ出すため（はみ出すのは幅 370px ほどから）
   ミュートボタンは出したまま（スマホ・タブレットは、もともとスライダーを出さない → SoundControl.vue） */
@media (max-width: 400px) {
  .minigame--pausable .mg-toolbar :deep(.sound-control__sliderWrap) {
    display: none;
  }
}

/* ===== スマホ幅 ===== */
@media (max-width: 700px) {
  /* 全体の枠は、左右 8px ずつあけて、画面の幅をできるだけ中身に使う */
  .mg-frame {
    width: calc(100% - 16px);
    margin: clamp(8px, 2vh, 20px) auto;
    padding-top: 16px;
    border-radius: 18px;
    box-shadow: 0 8px 0 rgb(127 92 200 / 18%);
  }

  /* メニューの枠は、はじめの画面のスマホ幅のカードと同じ */
  .minigame--menu .mg-frame {
    width: calc(100% - 24px);
    min-height: 462px;
    margin: 16px auto;
    padding-top: 20px;
  }

  /* 下の中身の列と、左右のはしをそろえる（メニューも同じ幅） */
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

  /* あそびかたは、本編のスマホ幅と同じく「?」だけにする（読み上げ用の名前は aria-label） */
  .mg-howto-button__text {
    display: none;
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
