<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';

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
    credit: '音楽生成：Sunoを使用',
  },
  {
    id: 3,
    title: 'ひるまえのぼうけん',
    description: '公園での探検BGM 後半',
    src: '/audio/park-bgm2.mp3',
    volume: 0.4,
    credit: '音楽生成：Sunoを使用',
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
    credit: '音楽生成：Sunoを使用',
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
   全曲再生（6曲を1周ぶん、続けて鳴らす）のしくみ

   ・selectedStartTrackId … どの曲から1周を始めるか（トラック番号を押して選ぶ）
   ・isPlaylistPlaying    … いま全曲再生の途中かどうか
   ・playlistTracks       … 今回の1周ぶんの曲順（開始曲から並べ替えたもの）
   ・playlistIndex        … その曲順の何曲目を鳴らしているか（0はじまり）

   曲順は開始曲から後ろへ進み、最後まで行ったら先頭へ回り込む
   （例：03開始 → 03 04 05 06 01 02）
   6曲を1回ずつ鳴らし終えたら止まる。01へ無限ループはしない
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

/* いま制作情報（ⓘ）の吹き出しを開いているトラック（どれも開いていなければ null）
   PCのhover/focusはCSSだけで出す。これはスマホのタップ開閉のための状態 */
const openedCreditTrackId = ref<number | null>(null);

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

  // 全曲再生の途中なら、次の曲へ
  if (isPlaylistPlaying.value) {
    advancePlaylist();

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
  playingTrackId.value = track.id;
  isPlaying.value = true;

  try {
    audio.play().catch(() => {
      /* 再生できなかったとき（対応していない形式など）は、表示を元に戻す

         ただし、待っているあいだに別の曲のボタンが押されていたら、
         そちらの表示は消さない（だから、同じ曲のときだけ戻している） */
      if (playingTrackId.value === track.id) {
        playingTrackId.value = null;
        isPlaying.value = false;
      }
    });
  } catch {
    playingTrackId.value = null;
    isPlaying.value = false;
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

/* ⓘ（制作情報）の吹き出しを開け閉めする（スマホのタップ用）

   ・同じⓘをもう一度押したら閉じる
   ・別のⓘを押したら、前のを閉じて新しいほうを開く
   再生や開始トラックの選択には、いっさい影響しない（表示だけ）
*/
function toggleCredit(trackId: number) {
  openedCreditTrackId.value = openedCreditTrackId.value === trackId ? null : trackId;
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
    audio.volume = firstTrack.volume;
    audio.currentTime = 0;
  } catch {
    // 何もしない
  }

  playTrackAudio(audio, firstTrack);
}

/* 全曲再生中に1曲終わったら、次の曲へ進む

   まだ残りがあれば次の曲を先頭から鳴らす
   6曲すべてを1回ずつ鳴らし終えたら、そこで止まる（01へ戻らない）
*/
function advancePlaylist() {
  const nextIndex = playlistIndex.value + 1;

  // 1周ぶんを鳴らし終えた → 停止（無限ループしない）
  if (nextIndex >= playlistTracks.value.length) {
    isPlaylistPlaying.value = false;
    playingTrackId.value = null;
    isPlaying.value = false;
    currentTime.value = 0;
    duration.value = 0;

    return;
  }

  const audio = getSoundtrackAudio();

  if (!audio) {
    // 音が使えなくなったら、全曲再生も終わりにする
    isPlaylistPlaying.value = false;
    playingTrackId.value = null;
    isPlaying.value = false;

    return;
  }

  playlistIndex.value = nextIndex;

  const nextTrack = playlistTracks.value[nextIndex];

  // 次の曲を先頭から鳴らすので、再生バーもリセットする
  currentTime.value = 0;
  duration.value = 0;

  try {
    audio.src = nextTrack.src;
    audio.volume = nextTrack.volume;
    audio.currentTime = 0;
  } catch {
    // 何もしない
  }

  playTrackAudio(audio, nextTrack);
}

/* 「▶ 再生」「⏸ 一時停止」を押したときの処理

   押した曲によって、やることが2とおりある

   ① いま選んでいるのと同じ曲を押したとき
      ・再生中     → 一時停止（どこまで聴いたかは覚えたまま）
      ・一時停止中 → 続きから再生

   ② ちがう曲を押したとき
      いまの曲を完全に止めてから、新しい曲を先頭から鳴らす
      （2曲が重ならないように、かならずこの順番で行う）
*/
function toggleTrack(track: SoundtrackTrack) {
  const audio = getSoundtrackAudio();

  if (!audio) {
    return;
  }

  /* 個別の「▶ 再生」を押したら、全曲再生モードからは抜ける
     （ここからは1曲だけの再生として扱う） */
  isPlaylistPlaying.value = false;

  // ① 同じ曲を押したとき
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
  //    まず、いまの曲を完全に止める
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
    audio.volume = track.volume;
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

/* このページから離れるときの後始末

   ・「← はじめの画面へ戻る」を押したとき
   ・ブラウザの戻るボタンで出ていったとき
   のどちらでも、かならずここを通る

   曲を止めて、使いまわしていたAudioも手放しておく
*/
onUnmounted(() => {
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
         ============================================================ -->
    <section class="st-playall">
      <div class="st-playall__row">
        <p class="st-playall__start">
          開始曲：
          <strong>{{ formatTrackNumber(selectedStartTrackId) }}</strong>
          {{ selectedStartTrackTitle }}
        </p>

        <button v-if="!isPlaylistPlaying" type="button" class="st-playall__button" @click="startPlaylist">▶ 全曲再生</button>

        <button v-else type="button" class="st-playall__button st-playall__button--stop" @click="stopSoundtrack">■ 停止</button>
      </div>

      <!-- だどの曲から始めるかの案内（全曲再生中は下の状態表示に切り替える） -->
      <p v-if="!isPlaylistPlaying" class="st-playall__hint">下の一覧で番号を押すと、始める曲を選べます</p>

      <!-- 全曲再生中は、今回の曲順の何曲目か＋実際のトラック番号を出す -->
      <p v-else-if="currentPlaylistTrack" class="st-playall__status" aria-live="polite">
        <span class="st-playall__badge">♪ 全曲再生中</span>
        <span class="st-playall__count">{{ playlistIndex + 1 }} / {{ playlistTracks.length }}</span>
        <span class="st-playall__track">{{ formatTrackNumber(currentPlaylistTrack.id) }} {{ currentPlaylistTrack.title }}</span>
      </p>
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
                 PCはhover/focusでCSS表示、スマホは@clickでtoggleCreditして表示 -->
            <span class="track__info">
              <button
                type="button"
                class="track__infoBtn"
                :class="{ 'track__infoBtn--open': openedCreditTrackId === track.id }"
                :aria-label="track.title + 'の制作情報を表示'"
                :aria-expanded="openedCreditTrackId === track.id"
                @click.stop="toggleCredit(track.id)"></button>

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
  width: max-content;
  max-width: min(220px, calc(100vw - 40px));
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
  white-space: normal;
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

/* PC：ⓘにマウスを乗せたとき／Tabでフォーカスしたとき
   スマホ：ⓘをタップして開いたとき */
.track__info:hover .track__tooltip,
.track__info:focus-within .track__tooltip,
.track__tooltip--open {
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

  .st-playall__button {
    width: 100%;
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

  .track__title {
    font-size: 17px;
  }

  /* ボタンは横いっぱいに広げて、押しやすくする */
  .track__button {
    width: 100%;
  }
}
</style>
