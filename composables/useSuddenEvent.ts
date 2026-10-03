/* ============================================================
   とつぜんのできごとの抽選
   （起こすできごとを返すだけ。予定表へ書くのは pages/index.vue の checkSuddenEvent()）
   ============================================================ */

import { suddenEventChance } from '~/data/game';
import type { GameEvent } from '~/types/game';

/* とつぜんのできごとを抽選する（20%で発生し、発生したら5種類から1つ選ぶ。何も起こらないときは null） */
export function drawSuddenEvent(): GameEvent | null {
  if (Math.random() >= suddenEventChance) {
    return null;
  }

  // 0〜4 のどれかをランダムに作って、5種類から1つ選ぶ
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
