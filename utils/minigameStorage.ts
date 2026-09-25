/* ============================================================
   ミニゲームの「解放」と「自己ベスト」の保存（ミニゲームごと）

   ゲーム本編（pages/index.vue）・ミニゲームの一覧（pages/minigame/index.vue）・
   それぞれのミニゲームのページ（pages/minigame/<id>.vue）で、同じ保存場所を使うので、ここ1か所にまとめてある
   （S+ランクのうた入りBGM（utils/sPlusSong.ts）と同じ考えかた）

   ■ 保存する場所（localStorage）
     ・解放したミニゲーム … kouchan-game-minigames-unlocked に、id の一覧（["secret-path"] など）
     ・自己ベスト         … kouchan-game-minigame-best-<id> に、ゲームごとの形のまま（{ distance, sunlight } など）
     ほかの保存（kouchan-game-〜・kouchan-soundtrack-〜）とぶつからない名前にしてある

   ■ 一度解放したら、もう一度あそんでも、ブラウザを閉じても、ロックには戻さない
     （そのため、ロックに戻す関数は わざと作っていない）

   ■ localStorage はブラウザにしか無い
     読み書きは import.meta.client（ブラウザで動いているとき）だけ行う
     呼ぶ側も、onMounted や遊んでいる最中など、ブラウザで動くところから呼ぶ
     読めない・書けないとき（ブラウザの設定など）は、まだ解放していない・記録が無いあつかいにする
   ============================================================ */

import { isMinigameId } from '~/data/minigames';
import type { MinigameId } from '~/data/minigames';

const unlockedStorageKey = 'kouchan-game-minigames-unlocked';

function getBestStorageKey(id: MinigameId) {
  return `kouchan-game-minigame-best-${id}`;
}

/* 解放したミニゲームの id の一覧を読む（まだ1つも無いときは、からっぽ） */
export function loadUnlockedMinigames(): MinigameId[] {
  if (!import.meta.client) {
    return [];
  }

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(unlockedStorageKey) ?? '[]');

    // こわれた記録や、いまは無いミニゲームの id は読みとばす
    return Array.isArray(saved) ? saved.filter(isMinigameId) : [];
  } catch {
    return [];
  }
}

/* ミニゲームを解放したことを保存する（もう解放してあるときは何もしない） */
export function unlockMinigame(id: MinigameId) {
  if (!import.meta.client) {
    return;
  }

  const unlocked = loadUnlockedMinigames();

  if (unlocked.includes(id)) {
    return;
  }

  try {
    localStorage.setItem(unlockedStorageKey, JSON.stringify([...unlocked, id]));
  } catch {
    // 保存できなくても、本編はふつうに遊べる（次に開いたとき、入口が出ないだけ）
  }
}

/* 自己ベストを、保存したときの形のまま読む（まだ遊んでいない・読めないときは null）

   中身の形はゲームごとにちがうので、ここではたしかめない
   使う側（それぞれのミニゲームのページ・data/minigames.ts の formatBest）が、数に直して使う */
export function loadMinigameBest(id: MinigameId): Record<string, unknown> | null {
  if (!import.meta.client) {
    return null;
  }

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(getBestStorageKey(id)) ?? 'null');

    return saved !== null && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/* 自己ベストを保存する */
export function saveMinigameBest(id: MinigameId, best: Record<string, unknown>) {
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(getBestStorageKey(id), JSON.stringify(best));
  } catch {
    // 保存できなくても、そのページを開いているあいだは記録が出る
  }
}
