<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { loadHasUnlockedSPlusSong, saveSPlusSongUnlocked, sPlusSongSrc, sPlusSongTitle } from '~/utils/sPlusSong';
import { changeClass, formatChange } from '~/utils/statusChange';

/* 上部ステータスの警告メッセージの組み立て（あぶない状態 → 出す文のならび） */
import { buildDangerWarnings } from '~/utils/dangerWarnings';

/* 「今回の変化」の表示データ作り（行動前・いまの値・増減 → 画面にならべる形） */
import { buildChangeGroups } from '~/utils/changeGroups';

/* 公園入口のあいさつ文の組み立て（いまどの場面か → 出す文） */
import { buildParkEntranceText } from '~/utils/parkEntranceText';

/* ゲームの時計まわりの計算（「09:25」の文字 ↔ 分の数の変換） */
import { addMinutesToTime, parseTimeToMinutes } from '~/utils/gameTime';

/* ゲーム画面の部品（どれも表示と、押されたことを伝えるだけ）
   行動の中身・ステータスの計算・キーボード操作は、このファイルに残してある */
import CommandBox from '~/components/game/CommandBox.vue';
import ResultCard from '~/components/game/ResultCard.vue';
import SoundControl from '~/components/game/SoundControl.vue';

/* キーボード操作（中身は composables/useKeyboardControls.ts） */
import { useKeyboardControls } from '~/composables/useKeyboardControls';

/* いやいや（かんしゃく）の判定と結果（中身は composables/useTantrum.ts） */
import { useTantrum } from '~/composables/useTantrum';

/* 総合スコアとランクの計算（中身は composables/useScore.ts）
   どちらも「渡した数から答えを返すだけ」で、ゲームの状態はさわらない */
import { calculateScore, judgeEnding } from '~/composables/useScore';

/* 秘密の小道（ミニゲーム）の計算だけを取り出したもの
   予定表づくり・結果の文章・ボーナス・画面の位置の計算は、ぜんぶこちらにある */
import { buildSecretPathSpawnQueue, getSecretPathBonusPoint, getSecretPathLaneLeft, getSecretPathResultText, getSecretPathSwipeThreshold } from '~/composables/useSecretPath';

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
import StatusBar from '~/components/game/StatusBar.vue';

/* ゲームで使う型（どんな形のデータか、という決めごとだけ）
   中身は types/game.ts にまとめてある
   import type と書いてあるので、ビルドするとこの行はまるごと消える */
import type {
  GameEvent,
  ItemPlace,
  RandomEventEffect,
  ScoreBreakdownItem,
  SecretPathItem,
  SecretPathLane,
  SecretPathPhase,
  SecretPathSpawn,
  Snack,
  SnackId,
  SnackUseContext,
  StatusChanges,
  TantrumAction,
  TantrumLevel,
  TantrumReason,
  TantrumSnackFit,
} from '~/types/game';

/* ゲーム中に変わらない設定データ
   （ゲーム全体の設定・場所とアイテム・秘密の小道の設定・おやつの種類と回復量・いやいやのセリフ・相性表）

   ここにあるのは「読むだけ」のデータで、書きかえはしない
   いま何を持っているか・いま何のいやいやか、のような
   プレイ中に変わる値は、このファイルの ref のほうに残してある */
import { dangerCalmLine, dangerEnergyLine, fussEnergyLine, fussMoodLine, gameTitle, playedALotLine, suddenEvents, totalPlaceCount } from '~/data/game';
import { normalPlaceEvents, placeItems, placeSelectionIndexes } from '~/data/places';
import {
  secretPathBoostMultiplier,
  secretPathBumpEffectDuration,
  secretPathDuration,
  secretPathHoldBoostDelay,
  secretPathLanes,
  secretPathLeaveGuard,
  secretPathPlayerY,
  secretPathRemoveY,
  secretPathSparkleDuration,
  secretPathSpawnY,
  secretPathSpeed,
  secretPathSunlightTotal,
  secretPathTapFlashDuration,
} from '~/data/secretPath';
import { maxSnackCount, snacks } from '~/data/snacks';
import { niceTantrumBonusOutingPoint, niceTantrumBonusParentCalm, snackTantrumFits, tantrumAlertDuration, tantrumLevelInfo, tantrumReasonInfo } from '~/data/tantrum';

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

/* ============================================================
   A画面・B画面のボタンを覚えておく箱（キーボード操作用）

   ref="〜" と書いたボタンが、そのままここに入ってくる
   （画面に出ていないときは null）

   この箱を使ってやることは2つ
   ・画面が切りかわったとき、メインのボタンへフォーカスを当てる
   ・↑↓←→ で、ボタンをぐるぐる選べるようにする

   A画面  … はじめる／♪ サウンドトラック／サウンドON・OFF
   B画面  … きょうのおやつを選ぶ／はじめの画面へ戻る／？ あそびかた／サウンドON・OFF
   あそびかた画面 … ← ひとつ前の画面へ戻る／サウンドON・OFF
   ※ サウンドON/OFFは、どの画面でも一度に1つしか画面に出ないので、
     箱は1つだけで足りる（おやつ選択画面・あそびかた画面も同じ箱を使う）
   ============================================================ */
const startButtonRef = ref<HTMLButtonElement | null>(null);
const soundtrackButtonRef = ref<HTMLButtonElement | null>(null);
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

   ※ 音量スライダーは、A画面・B画面で Tab を回りこませるときに、
     いちばん後ろの行き先として使う */
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

/* 現在いる場所
   最初は「公園入口」からスタート
*/
const currentEvent = ref<GameEvent>('parkEntrance');

/* いま選んでいるコマンドの番号（キーボード操作用）
   0 = 1番目、1 = 2番目、2 = 3番目 という意味

   ↑↓キーでこの数字を動かし、Enter / Space でその番号のコマンドを実行する
   別の場所へ移動したときや、新しいコマンド画面になったときは 0 に戻して、
   いつも一番上のコマンドが選ばれている状態からはじめる
   （例外：公園入口へ戻ってきたときは、最後にいた場所のコマンドに合わせる → restoreEntranceCursor()）
*/
const selectedCommandIndex = ref(0);

/* ゲームのステータス */
const childEnergy = ref(100); // こうちゃんの体力
const childMood = ref(55); // こうちゃんの機嫌（ぐずりだすライン50のすぐ上からスタート）
const outingPoint = ref(0); // おでかけポイント
const parentEnergy = ref(100); // 親の体力
const parentCalm = ref(100); // 親の余裕（100 = とても余裕がある、0 = GAME OVER）
const currentTime = ref('09:00'); // 時間

/* 探検済みの場所
   その場所で1つ行動すると、ここに追加される
   ※ 公園入口・いやいや中・ゴールは入れない
*/
const visitedPlaces = ref<GameEvent[]>([]);

/* 場所で遊んだ回数
   その場所で1つ行動するたびに、1ずつ増える（同じ場所で遊んでも増える）

   探検済みの場所（visitedPlaces）は「何か所回ったか」しか分からないので、
   「同じすべり台で5回あそんだ」も「1か所だけ」になってしまう
   結果の文章で「たくさん遊んだ／ほとんど遊べなかった」を見分けるために、
   回った場所の数とは別に、遊んだ回数もここで数えておく
*/
const playCount = ref(0);

/* 公園で見つけたもの
   同じものは1つしか入らない
*/
const collectedItems = ref<string[]>([]);

/* いやいや中かどうか */
const isTantrum = ref(false);

/* 今回の行動で新しく見つけたもの
   結果カードに「★ アイテム発見！」を出すためだけに使う（演出用）
   行動をはじめるたびに空にするので、直前の1回ぶんだけが入っている
   ※ 見つけたものの本体は collectedItems のままで、取得のルールは変えていない
*/
const foundItemsThisAction = ref<string[]>([]);

/* 今回の行動で起きたランダムイベント（演出用）
   ・randomEventText    … 何が起きたかの文章
   ・randomEventEffects … そのできごとだけのステータス増減

   前は結果メッセージの文章に「おでかけポイント +5」と書き足していたが、
   それだと地の文にまぎれて見のがされてしまうので、
   文章と増減を分けて持ち、画面では専用の枠に出す

   ※ ステータスの数字そのものは、今までどおり outingPoint などを直接動かしている
     ここに入れるのは「画面に出すためのメモ」だけ
   ※ 行動をはじめるたびに空へ戻すので、直前の1回ぶんだけが入っている
*/
const randomEventText = ref('');
const randomEventEffects = ref<RandomEventEffect[]>([]);

/* 今回の行動でいやいやが始まったときの文章（演出用）

   結果メッセージに書き足すと、あとから画面に足した
   「アイテム発見」「ちょっとしたできごと」の表示より前に出てしまい、
   起きた順（行動 → アイテム → ちょっとしたできごと → いやいや）と食いちがう
   そこで文章だけここに持ち、画面のいちばん下に出す
*/
const tantrumText = ref('');

/* いやいやが起きた回数（記録用） */
const tantrumCount = ref(0);

/* いやいや発生の演出（画面いっぱいのオーバーレイ）を出しているかどうか

   true のあいだだけ「いやいや発生！」のオーバーレイが画面に重なって出る
   出すのは「新しいいやいやが始まった瞬間」の1回だけで、
   「少し待ってみる」に失敗して同じいやいやが続くときには出さない
*/
const tantrumAlertVisible = ref(false);

/* ============================================================
   きょうのおやつ（公園へ持っていくおやつ ＝ バッグの中身）

   ゲームが始まる前に、6種類から2種類を選んでバッグに入れてもらう
   公園へ出発したあとは、同じバッグから1つずつ取り出して食べる

   ■ selectedSnackIds の2つの顔

     ゲーム開始前 … 「公園へ持っていくおやつ」
     ゲーム中     … 「いまバッグに残っているおやつ」

     どちらも同じ配列で、食べるたびにそのおやつの名札が消えていく
       出発したとき   ['gummy', 'senbei']
       グミを食べた   ['senbei']
       せんべいも食べた []

     「残りのおやつ」を別の配列に写したりはしないので、
     バッグの中身が2か所でずれることがない

   ■ おやつの残り個数（snackLeft）

     バッグの中身の数そのもの（selectedSnackIds.length）
     数を別に持って増やしたり減らしたりはしない
     ＝ おやつを食べて名札が消えれば、残り個数も自動で1つ減る

   ■ ゲーム中にどのおやつを食べるか選ぶメニュー（おやつバッグ）は、
     もう少し下の「サブメニュー ☕ ひとやすみ」のあとにまとめてある
   ============================================================ */

/* 今日バッグに入れたおやつ（選んだ順にならぶ）

   入っているのは名札だけで、['gummy', 'senbei'] のような見た目になる
   おやつの中身（名前・絵文字・回復量）は snacks のほうが持っているので、
   ここでは同じ情報を2か所に持たないようにしている

   ゲーム中は「いまバッグに残っているおやつ」として使う
   食べたおやつは removeSnackFromBag() でここから消える

   ※ 同じおやつは1個までなので、['gummy', 'gummy'] にはならない
   ※ localStorage には保存しない（その1プレイだけのもの）
     ページを読みこみ直したら、また空から選びなおす
   ※ 空に戻すのは resetGame()（もう一度あそぶ）と goBackToBoot()（A画面へ戻る）だけ
     startGame() では書きかえないので、選んだおやつがそのまま公園へ持ちこまれる */
const selectedSnackIds = ref<SnackId[]>([]);

/* 名札（'gummy' など）から、おやつの中身（snacks の中の1件）をさがす

   find() は、snacks の中から条件に合う最初の1件を返す
   見つからなかったときは undefined になる */
function findSnack(snackId: SnackId) {
  return snacks.find((snack) => snack.id === snackId);
}

/* 選んだおやつの中身（名札 → snacks の中の本体）

   画面で「🍇 グミ」と絵文字つきで出したいので、名札から本体を引いておく
   おやつ選択画面のバッグ表示と、ゲーム中のおやつバッグの両方で、これを並べる
   （食べたおやつは selectedSnackIds から消えるので、ここからも自動で消える）

   ・map()    … 名札をひとつずつ本体に置きかえる（findSnack() でさがす）
   ・filter() … 見つからなかったぶん（undefined）を取りのぞく

   filter の中の「snack is Snack」は、
   「ここを通りぬけたものは、もう undefined ではない」と
   TypeScriptに伝えるための書きかた
   これがないと、このあと snack.name と書くたびに
   「undefined かもしれない」と言われてしまう */
const selectedSnacks = computed(() => selectedSnackIds.value.map((id) => findSnack(id)).filter((snack): snack is Snack => snack !== undefined));

/* おやつの残り個数（＝バッグに残っているおやつの数）

   selectedSnackIds の長さをそのまま返すだけ
   数を別に持たないので「バッグは空なのに残り1個」のようなずれが起きない

   ※ computed なので snackLeft.value = 2 や snackLeft.value -= 1 は書けない
     減らしたいときは、バッグからおやつを取り出す（removeSnackFromBag()）

   「snackLeft > 0」は「バッグにおやつが1個以上残っている」という意味
   （おやつのコマンドを出すか・コマンドの数・「少し待ってみる」の番号 で使う） */
const snackLeft = computed(() => selectedSnackIds.value.length);

/* バッグがいっぱいかどうか（＝これ以上は選べない）

   いっぱいのときは、まだ選んでいないおやつのカードを押せなくする
   （選んでいるおやつのカードは押せるままにして、解除できるようにする） */
const isSnackBagFull = computed(() => selectedSnackIds.value.length >= maxSnackCount);

/* 公園へ出発できるかどうか（ちょうど2種類そろっているか）

   「このおやつで公園へ行く！」を押せるようにする条件 */
const canStartWithSnacks = computed(() => selectedSnackIds.value.length === maxSnackCount);

/* そのおやつが、いまバッグに入っているかどうか

   おやつ選択画面では、「選択中」の見た目にするかどうかと、
   カードを押せなくするかどうかの、両方で使う
   ゲーム中は「そのおやつをまだ食べていないか」の確認に使う（findSnackInBag()） */
function isSnackSelected(snackId: SnackId) {
  return selectedSnackIds.value.includes(snackId);
}

/* バッグの中にあるおやつの中身を返す（ここではまだバッグから消さない）

   ゲーム中におやつを食べる関数が、いちばん最初にこれを呼ぶ
   ・バッグに入っていない（もう食べた／持ってきていない）おやつ … undefined
   ・バッグに入っているおやつ                                   … そのおやつの中身

   画面にはバッグにあるおやつしか出していないが、
   関数を直接呼ばれても「持っていないおやつで回復する」ことがないように、ここでも確かめる */
function findSnackInBag(snackId: SnackId) {
  if (!isSnackSelected(snackId)) {
    return undefined;
  }

  return findSnack(snackId);
}

/* おやつをバッグから出す（selectedSnackIds から名札を消す）

   同じおやつは1個までなので、同じ名札をぜんぶ消す形で問題ない
   ゲーム中は、ステータスの計算がぜんぶ終わってから呼ぶこと
   （先に呼ぶと、途中で何かあったときに「おやつだけ減った」ことになってしまう） */
function removeSnackFromBag(snackId: SnackId) {
  selectedSnackIds.value = selectedSnackIds.value.filter((id) => id !== snackId);
}

/* ============================================================
   いやいやの理由（こうちゃんは、なぜ泣いているのか）

   いやいやには4つの理由があり、理由によって「効く対応」がちがう
   プレイヤーは、こうちゃんのセリフや様子から理由を考えて、対応を選ぶ

   ■ 「発生するか」と「なぜ泣いているか」は別の抽選

     ① checkTantrum()       … いやいやが「そもそも起きるか」を決める
                               （体力・機嫌・時間から確率を出す。ここは前と同じ）
     ② chooseTantrumReason() … ①で起きると決まったあとで「なぜ泣いているか」を決める

     ①で起きなかったときは、②は呼ばれない（理由も変わらない）

   ■ 同じいやいやのあいだは、理由を変えない

     理由を決めるのは「新しいいやいやが起きた瞬間」の1回だけ
     「少し待ってみる」に失敗して いやいや が続いても、理由はそのまま
     （「おなかすいた」と泣いていたのに、待っていたら急に
       「まだあそぶ」に変わった、ということが起きないようにする）

   ■ 画面には理由の名前（'hungry' や「空腹」）を出さない

     出すのは tantrumReasonInfo のセリフと様子だけ
     答えを見せずに、プレイヤーに考えてもらうため
   ============================================================ */

/* いやいやの理由
   tired        … つかれた
   hungry       … おなかすいた
   frustrated   … うまくできなくて悔しい
   wantMorePlay … まだ遊びたい */

/* いまのいやいやの理由

   null … いやいやしていない（または、まだ理由が決まっていない）

   ※ だっこ・おやつなどで いやいや が終わった瞬間には null に戻さない
     結果の文章を読んでいるあいだも「何のいやいやだったか」を使うことがあるため
     null に戻すのは、結果を読み終えて いやいやタイムの画面から出るとき（goToNextPlace()）
     と、もう一度あそぶとき（resetGame()） */
const tantrumReason = ref<TantrumReason | null>(null);

/* ============================================================
   いやいやの激しさ（いやいやレベル）

   同じ1回のいやいやでも、対応しだいで激しさが変わる
     1 … ぐずぐず   （はじまったばかり）
     2 … 大泣き     （対応がずれて、泣き声が大きくなった）
     3 … 大いやいや （地面にごろん。いちばん激しい）

   ・新しいいやいやは、かならず 1 から始まる
   ・ずれた対応をすると 1 → 2 → 3 と上がる（3 より上にはならない）
   ・合った対応をすると、1段落ち着くこともある
   ・いやいやが終わるのは、それぞれの対応で isTantrum を false にしたときだけ
     （レベルが 1 まで下がっても、それだけでは終わらない）

   ※ tantrumCount（いやいやが起きた回数）とは別もの
     レベルが 1 → 2 → 3 と上がっても、同じ1回のいやいやなので、回数は増えない

   ※ 画面には「Lv2」のような数字は出さない
     見出しとこうちゃんの様子（ぐずぐず → 大泣き → 大いやいや）で伝える
   ============================================================ */

/* いまのいやいやの激しさ
   いやいやしていないときは 1 のまま（新しいいやいやも 1 から始まる） */
const tantrumLevel = ref<TantrumLevel>(1);

/* いまのレベルの見出しと様子 */
const currentTantrumLevelInfo = computed(() => tantrumLevelInfo[tantrumLevel.value]);

/* いまのいやいやの理由に合ったことば（理由が決まっていないときは null） */
const currentTantrumReasonInfo = computed(() => (tantrumReason.value === null ? null : tantrumReasonInfo[tantrumReason.value]));

/* いやいやタイムのカードに出す、こうちゃんの様子
   ぐずぐずのときは理由ごとの様子、大泣き・大いやいやのときはレベルごとの様子 */
const currentTantrumScene = computed(() => currentTantrumLevelInfo.value.scene ?? currentTantrumReasonInfo.value?.scene ?? '');

/* おやつと いやいやの理由の相性

   great  … ぴったり     → どのレベルでも いやいや終了 ＋ ナイス対応
   normal … ふつうに効く → ぐずぐずなら終了、大泣き以上なら1段落ち着くだけ（いやいやは続く）
   weak   … ずれている   → 食べてはくれるが、いやいやは悪化する

   ※ great が大いやいやでも効くのは、「理由にぴったりのおやつ」はそれだけ強い、というルールのため
     normal は「おやつはうれしいけれど、泣いている理由には合っていない」ので、
     はげしく泣いているときは、ひとまず少し落ち着くところまでしか効かない

   ※ おやつ選択画面にもおやつバッグにも、この相性は出さない
     こうちゃんの様子とおやつの説明から、プレイヤーに考えてもらう */

/* いまのいやいやの理由に対して、そのおやつの相性はどうか

   理由が決まっていないとき（ふつうは起きない）は normal にしておく
   ＝ 相性を入れる前と同じく、どのおやつでも いやいや が終わる */
function getSnackTantrumFit(snackId: SnackId): TantrumSnackFit {
  if (tantrumReason.value === null) {
    return 'normal';
  }

  return snackTantrumFits[snackId][tantrumReason.value];
}

/* ============================================================
   いやいや中に選んだ対応の記録（同じ対応のくり返し）

   「同じことを何度もやれば、いつかは勝てる」にならないように、
   直前と同じ対応を続けたときは、少し効きにくくする

   ■ lastTantrumAction … 直前に選んだ対応
     'hug' だっこ／'talk' お話／'wait' 待つ／'snack:gummy' などのおやつ
     おやつは種類ごとに別の対応としてあつかう
     （グミが合わなかったあとに、せんべいへ変えるのは「くり返し」ではない）

   ■ repeatedTantrumActionCount … 同じ対応を何回続けているか
     0 … 1回目（直前とちがう対応）
     1 … 2回続けた
     2 … 3回以上続けた（2より大きくはしない）

   ・ちがう対応を選ぶと 0 に戻る
     （待つ → 待つ → お話 → 待つ なら、最後の待つは、また「1回目」）
   ・書きかえるのは registerTantrumAction() の1か所だけ
   ・新しいいやいやが始まったときと、いやいやタイムから出るときに、まとめて空へ戻す
   ============================================================ */

const lastTantrumAction = ref<TantrumAction | null>(null);
const repeatedTantrumActionCount = ref(0);

/* ===== ナイス対応（いやいやの理由に合った対応をしたときのごほうび） =====

   ナイス対応になるのは次のとき（ボーナスを足すのは applyNiceTantrumResponse() の1か所だけ）
   ・つかれた           ＋ だっこ（どのレベルでも）
   ・悔しい             ＋ お話する（大いやいやで1段落ち着くだけのときもふくむ）
   ・まだ遊びたい       ＋ お話する（同上）
   ・悔しい             ＋ 少し待ってみる（成功したとき。1段落ち着くだけのときもふくむ）
   ・相性 great のおやつ ＋ そのいやいやの理由（どのレベルでも）

   ボーナスがもらえるのは、1回のいやいやにつき1回だけ（hasNiceTantrumResponse で見る） */

/* このいやいやで、もうナイス対応のボーナスをもらったかどうか

   ボーナスは1回のいやいやにつき1回だけ
   たとえば「大いやいやで正しいお話 → 大泣きに下がる → もう一度お話で解決」のとき、
   2回ともボーナスを入れると、わざと長引かせたほうが得になってしまうため

   新しいいやいやが始まったときと、いやいやタイムから出るときに false へ戻す */
const hasNiceTantrumResponse = ref(false);

/* ナイス対応の表示に出す文章（演出用）

   空っぽ … 今回の対応はナイス対応ではなかった（結果カードに「✨ ナイス対応！」を出さない）
   行動をはじめるたび（startStatusChanges()）と、いやいやタイムから出るときに空へ戻す */
const niceTantrumResponseText = ref('');

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

/* 結果メッセージ */
const resultMessage = ref('');

/* 今回の行動による変化
   null は「まだ今回の行動結果がない」という意味
   場所を移動したら null に戻して、前の変化が残らないようにする
*/
const statusChanges = ref<StatusChanges | null>(null);

/* 行動する前のステータスを、いったん控えておく箱
   行動が終わったあとに「今の値 － 行動前の値」で変化量を計算する

   ※ GAME OVER画面で「親の体力 10 → 0」のように行動前の値も出したいので、
     ふつうの変数ではなく ref にして、画面からも読めるようにしている
*/
const statusBefore = ref({
  childEnergy: 0,
  childMood: 0,
  outingPoint: 0,
  parentEnergy: 0,
  parentCalm: 0,
  minutes: 0,
});

/* ゴールしたときのランクと判定メッセージ */
const endingRank = ref('');
const endingTitle = ref('');
const endingMessage = ref('');

/* S+ランク限定の「うた入りエンディングBGM」を、このブラウザで解放済みかどうか

   一度でもS+ランクを取ると true になり、localStorage にも保存される
   （保存のしくみは utils/sPlusSong.ts。サウンドトラックのページも同じものを使う）

   ※ 体力や機嫌とちがって「ゲームのステータス」ではなく「実績・解放情報」なので、
     resetGame（もう一度あそぶ／はじめの画面へ戻る）では false に戻さない
     （サウンドの設定 soundEnabled と同じあつかい）
   ※ 前に解放しているかは、onMounted で localStorage から思い出す
*/
const hasUnlockedSPlusSong = ref(false);

/* 今回のゴールで、うた入りBGMを「このブラウザではじめて」解放したかどうか

   true のときだけ、リザルト画面に「✨ サウンドトラックに新しい曲が追加されました！」を出す
   2回目以降のS+では出さない（曲そのものは毎回流す）
   こちらはその1プレイだけの表示なので、resetGame() で false に戻す
*/
const isSPlusSongNewlyUnlocked = ref(false);

/* 今回のプレイの総合スコア（0〜100点）
   ゴールしたときに calculateFinalScore() で計算して入れる
   まだゴールしていないときは0
*/
const finalScore = ref(0);

/* スコアの内訳
   「何で何点もらったのか」を1行ずつためておいて、結果画面に並べる
   ゴールするたびに calculateFinalScore() の中で空に戻す
*/
const scoreBreakdown = ref<ScoreBreakdownItem[]>([]);

/* GAME OVERになった理由（GAME OVER画面に出す文章）
   まだGAME OVERになっていないときは、どちらも空っぽ
*/
const gameOverTitle = ref('');
const gameOverMessage = ref('');

/* 今の時間を「分」に直したもの
   09:00 なら 540、12:00 なら 720 になる
*/
const currentMinutes = computed(() => parseTimeToMinutes(currentTime.value));

/* お昼（12:00）を過ぎたかどうか */
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

   どの言いかたにするかは utils/parkEntranceText.ts の buildParkEntranceText()
   ここは、いまがどの場面かを渡すだけ

   ③の境目は、公園BGMがBGM2に変わる時刻とわざと同じにしてある
   （shouldUseParkBgm2 を使いまわしているので、境目の数字は1か所だけ）
   曲と文言がいっしょに変わることで、
   「午前前半の章 → 午前後半の章」へ進んだ感じが出る
*/
const parkEntranceText = computed(() => buildParkEntranceText(isJustArrivedAtPark.value, shouldUseParkBgm2()));

/* 秘密の場所へ行ける条件
   ・おでかけポイントが20以上
   ・見つけたものが3種類以上
   の両方を満たすと解放される
*/
const canEnterSecretSpot = computed(() => outingPoint.value >= 20 && collectedItems.value.length >= 3);

/* こもれびの広場（secretSpot）を、このプレイでもう見つけたかどうか

   false … まだ見つけていない
           公園入口の「細い道の先へ行く」を選ぶと、まずミニゲーム「秘密の小道」へ進む
   true  … 秘密の小道を最後まで進んで、広場を見つけた
           同じプレイのあいだは、ミニゲームをもう一度やらずに、そのまま広場へ入る

   ※ visitedPlaces（探検済み）とは別もの
     探検済みになるのは広場で遊んだときなので、
     「広場を見つけたけれど、何もせずに出た」ときは探検済みにならない
     それでもミニゲームをくり返さないように、見つけたことだけを別に覚えておく
   ※ false に戻すのは resetGame()（もう一度あそぶ／はじめの画面へ戻る）だけ
*/
const hasDiscoveredSecretSpot = ref(false);

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
   true なら、その場所ならではの遊びがならんでいて、
   「休憩・おやつ」からサブメニューを開ける画面だという意味
*/
const isNormalPlace = computed(() => normalPlaceEvents.includes(currentEvent.value));

/* ===== 通常の場所のメインコマンドの番号 =====

   通常の場所6か所は、どこでも同じ4つにそろえてある

   0 その場所の行動①
   1 その場所の行動②
   2 休憩・おやつ          ← 押すとサブメニューが開く
   3 ← 場所選びにもどる    ← よく使うので、サブメニューには入れない
                              （この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る）

   ※ 2・3 という数字を直接書かず、名前を付けておく
     画面とキーボード操作の両方で同じ番号を使うので、
     名前にしておけば、あとから順番を変えてもずれない
*/
const careMenuCommandIndex = 2;
const leavePlaceCommandIndex = 3;

/* ===== サブメニュー「☕ ひとやすみ」 =====

   休憩とおやつは、その場所ならではの遊びではなく
   「どこでも同じ、親子の状態を整える行動」なので、
   メインコマンドの中にまぜず、別のメニューにまとめている

   ふだんは閉じていて、「休憩・おやつ」を選んだときだけ開く
*/

/* サブメニューが開いているかどうか（true = 開いている） */
const isCareMenuOpen = ref(false);

/* サブメニューの中で、いま選んでいるコマンドの番号
   0 = 休憩する、1 = おやつをあげる

   メインコマンドの selectedCommandIndex とは別に持っている
   （こうしておくと、サブメニューを閉じたときに
     メイン側の「休憩・おやつ」が選ばれたままになる）
*/
const selectedCareCommandIndex = ref(0);

/* サブメニューを実際に画面に出すかどうか

   次の3つがそろったときだけ出す
   ① 通常の場所6か所にいる
   ② 結果カードが出ていない（まだ行動を選んでいる最中）
   ③ サブメニューを開いている

   画面（v-if）・キーボード操作・Enterの実行 の3か所で同じこれを見るので、
   「画面に無いのにキーだけ効く」ということが起きない
*/
const isCareMenuVisible = computed(() => isNormalPlace.value && !resultMessage.value && isCareMenuOpen.value);

/* サブメニューに出ているコマンドの数
   おやつが残っていれば2つ（休憩・おやつ）、食べきっていれば1つ（休憩だけ）
   ↑↓キーで動ける範囲を決めるのに使う
*/
const careCommandCount = computed(() => (snackLeft.value > 0 ? 2 : 1));

