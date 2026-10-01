<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { loadHasUnlockedSPlusSong, sPlusSongSrc, sPlusSongTitle } from '~/utils/sPlusSong';
import { loadHasUnlockedSecretVocalSong, secretVocalSongSrc, secretVocalSongTitle } from '~/utils/secretVocalSong';

/* うた入りの曲の歌詞（その曲を鳴らしているあいだ、1行ずつ出す → このファイルの「歌詞」） */
import { sPlusSongLyrics, type LyricLine } from '~/data/sPlusSongLyrics';
import { secretVocalSongLyrics } from '~/data/secretVocalSongLyrics';

/* 曲の音量を入れる関数
   audio.volume = 〜 と直接書くと、iPhone では音量が変わらないので、かならずこれを通す
   （くわしい理由は、読みこむ先のファイルの先頭に書いてある） */
import { cancelElementPause, keepAudioContextAwake, pauseElement, pauseElementThen, setElementVolume } from '~/utils/elementVolume';
import { isTouchOnlyDevice } from '~/utils/touchDevice';

/* 上部ツールバーのサウンド（🔊 ミュートボタン ＋ 音量バー）
   タイトル画面（B画面）と同じ部品を使って、見た目と操作をそろえる */
import SoundControl from '~/components/game/SoundControl.vue';

/* ゲームの題名（pages/index.vue と同じものを data/game.ts から読む） */
import { gameTitle } from '~/data/game';

/* 車のステアリング・ロック画面・イヤホンの操作を受け取り、曲名を知らせる（→ このファイルの「車のステアリング・ロック画面・イヤホンの操作」） */
import { setMediaSessionPlaybackState, setMediaSessionTrack, startMediaSession } from '~/utils/mediaSession';

/* ============================================================
   サウンドトラックページ（/soundtrack）

   ゲームの中で流れる曲（いまは7曲 ＋ 解放されるボーナストラック2曲）を、ゆっくり聴くためのページ

   ゲーム本編（pages/index.vue）のBGMとは、わざと作りを分けてある
   ・本編 … 場面に合わせて自動で切り替わる。曲はloopする
   ・ここ … プレイヤーが「▶ 再生」を押した曲だけが鳴る
            ふだんはloopしないが、「🔁 リピート」を押したときだけくりかえす

   そのため、本編のBGMの関数（playParkBgm など）はいっさい使わない
   このページの中だけで完結する、シンプルな作りにしている
   ============================================================ */

/* 1曲ぶんの情報のかたち

   id          … 曲番号（01・02… の表示にも使う）
   title       … 曲名
   description … 曲の雰囲気をひとことで説明する文
                 「|」は、せまい画面で折り返してよい場所のしるし（画面には出ない → splitPhrases）
                 例）'S+ランク|特別エンディングBGM' … 入りきらないときは「S+ランク」「特別エンディングBGM」の2行になる
                 ※ 「BGM」「解放」のような短い言葉だけが次の行に残らないよう、短い言葉は前の言葉とくっつけておく
   src         … 音声ファイルの場所（public/audio/ の中のファイル）
   volume      … 音の大きさ（0＝無音、1＝そのままの大きさ）
   lyrics      … 歌詞（うた入りの曲だけ。歌詞の無い曲は書かない）
*/
type SoundtrackTrack = {
  id: number;
  title: string;
  description: string;
  src: string;
  volume: number;
  credit: string;
  lyrics?: LyricLine[];
};

/* 曲の一覧

   ここに並べた順番が、そのまま画面に出る順番になる
   曲名を変えたいときは、下の title を書きかえるだけでよい
   （画面のほうは v-for でこの配列をそのまま並べているので、直さなくてよい）

   volume の数字が曲ごとにちがうのは、音源そのものの録音の大きさがちがうため
   （ゲーム本編でも、曲ごとに音量をそろえている）
   本編のBGMは「後ろで流れる音」なので小さめだが、
   このページは曲そのものを聴くページなので、全体に大きめにしてある

   ※ ここに書くのは、はじめから聴ける曲だけ
     解放されるボーナストラック（sPlusBonusTrack・secretVocalBonusTrack）は、すぐ下に分けてある
     再生のしくみが使うのは、それらをあわせた tracks（さらに下）
*/
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
   ボーナストラック（あそんで解放する、うた入りの2曲）

   ・08 … ゲーム本編で一度でもS+ランクを取ると解放（保存のしくみは utils/sPlusSong.ts）
   ・09 … ミニゲーム「どこまで行ける？」で、1回のプレイで 300m まで行くと解放
          （保存のしくみは utils/secretVocalSong.ts。解放するところは pages/minigame/secret-path.vue）
   どちらも、それぞれのページと同じ保存場所を使っている
   （保存場所の名前がずれると、「取ったのに、サウンドトラックでは聴けない」ということが起きてしまうため）

   ■ 「再生できる曲」と「画面のロック表示」を分けてある
     ・tracks（すぐ下） … 再生できる曲だけの一覧
                          解放前は baseTracks の7曲だけ、解放したぶんだけ、うしろに足していく
                          個別再生・全曲再生・シャッフル・前後移動・リピートは、ぜんぶ tracks だけを見る
     ・ロック表示        … まだ解放していない曲のぶんだけ、テンプレートの曲一覧の最後に「🔒 ？？？」を出す
                          ボタンを持たない、ただの表示（tracks には入れない → lockedTrackHints）
     こうしておけば、再生のしくみのあちこちで「ロック中の曲はとばす」と書かなくてよい

   ■ 解放されているかは、ページを開いたとき（onMounted）に localStorage から読む
     本編でS+を取ってから・ミニゲームで300mまで行ってからこのページへ来ると、
     このページは作り直されるので、再読み込みしなくても解放済みとして出る
   ============================================================ */
const sPlusBonusTrack: SoundtrackTrack = {
  id: 8,
  title: sPlusSongTitle,
  description: 'S+ランク|特別エンディングBGM',
  src: sPlusSongSrc,
  // 音量と制作情報は、通常版（06 きょうの大冒険、おしまい！）と同じ
  // （うた入り版は、通常版の曲にSunoでうたを足したもののため）
  volume: 0.43,
  credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  // うた入りなので、鳴らしているあいだ歌詞を1行ずつ出す（→ data/sPlusSongLyrics.ts）
  lyrics: sPlusSongLyrics,
};

/* ============================================================
   ボーナストラック（ミニゲーム「どこまで行ける？」で 300m まで行くと解放される、うた入り「こもれびの奥で」）

   ミニゲームで ずっと流れている曲（04 こもれびの奥で）に、うたを足したもの
   ============================================================ */
const secretVocalBonusTrack: SoundtrackTrack = {
  id: 9,
  title: secretVocalSongTitle,
  description: 'ミニゲーム達成の|特別BGM',
  src: secretVocalSongSrc,
  // 音量と制作情報は、通常版（04 こもれびの奥で）と同じ
  // （うた入り版は、通常版の曲にSunoでうたを足したもののため）
  volume: 0.4,
  credit: '原曲・演奏：こうちゃんの父 / 編曲：Suno',
  // うた入りなので、鳴らしているあいだ歌詞を1行ずつ出す（→ data/secretVocalSongLyrics.ts）
  lyrics: secretVocalSongLyrics,
};

/* ボーナストラックを解放済みかどうか（はじめは false。onMounted で思い出して入れなおす）
   ※ サーバー側では localStorage を読めないので、ここでは読まない
   ※ このページでは読むだけで、false に戻すことはない */
const hasUnlockedSPlusSong = ref(false);
const hasUnlockedSecretVocalSong = ref(false);

/* 再生できる曲の一覧（画面に並ぶ曲のカードも、この順番）

   解放したボーナストラックを、うしろに足していく
   （既存の曲の id と順番は変えないので、全曲再生の開始曲などの覚えごとはくずれない）

   ※ 片方だけ解放しているときは、曲番号がとぶことがある（07 → 09）
     番号は id をそのまま出しているため。曲ごとの番号が、解放の進み具合で変わらないほうを取っている
   ※ computed なので、使うときは tracks.value と書く（テンプレートの中では .value は要らない）
   ※ baseTracks そのものは書きかえず、解放後は新しい配列を作って返す */
const tracks = computed(() => [...baseTracks, ...(hasUnlockedSPlusSong.value ? [sPlusBonusTrack] : []), ...(hasUnlockedSecretVocalSong.value ? [secretVocalBonusTrack] : [])]);

/* まだ解放していない曲のぶんだけ出す、ロック表示の説明（→ テンプレートの st-lockedTrack）

   何をすれば解放できるかだけを、みじかく出す（曲名は出さない）
   ぜんぶ解放すると、からっぽになって、ロック表示は1枚も出なくなる
   「|」は、折り返してよい場所のしるし（曲の description と同じ → splitPhrases） */
const lockedTrackHints = computed(() => {
  const hints: string[] = [];

  if (!hasUnlockedSPlusSong.value) {
    hints.push('S+ランクで解放');
  }

  if (!hasUnlockedSecretVocalSong.value) {
    hints.push('ミニゲーム|「どこまで行ける？」で解放');
  }

  return hints;
});

/* 説明文を「折り返してよい場所」（|）で区切って返す

   日本語は、ふつうはどの文字のあいだでも折り返されてしまうので、
   せまい画面だと「どこまで行け｜る？」「エンディング｜BGM」のように、言葉のとちゅうで割れてしまう
   そこで、区切ったひとつひとつを「中では折り返さないかたまり」（.st-phrase）にして、
   あいだに <wbr>（ここで折り返してよい、というしるし）を入れる
   ※ word-break: keep-all だけでは足りない
     「」」「、」のような記号のうしろでは、keep-all でも折り返されてしまうため
     （「どこまで行ける？」｜で解放 のように割れていた）

   例）'S+ランク|特別エンディングBGM' → ['S+ランク', '特別エンディングBGM']
   ※ 「|」そのものは画面に出ない（区切りに使うだけ） */
function splitPhrases(text: string) {
  return text.split('|');
}

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
   ③ 上の操作エリア（ツールバー・スターター・操作行）と曲の一覧を、
      画面の位置どおりに矢印キーで動かせる
      （→ handleToolbarKeydown / handlePlayallButtonsKeydown / findPlayallVerticalTarget）
      一覧から上のボタンへ戻る道は findVerticalTarget / findOutsidePlayButton にある

      「操作行」（.st-playall__actions）は、曲を選んでいるあいだだけ出る、3つのボタンのならび
        [ ⏮ 前のトラックへ ] [ ⏭ 次のトラックへ ] [ ■ 停止 ]
      個別再生・全曲再生・シャッフル再生のどれでも、同じ場所に同じならびで出る
      （一時停止中・サウンドOFFで止まっているときも、曲を選んでいるので出る）

      考えかたは「左の列・右の列」
      ・上の2段（ツールバー・スターター）は、左列・右列に1つずつ
      ・操作行は3つあるが、「前」「次」は左列（▶ 全曲再生の下）、「停止」は右列（🔀 シャッフルの下）
      ・← → は、そのならびの中で となりへ移るだけ
        （左端で←、右端で→、は移動しない。回り込みはしない）

      ■ 止まっているとき（ツールバー → スターター → 曲の一覧）

          [ ← 戻る ]        ←→  [ 🔊 サウンド ]
              ↑↓                     ↑↓
          [ ▶ 全曲再生 ]   ←→  [ 🔀 シャッフル ]
                      ↓
                    曲の一覧（01 ▶ 再生 …）

        ・戻る／サウンドで↓ … 同じ列のスターター（全曲再生／シャッフル）へ
        ・スターターで↑     … 同じ列のツールバー（戻る／サウンド）へ
        ・スターターで↓     … 曲の一覧の01「▶ 再生」へ（左右どちらの列からでも）

      ■ 再生中（個別・全曲・シャッフル。ツールバー → ⏸ 一時停止 → 操作行 → 曲の一覧）

        一時停止中・サウンドOFFで止まっているときも、曲を選んでいるので、こちらになる
        スターター（▶ 全曲再生／🔀 シャッフル）は、このあいだ「⏸ 一時停止 ／ ▶ 続きから」と入れかわっている

          [ ← 戻る ]                    [ 🔊 サウンド ]
                   ↓                ↓
                [ ⏸ 一時停止 ／ ▶ 続きから ]
                   ↑↓
          [ ⏮ 前へ ] ←→ [ ⏭ 次へ ]   ←→   [ ■ 停止 ]
                          ↓
                    曲の一覧（01 ▶ 再生 …）

        ・戻る／サウンドで↓ … ⏸ 一時停止（左右どちらの列からでも）
        ・⏸ 一時停止で↑     … ← 戻る
        ・⏸ 一時停止で↓     … ⏭ 次のトラックへ（真下のまんなか）
        ・「⏮ 前のトラックへ」へは、「⏭ 次のトラックへ」から←で入る
        ・前／次／停止で↑   … ⏸ 一時停止（3つのどこからでも）
        ・前／次／停止で↓   … 曲の一覧の01「▶ 再生」へ（3つのどこからでも）
        ※ 個別再生でも、⏸ 一時停止から↓で曲の一覧へ飛ばさない（あいだの操作行へ降りる）

      曲の一覧から↑で戻るときは、直前に一覧へ入ったボタンへ帰る（→ lastOutsideButton）
      （「⏮ 前」から入ったなら「⏮ 前」へ、「⏭ 次」なら「⏭ 次」へ、「■ 停止」なら「■ 停止」へ）
      Tabで一覧へ入ったなど、覚えが無いときは、
      再生中なら「⏭ 次のトラックへ」、止まっているなら「▶ 全曲再生」へ帰る（→ findOutsidePlayButton）

   ※ document や window では矢印キーを見張らない（曲の一覧のスクロールや、
     再生バー・音量バーの操作をじゃましないため）
     見張りは3か所だけ
     （.st-toolbar ／ .st-playall__starters・.st-playall__transport・.st-playall__actions ／ <ol class="st-list">）
   ※ 音量スライダーは、矢印キーの移動先に入れない
     矢印キーでそのまま音量を大小させるものなので、
     移動先にしてしまうと「動かすつもりが移動になる」ため（Tabで移れる）
   ※ 「🔁 リピート」のボタンも、矢印キーの移動先に入れない
     音量スライダーととなり合わせの「再生の設定」のまとまりなので、Tabで移る
   ※ Escape は「ⓘ 制作情報」の吹き出しを閉じるだけ（→ handleTrackListKeydown）
     はじめの画面へ戻るのには使わない（理由はテンプレートの st-toolbar のコメント）
   ============================================================ */

/* 矢印キーで直接フォーカスを当てるボタンを、それぞれ覚えておく箱
   ref="〜" と書いたボタンが、そのままここに入ってくる（出ていないときは null）

   画面の位置でならべると
     ツールバー（いつも）         … backButtonRef（左） / soundToggleButtonRef（右）
     スターター（止まっているとき）… playAllButtonRef（左） / shuffleButtonRef（右）
     ⏸ 一時停止（再生中だけ）     … playPauseButtonRef（スターターと入れかわって、同じ場所に出る）
     操作行（再生中だけ）         … previousTrackButtonRef・nextTrackButtonRef（左列の下） / stopPlaybackButtonRef（右列の下）

   ↑↓ で列をたどるとき・← → でとなりへ移るときの行き先に使う
   （→ handleToolbarKeydown / handlePlayallButtonsKeydown / findPlayallVerticalTarget）
   DOMから探すこともできるが、名前で分かるほうが読みやすいので ref にしている

   ※ 操作行は、個別再生・全曲再生・シャッフル再生で、1つのならびを使いまわしている
     v-if で出し入れするならびは1つだけなので、同じ ref が2つのボタンに付くことはない
     聴きかたで切りかわるのは、押したときの中身（どの曲順で前後するか）と、停止の文字だけ
     （→ playPreviousTrack / playNextTrack / stopButtonLabel） */
const backButtonRef = ref<HTMLButtonElement | null>(null);

/* サウンドのミュートボタンは、SoundControl.vue の中にあるので、コンポーネントごしに借りてくる
   （pages/index.vue のタイトル画面と同じやりかた。SoundControl.vue が defineExpose で見せている） */
const soundControlRef = ref<InstanceType<typeof SoundControl> | null>(null);
const soundToggleButtonRef = computed<HTMLButtonElement | null>(() => soundControlRef.value?.toggleButton ?? null);
const playAllButtonRef = ref<HTMLButtonElement | null>(null);
const shuffleButtonRef = ref<HTMLButtonElement | null>(null);

/* 再生中にだけ出る「⏸ 一時停止 ／ ▶ 続きから」（▶ 全曲再生・🔀 シャッフル再生と入れかわる）
   全曲再生を始めたあとや、前回の続きを戻したあとに、ここへフォーカスを移すのに使う */
const playPauseButtonRef = ref<HTMLButtonElement | null>(null);
const previousTrackButtonRef = ref<HTMLButtonElement | null>(null);
const nextTrackButtonRef = ref<HTMLButtonElement | null>(null);
const stopPlaybackButtonRef = ref<HTMLButtonElement | null>(null);

/* 曲の一覧（<ol class="st-list">）そのものを覚えておく箱
   「▶ 全曲再生」から ↑↓ で曲の一覧へ入るときに、行き先のボタンを探すのに使う */
const trackListRef = ref<HTMLElement | null>(null);

/* 曲の一覧のスクロールエリア（<div class="st-trackScroll">）そのものを覚えておく箱

   上下に動くのは、このページではこの箱だけ（ページ全体はのびない）
   どこまでスクロールしていたかを覚えて、次に開いたときに戻すのに使う
   （→ 下の「前回の続きから聴けるようにする」） */
const trackScrollRef = ref<HTMLElement | null>(null);

