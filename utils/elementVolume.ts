/* ============================================================
   mp3 の音（HTMLAudioElement）の音量を変える

   ゲーム本編とサウンドトラックの BGM・mp3 の効果音は、どれもここを通して音量を入れる（audio.volume = 〜 と直接書かない）

   ■ なぜ audio.volume に直接入れないのか
     iPhone・iPad の Safari では audio.volume が「読むだけ」で、入れても無視され、いつも いちばん大きい音で鳴るため
     ・audio.volume が効くブラウザ（パソコン・Android など）… そのまま audio.volume に入れる
     ・効かないブラウザ（iPhone・iPad）… Web Audio の「音量つまみ」（GainNode）に通して、つまみを回す
         mp3 の音 → 音量つまみ（GainNode）→ スピーカー
     効くかどうかは「iPhone・iPad かどうか」で決める（→ isAppleMobile()）
     ※ 「0.5 を入れて、0.5 が読めるか」で調べると、iPhone では読めてしまい（音は変わらないのに）、まちがえるため

   ■ バックグラウンド再生（サウンドトラックだけ）
     iPhone は、画面が見えなくなると Web Audio を止めるので、つまみに通した音もいっしょに止まってしまう
     サウンドトラックは曲を聴くページなので、navigator.audioSession.type = 'playback' にして、画面を消しても鳴らしつづける
     （→ keepAudioContextAwake() の backgroundPlayback。ページを離れるときに 'auto' へ戻す）
     ・ゲーム本編・ミニゲームは、画面が見えているあいだだけ 'playback' にする（マナーモードでも鳴らすため
       → playThroughSilentModeWhileVisible()）。画面を消したら、今までどおり音も止まる
     ・navigator.audioSession があるのは iOS 16.4 から、鳴りつづけるのは iOS 17.5 から
   ============================================================ */

/* iPhone・iPad で、ゲームの BGM・mp3 の効果音を鳴らす係（→ createGameAudio()） */
import { BufferedAudio } from '~/utils/bufferedAudio';

/* iPhone・iPad（iPod touch もふくむ）かどうか
   いまの iPad は userAgent が Mac のふりをするので、「Macintosh なのに指でさわれる」で見分ける
   ※ iPhone の Chrome なども、中身は Safari と同じしくみなので、ここで iPhone と判定される */
function isAppleMobile() {
  const userAgent = navigator.userAgent;

  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
}

/* audio.volume が効くかどうか（null は「まだ調べていない」。調べるのは最初の1回だけ） */
let canSetVolumeCache: boolean | null = null;

function canSetElementVolume() {
  if (canSetVolumeCache === null) {
    try {
      if (isAppleMobile()) {
        canSetVolumeCache = false;
        return canSetVolumeCache;
      }

      const probe = new Audio();

      probe.volume = 0.5;
      canSetVolumeCache = Math.abs(probe.volume - 0.5) < 0.01;
    } catch {
      canSetVolumeCache = true;
    }
  }

  return canSetVolumeCache;
}

/* mp3 の音を、Web Audio の「音量つまみ」に通しているか（true … iPhone・iPad）

   つまみに通した音は、再生の速さ（playbackRate）を変えると preservesPitch が効かず、曲の高さまで上がってしまう
   そこで「速さを変えてよい鳴らしかたか」を、ここで見分けられるようにしてある（→ useAudio.ts の setSecretBgmPlaybackRate()） */
export function usesWebAudioVolume() {
  if (!import.meta.client) {
    return false;
  }

  return !canSetElementVolume();
}

/* ゲームの BGM・mp3 の効果音の入れもの
   ・パソコン・Android など … ふつうの mp3 の音（HTMLAudioElement）
   ・iPhone・iPad          … 最後まで読みこんでから Web Audio だけで鳴らす係（BufferedAudio）
   どちらも同じように使えるので、ゲーム側は どちらかを気にしなくてよい */
export type GameAudio = HTMLAudioElement | BufferedAudio;

/* ゲームの BGM・mp3 の効果音を作る（new Audio(src) のかわりに使う。iPhone・iPad では BufferedAudio）
   getContext … 作業台を返す関数（音OFFのときは読みこみも始めない）
   ※ サウンドトラックは、ロック画面で操作したり、画面を消しても鳴らしつづけたりするので、これを使わず new Audio() のまま */
export function createGameAudio(src: string, getContext: () => AudioContext | null): GameAudio {
  return usesWebAudioVolume() ? new BufferedAudio(src, getContext) : new Audio(src);
}

