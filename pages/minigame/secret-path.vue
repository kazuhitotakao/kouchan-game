<script setup lang="ts">
/* ============================================================
   ミニゲーム「どこまで行ける？」（/minigame/secret-path）

   ゲーム本編の「秘密の小道」を、エンドレスでくり返し遊べるページ
   ・枝に secretPathEndlessLives 回当たるまで続き、進んだ距離でレベルが上がって速くなる
   ・記録は「進んだ距離」と「集めたこもれびの数」。それぞれの自己ベストをこのブラウザに残す

   ■ ご褒美（うた入りの「こもれびの奥で」）
     1回のプレイで 300m（secretVocalSongUnlockDistance）まで行くと、サウンドトラックで聴けるようになる
     まだ解放していないうちは「🔒 300m まで行くと…」のヒントを出す（出さないと、ご褒美があること自体に気づけないため）

   ■ 入口
     ミニゲームの一覧（pages/minigame/index.vue）から来る。本編で秘密の小道をぬけたら解放される
     まだ解放していないブラウザで直接開いたときは、遊べるようになる条件だけを出す

   ■ ゲームの中身は、本編の小道と同じもの
     ・動き・操作 … useSecretPathGame.ts（mode: 'endless'）、カード … SecretPathField.vue、音 … useAudio.ts
     このページが持つのは、はじまる前・結果の画面と、自己ベストの読み書きだけ
     本編の状態は、このページだけの入れものを渡すので、さわらない
   ============================================================ */

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import SecretPathField from '~/components/game/SecretPathField.vue';
import SecretPathIcon from '~/components/game/SecretPathIcon.vue';
import MinigameLayout from '~/components/minigame/MinigameLayout.vue';
import { useAudio } from '~/composables/useAudio';
import { moveMinigameFocusByArrow } from '~/composables/useMinigameKeyboardNav';
import { useMinigamePause } from '~/composables/useMinigamePause';
import { useSecretPathGame } from '~/composables/useSecretPathGame';
import { minigames } from '~/data/minigames';
import type { MinigameId } from '~/data/minigames';
import { secretPathBoostMultiplier } from '~/data/secretPath';
import {
  secretPathEndlessBgmTempo,
  secretPathEndlessBoostComboTiers,
  secretPathEndlessLevelMeters,
  secretPathEndlessLives,
  secretPathEndlessMetersPerField,
  secretPathEndlessSunlightBonusMeters,
} from '~/data/secretPathEndless';
import type { GameEvent, StatusChanges } from '~/types/game';
import { loadMinigameBest, loadUnlockedMinigames, saveMinigameBest } from '~/utils/minigameStorage';
import {
  judgeSecretVocalSongUnlock,
  loadHasUnlockedSecretVocalSong,
  saveSecretVocalSongUnlocked,
  secretVocalSongTitle,
  secretVocalSongUnlockDistance,
} from '~/utils/secretVocalSong';

// 絵の先読みと、中の絵が表示できるようになってから箱ごと出す目印（→ utils/imagePreload.ts）
import { preloadSecretPathImages, vRevealWithImages } from '~/utils/imagePreload';

/* このミニゲームの id（URL の /minigame/secret-path と、保存場所の名前に使う）と、一覧の情報（data/minigames.ts） */
const minigameId: MinigameId = 'secret-path';
const minigameInfo = minigames.find((minigame) => minigame.id === minigameId)!;

/* このミニゲームの自己ベスト（距離（m）とこもれびの数は、別々のプレイの記録でもよい） */
type SecretPathBest = {
  distance: number;
  sunlight: number;
};

/* ============================================================
   useAudio() / useSecretPathGame() に渡す、このページだけの入れもの

   ・currentEvent（ゲームに渡すほう）… 'secretPath' のまま（小道で遊んでいる、の目印）
   ・audioScene（音に渡すほう）… 曲の場面（はじまる前・遊んでいる最中は 'secretSpot'、結果の画面は 'gameOver'）
     useAudio() は、これを見て「いま鳴らしてよい曲」を決める（ゲームの動きとは別の入れもの）
   ・outingPoint など … endless では読み書きされないが、型をそろえるために渡している
   ============================================================ */
const titleEntered = ref(true);
const gameStarted = ref(true);
const currentEvent = ref<GameEvent>('secretPath');
const audioScene = ref<GameEvent>('secretSpot');
const selectedCommandIndex = ref(0);

const {
  soundEnabled,
  soundVolumePercent,
  toggleSound,
  changeSoundVolume,
  playDecisionSound,
  playItemSound,
  playSunlightSound,
  playBranchBumpSound,
  playCountdownSound,
  playCountdownStartSound,
  playBoostSound,
  playSecretBgmSoon,
  stopSecretBgm,
  resumeSecretBgm,
  setSecretBgmPlaybackRate,
  playGameOverBgmSoon,
  stopGameOverBgm,
  restoreSoundSettings,
  cleanupAudio,
} = useAudio({
  titleEntered,
  gameStarted,
  currentEvent: audioScene,
  isTantrum: ref(false),
  isResultScene: computed(() => false),
  currentMinutes: computed(() => 0),
  endingRank: ref(''),
});

