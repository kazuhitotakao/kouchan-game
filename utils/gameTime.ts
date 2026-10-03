/* ============================================================
   ゲームの時計まわりの、小さな計算

   時計は '09:25' のような文字で持っていて、計算するときは分の数（565）へ直す
   ここは「文字 ↔ 分の数」の変換だけ（時刻を進めるのは pages/index.vue の addMinutes()）
   ============================================================ */

/* 「09:25」の形の文字を「分」の数に直す（09:00 なら 540） */
export function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);

  return hour * 60 + minute;
}

/* 「09:25」の形の文字に、分を足して、同じ形の文字で返す（24時を過ぎても、そのまま時の数がふえる） */
export function addMinutesToTime(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);

  const totalMinutes = hour * 60 + minute + minutes;

  const newHour = Math.floor(totalMinutes / 60);
  const newMinute = totalMinutes % 60;

  return `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}

/* 「分」で持っている時間を「09:25」の形の文字にする（540 → 09:00） */
export function formatMinutesToTime(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/* 時計の文字から、先頭の「0」を取る（09:25 → 9:25。結果カードではこちらのほうが読みやすい）
   ※ 上部ステータスの時計は、同じ幅のほうが見やすいので 09:25 のまま
*/
export function removeLeadingZero(time: string) {
  // '0' ではじまっているときだけ、1文字目を取りのぞく
  if (time.startsWith('0')) {
    return time.slice(1);
  }

  return time;
}
