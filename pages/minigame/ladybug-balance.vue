<script setup lang="ts">
/* ============================================================
   ミニゲーム「とばないで！」（/minigame/ladybug-balance）

   枝の上を勝手に歩くてんとう虫が、はしまで行って飛んでいかないように、左右のボタンで枝を傾けてバランスをとる
   ステージ制（ステージの中身は data/ladybugBalance.ts）。前のステージをクリアすると、次のステージが遊べる
   ぜんぶのステージをクリアすると、エンドレス（どこまで たえられるか）が遊べるようになる

   ■ 入口
     ミニゲームの一覧（pages/minigame/index.vue）から来る
     本編の「とつぜんのできごと」でテントウムシを見つけたら解放される（pages/index.vue の unlockMinigame('ladybug-balance')）
     まだ解放していないブラウザで直接開いたときは、遊べるようになる条件だけを出す

   ■ 保存するもの（utils/minigameStorage.ts の「自己ベスト」の場所を使う）
     { clearedStage: 3, endlessBestMs: 23400, selected: 2 }
       clearedStage  … ステージ3までクリアした（次はステージ4が遊べる）
       endlessBestMs … エンドレスで たえた時間の自己ベスト（ミリ秒。まだ遊んでいなければ 0）
       selected      … さいごに えらんでいたもの（ステージの番号。エンドレスは 'endless'）
                       次に開いたときも、同じものを えらんだ状態から始める（まだ無い・遊べないものなら、まだクリアしていない いちばん前のステージ）
     ※ ぜんぶ いっしょに保存する（ひとつだけ保存すると、ほかが消えるため → saveProgress()）

   ■ ゲームの中身
     ・動き・操作 … composables/useLadybugBalanceGame.ts
     ・フィールドの絵 … components/minigame/LadybugBalanceField.vue
     このページが持つのは、はじまる前・結果の画面、ステージの開放、エンドレスの記録、音
   ============================================================ */

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import LadybugBalanceField from '~/components/minigame/LadybugBalanceField.vue';
import MinigameLayout from '~/components/minigame/MinigameLayout.vue';
import { useAudio } from '~/composables/useAudio';
import { useLadybugBalanceGame } from '~/composables/useLadybugBalanceGame';
import type { LadybugBalanceSide } from '~/composables/useLadybugBalanceGame';
import { moveMinigameFocusSpatially } from '~/composables/useMinigameKeyboardNav';
import { useMinigamePause } from '~/composables/useMinigamePause';
import { ladybugBalanceEndless, ladybugBalanceKinds, ladybugBalanceStages } from '~/data/ladybugBalance';
import type { LadybugBalanceKind } from '~/data/ladybugBalance';
import { minigames, splitMinigameTitle } from '~/data/minigames';
import type { MinigameId } from '~/data/minigames';
import type { GameEvent } from '~/types/game';
import { loadMinigameBest, loadUnlockedMinigames, saveMinigameBest } from '~/utils/minigameStorage';

/* このミニゲームの id（URL の /minigame/ladybug-balance と、保存場所の名前に使う）と、一覧の情報（data/minigames.ts） */
const minigameId: MinigameId = 'ladybug-balance';
const minigameInfo = minigames.find((minigame) => minigame.id === minigameId)!;

const stageCount = ladybugBalanceStages.length;

/* ============================================================
   音
   BGM は公園の曲（てんとう虫は公園で見つけるので）。useAudio() には「公園で遊んでいる」ときと同じ値を渡す
   （サウンドをOFFからONに戻したときも、公園BGMの続きが鳴るように）
   ============================================================ */
const {
  soundEnabled,
  soundVolumePercent,
  toggleSound,
  changeSoundVolume,
  playDecisionSound,
  playItemSound,
  playGoalSound,
  playTantrumSound,
  playCountdownSound,
  playCountdownStartSound,
  playSuddenEventSound,
  playParkBgmSoon,
  stopParkBgm,
  resumeParkBgm,
  restoreSoundSettings,
  cleanupAudio,
} = useAudio({
  titleEntered: ref(true),
  gameStarted: ref(true),
  currentEvent: ref<GameEvent>('parkEntrance'),
  isTantrum: ref(false),
  isResultScene: computed(() => false),
  currentMinutes: computed(() => 0),
  endingRank: ref(''),
});

/* ============================================================
   ステージの開放（クリアした いちばん先のステージ。0 ＝ まだ1つもクリアしていない）
   ============================================================ */
const clearedStage = ref(0);

/* 遊べるステージの数（クリアしたステージの次まで） */
const playableStageCount = computed(() => Math.min(stageCount, clearedStage.value + 1));

/* いま終わったプレイで、新しいステージが遊べるようになったか（結果の画面に出す） */
const isNewStageUnlocked = ref(false);

/* ============================================================
   エンドレス（ぜんぶのステージをクリアすると遊べる）
   ============================================================ */
const endlessBestMs = ref(0);
const isEndlessUnlocked = computed(() => clearedStage.value >= stageCount);

/* いま終わったプレイで、エンドレスが遊べるようになったか ／ 自己ベストを更新したか ／ たえた時間 */
const isNewEndlessUnlocked = ref(false);
const isNewEndlessBest = ref(false);
const endlessRecordMs = ref(0);

/* 秒の文字（「23.4」。0.1秒きざみで切り捨て） */
function formatSeconds(ms: number) {
  return (Math.floor(ms / 100) / 10).toFixed(1);
}

/* クリアしたステージと、エンドレスの自己ベストを、いっしょに保存する */
function saveProgress() {
  saveMinigameBest(minigameId, {
    clearedStage: clearedStage.value,
    endlessBestMs: endlessBestMs.value,
    selected: mode.value === 'endless' ? 'endless' : stageIndex.value + 1,
  });
}

/* 結果の画面の知らせを消す（次を始めるとき・えらびなおすとき） */
function clearResultNotices() {
  isNewStageUnlocked.value = false;
  isNewEndlessUnlocked.value = false;
  isNewEndlessBest.value = false;
}

