/* ============================================================
   指で操作する画面（スマホ・タブレット）かどうか

   マウスが無く（hover: none）、指でさわる（pointer: coarse）画面のとき true
   A画面の「ホーム画面に追加」の案内（assets/css/game/base.css の .install-hint）と同じ見分けかた

   ■ 使っているところ
     ・音量スライダーを出すかどうか（components/game/SoundControl.vue）
       スマホでは、音量は本体の音量ボタンで変えるものなので、スライダーは出さず、ミュートボタンだけにする
     ・前回の音量を思い出すとき（composables/useAudio.ts・pages/soundtrack.vue）
       スライダーが無いと音量を戻せないので、スマホでは100%で始める

   ※ サーバー側では画面が分からないので、いつも false を返す
     ブラウザで動きはじめてから（onMounted のあとで）呼ぶこと
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
