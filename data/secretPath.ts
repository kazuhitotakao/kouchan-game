/* ============================================================
   秘密の小道（ミニゲーム）の設定（ゲーム中に変わらないデータ）

   遊んでいる最中に変わる値は useSecretPathGame.ts が持っている
   ============================================================ */

import type { SecretPathItemKind, SecretPathLane } from '~/types/game';

export const secretPathLanes: SecretPathLane[] = [0, 1, 2];

/* 枝・こもれびの絵（うしろが透明。文の中で「枝」「こもれび」を指すところも、この絵を出す → SecretPathIcon.vue）
   ※ 透明な余白の切り落としかたは SecretPathIcon.vue で絵ごとに決めているので、絵の形が大きく変わるときは そちらも合わせる */
export const secretPathItemImages: Record<SecretPathItemKind, string> = {
  branch: '/images/minigames/secret-path/branch.webp',
  sunlight: '/images/minigames/secret-path/komorebi-light.webp',
};

/* こうちゃんの絵（normal … ふだん、hurt … 枝に当たった直後、get … こもれびを取った直後）
   絵は見た目だけで、当たり判定には関係しない（hurt・get は手足を広げた絵だが、判定は大きくならない） */
export const secretPathPlayerImages = {
  normal: '/images/minigames/secret-path/player-normal.webp',
  hurt: '/images/minigames/secret-path/player-hurt.webp',
  get: '/images/minigames/secret-path/player-get.webp',
} as const;

/* こうちゃんの見た目の種類（上の secretPathPlayerImages の名前） */
export type SecretPathPlayerVisual = keyof typeof secretPathPlayerImages;

/* ミニゲームの長さ（ミリ秒）。15000 で15秒 */
export const secretPathDuration = 15000;

/* はじまる前のカウントダウン（「3」「2」「1」）の長さ（ミリ秒。ひとつ1秒）
   すぐ枝が流れてくると、こうちゃんの位置をたしかめる間もないため
   このあいだは何も出てこず、時間も減らないが、左右の移動だけはできる（動かしかたをたしかめられる） */
export const secretPathCountdownDuration = 3000;

/* 押してから、カウントダウンの「3」を出すまでの間（ミリ秒）
   決定音「ポン♪」と「3」の「ピッ」が続けて鳴って、1つの音のように聞こえないようにする */
export const secretPathCountdownLeadIn = 500;

/* カウントダウンのあと「スタート！」を出しておく長さ（ミリ秒）
   このあいだは、もうゲームは動いている（最初の行が こうちゃんの所へ来るより前に消える） */
export const secretPathStartCueDuration = 600;

/* 1プレイで流れてくるこもれびの数（「［こもれびの絵］こもれび 3 / 5」の 5）
   下の secretPathSunlightRows の数とそろえること */
export const secretPathSunlightTotal = 5;

/* 流れてくる速さ（1秒で、フィールドの高さの何%進むか。70 なら、こうちゃんの所まで 約1.3秒） */
export const secretPathSpeed = 70;

/* こうちゃんの位置（フィールドの上から何%か） */
export const secretPathPlayerY = 84;

/* 出てくる位置と、片づける位置（どちらもフィールドの外） */
export const secretPathSpawnY = -8;
export const secretPathRemoveY = 110;

/* 流れてくる「行」の予定（600ミリ秒後から、700ミリ秒ごとに18行）
   ※ 変えるときは「最後の行の時間 ＋ 届くまでの約1.3秒」が15秒を超えないようにする

   ・ふつうの行 … 枝を1本（DoubleBranchChance の割合で2本）
   ・secretPathSunlightRows の行 … こもれびを1つ（SunlightBranchChance の割合で枝もいっしょ、
       さらに SunlightDoubleBranchChance の割合で、こもれびのレーンしか空いていない行にする）
   ・secretPathRowJitter … 行ごとに少し時間をずらして、同じリズムになりすぎないようにする
   よけられない並びは作らない（→ useSecretPath.ts の buildSecretPathSpawnQueue()） */
export const secretPathFirstRowAt = 600;
export const secretPathRowInterval = 700;
export const secretPathRowCount = 18;
export const secretPathRowJitter = 120;
export const secretPathSunlightRows = [2, 5, 9, 12, 15];
export const secretPathDoubleBranchChance = 0.5;
export const secretPathSunlightBranchChance = 0.85;
export const secretPathSunlightDoubleBranchChance = 0.4;

/* 枝に当たったときの「いたっ！」「-1」を出しておく長さ（ミリ秒。見た目だけで、動きは止めない） */
export const secretPathBumpEffectDuration = 600;

/* 道（レーン）をクリック・タップしたとき、押したレーンを光らせておく長さ（ミリ秒） */
export const secretPathTapFlashDuration = 200;

/* 「はやく進む」ときの速さ（ゲームの時計を何倍で進めるか）
   ※ 上げるときは、すり抜けないよう「50ミリ秒 × この倍率 × secretPathSpeed ÷ 1000」が10（%）より小さいままにする */
export const secretPathBoostMultiplier = 2;

/* フィールドを何ミリ秒押しつづけたら「長押し」（はやく進む）にするか
   押したしゅんかんに はやくならないように、少しだけ待つ */
export const secretPathHoldBoostDelay = 250;

/* 押したまま横へ何px動かしたら「動かした」とみなすか（小さな手ぶれで、タップや長押しが取り消されないように）
   ・マウス   … ドラッグと見分けるためだけに使うので、広め
   ・指・ペン … フリックの長さも兼ねる（広げると、軽くはらっただけでは動かなくなる）
*/
export const secretPathMouseSwipeThreshold = 100;
export const secretPathTouchSwipeThreshold = 32;

/* こもれびを取ったときの「［こもれびの絵］+1」と光を出しておく長さ（ミリ秒） */
export const secretPathSparkleDuration = 600;

/* 結果が出てから「先へ進む」を受けつけるまでの待ち時間（ミリ秒）
   終わったしゅんかんに押していた指やキーで、結果を読む前に進んでしまわないように */
export const secretPathLeaveGuard = 600;

/* こもれびボーナス（おでかけポイント。4〜5個 … +3、2〜3個 … +1、0〜1個 … なし） */
export const secretPathBonusGreatPoint = 3;
export const secretPathBonusGoodPoint = 1;