/* サブメニューを開く

   開くときは、いつも一番上（0 = 休憩する）が選ばれた状態からはじめる

   メイン側の選択も「休憩・おやつ」にそろえておく
   こうしておくと、Escapeで閉じたときに
   そのまま「休憩・おやつ」が選ばれた状態に戻る
*/
function openCareMenu() {
  // 決定音「ポン♪」（メニューを開いたことが分かるように）
  playDecisionSound();

  isCareMenuOpen.value = true;
  selectedCareCommandIndex.value = 0;
  selectedCommandIndex.value = careMenuCommandIndex;
}

/* サブメニューを閉じる

   ※ selectedCommandIndex はさわらない
     メイン側の「休憩・おやつ」が選ばれたまま残るようにするため

   ※ おやつバッグ（closeSnackMenu()）もいっしょに閉じる
     ひとやすみを閉じたのに、その中から開いたバッグだけが残る、ということが起きない
     この関数は「行動をはじめたとき・場所を移動したとき・もう一度あそぶ」でも呼ばれるので、
     いやいやタイムで開いたバッグも、そのときにまとめて閉じられる
*/
function closeCareMenu() {
  isCareMenuOpen.value = false;
  selectedCareCommandIndex.value = 0;
  closeSnackMenu();
}

/* 「休憩・おやつ」を押したときの開け閉め
   開いていなければ開く、開いていればもう一度押して閉じる
*/
function toggleCareMenu() {
  if (isCareMenuOpen.value) {
    // 閉じるときは決定音を鳴らさない（開くときだけ鳴らす）
    closeCareMenu();
    return;
  }

  openCareMenu();
}

/* ===== 休憩・おやつのあとの「← もどる」 =====

   通常の場所の「進む／戻る」は、次の3種類に分けてある（文言が混ざらないようにする）

   ① 「次の場所を選ぶ」     … 場所ならではの遊びが終わったので、公園入口の「どこへ行く？」へ進む
   ② 「← 場所選びにもどる」 … まだ何もしていないが、この場所では遊ばずに「どこへ行く？」へ戻る
   ③ 「← もどる」           … いまいる場所や、1つ前のメニューへ戻る
                               （おやつバッグ → ☕ ひとやすみ、休憩・おやつの結果 → いまいる場所）

   休憩・おやつは、その場所で ひと息ついただけで、場所は離れていない
   なので結果カードには①ではなく③を出し、押したら同じ場所の「どうする？」へ戻す
*/

/* いま出ている結果カードが、休憩・おやつの結果かどうか
   finishCareAction() で true、次の行動をはじめたとき（startStatusChanges()）や場所を出たときに false */
const isCareActionResult = ref(false);

/* 休憩・おやつの結果カードに「← もどる」を出すかどうか

   ※ 12:00を過ぎたときだけは出さず、ほかの行動のあとと同じ「次の場所を選ぶ」にする
     休憩で12:00を過ぎたのに場所へ戻れてしまうと、「12:00までに帰る」というルールが崩れるため
     （「次の場所を選ぶ」を押すと、goToNextPlace() が今までどおりゴールへ向かう） */
const isCareResultBackVisible = computed(() => isNormalPlace.value && !!resultMessage.value && isCareActionResult.value && !isTimeOver.value);

/* 休憩・おやつの結果カードの「← もどる」

   結果カードを閉じて、いまいる場所の「どうする？」へ戻すだけ
   ・時間・ステータス・おやつは、休憩・おやつを選んだときに変わり終わっているので、ここでは何も変えない
   ・場所を離れていないので、BGMもさわらない（こもれびの広場なら、こもれびの広場BGMのまま）
   ・カーソルは「休憩・おやつ」に合わせる（おやつバッグの「← もどる」と同じく、選んでいた行へ戻る）
   ・決定音は鳴らさない（ほかの「← もどる」と同じ）
   ・マウスを動かすまで、コマンド枠をマウスで押せないようにする（isCommandPointerPaused を参照） */
function backToPlaceFromCareResult() {
  if (!isCareResultBackVisible.value) {
    return;
  }

  resultMessage.value = '';
  statusChanges.value = null;
  isCareActionResult.value = false;
  selectedCommandIndex.value = careMenuCommandIndex;
  pauseCommandPointer();
}

/* 「← もどる」（休憩・おやつの結果）のあとや、公園入口へ戻ってきた直後だけ、コマンド枠をマウスで押せなくしておくか

   「← もどる」は1つだけのボタンなので枠のいちばん下にあり、押すと枠が上へ4行ぶん伸びる
   するとマウスを動かしていなくても、カーソルの真下に「← 場所選びにもどる」が来てしまい、
   ・選んでいる行が「休憩・おやつ」から勝手に移る（ハイライトが跳ねて見える）
   ・すばやく2回押すと、2回目で場所を出てしまう
   ということが起きる

   そこで、マウスを動かす（またはどこかを押す）までは、枠へのマウス操作を止めておく
   （止めかたは CSS の .command-box--pointer-paused）
   キーボードで「← もどる」を選んだときも、枠の上にマウスが置いてあれば同じことが起きるので止める
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

     exploring … 通常の場所の「☕ ひとやすみ」→「おやつをあげる ＞」
     tantrum   … いやいやタイムの「おやつをあげる ＞」

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

   selectedCommandIndex（メインコマンド）・selectedCareCommandIndex（ひとやすみ）とは別に持つ
   こうしておくと、もどったときに「おやつをあげる」が選ばれたまま残る */
const selectedSnackMenuIndex = ref(0);

/* 「← もどる」が何番目か（＝バッグに残っているおやつの数） */
const snackMenuBackIndex = computed(() => selectedSnacks.value.length);

/* おやつバッグを実際に画面に出しているかどうか

   isCareMenuVisible と同じ考えかたで、画面（v-if）・キーボード操作・Enterの実行 の
   3か所がこれを見るので、「画面に無いのにキーだけ効く」ということが起きない

   開いた場面のコマンドが、いま画面に出ているときだけ true にする
   ・exploring … ☕ ひとやすみ が出ているとき（バッグは その枠の中に出る）
   ・tantrum   … いやいやが続いているとき（「少し待ってみる」に失敗した直後もふくむ） */
const isSnackMenuVisible = computed(() => {
  if (snackUseContext.value === 'exploring') {
    return isCareMenuVisible.value;
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
   ・exploring … ☕ ひとやすみ（「おやつをあげる」が選ばれたまま）
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

  // 公園入口は「行き先6か所 ＋ ゴール」で7つ
  // 秘密の場所がまだ見つかっていないときは、その行が画面に無いので6つ
  if (currentEvent.value === 'parkEntrance') {
    return canEnterSecretSpot.value ? 7 : 6;
  }

  // いやいやが続いているあいだは、おやつが残っていれば4つ、食べきっていれば3つ
  //   おやつあり  0 お話する／1 だっこ／2 おやつ ＞／3 少し待ってみる
  //   おやつなし  0 お話する／1 だっこ／2 少し待ってみる
  // 待つ・お話・おやつが効かずに結果メッセージが出ているときも、
  // いやいやはまだ終わっていないので、この4つ（3つ）から選び直す
  // ※ 下の「結果表示中は1つ」より先に判定するのがポイント
  if (isTantrumUnsolved.value) {
    return snackLeft.value > 0 ? 4 : 3;
  }

  // 結果表示中は1つだけ
  // （ふつうは「次の場所を選ぶ」、休憩・おやつの結果なら「← もどる」）
  if (resultMessage.value) {
    return 1;
  }

  /* 通常の場所6か所は、どこでも同じ4つ

     0 その場所の行動①
     1 その場所の行動②
     2 休憩・おやつ
     3 ← 場所選びにもどる

     ※ サブメニューが開いているあいだのコマンド数は、ここでは数えない
       サブメニュー側は careCommandCount で別に管理している

     ※ すぐ上の「結果表示中は1つ」より後ろに置くのが大事
       結果カードを読んでいるあいだは、メインコマンドも
       「次の場所を選ぶ」（休憩・おやつの結果なら「← もどる」）1つだけになるため
  */
  if (isNormalPlace.value) {
    return 4;
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
  // ※ 通常の場所は、1つ上の isNormalPlace の分岐で返している
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

   おやつあり  0 お話する／1 だっこ／2 おやつ ＞／3 少し待ってみる
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

/* 公園入口の「公園の出口へ向かう（ゴール）」が何番目になるか
   秘密の場所が出ていれば7番目（＝6）
   まだ出ていないときは、その行が画面に無いので1つくり上がって6番目（＝5）
*/
const goalCommandIndex = computed(() => (canEnterSecretSpot.value ? 6 : 5));

/* 公園入口へ戻ってきたとき、どのコマンドにカーソルを合わせるか（restoreEntranceCursor() で使う）

   その場所へ入るためのコマンドの番号を返す
   公園入口にその行が出ていないとき（場所選びから入る場所ではない・「細い道の先へ行く」が出ていない）は null
   → 呼ぶ側は何もせず、今までどおり先頭（0）のままにする

   ※ 「細い道の先へ行く」は canEnterSecretSpot のときだけ画面に出る
     おでかけポイントもアイテムも減らないので、広場や小道にいるあいだに消えることは無いはずだが、
     出ていないときに5番を返すと、1つくり上がったゴールを選んでしまうので、念のため確かめる */
function getPlaceSelectionIndex(place: GameEvent): number | null {
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

   goToPlace() で、公園入口に行がある場所（placeSelectionIndexes にある場所）へ入るときに書きかえる
   ・とつぜんのできごと・いやいやタイムは goToPlace() を通らない（goToNextPlace() が直接切りかえる）ので、
     途中に入っても上書きされず、そのあと公園入口へ戻ったときに「遊んでいた場所」を選べる
   ・秘密の小道 → こもれびの広場 と進むと secretSpot になるが、どちらも「細い道の先へ行く」なので同じ
   null … このプレイでまだ場所を選んでいない（ゲーム開始直後）。startGame() / resetGame() で null に戻す */
const lastSelectedPlace = ref<GameEvent | null>(null);

/* 公園入口へ戻ってきたときに、最後にいた場所のコマンドへカーソルを合わせる

   呼ぶところ
   ・goToNextPlace() で公園入口へ着いたとき
     （遊んだあとの「次の場所を選ぶ」・何もせず「← 場所選びにもどる」・とつぜんのできごとやいやいやのあと）
   ・leaveSecretPathToEntrance()（秘密の小道の「← 場所選びにもどる」）

   ・まだ場所を選んでいない／その行が画面に出ていないときは何もしない（呼ぶ前に 0 にしてあるので先頭のまま）
   ・マウスで押して戻ってきたときは、止まったままのマウスの下に公園入口のボタンが出てきて、
     @mouseenter でカーソルが上書きされてしまうので、マウスを動かすまで止めておく（pauseCommandPointer()） */
function restoreEntranceCursor() {
  const index = lastSelectedPlace.value === null ? null : getPlaceSelectionIndex(lastSelectedPlace.value);

  if (index === null) {
    return;
  }

  selectedCommandIndex.value = index;
  pauseCommandPointer();
}

/* ===== 「公園の出口へ向かう？」の確認ダイアログ =====

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
   「画面に無いのにキーだけ効く」ということが起きない（isCareMenuVisible と同じ考えかた） */
const isGoalConfirmVisible = computed(() => isGoalConfirmOpen.value && gameStarted.value && currentEvent.value === 'parkEntrance');

/* ダイアログに出す「お昼まで、あとどれくらいか」の文

   まだ遊ぶ時間が残っているかを見て決められるように、残り時間を出しておく
   例）10:40 なら「お昼（12:00）まで、あと1時間20分あります。」 */
const goalConfirmTimeText = computed(() => {
  const minutesLeft = 12 * 60 - currentMinutes.value;

  // ふつうは、12:00を過ぎると自動でゴールへ向かうので、ここへは来ない（念のため）
  if (minutesLeft <= 0) {
    return 'もうお昼の時間です。';
  }

  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;

  let timeLeft = `${minutes}分`;

  if (hours > 0) {
    timeLeft = minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
  }

  return `お昼（12:00）まで、あと${timeLeft}あります。`;
});

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
   上部ステータスの忠告（あぶないよ／そろそろお昼だよ）は出さない
*/
const isResultScene = computed(() => currentEvent.value === 'goal' || currentEvent.value === 'gameOver');

/* 上部ステータスに出す警告メッセージ

   どの文をどの順番でならべるかは utils/dangerWarnings.ts の buildDangerWarnings()
   ここは、いまあぶない状態かどうかを渡すだけ
*/
const dangerWarnings = computed(() => buildDangerWarnings(isParentEnergyDanger.value, isParentCalmDanger.value, isChildEnergyDanger.value));

/* ============================================================
   効果音（Web Audio API）

   音声ファイル（MP3・WAV）は使わず、ブラウザに最初から入っている
   Web Audio API で、その場で音そのものを作って鳴らす

   使う部品は3つだけ
   ・AudioContext    … 音を作るための「作業台」。これが無いと何も作れない
   ・OscillatorNode  … 音の発生源。「1秒間に何回ふるえるか」を決めると、その高さの音が出る
   ・GainNode        … 音量つまみ。時間に沿って音量を変えられる

   つなぎ方は
   Oscillator（音を出す）→ Gain（音量を調整）→ destination（スピーカー）

   ※ 効果音のうち3つ（救急車・犬・噴水）だけは、ここでは作っていない
     本物らしい音色が必要で、計算では作れないので、録音した音声ファイルを鳴らしている
     （→ このあとの「音声ファイルの効果音（HTML Audio）」）
   ============================================================ */

/* ゲームの音を鳴らすかどうか（プレイヤーの設定）
   効果音（ポン♪など）と公園BGMの両方をまとめて切り替える
   true  … サウンドON（はじめてのときはこちら）
   false … サウンドOFF

   ※ 体力や機嫌とちがって「ゲームのステータス」ではなく「設定」なので、
     resetGame（もう一度あそぶ）では初期値に戻さない
*/
const soundEnabled = ref(true);

/* サウンドの設定を保存しておく名前（localStorageのキー）
   同じブラウザの他のページと名前がぶつからないよう、ゲーム名を頭に付けている
*/
const soundStorageKey = 'kouchan-game-sound-enabled';

/* 音ぜんぶの大きさ（0〜100の整数。100＝そのままの大きさ）

   ■ 何にかかるか
     BGMにも、決定音などの効果音にも、まとめて同じ割合でかかる
     （曲ごと・効果音ごとの数字は「録音の大きさをそろえる」ためのものなので、そのまま残す）
     実際に鳴らす大きさは、その数字とこれをかけ算して決める（→ getSoundVolume()）

   ■ 0% ＝ ミュート
     0%にすると音が何も出なくなるので、スピーカーのミュートと同じ状態になる
     見た目と中身が食いちがわないように、この2つはいつもセットで動かしている
     ・スライダーを0%にした     … soundEnabled も false にする（アイコンが 🔊× になる）
     ・スライダーを0%から上げた … soundEnabled も true に戻す（音が戻る）
     ・ミュートボタンを押した   … スライダーも 0% ⇄ もとの大きさ に動く
     （切りかえているのは changeSoundVolume() と toggleSound() の2か所だけ）

   ※ サウンドON/OFFと同じ「設定」なので、resetGame（もう一度あそぶ）では戻さない
*/
const soundVolumePercent = ref(100);

/* ミュートする直前の大きさ（ミュートを解除したときに、ここへ戻す）

   ミュートすると音量は0%になるので、そのままだと
   解除したときに「前はどれくらいだったか」が分からなくなってしまう
   0%のときは戻り先にならないので、100%を初期値にしてある
*/
let volumeBeforeMute = 100;

/* 音量を保存しておく名前（localStorageのキー）
   サウンドON/OFF（kouchan-game-sound-enabled）とは別のメモにしてある
   ※ キーの文字は、前に決めたときのまま（-bgm- ）にしてある
     いま使っている人の設定が、名前を変えたせいで消えてしまわないようにするため */
const soundVolumeStorageKey = 'kouchan-game-bgm-volume';

/* もとの大きさに、音量スライダーのぶんをかけた「実際に鳴らす大きさ」を返す

   BGMからも効果音からも、同じこの関数を通す
   例：公園BGM（0.16）で、音量が50%なら → 0.16 × 0.5 ＝ 0.08
   例：決定音（0.06）で、音量が50%なら → 0.06 × 0.5 ＝ 0.03

   volume に入れられるのは 0〜1 の数字だけなので、
   はみ出さないように、下（0）と上（1）でおさえている
*/
function getSoundVolume(baseVolume: number) {
  return Math.min(1, Math.max(0, baseVolume * (soundVolumePercent.value / 100)));
}

/* ミュートボタンを押したとき（サウンドのON/OFFを切り替える）

   0% ＝ ミュートなので、スライダーの位置もいっしょに動かす
   ・ミュートする   … いまの大きさを覚えてから、0%へ
   ・ミュートを解除 … 覚えておいた大きさへ戻す（覚えが0%なら100%）
*/
function toggleSound() {
  // ① まず切り替える（true なら false へ、false なら true へ）
  soundEnabled.value = !soundEnabled.value;

  // ② スライダーの位置も、いまの状態に合わせる
  if (soundEnabled.value) {
    soundVolumePercent.value = volumeBeforeMute > 0 ? volumeBeforeMute : 100;
  } else {
    if (soundVolumePercent.value > 0) {
      volumeBeforeMute = soundVolumePercent.value;
    }

    soundVolumePercent.value = 0;
  }

  // ③ 新しい大きさを、いま鳴っているBGMへ反映して、保存しておく
  applySoundVolume();
  saveSoundVolume();

  // ④ BGMを止める・鳴らしなおす（と、ON/OFFの保存）
  applySoundEnabledChange();
}

/* サウンドのON/OFFが変わったあとの、あと始末

   ミュートボタン（toggleSound）からも、
   スライダーを0%にした・0%から上げたとき（changeSoundVolume）からも呼ばれる

   ここでやること
   ① BGMを止める／鳴らしなおす
       効果音は getAudioContext() が soundEnabled を見てくれるので何もしなくてよいが、
       BGMは「いま鳴っている曲」なので、その場で止める・再開する必要がある

       ONに戻したときは、いまの画面に合う曲「1曲だけ」を再開する
       ・起動画面                  … どれも鳴らさない（まだ何も始まっていない）
       ・タイトル画面              … タイトルBGM
       ・いやいやタイム            … いやいやBGM
       ・いやいや発生の結果を読んでいる最中 … どれも鳴らさない（わざと無音にしている画面）
       ・秘密の場所                … こもれびの広場BGM
       ・公園を探検している最中     … 公園BGM（10:30より前ならBGM1、10:30以降ならBGM2）
       ・ゴール（通常のおしまい）   … リザルトBGM
       ・GAME OVER                 … GAME OVER BGM（ゴールのリザルトBGMとは別の曲）

       止めたところからの続きなので、play〜ではなく resume〜 を使う

       ※ タイトルBGMの条件に titleEntered が要る
         「!gameStarted」だけだと起動画面も当てはまってしまい、
         起動画面でONに戻しただけで曲が鳴りだしてしまう

       ※ ゴールを、いやいや関連より先に置くのが大事
         いやいや対応の途中でお昼になってゴールすると、
         結果画面なのに isTantrum が true のまま残っていることがある
         あとに置くと、そこに当てはまってリザルトBGMが鳴らなくなってしまう

       ※ GAME OVERも、同じ理由で いやいや関連より先に置く
         いやいやタイム中に「少し待ってみる」などで親の余裕が0になると、
         isTantrum が true のままGAME OVER画面になる
         あとに置くと「いやいや発生の結果を読んでいる最中」に当てはまり、
         GAME OVER BGMが鳴らなくなってしまう

       ※ いやいや関連の2つを、公園BGMより先に置くのが大事
         あとにすると「公園を探検している最中」にも当てはまってしまい、
         いやいや画面なのに公園BGMが鳴りだしてしまう

       ※ 「いやいや発生の結果を読んでいる最中」は
         currentEvent がまだ場所（すべり台など）のままで、
         isTantrum だけが true になっている状態
         ここでONに戻しても、わざと作った無音をこわさないように何も鳴らさない

       ※ 秘密の場所を、公園BGMより先に置くのが大事
         秘密の場所も「ゲーム中で、結果画面ではない」に当てはまってしまうので、
         あとに置くと、秘密の場所なのに公園BGMが鳴りだしてしまう
         （そのうえ、あとからこもれびの広場BGMも鳴ると2曲が重なってしまう）

       ※ 秘密の場所から出たあとにONへ戻したときは、
         currentEvent がもう 'secretSpot' ではないので公園BGMのほうへ進む
         こもれびの広場BGMが勝手に鳴りなおすことはない

       ※ サウンドOFFのまま秘密の場所へ入って、そこでONに戻したときは、
         まだ曲を一度も作っていないので、resumeSecretBgm() の中で
         新しく作って先頭から鳴りはじめる（公園BGMは鳴らない）

   ② 次に開いたときのために、ON/OFFを保存する
       localStorage は、ブラウザに小さなメモを残しておける保存場所
       ページを閉じても消えないので、次に開いたときも設定を思い出せる
*/
function applySoundEnabledChange() {
  if (soundEnabled.value) {
    if (titleEntered.value && !gameStarted.value) {
      resumeTitleBgm();
    } else if (gameStarted.value && currentEvent.value === 'goal') {
      resumeResultBgm();
    } else if (gameStarted.value && currentEvent.value === 'gameOver') {
      resumeGameOverBgm();
    } else if (gameStarted.value && currentEvent.value === 'tantrum') {
      resumeTantrumBgm();
    } else if (gameStarted.value && isTantrum.value) {
      // いやいや発生の結果カードを読んでいる最中（わざと無音）なので、何も鳴らさない
    } else if (gameStarted.value && currentEvent.value === 'secretSpot') {
      resumeSecretBgm();
    } else if (gameStarted.value && !isResultScene.value) {
      // 秘密の小道（ミニゲーム）もここ。こもれびの広場へ着くまでは公園BGMのまま
      resumeParkBgm();
    }
  } else {
    // OFFのときは pause() だけ（どこまで再生したかを覚えておく）
    // どの画面でも止まるように、ぜんぶの曲に声をかける
    // （pauseParkBgm() は、公園BGM1・BGM2の両方をまとめて止めてくれる）
    pauseTitleBgm();
    pauseParkBgm();
    pauseSecretBgm();
    pauseTantrumBgm();
    pauseResultBgm();
    pauseGameOverBgm();
  }

  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(soundStorageKey, String(soundEnabled.value));
  } catch {
    // ブラウザの設定で保存できないことがある
    // 保存できなくても、このページを開いているあいだのON/OFFは正常に動く
  }
}

/* 作業台（AudioContext）を入れておく箱

   null は「まだ作っていない」という意味
   AudioContext は作るのが重たいので、1個だけ作って、ずっと使い回す
   ※ ここで new AudioContext() をしないのが大事
     Nuxtはサーバー側でも一度このコードを読むが、
     サーバーには window も AudioContext も無いのでエラーになってしまう
*/
let audioContext: AudioContext | null = null;

/* 作業台を用意して返す（初めて音を鳴らすときだけ作る）

   音が出せないときは null を返すので、
   呼んだ側は「null なら何もしない」だけで済む
*/
function getAudioContext() {
  /* ここが効果音ON/OFFの「関所」

     効果音（decision・item・tantrum・goal・sunlight・branchBump・fallDown）は、
     どれも必ずこの関数を通る
     なので、ここで null を返すだけで、すべての効果音がまとめて止まる
     ゲーム処理のあちこちに if (soundEnabled.value) を書く必要はない

     効果音OFFのときは AudioContext も作らない
     （下の new AudioContext() の行まで、そもそもたどり着かない）
  */
  if (!import.meta.client || !soundEnabled.value) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    /* ブラウザは「ユーザーが操作する前」に音を鳴らすのを止めることがあり、
       そのとき作業台は suspended（お休み中）になっている
       resume() で起こすが、await はしない
       ここでゲームを待たせると、画面の切り替わりが音のせいで遅れてしまう */
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  } catch {
    // 音が使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* 音を1つだけ鳴らす、共通の関数

   frequency … 音の高さ（Hz）。数が大きいほど高い音。440ならピアノの「ラ」
   startTime … いつ鳴らしはじめるか（AudioContextの中の時計の時刻）
   duration  … 音の長さ（秒）
   volume    … 音の大きさ（0〜1）。今回はどれも0.1以下の控えめな値にしている
                （ここへ渡すのは効果音ごとの「もとの大きさ」で、
                  音量スライダーのぶんは、この関数の中でかけ算する）
   type      … 波の形。sine と triangle はどちらも丸くてやさしい音になる
   endFrequency … 指定すると、その高さまで音程がなめらかに変化する（省略可）

   ※ OscillatorNode は「1回鳴らしたら使い捨て」という決まりなので、
     鳴らすたびに新しく作る（作業台だけは使い回す）
*/
function playTone(frequency: number, startTime: number, duration: number, volume: number, type: OscillatorType = 'sine', endFrequency?: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  try {
    const oscillator = context.createOscillator(); // 音の発生源
    const gain = context.createGain(); // 音量つまみ

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // 音程を変化させる指定があるときだけ、なめらかに動かす
    if (endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    }

    /* 効果音の大きさにも、音量スライダーのぶんをかける

       BGMとまったく同じ割合をかけるので、スライダーを下げると
       BGMも効果音も、同じだけ小さくなる
       （効果音ごとの「もとの大きさ」のちがいは、かけ算なのでそのまま残る） */
    const effectVolume = getSoundVolume(volume);

    /* 0（＝ミュート）のときは鳴らさずに終わり

       ふだんは getAudioContext() が soundEnabled を見て止めてくれるが、
       下の exponentialRampToValueAtTime() は 0 を受け取れないので、
       ここでも念のため確かめている */
    if (effectVolume <= 0) {
      return;
    }

    /* 音量の動き（これが無いと、鳴りはじめと鳴り終わりに「ブツッ」と雑音が入る）
       ① ほぼ無音からはじめる
       ② 0.015秒かけて、すっと目的の音量まで上げる
       ③ そのあと、鳴り終わりに向かってゆっくり下げる

       ※ ①と③で 0 を使えないのは、exponentialRampToValueAtTime() が
         0 へ向かう計算をできないため（代わりに「ほぼ0」を使う）
       ※ ①と③の「ほぼ0」を effectVolume からの割合で出しているのが大事
         決まった数字（0.001 など）にすると、音量を下げたときに
         その数字のほうが大きくなってしまい、鳴り終わりで音が上がってしまう
    */
    const nearSilent = effectVolume * 0.02;

    gain.gain.setValueAtTime(nearSilent, startTime);
    gain.gain.exponentialRampToValueAtTime(effectVolume, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(nearSilent, startTime + duration);

    // 発生源 → 音量つまみ → スピーカー の順につなぐ
    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  } catch {
    // 音が鳴らなくても、ゲームは止めない
  }
}

/* ① コマンド決定音「ポン♪」
   700Hzの丸い音を0.09秒だけ。鋭くならないよう triangle にしている
*/
function playDecisionSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  playTone(700, context.currentTime, 0.09, 0.06, 'triangle');
}

/* ② アイテム発見音「キラリン♪」
   ラ → ミ → 高いソ と、明るい音を3つ short に重ねて上っていく

   ※ 決定音と同時に鳴ると聞き取りにくいので、0.06秒だけ後ろにずらす
     ゲーム処理は待たせず、鳴らす時刻だけをずらしているのがポイント
*/
function playItemSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime + 0.06;

  playTone(880, start, 0.12, 0.05, 'sine');
  playTone(1174.7, start + 0.07, 0.12, 0.05, 'sine');
  playTone(1568, start + 0.14, 0.16, 0.05, 'sine');
}

/* ③ いやいや発生音「ポヨヨン……」
   320Hzから170Hzへ、音程をするすると下げてしょんぼり感を出す
   怖い警告音にならないよう、やわらかい triangle を使う

   ※ 決定音・アイテム音のあとに聞こえるよう、0.12秒ずらす
*/
function playTantrumSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  playTone(320, context.currentTime + 0.12, 0.28, 0.07, 'triangle', 170);
}

/* ④ ゴール音「タタターン♪」
   ド → ミ → ソ → 高いド と上がっていく、短い明るいファンファーレ
   最後の「高いド」だけ長めに伸ばして、締めくくりらしくする
*/
function playGoalSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime;

  playTone(523.25, start, 0.14, 0.08, 'triangle'); // ド
  playTone(659.25, start + 0.12, 0.14, 0.08, 'triangle'); // ミ
  playTone(783.99, start + 0.24, 0.14, 0.08, 'triangle'); // ソ
  playTone(1046.5, start + 0.38, 0.42, 0.09, 'triangle'); // 高いド
}

/* ⑤ 木漏れ日を取った音「ピコッ♪」（ミニゲーム「秘密の小道」用）

   アイテム発見音「キラリン♪」を小さくしたような、高い音を2つだけ
   15秒のあいだに何度も鳴るので、キラリン♪より短く・小さくしてある
*/
function playSunlightSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime;

  playTone(1318.5, start, 0.08, 0.04, 'sine'); // 高いミ
  playTone(1760, start + 0.06, 0.12, 0.04, 'sine'); // 高いラ
}

/* ⑥ 枝に当たった音「ぽこっ」（ミニゲーム「秘密の小道」用）

   いやいや発生音と同じ「音程が下がる」形だが、ずっと短くして
   「ちょっとぶつかっただけ」に聞こえるようにしている
*/
function playBranchBumpSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  playTone(300, context.currentTime, 0.12, 0.05, 'triangle', 190);
}

