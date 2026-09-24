/* ============================================================
   ゲームの本体状態（ステータス・おでかけポイント・時間・ゲームの進みぐあい）

   ゲーム本編（pages/index.vue）にあった
   「ゲームそのものの状態」の入れものだけを取り出してある

   ■ ここがやること
     ・こうちゃんと親のステータス、おでかけポイント、いまの時刻を用意する
     ・いまの時刻を「分」に直したもの（currentMinutes）を用意する
     ・いまどこまでゲームが進んでいるか（いる場所・探検済み・見つけたもの・
       遊んだ回数・こもれびの広場を見つけたか）を用意する
     ・いやいやの状態のうち、外からもよく見られる2つ（いやいや中かどうか・
       いやいやが起きた回数）を用意する
     ・そのぜんぶを最初の状態へ戻す（resetGameState()）

   ■ ここがやらないこと
     ゲームの進みかたは、いっさい決めない
     ・時間を進める addMinutes()
     ・ステータスを上げ下げする行動の中身
     ・場所を移動する・行動する・アイテムを見つける処理
     ・とつぜんのできごとの抽選と、画面の切りかえ
     ・上限下限をそろえる fixAllStatus()
     は、ぜんぶ pages/index.vue のまま

     「もう一度あそぶ」の resetGame() も pages/index.vue のまま
     ここが受けもつのは、そのうち「自分が持っている状態を戻すところ」だけ
     （いやいや・秘密の小道・行動の結果・ゲーム終了後の結果・おやつ袋は、
       それぞれの composable の reset 関数が戻す。resetGame() がまとめて呼んでいる）

     状態を書きかえる専用の関数（setter）も用意していない
     受けとった側から currentEvent.value = ... のように、今までどおり書きかえる

   ■ 初期値・データの形・計算のしかたは、いっさい変えていない
     pages/index.vue に書いてあった値と型をそのまま持ってきている
     （配列は配列のまま。戻しかたも resetGame() にあったときと同じ）

   ■ 初期値の置き場所は、このファイルの「最初の状態（初期値）」1か所だけ
     はじめるときと、もう一度あそぶときの両方がそこを見るので、
     同じ数字を2か所に書いておく必要がない

   ■ 返すのは ref / computed そのもの
     受けとった側で childEnergy.value = ... のように
     今までどおり書きかえられるようにしてある

   ■ ここに入れないもの
     ・いやいやの中の細かい状態（理由・レベル・どう対応したか・ナイス対応・
       画面に出す文章・「いやいや発生！」の演出）
       そちらは composables/useTantrum.ts と pages/index.vue のまま
     ・次に起こす予定のとつぜんのできごと（pendingSuddenEvent）
       「次へ」を押すまでのあいだだけ持っておく、画面の切りかえ待ちなので
     ・行動1回ぶんの結果や変化の記録（statusBefore・statusChanges など）
       そちらは composables/useActionResult.ts が持っている
     ・ゲームが終わったあとの結果（スコア・ランク・GAME OVERの文章）
       そちらは composables/useGameResult.ts が持っている
     ・きょうのおやつ（selectedSnackIds）
       そちらは composables/useSnackBag.ts が持っている
     ・画面の状態（タイトル画面かどうか・選んでいるコマンド・ダイアログの開閉・DOMのref）
     ・秘密の小道（ミニゲーム）の中の状態（secretPath* 系）
       そちらは composables/useSecretPathGame.ts が持っている
     ・音の状態（そちらは composables/useAudio.ts が持っている）
   ============================================================ */

import { computed, ref } from 'vue';
import { parseTimeToMinutes } from '~/utils/gameTime';
import type { GameEvent } from '~/types/game';

/* ============================================================
   最初の状態（初期値）

   ・ページを開いてゲームがはじまるとき
   ・「もう一度あそぶ」で最初に戻すとき（resetGameState()）

   の両方が、ここに書いた値を見る
   初期値を変えたいときは、この場所だけを直せばよい

   ※ 配列（探検済みの場所・見つけたもの）は、ここに置いていない
     同じ配列を使いまわすと、戻したはずの中身が前のプレイとつながってしまうので、
     戻すときは毎回からっぽの配列を作りなおす（→ resetGameState()）
   ============================================================ */
const initialChildEnergy: number = 100; // こうちゃんの体力
const initialChildMood: number = 55; // こうちゃんの機嫌（ぐずりだすライン50のすぐ上からスタート）
const initialOutingPoint: number = 0; // おでかけポイント
const initialParentEnergy: number = 100; // 親の体力
const initialParentCalm: number = 100; // 親の余裕（100 = とても余裕がある、0 = GAME OVER）
const initialTime: string = '09:00'; // 時間
const initialEvent: GameEvent = 'parkEntrance'; // 現在いる場所（公園入口からスタート）
const initialPlayCount: number = 0; // 場所で遊んだ回数
const initialHasDiscoveredSecretSpot: boolean = false; // こもれびの広場をもう見つけたか
const initialIsTantrum: boolean = false; // いやいや中かどうか
const initialTantrumCount: number = 0; // いやいやが起きた回数

