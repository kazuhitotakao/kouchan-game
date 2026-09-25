/* ============================================================
   ミニゲームの一覧（ゲーム中に変わらないデータ）

   ミニゲームの一覧ページ（pages/minigame/index.vue）は、この配列を上から順に並べるだけ
   ミニゲームを増やすときは、次の3つをするだけでよい
   ① ここに1件たす（id は URL の /minigame/〜 と、保存場所の名前の一部にもなる）
   ② pages/minigame/<id>.vue を作る（外枠は components/minigame/MinigameLayout.vue を使う）
   ③ 本編で解放したいところで unlockMinigame('<id>') を呼ぶ（→ utils/minigameStorage.ts）

   ■ まだ解放していないミニゲーム
     一覧には「？？？」のカードで出し、lockedHint だけを見せる
     （名前や説明は出さない。本編で何を見つければよいかを、言いすぎないヒントにする）
   ============================================================ */

/* ミニゲーム1つぶんの情報

   id          … URL（/minigame/<id>）と、保存場所の名前に使う。あとから変えると、保存した記録が読めなくなる
   icon        … 一覧のカードのアイコン
   title       … 名前
   description … ひとことの説明（一覧のカードに出す）
   lockedHint  … まだ解放していないときに「？？？」の下に出すヒント
   formatBest  … 自己ベストを、一覧のカードに出す文にする（記録の形はゲームごとにちがうので、ゲームごとに書く）
                 まだ遊んでいない・記録が読めないときは null を返す（カードに自己ベストを出さない） */
export type MinigameInfo = {
  id: string;
  icon: string;
  title: string;
  description: string;
  lockedHint: string;
  formatBest: (savedBest: Record<string, unknown> | null) => string | null;
};

export const minigames = [
  {
    id: 'secret-path',
    icon: '🌿',
    title: 'どこまで行ける？',
    description: '枝をよけて、森の小道をどこまでも進もう！',
    lockedHint: '公園のどこかに、細い道があるみたい…',
    formatBest: (savedBest) => {
      const distance = Number(savedBest?.distance) || 0;
      const sunlight = Number(savedBest?.sunlight) || 0;

      return distance > 0 || sunlight > 0 ? `🏁 ${distance}m　✨ ${sunlight}` : null;
    },
  },
] as const satisfies readonly MinigameInfo[];

/* ミニゲームの id（'secret-path' など）。上の一覧から自動で決まる */
export type MinigameId = (typeof minigames)[number]['id'];

/* 保存してあった文字が、いまあるミニゲームの id かどうか
   （あとでミニゲームを消したり名前を変えたりしても、知らない id は読みとばせるように） */
export function isMinigameId(value: unknown): value is MinigameId {
  return minigames.some((minigame) => minigame.id === value);
}
