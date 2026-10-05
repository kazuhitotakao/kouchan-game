/* ============================================================
   ミニゲーム「とばないで！」（/minigame/ladybug-balance）の設定（ゲーム中に変わらないデータ）

   ■ 遊びかた
     てんとう虫は枝の上を、勝手に左右へ歩く
     本物のてんとう虫と同じく、高いほうへ のぼっていき、てっぺん（枝の先）から飛び立とうとする
     左右のボタンで枝を傾けると、てんとう虫は高いほうへ向きを変えて のぼる
     → てんとう虫が近づいた側を下げると、引き返してくる（下げすぎると、反対のはしまで のぼっていく）
     てんとう虫が枝のはしまで行くと、羽を開いて飛んでいってしまう（おしまい。幼虫は飛べないので、落ちてしまう）
     時間（seconds）まで飛ばさずにいられたらクリア

   ■ 長さ・速さの単位
     いちばん長い枝の「まん中から はしまで」を 1 とする
     （branchLength 0.75 の枝は、まん中から 0.75 進むと はしに着く）

   ■ ステージを増やすときは、ladybugBalanceStages に1件たすだけでよい
     前のステージをクリアすると、次のステージが遊べるようになる
     ぜんぶクリアすると、エンドレス（ladybugBalanceEndless）が遊べるようになる
   ============================================================ */

/* ============================================================
   てんとう虫の種類（見た目と性格）

   name           … 画面に出す名前（はじまる前の説明・結果の画面）
   trait          … 性格のひとこと（はじまる前の説明）
   walk           … 歩く速さの倍率（ステージの walkSpeed にかける）
   climb          … 高いほうへ のぼる速さの倍率（ladybugBalanceMotion.climbSpeed にかける）
   quirkInterval  … 気まぐれな動きのあいだの時間の倍率（小さいほど、よく気まぐれを起こす）
   dashChance     … 枝が水平に近いときの気まぐれが、小走りになる割合（残りは「急に向きを変える」）
   canFly         … 飛べるか（幼虫は飛べないので、はしに着くと落ちる）
   ============================================================ */
export type LadybugBalanceKind = 'nanahoshi' | 'namitentou' | 'larva';

export type LadybugBalanceKindInfo = {
  name: string;
  trait: string;
  walk: number;
  climb: number;
  quirkInterval: number;
  dashChance: number;
  canFly: boolean;
};

export const ladybugBalanceKinds: Record<LadybugBalanceKind, LadybugBalanceKindInfo> = {
  // ナナホシテントウ（赤に黒い点。いちばん ふつう）
  nanahoshi: { name: 'ナナホシ', trait: 'ふつう', walk: 1, climb: 1, quirkInterval: 1, dashChance: 0.5, canFly: true },

  // ナミテントウ（黒に赤い紋。気まぐれで、小走りが多い）
  namitentou: { name: 'ナミテントウ', trait: 'きまぐれ・小走りが多い', walk: 1, climb: 1, quirkInterval: 0.6, dashChance: 0.75, canFly: true },

  // 幼虫（歩くのは遅いけれど、のぼるのが得意。飛べない）
  larva: { name: 'ようちゅう', trait: 'おそいけど のぼるのが得意', walk: 0.7, climb: 1.4, quirkInterval: 1, dashChance: 0.5, canFly: false },
};

