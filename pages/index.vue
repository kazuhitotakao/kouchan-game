<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { sPlusSongTitle } from '~/utils/sPlusSong';
import { changeClass, formatChange } from '~/utils/statusChange';

/* ミニゲームの解放を保存する（本編で解放したとき） */
import { unlockMinigame } from '~/utils/minigameStorage';

/* 画面に出す文の組み立て（いまどんな状態か → 出す文） */
import { buildGoalConfirmTimeText, buildParkEntranceText } from '~/utils/gameText';

/* ゲームの時計まわりの計算（いまの時刻から、何分か進んだ時刻を出す）
   「09:25」の文字を分の数に直すほうは、composables/useGameState.ts のなかで使っている */
import { addMinutesToTime } from '~/utils/gameTime';

/* ゲーム画面の部品（どれも表示と、押されたことを伝えるだけ）
   行動の中身・ステータスの計算・キーボード操作は、このファイルに残してある */
import CommandBox from '~/components/game/CommandBox.vue';
import ResultCard from '~/components/game/ResultCard.vue';
import SecretPathField from '~/components/game/SecretPathField.vue';
import SoundControl from '~/components/game/SoundControl.vue';

/* 画像の置き場所（まだ画像が無いあいだは「NO IMAGE」の仮の枠を出す）
   起動画面のキービジュアルと、公園入口・場所・いやいや・できごとのカードの上のバナーで使う */
import NoImage from '~/components/common/NoImage.vue';

/* キーボード操作（中身は composables/useKeyboardControls.ts） */
import { useKeyboardControls } from '~/composables/useKeyboardControls';

/* いやいや（かんしゃく）の判定と結果（中身は composables/useTantrum.ts） */
import { useTantrum } from '~/composables/useTantrum';

/* ゲームが終わったあとの結果（中身は composables/useGameResult.ts）
   スコア・ランク・GAME OVERの文章・S+の曲の解放を持っておくところ
   計算そのものは composables/useScore.ts、localStorage は utils/sPlusSong.ts のまま */
import { useGameResult } from '~/composables/useGameResult';

/* 通常の行動1回ぶんの結果（中身は composables/useActionResult.ts）
   結果の文章・今回の変化・見つけたもの・ちょっとしたできごとを持っておくところ
   行動の中身（ステータスの増減・アイテム取得・抽選）は、このファイルに残してある */
import { useActionResult } from '~/composables/useActionResult';

/* きょうのおやつ（中身は composables/useSnackBag.ts）
   バッグの中身と、そこから決まる表示用の値・出し入れを持っておくところ
   おやつ選択画面の操作と、おやつを食べる行動は、このファイルに残してある */
import { useSnackBag } from '~/composables/useSnackBag';

/* 秘密の小道（ミニゲーム）の「状態を持つ側」（中身は composables/useSecretPathGame.ts）
   ミニゲームの中の状態・1コマごとの処理・キー操作・ポインター操作・小道専用のイベントは、ぜんぶあちら
   ここは、ゲーム全体の状態と画面の切りかえ・音を渡してつなぐだけ */
import { useSecretPathGame } from '~/composables/useSecretPathGame';

/* ランダムイベントの抽選だけを取り出したもの
   「起こるか」「何が起きるか」を決めて返す（ステータスは動かさない） */
import { drawRandomEvent } from '~/composables/useRandomEvent';

/* 場所のアイテムが見つかるかの判定だけを取り出したもの
   見つかったアイテムの名前を返す（持ちものは書きかえない） */
import { judgePlaceItem } from '~/composables/usePlaceItem';

/* とつぜんのできごとの抽選だけを取り出したもの
   起こすできごとを返す（予定表には書かない） */
import { drawSuddenEvent } from '~/composables/useSuddenEvent';

/* 疲れ・空腹で機嫌が下がる分の判定だけを取り出したもの
   下がる分を返す（機嫌そのものは減らさない） */
import { judgeMoodDrop } from '~/composables/useMoodDrop';

/* おでかけポイントの加算量の計算だけを取り出したもの
   もらえる分を返す（ポイントそのものは足さない） */
import { judgeOutingPoint } from '~/composables/useOutingPoint';

/* ゲームのステータス・おでかけポイント・ゲーム内時間の入れもの（中身は composables/useGameState.ts）
   入れものを置く場所だけをあちらへ移したもの
   ステータスを上げ下げする行動の中身や、時間を進める処理は、このファイルに残してある */
import { useGameState } from '~/composables/useGameState';

/* 音（効果音・BGM・音量）のまとめ（中身は composables/useAudio.ts）
   鳴らす・止める・音量を変えるところだけを受けもつ
   「いつどの曲へ切りかえるか」の判断は、今までどおりこのファイルに残してある */
import { useAudio } from '~/composables/useAudio';
import StatusBar from '~/components/game/StatusBar.vue';

/* ゲームで使う型（どんな形のデータか、という決めごとだけ）
   中身は types/game.ts にまとめてある
   import type と書いてあるので、ビルドするとこの行はまるごと消える */
import type {
  GameEvent,
  ItemPlace,
  SnackId,
  SnackUseContext,
} from '~/types/game';

/* ゲーム中に変わらない設定データ
   （ゲーム全体の設定・場所とアイテム・場所での行動・秘密の小道の設定・
     おやつの種類と回復量・いやいやのセリフ・相性表）

   ここにあるのは「読むだけ」のデータで、書きかえはしない
   いま何を持っているか・いま何のいやいやか、のような
   プレイ中に変わる値は、それぞれの composable が持っている */
import { dangerCalmLine, dangerEnergyLine, fussEnergyLine, fussMoodLine, gameTitle, suddenEvents } from '~/data/game';
import { parkMapStartPlace } from '~/data/parkMap';
import { itemIcons, normalPlaceEvents, placeItems, placeSelectionIndexes } from '~/data/places';
import { placeActions } from '~/data/placeActions';
import type { PlaceActionDefinition } from '~/data/placeActions';
import { secretPathSunlightTotal } from '~/data/secretPath';
import { maxSnackCount, snacks } from '~/data/snacks';
import { niceTantrumBonusOutingPoint, niceTantrumBonusParentCalm, tantrumAlertDuration } from '~/data/tantrum';

/* 画面は4段階あり、この3つの組み合わせで決まる

   titleEntered  isSnackSelectionOpen  gameStarted   画面
   ---------------------------------------------------------------------
   false         false                 false         起動画面（▶ はじめる）
   true          false                 false         タイトル画面（きょうのおやつを選ぶ）
   true          true                  false         おやつ選択画面（きょうのおやつ）
   true          -                     true          ゲーム画面

   ※ 起動画面をはさんでいるのは、ブラウザの決まりへの対応
     「ユーザーがまだ一度も触っていないページでは音を鳴らせない」ため、
     ページを開いた直後にBGMを鳴らそうとしても止められてしまう
     そこで「▶ はじめる」を1回押してもらい、
     その操作をきっかけにタイトルBGMを鳴らしはじめる

   ※ ゲーム画面の行の isSnackSelectionOpen が「-」なのは、
     公園へ出発したあとも true のまま残しているため
     （選んだおやつはゲーム中もずっと持っているものなので、
       おやつ選択画面を「閉じた」ことにする必要がない）
     gameStarted が true ならゲーム画面、という順番で見分けている

   ※ この表のほかに「あそびかた」画面がある（isHowToPlayOpen）
     B画面から一時的に開く説明書のページで、開いているあいだは
     A画面・B画面・おやつ選択画面より優先して表示する
*/
const titleEntered = ref(false);

const gameStarted = ref(false);

/* おやつ選択画面（B画面とゲーム画面のあいだの準備画面）を開いているかどうか

   B画面の「きょうのおやつを選ぶ」で true になり、ここではまだゲームは始まらない
   （タイトルBGMも鳴ったまま。公園へ出発するのは
     「このおやつで公園へ行く！」を押したとき）
*/
const isSnackSelectionOpen = ref(false);

/* 「あそびかた」画面を開いているかどうか

   B画面の「？ あそびかた」で true、「← ひとつ前の画面へ戻る」・Escape で false になる
   B画面の上に説明書を一時的に広げるだけなので、
   titleEntered・isSnackSelectionOpen・gameStarted はさわらない
   （タイトルBGMも鳴ったまま。止めも、最初から鳴らしなおしもしない）

   ※ 画面の出し分け・キー操作・フォーカスのどれも、
     「!gameStarted && isHowToPlayOpen」を、おやつ選択画面より先に見る
   ※ 読んだかどうかは保存しない（localStorage は使わない）
     必要な人が、必要なときに開くためのページ */
const isHowToPlayOpen = ref(false);

/* ホーム画面のアイコンから（アプリのように）起動しているかどうか

   ・true  … ホーム画面から起動している（standalone 表示。URLバーなどが無い）
   ・false … ふつうの Safari / Chrome で開いている
   ・null  … まだ調べていない（サーバー側で作っているとき・ページを開いた直後）

   window / navigator はブラウザにしか無いので、調べるのは onMounted の中
   （→ checkStandalone()）
   null のあいだは「ホーム画面に追加」の案内を出さない
   （ホーム画面から起動したときに、案内が一瞬だけ見えてしまわないようにするため）

   A画面の「ホーム画面に追加」の案内は、false のときだけ出す */
const isStandalone = ref<boolean | null>(null);

/* ============================================================
   A画面・B画面のボタンを覚えておく箱（キーボード操作用）

   ref="〜" と書いたボタンが、そのままここに入ってくる
   （画面に出ていないときは null）

   この箱を使ってやることは2つ
   ・画面が切りかわったとき、メインのボタンへフォーカスを当てる
   ・↑↓←→ で、ボタンをぐるぐる選べるようにする

   A画面  … はじめる／♪ サウンドトラック／🌿 ミニゲーム／サウンドON・OFF
   B画面  … きょうのおやつを選ぶ／はじめの画面へ戻る／？ あそびかた／サウンドON・OFF
   あそびかた画面 … ← ひとつ前の画面へ戻る／サウンドON・OFF
   ※ サウンドON/OFFは、どの画面でも一度に1つしか画面に出ないので、
     箱は1つだけで足りる（おやつ選択画面・あそびかた画面も同じ箱を使う）
   ============================================================ */
const startButtonRef = ref<HTMLButtonElement | null>(null);
const soundtrackButtonRef = ref<HTMLButtonElement | null>(null);
const minigameButtonRef = ref<HTMLButtonElement | null>(null); // A画面の「🌿 ミニゲーム」（ミニゲームの一覧への入口）
const selectSnacksButtonRef = ref<HTMLButtonElement | null>(null);
const howToPlayButtonRef = ref<HTMLButtonElement | null>(null); // B画面の「？ あそびかた」
const backToBootButtonRef = ref<HTMLButtonElement | null>(null);
/* サウンドのコントロール（ミュートボタン ＋ 音量スライダー）のまとまり
   中身は components/game/SoundControl.vue にある

   A画面・B画面・おやつ選択・あそびかた の4画面に置いてあるが、
   いちどに出るのは1画面だけなので、ここは「いま出ているもの」1つを指す */
const soundControlRef = ref<InstanceType<typeof SoundControl> | null>(null);

/* ミュートボタンと音量スライダーの本体（キーボード操作で直接さわるため）

   SoundControl の中にあるので、コンポーネントごしに借りてくる
   （読むだけなので、今までの ref と同じように soundToggleButtonRef.value で使える）

   ※ 音量スライダーは、B画面で Tab を回りこませるときに、いちばん後ろの行き先として使う
     A画面にはスライダーが無いので（:show-volume="false"）、そこでは null になり、
     ミュートボタンがいちばん後ろの行き先になる（→ useKeyboardControls の handleTitleKeydown） */
const soundToggleButtonRef = computed<HTMLButtonElement | null>(() => soundControlRef.value?.toggleButton ?? null);
const soundVolumeSliderRef = computed<HTMLInputElement | null>(() => soundControlRef.value?.volumeSlider ?? null);

/* あそびかた画面の「← ひとつ前の画面へ戻る」（上のツールバーの左）
   画面が出おわったときに、ここへフォーカスを当てる */
const howToBackButtonRef = ref<HTMLButtonElement | null>(null);

/* おやつ選択画面のカードまるごと

   ここだけボタン1つずつではなく、入れものをまるごと覚えておく
   おやつは snacks 配列から v-for で作るので、
   あとからおやつが増えても、refを1つずつ増やさなくてすむようにしたい

   この入れものを使ってやることは2つ
   ・画面が出たとき、最初のおやつ（🍇 グミ）へフォーカスを当てる
   ・矢印キーで、中の押せるボタンを見た目どおりに行き来する
     （おやつのカード／出発／戻る／サウンドON/OFF） */
const snackSelectionRef = ref<HTMLElement | null>(null);

/* いま選んでいるコマンドの番号（キーボード操作用）
   0 = 1番目、1 = 2番目、2 = 3番目 という意味

   ↑↓キーでこの数字を動かし、Enter / Space でその番号のコマンドを実行する
   別の場所へ移動したときや、新しいコマンド画面になったときは 0 に戻して、
   いつも一番上のコマンドが選ばれている状態からはじめる
   （例外：公園入口へ戻ってきたときは、最後にいた場所のコマンドに合わせる → restoreEntranceCursor()）
*/
const selectedCommandIndex = ref(0);

/* ゲームのステータス・時間・進みぐあい（中身は composables/useGameState.ts）

   入れものを置く場所をあちらへ移しただけで、
   childEnergy.value = ... や visitedPlaces.value.push(...) のような
   書きかえかたは今までと同じ（返ってくるのは ref / computed そのもの）

   時間を進める addMinutes()、場所を移動する goToPlace()、
   上限下限をそろえる fixAllStatus()、「もう一度あそぶ」の resetGame() など、
   ゲームの進みかたを決めているところは、今までどおりこのファイルにある

   ※ この行は、これらを受けとる useAudio()・useTantrum()・useKeyboardControls()
     より前に置いておく
*/
const {
  /* ステータス */
  childEnergy, // こうちゃんの体力
  childMood, // こうちゃんの機嫌
  outingPoint, // おでかけポイント
  parentEnergy, // 親の体力
  parentCalm, // 親の余裕

  /* 時間 */
  currentTime, // 時間
  currentMinutes, // 時間を「分」に直したもの（09:00 なら 540）

  /* ゲームの進みぐあい */
  currentEvent, // 現在いる場所
  visitedPlaces, // 探検済みの場所
  playCount, // 場所で遊んだ回数
  collectedItems, // 公園で見つけたもの
  canEnterSecretSpot, // 秘密の場所へ行けるか（ポイント20以上かつ見つけたもの3種類以上）
  hasDiscoveredSecretSpot, // こもれびの広場を、このプレイでもう見つけたか

  /* いやいや（外からもよく見る2つだけ。理由・レベルなどの中身は useTantrum のまま） */
  isTantrum, // いまいやいや中かどうか（画面の出しわけ・BGMの切りかえにも使う）
  tantrumCount, // いやいやが起きた回数（最後のスコア計算に使う）

  /* 上のぜんぶを最初の状態へ戻す（「もう一度あそぶ」の resetGame() から呼ぶ） */
  resetGameState,
} = useGameState();

/* ============================================================
   通常の行動1回ぶんの結果（画面に出すためのメモ）

   中身は composables/useActionResult.ts にある
   ・結果の文章・今回の変化・行動前の控え・見つけたもの・
     ちょっとしたできごと・休憩／おやつの結果かどうか、の入れもの
   ・変化量を作る saveStatusChanges() と、「今回の変化」の表示データ changeGroups
   ・そのぜんぶを最初に戻す resetActionResult()

   ■ このファイルに残してあるもの
     ・行動の中身（ステータスの増減・時間・アイテム取得・ちょっとしたできごとの抽選）
       入れものへ入れるのは今までどおりこのファイルで、
       resultMessage.value = ... のように、受けとった ref へ直接書きかえる
     ・行動をはじめる共通の入口 startStatusChanges()
       （決定音・おやつバッグを閉じる・前の行動の表示を消す・行動前の控えを取る）
     ・ゲームの途中で表示を消すところ（goToPlace()・goToNextPlace() など）

   ※ ゲームが終わったあとの結果（スコア・ランク・GAME OVER）は composables/useGameResult.ts
   ============================================================ */