/* 鳴らす前から、曲の読みこみを始めておく（「少し待ってから鳴らす」曲の待ちはじめに呼ぶ）
   mp3 の音（HTMLAudioElement）は、作った時点でブラウザが読みこみを始めているので、何もしない */
export function preloadGameAudio(audio: GameAudio) {
  if (audio instanceof BufferedAudio) {
    audio.preload();
  }
}

/* navigator.audioSession の種類を type にする（無いブラウザ・すでにその種類のときは、何もしない）
   ・'playback' … 「音楽を再生するページ」と伝える（画面を消しても鳴りつづける・マナーモードでも鳴る）
   ・'auto'     … ブラウザにまかせる（はじめの値） */
function setAudioSessionType(type: 'playback' | 'auto') {
  const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;

  if (!audioSession || audioSession.type === type) {
    return;
  }

  try {
    audioSession.type = type;
  } catch {
    // 変えられなくても、音は今までどおり鳴る（画面を消すと止まるだけ）
  }
}

/* 音量つまみに通したAudioと、そのつまみの組
   createMediaElementSource() は1つのAudioに1回しか呼べないので、2回目からは残してあるつまみを回す */
const gainNodes = new WeakMap<GameAudio, GainNode>();

/* つまみに通したAudioの、音の入り口（作業台から外すときに使う → releaseElement()） */
const sourceNodes = new WeakMap<GameAudio, MediaElementAudioSourceNode>();

/* それぞれのAudioの「ほんとうは、この大きさで鳴らしたい」音量
   止めるときに つまみを0まで下げるので、あとで元に戻すために覚えておく */
const targetVolumes = new WeakMap<GameAudio, number>();

/* 音量つまみを動かすときの「なめらかさ」（秒）

   gain.value = 〜 でいきなり変えると、音の波に段差ができて「プツッ」と鳴る
   （BGMのフェードインでは、それが1秒間に20回続いて「カタカタ」と聞こえていた）
   setTargetAtTime() で「すっと」近づければ、耳には一瞬で変わったように聞こえても、段差はできない */
const volumeSmoothingSeconds = 0.015;

/* 音量つまみを volume にする
   鳴っている最中だけ、なめらかに動かす
   （止まっているときは雑音が出ないし、作業台が止まっていると時計が進まず、なめらかに動かせないため） */
function setGainValue(gain: GainNode, volume: number, smooth: boolean) {
  const param = gain.gain;

  try {
    const now = gain.context.currentTime;

    if (smooth && gain.context.state === 'running') {
      holdGainAt(param, now);
      param.setTargetAtTime(volume, now, volumeSmoothingSeconds);
      return;
    }

    // 前に予約した動き（フェードの途中など）を取り消してから、そのまま入れる
    param.cancelScheduledValues(now);
    param.setValueAtTime(volume, now);
  } catch {
    param.value = volume;
  }
}

/* 前に予約した動きを取り消して、いまの大きさのところで止めておく
   cancelAndHoldAtTime() が無い古いブラウザでは、取り消してから param.value を入れなおす（少しずれるが、段差は小さい） */
function holdGainAt(param: AudioParam, now: number) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now);
    return;
  }

  const value = param.value;

  param.cancelScheduledValues(now);
  param.setValueAtTime(value, now);
}

/* audio の音量を volume（0〜1）にする
   getContext … サイト全体で1つの作業台を返す関数（→ utils/audioContext.ts）。null（音OFFなど）なら、つまみを作らない */
export function setElementVolume(audio: GameAudio, volume: number, getContext: () => AudioContext | null) {
  const safeVolume = Math.min(1, Math.max(0, volume));

  if (canSetElementVolume() && !(audio instanceof BufferedAudio)) {
    audio.volume = safeVolume;
    return;
  }

  /* 作業台は、つまみが有っても毎回呼ぶ
     お休み中（suspended）なら、呼ぶだけで起こしてくれるので、つまみに通した音が無音のまま止まるのを防げる */
  const context = getContext();
  let gain: GainNode | null | undefined = getGainNode(audio);

  if (!gain) {
    if (!context) {
      return;
    }

    gain = connectToContext(audio, context);

    if (!gain) {
      return;
    }
  }

  targetVolumes.set(audio, safeVolume);

  // 止めている途中（つまみを0へ下げている最中）は、さわらない（止まる直前に音が戻ってしまうため）
  if (pendingPauses.has(audio)) {
    return;
  }

  // 止め終わって0のままにしている mp3 の音も、さわらない（次に鳴らす直前に戻す → mutedAfterPause）
  if (mutedAfterPause.has(audio)) {
    return;
  }

  setGainValue(gain, safeVolume, !audio.paused);
}

