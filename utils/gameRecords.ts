/* ============================================================
   本編のハイスコアと、直近の記録の保存

   本編が終わるたび（ゴール・GAME OVER）に、1回ぶんの記録をこのブラウザに残す
   書くのは composables/useGameResult.ts、画面に出すのは pages/index.vue と components/game/GameRecordHistory.vue

   ■ 保存する場所（localStorage）… ハイスコアと直近の記録を、1つの名前にまとめて入れる
     { version: 1, best: ハイスコアのプレイ, recent: 直近の記録（新しい順） }
     ・1つにまとめるのは、「ハイスコアだけ保存できて、直近の記録は保存できなかった」のような食いちがいを作らないため
     ・best を recent と別に持つのは、ハイスコアの回が直近の記録から押し出されても消えないようにするため
     ・version は、あとで形を変えるときに、古い形の記録を読みかえるための目印
   ■ ハイスコアは総合スコア（0〜100）でくらべる
     ・GAME OVER は点数を出さないので入らない。特殊エンドは点数を出しているので入る
     ・同点のときは、先に取ったほうを残す
   ■ この機能を入れる前のプレイの点数は、どこにも保存されていないので、さかのぼってハイスコアにはできない
     （S+ランクを取ったかどうかは utils/sPlusSong.ts に残っているが、何点だったかは分からない）
   ■ 読み書きはブラウザで動いているときだけ。読めない・書けないときは、記録が無いあつかい
   ============================================================ */

import type { GameRecord } from '~/types/game';

/* 保存しておく直近の記録の数（リザルト画面に出すのは、そのうち新しいもの数件だけ → GameRecordHistory.vue） */
export const recentGameRecordLimit = 10;

/* 保存しておく名前（localStorage のキー。ほかの保存の名前とぶつからないように） */
const gameRecordsStorageKey = 'kouchan-game-records';

/* いまの保存の形の番号（形を変えたら数を上げて、読むときに古い形を読みかえる） */
const gameRecordsVersion = 1;

/* ハイスコアと直近の記録（直近の記録は新しい順） */
export type GameRecords = {
  best: GameRecord | null;
  recent: GameRecord[];
};

/* 記録を1件足したあとの答え

   best / recent       … 足したあとのハイスコアと直近の記録（そのまま画面に出す）
   isHighScoreUpdated  … 前のハイスコアをこえたか（はじめての記録のときは false）
   previousBest        … 足す前のハイスコア（まだ無かったときは null）
   previousRecord      … 今回の1つ前の記録（はじめてなら null） */
export type AddGameRecordResult = GameRecords & {
  isHighScoreUpdated: boolean;
  previousBest: GameRecord | null;
  previousRecord: GameRecord | null;
};

/* 有限の数ならそのまま、そうでなければ null（こわれた記録を見分けるため） */
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/* 保存してあった1件を、記録の形に直す（形がこわれているものは null。読みとばす）

   ・いつ・どう終わったか・何点か は、無いと記録として使えないので、こわれていたら捨てる
   ・それ以外のくわしい数と文は、無ければ 0 と空文字にする（あとで項目を足したとき、前の記録まで捨てないように） */
function toGameRecord(value: unknown): GameRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const saved = value as Record<string, unknown>;

  const playedAt = readNumber(saved.playedAt);
  const result = saved.result;

  if (playedAt === null || (result !== 'goal' && result !== 'gameOver')) {
    return null;
  }

  // 点数とランクは、ゴールのときだけ（GAME OVER は、どちらも無し）
  const score = result === 'goal' ? readNumber(saved.score) : null;
  const rank = result === 'goal' && typeof saved.rank === 'string' ? saved.rank : null;

  if (result === 'goal' && (score === null || rank === null)) {
    return null;
  }

  return {
    playedAt,
    result,
    score,
    rank,
    title: typeof saved.title === 'string' ? saved.title : '',
    returnTime: typeof saved.returnTime === 'string' ? saved.returnTime : '',
    childEnergy: readNumber(saved.childEnergy) ?? 0,
    childMood: readNumber(saved.childMood) ?? 0,
    parentEnergy: readNumber(saved.parentEnergy) ?? 0,
    parentCalm: readNumber(saved.parentCalm) ?? 0,
    outingPoint: readNumber(saved.outingPoint) ?? 0,
    tantrumCount: readNumber(saved.tantrumCount) ?? 0,
    visitedPlaceCount: readNumber(saved.visitedPlaceCount) ?? 0,
    playCount: readNumber(saved.playCount) ?? 0,
    collectedItemCount: readNumber(saved.collectedItemCount) ?? 0,
  };
}

