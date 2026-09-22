/* ============================================================
   ゲームの本体状態（ステータス・おでかけポイント・時間・ゲームの進みぐあい）

   ゲーム本編（pages/index.vue）にあった
   「ゲームそのものの状態」の入れものだけを取り出してある

   ■ ここがやること
     ・こうちゃんと親のステータス、おでかけポイント、いまの時刻を用意する
     ・いまの時刻を「分」に直したもの（currentMinutes）を用意する
     ・いまどこまでゲームが進んでいるか（いる場所・探検済み・見つけたもの・
       遊んだ回数・こもれびの広場を見つけたか）を用意する

   ■ ここがやらないこと
     ゲームの進みかたは、いっさい決めない
     ・時間を進める addMinutes()
     ・ステータスを上げ下げする行動の中身
     ・場所を移動する・行動する・アイテムを見つける処理
     ・とつぜんのできごとの抽選と、画面の切りかえ
     ・「もう一度あそぶ」の resetGame()
     ・上限下限をそろえる fixAllStatus()
     は、ぜんぶ pages/index.vue のまま

     状態を書きかえる専用の関数（setter）も用意していない
     受けとった側から currentEvent.value = ... のように、今までどおり書きかえる

   ■ 初期値・データの形・計算のしかたは、いっさい変えていない
     pages/index.vue に書いてあった値と型をそのまま持ってきている
     （配列は配列のまま。resetGame() 側の戻しかたも今までと同じ）

   ■ 返すのは ref / computed そのもの
     受けとった側で childEnergy.value = ... のように
     今までどおり書きかえられるようにしてある

   ■ ここに入れないもの
     ・いやいや（isTantrum・tantrumCount など。useTantrum との整理は別の回に行う）
     ・次に起こす予定のとつぜんのできごと（pendingSuddenEvent）
       「次へ」を押すまでのあいだだけ持っておく、画面の切りかえ待ちなので
     ・結果や変化の記録（statusBefore・statusChanges など）
     ・画面の状態（タイトル画面かどうか・選んでいるコマンド・ダイアログの開閉・DOMのref）
     ・秘密の小道（ミニゲーム）の中の状態（secretPath* 系）
     ・音の状態（そちらは composables/useAudio.ts が持っている）
   ============================================================ */

import { computed, ref } from 'vue';
import { parseTimeToMinutes } from '~/utils/gameTime';
import type { GameEvent } from '~/types/game';

export function useGameState() {
  /* ゲームのステータス */
  const childEnergy = ref(100); // こうちゃんの体力
  const childMood = ref(55); // こうちゃんの機嫌（ぐずりだすライン50のすぐ上からスタート）
  const outingPoint = ref(0); // おでかけポイント
  const parentEnergy = ref(100); // 親の体力
  const parentCalm = ref(100); // 親の余裕（100 = とても余裕がある、0 = GAME OVER）
  const currentTime = ref('09:00'); // 時間

  /* 今の時間を「分」に直したもの
     09:00 なら 540、12:00 なら 720 になる
  */
  const currentMinutes = computed(() => parseTimeToMinutes(currentTime.value));

  /* 現在いる場所
     最初は「公園入口」からスタート
  */
  const currentEvent = ref<GameEvent>('parkEntrance');

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
  };
}