const {
  secretPathPhase,
  secretPathPlayerLane,
  secretPathItems,
  secretPathSunlightCount,
  secretPathBumpId,
  secretPathSparkleId,
  secretPathLives,
  secretPathDistance,
  secretPathComboMultiplier,
  secretPathBoostTotalMultiplier,
  secretPathNextBoostMultiplier,
  secretPathComboProgress,
  secretPathSunlightBonusMeters,
  secretPathLevel,
  isSecretPathPlaying,
  isSecretPathBoosting,
  secretPathCountdownNumber,
  isSecretPathStartCueVisible,
  isSecretPathBumped,
  isSecretPathSparkling,
  secretPathFlashLane,
  secretPathHoverDestination,
  startSecretPathGame,
  restartSecretPathGame,
  resetSecretPathGame,
  canPauseSecretPath,
  isSecretPathCountingDown,
  pauseSecretPathGame,
  resumeSecretPathGame,
  handleSecretPathKeydown,
  handleSecretPathPointerDown,
  handleSecretPathPointerMove,
  handleSecretPathPointerUp,
  handleSecretPathPointerCancel,
  handleSecretPathPointerLeave,
} = useSecretPathGame({
  mode: 'endless',
  gameStarted,
  currentEvent,
  outingPoint: ref(0),
  hasDiscoveredSecretSpot: ref(false),
  statusChanges: ref<StatusChanges | null>(null),
  selectedCommandIndex,
  goToPlace: () => {},
  restoreEntranceCursor: () => {},
  playDecisionSound,
  playItemSound,
  playSunlightSound,
  playBranchBumpSound,
  playCountdownSound,
  playCountdownStartSound,
});

/* ============================================================
   一時停止（とばないで！ と共通 → composables/useMinigamePause.ts）
   「やめる」は、はじまる前の画面へ戻す（記録は残さない）
   ============================================================ */
const { pauseState, pauseByButton, resume, quit, handlePauseKeydown } = useMinigamePause({
  canPause: canPauseSecretPath,
  isCountingDown: isSecretPathCountingDown,
  pauseGame: pauseSecretPathGame,
  resumeGame: resumeSecretPathGame,
  quitGame: quitToReady,
  playDecisionSound,
});

/* 一時停止の「やめる」
   ご褒美を解放したときの知らせは、次のプレイの結果には持ちこさない（解放そのものは、そのまま残る。「もう一回」と同じ） */
function quitToReady() {
  resetSecretPathGame();
  hideCommandNotice();
  isNewlyUnlockedSecretVocalSong.value = false;
  focusPlayButton();
}

/* ============================================================
   解放されているか

   checking … まだ調べていない（onMounted の前。先に「まだ遊べません」が一瞬見えないよう、中身を出さない）
   locked   … まだ こもれびの広場を見つけていない
   unlocked … 遊べる
   ============================================================ */
const unlockState = ref<'checking' | 'locked' | 'unlocked'>('checking');

/* ============================================================
   自己ベストと、いま終わったプレイの記録
   ============================================================ */
const best = ref<SecretPathBest>({ distance: 0, sunlight: 0 });

/* いま終わったプレイで、自己ベストを更新したか（結果の画面の「じこベスト！」に使う） */
const isNewDistanceBest = ref(false);
const isNewSunlightBest = ref(false);

/* ご褒美を、このブラウザで解放してあるか（onMounted で localStorage から読む） */
const hasUnlockedSecretVocalSong = ref(false);

/* このプレイで、はじめて解放したか（結果の画面で「解放しました」と伝えるためだけに使う） */
const isNewlyUnlockedSecretVocalSong = ref(false);

/* 画面に出す距離（メートル。小数は切り捨てる） */
const distanceMeters = computed(() => Math.floor(secretPathDistance.value));

/* こもれびを取ったときに、こうちゃんの上に出す文字
   本編は「+1」だが、こちらは距離のボーナスが付くので「+5m」（数が増えたことは HUD で分かる） */
const sparkleLabel = `+${secretPathEndlessSunlightBonusMeters}m`;

/* はじまる前のルールに出す、加速コンボの倍率のならび（「×3 → ×4 → ×6」）
   出すのは「ふだんの何倍か（合計）」なので、加速そのものの ×2 を掛けている */
const comboLadderText = secretPathEndlessBoostComboTiers.map((tier) => `×${tier.multiplier * secretPathBoostMultiplier}`).join(' → ');

/* ============================================================
   遊んでいる最中の、自己ベストとのくらべっこ
   （best は終わったときにだけ書きかわる。まだ自己ベストが無いときは、くらべない）
   ============================================================ */

/* 進んだ距離・集めたこもれびが、自己ベストをこえているか */
const isBeatingDistanceBest = computed(() => best.value.distance > 0 && distanceMeters.value > best.value.distance);
const isBeatingSunlightBest = computed(() => best.value.sunlight > 0 && secretPathSunlightCount.value > best.value.sunlight);

/* 距離の自己ベストをこえた瞬間だけ（1回のプレイで1回）、キラリン♪ と「🎉 じこベスト更新！」 */
watch(isBeatingDistanceBest, (isBeating) => {
  if (isBeating && isSecretPathPlaying.value) {
    playItemSound();
    showCommandNotice('record', '🎉 じこベスト更新！');
  }
});

/* ご褒美にとどいた瞬間（プレイは止めずに保存し、くわしくは結果の画面で伝える）
   音は「ピーン♪」と「キラリン♪」を重ねる（ここだけの、いちばん華やかな鳴らしかた）
   2回目からは 'alreadyUnlocked' になるので、知らせは1回だけ */
watch(distanceMeters, (meters) => {
  if (!isSecretPathPlaying.value) {
    return;
  }

  if (judgeSecretVocalSongUnlock(meters, hasUnlockedSecretVocalSong.value) !== 'newlyUnlocked') {
    return;
  }

  hasUnlockedSecretVocalSong.value = true;
  isNewlyUnlockedSecretVocalSong.value = true;
  saveSecretVocalSongUnlocked();

  playCountdownStartSound();
  playItemSound();
  showCommandNotice('unlock', '🎁 うた入りの曲を 見つけた！');
});