/* ↑↓ で曲の一覧へ入るとき、どのボタンから入ったかを覚えておく

   一覧の上には、いくつかボタンが出ている
   ・止まっているとき … 「▶ 全曲再生」「🔀 シャッフル再生」
   ・再生中           … 「⏸ 一時停止 ／ ▶ 続きから」＋「⏮ 前のトラックへ」「⏭ 次のトラックへ」「■ 停止」（個別・全曲・シャッフル共通）

   一覧のはしで↑↓を押して戻るときは、出てきたボタンへ帰りたい
   （「■ 停止」から入ったのに「⏭ 次のトラックへ」へ帰ると、
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

   切り替わるのは、このページで鳴る音のぜんぶ（曲（mp3）だけ）

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

/* 「🔊 サウンド ON」「🔊✕ サウンド OFF」のボタンを押したとき */
function toggleSound() {
  // ① まず切り替える（ONならOFFへ、OFFならONへ）
  soundEnabled.value = !soundEnabled.value;

  if (soundEnabled.value) {
    /* ② ONに戻したとき

       決定音「ポン♪」は鳴らさない（サントラでは、曲以外の音は出さない） */

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
    pauseElement(soundtrackAudio);
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

   ※ 「■ 停止」などで曲の選択そのものが無くなっていたときは、何も鳴らさない
*/
function resumeAfterSoundOn() {
  pausedBySoundOff = false;

  const track = tracks.value.find((item) => item.id === playingTrackId.value);
  const audio = getSoundtrackAudio();

  if (!audio || !track) {
    return;
  }

  /* OFFのあいだに音量スライダーを動かしていることもあるので、
     鳴らす前に、いまの音量を入れなおしておく */
  try {
    setElementVolume(audio, getTrackVolume(track), getEffectAudioContext);
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
     全曲再生       … 全曲を1回ずつ鳴らしたら止まる

   ■ all（全曲リピート）
     全曲再生が1周したら、また曲順の先頭（＝開始曲）へ戻って鳴らし続ける
     （→ playNextPlaylistTrack で、最後の曲のあとを 0 に回りこませている）
     ※ 1曲だけの再生には効かない（押した1曲は、終わったら止まる）
       個別再生の「⏮ 前のトラックへ」「⏭ 次のトラックへ」も、全曲リピートの曲順は使わず、
       画面の一覧のとなりの曲へ移るだけ（→ playAdjacentSingleTrack）
     ※ 全曲再生・シャッフル再生の「⏮ 前のトラックへ」は、リピートの設定に関係なく、
       曲順の先頭で押せば、曲順の最後へ回りこむ（手で押したときだけの動き。→ playPreviousPlaylistTrack）

   ■ one（1曲リピート）
     いま鳴らしている曲を、ずっとくりかえす
     ブラウザのAudioがもともと持っている loop を true にするだけでよい
     （自分で「終わったらもう一度鳴らす」を書くより、つなぎ目がなめらか）
     loop が true のあいだは「曲が終わった」の知らせ（ended）が来ないので、
     全曲再生の途中でも、次の曲へは進まなくなる
     ※ 「⏮ 前のトラックへ」「⏭ 次のトラックへ」を押せば、いつでも となりの曲へ移れる
       （移った曲が、また1曲リピートで鳴りつづける）
       個別再生・全曲再生・シャッフル再生のどれでも同じ（→ playPreviousTrack / playNextTrack）
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
  /* 決定音「ポン♪」は鳴らさない（サントラでは、曲以外の音は出さない）
     切りかわったことは、ボタンの表示で分かる */
  const currentIndex = repeatOrder.indexOf(repeatMode.value);

  repeatMode.value = repeatOrder[(currentIndex + 1) % repeatOrder.length];

  /* 鳴らしている途中でも、その場で切りかわるようにする
     （1曲リピートにした瞬間から、その曲はくりかえしになる） */
  applyRepeatToAudio();

  saveRepeatSetting();
}

/* ============================================================
   音の作業台（AudioContext）

   曲の音量調整（setElementVolume）と、
   バックグラウンドで音が止まらないようにする処理（keepAudioContextAwake）で使う

   ※ ボタンを押したときの決定音「ポン♪」は鳴らさない
     このページは曲を聴くためのページなので、曲以外の余計な音は出さない
     （トラック番号・リピート・サウンドON・戻る、どれを押しても鳴らない）
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

/* ============================================================
   全曲再生（全曲を1周ぶん、続けて鳴らす）のしくみ

   ・selectedStartTrackId … どの曲から1周を始めるか（トラック番号を押して選ぶ）
   ・isPlaylistPlaying    … いま全曲再生の途中かどうか
   ・playlistTracks       … 今回の1周ぶんの曲順（開始曲から並べ替えたもの）
   ・playlistIndex        … その曲順の何曲目を鳴らしているか（0はじまり）

   曲順は開始曲から後ろへ進み、最後まで行ったら先頭へ回り込む
   （例：03開始 → 03 04 05 06 07 01 02）
   全曲を1回ずつ鳴らし終えたら止まる
   （「🔁 リピート 全曲」のときだけ、また開始曲へ戻ってくりかえす）

   次の曲へ進むのは、つぎの2つのとき（どちらも同じ関数を使う）
   ・曲が最後まで流れきったとき
   ・「⏭ 次のトラックへ」を押して、いまの曲を飛ばしたとき
   → playNextPlaylistTrack() を見ること

   「⏮ 前のトラックへ」を押したときは、同じ曲順の1つ前へ戻る（シャッフルでも、作った順番のまま）
   → playPreviousPlaylistTrack() を見ること（前へ戻るのは、手で押したときだけ）
   ============================================================ */

/* 全曲再生の開始曲（はじめは1曲目。トラック番号を押すと変わる） */
const selectedStartTrackId = ref<number>(tracks.value[0].id);

/* いま全曲再生の途中かどうか */
const isPlaylistPlaying = ref(false);

/* いま鳴らしている曲順が「シャッフルした曲順」かどうか

   全曲再生の中の、さらに細かい区別として使う目印
   ・isPlaylistPlaying … 全曲再生の途中かどうか
   ・isShufflePlaying  … その曲順が、シャッフルで作ったものかどうか

   通常の全曲再生とシャッフル再生は「曲順の作りかた」だけがちがい、
   そのあとの鳴らしかたは まったく同じ
   だから、しくみを丸ごと2つに分けず、この目印を1つ足すだけにしている
   （→ beginPlaylist。曲順を受け取って鳴らすところは、2つで共通）

   使い道は、案内を「♪ 全曲再生中」と「🔀 シャッフル再生中」で出し分けること

   ※ 全曲再生が終わったら（isPlaylistPlaying が false になったら）、
     こちらも かならず false に戻す
     （→ finishPlaylist / stopSoundtrack / playSingleTrackFromStart） */
const isShufflePlaying = ref(false);

/* 今回の1周ぶんの曲順（通常再生なら開始曲から並べ替えたもの、
   シャッフル再生ならランダムに並べ替えたもの）

   ※ どちらの場合も、かならず tracks の「コピー」を入れる
     ここへ tracks そのものを入れてしまうと、
     並べ替えたときに画面の一覧の順番まで変わってしまう */
const playlistTracks = ref<SoundtrackTrack[]>([]);

/* その曲順の何曲目か（0はじまり） */
const playlistIndex = ref(0);

/* 操作行の停止ボタンに出す文字

   いまの聴きかたに合わせて、言いかたを変える
   ・個別再生       … ■ 停止
   ・通常の全曲再生 … ■ 全曲再生を停止
   ・シャッフル再生 … ■ シャッフル再生を停止

   すぐ上の案内（♪ 再生中 / ♪ 全曲再生中 / 🔀 シャッフル再生中）と言いかたをそろえて、
   「シャッフル再生中なのに、全曲再生を停止と書いてある」と
   ちぐはぐに見えないようにするため

   ※ 変わるのは見た目の文字だけ
     押したときの動きは、3つともまったく同じ（→ stopSoundtrack）
   ※ このページのコメントでは、この3つをまとめて「■ 停止」と呼んでいる */
const stopButtonLabel = computed(() => {
  if (!isPlaylistPlaying.value) {
    return '■ 停止';
  }

  return isShufflePlaying.value ? '■ シャッフル再生を停止' : '■ 全曲再生を停止';
});

/* ============================================================
   いま鳴らしている曲を、固定エリアに表示するための3つ（現在曲の表示）

   曲の一覧を下へスクロールしていると、いま鳴っている曲のカードは、
   スクロール範囲の外へ隠れてしまう
   そこで「いま何が鳴っているか」を、いつも見えている固定エリアにも出す
   （→ テンプレートの st-playall__status。全曲再生中だけでなく、個別再生でも出す）

   ※ 曲の一覧は、曲が切りかわって鳴りはじめたときに1回だけ、その曲まで自動でスクロールする
     （→ scrollToPlayingTrack。その曲を聴いているあいだは、見ている場所を動かさない）
   ============================================================ */

/* いま選んでいる曲そのもの（個別再生・全曲再生・シャッフル、どれでも使える）

   playingTrackId から tracks を引くので、全曲再生中だけの曲順（playlistTracks）に頼らず、
   個別再生でも一時停止中でも「いまの曲」を取れる
   （id は tracks の中でただ1つなので、find で1曲に決まる）
   playingTrackId が null（どれも選んでいない）のときは null を返し、
   テンプレート側は、そのあいだ現在曲の表示ごと消す */
const playingTrack = computed(() => tracks.value.find((track) => track.id === playingTrackId.value) ?? null);

/* 操作行（⏮ 前のトラックへ ／ ⏭ 次のトラックへ ／ ■ 停止）を出すかどうか

   曲を選んでいるあいだ（playingTrack がある）は、聴きかたに関係なく出す
   ・個別再生中・個別一時停止中・サウンドOFFで止まっているとき
   ・全曲再生中・シャッフル再生中（一時停止中もふくむ）
   止まっているとき（どの曲も選んでいない）は出さない

   isPlaylistPlaying も見ているのは、全曲再生の途中で曲が鳴らせなかったとき
   （playTrackAudio が playingTrackId を null に戻す）にも、
   前・次・停止を残して、先へ進んだり止めたりできるようにするため
   （前の作りでも、全曲再生中は次へ・停止のならびを出したままにしていた）

   テンプレートの v-if と、矢印キーの行き先（findPlayallVerticalTarget / findOutsidePlayButton）で
   同じこの1つを見るので、画面に出ているならびと、矢印キーの行き先が食いちがわない */
const hasPlaybackControls = computed(() => playingTrack.value !== null || isPlaylistPlaying.value);

/* 固定エリアに出す「いま何をしているか」の目印

   一時停止中（自分で「⏸ 一時停止」した／サウンドOFFで止まった）は、
   「再生中」と偽らずに「⏸ 一時停止中」と出す（→ isPlaying を先に見ている）
   鳴っているときだけ、始めかたに合わせて 全曲再生／シャッフル／個別 を出し分ける */
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

   歌詞のある曲（lyrics を持つ曲）を選んでいるあいだ、現在曲の表示のすぐ下に、
   いま歌っている1行を出す（→ テンプレートの st-lyrics）
   ・どの行を出すかは、曲の何秒目かで決める（歌詞の time → data/sPlusSongLyrics.ts）
   ・最初の行より前（歌が始まる前）は「♪」
   ・一時停止中は、止めたところの行のまま。再生バーで場所を変えたら、その場所の行になる
   ・歌詞の無い曲・曲を選んでいないときは、歌詞の行ごと出さない
   ※ 車の画面・ロック画面には出さない（あちらは曲名のまま → このファイルの「車のステアリング・ロック画面・イヤホンの操作」）
   ============================================================ */

/* いまの曲の歌詞（歌詞の無い曲・曲を選んでいないときは null） */
const playingLyrics = computed(() => playingTrack.value?.lyrics ?? null);

/* いま出している行の番号（-1 … 最初の行より前。「♪」を出す）
   行が変わったときだけ入れなおす（1秒に何十回も同じ値を入れて、画面を作りなおさないため） */
const lyricIndex = ref(-1);

/* 出す歌詞の1行（歌詞の無い曲のときは null） */
const currentLyricText = computed(() => {
  const lyrics = playingLyrics.value;

  if (!lyrics) {
    return null;
  }

  return lyrics[lyricIndex.value]?.text ?? '♪';
});

/* seconds 秒目に出す行の番号（最初の行より前なら -1）
   歌詞は time の小さい順に並んでいるので、上から見ていって、time が seconds をこえたところで止める */
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

/* いまの曲の、いまの秒数に合わせて、出す行を決めなおす */
function updateLyricIndex() {
  const lyrics = playingLyrics.value;
  const index = lyrics && soundtrackAudio ? findLyricIndex(lyrics, soundtrackAudio.currentTime) : -1;

  if (index !== lyricIndex.value) {
    lyricIndex.value = index;
  }
}

/* 歌詞のある曲が鳴っているあいだは、画面を描くたび（requestAnimationFrame）に行を見なおす

   曲が何秒目かの知らせ（timeupdate）は1秒に4回くらいなので、それだけだと行の切りかわりが最大0.25秒おくれる
   歌い出しにぴったり合わせたいので、鳴っているあいだだけ細かく見る
   （画面が見えていないあいだは requestAnimationFrame が止まるが、見えたらすぐ追いつく） */
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

   上の歌詞の1行の「歌詞をぜんぶ見る」を押すと、下の広い場所（ふだんは曲の一覧）が、歌詞の画面に切りかわる
   ・歌詞を1行ずつ、ぜんぶならべる
     いまの行は濃い色で少し大きく、歌いおわった行はうすく出す
   ・曲に合わせて、いまの行が画面の少し上寄り（上から35%）に来るよう、なめらかにスクロールする
   ・手でスクロールしたあと4秒間は、自動ではスクロールしない（読んでいるところを動かさないため）
   ・行を押すと、その行の歌い出しへとぶ
   ・「曲の一覧にもどる」で、曲の一覧に戻る
     曲の一覧は かくしているだけなので、戻ったときは前に見ていた場所のまま
   ・歌詞の無い曲に変わった・停止したときは、自動で曲の一覧に戻る
   ============================================================ */

/* 歌詞の画面を出しているか（false … 曲の一覧を出している） */
const isLyricsView = ref(false);

/* 歌詞の画面のスクロールする箱（自動スクロールに使う） */
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

/* 切りかえのアイコンボタン（→ テンプレートの st-lyricsToggle）
   押すたびに、歌詞の画面 ⇄ 曲の一覧 を切りかえる。名前は、押したときの行き先 */
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

  /* 最初の行より前（-1）は、いちばん上へ
     行の位置は、スクロールする箱の中での位置（いまのスクロール量 ＋ 箱の上のはしからの距離）で測る */
  const line = lyricIndex.value >= 0 ? box.querySelector<HTMLElement>(`[data-lyric-index="${lyricIndex.value}"]`) : null;
  const lineRect = line?.getBoundingClientRect();
  const lineCenter = lineRect ? box.scrollTop + lineRect.top - box.getBoundingClientRect().top + lineRect.height / 2 : 0;
  const top = line ? lineCenter - box.clientHeight * 0.35 : 0;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  box.scrollTo({ top: Math.max(0, top), behavior: smooth && !prefersReducedMotion ? 'smooth' : 'auto' });
}

/* 手でスクロールしたとき（ホイール・指・スクロールバー・キー）は、しばらく自動スクロールを止める
   ※ 自動スクロールでも scroll の知らせは来るので、scroll ではなく「手で動かした」知らせだけを見る */
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

  // 一時停止中に再生バーを動かしたときも、歌詞の行を合わせる（→ updateLyricIndex）
  updateLyricIndex();

  /* どこまで聴いたかを覚えておく（次にこのページを開いたときのため）
     1秒に4回くらい呼ばれるので、覚えるのは1秒に1回までにしている（→ saveLastPlayState） */
  saveLastPlayState();
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

  /* 前回の続きの位置が残っていたら、ここで入れる

     曲の長さが分かる前には入れられないブラウザもあるので、
     読み込めたこのタイミングでも入れなおしている（入るのは1回だけ） */
  applyPendingStartTime(soundtrackAudio, playingTrackId.value);
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
     （「次の曲へ進む」書きかたを2か所に分けて持たないようにするため）
     ※ ボタン用の playNextTrack() は通さず、全曲再生用を直接呼ぶ
       playNextTrack() は、個別再生のときは となりの曲へ移ってしまうが、
       曲が自然に終わったときに次へ進むのは、全曲再生・シャッフル再生だけにしたいため */
  if (isPlaylistPlaying.value) {
    playNextPlaylistTrack();

    return;
  }

  /* 1曲だけの再生のときは、そこで停止

     個別再生中も操作行（⏮ 前／⏭ 次／■ 停止）は出ているが、
     前・次は押したときだけ曲を変える、手動の操作（→ playAdjacentSingleTrack）
     曲が終わったからといって、自動で次の曲へは進めない
     （続けて聴きたいときは「▶ 全曲再生」「🔀 シャッフル再生」を使う）
     曲の選択が無くなるので、操作行も画面から消える */
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

/* いまの曲を止めて、track へ差しかえ、先頭から鳴らす（ちがう曲へ切りかえるとき）

   「止める → 差しかえる → 鳴らす」の順番は今までと同じ
   ちがうのは、鳴っている曲を「すっと」止めてから差しかえること
   iPhone・iPad では、いきなり止めると「ぶつっ」と雑音が出るので、
   音量を一瞬で下げきってから止めて、そのあとで差しかえる（→ utils/elementVolume.ts の pauseElementThen()）
   ・差しかえが遅れるのは、iPhone・iPad で曲が鳴っている最中だけ（約0.08秒。耳ではほぼ分からない）
   ・止まっているとき・曲が終わって次へ進むとき・パソコンでは、今までどおり その場で差しかわる
   ・止めている途中に連打されたときは、いちばん最後に押した曲だけへ差しかわる

   Audioは1つだけを使いまわしているので、この順番を守れば、2曲が同時に鳴ることは起こらない */
function switchTrackAudio(audio: HTMLAudioElement, track: SoundtrackTrack) {
  pauseElementThen(audio, () => {
    try {
      audio.src = track.src;
      setElementVolume(audio, getTrackVolume(track), getEffectAudioContext);
      audio.currentTime = 0; // 新しい曲を先頭から鳴らす
    } catch {
      // 何もしない
    }

    /* 新しい曲を鳴らす
       （リピートの設定もここで入るので、1曲リピート中なら、新しい曲がくりかえしになる） */
    playTrackAudio(audio, track);
  });
}

/* 曲を鳴らしはじめる（再生できなかったときは、表示を停止中へ戻す） */
function playTrackAudio(audio: HTMLAudioElement, track: SoundtrackTrack) {
  /* いまのリピートの設定を入れておく
     （どこから鳴らしはじめても、かならずここを通る） */
  applyRepeatToAudio(audio);

  /* 前回の続きの位置が、まだ入っていなければ ここで入れる
     （開いてすぐ「▶ 続きから」を押されて、曲の長さが分かるより先にここへ来たとき）
     ふだんの再生では、入れるものが無いので何も起きない */
  applyPendingStartTime(audio, track.id);

  // この再生指示の番号を取っておく（あとで「まだ最新の指示か」を見分けるため）
  playRequestId += 1;

  const requestId = playRequestId;

  playingTrackId.value = track.id;
  isPlaying.value = true;

  try {
    // 止めている途中（音量を下げている最中）なら、その予約を取り消してから鳴らす
    cancelElementPause(audio);

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
   （playingTrackId が null になるので、現在曲の表示・再生バー・操作行も、自動で画面から消える）
   使うのは、このページを見たまま止めるとき
   ・操作行の「■ 停止」を押したとき
     個別再生・全曲再生・シャッフル再生のどれでも、この1つの関数を使う
     （文字は「■ 停止」「■ 全曲再生を停止」「■ シャッフル再生を停止」と変わるが、やることは同じ）
     個別再生のときに、全曲再生の覚えごと（playlistTracks など）まで戻しても困らない
     （全曲再生中でなければ使われず、次に全曲再生を始めるときは作り直すため）
     なので、個別再生用の停止の関数は、わざわざ別に作っていない
   ・このページから離れて、画面が消えたあとの後片付け（onUnmounted）

   ※ ページを移る「直前」には使わない
     表示が先に消えてしまい、画面がバタバタして見えるため
     そのときは下の stopAudioForNavigation()（音だけ止める）を使う */
function stopSoundtrack() {
  if (soundtrackAudio) {
    try {
      pauseElement(soundtrackAudio, { rewind: true }); // 曲の先頭へ戻す
    } catch {
      // 止められなくても、表示だけはそろえる
    }
  }

  playingTrackId.value = null;
  isPlaying.value = false;

  // 全曲再生の途中だったときも、ここで終わりにする
  isPlaylistPlaying.value = false;

  /* シャッフル再生のための覚えごとも、ここでまっさらに戻す

     ・isShufflePlaying … シャッフル中の目印
     ・playlistTracks   … 今回の1周ぶんの曲順
     ・playlistIndex    … その何曲目か

     こうしておくと、次に「▶ 全曲再生」「🔀 シャッフル再生」を押したときは、
     かならず曲順から作り直される（前回の曲順が残らない）

     ※ ここを通るのは操作行の「■ 停止」と、ページを離れたあとの
       後片づけ（onUnmounted）だけ
       ページを移る直前の stopAudioForNavigation() では、
       表示にかかわるこれらの覚えごとは いっさいさわらない */
  isShufflePlaying.value = false;
  playlistTracks.value = [];
  playlistIndex.value = 0;

  // 再生バーも先頭へ戻しておく
  currentTime.value = 0;

  /* 「■ 停止」を押すと、操作行（前／次／停止）ごと画面から消えるので、
     消えたボタンの代わりに「▶ 全曲再生」へフォーカスを移す（個別再生の停止でも同じ）

     ・移すのは、どこにもフォーカスが無くなったときだけ（→ focusAfterPlaylistChange）
       キーボードで「■ 停止」を押したときは、押したボタンが消えてフォーカスが無くなるので、ここで戻す
     ・マウス・タッチで押したときも ここを通るが、ブラウザは直前の操作がマウス・タッチなら、
       プログラムで移したフォーカスに :focus-visible の枠をふつう出さない
       （キーボードで押したときだけ、どこへ移ったかが枠で分かる。全曲再生の停止と同じ考えかた）
     ※ ページから離れるときの後片付け（onUnmounted）でもここを通るが、
       そのときボタンはもう無い（ref は null）ので、何も起きないだけ */
  focusAfterPlaylistChange(playAllButtonRef);
}

/* もうタイトル画面へ移動しはじめたかどうか（連打よけ）
   画面に出す数字ではないので、ref ではなくふつうの入れものでよい */
let isLeavingPage = false;

/* ページを離れる直前に「音だけ」止める

   上の stopSoundtrack() との違いは、画面の表示にさわるかどうか

   ・stopSoundtrack()        … 音を止めて、画面の表示も止まった状態に戻す
                               （「■ 停止」を押したときなど、
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
    pauseElement(soundtrackAudio, { rewind: true }); // 曲の先頭へ戻す
  } catch {
    // 止められなくても、このあとページごと消えるので何もしない
  }
}

/* ============================================================
   前回の続きから聴けるようにする（曲・再生位置・一覧のスクロール位置を覚える）

   ■ やりたいこと
     このページを離れて、また戻ってきたときに
     ・前に選んでいた曲
     ・その曲のどこまで聴いたか（再生位置）
     ・曲の一覧をどこまでスクロールしていたか
     の3つを、前と同じ状態に戻す

   ■ 戻すのは「一時停止のかたち」まで（勝手には鳴らさない）
     ブラウザには「ユーザーがまださわっていないページで、勝手に音を鳴らしてはいけない」
     という決まりがある。開いたとたんに鳴らそうとしても止められてしまうので、
     曲と再生位置だけを戻しておいて、鳴らすのは「▶ 続きから」を押してもらってから
     （押すと、戻しておいた位置から続きが鳴る）

   ■ 覚え先は localStorage
     このページの音量・サウンドON/OFF・リピートと同じ覚えかたにそろえてある
     読み書きはどちらもブラウザの中だけ（onMounted より前には動かない）なので、
     サーバー側で作った画面と食いちがう（hydration mismatch）ことはない

   ■ 歌詞の画面も覚える
     「歌詞をぜんぶ見る」で歌詞の画面を出したまま離れたときは、また歌詞の画面のまま開く
     （そのあいだ、曲の一覧のスクロール位置は覚えなおさない。
       かくれている箱の scrollTop は 0 になるので、前に見ていた場所が消えてしまうため）

   ■ 全曲再生・シャッフル再生の「途中」も覚える
     曲と再生位置だけでなく、そのとき作られていた1周ぶんの曲順（playlistTracks）と、
     その何曲目か（playlistIndex）、シャッフルかどうか（isShufflePlaying）もいっしょに覚える
     戻すと「全曲再生を一時停止している」状態になり、「▶ 続きから」を押すと
     続きが鳴って、その曲が終われば、覚えていた曲順のとおりに次の曲へ進む

   ■ 覚えるタイミング
     ・曲が進んでいるあいだ … 1秒に1回まで（→ saveLastPlayState の throttle）
     ・曲・再生/一時停止・全曲再生の状態が変わったとき … 下の watch
     ・このページを離れるとき … goToTitle() と onUnmounted()（止める前に最後の1回）
     「■ 停止」を押したときは playingTrackId が null になるので、覚えごとも消える
     （止めた人に、次もまた同じ曲を見せないため）

   ■ 一覧のスクロール位置と「再生中の曲への自動追従」がけんかしないように
     ・開いた直後 … 覚えていたスクロール位置へ戻す。
                    このとき、曲を戻したことで動く「自動追従」は1回だけ止める
                    （→ skipNextPlayingTrackScroll。戻した位置が上書きされないように）
     ・そのあと   … ふつうどおり、曲が切りかわったら自動追従する
     ・戻した曲を「▶ 続きから」で鳴らしはじめたときも、そこで1回だけ自動追従する
                    （→ scrollAfterRestoreOnPlay。鳴りはじめてからは、追従のほうを優先する）
   ============================================================ */

/* 前回の曲と再生位置を覚えておく名前（localStorageのキー）

   中身は、こんな短いJSONの文字
   ・1曲だけの再生 … {"id":3,"time":42.5}
   ・全曲再生の途中 … {"id":3,"time":42.5,"playlist":{"shuffle":false,"ids":[1,2,3,4],"index":2}}
     ids … その1周ぶんの曲順（曲の番号だけ。シャッフルならシャッフルされた順）
     index … いま何曲目か（ids の何番目か）
   ・歌詞の画面を出していた … {"id":8,"time":42.5,"lyrics":true}

   ※ playlist が入っていない、前のかたちのメモも、そのまま「1曲だけの再生」として読める */
const lastPlayStorageKey = 'kouchan-soundtrack-last-play';

/* 曲の一覧のスクロール位置を覚えておく名前（localStorageのキー）
   中身は '240' のような、上からの距離（px）の文字 */
const trackScrollStorageKey = 'kouchan-soundtrack-list-scroll';

/* 最後に覚えた時刻（ミリ秒）。1秒に1回までにするために使う
   ※ 画面に出す数字ではないので、ref ではなくふつうの入れものでよい */
let lastPlayStateSavedAt = 0;
let trackScrollSavedAt = 0;

/* もう覚えごとを書きかえないかどうか（このページを離れるときに true にする）

   「戻る」を押したあと・画面が消えたあとには、
   音を止める後始末（currentTime = 0）で「0秒から」と書きかえてしまわないよう、
   最後の1回を覚えたところで、それ以上さわらないようにする */
let isLastStateFixed = false;

/* 読み込んだmp3の用意ができたら入れなおす「続きの位置」（秒）と、その曲の番号

   曲の長さが分かる前に currentTime を入れても、ブラウザによっては効かないことがある
   そこで、いったんここに置いておき
   ・曲の長さが分かったとき（→ handleLoadedMetadata）
   ・「▶ 続きから」で鳴らしはじめるとき（→ playTrackAudio）
   の早いほうで入れて、入れたら null に戻す（入るのは1回だけ）

   曲の番号もいっしょに覚えているのが大事
   戻した曲を鳴らさずに、別の曲や「▶ 全曲再生」を押されたときに、
   新しい曲が とちゅうから鳴ってしまわないようにするため
   （番号がちがえば、入れずに捨てる） */
let pendingStartTime: number | null = null;
let pendingStartTrackId: number | null = null;

/* 次に「曲が切りかわった」ときの自動追従を、1回だけ止めるかどうか
   （開いた直後に、覚えていた曲を戻したときだけ true にする） */
let skipNextPlayingTrackScroll = false;

/* 戻した曲を鳴らしはじめたときに、1回だけ自動追従するかどうか */
let scrollAfterRestoreOnPlay = false;

/* 覚えておいた「続きの位置」を、Audioへ入れる（入れられるのは1回だけ）

   曲の長さが分かる前でも、いまのブラウザは
   「読み込めたら、その位置から鳴らす」と覚えておいてくれる
   （ここで入れられなかったときのために、handleLoadedMetadata からも呼んでいる） */
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
    /* 読み込む前は受けつけないブラウザもあるので、そのときは覚えなおして、あとでもう一度入れる
       （曲の長さが分かったとき → handleLoadedMetadata ／ 鳴らしはじめるとき → playTrackAudio） */
    pendingStartTime = seconds;
    pendingStartTrackId = targetTrackId;

    return;
  }

  currentTime.value = seconds;
}

/* いまの曲と再生位置を覚えておく（次にこのページを開いたときのため）

   force … true のときは、1秒に1回の制限をかけずにかならず覚える
           （ページを離れるときなど、最後の1回を取りこぼさないため）
*/
function saveLastPlayState(force = false) {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client || isLastStateFixed) {
    return;
  }

  /* 続きの位置を入れなおす前（読み込み中）は、まだ覚えない
     ここで覚えると、入れなおす前の0秒で上書きしてしまうため */
  if (pendingStartTime !== null) {
    return;
  }

  const now = Date.now();

  if (!force && now - lastPlayStateSavedAt < 1000) {
    return;
  }

  lastPlayStateSavedAt = now;

  try {
    /* どの曲も選んでいないとき（「■ 停止」・曲が終わったとき）は、覚えごとを消す
       次に開いたときは、前と同じ「まだ何も選んでいない」状態ではじまる */
    if (playingTrackId.value === null) {
      localStorage.removeItem(lastPlayStorageKey);

      return;
    }

    /* 全曲再生・シャッフル再生の途中なら、その曲順もいっしょに覚える
       （1曲だけの再生のときは playlist を入れない＝そのぶんメモも短くなる） */
    const playlist = isPlaylistPlaying.value
      ? {
          shuffle: isShufflePlaying.value,
          ids: playlistTracks.value.map((item) => item.id),
          index: playlistIndex.value,
        }
      : undefined;

    /* 歌詞の画面を出していたかどうかも覚える（出していないときは入れない）
       ※ 歌詞の画面を出したまま離れて、また戻ってきたときに、歌詞のまま開くため */
    const lyrics = isLyricsView.value ? true : undefined;

    localStorage.setItem(lastPlayStorageKey, JSON.stringify({ id: playingTrackId.value, time: Math.max(0, currentTime.value), playlist, lyrics }));
  } catch {
    // ブラウザの設定で保存できないことがある
    // 覚えられなくても、このページを開いているあいだの再生はふつうに動く
  }
}

/* 曲の一覧のスクロール位置を覚えておく（force の意味は saveLastPlayState と同じ） */
function saveTrackScroll(force = false) {
  if (!import.meta.client || isLastStateFixed) {
    return;
  }

  /* 歌詞の画面を出しているあいだは、覚えない

     曲の一覧はかくれていて（v-show ＝ display: none）、
     かくれた箱には大きさが無いので、scrollTop はいつも 0 になる
     そのまま覚えると、前に見ていた場所が 0 で上書きされてしまう
     （歌詞のまま離れて、また戻ってきたときに、一覧がいちばん上に戻ってしまっていた） */
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

/* 曲の一覧をスクロールしたとき（指・マウス・キーボード・自動追従のどれでも呼ばれる） */
function handleTrackScroll() {
  saveTrackScroll();
}

/* このページを離れるときに、最後の状態を覚えて、それ以上は書きかえないようにする

   呼ぶのは、音を止める「前」
   止めると再生位置が0秒に戻ってしまい、そのあと覚えると「0秒から」になってしまうため */
function fixLastState() {
  saveLastPlayState(true);
  saveTrackScroll(true);

  isLastStateFixed = true;
}

/* 覚えておいた「全曲再生・シャッフル再生の途中」を戻す

   戻すのは、つぎの3つ
   ・その1周ぶんの曲順（playlistTracks）
   ・いま何曲目か（playlistIndex）
   ・シャッフルかどうか（isShufflePlaying）

   ■ 戻さないとき（1曲だけの再生としてあつかう）
     ・メモに playlist が入っていない（1曲だけの再生だった・前のかたちのメモ）
     ・曲順がこわれている
     ・曲順の中に、いま鳴らそうとしている曲が見あたらない
       （たとえば、覚えたあとにブラウザを変えて、ボーナストラックが一覧から消えたとき）

   ■ もう一覧に無い曲は、曲順から外す
     外したぶん番号がずれるので、いま鳴らす曲が「何曲目か」は、
     覚えていた index ではなく、作り直した曲順の中から探しなおす

   playingTrack … いま戻そうとしている曲（この曲が、曲順の中のどこかにいるはず）
*/
function restorePlaylist(playlist: unknown, playingTrack: SoundtrackTrack) {
  if (typeof playlist !== 'object' || playlist === null) {
    return;
  }

  const { shuffle, ids } = playlist as { shuffle?: unknown; ids?: unknown };

  if (!Array.isArray(ids)) {
    return;
  }

  /* 覚えていた曲順を、いまの曲の一覧で組み立て直す
     （もう一覧に無い曲は、ここで落ちる） */
  const orderedTracks = ids
    .map((savedId) => (typeof savedId === 'number' ? tracks.value.find((item) => item.id === savedId) : undefined))
    .filter((item): item is SoundtrackTrack => item !== undefined);

  const index = orderedTracks.findIndex((item) => item.id === playingTrack.id);

  // 曲順の中に、いま戻す曲がいないときは、1曲だけの再生としてあつかう
  if (index === -1) {
    return;
  }

  playlistTracks.value = orderedTracks;
  playlistIndex.value = index;
  isPlaylistPlaying.value = true;
  isShufflePlaying.value = shuffle === true;
}

/* 前回の曲と再生位置を思い出して、一時停止のかたちで戻す

   ・覚えごとが無い／こわれている／もう無い曲だったときは、何もしない
     （ボーナストラックは、解放していないと一覧に出ないので、ここで弾かれる）
   ・音は鳴らさない（鳴らすのは「▶ 続きから」を押してもらってから）
*/
function restoreLastPlayState() {
  if (!import.meta.client) {
    return;
  }

  let saved: unknown = null;

  try {
    const text = localStorage.getItem(lastPlayStorageKey);

    saved = text === null ? null : JSON.parse(text);
  } catch {
    // こわれたメモが入っていたときは、何も戻さない（ふつうに開くだけ）
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

  /* 曲を戻すと「曲が切りかわった」ことになり、自動追従が動いてしまう
     ここでは、覚えていたスクロール位置のほうを優先したいので、1回だけ止める
     （鳴らしはじめたときに、あらためて1回だけ追従する） */
  skipNextPlayingTrackScroll = true;
  scrollAfterRestoreOnPlay = true;

  playingTrackId.value = track.id;
  isPlaying.value = false;
  currentTime.value = seconds;
  duration.value = 0; // 曲の長さは、mp3を読み込めたら handleLoadedMetadata が入れる

  // 全曲再生・シャッフル再生の途中だったなら、その曲順も戻す
  restorePlaylist(playlist, track);

  /* 歌詞の画面を出したまま離れていたなら、歌詞の画面のまま開く（うた入りの曲のときだけ）

     いまの行は、曲の何秒目かで決まる（→ updateLyricIndex）
     戻した位置がAudioへ入ったところで行も決まり、その行まで自動でスクロールする
     （開きかたは「歌詞をぜんぶ見る」を押したときと同じ openLyricsView） */
  if (lyrics === true && track.lyrics) {
    openLyricsView();
  }

  try {
    /* preload … 開いただけで曲まるごと（数MB）を読み込ませない
       曲の長さと、続きの位置に必要なところだけにしておく
       （「▶ 続きから」を押せば、そこから先はふつうに読み込まれる） */
    audio.preload = 'metadata';
    audio.src = track.src;
    setElementVolume(audio, getTrackVolume(track), getEffectAudioContext);
  } catch {
    // 用意できなくても、曲を選んだ表示のままにしておく（押せば先頭から鳴る）
  }

  // 続きの位置は、読み込めてから入れる（→ applyPendingStartTime）
  pendingStartTime = seconds > 0 ? seconds : null;
  pendingStartTrackId = seconds > 0 ? track.id : null;

  applyPendingStartTime(audio, track.id);
}

/* 覚えておいた、曲の一覧のスクロール位置に戻す

   一覧のカードがぜんぶ並んだあと（nextTick のあと）に呼ぶこと
   （ボーナストラックの解放で曲数が変わるため。短いうちに戻すと、そこまで動けない）
*/
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

    /* 一覧が前より短いときは、いちばん下で止まる（ブラウザがそろえてくれる）
       なめらかな動きはさせない。開いたとたんに動いて見えると落ち着かないため */
    scrollArea.scrollTop = saved;
  } catch {
    // 戻せなくても、いちばん上から読めるだけ
  }
}

/* 曲・再生/一時停止・全曲再生の状態・歌詞の画面が変わったら、そのたびに覚えておく
   （1秒に1回の制限はかけない）

   全曲再生の状態まで見ているのは、曲は変わらないまま
   「全曲再生をやめて1曲だけの再生になる」ようなときも、覚えなおすため
   歌詞の画面も、開け閉めしたその場で覚えておく */
watch([playingTrackId, isPlaying, isPlaylistPlaying, isShufflePlaying, playlistIndex, isLyricsView], () => {
  saveLastPlayState(true);
});

/* 戻した曲を鳴らしはじめたときだけ、その曲のカードまで1回スクロールする

   ふだんの「一時停止 → 続きから」では動かさない（見ている場所を奪わないため）
   開いた直後に戻した曲は、自動追従を1回見送っているので、ここで追いつかせている */
watch(isPlaying, (playing) => {
  if (!playing || !scrollAfterRestoreOnPlay) {
    return;
  }

  scrollAfterRestoreOnPlay = false;

  nextTick(scrollToPlayingTrack);
});

/* トラック番号を押したときに、その曲を「全曲再生の開始曲」にする

   ここでは曲は鳴らさない（開始曲を選ぶだけ）
   実際に鳴らすのは「▶ 全曲再生」を押したとき
*/
function selectStartTrack(track: SoundtrackTrack) {
  // 決定音「ポン♪」は鳴らさない（選べたことは、トラック番号の表示で分かる）

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

/* ============================================================
   曲順をシャッフルする（Fisher-Yates シャッフル）

   ■ いちばん大事な約束
     渡された配列（tracks）は、ぜったいに書きかえない
     まず [...list] でコピーを作り、そのコピーだけを並べかえて返す

     もし tracks そのものを並べかえてしまうと、
     画面の曲一覧（v-for="track in tracks"）の順番まで変わってしまい、
     「01 → 03 → 02 …」のようにバラバラに表示されてしまう
     シャッフルしたいのは「鳴らす順番」だけなので、かならずコピーを作る

   ■ Fisher-Yates（フィッシャー・イェーツ）とは
     トランプを配るときのような、公平なまぜかた

       ① いちばん後ろの席（i）を決める
       ② 先頭から その席まで の中から、くじで1つ選ぶ（j）
       ③ その2つを入れかえる
       ④ 1つ手前の席へ移って、①へ戻る（先頭まで来たら終わり）

     こうすると、どの並びも同じ確率で出てくる
     入れかえる回数も、曲数ぶんだけ（7曲なら6回）で終わる

   ■ list.sort(() => Math.random() - 0.5) を使わない理由
     いっけん短く書けるが、並びのかたよりが出てしまう
     （並べかえの規則がその場その場で変わるので、
       ブラウザの sort が正しく動く前提がくずれるため）
     そのうえ sort は元の配列を書きかえてしまうので、
     うっかり tracks に使うと、画面の一覧まで並べかわってしまう
============================================================ */
function shuffleTracks(list: SoundtrackTrack[]) {
  // ① まずコピーを作る（[...list] ＝ 中身を新しい箱へ入れ直す書きかた）
  const shuffled = [...list];

  // ② うしろの席から順に、「その席までのどこか」と中身を入れかえていく
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    // 0 から i までの中から、くじで1つ選ぶ
    const j = Math.floor(Math.random() * (i + 1));

    // i番目 と j番目 を入れかえる（片方を いったん keep によけておく）
    const keep = shuffled[i];

    shuffled[i] = shuffled[j];
    shuffled[j] = keep;
  }

  // ③ 並べかえ終わったコピーを返す（元の list は、ここまで一度もさわっていない）
  return shuffled;
}

/* 全曲再生を始める（通常順・シャッフル順の どちらもここを通る）

   「▶ 全曲再生」と「🔀 シャッフル再生」のちがいは、
   ここへ渡す曲順（orderedTracks）の作りかただけ

   ・▶ 全曲再生     … 開始曲から並べかえたコピー（→ startPlaylist）
   ・🔀 シャッフル再生 … ランダムに並べかえたコピー（→ startShufflePlaylist）

   曲順を受け取ったあとの
   「止める → 曲順を入れる → 先頭の曲を鳴らす」は、まったく同じなので、
   ここ1か所にまとめてある
   （曲が終わったら次へ、⏭ 次のトラックへ、⏮ 前のトラックへ、1周したら終わり、も
     playNextPlaylistTrack / playPreviousPlaylistTrack / finishPlaylist を そのまま共通で使う）

   orderedTracks … 今回の1周ぶんの曲順（かならず tracks のコピー）
   shuffled      … その曲順がシャッフルで作ったものかどうか（案内の出し分けに使う）
*/
function beginPlaylist(orderedTracks: SoundtrackTrack[], shuffled: boolean) {
  /* サウンドOFFのときに押されたら、ONへ戻してから鳴らす
     （押しても何も起きないボタンにしないため。→ ensureSoundEnabled） */
  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    return;
  }

  /* 曲が1つも無いときは、鳴らすものがないので何もしない
     （tracks を空にしないかぎり、ここは通らない） */
  if (orderedTracks.length === 0) {
    return;
  }

  /* 今回の1周ぶんの曲順として覚える

     ここで前の曲順は捨てられるので、
     「通常再生 → シャッフル」「シャッフル → 通常再生」と押しかえても、
     前の曲順が残ってしまうことはない
     （シャッフルをもう一度押したときも、新しい曲順で始まる） */
  playlistTracks.value = orderedTracks;
  playlistIndex.value = 0;
  isPlaylistPlaying.value = true;
  isShufflePlaying.value = shuffled;

  /* 曲の一覧へ入るときの「どのボタンから入ったか」の覚えは、いったん忘れる

     ここから上のボタンが3段（ツールバー → スターター → 操作行）になり、
     一覧へ入れるボタンが変わるため
     前回の「▶ 全曲再生」を覚えたままだと、一覧から↑で戻るときに、
     いま出ている操作行（⏮ 前／⏭ 次／■ 停止）を飛びこしてしまう
     （個別再生の途中から始めたときも、ここで忘れて「⏭ 次のトラックへ」へ帰すようにそろえる） */
  lastOutsideButton = null;

  const firstTrack = playlistTracks.value[playlistIndex.value];

  // 再生バーをリセットする
  currentTime.value = 0;
  duration.value = 0;

  // いまの再生を止めて、1周の1曲目へ差しかえて鳴らす
  switchTrackAudio(audio, firstTrack);

  /* 再生を始めると、押した「▶ 全曲再生／🔀 シャッフル再生」は画面から消えて、
     同じ場所に「⏸ 一時停止」が出てくる（→ テンプレートの st-playall__transport）
     押したボタンが消えるとフォーカスの行き先が無くなるので、同じ場所の「⏸ 一時停止」へ移す
     （キーボードで押したなら、そのまま Enter でもう一度押せば止められる）
     ※ 移すのは、フォーカスが行き場を失ったときだけ（→ focusAfterPlaylistChange） */
  focusAfterPlaylistChange(playPauseButtonRef);
}