const {
  /* 結果カードに出すもの */
  resultMessage,
  foundItemsThisAction,
  randomEventText,
  randomEventEffects,

  /* 今回の変化（上部ステータスと結果カードに出す） */
  statusChanges,
  statusBefore,
  changeGroups,

  /* 行動が終わったあとに呼ぶ */
  saveStatusChanges,

  /* 行動の結果表示を、まとめて最初に戻す（resetGame() から呼ぶ） */
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

/* いやいや発生の演出（画面いっぱいのオーバーレイ）を出しているかどうか

   true のあいだだけ「いやいや発生！」のオーバーレイが画面に重なって出る
   出すのは「新しいいやいやが始まった瞬間」の1回だけで、
   「少し待ってみる」に失敗して同じいやいやが続くときには出さない
*/
const tantrumAlertVisible = ref(false);

/* ============================================================
   きょうのおやつ（公園へ持っていくおやつ ＝ バッグの中身）

   中身は composables/useSnackBag.ts にある
   ・バッグの中身（selectedSnackIds）と、そこから決まる表示用の値
   ・名札からおやつをさがす／バッグにあるか確かめる／バッグから出す
   ・バッグを空に戻す resetSnackBag()

   ■ このファイルに残してあるもの
     ・おやつ選択画面の開け閉めと、カードを押したときの出し入れ
       （openSnackSelection()・closeSnackSelection()・toggleSnackSelection()・
         confirmSnacksAndStartGame()）
       受けとった selectedSnackIds を、今までどおり直接書きかえる
     ・おやつを食べる行動そのもの（ステータスの増減・時間・結果の文章）
       いやいや中のおやつは composables/useTantrum.ts へ
       findSnackInBag / removeSnackFromBag をそのまま渡している

   ■ ゲーム中にどのおやつを食べるか選ぶメニュー（おやつバッグ）は、
     もう少し下の「ひとやすみ（ベンチ）のコマンドの番号」のあとにまとめてある
   ============================================================ */
const {
  /* バッグの中身（おやつ選択画面から直接 出し入れする） */
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

  /* バッグを空に戻す（resetGame() と goBackToBoot() から呼ぶ） */
  resetSnackBag,
} = useSnackBag();

/* 次に起こす予定のとつぜんのできごと（予定表）

   null                    … 予定なし
   'emergencySiren' など   … 次の「次へ」で、そのとつぜんのできごと画面へ移動する

   ※ 通常行動が終わった瞬間に画面を切り替えてしまうと、
     せっかくの結果メッセージと「今回の変化」が読まれる前に消えてしまう
     そこで、いったんここへ書いておいて、
     プレイヤーが結果を確認して「次へ」を押したときに移動する
     （いやいや（isTantrum）とまったく同じ考え方）
*/
const pendingSuddenEvent = ref<GameEvent | null>(null);

/* ============================================================
   ゲームが終わったあとの結果（リザルト・GAME OVER・S+の曲の解放）

   中身は composables/useGameResult.ts にある
   ・総合スコアと内訳・ランク・見出し・文章の入れもの
   ・GAME OVER画面に出す文章の入れもの
   ・S+ランク限定のうた入りBGMを解放したかどうか
   ・そのぜんぶを最初に戻す resetGameResult()

   ■ 計算はどれも、今までどおり別のところにある
     点数・ランク・エンディングの文章 … composables/useScore.ts
     S+の曲の解放判定と localStorage  … utils/sPlusSong.ts

   ■ このファイルに残してあるもの
     ・ゴールへ向かう流れ（goToGoal()）と、judgeResult() → unlockSPlusSongIfEarned() を呼ぶ順番
     ・GAME OVERの条件判定・BGM・画面の切りかえ（checkGameOver()）
       gameOverTitle / gameOverMessage は、受けとった ref へ今までどおり代入する
     ・1回の行動ごとの結果（resultMessage・statusChanges・見つけたもの・
       ちょっとしたできごと）は、今までどおりこのファイルが持っている

   ※ 0〜100に収める keepInRange() は、ほかの場所でも使うのでこのファイルに残し、
     スコア計算のときだけ渡している（今までと同じ渡しかた）
   ============================================================ */
const {
  /* ゴールしたときの成績（画面に出す） */
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

  /* ゴールしたときに呼ぶ（順番は goToGoal() が決める） */
  judgeResult,
  unlockSPlusSongIfEarned,

  /* 結果の状態を、まとめて最初に戻す（resetGame() から呼ぶ） */
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

/* お昼（12:00）を過ぎたかどうか
   currentMinutes（時間を「分」に直したもの）は useGameState() から受けとっている */
const isTimeOver = computed(() => currentMinutes.value >= 12 * 60);

/* そろそろお昼（11:30以降）かどうか */
const isAlmostNoon = computed(() => currentMinutes.value >= 11 * 60 + 30 && !isTimeOver.value);

/* 公園に着いたばかりかどうか

   公園で何かをすると、かならず時計が進む
   逆にいうと、時計が 09:00 のままなら「まだ何もしていない＝着いたばかり」ということ
   （「もう一度あそぶ」で 09:00 に戻したときも、また着いたばかりに戻る）
*/
const isJustArrivedAtPark = computed(() => currentTime.value === '09:00');

/* 公園入口のあいさつ文（3段階で切り替える）

   どの言いかたにするかは utils/gameText.ts の buildParkEntranceText()
   ここは、いまがどの場面かを渡すだけ

   ③の境目は、公園BGMがBGM2に変わる時刻とわざと同じにしてある
   （shouldUseParkBgm2 を使いまわしているので、境目の数字は1か所だけ）
   曲と文言がいっしょに変わることで、
   「午前前半の章 → 午前後半の章」へ進んだ感じが出る
*/
const parkEntranceText = computed(() => buildParkEntranceText(isJustArrivedAtPark.value, shouldUseParkBgm2(), hasNewSecretPath.value));

/* ※ 秘密の場所へ行ける条件（canEnterSecretSpot）と、
     こもれびの広場をもう見つけたか（hasDiscoveredSecretSpot）は
     useGameState() から受けとっている（→ このファイルの上のほう） */

/* 秘密の小道が地図に出ていて、まだ小道の先（こもれびの広場）を見つけていないか

   このあいだだけ、公園入口で
   ・あいさつ文を、秘密の小道を見つけた案内にする（parkEntranceText）
   ・地図の上の「秘密の小道」ボタンに「NEW」の印を付けて光らせる（.cmd--new → assets/css/game/park-map.css）
   新しい状態は持たず、今ある2つから決める */
const hasNewSecretPath = computed(() => canEnterSecretSpot.value && !hasDiscoveredSecretSpot.value);

/* ===== キーボード操作（「どうする？」コマンドボックス）用の計算 ===== */

/* ※ 画面ごとのキー操作の分けかたは handleKeydown() にまとめてある
     ・起動画面（A）・タイトル画面（B） … handleTitleKeydown()（A画面はボタン3つ、B画面は4つを選ぶ）
     ・あそびかた画面                    … handleHowToPlayKeydown()
       （Escape で戻る・←→ で上の2つを行き来。↑↓ はふつうのスクロールのまま）
     ・おやつ選択画面                    … handleSnackSelectionKeydown()
       （Tab と Enter / Space だけのふつうの操作。押しっぱなしを止めるだけ）
     ・ゲーム本編                        … そのまま handleKeydown() の続き
       （ゴール・GAME OVER画面も、ボタン2つを ↑↓ で選ぶ同じしくみで動く） */

/* いま「いやいやが続いている状態」かどうか
   ・いやいやタイムの画面にいる（currentEvent === 'tantrum'）
   ・まだ isTantrum が true（＝なだめられていない）

   対応が効かなかったとき（悪化した）や、少し落ち着いただけのときは、
   結果メッセージを出したままこの状態になるので、そのままもう一度コマンドを選べるようにする
   ※ GAME OVERになったときは currentEvent が 'gameOver' に変わるため、
     ここは自動的に false になり、GAME OVER画面のほうが優先される
*/
const isTantrumUnsolved = computed(() => currentEvent.value === 'tantrum' && isTantrum.value);

/* いま「通常の場所」にいるかどうか

   includes() は「この配列の中にあるか？」を調べる書きかた
   true なら、その場所ならではの遊びがならんでいる画面だという意味
*/
const isNormalPlace = computed(() => normalPlaceEvents.includes(currentEvent.value));

/* いま「ひとやすみ」（ベンチ）にいるかどうか

   公園入口の「ひとやすみ」から入る、休憩・おやつを選ぶ画面
   遊ぶ場所ではないので normalPlaceEvents には入れていない
   （探検済み・アイテム・ちょっとしたできごと・いやいや・とつぜんのできごとは、ここでは起きない）
*/
const isRestArea = computed(() => currentEvent.value === 'restArea');

/* 「どうする？」が たて1列にならんで、↑↓ で選ぶ画面かどうか（キーボード操作で使う）
   通常の場所6か所と、ひとやすみ（ベンチ）
   （ほかの画面は、選択肢が横にならんでいて ← → で選び、↑↓ は文章のスクロールに使う） */
const isPlaceMenuScene = computed(() => isNormalPlace.value || isRestArea.value);

/* ===== 通常の場所のメインコマンドの番号 =====

   通常の場所6か所は、どこでも同じ3つにそろえてある

   0 その場所の行動①
   1 その場所の行動②
   2 ← 場所選びにもどる    （この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る）

   ※ 数字を直接書かず、名前を付けておく
     画面とキーボード操作の両方で同じ番号を使うので、
     名前にしておけば、あとから順番を変えてもずれない
   ※ 前は 2 に「休憩・おやつ」があり、押すと「ひとやすみ」のサブメニューが開いていた
     休憩・おやつはどの場所でも同じ効果なので、公園入口の「ひとやすみ」（ベンチ）へまとめた
*/
const leavePlaceCommandIndex = 2;

/* ===== ひとやすみ（ベンチ）のコマンドの番号 =====

   0 休憩する
   1 おやつにする（バッグにおやつが残っているときだけ。押すとおやつバッグが開く）
   最後 ← 場所選びにもどる

   おやつを食べきると「おやつをあげる」の行が画面から消えるので、
   「← 場所選びにもどる」は 1つくり上がる（おやつあり 2／なし 1）
*/
const restBreakCommandIndex = 0;
const restSnackCommandIndex = 1;
const restLeaveCommandIndex = computed(() => (snackLeft.value > 0 ? 2 : 1));

/* 公園入口へ戻ってきた直後などに、コマンド枠をマウスで押せなくしておくか

   ボタンを押して画面が切りかわると、マウスを動かしていなくても、
   止まったままのカーソルの真下に、新しい画面のボタンが来てしまうことがある
   ・選んでいる行が、カーソルの下のボタンへ勝手に移る（ハイライトが跳ねて見える）
   ・すばやく2回押すと、2回目で思っていないボタンを押してしまう

   そこで、マウスを動かす（またはどこかを押す）までは、枠へのマウス操作を止めておく
   （止めかたは CSS の .command-box--pointer-paused）
   キーボード操作（↑↓・Enter / Space）そのものは、これとは関係なく使える

   ※ 指で操作しているとき（lastPointerType が 'touch'）は止めない
     カーソルが残らないので止める必要がなく、止めると次のタップが効かなくなってしまうため
     （CSS の (hover: hover) で分けないのは、マウスを付けていない環境などで
       マウス操作なのに hover: none と判定されることがあるため）

   ※ 公園入口へ戻ってきたとき（「次の場所を選ぶ」「← 場所選びにもどる」など）も、同じ考えかたで止める（restoreEntranceCursor() を参照）
     最後にいた場所のコマンドにカーソルを合わせても、止まったままのマウスの下に公園入口のボタンが出てくると、
     @mouseenter でカーソルがそのボタンへ上書きされてしまうため
     （公園入口の「どこへ行く？」の枠には .command--pointer-paused を付ける）
   ※ キーボードの ↑↓ で結果などをスクロールしたときと、矢印キーで選んだコマンドを見える位置へスクロールしたときも、同じ理由で止める
     （handleKeydown() の ⓪-3 と revealSelectedCommand() を参照）
     そのため、いやいやタイム・とつぜんのできごと・秘密の小道の「どうする？」と、ゴール／GAME OVER のボタンの枠にも付けている
   ※ 止めたあとは、マウスを動かしたとき（handleWindowPointer()）か、goToPlace() / goToNextPlace() で次の画面へ移るときに戻す */
const isCommandPointerPaused = ref(false);

/* いちばん最後に使われたポインターの種類（'mouse' / 'touch' / 'pen'）
   まだ一度もマウスや指を使っていない（キーボードだけで遊んでいる）ときは ''
   画面には出さないので、ref にはしていない */
let lastPointerType = '';

/* コマンドへのマウス操作を、マウスを動かすまで止める（isCommandPointerPaused を参照）
   指で操作しているときは止めない（カーソルが残らず、止めると次のタップが効かなくなるため） */
function pauseCommandPointer() {
  isCommandPointerPaused.value = lastPointerType !== 'touch';
}

/* window の pointermove / pointerdown を受け取る

   ① いま使っているポインターの種類を覚える（lastPointerType）
   ② コマンド枠へのマウス操作を止めているなら、マウスを動かした・どこかを押したときに戻す

   ※ movementX / movementY が両方 0 の pointermove は、動いたと数えない
     枠の大きさが変わったときに、ブラウザが「カーソルの下が変わった」ことを知らせる
     見かけだけの移動で、止めた意味がなくなってしまうため
   ※ 押したとき（pointerdown）は、動いていなくても戻す
     その1回の押しは、止めている枠には届かないので、場所を出てしまうことはない */
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

   isSnackSelectionOpen（ゲーム開始前に、持っていくおやつを選ぶ画面）とは別もの
   こちらは公園の中で「バッグに残っているおやつから1つ選んで食べる」ためのメニュー

   おやつを食べる場面は2つあり、どちらも同じバッグ（selectedSnackIds）から選ぶ

     exploring … 公園入口の「ひとやすみ」（ベンチ）→「おやつにする」
     tantrum   … いやいやタイムの「おやつをあげる」

   ※ とつぜんのできごと「こうちゃんがころんだ」では、おやつは使わない（バッグも開かない）

   並べるおやつも、↑↓・Enter・Escape の動きも2つとも同じ
   ちがうのは「選んだあとに呼ぶ関数（＝おやつの効果）」だけなので、
   どこから開いたかを snackUseContext に覚えておき、eatSnackFromBag() で呼び分ける
*/

/* いまおやつバッグを開いている場面

   null なら「バッグは閉じている」
   開いているかどうかを別の true / false では持たず、これ1つで表す
   （「開いているのに、どの場面か分からない」という食いちがいが起きない） */
const snackUseContext = ref<SnackUseContext | null>(null);

/* おやつバッグの中で、いま選んでいる行の番号（キーボード操作用）

   0 〜 おやつの数-1 … バッグの中のおやつ（selectedSnacks の順）
   おやつの数        … いちばん下の「← もどる」

   selectedCommandIndex（メインコマンド）とは別に持つ
   こうしておくと、もどったときに「おやつをあげる」が選ばれたまま残る */
const selectedSnackMenuIndex = ref(0);

/* 「← もどる」が何番目か（＝バッグに残っているおやつの数） */
const snackMenuBackIndex = computed(() => selectedSnacks.value.length);

/* おやつバッグを実際に画面に出しているかどうか

   画面（v-if）・キーボード操作・Enterの実行 の3か所がこれを見るので、
   「画面に無いのにキーだけ効く」ということが起きない

   開いた場面のコマンドが、いま画面に出ているときだけ true にする
   ・exploring … ひとやすみ（ベンチ）で、まだ結果が出ていないとき（バッグは「どうする？」の枠の中に出る）
   ・tantrum   … いやいやが続いているとき（「少し待ってみる」に失敗した直後もふくむ） */
const isSnackMenuVisible = computed(() => {
  if (snackUseContext.value === 'exploring') {
    return isRestArea.value && !resultMessage.value;
  }

  if (snackUseContext.value === 'tantrum') {
    return isTantrumUnsolved.value;
  }

  return false;
});

/* おやつバッグを開く

   開いたときは、いつもバッグの最初のおやつが選ばれた状態からはじめる
   バッグが空のときは開かない（コマンドも画面に出ていないが、念のため） */
function openSnackMenu(context: SnackUseContext) {
  if (snackLeft.value <= 0) {
    return;
  }

  // 決定音「ポン♪」（ひとやすみを開くときと同じ）
  playDecisionSound();

  snackUseContext.value = context;
  selectedSnackMenuIndex.value = 0;
}

/* おやつバッグを閉じる（「← もどる」・Escape・行動をはじめたとき）

   バッグの中身（selectedSnackIds）はさわらない
   閉じると、開く前のメニューがそのまま出てくる
   ・exploring … ひとやすみ（「おやつにする」が選ばれたまま）
   ・tantrum   … お話／だっこ／おやつ／待つ（「おやつをあげる」が選ばれたまま） */
function closeSnackMenu() {
  snackUseContext.value = null;
  selectedSnackMenuIndex.value = 0;
}

/* バッグの中のおやつを選んだとき（クリック・タップ・Enter / Space の共通の入口）

   開いた場面に合わせて、効果のちがう関数へ振り分けるだけ
   おやつの種類ごとの関数（グミ用・せんべい用…）は作らず、
   どの関数も snackId を受け取って、snacks のデータから効果を読む */
function eatSnackFromBag(snackId: SnackId) {
  // 画面に出ていないバッグから食べることはない（念のため）
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

/* いま画面に出ているコマンドの数
   ↑↓・← →キーで動ける範囲（0 〜 commandCount - 1）を決めるために使う
*/
const commandCount = computed(() => {
  /* ゴール・GAME OVER画面は2つ
     0 もう一度あそぶ
     1 ← はじめの画面へ戻る

     ※ いちばん先に見るのが大事
       下の「結果表示中は1つ」にも当てはまってしまうことがあるため */
  if (currentEvent.value === 'goal' || currentEvent.value === 'gameOver') {
    return 2;
  }

  // 公園入口は「行き先6か所 ＋ ひとやすみ ＋ ゴール」で8つ
  // 秘密の場所がまだ見つかっていないときは、その行が画面に無いので7つ
  if (currentEvent.value === 'parkEntrance') {
    return canEnterSecretSpot.value ? 8 : 7;
  }

  // いやいやが続いているあいだは、おやつが残っていれば4つ、食べきっていれば3つ
  //   おやつあり  0 お話する／1 だっこ／2 おやつ／3 少し待ってみる
  //   おやつなし  0 お話する／1 だっこ／2 少し待ってみる
  // 待つ・お話・おやつが効かずに結果メッセージが出ているときも、
  // いやいやはまだ終わっていないので、この4つ（3つ）から選び直す
  // ※ 下の「結果表示中は1つ」より先に判定するのがポイント
  if (isTantrumUnsolved.value) {
    return snackLeft.value > 0 ? 4 : 3;
  }

  // 結果表示中は1つだけ（「次の場所を選ぶ」など）
  if (resultMessage.value) {
    return 1;
  }

  /* 通常の場所6か所は、どこでも同じ3つ

     0 その場所の行動①
     1 その場所の行動②
     2 ← 場所選びにもどる

     ※ すぐ上の「結果表示中は1つ」より後ろに置くのが大事
       結果カードを読んでいるあいだは、メインコマンドも「次の場所を選ぶ」1つだけになるため
  */
  if (isNormalPlace.value) {
    return 3;
  }

  /* ひとやすみ（ベンチ）は、おやつが残っていれば3つ、食べきっていれば2つ
       おやつあり  0 休憩する／1 おやつにする／2 ← 場所選びにもどる
       おやつなし  0 休憩する／1 ← 場所選びにもどる
     ※ おやつバッグを開いているあいだは、バッグの中の数（snackMenuBackIndex + 1）を別に見ている */
  if (isRestArea.value) {
    return restLeaveCommandIndex.value + 1;
  }

  // 秘密の小道
  //   はじまる前  0 小道へ進む／1 ← 場所選びにもどる
  //   終わったあと 0 先へ進む
  // （遊んでいる最中は ← → を handleSecretPathKeydown() が受け取るので、ここの数は使わない）
  if (currentEvent.value === 'secretPath') {
    return secretPathPhase.value === 'ready' ? 2 : 1;
  }

  // ここに来るのはとつぜんのできごと5つ（救急車・テントウムシ・犬・ころんだ・噴水）だけ
  // どれも選択肢が3つなので3を返す
  // ※ ころんだイベントも、おやつを使わないので おやつの残りに関係なく いつも3つ
  // ※ 通常の場所・ひとやすみは、上の isNormalPlace／isRestArea の分岐で返している
  return 3;
});

/* 「どうする？」の選択肢を横にならべる画面か（テンプレートの choiceGridClass で使う）

   ・いやいやタイムで、いやいやが続いているあいだ（結果が出ていても、次の対応を選ぶので横ならび）
   ・とつぜんのできごとで、まだ選んでいないとき
   ・秘密の小道の、はじまる前（小道へ進む／← 場所選びにもどる）

   どれも「文章を ↑↓ でスクロールして読みながら、← → で選ぶ」ことがある画面なので、
   見た目も左右にならべて、キーの向きとそろえる
   ボタンが1つだけの画面（結果を読んだあとの「次へ」など）は、今までどおりの形のまま

   ※ おやつバッグを開いているあいだは横にしない
     バッグは今までどおり、たて1列で ↑↓ で選ぶ */
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

/* 横ならびにするときに command-box へ付けるクラス
   command-box--choices-〇 … 選択肢の数。列の数を決めるのに使う（CSSの .command-box--choice-grid を参照） */
const choiceGridClass = computed(() => (isChoiceGridVisible.value ? ['command-box--choice-grid', `command-box--choices-${commandCount.value}`] : null));

/* いやいやタイムの4つ（3つ）のコマンドが、それぞれ何番目になるか

   おやつあり  0 お話する／1 だっこ／2 おやつ／3 少し待ってみる
   おやつなし  0 お話する／1 だっこ／2 少し待ってみる

   いやいやタイムが始まったときは、いちばん上の「お話する」が選ばれた状態になる

   おやつが0個で「おやつをあげる」が画面から消えているときは、
   その下の「少し待ってみる」だけが1つくり上がる
   （0〜3 と直接書かずにここを見れば、画面とキーボード操作の番号がずれない）
*/
const talkCommandIndex = 0;
const hugCommandIndex = 1;
const snackCommandIndex = 2;
const waitCommandIndex = computed(() => (snackLeft.value > 0 ? 3 : 2));

/* いやいやタイムの「待つ」コマンドに出す文字
   1回目は「少し待ってみる」
   なにか対応をしたのに、まだいやいやが続いているときは「もう少し待ってみる」

   いやいやが続いたまま結果メッセージが出ている
   ＝ 待つ・お話・おやつ のどれかを試したが、まだおさまっていない直後、
   という意味なので、新しい ref を増やさなくても区別できる
*/
const waitCommandLabel = computed(() => (isTantrumUnsolved.value && resultMessage.value ? 'もう少し待ってみる' : '少し待ってみる'));

/* 結果カードの下に出す「次へ進む」コマンドの文字
   いやいやが起きているときは、次の場所ではなく
   まず こうちゃん をなだめる場面へ進むので、文言だけ変える
   とつぜんのできごとの予定があるときも、この先で何か起きることが伝わる文言にする
   （押したときに呼ぶ goToNextPlace() は、どの場合も今までと同じ）
*/
const nextPlaceCommandLabel = computed(() => {
  // いやいやが最優先（goToNextPlace() の分けかたと同じ順番にそろえてある）
  if (isTantrum.value) {
    return 'こうちゃんのところへ行く';
  }

  // とつぜんのできごとの予定があるとき
  if (pendingSuddenEvent.value !== null) {
    return 'なにか起こりそう…';
  }

  return '次の場所を選ぶ';
});

/* 場面（.scene）に付けるクラス

   scene--has-result … 結果カードが出ているあいだだけ付ける
   場所の絵をたたむ・スマホ幅で場所の説明をたたむ、の目印（→ assets/css/game/base.css・responsive.css）

   ■ なぜ、外側のゲーム画面（.game-screen）ではなく、場面ごとに付けるのか
     前は .game-screen に付けていたが、「次の場所を選ぶ」を押すと、
     結果の文章（resultMessage）を空にした瞬間に、このクラスも外れていた
     場面は <Transition> ですっと消えていくが、そのあいだも外側のクラスは効くので、
     消えていく途中の場面に、場所の絵と説明が戻ってきて、結果を出す前の画面が一瞬ちらっと見えていた
     場面の要素に付けておけば、消えていく場面は描きなおされないので、消える直前の見た目のまま消えていく */
const sceneClass = computed(() => ({ 'scene--has-result': !!resultMessage.value }));

/* 公園入口の「ひとやすみ」が何番目になるか
   行き先（すべり台〜芝生広場、見つけていれば秘密の小道）のすぐあと
   秘密の場所が出ていれば7番目（＝6）
   まだ出ていないときは、その行が画面に無いので1つくり上がって6番目（＝5）
*/
const restCommandIndex = computed(() => (canEnterSecretSpot.value ? 6 : 5));

/* 公園入口の「公園の出口へ向かう（ゴール）」が何番目になるか
   いちばん最後（ひとやすみ のすぐあと）
   秘密の場所が出ていれば8番目（＝7）、まだ出ていないときは7番目（＝6）
*/
const goalCommandIndex = computed(() => restCommandIndex.value + 1);

/* 公園入口へ戻ってきたとき、どのコマンドにカーソルを合わせるか（restoreEntranceCursor() で使う）

   その場所へ入るためのコマンドの番号を返す
   公園入口にその行が出ていないとき（場所選びから入る場所ではない・「秘密の小道」が出ていない）は null
   → 呼ぶ側は何もせず、今までどおり先頭（0）のままにする

   ※ 「秘密の小道」は canEnterSecretSpot のときだけ画面に出る
     おでかけポイントもアイテムも減らないので、広場や小道にいるあいだに消えることは無いはずだが、
     出ていないときに5番を返すと、1つくり上がったゴールを選んでしまうので、念のため確かめる */
function getPlaceSelectionIndex(place: GameEvent): number | null {
  // ひとやすみ（ベンチ）は、秘密の小道が出ているかどうかで番号が変わるので、ここで決める
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

/* このプレイで、公園入口から最後に入った場所（公園入口へ戻ったときのカーソル位置に使う）

   goToPlace() で、公園入口に行がある場所（placeSelectionIndexes にある場所と、ひとやすみ）へ入るときに書きかえる
   ・とつぜんのできごと・いやいやタイムは goToPlace() を通らない（goToNextPlace() が直接切りかえる）ので、
     途中に入っても上書きされず、そのあと公園入口へ戻ったときに「遊んでいた場所」を選べる
   ・秘密の小道 → こもれびの広場 と進むと secretSpot になるが、どちらも「秘密の小道」なので同じ
   null … このプレイでまだ場所を選んでいない（ゲーム開始直後）。startGame() / resetGame() で null に戻す */
const lastSelectedPlace = ref<GameEvent | null>(null);

/* 公園入口に来たとき、最初にカーソルを合わせるコマンドの番号（地図のまん中の芝生広場）

   どこにするかは data/parkMap.ts の parkMapStartPlace で決めている
   その場所が地図に出ていないとき（秘密の小道にした場合など）は、先頭（0）にする */
function getEntranceStartIndex(): number {
  return getPlaceSelectionIndex(parkMapStartPlace) ?? 0;
}

/* 公園入口へ戻ってきたときに、最後にいた場所のコマンドへカーソルを合わせる

   呼ぶところ
   ・goToNextPlace() で公園入口へ着いたとき
     （遊んだあとの「次の場所を選ぶ」・何もせず「← 場所選びにもどる」・とつぜんのできごとやいやいやのあと）
   ・leaveSecretPathToEntrance()（秘密の小道の「← 場所選びにもどる」）

   ・まだ場所を選んでいない／その行が画面に出ていないときは、地図のまん中の芝生広場に合わせる（getEntranceStartIndex()）
   ・マウスで押して戻ってきたときは、止まったままのマウスの下に公園入口のボタンが出てきて、
     @mouseenter でカーソルが上書きされてしまうので、マウスを動かすまで止めておく（pauseCommandPointer()） */
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

   公園の出口へ向かうと、その日のおでかけはおしまい（結果発表へ進み、公園へは戻れない）
   ボタンを押しまちがえたり、キーを押しすぎたりして、うっかり終わってしまわないように、
   公園入口の「公園の出口へ向かう（ゴール）」を選んだときは、いったん確認をはさむ

   ※ 12:00を過ぎて自動でゴールへ向かうとき（goToNextPlace() → goToGoal()）は確認しない
     時間切れは、プレイヤーが選んだことではないため
*/

/* 確認ダイアログを開いているかどうか */
const isGoalConfirmOpen = ref(false);

/* ダイアログの中で、いま選んでいるボタン
   0 … もう少し遊ぶ（開いたときは、いつもこちら）
   1 … 出口へ向かう */
const selectedGoalConfirmIndex = ref(0);

/* ダイアログを実際に画面に出すかどうか

   開いている印に加えて「ゲーム中で、公園入口にいる」ことも見る
   画面（v-if）・キーボード操作・「出口へ向かう」の実行 の3か所で同じこれを見るので、
   「画面に無いのにキーだけ効く」ということが起きない（isSnackMenuVisible と同じ考えかた） */
const isGoalConfirmVisible = computed(() => isGoalConfirmOpen.value && gameStarted.value && currentEvent.value === 'parkEntrance');

/* ダイアログに出す「お昼まで、あとどれくらいか」の文

   どう言いあらわすかは utils/gameText.ts の buildGoalConfirmTimeText()
   例）10:40 なら「お昼（12:00）まで、あと1時間20分あります。」 */
const goalConfirmTimeText = computed(() => buildGoalConfirmTimeText(currentMinutes.value));

/* ===== 危険な状態かどうか（GAME OVERが近いかどうかの目安） =====
   ここが true になったゲージは、上部ステータスで目立つ見た目にする
*/

/* 親の体力が20以下 → あと1〜2回の行動で限界 */
const isParentEnergyDanger = computed(() => parentEnergy.value <= dangerEnergyLine);

/* 親の余裕が20以下 → あと少しで0 */
const isParentCalmDanger = computed(() => parentCalm.value <= dangerCalmLine);

/* こうちゃんの体力が20以下 → 電池切れが近い */
const isChildEnergyDanger = computed(() => childEnergy.value <= dangerEnergyLine);

/* いま「リザルト画面」にいるかどうか
   ・ゴール（総合スコアとランクの発表）
   ・GAME OVER
   どちらも遊びが終わったあとの画面なので、
   上部ステータスの注意の色（そろそろお昼の時計のオレンジ）は付けない
*/
const isResultScene = computed(() => currentEvent.value === 'goal' || currentEvent.value === 'gameOver');

/* ===== ぐずりだすラインを下回っているか（危険の1段手前の「注意」） =====
   ここが true になったゲージは、上部ステータスでラベルとゲージをオレンジにする
   しきい値は、いやいや・機嫌の下がりかたの判定と同じ data/game.ts の定数
   ・体力 … 71未満で、いやいやが起きるようになる（useTantrum.ts の fussEnergyLine と同じ向き）
   ・機嫌 … 50以下で、いやいやが起きやすくなる（useTantrum.ts の fussMoodLine と同じ向き）

   ※ 体力が あぶないライン（20以下）まで下がったときは、赤い「危険」のほうだけを出す
     （同じゲージにオレンジと赤が重ならないように、ここで外しておく） */
const isChildEnergyFuss = computed(() => childEnergy.value < fussEnergyLine && !isChildEnergyDanger.value);
const isChildMoodFuss = computed(() => childMood.value <= fussMoodLine);

/* ============================================================
   音（効果音・BGM・音量）

   中身は composables/useAudio.ts にまとめてある
   ・効果音（その場で作る音 ＋ 録音した音声ファイル）
   ・BGM 7本（公園1・公園2・タイトル・いやいや・リザルト・GAME OVER・こもれびの広場）
   ・音量スライダーとミュート、その保存と読みこみ
   ・ページを離れるときの後片づけ

   ■ わたしているのは「いま画面はどうなっているか」の7つだけ
     どれも音のほうからは読むだけで、書きかえられることはない
     ref / computed のまま渡しているので、あちらでもいつも最新の値が読める

   ■ 「いつ曲を切りかえるか」の判断は、今までどおりこのファイルに残してある
     （タイトル画面へ入ったら playTitleBgmSoon()、GAME OVERなら playGameOverBgmSoon()、など）
     あちらは、鳴らす・止める・音量を変えるところだけを受けもつ
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

  /* ページを開いたとき（設定の読みこみ）・離れるとき（後片づけ） */
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

/* 時間を進める共通処理
   計算は utils/gameTime.ts にあり、ここは いまの時刻を書きかえるだけ */
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

/* ステータスがおかしな値にならないようにそろえる
   ※ おでかけポイントは点数なので100を超えてよい
*/
function fixAllStatus() {
  childEnergy.value = keepInRange(childEnergy.value);
  childMood.value = keepInRange(childMood.value);
  parentEnergy.value = keepInRange(parentEnergy.value);
  parentCalm.value = keepInRange(parentCalm.value);
}

/* 行動をはじめる前に呼ぶ
   「今のステータス」を控えておくだけの処理

   ※ 各場所の行動・いやいや対応・とつぜんのできごと・ひとやすみの行動は、
     どれも1行目でこの関数を呼んでいる＝「行動がはじまった瞬間」の共通の入口
     クリックでも Enter / Space でも必ずここを通るので、
     決定音はここで1回だけ鳴らせばよい
     （行動ごとに同じ1行を書き足すより、こちらのほうが見通しがよい）
*/
function startStatusChanges() {
  // 決定音「ポン♪」
  playDecisionSound();

  /* おやつバッグを閉じる

     どの行動を選んでも、ここを通れば必ず閉じるので、
     おやつを食べたあとに、バッグが出しっぱなしになることがない
  */
  closeSnackMenu();

  // 演出用：前の行動で見つけたものの表示が残らないように空へ戻す
  foundItemsThisAction.value = [];

  // 演出用：前の行動のちょっとしたできごとの表示も空へ戻す
  randomEventText.value = '';
  randomEventEffects.value = [];

  // 演出用：前の行動のいやいや文も空へ戻す
  tantrumText.value = '';

  // 演出用：前の対応の「✨ ナイス対応！」も空へ戻す
  // （いやいやが続いて対応を選び直したときに、前の表示が残らないようにする）
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

/* その場所を探検済みかどうか */
function isVisited(place: GameEvent) {
  return visitedPlaces.value.includes(place);
}

/* おでかけポイントを加える

   いくつ足すかを決めるのは composables/useOutingPoint.ts の judgeOutingPoint()
   （はじめての場所ならそのまま、2回目以降は半分。切り捨て・最低1点）
   ここは、決まった分を実際に足すだけ
*/
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

  // アイテム発見音「キラリン♪」
  // 上の重複チェックを通りぬけた＝本当に新しいものを見つけたときだけ鳴る
  playItemSound();

  // 演出用：この行動で新しく見つけたものとして覚えておく
  // 「〜を見つけました！」の文は、この foundItemsThisAction をもとに
  // 画面のほうで組み立てる（アイテムの名前だけ色をつけて目立たせるため）
  foundItemsThisAction.value.push(itemName);
}

/* その場所のアイテムを、もう見つけているかどうか

   公園入口の行き先ボタンの「★ 発見済み」バッジで使う
   見ているのは collectedItems だけなので、
   取得のルール（はじめては60%・2回目はかならず）には関係しない
*/
function hasFoundPlaceItem(place: ItemPlace) {
  return collectedItems.value.includes(placeItems[place]);
}

/* 場所で遊んだときに、その場所のアイテムが見つかるか判定する

   見つかるかどうかを決めるのは composables/usePlaceItem.ts の judgePlaceItem()
   ここは、見つかったものを実際に持ちものへ加えるだけ
   （取得のルール…はじめては60%・2回目はかならず…は、あちらに書いてある）

   ※ かならず finishPlayAction() より前に呼ぶ
     finishPlayAction() の中でその場所が探検済みになるので、
     あとから呼ぶと、はじめての場所でも「2回目」あつかいになってしまう
*/
function tryCollectPlaceItem(place: ItemPlace) {
  const itemName = judgePlaceItem(place, collectedItems.value, isVisited(place));

  // 今回は見つからなかった（または、もう持っている）
  if (itemName === null) {
    return;
  }

  addCollectedItem(itemName);
}

/* ランダムイベントで動いたステータスを、画面に出す形で1つ控える

   label    … 画面に出す項目名（「おでかけポイント」など）
   statName … 中の名前（changeClass() に渡して色を決めるのに使う）
   amount   … その増減（5 なら +5、-8 なら -8）

   ※ ステータスそのものは、呼ぶ前に outingPoint.value += 5 のように動かしてある
     この関数は「画面に出す用のメモを1行足す」だけ
*/
function addRandomEventEffect(label: string, statName: string, amount: number) {
  randomEventEffects.value.push({
    label,
    text: formatChange(amount),
    className: changeClass(statName, amount),
  });
}

/* ランダムイベント（通常行動中に起きる、ちょっとしたできごと）

   何が起きるかを決めるのは composables/useRandomEvent.ts の drawRandomEvent()
   ここは、返ってきたできごとを実際のステータスと画面に反映するだけ

   ※ いやいやが起きた回は、そもそもこの関数が呼ばれない
     （呼ぶかどうかを決めているのは finishPlayAction()）
*/
function runRandomEvent() {
  const event = drawRandomEvent();

  // 今回は何も起こらなかった（80%はこちら）
  if (event === null) {
    return;
  }

  // ステータスを動かして、そのぶんを結果カードのメモにも足す
  for (const effect of event.effects) {
    if (effect.statName === 'childMood') {
      childMood.value += effect.amount;
    } else if (effect.statName === 'parentEnergy') {
      parentEnergy.value += effect.amount;
    } else {
      parentCalm.value += effect.amount;
    }

    addRandomEventEffect(effect.label, effect.statName, effect.amount);
  }

  randomEventText.value = event.text;
}

/* 疲れたり、おなかがすいたりすると、だんだん機嫌もわるくなる

   いくつ下がるかを決めるのは composables/useMoodDrop.ts の judgeMoodDrop()
   （① 遊びつかれてきた → -4／② お昼が近づいた → -3。かさなると -7）
   ここは、決まった分を実際に機嫌から引くだけ

   ※ いやいやをなだめる行動ととつぜんのできごとでは呼ばれない
     （どちらも finishPlayAction() を通らないため）
     なだめている最中にさらに機嫌が下がると、立て直せなくなってしまう
*/
function dropMoodWhenTired() {
  childMood.value -= judgeMoodDrop(childEnergy.value, currentMinutes.value);
}

/* 「あとで消す」の予約票（公園BGMの予約票と同じ考え方）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり消す」と取り消すのに必要）
*/
let tantrumAlertTimer: ReturnType<typeof setTimeout> | null = null;

/* いやいや発生の演出をすぐ消して、予約も取り消す（後始末）

   ・「もう一度あそぶ」でタイトルへ戻るとき
   ・ページから離れるとき
   に呼んで、前の演出やタイマーが残らないようにする
*/
function hideTantrumAlert() {
  tantrumAlertVisible.value = false;

  if (tantrumAlertTimer === null) {
    return;
  }

  clearTimeout(tantrumAlertTimer);
  tantrumAlertTimer = null;
}

/* いやいや発生の演出を出して、約2秒後にひとりでに消す

   ※ 止めるのは「演出」だけで、ゲームの進みは止めない
     結果メッセージやステータスの変化は今までどおりすぐ処理され、
     このオーバーレイが少しのあいだ、上に重なって出るだけ
*/
function showTantrumAlert() {
  // 前の予約が残っていたら取り消す
  // （残したままだと、古いタイマーが新しい演出を途中で消してしまう）
  hideTantrumAlert();

  tantrumAlertVisible.value = true;

  tantrumAlertTimer = setTimeout(() => {
    tantrumAlertTimer = null;
    tantrumAlertVisible.value = false;
  }, tantrumAlertDuration);
}

/* いやいや（かんしゃく）の判定と、対応したときの結果

   中身は composables/useTantrum.ts にある
   いま使っている ref・関数をそのまま渡して、今までと同じように動かしてもらう

   ※ いやいやの中だけで使う状態（理由・激しさ・直前の対応・ナイス対応・
     いやいやが始まったときの文章）は、あちらが自分で持っている
     こちらは、画面に出すぶんだけを下の { } で受けとって表示する

   ※ いやいや中かどうか（isTantrum）と、いやいやが起きた回数（tantrumCount）は、
     BGMの切りかえ（useAudio）や最後のスコア（useScore）からも見るので、
     composables/useGameState.ts が持ち主。ここでは渡すだけ
*/
const {
  /* いやいやの判定と、いやいや中の4つの対応 */
  checkTantrum,
  resetTantrumState,
  hugChild,
  giveSnack,
  talkToChild,
  waitCalmly,

  /* 画面に出すもの（持ち主は useTantrum。ここは読むだけ）
     ※ niceTantrumResponseText と tantrumText だけは、行動をはじめるたびに
       startStatusChanges() で空へ戻している */
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

/* GAME OVER判定
   ステータスが変わる行動のあとに、必ず最後に呼ぶ

   上から順番に見て、あてはまった時点でGAME OVERが決まる
   ① 親の体力が0以下      → 親がもう動けない
   ② 親の余裕が0以下       → 親の心の余裕がなくなった
   ③ こうちゃんの体力が0以下 → 強制帰宅エンド（だっこで帰る）

   ※ 必ず fixAllStatus()（0〜100に丸める処理）のあとに呼ぶこと
     内部で -5 のようなマイナスになっていても、0に丸めてから判定する

   ※ GAME OVERになったら currentEvent を 'gameOver' にする
     これで画面がすぐGAME OVER画面に切り替わり、続きは遊べなくなる
     BGMは前の曲を止めてから、少しあとにGAME OVER BGMを鳴らす（playGameOverBgmSoon()）
*/
function checkGameOver() {
  // すでにGAME OVERになっているときは、理由を上書きしない
  if (currentEvent.value === 'gameOver') {
    return;
  }

  /* ※ 下の3つは、あてはまった1つだけが実行されて return する
       （いちばん上に「すでにGAME OVERなら return」もあるので、
        BGMを止める処理が動くのも1回だけ）

     BGMは、それまで鳴っていたかもしれない曲（公園・秘密の場所・いやいや・リザルト）をぜんぶ止める
     いやいやタイム中でも、だっこで親の体力が0になるなどでGAME OVERになるため
     秘密の場所で親の体力が0になることもあり、そのときGAME OVER画面へ移ったあとも
     こもれびの広場BGMが鳴りつづけないようにする
     リザルトBGMはふつうGAME OVERと同時には鳴らないが、
     結果画面の曲どうし（リザルトBGMとGAME OVER BGM）が重ならないように、念のため止めておく
     （鳴っていない曲に stop を呼んでも、何も起きないだけなので安全）

     止めたあとで playGameOverBgmSoon() を呼び、
     少し無音の間をおいてから、GAME OVER画面専用のBGMを鳴らしはじめる
     ・画面は、currentEvent を 'gameOver' にした時点ですぐ切りかわる（待つのは音だけ）
     ・同じ行動のあとに checkGameOver() がもう一度呼ばれても、
       いちばん上の「すでにGAME OVERなら return」で止まるので、予約は1回しかされない
       （playGameOverBgmSoon() の中でも、前の予約を取り消してから予約しなおしている）

     どの理由でも、いやいや発生の演出（hideTantrumAlert）は必ず消す
     いやいやが起きた行動でそのままGAME OVERになることがあり、
     消さないとGAME OVER画面の上に「いやいや発生！」が重なって残ってしまう */

  // ① 親の体力が0以下
  if (parentEnergy.value <= 0) {
    gameOverTitle.value = '親の体力が限界！';
    gameOverMessage.value = 'もう動けません……。今日はここで帰ります。';
    currentEvent.value = 'gameOver';
    stopParkBgm();
    stopSecretBgm();
    stopTantrumBgm();
    stopResultBgm();
    hideTantrumAlert();

    // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
    // （行動の途中でGAME OVERになるので、前の画面で選んでいた番号が残っている）
    selectedCommandIndex.value = 0;

    // 少し無音の間をおいてから、GAME OVER画面専用のBGMを鳴らす
    playGameOverBgmSoon();
    return;
  }

  // ② 親の余裕が0以下
  if (parentCalm.value <= 0) {
    gameOverTitle.value = '親の余裕がなくなった！';
    gameOverMessage.value = '心の余裕がなくなってしまいました。今日はここでおしまい。';
    currentEvent.value = 'gameOver';
    stopParkBgm();
    stopSecretBgm();
    stopTantrumBgm();
    stopResultBgm();
    hideTantrumAlert();

    // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
    // （行動の途中でGAME OVERになるので、前の画面で選んでいた番号が残っている）
    selectedCommandIndex.value = 0;

    // 少し無音の間をおいてから、GAME OVER画面専用のBGMを鳴らす
    playGameOverBgmSoon();
    return;
  }

  // ③ こうちゃんの体力が0以下（強制帰宅エンド）
  if (childEnergy.value <= 0) {
    gameOverTitle.value = 'こうちゃん電池切れ！';
    gameOverMessage.value = 'もうクタクタ。だっこで公園をあとにしました。';
    currentEvent.value = 'gameOver';
    stopParkBgm();
    stopSecretBgm();
    stopTantrumBgm();
    stopResultBgm();
    hideTantrumAlert();

    // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
    // （行動の途中でGAME OVERになるので、前の画面で選んでいた番号が残っている）
    selectedCommandIndex.value = 0;

    // 少し無音の間をおいてから、GAME OVER画面専用のBGMを鳴らす
    playGameOverBgmSoon();
    return;
  }
}

/* とつぜんのできごとの抽選

   起こすかどうか・どれを起こすかを決めるのは
   composables/useSuddenEvent.ts の drawSuddenEvent()（20%で発生・5種類から1つ）

   ここがやるのは、currentEvent を変えずに
   pendingSuddenEvent（予定表）へ書いておくことだけ

   これがいちばん大事なところ
   ここで画面を切り替えてしまうと、いま終わったばかりの行動の
   結果メッセージと「今回の変化」が、読まれる前に消えてしまう
   実際に画面が切り替わるのは、プレイヤーが「次へ」を押して
   goToNextPlace() が呼ばれたとき
*/
function checkSuddenEvent() {
  const suddenEvent = drawSuddenEvent();

  // 今回は何も起こらなかった（80%はこちら）
  if (suddenEvent === null) {
    return;
  }

  pendingSuddenEvent.value = suddenEvent;
}

/* 場所で1つ行動したあとの共通処理
   ① その場所を探検済みにする
   ② 疲れていたら、機嫌が少し下がる
   ③ いやいやが始まるか判定する
   ④ いやいやが起きなかったときだけ、たまにちょっとしたできごとが起こる
   ⑤ 今回の変化量を記録する（機嫌ダウンと、いやいや・ちょっとしたできごとの分もふくむ）
   ⑥ ステータスを0〜100に収める
   ⑦ GAME OVERになっていないか判定する
   ⑧ とつぜんのできごとが起きるか抽選する（起きるなら予定表に書くだけ）
   ※ いやいやをなだめる行動では呼ばない（ちょっとしたできごとを起こさないため）
   ※ とつぜんのできごとの行動でも呼ばない（とつぜんのできごとが連続で起きないようにするため）

   ⑦を⑥の次に置いているので、
   ちょっとしたできごとの「だっこ！」で親の体力が0になった場合も、
   いやいや発生で親の余裕が0になった場合も、まとめてGAME OVERになる

   ②がいやいや判定より前にあるのもポイント
   下がったあとの機嫌でいやいやを判定するので、
   「疲れて機嫌もわるい」ときほど、ちゃんといやいやが起きやすくなる
*/
function finishPlayAction(place: GameEvent) {
  playCount.value += 1;
  addVisitedPlace(place);
  dropMoodWhenTired();
  checkTantrum();

  /* ④ ちょっとしたできごとの抽選

     いやいやが起きた回は、ちょっとしたできごとを起こさない
     いやいやは専用の画面とBGMまである大きなできごとなので、
     同じ結果カードに「ねこちゃん！（機嫌 +5）」と「いやいや発生」が並ぶと、
     どちらの話なのか分からなくなってしまう
     1回の行動で目立つできごとは1つ、という形にそろえている
     （すぐ下の⑧「とつぜんのできごと」も、同じ考えかたでいやいや中は抽選しない）

     ※ いやいや判定（checkTantrum()）のあとに抽選するので、
       ちょっとしたできごとの機嫌や余裕の増減が、
       いやいやの起きやすさを変えることはない
  */
  if (!isTantrum.value) {
    runRandomEvent();
  }

  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  /* ⑧ とつぜんのできごとの抽選（いちばん最後）

     つぎの3つのときは抽選しない
     ・GAME OVERになった  … もう続きが無いので
     ・いやいやが発生した  … まず こうちゃん をなだめるほうが先
     ・12:00を過ぎた      … このあとはゴールへ向かうだけ

     当たっても、この場では画面を切り替えない
     pendingSuddenEvent（予定表）に書いておくだけなので、
     いま出ている結果カードはそのまま読める
  */
  if (currentEvent.value !== 'gameOver' && !isTantrum.value && !isTimeOver.value) {
    checkSuddenEvent();
  }

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ============================================================
   画面の切りかえ（A画面 ⇄ B画面 ⇄ ゲーム画面）のフェード

   画面そのものの出し分けは、今までどおり v-if / v-else-if
   そこへ <Transition name="screen-fade" mode="out-in"> をかぶせて、
   「前の画面が短く消える → 次の画面が短く出る」ようにしてある
   （画面のほうは、template の <main class="game"> のすぐ中を見ること）

   ここにあるのは、そのフェードに合わせて必要になった2つの世話だけ

   ① フェード中は、キーの操作を受けつけない（→ isScreenChanging）
   ② 次の画面が出おわったら、フォーカスを当てなおす（→ handleScreenEnterEnd）

   ■ ①が要る理由

     ボタンを押したしゅんかんに、中身（state）はもう次の画面のものになる
     でも目に見えているのは、消えかけの前の画面

     このあいだにEnterを押せてしまうと、
     「はじめる」を押した直後に、見えていないB画面の「きょうのおやつを選ぶ」まで
     続けて押したことになってしまう

     マウスのほうは、消えかけの画面を押せないようにするCSS
     （.screen-fade-leave-active の pointer-events: none）で止めている
     キーは window でまとめて受け取っていて、画面の外の話なので、
     こちらの目じるしで止める

   ■ ②が要る理由

     mode="out-in" では、次の画面はフェードアウトが終わってから作られる
     そのため、ボタンを押した直後に（nextTick で）フォーカスを当てようとしても、
     行き先のボタンはまだ画面に無い
     そこで「次の画面が出おわった」合図（@after-enter）を待ってから当てている
   ============================================================ */

/* いま画面がフェードで切りかわっている最中かどうか

   true になるのは、前の画面が消えているあいだだけ
   （次の画面が出てくるときは、もう押して大丈夫なので false に戻す） */
const isScreenChanging = ref(false);

/* 前の画面が、消えはじめたとき

   el … これから消えていく画面（Vueがわたしてくれる）

   キーの受付を止めるほかに、もう1つだけ世話をしている
   消えていく画面のボタンにフォーカスが残っていると、
   そのボタンはEnterでもう一度押せてしまう（ブラウザのふつうの動き）
   マウスのほうはCSSで押せなくしてあるので、こちらも合わせて外しておく

   外したフォーカスは、次の画面が出おわったときに
   handleScreenEnterEnd() がメインのボタンへ当てなおしてくれる */
function handleScreenLeaveStart(el: Element) {
  isScreenChanging.value = true;

  const active = document.activeElement;

  if (active instanceof HTMLElement && el.contains(active)) {
    active.blur();
  }
}

/* 前の画面が、消えおわったとき（次の画面は、このすぐあとに出てくる） */
function handleScreenLeaveEnd() {
  isScreenChanging.value = false;
}

/* 次の画面が、出おわったとき

   A画面なら「はじめる」、B画面なら「きょうのおやつを選ぶ」、
   あそびかた画面なら「← ひとつ前の画面へ戻る」、
   おやつ選択画面なら最初のおやつ「🍇 グミ」へフォーカスを当てる
   ゲーム画面のときは、focusTitleMainButton() の中で何も起きない
   （getTitleFocusItems() が、ゲーム中は空っぽを返すため）

   ※ あそびかた画面からB画面へ戻ったときは、ほかの画面から戻ったときと同じく
     B画面のメインのボタン「きょうのおやつを選ぶ」へ当てる（いちばん下の focusTitleMainButton()）

   ※ ページを開いた1回目は、ここは通らない（<Transition> は最初の表示では動かないため）
     そのときは onMounted の focusTitleMainButton() が当ててくれる */
function handleScreenEnterEnd() {
  /* ここまで来ればフェードは終わっているので、キーの受付も念のため戻しておく
     （ふつうは、ひとつ上の handleScreenLeaveEnd() でもう戻っている） */
  isScreenChanging.value = false;

  /* あそびかた画面は、おやつ選択画面より先に見る（画面の出し分けと同じ順番）

     縦に長い説明書なので、いちばん上の「← ひとつ前の画面へ戻る」へ当てる
     ここにフォーカスがあれば、そのまま Enter で戻れるし、
     ↑↓ もふつうのスクロールとして使える
     （@after-enter は画面が出おわってから届くので、ボタンはもう画面にある） */
  if (isHowToPlayOpen.value && !gameStarted.value) {
    howToBackButtonRef.value?.focus();
    return;
  }

  /* おやつ選択画面のときだけ、当てる先がボタン3つの並びではなく
     おやつのカードなので、専用の関数にまかせる

     gameStarted もいっしょに見ているのが大事
     isSnackSelectionOpen は公園へ出発したあとも true のまま残るので、
     これだけで見分けると、ゲーム画面が出たあとにも
     もう画面に無いおやつのカードをさがしにいってしまう */
  if (isSnackSelectionOpen.value && !gameStarted.value) {
    focusFirstSnackOption();
    return;
  }

  focusTitleMainButton();
}

/* 起動画面の「▶ はじめる」

   この画面がある理由はただ1つ、タイトルBGMを鳴らすため

   ブラウザには「ユーザーがまだ一度も触っていないページでは
   勝手に音を鳴らしてはいけない」という決まりがある
   ページを開いた直後に鳴らそうとしても止められてしまうので、
   ボタンを1回押してもらい、その操作をきっかけに鳴らしはじめる

   曲は少しだけ間を空けてから鳴らしはじめる
   押した瞬間にいきなり始まると唐突に聞こえるため
   （待つのは音だけで、画面の切り替えはこのあとすぐ行う）

   ※ 決定音「ポン♪」はここで鳴らす
     この画面でただ一つ、先へ進むボタンなので、押せたことを音でも返す
     （となりの ♪ サントラ・🌿 ミニゲームは、ページごと移るだけなので鳴らさない）
     曲が鳴りだすのは0.5秒あとなので、決定音と重なって聞こえることはない
*/
function enterTitle() {
  // 決定音「ポン♪」（ほかの「先へ進む」ボタンと同じ）
  playDecisionSound();

  playTitleBgmSoon();

  titleEntered.value = true;

  /* B画面のメインのボタン「きょうのおやつを選ぶ」へのフォーカスは、ここでは当てない

     フェード（mode="out-in"）が終わるまで、B画面はまだ作られていないため
     フェードが終わったときに handleScreenEnterEnd() が当ててくれる
     （キーボードだけでも、そのまま Enter で先へ進める） */
}

/* B画面（タイトル画面）から、A画面（起動画面）へ戻る

   B画面ではタイトルBGMが鳴っているので、戻る前にかならず止める
   （A画面は「まだ音を鳴らしていない」画面なので、鳴ったまま戻ると不自然）
   cancelTitleBgmStart() … 「あとで鳴らす」の予約が残っていても取り消す

   titleEntered を false に戻すと、A画面（起動画面）が表示される
   もう一度「はじめる」を押せば、enterTitle() でまたタイトルBGMが鳴る
*/
function goBackToBoot() {
  /* ※ 決定音は鳴らさない
     この「戻る」は、先へ進むボタンではなく、ひとつ前の画面へ引き返すボタン
     引き返すだけのボタンでは音を出さないようにしている（ほかの画面の「戻る」も同じ） */
  cancelTitleBgmStart();
  stopTitleBgm();

  /* きょうのおやつは、いちばん最初の画面まで戻ったら選びなおしてもらう

     A画面まで戻るのは「最初から始め直す」ことなので、
     前に選んだグミ・せんべいが残っていると、
     次に公園へ行くときに知らないうちに持たされてしまう
     （B画面 ⇄ おやつ選択画面の行き来では、わざと残している）

     バッグを空にする中身は composables/useSnackBag.ts の resetSnackBag() */
  resetSnackBag();
  isSnackSelectionOpen.value = false;

  /* あそびかた画面も閉じた状態に戻しておく
     （いまの画面からは開いたままここへ来ることはないが、
       A画面へ戻ったのに、中ではあそびかたが開いたまま、という状態を残さないため） */
  isHowToPlayOpen.value = false;

  /* 画面のほうは、この1行だけで切りかわる（表示用のstateはこれ以外いじらない）
     BGMを止める上の2行も、音を止めるだけで画面の中身にはさわらないので、
     B画面は中身がそろったまま、まるごとフェードアウトしていく */
  titleEntered.value = false;

  /* A画面のメインのボタン「はじめる」へのフォーカスは、
     フェードが終わってから handleScreenEnterEnd() が当てる */
}

/* ゲーム開始（＝公園へ出発する）

   呼ばれるのは、おやつ選択画面の「このおやつで公園へ行く！」からだけ
   （B画面の「きょうのおやつを選ぶ」は、ひとつ手前の openSnackSelection() を呼ぶ）

   ここが「ゲーム開始前」と「ゲーム中」の境目なので、
   BGMの切り替えも gameStarted も、ぜんぶこの1か所でまとめて行う
   おやつ選択画面のために同じ内容をコピーした関数は作らない
*/
function startGame() {
  // 決定音「ポン♪」（おやつ選択画面の「このおやつで公園へ行く！」）
  playDecisionSound();

  /* BGMをタイトル用から公園用へ切り替える

     2曲が重ならないように、かならず
     「タイトルBGMを止める → 公園BGMを鳴らす」の順番にする
     タイトルBGMは stopTitleBgm() で先頭に戻しておくので、
     次にタイトル画面へ戻ったときは、また最初から鳴る

     公園BGMは少しだけ間を空けてから鳴らしはじめる
     すぐ鳴らすと、決定音「ポン♪」が曲にかき消されてしまうため
     （待つのは音だけで、画面の切り替えはこのあとすぐ行う）

     ブラウザは「ユーザーが操作する前」に音を鳴らすのを止めることがある
     ここはプレイヤーが「このおやつで公園へ行く！」を決定した瞬間なので、
     このタイミングで始めるのが確実
  */
  stopTitleBgm();
  playParkBgmSoon();

  gameStarted.value = true;

  // 新しいプレイなので「最後に入った場所」も忘れる（resetGame() でも空にしているが、はじめての公園入口は必ず芝生広場から）
  lastSelectedPlace.value = null;

  // はじめての公園入口なので、カーソルは地図のまん中（芝生広場）に合わせる
  selectedCommandIndex.value = getEntranceStartIndex();

  // 「このおやつで公園へ行く！」をマウスで押したときは、止まったままのマウスの下に地図のボタンが出てきて、
  // @mouseenter で芝生広場のカーソルが上書きされてしまうので、マウスを動かすまで止めておく
  // （公園入口へ戻ってきたときの restoreEntranceCursor() と同じ。タッチのときは止めない）
  pauseCommandPointer();
}

/* ============================================================
   おやつ選択画面（B画面 → おやつ選択 → ゲーム）

   B画面の「きょうのおやつを選ぶ」を押しても、まだ公園へは出発しない
   あいだに「きょうのおやつ」を選ぶ準備画面をはさんでいる

   ■ ここではBGMをいっさいさわらない

     おやつ選択画面は「ゲーム開始前」の画面なので、
     B画面と同じようにタイトルBGMが鳴ったままでよい
     ・stopTitleBgm()    … 呼ばない
     ・playParkBgmSoon() … 呼ばない
     ・gameStarted       … true にしない

     サウンドON/OFFのほうも、何も直さなくてそのまま動く
     toggleSound() は「titleEntered && !gameStarted なら
     タイトルBGMを再開する」と決めていて、
     おやつ選択画面もその条件にそのまま当てはまるため
   ============================================================ */

/* B画面の「きょうのおやつを選ぶ」

   やることは、おやつ選択画面を開くことだけ
   （公園へ出発するのは、この先の confirmSnacksAndStartGame()） */
function openSnackSelection() {
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  isSnackSelectionOpen.value = true;

  /* 最初のおやつ「🍇 グミ」へのフォーカスは、ここでは当てない

     フェード（mode="out-in"）が終わるまで、おやつのカードはまだ作られていない
     フェードが終わったときに handleScreenEnterEnd() が当ててくれる
     （A→B、B→A のときと、まったく同じ考えかた） */
}

/* おやつ選択画面の「← ひとつ前の画面へ戻る」（B画面へ戻る）

   選んだおやつは、わざと消さずに残しておく
   もう一度「きょうのおやつを選ぶ」を押したときに、
   さっき選んだグミ・せんべいがそのまま入っているようにしたいため
   （ぜんぶ選びなおしになるのは、A画面まで戻ったときだけ）

   タイトルBGMも鳴ったままでよい（ここもまだゲーム開始前の画面） */
function closeSnackSelection() {
  /* ※ 決定音は鳴らさない（B画面の「戻る」goBackToBoot() と同じ考えかた）
     引き返すだけのボタンなので、音は出さない */
  isSnackSelectionOpen.value = false;

  /* B画面のメインのボタン「きょうのおやつを選ぶ」へのフォーカスは、
     フェードが終わってから handleScreenEnterEnd() が当てる */
}

/* ============================================================
   あそびかた画面（B画面 → あそびかた → B画面）

   B画面の「？ あそびかた」から開く、説明書のページ
   ルールと考えかたは説明するが、攻略の正解（相性表・成功率・解放条件など）は書かない

   ■ 別のページ（route）にはしていない

     /howto のような別ページにすると、ページが作り直されるので
     鳴っているタイトルBGMが止まってしまう（onUnmounted でぜんぶ止めているため）
     同じページの中で v-if を切りかえるだけにして、
     A画面・B画面・おやつ選択画面と同じ screen-fade でフェードさせている

   ■ ここではBGMをいっさいさわらない（おやつ選択画面と同じ）

     ・stopTitleBgm() / playTitleBgmSoon() … 呼ばない
     ・gameStarted / titleEntered          … 変えない
     なので、B画面 → あそびかた → B画面 のあいだ、タイトルBGMは途切れずに流れつづける

     サウンドON/OFFも、何も直さなくてそのまま動く
     toggleSound() は「titleEntered && !gameStarted ならタイトルBGMを再開する」ので、
     あそびかた画面もその条件にそのまま当てはまる
   ============================================================ */

/* B画面の「？ あそびかた」

   やることは、あそびかた画面を開くことだけ
   「← ひとつ前の画面へ戻る」へのフォーカスは、フェードが終わったときに
   handleScreenEnterEnd() が当ててくれる（おやつ選択画面を開くときと同じ） */
function openHowToPlay() {
  /* ※ 決定音は鳴らさない
     ゲームを進めるボタンではなく、説明書をちょっと開くだけのボタンなので、音は出さない
     （閉じる「← ひとつ前の画面へ戻る」closeHowToPlay() も、そろえて鳴らさない） */
  isHowToPlayOpen.value = true;
}

/* あそびかた画面の「← ひとつ前の画面へ戻る」（Escape もここを呼ぶ）

   B画面へ戻るだけ。タイトルBGMは鳴ったままでよい
   B画面のメインのボタンへのフォーカスは、フェードが終わってから handleScreenEnterEnd() が当てる */
function closeHowToPlay() {
  /* ※ 決定音は鳴らさない
     開くとき（openHowToPlay()）も鳴らしていないので、閉じるときもそろえる
     引き返すだけのボタンなので、音は出さない（ほかの画面の「戻る」も同じ） */
  isHowToPlayOpen.value = false;
}

/* おやつのカードを押したとき（1回で選ぶ・もう1回で解除）

   ・まだ入れていないおやつ … バッグに入れる
   ・もう入れてあるおやつ   … バッグから出す

   同じおやつを2個入れないようにしているのは、この「入っていたら出す」の形そのもの
   入っているおやつをもう一度押しても、増えるのではなく減る

   ※ バッグがいっぱいのときに、まだ選んでいないおやつを押せないようにするのは
     画面のほう（カードの :disabled）にまかせている
     ここでも念のため、いっぱいのときは追加しないようにしておく

   event … そのカードの click イベント
           キーボードで押したのか、マウス・指で押したのかを見分けるのに使う */
function toggleSnackSelection(snackId: SnackId, event: MouseEvent) {
  // 決定音「ポン♪」（選ぶときも、解除するときも同じ音）
  playDecisionSound();

  if (isSnackSelected(snackId)) {
    // すでに入っているので、バッグから出す（＝選択を解除する）
    removeSnackFromBag(snackId);
    return;
  }

  // いっぱいのときは、これ以上入れない
  if (isSnackBagFull.value) {
    return;
  }

  selectedSnackIds.value.push(snackId);

  /* キーボードで選んで、バッグがいっぱいになった（＝2個目を選んだ）ときは、
     そのまま「このおやつで公園へ行く！」へカーソルを移す
     （あとは Enter / Space を押すだけで出発できる）

     ■ キーボードかどうかの見分けかた
       Enter / Space でボタンを押したときも click イベントが届くが、
       そのときの event.detail は 0 になる（マウスや指で押したときは 1 以上）

     ■ マウス・指で選んだときは動かさない
       マウスの人は、次に押したい場所へ自分でポインタを動かすので、
       カーソルだけが勝手に飛ぶと、かえって分かりにくくなるため

     ※ 解除したとき（上の return）と、1個目を選んだときは動かさない
       まだ出発できないので、続けておやつを選べるようにしておく */
  if (event.detail === 0 && canStartWithSnacks.value) {
    focusSnackGoButton();
  }
}

/* おやつ選択画面の「このおやつで公園へ行く！」

   2種類そろっていることを確かめてから、いつもの startGame() を呼ぶだけ
   （BGMの切り替えも gameStarted も、ぜんぶ startGame() の中のまま）

   ボタン自体も2種類そろうまで押せない（:disabled）ようにしてあるので、
   ここのチェックは念のためのもの
   キーボードやブラウザの機能から、思わぬ形で呼ばれても大丈夫にしておく

   isScreenChanging も見ているのは、フェード中の連打よけ
   押したしゅんかんに gameStarted は true になるが、
   目に見えているのはまだ消えかけのおやつ選択画面
   Enterを押しっぱなしにしたときなどに、
   そこからもう一度このボタンが押されてしまわないようにしている
   （キー操作をまとめて止める handleKeydown() と同じ目じるしを使う） */
function confirmSnacksAndStartGame() {
  if (!canStartWithSnacks.value) {
    return;
  }

  if (isScreenChanging.value) {
    return;
  }

  startGame();
}

/* おやつ選択画面が出おわったとき、最初のおやつ「🍇 グミ」へフォーカスを当てる

   A画面・B画面の focusTitleMainButton() と同じ役目だが、
   当てる先がボタン3つの並びではなく、v-for で作ったカードなので分けてある

   おやつは snacks 配列から作るので、ボタン1つずつに ref は付けていない
   入れもの（snackSelectionRef）の中の、最初の .snack-option を探して当てる
   こうしておけば、おやつが増えても直すところは無い

   :not(:disabled) を付けているのは、押せないカードを飛ばすため

   ふつうは、いちばん先にある 🍇 グミ がそのまま選ばれる
   ただし「チョコとせんべいを選ぶ → ひとつ前の画面へ戻る → もう一度おやつ選択へ」と
   戻ってきたときは、バッグがいっぱいなのでグミは押せない状態になっている
   押せないボタンは focus() してもフォーカスが当たらない（何も起きない）ので、
   そのときは押せるカード（＝もう選んであるチョコ）が選ばれるようにしておく

   ※ nextTick() で画面の書きかえを待つのは、こちらも同じ
   ※ 画面にまだカードが無いときは snackSelectionRef が null なので、
     ?. のおかげで何も起きずに終わる（無理にフォーカスしない） */
async function focusFirstSnackOption() {
  await nextTick();

  const firstSnackButton = snackSelectionRef.value?.querySelector<HTMLButtonElement>('.snack-option:not(:disabled)');

  firstSnackButton?.focus();
}

/* おやつ選択画面の「このおやつで公園へ行く！」へフォーカスを当てる
   （キーボードで2個目のおやつを選んだときに、toggleSnackSelection() から呼ばれる）

   focusFirstSnackOption() と同じく、入れもの（snackSelectionRef）の中から探して当てる

   ※ nextTick() で画面の書きかえを待ってから当てるのが大事
     2個目を選んだ直後は、ボタンにまだ disabled が付いたまま
     押せないボタンは focus() してもフォーカスが当たらないので、
     disabled が外れるのを待ってから当てる
   ※ ボタンが画面の下にかくれていても、focus() が見える位置までスクロールしてくれる */
async function focusSnackGoButton() {
  await nextTick();

  const snackGoButton = snackSelectionRef.value?.querySelector<HTMLButtonElement>('.snack-go:not(:disabled)');

  snackGoButton?.focus();
}

/* もうサウンドトラック・ミニゲームのページへ移動しはじめたかどうか（連打よけ） */
let isLeavingPage = false;

/* サウンドトラックのページ（/soundtrack）へ移動する

   このボタンは起動画面（A画面）にある。まだ「はじめる」を押していないので、
   タイトルBGMは鳴っていないし、鳴らす予約（playTitleBgmSoon）もされていない
   ＝ enterTitle() は呼ばない・タイトルBGMも鳴らさない、まま /soundtrack へ移る

   念のため cancelTitleBgmStart() と stopTitleBgm() も呼んでいるが、
   A画面ではどちらも「鳴っていないものを止める」だけの空振り
   （将来ほかの画面からも呼んだときの保険として残してある）
*/
function goToSoundtrack() {
  /* もう移動をはじめているときは、何もしない

     ページが入れかわるときも短いフェードをはさむので、
     押したあとも、しばらくこのA画面が見えている
     そのあいだに続けて押されても、移動のお願いを2回出さないようにする

     ※ 画面に出す数字ではないので、ref ではなくふつうの入れものでよい */
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  /* ※ 決定音は鳴らさない
     このボタンを押すと、このあとすぐページごと切りかわる
     切りかわりのとちゅうで「ポン♪」だけが残って聞こえるのを避けている
     （🌿 ミニゲーム、サウンドトラック・ミニゲームの各ページの「戻る」も同じ） */
  cancelTitleBgmStart();
  stopTitleBgm();

  /* A画面の表示には、いっさいさわらない
     （タイトルやボタンを先に消さないので、A画面は中身がそろったままフェードアウトする）
     表示の後片づけは、ページが消えたあとにNuxtがやってくれる */
  navigateTo('/soundtrack');
}

/* ミニゲーム「どこまで行ける？」（/minigame/secret-path）の解放

   秘密の小道をぬけたら（hasDiscoveredSecretSpot が true になったら）解放して、このブラウザに保存する
   （小道をぬけた時点で、もう小道のことは分かっているので、広場へ入るのを待たない）
   ミニゲームを増やすときも、本編で解放したいところで unlockMinigame('<id>') を呼ぶ

   ※ A画面の「🌿 ミニゲーム」（一覧への入口）は、解放していなくてもいつも出している
     まだ解放していないミニゲームは、一覧で「？？？」とヒントだけを出すので、中身は先に分からない
   ※ resetGame（もう一度あそぶ）でも、解放は戻さない（S+ランクのうた入りBGMの解放と同じ） */
watch(hasDiscoveredSecretSpot, (discovered) => {
  if (!discovered) {
    return;
  }

  unlockMinigame('secret-path');
});

/* ミニゲームの一覧（/minigame）へ移動する

   サウンドトラックへの入口と同じく、起動画面（A画面）にある
   まだタイトルBGMは鳴っていないので、goToSoundtrack() と同じ手順で移るだけ
   （連打よけの isLeavingPage も同じものを使う。どちらか一方へ動きはじめたら、もう片方も押せない） */
function goToMinigame() {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  /* ※ 決定音は鳴らさない（すぐ上の goToSoundtrack() と同じ理由） */
  cancelTitleBgmStart();
  stopTitleBgm();

  navigateTo('/minigame');
}

/* 場所を移動する
   移動すると前の結果メッセージと変化量の表示は消す

   ※ BGMが変わるのは、秘密の場所へ行くときだけ
     すべり台・砂場・どんぐり・池・芝生広場は、ぜんぶ同じ公園のつづきなので
     公園BGMを鳴らしたままにする（場所を移るたびに曲が鳴りなおすと落ち着かない）
*/
function goToPlace(place: GameEvent) {
  // 決定音「ポン♪」（公園入口から各場所へ移動するとき）
  playDecisionSound();

  // 前の画面で開いたままのおやつバッグが残らないように閉じる
  closeSnackMenu();

  // 前の画面で止めていたマウス操作も戻す（止めるのは「← もどる」のあとや、公園入口へ戻ってきた直後の画面だけ）
  isCommandPointerPaused.value = false;

  resultMessage.value = '';
  statusChanges.value = null;
  currentEvent.value = place;

  // 公園入口に行がある場所なら、「最後に入った場所」として覚える（公園入口へ戻ったときのカーソル位置に使う）
  // ひとやすみ（ベンチ）も公園入口に行があるので覚える（番号は getPlaceSelectionIndex() で決める）
  if (placeSelectionIndexes[place] !== undefined || place === 'restArea') {
    lastSelectedPlace.value = place;
  }

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;

  /* 秘密の場所へ入るときだけ、公園BGMからこもれびの広場BGMへ入れかえる

     かならず「公園BGMを止める → こもれびの広場BGMを鳴らす」の順番にする
     先に止めておかないと、待っている0.5秒のあいだ公園BGMが鳴りつづけ、
     2曲が重なってどちらもにごって聞こえてしまう

     stopParkBgm() は公園BGM1・BGM2の両方を止めてくれるので、
     いまどちらの時間帯かを気にしなくてよい

     こもれびの広場BGMは playSecretBgmSoon() で少し間を空けてから鳴らしはじめる
     ・決定音「ポン♪」が、曲の鳴りはじめにかき消されない
     ・いったん静かになるので「特別な場所へ入った」という感じが出る
     （待つのは音だけで、画面はこの上の行ですでに切りかわっている）

     ※ currentEvent を place にしたあとで呼ぶこと
       playSecretBgmSoon() は、鳴らす直前に
       「まだ秘密の場所にいるか」を currentEvent で確かめているため */
  if (place === 'secretSpot') {
    stopParkBgm();
    playSecretBgmSoon();
  }
}

/* 次の場所を選びに行く

   上から順番に見て、あてはまった時点で行き先が決まる
   ① GAME OVER中なら、どこへも動かさない
   ② いやいや中なら、まずはなだめる場面へ
   ③ いやいやが終わった直後なら、いまの時間に合う公園BGMへ戻す
   ④ 12:00を過ぎていたら、もう探検は続けられないのでゴールへ
   ⑤ 秘密の場所から出てきたなら、いまの時間に合う公園BGMへ戻す
   ⑥ 10:30を過ぎているのにBGM1のままなら、午前後半のBGM2へ切り替える
   ⑦ とつぜんのできごとの予定があれば、その専用画面へ
   ⑧ 何もなければ、いつもどおり公園入口へ（カーソルは、最後にいた場所のコマンドに合わせる）

   ⑦が④より下にあるのがポイント
   お昼を過ぎているのにとつぜんのできごとを始めてしまうと、
   「12:00までに帰る」というルールが崩れてしまう

   ⑤⑥も④より下に置くのが大事
   ゴールする直前（＝すぐ公園BGMを止める）のに公園BGMを鳴らしはじめると、
   一瞬だけ鳴って消える不自然な音になってしまう
*/
function goToNextPlace() {
  // GAME OVER後にうっかり別の画面へ動いてしまわないようにする
  if (currentEvent.value === 'gameOver') {
    return;
  }

  /* いま出ようとしている画面が「秘密の場所」だったかを、先に覚えておく

     このあと currentEvent を書きかえてしまうと、
     「さっきまで秘密の場所にいた」ことが分からなくなる
     こもれびの広場BGMを止めるのも、公園BGMへ戻すのも、この印を見て決める

     ※ 「← 場所選びにもどる」でも「次の場所を選ぶ」でも、
       秘密の場所から出る道はこの関数1本だけなので、ここで覚えれば足りる */
  const leavingSecretSpot = currentEvent.value === 'secretSpot';

  /* 決定音「ポン♪」（次の場所を選ぶ／← 場所選びにもどる／次へ）

     ただし、このあと ④ でゴールへ向かうときは鳴らさない
     ゴールではファンファーレだけを聞かせたいので、決定音を重ねない
     （④に進むのは「いやいや中ではない」かつ「12:00を過ぎている」ときだけ）
  */
  if (isTantrum.value || !isTimeOver.value) {
    playDecisionSound();
  }

  resultMessage.value = '';
  statusChanges.value = null;

  // 前の画面で止めていたマウス操作も戻す（止めるのは「← もどる」のあとや、公園入口へ戻ってきた直後の画面だけ）
  isCommandPointerPaused.value = false;

  // おやつバッグも閉じておく
  // （ひとやすみ でバッグを開いたまま「← 場所選びにもどる」の番号でEnterしたときなどのため）
  closeSnackMenu();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;

  /* 秘密の場所から出るので、こもれびの広場BGMを止める

     行き先（いやいやタイム・ゴール・とつぜんのできごと・公園入口）に関わらず、
     秘密の場所の画面を離れる時点で、この曲の出番は終わり
     ここでまとめて止めておくと、行き先ごとに止め忘れることがない

     ※ pause ではなく stop（先頭へ戻す）にしている
       もう一度秘密の場所へ来たときは、前回の続きではなく
       また曲の頭から鳴らしたいため

     ※ 「次に何を鳴らすか」は、このあと行き先が決まってから
       いやいやなら いやいやBGM、公園へ戻るなら時間に合った公園BGM、
       ゴールなら リザルトBGM と、行き先ごとにちがうため */
  if (leavingSecretSpot) {
    stopSecretBgm();
  }

  /* ② いやいや中なら、いやいやタイムの画面へ

     ここでいやいやBGMを先頭から鳴らす予約をする（いやいやタイムの場面が出きる0.4秒あとから、フェードイン付き）

     公園BGMとこもれびの広場BGMは、いやいやが発生した瞬間（checkTantrum）に
     すでに stop して無音にしてあるので、ここでは止まったまま
     それでも念のためもう一度 stop を呼んでおく
     （いやいやタイムへ来る道はここ1本だが、
       万一どこかで鳴っていても、2曲が重ならないようにするため）

     ※ 秘密の場所で始まったいやいやでも、鳴らすのは いやいやBGM
       いやいやは「こうちゃんが泣いている場面」なので、
       どの場所で起きても同じ曲・同じ聞こえかたにそろえる
  */
  if (isTantrum.value) {
    stopParkBgm();
    stopSecretBgm();

    currentEvent.value = 'tantrum';

    /* ※ currentEvent を 'tantrum' にしたあとで呼ぶこと
         playTantrumBgmSoon() は、鳴らす直前に「まだいやいやタイムにいるか」を currentEvent で確かめているため */
    playTantrumBgmSoon();
    return;
  }

  /* ここから下は、いやいやが終わっている（isTantrum が false）とき

     いまいる画面がいやいやタイムなら、この「次の場所を選ぶ」が
     いやいやタイムの終わり＝いやいやBGMの終わり
     （だっこ・おやつ・お話・待つで isTantrum が false になった瞬間ではなく、
       結果の文章を読み終えて画面から出るここで止める）

     ・いやいやBGMは stop（先頭へ戻す）
       次のいやいやは、また曲の頭から始めたいため
     ・公園へ戻るときだけ、公園BGMを「また最初から」鳴らしはじめる
       （続きからではなく頭から）

       鳴らしかたは playParkBgmSoon()＝「このおやつで公園へ行く！」を押したときと同じ
       ・少し間（500ms）を空けてから鳴らしはじめる
         → 決定音「ポン♪」が曲の鳴りはじめにかき消されない
       ・そのあと無音からフェードインする
       こうすると「いやいやが終わって、また公園にもどってきた」という
       感じが、ゲームを始めたときとまったく同じ聞こえかたになる

     ※ 12:00を過ぎているときは公園BGMを鳴らさない
       このあとすぐ下の goToGoal() で止めることになり、
       一瞬だけ鳴って消える不自然な音になってしまうため
       （playParkBgmSoon() の中でも、待っているあいだに
         リザルト画面へ移っていたら鳴らさないようにしてある）
  */
  if (currentEvent.value === 'tantrum') {
    stopTantrumBgm();

    if (!isTimeOver.value) {
      playParkBgmSoon();
    }

    /* いやいやタイムを完全に出るので、いやいやの状態もここでまとめて片づける
       （理由・レベル・対応の記録・ナイス対応。中身は resetTantrumState() を参照）

       だっこ・おやつなどで いやいや が終わった瞬間ではなく、
       結果を読み終えたこのタイミングで戻すのがポイント（いやいやBGMを止めるのと同じ考え方）
       結果を読んでいるあいだは、カードの見出し（大いやいやタイム！など）とセリフをそのまま見せたいため

       ※ このあと同じ処理の中で、currentEvent が次の画面に変わる
         <Transition> で消えていくいやいやタイムの画面は、もう描きなおされないので、
         フェードアウトの途中で見出しやセリフ、「✨ ナイス対応！」だけが変わってガタつくことはない
         （この関数の上で resultMessage を空にしているのと同じ） */
    resetTantrumState();
  }

  if (isTimeOver.value) {
    goToGoal();
    return;
  }

  /* ⑤ 秘密の場所から、ふつうの公園へ戻ってきた

     ここまで来たということは
     ・いやいやではない（上の②で分かれている）
     ・12:00も過ぎていない（すぐ上の④で分かれている）
     ＝ これからも公園の探検が続く、ということ
     なので、こもれびの広場BGMから公園BGMへ戻す

     鳴らしかたは playParkBgmSoon()＝「このおやつで公園へ行く！」を押したときと同じ
     ・こもれびの広場BGMは、この関数の上のほうですでに止めてある
     ・少し間（500ms）を空けてから鳴らしはじめる
       → 決定音「ポン♪」が曲の鳴りはじめにかき消されない
       → いったん静かになるので「秘密の場所から出てきた」感じが出る
     ・そのあと無音からフェードインする

     ※ どちらの公園BGMへ戻るかは、playParkBgmSoon() にまかせる
       ここで park-bgm.mp3 に決め打ちしてはいけない
       実際に鳴らす playParkBgm() が、500ms後にそのときの時計を見て
       ・10:30より前  … park-bgm.mp3  （BGM1）
       ・10:30以降    … park-bgm2.mp3 （BGM2）
       を選んでくれる
       たとえば10:10に秘密の場所へ入って、中で20分遊んで10:30を過ぎていたら、
       出てきたときに鳴るのはBGM1ではなくBGM2になる

     ※ 12:00を過ぎているときは、ここまで来ない（すぐ上の④でゴールへ行く）
       ゴール直前に公園BGMを鳴らすと、
       一瞬だけ鳴って消える不自然な音になってしまうため

     ※ とつぜんのできごとの予定があるときも、ここを通ってよい
       救急車・てんとう虫・犬などは、どれも「ふつうの公園での出来事」なので、
       こもれびの広場BGMのままではなく公園BGMへ戻すのが自然 */
  if (leavingSecretSpot) {
    playParkBgmSoon();
  }

  /* ⑥ 10:30を過ぎていて、まだ午前前半のBGM1を鳴らしているなら、
     ここで午前後半のBGM2へ切り替える

     「10:30になった瞬間」ではなく、この
     「行動の結果を確認して、次へ進むタイミング」で切り替えるのがポイント
     たとえば10:15に20分かかる行動をして10:35になっても、
     結果カードを読んでいるあいだはBGM1のまま
     この「次の場所を選ぶ」を押したところで、BGM2へ変わる

     すでにBGM2になっているときは、中で何もしないで戻ってくるので、
     押すたびに曲が頭から鳴りなおすことはない
     （とつぜんのできごとへ進むときも、ここを通ってからなので公園BGM2が鳴る）

     ※ すぐ上の⑤（秘密の場所から出てきた）を通ったときは、ここは何もしない
       秘密の場所へ入るときに公園BGMを止めてあり、
       「いま鳴らしている公園BGM」（activeParkBgm）が無い状態になっているため
       曲を選ぶのは⑤で予約した playParkBgmSoon() の役目なので、
       ここで二重に鳴らしはじめてしまうことはない */
  switchParkBgmForCurrentTime();

  // とつぜんのできごとの予定があれば、その画面へ移動する
  // 移動したら予定表は空（null）に戻す
  // ※ ここで戻しておかないと、とつぜんのできごとが終わったあとに
  //   もう一度おなじ画面へ入ってしまう
  if (pendingSuddenEvent.value !== null) {
    /* 行き先をいったん控えてから、画面を切りかえる

       pendingSuddenEvent を空に戻したあとでは、どのできごとへ来たのかが分からなくなるため
       （効果音を鳴らすかどうかの判定に、この控えを使う） */
    const nextSuddenEvent = pendingSuddenEvent.value;

    currentEvent.value = nextSuddenEvent;
    pendingSuddenEvent.value = null;

    /* できごとの画面へ「移動した瞬間」だけ、そのできごとの効果音を鳴らす

       画面を見ているあいだではなく、ここで1回だけ鳴らす
       （同じ画面のまま何かしても、鳴りなおすことはない）

       どのできごとでどの音を鳴らすかは playSuddenEventSound() が知っているので、
       ここではできごとの名前を渡すだけでよい
       サウンドOFF・音量0%のときも、あちらで止めてくれる */
    playSuddenEventSound(nextSuddenEvent);

    return;
  }

  currentEvent.value = 'parkEntrance';

  // 公園入口のカーソルは、最後にいた場所のコマンドに合わせる
  // （遊んだあとの「次の場所を選ぶ」でも、何もせず「← 場所選びにもどる」でも、とつぜんのできごと・いやいやのあとでも同じ）
  restoreEntranceCursor();
}

/* ============================================================
   場所での行動（6か所 × 2コマンド）

   12個の行動は、どれもまったく同じ順番で進むので、
   実際に動かすところは下の runPlaceAction() 1つにまとめてある

   場所ごとの数値・時間・結果の文章は data/placeActions.ts のほう
   （数字や文章を直したいときは、あちらのその場所のところだけを見ればよい）
   ============================================================ */

/* 行動データを1件受け取って、その行動を実行する

   進む順番は、12個の行動それぞれに書いてあったときとまったく同じ
   ① 行動する前のステータスを控える
   ② こうちゃんの体力・機嫌 → おでかけポイント → 親の体力・余裕
   ③ 時間を進める
   ④ 結果の文章を入れる
   ⑤ アイテムが見つかるかを見る（抽選）
   ⑥ 行動後の共通処理（遊んだ回数・探検済み・いやいや・ちょっとしたできごと・
     今回の変化の記録・とつぜんのできごとの抽選）

   ※ ⑤と⑥の中では乱数を使うので、呼ぶ順番と回数は変えないこと
   ※ おでかけポイントは addOutingPoint() を通す（2回目の場所は半分になる） */
function runPlaceAction(action: PlaceActionDefinition) {
  // 行動する前のステータスを控えておく
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
   左・まん中・右の3レーンを動いて、上から流れてくる枝をよけながら、こもれびを集める

   ■ 中身は composables/useSecretPathGame.ts にある
     ミニゲームの中だけで意味を持つ状態・1コマごとの処理（requestAnimationFrame）・
     キー操作・ポインター操作・小道専用のイベント（keyup / blur / visibilitychange）の
     登録と解除・はじまる前に戻す resetSecretPathGame() は、ぜんぶあちらが持っている
     計算と判定（予定表づくり・結果の文章・ボーナス・しきい値）は、
     今までどおり composables/useSecretPath.ts

   ■ このファイルに残してあるもの
     ・ゲーム全体で共有する状態（currentEvent・outingPoint・hasDiscoveredSecretSpot・
       statusChanges・selectedCommandIndex）を、ref のまま渡す
     ・場所の移動 goToPlace()・公園入口のカーソル合わせ restoreEntranceCursor()・
       音を鳴らす4つを、関数のまま渡す
     ・公園入口の「秘密の小道」goToSecretArea()
       （小道へ入るか、そのまま広場へ入るかを決めるところなので、ゲーム全体の側）

   ■ 流れ（secretPathPhase）
     ready    … 説明と「小道へ進む」「← 場所選びにもどる」ボタン（まだ何も動かない）
                「← 場所選びにもどる」で公園入口の「どこへ行く？」へ戻る（leaveSecretPathToEntrance()）
     playing  … ミニゲーム中（15秒）
     finished … 結果の文章と「先へ進む」ボタン
                「先へ進む」で secretSpot（こもれびの広場）へ入る

   ■ ご褒美として楽しむミニゲーム
     ・枝に当たっても GAME OVER にはならない（集めたこもれびが1つ減るだけ。0より下にはならない）
       本編のステータス（体力・機嫌・余裕）にはダメージを与えず、左右にもそのまま動ける
     ・こもれびをいくつ取っても、かならず広場へ行ける
     ・親子のステータスと時間は、いっさい変えない
     ・こもれびをたくさん集めたときだけ、おでかけポイントを少しだけボーナス
       （集められなくても損はしない。こもれびの数で変わるのは、結果の文章とボーナスだけ）

   ■ BGM
     小道のあいだは公園BGMのまま（ここではBGMにさわらない）
     こもれびの広場BGMが始まるのは、広場へ入ったとき（goToPlace('secretSpot') の中）
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

  /* はじまる前の状態に戻す（goToSecretArea() と resetGame() から呼ぶ） */
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

   ・このプレイで、まだ広場を見つけていない … 秘密の小道（ミニゲーム）へ
   ・もう見つけている                     … 今までどおり、そのまま こもれびの広場へ

   ※ 秘密の小道へ行くときは、BGMは変えない（公園BGMのまま）
     goToPlace() がBGMを入れかえるのは、行き先が secretSpot のときだけ */
function goToSecretArea() {
  if (hasDiscoveredSecretSpot.value) {
    goToPlace('secretSpot');
    return;
  }

  resetSecretPathGame();
  goToPlace('secretPath');
}

/* ============================================================
   ひとやすみ（公園入口の「ひとやすみ」＝ベンチで選ぶ、共通のケア行動）

   ・通常の場所の「どうする？」 … その場所ならではの遊び（すべる・どんぐりを拾う など）
   ・ひとやすみ（ベンチ）     … どこでも同じ、親子の状態を整える行動（休憩する・おやつにする）

   ※ 前は通常の場所の「どうする？」に「休憩・おやつ」があったが、
     どの場所でも同じ効果なので、公園入口の「ひとやすみ」へまとめた

   いちばん大事なのは finishPlayAction() を呼ばないこと
   あの関数は「その場所で遊んだ」ときの共通処理なので、中で
   ・playCount（遊んだ回数）を増やす
   ・visitedPlaces（探検済みの場所）に追加する
   ・runRandomEvent()（ちょっとしたできごと）を起こす
   ・checkTantrum()（いやいや抽選）
   ・checkSuddenEvent()（とつぜんのできごと抽選）
   までまとめて行っている

   ひとやすみは遊びではなく休んだだけなので、
   これらが起きてしまうと
   「ベンチに座っただけで、どんぐりの木を探検済みにした」
   「休んだ直後に救急車が来た」
   のようにおかしなことになる

   そこで finishPlayAction() は通さず、
   行動のあとに必ず要る3つだけを finishCareAction() で行う
   ============================================================ */

/* ひとやすみの行動が終わったあとに呼ぶ共通処理

   場所の行動の finishPlayAction() にあたるものだが、中身はずっと少ない
   ① 今回の変化量を記録する（0〜100に丸める前に行うのが大事）
   ② ステータスを0〜100に収める
   ③ 限界をむかえていないか判定する
   ④ 選択中のコマンドを一番上（0）に戻す

   ③を入れてあるのは、休憩やおやつでもステータスが動くため
   （どちらも回復する行動なので、ここでGAME OVERになることは無いはずだが、
     ステータスを動かしたら必ず判定する、という書きかたにそろえておく）
*/
function finishCareAction() {
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 結果カードが出て「次の場所を選ぶ」だけの画面になるので、一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ① 休憩する

   おやつを使わずに、いつでも選べる回復行動
   こうちゃんの体力・親の体力・親の余裕が戻るかわりに、15分かかる
   「まだ遊びたいのに休まされた」ので、こうちゃんの機嫌だけは少し下がる

   ※ おでかけポイントは増えない（遊んでいないので点にはならない）
*/
function takeCommonBreak() {
  // 行動する前のステータスを控えておく
  // ※ 決定音「ポン♪」と、前の行動の演出データのリセットもここで行われる
  startStatusChanges();

  childEnergy.value += 12;
  childMood.value -= 2;
  parentEnergy.value += 12;
  parentCalm.value += 8;
  addMinutes(15);

  resultMessage.value = 'ベンチでひと休み。こうちゃんも少し元気が出てきました。';

  // finishPlayAction() は呼ばない（上の説明のとおり）
  finishCareAction();
}

/* ② おやつをあげる（通常の探検中）

   「ひとやすみ」→「おやつにする」→ おやつバッグ で選んだときに呼ばれる
   （引数の snackId が、選んだおやつの名札）

   いやいやタイムの giveSnack() とは別の関数にしている
   あちらは「泣いているこうちゃんを落ち着かせる」ための処理なので、
   いやいやを終わらせる（isTantrum を false にする）までを受け持っている
   こちらは泣いていないときに食べるおやつなので、回復だけを行う

   おやつは、いやいや用と同じバッグ（selectedSnackIds）から取り出す
   ここで1個使えば、そのあといやいやが起きたときに使えるおやつも減る
   ＝「ここで使ってしまって大丈夫か？」を考える場面になる

   ・こうちゃんの体力・機嫌、かかる時間 … 選んだおやつのデータ（snack.energy / mood / minutes）
   ・親の余裕 +2                         … ベンチでひと息つけたぶん（どのおやつでも同じ）
*/
function giveSnackWhileExploring(snackId: SnackId) {
  /* バッグに入っていないおやつなら、何もしないで終わり

     画面にはバッグにあるおやつしか出していないが、
     ここでも確かめることで、万一呼ばれても
     持っていないおやつで回復することがないようにしている

     ※ startStatusChanges() より前に置くのが大事
       あとに置くと、何も起きていないのに決定音が鳴り、
       前の行動の結果表示だけが消えてしまう
  */
  const snack = findSnackInBag(snackId);

  if (!snack) {
    return;
  }

  // 行動する前のステータスを控えておく
  // ※ ここで ひとやすみ とおやつバッグも閉じる
  startStatusChanges();

  childEnergy.value += snack.energy;
  childMood.value += snack.mood;
  parentCalm.value += 2;
  addMinutes(snack.minutes);

  resultMessage.value = `「おいしい！」ベンチで${snack.name}をもぐもぐ。`;

  // finishPlayAction() は呼ばない（上の説明のとおり）
  finishCareAction();

  // ステータスの計算がぜんぶ終わってから、食べたおやつをバッグから出す
  removeSnackFromBag(snack.id);
}

/* ============================================================
   とつぜんのできごと（通常行動のあと、20%で起こる出来事）

   通常の場所の行動とちがうところ
   ・finishPlayAction() を呼ばない
     → runRandomEvent() / checkTantrum() / checkSuddenEvent() が動かないので、
       とつぜんのできごとから続けてとつぜんのできごとが起きることはない
     → visitedPlaces（探検した場所）にも入らない
   ・そのかわり、どの行動も次の4つは必ず行う
     ① startStatusChanges()  行動前のステータスを控える（いちばん最初）
     ② saveStatusChanges()   「今回の変化」を作る（0〜100に丸める前）
     ③ fixAllStatus()        ステータスを0〜100に収める
     ④ checkGameOver()       限界をむかえていないか判定する

   ※ おでかけポイントは addOutingPoint() ではなく、そのまま足している
     addOutingPoint() は「2回目の場所は半分」というルールの関数で、
     とつぜんのできごとは「場所」ではないため
   ============================================================ */

/* ===== とつぜんのできごと：救急車のサイレン ===== */

/* ① 救急車を探してみる */
function lookForAmbulance() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 8;
  outingPoint.value += 3;
  parentEnergy.value -= 2;
  addMinutes(10);

  resultMessage.value = '「いた！」道路の向こうを救急車が走っていきました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② いっしょにサイレンを聞く */
function listenToSiren() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 4;
  addMinutes(5);

  resultMessage.value = '「ピーポー！」遠ざかる音を、最後までまねしています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ 遊びに戻る（ステータスも時間も変わらない） */
function walkOnFromSiren() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  resultMessage.value = '「またこんど見ようね」遊びに戻っても、何度もふりかえっています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== とつぜんのできごと：テントウムシ ===== */

/* ① いっしょにじっくり見る */
function watchLadybug() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 7;
  outingPoint.value += 4;
  addMinutes(10);

  resultMessage.value = '「てちてち歩いてる、かわいい」二人でじっくり見つめました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② そっと手を近づけてみる */
function holdLadybug() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 9;
  outingPoint.value += 5;
  addMinutes(10);

  resultMessage.value = '「のった！」テントウムシが指にちょこんと乗りました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ ばいばいして見送る */
function seeOffLadybug() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 3;
  addMinutes(5);

  resultMessage.value = '「ばいばーい！」空に向かって手をふっています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== とつぜんのできごと：犬が近づいてくる ===== */

/* ① 近くで見せてもらう */
function watchDogClose() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 6;
  outingPoint.value += 3;
  parentCalm.value -= 3;
  addMinutes(10);

  resultMessage.value = '「わんわん、かわいいね！」近くで見せてもらいました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② だっこで少し離れて見る
   （こうちゃんをだっこして、犬から少し離れたところで見る） */
function watchDogBehindParent() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 3;
  parentEnergy.value -= 2;
  addMinutes(5);

  resultMessage.value = '「わんわん、こっち見た！」だっこで少し離れて見ています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ 道をあけて見送る */
function keepDistanceFromDog() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  addMinutes(5);

  resultMessage.value = '「わんわん、ばいばーい！」犬はそのまま歩いていきました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== とつぜんのできごと：こうちゃんがころんだ =====

   ※ このイベントからは checkTantrum() を呼ばない
     「ころぶ → 選ぶ → 結果」だけの、シンプルな流れにしている

   ※ おやつは使わない（どれを選んでも、バッグのおやつは減らない）
     選択肢はいつも同じ3つで、画面の並び・runSelectedCommand() の番号・下の関数の並びは同じ順番
       0 すぐにだっこする／1 「いたいのいたいのとんでいけ〜」／2 「大丈夫？」と声をかけて待つ

   ※ 下の3つに書いてある こうちゃん の数字は、
     「ころんだ分」と「なだめた分」を足したあとの合計

     ころんだ時点で、ひざは痛いし、びっくりして泣きそうになっている
     そこからどれだけ取り返せるかがこのイベントなので、
     じょうずになだめても、ころぶ前より良くはならない
     （＝こうちゃんの数字は、プラスにしない）

     ・体力 … ころべば必ず減る
       （だっこ -3 ／ いたいのいたいの -4 ／ 声をかけて待つ -6）
     ・機嫌 … だっこなら、ころぶ前と同じところまで戻る（±0）
       （だっこ 0 ／ いたいのいたいの -2 ／ 声をかけて待つ -8）

   ※ 目の前で子どもがころぶと、どうしてもヒヤッとする
     そのため、どれを選んでも親の余裕は減る
     何で払うかがちがうだけで、いやいや対応とまったく同じ考えかた
     ・だっこ           … 親の体力 -10 ／ 親の余裕 -3 ／ 10分（親の体力を大きく使って、しっかり対応）
     ・いたいのいたいの … 親の体力 -3  ／ 親の余裕 -5 ／  5分（バランス型）
     ・声をかけて待つ   … 親の体力 +1  ／ 親の余裕 -8 ／  5分（親の体力は減らないが、こうちゃんの負担がいちばん大きい）
*/

/* ① すぐにだっこする */
function hugAfterFall() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  // 機嫌は ±0（ころんだ分を、だっこでちょうど取り返した）
  // ＝ここでは childMood をさわらない
  // 体力のほうは、ひざを打ったぶんだけ残る
  childEnergy.value -= 3;
  parentEnergy.value -= 10;
  parentCalm.value -= 3;
  addMinutes(10);

  resultMessage.value = 'ぎゅっとだっこ。肩に顔をつけて、少しずつ落ち着いてきました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // だっこは親の体力を10使うので、残りが少ないとここでGAME OVERになる
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② 「いたいのいたいのとんでいけ〜」

   だっこ（親の体力-10）ほど親の力を使わずに、
   声をかけて待つ（機嫌-8）よりも こうちゃん の気持ちを立てなおせる、
   ちょうど真ん中の選択肢（バランス型）
*/
function blowPainAway() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  // だっこほどではないが、ころんだ分をだいぶ取り返せる
  childMood.value -= 2;
  childEnergy.value -= 4;
  parentEnergy.value -= 3;
  parentCalm.value -= 5;
  addMinutes(5);

  resultMessage.value = '「とんでった！」ひざをなでてもらって、にっこり。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ 「大丈夫？」と声をかけて待つ */
function watchAfterFall() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  // なだめていないので、ころんだ分がほとんどそのまま残る
  childMood.value -= 8;
  childEnergy.value -= 6;
  parentEnergy.value += 1;
  parentCalm.value -= 8;
  addMinutes(5);

  resultMessage.value = '「だいじょうぶ」自分でよいしょと立ち上がりました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== とつぜんのできごと：噴水が突然出る ===== */

/* ① 水しぶきの近くまで行く */
function goCloseToFountain() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 9;
  childEnergy.value -= 7;
  outingPoint.value += 5;
  parentEnergy.value -= 5;
  addMinutes(10);

  resultMessage.value = '「きゃーっ！」水しぶきに向かって走りまわっています！';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② 少し離れてながめる */
function watchFountainFar() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 5;
  outingPoint.value += 2;
  addMinutes(5);

  resultMessage.value = '水の音を聞きながら、指をさして笑っています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ 遊びに戻る（ステータスも時間も変わらない） */
function walkOnFromFountain() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  resultMessage.value = '「またあとで見ようね」遊びに戻っても、何度も噴水をふりかえっています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== ゴール ===== */

/* ゴールへ向かう（判定して結果画面へ） */
function goToGoal() {
  // GAME OVERになったときは、S+〜Dランクの判定はしない
  if (currentEvent.value === 'gameOver') {
    return;
  }

  /* BGMを止める（ゴールしたので公園での探検は終わり）
     先に止めることで、このあとのファンファーレがBGMに埋もれない

     ※ いやいやBGMも止めておく
       いやいや対応中に12:00を過ぎると、いやいやタイムからそのまま
       ここへ来ることがあるため

     ※ こもれびの広場BGMも止めておく
       秘密の場所で遊んでいるうちに12:00を過ぎることがある
       （11:50に入って20分遊ぶと12:10）
       そのときは、結果カードを読んでいるあいだはこもれびの広場BGMのままにして、
       「次の場所を選ぶ」を押したこのタイミングで止める

       この場合、公園BGMは一瞬も鳴らさない
       goToNextPlace() では「12:00を過ぎていたら公園BGMを鳴らさない」ように
       分かれているので、こもれびの広場BGM → そのままリザルトBGM、となる */
  stopParkBgm();
  stopSecretBgm();
  stopTantrumBgm();

  /* ゴール音「タタターン♪」

     GAME OVERのときは、すぐ上の return でここまで来ないので鳴らない
     また、ゴールでは通常の決定音を鳴らさない（ファンファーレが埋もれないように）
  */
  playGoalSound();

  resultMessage.value = '';
  statusChanges.value = null;
  addMinutes(10);

  // おやつバッグも閉じておく
  closeSnackMenu();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
  judgeResult();

  /* S+ランクなら、うた入りエンディングBGMを解放する（はじめてなら、お知らせも出す）
     ランクが決まった直後に呼ぶ（このあと鳴らすリザルトBGMも、同じランクで曲を選ぶ） */
  unlockSPlusSongIfEarned();

  currentEvent.value = 'goal';

  /* リザルトBGMを鳴らしはじめる

     すぐ鳴らすと、上で鳴らしたゴール音「タタターン♪」と重なってしまうので、
     playResultBgmSoon() の中で少しだけ間を空けてから始める
     （待つのは音だけで、結果画面はすぐ表示される）

     ※ currentEvent を 'goal' にしたあとで呼ぶこと
       playResultBgmSoon() は、鳴らす直前に
       「まだ結果画面にいるか」を currentEvent で確かめているため */
  playResultBgmSoon();
}

/* 公園入口の「公園の出口へ向かう（ゴール）」を選んだとき

   すぐにはゴールへ向かわず、「出口へ向かう？」の確認ダイアログを開く
   （クリックでも Enter / Space でも、ここを通る） */
function openGoalConfirm() {
  // 決定音「ポン♪」（押せたことが分かるように。ひとやすみを開くときと同じ）
  playDecisionSound();

  isGoalConfirmOpen.value = true;

  // 開いたときは、いつも「もう少し遊ぶ」を選んだ状態にする
  // Enter を続けて押してしまっても、うっかりおでかけが終わらないようにするため
  selectedGoalConfirmIndex.value = 0;

  // うしろの「どこへ行く？」も「公園の出口へ向かう」を選んだ状態にそろえておく
  // （マウスで押したときも、閉じたあとにどこから開いたかが分かる）
  selectedCommandIndex.value = goalCommandIndex.value;

  // マウスで押したときは、うしろのゴールのボタンにフォーカスが残り、枠が出たままになる
  // ダイアログが手前に出ているのに紛らわしいので、外しておく
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

/* 確認ダイアログを閉じる（表示を戻すだけ。音は鳴らさない）

   公園入口に戻るだけで、時間もステータスも変わらない
   うしろの「どこへ行く？」は「公園の出口へ向かう」が選ばれたまま

   ※ ここに決定音を入れないのが大事
     「出口へ向かう」（confirmGoToGoal）や、もう一度あそぶ（resetGame）からも呼ばれる
     ゴールではファンファーレだけを聞かせたいので、決定音を重ねない
     （→ 下の cancelGoalConfirm()。人が「やめる」と押したときだけ鳴らす） */
function closeGoalConfirm() {
  isGoalConfirmOpen.value = false;
  selectedGoalConfirmIndex.value = 0;
}

/* 確認ダイアログをやめる（「もう少し遊ぶ」・Escape・ダイアログの外のクリック）

   やることは closeGoalConfirm() と同じで、決定音を鳴らすところだけがちがう
   出口へ向かうのをやめて、公園入口の「どこへ行く？」へ戻る操作なので、
   ほかのコマンドと同じように、押せたことを音で返す */
function cancelGoalConfirm() {
  // 決定音「ポン♪」（ほかのコマンドと同じ）
  playDecisionSound();

  closeGoalConfirm();
}

/* 確認ダイアログの「出口へ向かう」

   ダイアログを閉じてから、いつもの goToGoal() を呼ぶ
   （BGM・ゴール音・結果の判定は、ぜんぶ goToGoal() の中のまま）
   画面にダイアログが出ていないときは、何もしない（念のため） */
function confirmGoToGoal() {
  if (!isGoalConfirmVisible.value) {
    return;
  }

  closeGoalConfirm();
  goToGoal();
}

/* もう一度あそぶ */
function resetGame() {
  // 決定音「ポン♪」
  // ※ AudioContext（作業台）はここでは作り直さない
  //   ページを開いているあいだ、ずっと同じものを使い続ける
  playDecisionSound();

  /* BGMを公園用からタイトル用へ戻す

     startGame() と逆の切り替え
     「公園BGMを止める → タイトルBGMを最初から鳴らす」の順番にする
     公園BGMは先頭に戻しておくので、
     次に「このおやつで公園へ行く！」を押したときにまた最初から鳴る

     タイトルBGMは少しだけ間を空けてから鳴らしはじめる
     すぐ鳴らすと、決定音「ポン♪」が曲にかき消されてしまうため
     （待つのは音だけで、画面の切り替えはこのあとすぐ行う）

     ※ ここは「もう一度あそぶ」を押した直後＝ユーザーが操作したあとなので、
       自動再生を止められることなくタイトルBGMを鳴らせる

     いやいやBGMも stop で先頭に戻しておく
     （pause だと、次のプレイのいやいやが前回の途中から鳴りだしてしまう）

     リザルトBGMも stop で止める
     stopResultBgm() は「あとで鳴らす」の予約も取り消すので、
     ゴール音が鳴っているあいだに「もう一度あそぶ」を押しても、
     あとからタイトル画面でリザルトBGMが鳴りだすことはない

     こもれびの広場BGMも stop で先頭に戻しておく
     GAME OVERになった画面から「もう一度あそぶ」を押すこともあるので、
     再生位置も0に戻して、次に秘密の場所へ入ったときは必ず頭から鳴らす

     GAME OVER BGMも stop で止めて、先頭に戻しておく
     GAME OVER画面から「もう一度あそぶ」を押したときは、ここで曲が止まってからタイトルBGMへ切りかわる
     stopGameOverBgm() は「あとで鳴らす」の予約も取り消すので、
     GAME OVERになってすぐ（0.5秒の待ち時間のうちに）押しても、
     あとからタイトル画面でGAME OVERの曲が鳴りだすことはない */
  stopParkBgm();
  stopSecretBgm();
  stopTantrumBgm();
  stopResultBgm();
  stopGameOverBgm();
  playTitleBgmSoon();

  /* ステータス・おでかけポイント・時間・ゲームの進みぐあい（いる場所・探検済み・
     見つけたもの・遊んだ回数・こもれびの広場を見つけたか）と、
     いやいや中かどうか・いやいやの回数を、まとめて最初に戻す

     初期値は composables/useGameState.ts が持っている
     （はじめるときと同じ値になるので、ここに数字を書き写す必要がない） */
  resetGameState();

  // 秘密の小道のミニゲームも片づける
  // （ループ・流れてくるもの・こもれびの数・こうちゃんの位置を、まとめて止めて戻す）
  resetSecretPathGame();

  // いやいやの理由・レベル・対応の記録・ナイス対応も「いやいやしていない」状態に戻す
  // （大いやいや中にGAME OVERになったときの様子が、次のプレイに残らないようにする）
  resetTantrumState();

  /* きょうのおやつも、選んでいない状態に戻す

     次のプレイへ前回のグミ・せんべいが残っていると、
     おやつ選択画面を開いたとたんに「2 / 2」になっていて、
     選びなおすつもりが「もう選び終わっている」ことになってしまう

     isSnackSelectionOpen も false に戻しておく
     公園へ出発したあとも true のまま残しているので、
     ここで戻さないと、B画面へ帰ったつもりが
     おやつ選択画面のままになってしまう

     ※ おやつの残り個数（snackLeft）は、バッグの中身の数そのものなので、
       ここでバッグを空にすれば いっしょに0になる（別に戻す必要はない）
       次のプレイでは、おやつ選択画面でまた2つ選んでから出発する

     ※ ゲーム中に開いていたおやつバッグは、このあとの closeSnackMenu() で閉じる

     バッグを空にする中身は composables/useSnackBag.ts の resetSnackBag() */
  resetSnackBag();
  isSnackSelectionOpen.value = false;

  // あそびかた画面も閉じた状態に戻しておく
  // （もう一度あそぶ・はじめの画面へ戻る のあとに、あそびかたが開いたまま残らないようにする）
  isHowToPlayOpen.value = false;

  // いやいや発生の演出も消しておく
  // （残っていると、タイトル画面の上に前回の「いやいや発生！」が出たままになる）
  hideTantrumAlert();

  // おやつバッグも閉じておく
  // （前回のプレイで開いたままGAME OVERになっていることがあるため）
  closeSnackMenu();

  // 「出口へ向かう？」の確認ダイアログも閉じておく（念のため）
  closeGoalConfirm();

  /* 通常の行動1回ぶんの結果（結果の文章・今回の変化・行動前の控え・見つけたもの・
     ちょっとしたできごと・休憩／おやつの結果かどうか）を、まとめて最初に戻す

     初期値は composables/useActionResult.ts が持っている
     （はじめるときと同じ値になるので、ここに書き写す必要がない） */
  resetActionResult();

  // 前回のプレイで最後に入った場所を忘れる（新しいプレイの公園入口は、先頭から選ぶ）
  lastSelectedPlace.value = null;
  isCommandPointerPaused.value = false;

  /* ゴールしたときの成績（ランク・見出し・文章・総合スコア・内訳）と、
     うた入りBGMの「新しい曲が追加されました！」のお知らせ、
     GAME OVER画面に出す文章を、まとめて最初に戻す

     初期値は composables/useGameResult.ts が持っている
     （はじめるときと同じ値になるので、ここに数字を書き写す必要がない）

     ※ hasUnlockedSPlusSong（解放済みかどうか）と、localStorage の解放情報は戻さない
       一度解放した曲は、もう一度あそんでも、はじめの画面へ戻っても、ロックに戻さないため
       （あちらの resetGameResult() でも、そこだけは戻していない） */
  resetGameResult();

  // ※ 演出用に控えていたもの（見つけたもの・ちょっとしたできごと）と、行動前の控えは、
  //   上の resetActionResult() で空に戻している
  // ※ いやいやの文章と「✨ ナイス対応！」の表示は、上の resetTantrumState() で空に戻している
  // ※ GAME OVER画面に出す文章は、上の resetGameResult() で空に戻している

  // とつぜんのできごとの予定も空に戻す
  // ※ 戻しておかないと、前回のプレイの予定が
  //   次のゲームの1回目の行動のあとに出てきてしまう
  pendingSuddenEvent.value = null;

  // ※ 公園入口（currentEvent）に戻すのは、上の resetGameState() でまとめて行っている
  gameStarted.value = false;

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ゴール／GAME OVER画面から、A画面（起動画面）へ戻る

   同じ画面にある「もう一度あそぶ」は、B画面（タイトル画面）まで戻って
   すぐ次のおでかけを始められるようにするもの
   こちらは、もう一つ手前のA画面（起動画面）まで戻る
   （A画面には「♪ サウンドトラック」もあるので、曲を聴きにも行ける）

   やることは2つだけ
   ① resetGame()  … 決定音を鳴らして、ゲームの記録をぜんぶ最初の状態に戻す
   ② タイトルBGMを止めて、titleEntered を false にする（＝A画面へ）

   ※ ①の中でタイトルBGMを「少しあとで鳴らす」予約をしているので、
     cancelTitleBgmStart() でかならず取り消すこと
     A画面は「まだ音を鳴らしていない画面」なので、
     戻ったとたんに曲が鳴りだすと不自然になる
     （B画面からA画面へ戻る goBackToBoot() と、まったく同じ後始末）

   ※ リザルトBGM・GAME OVER BGMは、①の resetGame() の中で止めている
     「もう一度あそぶ」と同じ止めかたなので、ここでは同じ処理をくり返さない
*/
function goBackToBootFromResult() {
  /* ここでの変更は、ぜんぶ「まとめて1回」で行われる（await も nextTick も無い）

     resetGame() でゲームの記録が初期値に戻り、そのあと titleEntered も false になるが、
     Vueは同じ処理の中で変えたぶんをまとめて1回だけ描きなおす
     つまり「スコアが0になったリザルト画面」や「B画面」が
     途中でチラッと見えることはなく、リザルト画面 → A画面 と一度に切りかわる

     しかも <Transition> のおかげで、消えかけのリザルト画面は
     もう描きなおされないので、スコアも結果文も見えたままフェードアウトする */
  resetGame();

  cancelTitleBgmStart();
  stopTitleBgm();

  titleEntered.value = false;

  /* A画面のメインのボタン「はじめる」へのフォーカスは、
     フェードが終わってから handleScreenEnterEnd() が当てる（B→Aへ戻るときと同じ） */
}

/* Enter / Space を押したときに、いま選んでいるコマンドを実行する

   やっていることは「マウスでクリックしたときと同じ関数を呼ぶ」だけ
   今いる場所（currentEvent）と番号（selectedCommandIndex）の組み合わせで、
   どの関数を呼ぶかを決めている
*/
function runSelectedCommand() {
  /* ゴール・GAME OVER画面（ボタンは2つだけ）

     0 もう一度あそぶ        → タイトル画面へ
     1 ← はじめの画面へ戻る  → 起動画面へ

     ※ いちばん先に見るのが大事
       下の「結果表示中は…」にも当てはまってしまうことがあるため */
  if (currentEvent.value === 'goal' || currentEvent.value === 'gameOver') {
    if (selectedCommandIndex.value === 1) {
      goBackToBootFromResult();
      return;
    }

    resetGame();
    return;
  }

  // 結果表示中はコマンドが1つしか出ていないので、それを実行する
  // ただし「少し待ってみる」に失敗していやいやが続いているときは、
  // 画面に出ているのは いやいや のコマンドなので、ここでは進めない
  if (resultMessage.value && !isTantrumUnsolved.value) {
    // 「次の場所を選ぶ」（ひとやすみ の休憩・おやつの結果も同じ）
    goToNextPlace();
    return;
  }

  /* おやつバッグが開いているときは、いちばん先にそちらを見る

     バッグを開いているあいだ、プレイヤーが見て選んでいるのはバッグの中なので、
     下のメインコマンド（selectedCommandIndex）のほうは見ない
     （ひとやすみ のバッグも、いやいやタイムのバッグも、ここで受け取る）
  */
  if (isSnackMenuVisible.value) {
    // いちばん下の「← もどる」
    if (selectedSnackMenuIndex.value === snackMenuBackIndex.value) {
      closeSnackMenu();
      return;
    }

    // 選んでいる行のおやつを食べる（開いた場面に合った効果になる）
    const snack = selectedSnacks.value[selectedSnackMenuIndex.value];

    if (snack) {
      eatSnackFromBag(snack.id);
    }

    return;
  }

  // 毎回 .value と書かなくてよいように、番号を取り出しておく
  const index = selectedCommandIndex.value;

  /* 通常の場所6か所で共通の、いちばん下のコマンドをまとめて受け取る

     2 ← 場所選びにもどる   → 公園入口の「どこへ行く？」へ（この場所のコマンドを選んだ状態で）

     場所ごとの switch より前に書いておくと、
     下の6か所に同じ行を書き足さなくてよい
  */
  if (isNormalPlace.value && index === leavePlaceCommandIndex) {
    goToNextPlace();
    return;
  }

  switch (currentEvent.value) {
    /* 公園入口
       0 すべり台／1 砂場／2 どんぐりの木／3 池／4 芝生広場
       5 秘密の場所（見つけているときだけ画面に出る）
       そのつぎ ひとやすみ（→ ベンチ。休憩・おやつを選ぶ画面）
       最後 公園の出口へ向かう（ゴール）

       ※ 秘密の場所がまだ出ていないときは、その行が画面に無いので
         ひとやすみ とゴールが1つくり上がる（restCommandIndex／goalCommandIndex で見る）
       ※ ゴールは、すぐには向かわず確認ダイアログを開く（クリックしたときと同じ）
    */
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
        // はじめてのときは秘密の小道へ、見つけたあとは そのまま こもれびの広場へ
        goToSecretArea();
      } else if (index === restCommandIndex.value) {
        goToPlace('restArea');
      } else if (index === goalCommandIndex.value) {
        openGoalConfirm();
      }
      break;

    /* すべり台
       0 一緒にすべる／1 下で見守る
       （2 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'slide':
      if (index === 0) {
        runPlaceAction(placeActions.playSlide);
      } else if (index === 1) {
        runPlaceAction(placeActions.watchSlide);
      }
      break;

    /* 砂場
       0 一緒に大きな山を作る／1 砂のトンネルを作る
       （2 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'sandbox':
      if (index === 0) {
        runPlaceAction(placeActions.playSandbox);
      } else if (index === 1) {
        runPlaceAction(placeActions.buildSandTunnel);
      }
      break;

    /* どんぐりの木
       0 一緒にどんぐりを拾う／1 どんぐりをころがして遊ぶ
       （2 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'acornArea':
      if (index === 0) {
        runPlaceAction(placeActions.collectAcorns);
      } else if (index === 1) {
        runPlaceAction(placeActions.rollAcorns);
      }
      break;

    /* 池
       0 白鳥を近くで見る／1 コイに餌をあげる
       （2 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'pond':
      if (index === 0) {
        runPlaceAction(placeActions.watchSwansClose);
      } else if (index === 1) {
        runPlaceAction(placeActions.feedKoi);
      }
      break;

    /* 芝生広場
       0 追いかけっこする／1 シャボン玉で遊ぶ
       （2 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'grassArea':
      if (index === 0) {
        runPlaceAction(placeActions.playTagOnGrass);
      } else if (index === 1) {
        runPlaceAction(placeActions.playWithBubbles);
      }
      break;

    /* こもれびの広場
       0 落ち葉の上を歩く／1 こもれびをつかまえる
       （2 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'secretSpot':
      if (index === 0) {
        runPlaceAction(placeActions.walkOnLeaves);
      } else if (index === 1) {
        runPlaceAction(placeActions.catchSunlight);
      }
      break;

    /* ひとやすみ（ベンチ）
       おやつあり  0 休憩する／1 おやつにする／2 ← 場所選びにもどる
       おやつなし  0 休憩する／1 ← 場所選びにもどる（おやつの行は画面に無い）

       「おやつにする」はおやつバッグを開くだけ
       食べるのは、バッグの中でおやつを選んだとき（上の isSnackMenuVisible の分岐）
       ※ おやつの分岐は snackLeft も見ているので、食べきったあとに 1 を押しても、まちがってバッグを開くことはない */
    case 'restArea':
      if (index === restBreakCommandIndex) {
        takeCommonBreak();
      } else if (index === restSnackCommandIndex && snackLeft.value > 0) {
        openSnackMenu('exploring');
      } else if (index === restLeaveCommandIndex.value) {
        goToNextPlace();
      }
      break;

    /* 秘密の小道
       はじまる前   0 小道へ進む／1 ← 場所選びにもどる（公園入口の「どこへ行く？」へ）
       終わったあと 0 先へ進む
       ※ 遊んでいる最中は、キー操作を handleSecretPathKeydown() が受け取るので、ここへは来ない */
    case 'secretPath':
      if (index === 0 && secretPathPhase.value === 'ready') {
        startSecretPathGame();
      } else if (index === 1 && secretPathPhase.value === 'ready') {
        leaveSecretPathToEntrance();
      } else if (index === 0 && secretPathPhase.value === 'finished') {
        enterSecretSpotFromPath();
      }
      break;

    /* いやいやタイム
       おやつが残っているとき   0 お話する／1 だっこ／2 おやつをあげる／3 少し待ってみる
       おやつが0個のとき       0 お話する／1 だっこ／2 少し待ってみる（おやつの行は画面に無い）

       「おやつをあげる」はおやつバッグを開くだけ
       食べるのは、バッグの中でおやつを選んだとき（上の isSnackMenuVisible の分岐）

       ※ バッグが空のときにバッグを開いてしまわないように、
         必ず snackLeft（バッグの残り）を見てから決める
       ※ 番号は talkCommandIndex などを見る（0〜3 を直接書かない）
         待つ の番号だけはおやつの有無で変わるので、waitCommandIndex は computed
         おやつが0個のときは 2 が「少し待ってみる」になるが、
         おやつの分岐は snackLeft も見ているので、まちがってバッグを開くことはない
    */
    case 'tantrum':
      if (index === talkCommandIndex) {
        talkToChild();
      } else if (index === hugCommandIndex) {
        hugChild();
      } else if (index === snackCommandIndex && snackLeft.value > 0) {
        openSnackMenu('tantrum');
      } else if (index === waitCommandIndex.value) {
        // 「少し待ってみる」は、おやつがあれば4番目（3）、なければ3番目（2）
        waitCalmly();
      }
      break;

    /* ここから下はとつぜんのできごと */

    /* 救急車のサイレン
       0 救急車を探してみる／1 いっしょにサイレンを聞く／2 遊びに戻る */
    case 'emergencySiren':
      if (index === 0) {
        lookForAmbulance();
      } else if (index === 1) {
        listenToSiren();
      } else if (index === 2) {
        walkOnFromSiren();
      }
      break;

    /* テントウムシ
       0 いっしょにじっくり見る／1 そっと手を近づけてみる／2 ばいばいして見送る */
    case 'ladybug':
      if (index === 0) {
        watchLadybug();
      } else if (index === 1) {
        holdLadybug();
      } else if (index === 2) {
        seeOffLadybug();
      }
      break;

    /* 犬が近づいてきた
       0 近くで見せてもらう／1 だっこで少し離れて見る／2 道をあけて見送る */
    case 'dog':
      if (index === 0) {
        watchDogClose();
      } else if (index === 1) {
        watchDogBehindParent();
      } else if (index === 2) {
        keepDistanceFromDog();
      }
      break;

    /* こうちゃんがころんだ（おやつは使わないので、いつも3つ）
       0 すぐにだっこする／1 「いたいのいたいのとんでいけ〜」／2 「大丈夫？」と声をかけて待つ */
    case 'fallDown':
      if (index === 0) {
        hugAfterFall();
      } else if (index === 1) {
        blowPainAway();
      } else if (index === 2) {
        watchAfterFall();
      }
      break;

    /* 噴水が出た
       0 水しぶきの近くまで行く／1 少し離れてながめる／2 遊びに戻る */
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

/* キーボード操作（↑↓←→・Enter・Space・Escape など）

   中身は composables/useKeyboardControls.ts にある
   いま使っている ref・computed・関数をそのまま渡して、番号やフォーカスを動かしてもらう

   ※ Enter / Space で「どの遊びの関数を呼ぶか」を決める runSelectedCommand() は、
     ゲームの中身なので、このファイルに残してある
*/
const { gameScreenRef, moveSnackSelectionToHovered, focusTitleMainButton } = useKeyboardControls({
  titleEntered,
  gameStarted,
  isSnackSelectionOpen,
  isHowToPlayOpen,
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
  howToBackButtonRef,
  snackSelectionRef,
  soundToggleButtonRef,
  soundVolumeSliderRef,
  runSelectedCommand,
  enterTitle,
  openSnackSelection,
  closeSnackSelection,
  closeHowToPlay,
  closeSnackMenu,
  cancelGoalConfirm,
  confirmGoToGoal,
  focusFirstSnackOption,
  pauseCommandPointer,
  handleSecretPathKeydown,
});

/* 画面が表示されたら、画面幅・マウスの受付をはじめる
   公園入口の「列の数」は画面幅で変わるので、最初に1回調べて、
   そのあとは幅が変わるたびに調べ直す

   ※ ↑↓←→ などのキーボード操作の受付は、useKeyboardControls() の中で登録している
   ※ 秘密の小道の keyup / blur / visibilitychange は、useSecretPathGame() の中で登録している
   ※ S+ランク限定のうた入りBGMを前に解放しているかの読みこみは、useGameResult() の中で行っている
*/
/* ホーム画面から起動しているか（standalone 表示か）を調べて、isStandalone に入れる

   ・display-mode: standalone … manifest の display: 'standalone' で起動していると当てはまる
     （Android の Chrome・新しい iPhone の Safari）
   ・navigator.standalone      … 古い iPhone の Safari だけにある目印（ホーム画面から起動すると true）
     ほかのブラウザには無い（undefined）ので、「=== true」のときだけ standalone とみなす

   ※ window / navigator はブラウザにしか無いので、必ず onMounted から呼ぶこと */
function checkStandalone() {
  const isIosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  isStandalone.value = window.matchMedia('(display-mode: standalone)').matches || isIosStandalone;
}

onMounted(() => {
  checkStandalone();

  // 公園入口へ戻ってきた直後などに止めたコマンド枠へのマウス操作を、マウスを動かしたら戻す（→ isCommandPointerPaused）
  window.addEventListener('pointermove', handleWindowPointer);
  window.addEventListener('pointerdown', handleWindowPointer);

  /* A画面のメインのボタン「はじめる」へフォーカスを当てておく
     ページを開いたときのほか、/soundtrack から戻ってきたときもここを通る
     （このページは、もう一度まっさらに作り直されるため） */
  focusTitleMainButton();

  /* 前回のサウンドの設定（ON/OFFと音量）を思い出す
     中身は composables/useAudio.ts の restoreSoundSettings()
     （localStorage はブラウザにしか無いので、ここ＝onMounted から呼ぶ）

     ※ ここではBGMを鳴らしたり止めたりしない
       ページを開いた直後は、まだどのBGMも鳴っていないため */
  restoreSoundSettings();

  /* ※ ここではBGMを鳴らさない

     ページを開いた直後は、ブラウザの決まりで音を鳴らせない
     タイトルBGMは、起動画面の「▶ はじめる」を押したとき
     （＝ユーザーが操作したとき）に enterTitle() で鳴らしはじめる
  */
});

/* 画面から離れるときは、受付をやめる（後始末） */
onUnmounted(() => {
  window.removeEventListener('pointermove', handleWindowPointer);
  window.removeEventListener('pointerdown', handleWindowPointer);

  /* 別のページへ移ったあともBGMが鳴り続けたり、
     「あとで鳴らす」の予約が動きつづけたりしないように、音をぜんぶ片づける
     中身は composables/useAudio.ts の cleanupAudio() */
  cleanupAudio();

  // いやいや発生の演出の「あとで消す」予約も取り消しておく
  hideTantrumAlert();

  /* ※ 秘密の小道（ミニゲーム）の requestAnimationFrame・はやく進む／押している状態・
     長押しを待つ予約の片づけは、useSecretPathGame() の中の onUnmounted で行っている */
});
</script>

<template>
  <main class="game">
    <!-- ============================================================
         画面の切りかえ（A画面 ⇄ B画面 ⇄ あそびかた／おやつ選択 ⇄ ゲーム画面）

         これらの画面はページを移動しているのではなく、
         同じページの中で v-if / v-else-if を切りかえて出し分けている
         そのままだと切りかわった瞬間にパッと入れかわって見えるので、
         Vueの <Transition> で短いフェードをはさんでいる

         mode="out-in" ＝ 前の画面が消えきってから、次の画面を出す
         2枚が同時に出ないので、
         ・カードの位置がずれない
         ・画面が一瞬2つぶんの高さにならない

         うれしいのは、消えていく画面の中身がそのまま残ること
         「もう一度あそぶ」を押すと、中の記録（スコアなど）は
         その場でぜんぶ初期値に戻るが、消えかけの画面はもう作りなおされないので、
         スコアや結果文は見えたままフェードアウトしていく
         （＝「数字が先に0になってから消える」ようには見えない）

         hooks（@before-leave など）でやっていること
         ・フェード中は、キーの操作を受けつけない（→ isScreenChanging）
         ・次の画面が出おわったら、その画面のメインのボタンへフォーカスを当てる
         ============================================================ -->
    <Transition name="screen-fade" mode="out-in" @before-leave="handleScreenLeaveStart" @after-leave="handleScreenLeaveEnd" @after-enter="handleScreenEnterEnd">
      <!-- ============================================================
           あそびかた画面（B画面から開く説明書）

           B画面の「？ あそびかた」で開き、「← 戻る」・Escape でB画面へ戻る
           開いているあいだは、A画面・B画面・おやつ選択画面より優先して出す
           （そのため、この Transition の中でいちばん先に書いてある。
             キー操作の handleKeydown()・フォーカスの handleScreenEnterEnd() も同じ順番で見ている）

           ■ ルールと考えかたは教える。ただし正解までは教えない

             次のようなものは、わざと書いていない
             ・秘密の場所の名前と、行けるようになる条件
             ・おやつと いやいやの理由 の相性
             ・「少し待ってみる」の成功率、いやいやレベルごとの数字
             ・同じ対応をくり返したときの効きにくさの数字
             ・ナイス対応になる組み合わせ、各行動のステータス増減
             あとから説明を書き足すときも、ここは守ること

           ■ 文字は少なめにする
             箇条書きは1項目1行、ステータスや対応の説明は「〜する」「〜できるか」の短い言いかたにする
             （前は5つのセクションで約990字あったが、くり返しを省いて4つ・約460字にした）

           ■ 縦に長いので、.title-screen の縦スクロールでそのまま読む
             （スマホ幅では、ページ全体のスクロールになる）
             ↑↓キーもふつうのスクロールとして使えるよう、キー操作では横取りしない
           ============================================================ -->
      <div v-if="!gameStarted && isHowToPlayOpen" key="how-to-play" class="title-screen">
        <div class="title-card title-card--howto">
          <!-- 上のツールバー（A画面・B画面・おやつ選択画面と同じ .title-card__tools を使う）
               左：タイトル画面（B画面）へ戻る
               右：サウンドON/OFF（ほかの画面と同じ soundEnabled / toggleSound() をそのまま使う）

               ※ この画面は、見た目の順番とHTMLの順番が同じ
                 Tabは「← 戻る → サウンド → いちばん下の ← 戻る」と上から順に進む -->
          <div class="title-card__tools">
            <!-- 見た目は、PCでもスマホでも「← 戻る」だけ（文字を少なくするため。B画面・おやつ選択画面と同じ）
                 読み上げ用の名前は aria-label の「ひとつ前の画面へ戻る」 -->
            <button ref="howToBackButtonRef" type="button" class="title-card__back" aria-label="ひとつ前の画面へ戻る" @click="closeHowToPlay">
              <span aria-hidden="true">← 戻る</span>
            </button>

            <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

                 文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
                 何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

                 ・ミュートボタン … 音を出すか、出さないか
                 ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
                 0% ＝ ミュートなので、2つはいつも同じ状態になる
                 （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る） -->
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

          <!-- 1. このゲームについて（公園の探検と、操作のしかたも、ここにまとめて書く）

               秘密の場所の名前や、行けるようになる条件は書かない
               「特別な場所もあるみたい」までにとどめる -->
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

            <!-- 操作は「パソコンでもスマホでも遊べる」と分かる最低限だけ書く
                 キーの一覧（Space・← → など）や、場面ごとのくわしい操作は書かない
                 （秘密の小道の操作は、ミニゲームの画面にそのつど案内が出る） -->
            <p class="howto-note">
              <b class="howto-note__title">操作</b>
              クリック・矢印キー＋Enter・タップで遊べます。
            </p>
          </section>

          <!-- 2. ステータス

               名前は、ゲーム画面の上部ステータスに出ている言葉にそろえる
               （「親の余裕」など。parentCalm のような中の名前は出さない）
               丸い印の色は、ゲーム画面のそれぞれのゲージと同じ色 -->
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

            <!-- GAME OVER は「こうなると終わることがある」という雰囲気だけ伝える
                 （「○○が0なら」のような判定の一覧にはしない） -->
            <p class="howto-note howto-note--caution">
              <b class="howto-note__title">GAME OVER</b>
              疲れすぎたり、余裕がなくなったりすると、途中で終わることも。
            </p>
          </section>

          <!-- 3. おやつ

               「どのおやつが、どのいやいやに効くか」は書かない
               おやつの種類と数は、おやつ選択画面と同じ snacks / maxSnackCount を見ている
               （おやつが増えたり、持っていける数が変わったりしても、ここは直さなくてよい） -->
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

          <!-- 4. いやいやタイム

               4つの対応の「しくみ」だけを書く
               理由ごとの正解・おやつの相性・待つの成功率・レベルごとの数字・
               くり返したときの効きにくさの数字・ナイス対応の組み合わせは、どれも書かない
               （対応の名前も、並べる順番も、ゲーム画面のコマンドとそろえてある
                 ＝ お話する → だっこ → おやつ → 待つ。
                 コマンドの順番を変えたときは、ここの並びも合わせて直すこと） -->
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

          <!-- いちばん下まで読んだ人が、上までスクロールしなくても戻れるようにする
               （押したときの処理も見た目も、上の「← 戻る」と同じ closeHowToPlay()） -->
          <div class="howto-footer">
            <button type="button" class="title-card__back" aria-label="ひとつ前の画面へ戻る" @click="closeHowToPlay">
              <span aria-hidden="true">← 戻る</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ============================================================
           起動画面（いちばん最初の1枚）

           この画面をはさむ理由は、ブラウザの決まりへの対応
           ページを開いた直後は音を鳴らせないので、
           「▶ はじめる」を1回押してもらい、
           その操作をきっかけにタイトルBGMを鳴らしはじめる
           ============================================================ -->
      <div v-else-if="!titleEntered" key="boot" class="title-screen">
        <div class="title-card title-card--boot">
          <!-- ▶ は .cmd--single のCSSがいつも出してくれるので、文字には入れない
               （「きょうのおやつを選ぶ」「もう一度あそぶ」と同じ書き方）

               ※ この画面のメインのボタンなので、HTMLではいちばん先に書いてある
                 Tabキーを押したときに「はじめる → サウンドトラック →（ミニゲーム →）サウンド」の
                 順で回れるようにするため（見た目の位置はCSSの order でいちばん下のまま）
               ref … キーボード操作でフォーカスを当てるための目印 -->
          <button ref="startButtonRef" class="cmd cmd--start cmd--single" @click="enterTitle">はじめる</button>

          <!-- 上のツールバー（B画面と同じ .title-card__tools を使う）
               左：サウンドトラック（/soundtrack）と、ミニゲームの一覧（/minigame）への入口
               右：サウンドON/OFF（「はじめる」を押すとタイトルBGMが鳴りだすので、その前に消せるようにしておく） -->
          <div class="title-card__tools">
            <!-- 左上のまとまり（サウンドトラック ＋ ミニゲーム）

                 どちらも押しても enterTitle() は呼ばず、タイトルBGMも鳴らさずに、それぞれのページへ移る
                 右のサウンドON/OFFと同じ高さのpillにそろえている
                 （見た目のCSSは .title-card__tools のところにまとめてある）

                 ※ Enter/Space を押したときに「はじめる」まで動いてしまわないのは、
                   handleTitleKeydown() が「ボタンにフォーカスがあるときは何もしない」
                   ようにしているため（ボタン側で止める必要はない） -->
            <div class="title-card__toolsLeft">
              <!-- サウンドトラックへの入口

                   入りきる幅に合わせて、3段階で出しわける（文字があるほうが、何のボタンかがすぐ分かる）
                   ・390px以上      … 「♪ サウンドトラック」
                   ・341〜389px     … 「♪ サントラ」（細いスマホ。短くして1行に収める）
                   ・340px以下      … 「♪」のアイコンだけ（とても細い画面）
                                       何のボタンかは、hover / focus のときだけ出る吹き出しで伝える
                                       （右のサウンドのコントロールと同じやりかた）
                   出しわけは CSS（.title-card__soundtrackText--full / --short ／ .title-card__tooltip）
                   読み上げは、どの幅でも aria-label の「サウンドトラック」だけにする
                   （文字のほうは aria-hidden なので、「サントラ」と読まれることはない）

                   ※ スマホ幅でも文字を出せるのは、右のサウンドから音量スライダーを外して
                     横幅が空いたため（→ 右の SoundControl の :show-volume="false"） -->
              <button ref="soundtrackButtonRef" type="button" class="title-card__soundtrack" aria-label="サウンドトラック" @click="goToSoundtrack">
                <span aria-hidden="true">♪</span>
                <span class="title-card__soundtrackText--full" aria-hidden="true">サウンドトラック</span>
                <span class="title-card__soundtrackText--short" aria-hidden="true">サントラ</span>
                <span class="title-card__tooltip" aria-hidden="true">サウンドトラック</span>
              </button>

              <!-- ミニゲームの一覧への入口（押すとミニゲームの一覧へ）
                   まだ1つも解放していなくても、いつも出す
                   一覧では、まだ解放していないミニゲームを「？？？」とヒントだけで出すので、中身は先に分からない -->
              <button ref="minigameButtonRef" type="button" class="title-card__minigame" @click="goToMinigame">🌿 ミニゲーム</button>
            </div>

            <!-- サウンドのコントロール（この画面ではミュートボタンだけ）

                 文字（「サウンド」「ON」「OFF」）は出さず、アイコンだけの小さなボタンにしてある
                 何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える
                 （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る）

                 ■ ここだけ音量スライダーを出さない（:show-volume="false"）
                   A画面は、まだBGMが鳴っていない画面
                   （鳴るのは ♪・🌿 を押したときの決定音だけで、押すとすぐ次の画面へ移る）
                   スライダーを動かしても、その場では何も聞こえない＝手ごたえがないので出さない
                   「はじめる」を押すとタイトルBGMが鳴りだすので、
                   その前に音を消しておく役目は、ミュートボタンだけで足りる
                   （大きさの調整は、音が鳴っているB画面以降でできる）

                 ■ 空いた横幅は、左のサウンドトラックの入口が使う
                   スマホ幅でも「♪」だけの丸にせず、文字を出せるようになった
                   （→ assets/css/game/base.css の @media (max-width: 389px) の説明） -->
            <SoundControl
              ref="soundControlRef"
              :sound-enabled="soundEnabled"
              :sound-volume-percent="soundVolumePercent"
              :show-volume="false"
              @toggle="toggleSound"
              @volume-change="changeSoundVolume" />
          </div>

          <!-- キービジュアル（こうちゃんと公園）。タイトルの上に出す（大きさ・並び順は base.css の .title-card__visual） -->
          <NoImage class="title-card__visual" ratio="16 / 9" label="キービジュアル" />

          <h1 class="title-card__name">{{ gameTitle }}</h1>

          <!-- 「ホーム画面に追加」の案内（ふつうの Safari / Chrome で開いているときだけ）

               ・ホーム画面から起動しているとき（isStandalone が true）は出さない
               ・調べおわる前（null）も出さない（→ isStandalone）
               ・パソコンでは、CSS でかくしている（指でさわる画面のときだけ出す → base.css の .install-hint）

               文字を少なくするため、1文だけにしている
               （前は iPhone・Android それぞれの手順も書いていたが、
                 どちらも「ホーム画面に追加」という名前のメニューを選ぶので、その名前だけ伝える）

               見た目の位置は、カードのいちばん下（「はじめる」の下）
               A画面のカードは中身が少なく、下に余白があるので、
               案内を足してもカードの高さは変わらない（B画面と高さがそろったまま） -->
          <p v-if="isStandalone === false" class="install-hint">📱 「ホーム画面に追加」で、アプリみたいに遊べるよ</p>
        </div>
      </div>

      <!-- ============================================================
           タイトル画面（ゲーム開始前）

           おやつ選択画面を開いているあいだは、こちらは出さない
           （そのため !gameStarted だけでなく
             !isSnackSelectionOpen も条件に入れている）
           ============================================================ -->
      <div v-else-if="!gameStarted && !isSnackSelectionOpen" key="title" class="title-screen">
        <div class="title-card">
          <!-- この画面のメインのボタン
               A画面と同じ理由で、HTMLではいちばん先に書いてある
               （Tabで「きょうのおやつを選ぶ → はじめの画面へ戻る → あそびかた → サウンド」と回れるようにするため。
                 見た目の位置はCSSの order でいちばん下のまま）

               ※ このボタンでは、まだゲームは始まらない
                 先に「きょうのおやつ」を選ぶ画面へ進む（openSnackSelection）
                 公園へ出発する startGame() は、その画面の
                 「このおやつで公園へ行く！」から呼ばれる -->
          <button ref="selectSnacksButtonRef" class="cmd cmd--start cmd--single" @click="openSnackSelection">きょうのおやつを選ぶ</button>

          <!-- 上のツールバー（A画面と同じ .title-card__tools を使う）
               左：はじめの画面（起動画面）へ戻る
               右：？ あそびかた ＋ サウンドON/OFF（「きょうのおやつを選ぶ」を押すと決定音が鳴るので、その前に消せるようにしておく） -->
          <div class="title-card__tools">
            <!-- はじめの画面へ戻る（左上の補助操作）
                 A画面の左上（♪・🌿 ミニゲーム）と同じ場所・同じ高さで出るので、
                 A→B で切り替えても、左上のボタンが入れかわるだけに見える

                 ※ Enter/Space で「きょうのおやつを選ぶ」まで動いてしまわないのは、
                   handleTitleKeydown() が「ボタンにフォーカスがあるときは何もしない」
                   ようにしているため（ボタン側で止める必要はない）

                 見た目は、PCでもスマホでも「← 戻る」だけ（文字を少なくするため）
                 短いので、スマホ幅でも右上の「?」とサウンドのコントロールと横1行に収まる
                 読み上げ用の名前は aria-label の「はじめの画面へ戻る」 -->
            <button ref="backToBootButtonRef" type="button" class="title-card__back" aria-label="はじめの画面へ戻る" @click="goBackToBoot">
              <span aria-hidden="true">← 戻る</span>
            </button>

            <!-- 右上のまとまり（？ あそびかた ＋ サウンドON/OFF）
                 2つを1つの入れものに入れて、いつも右はしに並んで出るようにしている
                 （とても細い画面で下の行へ回りこむときも、2ついっしょに右へ寄る） -->
            <div class="title-card__toolsRight">
              <!-- ？ あそびかた
                   押しても、B画面の上に説明書を開くだけ（openHowToPlay）。タイトルBGMも、選んだおやつもそのまま

                   スマホ幅では「あそびかた」の文字を隠して「?」だけにするので、
                   読み上げ用の名前は aria-label に持たせている
                   （サウンドON/OFFの「サウンド」の文字を隠すのと同じ考えかた） -->
              <button ref="howToPlayButtonRef" type="button" class="title-card__howto" aria-label="あそびかた" @click="openHowToPlay">
                <span class="title-card__howtoIcon" aria-hidden="true">?</span>
                <span class="title-card__howtoText">あそびかた</span>
              </button>

              <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

                   文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
                   何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

                   ・ミュートボタン … 音を出すか、出さないか
                   ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
                   0% ＝ ミュートなので、2つはいつも同じ状態になる
                   （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る） -->
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
        </div>
      </div>

      <!-- ============================================================
           おやつ選択画面（B画面とゲーム画面のあいだの準備画面）

           公園へ持っていくおやつを、6種類から2種類選んでもらう
           まだゲーム開始前なので、タイトルBGMは鳴ったまま
           （公園へ出発するのは「このおやつで公園へ行く！」を押したとき）

           ■ HTMLに書いた順番と、画面に見える順番がちがう

             HTMLの順番 … おやつ6つ → バッグ → 出発 → 上のツールバー
             見える順番 … 上のツールバー → 見出し → 説明 → おやつ6つ
                           → バッグ → 出発

             Tabキーは「HTMLに書いた順番」で動くので、
             最初のおやつから Tab を押すと
             「おやつ → 出発 → 戻る・サウンド」と自然に進む
             見た目の位置は、A画面・B画面と同じように
             CSSの order で並べ直している（.title-card--snack のところ）

           ■ おやつ6種類はベタ書きしない

             v-for で snacks 配列をそのまま並べている
             おやつを増やしたいときは snacks へ1件足すだけで、
             このHTMLはさわらなくてよい
           ============================================================ -->
      <div v-else-if="!gameStarted" key="snack-selection" class="title-screen">
        <!-- ref="snackSelectionRef" … キーボード操作のための目印

             この中にある押せるボタンを、画面のどこにあるかも見ながら探して、
             矢印キーで見た目どおりに行き来させる
             （getSnackSelectionFocusItems() と moveSnackSelectionByArrow() を見ること）

             おやつのカードだけでなくカード全体に付けているのは、
             矢印キーの行き先に「このおやつで公園へ行く！」
             「← ひとつ前の画面へ戻る」「サウンドON/OFF」も入るため -->
        <div ref="snackSelectionRef" class="title-card title-card--snack">
          <!-- おやつのカード6つ -->
          <div class="snack-list">
            <!-- カードまるごとが1つのボタン

                 中に小さな「選ぶ」ボタンを置くより、
                 カードのどこを押しても選べるほうが、
                 マウスでも指でもねらいやすい

                 :disabled … バッグがいっぱいで、まだ選んでいないおやつ
                 選んであるおやつは押せるままにして、
                 もう一度押せば解除できるようにしておく

                 :aria-pressed … 読み上げソフトに「押されている（選択中）」
                 かどうかを伝える（見た目で色が変わるのと同じ意味）

                 @mouseenter … マウスを乗せたカードへ、キーボードの居場所も移す
                 こうしておくと「マウスでチョコまで来て、そこから↓キー」と
                 続けたときに、その下のビスケットへ進む
                 （乗せただけでは選ばない。選ぶのは click と Enter / Space だけ）

                 @click の $event … キーボードで選んだかどうかを見分けるために渡す
                 （キーボードで2個目を選んだら「このおやつで公園へ行く！」へカーソルが移る） -->
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
              <!-- 絵文字と名前は、1行にならべる（「🍇 グミ」の形）

                   たてに積むより1行ぶん背が低くなるので、
                   おやつ6枚をならべてもカードが画面からはみ出しにくい
                   2列にして1枚が横に広くなったぶん、
                   横にならべても のびのび置ける
                   （おやつバッグの「🍇 グミ」とも同じ見た目になる） -->
              <span class="snack-option__head">
                <span class="snack-option__icon">{{ snack.icon }}</span>
                <span class="snack-option__name">{{ snack.name }}</span>
              </span>

              <!-- おやつごとの回復量（次の実装でそのままゲームに使う数）

                   数字はこれからバランスを調整するので、
                   ここが変わってもカードの形がくずれないようにしている

                   食べるのにかかる時間（5分・10分）は、カードには出さない
                   スマホで1画面に収めるため。食べたときにゲーム中の時計の「+10分」で分かる
                   （時間の数そのものは data/snacks.ts の minutes に残っていて、ゲームではそのまま使う）

                   2つを1つずつ span で包んであるのは、折り返しの都合
                   ひとつづきの文章にしてしまうと、カードの幅が足りないときに
                   「体力 +1」「8」のように数字の途中で切れてしまう
                   包んでおけば、切れるのはかならず項目のあいだになる
                   （区切りの「／」は、CSSで項目のうしろに付けている） -->
              <span class="snack-option__effect">
                <span class="snack-option__stat">体力 +{{ snack.energy }}</span>
                <span class="snack-option__stat">機嫌 +{{ snack.mood }}</span>
              </span>

              <!-- ※ 「✓ 選択中」の札は置いていない

                   選んでいることは、カードの色と枠の変化だけで伝える
                   （.snack-option--selected … ふちが紺の二重線になり、背景が水色になる）

                   札を出すと、その置き場所のぶんだけカードが縦に大きくなる
                   下の「🎒 おやつバッグ」に、選んだおやつの名前が出るので、
                   何を選んでいるかはそちらでも確かめられる

                   読み上げソフトには、上の :aria-pressed が
                   「押されている（＝選択中）」と伝えている -->
            </button>
          </div>

          <!-- おやつバッグ（いま選んでいる2個が分かるところ） -->
          <div class="snack-bag">
            <p class="snack-bag__head">
              <!-- 「おやつバッグ」の文字は、スマホでは見た目から消して 🎒 だけにする（読み上げ用には残す）
                   スマホではバッグを1行にまとめて、選んだおやつの札を横にならべる場所を作るため（→ base.css） -->
              <span class="snack-bag__title">🎒 <span class="snack-bag__titleText">おやつバッグ</span></span>

              <!-- 「1 / 2」の数え方も maxSnackCount を見ている
                   （持っていける数を3つに変えても、ここは直さなくてよい） -->
              <span class="snack-bag__count">{{ selectedSnackIds.length }} / {{ maxSnackCount }}</span>
            </p>

            <!-- 選んだおやつの名前をならべる
                 名札（selectedSnackIds）ではなく、絵文字と名前を持っている
                 selectedSnacks のほうを使う -->
            <ul v-if="selectedSnacks.length > 0" class="snack-bag__list">
              <li v-for="snack in selectedSnacks" :key="snack.id" class="snack-bag__item">{{ snack.icon }} {{ snack.name }}</li>
            </ul>

            <p v-else class="snack-bag__empty">まだ選んでいません</p>
          </div>

          <!-- 公園へ出発するボタン（2種類そろうまでは押せない）

               :disabled … canStartWithSnacks が false のあいだ
               （0 / 2 と 1 / 2 では押せず、2 / 2 になって押せるようになる） -->
          <button type="button" class="cmd cmd--start cmd--single snack-go" :disabled="!canStartWithSnacks" @click="confirmSnacksAndStartGame">このおやつで公園へ行く！</button>

          <!-- 上のツールバー（A画面・B画面と同じ .title-card__tools を使う）
               左：タイトル画面（B画面）へ戻る
               右：サウンドON/OFF（まだゲーム開始前なので、A・B画面と同じはたらき）

               ※ HTMLでいちばん後ろに書いてあるのは、Tabの順番をそろえるため
                 見た目の位置は、CSSの order でカードのいちばん上に出る -->
          <div class="title-card__tools">
            <!-- B画面の「はじめの画面へ戻る」と、同じ場所・同じ大きさで出る
                 押しても選んだおやつは消さない（B画面 → もう一度おやつ選択で、
                 さっき選んだおやつがそのまま入っている）

                 見た目は、PCでもスマホでも「← 戻る」だけ（B画面の戻るボタンと同じ）
                 読み上げ用の名前は aria-label の「ひとつ前の画面へ戻る」 -->
            <button type="button" class="title-card__back" aria-label="ひとつ前の画面へ戻る" @click="closeSnackSelection">
              <span aria-hidden="true">← 戻る</span>
            </button>

            <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

                 文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
                 何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

                 ・ミュートボタン … 音を出すか、出さないか
                 ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
                 0% ＝ ミュートなので、2つはいつも同じ状態になる
                 （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る） -->
            <SoundControl
              ref="soundControlRef"
              :sound-enabled="soundEnabled"
              :sound-volume-percent="soundVolumePercent"
              @toggle="toggleSound"
              @volume-change="changeSoundVolume" />
          </div>

          <h1 class="snack-heading">🍪 きょうのおやつ</h1>

          <!-- 2文目（もう一度押すと外せます。）は、スマホでは出さない
               スマホでおやつ選択を1画面に収めるため（→ base.css の .snack-lead__sub）
               選んだカードをもう一度押すと外れることは、押してみればすぐ分かる -->
          <p class="snack-lead">
            おやつを{{ maxSnackCount }}つ選ぼう！
            <span class="snack-lead__sub">
              <br />
              もう一度押すと外せます。
            </span>
          </p>
        </div>
      </div>

      <!-- ============================================================
           ゲーム画面（上部ステータス／中央イベント／下部コマンド）
           ============================================================ -->
      <!-- game-screen--secret-path … 秘密の小道で「遊んでいる最中」だけ付ける
           スマホ幅で、上部ステータスを いちばん上の行（時計 ＋ サウンド）だけにたたみ（→ assets/css/game/status.css）、
           入りきらないぶんはフィールドを縮めて、ほかの場面と同じく1画面に収めるため（→ assets/css/game/responsive.css）
           （はじまる前／小道をぬけたあとは付けない。上部ステータスは全部出る）
           ※ 結果が出ているあいだの目印（scene--has-result）は、ここではなく場面（.scene）ごとに付けている（→ sceneClass）
             ここに付けると、「次の場所を選ぶ」で消えていく途中の場面に、結果を出す前の見た目が一瞬戻ってしまうため -->
      <div
        v-else
        key="game"
        ref="gameScreenRef"
        class="game-screen"
        :class="{ 'game-screen--secret-path': currentEvent === 'secretPath' && secretPathPhase === 'playing' }">
        <!-- ==========================================================
             【上部】常時表示のステータスエリア
             ========================================================== -->
        <!-- 中身は components/game/StatusBar.vue（受け取った値を表示するだけ）
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
            <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

                 文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
                 何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

                 ・ミュートボタン … 音を出すか、出さないか
                 ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
                 0% ＝ ミュートなので、2つはいつも同じ状態になる
                 （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る） -->
            <SoundControl
              variant="status"
              :sound-enabled="soundEnabled"
              :sound-volume-percent="soundVolumePercent"
              @toggle="toggleSound"
              @volume-change="changeSoundVolume" />
          </template>
        </StatusBar>

        <!-- ==========================================================
             【中央】イベント表示 ＋ 【下部】コマンド欄
             場面ごとに .stage（中央）と .command（下部）を並べる
             ========================================================== -->

        <!-- 場面の切り替え
             前の場面がすっと消えてから、次の場面がふわっと出るようにする
             mode="out-in" ＝ 前が消えきってから次を出す（重ならないので位置がずれない） -->
        <Transition name="scene" mode="out-in">
          <!-- 公園入口 -->
          <div v-if="currentEvent === 'parkEntrance'" class="scene" :class="sceneClass" key="parkEntrance">
            <!-- stage--entrance … スマホ幅で、公園入口を1画面に収めるための目印
                                   （中央エリアの高さの下限を外す → assets/css/game/responsive.css） -->
            <section class="stage stage--entrance">
              <!-- place-card--entrance … 公園入口のカードだけ、中央エリアの残りの高さいっぱいに広げる目印
                                           （中の地図が、そのぶん大きくなる → assets/css/game/park-map.css） -->
              <article class="place-card place-card--entrance">
                <!-- あいさつ文は3段階（着いたばかり／前半のおかえり／午前後半）
                     どの文にするかは、上の parkEntranceText で決めている
                     公園入口では、見出し（公園入口）は出さず、この文をカードのいちばん上に出す
                     （地図を大きく見せるため。どこにいるかは、地図そのものでわかる） -->
                <p class="place-card__text">{{ parkEntranceText }}</p>

                <!-- 公園の地図

                     前は「場所の絵（NO IMAGE）」と、下のコマンド欄の「どこへ行く？」の一覧が別々だったが、
                     公園入口だけは、絵の枠をそのまま地図の土台にして、その上に行き先のボタンを置く
                     地図の絵は、PC用 public/images/park/park-map.webp（横長）と、スマホ用 park-map-sp.webp（3:4）の2枚
                     （文字は入れず、場所の名前はボタンで重ねる）
                     ・どちらの絵でも、ボタン・押したときの処理・矢印キーの動きは同じ。ちがうのは、絵とボタンの置き場所だけ
                     ・絵を差しかえて縦横比が変わったときは、park-map.css の --park-map-ratio（PC用・スマホ用）をそろえる

                     ・ボタンそのもの（押したときの処理・番号・バッジ）は、下の一覧にあったころと同じ
                     ・ボタンを park-map__spot の箱で包み、その箱を地図の上に position: absolute で置く
                       置き場所は、箱のクラス（park-map__spot--slide など）ごとに
                       assets/css/game/park-map.css で決めている（位置を変えるときは、そこだけ触ればよい）
                     ・箱の並び順は、今までどおり番号順（すべり台 0 〜 きゅうけい 〜 おうちへ帰る（ゴール））にしてある
                       Tab キーで動く順番が、番号の順番とずれないようにするため
                     ・↑ ↓ ← → を押したときは、地図の上で押した向きにある場所へ動く
                       どこへ動くかは data/parkMap.ts の表で決めている（→ composables/useKeyboardControls.ts の moveEntranceOnMap()）

                     command--pointer-paused … 公園入口へ戻ってきた直後、マウスを動かすまでマウスで選べなくする
                                               （最後にいた場所に合わせたカーソルが、@mouseenter で上書きされないようにする） -->
                <nav class="park-map" :class="{ 'command--pointer-paused': isCommandPointerPaused }" aria-label="どこへ行く？">
                  <!-- 地図の絵と同じ縦横比の板（この板が、行き先を置くときの基準 → assets/css/game/park-map.css の .park-map__canvas）
                       絵とボタンを同じ板に乗せているので、画面の大きさが変わっても、ボタンは絵の同じ場所に乗ったままになる -->
                  <div class="park-map__canvas">
                    <!-- 地図の絵（画面の幅で、PC用・スマホ用を切りかえる）

                         <source media> の幅は、ゲーム全体のスマホ幅のきまり（max-width: 700px）と同じにしてある
                         （板の縦横比・ボタンの置き場所を切りかえる park-map.css の @media (max-width: 700px) と、絵がずれないようにするため）
                         場所の名前はボタンで読めるので、絵は飾りとして読みとばす（alt は空） -->
                    <picture class="park-map__base">
                      <source media="(max-width: 700px)" srcset="/images/park/park-map-sp.webp" />
                      <img class="park-map__img" src="/images/park/park-map.webp" alt="" />
                    </picture>

                    <div class="park-map__spot park-map__spot--slide">
                      <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="goToPlace('slide')" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                        <span class="cmd__text">すべり台</span>
                        <!-- 探検済みバッジのとなりに、その場所のアイテムを見つけたかどうかも出す
                             （まだ行っていない場所では、アイテムのバッジは出さない） -->
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

                    <!-- 秘密の小道（見つけているとき＝canEnterSecretSpot のときだけ出る） -->
                    <div v-if="canEnterSecretSpot" class="park-map__spot park-map__spot--secret">
                      <!-- cmd--new … 見つけたばかりで、まだ小道の先へ進んでいないあいだ（hasNewSecretPath）だけ、
                                     「NEW」の印を付けて、ボタンをゆっくり光らせる（→ assets/css/game/park-map.css） -->
                      <button
                        class="cmd cmd--secret"
                        :class="{ 'cmd--selected': selectedCommandIndex === 5, 'cmd--new': hasNewSecretPath }"
                        @click="goToSecretArea"
                        @mouseenter="selectedCommandIndex = 5"
                        @focus="selectedCommandIndex = 5">
                        <span v-if="hasNewSecretPath" class="cmd__new">NEW</span>
                        <!-- 広場をもう見つけていれば、行き先の名前（こもれびの広場）にする（hasDiscoveredSecretSpot で切り替える） -->
                        <span class="cmd__text">{{ hasDiscoveredSecretSpot ? 'こもれびの広場' : '秘密の小道' }}</span>
                        <span v-if="isVisited('secretSpot')" class="cmd__badges">
                          <span class="cmd__badge"><span class="cmd__badgeIcon cmd__badgeIcon--compactOnly" aria-hidden="true">✓</span><span class="cmd__badgeText">探検済み</span></span>
                          <span v-if="hasFoundPlaceItem('secretSpot')" class="cmd__badge cmd__badge--item-found"><span class="cmd__badgeIcon" aria-hidden="true">★</span> <span class="cmd__badgeText">発見済み</span></span>
                        </span>
                      </button>
                    </div>

                    <!-- きゅうけい … 押すと、休憩する／おやつにする を選ぶベンチの画面（ひとやすみ）へ（goToPlace('restArea')）

                         休憩・おやつは、どの場所でも同じ効果なので、
                         前は各場所の「どうする？」の中にあった「休憩・おやつ」を、行き先と同じ階層のここへまとめた
                         （遊んで体力が減ったあと、「次の場所を選ぶ」でここへ戻ってきて、そのまま休める）

                         番号は、秘密の小道が出ているかどうかで変わるので restCommandIndex を見る（出ていれば 6／なければ 5） -->
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

                    <!-- おうちへ帰る（地図のいちばん下 ＝ 公園の出口）… 前の「公園の出口へ向かう（ゴール）」のボタン

                         地図は「下が公園入口、上が公園の奥」なので、ゴール（公園を出る）は、地図の下の公園入口に置く
                         押しても、すぐにはゴールへ向かわない（「出口へ向かう？」の確認ダイアログが開く。openGoalConfirm）
                         番号は、いちばん最後の goalCommandIndex（キーボードで選んで Enter でも同じダイアログが開く） -->
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

              <!-- 秘密の小道を見つけたことは、地図の下のカードではなく、
                   上のあいさつ文（parkEntranceText）と、地図の上の「秘密の小道」ボタンの「NEW」の印で知らせる（hasNewSecretPath） -->
            </section>

            <!-- 公園入口には、下のコマンド欄（「どこへ行く？」の一覧・ゴール）を出さない
                 行き先もゴールも、ぜんぶ上の地図（.park-map）から選ぶ -->
          </div>

          <!-- ひとやすみ（ベンチ）

               公園入口の「ひとやすみ」から入る、休憩・おやつを選ぶ画面
               見た目と操作は、通常の場所（すべり台など）とそろえてある
                 どうする？ … 休憩する／おやつにする／（そのほか）← 場所選びにもどる
                 結果のあと … 次の場所を選ぶ（公園入口の「どこへ行く？」へ戻る）

               遊ぶ場所ではないので、探検済み・アイテム・ちょっとしたできごと・いやいや・とつぜんのできごとは起きない
               （休憩・おやつは finishPlayAction() を通らず、finishCareAction() だけを通るため）
               BGMも公園BGMのまま -->
          <div v-else-if="currentEvent === 'restArea'" class="scene" :class="sceneClass" key="restArea">
            <section class="stage">
              <article class="place-card place-card--rest">
                <!-- 場所の絵（カードのいちばん上に出すバナー）
                     公園入口・7つの場所（ここ〜こもれびの広場）・いやいやタイム・5つのとつぜんのできごとで、同じ大きさの枠を使う
                     大きさと、結果が出ているあいだは隠すこと（いやいやタイムは隠さない）は、base.css / responsive.css の .place-card__banner -->
                <NoImage class="place-card__banner" ratio="3 / 1" label="ひとやすみ" />

                <h2 class="place-card__title">ひとやすみ</h2>

                <p class="place-card__text">ベンチでひと息。休憩する？ おやつにする？</p>
              </article>

              <!-- 休憩・おやつの結果（通常の場所とおなじ形） -->
              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンド欄（休憩する／おやつにする／← 場所選びにもどる）
                   通常の場所と同じ .command-area に入れて、置き場所・スマホで下に貼りつく動きもそろえる -->
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="すべり台" />

                <h2 class="place-card__title">すべり台</h2>

                <p class="place-card__text">「すべるー！」小さな手で、とてとて階段をのぼりはじめました。</p>
              </article>

              <!-- 結果が出たあと -->
              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンド欄（その場所の遊び2つ ＋ ← 場所選びにもどる）
                   ※ 休憩・おやつは、公園入口の「ひとやすみ」（ベンチ）へまとめた -->
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="砂場" />

                <h2 class="place-card__title">砂場</h2>

                <p class="place-card__text">こうちゃんはさっそくスコップを手に取りました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンド欄（その場所の遊び2つ ＋ ← 場所選びにもどる）
                   ※ 休憩・おやつは、公園入口の「ひとやすみ」（ベンチ）へまとめた -->
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="どんぐりの木" />

                <h2 class="place-card__title">どんぐりの木</h2>

                <p class="place-card__text">大きな木の下に、どんぐりがたくさん落ちています。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンド欄（その場所の遊び2つ ＋ ← 場所選びにもどる）
                   ※ 休憩・おやつは、公園入口の「ひとやすみ」（ベンチ）へまとめた -->
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="池" />

                <h2 class="place-card__title">池</h2>

                <p class="place-card__text">「とりさん！」白鳥とコイを指さして大はしゃぎ。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンド欄（その場所の遊び2つ ＋ ← 場所選びにもどる）
                   ※ 休憩・おやつは、公園入口の「ひとやすみ」（ベンチ）へまとめた -->
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="芝生広場" />

                <h2 class="place-card__title">芝生広場</h2>

                <p class="place-card__text">やわらかい芝生。思いきり走り回れそう！</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンド欄（その場所の遊び2つ ＋ ← 場所選びにもどる）
                   ※ 休憩・おやつは、公園入口の「ひとやすみ」（ベンチ）へまとめた -->
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

          <!-- 秘密の小道（こもれびの広場へ続くミニゲーム）

               そのプレイではじめて「秘密の小道」を選んだときだけ、ここを通る
               secretPathPhase で、中身を3つに切りかえる
               ・ready    … 説明と「小道へ進む」「← 場所選びにもどる」（まだ何も動かない）
               ・playing  … 3レーンのフィールドと「道をクリック・タップして動こう」の案内
               ・finished … 結果の文章と「先へ進む」（押すと こもれびの広場へ） -->
          <div v-else-if="currentEvent === 'secretPath'" class="scene" :class="sceneClass" key="secretPath">
            <!-- stage--secret-path … スマホ幅で、カードとコマンドボックスを横にはみ出させないための目印 -->
            <section class="stage stage--secret-path">
              <!-- はじまる前 -->
              <article v-if="secretPathPhase === 'ready'" class="place-card place-card--secret">
                <h2 class="place-card__title">🌿 秘密の小道</h2>

                <!-- secret-path-intro … スマホ幅では出さない（→ assets/css/game/responsive.css） -->
                <p class="place-card__text secret-path-intro">葉っぱのすき間から、光がちらちら。そっと小道へ。</p>

                <p class="secret-path-lead">
                  えだをよけながら
                  <br />
                  ✨ こもれびをあつめよう！
                </p>

                <ul class="secret-path-rules">
                  <!-- 操作の説明は、パソコン向け（--pc）とスマホ向け（--touch）を CSS で出し分ける -->
                  <!-- はじめる前に長く読まなくても遊べるよう、操作と目的だけを短く書く
                       文字を大きくしているので、せまい画面でもひと組（「← → / A D：左右に移動」など）の途中では
                       折り返さないよう、span で包んでいる（secret-path-rules__part） -->
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
                  <li>
                    <span class="secret-path-rules__part">🌿をよけて✨を集めよう！</span>
                    <span class="secret-path-rules__part">枝に当たると✨が1つへります</span>
                  </li>
                </ul>
              </article>

              <!-- 遊んでいる最中（HUD ＋ 3レーンのフィールド。中身は components/game/SecretPathField.vue）
                   ミニゲーム「どこまで行ける？」（pages/minigame/secret-path.vue）と同じ部品を使う
                   ・bump-penalty … 枝に当たってこもれびが本当に減ったときだけ「✨ -1」を出す
                   ・sparkle-label … こもれびを取ったときに出す文字（本編は、集めた数が1つ増えるので「✨ +1」）
                   ・フィールドのポインター操作は、部品から知らせてもらって useSecretPathGame() の関数へつなぐ -->
              <SecretPathField
                v-else-if="secretPathPhase === 'playing'"
                :player-lane="secretPathPlayerLane"
                :items="secretPathItems"
                :flash-lane="secretPathFlashLane"
                :hover-destination="secretPathHoverDestination"
                :countdown-number="secretPathCountdownNumber"
                :is-start-cue-visible="isSecretPathStartCueVisible"
                :is-bumped="isSecretPathBumped"
                :bump-penalty="secretPathBumpLost ? '✨ -1' : null"
                :bump-id="secretPathBumpId"
                :is-sparkling="isSecretPathSparkling"
                sparkle-label="✨ +1"
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

                <h2 class="place-card__title">🌿 秘密の小道</h2>

                <p class="secret-path-result">
                  ✨ こもれび
                  <b>{{ secretPathSunlightCount }}</b>
                  / {{ secretPathSunlightTotal }}
                </p>

                <p class="place-card__text">{{ secretPathResultText }}</p>

                <p class="place-card__text secret-path-light">木々のすき間から、まぶしい光が差しこんできました。</p>

                <!-- こもれびボーナス（2個以上集めたときだけ）
                     見た目は、いやいやタイムの「✨ ナイス対応！」と同じ緑の枠を使う -->
                <div v-if="secretPathBonusPoint > 0" class="event-flash event-flash--nice">
                  <p class="event-flash__label">✨ こもれびボーナス！</p>

                  <ul class="event-flash__list">
                    <li class="event-flash__item">
                      <span class="event-flash__item-label">おでかけポイント</span>
                      <span class="event-flash__item-value change--good">{{ formatChange(secretPathBonusPoint) }}</span>
                    </li>
                  </ul>
                </div>
              </article>

              <!-- コマンドボックス
                   遊んでいる最中は、コマンドのかわりに操作の案内だけを出す
                   パソコン向け（--pc）とスマホ向け（--touch）を CSS で出し分ける -->
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

                <!-- はじまる前
                     0 小道へ進む
                     1 ← 場所選びにもどる（公園入口の「どこへ行く？」へ戻る。時間もステータスも変わらない） -->
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

                  <!-- 見た目は、PCでもスマホでも短い「場所選びへ」（文字を少なくするため）
                       5文字なので、スマホ幅で「小道へ進む」と横にならべても1行に収まる
                       読み上げ用の名前は aria-label の「場所選びにもどる」 -->
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="こもれびの広場" />

                <h2 class="place-card__title">こもれびの広場</h2>

                <p class="place-card__text">「きれいー！」こもれびが差しこむ、小さな広場に出ました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="place"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンド欄（その場所の遊び2つ ＋ ← 場所選びにもどる）
                   ※ 休憩・おやつは、公園入口の「ひとやすみ」（ベンチ）へまとめた -->
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
                   place-card--tantrum-active … ゆっくりバウンスする動き（いやいや中だけ付ける）
                   place-card--tantrum-big    … 大いやいや（レベル3）の見た目
                                                 いやいや中にこれが付いた瞬間だけ、カードが小さく2回ゆれる

                   見た目と動きでクラスを分けているので、
                   いやいやが終わっても、カードの色はそのままで動きだけが止まる

                   ※ 付け外しの条件は currentEvent ではなく isTantrum
                     だっこ・おやつ・お話・待つで いやいや が終わると、
                     画面は 'tantrum' のままでも isTantrum が false になるので、
                     その瞬間にバウンスが止まる -->
              <article class="place-card place-card--tantrum" :class="{ 'place-card--tantrum-active': isTantrum, 'place-card--tantrum-big': tantrumLevel === 3 }">
                <!-- いやいやのこうちゃんの絵（場所のカードと同じバナー）
                     激しさ（レベル1〜3）で絵を変えられるよう、名前にもレベルを出しておく
                     レベルが上がるのは結果が出ているときなので、ほかのカードとちがい、結果が出ても隠さない（→ base.css） -->
                <NoImage class="place-card__banner" ratio="3 / 1" :label="`いやいやタイム（レベル${tantrumLevel}）`" />

                <!-- 見出しは、いやいやの激しさで変わる（数字の「Lv」は出さない）
                     😫 いやいやタイム → 😭 いやいやタイム！ → 😭💥 大いやいやタイム！ -->
                <h2 class="place-card__title">
                  <span class="tantrum-title__icon" aria-hidden="true">{{ currentTantrumLevelInfo.icon }}</span>
                  {{ currentTantrumLevelInfo.title }}
                </h2>

                <!-- いやいやの理由とレベルに合ったセリフと様子
                     理由の名前（'hungry' など）は出さず、様子からプレイヤーに考えてもらう
                     ・セリフ … 理由ごと × レベルごと（はげしいほど声が大きくなる）
                     ・様子   … ぐずぐずは理由ごと、大泣き・大いやいやはレベルごと
                     ※ いやいやが終わって結果を読んでいるあいだも、同じ見出し・セリフのまま残す
                       （片づけるのは、この画面から出るとき＝goToNextPlace()） -->
                <template v-if="currentTantrumReasonInfo">
                  <p class="tantrum-voice">「{{ currentTantrumReasonInfo.voices[tantrumLevel] }}」</p>
                  <p class="place-card__text">{{ currentTantrumScene }}</p>
                </template>

                <!-- 理由が決まっていないとき（ふつうは起きない）の予備の文
                     いやいや発生の文（useTantrum.ts の tantrumText）とそろえて、短くしてある -->
                <p v-else class="place-card__text">「いやー！」その場にぺたんと座りこんでしまいました。</p>
              </article>

              <ResultCard
                v-if="resultMessage"
                variant="tantrum"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups"
                :nice-tantrum-response-text="niceTantrumResponseText"
                :nice-tantrum-bonus-outing-point="niceTantrumBonusOutingPoint"
                :nice-tantrum-bonus-parent-calm="niceTantrumBonusParentCalm" />

              <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="救急車" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🚑 救急車のサイレン！</h2>

                <p class="place-card__text">「きゅうきゅうしゃ、どこ？」遠くからピーポーピーポー。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: '救急車を探してみる' }, { label: 'いっしょにサイレンを聞く' }, { label: '遊びに戻る' }]"
                :result-message="resultMessage"
                :next-place-command-label="nextPlaceCommandLabel"
                :grid-class="choiceGridClass"
                :pointer-paused="isCommandPointerPaused"
                @select="index => [lookForAmbulance, listenToSiren, walkOnFromSiren][index]()"
                @next="goToNextPlace" />
            </section>
          </div>

          <!-- とつぜんのできごと：テントウムシ発見！ -->
          <div v-else-if="currentEvent === 'ladybug'" class="scene" :class="sceneClass" key="ladybug">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <NoImage class="place-card__banner" ratio="3 / 1" label="テントウムシ" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🐞 テントウムシ発見！</h2>

                <p class="place-card__text">「てんとうむし！」葉っぱの前にしゃがみこみました。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: 'いっしょにじっくり見る' }, { label: 'そっと手を近づけてみる' }, { label: 'ばいばいして見送る' }]"
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="犬" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🐕 犬が近づいてきた！</h2>

                <p class="place-card__text">「わんわん！」散歩中の犬が、しっぽをふってやってきました。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: '近くで見せてもらう' }, { label: 'だっこで少し離れて見る' }, { label: '道をあけて見送る' }]"
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="ころんだ" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">💦 こうちゃんがころんだ！</h2>

                <p class="place-card__text">「いたい……」つまずいて、ひざを見ています。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: 'すぐにだっこする' }, { label: '「いたいのいたいのとんでいけ〜」' }, { label: '「大丈夫？」と声をかけて待つ' }]"
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
                <NoImage class="place-card__banner" ratio="3 / 1" label="噴水" />

                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">⛲ 噴水が出た！</h2>

                <p class="place-card__text">「わあ！」噴水から勢いよく水が飛び出しました。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <ResultCard
                v-if="resultMessage"
                variant="suddenEvent"
                :result-message="resultMessage"
                :is-tantrum="isTantrum"
                :found-items-this-action="foundItemsThisAction"
                :random-event-text="randomEventText"
                :random-event-effects="randomEventEffects"
                :tantrum-text="tantrumText"
                :status-changes="statusChanges"
                :change-groups="changeGroups" />

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <CommandBox
                v-model:selected-index="selectedCommandIndex"
                variant="suddenEvent"
                :commands="[{ label: '水しぶきの近くまで行く' }, { label: '少し離れてながめる' }, { label: '遊びに戻る' }]"
                :result-message="resultMessage"
                :next-place-command-label="nextPlaceCommandLabel"
                :grid-class="choiceGridClass"
                :pointer-paused="isCommandPointerPaused"
                @select="index => [goCloseToFountain, watchFountainFar, walkOnFromFountain][index]()"
                @next="goToNextPlace" />
            </section>
          </div>

          <!-- ゴール -->
          <!-- scene--result … リザルト画面だけの見た目の調整に使う目印
               （小さいスマホで「1画面に押しこまない・自然にスクロールさせる」ため。
                 ゲームの中身には関係しない、CSS専用のクラス） -->
          <div v-else-if="currentEvent === 'goal'" class="scene scene--result" :class="sceneClass" key="goal">
            <section class="stage">
              <!-- 総合スコア ＋ ランク ＋ 結果メッセージ
                   SランクとS+ランクのときだけ、カードがきらきら光る -->
              <article class="ending-card" :class="{ 'ending-card--s': endingRank === 'Sランク' || endingRank === 'S+ランク' }">
                <!-- 総合スコア（0〜100点）
                     「72 / 100」だけで点数と分かるので、「総合スコア」の見出しは読み上げ用だけにしている -->
                <p class="ending-card__score">
                  <span class="sr-only">総合スコア</span>
                  <span class="ending-card__score-value">{{ finalScore }}</span>
                  <span class="ending-card__score-max">/ 100</span>
                </p>

                <!-- 今回のランク
                     結果のいちばん大事なところなので、大きなバッジにして目立たせる
                     （「Aランク」の文字だけで分かるので、「今回のランク」の小さなラベルは付けない） -->
                <p class="ending-card__rank">{{ endingRank }}</p>

                <h3 class="ending-card__title">{{ endingTitle }}</h3>

                <p class="ending-card__text">{{ endingMessage }}</p>

                <!-- うた入りエンディングBGMの小さな表示

                     出すのは、どれか1つだけ（スコア・ランク・結果の文をじゃましないように）
                     ・S+で、このブラウザではじめて解放したとき … 「✨ サウンドトラックに新しい曲が追加されました！」＋ 曲名
                     ・S+で、もう解放済みのとき                 … 「♪ 曲名」だけ（いま流れている曲の案内）
                     ・A／Sで、まだ解放していないとき           … 「🔒 S+ランクを とると、なにかあるみたい…」のヒント
                                                                  （出すランクの決めかたは utils/sPlusSong.ts の shouldShowSPlusSongHint()）
                     ・それ以外                                 … 何も出さない

                     ※ A／SとS+は同時にならないので、この3つがぶつかることはない

                     role="status" … 解放のお知らせが出たことを、読み上げソフトにも伝える -->
                <p v-if="isSPlusSongNewlyUnlocked" class="ending-card__song ending-card__song--new" role="status">
                  <span>✨ サウンドトラックに新しい曲が追加されました！</span>
                  <span>「{{ sPlusSongTitle }}」</span>
                </p>

                <p v-else-if="endingRank === 'S+ランク'" class="ending-card__song">♪ {{ sPlusSongTitle }}</p>

                <!-- まだ うた入りBGMを取っていない人への、S+のヒント
                     何がもらえるかは書かない（ミニゲームの「🔒 300m まで行くと、なにかあるみたい…」と同じ出しかた）
                     何点からS+になるかも書かない（総合スコアは上に出ているので、「Sより上がある」ことだけ伝われば足りる）

                     ※ ここは role="status" を付けない
                       いま起きたことのお知らせではなく、リザルト画面といっしょに出る案内なので、
                       上の「新しい曲が追加されました！」と区別している -->
                <p v-else-if="isSPlusSongHintVisible" class="ending-card__song ending-card__song--locked">🔒 S+ランクを とると、なにかあるみたい…</p>
              </article>

              <!-- スコア内訳（何で何点もらったか）
                   プラスは緑・マイナスは赤にしたいので、
                   数字の形は formatChange()、色は changeClass() を使いまわしている -->
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

                <article class="record-card">
                  <h3 class="record-card__title">見つけたもの</h3>

                  <p v-if="collectedItems.length === 0" class="record-card__empty">なし</p>

                  <ul v-else class="found-list">
                    <li v-for="item in collectedItems" :key="item" class="found-list__item"><span aria-hidden="true">{{ itemIcons[item] ?? '🔍' }}</span> {{ item }}</li>
                  </ul>
                </article>
              </div>
            </section>

            <!-- ボタンは2つ。左右にならべて ← → で行き来して、
                 Enter / Space で押せる（いま選んでいるほうに「▶」と水色の枠が付く）
                 リザルトがスクロールするときは、↑↓ はスクロールに使う（収まっているときは ↑↓ でも選べる）
                 マウスを乗せたとき・Tabで移動したときも、そのボタンが選ばれた状態になる（@mouseenter / @focus）
                 command--result … スマホ幅でも2つを横にならべる
                 command--pointer-paused … ↑↓・← → でスクロールした直後、マウスを動かすまでマウスで選べなくする
                                           （止まっているカーソルの下にボタンが来て、キーボードの選択が上書きされないようにする） -->
            <nav class="command command--result" :class="{ 'command--pointer-paused': isCommandPointerPaused }">
              <button class="cmd cmd--next" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="resetGame" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                <span class="cmd__text">もう一度あそぶ</span>
              </button>

              <!-- はじめの画面（起動画面）へ戻る

                   主役は上の「もう一度あそぶ」なので、色は控えめにしてある
                   （選ばれたときは、ほかのボタンと同じように「▶」と枠が付く）

                   @keydown.enter.stop / @keydown.space.stop
                   … Tabキーでこのボタンへ移動して Enter（Space）を押したとき、
                     同じキーが window の handleKeydown にも伝わって、
                     「選んでいるコマンド」まで実行されてしまうのを止める
                     矢印キーは止めないので、フォーカスが当たっていても選択やスクロールは動かせる

                   見た目は、PCでもスマホでも短い「はじめに戻る」（文字を少なくするため）
                   読み上げ用の名前は aria-label の「はじめの画面へ戻る」 -->
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

          <!-- GAME OVER（限界をむかえて途中で終わったとき）
               自分で出口へ帰ったときとちがい、S+〜Dランクの判定はしない -->
          <div v-else-if="currentEvent === 'gameOver'" class="scene scene--gameover" :class="sceneClass" key="gameOver">
            <section class="stage">
              <article class="gameover-card">
                <p class="gameover-card__label">GAME OVER</p>

                <h2 class="gameover-card__title">{{ gameOverTitle }}</h2>

                <p class="gameover-card__text">{{ gameOverMessage }}</p>
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
                      <span>帰宅時刻</span>
                      <b>{{ currentTime }}</b>
                    </li>
                  </ul>
                </article>

                <article class="record-card">
                  <h3 class="record-card__title">見つけたもの</h3>

                  <p v-if="collectedItems.length === 0" class="record-card__empty">なし</p>

                  <ul v-else class="found-list">
                    <li v-for="item in collectedItems" :key="item" class="found-list__item"><span aria-hidden="true">{{ itemIcons[item] ?? '🔍' }}</span> {{ item }}</li>
                  </ul>
                </article>
              </div>
            </section>

            <!-- ボタンは2つ。左右にならべて ← → で行き来して、
                 Enter / Space で押せる（いま選んでいるほうに「▶」と水色の枠が付く）
                 リザルトがスクロールするときは、↑↓ はスクロールに使う（収まっているときは ↑↓ でも選べる）
                 マウスを乗せたとき・Tabで移動したときも、そのボタンが選ばれた状態になる（@mouseenter / @focus）
                 command--result … スマホ幅でも2つを横にならべる
                 command--pointer-paused … ↑↓・← → でスクロールした直後、マウスを動かすまでマウスで選べなくする
                                           （止まっているカーソルの下にボタンが来て、キーボードの選択が上書きされないようにする） -->
            <nav class="command command--result" :class="{ 'command--pointer-paused': isCommandPointerPaused }">
              <button class="cmd cmd--next" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="resetGame" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                <span class="cmd__text">もう一度あそぶ</span>
              </button>

              <!-- はじめの画面（起動画面）へ戻る

                   主役は上の「もう一度あそぶ」なので、色は控えめにしてある
                   （選ばれたときは、ほかのボタンと同じように「▶」と枠が付く）

                   @keydown.enter.stop / @keydown.space.stop
                   … Tabキーでこのボタンへ移動して Enter（Space）を押したとき、
                     同じキーが window の handleKeydown にも伝わって、
                     「選んでいるコマンド」まで実行されてしまうのを止める
                     矢印キーは止めないので、フォーカスが当たっていても選択やスクロールは動かせる

                   見た目は、PCでもスマホでも短い「はじめに戻る」（文字を少なくするため）
                   読み上げ用の名前は aria-label の「はじめの画面へ戻る」 -->
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

    <!-- ============================================================
         いやいや発生の演出（画面いっぱいのオーバーレイ）

         新しいいやいやが始まった瞬間だけ、2秒ほど画面の上に重ねて出す
         ※ うしろのゲーム画面はそのまま動いているので、
           演出が消えたあとは、いつもの結果カードがそのまま残っている

         ※ ここ（main のいちばん最後）に置いているのは、
           どの画面の上にも同じように重ねて出すため
         ============================================================ -->
    <div v-if="tantrumAlertVisible" class="tantrum-alert">
      <div class="tantrum-alert__content">
        <strong class="tantrum-alert__title">いやいや発生！</strong>
      </div>
    </div>

    <!-- ============================================================
         「出口へ向かう？」の確認ダイアログ

         公園入口で「公園の出口へ向かう（ゴール）」を選んだときだけ出す
         ・もう少し遊ぶ … 閉じて、公園入口に戻る（開いたときは、こちらが選ばれている）
         ・出口へ向かう … ゴールへ（結果発表）

         @click.self … カードの外（うしろの暗いところ）をクリックしたら閉じる
                       .self なので、カードの中をクリックしたときは閉じない
         キーボード操作は handleKeydown() の中で受け取っている（←→↑↓・Tab・Enter / Space・Escape）

         role="alertdialog" と aria-modal="true" は、読み上げソフトに
         「大事な確認のダイアログが、画面の手前に出ている」ことを伝えるためのもの
         ============================================================ -->
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

<!-- ゲーム画面の見た目（CSS）は assets/css/game.css にまとめてある

     この <style> の中に直接書くと6,000行をこえてしまい、
     このファイル全体がとても長くなってしまうため、外のファイルに分けた

     scoped は付けたまま（このページの中だけに効くCSS）
     src で読みこんでも、中に書いたときとまったく同じあつかいになる
     （game.css の中の :global(html) / :global(body) も、そのまま今までどおり効く） -->
<style scoped src="~/assets/css/game.css"></style>