/* はやく進みはじめた瞬間に、風を切る「ヒュッ」を鳴らす（見た目の風の跡は SecretPathField.vue） */
watch(isSecretPathBoosting, (isBoosting, wasBoosting) => {
  if (isBoosting && !wasBoosting && isSecretPathPlaying.value) {
    playBoostSound();
  }
});

/* 加速コンボの倍率が変わった瞬間の知らせ
   ・上がった … 「ピーン♪」と「⏩ きょり ×3！」（出すのは合計の倍率）
   ・下がった … 倍率が付いていたときだけ「⏩ コンボが きれた…」
     （出さないと、記録の伸びが遅くなった理由が分からないため。付いていなかったときは、やめるたびに出てしまうので出さない） */
watch(secretPathComboMultiplier, (multiplier, previousMultiplier) => {
  if (!isSecretPathPlaying.value) {
    return;
  }

  if (multiplier > previousMultiplier) {
    playCountdownStartSound();
    showCommandNotice('combo-up', `⏩ きょり ×${secretPathBoostMultiplier * multiplier}！`);
    return;
  }

  if (previousMultiplier > 1) {
    showCommandNotice('combo-end', '⏩ コンボが きれた…');
  }
});

/* 下の紺色の枠に重ねて出す、ひとことの知らせ（遊んでいる最中だけ）
   フィールドの上に出すと、枝が流れてくる所にかぶさって見づらいので、フィールドの外に出す
   続けて起きたときは、あとから起きたほうだけ（id が変わるたびに、ぽんっと出なおす） */
type CommandNotice = {
  id: number;
  kind: 'levelup' | 'record' | 'combo-up' | 'combo-end' | 'unlock';
  text: string;
};

const commandNoticeDuration = 1600;
const commandNotice = ref<CommandNotice | null>(null);
let commandNoticeId = 0;
let commandNoticeTimer: ReturnType<typeof setTimeout> | null = null;

function showCommandNotice(kind: CommandNotice['kind'], text: string) {
  commandNoticeId += 1;
  commandNotice.value = { id: commandNoticeId, kind, text };

  if (commandNoticeTimer !== null) {
    clearTimeout(commandNoticeTimer);
  }

  commandNoticeTimer = setTimeout(hideCommandNotice, commandNoticeDuration);
}

function hideCommandNotice() {
  if (commandNoticeTimer !== null) {
    clearTimeout(commandNoticeTimer);
    commandNoticeTimer = null;
  }

  commandNotice.value = null;
}

/* レベルが上がった瞬間の知らせ（「⏫ スピードアップ！ Lv.3」）
   音は「ピピッ」（ほかの知らせの音と聞き分けられるように） */
watch(secretPathLevel, (level, previousLevel) => {
  if (level <= previousLevel || !isSecretPathPlaying.value) {
    return;
  }

  playCountdownSound();
  playCountdownSound(0.1);

  showCommandNotice('levelup', `⏫ スピードアップ！ Lv.${level}`);
});

/* 結果の画面に出す、ひとこと（進んだ距離で変える） */
const resultComment = computed(() => {
  if (distanceMeters.value >= 300) {
    return '森のずっと奥まで来ました！ こうちゃん、小道の名人です！';
  }

  if (distanceMeters.value >= 150) {
    return 'すごい！ 木々のあいだを、ぐんぐん進みました！';
  }

  if (distanceMeters.value >= 50) {
    return 'いい調子！ 次はもっと奥まで行けそうです。';
  }

  return 'まだまだこれから！ 枝をよく見て進もう。';
});

/* 終わったら、自己ベストをくらべて、更新していたら保存する（距離とこもれびは別々） */
watch(secretPathPhase, (phase) => {
  if (phase !== 'finished') {
    return;
  }

  isNewDistanceBest.value = distanceMeters.value > best.value.distance;
  isNewSunlightBest.value = secretPathSunlightCount.value > best.value.sunlight;

  if (!isNewDistanceBest.value && !isNewSunlightBest.value) {
    return;
  }

  best.value = {
    distance: Math.max(best.value.distance, distanceMeters.value),
    sunlight: Math.max(best.value.sunlight, secretPathSunlightCount.value),
  };
  saveMinigameBest(minigameId, best.value);

  // 自己ベストを更新したときだけ、キラリン♪
  playItemSound();
});

/* ============================================================
   はじめる・もう一回・もどる
   ============================================================ */

/* 「はじめる」「もう一回」のボタン（キーボードでフォーカスを当てるための目印） */
const playButtonRef = ref<HTMLButtonElement | null>(null);

/* 「はじめる」（はじまる前）／「もう一回」（結果の画面）
   ・はじめる … BGM はページを開いたときから鳴っているが、直接開いたときはまだ鳴らせていないので、ここで鳴らす
   ・もう一回 … GAME OVER の曲を止めて、「こもれびの奥で」を最初から鳴らしなおす */
function play() {
  if (secretPathPhase.value === 'finished') {
    /* 結果が出てすぐは受けつけないので、始まったときだけ曲を入れかえる */
    if (restartSecretPathGame()) {
      stopGameOverBgm();
      playSecretBgmSoon();

      // 前のプレイで解放したときの知らせは、次のプレイには持ちこさない（解放そのものは、そのまま残る）
      isNewlyUnlockedSecretVocalSong.value = false;
    }

    return;
  }

  startSecretPathGame();
  resumeSecretBgm();
}

/* ============================================================
   BGM

   ・はじまる前・遊んでいる最中 … こもれびの広場の曲「こもれびの奥で」（秘密の小道の先の曲なので、題材に合う）
   ・結果の画面                 … GAME OVER の曲（「おしまい」が分かるように）
   ・レベルが上がると、曲のテンポを少しずつ上げる（数字と、変えないときの理由は data/secretPathEndless.ts）
     ここは「いくつにしたいか」を渡すだけ。変えてよいかどうかは useAudio.ts が決める
   ============================================================ */