/* audio を作業台につないで、音量つまみを返す（つなげなかったときは null）
   BufferedAudio は、自分で音量つまみを作ってつなぐので、それをもらう */
function connectToContext(audio: GameAudio, context: AudioContext) {
  try {
    if (audio instanceof BufferedAudio) {
      const gain = audio.connect(context);

      gainNodes.set(audio, gain);
      return gain;
    }

    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();

    source.connect(gain);
    gain.connect(context.destination);
    gainNodes.set(audio, gain);
    sourceNodes.set(audio, source);

    return gain;
  } catch {
    // 通せなかったときは、今までどおり（音量は変わらないが、音は鳴る）
    return null;
  }
}

/* audio の音量つまみ（まだ無いときは undefined）
   BufferedAudio は、音量を入れる前に play() されると自分でつまみを作るので、止めるときに下げられるよう、ここで拾う */
function getGainNode(audio: GameAudio) {
  const gain = gainNodes.get(audio);

  if (gain || !(audio instanceof BufferedAudio)) {
    return gain;
  }

  const ownGain = audio.volumeNode;

  if (ownGain) {
    gainNodes.set(audio, ownGain);
  }

  return ownGain ?? undefined;
}

/* ============================================================
   曲を止めるときの「ぶつっ」を防ぐ（iPhone・iPad だけ）

   鳴っている曲を pause() すると、音の波がその場でとぎれて「ぶつっ」と鳴る
   そこで、音量つまみを pauseFadeSeconds 秒かけて0まで下げてから pause() する

   ・ただ止めるとき                   … pauseElement()
   ・止めてから別の曲へ差しかえるとき … pauseElementThen()
   ・止めている途中に また play() するときは、かならず先に cancelElementPause() を呼ぶ
     （呼ばないと、鳴らしはじめた直後に止まってしまう）
   ・audio.volume が効くブラウザ（パソコン・Android など）は、その場で止める
   ============================================================ */
const pauseFadeSeconds = 0.06;

/* 音量を下げはじめるのを、ほんの少しだけ先にする（秒）

   作業台の時計（currentTime）は、実際に音を作っているところより少し遅れて見えている（画面の切りかえ中は、さらに遅れる）
   「いま」から下げはじめる予約だと、受けとったときには もう途中まで進んでいて、いきなり音量が落ちて「ぶつっ」と鳴ることがある
   （計算して作る効果音も、同じ理由でずらしている → useAudio.ts の toneScheduleLead） */
const pauseFadeLeadSeconds = 0.03;

/* 止める予約（Audioごと）
   timer      … 下げ終わったあとに pause() する予約の番号
   rewind     … 止めたあとに、曲の先頭へ戻すか
   onPaused   … 止めたあとに呼ぶ処理（別の曲への差しかえなど）
   release    … 止めたあとに、作業台から外すか（→ releaseElement()）
   onReleased … 外し終わったあとに呼ぶ処理 */
type PendingPause = {
  timer: ReturnType<typeof setTimeout>;
  rewind: boolean;
  onPaused: (() => void) | null;
  release: boolean;
  onReleased: (() => void) | null;
};

const pendingPauses = new WeakMap<GameAudio, PendingPause>();

/* 止め終わったあとも、音量つまみを0のままにしている mp3 の音（HTMLAudioElement）

   iPhone の Safari は、つまみに通した mp3 の音を少し先の分まで取りこんでいるので、pause() したあとも少しだけ流れる
   止めたその場でつまみを戻すと、その残りの音が大きな音で一瞬鳴って「ブツッ」と聞こえていた
   そこで0のままにしておき、次に鳴らす直前に戻す（→ cancelElementPause()）
   ・BufferedAudio は Web Audio だけで鳴らしていて残りの音が無いので、その場で戻す */
const mutedAfterPause = new WeakSet<GameAudio>();

/* 止める（rewind: true なら、止めたあと曲の先頭へ戻す） */
export function pauseElement(audio: GameAudio, { rewind = false } = {}) {
  const pending = pendingPauses.get(audio);

  /* もう止めている途中なら、予約はそのまま（先頭へ戻すかどうかだけ足す）
     差しかえの途中だったときは、差しかえもやめる（「次の曲へ」の直後に「■ 停止」を押したなら、止まってほしいので） */
  if (pending) {
    pending.rewind = pending.rewind || rewind;
    pending.onPaused = null;
    return;
  }

  fadeOutAndPause(audio, rewind, null);
}

/* 止めてから onPaused を呼ぶ（いまの曲をすっと止めて、別の曲へ差しかえるとき用）
   止めている途中にまた呼ばれたときは、いちばん新しい onPaused だけを呼ぶ（連打しても1回だけ差しかわる） */
