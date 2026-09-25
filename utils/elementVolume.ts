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

     効くかどうかは、機種名ではなく「0.5 を入れて、0.5 が読めるか」で調べる

   ※ iPhone で音量つまみに通した音は、画面を消す・ほかのアプリへ切りかえると止まることがある
     （Web Audio は、画面が見えていないあいだ休むため）
   ============================================================ */

/* audio.volume が効くかどうか（null は「まだ調べていない」）

   調べるのは最初の1回だけ。答えはページを開いているあいだ変わらない */
let canSetVolumeCache: boolean | null = null;

function canSetElementVolume() {
  if (canSetVolumeCache === null) {
    try {
      const probe = new Audio();

      probe.volume = 0.5;
      canSetVolumeCache = Math.abs(probe.volume - 0.5) < 0.01;
    } catch {
      canSetVolumeCache = true;
    }
  }

  return canSetVolumeCache;
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
