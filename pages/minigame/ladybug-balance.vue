<script setup lang="ts">
/* ============================================================
   ミニゲーム「てんとう虫バランス」（/minigame/ladybug-balance）

   枝の上を勝手に歩くてんとう虫が、はしまで行って飛んでいかないように、左右のボタンで枝を傾けてバランスをとる
   ステージ制（ステージの中身は data/ladybugBalance.ts）。前のステージをクリアすると、次のステージが遊べる

   ■ 入口
     ミニゲームの一覧（pages/minigame/index.vue）から来る
     本編の「とつぜんのできごと」でテントウムシを見つけたら解放される（pages/index.vue の unlockMinigame('ladybug-balance')）
     まだ解放していないブラウザで直接開いたときは、遊べるようになる条件だけを出す

   ■ 保存するもの（utils/minigameStorage.ts の「自己ベスト」の場所を使う）
     { clearedStage: 3 } … ステージ3までクリアした（次はステージ4が遊べる）

   ■ ゲームの中身
     ・動き・操作 … composables/useLadybugBalanceGame.ts
     ・フィールドの絵 … components/minigame/LadybugBalanceField.vue
     このページが持つのは、はじまる前・結果の画面、ステージの開放、音
   ============================================================ */

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import LadybugBalanceField from '~/components/minigame/LadybugBalanceField.vue';
import MinigameLayout from '~/components/minigame/MinigameLayout.vue';
import { useAudio } from '~/composables/useAudio';
import { useLadybugBalanceGame } from '~/composables/useLadybugBalanceGame';
import type { LadybugBalanceSide } from '~/composables/useLadybugBalanceGame';
import { moveMinigameFocusByArrow } from '~/composables/useMinigameKeyboardNav';
import { ladybugBalanceStages } from '~/data/ladybugBalance';
import { minigames } from '~/data/minigames';
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

const {
  phase,
  stageIndex,
  stage,
  tilt,
  ladybugs,
  elapsed,
  windDir,
  windWarningDir,
  isLeftHeld,
  isRightHeld,
  countdownNumber,
  remainingMs,
  selectStage,
  startGame,
  canAcceptResultInput,
  pressPointer,
  releasePointer,
  handleGameKeydown,
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

    if (stageNumber > clearedStage.value) {
      clearedStage.value = stageNumber;
      saveMinigameBest(minigameId, { clearedStage: stageNumber });
    }
  },
  onFailed: () => {
    playTantrumSound();
  },
});

/* 遊んでいる・飛んでいく・結果のあいだは、フィールドを出す */
const isFieldVisible = computed(() => phase.value !== 'ready');

/* 「スタート！」を出すのは、始まってから 0.6秒だけ */
const isStartCueVisible = computed(() => phase.value === 'playing' && elapsed.value >= 0 && elapsed.value < 600);

/* 次のステージがあるか（いまのステージをクリアしたときだけ「次のステージへ」を出す） */
const hasNextStage = computed(() => stageIndex.value + 1 < stageCount);
const isAllCleared = computed(() => phase.value === 'cleared' && !hasNextStage.value);

/* はじまる前に出す、えらんだステージの説明（「てんとう虫 2ひき・10びょう・かぜ あり」） */
const stageSummary = computed(() => {
  const parts = [`🐞 てんとう虫 ${stage.value.ladybugCount}ひき`, `⏱ ${stage.value.seconds}びょう たえたらクリア`];

  if (stage.value.wind) {
    parts.push('💨 ときどき かぜが ふく');
  }

  return parts;
});

/* 結果の画面のひとこと */
const resultComment = computed(() => {
  if (phase.value === 'failed') {
    return 'てんとう虫が 枝のはしから 飛んでいっちゃった。もういちど ちょうせんしよう！';
  }

  if (isAllCleared.value) {
    return 'ぜんぶのステージをクリア！ こうちゃん、バランスの名人です！';
  }

  return 'てんとう虫は 枝の上で ごきげんです！';
});

/* ============================================================
   はじめる・もう一度・次のステージ
   ============================================================ */

/* えらんだステージで始める（はじまる前の「はじめる」） */
function play() {
  if (phase.value !== 'ready' || stageIndex.value >= playableStageCount.value) {
    return;
  }

  playDecisionSound();
  isNewStageUnlocked.value = false;
  startGame(stageIndex.value);

  /* BGM は開いたときから鳴らしているが、直接開いたときはまだ鳴らせていないので、ここで鳴らす（鳴っていれば、そのまま） */
  resumeParkBgm();
}

/* 結果の画面のボタン（終わってすぐは受けつけない → canAcceptResultInput()） */
function retry() {
  if (!canAcceptResultInput()) {
    return;
  }

  playDecisionSound();
  isNewStageUnlocked.value = false;
  startGame(stageIndex.value);
}

