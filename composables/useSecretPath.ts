/* ============================================================
   秘密の小道（ミニゲーム）の計算

   ゲーム本編（pages/index.vue）にあった、秘密の小道の
   「計算しているところ」だけを取り出してある

   ■ ここがやること
     ・1プレイぶんの「何を・いつ・どのレーンに出すか」の予定を作る
     ・ミニゲームのページの「どこまで行ける？」の、レベル（進んだ距離から）・1行ずつの予定・速さ・行の間隔を決める
       （設定の数字は data/secretPathEndless.ts）
     ・集めたこもれびの数から、結果の文章とボーナスポイントを決める
     ・レーンの番号を、画面の位置（%）にする
     ・いま操作しているものに合わせて、スワイプのしきい値を選ぶ

   ■ ここがやらないこと
     ゲームの状態は、いっさい書きかえない（受けとった数を見て、答えを返すだけ）
     1コマごとの動き（advanceSecretPath）・指やキーの操作・音・画面の切りかえは、
     ぜんぶ composables/useSecretPathGame.ts のほう

   ■ 区切りの数字・文章は、移す前と同じ
     予定づくり（buildSecretPathSpawnQueue()）だけは、あとから
     「前の行とつなげて見ても、よけられる・取れる並びにする」決まりを足している

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
  secretPathSunlightDoubleBranchChance,
  secretPathSunlightRows,
  secretPathTouchSwipeThreshold,
} from '~/data/secretPath';
import {
  secretPathEndlessLevelLimits,
  secretPathEndlessLevelMeters,
  secretPathEndlessLevels,
  secretPathEndlessLevelStep,
  secretPathEndlessRowJitter,
  secretPathEndlessSunlightChance,
} from '~/data/secretPathEndless';
import type { SecretPathLane, SecretPathSpawn } from '~/types/game';

/* 集めたこもれびの数に合わせた、結果の文章 */
export function getSecretPathResultText(sunlightCount: number) {
  if (sunlightCount >= 4) {
    return '✨ こもれびが道を照らしています！「きらきらー！」こうちゃんはうれしそうに奥へ走っていきます。';
  }

  if (sunlightCount >= 2) {
    return 'こもれびを追いかけながら、こうちゃんと小道の奥へ進みました！';
  }

  return '木々のあいだをゆっくり進みました。道の奥が少し明るくなっています。';
}

/* 集めたこもれびの数から、ボーナスのおでかけポイントを決める（結果の文章と同じ区切り） */
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

   こもれびの数（5つ）は毎回同じにして、出てくるレーンだけをランダムにする
   どの行も、少なくとも1つのレーンは空いているので、よけられない形にはならない

   ■ 前の行とのつながりも見る
     行と行のあいだに動けるのは1レーンまで、と考えて並びを決める
     （左はし → 右はしの2レーン移動は、まん中のレーンに前後の行の枝がはさまっていると、
       すき間がとても短く、実際にはまず間に合わないため）

     例：「✨ 🌿 なし」のすぐあとに「🌿 🌿 なし」
         ✨ を取ると左はしにいるので、次の行をよけるには右はしまで2レーン動くしかない

     そうならないように、次の2つを守る
     ・枝2本の行   … 空けるレーンは、前の行のどの空きレーンからも1レーン以内で行ける所にする
     ・こもれびの行 … こもれびも、前の行のどの空きレーンからも1レーン以内で取れる所に出す
     枝1本の行は、前の行のどこにいても、いまのレーンかとなりのレーンのどちらかが空いているので、そのままでよい
     （いちばん最初の行は、こうちゃんのスタート位置（まん中）を「前の行」として見る）

     前の行で空いていたどのレーンにいても、次の行をよけられて・こもれびも取れるので、
     こもれびを取りに行ったあとや、枝をよけた先で、つみにならない */
export function buildSecretPathSpawnQueue(): SecretPathSpawn[] {
  const queue: SecretPathSpawn[] = [];

  // 前の行で空いていたレーン（こうちゃんがいるかもしれない所）
  let previousOpenLanes: SecretPathLane[] = [1];

  for (let row = 0; row < secretPathRowCount; row++) {
    const at = secretPathFirstRowAt + row * secretPathRowInterval + (Math.random() * 2 - 1) * secretPathRowJitter;
    const builtRow = buildSecretPathRow(at, previousOpenLanes, secretPathSunlightRows.includes(row), secretPathDoubleBranchChance);

    queue.push(...builtRow.spawns);
    previousOpenLanes = builtRow.openLanes;
  }

  return queue.sort((a, b) => a.at - b.at);
}

/* 1行ぶんの予定（どのレーンに枝・こもれびを出すか）を作る

   本編の小道（buildSecretPathSpawnQueue()）と、
   ミニゲームのページの「どこまで行ける？」（composables/useSecretPathGame.ts）の両方が使う
   「前の行とのつながりも見る」決まりは、すぐ上の buildSecretPathSpawnQueue() の説明のとおり

   at                 … この行を出す時刻（ゲームの時計）
   previousOpenLanes  … 前の行で空いていたレーン（こうちゃんがいるかもしれない所）
   isSunlightRow      … こもれびの行にするか
   doubleBranchChance … ふつうの行を、枝2本（空きレーン1つ）にする割合

   返すのは、この行の予定（spawns）と、この行で空いているレーン（次の行の previousOpenLanes になる）

   ※ 乱数を使う順番は、この関数に分ける前の buildSecretPathSpawnQueue() と同じ */
