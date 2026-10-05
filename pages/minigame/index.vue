<script setup lang="ts">
/* ============================================================
   ミニゲームの一覧（/minigame）

   data/minigames.ts の一覧をカードで並べる（ミニゲームを増やすときは、あちらに1件たすだけでよい）
   ・解放したもの     … 押すと /minigame/<id> へ
   ・まだ解放していないもの … 「？？？」とヒントだけ（何かがあると分かるようにして、本編をまた遊ぶきっかけにする）
   BGMはタイトルBGM（B画面と同じメニューの曲）
   ============================================================ */

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

import SecretPathIcon from '~/components/game/SecretPathIcon.vue';
import MinigameLayout from '~/components/minigame/MinigameLayout.vue';
import { useAudio } from '~/composables/useAudio';
import { moveMinigameFocusByArrow } from '~/composables/useMinigameKeyboardNav';
import { minigames, splitMinigameTitle } from '~/data/minigames';
import type { MinigameBestPart, MinigameId } from '~/data/minigames';
import type { GameEvent } from '~/types/game';
import { clearNewMinigames, loadMinigameBest, loadNewMinigames, loadUnlockedMinigames } from '~/utils/minigameStorage';
// 絵の先読みと、中の絵が表示できるようになってから箱ごと出す目印（→ utils/imagePreload.ts）
import { preloadSecretPathImages, vRevealWithImages } from '~/utils/imagePreload';

/* ============================================================
   音
   useAudio() には「タイトル画面（B画面）にいる」ときと同じ値を渡す
   （サウンドをOFFからONに戻したときも、タイトルBGMの続きが鳴るように）
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
   onMounted で localStorage から読むまでは、カードを出さない（先に「？？？」が一瞬見えないように）
   ============================================================ */
const isLoaded = ref(false);
const unlockedIds = ref<MinigameId[]>([]);

/* 本編で新しく解放して、この一覧ではじめて見るミニゲーム（カードに NEW を付ける）
   読んだらすぐ保存のほうは消すので、NEW が出るのは この1回だけ（このページにいるあいだは残す） */
const newIds = ref<MinigameId[]>([]);

/* カードに出す自己ベストの項目（まだ遊んでいないものは入れない） */
const bestParts = ref<Partial<Record<MinigameId, MinigameBestPart[]>>>({});

/* 一覧のカード（上から順）。解放したかどうか・NEW かどうかと、自己ベストの文をつけておく */
const cards = computed(() =>
  minigames.map((minigame) => ({
    ...minigame,
    isUnlocked: unlockedIds.value.includes(minigame.id),
    isNew: newIds.value.includes(minigame.id),
    bestParts: bestParts.value[minigame.id] ?? null,
    // 名前は、ことばの区切りごとに分けておく（細い画面で、ことばの途中で折り返さないように）
    titleParts: splitMinigameTitle(minigame.title),
  })),
);

/* ひとつでも解放したものがあるか（上の説明文を出しわける） */
const hasAnyUnlocked = computed(() => unlockedIds.value.length > 0);

/* ============================================================
   ページの移動（ミニゲームへ ／ はじめの画面へ）
   フェードのあいだに続けて押されても、移動は1回きりにする（isLeavingPage）
   決定音は、カードを選んだときだけ（「← 戻る」は引き返すだけなので鳴らさない）
   ============================================================ */
let isLeavingPage = false;

async function goTo(path: string) {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  playDecisionSound();

  await navigateTo(path);
}

/* 「← 戻る」（goTo() と同じで、決定音を鳴らさないところだけがちがう） */
async function goBackToTitle() {
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  await navigateTo('/');
}

