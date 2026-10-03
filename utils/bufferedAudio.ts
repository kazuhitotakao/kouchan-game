/* ============================================================
   mp3 を「最後まで読みこんで、ほどいてから」Web Audio だけで鳴らす係（iPhone・iPad のゲームの音だけ）

   iPhone・iPad のゲーム本編の BGM と mp3 の効果音は、new Audio() のかわりにこれを使う（→ elementVolume.ts の createGameAudio()）
   パソコン・Android と、サウンドトラックは new Audio() のまま

   ■ なぜいるのか
     iPhone で「mp3 を読みこみながら、Web Audio の音量つまみに通して鳴らす」と、とぎれやすく、
     画面の切りかえで「プツプツ」と鳴ったり、リザルトの曲が初めてのときだけ途中でとぎれたりしていた
     また、mp3 の音が鳴っていると、iPhone はロック画面に ▶／⏸ を出していた
     最後まで読みこんで AudioBuffer にほどいてから鳴らせば、鳴っている最中に読みこみが起きないので、とぎれない
       ほどいた音（AudioBuffer）→ 鳴らしはじめの音量 → 音量つまみ → スピーカー
     ・音量つまみは elementVolume.ts が回す。「鳴らしはじめの音量」は、途中から鳴らすときの「プツッ」を防ぐためのもの

   ■ 使いかた
     new Audio() と同じように使える（play() / pause() / paused / currentTime / loop / src / muted / getAttribute('src')）
     ※ play() は、まだ読みこみ中なら、読みこみ終わってから鳴りはじめる（そのあいだも paused は false）

   ■ 気をつけること
     ・ほどいた音は1曲で数十MBになるので、最近使ったものから cachedBytesLimit ぶんだけ覚えて、古いものは捨てる
     ・はじめて鳴らす曲は、ほどき終わるまで鳴りはじめが少し遅れることがある（作ったときから読みこみを始めておく）
     ・再生の速さ（playbackRate）は変えない（→ useAudio.ts の canChangeBgmTempo()）
   ============================================================ */

/* ほどいた音を、どれだけまで覚えておくか（バイト）
   いまの BGM は、ほどくと 1曲 35〜55MB くらい。BGM 3曲ぶんくらいにしてある */
const cachedBytesLimit = 160 * 1024 * 1024;

/* 読みこんでほどいた音（mp3 の場所ごと）
   promise  … ほどき終わったら、ほどいた音を返す（失敗したときは null）
   buffer   … ほどいた音（まだ終わっていないときは null）
   lastUsed … 最後に使った順番（大きいほど新しい。古いものから捨てる） */
type DecodedEntry = {
  promise: Promise<AudioBuffer | null>;
  buffer: AudioBuffer | null;
  lastUsed: number;
};

/* ページを移っても使い回せるように、ファイルの外側に置く（タイトルへ戻るたびに、ほどきなおさなくて済む） */
const decodedEntries = new Map<string, DecodedEntry>();

let useCounter = 0;

/* mp3 を読みこんで、ほどく（もう始めていれば、それを返す） */
function loadDecodedEntry(src: string, context: AudioContext) {
  let entry = decodedEntries.get(src);

  if (!entry) {
    const newEntry: DecodedEntry = { promise: Promise.resolve(null), buffer: null, lastUsed: 0 };

    newEntry.promise = fetch(src)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`読みこめなかった: ${src}`);
        }

        return response.arrayBuffer();
      })
      .then((data) => new Promise<AudioBuffer>((resolve, reject) => decodeAudio(context, data, resolve, reject)))
      .then((buffer) => {
        newEntry.buffer = buffer;
        trimDecodedEntries();

        return buffer;
      })
      .catch(() => {
        // 読みこめなかったときは忘れて、次に鳴らすときに読みこみなおす
        if (decodedEntries.get(src) === newEntry) {
          decodedEntries.delete(src);
        }

        return null;
      });

    decodedEntries.set(src, newEntry);
    entry = newEntry;
  }

  useCounter += 1;
  entry.lastUsed = useCounter;

  return entry;
}
/* ほどいた音を、最近使ったものから cachedBytesLimit ぶんだけ残して、古いものから捨てる
   ・いちばん最近使ったものは、大きくても かならず残す
   ・鳴っている最中の曲は、鳴らしている係がつかんでいるので、ここで捨てても とぎれない */
function trimDecodedEntries() {
  const decoded = [...decodedEntries.entries()].filter(([, entry]) => entry.buffer).sort(([, a], [, b]) => b.lastUsed - a.lastUsed);
  let totalBytes = 0;

  decoded.forEach(([src, entry], index) => {
    totalBytes += getBufferBytes(entry.buffer);

    if (index > 0 && totalBytes > cachedBytesLimit) {
      decodedEntries.delete(src);
    }
  });
}

