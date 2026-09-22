/* ============================================================
   ゲーム全体の設定（ゲーム中に変わらないデータ）

   場所関係は data/places.ts、
   おやつ関係は data/snacks.ts、
   いやいやタイム関係は data/tantrum.ts、
   秘密の小道関係は data/secretPath.ts のほうにまとめてある
   ============================================================ */

import type { GameEvent } from '~/types/game';

/* 画面に出すゲームの題名 */
export const gameTitle: string = 'こうちゃんの大冒険';

/* とつぜんのできごと5つ（commandCount のいちばん最後の分岐に来るなかま） */
export const suddenEvents: GameEvent[] = ['emergencySiren', 'ladybug', 'dog', 'fallDown', 'fountain'];

/* とつぜんのできごとが起きる確率
   0.2 ＝ 20%（5回に1回くらい）
   ここの数字だけを書きかえれば、起きやすさを変えられる
   例）0.15 なら15%、0.25 なら25%
*/
export const suddenEventChance = 0.2;

/* ===== ゲージのしきい値（目もり） =====
   ゲームのルールで使っている数字を、ここに名前を付けてまとめておく
   ・ゲージの上に線（目もり）を出すときの位置
   ・ルールの判定（いやいや発生・危険な状態）
   の両方で同じ定数を使うので、あとから数字を変えても線とルールがずれない
*/

/* こうちゃんの体力：これを下回ると「いやいや」が起きるようになる
   （71以上あるうちは元気いっぱいなので、いやいやは起こらない）
*/
export const fussEnergyLine = 71;

/* 公園にある場所の数（すべり台・砂場・どんぐり・池・芝生広場・秘密の場所）
   結果の文章で「ぜんぶ回れたか」を見るのに使う */
export const totalPlaceCount = 6;

/* 遊んだ回数：これ以上あそんでいたら「たくさん遊んだ」とみなす
   結果の文章を「たくさん遊んだ」と「あまり遊べなかった」で
   書きわけるときの境目に使う
   （1つの場所だけでも、3回あそべば十分たっぷり遊んでいる）
*/
export const playedALotLine = 3;

/* こうちゃんの機嫌：これ以下だと「いやいや」が起きやすくなる */
export const fussMoodLine = 50;

/* こうちゃん・親の体力：これ以下はあぶない（GAME OVERが近い） */
export const dangerEnergyLine = 20;

/* 親の余裕：これ以下はあぶない（0でGAME OVER） */
export const dangerCalmLine = 20;