function goToNextStage() {
  if (!canAcceptResultInput() || !hasNextStage.value || stageIndex.value + 1 >= playableStageCount.value) {
    return;
  }

  playDecisionSound();
  isNewStageUnlocked.value = false;
  startGame(stageIndex.value + 1);
}

/* 「ステージをえらぶ」（はじまる前の画面へ戻る） */
async function backToStageSelect() {
  if (!canAcceptResultInput()) {
    return;
  }

  playDecisionSound();
  isNewStageUnlocked.value = false;
  selectStage(stageIndex.value);

  await focusFirstMainButton();
}

/* はじまる前の画面で、ステージのボタンを押したとき */
function chooseStage(index: number) {
  if (index >= playableStageCount.value || index === stageIndex.value) {
    return;
  }

  playDecisionSound();
  selectStage(index);
}

/* 左右のボタン（押しているあいだだけ傾ける） */
function handleSidePointerDown(event: PointerEvent, side: LadybugBalanceSide) {
  // 長押しで文字が選ばれたり、メニューが出たりしないように
  event.preventDefault();
  pressPointer(side);
}

/* ============================================================
   ページの移動
   ============================================================ */
let isLeavingPage = false;

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
   ・はじまる前・結果の画面 … 矢印キーでボタンを選ぶ（→ useMinigameKeyboardNav.ts）
     Enter / Space は、ボタンにフォーカスが無いときだけ「はじめる」
   ============================================================ */
const layoutRef = ref<InstanceType<typeof MinigameLayout> | null>(null);
const stageRef = ref<HTMLElement | null>(null);