/* mp3 をほどく
   古い Safari は「終わったら呼ぶ関数」を渡す形しか使えないので、その形で呼ぶ
   新しいブラウザが返す Promise の失敗は、受けとっておく（受けとらないと、コンソールにエラーが出るため） */
function decodeAudio(context: AudioContext, data: ArrayBuffer, resolve: (buffer: AudioBuffer) => void, reject: (error: unknown) => void) {
  const result: Promise<AudioBuffer> | undefined = context.decodeAudioData(data, resolve, reject);

  result?.catch(() => {});
}

/* 前に予約した音量の動きを取り消して、いまの大きさのところで止めておく（elementVolume.ts の holdGainAt() と同じ） */
function holdParamAt(param: AudioParam, now: number) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now);
    return;
  }

  const value = param.value;

  param.cancelScheduledValues(now);
  param.setValueAtTime(value, now);
}

/* ほどいた音の大きさ（バイト）。1つの音を 4バイトの数で持っている */
function getBufferBytes(buffer: AudioBuffer | null) {
  return buffer ? buffer.length * buffer.numberOfChannels * 4 : 0;
}

/* 鳴らしはじめの時刻を、ほんの少し先にする（秒）
   「いま」で予約すると、作業台が受けとったときには過ぎていて、すっと上げるところを取りこぼすため（→ useAudio.ts の toneScheduleLead） */
const startLeadSeconds = 0.03;

/* 鳴らしはじめに、0 から すっと上げる長さ（秒）
   ・ふつう                               … 一瞬（「プツッ」を防ぐだけ）
   ・読みこみを待ってから鳴りはじめたとき … ゆっくり（フェードインが、読みこみを待つあいだに終わってしまうため） */
const startFadeSeconds = 0.015;
const lateStartFadeSeconds = 0.8;

/* 読みこみを待った時間がこれより長いと「待ってから鳴りはじめた」とみなす（秒） */
const lateStartThresholdSeconds = 0.1;

export class BufferedAudio {
  private loopValue = false;

  /* 音を消しているか（useAudio.ts の unlockAudioElement() が使う。鳴らしはじめの音量を0にする） */
  muted = false;

  /* new Audio() とそろえるためだけにある（いつも ふつうの速さで鳴らす） */
  playbackRate = 1;
  preservesPitch = true;

  /* 止まっているか（読みこみを待っているあいだは false） */
  paused = true;

  private srcValue: string;

  /* 作業台を返す関数（音OFFのときは null が返る） */
  private readonly getContext: () => AudioContext | null;

  /* 作業台と、つないだ音量（connect() で作る） */
  private context: AudioContext | null = null;
  private startGain: GainNode | null = null;
  private volumeGain: GainNode | null = null;

  /* いま鳴らしている音と、そのほどいた音（止まっているときは null） */
  private source: AudioBufferSourceNode | null = null;
  private playingBuffer: AudioBuffer | null = null;

  /* 曲の先頭が、作業台の時計で何秒のところにあたるか（鳴っているあいだの currentTime の計算に使う） */
  private startedAt = 0;

  /* 止まっているときの再生位置（秒） */
  private offset = 0;

  /* play() のたびに1つ進める番号（読みこみを待っているあいだに pause() されたら、読みこみ終わっても鳴らさないため） */
  private playToken = 0;

  constructor(src: string, getContext: () => AudioContext | null) {
    this.srcValue = src;
    this.getContext = getContext;
    this.preload();
  }

  get src() {
    return this.srcValue;
  }

  /* ほかの曲へ差しかえる（new Audio() と同じく、止まって曲の先頭へ戻る） */
  set src(src: string) {
    this.stopSource();
    this.paused = true;
    this.playToken += 1;
    this.offset = 0;
    this.srcValue = src;
    this.preload();
  }

  /* new Audio() の getAttribute('src') とそろえるため（useAudio.ts の getResultBgm() が使う） */
  getAttribute(name: string) {
    return name === 'src' ? this.srcValue : null;
  }

  get loop() {
    return this.loopValue;
  }

  set loop(loop: boolean) {
    this.loopValue = loop;

    if (this.source) {
      this.source.loop = loop;
    }
  }

  get currentTime() {
    if (!this.source || !this.playingBuffer || !this.context) {
      return this.offset;
    }

    const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
    const duration = this.playingBuffer.duration;

    return this.loopValue ? elapsed % duration : Math.min(elapsed, duration);
  }

  /* 再生位置を変える（鳴っている最中なら、その位置から鳴らしなおす） */
  set currentTime(time: number) {
    this.offset = Math.max(0, time);

    if (this.source && this.playingBuffer && this.context) {
      this.startSource(this.context, this.playingBuffer, false);
    }
  }

