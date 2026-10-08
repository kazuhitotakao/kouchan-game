<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { loadHasUnlockedSPlusSong, sPlusSongSrc, sPlusSongTitle } from '~/utils/sPlusSong';
import { secretVocalSongSrc, secretVocalSongTitle, unlockSecretVocalSongFromSavedBest } from '~/utils/secretVocalSong';
import { ladybugVocalSongSrc, ladybugVocalSongTitle, unlockLadybugVocalSongFromSavedBest } from '~/utils/ladybugVocalSong';
import { loadUnlockedMinigames } from '~/utils/minigameStorage';

import { sPlusSongLyrics, type LyricLine } from '~/data/sPlusSongLyrics';
import { secretVocalSongLyrics } from '~/data/secretVocalSongLyrics';
import { ladybugVocalSongLyrics } from '~/data/ladybugVocalSongLyrics';

/* 曲の音量は、かならずこれを通して入れる（audio.volume に直接入れても、iPhone では変わらないため） */
import { cancelElementPause, isElementPlaying, keepAudioContextAwake, pauseElement, pauseElementThen, releaseElement, setElementVolume, wakeElementAudioContext } from '~/utils/elementVolume';
import { isTouchOnlyDevice } from '~/utils/touchDevice';

/* 音の作業台（AudioContext）。ゲーム本編と同じ1つを使い回す（→ getEffectAudioContext()） */
import { getSharedAudioContext } from '~/utils/audioContext';

/* 上部ツールバーのサウンド（タイトル画面と同じ部品で、見た目と操作をそろえる） */
import SoundControl from '~/components/game/SoundControl.vue';

import { gameTitle } from '~/data/game';

/* 車のステアリング・ロック画面・イヤホンの操作を受け取り、曲名を知らせる */
import { setMediaSessionPlaybackState, setMediaSessionTrack, startMediaSession } from '~/utils/mediaSession';

/* ============================================================
   サウンドトラックページ（/soundtrack）

   ゲーム本編（pages/index.vue）のBGMとは、わざと作りを分けてある
   ・本編 … 場面に合わせて自動で切り替わる。曲はloopする
   ・ここ … 「▶ 再生」を押した曲だけが鳴る。ふだんはloopしない（「🔁 リピート」のときだけ）
   そのため、本編のBGMの関数（playParkBgm など）は使わず、このページの中だけで完結させている
   ============================================================ */

/* 1曲ぶんの情報
   description … 「|」は、せまい画面で折り返してよい場所のしるし（画面には出ない → splitPhrases）
                 「BGM」のような短い言葉だけが次の行に残らないよう、短い言葉は前の言葉とくっつけておく
   lyrics      … 歌詞（うた入りの曲だけ） */
type SoundtrackTrack = {
  id: number;
  title: string;
  description: string;
  src: string;
  volume: number;
  credit: string;
  lyrics?: LyricLine[];
};

/* 曲の一覧（この順番で画面に出る）

   volume が曲ごとにちがうのは、音源の録音の大きさがちがうため
   本編のBGMより全体に大きめなのは、曲そのものを聴くページだから
   ※ はじめから聴ける曲だけ。ボーナストラックは下に分けてある（あわせたものが tracks） */
const baseTracks: SoundtrackTrack[] = [
  {
    id: 1,
    title: 'こうちゃんの大冒険',
    description: 'はじまりの|BGM',
    src: '/audio/title-bgm.mp3',
    volume: 0.55,
    credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  },
  {
    id: 2,
    title: 'こうえんたんけん',
    description: '公園での|探検BGM 前半',
    src: '/audio/park-bgm.mp3',
    volume: 0.4,
    credit: '音楽生成：Suno',
  },
  {
    id: 3,
    title: 'ひるまえのぼうけん',
    description: '公園での|探検BGM 後半',
    src: '/audio/park-bgm2.mp3',
    volume: 0.4,
    credit: '音楽生成：Suno',
  },
  {
    id: 4,
    title: 'こもれびの奥で',
    description: 'こもれびの広場 BGM',
    src: '/audio/secret-bgm.mp3',
    volume: 0.4,
    credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  },
  {
    id: 5,
    title: 'いやいやタイム！',
    description: 'いやいやタイム|BGM',
    src: '/audio/tantrum-bgm.mp3',
    volume: 0.43,
    credit: '音楽生成：Suno',
  },
  {
    id: 6,
    title: 'きょうの大冒険、おしまい！',
    description: 'リザルト画面|BGM',
    src: '/audio/result-bgm.mp3',
    volume: 0.43,
    credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  },
  {
    id: 7,
    title: 'きょうはここまで',
    description: 'GAME OVER|画面|BGM',
    src: '/audio/game-over-bgm.mp3',
    volume: 0.43,
    credit: '音楽生成：Suno',
  },
];

/* ============================================================
   ボーナストラック（あそんで解放する曲）

   ・08 … 本編で一度でもS+ランクを取ると解放（→ utils/sPlusSong.ts）
   ・09 … ミニゲーム「どこまで行ける？」で300mまで行くと解放（→ utils/secretVocalSong.ts）
   ・10 … 本編の とつぜんのできごとで、テントウムシを見つけると解放
          （ミニゲーム「枝の上のてんとう虫」と同じ条件なので、ミニゲームの解放の記録をそのまま見る → utils/minigameStorage.ts）
   ・11 … ミニゲーム「枝の上のてんとう虫」の「ずっと ここにいて！」で60秒たえると解放（→ utils/ladybugVocalSong.ts）
   保存場所は、それぞれのページと同じものを使う（ずれると「取ったのに聴けない」になるため）

   ■ 「再生できる曲」と「ロック表示」を分けてある
     ・tracks         … 再生できる曲だけ。再生のしくみは、ぜんぶ tracks だけを見る
     ・lockedTrackHints … まだ解放していない曲の「🔒 ？？？」表示（ボタンを持たない、ただの表示）
     こうすれば、再生のしくみのあちこちで「ロック中の曲はとばす」と書かなくてよい
   ============================================================ */
const sPlusBonusTrack: SoundtrackTrack = {
  id: 8,
  title: sPlusSongTitle,
  description: 'S+ランク|特別エンディングBGM',
  src: sPlusSongSrc,
  // 音量と制作情報は、通常版（06）と同じ（通常版にSunoでうたを足したもののため）
  volume: 0.43,
  credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  lyrics: sPlusSongLyrics,
};

/* ミニゲームでずっと流れている曲（04 こもれびの奥で）に、うたを足したもの */
const secretVocalBonusTrack: SoundtrackTrack = {
  id: 9,
  title: secretVocalSongTitle,
  description: 'どこまで行ける？|300m達成の特別BGM',
  src: secretVocalSongSrc,
  // 音量と制作情報は、通常版（04）と同じ
  volume: 0.4,
  credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  lyrics: secretVocalSongLyrics,
};

/* ミニゲーム「枝の上のてんとう虫」のBGM
   08・09 のあとから足した曲なので、番号は 10。一覧でも、08・09 のうしろに出す
   （08・09 の番号を変えると、覚えている続きの曲がずれるため） */
const ladybugDetourTrack: SoundtrackTrack = {
  id: 10,
  title: 'てんとうむしのよりみち',
  description: 'ミニゲーム|枝の上のてんとう虫 BGM',
  src: '/audio/ladybug-detour-bgm.mp3',
  volume: 0.4,
  credit: '原曲：こうちゃんの鼻歌 / 編曲・音楽生成：Suno',
};

/* ミニゲーム「枝の上のてんとう虫」でずっと流れている曲（10 てんとうむしのよりみち）に、うたを足したもの */
const ladybugVocalBonusTrack: SoundtrackTrack = {
  id: 11,
  title: ladybugVocalSongTitle,
  description: 'ずっと ここにいて！|60秒達成の特別BGM',
  src: ladybugVocalSongSrc,
  // 音量と制作情報は、通常版（10）と同じ
  volume: 0.4,
  credit: '原曲：こうちゃんの鼻歌 / 編曲・音楽生成：Suno',
  lyrics: ladybugVocalSongLyrics,
};

/* ボーナストラックを解放済みか（onMounted で localStorage から読む。サーバー側では読めないため） */
const hasUnlockedSPlusSong = ref(false);
const hasUnlockedSecretVocalSong = ref(false);
const hasUnlockedLadybugDetour = ref(false);
const hasUnlockedLadybugVocalSong = ref(false);

/* ミニゲーム「どこまで行ける？」を解放済みか（09 のロック表示の出しわけに使う。てんとう虫のほうは 10 の解放と同じ） */
const hasUnlockedSecretPathMinigame = ref(false);

/* 再生できる曲の一覧（解放したボーナストラックを、番号の順に うしろへ足す）

   ※ 既存の曲の id と順番は変えないので、覚えている開始曲などはくずれない
   ※ 一部だけ解放しているときは、番号がとぶ（07 → 09）。曲ごとの番号が変わらないほうを取っている */
const tracks = computed(() => [
  ...baseTracks,
  ...(hasUnlockedSPlusSong.value ? [sPlusBonusTrack] : []),
  ...(hasUnlockedSecretVocalSong.value ? [secretVocalBonusTrack] : []),
  ...(hasUnlockedLadybugDetour.value ? [ladybugDetourTrack] : []),
  ...(hasUnlockedLadybugVocalSong.value ? [ladybugVocalBonusTrack] : []),
]);

/* まだ解放していない曲のぶんだけ出す、ロック表示の説明（曲名は出さず、解放のしかただけ）

   ミニゲームのご褒美（09・11）は、そのミニゲームを まだ解放していないうちは、ミニゲームの名前を出さない（先のネタばれになるため）
   ・09 … ミニゲームの一覧の「？？？」カードと同じヒント（data/minigames.ts の lockedHint）
   ・11 … 10（てんとう虫を見つける）の先にあることだけを伝える */
const lockedTrackHints = computed(() => {
  const hints: string[] = [];

  if (!hasUnlockedSPlusSong.value) {
    hints.push('S+ランクで解放');
  }

  if (!hasUnlockedSecretVocalSong.value) {
    hints.push(hasUnlockedSecretPathMinigame.value ? 'ミニゲーム|「どこまで行ける？」で|300m達成すると解放' : '公園のどこかに、|秘密の小道があるみたい…');
  }

  if (!hasUnlockedLadybugDetour.value) {
    hints.push('公園で|てんとう虫を見つけると解放');
  }

  if (!hasUnlockedLadybugVocalSong.value) {
    hints.push(hasUnlockedLadybugDetour.value ? 'ミニゲーム|「枝の上のてんとう虫」の|ずっと ここにいて！で|60秒たえると解放' : 'てんとう虫と|もっと仲良くなると解放');
  }

  return hints;
});

/* 説明文を「|」で区切って返す

   区切ったひとつひとつを折り返さないかたまり（.st-phrase）にして、あいだに <wbr> を入れる
   こうしないと、せまい画面で「どこまで行け｜る？」のように言葉のとちゅうで割れてしまう
   ※ word-break: keep-all だけでは、「」」「、」のうしろで折り返されてしまうので足りない */
function splitPhrases(text: string) {
  return text.split('|');
}

/* ============================================================
   再生のしくみ

   いちばん大事なルールは「同時に鳴るのは、いつも1曲だけ」
   そのために、Audioを1つだけ作って使いまわし、曲を変えるときは src を差しかえる
   こうすれば、2曲が重なって鳴ることが仕組みのうえで起こらない
   ============================================================ */

/* 使いまわす、たった1つのAudio
   ※ ここで new Audio() をしない（サーバー側には Audio が無いため。getSoundtrackAudio() で作る） */
let soundtrackAudio: HTMLAudioElement | null = null;

/* いま何回目の再生指示か

   play() の「鳴らせませんでした」という知らせは、あとから遅れて届くことがある
   （連打で次の曲へ切りかえ、前の曲の play() が中断されたときなど）
   その古い知らせで新しい曲の表示を「停止中」に戻さないよう、いちばん新しい指示のときだけ戻す */
let playRequestId = 0;

/* いま選んでいる曲の番号（選んでいないときは null） */
const playingTrackId = ref<number | null>(null);

/* いま音が鳴っているか（一時停止中は playingTrackId を残して、こちらだけ false。続きから再生できるように）
   iPhone が勝手に止めた・鳴らしなおしたときも、Audio の知らせを見てそろえる（→ handleAudioPause / handleAudioPlay） */
const isPlaying = ref(false);

/* いま鳴らしている位置（秒）。再生バーと経過時間の表示に使う */
const currentTime = ref(0);

/* いまの曲の長さ（秒）。mp3を読み込むまでは 0 */
const duration = ref(0);

/* ============================================================
   音量のしくみ（このページだけの設定）

   実際にAudioへ入れる音量 ＝ track.volume × masterVolume
   ・track.volume  … 曲ごとの基準音量（録音の大きさのちがいをそろえる数字。ユーザーにはさわらせない）
   ・masterVolume  … ページ全体の音量つまみ（0〜1）
   こうすると、全体を小さくしても、曲どうしの音量バランスはくずれない
   ============================================================ */

/* ============================================================
   キーボード操作

   ボタンは、ぜんぶ button・input なので、Tab で移動して Enter / Space で押す操作は もともとできる
   そこへ足しているのは、つぎの3つだけ
   ① ページを開いたとき「▶ 全曲再生」にフォーカスを当てる（→ onMounted）
   ② 曲の一覧を、矢印キーで動かせる（→ handleTrackListKeydown）
      ↑↓＝上下の曲へ、←→＝同じ曲の中の操作へ、Home / End＝最初 / 最後の曲へ
   ③ 上の操作エリアと曲の一覧を、画面の位置どおりに矢印キーで動かせる
      （→ handleToolbarKeydown / handlePlayallButtonsKeydown / findPlayallVerticalTarget）

      考えかたは「左の列・右の列」。← → は、ならびの中でとなりへ移るだけ（回り込みはしない）

      ■ 止まっているとき

          [ ← 戻る ]        ←→  [ 🔊 サウンド ]
              ↑↓                     ↑↓
          [ ▶ 全曲再生 ]   ←→  [ 🔀 シャッフル ]
                      ↓
                    曲の一覧（01 ▶ 再生 …）

      ■ 曲を選んでいるとき（一時停止中・サウンドOFFで止まっているときも、こちら）

          [ ← 戻る ]                    [ 🔊 サウンド ]
                   ↓                ↓
                [ ⏸ 一時停止 ／ ▶ 続きから ]
                   ↑↓
          [ ⏮ 前へ ] ←→ [ ⏭ 次へ ]   ←→   [ ■ 停止 ]
                          ↓
                    曲の一覧（01 ▶ 再生 …）

        ・⏸ 一時停止で↑ … ← 戻る　／　↓ … ⏭ 次へ（真下のまんなか。⏮ 前へは ⏭ 次へから←で入る）
        ・前／次／停止で↑ … ⏸ 一時停止　／　↓ … 曲の一覧の01

      曲の一覧から↑で戻るときは、直前に一覧へ入ったボタンへ帰る（→ lastOutsideButton）

   ※ document や window では矢印キーを見張らない（一覧のスクロールや、再生バー・音量バーの操作をじゃましないため）
   ※ 音量スライダー・「🔁 リピート」は、矢印キーの移動先に入れない（スライダーは矢印キーで音量を変えるもののため。Tabで移る）
   ※ Escape は「ⓘ 制作情報」の吹き出しを閉じるだけ。はじめの画面へ戻るのには使わない
   ============================================================ */

/* 矢印キーで直接フォーカスを当てるボタン（出ていないときは null）

   ツールバー（いつも）         … backButtonRef（左） / soundToggleButtonRef（右）
   スターター（止まっているとき）… playAllButtonRef（左） / shuffleButtonRef（右）
   ⏸ 一時停止（再生中だけ）     … playPauseButtonRef（スターターと同じ場所に出る）
   操作行（再生中だけ）         … previousTrackButtonRef・nextTrackButtonRef（左列の下） / stopPlaybackButtonRef（右列の下）

   ※ 操作行は、個別・全曲・シャッフル再生で1つのならびを使いまわすので、同じ ref が2つのボタンに付くことはない */
const backButtonRef = ref<HTMLButtonElement | null>(null);

/* ミュートボタンは SoundControl.vue の中にあるので、コンポーネントごしに借りる（defineExpose で見せている） */
const soundControlRef = ref<InstanceType<typeof SoundControl> | null>(null);
const soundToggleButtonRef = computed<HTMLButtonElement | null>(() => soundControlRef.value?.toggleButton ?? null);
const playAllButtonRef = ref<HTMLButtonElement | null>(null);
const shuffleButtonRef = ref<HTMLButtonElement | null>(null);

/* 再生中にだけ出る「⏸ 一時停止 ／ ▶ 続きから」（▶ 全曲再生・🔀 シャッフル再生と入れかわる） */
const playPauseButtonRef = ref<HTMLButtonElement | null>(null);
const previousTrackButtonRef = ref<HTMLButtonElement | null>(null);
const nextTrackButtonRef = ref<HTMLButtonElement | null>(null);
const stopPlaybackButtonRef = ref<HTMLButtonElement | null>(null);

/* 曲の一覧（<ol class="st-list">）。上のボタンから ↑↓ で一覧へ入るとき、行き先を探すのに使う */
const trackListRef = ref<HTMLElement | null>(null);

/* 曲の一覧のスクロールエリア（ページ全体はのびず、上下に動くのはここだけ）
   スクロール位置を覚えて、次に開いたときに戻すのに使う */
const trackScrollRef = ref<HTMLElement | null>(null);

/* ↑↓ で曲の一覧へ入るとき、どのボタンから入ったか

   一覧のはしで戻るときに、出てきたボタンへ帰るため（行きと帰りで場所がずれると、どこにいるのか分からなくなる）
   ※ そのボタンが画面から消えていたら使わない（→ findOutsidePlayButton） */
let lastOutsideButton: HTMLElement | null = null;

/* ページ全体の音量（0〜1。前に使ったときの音量があれば、onMounted で入れなおす） */
const masterVolume = ref(1);

