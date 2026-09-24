/* ============================================================
   いやいやタイムの設定（ゲーム中に変わらないデータ）

   ここにあるのは「どんなセリフを出すか」「どのおやつがどの理由に効くか」だけで、
   「いま何のいやいやか」（tantrumReason）や「いまのレベル」（tantrumLevel）は
   プレイ中に変わるので composables/useTantrum.ts のほうが持っている
   ============================================================ */

import type { SnackId, TantrumLevel, TantrumLevelInfo, TantrumReason, TantrumReasonInfo, TantrumSnackFit } from '~/types/game';

/* レベルごとの見出しと様子

   ぐずぐず（1）の scene が null なのは、
   理由ごとの様子（tantrumReasonInfo の scene）を出すため */
export const tantrumLevelInfo: Record<TantrumLevel, TantrumLevelInfo> = {
  1: { icon: '😫', title: 'いやいやタイム', scene: null },
  2: { icon: '😭', title: 'いやいやタイム！', scene: 'こうちゃんは涙をぽろぽろ流しながら、大きな声で泣いています。' },
  3: { icon: '😭💥', title: '大いやいやタイム！', scene: 'こうちゃんは地面にごろん！ 涙をぽろぽろ流しながら、全身でいやいやしています。' },
};

/* 理由ごとに、画面や結果の文章に出すことば */
export const tantrumReasonInfo: Record<TantrumReason, TantrumReasonInfo> = {
  tired: {
    voices: { 1: 'もうあるけない〜！', 2: 'もうあるけないー！！', 3: 'もうあるけないーーー！！！' },
    scene: 'こうちゃんは、その場にしゃがみこんでいます。',
    complaint: 'つかれたー！',
    greatSnackText: 'ちょっと元気がもどってきたみたいです。',
  },
  hungry: {
    voices: { 1: 'おなかすいた〜！', 2: 'おなかすいたー！！', 3: 'おなかすいたーーー！！！' },
    scene: 'こうちゃんは、おなかを押さえて座りこんでいます。',
    complaint: 'おなかすいたー！',
    greatSnackText: 'おなかも少し満たされたようです。',
  },
  frustrated: {
    voices: { 1: 'なんかちがう〜！', 2: 'なんかちがうー！！', 3: 'ちがうのーーー！！！' },
    scene: 'こうちゃんは、目に涙をためて納得できない様子です。',
    complaint: 'なんかちがうー！',
    greatSnackText: '悔しかった気持ちも、少しやわらいだようです。',
  },
  wantMorePlay: {
    voices: { 1: 'まだあそぶ〜！', 2: 'まだあそぶー！！', 3: 'まだあそぶーーー！！！' },
    scene: 'こうちゃんは、遊具を指さして動こうとしません。',
    complaint: 'まだあそぶー！',
    greatSnackText: 'まだ遊びたい気持ちも、少し切りかわったようです。',
  },
};

/* おやつ × いやいやの理由 の相性表

   おやつの回復量（data/snacks.ts の energy / mood / minutes）とは別のルールなので、
   Snack の型には入れず、ここに表として分けて持つ
   （回復量を変えたいときは snacks、相性を変えたいときはこの表、と見る場所が分かれる）

   読みかた：snackTantrumFits.banana.hungry → バナナは「おなかすいた」に great */
export const snackTantrumFits: Record<SnackId, Record<TantrumReason, TantrumSnackFit>> = {
  gummy: { tired: 'weak', hungry: 'normal', frustrated: 'great', wantMorePlay: 'normal' },
  chocolate: { tired: 'normal', hungry: 'normal', frustrated: 'great', wantMorePlay: 'normal' },
  senbei: { tired: 'normal', hungry: 'great', frustrated: 'weak', wantMorePlay: 'weak' },
  biscuit: { tired: 'normal', hungry: 'great', frustrated: 'normal', wantMorePlay: 'weak' },
  banana: { tired: 'great', hungry: 'great', frustrated: 'weak', wantMorePlay: 'weak' },
  jelly: { tired: 'normal', hungry: 'normal', frustrated: 'normal', wantMorePlay: 'normal' },
};

/* ナイス対応でもらえるボーナスの量（画面の「おでかけポイント +3」もここを見る） */
export const niceTantrumBonusOutingPoint = 3;
export const niceTantrumBonusParentCalm = 2;

/* いやいや発生の演出を出しておく時間（ミリ秒）
   1000 で1秒。ここだけ書きかえれば、出ている長さを調整できる */
export const tantrumAlertDuration = 2000;
