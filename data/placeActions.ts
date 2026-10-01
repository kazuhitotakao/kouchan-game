/* ============================================================
   場所での行動（6か所 × 2コマンド）のデータ

   ここにあるのは「その行動で、何がどれだけ変わるか」と「結果の文章」だけ
   実際に動かすのは pages/index.vue の runPlaceAction()
   （ステータスを増減する順番・アイテム抽選・行動後の共通処理は、ぜんぶあちら）

   ■ 親の2つのステータスは、減る理由をわけてある
     ・親の体力 … 体をどれだけ使ったか（走る・だっこする・立ちっぱなし）
     ・親の余裕 … どれだけヒヤッとしたか（水辺・高い所・見失いそう）

     そのため、同じ「よく遊ぶ」コマンドでも場所によって中身がちがう
     ・池を近くで見る         … 体力 -13 ／ 余裕 -14（水があるので、いちばん気が張る）
     ・芝生広場で追いかけっこ … 体力 -15 ／ 余裕  -8（親もいっしょに走るので、体をいちばん使う）
     ・どんぐりを拾う         … 体力 -10 ／ 余裕  -3（しゃがんで拾うだけなので穏やか）

     こうすると
     「体力は残っているけれど、余裕がないから池はやめておこう」
     「余裕はあるから、静かなどんぐりの木で点をかせごう」
     のように、2つの数字を見くらべて場所を選べるようになる

   ■ 並びは、公園入口で場所が出てくる順 × 各場所のコマンド順（① → ②）
     数字や文章を直すときは、その場所のところだけを見ればよい

   ■ おでかけポイント（outingPoint）だけは、ここの数がそのまま入るとはかぎらない
     2回目以降に同じ場所で遊んだときは、pages/index.vue の addOutingPoint() が減らす
   ============================================================ */

import type { ItemPlace } from '~/types/game';

/* 1つぶんの行動データ

   place                … どの場所の行動か（おでかけポイント・アイテム・探検済みの判定に使う）
   childEnergy 〜 parentCalm … そのまま足す増減（マイナスは減る）
   minutes              … かかる時間（分）
   message              … 結果カードに出す文章（完成形をそのまま持つ） */
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
    message: 'こうちゃんと一緒にすべりました。大喜びです！',
  },

  /* ② 下で見守る

     「いっしょにすべる」より軽い行動だが、親の余裕はあまり節約できない
     こうちゃんが手の届かない高い所へひとりでのぼっていくので、
     すぐそばで支えられる①よりも、かえって気が張る
     （ころんだときの「見守る」も同じ考えで、親の余裕がいちばん減る）

     そのぶん、親の体力と時間は①よりはっきり少なくすんでいる */
  watchSlide: {
    place: 'slide',
    childEnergy: -12,
    childMood: 3,
    outingPoint: 5,
    parentEnergy: -8,
    parentCalm: -9,
    minutes: 15,
    message: '「みててー！」てっぺんで手をふる姿に、下でハラハラ。',
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
    message: '一緒に大きな山を作りました。こうちゃんは夢中です！',
  },

  /* ② 砂のトンネルを作る

     山づくり（①）より軽いけれど、親子でいっしょに手を動かす「遊び」
     休むための行動ではないので、親の体力もきちんと減る
     （休みたいときは、別枠の「ひとやすみ」を使う） */
  buildSandTunnel: {
    place: 'sandbox',
    childEnergy: -8,
    childMood: 4,
    outingPoint: 4,
    parentEnergy: -7,
    parentCalm: -2,
    minutes: 15,
    message: '「みえたー！」トンネルの向こうで、手と手がタッチ。',
  },

  /* ===== どんぐりの木 ===== */

  /* ① 一緒にどんぐりを拾う */
  collectAcorns: {
    place: 'acornArea',
    childEnergy: -11,
    childMood: 6,
    outingPoint: 8,
    parentEnergy: -10,
    parentCalm: -3,
    minutes: 20,
    message: 'こうちゃんは夢中でどんぐりを拾っています！',
  },

  /* ② どんぐりをころがして遊ぶ

     前はここに「木かげで少し休む」があったが、
     休む行動は別枠の「ひとやすみ」にまとめたので、
     この場所ならではの遊びに置きかえている */
  rollAcorns: {
    place: 'acornArea',
    childEnergy: -7,
    childMood: 4,
    outingPoint: 5,
    parentEnergy: -5,
    parentCalm: -2,
    minutes: 15,
    message: '「まてまてー！」ころがるどんぐりを何度も追いかけています。',
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
    message: '白鳥を近くで見ました。こうちゃんは大興奮です！',
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
    message: '「おさかな いっぱい！」コイがバシャンと集まってきました。',
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
    message: '「きゃははっ！」芝生の上を、笑いながら走り回っています。',
  },

  /* ② シャボン玉で遊ぶ

     軽い行動（②）の中では、いちばん機嫌が上がる遊び
     走り回らないので体力はあまり減らないが、
     ふわふわ飛ぶシャボン玉はこうちゃんのお気に入りなので、
     「体力が残っていないけれど機嫌を上げたい」ときの逃げ道になる */
  playWithBubbles: {
    place: 'grassArea',
    childEnergy: -9,
    childMood: 7,
    outingPoint: 6,
    parentEnergy: -6,
    parentCalm: -3,
    minutes: 20,
    message: '「ふわふわー！」飛んでいくシャボン玉を追いかけています。',
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
