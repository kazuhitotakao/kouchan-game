/* ============================================================
   mp3 の音（HTMLAudioElement）の音量を変える

   ゲーム本編（composables/useAudio.ts）とサウンドトラック（pages/soundtrack.vue）の
   BGM・mp3 の効果音は、どれもここを通して音量を入れる
   （audio.volume = 〜 と直接書かない）

   ■ なぜ audio.volume に直接入れないのか

     iPhone・iPad の Safari では、audio.volume が「読むだけ」になっていて、
     0.16 などを入れても無視され、いつも 1（いちばん大きい音）のまま鳴る
     （音量は、本体の音量ボタンで変えるもの、という iOS の決まり）
     そのため、音量バーを動かしても、mp3 の音の大きさが変わらなかった
     ※ 計算して作る効果音は、はじめから下の GainNode で音量を決めているので、iPhone でも効いていた

   ■ どうしているか

     ・audio.volume が効くブラウザ（パソコン・Android など）
       → 今までどおり audio.volume に入れる
     ・audio.volume が効かないブラウザ（iPhone・iPad）
       → mp3 の音を Web Audio の「音量つまみ」（GainNode）に通してから鳴らし、
         そのつまみを回して音量を変える
           mp3 の音 → 音量つまみ（GainNode）→ スピーカー

     効くかどうかは、まず「iPhone・iPad かどうか」で決める（→ isAppleMobile()）
     ※ はじめは「0.5 を入れて、0.5 が読めるか」だけで調べていたが、
       iPhone の実機では 0.5 が読めてしまい（音の大きさは変わらないのに）、
       「効くブラウザ」とまちがえて、音量バーが効かないままだった
       そのため、この調べかたは、iPhone・iPad 以外で念のため使うだけにしてある

   ■ 画面を消した・ほかのアプリへ切りかえたあとも鳴らしつづける（バックグラウンド再生。サウンドトラックだけ）

     iPhone は、ふだんは画面が見えなくなると Web Audio を止めてしまう
     音量つまみに通した mp3 の音も、Web Audio の中を通っているので、いっしょに止まってしまう
     （音量つまみを通す前は、ふつうの mp3 の音（HTMLAudioElement）だったので、画面を消しても鳴りつづけていた）

     サウンドトラック（pages/soundtrack.vue）は曲を聴くためのページなので、
     「このページは音楽を再生するもの」と iPhone に伝えて、画面を消しても鳴らしつづける
       navigator.audioSession.type = 'playback'
     こうすると、画面が見えなくなっても Web Audio を止めずに、鳴らしつづけてくれる
     （→ keepAudioContextAwake() の backgroundPlayback。ページを離れるときに 'auto' へ戻す）
     ・ゲーム本編・ミニゲームでは伝えない（画面を消したら、今までどおり音も止まる）
     ・navigator.audioSession があるのは iOS 16.4 から。鳴りつづけるのは iOS 17.5 から
       （それより前の iOS では、今までどおり止まる）
     ・'playback' にすると、ほかのアプリの音楽は止まる・マナーモードでも鳴る
       音量つまみを通す前の mp3 の音（HTMLAudioElement）も同じあつかいだったので、前と同じ
     ・音量つまみを使わないブラウザ（パソコン・Android など）では、何もしない
   ============================================================ */

/* iPhone・iPad（iPod touch もふくむ）かどうか

   ・iPhone・iPod と、古い iPad … userAgent に iPhone／iPad／iPod が入っている
   ・いまの iPad … パソコン（Mac）のふりをするので userAgent は Macintosh になる
                   Mac には指でさわれる画面が無いので、「Macintosh なのに指でさわれる」で見分ける
   ※ iPhone の Chrome なども、中身は Safari と同じしくみなので、ここで iPhone と判定される */
function isAppleMobile() {
  const userAgent = navigator.userAgent;

  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
}

