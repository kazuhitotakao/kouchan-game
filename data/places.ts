/* ============================================================
   公園の場所の設定（ゲーム中に変わらないデータ）

   「いまどこにいるか」（currentEvent）や
   「どこへ行ったか」（visitedPlaces）は
   プレイ中に変わるので composables/useGameState.ts のほうが持っている

   その場所で遊んだときの数値・時間・結果の文章は data/placeActions.ts
   ============================================================ */

import type { GameEvent, ItemPlace } from '~/types/game';

/* 公園にある「通常の場所」6か所

   この6か所だけが、その場所ならではの遊びを持っている場所
   （公園入口・いやいやタイム・とつぜんのできごと・ゴール・GAME OVER はふくまない）

   別枠の「ひとやすみ」を出すのは、ここに書いた6か所だけ
   あとから場所が増えたときも、この配列に1行足すだけでそろう
*/
export const normalPlaceEvents: GameEvent[] = ['slide', 'sandbox', 'acornArea', 'pond', 'grassArea', 'secretSpot'];

/* 公園入口の「どこへ行く？」で、それぞれの場所へ入るコマンドが何番目か

   画面（template の parkEntrance）と runSelectedCommand() の parkEntrance の並びと同じ
     0 すべり台／1 砂場／2 どんぐりの木／3 池／4 芝生広場／5 細い道の先
   ※ こもれびの広場（secretSpot）と秘密の小道（secretPath）は、
     どちらも「細い道の先」から入るので、同じ5番にしている
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
  grassArea: '黄色い花',
  secretSpot: 'ふしぎな形の枝',
};

/* 見つけたものの絵文字（名前 → 絵文字）

   900px以下（スマホ・タブレットくらいの幅）の上部ステータス「見つけたもの」では、名前のかわりにこの絵文字だけを並べる
   名前のままだと3個目あたりから1行に入りきらず、横スクロールになってしまうため
   （名前は読み上げ用に残してある → components/game/StatusBar.vue・assets/css/game/status.css）
   PC（901px以上）では今までどおり名前を出す

   ※ 松ぼっくりには専用の絵文字が無いので、松の木（🌲）で代わりにしている
   ※ 見つかるものを増やしたときは、ここにも1行足すこと（無いときは 🔍 を出す） */
export const itemIcons: Record<string, string> = {
  [placeItems.slide]: '🌲',
  [placeItems.sandbox]: '🪨',
  [placeItems.acornArea]: '🌰',
  [placeItems.pond]: '🔵',
  [placeItems.grassArea]: '🌼',
  [placeItems.secretSpot]: '🪵',
};

/* その場所ではじめて遊んだときに、アイテムが見つかる確率（60%） */
export const firstVisitItemFindChance = 0.6;
