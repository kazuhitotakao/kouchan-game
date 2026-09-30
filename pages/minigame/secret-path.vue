<script setup lang="ts">
/* ============================================================
   ミニゲーム「どこまで行ける？」（/minigame/secret-path）

   ゲーム本編の「秘密の小道」を、エンドレスでくり返し遊べるページ
   ・枝に secretPathEndlessLives 回当たるまで続き、進んだ距離でレベルが上がって速くなる（上限なし）
   ・記録は「進んだ距離」と「集めたこもれびの数」。それぞれの自己ベストをこのブラウザに残す
     こもれびは、集めた数を数えるだけでなく、1つごとに進んだ距離のボーナスにもなる（→ data/secretPathEndless.ts）

   ■ ご褒美（うた入りの「こもれびの奥で」）
     1回のプレイで secretVocalSongUnlockDistance（300m。結果のひとことが「小道の名人です！」になるのと同じ距離）まで行くと、
     このミニゲームで ずっと流れている曲のうた入り版が、サウンドトラックで聴けるようになる
     （曲と解放の保存は utils/secretVocalSong.ts。聴くところは pages/soundtrack.vue）
     ・とどいた瞬間に、下の紺色の枠へ知らせを出して、そのまま保存する（プレイは止めない）
     ・まだ解放していないうちは、はじまる前と結果の画面に「🔒 300m まで行くと…」のヒントを出す
       （どこにも出しておかないと、そういうご褒美があること自体に気づけないため）

   ■ 入口
     起動画面（A画面）の「🌿 ミニゲーム」→ ミニゲームの一覧（pages/minigame/index.vue）→ このページ
     ゲーム本編で、秘密の小道をぬけたら解放される（→ pages/index.vue の unlockMinigame('secret-path')）
     まだ解放していないブラウザで、このページのアドレスを直接開いたときは、遊べるようになる条件をひとことだけ出す
     「← ミニゲーム一覧へ」で一覧へ戻る

   ■ ゲームの中身は、本編の小道と同じもの
     ・流れてくるもの・当たり判定・操作（キー・タップ・フリック・長押し）
       … composables/useSecretPathGame.ts を mode: 'endless' で使う
     ・遊んでいる最中のカード（HUD ＋ フィールド）… components/game/SecretPathField.vue
     ・効果音とBGM … composables/useAudio.ts（本編と同じ音。BGMは「こもれびの奥で」と GAME OVER の曲 → このファイルの「BGM」）
     このページが持つのは、はじまる前・結果の画面と、自己ベストの読み書きだけ

   ■ 本編の状態にはさわらない
     useSecretPathGame() と useAudio() は、本編のゲームの状態（いまの場面・おでかけポイントなど）を受け取る作り
     このページでは、それぞれ「小道で遊んでいる」ことを表す、このページだけの入れものを渡している
     （endless では、おでかけポイント・こもれびの広場などは読み書きされない）
   ============================================================ */

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import SecretPathField from '~/components/game/SecretPathField.vue';
import MinigameLayout from '~/components/minigame/MinigameLayout.vue';
import { useAudio } from '~/composables/useAudio';
import { moveMinigameFocusByArrow } from '~/composables/useMinigameKeyboardNav';
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

/* このミニゲームの id（URL の /minigame/secret-path と、保存場所の名前に使う）と、一覧の情報（data/minigames.ts） */
const minigameId: MinigameId = 'secret-path';
const minigameInfo = minigames.find((minigame) => minigame.id === minigameId)!;

/* このミニゲームの自己ベストの形
   distance … いちばん遠くまで行ったときの距離（メートル。切り捨てた整数）
   sunlight … いちばん多く集めたときのこもれびの数
   2つは別々に数える（遠くまで行ったプレイと、たくさん集めたプレイが、同じとは限らないため） */
type SecretPathBest = {
  distance: number;
  sunlight: number;
};