/* audio.volume が効くかどうか（null は「まだ調べていない」）

   調べるのは最初の1回だけ。答えはページを開いているあいだ変わらない */
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

/* mp3 の音（HTMLAudioElement）を、Web Audio の「音量つまみ」に通しているか

   ・true  … iPhone・iPad（audio.volume が効かないので、つまみに通してから鳴らしている）
   ・false … パソコン・Android など（audio.volume にそのまま入れている）

   つまみに通した音は、Web Audio の中を通ってからスピーカーへ出る
   この通り道では、再生の速さ（playbackRate）を変えたときに
   「音の高さは変えない」という指定（preservesPitch）が効かず、
   曲の高さまで上がってしまう・音がくずれることがある
   そこで「速さを変えてよい鳴らしかたか」を、ここで見分けられるようにしてある
   （→ composables/useAudio.ts の setSecretBgmPlaybackRate()） */
export function usesWebAudioVolume() {
  if (!import.meta.client) {
    return false;
  }

  return !canSetElementVolume();
}

/* navigator.audioSession の種類を type にする（バックグラウンド再生のため。くわしくは、このファイルの先頭）

   ・'playback' … 「このページは音楽を再生するもの」と伝える（画面を消しても鳴りつづける）
   ・'auto'     … ブラウザにまかせる（はじめの値。画面を消すと止まる）
   navigator.audioSession が無いブラウザ（iOS 16.3 までなど）では、何もしない
   すでに その種類のときも、何もしない（何度呼んでもよい） */
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

   createMediaElementSource() は、1つのAudioに1回しか呼べない
   なので、2回目からは、ここに残してあるつまみを回すだけにする
   （WeakMap なので、作業台から外したAudioは、つまみごと自然に片づく → releaseElement()） */
const gainNodes = new WeakMap<HTMLAudioElement, GainNode>();

/* つまみに通したAudioの、音の入り口（作業台から外すときに使う → releaseElement()） */
const sourceNodes = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

/* それぞれのAudioに「ほんとうは、この大きさで鳴らしたい」と言われた音量

   止める前に音量つまみを0まで下げる（→ pauseElement()）ので、
   止め終わったあとに、ここに覚えておいた大きさへ戻す
   （戻さないと、次に play() したとき無音のままになる） */
const targetVolumes = new WeakMap<HTMLAudioElement, number>();

/* 音量つまみを動かすときの「なめらかさ」（秒）

   ■ なぜ、なめらかに動かすのか
     音量つまみ（GainNode）の値を gain.value = 〜 でいきなり変えると、
     音の波がその瞬間に段差になって「プツッ」という雑音が出る
     BGMのフェードイン（0.05秒ごとに少しずつ上げる）では、それが1秒間に20回続くので、
     曲の入りに「カタカタ」と打鍵音のような音が入っていた（iPhone のホーム画面アプリで目立つ）

   ■ どうしているか
     setTargetAtTime() で、目標の大きさへ「すっと」近づける
     0.015 は「約0.015秒で 6割、0.05秒で ほぼ目標」くらいの速さ
     耳には一瞬で変わったように聞こえるが、波に段差はできない */
const volumeSmoothingSeconds = 0.015;

/* 音量つまみを volume にする

   鳴っている最中だけ、なめらかに動かす（→ volumeSmoothingSeconds）
   止まっているときや、作業台が動いていないときは、そのまま入れる
   （鳴っていないので雑音は出ないし、作業台が止まっていると時計が進まず、なめらかに動かせないため） */
