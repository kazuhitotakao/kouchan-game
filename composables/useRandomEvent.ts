/* ============================================================
   ランダムイベントの抽選

   ゲーム本編（pages/index.vue）にあった runRandomEvent() の
   「何が起きるかを決めているところ」だけを取り出してある

   ■ ここがやること
     起こるかどうかの抽選と、起きたときの中身（文章とステータスの増減）を返す

   ■ ここがやらないこと
     ゲームの状態は、いっさい書きかえない（何が起きたかを返すだけ）
     ステータスを実際に動かすのも、結果カードに出すメモを足すのも、
     受けとった pages/index.vue の runRandomEvent() のまま

   ■ 確率・数字・文章・分岐の順番は、いっさい変えていない
     Math.random() を呼ぶ回数と順番も移す前と同じなので、
     同じ遊びかたをすれば、移す前と同じできごとが起きる
   ============================================================ */

/* 増減するステータスの名前（changeClass() に渡す中の名前とそろえてある） */
export type RandomEventStatName = 'childMood' | 'parentEnergy' | 'parentCalm';

/* できごと1つで動くステータス1つぶん
   label    … 画面に出す項目名（「こうちゃんの機嫌」など）
   statName … どのステータスか
   amount   … その増減（5 なら +5、-8 なら -8） */
export type RandomEventStatChange = {
  label: string;
  statName: RandomEventStatName;
  amount: number;
};

/* 起きたできごと1つぶん
   text    … 何が起きたかの文章
   effects … そのできごとで動くステータス（8番目だけ2つ、ほかは1つ） */
export type RandomEventDraw = {
  text: string;
  effects: RandomEventStatChange[];
};

/* ランダムイベント
   （通常行動中に起きる、ちょっとしたできごと）

   5回に1回くらい（20%）だけ起こり、
   8種類の中から1つが選ばれる

   ※ いやいやが起きた回は、そもそもこの関数が呼ばれない
     いやいやは専用の画面とBGMまである大きなできごとなので、
     同じ結果カードに並べず、1回の行動で目立つできごとは1つにそろえている
     （呼ぶかどうかを決めているのは finishPlayAction()）

     1 飛行機を見つける      … こうちゃんの機嫌 +5
     2 急に「だっこ！」      … 親の体力 -5
     3 ねこを見つける        … こうちゃんの機嫌 +5
     4 急に走り出す          … 親の余裕 -6
     5 ちょうちょ            … こうちゃんの機嫌 +4
     6 落ち葉を踏む          … こうちゃんの機嫌 +5
     7 靴に砂が入る          … 親の余裕 -3
     8 水たまりで大はしゃぎ  … こうちゃんの機嫌 +5 ／ 親の余裕 -3

   うれしいことが4つ・親がつかれることが3つ・その両方が1つ（8）という組み合わせ
   どれも小さな数字にしてあるので、出る順番で有利不利が決まってしまうことはない

   ※ ここに書く数字は「このできごとだけの増減」
     中央の「今回の変化（合計）」は行動ぜんぶを足した数なので、
     たとえば 一緒にすべる（親の体力 -14）＋ 急に「だっこ！」（-5）なら
     合計は -19 になる

   ※ どのイベントでも addMinutes() は呼ばない
     「通常行動をしている、その最中に起きたこと」という扱いなので、
     時間は通常行動のぶんだけ進む

   ※ 専用画面へ移動する「とつぜんのできごと」とは別物
     こちらは結果カードに文章とステータス変化が少し足されるだけ
*/
export function drawRandomEvent(): RandomEventDraw | null {
  // ① まず「そもそも起こるか？」の抽選（20%）
  //   0.2以上（＝80%）なら、何もしないでここで終わり
  if (Math.random() >= 0.2) {
    return null;
  }

  // ② 起こると決まったので、8種類の中から1つ選ぶ
  //   Math.random() * 8 で「0以上8未満の小数」を作り、
  //   Math.floor() で小数点以下を切り捨てて 0〜7 の整数にする
  //   8つの区間はどれも同じ幅なので、8種類が同じ確率で出る
  const eventNumber = Math.floor(Math.random() * 8);

  // ① 飛行機を見つける
  if (eventNumber === 0) {
    return {
      text: '「ひこうき！」こうちゃんは、うれしそうに空を見上げています。',
      effects: [
        { label: 'こうちゃんの機嫌', statName: 'childMood', amount: 5 },
      ],
    };
  }

  // ② 急に「だっこ！」
  if (eventNumber === 1) {
    return {
      text: 'こうちゃんが急に「だっこ！」と言い出しました。',
      effects: [
        { label: '親の体力', statName: 'parentEnergy', amount: -5 },
      ],
    };
  }

  // ③ ねこを見つける
  if (eventNumber === 2) {
    return {
      text: '「ねこちゃん！」こうちゃんは、うれしそうに指をさしました。',
      effects: [
        { label: 'こうちゃんの機嫌', statName: 'childMood', amount: 5 },
      ],
    };
  }

  // ④ 急に走り出す
  if (eventNumber === 3) {
    return {
      text: 'こうちゃんが急に走り出して、ちょっとヒヤッとしました！',
      effects: [
        { label: '親の余裕', statName: 'parentCalm', amount: -6 },
      ],
    };
  }

  // ⑤ ちょうちょ
  if (eventNumber === 4) {
    return {
      text: '「ちょうちょ！」こうちゃんは、うれしそうに追いかけています。',
      effects: [
        { label: 'こうちゃんの機嫌', statName: 'childMood', amount: 4 },
      ],
    };
  }

  // ⑥ 落ち葉を踏む
  if (eventNumber === 5) {
    return {
      text: '「カサカサする！」こうちゃんは、何度も落ち葉を踏んでいます。',
      effects: [
        { label: 'こうちゃんの機嫌', statName: 'childMood', amount: 5 },
      ],
    };
  }

  // ⑦ 靴に砂が入る
  if (eventNumber === 6) {
    return {
      text: '「砂はいっちゃった〜」こうちゃんは、くつを見ながら立ち止まりました。',
      effects: [
        { label: '親の余裕', statName: 'parentCalm', amount: -3 },
      ],
    };
  }

  // ⑧ 水たまりで大はしゃぎ（良い面と悪い面の両方があるイベント）
  //   ここまでの7つに当てはまらなかった＝eventNumber が 7 のとき
  //   2つステータスが動くので、しるしも2つ並べる
  return {
    text: '「みずたまり！」こうちゃんは、楽しそうにバシャバシャしています。',
    effects: [
      { label: 'こうちゃんの機嫌', statName: 'childMood', amount: 5 },
      { label: '親の余裕', statName: 'parentCalm', amount: -3 },
    ],
  };
}