/* ============================================================
   キーボード
   どれもふつうの button なので Tab・Enter で使えるが、矢印キーでも選べるようにする（→ useMinigameKeyboardNav.ts）
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

  // 絵を先読みしておく（ミニゲームへ進んだときに、絵だけあとから出ないように）
  preloadSecretPathImages();

  /* タイトルBGM（直接開いたときは鳴らせないので、はじめて押したときに鳴らす → resumeBgmOnFirstInput） */
  playTitleBgmSoon();
  window.addEventListener('pointerdown', resumeBgmOnFirstInput, { once: true });
  window.addEventListener('keydown', resumeBgmOnFirstInput, { once: true });

  unlockedIds.value = loadUnlockedMinigames();
  newIds.value = loadNewMinigames();
  clearNewMinigames();
  bestParts.value = Object.fromEntries(
    minigames.flatMap((minigame) => {
      const parts = minigame.formatBest(loadMinigameBest(minigame.id));

      return parts ? [[minigame.id, parts]] : [];
    }),
  );
  isLoaded.value = true;

  window.addEventListener('keydown', handleKeydown);

  // いちばん上の遊べるカード（無ければ「← 戻る」）へフォーカスを当てておく（Enter ですぐ操作できるように）
  await nextTick();
  (getCardButtons()[0] ?? layoutRef.value?.backButton)?.focus();
});

/* はじめて押した・キーを押したときに、タイトルBGMを鳴らす（1回だけ。もう鳴っていれば、そのまま） */
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
    <!-- 外枠（背景 ＋ 上部ツールバー）は、それぞれのミニゲームと同じ部品
         ※ このコメントを <MinigameLayout> の外に書かないこと
           開発中はコメントも残って、いちばん外の要素が2つになり、ページを移るときのフェードがこわれて画面がまっ暗になる -->
    <section class="mg-stage">
      <header class="mg-heading">
        <h1 class="mg-heading__title">🎮 ミニゲーム</h1>
        <p v-if="isLoaded" class="mg-heading__lead">
          {{ hasAnyUnlocked ? 'あそびたいミニゲームをえらんでね！' : 'ゲーム本編で見つけたものが、ここで遊べるようになるよ。' }}
        </p>
      </header>

      <ul v-if="isLoaded" ref="listRef" v-reveal-with-images class="mg-list">
        <li v-for="card in cards" :key="card.id">
          <!-- 解放したミニゲーム（押すと、そのページへ） -->
          <button v-if="card.isUnlocked" type="button" class="mg-card" @click="goTo(`/minigame/${card.id}`)">
            <!-- 本編で新しく解放したばかりのとき（左上の角。見た目はタイトルの「🎮 ミニゲーム」の NEW と同じ） -->
            <span v-if="card.isNew" class="mg-card__new">NEW</span>
            <!-- アイコン：絵（iconImage）があれば絵、無ければ絵文字（icon） -->
            <span class="mg-card__icon" aria-hidden="true">
              <img v-if="card.iconImage" class="mg-card__iconImage" :src="card.iconImage" alt="" decoding="async" />
              <template v-else>{{ card.icon }}</template>
            </span>
            <span class="mg-card__body">
              <span class="mg-card__title">
                <span v-for="part in card.titleParts" :key="part" class="mg-card__titlePart">{{ part }}</span>
              </span>
              <span class="mg-card__text">{{ card.description }}</span>
              <!-- 自己ベスト（「自己ベスト　🏁 97m　［こもれびの絵］ 8」） -->
              <span v-if="card.bestParts" class="mg-card__best">
                自己ベスト
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
   このページの中身の見た目（背景・色の名前・上部ツールバーは MinigameLayout.vue）
   ============================================================ */

/* まんなかの列（はじめの画面のカードの中身と同じ幅）
   上の padding … ツールバーのすぐ下に詰まって見えないよう、画面の高さに合わせて少しあける（20〜36px） */
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
   こもれびの広場と同じ紫のカード。左の padding は、選ばれているときに出す ▶ のぶん広め */
