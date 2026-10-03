/* ============================================================
   ミニゲームのページの、矢印キーでのボタン移動

   はじめの画面と同じ動き（→ useKeyboardControls.ts の moveTitleFocusByArrow()）

     [ ← 戻る ]                    [ 🔊 サウンド ]
               [ メインのボタン 1 ]
               [ メインのボタン 2 ]

   ・↑ ↓ … メインのボタンを1つずつ。はしの先は上の行（さっき上の行でいたボタン。覚えていなければ ← 戻る）
   ・← → … 上の行の中を、となりへ（はしでは反対のはしへ回りこむ）
            メインのボタンにいるときは、← で ← 戻る・→ で サウンド へ
   ※ 音量スライダーでは何もしない（← → で音量を変えるため）
   ============================================================ */

const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/* 上の行からメインのボタンへ下りたとき、上の行のどのボタンにいたか（戻るときに同じボタンへ戻すため） */
let lastTopRowItem: HTMLElement | null = null;

/* 矢印キーでフォーカスを動かす（mainItems は無ければ からっぽでよい）
   動かしたときは true を返す（呼ぶ側は event.preventDefault() でスクロールを止める） */
export function moveMinigameFocusByArrow(event: KeyboardEvent, topRow: (HTMLElement | null | undefined)[], mainItems: (HTMLElement | null | undefined)[]) {
  if (!arrowKeys.includes(event.key)) {
    return false;
  }

  // 音量スライダーでは、音量を変える ← → などを、そのままブラウザにまかせる
  if ((event.target as HTMLElement | null)?.closest?.('.sound-control__slider')) {
    return false;
  }

  const top = topRow.filter((item): item is HTMLElement => !!item);
  const main = mainItems.filter((item): item is HTMLElement => !!item);

  if (top.length === 0 && main.length === 0) {
    return false;
  }

  const active = document.activeElement;
  const topIndex = top.findIndex((item) => item === active);
  const mainIndex = main.findIndex((item) => item === active);

  // どこにもフォーカスが無い（画面のすき間を押したあと など）ときは、いちばん上のメインのボタンへ
  if (topIndex === -1 && mainIndex === -1) {
    (main[0] ?? top[0])?.focus();
    return true;
  }

  // メインのボタンにいるとき
  if (mainIndex !== -1) {
    // 上の行へ戻るときの行き先（さっき上の行でいたボタン。覚えていなければ左の「← 戻る」）
    const backToTop = lastTopRowItem && top.includes(lastTopRowItem) ? lastTopRowItem : top[0];

    if (event.key === 'ArrowUp') {
      (main[mainIndex - 1] ?? backToTop ?? main[main.length - 1])?.focus();
    } else if (event.key === 'ArrowDown') {
      (main[mainIndex + 1] ?? backToTop ?? main[0])?.focus();
    } else if (event.key === 'ArrowLeft') {
      top[0]?.focus();
    } else {
      top[top.length - 1]?.focus();
    }

    return true;
  }

  // 上の行にいるとき（メインのボタンへ下りるときは、いまいた場所を覚えておく）
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (main.length > 0) {
      lastTopRowItem = top[topIndex] ?? null;
    }

    (event.key === 'ArrowDown' ? main[0] : main[main.length - 1])?.focus();
  } else {
    const step = event.key === 'ArrowLeft' ? -1 : 1;

    top[(topIndex + step + top.length) % top.length]?.focus();
  }

  return true;
}