function setGainValue(gain: GainNode, volume: number, smooth: boolean) {
  const param = gain.gain;

  try {
    const now = gain.context.currentTime;

    if (smooth && gain.context.state === 'running') {
      // いまの大きさを起点にして、目標へ近づける
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

/* 前に予約した動きを取り消して、いま（now）の大きさのところで止めておく

   cancelAndHoldAtTime() は「いま鳴っている大きさ」をそのまま残してくれる
   無い古いブラウザでは、取り消してから param.value を入れなおす
   （動いている途中の値が読めないブラウザでは少しずれるが、取り消すだけよりは段差が小さい） */
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

   getContext … 音量つまみを作るための作業台（AudioContext）を返す関数
                ゲーム本編とサウンドトラックは、それぞれ自分の作業台を渡す
                null が返ってきたとき（音OFFなど）は、つまみを作らずに終わる */
export function setElementVolume(audio: HTMLAudioElement, volume: number, getContext: () => AudioContext | null) {
  const safeVolume = Math.min(1, Math.max(0, volume));

  if (canSetElementVolume()) {
    audio.volume = safeVolume;
    return;
  }

  /* 作業台を呼ぶのは、つまみが有っても毎回
     作業台がお休み中（suspended）なら、呼ぶだけで起こしてくれるので、
     つまみに通した音が、無音のまま止まってしまうのを防げる */
  const context = getContext();
  let gain = gainNodes.get(audio);

  if (!gain) {
    if (!context) {
      return;
    }

    try {
      const source = context.createMediaElementSource(audio);

      gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      gainNodes.set(audio, gain);
      sourceNodes.set(audio, source);
    } catch {
      // 通せなかったときは、今までどおり（音量は変わらないが、音は鳴る）
      return;
    }
  }

  targetVolumes.set(audio, safeVolume);

  /* 止めている途中（音量つまみを0へ下げている最中）なら、つまみはさわらない
     ここで上げてしまうと、止まる直前に音が戻ってしまう
     覚えておいた大きさは、止め終わったあとに入る（→ pauseElement()） */
  if (pendingPauses.has(audio)) {
    return;
  }

  setGainValue(gain, safeVolume, !audio.paused);
}

/* ============================================================
   曲を止めるときの「ぶつっ」を防ぐ（iPhone・iPad だけ）

   ■ 何が起きていたか
     鳴っている曲を pause() すると、音の波がその場でとぎれるので「ぶつっ」と雑音が出る
     音量つまみ（GainNode）に通している iPhone・iPad では、これがはっきり聞こえる
     （曲の途中で画面を切りかえるボタンを押したとき、など）

   ■ どうしているか
     pause() の前に、音量つまみを pauseFadeSeconds 秒かけて0まで下げて、
     下げ終わってから pause() する
     耳には「すぐ止まった」ように聞こえる短さにしてある

     ・ただ止めるとき             … pauseElement()
     ・止めてから別の曲へ差しかえるとき … pauseElementThen()（止め終わったら、差しかえの処理を呼ぶ）
     ・止めている途中に、また play() するときは、
       かならず先に cancelElementPause() を呼ぶ（止める予約を取り消して、音量を戻す）
       呼ばないと、鳴らしはじめた直後に止まってしまう
     ・audio.volume が効くブラウザ（パソコン・Android など）は、今までどおり その場で止める
   ============================================================ */
const pauseFadeSeconds = 0.06;

/* 音量を下げはじめるのを、ほんの少しだけ先にする（秒）

   作業台の時計（currentTime）は、実際に音を作っているところより少し遅れて見えている
   画面を切りかえる最中は、ほかの処理で手間どって、その遅れがさらに大きくなる
   「いま」から下げはじめる予約をすると、作業台がそれを受けとったときには もう途中まで進んでいて、
   いきなり音量が落ちる（＝ぶつっと鳴る）ことがある
   そこで、少し先の時刻から下げはじめるように予約して、下げはじめを取りこぼさないようにする
   （耳には分からない短さ。計算して作る効果音も同じ理由でずらしている → useAudio.ts の toneScheduleLead） */
const pauseFadeLeadSeconds = 0.03;

/* 止める予約（Audioごと）
   timer    … 下げ終わったあとに pause() する予約の番号
   rewind   … 止めたあとに、曲の先頭へ戻すか
   onPaused … 止めたあとに呼ぶ処理（別の曲への差しかえなど。無いときは null）
   release  … 止めたあとに、作業台から外すか（→ releaseElement()） */
type PendingPause = {
  timer: ReturnType<typeof setTimeout>;
  rewind: boolean;
  onPaused: (() => void) | null;
  release: boolean;
};

const pendingPauses = new WeakMap<HTMLAudioElement, PendingPause>();

/* 止める（rewind: true なら、止めたあと曲の先頭へ戻す）

   止まるのは、音量を下げ終わった少しあと（iPhone・iPad のとき）
   それ以外のときは、今までどおり その場で止まる */
export function pauseElement(audio: HTMLAudioElement, { rewind = false } = {}) {
  const pending = pendingPauses.get(audio);

  /* もう止めている途中なら、予約はそのまま（先頭へ戻すかどうかだけ足す）
     別の曲へ差しかえる途中（pauseElementThen()）だったときは、差しかえもやめる
     （「次の曲へ」を押した直後に「■ 停止」を押したなら、止まってほしいので） */
  if (pending) {
    pending.rewind = pending.rewind || rewind;
    pending.onPaused = null;
    return;
  }

  fadeOutAndPause(audio, rewind, null);
}

/* 止めてから onPaused を呼ぶ（いまの曲をすっと止めて、別の曲へ差しかえるとき用）

   onPaused が呼ばれるのは、止め終わったあと
   ・iPhone・iPad で鳴っている最中 … 音量を下げ終わった少しあと
   ・それ以外                      … その場ですぐ（今までと同じ）
   止めている途中にまた呼ばれたときは、いちばん新しい onPaused だけを呼ぶ（連打しても1回だけ差しかわる） */
export function pauseElementThen(audio: HTMLAudioElement, onPaused: () => void) {
  const pending = pendingPauses.get(audio);

  if (pending) {
    pending.onPaused = onPaused;
    return;
  }

  fadeOutAndPause(audio, false, onPaused);
}

/* pauseElement() と pauseElementThen() の中身 */
function fadeOutAndPause(audio: HTMLAudioElement, rewind: boolean, onPaused: (() => void) | null) {
  const gain = gainNodes.get(audio);

  /* その場で止めるとき
     ・audio.volume が効くブラウザ（つまみを使っていない）
     ・もう止まっている（雑音は出ない）
     ・作業台が動いていない（時計が止まっていて、音量を下げられない。音も出ていない） */
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
          return;
        }

        // 止め終わったので、音量つまみを「ほんとうの大きさ」へ戻しておく（次に play() したときのため）
        setGainValue(gain, targetVolumes.get(audio) ?? 1, false);

        pending.onPaused?.();
      },
      (pauseFadeLeadSeconds + pauseFadeSeconds) * 1000 + 20
    ),
    rewind,
    onPaused,
    release: false,
  };

  pendingPauses.set(audio, pending);
}

