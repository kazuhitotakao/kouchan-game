<script setup lang="ts">
/* ============================================================
   ミニゲームの「あそびかた」（画面のまん中に重ねて出す。一時停止の画面と同じ置きかた）

   ・見出し（「?」の丸 ＋ あそびかた）と「とじる」は ここで出す。説明の中身は、それぞれのミニゲームのページが <slot> で書く
   ・とじるのは「とじる」・Esc・うしろの暗いところを押したとき
   ・出し入れと、とじたあとのフォーカスは MinigameLayout.vue（全体の枠の外に置き、開いているあいだは枠の中を押せなくする）
   ============================================================ */

import { onMounted, ref } from 'vue';

const emit = defineEmits<{
  close: [];
}>();

const closeButton = ref<HTMLButtonElement | null>(null);

/* 開いたら「とじる」へフォーカスを当てる（Enter / Space / Esc ですぐ とじられる） */
onMounted(() => {
  closeButton.value?.focus();
});

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }

  // 押せるのは「とじる」だけなので、矢印キーでは何もしない（うしろのページのボタンへ移らないように）
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
  }
}
</script>

<template>
  <div class="mg-howto" @click.self="emit('close')">
    <section class="mg-howto__card" role="dialog" aria-modal="true" aria-labelledby="mg-howto-title" @keydown="handleKeydown">
      <h2 id="mg-howto-title" class="mg-howto__title">
        <span class="mg-howto__titleIcon" aria-hidden="true">?</span>
        あそびかた
      </h2>

      <div class="mg-howto__body">
        <slot />
      </div>

      <button ref="closeButton" type="button" class="mg-howto__close" @click="emit('close')">とじる</button>
    </section>
  </div>
</template>

<style scoped>
/* ===== 画面ぜんたいに重ねる、うす暗い幕（一時停止の画面と同じ） ===== */
.mg-howto {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: max(16px, var(--safe-top)) 16px max(16px, env(safe-area-inset-bottom));
  background: rgb(16 29 44 / 55%);
  animation: mg-howto-fade 0.15s ease-out;
}

/* ===== カード（ミニゲームの外枠と同じ、紫のふち）
   1画面に収める。背の低い画面で入りきらないときだけ、中身（.mg-howto__body）をスクロールする ===== */
.mg-howto__card {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 420px;
  max-height: 100%;
  padding: 20px 22px 22px;
  border: 3px solid #8f6ad4;
  border-radius: 20px;
  background: var(--paper);
  box-shadow: 0 12px 0 rgb(127 92 200 / 18%);
  color: var(--ink);
  animation: mg-howto-pop 0.2s ease-out;
}

/* 見出し（本編の あそびかた画面と同じく、「?」を丸に入れる。色はミニゲームの紫） */
.mg-howto__title {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0 0 12px;
  color: #7f5cc8;
  font-size: 24px;
  line-height: 1.4;
}

/* 半角の「?」を使う（全角の「？」は、フォントによって左へ寄って見えるため。本編の .title-card__howtoIcon と同じ） */
.mg-howto__titleIcon {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #8f6ad4;
  color: #fff;
  font-size: 17px;
  line-height: 1;
}

.mg-howto__body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* 「とじる」（一時停止の「やめる」と同じ、白いボタン） */
.mg-howto__close {
  flex: none;
  box-sizing: border-box;
  width: 100%;
  margin-top: 16px;
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

.mg-howto__close:hover {
  transform: translateY(-1px);
}

.mg-howto__close:active {
  transform: translateY(1px);
}

.mg-howto__close:focus-visible {
  outline: 3px solid #67e8f9;
  outline-offset: 2px;
}

@keyframes mg-howto-fade {
  from {
    opacity: 0;
  }
}

@keyframes mg-howto-pop {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
}

/* 背の低いスマホ（iPhone SE を Safari で開いたとき 375×548 など）でも、スクロールせずに1画面に収まるよう、
   カードの余白と、見出し・「とじる」のまわりの あきを つめる */
@media (max-width: 700px) and (max-height: 660px) {
  .mg-howto__card {
    padding: 16px 18px 18px;
  }

  .mg-howto__title {
    margin-bottom: 8px;
  }

  .mg-howto__close {
    margin-top: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mg-howto,
  .mg-howto__card {
    animation: none;
  }
}
</style>
