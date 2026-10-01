/* ============================================================
   音の作業台（AudioContext）を、サイト全体で1つだけ使う

   ゲーム本編（composables/useAudio.ts。ミニゲームのページもこれを使う）と
   サウンドトラック（pages/soundtrack.vue）は、どちらもここから作業台をもらう

   ■ 何が起きていたか
     前は、ページごとに作業台を作って、ページを離れるときに閉じていた
     （タイトル ⇄ ミニゲーム一覧 ⇄ 秘密の小道 ⇄ サウンドトラック、と移るたびに 作る → 閉じる）
     iPhone では、作業台を作る・閉じるたびに、音を出すしくみ（スピーカーへの出口）が組みなおされるので、
     そのたびに、鳴っている音や鳴りはじめの音が「プツプツ」ととぎれていた
     （ホーム画面に追加したアプリで、画面を切りかえたときに目立つ）
     また、サウンドトラックの作業台は閉じていなかったので、行き来するほど作業台が増えていた

   ■ どうしているか
     はじめて音を鳴らすときに1つだけ作り、そのあとは閉じずに、どのページでも使い回す
     ページを離れるときは、作業台は閉じずに、
     そのページの mp3 の音を作業台から外すだけにする（→ utils/elementVolume.ts の releaseElement()）

   ※ 作業台がお休み中（suspended）なら、呼ぶだけで起こす（await はしない）
     ここで待たせると、画面の切り替わりが音のせいで遅れてしまう
   ============================================================ */
let sharedAudioContext: AudioContext | null = null;

/* 作業台を返す（はじめて呼ばれたときだけ作る）

   音が使えない環境では null を返す
   ※ 音OFFのときに作らないようにするのは、呼ぶ側の仕事（→ useAudio.ts の getAudioContext()） */
export function getSharedAudioContext() {
  if (!import.meta.client) {
    return null;
  }

  try {
    // 何かの理由で閉じられていたときも、作りなおす（閉じた作業台は、もう音を鳴らせないため）
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
