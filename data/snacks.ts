/* ============================================================
   おやつの設定（ゲーム中に変わらないデータ）

   ここにあるのは「どんなおやつがあるか」「何個持っていけるか」だけで、
   「いま何を持っているか」（selectedSnackIds）は
   プレイ中に変わるので composables/useSnackBag.ts のほうが持っている
   ============================================================ */

import type { Snack } from '~/types/game';

/* おやつの一覧（画面に出る6種類）

   おやつを増やしたいときは、ここへ1件足すだけでよい
   画面のほうは v-for でこの配列をそのまま並べているので、
   HTMLに新しいカードを書き足す必要はない
   （そのぶん SnackId にも名札を1つ足すこと） */
export const snacks: Snack[] = [
  {
    id: 'gummy',
    name: 'グミ',
    /* 🍬（CANDY）は見た目が「包み飴」なので、グミには使わない

       絵文字には「グミ」そのものが無いため、
       果汁グミでおなじみのぶどうにして、飴と見まちがえないようにしている
       （ほかの5つ 🍫 🍘 🍪 🍌 🧃 とも色・形がかぶらない）

       ※ ここを変えるだけで、画面のカードもバッグの表示も入れかわる
         （どちらも snacks のこの icon を見ているため） */
    icon: '🍇',
    energy: 5,
    mood: 20,
    minutes: 5,
    description: 'こうちゃんの大好物。機嫌が大きく回復',
  },
  {
    id: 'chocolate',
    name: 'チョコ',
    icon: '🍫',
    energy: 10,
    mood: 14,
    minutes: 5,
    description: '体力と機嫌をバランスよく回復',
  },
  {
    id: 'senbei',
    name: 'せんべい',
    icon: '🍘',
    energy: 18,
    mood: 6,
    minutes: 10,
    description: 'おなかがいっぱいになって体力が回復',
  },
  {
    id: 'biscuit',
    name: 'ビスケット',
    icon: '🍪',
    energy: 12,
    mood: 10,
    minutes: 5,
    description: '体力と機嫌をほどよく回復',
  },
  {
    id: 'banana',
    name: 'バナナ',
    icon: '🍌',
    energy: 24,
    mood: 4,
    minutes: 10,
    description: '体力をしっかり回復',
  },
  {
    id: 'jelly',
    name: 'ゼリー',
    icon: '🧃',
    energy: 7,
    mood: 15,
    minutes: 5,
    description: 'つるんと食べやすく、機嫌が回復',
  },
];

/* バッグに入れられるおやつの数

   「2」を画面や関数のあちこちに書かずに、ここ1か所だけにしておく
   3つ持っていける仕様にしたくなったら、この数字を 3 に変えるだけでよい
   （画面の「2 / 2」も、押せるようになる条件も、ぜんぶここを見ている） */
export const maxSnackCount = 2;
