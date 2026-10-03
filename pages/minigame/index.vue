<script setup lang="ts">
/* ============================================================
   ミニゲームの一覧（/minigame）

   起動画面（A画面）の「🎮 ミニゲーム」から来るページ
   data/minigames.ts の一覧を上から順にカードで並べ、押すとそのミニゲームのページ（/minigame/<id>）へ移る

   ■ カードは2種類
     ・解放したミニゲーム   … アイコン・名前・ひとこと説明・自己ベスト（遊んだことがあれば）。押すとそのページへ
     ・まだ解放していないもの … 「？？？」とヒントだけ（名前・説明は出さない）。押せない
       まだ何かがあることだけ分かるようにして、本編をまた遊ぶきっかけにする

   ■ ミニゲームを増やすときは、このページは さわらなくてよい
     data/minigames.ts に1件たせば、ここにカードが1枚ふえる

   ■ 音
     BGMは、タイトルBGM「こうちゃんの大冒険」（タイトル画面（B画面）と同じ、メニューの曲）
     ミニゲームに入ると、そのミニゲームの曲に切りかわる（このページから出るときに、タイトルBGMは止まる）
     効果音（決定音「ポン♪」）と、サウンドのON/OFF・音量は、ほかのページと同じ設定を使う
   ============================================================ */

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

import SecretPathIcon from '~/components/game/SecretPathIcon.vue';
import MinigameLayout from '~/components/minigame/MinigameLayout.vue';
import { useAudio } from '~/composables/useAudio';
import { moveMinigameFocusByArrow } from '~/composables/useMinigameKeyboardNav';
import { minigames } from '~/data/minigames';
import type { MinigameBestPart, MinigameId } from '~/data/minigames';
import type { GameEvent } from '~/types/game';
import { loadMinigameBest, loadUnlockedMinigames } from '~/utils/minigameStorage';
// 絵の先読みと、中の絵が表示できるようになってから箱ごと出す目印（→ utils/imagePreload.ts）
import { preloadSecretPathImages, vRevealWithImages } from '~/utils/imagePreload';

/* ============================================================
   音（タイトルBGM・決定音・サウンドのON/OFF・音量）

   useAudio() は本編の場面を受け取る作りなので、「タイトル画面（B画面）にいる」ときと同じ値を渡す
   ・titleEntered … true ／ gameStarted … false
     → playTitleBgmSoon() でタイトルBGMが鳴り、
       サウンドをOFFからONに戻したときも、タイトルBGMの続きが鳴る（公園BGMなどは鳴らない）
   ============================================================ */
const {
  soundEnabled,
  soundVolumePercent,
  toggleSound,
  changeSoundVolume,
  playDecisionSound,
  playTitleBgmSoon,
  resumeTitleBgm,
  restoreSoundSettings,
  cleanupAudio,
} = useAudio({
  titleEntered: ref(true),
  gameStarted: ref(false),
  currentEvent: ref<GameEvent>('parkEntrance'),
  isTantrum: ref(false),
  isResultScene: computed(() => false),
  currentMinutes: computed(() => 0),
  endingRank: ref(''),
});

/* ============================================================
   解放したミニゲームと、自己ベスト

   localStorage はブラウザにしか無いので、onMounted で読む
   読むまで（isLoaded が false のあいだ）はカードを出さない
   （先に全部「？？？」で出て、すぐ入れかわって見えないように）
   ============================================================ */
const isLoaded = ref(false);
const unlockedIds = ref<MinigameId[]>([]);

/* カードに出す自己ベストの項目のならび（まだ遊んでいないものは入れない。項目の形は data/minigames.ts の MinigameBestPart） */
const bestParts = ref<Partial<Record<MinigameId, MinigameBestPart[]>>>({});

/* 一覧のカード（上から順）。解放したかどうかと、自己ベストの文をつけておく */
const cards = computed(() =>
  minigames.map((minigame) => ({
    ...minigame,
    isUnlocked: unlockedIds.value.includes(minigame.id),
    bestParts: bestParts.value[minigame.id] ?? null,
  })),
);

