/* ============================================================
   ミニゲーム（/minigame/secret-path）の「どこまで行ける？」の設定（ゲーム中に変わらないデータ）

   本編の秘密の小道（data/secretPath.ts）と同じフィールド・同じ操作で遊ぶ
   ちがうのは、次の4つだけ
   ・時間では終わらない。枝に secretPathEndlessLives 回当たったら、おしまい
   ・進んだ距離でレベルが上がり、流れる速さと行の間隔がきびしくなる（上限なし。いつかは続けられなくなる）
   ・行の予定は、はじめに全部は作らず、遊びながら1行ずつ作る
   ・枝に当たっても、木漏れ日は減らない（かわりに、のこりの ❤ が1つ減る）

   カウントダウン・「スタート！」・はやく進む・当たり判定の幅・演出の長さなどは、
   本編と同じ data/secretPath.ts の数字をそのまま使う
   ============================================================ */

/* 枝に何回当たったら、おしまいか（HUD の ❤ の数） */
export const secretPathEndlessLives = 3;

/* ============================================================
   レベル（進んだ距離で、一段ずつ きびしくなる）

   secretPathEndlessLevelMeters ごとにレベルが1つ上がる（50 なら、0m〜 Lv.1、50m〜 Lv.2、100m〜 Lv.3 …）
   レベルが上がった瞬間に「⏫ スピードアップ！」を出す（→ pages/minigame/secret-path.vue の下の枠と、SecretPathField.vue の HUD）

   ・speed              … 流れてくる速さ（1秒で、フィールドの高さの何%進むか。本編の小道は 70）
   ・rowInterval        … 行と行の間隔（ミリ秒）
   ・doubleBranchChance … 枝2本の行（空いているレーンが1つだけの行）が出る割合

   加速コンボで距離が多めに数えられると、レベルも早く上がる
   （記録を稼ぐほど、はやく きびしくなる。どこで加速をやめるかを考えるのが、おもしろさになる）
   ============================================================ */
export const secretPathEndlessLevelMeters = 50;

/* Lv.1 〜 Lv.7 の中身（上から Lv.1, Lv.2, …）
   数字を変えたいときは、ここを書きかえればよい */
export const secretPathEndlessLevels = [
  { speed: 60, rowInterval: 800, doubleBranchChance: 0.3 },
  { speed: 65, rowInterval: 750, doubleBranchChance: 0.35 },
  { speed: 70, rowInterval: 700, doubleBranchChance: 0.4 },
  { speed: 75, rowInterval: 650, doubleBranchChance: 0.45 },
  { speed: 80, rowInterval: 600, doubleBranchChance: 0.5 },
  { speed: 85, rowInterval: 540, doubleBranchChance: 0.55 },
  { speed: 90, rowInterval: 480, doubleBranchChance: 0.6 },
];

/* 上の表より先のレベル（Lv.8 から先）は、1つ上がるごとに、この分だけ きびしくする
   上限（secretPathEndlessLevelLimits）まで上がりつづけるので、上手な人でも いつかは続けられなくなる
   （速さ 180 は、枝が出てから こうちゃんに届くまで約0.5秒。はやく進んでいると約0.25秒） */
export const secretPathEndlessLevelStep = { speed: 5, rowInterval: -20, doubleBranchChance: 0.03 };

export const secretPathEndlessLevelLimits = { maxSpeed: 180, minRowInterval: 320, maxDoubleBranchChance: 0.8 };

/* 1コマの中で、ゲームの時計を何ミリ秒ずつに分けて進めるか（「どこまで行ける？」だけ）

   1コマで一気に進めると、速いときに枝が こうちゃんの当たり判定（幅10%）を「すり抜けて」しまう
   （1コマは最大 50ミリ秒、はやく進んでいると ゲームの時計で 100ミリ秒。速さ 180 なら 18% 進んでしまう）
   そこで、ゲームの時計を この長さずつに分けて、少しずつ進めながら当たりを見る
   20 なら、速さ 180 でも 1回に 3.6% しか進まないので、すり抜けない
   ※ 本編の小道（速さ 70 のまま）は、今までどおり分けずに進める */
export const secretPathEndlessStepMs = 20;

/* 最初の行を出す時刻と、行ごとに時間をずらす幅（ミリ秒） */
export const secretPathEndlessFirstRowAt = 600;
export const secretPathEndlessRowJitter = 100;

/* 1つの行が、木漏れ日の行になる割合
   木漏れ日の行の中身（いっしょに出る枝の割合）は、本編と同じ data/secretPath.ts の数字を使う */
export const secretPathEndlessSunlightChance = 0.25;

/* 進んだ距離の数えかた（フィールドの高さ1つぶん進んだら、何メートルか）
   速さ 60 なら 1秒で 3m、90 なら 4.5m 進む */
export const secretPathEndlessMetersPerField = 5;

