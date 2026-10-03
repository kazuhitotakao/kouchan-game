/* ============================================================
   ミニゲーム（/minigame/secret-path）の「どこまで行ける？」の設定（ゲーム中に変わらないデータ）

   本編の小道と同じフィールド・操作で遊ぶので、ここに無い数字は data/secretPath.ts のものを使う
   ちがうのは、枝に当たると ❤ が減って0でおしまいになることと、進んだ距離でレベルが上がること
   ============================================================ */

/* 枝に何回当たったら、おしまいか（HUD の ❤ の数） */
export const secretPathEndlessLives = 3;

/* 最後の ❤ をなくしてから、結果の画面に切りかわるまでの間（ミリ秒）
   すぐ切りかわると、何に当たって終わったのかが見えないため（このあいだはフィールドを止めておく） */
export const secretPathEndlessGameOverDelay = 800;

/* ============================================================
   レベル（進んだ距離で、一段ずつ きびしくなる）

   secretPathEndlessLevelMeters ごとにレベルが1つ上がる（50 なら、0m〜 Lv.1、50m〜 Lv.2 …）

   ・speed              … 流れてくる速さ（1秒で、フィールドの高さの何%進むか。本編の小道は 70）
   ・rowInterval        … 行と行の間隔（ミリ秒）
   ・doubleBranchChance … 枝2本の行（空いているレーンが1つだけの行）が出る割合

   加速コンボで記録を稼ぐほど、レベルも早く上がる（どこで加速をやめるかを考えるのが、おもしろさになる）
   ============================================================ */
export const secretPathEndlessLevelMeters = 50;

/* Lv.1 〜 Lv.7 の中身（上から Lv.1, Lv.2, …） */
export const secretPathEndlessLevels = [
  { speed: 60, rowInterval: 800, doubleBranchChance: 0.3 },
  { speed: 65, rowInterval: 750, doubleBranchChance: 0.35 },
  { speed: 70, rowInterval: 700, doubleBranchChance: 0.4 },
  { speed: 75, rowInterval: 650, doubleBranchChance: 0.45 },
  { speed: 80, rowInterval: 600, doubleBranchChance: 0.5 },
  { speed: 85, rowInterval: 540, doubleBranchChance: 0.55 },
  { speed: 90, rowInterval: 480, doubleBranchChance: 0.6 },
];

/* Lv.8 から先は、1つ上がるごとに この分だけ きびしくし、上限で止める（上手な人でも、いつかは続けられなくなる）
   （速さ 180 は、枝が出てから こうちゃんに届くまで約0.5秒） */
export const secretPathEndlessLevelStep = { speed: 5, rowInterval: -20, doubleBranchChance: 0.03 };

export const secretPathEndlessLevelLimits = { maxSpeed: 180, minRowInterval: 320, maxDoubleBranchChance: 0.8 };

/* 1コマの中で、ゲームの時計を何ミリ秒ずつに分けて進めるか
   一気に進めると、速いときに枝が当たり判定（幅10%）を「すり抜けて」しまうため
   （20 なら、速さ 180 でも1回に 3.6% しか進まない。本編の小道は分けない） */
export const secretPathEndlessStepMs = 20;

/* 最初の行を出す時刻と、行ごとに時間をずらす幅（ミリ秒） */
export const secretPathEndlessFirstRowAt = 600;
export const secretPathEndlessRowJitter = 100;

/* 1つの行が、こもれびの行になる割合（行の中身は、本編と同じ数字を使う） */
export const secretPathEndlessSunlightChance = 0.25;

/* 進んだ距離の数えかた（フィールドの高さ1つぶん進んだら、何メートルか）
   速さ 60 なら 1秒で 3m、90 なら 4.5m 進む */
export const secretPathEndlessMetersPerField = 5;

/* こもれびを1つ取ったときに、進んだ距離へ足すボーナス（メートル）
   数えるだけだと、あぶない思いをして取りに行く意味が分かりにくいので、記録にも足す
   加速コンボの倍率は、わざと掛けない（いつ取っても同じ +5m のほうが分かりやすいため） */
export const secretPathEndlessSunlightBonusMeters = 5;

/* 加速コンボ（はやく進むのを、枝に当たらずに続けると、進んだ距離が多めに数えられる）
   ・seconds    … 続けた長さ（実際の時間の秒）
   ・multiplier … そのあいだ、進んだ距離を何倍に数えるか
   枝に当たる・やめると、最初（×1）に戻る。seconds が小さい順に並べること

   ■ 画面に出すのは「ふだんの何倍か（合計）」
     加速しただけで時計が2倍で進み、距離もすでに ×2 なので、合計は ×3 → ×4 → ×6 になる

   よけるのが むずかしくなるかわりに記録が伸びる、「がんばったぶんのごほうび」 */
export const secretPathEndlessBoostComboTiers = [
  { seconds: 3, multiplier: 1.5 },
  { seconds: 6, multiplier: 2 },
  { seconds: 10, multiplier: 3 },
];

/* BGM のテンポ（レベルが上がると少しずつ速くして、きびしくなったことを耳でも伝える。音の高さは変えない）
   ・perLevel     … 1つ上がるごとに、何倍ずつ速くするか
   ・maxLevelRate … いちばん速くても、ここまで（速すぎると、曲として聞きづらくなるため）

   ※ はやく進んでいるあいだは、曲の速さを変えない
     押す・はなすのたびに切りかえると、iPhone で曲がくずれたり、音がまとめて鳴ったりしたため
   ※ iPhone・iPad では、レベルが上がっても変えない
     音量バーのために Web Audio に通していて、そこでは音の高さまで上がってしまうため（→ usesWebAudioVolume()） */
export const secretPathEndlessBgmTempo = {
  perLevel: 0.03,
  maxLevelRate: 1.25,
};