/* 音量を保存しておく localStorage のキー（ゲーム本編のサウンド設定とは別） */
const masterVolumeStorageKey = 'kouchan-soundtrack-volume';

const masterVolumePercent = computed(() => Math.round(masterVolume.value * 100));

/* その曲を実際に鳴らす音量（音量を入れるところは何か所かあるが、計算はここ1か所にまとめる） */
function getTrackVolume(track: SoundtrackTrack) {
  return track.volume * masterVolume.value;
}

/* ============================================================
   サウンドON/OFF（このページの曲を、まとめて切り替える）

   ゲーム本編にも同じ形のボタンがあるが、保存場所はわざと別にしてある
   本編をOFFにしている人でも、このページでは曲を聴けるようにするため

   ・OFFにしたとき … 鳴っている曲を一時停止するだけ（どこまで聴いたか・全曲再生の途中かは残す）
                    音を消したまま曲だけ進める作りにはしない（聴いていないうちに曲が終わってしまうため）
   ・ONに戻したとき … OFFのせいで止めた曲だけ、続きから鳴らしなおす（自分で一時停止した曲は鳴らさない）
   ・OFFのあいだに「▶ 再生」などを押したとき … ONへ戻してから鳴らす（→ ensureSoundEnabled）
   ============================================================ */

/* いま音を鳴らす設定か（前に使ったときの設定があれば、onMounted で入れなおす） */
const soundEnabled = ref(true);

/* サウンドON/OFFを保存しておく localStorage のキー */
const soundEnabledStorageKey = 'kouchan-soundtrack-sound-enabled';

/* 「OFFにしたせいで止めた曲」があるか（ONに戻したときに、続きから鳴らしてよいかを見分ける） */
let pausedBySoundOff = false;

/* いまのON/OFFを保存する（localStorage には文字しか入らないので 'true' / 'false' で入れる） */
function saveSoundSetting() {
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(soundEnabledStorageKey, String(soundEnabled.value));
  } catch {
    // ブラウザの設定で保存できなくても、開いているあいだのON/OFFは動く
  }
}

/* 「🔊 サウンド ON」「🔊✕ サウンド OFF」のボタンを押したとき
   ※ 決定音は鳴らさない（サントラでは、曲以外の音は出さない） */
function toggleSound() {
  soundEnabled.value = !soundEnabled.value;

  if (soundEnabled.value) {
    if (pausedBySoundOff) {
      resumeAfterSoundOn();
    }
  } else {
    pauseForSoundOff();
  }

  saveSoundSetting();
}

/* OFFにしたときに、鳴っている曲を一時停止する
   表示（選んでいる曲・再生バー・全曲再生の案内）は消さない（ONに戻したときに続きから鳴らせるように） */
function pauseForSoundOff() {
  pausedBySoundOff = false;

  if (!soundtrackAudio || !isPlaying.value) {
    return;
  }

  try {
    pauseElement(soundtrackAudio);
  } catch {
    // 止められなくても、表示だけはそろえる
  }

  isPlaying.value = false;
  pausedBySoundOff = true;

  /* ▶ を押した直後にOFFにすると、その play() から「鳴らせませんでした」が遅れて届くことがある
     それで表示が消されないよう、指示の番号を進めて「もう最新ではない」ことにする（→ playTrackAudio） */
  playRequestId += 1;
}

/* ONに戻したときに、OFFで止めた曲の続きから鳴らす（「■ 停止」などで選択が無くなっていたら何もしない） */
function resumeAfterSoundOn() {
  pausedBySoundOff = false;

  const track = tracks.value.find((item) => item.id === playingTrackId.value);
  const audio = getSoundtrackAudio();

  if (!audio || !track) {
    return;
  }

  // OFFのあいだに音量スライダーを動かしていることもあるので、入れなおす
  try {
    setElementVolume(audio, getTrackVolume(track), getEffectAudioContext);
  } catch {
    // 何もしない
  }

  // currentTime はさわらない（止めたところから続ける）
  playTrackAudio(audio, track);
}

/* 曲を鳴らす前に、サウンドがOFFならONへ戻す

   OFFのまま「▶ 再生」を押して何も起きないと、ボタンがこわれているように見えるため
   ※ ここでは鳴らさない。鳴らすのは呼んだ側 */
function ensureSoundEnabled() {
  if (soundEnabled.value) {
    return;
  }

  soundEnabled.value = true;

  // このあと呼んだ側が鳴らすので、「OFFで止めた曲を続きから」の出番はもう無い
  pausedBySoundOff = false;

  saveSoundSetting();
}

/* ============================================================
   リピート（「🔁 リピート」を押すたびに off → all → one → off … と回る）

   ・off … 1曲だけの再生は、終わったら止まる。全曲再生は、1周したら止まる
   ・all … 全曲再生が1周したら、開始曲へ戻って鳴らし続ける（→ playNextPlaylistTrack）
           1曲だけの再生には効かない
   ・one … いまの曲をずっとくりかえす。Audio の loop を true にするだけ（自分で書くより、つなぎ目がなめらか）
           loop のあいだは ended が来ないので、全曲再生の途中でも次の曲へは進まない
           「⏮ 前」「⏭ 次」を押せば、いつでも となりの曲へ移れる
   ============================================================ */

type RepeatMode = 'off' | 'all' | 'one';

const repeatOrder: RepeatMode[] = ['off', 'all', 'one'];

/* いまのリピートの設定（前に使ったときの設定があれば、onMounted で入れなおす） */
const repeatMode = ref<RepeatMode>('off');

const repeatStorageKey = 'kouchan-soundtrack-repeat';

/* 読み上げソフト用の説明（読み上げでは「押すと次はどうなるか」まで言ったほうが分かりやすい） */
const repeatButtonLabel = computed(() => {
  if (repeatMode.value === 'all') {
    return 'リピート：全曲。押すと1曲リピートになります';
  }

  if (repeatMode.value === 'one') {
    return 'リピート：1曲。押すとリピートなしになります';
  }

  return 'リピート：なし。押すと全曲リピートになります';
});

/* いまのリピートの設定を、Audioへ入れる（設定を変えたとき・曲を鳴らしはじめるときに呼ぶ） */
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

function saveRepeatSetting() {
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(repeatStorageKey, repeatMode.value);
  } catch {
    // 保存できなくても、開いているあいだのリピートは動く
  }
}

/* 「🔁 リピート」を押したとき（決定音は鳴らさない） */
function toggleRepeat() {
  const currentIndex = repeatOrder.indexOf(repeatMode.value);

  repeatMode.value = repeatOrder[(currentIndex + 1) % repeatOrder.length];

  // 鳴らしている途中でも、その場で切りかえる
  applyRepeatToAudio();

  saveRepeatSetting();
}

/* ============================================================
   音の作業台（AudioContext）

   曲の音量調整（setElementVolume）と、バックグラウンド再生（keepAudioContextAwake）で使う
   ※ このページでは、ボタンを押したときの決定音は鳴らさない（曲以外の余計な音は出さない）
   ============================================================ */

/* 作業台は、ゲーム本編と同じ1つを使い回す（→ utils/audioContext.ts）
   このページで作ると、行き来するたびに作業台が増えるうえ、iPhone では作るたびに「プツプツ」と鳴るため
   ページを離れるときは閉じずに、曲を作業台から外すだけにする（→ disposeSoundtrackPlayer()） */
function getEffectAudioContext() {
  return getSharedAudioContext();
}

/* ============================================================
   全曲再生（全曲を1周ぶん、続けて鳴らす）

   ・selectedStartTrackId … どの曲から始めるか（トラック番号を押して選ぶ）
   ・playlistTracks       … 今回の1周ぶんの曲順（例：03開始 → 03 04 05 06 07 01 02）
   ・playlistIndex        … その曲順の何曲目か（0はじまり）

   次の曲へ進むのは、曲が終わったときと「⏭ 次」を押したとき（どちらも playNextPlaylistTrack()）
   「⏮ 前」は、同じ曲順の1つ前へ戻る（→ playPreviousPlaylistTrack()）
   ============================================================ */

const selectedStartTrackId = ref<number>(tracks.value[0].id);

const isPlaylistPlaying = ref(false);

/* その曲順がシャッフルで作ったものか

   通常の全曲再生とシャッフル再生は「曲順の作りかた」だけがちがい、鳴らしかたは同じ
   だから、しくみを2つに分けず、この目印を1つ足すだけにしている（案内の出し分けに使う）
   ※ 全曲再生が終わったら、こちらも かならず false に戻す */
const isShufflePlaying = ref(false);

/* 今回の1周ぶんの曲順
   ※ かならず tracks の「コピー」を入れる（そのまま入れると、並べ替えたときに画面の一覧まで変わる） */
const playlistTracks = ref<SoundtrackTrack[]>([]);

const playlistIndex = ref(0);

/* 操作行の停止ボタンの文字
   すぐ上の案内（♪ 再生中 / ♪ 全曲再生中 / 🔀 シャッフル再生中）と言いかたをそろえる
   ※ 変わるのは文字だけで、押したときの動きは同じ。コメントでは、まとめて「■ 停止」と呼んでいる */
const stopButtonLabel = computed(() => {
  if (!isPlaylistPlaying.value) {
    return '■ 停止';
  }

  return isShufflePlaying.value ? '■ シャッフル再生を停止' : '■ 全曲再生を停止';
});

/* ============================================================
   現在曲の表示

   曲の一覧をスクロールすると、鳴っている曲のカードが隠れてしまうので、
   いつも見えている固定エリアにも「いま何が鳴っているか」を出す
   ============================================================ */

/* いま選んでいる曲（個別再生・全曲再生・シャッフル、一時停止中でも取れる） */
const playingTrack = computed(() => tracks.value.find((track) => track.id === playingTrackId.value) ?? null);

/* 操作行（⏮ 前 ／ ⏭ 次 ／ ■ 停止）を出すか（曲を選んでいるあいだは、聴きかたに関係なく出す）

   isPlaylistPlaying も見るのは、全曲再生の途中で曲が鳴らせなかった（playingTrackId が null に戻った）ときも、
   先へ進んだり止めたりできるようにするため
   テンプレートの v-if と矢印キーの行き先で同じこれを見るので、出ているならびと行き先が食いちがわない */
const hasPlaybackControls = computed(() => playingTrack.value !== null || isPlaylistPlaying.value);

/* 固定エリアに出す「いま何をしているか」（止まっているときは「再生中」と偽らない） */
const playingStatusLabel = computed(() => {
  if (!isPlaying.value) {
    return '⏸ 一時停止中';
  }

  if (isPlaylistPlaying.value) {
    return isShufflePlaying.value ? '🔀 シャッフル再生中' : '♪ 全曲再生中';
  }

  return '♪ 再生中';
});

/* ============================================================
   歌詞（うた入りの曲だけ）

   いま歌っている1行を、現在曲の表示の下に出す（どの行かは、曲の何秒目かで決める）
   ・歌が始まる前は「♪」。一時停止中は、止めたところの行のまま
   ・車の画面・ロック画面には出さない（あちらは曲名のまま）
   ============================================================ */

const playingLyrics = computed(() => playingTrack.value?.lyrics ?? null);

/* いま出している行の番号（-1 … 最初の行より前）
   行が変わったときだけ入れなおす（同じ値を何度も入れて、画面を作りなおさないため） */
const lyricIndex = ref(-1);

const currentLyricText = computed(() => {
  const lyrics = playingLyrics.value;

  if (!lyrics) {
    return null;
  }

  return lyrics[lyricIndex.value]?.text ?? '♪';
});

/* seconds 秒目に出す行の番号（歌詞は time の小さい順に並んでいる） */
function findLyricIndex(lyrics: LyricLine[], seconds: number) {
  let found = -1;

  for (let i = 0; i < lyrics.length; i += 1) {
    if (lyrics[i].time > seconds) {
      break;
    }

    found = i;
  }

  return found;
}

function updateLyricIndex() {
  const lyrics = playingLyrics.value;
  const index = lyrics && soundtrackAudio ? findLyricIndex(lyrics, soundtrackAudio.currentTime) : -1;

  if (index !== lyricIndex.value) {
    lyricIndex.value = index;
  }
}

/* 歌詞のある曲が鳴っているあいだは、画面を描くたび（requestAnimationFrame）に行を見なおす
   timeupdate は1秒に4回くらいなので、それだけだと行の切りかわりが最大0.25秒おくれるため */
let lyricFrameId: number | null = null;

function stopLyricFrame() {
  if (lyricFrameId !== null) {
    cancelAnimationFrame(lyricFrameId);
    lyricFrameId = null;
  }
}

function runLyricFrame() {
  lyricFrameId = null;
  updateLyricIndex();

  if (isPlaying.value && playingLyrics.value) {
    lyricFrameId = requestAnimationFrame(runLyricFrame);
  }
}

// 曲が変わった・鳴りはじめた・止まったら、行を見なおして、細かく見るかどうかを切りかえる
watch([isPlaying, playingLyrics], ([playing, lyrics]) => {
  stopLyricFrame();
  updateLyricIndex();

  if (import.meta.client && playing && lyrics) {
    lyricFrameId = requestAnimationFrame(runLyricFrame);
  }
});

/* ============================================================
   歌詞をぜんぶ見る（YouTube Music の「歌詞」のような画面）

   「歌詞をぜんぶ見る」を押すと、曲の一覧の場所が歌詞の画面に切りかわる
   ・いまの行が上から35%に来るよう、なめらかにスクロールする
   ・手でスクロールしたあと4秒間は、自動ではスクロールしない（読んでいるところを動かさないため）
   ・行を押すと、その行の歌い出しへとぶ
   ・曲の一覧は かくしているだけなので、戻ったときは前に見ていた場所のまま
   ・歌詞の無い曲に変わった・停止したときは、自動で曲の一覧に戻る
   ============================================================ */

const isLyricsView = ref(false);

const lyricsScrollRef = ref<HTMLElement | null>(null);

/* 手でスクロールしたあと、自動スクロールを止めておく長さ（ミリ秒）と、いつまで止めるか */
const lyricsManualScrollPause = 4000;
let lyricsAutoScrollPausedUntil = 0;

function openLyricsView() {
  isLyricsView.value = true;

  // 開いたときは、いまの行へ すぐ合わせる（なめらかに動かさない）
  lyricsAutoScrollPausedUntil = 0;
  nextTick(() => scrollLyricsToCurrent(false));
}

function closeLyricsView() {
  isLyricsView.value = false;

  // 曲の一覧に戻ったら、いまの曲のカードまで1回だけスクロールする（一覧が画面に出てから）
  nextTick(scrollToPlayingTrack);
}

/* 切りかえボタンの名前（押したときの行き先） */
const lyricsToggleLabel = computed(() => (isLyricsView.value ? '曲の一覧にもどる' : '歌詞をぜんぶ見る'));

function toggleLyricsView() {
  if (isLyricsView.value) {
    closeLyricsView();
  } else {
    openLyricsView();
  }
}

/* いまの行が、歌詞の画面の上から35%の所に来るようにスクロールする
   smooth … なめらかに動かすか（動きを減らす設定のときは、いつもすぐ動かす） */
function scrollLyricsToCurrent(smooth: boolean) {
  const box = lyricsScrollRef.value;

  if (!box || Date.now() < lyricsAutoScrollPausedUntil) {
    return;
  }

  // 最初の行より前（-1）は、いちばん上へ
  const line = lyricIndex.value >= 0 ? box.querySelector<HTMLElement>(`[data-lyric-index="${lyricIndex.value}"]`) : null;
  const lineRect = line?.getBoundingClientRect();
  const lineCenter = lineRect ? box.scrollTop + lineRect.top - box.getBoundingClientRect().top + lineRect.height / 2 : 0;
  const top = line ? lineCenter - box.clientHeight * 0.35 : 0;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  box.scrollTo({ top: Math.max(0, top), behavior: smooth && !prefersReducedMotion ? 'smooth' : 'auto' });
}

/* 手でスクロールしたとき（ホイール・指・スクロールバー・キー）は、しばらく自動スクロールを止める
   ※ 自動スクロールでも scroll は来るので、scroll ではなく「手で動かした」知らせだけを見る */
function pauseLyricsAutoScroll() {
  lyricsAutoScrollPausedUntil = Date.now() + lyricsManualScrollPause;
}

/* 行を押したとき：その行の歌い出しへとぶ（一時停止中なら、とぶだけで鳴らしはじめない） */
function seekToLyric(index: number) {
  const line = playingLyrics.value?.[index];

  if (!line || !soundtrackAudio) {
    return;
  }

  try {
    soundtrackAudio.currentTime = line.time;
  } catch {
    return;
  }

  currentTime.value = line.time;
  lyricsAutoScrollPausedUntil = 0;
  updateLyricIndex();
}

// 行が変わったら、歌詞の画面を出しているときだけ、いまの行へスクロールする
watch(lyricIndex, () => {
  if (isLyricsView.value) {
    nextTick(() => scrollLyricsToCurrent(true));
  }
});

// 歌詞の無い曲に変わった・停止したら、曲の一覧に戻す
watch(playingLyrics, (lyrics) => {
  if (!lyrics) {
    closeLyricsView();
  }
});


/* 制作情報（ⓘ）の吹き出し

   ① openedCreditTrackId          … クリック（タップ）して開いたままにしているトラック（同時に1つだけ）
   ② suppressedCreditHoverTrackId … 閉じたばかりなので、マウスを乗せていても出さないトラック
      同じⓘをクリックして閉じても、マウスはⓘの上にあるので、CSSのhoverですぐまた出てしまうため
      ⓘからマウス・フォーカスが離れたら忘れる
   ※ マウスを乗せただけの表示はCSSにまかせる */
const openedCreditTrackId = ref<number | null>(null);
const suppressedCreditHoverTrackId = ref<number | null>(null);

/* 曲が何秒目まで進んだか（再生中は1秒に4回くらい呼ばれる） */
function handleTimeUpdate() {
  if (!soundtrackAudio) {
    return;
  }

  currentTime.value = soundtrackAudio.currentTime;

  // 一時停止中に再生バーを動かしたときも、歌詞の行を合わせる
  updateLyricIndex();

  // どこまで聴いたかを覚えておく（1秒に1回まで → saveLastPlayState）
  saveLastPlayState();
}

