/* ============================================================
   S+ランク限定「うた入りエンディングBGM」の曲の情報と、解放のしくみ

   ゲーム本編（pages/index.vue）とサウンドトラック（pages/soundtrack.vue）の
   2つのページで、同じ曲・同じ保存場所を使うので、ここ1か所にまとめてある
   （保存場所の名前が2つのページでずれると、
     「S+を取ったのに、サウンドトラックでは聴けない」ということが起きてしまうため）

   ■ 保存するのは「解放したかどうか」だけ
     スコアやアイテムなど、ゲームの記録は保存しない
     一度解放したら、もう一度あそんでも、ブラウザを閉じても、ロックには戻さない
     （そのため、false に戻す関数は わざと作っていない）

   ■ localStorage はブラウザにしか無い
     Nuxtはサーバー側でも画面を組み立てるが、サーバーには localStorage が無い
     そこで、読み書きは import.meta.client（ブラウザで動いているとき）だけ行う
     呼ぶ側も、onMounted やゴールしたときなど、ブラウザで動くところから呼ぶ
   ============================================================ */

/* S+ランク専用の曲名
   サウンドトラックの曲名と、リザルト画面の小さな表示の両方で使う */
export const sPlusSongTitle = 'きょうの大冒険、おしまい！ ～うた入り～';

/* S+ランク専用の音源
   public/audio/result-bgm-splus.mp3 は、URLでは /audio/result-bgm-splus.mp3 になる */
export const sPlusSongSrc = '/audio/result-bgm-splus.mp3';

/* 解放したかどうかを保存しておく名前（localStorageのキー）

   ・ゲーム本編のサウンド設定（kouchan-game-sound-enabled）
   ・サウンドトラックの音量・サウンド・リピート（kouchan-soundtrack-〜）
   のどれともぶつからない名前にしてある */
const sPlusSongUnlockedStorageKey = 'kouchan-game-splus-song-unlocked';

/* このブラウザで、うた入りBGMを解放済みかどうかを読む（解放済みなら true）

   localStorage には文字しか入らないので、'true' という文字で保存してある
   保存したことが無いとき（null）や、読めなかったときは、まだ解放していない（false）としてあつかう */
export function loadHasUnlockedSPlusSong() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return false;
  }

  try {
    return localStorage.getItem(sPlusSongUnlockedStorageKey) === 'true';
  } catch {
    // ブラウザの設定で読めないことがある（そのときは、まだ解放していないあつかい）
    return false;
  }
}

/* うた入りBGMを解放したことを、このブラウザに保存する */
export function saveSPlusSongUnlocked() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(sPlusSongUnlockedStorageKey, 'true');
  } catch {
    // ブラウザの設定で保存できないことがある
    // 保存できなくても、そのリザルト画面ではうた入りBGMがふつうに流れる
  }
}
