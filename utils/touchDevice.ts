/* ============================================================
   指で操作する画面（スマホ・タブレット）かどうか

   マウスが無く（hover: none）、指でさわる（pointer: coarse）画面のとき true
   ・音量スライダーを出さない（音量は本体のボタンで変える）
   ・スライダーが無いと音量を戻せないので、前回の音量は思い出さずに100%で始める
   ※ サーバー側ではいつも false なので、onMounted のあとで呼ぶこと
   ============================================================ */

/* 見分ける条件（CSS の @media (hover: none) and (pointer: coarse) と同じ） */
const touchOnlyQuery = '(hover: none) and (pointer: coarse)';

export function isTouchOnlyDevice() {
  if (!import.meta.client) {
    return false;
  }

  try {
    return window.matchMedia(touchOnlyQuery).matches;
  } catch {
    return false;
  }
}

/* 開いたあとで、指で操作する画面かどうかが切りかわったら、onChange を呼ぶ
   （DevTools のスマホ表示を切りかえたとき・タブレットにもなるPCでマウスを付けはずししたときなど）
   返した関数を呼ぶと、見るのをやめる（部品が消えるときに呼ぶこと）
   ※ 見られないブラウザでは何もしない（開いたときの判定のまま） */
export function watchTouchOnlyDevice(onChange: (isTouchOnly: boolean) => void) {
  if (!import.meta.client) {
    return () => {};
  }

  try {
    const mediaQuery = window.matchMedia(touchOnlyQuery);
    const handleChange = (event: MediaQueryListEvent) => onChange(event.matches);

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  } catch {
    return () => {};
  }
}
