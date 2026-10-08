<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { sPlusSongTitle } from '~/utils/sPlusSong';
import { changeClass, formatChange } from '~/utils/statusChange';

import { loadNewMinigames, unlockMinigame } from '~/utils/minigameStorage';

import { buildGoalConfirmTimeText, buildParkEntranceText } from '~/utils/gameText';

import { addMinutesToTime } from '~/utils/gameTime';

import { formatPlayedAt, formatRecordRank, formatRecordScore, getRecordRankTier, isLetterRank, recentGameRecordLimit } from '~/utils/gameRecords';

// 画像の先読みと、画像がそろってから まとめて出す目印（v-reveal-with-images）
import { preloadGameImages, vRevealWithImages } from '~/utils/imagePreload';

/* ゲーム画面の部品（どれも表示と、押されたことを伝えるだけ）
   行動の中身・ステータスの計算は、このファイルに残してある */
import CommandBox from '~/components/game/CommandBox.vue';
import FoundItemCollection from '~/components/game/FoundItemCollection.vue';
import GameRecordHistory from '~/components/game/GameRecordHistory.vue';
import ResultCard from '~/components/game/ResultCard.vue';
import SecretPathField from '~/components/game/SecretPathField.vue';
import SecretPathIcon from '~/components/game/SecretPathIcon.vue';
import SoundControl from '~/components/game/SoundControl.vue';

/* 画像の置き場所（まだ画像が無いあいだは「NO IMAGE」の仮の枠を出す） */
import NoImage from '~/components/common/NoImage.vue';

import { useKeyboardControls } from '~/composables/useKeyboardControls';

import { useTantrum } from '~/composables/useTantrum';

/* ゲームが終わったあとの結果（スコア・ランク・GAME OVERの文章・S+の曲の解放・ハイスコアと直近の記録） */
import { useGameResult } from '~/composables/useGameResult';

/* 通常の行動1回ぶんの結果（文章・今回の変化・見つけたもの）
   行動の中身（ステータスの増減・アイテム取得・抽選）は、このファイルに残してある */
import { useActionResult } from '~/composables/useActionResult';

/* きょうのおやつ（バッグの中身と出し入れ）
   おやつ選択画面の操作と、おやつを食べる行動は、このファイルに残してある */
import { useSnackBag } from '~/composables/useSnackBag';

/* 秘密の小道（ミニゲーム）の状態と操作はぜんぶあちら。ここは、ゲーム全体の状態と画面の切りかえ・音を渡してつなぐだけ */
import { useSecretPathGame } from '~/composables/useSecretPathGame';

/* 下の4つは、抽選・判定だけを取り出したもの（結果を返すだけで、ステータスなどは書きかえない） */
import { judgePlaceItem } from '~/composables/usePlaceItem';

import { drawSuddenEvent } from '~/composables/useSuddenEvent';

import { judgeMoodDrop } from '~/composables/useMoodDrop';

import { judgeOutingPoint } from '~/composables/useOutingPoint';

/* ステータス・おでかけポイント・ゲーム内時間の入れもの
   ステータスを上げ下げする行動の中身や、時間を進める処理は、このファイルに残してある */
import { useGameState } from '~/composables/useGameState';

/* 音（鳴らす・止める・音量）。「いつどの曲へ切りかえるか」の判断は、このファイルに残してある */
import { useAudio } from '~/composables/useAudio';
import StatusBar from '~/components/game/StatusBar.vue';

import type {
  GameEvent,
  ItemPlace,
  SnackId,
  SnackUseContext,
} from '~/types/game';

/* ゲーム中に変わらない設定データ（読むだけ。プレイ中に変わる値は、それぞれの composable が持つ） */
import { dangerCalmLine, dangerEnergyLine, fussEnergyLine, fussMoodLine, gameTitle, suddenEventBannerImages, suddenEvents } from '~/data/game';
import { parkMapImages, parkMapStartPlace } from '~/data/parkMap';
import { normalPlaceEvents, placeBannerImages, placeItems, placeSelectionIndexes } from '~/data/places';
import { placeActions } from '~/data/placeActions';
import type { PlaceActionDefinition } from '~/data/placeActions';
import { secretPathSunlightTotal } from '~/data/secretPath';
import { buildMinigameUnlockPhrases, minigames } from '~/data/minigames';
import type { MinigameId } from '~/data/minigames';
import { maxSnackCount, snackBagImage, snacks } from '~/data/snacks';
import { niceTantrumBonusOutingPoint, niceTantrumBonusParentCalm, tantrumAlertDuration, tantrumBannerImages, tantrumBannerRatio } from '~/data/tantrum';

/* 画面は4段階あり、この3つの組み合わせで決まる

   titleEntered  isSnackSelectionOpen  gameStarted   画面
   ---------------------------------------------------------------------
   false         false                 false         起動画面（▶ はじめる）
   true          false                 false         タイトル画面（きょうのおやつを選ぶ）
   true          true                  false         おやつ選択画面（きょうのおやつ）
   true          -                     true          ゲーム画面

   ※ 起動画面をはさんでいるのは、ユーザーがまだ触っていないページでは音を鳴らせないため
     「▶ はじめる」を押した操作をきっかけに、タイトルBGMを鳴らしはじめる
   ※ 出発したあとも isSnackSelectionOpen は true のまま（gameStarted を先に見て見分ける）
   ※ このほかに「あそびかた」画面（isHowToPlayOpen）と「これまでの記録」の画面（isRecordsOpen）があり、
     開いているあいだは A画面・B画面・おやつ選択画面より優先する（どちらもB画面から開く） */
const titleEntered = ref(false);

const gameStarted = ref(false);

/* おやつ選択画面を開いているか（ここではまだゲームは始まらず、タイトルBGMも鳴ったまま） */
const isSnackSelectionOpen = ref(false);

/* 「あそびかた」画面を開いているか

   B画面の上に説明書を一時的に広げるだけなので、ほかの画面の状態やタイトルBGMはさわらない
   ※ 画面の出し分け・キー操作・フォーカスのどれも、「!gameStarted && isHowToPlayOpen」を、おやつ選択画面より先に見る
   ※ 読んだかどうかは保存しない（必要な人が、必要なときに開くページ） */
const isHowToPlayOpen = ref(false);

/* 「これまでの記録」の画面を開いているか（B画面の「🏆 ハイスコア」の札から開く）

   あそびかた画面と同じく、B画面の上に一時的に広げるだけなので、ほかの画面の状態やタイトルBGMはさわらない
   ※ 画面の出し分け・キー操作・フォーカスのどれも、あそびかた画面のすぐあと（おやつ選択画面より先）に見る */
const isRecordsOpen = ref(false);

/* ホーム画面のアイコンから（アプリのように）起動しているか（null … まだ調べていない）

   調べるのは onMounted の中（→ checkStandalone()）
   null のあいだは「ホーム画面に追加」の案内を出さない（ホーム画面から起動したときに、一瞬見えてしまわないように） */
const isStandalone = ref<boolean | null>(null);

/* ============================================================
   A画面・B画面のボタン（キーボード操作用。画面に出ていないときは null）

   画面が切りかわったときにメインのボタンへフォーカスを当てたり、矢印キーで選んだりするのに使う
   ※ サウンドON/OFFは、いちどに1画面にしか出ないので、箱は1つだけで足りる
   ============================================================ */
const startButtonRef = ref<HTMLButtonElement | null>(null);
const soundtrackButtonRef = ref<HTMLButtonElement | null>(null);
const minigameButtonRef = ref<HTMLButtonElement | null>(null);
const selectSnacksButtonRef = ref<HTMLButtonElement | null>(null);
const howToPlayButtonRef = ref<HTMLButtonElement | null>(null);
const backToBootButtonRef = ref<HTMLButtonElement | null>(null);
/* B画面の「🏆 ハイスコア」の札（記録があるときだけ出る。無いときは null） */
const recordsButtonRef = ref<HTMLButtonElement | null>(null);
/* サウンドのコントロール（4画面に置いてあるが、いちどに出るのは1画面だけなので、いま出ているもの1つを指す） */
const soundControlRef = ref<InstanceType<typeof SoundControl> | null>(null);

/* ミュートボタンと音量スライダーの本体（SoundControl の中にあるので、コンポーネントごしに借りる）
   ※ A画面にはスライダーが無いので null になり、ミュートボタンが Tab のいちばん後ろの行き先になる */
const soundToggleButtonRef = computed<HTMLButtonElement | null>(() => soundControlRef.value?.toggleButton ?? null);
const soundVolumeSliderRef = computed<HTMLInputElement | null>(() => soundControlRef.value?.volumeSlider ?? null);

/* あそびかた画面の「← ひとつ前の画面へ戻る」（画面が出おわったときに、ここへフォーカスを当てる） */
const howToBackButtonRef = ref<HTMLButtonElement | null>(null);

/* 記録の画面の「← ひとつ前の画面へ戻る」（あそびかた画面と同じく、画面が出おわったときに、ここへフォーカスを当てる） */
const recordsBackButtonRef = ref<HTMLButtonElement | null>(null);

/* 記録の画面から戻ったときに、B画面の札へフォーカスを戻すか（続けて Enter で、もう一度開けるように）
   当てるのは、フェードが終わったときの handleScreenEnterEnd() */
let shouldFocusRecordsButton = false;

/* おやつ選択画面のカードまるごと
   おやつは v-for で作るので、ボタンごとではなく入れものを覚える（おやつが増えても、ref を増やさなくてすむ） */
const snackSelectionRef = ref<HTMLElement | null>(null);

/* いま選んでいるコマンドの番号（キーボード操作用。0 = 1番目）
   新しいコマンド画面になったら 0 に戻す（公園入口へ戻ってきたときだけは、最後にいた場所に合わせる → restoreEntranceCursor()） */
const selectedCommandIndex = ref(0);

/* ゲームのステータス・時間・進みぐあい（入れものは composables/useGameState.ts）
   ※ これらを受けとる useAudio()・useTantrum()・useKeyboardControls() より前に置く */
const {
  /* ステータス */
  childEnergy, // こうちゃんの体力
  childMood, // こうちゃんの機嫌
  outingPoint, // おでかけポイント
  parentEnergy, // 親の体力
  parentCalm, // 親の余裕

  /* 時間 */
  currentTime,
  currentMinutes, // 時間を「分」に直したもの（09:00 なら 540）

  /* ゲームの進みぐあい */
  currentEvent, // 現在いる場所
  visitedPlaces, // 探検済みの場所
  playCount, // 場所で遊んだ回数
  collectedItems, // 公園で見つけたもの
  canEnterSecretSpot, // 秘密の場所へ行けるか（ポイント20以上かつ見つけたもの3種類以上）
  hasDiscoveredSecretSpot, // こもれびの広場を、このプレイでもう見つけたか

  /* いやいや（外からもよく見る2つだけ） */
  isTantrum,
  tantrumCount, // 最後のスコア計算に使う

  resetGameState,
} = useGameState();

/* 通常の行動1回ぶんの結果（入れものは composables/useActionResult.ts）
   入れものへ入れるのは、このファイルの行動の中身から（resultMessage.value = ... のように直接書きかえる） */
const {
  resultMessage,
  foundItemsThisAction,

  /* 今回の変化（上部ステータスと結果カードに出す） */
  statusChanges,
  statusBefore,
  changeGroups,

  /* 行動が終わったあとに呼ぶ */
  saveStatusChanges,

  resetActionResult,
} = useActionResult({
  childEnergy,
  childMood,
  outingPoint,
  parentEnergy,
  parentCalm,
  currentMinutes,
  currentTime,
});

/* いやいや発生の演出（画面いっぱいのオーバーレイ）を出しているか
   出すのは新しいいやいやが始まった瞬間の1回だけ（「少し待ってみる」に失敗して続くときは出さない） */
const tantrumAlertVisible = ref(false);

/* ============================================================
   きょうのおやつ（公園へ持っていくおやつ ＝ バッグの中身。入れものは composables/useSnackBag.ts）

   このファイルに残してあるもの
   ・おやつ選択画面の開け閉めと、カードを押したときの出し入れ（selectedSnackIds を直接書きかえる）
   ・おやつを食べる行動そのもの（いやいや中のおやつは useTantrum へ findSnackInBag / removeSnackFromBag を渡す）
   ============================================================ */
const {
  selectedSnackIds,

  /* 中身から決まる表示用の値 */
  selectedSnacks,
  snackLeft,
  isSnackBagFull,
  canStartWithSnacks,

  /* さがす・確かめる・取り出す */
  isSnackSelected,
  findSnackInBag,
  removeSnackFromBag,

  resetSnackBag,
} = useSnackBag();

/* 次に起こす予定のとつぜんのできごと（null … 予定なし）

   通常行動が終わった瞬間に画面を切り替えると、結果メッセージと「今回の変化」が読まれる前に消えてしまう
   そこで、いったんここへ書いておき、結果を読んで「次へ」を押したときに移動する（いやいやと同じ考え方） */
const pendingSuddenEvent = ref<GameEvent | null>(null);

/* ============================================================
   ゲームが終わったあとの結果（入れものは composables/useGameResult.ts）

   計算は composables/useScore.ts、S+の曲の解放と localStorage は utils/sPlusSong.ts、記録の保存は utils/gameRecords.ts
   このファイルに残してあるもの
   ・ゴールへ向かう流れ（goToGoal()）と、judgeResult() → unlockSPlusSongIfEarned() → recordGameResult() を呼ぶ順番
   ・GAME OVERの条件判定・BGM・画面の切りかえ（checkGameOver()）
   ============================================================ */
const {
  /* ゴールしたときの成績 */
  finalScore,
  scoreBreakdown,
  endingRank,
  endingTitle,
  endingMessage,

  /* GAME OVER画面に出す文章（入れるのは checkGameOver()） */
  gameOverTitle,
  gameOverMessage,

  /* S+ランク限定のうた入りBGM */
  hasUnlockedSPlusSong,
  isSPlusSongNewlyUnlocked,
  isSPlusSongHintVisible,

  /* これまでの記録（ハイスコアと直近の記録） */
  highScoreRecord,
  recentRecords,
  currentRecord,
  isHighScoreUpdated,
  previousHighScoreRecord,
  previousRecord,

  /* ゴールしたときに呼ぶ（順番は goToGoal() が決める） */
  judgeResult,
  unlockSPlusSongIfEarned,

  /* ゴール・GAME OVERのときに呼ぶ（goToGoal() と checkGameOver()） */
  recordGameResult,

  resetGameResult,
} = useGameResult({
  childEnergy,
  childMood,
  parentEnergy,
  parentCalm,
  outingPoint,
  currentMinutes,
  tantrumCount,
  visitedPlaces,
  playCount,
  collectedItems,
  keepInRange,
});

/* お昼（12:00）を過ぎたか */
const isTimeOver = computed(() => currentMinutes.value >= 12 * 60);

/* そろそろお昼（11:30以降）か */
const isAlmostNoon = computed(() => currentMinutes.value >= 11 * 60 + 30 && !isTimeOver.value);

/* 公園に着いたばかりか（公園で何かをすると かならず時計が進むので、09:00 のままなら まだ何もしていない） */
const isJustArrivedAtPark = computed(() => currentTime.value === '09:00');

/* 公園入口のあいさつ文（言いかたは utils/gameText.ts の buildParkEntranceText()）
   切りかわる時刻は、公園BGMがBGM2に変わる時刻とわざと同じにしてある（曲と文言がいっしょに変わり、章が進んだ感じが出る） */
const parkEntranceText = computed(() => buildParkEntranceText(isJustArrivedAtPark.value, shouldUseParkBgm2(), hasNewSecretPath.value));

/* 秘密の小道が地図に出ていて、まだ小道の先（こもれびの広場）を見つけていないか
   このあいだだけ、公園入口のあいさつ文を小道の案内にし、地図の「秘密の小道」に「NEW」の印を付ける */
const hasNewSecretPath = computed(() => canEnterSecretSpot.value && !hasDiscoveredSecretSpot.value);

/* ===== キーボード操作（「どうする？」コマンドボックス）用の計算 ===== */

/* いま「いやいやが続いている状態」か（いやいやタイムの画面にいて、まだなだめられていない）
   対応が効かなかったときも、結果メッセージを出したままこの状態になるので、もう一度コマンドを選べる
   ※ GAME OVERになると currentEvent が 'gameOver' に変わるので、自動的に false になる */
const isTantrumUnsolved = computed(() => currentEvent.value === 'tantrum' && isTantrum.value);

/* いま「通常の場所」にいるか（その場所ならではの遊びがならぶ画面） */
const isNormalPlace = computed(() => normalPlaceEvents.includes(currentEvent.value));

/* いま「ひとやすみ」（ベンチ）にいるか
   遊ぶ場所ではないので normalPlaceEvents には入れていない（探検済み・アイテム・いやいや・できごとは起きない） */
const isRestArea = computed(() => currentEvent.value === 'restArea');

/* 「どうする？」が たて1列にならんで、↑↓ で選ぶ画面か（通常の場所とひとやすみ）
   ほかの画面は、選択肢が横にならんで ← → で選び、↑↓ は文章のスクロールに使う */
const isPlaceMenuScene = computed(() => isNormalPlace.value || isRestArea.value);

/* ===== 通常の場所のメインコマンドの番号 =====

   0 その場所の行動① ／ 1 その場所の行動② ／ 2 ← 場所選びにもどる
   ※ 画面とキーボード操作の両方で同じ番号を使うので、名前を付けておく（順番を変えてもずれない） */
const leavePlaceCommandIndex = 2;

/* ===== ひとやすみ（ベンチ）のコマンドの番号 =====

   0 きゅうけいする ／ 1 おやつにする（残っているときだけ）／ 最後 ← 場所選びにもどる
   おやつを食べきると「おやつにする」が消えるので、「← 場所選びにもどる」が1つくり上がる */
const restBreakCommandIndex = 0;
const restSnackCommandIndex = 1;
const restLeaveCommandIndex = computed(() => (snackLeft.value > 0 ? 2 : 1));

/* 公園入口へ戻ってきた直後などに、コマンド枠をマウスで押せなくしておくか

   画面が切りかわると、止まったままのマウスの真下に新しい画面のボタンが来て、
   選んでいる行が勝手に移ったり、すばやく2回押すと思っていないボタンを押したりしてしまう
   そこで、マウスを動かす（またはどこかを押す）までは、枠へのマウス操作を止めておく（CSS の .command-box--pointer-paused）

   ※ 指で操作しているときは止めない（カーソルが残らないうえ、止めると次のタップが効かなくなるため）
     （CSS の (hover: hover) で分けないのは、マウス操作なのに hover: none と判定される環境があるため）
   ※ ↑↓ でスクロールしたとき・選んだコマンドを見える位置へスクロールしたときも、同じ理由で止める
     （handleKeydown() の ⓪-3 と revealSelectedCommand()）
   ※ 戻すのは、マウスを動かしたとき（handleWindowPointer()）か、次の画面へ移るとき */
const isCommandPointerPaused = ref(false);

/* いちばん最後に使われたポインターの種類（'mouse' / 'touch' / 'pen'。キーボードだけで遊んでいるときは ''） */
let lastPointerType = '';

/* コマンドへのマウス操作を、マウスを動かすまで止める（指で操作しているときは止めない） */
function pauseCommandPointer() {
  isCommandPointerPaused.value = lastPointerType !== 'touch';
}

/* window の pointermove / pointerdown を受け取る（ポインターの種類を覚え、止めていたマウス操作を戻す）

   ※ movementX / movementY が両方 0 の pointermove は、動いたと数えない
     （枠の大きさが変わったときにブラウザが送る、見かけだけの移動のため）
   ※ 押したときは、動いていなくても戻す（その1回の押しは、止めている枠には届かない） */
function handleWindowPointer(event: PointerEvent) {
  lastPointerType = event.pointerType;

  if (!isCommandPointerPaused.value) {
    return;
  }

  if (event.type === 'pointermove' && event.movementX === 0 && event.movementY === 0) {
    return;
  }

  isCommandPointerPaused.value = false;
}

/* ===== おやつバッグ（ゲーム中に、どのおやつを食べるか選ぶメニュー） =====

   おやつ選択画面（ゲーム開始前に持っていくおやつを選ぶ）とは別もの
   食べる場面は2つあり、どちらも同じバッグから選ぶ
     exploring … ひとやすみ（ベンチ）→「おやつにする」
     tantrum   … いやいやタイムの「おやつをあげる」
   ちがうのは「選んだあとの効果」だけなので、どこから開いたかを snackUseContext に覚えて、eatSnackFromBag() で呼び分ける
   ※ 「こうちゃんがころんだ」では、おやつは使わない */

/* いまおやつバッグを開いている場面（null … 閉じている）
   true / false を別に持たず、これ1つで表す（「開いているのに、どの場面か分からない」が起きない） */
const snackUseContext = ref<SnackUseContext | null>(null);

/* おやつバッグの中で選んでいる行の番号（おやつの数 … いちばん下の「← もどる」）
   selectedCommandIndex とは別に持つ（もどったときに「おやつをあげる」が選ばれたまま残るように） */
const selectedSnackMenuIndex = ref(0);

/* 「← もどる」が何番目か（＝バッグに残っているおやつの数） */
const snackMenuBackIndex = computed(() => selectedSnacks.value.length);