/* ============================================================
   遊びかたのきまり（ステージ1つぶん・エンドレスのレベル1つぶん）

   ladybugs         … 出てくるてんとう虫の種類（1匹か2匹。2匹のときは左右に分けて置く）
   walkSpeed        … てんとう虫が自分で歩く速さ（1秒に進む長さ。上の単位。種類の walk をかける）
   turnInterval     … 向きを変えるまでの時間（ミリ秒。[いちばん短い, いちばん長い] のあいだで、毎回ばらばらに決める）
   branchLength     … 枝の長さ（まん中から はしまで。1 ＝ いちばん長い枝）
   wind             … 風（吹かないときは null）
     strength … 風が枝を傾ける強さ（ボタンの強さ ladybugBalanceTilt.pushAccel とくらべる数字）
     interval … 風がやんでから、次に吹くまでの時間（ミリ秒。[短い, 長い]）
     duration … 1回の風が吹いている時間（ミリ秒）
   quirks           … ときどきする気まぐれな動き（しないときは null）
     interval       … 気まぐれな動きのあいだの時間（ミリ秒。[短い, 長い]。種類の quirkInterval をかける）
     dashMultiplier … 小走りのとき、歩く速さの何倍になるか
     dashDuration   … 小走りを続ける時間（ミリ秒）
     どちらの動きをするかは、そのときに決める
     ・急に向きを変える … 枝が水平に近いときだけ（しっかり傾いているときは、高いほうを向いたままなので）
     ・小走り          … 走りだす前に「！」を出して、少しうずうずしてから走る（ladybugBalanceTiming.dashWindup）
   ============================================================ */
export type LadybugBalanceRule = {
  ladybugs: readonly [LadybugBalanceKind] | readonly [LadybugBalanceKind, LadybugBalanceKind];
  walkSpeed: number;
  turnInterval: readonly [number, number];
  branchLength: number;
  wind: {
    strength: number;
    interval: readonly [number, number];
    duration: number;
  } | null;
  quirks: {
    interval: readonly [number, number];
    dashMultiplier: number;
    dashDuration: number;
  } | null;
};

/* ステージ1つぶん（きまり ＋ 何秒たえればクリアか ＋ クリアしたときの ひとこと）
   clearComment … 結果の画面に出す ひとこと（そのステージで気をつけたこと ── 風・2匹・幼虫など ── にふれる。さいごのステージは、ぜんぶクリアのお祝い） */
export type LadybugBalanceStage = LadybugBalanceRule & {
  seconds: number;
  clearComment: string;
};

/* ステージの一覧（上から ステージ1, 2, …）
   枝が水平なら、てんとう虫は向きをあまり変えずに歩き続ける（turnInterval を長めにしている）
   ほうっておくと はしまで行ってしまうので、ずっと見ていないといけない */