/* ひとつでも解放したものがあるか（上の説明文を出しわける） */
const hasAnyUnlocked = computed(() => unlockedIds.value.length > 0);

/* ============================================================
   ページの移動（ミニゲームへ ／ はじめの画面へ）

   ページが入れかわるときも短いフェードをはさむので、
   押したあとも しばらくこのページが見えている
   そのあいだに続けて押されても、移動のお願いを2回出さないようにする
   （どちらの行き先も、この isLeavingPage ひとつで1回きりにしている）

   決定音「ポン♪」を鳴らすのは、ミニゲームのカードを選んだときだけ
   「← 戻る」では鳴らさない（引き返すだけのボタンなので）
   ============================================================ */
let isLeavingPage = false;

async function goTo(path: string) {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  // 決定音「ポン♪」（ほかのページのボタンと同じ）
  playDecisionSound();

  await navigateTo(path);
}

/* 「← 戻る」（上部ツールバーの左のボタン）

   やることは goTo() と同じで、決定音を鳴らさないところだけがちがう
   （ゲーム本編のA画面・B画面の「戻る」、それぞれのミニゲームの「戻る」とそろえている） */
async function goBackToTitle() {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  await navigateTo('/');
}

/* ============================================================
   キーボード

   カードも上の行（← 戻る・サウンド）も ふつうの button なので、Tab で移動し、Enter / Space で押せる
   それに加えて、矢印キーでもボタンを選べるようにする（はじめの画面と同じ動き）
   ・↑ ↓ … カードを1枚ずつ。いちばん上・下のカードの先は、上の行の「← 戻る」
   ・← → … 上の行の「← 戻る」⇔「サウンド」（カードにいるときは、← で戻る・→ でサウンドへ）
   くわしい動きは composables/useMinigameKeyboardNav.ts
   ============================================================ */
const layoutRef = ref<InstanceType<typeof MinigameLayout> | null>(null);
const listRef = ref<HTMLUListElement | null>(null);

/* 遊べるカードのボタン（上から順）。v-for の ref は並び順が決まっていないので、画面の順に取りだす */
function getCardButtons() {
  return [...(listRef.value?.querySelectorAll<HTMLButtonElement>('button.mg-card') ?? [])];
}

function handleKeydown(event: KeyboardEvent) {
  const topRow = [layoutRef.value?.backButton, layoutRef.value?.soundToggleButton];

  if (moveMinigameFocusByArrow(event, topRow, getCardButtons())) {
    event.preventDefault();
  }
}

onMounted(async () => {
  // 前回のサウンドの設定（ON/OFFと音量）を思い出す（本編と同じ保存場所）
  restoreSoundSettings();

  // カードのアイコンと、ミニゲームの中で使う絵を先読みしておく（ミニゲームへ進んだときに、絵だけあとから出ないようにする）
  preloadSecretPathImages();

  /* タイトルBGM（少し待ってから、ふわっと鳴りはじめる）

     はじめの画面の「🎮 ミニゲーム」を押して来たときは、そのまま鳴る
     アドレスを直接開いたときは、ブラウザの決まりで、まだ一度もさわっていないページでは音を鳴らせない
     そのときは、はじめて押した・キーを押したときに鳴らす（→ resumeBgmOnFirstInput） */
  playTitleBgmSoon();
  window.addEventListener('pointerdown', resumeBgmOnFirstInput, { once: true });
  window.addEventListener('keydown', resumeBgmOnFirstInput, { once: true });

  unlockedIds.value = loadUnlockedMinigames();
  bestParts.value = Object.fromEntries(
    minigames.flatMap((minigame) => {
      const parts = minigame.formatBest(loadMinigameBest(minigame.id));

      return parts ? [[minigame.id, parts]] : [];
    }),
  );
  isLoaded.value = true;

  window.addEventListener('keydown', handleKeydown);

  // いちばん上の、遊べるミニゲームのカードへフォーカスを当てておく（Enter ですぐ入れる）
  // まだ1つも解放していないときは、上の「← 戻る」へ（矢印キー・Enter ですぐ操作できるように）
  await nextTick();
  (getCardButtons()[0] ?? layoutRef.value?.backButton)?.focus();
});