/* おやつバッグを実際に画面に出しているか
   画面・キーボード操作・Enterの実行がこれを見るので、「画面に無いのにキーだけ効く」が起きない
   ・exploring … ひとやすみで、まだ結果が出ていないとき
   ・tantrum   … いやいやが続いているとき */
const isSnackMenuVisible = computed(() => {
  if (snackUseContext.value === 'exploring') {
    return isRestArea.value && !resultMessage.value;
  }

  if (snackUseContext.value === 'tantrum') {
    return isTantrumUnsolved.value;
  }

  return false;
});

/* おやつバッグを開く（いつも最初のおやつが選ばれた状態から。空のときは開かない） */
function openSnackMenu(context: SnackUseContext) {
  if (snackLeft.value <= 0) {
    return;
  }

  playDecisionSound();

  snackUseContext.value = context;
  selectedSnackMenuIndex.value = 0;
}

/* おやつバッグを閉じる（バッグの中身はさわらない。開く前のメニューが、選んでいた行のまま出てくる） */
function closeSnackMenu() {
  snackUseContext.value = null;
  selectedSnackMenuIndex.value = 0;
}

/* バッグの中のおやつを選んだとき（開いた場面に合わせて、効果のちがう関数へ振り分ける）
   おやつの種類ごとの関数は作らず、どれも snackId を受け取って snacks のデータから効果を読む */
function eatSnackFromBag(snackId: SnackId) {
  if (!isSnackMenuVisible.value) {
    return;
  }

  if (snackUseContext.value === 'exploring') {
    giveSnackWhileExploring(snackId);
    return;
  }

  if (snackUseContext.value === 'tantrum') {
    giveSnack(snackId);
  }
}

/* いま画面に出ているコマンドの数（↑↓・← → で動ける範囲）
   ※ 条件の順番が大事（ゴール・GAME OVER → 公園入口 → いやいや → 結果表示中 → 場所 の順） */
const commandCount = computed(() => {
  // ゴール・GAME OVER画面は2つ（もう一度あそぶ／← はじめの画面へ戻る）。「結果表示中は1つ」にも当てはまるので先に見る
  if (currentEvent.value === 'goal' || currentEvent.value === 'gameOver') {
    return 2;
  }

  // 公園入口は「行き先6か所 ＋ ひとやすみ ＋ ゴール」で8つ（秘密の小道がまだ出ていないときは7つ）
  if (currentEvent.value === 'parkEntrance') {
    return canEnterSecretSpot.value ? 8 : 7;
  }

  /* いやいやが続いているあいだは、おやつが残っていれば4つ、食べきっていれば3つ
     効かずに結果メッセージが出ていても、まだ選び直すので、「結果表示中は1つ」より先に見る */
  if (isTantrumUnsolved.value) {
    return snackLeft.value > 0 ? 4 : 3;
  }

  // 結果表示中は1つだけ（「次の場所を選ぶ」など）
  if (resultMessage.value) {
    return 1;
  }

  // 通常の場所6か所は、どこでも同じ3つ
  if (isNormalPlace.value) {
    return 3;
  }

  // ひとやすみは、おやつが残っていれば3つ、食べきっていれば2つ
  if (isRestArea.value) {
    return restLeaveCommandIndex.value + 1;
  }

  /* 秘密の小道 … はじまる前は2つ（小道へ進む／← 場所選びにもどる）、終わったあとは1つ（先へ進む）
     （遊んでいる最中は handleSecretPathKeydown() が受け取るので、ここの数は使わない） */
  if (currentEvent.value === 'secretPath') {
    return secretPathPhase.value === 'ready' ? 2 : 1;
  }

  // ここに来るのは、とつぜんのできごと5つだけ（どれも選択肢が3つ）
  return 3;
});

/* 「どうする？」の選択肢を横にならべる画面か
   ・いやいやが続いているあいだ ・とつぜんのできごとで、まだ選んでいないとき ・秘密の小道の、はじまる前
   どれも「文章を ↑↓ でスクロールして読みながら、← → で選ぶ」画面なので、見た目も左右にならべてキーの向きとそろえる
   ※ おやつバッグを開いているあいだは、たて1列のまま */
const isChoiceGridVisible = computed(() => {
  if (isSnackMenuVisible.value) {
    return false;
  }

  if (isTantrumUnsolved.value) {
    return true;
  }

  if (currentEvent.value === 'secretPath') {
    return secretPathPhase.value === 'ready';
  }

  return suddenEvents.includes(currentEvent.value) && !resultMessage.value;
});

/* 横ならびにするときに command-box へ付けるクラス（command-box--choices-〇 … 選択肢の数で、列の数を決める） */
const choiceGridClass = computed(() => (isChoiceGridVisible.value ? ['command-box--choice-grid', `command-box--choices-${commandCount.value}`] : null));

/* いやいやタイムのコマンドの番号
   おやつあり … 0 お話する／1 だっこ／2 おやつ／3 少し待ってみる
   おやつなし … 0 お話する／1 だっこ／2 少し待ってみる */
const talkCommandIndex = 0;
const hugCommandIndex = 1;
const snackCommandIndex = 2;
const waitCommandIndex = computed(() => (snackLeft.value > 0 ? 3 : 2));

/* いやいやタイムの「待つ」コマンドの文字
   なにか試したのに、まだ続いている（いやいや中で結果メッセージが出ている）ときは「もう少し待ってみる」
   ※「|」は、折り返してよい区切り（画面には出ない。→ CommandBox.vue の splitCommandLabel） */
const waitCommandLabel = computed(() => (isTantrumUnsolved.value && resultMessage.value ? 'もう少し|待って|みる' : '少し|待って|みる'));

/* 結果カードの下の「次へ進む」コマンドの文字（押したときの goToNextPlace() は同じ） */
const nextPlaceCommandLabel = computed(() => {
  // いやいやが最優先（goToNextPlace() の分けかたと同じ順番）
  if (isTantrum.value) {
    return 'こうちゃんのところへ行く';
  }

  if (pendingSuddenEvent.value !== null) {
    return 'なにか起こりそう…';
  }

  return '次の場所を選ぶ';
});

/* 場面（.scene）に付けるクラス（scene--has-result … 結果カードが出ているあいだ。場所の絵・説明をたたむ目印）

   外側の .game-screen ではなく場面ごとに付けるのは、
   「次の場所を選ぶ」で結果を消した瞬間にクラスが外れて、消えていく途中の場面に絵と説明が一瞬戻ってきていたため
   場面に付けておけば、消えていく場面は描きなおされないので、消える直前の見た目のまま消えていく */
const sceneClass = computed(() => ({ 'scene--has-result': !!resultMessage.value }));

/* 公園入口の「ひとやすみ」の番号（行き先のすぐあと。秘密の小道が出ていなければ、1つくり上がる） */
const restCommandIndex = computed(() => (canEnterSecretSpot.value ? 6 : 5));

/* 公園入口の「公園の出口へ向かう（ゴール）」の番号（いちばん最後） */
const goalCommandIndex = computed(() => restCommandIndex.value + 1);

/* その場所へ入るためのコマンドの番号（公園入口にその行が出ていないときは null）
   ※ 「秘密の小道」が出ていないときに番号を返すと、くり上がったゴールを選んでしまうので、念のため確かめる */
function getPlaceSelectionIndex(place: GameEvent): number | null {
  // ひとやすみは、秘密の小道が出ているかどうかで番号が変わるので、ここで決める
  if (place === 'restArea') {
    return restCommandIndex.value;
  }

  const index = placeSelectionIndexes[place];

  if (index === undefined) {
    return null;
  }

  if ((place === 'secretSpot' || place === 'secretPath') && !canEnterSecretSpot.value) {
    return null;
  }

  return index;
}

/* このプレイで、公園入口から最後に入った場所（公園入口へ戻ったときのカーソル位置に使う。null … まだ選んでいない）

   書きかえるのは goToPlace() で、公園入口に行がある場所へ入るときだけ
   とつぜんのできごと・いやいやタイムは goToPlace() を通らないので、そのあと戻っても「遊んでいた場所」を選べる */
const lastSelectedPlace = ref<GameEvent | null>(null);

/* 公園入口に来たとき、最初にカーソルを合わせるコマンドの番号（data/parkMap.ts の parkMapStartPlace。出ていなければ先頭） */
function getEntranceStartIndex(): number {
  return getPlaceSelectionIndex(parkMapStartPlace) ?? 0;
}

/* 公園入口へ戻ってきたときに、最後にいた場所のコマンドへカーソルを合わせる
   ・まだ場所を選んでいない・その行が出ていないときは、地図のまん中に合わせる
   ・マウスで押して戻ってきたときは、止まったままのマウスの下のボタンにカーソルが上書きされるので、
     マウスを動かすまで止めておく（pauseCommandPointer()） */
function restoreEntranceCursor() {
  const index = lastSelectedPlace.value === null ? null : getPlaceSelectionIndex(lastSelectedPlace.value);

  if (index === null) {
    selectedCommandIndex.value = getEntranceStartIndex();
    return;
  }

  selectedCommandIndex.value = index;
  pauseCommandPointer();
}

/* ===== 「出口へ向かう？」の確認ダイアログ =====

   出口へ向かうと、その日のおでかけはおしまい（公園へは戻れない）なので、押しまちがいで終わらないように確認をはさむ
   ※ 12:00を過ぎて自動でゴールへ向かうときは確認しない（プレイヤーが選んだことではないため） */

const isGoalConfirmOpen = ref(false);

/* ダイアログの中で選んでいるボタン（0 … もう少し遊ぶ（開いたときはいつもこちら）／1 … 出口へ向かう） */
const selectedGoalConfirmIndex = ref(0);

/* ダイアログを実際に画面に出すか（「ゲーム中で、公園入口にいる」ことも見る）
   画面・キーボード操作・実行で同じこれを見るので、「画面に無いのにキーだけ効く」が起きない */
const isGoalConfirmVisible = computed(() => isGoalConfirmOpen.value && gameStarted.value && currentEvent.value === 'parkEntrance');

/* 「お昼まで、あとどれくらいか」の文（例：10:40 なら「お昼（12:00）まで、あと1時間20分あります。」） */
const goalConfirmTimeText = computed(() => buildGoalConfirmTimeText(currentMinutes.value));

/* ===== 危険な状態か（GAME OVERが近いか。上部ステータスで目立つ見た目にする） ===== */

const isParentEnergyDanger = computed(() => parentEnergy.value <= dangerEnergyLine);

const isParentCalmDanger = computed(() => parentCalm.value <= dangerCalmLine);

const isChildEnergyDanger = computed(() => childEnergy.value <= dangerEnergyLine);

/* いま「リザルト画面」（ゴール・GAME OVER）にいるか
   遊びが終わったあとの画面なので、上部ステータスの注意の色は付けない */
const isResultScene = computed(() => currentEvent.value === 'goal' || currentEvent.value === 'gameOver');

/* ===== ぐずりだすラインを下回っているか（危険の1段手前の「注意」。上部ステータスでオレンジにする） =====
   しきい値は、いやいやの判定と同じ data/game.ts の定数
   ※ 体力が危険ラインまで下がったときは、赤い「危険」のほうだけを出す（オレンジと赤が重ならないように） */
const isChildEnergyFuss = computed(() => childEnergy.value < fussEnergyLine && !isChildEnergyDanger.value);
const isChildMoodFuss = computed(() => childMood.value <= fussMoodLine);

/* ============================================================
   音（効果音・BGM・音量。中身は composables/useAudio.ts）

   渡すのは「いま画面はどうなっているか」の7つだけ（あちらは読むだけ）
   「いつ曲を切りかえるか」の判断は、このファイルに残してある
   ============================================================ */
const {
  /* サウンドの設定（SoundControl.vue へそのまま渡す） */
  soundEnabled,
  soundVolumePercent,
  toggleSound,
  changeSoundVolume,

  /* 効果音 */
  playDecisionSound,
  playItemSound,
  playTantrumSound,
  playGoalSound,
  playSunlightSound,
  playBranchBumpSound,
  playCountdownSound,
  playCountdownStartSound,
  playSuddenEventSound,

  /* 公園のBGM（shouldUseParkBgm2 は、公園入口の文章の出しわけにも使う） */
  playParkBgmSoon,
  stopParkBgm,
  switchParkBgmForCurrentTime,
  shouldUseParkBgm2,

  /* タイトル画面のBGM */
  playTitleBgmSoon,
  cancelTitleBgmStart,
  stopTitleBgm,

  /* いやいやタイムのBGM */
  playTantrumBgmSoon,
  stopTantrumBgm,

  /* リザルト画面のBGM */
  playResultBgmSoon,
  stopResultBgm,

  /* GAME OVER画面のBGM */
  playGameOverBgmSoon,
  stopGameOverBgm,

  /* こもれびの広場のBGM */
  playSecretBgmSoon,
  stopSecretBgm,

  /* ページを開いたとき・離れるとき */
  restoreSoundSettings,
  cleanupAudio,
} = useAudio({
  titleEntered,
  gameStarted,
  currentEvent,
  isTantrum,
  isResultScene,
  currentMinutes,
  endingRank,
});

/* 時間を進める（計算は utils/gameTime.ts） */
function addMinutes(minutes: number) {
  currentTime.value = addMinutesToTime(currentTime.value, minutes);
}

/* 数値を0〜100の範囲に収める */
function keepInRange(value: number) {
  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
}

/* ステータスがおかしな値にならないようにそろえる（おでかけポイントは点数なので100を超えてよい） */
function fixAllStatus() {
  childEnergy.value = keepInRange(childEnergy.value);
  childMood.value = keepInRange(childMood.value);
  parentEnergy.value = keepInRange(parentEnergy.value);
  parentCalm.value = keepInRange(parentCalm.value);
}

/* 行動をはじめる前に呼ぶ（「今のステータス」を控える）

   どの行動も1行目でこれを呼ぶ＝「行動がはじまった瞬間」の共通の入口なので、決定音もここで1回だけ鳴らす */
function startStatusChanges() {
  playDecisionSound();

  // どの行動を選んでも閉じるので、おやつを食べたあとにバッグが出しっぱなしにならない
  closeSnackMenu();

  // 前の行動の表示（見つけたもの・いやいや文・ナイス対応）が残らないように
  foundItemsThisAction.value = [];

  tantrumText.value = '';

  niceTantrumResponseText.value = '';

  statusBefore.value = {
    childEnergy: childEnergy.value,
    childMood: childMood.value,
    outingPoint: outingPoint.value,
    parentEnergy: parentEnergy.value,
    parentCalm: parentCalm.value,
    minutes: currentMinutes.value,
  };
}

function isVisited(place: GameEvent) {
  return visitedPlaces.value.includes(place);
}

/* おでかけポイントを加える（いくつ足すかは useOutingPoint.ts。はじめての場所ならそのまま、2回目以降は半分） */
function addOutingPoint(place: GameEvent, point: number) {
  outingPoint.value += judgeOutingPoint(point, isVisited(place));
}

/* 探検済みの場所に追加する（すでに入っていれば何もしない） */
function addVisitedPlace(place: GameEvent) {
  if (isVisited(place)) {
    return;
  }

  visitedPlaces.value.push(place);
}

/* 見つけたものを追加する（同じものは増えない） */
function addCollectedItem(itemName: string) {
  if (collectedItems.value.includes(itemName)) {
    return;
  }

  collectedItems.value.push(itemName);

  // 本当に新しいものを見つけたときだけ鳴る
  playItemSound();

  // 「〜を見つけました！」の文は、画面のほうでこれをもとに組み立てる（アイテムの名前だけ色をつけるため）
  foundItemsThisAction.value.push(itemName);
}

/* 見つかるものが、ぜんぶでいくつあるか（リザルトの「見つけたもの 3 / 6」の 6） */
const foundItemTotal = Object.keys(placeItems).length;

/* その場所のアイテムを、もう見つけているか（公園入口の「★ 発見済み」バッジ） */
function hasFoundPlaceItem(place: ItemPlace) {
  return collectedItems.value.includes(placeItems[place]);
}

/* 場所で遊んだときに、その場所のアイテムが見つかるか判定する（ルールは usePlaceItem.ts）

   ※ かならず finishPlayAction() より前に呼ぶ
     あとから呼ぶと、その場所が探検済みになっていて、はじめての場所でも「2回目」あつかいになるため */
function tryCollectPlaceItem(place: ItemPlace) {
  const itemName = judgePlaceItem(place, collectedItems.value, isVisited(place));

  if (itemName === null) {
    return;
  }

  addCollectedItem(itemName);
}

/* 疲れたり、おなかがすいたりすると、機嫌もわるくなる（いくつ下がるかは useMoodDrop.ts）

   ※ いやいやをなだめる行動ととつぜんのできごとでは呼ばれない（finishPlayAction() を通らないため）
     なだめている最中にさらに機嫌が下がると、立て直せなくなってしまう */
function dropMoodWhenTired() {
  childMood.value -= judgeMoodDrop(childEnergy.value, currentMinutes.value);
}

/* いやいや発生の演出を「あとで消す」予約票（null … 予約していない） */
let tantrumAlertTimer: ReturnType<typeof setTimeout> | null = null;

/* いやいや発生の演出をすぐ消して、予約も取り消す（タイトルへ戻るとき・ページから離れるとき） */
function hideTantrumAlert() {
  tantrumAlertVisible.value = false;

  if (tantrumAlertTimer === null) {
    return;
  }

  clearTimeout(tantrumAlertTimer);
  tantrumAlertTimer = null;
}

/* いやいや発生の演出を出して、約2秒後にひとりでに消す（止めるのは演出だけで、ゲームの進みは止めない） */
function showTantrumAlert() {
  // 古いタイマーが新しい演出を途中で消してしまわないように、前の予約を取り消す
  hideTantrumAlert();

  tantrumAlertVisible.value = true;

  tantrumAlertTimer = setTimeout(() => {
    tantrumAlertTimer = null;
    tantrumAlertVisible.value = false;
  }, tantrumAlertDuration);
}

/* いやいや（かんしゃく）の判定と、対応したときの結果（中身は composables/useTantrum.ts）

   いやいやの中だけで使う状態（理由・激しさなど）は、あちらが持つ。こちらは画面に出すぶんだけ受けとる
   ※ isTantrum と tantrumCount は、BGM や最後のスコアからも見るので、持ち主は useGameState。ここでは渡すだけ */
const {
  /* いやいやの判定と、いやいや中の4つの対応 */
  checkTantrum,
  resetTantrumState,
  hugChild,
  giveSnack,
  talkToChild,
  waitCalmly,

  /* 画面に出すもの（niceTantrumResponseText と tantrumText だけは、startStatusChanges() で空へ戻している） */
  tantrumLevel,
  currentTantrumLevelInfo,
  currentTantrumReasonInfo,
  currentTantrumScene,
  niceTantrumResponseText,
  tantrumText,
} = useTantrum({
  childEnergy,
  childMood,
  parentEnergy,
  parentCalm,
  outingPoint,
  isTantrum,
  tantrumCount,
  niceTantrumBonusOutingPoint,
  niceTantrumBonusParentCalm,
  resultMessage,
  selectedCommandIndex,
  showTantrumAlert,
  currentMinutes,
  fussEnergyLine,
  fussMoodLine,
  addMinutes,
  findSnackInBag,
  removeSnackFromBag,
  startStatusChanges,
  saveStatusChanges,
  fixAllStatus,
  checkGameOver,
  playTantrumSound,
  stopParkBgm,
  stopSecretBgm,
});

/* GAME OVER判定（ステータスが変わる行動のあとに、必ず fixAllStatus() のあとで呼ぶ）

   上から順に見て、あてはまった時点で決まる
   ① 親の体力が0以下 ② 親の余裕が0以下 ③ こうちゃんの体力が0以下（強制帰宅エンド）

   ・それまで鳴っていたかもしれない曲を ぜんぶ止める（いやいや中・秘密の場所でGAME OVERになることもあるため）
   ・いやいや発生の演出も必ず消す（消さないと、GAME OVER画面の上に「いやいや発生！」が残るため）
   ・行動の途中でGAME OVERになるので、選んでいたコマンドの番号を 0 に戻す
   ・少し無音の間をおいてから、GAME OVER BGMを鳴らす（画面はすぐ切りかわる）
   ・同じ行動のあとにもう一度呼ばれても、いちばん上の return で止まるので、BGMの予約は1回だけ
   ・理由の文を入れたあとで、直近の記録に残す（点数は出さないので、ハイスコアにはならない） */
function checkGameOver() {
  // すでにGAME OVERになっているときは、理由を上書きしない
  if (currentEvent.value === 'gameOver') {
    return;
  }

  // ① 親の体力が0以下
  if (parentEnergy.value <= 0) {
    gameOverTitle.value = '親の体力が限界！';
    gameOverMessage.value = 'もう動けません……。今日はここで帰ります。';
    currentEvent.value = 'gameOver';
    recordGameResult('gameOver');
    stopParkBgm();
    stopSecretBgm();
    stopTantrumBgm();
    stopResultBgm();
    hideTantrumAlert();

    selectedCommandIndex.value = 0;

    playGameOverBgmSoon();
    return;
  }

  // ② 親の余裕が0以下
  if (parentCalm.value <= 0) {
    gameOverTitle.value = '親の余裕がなくなった！';
    gameOverMessage.value = '心の余裕がなくなってしまいました。今日はここでおしまい。';
    currentEvent.value = 'gameOver';
    recordGameResult('gameOver');
    stopParkBgm();
    stopSecretBgm();
    stopTantrumBgm();
    stopResultBgm();
    hideTantrumAlert();

    selectedCommandIndex.value = 0;

    playGameOverBgmSoon();
    return;
  }

  // ③ こうちゃんの体力が0以下（強制帰宅エンド）
  if (childEnergy.value <= 0) {
    gameOverTitle.value = 'こうちゃん電池切れ！';
    gameOverMessage.value = 'もうクタクタ。だっこで公園をあとにしました。';
    currentEvent.value = 'gameOver';
    recordGameResult('gameOver');
    stopParkBgm();
    stopSecretBgm();
    stopTantrumBgm();
    stopResultBgm();
    hideTantrumAlert();

    selectedCommandIndex.value = 0;

    playGameOverBgmSoon();
    return;
  }
}