/* ============================================================
   useAudio() / useSecretPathGame() に渡す、このページだけの入れもの

   ・titleEntered / gameStarted … true のまま
   ・currentEvent（ゲームに渡すほう）… 'secretPath' のまま（小道で遊んでいる、の目印）
   ・audioScene（音に渡すほう）… どの曲の場面か
       はじまる前・遊んでいる最中 … 'secretSpot'（こもれびの広場の曲「こもれびの奥で」）
       結果の画面               … 'gameOver'（GAME OVER の曲）
     useAudio() は、この場面を見て「いま鳴らしてよい曲」を決める
     （少し待ってから鳴らす曲が、待っているあいだに場面が変わっていたら鳴らさない・
       サウンドを OFF から ON に戻したときに、その場面の曲の続きを鳴らす）
     ゲームに渡す currentEvent とは別の入れものにしてあるので、ゲームの動きには関係しない
     場面の切りかえは、下の watch(secretPathPhase) で行う
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
   解放されているか

   checking … まだ調べていない（サーバーで組み立てるとき・ブラウザで onMounted を通る前）
              localStorage はブラウザにしか無いので、このあいだは中身を出さない
              （先に「まだ遊べません」が一瞬見えてしまわないように）
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

/* ご褒美（うた入りの「こもれびの奥で」）を、このブラウザで解放してあるか
   はじめは false にしておいて、onMounted で localStorage から読みなおす
   （サーバー側では localStorage を読めないため。→ utils/secretVocalSong.ts） */
const hasUnlockedSecretVocalSong = ref(false);

/* いま遊んでいる（遊んでいた）プレイで、はじめて解放したか
   結果の画面で「解放しました」と伝えるためだけに使う（次に「もう一回」を押したら false に戻す） */
const isNewlyUnlockedSecretVocalSong = ref(false);

/* 画面に出す距離（メートル。小数は切り捨てる） */
const distanceMeters = computed(() => Math.floor(secretPathDistance.value));

/* こもれびを取ったときに、こうちゃんの上に出す文字
   本編の小道は「✨ +1」（集めた数が1つ増える）だが、こちらは進んだ距離のボーナスが付くので「✨ +5m」にする
   （数のほうは、HUD の「✨ こもれび 8」がぽんっと増えるので、そちらで分かる） */
const sparkleLabel = `✨ +${secretPathEndlessSunlightBonusMeters}m`;

/* はじまる前のルールに出す、加速コンボの倍率のならび（「×3 → ×4 → ×6」）

   data/secretPathEndless.ts の段をそのまま並べるので、段を増やしても書きかえなくてよい
   出すのは「ふだんの何倍か（合計）」なので、加速そのものの ×2 を掛けた数にしている
   （加速すると、ゲームの時計が2倍で進み、距離もその時計で数えているため
     → composables/useSecretPathGame.ts の secretPathBoostTotalMultiplier） */
const comboLadderText = secretPathEndlessBoostComboTiers.map((tier) => `×${tier.multiplier * secretPathBoostMultiplier}`).join(' → ');

/* ============================================================
   遊んでいる最中の、自己ベストとのくらべっこ

   ・まだ自己ベストが無い（はじめて遊ぶ）ときは、くらべない（何をこえても「更新中」にしない）
   ・best は、終わったときにだけ書きかわる（遊んでいる最中は、はじめる前の自己ベストのまま）
     なので、遊んでいる最中は「はじめる前の記録と、いまのプレイ」をくらべていることになる
   ============================================================ */

/* 進んだ距離・集めたこもれびが、自己ベストをこえているか */
const isBeatingDistanceBest = computed(() => best.value.distance > 0 && distanceMeters.value > best.value.distance);
const isBeatingSunlightBest = computed(() => best.value.sunlight > 0 && secretPathSunlightCount.value > best.value.sunlight);

/* 遊んでいる最中に、距離の自己ベストをこえた瞬間だけ、キラリン♪ と、下の紺色の枠に「🎉 じこベスト更新！」
   （1回のプレイで1回だけ。こえたあとは、終わるまで「更新中」のまま）
   文字は、フィールドの上に出すと枝が流れてくる所にかぶさって見づらいので、フィールドの外に出す（→ showCommandNotice()） */
watch(isBeatingDistanceBest, (isBeating) => {
  if (isBeating && isSecretPathPlaying.value) {
    playItemSound();
    showCommandNotice('record', '🎉 じこベスト更新！');
  }
});