/* 曲の長さが分かったとき
   duration は読み込みが終わるまで NaN のことがあり、そのまま入れると再生バーが動かないので、数字のときだけ入れる */
function handleLoadedMetadata() {
  if (!soundtrackAudio) {
    return;
  }

  const length = soundtrackAudio.duration;

  duration.value = Number.isFinite(length) ? length : 0;

  // 前回の続きの位置を入れる（曲の長さが分かる前には入れられないブラウザがあるため。入るのは1回だけ）
  applyPendingStartTime(soundtrackAudio, playingTrackId.value);
}

/* 曲が最後まで流れきったとき（「🔁 リピート 1曲」のときは loop なので、ここへは来ない） */
function handleTrackEnded() {
  /* 「曲が終わった」と「別の曲のボタンを押した」がほぼ同時のとき、この知らせだけ遅れて届くことがある
     そのまま進めると、新しい曲が鳴っているのに表示が「停止中」になるので、ほんとうに終わったときだけ進む */
  if (soundtrackAudio && !soundtrackAudio.ended) {
    return;
  }

  /* 全曲再生の途中なら、次の曲へ
     ボタン用の playNextTrack() は通さない（個別再生のときは となりの曲へ移ってしまうが、
     自然に終わって次へ進むのは、全曲再生・シャッフル再生だけにしたいため） */
  if (isPlaylistPlaying.value) {
    playNextPlaylistTrack();

    return;
  }

  // 1曲だけの再生は、そこで停止（自動で次の曲へは進めない。続けて聴きたいときは全曲再生を使う）
  playingTrackId.value = null;
  isPlaying.value = false;
}

/* ============================================================
   このページの外で、曲が止められた・鳴らしなおされたとき（handleAudioPause / handleAudioPlay）

   iPhone は、車の Bluetooth・イヤホンが外れたとき・電話がかかってきたときなどに、曲を勝手に一時停止する
   （電話が終わったあとは、勝手に続きから鳴らしなおすこともある）
   このページは、自分で止めた・鳴らしたときにしか isPlaying を書きかえないので、
   そのままだと、止まっているのに画面は「⏸ 一時停止」「♪ 再生中」のまま残ってしまう
   そうなると、ロック画面の ▶ を押しても「もう鳴っている」として何もせず（→ handleMediaSessionPlay）、
   画面のボタンも1回目は「一時停止」として働くので、続きから鳴らせなかった
   そこで、Audio の pause・play の知らせを見て、表示を実際の音にそろえる

   ※ このページが自分で止めた・鳴らしたときは、先に isPlaying をそろえているので、ここでは何もしない
   ※ 曲が最後まで流れきったときの pause は、handleTrackEnded() にまかせる（ended で見分ける）
   ============================================================ */

/* 曲が止められたとき */
function handleAudioPause() {
  const audio = soundtrackAudio;

  // 曲の差しかえの途中などで、もう鳴りなおしているときは、さわらない
  if (!audio || audio.ended || !audio.paused || !isPlaying.value) {
    return;
  }

  isPlaying.value = false;

  /* ▶ を押した直後に止められると、その play() から「鳴らせませんでした」が遅れて届くことがある
     それで選んでいる曲まで消されないよう、指示の番号を進めて「もう最新ではない」ことにする（→ playTrackAudio） */
  playRequestId += 1;
}

/* 曲が鳴らしなおされたとき */
function handleAudioPlay() {
  const audio = soundtrackAudio;

  // 自分で止めている途中（音量を下げている最中）は、もうすぐ止まるので、さわらない（→ isElementPlaying()）
  if (!audio || !isElementPlaying(audio) || isPlaying.value || playingTrackId.value === null) {
    return;
  }

  isPlaying.value = true;
}

/* 使いまわすAudioを用意して返す（初めて必要になったときだけ作る） */
function getSoundtrackAudio() {
  if (!import.meta.client) {
    return null;
  }

  /* ページを離れはじめたあとは、もう作らない（→ disposeSoundtrackPlayer()）
     消えかけのページでキーボードの ▶ を押されて、ゲームの画面でもサントラの曲が残る、ということを防ぐ */
  if (isPlayerDisposed) {
    return null;
  }

  try {
    if (!soundtrackAudio) {
      soundtrackAudio = new Audio();

      /* ふだんは loop しない（1曲を最初から最後まで聴くページなので）
         鳴らすたびに入れなおすので（→ applyRepeatToAudio）、ここは最初の状態を決めているだけ */
      soundtrackAudio.loop = repeatMode.value === 'one';

      soundtrackAudio.addEventListener('ended', handleTrackEnded);
      soundtrackAudio.addEventListener('timeupdate', handleTimeUpdate);
      soundtrackAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
      soundtrackAudio.addEventListener('pause', handleAudioPause);
      soundtrackAudio.addEventListener('play', handleAudioPlay);
    }

    return soundtrackAudio;
  } catch {
    // 音が使えない環境でも、ページは普通に開けるようにする
    return null;
  }
}

/* いまの曲を止めて、track へ差しかえ、先頭から鳴らす

   iPhone・iPad では、いきなり止めると「ぶつっ」と鳴るので、音量を下げきってから差しかえる（→ pauseElementThen()）
   ・差しかえが遅れるのは、iPhone・iPad で鳴っている最中だけ（約0.1秒）
   ・止めている途中に連打されたときは、最後に押した曲だけへ差しかわる
   Audioは1つなので、「止める → 差しかえる → 鳴らす」の順番を守れば、2曲が同時に鳴ることは起こらない */
function switchTrackAudio(audio: HTMLAudioElement, track: SoundtrackTrack) {
  pauseElementThen(audio, () => {
    try {
      audio.src = track.src;
      setElementVolume(audio, getTrackVolume(track), getEffectAudioContext);
      audio.currentTime = 0;
    } catch {
      // 何もしない
    }

    playTrackAudio(audio, track);
  });
}

