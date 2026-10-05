/* ============================================================
   ミニゲームの「解放」と「自己ベスト」の保存（ミニゲームごと）

   本編・ミニゲームの一覧・それぞれのミニゲームで、同じ保存場所を使うので、ここにまとめてある

   ■ 保存する場所（localStorage）
     ・解放したミニゲーム … id の一覧（["secret-path"] など）
     ・NEW のミニゲーム   … 解放したけれど、まだ一覧で見ていないものの id の一覧（タイトルの「🎮 ミニゲーム」と一覧のカードに NEW を出す）
     ・自己ベスト        … ゲームごとの形のまま（{ distance, sunlight } など）
   ■ 一度解放したら戻さない（ロックに戻す関数は わざと作っていない）
   ■ 読み書きはブラウザで動いているときだけ。読めない・書けないときは、解放していない・記録が無いあつかい
   ============================================================ */

import { isMinigameId } from '~/data/minigames';
import type { MinigameId } from '~/data/minigames';

const unlockedStorageKey = 'kouchan-game-minigames-unlocked';
const newStorageKey = 'kouchan-game-minigames-new';

function getBestStorageKey(id: MinigameId) {
  return `kouchan-game-minigame-best-${id}`;
}

/* id の一覧を読む（解放したもの・NEW のもの、どちらも同じ形。まだ1つも無いときは、からっぽ） */
function loadMinigameIds(storageKey: string): MinigameId[] {
  if (!import.meta.client) {
    return [];
  }

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');

    // こわれた記録や、いまは無いミニゲームの id は読みとばす
    return Array.isArray(saved) ? saved.filter(isMinigameId) : [];
  } catch {
    return [];
  }
}

/* 解放したミニゲームの id の一覧を読む */
export function loadUnlockedMinigames(): MinigameId[] {
  return loadMinigameIds(unlockedStorageKey);
}

/* 新しく解放して、まだ一覧で見ていないミニゲームの id の一覧を読む（NEW の印を出すもの） */
export function loadNewMinigames(): MinigameId[] {
  return loadMinigameIds(newStorageKey);
}

/* ミニゲームを解放したことを保存する（NEW の一覧にも入れる）
   はじめて解放したときだけ true を返す（本編で「🎮 ミニゲーム解放！」を出すかどうかに使う）
   もう解放してあるとき・保存できなかったときは false */
export function unlockMinigame(id: MinigameId): boolean {
  if (!import.meta.client) {
    return false;
  }

  const unlocked = loadUnlockedMinigames();

  if (unlocked.includes(id)) {
    return false;
  }

  try {
    localStorage.setItem(unlockedStorageKey, JSON.stringify([...unlocked, id]));
    localStorage.setItem(newStorageKey, JSON.stringify([...loadNewMinigames(), id]));

    return true;
  } catch {
    // 保存できなくても、本編はふつうに遊べる（次に開いたとき、入口が出ないだけ）
    return false;
  }
}

/* NEW の印をぜんぶ消す（ミニゲームの一覧を開いたときに呼ぶ。そのとき画面に出ている NEW は、ページを出るまで残る） */
export function clearNewMinigames() {
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.removeItem(newStorageKey);
  } catch {
    // 消せなくても、次に一覧を開いたとき、もう一度 NEW が出るだけ
  }
}

/* 自己ベストを、保存したときの形のまま読む（まだ遊んでいない・読めないときは null）
   中身の形はゲームごとにちがうので、使う側が数に直して使う */
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
