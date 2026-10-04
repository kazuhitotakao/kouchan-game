/* ============================================================
   ミニゲームの一覧（ゲーム中に変わらないデータ）

   ミニゲームを増やすときは、次の3つをするだけでよい
   ① ここに1件たす
   ② pages/minigame/<id>.vue を作る（外枠は MinigameLayout.vue）
   ③ 本編で解放したいところで unlockMinigame('<id>') を呼ぶ
   ============================================================ */

import { ladybugBalanceStages } from '~/data/ladybugBalance';
import type { SecretPathItemKind } from '~/types/game';

/* ミニゲーム1つぶんの情報

   id          … URL と保存場所の名前に使う（あとから変えると、保存した記録が読めなくなる）
   icon        … アイコンの絵文字（iconImage があるときは出さない）
   iconImage   … アイコンの絵（一覧のカードと、ページの見出しに出す）
   lockedHint  … まだ解放していないときに「？？？」の下に出すヒント（言いすぎないように）
   formatBest  … 自己ベストを、カードに出す項目のならびにする（記録が無いときは null） */
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
   icon    … 文字の左に出す絵（SecretPathIcon.vue の kind。要らなければ書かない）
   iconAlt … 絵の読み上げ用の名前 */
export type MinigameBestPart = {
  text: string;
  icon?: SecretPathItemKind;
  iconAlt?: string;
};

export const minigames = [
  {
    id: 'secret-path',
    /* 絵がある場合も icon は書いておく（型で必須のため。カードには出ない） */
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
  {
    id: 'ladybug-balance',
    icon: '🐞',
    /* 絵はまだ無いので、絵文字（icon）を出す（書いておかないと、一覧の型から iconImage が消えて、読む側がエラーになる） */
    iconImage: undefined,
    title: 'てんとう虫バランス',
    description: '枝をかたむけて、てんとう虫が飛んでいかないようにしよう！',
    lockedHint: '公園で、ちいさな生きものに出会えるかも…',
    /* 自己ベストのかわりに、どこまでクリアしたか（{ clearedStage: 3 } なら「ステージ 3/5 クリア」） */
    formatBest: (savedBest) => {
      const clearedStage = Math.min(Number(savedBest?.clearedStage) || 0, ladybugBalanceStages.length);

      return clearedStage > 0 ? [{ text: `🐞 ステージ ${clearedStage}/${ladybugBalanceStages.length} クリア` }] : null;
    },
  },
] as const satisfies readonly MinigameInfo[];

/* ミニゲームの id（'secret-path' など）。上の一覧から自動で決まる */
export type MinigameId = (typeof minigames)[number]['id'];

/* 保存してあった文字が、いまあるミニゲームの id かどうか（知らない id は読みとばせるように） */
export function isMinigameId(value: unknown): value is MinigameId {
  return minigames.some((minigame) => minigame.id === value);
}
