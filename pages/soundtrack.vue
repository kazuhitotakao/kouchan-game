<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, type Ref } from 'vue';

/* ============================================================
   サウンドトラックページ（/soundtrack）

   ゲームの中で流れる6曲を、ゆっくり聴くためのページ

   ゲーム本編（pages/index.vue）のBGMとは、わざと作りを分けてある
   ・本編 … 場面に合わせて自動で切り替わる。曲はloopする
   ・ここ … プレイヤーが「▶ 再生」を押した曲だけが鳴る
            ふだんはloopしないが、「🔁 リピート」を押したときだけくりかえす

   そのため、本編のBGMの関数（playParkBgm など）はいっさい使わない
   このページの中だけで完結する、シンプルな作りにしている
   ============================================================ */

const gameTitle: string = 'こうちゃんの大冒険';

/* 1曲ぶんの情報のかたち

   id          … 曲番号（01〜06の表示にも使う）
   title       … 曲名
   description … 曲の雰囲気をひとことで説明する文
   src         … 音声ファイルの場所（public/audio/ の中のファイル）
   volume      … 音の大きさ（0＝無音、1＝そのままの大きさ）
*/
type SoundtrackTrack = {
  id: number;
  title: string;
  description: string;
  src: string;
  volume: number;
  credit: string;
};

/* 曲の一覧

   ここに並べた順番が、そのまま画面に出る順番になる
   曲名を変えたいときは、下の title を書きかえるだけでよい
   （画面のほうは v-for でこの配列をそのまま並べているので、直さなくてよい）

   volume の数字が曲ごとにちがうのは、音源そのものの録音の大きさがちがうため
   （ゲーム本編でも、曲ごとに音量をそろえている）
   本編のBGMは「後ろで流れる音」なので小さめだが、
   このページは曲そのものを聴くページなので、全体に大きめにしてある
*/
const tracks: SoundtrackTrack[] = [
  {
    id: 1,
    title: 'こうちゃんの大冒険',
    description: 'はじまりのBGM',
    src: '/audio/title-bgm.mp3',
    volume: 0.55,
    credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  },
  {
    id: 2,
    title: 'こうえんたんけん',
    description: '公園での探検BGM 前半',
    src: '/audio/park-bgm.mp3',
    volume: 0.4,
    credit: '音楽生成：Suno',
  },
  {
    id: 3,
    title: 'ひるまえのぼうけん',
    description: '公園での探検BGM 後半',
    src: '/audio/park-bgm2.mp3',
    volume: 0.4,
    credit: '音楽生成：Suno',
  },
  {
    id: 4,
    title: 'こもれびのひみつきち',
    description: '秘密の場所BGM',
    src: '/audio/secret-bgm.mp3',
    volume: 0.4,
    credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  },
  {
    id: 5,
    title: 'イヤイヤタイム！',
    description: 'イヤイヤタイムBGM',
    src: '/audio/tantrum-bgm.mp3',
    volume: 0.43,
    credit: '音楽生成：Suno',
  },
  {
    id: 6,
    title: 'きょうの大冒険、おしまい！',
    description: 'リザルト画面BGM',
    src: '/audio/result-bgm.mp3',
    volume: 0.43,
    credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  },
];

/* ============================================================
   再生のしくみ

   いちばん大事なルールは「同時に鳴るのは、いつも1曲だけ」

   そのために、曲ごとにAudioを作るのではなく、
   Audioを1つだけ作って、みんなで使いまわす
   曲を変えるときは、この1つのAudioの src（鳴らすファイル）を差しかえる
   こうすれば、2曲が重なって鳴ることが仕組みのうえで起こらない
   ============================================================ */

/* みんなで使いまわす、たった1つのAudio

   ※ ここで new Audio() をしないのが大事
     Nuxtは画面をサーバー側でも組み立てるが、
     サーバーには Audio が無いのでエラーになってしまう
     （実際に必要になったとき、getSoundtrackAudio() の中で作る）
*/
let soundtrackAudio: HTMLAudioElement | null = null;

/* いま何回目の再生指示かを数える番号（「⏭ 次のトラックへ」の連打への備え）

   曲を鳴らすお願い（play）は、お願いしたしゅんかんに終わるわけではない
   そのため、連打してどんどん次の曲へ切りかえると、
   前の曲の play() から「鳴らせませんでした」という知らせが、
   あとから遅れて届くことがある（新しい曲へ切りかえたことで中断されたため）

   その古い知らせで、いま鳴っている新しい曲の表示を
   「停止中」に戻してしまわないよう、指示ごとに番号を付けておき、
   いちばん新しい指示のときだけ表示を戻すようにしている */
let playRequestId = 0;

/* いま選んでいる曲の番号（どれも選んでいないときは null）
   「どの曲を再生しているのか」は、この2つを見れば分かる */
const playingTrackId = ref<number | null>(null);

/* いま音が鳴っているかどうか
   一時停止中は playingTrackId は残したまま、こちらだけ false にする
   （そうすることで「続きから再生」ができる） */
const isPlaying = ref(false);

/* いま曲のどのあたりを鳴らしているか（秒）
   再生バーのつまみの位置と、左側の経過時間の表示に使う */
const currentTime = ref(0);

/* いま選んでいる曲の長さ（秒）
   まだ読み込めていないあいだは 0 になる
   （mp3を読み込んで、はじめて「何秒の曲か」が分かるため） */
const duration = ref(0);

/* ============================================================
   音量のしくみ（このページだけの設定）

   音量には、性質のちがう2つがある

   ① track.volume（曲ごとの基準音量）
      音源そのものの録音の大きさがちがうので、
      曲ごとに「これくらいなら同じ大きさに聞こえる」という数字を決めてある
      （01は0.55、02は0.4 など）
      ここはユーザーにはさわらせない。書きかえない

   ② masterVolume（ページ全体の音量つまみ）
      聴いている人が「ぜんぶ少し小さく」と決められる割合
      1＝100％、0.5＝50％、0＝無音

   実際にAudioへ入れる音量は、この2つのかけ算
      track.volume × masterVolume

   こうすると、全体を小さくしても、
   曲どうしの音量バランス（①）はくずれない
   ============================================================ */

/* ============================================================
   キーボードで操作するための覚えごと

   このページのボタンは、ぜんぶ button・input なので、
   Tabキーで移動して Enter / Space で押す、というブラウザの操作は
   もともとできる

   そこへ足しているのは、つぎの3つだけ
   ① ページを開いたとき「▶ 全曲再生」にフォーカスを当てる
      （→ onMounted）
   ② 曲の一覧を、ゲームのメニューのように矢印キーで動かせる
      ↑↓＝上下の曲へ、←→＝同じ曲の中の操作へ、Home / End＝最初 / 最後の曲へ
      （→ handleTrackListKeydown。見張りは <ol class="st-list"> の1か所だけ）
   ③ 曲の一覧と、その上にある操作ボタンとを ↑↓ で行き来できる
      ふだんは「▶ 全曲再生」（→ handlePlayAllKeydown）、
      全曲再生中は「⏭ 次のトラックへ」「■ 全曲再生を停止」
      （→ handlePlaylistActionsKeydown。この2つは ← → で行き来もできる）
      一覧から上のボタンへ戻る道は findVerticalTarget にある

   ※ document や window では矢印キーを見張らない
     ページのスクロールや、再生バー・音量バーの操作をじゃましないため
   ※ 音量スライダーは、矢印キーの移動先に入れない
     矢印キーでそのまま音量を大小させるものなので、
     移動先にしてしまうと「動かすつもりが移動になる」ため（Tabで移れる）
   ※ 「🔁 リピート」「🔊 サウンド」のボタンも、矢印キーの移動先に入れない
     音量スライダーととなり合わせの「再生の設定」のまとまりなので、
     行き来のしかたをTabキーにそろえている
     （矢印キーは「曲を選んで鳴らす」ための道、と役わりを分けている）
   ============================================================ */

/* 「▶ 全曲再生」と「⏭ 次のトラックへ」を覚えておく箱
   ref="〜" と書いたボタンが、そのままここに入ってくる（出ていないときは null） */
const playAllButtonRef = ref<HTMLButtonElement | null>(null);
const nextTrackButtonRef = ref<HTMLButtonElement | null>(null);

/* 曲の一覧（<ol class="st-list">）そのものを覚えておく箱
   「▶ 全曲再生」から ↑↓ で曲の一覧へ入るときに、行き先のボタンを探すのに使う */
const trackListRef = ref<HTMLElement | null>(null);

/* ↑↓ で曲の一覧へ入るとき、どのボタンから入ったかを覚えておく

   一覧の上には、そのときどきでちがうボタンが出ている
   ・ふだん     … 「▶ 全曲再生」
   ・全曲再生中 … 「⏭ 次のトラックへ」「■ 全曲再生を停止」

   一覧のはしで↑↓を押して戻るときは、出てきたボタンへ帰りたい
   （「■ 全曲再生を停止」から入ったのに「⏭ 次のトラックへ」へ帰ると、
     行きと帰りで場所がずれて、どこにいるのか分からなくなるため）

   ※ 画面に出す数字ではないので、ref ではなくふつうの入れものでよい
   ※ そのボタンが画面から消えていたら、この覚えは使わない（→ findOutsidePlayButton） */
let lastOutsideButton: HTMLElement | null = null;

/* ページ全体の音量（0〜1）。はじめは100％＝今までと同じ音量
   （前に使ったときの音量があれば、下の onMounted で思い出して入れなおす） */
const masterVolume = ref(1);

/* 音量を保存しておく名前（localStorageのキー）

   localStorage は、ブラウザに小さなメモを残しておける保存場所
   ページを閉じても消えないので、次に開いたときも音量を思い出せる
   同じブラウザの他のページと名前がぶつからないよう、ゲーム名を頭に付けている
   （ゲーム本編のサウンドON/OFFとは別のメモなので、名前も別にしてある） */
const masterVolumeStorageKey = 'kouchan-soundtrack-volume';

/* 画面に出す「70%」などの数字（0〜1 を 0〜100 に直したもの） */
const masterVolumePercent = computed(() => Math.round(masterVolume.value * 100));

/* その曲を実際に鳴らす音量を計算する

   Audioへ音量を入れるところは何か所かあるが、
   計算のしかたはこの1か所にまとめてある
   （全曲再生でも、個別再生でも、次のトラックへでも、かならずここを通る） */
function getTrackVolume(track: SoundtrackTrack) {
  return track.volume * masterVolume.value;
}

/* ============================================================
   サウンドON/OFF（このページの音を、まとめて切り替える）

   切り替わるのは、このページで鳴る音のぜんぶ
   ・曲（mp3）
   ・効果音「ポン♪」

   ゲーム本編（pages/index.vue）にも同じ形のボタンがあるが、
   覚えておく場所（localStorageのキー）はわざと別にしてある
   ここは「曲を聴きに来るページ」なので、
   本編をOFFにしている人でも、このページでは音を出して聴けるようにするため
   （音量の設定を本編と別にしてあるのと、同じ考えかた）

   ■ OFFにしたとき
     鳴っている曲を一時停止するだけ
     どこまで聴いたか（currentTime）も、全曲再生の途中かどうかも、そのまま残す
     ※ 音を消したまま曲だけ進める、という作りにはしていない
       それだと、聴いていないうちに曲が終わってしまうため

   ■ ONに戻したとき
     OFFのせいで止めた曲があれば、その続きから鳴らしなおす
     自分で「⏸ 一時停止」しておいた曲は、鳴らさない（止めたのは本人なので）

   ■ OFFのあいだに「▶ 再生」などを押したとき
     「押しても何も起きない」＝こわれたボタンには見せたくないので、
     サウンドをONへ戻してから鳴らす（→ ensureSoundEnabled）

   音量スライダー（masterVolume）とは、役わりがちがう
   ・サウンドON/OFF … 音を出すか、出さないか（ワンタッチで切り替える）
   ・音量           … 出すときの大きさ（0〜100％）
   OFFにしても音量の数字はそのまま残るので、ONに戻せば前と同じ大きさで鳴る
   ============================================================ */

/* いま音を鳴らす設定かどうか（true＝サウンドON。はじめてのときはON）
   （前に使ったときの設定があれば、下の onMounted で思い出して入れなおす） */
const soundEnabled = ref(true);

/* サウンドON/OFFを保存しておく名前（localStorageのキー）

   ・ゲーム本編のサウンド設定（kouchan-game-sound-enabled）
   ・このページの音量（kouchan-soundtrack-volume）
   のどちらともぶつからない名前にしてある */
const soundEnabledStorageKey = 'kouchan-soundtrack-sound-enabled';

/* 「OFFにしたせいで止めた曲」があるかどうか

   ONに戻したときに、続きから鳴らしてよいかを見分けるために使う
   ・OFFで止めた曲       … ONに戻したら続きから鳴らす（勝手に止めたので、勝手に戻す）
   ・自分で一時停止した曲 … ONに戻しても鳴らさない（止めたのは本人なので、そのまま）

   ※ 画面に出す数字ではないので、ref ではなくふつうの入れものでよい */
let pausedBySoundOff = false;

/* いまのON/OFFを覚えておく（次にこのページを開いたときのため）

   localStorage には文字しか入れられないので、
   true / false を 'true' / 'false' という文字にして入れている */
function saveSoundSetting() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(soundEnabledStorageKey, String(soundEnabled.value));
  } catch {
    // ブラウザの設定で保存できないことがある
    // 保存できなくても、このページを開いているあいだのON/OFFは正常に動く
  }
}

