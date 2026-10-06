/* ============================================================
   公園入口の地図で、矢印キー（↑ ↓ ← →）を押したときの移動先

   ボタンを地図の上にバラバラに置いているので、「1つ前・1つ次」ではなく、
   「いまいる場所から見て、押した向きにある場所」へ動かす

   ■ 地図のならび（下が公園入口、上が公園の奥）

     [どんぐりの木]            [秘密の小道]
                  [芝生広場]
     [砂場]                         [池]
     [きゅうけい]               [すべり台]
                  [おうちへ帰る]

     ・← → … 同じ高さ（または いちばん近い高さ）のとなりへ
     ・↑ ↓ … できるだけ同じ列の中で
     ・おうちへ帰る へは、芝生広場 の ↓・きゅうけい の →・すべり台 の ← から行く（きゅうけい・すべり台 の ↓ では行かない）
     ・おうちへ帰る の ↑ は 芝生広場 へ（きゅうけい・すべり台 へは ← → で戻る）
     ・秘密の小道 と どんぐりの木・芝生広場・池 は ↑ ↓ で行き来する（秘密の小道の ↓ は、来たほうへ戻る）

   ■ 書きかた
     場所ごとに、向き → 移動先の候補 を書く
     ・前から順に見て「いま地図に出ている場所」のうち最初のものへ動く（秘密の小道は見つけるまで出ないので、2番目も書く）
     ・向きを書いていないときは動かない（反対のはしへは回りこまない）
     ※ 地図の上の置き場所（park-map.css）を大きく変えたときは、こちらも合わせること
   ============================================================ */

import type { GameEvent } from '~/types/game';

/* 地図の上の場所（GameEvent の名前をそのまま使う。秘密の小道は secretSpot、きゅうけい は restArea）
   goal … おうちへ帰る（場所ではないので、ここだけの名前） */
export type ParkMapSpot = 'slide' | 'sandbox' | 'acornArea' | 'pond' | 'grassArea' | 'secretSpot' | 'restArea' | 'goal';

export type ParkMapDirection = 'up' | 'down' | 'left' | 'right';

/* はじめて公園入口に来たとき（または最後にいた場所が地図に無いとき）に、カーソルを合わせる場所
   まん中の芝生広場なら、どの場所へも1〜2回で行ける */
export const parkMapStartPlace: GameEvent = 'grassArea';

export const parkMapMoves: Record<ParkMapSpot, Partial<Record<ParkMapDirection, ParkMapSpot[]>>> = {
  /* 左上 */
  acornArea: {
    // 右どなりの芝生広場へ（秘密の小道へは ↑ で行く）
    right: ['grassArea'],
    // 秘密の小道へ（まだ出ていないときは動かない）
    up: ['secretSpot'],
    down: ['sandbox'],
  },

  /* 右上 */
  secretSpot: {
    left: ['acornArea'],
    // どんぐりの木・芝生広場・池 の ↑ で来るので、↓ で来たほうへ戻る（わからないときは 芝生広場 → parkMapReturnMoves）
    down: ['grassArea', 'acornArea', 'pond'],
  },

  /* まん中 */
  grassArea: {
    // 上（右上の奥）の秘密の小道へ。まだ出ていないときは、左上のどんぐりの木へ
    up: ['secretSpot', 'acornArea'],
    // ふだんは砂場へ（どんぐりの木から来たときだけ、来たほうへ戻る）
    left: ['sandbox', 'acornArea'],
    right: ['pond'],
    // すぐ下の おうちへ帰る へ
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
    // 右どなりの おうちへ帰る へ（すべり台へは、おうちへ帰る をはさんで行く）
    right: ['goal'],
    // ↓ には何も書かない（おうちへ帰る へは、となりどうしなので ← → で行く）
  },

  /* 右下 */
  slide: {
    up: ['pond'],
    // 左どなりの おうちへ帰る へ（きゅうけいへは、おうちへ帰る をはさんで行く）
    left: ['goal'],
    // ↓ には何も書かない（おうちへ帰る へは、となりどうしなので ← → で行く）
  },

  /* いちばん下のまん中（おうちへ帰る ＝ ゴール。門のすぐ上） */
  goal: {
    // すぐ上の芝生広場へ
    up: ['grassArea'],
    left: ['restArea'],
    right: ['slide'],
  },
};

/* 「来たほうへ戻る」向き
   ここに書いた場所・向きは、候補の中に「直前にいた場所」があれば、1つ目より先にそこへ戻る
   例）池 →↑→ 秘密の小道 →↓→ 池
   （直前にいた場所は useKeyboardControls.ts の moveEntranceOnMap() が覚える） */
export const parkMapReturnMoves: Partial<Record<ParkMapSpot, ParkMapDirection[]>> = {
  // 芝生広場の ← … どんぐりの木／砂場 のうち、来たほうへ戻る（どちらでもなければ 砂場）
  grassArea: ['left'],
  // 秘密の小道の ↓ … どんぐりの木／芝生広場／池 のうち、来たほうへ戻る（どれでもなければ 芝生広場）
  secretSpot: ['down'],
};

/* 公園入口の地図の絵（PC用は横長、スマホ用は 3:4。画面の幅が spMaxWidth 以下のときにスマホ用）
   pages/index.vue の <picture> と、先読み（utils/imagePreload.ts）の両方で、同じ幅で選ぶ */
export const parkMapImages = {
  pc: '/images/park/park-map.webp',
  sp: '/images/park/park-map-sp.webp',
  spMaxWidth: 700,
} as const;
