/* ============================================================
   ミニゲーム「てんとう虫バランス」（/minigame/ladybug-balance）の設定（ゲーム中に変わらないデータ）

   ■ 遊びかた
     てんとう虫は枝の上を、勝手に左右へ歩く
     本物のてんとう虫と同じく、高いほうへ のぼっていき、てっぺん（枝の先）から飛び立とうとする
     左右のボタンで枝を傾けると、てんとう虫は高いほうへ向きを変えて のぼる
     → てんとう虫が近づいた側を下げると、引き返してくる（下げすぎると、反対のはしまで のぼっていく）
     てんとう虫が枝のはしまで行くと、羽を開いて飛んでいってしまう（おしまい）
     時間（seconds）まで飛ばさずにいられたらクリア

   ■ 長さ・速さの単位
     いちばん長い枝の「まん中から はしまで」を 1 とする
     （branchLength 0.75 の枝は、まん中から 0.75 進むと はしに着く）

   ■ ステージを増やすときは、ladybugBalanceStages に1件たすだけでよい
     前のステージをクリアすると、次のステージが遊べるようになる
   ============================================================ */

/* ステージ1つぶんの設定

   ladybugCount     … てんとう虫の数（1 か 2。2匹のときは左右に分けて置く）
   walkSpeed        … てんとう虫が自分で歩く速さ（1秒に進む長さ。上の単位）
   turnInterval     … 向きを変えるまでの時間（ミリ秒。[いちばん短い, いちばん長い] のあいだで、毎回ばらばらに決める）
   branchLength     … 枝の長さ（まん中から はしまで。1 ＝ いちばん長い枝）
   seconds          … 何秒たえればクリアか
   wind             … 風（吹かないステージは null）
     strength … 風が枝を傾ける強さ（ボタンの強さ ladybugBalanceTilt.pushAccel とくらべる数字）
     interval … 風がやんでから、次に吹くまでの時間（ミリ秒。[短い, 長い]）
     duration … 1回の風が吹いている時間（ミリ秒）
   quirks           … ときどきする気まぐれな動き（しないステージは null）
     interval       … 気まぐれな動きのあいだの時間（ミリ秒。[短い, 長い]）
     dashMultiplier … 小走りのとき、歩く速さの何倍になるか
     dashDuration   … 小走りを続ける時間（ミリ秒）
     どちらの動きをするかは、そのときに決める
     ・急に向きを変える … 枝が水平に近いときだけ（しっかり傾いているときは、高いほうを向いたままなので）
     ・小走り          … 走りだす前に「！」を出して、少しうずうずしてから走る（ladybugBalanceTiming.dashWindup） */
export type LadybugBalanceStage = {
  ladybugCount: 1 | 2;
  walkSpeed: number;
  turnInterval: readonly [number, number];
  branchLength: number;
  seconds: number;
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

/* ステージの一覧（上から ステージ1, 2, …）
   枝が水平なら、てんとう虫は向きをあまり変えずに歩き続ける（turnInterval を長めにしている）
   ほうっておくと はしまで行ってしまうので、ずっと見ていないといけない */
export const ladybugBalanceStages: readonly LadybugBalanceStage[] = [
  // ステージ1：長い枝（遊びかたを覚える）
  { ladybugCount: 1, walkSpeed: 0.26, turnInterval: [2500, 4500], branchLength: 1, seconds: 5, wind: null, quirks: null },

  // ステージ2：速く歩く。ここから、ときどき急に向きを変えたり、小走りしたりする
  {
    ladybugCount: 1,
    walkSpeed: 0.34,
    turnInterval: [3000, 5000],
    branchLength: 1,
    seconds: 7,
    wind: null,
    quirks: { interval: [2200, 4000], dashMultiplier: 2.2, dashDuration: 800 },
  },

  // ステージ3：枝が短い
  {
    ladybugCount: 1,
    walkSpeed: 0.34,
    turnInterval: [3000, 5000],
    branchLength: 0.75,
    seconds: 8,
    wind: null,
    quirks: { interval: [2200, 4000], dashMultiplier: 2.2, dashDuration: 800 },
  },

  // ステージ4：ときどき強い風が吹く（押さえていないと枝が大きく傾き、てんとう虫が高いほうへ のぼっていく）
  {
    ladybugCount: 1,
    walkSpeed: 0.36,
    turnInterval: [3000, 5000],
    branchLength: 0.75,
    seconds: 8,
    wind: { strength: 55, interval: [1800, 3400], duration: 1500 },
    // 風と重なると きびしすぎるので、気まぐれな動きは ほかのステージより少なめ
    quirks: { interval: [3000, 5000], dashMultiplier: 2.2, dashDuration: 800 },
  },

  /* ステージ5：てんとう虫が2匹
     傾けると2匹とも同じ向き（高いほう）へ のぼるので、2匹が左右のはしへ離れていくときは、両方は戻せない
     そこで歩く速さはひかえめにし、枝も長くして、向きを変えるまで はしに着きにくくしている */
  {
    ladybugCount: 2,
    walkSpeed: 0.22,
    turnInterval: [2000, 3600],
    branchLength: 1,
    seconds: 10,
    wind: null,
    quirks: { interval: [2800, 4800], dashMultiplier: 2, dashDuration: 700 },
  },
];

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
   てんとう虫の動き（どのステージも同じ）

   ・climbSpeed   … 枝がいちばん傾いたときに、高いほうへ のぼる速さ（歩く速さに足される）
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
   ・flyAway     … てんとう虫が飛んでいく演出の長さ（このあと結果を出す。CSS のアニメーションとそろえる）
   ・resultGuard … 結果が出てすぐのボタンを受けつけない時間（左右ボタンを押していた指で、すぐ押されないように）
   ・dashWindup  … 小走りの前に「！」を出して、うずうずしている時間（いきなり走りだして、よけられないことがないように）
   ・hop         … 急に向きを変えたときに、ぴょんと跳ねる時間（CSS のアニメーションとそろえる）
   ============================================================ */
export const ladybugBalanceTiming = {
  countdownLeadIn: 400,
  countdownDuration: 2400,
  windWarning: 700,
  flyAway: 1200,
  resultGuard: 600,
  dashWindup: 350,
  hop: 300,
};

/* 1コマで進める時間の上限（ミリ秒。タブを切りかえたあとなどに、一気に進んで はしまで飛ばないように） */
export const ladybugBalanceMaxFrameMs = 50;
