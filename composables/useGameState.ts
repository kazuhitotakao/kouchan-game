/* ============================================================
   ゲームの本体状態（ステータス・おでかけポイント・時間・ゲームの進みぐあい）の入れもの

   ■ ここがやること
     ・こうちゃんと親のステータス、おでかけポイント、いまの時刻（と、それを「分」に直したもの）を用意する
     ・ゲームの進みぐあい（いる場所・探検済み・見つけたもの・遊んだ回数・こもれびの広場を見つけたか）を用意する
     ・いやいやの状態のうち、外からもよく見る2つ（いやいや中か・起きた回数）を用意する
     ・そのぜんぶを最初の状態へ戻す（resetGameState()）

   ■ ここがやらないこと
     ゲームの進みかた（時間を進める・行動の中身・場所の移動・上限下限をそろえる など）は、ぜんぶ pages/index.vue
     書きかえ専用の関数も用意しない（返すのは ref / computed そのもので、受けとった側が .value = ... で書きかえる）

   ■ ここに入れないもの（それぞれの持ち主）
     ・いやいやの中の細かい状態 … useTantrum.ts
     ・行動1回ぶんの結果・変化の記録 … useActionResult.ts
     ・ゲームが終わったあとの結果 … useGameResult.ts
     ・きょうのおやつ … useSnackBag.ts
     ・秘密の小道の中の状態 … useSecretPathGame.ts
     ・音の状態 … useAudio.ts
     ・画面の状態と、次に起こす予定のとつぜんのできごと … pages/index.vue
   ============================================================ */

import { computed, ref } from 'vue';
import { parseTimeToMinutes } from '~/utils/gameTime';
import type { GameEvent } from '~/types/game';

/* ============================================================
   最初の状態（初期値）

   はじめるときと、もう一度あそぶとき（resetGameState()）の両方が、ここの値を見る
   ※ 配列（探検済みの場所・見つけたもの）は、ここに置かない（同じ配列を使いまわすと、前のプレイとつながってしまうので、毎回作りなおす）
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

  /* 今の時間を「分」に直したもの（09:00 なら 540、12:00 なら 720） */
  const currentMinutes = computed(() => parseTimeToMinutes(currentTime.value));

  const currentEvent = ref<GameEvent>(initialEvent);

  /* 探検済みの場所（その場所で1つ行動すると追加される。公園入口・いやいや中・ゴールは入れない） */
  const visitedPlaces = ref<GameEvent[]>([]);

  /* 場所で遊んだ回数（同じ場所で遊んでも増える）
     探検済みの場所だけでは「同じすべり台で5回あそんだ」も「1か所」になるので、
     結果の文章で「たくさん遊んだ／ほとんど遊べなかった」を見分けるために、別に数える */
  const playCount = ref(initialPlayCount);

  /* 公園で見つけたもの（同じものは1つしか入らない） */
  const collectedItems = ref<string[]>([]);

  /* 秘密の場所へ行ける条件（おでかけポイント20以上 ＆ 見つけたもの3種類以上） */
  const canEnterSecretSpot = computed(() => outingPoint.value >= 20 && collectedItems.value.length >= 3);

  /* こもれびの広場を、このプレイでもう見つけたか
     false … 「秘密の小道」を選ぶと、まずミニゲームへ ／ true … ミニゲームをやらずに、そのまま広場へ
     ※ 探検済み（visitedPlaces）とは別もの
       広場を見つけたけれど何もせずに出たときは探検済みにならないが、それでもミニゲームをくり返さないように、別に覚える */
  const hasDiscoveredSecretSpot = ref(initialHasDiscoveredSecretSpot);

  /* いま「いやいや」の最中か（切りかえるのは useTantrum。ここは入れものだけ）
     この2つだけをここに置くのは、いやいやの外からもよく見るため
     ・isTantrum    … 画面の出しわけ・進行の分かれ道・BGMの切りかえ
     ・tantrumCount … 最後のスコアとランクの計算 */
  const isTantrum = ref(initialIsTantrum);

  const tantrumCount = ref(initialTantrumCount);

  /* ここで持っている状態を、最初の状態へ戻す（もう一度あそぶとき）
     ほかの composable の状態は、それぞれの reset 関数が戻す（まとめて呼ぶのは pages/index.vue の resetGame()） */
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

    /* ===== いやいや（外からもよく見る2つだけ） ===== */
    isTantrum,
    tantrumCount,

    resetGameState,
  };
}