export const ladybugBalanceStages: readonly LadybugBalanceStage[] = [
  // ステージ1：長い枝（遊びかたを覚える）
  {
    ladybugs: ['nanahoshi'],
    walkSpeed: 0.3,
    turnInterval: [2500, 4500],
    branchLength: 1,
    seconds: 6,
    clearComment: 'じょうずに 枝を かたむけられたよ！',
    wind: null,
    quirks: null,
  },

  // ステージ2：速く歩く。ここから、ときどき急に向きを変えたり、小走りしたりする
  {
    ladybugs: ['nanahoshi'],
    walkSpeed: 0.38,
    turnInterval: [3000, 5000],
    branchLength: 1,
    seconds: 8,
    clearComment: '小走りしても だいじょうぶ！ しっかり ついていけたよ！',
    wind: null,
    quirks: { interval: [1800, 3400], dashMultiplier: 2.2, dashDuration: 800 },
  },

  // ステージ3：枝が短い ＋ はじめてのナミテントウ（気まぐれ）
  {
    ladybugs: ['namitentou'],
    walkSpeed: 0.35,
    turnInterval: [3000, 5000],
    branchLength: 0.75,
    seconds: 8,
    clearComment: 'きまぐれな ナミテントウにも ついていけたよ！ すごい！',
    wind: null,
    quirks: { interval: [2200, 4000], dashMultiplier: 2.2, dashDuration: 800 },
  },

  // ステージ4：ときどき強い風が吹く（押さえていないと枝が大きく傾き、てんとう虫が高いほうへ のぼっていく）
  {
    ladybugs: ['nanahoshi'],
    walkSpeed: 0.38,
    turnInterval: [3000, 5000],
    branchLength: 0.75,
    seconds: 9,
    clearComment: '強い風にも びっくりしなかったよ！ じょうず！',
    wind: { strength: 60, interval: [1800, 3400], duration: 1500 },
    // 風と重なると きびしすぎるので、気まぐれな動きは ほかのステージより少なめ
    quirks: { interval: [3000, 5000], dashMultiplier: 2.2, dashDuration: 800 },
  },

  /* ステージ5：てんとう虫が2匹
     傾けると2匹とも同じ向き（高いほう）へ のぼるので、2匹が左右のはしへ離れていくときは、両方は戻せない
     そこで歩く速さはひかえめにし、枝も長くして、向きを変えるまで はしに着きにくくしている */
  {
    ladybugs: ['nanahoshi', 'nanahoshi'],
    walkSpeed: 0.26,
    turnInterval: [2000, 3600],
    branchLength: 1,
    seconds: 12,
    clearComment: '2匹いっしょでも だいじょうぶ！ やった！',
    wind: null,
    quirks: { interval: [2400, 4200], dashMultiplier: 2, dashDuration: 700 },
  },

  /* ステージ6：ナナホシ ＋ はじめての幼虫 ＋ そよ風
     幼虫は のぼるのが速いので、傾けると2匹の速さがずれる（2匹のあいだが開いたり、つまったりする） */
  {
    ladybugs: ['nanahoshi', 'larva'],
    walkSpeed: 0.25,
    turnInterval: [2000, 3600],
    branchLength: 1,
    seconds: 12,
    clearComment: 'ナナホシも ようちゅうも さいごまで いっしょ！ ばっちり！',
    wind: { strength: 45, interval: [2400, 4000], duration: 1200 },
    quirks: { interval: [2600, 4400], dashMultiplier: 2, dashDuration: 700 },
  },

  /* ステージ7：とても速いナミテントウ（気まぐれな動きも多め）
     枝をこれ以上短くすると、のぼる速さに対して逃げる余地が足りず、上手に操作しても ほとんどクリアできなかったので、
     枝ではなく速さで きびしくしている */
  {
    ladybugs: ['namitentou'],
    walkSpeed: 0.42,
    turnInterval: [3000, 5000],
    branchLength: 0.85,
    seconds: 11,
    clearComment: 'すばやい ナミテントウにも ついていけたよ！ すごい！',
    wind: null,
    quirks: { interval: [2000, 3600], dashMultiplier: 2.2, dashDuration: 800 },
  },

  /* ステージ8：風 ＋ 幼虫（風で傾くと、幼虫は すばやく のぼっていく）
     幼虫は のぼるのが速いので、短い枝（0.75）だと 上手に操作しても ほとんどクリアできなかった。枝は少し長めにしてある */
  {
    ladybugs: ['larva'],
    walkSpeed: 0.38,
    turnInterval: [3000, 5000],
    branchLength: 0.85,
    seconds: 12,
    clearComment: '風に ゆられても へっちゃら！ うまく できたよ！',
    wind: { strength: 45, interval: [1800, 3200], duration: 1500 },
    quirks: { interval: [2600, 4400], dashMultiplier: 2.2, dashDuration: 800 },
  },

  /* ステージ9：ナミテントウが2匹（2匹とも気まぐれ。枝も少し短い）
     ナミテントウは気まぐれの間かくが 0.6倍になるので、ここでは長めにしてある（2匹とも小走りばかりだと、たえられない） */
  {
    ladybugs: ['namitentou', 'namitentou'],
    walkSpeed: 0.26,
    turnInterval: [2000, 3600],
    branchLength: 0.9,
    seconds: 13,
    clearComment: 'きまぐれな 2匹にも ついていけたよ！ あとひとつ！',
    wind: null,
    quirks: { interval: [3600, 5600], dashMultiplier: 2.2, dashDuration: 700 },
  },

  // ステージ10（さいご）：ナミテントウ ＋ 幼虫 ＋ 風 ＋ 気まぐれ。いちばん長くたえる
  {
    ladybugs: ['namitentou', 'larva'],
    walkSpeed: 0.26,
    turnInterval: [2000, 3600],
    branchLength: 0.9,
    seconds: 16,
    clearComment: 'ぜんぶのステージを クリア！ やった！ てんとうむしマスターだ！',
    wind: { strength: 50, interval: [2200, 3800], duration: 1300 },
    quirks: { interval: [2800, 4600], dashMultiplier: 2, dashDuration: 700 },
  },
];