/* ⑦ 転倒音「ヒュッ、ポテッ」（とつぜんのできごと「こうちゃんがころんだ」用）

   短い音を2つ、すきまなく続けて鳴らして「つまずいて、地面にすわりこむ」を表す
   ① ヒュッ … 少し高めの音から下がる（つまずいて足がすべった感じ）
   ② ポテッ … そのすぐあと、低めで丸い音（地面にぺたんとついた感じ）

   ぜんぶで0.26秒ほど。①より②を少しだけ大きくして、あとのほうに重みを置いている

   ※ 音量は、ほかの効果音より大きめの数字にしてある
     この音はほかの効果音（700〜1760Hz）よりずっと低い（260〜70Hz）
     人の耳は低い音ほど小さく感じるので、同じ数字にすると、これだけ聞こえにくくなる
     耳で聞いてそろうように、とくに低いほうの②を大きくしている
     （BGMの音量を曲ごとに変えているのと同じ考えかた）

   ※ 「ドスン！」のような重い衝撃音にはしない
     小さい子が芝生でポテッところんだくらいの、やわらかい音にしたいので、
     角のない triangle だけを使い、音量も鳴りびびくほどには上げていない

   ※ 少し待ってから鳴らしはじめる（fallDownSoundDelay）
     この音が鳴るのは「次へ」を押して、ころんだ画面へ切りかわった瞬間
     すぐ鳴らすと、押したときの決定音「ポン♪」と重なってしまい、
     画面が切りかわるより前に転ぶ音だけが先に聞こえてしまう
     決定音が鳴り終わり、ころんだ画面が出てから鳴るように、間を空けてある
     （アイテム音0.06秒・いやいや発生音0.12秒と同じ考えかたで、それより長めにしている）
*/

/* 転倒音を鳴らしはじめるまでの待ち時間（秒）
   ここの数字だけを書きかえれば、間の長さを調整できる */
const fallDownSoundDelay = 0.45;

function playFallDownSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime + fallDownSoundDelay;

  playTone(260, start, 0.1, 0.12, 'triangle', 150); // ① ヒュッ
  playTone(120, start + 0.11, 0.15, 0.18, 'triangle', 70); // ② ポテッ
}

/* ⑧ 葉っぱのガサガサ音「ササッ、ガサッ」（とつぜんのできごと「テントウムシ発見！」用）

   ここまでの効果音（①〜⑦）は、どれも playTone() で「決まった形の波」を鳴らしてきた
   音程のある「ポン♪」「ポテッ」は、それで作れる

   でも、葉っぱがこすれる音には音程が無い
   「ドレミ」のどれでもない、ザラザラした音なので、波の形では作れない
   そこで、この音だけは作りかたを変えている

   ・音程のある音 … きれいにくり返す波（playTone／OscillatorNode）
   ・ガサガサ音   … でたらめな数字の列（ホワイトノイズ／AudioBufferSourceNode）

   でたらめな数字をそのまま鳴らすと「シャーッ」というテレビの砂あらしの音になり、
   耳にきつく、葉っぱには聞こえない
   そこで、フィルター（BiquadFilterNode）で高い音を削って、
   やわらかい葉ずれの音にしている

   ぜんぶで0.42秒ほど。短い音のかたまりを2つ続けて「葉っぱの中で何かが動いた」を表す
   ① ササッ … 小さめ。葉っぱがかすかにゆれた
   ② ガサッ … 少し大きめ。テントウムシが顔を出した

   ①②はどちらも、1回の音ではなく短い粒をいくつか重ねて作っている
   （くわしくは playLadybugRustleSound() のコメント）

   ※ 音量は、ほかの効果音より大きめの数字にしてある
     フィルターで高い音を削っているぶん、音のエネルギーが減って小さく聞こえるため
     （転倒音を大きめにしてあるのと同じ、耳で聞いてそろえるための調整）
*/

/* ガサガサ音を鳴らしはじめるまでの待ち時間（秒）

   転倒音（fallDownSoundDelay）とまったく同じ理由・同じ長さにしてある
   この音が鳴るのは「次へ」を押して、テントウムシの画面へ切りかわった瞬間
   すぐ鳴らすと、押したときの決定音「ポン♪」と重なってしまうため、
   決定音が鳴り終わってから鳴るようにしてある */
const ladybugRustleDelay = 0.45;

/* ガサガサ音を1つだけ鳴らす（①ササッ と ②ガサッ で、2回呼ぶ）

   startTime … いつ鳴らしはじめるか（AudioContextの中の時計の時刻）
   duration  … 音の長さ（秒）
   volume    … 音の大きさ（0〜1）
   filterFrequency … この高さ（Hz）より上を削る。小さいほど、こもったやわらかい音になる
*/
function playRustleNoise(startTime: number, duration: number, volume: number, filterFrequency: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  /* 効果音の大きさにも、音量スライダーのぶんをかける（playTone と同じ） */
  const effectVolume = getSoundVolume(volume);

  /* 0（＝ミュート）のときは鳴らさずに終わり
     下の exponentialRampToValueAtTime() は 0 を受け取れないため */
  if (effectVolume <= 0) {
    return;
  }

  try {
    /* ① でたらめな数字の列（ホワイトノイズ）を作る

       createBuffer(チャンネル数, 数字の個数, 1秒あたりの個数)
       「1秒あたりの個数 × 秒数」で、必要な個数が決まる
       中身を -1〜1 のでたらめな数字で埋めると、ザラザラした音になる

       ただし、ただの乱数をそのまま鳴らすと「スーッ」と平らな音になってしまう
       本物の葉ずれは、葉と葉が触れる細かい「カサ」が
       不規則に連なって「ガサガサ」に聞こえている

       そこで、全体にもう一段おおざっぱなゆれ（roughness）をかけている
       ・rough … ゆっくり上下する、0.15〜1 のあいだのでたらめな倍率
       ・これを乱数にかけ算すると、音の粒が「濃いところ・薄いところ」に分かれる
       この濃淡が、葉っぱがこすれるときの「ガサッ、ガサッ」というざらつきになる

       ゆれを何サンプルごとに作りなおすかが roughStep
       細かすぎると元のホワイトノイズに戻ってしまい、
       粗すぎるとブツブツ途切れた音になるので、
       1秒あたりの個数の 1/900（44100Hzなら約49個ぶん）にしている */
    const frameCount = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);

    const roughStep = Math.max(1, Math.floor(context.sampleRate / 900));
    let rough = 1;

    for (let i = 0; i < frameCount; i += 1) {
      // roughStep 個ごとに、ゆれの倍率を新しく決めなおす
      if (i % roughStep === 0) {
        rough = 0.15 + Math.random() * 0.85;
      }

      data[i] = (Math.random() * 2 - 1) * rough;
    }

    const noise = context.createBufferSource(); // 音の発生源（でたらめな数字を読み上げる）
    const filter = context.createBiquadFilter(); // 高い音を削る係
    const highpass = context.createBiquadFilter(); // 低い音を削る係
    const gain = context.createGain(); // 音量つまみ

    noise.buffer = buffer;

    /* ② 高すぎる「シャー」を削る

       lowpass ＝ 低い音は通して、高い音は通さない、という種類のフィルター
       frequency より上がだんだん小さくなるので、
       ここの数字を下げるほど、こもったやわらかい音になる */
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrequency, startTime);

    /* ③ 低すぎる「ゴロゴロ」も削る

       乱数には、耳に聞こえないほど低い音まで入っている
       そこが残っていると、軽い葉ずれではなく
       「ボフッ」とこもった重い音になってしまう
       highpass ＝ 高い音は通して、低い音は通さない、で下を切り、
       葉っぱがこすれる軽さを出している */
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(700, startTime);

    /* ④ 音量の動き（playTone と同じ考えかた）
       ① ほぼ無音からはじめて ② すっと上げて ③ 鳴り終わりに向かって下げる

       葉っぱがこすれる音は「パッと鳴って、すっと消える」ので、
       上げるところ（0.01秒）を playTone（0.015秒）より短くしている */
    const nearSilent = effectVolume * 0.02;

    gain.gain.setValueAtTime(nearSilent, startTime);
    gain.gain.exponentialRampToValueAtTime(effectVolume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(nearSilent, startTime + duration);

    // 発生源 → 高い音を削る → 低い音を削る → 音量つまみ → スピーカー の順につなぐ
    noise.connect(filter);
    filter.connect(highpass);
    highpass.connect(gain);
    gain.connect(context.destination);

    noise.start(startTime);
    noise.stop(startTime + duration);
  } catch {
    // 音が鳴らなくても、ゲームは止めない
  }
}

function playLadybugRustleSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime + ladybugRustleDelay;

  /* 「ササッ」も「ガサッ」も、1回の音ではなく小さな音の集まりにしている

     葉っぱがゆれるときは、葉と葉が何度も触れあうので、
     1粒だけ鳴らすと「ポッ」と単発に聞こえてしまう
     短い粒を少しずつずらして重ねると、
     粒どうしがつながって「ガサガサ」と連なって聞こえる

     数字は順に（鳴らしはじめ, 長さ, 大きさ, 高い音を削る位置）

     ① ササッ … 小さめ・高めの粒を3つ。かすかに葉がゆれた
     ② ガサッ … 大きめ・低めの粒を4つ。テントウムシが顔を出した

     粒の長さも間かくもそろえていないのは、
     きれいに等間かくだと機械のように聞こえてしまうため */

  // ① ササッ
  playRustleNoise(start, 0.05, 0.11, 2600);
  playRustleNoise(start + 0.035, 0.06, 0.14, 2100);
  playRustleNoise(start + 0.085, 0.05, 0.09, 2400);

  // ② ガサッ（①のあと、少しだけ間を空けてから）
  playRustleNoise(start + 0.2, 0.07, 0.18, 1700);
  playRustleNoise(start + 0.245, 0.08, 0.24, 1300);
  playRustleNoise(start + 0.305, 0.07, 0.19, 1500);
  playRustleNoise(start + 0.355, 0.06, 0.12, 1200);
}

/* ============================================================
   音声ファイルの効果音（HTML Audio）
   ＝ 救急車のサイレン・犬の鳴き声・噴水の音

   ここまでの効果音（①〜⑧）は、どれも Web Audio API で
   「その場で音を計算して作る」やり方だった
   「ポン♪」や「ポテッ」のような短くて単純な音なら、それで作れる

   でも、この3つは計算では作れない
   ・救急車のサイレン … ピーポーピーポーと、本物らしい音色が必要
   ・犬の鳴き声       … 動物の声は、波の形では真似できない
   ・噴水の音         … 水しぶきが何千粒も重なっている音

   そこで、この3つだけは録音済みの音声ファイルを鳴らす
   ＝ BGMと同じ HTMLAudioElement（new Audio）を使う

   ・計算して作る音（①〜⑧）… Web Audio API（音声ファイルは不要）
   ・録音を鳴らす音（この3つ・BGM）… HTMLAudioElement

   ※ 効果音なので、BGMとちがって loop はしない（1回鳴って終わり）
   ============================================================ */

/* 音声ファイルの効果音の音量（0＝無音、1＝そのままの大きさ）

   BGMと同じで、volume は「もとの音源を何倍にするか」なので、
   同じ数字にしても、録音そのものが大きい音は大きく聞こえてしまう
   耳で聞いてそろうように、音源ごとに数字を分けてある
   （音を差しかえたときは、ここの数字で調整する）

   ※ 計算して作る効果音（0.05〜0.24あたり）の数字とは、くらべなくてよい
     あちらは波の大きさをこちらで決めているが、
     こちらは「録音がもともとどれくらいの大きさか」で必要な数字が変わるため
*/

/* 救急車のサイレンの音量 */
const ambulanceSirenVolume = 0.2;

/* 犬の鳴き声の音量 */
const dogBarkVolume = 0.2;

/* 噴水の音量 */
const fountainVolume = 0.2;

/* 音声ファイルの効果音を鳴らしはじめるまでの待ち時間（ミリ秒）

   転倒音（fallDownSoundDelay）・ガサガサ音（ladybugRustleDelay）と
   まったく同じ理由・同じ長さにしてある
   この音が鳴るのは「次へ」を押して、できごとの画面へ切りかわった瞬間
   すぐ鳴らすと、押したときの決定音「ポン♪」と重なってしまうため、
   決定音が鳴り終わってから鳴るようにしてある

   ※ 単位がちがうので、数字の見え方も別もの
     あちらは Web Audio API の時計を使うので秒（0.45）だが、
     こちらは setTimeout() で待つのでミリ秒（450）になる
     どちらも同じ0.45秒で、間の長さはそろえてある

   ※ 音源の頭に無音が入っていると、そのぶん鳴りだしが遅く聞こえる
     決定音と重なる・間が空きすぎると感じたら、ここの数字だけを書きかえればよい
*/
const fileSoundDelay = 450;

/* 音声ファイルの効果音を入れておく箱

   null は「まだ作っていない」という意味
   ※ ここで new Audio(...) をしないのが大事
     Nuxtはサーバー側でも一度このコードを読むが、
     サーバーには Audio が無いのでエラーになってしまう
     （BGMの parkBgm などと、まったく同じ理由）
*/
let ambulanceSirenSe: HTMLAudioElement | null = null;
let dogBarkSe: HTMLAudioElement | null = null;
let fountainSe: HTMLAudioElement | null = null;

/* 「あとで鳴らす」の予約票

   null は「予約していない」という意味
   BGMの予約票（parkBgmTimer など）と同じ役目で、
   ページを離れるときに取り消すために取っておく

   ※ 予約は1つだけ持てばよい
     とつぜんのできごとは一度に1つしか起きないので、
     3つの音が同時に予約されることはない
*/
let fileSoundTimer: ReturnType<typeof setTimeout> | null = null;

/* 「あとで鳴らす」の予約を取り消す

   残っていると、ページを離れたあとに鳴りだしてしまう
   （→ onUnmounted で呼んでいる）
*/
function cancelFileSound() {
  if (fileSoundTimer === null) {
    return;
  }

  clearTimeout(fileSoundTimer);
  fileSoundTimer = null;
}

/* 音声ファイルの効果音を鳴らす（3つとも、この1つの関数を通す）

   src        … 鳴らす音声ファイルの場所（例：'/audio/sfx/dog-bark.mp3'）
   baseVolume … その音源の音量（上で音源ごとに決めている数字）
   cached     … すでに作ってあるもの（初めてのときは null）
   返す値     … 今回使った（＝これから覚えておく）もの

   ■ なぜ「箱」をやりとりするのか
     new Audio() は、そのたびに mp3 を読み込みなおす
     同じ音を鳴らすたびに作っていると、読み込みが積み上がって
     だんだん重くなり、鳴りはじめも遅れてしまう
     そこで、一度作ったものは覚えておいて、2回目からは作りなおさずに使う
     （BGMの get〜Bgm() と同じ考えかた）

   ■ サウンドOFF・音量0%のときは鳴らさない
     計算して作る効果音は getAudioContext() が止めてくれるが、
     こちらはその仕組みを通らないので、自分で見る必要がある
     ※ 音量0%のときは getSoundVolume() が 0 を返すので、
       volume に 0 を入れても鳴らないが、mp3の読み込みだけが起きてしまう
       それも起きないように、鳴らす前に確かめている

   ■ 少し待ってから鳴らす（fileSoundDelay）
     決定音「ポン♪」と重ならないように、間を空けてから鳴らしはじめる
     待たせるのは「音を鳴らすこと」だけで、
     画面の切り替えやゲームの処理は、いつもどおりすぐ進む
     （BGMの playParkBgmSoon() と同じ考えかた）

     ※ new Audio() のほうは待たせず、ここですぐ作る
       呼んだ側へ箱を返すのは「待ち時間のあと」ではできないため
       （待っているあいだに mp3 の読み込みが進むので、鳴りだしも速くなる）
*/
function playFileSound(src: string, baseVolume: number, cached: HTMLAudioElement | null) {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return cached;
  }

  // サウンドOFFのときは、mp3の読み込みもしない
  if (!soundEnabled.value) {
    return cached;
  }

  /* 音量0%（＝ミュート）のときも、mp3の読み込みはしない

     ここで見ているのは「いま鳴らす音の大きさ」ではなく、
     「そもそも鳴らす必要があるか」だけ
     実際に volume へ入れる数字は、待ち時間のあとで計算しなおす */
  if (getSoundVolume(baseVolume) <= 0) {
    return cached;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    const sound = cached ?? new Audio(src);

    // 前の予約が残っていたら取り消す（二重に鳴らさないため）
    cancelFileSound();

    fileSoundTimer = setTimeout(() => {
      fileSoundTimer = null;

      /* 待っているあいだにサウンドをOFF・音量0%にされていたら、もう鳴らさない
         （画面が切りかわってすぐミュートを押された場合など）

         ※ 音量は、この待ち時間のあとに入れなおす
           待っているあいだにスライダーを動かされていても追いつくように、
           鳴らす直前のいまの設定で計算しなおしている */
      if (!soundEnabled.value) {
        return;
      }

      const delayedVolume = getSoundVolume(baseVolume);

      if (delayedVolume <= 0) {
        return;
      }

      try {
        sound.volume = delayedVolume;

        /* 必ず音の先頭から鳴らす

           currentTime は「いま音のどこを再生しているか」を秒で表したもの
           前に鳴らし終わったものは最後まで進んだままなので、
           0 に戻さないと2回目から鳴らなくなってしまう
           （途中でもう一度呼ばれたときも、頭から鳴りなおす） */
        sound.currentTime = 0;

        // play() は「再生できたかどうか」をあとから知らせる形（Promise）になっている
        // ブラウザに止められることがあるので、失敗しても何もしないでおく
        sound.play().catch(() => {});
      } catch {
        // 音が鳴らなくても、ゲームは止めない
      }
    }, fileSoundDelay);

    // 次に呼ばれたときは作りなおさずに使えるよう、呼んだ側へ返して覚えてもらう
    return sound;
  } catch {
    // 音が鳴らなくても、ゲームは止めない
    return cached;
  }
}

/* とつぜんのできごとの効果音を鳴らす（できごとごとの振り分け役）

   「どのできごとで、どの音を鳴らすか」をこの1か所にまとめてある
   呼ぶ側（goToNextPlace）は、できごとの名前を渡すだけでよい

   ・emergencySiren … 救急車のサイレン（音声ファイル）
   ・dog            … 犬の鳴き声    （音声ファイル）
   ・fountain       … 噴水の音      （音声ファイル）
   ・ladybug        … 葉っぱのガサガサ音（Web Audio APIで作る音）
   ・fallDown       … 転倒音「ヒュッ、ポテッ」（Web Audio APIで作る音）

   音の作りかたは2通りあるが、呼ぶ側はそれを気にしなくてよいようにしている
   （音を差しかえて作りかたが変わっても、直すのはここだけで済む）

   ※ 音声ファイルのほうは、鳴らしたものを箱へ覚えておく
     次に同じできごとが起きたとき、作りなおさずに使うため
*/
function playSuddenEventSound(event: GameEvent) {
  if (event === 'emergencySiren') {
    ambulanceSirenSe = playFileSound('/audio/sfx/ambulance-siren.mp3', ambulanceSirenVolume, ambulanceSirenSe);
    return;
  }

  if (event === 'dog') {
    dogBarkSe = playFileSound('/audio/sfx/dog-bark.mp3', dogBarkVolume, dogBarkSe);
    return;
  }

  if (event === 'fountain') {
    fountainSe = playFileSound('/audio/sfx/fountain.mp3', fountainVolume, fountainSe);
    return;
  }

  if (event === 'ladybug') {
    playLadybugRustleSound();
    return;
  }

  if (event === 'fallDown') {
    playFallDownSound();
  }
}

/* ============================================================
   公園のBGM（HTML Audio）

   効果音とBGMで、仕組みをわざと分けている
   ・効果音 … 「ポン♪」のような短い音。決まった形の波を計算して作れるので
              Web Audio API で その場で作る（音声ファイルは不要）
   ・BGM   … 何十秒もある曲。計算では作れないので、
              録音済みの park-bgm.mp3 を再生する

   曲を再生するだけなら、音声ファイルを鳴らす専用の部品
   HTMLAudioElement（new Audio）を使うのがいちばん簡単
   ============================================================ */

/* BGMの音量（0＝無音、1＝そのままの大きさ）

   volume は「もとの音源を何倍にするか」なので、
   同じ数字にしても、録音そのものが大きい曲は大きく聞こえてしまう
   公園BGMがタイトルBGMより大きく聞こえたので、
   耳で聞いてそろうように、曲ごとに数字を分けている
   （音を差しかえたときは、下に並んでいる曲ごとの数字で調整する）

   ※ 効果音（0.05〜0.09あたり）とは仕組みがちがうので、数字の見え方も別もの
     効果音は一瞬だけ鳴るが、BGMはずっと後ろで流れ続けるため、
     大きくしすぎると会話や効果音が聞こえにくくなる
*/

/* タイトルBGMの音量 */
const titleBgmVolume = 0.22;

/* 公園BGMの音量（タイトルBGMより録音が大きいので、少し下げてそろえる） */
const parkBgmVolume = 0.16;

/* 午前後半（10:30以降）の公園BGMの音量

   音源そのものの録音の大きさがちがうので、BGM1とは別の数字にしてある
   （ひとまずBGM1と同じ 0.16 にしてあるが、
     聞きくらべて大きい・小さいと感じたら、ここだけ書きかえればよい） */
const parkBgm2Volume = 0.16;

/* いやいやBGMの音量（ひとまず公園BGMと同じにしてある）
   大きい・小さいと感じたら、ここの数字だけを書きかえれば調整できる */
const tantrumBgmVolume = 0.17;

/* リザルトBGMの音量（ひとまず公園BGMと同じにしてある）
   大きい・小さいと感じたら、ここの数字だけを書きかえれば調整できる */
const resultBgmVolume = 0.17;

/* GAME OVER BGMの音量（ひとまずリザルトBGMと同じ 0.17 にしてある）

   リザルトBGMとは別の曲なので、音源そのものの録音の大きさもちがう
   そのため resultBgmVolume を使いまわさず、専用の数字にしてある
   大きい・小さいと感じたら、ここの数字だけを書きかえれば調整できる
   （例：少し小さくしたいなら 0.15） */
const gameOverBgmVolume = 0.17;

/* こもれびの広場BGMの音量

   音源そのものの録音の大きさがちがうので、公園BGMとは別の数字にしてある
   （ひとまず公園BGMと同じ 0.16 にしてあるが、
     聞きくらべて大きい・小さいと感じたら、ここだけ書きかえればよい） */
const secretBgmVolume = 0.16;

/* 公園BGMを入れておく箱

   null は「まだ作っていない」という意味
   ※ ここで new Audio(...) をしないのが大事
     Nuxtはサーバー側でも一度このコードを読むが、
     サーバーには Audio が無いのでエラーになってしまう
*/
let parkBgm: HTMLAudioElement | null = null;