/* 木漏れ日を1つ取ったときに、進んだ距離へ足すボーナス（メートル）

   「どこまで行ける？」の木漏れ日は、集めた数を数えるだけだったので、
   取っても記録（進んだ距離）が伸びず、取りに行く意味が分かりにくかった
   （木漏れ日の行は、たいてい枝もいっしょに出るので、取りに行くのは あぶない）
   そこで、1つ取るたびに、この分だけ距離を足す（こうちゃんの上に「✨ +5m」と出す）

   ・5 ＝ フィールドの高さ1つぶん（secretPathEndlessMetersPerField）と同じきりのいい数
     Lv.1 だと 1秒で 3m 進むので、およそ1.7秒ぶん先へ進めることになる
   ・加速コンボの倍率は、わざと掛けない（いつ取っても「✨ +5m」で同じなのが分かりやすいため）
   ・距離でレベルが上がるので、たくさん取るほど、きびしくなるのも少しだけ早くなる */
export const secretPathEndlessSunlightBonusMeters = 5;

/* 加速コンボ（はやく進むと、進んだ距離が多めに数えられる）

   はやく進む（↑ / Space・長押し）を、枝に当たらずに続けているあいだ、
   続けた長さに合わせて、進んだ距離の数えかたが上がっていく
   ・seconds    … 続けた長さ（実際の時間の秒。はやく進んでいるあいだのゲームの時計は2倍で進むが、ここは実際の時間で数える）
   ・multiplier … そのあいだ、進んだ距離を何倍に数えるか
   枝に当たる・はやく進むのをやめると、最初（×1）に戻る

   ■ 画面に出す倍率は、この multiplier ではなく「ふだんの何倍か（合計）」
     はやく進むと、ゲームの時計そのものが2倍（data/secretPath.ts の secretPathBoostMultiplier）で進み、
     距離も その時計で数えているので、加速しただけで すでに ×2 数えられている
     そこへ下の multiplier が掛かるので、実際には ×3 → ×4 → ×6 になる
     HUD の札・ルールの説明・知らせも、この合計（×2 → ×3 → ×4 → ×6）で出している
     （前は multiplier の ×1.5・×3 をそのまま出していたので、伸びかたと数字が合っていなかった）

   はやく進むと、枝も木漏れ日も2倍の速さで来るので、よけるのが むずかしくなる
   そのかわりに記録が伸びる、という「がんばったぶんのごほうび」にしている
   段を変えたいときは、ここの数字だけを書きかえればよい（上から順に、seconds が小さい順に並べること）
   ※ 次の段までの進み具合は、HUD の札の下のゲージで見せている（→ components/game/SecretPathField.vue） */
export const secretPathEndlessBoostComboTiers = [
  { seconds: 3, multiplier: 1.5 },
  { seconds: 6, multiplier: 2 },
  { seconds: 10, multiplier: 3 },
];

/* BGM（こもれびの広場の曲「こもれびの奥で」）のテンポ

   レベルが上がると、曲を少しずつ速くして、きびしくなったことを耳でも伝える
   （音の高さは変えずに、テンポだけを上げる → composables/useAudio.ts の setSecretBgmPlaybackRate()）
   ・perLevel     … レベルが1つ上がるごとに、何倍ずつ速くするか（0.03 なら、Lv.2 で 1.03倍、Lv.7 で 1.18倍）
   ・maxLevelRate … いちばん速くても、ここまで（1.25倍。Lv.9 で届く。速すぎると、曲として聞きづらくなるため）

   ※ はやく進んでいるあいだは、曲の速さを変えない
     前は はやく進むたびに曲を速くしていたが、iPhone のホーム画面から開いたときに、
     曲がくずれて聞こえる・アウトのときに「ぽこっ」がまとめて何回も鳴る、ということが起きていた
     （押す・はなすのたびに曲の速さが切りかわるのが引き金とみられる）
     かわりに、こうちゃんの後ろに風の跡を出して、はじめた瞬間に「ヒュッ」と鳴らす
     （→ components/game/SecretPathField.vue・composables/useAudio.ts の playBoostSound()）

   ※ iPhone・iPad では、レベルが上がっても曲の速さを変えない（いつも ふつうの速さ）
     この2つでは、音量バーを効かせるために mp3 の音を Web Audio に通しており、
     その通り道では「音の高さは変えない」という指定が効かないので、
     速くすると曲の高さまで上がってしまい、音もくずれていた
     （上の「はやく進んでいるあいだ」で残っていた不具合の、もう半分）
     → composables/useAudio.ts の setSecretBgmPlaybackRate()・utils/elementVolume.ts の usesWebAudioVolume()
     レベルが上がったことは「⏫ スピードアップ！」の知らせと「ピピッ」で分かるので、遊びかたは変わらない */
export const secretPathEndlessBgmTempo = {
  perLevel: 0.03,
  maxLevelRate: 1.25,
};