/* 「🔊 サウンド ON」「🔇 サウンド OFF」のボタンを押したとき */
function toggleSound() {
  // ① まず切り替える（ONならOFFへ、OFFならONへ）
  soundEnabled.value = !soundEnabled.value;

  if (soundEnabled.value) {
    /* ② ONに戻したとき

       まず「ポン♪」を鳴らす
       止めていた曲が無いときは、これが「音が戻った」ことの唯一の知らせになる
       （効果音は soundEnabled を見ているので、ONにしたあとに呼ぶ） */
    playDecisionSound();

    // OFFのせいで止めた曲があれば、その続きから鳴らしなおす
    if (pausedBySoundOff) {
      resumeAfterSoundOn();
    }
  } else {
    // ③ OFFにしたとき … 鳴っている曲を止める（どこまで聴いたかは残す）
    pauseForSoundOff();
  }

  // ④ 次に開いたときのために保存しておく
  saveSoundSetting();
}

/* OFFにしたときに、鳴っている曲を一時停止する

   画面の表示（選んでいる曲・再生バー・全曲再生の案内）は、いっさい消さない
   消してしまうと、ONに戻したときに続きから鳴らせなくなるため
*/
function pauseForSoundOff() {
  // 前の「OFFで止めた」の覚えは、いったん忘れる
  pausedBySoundOff = false;

  // そもそも鳴っていなければ、止めるものはない
  if (!soundtrackAudio || !isPlaying.value) {
    return;
  }

  try {
    soundtrackAudio.pause();
  } catch {
    // 止められなくても、表示だけはそろえる
  }

  isPlaying.value = false;

  // ONに戻したときに「続きから鳴らしてよい曲」だと分かるようにしておく
  pausedBySoundOff = true;

  /* 「鳴らしてください」のお願い（play）は、お願いしたしゅんかんには終わらない
     ▶ を押した直後にOFFにすると、そのお願いから
     「鳴らせませんでした」という知らせが、あとから遅れて届くことがある

     その古い知らせで、選んでいる曲の表示まで消されてしまわないよう、
     指示の番号を1つ進めて「もう最新ではない」ことにしておく
     （→ playTrackAudio。番号が合わない知らせは、そこで無視される） */
  playRequestId += 1;
}

/* ONに戻したときに、OFFで止めた曲の続きから鳴らす

   ※ 「■ 全曲再生を停止」などで曲の選択そのものが無くなっていたときは、何も鳴らさない
*/
function resumeAfterSoundOn() {
  pausedBySoundOff = false;

  const track = tracks.find((item) => item.id === playingTrackId.value);
  const audio = getSoundtrackAudio();

  if (!audio || !track) {
    return;
  }

  /* OFFのあいだに音量スライダーを動かしていることもあるので、
     鳴らす前に、いまの音量を入れなおしておく */
  try {
    audio.volume = getTrackVolume(track);
  } catch {
    // 何もしない
  }

  // currentTime はさわらない（止めたところから、そのまま続ける）
  playTrackAudio(audio, track);
}

/* 曲を鳴らす前に、サウンドがOFFならONへ戻しておく

   OFFのまま「▶ 再生」を押しても何も起きないと、
   ボタンがこわれているように見えてしまう
   ここを通るのは「曲を鳴らそうとしたとき」＝音を聴きたいときなので、
   サウンドをONへ戻す（画面のボタンも 🔊 ON に変わるので、何が起きたか分かる）

   ※ ここでは曲を鳴らさない。鳴らすのは、呼んだ側（startPlaylist など）
   ※ すでにONのときは、何もしない
*/
function ensureSoundEnabled() {
  if (soundEnabled.value) {
    return;
  }

  soundEnabled.value = true;

  /* このあと呼んだ側が曲を鳴らすので、
     「OFFで止めた曲を続きから」の出番はもう無い（覚えを忘れる） */
  pausedBySoundOff = false;

  saveSoundSetting();
}

/* ============================================================
   リピート（くりかえし再生）

   「🔁 リピート」のボタンを1回押すごとに、3つの状態を順ぐりに回る

     off（なし）→ all（全曲）→ one（1曲）→ off（なし）→ …

   ■ off … 今までどおり
     1曲だけの再生 … 曲が終わったら止まる
     全曲再生       … 6曲を1回ずつ鳴らしたら止まる

   ■ all（全曲リピート）
     全曲再生が1周したら、また曲順の先頭（＝開始曲）へ戻って鳴らし続ける
     （→ playNextPlaylistTrack で、最後の曲のあとを 0 に回りこませている）
     ※ 1曲だけの再生には効かない（押した1曲は、終わったら止まる）

   ■ one（1曲リピート）
     いま鳴らしている曲を、ずっとくりかえす
     ブラウザのAudioがもともと持っている loop を true にするだけでよい
     （自分で「終わったらもう一度鳴らす」を書くより、つなぎ目がなめらか）
     loop が true のあいだは「曲が終わった」の知らせ（ended）が来ないので、
     全曲再生の途中でも、次の曲へは進まなくなる
     ※ 「⏭ 次のトラックへ」を押せば、いつでも次の曲へ進める
       （そちらの曲が、また1曲リピートで鳴りつづける）
   ============================================================ */

/* リピートの3つの状態

   文字そのもの（'off' など）を型にしているので、
   書きまちがえると、その場でエラーとして分かる */
type RepeatMode = 'off' | 'all' | 'one';

/* ボタンを押したときに進む順番
   いちばん後ろまで行ったら、先頭（off）へ戻る */
const repeatOrder: RepeatMode[] = ['off', 'all', 'one'];

/* いまのリピートの設定（はじめは「なし」）
   （前に使ったときの設定があれば、下の onMounted で思い出して入れなおす） */
const repeatMode = ref<RepeatMode>('off');

/* リピートの設定を保存しておく名前（localStorageのキー） */
const repeatStorageKey = 'kouchan-soundtrack-repeat';

/* 読み上げソフト用の説明

   目で見れば「いまOFF」だと分かるが、読み上げでは
   「押すと次はどうなるのか」まで言ったほうが分かりやすいので、両方を入れている */
const repeatButtonLabel = computed(() => {
  if (repeatMode.value === 'all') {
    return 'リピート：全曲。押すと1曲リピートになります';
  }

  if (repeatMode.value === 'one') {
    return 'リピート：1曲。押すとリピートなしになります';
  }

  return 'リピート：なし。押すと全曲リピートになります';
});

/* いまのリピートの設定を、Audioへ入れる

   1曲リピートのときだけ loop を true にする
   ここを通るのは、つぎの2つのとき
   ・「🔁 リピート」を押して設定を変えたとき（鳴らしている途中でもすぐ効く）
   ・曲を鳴らしはじめるとき（→ playTrackAudio）

   audio を省いたときは、いま使いまわしているAudioに入れる
   （鳴らすときは、これから鳴らすAudioをはっきり渡してもらう）
*/
function applyRepeatToAudio(audio: HTMLAudioElement | null = soundtrackAudio) {
  if (!audio) {
    return;
  }

  try {
    audio.loop = repeatMode.value === 'one';
  } catch {
    // 何もしない（次に曲を鳴らすときに、あらためて入れなおされる）
  }
}

/* いまのリピートの設定を覚えておく（次にこのページを開いたときのため） */
function saveRepeatSetting() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(repeatStorageKey, repeatMode.value);
  } catch {
    // ブラウザの設定で保存できないことがある
    // 保存できなくても、このページを開いているあいだのリピートは正常に動く
  }
}

/* 「🔁 リピート」を押したとき

   押すたびに off → all → one → off … と、順ぐりに進む
   （% は「わり算のあまり」。いちばん後ろの次が、先頭（0）に戻る）
*/
function toggleRepeat() {
  /* 決定音「ポン♪」（押しても曲は鳴りはじめないボタンなので、合図を鳴らす）
     トラック番号を押したときと同じ考えかた */
  playDecisionSound();

  const currentIndex = repeatOrder.indexOf(repeatMode.value);

  repeatMode.value = repeatOrder[(currentIndex + 1) % repeatOrder.length];

  /* 鳴らしている途中でも、その場で切りかわるようにする
     （1曲リピートにした瞬間から、その曲はくりかえしになる） */
  applyRepeatToAudio();

  saveRepeatSetting();
}

/* ============================================================
   効果音「ポン♪」（ボタンを押したときの合図）

   ゲーム本編（pages/index.vue）の決定音とまったく同じ音を、
   同じ作りかたで鳴らす
   ・音のファイルは使わず、その場で音を作って鳴らす（AudioContext）
   ・700Hzの丸い音を0.09秒だけ。鋭くならないよう triangle（三角の波）にしている

   鳴らすのは、押しても曲が鳴りはじめない2つのボタンだけ
   ① トラック番号（全曲再生の開始曲を選ぶ）… 押しても音が出ないと、
      選べたのかどうか分かりにくいため
   ② ← はじめの画面へ戻る

   「▶ 再生」「▶ 全曲再生」などでは鳴らさない
   （すぐ曲そのものが鳴りはじめるので、合図の音はかえってじゃまになる）
   ============================================================ */

/* 音を作る作業台

   null は「まだ作っていない」という意味
   作るのが重たいので、1個だけ作って、このページにいるあいだ使い回す
   （ここで new しないのは、サーバー側には AudioContext が無いため） */
let effectAudioContext: AudioContext | null = null;

/* 作業台を用意して返す（初めて必要になったときだけ作る） */
function getEffectAudioContext() {
  if (!import.meta.client) {
    return null;
  }

  try {
    if (!effectAudioContext) {
      effectAudioContext = new AudioContext();
    }

    /* ブラウザは「ユーザーが操作する前」に音を鳴らすのを止めることがあり、
       そのとき作業台は suspended（お休み中）になっている
       resume() で起こすが、await はしない
       ここで待たせると、画面の切り替わりが音のせいで遅れてしまう */
    if (effectAudioContext.state === 'suspended') {
      effectAudioContext.resume().catch(() => {});
    }

    return effectAudioContext;
  } catch {
    // 音が使えない環境でも、ページはふつうに使えるようにする
    return null;
  }
}

/* 効果音「ポン♪」を鳴らす

   大きさは、上の音量スライダー（masterVolume）に合わせる
   曲だけ小さくして効果音がそのまま、ということが起きないようにするため
   0%にしているときは、そもそも鳴らさない */
function playDecisionSound() {
  // サウンドOFFのときは、効果音も鳴らさない（曲と同じスイッチでまとめて切り替える）
  if (!soundEnabled.value) {
    return;
  }

  const volume = 0.06 * masterVolume.value;

  if (volume <= 0) {
    return;
  }

  const context = getEffectAudioContext();

  if (!context) {
    return;
  }

  try {
    const startTime = context.currentTime;
    const duration = 0.09;

    const oscillator = context.createOscillator(); // 音の発生源
    const gain = context.createGain(); // 音量つまみ

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(700, startTime);

    /* 音量の動き（これが無いと、鳴りはじめと鳴り終わりに「ブツッ」と雑音が入る）
       ① ほぼ無音からはじめる
       ② 0.015秒かけて、すっと目的の音量まで上げる
       ③ そのあと、鳴り終わりに向かってゆっくり下げる

       ※ 下げる先を 0 ではなく 0.001 にしているのは、
         exponentialRampToValueAtTime() が 0 を受け取れないため */
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    // 発生源 → 音量つまみ → スピーカー の順につなぐ
    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  } catch {
    // 効果音が鳴らなくても、曲の再生には影響させない
  }
}

/* ============================================================
   全曲再生（6曲を1周ぶん、続けて鳴らす）のしくみ

   ・selectedStartTrackId … どの曲から1周を始めるか（トラック番号を押して選ぶ）
   ・isPlaylistPlaying    … いま全曲再生の途中かどうか
   ・playlistTracks       … 今回の1周ぶんの曲順（開始曲から並べ替えたもの）
   ・playlistIndex        … その曲順の何曲目を鳴らしているか（0はじまり）

   曲順は開始曲から後ろへ進み、最後まで行ったら先頭へ回り込む
   （例：03開始 → 03 04 05 06 01 02）
   6曲を1回ずつ鳴らし終えたら止まる
   （「🔁 リピート 全曲」のときだけ、また開始曲へ戻ってくりかえす）

   次の曲へ進むのは、つぎの2つのとき（どちらも同じ関数を使う）
   ・曲が最後まで流れきったとき
   ・「⏭ 次のトラックへ」を押して、いまの曲を飛ばしたとき
   → playNextPlaylistTrack() を見ること
   ============================================================ */

/* 全曲再生の開始曲（はじめは1曲目。トラック番号を押すと変わる） */
const selectedStartTrackId = ref<number>(tracks[0].id);

/* いま全曲再生の途中かどうか */
const isPlaylistPlaying = ref(false);

/* 今回の1周ぶんの曲順（開始曲から並べ替えたもの） */
const playlistTracks = ref<SoundtrackTrack[]>([]);

/* その曲順の何曲目か（0はじまり） */
const playlistIndex = ref(0);

/* 選んでいる開始曲の曲名（全曲再生の案内に出す） */
const selectedStartTrackTitle = computed(() => {
  const found = tracks.find((track) => track.id === selectedStartTrackId.value);

  return found ? found.title : '';
});

/* いま全曲再生で鳴らしている曲（案内の「N / 6　01 タイトル」に使う） */
const currentPlaylistTrack = computed(() => playlistTracks.value[playlistIndex.value] ?? null);