/* ご褒美（うた入りの「こもれびの奥で」）にとどいた瞬間

   ・音   … 加速コンボの「ピーン♪」と、自己ベストの「キラリン♪」を重ねる（ここだけの、いちばん華やかな鳴らしかた）
   ・文字 … 下の紺色の枠に「🎁 うた入りの曲を 見つけた！」（→ showCommandNotice()）
   ・そのまま解放を保存する（プレイは止めない。曲の名前と、どこで聴けるかは、結果の画面で伝える）

   とどいたあとも距離は伸びつづけるが、judgeSecretVocalSongUnlock() が
   2回目からは 'alreadyUnlocked' を返すので、知らせは1回だけ出る */
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

/* はやく進みはじめた瞬間に、風を切る「ヒュッ」を鳴らす（やめたときは鳴らさない）
   見た目のほうの知らせ（こうちゃんの後ろの風の跡）は SecretPathField.vue が出す
   ※ カウントダウン中から押していたときは、「スタート！」と同時に鳴る（isSecretPathBoosting はスタートしてから true になるため） */
watch(isSecretPathBoosting, (isBoosting, wasBoosting) => {
  if (isBoosting && !wasBoosting && isSecretPathPlaying.value) {
    playBoostSound();
  }
});

/* 加速コンボの倍率が変わった瞬間の知らせ

   ■ 上がったとき（加速を続けて、次の段へ届いた）
     ・音   … カウントダウンの「スタート！」と同じ「ピーン♪」
     ・文字 … 下の紺色の枠に「⏩ きょり ×3！」（→ showCommandNotice()）
   ■ 下がったとき（枝に当たった・加速をやめた）
     倍率が付いていたときだけ「⏩ コンボが きれた…」と出す
     前は、なくなったことが音も文字もなく分からず、どうして記録の伸びが遅くなったのかが読めなかった
     （もともと倍率が付いていなかったときは、何も出さない。加速をやめるたびに出てしまうため）

   ※ 出す倍率は、コンボの倍率そのものではなく「ふだんの何倍か（合計）」
     加速しただけで すでに ×2 数えられているので、合計は ×3 → ×4 → ×6 になる
     （→ composables/useSecretPathGame.ts の secretPathBoostTotalMultiplier） */
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

   ・levelup    … レベルが上がった瞬間の「⏫ スピードアップ！ Lv.3」
   ・record     … 距離の自己ベストをこえた瞬間の「🎉 じこベスト更新！」
   ・combo-up   … 加速コンボの倍率が上がった瞬間の「⏩ きょり ×3！」
   ・combo-end  … 加速コンボが切れた瞬間の「⏩ コンボが きれた…」
   ・unlock     … ご褒美にとどいた瞬間の「🎁 うた入りの曲を 見つけた！」
   どれも、フィールドの上に出すと枝が流れてくる所にかぶさって見づらいので、フィールドの外に出す
   commandNoticeDuration のあいだ出して消す。続けて起きたときは、あとから起きたほうだけを出す
   id … 出しなおすための番号（変わるたびに、ぽんっと出なおす） */
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

  commandNoticeTimer = setTimeout(() => {
    commandNotice.value = null;
    commandNoticeTimer = null;
  }, commandNoticeDuration);
}

/* レベルが上がった瞬間の知らせ

   ・音 … カウントダウンの「ピッ」を2回つづけて鳴らす（「ピピッ」）
          加速コンボの「ピーン♪」・自己ベストの「キラリン♪」と聞き分けられるように、べつの鳴らしかたにしている
   ・文字 … 下の紺色の枠に「⏫ スピードアップ！ Lv.3」（→ showCommandNotice()）
          （HUD の距離の丸も、同じあいだ金色に光る → SecretPathField.vue） */
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