.mg-card {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  /* アイコンの絵は 1.12倍に広げてはみ出すので、文とのすき間を広めにとる */
  gap: 20px;
  box-sizing: border-box;
  width: 100%;
  /* 高さは、いちばん中身が多いとき（解放して自己ベストもある、絵のアイコン）に合わせて先にとっておく
     （本編で見つけて解放したり、記録が付いたりしても、カードが上下に広がらないように。中身は上下のまんなか） */
  min-height: 124px;
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

/* 選択カーソル「▶」（選ばれているカードだけ。押せないカードには出さない） */
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

/* NEW の印（本編で新しく解放して、はじめてこの一覧を開いたときだけ）
   見た目は、本編のタイトルの「🎮 ミニゲーム」・地図の秘密の小道の NEW とそろえる
   カードの左上の角にかぶせるだけなので、中の並びは変わらない */
.mg-card__new {
  position: absolute;
  z-index: 1;
  top: -9px;
  left: -10px;
  padding: 2px 7px;
  border-radius: 999px;
  background: #ffcf4d;
  box-shadow: 0 1px 3px rgb(35 57 94 / 35%);
  color: #5a3b00;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  line-height: 1.2;
  pointer-events: none;
}

/* キーボードで選んでいるときは、本編のコマンドの「選んでいる」ときと同じ水色の輪 */
.mg-card:focus-visible {
  outline: 3px solid #67e8f9;
  outline-offset: 2px;
}

/* アイコンの置き場（絵・絵文字・🔒 のどれでも同じ幅。解放しても、右の文の書きだしが左右にずれないように）
   幅は絵の大きさ（.mg-card__iconImage）と同じ */
.mg-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  font-size: 34px;
  line-height: 1;
}

/* アイコンの絵（PC 88px・スマホ 60px）
   絵の中に こうちゃん・枝・こもれびが描きこんであり、小さいと何の絵か分からないので大きくしている
   まわりの透明な余白は、1.12倍に広げて切り落とす（わくは変わらないので、となりの文字はずれない） */
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

/* 名前の区切りひとつぶん（入りきるなら1行のまま。入りきらないときは、区切りのところで折り返す） */
.mg-card__titlePart {
  display: inline-block;
}

.mg-card__text {
  font-size: 14.5px;
  line-height: 1.6;
}

/* 自己ベストの札（遊んだことがあるときだけ）
   入りきらないときは項目のあいだで折り返す（細いスマホで、カードの右からはみ出していたため） */
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
  /* 上は画面の高さに合わせて少しあける（14〜24px）。左右は、はじめの画面のスマホ幅のカードと同じ */
  .mg-stage {
    gap: 12px;
    padding: clamp(14px, 2.5vh, 24px) 16px 16px;
  }

  .mg-heading__title {
    font-size: 22px;
  }

  .mg-card {
    /* スマホは文が折り返すので、そのぶん高くとる（幅 375px で、解放しただけのカードが入りきる高さ）
       自己ベストが付くと、そのぶんだけ広がる（記録が付いたときまで とっておくと、「？？？」のカードの余白が多すぎるため） */
    min-height: 150px;
    gap: 16px;
    padding: 14px 14px 14px 28px;
  }

  .mg-card__icon {
    width: 60px;
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

/* ===== 細いスマホ（幅 400px 以下） =====
   アイコンの右の文の列がせまく、自己ベストの札が入りきらずに、カードの右からはみ出していたので、
   札だけをカードの下に、カードの幅いっぱいで置く
   ・.mg-card__body を display: contents にして、名前・説明・札を、カードの格子に じかに並べる
     （アイコンは名前と説明の2行ぶん。札は3行目で、アイコンの下から右はしまで）
   ・札が2行以上になるときは、丸すぎる形にならないよう、角の丸みを小さくする */
@media (max-width: 400px) {
  .mg-card {
    row-gap: 2px;
  }

  .mg-card__body {
    display: contents;
  }

  .mg-card__icon {
    grid-row: 1 / span 2;
  }

  .mg-card__title,
  .mg-card__text {
    grid-column: 2;
  }

  .mg-card__best {
    grid-column: 1 / -1;
    margin-top: 8px;
    border-radius: 12px;
    white-space: normal;
  }

  .mg-card__bestPart {
    white-space: nowrap;
  }
}

/* 動きを減らす設定のときは、カードの動きも止める */
@media (prefers-reduced-motion: reduce) {
  .mg-card {
    transition-duration: 0.01ms;
  }
}
</style>
