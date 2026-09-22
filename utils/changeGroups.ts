/* ============================================================
   「今回の変化（合計）」の表示データ作り

   ゲーム本編（pages/index.vue）にあった changeGroups の
   「表示のならびを組み立てているところ」だけを取り出してある

   ここにあるのは「行動する前の値・いまの値・増減 → 画面にならべる形」の変換だけで、
   ステータスの値を書きかえたり、ゲームのルールを決めたりはしない

   増減の文字と色は utils/statusChange.ts、時刻の変換は utils/gameTime.ts、
   できあがりの形（ChangeGroup）は types/game.ts のものをそのまま使う
   ============================================================ */

import { formatMinutesToTime, removeLeadingZero } from '~/utils/gameTime';
import { changeClass, formatChange } from '~/utils/statusChange';
import type { ChangeGroup, StatusChanges } from '~/types/game';

/* 行動する前に控えておいた、そのときのステータス

   StatusChanges と同じ6つを持っているが、意味がちがう
   ・StatusChanges  … 「いくつ増えた・減った」の増減
   ・StatusSnapshot … 「そのときいくつだったか」の値そのもの
*/
export type StatusSnapshot = {
  childEnergy: number;
  childMood: number;
  outingPoint: number;
  parentEnergy: number;
  parentCalm: number;
  minutes: number;
};

/* 表示データを作るために必要なもの
   changes … 今回の増減（null なら、まだ今回の行動結果がない）
   before  … 行動する前の値
   その他  … 行動したあとの、いま画面に出ている値
*/
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

/* 中央の「今回の変化」を、誰の情報かで3つのまとまりに分けたもの

   ① こうちゃん … 体力・機嫌
   ② 親         … 体力・余裕
   ③ おでかけ   … ポイント・時間

   「こうちゃんの体力」なのか「親の体力」なのかを探さなくてよいように、
   同じ人のステータスを1つの枠にまとめている
   グループの見出しが名前を言ってくれるので、中のラベルは「体力」だけでよい

   1グループは { name, groupClass, rows } の3つを持つ
   ・name       … 「こうちゃん」などの見出し
   ・groupClass … 枠の色を変えるためのCSSクラス名
   ・rows       … その人のステータス2つ

   rows の1行ぶんは、次の5つ
   ・label      … 「体力」などの項目名
   ・before     … 行動する前の値（statusBefore に控えてあるもの）
   ・after      … 行動したあとの値（いま画面に出ている現在値そのもの）
   ・changeText … 「+6」「-18」の形にした増減
   ・className  … 増減の色（良い・悪い・変化なし）

   before と after を並べて出すことで、
   「-18 減った」だけでなく「残り82になった」まで一目で分かるようにする

   ※ after には fixAllStatus() で0〜100に丸めたあとの現在値を使う
     たとえば 親の体力が 10 のときに 17 使うと、内部の計算では -7 になるが、
     画面のステータスは 0 なので「10 → 0（-17）」と出る
     （増減の -17 は statusChanges にそのまま残っているので、ここは変えない）

   ※ この関数は表示を作るだけで、ゲームの値は書きかえない
*/
export function buildChangeGroups(input: ChangeGroupsInput): ChangeGroup[] {
  const changes = input.changes;

  // まだ今回の行動結果がないときは、からっぽにする
  if (changes === null) {
    return [];
  }

  // 毎回 input.before と書かなくてよいように、行動前の控えを取り出しておく
  const before = input.before;

  /* 1行ぶんの表示を作る小さな道具
     同じ書きかたを6回くり返さなくてよくなる

     label      … 画面に出す名前（グループ見出しがあるので「体力」だけでよい）
     statusName … 色を決めるために changeClass() へ渡す中の名前
     beforeValue … 行動する前の値
     afterValue  … 行動したあとの値（0〜100に丸めたあとの、いま画面に出ている値）
     amount      … 今回の増減
  */
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
          // 時間だけは数ではなく時計の形で出すので、makeRow は使わない
          // before は「分」で控えてあるので formatMinutesToTime() で 09:00 の形に直し、
          // after は画面の時計と同じ currentTime をそのまま使う
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
