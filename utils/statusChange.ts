/* ============================================================
   ステータスの増減を画面に出すときの、見た目用の小さな処理

   結果カード・スコア内訳・上部ステータスで使うので、ここにまとめてある（色や形がずれないように）
   ============================================================ */

/* 変化量を「+5」「-10」「0」の形の文字にする */
export function formatChange(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

/* 変化が「良い」「悪い」「変化なし」のどれかを判定して、CSSのクラス名を返す
   ステータスはどれも「ふえると良い」でそろえてあるので、プラスなら良い・マイナスなら悪い
*/
export function changeClass(statusName: string, value: number) {
  // 時間は良い・悪いで見ないので、いつも「変化なし」の色にする
  if (statusName === 'minutes') {
    return 'change--neutral';
  }

  if (value === 0) {
    return 'change--neutral';
  }

  // 体力・機嫌・ポイント・親の余裕は、どれも ふえると良い変化
  return value > 0 ? 'change--good' : 'change--bad';
}
