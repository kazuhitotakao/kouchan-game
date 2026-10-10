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

/* ============================================================
   止まったままの作業台を起こしなおす（wakeAudioContext）

   iPhone で長いあいだロックしてスリープしたあとは、作業台が次のどちらかで固まっていることがある
   ・お休み中（interrupted・suspended）のまま、resume() を呼んでも、いつまでも起きない
   ・state は running なのに、時計（currentTime）が止まっていて、音が出ない
   どちらも WebKit の不具合（bugs.webkit.org 263627・276016・281566）で、
   いちど suspend() してから、少し待って resume() すると直る
   そこで、起こしたあとに時計が進んでいるかを確かめ、進んでいなければ、止めてから起こしなおす

   ・時計が進んでいるか見るのは frozenCheckDelay ミリ秒後（同時に見るのは1回だけ。連打しても増えない）
   ・suspend() の知らせは待たない（固まった作業台では、知らせが来ないことがあるため）
   ============================================================ */

/* 時計が進んでいるかを確かめるまでの時間（ミリ秒） */
const frozenCheckDelay = 300;

/* suspend() してから resume() するまでの時間（ミリ秒。すぐに resume() すると直らないことがあるため） */
const reviveResumeDelay = 200;

/* 確かめる予約（予約していないときは null） */
let frozenCheckTimer: ReturnType<typeof setTimeout> | null = null;

/* context が止まっていたら起こし、そのあと固まっていないかを確かめる */
export function wakeAudioContext(context: AudioContext) {
  if (context.state === 'closed') {
    return;
  }

  // interrupted は iPhone だけの状態なので、「running でも closed でもない」で見る
  if (context.state !== 'running') {
    context.resume().catch(() => {});
  }

  if (frozenCheckTimer !== null) {
    return;
  }

  const startTime = context.currentTime;

  frozenCheckTimer = setTimeout(() => {
    frozenCheckTimer = null;

    if (context.state === 'closed') {
      return;
    }

    // 起きていて、時計も進んでいれば、ちゃんと動いている
    if (context.state === 'running' && context.currentTime > startTime) {
      return;
    }

    context.suspend().catch(() => {});

    setTimeout(() => {
      if (context.state !== 'closed') {
        context.resume().catch(() => {});
      }
    }, reviveResumeDelay);
  }, frozenCheckDelay);
}
