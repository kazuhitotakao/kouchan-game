/* ============================================================
   公園の場所の設定（ゲーム中に変わらないデータ）

   プレイ中に変わる値は useGameState.ts、遊んだときの数値・文章は data/placeActions.ts
   ============================================================ */

import type { GameEvent, ItemPlace } from '~/types/game';

/* 公園にある「通常の場所」6か所（その場所ならではの遊びを持っている場所） */
export const normalPlaceEvents: GameEvent[] = ['slide', 'sandbox', 'acornArea', 'pond', 'grassArea', 'secretSpot'];

/* 公園入口の「どこへ行く？」で、それぞれの場所へ入るコマンドが何番目か

   ※ secretSpot と secretPath は、どちらも「秘密の小道」から入るので同じ番号
   ※ 「ひとやすみ」は秘密の小道の有無で番号が変わるので、pages/index.vue の restCommandIndex で決める
   ※ 並びを変えるときは、template・runSelectedCommand()・ここ の3か所をそろえること
*/
export const placeSelectionIndexes: Partial<Record<GameEvent, number>> = {
  slide: 0,
  sandbox: 1,
  acornArea: 2,
  pond: 3,
  grassArea: 4,
  secretPath: 5,
  secretSpot: 5,
};

/* 場所ごとに見つかるもの（1か所に1種類） */
export const placeItems: Record<ItemPlace, string> = {
  slide: 'ちいさな松ぼっくり',
  sandbox: 'きれいな石',
  acornArea: '大きなどんぐり',
  pond: '水色のガラス玉',
  grassArea: 'きいろい花',
  secretSpot: 'ふしぎな形の枝',
};

/* 見つけたものの絵（名前 → 画像のパス。上部ステータス・結果カード・リザルトで使う）
   ※ 見つかるものを増やしたときは、ここにも1行足すこと（無いときは 🔍 を出す） */
export const itemImages: Record<string, string> = {
  [placeItems.slide]: '/images/items/found/pinecone.webp',
  [placeItems.sandbox]: '/images/items/found/pretty-stone.webp',
  [placeItems.acornArea]: '/images/items/found/acorn.webp',
  [placeItems.pond]: '/images/items/found/glass-marble.webp',
  [placeItems.grassArea]: '/images/items/found/yellow-flower.webp',
  [placeItems.secretSpot]: '/images/items/found/odd-branch.webp',
};

/* その場所ではじめて遊んだときに、アイテムが見つかる確率（60%） */
export const firstVisitItemFindChance = 0.6;
