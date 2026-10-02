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

import type { SecretPathItemKind } from '~/types/game';

/* ミニゲーム1つぶんの情報

   id          … URL（/minigame/<id>）と、保存場所の名前に使う。あとから変えると、保存した記録が読めなくなる
   icon        … 一覧のカードのアイコン（絵文字）。iconImage があるときは、こちらは出さない（絵が読みこめないときの代わりにもならない）
   iconImage   … そのミニゲームのアイコンの絵（画像のパス。角の丸いアプリのアイコンのような絵）。絵文字で足りるときは書かない
                 一覧のカードのアイコンと、そのミニゲームのページの はじまる前の見出し（名前の左）に出す
   title       … 名前
   description … ひとことの説明（一覧のカードに出す）
   lockedHint  … まだ解放していないときに「？？？」の下に出すヒント
   formatBest  … 自己ベストを、一覧のカードに出す項目のならびにする（記録の形はゲームごとにちがうので、ゲームごとに書く）
                 まだ遊んでいない・記録が読めないときは null を返す（カードに自己ベストを出さない） */
export type MinigameInfo = {
  id: string;
  icon: string;
  iconImage?: string;
  title: string;
  description: string;
  lockedHint: string;
  formatBest: (savedBest: Record<string, unknown> | null) => MinigameBestPart[] | null;
};

/* 一覧のカードの自己ベストの、1項目ぶん（「🏁 97m」「［こもれびの絵］ 8」）

   text    … 出す文字（絵文字で足りるものは、ここに絵文字ごと書く。例：「🏁 97m」）
   icon    … 文字の左に出す絵（components/game/SecretPathIcon.vue の kind）。絵が要らない項目では書かない
   iconAlt … 絵の読み上げ用の名前（「こもれび」）
   ※ 前は「🏁 97m　✨ 8」の1つの文にしていたが、こもれびを絵にしたので、項目ごとに分けた
     （カードでは、項目のあいだを少しあけてならべる → pages/minigame/index.vue の .mg-card__bestPart） */
export type MinigameBestPart = {
  text: string;
  icon?: SecretPathItemKind;
  iconAlt?: string;
};

export const minigames = [
  {
    id: 'secret-path',
    /* アイコンは、森の小道を走るこうちゃんの絵（public/images/minigames/secret-path/ にある）
       前は 🌿 の絵文字だった
       絵がある場合も icon は書いておく（型で必須のため。カードには出ない） */
    icon: '🌿',
    iconImage: '/images/minigames/secret-path/secret-path-icon.webp',
    title: 'どこまで行ける？',
    description: '枝をよけて、森の小道をどこまでも進もう！',
    lockedHint: '公園のどこかに、秘密の小道があるみたい…',
    formatBest: (savedBest) => {
      const distance = Number(savedBest?.distance) || 0;
      const sunlight = Number(savedBest?.sunlight) || 0;

      return distance > 0 || sunlight > 0
        ? [
            { text: `🏁 ${distance}m` },
            { text: String(sunlight), icon: 'sunlight', iconAlt: 'こもれび' },
          ]
        : null;
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
