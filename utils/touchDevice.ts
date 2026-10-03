/* ============================================================
   指で操作する画面（スマホ・タブレット）かどうか

   マウスが無く（hover: none）、指でさわる（pointer: coarse）画面のとき true
   ・音量スライダーを出さない（音量は本体のボタンで変える）
   ・スライダーが無いと音量を戻せないので、前回の音量は思い出さずに100%で始める
   ※ サーバー側ではいつも false なので、onMounted のあとで呼ぶこと
   ============================================================ */
export function isTouchOnlyDevice() {
  if (!import.meta.client) {
    return false;
  }

  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}