/* 場面が変わったら、音に渡す場面を切りかえて、結果の画面では GAME OVER の曲へ */
watch(secretPathPhase, (phase) => {
  audioScene.value = phase === 'finished' ? 'gameOver' : 'secretSpot';

  if (phase === 'finished') {
    stopSecretBgm();
    playGameOverBgmSoon();
  }
});

/* 遊んでいる最中の、曲のテンポ（1 ＝ ふつう）
   レベルが上がるごとに perLevel ずつ（maxLevelRate まで） */
const bgmPlaybackRate = computed(() => {
  if (!isSecretPathPlaying.value) {
    return 1;
  }

  return Math.min(secretPathEndlessBgmTempo.maxLevelRate, 1 + secretPathEndlessBgmTempo.perLevel * (secretPathLevel.value - 1));
});

watch(bgmPlaybackRate, (rate) => setSecretBgmPlaybackRate(rate), { immediate: true });

/* もうページを移動しはじめたか（連打よけ） */
let isLeavingPage = false;

/* 「← ミニゲーム一覧へ」（サウンドトラックのページの「はじめの画面へ戻る」と同じ手順） */
async function goToList() {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  /* ※ 決定音は鳴らさない（引き返すだけで、すぐページごと切りかわるため。ほかの「戻る」も同じ） */
  stopSecretBgm();
  stopGameOverBgm();

  await navigateTo('/minigame');
}

/* ============================================================
   キーボード

   ・遊んでいる最中 … 本編の小道と同じ
   ・はじまる前・結果の画面 … Enter / Space で「はじめる」「もう一回」
     （ほかのボタンにフォーカスがあるときは、そのボタンにまかせる）
     矢印キーでボタンを選べる（→ useMinigameKeyboardNav.ts）

   ※ 結果の画面では「もう一回」に自動でフォーカスを当てない
     Space を押しっぱなしで終わったとき、はなした瞬間に押されたことになってしまうため
     （かわりにここで受け取り、押しっぱなしの event.repeat は無視する。矢印キーも同じ）
   ============================================================ */
const layoutRef = ref<InstanceType<typeof MinigameLayout> | null>(null);

function handleKeydown(event: KeyboardEvent) {
  // 一時停止（Esc）と、止まっているあいだのキーは、ゲームの操作へ回さない
  if (handlePauseKeydown(event)) {
    return;
  }

  if (isSecretPathPlaying.value) {
    handleSecretPathKeydown(event);
    return;
  }

  // 矢印キー：ボタンを選ぶ（はじまる前・結果の画面・まだ解放していないページ）
  if (event.key.startsWith('Arrow')) {
    if (event.repeat) {
      event.preventDefault();
      return;
    }

    const topRow = [layoutRef.value?.backButton, layoutRef.value?.soundToggleButton];

    if (moveMinigameFocusByArrow(event, topRow, [playButtonRef.value])) {
      event.preventDefault();
    }

    return;
  }

  if (unlockState.value !== 'unlocked') {
    return;
  }

  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  const target = event.target as HTMLElement | null;

  if (target?.closest?.('button, input') && target !== playButtonRef.value) {
    return;
  }

  event.preventDefault();

  if (!event.repeat) {
    play();
  }
}

/* はじまる前の画面が出たら、「はじめる」へフォーカスを当てておく（Enter / Space ですぐ始められる） */
async function focusPlayButton() {
  await nextTick();
  playButtonRef.value?.focus();
}

onMounted(() => {
  // 前回のサウンドの設定（ON/OFFと音量）を思い出す（本編と同じ保存場所）
  restoreSoundSettings();

  // 絵を先読みしておく（こうちゃんの絵が、はじめて入れかわったときに一瞬消えないように）
  preloadSecretPathImages();

  unlockState.value = loadUnlockedMinigames().includes(minigameId) ? 'unlocked' : 'locked';

  // ご褒美（うた入りの「こもれびの奥で」）を、もう解放してあるか（→ utils/secretVocalSong.ts）
  hasUnlockedSecretVocalSong.value = loadHasUnlockedSecretVocalSong();

  // 保存してある自己ベストを、数に直して読む（まだ遊んでいない・こわれた記録は 0）
  const savedBest = loadMinigameBest(minigameId);

  best.value = {
    distance: Number(savedBest?.distance) || 0,
    sunlight: Number(savedBest?.sunlight) || 0,
  };

  window.addEventListener('keydown', handleKeydown);

  if (unlockState.value === 'unlocked') {
    focusPlayButton();

    /* BGM を、はじまる前の画面から鳴らしはじめる（直接開いたときは鳴らせないので、「はじめる」で鳴らす） */
    playSecretBgmSoon();
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);

  // 別のページへ移ったあともBGMが鳴り続けないように、音をぜんぶ片づける
  cleanupAudio();

  // 知らせを消す予約も取り消しておく
  if (commandNoticeTimer !== null) {
    clearTimeout(commandNoticeTimer);
  }
});
</script>

