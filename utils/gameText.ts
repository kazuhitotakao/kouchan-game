/* ============================================================
   画面に出す文の組み立て

   「いまどんな状態か → 画面に出す文」の変換だけ（状態を決めるのは pages/index.vue の computed）
   ※ しきい値や時刻の境目は、ここに書かない（2か所にあると、片方だけ直したときにずれるため）
   ============================================================ */

/* 公園入口のあいさつ文
   何度も戻ってくる場所なので、「やってきました」のままだと2回目からちぐはぐに聞こえるため、場面で言いかたを変える

   ① 着いたばかり（09:00） ② 午前前半のおかえり ③ 午前後半（10:30〜。お昼が近いことを伝える）
   ③の境目は、公園BGMが変わる時刻とわざと同じ（曲と文言がいっしょに変わって、章が進んだ感じが出る）

   秘密の小道を見つけて、まだ先へ進んでいないあいだは、①〜③より先に、その案内を出す
*/
export function buildParkEntranceText(isJustArrivedAtPark: boolean, isLateMorning: boolean, hasNewSecretPath = false) {
  // 秘密の小道を見つけたが、まだ先へ進んでいない
  if (hasNewSecretPath) {
    return '木々のあいだに、秘密の小道を見つけました！この先には何があるのかな？';
  }

  // ① 着いたばかり
  if (isJustArrivedAtPark) {
    return 'こうちゃんと公園にやってきました。どこへ探検に行こう？';
  }

  // ③ 午前後半（10:30以降）
  if (isLateMorning) {
    return 'お日さまが高くなってきました。おひるまで、のこりすこし。どこへ探検に行こう？';
  }

  // ② 午前前半で、入口へもどってきたとき
  return '公園入口にもどってきました。つぎはどこへ探検に行く？';
}

/* ゴール確認ダイアログに出す「お昼まで あと1時間20分」の文（まだ遊ぶ時間があるかを見て決められるように） */
export function buildGoalConfirmTimeText(currentMinutes: number) {
  const minutesLeft = 12 * 60 - currentMinutes;

  // ふつうは、12:00を過ぎると自動でゴールへ向かうので、ここへは来ない（念のため）
  if (minutesLeft <= 0) {
    return 'もうお昼です';
  }

  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;

  let timeLeft = `${minutes}分`;

  if (hours > 0) {
    timeLeft = minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
  }

  return `お昼まで あと${timeLeft}`;
}
