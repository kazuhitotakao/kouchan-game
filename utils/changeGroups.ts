/* ============================================================
   「今回の変化（合計）」の表示データ作り

   「行動する前の値・いまの値・増減 → 画面にならべる形」の変換だけ（ゲームの値は書きかえない）
   ============================================================ */

import { formatMinutesToTime, removeLeadingZero } from '~/utils/gameTime';
import { changeClass, formatChange } from '~/utils/statusChange';
import type { ChangeGroup, StatusChanges } from '~/types/game';

/* 行動する前に控えておいた、そのときのステータス
   （StatusChanges と同じ6つだが、こちらは増減ではなく値そのもの）
*/
export type StatusSnapshot = {
  childEnergy: number;
  childMood: number;
  outingPoint: number;
  parentEnergy: number;
  parentCalm: number;
  minutes: number;
};

/* 表示データを作るために必要なもの（changes が null なら、まだ結果がない。ほかは いま画面に出ている値） */
export type ChangeGroupsInput = {
  changes: StatusChanges | null;
  before: StatusSnapshot;
  childEnergy: number;
  childMood: number;
  outingPoint: number;
  parentEnergy: number;
  parentCalm: number;
  currentTime: string;
};

/* 「今回の変化」を、こうちゃん（体力・機嫌）／親（体力・余裕）／おでかけ（ポイント・時間）の3つに分ける
   同じ人のステータスを1つの枠にまとめて、どちらの体力か探さなくてよいようにする
   before と after を並べて、「-18 減った」だけでなく「残り82になった」まで一目で分かるようにする

   ※ after は 0〜100 に丸めたあとの値なので、10 から 17 使うと「10 → 0（-17）」と出る
*/
export function buildChangeGroups(input: ChangeGroupsInput): ChangeGroup[] {
  const changes = input.changes;

  // まだ今回の行動結果がないときは、からっぽにする
  if (changes === null) {
    return [];
  }

  const before = input.before;

  /* 1行ぶんの表示を作る（statusName は、色を決めるために changeClass() へ渡す名前） */
  const makeRow = (label: string, statusName: string, beforeValue: number, afterValue: number, amount: number) => ({
    label,
    before: String(beforeValue),
    after: String(afterValue),
    changeText: formatChange(amount),
    className: changeClass(statusName, amount),
  });

  return [
    {
      // 見出しがあるので、中のラベルは「体力」「機嫌」だけでよい
      name: 'こうちゃん',
      groupClass: 'change-group--child',
      rows: [makeRow('体力', 'childEnergy', before.childEnergy, input.childEnergy, changes.childEnergy), makeRow('機嫌', 'childMood', before.childMood, input.childMood, changes.childMood)],
    },
    {
      name: '親',
      groupClass: 'change-group--parent',
      rows: [makeRow('体力', 'parentEnergy', before.parentEnergy, input.parentEnergy, changes.parentEnergy), makeRow('余裕', 'parentCalm', before.parentCalm, input.parentCalm, changes.parentCalm)],
    },
    {
      // こうちゃんでも親でもない「おでかけ全体」の情報
      name: 'おでかけ',
      groupClass: 'change-group--outing',
      rows: [
        makeRow('ポイント', 'outingPoint', before.outingPoint, input.outingPoint, changes.outingPoint),
        {
          // 時間だけは時計の形で出すので、makeRow は使わない（before は「分」で控えてあるので直す）
          label: '時間',
          before: removeLeadingZero(formatMinutesToTime(before.minutes)),
          after: removeLeadingZero(input.currentTime),
          changeText: `${formatChange(changes.minutes)}分`,
          className: changeClass('minutes', changes.minutes),
        },
      ],
    },
  ];
}
