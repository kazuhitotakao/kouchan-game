/* ============================================================
   サウンドトラックの「NEW」の印（新しく解放して、まだサウンドトラックで見ていない曲）

   ミニゲームの NEW（utils/minigameStorage.ts）と同じ考えかた
   ・曲を解放したところ（本編・ミニゲーム）で markNewSoundtrackTrack() を呼んで覚えておく
   ・タイトルの「♪ サウンドトラック」と、サウンドトラックの曲のカードに NEW を出す
   ・サウンドトラックを開いたら消す（そのとき画面に出ている NEW は、ページを出るまで残る）

   ■ NEW にするのは、遊んでいる最中に はじめて解放したときだけ
     保存してある記録から黙って解放済みにそろえたとき（unlockSecretVocalSongFromSavedBest() など）は、NEW にしない
   ■ 読み書きはブラウザで動いているときだけ。読めない・書けないときは、NEW が出ないだけ
   ============================================================ */

/* NEW にできる曲（はじめは聴けず、あとから解放する曲。サウンドトラックの曲の newKey とそろえる）
   secret-spot    … 04 こもれびの奥で（秘密の小道を見つける）
   ladybug-detour … 05 てんとうむしのよりみち（てんとう虫を見つける）
   secret-vocal   … 09 こもれびの奥で ～うた入り～（どこまで行ける？ で 300m）
   ladybug-vocal  … 10 てんとうむしのよりみち ～うた入り～（ずっと ここにいて！ で 60秒）
   s-plus         … 11 きょうの大冒険、おしまい！ ～うた入り～（S+ランク） */
export const soundtrackNewKeys = ['secret-spot', 'ladybug-detour', 'secret-vocal', 'ladybug-vocal', 's-plus'] as const;

export type SoundtrackNewKey = (typeof soundtrackNewKeys)[number];

const newStorageKey = 'kouchan-game-soundtrack-new';

function isSoundtrackNewKey(value: unknown): value is SoundtrackNewKey {
  return soundtrackNewKeys.includes(value as SoundtrackNewKey);
}

/* NEW の曲の一覧を読む（まだ1つも無い・読めないときは、からっぽ） */
export function loadNewSoundtrackTracks(): SoundtrackNewKey[] {
  if (!import.meta.client) {
    return [];
  }

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(newStorageKey) ?? '[]');

    // こわれた記録や、いまは無い曲の名前は読みとばす
    return Array.isArray(saved) ? saved.filter(isSoundtrackNewKey) : [];
  } catch {
    return [];
  }
}

/* 曲を解放したことを、NEW の一覧に入れる（はじめて解放したときだけ呼ぶ） */
export function markNewSoundtrackTrack(key: SoundtrackNewKey) {
  if (!import.meta.client) {
    return;
  }

  const newKeys = loadNewSoundtrackTracks();

  if (newKeys.includes(key)) {
    return;
  }

  try {
    localStorage.setItem(newStorageKey, JSON.stringify([...newKeys, key]));
  } catch {
    // 保存できなくても、曲はふつうに聴ける（NEW が出ないだけ）
  }
}

/* NEW の印をぜんぶ消す（サウンドトラックを開いたときに呼ぶ） */
export function clearNewSoundtrackTracks() {
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.removeItem(newStorageKey);
  } catch {
    // 消せなくても、次に開いたとき、もう一度 NEW が出るだけ
  }
}
