<script setup lang="ts">
/* ============================================================
   ゲーム画面の上部ステータス（いつも出ているステータスの帯）

   時計・こうちゃんと親のゲージ・おでかけポイント・おやつ残り・
   見つけたものを出す
   （危険な状態・ぐずりだすライン・そろそろお昼は、メッセージではなく色で知らせる）

   ■ このコンポーネントは「受け取った値を表示するだけ」
     ステータスの計算・増減（statusChanges）の作成・危険かどうかの判定は、
     ぜんぶ親（pages/index.vue）のほうでやって、結果だけを props で受け取る
     ここから親の値を書きかえることはしない

   ■ サウンドのコントロール（ミュートボタン ＋ 音量スライダー）は、ここには持たない
     音を鳴らす処理は親が持っているので、ボタンとスライダーも親の中に書いて、
     タイトルの横（#sound）へ差しこんでもらう
   ============================================================ */

import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

import { itemImages } from '~/data/places';
import { snackBagImage } from '~/data/snacks';
import type { StatusChanges } from '~/types/game';
import { changeClass, formatChange } from '~/utils/statusChange';

const props = defineProps<{
  /* タイトルの行に出すゲームの名前 */
  gameTitle: string;

  /* 時計（「09:25」の形） */
  currentTime: string;

  /* ゲージに出すステータス（0〜100） */
  childEnergy: number;
  childMood: number;
  parentEnergy: number;
  parentCalm: number;

  /* おでかけポイント・おやつの残り個数・見つけたもの */
  outingPoint: number;
  snackLeft: number;
  collectedItems: string[];

  /* 直前の行動でどれだけ変わったか（null ＝ 結果を出していないので、増減は出さない） */
  statusChanges: StatusChanges | null;

  /* ゲージの目もりの位置（ぐずりだすライン・あぶないライン） */
  fussEnergyLine: number;
  fussMoodLine: number;
  dangerEnergyLine: number;
  dangerCalmLine: number;

  /* あぶないラインを下回っているか（⚠ と赤い表示を出すかどうか） */
  isChildEnergyDanger: boolean;
  isParentEnergyDanger: boolean;
  isParentCalmDanger: boolean;

  /* ぐずりだすラインを下回っているか（ラベルとゲージをオレンジにするかどうか）
     体力があぶないラインまで下がったときは、親のほうで false にしてある（赤い表示だけにする） */
  isChildEnergyFuss: boolean;
  isChildMoodFuss: boolean;

  /* そろそろお昼（11:30以降。12:00を過ぎたあとも）か（時計をオレンジにするかどうか）
     12:00を過ぎてから出口へ向かうまでのあいだに、色が元に戻らないよう、親のほうで isTimeOver もいっしょに渡している
     リザルト画面（isResultScene）では、色を付けない */
  isAlmostNoon: boolean;
  isResultScene: boolean;
}>();

/* 注意は、メッセージを出さずに色だけで知らせる
   ・あぶないライン以下       … ゲージの行を赤く（.status-item--danger）＋ラベルに ⚠
   ・ぐずりだすラインの下     … ラベルとゲージをオレンジに（.status-item--fuss）＋ラベルに ⚠
   ・そろそろお昼（11:30以降）… 時計をオレンジに（.status-clock--almostNoon）

   そろそろお昼は、前は「そろそろお昼の時間です。公園の出口へ向かいましょう。」の文を出していたが、
   スマホではその1行ぶん上部ステータスが高くなり、いちばん大事な終盤で画面がせまくなっていた
   ぐずりだすラインと同じオレンジにして「オレンジ ＝ そろそろ気をつけて」でそろえている */
const isClockAlmostNoon = computed(() => props.isAlmostNoon && !props.isResultScene);

/* ゲージの上に重ねる「今回変わったぶん」の帯（.gauge__change）の位置と向き

   スマホ幅では、増減の数字だけだと小さくて見落としやすいので、
   ゲージのどこからどこまでが変わったかを帯で見せる（見た目は assets/css/game/status.css）
     ・減ったとき（--down） … なくなったぶん（いま 〜 行動前）に、赤いしま模様の帯
     ・増えたとき（--up）   … ふえたぶん（行動前 〜 いま）に、白く光る帯

   statusChanges は「いまの値 − 行動前の値」なので、行動前の値は いまの値 − 増減 で求められる
   （念のため 0〜100 に収めてから使う）
   増減が無い・結果を出していないときは null（帯を出さない） */