/* 制作情報（ⓘ）の吹き出しについての、2つの覚えごと

   ① openedCreditTrackId
      「クリック（タップ）して開いたままにしている」トラック
      null … 開いたままにしているものは無い
      4    … 04の吹き出しを開いたままにしている
      同時に2つ開かないよう、1つぶんしか覚えない

   ② suppressedCreditHoverTrackId
      「いま閉じたばかりなので、マウスを乗せていても出さない」トラック

      同じⓘをもう一度クリックして閉じたとき、
      マウスはまだⓘの上に乗ったままなので、
      そのままだとCSSのhoverで、すぐにまた出てきてしまう
      そこで「このトラックは出さない」と覚えておき、
      ⓘからマウスが離れたとき（または ⓘ からフォーカスが外れたとき）に忘れる

   ※ マウスを乗せただけ（hover）の一時的な表示はCSSにまかせる
     ここで覚えるのは「クリックで開いたまま」と「閉じたばかり」の2つだけ */
const openedCreditTrackId = ref<number | null>(null);
const suppressedCreditHoverTrackId = ref<number | null>(null);

/* 曲が何秒目まで進んだかを、ブラウザから教えてもらう
   再生中は1秒に4回くらい呼ばれる */
function handleTimeUpdate() {
  if (!soundtrackAudio) {
    return;
  }

  currentTime.value = soundtrackAudio.currentTime;
}

/* 曲の長さが分かったときに呼ばれる

   duration は、読み込みが終わるまで NaN（数字ではない）になっていることがある
   そのまま入れると再生バーが動かなくなるので、数字のときだけ入れる
*/
function handleLoadedMetadata() {
  if (!soundtrackAudio) {
    return;
  }

  const length = soundtrackAudio.duration;

  duration.value = Number.isFinite(length) ? length : 0;
}

/* 曲が最後まで流れきったときに呼ばれる

   ・全曲再生の途中なら、次の曲へ進む（最後まで来たら止まる）
     → 「⏭ 次のトラックへ」を押したときと同じ playNextPlaylistTrack() を使う
   ・そうでなければ（1曲だけの再生なら）、そこで停止する

   ※ 「🔁 リピート 1曲」のときは、ここへは来ない
     Audioの loop が true になっていて、曲が「終わらない」ため
*/
function handleTrackEnded() {
  /* 「曲が終わった」と「別の曲のボタンを押した」がほぼ同時に起きたとき、
     こちらの知らせだけが少し遅れて届くことがある
     そのまま進めると、新しい曲は鳴っているのに
     画面だけ「停止中」に見えてしまうので、
     ほんとうに最後まで流れきったときだけ先へ進む
     （ended … 曲が終わりまで進んでいるかどうか） */
  if (soundtrackAudio && !soundtrackAudio.ended) {
    return;
  }

  /* 全曲再生の途中なら、次の曲へ

     ボタンで飛ばしたときと、まったく同じ関数を呼んでいる
     （「次の曲へ進む」書きかたを2か所に分けて持たないようにするため） */
  if (isPlaylistPlaying.value) {
    playNextPlaylistTrack();

    return;
  }

  // 1曲だけの再生のときは、そこで停止
  playingTrackId.value = null;
  isPlaying.value = false;
}

/* 使いまわすAudioを用意して返す（初めて必要になったときだけ作る） */
function getSoundtrackAudio() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!soundtrackAudio) {
      soundtrackAudio = new Audio();

      /* loop … ゲーム本編のBGMは、いつも true（くり返す）にしてあるが、
         このページは「1曲を最初から最後まで聴く」ページなので、ふだんは false
         「🔁 リピート 1曲」を選んでいるときだけ true になる

         鳴らすたび・設定を変えるたびに入れなおしているので（→ applyRepeatToAudio）、
         ここでの指定は「作ったばかりのAudioの、最初の状態」を決めているだけ

         ※ ここでさわっているのは、このページで作ったAudioだけ
           ゲーム本編のBGMの設定には、いっさいさわっていない */
      soundtrackAudio.loop = repeatMode.value === 'one';

      // 曲が最後まで流れたら教えてもらう
      soundtrackAudio.addEventListener('ended', handleTrackEnded);

      // 再生バーを動かすために、進み具合と曲の長さも教えてもらう
      soundtrackAudio.addEventListener('timeupdate', handleTimeUpdate);
      soundtrackAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
    }

    return soundtrackAudio;
  } catch {
    // 音が使えない環境でも、ページは普通に開けるようにする
    return null;
  }
}

/* 曲を鳴らしはじめる（再生できなかったときは、表示を停止中へ戻す） */
function playTrackAudio(audio: HTMLAudioElement, track: SoundtrackTrack) {
  /* いまのリピートの設定を入れておく
     （どこから鳴らしはじめても、かならずここを通る） */
  applyRepeatToAudio(audio);

  // この再生指示の番号を取っておく（あとで「まだ最新の指示か」を見分けるため）
  playRequestId += 1;

  const requestId = playRequestId;

  playingTrackId.value = track.id;
  isPlaying.value = true;

  try {
    audio.play().catch(() => {
      /* 再生できなかったとき（対応していない形式など）は、表示を元に戻す

         ただし、待っているあいだに別の曲へ切りかわっていたら、
         そちらの表示は消さない（だから、最新の指示のときだけ戻している） */
      if (requestId === playRequestId) {
        playingTrackId.value = null;
        isPlaying.value = false;
      }
    });
  } catch {
    if (requestId === playRequestId) {
      playingTrackId.value = null;
      isPlaying.value = false;
    }
  }
}

/* 鳴っている曲を完全に止める（次はまた最初から鳴るようにする）

   音を止めるだけでなく、「再生中」の表示や再生バーも止まった状態に戻す
   使うのは、このページを見たまま止めるとき
   ・「■ 全曲再生を停止」を押したとき
   ・このページから離れて、画面が消えたあとの後片付け（onUnmounted）

   ※ ページを移る「直前」には使わない
     表示が先に消えてしまい、画面がバタバタして見えるため
     そのときは下の stopAudioForNavigation()（音だけ止める）を使う */
function stopSoundtrack() {
  if (soundtrackAudio) {
    try {
      soundtrackAudio.pause();
      soundtrackAudio.currentTime = 0; // 曲の先頭へ戻す
    } catch {
      // 止められなくても、表示だけはそろえる
    }
  }

  playingTrackId.value = null;
  isPlaying.value = false;

  // 全曲再生の途中だったときも、ここで終わりにする
  isPlaylistPlaying.value = false;

  // 再生バーも先頭へ戻しておく
  currentTime.value = 0;

  /* 「■ 全曲再生を停止」で消えたボタンの代わりに、「▶ 全曲再生」へフォーカスを移す
     ※ ページから離れるときの後片付け（onUnmounted）でもここを通るが、
       そのときボタンはもう無い（ref は null）ので、何も起きないだけ */
  focusAfterPlaylistChange(playAllButtonRef);
}

/* ページを離れる直前に「音だけ」止める

   上の stopSoundtrack() との違いは、画面の表示にさわるかどうか

   ・stopSoundtrack()        … 音を止めて、画面の表示も止まった状態に戻す
                               （「■ 全曲再生を停止」を押したときなど、
                                 このページを見たまま止めるとき用）
   ・stopAudioForNavigation() … 音を止めるだけ。表示はいっさいさわらない
                               （タイトル画面へ移るときなど、
                                 このあと画面ごと消えるとき用）

   移る直前に表示まで止めた状態に戻してしまうと、
   画面が消えるまでのほんの一瞬に
   「全曲再生中の案内が消える → 再生バーが消える → ボタンの並びが変わる」
   と見えてしまい、バタバタ閉じたように感じられる
   そこで、ここでは音だけを止めて、見た目はそのままにしておく

   ※ すでに止まっている音にもう一度 pause() を呼んでも、何も起きないだけで安全
     （このあと onUnmounted() の stopSoundtrack() でもう一度止まるが問題ない）
*/
function stopAudioForNavigation() {
  if (!soundtrackAudio) {
    return;
  }

  try {
    soundtrackAudio.pause();
    soundtrackAudio.currentTime = 0; // 曲の先頭へ戻す
  } catch {
    // 止められなくても、このあとページごと消えるので何もしない
  }
}

/* トラック番号を押したときに、その曲を「全曲再生の開始曲」にする

   ここでは曲は鳴らさない（開始曲を選ぶだけ）
   実際に鳴らすのは「▶ 全曲再生」を押したとき
*/
function selectStartTrack(track: SoundtrackTrack) {
  // 決定音「ポン♪」（押して選べたことが分かるように）
  playDecisionSound();

  selectedStartTrackId.value = track.id;
}

/* ⓘ（制作情報）の吹き出しを開け閉めする

   クリック・タップ・Enter・Space のどれで押しても、ここを通る

   ・同じⓘをもう一度押したら閉じる
     このとき「閉じたばかり」を覚えて、
     マウスが乗ったままでも、すぐ出てこないようにする
   ・別のⓘを押したら、前のを閉じて新しいほうを開く
     （覚えているのは1つだけなので、2つ同時に開くことはない）

   再生や開始トラックの選択には、いっさい影響しない（表示だけ）
*/
function toggleCredit(trackId: number) {
  // すでに開いているⓘを押した → 閉じる
  if (openedCreditTrackId.value === trackId) {
    openedCreditTrackId.value = null;
    suppressedCreditHoverTrackId.value = trackId;

    return;
  }

  // それ以外（閉じている／別の曲のⓘ）→ そのⓘだけを開く
  openedCreditTrackId.value = trackId;
  suppressedCreditHoverTrackId.value = null;
}

/* 「閉じたばかりなので出さない」の覚えごとを忘れる

   呼ばれるのは、つぎの2つのとき（どちらも「ⓘから離れた」という意味）
   ・ⓘ（と吹き出し）から、マウス・指が離れたとき（pointerleave）
   ・ⓘから、フォーカスが外れたとき（blur）
     キーボードだけで操作している人はマウスを離さないので、こちらも見ている

   これで、もう一度マウスを乗せたりTabで戻ってくれば、ふつうに表示へ戻る
*/
function releaseCreditHoverSuppression(trackId: number) {
  if (suppressedCreditHoverTrackId.value === trackId) {
    suppressedCreditHoverTrackId.value = null;
  }
}

/* ⓘ・吹き出し以外の場所が押されたとき、開いたままの吹き出しを閉じる

   pointerdown は、マウスのクリックも指のタップも、まとめて受け取れる
   （click と touchstart を別々に書かなくてよい）

   ここでは「閉じる」だけを行い、preventDefault も stopPropagation もしない
   そのため、押した先が「▶ 再生」や「▶ 全曲再生」なら、
   吹き出しが閉じたうえで、そのボタン本来の処理もふつうに動く
*/
function handleOutsideCreditPointerDown(event: PointerEvent) {
  const target = event.target;

  // ⓘ や吹き出しの中を押したときは、ここでは何もしない
  // （開け閉めは、ⓘ の @click（toggleCredit）にまかせる）
  if (target instanceof Element && target.closest('.track__info')) {
    return;
  }

  openedCreditTrackId.value = null;
  suppressedCreditHoverTrackId.value = null;
}

/* 「▶ 全曲再生」を押したとき

   開始曲から1周ぶんの曲順を作り、その先頭から鳴らしはじめる
   例）03開始 → [03, 04, 05, 06] ＋ [01, 02] → 03 04 05 06 01 02
*/
function startPlaylist() {
  /* サウンドOFFのときに押されたら、ONへ戻してから鳴らす
     （押しても何も起きないボタンにしないため。→ ensureSoundEnabled） */
  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    return;
  }

  // 開始曲の位置を探す（見つからなければ先頭から）
  const startIndex = tracks.findIndex((track) => track.id === selectedStartTrackId.value);
  const begin = startIndex >= 0 ? startIndex : 0;

  /* 開始曲から最後まで ＋ 先頭から開始曲の直前まで をつなげて、1周ぶんの曲順にする */
  playlistTracks.value = [...tracks.slice(begin), ...tracks.slice(0, begin)];
  playlistIndex.value = 0;
  isPlaylistPlaying.value = true;

  const firstTrack = playlistTracks.value[playlistIndex.value];

  // いまの再生をいったん止めて、再生バーもリセットする
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // 何もしない
  }

  currentTime.value = 0;
  duration.value = 0;

  // 1周の1曲目を設定する
  try {
    audio.src = firstTrack.src;
    audio.volume = getTrackVolume(firstTrack);
    audio.currentTime = 0;
  } catch {
    // 何もしない
  }

  playTrackAudio(audio, firstTrack);

  /* 「▶ 全曲再生」はここで画面から消えるので、
     入れかわりに出てくる「⏭ 次のトラックへ」へフォーカスを移しておく */
  focusAfterPlaylistChange(nextTrackButtonRef);
}

/* 全曲再生を終わりにする

   ここへ来るのは、つぎの2つのとき
   ・1周ぶん（6曲）を鳴らし終えたとき
   ・最後の曲で「⏭ 次のトラックへ」を押したとき

   鳴っている曲を止めて、全曲再生のための覚えごとをまっさらに戻す
   playlistTracks も空にするので、
   次にもう一度「▶ 全曲再生」を押したときは、曲順をあらためて作りなおす
   （開始曲の選択（selectedStartTrackId）は変えないので、そのまま残る）
*/
function finishPlaylist() {
  if (soundtrackAudio) {
    try {
      soundtrackAudio.pause();
      soundtrackAudio.currentTime = 0; // 曲の先頭へ戻す
    } catch {
      // 止められなくても、表示だけはそろえる
    }
  }

  playingTrackId.value = null;
  isPlaying.value = false;
  isPlaylistPlaying.value = false;
  playlistTracks.value = [];
  playlistIndex.value = 0;

  // 再生バーの表示も、まっさらに戻す
  currentTime.value = 0;
  duration.value = 0;

  // 「⏭ 次のトラックへ」などが消えて「▶ 全曲再生」に戻るので、そちらへフォーカスを移す
  focusAfterPlaylistChange(playAllButtonRef);
}

