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

     ・← → … 同じ高さ（または いちばん近い高さ）のとなりへ動く
         どんぐりの木 ⇔ 芝生広場 ⇔ 池、砂場 ⇔ 芝生広場、きゅうけい ⇔ すべり台
         （芝生広場の ← は、ふだんは砂場。どんぐりの木から → で来たときだけ、どんぐりの木へ戻る → parkMapReturnMoves）
     ・↑ ↓ … できるだけ同じ列の中で動く
         どんぐりの木 ⇔ 砂場 ⇔ きゅうけい、池 ⇔ すべり台、芝生広場 ⇔ 秘密の小道
     ・おうちへ帰る（ゴール）へは、きゅうけい・すべり台 の ↓ からだけ行ける
       芝生広場の ↓ などから、まちがえてすぐ選ばないようにするため
       おうちへ帰る の ↑ は、来たほう（きゅうけい／すべり台）へ戻る（→ parkMapReturnMoves）

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
    // 右どなり（ほぼ同じ高さ）の芝生広場へ。芝生広場の ← で戻ってこられる
    // 秘密の小道の ← で来たときだけ、秘密の小道へ戻る（→ 下の parkMapReturnMoves）
    right: ['grassArea', 'secretSpot'],
    down: ['sandbox'],
  },

  /* 右上 */
  secretSpot: {
    left: ['acornArea'],
    // 芝生広場の ↑ で来るので、↓ で芝生広場へ戻る
    down: ['grassArea'],
  },

  /* まん中 */
  grassArea: {
    // 上（右上の奥）の秘密の小道へ。まだ出ていないときは、左上のどんぐりの木へ
    up: ['secretSpot', 'acornArea'],
    // ふだんは砂場へ
    // どんぐりの木・砂場 の → で来たときだけ、来たほうへ戻る（→ 下の parkMapReturnMoves）
    left: ['sandbox', 'acornArea'],
    right: ['pond'],
    // ↓ には何も書かない
    // （おうちへ帰る は、まちがえてすぐ選ばないよう、きゅうけい・すべり台 の ↓ からだけ行ける）
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
    // 同じ段の右はしの すべり台へ
    right: ['slide'],
    // すぐ下の段の おうちへ帰る へ
    down: ['goal'],
  },

  /* 右下 */
  slide: {
    up: ['pond'],
    // 同じ段の左はしの きゅうけいへ
    left: ['restArea'],
    // すぐ下の段の おうちへ帰る へ
    down: ['goal'],
  },

  /* いちばん下のまん中（おうちへ帰る ＝ ゴール。門のすぐ上） */
  goal: {
    // 来たほう（きゅうけい／すべり台）へ戻る（→ 下の parkMapReturnMoves）
    // どちらから来たかわからないときは、1つ目の きゅうけい へ
    up: ['restArea', 'slide'],
    left: ['restArea'],
    right: ['slide'],
  },
};

/* 「来たほうへ戻る」向き

   ここに書いた場所・向きは、候補の中に「直前にいた場所」があれば、1つ目の候補より先にそこへ戻る
   （直前にいた場所が候補に無いときは、ふつうどおり前から順に見る）
   例）すべり台 →↓→ おうちへ帰る →↑→ すべり台（きゅうけいから来たときは、きゅうけいへ戻る）
       どんぐりの木 →→→ 芝生広場 →←→ どんぐりの木（それ以外から来たときは、ふだんどおり砂場へ）

   「直前にいた場所」は、矢印キーで動くたびに覚えなおす（→ composables/useKeyboardControls.ts の moveEntranceOnMap()） */
export const parkMapReturnMoves: Partial<Record<ParkMapSpot, ParkMapDirection[]>> = {
  // どんぐりの木の → … ふだんは芝生広場。秘密の小道から ← で来たときだけ、秘密の小道へ戻る
  acornArea: ['right'],
  // 芝生広場の ← … どんぐりの木／砂場 のうち、来たほうへ戻る（どちらでもなければ 砂場）
  grassArea: ['left'],
  // おうちへ帰る の ↑ … きゅうけい／すべり台 のうち、来たほうへ戻る（どちらでもなければ きゅうけい）
  goal: ['up'],
};