/* はじめて押した・キーを押したときに、タイトルBGMを鳴らす（もう鳴っているときは、そのまま。1回だけ）
   アドレスを直接開いて、ページを開いたときには鳴らせなかったときのため */
function resumeBgmOnFirstInput() {
  window.removeEventListener('pointerdown', resumeBgmOnFirstInput);
  window.removeEventListener('keydown', resumeBgmOnFirstInput);
  resumeTitleBgm();
}

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('pointerdown', resumeBgmOnFirstInput);
  window.removeEventListener('keydown', resumeBgmOnFirstInput);
  cleanupAudio();
});
</script>

<template>
  <MinigameLayout
    ref="layoutRef"
    back-label="← 戻る"
    back-aria-label="はじめの画面へ戻る"
    variant="menu"
    :sound-enabled="soundEnabled"
    :sound-volume-percent="soundVolumePercent"
    @back="goBackToTitle"
    @toggle-sound="toggleSound"
    @volume-change="changeSoundVolume">
    <!-- 外枠（背景 ＋ 上部ツールバー「← 戻る ／ サウンド」）は、それぞれのミニゲームと同じ部品

         ※ このコメントを <MinigameLayout> の外（template のすぐ下）に書かないこと
           開発中（nuxt dev）はコメントも残るので、ページのいちばん外の要素が2つ（コメント ＋ 部品）になり、
           ページを移るときのフェード（nuxt.config.ts の pageTransition）がこわれて、
           移った先の画面がまっ暗のまま何も出なくなる -->
    <section class="mg-stage">
      <header class="mg-heading">
        <h1 class="mg-heading__title">🎮 ミニゲーム</h1>
        <p v-if="isLoaded" class="mg-heading__lead">
          {{ hasAnyUnlocked ? 'あそびたいミニゲームをえらんでね！' : 'ゲーム本編で見つけたものが、ここで遊べるようになるよ。' }}
        </p>
      </header>

      <ul v-if="isLoaded" ref="listRef" v-reveal-with-images class="mg-list">
        <li v-for="card in cards" :key="card.id">
          <!-- 解放したミニゲーム（押すと、そのページへ。↑ ↓ で選ぶときの行き先にもなる → getCardButtons()） -->
          <button v-if="card.isUnlocked" type="button" class="mg-card" @click="goTo(`/minigame/${card.id}`)">
            <!-- アイコン：絵（iconImage）があれば絵、無ければ絵文字（icon） → data/minigames.ts -->
            <span class="mg-card__icon" aria-hidden="true">
              <img v-if="card.iconImage" class="mg-card__iconImage" :src="card.iconImage" alt="" decoding="async" />
              <template v-else>{{ card.icon }}</template>
            </span>
            <span class="mg-card__body">
              <span class="mg-card__title">{{ card.title }}</span>
              <span class="mg-card__text">{{ card.description }}</span>
              <!-- 自己ベスト（「じこベスト　🏁 97m　［こもれびの絵］ 8」）。項目ごとに、絵があれば文字の左に出す -->
              <span v-if="card.bestParts" class="mg-card__best">
                じこベスト
                <span v-for="(part, index) in card.bestParts" :key="index" class="mg-card__bestPart">
                  <SecretPathIcon v-if="part.icon" :kind="part.icon" :alt="part.iconAlt" />
                  {{ part.text }}
                </span>
              </span>
            </span>
          </button>

          <!-- まだ解放していないミニゲーム（名前は出さず、ヒントだけ。押せない） -->
          <div v-else class="mg-card mg-card--locked" aria-label="まだ遊べないミニゲーム">
            <span class="mg-card__icon" aria-hidden="true">🔒</span>
            <span class="mg-card__body">
              <span class="mg-card__title">？？？</span>
              <span class="mg-card__text">{{ card.lockedHint }}</span>
            </span>
          </div>
        </li>
      </ul>
    </section>
  </MinigameLayout>
