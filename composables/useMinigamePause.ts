/* ============================================================
   ミニゲームの「一時停止」（どこまで行ける？・とばないで！ で共通）

   ■ 3つの状態（pauseState）
     running  … 動いている（ふだん）
     paused   … 一時停止の画面を出している（「つづける」「やめる」）
     resuming … 「つづける」のあと、「よーい！」を出している（まだ止めたまま）
                minigameResumeCueDuration たったら、ゲームの動きと時計を同時に動かす
                ※ カウントダウン中に止めたときは「よーい！」を出さず、すぐカウントダウンの続きから動かす

   ■ 自動で一時停止するとき
     ・ページが見えなくなった（バックグラウンド・画面ロック・別のタブ … visibilitychange / pagehide）
     ・ウィンドウからフォーカスが外れた（別の画面へ移った … blur）
     もどってきても自動では動かさない（一時停止の画面のまま。「よーい！」の途中だったときも、一時停止の画面へ戻す）

   ■ ここがやらないこと
     ・ゲームを止める・動かす中身は、それぞれのゲームの composable（options でもらった関数を呼ぶだけ）
     ・画面に出すもの … 「一時停止」ボタンは MinigameLayout.vue、一時停止の画面は MinigamePauseOverlay.vue
   ============================================================ */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';

export type MinigamePauseState = 'running' | 'paused' | 'resuming';

/* 「よーい！」を出しておく長さ（ミリ秒） */
export const minigameResumeCueDuration = 1000;

export type UseMinigamePauseOptions = {
  /* いま一時停止できるか（遊んでいる最中だけ true。カウントダウン中もふくむ） */
  canPause: Ref<boolean>;

  /* はじまる前のカウントダウン中か（ゲームの時計がマイナスのあいだ。はじめの「間」もふくむ）
     このあいだに止めたときは、「つづける」で「よーい！」を出さずに、すぐカウントダウンの続きから動かす
     （このあと「3」「2」「1」が出るので、「よーい！」を重ねなくても心の準備ができるため） */
  isCountingDown: Ref<boolean>;

  /* ゲームの動きと時計を止める ／ 動かす ／ やめて、はじまる前の画面へ戻す（それぞれのゲームの composable） */
  pauseGame: () => void;
  resumeGame: () => void;
  quitGame: () => void;

  /* ボタンを押したときの決定音（useAudio.ts） */
  playDecisionSound: () => void;
};

export function useMinigamePause(options: UseMinigamePauseOptions) {
  const { canPause, isCountingDown, pauseGame, resumeGame, quitGame, playDecisionSound } = options;

  const pauseState = ref<MinigamePauseState>('running');

  /* 止まっているか（一時停止の画面・「よーい！」のどちらも） */
  const isPaused = computed(() => pauseState.value !== 'running');

  let resumeTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelResume() {
    if (resumeTimer !== null) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
  }

  /* 一時停止する
     「よーい！」の途中なら、動かす予約を取り消して、一時停止の画面へ戻す（ゲームはまだ止まったまま） */
  function pause() {
    if (pauseState.value === 'resuming') {
      cancelResume();
      pauseState.value = 'paused';
      return;
    }

    if (pauseState.value !== 'running' || !canPause.value) {
      return;
    }

    pauseState.value = 'paused';
    pauseGame();
  }

  /* 「一時停止」ボタン（音を鳴らすのは、自分で押したときだけ） */
  function pauseByButton() {
    if (pauseState.value !== 'running' || !canPause.value) {
      return;
    }

    playDecisionSound();
    pause();
  }

  /* 「つづける」… すぐには動かさず、「よーい！」を出してから動かす
     （カウントダウン中に止めたときだけは、「よーい！」を出さずに すぐ動かす → isCountingDown） */
  function resume() {
    if (pauseState.value !== 'paused') {
      return;
    }

    playDecisionSound();

    if (isCountingDown.value) {
      pauseState.value = 'running';
      resumeGame();
      return;
    }

    pauseState.value = 'resuming';

    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      pauseState.value = 'running';

      if (canPause.value) {
        resumeGame();
      }
    }, minigameResumeCueDuration);
  }

  /* 「やめる」… はじまる前の画面（ステージえらび）へ戻す */
  function quit() {
    if (pauseState.value !== 'paused') {
      return;
    }

    playDecisionSound();
    pauseState.value = 'running';
    quitGame();
  }

  /* 止まっているあいだのキー操作（ページの keydown から、いちばん先に呼ぶ）
     受け取ったら true を返す（呼ぶ側は、ゲームの操作へ回さない）
     ・遊んでいる最中 … Esc で一時停止。「一時停止」ボタンにフォーカスがあるときは Enter / Space でも
     ・止まっているあいだ … Esc で「つづける」。ほかのキーはゲームへ回さない
       （ボタンの Enter / Space と、ボタンどうしの矢印キーは MinigamePauseOverlay.vue） */
  function handlePauseKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;

    if (pauseState.value === 'running') {
      const isPauseButton = !!target?.closest?.('.mg-pause-button');

      if (!canPause.value || !(event.key === 'Escape' || (isPauseButton && (event.key === 'Enter' || event.key === ' ')))) {
        return false;
      }

      event.preventDefault();

      if (!event.repeat) {
        pauseByButton();
      }

      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();

      if (!event.repeat) {
        resume();
      }

      return true;
    }

    // ボタンの外で押された矢印キー・Space で、うしろの画面がスクロールしないように
    if (!target?.closest?.('button') && (event.key.startsWith('Arrow') || event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
    }

    return true;
  }

  /* 止まっているあいだに、遊んでいる最中ではなくなったとき（ふつうは起きない）は、一時停止の画面を残さない */
  watch(canPause, (can) => {
    if (!can && pauseState.value !== 'running') {
      cancelResume();
      pauseState.value = 'running';
    }
  });

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      pause();
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', pause);
    window.addEventListener('blur', pause);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', pause);
    window.removeEventListener('blur', pause);

    cancelResume();
  });

  return {
    pauseState,
    isPaused,
    pauseByButton,
    resume,
    quit,
    handlePauseKeydown,
  };
}