/* とつぜんのできごとの抽選（20%で発生・5種類から1つ → useSuddenEvent.ts）

   当たっても画面は切り替えず、予定表（pendingSuddenEvent）に書くだけ
   ここで切り替えると、いま終わった行動の結果と「今回の変化」が読まれる前に消えてしまうため
   （実際に切り替わるのは、「次へ」を押して goToNextPlace() が呼ばれたとき） */
function checkSuddenEvent() {
  const suddenEvent = drawSuddenEvent();

  if (suddenEvent === null) {
    return;
  }

  pendingSuddenEvent.value = suddenEvent;
}

/* 場所で1つ行動したあとの共通処理

   探検済みにする → 機嫌ダウン → いやいや判定 → 変化量の記録 → 0〜100に収める → GAME OVER判定 → できごとの抽選
   ・機嫌ダウンがいやいや判定より前なのは、下がったあとの機嫌で判定し、疲れて機嫌もわるいときほど起きやすくするため
   ・いやいやで親の余裕が0になった場合も、そのあとの判定でまとめてGAME OVERになる
   ※ いやいやをなだめる行動・とつぜんのできごとでは呼ばない（遊んだ回数を増やさない・できごとが連続しないように） */
function finishPlayAction(place: GameEvent) {
  playCount.value += 1;
  addVisitedPlace(place);
  dropMoodWhenTired();
  checkTantrum();

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  /* とつぜんのできごとの抽選（いちばん最後）
     GAME OVER（続きが無い）・いやいや発生（なだめるのが先）・12:00を過ぎた（ゴールへ向かうだけ）ときは抽選しない */
  if (currentEvent.value !== 'gameOver' && !isTantrum.value && !isTimeOver.value) {
    checkSuddenEvent();
  }

  selectedCommandIndex.value = 0;
}

/* ============================================================
   画面の切りかえ（A画面 ⇄ B画面 ⇄ ゲーム画面）のフェード

   画面の出し分けは v-if。そこへ <Transition name="screen-fade" mode="out-in"> をかぶせている
   そのフェードに合わせて、2つの世話をしている

   ① フェード中は、キーの操作を受けつけない（→ isScreenChanging）
      押したしゅんかんに中身はもう次の画面になるが、見えているのは消えかけの前の画面
      このあいだに Enter を押せると、見えていない次の画面のボタンまで押してしまう
      （マウスは CSS の pointer-events: none で止めている。キーは window で受け取るので、こちらで止める）
   ② 次の画面が出おわったら、フォーカスを当てなおす（→ handleScreenEnterEnd）
      mode="out-in" では、次の画面はフェードアウトが終わってから作られるので、nextTick では間に合わない
   ============================================================ */

/* いま画面がフェードで切りかわっている最中か（前の画面が消えているあいだだけ true） */
const isScreenChanging = ref(false);

/* 前の画面が、消えはじめたとき
   消えていく画面のボタンにフォーカスが残っていると、Enter でもう一度押せてしまうので外しておく
   （外したフォーカスは、次の画面が出おわったときに handleScreenEnterEnd() が当てなおす） */
function handleScreenLeaveStart(el: Element) {
  isScreenChanging.value = true;

  const active = document.activeElement;

  if (active instanceof HTMLElement && el.contains(active)) {
    active.blur();
  }
}

function handleScreenLeaveEnd() {
  isScreenChanging.value = false;
}

/* 次の画面が、出おわったとき（それぞれの画面のメインのボタンへフォーカスを当てる）

   ※ ゲーム画面のときは、focusTitleMainButton() の中で何も起きない
   ※ ページを開いた1回目はここを通らない（<Transition> は最初の表示では動かないため。onMounted が当てる） */
function handleScreenEnterEnd() {
  // ふつうは handleScreenLeaveEnd() でもう戻っているが、念のため
  isScreenChanging.value = false;

  /* あそびかた画面は、おやつ選択画面より先に見る（画面の出し分けと同じ順番）
     いちばん上の「← ひとつ前の画面へ戻る」へ当てる（そのまま Enter で戻れる。↑↓ でスクロールすると、フォーカスは位置に合わせて動く → useKeyboardControls.ts） */
  if (isHowToPlayOpen.value && !gameStarted.value) {
    howToBackButtonRef.value?.focus();
    return;
  }

  // 記録の画面も、あそびかた画面と同じく、いちばん上の「← ひとつ前の画面へ戻る」へ当てる
  if (isRecordsOpen.value && !gameStarted.value) {
    recordsBackButtonRef.value?.focus();
    return;
  }

  /* おやつ選択画面は、当てる先がおやつのカードなので、専用の関数にまかせる
     gameStarted も見るのは、isSnackSelectionOpen が出発したあとも true のまま残るため */
  if (isSnackSelectionOpen.value && !gameStarted.value) {
    focusFirstSnackOption();
    return;
  }

  // 記録の画面から戻ってきたときは、開いたときの札へ戻す（札が無いときは、いつもどおりメインのボタンへ）
  if (shouldFocusRecordsButton) {
    shouldFocusRecordsButton = false;

    if (recordsButtonRef.value) {
      recordsButtonRef.value.focus();
      return;
    }
  }

  focusTitleMainButton();
}

/* 起動画面の「▶ はじめる」

   この画面がある理由は、タイトルBGMを鳴らすため（ユーザーがまだ触っていないページでは音を鳴らせない）
   ・曲は少しだけ間を空けてから鳴らす（押した瞬間に始まると唐突なため。待つのは音だけ）
   ・この画面でただ一つ、先へ進むボタンなので、決定音を鳴らす（曲は0.7秒あとなので、重ならない）
   ※ B画面へのフォーカスは、フェードが終わったときに handleScreenEnterEnd() が当てる */
function enterTitle() {
  playDecisionSound();

  playTitleBgmSoon();

  titleEntered.value = true;
}

/* B画面（タイトル画面）から、A画面（起動画面）へ戻る

   A画面は「まだ音を鳴らしていない」画面なので、タイトルBGMは止めてから戻る（予約も取り消す）
   ※ 決定音は鳴らさない（引き返すだけのボタンでは音を出さない。ほかの画面の「戻る」も同じ） */
function goBackToBoot() {
  cancelTitleBgmStart();
  stopTitleBgm();

  /* きょうのおやつは、A画面まで戻ったら選びなおしてもらう
     （「最初から始め直す」ことなので、前のおやつを知らないうちに持たされないように。B画面 ⇄ おやつ選択ではわざと残す） */
  resetSnackBag();
  isSnackSelectionOpen.value = false;

  // A画面へ戻ったのに、中ではあそびかた・記録の画面が開いたまま、という状態を残さないため
  isHowToPlayOpen.value = false;
  isRecordsOpen.value = false;

  /* 画面はこの1行だけで切りかわる（表示用の state はこれ以外いじらないので、B画面は中身がそろったままフェードアウトする） */
  titleEntered.value = false;
}

/* ゲーム開始（＝公園へ出発する。おやつ選択画面の「このおやつで公園へ行く！」からだけ呼ばれる）

   ここが「ゲーム開始前」と「ゲーム中」の境目なので、BGMの切り替えも gameStarted も、ぜんぶこの1か所で行う */
function startGame() {
  playDecisionSound();

  /* 「タイトルBGMを止める → 公園BGMを鳴らす」の順番（2曲が重ならないように）
     公園BGMは少し間を空ける（決定音がかき消されないように）
     ※ ブラウザは操作の前に音を鳴らすのを止めることがあるので、プレイヤーが決定したこの瞬間に始めるのが確実 */
  stopTitleBgm();
  playParkBgmSoon();

  gameStarted.value = true;

  // 新しいプレイなので「最後に入った場所」も忘れる（はじめての公園入口は、必ず地図のまん中から）
  lastSelectedPlace.value = null;

  selectedCommandIndex.value = getEntranceStartIndex();

  // マウスで押したときは、止まったままのマウスの下に地図のボタンが出てカーソルが上書きされるので、動かすまで止めておく
  pauseCommandPointer();
}

/* ============================================================
   おやつ選択画面（B画面 → おやつ選択 → ゲーム）

   ここではBGMをいっさいさわらない（まだゲーム開始前の画面なので、タイトルBGMが鳴ったままでよい）
   サウンドON/OFFも、toggleSound() の「titleEntered && !gameStarted ならタイトルBGM」にそのまま当てはまる
   ============================================================ */

/* B画面の「きょうのおやつを選ぶ」（おやつ選択画面を開くだけ。フォーカスはフェードのあとで当てる） */
function openSnackSelection() {
  playDecisionSound();

  isSnackSelectionOpen.value = true;
}

/* おやつ選択画面の「← ひとつ前の画面へ戻る」（B画面へ戻る）
   選んだおやつは、わざと残す（もう一度開いたときに、さっき選んだものがそのまま入っているように）
   ※ 決定音は鳴らさない（引き返すだけのボタンなので） */
function closeSnackSelection() {
  isSnackSelectionOpen.value = false;
}

/* ============================================================
   あそびかた画面（B画面 → あそびかた → B画面）

   ルールと考えかたは説明するが、攻略の正解（相性表・成功率・解放条件など）は書かない
   ・別のページ（route）にはしない（ページが作り直されると、鳴っているタイトルBGMが止まってしまうため）
   ・ここではBGMをいっさいさわらない（タイトルBGMは途切れずに流れつづける）
   ============================================================ */

/* B画面の「？ あそびかた」
   ※ 決定音は鳴らさない（ゲームを進めるのではなく、説明書をちょっと開くだけのボタンなので。閉じるときもそろえる） */
function openHowToPlay() {
  isHowToPlayOpen.value = true;
}

/* あそびかた画面の「← ひとつ前の画面へ戻る」（Escape もここを呼ぶ） */
function closeHowToPlay() {
  isHowToPlayOpen.value = false;
}

/* ============================================================
   これまでの記録の画面（B画面 → 記録 → B画面）

   ハイスコアのくわしい記録と、直近の記録を出すだけ（記録を残すのは useGameResult.ts）
   ・別のページ（route）にしない・BGMをさわらない … あそびかた画面と同じ理由
   ============================================================ */

/* B画面の「🏆 ハイスコア」の札
   ※ 決定音は鳴らさない（あそびかたと同じく、記録をちょっと開くだけのボタンなので。閉じるときもそろえる） */
function openRecords() {
  shouldFocusRecordsButton = false;
  isRecordsOpen.value = true;
}

/* 記録の画面の「← ひとつ前の画面へ戻る」（Escape もここを呼ぶ）
   戻ったB画面では、開いたときの札へフォーカスを戻す（→ handleScreenEnterEnd()） */
function closeRecords() {
  shouldFocusRecordsButton = true;
  isRecordsOpen.value = false;
}

/* おやつのカードを押したとき（入っていなければ入れる、入っていれば出す）
   同じおやつを2個入れないようにしているのは、この「入っていたら出す」の形そのもの
   ※ いっぱいのときに押せないようにするのは画面（:disabled）にまかせているが、念のためここでも見る */
function toggleSnackSelection(snackId: SnackId, event: MouseEvent) {
  playDecisionSound();

  if (isSnackSelected(snackId)) {
    removeSnackFromBag(snackId);
    return;
  }

  if (isSnackBagFull.value) {
    return;
  }

  selectedSnackIds.value.push(snackId);

  /* キーボードで選んでバッグがいっぱいになったら、「このおやつで公園へ行く！」へカーソルを移す（あとは Enter だけで出発できる）
     ・Enter / Space で押したときは event.detail が 0 になる（マウスや指なら 1 以上）
     ・マウス・指のときは動かさない（自分でポインタを動かすので、カーソルだけ飛ぶと分かりにくい） */
  if (event.detail === 0 && canStartWithSnacks.value) {
    focusSnackGoButton();
  }
}

/* おやつ選択画面の「このおやつで公園へ行く！」
   ボタンも2種類そろうまで押せない（:disabled）ので、ここのチェックは念のため
   isScreenChanging も見るのは、フェード中の連打よけ（Enter の押しっぱなしで、もう一度押されないように） */
function confirmSnacksAndStartGame() {
  if (!canStartWithSnacks.value) {
    return;
  }

  if (isScreenChanging.value) {
    return;
  }

  startGame();
}

/* おやつ選択画面が出おわったとき、最初の押せるおやつへフォーカスを当てる

   おやつは v-for で作るので、入れものの中の最初の .snack-option を探す（おやつが増えても直さなくてよい）
   :not(:disabled) … バッグがいっぱいで戻ってきたときは、選んでいないおやつは押せない（focus() しても当たらない）ため */
async function focusFirstSnackOption() {
  await nextTick();

  const firstSnackButton = snackSelectionRef.value?.querySelector<HTMLButtonElement>('.snack-option:not(:disabled)');

  firstSnackButton?.focus();
}

/* 「このおやつで公園へ行く！」へフォーカスを当てる（キーボードで2個目を選んだとき）
   ※ 選んだ直後はボタンにまだ disabled が付いたままなので、nextTick() で外れるのを待ってから当てる */
async function focusSnackGoButton() {
  await nextTick();

  const snackGoButton = snackSelectionRef.value?.querySelector<HTMLButtonElement>('.snack-go:not(:disabled)');

  snackGoButton?.focus();
}

/* もうサウンドトラック・ミニゲームのページへ移動しはじめたか（連打よけ） */
let isLeavingPage = false;

/* サウンドトラックのページ（/soundtrack）へ移動する（A画面のボタン）

   A画面ではまだタイトルBGMは鳴っていないので、止める2行は空振りの保険
   ・ページの切りかえのフェード中に続けて押されても、移動のお願いは1回だけ
   ・決定音は鳴らさない（すぐページごと切りかわるので、「ポン♪」だけが残って聞こえないように）
   ・A画面の表示にはさわらない（中身がそろったままフェードアウトする） */
function goToSoundtrack() {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  cancelTitleBgmStart();
  stopTitleBgm();

  navigateTo('/soundtrack');
}

/* 本編の「🎮 ミニゲーム解放！」のお知らせに出す、ミニゲームの名前（出さないときは null）
   はじめて解放したときだけ出す（2回目からは unlockMinigame() が false を返すので出ない） */
const unlockedMinigameNotice = ref<string | null>(null);

/* A画面の「🎮 ミニゲーム」に NEW を付けるか（新しく解放して、まだ一覧で見ていないものがあるとき。onMounted で読む） */
const hasNewMinigame = ref(false);

function showMinigameUnlockNotice(id: MinigameId) {
  unlockedMinigameNotice.value = minigames.find((minigame) => minigame.id === id)?.title ?? null;
  hasNewMinigame.value = true;
}

/* ミニゲーム「どこまで行ける？」の解放（秘密の小道をぬけたら、このブラウザに保存する）

   ※ A画面の「🎮 ミニゲーム」は、解放していなくてもいつも出す（一覧では「？？？」とヒントだけを出す）
   ※ もう一度あそぶときも、解放は戻さない */
watch(hasDiscoveredSecretSpot, (discovered) => {
  if (!discovered) {
    return;
  }

  if (unlockMinigame('secret-path')) {
    showMinigameUnlockNotice('secret-path');
  }
});

/* ミニゲーム「枝の上のてんとう虫」の解放（とつぜんのできごとで、テントウムシを見つけたら、このブラウザに保存する）
   お知らせは、場面を移ったら消す（ほかの場面に持ちこさない。消えていく画面は描きなおされないので、途中で消えて見えることはない）
   テントウムシのお知らせは、できごとの絵と文をじゃましないよう、選んだあとの結果カードに出す */
watch(currentEvent, (event) => {
  unlockedMinigameNotice.value = null;

  if (event === 'ladybug' && unlockMinigame('ladybug-balance')) {
    showMinigameUnlockNotice('ladybug-balance');
  }
});

/* ミニゲームの一覧（/minigame）へ移動する（goToSoundtrack() と同じ手順。連打よけも同じものを使う） */
function goToMinigame() {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  cancelTitleBgmStart();
  stopTitleBgm();

  navigateTo('/minigame');
}

/* 場所を移動する（前の結果メッセージと変化量の表示は消す）

   ※ BGMが変わるのは、秘密の小道・秘密の場所へ行くとき（と、小道から公園入口へ引き返すとき）だけ
     ほかの場所はぜんぶ同じ公園のつづきなので、公園BGMのまま（移るたびに鳴りなおすと落ち着かない） */
function goToPlace(place: GameEvent) {
  // いま出ようとしている画面が「秘密の小道」か（currentEvent を書きかえる前に覚えておく）
  const leavingSecretPath = currentEvent.value === 'secretPath';

  playDecisionSound();

  closeSnackMenu();

  isCommandPointerPaused.value = false;

  resultMessage.value = '';
  statusChanges.value = null;
  currentEvent.value = place;

  // 公園入口に行がある場所なら、「最後に入った場所」として覚える（公園入口へ戻ったときのカーソル位置に使う）
  if (placeSelectionIndexes[place] !== undefined || place === 'restArea') {
    lastSelectedPlace.value = place;
  }

  selectedCommandIndex.value = 0;

  /* 秘密の小道・秘密の場所へ入るときは、こもれびの広場BGMへ入れかえる
     ・「公園BGMを止める → こもれびの広場BGMを鳴らす」の順番（先に止めないと、待つあいだ2曲が重なる）
     ・小道をぬけて広場へ着いたときは、何もしない（曲は小道からすでに鳴っている）
     ※ currentEvent を place にしたあとで呼ぶ（鳴らす直前に currentEvent で、まだ小道か広場にいるかを確かめるため） */
  if (place === 'secretPath' || (place === 'secretSpot' && !leavingSecretPath)) {
    stopParkBgm();
    playSecretBgmSoon();
  }

  /* 秘密の小道から公園入口へ引き返したときは、公園BGMへ戻す
     （どちらの公園BGMへ戻るかは、playParkBgmSoon() が時計を見て決める） */
  if (leavingSecretPath && place !== 'secretSpot') {
    stopSecretBgm();
    playParkBgmSoon();
  }
}

/* 次の場所を選びに行く（上から順に見て、あてはまった時点で行き先が決まる）

   ① GAME OVER中なら、どこへも動かさない
   ② いやいや中なら、なだめる場面へ
   ③ いやいやが終わった直後なら、公園BGMへ戻す
   ④ 12:00を過ぎていたら、ゴールへ
   ⑤ 秘密の場所から出てきたなら、公園BGMへ戻す
   ⑥ 10:30を過ぎているのにBGM1のままなら、BGM2へ切り替える
   ⑦ とつぜんのできごとの予定があれば、その画面へ
   ⑧ 何もなければ、公園入口へ（カーソルは、最後にいた場所のコマンドに合わせる）

   ・⑦が④より下なのは、お昼を過ぎてからできごとを始めると「12:00までに帰る」ルールが崩れるため
   ・⑤⑥が④より下なのは、ゴール直前に公園BGMを鳴らすと、一瞬だけ鳴って消えてしまうため */