export function pauseElementThen(audio: GameAudio, onPaused: () => void) {
  const pending = pendingPauses.get(audio);

  if (pending) {
    pending.onPaused = onPaused;
    return;
  }

  fadeOutAndPause(audio, false, onPaused);
}

/* pauseElement() と pauseElementThen() の中身 */
function fadeOutAndPause(audio: GameAudio, rewind: boolean, onPaused: (() => void) | null) {
  const gain = getGainNode(audio);

  /* その場で止めるとき
     ・つまみを使っていない ・もう止まっている ・作業台が動いていない（時計が止まっていて下げられない。音も出ていない） */
  if (!gain || audio.paused || gain.context.state !== 'running') {
    pauseNow(audio, rewind);
    onPaused?.();
    return;
  }

  try {
    const param = gain.gain;
    const fadeStart = gain.context.currentTime + pauseFadeLeadSeconds;

    holdGainAt(param, fadeStart);
    param.linearRampToValueAtTime(0, fadeStart + pauseFadeSeconds);
  } catch {
    pauseNow(audio, rewind);
    onPaused?.();
    return;
  }

  // 下げ終わるのを少しだけ待ってから止める（待ち時間ぴったりだと、下げきる前に止まることがある）
  const pending: PendingPause = {
    timer: setTimeout(
      () => {
        pendingPauses.delete(audio);
        pauseNow(audio, pending.rewind);

        // ページを離れるときは、止め終わったところで作業台から外して終わり
        if (pending.release) {
          disconnectElement(audio);
          pending.onReleased?.();
          return;
        }

        if (audio instanceof BufferedAudio) {
          setGainValue(gain, targetVolumes.get(audio) ?? 1, false);
        } else {
          /* mp3 の音は0のままにして、次に鳴らす直前に戻す（→ mutedAfterPause）
             cancelElementPause() を通らずに鳴りはじめたときも、無音のままにならないよう、鳴りはじめたら戻す */
          mutedAfterPause.add(audio);
          audio.addEventListener('play', () => restoreGainAfterPause(audio), { once: true });
        }

        pending.onPaused?.();
      },
      (pauseFadeLeadSeconds + pauseFadeSeconds) * 1000 + 20
    ),
    rewind,
    onPaused,
    release: false,
    onReleased: null,
  };

  pendingPauses.set(audio, pending);
}

/* その場で止める（rewind: true なら、曲の先頭へ戻す） */
function pauseNow(audio: GameAudio, rewind: boolean) {
  try {
    audio.pause();

    if (rewind) {
      audio.currentTime = 0;
    }
  } catch {
    // 何もしない
  }
}

/* audio が鳴っているか（止めている途中の曲は、もう止まることが決まっているので「鳴っていない」とみなす） */
export function isElementPlaying(audio: GameAudio) {
  return !audio.paused && !pendingPauses.has(audio);
}

/* 止める予約を取り消す（play() の直前に呼ぶ）
   止め終わって0のままにしている mp3 の音なら、ここで元の大きさへ戻す */
export function cancelElementPause(audio: GameAudio) {
  const pending = pendingPauses.get(audio);

  if (!pending) {
    restoreGainAfterPause(audio);
    return;
  }

  clearTimeout(pending.timer);
  pendingPauses.delete(audio);
  mutedAfterPause.delete(audio);

  const gain = getGainNode(audio);

  // 0へ下げかけていた音量を、なめらかに戻す
  if (gain) {
    setGainValue(gain, targetVolumes.get(audio) ?? 1, true);
  }
}

/* 0のままにしていた音量つまみを、なめらかに戻す（0のままにしていないときは何もしない。2回呼ばれても1回だけ） */
function restoreGainAfterPause(audio: GameAudio) {
  if (!mutedAfterPause.delete(audio)) {
    return;
  }

  const gain = getGainNode(audio);

  if (gain) {
    setGainValue(gain, targetVolumes.get(audio) ?? 1, true);
  }
}

/* ページを離れるときに、audio を作業台（AudioContext）から外す

   作業台はサイト全体で1つを使い回していて閉じないので、外さないと、ページを行き来するほど作業台の仕事が増えていく
   ・かならず pauseElement() のあとに呼ぶ（下げている途中なら、止め終わってから外す。途中で外すと「ぶつっ」と鳴る）
   ・外したAudioは、もう鳴らせない（createMediaElementSource() は1回しか呼べないため）
   ・mp3 の音は、曲も外して空にする（→ unloadMediaElement()）
   ・onReleased … 外し終わったあとに呼ぶ
                  （サウンドトラックは、ここでロック画面の曲名などを消す。鳴っている途中で消すと、
                    iPhone が鳴っている Audio から曲名なしで知らせなおすことがあるため） */
