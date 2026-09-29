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

/* ゴールしたときに、うた入りBGMをどうするかの答え

   none            … S+ランクではないので、何もしない
                     （Sランク・特殊エンドなどでは解放しない）
   alreadyUnlocked … S+ランクだが、もう解放済み（お知らせは出さない）
   newlyUnlocked   … このブラウザで、はじめての解放
                     （お知らせを出して、解放したことを保存する）
*/
export type SPlusSongUnlockResult = 'none' | 'alreadyUnlocked' | 'newlyUnlocked';

/* ゴールしたときに、うた入りBGMを解放するかどうかを決める

   endingRank           … judgeEnding() が決めたランク名
   hasUnlockedSPlusSong … いま画面が覚えている「解放済みかどうか」

   ここでは答えを返すだけで、保存（saveSPlusSongUnlocked）はしない
   保存とお知らせは、呼んだ側（pages/index.vue の unlockSPlusSongIfEarned）が受けもつ

   ※ 保存場所（localStorage）も読みなおしているのは、
     このページを開いたあとに、別のタブでS+を取っていることもあるため
     画面が覚えているほうが true なら、そこで決まるので読みにいかない（|| の短絡）
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

   ■ AとSだけにしている理由
     ・S+は92点から（composables/useScore.ts の judgeEnding）。
       Aランク（70点から）まで来ていれば「あと少し」の話になるが、
       Bランク（55点から）に出すと、遠すぎてヒントというより ただの煽りになる
     ・特殊エンド（いやいや3回以上）は、点数に関係なくS+にならないので出さない
       （ここに '特殊エンド' を足すと、取れないものを「もう少し」と言うことになる）

   ※ ランク名は judgeEnding() が返す文字とそろえてあるので、あちらを変えたときは ここも合わせて変えること */
const sPlusSongHintRanks = ['Aランク', 'Sランク'];

/* リザルト画面に、うた入りBGMのヒントを出すかどうか（出すなら true）

   endingRank           … judgeEnding() が決めたランク名
   hasUnlockedSPlusSong … いま画面が覚えている「解放済みかどうか」

   ・もう解放してあるなら出さない（曲を知っている人に、もう一度 隠して見せることになるため）
   ・A／Sランク以外では出さない（上の sPlusSongHintRanks の説明のとおり）

   ※ judgeSPlusSongUnlock() とちがって、localStorage は読みにいかない
     こちらは画面を描くたびに見られる（computed）ので、
     ・サーバー側では localStorage が無く、読んでも false にしかならない
     ・別のタブで解放しても、localStorage を読んだことは画面の作りなおしにつながらない
     という2つの理由から、画面が覚えている値だけで決める
     （別のタブでS+を取った直後に、こちらのタブでA／Sを出すと、1回だけヒントが出ることになるが、
       次にこのページを開いたときには onMounted で思い出すので、出なくなる） */
export function shouldShowSPlusSongHint(endingRank: string, hasUnlockedSPlusSong: boolean) {
  if (hasUnlockedSPlusSong) {
    return false;
  }

  return sPlusSongHintRanks.includes(endingRank);
}