function goToNextPlace() {
  if (currentEvent.value === 'gameOver') {
    return;
  }

  /* いま出ようとしている画面が「秘密の場所」か（currentEvent を書きかえる前に覚えておく）
     秘密の場所から出る道はこの関数1本だけなので、ここで覚えれば足りる */
  const leavingSecretSpot = currentEvent.value === 'secretSpot';

  // ④でゴールへ向かうときは決定音を鳴らさない（ゴールではファンファーレだけを聞かせたいため）
  if (isTantrum.value || !isTimeOver.value) {
    playDecisionSound();
  }

  resultMessage.value = '';
  statusChanges.value = null;

  isCommandPointerPaused.value = false;

  // ひとやすみでバッグを開いたまま、ここへ来たときのため
  closeSnackMenu();

  selectedCommandIndex.value = 0;

  /* 秘密の場所を離れる時点で、こもれびの広場BGMの出番は終わり（行き先に関わらず、ここでまとめて止める）
     stop（先頭へ戻す）にするのは、次に来たときも曲の頭から鳴らしたいため
     次に何を鳴らすかは、このあと行き先が決まってから */
  if (leavingSecretSpot) {
    stopSecretBgm();
  }

  /* ② いやいや中なら、いやいやタイムの画面へ（いやいやBGMを鳴らす予約をする）

     公園BGMとこもれびの広場BGMは、いやいやが発生した瞬間にもう止めてあるが、2曲が重ならないよう念のため止める
     どの場所で起きても、同じ曲・同じ聞こえかたにそろえる */
  if (isTantrum.value) {
    stopParkBgm();
    stopSecretBgm();

    currentEvent.value = 'tantrum';

    // currentEvent を 'tantrum' にしたあとで呼ぶ（鳴らす直前に、まだいやいやタイムにいるかを確かめるため）
    playTantrumBgmSoon();
    return;
  }

  /* ③ いやいやタイムから出るとき（いやいやが終わった瞬間ではなく、結果を読み終えて画面から出るここで止める）

     ・いやいやBGMは stop（次のいやいやは、また曲の頭から）
     ・公園BGMは、出発したときと同じく、少し間を空けてから頭からフェードインで鳴らす
     ・12:00を過ぎているときは鳴らさない（すぐゴールで止めることになり、一瞬だけ鳴って消えるため） */
  if (currentEvent.value === 'tantrum') {
    stopTantrumBgm();

    if (!isTimeOver.value) {
      playParkBgmSoon();
    }

    /* いやいやの状態もここで片づける（結果を読んでいるあいだは、見出しとセリフをそのまま見せたいため）
       このあと currentEvent が変わり、消えていく画面はもう描きなおされないので、フェードアウトの途中で表示が変わることはない */
    resetTantrumState();
  }

  if (isTimeOver.value) {
    goToGoal();
    return;
  }

  /* ⑤ 秘密の場所から、ふつうの公園へ戻ってきた（いやいやでも 12:00過ぎでもない ＝ これからも探検が続く）

     出発したときと同じく、少し間を空けてからフェードインで鳴らす（いったん静かになり「出てきた」感じが出る）
     ※ どちらの公園BGMへ戻るかは playParkBgmSoon() にまかせる（決め打ちしない。中で10:30を過ぎていたらBGM2）
     ※ とつぜんのできごとへ進むときも、ふつうの公園での出来事なので、公園BGMへ戻すのが自然 */
  if (leavingSecretSpot) {
    playParkBgmSoon();
  }

  /* ⑥ 10:30を過ぎていて、まだBGM1なら、BGM2へ切り替える

     10:30になった瞬間ではなく、結果を確認して次へ進むこのタイミングで切り替える
     すでにBGM2なら何もしない（押すたびに頭から鳴りなおさない）
     ※ ⑤を通ったときは、いま鳴らしている公園BGMが無いので何もしない（二重に鳴らしはじめない） */
  switchParkBgmForCurrentTime();

  /* ⑦ とつぜんのできごとの予定があれば、その画面へ移動する
     予定表は空に戻す（戻さないと、終わったあとにもう一度おなじ画面へ入ってしまう） */
  if (pendingSuddenEvent.value !== null) {
    // 予定表を空に戻す前に、行き先を控えておく（効果音に使う）
    const nextSuddenEvent = pendingSuddenEvent.value;

    currentEvent.value = nextSuddenEvent;
    pendingSuddenEvent.value = null;

    // 画面へ移動した瞬間に1回だけ、そのできごとの効果音を鳴らす（サウンドOFFのときは、あちらで止める）
    playSuddenEventSound(nextSuddenEvent);

    return;
  }

  currentEvent.value = 'parkEntrance';

  restoreEntranceCursor();
}

/* ============================================================
   場所での行動（6か所 × 2コマンド）

   12個の行動は、どれも同じ順番で進むので、動かすところは runPlaceAction() 1つにまとめてある
   場所ごとの数値・時間・結果の文章は data/placeActions.ts
   ============================================================ */

/* 行動データを1件受け取って、その行動を実行する
   ※ tryCollectPlaceItem() と finishPlayAction() の中では乱数を使うので、呼ぶ順番と回数は変えないこと
   ※ おでかけポイントは addOutingPoint() を通す（2回目の場所は半分になる） */
function runPlaceAction(action: PlaceActionDefinition) {
  startStatusChanges();

  childEnergy.value += action.childEnergy;
  childMood.value += action.childMood;
  addOutingPoint(action.place, action.outingPoint);
  parentEnergy.value += action.parentEnergy;
  parentCalm.value += action.parentCalm;
  addMinutes(action.minutes);

  resultMessage.value = action.message;

  tryCollectPlaceItem(action.place);
  finishPlayAction(action.place);
}

/* ============================================================
   秘密の小道（こもれびの広場へ続くミニゲーム）

   公園入口の「秘密の小道」を、そのプレイではじめて選んだときだけ通る
   3レーンを動いて、上から流れてくる枝をよけながら、こもれびを集める

   ■ 中身は composables/useSecretPathGame.ts（計算と判定は useSecretPath.ts）
     ここは、ゲーム全体の状態（ref）と、場所の移動・カーソル合わせ・音を鳴らす関数を渡すだけ

   ■ 流れ（secretPathPhase）
     ready    … 説明と「小道へ進む」「← 場所選びにもどる」
     playing  … ミニゲーム中（15秒）
     finished … 結果の文章と「先へ進む」（こもれびの広場へ入る）

   ■ ご褒美として楽しむミニゲーム
     枝に当たっても GAME OVER にはならず（こもれびが1つ減るだけ）、本編のステータスと時間はいっさい変えない
     こもれびをいくつ取っても、かならず広場へ行ける（たくさん集めたときだけ、おでかけポイントを少しボーナス）

   ■ BGM はここではさわらない（入れかえは、ぜんぶ goToPlace() の中）
   ============================================================ */
const {
  /* 画面に出す状態 */
  secretPathPhase,
  secretPathPlayerLane,
  secretPathItems,
  secretPathSunlightCount,
  secretPathBonusPoint,
  secretPathBumpLost,
  secretPathBumpId,
  secretPathSparkleId,

  /* 画面に出す、計算した状態 */
  isSecretPathPlaying,
  isSecretPathBoosting,
  secretPathCountdownNumber,
  isSecretPathStartCueVisible,
  isSecretPathBumped,
  isSecretPathSparkling,
  secretPathFlashLane,
  secretPathHoverDestination,
  secretPathTimeLeft,
  secretPathResultText,

  /* コマンド（はじまる前・終わったあと） */
  startSecretPathGame,
  leaveSecretPathToEntrance,
  enterSecretSpotFromPath,

  /* キー操作（useKeyboardControls へそのまま渡す） */
  handleSecretPathKeydown,

  /* フィールドのポインター操作（template から直接つなぐ） */
  handleSecretPathPointerDown,
  handleSecretPathPointerMove,
  handleSecretPathPointerUp,
  handleSecretPathPointerCancel,
  handleSecretPathPointerLeave,

  resetSecretPathGame,
} = useSecretPathGame({
  gameStarted,
  currentEvent,
  outingPoint,
  hasDiscoveredSecretSpot,
  statusChanges,
  selectedCommandIndex,
  goToPlace,
  restoreEntranceCursor,
  playDecisionSound,
  playItemSound,
  playSunlightSound,
  playBranchBumpSound,
  playCountdownSound,
  playCountdownStartSound,
});

/* 公園入口の「秘密の小道」
   このプレイでまだ広場を見つけていなければ、秘密の小道（ミニゲーム）へ。もう見つけていれば、そのまま広場へ */
function goToSecretArea() {
  if (hasDiscoveredSecretSpot.value) {
    goToPlace('secretSpot');
    return;
  }

  resetSecretPathGame();
  goToPlace('secretPath');
}

/* ============================================================
   ひとやすみ（ベンチで選ぶ、どこでも同じ親子の状態を整える行動）

   いちばん大事なのは finishPlayAction() を呼ばないこと
   あちらは「その場所で遊んだ」ときの処理で、遊んだ回数・探検済み・いやいや抽選・できごとの抽選まで行うため
   （「ベンチに座っただけで探検済み」「休んだ直後に救急車」のようになってしまう）
   ============================================================ */

/* ひとやすみの行動が終わったあとの共通処理（finishPlayAction() にあたるもの）
   回復する行動なのでGAME OVERにはならないはずだが、ステータスを動かしたら必ず判定する書きかたにそろえる */
