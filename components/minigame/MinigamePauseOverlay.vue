<script setup lang="ts">
/* ============================================================
   ミニゲームの一時停止の画面（画面のまん中に重ねて出す。どこまで行ける？・枝の上のてんとう虫 で共通）

   ・paused   … 「一時停止」と「つづける」「やめる」
   ・resuming … 「よーい！」だけ（うしろのフィールドが見えるよう、暗くするのは ひかえめに）

   状態を持つのは composables/useMinigamePause.ts。ここは出して、押されたことを親へ知らせるだけ
   置き場所は MinigameLayout.vue（全体の枠の外に置くので、枠の中を止めても、ここの動きは止まらない）
   ============================================================ */

import { nextTick, ref, watch } from 'vue';

import type { MinigamePauseState } from '~/composables/useMinigamePause';

const props = defineProps<{
  state: MinigamePauseState;
}>();

defineEmits<{
  resume: [];
  quit: [];
}>();

const resumeButton = ref<HTMLButtonElement | null>(null);
const quitButton = ref<HTMLButtonElement | null>(null);

/* 一時停止の画面が出たら、「つづける」へフォーカスを当てる（Enter / Space ですぐ つづけられる） */
watch(
  () => props.state,
  async (state) => {
    if (state === 'paused') {
      await nextTick();
      resumeButton.value?.focus();
    }
  },
  { immediate: true },
);

/* 矢印キーで「つづける」と「やめる」を行き来する（ほかのミニゲームの画面のボタンと同じ操作） */
function handleKeydown(event: KeyboardEvent) {
  if (!event.key.startsWith('Arrow')) {
    return;
  }

  event.preventDefault();

  const next = document.activeElement === resumeButton.value ? quitButton.value : resumeButton.value;

  next?.focus();
}
</script>

<template>
  <div v-if="state !== 'running'" class="mg-pause" :class="`mg-pause--${state}`">
    <section v-if="state === 'paused'" class="mg-pause__card" role="dialog" aria-modal="true" aria-labelledby="mg-pause-title" @keydown="handleKeydown">
      <h2 id="mg-pause-title" class="mg-pause__title">一時停止</h2>

      <div class="mg-pause__actions">
        <button ref="resumeButton" type="button" class="mg-pause__resume" @click="$emit('resume')">つづける</button>
        <button ref="quitButton" type="button" class="mg-pause__quit" @click="$emit('quit')">やめる</button>
      </div>
    </section>

    <p v-else class="mg-pause__ready" aria-live="assertive">よーい！</p>
  </div>
</template>

<style scoped>
/* ===== 画面ぜんたいに重ねる、うす暗い幕（うしろは押せない） ===== */
.mg-pause {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: var(--safe-top) 16px env(safe-area-inset-bottom);
  background: rgb(16 29 44 / 55%);
  animation: mg-pause-fade 0.15s ease-out;
}

/* 「よーい！」のあいだは、うしろのフィールドが見えるように、ほとんど暗くしない */
.mg-pause--resuming {
  background: rgb(16 29 44 / 12%);
}

/* ===== 一時停止のカード（ミニゲームの外枠と同じ、紫のふち） ===== */
.mg-pause__card {
  box-sizing: border-box;
  width: 100%;
  max-width: 340px;
  padding: 22px 24px 24px;
  border: 3px solid #8f6ad4;
  border-radius: 20px;
  background: var(--paper);
  box-shadow: 0 12px 0 rgb(127 92 200 / 18%);
  text-align: center;
  animation: mg-pause-pop 0.2s ease-out;
}

.mg-pause__title {
  margin: 0 0 16px;
  color: #7f5cc8;
  font-size: 26px;
  line-height: 1.4;
}

.mg-pause__actions {
  display: grid;
  gap: 10px;
}

/* 「つづける」（ミニゲームの「はじめる」と同じ、金色のボタン） */
.mg-pause__resume {
  box-sizing: border-box;
  width: 100%;
  padding: 14px 24px;
  border: 2px solid #e8b23c;
  border-bottom-width: 4px;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
  box-shadow: 0 4px 12px rgb(0 0 0 / 22%);
  color: #4a3208;
  font-family: inherit;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.5;
  cursor: pointer;
  transition: transform 0.12s ease;
}

/* 「やめる」（枝の上のてんとう虫 の「ステージを選ぶ」と同じ、白いボタン） */
.mg-pause__quit {
  box-sizing: border-box;
  width: 100%;
  padding: 11px 20px;
  border: 2px solid #cbb5f0;
  border-radius: 10px;
  background: #fff;
  color: #6b4fb0;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.12s ease;
}

.mg-pause__resume:hover,
.mg-pause__quit:hover {
  transform: translateY(-1px);
}

.mg-pause__resume:active,
.mg-pause__quit:active {
  transform: translateY(1px);
}

.mg-pause__resume:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 3px;
}

.mg-pause__quit:focus-visible {
  outline: 3px solid #67e8f9;
  outline-offset: 2px;
}

/* ===== 「よーい！」（フィールドの「スタート！」と同じ色・ふち） ===== */
.mg-pause__ready {
  margin: 0;
  color: #6b4fb0;
  font-size: 52px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  text-shadow:
    0 0 12px #fff,
    0 0 6px #fff,
    0 0 2px #fff;
  animation: mg-pause-ready 0.3s ease-out;
}

@keyframes mg-pause-fade {
  from {
    opacity: 0;
  }
}

@keyframes mg-pause-pop {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
}

@keyframes mg-pause-ready {
  from {
    opacity: 0;
    transform: scale(1.6);
  }
}

/* 動きを減らす設定のときは、出てくるときの動きを止める */
@media (prefers-reduced-motion: reduce) {
  .mg-pause,
  .mg-pause__card,
  .mg-pause__ready {
    animation: none;
  }

  .mg-pause__resume,
  .mg-pause__quit {
    transition-duration: 0.01ms;
  }
}
</style>