<template>
  <MinigameLayout
    ref="layoutRef"
    back-label="← ミニゲーム一覧へ"
    back-aria-label="ミニゲーム一覧へ戻る"
    centered
    :class="{ 'mg-fit': secretPathPhase === 'playing' }"
    :sound-enabled="soundEnabled"
    :sound-volume-percent="soundVolumePercent"
    :can-pause="canPauseSecretPath"
    :pause-state="pauseState"
    @back="goToList"
    @toggle-sound="toggleSound"
    @volume-change="changeSoundVolume"
    @pause="pauseByButton"
    @resume="resume"
    @quit="quit">
    <!-- 外枠（背景 ＋ 上部ツールバー）は、ミニゲームの一覧と同じ部品
         ※ このコメントを <MinigameLayout> の外に書かないこと
           開発中はコメントも残って、いちばん外の要素が2つになり、ページを移るときのフェードがこわれて画面がまっ暗になる -->

    <!-- まだ解放していないブラウザで、直接開いたとき（言いすぎず、「秘密の場所」があることだけを伝える） -->
    <section v-if="unlockState === 'locked'" class="mg-stage">
      <!-- ミニゲームの一覧の「？？？」のカードと同じ出しかた（名前は出さず、ヒントだけ） -->
      <article class="place-card place-card--secret">
        <h1 class="place-card__title">？？？</h1>
        <p class="mg-text">{{ minigameInfo.lockedHint }}</p>
        <p class="mg-text">ゲーム本編で見つけると、ここで遊べるようになります。</p>
      </article>
    </section>

    <section v-else-if="unlockState === 'unlocked'" class="mg-stage">
      <!-- はじまる前 -->
      <article v-if="secretPathPhase === 'ready'" v-reveal-with-images class="place-card place-card--secret">
        <!-- アイコンは一覧のカードと同じ絵（となりに名前があるので、読み上げでは読ませない）
             アイコンと名前を ひとまとまりにして、カードのまん中に置く（.mg-title） -->
        <h1 class="place-card__title mg-title">
          <img v-if="minigameInfo.iconImage" class="mg-title__icon" :src="minigameInfo.iconImage" alt="" decoding="async" />
          <span class="mg-title__text">どこまで行ける？</span>
        </h1>

        <!-- 言葉のかわりに置いた枝・こもれびの絵は、読み上げでその名前を読ませる（alt） -->
        <p class="mg-lead">
          <SecretPathIcon kind="branch" alt="枝" />をよけて <SecretPathIcon kind="sunlight" alt="こもれび" />をあつめながら
          <br />
          どこまでも進もう！
        </p>

        <!-- 遊びかた（1行目は操作。パソコン向けとスマホ向けを CSS で出し分ける） -->
        <ul class="mg-rules">
          <li class="mg-for-pc">
            <span class="mg-rules__part">← →・クリック：よける</span>
            <span class="mg-rules__part">↑・Space・長押し：加速</span>
          </li>
          <li class="mg-for-touch">
            <span class="mg-rules__part">タップ・フリック：よける</span>
            <span class="mg-rules__part">長押し：加速</span>
          </li>
          <li><SecretPathIcon kind="branch" alt="枝" />に{{ secretPathEndlessLives }}回当たると おしまい</li>
          <!-- こもれびのボーナス -->
          <li class="mg-rules__bonus"><SecretPathIcon kind="sunlight" alt="こもれび" /> 1つで きょりが +{{ secretPathEndlessSunlightBonusMeters }}m！</li>
          <!-- 加速コンボ（出すのは合計の倍率。HUD の札の数字とそろえてある） -->
          <li class="mg-rules__bonus">
            <span class="mg-rules__part">⏩ 加速中は きょり ×{{ secretPathBoostMultiplier }}！</span>
            <span class="mg-rules__part">当たらずに続けると {{ comboLadderText }}</span>
          </li>
          <li>⏫ {{ secretPathEndlessLevelMeters }}mごとに スピードアップ</li>
        </ul>

        <p v-if="best.distance > 0 || best.sunlight > 0" class="mg-best">
          じこベスト
          <span class="mg-best__item">🏁 {{ best.distance }}m</span>
          <span class="mg-best__item"><SecretPathIcon kind="sunlight" alt="こもれび" /> {{ best.sunlight }}</span>
        </p>

        <!-- ご褒美のヒント（まだ解放していないときだけ。何がもらえるかは言わず、めざす距離だけを伝える） -->
        <p v-if="!hasUnlockedSecretVocalSong" class="mg-reward mg-reward--locked">🔒 {{ secretVocalSongUnlockDistance }}m まで行くと、なにかあるみたい…</p>
      </article>

      <!-- 遊んでいる最中（本編の小道と同じ部品。HUD には残り時間のかわりに ❤ と距離を出す） -->
      <SecretPathField
        v-else-if="secretPathPhase === 'playing'"
        :player-lane="secretPathPlayerLane"
        :items="secretPathItems"
        :flash-lane="secretPathFlashLane"
        :hover-destination="secretPathHoverDestination"
        :countdown-number="secretPathCountdownNumber"
        :is-start-cue-visible="isSecretPathStartCueVisible"
        :is-bumped="isSecretPathBumped"
        bump-penalty="life"
        :bump-id="secretPathBumpId"
        :is-sparkling="isSecretPathSparkling"
        :sparkle-label="sparkleLabel"
        :sparkle-id="secretPathSparkleId"
        :sunlight-count="secretPathSunlightCount"
        :lives="secretPathLives"
        :max-lives="secretPathEndlessLives"
        :distance="secretPathDistance"
        :is-distance-record="isBeatingDistanceBest"
        :is-sunlight-record="isBeatingSunlightBest"
        :best-distance="best.distance"
        :best-sunlight="best.sunlight"
        :meters-per-field="secretPathEndlessMetersPerField"
        :boost-total-multiplier="secretPathBoostTotalMultiplier"
        :next-boost-multiplier="secretPathNextBoostMultiplier"
        :combo-progress="secretPathComboProgress"
        :level="secretPathLevel"
        :is-boosting="isSecretPathBoosting"
        @field-pointerdown="handleSecretPathPointerDown"
        @field-pointermove="handleSecretPathPointerMove"
        @field-pointerup="handleSecretPathPointerUp"
        @field-pointercancel="handleSecretPathPointerCancel"
        @field-pointerleave="handleSecretPathPointerLeave" />

      <!-- 結果 -->
      <article v-else class="place-card place-card--secret">
        <p class="place-card__flash">ここまで来た！</p>

        <!-- 結果の記録
             絵文字・絵は「旗」などと読まれてしまうので読み上げでは隠し、となりの言葉で伝える -->
        <p class="mg-result">
          <span class="mg-result__item">
            <span class="mg-result__icon" aria-hidden="true">🏁</span>
            <span class="mg-result__label">きょり</span>
            <b class="mg-result__value">{{ distanceMeters }}</b>
            <span class="mg-result__unit">m</span>
            <!-- とどいたレベル（「Lv.4 まで」） -->
            <span class="mg-result__level">Lv.{{ secretPathLevel }}</span>
            <span v-if="isNewDistanceBest" class="mg-result__new">じこベスト！</span>
          </span>
          <span class="mg-result__item">
            <span class="mg-result__icon" aria-hidden="true"><SecretPathIcon kind="sunlight" /></span>
            <span class="mg-result__label">こもれび</span>
            <b class="mg-result__value">{{ secretPathSunlightCount }}</b>
            <span class="mg-result__unit">こ</span>
            <!-- こもれびぶんの距離ボーナス（上の「きょり」にふくまれている。1つも取れなかったときは出さない） -->
            <span v-if="secretPathSunlightBonusMeters > 0" class="mg-result__bonus">🏁 +{{ secretPathSunlightBonusMeters }}m</span>
            <span v-if="isNewSunlightBest" class="mg-result__new">じこベスト！</span>
          </span>
        </p>

        <p class="mg-text">{{ resultComment }}</p>

        <!-- ご褒美
             ・このプレイで解放した … 曲の名前と、どこで聴けるかを伝える（遊んでいる最中の知らせはすぐ消えるため）
             ・まだ解放していない … はじまる前と同じヒント（もう解放してあるときは何も出さない） -->
        <p v-if="isNewlyUnlockedSecretVocalSong" class="mg-reward mg-reward--new">
          🎁 「{{ secretVocalSongTitle }}」を 見つけた！
          <span class="mg-reward__note">サウンドトラックで 聴けるようになりました</span>
        </p>
        <p v-else-if="!hasUnlockedSecretVocalSong" class="mg-reward mg-reward--locked">🔒 {{ secretVocalSongUnlockDistance }}m まで行くと、なにかあるみたい…</p>

        <p class="mg-best">
          じこベスト
          <span class="mg-best__item">🏁 {{ best.distance }}m</span>
          <span class="mg-best__item"><SecretPathIcon kind="sunlight" alt="こもれび" /> {{ best.sunlight }}</span>
        </p>
      </article>

      <!-- 下の紺色の枠（遊んでいる最中だけ）。操作の案内（本編の小道と同じ） -->
      <nav v-if="secretPathPhase === 'playing'" class="mg-command">
        <!-- 知らせ（操作の案内の上に重ねるので、枠の大きさも位置も変わらない → showCommandNotice()） -->
        <p v-if="commandNotice !== null" :key="`notice-${commandNotice.id}`" class="mg-notice" :class="`mg-notice--${commandNotice.kind}`" aria-live="polite">
          {{ commandNotice.text }}
        </p>

        <p class="mg-guide mg-for-pc">
          <span class="mg-guide__item">← →・クリック：よける</span>
          <span class="mg-guide__item">↑・Space・長押し：加速</span>
        </p>
        <p class="mg-guide mg-for-touch">
          <span class="mg-guide__item">タップ・フリック：よける</span>
          <span class="mg-guide__item">長押し：加速</span>
        </p>
      </nav>

      <!-- 「はじめる」「もう一回」（はじめの画面の「はじめる」と同じ、金色のボタン） -->
      <button v-else ref="playButtonRef" type="button" class="mg-play" @click="play">
        {{ secretPathPhase === 'finished' ? 'もう一回' : 'はじめる' }}
      </button>
    </section>
  </MinigameLayout>