/* 全曲再生中に、次の曲へ進む

   この関数は2つの場面から呼ばれる（次の曲へ進む中身は、ここ1か所だけ）
   ① 曲が最後まで流れきったとき      … handleTrackEnded() から
   ② 「⏭ 次のトラックへ」を押したとき … 画面のボタンから

   どちらの場合も、やることは同じ
   「playlistIndex を1つだけ進めて、その曲を先頭から鳴らす」

   ※ playlistTracks（今回の曲順）は作りなおさない
     「▶ 全曲再生」を押したときに作った曲順を、最後までそのまま使う

   1周ぶんを鳴らし終えたあとは、リピートの設定で行き先が変わる
   ・🔁 リピート 全曲 … 曲順の先頭（＝開始曲）へ戻って、もう1周する
   ・それ以外         … そこで全曲再生を終わりにする
*/
function playNextPlaylistTrack() {
  /* 全曲再生中でなければ、何もしない
     （1曲だけの再生のときは、曲が終わっても次へは進まない） */
  if (!isPlaylistPlaying.value) {
    return;
  }

  // いま鳴らしているのが、1周ぶんの最後の曲かどうか
  const isLastTrack = playlistIndex.value >= playlistTracks.value.length - 1;

  /* 最後の曲まで来たとき、全曲リピートでなければ、ここで終わり
     （「⏭ 次のトラックへ」で最後の曲を飛ばしたときも、同じように終わる） */
  if (isLastTrack && repeatMode.value !== 'all') {
    finishPlaylist();

    return;
  }

  /* 行き先の曲（曲順の中の番号）
     ふだんは1つ進める
     最後の曲だったときは、全曲リピート中なので先頭（0）へ回りこむ */
  const nextIndex = isLastTrack ? 0 : playlistIndex.value + 1;

  /* サウンドOFFのときに「⏭ 次のトラックへ」を押されたら、ONへ戻してから鳴らす
     （曲が最後まで流れてここへ来たときは、もうONなので何も起きない） */
  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    // 音が使えなくなったら、全曲再生も終わりにする
    finishPlaylist();

    return;
  }

  /* 先に「何曲目か」を1つ進める
     こうしておくと、「2 / 6」の表示のまま音だけ次の曲になる、ということが起きない
     曲名やトラック番号の表示も、この番号を見ているので一緒に切りかわる */
  playlistIndex.value = nextIndex;

  const nextTrack = playlistTracks.value[nextIndex];

  /* 次の曲を先頭から鳴らすので、再生バーの表示もいったん最初の状態に戻す

     曲の長さ（duration）は、新しいmp3を読み込むまで分からない
     前の曲の長さが残っているとバーの目盛りがずれるので 0 に戻し、
     handleLoadedMetadata() が新しい長さを入れなおすのを待つ */
  currentTime.value = 0;
  duration.value = 0;

  /* いまの曲を完全に止める（＝その場で終了）

     currentTime を 0 に戻すので、どこまで聴いたかは覚えない
     あとでその曲へ戻ってきても「続きから」ではなく、先頭から鳴る */
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // 何もしない
  }

  /* 鳴らすファイルを次の曲へ差しかえる

     Audioは1つだけを使いまわしているので、
     「止める → 差しかえる → 鳴らす」の順番を守れば、
     2曲が同時に鳴ることは仕組みのうえで起こらない（連打しても同じ） */
  try {
    audio.src = nextTrack.src;
    audio.volume = getTrackVolume(nextTrack);
    audio.currentTime = 0; // 次の曲も先頭から
  } catch {
    // 何もしない
  }

  // 次の曲を鳴らす（一時停止中に押したときも、ここで自動的に鳴りはじめる）
  playTrackAudio(audio, nextTrack);
}

/* 「▶ 再生」「⏸ 一時停止」を押したときの処理

   押した曲によって、やることが2とおりある

   ① いま選んでいるのと同じ曲を押したとき
      ・再生中     → 一時停止（どこまで聴いたかは覚えたまま）
      ・一時停止中 → 続きから再生
      このときは、全曲再生モードのままにしておく
      （全曲再生中に一時停止しても「⏭ 次のトラックへ」が使えるようにするため）

   ② ちがう曲を押したとき
      いまの曲を完全に止めてから、新しい曲を先頭から鳴らす
      （2曲が重ならないように、かならずこの順番で行う）
      このときは全曲再生モードから抜けて、1曲だけの再生としてあつかう
*/
function toggleTrack(track: SoundtrackTrack) {
  /* サウンドOFFのときに押されたら、ONへ戻してから鳴らす

     ※ 「⏸ 一時停止」のつもりで押されることはない
       OFFのあいだは曲が止まっているので、ボタンは「▶ 続きから」になっている */
  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    return;
  }

  // ① 同じ曲を押したとき（一時停止 / 続きから）
  if (playingTrackId.value === track.id) {
    if (isPlaying.value) {
      // 再生中 → 一時停止
      try {
        audio.pause();
      } catch {
        // 何もしない
      }

      isPlaying.value = false;
    } else {
      // 一時停止中 → 続きから再生（currentTime はさわらない）
      playTrackAudio(audio, track);
    }

    return;
  }

  // ② ちがう曲を押したとき

  /* ちがう曲の「▶ 再生」を押したら、全曲再生モードからは抜ける
     （ここからは1曲だけの再生として扱うので、曲が終わっても次へは進まない） */
  isPlaylistPlaying.value = false;

  // まず、いまの曲を完全に止める
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // 何もしない
  }

  /* 再生バーの表示も、いったん最初の状態に戻す

     曲の長さ（duration）は、新しいmp3を読み込むまで分からない
     前の曲の長さが残っていると、バーの目盛りがずれてしまうので 0 に戻し、
     handleLoadedMetadata() が新しい長さを入れなおすのを待つ */
  currentTime.value = 0;
  duration.value = 0;

  // 新しい曲を設定する
  try {
    audio.src = track.src;
    audio.volume = getTrackVolume(track);
    audio.currentTime = 0; // 新しい曲を先頭から鳴らす
  } catch {
    // 何もしない
  }

  // 新しい曲を鳴らす
  playTrackAudio(audio, track);
}

/* 再生バーを動かして、聴く場所を変える（シーク）

   input type="range" の value は文字で届くので、Number() で数字に直す
   バーを動かしているあいだ（@input）ずっと呼ばれるので、
   つまみを持ったまま動かすと、その場所へすぐ飛ぶ

   ※ 一時停止中に動かしたときは、鳴らしはじめずに場所だけ変える
*/
function seekTrack(event: Event) {
  const bar = event.target as HTMLInputElement;
  const seconds = Number(bar.value);

  if (!soundtrackAudio || !Number.isFinite(seconds)) {
    return;
  }

  try {
    soundtrackAudio.currentTime = seconds;
  } catch {
    // 何もしない
  }

  // 画面の表示も、待たずにその場で合わせる
  currentTime.value = seconds;
}

/* 音量スライダーを動かして、全体の音量を変える

   スライダーは 0〜100 で動かし、Audioは 0〜1 で受け取るので、100で割る

   大事なのは「鳴っている曲はそのまま」ということ
   ここでは volume の数字を入れかえるだけで、
   pause も play も src の差しかえもしない
   だから、再生中に動かしても、曲は止まらず、最初へも戻らず、
   その場で音の大きさだけが変わる

   一時停止中でも playingTrackId は残っているので、ここで音量を入れておける
   （そのあと「▶ 続きから」を押すと、変えたあとの音量で鳴る） */
function changeMasterVolume(event: Event) {
  const slider = event.target as HTMLInputElement;
  const percent = Number(slider.value);

  if (!Number.isFinite(percent)) {
    return;
  }

  masterVolume.value = percent / 100;

  // いま選んでいる曲（再生中・一時停止中）があれば、その場で音量だけ変える
  const playingTrack = tracks.find((track) => track.id === playingTrackId.value);

  if (soundtrackAudio && playingTrack) {
    try {
      soundtrackAudio.volume = getTrackVolume(playingTrack);
    } catch {
      // 何もしない（次に曲を鳴らすときに、あらためて設定される）
    }
  }

  /* 次に開いたときのために、いまの音量を覚えておく

     localStorage には文字しか入れられないので、
     「70」のようなパーセントの数字を、文字にして入れている */
  try {
    localStorage.setItem(masterVolumeStorageKey, String(masterVolumePercent.value));
  } catch {
    // ブラウザの設定で保存できないことがある
    // 保存できなくても、このページを開いているあいだの音量調整は正常に動く
  }
}

/* 再生バーの「聴き終わったところ」の割合（0〜100）

   Chrome・Safari では、バーの左半分だけ色を変える機能が無いので、
   この割合をCSSへ渡して、下地のグラデーションで塗り分けている
*/
function seekPercent() {
  if (duration.value <= 0) {
    return 0;
  }

  return (currentTime.value / duration.value) * 100;
}

/* 秒数を「3:45」のような時間の表示に直す

   例）125秒 → 2:05
   秒は1けたのときに 0 を足して、いつも2けたにする（2:5 ではなく 2:05）
*/
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const whole = Math.floor(seconds);
  const minutePart = Math.floor(whole / 60);
  const secondPart = whole % 60;

  return minutePart + ':' + String(secondPart).padStart(2, '0');
}

/* この曲がいま鳴っているか（ボタンの表示を切り替えるのに使う） */
function isTrackPlaying(track: SoundtrackTrack) {
  return playingTrackId.value === track.id && isPlaying.value;
}

/* 読み上げソフト用の説明文
   「▶」「⏸」の記号だけでは何のボタンか分からないので、曲名を入れて伝える */
function trackButtonLabel(track: SoundtrackTrack) {
  return isTrackPlaying(track) ? `${track.title}を一時停止` : `${track.title}を再生`;
}

/* 曲番号を「01」「02」のように2けたで表示する */
function formatTrackNumber(id: number) {
  return String(id).padStart(2, '0');
}

/* ============================================================
   曲の一覧のキーボード操作（ゲームのメニューのように動かす）

   曲のカードには3種類のボタンが並んでいる
     ・トラック番号（開始曲を選ぶ）… track__no
     ・ⓘ（制作情報）              … track__infoBtn
     ・▶ 再生                     … track__button

   つまり「3列 × 曲数」のマス目だと思うと分かりやすい

     [ 01 ] [ ⓘ ] [ ▶ 再生 ]
     [ 02 ] [ ⓘ ] [ ▶ 再生 ]
     [ 03 ] [ ⓘ ] [ ▶ 再生 ]
       …

   受け取るキーは、つぎの4しゅるい

   ↑ ↓        同じ列のまま、1つ上・1つ下の曲へ
               （例：03の「▶ 再生」で↓ → 04の「▶ 再生」）
               はしまで来たら、反対のはしへ回りこむ
               ※「▶ 再生」の列だけは「▶ 全曲再生」も輪に入れる
                 （→ findVerticalTarget）
   ← →        同じ曲の中で、番号 ↔ ▶ 再生 を行き来する
               ⓘ（制作情報）は ← → の行き先には入れない
               （→ findHorizontalTarget）
   Home / End  同じ列のまま、最初の曲 / 最後の曲へ
               （→ findEdgeTarget）
   Escape      開いている制作情報の吹き出しを閉じる（それだけ）

   Enter / Space はここでは受け取らない
   button・input なので、押したときの動きはブラウザにまかせればよい
   （ここから .click() を呼ぶと、同じ処理が二重に動いてしまう）

   ※ 再生バー（つまみ）の上では、矢印キーも Home / End も横取りしない
     「← → で再生位置を動かす」「Home で曲の先頭」といった、
     ブラウザ本来の操作をそのまま残すため
     （音量スライダーはこの一覧の外にあるので、そもそもここへは来ない）
   ※ 曲の3種類のボタン以外を選んでいるときも、何もしない
     そのときの ↑↓ は、いままでどおりページのスクロールになる
   ※ 見張りは <ol class="st-list"> の1か所だけでよい
     押されたキーは、ボタンからこの ol まで伝わってくるので、
     ボタン1つずつに @keydown を付けて回る必要はない
   ============================================================ */

/* 曲のカードにある3種類のボタン（↑↓ は、この3つそれぞれの列を上下する） */
const trackButtonClasses = ['track__no', 'track__infoBtn', 'track__button'];

/* ← → で行き来するボタン（ⓘ は入れない。理由は findHorizontalTarget に書いてある） */
const trackRowMoveClasses = trackButtonClasses.filter((name) => name !== 'track__infoBtn');

/* 曲の一覧で受け取るキー（これ以外は、ブラウザにまかせる） */
const trackListMoveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

