/* ============================================================
   ゲームの時計まわりの、小さな計算

   ゲーム本編（pages/index.vue）にあった時刻の計算だけを取り出してある

   公園の時計は '09:25' のような文字で持っていて、
   計算するときは「9時25分 → 565分」のように分の数へ直す
   その行き来をするところを、ここ1か所にまとめてある

   ここにあるのは「文字 ↔ 分の数」の変換だけで、
   いまの時刻（currentTime）を書きかえたり、
   ゲームのルールを決めたりはしない
   （時刻を進めるのは pages/index.vue の addMinutes()）
   ============================================================ */

/* 「09:25」の形の文字を「分」の数に直す
   09:00 なら 540、12:00 なら 720 になる
*/
export function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);

  return hour * 60 + minute;
}

/* 「09:25」の形の文字に、分を足して、同じ形の文字で返す

   1日をまたぐ扱いも、移す前と同じにしてある
   （24時を過ぎても、そのまま時の数がふえる）
*/
export function addMinutesToTime(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);

  const totalMinutes = hour * 60 + minute + minutes;

  const newHour = Math.floor(totalMinutes / 60);
  const newMinute = totalMinutes % 60;

  return `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}

/* 「分」で持っている時間を「09:25」の形の文字にする

   statusBefore.minutes には 09:00 が 540（＝9×60）のように
   分だけの数で入っているので、そのままだと画面に出せない
   60で割った答えが「時」、60で割ったあまりが「分」になる

   padStart(2, '0') は「2けたに足りないぶんを0でうめる」という意味
   （9 → 09）。addMinutesToTime() の中の書きかたとそろえてある
*/
export function formatMinutesToTime(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/* 時計の文字から、先頭の「0」を取る（09:25 → 9:25）

   結果カードの「時間」は 9:25 のほうがすっと読めるので、ここだけ0を外す
   ※ 上部ステータスの時計は 09:25 のままにしてある
     こちらはいつも同じ幅で並んでいたほうが、時間の進みが見やすいため
*/
export function removeLeadingZero(time: string) {
  // '0' ではじまっているときだけ、1文字目を取りのぞく
  if (time.startsWith('0')) {
    return time.slice(1);
  }

  return time;
}