/* その場で止める（rewind: true なら、曲の先頭へ戻す） */
function pauseNow(audio: HTMLAudioElement, rewind: boolean) {
  try {
    audio.pause();

    if (rewind) {
      audio.currentTime = 0;
    }
  } catch {
    // 何もしない
  }
}

/* audio が鳴っているか

   止めている途中（音量を0へ下げている最中）の曲は、まだ pause() していないが、
   もう止まることが決まっているので「鳴っていない」とみなす */
export function isElementPlaying(audio: HTMLAudioElement) {
  return !audio.paused && !pendingPauses.has(audio);
}

/* 止める予約を取り消す（止めている途中の曲を、また鳴らすとき）

   play() の直前に呼ぶ
   止める予約が無いときは、何もしない */
export function cancelElementPause(audio: HTMLAudioElement) {
  const pending = pendingPauses.get(audio);

  if (!pending) {
    return;
  }

  clearTimeout(pending.timer);
  pendingPauses.delete(audio);

  const gain = gainNodes.get(audio);

  // 0へ下げかけていた音量を、ほんとうの大きさへ なめらかに戻す
  if (gain) {
    setGainValue(gain, targetVolumes.get(audio) ?? 1, true);
  }
}

/* ページを離れるときに、audio を作業台（AudioContext）から外す

   作業台はサイト全体で1つを使い回していて、閉じない（→ utils/audioContext.ts）
   つないだままにすると、離れたページの mp3 の音が作業台に残りつづけ、
   ページを行き来するほど、作業台の仕事（と使うメモリ）が増えていってしまう

   ・かならず pauseElement() のあとに呼ぶ
     音量を下げている途中なら、止め終わってから外す（途中で外すと「ぶつっ」と鳴る）
   ・外したAudioは、もう鳴らせない（createMediaElementSource() は1つのAudioに1回しか呼べないため）
     ページを離れるときの後始末で、もう使わないAudioにだけ使う
   ・つまみに通していないAudio（パソコン・Android など）は、何もしない */
