/* ============================================================
   秘密の小道（ミニゲーム）の計算

   ・予定づくり（何を・いつ・どのレーンに出すか）、「どこまで行ける？」のレベル・速さ・行の間隔
   ・結果の文章とボーナスポイント、レーンの位置（%）、スワイプのしきい値

   ゲームの状態は書きかえない（受けとった数を見て、答えを返すだけ）
   1コマごとの動き・操作・音は useSecretPathGame.ts
   設定の数字は data/secretPath.ts（「どこまで行ける？」だけの数字は data/secretPathEndless.ts）
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

/* いま操作しているものに合わせて、スワイプのしきい値を選ぶ（マウス以外は、指のほうの数字） */
export function getSecretPathSwipeThreshold(pointerType: string) {
  return pointerType === 'mouse' ? secretPathMouseSwipeThreshold : secretPathTouchSwipeThreshold;
}

/* 候補のレーンから、ランダムに1つ選ぶ */
function pickRandomSecretPathLane(candidates: SecretPathLane[] = secretPathLanes): SecretPathLane {
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 1;
}

/* 1プレイぶんの「何を・いつ・どのレーンに出すか」の予定を作る
   こもれびの数は毎回同じにして、出てくるレーンだけをランダムにする

   ■ 前の行とのつながりも見る
     行と行のあいだに動けるのは1レーンまで、と考えて並びを決める
     （はしからはしへの2レーン移動は、すき間が短く、まず間に合わないため）
     ・枝2本の行   … 空けるレーンは、前の行のどの空きレーンからも1レーン以内で行ける所にする
     ・こもれびの行 … こもれびも、前の行のどの空きレーンからも1レーン以内で取れる所に出す
     （枝1本の行は、どこにいても いまのレーンかとなりが空いているので、そのままでよい）
     こうすると、こもれびを取りに行ったあとや、枝をよけた先で、つみにならない */
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

/* 1行ぶんの予定を作る（本編の小道と「どこまで行ける？」の両方が使う。決まりは すぐ上の説明のとおり）

   previousOpenLanes  … 前の行で空いていたレーン（こうちゃんがいるかもしれない所）
   doubleBranchChance … ふつうの行を、枝2本（空きレーン1つ）にする割合
   返すのは、この行の予定と、この行で空いているレーン（次の行の previousOpenLanes になる） */
export function buildSecretPathRow(at: number, previousOpenLanes: SecretPathLane[], isSunlightRow: boolean, doubleBranchChance: number) {
  const spawns: SecretPathSpawn[] = [];

  // 前の行のどの空きレーンからも、1レーン以内で行けるレーン（まん中は、いつでも入る）
  const reachableLanes = secretPathLanes.filter((lane) => previousOpenLanes.every((openLane) => Math.abs(openLane - lane) <= 1));
  const branchLanes: SecretPathLane[] = [];

  if (isSunlightRow) {
    const sunlightLane = pickRandomSecretPathLane(reachableLanes);

    spawns.push({ at, kind: 'sunlight', lane: sunlightLane });

    // たいていは、べつのレーンに枝もいっしょに出す（取りに行くとき、よける必要が出てくる）
    // ときどき枝を2本にして、こもれびのレーンしか空いていない行にする（こもれびは1レーン以内なので、よけられる）
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
   表（secretPathEndlessLevels）の先は、1つ上がるごとに secretPathEndlessLevelStep ずつ きびしくして、
   secretPathEndlessLevelLimits で止める */
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

/* 「どこまで行ける？」の1行ぶんの予定を作る
   こもれびの行にするかを抽選して、中身は本編と同じ buildSecretPathRow() で作る */
export function buildSecretPathEndlessRow(at: number, previousOpenLanes: SecretPathLane[], distance: number) {
  const { doubleBranchChance } = getSecretPathEndlessLevelSettings(getSecretPathEndlessLevel(distance));

  return buildSecretPathRow(at, previousOpenLanes, Math.random() < secretPathEndlessSunlightChance, doubleBranchChance);
}