/* ============================================================
   エンドレス（ぜんぶのステージをクリアすると遊べる）

   時間では終わらず、てんとう虫が はしに着くまで続く。記録は「何秒たえたか」
   levelSeconds 秒ごとにレベルが1つ上がり、levels の次のきまりになる（2匹目は、とちゅうで空から降りてくる）
   levels を使いきったあとは、さいごのきまりから、1つ上がるごとに step の分だけ きびしくする（limits で止める）

   ※ とちゅうで枝の長さは変えない（てんとう虫の位置がずれて見えるため）。どのレベルも branchLength は同じにしておく
   ※ とちゅうで てんとう虫の種類も変えない（いる てんとう虫は そのまま。増えるときだけ、新しい種類が来る）
   ============================================================ */
export type LadybugBalanceEndless = {
  levelSeconds: number;
  levels: readonly LadybugBalanceRule[];
  step: { walkSpeed: number; windStrength: number };
  limits: { walkSpeed: number; windStrength: number };
};

export const ladybugBalanceEndless: LadybugBalanceEndless = {
  levelSeconds: 10,

  levels: [
    // Lv.1：ナナホシ1匹、気まぐれなし
    { ladybugs: ['nanahoshi'], walkSpeed: 0.24, turnInterval: [3000, 5000], branchLength: 1, wind: null, quirks: null },

    // Lv.2：少し速く、気まぐれが はじまる
    {
      ladybugs: ['nanahoshi'],
      walkSpeed: 0.3,
      turnInterval: [3000, 5000],
      branchLength: 1,
      wind: null,
      quirks: { interval: [2600, 4400], dashMultiplier: 2.2, dashDuration: 800 },
    },

    // Lv.3：風が吹きはじめる
    {
      ladybugs: ['nanahoshi'],
      walkSpeed: 0.3,
      turnInterval: [3000, 5000],
      branchLength: 1,
      wind: { strength: 40, interval: [2400, 4000], duration: 1300 },
      quirks: { interval: [2600, 4400], dashMultiplier: 2.2, dashDuration: 800 },
    },

    // Lv.4：ナミテントウが降りてきて2匹に（2匹になるので、いったん風はやみ、歩く速さも落とす）
    {
      ladybugs: ['nanahoshi', 'namitentou'],
      walkSpeed: 0.22,
      turnInterval: [2000, 3600],
      branchLength: 1,
      wind: null,
      quirks: { interval: [3000, 5000], dashMultiplier: 2, dashDuration: 700 },
    },

    // Lv.5：2匹 ＋ 風
    {
      ladybugs: ['nanahoshi', 'namitentou'],
      walkSpeed: 0.22,
      turnInterval: [2000, 3600],
      branchLength: 1,
      wind: { strength: 40, interval: [2400, 4000], duration: 1200 },
      quirks: { interval: [3000, 5000], dashMultiplier: 2, dashDuration: 700 },
    },

    // Lv.6：2匹 ＋ 風 ＋ 少し速く（ここから先は、これを step の分ずつ きびしくしていく）
    {
      ladybugs: ['nanahoshi', 'namitentou'],
      walkSpeed: 0.24,
      turnInterval: [2000, 3600],
      branchLength: 1,
      wind: { strength: 45, interval: [2200, 3800], duration: 1300 },
      quirks: { interval: [2800, 4600], dashMultiplier: 2, dashDuration: 700 },
    },
  ],

  // levels を使いきったあと、1レベルごとに足す量と、その上限
  step: { walkSpeed: 0.015, windStrength: 4 },
  limits: { walkSpeed: 0.36, windStrength: 65 },
};

