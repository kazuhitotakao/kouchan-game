/* ============================================================
   秘密の小道（ミニゲーム）の設定（ゲーム中に変わらないデータ）

   ここにあるのは「どんな速さ・長さで遊ぶか」「何がいくつ流れてくるか」だけで、
   「いまどのレーンにいるか」（secretPathPlayerLane）などの遊んでいる最中の値は
   プレイ中に変わるので pages/index.vue の ref のほうに残してある
   ============================================================ */

import type { SecretPathLane } from '~/types/game';

export const secretPathLanes: SecretPathLane[] = [0, 1, 2];

/* ミニゲームの長さ（ミリ秒）。15000 で15秒 */
export const secretPathDuration = 15000;

/* 1プレイで流れてくる木漏れ日の数（「✨ 木漏れ日 3 / 5」の 5）
   下の secretPathSunlightRows の数とそろえること */
export const secretPathSunlightTotal = 5;

/* 流れてくる速さ（1秒で、フィールドの高さの何%進むか）
   60 なら、出てきてから こうちゃんの所まで 約1.5秒
   （40・約2.3秒 → 48・約1.9秒 → 60 と、テンポと難しさを上げてきた） */
export const secretPathSpeed = 60;

/* こうちゃんの位置（フィールドの上から何%か） */
export const secretPathPlayerY = 84;

/* 出てくる位置と、片づける位置（どちらもフィールドの外） */
export const secretPathSpawnY = -8;
export const secretPathRemoveY = 110;

/* 流れてくる「行」の予定

   600ミリ秒後から、800ミリ秒ごとに16行
   いちばん最後の行（約12.6秒）でも、15秒になる前に こうちゃんの所まで届く
   （行の数や間隔を変えるときは「最後の行の時間 ＋ 届くまでの約1.5秒」が15秒を超えないようにする）

   ・ふつうの行 … 枝を1本。secretPathDoubleBranchChance の割合で2本にして、空いているレーンを1つだけにする
   ・secretPathSunlightRows の行 … 木漏れ日を1つ。secretPathSunlightBranchChance の割合で、べつのレーンに枝もいっしょ
   ・secretPathRowJitter … 行ごとに少しだけ時間をずらして、同じリズムになりすぎないようにする

   どの行も、少なくとも1つのレーンは空いている（3本とも枝の行は作らない）ので、よけられない形にはならない */
export const secretPathFirstRowAt = 600;
export const secretPathRowInterval = 800;
export const secretPathRowCount = 16;
export const secretPathRowJitter = 120;
export const secretPathSunlightRows = [1, 4, 7, 10, 13];
export const secretPathDoubleBranchChance = 0.35;
export const secretPathSunlightBranchChance = 0.7;

/* 枝に当たったときの「いたっ！」「✨ -1」を出しておく長さ（ミリ秒）

   見た目だけの長さで、このあいだも左右にはふつうに動ける
   （枝のペナルティは「木漏れ日 -1」だけにして、動きは止めない） */
export const secretPathBumpEffectDuration = 600;

/* 道（レーン）をクリック・タップしたとき、押したレーンを光らせておく長さ（ミリ秒） */
export const secretPathTapFlashDuration = 200;

/* 「はやく進む」ときの速さ（ゲームの時計を何倍で進めるか）
   ずっと押しっぱなしなら、15秒ぶんが実際には約10秒で終わる
   （早く着けるかわりに、枝や木漏れ日へ反応できる時間も短くなる） */
export const secretPathBoostMultiplier = 1.5;

/* フィールドを何ミリ秒押しつづけたら「長押し」（はやく進む）にするか
   押したしゅんかんに はやくならないように、少しだけ待つ */
export const secretPathHoldBoostDelay = 250;

/* 押したまま横へ何px動かしたら、1レーン動かすか
   小さな手ぶれでは動かないようにするため

   ■ マウスと指で数字を分けている
     動かしかたがちがうので、同じ数字にすると操作感がそろわない

     ・マウス   … 押しっぱなしのまま、こえるたびに何レーンでも動ける
                  32pxだと少し大きくドラッグしただけで
                  左はし → まん中 → 右はし と2レーン進んでしまい、
                  行き先をねらいにくかったので、広めにしてある
     ・指・ペン … 1回はらうあいだに1レーンだけ（何度も動くことはない）
                  こちらは広げる必要がないので、今までの数字のまま
                  （広げると、軽くはらっただけでは動かなくなってしまう）

   ※ どちらも「こえるたびに1レーン」は同じ
     ちがうのは、1回の操作で何レーンぶん動けるか（→ swipeSecretPathPlayer）
*/
export const secretPathMouseSwipeThreshold = 70;
export const secretPathTouchSwipeThreshold = 32;

/* 木漏れ日を取ったときの「✨ +1」と光を出しておく長さ（ミリ秒） */
export const secretPathSparkleDuration = 600;

/* 結果が出てから「先へ進む」を受けつけるまでの待ち時間（ミリ秒）

   時間切れのしゅんかんに道をタップしていた指や、押していたキーで、
   結果を読む前に先へ進んでしまわないようにする */
export const secretPathLeaveGuard = 600;

/* 木漏れ日ボーナス（おでかけポイント）

   結果の文章と同じ3段階で、たくさん集めたときだけ少しだけ足す
   ・4〜5個 … +3（いやいやの「ナイス対応」と同じくらい）
   ・2〜3個 … +1
   ・0〜1個 … なし
   量を変えたくなったら、ここの2つだけを書きかえればよい */
export const secretPathBonusGreatPoint = 3;
export const secretPathBonusGoodPoint = 1;
