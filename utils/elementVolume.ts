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
   （WeakMap なので、使わなくなったAudioは、つまみごと自然に片づく） */
const gainNodes = new WeakMap<HTMLAudioElement, GainNode>();

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
    } catch {
      // 通せなかったときは、今までどおり（音量は変わらないが、音は鳴る）
      return;
    }
  }

  gain.gain.value = safeVolume;
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