function handleTrackListKeydown(event: KeyboardEvent) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  /* Escape … 開いている制作情報を閉じるだけ

     再生を止めたり、タイトルへ戻ったりはしない
     押しまちがいで曲が止まってしまうと、こまるため
     開いていないときは、何もしない */
  if (event.key === 'Escape') {
    if (openedCreditTrackId.value !== null) {
      openedCreditTrackId.value = null;
    }

    return;
  }

  if (!trackListMoveKeys.includes(event.key)) {
    return;
  }

  // 再生バーの上では、ブラウザにまかせる（再生位置を動かす操作）
  if (target.closest('input[type="range"]')) {
    return;
  }

  // いま押されているのが、3種類のうちどのボタンかを調べる
  const buttonClass = trackButtonClasses.find((name) => target.classList.contains(name));

  if (!buttonClass) {
    return;
  }

  // 曲のカードをぜんぶ取り出して、いまいるカードが何番目かを調べる
  const list = event.currentTarget as HTMLElement;
  const cards = Array.from(list.querySelectorAll<HTMLElement>('.track'));
  const currentIndex = cards.findIndex((card) => card.contains(target));

  if (currentIndex < 0) {
    return;
  }

  // つぎに選ぶボタンを決める（行き先の計算は、下の3つの関数に分けてある）
  let nextButton: HTMLElement | null = null;

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    nextButton = findHorizontalTarget(event.key, cards[currentIndex], buttonClass);
  } else if (event.key === 'Home' || event.key === 'End') {
    nextButton = findEdgeTarget(event.key, cards, buttonClass);
  } else {
    nextButton = findVerticalTarget(event.key, cards, currentIndex, buttonClass);
  }

  if (!nextButton) {
    return;
  }

  /* キーボードでⓘから離れるときは、開いている吹き出しも閉じる
     フォーカスだけ動いて、吹き出しだけが取り残されないようにするため
     （マウスで押して開いたものは、いままでどおり。外側を押せば閉じる） */
  if (buttonClass === 'track__infoBtn') {
    openedCreditTrackId.value = null;
  }

  /* 曲の移動を優先するので、ページがスクロールしないようにする
     ※ 行き先が画面の外にあるときは、focus() にともなう
       ブラウザふつうのスクロールにまかせる（大げさな演出は足さない） */
  event.preventDefault();
  nextButton.focus();
}

/* ← → の行き先 … 同じ曲の中で、となりの操作へ（はしまで行ったら回りこむ）

   ここで行き来するのは trackRowMoveClasses（番号 ↔ ▶ 再生）だけで、
   ⓘ（制作情報）へは ← → では移らない
   ⓘは「聴く」操作ではなく説明を見るためのものなので、
   曲を選んで鳴らすまでの道すじからは外してある
   （ⓘへは Tab と ↑↓ で行ける）

   例）03の番号で → を押す → 03の「▶ 再生」
       03の「▶ 再生」で → を押す → 03の番号（うしろから、先頭へ回りこむ）

   ※ ⓘを選んでいるときだけは、行き止まりにならないよう外へ出られるようにする
     → なら右どなりの「▶ 再生」、← なら左どなりの番号へ
   ※ 2 という数を直接書かず、trackRowMoveClasses.length を使う
     あとからボタンの種類が増えても、ここを直さなくてよい
   ※ 引き算がマイナスになっても大じょうぶなように、
     length を足してから「あまり（%）」を出している
*/
function findHorizontalTarget(key: string, card: HTMLElement, buttonClass: string) {
  const step = key === 'ArrowRight' ? 1 : -1;

  // ⓘからは、画面の並びどおり（← 番号  ⓘ  ▶ 再生 →）に外へ出る
  if (buttonClass === 'track__infoBtn') {
    const exitClass = step === 1 ? 'track__button' : 'track__no';

    return card.querySelector<HTMLElement>('.' + exitClass);
  }

  const columnIndex = trackRowMoveClasses.indexOf(buttonClass);
  const nextIndex = (columnIndex + step + trackRowMoveClasses.length) % trackRowMoveClasses.length;

  return card.querySelector<HTMLElement>('.' + trackRowMoveClasses[nextIndex]);
}

/* Home / End の行き先 … 同じ列のまま、最初の曲 / 最後の曲へ

   例）04の「▶ 再生」で Home → 01の「▶ 再生」
       02のⓘで End → 最後の曲のⓘ

   ※ ここには「▶ 全曲再生」を入れない
     「Home なら01、End なら最後の曲」と、行き先をはっきりさせるため
*/
function findEdgeTarget(key: string, cards: HTMLElement[], buttonClass: string) {
  const card = key === 'Home' ? cards[0] : cards[cards.length - 1];

  return card.querySelector<HTMLElement>('.' + buttonClass);
}

/* ↑ ↓ の行き先 … 同じ列のまま、1つ上・1つ下の曲へ（はしまで来たら回りこむ）

   「▶ 再生」の列（track__button）だけは、
   一覧のはしから出たときに「一覧の上にある操作ボタン」へ移る
   その操作ボタンは、そのときの画面によって入れかわる（→ findOutsidePlayButton）

   ふだん（止まっているとき）

     ▶ 全曲再生 → 01 ▶ 再生 → 02 ▶ 再生 → … → 最後の曲 ▶ 再生 → ▶ 全曲再生

   全曲再生中（「▶ 全曲再生」は消えている）

     ⏭ 次のトラックへ → 01 ▶ 再生 → 02 ▶ 再生 → … → 最後の曲 ▶ 再生 → ⏭ 次のトラックへ

   帰り先は「出てきたボタン」なので、
   「■ 全曲再生を停止」から↓で入ったときは、↑で「■ 全曲再生を停止」へ帰る

   いちばん使う「聴く」ための列なので、
   上の操作ボタンから↓を押すだけで、すぐ曲を選べるようにしている
   （行きは handlePlayAllKeydown / handlePlaylistActionsKeydown、
     帰りはここ。これで、どちらの向きにもぐるっと回れる）

   番号とⓘの列には、上の操作ボタンを入れていない
   その2つは役わりがちがう（開始曲を選ぶ・説明を見る）ので、
   曲の一覧の中だけでぐるぐる回るほうが、迷わず使えるため

   ※ 上の操作ボタンが1つも画面に無いときは、無理に移さず、
     いままでどおり一覧の中で回りこむ
   ※ 曲数は数えずに cards.length を使うので、
     あとから曲が増えても、そのまま動く
*/
function findVerticalTarget(key: string, cards: HTMLElement[], currentIndex: number, buttonClass: string) {
  const step = key === 'ArrowDown' ? 1 : -1;
  const nextIndex = currentIndex + step;
  const isOutOfList = nextIndex < 0 || nextIndex >= cards.length;

  if (buttonClass === 'track__button' && isOutOfList) {
    const outsideButton = findOutsidePlayButton();

    if (outsideButton) {
      return outsideButton;
    }
  }

  const nextCard = cards[(nextIndex + cards.length) % cards.length];

  return nextCard.querySelector<HTMLElement>('.' + buttonClass);
}

/* 曲の一覧の「上にある操作ボタン」をさがす（↑↓で一覧から戻るときの行き先）

   ① 直前に一覧へ入ったときのボタンが、まだ画面にあるなら、そこへ帰る
      「■ 全曲再生を停止」から入ったなら「■ 全曲再生を停止」へ、
      「⏭ 次のトラックへ」から入ったなら「⏭ 次のトラックへ」へ
      （isConnected … その要素が、まだ画面（DOM）にあるかどうか）

   ② 覚えが無いとき（Tabで一覧に来たときなど）や、
      覚えていたボタンがもう消えているときは、いま出ているボタンへ
      ・ふだん      … 「▶ 全曲再生」
      ・全曲再生中  … 「⏭ 次のトラックへ」（「▶ 全曲再生」は消えている）
      ・どちらも無い（切りかわりの一瞬など）… null

   ※ null のときに無理にフォーカスを当てないよう、呼ぶ側で確かめている
*/
function findOutsidePlayButton() {
  if (lastOutsideButton) {
    if (lastOutsideButton.isConnected) {
      return lastOutsideButton;
    }

    // 画面から消えたボタン（停止して消えた、など）は、もう覚えておかない
    lastOutsideButton = null;
  }

  return playAllButtonRef.value ?? nextTrackButtonRef.value;
}

/* 曲の一覧のいちばん上・いちばん下の「▶ 再生」をさがす

   ↓ なら01の「▶ 再生」、↑ なら最後の曲の「▶ 再生」
   一覧の外にあるボタン（下の2つの関数）から、一覧へ入るときに使う

   ※ 曲数は数えずに、いま画面にある「▶ 再生」を数えて先頭・最後を選ぶので、
     あとから曲が増えても、そのまま動く
*/
function findListPlayButton(key: string) {
  const list = trackListRef.value;

  if (!list) {
    return null;
  }

  const playButtons = Array.from(list.querySelectorAll<HTMLElement>('.track__button'));

  if (playButtons.length === 0) {
    return null;
  }

  return key === 'ArrowDown' ? playButtons[0] : playButtons[playButtons.length - 1];
}

/* 「▶ 全曲再生」のキーボード操作（このボタンだけ、曲の一覧の外にある）

   ・↓ … 01の「▶ 再生」へ
   ・↑ … 最後の曲の「▶ 再生」へ

   上の findVerticalTarget といっしょになって、
   「▶ 全曲再生 → 01 → 02 → … → 最後の曲 → ▶ 全曲再生」という輪になる

   ※ ここでするのは、この行き来だけ
     Enter / Space で全曲再生が始まるのも、Tabでの移動も、ブラウザ本来の動きのまま
*/
function handlePlayAllKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return;
  }

  const nextButton = findListPlayButton(event.key);

  if (!nextButton) {
    return;
  }

  // どのボタンから一覧へ入ったかを覚えておく（↑↓で戻るときの行き先になる）
  lastOutsideButton = playAllButtonRef.value;

  // 曲の移動を優先するので、ページがスクロールしないようにする
  event.preventDefault();
  nextButton.focus();
}

/* 全曲再生中に出る2つのボタンのキーボード操作

     [ ⏭ 次のトラックへ ]  [ ■ 全曲再生を停止 ]

   ・← → … このならびの中で、となりのボタンへ（2つだけなので行ったり来たり）
   ・↑ ↓ … 曲の一覧へ入る（↓で01の「▶ 再生」、↑で最後の曲の「▶ 再生」）
            一覧のはしから↑↓を押すと、出てきたほうのボタンへ戻ってくる
            （「■ 全曲再生を停止」から入れば「■ 全曲再生を停止」へ帰る）
            （帰りの道は findVerticalTarget と findOutsidePlayButton にある）

   「▶ 全曲再生」を押すと、そのボタンはこの2つに入れかわる
   入れかわったあとも、矢印キーだけで操作を続けられるようにしている

   ※ この下にある音量スライダーへは、矢印キーでは移らない
     音量は矢印キーでそのまま大小を変えるものなので、
     キーボードの移動先に入れてしまうと、動かすつもりが移動になってしまう
     音量へ行きたいときは Tab で移る（いままでどおり）
   ※ 見張りは、2つのボタンを囲む1か所（.st-playall__actions）だけ
   ※ Enter / Space は受け取らない（button本来の動きのまま）
*/
function handlePlaylistActionsKeydown(event: KeyboardEvent) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const row = event.currentTarget as HTMLElement;
  const buttons = Array.from(row.querySelectorAll<HTMLElement>('.st-playall__button'));
  const currentIndex = buttons.findIndex((button) => button.contains(target));

  if (currentIndex < 0) {
    return;
  }

  let nextButton: HTMLElement | null = null;

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const step = event.key === 'ArrowRight' ? 1 : -1;

    nextButton = buttons[(currentIndex + step + buttons.length) % buttons.length];
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    nextButton = findListPlayButton(event.key);
  } else {
    return;
  }

  if (!nextButton) {
    return;
  }

  /* 一覧へ入るときだけ、どのボタンから入ったかを覚えておく
     （← → でとなりのボタンへ移っただけのときは、覚え直さない） */
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    lastOutsideButton = buttons[currentIndex];
  }

  // ボタンの移動を優先するので、ページがスクロールしないようにする
  event.preventDefault();
  nextButton.focus();
}

/* 全曲再生のボタンが入れかわったあと、続きをキーボードで操作できるようにする

   「▶ 全曲再生」を押すと、そのボタンは画面から消えて
   「⏭ 次のトラックへ」「■ 全曲再生を停止」に入れかわる
   ボタンが消えると、フォーカスはどこにも無い状態（body）になってしまい、
   キーボードだけで操作している人は、またTabで探しに行くことになる
   そこで、入れかわったあとのボタンへフォーカスを移しておく

   ※ どこにもフォーカスが無いときだけ移す
     ユーザーがすでに別のボタンを選んでいるなら、そのじゃまをしない
     （曲が最後まで流れて自然に終わったときなどは、こちらが勝手に奪わない） */
async function focusAfterPlaylistChange(button: Ref<HTMLButtonElement | null>) {
  // ボタンが入れかわるのを待ってから、フォーカスを当てる
  await nextTick();

  if (document.activeElement && document.activeElement !== document.body) {
    return;
  }

  button.value?.focus();
}

/* 「← はじめの画面へ戻る」

   ここでやるのは2つだけ

   ① 鳴っている曲を止める（音だけ）
      移動したあとに、サントラの曲だけが鳴り続けないようにするため
   ② タイトル画面へ移る

   ※ ここでは stopSoundtrack() を呼ばないのが大事
     呼ぶと「再生中」や再生バーの表示まで先に消えてしまい、
     画面が切りかわるまでの一瞬、レイアウトがバタバタ動いて見える
     表示の後片付けは、画面が消えたあとの onUnmounted() にまかせる

   ※ ブラウザの「戻る」ボタンで出ていった場合はここを通らないが、
     そのときも onUnmounted() が同じように止めてくれる
*/
async function goToTitle() {
  /* 決定音「ポン♪」（ゲーム本編のボタンと同じ音）

     曲を止めるより先に鳴らす
     ※ 効果音は曲とは別のしくみ（AudioContext）で鳴らしているので、
       このあと曲を止めても、効果音は最後まで鳴りきる */
  playDecisionSound();

  stopAudioForNavigation();

  await navigateTo('/');
}

