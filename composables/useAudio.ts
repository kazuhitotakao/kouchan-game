/* ============================================================
   音（効果音・BGM・音量）のまとめ

   ■ ここがやること
     ・効果音（Web Audio API でその場で作る音・録音した音声ファイル：救急車・犬・噴水）
     ・BGM 7本（公園1・公園2・タイトル・いやいや・リザルト・GAME OVER・こもれびの広場）
     ・BGMのフェードイン、「少し待ってから鳴らす」予約
     ・音量スライダーとミュート、その localStorage への保存と読みこみ
     ・ページを離れるときの後片づけ

   ■ ここがやらないこと
     ・ゲームの状態を書きかえること（親からもらった ref は読むだけ）
     ・いつどの曲へ切りかえるか、という判断（pages/index.vue が決めて、こちらは鳴らす・止めるだけ）
       ただし applySoundEnabledChange() だけは、ミュート解除したときに「いまの画面ならどの曲か」を自分で選ぶ
   ============================================================ */

import { ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import type { GameEvent } from '~/types/game';

/* S+ランク限定の、うた入りリザルトBGMの場所（→ getResultBgmSrc） */
import { sPlusSongSrc } from '~/utils/sPlusSong';

/* mp3 の音の音量は、かならずこれを通して入れる（audio.volume に直接入れても、iPhone では変わらないため） */
import { cancelElementPause, createGameAudio, isElementPlaying, keepAudioContextAwake, pauseElement, playThroughSilentModeWhileVisible, preloadGameAudio, releaseElement, setElementVolume, usesWebAudioVolume, type GameAudio } from '~/utils/elementVolume';

/* ロック画面・メディアキーの ▶／⏸ を受け取る（ゲームでは押しても何もしない → startIgnoringMediaControls()） */
import { startMediaSession } from '~/utils/mediaSession';

/* 音の作業台（AudioContext）。サイト全体で1つを使い回す */
import { getSharedAudioContext } from '~/utils/audioContext';

/* 指で操作する画面か（音量スライダーが無いので、前回の音量を戻さない → restoreSoundSettings()） */
import { isTouchOnlyDevice } from '~/utils/touchDevice';

/* 音のほうから「いま画面はどうなっているか」を見るための値（どれも読むだけ） */
export type UseAudioOptions = {
  /* 起動画面の「▶ はじめる」を押したか（タイトルBGMを鳴らす画面かの判定に使う） */
  titleEntered: Ref<boolean>;

  /* 公園へ出発したか（ゲーム画面かどうか） */
  gameStarted: Ref<boolean>;

  currentEvent: Ref<GameEvent>;

  isTantrum: Ref<boolean>;

  /* いまリザルト画面（ゴール or GAME OVER）にいるか */
  isResultScene: ComputedRef<boolean>;

  /* ゲーム内の時刻（分）。10:30 を過ぎたら公園BGM2へ切りかえる判定に使う */
  currentMinutes: ComputedRef<number>;

  /* 決まったランク（S+ランクのときだけ、うた入りのリザルトBGMにする） */
  endingRank: Ref<string>;
};

export function useAudio(options: UseAudioOptions) {
  const { titleEntered, gameStarted, currentEvent, isTantrum, isResultScene, currentMinutes, endingRank } = options;

  /* ============================================================
     効果音（Web Audio API）

     音声ファイルは使わず、Web Audio API で、その場で音そのものを作って鳴らす
       Oscillator（音を出す）→ Gain（音量を調整）→ destination（スピーカー）
     ※ 救急車・犬・噴水だけは、本物らしい音色が要るので、録音した音声ファイルを鳴らす（→「音声ファイルの効果音」）
     ============================================================ */

  /* ゲームの音を鳴らすかどうか（効果音とBGMをまとめて切り替える）
     ※ ゲームのステータスではなく「設定」なので、もう一度あそぶときも戻さない */
  const soundEnabled = ref(true);

  const soundStorageKey = 'kouchan-game-sound-enabled';

  /* 音ぜんぶの大きさ（0〜100。BGMにも効果音にも、同じ割合でかかる → getSoundVolume()）

     0% ＝ ミュート。見た目と中身が食いちがわないよう、いつもセットで動かす
     ・スライダーを0%にした     … soundEnabled も false にする
     ・スライダーを0%から上げた … soundEnabled も true に戻す
     ・ミュートボタンを押した   … スライダーも 0% ⇄ もとの大きさ に動く
     （切りかえているのは changeSoundVolume() と toggleSound() の2か所だけ） */
  const soundVolumePercent = ref(100);

  /* ミュートする直前の大きさ（ミュートを解除したときに、ここへ戻す） */
  let volumeBeforeMute = 100;

  /* 音量を保存しておく localStorage のキー
     ※ 文字は前に決めたまま（-bgm-）。変えると、いま使っている人の設定が消えてしまうため */
  const soundVolumeStorageKey = 'kouchan-game-bgm-volume';

  /* もとの大きさに音量スライダーのぶんをかけた「実際に鳴らす大きさ」（BGMも効果音も、ここを通す）
     例：公園BGM（0.16）で、音量が50%なら → 0.08 */
  function getSoundVolume(baseVolume: number) {
    return Math.min(1, Math.max(0, baseVolume * (soundVolumePercent.value / 100)));
  }

  /* ミュートボタンを押したとき（0% ＝ ミュートなので、スライダーの位置もいっしょに動かす） */
  function toggleSound() {
    soundEnabled.value = !soundEnabled.value;

    if (soundEnabled.value) {
      soundVolumePercent.value = volumeBeforeMute > 0 ? volumeBeforeMute : 100;
    } else {
      if (soundVolumePercent.value > 0) {
        volumeBeforeMute = soundVolumePercent.value;
      }

      soundVolumePercent.value = 0;
    }

    applySoundVolume();
    saveSoundVolume();

    applySoundEnabledChange();
  }

  /* サウンドのON/OFFが変わったあとの、あと始末（BGMを止める・鳴らしなおす と、ON/OFFの保存）

     効果音は getAudioContext() が soundEnabled を見るので何もしなくてよいが、
     BGMは鳴っている曲なので、その場で止める・再開する
     ONに戻したときは、いまの画面に合う曲を1曲だけ、止めたところから再開する（resume〜）

     ■ 条件の順番が大事
       ・タイトルBGMの条件に titleEntered が要る（!gameStarted だけだと、起動画面でも鳴りだしてしまう）
       ・ゴールと GAME OVER は、いやいや関連より先に置く
         （いやいやの途中でゴール・GAME OVER になると、isTantrum が true のまま残っていることがあるため）
       ・いやいや関連は、公園BGMより先に置く（いやいや画面なのに公園BGMが鳴ってしまうため）
       ・「いやいや発生の結果を読んでいる最中」（場所はそのまま、isTantrum だけ true）は、わざと無音なので何も鳴らさない
       ・秘密の場所・秘密の小道は、公園BGMより先に置く（公園BGMが鳴って、2曲が重なってしまうため） */
  function applySoundEnabledChange() {
    if (soundEnabled.value) {
      if (titleEntered.value && !gameStarted.value) {
        resumeTitleBgm();
      } else if (gameStarted.value && currentEvent.value === 'goal') {
        resumeResultBgm();
      } else if (gameStarted.value && currentEvent.value === 'gameOver') {
        resumeGameOverBgm();
      } else if (gameStarted.value && currentEvent.value === 'tantrum') {
        resumeTantrumBgm();
      } else if (gameStarted.value && isTantrum.value) {
        // いやいや発生の結果カードを読んでいる最中（わざと無音）なので、何も鳴らさない
      } else if (gameStarted.value && (currentEvent.value === 'secretSpot' || currentEvent.value === 'secretPath')) {
        // 秘密の小道も、こもれびの広場と同じ「こもれびの奥で」
        resumeSecretBgm();
      } else if (gameStarted.value && !isResultScene.value) {
        resumeParkBgm();
      }
    } else {
      // OFFのときは pause() だけ（どこまで再生したかを覚えておく）。どの画面でも止まるように、ぜんぶの曲に声をかける
      pauseTitleBgm();
      pauseParkBgm();
      pauseSecretBgm();
      pauseTantrumBgm();
      pauseResultBgm();
      pauseGameOverBgm();
    }

    if (!import.meta.client) {
      return;
    }

    try {
      localStorage.setItem(soundStorageKey, String(soundEnabled.value));
    } catch {
      // 保存できなくても、開いているあいだのON/OFFは動く
    }
  }

  /* 作業台（AudioContext）を返す（サイト全体で1つを使い回す。音が出せないときは null） */
  function getAudioContext() {
    /* ここが効果音ON/OFFの「関所」
       効果音はどれも必ずこの関数を通るので、ここで null を返すだけで、すべての効果音がまとめて止まる
       （OFFのときは AudioContext も作らない） */
    if (!import.meta.client || !soundEnabled.value) {
      return null;
    }

    return getSharedAudioContext();
  }

  /* 効果音を鳴らしはじめる時刻を、ほんの少しだけ先にする（秒）

     作業台の時計（currentTime）は、実際に音を作っているところより少し遅れて見えている（画面の切りかえ中は、さらに遅れる）
     「いま」で予約すると、受けとったときには鳴りはじめの「すっと大きくする」ところを過ぎていて、「プツッ」と鳴る
     効果音を鳴らす時刻は、かならず getToneStartTime() から決める */
  const toneScheduleLead = 0.03;

  /* 効果音を鳴らしはじめる時刻（作業台の時計で、いま ＋ toneScheduleLead ＋ delay） */
  function getToneStartTime(context: AudioContext, delay = 0) {
    return context.currentTime + toneScheduleLead + delay;
  }

  /* ============================================================
     作業台が止まっているあいだに、効果音をためこまないようにする

     作業台は、操作する前（suspended）・iPhone でほかのアプリに音を取られたとき（interrupted）などは、時計が進まない
     そのあいだに鳴らした効果音は、どれも同じ時刻に予約されるので、動きだした瞬間に、ぜんぶがまとめて鳴ってしまう
     （ミニゲームで「ぽこっ」が何回も繰り返し聞こえるのは、これ）
     そこで、止まっているあいだに鳴らせるのは、はじめの stalledToneWindow ミリ秒ぶんだけにして、あとは捨てる
     （「キラリン♪」のように音を重ねる効果音1つぶんは、そのまま鳴らせる。まとめて鳴るより、鳴らないほうが耳にやさしい）
     ============================================================ */
  const stalledToneWindow = 300;

  /* 作業台が止まっているあいだに、はじめて効果音を鳴らした時刻（実際の時計。0 = 止まっていない） */
  let stalledToneStartedAt = 0;

  function canScheduleTone(context: AudioContext) {
    if (context.state === 'running') {
      stalledToneStartedAt = 0;
      return true;
    }

    const now = performance.now();

    if (stalledToneStartedAt === 0) {
      stalledToneStartedAt = now;
      return true;
    }

    // 1つ目と同時に鳴らすぶん（重ねている音）までは鳴らし、それより後のぶんは捨てる
    return now - stalledToneStartedAt <= stalledToneWindow;
  }

  /* 音を1つだけ鳴らす、共通の関数

     frequency    … 音の高さ（Hz）。440ならピアノの「ラ」
     startTime    … いつ鳴らしはじめるか（作業台の時計の時刻）
     duration     … 音の長さ（秒）
     volume       … 効果音ごとの「もとの大きさ」（音量スライダーのぶんは、この中でかける）
     type         … 波の形。sine と triangle は、どちらも丸くてやさしい音
     endFrequency … 指定すると、その高さまで音程がなめらかに変化する
     ※ OscillatorNode は使い捨てなので、鳴らすたびに作る */
  function playTone(frequency: number, startTime: number, duration: number, volume: number, type: OscillatorType = 'sine', endFrequency?: number) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    if (!canScheduleTone(context)) {
      return;
    }

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startTime);

      if (endFrequency !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
      }

      const effectVolume = getSoundVolume(volume);

      // 0（ミュート）なら鳴らさない（exponentialRampToValueAtTime() は 0 を受け取れないため）
      if (effectVolume <= 0) {
        return;
      }

      /* 音量の動き（これが無いと、鳴りはじめと鳴り終わりに「ブツッ」と雑音が入る）
         ① ほぼ無音から ② 0.015秒で目的の音量まで上げ ③ 鳴り終わりに向かって下げる
         ※ 「ほぼ0」を effectVolume からの割合で出すのが大事
           決まった数字（0.001 など）だと、音量を下げたときにそちらのほうが大きくなり、鳴り終わりで音が上がってしまう */
      const nearSilent = effectVolume * 0.02;

      gain.gain.setValueAtTime(nearSilent, startTime);
      gain.gain.exponentialRampToValueAtTime(effectVolume, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(nearSilent, startTime + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.02);
    } catch {
      // 音が鳴らなくても、ゲームは止めない
    }
  }

  /* ① コマンド決定音「ポン♪」（鋭くならないよう triangle） */
  function playDecisionSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(700, getToneStartTime(context), 0.09, 0.06, 'triangle');
  }

  /* ② アイテム発見音「キラリン♪」（ラ → ミ → 高いソ と上っていく）
     決定音と同時だと聞き取りにくいので、鳴らす時刻だけ 0.06秒うしろへずらす */
  function playItemSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = getToneStartTime(context, 0.06);

    playTone(880, start, 0.12, 0.05, 'sine');
    playTone(1174.7, start + 0.07, 0.12, 0.05, 'sine');
    playTone(1568, start + 0.14, 0.16, 0.05, 'sine');
  }

  /* ③ いやいや発生音「ポヨヨン……」（音程を下げてしょんぼり感を出す。怖くならないよう triangle）
     決定音・アイテム音のあとに聞こえるよう、0.12秒ずらす */
  function playTantrumSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(320, getToneStartTime(context, 0.12), 0.28, 0.07, 'triangle', 170);
  }

  /* ④ ゴール音「タタターン♪」（短い明るいファンファーレ。最後の音だけ長めに伸ばして締めくくる） */
  function playGoalSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = getToneStartTime(context);

    playTone(783.99, start, 0.18, 0.08, 'sine'); // ソ
    playTone(1046.5, start + 0.12, 0.18, 0.08, 'sine'); // 高いド
    playTone(1174.7, start + 0.24, 0.18, 0.08, 'sine'); // 高いレ
    playTone(1568, start + 0.38, 0.6, 0.09, 'sine'); // 高いソ
  }

  /* ⑤ こもれびを取った音「ピコッ♪」（ミニゲーム用。何度も鳴るので、キラリン♪より短く・小さく） */
  function playSunlightSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = getToneStartTime(context);

    playTone(1318.5, start, 0.08, 0.04, 'sine'); // 高いミ
    playTone(1760, start + 0.06, 0.12, 0.04, 'sine'); // 高いラ
  }

  /* ⑥ 枝に当たった音「ぽこっ」（ミニゲーム用。いやいや発生音をずっと短くして「ちょっとぶつかっただけ」に） */
  function playBranchBumpSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(300, getToneStartTime(context), 0.12, 0.05, 'triangle', 190);
  }

  /* ⑥-2 カウントダウンの音「ピッ」（ミニゲームの「3」「2」「1」用）
     「3」は決定音と同時に出るので、delay で少しうしろへずらす */
  function playCountdownSound(delay = 0) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(880, getToneStartTime(context, delay), 0.08, 0.05, 'triangle'); // ラ
  }

  /* ⑥-3 スタートの音「ピーン♪」（「ピッ」の1オクターブ上を長めに。時報と同じ形で、始まったことが耳だけでも分かる） */
  function playCountdownStartSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(1760, getToneStartTime(context), 0.3, 0.05, 'triangle'); // 高いラ
  }

  /* ⑥-4 はやく進みはじめた音「ヒュッ」（ミニゲーム「どこまで行ける？」の加速用）

     風を切る音には音程が無いので、ガサガサ音（⑧）と同じくホワイトノイズから作る
     通す高さ（bandpass フィルター）を 500Hz → 2400Hz へ動かして、風が前へぬけていくように聞かせる
     （せまい高さだけを通すぶん音が小さくなるので、数字はガサガサ音と同じくらい大きめ）
     ※ BGMの速さは変えない（→ data/secretPathEndless.ts） */
  function playBoostSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    if (!canScheduleTone(context)) {
      return;
    }

    const effectVolume = getSoundVolume(0.22);

    // 0（ミュート）なら鳴らさない（exponentialRampToValueAtTime() は 0 を受け取れないため）
    if (effectVolume <= 0) {
      return;
    }

    try {
      const startTime = getToneStartTime(context);
      const duration = 0.22;

      // ① でたらめな数字の列（ホワイトノイズ）を作る
      const frameCount = Math.floor(context.sampleRate * duration);
      const buffer = context.createBuffer(1, frameCount, context.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < frameCount; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();

      noise.buffer = buffer;

      // ② 通す高さを、低い所から高い所へ動かす（Q … 大きいほど「ヒュー」と笛っぽくなる）
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(1.2, startTime);
      filter.frequency.setValueAtTime(500, startTime);
      filter.frequency.exponentialRampToValueAtTime(2400, startTime + duration);

      // ③ 音量の動き（playTone と同じ。風が近づいてくる感じを出すため、上げるところを少しゆっくりに）
      const nearSilent = effectVolume * 0.02;

      gain.gain.setValueAtTime(nearSilent, startTime);
      gain.gain.exponentialRampToValueAtTime(effectVolume, startTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(nearSilent, startTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);

      noise.start(startTime);
      noise.stop(startTime + duration);
    } catch {
      // 音が鳴らなくても、ゲームは止めない
    }
  }

  /* ⑦ 転倒音「ヒュッ、ポテッ」（とつぜんのできごと「こうちゃんがころんだ」用）

     ① ヒュッ … 高めから下がる（つまずいた） ② ポテッ … 低めで丸い音（地面にぺたんとついた）
     ・ほかの効果音よりずっと低い音で、人の耳は低い音ほど小さく感じるので、数字は大きめ（とくに②）
     ・「ドスン！」のような重い音にはしない（小さい子が芝生でころんだくらいの、やわらかい音にする）
     ・少し待ってから鳴らす（決定音「ポン♪」と重なって、画面が切りかわる前に転ぶ音が聞こえないように） */

  /* 転倒音を鳴らしはじめるまでの待ち時間（秒） */
  const fallDownSoundDelay = 0.45;

  function playFallDownSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = getToneStartTime(context, fallDownSoundDelay);

    playTone(260, start, 0.1, 0.12, 'triangle', 150); // ① ヒュッ
    playTone(120, start + 0.11, 0.15, 0.18, 'triangle', 70); // ② ポテッ
  }

  /* ⑧ 葉っぱのガサガサ音「ササッ、ガサッ」（とつぜんのできごと「テントウムシ発見！」用）

     葉っぱがこすれる音には音程が無いので、playTone() の波では作れない
     でたらめな数字の列（ホワイトノイズ）を鳴らし、フィルターで高い音を削って、やわらかい葉ずれの音にする
     （そのままだと「シャーッ」という砂あらしの音になるため）
     ① ササッ … 小さめ（葉っぱがかすかにゆれた） ② ガサッ … 少し大きめ（テントウムシが顔を出した）
     ※ 高い音を削るぶん小さく聞こえるので、数字は大きめ */

  /* ガサガサ音を鳴らしはじめるまでの待ち時間（秒。転倒音と同じ理由・同じ長さ） */
  const ladybugRustleDelay = 0.45;

  /* ガサガサ音を1つだけ鳴らす（①ササッ と ②ガサッ で、何回も呼ぶ）
     filterFrequency … この高さ（Hz）より上を削る。小さいほど、こもったやわらかい音になる */
  function playRustleNoise(startTime: number, duration: number, volume: number, filterFrequency: number) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    if (!canScheduleTone(context)) {
      return;
    }

    const effectVolume = getSoundVolume(volume);

    // 0（ミュート）なら鳴らさない（exponentialRampToValueAtTime() は 0 を受け取れないため）
    if (effectVolume <= 0) {
      return;
    }

    try {
      /* ① でたらめな数字の列（ホワイトノイズ）を作る

         ただの乱数だと「スーッ」と平らな音になるので、おおざっぱなゆれ（rough）をかけて、音の粒に濃淡をつける
         この濃淡が、葉っぱがこすれる「ガサッ、ガサッ」というざらつきになる
         roughStep … ゆれを作りなおす間かく（細かすぎると平らな音に戻り、粗すぎるとブツブツ途切れる） */
      const frameCount = Math.floor(context.sampleRate * duration);
      const buffer = context.createBuffer(1, frameCount, context.sampleRate);
      const data = buffer.getChannelData(0);

      const roughStep = Math.max(1, Math.floor(context.sampleRate / 900));
      let rough = 1;

      for (let i = 0; i < frameCount; i += 1) {
        if (i % roughStep === 0) {
          rough = 0.15 + Math.random() * 0.85;
        }

        data[i] = (Math.random() * 2 - 1) * rough;
      }

      const noise = context.createBufferSource();
      const filter = context.createBiquadFilter(); // 高い音を削る
      const highpass = context.createBiquadFilter(); // 低い音を削る
      const gain = context.createGain();

      noise.buffer = buffer;

      // ② 高すぎる「シャー」を削る
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFrequency, startTime);

      // ③ 低すぎる「ゴロゴロ」も削る（残っていると「ボフッ」とこもった重い音になるため）
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(700, startTime);

      // ④ 音量の動き（playTone と同じ。葉ずれは「パッと鳴って、すっと消える」ので、上げるところを短く）
      const nearSilent = effectVolume * 0.02;

      gain.gain.setValueAtTime(nearSilent, startTime);
      gain.gain.exponentialRampToValueAtTime(effectVolume, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(nearSilent, startTime + duration);

      noise.connect(filter);
      filter.connect(highpass);
      highpass.connect(gain);
      gain.connect(context.destination);

      noise.start(startTime);
      noise.stop(startTime + duration);
    } catch {
      // 音が鳴らなくても、ゲームは止めない
    }
  }

  function playLadybugRustleSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = getToneStartTime(context, ladybugRustleDelay);

    /* 「ササッ」も「ガサッ」も、短い粒を少しずつずらして重ねる（1粒だけだと「ポッ」と単発に聞こえるため）
       数字は順に（鳴らしはじめ, 長さ, 大きさ, 高い音を削る位置）
       粒の長さも間かくもそろえないのは、等間かくだと機械のように聞こえるため */

    // ① ササッ（小さめ・高めの粒を3つ）
    playRustleNoise(start, 0.05, 0.11, 2600);
    playRustleNoise(start + 0.035, 0.06, 0.14, 2100);
    playRustleNoise(start + 0.085, 0.05, 0.09, 2400);

    // ② ガサッ（①のあと、少し間を空けて。大きめ・低めの粒を4つ）
    playRustleNoise(start + 0.2, 0.07, 0.18, 1700);
    playRustleNoise(start + 0.245, 0.08, 0.24, 1300);
    playRustleNoise(start + 0.305, 0.07, 0.19, 1500);
    playRustleNoise(start + 0.355, 0.06, 0.12, 1200);
  }

  /* ============================================================
     音声ファイルの効果音（救急車のサイレン・犬の鳴き声・噴水の音）

     本物らしい音色が要り、計算では作れないので、この3つだけは録音した音声ファイルを鳴らす
     （BGMと同じく createGameAudio() で作る。効果音なので loop はしない）
     ============================================================ */

  /* 音声ファイルの効果音の音量（録音の大きさがちがうので、耳で聞いてそろうように音源ごとに決める）
     ※ 計算して作る効果音の数字とは、くらべなくてよい（録音の大きさしだいで、必要な数字が変わるため） */
  const ambulanceSirenVolume = 0.15;

  const dogBarkVolume = 0.15;

  const fountainVolume = 0.15;

  /* 音声ファイルの効果音を鳴らしはじめるまでの待ち時間（ミリ秒）
     転倒音・ガサガサ音と同じ理由・同じ長さ（あちらは作業台の時計なので秒、こちらは setTimeout なのでミリ秒）
     ※ 音源の頭に無音が入っていると、そのぶん鳴りだしが遅く聞こえる */
  const fileSoundDelay = 450;

  /* 音声ファイルの効果音（null は「まだ作っていない」）
     ※ ここで new Audio() をしない（サーバー側には Audio が無いため） */
  let ambulanceSirenSe: GameAudio | null = null;
  let dogBarkSe: GameAudio | null = null;
  let fountainSe: GameAudio | null = null;

  /* 「あとで鳴らす」の予約票（ページを離れるときに取り消すため）
     とつぜんのできごとは一度に1つしか起きないので、予約は1つだけ持てばよい */
  let fileSoundTimer: ReturnType<typeof setTimeout> | null = null;

  /* 「あとで鳴らす」の予約を取り消す（残っていると、ページを離れたあとに鳴りだしてしまう） */
  function cancelFileSound() {
    if (fileSoundTimer === null) {
      return;
    }

    clearTimeout(fileSoundTimer);
    fileSoundTimer = null;
  }

  /* 音声ファイルの効果音を鳴らす（3つとも、ここを通す）

     cached … すでに作ってあるもの（初めてのときは null）。返す値を、呼んだ側で覚えてもらう
     ・一度作ったものは使い回す（鳴らすたびに作ると、mp3 の読み込みが積み上がって重くなるため）
     ・サウンドOFF・音量0%のときは、mp3 の読み込みもしない（getAudioContext() の関所を通らないので、自分で見る）
     ・決定音と重ならないよう、少し待ってから鳴らす（待たせるのは音だけで、ゲームの処理はすぐ進む）
       作るのは待たずに、ここですぐ（待っているあいだに読み込みが進むので、鳴りだしも速くなる） */
  function playFileSound(src: string, baseVolume: number, cached: GameAudio | null) {
    if (!import.meta.client) {
      return cached;
    }

    if (!soundEnabled.value) {
      return cached;
    }

    // 「そもそも鳴らす必要があるか」だけを見る（実際の音量は、待ち時間のあとで計算しなおす）
    if (getSoundVolume(baseVolume) <= 0) {
      return cached;
    }

    try {
      const sound = cached ?? createGameAudio(src, getAudioContext);

      // 前の予約が残っていたら取り消す（二重に鳴らさないため）
      cancelFileSound();

      fileSoundTimer = setTimeout(() => {
        fileSoundTimer = null;

        // 待っているあいだにOFF・0%にされていたら鳴らさない。音量は、鳴らす直前の設定で計算しなおす
        if (!soundEnabled.value) {
          return;
        }

        const delayedVolume = getSoundVolume(baseVolume);

        if (delayedVolume <= 0) {
          return;
        }

        try {
          setElementVolume(sound, delayedVolume, getAudioContext);

          // 必ず先頭から鳴らす（前に鳴らし終わったものは最後まで進んだままなので、戻さないと2回目から鳴らない）
          sound.currentTime = 0;

          // ブラウザに止められることがあるので、失敗しても何もしない
          sound.play().catch(() => {});
        } catch {
          // 音が鳴らなくても、ゲームは止めない
        }
      }, fileSoundDelay);

      return sound;
    } catch {
      // 音が鳴らなくても、ゲームは止めない
      return cached;
    }
  }

  /* とつぜんのできごとの効果音を鳴らす（「どのできごとで、どの音か」をここ1か所にまとめる）
     音の作りかた（音声ファイル／Web Audio API）は2通りあるが、呼ぶ側は気にしなくてよい */
  function playSuddenEventSound(event: GameEvent) {
    if (event === 'emergencySiren') {
      ambulanceSirenSe = playFileSound('/audio/sfx/ambulance-siren.mp3', ambulanceSirenVolume, ambulanceSirenSe);
      return;
    }

    if (event === 'dog') {
      dogBarkSe = playFileSound('/audio/sfx/dog-bark.mp3', dogBarkVolume, dogBarkSe);
      return;
    }

    if (event === 'fountain') {
      fountainSe = playFileSound('/audio/sfx/fountain.mp3', fountainVolume, fountainSe);
      return;
    }

    if (event === 'ladybug') {
      playLadybugRustleSound();
      return;
    }

    if (event === 'fallDown') {
      playFallDownSound();
    }
  }

  /* ============================================================
     公園のBGM

     BGMは何十秒もある曲で計算では作れないので、録音した mp3 を再生する
     作るのは createGameAudio()（iPhone・iPad では BufferedAudio。使いかたは new Audio() と同じ）
     ============================================================ */

  /* BGMの音量（録音の大きさがちがうので、耳で聞いてそろうように曲ごとに決める）
     ※ BGMはずっと後ろで流れるので、大きくしすぎると効果音が聞こえにくくなる */
  const titleBgmVolume = 0.22;

  /* 公園BGM（タイトルBGMより録音が大きいので、少し下げてそろえる） */
  const parkBgmVolume = 0.16;

  /* 午前後半（10:30以降）の公園BGM */
  const parkBgm2Volume = 0.16;

  const tantrumBgmVolume = 0.17;

  const resultBgmVolume = 0.17;

  /* GAME OVER BGM（リザルトBGMとは別の曲で、録音の大きさもちがうので、専用の数字にしてある） */
  const gameOverBgmVolume = 0.17;

  const secretBgmVolume = 0.16;

  /* 公園BGM（null は「まだ作っていない」）
     ※ ここで new Audio() をしない（サーバー側には Audio が無いため） */
  let parkBgm: GameAudio | null = null;

  /* 公園BGMを用意して返す（初めて必要になったときだけ作る）
     ※ ここでは soundEnabled を見ない（OFFにした瞬間に、鳴っている曲を止めるためにも使うため） */
  function getParkBgm() {
    if (!import.meta.client) {
      return null;
    }

    try {
      if (!parkBgm) {
        parkBgm = createGameAudio('/audio/park-bgm.mp3', getAudioContext);

        parkBgm.loop = true;

        setElementVolume(parkBgm, getSoundVolume(parkBgmVolume), getAudioContext);
      }

      return parkBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* 午前後半（10:30以降）の公園BGM（つくりは parkBgm と同じ） */
  let parkBgm2: GameAudio | null = null;

  function getParkBgm2() {
    if (!import.meta.client) {
      return null;
    }

    try {
      if (!parkBgm2) {
        parkBgm2 = createGameAudio('/audio/park-bgm2.mp3', getAudioContext);

        parkBgm2.loop = true;

        setElementVolume(parkBgm2, getSoundVolume(parkBgm2Volume), getAudioContext);
      }

      return parkBgm2;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* 公園BGMが「午前後半の曲」に変わる時刻（ゲーム内の 10:30 を分に直したもの） */
  const parkBgm2StartMinutes = 10 * 60 + 30;

  /* いまは「午前後半の曲（BGM2）」を使う時間か
     ※ 12:00を過ぎるとゴールで、公園BGMはどちらも鳴らさないので、12:00のことは考えなくてよい */
  function shouldUseParkBgm2() {
    return currentMinutes.value >= parkBgm2StartMinutes;
  }

  /* いまの時間に合う公園BGMを返す（09:00〜10:29 … BGM1 ／ 10:30〜 … BGM2）
     曲を選ぶのはここ1か所なので、呼ぶ側は どちらの曲かを気にしなくてよい */
  function getCurrentParkBgm() {
    return shouldUseParkBgm2() ? getParkBgm2() : getParkBgm();
  }

  /* いまの時間に合う公園BGMの音量（曲と音量は、いつもセットで選ぶ） */
  function getCurrentParkBgmVolume() {
    return shouldUseParkBgm2() ? parkBgm2Volume : parkBgmVolume;
  }

  /* いま鳴らしている公園BGM（鳴らしていないときは null）
     10:30を過ぎたときに、BGM1のままなら切り替え、すでにBGM2なら何もしない（頭から鳴りなおさない）を見わけるため */
  let activeParkBgm: GameAudio | null = null;

  /* BGMがフェードインしきるまでの長さ（ミリ秒。タイトルBGM以外のBGMで共通） */
  const bgmFadeInDuration = 1000;

  /* フェードインの途中経過を進める係の番号（していないときは null） */
  let bgmFadeTimer: ReturnType<typeof setInterval> | null = null;

  /* いまフェードインの最中にある曲（途中でやめたときに、どの曲の音量を戻すかが分かるように） */
  let fadingBgm: GameAudio | null = null;

  /* その曲の「曲ごとの音量」（音量スライダーのぶんをかける前の数字。
     フェードの途中でスライダーを動かされても追いつけるよう、実際の大きさは1回ごとに計算しなおす） */
  let fadingBgmBaseVolume = 0;

  /* BGMをフェードインさせる（0.05秒ごとに少しずつ上げる。いきなり ふだんの音量で始まると唐突に聞こえるため）
     2曲が同時に鳴ることはないので、フェードインの係は1つだけで足りる
     targetVolume … 上がりきったときの、曲ごとの音量 */
  function startBgmFadeIn(bgm: GameAudio, targetVolume: number) {
    // 前のフェードが残っていたら止める（音量の取り合いにならないように）
    cancelBgmFade();

    if (!import.meta.client) {
      return;
    }

    const stepMs = 50;
    const totalSteps = Math.ceil(bgmFadeInDuration / stepMs);
    let doneSteps = 0;

    setElementVolume(bgm, 0, getAudioContext);
    fadingBgm = bgm;
    fadingBgmBaseVolume = targetVolume;

    bgmFadeTimer = setInterval(() => {
      doneSteps += 1;

      const ratio = doneSteps / totalSteps;

      // 1回ごとに計算しなおす（途中でスライダーを動かしても、その場から新しい大きさに追いつくように）
      const goalVolume = getSoundVolume(fadingBgmBaseVolume);

      try {
        setElementVolume(bgm, ratio >= 1 ? goalVolume : goalVolume * ratio, getAudioContext);
      } catch {
        // 何もしない
      }

      if (ratio >= 1) {
        cancelBgmFade();
      }
    }, stepMs);
  }

  /* フェードインを途中でやめる（音量は ふだんの大きさへ戻す。小さいままだと、次に鳴らすときも小さいため） */
  function cancelBgmFade() {
    if (bgmFadeTimer === null) {
      return;
    }

    clearInterval(bgmFadeTimer);
    bgmFadeTimer = null;

    if (fadingBgm) {
      try {
        setElementVolume(fadingBgm, getSoundVolume(fadingBgmBaseVolume), getAudioContext);
      } catch {
        // 何もしない
      }

      fadingBgm = null;
      fadingBgmBaseVolume = 0;
    }
  }

  /* 「いまの時間に合う公園BGM」を最初から再生する（ゲームを始めたとき用） */
  function playParkBgm() {
    // getCurrentParkBgm() より先に見て、OFFのあいだは mp3 の読み込みそのものを起こさない
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getCurrentParkBgm();

    if (!bgm) {
      return;
    }

    // BGM1とBGM2が重ならないように、いったん両方止めてから始める
    stopParkBgm();

    try {
      bgm.currentTime = 0;

      // 10:30の切り替え判定に使う
      activeParkBgm = bgm;

      startBgmFadeIn(bgm, getCurrentParkBgmVolume());
      // 自動再生をブラウザに止められることがあるので、失敗しても何もしない
      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* 公園BGMを鳴らしはじめるまでの待ち時間（ミリ秒）

     新しい画面が出きってから、少し間を置いて曲が入るようにするため
     （場面の切りかわりは約0.4秒。そのあと約0.3秒の間があってから、曲がふわっと入る。決定音とも重ならない）
     ※ 0.5秒だと画面が出きってすぐ曲が入り、0.7秒の「少し間がある」ほうが合っていた
     タイトルBGM・GAME OVER BGM・こもれびの広場BGMも、同じ 0.7秒 */
  const parkBgmStartDelay = 700;

  /* 「あとで鳴らす」の予約票（null は「予約していない」。取り消すために取っておく） */
  let parkBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* 「少し待ってから鳴らす」曲の読みこみを、待ちはじめに始めておく

     iPhone・iPad では最後まで読みこんでから鳴らすので、待ち時間のあとで読みこみはじめると、
     はじめて鳴らす曲は「待ち時間 ＋ 読みこみの時間」だけ遅れてしまうため
     ※ サウンドOFFのときは、作らない・読みこまない
     ※ リザルトBGMは、待つ前に作っているので、これは使わない（→ playResultBgmSoon()） */
  function preloadBgmWhileWaiting(getBgm: () => GameAudio | null) {
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getBgm();

    if (bgm) {
      preloadGameAudio(bgm);
    }
  }

  /* 公園BGMを「少し待ってから」最初から鳴らす

     押した瞬間に曲が始まると、決定音「ポン♪」がかき消され、タイトルBGMからの切り替わりも唐突に聞こえるため
     ※ 待たせるのは音だけで、画面の切り替えやゲームの処理はすぐ進む
     ※ BGM1とBGM2のどちらにするかは、待ち時間が終わったときの時計で決まる（いやいやが10:40に終わったならBGM2） */
  function playParkBgmSoon() {
    // 前の予約が残っていたら取り消す（二重に鳴らさないため）
    cancelParkBgmStart();

    if (!import.meta.client) {
      return;
    }

    // ゲームの時計は行動したときにしか進まないので、待っているあいだに曲が変わることはない
    preloadBgmWhileWaiting(getCurrentParkBgm);

    parkBgmTimer = setTimeout(() => {
      parkBgmTimer = null;

      // 待っているあいだに画面が変わっていたら（タイトルへ戻った・ゴールやGAME OVERになった）、もう鳴らさない
      if (!gameStarted.value || isResultScene.value) {
        return;
      }

      playParkBgm();
    }, parkBgmStartDelay);
  }

  function cancelParkBgmStart() {
    if (parkBgmTimer === null) {
      return;
    }

    clearTimeout(parkBgmTimer);
    parkBgmTimer = null;
  }

  /* 公園BGMを「続きから」再生する（サウンドをONに戻したとき用）
     ここでも「いまの時間に合う曲」を選びなおす（音を消したまま10:30を過ぎたら、BGM2を先頭から鳴らす） */
  function resumeParkBgm() {
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getCurrentParkBgm();

    if (!bgm) {
      return;
    }

    // OFFにする前と曲が変わっている（またはまだ一度も鳴らしていない）ときは、最初から鳴らす
    if (activeParkBgm !== bgm) {
      playParkBgm();
      return;
    }

    try {
      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // 何もしない
    }
  }

  /* 公園BGMを1曲だけ一時停止する（まだ作っていない曲には、何もしない） */
  function pauseOneParkBgm(bgm: GameAudio | null) {
    if (!bgm) {
      return;
    }

    try {
      pauseElement(bgm);
    } catch {
      // 何もしない
    }
  }

  /* 公園BGMを一時停止する（どこまで再生したか・activeParkBgm は覚えたまま。ONに戻したとき、同じ曲なら続きから鳴らせるように）
     どちらの曲の時間帯でも確実に止まるよう、BGM1・BGM2の両方に声をかける */
  function pauseParkBgm() {
    // フェードインの途中なら、やめて音量を戻す（次に再開したとき、小さい音のままにならないように）
    cancelBgmFade();

    pauseOneParkBgm(parkBgm);
    pauseOneParkBgm(parkBgm2);
  }

  /* 公園BGMを1曲だけ完全に止める（まだ作っていない曲には、何もしない） */
  function stopOneParkBgm(bgm: GameAudio | null) {
    if (!bgm) {
      return;
    }

    try {
      pauseElement(bgm, { rewind: true });
    } catch {
      // 何もしない
    }
  }

  /* 公園BGMを完全に止める（先頭へ戻して、次はまた最初から鳴るようにする）
     どちらの曲が鳴っていても確実に止まるよう、BGM1・BGM2の両方を止める */
  function stopParkBgm() {
    /* 「あとで鳴らす」の予約も取り消す
       ※ かならず曲を止めるより前に置く（予約だけして曲をまだ作っていないこともあり、あとだと取り消せずに鳴りだすため） */
    cancelParkBgmStart();

    cancelBgmFade();

    stopOneParkBgm(parkBgm);
    stopOneParkBgm(parkBgm2);

    activeParkBgm = null;
  }

  /* 時間に合わせて、公園BGMをBGM1からBGM2へ切り替える（「次の場所を選ぶ」を押したときに呼ぶ）

     10:30になった瞬間ではなく、次の場面へ進むときに切り替える（結果カードを読んでいる途中で曲が変わると唐突なため）
     ・まだ10:30より前         → 何もしない
     ・すでにBGM2を鳴らしている → 何もしない（押すたびに頭から鳴りなおさない）
     ・10:30を過ぎたのにBGM1    → BGM1を止めて、少し間を空けてからBGM2へ */
  function switchParkBgmForCurrentTime() {
    if (!shouldUseParkBgm2()) {
      return;
    }

    /* いまBGM1を鳴らしているときだけ切り替える
       activeParkBgm が null（サウンドOFF中・鳴らす順番待ち中など）なら、あとで鳴らすときに時間を見て選びなおされる */
    if (activeParkBgm !== parkBgm) {
      return;
    }

    /* ① BGM1をその場で止めて ② 0.7秒待ってからBGM2をフェードインで鳴らす
       「Soon」を使うのは、決定音がかき消されず、いったん無音をはさんで「章が変わった」感じが出るため
       ※ ①を先にやる（先に止めないと、待っているあいだBGM1が鳴り続けて、急にぶつ切りになる） */
    stopParkBgm();
    playParkBgmSoon();
  }

  /* ============================================================
     タイトル画面のBGM（作りは公園BGMと同じ）

     2曲が同時に鳴らないよう、切り替えるときは「前の曲を止めてから、次の曲を鳴らす」
     ============================================================ */

  let titleBgm: GameAudio | null = null;

  /* タイトルBGMを用意して返す（ここでは soundEnabled を見ない。OFFにした瞬間に止めるためにも使うため） */
  function getTitleBgm() {
    if (!import.meta.client) {
      return null;
    }

    try {
      if (!titleBgm) {
        titleBgm = createGameAudio('/audio/title-bgm.mp3', getAudioContext);

        titleBgm.loop = true;

        setElementVolume(titleBgm, getSoundVolume(titleBgmVolume), getAudioContext);
      }

      return titleBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* タイトルBGMを「最初から」再生する（ページを開いたとき・「もう一度あそぶ」でタイトルに戻ったとき） */
  function playTitleBgm() {
    // getTitleBgm() より先に見て、OFFのあいだは mp3 の読み込みを起こさない
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getTitleBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0;

      // タイトルBGMだけは、フェードインさせずに そのまま鳴らす（曲の頭から そのまま鳴るほうが合っていたため）
      setElementVolume(bgm, getSoundVolume(titleBgmVolume), getAudioContext);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* タイトルBGMを鳴らしはじめるまでの待ち時間（ミリ秒） */
  const titleBgmStartDelay = 700;

  let titleBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* タイトルBGMを「少し待ってから」最初から鳴らす（押した瞬間に曲が始まると唐突に聞こえるため） */
  function playTitleBgmSoon() {
    cancelTitleBgmStart();

    if (!import.meta.client) {
      return;
    }

    preloadBgmWhileWaiting(getTitleBgm);

    titleBgmTimer = setTimeout(() => {
      titleBgmTimer = null;

      // 待っているあいだにゲームが始まっていたら、もう鳴らさない
      if (gameStarted.value) {
        return;
      }

      playTitleBgm();
    }, titleBgmStartDelay);
  }

  function cancelTitleBgmStart() {
    if (titleBgmTimer === null) {
      return;
    }

    clearTimeout(titleBgmTimer);
    titleBgmTimer = null;
  }

  /* タイトルBGMを「続きから」再生する（サウンドをONに戻したとき用） */
  function resumeTitleBgm() {
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getTitleBgm();

    if (!bgm) {
      return;
    }

    try {
      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // 何もしない
    }
  }

  /* タイトルBGMを一時停止する（どこまで再生したかは覚えたまま） */
  function pauseTitleBgm() {
    cancelBgmFade();

    if (!titleBgm) {
      return;
    }

    try {
      pauseElement(titleBgm);
    } catch {
      // 何もしない
    }
  }

  /* タイトルBGMを完全に止める（次はまた最初から鳴るようにする） */
  function stopTitleBgm() {
    cancelBgmFade();

    if (!titleBgm) {
      return;
    }

    try {
      pauseElement(titleBgm, { rewind: true });
    } catch {
      // 何もしない
    }
  }

  /* ============================================================
     いやいやタイムのBGM（作りは公園BGMと同じ）

     いちばん大事なのは「いつ切り替えるか」
     ① いやいやが発生した瞬間は、公園BGMを止めて「無音」にするだけ（通常行動の結果を、しんと静かな画面で読ませる）
     ② 「こうちゃんのところへ行く」で、いやいやタイムの画面へ移った瞬間に鳴らす（goToNextPlace()）
     ③ いやいやが終わっても、その瞬間には止めない（結果を読んでいるあいだ、画面はまだいやいやタイムのため）
     ④ 「次の場所を選ぶ」で、いやいやタイムの画面から出るときに止める（goToNextPlace()）
     ============================================================ */

  let tantrumBgm: GameAudio | null = null;

  /* いやいやBGMを用意して返す（ここでは soundEnabled を見ない。OFFにした瞬間に止めるためにも使うため） */
  function getTantrumBgm() {
    if (!import.meta.client) {
      return null;
    }

    try {
      if (!tantrumBgm) {
        tantrumBgm = createGameAudio('/audio/tantrum-bgm.mp3', getAudioContext);

        // いやいやが何回続いても、音が途切れないように
        tantrumBgm.loop = true;

        setElementVolume(tantrumBgm, getSoundVolume(tantrumBgmVolume), getAudioContext);
      }

      return tantrumBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* いやいやBGMを「最初から」再生する
     いやいやは1回ごとに独立した場面なので、毎回 曲の頭から始める（前のいやいやの続きからだと、場面が変わった感じがしない） */
  function playTantrumBgm() {
    // getTantrumBgm() より先に見て、OFFのあいだは mp3 の読み込みを起こさない
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getTantrumBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0;

      // フェードインの係は共用でよい（2曲が同時に鳴ることはなく、startBgmFadeIn() が前のフェードを取り消すため）
      startBgmFadeIn(bgm, tantrumBgmVolume);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* いやいやBGMを鳴らしはじめるまでの待ち時間（ミリ秒）
     いやいやタイムの場面が出きったころに鳴りはじめる長さ
     ほかのBGM（0.7秒）より短いのは、「すぐ なだめに行く」場面なので、間を置かずに曲が入るほうが合うため */
  const tantrumBgmStartDelay = 400;

  let tantrumBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* いやいやBGMを「少し待ってから」最初から鳴らす（待たせるのは音だけで、画面はすぐ切りかわる） */
  function playTantrumBgmSoon() {
    cancelTantrumBgmStart();

    if (!import.meta.client) {
      return;
    }

    preloadBgmWhileWaiting(getTantrumBgm);

    tantrumBgmTimer = setTimeout(() => {
      tantrumBgmTimer = null;

      // 待っているあいだに、いやいやタイムの画面から出ていたら、もう鳴らさない
      if (currentEvent.value !== 'tantrum') {
        return;
      }

      playTantrumBgm();
    }, tantrumBgmStartDelay);
  }

  function cancelTantrumBgmStart() {
    if (tantrumBgmTimer === null) {
      return;
    }

    clearTimeout(tantrumBgmTimer);
    tantrumBgmTimer = null;
  }

  /* いやいやBGMを「続きから」再生する（サウンドをONに戻したとき用） */
  function resumeTantrumBgm() {
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getTantrumBgm();

    if (!bgm) {
      return;
    }

    try {
      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // 何もしない
    }
  }

  /* いやいやBGMを一時停止する（どこまで再生したかは覚えたまま） */
  function pauseTantrumBgm() {
    cancelBgmFade();

    if (!tantrumBgm) {
      return;
    }

    try {
      pauseElement(tantrumBgm);
    } catch {
      // 何もしない
    }
  }

  /* いやいやBGMを完全に止める（次のいやいやが、前のいやいやの続きから鳴りださないように、先頭へ戻す） */
  function stopTantrumBgm() {
    // 「あとで鳴らす」の予約も取り消す（予約だけして、まだ鳴らしていないことがあるため）
    cancelTantrumBgmStart();

    cancelBgmFade();

    if (!tantrumBgm) {
      return;
    }

    try {
      pauseElement(tantrumBgm, { rewind: true });
    } catch {
      // 何もしない
    }
  }

  /* ============================================================
     リザルト画面のBGM（作りは公園BGMと同じ。通常ゴールの結果画面にいるあいだ）

     ※ GAME OVER画面で流すのは、この曲ではない（「途中で帰ることになった」場面なので、専用の曲を流す）
     ※ S+ランクのときだけ、うた入りの曲を流す
       入れもの・関数は同じものを使い、鳴らす前に getResultBgm() が src を差しかえる
     ※ ゴール音「タタターン♪」とは重ねない（少し間を空けてから曲を始める → playResultBgmSoon）
     ============================================================ */

  let resultBgm: GameAudio | null = null;

  /* 通常のリザルトBGMの音源（S+ランク用の sPlusSongSrc は、サウンドトラックと共用なので utils/sPlusSong.ts にある） */
  const resultBgmSrc = '/audio/result-bgm.mp3';

  /* 今回のランクに合ったリザルトBGMの音源（S+ランクだけ うた入り。Sランク以下・特殊エンドは通常版） */
  function getResultBgmSrc() {
    return endingRank.value === 'S+ランク' ? sPlusSongSrc : resultBgmSrc;
  }

  /* リザルトBGMを用意して返す（ここでは soundEnabled を見ない。OFFにした瞬間に止めるためにも使うため）
     Audio は1つを使いまわすが、同じページで何回も遊ぶと必要な曲が変わるので、呼ばれるたびに src を確かめる */
  function getResultBgm() {
    if (!import.meta.client) {
      return null;
    }

    try {
      const src = getResultBgmSrc();

      if (!resultBgm) {
        resultBgm = createGameAudio(src, getAudioContext);

        // 結果をゆっくり読んでいても、曲が途切れないように
        resultBgm.loop = true;

        setElementVolume(resultBgm, getSoundVolume(resultBgmVolume), getAudioContext);
      } else if (resultBgm.getAttribute('src') !== src) {
        /* 鳴らす曲が変わるときだけ差しかえる（同じ曲で差しかえると、「続きから」鳴らすときに先頭へ戻ってしまうため）
           ※ .src は「http://〜」の長い形で返ってきて、同じ曲でも食いちがうので、getAttribute('src') で比べる */
        resultBgm.src = src;
      }

      return resultBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* リザルトBGMを「最初から」再生する（ゴール音のあとに、ふわっと始まるようにフェードインさせる） */
  function playResultBgm() {
    // getResultBgm() より先に見て、OFFのあいだは mp3 の読み込みを起こさない
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getResultBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0;

      startBgmFadeIn(bgm, resultBgmVolume);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* リザルトBGMを鳴らしはじめるまでの待ち時間（ミリ秒。ゴール音のファンファーレが聞こえるように） */
  const resultBgmStartDelay = 1500;

  let resultBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* Audio を「あとから鳴らせる」状態にしておく（ボタンを押した瞬間に呼ぶこと）

     iPhone のブラウザは、Audio ごとに「さわった瞬間に一度 play() されたか」を覚えていて、
     そうされた Audio は、あとで いつ play() しても鳴らせる
     そこで、音を消したまま（muted）一度 play() して、すぐ止めておく（音は出ない）
     ・すでに鳴っている Audio は、止めてしまわないように さわらない */
  function unlockAudioElement(audio: GameAudio) {
    if (!audio.paused) {
      return;
    }

    const wasMuted = audio.muted;

    try {
      audio.muted = true;
      audio.play().catch(() => {});
      audio.pause();
    } catch {
      // 何もしない（鳴らせないときは、今までどおり鳴らないだけ）
    }

    audio.muted = wasMuted;
  }

  /* リザルトBGMを「少し待ってから」最初から鳴らす（待たせるのは音だけで、結果画面はすぐ出る） */
  function playResultBgmSoon() {
    cancelResultBgmStart();

    if (!import.meta.client) {
      return;
    }

    /* 待つ前に「あとから鳴らせる」状態にしておく（→ unlockAudioElement）
       iPhone のブラウザでは、ボタンを押してから1秒以上たって新しい Audio を play() しても止められる
       待ち時間（1.5秒）は1秒をこえるので、これが無いとエンディングの曲が鳴らなかった
       ※ この関数は、ゴールのボタンを押した流れ（goToGoal()）の中から、待たずに呼ばれている */
    if (soundEnabled.value) {
      const bgm = getResultBgm();

      if (bgm) {
        unlockAudioElement(bgm);
      }
    }

    resultBgmTimer = setTimeout(() => {
      resultBgmTimer = null;

      // 待っているあいだに「もう一度あそぶ」でタイトルへ戻っていたら、もう鳴らさない
      if (currentEvent.value !== 'goal') {
        return;
      }

      playResultBgm();
    }, resultBgmStartDelay);
  }

  function cancelResultBgmStart() {
    if (resultBgmTimer === null) {
      return;
    }

    clearTimeout(resultBgmTimer);
    resultBgmTimer = null;
  }

  /* リザルトBGMを「続きから」再生する（サウンドをONに戻したとき用） */
  function resumeResultBgm() {
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getResultBgm();

    if (!bgm) {
      return;
    }

    try {
      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // 何もしない
    }
  }

  /* リザルトBGMを一時停止する（どこまで再生したかは覚えたまま） */
  function pauseResultBgm() {
    cancelBgmFade();

    if (!resultBgm) {
      return;
    }

    try {
      pauseElement(resultBgm);
    } catch {
      // 何もしない
    }
  }

  /* リザルトBGMを完全に止める（「もう一度あそぶ」で使う） */
  function stopResultBgm() {
    /* 「あとで鳴らす」の予約も取り消す
       ※ かならず「まだ作っていないなら終わり」より前に置く
         （ゴール音のあいだに「もう一度あそぶ」を押すと、予約だけある状態のことがあり、あとだとタイトル画面で鳴りだすため） */
    cancelResultBgmStart();

    cancelBgmFade();

    if (!resultBgm) {
      return;
    }

    try {
      pauseElement(resultBgm, { rewind: true });
    } catch {
      // 何もしない
    }
  }

  /* ============================================================
     GAME OVER画面のBGM（作りはリザルトBGMと同じ）

     ゴール（12時まで遊びきった）と GAME OVER（途中で帰る）は気持ちがまったくちがうので、曲も分ける
     入れもの・関数・音量も、リザルトBGMとはぜんぶ別にしてある

     ① checkGameOver() で GAME OVER が決まり、それまでの曲を止める
     ② playGameOverBgmSoon() で「0.7秒あとに鳴らす」予約をする
     ③ 0.7秒の無音のあと、曲の先頭からフェードインで鳴らす
     ※ GAME OVER専用の効果音は付けない（「少し無音 → BGM」の、しずかな切りかわりにしている）
     ============================================================ */

  /* ※ ここで new Audio() をしない（サーバー側には Audio が無いため） */
  let gameOverBgm: GameAudio | null = null;

  /* GAME OVER BGMを用意して返す（ここでは soundEnabled を見ない。OFFにした瞬間に止めるためにも使うため） */
  function getGameOverBgm() {
    if (!import.meta.client) {
      return null;
    }

    try {
      if (!gameOverBgm) {
        gameOverBgm = createGameAudio('/audio/game-over-bgm.mp3', getAudioContext);

        // 画面をそのまま置いておいたときも、とちゅうで急に無音にならないように
        gameOverBgm.loop = true;

        setElementVolume(gameOverBgm, getSoundVolume(gameOverBgmVolume), getAudioContext);
      }

      return gameOverBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* GAME OVER BGMを「最初から」再生する（GAME OVERになるたびに、いつも同じ始まりかたにする） */
  function playGameOverBgm() {
    // getGameOverBgm() より先に見て、OFFのあいだは mp3 の読み込みを起こさない
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getGameOverBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0;

      startBgmFadeIn(bgm, gameOverBgmVolume);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* GAME OVER BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
     直前の決定音などと重ならないようにし、いったん「しん」とする間で「今日はここでおしまい」という区切りを伝える
     （待たせるのは音だけで、GAME OVER画面はすぐ出る） */
  const gameOverBgmStartDelay = 700;

  let gameOverBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* GAME OVER BGMを「少し待ってから」最初から鳴らす（checkGameOver() から呼ぶ）
     ・前の予約を先に消す（2つ残ると、鳴りはじめた曲が頭からやりなおしになるため）
     ・鳴らす直前に、まだGAME OVER画面にいるかを確かめる（タイトル画面でGAME OVERの曲が流れないように） */
  function playGameOverBgmSoon() {
    cancelGameOverBgmStart();

    if (!import.meta.client) {
      return;
    }

    preloadBgmWhileWaiting(getGameOverBgm);

    gameOverBgmTimer = setTimeout(() => {
      gameOverBgmTimer = null;

      if (currentEvent.value !== 'gameOver') {
        return;
      }

      playGameOverBgm();
    }, gameOverBgmStartDelay);
  }

  function cancelGameOverBgmStart() {
    if (gameOverBgmTimer === null) {
      return;
    }

    clearTimeout(gameOverBgmTimer);
    gameOverBgmTimer = null;
  }

  /* GAME OVER BGMを「続きから」再生する（サウンドをONに戻したとき用）
     OFFのままGAME OVERになっていたときは、ここで初めて作るので、先頭から鳴る */
  function resumeGameOverBgm() {
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getGameOverBgm();

    if (!bgm) {
      return;
    }

    try {
      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // 何もしない
    }
  }

  /* GAME OVER BGMを一時停止する（どこまで再生したかは覚えたまま。ONに戻したとき、続きから鳴らせるように） */
  function pauseGameOverBgm() {
    cancelBgmFade();

    if (!gameOverBgm) {
      return;
    }

    try {
      pauseElement(gameOverBgm);
    } catch {
      // 何もしない
    }
  }

  /* GAME OVER BGMを完全に止める（GAME OVER画面から出るとき。次のGAME OVERでは、また先頭から鳴る） */
  function stopGameOverBgm() {
    /* 「あとで鳴らす」の予約も取り消す
       ※ かならず「まだ作っていないなら終わり」より前に置く（0.7秒待っている最中に出ると、予約だけある状態のため） */
    cancelGameOverBgmStart();

    cancelBgmFade();

    if (!gameOverBgm) {
      return;
    }

    try {
      pauseElement(gameOverBgm, { rewind: true });

      // 音量も、決めてある大きさへ戻す（フェードインの途中で止めると、小さいまま残ることがあるため）
      setElementVolume(gameOverBgm, getSoundVolume(gameOverBgmVolume), getAudioContext);
    } catch {
      // 何もしない
    }
  }

  /* ============================================================
     こもれびの広場のBGM（作りは公園BGMと同じ）

     秘密の小道と秘密の場所にいるあいだ鳴らす（小道で鳴りはじめ、広場へ着いても鳴らしなおさずに続ける）
     たくさん遊んだ人だけが入れる特別な場所なので、「特別な場所に来た」と分かるように曲を変える

     ※ 公園BGMとは必ず「入れかえ」にする（2曲が同時に鳴ると、どちらもにごって聞こえるため）
     ※ 出たあと公園BGM1・BGM2のどちらへ戻るかは時計が決める（playParkBgmSoon() にまかせ、決め打ちしない）
     ============================================================ */

  let secretBgm: GameAudio | null = null;

  /* こもれびの広場BGMの再生の速さ（1 ＝ ふつう）
     ゲーム本編では変えない。ミニゲーム「どこまで行ける？」では、レベルが上がると少しずつ速くする
     曲がまだ作られていないときに決められても、作るときにこの値を使う */
  let secretBgmPlaybackRate = 1;

  /* 曲の速さを変えてよい鳴らしかたか（iPhone・iPad では false）

     音量つまみに通している iPhone・iPad では、速くすると曲の高さまで上がってしまい（preservesPitch が効かない）、
     速さを切りかえたときに音がくずれて、効果音がまとめて鳴ったりもするので、いつも 1 のままにする
     （レベルが上がったことは「⏫ スピードアップ！」と「ピピッ」で分かる） */
  function canChangeBgmTempo() {
    return !usesWebAudioVolume();
  }

  /* 曲の速さを入れる（音の高さは変えない）
     preservesPitch は、入れる直前に毎回そろえる（作ったときに入れただけだと、戻っているブラウザがあるため） */
  function applyBgmPlaybackRate(bgm: GameAudio, rate: number) {
    try {
      const media = bgm as GameAudio & { webkitPreservesPitch?: boolean };

      media.preservesPitch = true;
      media.webkitPreservesPitch = true;
      bgm.playbackRate = rate;
    } catch {
      // 速さを変えられなくても、曲はそのままの速さで鳴る
    }
  }

  function setSecretBgmPlaybackRate(rate: number) {
    secretBgmPlaybackRate = canChangeBgmTempo() ? rate : 1;

    if (secretBgm) {
      applyBgmPlaybackRate(secretBgm, secretBgmPlaybackRate);
    }
  }

  /* こもれびの広場BGMを用意して返す（ここでは soundEnabled を見ない。OFFにした瞬間に止めるためにも使うため） */
  function getSecretBgm() {
    if (!import.meta.client) {
      return null;
    }

    try {
      if (!secretBgm) {
        secretBgm = createGameAudio('/audio/secret-bgm.mp3', getAudioContext);

        // 秘密の場所に長くいても、曲が途切れないように
        secretBgm.loop = true;

        setElementVolume(secretBgm, getSoundVolume(secretBgmVolume), getAudioContext);

        applyBgmPlaybackRate(secretBgm, secretBgmPlaybackRate);
      }

      return secretBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* こもれびの広場BGMを「最初から」再生する（入るたびに、同じ始まりかたにそろえる） */
  function playSecretBgm() {
    // getSecretBgm() より先に見て、OFFのあいだは mp3 の読み込みを起こさない
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getSecretBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0;

      startBgmFadeIn(bgm, secretBgmVolume);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* こもれびの広場BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
     決定音がかき消されず、公園BGMが止まったあとの「しん」とする一瞬で「特別な場所へ入った」感じを出すため */
  const secretBgmStartDelay = 700;

  let secretBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* こもれびの広場BGMを「少し待ってから」最初から鳴らす（待たせるのは音だけで、画面はすぐ出る） */
  function playSecretBgmSoon() {
    cancelSecretBgmStart();

    if (!import.meta.client) {
      return;
    }

    preloadBgmWhileWaiting(getSecretBgm);

    secretBgmTimer = setTimeout(() => {
      secretBgmTimer = null;

      /* まだ秘密の小道か秘密の場所にいるときだけ鳴らす（出た・いやいや・GAME OVER などなら、あとから鳴りださない）
         小道で待っているあいだに広場へ進んだときは、そのまま鳴らしてよい */
      if (currentEvent.value !== 'secretSpot' && currentEvent.value !== 'secretPath') {
        return;
      }

      playSecretBgm();
    }, secretBgmStartDelay);
  }

  function cancelSecretBgmStart() {
    if (secretBgmTimer === null) {
      return;
    }

    clearTimeout(secretBgmTimer);
    secretBgmTimer = null;
  }

  /* こもれびの広場BGMを「続きから」再生する（サウンドをONに戻したとき用）
     OFFのまま入っていたときは、ここで初めて作るので、先頭から鳴る */
  function resumeSecretBgm() {
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getSecretBgm();

    if (!bgm) {
      return;
    }

    try {
      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // 何もしない
    }
  }

  /* こもれびの広場BGMを一時停止する（どこまで再生したかは覚えたまま） */
  function pauseSecretBgm() {
    cancelBgmFade();

    if (!secretBgm) {
      return;
    }

    try {
      pauseElement(secretBgm);
    } catch {
      // 何もしない
    }
  }

  /* こもれびの広場BGMを完全に止める（次に入ったときは、また先頭から） */
  function stopSecretBgm() {
    /* 「あとで鳴らす」の予約も取り消す
       ※ かならず「まだ作っていないなら終わり」より前に置く（入った直後に出たときは、予約だけある状態のため） */
    cancelSecretBgmStart();

    cancelBgmFade();

    if (!secretBgm) {
      return;
    }

    try {
      pauseElement(secretBgm, { rewind: true });

      /* 速さも ふつう（1）へ戻す（速いまま止めると、次は いきなり速い曲から始まるため）
         鳴っているあいだに切りかえると音がくずれることがあるので、鳴っていない いま のうちに戻す */
      secretBgmPlaybackRate = 1;
      applyBgmPlaybackRate(secretBgm, 1);
    } catch {
      // 何もしない
    }
  }

  /* ============================================================
     音量（スライダー）を、実際の音へ反映する
     ============================================================ */

  /* いま作ってある（＝一度でも鳴らした）BGMの音量を、いまの設定へそろえる

     ・get〜Bgm() は呼ばない（まだ鳴らしていない曲まで作られて、mp3 の読み込みが始まってしまうため）
     ・音量だけを変えるので、鳴っている曲は止まらず、そのまま大きさだけが変わる
     ・フェードインの最中の曲は、フェードの係にまかせる（ここで一気に入れると、音が飛ぶため） */
  function applySoundVolume() {
    /* 曲と「曲ごとの音量」の組み合わせ（新しいBGMを足したときは、ここにも1行足す） */
    const bgmList: [GameAudio | null, number][] = [
      [parkBgm, parkBgmVolume],
      [parkBgm2, parkBgm2Volume],
      [titleBgm, titleBgmVolume],
      [tantrumBgm, tantrumBgmVolume],
      [resultBgm, resultBgmVolume],
      [gameOverBgm, gameOverBgmVolume],
      [secretBgm, secretBgmVolume],
    ];

    for (const [bgm, baseVolume] of bgmList) {
      if (!bgm || bgm === fadingBgm) {
        continue;
      }

      try {
        setElementVolume(bgm, getSoundVolume(baseVolume), getAudioContext);
      } catch {
        // 何もしない
      }
    }
  }

  function saveSoundVolume() {
    if (!import.meta.client) {
      return;
    }

    try {
      localStorage.setItem(soundVolumeStorageKey, String(soundVolumePercent.value));
    } catch {
      // 保存できなくても、開いているあいだの音量は動く
    }
  }

  /* 音量のスライダーを動かしたとき（つまみを動かしているあいだ、ずっと呼ばれる）

     0% ＝ ミュートなので、0%まで下げたらミュートに、0%から上げたらミュート解除にする
     （ミュートボタンと同じあと始末 → applySoundEnabledChange）
     ※ toggleSound() は呼ばない（スライダーの位置まで動かして、動かした値を上書きしてしまうため） */
  function changeSoundVolume(event: Event) {
    const slider = event.target as HTMLInputElement;
    const percent = Number(slider.value);

    if (!Number.isFinite(percent)) {
      return;
    }

    soundVolumePercent.value = Math.min(100, Math.max(0, Math.round(percent)));

    // 次にミュートを解除したときの戻り先として覚えておく
    if (soundVolumePercent.value > 0) {
      volumeBeforeMute = soundVolumePercent.value;
    }

    // ON/OFFが変わるときだけ、BGMを止める・鳴らしなおす（毎回やると、鳴っている曲が何度も鳴りなおすため）
    const shouldBeOn = soundVolumePercent.value > 0;
    const soundEnabledChanged = shouldBeOn !== soundEnabled.value;

    if (soundEnabledChanged) {
      soundEnabled.value = shouldBeOn;
    }

    // 先に音量をそろえてから、BGMを鳴らしなおす（小さいはずの曲が一瞬大きく鳴らないように）
    applySoundVolume();
    saveSoundVolume();

    if (soundEnabledChanged) {
      applySoundEnabledChange();
    }
  }

  /* さわるたびに作業台を起こす受付を、やめるための関数（受付していないときは null）
     （iPhone でBGMが無音にならないようにするため → utils/elementVolume.ts） */
  let stopWakingAudioContext: (() => void) | null = null;

  /* ============================================================
     ロックしたとき・ほかのアプリへ切りかえたときの音

     BGMを mp3 の音で鳴らしていたころは、iPhone がロック画面に ▶／⏸ を出し、
     ロック画面のボタンで BGM が直接 鳴る・止まって、ゲームの「いまどの曲か」とずれていた
     ロック画面に ▶ が出るのは、ページが mp3 の音を鳴らしているか、Media Session を登録しているときなので、
     iPhone・iPad のゲームでは どちらもしない（音は Web Audio だけで鳴らしている）

     ・画面が見えなくなったら、鳴っているBGMを止めて覚えておき、見えるようになったら続きから鳴らす
     ・マナーモードでも鳴らす設定は、画面が見えているあいだだけにする（→ playThroughSilentModeWhileVisible()）
     ・パソコン・Android など（BGMが mp3 の音のまま）では、ロック画面・メディアキーを押しても何もしない
     ※ サウンドトラックは、ロックしても鳴りつづけるページなので、ここは使わない
     ============================================================ */

  /* 画面が見えなくなったときに止めた曲（見えるようになったら、鳴らしなおす） */
  let bgmsPausedWhileHidden: GameAudio[] = [];

  function handleVisibilityChangeForBgm() {
    if (document.visibilityState === 'hidden') {
      pauseBgmWhileHidden();
      return;
    }

    resumeBgmAfterHidden();
  }

  /* 鳴っているBGMを止めて、覚えておく */
  function pauseBgmWhileHidden() {
    // フェードインの途中なら、やめて音量を戻す（戻ってきたとき、小さい音のままにならないように）
    cancelBgmFade();

    const bgmList = [titleBgm, parkBgm, parkBgm2, secretBgm, tantrumBgm, resultBgm, gameOverBgm];

    for (const bgm of bgmList) {
      // まだ作っていない曲・止まっている曲・止めている途中の曲は、さわらない
      if (!bgm || !isElementPlaying(bgm)) {
        continue;
      }

      try {
        pauseElement(bgm);
        bgmsPausedWhileHidden.push(bgm);
      } catch {
        // 何もしない
      }
    }
  }

  /* 覚えておいた曲を、止めたところから鳴らしなおす */
  function resumeBgmAfterHidden() {
    const bgmList = bgmsPausedWhileHidden;

    bgmsPausedWhileHidden = [];

    // 見えなくなっているあいだにサウンドをOFFにされていたら、鳴らさない
    if (!soundEnabled.value) {
      return;
    }

    for (const bgm of bgmList) {
      try {
        cancelElementPause(bgm);
        bgm.play().catch(() => {});
      } catch {
        // 何もしない
      }
    }
  }

  /* 画面の見え・かくれを見張るのを、やめるための関数（見張っていないときは null） */
  let stopWatchingVisibility: (() => void) | null = null;

  function startWatchingVisibility() {
    document.addEventListener('visibilitychange', handleVisibilityChangeForBgm);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChangeForBgm);
      bgmsPausedWhileHidden = [];
    };
  }

  /* ロック画面・メディアキーなどのボタンを、押しても何もしないようにする（BGMが mp3 の音のときだけ）

     何も登録しないと、ブラウザはボタンで BGM を直接 鳴らす・止めるので、何もしない関数を登録しておく
     ※ iPhone・iPad では登録しない（直接 鳴る mp3 の音が無く、登録すると ▶ を出す手がかりになりうるため） */
  let stopIgnoringMediaControls: (() => void) | null = null;

  /* マナーモードでも鳴らす設定を、やめるための関数 */
  let stopPlayingThroughSilentMode: (() => void) | null = null;

  function startIgnoringMediaControls() {
    if (usesWebAudioVolume()) {
      return () => {};
    }

    const ignore = () => {};

    return startMediaSession({ play: ignore, pause: ignore, stop: ignore, previousTrack: ignore, nextTrack: ignore });
  }

  /* ページを開いたときの、音の設定の読みこみ（localStorage はブラウザにしか無いので、必ず onMounted から呼ぶ）
     ここで始める受付・見張りは、cleanupAudio() でやめる */
  function restoreSoundSettings() {
    stopWakingAudioContext?.();
    stopWakingAudioContext = keepAudioContextAwake(getAudioContext);

    stopWatchingVisibility?.();
    stopWatchingVisibility = startWatchingVisibility();
    stopIgnoringMediaControls?.();
    stopIgnoringMediaControls = startIgnoringMediaControls();

    stopPlayingThroughSilentMode?.();
    stopPlayingThroughSilentMode = playThroughSilentModeWhileVisible();

    // 前回のサウンドON/OFF（保存が無いときは、ONのまま）
    try {
      const savedSoundSetting = localStorage.getItem(soundStorageKey);

      if (savedSoundSetting === 'false') {
        soundEnabled.value = false;
      } else if (savedSoundSetting === 'true') {
        soundEnabled.value = true;
      }
    } catch {
      // 読み込めなくても、ONで普通に遊べる
    }

    /* 前回の音量
       ※ null を Number() に入れると 0 になるので、先に「保存されているか」を見る
       ※ 数字にならない・0〜100 の外のときは、100%のまま */
    try {
      const savedSoundVolume = localStorage.getItem(soundVolumeStorageKey);

      if (savedSoundVolume !== null) {
        const percent = Number(savedSoundVolume);

        if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
          soundVolumePercent.value = Math.round(percent);
        }

        /* スマホ・タブレットでは、途中の音量（1〜99%）は戻さず、100%で始める
           スマホには音量スライダーが無い（ミュートボタンだけ）ので、前に下げた音量が残ると、もう上げられないため
           ※ 0%（ミュート）は、ミュートボタンで解除できるので、そのまま戻す */
        if (isTouchOnlyDevice() && soundVolumePercent.value > 0) {
          soundVolumePercent.value = 100;
        }
      }
    } catch {
      // 読み込めなくても、100%で普通に遊べる
    }

    /* ON/OFFと音量を、ここでそろえておく（0% ＝ ミュート）
       別々に保存しているので、「ミュートだが音量は70%」のように かみ合っていないことがあるため
       ※ ここではBGMを鳴らしたり止めたりしない（開いた直後は、まだどのBGMも鳴っていないため） */
    if (!soundEnabled.value) {
      if (soundVolumePercent.value > 0) {
        volumeBeforeMute = soundVolumePercent.value;
      }

      soundVolumePercent.value = 0;
    } else if (soundVolumePercent.value === 0) {
      soundEnabled.value = false;
    } else {
      volumeBeforeMute = soundVolumePercent.value;
    }
  }

  /* ============================================================
     ページから離れるときの、音の後片づけ

     ※ ここで onUnmounted を登録していないのは、pages/index.vue 側の後片づけと、前後の順番がずれないようにするため
     ============================================================ */
  function cleanupAudio() {
    stopWakingAudioContext?.();
    stopWakingAudioContext = null;

    // ロック画面のボタンの受付・マナーモードの設定もやめる（サウンドトラックへ移ったときに、あちらとぶつからないように）
    stopWatchingVisibility?.();
    stopWatchingVisibility = null;
    stopIgnoringMediaControls?.();
    stopIgnoringMediaControls = null;

    stopPlayingThroughSilentMode?.();
    stopPlayingThroughSilentMode = null;

    // 別のページへ移ったあともBGMが鳴り続けないように、ぜんぶの曲を止める
    pauseTitleBgm();
    pauseParkBgm();
    pauseSecretBgm();
    pauseTantrumBgm();
    pauseResultBgm();
    pauseGameOverBgm();

    // 「あとで鳴らす」の予約とフェードインも止める（残っていると、別のページで鳴りだしてしまう）
    cancelTitleBgmStart();
    cancelParkBgmStart();
    cancelSecretBgmStart();
    cancelResultBgmStart();
    cancelGameOverBgmStart();
    cancelTantrumBgmStart();
    cancelFileSound();
    cancelBgmFade();

    /* このページの mp3 の音を、作業台から外す（作業台は閉じずに使い回すので、外さないと行き来するほど増えていく）
       ・BGM … 上で止めた（音量を下げている途中の）曲は、止め終わってから外れる
       ・救急車・犬・噴水 … 鳴っている途中のこともあるので、ここで止めてから外す
       （計算して作る効果音は、鳴り終わると自然に片づく） */
    const fileSounds = [ambulanceSirenSe, dogBarkSe, fountainSe];

    for (const sound of fileSounds) {
      if (!sound) {
        continue;
      }

      try {
        pauseElement(sound);
      } catch {
        // 何もしない
      }
    }

    const pageAudios = [titleBgm, parkBgm, parkBgm2, secretBgm, tantrumBgm, resultBgm, gameOverBgm, ...fileSounds];

    for (const audio of pageAudios) {
      if (audio) {
        releaseElement(audio);
      }
    }

    stalledToneStartedAt = 0;
  }

  return {
    /* ===== 音の設定（SoundControl.vue へそのまま渡す） ===== */
    soundEnabled,
    soundVolumePercent,
    toggleSound,
    changeSoundVolume,

    /* ===== 効果音 ===== */
    playDecisionSound,
    playItemSound,
    playTantrumSound,
    playGoalSound,
    playSunlightSound,
    playBranchBumpSound,
    playCountdownSound,
    playCountdownStartSound,
    playBoostSound, // ミニゲーム「どこまで行ける？」だけが使う
    playSuddenEventSound,

    /* ===== 公園のBGM ===== */
    playParkBgmSoon,
    stopParkBgm,
    resumeParkBgm, // ミニゲーム「枝の上のてんとう虫」で、開いたときに鳴らせなかった曲を「はじめる」で鳴らす
    switchParkBgmForCurrentTime,

    /* 10:30を過ぎたか（公園入口の文章の出しわけにも使う → parkEntranceText） */
    shouldUseParkBgm2,

    /* ===== タイトル画面のBGM ===== */
    playTitleBgmSoon,
    cancelTitleBgmStart,
    stopTitleBgm,
    resumeTitleBgm, // ミニゲームの一覧で、開いたときに鳴らせなかった曲を、はじめて さわったときに鳴らす

    /* ===== いやいやタイムのBGM ===== */
    playTantrumBgmSoon,
    stopTantrumBgm,

    /* ===== リザルト画面のBGM ===== */
    playResultBgmSoon,
    stopResultBgm,

    /* ===== GAME OVER画面のBGM ===== */
    playGameOverBgmSoon,
    stopGameOverBgm,

    /* ===== こもれびの広場のBGM ===== */
    playSecretBgmSoon,
    stopSecretBgm,
    resumeSecretBgm, // ミニゲーム「どこまで行ける？」で、開いたときに鳴らせなかった曲を「はじめる」で鳴らす
    setSecretBgmPlaybackRate, // ミニゲーム「どこまで行ける？」だけが使う（レベルが上がると曲を速くする）

    /* ===== ページを開いたとき・離れるとき ===== */
    restoreSoundSettings,
    cleanupAudio,
  };
}
