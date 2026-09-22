/* ============================================================
   場所のアイテムが見つかるかの判定

   ゲーム本編（pages/index.vue）にあった tryCollectPlaceItem() の
   「見つかるかどうかを決めているところ」だけを取り出してある

   ■ ここがやること
     その場所のアイテムが今回見つかるかを決めて、見つかったアイテムの名前を返す

   ■ ここがやらないこと
     ゲームの状態は、いっさい書きかえない（見つかったかどうかを返すだけ）
     持ちものに加えるのも、発見音を鳴らすのも、演出用に覚えておくのも、
     受けとった pages/index.vue の tryCollectPlaceItem() のまま

   ■ 取得条件・確率・判定の順番は、いっさい変えていない
     探検済みのときに Math.random() を呼ばない（|| の短絡）ところも同じなので、
     同じ遊びかたをすれば、移す前と同じようにアイテムが見つかる

   ■ どの場所で何が見つかるか（placeItems）と、はじめての場所の確率
     （firstVisitItemFindChance）は data/places.ts のものをそのまま使う
   ============================================================ */

import { firstVisitItemFindChance, placeItems } from '~/data/places';
import type { ItemPlace } from '~/types/game';

/* 場所で遊んだときに、その場所のアイテムが見つかるか判定する

   ・どちらの行動を選んでも、条件は同じ
   ・その場所ではじめて遊んだとき … 60%で見つかる
   ・前にその場所で遊んだのに、まだ見つけていないとき … かならず見つかる
     （運がわるくても、2回目でかならず取れるようにするための救済）
   ・もう見つけているとき … 何もしない（抽選もしない）

   place          … どの場所で遊んだか
   collectedItems … これまでに見つけたものの名前（いまの持ちもの）
   isVisited      … その場所を前にも探検しているか

   見つかったときは、そのアイテムの名前を返す
   見つからなかった（または、もう持っている）ときは null を返す
*/
export function judgePlaceItem(place: ItemPlace, collectedItems: string[], isVisited: boolean) {
  const itemName = placeItems[place];

  if (collectedItems.includes(itemName)) {
    return null;
  }

  // 探検済みなら抽選せずに見つかる（|| なので、そのときは Math.random() も呼ばない）
  const isFound = isVisited || Math.random() < firstVisitItemFindChance;

  if (!isFound) {
    return null;
  }

  return itemName;
}