/* 「▶ 全曲再生」を押したとき

   開始曲から1周ぶんの曲順を作り、その先頭から鳴らしはじめる
   例）03開始 → [03, 04, 05, 06, 07] ＋ [01, 02] → 03 04 05 06 07 01 02

   ※ slice は「切り取ったコピー」を返すので、元の tracks は書きかわらない
   ※ シャッフル再生の途中で押されたときも、ここを通って通常順に切りかわる
     （beginPlaylist が、前の曲順も isShufflePlaying も入れかえてくれる）
*/
function startPlaylist() {
  // 開始曲の位置を探す（見つからなければ先頭から）
  const startIndex = tracks.value.findIndex((track) => track.id === selectedStartTrackId.value);
  const begin = startIndex >= 0 ? startIndex : 0;

  /* 開始曲から最後まで ＋ 先頭から開始曲の直前まで をつなげて、1周ぶんの曲順にする */
  beginPlaylist([...tracks.value.slice(begin), ...tracks.value.slice(0, begin)], false);
}

/* 「🔀 シャッフル再生」を押したとき

   曲順をランダムに並べかえて、その先頭から鳴らしはじめる
   例）[03, 07, 01, 04, 06, 02, 05] のような順で、全曲を1回ずつ

   ■ 順番は「始めるとき」に1回だけ決める
     次の曲へ進むたびに くじを引く作りにはしていない
     そうすると同じ曲が2回鳴ったり、鳴らない曲が出たりするため
     先に順番を決めておけば、あとは通常の全曲再生とまったく同じしくみで、
     全曲を1回ずつ鳴らして終われる

   ■ 開始曲（selectedStartTrackId）は使わない
     どの曲から始まるかも、シャッフルにまかせるため
     （開始曲の選択そのものは消さない。「▶ 全曲再生」を押せば、また使われる）

   ※ もう一度押したときは、また新しくシャッフルし直される
     （shuffleTracks が毎回、新しいコピーを作って並べかえるため）
*/
function startShufflePlaylist() {
  beginPlaylist(shuffleTracks(tracks.value), true);
}

/* 全曲再生を終わりにする

   ここへ来るのは、つぎの2つのとき
   ・1周ぶん（全曲）を鳴らし終えたとき
   ・最後の曲で「⏭ 次のトラックへ」を押したとき

   鳴っている曲を止めて、全曲再生のための覚えごとをまっさらに戻す
   playlistTracks も空にするので、
   次にもう一度「▶ 全曲再生」を押したときは、曲順をあらためて作りなおす
   （開始曲の選択（selectedStartTrackId）は変えないので、そのまま残る）
*/
function finishPlaylist() {
  if (soundtrackAudio) {
    try {
      pauseElement(soundtrackAudio, { rewind: true }); // 曲の先頭へ戻す
    } catch {
      // 止められなくても、表示だけはそろえる
    }
  }

  playingTrackId.value = null;
  isPlaying.value = false;
  isPlaylistPlaying.value = false;

  /* シャッフルの目印も消す
     （次に「▶ 全曲再生」を押したときに「🔀 シャッフル再生中」と
       出てしまわないよう、全曲再生を終えるときは かならず false に戻す） */
  isShufflePlaying.value = false;

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
   ② 「⏭ 次のトラックへ」を押したとき … 操作行のボタンから（playNextTrack() が、全曲再生中だけ呼ぶ）

   どちらの場合も、やることは同じ
   「playlistIndex を1つだけ進めて、その曲を先頭から鳴らす」

   ※ playlistTracks（今回の曲順）は作りなおさない
     「▶ 全曲再生」「🔀 シャッフル再生」を押したときに作った曲順を、最後までそのまま使う

   1周ぶんを鳴らし終えたあとは、リピートの設定で行き先が変わる
   ・🔁 リピート 全曲 … 曲順の先頭（＝開始曲）へ戻って、もう1周する
   ・それ以外         … そこで全曲再生を終わりにする
   （最後の曲で「⏭ 次のトラックへ」を押したときも同じ。「前」とちがい、ここは回りこませない）

   ※ 個別再生のときの「⏭ 次のトラックへ」は、この関数を通らない
     この関数は playlistTracks / playlistIndex（全曲再生の曲順）を前提にしているため
     個別再生の前後移動は、画面の一覧の順番（tracks）でたどる playAdjacentSingleTrack() が受け持つ
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

  // その曲を先頭から鳴らす（「⏮ 前のトラックへ」と同じ切りかえなので、playPlaylistTrackAt にまとめてある）
  playPlaylistTrackAt(nextIndex);
}

