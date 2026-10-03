/* ============================================================
   ミニゲーム「どこまで行ける？」の ご褒美「うた入り こもれびの奥で」の曲の情報と、解放のしくみ

   ミニゲームとサウンドトラックの2つのページで使うので、ここにまとめてある（utils/sPlusSong.ts と同じ考えかた）
   ミニゲームで ずっと流れている曲に、うたが付いたものが出てくる、というご褒美

   ■ 保存するのは「解放したかどうか」だけ（一度解放したら戻さないので、false に戻す関数は わざと作っていない）
   ■ サーバーには localStorage が無いので、読み書きはブラウザで動いているときだけ
   ============================================================ */

/* 1回のプレイで、何メートルまで行けたら解放するか
   結果のひとことが「小道の名人です！」になるのと同じ 300m（名人と言われたときに、ごほうびも出るように）
   手で調整したレベル表（Lv.7・350m まで）の中で とどく */
export const secretVocalSongUnlockDistance = 300;

/* 曲名（サウンドトラックと、ミニゲームの解放の知らせの両方で使う） */
export const secretVocalSongTitle = 'こもれびの奥で ～うた入り～';

/* 音源（public/audio/secret-bgm-vocal.mp3） */
export const secretVocalSongSrc = '/audio/secret-bgm-vocal.mp3';

/* 解放したかどうかを保存しておく名前（localStorage のキー。ほかの保存の名前とぶつからないように） */
const secretVocalSongUnlockedStorageKey = 'kouchan-game-secret-vocal-song-unlocked';

/* このブラウザで解放済みかどうかを読む（'true' という文字で保存してある。無い・読めないときは false） */
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
    // ブラウザの設定で保存できないことがある（そのプレイでは知らせが出るが、次に開くとロックに戻る）
  }
}

/* 遊んでいる最中に、うた入りBGMを解放するかどうかを決める
   none … まだとどいていない／alreadyUnlocked … もう解放済み／newlyUnlocked … はじめての解放
   答えを返すだけで、保存とお知らせは呼んだ側が受けもつ（judgeSPlusSongUnlock() と同じ）
   ※ localStorage も読みなおすのは、別のタブで解放していることもあるため */
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