/* 矢印キーで行き来するボタン（上から順。押せないボタンは入れない） */
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

    if (moveMinigameFocusByArrow(event, topRow, getMainButtons())) {
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

/* ============================================================
   解放されているか（secret-path.vue と同じ3つ）
   ============================================================ */
const unlockState = ref<'checking' | 'locked' | 'unlocked'>('checking');

onMounted(() => {
  restoreSoundSettings();

  unlockState.value = loadUnlockedMinigames().includes(minigameId) ? 'unlocked' : 'locked';

  // どこまでクリアしたか（こわれた記録は 0。ステージを減らしたときも、ある数までにする）
  clearedStage.value = Math.min(stageCount, Math.max(0, Math.floor(Number(loadMinigameBest(minigameId)?.clearedStage) || 0)));

  // まだクリアしていない いちばん前のステージを、えらんでおく（ぜんぶクリアしていたら最後のステージ）
  selectStage(Math.min(clearedStage.value, stageCount - 1));

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
    back-label="← ミニゲーム一覧へ"
    back-aria-label="ミニゲーム一覧へ戻る"
    centered
    :sound-enabled="soundEnabled"
    :sound-volume-percent="soundVolumePercent"
    @back="goToList"
    @toggle-sound="toggleSound"
    @volume-change="changeSoundVolume">
    <!-- 外枠（背景 ＋ 上部ツールバー）は、ミニゲームの一覧と同じ部品
         ※ このコメントを <MinigameLayout> の外に書かないこと
           開発中はコメントも残って、いちばん外の要素が2つになり、ページを移るときのフェードがこわれて画面がまっ暗になる -->

    <!-- まだ解放していないブラウザで、直接開いたとき -->
    <section v-if="unlockState === 'locked'" class="mg-stage">
      <article class="place-card">
        <h1 class="place-card__title">？？？</h1>
        <p class="mg-text">{{ minigameInfo.lockedHint }}</p>
        <p class="mg-text">ゲーム本編で見つけると、ここで遊べるようになります。</p>
      </article>
    </section>

    <section v-else-if="unlockState === 'unlocked'" ref="stageRef" class="mg-stage">
      <!-- はじまる前（遊びかたと、ステージえらび） -->
      <article v-if="phase === 'ready'" class="place-card">
        <h1 class="place-card__title">🐞 てんとう虫バランス</h1>

        <p class="mg-lead">
          枝をかたむけて、てんとう虫が
          <br />
          はしから飛んでいかないようにしよう！
        </p>

        <ul class="mg-rules">
          <li class="mg-for-pc">← → キー・ボタンを押しているあいだ、枝がかたむく</li>
          <li class="mg-for-touch">◀ ▶ ボタンを押しているあいだ、枝がかたむく</li>
          <li>てんとう虫は、高いほうへ のぼっていく</li>
          <li>はしまで行くと、飛んでいっちゃう！ 近づいた側を下げよう</li>
        </ul>

        <!-- ステージえらび（まだ遊べないステージは 🔒） -->
        <div class="lb-stages" role="group" aria-label="ステージをえらぶ">
          <button
            v-for="(_, index) in ladybugBalanceStages"
            :key="index"
            type="button"
            class="lb-stage lb-nav"
            :class="{ 'lb-stage--selected': index === stageIndex, 'lb-stage--cleared': index < clearedStage }"
            :disabled="index >= playableStageCount"
            :aria-pressed="index === stageIndex"
            :aria-label="index >= playableStageCount ? `ステージ${index + 1}（まだ遊べません）` : `ステージ${index + 1}${index < clearedStage ? '（クリアずみ）' : ''}`"
            @click="chooseStage(index)">
            <span v-if="index >= playableStageCount" aria-hidden="true">🔒</span>
            <template v-else>{{ index + 1 }}</template>
            <span v-if="index < clearedStage" class="lb-stage__check" aria-hidden="true">✓</span>
          </button>
        </div>

        <ul class="lb-summary">
          <li class="lb-summary__title">ステージ {{ stageIndex + 1 }}</li>
          <li v-for="part in stageSummary" :key="part">{{ part }}</li>
        </ul>
      </article>

      <!-- 遊んでいる最中・結果（フィールドは出したままにして、飛んでいく様子・クリアの様子を見せる） -->
      <LadybugBalanceField
        v-else
        class="lb-play-field"
        :class="{ 'lb-play-field--result': phase === 'cleared' || phase === 'failed' }"
        :phase="phase"
        :stage-number="stageIndex + 1"
        :tilt="tilt"
        :branch-length="stage.branchLength"
        :ladybugs="ladybugs"
        :remaining-ms="remainingMs"
        :total-ms="stage.seconds * 1000"
        :countdown-number="countdownNumber"
        :is-start-cue-visible="isStartCueVisible"
        :wind-dir="windDir"
        :wind-warning-dir="windWarningDir" />

      <!-- 左右のボタン（遊んでいる最中・飛んでいくあいだ） -->
      <nav v-if="phase === 'playing' || phase === 'flyaway'" class="mg-command lb-controls" aria-label="枝をかたむける">
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

      <!-- 結果（クリア ／ おしまい） -->
      <article v-else-if="phase === 'cleared' || phase === 'failed'" class="place-card lb-result" aria-live="polite">
        <p class="place-card__flash" :class="{ 'lb-result__flash--failed': phase === 'failed' }">
          {{ phase === 'cleared' ? `ステージ ${stageIndex + 1} クリア！` : 'ざんねん…' }}
        </p>
        <p class="mg-text">{{ resultComment }}</p>
        <p v-if="isNewStageUnlocked" class="lb-unlocked">🔓 ステージ {{ stageIndex + 2 }} が あそべるようになった！</p>
      </article>

      <!-- 「はじめる」（はじまる前） -->
      <button v-if="phase === 'ready'" type="button" class="mg-play lb-nav lb-nav--primary" :disabled="stageIndex >= playableStageCount" @click="play">はじめる</button>

      <!-- 結果の画面のボタン -->
      <div v-else-if="phase === 'cleared' || phase === 'failed'" class="lb-result-actions">
        <button v-if="phase === 'cleared' && hasNextStage" type="button" class="mg-play lb-nav lb-nav--primary" @click="goToNextStage">次のステージへ</button>
        <button type="button" class="lb-nav" :class="phase === 'cleared' && hasNextStage ? 'lb-sub' : 'mg-play lb-nav--primary'" @click="retry">もう一度あそぶ</button>
        <button type="button" class="lb-sub lb-nav" @click="backToStageSelect">ステージをえらぶ</button>
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
.lb-stages {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0 0;
}

.lb-stage {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
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

/* えらんだステージの説明 */
.lb-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 12px 0 0;
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

/* ===== フィールドの高さ（画面の高さに合わせる） ===== */
.lb-play-field {
  height: clamp(260px, calc(100dvh - 400px), 440px);
  transition: height 0.3s ease;
}

/* 結果の画面では、下に出す説明とボタンが画面に収まるよう、フィールドを低くする */
.lb-play-field--result {
  height: clamp(200px, calc(100dvh - 560px), 340px);
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

.lb-result-actions {
  display: grid;
  gap: 10px;
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

  /* ツールバー・左右のボタンを引いた残りをフィールドにする */
  .lb-play-field {
    height: clamp(240px, calc(100dvh - 300px), 420px);
  }

  .lb-play-field--result {
    height: clamp(180px, calc(100dvh - 540px), 320px);
  }

  .lb-side {
    min-height: 68px;
    font-size: 17px;
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

  .lb-play-field--result {
    height: 180px;
  }

  .mg-play {
    padding: 11px 20px;
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