/* 曲を鳴らしはじめる（どこから鳴らしはじめても、かならずここを通る。再生できなかったときは、表示を停止中へ戻す） */
function playTrackAudio(audio: HTMLAudioElement, track: SoundtrackTrack) {
  applyRepeatToAudio(audio);

  // 前回の続きの位置が、まだ入っていなければ入れる（開いてすぐ「▶ 続きから」を押されたとき）
  applyPendingStartTime(audio, track.id);

  playRequestId += 1;

  const requestId = playRequestId;

  playingTrackId.value = track.id;
  isPlaying.value = true;

  try {
    // 止めている途中なら、その予約を取り消してから鳴らす
    cancelElementPause(audio);

    /* 作業台が止まっていたら起こす（iPhone は、車の Bluetooth が外れたときなどに、作業台も止めてしまう）
       画面のボタンなら、さわったときに起きるが、ロック画面・車・イヤホンの ▶ では起きないため（→ wakeElementAudioContext()） */
    wakeElementAudioContext(audio);

    audio.play().catch(() => {
      // 再生できなかったときは表示を戻す（待っているあいだに別の曲へ切りかわっていたら、そちらは消さない）
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

/* 鳴っている曲を完全に止めて、表示も止まった状態に戻す（操作行の「■ 停止」）

   個別再生・全曲再生・シャッフル再生のどれでも、この1つを使う
   （個別再生のときに全曲再生の覚えごとまで戻しても困らないので、別の関数は作っていない）
   ※ ページを離れるときには使わない（表示が先に消えて、画面がバタバタして見えるため → disposeSoundtrackPlayer()） */
function stopSoundtrack() {
  if (soundtrackAudio) {
    try {
      pauseElement(soundtrackAudio, { rewind: true });
    } catch {
      // 止められなくても、表示だけはそろえる
    }
  }

  playingTrackId.value = null;
  isPlaying.value = false;
  isPlaylistPlaying.value = false;

  // 次に全曲再生・シャッフル再生を始めたときは、かならず曲順から作り直されるようにする
  isShufflePlaying.value = false;
  playlistTracks.value = [];
  playlistIndex.value = 0;

  currentTime.value = 0;

  /* 操作行ごと画面から消えるので、「▶ 全曲再生」へフォーカスを移す（フォーカスが無くなったときだけ）
     マウス・タッチで押したときは、ブラウザがふつう :focus-visible の枠を出さない */
  focusAfterPlaylistChange(playAllButtonRef);
}

/* もうタイトル画面へ移動しはじめたか（連打よけ） */
let isLeavingPage = false;

/* ============================================================
   このページを離れるときに、サントラの再生をまるごと終わらせる（disposeSoundtrackPlayer）

   サントラは、iPhone で画面を消しても鳴りつづけ、ロック画面から操作できるようにしている
   離れたらそれをぜんぶ終わらせて、ゲームの画面でロックしたときに ▶ が残らないようにする
   （止めるだけだと、iPhone は「まだ音楽プレーヤーがある」とみなすので、Audioを消音して曲を外し、手放す）

   ■ やること（この順番が大事）
     ① いまの状態を覚える（止めると再生位置が0秒に戻るので、かならず止める前）
     ② ロック画面・車・イヤホンの操作の受付をやめる（止めている約0.1秒のあいだに押されても呼ばれないように）
     ③ 曲をすっと止めて、Audioを消音して曲を外し、作業台から外す（→ releaseElement()）
        消音するのは、iPhone が消音した Audio をロック画面に出さないため（曲を外すだけでは ▶ が残る）
     ④ 外し終わったら、ロック画面の曲名・再生状態をもう一度「なし」にする
        （鳴っている途中だと、iPhone が曲名なしで知らせなおすことがあるため）
     ⑤ 外し終わったら、「画面を消しても鳴らしつづける」設定を元に戻す
        （鳴っている途中で戻すと、iPhone が音の出しかたを切りかえるときに「ブツッ」と鳴るため
          外し終わるのは約0.1秒後で、次のページが出る（約0.18秒後）より先に終わる）

   ■ 呼ぶところ
     ・onBeforeRouteLeave … 「← 戻る」でも、ブラウザの戻る（左はしからのスワイプ）でも通る
     ・onUnmounted         … 念のため（2回目からは何もしないので、二重には走らない）

   ※ 表示（再生中・再生バー・操作行）は、さわらない（消えるまでの一瞬に、画面がバタバタして見えるため）
   ※ ゲーム本編の BGM・効果音、共用の作業台にはさわらない
   ============================================================ */

/* もう後始末を済ませたか（済ませたあとは、新しいAudioも作らない → getSoundtrackAudio()） */
let isPlayerDisposed = false;

function disposeSoundtrackPlayer() {
  if (isPlayerDisposed) {
    return;
  }

  isPlayerDisposed = true;

  // ①
  fixLastState();

  // ②
  stopMediaSession?.();
  stopMediaSession = null;

  const audio = soundtrackAudio;
  soundtrackAudio = null;

  const finishDisposal = () => {
    // ④
    setMediaSessionTrack(null);
    setMediaSessionPlaybackState('none');

    // ⑤
    stopWakingAudioContext?.();
    stopWakingAudioContext = null;
  };

  // 一度も鳴らしていない（Audioを作っていない）ときは、仕上げだけ
  if (!audio) {
    finishDisposal();
    return;
  }

  audio.removeEventListener('ended', handleTrackEnded);
  audio.removeEventListener('timeupdate', handleTimeUpdate);
  audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
  audio.removeEventListener('pause', handleAudioPause);
  audio.removeEventListener('play', handleAudioPlay);

  // ③
  try {
    pauseElement(audio, { rewind: true });
  } catch {
    // 止められなくても、このあと曲を外すので鳴りつづけない
  }

  releaseElement(audio, finishDisposal);
}

onBeforeRouteLeave(() => {
  disposeSoundtrackPlayer();
});

/* ============================================================
   前回の続きから聴けるようにする（曲・再生位置・一覧のスクロール位置を覚える）

   ・戻すのは「一時停止のかたち」まで
     ユーザーがまださわっていないページでは、ブラウザが勝手に音を鳴らさせないので、
     鳴らすのは「▶ 続きから」を押してもらってから
   ・全曲再生・シャッフル再生の途中なら、その曲順と何曲目かも覚える（続きから鳴らせば、覚えた曲順で進む）
   ・歌詞の画面を出したまま離れたときは、また歌詞の画面で開く
   ・読み書きはブラウザの中だけ（onMounted より後）なので、サーバー側の画面と食いちがわない

   ■ 覚えるタイミング
     ・曲が進んでいるあいだ … 1秒に1回まで
     ・曲・再生/一時停止・全曲再生の状態が変わったとき … 下の watch
     ・ページを離れるとき … disposeSoundtrackPlayer()（止める前に最後の1回）
     「■ 停止」を押したときは、覚えごとも消す（止めた人に、次もまた同じ曲を見せないため）

   ■ 一覧のスクロール位置と「再生中の曲への自動追従」がけんかしないように
     開いた直後は、覚えていたスクロール位置を優先して、自動追従を1回だけ止める（→ skipNextPlayingTrackScroll）
     戻した曲を「▶ 続きから」で鳴らしはじめたときに、1回だけ追従する（→ scrollAfterRestoreOnPlay）
   ============================================================ */

/* 前回の曲と再生位置を覚えておく localStorage のキー

   ・1曲だけの再生 … {"id":3,"time":42.5}
   ・全曲再生の途中 … {"id":3,"time":42.5,"playlist":{"shuffle":false,"ids":[1,2,3,4],"index":2}}
   ・歌詞の画面     … {"id":8,"time":42.5,"lyrics":true}
   ※ playlist が無い前のかたちのメモも、「1曲だけの再生」として読める */
const lastPlayStorageKey = 'kouchan-soundtrack-last-play';

/* 曲の一覧のスクロール位置（上からの距離 px）を覚えておく localStorage のキー */
const trackScrollStorageKey = 'kouchan-soundtrack-list-scroll';

/* 最後に覚えた時刻（ミリ秒。覚える回数をしぼるため） */
let lastPlayStateSavedAt = 0;
let trackScrollSavedAt = 0;

/* もう覚えごとを書きかえないか（ページを離れるときに true）
   音を止める後始末（currentTime = 0）で「0秒から」と書きかえてしまわないようにするため */
let isLastStateFixed = false;

/* あとで入れる「続きの位置」（秒）と、その曲の番号

   曲の長さが分かる前に currentTime を入れても、効かないブラウザがあるので、ここに置いておき
   曲の長さが分かったとき・鳴らしはじめるときの早いほうで、1回だけ入れる
   曲の番号もいっしょに覚えるのは、別の曲を押されたときに、新しい曲が とちゅうから鳴らないようにするため */
let pendingStartTime: number | null = null;
let pendingStartTrackId: number | null = null;

/* 次に「曲が切りかわった」ときの自動追従を、1回だけ止めるか（開いた直後に曲を戻したときだけ true） */
let skipNextPlayingTrackScroll = false;

/* 戻した曲を鳴らしはじめたときに、1回だけ自動追従するか */
let scrollAfterRestoreOnPlay = false;

/* 覚えておいた「続きの位置」を、Audioへ入れる（入れられるのは1回だけ） */
function applyPendingStartTime(audio: HTMLAudioElement, trackId: number | null) {
  if (pendingStartTime === null) {
    return;
  }

  const seconds = pendingStartTime;
  const targetTrackId = pendingStartTrackId;

  pendingStartTime = null;
  pendingStartTrackId = null;

  // 覚えていた曲ではなくなっていたら、入れずに捨てる（新しい曲は先頭から鳴る）
  if (trackId !== targetTrackId) {
    return;
  }

  try {
    audio.currentTime = seconds;
  } catch {
    // 読み込む前は受けつけないブラウザもあるので、覚えなおして、あとでもう一度入れる
    pendingStartTime = seconds;
    pendingStartTrackId = targetTrackId;

    return;
  }

  currentTime.value = seconds;
}

/* いまの曲と再生位置を覚えておく
   force … 1秒に1回の制限をかけずに、かならず覚える（最後の1回を取りこぼさないため） */
function saveLastPlayState(force = false) {
  if (!import.meta.client || isLastStateFixed) {
    return;
  }

  // 続きの位置を入れる前（読み込み中）は覚えない（入れる前の0秒で上書きしてしまうため）
  if (pendingStartTime !== null) {
    return;
  }

  const now = Date.now();

  if (!force && now - lastPlayStateSavedAt < 1000) {
    return;
  }

  lastPlayStateSavedAt = now;

  try {
    // どの曲も選んでいないとき（「■ 停止」・曲が終わったとき）は、覚えごとを消す
    if (playingTrackId.value === null) {
      localStorage.removeItem(lastPlayStorageKey);

      return;
    }

    const playlist = isPlaylistPlaying.value
      ? {
          shuffle: isShufflePlaying.value,
          ids: playlistTracks.value.map((item) => item.id),
          index: playlistIndex.value,
        }
      : undefined;

    const lyrics = isLyricsView.value ? true : undefined;

    localStorage.setItem(lastPlayStorageKey, JSON.stringify({ id: playingTrackId.value, time: Math.max(0, currentTime.value), playlist, lyrics }));
  } catch {
    // 覚えられなくても、開いているあいだの再生はふつうに動く
  }
}

/* 曲の一覧のスクロール位置を覚えておく（force の意味は saveLastPlayState と同じ） */
function saveTrackScroll(force = false) {
  if (!import.meta.client || isLastStateFixed) {
    return;
  }

  /* 歌詞の画面を出しているあいだは覚えない
     かくれた一覧（display: none）の scrollTop は 0 なので、前に見ていた場所を 0 で上書きしてしまうため */
  if (isLyricsView.value) {
    return;
  }

  const scrollArea = trackScrollRef.value;

  if (!scrollArea) {
    return;
  }

  const now = Date.now();

  if (!force && now - trackScrollSavedAt < 500) {
    return;
  }

  trackScrollSavedAt = now;

  try {
    localStorage.setItem(trackScrollStorageKey, String(Math.round(scrollArea.scrollTop)));
  } catch {
    // 覚えられなくても、スクロールそのものはふつうに動く
  }
}

function handleTrackScroll() {
  saveTrackScroll();
}

/* ページを離れるときに、最後の状態を覚えて、それ以上は書きかえないようにする（かならず音を止める前に呼ぶ） */
function fixLastState() {
  saveLastPlayState(true);
  saveTrackScroll(true);

  isLastStateFixed = true;
}

/* 覚えておいた「全曲再生・シャッフル再生の途中」を戻す

   playlist が無い・こわれている・曲順の中に playingTrack がいないときは、戻さない（1曲だけの再生としてあつかう）
   もう一覧に無い曲（解放していないボーナストラックなど）は曲順から外すので、
   何曲目かは、覚えていた index ではなく作り直した曲順から探しなおす */
function restorePlaylist(playlist: unknown, playingTrack: SoundtrackTrack) {
  if (typeof playlist !== 'object' || playlist === null) {
    return;
  }

  const { shuffle, ids } = playlist as { shuffle?: unknown; ids?: unknown };

  if (!Array.isArray(ids)) {
    return;
  }

  const orderedTracks = ids
    .map((savedId) => (typeof savedId === 'number' ? tracks.value.find((item) => item.id === savedId) : undefined))
    .filter((item): item is SoundtrackTrack => item !== undefined);

  const index = orderedTracks.findIndex((item) => item.id === playingTrack.id);

  if (index === -1) {
    return;
  }

  playlistTracks.value = orderedTracks;
  playlistIndex.value = index;
  isPlaylistPlaying.value = true;
  isShufflePlaying.value = shuffle === true;
}

/* 前回の曲と再生位置を思い出して、一時停止のかたちで戻す（音は鳴らさない）
   覚えごとが無い・こわれている・もう一覧に無い曲だったときは、何もしない */
function restoreLastPlayState() {
  if (!import.meta.client) {
    return;
  }

  let saved: unknown = null;

  try {
    const text = localStorage.getItem(lastPlayStorageKey);

    saved = text === null ? null : JSON.parse(text);
  } catch {
    return;
  }

  if (typeof saved !== 'object' || saved === null) {
    return;
  }

  const { id, time, playlist, lyrics } = saved as { id?: unknown; time?: unknown; playlist?: unknown; lyrics?: unknown };
  const track = typeof id === 'number' ? tracks.value.find((item) => item.id === id) : undefined;

  if (!track) {
    return;
  }

  const seconds = typeof time === 'number' && Number.isFinite(time) && time > 0 ? time : 0;
  const audio = getSoundtrackAudio();

  if (!audio) {
    return;
  }

  // 覚えていたスクロール位置を優先するため、曲を戻したことで動く自動追従を1回だけ止める
  skipNextPlayingTrackScroll = true;
  scrollAfterRestoreOnPlay = true;

  playingTrackId.value = track.id;
  isPlaying.value = false;
  currentTime.value = seconds;
  duration.value = 0;

  restorePlaylist(playlist, track);

  if (lyrics === true && track.lyrics) {
    openLyricsView();
  }

  try {
    // 開いただけで曲まるごと（数MB）を読み込ませない（長さと続きの位置に必要なところだけ）
    audio.preload = 'metadata';
    audio.src = track.src;
    setElementVolume(audio, getTrackVolume(track), getEffectAudioContext);
  } catch {
    // 用意できなくても、曲を選んだ表示のままにしておく（押せば先頭から鳴る）
  }

  pendingStartTime = seconds > 0 ? seconds : null;
  pendingStartTrackId = seconds > 0 ? track.id : null;

  applyPendingStartTime(audio, track.id);
}

/* 覚えておいた、曲の一覧のスクロール位置に戻す
   一覧のカードがぜんぶ並んだあと（nextTick のあと）に呼ぶ（短いうちに戻すと、そこまで動けないため） */
function restoreTrackScroll() {
  const scrollArea = trackScrollRef.value;

  if (!import.meta.client || !scrollArea) {
    return;
  }

  try {
    const saved = Number(localStorage.getItem(trackScrollStorageKey));

    if (!Number.isFinite(saved) || saved <= 0) {
      return;
    }

    // なめらかには動かさない（開いたとたんに動いて見えると落ち着かないため）
    scrollArea.scrollTop = saved;
  } catch {
    // 戻せなくても、いちばん上から読めるだけ
  }
}

/* 状態が変わったら、そのたびに覚えておく
   全曲再生の状態まで見るのは、曲は同じまま「全曲再生をやめて1曲だけの再生になる」ときも覚えなおすため */
watch([playingTrackId, isPlaying, isPlaylistPlaying, isShufflePlaying, playlistIndex, isLyricsView], () => {
  saveLastPlayState(true);
});

/* 戻した曲を鳴らしはじめたときだけ、その曲のカードまで1回スクロールする
   （ふだんの「一時停止 → 続きから」では動かさない。見ている場所を奪わないため） */
watch(isPlaying, (playing) => {
  if (!playing || !scrollAfterRestoreOnPlay) {
    return;
  }

  scrollAfterRestoreOnPlay = false;

  nextTick(scrollToPlayingTrack);
});

/* トラック番号を押したとき、その曲を「全曲再生の開始曲」にする（ここでは鳴らさない） */
function selectStartTrack(track: SoundtrackTrack) {
  selectedStartTrackId.value = track.id;
}

/* ⓘ（制作情報）の吹き出しを開け閉めする（表示だけで、再生には影響しない）
   ・同じⓘをもう一度押したら閉じて、「閉じたばかり」を覚える（マウスが乗ったままでも、すぐ出てこないように）
   ・別のⓘを押したら、そちらだけを開く */
function toggleCredit(trackId: number) {
  if (openedCreditTrackId.value === trackId) {
    openedCreditTrackId.value = null;
    suppressedCreditHoverTrackId.value = trackId;

    return;
  }

  openedCreditTrackId.value = trackId;
  suppressedCreditHoverTrackId.value = null;
}

/* 「閉じたばかりなので出さない」を忘れる（ⓘからマウス・指が離れたとき、フォーカスが外れたとき）
   フォーカスも見るのは、キーボードだけで操作している人はマウスを離さないため */
function releaseCreditHoverSuppression(trackId: number) {
  if (suppressedCreditHoverTrackId.value === trackId) {
    suppressedCreditHoverTrackId.value = null;
  }
}

/* ⓘ・吹き出し以外の場所が押されたとき、開いたままの吹き出しを閉じる
   preventDefault も stopPropagation もしないので、押した先のボタン本来の処理もふつうに動く */
function handleOutsideCreditPointerDown(event: PointerEvent) {
  const target = event.target;

  // ⓘ や吹き出しの中を押したときは、ⓘ の @click（toggleCredit）にまかせる
  if (target instanceof Element && target.closest('.track__info')) {
    return;
  }

  openedCreditTrackId.value = null;
  suppressedCreditHoverTrackId.value = null;
}

/* ============================================================
   曲順をシャッフルする（Fisher-Yates シャッフル）

   ・渡された配列（tracks）は、ぜったいに書きかえない（コピーだけを並べかえて返す）
     tracks そのものを並べかえると、画面の曲一覧の順番まで変わってしまうため
   ・うしろの席から順に、「先頭からその席まで」の中からくじで選んだ1つと入れかえる
     こうすると、どの並びも同じ確率で出る
   ・list.sort(() => Math.random() - 0.5) は使わない（並びにかたよりが出るうえ、元の配列を書きかえるため）
============================================================ */
function shuffleTracks(list: SoundtrackTrack[]) {
  const shuffled = [...list];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    // 0 から i までの中から、くじで1つ選ぶ
    const j = Math.floor(Math.random() * (i + 1));

    const keep = shuffled[i];

    shuffled[i] = shuffled[j];
    shuffled[j] = keep;
  }

  return shuffled;
}

/* 全曲再生を始める（「▶ 全曲再生」も「🔀 シャッフル再生」も、ここを通る）

   2つのちがいは、渡す曲順（orderedTracks）の作りかただけで、そのあとの鳴らしかたは同じ
   orderedTracks … 今回の1周ぶんの曲順（かならず tracks のコピー）
   shuffled      … その曲順がシャッフルで作ったものか */
function beginPlaylist(orderedTracks: SoundtrackTrack[], shuffled: boolean) {
  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    return;
  }

  if (orderedTracks.length === 0) {
    return;
  }

  // 前の曲順はここで捨てられるので、通常再生とシャッフルを押しかえても、前の曲順は残らない
  playlistTracks.value = orderedTracks;
  playlistIndex.value = 0;
  isPlaylistPlaying.value = true;
  isShufflePlaying.value = shuffled;

  /* 「どのボタンから一覧へ入ったか」を忘れる
     上のボタンのならびが変わるので、前の覚えのままだと、一覧から↑で戻るときに操作行を飛びこしてしまう */
  lastOutsideButton = null;

  const firstTrack = playlistTracks.value[playlistIndex.value];

  currentTime.value = 0;
  duration.value = 0;

  switchTrackAudio(audio, firstTrack);

  /* 押したボタンは消えて、同じ場所に「⏸ 一時停止」が出るので、そちらへフォーカスを移す
     （キーボードで押したなら、そのまま Enter で止められる。移すのは、フォーカスが行き場を失ったときだけ） */
  focusAfterPlaylistChange(playPauseButtonRef);
}

/* 「▶ 全曲再生」を押したとき（開始曲から1周ぶんの曲順を作る）
   例）03開始 → [03, 04, 05, 06, 07] ＋ [01, 02] */
function startPlaylist() {
  const startIndex = tracks.value.findIndex((track) => track.id === selectedStartTrackId.value);
  const begin = startIndex >= 0 ? startIndex : 0;

  beginPlaylist([...tracks.value.slice(begin), ...tracks.value.slice(0, begin)], false);
}

/* 「🔀 シャッフル再生」を押したとき

   ・順番は始めるときに1回だけ決める（次へ進むたびにくじを引くと、同じ曲が2回鳴ったり、鳴らない曲が出たりするため）
   ・開始曲（selectedStartTrackId）は使わない（どの曲から始まるかも、シャッフルにまかせる） */
function startShufflePlaylist() {
  beginPlaylist(shuffleTracks(tracks.value), true);
}

/* 全曲再生を終わりにする（1周鳴らし終えたとき・最後の曲で「⏭ 次」を押したとき）
   曲順も空にするので、次に始めるときは作りなおす（開始曲の選択は残る） */
function finishPlaylist() {
  if (soundtrackAudio) {
    try {
      pauseElement(soundtrackAudio, { rewind: true });
    } catch {
      // 止められなくても、表示だけはそろえる
    }
  }

  playingTrackId.value = null;
  isPlaying.value = false;
  isPlaylistPlaying.value = false;
  isShufflePlaying.value = false;

  playlistTracks.value = [];
  playlistIndex.value = 0;

  currentTime.value = 0;
  duration.value = 0;

  // 「▶ 全曲再生」に戻るので、そちらへフォーカスを移す
  focusAfterPlaylistChange(playAllButtonRef);
}

/* 全曲再生中に、次の曲へ進む（曲が終わったとき・「⏭ 次」を押したとき）

   曲順（playlistTracks）は作りなおさず、playlistIndex を1つ進めるだけ
   1周鳴らし終えたら、「🔁 リピート 全曲」なら先頭へ戻り、それ以外は終わり（「前」とちがい、回りこませない）
   ※ 個別再生の「⏭ 次」は、ここを通らない（→ playAdjacentSingleTrack） */
function playNextPlaylistTrack() {
  if (!isPlaylistPlaying.value) {
    return;
  }

  const isLastTrack = playlistIndex.value >= playlistTracks.value.length - 1;

  if (isLastTrack && repeatMode.value !== 'all') {
    finishPlaylist();

    return;
  }

  const nextIndex = isLastTrack ? 0 : playlistIndex.value + 1;

  playPlaylistTrackAt(nextIndex);
}

/* 全曲再生中に、1つ前の曲へ戻る（「⏮ 前」を押したときだけ）

   ・戻る先は、画面の一覧ではなく、今回の曲順の1つ前（シャッフルでも、作った順番のまま）
   ・くじは引きなおさない（引きなおすと、さっき聴いていた曲へ戻れなくなるため）
   ・曲順の先頭で押したときは、最後へ回りこむ（はっきり「前へ」と押した操作なので、行き止まりにはしない） */
function playPreviousPlaylistTrack() {
  if (!isPlaylistPlaying.value) {
    return;
  }

  if (playlistTracks.value.length === 0) {
    return;
  }

  const previousIndex = playlistIndex.value - 1 < 0 ? playlistTracks.value.length - 1 : playlistIndex.value - 1;

  playPlaylistTrackAt(previousIndex);
}

/* 全曲再生の曲順の index 番目の曲へ切りかえて、先頭から鳴らす（「前」「次」で共通） */
function playPlaylistTrackAt(index: number) {
  // サウンドOFFのときに「前」「次」を押されたら、ONへ戻してから鳴らす
  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    finishPlaylist();

    return;
  }

  // 先に「何曲目か」を入れかえる（「2 / 7」の表示のまま音だけ別の曲になる、ということが起きないように）
  playlistIndex.value = index;

  const track = playlistTracks.value[index];

  // 前の曲の長さが残っていると再生バーの目盛りがずれるので、0 に戻して読み込みを待つ
  currentTime.value = 0;
  duration.value = 0;

  // 一時停止中に押したときも、ここで鳴りはじめる（どこまで聴いたかは覚えない）
  switchTrackAudio(audio, track);
}

/* 「▶ 再生」「⏸ 一時停止」を押したとき

   ① 同じ曲を押したとき … 再生中なら一時停止、一時停止中なら続きから
                         全曲再生モードのままにする（一時停止中も「⏭ 次」を使えるように）
   ② ちがう曲を押したとき … 全曲再生モードから抜けて、その曲を1曲だけ先頭から鳴らす */
function toggleTrack(track: SoundtrackTrack) {
  // サウンドOFFのときに押されたら、ONへ戻してから鳴らす（OFFのあいだ、ボタンは「▶ 続きから」になっている）
  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    return;
  }

  // ①
  if (playingTrackId.value === track.id) {
    if (isPlaying.value) {
      try {
        pauseElement(audio);
      } catch {
        // 何もしない
      }

      isPlaying.value = false;
    } else {
      // currentTime はさわらない（止めたところから続ける）
      playTrackAudio(audio, track);
    }

    return;
  }

  // ②
  playSingleTrackFromStart(audio, track);
}

/* 1曲だけの再生として、ちがう曲へ切りかえて、先頭から鳴らす
   （一覧でちがう曲の「▶ 再生」を押したとき・個別再生中の「⏮ 前」「⏭ 次」）

   ※ ensureSoundEnabled と getSoundtrackAudio は、呼ぶ側で先にすませる
   ※ 曲順（playlistTracks）は空にしない（全曲再生中でなければ使われず、次に始めるときに作り直されるため） */
function playSingleTrackFromStart(audio: HTMLAudioElement, track: SoundtrackTrack) {
  isPlaylistPlaying.value = false;
  isShufflePlaying.value = false;

  // 前の曲の長さが残っていると再生バーの目盛りがずれるので、0 に戻して読み込みを待つ
  currentTime.value = 0;
  duration.value = 0;

  switchTrackAudio(audio, track);
}

/* ============================================================
   個別再生中の「⏮ 前」「⏭ 次」（画面の一覧で、となりの曲へ）

   ・曲順は画面の一覧（tracks）。はしでは回りこむ（01で前 → 最後の曲、最後の曲で次 → 01）
   ・全曲再生用の playNextPlaylistTrack() などは使わない
     あちらは全曲再生の曲順（playlistTracks）で行き先を決めるので、個別再生で使うと、
     画面の並びとちがう曲へ飛んだり、「1周が終わった」として止まったりするため
   ・押しても全曲再生モードには入らない。移った曲は、かならず先頭から鳴る
   ・手で押したときだけ動く（個別再生の曲が終わっても、自動で次へは進めない）
   ============================================================ */
function playAdjacentSingleTrack(direction: 'previous' | 'next') {
  if (isPlaylistPlaying.value) {
    return;
  }

  const currentIndex = tracks.value.findIndex((track) => track.id === playingTrackId.value);

  if (currentIndex < 0) {
    return;
  }

  // tracks.length を足してから % を取るので、はしで回りこむ（曲数はじかに書かない）
  const step = direction === 'next' ? 1 : -1;
  const adjacentIndex = (currentIndex + step + tracks.value.length) % tracks.value.length;
  const adjacentTrack = tracks.value[adjacentIndex];

  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    return;
  }

  playSingleTrackFromStart(audio, adjacentTrack);
}

/* ============================================================
   操作行の「⏮ 前」「⏭ 次」を押したとき

   どの聴きかたでも [ ⏮ 前 ] [ ⏭ 次 ] [ ■ 停止 ] を同じ場所に出し、押したときの中身だけを呼び分ける
   （聴きかたを変えるたびに、ボタンを探さなくてよいように）
   ・全曲再生・シャッフル再生 … 今回の曲順で前後する（→ playPreviousPlaylistTrack / playNextPlaylistTrack）
   ・個別再生                 … 画面の一覧で、となりの曲へ（→ playAdjacentSingleTrack）
   ※ 曲が自然に終わったときは、ここを通らない（通すと、個別再生でも自動で次へ進んでしまうため）
   ============================================================ */
function playPreviousTrack() {
  if (isPlaylistPlaying.value) {
    playPreviousPlaylistTrack();

    return;
  }

  playAdjacentSingleTrack('previous');
}

function playNextTrack() {
  if (isPlaylistPlaying.value) {
    playNextPlaylistTrack();

    return;
  }

  playAdjacentSingleTrack('next');
}