/* 全曲再生中に、1つ前の曲へ戻る（「⏮ 前のトラックへ」を押したとき）

   ここへ来るのは、ボタンを押したときだけ（playPreviousTrack() が、全曲再生中だけ呼ぶ）
   曲が自然に終わったときに、前へ戻ることはない（自然に進むのは playNextPlaylistTrack だけ）

   ■ 戻る先は、今回の曲順（playlistTracks）の1つ前
     画面の一覧の順番（tracks）ではなく、「▶ 全曲再生」「🔀 シャッフル再生」を押したときに作った曲順を使う
     たとえばシャッフルで 04 → 01 → 07 → 03 → … という順番になっていたら、
     07 で「前」→ 01、07 で「次」→ 03
     （通常の全曲再生なら、開始曲から並べた曲順の1つ前）

   ■ くじは引きなおさない
     playlistTracks は作りなおさず、playlistIndex を1つ戻すだけ
     押すたびに新しくシャッフルすると、さっき聴いていた曲へ戻れなくなり、
     1周のあいだに同じ曲が2回鳴ったり、鳴らない曲が出たりしてしまうため

   ■ 曲順の先頭（playlistIndex が 0）で押したときは、曲順の最後へ回りこむ
     ユーザーがはっきり「前へ」と押した手動の操作なので、行き止まりにはしない
     （リピートの設定には関係なく回りこむ。「次」で最後の曲を押したときの動きは、今までどおり変えていない）

   ■ 全曲再生モードのまま
     isPlaylistPlaying・isShufflePlaying は変えない（案内の「N / 曲数」も1つ戻る）
*/
function playPreviousPlaylistTrack() {
  // 全曲再生中でなければ、何もしない（個別再生の前へは playAdjacentSingleTrack の受け持ち）
  if (!isPlaylistPlaying.value) {
    return;
  }

  // 曲順が空なら、戻る先が無いので何もしない
  if (playlistTracks.value.length === 0) {
    return;
  }

  // 1つ前の番号（0 より前になったら、曲順の最後へ回りこむ）
  const previousIndex = playlistIndex.value - 1 < 0 ? playlistTracks.value.length - 1 : playlistIndex.value - 1;

  playPlaylistTrackAt(previousIndex);
}

/* 全曲再生の曲順（playlistTracks）の「index 番目」の曲へ切りかえて、先頭から鳴らす

   「⏭ 次のトラックへ」（→ playNextPlaylistTrack）と
   「⏮ 前のトラックへ」（→ playPreviousPlaylistTrack）は、行き先の番号の決めかただけがちがい、
   その曲へ切りかえるところは まったく同じなので、ここ1か所にまとめてある

   index … playlistTracks の何番目か（0はじまり。呼ぶ側で、はみ出さない番号にしてから渡す）
*/
function playPlaylistTrackAt(index: number) {
  /* サウンドOFFのときに「前」「次」を押されたら、ONへ戻してから鳴らす
     （曲が最後まで流れてここへ来たときは、もうONなので何も起きない） */
  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    // 音が使えなくなったら、全曲再生も終わりにする
    finishPlaylist();

    return;
  }

  /* 先に「何曲目か」を入れかえる
     こうしておくと、「2 / 7」の表示のまま音だけ別の曲になる、ということが起きない
     （「N / 曲数」の表示は、この番号を見ている） */
  playlistIndex.value = index;

  const track = playlistTracks.value[index];

  /* 行き先の曲を先頭から鳴らすので、再生バーの表示もいったん最初の状態に戻す

     曲の長さ（duration）は、新しいmp3を読み込むまで分からない
     前の曲の長さが残っているとバーの目盛りがずれるので 0 に戻し、
     handleLoadedMetadata() が新しい長さを入れなおすのを待つ */
  currentTime.value = 0;
  duration.value = 0;

  /* いまの曲を完全に止めて（＝その場で終了）、行き先の曲へ差しかえて先頭から鳴らす

     差しかえるとファイルが変わるので、どこまで聴いたかは覚えない
     あとでその曲へ戻ってきても「続きから」ではなく、先頭から鳴る
     一時停止中に押したときも、ここで自動的に鳴りはじめる */
  switchTrackAudio(audio, track);
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
      （中身は playSingleTrackFromStart。個別再生の前後移動でも、同じものを使う）
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
        pauseElement(audio);
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

  /* ② ちがう曲を押したとき

     いまの曲を止めて、押した曲を先頭から、1曲だけの再生として鳴らす
     個別再生の「⏮ 前のトラックへ」「⏭ 次のトラックへ」と同じ切りかえなので、
     中身は playSingleTrackFromStart() の1か所にまとめてある */
  playSingleTrackFromStart(audio, track);
}

/* 1曲だけの再生として、ちがう曲へ切りかえて、先頭から鳴らす

   ここを通るのは、つぎの2つのとき（どちらも「いまとはちがう曲へ切りかえる」操作）
   ・曲の一覧で、ちがう曲の「▶ 再生」を押したとき                … toggleTrack() から
   ・個別再生中に「⏮ 前のトラックへ」「⏭ 次のトラックへ」を押したとき … playAdjacentSingleTrack() から

   やることは、いつも同じ順番
   ① 全曲再生モードから抜ける（もともと個別再生なら、false のまま変わらない）
   ② 再生バーの表示を最初に戻す
   ③ いまの曲を止めて、新しい曲を差しかえて、先頭から鳴らす（→ switchTrackAudio）

   Audioは1つだけを使いまわしているので、「止める → 差しかえる → 鳴らす」の順番を守れば、
   2曲が重なって鳴ることは起こらない（連打しても同じ）

   ※ サウンドON/OFFの確認（ensureSoundEnabled）と、Audioの用意（getSoundtrackAudio）は、
     呼ぶ側で先にすませて、そのAudioを渡してもらう
   ※ 全曲再生の曲順（playlistTracks / playlistIndex）には、いっさいさわらない
*/
function playSingleTrackFromStart(audio: HTMLAudioElement, track: SoundtrackTrack) {
  /* ① 全曲再生モードからは抜ける
     （ここからは1曲だけの再生として扱うので、曲が終わっても次へは進まない）

     シャッフル再生の途中でも同じで、押した1曲だけの再生に切りかわる
     （案内の「🔀 シャッフル再生中」も、ここで消える）

     ※ playlistTracks（曲順）は、ここでは空にしない
       isPlaylistPlaying が false のあいだは、どこからも使われないうえ、
       次に「▶ 全曲再生」「🔀 シャッフル再生」を押したときに
       かならず作り直されるため（→ beginPlaylist） */
  isPlaylistPlaying.value = false;
  isShufflePlaying.value = false;

  /* ② 再生バーの表示を、いったん最初の状態に戻す

     曲の長さ（duration）は、新しいmp3を読み込むまで分からない
     前の曲の長さが残っていると、バーの目盛りがずれてしまうので 0 に戻し、
     handleLoadedMetadata() が新しい長さを入れなおすのを待つ */
  currentTime.value = 0;
  duration.value = 0;

  // ③ いまの曲を止めて、新しい曲へ差しかえ、先頭から鳴らす
  switchTrackAudio(audio, track);
}

/* ============================================================
   個別再生中の「⏮ 前のトラックへ」「⏭ 次のトラックへ」（画面の一覧で、となりの曲へ）

   1曲だけ聴いているとき（個別再生中・個別一時停止中）に、操作行の前・次を押すとここへ来る
   ボタンは全曲再生と同じものだが、ボタンから直接ではなく、
   playPreviousTrack() / playNextTrack() が「いまは個別再生」と見分けてから呼ぶ

   ■ 曲順は、画面の一覧の順番（tracks）
     01 02 03 04 05 06 07 と並んでいれば、
     03で「次」→ 04、03で「前」→ 02

   ■ はしでは回りこむ
     01で「前」→ いちばん最後の曲
     いちばん最後の曲で「次」→ 01
     （サントラを続けて聴きやすいように。曲数は tracks.length で数えるので、曲が増えても直さなくてよい）

   ■ 全曲再生用の playNextPlaylistTrack() / playPreviousPlaylistTrack() を使わない理由
     あちらは「今回の1周ぶんの曲順（playlistTracks）の、何曲目か（playlistIndex）」で行き先を決める
     個別再生のときは、その曲順が無い（または、前の全曲再生の残りが入っている）ので、
     流用すると、画面の並びとちがう曲へ飛んだり、「1周が終わった」として止まったりしてしまう
     そのため、画面の一覧の順番（tracks）だけを見る、この関数に分けてある

   ■ 押しても、全曲再生モードには入らない
     isPlaylistPlaying・isShufflePlaying は false のまま
     playlistTracks・playlistIndex にも、いっさいさわらない
     あくまで「1曲だけ聴いている状態のまま、となりの曲へ移る」操作

   ■ 移った曲は、かならず先頭から鳴る
     いまの曲をどこまで聴いていても、一時停止中でも、となりの曲を 0秒から鳴らしはじめる
     サウンドOFF中に押したときは、「▶ 再生」と同じく、ONへ戻してから鳴らす（→ ensureSoundEnabled）

   ■ リピートとの関係
     1曲リピート中でも、押せば となりの曲へ移る（移った曲が、また1曲リピートになる）
     全曲リピートの設定でも、全曲再生の曲順には入らず、ふつうに となりへ移るだけ

   ■ 手で押したときだけ動く
     個別再生の曲が最後まで流れたときは、今までどおり そこで止まる（→ handleTrackEnded）
     このボタンがあるからといって、自動で次の曲へは進めない

   ※ 固定エリアの現在曲の表示は、playingTrackId が変わるので、自動で新しい曲になる（→ playingTrack）
   ※ 曲の一覧は、移った曲が鳴りはじめたときに1回だけ、その曲まで自動でスクロールする（→ scrollToPlayingTrack）
   ※ フォーカスも動かさない
     曲を選んでいるあいだ、操作行は出たままなので、押したボタンにそのまま残る
   ============================================================ */
function playAdjacentSingleTrack(direction: 'previous' | 'next') {
  // 全曲再生中は、全曲再生の曲順で前後する（→ playPreviousPlaylistTrack / playNextPlaylistTrack）
  if (isPlaylistPlaying.value) {
    return;
  }

  // いまの曲が、一覧（tracks）の何番目かを探す（どの曲も選んでいなければ、何もしない）
  const currentIndex = tracks.value.findIndex((track) => track.id === playingTrackId.value);

  if (currentIndex < 0) {
    return;
  }

  /* となりの曲の番号を計算する（はしでは回りこむ）

     次なら +1、前なら -1
     tracks.length を足してから「わり算のあまり（%）」を出すので、はしで回りこむ
     （7曲のときの例）
     ・03で次         … (2 + 1 + 7) % 7 = 3 → 04
     ・最後の曲で次   … (6 + 1 + 7) % 7 = 0 → 01
     ・01で前         … (0 - 1 + 7) % 7 = 6 → 07
     ※ 「7」はじかに書かず、tracks.length を使う（曲が増えても、そのまま動く） */
  const step = direction === 'next' ? 1 : -1;
  const adjacentIndex = (currentIndex + step + tracks.value.length) % tracks.value.length;
  const adjacentTrack = tracks.value[adjacentIndex];

  /* サウンドOFFのときに押されたら、ONへ戻してから鳴らす
     （「▶ 再生」を押したときと同じ。→ ensureSoundEnabled） */
  ensureSoundEnabled();

  const audio = getSoundtrackAudio();

  if (!audio) {
    return;
  }

  // 一時停止中でも、となりの曲を先頭から鳴らしはじめる
  playSingleTrackFromStart(audio, adjacentTrack);
}

/* ============================================================
   操作行の「⏮ 前のトラックへ」「⏭ 次のトラックへ」を押したとき

   ■ なぜ、3つの聴きかたでボタンをそろえたのか
     個別再生・全曲再生・シャッフル再生で出てくるボタンがちがうと、
     聴きかたを変えるたびに「いまはどのボタンがあったっけ？」と探すことになる
     ふつうの音楽プレイヤーと同じく、どの聴きかたでも
     [ ⏮ 前 ] [ ⏭ 次 ] [ ■ 停止 ] が同じ場所にあるほうが、迷わず使える

   ■ ボタンは1つずつ。押したときの中身だけを、聴きかたで呼び分ける
     ・全曲再生・シャッフル再生 … 今回の曲順（playlistTracks）で前後する
         前 → playPreviousPlaylistTrack()（曲順の先頭で押すと、曲順の最後へ回りこむ）
         次 → playNextPlaylistTrack()（最後の曲で押すと今までどおり終わる。全曲リピートなら先頭へ）
     ・個別再生 … 画面の一覧の順番（tracks）で、となりの曲へ（はしでは回りこむ）
         前・次 → playAdjacentSingleTrack()
     全曲再生かどうかは isPlaylistPlaying で見分ける
     （シャッフル再生も isPlaylistPlaying が true なので、全曲再生と同じほうへ行く）

   ■ 曲が自然に終わったときは、ここを通らない
     handleTrackEnded() は、全曲再生中だけ playNextPlaylistTrack() を直接呼ぶ
     ここを通すと、個別再生でも自動で次の曲へ進んでしまうため

   ※ どちらの聴きかたでも、移った曲は先頭から鳴り、一時停止中に押しても鳴りはじめる
     サウンドOFF中なら、ONへ戻してから鳴らす（→ ensureSoundEnabled）
   ※ 曲の一覧は自動でスクロールしない。フォーカスも動かさない（押したボタンに残る）
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

   ■ なぜ、このボタンがあるのか
     前は、一時停止・続きからのボタンが、曲の一覧のカード（▶ 再生）にしか無かった
     一覧をスクロールして鳴っている曲が見えなくなると止めにくく、
     歌詞の画面では一覧ごとかくれるので、「■ 停止」以外に止める方法が無かった

     そこで、いつも画面に残る操作エリアに、いまの曲を止める・続きから鳴らすボタンを置く
     「▶ 全曲再生」「🔀 シャッフル再生」は、聴きはじめるときに1回押すだけのボタンなので、
     曲を選んでいるあいだ（hasPlaybackControls）は、その場所をこのボタンにゆずる
     （■ 停止で止めれば、また「▶ 全曲再生」「🔀 シャッフル再生」に戻る）

   ■ 押したときの中身は、曲のカードの「⏸ 一時停止 ／ ▶ 続きから」とまったく同じ（→ toggleTrack）
     ・全曲再生・シャッフル再生のとちゅうでも、その聴きかたのまま止まる・続きから鳴る
     ・サウンドOFFで止まっているときは、ONに戻してから続きを鳴らす（→ ensureSoundEnabled）
     ・前回の続きを戻したとき（まだ一度も鳴らしていない）も、戻した位置から鳴る
   ============================================================ */

/* ボタンの文字（鳴っているときは止める、止まっているときは続きから鳴らす） */
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
   車のステアリング・ロック画面・イヤホンの操作（Media Session API）

   ■ 受け取る操作（受け取りかたは utils/mediaSession.ts）
     車のステアリングの ⏮ ⏭、ロック画面・コントロールセンター・イヤホンのボタンを、
     画面のボタンを押したときと同じ関数へつなぐ（聴きかたごとの動きも、画面のボタンと同じ）
     ・次の曲 … playNextTrack()（「⏭ 次のトラックへ」と同じ）
     ・前の曲 … playPreviousTrack()（「⏮ 前のトラックへ」と同じ）
     ・一時停止・再生 … いまの曲の「⏸ 一時停止」「▶ 続きから」と同じ（→ toggleTrack）
                        どの曲も選んでいないときの再生は「▶ 全曲再生」と同じ
     ・停止 … 「■ 停止」と同じ（→ stopSoundtrack）
     ※ 再生・一時停止も受け取るのは、ブラウザにまかせると、画面の表示（♪ 再生中 など）が
       実際の音と食いちがってしまうため

   ■ 知らせる曲名
     ロック画面・コントロールセンター・車の画面に、いまの曲の名前を出してもらう
     ・曲名         … 曲の一覧と同じ（title）
     ・アーティスト … ゲームの題名（こうちゃんの大冒険）
     ・アルバム     … ページの見出しと同じ「ORIGINAL SOUNDTRACK」
     曲が変わるたびに入れかえ、曲を選んでいないときは消す
     （出すかどうか・どこに出すかは、端末や車しだい）

   ■ 受付を始めるのは onMounted、やめるのは onUnmounted
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

// いまの曲が変わったら、知らせる曲名を入れかえる（曲を選んでいないときは消す）
watch(playingTrack, (track) => {
  setMediaSessionTrack(track ? { title: track.title, artist: gameTitle, album: 'ORIGINAL SOUNDTRACK' } : null);
});

// 鳴っているか・一時停止中か・曲を選んでいないかを知らせる
watch([playingTrack, isPlaying], ([track, playing]) => {
  setMediaSessionPlaybackState(!track ? 'none' : playing ? 'playing' : 'paused');
});

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
  const playingTrack = tracks.value.find((track) => track.id === playingTrackId.value);

  if (soundtrackAudio && playingTrack) {
    try {
      setElementVolume(soundtrackAudio, getTrackVolume(playingTrack), getEffectAudioContext);
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

/* いま鳴っている曲のカードまで、曲の一覧をスクロールする

   ■ いつ動かすか（→ すぐ下の watch と closeLyricsView）
     ・曲が切りかわって鳴りはじめたとき（▶ 再生・全曲再生・シャッフル・前／次・曲が終わって次へ、のどれでも）
     ・歌詞の画面から、曲の一覧に戻ったとき
     どれも「その最初に1回だけ」動かす。その曲を聴いているあいだ・一時停止や再開では動かさない
     （聴いているあいだに一覧を読んでいる人の、見ている場所を奪わないため）
     ※ 前は、現在曲の表示のとなりの「再生中の曲を見る」を押したときだけ動かしていた

   ■ なぜ block: 'nearest' なのか
     'center' にすると、すでにほぼ見えている曲でも、中央まで大きく動いてしまう
     'nearest' なら、すでに見えていればほとんど動かず、
     見切れているぶんだけ、必要な最小限だけ移動する

   ■ scrollIntoView とは
     「この要素が見える位置まで、いちばん近いスクロールする箱を動かして」とブラウザに頼む命令
     ここでは対象カードをふくむ いちばん近いスクロール領域＝曲の一覧（st-trackScroll）が動くので、
     ページ全体（固定エリアまで）が不自然に動くことはない

   ※ playingTrackId が無い（どの曲も選んでいない）ときは、何もしない
   ※ 歌詞の画面を出しているあいだは、曲の一覧がかくれているので何もしない（一覧に戻ったときに動かす）
   ※ スクロールするだけで、曲一覧の別ボタンへフォーカスは移さない
     （急にキーボードの操作位置が飛ぶと分かりにくいため）
*/
function scrollToPlayingTrack() {
  // どの曲も選んでいない・歌詞の画面を出しているときは、何もしない
  if (playingTrackId.value === null || isLyricsView.value) {
    return;
  }

  const list = trackListRef.value;

  if (!list) {
    return;
  }

  // data-track-id で、いま鳴っている曲のカードを1つだけ探す
  const card = list.querySelector<HTMLElement>(`[data-track-id="${playingTrackId.value}"]`);

  if (!card) {
    return;
  }

  /* prefers-reduced-motion（動きを減らす設定）のときは、なめらかな動きをやめてすぐ移動する
     このページのCSSも、同じ設定のときにアニメーションを止めている（→ style の @media） */
  const prefersReducedMotion = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  card.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'nearest',
  });
}

// 曲が切りかわって鳴りはじめたら、その最初に1回だけ、その曲のカードまでスクロールする
// （一時停止・再開では playingTrackId は変わらないので、動かない）
watch(playingTrackId, (trackId, previousTrackId) => {
  if (trackId === null || trackId === previousTrackId) {
    return;
  }

  /* ページを開いた直後に、前回の曲を戻したときだけは、ここでは動かさない

     覚えておいた「曲の一覧のスクロール位置」のほうを先に戻したいため
     （鳴らしはじめたときに、あらためて1回だけ追従する
       → 「前回の続きから聴けるようにする」の watch(isPlaying)） */
  if (skipNextPlayingTrackScroll) {
    skipNextPlayingTrackScroll = false;

    return;
  }

  /* ふつうに曲が切りかわったときは、ここで追従する
     （戻した曲を鳴らしたときの追従は、もう要らないので取り消しておく） */
  scrollAfterRestoreOnPlay = false;

  nextTick(scrollToPlayingTrack);
});

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
     そのときの ↑↓ は、いままでどおりブラウザにまかせる（曲の一覧の箱のスクロールなど）
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
     開いていないときは、何もしない

     ※ はじめの画面へ戻るのは、上部ツールバーの「← 戻る」を押したときだけ
       Escape でも戻れるようにすると、吹き出しを閉じるつもりで2回押したときに、
       聴いていた曲が止まって、ページごと移動してしまうため */
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

  /* 曲の移動を優先するので、矢印キー本来のスクロール（曲の一覧の箱が少し動く）は止める
     ※ 行き先が、曲の一覧の箱（st-trackScroll）の見えている範囲の外にあるときは、
       focus() にともなうブラウザふつうのスクロールにまかせる（大げさな演出は足さない）
       ブラウザは、ボタンをふくむ いちばん近いスクロールする箱＝曲の一覧を動かして、
       選んだボタンが見える位置まで出してくれるので、scrollIntoView は呼んでいない */
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

   再生中に「⏭ 次のトラックへ」から入ったとき（個別再生・全曲再生・シャッフル再生、どれでも同じ）

     ⏭ 次のトラックへ → 01 ▶ 再生 → 02 ▶ 再生 → … → 最後の曲 ▶ 再生 → ⏭ 次のトラックへ

   帰り先は「出てきたボタン」なので、
   「■ 停止」から↓で入ったときは↑で「■ 停止」へ、
   「⏮ 前のトラックへ」から入ったときは↑で「⏮ 前のトラックへ」へ帰る

   Tabで一覧に入ったときなど、出てきたボタンを覚えていないときは、
   再生中なら「⏭ 次のトラックへ」へ、止まっているなら「▶ 全曲再生」へ帰る
   （再生中に「▶ 全曲再生」へ帰してしまうと、
     あいだの操作行（前／次／停止）を飛びこしてしまうため
     → findOutsidePlayButton）

   いちばん使う「聴く」ための列なので、
   上の操作ボタンから↓を押すだけで、すぐ曲を選べるようにしている
   （行きは handlePlayallButtonsKeydown、
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

   ① 直前に一覧へ入ったときのボタンが、まだ使えるなら、そこへ帰る
      「⏮ 前」から入ったなら「⏮ 前」へ、「⏭ 次」なら「⏭ 次」へ、「■ 停止」なら「■ 停止」へ
      （isConnected … その要素が、まだ画面（DOM）にあるかどうか）

      ただし、スターター（▶ 全曲再生／🔀 シャッフル）を覚えていて、いま操作行が出ているときは使わない
      操作行が出ているあいだは、スターターから↓で一覧へは入れない（操作行へ降りる）ので、
      その覚えは「止まっていたとき」の古いもの
      （止まっているときに 全曲再生↓ で一覧へ入り、そこで曲の「▶ 再生」を押した、など）
      そのまま帰すと、あいだの操作行を飛びこしてしまう

   ② 覚えが無いとき（Tabで一覧に来たときなど）や、覚えを使えないときの行き先は、
      操作行が出ているかどうかで変える

      再生中（操作行あり） … 一覧のすぐ上、「▶ 全曲再生」の真下にある「⏭ 次のトラックへ」へ
                              （「▶ 全曲再生」は再生中も出たままなので、
                                そちらを先に選ぶと、あいだの操作行を飛びこして
                                いちばん上まで戻ってしまう）
                              個別再生・全曲再生・シャッフル再生、一時停止中、どれでも同じ
      止まっているとき     … いつも出ている「▶ 全曲再生」へ

   ※ null のときに無理にフォーカスを当てないよう、呼ぶ側で確かめている
