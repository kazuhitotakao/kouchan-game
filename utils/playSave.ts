/* ============================================================
   本編の「つづきから」の保存

   公園の地図の画面（parkEntrance）に来るたびに、そのときのプレイの状態をこのブラウザに残す
   A画面の「つづきから」を押すと、その状態の公園の地図から再開する（つなぐのは pages/index.vue）

   ■ 公園の地図の画面でだけ保存するわけ
     ・そこでは、いやいや・とつぜんのできごと・秘密の小道・結果の表示が、どれも片づいている
       （再開に要るのは、ステータス・時刻・進みぐあい・残りのおやつ だけで足りる）
     ・場所で遊んでいる途中で読みこみ直されたときは、その前に地図にいたところから再開する
   ■ ゴール・GAME OVER で消す（終わったプレイは、もう再開しない）
   ■ 新しいプレイは、出発した時点で上書きする（おやつを選ぶ途中でやめれば、前の保存は残る）
   ■ 読み書きはブラウザで動いているときだけ。読めない・こわれているときは、保存が無いあつかい
   ============================================================ */

import { normalPlaceEvents, placeItems } from '~/data/places';
import { maxSnackCount, snacks } from '~/data/snacks';
import type { GameEvent, PlaySave, SnackId } from '~/types/game';
import { parseTimeToMinutes } from '~/utils/gameTime';

/* 保存しておく名前（localStorage のキー。ほかの保存の名前とぶつからないように） */
const playSaveStorageKey = 'kouchan-game-play-save';

/* いまの保存の形の番号（形を変えたら数を上げる。番号のちがう保存は読まない） */
const playSaveVersion = 1;

/* 有限の数ならそのまま、そうでなければ null（こわれた保存を見分けるため） */
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/* 時刻が「公園にいられるあいだ」（09:00〜11:59）の '10:40' の形か
   12:00 を過ぎていたら、もう公園の地図には戻れない（そのままゴールになる）ので、再開できない保存とみなす */
function isPlayableTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const minutes = parseTimeToMinutes(value);

  return minutes >= 9 * 60 && minutes < 12 * 60;
}

/* 配列のうち、決まった中身に入っているものだけを、同じものは1つにして取り出す（配列でなければ、からっぽ） */
function readKnownList<T>(value: unknown, known: readonly T[]): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is T => known.includes(item)))];
}

/* 保存してあったものを、保存の形に直す（再開できない・こわれているときは null）

   ・ステータス・時刻など、無いと再開できないものは、1つでもこわれていたら保存ごと使わない
   ・場所・見つけたもの・おやつの名前は、いまのゲームに無いものを読みとばす（データを変えたあとでも、残りで再開できるように） */
function toPlaySave(value: unknown): PlaySave | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const saved = value as Record<string, unknown>;

  if (saved.version !== playSaveVersion || !isPlayableTime(saved.currentTime)) {
    return null;
  }

  const savedAt = readNumber(saved.savedAt);
  const childEnergy = readNumber(saved.childEnergy);
  const childMood = readNumber(saved.childMood);
  const outingPoint = readNumber(saved.outingPoint);
  const parentEnergy = readNumber(saved.parentEnergy);
  const parentCalm = readNumber(saved.parentCalm);
  const playCount = readNumber(saved.playCount);
  const tantrumCount = readNumber(saved.tantrumCount);

  if (
    savedAt === null ||
    childEnergy === null ||
    childMood === null ||
    outingPoint === null ||
    parentEnergy === null ||
    parentCalm === null ||
    playCount === null ||
    tantrumCount === null ||
    typeof saved.hasDiscoveredSecretSpot !== 'boolean'
  ) {
    return null;
  }

  return {
    savedAt,
    childEnergy,
    childMood,
    outingPoint,
    parentEnergy,
    parentCalm,
    currentTime: saved.currentTime,
    visitedPlaces: readKnownList<GameEvent>(saved.visitedPlaces, normalPlaceEvents),
    playCount,
    collectedItems: readKnownList(saved.collectedItems, Object.values(placeItems)),
    hasDiscoveredSecretSpot: saved.hasDiscoveredSecretSpot,
    tantrumCount,
    snackIds: readKnownList<SnackId>(saved.snackIds, snacks.map((snack) => snack.id)).slice(0, maxSnackCount),
  };
}

/* 保存してあるプレイを読む（無い・読めない・こわれているときは null） */
export function loadPlaySave(): PlaySave | null {
  if (!import.meta.client) {
    return null;
  }

  try {
    return toPlaySave(JSON.parse(localStorage.getItem(playSaveStorageKey) ?? 'null'));
  } catch {
    return null;
  }
}

/* いまのプレイを保存する（前の保存は上書き） */
export function savePlay(save: PlaySave) {
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(playSaveStorageKey, JSON.stringify({ version: playSaveVersion, ...save }));
  } catch {
    // 保存できなくても、本編はふつうに遊べる（読みこみ直されたときに、つづきから選べないだけ）
  }
}

/* 保存を消す（ゴール・GAME OVER のとき） */
export function clearPlaySave() {
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.removeItem(playSaveStorageKey);
  } catch {
    // 消せなくても、次に A画面を開いたとき「つづきから」が出るだけ（押せば、終わる前の公園の地図から遊べる）
  }
}
