/* ============================================================
   ミニゲーム「枝の上のてんとう虫」の ご褒美「うた入り てんとうむしのよりみち」の曲の情報と、解放のしくみ

   エンドレス「ずっと ここにいて！」で 60秒たえると、サウンドトラックの 10 で聴けるようになる
   ミニゲームとサウンドトラックの2つのページで使うので、ここにまとめてある（utils/secretVocalSong.ts と同じ考えかた）

   ■ 保存するのは「解放したかどうか」だけ（一度解放したら戻さないので、false に戻す関数は わざと作っていない）
     記録（何秒たえたか）は、ミニゲームの自己ベスト endlessBestMs をそのまま使う（→ utils/minigameStorage.ts）
   ■ サーバーには localStorage が無いので、読み書きはブラウザで動いているときだけ
   ============================================================ */

import { loadMinigameBest } from '~/utils/minigameStorage';

/* エンドレスで、何ミリ秒たえたら解放するか（自己ベスト endlessBestMs と同じ、ミリ秒でくらべる） */
export const ladybugVocalSongUnlockMs = 60000;

/* 曲名（サウンドトラックと、ミニゲームの解放の知らせの両方で使う） */
export const ladybugVocalSongTitle = 'てんとうむしのよりみち ～うた入り～';

/* 音源（public/audio/ladybug-detour-vocal-bgm.mp3） */
export const ladybugVocalSongSrc = '/audio/ladybug-detour-vocal-bgm.mp3';

/* 解放したかどうかを保存しておく名前（localStorage のキー。ほかの保存の名前とぶつからないように） */
const ladybugVocalSongUnlockedStorageKey = 'kouchan-game-ladybug-vocal-song-unlocked';

/* このブラウザで解放済みかどうかを読む（'true' という文字で保存してある。無い・読めないときは false） */
export function loadHasUnlockedLadybugVocalSong() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return false;
  }

  try {
    return localStorage.getItem(ladybugVocalSongUnlockedStorageKey) === 'true';
  } catch {
    // ブラウザの設定で読めないことがある（そのときは、まだ解放していないあつかい）
    return false;
  }
}

/* うた入り「てんとうむしのよりみち」を解放したことを、このブラウザに保存する */
export function saveLadybugVocalSongUnlocked() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(ladybugVocalSongUnlockedStorageKey, 'true');
  } catch {
    // ブラウザの設定で保存できないことがある（そのプレイでは知らせが出る。次に開いたときは、自己ベストから もう一度 解放される）
  }
}

/* エンドレスの記録で、うた入りの曲を解放するかどうかを決める
   none … まだとどいていない／alreadyUnlocked … もう解放済み／newlyUnlocked … はじめての解放
   答えを返すだけで、保存とお知らせは呼んだ側が受けもつ（judgeSecretVocalSongUnlock() と同じ）
   ※ localStorage も読みなおすのは、別のタブで解放していることもあるため */
export type LadybugVocalSongUnlockResult = 'none' | 'alreadyUnlocked' | 'newlyUnlocked';

export function judgeLadybugVocalSongUnlock(recordMs: number, hasUnlockedLadybugVocalSong: boolean): LadybugVocalSongUnlockResult {
  if (recordMs < ladybugVocalSongUnlockMs) {
    return 'none';
  }

  if (hasUnlockedLadybugVocalSong || loadHasUnlockedLadybugVocalSong()) {
    return 'alreadyUnlocked';
  }

  return 'newlyUnlocked';
}

/* 保存してある自己ベストから、解放済みにそろえる（ページを開いたときに呼ぶ。知らせは出さない）

   この解放を足す前に、もう 60秒たえていた人には、もう一度 たえてもらわずに解放する
   答えは「いま解放済みか」（もとから解放済み・いま解放した、のどちらも true） */
export function unlockLadybugVocalSongFromSavedBest() {
  const savedBest = loadMinigameBest('ladybug-balance');
  const result = judgeLadybugVocalSongUnlock(Number(savedBest?.endlessBestMs) || 0, false);

  if (result === 'newlyUnlocked') {
    saveLadybugVocalSongUnlocked();
  }

  return result !== 'none' || loadHasUnlockedLadybugVocalSong();
}