*/
function findOutsidePlayButton() {
  if (lastOutsideButton) {
    const isStarterButton = lastOutsideButton === playAllButtonRef.value || lastOutsideButton === shuffleButtonRef.value;
    const isStaleStarter = isStarterButton && hasPlaybackControls.value;

    if (lastOutsideButton.isConnected && !isStaleStarter) {
      return lastOutsideButton;
    }

    // 画面から消えたボタン（停止して消えた、など）や、古くなったスターターの覚えは、もう使わない
    lastOutsideButton = null;
  }

  /* 再生中は、操作行（すぐ上のならび）の「⏭ 次のトラックへ」を先に選ぶ
     まだ画面に出ていない切りかわりの一瞬だけは、「▶ 全曲再生」へ逃がす */
  if (hasPlaybackControls.value) {
    return nextTrackButtonRef.value ?? playAllButtonRef.value;
  }

  return playAllButtonRef.value;
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

/* スターター・⏸ 一時停止・操作行のならびで ↑↓ を押したときの行き先

   画面の位置どおりに、上下の段をたどる
   button … いま選んでいるボタン（どの ref のボタンかで、左列か右列かを見分ける）

   ■ スターター（.st-playall__starters）… ▶ 全曲再生(左) / 🔀 シャッフル再生(右)
     出ているのは、どの曲も選んでいないときだけ

     ↑ … 同じ列のツールバーへ（左＝← 戻る／右＝🔊 サウンド）
     ↓ … そのまま曲の一覧へ（01の「▶ 再生」）
          （再生中の分かれ道も残してあるが、再生中はスターターが出ていないので、ふだんは通らない）

   ■ ⏸ 一時停止 ／ ▶ 続きから（.st-playall__transport）
     曲を選んでいるあいだだけ、スターターと入れかわって出る

     ↑ … ツールバーの「← 戻る」へ
     ↓ … 真下の操作行の「⏭ 次のトラックへ」へ（まんなか）

   ■ 操作行（.st-playall__actions）… ⏮ 前のトラックへ / ⏭ 次のトラックへ / ■ 停止

     ↑ … 「⏸ 一時停止 ／ ▶ 続きから」へ（3つのどれからでも）
     ↓ … 曲の一覧へ（01の「▶ 再生」。3つのどれからでも）

   曲の一覧は「▶ 再生」の1列だけなので、一覧へ入るときは、どこからでも01の「▶ 再生」に入る
   操作行が出ているかどうかは hasPlaybackControls で見る
   （テンプレートの v-if と同じものを見ているので、画面に出ているならびと食いちがわない）
*/
function findPlayallVerticalTarget(key: string, row: HTMLElement, button: HTMLElement) {
  /* 「⏸ 一時停止 ／ ▶ 続きから」の段（曲を選んでいるあいだ、スターターと入れかわって出る）
     ・↑ … 上のツールバーの「← 戻る」
     ・↓ … 真下の操作行の「⏭ 次のトラックへ」（まんなかのボタン） */
  if (row.classList.contains('st-playall__transport')) {
    return key === 'ArrowUp' ? backButtonRef.value : nextTrackButtonRef.value;
  }

  const isStarterRow = row.classList.contains('st-playall__starters');

  if (isStarterRow) {
    const isPlayAll = button === playAllButtonRef.value;

    // ↑ … 同じ列のツールバー（左＝戻る／右＝サウンド）
    if (key === 'ArrowUp') {
      return isPlayAll ? backButtonRef.value : soundToggleButtonRef.value;
    }

    // ↓（再生中）… 真下の操作行（全曲再生＝次のトラックへ／シャッフル＝停止）
    if (hasPlaybackControls.value) {
      return isPlayAll ? nextTrackButtonRef.value : stopPlaybackButtonRef.value;
    }

    // ↓（止まっているとき）… 曲の一覧の01「▶ 再生」へ
    return findListPlayButton(key);
  }

  // ここからは操作行（前／次／停止）

  /* ↑ … すぐ上の「⏸ 一時停止 ／ ▶ 続きから」へ（前・次・停止のどれからでも）
     操作行が出ているのは曲を選んでいるあいだだけで、そのあいだスターターは出ていないため */
  if (key === 'ArrowUp') {
    return playPauseButtonRef.value;
  }

  // ↓ … 曲の一覧の01「▶ 再生」へ
  return findListPlayButton(key);
}

/* 上部ツールバー（← 戻る ／ 🔊 サウンド）のキーボード操作

   画面の位置どおりに動かす（左＝戻る／右＝サウンド。ツールバーはいちばん上の段）

   ・→ … 左（戻る）から右（サウンド）へ。右にいるときは動かない（回り込みなし）
   ・← … 右（サウンド）から左（戻る）へ。左にいるときは動かない（回り込みなし）
   ・↓ … 同じ列の下＝スターターへ（戻る→▶ 全曲再生／サウンド→🔀 シャッフル再生）
   ・↑ … いちばん上の段なので、何もしない

   ※ 見張りは、ボタンを囲む箱（.st-toolbar）だけ
   ※ Enter / Space は受け取らない（button本来の click にまかせる。二重実行を避ける）
   ※ 実際にフォーカスを移すときだけ preventDefault する（移動しないときはブラウザにまかせる）
*/
function handleToolbarKeydown(event: KeyboardEvent) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  // いま左（戻る）と右（サウンド）のどちらにいるか
  const onBack = Boolean(target.closest('.st-back'));
  // SoundControl.vue のミュートボタン（.sound-toggle）
  // となりの音量バーは対象にしない（← → は、バー本来の「音量を変える」操作に使う）
  const onSound = Boolean(target.closest('.sound-toggle'));

  if (!onBack && !onSound) {
    return;
  }

  let nextButton: HTMLElement | null = null;

  if (event.key === 'ArrowRight') {
    // 左 → 右（右にいるときは行き先が無いので動かない）
    if (onBack) {
      nextButton = soundToggleButtonRef.value;
    }
  } else if (event.key === 'ArrowLeft') {
    // 右 → 左（左にいるときは行き先が無いので動かない）
    if (onSound) {
      nextButton = backButtonRef.value;
    }
  } else if (event.key === 'ArrowDown') {
    /* 同じ列の下＝スターターへ（左＝▶ 全曲再生／右＝🔀 シャッフル再生）
       曲を選んでいるあいだは、スターターのかわりに出ている「⏸ 一時停止 ／ ▶ 続きから」へ（左右どちらからでも） */
    if (hasPlaybackControls.value) {
      nextButton = playPauseButtonRef.value;
    } else {
      nextButton = onBack ? playAllButtonRef.value : shuffleButtonRef.value;
    }
  } else {
    // ↑ やそのほかのキーは、ここでは何もしない（いちばん上の段なので上は無い）
    return;
  }

  if (!nextButton) {
    return;
  }

  // 実際にフォーカスを移すときだけ、矢印キー本来のスクロールを止める
  event.preventDefault();
  nextButton.focus();
}

/* スターター・⏸ 一時停止・操作行の「ボタンのならび」のキーボード操作

   一覧の上には、ボタンのならびがある（どれも同じこの関数で動かす）

     止まっているときだけ出る（.st-playall__starters）
       [ ▶ 全曲再生 ]  [ 🔀 シャッフル再生 ]

     再生中だけ、スターターと入れかわって出る（.st-playall__transport）
       [ ⏸ 一時停止 ／ ▶ 続きから ]

     再生中だけ出る操作行（.st-playall__actions）… 個別再生・全曲再生・シャッフル再生で共通
       [ ⏮ 前のトラックへ ]  [ ⏭ 次のトラックへ ]  [ ■ 停止 ]

   ・← → … 同じならびの中で、となりのボタンへ移るだけ
            左端で←、右端で→、は移動しない（画面の位置どおり。回り込みはしない）
            ならびのボタンを数えて動くので、2つのならびでも3つのならびでも、同じ書きかたでよい
   ・↑ ↓ … 上の段・下の段・曲の一覧のあいだをたどる
            行き先の決めかたは findPlayallVerticalTarget にまとめてある
            曲の一覧のはしから↑で戻るときは、出てきたボタンへ帰る
            （→ findVerticalTarget / findOutsidePlayButton。lastOutsideButton で覚える）

   ※ この下にある音量スライダーへは、矢印キーでは移らない（Tabで移る）
     音量は矢印キーでそのまま大小を変えるものなので、移動先にすると「動かすつもりが移動」になる
   ※ 見張りは、ボタンを囲む箱（.st-playall__starters / .st-playall__actions）だけ
   ※ Enter / Space は受け取らない（button本来の click にまかせる。二重実行を避ける）
*/
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
    /* となりの列へ、1つだけ動く（回り込みなし）
       左端で←（-1）や右端で→（ならびの外）は、行き先が無いので動かない */
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

  /* 曲の一覧へ入るときだけ、どのボタンから入ったかを覚えておく
     一覧のはしから↑で戻るときに、ここで覚えたボタンへ帰る（→ findOutsidePlayButton）
     行き先が一覧の中かどうかで見分けているので、
     ← → でとなりへ移ったときや、段を行き来しただけのときは、前の覚えはそのまま残る */
  if (trackListRef.value?.contains(nextButton)) {
    lastOutsideButton = buttons[currentIndex];
  }

  // 実際にフォーカスを移すときだけ、矢印キー本来のスクロールを止める
  event.preventDefault();
  nextButton.focus();
}

/* 操作行（⏮ 前／⏭ 次／■ 停止）が消えたあと、続きをキーボードで操作できるようにする

   曲を鳴らしているあいだは操作行が出ていて、
   止めると（「■ 停止」を押した・全曲再生が1周して終わった）、その3つは画面から消える
   選んでいたボタンが消えると、フォーカスはどこにも無い状態（body）になってしまい、
   キーボードだけで操作している人は、またTabで探しに行くことになる
   そこで、そのときに出ているボタンへフォーカスを移しておく

   ※ どこにもフォーカスが無いときだけ移す
     ユーザーがすでに別のボタンを選んでいるなら、そのじゃまをしない
     （曲が最後まで流れて自然に終わったときなどは、こちらが勝手に奪わない）
   ※ 鳴らしはじめたときには使わない
     押した「▶ 全曲再生」「🔀 シャッフル再生」などに、フォーカスをそのまま残す（→ beginPlaylist） */
async function focusAfterPlaylistChange(button: Ref<HTMLButtonElement | null>) {
  // ボタンが入れかわるのを待ってから、フォーカスを当てる
  await nextTick();

  if (document.activeElement && document.activeElement !== document.body) {
    return;
  }

  button.value?.focus();
}

/* 「← 戻る」（上部ツールバーの左のボタン）

   ※ 前は曲の一覧のいちばん下にあったが、曲が増えるほど遠くなるので、
     曲の一覧をスクロールしても画面に残る、上部ツールバー（st-toolbar）へ移した
     ボタンの場所を変えただけで、押したときの処理（この関数）は変えていない

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

   ※ ページの入れかわりには短いフェードがかかる（→ nuxt.config.ts の pageTransition）
     押したあともしばらくこのページが見えているので、
     そのあいだに続けて押されても移動のお願いを2回出さないよう、
     isLeavingPage で1回きりにしている
*/
async function goToTitle() {
  // もう移動をはじめているときは、何もしない（連打よけ）
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  /* ※ 決定音は鳴らさない
     引き返すだけのボタンで、このあとすぐページごと切りかわるため
     （ゲーム本編のA画面・B画面の「戻る」、ミニゲームの「戻る」も同じ） */

  /* 音を止める前に、いまの曲・再生位置・一覧のスクロール位置を覚えておく
     （次にこのページを開いたときは、ここから続きを聴ける） */
  fixLastState();

  stopAudioForNavigation();

  await navigateTo('/');
}

/* ページが表示されたときの準備

   ⓘ・吹き出し以外が押されたら、開いたままの吹き出しを閉じたいので、
   ページ全体（document）で「押された」を見張ってもらう
   ※ onMounted はブラウザでだけ動くので、document を安心して使える
*/
/* さわるたびに作業台を起こす受付を、やめるための関数（受付していないときは null）
   （iPhone で、画面を消して戻ったあとの曲が無音にならないようにするため。くわしくは utils/elementVolume.ts） */
let stopWakingAudioContext: (() => void) | null = null;

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsideCreditPointerDown);

  /* さわるたびに作業台（AudioContext）を起こす受付を始める（onUnmounted でやめる）
     backgroundPlayback … 曲を聴くためのページなので、iPhone で画面を消しても・ほかのアプリへ切りかえても鳴りつづけるようにする
                          （ゲーム本編・ミニゲームは、今までどおり止まる。くわしくは utils/elementVolume.ts） */
  stopWakingAudioContext = keepAudioContextAwake(getEffectAudioContext, { backgroundPlayback: true });

  // 車のステアリング・ロック画面・イヤホンの操作の受付を始める（onUnmounted でやめる）
  stopMediaSession = startMediaSession({
    play: handleMediaSessionPlay,
    pause: handleMediaSessionPause,
    stop: stopSoundtrack,
    previousTrack: playPreviousTrack,
    nextTrack: playNextTrack,
  });

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

      /* スマホ・タブレットでは、前回の音量は戻さず、いつも100%で始める
         スマホには音量スライダーが無い（ミュートボタンだけ。→ SoundControl.vue）ので、
         前にスライダーで下げた音量が残っていると、もう上げられなくなってしまうため
         ※ 0% も戻さない
           このページでは、0% にしてもミュート（soundEnabled）にはならず、ミュートボタンでは音量が戻らないため
           （音を消しておきたいときは、ミュートボタンのON/OFFのほうが保存されている） */
      masterVolume.value = isTouchOnlyDevice() ? 1 : percent / 100;
    }
  } catch {
    // 読み込めなくても、初期値の100％でふつうに聴ける
  }

  /* ボーナストラック（S+ランクで解放される、うた入りBGM）を解放済みかを思い出す

     true になると、tracks の最後にボーナストラックが入り、一覧の最後のロック表示と入れかわる
     サーバー側では localStorage を読めないので、はじめはロック表示で組み立てておき、
     ブラウザで動くここで読みなおしている（サウンドON/OFFの思い出しかたと同じ） */
  hasUnlockedSPlusSong.value = loadHasUnlockedSPlusSong();
  hasUnlockedSecretVocalSong.value = loadHasUnlockedSecretVocalSong();

  /* 前回の曲・再生位置と、曲の一覧のスクロール位置を思い出す
     （→ 「前回の続きから聴けるようにする」）

     ■ 順番が大事
       ① ボーナストラックの解放（すぐ上）… ここで「一覧に何曲あるか」が決まる
       ② 前回の曲を戻す                  … もう一覧に無い曲なら、戻さずに見送る
       ③ nextTick のあとにスクロール位置を戻す
          ②で増えた曲がカードとして並びおわってからでないと、そこまで動けないため

     ■ 音は鳴らさない
       ブラウザが勝手な再生を止めるので、戻すのは「一時停止のかたち」まで
       「▶ 続きから」を押すと、戻しておいた位置から鳴りはじめる */
  restoreLastPlayState();

  /* 前回の曲を戻したときは、上で当てた「▶ 全曲再生」が画面から消えて、
     同じ場所に「▶ 続きから」が出てくる。フォーカスもそちらへ移しておく
     （キーボードだけでも、開いてすぐ Enter で続きから聴ける） */
  if (hasPlaybackControls.value) {
    focusAfterPlaylistChange(playPauseButtonRef);
  }

  nextTick(() => {
    restoreTrackScroll();

    /* 念のため、自動追従を止めるしるしも戻しておく
       （曲を戻せなかったときに、しるしだけが残って
         次に曲を切りかえたときの追従まで止めてしまわないように） */
    skipNextPlayingTrackScroll = false;
  });
});