/* 公園BGMを用意して返す（初めて必要になったときだけ作る）

   ※ ここでは soundEnabled を見ない
     サウンドをOFFにした瞬間は soundEnabled が false になっているが、
     そのとき「鳴っているBGMを止める」ために、この関数が必要になるため
     （ここでnullを返すと、止めたいのに止められなくなってしまう）
*/
function getParkBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!parkBgm) {
      // public/audio/park-bgm.mp3 は、URLでは /audio/park-bgm.mp3 になる
      parkBgm = new Audio('/audio/park-bgm.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      parkBgm.loop = true;

      // volume … 音の大きさ（上の parkBgmVolume で決めている）
      parkBgm.volume = getSoundVolume(parkBgmVolume);
    }

    return parkBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* 午前後半（10:30以降）の公園BGMを入れておく箱

   つくりは上の公園BGM（parkBgm）とまったく同じで、鳴らす曲だけがちがう
   null は「まだ作っていない」という意味
*/
let parkBgm2: HTMLAudioElement | null = null;

/* 午前後半の公園BGMを用意して返す（初めて必要になったときだけ作る）

   ※ getParkBgm() と同じ作りにしてある
     ここでも soundEnabled は見ない
     （OFFにした瞬間に「鳴っている曲を止める」ために必要になるため）
*/
function getParkBgm2() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!parkBgm2) {
      // public/audio/park-bgm2.mp3 は、URLでは /audio/park-bgm2.mp3 になる
      parkBgm2 = new Audio('/audio/park-bgm2.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      parkBgm2.loop = true;

      // volume … 音の大きさ（上の parkBgm2Volume で決めている）
      parkBgm2.volume = getSoundVolume(parkBgm2Volume);
    }

    return parkBgm2;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* 公園BGMが「午前後半の曲」に変わる時刻（分に直したもの）

   10 * 60 + 30 ＝ 630 で、ゲーム内時間の 10:30 のこと
   （currentMinutes と同じ「分」のものさしにそろえてある）
   切り替わる時刻を変えたくなったら、ここの数字だけを書きかえればよい
*/
const parkBgm2StartMinutes = 10 * 60 + 30;

/* いまは「午前後半の曲（BGM2）」を使う時間かどうか

   ゲーム内の時計を見て、10:30を過ぎていたら true（＝BGM2）
   まだ10:30より前なら false（＝BGM1）

   ※ 12:00を過ぎるとゴールで、公園BGMはどちらも鳴らさない
     （goToGoal() で止める）ので、ここでは12:00のことを考えなくてよい
*/
function shouldUseParkBgm2() {
  return currentMinutes.value >= parkBgm2StartMinutes;
}

/* いまの時間に合う公園BGMを返す
   ＝「時計を見て、どちらの曲を使うかを選んでいる」ところ

   09:00〜10:29 … park-bgm.mp3  （午前前半）
   10:30〜      … park-bgm2.mp3 （午前後半）

   曲を選ぶ仕事をこの1か所にまとめてあるので、
   呼ぶ側（playParkBgm など）は、どちらの曲かを気にしなくてよい
*/
function getCurrentParkBgm() {
  return shouldUseParkBgm2() ? getParkBgm2() : getParkBgm();
}

/* いまの時間に合う公園BGMの音量を返す

   曲ごとに録音の大きさがちがうので、
   「どの曲を鳴らすか」と「どの音量で鳴らすか」は、いつもセットで選ぶ
*/
function getCurrentParkBgmVolume() {
  return shouldUseParkBgm2() ? parkBgm2Volume : parkBgmVolume;
}

/* いま鳴らしている公園BGM（鳴らしていないときは null）

   「BGM1・BGM2のどちらを鳴らしているか」を覚えておくための箱
   これがあると、10:30を過ぎたときに
   ・まだBGM1のまま → BGM2へ切り替える
   ・すでにBGM2     → 何もしない（押すたびに曲が頭から鳴りなおさない）
   を見わけられる
*/
let activeParkBgm: HTMLAudioElement | null = null;

/* BGMがフェードインしきるまでの長さ（ミリ秒）
   1000 で1秒かけて、無音から ふだんの音量まで上がる
   タイトルBGMと公園BGMで同じ値を使う */
const bgmFadeInDuration = 1000;

/* フェードインの途中経過を進める係の番号（していないときは null） */
let bgmFadeTimer: ReturnType<typeof setInterval> | null = null;

/* いまフェードインの最中にある曲（していないときは null）
   途中でやめたときに「どの曲の音量を戻すか」が分かるように覚えておく */
let fadingBgm: HTMLAudioElement | null = null;

/* その曲の「曲ごとの音量」（＝どこまで上げたら終わりか、のもとの数字）

   ここに入れるのは、音量スライダーのぶんをかける前の数字
   フェードの途中でスライダーを動かされても追いつけるように、
   実際の大きさは1回ごとに getSoundVolume() で計算しなおす */
let fadingBgmBaseVolume = 0;

/* BGMをフェードインさせる（音量を0から少しずつ上げる）

   HTML Audio には「だんだん大きくする」機能が無いので、
   0.05秒ごとに volume を少しずつ足していって、自分で作る

   いきなり ふだんの音量で始まると唐突に聞こえるので、
   すっと入ってくるようにするための演出

   ※ タイトルBGM・公園BGM・こもれびの広場BGM・いやいやBGM・リザルトBGM・GAME OVER BGMの
     どれにも使える
     2曲が同時に鳴ることはない（切り替えるときは必ず前の曲を止める）ので、
     フェインの係は1つだけ用意しておけば足りる

   bgm          … フェードインさせたい曲
   targetVolume … 上がりきったときの音量（曲ごとにちがう）
*/
function startBgmFadeIn(bgm: HTMLAudioElement, targetVolume: number) {
  // 前のフェードが残っていたら止める（音量の取り合いにならないように）
  cancelBgmFade();

  if (!import.meta.client) {
    return;
  }

  const stepMs = 50; // 何ミリ秒ごとに音量を上げるか
  const totalSteps = Math.ceil(bgmFadeInDuration / stepMs);
  let doneSteps = 0;

  bgm.volume = 0; // まずは無音から
  fadingBgm = bgm;
  fadingBgmBaseVolume = targetVolume;

  bgmFadeTimer = setInterval(() => {
    doneSteps += 1;

    // 進み具合（0 → 1）を、そのまま音量の割合として使う
    const ratio = doneSteps / totalSteps;

    /* 上がりきったときの大きさは、1回ごとに計算しなおす

       こうしておくと、フェードの途中で音量スライダーを
       100% → 30% のように動かしても、その場から新しい大きさに追いつく
       （古い目標をつかんだまま、100%相当まで上がってしまうことがない） */
    const goalVolume = getSoundVolume(fadingBgmBaseVolume);

    try {
      bgm.volume = ratio >= 1 ? goalVolume : goalVolume * ratio;
    } catch {
      // 何もしない
    }

    // ふだんの音量まで上がりきったら終わり
    if (ratio >= 1) {
      cancelBgmFade();
    }
  }, stepMs);
}

/* フェードインを途中でやめる

   ※ やめたあとは volume を ふだんの大きさへ戻しておく
     0.1 まで上がった途中で止めると、次に鳴らすとき小さいままになってしまう
*/
function cancelBgmFade() {
  if (bgmFadeTimer === null) {
    return;
  }

  clearInterval(bgmFadeTimer);
  bgmFadeTimer = null;

  if (fadingBgm) {
    try {
      fadingBgm.volume = getSoundVolume(fadingBgmBaseVolume);
    } catch {
      // 何もしない
    }

    fadingBgm = null;
    fadingBgmBaseVolume = 0;
  }
}

/* 「いまの時間に合う公園BGM」を最初から再生する（ゲームを始めたとき用）

   どちらの曲を鳴らすかは、そのときのゲーム内時間で決まる
   ・10:30より前 … park-bgm.mp3  （BGM1）
   ・10:30以降   … park-bgm2.mp3 （BGM2）

   currentTime は「いま曲のどこを再生しているか」を秒で表したもの
   0 を入れると曲の先頭に戻る
*/
function playParkBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getCurrentParkBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  // 時計を見て、いま鳴らすべき公園BGMを選ぶ
  const bgm = getCurrentParkBgm();

  if (!bgm) {
    return;
  }

  /* BGM1とBGM2が重なって鳴らないように、いったん両方止めてから始める
     （鳴っていない曲に「止めて」と言っても、何も起きないだけなので安全） */
  stopParkBgm();

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    // いま鳴らしている曲として覚えておく（10:30の切り替え判定に使う）
    activeParkBgm = bgm;

    // 無音から少しずつ大きくしていく（音量も、選んだ曲に合わせる）
    startBgmFadeIn(bgm, getCurrentParkBgmVolume());
    // play() は「再生できたかどうか」をあとから知らせる形（Promise）になっている
    // 自動再生をブラウザに止められることがあるので、失敗しても何もしないでおく
    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* 公園BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   1000 で1秒。ここだけ書きかえれば、間の長さを調整できる */
const parkBgmStartDelay = 700;

/* 「あとで鳴らす」の予約票

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを control用に取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let parkBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* 公園BGMを「少し待ってから」最初から鳴らす

   「このおやつで公園へ行く！」を押した瞬間にいきなり曲が始まると、
   決定音「ポン♪」が鳴りはじめの曲にかき消されてしまい、
   タイトルBGMからの切り替わりも唐突に聞こえる
   そこで少しだけ間を空けて、決定音が鳴り終わってから曲を始める

   ※ 待たせるのは「音を鳴らすこと」だけ
     画面の切り替えやゲームの処理は、いつもどおりすぐ進む

   ※ BGM1とBGM2のどちらを鳴らすかは、待ち時間が終わったとき（700ms後）に決まる
     実際に鳴らす playParkBgm() が、そのときの時計を見て選ぶため
     たとえば、いやいやが終わったのが10:40なら、BGM1ではなくBGM2から始まる
*/
function playParkBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelParkBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  parkBgmTimer = setTimeout(() => {
    parkBgmTimer = null;

    /* 待っているあいだに画面が変わっていたら、もう鳴らさない
       （すぐ「もう一度あそぶ」でタイトルへ戻った、
         ゴールやGAME OVERになった、などの場合） */
    if (!gameStarted.value || isResultScene.value) {
      return;
    }

    playParkBgm();
  }, parkBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelParkBgmStart() {
  if (parkBgmTimer === null) {
    return;
  }

  clearTimeout(parkBgmTimer);
  parkBgmTimer = null;
}

/* 公園BGMを「続きから」再生する（サウンドをONに戻したとき用）

   playParkBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす

   ※ ここでも「いまの時間に合う曲」を選びなおす
     10:20でサウンドOFFにして、音を消したまま10:40まで進めてからONに戻したときは、
     BGM1の続きではなく、BGM2を先頭から鳴らす
     （音を消しているあいだに、午前後半に入っているため）
*/
function resumeParkBgm() {
  if (!soundEnabled.value) {
    return;
  }

  // 時計を見て、いま鳴らすべき公園BGMを選ぶ
  const bgm = getCurrentParkBgm();

  if (!bgm) {
    return;
  }

  /* OFFにする前と曲が変わっているときは、「続き」ではなく最初から鳴らす
     （曲を選んで先頭から鳴らす仕事は playParkBgm() にまかせる）

     ※ activeParkBgm が null のとき（その曲をまだ一度も鳴らしていない）も、こちら
     ※ 同じ曲のままのときは下へ進み、止めた位置からそのまま続きが鳴る */
  if (activeParkBgm !== bgm) {
    playParkBgm();
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* 公園BGMを1曲だけ一時停止する（下の pauseParkBgm() の中身）

   まだ作っていない（null＝一度も鳴らしていない）曲には、何もしなくてよい
*/
function pauseOneParkBgm(bgm: HTMLAudioElement | null) {
  if (!bgm) {
    return;
  }

  try {
    bgm.pause();
  } catch {
    // 何もしない
  }
}

/* 公園BGMを一時停止する（どこまで再生したかは覚えたまま）

   pause() は「その場で止める」だけなので、
   もう一度 play() すると、止めたところから続きが鳴る

   ※ BGM1・BGM2の両方に声をかける
     どちらの曲が鳴っている時間帯でも、サウンドOFFで確実に止まるようにするため

   ※ currentTime（どこまで鳴らしたか）はリセットしない
     activeParkBgm も、そのまま覚えておく
     サウンドをONに戻したとき、同じ曲なら止めた位置から続けられるようにするため
*/
function pauseParkBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  // （こうしないと、次に再開したとき小さい音のままになる）
  cancelBgmFade();

  pauseOneParkBgm(parkBgm);
  pauseOneParkBgm(parkBgm2);
}

/* 公園BGMを1曲だけ完全に止める（下の stopParkBgm() の中身）

   まだ作っていない（null＝一度も鳴らしていない）曲には、何もしなくてよい
*/
function stopOneParkBgm(bgm: HTMLAudioElement | null) {
  if (!bgm) {
    return;
  }

  try {
    bgm.pause();
    bgm.currentTime = 0;
  } catch {
    // 何もしない
  }
}

/* 公園BGMを完全に止める（次はまた最初から鳴るようにする）

   pause() で止めるだけだと、次に遊ぶとき曲の途中から始まってしまう
   currentTime = 0 で先頭に戻しておく

   ※ BGM1・BGM2の両方を止める
     ゴール・GAME OVER・もう一度あそぶ・いやいや発生のどれでも、
     そのときどちらの曲が鳴っていても、確実に止まってほしいため
*/
function stopParkBgm() {
  /* 「あとで鳴らす」の予約も取り消す

     ※ かならず曲を止める処理より前に置くこと
       予約だけして、まだ曲を作っていない状態のことがあるため
       （公園へ行った直後にゴールした、など）
       あとに置くと、取り消せずに あとから鳴りだしてしまう */
  cancelParkBgmStart();

  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  stopOneParkBgm(parkBgm);
  stopOneParkBgm(parkBgm2);

  // 「いま鳴らしている曲」も無し（null）に戻す
  activeParkBgm = null;
}

/* 時間に合わせて、公園BGMをBGM1からBGM2へ切り替える

   「次の場所を選ぶ」を押したとき（goToNextPlace）に呼ぶ

   わざと「10:30になった瞬間」ではなく、
   「10:30を過ぎたあと、次の場面へ進むとき」に切り替えている
   結果カードを読んでいる途中で曲が変わると唐突に感じるので、
     午前前半の章 → 行動の結果 → 午前後半の章
   という自然な流れになるようにするため

   やることは3つだけ
   ・まだ10:30より前         → 何もしない（BGM1のまま）
   ・すでにBGM2を鳴らしている → 何もしない（押すたびに頭から鳴りなおさない）
   ・10:30を過ぎたのにBGM1    → BGM1を止めて、少し間を空けてからBGM2へ
*/
function switchParkBgmForCurrentTime() {
  // まだ午前前半（10:30より前）なら、BGM1のままでよい
  if (!shouldUseParkBgm2()) {
    return;
  }

  /* いまBGM1を鳴らしているときだけ、切り替えの出番

     ・activeParkBgm が parkBgm2 … すでに切り替え済みなので何もしない
       （これが無いと「次の場所を選ぶ」を押すたびにBGM2が頭から鳴りなおしてしまう）
     ・activeParkBgm が null     … いま公園BGMは鳴っていない
       （サウンドOFF中、いやいやが終わって playParkBgmSoon() の順番待ち中など）
       この場合は、あとで鳴らすときに時間を見て選びなおされるので、ここでは何もしない */
  if (activeParkBgm !== parkBgm) {
    return;
  }

  /* BGM1を止めて、少し間を空けてからBGM2を最初から鳴らす

     ① stopParkBgm()     … BGM1をその場で止める（いったん無音になる）
     ② playParkBgmSoon() … 700ms待ってから、いまの時間に合う曲＝BGM2を
                           先頭からフェードインで鳴らしはじめる

     ②で playParkBgm() を直接呼ばず「Soon」のほうを使うのがポイント
     ・決定音「ポン♪」が、鳴りはじめの曲にかき消されない
     ・いったん無音をはさむので「章が変わった」感じが出る
     ・ゲームを始めたときや、いやいやが終わって公園へ戻るときと
       まったく同じ聞こえかたにそろう

     ※ ①を先にやるのが大事
       先に止めておかないと、待っている700msのあいだBGM1が鳴り続けて、
       そのあと急にぶつ切りになってしまう

     （今回はこみいったクロスフェードまではせず、ふわっと入ってくれば十分） */
  stopParkBgm();
  playParkBgmSoon();
}

/* ============================================================
   タイトル画面のBGM

   作りは公園BGM（上）とまったく同じで、鳴らす曲と鳴らす場面だけがちがう
   ・タイトルBGM … gameStarted === false のあいだ（タイトル画面）
   ・公園BGM     … 「このおやつで公園へ行く！」を押してから、ゴール／GAME OVERまで

   2曲が同時に鳴らないよう、切り替えるときは
   「前の曲を止めてから、次の曲を鳴らす」の順番にしている
   ============================================================ */

/* タイトルBGMを入れておく箱
   公園BGMと同じく、サーバー側では作れないので null から始める */
let titleBgm: HTMLAudioElement | null = null;

/* タイトルBGMを用意して返す（初めて必要になったときだけ作る）

   ※ 公園BGMと同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ために必要になるため
*/
function getTitleBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!titleBgm) {
      // public/audio/title-bgm.mp3 は、URLでは /audio/title-bgm.mp3 になる
      titleBgm = new Audio('/audio/title-bgm.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      titleBgm.loop = true;

      // volume … 音の大きさ（上の titleBgmVolume で決めている）
      titleBgm.volume = getSoundVolume(titleBgmVolume);
    }

    return titleBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* タイトルBGMを「最初から」再生する
   ページを開いたときと、「もう一度あそぶ」でタイトルに戻ったとき用 */
function playTitleBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getTitleBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getTitleBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    // タイトルBGMはフェードインさせず、そのまま鳴らす
    // （フェードインするのは公園BGMだけ）
    bgm.volume = getSoundVolume(titleBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* タイトルBGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   1000 で1秒。ここだけ書きかえれば、間の長さを調整できる */
const titleBgmStartDelay = 700;

/* 「あとで鳴らす」の予約票（公園BGMのものと同じ仕組み）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let titleBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* タイトルBGMを「少し待ってから」最初から鳴らす

   ボタンを押した瞬間にいきなり曲が始まると唐突に聞こえるので、
   公園BGM（playParkBgmSoon）と同じように、少しだけ間を空ける

   ※ 待たせるのは「音を鳴らすこと」だけ
     画面の切り替えやゲームの処理は、いつもどおりすぐ進む
*/
function playTitleBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelTitleBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  titleBgmTimer = setTimeout(() => {
    titleBgmTimer = null;

    /* 待っているあいだに画面が変わっていたら、もう鳴らさない
       （待ち時間のうちに「このおやつで公園へ行く！」を押して、
         ゲームが始まってしまった場合） */
    if (gameStarted.value) {
      return;
    }

    playTitleBgm();
  }, titleBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelTitleBgmStart() {
  if (titleBgmTimer === null) {
    return;
  }

  clearTimeout(titleBgmTimer);
  titleBgmTimer = null;
}

/* タイトルBGMを「続きから」再生する（サウンドをONに戻したとき用） */
function resumeTitleBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getTitleBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* タイトルBGMを一時停止する（どこまで再生したかは覚えたまま） */
function pauseTitleBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  cancelBgmFade();

  if (!titleBgm) {
    return;
  }

  try {
    titleBgm.pause();
  } catch {
    // 何もしない
  }
}

/* タイトルBGMを完全に止める（次はまた最初から鳴るようにする） */
function stopTitleBgm() {
  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  if (!titleBgm) {
    return;
  }

  try {
    titleBgm.pause();
    titleBgm.currentTime = 0;
  } catch {
    // 何もしない
  }
}

/* ============================================================
   いやいやタイムのBGM

   作りは公園BGM・タイトルBGMとまったく同じで、鳴らす場面だけがちがう
   ・いやいやBGM … いやいやタイムの画面にいるあいだ（currentEvent === 'tantrum'）

   ここでいちばん大事なのは「いつ切り替えるか」

   ① いやいやが発生した瞬間（isTantrum が true になったとき）は、
     公園BGMを stop して「無音」にするだけ（いやいやBGMはまだ鳴らさない）
     プレイヤーはまだ「通常行動の結果」を読んでいる最中なので、
     しんと静かな画面で「たいへんなことが起きた」を伝える

   ② 「こうちゃんのところへ行く」を押して、いやいやタイムの画面へ移った瞬間に切り替える
     （goToNextPlace() の中）

   ③ いやいやが終わっても（isTantrum が false になっても）、その瞬間には止めない
     「ぎゅっとだっこすると……」などの結果を読んでいるあいだ、画面はまだ
     いやいやタイムなので、曲もそのまま流しつづける

   ④ 「次の場所を選ぶ」でいやいやタイムの画面から出るときに止める
     （こちらも goToNextPlace() の中）
   ============================================================ */

/* いやいやBGMを入れておく箱
   ほかの2曲と同じく、サーバー側では作れないので null から始める */
let tantrumBgm: HTMLAudioElement | null = null;

/* いやいやBGMを用意して返す（初めて必要になったときだけ作る）

   ※ ほかの2曲と同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ために必要になるため
*/
function getTantrumBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!tantrumBgm) {
      // public/audio/tantrum-bgm.mp3 は、URLでは /audio/tantrum-bgm.mp3 になる
      tantrumBgm = new Audio('/audio/tantrum-bgm.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      // （いやいやが何回続いても、音が途切れないようにするため）
      tantrumBgm.loop = true;

      // volume … 音の大きさ（上の tantrumBgmVolume で決めている）
      tantrumBgm.volume = getSoundVolume(tantrumBgmVolume);
    }

    return tantrumBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* いやいやBGMを「最初から」再生する（いやいやタイムへ入ったとき用）

   いやいやは1回ごとに独立した場面なので、毎回きちんと曲の頭から始める
   （前のいやいやの途中から鳴りだすと、場面が変わった感じがしない）

   公園BGMと同じくフェードインさせる
   公園BGMを止めた直後に、いきなり別の曲が最大音量で始まると唐突なため
*/
function playTantrumBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getTantrumBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getTantrumBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    /* 無音から少しずつ大きくしていく

       ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は
         公園BGMと共用で問題ない
         2曲が同時に鳴ることはなく、切り替えるときは必ず前の曲を止めており、
         startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
    startBgmFadeIn(bgm, tantrumBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* いやいやBGMを「続きから」再生する（サウンドをONに戻したとき用）

   playTantrumBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす
*/
function resumeTantrumBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getTantrumBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* いやいやBGMを一時停止する（どこまで再生したかは覚えたまま）
   サウンドをOFFにしたときと、ページを離れるときに使う */
function pauseTantrumBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  cancelBgmFade();

  if (!tantrumBgm) {
    return;
  }

  try {
    tantrumBgm.pause();
  } catch {
    // 何もしない
  }
}

/* いやいやBGMを完全に止める（次はまた最初から鳴るようにする）

   いやいやタイムの画面から出るとき・ゴール・GAME OVER・
   「もう一度あそぶ」で使う

   pause() ではなく stop（先頭へ戻す）にしているのは、
   次のいやいやが「前のいやいやの続き」から鳴りださないようにするため
*/
function stopTantrumBgm() {
  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  if (!tantrumBgm) {
    return;
  }

  try {
    tantrumBgm.pause();
    tantrumBgm.currentTime = 0;
  } catch {
    // 何もしない
  }
}

/* ============================================================
   リザルト画面のBGM

   作りは公園BGM・タイトルBGM・いやいやBGMとまったく同じで、
   鳴らす場面だけがちがう
   ・リザルトBGM … 通常ゴールの結果画面にいるあいだ（currentEvent === 'goal'）

   「午前中に親子で公園をたくさん探検して、お昼になったので帰る」という
   おしまいの場面に合う曲を流す

   ※ GAME OVER画面で流すのは、この曲ではない
     GAME OVERは「途中で帰ることになってしまった」場面なので、
     別の専用曲（GAME OVER BGM）を流す（すぐ下の「GAME OVER画面のBGM」を参照）
     ・ゴール（currentEvent === 'goal'）        … リザルトBGM（result-bgm.mp3。S+ランクだけ result-bgm-splus.mp3）
     ・GAME OVER（currentEvent === 'gameOver'） … GAME OVER BGM（game-over-bgm.mp3）

   ※ S+ランクのときだけ、うた入りの曲「きょうの大冒険、おしまい！ ～うた入り～」を流す
     曲がちがうだけで、同じリザルトBGMとしてあつかう
     （入れもの resultBgm も、鳴らす・止める・再開する関数も、ぜんぶ同じものを使う）
     鳴らす前に getResultBgm() が、今回のランクに合わせて src を差しかえる

   ※ ゴール音「タタターン♪」とは重ねない
     goToGoal() で「タタターン♪」を鳴らしたあと、
     少しだけ間を空けてから曲を始める（playResultBgmSoon）
   ============================================================ */

/* リザルトBGMを入れておく箱
   ほかの3曲と同じく、サーバー側では作れないので null から始める */
let resultBgm: HTMLAudioElement | null = null;

/* 通常のリザルトBGMの音源（Sランク以下と、特殊エンドで流す）
   public/audio/result-bgm.mp3 は、URLでは /audio/result-bgm.mp3 になる
   （S+ランク用の sPlusSongSrc は、サウンドトラックと共用なので utils/sPlusSong.ts にある） */
const resultBgmSrc = '/audio/result-bgm.mp3';

/* 今回のランクに合ったリザルトBGMの音源を返す

   S+ランクのときだけ、うた入り
   Sランクもふくめ、それ以外（A〜D・特殊エンド）はぜんぶ通常版 */
function getResultBgmSrc() {
  return endingRank.value === 'S+ランク' ? sPlusSongSrc : resultBgmSrc;
}

/* リザルトBGMを用意して返す（初めて必要になったときだけ作る）

   ※ ほかの3曲と同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ために必要になるため

   ※ 入れもの（Audio）は1つだけ作って使いまわすが、鳴らす曲は今回のランクで変わる
     同じページのまま何回も遊ぶと、「1回目 S+ → 2回目 A → 3回目 S+」のように
     前回とちがう曲が必要になるので、呼ばれるたびに src が今回のランクに合っているかを確かめる
*/
function getResultBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    const src = getResultBgmSrc();

    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!resultBgm) {
      resultBgm = new Audio(src);

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      // （結果をゆっくり読んでいても、曲が途切れないようにするため）
      resultBgm.loop = true;

      // volume … 音の大きさ（上の resultBgmVolume で決めている）
      resultBgm.volume = getSoundVolume(resultBgmVolume);
    } else if (resultBgm.getAttribute('src') !== src) {
      /* 前のゴールとランクがちがって、鳴らす曲が変わるときだけ差しかえる

         ・同じ曲のときは差しかえない
           サウンドをONに戻して「続きから」鳴らすとき（resumeResultBgm）に、先頭へ戻ってしまうため
         ・src を差しかえると再生位置は先頭に戻るが、loop と volume はそのまま残る

         ※ resultBgm.src ではなく getAttribute('src') で比べるのは、
           .src だと「http://〜/audio/result-bgm.mp3」のような長い形で返ってきて、
           同じ曲でも文字が食いちがってしまうため */
      resultBgm.src = src;
    }

    return resultBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* リザルトBGMを「最初から」再生する（ゴールしたとき用）

   公園BGM・いやいやBGMと同じくフェードインさせる
   ゴール音「タタターン♪」のあとに、ふわっと曲が始まるようにするため
*/
function playResultBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getResultBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getResultBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    /* 無音から少しずつ大きくしていく

       ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は
         ほかの3曲と共用で問題ない
         4曲が同時に鳴ることはなく、切り替えるときは必ず前の曲を止めており、
         startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
    startBgmFadeIn(bgm, resultBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* リザルトBGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   1500 で1.5秒。ここだけ書きかえれば、間の長さを調整できる

   ゴール音「タタターン♪」と同時に曲が始まってしまうと
   せっかくのファンファーレが聞こえなくなるので、そのぶんだけ待つ */
const resultBgmStartDelay = 1500;

/* 「あとで鳴らす」の予約票（公園BGM・タイトルBGMのものと同じ仕組み）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let resultBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* リザルトBGMを「少し待ってから」最初から鳴らす

   ※ 待たせるのは「音を鳴らすこと」だけ
     結果画面は、いつもどおりすぐ表示される
*/
function playResultBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelResultBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  resultBgmTimer = setTimeout(() => {
    resultBgmTimer = null;

    /* 待っているあいだに画面が変わっていたら、もう鳴らさない
       （待ち時間のうちに「もう一度あそぶ」を押して、
         タイトル画面へ戻ってしまった場合） */
    if (currentEvent.value !== 'goal') {
      return;
    }

    playResultBgm();
  }, resultBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelResultBgmStart() {
  if (resultBgmTimer === null) {
    return;
  }

  clearTimeout(resultBgmTimer);
  resultBgmTimer = null;
}

/* リザルトBGMを「続きから」再生する（サウンドをONに戻したとき用）

   playResultBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす
*/
function resumeResultBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getResultBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* リザルトBGMを一時停止する（どこまで再生したかは覚えたまま）
   サウンドをOFFにしたときと、ページを離れるときに使う */
function pauseResultBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  // （こうしないと、次に再開したとき小さい音のままになる）
  cancelBgmFade();

  if (!resultBgm) {
    return;
  }

  try {
    resultBgm.pause();
  } catch {
    // 何もしない
  }
}

/* リザルトBGMを完全に止める（次はまた最初から鳴るようにする）
   「もう一度あそぶ」で使う */
function stopResultBgm() {
  /* 「あとで鳴らす」の予約も取り消す

     ※ かならず下の「まだ作っていないなら終わり」より前に置くこと
       ゴール音が鳴っているあいだに「もう一度あそぶ」を押すと、
       予約だけして、まだ曲を作っていない状態のことがあるため
       あとに置くと、取り消せずに タイトル画面で鳴りだしてしまう */
  cancelResultBgmStart();

  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  if (!resultBgm) {
    return;
  }

  try {
    resultBgm.pause();
    resultBgm.currentTime = 0;
  } catch {
    // 何もしない
  }
}

/* ============================================================
   GAME OVER画面のBGM

   作りはリザルトBGM（すぐ上）とまったく同じで、鳴らす場面だけがちがう
   ・GAME OVER BGM … GAME OVER画面にいるあいだ（currentEvent === 'gameOver'）

   ■ なぜGAME OVER画面だけの専用曲にするのか

     おでかけの終わりかたは2つあり、気持ちがまったくちがう
     ・ゴール     … 12時まで遊びきった「きょうの大冒険、おしまい！」 → リザルトBGM
     ・GAME OVER … 途中で限界になって帰る「きょうはここまで。また遊ぼう」 → この曲

     同じ曲を使いまわすと、どちらの終わりかたなのかが音から伝わらなくなる
     そこで、入れもの（gameOverBgm）も関数も音量も、リザルトBGMとはぜんぶ別にしてある
     （リザルトBGMの関数は、GAME OVERを鳴らすためには1つも使わない）

   ■ 鳴るまでの流れ

     ① checkGameOver() で GAME OVER が決まる
        → 画面はその場でGAME OVER画面へ切りかわる
        → それまで鳴っていた曲（公園・秘密の場所・いやいや・リザルト）を止める
     ② playGameOverBgmSoon() で「0.7秒あとに鳴らす」予約をする
     ③ 0.7秒の無音のあと、playGameOverBgm() が曲の先頭からフェードインで鳴らす

   ※ GAME OVER専用の短い効果音は付けていない
     「少し無音 → GAME OVER BGM」という、しずかな切りかわりにしている
   ============================================================ */

/* GAME OVER BGMを入れておく箱

   null は「まだ作っていない」という意味

   ※ ここで new Audio('/audio/game-over-bgm.mp3') と書かないのが大事
     Nuxtは、ページを作るときにサーバー側でも一度このコードを読む
     サーバーには Audio が無いので、ここで作るとエラーになってしまう
     そこで箱だけ用意しておき、ブラウザで必要になったとき
     （getGameOverBgm() が初めて呼ばれたとき）に作る */
let gameOverBgm: HTMLAudioElement | null = null;

/* GAME OVER BGMを用意して返す（初めて必要になったときだけ作る）

   ※ ほかの曲と同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ためにも、この関数が必要になるため
*/
function getGameOverBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!gameOverBgm) {
      // public/audio/game-over-bgm.mp3 は、URLでは /audio/game-over-bgm.mp3 になる
      gameOverBgm = new Audio('/audio/game-over-bgm.mp3');

      /* loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す

         曲は2分ほどあるので、ふつうはその前に「もう一度あそぶ」などを押して止まる
         それでも、記録をゆっくり読んでいたり、画面をそのまま置いておいたりしたときに、
         とちゅうで急に無音にならないように、くり返しておく */
      gameOverBgm.loop = true;

      // volume … 音の大きさ（上の gameOverBgmVolume で決めている）
      gameOverBgm.volume = getSoundVolume(gameOverBgmVolume);
    }

    return gameOverBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* GAME OVER BGMを「最初から」再生する（GAME OVERになったとき用）

   ■ play と resume のちがい
     ・playGameOverBgm()   … currentTime を 0 にして、曲の先頭から鳴らす
                             GAME OVERになるたびに、いつも同じ始まりかたにしたいため
     ・resumeGameOverBgm() … currentTime はさわらず、止めたところの続きから鳴らす
                             サウンドを OFF → ON に戻したとき用

   前の曲が止まったあとに、いきなり曲がいつもの音量で始まると唐突なので、
   ほかのBGMと同じ startBgmFadeIn() で、無音からふわっと大きくしていく
*/
function playGameOverBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getGameOverBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getGameOverBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    /* 無音から少しずつ大きくしていく

       ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は、ほかの曲と共用で問題ない
         2曲が同時に鳴ることはなく（GAME OVERになるときに、前の曲はぜんぶ止めてある）、
         startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
    startBgmFadeIn(bgm, gameOverBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* GAME OVER BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   700 で0.7秒。ここだけ書きかえれば、間の長さを調整できる

   待つ理由は2つ
   ・GAME OVERになる直前の決定音「ポン♪」や、いやいや発生の音などが、
     曲の鳴りはじめと重ならないようにするため
   ・前の曲が止まったあと、いったん「しん」とする間を作るため
     この短い無音があることで、「今日の遊びはここでおしまい」という区切りが伝わる

   ※ 待たせるのは「音」だけ
     GAME OVER画面そのものは、この待ち時間とは関係なく、すぐに表示される */
const gameOverBgmStartDelay = 700;

/* 「あとで鳴らす」の予約票（リザルトBGMのものと同じ仕組み）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let gameOverBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* GAME OVER BGMを「少し待ってから」最初から鳴らす（checkGameOver() から呼ぶ）

   ■ 最初に、前の予約を取り消す理由
     予約が2つ残っていると、0.7秒後に「先頭から鳴らす」が2回はたらき、
     鳴りはじめた曲が頭からやりなおしになってしまう
     先に cancelGameOverBgmStart() で消しておけば、予約はいつも1つだけになる

   ■ 鳴らす直前に、まだGAME OVER画面にいるかを確かめる理由
     0.7秒待っているあいだに「もう一度あそぶ」などを押して、画面が変わっていることがある
     確かめずに鳴らすと、タイトル画面でGAME OVERの曲が流れてしまう
*/
function playGameOverBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelGameOverBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  gameOverBgmTimer = setTimeout(() => {
    gameOverBgmTimer = null;

    // 待っているあいだにGAME OVER画面から出ていたら、もう鳴らさない
    if (currentEvent.value !== 'gameOver') {
      return;
    }

    playGameOverBgm();
  }, gameOverBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelGameOverBgmStart() {
  if (gameOverBgmTimer === null) {
    return;
  }

  clearTimeout(gameOverBgmTimer);
  gameOverBgmTimer = null;
}

/* GAME OVER BGMを「続きから」再生する（サウンドをONに戻したとき用）

   playGameOverBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす

   ※ サウンドOFFのままGAME OVERになり、GAME OVER画面でONに戻したときは、
     まだ曲を一度も作っていない（gameOverBgm が null）
     その場合は getGameOverBgm() がここで初めて作るので、曲の先頭から鳴りはじめる
*/
function resumeGameOverBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getGameOverBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* GAME OVER BGMを一時停止する（どこまで再生したかは覚えたまま）
   サウンドをOFFにしたときと、ページを離れるときに使う

   ■ pause と stop のちがい
     ・pauseGameOverBgm() … その場で止めるだけ。currentTime（どこまで鳴らしたか）は残す
                            → サウンドを ON に戻したとき、止めた位置から続けられる
     ・stopGameOverBgm()  … 止めたうえで、currentTime を 0（曲の先頭）へ戻す
                            → GAME OVER画面から出るとき用。次のGAME OVERでは、また先頭から鳴る
*/
function pauseGameOverBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  // （こうしないと、次に再開したとき小さい音のままになる）
  cancelBgmFade();

  if (!gameOverBgm) {
    return;
  }

  try {
    gameOverBgm.pause();
  } catch {
    // 何もしない
  }
}

/* GAME OVER BGMを完全に止める（次はまた最初から鳴るようにする）
   GAME OVER画面から出るとき（resetGame() ＝ もう一度あそぶ／はじめの画面へ戻る）に使う */
function stopGameOverBgm() {
  /* 「あとで鳴らす」の予約も取り消す

     ※ かならず下の「まだ作っていないなら終わり」より前に置くこと
       GAME OVERになってすぐ（0.7秒待っている最中に）「もう一度あそぶ」を押すと、
       予約だけして、まだ曲を作っていない状態のことがあるため
       あとに置くと、取り消せずに タイトル画面で鳴りだしてしまう */
  cancelGameOverBgmStart();

  // フェードインの途中で止めることもあるので、フェードもやめておく
  cancelBgmFade();

  if (!gameOverBgm) {
    return;
  }

  try {
    gameOverBgm.pause();
    gameOverBgm.currentTime = 0; // 次のGAME OVERでは、また曲の先頭から

    // 音量も、決めてある大きさへ戻しておく
    // （フェードインの途中で止めると、小さい音量のまま残ることがあるため）
    gameOverBgm.volume = getSoundVolume(gameOverBgmVolume);
  } catch {
    // 何もしない
  }
}

/* ============================================================
   こもれびの広場のBGM

   作りは公園BGM・タイトルBGM・いやいやBGM・リザルトBGMとまったく同じで、
   鳴らす場面だけがちがう
   ・こもれびの広場BGM … 秘密の場所にいるあいだ（currentEvent === 'secretSpot'）

   ここだけ曲を変える理由は「特別な場所に来た」と分かるようにするため
   公園入口・すべり台・砂場などは、ぜんぶ同じ公園のつづきなので公園BGMのまま
   秘密の場所は、たくさん遊んだ人だけが入れる特別な場所なので、曲も変える

   ※ 公園BGMとは必ず「入れかえ」にする（重ねない）
     秘密の場所へ入るときは公園BGMを止めてから、
     出るときはこもれびの広場BGMを止めてから、次の曲を鳴らす
     2曲が同時に鳴ると、どちらもにごって聞こえてしまうため

   ※ 秘密の場所を出たら、公園BGM1・BGM2のどちらへ戻るかは時計が決める
     戻る先を park-bgm.mp3 に決め打ちしないこと
     10:40に秘密の場所を出たのに午前前半のBGM1へ戻ると、
     時間帯で曲を変えている仕組み（shouldUseParkBgm2）がこわれてしまう
     曲を選ぶ仕事は playParkBgmSoon() → playParkBgm() にまかせる
   ============================================================ */

/* こもれびの広場BGMを入れておく箱
   ほかの4曲と同じく、サーバー側では作れないので null から始める */
let secretBgm: HTMLAudioElement | null = null;

/* こもれびの広場BGMを用意して返す（初めて必要になったときだけ作る）

   ※ ほかの4曲と同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ために必要になるため
*/
function getSecretBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!secretBgm) {
      // public/audio/secret-bgm.mp3 は、URLでは /audio/secret-bgm.mp3 になる
      secretBgm = new Audio('/audio/secret-bgm.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      // （秘密の場所で何回も遊んで長くいても、曲が途切れないようにするため）
      secretBgm.loop = true;

      // volume … 音の大きさ（上の secretBgmVolume で決めている）
      secretBgm.volume = getSoundVolume(secretBgmVolume);
    }

    return secretBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* こもれびの広場BGMを「最初から」再生する（秘密の場所へ入ったとき用）

   ※ currentTime = 0 で必ず曲の先頭に戻す
     一度出てからまた秘密の場所へ入ったときも、前回の続きではなく
     頭から鳴らしたいため（入るたびに同じ始まりかたにそろえる）
*/
function playSecretBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getSecretBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getSecretBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    /* 無音から少しずつ大きくしていく

       ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は
         ほかの4曲と共用で問題ない
         5曲が同時に鳴ることはなく、切り替えるときは必ず前の曲を止めており、
         startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
    startBgmFadeIn(bgm, secretBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* こもれびの広場BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   700 で0.7秒。ここだけ書きかえれば、間の長さを調整できる

   待つ理由は2つ
   ・「秘密の場所へ行く」の決定音「ポン♪」が、曲の鳴りはじめにかき消されないため
   ・公園BGMが止まったあと、いったん静かな時間を作るため
     この「しん」とする一瞬があることで、
     「いつもの公園から、特別な場所へ入った」という感じが出る
   （公園BGM・タイトルBGMと同じ 700ms にそろえてある） */
const secretBgmStartDelay = 700;

/* 「あとで鳴らす」の予約票（ほかの曲のものと同じ仕組み）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let secretBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* こもれびの広場BGMを「少し待ってから」最初から鳴らす

   ※ 待たせるのは「音を鳴らすこと」だけ
     秘密の場所の画面は、いつもどおりすぐ表示される
*/
function playSecretBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelSecretBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  secretBgmTimer = setTimeout(() => {
    secretBgmTimer = null;

    /* 待っている0.7秒のあいだに画面が変わっていたら、もう鳴らさない
       （秘密の場所を出た、いやいやになった、GAME OVERになった、
         ゴールした、「もう一度あそぶ」でタイトルへ戻った、などの場合）

       まだ秘密の場所にいるときだけ鳴らす、という確かめかたにしてあるので、
       行き先がどこであっても「あとから鳴りだす」ことがない */
    if (currentEvent.value !== 'secretSpot') {
      return;
    }

    playSecretBgm();
  }, secretBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelSecretBgmStart() {
  if (secretBgmTimer === null) {
    return;
  }

  clearTimeout(secretBgmTimer);
  secretBgmTimer = null;
}

/* こもれびの広場BGMを「続きから」再生する（サウンドをONに戻したとき用）

   playSecretBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす

   ※ サウンドOFFのまま秘密の場所へ入って、そこでONに戻したときは、
     まだ曲を一度も作っていない（secretBgm が null）
     その場合は getSecretBgm() が新しく作り、先頭から鳴りはじめる
*/
function resumeSecretBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getSecretBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* こもれびの広場BGMを一時停止する（どこまで再生したかは覚えたまま）
   サウンドをOFFにしたときと、ページを離れるときに使う

   ※ currentTime（どこまで鳴らしたか）はリセットしない
     サウンドをONに戻したとき、止めた位置から続けられるようにするため
*/
function pauseSecretBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  // （こうしないと、次に再開したとき小さい音のままになる）
  cancelBgmFade();

  if (!secretBgm) {
    return;
  }

  try {
    secretBgm.pause();
  } catch {
    // 何もしない
  }
}

/* こもれびの広場BGMを完全に止める（次はまた最初から鳴るようにする）

   秘密の場所から出るとき・いやいや発生・GAME OVER・ゴール・
   「もう一度あそぶ」で使う
*/
function stopSecretBgm() {
  /* 「あとで鳴らす」の予約も取り消す

     ※ かならず下の「まだ作っていないなら終わり」より前に置くこと
       秘密の場所へ入った直後（＝まだ0.7秒待っている最中）に
       すぐ出る・いやいやになる・GAME OVERになることがあり、
       そのときは予約だけして、まだ曲を作っていない状態になっている
       あとに置くと、取り消せずに別の画面で鳴りだしてしまう */
  cancelSecretBgmStart();

  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  if (!secretBgm) {
    return;
  }

  try {
    secretBgm.pause();
    secretBgm.currentTime = 0; // 次に入ったときは、また曲の先頭から
  } catch {
    // 何もしない
  }
}

/* ============================================================
   音量（スライダー）を、実際の音へ反映する

   ここにあるのは3つ
   ・applySoundVolume()  … いま作ってあるBGMの volume を、いまの設定へそろえる
   ・saveSoundVolume()   … 次に開いたときのために localStorage へ残す
   ・changeSoundVolume() … スライダーを動かしたときに呼ばれる（上の2つをまとめて行う）
   ============================================================ */

/* いま作ってある（＝一度でも鳴らした）BGMの音量を、いまの設定へそろえる

   ■ get〜Bgm() を呼ばないのが大事
     呼ぶと、まだ一度も鳴らしていない曲まで new Audio() で作られてしまい、
     音量を変えただけなのに mp3 の読み込みが始まってしまう
     ここでは「もう作ってある曲」だけを、そのまま直す

   ■ pause() も play() も currentTime も、さわらない
     volume だけを変えるので、鳴っている曲は
     止まったり、頭から鳴りなおしたりせず、そのまま大きさだけが変わる

   ■ フェードインの最中の曲だけは、ここでは変えない
     フェードの係（startBgmFadeIn）が 0.05秒ごとに
     いまの設定で計算しなおしているので、そちらにまかせる
     （ここで一気に入れてしまうと、フェードの途中で音が飛んでしまう）
*/
function applySoundVolume() {
  /* 曲と「曲ごとの音量」の組み合わせ
     新しいBGMを足したときは、ここにも1行足す */
  const bgmList: [HTMLAudioElement | null, number][] = [
    [parkBgm, parkBgmVolume],
    [parkBgm2, parkBgm2Volume],
    [titleBgm, titleBgmVolume],
    [tantrumBgm, tantrumBgmVolume],
    [resultBgm, resultBgmVolume],
    [gameOverBgm, gameOverBgmVolume],
    [secretBgm, secretBgmVolume],
  ];

  for (const [bgm, baseVolume] of bgmList) {
    // まだ作っていない曲（null）と、フェードインの最中の曲は、ここでは何もしない
    if (!bgm || bgm === fadingBgm) {
      continue;
    }

    try {
      bgm.volume = getSoundVolume(baseVolume);
    } catch {
      // 何もしない
    }
  }
}

/* 音量を、次に開いたときのために保存しておく */
function saveSoundVolume() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(soundVolumeStorageKey, String(soundVolumePercent.value));
  } catch {
    // ブラウザの設定で保存できないことがある
    // 保存できなくても、このページを開いているあいだの音量は正常に動く
  }
}

