<script setup lang="ts">
/* ============================================================
   ゲーム画面の上部ステータス（いつも出ているステータスの帯）

   時計・こうちゃんと親のゲージ・おでかけポイント・おやつ残り・
   見つけたもの・危険の警告・「そろそろお昼」のお知らせを出す

   ■ このコンポーネントは「受け取った値を表示するだけ」
     ステータスの計算・増減（statusChanges）の作成・危険かどうかの判定は、
     ぜんぶ親（pages/index.vue）のほうでやって、結果だけを props で受け取る
     ここから親の値を書きかえることはしない

   ■ サウンドのコントロール（ミュートボタン ＋ 音量スライダー）は、ここには持たない
     音を鳴らす処理は親が持っているので、ボタンとスライダーも親の中に書いて、
     タイトルの横（#sound）へ差しこんでもらう
   ============================================================ */

import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

import { itemIcons } from '~/data/places';
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

  /* 危険の警告・「そろそろお昼」のお知らせ
     リザルト画面（isResultScene）では、どちらも出さない */
  dangerWarnings: string[];
  isAlmostNoon: boolean;
  isResultScene: boolean;
}>();

/* 危険の警告・「そろそろお昼」のお知らせを、いま出すかどうか

   どちらも出ていないときは、上部ステータスに .status-area--noAlerts を付ける
   背の低いスマホでは、そのとき警告・お知らせの2行を grid から外して、
   空の行に付いてしまう すき間 をなくしている（→ assets/css/game/status.css） */
const showWarnings = computed(() => props.dangerWarnings.length > 0 && !props.isResultScene);
const showNotice = computed(() => props.isAlmostNoon && !props.isResultScene);