  /* 音量つまみを作って返す（elementVolume.ts の setElementVolume() が呼ぶ。createMediaElementSource() のかわり） */
  connect(context: AudioContext) {
    if (!this.volumeGain || !this.startGain || this.context !== context) {
      this.context = context;
      this.startGain = context.createGain();
      this.volumeGain = context.createGain();
      this.startGain.connect(this.volumeGain);
      this.volumeGain.connect(context.destination);
    }

    return this.volumeGain;
  }

  get volumeNode() {
    return this.volumeGain;
  }

  play() {
    if (!this.paused) {
      return Promise.resolve();
    }

    const context = this.getContext();

    // 音OFFなどで作業台が無いときは、鳴らさない
    if (!context) {
      return Promise.resolve();
    }

    this.paused = false;
    this.playToken += 1;

    const token = this.playToken;
    const entry = loadDecodedEntry(this.srcValue, context);

    if (entry.buffer) {
      this.startSource(context, entry.buffer, false);
      return Promise.resolve();
    }

    const waitStartedAt = performance.now();

    entry.promise.then((buffer) => {
      // 待っているあいだに止められた・ほかの曲へ差しかえられたら、鳴らさない
      if (token !== this.playToken || this.paused) {
        return;
      }

      if (!buffer) {
        this.paused = true;
        return;
      }

      const waitedSeconds = (performance.now() - waitStartedAt) / 1000;

      this.startSource(context, buffer, waitedSeconds > lateStartThresholdSeconds);
    });

    return Promise.resolve();
  }

  pause() {
    if (this.paused) {
      return;
    }

    this.offset = this.currentTime;
    this.stopSource();
    this.paused = true;
    this.playToken += 1;
  }

  /* 作業台から外す（ページを離れるときの後始末 → elementVolume.ts の releaseElement()） */
  release() {
    this.stopSource();
    this.paused = true;
    this.playToken += 1;

    try {
      this.startGain?.disconnect();
      this.volumeGain?.disconnect();
    } catch {
      // 何もしない
    }

    this.startGain = null;
    this.volumeGain = null;
    this.context = null;
  }

  /* 鳴らす前から、読みこみを始めておく（音OFFのときは読みこまない）
     ほどいた音をもう捨てていても、ここで読みこみなおしが始まる
     もう読みこみ済み・読みこみ中なら、何もしない（最後に使った順番だけ新しくする） */
  preload() {
    const context = this.getContext();

    if (context) {
      loadDecodedEntry(this.srcValue, context);
    }
  }

  /* offset の位置から鳴らしはじめる */
  private startSource(context: AudioContext, buffer: AudioBuffer, lateStart: boolean) {
    // 音量を入れる前に鳴らしたときも鳴るように、ここでもつないでおく
    this.connect(context);

    const startGain = this.startGain;

    if (!startGain) {
      return;
    }

    let offset = this.offset;

    if (offset >= buffer.duration) {
      offset = this.loopValue ? offset % buffer.duration : 0;
    }

    try {
      const source = context.createBufferSource();
      const now = context.currentTime;
      const when = now + startLeadSeconds;
      const fadeSeconds = lateStart ? lateStartFadeSeconds : startFadeSeconds;
      const previous = this.source;

      source.buffer = buffer;
      source.loop = this.loopValue;
      source.connect(startGain);

      /* 鳴らしはじめの音量
         ① いまの大きさから、when までに 0 へ下げる（鳴っている最中に位置を変えたとき、前の音を いきなり切らないため）
         ② when から、0 → 1 へ すっと上げる（曲の途中から鳴らしはじめても「プツッ」と鳴らないように） */
      holdParamAt(startGain.gain, now);
      startGain.gain.linearRampToValueAtTime(0, when);
      startGain.gain.linearRampToValueAtTime(this.muted ? 0 : 1, when + fadeSeconds);

      // 前の音は、0 へ下げ終わった時刻で止めて、止まったら外す
      if (previous) {
        previous.onended = () => previous.disconnect();
        previous.stop(when);
      }

      source.start(when, offset);

      // 曲の最後まで進んで止まったとき（くり返さない曲だけ）は、new Audio() と同じく止まった状態にする
      source.onended = () => {
        if (this.source !== source) {
          return;
        }

        this.source = null;
        this.playingBuffer = null;
        this.paused = true;
        this.offset = 0;
      };

      this.source = source;
      this.playingBuffer = buffer;
      this.startedAt = when - offset;
    } catch {
      this.paused = true;
    }
  }

  /* いま鳴らしている音を、その場で止めて片づける（音量を0まで下げてから止めるのは elementVolume.ts の仕事） */
  private stopSource() {
    const source = this.source;

    this.source = null;
    this.playingBuffer = null;

    if (!source) {
      return;
    }

    source.onended = null;

    try {
      source.stop();
      source.disconnect();
    } catch {
      // 何もしない
    }
  }
}