const {
  phase,
  mode,
  stageIndex,
  stage,
  rule,
  tilt,
  ladybugs,
  lostKind,
  elapsed,
  endlessLevel,
  endlessLevelProgress,
  windDir,
  windWarningDir,
  isLeftHeld,
  isRightHeld,
  countdownNumber,
  remainingMs,
  selectStage,
  selectEndless,
  start,
  startStage,
  canAcceptResultInput,
  canPause,
  isCountingDown,
  pressPointer,
  releasePointer,
  handleFieldPointerDown,
  handleFieldPointerUp,
  handleGameKeydown,
  pause: pauseGame,
  resume: resumeGame,
  quit: quitGame,
} = useLadybugBalanceGame({
  playCountdownSound,
  playCountdownStartSound,
  onFlyAway: () => {
    // 葉っぱがゆれる「ガサッ」（本編でテントウムシを見つけたときと同じ音）
    playSuddenEventSound('ladybug');
  },
  onCleared: (index) => {
    playGoalSound();

    const stageNumber = index + 1;

    isNewStageUnlocked.value = stageNumber > clearedStage.value && stageNumber < stageCount;

    // さいごのステージを はじめてクリアしたら、エンドレスが遊べるようになる
    isNewEndlessUnlocked.value = stageNumber > clearedStage.value && stageNumber === stageCount;

    if (stageNumber > clearedStage.value) {
      clearedStage.value = stageNumber;
      saveProgress();
    }
  },
  onFailed: () => {
    playTantrumSound();

    if (mode.value !== 'endless') {
      return;
    }

    // エンドレスは、おしまいになった時間が記録（飛んでいく演出のあいだは、時計が止まっている）
    endlessRecordMs.value = Math.max(0, Math.floor(elapsed.value));
    isNewEndlessBest.value = endlessRecordMs.value > endlessBestMs.value;

    if (isNewEndlessBest.value) {
      endlessBestMs.value = endlessRecordMs.value;
      saveProgress();

      // 自己ベストを更新したときだけ、キラリン♪
      playItemSound();
    }
  },
  onLevelUp: () => {
    // エンドレスのレベルアップ「ピピッ」（どこまで行ける？ のスピードアップと同じ）
    playCountdownSound();
    playCountdownSound(0.1);
  },
});

/* ============================================================
   一時停止（どこまで行ける？ と共通 → composables/useMinigamePause.ts）
   「やめる」は、えらんでいたステージ（エンドレス）の、はじまる前の画面へ戻す
   ============================================================ */
const { pauseState, pauseByButton, resume, quit, handlePauseKeydown } = useMinigamePause({
  canPause,
  isCountingDown,
  pauseGame,
  resumeGame,
  quitGame: returnToStageSelect,
  playDecisionSound,
});

/* 遊んでいる・飛んでいく・結果のあいだは、フィールドを出す */
const isFieldVisible = computed(() => phase.value !== 'ready');

/* 「スタート！」を出すのは、始まってから 0.6秒だけ */
const isStartCueVisible = computed(() => phase.value === 'playing' && elapsed.value >= 0 && elapsed.value < 600);

/* 次のステージがあるか（いまのステージをクリアしたときだけ「次のステージへ」を出す） */
const hasNextStage = computed(() => stageIndex.value + 1 < stageCount);

/* 出てくる てんとう虫の説明（「🐞 ナナホシ ×2（ふつう）」のように、種類ごとに1行） */
function describeLadybugs(kinds: readonly LadybugBalanceKind[]) {
  const counts = new Map<LadybugBalanceKind, number>();

  for (const kind of kinds) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  return [...counts].map(([kind, count]) => {
    const info = ladybugBalanceKinds[kind];

    return `🐞 ${info.name}${count > 1 ? ` ×${count}` : ''}（${info.trait}）`;
  });
}

/* はじまる前に出す、ステージ（エンドレス）の説明
   えらんでいるものだけでなく、ぜんぶのステージとエンドレスのぶんを作る
   （同じ場所に重ねて、えらんでいるものだけを見せる。いちばん長い説明の高さになるので、
   えらびなおしても画面の高さが変わらない → template の .lb-summaries） */
const stageSummaries = computed(() => {
  const summaries = ladybugBalanceStages.map((stageInfo, index) => {
    const parts = [...describeLadybugs(stageInfo.ladybugs), `⏱ ${stageInfo.seconds}びょう とばさなければクリア`];

    if (stageInfo.wind) {
      parts.push('💨 ときどき かぜが ふく');
    }

    return { key: `stage-${index}`, title: `ステージ ${index + 1}`, parts, isSelected: mode.value === 'stage' && index === stageIndex.value };
  });

  // 1行目は、何が記録になるか（見出しの「とばさず どこまで？」と、同じことばが続かないように）
  const endlessParts = ['⏱ がんばった じかんが きろく', `⏫ ${ladybugBalanceEndless.levelSeconds}びょうごとに むずかしくなる`];

  if (endlessBestMs.value > 0) {
    endlessParts.push(`🏆 じこベスト ${formatSeconds(endlessBestMs.value)}びょう`);
  }

  summaries.push({ key: 'endless', title: '⏱ とばさず どこまで？', parts: endlessParts, isSelected: mode.value === 'endless' });

  return summaries;
});

/* 結果の画面のひとこと（幼虫は飛べないので「おちちゃった」） */
const resultComment = computed(() => {
  if (phase.value === 'failed' && mode.value === 'endless') {
    return isNewEndlessBest.value ? 'じこベスト こうしん！ すごい！' : 'もういちど やって、きろくを のばそう！';
  }

  if (phase.value === 'failed') {
    return lostKind.value === 'larva'
      ? 'ようちゅうが おちちゃった。もういちど やってみよう！'
      : 'てんとうむしが とんでいっちゃった。もういちど やってみよう！';
  }

  // クリアしたときは、ステージごとの ひとこと（data/ladybugBalance.ts の clearComment）
  return stage.value.clearComment;
});

/* ============================================================
   はじめる・もう一度・次のステージ
   ============================================================ */

/* はじまる前の「はじめる」を押せるか（まだ遊べないステージ・エンドレスは押せない） */
const canPlaySelected = computed(() => (mode.value === 'endless' ? isEndlessUnlocked.value : stageIndex.value < playableStageCount.value));

/* えらんだステージ（エンドレス）で始める（はじまる前の「はじめる」） */
function play() {
  if (phase.value !== 'ready' || !canPlaySelected.value) {
    return;
  }

  playDecisionSound();
  clearResultNotices();
  start();

  /* BGM は開いたときから鳴らしているが、直接開いたときはまだ鳴らせていないので、ここで鳴らす（鳴っていれば、そのまま） */
  resumeParkBgm();
}

/* 結果の画面のボタン（終わってすぐは受けつけない → canAcceptResultInput()） */
function retry() {
  if (!canAcceptResultInput()) {
    return;
  }

  playDecisionSound();
  clearResultNotices();
  start();
}

function goToNextStage() {
  if (!canAcceptResultInput() || !hasNextStage.value || stageIndex.value + 1 >= playableStageCount.value) {
    return;
  }

  playDecisionSound();
  clearResultNotices();
  startStage(stageIndex.value + 1);
}

/* さいごのステージをクリアしたあとの「⏱ とばさず どこまで？へ」 */
function goToEndless() {
  if (!canAcceptResultInput() || !isEndlessUnlocked.value) {
    return;
  }

  playDecisionSound();
  clearResultNotices();
  selectEndless();
  start();
}

/* えらんでいたステージ（エンドレス）の、はじまる前の画面へ戻す
   （一時停止の「やめる」・遊んでいる最中と結果の画面の「← ステージえらびへ」で共通） */
async function returnToStageSelect() {
  clearResultNotices();
  quitGame();

  await focusFirstMainButton();
}

/* はじまる前の画面で、ステージのボタンを押したとき
   えらんだら「はじめる」へフォーカスを移す（Enter / Space ですぐ始められるように）
   もう えらんでいるステージを押したときも、「はじめる」へ移す（音は鳴らさない） */
