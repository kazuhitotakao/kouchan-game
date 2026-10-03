/* ============================================================
   おやつの設定（ゲーム中に変わらないデータ）

   いま何を持っているか（プレイ中に変わる値）は useSnackBag.ts が持っている
   ============================================================ */

import type { Snack } from '~/types/game';

/* おやつの一覧（画面に出る6種類）
   増やすときは、ここへ1件足して、SnackId にも名札を1つ足す（絵は public/images/snacks/ に置く） */
export const snacks: Snack[] = [
  {
    id: 'gummy',
    name: 'グミ',
    /* グミの絵文字は無く、🍬 は包み飴に見えるので、果汁グミでおなじみのぶどうにしている */
    icon: '🍇',
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

/* バッグに入れられるおやつの数（画面の「2 / 2」も、押せるようになる条件も、ぜんぶここを見ている） */
export const maxSnackCount = 2;

/* おやつバッグの絵（リュック。おやつ選択画面・おやつバッグの見出し・スマホの上部ステータスで使う） */
export const snackBagImage = '/images/snacks/snack-backpack.webp';