/* ============================================================
   枝の傾き（どのステージも同じ）

   ボタンを押しているあいだは、その向きへ少しずつ速く傾いていく（いきなり傾かない）
   はなすと、ばねのように少しずつ水平へ戻る
   ・maxDeg          … いちばん傾いたときの角度（度）
   ・pushAccel       … ボタンを押しているときに、傾きを速める強さ（度/秒²）
   ・returnStiffness … はなしたときに、水平へ戻ろうとする強さ（傾きが大きいほど強く戻る）
   ・damping         … 傾く速さのブレーキ（大きいほど、ゆれずに止まる）
   ============================================================ */
export const ladybugBalanceTilt = {
  maxDeg: 28,
  pushAccel: 190,
  returnStiffness: 6,
  damping: 5,
};

/* ============================================================
   フィールドをさわって傾ける（スマホ向け。マウスでクリックしても同じ）

   おさえているあいだは、左右のボタンを押しているのと同じ
   ・おさえた場所 … フィールドの右半分なら右、左半分なら左へ傾く
   ・指をずらす   … おさえた場所から switchDistance 以上ずらすと、ずらした向きへ切りかわる
   ・フリック     … flickDistance 以上を flickTime 以内に払って はなすと、
                    はなしたあとも flickHold のあいだ、払った向きへ押しつづける
   ・switchDistance・flickDistance … 画面の点（px）
   ・flickTime・flickHold           … ミリ秒（flickHold はゲームの時計で数える）
   ============================================================ */
export const ladybugBalanceTouch = {
  switchDistance: 24,
  flickDistance: 40,
  flickTime: 300,
  flickHold: 250,
};

/* ============================================================
   てんとう虫の動き（どのステージも同じ）

   ・climbSpeed   … 枝がいちばん傾いたときに、高いほうへ のぼる速さ（歩く速さに足される。種類の climb をかける）
   ・turnSlope    … 傾きがこれ以上（いちばん傾いたときを 1 とした割合）になると、高いほうへ向きを変える
                    （これより小さい傾きでは向きは変えず、低いほうへ歩いているときは少しゆっくりになるだけ）
   ・response     … 速さが変わるまでの「もたつき」（大きいほど、すぐに目当ての速さになる）
   ・nervousFrom  … はしから どれくらいの所で、あわてはじめるか（まん中 0 → はし 1 の割合）
   ・flyAt        … ここまで来たら飛んでいく（はし 1 より少し手前。羽を開いたところが枝の先に重なるように）
   ・bumpDistance … 2匹が この近さまで来たら、おたがいに向きを変える
   ============================================================ */
export const ladybugBalanceMotion = {
  climbSpeed: 0.6,
  turnSlope: 0.3,
  response: 3,
  nervousFrom: 0.62,
  flyAt: 0.96,
  bumpDistance: 0.16,
};

/* ============================================================
   時間（ミリ秒）
   ・countdownLeadIn / countdownDuration … 「3」「2」「1」の前の間と、3つ数える長さ（どこまで行ける？ と同じ）
   ・windWarning … 風が吹く何ミリ秒前に「かぜがくる！」を出すか
   ・flyAway     … てんとう虫が飛んでいく（幼虫は落ちる）演出の長さ（このあと結果を出す。CSS のアニメーションとそろえる）
   ・resultGuard … 結果が出てすぐのボタンを受けつけない時間（左右ボタンを押していた指で、すぐ押されないように）
   ・dashWindup  … 小走りの前に「！」を出して、うずうずしている時間（いきなり走りだして、よけられないことがないように）
   ・hop         … 急に向きを変えたときに、ぴょんと跳ねる時間（CSS のアニメーションとそろえる）
   ・landing     … エンドレスで2匹目が空から降りてくる時間（このあいだは動かない。CSS のアニメーションとそろえる）
   ============================================================ */
export const ladybugBalanceTiming = {
  countdownLeadIn: 400,
  countdownDuration: 2400,
  windWarning: 700,
  flyAway: 1200,
  resultGuard: 600,
  dashWindup: 350,
  hop: 300,
  landing: 800,
};

/* 1コマで進める時間の上限（ミリ秒。タブを切りかえたあとなどに、一気に進んで はしまで飛ばないように） */
export const ladybugBalanceMaxFrameMs = 50;
