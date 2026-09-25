/* ============================================================
   ミニゲームのページの、矢印キーでのボタン移動

   ミニゲームの一覧（pages/minigame/index.vue）と、
   それぞれのミニゲームのページ（pages/minigame/<id>.vue）で使う

   はじめの画面（A画面・B画面）と同じ動きにしてある（→ composables/useKeyboardControls.ts の moveTitleFocusByArrow()）
   画面は「上の行（← 戻る ／ サウンド）」と「その下のメインのボタン（カード・はじめる など）」の2段

     [ ← 戻る ]                    [ 🔊 サウンド ]

               [ メインのボタン 1 ]
               [ メインのボタン 2 ]   … ミニゲームの一覧のカードは、上から順に何枚でも

   ・↑ ↓ … メインのボタンを上下に1つずつ動く
            いちばん上のメインのボタンで ↑・いちばん下で ↓ を押すと、上の行へ戻る
            上の行へ戻る先は、さっき上の行でいたボタン（サウンドから下りてきたなら、サウンドへ戻る）
            覚えていないとき・もうそのボタンが無いとき（ページが変わった など）は、左（← 戻る）へ
            上の行にいるときは、↓ でいちばん上の、↑ でいちばん下のメインのボタンへ
   ・← → … 上の行の中を、となりへ1つずつ動く（はしまで来たら反対のはしへ回りこむ）
            メインのボタンにいるときは、← で左上（← 戻る）・→ で右上（サウンド）へ
   ・どこにもフォーカスが無いときは、いちばん上のメインのボタンへ（無ければ ← 戻る へ）

   ■ 音量スライダーを選んでいるときは、何もしない
     スライダーは ← → などで音量を変えるので、ブラウザ本来の動きにまかせる（はじめの画面と同じ）
   ============================================================ */

const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/* 上の行から ↑ ↓ でメインのボタンへ下りたとき、上の行のどのボタンにいたか
   上の行へ戻るときに、同じボタンへ戻すために覚えておく（はじめの画面の lastTitleTopItem と同じ考えかた）
   ボタンそのものを覚えているので、ページが変わると、もう画面に無いボタンになり、左（← 戻る）へ戻る */
let lastTopRowItem: HTMLElement | null = null;

/* 矢印キーでフォーカスを動かす

   topRow    … 上の行のボタン（左から順。← 戻る ／ サウンド）
   mainItems … メインのボタン（上から順）。無いとき（まだ解放していないページなど）は からっぽでよい
   動かしたとき（矢印キーを使ったとき）は true を返す。呼ぶ側は event.preventDefault() でページのスクロールを止める */
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
