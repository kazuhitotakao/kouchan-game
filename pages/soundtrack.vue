<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

/* ============================================================
   サウンドトラックページ（/soundtrack）

   ゲームの中で流れる6曲を、ゆっくり聴くためのページ

   ゲーム本編（pages/index.vue）のBGMとは、わざと作りを分けてある
   ・本編 … 場面に合わせて自動で切り替わる。曲はloopする
   ・ここ … プレイヤーが「▶ 再生」を押した曲だけが鳴る。loopしない

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
   全曲再生（6曲を1周ぶん、続けて鳴らす）のしくみ

   ・selectedStartTrackId … どの曲から1周を始めるか（トラック番号を押して選ぶ）
   ・isPlaylistPlaying    … いま全曲再生の途中かどうか
   ・playlistTracks       … 今回の1周ぶんの曲順（開始曲から並べ替えたもの）
   ・playlistIndex        … その曲順の何曲目を鳴らしているか（0はじまり）

   曲順は開始曲から後ろへ進み、最後まで行ったら先頭へ回り込む
   （例：03開始 → 03 04 05 06 01 02）
   6曲を1回ずつ鳴らし終えたら止まる。01へ無限ループはしない

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

      /* loop … ゲーム本編のBGMは true（くり返す）にしてあるが、
         このページは「1曲を最初から最後まで聴く」ページなので false にする
         ※ ここで false にしているのは、このページで作ったAudioだけ
           ゲーム本編のBGMの設定には、いっさいさわっていない */
      soundtrackAudio.loop = false;

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

/* 鳴っている曲を完全に止める（次はまた最初から鳴るようにする） */
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
}

/* トラック番号を押したときに、その曲を「全曲再生の開始曲」にする

   ここでは曲は鳴らさない（開始曲を選ぶだけ）
   実際に鳴らすのは「▶ 全曲再生」を押したとき
*/
function selectStartTrack(track: SoundtrackTrack) {
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
}

/* 全曲再生中に、次の曲へ進む

   この関数は2つの場面から呼ばれる（次の曲へ進む中身は、ここ1か所だけ）
   ① 曲が最後まで流れきったとき      … handleTrackEnded() から
   ② 「⏭ 次のトラックへ」を押したとき … 画面のボタンから

   どちらの場合も、やることは同じ
   「playlistIndex を1つだけ進めて、その曲を先頭から鳴らす」

   ※ playlistTracks（今回の曲順）は作りなおさない
     「▶ 全曲再生」を押したときに作った曲順を、最後までそのまま使う

   1周ぶんを鳴らし終えていたら、そこで全曲再生を終わりにする
   （開始曲へは戻らない。ぐるぐる無限に鳴りつづけることはない）
*/
function playNextPlaylistTrack() {
  /* 全曲再生中でなければ、何もしない
     （1曲だけの再生のときは、曲が終わっても次へは進まない） */
  if (!isPlaylistPlaying.value) {
    return;
  }

  const nextIndex = playlistIndex.value + 1;

  // 1周ぶんを鳴らし終えた → 全曲再生はここで終わり（無限ループしない）
  if (nextIndex >= playlistTracks.value.length) {
    finishPlaylist();

    return;
  }

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

/* 「← はじめの画面へ戻る」

   戻る前に、鳴っている曲をかならず止める
   （移動したあとに、サントラの曲だけが鳴り続けないようにするため）

   ※ ブラウザの「戻る」ボタンで出ていった場合はここを通らないが、
     そのときは下の onUnmounted() が同じように止めてくれる
*/
function goToTitle() {
  stopSoundtrack();

  navigateTo('/');
}

/* ページが表示されたときの準備

   ⓘ・吹き出し以外が押されたら、開いたままの吹き出しを閉じたいので、
   ページ全体（document）で「押された」を見張ってもらう
   ※ onMounted はブラウザでだけ動くので、document を安心して使える
*/
onMounted(() => {
  document.addEventListener('pointerdown', handleOutsideCreditPointerDown);

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

        <button v-if="!isPlaylistPlaying" type="button" class="st-playall__button" @click="startPlaylist">▶ 全曲再生</button>
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
        <div class="st-playall__actions">
          <button
            type="button"
            class="st-playall__button st-playall__button--next"
            aria-label="現在の曲を飛ばして次のトラックを再生する"
            @click="playNextPlaylistTrack">
            ⏭ 次のトラックへ
          </button>

          <button type="button" class="st-playall__button st-playall__button--stop" @click="stopSoundtrack">■ 全曲再生を停止</button>
        </div>
      </template>

      <!-- 音量（このページで鳴らす曲すべての大きさ）

           「どの曲を・どこから鳴らすか」を決めるこの箱の中に、
           「どのくらいの大きさで鳴らすか」もまとめて置いてある

           曲カードの中にある再生バーとは役わりがちがうので、
           見まちがえないように「🔊 音量」の文字と、
           いまの大きさ（％）をかならずそえておく
           ・再生バー … 曲の「どこ」を鳴らすか（時間）
           ・音量バー … 「どのくらいの大きさ」で鳴らすか -->
      <div class="st-volume">
        <p class="st-volume__label">🔊 音量</p>

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
    </section>

    <!-- ============================================================
         曲の一覧

         上の tracks（配列）をそのまま並べている
         曲を増やしたり、曲名を変えたりしたいときは
         tracks を書きかえるだけでよい
         ============================================================ -->
    <ol class="st-list">
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
   音量バー（全曲再生の箱の中、いちばん下の1行）

   音量だけのために箱をもう1つ増やすとページが長くなるので、
   同じ「再生まわりの操作」として、この箱の中へ入れてある
   上の行とは、全曲再生中の案内と同じ点線で区切る
   PCでは「🔊 音量 ／ スライダー ／ 70%」が1行に並ぶ
   ============================================================ */
.st-volume {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 2px dashed #c8d4e6;
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

  /* 音量バーは2行に分ける
     1行目 … 🔊 音量　　　70%
     2行目 … スライダー（横いっぱいで、指でも動かしやすい）

     order で、スライダーだけを最後（下の行）へ回している */
  .st-volume {
    gap: 8px 12px;
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