/* ============================================================
   いまの曲の「⏸ 一時停止 ／ ▶ 続きから」（操作エリアの大きなボタン）

   曲のカードにしか止めるボタンが無いと、一覧をスクロールしたときや歌詞の画面で止めにくいので、
   いつも見えている操作エリアにも置く
   曲を選んでいるあいだは、「▶ 全曲再生」「🔀 シャッフル再生」の場所をこのボタンにゆずる
   押したときの中身は、曲のカードのボタンと同じ（→ toggleTrack）
   ============================================================ */

const playPauseLabel = computed(() => (isPlaying.value ? '⏸ 一時停止' : '▶ 続きから'));

function togglePlayback() {
  const track = playingTrack.value;

  // どの曲も選んでいないときは、このボタン自体が出ていないが、念のため
  if (!track) {
    return;
  }

  toggleTrack(track);
}

/* ============================================================
   車のステアリング・ロック画面・イヤホンの操作（Media Session API → utils/mediaSession.ts）

   ・受け取った操作は、画面のボタンと同じ関数へつなぐ
     次の曲 → playNextTrack()、前の曲 → playPreviousTrack()、停止 → stopSoundtrack()
     再生・一時停止 → toggleTrack()（曲を選んでいないときの再生は「▶ 全曲再生」）
     ※ 再生・一時停止も受け取るのは、ブラウザにまかせると、画面の表示が実際の音と食いちがうため
   ・ロック画面・車の画面に、いまの曲名（アーティストはゲームの題名）を知らせる
   ・受付を始めるのは onMounted、やめるのはページを離れるとき（→ disposeSoundtrackPlayer()）
   ============================================================ */

/* 操作の受付をやめるための関数（受付していないときは null） */
let stopMediaSession: (() => void) | null = null;

/* 再生（どの曲も選んでいないときは、全曲再生を始める） */
function handleMediaSessionPlay() {
  const track = playingTrack.value;

  if (!track) {
    startPlaylist();

    return;
  }

  if (!isPlaying.value) {
    toggleTrack(track);
  }
}

/* 一時停止（鳴っていないときは何もしない） */
function handleMediaSessionPause() {
  const track = playingTrack.value;

  if (track && isPlaying.value) {
    toggleTrack(track);
  }
}

watch(playingTrack, (track) => {
  setMediaSessionTrack(track ? { title: track.title, artist: gameTitle, album: 'ORIGINAL SOUNDTRACK' } : null);
});

watch([playingTrack, isPlaying], ([track, playing]) => {
  setMediaSessionPlaybackState(!track ? 'none' : playing ? 'playing' : 'paused');
});

/* 再生バーを動かして、聴く場所を変える（一時停止中は、鳴らしはじめずに場所だけ変える） */
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

  currentTime.value = seconds;
}

/* 音量スライダー（0〜100）を動かして、全体の音量を変える
   音量を入れかえるだけで、pause・play・src の差しかえはしない（再生中に動かしても、曲は止まらない） */
function changeMasterVolume(event: Event) {
  const slider = event.target as HTMLInputElement;
  const percent = Number(slider.value);

  if (!Number.isFinite(percent)) {
    return;
  }

  masterVolume.value = percent / 100;

  // いま選んでいる曲（再生中・一時停止中）があれば、その場で音量だけ変える
  const playingTrack = tracks.value.find((track) => track.id === playingTrackId.value);

  if (soundtrackAudio && playingTrack) {
    try {
      setElementVolume(soundtrackAudio, getTrackVolume(playingTrack), getEffectAudioContext);
    } catch {
      // 何もしない（次に曲を鳴らすときに、あらためて設定される）
    }
  }

  try {
    localStorage.setItem(masterVolumeStorageKey, String(masterVolumePercent.value));
  } catch {
    // 保存できなくても、開いているあいだの音量調整は動く
  }
}

/* 再生バーの「聴き終わったところ」の割合（0〜100）
   Chrome・Safari にはバーの左側だけ色を変える機能が無いので、CSSのグラデーションで塗り分けるのに使う */
function seekPercent() {
  if (duration.value <= 0) {
    return 0;
  }

  return (currentTime.value / duration.value) * 100;
}

/* 秒数を「2:05」のような表示に直す */
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const whole = Math.floor(seconds);
  const minutePart = Math.floor(whole / 60);
  const secondPart = whole % 60;

  return minutePart + ':' + String(secondPart).padStart(2, '0');
}

function isTrackPlaying(track: SoundtrackTrack) {
  return playingTrackId.value === track.id && isPlaying.value;
}

/* 読み上げソフト用の説明文（「▶」「⏸」だけでは何のボタンか分からないので、曲名を入れる） */
function trackButtonLabel(track: SoundtrackTrack) {
  return isTrackPlaying(track) ? `${track.title}を一時停止` : `${track.title}を再生`;
}

function formatTrackNumber(id: number) {
  return String(id).padStart(2, '0');
}

/* いま鳴っている曲のカードまで、曲の一覧をスクロールする

   ・動かすのは、曲が切りかわって鳴りはじめたときと、歌詞の画面から一覧に戻ったときの1回だけ
     （聴いているあいだに一覧を読んでいる人の、見ている場所を奪わないため）
   ・block: 'nearest' … すでに見えていればほとんど動かず、見切れているぶんだけ動く（'center' だと大きく動く）
   ・scrollIntoView は、いちばん近いスクロールする箱（曲の一覧）を動かすので、固定エリアまでは動かない
   ※ フォーカスは移さない（急にキーボードの操作位置が飛ぶと分かりにくいため） */
function scrollToPlayingTrack() {
  // 歌詞の画面を出しているあいだは、一覧がかくれているので何もしない（一覧に戻ったときに動かす）
  if (playingTrackId.value === null || isLyricsView.value) {
    return;
  }

  const list = trackListRef.value;

  if (!list) {
    return;
  }

  const card = list.querySelector<HTMLElement>(`[data-track-id="${playingTrackId.value}"]`);

  if (!card) {
    return;
  }

  // 動きを減らす設定のときは、なめらかな動きをやめてすぐ移動する
  const prefersReducedMotion = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  card.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'nearest',
  });
}

// 曲が切りかわったら、1回だけその曲のカードまでスクロールする（一時停止・再開では動かない）
watch(playingTrackId, (trackId, previousTrackId) => {
  if (trackId === null || trackId === previousTrackId) {
    return;
  }

  // 開いた直後に前回の曲を戻したときは、覚えていたスクロール位置を優先して、ここでは動かさない
  if (skipNextPlayingTrackScroll) {
    skipNextPlayingTrackScroll = false;

    return;
  }

  // ふつうに切りかわったので、戻した曲を鳴らしたときの追従はもう要らない
  scrollAfterRestoreOnPlay = false;

  nextTick(scrollToPlayingTrack);
});

/* ============================================================
   曲の一覧のキーボード操作（ゲームのメニューのように動かす）

   曲のカードを「3列 × 曲数」のマス目として考える

     [ 01 ] [ ⓘ ] [ ▶ 再生 ]     （番号 … track__no ／ ⓘ … track__infoBtn ／ ▶ 再生 … track__button）
     [ 02 ] [ ⓘ ] [ ▶ 再生 ]
       …

   ↑ ↓        同じ列のまま上下の曲へ（はしでは回りこむ。「▶ 再生」の列だけは上の操作ボタンも輪に入れる）
   ← →        同じ曲の中で、番号 ↔ ▶ 再生 を行き来する（ⓘ は入れない）
   Home / End  同じ列のまま、最初の曲 / 最後の曲へ
   Escape      開いている制作情報の吹き出しを閉じる（それだけ）

   ※ Enter / Space は受け取らない（ブラウザにまかせる。.click() を呼ぶと二重に動くため）
   ※ 再生バーの上では、矢印キーも Home / End も横取りしない（再生位置を動かす、ブラウザ本来の操作のため）
   ※ 見張りは <ol class="st-list"> の1か所だけ（キーはボタンから ol まで伝わってくるため）
   ============================================================ */

const trackButtonClasses = ['track__no', 'track__infoBtn', 'track__button'];

/* ← → で行き来するボタン（ⓘ は入れない → findHorizontalTarget） */
const trackRowMoveClasses = trackButtonClasses.filter((name) => name !== 'track__infoBtn');

/* 曲の一覧で受け取るキー（これ以外は、ブラウザにまかせる） */
const trackListMoveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

function handleTrackListKeydown(event: KeyboardEvent) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  /* Escape は、開いている制作情報を閉じるだけ
     再生を止めたり、はじめの画面へ戻ったりはしない
     （吹き出しを閉じるつもりで2回押したときに、聴いていた曲が止まってページごと移動してしまうため） */
  if (event.key === 'Escape') {
    if (openedCreditTrackId.value !== null) {
      openedCreditTrackId.value = null;
    }

    return;
  }

  if (!trackListMoveKeys.includes(event.key)) {
    return;
  }

  if (target.closest('input[type="range"]')) {
    return;
  }

  const buttonClass = trackButtonClasses.find((name) => target.classList.contains(name));

  if (!buttonClass) {
    return;
  }

  const list = event.currentTarget as HTMLElement;
  const cards = Array.from(list.querySelectorAll<HTMLElement>('.track'));
  const currentIndex = cards.findIndex((card) => card.contains(target));

  if (currentIndex < 0) {
    return;
  }

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

  // キーボードでⓘから離れるときは、吹き出しも閉じる（吹き出しだけが取り残されないように）
  if (buttonClass === 'track__infoBtn') {
    openedCreditTrackId.value = null;
  }

  /* 矢印キー本来のスクロールは止める
     行き先が見えていないときは、focus() にともなうブラウザのスクロールにまかせる（scrollIntoView は呼ばない） */
  event.preventDefault();
  nextButton.focus();
}

/* ← → の行き先 … 同じ曲の中で、番号 ↔ ▶ 再生 を行き来する（はしでは回りこむ）

   ⓘは「聴く」操作ではなく説明を見るためのものなので、← → の道すじからは外してある（Tab と ↑↓ で行ける）
   ※ ⓘを選んでいるときだけは、行き止まりにならないよう、→ で「▶ 再生」、← で番号へ出る */
function findHorizontalTarget(key: string, card: HTMLElement, buttonClass: string) {
  const step = key === 'ArrowRight' ? 1 : -1;

  if (buttonClass === 'track__infoBtn') {
    const exitClass = step === 1 ? 'track__button' : 'track__no';

    return card.querySelector<HTMLElement>('.' + exitClass);
  }

  const columnIndex = trackRowMoveClasses.indexOf(buttonClass);
  const nextIndex = (columnIndex + step + trackRowMoveClasses.length) % trackRowMoveClasses.length;

  return card.querySelector<HTMLElement>('.' + trackRowMoveClasses[nextIndex]);
}

/* Home / End の行き先 … 同じ列のまま、最初の曲 / 最後の曲へ
   （「▶ 全曲再生」は入れない。行き先をはっきりさせるため） */
function findEdgeTarget(key: string, cards: HTMLElement[], buttonClass: string) {
  const card = key === 'Home' ? cards[0] : cards[cards.length - 1];

  return card.querySelector<HTMLElement>('.' + buttonClass);
}

/* ↑ ↓ の行き先 … 同じ列のまま、上下の曲へ（はしでは回りこむ）

   「▶ 再生」の列だけは、一覧のはしから出たときに、上の操作ボタンへ移る（→ findOutsidePlayButton）
     ▶ 全曲再生 → 01 ▶ 再生 → … → 最後の曲 ▶ 再生 → ▶ 全曲再生
   いちばん使う列なので、上の操作ボタンと行き来できるようにしている
   番号とⓘの列は、役わりがちがうので、一覧の中だけで回る */
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

/* 曲の一覧から ↑↓ で出るときの行き先

   ① 直前に一覧へ入ったボタンが、まだ画面にあれば、そこへ帰る
      ただし、スターター（▶ 全曲再生／🔀 シャッフル）の覚えは、操作行が出ているあいだは使わない
      （止まっていたときの古い覚えなので、そのまま帰すと、あいだの操作行を飛びこしてしまう）
   ② 覚えが無いとき（Tabで一覧に来たときなど）
      再生中は「⏭ 次」、止まっているときは「▶ 全曲再生」へ */
function findOutsidePlayButton() {
  if (lastOutsideButton) {
    const isStarterButton = lastOutsideButton === playAllButtonRef.value || lastOutsideButton === shuffleButtonRef.value;
    const isStaleStarter = isStarterButton && hasPlaybackControls.value;

    if (lastOutsideButton.isConnected && !isStaleStarter) {
      return lastOutsideButton;
    }

    lastOutsideButton = null;
  }

  // まだ操作行が画面に出ていない切りかわりの一瞬だけは、「▶ 全曲再生」へ逃がす
  if (hasPlaybackControls.value) {
    return nextTrackButtonRef.value ?? playAllButtonRef.value;
  }

  return playAllButtonRef.value;
}

/* 曲の一覧のいちばん上（↓）・いちばん下（↑）の「▶ 再生」（一覧の外から入るときに使う） */
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

/* スターター・⏸ 一時停止・操作行で ↑↓ を押したときの行き先（画面の位置どおりに、上下の段をたどる）

   ・スターター（止まっているとき）… ↑ 同じ列のツールバー ／ ↓ 曲の一覧の01
   ・⏸ 一時停止                   … ↑ ← 戻る ／ ↓ ⏭ 次（真下のまんなか）
   ・操作行（前／次／停止）        … ↑ ⏸ 一時停止 ／ ↓ 曲の一覧の01
   操作行が出ているかは hasPlaybackControls で見る（テンプレートの v-if と同じなので、食いちがわない） */
function findPlayallVerticalTarget(key: string, row: HTMLElement, button: HTMLElement) {
  if (row.classList.contains('st-playall__transport')) {
    return key === 'ArrowUp' ? backButtonRef.value : nextTrackButtonRef.value;
  }

  const isStarterRow = row.classList.contains('st-playall__starters');

  if (isStarterRow) {
    const isPlayAll = button === playAllButtonRef.value;

    if (key === 'ArrowUp') {
      return isPlayAll ? backButtonRef.value : soundToggleButtonRef.value;
    }

    // 再生中はスターターが出ていないので、ふだんは通らない
    if (hasPlaybackControls.value) {
      return isPlayAll ? nextTrackButtonRef.value : stopPlaybackButtonRef.value;
    }

    return findListPlayButton(key);
  }

  // ここからは操作行
  if (key === 'ArrowUp') {
    return playPauseButtonRef.value;
  }

  return findListPlayButton(key);
}

/* 上部ツールバー（← 戻る ／ 🔊 サウンド）のキーボード操作

   ・← → … 戻る ↔ サウンド（回り込みなし）
   ・↓   … 同じ列のスターターへ（曲を選んでいるあいだは「⏸ 一時停止」へ）
   ・↑   … いちばん上の段なので、何もしない
   ※ 実際にフォーカスを移すときだけ preventDefault する */
function handleToolbarKeydown(event: KeyboardEvent) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const onBack = Boolean(target.closest('.st-back'));
  // ミュートボタンだけを見る（となりの音量バーの ← → は、音量を変える操作に使うため）
  const onSound = Boolean(target.closest('.sound-toggle'));

  if (!onBack && !onSound) {
    return;
  }

  let nextButton: HTMLElement | null = null;

  if (event.key === 'ArrowRight') {
    if (onBack) {
      nextButton = soundToggleButtonRef.value;
    }
  } else if (event.key === 'ArrowLeft') {
    if (onSound) {
      nextButton = backButtonRef.value;
    }
  } else if (event.key === 'ArrowDown') {
    if (hasPlaybackControls.value) {
      nextButton = playPauseButtonRef.value;
    } else {
      nextButton = onBack ? playAllButtonRef.value : shuffleButtonRef.value;
    }
  } else {
    return;
  }

  if (!nextButton) {
    return;
  }

  event.preventDefault();
  nextButton.focus();
}

/* スターター・⏸ 一時停止・操作行の「ボタンのならび」のキーボード操作（どのならびも、この関数で動かす）

   ・← → … 同じならびの中で、となりのボタンへ（回り込みなし。ボタンを数えて動くので、ならびの長さによらない）
   ・↑ ↓ … 上の段・下の段・曲の一覧のあいだをたどる（→ findPlayallVerticalTarget）
   ※ 音量スライダーへは、矢印キーでは移らない（Tabで移る） */
function handlePlayallButtonsKeydown(event: KeyboardEvent) {
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
    const targetIndex = currentIndex + step;

    if (targetIndex >= 0 && targetIndex < buttons.length) {
      nextButton = buttons[targetIndex];
    }
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    nextButton = findPlayallVerticalTarget(event.key, row, buttons[currentIndex]);
  } else {
    return;
  }

  if (!nextButton) {
    return;
  }

  // 曲の一覧へ入るときだけ、どのボタンから入ったかを覚える（一覧から↑で戻るときの帰り先 → findOutsidePlayButton）
  if (trackListRef.value?.contains(nextButton)) {
    lastOutsideButton = buttons[currentIndex];
  }

  event.preventDefault();
  nextButton.focus();
}

/* ボタンが入れかわって、選んでいたボタンが消えたとき、button へフォーカスを移す

   消えたままだとフォーカスがどこにも無くなり、キーボードだけの人は、またTabで探すことになるため
   ※ どこにもフォーカスが無いときだけ移す（ユーザーが別のボタンを選んでいるなら、じゃまをしない） */
async function focusAfterPlaylistChange(button: Ref<HTMLButtonElement | null>) {
  // ボタンが入れかわるのを待ってから
  await nextTick();

  if (document.activeElement && document.activeElement !== document.body) {
    return;
  }

  button.value?.focus();
}

/* 「← 戻る」（上部ツールバーの左のボタン）

   ここでやるのは、タイトル画面へ移ることだけ
   曲を止めるのは onBeforeRouteLeave（→ disposeSoundtrackPlayer()）にまかせる
   （ブラウザの戻るで出ていったときも同じところを通るので、止めかたが1つにそろう）
   ※ stopSoundtrack() は呼ばない（表示が先に消えて、画面がバタバタして見えるため）
   ※ ページの入れかわりのフェード中に続けて押されても、移動のお願いは1回だけ（isLeavingPage）
   ※ 決定音は鳴らさない（引き返すだけのボタンなので。ゲーム本編・ミニゲームの「戻る」も同じ） */