function chooseStage(index: number) {
  if (index >= playableStageCount.value) {
    return;
  }

  if (index !== stageIndex.value || mode.value !== 'stage') {
    playDecisionSound();
    selectStage(index);
  }

  focusFirstMainButton();
}

/* はじまる前の画面で、エンドレスのボタンを押したとき（ステージと同じく、えらんだら「はじめる」へ） */
function chooseEndless() {
  if (!isEndlessUnlocked.value) {
    return;
  }

  if (mode.value !== 'endless') {
    playDecisionSound();
    selectEndless();
  }

  focusFirstMainButton();
}

/* 左右のボタン（押しているあいだだけ傾ける） */
function handleSidePointerDown(event: PointerEvent, side: LadybugBalanceSide) {
  // 長押しで文字が選ばれたり、メニューが出たりしないように（PC のマウス向け。iPhone は nav の touchstart で止める）
  event.preventDefault();
  pressPointer(side);
}

/* フィールドをさわって傾けるか（遊んでいる最中・飛んでいくあいだ。結果の画面では、ふつうにスクロールできるようにする） */
const isFieldTouchable = computed(() => phase.value === 'playing' || phase.value === 'flyaway');

/* フィールドの touchstart（左右のボタンと同じく、iPhone の長押し・ダブルタップを止める） */
function handleFieldTouchStart(event: TouchEvent) {
  if (isFieldTouchable.value) {
    event.preventDefault();
  }
}

/* ============================================================
   ページの移動
   ============================================================ */
let isLeavingPage = false;

/* 上の「戻る」は、ひとつ前の画面へ
   ・はじまる前（まだ解放していないページもふくむ） … ミニゲーム一覧へ
   ・遊んでいる最中・飛んでいく演出・結果の画面 … ステージえらびへ（決定音は ほかの「戻る」と同じく鳴らさない） */
const isBackToStageSelect = computed(() => unlockState.value === 'unlocked' && phase.value !== 'ready');

function goBack() {
  if (isBackToStageSelect.value) {
    returnToStageSelect();
    return;
  }

  goToList();
}

/* 「← ミニゲーム一覧へ」（決定音は鳴らさない。ほかのミニゲームの「戻る」と同じ） */
async function goToList() {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  stopParkBgm();

  await navigateTo('/minigame');
}

/* ============================================================
   キーボード
   ・遊んでいる最中 … ← → で傾ける（→ useLadybugBalanceGame.ts）
   ・はじまる前・結果の画面 … 矢印キーでボタンを選ぶ（ボタンが横にもならぶので、画面の位置で動かす → useMinigameKeyboardNav.ts の moveMinigameFocusSpatially()）
     Enter / Space は、ボタンにフォーカスが無いときだけ「はじめる」
   ============================================================ */
const layoutRef = ref<InstanceType<typeof MinigameLayout> | null>(null);
const stageRef = ref<HTMLElement | null>(null);

/* 矢印キーで行き来するボタン（上から・左から順。押せないボタンは入れない） */
function getMainButtons() {
  return [...(stageRef.value?.querySelectorAll<HTMLButtonElement>('button.lb-nav:not(:disabled)') ?? [])];
}

async function focusFirstMainButton() {
  await nextTick();

  // はじまる前は「はじめる」、結果の画面は、いちばん上のボタン
  (stageRef.value?.querySelector<HTMLButtonElement>('button.lb-nav--primary') ?? getMainButtons()[0])?.focus();
}

function handleKeydown(event: KeyboardEvent) {
  if (unlockState.value !== 'unlocked') {
    return;
  }

  // 一時停止（Esc）と、止まっているあいだのキーは、ゲームの操作へ回さない
  if (handlePauseKeydown(event)) {
    return;
  }

  if (phase.value === 'playing' || phase.value === 'flyaway') {
    handleGameKeydown(event);
    return;
  }

  if (event.key.startsWith('Arrow')) {
    // 押しっぱなしの矢印キー（遊んでいた最中から押していたもの）では、ボタンを動かさない
    if (event.repeat) {
      event.preventDefault();
      return;
    }

    const topRow = [layoutRef.value?.backButton, layoutRef.value?.soundToggleButton];

    if (moveMinigameFocusSpatially(event, topRow, getMainButtons())) {
      event.preventDefault();
    }

    return;
  }

  if (phase.value !== 'ready' || (event.key !== 'Enter' && event.key !== ' ')) {
    return;
  }

  const target = event.target as HTMLElement | null;

  if (target?.closest?.('button, input')) {
    return;
  }

  event.preventDefault();

  if (!event.repeat) {
    play();
  }
}

/* 結果が出たら、いちばん上のボタンへフォーカスを当てる（Enter ですぐ次へ進めるように） */
watch(phase, (next) => {
  if (next === 'cleared' || next === 'failed') {
    focusFirstMainButton();
  }
});

/* 画面（はじまる前 → 遊んでいる最中 → 結果）が切りかわったら、スクロールをいちばん上に戻す
   （説明を下までスクロールしてから「はじめる」を押すと、フィールドが途中から見えてしまうため）
   flush: 'post' … 中身が入れかわってから戻す（結果のボタンへのフォーカスは、このあと nextTick で当たる） */
const scrollRef = ref<HTMLElement | null>(null);

watch(
  phase,
  () => {
    scrollRef.value?.scrollTo({ top: 0 });
  },
  { flush: 'post' },
);

/* ============================================================
   解放されているか（secret-path.vue と同じ3つ）
   ============================================================ */
const unlockState = ref<'checking' | 'locked' | 'unlocked'>('checking');

/* えらんでいるもの（ステージ ／ エンドレス）が変わったら、保存する（次に開いたときも、同じものを えらんだ状態から始めるため）
   ・「次のステージへ」「⏱ とばさず どこまで？へ」で変わったときも、ここで保存される
   ・保存した記録を読みおわる前（onMounted の前半）と、まだ解放していないページでは保存しない */
let isSelectionRestored = false;

watch([mode, stageIndex], () => {
  if (isSelectionRestored && unlockState.value === 'unlocked') {
    saveProgress();
  }
});

onMounted(() => {
  restoreSoundSettings();

  unlockState.value = loadUnlockedMinigames().includes(minigameId) ? 'unlocked' : 'locked';

  // どこまでクリアしたか と エンドレスの自己ベスト（こわれた記録は 0。ステージを減らしたときも、ある数までにする）
  const savedBest = loadMinigameBest(minigameId);

  clearedStage.value = Math.min(stageCount, Math.max(0, Math.floor(Number(savedBest?.clearedStage) || 0)));
  endlessBestMs.value = Math.max(0, Number(savedBest?.endlessBestMs) || 0);

  // さいごに えらんでいたものを、えらんでおく
  // まだ無い・いまは遊べないものなら、まだクリアしていない いちばん前のステージ（ぜんぶクリアしていたら最後のステージ）
  const savedSelected = savedBest?.selected;
  const savedStageNumber = Math.floor(Number(savedSelected));

  if (savedSelected === 'endless' && isEndlessUnlocked.value) {
    selectEndless();
  } else if (savedStageNumber >= 1 && savedStageNumber <= playableStageCount.value) {
    selectStage(savedStageNumber - 1);
  } else {
    selectStage(Math.min(clearedStage.value, stageCount - 1));
  }

  isSelectionRestored = true;

  window.addEventListener('keydown', handleKeydown);

  if (unlockState.value === 'unlocked') {
    focusFirstMainButton();
    playParkBgmSoon();
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);

  cleanupAudio();
});
</script>

