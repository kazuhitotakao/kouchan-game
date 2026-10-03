/* ============================================================
   S+ランク限定「うた入りエンディングBGM」の曲の情報と、解放のしくみ

   ゲーム本編とサウンドトラックで同じ保存場所を使うので、ここにまとめてある
   （名前がずれると「S+を取ったのに、サウンドトラックでは聴けない」ことが起きるため）

   ■ 保存するのは「解放したかどうか」だけ（一度解放したら戻さないので、false に戻す関数は わざと作っていない）
   ■ サーバーには localStorage が無いので、読み書きはブラウザで動いているときだけ
   ============================================================ */

/* S+ランク専用の曲名（サウンドトラックと、リザルト画面の両方で使う） */
export const sPlusSongTitle = 'きょうの大冒険、おしまい！ ～うた入り～';

/* S+ランク専用の音源（public/audio/result-bgm-splus.mp3） */
export const sPlusSongSrc = '/audio/result-bgm-splus.mp3';

/* 解放したかどうかを保存しておく名前（localStorage のキー。ほかの保存の名前とぶつからないように） */
const sPlusSongUnlockedStorageKey = 'kouchan-game-splus-song-unlocked';

/* このブラウザで解放済みかどうかを読む（'true' という文字で保存してある。無い・読めないときは false） */
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
    // ブラウザの設定で保存できないことがある（そのリザルト画面では、ふつうに流れる）
  }
}

/* ゴールしたときに、うた入りBGMをどうするかの答え
   none … S+ランクではない／alreadyUnlocked … もう解放済み／newlyUnlocked … はじめての解放
*/
export type SPlusSongUnlockResult = 'none' | 'alreadyUnlocked' | 'newlyUnlocked';

/* ゴールしたときに、うた入りBGMを解放するかどうかを決める
   答えを返すだけで、保存とお知らせは呼んだ側が受けもつ
   ※ localStorage も読みなおすのは、別のタブでS+を取っていることもあるため
*/
export function judgeSPlusSongUnlock(endingRank: string, hasUnlockedSPlusSong: boolean): SPlusSongUnlockResult {
  if (endingRank !== 'S+ランク') {
    return 'none';
  }

  if (hasUnlockedSPlusSong || loadHasUnlockedSPlusSong()) {
    return 'alreadyUnlocked';
  }

  return 'newlyUnlocked';
}

/* リザルト画面に「S+ランクを とると、なにかあるみたい…」のヒントを出すランク
   AとSだけ（Bでは遠すぎてヒントではなく煽りになり、特殊エンドは S+ にならないため）
   ※ ランク名は judgeEnding() が返す文字とそろえること */
const sPlusSongHintRanks = ['Aランク', 'Sランク'];

/* リザルト画面に、うた入りBGMのヒントを出すかどうか（もう解放してあるなら出さない）
   ※ computed から呼ばれるので、localStorage は読まず、画面が覚えている値だけで決める
     （サーバーでは読めず、読んでも画面の作りなおしにつながらないため） */
export function shouldShowSPlusSongHint(endingRank: string, hasUnlockedSPlusSong: boolean) {
  if (hasUnlockedSPlusSong) {
    return false;
  }

  return sPlusSongHintRanks.includes(endingRank);
}
