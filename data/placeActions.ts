/* ============================================================
   場所での行動（6か所 × 2コマンド）のデータ

   「何がどれだけ変わるか」と「結果の文章」だけ（動かすのは pages/index.vue の runPlaceAction()）

   ■ 親の2つのステータスは、減る理由をわけてある
     ・親の体力 … 体をどれだけ使ったか（走る・だっこする・立ちっぱなし）
     ・親の余裕 … どれだけヒヤッとしたか（水辺・高い所・見失いそう）
     「余裕がないから池はやめておこう」のように、2つを見くらべて場所を選べるようにするため

   ■ おでかけポイントは、2回目以降の場所では addOutingPoint() が減らす
   ============================================================ */

import type { ItemPlace } from '~/types/game';

/* 1つぶんの行動データ（childEnergy 〜 parentCalm はそのまま足す増減、minutes はかかる時間） */
export type PlaceActionDefinition = {
  place: ItemPlace;
  childEnergy: number;
  childMood: number;
  outingPoint: number;
  parentEnergy: number;
  parentCalm: number;
  minutes: number;
  message: string;
};

export const placeActions = {
  /* ===== すべり台 ===== */

  /* ① 一緒にすべる */
  playSlide: {
    place: 'slide',
    childEnergy: -18,
    childMood: 6,
    outingPoint: 6,
    parentEnergy: -14,
    parentCalm: -9,
    minutes: 25,
    message: 'こうちゃんを膝に乗せ、一緒にすべりました。大はしゃぎです！',
  },

  /* ② 下で見守る
     軽い行動だが、手の届かない高い所へひとりでのぼっていくので、親の余裕は①と同じだけ減る
     そのぶん、親の体力と時間は①より少なくすむ */
  watchSlide: {
    place: 'slide',
    childEnergy: -12,
    childMood: 3,
    outingPoint: 5,
    parentEnergy: -8,
    parentCalm: -9,
    minutes: 15,
    message: 'てっぺんに立って手をふる姿に、親はハラハラ。',
  },

  /* ===== 砂場 ===== */

  /* ① 一緒に大きな山を作る */
  playSandbox: {
    place: 'sandbox',
    childEnergy: -13,
    childMood: 5,
    outingPoint: 6,
    parentEnergy: -12,
    parentCalm: -4,
    minutes: 25,
    message: '「すごっ！おっきい！」できあがった砂のお山を見て、こうちゃんは大喜び！',
  },

  /* ② 砂のケーキ屋さんごっこ（軽いが休む行動ではないので、親の体力もきちんと減る） */
  playSandCakeShop: {
    place: 'sandbox',
    childEnergy: -8,
    childMood: 4,
    outingPoint: 4,
    parentEnergy: -7,
    parentCalm: -2,
    minutes: 15,
    message: '「いらっしゃいませー！」砂で作ったケーキを、たくさん並べています。',
  },

  /* ===== どんぐりの木 ===== */

  /* ① どんぐりを拾う */
  collectAcorns: {
    place: 'acornArea',
    childEnergy: -11,
    childMood: 6,
    outingPoint: 8,
    parentEnergy: -10,
    parentCalm: -3,
    minutes: 20,
    message: '「こっちにもある！あ、あっちも！」次々とどんぐりを見つけて、こうちゃんは大忙し！',
  },

  /* ② 木のかげに隠れる */
  hideBehindTree: {
    place: 'acornArea',
    childEnergy: -7,
    childMood: 4,
    outingPoint: 5,
    parentEnergy: -5,
    parentCalm: -2,
    minutes: 15,
    message: '「……ばあ！」木の後ろから、ひょっこり顔を出しました。',
  },

  /* ===== 池 ===== */

  /* ① 白鳥を近くで見る */
  watchSwansClose: {
    place: 'pond',
    childEnergy: -11,
    childMood: 8,
    outingPoint: 9,
    parentEnergy: -13,
    parentCalm: -14,
    minutes: 20,
    message: '「おっきい！」近くで見る白鳥の大きさに、こうちゃんは目をまんまるにしています。',
  },

  /* ② コイに餌をあげる */
  feedKoi: {
    place: 'pond',
    childEnergy: -8,
    childMood: 6,
    outingPoint: 7,
    parentEnergy: -5,
    parentCalm: -4,
    minutes: 15,
    message: '「おさかなー！」エサをあげると、コイたちがバシャバシャと集まってきました。',
  },

  /* ===== 芝生広場 ===== */

  /* ① 追いかけっこする */
  playTagOnGrass: {
    place: 'grassArea',
    childEnergy: -19,
    childMood: 8,
    outingPoint: 10,
    parentEnergy: -15,
    parentCalm: -8,
    minutes: 25,
    message: '「まてまてまてーー！」追いかけたり、追いかけられたり。芝生広場に楽しそうな笑い声が響きます。',
  },

  /* ② シャボン玉で遊ぶ
     軽い行動の中では、いちばん機嫌が上がる（「体力は無いけれど機嫌を上げたい」ときの逃げ道） */
  playWithBubbles: {
    place: 'grassArea',
    childEnergy: -9,
    childMood: 7,
    outingPoint: 6,
    parentEnergy: -6,
    parentCalm: -3,
    minutes: 20,
    message: '「つかまえたい！」こうちゃんは両手を伸ばして、シャボン玉を追いかけています。',
  },

  /* ===== こもれびの広場 ===== */

  /* ① 落ち葉の上を歩く（落ち葉の音で遊ぶ。たくさん歩くので、②より体力も時間も使う） */
  walkOnLeaves: {
    place: 'secretSpot',
    childEnergy: -16,
    childMood: 10,
    outingPoint: 15,
    parentEnergy: -14,
    parentCalm: -4,
    minutes: 25,
    message: '「はっぱ、カサカサ！」わざと落ち葉の上を歩いて、音を楽しんでいます。',
  },

  /* ② こもれびをつかまえる（光で遊ぶ。手をのばすくらいの軽い遊び）

     ※ 文章で「枝を見つけた」と書かないこと
       アイテム（ふしぎな形の枝）が見つかるかどうかは抽選なので、
       文章のほうで先に見つけたことにしてしまうと、
       抽選にはずれた回に「枝を見つけました」→ でも「★ アイテム発見！」が出ない
       という食いちがいが起きてしまう
       見つけたことを伝えるのは、結果カードの「★ アイテム発見！」の役目
       （ほかの5か所の文章も、アイテムには触れずに遊びの様子だけを書いている） */
  catchSunlight: {
    place: 'secretSpot',
    childEnergy: -10,
    childMood: 5,
    outingPoint: 9,
    parentEnergy: -8,
    parentCalm: -4,
    minutes: 20,
    message: '「つかまえた！」手のひらにうつった光を、じっと見ています。',
  },
} satisfies Record<string, PlaceActionDefinition>;
