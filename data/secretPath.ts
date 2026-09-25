/* ============================================================
   秘密の小道（ミニゲーム）の設定（ゲーム中に変わらないデータ）

   ここにあるのは「どんな速さ・長さで遊ぶか」「何がいくつ流れてくるか」だけで、
   「いまどのレーンにいるか」（secretPathPlayerLane）などの遊んでいる最中の値は
   プレイ中に変わるので composables/useSecretPathGame.ts のほうが持っている
   ============================================================ */

import type { SecretPathLane } from '~/types/game';

export const secretPathLanes: SecretPathLane[] = [0, 1, 2];

/* ミニゲームの長さ（ミリ秒）。15000 で15秒 */
export const secretPathDuration = 15000;

/* はじまる前のカウントダウン（「3」「2」「1」）の長さ（ミリ秒）

   「小道へ進む」を押して遊ぶ画面に切りかわってから、少しの間（secretPathCountdownLeadIn）と、この長さだけ待ってから始める
   （画面が切りかわってすぐ枝が流れてくると、こうちゃんの位置をたしかめる間もないため）
   ・3つの数字を同じ長さずつ出す（3000 なら、ひとつ1秒。2000・約0.67秒ずつでは速く感じたので、ゆっくりにした）
   ・このあいだは枝も木漏れ日も出てこない。残り時間も減らない。はやく進むのも効かない
   ・左右の移動だけはできる（始める前に、動かしかたをたしかめられる） */
export const secretPathCountdownDuration = 3000;

/* 「小道へ進む」「はじめる」を押してから、カウントダウンの「3」を出すまでの間（ミリ秒）

   押したときの決定音「ポン♪」と、「3」の「ピッ」が続けて鳴って、1つの音のように聞こえないようにする
   ・このあいだは、まだ数字を出さない（「3」の数字と音は、この間のあとに いっしょに出る）
   ・3・2・1 の間隔は、今までどおり secretPathCountdownDuration を3つに分けた長さのまま
   ・枝も木漏れ日も出てこない、はやく進むのも効かない、左右の移動だけはできる（カウントダウンと同じ）
   ※ 前は、この間を作らずに「3」の音だけを0.12秒うしろへずらしていた
     決定音（0.09秒）のすぐあとに鳴るので、ほとんど重なって聞こえていた */
export const secretPathCountdownLeadIn = 500;

/* カウントダウンのあと「スタート！」を出しておく長さ（ミリ秒）
   このあいだは、もうゲームは動いている（最初の行が こうちゃんの所へ来るより前に消える） */
export const secretPathStartCueDuration = 600;

/* 1プレイで流れてくる木漏れ日の数（「✨ 木漏れ日 3 / 5」の 5）
   下の secretPathSunlightRows の数とそろえること */
export const secretPathSunlightTotal = 5;

/* 流れてくる速さ（1秒で、フィールドの高さの何%進むか）
   70 なら、出てきてから こうちゃんの所まで 約1.3秒
   （40・約2.3秒 → 48・約1.9秒 → 60・約1.5秒 → 70 と、テンポと難しさを上げてきた） */
export const secretPathSpeed = 70;

/* こうちゃんの位置（フィールドの上から何%か） */
export const secretPathPlayerY = 84;

/* 出てくる位置と、片づける位置（どちらもフィールドの外） */
export const secretPathSpawnY = -8;
export const secretPathRemoveY = 110;

/* 流れてくる「行」の予定

   600ミリ秒後から、700ミリ秒ごとに18行
   いちばん最後の行（約12.6秒）でも、15秒になる前に こうちゃんの所まで届いて、通りすぎる
   （行の数や間隔・速さを変えるときは「最後の行の時間 ＋ 届くまでの約1.3秒」が15秒を超えないようにする）

   ・ふつうの行 … 枝を1本。secretPathDoubleBranchChance の割合で2本にして、空いているレーンを1つだけにする
   ・secretPathSunlightRows の行 … 木漏れ日を1つ。secretPathSunlightBranchChance の割合で、べつのレーンに枝もいっしょ
       枝が出るときは、さらに secretPathSunlightDoubleBranchChance の割合で枝を2本にして、
       木漏れ日のレーンしか空いていない行にする（取りそこねると、枝に当たる）
   ・secretPathRowJitter … 行ごとに少しだけ時間をずらして、同じリズムになりすぎないようにする

   どの行も、少なくとも1つのレーンは空いている（3本とも枝の行は作らない）ので、よけられない形にはならない
   前の行とのつながりも見て、行と行のあいだに2レーン動かないと よけられない・取れない並びも作らない
   （くわしくは composables/useSecretPath.ts の buildSecretPathSpawnQueue()） */
export const secretPathFirstRowAt = 600;
export const secretPathRowInterval = 700;
export const secretPathRowCount = 18;
export const secretPathRowJitter = 120;
export const secretPathSunlightRows = [2, 5, 9, 12, 15];
export const secretPathDoubleBranchChance = 0.5;
export const secretPathSunlightBranchChance = 0.85;
export const secretPathSunlightDoubleBranchChance = 0.4;

/* 枝に当たったときの「いたっ！」「✨ -1」を出しておく長さ（ミリ秒）

   見た目だけの長さで、このあいだも左右にはふつうに動ける
   （枝のペナルティは「木漏れ日 -1」だけにして、動きは止めない） */
export const secretPathBumpEffectDuration = 600;

/* 道（レーン）をクリック・タップしたとき、押したレーンを光らせておく長さ（ミリ秒） */
export const secretPathTapFlashDuration = 200;

/* 「はやく進む」ときの速さ（ゲームの時計を何倍で進めるか）
   ずっと押しっぱなしなら、15秒ぶんが実際には約7.5秒で終わる
   （早く着けるかわりに、枝や木漏れ日へ反応できる時間も短くなる）
   ※ 1コマで進む量が当たり判定の幅をこえないよう、上げるときは
     「50ミリ秒 × この倍率 × secretPathSpeed ÷ 1000」が10（%）より小さいままにする */
export const secretPathBoostMultiplier = 2;

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
                  （32 → 70 → 100。70でもまだ、少しのドラッグで動きすぎると感じたので、さらに広げた
                    100px は、パソコンでのフィールド（幅460px）の1レーンぶん（約150px）の3分の2くらい）
     ・指・ペン … 1回はらうあいだに1レーンだけ（何度も動くことはない）
                  こちらは広げる必要がないので、今までの数字のまま
                  （広げると、軽くはらっただけでは動かなくなってしまう）

   ※ どちらも「こえるたびに1レーン」は同じ
     ちがうのは、1回の操作で何レーンぶん動けるか（→ swipeSecretPathPlayer）
*/
export const secretPathMouseSwipeThreshold = 100;
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