async function goToTitle() {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  await navigateTo('/');
}

/* さわるたびに作業台を起こす受付を、やめるための関数（受付していないときは null）
   （iPhone で、画面を消して戻ったあとの曲が無音にならないようにするため → utils/elementVolume.ts） */
let stopWakingAudioContext: (() => void) | null = null;

onMounted(() => {
  // ⓘ・吹き出し以外が押されたら、開いたままの吹き出しを閉じる
  document.addEventListener('pointerdown', handleOutsideCreditPointerDown);

  /* backgroundPlayback … 曲を聴くページなので、iPhone で画面を消しても・ほかのアプリへ切りかえても鳴りつづける
     （ゲーム本編・ミニゲームは止まる。やめるのはページを離れるとき → disposeSoundtrackPlayer()） */
  stopWakingAudioContext = keepAudioContextAwake(getEffectAudioContext, { backgroundPlayback: true });

  stopMediaSession = startMediaSession({
    play: handleMediaSessionPlay,
    pause: handleMediaSessionPause,
    stop: stopSoundtrack,
    previousTrack: playPreviousTrack,
    nextTrack: playNextTrack,
  });

  // キーボードだけでも、開いてすぐ Enter で全曲再生を始められるように
  playAllButtonRef.value?.focus();

  // 前に使ったときのリピートの設定（知らない文字が入っていたら、「なし」のまま）
  try {
    const savedRepeat = localStorage.getItem(repeatStorageKey);

    if (savedRepeat === 'off' || savedRepeat === 'all' || savedRepeat === 'one') {
      repeatMode.value = savedRepeat;
    }
  } catch {
    // 読み込めなくても、「リピートなし」でふつうに聴ける
  }

  // 前に使ったときのサウンドON/OFF（保存が無い・こわれているときは、ONのまま）
  try {
    const savedSound = localStorage.getItem(soundEnabledStorageKey);

    if (savedSound === 'false') {
      soundEnabled.value = false;
    } else if (savedSound === 'true') {
      soundEnabled.value = true;
    }
  } catch {
    // 読み込めなくても、ONでふつうに聴ける
  }

  // 前に使ったときの音量（保存が無い・数字でないときは100％のまま。0〜100 からはみ出していたら、おさめる）
  try {
    const savedVolume = localStorage.getItem(masterVolumeStorageKey);
    const savedPercent = Number(savedVolume);

    if (savedVolume !== null && Number.isFinite(savedPercent)) {
      const percent = Math.min(100, Math.max(0, Math.round(savedPercent)));

      /* スマホ・タブレットでは、前回の音量は戻さず、いつも100%で始める
         スマホには音量スライダーが無い（ミュートボタンだけ）ので、前に下げた音量が残ると、もう上げられないため */
      masterVolume.value = isTouchOnlyDevice() ? 1 : percent / 100;
    }
  } catch {
    // 読み込めなくても、100％でふつうに聴ける
  }

  /* ボーナストラックを解放済みか（サーバー側では読めないので、ブラウザで動くここで読む）
     解放の条件を、曲を足す前に もう達成していた人もいるので、保存してある記録から判定できるものは、ここで黙って解放済みにする（知らせは出さない）
     ・08 … S+ランクを取ったという記録は、解放の保存そのものしか無いので、それを読むだけ
     ・09 … 「どこまで行ける？」の自己ベストが 300m 以上なら解放
     ・10 … ミニゲーム「枝の上のてんとう虫」の解放の記録を読む
     ・11 … 「枝の上のてんとう虫」のエンドレスの自己ベストが 60秒以上なら解放 */
  hasUnlockedSPlusSong.value = loadHasUnlockedSPlusSong();
  hasUnlockedSecretVocalSong.value = unlockSecretVocalSongFromSavedBest();
  hasUnlockedLadybugDetour.value = loadUnlockedMinigames().includes('ladybug-balance');
  hasUnlockedSecretPathMinigame.value = loadUnlockedMinigames().includes('secret-path');
  hasUnlockedLadybugVocalSong.value = unlockLadybugVocalSongFromSavedBest();

  /* 前回の曲・再生位置と、曲の一覧のスクロール位置を戻す（順番が大事）
     ① ボーナストラックの解放（すぐ上）… ここで一覧に何曲あるかが決まる
     ② 前回の曲を戻す                  … もう一覧に無い曲なら、戻さない
     ③ nextTick のあとにスクロール位置を戻す … 増えた曲のカードが並びおわってからでないと、そこまで動けないため */
  restoreLastPlayState();

  // 前回の曲を戻したときは、「▶ 全曲再生」のかわりに出る「▶ 続きから」へフォーカスを移す
  if (hasPlaybackControls.value) {
    focusAfterPlaylistChange(playPauseButtonRef);
  }

  nextTick(() => {
    restoreTrackScroll();

    // 曲を戻せなかったときに、自動追従を止めるしるしだけが残らないように
    skipNextPlayingTrackScroll = false;
  });
});

/* 画面が消えたあとの後始末（サントラの再生は、ふつうは onBeforeRouteLeave で終わっている） */
onUnmounted(() => {
  disposeSoundtrackPlayer();

  document.removeEventListener('pointerdown', handleOutsideCreditPointerDown);

  stopLyricFrame();
});
</script>

<template>
  <main class="soundtrack" :class="{ 'soundtrack--playing': hasPlaybackControls, 'soundtrack--lyricsView': isLyricsView }">
    <!-- soundtrack--playing   … 曲を選んでいるあいだ。見出しをかくして、曲の一覧・歌詞の画面を広くする
         soundtrack--lyricsView … 歌詞の画面を出しているあいだ。曲の一覧のための案内をかくす

         ※ このコメントを <main> の外に書かないこと
           開発中（nuxt dev）はコメントも残るので、ページのいちばん外が2つになり、ページを移るときのフェードがこわれて、
           「← 戻る」を押したときに、移った先がまっ暗のままになる（ミニゲームのページにも同じ注意書きがある） -->
    <!-- ============================================================
         画面に残る操作エリア（st-fixedArea）

         画面を上と下の2つに分けている
         ・上（この箱）         … 戻る・サウンド・見出し・全曲再生・前へ・次へ・停止・リピート
         ・下（st-trackScroll） … 曲の一覧。ここだけが上下にスクロールする
         曲をどこまで下へ見ていても、操作が画面から消えないようにするため
         ============================================================ -->
    <div class="st-fixedArea">
      <!-- ============================================================
           上部ツールバー（← 戻る ／ 🔊 ミュートボタン ＋ 音量バー）

           ・いつでもすぐ押せるように、戻るボタンはいちばん上に置く（一覧の下だと、曲が増えるほど遠くなるため）
           ・サウンドはページ全体の設定なので、いつも見えるここに置く（ゲーム本編と同じ「左に戻る、右にサウンド」）
           ・Escape キーでは戻らない（吹き出しを閉じるつもりで押しすぎたときに、曲が止まってページごと移動してしまうため）
           ・ページを開いたときのフォーカスは「▶ 全曲再生」（このページの主役は曲を聴くことなので）
           ============================================================ -->
      <div class="st-toolbar" @keydown="handleToolbarKeydown">
        <button ref="backButtonRef" type="button" class="st-back" aria-label="はじめの画面へ戻る" @click="goToTitle">
          <span aria-hidden="true">← 戻る</span>
        </button>

        <!-- タイトル画面と同じ部品（ミュートボタン → toggleSound ／ 音量バー → changeMasterVolume）
             ※ ゲーム本編とちがい、サウンドON/OFFと音量は別々の設定（音量を0%にしても、ミュートにはならない） -->
        <SoundControl
          ref="soundControlRef"
          :sound-enabled="soundEnabled"
          :sound-volume-percent="masterVolumePercent"
          @toggle="toggleSound"
          @volume-change="changeMasterVolume" />
      </div>

      <header class="st-head">
        <p class="st-head__badge">ORIGINAL SOUNDTRACK</p>

        <h1 class="st-head__name">{{ gameTitle }}</h1>
      </header>

      <!-- ============================================================
           全曲再生

           ・▶ 全曲再生     … 開始曲から、一覧の順番で1周（開始曲は、一覧のトラック番号を押して選ぶ）
           ・🔀 シャッフル再生 … ランダムな順番で1周（画面の一覧の順番は変わらない）
           曲を選んでいるあいだは、聴きかたに関係なく、操作行（⏮ 前 ／ ⏭ 次 ／ ■ 停止）が出る
           ============================================================ -->
      <section class="st-playall" :class="{ 'st-playall--active': hasPlaybackControls }">
        <!-- 聴きはじめるときに1回押すだけのボタンなので、曲を選んでいるあいだは「⏸ 一時停止」に場所をゆずる
             ※ 開始曲の案内はここに出さない（一覧の番号の色で分かるので、目で追う場所を増やさない） -->
        <div v-if="!hasPlaybackControls" class="st-playall__starters" @keydown="handlePlayallButtonsKeydown">
          <button ref="playAllButtonRef" type="button" class="st-playall__button" @click="startPlaylist">▶ 全曲再生</button>

          <!-- 「シャッフル」だけでは分かりにくいので、読み上げでは「全曲を鳴らす」ことまで伝える -->
          <button ref="shuffleButtonRef" type="button" class="st-playall__button st-playall__button--shuffle" aria-label="曲順をランダムに並べかえて全曲再生する" @click="startShufflePlaylist">
            🔀 シャッフル再生
          </button>
        </div>

        <!-- いまの曲の「⏸ 一時停止 ／ ▶ 続きから」（→ togglePlayback）
             入れかわる2つと同じ高さの1段なので、再生を始めても操作エリアの高さは変わらない（一覧がガタつかない） -->
        <div v-else class="st-playall__transport" @keydown="handlePlayallButtonsKeydown">
          <button ref="playPauseButtonRef" type="button" class="st-playall__button st-playall__button--toggle" :class="{ 'st-playall__button--pause': isPlaying }" @click="togglePlayback">
            {{ playPauseLabel }}
          </button>
        </div>

        <p v-if="!hasPlaybackControls" class="st-playall__hint">
          番号を押すと、全曲再生を始める曲を選べます
        </p>

        <!-- いま鳴っている曲の表示（曲の一覧をスクロールしても見えるように、ここにも出す）
             aria-live … 曲が変わったこと・一時停止したことを、読み上げソフトにも知らせる -->
        <p v-if="playingTrack" class="st-playall__status" aria-live="polite">
          <!-- シャッフル再生中は紺色、それ以外（一時停止中もふくむ）は金色 -->
          <span class="st-playall__badge" :class="{ 'st-playall__badge--shuffle': isShufflePlaying && isPlaying }">
            {{ playingStatusLabel }}
          </span>

          <span v-if="isPlaylistPlaying" class="st-playall__count">{{ playlistIndex + 1 }} / {{ playlistTracks.length }}</span>

          <span class="st-playall__track">{{ formatTrackNumber(playingTrack.id) }} {{ playingTrack.title }}</span>

          <!-- 歌詞の画面 ⇄ 曲の一覧 の切りかえ（うた入りの曲だけ）
               行き先のアイコンに2文字の名前を添える（マイクのアイコンだけだと「録音」に見えて分かりにくかったため） -->
          <button
            v-if="playingLyrics"
            type="button"
            class="st-lyricsToggle"
            :aria-label="lyricsToggleLabel"
            :title="lyricsToggleLabel"
            :aria-pressed="isLyricsView"
            @click="toggleLyricsView">
            <svg v-if="!isLyricsView" class="st-lyricsToggle__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 3.5h11a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4a2.5 2.5 0 0 1-2.5-2.5V6a2.5 2.5 0 0 1 2.5-2.5z" />
              <path d="M8 8h8M8 11.5h5" />
            </svg>
            <svg v-else class="st-lyricsToggle__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6h11M9 12h11M9 18h11" />
              <circle cx="4.5" cy="6" r="1.2" />
              <circle cx="4.5" cy="12" r="1.2" />
              <circle cx="4.5" cy="18" r="1.2" />
            </svg>
            <span class="st-lyricsToggle__label" aria-hidden="true">{{ isLyricsView ? '一覧' : '歌詞' }}</span>
          </button>
        </p>

        <!-- いま歌っている1行（key … 行が変わるたびに、ふわっと出なおす）
             ・読み上げソフトには、行が変わるたびには知らせない（数秒ごとに割りこむと、ほかの操作のじゃまになるため）
             ・歌詞の画面を出しているあいだは、下に同じ歌詞が出ているので出さない -->
        <p v-if="currentLyricText !== null && !isLyricsView" class="st-lyrics">
          <span :key="lyricIndex" class="st-lyrics__line">{{ currentLyricText }}</span>
        </p>

        <!-- 操作行（⏮ 前 ／ ⏭ 次 ／ ■ 停止）
             押したときの中身は、聴きかたで切りかわる（→ playPreviousTrack / playNextTrack / stopSoundtrack）
             文字は、PCでは長い文字（__labelLong）、スマホ幅では短い文字（__labelShort）にして1段にならべる
             （読み上げソフトには、どちらの幅でも aria-label の長い名前を伝える） -->
        <div v-if="hasPlaybackControls" class="st-playall__actions" @keydown="handlePlayallButtonsKeydown">
          <button ref="previousTrackButtonRef" type="button" class="st-playall__button st-playall__button--previous" aria-label="1つ前のトラックを先頭から再生する" @click="playPreviousTrack">
            <span class="st-playall__labelLong">⏮ 前のトラックへ</span>
            <span class="st-playall__labelShort">⏮ 前へ</span>
          </button>

          <button ref="nextTrackButtonRef" type="button" class="st-playall__button st-playall__button--next" aria-label="現在の曲を飛ばして次のトラックを再生する" @click="playNextTrack">
            <span class="st-playall__labelLong">⏭ 次のトラックへ</span>
            <span class="st-playall__labelShort">⏭ 次へ</span>
          </button>

          <button ref="stopPlaybackButtonRef" type="button" class="st-playall__button st-playall__button--stop" :aria-label="stopButtonLabel" @click="stopSoundtrack">
            <span class="st-playall__labelLong">{{ stopButtonLabel }}</span>
            <span class="st-playall__labelShort">■ 停止</span>
          </button>
        </div>

        <div class="st-settings">
          <!-- 🔁 リピート（OFF → 全曲 → 1曲 → OFF）
               3つの状態があるので aria-pressed では言い表せない
               見た目は data-repeat でCSSへ渡し、読み上げには aria-label で「いまの状態」と「押すとどうなるか」を伝える -->
          <button type="button" class="st-repeat" :data-repeat="repeatMode" :aria-label="repeatButtonLabel" @click="toggleRepeat">
            <span class="st-repeat__icon">🔁</span>
            <span class="st-repeat__text">リピート</span>
            <!-- 3つとも置いておき、いまの1つだけをCSSで見せる（押しても幅が変わらない） -->
            <span class="st-repeat__state">
              <span class="st-repeat__stateText st-repeat__stateText--off">OFF</span>
              <span class="st-repeat__stateText st-repeat__stateText--all">全曲</span>
              <span class="st-repeat__stateText st-repeat__stateText--one">1曲</span>
            </span>
          </button>
        </div>

        <!-- サウンドOFFのあいだだけ出す案内（「鳴りません」ではなく「押せばONに戻ります」と伝える） -->
        <p v-if="!soundEnabled" class="st-settings__hint" aria-live="polite">サウンドOFF中（「▶ 再生」でONに戻ります）</p>
      </section>
    </div>

    <!-- ============================================================
         歌詞の画面（「歌詞をぜんぶ見る」を押したときだけ。曲の一覧のかわりに出す）

         ・行を押すと、その行の歌い出しへとぶ（→ seekToLyric）
         ・手でスクロールしたら、自動スクロールをしばらく止める（→ pauseLyricsAutoScroll）
         ============================================================ -->
    <div
      v-if="isLyricsView && playingLyrics"
      ref="lyricsScrollRef"
      class="st-lyricsView"
      @wheel.passive="pauseLyricsAutoScroll"
      @touchmove.passive="pauseLyricsAutoScroll"
      @pointerdown="pauseLyricsAutoScroll"
      @keydown="pauseLyricsAutoScroll">
      <ol class="st-lyricsView__list" :aria-label="`${playingTrack?.title ?? ''} の歌詞`">
        <li v-for="(line, index) in playingLyrics" :key="index" :data-lyric-index="index">
          <button
            type="button"
            class="st-lyricsView__line"
            :class="{
              'st-lyricsView__line--current': index === lyricIndex,
              'st-lyricsView__line--past': index < lyricIndex,
              'st-lyricsView__line--music': line.text === '♪',
            }"
            :aria-current="index === lyricIndex ? 'true' : undefined"
            :aria-label="`${line.text === '♪' ? '間奏' : line.text}（ここから聴く）`"
            @click="seekToLyric(index)">
            {{ line.text }}
          </button>
        </li>
      </ol>
    </div>

    <!-- ============================================================
         曲の一覧のスクロールエリア（st-trackScroll）

         曲が増えても、長くなるのはこの箱の中だけ（上の操作エリアは画面に残ったまま）
         歌詞の画面を出しているあいだは、かくすだけ（v-show。戻ったとき、前に見ていた場所のまま）
         ============================================================ -->
    <div v-show="!isLyricsView" ref="trackScrollRef" class="st-trackScroll" @scroll.passive="handleTrackScroll">
      <ol ref="trackListRef" class="st-list" @keydown="handleTrackListKeydown">
        <li v-for="track in tracks" :key="track.id" class="track" :class="{ 'track--current': playingTrackId === track.id }" :data-track-id="track.id">
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
            <!-- 曲名の行（曲名 ＋「♪ 再生中」＋ ⓘ）
                 「♪ 再生中」と ⓘ は、ひとかたまり（track__titleSide）にして、入りきらないときは いっしょに次の行へ移す
                 ※ 曲名と track__titleSide のあいだの空白は、わざと同じ行に書いてある（消さないこと）
                   この空白が「ここで折り返してよい」しるしになる（Vue は、改行をふくむ空白を消してしまうため） -->
            <p class="track__title">
              <span class="track__titleText">{{ track.title }}</span> <span class="track__titleSide">
                <span v-if="isTrackPlaying(track)" class="track__nowPlaying">♪ 再生中</span>

                <!-- ⓘ 制作情報（マウスを乗せている・Tabで来た・押して開いたあいだだけ出す）
                     @click.stop … ⓘを押しただけで、外側の処理（曲のカードなど）が動かないように -->
                <span class="track__info" :class="{ 'track__info--suppress-hover': suppressedCreditHoverTrackId === track.id }" @pointerleave="releaseCreditHoverSuppression(track.id)">
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
              </span>
            </p>

            <!-- 説明文（「|」のところを <wbr>＝折り返してよい場所 にして出す → splitPhrases） -->
            <p class="track__description">
              <template v-for="(phrase, index) in splitPhrases(track.description)" :key="index"><wbr v-if="index > 0" /><span class="st-phrase">{{ phrase }}</span></template>
            </p>
          </div>

          <button type="button" class="track__button" :class="{ 'track__button--playing': isTrackPlaying(track) }" :aria-label="trackButtonLabel(track)" @click="toggleTrack(track)">
            <template v-if="isTrackPlaying(track)">⏸ 一時停止</template>

            <template v-else-if="playingTrackId === track.id">▶ 続きから</template>

            <template v-else>▶ 再生</template>
          </button>

          <!-- 再生バー（いま選んでいる曲にだけ出す。一時停止中も出して、止めたまま聴きたいところへ動かせる） -->
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

        <!-- ボーナストラックのロック表示（まだ解放していない曲のぶんだけ → lockedTrackHints）

             ・ボタンを持たないので、押せない・Tabでも止まらない。tracks に入れないので、曲順にも入らない
             ・class に track を付けないこと（キーボード操作が .track を曲のカードとして数えるので、
               ここも数えると、End で最後の曲へ行けず、↑↓ の回りこみも止まってしまう）
             ・「？？？」は読み上げると記号の連続になるので、読み上げには「まだ聴けない曲」と伝える -->
        <li v-for="hint in lockedTrackHints" :key="hint" class="st-lockedTrack">
          <span class="st-lockedTrack__icon" aria-hidden="true">🔒</span>

          <div class="st-lockedTrack__body">
            <p class="st-lockedTrack__title">
              <span aria-hidden="true">？？？？？？？？？</span>
              <span class="st-lockedTrack__srText">まだ聴けない曲</span>
            </p>

            <p class="st-lockedTrack__description">
              <template v-for="(phrase, index) in splitPhrases(hint)" :key="index"><wbr v-if="index > 0" /><span class="st-phrase">{{ phrase }}</span></template>
            </p>
          </div>
        </li>
      </ol>
    </div>
  </main>