export function releaseElement(audio: GameAudio, onReleased?: () => void) {
  const pending = pendingPauses.get(audio);

  if (pending) {
    pending.release = true;
    pending.onPaused = null;
    pending.onReleased = onReleased ?? null;
    return;
  }

  disconnectElement(audio);
  onReleased?.();
}

/* releaseElement() の中身（その場で外す） */
function disconnectElement(audio: GameAudio) {
  try {
    sourceNodes.get(audio)?.disconnect();
    gainNodes.get(audio)?.disconnect();

    // BufferedAudio は、鳴らしている音と音量つまみを自分で片づける
    if (audio instanceof BufferedAudio) {
      audio.release();
    } else {
      unloadMediaElement(audio);
    }
  } catch {
    // 何もしない
  }

  sourceNodes.delete(audio);
  gainNodes.delete(audio);
  targetVolumes.delete(audio);
}

/* mp3 の音（HTMLAudioElement）から曲を外して、空にする

   iPhone は、一度鳴らした Audio が曲を持ったまま残っていると、止まっていても「再生中の曲」とみなして、
   ロック画面に ▶ を出しつづける（サウンドトラックからゲームへ戻ったあとも ▶ が出ていた）
   ・src に '' を入れると「読みこめない曲」になってエラーが起きるので、属性ごと外してから load() する */
function unloadMediaElement(audio: HTMLAudioElement) {
  audio.removeAttribute('src');
  audio.load();
}

/* ゲームの画面が見えているあいだだけ、マナーモードでも音を鳴らす（iPhone・iPad だけ）

   iPhone・iPad のゲームの音は Web Audio だけで鳴らしていて、そのままだとマナーモードで鳴らない
   そこで 'playback' にして、マナーモードでも鳴らす（ほかのアプリの音楽は止まる）
   ただし 'playback' のままだとロックしても鳴りつづけるので、画面が見えなくなったら すぐ 'auto' へ戻す
   返す関数を呼ぶと、やめて 'auto' へ戻す（ページを離れるときの後始末用） */
export function playThroughSilentModeWhileVisible() {
  if (!import.meta.client || canSetElementVolume()) {
    return () => {};
  }

  function applyAudioSessionType() {
    setAudioSessionType(document.visibilityState === 'visible' ? 'playback' : 'auto');
  }

  applyAudioSessionType();
  document.addEventListener('visibilitychange', applyAudioSessionType);

  return () => {
    document.removeEventListener('visibilitychange', applyAudioSessionType);
    setAudioSessionType('auto');
  };
}

/* 指でさわる・クリックする・キーを押すたびに、作業台（AudioContext）を起こしておく

   iPhone では、作業台を「さわった瞬間」の外で作ったり起こしたりすると、お休み中（suspended）のまま起きてくれない
   BGM は少し待って（setTimeout で）鳴らしはじめるので、そのとき初めて作業台を作ると無音になってしまう
   画面を消して戻ってきたときも、作業台はお休み中（interrupted）になっている

   backgroundPlayback … true なら、さわるたびに 'playback' にして、画面を消しても鳴りつづけるようにする（サウンドトラックだけ）
                        受付をやめるときに 'auto' へ戻す（ページを移っても同じ画面のままなので、戻さないとほかのページにも残る）
   返す関数を呼ぶと、受付をやめる（ページを離れるときの後始末用） */
export function keepAudioContextAwake(getContext: () => AudioContext | null, { backgroundPlayback = false } = {}) {
  if (!import.meta.client) {
    return () => {};
  }

  function wakeAudioContext() {
    if (canSetElementVolume()) {
      return;
    }

    if (backgroundPlayback) {
      setAudioSessionType('playback');
    }

    const context = getContext();

    // interrupted は iPhone だけの状態なので、「running でも closed でもない」で見る
    if (context && context.state !== 'running' && context.state !== 'closed') {
      context.resume().catch(() => {});
    }
  }

  /* iPhone が「さわった瞬間」と認めるのは、指をはなしたとき（touchend）とクリック
     （touchstart・pointerdown では、起こせないことがある） */
  const eventNames = ['touchend', 'click', 'keydown'] as const;

  for (const eventName of eventNames) {
    window.addEventListener(eventName, wakeAudioContext, { capture: true, passive: true });
  }

  return () => {
    for (const eventName of eventNames) {
      window.removeEventListener(eventName, wakeAudioContext, { capture: true });
    }

    if (backgroundPlayback && !canSetElementVolume()) {
      setAudioSessionType('auto');
    }
  };
}
