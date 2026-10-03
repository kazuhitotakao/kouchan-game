<script setup lang="ts">
/* ============================================================
   ゲーム画面の上部ステータス（いつも出ているステータスの帯）

   時計・ゲージ・おでかけポイント・おやつ残り・見つけたものを出す
   （危険な状態などは、メッセージではなく色で知らせる）

   ・受け取った値を表示するだけ（計算や判定は、ぜんぶ親の pages/index.vue）
   ・サウンドのコントロールは、音を鳴らす親が持っているので、#sound へ差しこんでもらう
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

  /* ぐずりだすラインを下回っているか（オレンジにするかどうか。あぶないライン以下では false にしてある） */
  isChildEnergyFuss: boolean;
  isChildMoodFuss: boolean;

  /* そろそろお昼（11:30以降。12:00を過ぎたあとも）か（時計をオレンジにする。リザルト画面では付けない） */
  isAlmostNoon: boolean;
  isResultScene: boolean;
}>();

/* 注意は、メッセージを出さずに色だけで知らせる（文を出すと、スマホで終盤に画面がせまくなるため）
   ・あぶないライン以下   … 赤＋⚠
   ・ぐずりだすラインの下 … オレンジ＋⚠
   ・そろそろお昼         … 時計をオレンジに（「オレンジ ＝ そろそろ気をつけて」でそろえる） */
const isClockAlmostNoon = computed(() => props.isAlmostNoon && !props.isResultScene);

/* ゲージの上に重ねる「今回変わったぶん」の帯の位置と向き（無いときは null）
   スマホ幅では、増減の数字だけだと小さくて見落としやすいので、どこからどこまで変わったかを帯で見せる
   （行動前の値 ＝ いまの値 − 増減） */
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

   1024px以下では絵だけを並べているので、タップすると名前の吹き出しを出す
   同じ絵でもう一度・ほかの場所をタップ・スクロール・少したったときに閉じる

   ■ position: fixed にしている理由
     「見つけたもの」の箱には overflow が付いていて、中に置くと吹き出しが切れてしまうため
     （タップしたチップの画面上の位置から置く） */
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

  /* 幅は名前が入ってからでないと分からないので、nextTick のあとにはかって置きなおす（画面のはしでは内がわへ寄せる） */
  await nextTick();

  /* 待っているあいだに閉じられた・切りかわったときは、何もしない */
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

/* チップ以外の場所をタップしたら閉じる（チップのタップは toggleFoundTooltip() のほう） */
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
      <!-- タイトルと音ボタンを同じ行に並べる（新しい行を作らないので、高さは変わらない） -->
      <div class="status-area__titleRow">
        <span class="status-area__title">{{ gameTitle }}</span>

        <!-- サウンドのコントロール（親から差しこんでもらう） -->
        <slot name="sound" />
      </div>

      <span class="status-clock" :class="{ 'status-clock--almostNoon': isClockAlmostNoon }">
        <span class="status-clock__now">{{ currentTime }}</span>
        <span class="status-clock__limit">／ 12:00</span>

        <!-- 直前の行動でかかった時間（出たり消えたりしても幅が変わらないよう、外側で場所を確保しておく） -->
        <span class="status-clock__change">
          <span v-if="statusChanges && statusChanges.minutes !== 0" class="status-change">{{ formatChange(statusChanges.minutes) }}分</span>
        </span>
      </span>
    </div>

    <!-- ゲージを「こうちゃん」と「親」の2つのまとまりに分ける（見出し＋うすい背景だけなので、高さはあまり増えない） -->
    <div class="status-groups">
      <section class="status-group status-group--child">
        <p class="status-group__name">こうちゃん</p>

        <ul class="status-list">
          <!-- あぶないライン以下は赤（--danger）、ぐずりだすラインを下回ったらオレンジ（--fuss） -->
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

    <!-- ゲージの目もりの説明（ゲージの上での位置と同じ「左 → 右」の順にして、どちらの線か見つけやすくする） -->
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
         スマホでは「⭐ 12」「［リュックの絵］ 2」と絵＋数字だけにする（文字は読み上げ用に残す。切りかえは status.css） -->
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

        <!-- 「個」も増減表示と同じ幅の置き場所に入れて、2つの数字の位置を上下でそろえる -->
        <span class="pill__unit">個</span>
      </span>
    </div>

    <div class="status-found">
      <span class="status-found__label">見つけたもの</span>

      <span v-if="collectedItems.length === 0" class="status-found__empty">なにが見つかるかな？</span>

      <!-- 1つのアイテムに、絵と名前の両方を入れてある
           1024px以下では絵だけ（名前のままだと1行に入りきらないため。タップで名前の吹き出し）
           絵が登録されていないものは 🔍 を出す -->
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

      <!-- タップした絵の名前の吹き出し（チップの中の名前と二重に読ませないよう aria-hidden） -->
      <span
        v-if="openFoundItem"
        ref="foundTooltip"
        class="status-found__tooltip"
        :style="{ left: foundTooltipPos.left + 'px', top: foundTooltipPos.top + 'px' }"
        aria-hidden="true">{{ openFoundItem }}</span>
    </div>
  </header>
</template>

<!-- 見た目は status.css だけ（game.css をまるごと読むと、使わないCSSまで二重に出力されるため。
     status.css を読むのは、ここ1か所だけ） -->
<style scoped src="~/assets/css/game/status.css"></style>