/* ページが表示されたときの準備

   ⓘ・吹き出し以外が押されたら、開いたままの吹き出しを閉じたいので、
   ページ全体（document）で「押された」を見張ってもらう
   ※ onMounted はブラウザでだけ動くので、document を安心して使える
*/
onMounted(() => {
  document.addEventListener('pointerdown', handleOutsideCreditPointerDown);

  /* このページでいちばん使う「▶ 全曲再生」にフォーカスを当てておく
     キーボードだけでも、開いてすぐ Enter で全曲再生を始められる */
  playAllButtonRef.value?.focus();

  /* 前に使ったときのリピートの設定を思い出す

     知っている3つの文字（off / all / one）のときだけ入れなおす
     保存したことが無いとき（null）も、こわれたメモが入っていたときも、
     初期値の「リピートなし」のままにする */
  try {
    const savedRepeat = localStorage.getItem(repeatStorageKey);

    if (savedRepeat === 'off' || savedRepeat === 'all' || savedRepeat === 'one') {
      repeatMode.value = savedRepeat;
    }
  } catch {
    // 読み込めなくても、初期値の「リピートなし」でふつうに聴ける
  }

  /* 前に使ったときのサウンドON/OFFを思い出す

     localStorage には文字しか入らないので、'true' / 'false' の文字で戻ってくる
     保存したことが無いときは null になるので、そのまま初期値のON（true）で始める
     （こわれたメモが入っていたときも、ONのままにする） */
  try {
    const savedSound = localStorage.getItem(soundEnabledStorageKey);

    if (savedSound === 'false') {
      soundEnabled.value = false;
    } else if (savedSound === 'true') {
      soundEnabled.value = true;
    }
  } catch {
    // 読み込めなくても、初期値のONでふつうに聴ける
  }

  /* 前に使ったときの音量を思い出す

     ・保存したことが無いときは null になるので、そのまま100％で始める
     ・数字でないものが入っていたときも、100％のままにする（こわれたメモ対策）
     ・0〜100 からはみ出していたら、その範囲へおさめる */
  try {
    const savedVolume = localStorage.getItem(masterVolumeStorageKey);
    const savedPercent = Number(savedVolume);

    if (savedVolume !== null && Number.isFinite(savedPercent)) {
      const percent = Math.min(100, Math.max(0, Math.round(savedPercent)));

      masterVolume.value = percent / 100;
    }
  } catch {
    // 読み込めなくても、初期値の100％でふつうに聴ける
  }
});

/* このページから離れるときの後始末

   ・「← はじめの画面へ戻る」を押したとき
   ・ブラウザの戻るボタンで出ていったとき
   のどちらでも、かならずここを通る

   曲を止めて、使いまわしていたAudioも手放しておく

   ※ ここが呼ばれるのは、画面がもう消えたあと
     だから stopSoundtrack() で「再生中」や再生バーの表示を止まった状態に戻しても、
     その変化は誰にも見えない（＝バタバタした動きにならない）

   ※ ブラウザの戻るボタンのときは goToTitle() を通らないので、
     音を確実に止められるのはここだけ
     「戻る」ボタンからのときは goToTitle() ですでに止まっているが、
     止まっている音をもう一度止めても何も起きないだけなので、そのままで安全
*/
onUnmounted(() => {
  // ページ全体の見張りをやめる（付けっぱなしにしない）
  document.removeEventListener('pointerdown', handleOutsideCreditPointerDown);

  stopSoundtrack();

  if (soundtrackAudio) {
    // 「教えて」とお願いしていた受付を、ぜんぶやめる
    soundtrackAudio.removeEventListener('ended', handleTrackEnded);
    soundtrackAudio.removeEventListener('timeupdate', handleTimeUpdate);
    soundtrackAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }

  soundtrackAudio = null;
});
</script>

<template>
  <main class="soundtrack">
    <!-- ============================================================
         ページの見出し
         ============================================================ -->
    <header class="st-head">
      <p class="st-head__badge">ORIGINAL SOUNDTRACK</p>

      <h1 class="st-head__name">{{ gameTitle }}</h1>
    </header>

    <!-- ============================================================
         全曲再生

         「▶ 全曲再生」を押すと、開始曲から6曲を続けて鳴らす
         開始曲は、下の一覧でトラック番号を押して選ぶ
         最後まで行くと先頭へ回り込み、6曲を1回ずつ鳴らして止まる
         （「🔁 リピート 全曲」のときは、止まらずにもう1周する）

         全曲再生中だけ、下に2つのボタンが出る
         ・⏭ 次のトラックへ  … いまの曲を飛ばして、次の曲を先頭から鳴らす
         ・■ 全曲再生を停止  … 全曲再生をやめる
         ============================================================ -->
    <section class="st-playall">
      <div class="st-playall__row">
        <p class="st-playall__start">
          開始曲：
          <strong>{{ formatTrackNumber(selectedStartTrackId) }}</strong>
          {{ selectedStartTrackTitle }}
        </p>

        <!-- ref … ページを開いたときと、全曲再生を止めたときに
             このボタンへフォーカスを当てるための目印

             @keydown … ↓で01の「▶ 再生」へ、↑で最後の曲の「▶ 再生」へ移る
             このボタンだけ曲の一覧の外にあるので、ここにも見張りを付けている
             （くわしくは handlePlayAllKeydown） -->
        <button
          v-if="!isPlaylistPlaying"
          ref="playAllButtonRef"
          type="button"
          class="st-playall__button"
          @click="startPlaylist"
          @keydown="handlePlayAllKeydown">
          ▶ 全曲再生
        </button>
      </div>

      <!-- どの曲から始めるかの案内（全曲再生中は下の状態表示に切り替える） -->
      <p v-if="!isPlaylistPlaying" class="st-playall__hint">下の一覧で番号を押すと、始める曲を選べます</p>

      <!-- ここから下は、全曲再生中だけ出す（1曲だけの再生中は出さない） -->
      <template v-else>
        <!-- いま曲順の何曲目か＋実際のトラック番号と曲名 -->
        <p v-if="currentPlaylistTrack" class="st-playall__status" aria-live="polite">
          <span class="st-playall__badge">♪ 全曲再生中</span>
          <span class="st-playall__count">{{ playlistIndex + 1 }} / {{ playlistTracks.length }}</span>
          <span class="st-playall__track">{{ formatTrackNumber(currentPlaylistTrack.id) }} {{ currentPlaylistTrack.title }}</span>
        </p>

        <!-- 全曲再生中の操作

             よく押す「⏭ 次のトラックへ」を先（PCでは左、スマホでは上）に置き、
             幅も広くとって押しやすくしている
             一時停止中でも押せて、そのときは次の曲が自動的に鳴りはじめる -->
        <!-- @keydown … ← → で「⏭ 次のトラックへ」と「■ 全曲再生を停止」を行き来する
             ↑↓ を押したときは、曲の一覧の「▶ 再生」へ移る
             （下の音量スライダーへは、矢印キーでは移らない）
             くわしくは handlePlaylistActionsKeydown -->
        <div class="st-playall__actions" @keydown="handlePlaylistActionsKeydown">
          <button
            ref="nextTrackButtonRef"
            type="button"
            class="st-playall__button st-playall__button--next"
            aria-label="現在の曲を飛ばして次のトラックを再生する"
            @click="playNextPlaylistTrack">
            ⏭ 次のトラックへ
          </button>

          <button type="button" class="st-playall__button st-playall__button--stop" @click="stopSoundtrack">■ 全曲再生を停止</button>
        </div>
      </template>

      <!-- 再生の設定（リピート ＋ サウンドON/OFF ＋ 音量）

           「どの曲を・どこから鳴らすか」を決めるこの箱の中に、
           「どんなふうに鳴らすか」もまとめて置いてある

           ・リピート … 鳴らし終えたあと、くりかえすかどうか
           ・サウンド … 音を出すか、出さないか（ワンタッチの切り替え）
           ・音量     … 出すときの大きさ（0〜100％）

           曲カードの中にある再生バーとは役わりがちがうので、
           見まちがえないように「音量」の文字と、
           いまの大きさ（％）をかならずそえておく
           ・再生バー … 曲の「どこ」を鳴らすか（時間）
           ・音量バー … 「どのくらいの大きさ」で鳴らすか

           ※ 🔊 の絵文字は、左のサウンドボタンだけに付けている
             音量のほうにも付けると、OFF（🔇）のとなりに 🔊 が並んでしまい、
             いまONなのかOFFなのかが分かりにくくなるため -->
      <div class="st-settings">
        <!-- 🔁 リピート（押すたびに OFF → 全曲 → 1曲 → OFF と回る）

             リピートには3つの状態があるので、サウンドのような
             aria-pressed（押されている／いない）では言い表せない
             そこで、いまの状態は data-repeat でCSSへ渡して見た目を変え、
             読み上げソフトには aria-label で
             「いまの状態」と「押すとどうなるか」を伝えている -->
        <button
          type="button"
          class="st-repeat"
          :data-repeat="repeatMode"
          :aria-label="repeatButtonLabel"
          @click="toggleRepeat">
          <span class="st-repeat__icon">🔁</span>
          <span class="st-repeat__text">リピート</span>
          <!-- 3つとも置いておき、いまの1つだけをCSSで見せる（押しても幅が変わらない） -->
          <span class="st-repeat__state">
            <span class="st-repeat__stateText st-repeat__stateText--off">OFF</span>
            <span class="st-repeat__stateText st-repeat__stateText--all">全曲</span>
            <span class="st-repeat__stateText st-repeat__stateText--one">1曲</span>
          </span>
        </button>

        <!-- ゲーム本編（pages/index.vue）のサウンドボタンと同じ形にしてある

             aria-pressed … 読み上げソフトへ「いま押されている（＝ON）」を伝える
                            見た目（色・🔊/🔇）も、この値をもとにCSSで切り替えている
             ON と OFF の文字は同じ場所に重ねて置き、使わないほうを見えなくする
             （ボタンの幅がいつも同じになるので、押してもとなりの音量がずれない） -->
        <button
          type="button"
          class="st-soundToggle"
          :aria-pressed="soundEnabled"
          :aria-label="soundEnabled ? 'サウンドをオフにする' : 'サウンドをオンにする'"
          @click="toggleSound">
          <span class="st-soundToggle__icon">{{ soundEnabled ? '🔊' : '🔇' }}</span>
          <span class="st-soundToggle__text">サウンド</span>
          <span class="st-soundToggle__state">
            <span class="st-soundToggle__stateText st-soundToggle__stateText--on">ON</span>
            <span class="st-soundToggle__stateText st-soundToggle__stateText--off">OFF</span>
          </span>
        </button>

        <!-- サウンドOFFのあいだは、音量を変えても音が出ないので少し薄くする
             （さわれなくはしない。OFFのうちに、次に鳴らす大きさを決めておける） -->
        <div class="st-volume" :class="{ 'st-volume--off': !soundEnabled }">
          <p class="st-volume__label">音量</p>

          <input
            type="range"
            class="st-volume__slider"
            min="0"
            max="100"
            step="1"
            :value="masterVolumePercent"
            :style="{ '--volume-progress': masterVolumePercent + '%' }"
            aria-label="サウンドトラックの音量"
            :aria-valuetext="masterVolumePercent + 'パーセント'"
            @input="changeMasterVolume" />

          <span class="st-volume__value">{{ masterVolumePercent }}%</span>
        </div>
      </div>

      <!-- サウンドOFFのあいだだけ出す案内

           「押しても鳴りません」ではなく「押せばONに戻って鳴ります」と伝える
           （OFFのまま ▶ を押したときは ensureSoundEnabled がONへ戻す）

           aria-live … この文が出たことを、読み上げソフトにもその場で知らせる -->
      <p v-if="!soundEnabled" class="st-settings__hint" aria-live="polite">サウンドOFF中です。「▶ 再生」を押すと、サウンドをONに戻して鳴らします</p>
    </section>

    <!-- ============================================================
         曲の一覧

         上の tracks（配列）をそのまま並べている
         曲を増やしたり、曲名を変えたりしたいときは
         tracks を書きかえるだけでよい
         ============================================================ -->
    <!-- @keydown … 曲のボタンを選んでいるときだけ、キーボードで動かせるようにする
         ↑↓＝上下の曲へ、←→＝同じ曲の中の操作へ、Home / End＝最初 / 最後の曲へ
         （キーは押されたボタンからこの ol まで伝わってくるので、
           見張りはここ1か所でよい。くわしくは handleTrackListKeydown）

         ref … 「▶ 全曲再生」から↑↓で入ってくるときに、
         行き先の「▶ 再生」を探すために使う -->
    <ol ref="trackListRef" class="st-list" @keydown="handleTrackListKeydown">
      <li v-for="track in tracks" :key="track.id" class="track" :class="{ 'track--current': playingTrackId === track.id }">
        <button
          type="button"
          class="track__no"
          :class="{ 'track__no--start': selectedStartTrackId === track.id }"
          :aria-label="track.title + 'を全曲再生の開始曲にする'"
          :aria-pressed="selectedStartTrackId === track.id"
          @click="selectStartTrack(track)">
          <span class="track__noNum">{{ formatTrackNumber(track.id) }}</span>
        </button>

        <div class="track__body">
          <p class="track__title">
            {{ track.title }}

            <!-- いま鳴っている曲にだけ出す目印 -->
            <span v-if="isTrackPlaying(track)" class="track__nowPlaying">♪ 再生中</span>

            <!-- ⓘ 制作情報（再生・開始トラック選択とは別の操作。押しても曲は動かない）

                 出しかたは3とおり
                 ・マウスを乗せているあいだだけ出す       … CSSの :hover
                 ・Tabキーで移動してきたあいだだけ出す     … CSSの :focus-visible
                 ・押して（クリック・タップで）開いたまま … toggleCredit（openedCreditTrackId）

                 @click.stop は、このⓘのクリックを、外側へ伝えないためのもの
                 （曲のカードに、あとから押したときの処理が増えても、
                   ⓘを押しただけで曲が動いてしまわないようにしておく）

                 pointerleave / blur … ⓘから離れたら「閉じたばかり」を忘れる -->
            <span
              class="track__info"
              :class="{ 'track__info--suppress-hover': suppressedCreditHoverTrackId === track.id }"
              @pointerleave="releaseCreditHoverSuppression(track.id)">
              <button
                type="button"
                class="track__infoBtn"
                :class="{ 'track__infoBtn--open': openedCreditTrackId === track.id }"
                :aria-label="track.title + 'の制作情報を表示'"
                :aria-expanded="openedCreditTrackId === track.id"
                @click.stop="toggleCredit(track.id)"
                @blur="releaseCreditHoverSuppression(track.id)"></button>

              <span class="track__tooltip" :class="{ 'track__tooltip--open': openedCreditTrackId === track.id }" role="tooltip">{{ track.credit }}</span>
            </span>
          </p>

          <p class="track__description">{{ track.description }}</p>
        </div>

        <!-- button要素なので、Tabキーで移動でき、Enter / Spaceで押せる -->
        <button type="button" class="track__button" :class="{ 'track__button--playing': isTrackPlaying(track) }" :aria-label="trackButtonLabel(track)" @click="toggleTrack(track)">
          <template v-if="isTrackPlaying(track)">⏸ 一時停止</template>

          <!-- 同じ曲を一時停止しているときは、続きから鳴ることが分かるようにする -->
          <template v-else-if="playingTrackId === track.id">▶ 続きから</template>

          <template v-else>▶ 再生</template>
        </button>

        <!-- 再生バー（いま選んでいる曲にだけ出す）

             一時停止中も出したままにしてあるので、
             止めたまま聴きたいところへ動かすこともできる

             input type="range" を使っているので、
             Tabキーで移動でき、← → キーでも動かせる -->
        <div v-if="playingTrackId === track.id" class="track__player">
          <span class="track__time">{{ formatTime(currentTime) }}</span>

          <input
            type="range"
            class="track__seek"
            min="0"
            :max="duration"
            step="1"
            :value="currentTime"
            :disabled="duration <= 0"
            :style="{ '--seek-progress': seekPercent() + '%' }"
            :aria-label="track.title + 'の再生位置'"
            :aria-valuetext="formatTime(currentTime) + ' / ' + formatTime(duration)"
            @input="seekTrack" />

          <span class="track__time">{{ formatTime(duration) }}</span>
        </div>
      </li>
    </ol>

    <!-- ============================================================
         はじめの画面へ戻る
         ============================================================ -->
    <div class="st-foot">
      <button type="button" class="st-back" @click="goToTitle">← はじめの画面へ戻る</button>
    </div>
  </main>
