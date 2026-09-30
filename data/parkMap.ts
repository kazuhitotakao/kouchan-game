/* ============================================================
   公園入口の地図で、矢印キー（↑ ↓ ← →）を押したときの移動先

   公園入口は、行き先のボタンを地図の上にバラバラに置いている（→ assets/css/game/park-map.css）
   そのため、ほかの画面のように「1つ前・1つ次」ではなく、
   「いまいる場所から見て、押した向きにある場所」へ動かす

   ■ 地図のならび（下が公園入口、上が公園の奥）

     [どんぐりの木]            [秘密の小道]
                  [芝生広場]
     [砂場]                         [池]
     [きゅうけい]               [すべり台]
                  [おうちへ帰る]

     たての3つの列として考えている
       ・左の列   … どんぐりの木 → 砂場 → きゅうけい
       ・まん中   … 芝生広場 → おうちへ帰る
       ・右の列   … 秘密の小道 → 池 → すべり台
     ↑↓ は、できるだけ同じ列の中で動く
     ←→ は、同じ高さ（または いちばん近い高さ）のとなりへ動く
       砂場 → 芝生広場 → 池 のように、まん中の芝生広場をはさんで横に歩ける

   ■ 書きかた

     場所ごとに、向き（up / down / left / right）→ 移動先の候補 を書く
     ・候補は、前から順に見て「いま地図に出ている場所」のうち最初のものへ動く
       （秘密の小道は、見つけるまで地図に出ないので、2番目の候補を書いておく）
     ・向きを書いていない（または候補がどれも出ていない）ときは、動かない
       （はしで止まる。反対のはしへは回りこまない）

   ■ 移動先を変えたいとき

     この表の、その場所・その向きの候補だけを書きかえる
     地図の上の置き場所（CSS）を大きく変えたときは、こちらも見た目に合わせて書きかえること
   ============================================================ */

import type { GameEvent } from '~/types/game';

/* 地図の上の場所
   行き先は、公園入口から入る場所（GameEvent）の名前をそのまま使う
   ・秘密の小道（見つけたあとは こもれびの広場）… secretSpot
   ・きゅうけい（ひとやすみのベンチ）          … restArea
   ・おうちへ帰る（ゴールの「公園の出口へ向かう？」を開く）… goal（場所ではないので、ここだけの名前） */
export type ParkMapSpot = 'slide' | 'sandbox' | 'acornArea' | 'pond' | 'grassArea' | 'secretSpot' | 'restArea' | 'goal';

export type ParkMapDirection = 'up' | 'down' | 'left' | 'right';

/* 公園入口に来たとき、最初にカーソルを合わせる場所

   地図のまん中の芝生広場にしておくと、どの場所へも ↑ ↓ ← → の1〜2回で行ける
   ・ゲームを始めて、はじめて公園入口に来たとき
   ・公園入口へ戻ってきたが、最後にいた場所が地図に無いとき
   に使う（遊んだあとに戻ってきたときは、今までどおり最後にいた場所に合わせる → pages/index.vue の restoreEntranceCursor()） */
export const parkMapStartPlace: GameEvent = 'grassArea';

export const parkMapMoves: Record<ParkMapSpot, Partial<Record<ParkMapDirection, ParkMapSpot[]>>> = {
  /* 左上 */
  acornArea: {
    // 右の秘密の小道がまだ出ていないときは、右下の芝生広場へ
    right: ['secretSpot', 'grassArea'],
    down: ['sandbox'],
  },

  /* 右上 */
  secretSpot: {
    left: ['acornArea'],
    down: ['pond'],
  },

  /* まん中 */
  grassArea: {
    // 真上には何もないので、左上のどんぐりの木へ
    up: ['acornArea', 'secretSpot'],
    left: ['sandbox'],
    right: ['pond'],
    // 真下（まん中の列）の おうちへ帰る へ
    down: ['goal'],
  },

  /* 左の中ほど */
  sandbox: {
    up: ['acornArea'],
    right: ['grassArea'],
    down: ['restArea'],
  },

  /* 右の中ほど */
  pond: {
    // 秘密の小道がまだ出ていないときは、左上の芝生広場へ
    up: ['secretSpot', 'grassArea'],
    left: ['grassArea'],
    down: ['slide'],
  },

  /* 左下 */
  restArea: {
    up: ['sandbox'],
    right: ['slide'],
    down: ['goal'],
  },

  /* 右下 */
  slide: {
    up: ['pond'],
    left: ['restArea'],
    down: ['goal'],
  },

  /* いちばん下のまん中（おうちへ帰る ＝ ゴール） */
  goal: {
    up: ['grassArea'],
    left: ['restArea'],
    right: ['slide'],
  },
};
