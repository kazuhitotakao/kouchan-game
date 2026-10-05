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

/* ============================================================
   ボタンが横にも並ぶ画面の、矢印キーでのボタン移動（とばないで！ のステージえらび・結果の画面）

     [ ← 戻る ]                    [ 🔊 サウンド ]
          [1] [2] [3] [4] [5]
          [6] [7] [8] [9] [10]
          [ ずっと ここにいて！ ]
          [      はじめる      ]

   画面に出ている位置を見て、押した向きにある いちばん近いボタンへ動かす
   ・← → … 同じ行の、となりのボタンへ
            同じ行に無いとき … 上の行は反対のはしへ回りこむ
                                 メインのボタンは、並び順で前・次の、同じ大きさのボタンへ（[5] → で [6]。ほかは動かさない）
   ・↑ ↓ … 上・下の行の、いちばん近いボタンへ（[3] ↓ で [8]。横長のボタンからは、まん中に近いボタンへ）
            ↑ ↓ で来たボタンからは、反対の向きで、来たボタンへ戻る（[7] ↓「ずっと ここにいて！」↑ で [7] へ）
            メインのボタンから ↑ で上の行へ上がるときは、どの位置からでも ← 戻る へ（サウンドへは、そこから →）
            いちばん下から ↓ は上の行（← 戻る）へ、上の行から ↑ はいちばん下のボタンへ回りこむ
   ※ 音量スライダーでは何もしない（← → で音量を変えるため）
   ============================================================ */

/* ↑ ↓ で動いたとき、動いた先のボタンに「どこから来たか」を覚えておく
   （[7] から ↓ で「ずっと ここにいて！」へ来たら、「ずっと ここにいて！」の ↑ の戻り先は [7]）
   ボタンが画面から消えたら、いっしょに消えるよう WeakMap にしている */
const verticalOrigins = new WeakMap<HTMLElement, { ArrowUp?: HTMLElement; ArrowDown?: HTMLElement }>();

/* ボタンの、押した向きへの「遠さ」（その向きに無いときは null） */
function getDirectionalDistance(from: DOMRect, to: DOMRect, key: string) {
  const fromCenterX = from.left + from.width / 2;
  const fromCenterY = from.top + from.height / 2;
  const toCenterX = to.left + to.width / 2;
  const toCenterY = to.top + to.height / 2;

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    // 同じ行（高さが半分以上 重なっている）にあるものだけ
    const overlap = Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top);

    if (overlap < Math.min(from.height, to.height) / 2) {
      return null;
    }

    const isAhead = key === 'ArrowRight' ? toCenterX > fromCenterX : toCenterX < fromCenterX;

    return isAhead ? Math.abs(toCenterX - fromCenterX) : null;
  }

  // 上・下 … 中心が、いまのボタンの高さの半分より先にあるものだけ（横にならんだボタンどうしは、選ばない）
  const isAhead = key === 'ArrowDown' ? toCenterY - fromCenterY > from.height / 2 : fromCenterY - toCenterY > from.height / 2;

  if (!isAhead) {
    return null;
  }

  // 行の近さ（すき間）を先に見て、そのあと横のずれ（重なっていなければ、はなれているぶん）を見る
  const gapY = Math.max(0, key === 'ArrowDown' ? to.top - from.bottom : from.top - to.bottom);
  const gapX = Math.max(0, to.left - from.right, from.left - to.right);

  return gapY + gapX * 2 + Math.abs(toCenterX - fromCenterX) * 0.1;
}

/* 矢印キーでフォーカスを動かす（並びかたは上の図。mainItems は上から・左から順）
   動かしたときは true を返す（呼ぶ側は event.preventDefault() でスクロールを止める） */
export function moveMinigameFocusSpatially(event: KeyboardEvent, topRow: (HTMLElement | null | undefined)[], mainItems: (HTMLElement | null | undefined)[]) {
  if (!arrowKeys.includes(event.key)) {
    return false;
  }

  // 音量スライダーでは、音量を変える ← → などを、そのままブラウザにまかせる
  if ((event.target as HTMLElement | null)?.closest?.('.sound-control__slider')) {
    return false;
  }

  // 画面に出ていないもの（display: none など、大きさが 0 のもの）は数えない
  const isShown = (item: HTMLElement | null | undefined): item is HTMLElement => !!item && item.getClientRects().length > 0;
  const top = topRow.filter(isShown);
  const main = mainItems.filter(isShown);
  const items = [...top, ...main];

  if (items.length === 0) {
    return false;
  }

  const active = document.activeElement as HTMLElement | null;

  // どこにもフォーカスが無い（画面のすき間を押したあと など）ときは、いちばん上のメインのボタンへ
  if (!active || !items.includes(active)) {
    (main[0] ?? top[0])?.focus();
    return true;
  }

  const from = active.getBoundingClientRect();
  const isVertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
  let nearest: HTMLElement | null = null;
  let nearestDistance = Infinity;

  // ↑ ↓ で来たボタンからは、来たボタンへ戻る（まだ画面にあって、押した向きにあるときだけ）
  const origin = isVertical ? verticalOrigins.get(active)?.[event.key as 'ArrowUp' | 'ArrowDown'] : undefined;

  if (origin && items.includes(origin) && getDirectionalDistance(from, origin.getBoundingClientRect(), event.key) !== null) {
    nearest = origin;
  } else {
    for (const item of items) {
      if (item === active) {
        continue;
      }

      const distance = getDirectionalDistance(from, item.getBoundingClientRect(), event.key);

      if (distance !== null && distance < nearestDistance) {
        nearest = item;
        nearestDistance = distance;
      }
    }
  }

  // メインのボタンから上の行へ上がるときは、いつも ← 戻る へ（右はしのボタンからでも、サウンドへは行かない）
  if (nearest && event.key === 'ArrowUp' && main.includes(active) && top.includes(nearest)) {
    nearest = top[0] ?? nearest;
  }

  if (nearest) {
    // ↑ ↓ で動いたら、動いた先に「反対の向きの戻り先」として、いまのボタンを覚えておく
    if (isVertical) {
      const opposite = event.key === 'ArrowDown' ? 'ArrowUp' : 'ArrowDown';

      verticalOrigins.set(nearest, { ...verticalOrigins.get(nearest), [opposite]: active });
    }

    nearest.focus();
    return true;
  }

  // その向きに何も無いとき
  const topIndex = top.indexOf(active);
  const mainIndex = main.indexOf(active);

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const step = event.key === 'ArrowLeft' ? -1 : 1;

    if (topIndex !== -1) {
      top[(topIndex + step + top.length) % top.length]?.focus();
      return true;
    }

    // 並び順で前・次のボタンへ（同じ大きさのボタンのときだけ。[5] → [6] のように、ならびの続きのときだけ動かす
    // 大きさのちがうボタン（「ずっと ここにいて！」→「はじめる」など）へは、← → では動かさない）
    const neighbor = main[mainIndex + step];
    const neighborRect = neighbor?.getBoundingClientRect();

    if (neighbor && neighborRect && Math.abs(neighborRect.width - from.width) <= 2 && Math.abs(neighborRect.height - from.height) <= 2) {
      neighbor.focus();
    }
  } else if (event.key === 'ArrowDown') {
    (top[0] ?? main[0])?.focus();
  } else {
    (main[main.length - 1] ?? top[top.length - 1])?.focus();
  }

  return true;
}