export function useGameState() {
  /* ゲームのステータス */
  const childEnergy = ref(initialChildEnergy); // こうちゃんの体力
  const childMood = ref(initialChildMood); // こうちゃんの機嫌
  const outingPoint = ref(initialOutingPoint); // おでかけポイント
  const parentEnergy = ref(initialParentEnergy); // 親の体力
  const parentCalm = ref(initialParentCalm); // 親の余裕
  const currentTime = ref(initialTime); // 時間

  /* 今の時間を「分」に直したもの
     09:00 なら 540、12:00 なら 720 になる
  */
  const currentMinutes = computed(() => parseTimeToMinutes(currentTime.value));

  /* 現在いる場所
     最初は「公園入口」からスタート
  */
  const currentEvent = ref<GameEvent>(initialEvent);

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
  const playCount = ref(initialPlayCount);

  /* 公園で見つけたもの
     同じものは1つしか入らない
  */
  const collectedItems = ref<string[]>([]);

  /* 秘密の場所へ行ける条件
     ・おでかけポイントが20以上
     ・見つけたものが3種類以上
     の両方を満たすと解放される
  */
  const canEnterSecretSpot = computed(() => outingPoint.value >= 20 && collectedItems.value.length >= 3);

  /* こもれびの広場（secretSpot）を、このプレイでもう見つけたかどうか

     false … まだ見つけていない
             公園入口の「細い道の先」を選ぶと、まずミニゲーム「秘密の小道」へ進む
     true  … 秘密の小道を最後まで進んで、広場を見つけた
             同じプレイのあいだは、ミニゲームをもう一度やらずに、そのまま広場へ入る

     ※ visitedPlaces（探検済み）とは別もの
       探検済みになるのは広場で遊んだときなので、
       「広場を見つけたけれど、何もせずに出た」ときは探検済みにならない
       それでもミニゲームをくり返さないように、見つけたことだけを別に覚えておく
     ※ false に戻すのは resetGameState()（もう一度あそぶ／はじめの画面へ戻る）だけ
  */
  const hasDiscoveredSecretSpot = ref(initialHasDiscoveredSecretSpot);

  /* いま「いやいや」の最中かどうか

     いやいやの中の細かいこと（理由・レベル・どう対応したか・ナイス対応かどうか）は
     ここでは持たない。そちらは composables/useTantrum.ts のほうで受けもっている

     この2つだけをここに置いているのは、いやいやの外からもよく見られるため
     ・isTantrum     … 画面の出しわけ・進行の分かれ道・BGMの切りかえ（useAudio）
     ・tantrumCount  … 最後のスコアとランクの計算（useScore）

     ※ true / false を切りかえるのも、回数を1つ増やすのも、今までどおり useTantrum のまま
       ここが持っているのは入れものだけ
  */
  const isTantrum = ref(initialIsTantrum);

  /* いやいやが起きた回数（記録用） */
  const tantrumCount = ref(initialTantrumCount);

  /* ここで持っている状態を、ぜんぶ最初の状態へ戻す（「もう一度あそぶ」用）

     戻すのは、この composable が持っているものだけ
     いやいや・秘密の小道・行動の結果・ゲーム終了後の結果・おやつ袋は、
     それぞれの composable の reset 関数が戻す
     （画面の状態と音をふくめて、まとめて呼ぶのは pages/index.vue の resetGame()）

     ※ 探検済みの場所と見つけたものは、からっぽの配列を作りなおして入れかえる
       （前と同じ配列を使いまわして中身だけ消す、というやりかたはしない。
         resetGame() にあったときと同じ戻しかた）
  */
  function resetGameState() {
    childEnergy.value = initialChildEnergy;
    childMood.value = initialChildMood;
    outingPoint.value = initialOutingPoint;
    parentEnergy.value = initialParentEnergy;
    parentCalm.value = initialParentCalm;
    currentTime.value = initialTime;

    currentEvent.value = initialEvent;
    visitedPlaces.value = [];
    collectedItems.value = [];
    playCount.value = initialPlayCount;

    hasDiscoveredSecretSpot.value = initialHasDiscoveredSecretSpot;

    isTantrum.value = initialIsTantrum;
    tantrumCount.value = initialTantrumCount;
  }

  return {
    /* ===== こうちゃんのステータス ===== */
    childEnergy,
    childMood,

    /* ===== おでかけポイント ===== */
    outingPoint,

    /* ===== 親のステータス ===== */
    parentEnergy,
    parentCalm,

    /* ===== ゲーム内の時間 ===== */
    currentTime,
    currentMinutes,

    /* ===== ゲームの進みぐあい ===== */
    currentEvent,
    visitedPlaces,
    playCount,
    collectedItems,

    /* ===== こもれびの広場（秘密の場所） ===== */
    canEnterSecretSpot,
    hasDiscoveredSecretSpot,

    /* ===== いやいや（外からもよく見る2つだけ。中身は useTantrum） ===== */
    isTantrum,
    tantrumCount,

    /* ===== ここで持っている状態を、まとめて最初に戻す ===== */
    resetGameState,
  };
}