</template>

<style scoped>
/* ============================================================
   このページの中身の見た目（背景・色の名前・上部ツールバーは MinigameLayout.vue）
   ============================================================ */

/* ===== まんなかの列（カード ＋ 下の枠） ===== */
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

/* ===== カード（本編の場所カード・こもれびの広場の紫のカードと同じ見た目） ===== */
.place-card {
  box-sizing: border-box;
  padding: 22px 28px;
  border: 2px solid #dbe4ef;
  border-left: 8px solid var(--navy);
  border-radius: 14px;
  background: var(--paper);
  box-shadow: 0 4px 0 rgb(35 57 94 / 12%);
}

.place-card--secret {
  border-color: #e6dbfa;
  border-left-color: #8f6ad4;
  background: #f9f4ff;
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
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  animation: found-in 0.4s ease-out 0.15s backwards;
}

/* 遊んでいる最中のカード（SecretPathField.vue のいちばん外の要素） */
.mg-stage > .secret-path {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px 18px;
}

/* フィールドの高さ（広い画面）
   このページは枠の高さが中身で決まるので、そのままだとフィールドが いちばん低い高さまで縮んでしまう
   そこで画面の高さ − 410px（まわりの部品のぶん）にして、320〜560px におさめる
   （スマホ幅は下の .mg-fit。フィールドは子コンポーネントの中なので :deep() で指す） */