<template>
  <MinigameLayout
    ref="layoutRef"
    :back-label="isBackToStageSelect ? '← ステージえらびへ' : '← ミニゲーム一覧へ'"
    :back-aria-label="isBackToStageSelect ? 'ステージえらびへ戻る' : 'ミニゲーム一覧へ戻る'"
    centered
    fit-screen
    :sound-enabled="soundEnabled"
    :sound-volume-percent="soundVolumePercent"
    :can-pause="canPause"
    :pause-state="pauseState"
    @back="goBack"
    @toggle-sound="toggleSound"
    @volume-change="changeSoundVolume"
    @pause="pauseByButton"
    @resume="resume"
    @quit="quit">
    <!-- 外枠（背景 ＋ 上部ツールバー）は、ミニゲームの一覧と同じ部品
         ※ このコメントを <MinigameLayout> の外に書かないこと
           開発中はコメントも残って、いちばん外の要素が2つになり、ページを移るときのフェードがこわれて画面がまっ暗になる
         ※ fit-screen … 全体を画面の高さより高くしない。上の「← ミニゲーム一覧へ」と下の「はじめる」は動かさず、
           あいだ（.lb-scroll）だけをスクロールさせる（iPhone SE など背の低い画面で、ステージをえらんだあと
           下までスクロールしないと「はじめる」を押せなかったため） -->

    <!-- まだ解放していないブラウザで、直接開いたとき -->
    <section v-if="unlockState === 'locked'" class="mg-stage">
      <article class="place-card">
        <h1 class="place-card__title">？？？</h1>
        <p class="mg-text">{{ minigameInfo.lockedHint }}</p>
        <p class="mg-text">ゲーム本編で見つけると、ここで遊べるようになります。</p>
      </article>
    </section>

    <section v-else-if="unlockState === 'unlocked'" ref="stageRef" class="mg-stage lb-screen" :class="{ 'lb-screen--inGame': phase !== 'ready' }">
      <!-- スクロールする部分（はじまる前の説明・遊んでいる最中・結果） -->
      <div ref="scrollRef" class="lb-scroll">
        <!-- はじまる前（遊びかたと、ステージえらび） -->
        <article v-if="phase === 'ready'" class="place-card">
          <!-- アイコン（🐞）と名前を ひとまとまりにして、カードのまん中に置く（.mg-title。どこまで行ける？ の見出しと同じ置きかた）
               名前は、ことばの区切りごとに まとめて出す（細い画面で、ことばの途中で切れないように） -->
          <h1 class="place-card__title mg-title">
            <span class="mg-title__icon" aria-hidden="true">🐞</span>
            <span class="mg-title__text">
              <span v-for="part in splitMinigameTitle(minigameInfo.title)" :key="part" class="lb-titlePart">{{ part }}</span>
            </span>
          </h1>

          <!-- いつも2行で出す（行の中では折り返さない。.mg-lead__line）
               PC   … 「枝をかたむけて、」／「てんとうむしをとばさないようにしよう！」（--pc の改行）
               スマホ … 「枝をかたむけて、てんとうむしを」／「とばさないようにしよう！」（--sp の改行）
               スマホで PC と同じ分けかたにすると、2行目が長すぎて、iPhone SE では文字をとても小さくしないと入らないため -->
          <p class="mg-lead">
            <span class="mg-lead__line">枝をかたむけて、<br class="mg-lead__break mg-lead__break--pc" />てんとうむしを</span><br class="mg-lead__break mg-lead__break--sp" /><span class="mg-lead__line">とばさないようにしよう！</span>
          </p>

          <ul class="mg-rules">
            <li class="mg-for-pc">← → キーか ボタンで、枝をかたむける</li>
            <li class="mg-for-touch">◀ ▶ か 画面の左右をおして、枝をかたむける</li>
            <li>てんとうむしは、高いほうへ あるく</li>
            <li>はしに近づいたら、そっちを下げよう！</li>
          </ul>

          <!-- ステージえらび（まだ遊べないステージは 🔒） -->
          <div class="lb-stages" role="group" aria-label="ステージをえらぶ">
            <button
              v-for="(_, index) in ladybugBalanceStages"
              :key="index"
              type="button"
              class="lb-stage lb-nav"
              :class="{ 'lb-stage--selected': index === stageIndex && mode === 'stage', 'lb-stage--cleared': index < clearedStage }"
              :disabled="index >= playableStageCount"
              :aria-pressed="index === stageIndex && mode === 'stage'"
              :aria-label="index >= playableStageCount ? `ステージ${index + 1}（まだ遊べません）` : `ステージ${index + 1}${index < clearedStage ? '（クリアずみ）' : ''}`"
              @click="chooseStage(index)">
              <span v-if="index >= playableStageCount" aria-hidden="true">🔒</span>
              <template v-else>{{ index + 1 }}</template>
              <span v-if="index < clearedStage" class="lb-stage__check" aria-hidden="true">✓</span>
            </button>
          </div>

          <!-- エンドレス（ぜんぶのステージをクリアすると出てくる） -->
          <button
            v-if="isEndlessUnlocked"
            type="button"
            class="lb-endless lb-nav"
            :class="{ 'lb-endless--selected': mode === 'endless' }"
            :aria-pressed="mode === 'endless'"
            @click="chooseEndless">
            ⏱ とばさず どこまで？
            <!-- 自己ベストの札（書きかたと見た目は、ミニゲームの一覧のカードの自己ベストとそろえる） -->
            <span v-if="endlessBestMs > 0" class="lb-endless__best">
              じこベスト
              <span>⏱ {{ formatSeconds(endlessBestMs) }}びょう</span>
            </span>
          </button>

          <!-- えらんでいるステージ（エンドレス）の説明
               ぜんぶの説明を同じ場所に重ねて置き、えらんでいるものだけを見せる（ほかは visibility: hidden で、読み上げもしない）
               枠はいちばん長い説明の高さになるので、えらびなおしても画面の高さが変わらない（細い画面で折り返したときも）
               ※ 背の低いスマホでは そろえない（えらんでいる説明の高さだけにする。CSS の .lb-summary--hidden） -->
          <div class="lb-summaries">
            <ul v-for="summary in stageSummaries" :key="summary.key" class="lb-summary" :class="{ 'lb-summary--hidden': !summary.isSelected }">
              <li class="lb-summary__title">{{ summary.title }}</li>
              <li v-for="part in summary.parts" :key="part">{{ part }}</li>
            </ul>
          </div>
        </article>

        <!-- フィールドと結果のカードの箱（遊んでいる最中・結果）
             スマホでは、結果のカードをフィールドの下のほうに重ねて、フィールドの大きさを変えない（CSS の .lb-playArea） -->
        <div v-else class="lb-playArea">
          <!-- 遊んでいる最中・結果（フィールドは出したままにして、飛んでいく様子・クリアの様子を見せる）
               フィールドをさわっても傾けられる（右半分・左半分をおさえる。左右のボタンと同じく、はなすまで傾く。中身は useLadybugBalanceGame.ts） -->
          <LadybugBalanceField
            class="lb-play-field"
            :class="{ 'lb-play-field--result': phase === 'cleared' || phase === 'failed', 'lb-play-field--touchable': isFieldTouchable }"
            @pointerdown="handleFieldPointerDown"
            @pointerup="handleFieldPointerUp"
            @pointercancel="handleFieldPointerUp"
            @touchstart="handleFieldTouchStart"
            @contextmenu.prevent
            :phase="phase"
            :stage-number="stageIndex + 1"
            :tilt="tilt"
            :branch-length="rule.branchLength"
            :ladybugs="ladybugs"
            :remaining-ms="remainingMs"
            :total-ms="stage.seconds * 1000"
            :countdown-number="countdownNumber"
            :is-start-cue-visible="isStartCueVisible"
            :wind-dir="windDir"
            :wind-warning-dir="windWarningDir"
            :endless-level="mode === 'endless' ? endlessLevel : null"
            :endless-progress="endlessLevelProgress"
            :elapsed-ms="elapsed"
            :lost-kind="lostKind" />

          <!-- 結果（クリア ／ おしまい） -->
          <article v-if="phase === 'cleared' || phase === 'failed'" class="place-card lb-result" aria-live="polite">
            <!-- エンドレス：たえた時間とレベル -->
            <template v-if="mode === 'endless'">
              <p class="place-card__flash lb-result__flash">⏱ とばさず どこまで？</p>
              <p class="lb-record">
                <b class="lb-record__value">{{ formatSeconds(endlessRecordMs) }}</b>
                <span class="lb-record__unit">びょう がんばった！</span>
                <span class="lb-record__level">Lv.{{ endlessLevel }}</span>
                <span v-if="isNewEndlessBest" class="lb-record__new">じこベスト！</span>
              </p>
            </template>

            <!-- クリアしたときは、ステージの数字だけ大きくする（何番をクリアしたか すぐ分かるように） -->
            <p v-else-if="phase === 'cleared'" class="place-card__flash lb-result__flash">
              ステージ <span class="lb-result__stageNumber">{{ stageIndex + 1 }}</span> クリア！
            </p>
            <p v-else class="place-card__flash lb-result__flash lb-result__flash--failed">ざんねん…</p>
            <p class="mg-text">{{ resultComment }}</p>
            <p v-if="isNewStageUnlocked" class="lb-unlocked">🔓 ステージ {{ stageIndex + 2 }} が あそべるようになった！</p>
            <p v-if="isNewEndlessUnlocked" class="lb-unlocked">⏱ とばさず どこまで？が あそべるようになった！</p>
            <p v-if="mode === 'endless' && !isNewEndlessBest && endlessBestMs > 0" class="mg-text lb-record__best">🏆 じこベスト {{ formatSeconds(endlessBestMs) }}びょう</p>
          </article>
        </div>

        <!-- 左右のボタン（遊んでいる最中・飛んでいくあいだ）
             touchstart.prevent … iPhone で、長押し（文字えらび・虫めがね・メニュー）やダブルタップ（拡大）が起きないように
               pointerdown の preventDefault や touch-action では止まらないため、touchstart で止める
               ボタンは pointerdown / pointerup で見ているので、click が来なくなっても動きは変わらない
               ボタンのあいだの すきまも ふくめるため、nav に付ける -->
        <nav
          v-if="phase === 'playing' || phase === 'flyaway'"
          class="mg-command lb-controls"
          aria-label="枝をかたむける"
          @touchstart.prevent>
          <button
            type="button"
            class="lb-side"
            :class="{ 'lb-side--held': isLeftHeld }"
            tabindex="-1"
            aria-label="左へかたむける"
            @pointerdown="handleSidePointerDown($event, -1)"
            @pointerup="releasePointer(-1)"
            @pointercancel="releasePointer(-1)"
            @pointerleave="releasePointer(-1)"
            @contextmenu.prevent>
            <span class="lb-side__arrow" aria-hidden="true">◀</span>
            <span class="lb-side__text">ひだり</span>
          </button>
          <button
            type="button"
            class="lb-side"
            :class="{ 'lb-side--held': isRightHeld }"
            tabindex="-1"
            aria-label="右へかたむける"
            @pointerdown="handleSidePointerDown($event, 1)"
            @pointerup="releasePointer(1)"
            @pointercancel="releasePointer(1)"
            @pointerleave="releasePointer(1)"
            @contextmenu.prevent>
            <span class="lb-side__text">みぎ</span>
            <span class="lb-side__arrow" aria-hidden="true">▶</span>
          </button>
        </nav>

        <!-- 結果の画面のボタン
             ・クリア … 左に「もう一度あそぶ」、右に「次のステージへ」を横にならべる（先へ進むボタンは、進む向きの右に置く）
                         さいごのステージは「⏱ とばさず どこまで？へ」が長くて半分の幅に入らないので、2つとも横いっぱいで たてにならべる（上が「⏱ とばさず どこまで？へ」）
             ・失敗   … 「もう一度あそぶ」だけを横いっぱいに
             ※ 「ステージをえらぶ」は置かない（上の「← ステージえらびへ」（スマホでは「← 戻る」）と同じなので）
             ※ 見た目の順（上から・左から）と Tab の順がそろうよう、ボタンは見た目の順に書く -->
        <div v-if="phase === 'cleared' || phase === 'failed'" class="lb-result-actions" :class="{ 'lb-result-actions--stacked': phase === 'cleared' && !hasNextStage }">
          <!-- さいごのステージをクリアしたら、エンドレスへ -->
          <button v-if="phase === 'cleared' && !hasNextStage && isEndlessUnlocked" type="button" class="mg-play lb-nav lb-nav--primary lb-result-actions__wide" @click="goToEndless">⏱ とばさず どこまで？へ</button>
          <button
            type="button"
            class="lb-nav"
            :class="phase === 'cleared' ? ['lb-sub', { 'lb-result-actions__wide': !hasNextStage }] : 'mg-play lb-nav--primary lb-result-actions__wide'"
            @click="retry">
            もう一度あそぶ
          </button>
          <button v-if="phase === 'cleared' && hasNextStage" type="button" class="mg-play lb-nav lb-nav--primary" @click="goToNextStage">次のステージへ</button>
        </div>
      </div>

      <!-- 「はじめる」（はじまる前）。スクロールの外に置いて、いつも画面の下に見えるようにする -->
      <div v-if="phase === 'ready'" class="lb-footer">
        <button type="button" class="mg-play lb-nav lb-nav--primary" :disabled="!canPlaySelected" @click="play">はじめる</button>
      </div>
    </section>
  </MinigameLayout>