export function releaseElement(audio: HTMLAudioElement) {
  const pending = pendingPauses.get(audio);

  if (pending) {
    pending.release = true;
    pending.onPaused = null;
    return;
  }

  disconnectElement(audio);
}

/* releaseElement() の中身（その場で外す） */
function disconnectElement(audio: HTMLAudioElement) {
  try {
    sourceNodes.get(audio)?.disconnect();
    gainNodes.get(audio)?.disconnect();
  } catch {
    // 何もしない
  }

  sourceNodes.delete(audio);
  gainNodes.delete(audio);
  targetVolumes.delete(audio);
}

/* 指でさわる・クリックする・キーを押すたびに、作業台（AudioContext）を起こしておく

   iPhone では、作業台を「さわった瞬間」の外で作ったり起こしたりすると、
   お休み中（suspended）のまま起きてくれない
   BGM は、ボタンを押してから少し待って（setTimeout で）鳴らしはじめるので、
   そのとき初めて作業台を作ると、音量つまみに通した BGM が無音になってしまう
   また、画面を消して戻ってきたときも、作業台はお休み中（interrupted）になっている

   そこで、さわった瞬間ごとに作業台を用意して、起きていなければ起こしておく
   （audio.volume が効くブラウザでは、つまみを使わないので何もしない）

   getContext … 作業台を返す関数（setElementVolume() に渡すものと同じ）
   backgroundPlayback … true なら、画面を消しても鳴りつづけるようにする（サウンドトラックだけ。くわしくは、このファイルの先頭）
                        さわった瞬間ごとに navigator.audioSession を 'playback' にして、受付をやめるときに 'auto' へ戻す
                        （このサイトはページを移っても同じ画面のまま中身だけ入れかわるので、戻さないと、ほかのページにも残ってしまう）
   返す関数を呼ぶと、受付をやめる（ページを離れるときの後始末用） */
export function keepAudioContextAwake(getContext: () => AudioContext | null, { backgroundPlayback = false } = {}) {
  if (!import.meta.client) {
    return () => {};
  }

  function wakeAudioContext() {
    if (canSetElementVolume()) {
      return;
    }

    // 作業台を起こす前に「音楽を再生するページ」と伝えておく（サウンドトラックだけ）
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
     （指を置いたとき＝touchstart・pointerdown では、起こせないことがある） */
  const eventNames = ['touchend', 'click', 'keydown'] as const;

  for (const eventName of eventNames) {
    window.addEventListener(eventName, wakeAudioContext, { capture: true, passive: true });
  }

  return () => {
    for (const eventName of eventNames) {
      window.removeEventListener(eventName, wakeAudioContext, { capture: true });
    }

    // ほかのページ（ゲーム本編・ミニゲーム）では、画面を消したら音も止まる、今までどおりに戻す
    if (backgroundPlayback && !canSetElementVolume()) {
      setAudioSessionType('auto');
    }
  };
}