/* 音量のスライダーを動かしたとき

   input type="range" の value は文字で届くので、Number() で数字に直す
   つまみを持って動かしているあいだ（@input）ずっと呼ばれるので、
   動かしている途中から、鳴っている音の大きさが変わっていく

   ■ 0% ＝ ミュートなので、スピーカーの状態もここでそろえる
     ・0%まで下げた     … ミュートにする（アイコンが 🔊× になり、BGMも止まる）
     ・0%から上げた     … ミュートを解除する（いまの画面に合うBGMが鳴りなおす）
     どちらも、ミュートボタンを押したときとまったく同じあと始末をする
     （→ applySoundEnabledChange）

   ※ ここでは toggleSound() は呼ばない
     toggleSound() はスライダーの位置まで動かしてしまうので、
     せっかく動かした値（30%など）が、覚えていた値で上書きされてしまうため
*/
function changeSoundVolume(event: Event) {
  const slider = event.target as HTMLInputElement;
  const percent = Number(slider.value);

  if (!Number.isFinite(percent)) {
    return;
  }

  soundVolumePercent.value = Math.min(100, Math.max(0, Math.round(percent)));

  // 0%より大きいときは、次にミュートを解除したときの戻り先として覚えておく
  if (soundVolumePercent.value > 0) {
    volumeBeforeMute = soundVolumePercent.value;
  }

  /* 0%かどうかで、サウンドのON/OFFが変わるかを見る
     変わるときだけ、BGMの止める・鳴らしなおすところまで行う
     （動かすたびに毎回やると、鳴っている曲が何度も鳴りなおしてしまう） */
  const shouldBeOn = soundVolumePercent.value > 0;
  const soundEnabledChanged = shouldBeOn !== soundEnabled.value;

  if (soundEnabledChanged) {
    soundEnabled.value = shouldBeOn;
  }

  // 先に音量をそろえてから、BGMを鳴らしなおす（小さいはずの曲が一瞬大きく鳴らないように）
  applySoundVolume();
  saveSoundVolume();

  if (soundEnabledChanged) {
    applySoundEnabledChange();
  }
}

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

  /* サブメニュー「☕ ひとやすみ」を閉じる

     どの行動を選んでも、ここを通れば必ず閉じるので、
     行動のあとにサブメニューが出しっぱなしになることがない
     （休憩・おやつだけでなく、「一緒にすべる」のような
       場所の行動を選んだときにも閉じる）

     ※ closeCareMenu() の中で、おやつバッグもいっしょに閉じる
       おやつを食べたあとに、バッグが出しっぱなしになることもない
  */
  closeCareMenu();

  // 前の結果が休憩・おやつだったかの印も消す（このあとの行動が休憩・おやつなら、finishCareAction() でまた付く）
  isCareActionResult.value = false;

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

/* 行動の中身がぜんぶ終わったあとに呼ぶ
   「今の値 － 行動前の値」で、今回の変化量を作る

   この計算は行動につき1回だけ行うので、
   ・ランダムイベントの分
   ・いやいや発生の分
   ・再訪でポイントが1に減った分
   もぜんぶ合計された数になる

   ※ 必ず fixAllStatus()（0〜100に丸める処理）より前に呼ぶこと
     たとえば 親の体力が0のときに だっこ をすると、
     丸めたあとでは 0 のままなので「-15」が消えてしまう
     丸める前に計算することで、その行動にかかったコストがきちんと出る
*/
function saveStatusChanges() {
  statusChanges.value = {
    childEnergy: childEnergy.value - statusBefore.value.childEnergy,
    childMood: childMood.value - statusBefore.value.childMood,
    outingPoint: outingPoint.value - statusBefore.value.outingPoint,
    parentEnergy: parentEnergy.value - statusBefore.value.parentEnergy,
    parentCalm: parentCalm.value - statusBefore.value.parentCalm,
    minutes: currentMinutes.value - statusBefore.value.minutes,
  };
}

/* 中央の「今回の変化」を、誰の情報かで3つのまとまりに分けたもの

   表示のならびを組み立てるのは utils/changeGroups.ts の buildChangeGroups()
   ここは、行動する前の値・いまの値・今回の増減を渡すだけ
   （くわしい中身は、あちらのコメントを参照）
*/
const changeGroups = computed(() =>
  buildChangeGroups({
    changes: statusChanges.value,
    before: statusBefore.value,
    childEnergy: childEnergy.value,
    childMood: childMood.value,
    outingPoint: outingPoint.value,
    parentEnergy: parentEnergy.value,
    parentCalm: parentCalm.value,
    currentTime: currentTime.value,
  }),
);

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

   ※ いやいやの状態（tantrumReason・tantrumLevel など）は、
     画面の表示・結果カード・BGMの切りかえからも見るので、このファイルで持ったまま
*/
const { checkTantrum, resetTantrumState, hugChild, giveSnack, talkToChild, waitCalmly } = useTantrum({
  childEnergy,
  childMood,
  parentEnergy,
  parentCalm,
  outingPoint,
  isTantrum,
  tantrumCount,
  tantrumText,
  tantrumReason,
  tantrumLevel,
  currentTantrumReasonInfo,
  lastTantrumAction,
  repeatedTantrumActionCount,
  hasNiceTantrumResponse,
  niceTantrumResponseText,
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
  getSnackTantrumFit,
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
    gameOverMessage.value = 'もうこれ以上は動けません……。こうちゃんを連れて、公園から撤退しました。';
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
    gameOverMessage.value = '親の心の余裕がなくなってしまいました。今日はここで公園探検を終了します。';
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
    gameOverMessage.value = 'たくさん遊んで、こうちゃんはもうクタクタ。だっこで公園をあとにしました。';
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

   ※ ここでは決定音を鳴らさない
     （曲が鳴りはじめること自体が、押せたことの合図になる）

   曲は少しだけ間を空けてから鳴らしはじめる
   押した瞬間にいきなり始まると唐突に聞こえるため
   （待つのは音だけで、画面の切り替えはこのあとすぐ行う）
*/
function enterTitle() {
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
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  cancelTitleBgmStart();
  stopTitleBgm();

  /* きょうのおやつは、いちばん最初の画面まで戻ったら選びなおしてもらう

     A画面まで戻るのは「最初から始め直す」ことなので、
     前に選んだグミ・せんべいが残っていると、
     次に公園へ行くときに知らないうちに持たされてしまう
     （B画面 ⇄ おやつ選択画面の行き来では、わざと残している） */
  selectedSnackIds.value = [];
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

  // 新しいプレイなので「最後に入った場所」も忘れる（resetGame() でも空にしているが、はじめての公園入口は必ず先頭から）
  lastSelectedPlace.value = null;

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
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
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

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
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  isHowToPlayOpen.value = true;
}

/* あそびかた画面の「← ひとつ前の画面へ戻る」（Escape もここを呼ぶ）

   B画面へ戻るだけ。タイトルBGMは鳴ったままでよい
   B画面のメインのボタンへのフォーカスは、フェードが終わってから handleScreenEnterEnd() が当てる */
function closeHowToPlay() {
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

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

/* もうサウンドトラックのページへ移動しはじめたかどうか（連打よけ） */
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

  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  cancelTitleBgmStart();
  stopTitleBgm();

  /* A画面の表示には、いっさいさわらない
     （タイトルやボタンを先に消さないので、A画面は中身がそろったままフェードアウトする）
     表示の後片づけは、ページが消えたあとにNuxtがやってくれる */
  navigateTo('/soundtrack');
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

  // 前の場所で開いたままのサブメニューが残らないように閉じる
  closeCareMenu();

  // 前の画面で止めていたマウス操作も戻す（止めるのは「← もどる」のあとや、公園入口へ戻ってきた直後の画面だけ）
  isCommandPointerPaused.value = false;

  resultMessage.value = '';
  statusChanges.value = null;
  currentEvent.value = place;

  // 公園入口に行がある場所なら、「最後に入った場所」として覚える（公園入口へ戻ったときのカーソル位置に使う）
  if (placeSelectionIndexes[place] !== undefined) {
    lastSelectedPlace.value = place;
  }

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;

  /* 秘密の場所へ入るときだけ、公園BGMからこもれびの広場BGMへ入れかえる

     かならず「公園BGMを止める → こもれびの広場BGMを鳴らす」の順番にする
     先に止めておかないと、待っている0.7秒のあいだ公園BGMが鳴りつづけ、
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
       秘密の場所から出る道はこの関数1本だけなので、ここで覚えれば足りる
       （休憩・おやつの結果の「← もどる」は場所を出ないので、この関数を通らない） */
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
  isCareActionResult.value = false;

  // 前の画面で止めていたマウス操作も戻す（止めるのは「← もどる」のあとや、公園入口へ戻ってきた直後の画面だけ）
  isCommandPointerPaused.value = false;

  // サブメニュー「☕ ひとやすみ」も閉じておく
  // （サブメニューを開いたまま「← 場所選びにもどる」を押したときのため）
  closeCareMenu();

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

     ここでいやいやBGMを先頭から鳴らしはじめる（フェードイン付き）

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
    playTantrumBgm();

    currentEvent.value = 'tantrum';
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
       ・少し間（700ms）を空けてから鳴らしはじめる
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
     ・少し間（700ms）を空けてから鳴らしはじめる
       → 決定音「ポン♪」が曲の鳴りはじめにかき消されない
       → いったん静かになるので「秘密の場所から出てきた」感じが出る
     ・そのあと無音からフェードインする

     ※ どちらの公園BGMへ戻るかは、playParkBgmSoon() にまかせる
       ここで park-bgm.mp3 に決め打ちしてはいけない
       実際に鳴らす playParkBgm() が、700ms後にそのときの時計を見て
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

   親の2つのステータスは、減る理由をわけてある
   ・親の体力 … 体をどれだけ使ったか（走る・だっこする・立ちっぱなし）
   ・親の余裕 … どれだけヒヤッとしたか（水辺・高い所・見失いそう）

   そのため、同じ「よく遊ぶ」コマンドでも場所によって中身がちがう
   ・池を近くで見る         … 体力 -13 ／ 余裕 -14（水があるので、いちばん気が張る）
   ・芝生広場で追いかけっこ … 体力 -15 ／ 余裕  -8（親もいっしょに走るので、体をいちばん使う）
   ・どんぐりを拾う         … 体力 -10 ／ 余裕  -3（しゃがんで拾うだけなので穏やか）

   こうすると
   「体力は残っているけれど、余裕がないから池はやめておこう」
   「余裕はあるから、静かなどんぐりの木で点をかせごう」
   のように、2つの数字を見くらべて場所を選べるようになる
   ============================================================ */

/* ===== すべり台 ===== */

/* ① 一緒にすべる */
function playSlide() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 18;
  childMood.value += 6;
  addOutingPoint('slide', 6);
  parentEnergy.value -= 14;
  parentCalm.value -= 9;
  addMinutes(25);

  resultMessage.value = 'こうちゃんと一緒にすべりました。大喜びです！';

  tryCollectPlaceItem('slide');
  finishPlayAction('slide');
}

/* ② 下で見守る

   「いっしょにすべる」より軽い行動だが、親の余裕はあまり節約できない
   こうちゃんが手の届かない高い所へひとりでのぼっていくので、
   すぐそばで支えられる①よりも、かえって気が張る
   （ころんだときの「見守る」も同じ考えで、親の余裕がいちばん減る）

   そのぶん、親の体力と時間は①よりはっきり少なくすんでいる
*/
function watchSlide() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 12;
  childMood.value += 3;
  addOutingPoint('slide', 5);
  parentEnergy.value -= 8;
  parentCalm.value -= 9;
  addMinutes(15);

  resultMessage.value = '「みててー！」こうちゃんはてっぺんから手をふっています。下でハラハラしながら見守りました。';

  tryCollectPlaceItem('slide');
  finishPlayAction('slide');
}

/* ===== 砂場 ===== */

/* ① 一緒に大きな山を作る */
function playSandbox() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 13;
  childMood.value += 5;
  addOutingPoint('sandbox', 6);
  parentEnergy.value -= 12;
  parentCalm.value -= 4;
  addMinutes(25);

  resultMessage.value = '一緒に大きな山を作りました。こうちゃんは夢中です！';

  tryCollectPlaceItem('sandbox');
  finishPlayAction('sandbox');
}

/* ② 砂のトンネルを作る

   山づくり（①）より軽いけれど、親子でいっしょに手を動かす「遊び」
   休むための行動ではないので、親の体力もきちんと減る
   （休みたいときは、別枠の「ひとやすみ」を使う）
*/
function buildSandTunnel() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 8;
  childMood.value += 4;
  addOutingPoint('sandbox', 4);
  parentEnergy.value -= 7;
  parentCalm.value -= 2;
  addMinutes(15);

  resultMessage.value = 'こうちゃんと一緒に砂のトンネルを作りました。向こう側から手が見えると、こうちゃんは大よろこびです！';

  tryCollectPlaceItem('sandbox');
  finishPlayAction('sandbox');
}

/* ===== どんぐりの木 ===== */

/* ① 一緒にどんぐりを拾う */
function collectAcorns() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 11;
  childMood.value += 6;
  addOutingPoint('acornArea', 8);
  parentEnergy.value -= 10;
  parentCalm.value -= 3;
  addMinutes(20);

  resultMessage.value = 'こうちゃんは夢中でどんぐりを拾っています！';

  tryCollectPlaceItem('acornArea');
  finishPlayAction('acornArea');
}

/* ② どんぐりをころがして遊ぶ

   前はここに「木かげで少し休む」があったが、
   休む行動は別枠の「ひとやすみ」にまとめたので、
   この場所ならではの遊びに置きかえている
*/
function rollAcorns() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 7;
  childMood.value += 4;
  addOutingPoint('acornArea', 5);
  parentEnergy.value -= 5;
  parentCalm.value -= 2;
  addMinutes(15);

  resultMessage.value = '拾ったどんぐりを坂になった地面からころがして遊びました。こうちゃんは何度も追いかけています！';

  tryCollectPlaceItem('acornArea');
  finishPlayAction('acornArea');
}

/* ===== 池 ===== */

/* ① 白鳥を近くで見る */
function watchSwansClose() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 11;
  childMood.value += 8;
  addOutingPoint('pond', 9);
  parentEnergy.value -= 13;
  parentCalm.value -= 14;
  addMinutes(20);

  resultMessage.value = '白鳥を近くで見ました。こうちゃんは大興奮です！';

  tryCollectPlaceItem('pond');
  finishPlayAction('pond');
}

/* ② コイに餌をあげる */
function feedKoi() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 8;
  childMood.value += 6;
  addOutingPoint('pond', 7);
  parentEnergy.value -= 5;
  parentCalm.value -= 4;
  addMinutes(15);

  resultMessage.value = 'コイに餌をあげました。たくさんのコイが集まってきて、バシャンと水しぶきをたてながら餌を食べています。こうちゃんは大喜びです。';

  tryCollectPlaceItem('pond');
  finishPlayAction('pond');
}

/* ===== 芝生広場 ===== */

/* ① 追いかけっこする */
function playTagOnGrass() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 19;
  childMood.value += 8;
  addOutingPoint('grassArea', 10);
  parentEnergy.value -= 15;
  parentCalm.value -= 8;
  addMinutes(25);

  resultMessage.value = '芝生広場で、こうちゃんと元気いっぱい追いかけっこをしました。こうちゃんは笑いながら走り回っています！';

  tryCollectPlaceItem('grassArea');
  finishPlayAction('grassArea');
}

/* ② シャボン玉で遊ぶ

   軽い行動（②）の中では、いちばん機嫌が上がる遊び
   走り回らないので体力はあまり減らないが、
   ふわふわ飛ぶシャボン玉はこうちゃんのお気に入りなので、
   「体力が残っていないけれど機嫌を上げたい」ときの逃げ道になる
*/
function playWithBubbles() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 9;
  childMood.value += 7;
  addOutingPoint('grassArea', 6);
  parentEnergy.value -= 6;
  parentCalm.value -= 3;
  addMinutes(20);

  resultMessage.value = '芝生の上でシャボン玉を飛ばしました。ふわふわ飛んでいくシャボン玉を、こうちゃんは楽しそうに追いかけています。';

  tryCollectPlaceItem('grassArea');
  finishPlayAction('grassArea');
}

/* ===== こもれびの広場 ===== */

/* ① 木漏れ日の中を探検する */
function exploreSunlight() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 16;
  childMood.value += 10;
  addOutingPoint('secretSpot', 15);
  parentEnergy.value -= 14;
  parentCalm.value -= 4;
  addMinutes(25);

  resultMessage.value = '木漏れ日の中を歩いてみました。足元には小さな花や、きれいな葉っぱが落ちています。こうちゃんは宝物を探すように、夢中であたりを見ています。';

  tryCollectPlaceItem('secretSpot');
  finishPlayAction('secretSpot');
}

/* ② 広場の奥を見てみる

   広場のさらに奥を少し探してみる遊び
   （前はここに「二人で景色をながめる」があったが、
     体力も余裕も回復する、ほとんど休憩の行動になっていた
     休む行動は別枠の「ひとやすみ」にまとめたので、
     ここは広場らしい「奥を探してみる」遊びに置きかえている）

   ※ 文章で「枝を見つけた」と書かないこと
     アイテム（ふしぎな形の枝）が見つかるかどうかは
     tryCollectPlaceItem() の抽選で決まる（はじめては60%）
     文章のほうで先に見つけたことにしてしまうと、
     抽選にはずれた回に
     「枝を見つけました」→ でも「★ アイテム発見！」が出ない
     という食いちがいが起きてしまう
     （実際にそうなっていたので、探すところまでの文章に直した）

     見つけたことを伝えるのは、結果カードの
     「★ アイテム発見！『ふしぎな形の枝』を見つけました！」の役目
     （ほかの5か所の文章も、アイテムには触れずに遊びの様子だけを書いている）
*/
function exploreClearingDepths() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 10;
  childMood.value += 5;
  addOutingPoint('secretSpot', 9);
  parentEnergy.value -= 8;
  parentCalm.value -= 4;
  addMinutes(20);

  resultMessage.value = '広場の奥へ進んでみました。こうちゃんは木の根元をのぞきながら、「なにかあるかなー？」とわくわくしています。';

  tryCollectPlaceItem('secretSpot');
  finishPlayAction('secretSpot');
}

/* ============================================================
   秘密の小道（こもれびの広場へ続くミニゲーム）

   公園入口の「細い道の先へ行く」を、そのプレイではじめて選んだときだけ通る
   左・まん中・右の3レーンを動いて、上から流れてくる枝をよけながら、木漏れ日を集める

   ■ 流れ（secretPathPhase）
     ready    … 説明と「小道へ進む」「← 場所選びにもどる」ボタン（まだ何も動かない）
                「← 場所選びにもどる」で公園入口の「どこへ行く？」へ戻る（leaveSecretPathToEntrance()）
     playing  … ミニゲーム中（15秒）
     finished … 結果の文章と「先へ進む」ボタン
                「先へ進む」で secretSpot（こもれびの広場）へ入る

   ■ ご褒美として楽しむミニゲーム
     ・枝に当たっても GAME OVER にはならない（集めた木漏れ日が1つ減るだけ。0より下にはならない）
       本編のステータス（体力・機嫌・余裕）にはダメージを与えず、左右にもそのまま動ける
     ・木漏れ日をいくつ取っても、かならず広場へ行ける
     ・親子のステータスと時間は、いっさい変えない
     ・木漏れ日をたくさん集めたときだけ、おでかけポイントを少しだけボーナス（getSecretPathBonusPoint()）
       （集められなくても損はしない。木漏れ日の数で変わるのは、結果の文章とボーナスだけ）

   ■ BGM
     小道のあいだは公園BGMのまま（ここではBGMにさわらない）
     こもれびの広場BGMが始まるのは、広場へ入ったとき（goToPlace('secretSpot') の中）

   ■ 動かしかた
     requestAnimationFrame で、1コマごとに枝と木漏れ日の位置を進める
     位置は「フィールドの高さの何%か」で持っているので、
     画面の大きさが変わっても、こうちゃんの所まで届く時間は同じ

     ※ CSSの animation で動かさないのは、ページ下の「動きを減らす設定」の指定で
       animation がぜんぶ一瞬で終わるようになっていて、遊べなくなってしまうため

     ループが残らないように、次のときにかならず止める
     ・時間が終わったとき（finishSecretPathGame()）
     ・もう一度あそぶ／はじめの画面へ戻る（resetGame() → resetSecretPathGame()）
     ・ページから離れたとき（onUnmounted）
     ・そのほか、なにかの理由で「小道で遊んでいる最中」ではなくなったとき
       （1コマごとに確かめて、ちがえばその場で止まる。
         小道の画面からは GAME OVER・ゴールへ直接は行けないが、万一のときもループは残らない）
   ============================================================ */

