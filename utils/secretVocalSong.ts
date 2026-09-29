/* ============================================================
   ミニゲーム「どこまで行ける？」の ご褒美「うた入り こもれびの奥で」の曲の情報と、解放のしくみ

   ミニゲームのページ（pages/minigame/secret-path.vue）とサウンドトラック（pages/soundtrack.vue）の
   2つのページで、同じ曲・同じ保存場所を使うので、ここ1か所にまとめてある
   （S+ランクのうた入りエンディングBGM（utils/sPlusSong.ts）と、まったく同じ考えかた）

   ■ なぜ「こもれびの奥で」のうた入りなのか
     このミニゲームで遊んでいるあいだ、ずっと流れているのが「こもれびの奥で」
     ずっと聴いてきた曲に、うたが付いたものが出てくる、というご褒美にしている

   ■ 保存するのは「解放したかどうか」だけ
     距離などの記録は、今までどおり utils/minigameStorage.ts のほうで持つ
     一度解放したら、もう一度あそんでも、ブラウザを閉じても、ロックには戻さない
     （そのため、false に戻す関数は わざと作っていない）

   ■ localStorage はブラウザにしか無い
     Nuxtはサーバー側でも画面を組み立てるが、サーバーには localStorage が無い
     そこで、読み書きは import.meta.client（ブラウザで動いているとき）だけ行う
     呼ぶ側も、onMounted や遊んでいる最中など、ブラウザで動くところから呼ぶ
   ============================================================ */

/* 何メートルまで行けたら解放するか

   ■ この数字の決めかた
     ・結果のひとこと（pages/minigame/secret-path.vue の resultComment）で
       いちばん上の「小道の名人です！」が出るのと同じ 300m にそろえてある
       （名人と言われたときに、ごほうびも いっしょに出るようにするため）
     ・data/secretPathEndless.ts の速さで計算すると、加速なしで約1分25秒ぶん進んだところ（Lv.7）
     ・手で調整したレベル表（secretPathEndlessLevels）は Lv.7（350m）までなので、
       そこから先の「自動で きびしくなっていく」ところに入る前に とどく
     ここを変えたくなったら、この数字だけを書きかえればよい
     （ミニゲームの画面のヒント「🔒 300m まで行くと…」も、この数字から出している）

   ※ 1回のプレイで、ここまで行けたときに解放する（何回かの合計ではない） */
export const secretVocalSongUnlockDistance = 300;

/* 曲名
   サウンドトラックの曲名と、ミニゲームの解放の知らせの両方で使う */
export const secretVocalSongTitle = 'こもれびの奥で ～うた入り～';

/* 音源
   public/audio/secret-bgm-vocal.mp3 は、URLでは /audio/secret-bgm-vocal.mp3 になる */
export const secretVocalSongSrc = '/audio/secret-bgm-vocal.mp3';

/* 解放したかどうかを保存しておく名前（localStorageのキー）

   ・S+ランクのうた入りBGM（kouchan-game-splus-song-unlocked）
   ・ミニゲームの解放と自己ベスト（kouchan-game-minigames-unlocked / kouchan-game-minigame-best-〜）
   ・サウンドトラックの音量・サウンド・リピート（kouchan-soundtrack-〜）
   のどれともぶつからない名前にしてある */
const secretVocalSongUnlockedStorageKey = 'kouchan-game-secret-vocal-song-unlocked';

/* このブラウザで、うた入り「こもれびの奥で」を解放済みかどうかを読む（解放済みなら true）

   localStorage には文字しか入らないので、'true' という文字で保存してある
   保存したことが無いとき（null）や、読めなかったときは、まだ解放していない（false）としてあつかう */
export function loadHasUnlockedSecretVocalSong() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return false;
  }

  try {
    return localStorage.getItem(secretVocalSongUnlockedStorageKey) === 'true';
  } catch {
    // ブラウザの設定で読めないことがある（そのときは、まだ解放していないあつかい）
    return false;
  }
}

/* うた入り「こもれびの奥で」を解放したことを、このブラウザに保存する */
export function saveSecretVocalSongUnlocked() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(secretVocalSongUnlockedStorageKey, 'true');
  } catch {
    // ブラウザの設定で保存できないことがある
    // 保存できなくても、そのプレイでは解放の知らせが出る（次に開くと、また ロックに戻る）
  }
}

/* 遊んでいる最中に、うた入りBGMを解放するかどうかを決める

   distanceMeters            … いま進んだ距離（メートル。切り捨てた整数）
   hasUnlockedSecretVocalSong … いま画面が覚えている「解放済みかどうか」

   none            … まだ距離がとどいていない
   alreadyUnlocked … とどいたが、もう解放済み（お知らせは出さない）
   newlyUnlocked   … このブラウザで、はじめての解放
                     （お知らせを出して、解放したことを保存する）

   ここでは答えを返すだけで、保存（saveSecretVocalSongUnlocked）はしない
   保存とお知らせは、呼んだ側（pages/minigame/secret-path.vue）が受けもつ
   （utils/sPlusSong.ts の judgeSPlusSongUnlock() と、同じ受けもちかた）

   ※ 保存場所（localStorage）も読みなおしているのは、
     このページを開いたあとに、別のタブで解放していることもあるため
     画面が覚えているほうが true なら、そこで決まるので読みにいかない（|| の短絡） */
export type SecretVocalSongUnlockResult = 'none' | 'alreadyUnlocked' | 'newlyUnlocked';

export function judgeSecretVocalSongUnlock(distanceMeters: number, hasUnlockedSecretVocalSong: boolean): SecretVocalSongUnlockResult {
  if (distanceMeters < secretVocalSongUnlockDistance) {
    return 'none';
  }

  if (hasUnlockedSecretVocalSong || loadHasUnlockedSecretVocalSong()) {
    return 'alreadyUnlocked';
  }

  return 'newlyUnlocked';
}