@media (min-width: 701px) {
  .mg-stage > .secret-path :deep(.secret-path-field) {
    flex: none;
    height: clamp(320px, calc(100vh - 410px), 560px);
    height: clamp(320px, calc(100dvh - 410px), 560px);
  }
}

.mg-text {
  margin: 0;
  font-size: 16px;
}

.mg-text + .mg-text {
  margin-top: 8px;
}

/* はじまる前の見出し（［アイコンの絵］どこまで行ける？）
   絵は文字の高さの2倍ほどにして、ゲームの顔として目立たせる
   絵のまわりの透明な余白は、1.12倍に広げて切り落とす（一覧のカードと同じしかけ） */
/* 見出し（アイコンと名前を ひとまとまりにして、カードのまん中に置く） */
.mg-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.mg-title__icon {
  flex: none;
  width: 2.1em;
  height: 2.1em;
  object-fit: contain;
  transform: scale(1.12);
  filter: drop-shadow(0 2px 3px rgb(87 56 158 / 22%));
}

/* はじまる前の「えだをよけながら どこまでも進もう！」（本編の .secret-path-lead と同じ見た目） */
.mg-lead {
  margin: 14px 0 0;
  padding: 10px 16px;
  border-radius: 12px;
  background: #fff;
  box-shadow: inset 0 0 0 2px #e6dbfa;
  color: #6b4fb0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.6;
  text-align: center;
}

/* 遊びかたの箇条書き（本編の .secret-path-rules と同じ見た目） */
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

/* 説明のひと組は途中で折り返さず、入りきらないときは組の切れ目で次の行へ送る */
.mg-rules__part {
  display: inline-block;
  margin-right: 1em;
}

/* こもれびのボーナスと加速コンボの説明は、記録が伸びるコツなので、金色の文字で目立たせる */
.mg-rules__bonus {
  color: #8a5a00;
  font-weight: 700;
}

/* パソコン向け（--pc）とスマホ向け（--touch）の説明の出し分け（本編の小道と同じ） */
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

/* 自己ベスト（はじまる前・結果の画面） */
.mg-best {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin: 14px 0 0;
  color: #7a5410;
  font-size: 14px;
  font-weight: 700;
}