</template>

<style scoped>
/* ============================================================
   ページ全体の下地
   ゲーム画面と同じく、枠の外側は暗くしておく
   ============================================================ */
:global(html),
:global(body) {
  margin: 0;
  padding: 0;
  background: #101d2c;
}

/* ============================================================
   サウンドトラックページの枠

   ゲーム画面（.game）は高さを100vhに固定してスクロールさせないが、
   このページは「読みもの」なので、縦に普通にスクロールさせる
   （6曲を無理に一画面へ押し込まない）
   ============================================================ */
.soundtrack {
  /* 色はゲーム画面と同じものを使う */
  --navy: #2a768f;
  --navy-deep: #226981;
  --paper: #fffdf9;
  --ink: #4e5860;
  --ink-soft: #8d949b;
  --gold: #ffd166;

  box-sizing: border-box;
  width: 100%;
  max-width: 1180px;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  padding: 16px 24px 24px;
  background: linear-gradient(180deg, #d6f0fb 0%, #e8f6ee 45%, #fffdf2 100%);
  color: var(--ink);
  font-family:
    system-ui,
    -apple-system,
    'Hiragino Kaku Gothic ProN',
    'Yu Gothic',
    Meiryo,
    sans-serif;
  font-size: 16px;
  line-height: 1.7;
  box-shadow: 0 0 60px rgb(42 118 143 / 35%);
}

/* ============================================================
   ページの見出し
   ============================================================ */
.st-head {
  max-width: 760px;
  margin: 0 auto 12px;
  padding: 16px 28px 14px;
  border: 3px solid var(--navy);
  border-radius: 20px;
  background: var(--paper);
  box-shadow: 0 12px 0 rgb(35 57 94 / 18%);
  text-align: center;
}

.st-head__badge {
  display: inline-block;
  margin: 0 0 8px;
  padding: 4px 18px;
  border-radius: 999px;
  background: var(--navy);
  color: #fff;
  font-size: 13px;
  letter-spacing: 0.12em;
}

.st-head__name {
  margin: 0;
  color: var(--navy);
  font-size: 30px;
  line-height: 1.35;
}

.st-head__lead {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

/* ============================================================
   再生の設定（全曲再生の箱の中、いちばん下の1行）

   設定だけのために箱をもう1つ増やすとページが長くなるので、
   同じ「再生まわりの操作」として、この箱の中へ入れてある
   上の行とは、全曲再生中の案内と同じ点線で区切る
   PCでは「🔁 リピート OFF ／ 🔊 サウンド ON ／ 音量 ／ スライダー ／ 70%」が1行に並ぶ
   せまい画面では、音量のまとまりが次の行へ折り返す
   ============================================================ */
.st-settings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 2px dashed #c8d4e6;
}

/* 「🔁 リピート」と「🔊 サウンド」の2つのボタン

   どちらも「押すたびに状態が変わる、設定のボタン」なので、
   同じ形（丸い枠のボタン）にして、まとめて指定している
   ・🔁 リピート … OFF → 全曲 → 1曲 → OFF と順ぐりに回る
   ・🔊 サウンド … ON ⇄ OFF が入れかわる

   考えかたはゲーム本編（pages/index.vue）の .sound-toggle と同じで、
   ちがうのは、このページの大きさ・色に合わせてあることだけ
   （ここは上部バーではなく、指でも押しやすい大きさにしている） */
.st-repeat,
.st-soundToggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 2px solid var(--navy);
  border-radius: 999px;
  background: #fff;
  color: var(--navy-deep);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
}

/* はたらいていないとき（リピートなし・サウンドOFF）は、色をぬく
   絵文字や文字だけでなく色でも、「いまは何も起きない設定」だと分かるようにする */
.st-repeat[data-repeat='off'],
.st-soundToggle[aria-pressed='false'] {
  border-color: #b9c6d6;
  background: #eef2f7;
  color: var(--ink-soft);
}

.st-repeat:hover,
.st-soundToggle:hover {
  background: #e8f4fb;
}

/* 押した瞬間：ほんの少しだけ沈む */
.st-repeat:active,
.st-soundToggle:active {
  transform: translateY(1px);
}

/* Tabキーで移動してきたとき、どこにいるかが分かるようにする */
.st-repeat:focus-visible,
.st-soundToggle:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 3px;
}

.st-repeat__icon,
.st-soundToggle__icon {
  font-size: 16px;
  line-height: 1;
}

/* 状態の文字（OFF / 全曲 / 1曲、ON / OFF）が変わっても、
   ボタンの幅を変えないための工夫（本編と同じ）

   文字をぜんぶ同じマスに重ねて置き、いま使わないものを visibility で見えなくする
   display: none とちがい visibility は「場所は残したまま消す」ので、
   幅はいつもいちばん長い文字のままになり、押しても右の音量がずれない */
.st-repeat__state,
.st-soundToggle__state {
  display: grid;
}

.st-repeat__stateText,
.st-soundToggle__stateText {
  grid-area: 1 / 1; /* ぜんぶ同じマスに置いて重ねる */
  text-align: center;
}

/* サウンドは2つのうち、いま使わないほうを見えなくする
   aria-pressed は true＝サウンドON、false＝サウンドOFF */
.st-soundToggle[aria-pressed='true'] .st-soundToggle__stateText--off,
.st-soundToggle[aria-pressed='false'] .st-soundToggle__stateText--on {
  visibility: hidden;
}

/* リピートは3つあるので、逆に「いまの1つだけ」を見せるようにする
   data-repeat には、いまの状態（off / all / one）が入っている */
.st-repeat__stateText {
  visibility: hidden;
}

.st-repeat[data-repeat='off'] .st-repeat__stateText--off,
.st-repeat[data-repeat='all'] .st-repeat__stateText--all,
.st-repeat[data-repeat='one'] .st-repeat__stateText--one {
  visibility: visible;
}

/* 設定についての案内（いまはサウンドOFF中のものだけ）

   リピートの状態は、ボタンの「OFF / 全曲 / 1曲」だけで伝える
   （文を出すと、設定の行が押すたびに高くなったり低くなったりして落ち着かないため） */
.st-settings__hint {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
}

/* 音量のまとまり（「音量 ／ スライダー ／ 70%」）

   flex: 1 … サウンドボタンの右に残った幅を、まるごと使う
   min-width … これより狭くなるくらいなら、1行まるごと使いたいので、
               次の行へ折り返させる（サウンドボタンと肩を並べない） */
.st-volume {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  min-width: 260px;
}

/* サウンドOFFのあいだは、音量を変えても音が出ないので少し薄くする */
.st-volume--off {
  opacity: 0.55;
}

.st-volume__label {
  margin: 0;
  color: var(--navy-deep);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.6;
  white-space: nowrap;
}

/* いまの大きさ（％）
   数字が変わっても場所が動かないように、
   min-width で場所を取り、tabular-nums で数字の幅をそろえる */
.st-volume__value {
  min-width: 52px;
  color: var(--navy-deep);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* スライダー本体

   作りかたは曲の再生バー（.track__seek）と同じで、
   ・レールとつまみを、ブラウザごとに別々に指定する
   ・左（小さい側）だけ色を変えるために、下地のグラデーションを使う
     境目の位置は、画面から --volume-progress で渡している
   指でもつまみやすいように、細くしすぎない */
.st-volume__slider {
  flex: 1;
  min-width: 180px;
  height: 24px;
  margin: 0;
  padding: 0;
  background: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

/* レール（Chrome / Safari / Edge） */
.st-volume__slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--navy) var(--volume-progress, 100%), #d7e4f0 var(--volume-progress, 100%));
}

/* つまみ（Chrome / Safari / Edge）
   （つまみ18px − レール6px）÷ 2 = 6px ぶん、上へずらして真ん中にそろえる */
.st-volume__slider::-webkit-slider-thumb {
  width: 18px;
  height: 18px;
  margin-top: -6px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 1px 3px rgb(35 57 94 / 35%);
  -webkit-appearance: none;
  appearance: none;
}

/* レール（Firefox） */
.st-volume__slider::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: #d7e4f0;
}

/* 小さい側（Firefox は、はじめから塗り分ける機能がある） */
.st-volume__slider::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--navy);
}

/* つまみ（Firefox） */
.st-volume__slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 1px 3px rgb(35 57 94 / 35%);
}

/* Tabキーで移動してきたとき、どこにいるかが分かるようにする */
.st-volume__slider:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 4px;
}

/* ============================================================
   全曲再生の操作バー
   ============================================================ */
.st-playall {
  max-width: 760px;
  margin: 0 auto 12px;
  padding: 12px 20px;
  border: 2px solid var(--navy);
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--paper);
}

.st-playall__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.st-playall__start {
  margin: 0;
  color: var(--navy-deep);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.5;
}

.st-playall__start strong {
  font-variant-numeric: tabular-nums;
}

/* タイトルの「公園へ行く」と同じ金色のボタン */
.st-playall__button {
  min-width: 148px;
  padding: 11px 20px;
  border: 2px solid #e8b23c;
  border-bottom-width: 4px;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
  color: #4a3208;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

/* 鳴っているあいだは紺色にして、「押すと止まる」ことを伝える */
.st-playall__button--stop {
  border-color: var(--navy-deep);
  background: var(--navy);
  color: #fff;
}

/* 「⏭ 次のトラックへ」は、白〜水色＋紺色の文字にする
   紺色でぬりつぶした「■ 全曲再生を停止」より軽い見た目にして、
   まちがえて止めてしまわないように見分けやすくしている */
.st-playall__button--next {
  /* 横いっぱいには広げず、文字がおさまるぶんの大きさにする
     （min-width をここだけ外して、停止ボタンより少し小さくしている） */
  min-width: 0;
  padding: 9px 16px;
  border-color: var(--navy);
  background: linear-gradient(180deg, #fff 0%, #d6f0fb 100%);
  color: var(--navy-deep);
  font-size: 15px;
}

.st-playall__button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
}

.st-playall__button:active {
  border-bottom-width: 2px;
  transform: translateY(2px);
  box-shadow: none;
}

.st-playall__button:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 2px;
}

.st-playall__hint {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
}

/* 全曲再生中の案内（今回の何曲目か＋実際のトラック番号） */
.st-playall__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 2px dashed #c8d4e6;
  font-size: 15px;
  line-height: 1.6;
}

