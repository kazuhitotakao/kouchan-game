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
   どの行も、少なくとも1つのレーンは空いているので、よけられない形にはならない

   ■ 前の行とのつながりも見る
     行と行のあいだに動けるのは1レーンまで、と考えて並びを決める
     （左はし → 右はしの2レーン移動は、まん中のレーンに前後の行の枝がはさまっていると、
       すき間がとても短く、実際にはまず間に合わないため）

     例：「✨ 🌿 なし」のすぐあとに「🌿 🌿 なし」
         ✨ を取ると左はしにいるので、次の行をよけるには右はしまで2レーン動くしかない

     そうならないように、次の2つを守る
     ・枝2本の行   … 空けるレーンは、前の行のどの空きレーンからも1レーン以内で行ける所にする
     ・木漏れ日の行 … 木漏れ日も、前の行のどの空きレーンからも1レーン以内で取れる所に出す
     枝1本の行は、前の行のどこにいても、いまのレーンかとなりのレーンのどちらかが空いているので、そのままでよい
     （いちばん最初の行は、こうちゃんのスタート位置（まん中）を「前の行」として見る）

     前の行で空いていたどのレーンにいても、次の行をよけられて・木漏れ日も取れるので、
     木漏れ日を取りに行ったあとや、枝をよけた先で、つみにならない */
export function buildSecretPathSpawnQueue(): SecretPathSpawn[] {
  const queue: SecretPathSpawn[] = [];

  // 前の行で空いていたレーン（こうちゃんがいるかもしれない所）
  let previousOpenLanes: SecretPathLane[] = [1];

  for (let row = 0; row < secretPathRowCount; row++) {
    const at = secretPathFirstRowAt + row * secretPathRowInterval + (Math.random() * 2 - 1) * secretPathRowJitter;

    // 前の行のどの空きレーンからも、1レーン以内で行けるレーン（まん中は、いつでも入る）
    const reachableLanes = secretPathLanes.filter((lane) => previousOpenLanes.every((openLane) => Math.abs(openLane - lane) <= 1));
    const branchLanes: SecretPathLane[] = [];

    if (secretPathSunlightRows.includes(row)) {
      const sunlightLane = pickRandomSecretPathLane(reachableLanes);

      queue.push({ at, kind: 'sunlight', lane: sunlightLane });

      // たいていは、木漏れ日とはべつのレーンに枝もいっしょに出す（取りに行くとき、よける必要が出てくる）
      if (Math.random() < secretPathSunlightBranchChance) {
        branchLanes.push(pickRandomSecretPathLane(secretPathLanes.filter((lane) => lane !== sunlightLane)));
      }
    } else if (Math.random() < secretPathDoubleBranchChance) {
      // ときどき枝を2本にして、空いているレーンを1つだけにする（3本にはしない）
      const openLane = pickRandomSecretPathLane(reachableLanes);

      branchLanes.push(...secretPathLanes.filter((lane) => lane !== openLane));
    } else {
      // ふつうの行は枝を1本
      branchLanes.push(pickRandomSecretPathLane());
    }

    for (const lane of branchLanes) {
      queue.push({ at, kind: 'branch', lane });
    }

    previousOpenLanes = secretPathLanes.filter((lane) => !branchLanes.includes(lane));
  }

  return queue.sort((a, b) => a.at - b.at);
}