function changeBand(value: number, change: number | undefined) {
  if (!change) {
    return null;
  }

  const before = Math.min(100, Math.max(0, value - change));

  if (before === value) {
    return null;
  }

  return {
    className: before > value ? 'gauge__change--down' : 'gauge__change--up',
    style: { left: Math.min(before, value) + '%', width: Math.abs(before - value) + '%' },
  };
}

const changeBands = computed(() => ({
  childEnergy: changeBand(props.childEnergy, props.statusChanges?.childEnergy),
  childMood: changeBand(props.childMood, props.statusChanges?.childMood),
  parentEnergy: changeBand(props.parentEnergy, props.statusChanges?.parentEnergy),
  parentCalm: changeBand(props.parentCalm, props.statusChanges?.parentCalm),
}));

/* 見つけたもの：吹き出しで名前を出しているアイテム（null ＝ 出していない）

   1024px以下（スマホ・タブレットくらいの幅）では絵だけを並べているので、
   絵をタップすると、そのすぐ下に名前の吹き出しを出す
   （見た目は、サウンドのコントロールの吹き出し .sound-control__tooltip とそろえてある）
   ・同じ絵をもう一度タップすると閉じる
   ・別の絵をタップすると、そちらに切りかわる（出すのはいつも1つだけ）
   ・ほかの場所をタップしたとき・スクロールしたとき・少したったとき（foundTooltipShowMs）にも閉じる
   PC（1025px以上）では名前がはじめから出ているので、吹き出しは出さない（→ status.css）

   ■ 吹き出しを position: fixed にしている理由
     「見つけたもの」の箱（.status-found）は、あふれたときに中だけスクロールするよう overflow を付けている
     箱の中に position: absolute で置くと、箱のふちで吹き出しが切れてしまう
     そこで、タップしたチップの画面上の位置（getBoundingClientRect）から、画面を基準に置いている */
const foundTooltipShowMs = 3000;
const foundTooltipGap = 7;
const foundTooltipMargin = 8;

const openFoundItem = ref<string | null>(null);
const foundTooltipPos = ref({ left: 0, top: 0 });
const foundTooltip = ref<HTMLElement | null>(null);
let foundTooltipTimer: ReturnType<typeof setTimeout> | null = null;

async function openFoundTooltip(item: string, chip: HTMLElement) {
  openFoundItem.value = item;

  const rect = chip.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  foundTooltipPos.value = { left: center, top: rect.bottom + foundTooltipGap };

  /* 吹き出しの幅は、名前が入ってからでないと分からない
     描画の前（nextTick）に幅をはかって、チップのまんなかに置きなおす
     画面の左右のはしでは、はみ出さないように内がわへ寄せる */
  await nextTick();

  /* 待っているあいだに閉じられた・別のアイテムに切りかわったときは、何もしない */
  if (openFoundItem.value !== item) {
    return;
  }

  const width = foundTooltip.value?.offsetWidth ?? 0;
  const maxLeft = window.innerWidth - foundTooltipMargin - width;
  foundTooltipPos.value = {
    left: Math.max(foundTooltipMargin, Math.min(center - width / 2, maxLeft)),
    top: rect.bottom + foundTooltipGap,
  };

  foundTooltipTimer = setTimeout(closeFoundTooltip, foundTooltipShowMs);
  document.addEventListener('pointerdown', closeFoundTooltipOutside, true);
  window.addEventListener('scroll', closeFoundTooltip, { capture: true, passive: true });
  window.addEventListener('resize', closeFoundTooltip);
}

function closeFoundTooltip() {
  openFoundItem.value = null;

  if (foundTooltipTimer !== null) {
    clearTimeout(foundTooltipTimer);
    foundTooltipTimer = null;
  }

  document.removeEventListener('pointerdown', closeFoundTooltipOutside, true);
  window.removeEventListener('scroll', closeFoundTooltip, { capture: true });
  window.removeEventListener('resize', closeFoundTooltip);
}

