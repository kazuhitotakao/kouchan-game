/* ============================================================
   秘密の小道（ミニゲーム）の計算

   ゲーム本編（pages/index.vue）にあった、秘密の小道の
   「計算しているところ」だけを取り出してある

   ■ ここがやること
     ・1プレイぶんの「何を・いつ・どのレーンに出すか」の予定を作る
     ・集めた木漏れ日の数から、結果の文章とボーナスポイントを決める
     ・レーンの番号を、画面の位置（%）にする
     ・いま操作しているものに合わせて、スワイプのしきい値を選ぶ

   ■ ここがやらないこと
     ゲームの状態は、いっさい書きかえない（受けとった数を見て、答えを返すだけ）
     1コマごとの動き（advanceSecretPath）・指やキーの操作・音・画面の切りかえは、
     ぜんぶ pages/index.vue のまま

   ■ 区切りの数字・文章・乱数を使う順番は、いっさい変えていない
     移す前とまったく同じ順番で Math.random() を呼んでいるので、
     同じ遊びかたをすれば、移す前と同じ小道になる

   ■ 設定の数字は data/secretPath.ts、型は types/game.ts のものをそのまま使う
   ============================================================ */

import {
  secretPathBonusGoodPoint,
  secretPathBonusGreatPoint,
  secretPathDoubleBranchChance,
  secretPathFirstRowAt,
  secretPathLanes,
  secretPathMouseSwipeThreshold,
  secretPathRowCount,
  secretPathRowInterval,
  secretPathRowJitter,
  secretPathSunlightBranchChance,
  secretPathSunlightRows,
  secretPathTouchSwipeThreshold,
} from '~/data/secretPath';
import type { SecretPathLane, SecretPathSpawn } from '~/types/game';

/* 集めた木漏れ日の数に合わせた、結果の文章 */
export function getSecretPathResultText(sunlightCount: number) {
  if (sunlightCount >= 4) {
    return '✨ 木漏れ日が道を照らしています！「きらきらー！」こうちゃんはうれしそうに奥へ走っていきます。';
  }

  if (sunlightCount >= 2) {
    return '木漏れ日を追いかけながら、こうちゃんと小道の奥へ進みました！';
  }

  return '木々のあいだをゆっくり進みました。道の奥が少し明るくなっています。';
}

/* 集めた木漏れ日の数から、ボーナスのおでかけポイントを決める（結果の文章と同じ区切り） */
export function getSecretPathBonusPoint(sunlightCount: number) {
  if (sunlightCount >= 4) {
    return secretPathBonusGreatPoint;
  }

  if (sunlightCount >= 2) {
    return secretPathBonusGoodPoint;
  }

  return 0;
}

/* レーンの番号を、フィールドの左はしからの位置（%）にする
   0 → 16.7%（左のまん中）、1 → 50%、2 → 83.3%（右のまん中） */
export function getSecretPathLaneLeft(lane: SecretPathLane) {
  return `${((lane * 2 + 1) / 6) * 100}%`;
}

/* いま操作しているものに合わせて、しきい値を選ぶ

   pointerType … 'mouse' / 'touch'（指）/ 'pen' のどれか
   マウス以外（指・ペン）は、まとめて指のほうの数字を使う
*/
export function getSecretPathSwipeThreshold(pointerType: string) {
  return pointerType === 'mouse' ? secretPathMouseSwipeThreshold : secretPathTouchSwipeThreshold;
}

/* 候補のレーンから、ランダムに1つ選ぶ */
function pickRandomSecretPathLane(candidates: SecretPathLane[] = secretPathLanes): SecretPathLane {
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 1;
}

/* 1プレイぶんの「何を・いつ・どのレーンに出すか」の予定を作る

   木漏れ日の数（5つ）は毎回同じにして、出てくるレーンだけをランダムにする
   どの行も、少なくとも1つのレーンは空いているので、よけられない形にはならない */
export function buildSecretPathSpawnQueue(): SecretPathSpawn[] {
  const queue: SecretPathSpawn[] = [];

  for (let row = 0; row < secretPathRowCount; row++) {
    const at = secretPathFirstRowAt + row * secretPathRowInterval + (Math.random() * 2 - 1) * secretPathRowJitter;

    if (secretPathSunlightRows.includes(row)) {
      const sunlightLane = pickRandomSecretPathLane();

      queue.push({ at, kind: 'sunlight', lane: sunlightLane });

      // たいていは、木漏れ日とはべつのレーンに枝もいっしょに出す（取りに行くとき、よける必要が出てくる）
      if (Math.random() < secretPathSunlightBranchChance) {
        queue.push({ at, kind: 'branch', lane: pickRandomSecretPathLane(secretPathLanes.filter((lane) => lane !== sunlightLane)) });
      }

      continue;
    }

    // ふつうの行は枝を1本。ときどき2本にして、空いているレーンを1つだけにする（3本にはしない）
    const branchLane = pickRandomSecretPathLane();

    queue.push({ at, kind: 'branch', lane: branchLane });

    if (Math.random() < secretPathDoubleBranchChance) {
      queue.push({ at, kind: 'branch', lane: pickRandomSecretPathLane(secretPathLanes.filter((lane) => lane !== branchLane)) });
    }
  }

  return queue.sort((a, b) => a.at - b.at);
}