</template>

<style scoped>
/* ページ全体の下地（ゲーム画面と同じく、枠の外側は暗くする） */
:global(html),
:global(body) {
  margin: 0;
  padding: 0;
  background: #101d2c;
}

/* ============================================================
   ページの枠（画面を「操作エリア」と「曲の一覧」の2つに分ける）

     上：操作エリア（.st-fixedArea） … 動かない
     下：曲の一覧（.st-trackScroll）  … ここだけ上下にスクロール

   曲を下のほうまで見ていても、操作が画面の上へ消えないようにするため

   ■ しくみ（Flexbox）
     枠を画面の高さぴったり（100dvh）・overflow: hidden にして、中身を上から下へならべる
     操作エリアは flex: none（中身ぶんの高さのまま）、曲の一覧は flex: 1（残りをぜんぶ使う）
     操作エリアの高さが変わっても、曲の一覧の高さが自動で合う（JavaScript で計算しなくてよい）
     ※ position: fixed を使わないのは、操作エリアの高さぶんのすき間を自分で計算しなければならず、
       その高さが再生中・サウンドOFF中・画面の幅で変わるので、すぐにずれるため

   ■ height を2回書いているのは、100dvh（スマホのアドレスバーの出入りに合わせる）を知らないブラウザ向け

   ※ 左右の余白は、中の2つの箱に持たせる（曲の一覧のスクロールバーを、枠の右はしに出すため）
   ※ 縦にとても低い画面・とても幅のせまい画面では、ページ全体のスクロールに戻す（→ いちばん下の @media）
   ============================================================ */
.soundtrack {
  /* 色はゲーム画面と同じもの */
  --navy: #2a768f;
  --navy-deep: #226981;
  /* うすい水色の線（上部ツールバーの SoundControl.vue の枠に使われる） */
  --navy-line: #86c6dd;
  --paper: #fffdf9;
  --ink: #4e5860;
  --ink-soft: #8d949b;
  --gold: #ffd166;

  display: flex;
  flex-direction: column;
  box-sizing: border-box;

  /* iPhone のノッチ・ホームインジケーターをよける余白（border-box なので、100dvh の中にふくまれる） */
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  width: 100%;
  max-width: 1180px;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  margin: 0 auto;
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

/* 画面に残る操作エリア

   flex: none … 縮まない（縮むと、ボタンが切れて押せなくなるため）
   overflow: hidden ＋ scrollbar-gutter: stable
   … 下の曲の一覧と同じだけ、スクロールバーの場所を空けておく
     （空けないと、一覧にスクロールバーが出たときに、上と下でカードの左右のはしがずれる
       scrollbar-gutter は overflow が hidden などの箱にしか効かないので、hidden を付けている） */
.st-fixedArea {
  flex: none;
  overflow: hidden;
  scrollbar-gutter: stable;
  padding: 12px 24px;
}

/* 曲の一覧のスクロールエリア（上下にスクロールするのは、この箱だけ）

   min-height: 0 … 中身より低くなってもよい、という指定
     Flexbox の中の箱は、ふつう中身ぶんより低くならないので、これが無いと一覧が画面の下へはみ出して切れてしまう
   最後の曲の下にも余白を空ける（最後の曲の ⓘ の吹き出しも、この余白の中に出るので切れない） */
.st-trackScroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 12px 24px 24px;
  border-top: 1px solid rgb(42 118 143 / 16%);
}

/* ============================================================
   カードの横幅をそろえる（ツールバー・見出し・全曲再生・曲の一覧）

   box-sizing: border-box にして、余白と枠線までふくめた外がわの幅を 760px にそろえる
   （content-box のままだと、カードごとに余白・枠線の太さがちがうので、外がわの幅がばらばらになっていた）
   ※ 幅の数字は、ここ1か所だけに書く（それぞれのカードに書くと、またずれるため）
   ============================================================ */
.st-toolbar,
.st-head,
.st-playall,
.st-list {
  box-sizing: border-box;
  max-width: 760px;
}

/* ============================================================
   上部ツールバー（← 戻る ／ 🔊 ミュートボタン ＋ 音量バー）

   ・枠は、すぐ下の「全曲再生」カードと同じ紺色 ＋ 下だけ太い枠（ほかのカードとそろえ、ここだけ浮かないように）
   ・枠の太さ・角丸は、見出しよりひかえめにして、見出しより目立たないようにする
   ・上下の余白は、操作エリアが高くなりすぎないよう、ひかえめにしてある
   ============================================================ */
.st-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin: 0 auto 10px;
  padding: 7px 20px;
  border: 2px solid var(--navy);
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--paper);
  box-shadow: 0 4px 12px rgb(35 57 94 / 14%);
}

/* 右のサウンド（SoundControl.vue）は、いつも右はしに置く

   大きさは、タイトル画面の右上と同じ値にそろえる（assets/css/game/sound.css の .title-card__tools）
   ※ 音量バーだけは、タイトル画面（110px）より長い 180px（曲を聴くページなので、音量を細かく合わせやすく） */
.st-toolbar .sound-control {
  --sound-button-size: 38px;
  --sound-icon-size: 20px;
  --sound-slider-width: 180px;

  margin-left: auto;
}

/* 「← 戻る」
   ・高さは、となりのサウンドの枠（38px）とだいたいそろえる
   ・ボタンの中では2行に割らない（入りきらないときは、ツールバーごと2段になる）
   ・hover は、紙の色の上でも見分けがつくように、うすい水色にする */
.st-back {
  padding: 7px 16px;
  border: 2px solid var(--navy);
  border-radius: 999px;
  background: rgb(255 255 255 / 70%);
  color: var(--navy-deep);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.st-back:hover {
  background: #e8f4fb;
}

.st-back:active {
  transform: translateY(1px);
}

.st-back:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 2px;
}

/* ページの見出し */
.st-head {
  /* 下のすき間は、影（下へ12px）のぶんを足して 22px
     影と同じ12pxだと、影がすき間を埋めて、下の全曲再生のカードにくっついて見えるため */
  margin: 0 auto 22px;
  padding: 12px 28px 10px;
  border: 3px solid var(--navy);
  border-radius: 20px;
  background: var(--paper);
  box-shadow: 0 12px 0 rgb(35 57 94 / 18%);
  text-align: center;
}

.st-head__badge {
  display: inline-block;
  margin: 0 0 6px;
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
  font-size: 28px;
  line-height: 1.35;
}

.st-head__lead {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

/* ============================================================
   再生の設定（全曲再生の箱の中、いちばん下の1行。いまは「🔁 リピート」だけ）

   設定だけの箱を増やすとページが長くなるので、同じ「再生まわりの操作」としてこの箱に入れている
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

/* 「🔁 リピート」（押すたびに状態が変わる設定のボタンなので、丸い枠のボタン） */
.st-repeat {
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

/* リピートなしのときは色をぬいて、「いまは何も起きない設定」だと色でも分かるようにする */
.st-repeat[data-repeat='off'] {
  border-color: #b9c6d6;
  background: #eef2f7;
  color: var(--ink-soft);
}

.st-repeat:hover {
  background: #e8f4fb;
}

.st-repeat:active {
  transform: translateY(1px);
}

.st-repeat:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 3px;
}

.st-repeat__icon {
  font-size: 16px;
  line-height: 1;
}

/* 状態の文字（OFF / 全曲 / 1曲）が変わっても、ボタンの幅を変えない
   ぜんぶ同じマスに重ねて、使わないものは visibility で消す（場所は残るので、幅はいちばん長い文字のまま） */
.st-repeat__state {
  display: grid;
}

.st-repeat__stateText {
  grid-area: 1 / 1;
  text-align: center;
}

.st-repeat__stateText {
  visibility: hidden;
}

.st-repeat[data-repeat='off'] .st-repeat__stateText--off,
.st-repeat[data-repeat='all'] .st-repeat__stateText--all,
.st-repeat[data-repeat='one'] .st-repeat__stateText--one {
  visibility: visible;
}

/* サウンドOFF中の案内
   ※ リピートの状態は文では出さない（押すたびに行が高くなったり低くなったりして落ち着かないため） */
.st-settings__hint {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
}

/* ============================================================
   全曲再生の操作バー
   ============================================================ */
/* 下の曲の一覧とのすき間は、操作エリア（.st-fixedArea）の下の余白で空ける */
.st-playall {
  margin: 0 auto;
  padding: 12px 20px;
  border: 2px solid var(--navy);
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--paper);
}

/* タイトル画面の「公園へ行く」と同じ金色のボタン */
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

/* 「▶ 全曲再生」と「🔀 シャッフル再生」のならび（下の操作行と位置をそろえるため、真ん中へ寄せる） */
.st-playall__starters {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
}

/* 「⏸ 一時停止 ／ ▶ 続きから」の段（スターターと同じならべかたなので、入れかわっても位置がずれない） */
.st-playall__transport {
  display: flex;
  justify-content: center;
}

/* 「⏸ 一時停止 ／ ▶ 続きから」のボタン
   ・幅は、入れかわる前の2つ（148px × 2 ＋ すき間10px）と同じにする
   ・止まっているときは金色（押すと鳴りはじめる）、鳴っているときは紺色（曲のカードの ⏸ 一時停止と同じ） */
.st-playall__button--toggle {
  min-width: 306px;
}

.st-playall__button--pause {
  border-color: var(--navy-deep);
  background: var(--navy);
  color: #fff;
}

/* 「🔀 シャッフル再生」は、白〜水色＋紺色の文字（金色の「▶ 全曲再生」ととなり合わせでも、うるさく見えないように） */
.st-playall__button--shuffle {
  border-color: var(--navy);
  background: linear-gradient(180deg, #fff 0%, #d6f0fb 100%);
  color: var(--navy-deep);
}

/* 操作行の3つ（⏮ 前 ／ ⏭ 次 ／ ■ 停止）は、白〜水色＋紺色の文字

   ボタンの色の意味（このページ全体でそろえている）
   ・金色           … 押すと鳴りはじめる（▶ 全曲再生・▶ 続きから）
   ・紺色ぬりつぶし … いま鳴っている。押すと止まる（⏸ 一時停止）
   ・白〜水色       … そのほかの操作
   ※ 「■ 停止」も紺色にすると、「⏸ 一時停止」と紺色のボタンが2つならんで見分けにくいので、白〜水色にしている */
.st-playall__button--previous,
.st-playall__button--next,
.st-playall__button--stop {
  border-color: var(--navy);
  background: linear-gradient(180deg, #fff 0%, #d6f0fb 100%);
  color: var(--navy-deep);
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

/* 「番号を押すと…」の案内（すぐ上のボタンの説明だと分かるように、ボタンと同じく真ん中にそろえる）
   text-wrap: balance … スマホで1〜2文字だけ次の行へ落ちないように、行の長さをそろえる */
.st-playall__hint {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
  text-align: center;
  text-wrap: balance;
}

/* いま鳴っている曲の表示
   align-items: baseline … 文字の大きさがちがうので、中央でそろえると数字が縦にずれて見えるため */
.st-playall__status {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 2px dashed #c8d4e6;
  font-size: 15px;
  line-height: 1.6;
}

/* 「♪ 全曲再生中」は金色、「🔀 シャッフル再生中」は紺色（それぞれを始めるボタンと同じ色） */
.st-playall__badge {
  padding: 3px 12px;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
  color: #4a3208;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.st-playall__badge--shuffle {
  background: var(--navy);
  color: #fff;
}

/* 「7 / 7」（tabular-nums … 数字の幅をそろえて、曲が進んでも位置が動かないように） */
.st-playall__count {
  color: var(--navy-deep);
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.st-playall__track {
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
}

/* いま歌っている1行（曲名より少し大きく。行が変わるたびに、下から ふわっと出なおす） */
.st-lyrics {
  margin: 8px 0 0;
  padding: 6px 12px;
  border-radius: 10px;
  background: #e8f4fb;
  color: var(--navy-deep);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
}

/* 歌詞の画面 ⇄ 曲の一覧 の切りかえ（「▶ 全曲再生」ほど目立たせない、白系の軽い見た目）
   歌詞の画面を出しているあいだ（aria-pressed）は、紺色でぬる */
.st-lyricsToggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  padding: 3px 12px 3px 9px;
  border: 2px solid var(--navy);
  border-radius: 999px;
  background: rgb(255 255 255 / 80%);
  color: var(--navy-deep);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  align-self: center;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.st-lyricsToggle:hover {
  background: #e8f4fb;
}

.st-lyricsToggle:active {
  transform: translateY(1px);
}

.st-lyricsToggle:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 2px;
}

.st-lyricsToggle[aria-pressed='true'] {
  background: var(--navy);
  color: #fff;
}

.st-lyricsToggle__icon {
  flex: none;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.st-lyricsToggle__icon circle {
  fill: currentColor;
  stroke: none;
}

/* ============================================================
   歌詞の画面（「歌詞をぜんぶ見る」を押したとき、曲の一覧のかわりに出す）

   曲の一覧と同じく、操作エリアの下の のこりの高さをぜんぶ使い、この中だけがスクロールする
   下に大きめの余白を空けて、最後のほうの行も、画面の上寄りまでスクロールして来られるようにする
   ============================================================ */
/* 曲を選んでいるあいだは、ページの見出しを画面からかくして、曲の一覧・歌詞の画面を広くする
   ・一時停止のたびに出たり消えたりしないよう、操作行が出ているあいだと同じ条件にしている
   ・見た目だけかくす（読み上げソフトには、ページの見出しとして伝える） */
.soundtrack--playing .st-head {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}

/* 歌詞の画面を出しているあいだは、曲の一覧のための案内もかくす */
.soundtrack--lyricsView .st-playall__hint {
  display: none;
}

.st-lyricsView {
  flex: 1;
  box-sizing: border-box; /* 背の低い画面の max-height に、上下の余白もふくめる */
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 16px 24px 40vh;
  border-top: 1px solid rgb(42 118 143 / 16%);
}

.st-lyricsView__list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  max-width: 760px;
  margin: 0 auto;
  padding: 0;
  list-style: none;
}

/* これから歌う行は、灰色でひかえめに（いまの行だけが、くっきり目立つように） */
.st-lyricsView__line {
  padding: 6px 14px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--ink-soft);
  font-family: inherit;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
  cursor: pointer;
  transition:
    color 0.25s ease,
    opacity 0.25s ease,
    transform 0.25s ease,
    background-color 0.25s ease,
    box-shadow 0.25s ease;
}

.st-lyricsView__line:hover {
  background: #e8f4fb;
}

.st-lyricsView__line:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 2px;
}

.st-lyricsView__line--past {
  opacity: 0.45;
}

/* いま歌っている行（水色の帯に濃い紺色の文字。紺色の文字だけだと、これから歌う行と見分けにくかったため） */
.st-lyricsView__line--current,
.st-lyricsView__line--current:hover {
  background: #c9e8f7;
  box-shadow: inset 0 -3px 0 #9fd2ec;
  color: #1b5a70;
  opacity: 1;
  transform: scale(1.1);
}

.st-lyrics__line {
  display: inline-block;
  animation: st-lyrics-in 0.3s ease-out;
}

@keyframes st-lyrics-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

/* 操作行（⏮ 前 ／ ⏭ 次 ／ ■ 停止。真ん中へ寄せ、幅が足りないときは折り返す） */
.st-playall__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
  margin: 10px 0 0;
}

