/* ============================================================
   上部ステータスに出す警告メッセージの組み立て

   ゲーム本編（pages/index.vue）にあった dangerWarnings の
   「どの文を、どの順番でならべるか」だけを取り出してある

   ここにあるのは「あぶない状態か（true / false）→ 出す文のならび」の変換だけで、
   ステータスの値を見たり、あぶないかどうかを決めたりはしない
   （20以下かどうかを決めているのは pages/index.vue の
     isParentEnergyDanger などの computed。しきい値は data/game.ts にある）

   ※ しきい値の比較をここでもう一度書かないのは、
     同じルールが2か所にできて、片方だけ直すとずれてしまうため
   ============================================================ */

/* 上部ステータスに出す警告メッセージ
   危険なものだけを配列に入れて、画面ではこれを上から順番に表示する
*/
export function buildDangerWarnings(isParentEnergyDanger: boolean, isParentCalmDanger: boolean, isChildEnergyDanger: boolean) {
  const warnings: string[] = [];

  if (isParentEnergyDanger) {
    warnings.push('⚠ 親の体力が残りわずかです');
  }

  if (isParentCalmDanger) {
    warnings.push('⚠ 親の余裕が残りわずかです');
  }

  if (isChildEnergyDanger) {
    warnings.push('⚠ こうちゃんはかなり疲れています');
  }

  return warnings;
}
