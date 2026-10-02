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
   （そのぶん SnackId にも名札を1つ足すこと。カードの絵も public/images/snacks/ に置いて、image に書く） */
export const snacks: Snack[] = [
  {
    id: 'gummy',
    name: 'グミ',
    /* 🍬（CANDY）は見た目が「包み飴」なので、グミには使わない

       絵文字には「グミ」そのものが無いため、
       果汁グミでおなじみのぶどうにして、飴と見まちがえないようにしている
       （ほかの5つ 🍫 🍘 🍪 🍌 🧃 とも色・形がかぶらない）

       ※ ここを変えるだけで、おやつバッグなどの表示が入れかわる
         （どれも snacks のこの icon を見ているため）
         おやつ選択画面のカードだけは、絵文字ではなく下の image の絵を出す */
    icon: '🍇',
    /* おやつ選択画面のカードに出す絵（6つとも public/images/snacks/ にある）
       ※ グミの画像だけ、ファイル名は gummy.webp（ほかは「チョコの板（chocolate-bar）」のように中身の形まで書いてある） */
    image: '/images/snacks/gummy.webp',
    energy: 5,
    mood: 20,
    minutes: 5,
  },
  {
    id: 'chocolate',
    name: 'チョコ',
    icon: '🍫',
    image: '/images/snacks/chocolate-bar.webp',
    energy: 10,
    mood: 14,
    minutes: 5,
  },
  {
    id: 'senbei',
    name: 'おせんべい',
    icon: '🍘',
    image: '/images/snacks/senbei-pack.webp',
    energy: 18,
    mood: 6,
    minutes: 10,
  },
  {
    id: 'biscuit',
    name: 'ビスケット',
    icon: '🍪',
    image: '/images/snacks/biscuit-pack.webp',
    energy: 12,
    mood: 10,
    minutes: 5,
  },
  {
    id: 'banana',
    name: 'バナナ',
    icon: '🍌',
    image: '/images/snacks/banana.webp',
    energy: 24,
    mood: 4,
    minutes: 10,
  },
  {
    id: 'jelly',
    name: 'ゼリー',
    icon: '🧃',
    image: '/images/snacks/fruit-jelly-cup.webp',
    energy: 7,
    mood: 15,
    minutes: 5,
  },
];

/* バッグに入れられるおやつの数

   「2」を画面や関数のあちこちに書かずに、ここ1か所だけにしておく
   3つ持っていける仕様にしたくなったら、この数字を 3 に変えるだけでよい
   （画面の「2 / 2」も、押せるようになる条件も、ぜんぶここを見ている） */
export const maxSnackCount = 2;

/* おやつバッグの絵（リュック）

   前は 🎒 の絵文字だったところを、ぜんぶこの絵にしている
   ・おやつ選択画面の「おやつバッグ」（pages/index.vue）
   ・ゲーム中に、どのおやつを食べるか選ぶメニューの見出し（「どのおやつにする？」「どのおやつをあげる？」→ components/game/CommandBox.vue）
   ・スマホの上部ステータスの、おやつの残りの数（components/game/StatusBar.vue）
   絵を差しかえたいときは、ここ1か所を書きかえるだけでよい */
export const snackBagImage = '/images/snacks/snack-backpack.webp';