/* ハイスコアと直近の記録を読む（まだ遊んでいない・読めないときは、からっぽ） */
export function loadGameRecords(): GameRecords {
  if (!import.meta.client) {
    return { best: null, recent: [] };
  }

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(gameRecordsStorageKey) ?? 'null');

    if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) {
      return { best: null, recent: [] };
    }

    const { best, recent } = saved as Record<string, unknown>;

    // ハイスコアになれるのは、点数のあるゴールの記録だけ
    const bestRecord = toGameRecord(best);

    return {
      best: bestRecord?.result === 'goal' ? bestRecord : null,
      // こわれた記録は読みとばす
      recent: Array.isArray(recent)
        ? recent
            .map(toGameRecord)
            .filter((record): record is GameRecord => record !== null)
            .slice(0, recentGameRecordLimit)
        : [],
    };
  } catch {
    return { best: null, recent: [] };
  }
}

/* 1回ぶんの記録を足して、保存する（直近の記録のいちばん上に入れて、ハイスコアならハイスコアも入れかえる）

   ・保存の直前に読みなおすのは、別のタブで遊んだ記録を消さないため
   ・保存できなくても、答えは返す（そのページを開いているあいだは、画面に記録が出る）
   ・「ハイスコア更新！」は、前のハイスコアをこえたときだけ（はじめての記録は、だまってハイスコアにする）
     この機能を入れたあとは、前から遊んでいた人も記録ゼロから始まるので、最初の1回に低い点でも「更新！」と出てしまわないように */
export function addGameRecord(record: GameRecord): AddGameRecordResult {
  const { best: previousBest, recent: previousRecent } = loadGameRecords();

  // 同点は更新しない（先に取ったほうを残す）
  const isBestScore = record.score !== null && (previousBest === null || record.score > (previousBest.score ?? 0));

  const best = isBestScore ? record : previousBest;
  const recent = [record, ...previousRecent].slice(0, recentGameRecordLimit);

  if (import.meta.client) {
    try {
      localStorage.setItem(gameRecordsStorageKey, JSON.stringify({ version: gameRecordsVersion, best, recent }));
    } catch {
      // 保存できなくても、本編はふつうに遊べる（次に開いたとき、この記録が無いだけ）
    }
  }

  return {
    best,
    recent,
    isHighScoreUpdated: isBestScore && previousBest !== null,
    previousBest,
    previousRecord: previousRecent[0] ?? null,
  };
}

/* 記録の点数の書きかた（ゴールは「72点」、GAME OVER は「GAME OVER」） */
export function formatRecordScore(record: GameRecord) {
  return record.result === 'goal' ? `${record.score}点` : 'GAME OVER';
}

/* 記録のランクの書きかた（「Sランク」→「S」。英字だけをバッジにするほうが、ひと目で分かる）
   英字のランクではない「特殊エンド」は、そのまま */
export function formatRecordRank(rank: string) {
  return rank.replace(/ランク$/, '');
}

/* 英字のランク（S+ / S / A / B / C / D）か（「特殊エンド」は false。バッジの文字を小さくするのに使う） */
export function isLetterRank(rank: string) {
  return rank.endsWith('ランク');
}

/* ランクのバッジの色分け（3段階。クラス名の「〜--top」「〜--low」に使う）
   top    … S+ / S（金色。このゲームでは金色＝「特別」）
   normal … A / B / 特殊エンド（いつもの紺。特殊エンドは点数の良し悪しとは別の結末なので、ふつうの扱い）
   low    … C / D（ひかえめな灰青。良い回を目立たせるため。赤は「あぶない」・GAME OVER の色なので使わない） */
export function getRecordRankTier(rank: string): 'top' | 'normal' | 'low' {
  if (rank === 'S+ランク' || rank === 'Sランク') {
    return 'top';
  }

  if (rank === 'Cランク' || rank === 'Dランク') {
    return 'low';
  }

  return 'normal';
}

/* 遊んだ日時を「2026/10/7 14:32」の形にする
   年も出す（ハイスコアは何年も前の記録が残ることがあり、直近の記録も、たまに遊ぶ人では年をまたぐため）
   年によって付けたり付けなかったりはしない（一覧で、日時の長さがそろわなくなるため） */
export function formatPlayedAt(playedAt: number) {
  const date = new Date(playedAt);

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}