/* チップ以外の場所をタップしたら閉じる
   チップのタップは、開け閉め・切りかえを toggleFoundTooltip() のほうでするので、ここでは何もしない */
function closeFoundTooltipOutside(event: PointerEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('.status-found__item')) {
    closeFoundTooltip();
  }
}

function toggleFoundTooltip(item: string, event: MouseEvent) {
  const isSameItem = openFoundItem.value === item;
  closeFoundTooltip();

  if (!isSameItem) {
    openFoundTooltip(item, event.currentTarget as HTMLElement);
  }
}

onBeforeUnmount(closeFoundTooltip);
</script>

<template>
  <header class="status-area">
    <div class="status-area__head">
      <!-- タイトルと音ボタンを同じ行に並べる
           新しい行を作らないので、上部ステータスの高さは変わらない -->
      <div class="status-area__titleRow">
        <span class="status-area__title">{{ gameTitle }}</span>

        <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）
             音を鳴らす処理は親（pages/index.vue）が持っているので、
             ボタンとスライダーの中身も親から #sound で差しこんでもらう -->
        <slot name="sound" />
      </div>

      <span class="status-clock" :class="{ 'status-clock--almostNoon': isClockAlmostNoon }">
        <span class="status-clock__now">{{ currentTime }}</span>
        <span class="status-clock__limit">／ 12:00</span>

        <!-- 直前の行動でかかった時間（結果を表示している間だけ出す）
             出たり消えたりしても幅が変わらないように、
             外側の span で置き場所（幅）をいつも確保しておく -->
        <span class="status-clock__change">
          <span v-if="statusChanges && statusChanges.minutes !== 0" class="status-change">{{ formatChange(statusChanges.minutes) }}分</span>
        </span>
      </span>
    </div>

    <!-- ゲージを「こうちゃん」と「親」の2つのまとまりに分ける
         見出し＋うすい背景だけでグループに見せているので、
         増える高さは見出し1行ぶんだけ（1280×720でも一画面に収まる） -->
    <div class="status-groups">
      <section class="status-group status-group--child">
        <p class="status-group__name">こうちゃん</p>

        <ul class="status-list">
          <!-- あぶないライン以下は赤（--danger）、ぐずりだすラインを下回ったらオレンジ（--fuss）
               オレンジは、ラベル（⚠ ＋ 体力）とゲージに付ける（色は status.css の .status-item--fuss） -->
          <li class="status-item" :class="{ 'status-item--danger': isChildEnergyDanger, 'status-item--fuss': isChildEnergyFuss }">
            <span class="status-item__label">
              <span v-if="isChildEnergyDanger" class="status-item__alert">⚠</span>
              <span v-else-if="isChildEnergyFuss" class="status-item__alert">⚠</span>
              体力
            </span>
            <span class="status-item__value">{{ childEnergy }}</span>
            <span v-if="statusChanges && statusChanges.childEnergy !== 0" class="status-change" :class="changeClass('childEnergy', statusChanges.childEnergy)">
              {{ formatChange(statusChanges.childEnergy) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-energy" :style="{ width: childEnergy + '%' }"></span>

              <!-- 今回変わったぶんの帯（スマホ幅だけ。目もりより下に重ねたいので、目もりより前に置く） -->
              <span v-if="changeBands.childEnergy" class="gauge__change" :class="changeBands.childEnergy.className" :style="changeBands.childEnergy.style"></span>

              <!-- 目もり：ここを下回ると こうちゃん がぐずりだす（体力71） -->
              <span class="gauge__mark gauge__mark--fuss" :style="{ left: fussEnergyLine + '%' }" title="ここより下がると、こうちゃんがぐずりだします（体力71）"></span>

              <!-- 目もり：あぶないライン（体力20以下で電池切れが近い） -->
              <span class="gauge__mark gauge__mark--danger" :style="{ left: dangerEnergyLine + '%' }" title="ここより下は電池切れが近いです（体力20）"></span>
            </span>
          </li>

          <li class="status-item" :class="{ 'status-item--fuss': isChildMoodFuss }">
            <span class="status-item__label">
              <span v-if="isChildMoodFuss" class="status-item__alert">⚠</span>
              機嫌
            </span>
            <span class="status-item__value">{{ childMood }}</span>
            <span v-if="statusChanges && statusChanges.childMood !== 0" class="status-change" :class="changeClass('childMood', statusChanges.childMood)">
              {{ formatChange(statusChanges.childMood) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-mood" :style="{ width: childMood + '%' }"></span>
              <span v-if="changeBands.childMood" class="gauge__change" :class="changeBands.childMood.className" :style="changeBands.childMood.style"></span>

              <!-- 目もり：ここより下だと ぐずりやすくなる（機嫌50） -->
              <span class="gauge__mark gauge__mark--fuss" :style="{ left: fussMoodLine + '%' }" title="ここより下だと、いやいやが起きやすくなります（機嫌50）"></span>
            </span>
          </li>
        </ul>
      </section>

      <section class="status-group status-group--parent">
        <p class="status-group__name">親</p>

        <ul class="status-list">
          <li class="status-item" :class="{ 'status-item--danger': isParentEnergyDanger }">
            <span class="status-item__label">
              <span v-if="isParentEnergyDanger" class="status-item__alert">⚠</span>
              体力
            </span>
            <span class="status-item__value">{{ parentEnergy }}</span>
            <span v-if="statusChanges && statusChanges.parentEnergy !== 0" class="status-change" :class="changeClass('parentEnergy', statusChanges.parentEnergy)">
              {{ formatChange(statusChanges.parentEnergy) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--parent-energy" :style="{ width: parentEnergy + '%' }"></span>
              <span v-if="changeBands.parentEnergy" class="gauge__change" :class="changeBands.parentEnergy.className" :style="changeBands.parentEnergy.style"></span>

              <!-- 目もり：あぶないライン（親の体力20以下） -->
              <span class="gauge__mark gauge__mark--danger" :style="{ left: dangerEnergyLine + '%' }" title="ここより下はあと1〜2回の行動で限界です（親の体力20）"></span>
            </span>
          </li>

          <li class="status-item" :class="{ 'status-item--danger': isParentCalmDanger }">
            <span class="status-item__label">
              <span v-if="isParentCalmDanger" class="status-item__alert">⚠</span>
              余裕
            </span>
            <span class="status-item__value">{{ parentCalm }}</span>
            <span v-if="statusChanges && statusChanges.parentCalm !== 0" class="status-change" :class="changeClass('parentCalm', statusChanges.parentCalm)">
              {{ formatChange(statusChanges.parentCalm) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--parent-calm" :style="{ width: parentCalm + '%' }"></span>
              <span v-if="changeBands.parentCalm" class="gauge__change" :class="changeBands.parentCalm.className" :style="changeBands.parentCalm.style"></span>

              <!-- 目もり：あぶないライン（親の余裕20以下／0でGAME OVER） -->
              <span class="gauge__mark gauge__mark--danger" :style="{ left: dangerCalmLine + '%' }" title="ここより左はあぶないです（親の余裕20以下で危険／0でGAME OVER）"></span>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <!-- ゲージの目もりの説明

         並べる順番は、ゲージの上での位置と同じ「左 → 右」にそろえてある
         ・あぶないライン   … 20 のあたり（ゲージの左のほう）
         ・ぐずりだすライン … 71 のあたり（ゲージの右のほう）
         説明の並びとゲージの線の並びが同じなので、
         どちらの線の話をしているのか見つけやすい -->
    <p class="gauge-legend">
      <span class="gauge-legend__item">
        <span class="gauge-legend__mark gauge-legend__mark--danger"></span>
        あぶないライン
      </span>

      <span class="gauge-legend__item">
        <span class="gauge-legend__mark gauge-legend__mark--fuss"></span>
        ぐずりだすライン
      </span>
    </p>

    <!-- おでかけポイント／おやつ残り

         ・PC・タブレット … 「おでかけポイント 12」「おやつ残り 2個」と文字で出す
         ・スマホ（700px以下）… 「⭐ 12」「［リュックの絵］ 2」と絵＋数字だけにして、いちばん上の段（時計とミュートのあいだ）に入れる
           文字（__label）と「個」は、見た目からは消して読み上げ用に残す（切りかえは status.css）
           リュックの絵は、おやつを選ぶ画面の「おやつバッグ」と同じ絵（data/snacks.ts の snackBagImage。前は 🎒 の絵文字だった）
           （🍪 はおやつの1つ（クッキー）の絵文字なので使わない） -->
    <div class="status-pills">
      <span class="pill pill--point">
        <span class="pill__icon" aria-hidden="true">⭐</span>
        <span class="pill__label">おでかけポイント</span>
        <b>{{ outingPoint }}</b>
        <span class="pill__change">
          <span v-if="statusChanges && statusChanges.outingPoint !== 0" class="status-change" :class="changeClass('outingPoint', statusChanges.outingPoint)">
            {{ formatChange(statusChanges.outingPoint) }}
          </span>
        </span>
      </span>

      <span class="pill pill--snack">
        <span class="pill__icon pill__icon--image" aria-hidden="true">
          <img class="pill__image" :src="snackBagImage" alt="" decoding="async" />
        </span>
        <span class="pill__label">おやつ残り</span>
        <b>{{ snackLeft }}</b>

        <!-- 「個」も、上のおでかけポイントの増減表示と同じ幅の置き場所に入れる
             こうすると、2つの数字が上下でぴったり同じ位置にそろう -->
        <span class="pill__unit">個</span>
      </span>
    </div>

    <div class="status-found">
      <span class="status-found__label">見つけたもの</span>

      <span v-if="collectedItems.length === 0" class="status-found__empty">なにが見つかるかな？</span>

      <!-- 1つのアイテムの中に、絵（__icon）と名前（__name）の両方を入れてある
           ・PC（1025px以上）                … 名前の左に絵を出す
           ・1024px以下（スマホ・タブレット）… 絵だけを出して、名前は読み上げ用に残す
             名前のままだと3個目あたりから1行に入りきらず、横スクロールになってしまうため
             絵だけだと何か分からないので、タップすると下に名前の吹き出しが出る（→ toggleFoundTooltip）
           （切りかえは assets/css/game/status.css、絵の一覧は data/places.ts の itemImages。前は絵文字だった）
           alt="" … 名前は __name で読み上げるので、絵はかざりとして読ませない
           絵が登録されていないもの（あとから増やして、itemImages に書きわすれたとき）は 🔍 を出す -->
      <ul v-else class="status-found__list">
        <li v-for="item in collectedItems" :key="item">
          <button
            type="button"
            class="status-found__item"
            :class="{ 'status-found__item--open': openFoundItem === item }"
            :title="item"
            @click="toggleFoundTooltip(item, $event)">
            <span class="status-found__icon" aria-hidden="true">
              <img v-if="itemImages[item]" class="status-found__image" :src="itemImages[item]" alt="" decoding="async" />
              <template v-else>🔍</template>
            </span>
            <span class="status-found__name">{{ item }}</span>
          </button>
        </li>
      </ul>

      <!-- タップした絵の名前の吹き出し（1024px以下だけ）
           名前はチップの中（__name）にも読み上げ用で入っているので、こちらは aria-hidden にして二重に読ませない -->
      <span
        v-if="openFoundItem"
        ref="foundTooltip"
        class="status-found__tooltip"
        :style="{ left: foundTooltipPos.left + 'px', top: foundTooltipPos.top + 'px' }"
        aria-hidden="true">{{ openFoundItem }}</span>
    </div>
  </header>
</template>

<!-- 見た目は、このコンポーネント専用の assets/css/game/status.css だけを読みこむ

     index.vue の <style scoped> は index.vue の中の要素にしか効かず、
     このコンポーネントの中の要素（ゲージ・お知らせなど）には届かない
     そこで、必要なCSSをこちらでも scoped で読みこんで、今までと同じ見た目にしている

     ■ game.css まるごとではなく status.css だけにした理由
       game.css を読むと、結果カードやコマンド欄など、ここでは使わないCSSまで
       このコンポーネントぶんとして、もう一度ビルド結果に出てしまう
       ここで使うCSSは status.css にぜんぶ入っているので、それだけを読めばよい

     ※ 二重読みこみにならないよう、game.css 側の
       @import './game/status.css'; は外してある
       （status.css を読んでいるのは、この1か所だけ） -->
<style scoped src="~/assets/css/game/status.css"></style>