</template>

<style scoped>
/* ============================================================
   このページの中身の見た目

   背景・色の名前（--navy など）・上部ツールバーは、外枠の components/minigame/MinigameLayout.vue が持っている
   ============================================================ */

/* まんなかの列（はじめの画面のカードの中身と同じ幅。左右の padding 44px の内がわ）

   上の padding … 見出しとカードが、上のツールバーのすぐ下に詰まって見えないよう、少しだけあける
   ・画面の高さの 4%（800px の画面なら 32px）。背の高い画面ほど、少し多めにあく
   ・ただし 20px より小さく・36px より大きくはしない（ツールバーと見出しが離れすぎないように）
   ・スマホ幅の値は、下の @media (max-width: 700px) */
.mg-stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  margin: 0 auto;
  padding: clamp(20px, 4vh, 36px) 44px 24px;
}

/* 見出し（「🎮 ミニゲーム」と、ひとこと） */
.mg-heading {
  text-align: center;
}

.mg-heading__title {
  margin: 4px 0 0;
  color: var(--navy);
  font-size: 26px;
  line-height: 1.4;
}

.mg-heading__lead {
  margin: 4px 0 0;
  font-size: 15px;
}

/* カードの並び（上から1列） */
.mg-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* ===== カード（遊べるミニゲーム） =====

   こもれびの広場・秘密の小道と同じ、紫のカードの見た目（.place-card--secret）
   左から「アイコン ／ 名前・説明・自己ベスト」
   左の padding は、選ばれているときに出す ▶ のぶん、少し広くあけてある（→ すぐ下の ::before） */
.mg-card {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  /* アイコンの絵は 1.12倍に広げて はみ出して見える（→ .mg-card__iconImage）ので、そのぶん文とのすき間を広めにとる */
  gap: 20px;
  box-sizing: border-box;
  width: 100%;
  padding: 16px 18px 16px 32px;
  border: 2px solid #e6dbfa;
  border-left: 8px solid #8f6ad4;
  border-radius: 14px;
  background: #f9f4ff;
  box-shadow: 0 4px 0 rgb(35 57 94 / 12%);
  color: var(--ink);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    transform 0.1s ease;
}

.mg-card:hover {
  border-color: #bd9bef;
  transform: translateY(-1px);
}

/* 選択カーソル「▶」（はじめの画面の「はじめる」の ▶ と同じ出しかた）

   ・いま選ばれているカード（キーボードで選んでいる・マウスを乗せている）だけに出す
   ・色は、カードの名前の文字と同じ紫。大きさも、はじめの画面の ▶（13px）と同じ
   ・まだ解放していないカード（押せない）には出さない（button のカードだけ） */
button.mg-card::before {
  position: absolute;
  top: 50%;
  left: 12px;
  color: #7f5cc8;
  content: '▶';
  font-size: 13px;
  line-height: 1;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 0.15s ease;
}

button.mg-card:hover::before,
button.mg-card:focus::before {
  opacity: 1;
}

.mg-card:active {
  transform: translateY(1px);
}

/* キーボードで選んでいるときは、本編のコマンドの「選んでいる」ときと同じ水色の輪 */
.mg-card:focus-visible {
  outline: 3px solid #67e8f9;
  outline-offset: 2px;
}

.mg-card__icon {
  font-size: 34px;
  line-height: 1;
}