</template>

<style scoped>
/* ============================================================
   このページの中身の見た目（背景・色の名前・上部ツールバーは MinigameLayout.vue）
   カード・「はじめる」の見た目は、どこまで行ける？（secret-path.vue）とそろえてある
   ============================================================ */

.mg-stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
  width: 100%;
  max-width: 620px;
  margin: 0 auto;
  padding: 18px 20px 24px;
}

/* ===== 画面に入りきらないときの、まん中と下（MinigameLayout の fit-screen） =====
   ・.lb-screen … 枠の残りの高さいっぱい。外がわの余白は中の2つが持つ
   ・.lb-scroll … まん中（説明・フィールド・結果）。入りきらないときは、ここだけスクロールする
     overscroll-behavior … いちばん下まで行っても、ページごと引っぱられないように
     > * の flex-shrink: 0 … 高さの決まったフィールドが、縮められて つぶれないように
   ・.lb-footer … 「はじめる」の置き場（スクロールしないので、いつも画面の下に見える）
     上の うすい線で、ここから下はスクロールしない場所だと分かるようにする */
.lb-screen {
  min-height: 0;
  gap: 0;
  padding: 0;
}

.lb-scroll {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: 18px 20px 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.lb-scroll > * {
  flex-shrink: 0;
}

/* 遊んでいる最中から結果まで（フィールドを出しているあいだ）
   ボタンからはみ出た指でフィールドや文字を長押ししても、文字がえらばれたり、iPhone のメニューが出たりしないように */
.lb-screen--inGame {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.lb-footer {
  flex: none;
  padding: 12px 20px 16px;
  border-top: 1px solid #ece4fb;
}

/* ===== カード（紫のカード） ===== */
.place-card {
  box-sizing: border-box;
  padding: 22px 28px;
  border: 2px solid #e6dbfa;
  border-left: 8px solid #8f6ad4;
  border-radius: 14px;
  background: #f9f4ff;
  box-shadow: 0 4px 0 rgb(35 57 94 / 12%);
}

.place-card__title {
  margin: 0 0 10px;
  color: #7f5cc8;
  font-size: 26px;
  line-height: 1.4;
}

/* 見出し（アイコンと名前を ひとまとまりにして、カードのまん中に置く。どこまで行ける？ の .mg-title と同じ置きかた） */
.mg-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

/* 見出しの名前の区切りひとつぶん（入りきるなら1行のまま。入りきらないときは、区切りのところで折り返す） */
.lb-titlePart {
  display: inline-block;
}

.place-card__flash {
  display: inline-block;
  margin: 0 0 8px;
  padding: 2px 14px;
  border-radius: 999px;
  background: var(--gold);
  color: #4a3208;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  animation: found-in 0.4s ease-out 0.15s backwards;
}

.mg-text {
  margin: 0;
  font-size: 16px;
}

.mg-text + .mg-text {
  margin-top: 8px;
}

.mg-lead {
  margin: 14px 0 0;
  padding: 10px 16px;
  border-radius: 12px;
  background: #fff;
  box-shadow: inset 0 0 0 2px #e6dbfa;
  color: #6b4fb0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.6;
  text-align: center;
}

/* 行の中では折り返さない（行の分けかたは、下の改行で決める） */
.mg-lead__line {
  white-space: nowrap;
}

/* スマホ用の改行は、PC では使わない（スマホ幅で入れかえる） */
.mg-lead__break--sp {
  display: none;
}

.mg-rules {
  display: grid;
  gap: 4px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.mg-rules li {
  position: relative;
  padding-left: 20px;
  font-size: 16px;
  line-height: 1.7;
}

.mg-rules li::before {
  position: absolute;
  top: 0.62em;
  left: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #bd9bef;
  content: '';
}

/* パソコン向けとスマホ向けの説明の出し分け（secret-path.vue と同じ） */
.mg-for-touch {
  display: none;
}

@media (hover: none), (pointer: coarse) {
  .mg-for-pc {
    display: none;
  }

  .mg-for-touch {
    display: block;
  }
}

/* ===== ステージえらび ===== */
/* 5つずつ2行にならべる（10ステージ。スマホ幅でも1行に5つ入る）
   カードの幅のまんなかに置く（左に寄っていると、下の横長の とばさず どこまで？ とずれて見えるため） */
.lb-stages {
  display: grid;
  /* ふだんは 48px。とても細い画面（幅 320px など）で入りきらないときだけ、そろって小さくなる */
  grid-template-columns: repeat(5, minmax(0, 48px));
  justify-content: center;
  gap: 8px;
  margin: 16px 0 0;
}

.lb-stage {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  aspect-ratio: 1;
  border: 2px solid #cbb5f0;
  border-radius: 12px;
  background: #fff;
  color: #6b4fb0;
  font-family: inherit;
  font-size: 20px;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.1s ease,
    background-color 0.15s ease;
}

.lb-stage:hover:not(:disabled) {
  transform: translateY(-1px);
}

.lb-stage--selected {
  border-color: #8f6ad4;
  background: #8f6ad4;
  color: #fff;
  box-shadow: 0 3px 0 rgb(107 79 176 / 35%);
}

.lb-stage:disabled {
  border-style: dashed;
  border-color: #cfd6de;
  background: #f3f5f7;
  font-size: 16px;
  cursor: default;
}

.lb-stage:focus-visible {
  outline: 3px solid #67e8f9;
  outline-offset: 2px;
}

/* クリアずみの ✓（右上の小さな丸） */
.lb-stage__check {
  position: absolute;
  top: -7px;
  right: -7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--gold);
  color: #4a3208;
  font-size: 12px;
  line-height: 1;
}

/* エンドレス（とばさず どこまで？）のボタン（ステージのボタンの下に、横長で）
   色は、ステージのボタン（.lb-stage）とそろえる（えらぶ前は白地に紫のふち、えらぶと紫でぬりつぶす）
   中身（名前と自己ベストの札）は、上のステージのボタンと合わせて、まんなかに寄せる */
.lb-endless {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 2px 12px;
  box-sizing: border-box;
  width: 100%;
  margin: 10px 0 0;
  padding: 10px 16px;
  border: 2px solid #cbb5f0;
  border-radius: 12px;
  background: #fff;
  color: #6b4fb0;
  font-family: inherit;
  font-size: 18px;
  font-weight: 800;
  text-align: center;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.lb-endless:hover {
  transform: translateY(-1px);
}

.lb-endless--selected {
  border-color: #8f6ad4;
  background: #8f6ad4;
  color: #fff;
  box-shadow: 0 3px 0 rgb(107 79 176 / 35%);
}

.lb-endless:focus-visible {
  outline: 3px solid #67e8f9;
  outline-offset: 2px;
}

/* 自己ベストの札（ミニゲームの一覧の .mg-card__best と同じ見た目。「じこベスト　⏱ 23.4びょう」） */
.lb-endless__best {
  display: inline-flex;
  align-items: center;
  column-gap: 1em;
  padding: 1px 12px;
  border-radius: 999px;
  background: #fff6e0;
  box-shadow: inset 0 0 0 1px #f5e2be;
  color: #7a5410;
  font-size: 13.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* えらんだステージの説明 */
/* 1行に1つ（てんとう虫の種類の説明が長いので、横にならべると読みにくい） */
/* 説明を重ねる場所（ぜんぶの .lb-summary を、同じマスに置く） */
.lb-summaries {
  display: grid;
  margin: 12px 0 0;
}

/* 重ねた説明は、どれも いちばん高いものに そろう（枠の高さは いつも同じ）
   align-content: start … 短い説明は、上から つめて並べる（行のあいだを広げない） */
.lb-summary {
  display: grid;
  grid-area: 1 / 1;
  align-content: start;
  gap: 2px;
  margin: 0;
  padding: 8px 14px;
  border-radius: 12px;
  background: #fff;
  box-shadow: inset 0 0 0 2px #e6dbfa;
  color: #4e5860;
  font-size: 15px;
  font-weight: 700;
  list-style: none;
}

.lb-summary__title {
  color: #7f5cc8;
}

/* えらんでいない説明（場所だけ取って、見せない） */
.lb-summary--hidden {
  visibility: hidden;
}

/* ===== フィールドと結果のカードの箱 =====
   PC では、フィールドの下に結果のカードを ならべる（すき間は .lb-scroll と同じ）
   スマホでは、結果のカードをフィールドに重ねる（下の @media (max-width: 700px)） */
.lb-playArea {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: inherit;
}

.lb-playArea > * {
  flex-shrink: 0;
}

/* ===== フィールドの高さ（画面の高さに合わせる） ===== */
.lb-play-field {
  height: clamp(260px, calc(100dvh - 400px), 440px);
}

/* 結果の画面では、下に出す説明とボタンが画面に収まるよう、フィールドを低くする（PC だけ）
   スマホでは低くしない。高さが変わると、画面の枠ごと上下に動いて カクつくため（結果のカードはフィールドに重ねる） */
@media (min-width: 701px) {
  .lb-play-field {
    transition: height 0.3s ease;
  }

  .lb-play-field--result {
    height: clamp(200px, calc(100dvh - 560px), 340px);
  }
}

/* さわって傾けられるあいだ（指を左右にずらしても、スクロールや拡大をしない） */
.lb-play-field--touchable {
  touch-action: none;
}

/* ===== 左右のボタン（下の紺色の枠） ===== */
.mg-command {
  box-sizing: border-box;
  padding: 12px;
  border: 3px solid #fff;
  border-radius: 14px;
  background: linear-gradient(180deg, #2e7d96 0%, #226981 100%);
  box-shadow: 0 6px 16px rgb(16 29 44 / 22%);
}

.lb-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.lb-side {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 72px;
  border: 2px solid #e8b23c;
  border-bottom-width: 5px;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
  color: #4a3208;
  font-family: inherit;
  font-size: 19px;
  font-weight: 800;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}

.lb-side__arrow {
  font-size: 22px;
}

/* 押しているあいだ（へこませる） */
.lb-side--held {
  border-bottom-width: 2px;
  background: linear-gradient(180deg, #f5c04f 0%, #eeb43a 100%);
  transform: translateY(3px);
}

/* ===== 結果 ===== */

/* エンドレスの記録（「23.4 びょう がんばった！ Lv.3 じこベスト！」） */
.lb-record {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin: 0 0 8px;
  color: #6b4fb0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.lb-record__value {
  color: #57389e;
  font-size: 44px;
  font-weight: 800;
  line-height: 1.05;
  animation: status-pop 0.35s ease-out;
}

.lb-record__unit {
  font-size: 17px;
}

.lb-record__level {
  align-self: center;
  padding: 1px 9px;
  border-radius: 999px;
  background: var(--navy);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.lb-record__new {
  align-self: center;
  padding: 1px 10px;
  border-radius: 999px;
  background: var(--gold);
  color: #4a3208;
  font-size: 12px;
  letter-spacing: 0.06em;
  animation: found-in 0.4s ease-out 0.3s backwards;
}

.lb-record__best {
  margin-top: 6px;
  color: #7a5410;
  font-size: 14px;
  font-weight: 700;
}

/* 結果の画面の札（クリア ／ ざんねん… ／ とばさず どこまで？）
   結果の画面では、この札がいちばん大事な知らせなので、ほかの画面の札（13px）より ひとまわり大きくする */
.lb-result__flash {
  margin-bottom: 8px;
  padding: 3px 14px;
  font-size: 15px;
}

/* 「ステージ 3 クリア！」の数字（まわりの文字より さらに大きく。札の高さが広がりすぎないよう line-height は 1） */
.lb-result__stageNumber {
  font-size: 21px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}

.lb-result__flash--failed {
  background: #dfe4ea;
  color: #4a5560;
}

.lb-unlocked {
  margin: 12px 0 0;
  padding: 8px 14px;
  border-radius: 12px;
  background: linear-gradient(180deg, #8f6ad4 0%, #7a54c4 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  animation: found-in 0.4s ease-out 0.2s backwards;
}

/* 結果の画面のボタン（2列。横にならべた2つは、同じ幅・同じ高さになる） */
.lb-result-actions {
  container-type: inline-size; /* スマホ幅で、文字の大きさを この並びの幅から決める（下の cqi） */
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.lb-result-actions > button {
  white-space: nowrap;
}

/* 横いっぱいに置くボタン
   ・さいごのステージをクリアしたときの「⏱ とばさず どこまで？へ」「もう一度あそぶ」（長くて半分の幅に入らないため）
   ・失敗したときの「もう一度あそぶ」（ボタンが1つだけなので） */
.lb-result-actions__wide {
  grid-column: 1 / -1;
}

/* 2番目より下のボタン（白っぽい、ひかえめなボタン） */
.lb-sub {
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
  transition: transform 0.1s ease;
}

.lb-sub:hover {
  transform: translateY(-1px);
}

.lb-sub:focus-visible {
  outline: 3px solid #67e8f9;
  outline-offset: 2px;
}

/* 「はじめる」「次のステージへ」（secret-path.vue の .mg-play と同じ見た目） */
.mg-play {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  padding: 16px 24px;
  border: 2px solid #e8b23c;
  border-bottom-width: 4px;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
  box-shadow:
    0 4px 12px rgb(0 0 0 / 30%),
    inset 0 0 0 100px rgb(103 232 249 / 12%);
  color: #4a3208;
  font-family: inherit;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.5;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.mg-play::before {
  position: absolute;
  top: 50%;
  left: 14px;
  color: #4a3208;
  content: '▶';
  font-size: 13px;
  line-height: 1;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 0.15s ease;
}

.mg-play:hover::before,
.mg-play:focus::before {
  opacity: 1;
}

.mg-play::after {
  position: absolute;
  inset: -2px -2px -4px;
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 2px rgb(103 232 249 / 85%),
    0 0 0 2px rgb(103 232 249 / 75%);
  content: '';
  pointer-events: none;
  animation: command-selected-glow 1.4s ease-in-out infinite;
}

.mg-play:hover {
  transform: translateY(-2px);
}

.mg-play:active {
  border-bottom-width: 2px;
  box-shadow: none;
  transform: translateY(2px);
}

.mg-play:active::after {
  animation: none;
}

.mg-play:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 3px;
}

/* ===== スマホ幅 ===== */
@media (max-width: 700px) {
  .mg-stage {
    gap: 12px;
    padding: 12px 12px 16px;
  }

  /* 余白は、まん中（.lb-scroll）と下（.lb-footer）が持つ（上の .mg-stage の余白を 0 に戻す） */
  .lb-screen {
    gap: 0;
    padding: 0;
  }

  .lb-scroll {
    gap: 12px;
    padding: 12px 12px 16px;
  }

  .lb-footer {
    padding: 10px 12px 12px;
  }

  .place-card {
    padding: 18px 18px 18px 16px;
  }

  .place-card__title {
    font-size: 22px;
  }

  .mg-lead {
    font-size: 16px;
  }

  .mg-rules li {
    font-size: 15px;
  }

  /* ツールバー・左右のボタンを引いた残りをフィールドにする（結果の画面でも同じ高さ） */
  .lb-play-field {
    height: clamp(240px, calc(100dvh - 300px), 420px);
  }

  .lb-side {
    min-height: 68px;
    font-size: 17px;
  }

  /* ===== 結果の画面（遊んでいる最中と、画面の高さを変えない） =====
     ・結果のカード … フィールドの下のほう（地面のあたり）に重ねる。中の文字は少し小さく、すき間もつめる
     ・結果のボタン … 左右のボタンの枠（.lb-controls）と同じ高さの場所に置く
       98px ＝ 左右のボタン 68px ＋ 枠の padding 12px × 2 ＋ ふち 3px × 2 */
  .lb-result {
    position: absolute;
    right: 10px;
    bottom: 10px;
    left: 10px;
    z-index: 5;
    padding: 12px 14px 12px 12px;
    box-shadow: 0 6px 18px rgb(16 29 44 / 22%);
  }

  .lb-result .mg-text {
    font-size: 14px;
    line-height: 1.6;
  }

  .lb-result .lb-unlocked {
    margin-top: 8px;
    padding: 6px 12px;
    font-size: 14px;
  }

  .lb-result-actions {
    align-content: center;
    min-height: 98px;
  }

  /* さいごのステージをクリアしたとき（横いっぱいのボタンを2つ、たてにならべる）も 98px に収める */
  .lb-result-actions--stacked {
    gap: 8px;
  }

  .lb-result-actions--stacked > .mg-play {
    padding-top: 7px;
    padding-bottom: 7px;
  }

  .lb-result-actions--stacked > .lb-sub {
    padding-top: 5px;
    padding-bottom: 5px;
  }
}

/* 背の低いスマホ：説明が画面に収まるよう、すき間と文字を少しつめる */
@media (max-width: 700px) and (max-height: 700px) {
  .place-card {
    padding: 14px;
  }

  .mg-lead {
    margin-top: 8px;
    padding: 6px 12px;
    font-size: 15px;
    line-height: 1.5;
  }

  .mg-rules {
    margin-top: 8px;
  }

  .mg-rules li {
    font-size: 14px;
    line-height: 1.55;
  }

  .lb-play-field {
    height: clamp(200px, calc(100dvh - 270px), 420px);
  }

  /* 結果の画面：重ねたカードがフィールドの半分ほどを おおうので、
     まん中の大きな文字（「クリア！」「とんでいっちゃった…」）を上へ寄せて、かくれないようにする */
  .lb-play-field--result :deep(.lb-cue) {
    top: 17%;
  }

  .mg-play {
    padding: 11px 20px;
  }

  /* ステージの説明は、えらんでいるものの高さにする（いちばん長い説明の高さに そろえない）
     どうせスクロールする画面なので、えらびなおしたときに高さが変わるより、よけいな すき間が無いほうを とる */
  .lb-summary--hidden {
    display: none;
  }
}

/* スマホ幅：説明（.mg-lead）を「枝をかたむけて、てんとうむしを」／「とばさないようにしよう！」の2行にする
   ・PC 用の改行をやめて、スマホ用の改行を使う
   ・長いほうの1行目（15文字）が入りきるよう、左右の余白を少しつめ、細い画面では文字を少し小さくする
     （幅 375px 以上は 15〜16px のまま。幅 320px（初代 iPhone SE）で 14px ほど）
   ※ 背の低いスマホの指定（上）より あとに書く（文字の大きさと余白を上書きするため） */
@media (max-width: 700px) {
  .mg-lead {
    padding-right: 8px;
    padding-left: 8px;
    font-size: min(16px, calc((100vw - 96px) / 15.4));
  }

  .mg-lead__break--pc {
    display: none;
  }

  .mg-lead__break--sp {
    display: revert;
  }

  /* 横にならべた結果のボタン（クリアしたときの「もう一度あそぶ」「次のステージへ」）は、1行に収まるよう、左右の余白をつめて、文字をボタンの幅に合わせる
     ボタン1つの中の幅 ＝ 並びの幅の半分 − 5px（すき間の半分）− 20px（余白とふち）
     どちらも7文字なので、7文字が入る大きさ（幅 375px 以上は 16px のまま。幅 320px（初代 iPhone SE）で 15.5px ほど）
     ・1行目 … cqi が使えない古いブラウザ向け（画面の幅から計算する）
     ・2行目 … 並びの幅から計算する（パソコンの細い窓でスクロールバーが出て、幅がせまくなっても はみ出さない） */
  .lb-result-actions > button:not(.lb-result-actions__wide) {
    padding-right: 8px;
    padding-left: 8px;
    font-size: min(16px, calc((50vw - 48px) / 7.2));
    font-size: min(16px, calc((50cqi - 25px) / 7.2));
  }

  /* 横にならべた金色のボタン（「次のステージへ」）には、▶（選択カーソル）を出さない
     半分の幅では文字に重なるため（ふちの水色の光で、選ばれていることは分かる） */
  .lb-result-actions > .mg-play:not(.lb-result-actions__wide)::before {
    display: none;
  }
}

/* 動きを減らす設定のときは、ボタンの動きも止める */
@media (prefers-reduced-motion: reduce) {
  .mg-play,
  .lb-stage,
  .lb-sub {
    transition-duration: 0.01ms;
  }

  .mg-play::after {
    animation: none;
  }
}
</style>