/* 操作行の3つのボタンの大きさをそろえる
   ・flex: 1 1 0            … 3つで横幅を同じ割合で分け合う（文字の長さに引っぱられない）
   ・min-width: max-content … ただし、文字より細くはしない
   ・max-width: 210px       … 広い画面でのびすぎない（いちばん長い「■ シャッフル再生を停止」が入る大きさ） */
.st-playall__actions .st-playall__button {
  flex: 1 1 0;
  min-width: max-content;
  max-width: 210px;
  padding: 9px 16px;
  font-size: 15px;
}

/* 操作行の短い文字は、スマホ幅のときだけ出す（→ @media (max-width: 600px)） */
.st-playall__labelShort {
  display: none;
}

/* ============================================================
   曲の一覧
   ============================================================ */
.st-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 auto;
  padding: 0;
  list-style: none;
}

/* 1曲ぶんのカード（番号・曲名と説明・再生ボタン を横にならべる） */
.track {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  /* 縦のすき間は、再生バーが出る2行目のぶん */
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

/* いま選んでいる曲のカード（点滅などの派手な動きはさせない） */
.track--current {
  border-color: var(--navy);
  background: #f0fbff;
}

/* トラック番号（押すと、全曲再生の開始曲になる） */
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

/* 曲名の行（曲名 ＋「♪ 再生中」＋ ⓘ）

   ふつうの文章と同じならべかた（display: block）にして、曲名の最後の文字のすぐうしろに「♪ 再生中 ⓘ」を続ける
   （flex だと、曲名がまるごと1つの箱になり、ⓘ だけが次の行に取り残されたりしていた）
   ・word-break: keep-all    … 曲名を言葉のとちゅうで割らない（「、」や空白のところで折り返す）
   ・overflow-wrap: anywhere … 1つの言葉がカードより長いときだけは、はみ出さないように、とちゅうでも折り返す */
.track__title {
  margin: 0 0 2px;
  color: var(--navy-deep);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.5;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

/* 曲名と「♪ 再生中 ⓘ」のすき間（右の余白 ＋ テンプレートの空白1つぶん）
   かたまりの左に余白を付けないのは、次の行へ移ったときに、行の先頭が字下げされて見えないようにするため */
.track__titleText {
  margin-right: 5px;
}

/* 「♪ 再生中」と ⓘ のかたまり（inline-flex なので、この中では折り返さず、2つが いつもいっしょ） */
.track__titleSide {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  vertical-align: middle;
}

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

/* 吹き出しは、この中で position: absolute で浮かせる */
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

/* 「i」は ::before で出す（要素の中に直接書くと、前後の改行・余白のぶんだけ中央からずれるため） */
.track__infoBtn::before {
  content: 'i';
}

.track__infoBtn:hover,
.track__infoBtn--open {
  background: #d7ebf7;
}

.track__infoBtn:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 2px;
}

/* 吹き出し（レイアウトを押し下げずに、曲名＋ⓘの下に浮かせて出す） */
.track__tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 5;
  /* 制作情報は、折り返さずに1行で読めるようにする */
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
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.12s ease;
}

/* 吹き出しの上の、ⓘを指す小さな三角 */
.track__tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: var(--navy);
}

/* 吹き出しを出す条件
   ① クリック・タップで開いたまま（--open）… いつでも出す
   ② マウスを乗せているあいだ            … 一時的に出す
   ③ Tabキーで移動してきたあいだ          … 一時的に出す
   ②③は「閉じたばかり」（--suppress-hover）のあいだは出さない
   （閉じても、マウスが乗ったまま・フォーカスが残ったままなので、すぐまた出てきてしまうため） */

/* ① */
.track__tooltip--open {
  opacity: 1;
  visibility: visible;
}

/* ② マウスが使える機械だけ（スマホは、タップした場所に hover がしばらく残ってしまうことがあるため） */
@media (hover: hover) {
  .track__info:not(.track__info--suppress-hover):hover .track__tooltip {
    opacity: 1;
    visibility: visible;
  }
}

/* ③ :focus-within ではなく :focus-visible を使う
   （マウスでクリックしたあとに残るフォーカスでは出さない。「閉じたのに出たまま」にならないように） */
.track__info:not(.track__info--suppress-hover) .track__infoBtn:focus-visible + .track__tooltip {
  opacity: 1;
  visibility: visible;
}

/* 曲の説明文（折り返すのは、<wbr>（「|」のところ）と空白だけ。考えかたは曲名の行と同じ） */
.track__description {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

/* 曲ごとの再生ボタン（白〜うすい水色＋紺色の文字）
   金色は「▶ 全曲再生」だけに使う（曲の数だけ金色がならぶと、いちばん大事なボタンが分かりにくくなるため）
   ※ 高さは、指でも押せる大きさを保つ */
.track__button {
  min-width: 132px;
  padding: 11px 18px;
  border: 2px solid var(--navy);
  border-bottom-width: 4px;
  border-radius: 10px;
  background: linear-gradient(180deg, #fff 0%, #d6f0fb 100%);
  color: var(--navy-deep);
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

.track__button:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 2px;
}

/* ============================================================
   ボーナストラックのロック表示

   曲のカードと同じ角の丸み・余白にして、一覧の「最後の1曲」に見せる
   押せないことが分かるよう、ふちは点線、色はうすくする（ボタンが無いので hover などの見た目も付けない）
   ============================================================ */
/* position: relative が大事
   中の読み上げ用の文字（position: absolute）の基準がページ全体になると、曲の一覧の外へ飛び出して、
   スマホでページごとスクロールできてしまい、上の操作エリアが画面の外へ消えていたため */
.st-lockedTrack {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px 18px;
  padding: 10px 20px;
  border: 2px dashed #c8d4e6;
  border-radius: 14px;
  background: #f4f7fb;
}

/* 🔒 … 曲の番号と同じくらいの幅にして、曲名の書きはじめをそろえる */
.st-lockedTrack__icon {
  box-sizing: border-box;
  min-width: 56px;
  padding: 6px 10px;
  font-size: 24px;
  line-height: 1.1;
  text-align: center;
}

.st-lockedTrack__body {
  min-width: 0;
}

.st-lockedTrack__title {
  margin: 0 0 2px;
  color: #8a97aa;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.5;
}

/* 説明文を「|」で区切った、ひとつひとつのかたまり（→ splitPhrases）
   inline-block … かたまりの中では折り返さない
   max-width: 100% … かたまりがカードより長いときだけは、中でも折り返して、はみ出さないようにする */
.st-phrase {
  display: inline-block;
  max-width: 100%;
}

.st-lockedTrack__description {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

/* 読み上げソフトにだけ伝える文字（display: none だと読み上げからも消えるので、1pxの見えない箱に入れる） */
.st-lockedTrack__srText {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ============================================================
   再生バー（カードの2行目に、横いっぱいで置く）
   ============================================================ */
.track__player {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
}

/* 経過時間と曲の長さ（数字が変わっても幅が動かないように、min-width と tabular-nums） */
.track__time {
  min-width: 44px;
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

/* バー本体（レールとつまみは、Chrome / Safari 用の ::-webkit- と Firefox 用の ::-moz- を両方書く） */
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

/* レール（Chrome / Safari）
   聴き終わったところだけ色を変える機能が無いので、グラデーションで塗り分ける（境目は --seek-progress） */
.track__seek::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--navy) var(--seek-progress, 0%), #d7e4f0 var(--seek-progress, 0%));
}

/* つまみ（Chrome / Safari）。margin-top で、6pxのレールの真ん中に来るようにする（(16 − 6) ÷ 2） */
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

.track__seek::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: #d7e4f0;
}

/* 聴き終わったところ（Firefox は、塗り分ける機能がある） */
.track__seek::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--navy);
}

.track__seek::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 1px 3px rgb(35 57 94 / 35%);
}

.track__seek:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 4px;
}

/* 曲の長さがまだ分からないあいだ（読み込み中）は動かせない */
.track__seek:disabled {
  cursor: default;
  opacity: 0.45;
}

/* 動きを減らす設定にしている人への配慮 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
  }

  .st-lyrics__line {
    animation: none;
  }
}

/* ============================================================
   スマホ幅

   スマホの縦画面は背が低いので、操作エリアが高くなりすぎると、曲の一覧がほとんど見えなくなる
   ボタンは小さくしすぎず（指で押しやすい高さは残す）、余白・見出し・すき間をつめる
   ============================================================ */
@media (max-width: 600px) {
  .st-fixedArea {
    padding: 8px 16px;
  }

  .st-trackScroll {
    padding: 8px 16px 24px;
  }

  .st-lyricsView {
    padding: 12px 16px 40vh;
  }

  .st-lyricsView__line {
    padding: 5px 10px;
    font-size: 20px;
  }

  /* 上部ツールバー（タイトル画面と同じならべかた。戻るボタンも、指で押せる高さは残す） */
  .st-toolbar {
    gap: 6px 8px;
    margin-bottom: 8px;
    padding: 4px 6px;
  }

  .st-back {
    min-height: 36px;
    padding: 7px 14px;
    font-size: 13.5px;
  }

  /* 右のサウンドは、タイトル画面のスマホと同じ大きさ（assets/css/game/sound.css の .title-card__tools） */
  .st-toolbar .sound-control {
    --sound-button-size: 36px;
    --sound-icon-size: 19px;

    /* 音量バーだけは、タイトル画面より大きく（曲を聴くページなので、指で細かく合わせやすく）
       長さは「← 戻る」の右の空きをぜんぶ使い、100px は いちばん短いときの長さ（幅320pxでも1行に収まる） */
    --sound-slider-width: 100px;
    --sound-slider-track: 7px;
    --sound-slider-thumb: 22px;

    flex: 1 1 auto;
  }

  /* のびた枠の中で、音量バーが あまった幅をぜんぶ使う（SoundControl.vue の中なので :deep() で指す） */
  .st-toolbar :deep(.sound-control__sliderWrap),
  .st-toolbar :deep(.sound-control__slider) {
    flex: 1 1 auto;
  }

  /* 指で操作する画面では、サウンドの枠をのばさない
     音量バーを出さずミュートボタンだけなので、のばすと 🔊 が「← 戻る」のすぐ右に来てしまうため
     （見分けかたは utils/touchDevice.ts・sound-control.css と同じ） */
  @media (hover: none) and (pointer: coarse) {
    .st-toolbar .sound-control {
      flex: none;
    }
  }

  .st-playall {
    padding: 10px 12px 12px;
  }

  /* 「▶ 全曲再生」「🔀 シャッフル再生」は、入るときは横にならべる（縦に積むと操作エリアが高くなりすぎるため）
     入りきらない幅のときは、flex-wrap で自動で2段になる */
  .st-playall__button {
    flex: 1 1 auto;
    min-width: 0;
    padding: 9px 12px;
  }

  .st-playall__starters,
  .st-playall__actions {
    gap: 8px;
  }

  /* 「⏸ 一時停止 ／ ▶ 続きから」は、段いっぱいまで広げる（PC用の最低幅 306px は外す） */
  .st-playall__button--toggle {
    min-width: 0;
  }

  .st-playall__actions {
    margin-top: 8px;
  }

  .st-playall__actions .st-playall__button {
    max-width: none;
    padding: 9px 8px;
    font-size: 14px;
  }

  /* 操作行の3つを、短い文字（⏮ 前へ ／ ⏭ 次へ ／ ■ 停止）にして、かならず1段にならべる
     長い文字のままだと2段になり、再生を始めるたびに曲の一覧がせまくなっていたため */
  .st-playall__actions {
    flex-wrap: nowrap;
  }

  .st-playall__actions .st-playall__button {
    min-width: 0;
  }

  .st-playall__labelLong {
    display: none;
  }

  .st-playall__labelShort {
    display: inline;
  }

  /* 曲を選んでいるあいだは「番号を押すと…」の説明をかくす（そのぶん曲の一覧を広くする） */
  .st-playall--active .st-playall__hint {
    display: none;
  }

  .st-playall__hint,
  .st-settings__hint {
    margin-top: 6px;
    font-size: 13px;
  }

  /* いま鳴っている曲の表示を、2行にまとめる

       1行目 … ♪ 全曲再生中　［歌詞］
       2行目 … 6 / 7　06 きょうの大冒険、おしまい！

     ・::after … 高さ0の「改行」（flex-basis: 100% で1行まるごと使う）
     ・order   … 目印と歌詞ボタン（0）→ 改行（1）→ N/曲数と曲名（2）の順にならべかえる
     （「6 / 7」まで1行目に入れると、「🔀 シャッフル再生中」が長くて入りきらないため） */
  .st-playall__status {
    align-items: center;
    gap: 2px 8px;
    margin-top: 8px;
    padding-top: 8px;
  }

  .st-playall__status::after {
    content: '';
    order: 1;
    flex-basis: 100%;
    height: 0;
  }

  .st-playall__count,
  .st-playall__track {
    order: 2;
  }

  .st-playall__track {
    line-height: 1.4;
    text-align: center;
  }

  /* 目印を小さくして、「🔀 シャッフル再生中」と［歌詞］が、幅のせまい画面でも1行にならぶようにする */
  .st-playall__badge {
    padding: 2px 10px;
    font-size: 13px;
  }

  .st-settings {
    gap: 8px 12px;
    margin-top: 8px;
    padding-top: 8px;
  }

  /* 見出しは、ページの名前なので消さずに、文字・余白・影を小さくする（下のすき間は「影4px ＋ 6px」） */
  .st-head {
    margin-bottom: 10px;
    padding: 5px 12px 6px;
    box-shadow: 0 4px 0 rgb(35 57 94 / 18%);
  }

  .st-head__badge {
    margin-bottom: 2px;
    padding: 1px 10px;
    font-size: 10px;
  }

  .st-head__name {
    font-size: 18px;
    line-height: 1.4;
  }

  .st-head__lead {
    font-size: 16px;
  }

  /* 曲のカード

     1行目 … [01] 曲名 ⓘ ／ 説明
     2行目 … ▶ 再生（横いっぱい）
     3行目 … 再生バー（いま選んでいる曲だけ）
     番号は曲名の左にならべたままにして、1曲ぶんを低くする */
  .track {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px 12px;
    padding: 12px 14px;
  }

  .track__no {
    font-size: 20px;
  }

  /* ⓘ の吹き出しを「曲名の行」を基準に出すため */
  .track__title {
    position: relative;
    font-size: 17px;
  }

  .track__button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .st-lockedTrack {
    gap: 10px 12px;
    padding: 12px 14px;
  }

  .st-lockedTrack__icon {
    min-width: 46px;
    font-size: 20px;
  }

  .st-lockedTrack__title {
    font-size: 17px;
  }

  /* ⓘ の吹き出しは、「ⓘ の真下に中央ぞろえ」だと画面の左右へはみ出すので、
     基準を「曲名の行」に変えて、その右はしにそろえて左へのばす（いつもカードの中に収まる） */
  .track__info {
    position: static;
  }

  .track__tooltip {
    right: 0;
    left: auto;
    max-width: calc(100vw - 40px);
    transform: none;
  }

  /* 三角は、吹き出しの右寄りに置く（ⓘ は曲名のうしろ＝右がわにあるため） */
  .track__tooltip::before {
    right: 24px;
    left: auto;
    transform: none;
  }
}

/* とても狭い画面（幅 360px 未満）では、吹き出しの文字と余白を少し小さくして、1行のまま収める */
@media (max-width: 359px) {
  .track__tooltip {
    padding: 7px 10px;
    font-size: 12px;
  }
}

/* ============================================================
   スマホで、画面全体が指のフリックで上下に動かないようにする

   上の操作エリアをフリックしたときや、曲の一覧のはしでさらにフリックしたときに、
   ページ全体が上下にぐにゃっと動いてしまうため
   ・html / body     … ページそのものはスクロールさせない（:has(.soundtrack) で、このページのときだけ）
   ・.st-fixedArea   … 指の上下の動きをブラウザに使わせない（ボタン・音量バー・拡大はそのままできる）
   ・.st-trackScroll … 一覧のはしまで来ても、その勢いをうしろのページへ伝えない
   ※ ページ全体をスクロールする作りに戻す画面（下の @media）では、効かせない
   ============================================================ */
@media (max-width: 600px) and (min-width: 360px) and (min-height: 481px) {
  :global(html:has(.soundtrack)),
  :global(body:has(.soundtrack)) {
    overflow: hidden;
    overscroll-behavior: none;
  }

  .st-fixedArea {
    touch-action: pan-x pinch-zoom;
  }

  .st-trackScroll,
  .st-lyricsView {
    overscroll-behavior-y: contain;
  }
}

/* ============================================================
   縦にとても低い画面（高さ 480px 以下）と、とても幅のせまい画面（幅 360px 未満）

   操作エリアだけで画面がほとんど埋まり、曲の一覧が見えなくなるので、
   上下に分けるのをやめて、ページ全体を縦にスクロールする作りに戻す

   ■ 高さの境目を 480px にしている理由
     iPhone SE（第2世代）の Safari は、見える高さが 548px ほどしかない
     580px だと、縦向きでふつうに使っているだけで こちらの作りになり、操作エリアが画面に残らなかった
     操作エリアは、スマホでいちばん高いとき（再生中）でも 333px ほどなので、548px でも曲の一覧は見える
     480px なら、スマホの横向き（高さ 320〜430px ほど）は、今までどおり こちらの作りになる
   ============================================================ */
@media (max-height: 480px), (max-width: 359px) {
  .soundtrack {
    height: auto;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: visible;
  }

  .st-fixedArea {
    scrollbar-gutter: auto;
  }

  .st-trackScroll {
    flex: none;
    overflow-y: visible;
    scrollbar-gutter: auto;
  }

  /* 歌詞の画面は、この作りでも自分の中でスクロールして いまの行を追いかけたいので、高さを画面の6割までにする */
  .st-lyricsView {
    flex: none;
    max-height: 60vh;
    max-height: 60dvh;
    padding-bottom: 30vh;
  }
}
</style>