/* いまの進み具合（小道へ入るたびに ready から始める） */
const secretPathPhase = ref<SecretPathPhase>('ready');

/* こうちゃんのレーン（はじめは、まん中） */
const secretPathPlayerLane = ref<SecretPathLane>(1);

/* いまフィールドに出ている枝と木漏れ日 */
const secretPathItems = ref<SecretPathItem[]>([]);

/* 集めた木漏れ日の数 */
const secretPathSunlightCount = ref(0);

/* 小道をぬけたときにもらった木漏れ日ボーナス（結果カードに「+3」と出すため。0 = なし） */
const secretPathBonusPoint = ref(0);

/* 始まってから何ミリ秒たったか（ゲームの時計）

   タブを切りかえているあいだは requestAnimationFrame が止まるので、この時計も止まる
   （戻ってきたときに、いきなり何秒も進んでしまわない） */
const secretPathElapsed = ref(0);

/* 「いたっ！」を出しておくのは、ゲームの時計が何ミリ秒になるまでか（0 = 出していない） */
const secretPathBumpUntil = ref(0);

/* 直前に枝に当たったとき、木漏れ日が本当に1つ減ったか

   0個のときに当たっても減らない（0のまま）ので、そのときは「✨ -1」を出さない
   （数が変わっていないのに「-1」と出ると、何が起きたか分かりにくくなるため） */
const secretPathBumpLost = ref(false);

/* 「いたっ！」の番号
   続けて枝に当たったときに、ふきだしを最初から出しなおすための key */
const secretPathBumpId = ref(0);

/* 道（レーン）をクリック・タップしたときに光らせるレーンと、ゲームの時計が何ミリ秒になるまで光らせるか
   （見た目だけ。指で押したときは「マウスを乗せる」が無いので、押したことをこれで伝える） */
const secretPathTapLane = ref<SecretPathLane | null>(null);
const secretPathTapUntil = ref(0);

/* マウスを乗せているレーン（乗せていないときは null）
   マウスのときだけ使う（指で押したときは「乗せる」が無いので、ここは変えない） */
const secretPathHoverLane = ref<SecretPathLane | null>(null);

/* 「✨ +1」を出しておくのは、ゲームの時計が何ミリ秒になるまでか */
const secretPathSparkleUntil = ref(0);

/* 「✨ +1」の番号
   続けて木漏れ日を取ったときに、ふわっと上がる動きを最初からやりなおすための key */
const secretPathSparkleId = ref(0);

/* 遊んでいる最中のカード（スマホ幅で、遊びはじめに画面の上へスクロールするための目印） */
const secretPathPlayRef = ref<HTMLElement | null>(null);

/* ここから下は画面に出さない入れもの（ref にしなくてよい） */
let secretPathFrameId: number | null = null; // requestAnimationFrame の予約番号
let secretPathLastTimestamp: number | null = null; // 前のコマの時刻
let secretPathSpawnQueue: SecretPathSpawn[] = []; // まだ出していない予定（時間の早い順）
let secretPathNextItemId = 0;
let secretPathFinishedAt = 0; // 結果が出た時刻（performance.now()）

/* フィールドを押しているポインター（マウス・指・ペン）の一時的な状態
   はなしたとき・キャンセルされたとき・リセットや終了のときに、releaseSecretPathPointer() でまとめて戻す */
let secretPathPointerId: number | null = null; // 押しているポインターの番号（押していないときは null）
let secretPathPointerField: HTMLElement | null = null; // pointer capture をしているフィールド
let secretPathPointerDownLane: SecretPathLane | null = null; // 押しはじめたレーン（短いタップのときに使う）
let secretPathPointerLastX = 0; // 横の移動を数えはじめた位置（1レーン動くたびに、そこから数えなおす）
let secretPathPointerDragged = false; // 押しているあいだに、横へ動かして1レーン動いたか（タップとして動かさない）
let secretPathPointerHeld = false; // 長押しになったか（タップとして動かさない）
let secretPathHoldTimer: ReturnType<typeof setTimeout> | null = null; // 長押しを待つ予約

/* はやく進んでいるか（キーと、フィールドの長押しを別々に持つ）
   片方をはなしても、もう片方を押しているあいだは はやいまま */
const isSecretPathKeyBoosting = ref(false);
const isSecretPathPointerBoosting = ref(false);

/* いま「小道で遊んでいる最中」かどうか
   キー操作・道のクリック／タップ・1コマごとの処理は、どれもこれを見てから動く */
const isSecretPathPlaying = computed(() => currentEvent.value === 'secretPath' && secretPathPhase.value === 'playing');

/* いま はやく進んでいるか（HUDの「⏩ 1.5x」と、1コマごとの時計の進め方に使う）
   遊んでいる最中でなければ、かならず false（結果の画面に「⏩ 1.5x」が残らない） */
const isSecretPathBoosting = computed(() => isSecretPathPlaying.value && (isSecretPathKeyBoosting.value || isSecretPathPointerBoosting.value));

/* 枝に当たった直後かどうか（「いたっ！」を出しているあいだ。見た目だけで、動きは止めない） */
const isSecretPathBumped = computed(() => isSecretPathPlaying.value && secretPathElapsed.value < secretPathBumpUntil.value);

/* 木漏れ日を取った直後かどうか（「✨ +1」と光を出しているあいだ） */
const isSecretPathSparkling = computed(() => isSecretPathPlaying.value && secretPathElapsed.value < secretPathSparkleUntil.value);

/* いま光らせているレーン（道をクリック・タップした直後だけ。それ以外は null） */
const secretPathFlashLane = computed(() => (isSecretPathPlaying.value && secretPathElapsed.value < secretPathTapUntil.value ? secretPathTapLane.value : null));

/* マウスを乗せているレーンを押したときに、こうちゃんが動く先のレーン

   押したレーンの方向へ1レーンだけ動くので、遠いレーンに乗せているときは「まん中」が動く先になる
   乗せていない・いまいるレーンに乗せているときは null（目印をはっきりさせない） */
const secretPathHoverDestination = computed(() => {
  const hoverLane = secretPathHoverLane.value;
  const currentLane = secretPathPlayerLane.value;

  if (!isSecretPathPlaying.value || hoverLane === null || hoverLane === currentLane) {
    return null;
  }

  return hoverLane < currentLane ? currentLane - 1 : currentLane + 1;
});

/* 残り時間（秒）。「あと 12秒」のように出す */
const secretPathTimeLeft = computed(() => Math.max(0, Math.ceil((secretPathDuration - secretPathElapsed.value) / 1000)));

/* 集めた木漏れ日の数に合わせた、結果の文章 */
const secretPathResultText = computed(() => getSecretPathResultText(secretPathSunlightCount.value));

/* 公園入口の「細い道の先へ行く」

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

/* requestAnimationFrame のループを止める（予約が無ければ何もしない） */
function stopSecretPathLoop() {
  if (secretPathFrameId !== null) {
    cancelAnimationFrame(secretPathFrameId);
    secretPathFrameId = null;
  }

  secretPathLastTimestamp = null;
}

/* 秘密の小道を、はじまる前の状態に戻す

   ループ・流れてくるもの・木漏れ日の数・こうちゃんの位置・時計を、まとめて片づける
   （hasDiscoveredSecretSpot はここでは戻さない。戻すのは resetGame() だけ） */
function resetSecretPathGame() {
  stopSecretPathLoop();
  releaseSecretPathControls();

  secretPathPhase.value = 'ready';
  secretPathPlayerLane.value = 1;
  secretPathItems.value = [];
  secretPathSunlightCount.value = 0;
  secretPathBonusPoint.value = 0;
  secretPathElapsed.value = 0;
  secretPathBumpUntil.value = 0;
  secretPathBumpLost.value = false;
  secretPathSparkleUntil.value = 0;
  secretPathTapLane.value = null;
  secretPathTapUntil.value = 0;
  secretPathHoverLane.value = null;
  secretPathSpawnQueue = [];
  secretPathFinishedAt = 0;
}

/* 「小道へ進む」（ミニゲームを始める）

   押すまでは何も動かないので、プレイヤーは説明を読んでから始められる */
function startSecretPathGame() {
  if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'ready') {
    return;
  }

  // 決定音「ポン♪」
  playDecisionSound();

  resetSecretPathGame();
  secretPathSpawnQueue = buildSecretPathSpawnQueue();
  secretPathPhase.value = 'playing';

  secretPathFrameId = requestAnimationFrame(runSecretPathFrame);

  scrollSecretPathIntoView();
}

/* スマホ幅のときだけ、遊ぶカードを画面のいちばん上へスクロールする

   スマホ幅ではページ全体がスクロールするので、
   フィールドと下の案内がいっしょに見える位置へ合わせておく
   （パソコンでは中央エリアの中に収まるので、何もしない） */
async function scrollSecretPathIntoView() {
  if (!import.meta.client || !window.matchMedia('(max-width: 700px)').matches) {
    return;
  }

  // カードが画面に出るのを待ってから
  await nextTick();

  secretPathPlayRef.value?.scrollIntoView({ block: 'start' });
}

/* 1コマぶんの処理（requestAnimationFrame から呼ばれる） */
function runSecretPathFrame(timestamp: number) {
  secretPathFrameId = null;

  // もう小道で遊んでいる最中ではない（リセット・画面が変わった など）ときは、ここで止まる
  if (!gameStarted.value || !isSecretPathPlaying.value) {
    stopSecretPathLoop();
    releaseSecretPathControls();
    return;
  }

  /* 前のコマからの時間

     50ミリ秒より長くあいたときは、50ミリ秒ぶんだけ進める
     処理が重くなったときなどに、枝がこうちゃんを「すり抜けて」しまわないようにするため */
  const delta = secretPathLastTimestamp === null ? 0 : Math.min(Math.max(timestamp - secretPathLastTimestamp, 0), 50);

  secretPathLastTimestamp = timestamp;

  /* はやく進んでいるあいだは、ゲームの時計そのものを1.5倍で進める
     出てくるタイミング・流れる速さ・残り時間・「いたっ！」などの長さが、ぜんぶ同じ時計でそろって速くなる
     （1コマで進むのは最大 50 × 1.5 = 75ミリ秒。枝が進むのは4.5%で、当たり判定の幅10%より小さいので すり抜けない） */
  advanceSecretPath(isSecretPathBoosting.value ? delta * secretPathBoostMultiplier : delta);

  // 時間切れで終わっていなければ、次のコマを予約する
  if (isSecretPathPlaying.value) {
    secretPathFrameId = requestAnimationFrame(runSecretPathFrame);
  }
}

/* ゲームの時計を delta ミリ秒進めて、出す・動かす・当たりを見る・片づける */
function advanceSecretPath(delta: number) {
  const elapsed = Math.min(secretPathElapsed.value + delta, secretPathDuration);

  secretPathElapsed.value = elapsed;

  // ① 予定の時間になったものを、フィールドのいちばん上に出す
  let nextSpawn = secretPathSpawnQueue[0];

  while (nextSpawn && nextSpawn.at <= elapsed) {
    secretPathSpawnQueue.shift();
    secretPathNextItemId += 1;
    secretPathItems.value.push({ id: secretPathNextItemId, kind: nextSpawn.kind, lane: nextSpawn.lane, y: secretPathSpawnY, hit: false });
    nextSpawn = secretPathSpawnQueue[0];
  }

  // ② ぜんぶ下へ進めて、こうちゃんに当たったかを見る
  const distance = (secretPathSpeed * delta) / 1000;
  let needsCleanup = false;

  for (const item of secretPathItems.value) {
    item.y += distance;

    if (item.y > secretPathRemoveY) {
      needsCleanup = true;
      continue;
    }

    // 当たり判定は「同じレーン ＋ こうちゃんの高さのあたりまで来た」だけで見る
    if (item.hit || item.lane !== secretPathPlayerLane.value) {
      continue;
    }

    // マイナス … まだ こうちゃんより上／プラス … こうちゃんより下
    const offset = item.y - secretPathPlayerY;

    // ③ 木漏れ日：こうちゃんに重なったら取る（枝より少しゆるめに見る）
    if (item.kind === 'sunlight' && offset >= -10 && offset <= 6) {
      item.hit = true;
      needsCleanup = true;

      secretPathSunlightCount.value += 1;
      secretPathSparkleUntil.value = elapsed + secretPathSparkleDuration;
      secretPathSparkleId.value += 1;

      // 「✨ +1」と「いたっ！」は同じ場所（こうちゃんの上）に出るので、
      // 重なって読めなくならないように、あとから起きたほうだけを出す
      secretPathBumpUntil.value = 0;

      playSunlightSound();
      continue;
    }

    // ④ 枝：こうちゃんの所まで来たら当たる → 集めた木漏れ日を1つ減らす（0より下にはしない）
    //    ・本編のステータス（体力・機嫌・余裕）には、いっさいさわらない（小道の中だけのペナルティ）
    //    ・枝1本につき1回だけ（item.hit）なので、同じ枝で何度も減ることはない
    //    ・当たったあとも、左右にはそのまま動ける
    if (item.kind === 'branch' && offset >= -7 && offset <= 3) {
      item.hit = true;

      const hasSunlightToLose = secretPathSunlightCount.value > 0;

      secretPathSunlightCount.value = Math.max(0, secretPathSunlightCount.value - 1);
      secretPathBumpLost.value = hasSunlightToLose;
      secretPathBumpUntil.value = elapsed + secretPathBumpEffectDuration;
      secretPathBumpId.value += 1;

      // 木漏れ日を取った直後の「✨ +1」が残っていたら消す（「いたっ！」と重ならないように、あとから起きたほうだけを出す）
      secretPathSparkleUntil.value = 0;

      playBranchBumpSound();
    }
  }

  // ⑤ 下へ出ていったものと、取った木漏れ日を片づける
  if (needsCleanup) {
    secretPathItems.value = secretPathItems.value.filter((item) => item.y <= secretPathRemoveY && !(item.kind === 'sunlight' && item.hit));
  }

  // ⑥ 15秒たったら、おしまい
  if (elapsed >= secretPathDuration) {
    finishSecretPathGame();
  }
}

/* 時間切れ（小道をぬけた）

   ここで「こもれびの広場を見つけた」ことになる
   このあと同じプレイのあいだは、ミニゲームをくり返さない */
function finishSecretPathGame() {
  stopSecretPathLoop();
  releaseSecretPathControls();

  secretPathPhase.value = 'finished';
  secretPathItems.value = [];
  secretPathSpawnQueue = [];
  secretPathBumpUntil.value = 0;
  secretPathBumpLost.value = false;
  secretPathSparkleUntil.value = 0;
  secretPathFinishedAt = performance.now();

  /* 木漏れ日ボーナス

     ・addOutingPoint() ではなく、そのまま足す
       （「2回目の場所は半分」は場所の探検のためのルールで、小道は場所ではないため）
     ・上部ステータスの「おでかけポイント」の横にも +3 と出るように、今回の変化にも入れておく
       ほかのステータスと時間は動かしていないので 0 のまま（上部には何も出ない）
       statusChanges は、広場へ入るとき goToPlace() の中で null に戻る
     ・時間切れは1回の小道につき1回だけなので、ボーナスが二重に入ることはない */
  const bonusPoint = getSecretPathBonusPoint(secretPathSunlightCount.value);

  secretPathBonusPoint.value = bonusPoint;

  if (bonusPoint > 0) {
    outingPoint.value += bonusPoint;
    statusChanges.value = { childEnergy: 0, childMood: 0, outingPoint: bonusPoint, parentEnergy: 0, parentCalm: 0, minutes: 0 };
  }

  hasDiscoveredSecretSpot.value = true;

  // 「先へ進む」だけの画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;

  // 「木々のすき間から、まぶしい光が…」に合わせて、キラリン♪
  playItemSound();
}

/* 「先へ進む」（こもれびの広場へ）

   BGMの入れかえ（公園BGMを止める → こもれびの広場BGM）は、goToPlace() の中のまま
   ＝ 広場へ着いたこの瞬間に「こもれびの奥で」が始まる */
function enterSecretSpotFromPath() {
  if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'finished') {
    return;
  }

  if (performance.now() - secretPathFinishedAt < secretPathLeaveGuard) {
    return;
  }

  goToPlace('secretSpot');

  /* 小道の状態は、画面が変わってから片づける
     <Transition> で消えていく小道の画面は、もう描きなおされないので、
     フェードアウトの途中で結果の文章が変わって見えることはない */
  resetSecretPathGame();
}

/* 「← 場所選びにもどる」（はじまる前だけ。公園入口の「どこへ行く？」へ戻る）

   小道に入らずに引き返すだけなので、何も変えない
   ・時間・親子のステータス・おでかけポイント・アイテム・visitedPlaces は、そのまま
   ・hasDiscoveredSecretSpot も false のまま
     → あとでもう一度「細い道の先へ行く」を選ぶと、また ready 画面から始まる
   ・BGMは公園BGMのまま（goToPlace() がBGMを入れかえるのは secretSpot のときだけ）
   ・小道の状態は、画面が変わってから片づける（enterSecretSpotFromPath() と同じ）
   ・カーソルは「細い道の先へ行く」に合わせる（restoreEntranceCursor()。小道へ入るときに lastSelectedPlace が secretPath になっている） */
function leaveSecretPathToEntrance() {
  if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'ready') {
    return;
  }

  goToPlace('parkEntrance');
  resetSecretPathGame();
  restoreEntranceCursor();
}

/* こうちゃんを左（-1）か右（+1）へ、1レーンだけ動かす

   ・遊んでいる最中でなければ動かさない
   ・枝に当たった直後も、ふつうに動ける（枝のペナルティは木漏れ日 -1 だけ）
   ・左はしでさらに左、右はしでさらに右は、その場のまま */
function moveSecretPathPlayer(direction: -1 | 1) {
  if (!isSecretPathPlaying.value) {
    return;
  }

  const nextLane = secretPathPlayerLane.value + direction;

  if (nextLane === 0 || nextLane === 1 || nextLane === 2) {
    secretPathPlayerLane.value = nextLane;
  }
}

/* フィールドの横の位置（clientX）が、どのレーンの上か（フィールドの外なら null） */
function getSecretPathLaneAt(field: HTMLElement, clientX: number, clientY: number): SecretPathLane | null {
  const rect = field.getBoundingClientRect();

  if (rect.width <= 0 || clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) {
    return null;
  }

  const lane = Math.floor(((clientX - rect.left) / rect.width) * 3);

  return lane === 0 || lane === 1 || lane === 2 ? lane : null;
}

/* はやく進む・ポインターを押している状態を、ぜんぶ元に戻す

   キーをはなしたこと（keyup）や、指をはなしたこと（pointerup）が届かないときでも、
   はやいまま・押したままの扱いが残らないように、次のときにかならず呼ぶ
   ・時間が終わったとき（finishSecretPathGame()）
   ・リセットしたとき（resetSecretPathGame()）
   ・ウィンドウからフォーカスが外れた・タブが見えなくなったとき
   ・ページから離れたとき（onUnmounted）
   ・なにかの理由で「小道で遊んでいる最中」ではなくなったとき（runSecretPathFrame()） */
function releaseSecretPathControls() {
  isSecretPathKeyBoosting.value = false;
  releaseSecretPathPointer();
}

/* ポインター（マウス・指・ペン）を押している状態だけを、元に戻す */
function releaseSecretPathPointer() {
  if (secretPathHoldTimer !== null) {
    clearTimeout(secretPathHoldTimer);
    secretPathHoldTimer = null;
  }

  if (secretPathPointerField && secretPathPointerId !== null) {
    try {
      if (secretPathPointerField.hasPointerCapture(secretPathPointerId)) {
        secretPathPointerField.releasePointerCapture(secretPathPointerId);
      }
    } catch {
      // もう押していないポインターのときは、何もしなくてよい
    }
  }

  secretPathPointerId = null;
  secretPathPointerField = null;
  secretPathPointerDownLane = null;
  secretPathPointerLastX = 0;
  secretPathPointerDragged = false;
  secretPathPointerHeld = false;
  isSecretPathPointerBoosting.value = false;
}

/* フィールドのポインター操作（マウス・指・ペンを Pointer Events でまとめて受け取る）

   ■ 短く押す（クリック・タップ）
     押したレーンの方向へ、1レーンだけ動く（← → キーと同じ「1回で1レーン」）
     左はしで右はしのレーンを押すと まん中へ、もう1回押すと右はしへ
     （いっきに2レーン動けると、まん中のレーンの枝をすり抜けられて、道を押す操作だけ有利になるため）
     長押し・ドラッグと見分けるため、動かすのは はなしたとき（pointerup）

   ■ 押したまま横へ動かす（しきい値をこえるたびに1レーン）
     しきい値はマウスと指で分けてある（→ getSecretPathSwipeThreshold）
     ・マウス             … ドラッグ。70pxこえるたびに1レーンずつ動く（左はし → まん中 → 右はし）
     ・指・ペン           … フリック。32pxで1レーン。1回押すあいだに1レーンだけ（大きくはらっても、まん中で止まる）
     ・長押しになったあと … 指・ペンでも、スライドでこえるたびに1レーンずつ動ける
     長押しになる前に横へ動いたら、長押しの判定はやめる（フリック・ドラッグとして扱う）

   ■ 長押し（secretPathHoldBoostDelay だけ押しつづける）
     はなすまで、はやく進む（ゲームの時計が1.5倍）

   ※ setPointerCapture … 押したままフィールドの外へ出ても、pointerup / pointercancel を受け取るため
   ※ 最初に押したポインターだけで操作する（2本目の指は使わない） */
function handleSecretPathPointerDown(event: PointerEvent) {
  // 右クリックなど、遊んでいる最中以外では動かさない
  if (event.button !== 0 || !isSecretPathPlaying.value) {
    return;
  }

  // 長押しのメニュー・文字の選択・フォーカス移動を起こさない
  event.preventDefault();

  const field = event.currentTarget as HTMLElement;

  if (secretPathPointerId !== null) {
    // べつの指で まだ押している（capture が続いている）ときは、あとから押したほうを使わない
    if (secretPathPointerId !== event.pointerId && field.hasPointerCapture(secretPathPointerId)) {
      return;
    }

    // はなしたことが届かなかった古い状態は、ここで片づけてから始めなおす
    releaseSecretPathPointer();
  }

  const pointerId = event.pointerId;

  secretPathPointerId = pointerId;
  secretPathPointerField = field;
  secretPathPointerDownLane = getSecretPathLaneAt(field, event.clientX, event.clientY);
  secretPathPointerLastX = event.clientX;

  try {
    field.setPointerCapture(pointerId);
  } catch {
    // capture できなくても、フィールドの中で はなせばふつうに動く
  }

  secretPathHoldTimer = setTimeout(() => {
    secretPathHoldTimer = null;

    if (!isSecretPathPlaying.value || secretPathPointerId !== pointerId) {
      return;
    }

    secretPathPointerHeld = true;
    isSecretPathPointerBoosting.value = true;
  }, secretPathHoldBoostDelay);
}

function handleSecretPathPointerMove(event: PointerEvent) {
  // マウスを乗せているレーン（動く先の目印をはっきりさせるため。指には「乗せる」が無いので、マウスのときだけ）
  if (event.pointerType === 'mouse') {
    secretPathHoverLane.value = getSecretPathLaneAt(event.currentTarget as HTMLElement, event.clientX, event.clientY);
  }

  if (event.pointerId !== secretPathPointerId || !isSecretPathPlaying.value) {
    return;
  }

  swipeSecretPathPlayer(event);
}

function handleSecretPathPointerUp(event: PointerEvent) {
  if (event.pointerId !== secretPathPointerId) {
    return;
  }

  if (isSecretPathPlaying.value) {
    // pointermove が届く前に はなした、すばやいフリックも拾う
    swipeSecretPathPlayer(event);

    // 横へ動かさず、長押しにもならなかった → 短いクリック・タップ
    if (!secretPathPointerDragged && !secretPathPointerHeld) {
      tapSecretPathLane(secretPathPointerDownLane);
    }
  }

  releaseSecretPathPointer();
}

/* キャンセルされたとき（ブラウザがジェスチャーを引き取った など）は、動かさずに元へ戻すだけ */
function handleSecretPathPointerCancel(event: PointerEvent) {
  if (event.pointerId !== secretPathPointerId) {
    return;
  }

  releaseSecretPathPointer();
}

function handleSecretPathPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'mouse') {
    secretPathHoverLane.value = null;
  }
}

/* 押したまま横へ、しきい値より大きく動いていたら、その方向へ1レーンだけ動かす */
function swipeSecretPathPlayer(event: PointerEvent) {
  const distance = event.clientX - secretPathPointerLastX;

  if (Math.abs(distance) < getSecretPathSwipeThreshold(event.pointerType)) {
    return;
  }

  // 指・ペンのフリックは、1回押すあいだに1レーンだけ（長押しになったあとのスライドと、マウスのドラッグは何度でも）
  const canMoveAgain = event.pointerType === 'mouse' || secretPathPointerHeld;

  if (secretPathPointerDragged && !canMoveAgain) {
    return;
  }

  // 長押しになる前に横へ動いたら、長押しにはしない
  if (secretPathHoldTimer !== null) {
    clearTimeout(secretPathHoldTimer);
    secretPathHoldTimer = null;
  }

  secretPathPointerDragged = true;
  secretPathPointerLastX = event.clientX;

  const laneBefore = secretPathPlayerLane.value;

  moveSecretPathPlayer(distance < 0 ? -1 : 1);

  // 動いた先のレーンを一瞬光らせる（はしで動けなかったときは光らせない）
  if (secretPathPlayerLane.value !== laneBefore) {
    secretPathTapLane.value = secretPathPlayerLane.value;
    secretPathTapUntil.value = secretPathElapsed.value + secretPathTapFlashDuration;
  }
}

/* 短く押したレーンの方向へ、1レーンだけ動かす（いまいるレーンを押したときは、何もしない・光らせもしない）
   押したレーンを一瞬光らせて、どこを押したかが目で分かるようにする */
function tapSecretPathLane(lane: SecretPathLane | null) {
  const currentLane = secretPathPlayerLane.value;

  if (lane === null || lane === currentLane) {
    return;
  }

  moveSecretPathPlayer(lane < currentLane ? -1 : 1);

  secretPathTapLane.value = lane;
  secretPathTapUntil.value = secretPathElapsed.value + secretPathTapFlashDuration;
}

/* ↑ キーをはなしたとき（window の keyup。遊んでいる最中かどうかに関係なく、はやく進むのをやめる） */
function handleSecretPathKeyup(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') {
    isSecretPathKeyBoosting.value = false;
  }
}

/* ウィンドウからフォーカスが外れた・タブが見えなくなったとき
   keyup や pointerup が届かないことがあるので、はやく進む・押している状態を戻しておく */
function handleSecretPathWindowBlur() {
  releaseSecretPathControls();
}

function handleSecretPathVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    releaseSecretPathControls();
  }
}

/* 小道で遊んでいる最中のキー操作（handleKeydown() から呼ばれる）

   ・← / A … 左へ1レーン
   ・→ / D … 右へ1レーン
   ・↑       … 押しているあいだだけ、はやく進む（はなすと handleSecretPathKeyup() で元の速さに戻る）
   ・↓ / Enter / Space … 何もしない（ページのスクロールや、ボタンの押しまちがいを止めるだけ）
   ・それ以外（Tab など）… ブラウザのふつうの動きにまかせる

   ※ ← → は押しっぱなし（event.repeat）では続けて動かさない（1回押すと1レーン）
   ※ ↑ は押しっぱなしで何度届いても、はやいままでよい
   ※ はじまる前・終わったあとは、ここへは来ない（ふつうのコマンド操作に戻る） */