function finishCareAction() {
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ① 休憩する（いつでも選べる回復行動。「まだ遊びたいのに」で、こうちゃんの機嫌だけは少し下がる）
   ※ 遊んでいないので、おでかけポイントは増えない */
function takeCommonBreak() {
  startStatusChanges();

  childEnergy.value += 12;
  childMood.value -= 2;
  parentEnergy.value += 12;
  parentCalm.value += 8;
  addMinutes(15);

  resultMessage.value = 'ベンチでひと休み。こうちゃんも少し元気が出てきました。';

  finishCareAction();
}

/* ② おやつをあげる（通常の探検中。「ひとやすみ」→「おやつにする」→ おやつバッグ）

   いやいやタイムの giveSnack() とは別の関数（あちらは、いやいやを終わらせるところまで受け持つ）
   いやいや用と同じバッグから取り出すので、ここで使えば、いやいやのときに使えるおやつも減る
   ・こうちゃんの体力・機嫌、かかる時間 … 選んだおやつのデータ
   ・親の余裕 +2                         … ベンチでひと息つけたぶん */
function giveSnackWhileExploring(snackId: SnackId) {
  /* バッグに入っていないおやつなら、何もしない
     ※ startStatusChanges() より前に置く（あとだと、何も起きていないのに決定音が鳴り、前の結果だけが消えるため） */
  const snack = findSnackInBag(snackId);

  if (!snack) {
    return;
  }

  startStatusChanges();

  childEnergy.value += snack.energy;
  childMood.value += snack.mood;
  parentCalm.value += 2;
  addMinutes(snack.minutes);

  resultMessage.value = `「おいしい！」ベンチで${snack.name}をもぐもぐ。`;

  finishCareAction();

  // ステータスの計算がぜんぶ終わってから、食べたおやつをバッグから出す
  removeSnackFromBag(snack.id);
}

/* ============================================================
   とつぜんのできごと（通常行動のあと、20%で起こる出来事）

   ・finishPlayAction() を呼ばない（できごとが連続で起きない・探検した場所にも入らない）
   ・そのかわり、どの行動も
     startStatusChanges() → （ステータスを動かす）→ saveStatusChanges() → fixAllStatus() → checkGameOver()
     の順で進め、最後に選んでいるコマンドを 0 に戻す
   ・おでかけポイントは addOutingPoint() を通さず、そのまま足す（「2回目の場所は半分」は、場所のためのルールなので）
   ============================================================ */

/* ===== とつぜんのできごと：救急車のサイレン ===== */

/* ① 救急車を探してみる */
function lookForAmbulance() {
  startStatusChanges();

  childMood.value += 8;
  outingPoint.value += 3;
  parentEnergy.value -= 2;
  addMinutes(10);

  resultMessage.value = '「いた！」道路の向こうを救急車が走っていきました。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ② いっしょに音を聞く */
function listenToSiren() {
  startStatusChanges();

  childMood.value += 4;
  addMinutes(5);

  resultMessage.value = '「ピーポー！」遠ざかる音を、最後までまねしています。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ③ 手をふって応援する */
function cheerOnAmbulance() {
  startStatusChanges();

  childMood.value += 3;
  addMinutes(5);

  resultMessage.value = '「がんばれー！」音のするほうに手をふって、何度もふりかえっています。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ===== とつぜんのできごと：テントウムシ ===== */

/* ① いっしょにじっくり見る */
function watchLadybug() {
  startStatusChanges();

  childMood.value += 7;
  outingPoint.value += 4;
  addMinutes(10);

  resultMessage.value = '「てちてち歩いてる、かわいい」二人でじっくり見つめました。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ② そっと手を近づけてみる */
function holdLadybug() {
  startStatusChanges();

  childMood.value += 9;
  outingPoint.value += 5;
  addMinutes(10);

  resultMessage.value = '「のった！」テントウムシが指にちょこんと乗りました。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ③ ばいばいして見送る */
function seeOffLadybug() {
  startStatusChanges();

  childMood.value += 3;
  addMinutes(5);

  resultMessage.value = '「ばいばーい！」空に向かって手をふっています。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ===== とつぜんのできごと：犬が近づいてくる ===== */

/* ① 近くで見せてもらう */
function watchDogClose() {
  startStatusChanges();

  childMood.value += 6;
  outingPoint.value += 3;
  parentCalm.value -= 3;
  addMinutes(10);

  resultMessage.value = '「わんわん、かわいいね！」近くで見せてもらいました。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ② だっこで少し離れて見る */
function watchDogBehindParent() {
  startStatusChanges();

  childMood.value += 3;
  parentEnergy.value -= 2;
  addMinutes(5);

  resultMessage.value = '「わんわん、こっち見た！」だっこで少し離れて見ています。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ③ 道をあけて見送る */
function keepDistanceFromDog() {
  startStatusChanges();

  addMinutes(5);

  resultMessage.value = '「わんわん、ばいばーい！」犬はそのまま歩いていきました。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ===== とつぜんのできごと：こうちゃんがころんだ =====

   ※ いやいやの判定はしない（「ころぶ → 選ぶ → 結果」だけのシンプルな流れ）。おやつも使わない
   ※ こうちゃんの数字は「ころんだ分」と「なだめた分」を足したあとの合計
     じょうずになだめても、ころぶ前より良くはならない（プラスにしない）
   ※ 目の前で子どもがころぶとヒヤッとするので、どれを選んでも親の余裕は減る（何で払うかがちがうだけ）
     ・だっこ           … 親の体力を大きく使って、しっかり対応
     ・いたいのいたいの … バランス型
     ・声をかけて待つ   … 親の体力は減らないが、こうちゃんの負担がいちばん大きい */

/* ① すぐにだっこする（機嫌は、ころぶ前と同じところまで戻る ＝ childMood はさわらない） */
function hugAfterFall() {
  startStatusChanges();

  childEnergy.value -= 3;
  parentEnergy.value -= 10;
  parentCalm.value -= 3;
  addMinutes(10);

  resultMessage.value = 'ぎゅっとだっこ。肩に顔をつけて、少しずつ落ち着いてきました。';

  saveStatusChanges();
  fixAllStatus();

  // だっこは親の体力を10使うので、残りが少ないとここでGAME OVERになる
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ② 「いたいのいたいのとんでけ」（ころんだ分を、だいぶ取り返せる） */
function blowPainAway() {
  startStatusChanges();

  childMood.value -= 2;
  childEnergy.value -= 4;
  parentEnergy.value -= 3;
  parentCalm.value -= 5;
  addMinutes(5);

  resultMessage.value = '「とんでった！」ひざをなでてもらって、にっこり。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ③ 「大丈夫？」と声をかけて待つ（なだめていないので、ころんだ分がほとんどそのまま残る） */
function watchAfterFall() {
  startStatusChanges();

  childMood.value -= 8;
  childEnergy.value -= 6;
  parentEnergy.value += 1;
  parentCalm.value -= 8;
  addMinutes(5);

  resultMessage.value = '「だいじょうぶ」自分でよいしょと立ち上がりました。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ===== とつぜんのできごと：噴水が突然出る ===== */

/* ① 水しぶきの近くまで行く */
function goCloseToFountain() {
  startStatusChanges();

  childMood.value += 9;
  childEnergy.value -= 7;
  outingPoint.value += 5;
  parentEnergy.value -= 5;
  addMinutes(10);

  resultMessage.value = '「きゃーっ！」水しぶきに向かって走りまわっています！';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ② 少し離れてながめる */
function watchFountainFar() {
  startStatusChanges();

  childMood.value += 5;
  outingPoint.value += 2;
  addMinutes(5);

  resultMessage.value = '水の音を聞きながら、指をさして笑っています。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ③ ぬれる前に離れる（ステータスも時間も変わらない） */
function walkOnFromFountain() {
  startStatusChanges();

  resultMessage.value = '「ぬれちゃうから、またあとでね」歩きだしても、何度も噴水をふりかえっています。';

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  selectedCommandIndex.value = 0;
}

/* ===== ゴール ===== */

/* ゴールへ向かう（判定して結果画面へ） */
function goToGoal() {
  // GAME OVERになったときは、ランクの判定はしない
  if (currentEvent.value === 'gameOver') {
    return;
  }

  /* BGMを止める（先に止めて、このあとのファンファーレがBGMに埋もれないように）
     ・いやいやBGM … いやいや対応中に12:00を過ぎると、いやいやタイムからそのまま来ることがあるため
     ・こもれびの広場BGM … 秘密の場所で遊んでいるうちに12:00を過ぎることがあるため
       （そのときは公園BGMを一瞬も鳴らさず、こもれびの広場BGM → そのままリザルトBGM になる） */
  stopParkBgm();
  stopSecretBgm();
  stopTantrumBgm();

  // ゴール音「タタターン♪」（ゴールでは決定音を鳴らさない。ファンファーレが埋もれないように）
  playGoalSound();

  resultMessage.value = '';
  statusChanges.value = null;
  addMinutes(10);

  closeSnackMenu();

  selectedCommandIndex.value = 0;
  judgeResult();

  /* S+ランクなら、うた入りエンディングBGMを解放する（はじめてなら、お知らせも出す）
     ランクが決まった直後に呼ぶ（このあと鳴らすリザルトBGMも、同じランクで曲を選ぶ） */
  unlockSPlusSongIfEarned();

  /* 今回の記録を残す（ハイスコアを更新したかも、ここで決まる）
     点数とランクが決まったあとに呼ぶ。リザルト画面のままアプリを閉じても残るよう、「もう一度あそぶ」まで待たない */
  recordGameResult('goal');

  currentEvent.value = 'goal';

  /* リザルトBGMは、ゴール音と重ならないよう少し間を空けてから鳴らす（待つのは音だけ）
     ※ currentEvent を 'goal' にしたあとで呼ぶ（鳴らす直前に、まだ結果画面にいるかを確かめるため） */
  playResultBgmSoon();
}

/* 公園入口の「公園の出口へ向かう（ゴール）」を選んだとき（すぐには向かわず、確認ダイアログを開く） */
function openGoalConfirm() {
  playDecisionSound();

  isGoalConfirmOpen.value = true;

  // 開いたときは、いつも「もう少し遊ぶ」を選んだ状態にする（Enter を続けて押しても、うっかり終わらないように）
  selectedGoalConfirmIndex.value = 0;

  // うしろの「どこへ行く？」も「公園の出口へ向かう」を選んだ状態にそろえる（閉じたあとに、どこから開いたかが分かる）
  selectedCommandIndex.value = goalCommandIndex.value;

  // マウスで押したときは、うしろのゴールのボタンにフォーカスの枠が残って紛らわしいので、外しておく
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

/* 確認ダイアログを閉じる（表示を戻すだけ。時間もステータスも変わらない）

   ※ ここに決定音を入れない
     「出口へ向かう」やもう一度あそぶからも呼ばれ、ゴールではファンファーレだけを聞かせたいため
     （人が「やめる」と押したときだけ、cancelGoalConfirm() で鳴らす） */
function closeGoalConfirm() {
  isGoalConfirmOpen.value = false;
  selectedGoalConfirmIndex.value = 0;
}

/* 確認ダイアログをやめる（「もう少し遊ぶ」・Escape・ダイアログの外のクリック。押せたことを音で返す） */
function cancelGoalConfirm() {
  playDecisionSound();

  closeGoalConfirm();
}

/* 確認ダイアログの「出口へ向かう」（ダイアログが出ていないときは、念のため何もしない） */
function confirmGoToGoal() {
  if (!isGoalConfirmVisible.value) {
    return;
  }

  closeGoalConfirm();
  goToGoal();
}

/* もう一度あそぶ */
function resetGame() {
  // ※ AudioContext（作業台）は作り直さない（ページを開いているあいだ、ずっと同じものを使う）
  playDecisionSound();

  /* BGMを、ぜんぶ止めてからタイトル用へ戻す（startGame() と逆の切り替え）
     ・どれも stop（先頭へ戻す）にして、次のプレイでは頭から鳴らす
     ・リザルトBGM・GAME OVER BGM の stop は「あとで鳴らす」予約も取り消すので、
       待ち時間のうちに押しても、あとからタイトル画面で鳴りだすことはない
     ・タイトルBGMは、決定音がかき消されないよう少し間を空けてから鳴らす */
  stopParkBgm();
  stopSecretBgm();
  stopTantrumBgm();
  stopResultBgm();
  stopGameOverBgm();
  playTitleBgmSoon();

  /* ステータス・時間・ゲームの進みぐあい・いやいやの状態を、まとめて最初に戻す
     （初期値は composables/useGameState.ts が持っているので、ここに数字を書き写す必要はない） */
  resetGameState();

  resetSecretPathGame();

  // いやいやの理由・レベル・対応の記録も戻す（大いやいや中にGAME OVERになったときの様子が、次に残らないように）
  resetTantrumState();

  /* きょうのおやつも、選んでいない状態に戻す（残っていると、おやつ選択画面を開いたとたんに「2 / 2」になっている）
     isSnackSelectionOpen も戻す（出発したあとも true のままなので、戻さないとB画面のつもりがおやつ選択画面のままになる） */
  resetSnackBag();
  isSnackSelectionOpen.value = false;

  isHowToPlayOpen.value = false;
  isRecordsOpen.value = false;

  // 残っていると、タイトル画面の上に前回の「いやいや発生！」が出たままになる
  hideTantrumAlert();

  // 前回のプレイで、開いたままGAME OVERになっていることがあるため
  closeSnackMenu();

  closeGoalConfirm();

  resetActionResult();

  lastSelectedPlace.value = null;
  isCommandPointerPaused.value = false;

  /* ゴールしたときの成績・S+の曲のお知らせ・GAME OVERの文章を、まとめて最初に戻す
     ※ S+の曲を解放したかどうかは戻さない（一度解放した曲は、もうロックに戻さない） */
  resetGameResult();

  // 戻しておかないと、前回の予定が次のゲームの1回目の行動のあとに出てきてしまう
  pendingSuddenEvent.value = null;

  // ※ 公園入口（currentEvent）に戻すのは、上の resetGameState() で行っている
  gameStarted.value = false;

  selectedCommandIndex.value = 0;
}

/* ゴール／GAME OVER画面から、A画面（起動画面）へ戻る（「もう一度あそぶ」はB画面まで）

   resetGame() の中でタイトルBGMを「少しあとで鳴らす」予約をしているので、かならず取り消す
   （A画面は「まだ音を鳴らしていない画面」なので、戻ったとたんに曲が鳴りだすと不自然なため） */
function goBackToBootFromResult() {
  /* ここでの変更は、ぜんぶ同じ処理の中で行うので、Vue はまとめて1回だけ描きなおす
     （「スコアが0のリザルト画面」や「B画面」が途中でチラッと見えることはない）
     消えかけのリザルト画面は <Transition> でもう描きなおされないので、結果が見えたままフェードアウトする */
  resetGame();

  cancelTitleBgmStart();
  stopTitleBgm();

  titleEntered.value = false;
}

/* Enter / Space を押したときに、いま選んでいるコマンドを実行する
   マウスでクリックしたときと同じ関数を、いる場所（currentEvent）と番号（selectedCommandIndex）で呼び分けるだけ */
function runSelectedCommand() {
  /* ゴール・GAME OVER画面（0 もう一度あそぶ／1 ← はじめの画面へ戻る）
     ※ 下の「結果表示中」にも当てはまることがあるので、いちばん先に見る */
  if (currentEvent.value === 'goal' || currentEvent.value === 'gameOver') {
    if (selectedCommandIndex.value === 1) {
      goBackToBootFromResult();
      return;
    }

    resetGame();
    return;
  }

  /* 結果表示中はコマンドが1つ（「次の場所を選ぶ」）なので、それを実行する
     ただし、いやいやが続いているときは、画面に出ているのはいやいやのコマンドなので、ここでは進めない */
  if (resultMessage.value && !isTantrumUnsolved.value) {
    goToNextPlace();
    return;
  }

  // おやつバッグを開いているあいだは、バッグの中を見る（メインコマンドのほうは見ない）
  if (isSnackMenuVisible.value) {
    if (selectedSnackMenuIndex.value === snackMenuBackIndex.value) {
      closeSnackMenu();
      return;
    }

    const snack = selectedSnacks.value[selectedSnackMenuIndex.value];

    if (snack) {
      eatSnackFromBag(snack.id);
    }

    return;
  }

  const index = selectedCommandIndex.value;

  // 通常の場所6か所で共通の「← 場所選びにもどる」は、switch の前でまとめて受け取る
  if (isNormalPlace.value && index === leavePlaceCommandIndex) {
    goToNextPlace();
    return;
  }

  switch (currentEvent.value) {
    /* 公園入口
       0 すべり台／1 砂場／2 どんぐりの木／3 池／4 芝生広場／5 秘密の小道（出ているときだけ）／ひとやすみ／ゴール
       ※ 秘密の小道が出ていないときは、ひとやすみとゴールが1つくり上がる
       ※ ゴールは、すぐには向かわず確認ダイアログを開く */
    case 'parkEntrance':
      if (index === 0) {
        goToPlace('slide');
      } else if (index === 1) {
        goToPlace('sandbox');
      } else if (index === 2) {
        goToPlace('acornArea');
      } else if (index === 3) {
        goToPlace('pond');
      } else if (index === 4) {
        goToPlace('grassArea');
      } else if (index === 5 && canEnterSecretSpot.value) {
        goToSecretArea();
      } else if (index === restCommandIndex.value) {
        goToPlace('restArea');
      } else if (index === goalCommandIndex.value) {
        openGoalConfirm();
      }
      break;

    /* すべり台（0 一緒にすべる／1 下で見守る） */
    case 'slide':
      if (index === 0) {
        runPlaceAction(placeActions.playSlide);
      } else if (index === 1) {
        runPlaceAction(placeActions.watchSlide);
      }
      break;

    /* 砂場（0 一緒に大きな山を作る／1 砂のトンネルを作る） */
    case 'sandbox':
      if (index === 0) {
        runPlaceAction(placeActions.playSandbox);
      } else if (index === 1) {
        runPlaceAction(placeActions.buildSandTunnel);
      }
      break;

    /* どんぐりの木（0 一緒にどんぐりを拾う／1 どんぐりをころがして遊ぶ） */
    case 'acornArea':
      if (index === 0) {
        runPlaceAction(placeActions.collectAcorns);
      } else if (index === 1) {
        runPlaceAction(placeActions.rollAcorns);
      }
      break;

    /* 池（0 白鳥を近くで見る／1 コイに餌をあげる） */
    case 'pond':
      if (index === 0) {
        runPlaceAction(placeActions.watchSwansClose);
      } else if (index === 1) {
        runPlaceAction(placeActions.feedKoi);
      }
      break;

    /* 芝生広場（0 追いかけっこする／1 シャボン玉で遊ぶ） */
    case 'grassArea':
      if (index === 0) {
        runPlaceAction(placeActions.playTagOnGrass);
      } else if (index === 1) {
        runPlaceAction(placeActions.playWithBubbles);
      }
      break;

    /* こもれびの広場（0 落ち葉の上を歩く／1 こもれびをつかまえる） */
    case 'secretSpot':
      if (index === 0) {
        runPlaceAction(placeActions.walkOnLeaves);
      } else if (index === 1) {
        runPlaceAction(placeActions.catchSunlight);
      }
      break;

    /* ひとやすみ（0 きゅうけいする／1 おやつにする（残っているときだけ）／最後 ← 場所選びにもどる）
       「おやつにする」はバッグを開くだけ。snackLeft も見るので、食べきったあとに 1 を押しても、まちがって開かない */
    case 'restArea':
      if (index === restBreakCommandIndex) {
        takeCommonBreak();
      } else if (index === restSnackCommandIndex && snackLeft.value > 0) {
        openSnackMenu('exploring');
      } else if (index === restLeaveCommandIndex.value) {
        goToNextPlace();
      }
      break;

    /* 秘密の小道（はじまる前 0 小道へ進む／1 ← 場所選びにもどる ／ 終わったあと 0 先へ進む）
       ※ 遊んでいる最中のキー操作は handleSecretPathKeydown() が受け取るので、ここへは来ない */
    case 'secretPath':
      if (index === 0 && secretPathPhase.value === 'ready') {
        startSecretPathGame();
      } else if (index === 1 && secretPathPhase.value === 'ready') {
        leaveSecretPathToEntrance();
      } else if (index === 0 && secretPathPhase.value === 'finished') {
        enterSecretSpotFromPath();
      }
      break;

    /* いやいやタイム（0 お話する／1 だっこ／2 おやつをあげる（残っているときだけ）／最後 少し待ってみる）
       「おやつをあげる」はバッグを開くだけ。snackLeft も見るので、空のバッグを開くことはない */
    case 'tantrum':
      if (index === talkCommandIndex) {
        talkToChild();
      } else if (index === hugCommandIndex) {
        hugChild();
      } else if (index === snackCommandIndex && snackLeft.value > 0) {
        openSnackMenu('tantrum');
      } else if (index === waitCommandIndex.value) {
        waitCalmly();
      }
      break;

    /* ここから下はとつぜんのできごと */

    /* 救急車のサイレン（0 救急車を探してみる／1 いっしょに音を聞く／2 手をふって応援する） */
    case 'emergencySiren':
      if (index === 0) {
        lookForAmbulance();
      } else if (index === 1) {
        listenToSiren();
      } else if (index === 2) {
        cheerOnAmbulance();
      }
      break;

    /* テントウムシ（0 いっしょにじっくり見る／1 そっと手を近づけてみる／2 ばいばいして見送る） */
    case 'ladybug':
      if (index === 0) {
        watchLadybug();
      } else if (index === 1) {
        holdLadybug();
      } else if (index === 2) {
        seeOffLadybug();
      }
      break;

    /* 犬が近づいてきた（0 近くで見せてもらう／1 だっこで少し離れて見る／2 道をあけて見送る） */
    case 'dog':
      if (index === 0) {
        watchDogClose();
      } else if (index === 1) {
        watchDogBehindParent();
      } else if (index === 2) {
        keepDistanceFromDog();
      }
      break;

    /* こうちゃんがころんだ（0 すぐにだっこする／1 いたいのいたいの／2 声をかけて待つ） */
    case 'fallDown':
      if (index === 0) {
        hugAfterFall();
      } else if (index === 1) {
        blowPainAway();
      } else if (index === 2) {
        watchAfterFall();
      }
      break;

    /* 噴水が出た（0 水しぶきの近くまで行く／1 少し離れてながめる／2 ぬれる前に離れる） */
    case 'fountain':
      if (index === 0) {
        goCloseToFountain();
      } else if (index === 1) {
        watchFountainFar();
      } else if (index === 2) {
        walkOnFromFountain();
      }
      break;
  }
}

/* キーボード操作（中身は composables/useKeyboardControls.ts）
   ※ Enter / Space で「どの遊びの関数を呼ぶか」を決める runSelectedCommand() は、ゲームの中身なので、このファイルに残してある */
const { gameScreenRef, moveSnackSelectionToHovered, focusTitleMainButton } = useKeyboardControls({
  titleEntered,
  gameStarted,
  isSnackSelectionOpen,
  isHowToPlayOpen,
  isRecordsOpen,
  isScreenChanging,
  currentEvent,
  resultMessage,
  selectedCommandIndex,
  selectedSnackMenuIndex,
  selectedGoalConfirmIndex,
  isPlaceMenuScene,
  isSnackMenuVisible,
  snackMenuBackIndex,
  commandCount,
  goalCommandIndex,
  isGoalConfirmVisible,
  getPlaceSelectionIndex,
  isSecretPathPlaying,
  startButtonRef,
  soundtrackButtonRef,
  minigameButtonRef,
  selectSnacksButtonRef,
  howToPlayButtonRef,
  backToBootButtonRef,
  recordsButtonRef,
  howToBackButtonRef,
  recordsBackButtonRef,
  snackSelectionRef,
  soundToggleButtonRef,
  soundVolumeSliderRef,
  runSelectedCommand,
  enterTitle,
  openSnackSelection,
  closeSnackSelection,
  closeHowToPlay,
  closeRecords,
  closeSnackMenu,
  cancelGoalConfirm,
  confirmGoToGoal,
  focusFirstSnackOption,
  pauseCommandPointer,
  handleSecretPathKeydown,
});

/* ホーム画面から起動しているか（standalone 表示か）を調べる（ブラウザにしか無いので、必ず onMounted から呼ぶ）
   ・display-mode: standalone … Android の Chrome・新しい iPhone の Safari
   ・navigator.standalone      … 古い iPhone の Safari だけにある目印（ほかのブラウザでは undefined） */
function checkStandalone() {
  const isIosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  isStandalone.value = window.matchMedia('(display-mode: standalone)').matches || isIosStandalone;
}

/* ※ キーボード操作の受付は useKeyboardControls()、秘密の小道のイベントは useSecretPathGame()、
     S+の曲の解放の読みこみは useGameResult() の中で登録している */
onMounted(() => {
  checkStandalone();

  // 止めたコマンド枠へのマウス操作を、マウスを動かしたら戻す（→ isCommandPointerPaused）
  window.addEventListener('pointermove', handleWindowPointer);
  window.addEventListener('pointerdown', handleWindowPointer);

  /* この先の画面で使う画像を、うしろで先に読みこんでおく
     （画面へ進んだときに、ボタンや文字だけが先に出て、画像があとから出ないように → utils/imagePreload.ts） */
  preloadGameImages();

  // A画面の「はじめる」へフォーカスを当てる（ほかのページから戻ってきたときも、ページが作り直されるのでここを通る）
  focusTitleMainButton();

  // A画面の「🎮 ミニゲーム」の NEW（一覧を見て戻ってきたときも、ページが作り直されるのでここで読みなおす）
  hasNewMinigame.value = loadNewMinigames().length > 0;

  /* 前回のサウンドの設定（ON/OFFと音量）を思い出す
     ※ ここではBGMを鳴らさない（開いた直後は音を鳴らせないので、「▶ はじめる」を押したときに鳴らしはじめる） */
  restoreSoundSettings();
});

/* 画面から離れるときの後始末（秘密の小道の片づけは、useSecretPathGame() の中の onUnmounted で行う） */
onUnmounted(() => {
  window.removeEventListener('pointermove', handleWindowPointer);
  window.removeEventListener('pointerdown', handleWindowPointer);

  // 別のページへ移ったあとも、BGMや「あとで鳴らす」予約が動きつづけないように
  cleanupAudio();

  hideTantrumAlert();
});
</script>

<template>
  <main class="game">
    <!-- ============================================================
         画面の切りかえ（A画面 ⇄ B画面 ⇄ あそびかた／おやつ選択 ⇄ ゲーム画面）

         同じページの中で v-if を切りかえて出し分け、<Transition> で短いフェードをはさむ
         mode="out-in" … 前の画面が消えきってから次の画面を出す（カードの位置がずれず、一瞬2つぶんの高さにもならない）
         消えていく画面は作りなおされないので、「もう一度あそぶ」で記録が初期値に戻っても、スコアは見えたままフェードアウトする
         ============================================================ -->
    <Transition name="screen-fade" mode="out-in" @before-leave="handleScreenLeaveStart" @after-leave="handleScreenLeaveEnd" @after-enter="handleScreenEnterEnd">
      <!-- ============================================================
           あそびかた画面（B画面から開く説明書。A画面・B画面・おやつ選択画面より優先して出すので、いちばん先に書く）

           ■ ルールと考えかたは教える。ただし正解までは教えない（あとから書き足すときも、ここは守ること）
             書かないもの：秘密の場所の名前と条件・おやつといやいやの相性・「少し待ってみる」の成功率・
             レベルごとの数字・くり返したときの効きにくさの数字・ナイス対応の組み合わせ・各行動のステータス増減
           ■ 文字は少なめにする（1項目1行。「〜する」「〜できるか」の短い言いかた）
           ■ 縦に長いので、見出しより下だけをスクロールして読む（上の「← 戻る」とサウンド・見出しは、いつも見えている）
             ↑↓キーでもスクロールでき、いちばん下・いちばん上では「← 戻る」へフォーカスが移る → useKeyboardControls.ts
           ============================================================ -->
      <div v-if="!gameStarted && isHowToPlayOpen" key="how-to-play" class="title-screen title-screen--reading">
        <div class="title-card title-card--howto">
          <!-- 上のツールバー（左：B画面へ戻る ／ 右：サウンド） -->
          <div class="title-card__tools">
            <!-- 見た目は「← 戻る」だけ（読み上げ用の名前は aria-label） -->
            <button ref="howToBackButtonRef" type="button" class="title-card__back" aria-label="ひとつ前の画面へ戻る" @click="closeHowToPlay">
              <span aria-hidden="true">← 戻る</span>
            </button>

            <!-- サウンドのコントロール（0% ＝ ミュートなので、ミュートボタンと音量スライダーは、いつも同じ状態になる） -->
            <SoundControl
              ref="soundControlRef"
              :sound-enabled="soundEnabled"
              :sound-volume-percent="soundVolumePercent"
              @toggle="toggleSound"
              @volume-change="changeSoundVolume" />
          </div>

          <h1 class="howto-heading">
            <span class="howto-heading__icon" aria-hidden="true">?</span>
            あそびかた
          </h1>

          <!-- 見出しより下（ここだけがスクロールする。上のツールバーと見出しは動かない → base.css の .howto-body） -->
          <div class="howto-body">
            <!-- 1. このゲームについて（秘密の場所は「特別な場所もあるみたい」までにとどめる） -->
            <section class="howto-section">
              <h2 class="howto-section__title">
                <span class="howto-section__num">1</span>
                こうちゃんと公園を探検しよう
              </h2>

              <ul class="howto-list">
                <li>朝9時〜12時、公園の場所を選んで探検。行動すると時間が進みます。</li>
                <li>12時になるか、出口へ向かうと結果発表。</li>
                <li>公園には、特別な場所もあるみたい。</li>
              </ul>

              <!-- 操作は「パソコンでもスマホでも遊べる」と分かる最低限だけ（ミニゲームの操作は、その画面に案内が出る） -->
              <p class="howto-note">
                <b class="howto-note__title">操作</b>
                クリック・矢印キー＋Enter・タップで遊べます。
              </p>
            </section>

            <!-- 2. ステータス（名前はゲーム画面の上部ステータスにそろえ、丸い印の色もゲージと同じにする） -->
            <section class="howto-section">
              <h2 class="howto-section__title">
                <span class="howto-section__num">2</span>
                ステータス
              </h2>

              <dl class="howto-terms">
                <div class="howto-terms__row">
                  <dt>
                    <span class="howto-dot howto-dot--child-energy"></span>
                    こうちゃんの体力
                  </dt>
                  <dd>元気に動ける力</dd>
                </div>

                <div class="howto-terms__row">
                  <dt>
                    <span class="howto-dot howto-dot--child-mood"></span>
                    こうちゃんの機嫌
                  </dt>
                  <dd>楽しい気分</dd>
                </div>

                <div class="howto-terms__row">
                  <dt>
                    <span class="howto-dot howto-dot--parent-energy"></span>
                    親の体力
                  </dt>
                  <dd>遊びやだっこで減る</dd>
                </div>

                <div class="howto-terms__row">
                  <dt>
                    <span class="howto-dot howto-dot--parent-calm"></span>
                    親の余裕
                  </dt>
                  <dd>落ち着いて対応できるか</dd>
                </div>

                <div class="howto-terms__row">
                  <dt>
                    <span class="howto-dot howto-dot--point"></span>
                    おでかけポイント
                  </dt>
                  <dd>体験すると増える</dd>
                </div>
              </dl>

              <!-- GAME OVER は雰囲気だけ伝える（判定の一覧にはしない） -->
              <p class="howto-note howto-note--caution">
                <b class="howto-note__title">GAME OVER</b>
                疲れすぎたり、余裕がなくなったりすると、途中で終わることも。
              </p>
            </section>

            <!-- 3. おやつ（どれが効くかは書かない。種類と数は snacks / maxSnackCount を見るので、変わっても直さなくてよい） -->
            <section class="howto-section">
              <h2 class="howto-section__title">
                <span class="howto-section__num">3</span>
                おやつ
              </h2>

              <ul class="howto-list">
                <li>出発前に{{ snacks.length }}種類から{{ maxSnackCount }}つ選びます。おやつごとに得意なことがちがいます。</li>
                <li>ひとやすみと、いやいやタイムで使えます。使うと減ります。</li>
              </ul>
            </section>

            <!-- 4. いやいやタイム（4つの対応の「しくみ」だけを書く）
                 対応の名前と並び順は、ゲーム画面のコマンドとそろえる（コマンドの順番を変えたら、ここも直すこと） -->
            <section class="howto-section">
              <h2 class="howto-section__title">
                <span class="howto-section__num">4</span>
                いやいやタイム
              </h2>

              <p class="howto-note howto-note--hint">💡 セリフや様子から、いやいやの理由を考えよう。</p>

              <h3 class="howto-subheading">4つの対応</h3>

              <dl class="howto-terms">
                <div class="howto-terms__row">
                  <dt>お話してみる</dt>
                  <dd>理由によって効きめが変わる</dd>
                </div>

                <div class="howto-terms__row">
                  <dt>だっこする</dt>
                  <dd>親の体力を使う</dd>
                </div>

                <div class="howto-terms__row">
                  <dt>おやつをあげる</dt>
                  <dd>おやつを1つ使う</dd>
                </div>

                <div class="howto-terms__row">
                  <dt>少し待ってみる</dt>
                  <dd>落ち着くことも、そうでないことも</dd>
                </div>
              </dl>

              <ul class="howto-list">
                <li>合わない対応だと、もっと強くなることも。</li>
                <li>同じ方法ばかりだと、効きにくくなることも。</li>
                <li>ぴったり合うと「ナイス対応」！</li>
              </ul>
            </section>
          </div>
        </div>
      </div>

      <!-- ============================================================
           これまでの記録の画面（B画面の「🏆 ハイスコア」の札から開く。あそびかた画面と同じく、A画面・B画面・おやつ選択画面より優先して出す）

           入れもの・ツールバー・見出し・セクションは、あそびかた画面と同じものを使う
           ・ハイスコア … 点数・ランク・見出し・日時と、そのときの記録（まだゴールしていないときは、そう書く）
           ・直近の記録 … 保存している件数ぜんぶ（リザルト画面のカードと同じ部品。いちばん上のハイスコアの帯は出さない）
           ============================================================ -->
      <div v-else-if="!gameStarted && isRecordsOpen" key="records" class="title-screen title-screen--reading">
        <div class="title-card title-card--howto">
          <!-- 上のツールバー（あそびかた画面と同じ。左：B画面へ戻る ／ 右：サウンド） -->
          <div class="title-card__tools">
            <button ref="recordsBackButtonRef" type="button" class="title-card__back" aria-label="ひとつ前の画面へ戻る" @click="closeRecords">
              <span aria-hidden="true">← 戻る</span>
            </button>

            <SoundControl
              ref="soundControlRef"
              :sound-enabled="soundEnabled"
              :sound-volume-percent="soundVolumePercent"
              @toggle="toggleSound"
              @volume-change="changeSoundVolume" />
          </div>

          <h1 class="howto-heading">
            <span class="howto-heading__icon" aria-hidden="true">🏆</span>
            これまでの記録
          </h1>

          <!-- 見出しより下（ここだけがスクロールする。上のツールバーと見出しは動かない。あそびかた画面と同じ） -->
          <div class="howto-body">
            <!-- ハイスコア（リザルト画面のエンディングカードと同じ金色。点数 → ランク → 見出し → 日時 → そのときの記録） -->
            <section class="howto-section records-best">
              <h2 class="howto-section__title">ハイスコア</h2>

              <template v-if="highScoreRecord">
                <p class="records-best__score">
                  <span class="sr-only">総合スコア</span>
                  <span class="records-best__scoreValue">{{ highScoreRecord.score }}</span>
                  <span class="records-best__scoreMax">/ 100</span>
                </p>

                <!-- ランクは英字だけ（「S+ランク」→「S+」。読み上げ用に「ランク」を足す） -->
                <p
                  class="records-best__rank"
                  :class="[`records-best__rank--${getRecordRankTier(highScoreRecord.rank ?? '')}`, { 'records-best__rank--text': !isLetterRank(highScoreRecord.rank ?? '') }]">
                  <span class="sr-only">ランク</span>{{ formatRecordRank(highScoreRecord.rank ?? '') }}
                </p>

                <p class="records-best__title">{{ highScoreRecord.title }}</p>

                <p class="records-best__date">{{ formatPlayedAt(highScoreRecord.playedAt) }}</p>

                <!-- そのときの記録（名前は、リザルト画面の「今日の記録」とそろえる） -->
                <ul class="record-list records-panel">
                  <li class="record-item">
                    <span>帰った時間</span>
                    <b>{{ highScoreRecord.returnTime }}</b>
                  </li>

                  <li class="record-item">
                    <span>おでかけポイント</span>
                    <b>{{ highScoreRecord.outingPoint }}</b>
                  </li>

                  <li class="record-item">
                    <span>見つけたもの</span>
                    <b>{{ highScoreRecord.collectedItemCount }} / {{ foundItemTotal }}</b>
                  </li>

                  <li class="record-item">
                    <span>探検した場所の数</span>
                    <b>{{ highScoreRecord.visitedPlaceCount }}か所</b>
                  </li>

                  <li class="record-item">
                    <span>遊んだ回数</span>
                    <b>{{ highScoreRecord.playCount }}回</b>
                  </li>

                  <li class="record-item">
                    <span>いやいや発生</span>
                    <b>{{ highScoreRecord.tantrumCount }}回</b>
                  </li>
                </ul>
              </template>

              <p v-else class="records-empty">まだゴールした記録はありません。</p>
            </section>

            <!-- 直近の記録（新しい順。保存している件数ぜんぶ） -->
            <section class="howto-section">
              <h2 class="howto-section__title">直近の記録</h2>

              <div class="records-panel">
                <GameRecordHistory
                  v-if="recentRecords.length > 0"
                  :high-score-record="highScoreRecord"
                  :recent-records="recentRecords"
                  :current-record="null"
                  :limit="recentGameRecordLimit"
                  :show-best="false" />

                <p v-else class="records-empty">まだ記録はありません。</p>
              </div>
            </section>
          </div>
        </div>
      </div>

      <!-- ============================================================
           起動画面（いちばん最初の1枚。ここで押した操作をきっかけに、タイトルBGMを鳴らしはじめる）
           ============================================================ -->
      <div v-else-if="!titleEntered" key="boot" class="title-screen">
        <div class="title-card title-card--boot">
          <!-- メインのボタンなので、HTMLではいちばん先に書く（Tab の順番を「はじめる → サウンドトラック → …」にするため）
               見た目の位置は、CSS の order でいちばん下のまま -->
          <button ref="startButtonRef" class="cmd cmd--start cmd--single" @click="enterTitle">はじめる</button>

          <!-- 上のツールバー（左：サウンドトラック・ミニゲームへの入口 ／ 右：サウンド） -->
          <div class="title-card__tools">
            <!-- どちらも押しても enterTitle() は呼ばず、タイトルBGMも鳴らさずに、それぞれのページへ移る -->
            <div class="title-card__toolsLeft">
              <!-- サウンドトラックへの入口（入りきる幅に合わせて、文字を出しわける）
                   390px以上 … 「♪ サウンドトラック」／ 341〜389px … 「♪ サントラ」／ 340px以下 … 「♪」だけ（hover / focus で吹き出し）
                   読み上げは、どの幅でも aria-label の「サウンドトラック」 -->
              <button ref="soundtrackButtonRef" type="button" class="title-card__soundtrack" aria-label="サウンドトラック" @click="goToSoundtrack">
                <span aria-hidden="true">♪</span>
                <span class="title-card__soundtrackText--full" aria-hidden="true">サウンドトラック</span>
                <span class="title-card__soundtrackText--short" aria-hidden="true">サントラ</span>
                <span class="title-card__tooltip" aria-hidden="true">サウンドトラック</span>
              </button>

              <!-- ミニゲームの一覧への入口（まだ1つも解放していなくても、いつも出す）
                   新しく解放して、まだ一覧で見ていないものがあれば、左上の角に NEW を付ける（一覧を開くと消える） -->
              <button ref="minigameButtonRef" type="button" class="title-card__minigame" @click="goToMinigame">
                <span v-if="hasNewMinigame" class="title-card__new">NEW</span>
                🎮 ミニゲーム
              </button>
            </div>

            <!-- サウンドのコントロール（この画面ではミュートボタンだけ）
                 A画面はまだBGMが鳴っていないので、スライダーを動かしても手ごたえがない（大きさはB画面以降で調整できる）
                 「はじめる」の前に音を消しておく役目は、ミュートボタンだけで足りる -->
            <SoundControl
              ref="soundControlRef"
              :sound-enabled="soundEnabled"
              :sound-volume-percent="soundVolumePercent"
              :show-volume="false"
              @toggle="toggleSound"
              @volume-change="changeSoundVolume" />
          </div>

          <!-- キービジュアル（大きさ・並び順は base.css の .title-card__visual） -->
          <NoImage class="title-card__visual" ratio="16 / 9" label="キービジュアル" />

          <h1 class="title-card__name">{{ gameTitle }}</h1>

          <!-- 「ホーム画面に追加」の案内（ふつうの Safari / Chrome で開いているときだけ。パソコンでは CSS でかくす）
               iPhone も Android も「ホーム画面に追加」という名前のメニューを選ぶので、その名前だけ伝える -->
          <p v-if="isStandalone === false" class="install-hint">📱 「ホーム画面に追加」で、アプリみたいに遊べるよ</p>
        </div>
      </div>

      <!-- ============================================================
           タイトル画面（ゲーム開始前。おやつ選択画面を開いているあいだは出さない）
           ============================================================ -->
      <div v-else-if="!gameStarted && !isSnackSelectionOpen" key="title" class="title-screen">
        <div class="title-card">
          <!-- メインのボタン（A画面と同じく、Tab の順番のために HTML ではいちばん先。見た目は CSS の order でいちばん下）
               ※ ここではまだゲームは始まらず、おやつ選択画面へ進む -->
          <button ref="selectSnacksButtonRef" class="cmd cmd--start cmd--single" @click="openSnackSelection">きょうのおやつを選ぶ</button>

          <!-- 上のツールバー（左：はじめの画面へ戻る ／ 右：？ あそびかた ＋ サウンド） -->
          <div class="title-card__tools">
            <!-- A画面の左上と同じ場所・同じ高さで出る（A→B で切り替えても、左上のボタンが入れかわるだけに見える）
                 見た目は「← 戻る」だけ（短いので、スマホ幅でも右上と横1行に収まる） -->
            <button ref="backToBootButtonRef" type="button" class="title-card__back" aria-label="はじめの画面へ戻る" @click="goBackToBoot">
              <span aria-hidden="true">← 戻る</span>
            </button>

            <!-- 右上のまとまり（とても細い画面で下の行へ回りこむときも、2ついっしょに右へ寄る） -->
            <div class="title-card__toolsRight">
              <!-- ？ あそびかた（スマホ幅では「?」だけにするので、読み上げ用の名前は aria-label に持たせる） -->
              <button ref="howToPlayButtonRef" type="button" class="title-card__howto" aria-label="あそびかた" @click="openHowToPlay">
                <span class="title-card__howtoIcon" aria-hidden="true">?</span>
                <span class="title-card__howtoText">あそびかた</span>
              </button>

              <SoundControl
                ref="soundControlRef"
                :sound-enabled="soundEnabled"
                :sound-volume-percent="soundVolumePercent"
                @toggle="toggleSound"
                @volume-change="changeSoundVolume" />
            </div>
          </div>

          <h1 class="title-card__name">{{ gameTitle }}</h1>

          <div class="title-card__rule">
            <p>
              <span class="title-card__phrase">9時〜12時の公園を、</span><span class="title-card__phrase">たくさん探検しよう！</span>
            </p>
          </div>

          <!-- これまでの記録の画面への入口（記録があるときだけ。記録は useGameResult.ts が onMounted で読む）
               ・ゴールしたことがあるとき … 「🏆 ハイスコア 88点 [S] ›」（ランクは英字だけのバッジ。読み上げは「Sランク」）
               ・GAME OVER の記録しか無いとき … 「📝 これまでの記録 ›」
               HTML ではカードのいちばん後ろなので、Tab ではサウンドのあと（見た目は CSS の order で、説明文の下）
               「›」は押せることを見せる飾りなので読み上げない。折り返しても「›」だけが次の行へ行かないよう、最後のかたまりに入れる -->
          <button v-if="highScoreRecord || recentRecords.length > 0" ref="recordsButtonRef" type="button" class="title-card__highscore" @click="openRecords">
            <template v-if="highScoreRecord">
              <span class="title-card__phrase">🏆 ハイスコア {{ formatRecordScore(highScoreRecord) }}</span>
              <span class="title-card__phrase">
                <span
                  class="title-card__highscoreRank"
                  :class="[`title-card__highscoreRank--${getRecordRankTier(highScoreRecord.rank ?? '')}`, { 'title-card__highscoreRank--text': !isLetterRank(highScoreRecord.rank ?? '') }]"
                  role="img"
                  :aria-label="highScoreRecord.rank ?? ''">
                  {{ formatRecordRank(highScoreRecord.rank ?? '') }}
                </span>
                <span class="title-card__highscoreArrow" aria-hidden="true">›</span>
              </span>
            </template>

            <span v-else class="title-card__phrase">📝 これまでの記録<span class="title-card__highscoreArrow" aria-hidden="true">›</span></span>
          </button>
        </div>
      </div>

      <!-- ============================================================
           おやつ選択画面（B画面とゲーム画面のあいだの準備画面。まだタイトルBGMは鳴ったまま）

           ■ HTMLの順番と、見える順番がちがう
             HTMLの順番 … おやつ → バッグ → 出発 → 上のツールバー
             見える順番 … 上のツールバー → 見出し → 説明 → おやつ → バッグ → 出発
             Tab は HTML の順番で動くので、最初のおやつから「おやつ → 出発 → 戻る・サウンド」と自然に進む
             （見た目は CSS の order で並べ直している）
           ■ おやつは v-for で snacks を並べる（増やすときは snacks へ1件足すだけ）
           ============================================================ -->
      <div v-else-if="!gameStarted" key="snack-selection" class="title-screen">
        <!-- ref … 中の押せるボタンを、矢印キーで見た目どおりに行き来させるための目印（出発・戻る・サウンドも入るので、カード全体に付ける）
             v-reveal-with-images … 絵がぜんぶ表示できるようになってから、カードごと出す（絵だけあとから出ないように） -->
        <div ref="snackSelectionRef" v-reveal-with-images class="title-card title-card--snack">
          <div class="snack-list">
            <!-- カードまるごとが1つのボタン（どこを押しても選べるほうが、マウスでも指でもねらいやすい）
                 :disabled … バッグがいっぱいで、まだ選んでいないおやつ（選んであるおやつは、もう一度押せば解除できる）
                 @mouseenter … マウスを乗せたカードへ、キーボードの居場所も移す（乗せただけでは選ばない）
                 $event … キーボードで選んだかどうかを見分けるため -->
            <button
              v-for="snack in snacks"
              :key="snack.id"
              type="button"
              class="snack-option"
              :class="{ 'snack-option--selected': isSnackSelected(snack.id) }"
              :disabled="isSnackBagFull && !isSnackSelected(snack.id)"
              :aria-pressed="isSnackSelected(snack.id)"
              @click="toggleSnackSelection(snack.id, $event)"
              @mouseenter="moveSnackSelectionToHovered">
              <!-- 絵と名前は1行にならべる（たてに積むと、背の低いスマホで1画面に入りきらなくなる）
                   alt="" … となりに名前があるので、絵はかざりとして読ませない（「グミ グミ」と2回読まれないように） -->
              <span class="snack-option__head">
                <span class="snack-option__icon">
                  <img class="snack-option__image" :src="snack.image" alt="" decoding="async" />
                </span>
                <span class="snack-option__name">{{ snack.name }}</span>
              </span>

              <!-- 回復量（食べるのにかかる時間は、スマホで1画面に収めるため出さない。ゲーム中の時計で分かる）
                   1つずつ span で包むのは、数字の途中で折り返さないようにするため（区切りの「／」は CSS で付ける） -->
              <span class="snack-option__effect">
                <span class="snack-option__stat">体力 +{{ snack.energy }}</span>
                <span class="snack-option__stat">機嫌 +{{ snack.mood }}</span>
              </span>

              <!-- 「✓ 選択中」の札は置かない（カードが縦に大きくなるため）
                   選んでいることは、カードの色と枠・下のおやつバッグ・:aria-pressed で伝える -->
            </button>
          </div>

          <!-- おやつバッグ（いま選んでいるおやつ） -->
          <div class="snack-bag">
            <p class="snack-bag__head">
              <!-- スマホでは「おやつバッグ」の文字を見た目から消して、リュックの絵だけにする（読み上げ用には残す） -->
              <span class="snack-bag__title">
                <span class="snack-bag__titleIcon">
                  <img class="snack-bag__titleImage" :src="snackBagImage" alt="" decoding="async" />
                </span>
                <span class="snack-bag__titleText">おやつバッグ</span>
              </span>

              <span class="snack-bag__count">{{ selectedSnackIds.length }} / {{ maxSnackCount }}</span>
            </p>

            <!-- 選んだおやつの札（細いスマホでは、名前を見た目から消して絵だけにする。読み上げ用には残す） -->
            <ul v-if="selectedSnacks.length > 0" class="snack-bag__list">
              <li v-for="snack in selectedSnacks" :key="snack.id" class="snack-bag__item">
                <span class="snack-bag__icon">
                  <img class="snack-bag__image" :src="snack.image" alt="" decoding="async" />
                </span>
                <span class="snack-bag__name">{{ snack.name }}</span>
              </li>
            </ul>

            <p v-else class="snack-bag__empty">まだ選んでいません</p>
          </div>

          <!-- 公園へ出発するボタン（そろうまでは押せない） -->
          <button type="button" class="cmd cmd--start cmd--single snack-go" :disabled="!canStartWithSnacks" @click="confirmSnacksAndStartGame">このおやつで公園へ行く！</button>

          <!-- 上のツールバー（Tab の順番のために HTML ではいちばん後ろ。見た目は CSS の order でいちばん上）
               戻っても選んだおやつは消さない -->
          <div class="title-card__tools">
            <button type="button" class="title-card__back" aria-label="ひとつ前の画面へ戻る" @click="closeSnackSelection">
              <span aria-hidden="true">← 戻る</span>
            </button>

            <SoundControl
              ref="soundControlRef"
              :sound-enabled="soundEnabled"
              :sound-volume-percent="soundVolumePercent"
              @toggle="toggleSound"
              @volume-change="changeSoundVolume" />
          </div>

          <h1 class="snack-heading">きょうのおやつ</h1>

          <!-- 2文目は、スマホでは出さない（1画面に収めるため。押してみればすぐ分かる）
               まだ1つも選んでいないときは見せない（バッグから出すものが無いので）
               場所は残しておく（出たり消えたりで、下のカードが上下に動かないように） -->
          <p class="snack-lead">
            おやつを{{ maxSnackCount }}つ選ぼう！
            <span class="snack-lead__sub" :class="{ 'snack-lead__sub--hidden': selectedSnacks.length === 0 }">
              <br />
              もう一度押すと、バッグから出せるよ
            </span>
          </p>
        </div>
      </div>

      <!-- ============================================================
           ゲーム画面（上部ステータス／中央イベント／下部コマンド）
           ============================================================ -->
      <!-- game-screen--secret-path … 秘密の小道で遊んでいる最中だけ付ける
           スマホ幅で、上部ステータスを いちばん上の行だけにたたみ、フィールドも縮めて、1画面に収めるため
           ※ 結果が出ているあいだの目印（scene--has-result）は、ここではなく場面ごとに付ける（→ sceneClass） -->
      <div
        v-else
        key="game"
        ref="gameScreenRef"
        class="game-screen"
        :class="{ 'game-screen--secret-path': currentEvent === 'secretPath' && secretPathPhase === 'playing' }">
        <!-- ==========================================================
             【上部】常時表示のステータスエリア
             ========================================================== -->
        <!-- 中身は components/game/StatusBar.vue（表示するだけ）
             サウンドのコントロールは音の処理とつながっているので、ここに残して #sound で差しこむ -->
        <StatusBar
          :game-title="gameTitle"
          :current-time="currentTime"
          :child-energy="childEnergy"
          :child-mood="childMood"
          :parent-energy="parentEnergy"
          :parent-calm="parentCalm"
          :outing-point="outingPoint"
          :snack-left="snackLeft"
          :collected-items="collectedItems"
          :status-changes="statusChanges"
          :fuss-energy-line="fussEnergyLine"
          :fuss-mood-line="fussMoodLine"
          :danger-energy-line="dangerEnergyLine"
          :danger-calm-line="dangerCalmLine"
          :is-child-energy-danger="isChildEnergyDanger"
          :is-parent-energy-danger="isParentEnergyDanger"
          :is-parent-calm-danger="isParentCalmDanger"
          :is-child-energy-fuss="isChildEnergyFuss"
          :is-child-mood-fuss="isChildMoodFuss"
          :is-almost-noon="isAlmostNoon || isTimeOver"
          :is-result-scene="isResultScene">
          <template #sound>
            <SoundControl
              variant="status"
              :sound-enabled="soundEnabled"
              :sound-volume-percent="soundVolumePercent"
              @toggle="toggleSound"
              @volume-change="changeSoundVolume" />
          </template>
        </StatusBar>

        <!-- ==========================================================
             【中央】イベント表示 ＋ 【下部】コマンド欄（場面ごとに .stage と .command を並べる）
             ========================================================== -->

        <!-- 場面の切り替え（mode="out-in" … 前が消えきってから次を出す。重ならないので位置がずれない） -->
        <Transition name="scene" mode="out-in">
          <!-- 公園入口 -->
          <div v-if="currentEvent === 'parkEntrance'" class="scene" :class="sceneClass" key="parkEntrance">
            <!-- stage--entrance … スマホ幅で、公園入口を1画面に収めるための目印 -->
            <section class="stage stage--entrance">
              <!-- place-card--entrance … 公園入口のカードだけ、中央エリアの残りの高さいっぱいに広げる（地図が大きくなる） -->
              <article class="place-card place-card--entrance">
                <!-- 公園入口では見出しは出さず、あいさつ文をいちばん上に出す（地図を大きく見せるため。どこにいるかは地図で分かる） -->
                <p class="place-card__text">{{ parkEntranceText }}</p>

                <!-- 公園の地図（絵の上に、行き先のボタンを置く）

                     ・絵は PC用（横長）とスマホ用（3:4）の2枚。差しかえて縦横比が変わったら、park-map.css の --park-map-ratio もそろえる
                     ・ボタンの置き場所は park-map.css で、箱のクラス（park-map__spot--slide など）ごとに決める
                     ・箱の並び順は番号順にしてある（Tab で動く順番が、番号の順番とずれないように）
                     ・矢印キーでは、地図の上で押した向きにある場所へ動く（data/parkMap.ts の表）
                     command--pointer-paused … 戻ってきた直後、マウスを動かすまでマウスで選べなくする
                     v-reveal-with-images … 地図の絵が表示できるようになってから、地図とボタンをいっしょに出す -->
                <nav v-reveal-with-images class="park-map" :class="{ 'command--pointer-paused': isCommandPointerPaused }" aria-label="どこへ行く？">
                  <!-- 地図の絵と同じ縦横比の板（絵とボタンを同じ板に乗せるので、画面の大きさが変わってもボタンは絵の同じ場所に乗ったまま） -->
                  <div class="park-map__canvas">
                    <!-- 地図の絵（切りかえる幅は、park-map.css の @media と同じ。場所の名前はボタンで読めるので、alt は空） -->
                    <picture class="park-map__base">
                      <source :media="`(max-width: ${parkMapImages.spMaxWidth}px)`" :srcset="parkMapImages.sp" />
                      <img class="park-map__img" :src="parkMapImages.pc" alt="" />
                    </picture>

                    <div class="park-map__spot park-map__spot--slide">
                      <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="goToPlace('slide')" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                        <span class="cmd__text">すべり台</span>
                        <!-- 探検済みのとなりに、その場所のアイテムを見つけたかも出す（まだ行っていない場所では出さない） -->
                        <span v-if="isVisited('slide')" class="cmd__badges">
                          <span class="cmd__badge"><span class="cmd__badgeIcon cmd__badgeIcon--compactOnly" aria-hidden="true">✓</span><span class="cmd__badgeText">探検済み</span></span>
                          <span v-if="hasFoundPlaceItem('slide')" class="cmd__badge cmd__badge--item-found"><span class="cmd__badgeIcon" aria-hidden="true">★</span> <span class="cmd__badgeText">発見済み</span></span>
                        </span>
                      </button>
                    </div>

                    <div class="park-map__spot park-map__spot--sandbox">
                      <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 1 }" @click="goToPlace('sandbox')" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                        <span class="cmd__text">砂場</span>
                        <span v-if="isVisited('sandbox')" class="cmd__badges">
                          <span class="cmd__badge"><span class="cmd__badgeIcon cmd__badgeIcon--compactOnly" aria-hidden="true">✓</span><span class="cmd__badgeText">探検済み</span></span>
                          <span v-if="hasFoundPlaceItem('sandbox')" class="cmd__badge cmd__badge--item-found"><span class="cmd__badgeIcon" aria-hidden="true">★</span> <span class="cmd__badgeText">発見済み</span></span>
                        </span>
                      </button>
                    </div>

                    <div class="park-map__spot park-map__spot--acorn">
                      <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 2 }" @click="goToPlace('acornArea')" @mouseenter="selectedCommandIndex = 2" @focus="selectedCommandIndex = 2">
                        <span class="cmd__text">どんぐりの木</span>
                        <span v-if="isVisited('acornArea')" class="cmd__badges">
                          <span class="cmd__badge"><span class="cmd__badgeIcon cmd__badgeIcon--compactOnly" aria-hidden="true">✓</span><span class="cmd__badgeText">探検済み</span></span>
                          <span v-if="hasFoundPlaceItem('acornArea')" class="cmd__badge cmd__badge--item-found"><span class="cmd__badgeIcon" aria-hidden="true">★</span> <span class="cmd__badgeText">発見済み</span></span>
                        </span>
                      </button>
                    </div>

                    <div class="park-map__spot park-map__spot--pond">
                      <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 3 }" @click="goToPlace('pond')" @mouseenter="selectedCommandIndex = 3" @focus="selectedCommandIndex = 3">
                        <span class="cmd__text">池</span>
                        <span v-if="isVisited('pond')" class="cmd__badges">
                          <span class="cmd__badge"><span class="cmd__badgeIcon cmd__badgeIcon--compactOnly" aria-hidden="true">✓</span><span class="cmd__badgeText">探検済み</span></span>
                          <span v-if="hasFoundPlaceItem('pond')" class="cmd__badge cmd__badge--item-found"><span class="cmd__badgeIcon" aria-hidden="true">★</span> <span class="cmd__badgeText">発見済み</span></span>
                        </span>
                      </button>
                    </div>

                    <div class="park-map__spot park-map__spot--grass">
                      <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 4 }" @click="goToPlace('grassArea')" @mouseenter="selectedCommandIndex = 4" @focus="selectedCommandIndex = 4">
                        <span class="cmd__text">芝生広場</span>
                        <span v-if="isVisited('grassArea')" class="cmd__badges">
                          <span class="cmd__badge"><span class="cmd__badgeIcon cmd__badgeIcon--compactOnly" aria-hidden="true">✓</span><span class="cmd__badgeText">探検済み</span></span>
                          <span v-if="hasFoundPlaceItem('grassArea')" class="cmd__badge cmd__badge--item-found"><span class="cmd__badgeIcon" aria-hidden="true">★</span> <span class="cmd__badgeText">発見済み</span></span>
                        </span>
                      </button>
                    </div>

                    <!-- 秘密の小道（見つけているときだけ出る） -->
                    <div v-if="canEnterSecretSpot" class="park-map__spot park-map__spot--secret">
                      <!-- cmd--new … 見つけたばかりで、まだ小道の先へ進んでいないあいだだけ、「NEW」の印を付けて光らせる -->
                      <button
                        class="cmd cmd--secret"
                        :class="{ 'cmd--selected': selectedCommandIndex === 5, 'cmd--new': hasNewSecretPath }"
                        @click="goToSecretArea"
                        @mouseenter="selectedCommandIndex = 5"
                        @focus="selectedCommandIndex = 5">
                        <span v-if="hasNewSecretPath" class="cmd__new">NEW</span>
                        <!-- 広場をもう見つけていれば、行き先の名前（こもれびの広場）にする -->
                        <span class="cmd__text">{{ hasDiscoveredSecretSpot ? 'こもれびの広場' : '秘密の小道' }}</span>
                        <span v-if="isVisited('secretSpot')" class="cmd__badges">
                          <span class="cmd__badge"><span class="cmd__badgeIcon cmd__badgeIcon--compactOnly" aria-hidden="true">✓</span><span class="cmd__badgeText">探検済み</span></span>
                          <span v-if="hasFoundPlaceItem('secretSpot')" class="cmd__badge cmd__badge--item-found"><span class="cmd__badgeIcon" aria-hidden="true">★</span> <span class="cmd__badgeText">発見済み</span></span>
                        </span>
                      </button>
                    </div>

                    <!-- きゅうけい（ひとやすみの画面へ。番号は秘密の小道が出ているかで変わるので restCommandIndex を見る） -->
                    <div class="park-map__spot park-map__spot--rest">
                      <button
                        class="cmd cmd--rest"
                        :class="{ 'cmd--selected': selectedCommandIndex === restCommandIndex }"
                        @click="goToPlace('restArea')"
                        @mouseenter="selectedCommandIndex = restCommandIndex"
                        @focus="selectedCommandIndex = restCommandIndex">
                        <span class="cmd__text">きゅうけい</span>
                      </button>
                    </div>

                    <!-- おうちへ帰る（ゴール。地図の下＝公園入口に置く。押すと確認ダイアログが開く） -->
                    <div class="park-map__spot park-map__spot--goal">
                      <button
                        class="cmd cmd--goal"
                        :class="{ 'cmd--selected': selectedCommandIndex === goalCommandIndex }"
                        @click="openGoalConfirm"
                        @mouseenter="selectedCommandIndex = goalCommandIndex"
                        @focus="selectedCommandIndex = goalCommandIndex">
                        <span class="cmd__text">おうちへ帰る</span>
                      </button>
                    </div>
                  </div>
                </nav>
              </article>

              <!-- 秘密の小道を見つけたことは、あいさつ文と「NEW」の印で知らせる -->
            </section>

            <!-- 公園入口には、下のコマンド欄を出さない（行き先もゴールも、ぜんぶ地図から選ぶ） -->
          </div>

          <!-- ひとやすみ（ベンチ。見た目と操作は通常の場所とそろえる）
               遊ぶ場所ではないので、探検済み・アイテム・いやいや・とつぜんのできごとは起きない -->
          <div v-else-if="currentEvent === 'restArea'" class="scene" :class="sceneClass" key="restArea">
            <section class="stage">
              <article class="place-card place-card--rest">
                <!-- 場所の絵（カードのいちばん上のバナー。どの場面も同じ大きさの枠。結果が出ているあいだは隠す → base.css / responsive.css）
                     絵のパスと縦横比は data/places.ts の placeBannerImages（とつぜんのできごとは data/game.ts の suddenEventBannerImages）
                     v-bind でまとめて渡すので、絵ができたときは data/ だけを書きかえればよい（まだ絵が無い場面は、仮の枠を出す） -->
                <NoImage class="place-card__banner" v-bind="placeBannerImages.restArea" />

                <h2 class="place-card__title">ひとやすみ</h2>

                <p class="place-card__text">ベンチでひと息。きゅうけいする？ おやつにする？</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンド欄（きゅうけいする／おやつにする／← 場所選びにもどる） -->
              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  v-model:snack-index="selectedSnackMenuIndex"
                  variant="rest"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :selected-snacks="selectedSnacks"
                  :snack-left="snackLeft"
                  :is-snack-menu-visible="isSnackMenuVisible"
                  :snack-menu-back-index="snackMenuBackIndex"
                  :leave-place-command-index="restLeaveCommandIndex"
                  @take-break="takeCommonBreak"
                  @open-snack-menu="openSnackMenu('exploring')"
                  @close-snack-menu="closeSnackMenu"
                  @eat-snack="eatSnackFromBag"
                  @leave="goToNextPlace"
                  @next="goToNextPlace" />
              </div>
            </section>
          </div>

          <!-- すべり台 -->
          <div v-else-if="currentEvent === 'slide'" class="scene" :class="sceneClass" key="slide">
            <section class="stage">
              <article class="place-card">
                <NoImage class="place-card__banner" v-bind="placeBannerImages.slide" />

                <h2 class="place-card__title">すべり台</h2>

                <p class="place-card__text">「すべるー！」小さな手で、とてとて階段をのぼりはじめました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンド欄（その場所の遊び2つ ＋ ← 場所選びにもどる） -->
              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  variant="place"
                  :commands="[{ label: '一緒にすべる' }, { label: '下で見守る' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => runPlaceAction([placeActions.playSlide, placeActions.watchSlide][index])"
                  @leave="goToNextPlace"
                  @next="goToNextPlace" />
              </div>
            </section>
          </div>

          <!-- 砂場 -->
          <div v-else-if="currentEvent === 'sandbox'" class="scene" :class="sceneClass" key="sandbox">
            <section class="stage">
              <article class="place-card">
                <NoImage class="place-card__banner" v-bind="placeBannerImages.sandbox" />

                <h2 class="place-card__title">砂場</h2>

                <p class="place-card__text">こうちゃんはさっそくスコップを手に取りました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  variant="place"
                  :commands="[{ label: '一緒に大きな山を作る' }, { label: '砂のトンネルを作る' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => runPlaceAction([placeActions.playSandbox, placeActions.buildSandTunnel][index])"
                  @leave="goToNextPlace"
                  @next="goToNextPlace" />
              </div>
            </section>
          </div>

          <!-- どんぐりの木 -->
          <div v-else-if="currentEvent === 'acornArea'" class="scene" :class="sceneClass" key="acornArea">
            <section class="stage">
              <article class="place-card">
                <NoImage class="place-card__banner" v-bind="placeBannerImages.acornArea" />

                <h2 class="place-card__title">どんぐりの木</h2>

                <p class="place-card__text">大きな木の下に、どんぐりがたくさん落ちています。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  variant="place"
                  :commands="[{ label: '一緒にどんぐりを拾う' }, { label: 'どんぐりをころがして遊ぶ' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => runPlaceAction([placeActions.collectAcorns, placeActions.rollAcorns][index])"
                  @leave="goToNextPlace"
                  @next="goToNextPlace" />
              </div>
            </section>
          </div>

          <!-- 池 -->
          <div v-else-if="currentEvent === 'pond'" class="scene" :class="sceneClass" key="pond">
            <section class="stage">
              <article class="place-card">
                <NoImage class="place-card__banner" v-bind="placeBannerImages.pond" />

                <h2 class="place-card__title">池</h2>

                <p class="place-card__text">「とりさん！」白鳥とコイを指さして大はしゃぎ。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  variant="place"
                  :commands="[{ label: '白鳥を近くで見る' }, { label: 'コイに餌をあげる' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => runPlaceAction([placeActions.watchSwansClose, placeActions.feedKoi][index])"
                  @leave="goToNextPlace"
                  @next="goToNextPlace" />
              </div>
            </section>
          </div>

          <!-- 芝生広場 -->
          <div v-else-if="currentEvent === 'grassArea'" class="scene" :class="sceneClass" key="grassArea">
            <section class="stage">
              <article class="place-card">
                <NoImage class="place-card__banner" v-bind="placeBannerImages.grassArea" />

                <h2 class="place-card__title">芝生広場</h2>

                <p class="place-card__text">やわらかい芝生。思いきり走り回れそう！</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  variant="place"
                  :commands="[{ label: '追いかけっこする' }, { label: 'シャボン玉で遊ぶ' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => runPlaceAction([placeActions.playTagOnGrass, placeActions.playWithBubbles][index])"
                  @leave="goToNextPlace"
                  @next="goToNextPlace" />
              </div>
            </section>
          </div>

          <!-- 秘密の小道（こもれびの広場へ続くミニゲーム。secretPathPhase で中身を切りかえる）
               ready … 説明と「小道へ進む」「← 場所選びにもどる」／ playing … 3レーンのフィールド ／ finished … 結果と「先へ進む」 -->
          <div v-else-if="currentEvent === 'secretPath'" class="scene" :class="sceneClass" key="secretPath">
            <!-- stage--secret-path … スマホ幅で、カードとコマンドボックスを横にはみ出させないための目印 -->
            <section class="stage stage--secret-path">
              <!-- はじまる前 -->
              <article v-if="secretPathPhase === 'ready'" class="place-card place-card--secret">
                <h2 class="place-card__title"><SecretPathIcon kind="sunlight" /> 秘密の小道</h2>

                <!-- スマホ幅では出さない -->
                <p class="place-card__text secret-path-intro">葉っぱのすき間から、光がちらちら。そっと小道へ。</p>

                <p class="secret-path-lead">
                  えだをよけながら
                  <br />
                  <SecretPathIcon kind="sunlight" /> こもれびをあつめよう！
                </p>

                <ul class="secret-path-rules">
                  <!-- 操作の説明は、パソコン向け（--pc）とスマホ向け（--touch）を CSS で出し分ける
                       ひと組（「← → / A D：左右に移動」など）の途中で折り返さないよう、span で包む -->
                  <li class="secret-path-for-pc">
                    <span class="secret-path-rules__part">← → / A D：左右に移動</span>
                    <span class="secret-path-rules__part">↑ / Space 長押し：はやく進む</span>
                  </li>
                  <li class="secret-path-for-pc">
                    <span class="secret-path-rules__part">🖱 クリック・ドラッグ：左右に移動</span>
                    <span class="secret-path-rules__part">長押し：はやく進む</span>
                  </li>
                  <li class="secret-path-for-touch">
                    <span class="secret-path-rules__part">👆 タップ・フリック：左右に移動</span>
                    <span class="secret-path-rules__part">長押し：はやく進む</span>
                  </li>
                  <!-- 「枝」「こもれび」の言葉のかわりに絵を置いているので、読み上げではその名前を読ませる（alt） -->
                  <li>
                    <span class="secret-path-rules__part"><SecretPathIcon kind="branch" alt="枝" />をよけて<SecretPathIcon kind="sunlight" alt="こもれび" />を集めよう！</span>
                    <span class="secret-path-rules__part">枝に当たると<SecretPathIcon kind="sunlight" alt="こもれび" />が1つへります</span>
                  </li>
                </ul>
              </article>

              <!-- 遊んでいる最中（ミニゲーム「どこまで行ける？」と同じ部品）
                   bump-penalty … こもれびが本当に減ったときだけ「-1」を出す ／ sparkle-label … 取ったときに出す文字 -->
              <SecretPathField
                v-else-if="secretPathPhase === 'playing'"
                :player-lane="secretPathPlayerLane"
                :items="secretPathItems"
                :flash-lane="secretPathFlashLane"
                :hover-destination="secretPathHoverDestination"
                :countdown-number="secretPathCountdownNumber"
                :is-start-cue-visible="isSecretPathStartCueVisible"
                :is-bumped="isSecretPathBumped"
                :bump-penalty="secretPathBumpLost ? 'sunlight' : null"
                :bump-id="secretPathBumpId"
                :is-sparkling="isSecretPathSparkling"
                sparkle-label="+1"
                :sparkle-id="secretPathSparkleId"
                :sunlight-count="secretPathSunlightCount"
                :sunlight-total="secretPathSunlightTotal"
                :is-sunlight-lost="isSecretPathBumped && secretPathBumpLost"
                :time-left="secretPathTimeLeft"
                :is-boosting="isSecretPathBoosting"
                @field-pointerdown="handleSecretPathPointerDown"
                @field-pointermove="handleSecretPathPointerMove"
                @field-pointerup="handleSecretPathPointerUp"
                @field-pointercancel="handleSecretPathPointerCancel"
                @field-pointerleave="handleSecretPathPointerLeave" />

              <!-- 小道をぬけたあと -->
              <article v-else class="place-card place-card--secret">
                <p class="place-card__flash">小道をぬけた！</p>

                <h2 class="place-card__title"><SecretPathIcon kind="sunlight" /> 秘密の小道</h2>

                <p class="secret-path-result">
                  <SecretPathIcon kind="sunlight" />
                  こもれび
                  <b>{{ secretPathSunlightCount }}</b>
                  / {{ secretPathSunlightTotal }}
                </p>

                <p class="place-card__text">{{ secretPathResultText }}</p>

                <p class="place-card__text secret-path-light">木々のすき間から、まぶしい光が差しこんできました。</p>

                <!-- こもれびボーナス（集めたときだけ。見た目は「✨ ナイス対応！」と同じ緑の枠） -->
                <div v-if="secretPathBonusPoint > 0" class="event-flash event-flash--nice">
                  <p class="event-flash__label"><SecretPathIcon kind="sunlight" /> こもれびボーナス！</p>

                  <ul class="event-flash__list">
                    <li class="event-flash__item">
                      <span class="event-flash__item-label">おでかけポイント</span>
                      <span class="event-flash__item-value change--good">{{ formatChange(secretPathBonusPoint) }}</span>
                    </li>
                  </ul>
                </div>

                <!-- ミニゲーム「どこまで行ける？」を、はじめて解放したときだけ（テントウムシの結果カードと同じ枠） -->
                <div v-if="unlockedMinigameNotice" class="event-flash event-flash--minigame" role="status">
                  <p class="event-flash__label">🎮 ミニゲーム解放！</p>

                  <p class="event-flash__text">
                    <span v-for="phrase in buildMinigameUnlockPhrases(unlockedMinigameNotice)" :key="phrase" class="event-flash__phrase">{{ phrase }}</span>
                  </p>

                  <p class="event-flash__note"><span class="event-flash__phrase">はじめの画面の「🎮 ミニゲーム」から</span><span class="event-flash__phrase">あそべます</span></p>
                </div>
              </article>

              <!-- コマンドボックス（遊んでいる最中は、コマンドのかわりに操作の案内だけを出す） -->
              <nav class="command-box" :class="[choiceGridClass, { 'command-box--pointer-paused': isCommandPointerPaused }]">
                <template v-if="secretPathPhase === 'playing'">
                  <p class="secret-path-guide secret-path-for-pc">
                    <span class="secret-path-guide__item">← → / A D：移動</span>
                    <span class="secret-path-guide__item">↑ / Space 長押し：加速</span>
                  </p>

                  <p class="secret-path-guide__hint secret-path-for-pc">🖱 クリック・ドラッグ：移動　長押し：加速</p>

                  <p class="secret-path-guide secret-path-for-touch">
                    <span class="secret-path-guide__item">👆 タップ・フリック：移動</span>
                    <span class="secret-path-guide__item">長押し：加速</span>
                  </p>
                </template>

                <!-- はじまる前（0 小道へ進む／1 ← 場所選びにもどる。もどっても時間もステータスも変わらない） -->
                <template v-else-if="secretPathPhase === 'ready'">
                  <p class="command-box__label">どうする？</p>

                  <button
                    class="command-box__item"
                    :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }"
                    @click="startSecretPathGame"
                    @mouseenter="selectedCommandIndex = 0"
                    @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">小道へ進む</span>
                  </button>

                  <!-- 見た目は短い「場所選びへ」（スマホ幅で「小道へ進む」と横にならべても1行に収まる。読み上げは aria-label） -->
                  <button
                    class="command-box__item"
                    :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }"
                    aria-label="場所選びにもどる"
                    @click="leaveSecretPathToEntrance"
                    @mouseenter="selectedCommandIndex = 1"
                    @focus="selectedCommandIndex = 1">
                    <span class="command-box__text" aria-hidden="true">場所選びへ</span>
                  </button>
                </template>

                <template v-else>
                  <p class="command-box__label">どうする？</p>

                  <button
                    class="command-box__item"
                    :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }"
                    @click="enterSecretSpotFromPath"
                    @mouseenter="selectedCommandIndex = 0"
                    @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">先へ進む</span>
                  </button>
                </template>
              </nav>
            </section>
          </div>

          <!-- 秘密の場所 -->
          <div v-else-if="currentEvent === 'secretSpot'" class="scene" :class="sceneClass" key="secretSpot">
            <section class="stage">
              <article class="place-card place-card--secret">
                <NoImage class="place-card__banner" v-bind="placeBannerImages.secretSpot" />

                <h2 class="place-card__title">こもれびの広場</h2>

                <p class="place-card__text">「きれいー！」こもれびが差しこむ、小さな広場に出ました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  variant="place"
                  :commands="[{ label: '落ち葉の上を歩く' }, { label: 'こもれびをつかまえる' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => runPlaceAction([placeActions.walkOnLeaves, placeActions.catchSunlight][index])"
                  @leave="goToNextPlace"
                  @next="goToNextPlace" />
              </div>
            </section>
          </div>

          <!-- いやいや中 -->
          <div v-else-if="currentEvent === 'tantrum'" class="scene" :class="sceneClass" key="tantrum">
            <section class="stage">
              <!-- いやいやタイムのカード
                   place-card--tantrum        … 赤っぽい見た目（いつも付ける）
                   place-card--tantrum-active … ゆっくりバウンスする動き（いやいや中だけ）
                   place-card--tantrum-big    … 大いやいや（レベル3）の見た目（付いた瞬間だけ、小さく2回ゆれる）
                   見た目と動きでクラスを分けているので、いやいやが終わると、色はそのままで動きだけが止まる
                   （付け外しは isTantrum で見る。終わっても画面は 'tantrum' のままなので） -->
              <article class="place-card place-card--tantrum" :class="{ 'place-card--tantrum-active': isTantrum, 'place-card--tantrum-big': tantrumLevel === 3 }">
                <!-- いやいやのこうちゃんの絵（激しさ＝レベルごとに絵が変わる。data/tantrum.ts の tantrumBannerImages）
                     レベルが上がるのは結果が出ているときなので、ほかのカードとちがい、結果が出ても隠さない -->
                <NoImage class="place-card__banner" :ratio="tantrumBannerRatio" :src="tantrumBannerImages[tantrumLevel]" />

                <!-- 見出しは、いやいやの激しさで変わる（数字の「Lv」は出さない） -->
                <h2 class="place-card__title">
                  <span class="tantrum-title__icon" aria-hidden="true">{{ currentTantrumLevelInfo.icon }}</span>
                  {{ currentTantrumLevelInfo.title }}
                </h2>

                <!-- いやいやの理由とレベルに合ったセリフと様子（理由の名前は出さず、様子から考えてもらう）
                     結果を読んでいるあいだも残す（片づけるのは、この画面から出るとき） -->
                <template v-if="currentTantrumReasonInfo">
                  <p class="tantrum-voice">「{{ currentTantrumReasonInfo.voices[tantrumLevel] }}」</p>
                  <p class="place-card__text">{{ currentTantrumScene }}</p>
                </template>

                <!-- 理由が決まっていないとき（ふつうは起きない）の予備の文 -->
                <p v-else class="place-card__text">「いやー！」その場にぺたんと座りこんでしまいました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="tantrum"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups"
                :nice-tantrum-response-text="niceTantrumResponseText"
                :nice-tantrum-bonus-outing-point="niceTantrumBonusOutingPoint"
                :nice-tantrum-bonus-parent-calm="niceTantrumBonusParentCalm" />

              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                v-model:snack-index="selectedSnackMenuIndex"
                variant="tantrum"
                :result-message="resultMessage"
                :next-place-command-label="nextPlaceCommandLabel"
                :grid-class="choiceGridClass"
                :pointer-paused="isCommandPointerPaused"
                :selected-snacks="selectedSnacks"
                :snack-left="snackLeft"
                :is-snack-menu-visible="isSnackMenuVisible"
                :snack-menu-back-index="snackMenuBackIndex"
                :is-tantrum-unsolved="isTantrumUnsolved"
                :talk-command-index="talkCommandIndex"
                :hug-command-index="hugCommandIndex"
                :snack-command-index="snackCommandIndex"
                :wait-command-index="waitCommandIndex"
                :wait-command-label="waitCommandLabel"
                @talk="talkToChild"
                @hug="hugChild"
                @wait="waitCalmly"
                @open-snack-menu="openSnackMenu('tantrum')"
                @close-snack-menu="closeSnackMenu"
                @eat-snack="eatSnackFromBag"
                @next="goToNextPlace" />
            </section>
          </div>

          <!-- とつぜんのできごと：救急車のサイレン！ -->
          <div v-else-if="currentEvent === 'emergencySiren'" class="scene" :class="sceneClass" key="emergencySiren">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <NoImage class="place-card__banner" v-bind="suddenEventBannerImages.emergencySiren" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🚑 救急車のサイレン！</h2>

                <p class="place-card__text">「きゅうきゅうしゃ、どこ？」遠くからピーポーピーポー。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: '救急車を|探して|みる' }, { label: 'いっしょに|音を聞く' }, { label: '手をふって|応援する' }]"
                :result-message="resultMessage"
                :next-place-command-label="nextPlaceCommandLabel"
                :grid-class="choiceGridClass"
                :pointer-paused="isCommandPointerPaused"
                @select="index => [lookForAmbulance, listenToSiren, cheerOnAmbulance][index]()"
                @next="goToNextPlace" />
            </section>
          </div>

          <!-- とつぜんのできごと：テントウムシ発見！ -->
          <div v-else-if="currentEvent === 'ladybug'" class="scene" :class="sceneClass" key="ladybug">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <NoImage class="place-card__banner" v-bind="suddenEventBannerImages.ladybug" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🐞 テントウムシ発見！</h2>

                <p class="place-card__text">「てんとうむし！」葉っぱの前にしゃがみこみました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups"
                :unlocked-minigame-title="unlockedMinigameNotice" />

              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: 'いっしょに|じっくり|見る' }, { label: 'そっと|手を|近づけて|みる' }, { label: 'ばいばい|して|見送る' }]"
                :result-message="resultMessage"
                :next-place-command-label="nextPlaceCommandLabel"
                :grid-class="choiceGridClass"
                :pointer-paused="isCommandPointerPaused"
                @select="index => [watchLadybug, holdLadybug, seeOffLadybug][index]()"
                @next="goToNextPlace" />
            </section>
          </div>

          <!-- とつぜんのできごと：犬が近づいてきた！ -->
          <div v-else-if="currentEvent === 'dog'" class="scene" :class="sceneClass" key="dog">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <NoImage class="place-card__banner" v-bind="suddenEventBannerImages.dog" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🐕 犬が近づいてきた！</h2>

                <p class="place-card__text">「わんわん！」散歩中の犬が、しっぽをふってやってきました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: '近くで|見せて|もらう' }, { label: 'だっこで|少し|離れて|見る' }, { label: '道をあけて|見送る' }]"
                :result-message="resultMessage"
                :next-place-command-label="nextPlaceCommandLabel"
                :grid-class="choiceGridClass"
                :pointer-paused="isCommandPointerPaused"
                @select="index => [watchDogClose, watchDogBehindParent, keepDistanceFromDog][index]()"
                @next="goToNextPlace" />
            </section>
          </div>

          <!-- とつぜんのできごと：こうちゃんがころんだ！ -->
          <div v-else-if="currentEvent === 'fallDown'" class="scene" :class="sceneClass" key="fallDown">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <NoImage class="place-card__banner" v-bind="suddenEventBannerImages.fallDown" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">💦 こうちゃんがころんだ！</h2>

                <p class="place-card__text">「いたい……」つまずいて、ひざを見ています。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: 'すぐに|だっこする' }, { label: '「いたいの|いたいの|とんでけ」' }, { label: '「大丈夫？」|と|声を|かけて|待つ' }]"
                :result-message="resultMessage"
                :next-place-command-label="nextPlaceCommandLabel"
                :grid-class="choiceGridClass"
                :pointer-paused="isCommandPointerPaused"
                @select="index => [hugAfterFall, blowPainAway, watchAfterFall][index]()"
                @next="goToNextPlace" />
            </section>
          </div>

          <!-- とつぜんのできごと：噴水が出た！ -->
          <div v-else-if="currentEvent === 'fountain'" class="scene" :class="sceneClass" key="fountain">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <NoImage class="place-card__banner" v-bind="suddenEventBannerImages.fountain" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">⛲ 噴水が出た！</h2>

                <p class="place-card__text">「わあ！」噴水から勢いよく水が飛び出しました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: '水しぶきの|近くまで|行く' }, { label: '少し|離れて|ながめる' }, { label: 'ぬれる前に|離れる' }]"
                :result-message="resultMessage"
                :next-place-command-label="nextPlaceCommandLabel"
                :grid-class="choiceGridClass"
                :pointer-paused="isCommandPointerPaused"
                @select="index => [goCloseToFountain, watchFountainFar, walkOnFromFountain][index]()"
                @next="goToNextPlace" />
            </section>
          </div>

          <!-- ゴール（scene--result … 小さいスマホで1画面に押しこまず、自然にスクロールさせるための、CSS専用の目印） -->
          <div v-else-if="currentEvent === 'goal'" class="scene scene--result" :class="sceneClass" key="goal">
            <section class="stage">
              <!-- 総合スコア ＋ ランク ＋ 結果メッセージ（SランクとS+ランクのときだけ、カードがきらきら光る） -->
              <article class="ending-card" :class="{ 'ending-card--s': endingRank === 'Sランク' || endingRank === 'S+ランク' }">
                <!-- 「72 / 100」だけで点数と分かるので、「総合スコア」の見出しは読み上げ用だけ -->
                <p class="ending-card__score">
                  <span class="sr-only">総合スコア</span>
                  <span class="ending-card__score-value">{{ finalScore }}</span>
                  <span class="ending-card__score-max">/ 100</span>
                </p>

                <!-- ハイスコア（どちらか1つ。点数とくらべやすいよう、点数のすぐ下に出す）
                     ・前のハイスコアをこえたとき … 金色の札「🏆 ハイスコア更新！」（role="status" で読み上げにも伝える）
                     ・こえなかったとき … 「🏆 ハイスコア 88点　前回 72点」を小さく
                     はじめての記録のときは、どちらも出さない（→ utils/gameRecords.ts の addGameRecord()）
                     ※ 下のランクのバッジは inline-block なので、横にならばないよう、行そのものはブロックにして札を中に入れる -->
                <p v-if="isHighScoreUpdated" class="ending-card__highscore" role="status">
                  <span class="ending-card__highscoreBadge">🏆 ハイスコア更新！</span>
                </p>

                <p v-else-if="previousHighScoreRecord && highScoreRecord" class="ending-card__highscore">
                  <span>🏆 ハイスコア {{ formatRecordScore(highScoreRecord) }}</span>
                  <span v-if="previousRecord">前回 {{ formatRecordScore(previousRecord) }}</span>
                </p>

                <!-- 今回のランク（いちばん大事なところなので、大きなバッジにする） -->
                <p class="ending-card__rank">{{ endingRank }}</p>

                <h3 class="ending-card__title">{{ endingTitle }}</h3>

                <p class="ending-card__text">{{ endingMessage }}</p>

                <!-- うた入りエンディングBGMの小さな表示（どれか1つだけ。スコアや結果の文をじゃましないように）
                     ・S+で、はじめて解放したとき … 「✨ 新しい曲が追加されました！」＋ 曲名（role="status" で読み上げにも伝える）
                     ・S+で、もう解放済みのとき   … 「♪ 曲名」だけ
                     ・A／Sで、まだ解放していないとき … 「🔒 …なにかあるみたい…」のヒント（→ utils/sPlusSong.ts の shouldShowSPlusSongHint()） -->
                <p v-if="isSPlusSongNewlyUnlocked" class="ending-card__song ending-card__song--new" role="status">
                  <span>✨ サウンドトラックに新しい曲が追加されました！</span>
                  <span>「{{ sPlusSongTitle }}」</span>
                </p>

                <p v-else-if="endingRank === 'S+ランク'" class="ending-card__song">♪ {{ sPlusSongTitle }}</p>

                <!-- S+のヒント（何がもらえるか・何点からS+かは書かない）
                     ※ role="status" は付けない（いま起きたことのお知らせではなく、画面といっしょに出る案内なので） -->
                <p v-else-if="isSPlusSongHintVisible" class="ending-card__song ending-card__song--locked">🔒 S+ランクを とると、なにかあるみたい…</p>
              </article>

              <!-- スコア内訳（プラスは緑・マイナスは赤。formatChange() と changeClass() を使いまわす） -->
              <article class="score-card">
                <h3 class="score-card__title">スコア内訳</h3>

                <ul class="score-list">
                  <li v-for="row in scoreBreakdown" :key="row.label" class="score-item">
                    <span class="score-item__label">{{ row.label }}</span>
                    <span class="score-item__value" :class="changeClass('score', row.points)">{{ formatChange(row.points) }}</span>
                  </li>
                </ul>
              </article>

              <!-- 横並びにする2枚のカード（記録／見つけたもの） -->
              <div class="record-grid">
                <article class="record-card">
                  <h3 class="record-card__title">今日の記録</h3>

                  <ul class="record-list">
                    <li class="record-item">
                      <span>こうちゃんの体力</span>
                      <b>{{ childEnergy }}</b>
                    </li>

                    <li class="record-item">
                      <span>こうちゃんの機嫌</span>
                      <b>{{ childMood }}</b>
                    </li>

                    <li class="record-item">
                      <span>親の体力</span>
                      <b>{{ parentEnergy }}</b>
                    </li>

                    <li class="record-item">
                      <span>親の余裕</span>
                      <b>{{ parentCalm }}</b>
                    </li>

                    <li class="record-item">
                      <span>おでかけポイント</span>
                      <b>{{ outingPoint }}</b>
                    </li>

                    <li class="record-item">
                      <span>いやいや発生</span>
                      <b>{{ tantrumCount }}回</b>
                    </li>

                    <li class="record-item">
                      <span>探検した場所の数</span>
                      <b>{{ visitedPlaces.length }}か所</b>
                    </li>

                    <li class="record-item">
                      <span>遊んだ回数</span>
                      <b>{{ playCount }}回</b>
                    </li>

                    <li class="record-item">
                      <span>帰った時間</span>
                      <b>{{ currentTime }}</b>
                    </li>
                  </ul>
                </article>

                <!-- 見つけたもの（図鑑のような6つのマス。見出しの右の「3 / 6」は、ぜんぶ見つけたら金色） -->
                <article class="record-card">
                  <h3 class="record-card__title record-card__title--found">
                    見つけたもの
                    <span class="record-card__count" :class="{ 'record-card__count--complete': collectedItems.length >= foundItemTotal }">
                      {{ collectedItems.length }} / {{ foundItemTotal }}
                    </span>
                  </h3>

                  <FoundItemCollection :collected-items="collectedItems" />
                </article>
              </div>

              <!-- これまでの記録（ハイスコアと直近の記録。今回のプレイがいちばん上。中身は GameRecordHistory.vue） -->
              <article class="record-card">
                <h3 class="record-card__title">これまでの記録</h3>

                <GameRecordHistory :high-score-record="highScoreRecord" :recent-records="recentRecords" :current-record="currentRecord" />
              </article>
            </section>

            <!-- ボタンは2つ（← → で行き来して Enter / Space で押す。リザルトがスクロールするときは、↑↓ はスクロールに使う）
                 command--result … スマホ幅でも2つを横にならべる
                 command--pointer-paused … キーでスクロールした直後、マウスを動かすまでマウスで選べなくする -->
            <nav class="command command--result" :class="{ 'command--pointer-paused': isCommandPointerPaused }">
              <button class="cmd cmd--next" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="resetGame" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                <span class="cmd__text">もう一度あそぶ</span>
              </button>

              <!-- はじめの画面へ戻る（主役は「もう一度あそぶ」なので、色は控えめ）
                   @keydown.enter.stop / .space.stop … Tab で来て押したとき、同じキーが window の handleKeydown にも伝わって、
                   「選んでいるコマンド」まで実行されてしまうのを止める（矢印キーは止めない） -->
              <button
                class="cmd cmd--sub cmd--back"
                :class="{ 'cmd--selected': selectedCommandIndex === 1 }"
                aria-label="はじめの画面へ戻る"
                @click="goBackToBootFromResult"
                @mouseenter="selectedCommandIndex = 1"
                @focus="selectedCommandIndex = 1"
                @keydown.enter.stop
                @keydown.space.stop>
                <span class="cmd__text" aria-hidden="true">はじめに戻る</span>
              </button>
            </nav>
          </div>

          <!-- GAME OVER（限界をむかえて途中で終わったとき。ランクの判定はしない） -->
          <div v-else-if="currentEvent === 'gameOver'" class="scene scene--gameover" :class="sceneClass" key="gameOver">
            <section class="stage">
              <article class="gameover-card">
                <p class="gameover-card__label">GAME OVER</p>

                <h2 class="gameover-card__title">{{ gameOverTitle }}</h2>

                <p class="gameover-card__text">{{ gameOverMessage }}</p>
              </article>

              <div class="record-grid">
                <article class="record-card">
                  <h3 class="record-card__title">今日の記録</h3>

                  <ul class="record-list">
                    <li class="record-item">
                      <span>こうちゃんの体力</span>
                      <b>{{ childEnergy }}</b>
                    </li>

                    <li class="record-item">
                      <span>こうちゃんの機嫌</span>
                      <b>{{ childMood }}</b>
                    </li>

                    <li class="record-item">
                      <span>親の体力</span>
                      <b>{{ parentEnergy }}</b>
                    </li>

                    <li class="record-item">
                      <span>親の余裕</span>
                      <b>{{ parentCalm }}</b>
                    </li>

                    <li class="record-item">
                      <span>おでかけポイント</span>
                      <b>{{ outingPoint }}</b>
                    </li>

                    <li class="record-item">
                      <span>いやいや発生</span>
                      <b>{{ tantrumCount }}回</b>
                    </li>

                    <li class="record-item">
                      <span>探検した場所の数</span>
                      <b>{{ visitedPlaces.length }}か所</b>
                    </li>

                    <li class="record-item">
                      <span>遊んだ回数</span>
                      <b>{{ playCount }}回</b>
                    </li>

                    <li class="record-item">
                      <span>帰宅時刻</span>
                      <b>{{ currentTime }}</b>
                    </li>
                  </ul>
                </article>

                <article class="record-card">
                  <h3 class="record-card__title record-card__title--found">
                    見つけたもの
                    <span class="record-card__count" :class="{ 'record-card__count--complete': collectedItems.length >= foundItemTotal }">
                      {{ collectedItems.length }} / {{ foundItemTotal }}
                    </span>
                  </h3>

                  <FoundItemCollection :collected-items="collectedItems" />
                </article>
              </div>

              <!-- これまでの記録（ゴールの画面と同じ） -->
              <article class="record-card">
                <h3 class="record-card__title">これまでの記録</h3>

                <GameRecordHistory :high-score-record="highScoreRecord" :recent-records="recentRecords" :current-record="currentRecord" />
              </article>
            </section>

            <!-- ボタンは2つ（ゴールの画面と同じ） -->
            <nav class="command command--result" :class="{ 'command--pointer-paused': isCommandPointerPaused }">
              <button class="cmd cmd--next" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="resetGame" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                <span class="cmd__text">もう一度あそぶ</span>
              </button>

              <!-- @keydown.enter.stop / .space.stop の理由は、ゴールの画面と同じ -->
              <button
                class="cmd cmd--sub cmd--back"
                :class="{ 'cmd--selected': selectedCommandIndex === 1 }"
                aria-label="はじめの画面へ戻る"
                @click="goBackToBootFromResult"
                @mouseenter="selectedCommandIndex = 1"
                @focus="selectedCommandIndex = 1"
                @keydown.enter.stop
                @keydown.space.stop>
                <span class="cmd__text" aria-hidden="true">はじめに戻る</span>
              </button>
            </nav>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- いやいや発生の演出（新しいいやいやが始まった瞬間だけ、2秒ほど重ねて出す）
         どの画面の上にも同じように重ねるため、main のいちばん最後に置く -->
    <div v-if="tantrumAlertVisible" class="tantrum-alert">
      <div class="tantrum-alert__content">
        <strong class="tantrum-alert__title">いやいや発生！</strong>
      </div>
    </div>

    <!-- 「出口へ向かう？」の確認ダイアログ
         @click.self … カードの外（うしろの暗いところ）をクリックしたら閉じる（カードの中では閉じない）
         キーボード操作は handleKeydown() の中で受け取っている -->
    <div v-if="isGoalConfirmVisible" class="goal-confirm" @click.self="cancelGoalConfirm">
      <div class="goal-confirm__content" role="alertdialog" aria-modal="true" aria-labelledby="goal-confirm-title" aria-describedby="goal-confirm-text">
        <p id="goal-confirm-title" class="goal-confirm__title">出口へ向かう？</p>

        <p id="goal-confirm-text" class="goal-confirm__text">おでかけを終えて、結果発表へ。</p>

        <p class="goal-confirm__time">{{ goalConfirmTimeText }}</p>

        <div class="goal-confirm__buttons">
          <button type="button" class="cmd goal-confirm__button" :class="{ 'cmd--selected': selectedGoalConfirmIndex === 0 }" @click="cancelGoalConfirm" @mouseenter="selectedGoalConfirmIndex = 0">
            <span class="cmd__text">もう少し遊ぶ</span>
          </button>

          <button
            type="button"
            class="cmd cmd--goal goal-confirm__button"
            :class="{ 'cmd--selected': selectedGoalConfirmIndex === 1 }"
            @click="confirmGoToGoal"
            @mouseenter="selectedGoalConfirmIndex = 1">
            <span class="cmd__text">出口へ向かう</span>
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<!-- ゲーム画面のCSSは assets/css/game.css（このファイルが長くなりすぎるので分けた。src で読みこんでも scoped のまま同じあつかい） -->
<style scoped src="~/assets/css/game.css"></style>