.mg-best__item {
  padding: 2px 12px;
  border-radius: 999px;
  background: #fff6e0;
  box-shadow: inset 0 0 0 1px #f5e2be;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ご褒美の行（こもれびの広場のカードと同じ紫の系統）
   ・--locked … まだ解放していない。ひかえめに置く
   ・--new    … このプレイで解放した。めったに出ない知らせなので、いちばん目立たせる */
.mg-reward {
  box-sizing: border-box;
  margin: 12px 0 0;
  padding: 8px 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.6;
}

.mg-reward--locked {
  background: #fff;
  box-shadow: inset 0 0 0 2px #e6dbfa;
  color: #7f6aa8;
}

.mg-reward--new {
  background: linear-gradient(180deg, #8f6ad4 0%, #7a54c4 100%);
  box-shadow: 0 4px 12px rgb(122 84 196 / 30%);
  color: #fff;
  font-size: 16px;
  animation: found-in 0.4s ease-out 0.2s backwards;
}

/* 「サウンドトラックで 聴けるようになりました」（曲名の下に、少し小さく） */
.mg-reward__note {
  display: block;
  margin-top: 2px;
  font-size: 14px;
  font-weight: 700;
  opacity: 0.92;
}

/* 結果（「🏁 きょり 123m Lv.4」）
   ぱっと読めるよう、何の記録か（小さく・うすく）→ 数（いちばん大きく）→ 単位や札（数より小さく）に分けている */
.mg-result {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  margin: 4px 0 12px;
  color: #6b4fb0;
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.mg-result__item {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}

/* 記録の絵と、何の記録かの言葉（数より小さく・うすくして、数字が先に目に入るように） */
.mg-result__icon {
  font-size: 22px;
}

.mg-result__label {
  color: #8471bd;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.mg-result__value {
  color: #57389e;
  font-size: 46px;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  animation: status-pop 0.35s ease-out;
}

/* 単位（「123」の m・「8」の こ）。数にくっつけて、数よりは小さく */
.mg-result__unit {
  margin-left: -2px;
  font-size: 17px;
  font-weight: 700;
}

/* とどいたレベル（「Lv.4」。距離のとなりに、紺色の小さな丸で） */
.mg-result__level {
  align-self: center;
  padding: 1px 9px;
  border-radius: 999px;
  background: var(--navy);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

/* こもれびぶんの距離ボーナス（「🏁 +40m」。.mg-result__level と同じ形・大きさ） */
.mg-result__bonus {
  align-self: center;
  padding: 1px 9px;
  border-radius: 999px;
  background: #fff6e0;
  box-shadow: inset 0 0 0 1px #f5e2be;
  color: #8a5a00;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* 自己ベストを更新したときの小さな印 */
.mg-result__new {
  align-self: center;
  padding: 1px 10px;
  border-radius: 999px;
  background: var(--gold);
  color: #4a3208;
  font-size: 12px;
  letter-spacing: 0.06em;
  animation: found-in 0.4s ease-out 0.3s backwards;
}

/* ===== 下の枠（本編のコマンド欄と同じ紺色の枠） ===== */
.mg-command {
  position: relative; /* 知らせ（.mg-notice）を、この枠いっぱいに重ねるための基準 */
  box-sizing: border-box;
  padding: 14px 16px;
  border: 3px solid #fff;
  border-radius: 14px;
  background: linear-gradient(180deg, #2e7d96 0%, #226981 100%);
  box-shadow: 0 6px 16px rgb(16 29 44 / 22%);
  text-align: center;
}

/* 下の枠に重ねて出す知らせ（枠の大きさは変えないので、まわりの位置はずれない）
   長さ 1.6秒は、script の commandNoticeDuration とそろえる */
.mg-notice {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  border-radius: 11px;
  color: #4a3208;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.04em;
  animation: mg-notice 1.6s ease-out forwards;
}

/* スピードアップ … 金色の板 */
.mg-notice--levelup {
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
}

/* じこベスト更新 … クリーム色の板を金色のふちでかこむ（スピードアップの板と見分けられるように） */
.mg-notice--record {
  background: linear-gradient(180deg, #fffaf0 0%, #fff0c4 100%);
  box-shadow:
    inset 0 0 0 3px var(--gold),
    0 0 14px 2px rgb(255 209 102 / 70%);
}

/* 加速コンボの倍率が上がった … HUD の札と同じ金色の板 */
.mg-notice--combo-up {
  background: linear-gradient(180deg, #ffe09a 0%, #ffca4d 100%);
}

/* ご褒美にとどいた … 紫の板（ほかの知らせと色から変えて、めったに出ないものだと分かるように） */
.mg-notice--unlock {
  background: linear-gradient(180deg, #f3e9ff 0%, #ddc9fa 100%);
  box-shadow:
    inset 0 0 0 3px #8f6ad4,
    0 0 14px 2px rgb(143 106 212 / 60%);
  color: #4a2f86;
}

/* 加速コンボが切れた … うすい灰色の板（「なくなった」ことを伝えるので、金色にはしない） */
.mg-notice--combo-end {
  background: linear-gradient(180deg, #eef1f4 0%, #d8dee4 100%);
  color: #4a5560;
}

@keyframes mg-notice {
  0% {
    opacity: 0;
    transform: scale(0.92);
  }

  12% {
    opacity: 1;
    transform: scale(1);
  }

  82% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

/* 操作の案内のひとまとまり（せまい画面では、まとまりの切れ目で折り返す。本編の .secret-path-guide__item と同じ） */
.mg-guide__item {
  display: inline-block;
  margin: 0 6px;
}

.mg-guide {
  margin: 0;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

/* 「はじめる」「もう一回」
   はじめの画面の「はじめる」（command.css の .cmd--start .cmd--single）と同じ見た目
   ※ command.css はこのページでは読みこまないので、同じ値をここに書いている */
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

/* 選択カーソル「▶」（選ばれているときだけ出す） */
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

/* ふちの水色の光（はじめの画面の .cmd--single::after と同じ。@keyframes command-selected-glow は keyframes.css） */
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

/* キーボードで選んでいるときは、金色どうしで見えなくならないよう紺色の太めのふち（はじめの画面と同じ） */
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

  /* scroll-margin-top … 遊びはじめにカードを画面の上へスクロールしたとき、上に少しすき間を残す */
  .mg-stage > .secret-path {
    padding: 12px 12px 14px;
    scroll-margin-top: 8px;
  }

  .mg-lead {
    font-size: 17px;
  }

  .mg-rules li {
    font-size: 15px;
  }

  /* 結果の記録は、数字を少し小さくし、入りきらない札は次の行へ回り込ませる（横にはみ出さないように） */
  .mg-result__item {
    flex-wrap: wrap;
    white-space: normal;
  }

  .mg-result__value {
    font-size: 40px;
  }

  .mg-result__icon {
    font-size: 20px;
  }

  .mg-result__label {
    font-size: 14px;
  }

  /* 操作の案内は1行に収める（2行になると、そのぶんフィールドが低くなるため） */
  .mg-command {
    padding: 10px 12px;
  }

  .mg-guide {
    font-size: 14.5px;
  }

  .mg-guide__item {
    margin: 0 4px;
  }

  .mg-notice {
    font-size: 18px;
  }

  /* ============================================================
     遊んでいる最中は、ページ全体を画面の高さに収める（スクロールしない）

     「画面の高さ − 決まった数」だと、ノッチなどでまわりの高さが変わったときにはみ出すので、
     ページ全体を画面の高さぴったりにして、入りきらないぶんはフィールドだけを縮める
     ・.mg-fit … 遊んでいる最中だけ、外枠（MinigameLayout.vue の .minigame）に付く
     ・外枠から遊ぶカードまで、「縮んでよい」（min-height: 0）をつないでいく
     ============================================================ */
  .mg-fit {
    height: 100vh;
    height: 100dvh;
  }

  .mg-fit :deep(.mg-frame),
  .mg-fit .mg-stage,
  .mg-fit .mg-stage > .secret-path {
    min-height: 0;
  }
}

/* 背の低いスマホ：遊びかたの説明が画面に収まるよう、すき間と文字を少しつめる */
@media (max-width: 700px) and (max-height: 700px) {
  .mg-stage {
    gap: 10px;
    padding: 10px 10px 12px;
  }

  .place-card {
    padding: 14px;
  }

  .place-card__title {
    margin-bottom: 6px;
    font-size: 20px;
  }

  .mg-lead {
    margin-top: 8px;
    padding: 6px 12px;
    font-size: 15.5px;
    line-height: 1.5;
  }

  .mg-rules {
    margin-top: 8px;
    gap: 2px;
  }

  .mg-rules li {
    font-size: 14px;
    line-height: 1.55;
  }

  .mg-best {
    margin-top: 10px;
  }

  .mg-play {
    padding: 11px 20px;
  }
}

/* 動きを減らす設定のときは、このページの演出も止める（見た目と配置は変わらない） */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  /* 知らせは、消える動きが一瞬で終わると見えなくなるので、動かさずに出しておく（1.6秒たつと消える） */
  .mg-notice {
    animation: none !important;
  }
}
</style>