/* 見つけたもの：吹き出しで名前を出しているアイテム（null ＝ 出していない）

   900px以下（スマホ・タブレットくらいの幅）では絵文字だけを並べているので、
   絵文字をタップすると、そのすぐ下に名前の吹き出しを出す
   （見た目は、サウンドのコントロールの吹き出し .sound-control__tooltip とそろえてある）
   ・同じ絵文字をもう一度タップすると閉じる
   ・別の絵文字をタップすると、そちらに切りかわる（出すのはいつも1つだけ）
   ・ほかの場所をタップしたとき・スクロールしたとき・少したったとき（foundTooltipShowMs）にも閉じる
   PC（901px以上）では名前がはじめから出ているので、吹き出しは出さない（→ status.css）

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
  <header class="status-area" :class="{ 'status-area--noAlerts': !showWarnings && !showNotice }">
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

      <span class="status-clock">
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
          <li class="status-item" :class="{ 'status-item--danger': isChildEnergyDanger }">
            <span class="status-item__label">
              <span v-if="isChildEnergyDanger" class="status-item__alert">⚠</span>
              体力
            </span>
            <span class="status-item__value">{{ childEnergy }}</span>
            <span v-if="statusChanges && statusChanges.childEnergy !== 0" class="status-change" :class="changeClass('childEnergy', statusChanges.childEnergy)">
              {{ formatChange(statusChanges.childEnergy) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-energy" :style="{ width: childEnergy + '%' }"></span>

              <!-- 目もり：ここを下回ると こうちゃん がぐずりだす（体力71） -->
              <span class="gauge__mark gauge__mark--fuss" :style="{ left: fussEnergyLine + '%' }" title="ここより下がると、こうちゃんがぐずりだします（体力71）"></span>

              <!-- 目もり：あぶないライン（体力20以下で電池切れが近い） -->
              <span class="gauge__mark gauge__mark--danger" :style="{ left: dangerEnergyLine + '%' }" title="ここより下は電池切れが近いです（体力20）"></span>
            </span>
          </li>

          <li class="status-item">
            <span class="status-item__label">機嫌</span>
            <span class="status-item__value">{{ childMood }}</span>
            <span v-if="statusChanges && statusChanges.childMood !== 0" class="status-change" :class="changeClass('childMood', statusChanges.childMood)">
              {{ formatChange(statusChanges.childMood) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-mood" :style="{ width: childMood + '%' }"></span>

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

    <div class="status-pills">
      <span class="pill pill--point">
        おでかけポイント
        <b>{{ outingPoint }}</b>
        <span class="pill__change">
          <span v-if="statusChanges && statusChanges.outingPoint !== 0" class="status-change" :class="changeClass('outingPoint', statusChanges.outingPoint)">
            {{ formatChange(statusChanges.outingPoint) }}
          </span>
        </span>
      </span>

      <span class="pill pill--snack">
        おやつ残り
        <b>{{ snackLeft }}</b>

        <!-- 「個」も、上のおでかけポイントの増減表示と同じ幅の置き場所に入れる
             こうすると、2つの数字が上下でぴったり同じ位置にそろう -->
        <span class="pill__unit">個</span>
      </span>
    </div>

    <div class="status-found">
      <span class="status-found__label">見つけたもの</span>

      <span v-if="collectedItems.length === 0" class="status-found__empty">なにが見つかるかな？</span>

      <!-- 1つのアイテムの中に、絵文字（__icon）と名前（__name）の両方を入れてある
           ・PC（901px以上）                 … 名前だけを出す（今までどおり）
           ・900px以下（スマホ・タブレット） … 絵文字だけを出して、名前は読み上げ用に残す
             名前のままだと3個目あたりから1行に入りきらず、横スクロールになってしまうため
             絵文字だけだと何か分からないので、タップすると下に名前の吹き出しが出る（→ toggleFoundTooltip）
           （切りかえは assets/css/game/status.css、絵文字の一覧は data/places.ts の itemIcons） -->
      <ul v-else class="status-found__list">
        <li v-for="item in collectedItems" :key="item">
          <button
            type="button"
            class="status-found__item"
            :class="{ 'status-found__item--open': openFoundItem === item }"
            :title="item"
            @click="toggleFoundTooltip(item, $event)">
            <span class="status-found__icon" aria-hidden="true">{{ itemIcons[item] ?? '🔍' }}</span>
            <span class="status-found__name">{{ item }}</span>
          </button>
        </li>
      </ul>

      <!-- タップした絵文字の名前の吹き出し（900px以下だけ）
           名前はチップの中（__name）にも読み上げ用で入っているので、こちらは aria-hidden にして二重に読ませない -->
      <span
        v-if="openFoundItem"
        ref="foundTooltip"
        class="status-found__tooltip"
        :style="{ left: foundTooltipPos.left + 'px', top: foundTooltipPos.top + 'px' }"
        aria-hidden="true">{{ openFoundItem }}</span>
    </div>

    <!-- 危険な状態の警告（GAME OVERになる前の合図）
         リザルト画面では、もう気をつけようがないので出さない -->
    <ul v-if="showWarnings" class="status-warnings">
      <li v-for="warning in dangerWarnings" :key="warning" class="status-warnings__item">{{ warning }}</li>
    </ul>

    <!-- そろそろお昼のお知らせ（こちらもリザルト画面では出さない） -->
    <p v-if="showNotice" class="status-notice">そろそろお昼の時間です。公園の出口へ向かいましょう。</p>
  </header>
</template>

<!-- 見た目は、このコンポーネント専用の assets/css/game/status.css だけを読みこむ

     index.vue の <style scoped> は index.vue の中の要素にしか効かず、
     このコンポーネントの中の要素（ゲージ・警告など）には届かない
     そこで、必要なCSSをこちらでも scoped で読みこんで、今までと同じ見た目にしている

     ■ game.css まるごとではなく status.css だけにした理由
       game.css を読むと、結果カードやコマンド欄など、ここでは使わないCSSまで
       このコンポーネントぶんとして、もう一度ビルド結果に出てしまう
       ここで使うCSSは status.css にぜんぶ入っているので、それだけを読めばよい

     ※ 二重読みこみにならないよう、game.css 側の
       @import './game/status.css'; は外してある
       （status.css を読んでいるのは、この1か所だけ） -->
<style scoped src="~/assets/css/game/status.css"></style>