/* アイコンの絵（data/minigames.ts の iconImage。角の丸いアプリのアイコンのような絵）

   ■ 大きさ … PC 88px・スマホ 60px（→ 下の @media (max-width: 700px)）
     カードの顔として目立たせるため、絵文字（34px）より ずっと大きくしている
     （絵の中に こうちゃん・枝・こもれびが描きこんであり、小さいと何の絵か分からないため）
     カードは「アイコンの列（auto）＋ 文の列（1fr）」の2列なので、絵が大きくなったぶん、名前・説明・自己ベストは右へずれる
     スマホは文の列が せまくなりすぎないよう、PC より小さくしている

   ■ まわりの透明な余白を切り落とす
     角の丸い絵は、画像のまんなかの 9割ほど（はしから 6% ずつ透明）
     そのままだと、わくの大きさのわりに小さく見えるので、transform で 1.12倍に広げる
     （わくの大きさは変わらないので、となりの文字の並びはずれない。はみ出すのは透明な余白だけ）

   ■ 影 … カードのうすい紫の上で、絵のふちが ぼやけないよう、下に うすい影を付ける */
.mg-card__iconImage {
  display: block;
  width: 88px;
  height: 88px;
  object-fit: contain;
  transform: scale(1.12);
  filter: drop-shadow(0 2px 3px rgb(87 56 158 / 22%));
}

.mg-card__body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.mg-card__title {
  color: #7f5cc8;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
}

.mg-card__text {
  font-size: 14.5px;
  line-height: 1.6;
}

/* 自己ベスト（遊んだことがあるときだけ） */
/* 自己ベストの札（「じこベスト　🏁 97m　［こもれびの絵］ 8」）

   項目（「じこベスト」・「🏁 97m」・「［こもれびの絵］ 8」）を横にならべ、入りきらないときは項目のあいだで折り返す
   アイコンの絵を大きくしたぶん文の列がせまく、細いスマホでは1行に入りきらずに、カードの右のふちからはみ出していたため
   ・項目の中（「97m」など）は折り返さない（white-space: nowrap）
   ・max-width: 100% … 文の列（.mg-card__body）の幅をこえない（こえる前に折り返す） */
.mg-card__best {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 1em;
  justify-self: start;
  box-sizing: border-box;
  max-width: 100%;
  margin-top: 4px;
  padding: 1px 12px;
  border-radius: 999px;
  background: #fff6e0;
  box-shadow: inset 0 0 0 1px #f5e2be;
  color: #7a5410;
  font-size: 13.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 自己ベストの1項目（「🏁 97m」「［こもれびの絵］ 8」）
   項目のあいだは、上の .mg-card__best の column-gap で1文字ぶんあける（前は全角スペースで区切った1つの文だったので、そのときと同じくらい） */

/* ===== まだ解放していないカード（「？？？」とヒントだけ） =====
   点線の灰色にして、押せないことが見て分かるようにする */
.mg-card--locked {
  grid-template-columns: auto 1fr;
  border: 2px dashed #cfd6de;

  /* 左の太い線だけは、遊べるカードと同じ実線にする（太い点線は、ちぎれて見えるため） */
  border-left: 8px solid #cfd6de;
  background: #f3f5f7;
  box-shadow: none;
  color: var(--ink);
  cursor: default;
}

.mg-card--locked:hover {
  border-color: #cfd6de;
  transform: none;
}

.mg-card--locked .mg-card__icon {
  opacity: 0.6;
}

.mg-card--locked .mg-card__title {
  color: #8d949b;
  letter-spacing: 0.1em;
}

/* ===== スマホ幅 ===== */
@media (max-width: 700px) {
  /* スマホでも、ツールバーと見出しのあいだを少しだけあける（844px の画面なら約21px。14〜24px のあいだ） */
  /* 左右の padding は、はじめの画面のスマホ幅のカード（16px）と同じ */
  .mg-stage {
    gap: 12px;
    padding: clamp(14px, 2.5vh, 24px) 16px 16px;
  }

  .mg-heading__title {
    font-size: 22px;
  }

  .mg-card {
    gap: 16px;
    padding: 14px 14px 14px 28px;
  }

  .mg-card__icon {
    font-size: 30px;
  }

  .mg-card__iconImage {
    width: 60px;
    height: 60px;
  }

  .mg-card__title {
    font-size: 18px;
  }
}

/* 動きを減らす設定のときは、カードの動きも止める */
@media (prefers-reduced-motion: reduce) {
  .mg-card {
    transition-duration: 0.01ms;
  }
}
</style>
