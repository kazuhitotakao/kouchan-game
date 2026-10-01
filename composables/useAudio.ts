/* ============================================================
   音（効果音・BGM・音量）のまとめ

   ゲーム本編（pages/index.vue）にあった音の処理を、そのまま移してある

   ■ ここがやること
     ・効果音（Web Audio API でその場で作る音）
     ・効果音（録音した音声ファイル：救急車・犬・噴水）
     ・BGM 7本（公園1・公園2・タイトル・いやいや・リザルト・GAME OVER・こもれびの広場）
     ・BGMのフェードイン、「少し待ってから鳴らす」予約
     ・音量スライダーとミュート、その localStorage への保存と読みこみ
     ・ページを離れるときの後片づけ（曲を止める・予約を取り消す）

   ■ ここがやらないこと
     ・ゲームの状態を書きかえること
       このファイルは、親からもらった ref を「読む」だけで、1つも書きかえない
     ・いつどの曲へ切りかえるか、という判断そのもの
       「タイトル画面へ入ったからタイトルBGM」のような判断は
       今までどおり pages/index.vue にあり、こちらはその指示で鳴らす・止めるだけ
       （ただし applySoundEnabledChange() だけは、ミュート解除したときに
         「いまの画面ならどの曲か」を自分で選びなおす。これも移す前と同じ）

   ■ 中身について
     pages/index.vue にあったときのコードを、そのまま持ってきている
     関数の数・名前・処理の順番・待ち時間・音量の数字は、1つも変えていない
     似ている関数（playXxxBgm / stopXxxBgm …）も、まとめずにそのまま残してある
   ============================================================ */

import { ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import type { GameEvent } from '~/types/game';

/* S+ランク限定の、うた入りリザルトBGMの場所（→ getResultBgmSrc）
   曲名のほうは結果画面の表示に使うので、pages/index.vue 側で読みこんでいる */
import { sPlusSongSrc } from '~/utils/sPlusSong';

/* mp3 の音（BGM・mp3 の効果音）の音量を入れる関数
   audio.volume = 〜 と直接書くと、iPhone では音量が変わらないので、かならずこれを通す
   （くわしい理由は、読みこむ先のファイルの先頭に書いてある） */
import { cancelElementPause, keepAudioContextAwake, pauseElement, setElementVolume, usesWebAudioVolume } from '~/utils/elementVolume';

/* 音のほうから「いま画面はどうなっているか」を見るための値

   どれも読むだけで、このファイルからは1つも書きかえない
   ref / computed をそのまま受けとるので、
   pages/index.vue にあったときと同じように、いつでも最新の値が読める
   （.value を付けて読む書きかたも、移す前のまま変えていない） */
export type UseAudioOptions = {
  /* 起動画面の「▶ はじめる」を押したか（タイトルBGMを鳴らす画面かの判定に使う） */
  titleEntered: Ref<boolean>;

  /* 公園へ出発したか（ゲーム画面かどうか） */
  gameStarted: Ref<boolean>;

  /* いまどの場面にいるか（ゴール・GAME OVER・いやいや・こもれびの広場 …） */
  currentEvent: Ref<GameEvent>;

  /* いま いやいや が続いているか */
  isTantrum: Ref<boolean>;

  /* いまリザルト画面（ゴール or GAME OVER）にいるか */
  isResultScene: ComputedRef<boolean>;

  /* ゲーム内の時刻（分）。10:30 を過ぎたら公園BGM2へ切りかえる判定に使う */
  currentMinutes: ComputedRef<number>;

  /* 決まったランク（S+ランクのときだけ、うた入りのリザルトBGMにする） */
  endingRank: Ref<string>;
};

export function useAudio(options: UseAudioOptions) {
  /* 受けとったものを、今までと同じ名前で使えるようにしておく
     （こうすると、pages/index.vue にあったときのコードをそのまま動かせる） */
  const { titleEntered, gameStarted, currentEvent, isTantrum, isResultScene, currentMinutes, endingRank } = options;

  /* ============================================================
     効果音（Web Audio API）

     音声ファイル（MP3・WAV）は使わず、ブラウザに最初から入っている
     Web Audio API で、その場で音そのものを作って鳴らす

     使う部品は3つだけ
     ・AudioContext    … 音を作るための「作業台」。これが無いと何も作れない
     ・OscillatorNode  … 音の発生源。「1秒間に何回ふるえるか」を決めると、その高さの音が出る
     ・GainNode        … 音量つまみ。時間に沿って音量を変えられる

     つなぎ方は
     Oscillator（音を出す）→ Gain（音量を調整）→ destination（スピーカー）

     ※ 効果音のうち3つ（救急車・犬・噴水）だけは、ここでは作っていない
       本物らしい音色が必要で、計算では作れないので、録音した音声ファイルを鳴らしている
       （→ このあとの「音声ファイルの効果音（HTML Audio）」）
     ============================================================ */

  /* ゲームの音を鳴らすかどうか（プレイヤーの設定）
     効果音（ポン♪など）と公園BGMの両方をまとめて切り替える
     true  … サウンドON（はじめてのときはこちら）
     false … サウンドOFF

     ※ 体力や機嫌とちがって「ゲームのステータス」ではなく「設定」なので、
       resetGame（もう一度あそぶ）では初期値に戻さない
  */
  const soundEnabled = ref(true);

  /* サウンドの設定を保存しておく名前（localStorageのキー）
     同じブラウザの他のページと名前がぶつからないよう、ゲーム名を頭に付けている
  */
  const soundStorageKey = 'kouchan-game-sound-enabled';

  /* 音ぜんぶの大きさ（0〜100の整数。100＝そのままの大きさ）

     ■ 何にかかるか
       BGMにも、決定音などの効果音にも、まとめて同じ割合でかかる
       （曲ごと・効果音ごとの数字は「録音の大きさをそろえる」ためのものなので、そのまま残す）
       実際に鳴らす大きさは、その数字とこれをかけ算して決める（→ getSoundVolume()）

     ■ 0% ＝ ミュート
       0%にすると音が何も出なくなるので、スピーカーのミュートと同じ状態になる
       見た目と中身が食いちがわないように、この2つはいつもセットで動かしている
       ・スライダーを0%にした     … soundEnabled も false にする（アイコンが 🔊× になる）
       ・スライダーを0%から上げた … soundEnabled も true に戻す（音が戻る）
       ・ミュートボタンを押した   … スライダーも 0% ⇄ もとの大きさ に動く
       （切りかえているのは changeSoundVolume() と toggleSound() の2か所だけ）

     ※ サウンドON/OFFと同じ「設定」なので、resetGame（もう一度あそぶ）では戻さない
  */
  const soundVolumePercent = ref(100);

  /* ミュートする直前の大きさ（ミュートを解除したときに、ここへ戻す）

     ミュートすると音量は0%になるので、そのままだと
     解除したときに「前はどれくらいだったか」が分からなくなってしまう
     0%のときは戻り先にならないので、100%を初期値にしてある
  */
  let volumeBeforeMute = 100;

  /* 音量を保存しておく名前（localStorageのキー）
     サウンドON/OFF（kouchan-game-sound-enabled）とは別のメモにしてある
     ※ キーの文字は、前に決めたときのまま（-bgm- ）にしてある
       いま使っている人の設定が、名前を変えたせいで消えてしまわないようにするため */
  const soundVolumeStorageKey = 'kouchan-game-bgm-volume';

  /* もとの大きさに、音量スライダーのぶんをかけた「実際に鳴らす大きさ」を返す

     BGMからも効果音からも、同じこの関数を通す
     例：公園BGM（0.16）で、音量が50%なら → 0.16 × 0.5 ＝ 0.08
     例：決定音（0.06）で、音量が50%なら → 0.06 × 0.5 ＝ 0.03

     volume に入れられるのは 0〜1 の数字だけなので、
     はみ出さないように、下（0）と上（1）でおさえている
  */
  function getSoundVolume(baseVolume: number) {
    return Math.min(1, Math.max(0, baseVolume * (soundVolumePercent.value / 100)));
  }

  /* ミュートボタンを押したとき（サウンドのON/OFFを切り替える）

     0% ＝ ミュートなので、スライダーの位置もいっしょに動かす
     ・ミュートする   … いまの大きさを覚えてから、0%へ
     ・ミュートを解除 … 覚えておいた大きさへ戻す（覚えが0%なら100%）
  */
  function toggleSound() {
    // ① まず切り替える（true なら false へ、false なら true へ）
    soundEnabled.value = !soundEnabled.value;

    // ② スライダーの位置も、いまの状態に合わせる
    if (soundEnabled.value) {
      soundVolumePercent.value = volumeBeforeMute > 0 ? volumeBeforeMute : 100;
    } else {
      if (soundVolumePercent.value > 0) {
        volumeBeforeMute = soundVolumePercent.value;
      }

      soundVolumePercent.value = 0;
    }

    // ③ 新しい大きさを、いま鳴っているBGMへ反映して、保存しておく
    applySoundVolume();
    saveSoundVolume();

    // ④ BGMを止める・鳴らしなおす（と、ON/OFFの保存）
    applySoundEnabledChange();
  }

  /* サウンドのON/OFFが変わったあとの、あと始末

     ミュートボタン（toggleSound）からも、
     スライダーを0%にした・0%から上げたとき（changeSoundVolume）からも呼ばれる

     ここでやること
     ① BGMを止める／鳴らしなおす
         効果音は getAudioContext() が soundEnabled を見てくれるので何もしなくてよいが、
         BGMは「いま鳴っている曲」なので、その場で止める・再開する必要がある

         ONに戻したときは、いまの画面に合う曲「1曲だけ」を再開する
         ・起動画面                  … どれも鳴らさない（まだ何も始まっていない）
         ・タイトル画面              … タイトルBGM
         ・いやいやタイム            … いやいやBGM
         ・いやいや発生の結果を読んでいる最中 … どれも鳴らさない（わざと無音にしている画面）
         ・秘密の場所                … こもれびの広場BGM
         ・公園を探検している最中     … 公園BGM（10:30より前ならBGM1、10:30以降ならBGM2）
         ・ゴール（通常のおしまい）   … リザルトBGM
         ・GAME OVER                 … GAME OVER BGM（ゴールのリザルトBGMとは別の曲）

         止めたところからの続きなので、play〜ではなく resume〜 を使う

         ※ タイトルBGMの条件に titleEntered が要る
           「!gameStarted」だけだと起動画面も当てはまってしまい、
           起動画面でONに戻しただけで曲が鳴りだしてしまう

         ※ ゴールを、いやいや関連より先に置くのが大事
           いやいや対応の途中でお昼になってゴールすると、
           結果画面なのに isTantrum が true のまま残っていることがある
           あとに置くと、そこに当てはまってリザルトBGMが鳴らなくなってしまう

         ※ GAME OVERも、同じ理由で いやいや関連より先に置く
           いやいやタイム中に「少し待ってみる」などで親の余裕が0になると、
           isTantrum が true のままGAME OVER画面になる
           あとに置くと「いやいや発生の結果を読んでいる最中」に当てはまり、
           GAME OVER BGMが鳴らなくなってしまう

         ※ いやいや関連の2つを、公園BGMより先に置くのが大事
           あとにすると「公園を探検している最中」にも当てはまってしまい、
           いやいや画面なのに公園BGMが鳴りだしてしまう

         ※ 「いやいや発生の結果を読んでいる最中」は
           currentEvent がまだ場所（すべり台など）のままで、
           isTantrum だけが true になっている状態
           ここでONに戻しても、わざと作った無音をこわさないように何も鳴らさない

         ※ 秘密の場所を、公園BGMより先に置くのが大事
           秘密の場所も「ゲーム中で、結果画面ではない」に当てはまってしまうので、
           あとに置くと、秘密の場所なのに公園BGMが鳴りだしてしまう
           （そのうえ、あとからこもれびの広場BGMも鳴ると2曲が重なってしまう）

         ※ 秘密の場所から出たあとにONへ戻したときは、
           currentEvent がもう 'secretSpot' ではないので公園BGMのほうへ進む
           こもれびの広場BGMが勝手に鳴りなおすことはない

         ※ サウンドOFFのまま秘密の場所へ入って、そこでONに戻したときは、
           まだ曲を一度も作っていないので、resumeSecretBgm() の中で
           新しく作って先頭から鳴りはじめる（公園BGMは鳴らない）

     ② 次に開いたときのために、ON/OFFを保存する
         localStorage は、ブラウザに小さなメモを残しておける保存場所
         ページを閉じても消えないので、次に開いたときも設定を思い出せる
  */
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
      } else if (gameStarted.value && currentEvent.value === 'secretSpot') {
        resumeSecretBgm();
      } else if (gameStarted.value && !isResultScene.value) {
        // 秘密の小道（ミニゲーム）もここ。こもれびの広場へ着くまでは公園BGMのまま
        resumeParkBgm();
      }
    } else {
      // OFFのときは pause() だけ（どこまで再生したかを覚えておく）
      // どの画面でも止まるように、ぜんぶの曲に声をかける
      // （pauseParkBgm() は、公園BGM1・BGM2の両方をまとめて止めてくれる）
      pauseTitleBgm();
      pauseParkBgm();
      pauseSecretBgm();
      pauseTantrumBgm();
      pauseResultBgm();
      pauseGameOverBgm();
    }

    // サーバー側には localStorage が無いので、ここで終わり
    if (!import.meta.client) {
      return;
    }

    try {
      localStorage.setItem(soundStorageKey, String(soundEnabled.value));
    } catch {
      // ブラウザの設定で保存できないことがある
      // 保存できなくても、このページを開いているあいだのON/OFFは正常に動く
    }
  }

  /* 作業台（AudioContext）を入れておく箱

     null は「まだ作っていない」という意味
     AudioContext は作るのが重たいので、1個だけ作って、ずっと使い回す
     ※ ここで new AudioContext() をしないのが大事
       Nuxtはサーバー側でも一度このコードを読むが、
       サーバーには window も AudioContext も無いのでエラーになってしまう
  */
  let audioContext: AudioContext | null = null;

  /* 作業台を用意して返す（初めて音を鳴らすときだけ作る）

     音が出せないときは null を返すので、
     呼んだ側は「null なら何もしない」だけで済む
  */
  function getAudioContext() {
    /* ここが効果音ON/OFFの「関所」

       効果音（decision・item・tantrum・goal・sunlight・branchBump・fallDown）は、
       どれも必ずこの関数を通る
       なので、ここで null を返すだけで、すべての効果音がまとめて止まる
       ゲーム処理のあちこちに if (soundEnabled.value) を書く必要はない

       効果音OFFのときは AudioContext も作らない
       （下の new AudioContext() の行まで、そもそもたどり着かない）
    */
    if (!import.meta.client || !soundEnabled.value) {
      return null;
    }

    try {
      /* まだ無いときだけ作る（2回目からは、この行は通らない）

         閉じたあと（cleanupAudio() のあと）に呼ばれたときも、作りなおす
         閉じた作業台は、もう音を鳴らせないため */
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioContext();
      }

      /* ブラウザは「ユーザーが操作する前」に音を鳴らすのを止めることがあり、
         そのとき作業台は suspended（お休み中）になっている
         resume() で起こすが、await はしない
         ここでゲームを待たせると、画面の切り替わりが音のせいで遅れてしまう */
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      return audioContext;
    } catch {
      // 音が使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* ============================================================
     作業台が止まっているあいだに、効果音をためこまないようにする

     ■ 何が起きていたか
       効果音は「作業台の時計（context.currentTime）の、いまの時刻」を見て鳴らしている
       ところが作業台は、
       ・ユーザーが操作する前（suspended）
       ・iPhone で、ほかのアプリに音を取られたとき（interrupted）
       ・曲の速さを切りかえるなどで、音の流れがくずれたとき
       のあいだ、時計が進まなくなる
       そのあいだに鳴らした効果音は、どれも「止まっている同じ時刻」に予約されるので、
       作業台が動きだした瞬間に、ぜんぶがまとめて鳴ってしまう
       （ミニゲームで「ぽこっ」が何回も繰り返し聞こえるのは、これが起きているとき）

     ■ どうするか
       作業台が動いていないあいだに鳴らせるのは、はじめの stalledToneWindow ミリ秒ぶんだけにする
       ・1つぶんの効果音（「キラリン♪」のように音を3つ重ねるもの）は、そのまま鳴らせる
       ・そのあと、止まったままのあいだに鳴らそうとしたぶんは、鳴らさずに捨てる
       動きだしたら（running）、また ふつうに鳴らせるようにする

       鳴らないより、まとめて鳴るほうが耳にうるさいので、あふれたぶんは捨てている
     ============================================================ */
  const stalledToneWindow = 300;

  /* 作業台が止まっているあいだに、はじめて効果音を鳴らした時刻（実際の時計。0 = 止まっていない） */
  let stalledToneStartedAt = 0;

  function canScheduleTone(context: AudioContext) {
    // 動いているときは、いつもどおり鳴らせる
    if (context.state === 'running') {
      stalledToneStartedAt = 0;
      return true;
    }

    const now = performance.now();

    // 止まってから、はじめの1つ目
    if (stalledToneStartedAt === 0) {
      stalledToneStartedAt = now;
      return true;
    }

    // 1つ目と同時に鳴らすぶん（重ねている音）までは鳴らし、それより後のぶんは捨てる
    return now - stalledToneStartedAt <= stalledToneWindow;
  }

  /* 音を1つだけ鳴らす、共通の関数

     frequency … 音の高さ（Hz）。数が大きいほど高い音。440ならピアノの「ラ」
     startTime … いつ鳴らしはじめるか（AudioContextの中の時計の時刻）
     duration  … 音の長さ（秒）
     volume    … 音の大きさ（0〜1）。今回はどれも0.1以下の控えめな値にしている
                  （ここへ渡すのは効果音ごとの「もとの大きさ」で、
                    音量スライダーのぶんは、この関数の中でかけ算する）
     type      … 波の形。sine と triangle はどちらも丸くてやさしい音になる
     endFrequency … 指定すると、その高さまで音程がなめらかに変化する（省略可）

     ※ OscillatorNode は「1回鳴らしたら使い捨て」という決まりなので、
       鳴らすたびに新しく作る（作業台だけは使い回す）
  */
  function playTone(frequency: number, startTime: number, duration: number, volume: number, type: OscillatorType = 'sine', endFrequency?: number) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    // 作業台が止まっているあいだに、ためこまない（→ canScheduleTone()）
    if (!canScheduleTone(context)) {
      return;
    }

    try {
      const oscillator = context.createOscillator(); // 音の発生源
      const gain = context.createGain(); // 音量つまみ

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startTime);

      // 音程を変化させる指定があるときだけ、なめらかに動かす
      if (endFrequency !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
      }

      /* 効果音の大きさにも、音量スライダーのぶんをかける

         BGMとまったく同じ割合をかけるので、スライダーを下げると
         BGMも効果音も、同じだけ小さくなる
         （効果音ごとの「もとの大きさ」のちがいは、かけ算なのでそのまま残る） */
      const effectVolume = getSoundVolume(volume);

      /* 0（＝ミュート）のときは鳴らさずに終わり

         ふだんは getAudioContext() が soundEnabled を見て止めてくれるが、
         下の exponentialRampToValueAtTime() は 0 を受け取れないので、
         ここでも念のため確かめている */
      if (effectVolume <= 0) {
        return;
      }

      /* 音量の動き（これが無いと、鳴りはじめと鳴り終わりに「ブツッ」と雑音が入る）
         ① ほぼ無音からはじめる
         ② 0.015秒かけて、すっと目的の音量まで上げる
         ③ そのあと、鳴り終わりに向かってゆっくり下げる

         ※ ①と③で 0 を使えないのは、exponentialRampToValueAtTime() が
           0 へ向かう計算をできないため（代わりに「ほぼ0」を使う）
         ※ ①と③の「ほぼ0」を effectVolume からの割合で出しているのが大事
           決まった数字（0.001 など）にすると、音量を下げたときに
           その数字のほうが大きくなってしまい、鳴り終わりで音が上がってしまう
      */
      const nearSilent = effectVolume * 0.02;

      gain.gain.setValueAtTime(nearSilent, startTime);
      gain.gain.exponentialRampToValueAtTime(effectVolume, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(nearSilent, startTime + duration);

      // 発生源 → 音量つまみ → スピーカー の順につなぐ
      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.02);
    } catch {
      // 音が鳴らなくても、ゲームは止めない
    }
  }

  /* ① コマンド決定音「ポン♪」
     700Hzの丸い音を0.09秒だけ。鋭くならないよう triangle にしている
  */
  function playDecisionSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(700, context.currentTime, 0.09, 0.06, 'triangle');
  }

  /* ② アイテム発見音「キラリン♪」
     ラ → ミ → 高いソ と、明るい音を3つ short に重ねて上っていく

     ※ 決定音と同時に鳴ると聞き取りにくいので、0.06秒だけ後ろにずらす
       ゲーム処理は待たせず、鳴らす時刻だけをずらしているのがポイント
  */
  function playItemSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = context.currentTime + 0.06;

    playTone(880, start, 0.12, 0.05, 'sine');
    playTone(1174.7, start + 0.07, 0.12, 0.05, 'sine');
    playTone(1568, start + 0.14, 0.16, 0.05, 'sine');
  }

  /* ③ いやいや発生音「ポヨヨン……」
     320Hzから170Hzへ、音程をするすると下げてしょんぼり感を出す
     怖い警告音にならないよう、やわらかい triangle を使う

     ※ 決定音・アイテム音のあとに聞こえるよう、0.12秒ずらす
  */
  function playTantrumSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(320, context.currentTime + 0.12, 0.28, 0.07, 'triangle', 170);
  }

  /* ④ ゴール音「タタターン♪」
     ド → ミ → ソ → 高いド と上がっていく、短い明るいファンファーレ
     最後の「高いド」だけ長めに伸ばして、締めくくりらしくする
  */
  function playGoalSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = context.currentTime;

    playTone(523.25, start, 0.14, 0.08, 'triangle'); // ド
    playTone(659.25, start + 0.12, 0.14, 0.08, 'triangle'); // ミ
    playTone(783.99, start + 0.24, 0.14, 0.08, 'triangle'); // ソ
    playTone(1046.5, start + 0.38, 0.42, 0.09, 'triangle'); // 高いド
  }

  /* ⑤ こもれびを取った音「ピコッ♪」（ミニゲーム「秘密の小道」用）

     アイテム発見音「キラリン♪」を小さくしたような、高い音を2つだけ
     15秒のあいだに何度も鳴るので、キラリン♪より短く・小さくしてある
  */
  function playSunlightSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = context.currentTime;

    playTone(1318.5, start, 0.08, 0.04, 'sine'); // 高いミ
    playTone(1760, start + 0.06, 0.12, 0.04, 'sine'); // 高いラ
  }

  /* ⑥ 枝に当たった音「ぽこっ」（ミニゲーム「秘密の小道」用）

     いやいや発生音と同じ「音程が下がる」形だが、ずっと短くして
     「ちょっとぶつかっただけ」に聞こえるようにしている
  */
  function playBranchBumpSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(300, context.currentTime, 0.12, 0.05, 'triangle', 190);
  }

  /* ⑥-2 カウントダウンの音「ピッ」（ミニゲーム「秘密の小道」の「3」「2」「1」用）

     決定音「ポン♪」より少し高くて短い音を1つ
     「3」は「小道へ進む」の決定音と同時に出るので、delay で少しうしろへずらして鳴らす
     （アイテム音0.06秒・いやいや発生音0.12秒と同じ考えかた） */
  function playCountdownSound(delay = 0) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(880, context.currentTime + delay, 0.08, 0.05, 'triangle'); // ラ
  }

  /* ⑥-3 スタートの音「ピーン♪」（ミニゲーム「秘密の小道」の「スタート！」用）

     カウントダウンの「ピッ」の1オクターブ上を、少し長めに伸ばす
     （時報の「ピッ、ピッ、ピッ、ポーン」と同じ形なので、始まったことが耳だけでも分かる） */
  function playCountdownStartSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    playTone(1760, context.currentTime, 0.3, 0.05, 'triangle'); // 高いラ
  }

  /* ⑥-4 はやく進みはじめた音「ヒュッ」（ミニゲーム「どこまで行ける？」の加速用）

     風を切る音には音程が無いので、葉っぱのガサガサ音（⑧ playRustleNoise）と同じく、
     でたらめな数字の列（ホワイトノイズ）から作る
     ガサガサ音とのちがいは、通す高さ（フィルター）を低い所から高い所へ、すっと動かすところ
     こうすると、風が「ヒュッ」と前へぬけていくように聞こえる

     ・bandpass … frequency のまわりの高さだけを通すフィルター。ここを 500Hz → 2400Hz へ動かす
     ・0.22秒ほどの短い音。何度も加速しても耳ざわりにならないよう、ほかの効果音と同じくらいの大きさにしている
       （フィルターでせまい高さだけを通すぶん、音のエネルギーが減るので、数字はガサガサ音と同じくらい大きめ）

     ※ BGMの速さは変えない（はやく進んでいるあいだに曲の速さを変えるのは、やめた → data/secretPathEndless.ts） */
  function playBoostSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    // 作業台が止まっているあいだに、ためこまない（→ canScheduleTone()）
    if (!canScheduleTone(context)) {
      return;
    }

    /* 効果音の大きさにも、音量スライダーのぶんをかける（playTone と同じ） */
    const effectVolume = getSoundVolume(0.22);

    /* 0（＝ミュート）のときは鳴らさずに終わり
       下の exponentialRampToValueAtTime() は 0 を受け取れないため */
    if (effectVolume <= 0) {
      return;
    }

    try {
      const startTime = context.currentTime;
      const duration = 0.22;

      // ① でたらめな数字の列（ホワイトノイズ）を作る（くわしくは playRustleNoise()）
      const frameCount = Math.floor(context.sampleRate * duration);
      const buffer = context.createBuffer(1, frameCount, context.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < frameCount; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = context.createBufferSource(); // 音の発生源（でたらめな数字を読み上げる）
      const filter = context.createBiquadFilter(); // 通す高さを決める係
      const gain = context.createGain(); // 音量つまみ

      noise.buffer = buffer;

      // ② 通す高さを、低い所から高い所へ動かす（Q … 通す はばのせまさ。大きいほど「ヒュー」と笛っぽくなる）
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(1.2, startTime);
      filter.frequency.setValueAtTime(500, startTime);
      filter.frequency.exponentialRampToValueAtTime(2400, startTime + duration);

      /* ③ 音量の動き（playTone と同じ考えかた）
         風が近づいてくる感じを出すため、上げるところ（0.06秒）を ほかの効果音より少しゆっくりにしている */
      const nearSilent = effectVolume * 0.02;

      gain.gain.setValueAtTime(nearSilent, startTime);
      gain.gain.exponentialRampToValueAtTime(effectVolume, startTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(nearSilent, startTime + duration);

      // 発生源 → 通す高さを決める → 音量つまみ → スピーカー の順につなぐ
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

     短い音を2つ、すきまなく続けて鳴らして「つまずいて、地面にすわりこむ」を表す
     ① ヒュッ … 少し高めの音から下がる（つまずいて足がすべった感じ）
     ② ポテッ … そのすぐあと、低めで丸い音（地面にぺたんとついた感じ）

     ぜんぶで0.26秒ほど。①より②を少しだけ大きくして、あとのほうに重みを置いている

     ※ 音量は、ほかの効果音より大きめの数字にしてある
       この音はほかの効果音（700〜1760Hz）よりずっと低い（260〜70Hz）
       人の耳は低い音ほど小さく感じるので、同じ数字にすると、これだけ聞こえにくくなる
       耳で聞いてそろうように、とくに低いほうの②を大きくしている
       （BGMの音量を曲ごとに変えているのと同じ考えかた）

     ※ 「ドスン！」のような重い衝撃音にはしない
       小さい子が芝生でポテッところんだくらいの、やわらかい音にしたいので、
       角のない triangle だけを使い、音量も鳴りびびくほどには上げていない

     ※ 少し待ってから鳴らしはじめる（fallDownSoundDelay）
       この音が鳴るのは「次へ」を押して、ころんだ画面へ切りかわった瞬間
       すぐ鳴らすと、押したときの決定音「ポン♪」と重なってしまい、
       画面が切りかわるより前に転ぶ音だけが先に聞こえてしまう
       決定音が鳴り終わり、ころんだ画面が出てから鳴るように、間を空けてある
       （アイテム音0.06秒・いやいや発生音0.12秒と同じ考えかたで、それより長めにしている）
  */

  /* 転倒音を鳴らしはじめるまでの待ち時間（秒）
     ここの数字だけを書きかえれば、間の長さを調整できる */
  const fallDownSoundDelay = 0.45;

  function playFallDownSound() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = context.currentTime + fallDownSoundDelay;

    playTone(260, start, 0.1, 0.12, 'triangle', 150); // ① ヒュッ
    playTone(120, start + 0.11, 0.15, 0.18, 'triangle', 70); // ② ポテッ
  }

  /* ⑧ 葉っぱのガサガサ音「ササッ、ガサッ」（とつぜんのできごと「テントウムシ発見！」用）

     ここまでの効果音（①〜⑦）は、どれも playTone() で「決まった形の波」を鳴らしてきた
     音程のある「ポン♪」「ポテッ」は、それで作れる

     でも、葉っぱがこすれる音には音程が無い
     「ドレミ」のどれでもない、ザラザラした音なので、波の形では作れない
     そこで、この音だけは作りかたを変えている

     ・音程のある音 … きれいにくり返す波（playTone／OscillatorNode）
     ・ガサガサ音   … でたらめな数字の列（ホワイトノイズ／AudioBufferSourceNode）

     でたらめな数字をそのまま鳴らすと「シャーッ」というテレビの砂あらしの音になり、
     耳にきつく、葉っぱには聞こえない
     そこで、フィルター（BiquadFilterNode）で高い音を削って、
     やわらかい葉ずれの音にしている

     ぜんぶで0.42秒ほど。短い音のかたまりを2つ続けて「葉っぱの中で何かが動いた」を表す
     ① ササッ … 小さめ。葉っぱがかすかにゆれた
     ② ガサッ … 少し大きめ。テントウムシが顔を出した

     ①②はどちらも、1回の音ではなく短い粒をいくつか重ねて作っている
     （くわしくは playLadybugRustleSound() のコメント）

     ※ 音量は、ほかの効果音より大きめの数字にしてある
       フィルターで高い音を削っているぶん、音のエネルギーが減って小さく聞こえるため
       （転倒音を大きめにしてあるのと同じ、耳で聞いてそろえるための調整）
  */

  /* ガサガサ音を鳴らしはじめるまでの待ち時間（秒）

     転倒音（fallDownSoundDelay）とまったく同じ理由・同じ長さにしてある
     この音が鳴るのは「次へ」を押して、テントウムシの画面へ切りかわった瞬間
     すぐ鳴らすと、押したときの決定音「ポン♪」と重なってしまうため、
     決定音が鳴り終わってから鳴るようにしてある */
  const ladybugRustleDelay = 0.45;

  /* ガサガサ音を1つだけ鳴らす（①ササッ と ②ガサッ で、2回呼ぶ）

     startTime … いつ鳴らしはじめるか（AudioContextの中の時計の時刻）
     duration  … 音の長さ（秒）
     volume    … 音の大きさ（0〜1）
     filterFrequency … この高さ（Hz）より上を削る。小さいほど、こもったやわらかい音になる
  */
  function playRustleNoise(startTime: number, duration: number, volume: number, filterFrequency: number) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    // 作業台が止まっているあいだに、ためこまない（→ canScheduleTone()）
    if (!canScheduleTone(context)) {
      return;
    }

    /* 効果音の大きさにも、音量スライダーのぶんをかける（playTone と同じ） */
    const effectVolume = getSoundVolume(volume);

    /* 0（＝ミュート）のときは鳴らさずに終わり
       下の exponentialRampToValueAtTime() は 0 を受け取れないため */
    if (effectVolume <= 0) {
      return;
    }

    try {
      /* ① でたらめな数字の列（ホワイトノイズ）を作る

         createBuffer(チャンネル数, 数字の個数, 1秒あたりの個数)
         「1秒あたりの個数 × 秒数」で、必要な個数が決まる
         中身を -1〜1 のでたらめな数字で埋めると、ザラザラした音になる

         ただし、ただの乱数をそのまま鳴らすと「スーッ」と平らな音になってしまう
         本物の葉ずれは、葉と葉が触れる細かい「カサ」が
         不規則に連なって「ガサガサ」に聞こえている

         そこで、全体にもう一段おおざっぱなゆれ（roughness）をかけている
         ・rough … ゆっくり上下する、0.15〜1 のあいだのでたらめな倍率
         ・これを乱数にかけ算すると、音の粒が「濃いところ・薄いところ」に分かれる
         この濃淡が、葉っぱがこすれるときの「ガサッ、ガサッ」というざらつきになる

         ゆれを何サンプルごとに作りなおすかが roughStep
         細かすぎると元のホワイトノイズに戻ってしまい、
         粗すぎるとブツブツ途切れた音になるので、
         1秒あたりの個数の 1/900（44100Hzなら約49個ぶん）にしている */
      const frameCount = Math.floor(context.sampleRate * duration);
      const buffer = context.createBuffer(1, frameCount, context.sampleRate);
      const data = buffer.getChannelData(0);

      const roughStep = Math.max(1, Math.floor(context.sampleRate / 900));
      let rough = 1;

      for (let i = 0; i < frameCount; i += 1) {
        // roughStep 個ごとに、ゆれの倍率を新しく決めなおす
        if (i % roughStep === 0) {
          rough = 0.15 + Math.random() * 0.85;
        }

        data[i] = (Math.random() * 2 - 1) * rough;
      }

      const noise = context.createBufferSource(); // 音の発生源（でたらめな数字を読み上げる）
      const filter = context.createBiquadFilter(); // 高い音を削る係
      const highpass = context.createBiquadFilter(); // 低い音を削る係
      const gain = context.createGain(); // 音量つまみ

      noise.buffer = buffer;

      /* ② 高すぎる「シャー」を削る

         lowpass ＝ 低い音は通して、高い音は通さない、という種類のフィルター
         frequency より上がだんだん小さくなるので、
         ここの数字を下げるほど、こもったやわらかい音になる */
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFrequency, startTime);

      /* ③ 低すぎる「ゴロゴロ」も削る

         乱数には、耳に聞こえないほど低い音まで入っている
         そこが残っていると、軽い葉ずれではなく
         「ボフッ」とこもった重い音になってしまう
         highpass ＝ 高い音は通して、低い音は通さない、で下を切り、
         葉っぱがこすれる軽さを出している */
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(700, startTime);

      /* ④ 音量の動き（playTone と同じ考えかた）
         ① ほぼ無音からはじめて ② すっと上げて ③ 鳴り終わりに向かって下げる

         葉っぱがこすれる音は「パッと鳴って、すっと消える」ので、
         上げるところ（0.01秒）を playTone（0.015秒）より短くしている */
      const nearSilent = effectVolume * 0.02;

      gain.gain.setValueAtTime(nearSilent, startTime);
      gain.gain.exponentialRampToValueAtTime(effectVolume, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(nearSilent, startTime + duration);

      // 発生源 → 高い音を削る → 低い音を削る → 音量つまみ → スピーカー の順につなぐ
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

    const start = context.currentTime + ladybugRustleDelay;

    /* 「ササッ」も「ガサッ」も、1回の音ではなく小さな音の集まりにしている

       葉っぱがゆれるときは、葉と葉が何度も触れあうので、
       1粒だけ鳴らすと「ポッ」と単発に聞こえてしまう
       短い粒を少しずつずらして重ねると、
       粒どうしがつながって「ガサガサ」と連なって聞こえる

       数字は順に（鳴らしはじめ, 長さ, 大きさ, 高い音を削る位置）

       ① ササッ … 小さめ・高めの粒を3つ。かすかに葉がゆれた
       ② ガサッ … 大きめ・低めの粒を4つ。テントウムシが顔を出した

       粒の長さも間かくもそろえていないのは、
       きれいに等間かくだと機械のように聞こえてしまうため */

    // ① ササッ
    playRustleNoise(start, 0.05, 0.11, 2600);
    playRustleNoise(start + 0.035, 0.06, 0.14, 2100);
    playRustleNoise(start + 0.085, 0.05, 0.09, 2400);

    // ② ガサッ（①のあと、少しだけ間を空けてから）
    playRustleNoise(start + 0.2, 0.07, 0.18, 1700);
    playRustleNoise(start + 0.245, 0.08, 0.24, 1300);
    playRustleNoise(start + 0.305, 0.07, 0.19, 1500);
    playRustleNoise(start + 0.355, 0.06, 0.12, 1200);
  }

  /* ============================================================
     音声ファイルの効果音（HTML Audio）
     ＝ 救急車のサイレン・犬の鳴き声・噴水の音

     ここまでの効果音（①〜⑧）は、どれも Web Audio API で
     「その場で音を計算して作る」やり方だった
     「ポン♪」や「ポテッ」のような短くて単純な音なら、それで作れる

     でも、この3つは計算では作れない
     ・救急車のサイレン … ピーポーピーポーと、本物らしい音色が必要
     ・犬の鳴き声       … 動物の声は、波の形では真似できない
     ・噴水の音         … 水しぶきが何千粒も重なっている音

     そこで、この3つだけは録音済みの音声ファイルを鳴らす
     ＝ BGMと同じ HTMLAudioElement（new Audio）を使う

     ・計算して作る音（①〜⑧）… Web Audio API（音声ファイルは不要）
     ・録音を鳴らす音（この3つ・BGM）… HTMLAudioElement

     ※ 効果音なので、BGMとちがって loop はしない（1回鳴って終わり）
     ============================================================ */

  /* 音声ファイルの効果音の音量（0＝無音、1＝そのままの大きさ）

     BGMと同じで、volume は「もとの音源を何倍にするか」なので、
     同じ数字にしても、録音そのものが大きい音は大きく聞こえてしまう
     耳で聞いてそろうように、音源ごとに数字を分けてある
     （音を差しかえたときは、ここの数字で調整する）

     ※ 計算して作る効果音（0.05〜0.24あたり）の数字とは、くらべなくてよい
       あちらは波の大きさをこちらで決めているが、
       こちらは「録音がもともとどれくらいの大きさか」で必要な数字が変わるため
  */

  /* 救急車のサイレンの音量 */
  const ambulanceSirenVolume = 0.15;

  /* 犬の鳴き声の音量 */
  const dogBarkVolume = 0.15;

  /* 噴水の音量 */
  const fountainVolume = 0.15;

  /* 音声ファイルの効果音を鳴らしはじめるまでの待ち時間（ミリ秒）

     転倒音（fallDownSoundDelay）・ガサガサ音（ladybugRustleDelay）と
     まったく同じ理由・同じ長さにしてある
     この音が鳴るのは「次へ」を押して、できごとの画面へ切りかわった瞬間
     すぐ鳴らすと、押したときの決定音「ポン♪」と重なってしまうため、
     決定音が鳴り終わってから鳴るようにしてある

     ※ 単位がちがうので、数字の見え方も別もの
       あちらは Web Audio API の時計を使うので秒（0.45）だが、
       こちらは setTimeout() で待つのでミリ秒（450）になる
       どちらも同じ0.45秒で、間の長さはそろえてある

     ※ 音源の頭に無音が入っていると、そのぶん鳴りだしが遅く聞こえる
       決定音と重なる・間が空きすぎると感じたら、ここの数字だけを書きかえればよい
  */
  const fileSoundDelay = 450;

  /* 音声ファイルの効果音を入れておく箱

     null は「まだ作っていない」という意味
     ※ ここで new Audio(...) をしないのが大事
       Nuxtはサーバー側でも一度このコードを読むが、
       サーバーには Audio が無いのでエラーになってしまう
       （BGMの parkBgm などと、まったく同じ理由）
  */
  let ambulanceSirenSe: HTMLAudioElement | null = null;
  let dogBarkSe: HTMLAudioElement | null = null;
  let fountainSe: HTMLAudioElement | null = null;

  /* 「あとで鳴らす」の予約票

     null は「予約していない」という意味
     BGMの予約票（parkBgmTimer など）と同じ役目で、
     ページを離れるときに取り消すために取っておく

     ※ 予約は1つだけ持てばよい
       とつぜんのできごとは一度に1つしか起きないので、
       3つの音が同時に予約されることはない
  */
  let fileSoundTimer: ReturnType<typeof setTimeout> | null = null;

  /* 「あとで鳴らす」の予約を取り消す

     残っていると、ページを離れたあとに鳴りだしてしまう
     （→ onUnmounted で呼んでいる）
  */
  function cancelFileSound() {
    if (fileSoundTimer === null) {
      return;
    }

    clearTimeout(fileSoundTimer);
    fileSoundTimer = null;
  }

  /* 音声ファイルの効果音を鳴らす（3つとも、この1つの関数を通す）

     src        … 鳴らす音声ファイルの場所（例：'/audio/sfx/dog-bark.mp3'）
     baseVolume … その音源の音量（上で音源ごとに決めている数字）
     cached     … すでに作ってあるもの（初めてのときは null）
     返す値     … 今回使った（＝これから覚えておく）もの

     ■ なぜ「箱」をやりとりするのか
       new Audio() は、そのたびに mp3 を読み込みなおす
       同じ音を鳴らすたびに作っていると、読み込みが積み上がって
       だんだん重くなり、鳴りはじめも遅れてしまう
       そこで、一度作ったものは覚えておいて、2回目からは作りなおさずに使う
       （BGMの get〜Bgm() と同じ考えかた）

     ■ サウンドOFF・音量0%のときは鳴らさない
       計算して作る効果音は getAudioContext() が止めてくれるが、
       こちらはその仕組みを通らないので、自分で見る必要がある
       ※ 音量0%のときは getSoundVolume() が 0 を返すので、
         volume に 0 を入れても鳴らないが、mp3の読み込みだけが起きてしまう
         それも起きないように、鳴らす前に確かめている

     ■ 少し待ってから鳴らす（fileSoundDelay）
       決定音「ポン♪」と重ならないように、間を空けてから鳴らしはじめる
       待たせるのは「音を鳴らすこと」だけで、
       画面の切り替えやゲームの処理は、いつもどおりすぐ進む
       （BGMの playParkBgmSoon() と同じ考えかた）

       ※ new Audio() のほうは待たせず、ここですぐ作る
         呼んだ側へ箱を返すのは「待ち時間のあと」ではできないため
         （待っているあいだに mp3 の読み込みが進むので、鳴りだしも速くなる）
  */
  function playFileSound(src: string, baseVolume: number, cached: HTMLAudioElement | null) {
    // サーバー側には Audio が無いので、ここで終わり
    if (!import.meta.client) {
      return cached;
    }

    // サウンドOFFのときは、mp3の読み込みもしない
    if (!soundEnabled.value) {
      return cached;
    }

    /* 音量0%（＝ミュート）のときも、mp3の読み込みはしない

       ここで見ているのは「いま鳴らす音の大きさ」ではなく、
       「そもそも鳴らす必要があるか」だけ
       実際に volume へ入れる数字は、待ち時間のあとで計算しなおす */
    if (getSoundVolume(baseVolume) <= 0) {
      return cached;
    }

    try {
      // まだ無いときだけ作る（2回目からは、この行は通らない）
      const sound = cached ?? new Audio(src);

      // 前の予約が残っていたら取り消す（二重に鳴らさないため）
      cancelFileSound();

      fileSoundTimer = setTimeout(() => {
        fileSoundTimer = null;

        /* 待っているあいだにサウンドをOFF・音量0%にされていたら、もう鳴らさない
           （画面が切りかわってすぐミュートを押された場合など）

           ※ 音量は、この待ち時間のあとに入れなおす
             待っているあいだにスライダーを動かされていても追いつくように、
             鳴らす直前のいまの設定で計算しなおしている */
        if (!soundEnabled.value) {
          return;
        }

        const delayedVolume = getSoundVolume(baseVolume);

        if (delayedVolume <= 0) {
          return;
        }

        try {
          setElementVolume(sound, delayedVolume, getAudioContext);

          /* 必ず音の先頭から鳴らす

             currentTime は「いま音のどこを再生しているか」を秒で表したもの
             前に鳴らし終わったものは最後まで進んだままなので、
             0 に戻さないと2回目から鳴らなくなってしまう
             （途中でもう一度呼ばれたときも、頭から鳴りなおす） */
          sound.currentTime = 0;

          // play() は「再生できたかどうか」をあとから知らせる形（Promise）になっている
          // ブラウザに止められることがあるので、失敗しても何もしないでおく
          sound.play().catch(() => {});
        } catch {
          // 音が鳴らなくても、ゲームは止めない
        }
      }, fileSoundDelay);

      // 次に呼ばれたときは作りなおさずに使えるよう、呼んだ側へ返して覚えてもらう
      return sound;
    } catch {
      // 音が鳴らなくても、ゲームは止めない
      return cached;
    }
  }

  /* とつぜんのできごとの効果音を鳴らす（できごとごとの振り分け役）

     「どのできごとで、どの音を鳴らすか」をこの1か所にまとめてある
     呼ぶ側（goToNextPlace）は、できごとの名前を渡すだけでよい

     ・emergencySiren … 救急車のサイレン（音声ファイル）
     ・dog            … 犬の鳴き声    （音声ファイル）
     ・fountain       … 噴水の音      （音声ファイル）
     ・ladybug        … 葉っぱのガサガサ音（Web Audio APIで作る音）
     ・fallDown       … 転倒音「ヒュッ、ポテッ」（Web Audio APIで作る音）

     音の作りかたは2通りあるが、呼ぶ側はそれを気にしなくてよいようにしている
     （音を差しかえて作りかたが変わっても、直すのはここだけで済む）

     ※ 音声ファイルのほうは、鳴らしたものを箱へ覚えておく
       次に同じできごとが起きたとき、作りなおさずに使うため
  */
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
     公園のBGM（HTML Audio）

     効果音とBGMで、仕組みをわざと分けている
     ・効果音 … 「ポン♪」のような短い音。決まった形の波を計算して作れるので
                Web Audio API で その場で作る（音声ファイルは不要）
     ・BGM   … 何十秒もある曲。計算では作れないので、
                録音済みの park-bgm.mp3 を再生する

     曲を再生するだけなら、音声ファイルを鳴らす専用の部品
     HTMLAudioElement（new Audio）を使うのがいちばん簡単
     ============================================================ */

  /* BGMの音量（0＝無音、1＝そのままの大きさ）

     volume は「もとの音源を何倍にするか」なので、
     同じ数字にしても、録音そのものが大きい曲は大きく聞こえてしまう
     公園BGMがタイトルBGMより大きく聞こえたので、
     耳で聞いてそろうように、曲ごとに数字を分けている
     （音を差しかえたときは、下に並んでいる曲ごとの数字で調整する）

     ※ 効果音（0.05〜0.09あたり）とは仕組みがちがうので、数字の見え方も別もの
       効果音は一瞬だけ鳴るが、BGMはずっと後ろで流れ続けるため、
       大きくしすぎると会話や効果音が聞こえにくくなる
  */

  /* タイトルBGMの音量 */
  const titleBgmVolume = 0.22;

  /* 公園BGMの音量（タイトルBGMより録音が大きいので、少し下げてそろえる） */
  const parkBgmVolume = 0.16;

  /* 午前後半（10:30以降）の公園BGMの音量

     音源そのものの録音の大きさがちがうので、BGM1とは別の数字にしてある
     （ひとまずBGM1と同じ 0.16 にしてあるが、
       聞きくらべて大きい・小さいと感じたら、ここだけ書きかえればよい） */
  const parkBgm2Volume = 0.16;

  /* いやいやBGMの音量（ひとまず公園BGMと同じにしてある）
     大きい・小さいと感じたら、ここの数字だけを書きかえれば調整できる */
  const tantrumBgmVolume = 0.17;

  /* リザルトBGMの音量（ひとまず公園BGMと同じにしてある）
     大きい・小さいと感じたら、ここの数字だけを書きかえれば調整できる */
  const resultBgmVolume = 0.17;

  /* GAME OVER BGMの音量（ひとまずリザルトBGMと同じ 0.17 にしてある）

     リザルトBGMとは別の曲なので、音源そのものの録音の大きさもちがう
     そのため resultBgmVolume を使いまわさず、専用の数字にしてある
     大きい・小さいと感じたら、ここの数字だけを書きかえれば調整できる
     （例：少し小さくしたいなら 0.15） */
  const gameOverBgmVolume = 0.17;

  /* こもれびの広場BGMの音量

     音源そのものの録音の大きさがちがうので、公園BGMとは別の数字にしてある
     （ひとまず公園BGMと同じ 0.16 にしてあるが、
       聞きくらべて大きい・小さいと感じたら、ここだけ書きかえればよい） */
  const secretBgmVolume = 0.16;

  /* 公園BGMを入れておく箱

     null は「まだ作っていない」という意味
     ※ ここで new Audio(...) をしないのが大事
       Nuxtはサーバー側でも一度このコードを読むが、
       サーバーには Audio が無いのでエラーになってしまう
  */
  let parkBgm: HTMLAudioElement | null = null;

  /* 公園BGMを用意して返す（初めて必要になったときだけ作る）

     ※ ここでは soundEnabled を見ない
       サウンドをOFFにした瞬間は soundEnabled が false になっているが、
       そのとき「鳴っているBGMを止める」ために、この関数が必要になるため
       （ここでnullを返すと、止めたいのに止められなくなってしまう）
  */
  function getParkBgm() {
    // サーバー側には Audio が無いので、ここで終わり
    if (!import.meta.client) {
      return null;
    }

    try {
      // まだ無いときだけ作る（2回目からは、この行は通らない）
      if (!parkBgm) {
        // public/audio/park-bgm.mp3 は、URLでは /audio/park-bgm.mp3 になる
        parkBgm = new Audio('/audio/park-bgm.mp3');

        // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
        parkBgm.loop = true;

        // volume … 音の大きさ（上の parkBgmVolume で決めている）
        setElementVolume(parkBgm, getSoundVolume(parkBgmVolume), getAudioContext);
      }

      return parkBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* 午前後半（10:30以降）の公園BGMを入れておく箱

     つくりは上の公園BGM（parkBgm）とまったく同じで、鳴らす曲だけがちがう
     null は「まだ作っていない」という意味
  */
  let parkBgm2: HTMLAudioElement | null = null;

  /* 午前後半の公園BGMを用意して返す（初めて必要になったときだけ作る）

     ※ getParkBgm() と同じ作りにしてある
       ここでも soundEnabled は見ない
       （OFFにした瞬間に「鳴っている曲を止める」ために必要になるため）
  */
  function getParkBgm2() {
    // サーバー側には Audio が無いので、ここで終わり
    if (!import.meta.client) {
      return null;
    }

    try {
      // まだ無いときだけ作る（2回目からは、この行は通らない）
      if (!parkBgm2) {
        // public/audio/park-bgm2.mp3 は、URLでは /audio/park-bgm2.mp3 になる
        parkBgm2 = new Audio('/audio/park-bgm2.mp3');

        // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
        parkBgm2.loop = true;

        // volume … 音の大きさ（上の parkBgm2Volume で決めている）
        setElementVolume(parkBgm2, getSoundVolume(parkBgm2Volume), getAudioContext);
      }

      return parkBgm2;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* 公園BGMが「午前後半の曲」に変わる時刻（分に直したもの）

     10 * 60 + 30 ＝ 630 で、ゲーム内時間の 10:30 のこと
     （currentMinutes と同じ「分」のものさしにそろえてある）
     切り替わる時刻を変えたくなったら、ここの数字だけを書きかえればよい
  */
  const parkBgm2StartMinutes = 10 * 60 + 30;

  /* いまは「午前後半の曲（BGM2）」を使う時間かどうか

     ゲーム内の時計を見て、10:30を過ぎていたら true（＝BGM2）
     まだ10:30より前なら false（＝BGM1）

     ※ 12:00を過ぎるとゴールで、公園BGMはどちらも鳴らさない
       （goToGoal() で止める）ので、ここでは12:00のことを考えなくてよい
  */
  function shouldUseParkBgm2() {
    return currentMinutes.value >= parkBgm2StartMinutes;
  }

  /* いまの時間に合う公園BGMを返す
     ＝「時計を見て、どちらの曲を使うかを選んでいる」ところ

     09:00〜10:29 … park-bgm.mp3  （午前前半）
     10:30〜      … park-bgm2.mp3 （午前後半）

     曲を選ぶ仕事をこの1か所にまとめてあるので、
     呼ぶ側（playParkBgm など）は、どちらの曲かを気にしなくてよい
  */
  function getCurrentParkBgm() {
    return shouldUseParkBgm2() ? getParkBgm2() : getParkBgm();
  }

  /* いまの時間に合う公園BGMの音量を返す

     曲ごとに録音の大きさがちがうので、
     「どの曲を鳴らすか」と「どの音量で鳴らすか」は、いつもセットで選ぶ
  */
  function getCurrentParkBgmVolume() {
    return shouldUseParkBgm2() ? parkBgm2Volume : parkBgmVolume;
  }

  /* いま鳴らしている公園BGM（鳴らしていないときは null）

     「BGM1・BGM2のどちらを鳴らしているか」を覚えておくための箱
     これがあると、10:30を過ぎたときに
     ・まだBGM1のまま → BGM2へ切り替える
     ・すでにBGM2     → 何もしない（押すたびに曲が頭から鳴りなおさない）
     を見わけられる
  */
  let activeParkBgm: HTMLAudioElement | null = null;

  /* BGMがフェードインしきるまでの長さ（ミリ秒）
     1000 で1秒かけて、無音から ふだんの音量まで上がる
     タイトルBGMと公園BGMで同じ値を使う */
  const bgmFadeInDuration = 1000;

  /* フェードインの途中経過を進める係の番号（していないときは null） */
  let bgmFadeTimer: ReturnType<typeof setInterval> | null = null;

  /* いまフェードインの最中にある曲（していないときは null）
     途中でやめたときに「どの曲の音量を戻すか」が分かるように覚えておく */
  let fadingBgm: HTMLAudioElement | null = null;

  /* その曲の「曲ごとの音量」（＝どこまで上げたら終わりか、のもとの数字）

     ここに入れるのは、音量スライダーのぶんをかける前の数字
     フェードの途中でスライダーを動かされても追いつけるように、
     実際の大きさは1回ごとに getSoundVolume() で計算しなおす */
  let fadingBgmBaseVolume = 0;

  /* BGMをフェードインさせる（音量を0から少しずつ上げる）

     HTML Audio には「だんだん大きくする」機能が無いので、
     0.05秒ごとに volume を少しずつ足していって、自分で作る

     いきなり ふだんの音量で始まると唐突に聞こえるので、
     すっと入ってくるようにするための演出

     ※ タイトルBGM・公園BGM・こもれびの広場BGM・いやいやBGM・リザルトBGM・GAME OVER BGMの
       どれにも使える
       2曲が同時に鳴ることはない（切り替えるときは必ず前の曲を止める）ので、
       フェインの係は1つだけ用意しておけば足りる

     bgm          … フェードインさせたい曲
     targetVolume … 上がりきったときの音量（曲ごとにちがう）
  */
  function startBgmFadeIn(bgm: HTMLAudioElement, targetVolume: number) {
    // 前のフェードが残っていたら止める（音量の取り合いにならないように）
    cancelBgmFade();

    if (!import.meta.client) {
      return;
    }

    const stepMs = 50; // 何ミリ秒ごとに音量を上げるか
    const totalSteps = Math.ceil(bgmFadeInDuration / stepMs);
    let doneSteps = 0;

    setElementVolume(bgm, 0, getAudioContext); // まずは無音から
    fadingBgm = bgm;
    fadingBgmBaseVolume = targetVolume;

    bgmFadeTimer = setInterval(() => {
      doneSteps += 1;

      // 進み具合（0 → 1）を、そのまま音量の割合として使う
      const ratio = doneSteps / totalSteps;

      /* 上がりきったときの大きさは、1回ごとに計算しなおす

         こうしておくと、フェードの途中で音量スライダーを
         100% → 30% のように動かしても、その場から新しい大きさに追いつく
         （古い目標をつかんだまま、100%相当まで上がってしまうことがない） */
      const goalVolume = getSoundVolume(fadingBgmBaseVolume);

      try {
        setElementVolume(bgm, ratio >= 1 ? goalVolume : goalVolume * ratio, getAudioContext);
      } catch {
        // 何もしない
      }

      // ふだんの音量まで上がりきったら終わり
      if (ratio >= 1) {
        cancelBgmFade();
      }
    }, stepMs);
  }

  /* フェードインを途中でやめる

     ※ やめたあとは volume を ふだんの大きさへ戻しておく
       0.1 まで上がった途中で止めると、次に鳴らすとき小さいままになってしまう
  */
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

  /* 「いまの時間に合う公園BGM」を最初から再生する（ゲームを始めたとき用）

     どちらの曲を鳴らすかは、そのときのゲーム内時間で決まる
     ・10:30より前 … park-bgm.mp3  （BGM1）
     ・10:30以降   … park-bgm2.mp3 （BGM2）

     currentTime は「いま曲のどこを再生しているか」を秒で表したもの
     0 を入れると曲の先頭に戻る
  */
  function playParkBgm() {
    // サウンドOFFのときは、ここで終わり
    // ※ getCurrentParkBgm() より先に見ることで、OFFのあいだは
    //   mp3の読み込みそのものが起きないようにしている
    if (!soundEnabled.value) {
      return;
    }

    // 時計を見て、いま鳴らすべき公園BGMを選ぶ
    const bgm = getCurrentParkBgm();

    if (!bgm) {
      return;
    }

    /* BGM1とBGM2が重なって鳴らないように、いったん両方止めてから始める
       （鳴っていない曲に「止めて」と言っても、何も起きないだけなので安全） */
    stopParkBgm();

    try {
      bgm.currentTime = 0; // 曲の先頭へ戻す

      // いま鳴らしている曲として覚えておく（10:30の切り替え判定に使う）
      activeParkBgm = bgm;

      // 無音から少しずつ大きくしていく（音量も、選んだ曲に合わせる）
      startBgmFadeIn(bgm, getCurrentParkBgmVolume());
      // play() は「再生できたかどうか」をあとから知らせる形（Promise）になっている
      // 自動再生をブラウザに止められることがあるので、失敗しても何もしないでおく
      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* 公園BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
     1000 で1秒。ここだけ書きかえれば、間の長さを調整できる */
  const parkBgmStartDelay = 700;

  /* 「あとで鳴らす」の予約票

     null は「予約していない」という意味
     setTimeout() は予約すると番号を返してくれるので、それを control用に取っておく
     （あとで「やっぱり鳴らさない」と取り消すのに必要）
  */
  let parkBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* 公園BGMを「少し待ってから」最初から鳴らす

     「このおやつで公園へ行く！」を押した瞬間にいきなり曲が始まると、
     決定音「ポン♪」が鳴りはじめの曲にかき消されてしまい、
     タイトルBGMからの切り替わりも唐突に聞こえる
     そこで少しだけ間を空けて、決定音が鳴り終わってから曲を始める

     ※ 待たせるのは「音を鳴らすこと」だけ
       画面の切り替えやゲームの処理は、いつもどおりすぐ進む

     ※ BGM1とBGM2のどちらを鳴らすかは、待ち時間が終わったとき（700ms後）に決まる
       実際に鳴らす playParkBgm() が、そのときの時計を見て選ぶため
       たとえば、いやいやが終わったのが10:40なら、BGM1ではなくBGM2から始まる
  */
  function playParkBgmSoon() {
    // 前の予約が残っていたら取り消す（二重に鳴らさないため）
    cancelParkBgmStart();

    // サーバー側では音を鳴らさないので、予約もしない
    if (!import.meta.client) {
      return;
    }

    parkBgmTimer = setTimeout(() => {
      parkBgmTimer = null;

      /* 待っているあいだに画面が変わっていたら、もう鳴らさない
         （すぐ「もう一度あそぶ」でタイトルへ戻った、
           ゴールやGAME OVERになった、などの場合） */
      if (!gameStarted.value || isResultScene.value) {
        return;
      }

      playParkBgm();
    }, parkBgmStartDelay);
  }

  /* 「あとで鳴らす」の予約を取り消す */
  function cancelParkBgmStart() {
    if (parkBgmTimer === null) {
      return;
    }

    clearTimeout(parkBgmTimer);
    parkBgmTimer = null;
  }

  /* 公園BGMを「続きから」再生する（サウンドをONに戻したとき用）

     playParkBgm() とのちがいは currentTime を 0 に戻さないこと
     OFFにしたところから、そのまま続きを鳴らす

     ※ ここでも「いまの時間に合う曲」を選びなおす
       10:20でサウンドOFFにして、音を消したまま10:40まで進めてからONに戻したときは、
       BGM1の続きではなく、BGM2を先頭から鳴らす
       （音を消しているあいだに、午前後半に入っているため）
  */
  function resumeParkBgm() {
    if (!soundEnabled.value) {
      return;
    }

    // 時計を見て、いま鳴らすべき公園BGMを選ぶ
    const bgm = getCurrentParkBgm();

    if (!bgm) {
      return;
    }

    /* OFFにする前と曲が変わっているときは、「続き」ではなく最初から鳴らす
       （曲を選んで先頭から鳴らす仕事は playParkBgm() にまかせる）

       ※ activeParkBgm が null のとき（その曲をまだ一度も鳴らしていない）も、こちら
       ※ 同じ曲のままのときは下へ進み、止めた位置からそのまま続きが鳴る */
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

  /* 公園BGMを1曲だけ一時停止する（下の pauseParkBgm() の中身）

     まだ作っていない（null＝一度も鳴らしていない）曲には、何もしなくてよい
  */
  function pauseOneParkBgm(bgm: HTMLAudioElement | null) {
    if (!bgm) {
      return;
    }

    try {
      pauseElement(bgm);
    } catch {
      // 何もしない
    }
  }

  /* 公園BGMを一時停止する（どこまで再生したかは覚えたまま）

     pause() は「その場で止める」だけなので、
     もう一度 play() すると、止めたところから続きが鳴る

     ※ BGM1・BGM2の両方に声をかける
       どちらの曲が鳴っている時間帯でも、サウンドOFFで確実に止まるようにするため

     ※ currentTime（どこまで鳴らしたか）はリセットしない
       activeParkBgm も、そのまま覚えておく
       サウンドをONに戻したとき、同じ曲なら止めた位置から続けられるようにするため
  */
  function pauseParkBgm() {
    // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
    // （こうしないと、次に再開したとき小さい音のままになる）
    cancelBgmFade();

    pauseOneParkBgm(parkBgm);
    pauseOneParkBgm(parkBgm2);
  }

  /* 公園BGMを1曲だけ完全に止める（下の stopParkBgm() の中身）

     まだ作っていない（null＝一度も鳴らしていない）曲には、何もしなくてよい
  */
  function stopOneParkBgm(bgm: HTMLAudioElement | null) {
    if (!bgm) {
      return;
    }

    try {
      pauseElement(bgm, { rewind: true });
    } catch {
      // 何もしない
    }
  }

  /* 公園BGMを完全に止める（次はまた最初から鳴るようにする）

     pause() で止めるだけだと、次に遊ぶとき曲の途中から始まってしまう
     currentTime = 0 で先頭に戻しておく

     ※ BGM1・BGM2の両方を止める
       ゴール・GAME OVER・もう一度あそぶ・いやいや発生のどれでも、
       そのときどちらの曲が鳴っていても、確実に止まってほしいため
  */
  function stopParkBgm() {
    /* 「あとで鳴らす」の予約も取り消す

       ※ かならず曲を止める処理より前に置くこと
         予約だけして、まだ曲を作っていない状態のことがあるため
         （公園へ行った直後にゴールした、など）
         あとに置くと、取り消せずに あとから鳴りだしてしまう */
    cancelParkBgmStart();

    // フェードインの途中で止めることもあるので、音量も戻しておく
    cancelBgmFade();

    stopOneParkBgm(parkBgm);
    stopOneParkBgm(parkBgm2);

    // 「いま鳴らしている曲」も無し（null）に戻す
    activeParkBgm = null;
  }

  /* 時間に合わせて、公園BGMをBGM1からBGM2へ切り替える

     「次の場所を選ぶ」を押したとき（goToNextPlace）に呼ぶ

     わざと「10:30になった瞬間」ではなく、
     「10:30を過ぎたあと、次の場面へ進むとき」に切り替えている
     結果カードを読んでいる途中で曲が変わると唐突に感じるので、
       午前前半の章 → 行動の結果 → 午前後半の章
     という自然な流れになるようにするため

     やることは3つだけ
     ・まだ10:30より前         → 何もしない（BGM1のまま）
     ・すでにBGM2を鳴らしている → 何もしない（押すたびに頭から鳴りなおさない）
     ・10:30を過ぎたのにBGM1    → BGM1を止めて、少し間を空けてからBGM2へ
  */
  function switchParkBgmForCurrentTime() {
    // まだ午前前半（10:30より前）なら、BGM1のままでよい
    if (!shouldUseParkBgm2()) {
      return;
    }

    /* いまBGM1を鳴らしているときだけ、切り替えの出番

       ・activeParkBgm が parkBgm2 … すでに切り替え済みなので何もしない
         （これが無いと「次の場所を選ぶ」を押すたびにBGM2が頭から鳴りなおしてしまう）
       ・activeParkBgm が null     … いま公園BGMは鳴っていない
         （サウンドOFF中、いやいやが終わって playParkBgmSoon() の順番待ち中など）
         この場合は、あとで鳴らすときに時間を見て選びなおされるので、ここでは何もしない */
    if (activeParkBgm !== parkBgm) {
      return;
    }

    /* BGM1を止めて、少し間を空けてからBGM2を最初から鳴らす

       ① stopParkBgm()     … BGM1をその場で止める（いったん無音になる）
       ② playParkBgmSoon() … 700ms待ってから、いまの時間に合う曲＝BGM2を
                             先頭からフェードインで鳴らしはじめる

       ②で playParkBgm() を直接呼ばず「Soon」のほうを使うのがポイント
       ・決定音「ポン♪」が、鳴りはじめの曲にかき消されない
       ・いったん無音をはさむので「章が変わった」感じが出る
       ・ゲームを始めたときや、いやいやが終わって公園へ戻るときと
         まったく同じ聞こえかたにそろう

       ※ ①を先にやるのが大事
         先に止めておかないと、待っている700msのあいだBGM1が鳴り続けて、
         そのあと急にぶつ切りになってしまう

       （今回はこみいったクロスフェードまではせず、ふわっと入ってくれば十分） */
    stopParkBgm();
    playParkBgmSoon();
  }

  /* ============================================================
     タイトル画面のBGM

     作りは公園BGM（上）とまったく同じで、鳴らす曲と鳴らす場面だけがちがう
     ・タイトルBGM … gameStarted === false のあいだ（タイトル画面）
     ・公園BGM     … 「このおやつで公園へ行く！」を押してから、ゴール／GAME OVERまで

     2曲が同時に鳴らないよう、切り替えるときは
     「前の曲を止めてから、次の曲を鳴らす」の順番にしている
     ============================================================ */

  /* タイトルBGMを入れておく箱
     公園BGMと同じく、サーバー側では作れないので null から始める */
  let titleBgm: HTMLAudioElement | null = null;

  /* タイトルBGMを用意して返す（初めて必要になったときだけ作る）

     ※ 公園BGMと同じく、ここでは soundEnabled を見ない
       OFFにした瞬間に「鳴っている曲を止める」ために必要になるため
  */
  function getTitleBgm() {
    // サーバー側には Audio が無いので、ここで終わり
    if (!import.meta.client) {
      return null;
    }

    try {
      // まだ無いときだけ作る（2回目からは、この行は通らない）
      if (!titleBgm) {
        // public/audio/title-bgm.mp3 は、URLでは /audio/title-bgm.mp3 になる
        titleBgm = new Audio('/audio/title-bgm.mp3');

        // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
        titleBgm.loop = true;

        // volume … 音の大きさ（上の titleBgmVolume で決めている）
        setElementVolume(titleBgm, getSoundVolume(titleBgmVolume), getAudioContext);
      }

      return titleBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* タイトルBGMを「最初から」再生する
     ページを開いたときと、「もう一度あそぶ」でタイトルに戻ったとき用 */
  function playTitleBgm() {
    // サウンドOFFのときは、ここで終わり
    // ※ getTitleBgm() より先に見ることで、OFFのあいだは
    //   mp3の読み込みそのものが起きないようにしている
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getTitleBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0; // 曲の先頭へ戻す

      // タイトルBGMはフェードインさせず、そのまま鳴らす
      // （フェードインするのは公園BGMだけ）
      setElementVolume(bgm, getSoundVolume(titleBgmVolume), getAudioContext);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* タイトルBGMを鳴らしはじめるまでの待ち時間（ミリ秒）
     1000 で1秒。ここだけ書きかえれば、間の長さを調整できる */
  const titleBgmStartDelay = 700;

  /* 「あとで鳴らす」の予約票（公園BGMのものと同じ仕組み）

     null は「予約していない」という意味
     setTimeout() は予約すると番号を返してくれるので、それを取っておく
     （あとで「やっぱり鳴らさない」と取り消すのに必要）
  */
  let titleBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* タイトルBGMを「少し待ってから」最初から鳴らす

     ボタンを押した瞬間にいきなり曲が始まると唐突に聞こえるので、
     公園BGM（playParkBgmSoon）と同じように、少しだけ間を空ける

     ※ 待たせるのは「音を鳴らすこと」だけ
       画面の切り替えやゲームの処理は、いつもどおりすぐ進む
  */
  function playTitleBgmSoon() {
    // 前の予約が残っていたら取り消す（二重に鳴らさないため）
    cancelTitleBgmStart();

    // サーバー側では音を鳴らさないので、予約もしない
    if (!import.meta.client) {
      return;
    }

    titleBgmTimer = setTimeout(() => {
      titleBgmTimer = null;

      /* 待っているあいだに画面が変わっていたら、もう鳴らさない
         （待ち時間のうちに「このおやつで公園へ行く！」を押して、
           ゲームが始まってしまった場合） */
      if (gameStarted.value) {
        return;
      }

      playTitleBgm();
    }, titleBgmStartDelay);
  }

  /* 「あとで鳴らす」の予約を取り消す */
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
    // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
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
    // フェードインの途中で止めることもあるので、音量も戻しておく
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
     いやいやタイムのBGM

     作りは公園BGM・タイトルBGMとまったく同じで、鳴らす場面だけがちがう
     ・いやいやBGM … いやいやタイムの画面にいるあいだ（currentEvent === 'tantrum'）

     ここでいちばん大事なのは「いつ切り替えるか」

     ① いやいやが発生した瞬間（isTantrum が true になったとき）は、
       公園BGMを stop して「無音」にするだけ（いやいやBGMはまだ鳴らさない）
       プレイヤーはまだ「通常行動の結果」を読んでいる最中なので、
       しんと静かな画面で「たいへんなことが起きた」を伝える

     ② 「こうちゃんのところへ行く」を押して、いやいやタイムの画面へ移った瞬間に切り替える
       （goToNextPlace() の中）

     ③ いやいやが終わっても（isTantrum が false になっても）、その瞬間には止めない
       「ぎゅっとだっこすると……」などの結果を読んでいるあいだ、画面はまだ
       いやいやタイムなので、曲もそのまま流しつづける

     ④ 「次の場所を選ぶ」でいやいやタイムの画面から出るときに止める
       （こちらも goToNextPlace() の中）
     ============================================================ */

  /* いやいやBGMを入れておく箱
     ほかの2曲と同じく、サーバー側では作れないので null から始める */
  let tantrumBgm: HTMLAudioElement | null = null;

  /* いやいやBGMを用意して返す（初めて必要になったときだけ作る）

     ※ ほかの2曲と同じく、ここでは soundEnabled を見ない
       OFFにした瞬間に「鳴っている曲を止める」ために必要になるため
  */
  function getTantrumBgm() {
    // サーバー側には Audio が無いので、ここで終わり
    if (!import.meta.client) {
      return null;
    }

    try {
      // まだ無いときだけ作る（2回目からは、この行は通らない）
      if (!tantrumBgm) {
        // public/audio/tantrum-bgm.mp3 は、URLでは /audio/tantrum-bgm.mp3 になる
        tantrumBgm = new Audio('/audio/tantrum-bgm.mp3');

        // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
        // （いやいやが何回続いても、音が途切れないようにするため）
        tantrumBgm.loop = true;

        // volume … 音の大きさ（上の tantrumBgmVolume で決めている）
        setElementVolume(tantrumBgm, getSoundVolume(tantrumBgmVolume), getAudioContext);
      }

      return tantrumBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* いやいやBGMを「最初から」再生する（いやいやタイムへ入ったとき用）

     いやいやは1回ごとに独立した場面なので、毎回きちんと曲の頭から始める
     （前のいやいやの途中から鳴りだすと、場面が変わった感じがしない）

     公園BGMと同じくフェードインさせる
     公園BGMを止めた直後に、いきなり別の曲が最大音量で始まると唐突なため
  */
  function playTantrumBgm() {
    // サウンドOFFのときは、ここで終わり
    // ※ getTantrumBgm() より先に見ることで、OFFのあいだは
    //   mp3の読み込みそのものが起きないようにしている
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getTantrumBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0; // 曲の先頭へ戻す

      /* 無音から少しずつ大きくしていく

         ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は
           公園BGMと共用で問題ない
           2曲が同時に鳴ることはなく、切り替えるときは必ず前の曲を止めており、
           startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
      startBgmFadeIn(bgm, tantrumBgmVolume);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* いやいやBGMを「続きから」再生する（サウンドをONに戻したとき用）

     playTantrumBgm() とのちがいは currentTime を 0 に戻さないこと
     OFFにしたところから、そのまま続きを鳴らす
  */
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

  /* いやいやBGMを一時停止する（どこまで再生したかは覚えたまま）
     サウンドをOFFにしたときと、ページを離れるときに使う */
  function pauseTantrumBgm() {
    // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
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

  /* いやいやBGMを完全に止める（次はまた最初から鳴るようにする）

     いやいやタイムの画面から出るとき・ゴール・GAME OVER・
     「もう一度あそぶ」で使う

     pause() ではなく stop（先頭へ戻す）にしているのは、
     次のいやいやが「前のいやいやの続き」から鳴りださないようにするため
  */
  function stopTantrumBgm() {
    // フェードインの途中で止めることもあるので、音量も戻しておく
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
     リザルト画面のBGM

     作りは公園BGM・タイトルBGM・いやいやBGMとまったく同じで、
     鳴らす場面だけがちがう
     ・リザルトBGM … 通常ゴールの結果画面にいるあいだ（currentEvent === 'goal'）

     「午前中に親子で公園をたくさん探検して、お昼になったので帰る」という
     おしまいの場面に合う曲を流す

     ※ GAME OVER画面で流すのは、この曲ではない
       GAME OVERは「途中で帰ることになってしまった」場面なので、
       別の専用曲（GAME OVER BGM）を流す（すぐ下の「GAME OVER画面のBGM」を参照）
       ・ゴール（currentEvent === 'goal'）        … リザルトBGM（result-bgm.mp3。S+ランクだけ result-bgm-splus.mp3）
       ・GAME OVER（currentEvent === 'gameOver'） … GAME OVER BGM（game-over-bgm.mp3）

     ※ S+ランクのときだけ、うた入りの曲「きょうの大冒険、おしまい！ ～うた入り～」を流す
       曲がちがうだけで、同じリザルトBGMとしてあつかう
       （入れもの resultBgm も、鳴らす・止める・再開する関数も、ぜんぶ同じものを使う）
       鳴らす前に getResultBgm() が、今回のランクに合わせて src を差しかえる

     ※ ゴール音「タタターン♪」とは重ねない
       goToGoal() で「タタターン♪」を鳴らしたあと、
       少しだけ間を空けてから曲を始める（playResultBgmSoon）
     ============================================================ */

  /* リザルトBGMを入れておく箱
     ほかの3曲と同じく、サーバー側では作れないので null から始める */
  let resultBgm: HTMLAudioElement | null = null;

  /* 通常のリザルトBGMの音源（Sランク以下と、特殊エンドで流す）
     public/audio/result-bgm.mp3 は、URLでは /audio/result-bgm.mp3 になる
     （S+ランク用の sPlusSongSrc は、サウンドトラックと共用なので utils/sPlusSong.ts にある） */
  const resultBgmSrc = '/audio/result-bgm.mp3';

  /* 今回のランクに合ったリザルトBGMの音源を返す

     S+ランクのときだけ、うた入り
     Sランクもふくめ、それ以外（A〜D・特殊エンド）はぜんぶ通常版 */
  function getResultBgmSrc() {
    return endingRank.value === 'S+ランク' ? sPlusSongSrc : resultBgmSrc;
  }

  /* リザルトBGMを用意して返す（初めて必要になったときだけ作る）

     ※ ほかの3曲と同じく、ここでは soundEnabled を見ない
       OFFにした瞬間に「鳴っている曲を止める」ために必要になるため

     ※ 入れもの（Audio）は1つだけ作って使いまわすが、鳴らす曲は今回のランクで変わる
       同じページのまま何回も遊ぶと、「1回目 S+ → 2回目 A → 3回目 S+」のように
       前回とちがう曲が必要になるので、呼ばれるたびに src が今回のランクに合っているかを確かめる
  */
  function getResultBgm() {
    // サーバー側には Audio が無いので、ここで終わり
    if (!import.meta.client) {
      return null;
    }

    try {
      const src = getResultBgmSrc();

      // まだ無いときだけ作る（2回目からは、この行は通らない）
      if (!resultBgm) {
        resultBgm = new Audio(src);

        // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
        // （結果をゆっくり読んでいても、曲が途切れないようにするため）
        resultBgm.loop = true;

        // volume … 音の大きさ（上の resultBgmVolume で決めている）
        setElementVolume(resultBgm, getSoundVolume(resultBgmVolume), getAudioContext);
      } else if (resultBgm.getAttribute('src') !== src) {
        /* 前のゴールとランクがちがって、鳴らす曲が変わるときだけ差しかえる

           ・同じ曲のときは差しかえない
             サウンドをONに戻して「続きから」鳴らすとき（resumeResultBgm）に、先頭へ戻ってしまうため
           ・src を差しかえると再生位置は先頭に戻るが、loop と volume はそのまま残る

           ※ resultBgm.src ではなく getAttribute('src') で比べるのは、
             .src だと「http://〜/audio/result-bgm.mp3」のような長い形で返ってきて、
             同じ曲でも文字が食いちがってしまうため */
        resultBgm.src = src;
      }

      return resultBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* リザルトBGMを「最初から」再生する（ゴールしたとき用）

     公園BGM・いやいやBGMと同じくフェードインさせる
     ゴール音「タタターン♪」のあとに、ふわっと曲が始まるようにするため
  */
  function playResultBgm() {
    // サウンドOFFのときは、ここで終わり
    // ※ getResultBgm() より先に見ることで、OFFのあいだは
    //   mp3の読み込みそのものが起きないようにしている
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getResultBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0; // 曲の先頭へ戻す

      /* 無音から少しずつ大きくしていく

         ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は
           ほかの3曲と共用で問題ない
           4曲が同時に鳴ることはなく、切り替えるときは必ず前の曲を止めており、
           startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
      startBgmFadeIn(bgm, resultBgmVolume);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* リザルトBGMを鳴らしはじめるまでの待ち時間（ミリ秒）
     1500 で1.5秒。ここだけ書きかえれば、間の長さを調整できる

     ゴール音「タタターン♪」と同時に曲が始まってしまうと
     せっかくのファンファーレが聞こえなくなるので、そのぶんだけ待つ */
  const resultBgmStartDelay = 1500;

  /* 「あとで鳴らす」の予約票（公園BGM・タイトルBGMのものと同じ仕組み）

     null は「予約していない」という意味
     setTimeout() は予約すると番号を返してくれるので、それを取っておく
     （あとで「やっぱり鳴らさない」と取り消すのに必要）
  */
  let resultBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* Audio を「あとから鳴らせる」状態にしておく（ボタンを押した瞬間に呼ぶこと）

     iPhone のブラウザでは、1つ1つの Audio について
     「さわった瞬間に一度 play() されたか」を覚えていて、
     一度でもそうされた Audio は、そのあと いつ play() しても鳴らせる
     そこで、さわった瞬間に、音を消したまま（muted）一度 play() して、すぐ止めておく
     ・muted のまま、すぐ pause() するので、音は出ない
     ・すぐ止めるので play() の約束（Promise）は取り消しで終わるが、それは無視してよい
     ・すでに鳴っている Audio は止めてしまわないように、さわらない */
  function unlockAudioElement(audio: HTMLAudioElement) {
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

  /* リザルトBGMを「少し待ってから」最初から鳴らす

     ※ 待たせるのは「音を鳴らすこと」だけ
       結果画面は、いつもどおりすぐ表示される
  */
  function playResultBgmSoon() {
    // 前の予約が残っていたら取り消す（二重に鳴らさないため）
    cancelResultBgmStart();

    // サーバー側では音を鳴らさないので、予約もしない
    if (!import.meta.client) {
      return;
    }

    /* 待つ前に、リザルトBGMを「あとから鳴らせる」状態にしておく（→ unlockAudioElement）

       iPhone のブラウザ（Safari・Chrome）では、ボタンを押してから1秒以上たったあとに
       新しい Audio を play() しても、止められて鳴らない
       待ち時間（1.5秒）は、ほかのBGM（0.7秒）とちがって1秒をこえるので、
       ここでしておかないと、ブラウザで遊んだときだけエンディングの曲が鳴らなかった
       ※ この関数は、ゴールのボタンを押した流れ（goToGoal()）の中から、待たずに呼ばれている */
    if (soundEnabled.value) {
      const bgm = getResultBgm();

      if (bgm) {
        unlockAudioElement(bgm);
      }
    }

    resultBgmTimer = setTimeout(() => {
      resultBgmTimer = null;

      /* 待っているあいだに画面が変わっていたら、もう鳴らさない
         （待ち時間のうちに「もう一度あそぶ」を押して、
           タイトル画面へ戻ってしまった場合） */
      if (currentEvent.value !== 'goal') {
        return;
      }

      playResultBgm();
    }, resultBgmStartDelay);
  }

  /* 「あとで鳴らす」の予約を取り消す */
  function cancelResultBgmStart() {
    if (resultBgmTimer === null) {
      return;
    }

    clearTimeout(resultBgmTimer);
    resultBgmTimer = null;
  }

  /* リザルトBGMを「続きから」再生する（サウンドをONに戻したとき用）

     playResultBgm() とのちがいは currentTime を 0 に戻さないこと
     OFFにしたところから、そのまま続きを鳴らす
  */
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

  /* リザルトBGMを一時停止する（どこまで再生したかは覚えたまま）
     サウンドをOFFにしたときと、ページを離れるときに使う */
  function pauseResultBgm() {
    // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
    // （こうしないと、次に再開したとき小さい音のままになる）
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

  /* リザルトBGMを完全に止める（次はまた最初から鳴るようにする）
     「もう一度あそぶ」で使う */
  function stopResultBgm() {
    /* 「あとで鳴らす」の予約も取り消す

       ※ かならず下の「まだ作っていないなら終わり」より前に置くこと
         ゴール音が鳴っているあいだに「もう一度あそぶ」を押すと、
         予約だけして、まだ曲を作っていない状態のことがあるため
         あとに置くと、取り消せずに タイトル画面で鳴りだしてしまう */
    cancelResultBgmStart();

    // フェードインの途中で止めることもあるので、音量も戻しておく
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
     GAME OVER画面のBGM

     作りはリザルトBGM（すぐ上）とまったく同じで、鳴らす場面だけがちがう
     ・GAME OVER BGM … GAME OVER画面にいるあいだ（currentEvent === 'gameOver'）

     ■ なぜGAME OVER画面だけの専用曲にするのか

       おでかけの終わりかたは2つあり、気持ちがまったくちがう
       ・ゴール     … 12時まで遊びきった「きょうの大冒険、おしまい！」 → リザルトBGM
       ・GAME OVER … 途中で限界になって帰る「きょうはここまで。また遊ぼう」 → この曲

       同じ曲を使いまわすと、どちらの終わりかたなのかが音から伝わらなくなる
       そこで、入れもの（gameOverBgm）も関数も音量も、リザルトBGMとはぜんぶ別にしてある
       （リザルトBGMの関数は、GAME OVERを鳴らすためには1つも使わない）

     ■ 鳴るまでの流れ

       ① checkGameOver() で GAME OVER が決まる
          → 画面はその場でGAME OVER画面へ切りかわる
          → それまで鳴っていた曲（公園・秘密の場所・いやいや・リザルト）を止める
       ② playGameOverBgmSoon() で「0.7秒あとに鳴らす」予約をする
       ③ 0.7秒の無音のあと、playGameOverBgm() が曲の先頭からフェードインで鳴らす

     ※ GAME OVER専用の短い効果音は付けていない
       「少し無音 → GAME OVER BGM」という、しずかな切りかわりにしている
     ============================================================ */

  /* GAME OVER BGMを入れておく箱

     null は「まだ作っていない」という意味

     ※ ここで new Audio('/audio/game-over-bgm.mp3') と書かないのが大事
       Nuxtは、ページを作るときにサーバー側でも一度このコードを読む
       サーバーには Audio が無いので、ここで作るとエラーになってしまう
       そこで箱だけ用意しておき、ブラウザで必要になったとき
       （getGameOverBgm() が初めて呼ばれたとき）に作る */
  let gameOverBgm: HTMLAudioElement | null = null;

  /* GAME OVER BGMを用意して返す（初めて必要になったときだけ作る）

     ※ ほかの曲と同じく、ここでは soundEnabled を見ない
       OFFにした瞬間に「鳴っている曲を止める」ためにも、この関数が必要になるため
  */
  function getGameOverBgm() {
    // サーバー側には Audio が無いので、ここで終わり
    if (!import.meta.client) {
      return null;
    }

    try {
      // まだ無いときだけ作る（2回目からは、この行は通らない）
      if (!gameOverBgm) {
        // public/audio/game-over-bgm.mp3 は、URLでは /audio/game-over-bgm.mp3 になる
        gameOverBgm = new Audio('/audio/game-over-bgm.mp3');

        /* loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す

           曲は2分ほどあるので、ふつうはその前に「もう一度あそぶ」などを押して止まる
           それでも、記録をゆっくり読んでいたり、画面をそのまま置いておいたりしたときに、
           とちゅうで急に無音にならないように、くり返しておく */
        gameOverBgm.loop = true;

        // volume … 音の大きさ（上の gameOverBgmVolume で決めている）
        setElementVolume(gameOverBgm, getSoundVolume(gameOverBgmVolume), getAudioContext);
      }

      return gameOverBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* GAME OVER BGMを「最初から」再生する（GAME OVERになったとき用）

     ■ play と resume のちがい
       ・playGameOverBgm()   … currentTime を 0 にして、曲の先頭から鳴らす
                               GAME OVERになるたびに、いつも同じ始まりかたにしたいため
       ・resumeGameOverBgm() … currentTime はさわらず、止めたところの続きから鳴らす
                               サウンドを OFF → ON に戻したとき用

     前の曲が止まったあとに、いきなり曲がいつもの音量で始まると唐突なので、
     ほかのBGMと同じ startBgmFadeIn() で、無音からふわっと大きくしていく
  */
  function playGameOverBgm() {
    // サウンドOFFのときは、ここで終わり
    // ※ getGameOverBgm() より先に見ることで、OFFのあいだは
    //   mp3の読み込みそのものが起きないようにしている
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getGameOverBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0; // 曲の先頭へ戻す

      /* 無音から少しずつ大きくしていく

         ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は、ほかの曲と共用で問題ない
           2曲が同時に鳴ることはなく（GAME OVERになるときに、前の曲はぜんぶ止めてある）、
           startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
      startBgmFadeIn(bgm, gameOverBgmVolume);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* GAME OVER BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
     700 で0.7秒。ここだけ書きかえれば、間の長さを調整できる

     待つ理由は2つ
     ・GAME OVERになる直前の決定音「ポン♪」や、いやいや発生の音などが、
       曲の鳴りはじめと重ならないようにするため
     ・前の曲が止まったあと、いったん「しん」とする間を作るため
       この短い無音があることで、「今日の遊びはここでおしまい」という区切りが伝わる

     ※ 待たせるのは「音」だけ
       GAME OVER画面そのものは、この待ち時間とは関係なく、すぐに表示される */
  const gameOverBgmStartDelay = 700;

  /* 「あとで鳴らす」の予約票（リザルトBGMのものと同じ仕組み）

     null は「予約していない」という意味
     setTimeout() は予約すると番号を返してくれるので、それを取っておく
     （あとで「やっぱり鳴らさない」と取り消すのに必要）
  */
  let gameOverBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* GAME OVER BGMを「少し待ってから」最初から鳴らす（checkGameOver() から呼ぶ）

     ■ 最初に、前の予約を取り消す理由
       予約が2つ残っていると、0.7秒後に「先頭から鳴らす」が2回はたらき、
       鳴りはじめた曲が頭からやりなおしになってしまう
       先に cancelGameOverBgmStart() で消しておけば、予約はいつも1つだけになる

     ■ 鳴らす直前に、まだGAME OVER画面にいるかを確かめる理由
       0.7秒待っているあいだに「もう一度あそぶ」などを押して、画面が変わっていることがある
       確かめずに鳴らすと、タイトル画面でGAME OVERの曲が流れてしまう
  */
  function playGameOverBgmSoon() {
    // 前の予約が残っていたら取り消す（二重に鳴らさないため）
    cancelGameOverBgmStart();

    // サーバー側では音を鳴らさないので、予約もしない
    if (!import.meta.client) {
      return;
    }

    gameOverBgmTimer = setTimeout(() => {
      gameOverBgmTimer = null;

      // 待っているあいだにGAME OVER画面から出ていたら、もう鳴らさない
      if (currentEvent.value !== 'gameOver') {
        return;
      }

      playGameOverBgm();
    }, gameOverBgmStartDelay);
  }

  /* 「あとで鳴らす」の予約を取り消す */
  function cancelGameOverBgmStart() {
    if (gameOverBgmTimer === null) {
      return;
    }

    clearTimeout(gameOverBgmTimer);
    gameOverBgmTimer = null;
  }

  /* GAME OVER BGMを「続きから」再生する（サウンドをONに戻したとき用）

     playGameOverBgm() とのちがいは currentTime を 0 に戻さないこと
     OFFにしたところから、そのまま続きを鳴らす

     ※ サウンドOFFのままGAME OVERになり、GAME OVER画面でONに戻したときは、
       まだ曲を一度も作っていない（gameOverBgm が null）
       その場合は getGameOverBgm() がここで初めて作るので、曲の先頭から鳴りはじめる
  */
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

  /* GAME OVER BGMを一時停止する（どこまで再生したかは覚えたまま）
     サウンドをOFFにしたときと、ページを離れるときに使う

     ■ pause と stop のちがい
       ・pauseGameOverBgm() … その場で止めるだけ。currentTime（どこまで鳴らしたか）は残す
                              → サウンドを ON に戻したとき、止めた位置から続けられる
       ・stopGameOverBgm()  … 止めたうえで、currentTime を 0（曲の先頭）へ戻す
                              → GAME OVER画面から出るとき用。次のGAME OVERでは、また先頭から鳴る
  */
  function pauseGameOverBgm() {
    // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
    // （こうしないと、次に再開したとき小さい音のままになる）
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

  /* GAME OVER BGMを完全に止める（次はまた最初から鳴るようにする）
     GAME OVER画面から出るとき（resetGame() ＝ もう一度あそぶ／はじめの画面へ戻る）に使う */
  function stopGameOverBgm() {
    /* 「あとで鳴らす」の予約も取り消す

       ※ かならず下の「まだ作っていないなら終わり」より前に置くこと
         GAME OVERになってすぐ（0.7秒待っている最中に）「もう一度あそぶ」を押すと、
         予約だけして、まだ曲を作っていない状態のことがあるため
         あとに置くと、取り消せずに タイトル画面で鳴りだしてしまう */
    cancelGameOverBgmStart();

    // フェードインの途中で止めることもあるので、フェードもやめておく
    cancelBgmFade();

    if (!gameOverBgm) {
      return;
    }

    try {
      pauseElement(gameOverBgm, { rewind: true }); // 次のGAME OVERでは、また曲の先頭から

      // 音量も、決めてある大きさへ戻しておく
      // （フェードインの途中で止めると、小さい音量のまま残ることがあるため）
      setElementVolume(gameOverBgm, getSoundVolume(gameOverBgmVolume), getAudioContext);
    } catch {
      // 何もしない
    }
  }

  /* ============================================================
     こもれびの広場のBGM

     作りは公園BGM・タイトルBGM・いやいやBGM・リザルトBGMとまったく同じで、
     鳴らす場面だけがちがう
     ・こもれびの広場BGM … 秘密の場所にいるあいだ（currentEvent === 'secretSpot'）

     ここだけ曲を変える理由は「特別な場所に来た」と分かるようにするため
     公園入口・すべり台・砂場などは、ぜんぶ同じ公園のつづきなので公園BGMのまま
     秘密の場所は、たくさん遊んだ人だけが入れる特別な場所なので、曲も変える

     ※ 公園BGMとは必ず「入れかえ」にする（重ねない）
       秘密の場所へ入るときは公園BGMを止めてから、
       出るときはこもれびの広場BGMを止めてから、次の曲を鳴らす
       2曲が同時に鳴ると、どちらもにごって聞こえてしまうため

     ※ 秘密の場所を出たら、公園BGM1・BGM2のどちらへ戻るかは時計が決める
       戻る先を park-bgm.mp3 に決め打ちしないこと
       10:40に秘密の場所を出たのに午前前半のBGM1へ戻ると、
       時間帯で曲を変えている仕組み（shouldUseParkBgm2）がこわれてしまう
       曲を選ぶ仕事は playParkBgmSoon() → playParkBgm() にまかせる
     ============================================================ */

  /* こもれびの広場BGMを入れておく箱
     ほかの4曲と同じく、サーバー側では作れないので null から始める */
  let secretBgm: HTMLAudioElement | null = null;

  /* こもれびの広場BGMの再生の速さ（1 ＝ ふつう）

     ゲーム本編では変えない（いつも 1 のまま）
     ミニゲーム「どこまで行ける？」（pages/minigame/secret-path.vue）では、
     レベルが上がると、この曲を少しずつ速くして、きびしくなったことを耳でも伝える
     （はやく進んでいるあいだは変えない。理由は data/secretPathEndless.ts の secretPathEndlessBgmTempo）
     曲がまだ作られていないときに決められても、作るときに（getSecretBgm()）この値を使う */
  let secretBgmPlaybackRate = 1;

  /* 曲の速さを変えてよい鳴らしかたか（iPhone・iPad では false）

     iPhone・iPad では、音量バーを効かせるために、mp3 の音を
     Web Audio の「音量つまみ」に通してから鳴らしている（→ utils/elementVolume.ts）
     この通り道では、
     ・「音の高さは変えない」という指定（preservesPitch）が効かず、速くすると曲の高さまで上がってしまう
     ・速さを切りかえたときに音がくずれ、あとから鳴らす効果音（「ぽこっ」など）が
       まとめて鳴ったり、同じ音がくり返し聞こえたりする
     ということが起きる
     そこで、つまみに通しているときは、テンポを上げるのをやめて、いつも 1 のままにする
     （レベルが上がったことは「⏫ スピードアップ！」の知らせと「ピピッ」で分かるので、遊びかたは変わらない） */
  function canChangeBgmTempo() {
    return !usesWebAudioVolume();
  }

  /* 曲の速さを入れる（音の高さは変えない）

     preservesPitch … 速くしても、音の高さは変えない（テンポだけが上がる）
     webkitPreservesPitch … 古い Safari 用の、同じ指定
     速さを入れる直前に、毎回そろえておく（作ったときに入れただけだと、ブラウザによっては戻っていることがある） */
  function applyBgmPlaybackRate(bgm: HTMLAudioElement, rate: number) {
    try {
      const media = bgm as HTMLAudioElement & { webkitPreservesPitch?: boolean };

      media.preservesPitch = true;
      media.webkitPreservesPitch = true;
      bgm.playbackRate = rate;
    } catch {
      // 速さを変えられなくても、曲はそのままの速さで鳴る
    }
  }

  function setSecretBgmPlaybackRate(rate: number) {
    // 速さを変えられない鳴らしかたのときは、いつも ふつうの速さ（1）にしておく
    secretBgmPlaybackRate = canChangeBgmTempo() ? rate : 1;

    if (secretBgm) {
      applyBgmPlaybackRate(secretBgm, secretBgmPlaybackRate);
    }
  }

  /* こもれびの広場BGMを用意して返す（初めて必要になったときだけ作る）

     ※ ほかの4曲と同じく、ここでは soundEnabled を見ない
       OFFにした瞬間に「鳴っている曲を止める」ために必要になるため
  */
  function getSecretBgm() {
    // サーバー側には Audio が無いので、ここで終わり
    if (!import.meta.client) {
      return null;
    }

    try {
      // まだ無いときだけ作る（2回目からは、この行は通らない）
      if (!secretBgm) {
        // public/audio/secret-bgm.mp3 は、URLでは /audio/secret-bgm.mp3 になる
        secretBgm = new Audio('/audio/secret-bgm.mp3');

        // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
        // （秘密の場所で何回も遊んで長くいても、曲が途切れないようにするため）
        secretBgm.loop = true;

        // volume … 音の大きさ（上の secretBgmVolume で決めている）
        setElementVolume(secretBgm, getSoundVolume(secretBgmVolume), getAudioContext);

        /* 再生の速さ（ミニゲーム「どこまで行ける？」だけが変える → setSecretBgmPlaybackRate()） */
        applyBgmPlaybackRate(secretBgm, secretBgmPlaybackRate);
      }

      return secretBgm;
    } catch {
      // BGMが使えない環境でも、ゲームは続けられるようにする
      return null;
    }
  }

  /* こもれびの広場BGMを「最初から」再生する（秘密の場所へ入ったとき用）

     ※ currentTime = 0 で必ず曲の先頭に戻す
       一度出てからまた秘密の場所へ入ったときも、前回の続きではなく
       頭から鳴らしたいため（入るたびに同じ始まりかたにそろえる）
  */
  function playSecretBgm() {
    // サウンドOFFのときは、ここで終わり
    // ※ getSecretBgm() より先に見ることで、OFFのあいだは
    //   mp3の読み込みそのものが起きないようにしている
    if (!soundEnabled.value) {
      return;
    }

    const bgm = getSecretBgm();

    if (!bgm) {
      return;
    }

    try {
      bgm.currentTime = 0; // 曲の先頭へ戻す

      /* 無音から少しずつ大きくしていく

         ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は
           ほかの4曲と共用で問題ない
           5曲が同時に鳴ることはなく、切り替えるときは必ず前の曲を止めており、
           startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
      startBgmFadeIn(bgm, secretBgmVolume);

      cancelElementPause(bgm);
      bgm.play().catch(() => {});
    } catch {
      // BGMが鳴らなくても、ゲームは止めない
    }
  }

  /* こもれびの広場BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
     700 で0.7秒。ここだけ書きかえれば、間の長さを調整できる

     待つ理由は2つ
     ・「秘密の場所へ行く」の決定音「ポン♪」が、曲の鳴りはじめにかき消されないため
     ・公園BGMが止まったあと、いったん静かな時間を作るため
       この「しん」とする一瞬があることで、
       「いつもの公園から、特別な場所へ入った」という感じが出る
     （公園BGM・タイトルBGMと同じ 700ms にそろえてある） */
  const secretBgmStartDelay = 700;

  /* 「あとで鳴らす」の予約票（ほかの曲のものと同じ仕組み）

     null は「予約していない」という意味
     setTimeout() は予約すると番号を返してくれるので、それを取っておく
     （あとで「やっぱり鳴らさない」と取り消すのに必要）
  */
  let secretBgmTimer: ReturnType<typeof setTimeout> | null = null;

  /* こもれびの広場BGMを「少し待ってから」最初から鳴らす

     ※ 待たせるのは「音を鳴らすこと」だけ
       秘密の場所の画面は、いつもどおりすぐ表示される
  */
  function playSecretBgmSoon() {
    // 前の予約が残っていたら取り消す（二重に鳴らさないため）
    cancelSecretBgmStart();

    // サーバー側では音を鳴らさないので、予約もしない
    if (!import.meta.client) {
      return;
    }

    secretBgmTimer = setTimeout(() => {
      secretBgmTimer = null;

      /* 待っている0.7秒のあいだに画面が変わっていたら、もう鳴らさない
         （秘密の場所を出た、いやいやになった、GAME OVERになった、
           ゴールした、「もう一度あそぶ」でタイトルへ戻った、などの場合）

         まだ秘密の場所にいるときだけ鳴らす、という確かめかたにしてあるので、
         行き先がどこであっても「あとから鳴りだす」ことがない */
      if (currentEvent.value !== 'secretSpot') {
        return;
      }

      playSecretBgm();
    }, secretBgmStartDelay);
  }

  /* 「あとで鳴らす」の予約を取り消す */
  function cancelSecretBgmStart() {
    if (secretBgmTimer === null) {
      return;
    }

    clearTimeout(secretBgmTimer);
    secretBgmTimer = null;
  }

  /* こもれびの広場BGMを「続きから」再生する（サウンドをONに戻したとき用）

     playSecretBgm() とのちがいは currentTime を 0 に戻さないこと
     OFFにしたところから、そのまま続きを鳴らす

     ※ サウンドOFFのまま秘密の場所へ入って、そこでONに戻したときは、
       まだ曲を一度も作っていない（secretBgm が null）
       その場合は getSecretBgm() が新しく作り、先頭から鳴りはじめる
  */
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

  /* こもれびの広場BGMを一時停止する（どこまで再生したかは覚えたまま）
     サウンドをOFFにしたときと、ページを離れるときに使う

     ※ currentTime（どこまで鳴らしたか）はリセットしない
       サウンドをONに戻したとき、止めた位置から続けられるようにするため
  */
  function pauseSecretBgm() {
    // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
    // （こうしないと、次に再開したとき小さい音のままになる）
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

  /* こもれびの広場BGMを完全に止める（次はまた最初から鳴るようにする）

     秘密の場所から出るとき・いやいや発生・GAME OVER・ゴール・
     「もう一度あそぶ」で使う
  */
  function stopSecretBgm() {
    /* 「あとで鳴らす」の予約も取り消す

       ※ かならず下の「まだ作っていないなら終わり」より前に置くこと
         秘密の場所へ入った直後（＝まだ0.7秒待っている最中）に
         すぐ出る・いやいやになる・GAME OVERになることがあり、
         そのときは予約だけして、まだ曲を作っていない状態になっている
         あとに置くと、取り消せずに別の画面で鳴りだしてしまう */
    cancelSecretBgmStart();

    // フェードインの途中で止めることもあるので、音量も戻しておく
    cancelBgmFade();

    if (!secretBgm) {
      return;
    }

    try {
      pauseElement(secretBgm, { rewind: true }); // 次に入ったときは、また曲の先頭から

      /* 速さも ふつう（1）へ戻す

         ミニゲームで速くしたまま止めると、次に鳴らしはじめたときに
         いきなり速い曲から始まってしまう
         （鳴らしていないあいだに速さを切りかえると音がくずれることがあるので、
           鳴っていない いま のうちに戻しておく） */
      secretBgmPlaybackRate = 1;
      applyBgmPlaybackRate(secretBgm, 1);
    } catch {
      // 何もしない
    }
  }

  /* ============================================================
     音量（スライダー）を、実際の音へ反映する

     ここにあるのは3つ
     ・applySoundVolume()  … いま作ってあるBGMの volume を、いまの設定へそろえる
     ・saveSoundVolume()   … 次に開いたときのために localStorage へ残す
     ・changeSoundVolume() … スライダーを動かしたときに呼ばれる（上の2つをまとめて行う）
     ============================================================ */

  /* いま作ってある（＝一度でも鳴らした）BGMの音量を、いまの設定へそろえる

     ■ get〜Bgm() を呼ばないのが大事
       呼ぶと、まだ一度も鳴らしていない曲まで new Audio() で作られてしまい、
       音量を変えただけなのに mp3 の読み込みが始まってしまう
       ここでは「もう作ってある曲」だけを、そのまま直す

     ■ pause() も play() も currentTime も、さわらない
       volume だけを変えるので、鳴っている曲は
       止まったり、頭から鳴りなおしたりせず、そのまま大きさだけが変わる

     ■ フェードインの最中の曲だけは、ここでは変えない
       フェードの係（startBgmFadeIn）が 0.05秒ごとに
       いまの設定で計算しなおしているので、そちらにまかせる
       （ここで一気に入れてしまうと、フェードの途中で音が飛んでしまう）
  */
  function applySoundVolume() {
    /* 曲と「曲ごとの音量」の組み合わせ
       新しいBGMを足したときは、ここにも1行足す */
    const bgmList: [HTMLAudioElement | null, number][] = [
      [parkBgm, parkBgmVolume],
      [parkBgm2, parkBgm2Volume],
      [titleBgm, titleBgmVolume],
      [tantrumBgm, tantrumBgmVolume],
      [resultBgm, resultBgmVolume],
      [gameOverBgm, gameOverBgmVolume],
      [secretBgm, secretBgmVolume],
    ];

    for (const [bgm, baseVolume] of bgmList) {
      // まだ作っていない曲（null）と、フェードインの最中の曲は、ここでは何もしない
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

  /* 音量を、次に開いたときのために保存しておく */
  function saveSoundVolume() {
    // サーバー側には localStorage が無いので、ここで終わり
    if (!import.meta.client) {
      return;
    }

    try {
      localStorage.setItem(soundVolumeStorageKey, String(soundVolumePercent.value));
    } catch {
      // ブラウザの設定で保存できないことがある
      // 保存できなくても、このページを開いているあいだの音量は正常に動く
    }
  }

  /* 音量のスライダーを動かしたとき

     input type="range" の value は文字で届くので、Number() で数字に直す
     つまみを持って動かしているあいだ（@input）ずっと呼ばれるので、
     動かしている途中から、鳴っている音の大きさが変わっていく

     ■ 0% ＝ ミュートなので、スピーカーの状態もここでそろえる
       ・0%まで下げた     … ミュートにする（アイコンが 🔊× になり、BGMも止まる）
       ・0%から上げた     … ミュートを解除する（いまの画面に合うBGMが鳴りなおす）
       どちらも、ミュートボタンを押したときとまったく同じあと始末をする
       （→ applySoundEnabledChange）

     ※ ここでは toggleSound() は呼ばない
       toggleSound() はスライダーの位置まで動かしてしまうので、
       せっかく動かした値（30%など）が、覚えていた値で上書きされてしまうため
  */
  function changeSoundVolume(event: Event) {
    const slider = event.target as HTMLInputElement;
    const percent = Number(slider.value);

    if (!Number.isFinite(percent)) {
      return;
    }

    soundVolumePercent.value = Math.min(100, Math.max(0, Math.round(percent)));

    // 0%より大きいときは、次にミュートを解除したときの戻り先として覚えておく
    if (soundVolumePercent.value > 0) {
      volumeBeforeMute = soundVolumePercent.value;
    }

    /* 0%かどうかで、サウンドのON/OFFが変わるかを見る
       変わるときだけ、BGMの止める・鳴らしなおすところまで行う
       （動かすたびに毎回やると、鳴っている曲が何度も鳴りなおしてしまう） */
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

  /* ============================================================
     ページを開いたときの、音の設定の読みこみ

     pages/index.vue の onMounted の中にあった処理を、そのまま移してある
     呼ぶ場所も順番も変えていない（あちらの onMounted から、同じ位置で呼んでいる）

     ※ localStorage はブラウザにしか無いので、必ず onMounted から呼ぶこと
     ※ ここではBGMを鳴らさない（理由は、いちばん下のコメントを参照）
     ============================================================ */
  /* さわるたびに作業台を起こす受付を、やめるための関数（受付していないときは null）
     （iPhone でBGMが無音にならないようにするため。くわしくは utils/elementVolume.ts） */
  let stopWakingAudioContext: (() => void) | null = null;

  function restoreSoundSettings() {
    /* さわるたびに作業台（AudioContext）を起こす受付を始める
       この関数は onMounted から1回だけ呼ばれるので、ここで始めて、cleanupAudio() でやめる */
    stopWakingAudioContext?.();
    stopWakingAudioContext = keepAudioContextAwake(getAudioContext);

    /* 前回のサウンドの設定を思い出す

       localStorage には文字しか入らないので、'true' / 'false' という
       「文字」で戻ってくる。保存したことが無いときは null になる
       null のときは、最初に決めた true（＝ON）のままにする
    */
    try {
      const savedSoundSetting = localStorage.getItem(soundStorageKey);

      if (savedSoundSetting === 'false') {
        soundEnabled.value = false;
      } else if (savedSoundSetting === 'true') {
        soundEnabled.value = true;
      }
    } catch {
      // 読み込めなくても、初期値のONで普通に遊べる
    }

    /* 前回の音量を思い出す

       localStorage には文字しか入らないので、'70' のような「文字」で戻ってくる
       保存したことが無いときは null になる

       ※ null をそのまま Number() に入れると 0 になってしまうので、
         先に「保存されているか」を見てから数字に直している
       ※ 数字にならない・0未満・100より大きい、のときは
         最初に決めた100%（そのままの大きさ）のままにする
    */
    try {
      const savedSoundVolume = localStorage.getItem(soundVolumeStorageKey);

      if (savedSoundVolume !== null) {
        const percent = Number(savedSoundVolume);

        if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
          soundVolumePercent.value = Math.round(percent);
        }
      }
    } catch {
      // 読み込めなくても、初期値の100%で普通に遊べる
    }

    /* サウンドのON/OFFと音量を、ここでそろえておく（0% ＝ ミュート）

       この2つは別々に保存しているので、
       前に遊んだときの保存がかみ合っていないことがある
       （たとえば「ミュートだが音量は70%」というメモが残っている、など）
       そのままにすると、アイコンは 🔊× なのにスライダーは70%、
       という食いちがった見た目になってしまうので、開いたときに1回そろえる

       ※ ここではBGMを鳴らしたり止めたりしない
         ページを開いた直後は、まだどのBGMも鳴っていないため
    */
    if (!soundEnabled.value) {
      // ミュートで始まるとき … 音量も0%にそろえ、解除したときの戻り先を覚えておく
      if (soundVolumePercent.value > 0) {
        volumeBeforeMute = soundVolumePercent.value;
      }

      soundVolumePercent.value = 0;
    } else if (soundVolumePercent.value === 0) {
      // 0%で始まるとき … 音が出ないので、スピーカーもミュートにそろえる
      soundEnabled.value = false;
    } else {
      // ふつうに音が出る状態 … いまの大きさを、そのまま戻り先にしておく
      volumeBeforeMute = soundVolumePercent.value;
    }
  }

  /* ============================================================
     ページから離れるときの、音の後片づけ

     pages/index.vue の onUnmounted の中にあった音の処理を、そのまま移してある
     止める順番も、取り消す予約の数も変えていない
     （あちらの onUnmounted から、同じ位置で1回だけ呼んでいる）

     ※ このファイルの中で onUnmounted を登録していないのは、
       pages/index.vue 側の後片づけ（いやいやの予約・秘密の小道の停止）と
       前後の順番がずれないようにするため
     ============================================================ */
  /* ページを離れてから、作業台を閉じるまでの待ち時間（ミリ秒）
     曲の音量を下げ終わって止まる（約0.08秒）より、少し長くしてある */
  const audioContextCloseDelay = 200;

  function cleanupAudio() {
    // さわるたびに作業台を起こす受付をやめる（→ restoreSoundSettings()）
    stopWakingAudioContext?.();
    stopWakingAudioContext = null;

    // 別のページへ移ったあともBGMが鳴り続けないように、ぜんぶの曲を止めておく
    // （pauseParkBgm() は、公園BGM1・BGM2の両方をまとめて止めてくれる）
    pauseTitleBgm();
    pauseParkBgm();
    pauseSecretBgm();
    pauseTantrumBgm();
    pauseResultBgm();
    pauseGameOverBgm();

    // 「あとで鳴らす」の予約と、フェードインの途中経過も止める
    // 残っていると、ページを離れたあとも動きつづけてしまう
    // （GAME OVER BGMの0.7秒の予約が残っていると、別のページで鳴りだしてしまう）
    // （cancelFileSound() は、救急車・犬・噴水の0.45秒の予約のぶん）
    cancelTitleBgmStart();
    cancelParkBgmStart();
    cancelSecretBgmStart();
    cancelResultBgmStart();
    cancelGameOverBgmStart();
    cancelFileSound();
    cancelBgmFade();

    /* 効果音の作業台（AudioContext）も閉じる

       ページを移るたびに useAudio() は作りなおされ、そのたびに新しい作業台ができる
       閉じずに離れると、前のページの作業台がそのまま残り、
       ミニゲームの一覧 ⇄ ミニゲーム を行き来するほど、動いたままの作業台が増えていく
       増えすぎると、iPhone では新しく作れなくなって音が出なくなったり、
       音の流れがくずれて、効果音がまとめて鳴ったり途切れたりする

       この作業台につないでいるのは、このページで作った音だけなので、閉じても ほかのページに影響しない
       （また必要になったときは getAudioContext() が作りなおす）

       ※ 閉じるのは、少し待ってから
         iPhone では、上で止めた曲は「音量を0まで下げてから止まる」（→ utils/elementVolume.ts の pauseElement()）
         下げ終わる前に閉じると、そこで音がとぎれて「ぶつっ」と雑音が出てしまう */
    const closingContext = audioContext;

    if (closingContext && closingContext.state !== 'closed') {
      setTimeout(() => {
        if (closingContext.state !== 'closed') {
          closingContext.close().catch(() => {});
        }
      }, audioContextCloseDelay);
    }

    audioContext = null;
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
    playBoostSound, // ミニゲーム「どこまで行ける？」だけが使う（はやく進みはじめたときの「ヒュッ」）
    playSuddenEventSound,

    /* ===== 公園のBGM ===== */
    playParkBgmSoon,
    stopParkBgm,
    switchParkBgmForCurrentTime,

    /* 10:30を過ぎたか（公園入口の文章の出しわけにも使う → parkEntranceText） */
    shouldUseParkBgm2,

    /* ===== タイトル画面のBGM ===== */
    playTitleBgmSoon,
    cancelTitleBgmStart,
    stopTitleBgm,
    resumeTitleBgm, // ミニゲームの一覧で、ページを開いたときに鳴らせなかった曲を、はじめて さわったときに鳴らす

    /* ===== いやいやタイムのBGM ===== */
    playTantrumBgm,
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
    resumeSecretBgm, // ミニゲーム「どこまで行ける？」で、ページを開いたときに鳴らせなかった曲を「はじめる」で鳴らす
    setSecretBgmPlaybackRate, // ミニゲーム「どこまで行ける？」だけが使う（レベルが上がると曲を速くする）

    /* ===== ページを開いたとき・離れるとき ===== */
    restoreSoundSettings,
    cleanupAudio,
  };
}