function handleSecretPathKeydown(event: KeyboardEvent) {
  // Ctrl + A（ぜんぶ選択）などのショートカットは、じゃましない
  const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
  const isLeftKey = event.key === 'ArrowLeft' || (!hasModifier && event.code === 'KeyA');
  const isRightKey = event.key === 'ArrowRight' || (!hasModifier && event.code === 'KeyD');

  if (isLeftKey || isRightKey) {
    event.preventDefault();

    if (event.repeat) {
      return;
    }

    moveSecretPathPlayer(isLeftKey ? -1 : 1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    isSecretPathKeyBoosting.value = true;
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    // サウンドON/OFFのボタンを選んでいるときだけは、ボタン本来の操作にまかせる
    const target = event.target as HTMLElement | null;

    if (target?.closest?.('.sound-toggle')) {
      return;
    }

    event.preventDefault();
  }
}

/* ============================================================
   ひとやすみ（どの場所でも使える共通のケア行動）

   通常の場所では、コマンドを2つの枠に分けている
   ・「どうする？」  … その場所ならではの遊び（すべる・どんぐりを拾う など）
   ・「☕ ひとやすみ」… どの場所でも同じ、親子の状態を整える行動

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

  // 休憩・おやつの結果だという印（結果カードに「次の場所を選ぶ」ではなく「← もどる」を出す）
  isCareActionResult.value = true;

  // 結果カードが出て「← もどる」だけの画面になるので、一番上（0）に戻す
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

  resultMessage.value = 'ベンチに座って、親子で少し休憩しました。こうちゃんも少し元気を取り戻したようです。';

  // finishPlayAction() は呼ばない（上の説明のとおり）
  finishCareAction();
}

/* ② おやつをあげる（通常の探検中）

   「☕ ひとやすみ」→「おやつをあげる ＞」→ おやつバッグ で選んだときに呼ばれる
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
  // ※ ここで ☕ ひとやすみ とおやつバッグも閉じる
  startStatusChanges();

  childEnergy.value += snack.energy;
  childMood.value += snack.mood;
  parentCalm.value += 2;
  addMinutes(snack.minutes);

  resultMessage.value = `ベンチに座って${snack.name}を食べました。こうちゃんはうれしそうにもぐもぐしています。`;

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

  resultMessage.value = 'しばらく探していると、道路の向こうを救急車が走っていきました。こうちゃんは「いた！」と大喜びです！';

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

  resultMessage.value = '二人で耳をすませていると、ピーポーの音がだんだん遠ざかっていきました。こうちゃんは最後まで「ピーポー」とまねをしています。';

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

  resultMessage.value = '「またこんど見ようね」と声をかけて、遊びに戻りました。こうちゃんは何度か後ろをふりかえっています。';

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

  resultMessage.value = '二人でしゃがんで、じっくり見つめました。こうちゃんは「てちてち歩いている、かわいい」と満足げです。';

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

  resultMessage.value = 'そっと手を近づけると、テントウムシが指にちょこんと乗りました。「のった！」こうちゃんはうれしそうに見ています。';

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

  resultMessage.value = 'テントウムシがぱっと飛び立ちました。「ばいばーい！」こうちゃんは空に向かって手をふっています。';

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

  resultMessage.value = '飼い主さんに聞いて、近くで見せてもらいました。「わんわん、かわいいね！」こうちゃんは大喜びです。';

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

  resultMessage.value = 'だっこで少し離れて見ていると、こうちゃんは「わんわん、こっち見た！」とうれしそうです。';

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

  resultMessage.value = '手をつないで道をあけると、犬はそのまま歩いていきました。「わんわん、ばいばーい！」こうちゃんは手をふっています。';

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

  resultMessage.value = 'すぐにかけよってぎゅっとだっこ。こうちゃんは肩にぺたんと顔をつけて、少しずつ落ち着いてきました。';

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

  resultMessage.value = 'ひざをそっとなでながら「いたいのいたいの、とんでいけ〜！」。こうちゃんは空を見上げて、「とんでった！」とにっこりしました。';

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

  resultMessage.value = '「大丈夫？」と声をかけて待っていると、こうちゃんは「だいじょうぶ」と言って、自分でよいしょと立ち上がりました。ひざの砂をぱんぱんとはらっています。';

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

  resultMessage.value = '手をつないで噴水のすぐそばまで行きました。こうちゃんは水しぶきに向かって、きゃーっと走りまわっています！';

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

  resultMessage.value = '少し離れた場所から、二人でながめました。水の音を聞きながら、こうちゃんは指をさして笑っています。';

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

  resultMessage.value = '「またあとで見ようね」と声をかけて、遊びに戻りました。こうちゃんは何度か噴水を振り返っています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== ゴール ===== */

/* 総合スコア（0〜100点）と、その内訳を作る

   点数の計算そのものは composables/useScore.ts の calculateScore() にある
   ここは「いまの状態を渡して、返ってきた答えを入れる」だけ
   （配点・ボーナス・減点の数字は、ぜんぶあちらにまとめてある）
*/
function calculateFinalScore() {
  const { totalScore, breakdown } = calculateScore({
    outingPoint: outingPoint.value,
    hasVisitedSecretSpot: isVisited('secretSpot'),
    collectedItemCount: collectedItems.value.length,
    currentMinutes: currentMinutes.value,
    parentEnergy: parentEnergy.value,
    childMood: childMood.value,
    childEnergy: childEnergy.value,
    parentCalm: parentCalm.value,
    tantrumCount: tantrumCount.value,
    keepInRange,
  });

  scoreBreakdown.value = breakdown;
  finalScore.value = totalScore;
}

/* ゴールしたときの成績（ランク・見出し・文章）を決める

   ① 総合スコアを計算する（特殊エンドでもスコアは表示するので、いちばん先に呼ぶ）
   ② ランクと文章は composables/useScore.ts の judgeEnding() が決める
      （いやいや3回以上の特殊エンド、S+ / S / A / B / C / D の境目や、
        同じランクの中での文章の出しわけも、ぜんぶあちらにある）

   ※ GAME OVERのときは goToGoal() が先に return するので、この関数は呼ばれない
   ※ S+の曲の解放（localStorageへの保存）は、このあとの unlockSPlusSongIfEarned() が受けもつ
*/
function judgeResult() {
  calculateFinalScore();

  const { rank, title, message } = judgeEnding({
    totalScore: finalScore.value,
    tantrumCount: tantrumCount.value,
    childEnergy: childEnergy.value,
    childMood: childMood.value,
    parentEnergy: parentEnergy.value,
    parentCalm: parentCalm.value,
    currentMinutes: currentMinutes.value,
    visitedPlaceCount: visitedPlaces.value.length,
    playCount: playCount.value,
    fussMoodLine,
    totalPlaceCount,
    playedALotLine,
  });

  endingRank.value = rank;
  endingTitle.value = title;
  endingMessage.value = message;
}

/* S+ランクになったら、うた入りエンディングBGMをサウンドトラックに解放する

   ・S+ランクでなければ、何もしない（Sランク・特殊エンドなどでは解放しない）
   ・このブラウザではじめての解放なら、リザルト画面に「新しい曲が追加されました！」を出す
   ・すでに解放済みなら、お知らせは出さない
     （うた入りの曲そのものは、解放済みかどうかに関係なく、S+ランクなら毎回流す → getResultBgmSrc）

   ※ 解放したかどうかは、ゲームの記録とは別の「実績」として localStorage に残す
     もう一度あそんでも、ブラウザを閉じても、ロックには戻らない

   ※ judgeResult() でランクが決まったあとに呼ぶこと（→ goToGoal）
*/
function unlockSPlusSongIfEarned() {
  // 前のゴールのお知らせが残らないように、まず消しておく
  isSPlusSongNewlyUnlocked.value = false;

  if (endingRank.value !== 'S+ランク') {
    return;
  }

  /* もう解放済みなら、お知らせは出さない
     保存場所（localStorage）も読みなおしているのは、
     このページを開いたあとに、別のタブでS+を取っていることもあるため */
  if (hasUnlockedSPlusSong.value || loadHasUnlockedSPlusSong()) {
    hasUnlockedSPlusSong.value = true;

    return;
  }

  // このブラウザで、はじめての解放
  hasUnlockedSPlusSong.value = true;
  isSPlusSongNewlyUnlocked.value = true;
  saveSPlusSongUnlocked();
}

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

  // サブメニュー「☕ ひとやすみ」も閉じておく
  // （公園入口からそのままゴールへ向かうこともあるため）
  closeCareMenu();

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

   すぐにはゴールへ向かわず、「公園の出口へ向かう？」の確認ダイアログを開く
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

/* 確認ダイアログを閉じる（「もう少し遊ぶ」・Escape・ダイアログの外のクリック）

   公園入口に戻るだけで、時間もステータスも変わらない
   うしろの「どこへ行く？」は「公園の出口へ向かう」が選ばれたまま */
function closeGoalConfirm() {
  isGoalConfirmOpen.value = false;
  selectedGoalConfirmIndex.value = 0;
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
     GAME OVERになってすぐ（0.7秒の待ち時間のうちに）押しても、
     あとからタイトル画面でGAME OVERの曲が鳴りだすことはない */
  stopParkBgm();
  stopSecretBgm();
  stopTantrumBgm();
  stopResultBgm();
  stopGameOverBgm();
  playTitleBgmSoon();

  childEnergy.value = 100;
  childMood.value = 55;
  outingPoint.value = 0;
  parentEnergy.value = 100;
  parentCalm.value = 100;
  currentTime.value = '09:00';

  visitedPlaces.value = [];
  collectedItems.value = [];
  playCount.value = 0;

  // 秘密の小道も「まだ広場を見つけていない」状態に戻す
  // （ミニゲームのループ・流れてくるもの・木漏れ日の数・こうちゃんの位置も、まとめて片づける）
  resetSecretPathGame();
  hasDiscoveredSecretSpot.value = false;

  isTantrum.value = false;
  tantrumCount.value = 0;

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

     ※ ゲーム中に開いていたおやつバッグは、このあとの closeCareMenu() で閉じる */
  selectedSnackIds.value = [];
  isSnackSelectionOpen.value = false;

  // あそびかた画面も閉じた状態に戻しておく
  // （もう一度あそぶ・はじめの画面へ戻る のあとに、あそびかたが開いたまま残らないようにする）
  isHowToPlayOpen.value = false;

  // いやいや発生の演出も消しておく
  // （残っていると、タイトル画面の上に前回の「いやいや発生！」が出たままになる）
  hideTantrumAlert();

  // サブメニュー「☕ ひとやすみ」も閉じておく
  // （前回のプレイで開いたままGAME OVERになっていることがあるため）
  closeCareMenu();

  // 「公園の出口へ向かう？」の確認ダイアログも閉じておく（念のため）
  closeGoalConfirm();

  resultMessage.value = '';
  statusChanges.value = null;
  isCareActionResult.value = false;

  // 前回のプレイで最後に入った場所を忘れる（新しいプレイの公園入口は、先頭から選ぶ）
  lastSelectedPlace.value = null;
  isCommandPointerPaused.value = false;

  endingRank.value = '';
  endingTitle.value = '';
  endingMessage.value = '';

  /* うた入りBGMの「新しい曲が追加されました！」のお知らせも消す（その1プレイだけの表示）

     ※ hasUnlockedSPlusSong（解放済みかどうか）と、localStorage の解放情報は、ここでは戻さない
       一度解放した曲は、もう一度あそんでも、はじめの画面へ戻っても、ロックに戻さないため */
  isSPlusSongNewlyUnlocked.value = false;

  // 前回の総合スコアと内訳が残らないように、0と空の配列に戻す
  finalScore.value = 0;
  scoreBreakdown.value = [];

  // 演出用に控えていたものも空に戻す
  foundItemsThisAction.value = [];
  randomEventText.value = '';
  randomEventEffects.value = [];
  tantrumText.value = '';
  // ※ 「✨ ナイス対応！」の表示は、上の resetTantrumState() で空に戻している

  // 今回追加したGAME OVER用のstateも空に戻す
  gameOverTitle.value = '';
  gameOverMessage.value = '';

  // とつぜんのできごとの予定も空に戻す
  // ※ 戻しておかないと、前回のプレイの予定が
  //   次のゲームの1回目の行動のあとに出てきてしまう
  pendingSuddenEvent.value = null;

  // 行動前の控えも0に戻しておく（前回の記録が残らないようにする）
  statusBefore.value = {
    childEnergy: 0,
    childMood: 0,
    outingPoint: 0,
    parentEnergy: 0,
    parentCalm: 0,
    minutes: 0,
  };

  currentEvent.value = 'parkEntrance';
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
    // 休憩・おやつの結果 … 「← もどる」＝いまいる場所の「どうする？」へ戻る
    if (isCareResultBackVisible.value) {
      backToPlaceFromCareResult();
      return;
    }

    // それ以外の結果 … 「次の場所を選ぶ」
    goToNextPlace();
    return;
  }

  /* おやつバッグが開いているときは、いちばん先にそちらを見る

     ひとやすみの中でバッグを開いているあいだは isCareMenuVisible も true のままなので、
     下のサブメニューの処理より前に置く
     （いやいやタイムのバッグも、ここで受け取る）
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

  /* サブメニュー「☕ ひとやすみ」が開いているときは、そちらを優先する

     開いているあいだ、プレイヤーが見て選んでいるのはサブメニューなので、
     メインコマンド（selectedCommandIndex）のほうは見ない

     ※ isCareMenuVisible を使うのがポイント
       「画面に出ているか」まで見てくれるので、
       結果カードが出ているときなど、見えていないサブメニューが
       うっかり実行されることがない
  */
  if (isCareMenuVisible.value) {
    // 0 休憩する
    if (selectedCareCommandIndex.value === 0) {
      takeCommonBreak();
      return;
    }

    // 1 おやつをあげる ＞（おやつバッグを開くだけで、ここではまだ食べない）
    // バッグが空のときは画面にこのコマンドが無いので、念のため残りも確かめる
    if (selectedCareCommandIndex.value === 1 && snackLeft.value > 0) {
      openSnackMenu('exploring');
      return;
    }

    return;
  }

  // 毎回 .value と書かなくてよいように、番号を取り出しておく
  const index = selectedCommandIndex.value;

  /* 通常の場所6か所で共通の、下2つのコマンドをまとめて受け取る

     2 休憩・おやつ         → サブメニューを開く
     3 ← 場所選びにもどる   → 公園入口の「どこへ行く？」へ（この場所のコマンドを選んだ状態で）

     場所ごとの switch より前に書いておくと、
     下の6か所に同じ2行を書き足さなくてよい
  */
  if (isNormalPlace.value) {
    if (index === careMenuCommandIndex) {
      openCareMenu();
      return;
    }

    if (index === leavePlaceCommandIndex) {
      goToNextPlace();
      return;
    }
  }

  switch (currentEvent.value) {
    /* 公園入口
       0 すべり台／1 砂場／2 どんぐりの木／3 池／4 芝生広場
       5 秘密の場所（見つけているときだけ画面に出る）
       最後 公園の出口へ向かう（ゴール）

       ※ 秘密の場所がまだ出ていないときは、その行が画面に無いので
         ゴールが1つくり上がって5番目になる（goalCommandIndex で見る）
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
      } else if (index === goalCommandIndex.value) {
        openGoalConfirm();
      }
      break;

    /* すべり台
       0 一緒にすべる／1 下で見守る
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'slide':
      if (index === 0) {
        playSlide();
      } else if (index === 1) {
        watchSlide();
      }
      break;

    /* 砂場
       0 一緒に大きな山を作る／1 砂のトンネルを作る
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'sandbox':
      if (index === 0) {
        playSandbox();
      } else if (index === 1) {
        buildSandTunnel();
      }
      break;

    /* どんぐりの木
       0 一緒にどんぐりを拾う／1 どんぐりをころがして遊ぶ
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'acornArea':
      if (index === 0) {
        collectAcorns();
      } else if (index === 1) {
        rollAcorns();
      }
      break;

    /* 池
       0 白鳥を近くで見る／1 コイに餌をあげる
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'pond':
      if (index === 0) {
        watchSwansClose();
      } else if (index === 1) {
        feedKoi();
      }
      break;

    /* 芝生広場
       0 追いかけっこする／1 シャボン玉で遊ぶ
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'grassArea':
      if (index === 0) {
        playTagOnGrass();
      } else if (index === 1) {
        playWithBubbles();
      }
      break;

    /* こもれびの広場
       0 木漏れ日の中を探検する／1 広場の奥を見てみる
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'secretSpot':
      if (index === 0) {
        exploreSunlight();
      } else if (index === 1) {
        exploreClearingDepths();
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
       おやつが残っているとき   0 お話する／1 だっこ／2 おやつをあげる ＞／3 少し待ってみる
       おやつが0個のとき       0 お話する／1 だっこ／2 少し待ってみる（おやつの行は画面に無い）

       「おやつをあげる ＞」はおやつバッグを開くだけ
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
const { gameScreenRef, moveSnackSelectionToHovered, updateEntranceColumns, focusTitleMainButton } = useKeyboardControls({
  titleEntered,
  gameStarted,
  isSnackSelectionOpen,
  isHowToPlayOpen,
  isScreenChanging,
  currentEvent,
  resultMessage,
  selectedCommandIndex,
  selectedCareCommandIndex,
  selectedSnackMenuIndex,
  selectedGoalConfirmIndex,
  isNormalPlace,
  isCareMenuVisible,
  careCommandCount,
  isSnackMenuVisible,
  snackMenuBackIndex,
  commandCount,
  goalCommandIndex,
  isGoalConfirmVisible,
  isSecretPathPlaying,
  startButtonRef,
  soundtrackButtonRef,
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
  closeCareMenu,
  closeSnackMenu,
  closeGoalConfirm,
  confirmGoToGoal,
  focusFirstSnackOption,
  pauseCommandPointer,
  handleSecretPathKeydown,
});

/* 画面が表示されたら、秘密の小道のキー・画面幅・マウスの受付をはじめる
   公園入口の「列の数」は画面幅で変わるので、最初に1回調べて、
   そのあとは幅が変わるたびに調べ直す

   ※ ↑↓←→ などのキーボード操作の受付は、useKeyboardControls() の中で登録している
*/
onMounted(() => {
  // 秘密の小道：↑ をはなしたら はやく進むのをやめる／フォーカスが外れたら、はやい・押している状態を戻す
  window.addEventListener('keyup', handleSecretPathKeyup);
  window.addEventListener('blur', handleSecretPathWindowBlur);
  document.addEventListener('visibilitychange', handleSecretPathVisibilityChange);

  updateEntranceColumns();
  window.addEventListener('resize', updateEntranceColumns);

  // 休憩・おやつの「← もどる」のあと、マウスを動かしたらコマンド枠へのマウス操作を戻す
  window.addEventListener('pointermove', handleWindowPointer);
  window.addEventListener('pointerdown', handleWindowPointer);

  /* A画面のメインのボタン「はじめる」へフォーカスを当てておく
     ページを開いたときのほか、/soundtrack から戻ってきたときもここを通る
     （このページは、もう一度まっさらに作り直されるため） */
  focusTitleMainButton();

  /* 前回のサウンドの設定を思い出す

     localStorage には文字しか入らないので、'true' / 'false' という
     「文字」で戻ってくる。保存したことが無いときは null になる
     null のときは、最初に決めた true（＝ON）のままにする
  */
  try {
    const savedSoundSetting = localStorage.getItem(soundStorageKey);

    if (savedSoundSetting === 'false') {
      soundEnabled.value = false;
    } else if (savedSoundSetting === 'true') {
      soundEnabled.value = true;
    }
  } catch {
    // 読み込めなくても、初期値のONで普通に遊べる
  }

  /* 前回の音量を思い出す

     localStorage には文字しか入らないので、'70' のような「文字」で戻ってくる
     保存したことが無いときは null になる

     ※ null をそのまま Number() に入れると 0 になってしまうので、
       先に「保存されているか」を見てから数字に直している
     ※ 数字にならない・0未満・100より大きい、のときは
       最初に決めた100%（そのままの大きさ）のままにする
  */
  try {
    const savedSoundVolume = localStorage.getItem(soundVolumeStorageKey);

    if (savedSoundVolume !== null) {
      const percent = Number(savedSoundVolume);

      if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
        soundVolumePercent.value = Math.round(percent);
      }
    }
  } catch {
    // 読み込めなくても、初期値の100%で普通に遊べる
  }

  /* サウンドのON/OFFと音量を、ここでそろえておく（0% ＝ ミュート）

     この2つは別々に保存しているので、
     前に遊んだときの保存がかみ合っていないことがある
     （たとえば「ミュートだが音量は70%」というメモが残っている、など）
     そのままにすると、アイコンは 🔊× なのにスライダーは70%、
     という食いちがった見た目になってしまうので、開いたときに1回そろえる

     ※ ここではBGMを鳴らしたり止めたりしない
       ページを開いた直後は、まだどのBGMも鳴っていないため
  */
  if (!soundEnabled.value) {
    // ミュートで始まるとき … 音量も0%にそろえ、解除したときの戻り先を覚えておく
    if (soundVolumePercent.value > 0) {
      volumeBeforeMute = soundVolumePercent.value;
    }

    soundVolumePercent.value = 0;
  } else if (soundVolumePercent.value === 0) {
    // 0%で始まるとき … 音が出ないので、スピーカーもミュートにそろえる
    soundEnabled.value = false;
  } else {
    // ふつうに音が出る状態 … いまの大きさを、そのまま戻り先にしておく
    volumeBeforeMute = soundVolumePercent.value;
  }

  /* S+ランク限定のうた入りBGMを、前に解放しているかを思い出す
     （サーバー側では localStorage を読めないので、ブラウザで動くここで読む）
     解放済みなら、次にS+を取っても「新しい曲が追加されました！」は出ない */
  hasUnlockedSPlusSong.value = loadHasUnlockedSPlusSong();

  /* ※ ここではBGMを鳴らさない

     ページを開いた直後は、ブラウザの決まりで音を鳴らせない
     タイトルBGMは、起動画面の「▶ はじめる」を押したとき
     （＝ユーザーが操作したとき）に enterTitle() で鳴らしはじめる
  */
});

/* 画面から離れるときは、受付をやめる（後始末） */
onUnmounted(() => {
  window.removeEventListener('keyup', handleSecretPathKeyup);
  window.removeEventListener('blur', handleSecretPathWindowBlur);
  document.removeEventListener('visibilitychange', handleSecretPathVisibilityChange);
  window.removeEventListener('resize', updateEntranceColumns);
  window.removeEventListener('pointermove', handleWindowPointer);
  window.removeEventListener('pointerdown', handleWindowPointer);

  // 別のページへ移ったあともBGMが鳴り続けないように、ぜんぶの曲を止めておく
  // （pauseParkBgm() は、公園BGM1・BGM2の両方をまとめて止めてくれる）
  pauseTitleBgm();
  pauseParkBgm();
  pauseSecretBgm();
  pauseTantrumBgm();
  pauseResultBgm();
  pauseGameOverBgm();

  // 「あとで鳴らす」の予約と、フェードインの途中経過も止める
  // 残っていると、ページを離れたあとも動きつづけてしまう
  // （GAME OVER BGMの0.7秒の予約が残っていると、別のページで鳴りだしてしまう）
  // （cancelFileSound() は、救急車・犬・噴水の0.45秒の予約のぶん）
  cancelTitleBgmStart();
  cancelParkBgmStart();
  cancelSecretBgmStart();
  cancelResultBgmStart();
  cancelGameOverBgmStart();
  cancelFileSound();
  cancelBgmFade();

  // いやいや発生の演出の「あとで消す」予約も取り消しておく
  hideTantrumAlert();

  // 秘密の小道（ミニゲーム）の requestAnimationFrame も止めておく
  // はやく進む・押している状態と、長押しを待つ予約も片づける
  stopSecretPathLoop();
  releaseSecretPathControls();
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

           B画面の「？ あそびかた」で開き、「← ひとつ前の画面へ戻る」・Escape でB画面へ戻る
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
                 Tabは「← ひとつ前の画面へ戻る → サウンド → いちばん下の ← ひとつ前の画面へ戻る」と上から順に進む -->
          <div class="title-card__tools">
            <button ref="howToBackButtonRef" type="button" class="title-card__back" @click="closeHowToPlay">← ひとつ前の画面へ戻る</button>

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
              <li>朝9時から12時まで、公園の場所を選んで探検します。</li>
              <li>選んだ行動によって時間が進み、こうちゃんや親の状態が変わります。</li>
              <li>アイテムを見つけたり、ちょっとした出来事が起きたりすることも。公園には、少し特別な場所もあるみたい。</li>
              <li>12時になるか、公園の出口へ向かうとおしまい。結果発表があります。</li>
            </ul>

            <!-- 操作は「パソコンでもスマホでも遊べる」と分かる最低限だけ書く
                 キーの一覧（Space・← → など）や、場面ごとのくわしい操作は書かない
                 （秘密の小道の操作は、ミニゲームの画面にそのつど案内が出る） -->
            <p class="howto-note">
              <b class="howto-note__title">操作</b>
              画面のコマンドを選んで進めます。パソコンはクリックか矢印キーと Enter、スマホはタップで遊べます。
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
                <dd>元気に動ける力。少なくなりすぎると、探検を続けにくくなります。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--child-mood"></span>
                  こうちゃんの機嫌
                </dt>
                <dd>どのくらい楽しい気分か。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--parent-energy"></span>
                  親の体力
                </dt>
                <dd>いっしょに遊んだり、だっこしたりすると減ることがあります。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--parent-calm"></span>
                  親の余裕
                </dt>
                <dd>親が落ち着いて対応できているか。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--point"></span>
                  おでかけポイント
                </dt>
                <dd>いろいろ体験すると増えます。結果にも関係します。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--time"></span>
                  時間
                </dt>
                <dd>行動すると進みます。</dd>
              </div>
            </dl>

            <!-- GAME OVER は「こうなると終わることがある」という雰囲気だけ伝える
                 （「○○が0なら」のような判定の一覧にはしない） -->
            <p class="howto-note howto-note--caution">
              <b class="howto-note__title">GAME OVER</b>
              こうちゃんや親が疲れすぎたり、親が落ち着いて対応できなくなったりすると、冒険が途中で終わることがあります。
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
              <li>出発前に、{{ snacks.length }}種類から{{ maxSnackCount }}つ選んで持っていきます。</li>
              <li>体力が回復しやすいもの、機嫌がよくなりやすいものなど、おやつごとに得意なことが少しちがいます。</li>
              <li>ひとやすみやいやいやタイムで使えます。使うと残りが減ります。</li>
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

            <p class="howto-text">疲れた・おなかがすいた・うまくできなくて悔しい・まだ遊びたい などの理由で、こうちゃんはいやいやします。理由の答えは画面に出ません。</p>

            <p class="howto-note howto-note--hint">💡 こうちゃんのセリフや様子をよく見て、どうしていやいやしているのか考えてみよう。</p>

            <h3 class="howto-subheading">4つの対応</h3>

            <dl class="howto-terms">
              <div class="howto-terms__row">
                <dt>お話してみる</dt>
                <dd>理由によって、うまくいきやすさが変わります。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>だっこする</dt>
                <dd>落ち着かせやすいけれど、親の体力を使います。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>おやつをあげる</dt>
                <dd>おやつを1つ使います。そのときのこうちゃんとの相性があります。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>少し待ってみる</dt>
                <dd>落ち着くこともあれば、うまくいかないこともあります。</dd>
              </div>
            </dl>

            <ul class="howto-list">
              <li>対応が合わないと、いやいやがもっと強くなることがあります。</li>
              <li>同じ方法ばかり続けるより、別の方法を考えることも大切です。</li>
              <li>気持ちにぴったり合った対応ができると「ナイス対応」になることも。</li>
            </ul>
          </section>

          <!-- 5. ちょっとしたヒント（攻略の答えにはならない、考えかたのヒントだけ） -->
          <section class="howto-section">
            <h2 class="howto-section__title">
              <span class="howto-section__num">5</span>
              ちょっとしたヒント
            </h2>

            <ul class="howto-list">
              <li>時間と体力を見ながら探検しよう。</li>
              <li>おやつは使うと減るので、使いどころも大切。</li>
              <li>いろいろな場所を探検すると、何か見つかるかも？</li>
            </ul>
          </section>

          <!-- いちばん下まで読んだ人が、上までスクロールしなくても戻れるようにする
               （押したときの処理は、上の「← ひとつ前の画面へ戻る」と同じ closeHowToPlay()） -->
          <div class="howto-footer">
            <button type="button" class="title-card__back" @click="closeHowToPlay">← ひとつ前の画面へ戻る</button>
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
                 Tabキーを押したときに「はじめる → サウンドトラック → サウンド」の
                 順で回れるようにするため（見た目の位置はCSSの order でいちばん下のまま）
               ref … キーボード操作でフォーカスを当てるための目印 -->
          <button ref="startButtonRef" class="cmd cmd--start cmd--single" @click="enterTitle">はじめる</button>

          <!-- 上のツールバー（B画面と同じ .title-card__tools を使う）
               左：サウンドトラック（/soundtrack）への入口
               右：サウンドON/OFF（「はじめる」を押すとタイトルBGMが鳴りだすので、その前に消せるようにしておく） -->
          <div class="title-card__tools">
            <!-- サウンドトラックへの入口（左上）
                 右のサウンドON/OFFと同じ高さ・同じ文字サイズのpillにそろえている
                 （見た目のCSSは .title-card__tools のところにまとめてある）
                 押しても enterTitle() は呼ばず、タイトルBGMも鳴らさずに /soundtrack へ移る

                 ※ Enter/Space を押したときに「はじめる」まで動いてしまわないのは、
                   handleTitleKeydown() が「ボタンにフォーカスがあるときは何もしない」
                   ようにしているため（ボタン側で止める必要はない） -->
            <button ref="soundtrackButtonRef" type="button" class="title-card__soundtrack" @click="goToSoundtrack">♪ サウンドトラック</button>

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

          <h1 class="title-card__name">{{ gameTitle }}</h1>
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
                 A画面の「♪ サウンドトラック」と同じ場所・同じ大きさで出るので、
                 A→B で切り替えても、左側は文字だけが入れかわって見える

                 ※ Enter/Space で「きょうのおやつを選ぶ」まで動いてしまわないのは、
                   handleTitleKeydown() が「ボタンにフォーカスがあるときは何もしない」
                   ようにしているため（ボタン側で止める必要はない） -->
            <button ref="backToBootButtonRef" type="button" class="title-card__back" @click="goBackToBoot">はじめの画面へ戻る</button>

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
            <p>冒険の舞台は9時から12時の公園です！</p>

            <p>
              どんな出会い、冒険があるかな。
              <br />
              たくさん探索してみよう！
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

              <span class="snack-option__text">{{ snack.description }}</span>

              <!-- おやつごとの回復量（次の実装でそのままゲームに使う数）

                   数字はこれからバランスを調整するので、
                   ここが変わってもカードの形がくずれないようにしている

                   3つを1つずつ span で包んであるのは、折り返しの都合
                   ひとつづきの文章にしてしまうと、カードの幅が足りないときに
                   「体力 +1」「8」のように数字の途中で切れてしまう
                   包んでおけば、切れるのはかならず項目のあいだになる
                   （区切りの「／」は、CSSで項目のうしろに付けている） -->
              <span class="snack-option__effect">
                <span class="snack-option__stat">体力 +{{ snack.energy }}</span>
                <span class="snack-option__stat">機嫌 +{{ snack.mood }}</span>
                <span class="snack-option__stat">{{ snack.minutes }}分</span>
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
              <span class="snack-bag__title">🎒 おやつバッグ</span>

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
                 さっき選んだおやつがそのまま入っている） -->
            <button type="button" class="title-card__back" @click="closeSnackSelection">← ひとつ前の画面へ戻る</button>

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

          <p class="snack-lead">
            公園へ持っていくおやつを{{ maxSnackCount }}つ選ぼう！
            <br />
            もう一度押すと、えらびなおせます。
          </p>
        </div>
      </div>

      <!-- ============================================================
           ゲーム画面（上部ステータス／中央イベント／下部コマンド）
           ============================================================ -->
      <!-- game-screen--secret-path … 秘密の小道のあいだだけ付ける
           スマホ幅で、上部ステータスを画面の上に固定しないようにするため（CSSの max-width: 700px を参照） -->
      <div v-else key="game" ref="gameScreenRef" class="game-screen" :class="{ 'game-screen--secret-path': currentEvent === 'secretPath' }">
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
          :danger-warnings="dangerWarnings"
          :is-almost-noon="isAlmostNoon"
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
          <div v-if="currentEvent === 'parkEntrance'" class="scene" key="parkEntrance">
            <section class="stage">
              <article class="place-card">
                <h2 class="place-card__title">公園入口</h2>

                <!-- あいさつ文は3段階（着いたばかり／前半のおかえり／午前後半）
                     どの文にするかは、上の parkEntranceText で決めている -->
                <p class="place-card__text">{{ parkEntranceText }}</p>
              </article>

              <!-- 秘密の場所は「ポイント20以上」かつ「見つけたもの3種類以上」で解放 -->
              <article v-if="canEnterSecretSpot" class="place-card place-card--secret">
                <!-- 広場をもう見つけたかどうかで文言を切り替える
                     まだ見つけていない → はじめて見つけたときの案内（この先は秘密の小道）
                     もう見つけた → また行ってみようという案内（そのまま広場へ入る）
                     ※ 探検済み（isVisited）ではなく hasDiscoveredSecretSpot を見る
                       広場を見つけて何もせずに出たときも、もう小道はくり返さないため -->
                <template v-if="hasDiscoveredSecretSpot">
                  <h2 class="place-card__title">こもれびの広場</h2>

                  <p class="place-card__text">こうちゃんは、木々のあいだの細い道を覚えているようです。また行ってみよう！</p>
                </template>

                <template v-else>
                  <h2 class="place-card__title">細い道を見つけた！</h2>

                  <p class="place-card__text">木々のあいだに、細い道があるのを見つけました。この先には何があるのかな？行ってみよう！</p>
                </template>
              </article>
            </section>

            <!-- command--pointer-paused … 公園入口へ戻ってきた直後、マウスを動かすまでマウスで選べなくする
                                           （最後にいた場所に合わせたカーソルが、@mouseenter で上書きされないようにする） -->
            <nav class="command" :class="{ 'command--pointer-paused': isCommandPointerPaused }">
              <p class="command__label">どこへ行く？</p>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="goToPlace('slide')" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                <span class="cmd__text">すべり台へ行く</span>
                <!-- 探検済みバッジのとなりに、その場所のアイテムを見つけたかどうかも出す
                     （まだ行っていない場所では、アイテムのバッジは出さない） -->
                <span v-if="isVisited('slide')" class="cmd__badges">
                  <span class="cmd__badge">探検済み</span>
                  <span v-if="hasFoundPlaceItem('slide')" class="cmd__badge cmd__badge--item-found">★ 発見済み</span>
                </span>
              </button>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 1 }" @click="goToPlace('sandbox')" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                <span class="cmd__text">砂場へ行く</span>
                <span v-if="isVisited('sandbox')" class="cmd__badges">
                  <span class="cmd__badge">探検済み</span>
                  <span v-if="hasFoundPlaceItem('sandbox')" class="cmd__badge cmd__badge--item-found">★ 発見済み</span>
                </span>
              </button>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 2 }" @click="goToPlace('acornArea')" @mouseenter="selectedCommandIndex = 2" @focus="selectedCommandIndex = 2">
                <span class="cmd__text">どんぐりの木へ行く</span>
                <span v-if="isVisited('acornArea')" class="cmd__badges">
                  <span class="cmd__badge">探検済み</span>
                  <span v-if="hasFoundPlaceItem('acornArea')" class="cmd__badge cmd__badge--item-found">★ 発見済み</span>
                </span>
              </button>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 3 }" @click="goToPlace('pond')" @mouseenter="selectedCommandIndex = 3" @focus="selectedCommandIndex = 3">
                <span class="cmd__text">池へ行く</span>
                <span v-if="isVisited('pond')" class="cmd__badges">
                  <span class="cmd__badge">探検済み</span>
                  <span v-if="hasFoundPlaceItem('pond')" class="cmd__badge cmd__badge--item-found">★ 発見済み</span>
                </span>
              </button>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 4 }" @click="goToPlace('grassArea')" @mouseenter="selectedCommandIndex = 4" @focus="selectedCommandIndex = 4">
                <span class="cmd__text">芝生広場へ行く</span>
                <span v-if="isVisited('grassArea')" class="cmd__badges">
                  <span class="cmd__badge">探検済み</span>
                  <span v-if="hasFoundPlaceItem('grassArea')" class="cmd__badge cmd__badge--item-found">★ 発見済み</span>
                </span>
              </button>

              <button
                v-if="canEnterSecretSpot"
                class="cmd cmd--secret"
                :class="{ 'cmd--selected': selectedCommandIndex === 5 }"
                @click="goToSecretArea"
                @mouseenter="selectedCommandIndex = 5"
                @focus="selectedCommandIndex = 5">
                <span class="cmd__text">細い道の先へ行く</span>
                <span v-if="isVisited('secretSpot')" class="cmd__badges">
                  <span class="cmd__badge">探検済み</span>
                  <span v-if="hasFoundPlaceItem('secretSpot')" class="cmd__badge cmd__badge--item-found">★ 発見済み</span>
                </span>
              </button>

              <!-- 押しても、すぐにはゴールへ向かわない（「公園の出口へ向かう？」の確認ダイアログが開く） -->
              <button
                class="cmd cmd--goal"
                :class="{ 'cmd--selected': selectedCommandIndex === goalCommandIndex }"
                @click="openGoalConfirm"
                @mouseenter="selectedCommandIndex = goalCommandIndex"
                @focus="selectedCommandIndex = goalCommandIndex">
                <span class="cmd__text">公園の出口へ向かう（ゴール）</span>
              </button>
            </nav>
          </div>

          <!-- すべり台 -->
          <div v-else-if="currentEvent === 'slide'" class="scene" key="slide">
            <section class="stage">
              <article class="place-card">
                <h2 class="place-card__title">すべり台</h2>

                <p class="place-card__text">
                  すべり台を見つけると、「すべるー！」とおおはしゃぎ。
                  <br />
                  小さな手で手すりをぎゅっとつかんで、とてとて階段をのぼりはじめました。
                </p>
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

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  v-model:care-index="selectedCareCommandIndex"
                  v-model:snack-index="selectedSnackMenuIndex"
                  variant="place"
                  :commands="[{ label: '一緒にすべる' }, { label: '下で見守る' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :selected-snacks="selectedSnacks"
                  :snack-left="snackLeft"
                  :is-snack-menu-visible="isSnackMenuVisible"
                  :snack-menu-back-index="snackMenuBackIndex"
                  :is-care-menu-visible="isCareMenuVisible"
                  :is-care-result-back-visible="isCareResultBackVisible"
                  :care-menu-command-index="careMenuCommandIndex"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => [playSlide, watchSlide][index]()"
                  @care="toggleCareMenu"
                  @leave="goToNextPlace"
                  @back="backToPlaceFromCareResult"
                  @next="goToNextPlace"
                  @take-break="takeCommonBreak"
                  @open-snack-menu="openSnackMenu('exploring')"
                  @close-snack-menu="closeSnackMenu"
                  @eat-snack="eatSnackFromBag" />
              </div>
            </section>
          </div>

          <!-- 砂場 -->
          <div v-else-if="currentEvent === 'sandbox'" class="scene" key="sandbox">
            <section class="stage">
              <article class="place-card">
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

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  v-model:care-index="selectedCareCommandIndex"
                  v-model:snack-index="selectedSnackMenuIndex"
                  variant="place"
                  :commands="[{ label: '一緒に大きな山を作る' }, { label: '砂のトンネルを作る' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :selected-snacks="selectedSnacks"
                  :snack-left="snackLeft"
                  :is-snack-menu-visible="isSnackMenuVisible"
                  :snack-menu-back-index="snackMenuBackIndex"
                  :is-care-menu-visible="isCareMenuVisible"
                  :is-care-result-back-visible="isCareResultBackVisible"
                  :care-menu-command-index="careMenuCommandIndex"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => [playSandbox, buildSandTunnel][index]()"
                  @care="toggleCareMenu"
                  @leave="goToNextPlace"
                  @back="backToPlaceFromCareResult"
                  @next="goToNextPlace"
                  @take-break="takeCommonBreak"
                  @open-snack-menu="openSnackMenu('exploring')"
                  @close-snack-menu="closeSnackMenu"
                  @eat-snack="eatSnackFromBag" />
              </div>
            </section>
          </div>

          <!-- どんぐりの木 -->
          <div v-else-if="currentEvent === 'acornArea'" class="scene" key="acornArea">
            <section class="stage">
              <article class="place-card">
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

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  v-model:care-index="selectedCareCommandIndex"
                  v-model:snack-index="selectedSnackMenuIndex"
                  variant="place"
                  :commands="[{ label: '一緒にどんぐりを拾う' }, { label: 'どんぐりをころがして遊ぶ' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :selected-snacks="selectedSnacks"
                  :snack-left="snackLeft"
                  :is-snack-menu-visible="isSnackMenuVisible"
                  :snack-menu-back-index="snackMenuBackIndex"
                  :is-care-menu-visible="isCareMenuVisible"
                  :is-care-result-back-visible="isCareResultBackVisible"
                  :care-menu-command-index="careMenuCommandIndex"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => [collectAcorns, rollAcorns][index]()"
                  @care="toggleCareMenu"
                  @leave="goToNextPlace"
                  @back="backToPlaceFromCareResult"
                  @next="goToNextPlace"
                  @take-break="takeCommonBreak"
                  @open-snack-menu="openSnackMenu('exploring')"
                  @close-snack-menu="closeSnackMenu"
                  @eat-snack="eatSnackFromBag" />
              </div>
            </section>
          </div>

          <!-- 池 -->
          <div v-else-if="currentEvent === 'pond'" class="scene" key="pond">
            <section class="stage">
              <article class="place-card">
                <h2 class="place-card__title">池</h2>

                <p class="place-card__text">池には白鳥が泳ぎ、コイもたくさん集まっています。こうちゃんは指をさして大はしゃぎです。</p>
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

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  v-model:care-index="selectedCareCommandIndex"
                  v-model:snack-index="selectedSnackMenuIndex"
                  variant="place"
                  :commands="[{ label: '白鳥を近くで見る' }, { label: 'コイに餌をあげる' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :selected-snacks="selectedSnacks"
                  :snack-left="snackLeft"
                  :is-snack-menu-visible="isSnackMenuVisible"
                  :snack-menu-back-index="snackMenuBackIndex"
                  :is-care-menu-visible="isCareMenuVisible"
                  :is-care-result-back-visible="isCareResultBackVisible"
                  :care-menu-command-index="careMenuCommandIndex"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => [watchSwansClose, feedKoi][index]()"
                  @care="toggleCareMenu"
                  @leave="goToNextPlace"
                  @back="backToPlaceFromCareResult"
                  @next="goToNextPlace"
                  @take-break="takeCommonBreak"
                  @open-snack-menu="openSnackMenu('exploring')"
                  @close-snack-menu="closeSnackMenu"
                  @eat-snack="eatSnackFromBag" />
              </div>
            </section>
          </div>

          <!-- 芝生広場 -->
          <div v-else-if="currentEvent === 'grassArea'" class="scene" key="grassArea">
            <section class="stage">
              <article class="place-card">
                <h2 class="place-card__title">芝生広場</h2>

                <p class="place-card__text">やわらかい芝生が広がっています。思いきり走り回れそうです。</p>
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

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  v-model:care-index="selectedCareCommandIndex"
                  v-model:snack-index="selectedSnackMenuIndex"
                  variant="place"
                  :commands="[{ label: '追いかけっこする' }, { label: 'シャボン玉で遊ぶ' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :selected-snacks="selectedSnacks"
                  :snack-left="snackLeft"
                  :is-snack-menu-visible="isSnackMenuVisible"
                  :snack-menu-back-index="snackMenuBackIndex"
                  :is-care-menu-visible="isCareMenuVisible"
                  :is-care-result-back-visible="isCareResultBackVisible"
                  :care-menu-command-index="careMenuCommandIndex"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => [playTagOnGrass, playWithBubbles][index]()"
                  @care="toggleCareMenu"
                  @leave="goToNextPlace"
                  @back="backToPlaceFromCareResult"
                  @next="goToNextPlace"
                  @take-break="takeCommonBreak"
                  @open-snack-menu="openSnackMenu('exploring')"
                  @close-snack-menu="closeSnackMenu"
                  @eat-snack="eatSnackFromBag" />
              </div>
            </section>
          </div>

          <!-- 秘密の小道（こもれびの広場へ続くミニゲーム）

               そのプレイではじめて「細い道の先へ行く」を選んだときだけ、ここを通る
               secretPathPhase で、中身を3つに切りかえる
               ・ready    … 説明と「小道へ進む」「← 場所選びにもどる」（まだ何も動かない）
               ・playing  … 3レーンのフィールドと「道をクリック・タップして動こう」の案内
               ・finished … 結果の文章と「先へ進む」（押すと こもれびの広場へ） -->
          <div v-else-if="currentEvent === 'secretPath'" class="scene" key="secretPath">
            <!-- stage--secret-path … スマホ幅で、カードとコマンドボックスを横にはみ出させないための目印 -->
            <section class="stage stage--secret-path">
              <!-- はじまる前 -->
              <article v-if="secretPathPhase === 'ready'" class="place-card place-card--secret">
                <h2 class="place-card__title">🌿 秘密の小道</h2>

                <p class="place-card__text">木々のあいだの細い道に、そっと足をふみ入れました。葉っぱのすき間から、光がちらちら差しこんでいます。</p>

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
                    <span class="secret-path-rules__part">↑長押し：はやく進む</span>
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

              <!-- 遊んでいる最中 -->
              <article v-else-if="secretPathPhase === 'playing'" ref="secretPathPlayRef" class="place-card place-card--secret secret-path">
                <div class="secret-path-hud">
                  <span
                    class="secret-path-hud__sunlight"
                    :class="{ 'secret-path-hud__sunlight--sparkle': isSecretPathSparkling, 'secret-path-hud__sunlight--lost': isSecretPathBumped && secretPathBumpLost }"
                    aria-live="polite">
                    ✨ 木漏れ日
                    <!-- key を数にしておくと、取るたびに数字がぽんっと出なおす -->
                    <b :key="secretPathSunlightCount" class="secret-path-hud__count">{{ secretPathSunlightCount }}</b>
                    / {{ secretPathSunlightTotal }}
                  </span>

                  <span class="secret-path-hud__time" :class="{ 'secret-path-hud__time--soon': secretPathTimeLeft <= 3 }">
                    あと {{ secretPathTimeLeft }}秒
                    <!-- はやく進んでいるあいだだけ出す（↑ キー・フィールドの長押し）
                         残り時間の右上に重ねて出すので、出たり消えたりしても HUD の並びは変わらない -->
                    <span v-if="isSecretPathBoosting" class="secret-path-hud__boost">⏩ {{ secretPathBoostMultiplier }}x</span>
                  </span>
                </div>

                <!-- フィールド（左・まん中・右の3レーン）
                     枝と木漏れ日の位置は、JavaScript が1コマごとに top を書きかえて動かしている
                     aria-hidden … 流れてくる絵文字を、ひとつずつ読み上げないようにする -->
                <!-- ポインター操作（クリック・タップ・ドラッグ・フリック・長押し）は、フィールド1か所でまとめて受け取る
                     （handleSecretPathPointerDown() を参照）
                     contextmenu … スマホで長押ししたときのメニューを出さない -->
                <div
                  class="secret-path-field"
                  aria-hidden="true"
                  @pointerdown="handleSecretPathPointerDown"
                  @pointermove="handleSecretPathPointerMove"
                  @pointerup="handleSecretPathPointerUp"
                  @pointercancel="handleSecretPathPointerCancel"
                  @pointerleave="handleSecretPathPointerLeave"
                  @contextmenu.prevent>
                  <!-- 道（レーン）の見た目
                       短くクリック・タップすると、こうちゃんが押したレーンの方向へ1レーン動く
                       ・--next        … 1回で動ける「となりのレーン」。こうちゃんの高さに、うすい点線の丸と矢印（行き先の目印）を出す
                       ・--destination … マウスを乗せたレーンを押したときの動く先。目印がはっきりする
                                         （遠いレーンに乗せたときは、まん中の目印がはっきりする）
                       ・--flash       … 押したレーン・動いた先のレーンが一瞬光る
                       ※ 枝・木漏れ日・こうちゃんは pointer-events: none なので、上に重なっていても押せる -->
                  <div
                    v-for="lane in secretPathLanes"
                    :key="`lane-${lane}`"
                    class="secret-path-lane"
                    :class="{
                      'secret-path-lane--current': lane === secretPathPlayerLane,
                      'secret-path-lane--next': Math.abs(lane - secretPathPlayerLane) === 1,
                      'secret-path-lane--destination': lane === secretPathHoverDestination,
                      'secret-path-lane--flash': lane === secretPathFlashLane,
                    }"
                    :style="{ left: `${(lane / 3) * 100}%` }">
                    <span class="secret-path-lane__target" :style="{ top: `${secretPathPlayerY}%` }">{{ secretPathPlayerLane > lane ? '←' : '→' }}</span>
                  </div>

                  <span
                    v-for="item in secretPathItems"
                    :key="item.id"
                    class="secret-path-item"
                    :class="[`secret-path-item--${item.kind}`, { 'secret-path-item--hit': item.hit }]"
                    :style="{ left: getSecretPathLaneLeft(item.lane), top: `${item.y}%` }">
                    {{ item.kind === 'branch' ? '🌿' : '✨' }}
                  </span>

                  <div class="secret-path-player" :style="{ left: getSecretPathLaneLeft(secretPathPlayerLane), top: `${secretPathPlayerY}%` }">
                    <!-- 枝に当たったとき：「いたっ！」と、木漏れ日が減ったときだけ「✨ -1」
                         key を当たった回数にしておくと、続けて当たったときも出なおす -->
                    <span v-if="isSecretPathBumped" :key="secretPathBumpId" class="secret-path-player__bump">
                      いたっ！
                      <span v-if="secretPathBumpLost" class="secret-path-player__minus">✨ -1</span>
                    </span>
                    <span v-if="isSecretPathSparkling" :key="secretPathSparkleId" class="secret-path-player__plus">✨ +1</span>
                    <span class="secret-path-player__face" :class="{ 'secret-path-player__face--bumped': isSecretPathBumped, 'secret-path-player__face--sparkle': isSecretPathSparkling }">👦</span>
                  </div>
                </div>
              </article>

              <!-- 小道をぬけたあと -->
              <article v-else class="place-card place-card--secret">
                <p class="place-card__flash">小道をぬけた！</p>

                <h2 class="place-card__title">🌿 秘密の小道</h2>

                <p class="secret-path-result">
                  ✨ 木漏れ日
                  <b>{{ secretPathSunlightCount }}</b>
                  / {{ secretPathSunlightTotal }}
                </p>

                <p class="place-card__text">{{ secretPathResultText }}</p>

                <p class="place-card__text secret-path-light">木々のすき間から、まぶしい光が差しこんできました。</p>

                <!-- 木漏れ日ボーナス（2個以上集めたときだけ）
                     見た目は、いやいやタイムの「✨ ナイス対応！」と同じ緑の枠を使う -->
                <div v-if="secretPathBonusPoint > 0" class="event-flash event-flash--nice">
                  <p class="event-flash__label">✨ 木漏れ日ボーナス！</p>

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
                    <span class="secret-path-guide__item">↑長押し：加速</span>
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

                  <button
                    class="command-box__item"
                    :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }"
                    @click="leaveSecretPathToEntrance"
                    @mouseenter="selectedCommandIndex = 1"
                    @focus="selectedCommandIndex = 1">
                    <span class="command-box__text">← 場所選びにもどる</span>
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
          <div v-else-if="currentEvent === 'secretSpot'" class="scene" key="secretSpot">
            <section class="stage">
              <article class="place-card place-card--secret">
                <h2 class="place-card__title">こもれびの広場</h2>

                <p class="place-card__text">
                  木々のあいだの細い道を、こうちゃんと葉っぱをかき分けながら進むと、やわらかな木漏れ日が差しこむ小さな広場に出ました。風がそっと吹いて、葉っぱがきらきら揺れています。「きれいー！」こうちゃんは、目をかがやかせています。
                </p>
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

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <CommandBox
                  v-model:selected-index="selectedCommandIndex"
                  v-model:care-index="selectedCareCommandIndex"
                  v-model:snack-index="selectedSnackMenuIndex"
                  variant="place"
                  :commands="[{ label: '木漏れ日の中を探検する' }, { label: '広場の奥を見てみる' }]"
                  :result-message="resultMessage"
                  :next-place-command-label="nextPlaceCommandLabel"
                  :pointer-paused="isCommandPointerPaused"
                  :selected-snacks="selectedSnacks"
                  :snack-left="snackLeft"
                  :is-snack-menu-visible="isSnackMenuVisible"
                  :snack-menu-back-index="snackMenuBackIndex"
                  :is-care-menu-visible="isCareMenuVisible"
                  :is-care-result-back-visible="isCareResultBackVisible"
                  :care-menu-command-index="careMenuCommandIndex"
                  :leave-place-command-index="leavePlaceCommandIndex"
                  @select="index => [exploreSunlight, exploreClearingDepths][index]()"
                  @care="toggleCareMenu"
                  @leave="goToNextPlace"
                  @back="backToPlaceFromCareResult"
                  @next="goToNextPlace"
                  @take-break="takeCommonBreak"
                  @open-snack-menu="openSnackMenu('exploring')"
                  @close-snack-menu="closeSnackMenu"
                  @eat-snack="eatSnackFromBag" />
              </div>
            </section>
          </div>

          <!-- いやいや中 -->
          <div v-else-if="currentEvent === 'tantrum'" class="scene" key="tantrum">
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

                <!-- 理由が決まっていないとき（ふつうは起きない）は、前からの文章を出す -->
                <p v-else class="place-card__text">
                  こうちゃんがほっぺをふくらませて、その場にぺたんと座りこんでしまいました。 なにを言っても「いや！」のいってんばりですが、ときどきこちらをちらっと見ています。
                </p>
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
          <div v-else-if="currentEvent === 'emergencySiren'" class="scene" key="emergencySiren">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🚑 救急車のサイレン！</h2>

                <p class="place-card__text">遠くからピーポーピーポーと音が聞こえてきました。「きゅうきゅうしゃ、どこ？」こうちゃんは辺りを見回しています。</p>
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
          <div v-else-if="currentEvent === 'ladybug'" class="scene" key="ladybug">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🐞 テントウムシ発見！</h2>

                <p class="place-card__text">葉っぱの上にテントウムシがいました。こうちゃんは「てんとうむし！」とうれしそうにしゃがみこみました。</p>
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
          <div v-else-if="currentEvent === 'dog'" class="scene" key="dog">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🐕 犬が近づいてきた！</h2>

                <p class="place-card__text">
                  散歩中の犬が、しっぽをふりながら近づいてきました。
                  <br />
                  「わんわん！」こうちゃんは、うれしそうに指をさしています。
                </p>
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
          <div v-else-if="currentEvent === 'fallDown'" class="scene" key="fallDown">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">💦 こうちゃんがころんだ！</h2>

                <p class="place-card__text">走っていたこうちゃんがつまずいて、ころんでしまいました。「いたい……」と、ひざを見ています。</p>
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
          <div v-else-if="currentEvent === 'fountain'" class="scene" key="fountain">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">⛲ 噴水が出た！</h2>

                <p class="place-card__text">突然、噴水から勢いよく水が飛び出しました。こうちゃんは「わあ！」と大喜びです。</p>
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
          <div v-else-if="currentEvent === 'goal'" class="scene scene--result" key="goal">
            <section class="stage">
              <!-- 総合スコア ＋ ランク ＋ 結果メッセージ
                   SランクとS+ランクのときだけ、カードがきらきら光る -->
              <article class="ending-card" :class="{ 'ending-card--s': endingRank === 'Sランク' || endingRank === 'S+ランク' }">
                <!-- 総合スコア（0〜100点） -->
                <p class="ending-card__score-label">総合スコア</p>

                <p class="ending-card__score">
                  <span class="ending-card__score-value">{{ finalScore }}</span>
                  <span class="ending-card__score-max">/ 100</span>
                </p>

                <!-- 今回のランク
                     結果のいちばん大事なところなので、
                     小さなラベル ＋ 大きなバッジ の2段にして目立たせる -->
                <p class="ending-card__rank-label">今回のランク</p>

                <p class="ending-card__rank">{{ endingRank }}</p>

                <h3 class="ending-card__title">{{ endingTitle }}</h3>

                <p class="ending-card__text">{{ endingMessage }}</p>

                <!-- S+ランクのときだけ出す、うた入りエンディングBGMの小さな表示

                     出すのは、どちらか1つだけ（スコア・ランク・結果の文をじゃましないように）
                     ・このブラウザではじめて解放したとき … 「✨ サウンドトラックに新しい曲が追加されました！」＋ 曲名
                     ・もう解放済みのとき                 … 「♪ 曲名」だけ（いま流れている曲の案内）

                     role="status" … 解放のお知らせが出たことを、読み上げソフトにも伝える -->
                <p v-if="isSPlusSongNewlyUnlocked" class="ending-card__song ending-card__song--new" role="status">
                  <span>✨ サウンドトラックに新しい曲が追加されました！</span>
                  <span>「{{ sPlusSongTitle }}」</span>
                </p>

                <p v-else-if="endingRank === 'S+ランク'" class="ending-card__song">♪ {{ sPlusSongTitle }}</p>
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

                  <p v-if="collectedItems.length === 0" class="record-card__empty">見つけたもの：なし</p>

                  <ul v-else class="found-list">
                    <li v-for="item in collectedItems" :key="item" class="found-list__item">{{ item }}</li>
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
                     矢印キーは止めないので、フォーカスが当たっていても選択やスクロールは動かせる -->
              <button
                class="cmd cmd--sub cmd--back"
                :class="{ 'cmd--selected': selectedCommandIndex === 1 }"
                @click="goBackToBootFromResult"
                @mouseenter="selectedCommandIndex = 1"
                @focus="selectedCommandIndex = 1"
                @keydown.enter.stop
                @keydown.space.stop>
                <span class="cmd__text">はじめの画面へ戻る</span>
              </button>
            </nav>
          </div>

          <!-- GAME OVER（限界をむかえて途中で終わったとき）
               自分で出口へ帰ったときとちがい、S+〜Dランクの判定はしない -->
          <div v-else-if="currentEvent === 'gameOver'" class="scene scene--gameover" key="gameOver">
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

                  <p v-if="collectedItems.length === 0" class="record-card__empty">見つけたもの：なし</p>

                  <ul v-else class="found-list">
                    <li v-for="item in collectedItems" :key="item" class="found-list__item">{{ item }}</li>
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
                     矢印キーは止めないので、フォーカスが当たっていても選択やスクロールは動かせる -->
              <button
                class="cmd cmd--sub cmd--back"
                :class="{ 'cmd--selected': selectedCommandIndex === 1 }"
                @click="goBackToBootFromResult"
                @mouseenter="selectedCommandIndex = 1"
                @focus="selectedCommandIndex = 1"
                @keydown.enter.stop
                @keydown.space.stop>
                <span class="cmd__text">はじめの画面へ戻る</span>
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
         「公園の出口へ向かう？」の確認ダイアログ

         公園入口で「公園の出口へ向かう（ゴール）」を選んだときだけ出す
         ・もう少し遊ぶ … 閉じて、公園入口に戻る（開いたときは、こちらが選ばれている）
         ・出口へ向かう … ゴールへ（結果発表）

         @click.self … カードの外（うしろの暗いところ）をクリックしたら閉じる
                       .self なので、カードの中をクリックしたときは閉じない
         キーボード操作は handleKeydown() の中で受け取っている（←→↑↓・Tab・Enter / Space・Escape）

         role="alertdialog" と aria-modal="true" は、読み上げソフトに
         「大事な確認のダイアログが、画面の手前に出ている」ことを伝えるためのもの
         ============================================================ -->
    <div v-if="isGoalConfirmVisible" class="goal-confirm" @click.self="closeGoalConfirm">
      <div class="goal-confirm__content" role="alertdialog" aria-modal="true" aria-labelledby="goal-confirm-title" aria-describedby="goal-confirm-text">
        <p id="goal-confirm-title" class="goal-confirm__title">公園の出口へ向かう？</p>

        <p id="goal-confirm-text" class="goal-confirm__text">
          出口へ向かうと、今日のおでかけはおしまいです。
          <br />
          結果発表へ進みます。
        </p>

        <p class="goal-confirm__time">{{ goalConfirmTimeText }}</p>

        <div class="goal-confirm__buttons">
          <button type="button" class="cmd goal-confirm__button" :class="{ 'cmd--selected': selectedGoalConfirmIndex === 0 }" @click="closeGoalConfirm" @mouseenter="selectedGoalConfirmIndex = 0">
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