export function buildSecretPathRow(at: number, previousOpenLanes: SecretPathLane[], isSunlightRow: boolean, doubleBranchChance: number) {
  const spawns: SecretPathSpawn[] = [];

  // 前の行のどの空きレーンからも、1レーン以内で行けるレーン（まん中は、いつでも入る）
  const reachableLanes = secretPathLanes.filter((lane) => previousOpenLanes.every((openLane) => Math.abs(openLane - lane) <= 1));
  const branchLanes: SecretPathLane[] = [];

  if (isSunlightRow) {
    const sunlightLane = pickRandomSecretPathLane(reachableLanes);

    spawns.push({ at, kind: 'sunlight', lane: sunlightLane });

    // たいていは、こもれびとはべつのレーンに枝もいっしょに出す（取りに行くとき、よける必要が出てくる）
    // ときどき枝を2本にして、こもれびのレーンしか空いていない行にする
    // （こもれびは前の行のどこからでも1レーン以内なので、この行も かならずよけられる）
    if (Math.random() < secretPathSunlightBranchChance) {
      const otherLanes = secretPathLanes.filter((lane) => lane !== sunlightLane);

      branchLanes.push(...(Math.random() < secretPathSunlightDoubleBranchChance ? otherLanes : [pickRandomSecretPathLane(otherLanes)]));
    }
  } else if (Math.random() < doubleBranchChance) {
    // ときどき枝を2本にして、空いているレーンを1つだけにする（3本にはしない）
    const openLane = pickRandomSecretPathLane(reachableLanes);

    branchLanes.push(...secretPathLanes.filter((lane) => lane !== openLane));
  } else {
    // ふつうの行は枝を1本
    branchLanes.push(pickRandomSecretPathLane());
  }

  for (const lane of branchLanes) {
    spawns.push({ at, kind: 'branch', lane });
  }

  const openLanes = secretPathLanes.filter((lane) => !branchLanes.includes(lane));

  return { spawns, openLanes };
}

/* 「どこまで行ける？」のレベル（進んだ距離から決める。0m〜 Lv.1、50m〜 Lv.2 …） */
export function getSecretPathEndlessLevel(distance: number) {
  return Math.floor(Math.max(distance, 0) / secretPathEndlessLevelMeters) + 1;
}

/* 「どこまで行ける？」の、そのレベルの きびしさ（速さ・行の間隔・枝2本の割合）

   Lv.1 〜 表の最後（Lv.7）までは、data/secretPathEndless.ts の secretPathEndlessLevels のとおり
   その先は、表の最後から1つ上がるごとに secretPathEndlessLevelStep ずつ きびしくして、
   secretPathEndlessLevelLimits で止める（上手な人でも、いつかは続けられなくなる） */
export function getSecretPathEndlessLevelSettings(level: number) {
  const tableLevel = secretPathEndlessLevels[level - 1];

  if (tableLevel) {
    return tableLevel;
  }

  const last = secretPathEndlessLevels[secretPathEndlessLevels.length - 1]!;
  const extra = level - secretPathEndlessLevels.length;

  return {
    speed: Math.min(secretPathEndlessLevelLimits.maxSpeed, last.speed + secretPathEndlessLevelStep.speed * extra),
    rowInterval: Math.max(secretPathEndlessLevelLimits.minRowInterval, last.rowInterval + secretPathEndlessLevelStep.rowInterval * extra),
    doubleBranchChance: Math.min(secretPathEndlessLevelLimits.maxDoubleBranchChance, last.doubleBranchChance + secretPathEndlessLevelStep.doubleBranchChance * extra),
  };
}

/* 「どこまで行ける？」の流れてくる速さ（1秒で、フィールドの高さの何%進むか。進んだ距離のレベルで決まる） */
export function getSecretPathEndlessSpeed(distance: number) {
  return getSecretPathEndlessLevelSettings(getSecretPathEndlessLevel(distance)).speed;
}

/* 「どこまで行ける？」の次の行を出す時刻（いまの行を出した時刻 at から、いまのレベルの間隔だけあける） */
export function getSecretPathEndlessNextRowAt(at: number, distance: number) {
  const { rowInterval } = getSecretPathEndlessLevelSettings(getSecretPathEndlessLevel(distance));

  return at + rowInterval + (Math.random() * 2 - 1) * secretPathEndlessRowJitter;
}

/* 「どこまで行ける？」の1行ぶんの予定を作る（at に出す行。枝2本の割合は、いまのレベルで決まる）

   こもれびの行にするかどうかを抽選して、行の中身は本編と同じ buildSecretPathRow() で作る
   （前の行とつなげて見ても、よけられる・取れる並びになる） */
export function buildSecretPathEndlessRow(at: number, previousOpenLanes: SecretPathLane[], distance: number) {
  const { doubleBranchChance } = getSecretPathEndlessLevelSettings(getSecretPathEndlessLevel(distance));

  return buildSecretPathRow(at, previousOpenLanes, Math.random() < secretPathEndlessSunlightChance, doubleBranchChance);
}
