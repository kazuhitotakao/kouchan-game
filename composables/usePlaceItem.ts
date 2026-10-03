/* ============================================================
   場所のアイテムが見つかるかの判定
   （見つかったアイテムの名前を返すだけ。持ちものに加えるのは pages/index.vue の tryCollectPlaceItem()）
   ============================================================ */

import { firstVisitItemFindChance, placeItems } from '~/data/places';
import type { ItemPlace } from '~/types/game';

/* 場所で遊んだときに、その場所のアイテムが見つかるか判定する（どちらの行動を選んでも、条件は同じ）

   ・その場所ではじめて遊んだとき … 60%で見つかる
   ・前に遊んだのに、まだ見つけていないとき … かならず見つかる（運がわるくても、2回目で取れるようにする救済）
   ・もう見つけているとき … null（抽選もしない）
   isVisited … その場所を前にも探検しているか */
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
