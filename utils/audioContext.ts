/* ============================================================
   音の作業台（AudioContext）を、サイト全体で1つだけ使う（ゲーム本編・ミニゲーム・サウンドトラック）

   ページごとに作って閉じていたころは、iPhone で作る・閉じるたびにスピーカーへの出口が組みなおされて、
   画面を切りかえるたびに音が「プツプツ」ととぎれていた
   そこで、はじめて音を鳴らすときに1つだけ作り、閉じずに使い回す
   ページを離れるときは、そのページの mp3 の音を作業台から外すだけにする（→ elementVolume.ts の releaseElement()）

   ※ お休み中（suspended）なら、呼ぶだけで起こす（await はしない。待たせると、画面の切り替わりが遅れるため）
   ============================================================ */
let sharedAudioContext: AudioContext | null = null;

/* 作業台を返す（はじめて呼ばれたときだけ作る。音が使えない環境では null）
   ※ 音OFFのときに作らないようにするのは、呼ぶ側の仕事（→ useAudio.ts の getAudioContext()） */
export function getSharedAudioContext() {
  if (!import.meta.client) {
    return null;
  }

  try {
    // 閉じられていたときも、作りなおす（閉じた作業台は、もう音を鳴らせないため）
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContext();
    }

    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }

    return sharedAudioContext;
  } catch {
    // 音が使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}