/* 終わったら、自己ベストをくらべて、更新していたら保存する
   距離とこもれびは別々にくらべる（片方だけ更新することもある） */
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

   BGM（→ 下の「BGM」）
   ・はじめる … ページを開いたときから「こもれびの奥で」が鳴っているので、そのまま続ける
                アドレスを直接開いたときは、ブラウザの決まりで まだ鳴らせていないので、ここで鳴らす
                （resumeSecretBgm() は、もう鳴っているときは何もしない）
   ・もう一回 … 結果の画面の GAME OVER の曲を止めて、「こもれびの奥で」を最初から鳴らしなおす */
function play() {
  if (secretPathPhase.value === 'finished') {
    restartSecretPathGame();

    // 「もう一回」は、押してすぐ（結果が出てから 0.6秒のあいだ）は受けつけないので、始まったときだけ曲を入れかえる
    if (secretPathPhase.value === 'playing') {
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

   ・はじまる前・遊んでいる最中 … こもれびの広場の曲「こもれびの奥で」
                                 （秘密の小道の先の曲なので、このミニゲームの題材に合う）
   ・結果の画面                 … GAME OVER の曲（「おしまい」が分かるように）
   ・遊んでいる最中は、レベルが上がると、曲のテンポを少しずつ上げる（音の高さは変えない）
     速さの数字は data/secretPathEndless.ts の secretPathEndlessBgmTempo
     はやく進んでいるあいだは、曲の速さを変えない（理由は data/secretPathEndless.ts）
     iPhone・iPad では、レベルが上がっても速さを変えない（同じく、理由は data/secretPathEndless.ts）
     ※ ここは「いくつにしたいか」を渡すだけ。変えてよいかどうかは composables/useAudio.ts が決める
   ============================================================ */

/* 場面が変わったら、音に渡す場面を切りかえて、曲を入れかえる
   （はじまる前 → 遊んでいる最中は、同じ曲のまま。結果の画面になったら GAME OVER の曲へ） */
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

  /* ※ 決定音は鳴らさない
     引き返すだけのボタンで、このあとすぐページごと切りかわるため
     （遊んでいる最中でも、はじまる前・結果の画面でも、このボタンは同じここを通る）
     ゲーム本編の「戻る」・ミニゲーム一覧の「戻る」も同じ */
  stopSecretBgm();
  stopGameOverBgm();

  await navigateTo('/minigame');
}

/* ============================================================
   キーボード

   ・遊んでいる最中 … 本編の小道と同じ（← → / A D で移動、↑ / Space 長押しで はやく進む）
   ・はじまる前・結果の画面 … Enter / Space で「はじめる」「もう一回」
     （ほかのボタン（戻る・サウンド）にフォーカスがあるときは、そのボタンの操作にまかせる）
     矢印キーでボタンを選べる（はじめの画面・ミニゲームの一覧と同じ動き → composables/useMinigameKeyboardNav.ts）
     ・↑ ↓ … 「はじめる」「もう一回」⇔ 上の行の「← ミニゲーム一覧へ」
     ・← → … 上の行の「← ミニゲーム一覧へ」⇔「サウンド」
     まだ解放していないページでも、上の行（戻る・サウンド）は矢印キーで選べる

   ※ 結果の画面では「もう一回」のボタンに自動でフォーカスを当てない
     Space を押しっぱなしで はやく進んでいるうちに終わったとき、
     ボタンにフォーカスがあると、Space をはなした瞬間に押されたことになってしまうため
     かわりに、ここで Enter / Space を受け取る（押しっぱなしの event.repeat は無視する）
   ※ 矢印キーも、押しっぱなし（event.repeat）は無視する
     遊んでいる最中に ← → を押したまま終わったとき、結果の画面でそのままボタンが動いてしまわないように
   ============================================================ */
const layoutRef = ref<InstanceType<typeof MinigameLayout> | null>(null);

function handleKeydown(event: KeyboardEvent) {
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

    /* BGM「こもれびの奥で」を、はじまる前の画面から鳴らしはじめる（少し待ってから、ふわっと）
       ミニゲームの一覧のカードを押して来たときは、そのまま鳴る
       アドレスを直接開いたときは、ブラウザの決まりで まだ鳴らせないので、「はじめる」で鳴らす（→ play()） */
    playSecretBgmSoon();
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);

  // 別のページへ移ったあともBGMが鳴り続けないように、音をぜんぶ片づける
  cleanupAudio();

  // 「⏫ スピードアップ！」「🎉 じこベスト更新！」を消す予約も取り消しておく
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
    @back="goToList"
    @toggle-sound="toggleSound"
    @volume-change="changeSoundVolume">
    <!-- 外枠（背景 ＋ 上部ツールバー「← ミニゲーム一覧へ ／ サウンド」）は、ミニゲームの一覧と同じ部品

         ※ このコメントを <MinigameLayout> の外（template のすぐ下）に書かないこと
           開発中（nuxt dev）はコメントも残るので、ページのいちばん外の要素が2つ（コメント ＋ 部品）になり、
           ページを移るときのフェード（nuxt.config.ts の pageTransition）がこわれて、
           移った先の画面がまっ暗のまま何も出なくなる -->

    <!-- まだ解放していないブラウザで、このページのアドレスを直接開いたとき
         何を見つければよいかは言いすぎず、「秘密の場所」があることだけを伝える -->
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
      <article v-if="secretPathPhase === 'ready'" class="place-card place-card--secret">
        <h1 class="place-card__title">🌿 どこまで行ける？</h1>

        <p class="mg-lead">
          🌿をよけて ✨をあつめながら
          <br />
          どこまでも進もう！
        </p>

        <!-- 遊びかたは、ひと目で読めるよう短くしてある
             1行目 … 操作（パソコン向け（--pc）とスマホ向け（--touch）を CSS で出し分ける。本編の小道と同じ）
             2行目から … ルールを3つだけ（おしまいの条件・加速コンボ・レベルアップ） -->
        <ul class="mg-rules">
          <li class="mg-for-pc">
            <span class="mg-rules__part">← →・クリック：よける</span>
            <span class="mg-rules__part">↑・Space・長押し：加速</span>
          </li>
          <li class="mg-for-touch">
            <span class="mg-rules__part">タップ・フリック：よける</span>
            <span class="mg-rules__part">長押し：加速</span>
          </li>
          <li>🌿に{{ secretPathEndlessLives }}回当たると おしまい</li>
          <!-- こもれびのボーナス（1つ取るごとに、進んだ距離が増える → data/secretPathEndless.ts） -->
          <li class="mg-rules__bonus">✨ 1つで きょりが +{{ secretPathEndlessSunlightBonusMeters }}m！</li>
          <!-- 加速コンボ（加速しつづけると、進んだ距離が多めに数えられる → data/secretPathEndless.ts）
               出すのは「ふだんの何倍か（合計）」。加速しただけで ×2 数えられているので、コンボが付くと ×3 → ×4 → ×6 になる
               （HUD の札に出る数字と、そろえてある） -->
          <li class="mg-rules__bonus">
            <span class="mg-rules__part">⏩ 加速中は きょり ×{{ secretPathBoostMultiplier }}！</span>
            <span class="mg-rules__part">当たらずに続けると {{ comboLadderText }}</span>
          </li>
          <li>⏫ {{ secretPathEndlessLevelMeters }}mごとに スピードアップ</li>
        </ul>

        <p v-if="best.distance > 0 || best.sunlight > 0" class="mg-best">
          じこベスト
          <span class="mg-best__item">🏁 {{ best.distance }}m</span>
          <span class="mg-best__item">✨ {{ best.sunlight }}</span>
        </p>

        <!-- ご褒美のヒント（まだ解放していないときだけ）
             何がもらえるかは言わず、「その先に何かある」ことと、めざす距離だけを伝える
             （解放したあとは、もう出さない。曲はサウンドトラックのページにある） -->
        <p v-if="!hasUnlockedSecretVocalSong" class="mg-reward mg-reward--locked">🔒 {{ secretVocalSongUnlockDistance }}m まで行くと、なにかあるみたい…</p>
      </article>

      <!-- 遊んでいる最中（HUD ＋ 3レーンのフィールド。本編の小道と同じ部品）
           HUD には、残り時間のかわりに、のこりの ❤ と進んだ距離を出す -->
      <SecretPathField
        v-else-if="secretPathPhase === 'playing'"
        :player-lane="secretPathPlayerLane"
        :items="secretPathItems"
        :flash-lane="secretPathFlashLane"
        :hover-destination="secretPathHoverDestination"
        :countdown-number="secretPathCountdownNumber"
        :is-start-cue-visible="isSecretPathStartCueVisible"
        :is-bumped="isSecretPathBumped"
        bump-penalty="❤️ -1"
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

        <!-- 結果の記録（何の記録か → 数 → そのほか、の順に読めるよう、大きさを3つに分けている → .mg-result）
             絵文字は、読み上げでは「旗」「きらきら」と読まれてしまうので隠して、となりの言葉（きょり・こもれび）で伝える -->
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
            <span class="mg-result__icon" aria-hidden="true">✨</span>
            <span class="mg-result__label">こもれび</span>
            <b class="mg-result__value">{{ secretPathSunlightCount }}</b>
            <span class="mg-result__unit">こ</span>
            <!-- 集めたこもれびぶんの距離ボーナス（1つで +5m。1つも取れなかったときは出さない）
                 上の「きょり」には、このボーナスも入っている（🏁 を付けて、距離のことだと分かるようにする） -->
            <span v-if="secretPathSunlightBonusMeters > 0" class="mg-result__bonus">🏁 +{{ secretPathSunlightBonusMeters }}m</span>
            <span v-if="isNewSunlightBest" class="mg-result__new">じこベスト！</span>
          </span>
        </p>

        <p class="mg-text">{{ resultComment }}</p>

        <!-- ご褒美（うた入りの「こもれびの奥で」）
             ・このプレイで解放したとき … 曲の名前と、どこで聴けるかを伝える（遊んでいる最中の知らせは1.6秒で消えるため）
             ・まだ解放していないとき   … はじまる前と同じヒントを、もう一度出す
                                          （あと何mだったかは、上の「🏁 きょり」を見れば分かる）
             ・もう解放してあるとき     … 何も出さない -->
        <p v-if="isNewlyUnlockedSecretVocalSong" class="mg-reward mg-reward--new">
          🎁 「{{ secretVocalSongTitle }}」を 見つけた！
          <span class="mg-reward__note">サウンドトラックで 聴けるようになりました</span>
        </p>
        <p v-else-if="!hasUnlockedSecretVocalSong" class="mg-reward mg-reward--locked">🔒 {{ secretVocalSongUnlockDistance }}m まで行くと、なにかあるみたい…</p>

        <p class="mg-best">
          じこベスト
          <span class="mg-best__item">🏁 {{ best.distance }}m</span>
          <span class="mg-best__item">✨ {{ best.sunlight }}</span>
        </p>
      </article>

      <!-- 下の紺色の枠（遊んでいる最中だけ）。操作の案内（本編の小道と同じ）
           自己ベストは、遊ぶ画面の部品（SecretPathField.vue）の HUD の下と、フィールドの線で見せる -->
      <nav v-if="secretPathPhase === 'playing'" class="mg-command">
        <!-- レベルが上がった瞬間の「⏫ スピードアップ！ Lv.3」・自己ベストをこえた瞬間の「🎉 じこベスト更新！」
             （1.6秒だけ、操作の案内の上に重ねる → showCommandNotice()）
             枠の大きさは変えないので、フィールドや枠の位置はずれない -->
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

      <!-- はじまる前・結果の画面の「はじめる」「もう一回」
           はじめの画面の「はじめる」と同じ、金色のボタン（▶ は選ばれているときだけ出る。まわりの紺色の枠は付けない） -->
      <button v-else ref="playButtonRef" type="button" class="mg-play" @click="play">
        {{ secretPathPhase === 'finished' ? 'もう一回' : 'はじめる' }}
      </button>
    </section>
  </MinigameLayout>
</template>

<style scoped>
/* ============================================================
   このページの中身の見た目

   背景・色の名前（--navy など）・上部ツールバーは、外枠の components/minigame/MinigameLayout.vue が持っている
   ============================================================ */

/* ===== まんなかの列（カード ＋ 下の枠） =====

   ※ スマホでダブルタップしても画面が拡大しないようにする指定（touch-action: manipulation）は、
     上部ツールバーや外まわりの余白にも効かせるため、app.vue にまとめてある */
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

/* フィールド（森の小道）の高さ（広い画面）

   本編では、フィールドが画面の高さいっぱいまで伸びる作り（secret-path-field.css の flex: 1 1 auto）
   このページでは全体を枠でかこんで上下まん中に置いていて、枠の高さは中身で決まるので、
   そのままだとフィールドが いちばん低い高さ（220px）まで縮んでしまう
   そこで、画面の高さから、フィールドの高さを決めておく
   ・画面の高さ − 410px（枠の上下の余白・ツールバー・HUD・下の案内などのぶん）
     800px の画面なら 390px。枠がちょうど画面に収まって（スクロールしない）、上下まん中に置ける
   ・ただし 320px より低く・560px より高くはしない（背の低い画面でも遊べる高さ／背の高い画面で間延びしない）
   ※ スマホ幅は、ページ全体を画面の高さに収めて、入りきらないぶんフィールドを縮める（→ 下の「スマホ幅」の .mg-fit）
   ※ フィールドは SecretPathField.vue の中の要素なので、:deep() で指す */
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

/* ご褒美の行（はじまる前・結果の画面）

   ・まだ解放していないとき（--locked） … うすい紫の枠に、かこみ文字だけ。ひかえめに置く
   ・このプレイで解放したとき（--new）  … 紫の下地に白ぬきで、いちばん目立たせる（めったに出ない知らせのため）
   色は、こもれびの広場のカードと同じ紫の系統でそろえている */
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

/* 結果（「🏁 きょり 123m Lv.4」「✨ こもれび 8こ 🏁 +40m」）

   ぱっと読めるように、文字の大きさを3つに分けている
   ・何の記録か（絵文字 ＋ 「きょり」「こもれび」）… 小さめ・うすい紫
   ・数（いちばん見せたいもの）                    … いちばん大きく、太く、濃い紫
   ・単位（m・こ）と、そのほかの札（Lv.4・ボーナス・じこベスト！）… 数より小さく
   数字は tabular-nums（どの数字も同じ幅）にして、自己ベストと見くらべやすくしている */
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

/* 記録の絵文字（🏁・✨）と、何の記録かの言葉（きょり・こもれび）
   数より小さく・うすくして、大きい数字が先に目に入るようにする */
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

/* 集めたこもれびぶんの距離ボーナス（「🏁 +40m」。こもれびのとなりに、クリーム色の小さな丸で）
   とどいたレベル（.mg-result__level）と同じ形・大きさにして、ならびをそろえている */
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
  position: relative; /* 「⏫ スピードアップ！」「🎉 じこベスト更新！」（.mg-notice）を、この枠いっぱいに重ねるための基準 */
  box-sizing: border-box;
  padding: 14px 16px;
  border: 3px solid #fff;
  border-radius: 14px;
  background: linear-gradient(180deg, #2e7d96 0%, #226981 100%);
  box-shadow: 0 6px 16px rgb(16 29 44 / 22%);
  text-align: center;
}

/* 下の枠に重ねて出す知らせ（「⏫ スピードアップ！ Lv.3」「🎉 じこベスト更新！」）
   紺色の枠の中いっぱいに、板を重ねる（操作の案内は、この下にかくれる）
   枠の大きさは変えないので、フィールドや全体の枠の位置はずれない
   ぽんっと出て、1.6秒の終わりにふわっと消える（出しておく長さは、上の commandNoticeDuration と同じ） */
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

/* じこベスト更新 … クリーム色の板を金色のふちでかこむ（HUD の「自己ベストまでのバー」がこえたときと同じ色の組み合わせ）
   スピードアップの金色の板と、ひと目で見分けられるようにしている */
.mg-notice--record {
  background: linear-gradient(180deg, #fffaf0 0%, #fff0c4 100%);
  box-shadow:
    inset 0 0 0 3px var(--gold),
    0 0 14px 2px rgb(255 209 102 / 70%);
}

/* 加速コンボの倍率が上がった（「⏩ きょり ×3！」）… HUD の札と同じ金色の板
   スピードアップの板と近い色だが、こちらは倍率の数字が出るので読み分けられる */
.mg-notice--combo-up {
  background: linear-gradient(180deg, #ffe09a 0%, #ffca4d 100%);
}

/* ご褒美にとどいた（「🎁 うた入りの曲を 見つけた！」）… 紫の板

   ほかの知らせ（金色・クリーム色・灰色）とは色から変えて、めったに出ないものだと分かるようにする
   色は、こもれびの広場のカード（.place-card--secret）と同じ紫の系統 */
.mg-notice--unlock {
  background: linear-gradient(180deg, #f3e9ff 0%, #ddc9fa 100%);
  box-shadow:
    inset 0 0 0 3px #8f6ad4,
    0 0 14px 2px rgb(143 106 212 / 60%);
  color: #4a2f86;
}

/* 加速コンボが切れた（「⏩ コンボが きれた…」）… うすい灰色の板
   ごほうびではなく「なくなった」ことを伝えるので、金色にはしない */
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

   はじめの画面の「はじめる」（assets/css/game/command.css の .cmd .cmd--start .cmd--single）と同じ見た目
   ・金色の下地に、濃い茶色の文字。下のふちだけ太くして、押せるボタンに見せる
   ・うっすら水色を重ねて、ふちが水色にふわっと光る（「いま選ばれているボタン」のしるし）
   ・▶ は、選ばれているとき（キーボードで選んでいる・マウスを乗せている）だけ、左はしに出す（→ すぐ下の ::before）
   ※ 本編のCSS（command.css）はこのページでは読みこまないので、同じ値をここに書いている */
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

/* 選択カーソル「▶」（はじめの画面の「はじめる」の ▶ と同じ。.cmd::before / .cmd--start::before）
   左はしから 14px、文字と同じ濃い茶色、13px。選ばれているときだけ出す */
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

  /* scroll-margin-top … 遊びはじめに、カードを画面の上へスクロールしたとき、上に少しすき間を残す
     （画面に収まっているときは、スクロールしないので効かない） */
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

  /* 結果の記録は、スマホ幅では数字を少し小さくする
     入りきらないときは、Lv.4・ボーナス・「じこベスト！」の札が次の行へ回り込むようにして、
     横にはみ出さないようにする（数字と単位は、いちばん前なので同じ行に残る） */
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

  /* 下の枠（操作の案内）は、1行に収まるよう、少し小さくする（とても細い画面では、まとまりの切れ目で2行になる）
     2行になると枠が高くなって、そのぶんフィールドが低くなってしまうため */
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

     フィールドの高さを「画面の高さ − 決まった数」で決めると、
     HUD・自己ベストのバー・案内の折り返し・iPhone のノッチやホームバーのよけ（safe-area）などで
     まわりの高さが変わったときに、画面からはみ出してしまう
     そこで、ページ全体（.minigame）を画面の高さぴったりにして、入りきらないぶんはフィールドを縮める

     ・.mg-fit … 遊んでいる最中だけ、外枠（MinigameLayout.vue のいちばん外の .minigame）に付く
     ・外枠 → 全体の枠 → 中身の列 → 遊ぶカード の順に、「縮んでよい」（min-height: 0）をつないでいく
     ・縮むのはフィールドだけ（400px を目安に、200px まで → secret-path-field.css のスマホ幅。本編の小道と同じ）
       HUD や案内は、中身の高さのまま
     ・画面に余裕があるときは、フィールドは 400px のまま（それより伸ばさない）で、全体を上下まん中に置く
     ※ 全体の枠は MinigameLayout.vue の中の要素なので、:deep() で指す
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

/* 背の低いスマホ（iPhone SE・ブラウザのバーが出ているとき など）
   はじまる前のカード（遊びかたの説明）が画面に収まるよう、すき間と文字を少しつめる */
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

  /* 「⏫ スピードアップ！」「🎉 じこベスト更新！」は、最後に消える動き（forwards）が一瞬で終わると見えなくなるので、動かさずに出しておく
     （1.6秒たつと、commandNotice が null になって消える） */
  .mg-notice {
    animation: none !important;
  }
}
</style>