/* このページから離れるときの後始末

   ・「← 戻る」を押したとき
   ・ブラウザの戻るボタンで出ていったとき
   のどちらでも、かならずここを通る

   曲を止めて、使いまわしていたAudioも手放しておく
   全曲再生・シャッフル再生の覚えごと（isPlaylistPlaying・isShufflePlaying・
   playlistTracks・playlistIndex）も、stopSoundtrack() の中でまとめて元に戻る

   ※ ここが呼ばれるのは、画面がもう消えたあと
     だから stopSoundtrack() で「再生中」や再生バーの表示を止まった状態に戻しても、
     その変化は誰にも見えない（＝バタバタした動きにならない）

   ※ ブラウザの戻るボタンのときは goToTitle() を通らないので、
     音を確実に止められるのはここだけ
     「戻る」ボタンからのときは goToTitle() ですでに止まっているが、
     止まっている音をもう一度止めても何も起きないだけなので、そのままで安全
*/
onUnmounted(() => {
  /* 下の stopSoundtrack() で音を止める「前」に、いまの状態を覚えておく

     止めると再生位置が0秒に戻ってしまうので、覚えるのはかならず止める前
     覚えたあとは、もう書きかえない（→ fixLastState）
     ※ ブラウザの戻るボタンで出ていったときも、かならずここを通る */
  fixLastState();

  // ページ全体の見張りをやめる（付けっぱなしにしない）
  document.removeEventListener('pointerdown', handleOutsideCreditPointerDown);

  // さわるたびに作業台を起こす受付をやめる（画面を消しても鳴りつづける設定も、ここで元に戻る）
  stopWakingAudioContext?.();
  stopWakingAudioContext = null;

  // 車のステアリング・ロック画面・イヤホンの操作の受付をやめて、知らせていた曲名も消す
  // （ほかのページで、車の「次の曲」がこのページの関数を呼ばないように）
  stopMediaSession?.();
  stopMediaSession = null;

  // 歌詞の行を見なおすのもやめる
  stopLyricFrame();

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
  <main class="soundtrack" :class="{ 'soundtrack--playing': hasPlaybackControls, 'soundtrack--lyricsView': isLyricsView }">
    <!-- いちばん外の <main> に付く目印（上の :class）
         ・soundtrack--playing … 曲を選んでいるあいだ（再生中・一時停止中。⏮ 前へ／⏭ 次へ／■ 停止 が出ているあいだ）だけ付ける
                                 ページの見出しを画面からかくして、曲の一覧・歌詞の画面を広くする（→ style の .soundtrack--playing）
         ・soundtrack--lyricsView … 歌詞の画面を出しているあいだだけ付ける
                                    曲の一覧のための案内をかくす（→ style の .soundtrack--lyricsView）

         ※ このコメントを <main> の外（template のすぐ下）に書かないこと
           開発中（nuxt dev）はコメントも残るので、ページのいちばん外が2つ（コメント ＋ <main>）になる
           そうなると、ページを移るときのフェード（nuxt.config.ts の pageTransition）がこわれて、
           「← 戻る」を押したときに、移った先の画面がまっ暗のまま何も出なくなる
           （本番のビルドではコメントが消えるので、この不具合は開発中だけ起きる）
           （ミニゲームのページ（pages/minigame/secret-path.vue）にも、同じ注意書きがある） -->
    <!-- ============================================================
         画面に残る操作エリア（st-fixedArea）

         このページは、画面を上と下の2つに分けている
         ・上（この箱）         … 戻る・サウンド・見出し・全曲再生・前へ・次へ・停止・リピート・音量
         ・下（st-trackScroll） … 曲の一覧。ここだけが上下にスクロールする

         曲をどこまで下へ見ていても、操作が画面から消えないように、
         曲のカード以外の操作は、ぜんぶこちら側に置いている
         （しくみは CSS の .soundtrack に書いてある）
         ============================================================ -->
    <div class="st-fixedArea">
      <!-- ============================================================
           上部ツールバー（← 戻る ／ 🔊 ミュートボタン ＋ 音量バー）

           ■ なぜ戻るボタンを、いちばん上へ移したのか
             前は「← はじめの画面へ戻る」が、曲の一覧のいちばん下にあった
             曲数が増えるほど一覧は長くなるので、
             10曲・20曲と増えると、戻るためだけに いちばん下までスクロールすることになる
             そこで、いつでもすぐ押せるように、ページのいちばん上へ移した
             （下にあったボタンは消して、ここ1か所だけにしてある）

           ■ 曲を下のほうまで見ていても、押せる理由
             このツールバーは、画面に残る操作エリア（st-fixedArea）のいちばん上にある
             上下にスクロールするのは、下の曲の一覧（st-trackScroll）だけなので、
             何曲目を見ていても、ツールバーは画面から消えない
             （しくみのくわしい説明は、CSS の .soundtrack を見ること）

           ■ なぜ 🔊 サウンド ON/OFF も、ここへ移したのか
             サウンドは「このページの音を出す／出さない」をまとめて決める、ページ全体の設定
             曲の一覧のどこを見ていても、すぐ消したり戻したりできるほうが便利なので、
             いつも見えているこのツールバーに置いた
             ゲーム本編のA画面・B画面も「左に戻る側のボタン、右にサウンド」なので、並びもそろう
             ※ 前は下の「再生の設定」にあったボタンを、そのまま移しただけ
               しくみ（soundEnabled / toggleSound）は、何も変えていない

           ■ Escape キーでは、はじめの画面へ戻らない
             このページの Escape は、「ⓘ 制作情報」の吹き出しを閉じるために使っている
             （→ handleTrackListKeydown）
             同じキーで戻れるようにすると、吹き出しを閉じるつもりで押しすぎたときに、
             聴いていた曲が止まって、ページごと移動してしまう
             そのため、戻るのは このボタンを押したときだけにしている
             （ページ全体でキーを見張る window / document の keydown も付けていない）

           ■ キーボード
             2つとも ふつうの button なので、Tab / Shift+Tab で移動し、Enter / Space で押せる
             テンプレートのいちばん上にあるので、Tabの順番は
             「戻る → サウンド → 再生の操作 → 曲の一覧」になる

             矢印キーでも動かせる（→ handleToolbarKeydown）
             画面の位置どおりに、左＝戻る／右＝サウンドの2列で考える
             ・← → … 戻る ⇄ サウンド（左端で←、右端で→、は動かない）
             ・↓   … 同じ列の下＝スターターへ（戻る→▶ 全曲再生／サウンド→🔀 シャッフル再生）
             ・↑   … いちばん上の段なので、何もしない

             ただし、ページを開いたときのフォーカスは、今までどおり「▶ 全曲再生」
             このページの主役は曲を聴くことなので、戻るボタンから始めない（→ onMounted）
           ============================================================ -->
      <div class="st-toolbar" @keydown="handleToolbarKeydown">
        <!-- 押したときの処理は、前に一覧の下にあったボタンと同じ goToTitle()
             （曲の音だけ止める → はじめの画面へ。連打しても移動は1回だけ）
             ref … 矢印キーで「▶ 全曲再生」から↑で戻る先、サウンドから←で移る先

             見た目は、PCでもスマホでも「← 戻る」だけ（タイトル画面（B画面）の戻るボタンと同じ）
             読み上げ用の名前は aria-label の「はじめの画面へ戻る」 -->
        <button ref="backButtonRef" type="button" class="st-back" aria-label="はじめの画面へ戻る" @click="goToTitle">
          <span aria-hidden="true">← 戻る</span>
        </button>

        <!-- サウンドのコントロール（🔊 ミュートボタン ＋ 音量バー）

             タイトル画面（B画面）の右上と同じ部品（components/game/SoundControl.vue）をそのまま使う
             ・🔊 ミュートボタン … サウンドON/OFF（OFFのときは 🔊✕）→ toggleSound
             ・音量バー         … このページの音量（0〜100％）→ changeMasterVolume
             何のボタンかは、読み上げ用の aria-label と、hover / focus のときの吹き出しで伝わる

             ※ ゲーム本編とちがい、このページのサウンドON/OFFと音量は、別々の設定のまま
               （OFFは「鳴っている曲を一時停止する」、音量は「大きさだけ変える」。
                 音量を0%にしても、ミュート（OFF）にはならない）
             ※ 前は「🔊 サウンド ON」のボタンがここにあり、音量は下の「再生の設定」の中にあったが、
               B画面と同じ見た目にそろえるため、ここに1つにまとめた

             ref … 中のミュートボタン（toggleButton）を、矢印キーの行き先として借りるための目印
                   （「🔀 シャッフル再生」から↑で戻る先、戻るから→で移る先 → soundToggleButtonRef） -->
        <SoundControl
          ref="soundControlRef"
          :sound-enabled="soundEnabled"
          :sound-volume-percent="masterVolumePercent"
          @toggle="toggleSound"
          @volume-change="changeMasterVolume" />
      </div>

      <!-- ============================================================
           ページの見出し
           ============================================================ -->
      <header class="st-head">
        <p class="st-head__badge">ORIGINAL SOUNDTRACK</p>

        <h1 class="st-head__name">{{ gameTitle }}</h1>
      </header>

      <!-- ============================================================
           全曲再生

           始めかたは2つ（どちらも全曲を1回ずつ鳴らして止まる）
           ・▶ 全曲再生     … 開始曲から、一覧に出ている登録順のまま
                               開始曲は、下の一覧でトラック番号を押して選ぶ
                               最後まで行くと先頭へ回り込む（例：03 04 05 06 07 01 02）
           ・🔀 シャッフル再生 … 押すたびにランダムな順番を作って、その順で1周
                               （画面の曲一覧の順番は変わらない）
           （「🔁 リピート 全曲」のときは、止まらずに同じ順でもう1周する）

           曲を選んでいるあいだは、聴きかたに関係なく、下に3つのボタンが出る（操作行）
           ・⏮ 前のトラックへ … 1つ前の曲を、先頭から鳴らす
           ・⏭ 次のトラックへ … いまの曲を飛ばして、次の曲を先頭から鳴らす
           ・■ 停止           … 再生をやめる
                                （文字は「■ 停止」「■ 全曲再生を停止」「■ シャッフル再生を停止」と変わる）

           前・次がたどる曲順は、聴きかたで変わる
           ・個別再生         … 画面の一覧の順番（tracks）。はしでは回りこむ。全曲再生にはならない
           ・全曲／シャッフル … 今回の1周の曲順（playlistTracks）。シャッフルの「前」も、作った順番を戻るだけ
           ============================================================ -->
      <section class="st-playall" :class="{ 'st-playall--active': hasPlaybackControls }">
        <!-- 全曲を続けて鳴らす、2つの始めかた

             ・▶ 全曲再生     … 開始曲から、一覧に出ている登録順のまま
             ・🔀 シャッフル再生 … 毎回ランダムに並べかえた順で、全曲を1回ずつ

             鳴らしはじめたあとの動き（曲が終わったら次へ・⏭ 次のトラックへ・
             1周したら終わり）は、2つともまったく同じしくみを使っている

             ■ 出すのは、どの曲も選んでいないときだけ（!hasPlaybackControls）
               この2つは「聴きはじめるときに1回押すだけ」のボタンなので、
               曲を選んでいるあいだ（個別・全曲・シャッフル・一時停止中）は、
               同じ場所を、いまの曲の「⏸ 一時停止 ／ ▶ 続きから」にゆずる（→ すぐ下の v-else）
               聴きかたを変えたいときは、「■ 停止」で止めれば、また この2つが出てくる

             ※ ここには「開始曲：03 ひるまえのぼうけん」の案内は出さない
               どの曲から始まるかは、下の一覧で番号に色が付いているので分かる
               （同じことを2か所に出すと、目で追う場所が増えてしまう）

             @keydown … 画面の「左列・右列」をたどって動かす（左＝全曲再生／右＝シャッフル）
             ・← → … 全曲再生 ⇄ シャッフル（左端で←、右端で→、は動かない）
             ・↑   … 同じ列のツールバーへ（全曲再生→戻る／シャッフル→サウンド）
             ・↓   … 止まっているとき＝01の「▶ 再生」へ、
                     再生中（個別・全曲・シャッフル）＝真下の操作行へ（全曲再生→⏭ 次のトラックへ／シャッフル→■ 停止）
             （このならびは曲の一覧の外にあるので、ここにも見張りを付けている
               くわしくは handlePlayallButtonsKeydown / findPlayallVerticalTarget） -->
        <div v-if="!hasPlaybackControls" class="st-playall__starters" @keydown="handlePlayallButtonsKeydown">
          <!-- ref … ページを開いたときと、「■ 停止」で止めたときに
               このボタンへフォーカスを当てるための目印 -->
          <button ref="playAllButtonRef" type="button" class="st-playall__button" @click="startPlaylist">▶ 全曲再生</button>

          <!-- ふつうのbutton要素なので、Tabで移動でき、Enter / Spaceで押せる
               aria-label … 「シャッフル」だけでは何が起きるか分かりにくいので、
               読み上げソフトには「全曲を鳴らす」ことまで伝える -->
          <button ref="shuffleButtonRef" type="button" class="st-playall__button st-playall__button--shuffle" aria-label="曲順をランダムに並べかえて全曲再生する" @click="startShufflePlaylist">
            🔀 シャッフル再生
          </button>
        </div>

        <!-- いまの曲の「⏸ 一時停止 ／ ▶ 続きから」（曲を選んでいるあいだだけ、全曲再生・シャッフル再生と入れかわる）

             操作エリアはいつも画面に残るので、一覧をスクロールしていても、歌詞の画面を出していても、ここで止められる
             押したときの中身は、曲のカードのボタンと同じ（→ togglePlayback / toggleTrack）
             入れかわる2つと同じ高さの1段なので、再生を始めても操作エリアの高さは変わらない（一覧がガタつかない）

             @keydown … ↑＝上のツールバー（戻る）、↓＝下の操作行（⏭ 次へ）（→ findPlayallVerticalTarget）
             ref … 全曲再生を始めたとき・前回の続きを戻したときに、ここへフォーカスを移す -->
        <div v-else class="st-playall__transport" @keydown="handlePlayallButtonsKeydown">
          <button ref="playPauseButtonRef" type="button" class="st-playall__button st-playall__button--toggle" :class="{ 'st-playall__button--pause': isPlaying }" @click="togglePlayback">
            {{ playPauseLabel }}
          </button>
        </div>

        <!-- どの曲から始めるかの案内（曲を選んでいるあいだは出さない）
             開始曲を使うのは「▶ 全曲再生」だけなので、そのことも書いておく
             「▶ 全曲再生」のボタンが出ているときだけの案内なので、ボタンと同じ条件で出しわける -->
        <p v-if="!hasPlaybackControls" class="st-playall__hint">
          番号を押すと、全曲再生を始める曲を選べます
        </p>

        <!-- ============================================================
             現在再生中の曲（固定エリアに残る「いま鳴っている曲」の表示）

             ■ いつ出すか … playingTrack があるあいだ（＝ playingTrackId が null でない）
               個別再生・個別一時停止・全曲再生・シャッフル再生・サウンドOFFで止まっているとき、
               すべてで出す。停止して playingTrackId が null に戻れば、自動で消える
               （曲一覧側の「♪ 再生中」の色や枠（track--current）は、今までどおり別で出す）

             ■ なぜ、ここに置くのか
               曲の一覧を下へスクロールしていると、鳴っている曲のカードが見えなくなる
               そこで「いま何が鳴っているか」を、いつも見えるこの固定エリアにも出す

             ■ 表示の中身（全曲再生でも個別再生でも、この1か所にまとめる）
               ・目印   … playingStatusLabel（♪ 再生中／⏸ 一時停止中／♪ 全曲再生中／🔀 シャッフル再生中）
               ・N / 曲数 … 全曲再生中だけ出す（個別再生では出さない）
               ・曲名   … playingTrack（同じ曲名を上下に2回出さないよう、ここ1か所だけ）
               ・歌詞 ⇄ 一覧 の切りかえ … うた入りの曲のときだけ（→ toggleLyricsView）
               ※ 曲の一覧は、曲が鳴りはじめたときに1回だけ、その曲まで自動でスクロールする（→ scrollToPlayingTrack）

             aria-live … 曲が変わったこと・一時停止したことを、読み上げソフトにもその場で知らせる -->
        <p v-if="playingTrack" class="st-playall__status" aria-live="polite">
          <!-- ♪ 全曲再生中 は金色、🔀 シャッフル再生中 は紺色（曲一覧側の色分けと合わせる）
               一時停止中は、始めかたによらず金色（default）の目印にそろえる（→ isPlaying を見る） -->
          <span class="st-playall__badge" :class="{ 'st-playall__badge--shuffle': isShufflePlaying && isPlaying }">
            {{ playingStatusLabel }}
          </span>

          <!-- 「3 / 7」は全曲再生中だけの情報なので、そのときだけ出す（個別再生では出さない） -->
          <span v-if="isPlaylistPlaying" class="st-playall__count">{{ playlistIndex + 1 }} / {{ playlistTracks.length }}</span>

          <span class="st-playall__track">{{ formatTrackNumber(playingTrack.id) }} {{ playingTrack.title }}</span>

          <!-- 歌詞の画面 ⇄ 曲の一覧 の切りかえ（うた入りの曲を選んでいるあいだだけ → toggleLyricsView）
               行き先のアイコンに、2文字の名前を添えた小さなボタン（目印と同じ行に収まるので、操作エリアの行は増えない）
               ・曲の一覧のとき … 文字の入った吹き出し ＋「歌詞」（歌詞をぜんぶ見る）
               ・歌詞の画面のとき … リスト ＋「一覧」（曲の一覧にもどる）
               ※ 前はマイクのアイコンだけだったが、「録音」に見えて分かりにくかったので、吹き出しと名前にした
               読み上げ用の名前（aria-label）と、カーソルを当てたときの説明（title）は、長い名前で伝える -->
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

        <!-- 歌詞（うた入りの曲を選んでいるあいだだけ → currentLyricText）
             いま歌っている1行を出して、曲に合わせて切りかえる。歌が始まる前・間奏は「♪」
             key … 行が変わるたびに、ふわっと出なおす
             読み上げソフトには、行が変わるたびには知らせない（数秒ごとに読み上げが割りこむと、ほかの操作のじゃまになるため） -->
        <!-- 歌詞の画面を出しているあいだは、下に同じ歌詞が出ているので、この行ごと出さない（操作エリアを1行低くする） -->
        <p v-if="currentLyricText !== null && !isLyricsView" class="st-lyrics">
          <span :key="lyricIndex" class="st-lyrics__line">{{ currentLyricText }}</span>
        </p>

        <!-- ============================================================
             再生中の操作行（⏮ 前のトラックへ ／ ⏭ 次のトラックへ ／ ■ 停止）

             ■ いつ出すか … hasPlaybackControls（曲を選んでいるあいだ）
               個別再生・個別一時停止・全曲再生・シャッフル再生・サウンドOFFで止まっているとき、
               どれでも同じ場所に、同じ3つのならびで出す（サウンドトラックプレイヤーとして操作をそろえる）
               止まっているとき（どの曲も選んでいない）は出さない
               ならびは この1つだけなので、同じ ref が2つのボタンに付くことはない

             ■ 押したときの中身は、聴きかたで切りかわる
               ・⏮ 前 / ⏭ 次 … playPreviousTrack / playNextTrack が呼び分ける
                   個別再生         … 画面の一覧の順番（tracks）で、となりの曲へ。はしでは回りこむ
                   全曲／シャッフル … 今回の1周の曲順（playlistTracks）で前後へ
                                       シャッフルの「前」は、作った順番を1つ戻るだけ（くじを引きなおさない）
                   どちらも、移った曲を先頭から鳴らす（一時停止中に押しても鳴りはじめる）
               ・■ 停止 … どの聴きかたでも stopSoundtrack（完全に止めて、表示も消す）
                   文字だけ「■ 停止」「■ 全曲再生を停止」「■ シャッフル再生を停止」と変わる（→ stopButtonLabel）

             ■ 前／次 で移った曲も、鳴りはじめたときに1回だけ、曲の一覧がその曲までスクロールする（→ scrollToPlayingTrack）

             ■ キーボード
               3つとも ふつうの button なので、Tab / Shift+Tab で移動し、Enter / Space で押せる（click で動く）
               @keydown … 画面の位置どおりに動かす（くわしくは handlePlayallButtonsKeydown / findPlayallVerticalTarget）
               ・← → … 前 ⇄ 次 ⇄ 停止（左端で←、右端で→、は動かない）
               ・↑   … 前・次＝▶ 全曲再生へ、停止＝🔀 シャッフル再生へ
               ・↓   … 曲の一覧の01「▶ 再生」へ（↑で戻るときは、入ったボタンへ帰る）
               （下のリピート・音量スライダーへは、矢印キーでは移らない）
             ============================================================ -->
        <!-- 3つのボタンの文字は、長い文字（__labelLong）と短い文字（__labelShort）の2つを入れてある
             ・PC       … 長い文字（⏮ 前のトラックへ ／ ⏭ 次のトラックへ ／ ■ 全曲再生を停止 など）
             ・スマホ幅 … 短い文字（⏮ 前へ ／ ⏭ 次へ ／ ■ 停止）にして、3つを1段にならべる
                          （操作エリアを低くして、曲の一覧を広く見せるため → style の @media (max-width: 600px)）
             読み上げソフトには、どちらの幅でも aria-label の長い名前を伝える -->
        <div v-if="hasPlaybackControls" class="st-playall__actions" @keydown="handlePlayallButtonsKeydown">
          <!-- ref … 「⏭ 次のトラックへ」から←で移ってくる先 -->
          <button ref="previousTrackButtonRef" type="button" class="st-playall__button st-playall__button--previous" aria-label="1つ前のトラックを先頭から再生する" @click="playPreviousTrack">
            <span class="st-playall__labelLong">⏮ 前のトラックへ</span>
            <span class="st-playall__labelShort">⏮ 前へ</span>
          </button>

          <!-- ref … 上段の「▶ 全曲再生」から↓で降りてくる先 -->
          <button ref="nextTrackButtonRef" type="button" class="st-playall__button st-playall__button--next" aria-label="現在の曲を飛ばして次のトラックを再生する" @click="playNextTrack">
            <span class="st-playall__labelLong">⏭ 次のトラックへ</span>
            <span class="st-playall__labelShort">⏭ 次へ</span>
          </button>

          <!-- ref … 上段の「🔀 シャッフル再生」から↓で降りてくる先
               文字は、いまの聴きかたに合わせて変わる（→ stopButtonLabel）
               スマホ幅の短い文字は、どの聴きかたでも「■ 停止」 -->
          <button ref="stopPlaybackButtonRef" type="button" class="st-playall__button st-playall__button--stop" :aria-label="stopButtonLabel" @click="stopSoundtrack">
            <span class="st-playall__labelLong">{{ stopButtonLabel }}</span>
            <span class="st-playall__labelShort">■ 停止</span>
          </button>
        </div>

        <!-- 再生の設定（リピート）

             「どの曲を・どこから鳴らすか」を決めるこの箱の中に、
             「どんなふうに鳴らすか」もまとめて置いてある

             ・リピート … 鳴らし終えたあと、くりかえすかどうか

             ※ 前はここに「🔊 サウンド ON/OFF」と「音量」もあったが、
               どちらも上部ツールバー（st-toolbar）の SoundControl にまとめた
               （タイトル画面（B画面）と同じ、🔊 ミュートボタン ＋ 音量バー の形）
               サウンドOFFのときの案内（この箱のすぐ下）は、今までどおり soundEnabled を見て、ここに出る -->
        <div class="st-settings">
          <!-- 🔁 リピート（押すたびに OFF → 全曲 → 1曲 → OFF と回る）

               リピートには3つの状態があるので、サウンドのような
               aria-pressed（押されている／いない）では言い表せない
               そこで、いまの状態は data-repeat でCSSへ渡して見た目を変え、
               読み上げソフトには aria-label で
               「いまの状態」と「押すとどうなるか」を伝えている -->
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

        <!-- サウンドOFFのあいだだけ出す案内

             「押しても鳴りません」ではなく「押せばONに戻って鳴ります」と伝える
             （OFFのまま ▶ を押したときは ensureSoundEnabled がONへ戻す）

             aria-live … この文が出たことを、読み上げソフトにもその場で知らせる -->
        <p v-if="!soundEnabled" class="st-settings__hint" aria-live="polite">サウンドOFF中（「▶ 再生」でONに戻ります）</p>
      </section>
    </div>

    <!-- ============================================================
         曲の一覧のスクロールエリア（st-trackScroll）

         曲が7曲・20曲・30曲と増えても、長くなるのはこの箱の中だけ
         マウスホイール・トラックパッド・指のスワイプで、この中だけが上下に動く
         （ページ全体はのびないので、上の操作エリアは画面に残ったまま）

         ※ キーボードで曲を移ったときは、ブラウザがこの箱を自動でスクロールして、
           選んだボタンを見える位置へ出してくれる（→ handleTrackListKeydown）
         ※ 曲が自動で次へ進んでも、一覧を勝手にスクロールはしない
           （いま見ている場所を、こちらから動かさない）
         ============================================================ -->
    <!-- ============================================================
         歌詞の画面（「歌詞をぜんぶ見る」を押したときだけ。曲の一覧のかわりに出す）

         ・いまの行 … st-lyricsView__line--current（濃い色で少し大きく）
         ・歌いおわった行 … st-lyricsView__line--past（うすく）
         ・行を押すと、その行の歌い出しへとぶ（→ seekToLyric）
         ・曲に合わせて自動でスクロールする。手でスクロールしたら、しばらく止める（→ pauseLyricsAutoScroll）
         ・aria-current … いま歌っている行を、読み上げソフトにも伝える
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

    <!-- 曲の一覧は、歌詞の画面を出しているあいだ かくすだけ（v-show。戻ったとき、前に見ていた場所のまま）

         ref・@scroll … どこまでスクロールしていたかを覚えて、次に開いたときに戻すため
                        （→ 「前回の続きから聴けるようにする」。passive はスクロールを重くしないためのしるし） -->
    <div v-show="!isLyricsView" ref="trackScrollRef" class="st-trackScroll" @scroll.passive="handleTrackScroll">
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

                 ■ 変なところで改行しないように
                   ・「♪ 再生中」と ⓘ は、ひとかたまり（track__titleSide）にして、曲名の最後の文字のすぐうしろに続ける
                     入りきらないときは、2つがいっしょに次の行へ移る（ⓘ だけが取り残されない）
                   ・曲名は、言葉のとちゅうで割らず、「、」や空白のところで折り返す（→ CSS の word-break: keep-all）

                 ※ 曲名と track__titleSide のあいだの空白は、わざと同じ行に書いてある（消さないこと）
                   この空白が「ここで折り返してよい」しるしになる
                   （Vue は、改行をふくむ空白をテンプレートから消してしまうので、同じ行に書く必要がある） -->
            <p class="track__title">
              <span class="track__titleText">{{ track.title }}</span> <span class="track__titleSide">
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

        <!-- ボーナストラックのロック表示（まだ解放していない曲のぶんだけ → lockedTrackHints）

             「まだ聴けない曲がある」ことだけ分かるように、曲名は「？？？」にして、一覧の最後に出す
             解放すると、この場所がそのままボーナストラック（tracks のうしろの曲）に置きかわる

             ・ボタンを1つも持たないので、押せない・再生できない・Tabでも止まらない
             ・再生できる曲の一覧（tracks）には入れていないので、
               全曲再生・シャッフル・前後移動の曲順には、はじめから入らない
             ・class に track を付けていないのは、曲の一覧のキーボード操作（handleTrackListKeydown）が
               .track を「ボタンのある曲のカード」として数えるため
               ここも数えてしまうと、End で最後の曲へ行けず、↑↓ の回りこみも止まってしまう
             ・「？？？」は読み上げると記号の連続になるので、読み上げソフトには「まだ聴けない曲」と伝える -->
        <li v-for="hint in lockedTrackHints" :key="hint" class="st-lockedTrack">
          <span class="st-lockedTrack__icon" aria-hidden="true">🔒</span>

          <div class="st-lockedTrack__body">
            <p class="st-lockedTrack__title">
              <span aria-hidden="true">？？？？？？？？？</span>
              <span class="st-lockedTrack__srText">まだ聴けない曲</span>
            </p>

            <!-- 何をすれば解放できるか（曲の説明文と同じく、「|」のところだけで折り返す → splitPhrases） -->
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
   サウンドトラックページの枠（画面を「操作エリア」と「曲の一覧」の2つに分ける）

     上：操作エリア（.st-fixedArea）
         ツールバー／見出し／全曲再生・次へ・停止・リピート・音量 … 動かない
     下：曲の一覧（.st-trackScroll）
         01 / 02 / 03 …                                          … ここだけ上下にスクロール

   ■ なぜ、ページ全体をスクロールする作りをやめたのか
     前はページ全体が、曲の数だけ下へのびる「縦に長いページ」だった
     曲が増えるほどページが長くなり、曲を下のほうまで見ていると、
     戻る・全曲再生・次へ・停止・リピート・音量が、画面の上へ消えてしまう
     このページは「曲を選びながら、操作する」ページなので、
     操作はいつも画面に残し、長くなる曲の一覧だけをスクロールさせる
     （ゲーム画面の .game も、高さを画面にぴったり合わせて、ページ全体はスクロールさせていない）

   ■ しくみ（Flexbox）
     ① このページの枠（.soundtrack）を、画面の高さぴったり（100dvh）にする
        overflow: hidden で、ページ全体が曲の数に合わせてのびたり、スクロールしたりしないようにする
     ② 中身を flex-direction: column で、上から下へならべる
     ③ 操作エリアは flex: none … 中身ぶんの高さのまま、のびも縮みもしない
     ④ 曲の一覧は flex: 1 … 残った高さを、ぜんぶ使う
        そのうえで overflow-y: auto … 入りきらない曲は、この箱の中だけでスクロールする

     曲を鳴らして「⏭ 次のトラックへ」などが出ると、操作エリアが少し高くなるが、
     そのぶん曲の一覧が、自動で少し低くなる（高さを JavaScript で計算しなくてよい）

   ■ position: fixed を使わない理由
     fixed は、ページの流れから抜けて、画面の同じ場所に浮く
     ・浮いたぶん、曲の一覧が操作エリアの下にもぐらないように、
       操作エリアの高さぶんのすき間を、自分で計算して空けなければならない
     ・操作エリアの高さは、全曲再生中・サウンドOFF中・画面の幅で変わるので、その計算がすぐにずれる
     Flexbox なら、2つの箱を上下にならべるだけで、高さの分けかたはブラウザがやってくれる

   ■ height を2回書いている理由
     ・100vh  … 画面の高さ（古いブラウザでも分かる）
     ・100dvh … スマホでアドレスバーが出たり引っこんだりしても、いま見えている高さに合わせてくれる
     新しいブラウザは、あとに書いた 100dvh を使い、知らないブラウザは 100vh のまま使う

   ※ 左右の余白は、この枠ではなく、中の2つの箱（.st-fixedArea / .st-trackScroll）に持たせている
     曲の一覧のスクロールバーを、枠のいちばん右はしに出すため
   ※ 縦にとても低い画面と、とても幅のせまい画面では、この分けかたをやめて、ページ全体のスクロールに戻す
     （→ いちばん下の @media (max-height: 580px), (max-width: 359px)）
   ============================================================ */
.soundtrack {
  /* 色はゲーム画面と同じものを使う */
  --navy: #2a768f;
  --navy-deep: #226981;
  /* うすい水色の線（上部ツールバーの SoundControl.vue の枠に使われる。ゲーム画面の .game と同じ値） */
  --navy-line: #86c6dd;
  --paper: #fffdf9;
  --ink: #4e5860;
  --ink-soft: #8d949b;
  --gold: #ffd166;

  display: flex;
  flex-direction: column;
  box-sizing: border-box;

  /* iPhone のノッチ・Dynamic Island・ホームインジケーターをよける余白
     ゲーム画面の .game と同じ考えかた（→ assets/css/game/base.css の .game）
     border-box なので、この余白も height: 100dvh の中にふくまれる
     よける場所が無い画面では、どれも 0 になるので何も変わらない */
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

/* 画面に残る操作エリア（ツールバー・見出し・全曲再生・次へ・停止・リピート・音量）

   flex: none … 中身ぶんの高さのまま、のびも縮みもしない
                （ここが縮むと、ボタンが切れて押せなくなるため）
   上下の余白 … 上は画面のふちとのすき間、下は曲の一覧とのすき間

   overflow: hidden ＋ scrollbar-gutter: stable
   … 下の曲の一覧と同じだけ、右がわにスクロールバーの場所を空けておくための指定
     曲の一覧にスクロールバーが出ると、そのぶん一覧の中身がせまくなり、
     まんなかに置いた曲カードが、上の操作エリアのカードと左右にずれてしまう
     こちらにも同じ場所を空けておけば、上と下で、カードの左右のはしがそろったままになる
     （scrollbar-gutter は overflow が hidden / auto / scroll の箱にしか効かないので、hidden を付けている
       この箱は中身ぶんの高さなので、hidden にしても中身が切れることはない）
     ※ スマホのように、スクロールバーが中身の上に重なって出る機械では、どちらも場所を空けないので、同じくそろう */
.st-fixedArea {
  flex: none;
  overflow: hidden;
  scrollbar-gutter: stable;
  padding: 12px 24px;
}

/* 曲の一覧のスクロールエリア（このページで、上下にスクロールするのは この箱だけ）

   flex: 1 … 操作エリアを置いて、残った高さをぜんぶこの箱が使う
             （「あまった場所は、この箱が受け取る」という意味）

   min-height: 0 … 「中身より低くなってもよい」という指定
     Flexbox の中の箱は、ふつう「中身をぜんぶ出せる高さ」より低くならない
     曲の一覧は中身（曲のカード）が長いので、それだと箱が中身ぶんまでのびてしまい、
     画面の下へはみ出して、下の曲が .soundtrack の overflow: hidden で切れてしまう
     （overflow-y: auto の箱は、ブラウザがはじめから縮めてくれることが多いが、
       何のための指定かが読んで分かるように、あえて書いておく
       あとで overflow を別の箱へ移したときも、ここがこわれない）

   overflow-y: auto … 入りきらないときだけスクロールバーが出て、この箱の中だけが上下に動く
                      曲が7曲でも30曲でも、長くなるのはこの箱の中身だけ

   scrollbar-gutter: stable … 上の操作エリアと、スクロールバーの場所をそろえる（→ .st-fixedArea）

   border-top … 「ここから下が曲の一覧」と分かるように、うすい線を1本だけ引く
   上下の余白 … 1曲目が線にくっつかないように上を少し、最後の曲の下にも少し空ける
               （最後の曲の ⓘ の吹き出しも、この余白の中に出るので切れない） */
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

   4枚とも「いちばん広くても760px」にして、まんなかに置いている

   ■ 前は、4枚とも max-width: 760px と書いてあったのに、見た目の幅がばらばらだった
       ツールバー 804px ／ 見出し 822px ／ 全曲再生 804px ／ 曲の一覧 760px

   ■ なぜずれていたのか
     CSSの幅は、ふつう（box-sizing: content-box）だと「中身だけの幅」を指す
     そこへ、内がわの余白（padding）と枠線（border）が、外がわに足される
       見出し   … 760 ＋ 余白 28×2 ＋ 枠線 3×2 ＝ 822px
       全曲再生 … 760 ＋ 余白 20×2 ＋ 枠線 2×2 ＝ 804px
       曲の一覧 … 余白も枠線も無いので、760px のまま
     余白や枠線の太さがカードごとにちがうので、外がわの幅もそろわなかった

   ■ box-sizing: border-box にすると
     幅が「枠線までふくめた、外がわの幅」になる
     余白や枠線がどれだけあっても、外がわはぴったり760pxで止まるので、
     4枚のカードの左右のはしが、たてに一直線にそろう

   ※ 幅の数字は、ここ1か所だけに書いてある（それぞれのカードには書かない）
     あとで幅を変えたいときも、ここを直せば4枚がいっしょに変わるので、またずれることがない
   ※ スマホなど画面がせまいときは、4枚とも画面の幅いっぱいに広がるので、
     もともと同じ幅にそろっている（ここの指定が効いてくるのは、広い画面のとき）
   ※ 上の操作エリアと下の曲の一覧は、スクロールバーの場所を同じだけ空けている
     （→ .st-fixedArea / .st-trackScroll の scrollbar-gutter）
     曲の一覧にスクロールバーが出ても、上と下のカードの左右のはしは、ずれない
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

   画面に残る操作エリア（.st-fixedArea）の、いちばん上に置いている
   操作エリアはスクロールしないので、曲の一覧をどこまで見ていても、
   「戻る」と「音を消す・戻す」が、いつでも押せる

   ■ 見た目
     大きなナビゲーションバーにはせず、「操作用の小さな上部カード」にしている
     ・幅は、見出し・全曲再生・曲の一覧とぴったり同じ（→ 上の「カードの横幅をそろえる」）
     ・枠は、すぐ下の「全曲再生」カードと同じ紺色（--navy）＋下だけ太い枠にそろえる
       前は うすい水色（#c8d4e6）の細い枠だったが、他のカードが紺色の枠なので、
       ここだけ枠が弱くて浮いて見えた。同じ紺色にして、下の太い枠で紙の厚みを出す
     ・ただし枠の太さ・角丸は 見出し（.st-head。3px・角丸20px）より ひかえめにして、
       このツールバーが見出しより目立たないようにする
     ・上下の余白と、見出し（.st-head）とのすき間（10px）は、
       操作エリアが高くなりすぎないよう、少しひかえめにしてある
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

/* 右のサウンド（🔊 ミュートボタン ＋ 音量バー。components/game/SoundControl.vue）は、いつも右はしに置く

   margin-left: auto … 左がわの余りを、ぜんぶこのまとまりの左に入れる
   1行に収まっているときは、justify-content: space-between と同じ見た目

   大きさは、タイトル画面（B画面）の右上と同じ値にそろえる（assets/css/game/sound.css の .title-card__tools）
   SoundControl.vue は、この3つの値だけで ボタン・アイコン・音量バーの大きさが決まる作りになっている
   ・--sound-button-size … 枠の高さ（左の戻るボタンと高さをそろえる）
   ・--sound-icon-size   … 🔊 の大きさ
   ・--sound-slider-width … 音量バーの長さ
   スマホでは、下の @media (max-width: 600px) で、B画面のスマホと同じ値に小さくする

   ※ 音量バーの長さだけは、B画面（110px）より長い 180px にしている
     このページは曲を聴くページなので、音量を細かく合わせやすいほうがよい */
.st-toolbar .sound-control {
  --sound-button-size: 38px;
  --sound-icon-size: 20px;
  --sound-slider-width: 180px;

  margin-left: auto;
}

/* 「← 戻る」

   前は曲の一覧の下にあったボタンの見た目を、そのまま使っている
   （紺色の枠・白い背景・丸いボタン・hover / active / focus-visible）

   ツールバーに入れたので、変えたのは次の3つだけ
   ・高さ     … となりのサウンド（SoundControl.vue の枠 38px）と、だいたいそろえる
                 （上下の余白 7px ＋ 行の高さ 1.4 ＋ 枠）
   ・折り返し … 「← 戻る」がボタンの中で2行に割れないようにする
                 （入りきらないときは、ボタンの中ではなく、ツールバーごと2段になる）
   ・hover   … 紙の色のツールバーの上では、白に変えても見分けがつかないので、
                 リピートボタンと同じ うすい水色にする */
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

/* ============================================================
   ページの見出し
   ============================================================ */
.st-head {
  /* 下のすき間だけ、影のぶん（12px）を足してある

     このカードには、下へ12pxずらした影（box-shadow: 0 12px 0）が付いていて、
     紙の厚みのように見せている
     すき間を影と同じ12pxにすると、その影がすき間をぜんぶ埋めてしまい、
     下の全曲再生のカードに、くっついて見える
     影の12px ＋ すき間10px にして、見た目のすき間を、ツールバーとのすき間（10px）とそろえている

     上下の余白（padding）は、操作エリアが高くなりすぎないよう、少しひかえめにしてある
     （ツールバーが1段増えたぶん、曲の一覧に使える高さを残すため） */
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
   再生の設定（全曲再生の箱の中、いちばん下の1行）

   設定だけのために箱をもう1つ増やすとページが長くなるので、
   同じ「再生まわりの操作」として、この箱の中へ入れてある
   上の行とは、全曲再生中の案内と同じ点線で区切る
   いまは「🔁 リピート OFF」の1つだけ
   （🔊 サウンド ON/OFF と音量は、上部ツールバー（.st-toolbar）の SoundControl.vue へ移した）
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

/* 「🔁 リピート」のボタン

   「押すたびに状態が変わる、設定のボタン」なので、丸い枠のボタンにしている
   ・🔁 リピート … OFF → 全曲 → 1曲 → OFF と順ぐりに回る（再生の設定の中）

   ※ 前は「🔊 サウンド」のボタンも同じ形でここにあったが、
     いまは上部ツールバーの SoundControl.vue（タイトル画面と同じ部品）に置きかえた */
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

/* はたらいていないとき（リピートなし・サウンドOFF）は、色をぬく
   絵文字や文字だけでなく色でも、「いまは何も起きない設定」だと分かるようにする */
.st-repeat[data-repeat='off'] {
  border-color: #b9c6d6;
  background: #eef2f7;
  color: var(--ink-soft);
}

.st-repeat:hover {
  background: #e8f4fb;
}

/* 押した瞬間：ほんの少しだけ沈む */
.st-repeat:active {
  transform: translateY(1px);
}

/* Tabキーで移動してきたとき、どこにいるかが分かるようにする */
.st-repeat:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 3px;
}

.st-repeat__icon {
  font-size: 16px;
  line-height: 1;
}

/* 状態の文字（OFF / 全曲 / 1曲）が変わっても、ボタンの幅を変えないための工夫

   文字をぜんぶ同じマスに重ねて置き、いま使わないものを visibility で見えなくする
   display: none とちがい visibility は「場所は残したまま消す」ので、
   幅はいつもいちばん長い文字のままになる */
.st-repeat__state {
  display: grid;
}

.st-repeat__stateText {
  grid-area: 1 / 1; /* ぜんぶ同じマスに置いて重ねる */
  text-align: center;
}

/* リピートは3つあるので、「いまの1つだけ」を見せるようにする
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

/* ============================================================
   全曲再生の操作バー
   ============================================================ */
/* 下の曲の一覧とのすき間は、このカードではなく、操作エリア（.st-fixedArea）の下の余白で空ける */
.st-playall {
  margin: 0 auto;
  padding: 12px 20px;
  border: 2px solid var(--navy);
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--paper);
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

/* 「▶ 全曲再生」と「🔀 シャッフル再生」のならび

   どちらも「全曲を続けて鳴らす」ボタンなので、となり合わせに置いて
   ひとまとまりに見せる
   この行にはこの2つしか無いので、真ん中へ寄せる
   （下に出る操作行「⏮ 前／⏭ 次／■ 停止」と、位置をそろえるため）
   幅が足りないときは折り返し、スマホでは下の指定で縦に積み直す */
.st-playall__starters {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
}

/* 曲を選んでいるあいだの「⏸ 一時停止 ／ ▶ 続きから」の段
   （▶ 全曲再生・🔀 シャッフル再生の段と入れかわって、同じ場所に出る）

   ならべかたはスターターの段と同じ（真ん中へ寄せる）なので、入れかわっても位置がずれない */
.st-playall__transport {
  display: flex;
  justify-content: center;
}

/* 「⏸ 一時停止 ／ ▶ 続きから」のボタン

   ・幅 … 入れかわる前の2つ（148px × 2 ＋ すき間10px）と同じにして、段の大きさをそろえる
   ・色 … 止まっているとき（▶ 続きから）は、「▶ 全曲再生」と同じ金色（押すと鳴りはじめるボタン）
           鳴っているとき（⏸ 一時停止）は、曲のカードの「⏸ 一時停止」（.track__button--playing）と同じ紺色にする
           （すぐ下の --pause。同じ操作のボタンは、上でも下でも同じ色に見えるようにそろえている）
           色が入れかわるので、いま鳴っているかどうかも ひと目で分かる */
.st-playall__button--toggle {
  min-width: 306px;
}

.st-playall__button--pause {
  border-color: var(--navy-deep);
  background: var(--navy);
  color: #fff;
}

/* 「🔀 シャッフル再生」は、白〜水色＋紺色の文字にする
   （「⏭ 次のトラックへ」と同じ考えかた）

   金色の「▶ 全曲再生」ととなり合わせでも、うるさく見えないようにしている
   大きさ（min-width・余白・文字の大きさ）は金色のボタンとそろえてあるので、
   2つ並んでもガタつかない */
.st-playall__button--shuffle {
  border-color: var(--navy);
  background: linear-gradient(180deg, #fff 0%, #d6f0fb 100%);
  color: var(--navy-deep);
}

/* 操作行の3つ（⏮ 前のトラックへ ／ ⏭ 次のトラックへ ／ ■ 停止）は、どれも白〜水色＋紺色の文字にする

   ■ ボタンの色の意味（このページ全体でそろえている）
     ・金色         … 押すと鳴りはじめる（▶ 全曲再生・▶ 続きから）
     ・紺色ぬりつぶし … いま鳴っている。押すと止まる（上の ⏸ 一時停止・曲のカードの ⏸ 一時停止）
     ・白〜水色     … そのほかの操作（前へ・次へ・停止・曲のカードの ▶ 再生）

   ■ 前は「■ 停止」も紺色でぬりつぶしていた
     上の「⏸ 一時停止」を曲のカードと同じ紺色にしたので、紺色のボタンが2つならび、
     見分けにくくなってしまった。そこで「■ 停止」は前・次と同じ白〜水色にして、
     紺色は「⏸ 一時停止」だけ（＝いま鳴っているしるし）にした
     「■ 停止」は、いちばん右のはしで、文字（■ 停止）でも見分けられる

   （大きさは、下の「操作行の3つのボタンの大きさをそろえる」で、3ついっしょに決めている） */
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

/* 「番号を押すと…」の案内

   すぐ上の「▶ 全曲再生」「🔀 シャッフル再生」が真ん中にならんでいるので、
   案内も真ん中にそろえて、そのボタンについての説明だと、ひと目で分かるようにする
   （左はしに置くと、ボタンの列とずれて、別の話に見えてしまう）

   text-wrap: balance … 2行に折り返すときに、行の長さをそろえる
   （スマホで「…始／める曲を選べます」のように、1〜2文字だけ次の行へ落ちるのを防ぐ
     対応していないブラウザでは、ふつうに折り返すだけ） */
.st-playall__hint {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
  text-align: center;
  text-wrap: balance;
}

/* 全曲再生中の案内（今回の何曲目か＋実際のトラック番号）

   align-items: baseline … 3つは文字の大きさがちがうので、
   中央でそろえると「7 / 7」と曲名の数字が縦にずれて見える
   文字の下の線（ベースライン）でそろえて、数字の高さを合わせている

   justify-content: center … 上の「▶ 全曲再生」も、下の「⏭ 次のトラックへ」も
   真ん中にならんでいるので、あいだにあるこの案内も真ん中にそろえる */
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

/* 「♪ 全曲再生中」は金色（＝「▶ 全曲再生」ボタンと同じ色）
   「🔀 シャッフル再生中」は紺色（＝「🔀 シャッフル再生」ボタンの縁と同じ色）にして、
   どちらの順番で鳴らしているかを、色だけでも見分けられるようにしている */
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

/* 「7 / 7」は曲名と同じ大きさにして、となりの数字とそろえる
   font-variant-numeric: tabular-nums … 数字の幅をそろえて、
   曲が進んでも「7 / 7」の位置が動かないようにする */
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

/* 歌詞の1行（うた入りの曲を選んでいるあいだ、曲の一覧を出しているときだけ）

   現在曲の表示のすぐ下に、1行だけ、曲名より少し大きく出す
   背景は、歌詞の画面の行にカーソルを当てたときと同じ、うすい水色
   行が変わるたびに、下から ふわっと出なおす（key が変わるため） */
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

/* 歌詞の画面 ⇄ 曲の一覧 の切りかえ（アイコン ＋ 2文字の名前の、小さな丸いボタン）
   メインの「▶ 全曲再生」（金色）ほど目立たせない、白系の背景＋紺色の枠の軽い見た目
   歌詞の画面を出しているあいだ（aria-pressed）は、紺色でぬって「いま歌詞を出している」ことが分かるようにする */
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

   曲の一覧（.st-trackScroll）と同じく、操作エリアの下の のこりの高さをぜんぶ使い、この中だけがスクロールする
   ・行は大きめの文字で、まんなかぞろえ
   ・いまの行 … 紺色で少し大きく
   ・歌いおわった行 … うすく（これから歌う行は、ふつうの色）
   ・下に大きめの余白 … 最後のほうの行も、画面の上寄りまでスクロールして来られるように
   ============================================================ */
/* 曲を選んでいるあいだ（再生中・一時停止中）は、ページの見出し（ORIGINAL SOUNDTRACK／こうちゃんの大冒険）を画面からかくす
   操作エリアが低くなったぶん、曲の一覧・歌詞の画面が広くなる
   ・一時停止のたびに出たり消えたりしないよう、「⏮ 前へ／⏭ 次へ／■ 停止」が出ているあいだと同じ条件にしている（→ hasPlaybackControls）
   ・見た目だけかくす（読み上げソフトには、これまでどおりページの見出しとして伝える） */
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

/* 歌詞の画面を出しているあいだは、曲の一覧のための案内（番号を押すと…）もかくす
   （曲の一覧を出していないので、案内は要らない。歌詞の画面が そのぶん広くなる） */
.soundtrack--lyricsView .st-playall__hint {
  display: none;
}

.st-lyricsView {
  flex: 1;
  box-sizing: border-box; /* 高さ（背の低い画面の max-height）に、上下の余白もふくめる */
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

/* 歌いおわった行は、さらにうすく */
.st-lyricsView__line--past {
  opacity: 0.45;
}

/* いま歌っている行
   やわらかい水色（パステル）の帯に、濃い紺色の文字で出して、ひと目で分かるようにする
   （このページの青い色あいにそろえつつ、まわりの灰色の行とは、帯と文字の濃さで見分けられるようにする）
   ※ 前は紺色の文字だけで、これから歌う行とほとんど同じ濃さだったので、見分けにくかった
   下のふちだけ少し濃い水色にして、ボタンと同じく少し浮いて見せる。カーソルを当てても同じ水色のまま */
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

/* 再生中の操作行（⏮ 前のトラックへ ／ ⏭ 次のトラックへ ／ ■ 停止）

   個別再生・全曲再生・シャッフル再生のどれでも、このならび1つを使う
   左から「前 → 次 → 停止」。PCでは横に3つならべて、真ん中へ寄せる
   幅が足りないときは折り返す（スマホでは、入らなければ2段・3段に積み直す） */
.st-playall__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
  margin: 10px 0 0;
}

/* 操作行の3つのボタンの大きさをそろえる

   前・次（水色）と停止（紺色）は、もともと余白や文字の大きさがちがっていたが、
   3つがバラバラの幅に見えないよう、ここで同じ大きさの「ひとまとまり」にする

   ・flex: 1 1 0            … 3つで横幅を「同じ割合」で分け合う（文字の長さに引っぱられない）
   ・min-width: max-content … ただし、文字より細くはしない（ボタンから文字がはみ出さない）
                              3つが入りきらない幅になったら、ならびの flex-wrap で次の段へ折り返す
   ・max-width: 210px       … 広い画面で横いっぱいにのびすぎないよう、上限を決める
                              （いちばん長い「■ シャッフル再生を停止」が入る大きさ。停止だけ極端に大きくはならない）
   ・余白と文字の大きさ     … 3つとも同じにして、高さもそろえる */
.st-playall__actions .st-playall__button {
  flex: 1 1 0;
  min-width: max-content;
  max-width: 210px;
  padding: 9px 16px;
  font-size: 15px;
}

/* 操作行の短い文字（⏮ 前へ ／ ⏭ 次へ ／ ■ 停止）は、スマホ幅のときだけ出す
   （→ @media (max-width: 600px)。PCでは長い文字のまま） */
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

/* 曲名の行（曲名 ＋「♪ 再生中」＋ ⓘ）

   ■ 前は display: flex で横にならべていた
     flex だと、曲名がまるごと1つの箱になるので、入りきらないと
     「♪ 再生中」と ⓘ が曲名の下の行へ落ちたり、ⓘ だけが次の行に取り残されたりしていた

   ■ いまは、ふつうの文章と同じならべかた（display: block のまま）
     ・曲名の最後の文字のすぐうしろに「♪ 再生中 ⓘ」のかたまり（.track__titleSide）が続く
     ・かたまりが入りきらないときは、2つがいっしょに次の行の先頭へ移る

   ■ word-break: keep-all … 曲名を、言葉のとちゅう（「おしま｜い」など）で割らない
     折り返すのは「、」や空白のところだけになる
     （たとえば「きょうの大冒険、おしまい！ ～うた入り～」は「おしまい！」のうしろで折り返す）
   ■ overflow-wrap: anywhere … ただし、1つの言葉がカードの幅より長いときだけは、
     はみ出さないように、とちゅうでも折り返す（念のための逃げ道） */
.track__title {
  margin: 0 0 2px;
  color: var(--navy-deep);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.5;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

/* 曲名と「♪ 再生中 ⓘ」のすき間

   右がわの余白（曲名のうしろ）＋ テンプレートの空白1つぶん で、約10pxあける
   かたまりの左に余白を付けないのは、次の行へ移ったときに、行の先頭が字下げされて見えないようにするため
   （曲名のうしろの余白は、前の行の終わりに残るだけで、目に見えない） */
.track__titleText {
  margin-right: 5px;
}

/* 「♪ 再生中」と ⓘ のかたまり

   inline-flex … このかたまりの中では折り返さない（2つが いつもいっしょ）
                  文章の中の1文字のようにあつかわれるので、曲名の最後の文字に続けてならぶ
   vertical-align: middle … 曲名の文字の高さの まんなかに、目印と ⓘ をそろえる */
.track__titleSide {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  vertical-align: middle;
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

/* 曲の説明文

   word-break: keep-all … 言葉のとちゅうでは折り返さない
                          折り返すのは、テンプレートの <wbr>（説明文の「|」のところ）と空白だけ
   overflow-wrap: anywhere … 1つのかたまりがカードの幅より長いときだけ、はみ出さないように、とちゅうでも折り返す
   （曲名の行 .track__title と同じ考えかた） */
.track__description {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

/* 曲ごとの再生ボタン

   白〜うすい水色＋紺色の文字にしている
   （「🔀 シャッフル再生」「⏭ 次のトラックへ」と同じ見た目）

   前は「▶ 全曲再生」と同じ金色だったが、曲の数だけ金色のボタンがならぶと、
   ページでいちばん大事な「▶ 全曲再生」が、どれなのか分かりにくくなる
   そこで、金色は「▶ 全曲再生」だけに使い、曲ごとのボタンは一段ひかえめにしている
   （鳴っている曲のボタンは、今までどおり紺色になるので、どれが鳴っているかはすぐ分かる）

   ※ 小さくしすぎると押しにくいので、高さは指でも押せる大きさを保つ */
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
   ボーナストラックのロック表示（まだS+ランクを取っていないときだけ出る）

   曲のカード（.track）と同じ角の丸み・余白にして、一覧の「最後の1曲」に見せる
   押せないことが分かるよう、ふちは点線、色はうすくしている
   （ボタンが無いので、:hover や :focus-visible の見た目も付けない）
   ============================================================ */
/* position: relative が大事
   中の読み上げ用の文字（.st-lockedTrack__srText）は position: absolute で、
   いちばん近い position 付きの箱を基準に置かれる
   これが無いと、基準がページ全体（body）になり、曲の一覧の箱の外へ飛び出して、
   ページそのものが曲の一覧の長さぶん（375×667 で約860px）スクロールできるようになっていた
   （スマホで指を動かすと、曲の一覧ではなくページごと動いて、上の操作エリアが画面の外へ消えてしまう）
   このカードを基準にすると、文字はカードの中（＝曲の一覧の箱の中）に収まる */
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

/* 🔒 … 上の曲の番号（.track__no）と同じくらいの幅にして、曲名の書きはじめをそろえる */
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

   inline-block … かたまりの中では折り返さない。折り返すのは、かたまりとかたまりのあいだ（<wbr>）だけ
   max-width: 100% … ただし、1つのかたまりがカードの幅より長いときだけは、
                    中でも折り返して、はみ出さないようにする（念のための逃げ道） */
.st-phrase {
  display: inline-block;
  max-width: 100%;
}

/* 何をすれば解放できるかの案内（曲の説明文 .track__description と同じ折り返しかた） */
.st-lockedTrack__description {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

/* 読み上げソフトにだけ伝える文字（画面には出さない）
   display: none にすると読み上げからも消えてしまうので、1pxの見えない箱に入れている */
.st-lockedTrack__srText {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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
   動きを減らす設定にしている人への配慮
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
  }

  /* 歌詞の行は、動かさずに切りかえる */
  .st-lyrics__line {
    animation: none;
  }
}

/* ============================================================
   スマホ幅：曲のカードを縦に積み直す
   横にはみ出さないようにする
   ============================================================ */
@media (max-width: 600px) {
  /* ============================================================
     スマホでは、操作エリアが高くなりすぎないように、全体をひと回りコンパクトにする

     スマホの縦画面は、PCより ずっと背が低いのに、
     全曲再生・シャッフル・次へ・停止などが縦に積まれやすい
     そのまま操作エリアに入れると、曲の一覧がほとんど見えなくなってしまう

     ボタンそのものは小さくしすぎない（指で押しやすい高さは残す）
     そのかわり、つめるのは次のようなところ
     ・画面のふち・カードの上下の余白
     ・見出しの文字と余白
     ・カードどうしのすき間、説明文の上の余白
     ・横にならべられるボタンは、2つを横にならべる（入りきらないときだけ、自動で2段になる）
     ============================================================ */
  .st-fixedArea {
    padding: 8px 16px;
  }

  .st-trackScroll {
    padding: 8px 16px 24px;
  }

  /* 歌詞の画面も、曲の一覧と同じ左右の余白にして、文字を少し小さくする */
  .st-lyricsView {
    padding: 12px 16px 40vh;
  }

  .st-lyricsView__line {
    padding: 5px 10px;
    font-size: 20px;
  }

  /* 上部ツールバー（スマホ）

     タイトル画面（B画面）の右上と同じ並べかたにする
       左 … 「← 戻る」（文字の長さぶんの、小さな丸いボタン）
       右 … 🔊 ミュートボタン ＋ 音量バー（SoundControl.vue。B画面と同じ部品）

     戻るボタンの文字は、PCでもスマホでも「← 戻る」（タイトル画面（B画面）と同じ）

     ・min-height: 36px … 小さくしても、指で押せる高さは残す（右のサウンドの枠の高さともそろう）
     ・ツールバーのカードの上下の余白と、見出しとのすき間は、少しつめる（操作エリアを低くするため） */
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

  /* 右のサウンドは、B画面のスマホと同じ大きさにする（assets/css/game/sound.css の .title-card__tools） */
  .st-toolbar .sound-control {
    --sound-button-size: 36px;
    --sound-icon-size: 19px;

    /* 音量バーだけは、B画面のスマホより大きくする
       このページは曲を聴くページなので、音量を指で細かく合わせやすいほうがよい
       ・長さ … 「← 戻る」の右に空いている幅を、ぜんぶ使う（→ すぐ下の flex）
                 100px は「いちばん短いときの長さ」（幅 320px の画面でも1行に収まる長さ）
       ・レール … 5px → 7px、つまみ … 14px → 22px（指でつかみやすくする）
       枠の高さ（36px）は変えないので、ツールバーの高さも変わらない */
    --sound-slider-width: 100px;
    --sound-slider-track: 7px;
    --sound-slider-thumb: 22px;

    /* 「← 戻る」の右の空きを、サウンドの枠が受け取ってのびる */
    flex: 1 1 auto;
  }

  /* のびた枠の中で、音量バー（とそのかこい）が、あまった幅をぜんぶ使う
     中の要素は SoundControl.vue の部品なので、:deep() で指す */
  .st-toolbar :deep(.sound-control__sliderWrap),
  .st-toolbar :deep(.sound-control__slider) {
    flex: 1 1 auto;
  }

  /* スマホ・タブレット（指で操作する画面）では、サウンドの枠をのばさない

     指で操作する画面では音量バーを出さず、ミュートボタンだけにしている（→ components/game/SoundControl.vue）
     のばしたままだと、ボタン1つの枠だけが横に長くなり、🔊 が「← 戻る」のすぐ右に来てしまう
     のばさなければ、上の margin-left: auto で、ミュートボタンが右はしに寄る（タイトル画面（B画面）と同じ形）
     ※ マウスで操作する細い窓（パソコン）では音量バーが出るので、今までどおり のばす
       （見分けかたは utils/touchDevice.ts・sound-control.css と同じ） */
  @media (hover: none) and (pointer: coarse) {
    .st-toolbar .sound-control {
      flex: none;
    }
  }

  .st-playall {
    padding: 10px 12px 12px;
  }

  /* 「▶ 全曲再生」「🔀 シャッフル再生」のならび
     （操作行の3つは、PC用の「3つの大きさをそろえる」指定のほうが優先されるので、下の指定もあわせて見ること）

     前は、スマホではどちらのならびも縦に積んでいたが、
     それだと操作エリアが高くなりすぎるので、入るときは2つを横にならべる
     ・flex: 1 1 auto … 2つで横幅を分け合って広がる
     ・min-width: 0   … PC用の最低幅（148px）をやめて、文字ぶんの幅から広がるようにする
     ・入りきらない幅のときは、ならびの flex-wrap: wrap で自動で2段になり、
       それぞれが1段まるごとの幅になる（文字を小さくしてまで、むりに横にはならべない）

     上下の余白は少しだけつめるが、指で押しやすい高さ（約48px）は残す */
  .st-playall__button {
    flex: 1 1 auto;
    min-width: 0;
    padding: 9px 12px;
  }

  .st-playall__starters,
  .st-playall__actions {
    gap: 8px;
  }

  /* 「⏸ 一時停止 ／ ▶ 続きから」は、スマホ幅では段いっぱいまで広げる（指で押しやすくする）
     PC用の最低幅（306px）は外す。320px の画面でもはみ出さないように */
  .st-playall__button--toggle {
    min-width: 0;
  }

  .st-playall__actions {
    margin-top: 8px;
  }

  /* 操作行（⏮ 前のトラックへ／⏭ 次のトラックへ／■ 停止）は、文字を1段小さくして、左右の余白もつめる

     ※ 前は「長い文字のまま、入りきらなければ2段・3段に折り返す」作りだった
       いまは、スマホ幅では文字を短くして、かならず1段にならべている（→ すぐ下の指定）

     ※ PC用の上限（max-width: 210px）は外して、段の中では横いっぱいまで広げる（指で押しやすくする）
     ※ 高さは約45pxあるので、指での押しやすさはそのまま */
  .st-playall__actions .st-playall__button {
    max-width: none;
    padding: 9px 8px;
    font-size: 14px;
  }

  /* 操作行の3つを、短い文字（⏮ 前へ ／ ⏭ 次へ ／ ■ 停止）にして1段にならべる

     上の説明のとおり、長い文字のままだと3つは1段に入りきらず、2段（約98px）になっていた
     再生を始めるたびに操作エリアがそのぶん高くなり、375×667 では曲の一覧が約30pxまで小さくなっていた
     文字を短くすれば、320px の画面でも3つが1段に収まる
     ・min-width: 0 … PC用の min-width: max-content（長い文字の幅）をやめる
     ・flex-wrap: nowrap … 3つをかならず1段にする
     ・何のボタンかは、読み上げソフトには aria-label の長い名前で伝わる */
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

  /* 曲を選んでいるあいだ（再生中・一時停止中）は、「番号を押すと…」の説明を隠す

     この説明は、止まっているときに「どの曲から全曲再生を始めるか」を知らせるためのもの
     再生中まで出していると、そのぶん（約42px）操作エリアが高くなり、曲の一覧がせまくなる
     止めれば、また出る（.st-playall--active は hasPlaybackControls のあいだだけ付く） */
  .st-playall--active .st-playall__hint {
    display: none;
  }

  /* 説明文（番号を押すと…／サウンドOFF中…）は、上のすき間と文字を少しつめる */
  .st-playall__hint,
  .st-settings__hint {
    margin-top: 6px;
    font-size: 13px;
  }

  /* いま鳴っている曲の案内も、上のすき間を少しつめて、2行にまとめる

       1行目 … ♪ 全曲再生中　［歌詞］（［歌詞］は、うた入りの曲のときだけ）
       2行目 … 6 / 7　06 きょうの大冒険、おしまい！

     前は「目印と N / 曲数」「曲名」「再生中の曲を見る」がそれぞれ1行ずつの3行（約98px）で、
     再生を始めるたびに、そのぶん曲の一覧がせまくなっていた
     「再生中の曲を見る」を1行目の目印のとなりへ上げて、2行（約65px）にする
     （「🔀 シャッフル再生中」は長いので、「6 / 7」まで1行目に入れると入りきらず、3行になってしまう
       そこで「6 / 7」は2行目の曲名の前へ回す）

     ・::after … 高さ0の「改行」の役わり
                 flex-basis: 100% で1行まるごと使うので、この前と後ろで、かならず行が分かれる
     ・order     … HTMLでは「目印・N/曲数・曲名・歌詞ボタン」の順だが、
                   目印と歌詞ボタン（0）→ 改行（1）→ N/曲数と曲名（2）の順にならべかえる
       （前は「再生中の曲を見る」も1行目にあったが、曲が鳴りはじめたときの自動スクロールにかえて、なくした）
     ・align-items: center … 1行目の目印とボタンの上下をそろえる */
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

  /* 1行目の目印を、ひと回り小さくする
     いちばん長い「🔀 シャッフル再生中」と［歌詞］が、幅のせまい画面でも1行にならぶようにするため */
  .st-playall__badge {
    padding: 2px 10px;
    font-size: 13px;
  }

  /* 再生の設定（🔁 リピート）
     ※ 音量は、上部ツールバーの SoundControl.vue へ移したので、ここはリピートの1行だけ */
  .st-settings {
    gap: 8px 12px;
    margin-top: 8px;
    padding-top: 8px;
  }

  /* 見出し（ORIGINAL SOUNDTRACK ／ こうちゃんの大冒険）

     サウンドトラックのページの名前なので、スマホでも消さずに残す
     そのかわり、文字・余白・下の影を 小さくして、操作エリアを低くする
     （約82px → 約60px。再生中は曲の一覧がせまくなりやすいので、見出しのぶんも少しゆずる）
     影を4pxにしたので、下のすき間も「影4px ＋ すき間6px」にそろえている */
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

  /* 曲のカード（スマホ）

     1行目 … [01] 曲名 ⓘ ／ 説明
     2行目 … ▶ 再生（横いっぱい）
     3行目 … 再生バー（いま選んでいる曲だけ）

     前は「番号」「曲名と説明」「再生ボタン」を ぜんぶ縦に積んでいたので、
     番号が横いっぱいの帯になって浮いて見え、1曲ぶんのカードも縦に長かった
     番号を曲名の左にならべると、PCの一覧と同じ並びのまま、1曲ぶんが低くなる
     （曲が増えても、スクロールする量が少なくてすむ） */
  .track {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px 12px;
    padding: 12px 14px;
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

  /* ボタンは、番号の下から右はしまで横いっぱいに広げて、押しやすくする
     （1 / -1 … 1列目から最後の列まで、ぜんぶ使う） */
  .track__button {
    grid-column: 1 / -1;
    width: 100%;
  }

  /* ボーナストラックのロック表示も、上の曲のカードと同じ余白・文字の大きさにそろえる */
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

  /* ⓘ の吹き出し（制作情報）
     スマホでは1行のままだと横幅が広いので、
     「ⓘ の真下に中央ぞろえ」だと画面の左右へはみ出してしまう。
     そこで基準を ⓘ から「曲名の行」（上の .track__title）に変えて、
     曲名の行の右はし（＝カードの中身の右はし）にそろえて、左へのばして出す。

     曲名の行は、左に番号があるぶん右から始まるので、
     左はしにそろえると、長い制作情報が画面の右へはみ出してしまう
     右はしにそろえておけば、曲名の長さや ⓘ の位置に関係なく、いつもカードの中に収まる */
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

/* ============================================================
   スマホで、画面全体が指のフリックで上下に動かないようにする

   このページは、上の操作エリアは動かさず、下の曲の一覧（.st-trackScroll）だけをスクロールする作り
   ところがスマホでは、次のようなときに「ページ全体」が上下にぐにゃっと動いてしまう
   ・上の操作エリア（ツールバー・見出し・全曲再生）を指で上下にフリックしたとき
   ・曲の一覧をいちばん上／下までスクロールして、さらにフリックしたとき
     （一覧の中でスクロールしきれなかった勢いが、うしろのページに伝わる）

   ・html / body … ページそのものはスクロールさせず、引っぱったときの「ばね」の動きも止める
                   :has(.soundtrack) … このページを出しているあいだだけ効かせる
                   （ゲーム本編（/）の html / body には、何も変えない）
   ・.st-fixedArea … 上の操作エリアでは、指の上下の動きをブラウザに使わせない
                     （ボタンを押す・音量バーを横に動かす・2本指で拡大する、はそのままできる）
   ・.st-trackScroll … 曲の一覧のはしまで来ても、その勢いをうしろのページへ伝えない

   ※ 縦にとても低い画面（高さ 580px 以下）と、とても幅のせまい画面（幅 360px 未満）は、
     下の @media でページ全体をスクロールする作りに戻しているので、ここは効かせない
   ============================================================ */
@media (max-width: 600px) and (min-width: 360px) and (min-height: 581px) {
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
   縦にとても低い画面（高さ 580px 以下）と、とても幅のせまい画面（幅 360px 未満）

   スマホを横向きにしたときや、ブラウザの窓をとても低くしたときは、
   操作エリアだけで画面がほとんど埋まってしまい、
   曲の一覧の箱が、ほとんど高さ0になって見えなくなる

   幅 360px 未満の小さなスマホも同じで、
   ツールバーや全曲再生のボタンが2段に折り返すぶん、操作エリアが高くなり、
   全曲再生中は、操作エリアだけで画面の高さを超えてしまう（下の音量が切れて押せなくなる）

   そういう画面では、上と下に分けるのをやめて、
   前と同じ「ページ全体を縦にスクロールする」作りに戻す
   （カンマで区切った @media は「どちらか1つに当てはまれば」という意味）
   ・.soundtrack     … 画面の高さに合わせるのをやめ、中身ぶんまでのびる（ページがスクロールする）
   ・.st-trackScroll … 自分ではスクロールせず、曲のカードをぜんぶならべる
   ・.st-fixedArea   … 曲の一覧にスクロールバーが出ないので、その場所を空けておくのもやめる
   ============================================================ */
@media (max-height: 580px), (max-width: 359px) {
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

  /* 歌詞の画面は、ページ全体がスクロールするこの作りでも、自分の中でスクロールして いまの行を追いかけたいので、
     高さを画面の6割までにしておく */
  .st-lyricsView {
    flex: none;
    max-height: 60vh;
    max-height: 60dvh;
    padding-bottom: 30vh;
  }
}
</style>