.st-playall__badge {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--navy);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.st-playall__count {
  color: var(--navy-deep);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.st-playall__track {
  color: var(--ink);
  font-weight: 700;
}

/* 全曲再生中の操作ボタンの並び（⏭ 次のトラックへ ／ ■ 全曲再生を停止）

   よく押す「⏭ 次のトラックへ」を先（左）に置く
   どちらも文字がおさまるぶんの大きさにして、横に並べ、真ん中へ寄せる
   幅が足りないときは、下のスマホ用の指定で縦に積み直す */
.st-playall__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
  margin: 10px 0 0;
}

/* ============================================================
   曲の一覧
   ============================================================ */
.st-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 760px;
  margin: 0 auto;
  padding: 0;
  list-style: none;
}

/* 1曲ぶんのカード
   「番号」「曲名と説明」「再生ボタン」の3つを横に並べる */
.track {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  /* 縦のすき間は、再生バーが増える2行目ぶん。横のすき間は今までどおり */
  gap: 10px 18px;
  padding: 10px 20px;
  border: 2px solid #c8d4e6;
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--paper);
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

/* いま選んでいる曲のカードだけ、少し明るくして枠を濃くする
   （点滅などの派手な動きはさせない） */
.track--current {
  border-color: var(--navy);
  background: #f0fbff;
}

/* トラック番号（押すと、全曲再生の開始曲になるボタン） */
.track__no {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  margin: 0;
  padding: 6px 10px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: none;
  color: var(--navy);
  font-family: inherit;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.track__no:hover {
  background: #eef6fb;
}

.track__no:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 2px;
}

/* 開始曲に選ばれている番号 */
.track__no--start {
  border-color: var(--navy);
  background: #e3f4fb;
}

.track__noNum {
  display: block;
}

.track__body {
  min-width: 0;
}

.track__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 2px;
  color: var(--navy-deep);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.5;
}

/* 「♪ 再生中」の目印 */
.track__nowPlaying {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--navy);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
  white-space: nowrap;
}

/* ============================================================
   ⓘ 制作情報（曲名の右の小さな丸ボタン＋吹き出し）
   ============================================================ */

/* ⓘ と吹き出しの入れもの。吹き出しは、この中で position: absolute で浮かせる */
.track__info {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* ⓘ ボタン（再生ボタンほど目立たせない、小さな丸） */
.track__infoBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--navy);
  border-radius: 50%;
  background: #eef6fb;
  color: var(--navy-deep);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  font-style: normal;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

/* 「i」は ::before で出す
   要素の中に文字を直接書くと、前後の改行・余白のぶんだけ中央からずれるため */
.track__infoBtn::before {
  content: 'i';
}

/* hover / 開いているときだけ、背景を少し濃くする */
.track__infoBtn:hover,
.track__infoBtn--open {
  background: #d7ebf7;
}

/* Tabキーで移動してきたとき、どこにいるかが分かるようにする */
.track__infoBtn:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 2px;
}

/* 吹き出し（ツールチップ）
   曲名＋ⓘの下に、レイアウトを押し下げずに浮かせて出す
   ・ふだんは見えない（opacity 0・visibility hidden）
   ・PCは .track__info:hover / :focus-within で出す
   ・スマホは .track__tooltip--open（タップ）で出す */
.track__tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 5;
  /* 制作情報は、途中で折り返さずに1行で読めるようにする
     ・width: max-content … 文字の量に合わせて、横幅がちょうどのびる
     ・max-width: none    … 幅の上限で、むりやり折り返させない */
  width: max-content;
  max-width: none;
  padding: 8px 12px;
  transform: translateX(-50%);
  border: 2px solid var(--navy);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 6px 16px rgb(35 57 94 / 22%);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
  text-align: center;
  /* 文の途中で改行せず、かならず1行で見せる */
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.12s ease;
}

/* 吹き出しの上に、ⓘを指す小さな三角 */
.track__tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: var(--navy);
}

/* 吹き出しを出す条件は、3つに分けてある

   ① クリック・タップで開いたまま（--open）… いつでも出す
   ② マウスを乗せているあいだ（hover）    … 一時的に出す
   ③ Tabキーで移動してきたあいだ（focus-visible）… 一時的に出す

   ②③は「閉じたばかり」（--suppress-hover）のあいだは出さない
   こうしないと、同じⓘをもう一度押して閉じても、
   マウスが乗ったまま・フォーカスが残ったままなので、すぐまた出てきてしまう */

/* ① クリック・タップで開いたまま */
.track__tooltip--open {
  opacity: 1;
  visibility: visible;
}

/* ② マウスを乗せているあいだ（PCなど、マウスが使える機械だけ）

   スマホは、タップした場所に hover がしばらく残ってしまう機械があるので、
   hover では出さず、タップ（--open）だけで出し入れする */
@media (hover: hover) {
  .track__info:not(.track__info--suppress-hover):hover .track__tooltip {
    opacity: 1;
    visibility: visible;
  }
}

/* ③ Tabキーでⓘへ移動してきたあいだ

   :focus-within（中のどこかにフォーカスがあれば、の意味）ではなく、
   :focus-visible（キーボードで移動してきたときだけ付く）を使う
   マウスでクリックしたあとに残るフォーカスでは出さないためで、
   これにより「閉じたのに、フォーカスのせいで出たまま」が起きない
   （＋ は「すぐ次のきょうだい」の意味。ⓘボタンの次が吹き出し） */
.track__info:not(.track__info--suppress-hover) .track__infoBtn:focus-visible + .track__tooltip {
  opacity: 1;
  visibility: visible;
}

.track__description {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
}

/* 再生ボタン
   タイトルの「公園へ行く」と同じ金色だが、ひとまわり小さくしている
   ※ 小さくしすぎると押しにくいので、高さは指でも押せる大きさを保つ */
.track__button {
  min-width: 132px;
  padding: 11px 18px;
  border: 2px solid #e8b23c;
  border-bottom-width: 4px;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
  color: #4a3208;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

/* 鳴っているあいだは、紺色のボタンにして「押すと止まる」ことを伝える */
.track__button--playing {
  border-color: var(--navy-deep);
  background: var(--navy);
  color: #fff;
}

.track__button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
}

.track__button:active {
  border-bottom-width: 2px;
  transform: translateY(2px);
  box-shadow: none;
}

/* Tabキーで移動してきたとき、どこにいるかが分かるようにする */
.track__button:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 2px;
}

/* ============================================================
   再生バー（シークバー）

   カードの2行目に、横いっぱいで置く
   1 / -1 は「1列目から最後の列まで、ぜんぶ使う」という意味
   ============================================================ */
.track__player {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
}

/* 経過時間と曲の長さ
   数字が変わっても幅が動かないように、
   ・min-width で場所を先に取っておく
   ・tabular-nums で数字の幅をそろえる */
.track__time {
  min-width: 44px;
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

/* バー本体

   input type="range" は、ブラウザによって見た目の作り方がちがう
   そのため「レール」と「つまみ」を、ブラウザごとに別々に指定している
   ・::-webkit-… … Chrome / Safari / Edge 用
   ・::-moz-…    … Firefox 用
   どちらか片方しか効かないので、両方書いておくのがふつう
*/
.track__seek {
  flex: 1;
  min-width: 0;
  height: 20px;
  margin: 0;
  padding: 0;
  background: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

/* レール（Chrome / Safari / Edge）

   聴き終わったところだけ色を変えたいが、
   このブラウザには そのための機能が無い
   そこで、下地のグラデーションで
   「左は紺色・右はうすい水色」と塗り分けている
   （境目の位置は seekPercent() がCSSへ渡している --seek-progress） */
.track__seek::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--navy) var(--seek-progress, 0%), #d7e4f0 var(--seek-progress, 0%));
}

/* つまみ（Chrome / Safari / Edge）
   margin-top は、6pxのレールの真ん中に来るように上へずらしている
   （つまみ16px − レール6px）÷ 2 = 5px */
.track__seek::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  margin-top: -5px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 1px 3px rgb(35 57 94 / 35%);
  -webkit-appearance: none;
  appearance: none;
}

/* レール（Firefox） */
.track__seek::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: #d7e4f0;
}

/* 聴き終わったところ（Firefox は、はじめから塗り分ける機能がある） */
.track__seek::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--navy);
}

/* つまみ（Firefox） */
.track__seek::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 1px 3px rgb(35 57 94 / 35%);
}

/* Tabキーで移動してきたとき、どこにいるかが分かるようにする */
.track__seek:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 4px;
}

/* 曲の長さがまだ分からないあいだ（mp3を読み込み中）は動かせない */
.track__seek:disabled {
  cursor: default;
  opacity: 0.45;
}

/* ============================================================
   はじめの画面へ戻る
   ============================================================ */
.st-foot {
  max-width: 760px;
  margin: 14px auto 0;
  text-align: center;
}

/* メインの操作ではないので、ボタンらしさは控えめにする
   ただし、指でも押せる大きさは残しておく */
.st-back {
  padding: 10px 22px;
  border: 2px solid var(--navy);
  border-radius: 999px;
  background: rgb(255 255 255 / 70%);
  color: var(--navy-deep);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.6;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.st-back:hover {
  background: #fff;
}

.st-back:active {
  transform: translateY(1px);
}

.st-back:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 2px;
}

/* ============================================================
   動きを減らす設定にしている人への配慮
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
  }
}

/* ============================================================
   スマホ幅：曲のカードを縦に積み直す
   横にはみ出さないようにする
   ============================================================ */
@media (max-width: 600px) {
  .soundtrack {
    padding: 24px 16px 40px;
  }

  .st-playall {
    padding: 16px 18px;
  }

  /* せまい画面では、設定のボタンと音量を縦に積み直す
     1行目 … 🔁 リピート OFF　🔊 サウンド ON（入りきらなければ、さらに折り返す）
     2行目 … 音量　　　70%
     3行目 … スライダー
     （音量を次の行へ回すのは、下の .st-volume の flex-basis: 100%）
     すき間は、上の操作ボタンと同じくらいまで小さくしておく */
  .st-settings {
    gap: 8px 12px;
  }

  /* 音量バーはさらに2行に分ける
     1行目 … 音量　　　70%
     2行目 … スライダー（横いっぱいで、指でも動かしやすい）

     order で、スライダーだけを最後（下の行）へ回している

     flex-basis: 100% … いつも1行まるごと使う
     min-width: 0     … 画面がとても狭いときに、
                        PC用の min-width（260px）が残っていると、
                        そこからはみ出してしまうので外しておく */
  .st-volume {
    flex-basis: 100%;
    gap: 8px 12px;
    min-width: 0;
  }

  .st-volume__label {
    flex: 1;
  }

  .st-volume__slider {
    flex-basis: 100%;
    order: 1;
    min-width: 0;
  }

  .st-playall__button {
    width: 100%;
  }

  /* 横に並べる幅が足りないので、1列にして縦に積み直す
     （ボタンは上の .st-playall__button で横いっぱいになり、押しやすくなる） */
  .st-playall__actions {
    flex-direction: column;
  }

  .st-head {
    padding: 24px 20px 22px;
  }

  .st-head__name {
    font-size: 26px;
  }

  .st-head__lead {
    font-size: 16px;
  }

  /* 「番号」「曲名と説明」「再生ボタン」を縦に並べる */
  .track {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding: 16px 18px;
  }

  .track__no {
    font-size: 20px;
  }

  /* position: relative は、下の ⓘ の吹き出しを
     「曲名の行」を基準に出すためのもの */
  .track__title {
    position: relative;
    font-size: 17px;
  }

  /* ボタンは横いっぱいに広げて、押しやすくする */
  .track__button {
    width: 100%;
  }

  /* ⓘ の吹き出し（制作情報）
     スマホでは1行のままだと横幅が広いので、
     「ⓘ の真下に中央ぞろえ」だと画面の左右へはみ出してしまう。
     そこで基準を ⓘ から「曲名の行」（上の .track__title）に変えて、
     カードの左はしにそろえて出す。
     こうすると曲名の長さや ⓘ の位置に関係なく、
     いつもカードの中に収まり、画面の外へ大きくはみ出さない */
  .track__info {
    position: static;
  }

  .track__tooltip {
    left: 0;
    max-width: calc(100vw - 40px);
    transform: none;
  }

  /* 三角は、曲名の行の左寄り（ⓘ のだいたいの位置）を指すようにする */
  .track__tooltip::before {
    left: 24px;
    transform: none;
  }
}

/* ============================================================
   小さめのスマホ（iPhone SE くらいまで）

   全曲再生中の案内は
   「♪ 全曲再生中 ／ 6 / 6 ／ 06 きょうの大冒険、おしまい！」の3つ

   この幅では、曲名が短い曲は1行に収まり、長い曲だけ折り返すので、
   曲によって見え方がそろわない
   そこで、曲名はいつも2行目へ落として、見え方を統一する

     1行目 … ♪ 全曲再生中　6 / 6
     2行目 … 06 きょうの大冒険、おしまい！

   flex-basis: 100% は「1行まるごと使う」という意味
   前の2つとは同じ行に入れないので、かならず改行される
   （481px 以上なら、どの曲名でも1行に収まるので、そのまま横に並べる）
   ============================================================ */
@media (max-width: 480px) {
  .st-playall__track {
    flex-basis: 100%;
  }
}

/* ============================================================
   とても狭い画面（幅 360px 未満の古いスマホなど）
   1行のままではカードに収まりきらないので、
   吹き出しの文字と余白だけを少し小さくして収める
   ※ 文字は折り返さない（1行のまま）
   ============================================================ */
@media (max-width: 359px) {
  .track__tooltip {
    padding: 7px 10px;
    font-size: 12px;
  }
}
</style>
