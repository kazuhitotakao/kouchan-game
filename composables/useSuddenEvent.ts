/* ============================================================
   とつぜんのできごとの抽選

   ゲーム本編（pages/index.vue）にあった checkSuddenEvent() の
   「起こすかどうか・どれを起こすか」を決めているところだけを取り出してある

   ■ ここがやること
     20%で発生するかを決めて、発生したら5種類から1つ選んで返す

   ■ ここがやらないこと
     ゲームの状態は、いっさい書きかえない（どれを起こすかを返すだけ）
     予定表（pendingSuddenEvent）へ書くのも、画面を切りかえるのも、
     受けとった pages/index.vue の checkSuddenEvent() のまま

   ■ 確率・選ぶ順番・分岐の順番は、いっさい変えていない
     Math.random() を呼ぶ回数と順番も移す前と同じなので、
     同じ遊びかたをすれば、移す前と同じできごとが起きる

   ■ 専用画面へ移動しない「ランダムイベント」とは別物
     そちらは composables/useRandomEvent.ts のほうにある
     （結果カードに文章とステータス変化が少し足されるだけのできごと）

   ■ 発生する確率（suddenEventChance）は data/game.ts のものをそのまま使う
   ============================================================ */

import { suddenEventChance } from '~/data/game';
import type { GameEvent } from '~/types/game';

/* とつぜんのできごとを抽選する

   ① 20%（suddenEventChance）で発生するか決める
   ② 発生したら、5種類の中からランダムで1つ選ぶ

   起こすできごとを返す。今回は何も起こらないときは null を返す
*/
export function drawSuddenEvent(): GameEvent | null {
  // 0以上1未満のランダムな数を出して、0.2より小さければ発生（＝20%）
  // 逆に0.2以上なら、今回は何も起こらないのでここで終わり（＝80%）
  if (Math.random() >= suddenEventChance) {
    return null;
  }

  // 0・1・2・3・4 のどれかをランダムに作って、5種類から1つ選ぶ
  const eventNumber = Math.floor(Math.random() * 5);

  if (eventNumber === 0) {
    return 'emergencySiren';
  }

  if (eventNumber === 1) {
    return 'ladybug';
  }

  if (eventNumber === 2) {
    return 'dog';
  }

  if (eventNumber === 3) {
    return 'fallDown';
  }

  return 'fountain';
}
