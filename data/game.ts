/* ============================================================
   ゲーム全体の設定（ゲーム中に変わらないデータ）

   場所・おやつ・いやいや・秘密の小道の設定は、それぞれ data/ の中の別のファイル
   ============================================================ */

import type { BannerImage, GameEvent } from '~/types/game';

/* 画面に出すゲームの題名 */
export const gameTitle: string = 'こうちゃんの大冒険';

/* とつぜんのできごと5つ（commandCount のいちばん最後の分岐に来るなかま） */
export const suddenEvents: GameEvent[] = ['emergencySiren', 'ladybug', 'dog', 'fallDown', 'fountain'];

/* とつぜんのできごとが起きる確率（0.2 ＝ 20%。5回に1回くらい） */
export const suddenEventChance = 0.2;

/* とつぜんのできごとの絵（カードのいちばん上のバナー。書きかたは data/places.ts の placeBannerImages と同じ）
   画面に出すのも先読みも、ここを見る（絵ができたら、ここだけ書きかえればよい） */
export const suddenEventBannerImages = {
  emergencySiren: { label: '救急車', ratio: '3 / 1' },
  ladybug: { src: '/images/events/event-ladybug-found.webp', ratio: '2048 / 455' },
  dog: { src: '/images/events/event-dog-appears.webp', ratio: '2660 / 591' },
  fallDown: { src: '/images/events/event-fall-down.webp', ratio: '2048 / 455' },
  fountain: { label: '噴水', ratio: '3 / 1' },
} satisfies Partial<Record<GameEvent, BannerImage>>;

/* ===== ゲージのしきい値（目もり） =====
   ゲージの線の位置とルールの判定の両方で使うので、数字を変えても線とルールがずれない
*/

/* こうちゃんの体力：これを下回ると「いやいや」が起きるようになる */
export const fussEnergyLine = 71;

/* 公園にある場所の数（すべり台・砂場・どんぐり・池・芝生広場・秘密の場所）
   結果の文章で「ぜんぶ回れたか」を見るのに使う */
export const totalPlaceCount = 6;

/* 遊んだ回数：これ以上なら「たくさん遊んだ」とみなす（結果の文章を書きわける境目） */
export const playedALotLine = 3;

/* こうちゃんの機嫌：これ以下だと「いやいや」が起きやすくなる */
export const fussMoodLine = 50;

/* こうちゃん・親の体力：これ以下はあぶない（GAME OVERが近い） */
export const dangerEnergyLine = 20;

/* 親の余裕：これ以下はあぶない（0でGAME OVER） */
export const dangerCalmLine = 20;
