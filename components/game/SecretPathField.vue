<script setup lang="ts">
/* ============================================================
   秘密の小道の「遊んでいる最中のカード」（HUD ＋ 3レーンのフィールド）

   本編の小道と、ミニゲームの「どこまで行ける？」の両方で使う

   ■ このコンポーネントは「受け取った値を表示するだけ」
     動き・当たり判定・操作は、ぜんぶ useSecretPathGame.ts
     フィールドのポインター操作は、そのまま親へ知らせる（emit）

   ■ HUD は、遊びかたで出すものがちがう
     ・本編の小道       … こもれびの数と残り時間（timeLeft を渡す）
     ・どこまで行ける？ … こもれびの数・❤・距離（lives・distance を渡す）
                           bestDistance を渡すと、自己ベストまでのバーとフィールドの線も出す

   ■ 見た目は assets/css/game/secret-path-field.css
   ============================================================ */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import SecretPathIcon from '~/components/game/SecretPathIcon.vue';
import { getSecretPathLaneLeft } from '~/composables/useSecretPath';
import { secretPathBoostMultiplier, secretPathLanes, secretPathPlayerImages, secretPathPlayerY } from '~/data/secretPath';
import type { SecretPathPlayerVisual } from '~/data/secretPath';
// 中の絵が表示できるようになってから、箱ごと出す目印（→ utils/imagePreload.ts）
import { vRevealWithImages } from '~/utils/imagePreload';
import type { SecretPathItem, SecretPathLane } from '~/types/game';

const props = defineProps<{
  /* こうちゃんのレーンと、いまフィールドに出ている枝・こもれび */
  playerLane: SecretPathLane;
  items: SecretPathItem[];

  /* 光らせるレーン（押した直後）と、マウスを乗せたレーンを押したときに動く先（どちらも無ければ null） */
  flashLane: SecretPathLane | null;
  hoverDestination: SecretPathLane | null;

  /* カウントダウンの数字（3 → 2 → 1。出さないときは null）と、「スタート！」を出しているか */
  countdownNumber: number | null;
  isStartCueVisible: boolean;

  /* 枝に当たった直後か・何が1つ減ったか（無ければ null。「いたっ！」だけ）・出しなおすための番号 */
  isBumped: boolean;
  bumpPenalty: 'sunlight' | 'life' | null;
  bumpId: number;

  /* こもれびを取った直後か・こもれびの絵の右に出す文字（本編は「+1」、どこまで行ける？は「+5m」）・出しなおすための番号 */
  isSparkling: boolean;
  sparkleLabel: string;
  sparkleId: number;

  /* 集めたこもれびの数と、全部でいくつか（「どこまで行ける？」は上限が無いので渡さない） */
  sunlightCount: number;
  sunlightTotal?: number;

  /* 枝に当たって、こもれびが減った直後か（本編の小道だけ。HUD のこもれびを さんご色に光らせる） */
  isSunlightLost?: boolean;

  /* 残り時間（秒。本編の小道だけ） */
  timeLeft?: number;

  /* のこりの ❤ と、はじめの数・進んだ距離（メートル。どちらも「どこまで行ける？」だけ） */
  lives?: number;
  maxLives?: number;
  distance?: number;

  /* 自己ベストをこえているか（「どこまで行ける？」だけ。こえているあいだ、HUD を金色にする） */
  isDistanceRecord?: boolean;
  isSunlightRecord?: boolean;

  /* 自己ベストと、フィールドの高さ1つぶんが何メートルか（「どこまで行ける？」だけ）
     bestDistance が 0 より大きいとき、自己ベストまでのバーとフィールドの線を出す */
  bestDistance?: number;
  bestSunlight?: number;
  metersPerField?: number;

  /* はやく進んでいるか */
  isBoosting: boolean;

  /* 加速中に、距離が ふだんの何倍で数えられているか（「どこまで行ける？」だけ。×2、コンボが付くと ×3 → ×4 → ×6） */
  boostTotalMultiplier?: number;

  /* 次の段の合計倍率（いちばん上まで届いたら null）と、そこまでの進み具合（0〜1）。札の「→ ×3」とゲージに出す */
  nextBoostMultiplier?: number | null;
  comboProgress?: number;

  /* いまのレベル（「どこまで行ける？」だけ。上がった瞬間に距離の丸を光らせる） */
  level?: number;
}>();

/* 加速コンボの倍率が付いているか（札と風の跡を金色にする） */
const isComboActive = computed(() => (props.boostTotalMultiplier ?? 0) > secretPathBoostMultiplier);

/* 次の段までのゲージの長さ（%）
   1コマごとに書きかわるので、整数に丸めておく（同じ値のあいだは、style を書きかえない） */
const comboGaugeWidth = computed(() => `${Math.round((props.comboProgress ?? 0) * 100)}%`);

/* こうちゃんの見た目（当たった直後は hurt、取った直後は get、それ以外は normal）
   切りかえのタイマーは持たず、「いたっ！」「+1」を出す長さをそのまま使う（両方 true なら hurt） */
const playerVisual = computed<SecretPathPlayerVisual>(() => {
  if (props.isBumped) {
    return 'hurt';
  }

  return props.isSparkling ? 'get' : 'normal';
});

/* 3枚の絵の名前（template で3枚とも置いておくための ならび） */
const playerVisuals = Object.keys(secretPathPlayerImages) as SecretPathPlayerVisual[];

/* レベルが上がった直後か（距離の丸を光らせているあいだ）
   「⏫ スピードアップ！」の文字は、よけるのに見づらいので、フィールドの外（使う側のページ）に出す */
const levelUpGlowDuration = 1600;
const isLevelUpGlowing = ref(false);
let levelUpGlowTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.level,
  (level, previousLevel) => {
    if (level === undefined || previousLevel === undefined || level <= previousLevel) {
      return;
    }

    isLevelUpGlowing.value = true;

    if (levelUpGlowTimer !== null) {
      clearTimeout(levelUpGlowTimer);
    }

    levelUpGlowTimer = setTimeout(() => {
      isLevelUpGlowing.value = false;
      levelUpGlowTimer = null;
    }, levelUpGlowDuration);
  },
);

onUnmounted(() => {
  if (levelUpGlowTimer !== null) {
    clearTimeout(levelUpGlowTimer);
  }
});

/* ============================================================
   自己ベストの見せかた（「どこまで行ける？」だけ）
   ============================================================ */

/* 自己ベストとくらべるか（記録があって、距離を渡されているとき） */
const hasBestDistance = computed(() => (props.bestDistance ?? 0) > 0 && props.distance !== undefined);

/* 自己ベストまで、どこまで来たか（0〜100%。こえたら 100%） */
const bestProgress = computed(() => (hasBestDistance.value ? Math.min(100, ((props.distance ?? 0) / (props.bestDistance ?? 1)) * 100) : 0));

/* 自己ベストをこえるまで、あと何メートルか（切り捨てた整数でくらべるので、97m の記録なら 98m で更新） */
const metersToBest = computed(() => Math.max(0, (props.bestDistance ?? 0) + 1 - Math.floor(props.distance ?? 0)));

/* フィールドの「自己ベストの線」の位置（上から何%か。フィールドの外のときは null）
   こうちゃんの位置から、残りの距離ぶんだけ上に置くので、通りすぎた瞬間が記録の更新になる
   ※ 線は「自己ベスト ＋ 1m」の所（更新は 98m からなので、97m に置くと1m ぶん間があいてしまう） */
const bestLineTop = computed(() => {
  if (!hasBestDistance.value || !props.metersPerField) {
    return null;
  }

  const recordDistance = (props.bestDistance ?? 0) + 1;
  const top = secretPathPlayerY - ((recordDistance - (props.distance ?? 0)) / props.metersPerField) * 100;

  return top > -10 && top < 110 ? top : null;
});

defineEmits<{
  fieldPointerdown: [event: PointerEvent];
  fieldPointermove: [event: PointerEvent];
  fieldPointerup: [event: PointerEvent];
  fieldPointercancel: [event: PointerEvent];
  fieldPointerleave: [event: PointerEvent];
}>();

/* このカード（スマホ幅で、画面の上へスクロールするための目印） */
const cardRef = ref<HTMLElement | null>(null);

/* スマホ幅のときだけ、遊ぶカードを画面のいちばん上へスクロールする
   ふつうは1画面に収まるのでスクロールしないが、とても背の低い画面のための保険 */
onMounted(() => {
  if (!window.matchMedia('(max-width: 700px)').matches) {
    return;
  }

  cardRef.value?.scrollIntoView({ block: 'start' });
});
</script>

<template>
  <article ref="cardRef" v-reveal-with-images class="place-card place-card--secret secret-path">
    <!-- secret-path-hud--endless … 「どこまで行ける？」の HUD -->
    <div class="secret-path-hud" :class="{ 'secret-path-hud--endless': distance !== undefined }">
      <span
        class="secret-path-hud__sunlight"
        :class="{
          'secret-path-hud__sunlight--sparkle': isSparkling,
          'secret-path-hud__sunlight--lost': isSunlightLost,
          'secret-path-hud__sunlight--record': isSunlightRecord,
        }"
        aria-live="polite">
        <!-- 絵と文字は同じ行に書く（行を分けると、Vue があいだの空白を消して、くっついてしまうため） -->
        <SecretPathIcon kind="sunlight" /> <span class="secret-path-hud__sunlightLabel">こもれび</span>
        <!-- key を数にしておくと、取るたびに数字がぽんっと出なおす -->
        <b :key="sunlightCount" class="secret-path-hud__count">{{ sunlightCount }}</b>
        <!-- 「3 / 5」のすき間も、この中に書く（あいだの改行は Vue が消してしまうため） -->
        <template v-if="sunlightTotal !== undefined"> / {{ sunlightTotal }}</template>
      </span>

      <!-- のこりの ❤（なくした ❤ は 🤍 にして、はじめの数も分かるように） -->
      <span
        v-if="lives !== undefined && maxLives !== undefined"
        class="secret-path-hud__lives"
        :class="{ 'secret-path-hud__lives--lost': isBumped }"
        :aria-label="`のこり ${lives}`">
        <span v-for="life in maxLives" :key="life" :class="{ 'secret-path-hud__life--empty': life > lives }" aria-hidden="true">
          {{ life > lives ? '🤍' : '❤️' }}
        </span>
      </span>

      <!-- 右上：残り時間（本編）か、進んだ距離（どこまで行ける？）
           はやく進んでいるあいだは「⏩ 2x」を重ねて出す（並びは変わらない） -->
      <span v-if="timeLeft !== undefined" class="secret-path-hud__time" :class="{ 'secret-path-hud__time--soon': timeLeft <= 3 }">
        あと {{ timeLeft }}秒
        <span v-if="isBoosting" class="secret-path-hud__boost">⏩ {{ secretPathBoostMultiplier }}x</span>
      </span>

      <!-- 進んだ距離（どこまで行ける？）
           右上の札は、いま距離が何倍で数えられているか（コンボが付くと金色）と、次の段・ゲージ -->
      <span
        v-else-if="distance !== undefined"
        class="secret-path-hud__distance"
        :class="{ 'secret-path-hud__distance--record': isDistanceRecord, 'secret-path-hud__distance--levelup': isLevelUpGlowing }">
        <!-- いまのレベル（上がるたびに key が変わって、ぽんっと出なおす） -->
        <small v-if="level !== undefined" :key="`level-${level}`" class="secret-path-hud__level">Lv.{{ level }}</small>
        {{ Math.floor(distance) }}m
        <span
          v-if="isBoosting"
          :key="`boost-${boostTotalMultiplier ?? 1}`"
          class="secret-path-hud__boost"
          :class="{ 'secret-path-hud__boost--combo': isComboActive }">
          ⏩ ×{{ boostTotalMultiplier ?? 1 }}
          <small class="secret-path-hud__boostNext">{{ nextBoostMultiplier ? `→ ×${nextBoostMultiplier}` : 'MAX' }}</small>
          <span class="secret-path-hud__boostGauge" :style="{ width: comboGaugeWidth }" aria-hidden="true"></span>
        </span>
      </span>
    </div>

    <!-- 自己ベストまでのバー（「じこベスト 🏁 97m」／バー／「あと 12m」→ こえたら「🎉 更新中！」）
         aria-live … 「更新中！」に変わったことを、読み上げでも伝える -->
    <div v-if="hasBestDistance" class="secret-path-best" :class="{ 'secret-path-best--record': isDistanceRecord }" aria-live="polite">
      <span class="secret-path-best__label">
        じこベスト
        <b class="secret-path-best__value" :class="{ 'secret-path-best__value--beaten': isDistanceRecord }">🏁 {{ bestDistance }}m</b>
        <b v-if="bestSunlight !== undefined" class="secret-path-best__value" :class="{ 'secret-path-best__value--beaten': isSunlightRecord }">
          <SecretPathIcon kind="sunlight" alt="こもれび" />
          {{ bestSunlight }}
        </b>
      </span>
      <span class="secret-path-best__bar" aria-hidden="true">
        <span class="secret-path-best__fill" :style="{ width: `${bestProgress}%` }"></span>
      </span>
      <span class="secret-path-best__rest">{{ isDistanceRecord ? '🎉 更新中！' : `あと ${metersToBest}m` }}</span>
    </div>

    <!-- フィールド（左・まん中・右の3レーン）
         aria-hidden … 流れてくる枝・こもれびを、ひとつずつ読み上げないように
         ポインター操作は、ここ1か所で受け取って親へ知らせる（届けている最中なので、event.currentTarget はこのフィールドのまま）
         contextmenu … スマホで長押ししたときのメニューを出さない -->
    <div
      class="secret-path-field"
      :class="{ 'secret-path-field--boosting': isBoosting }"
      aria-hidden="true"
      @pointerdown="$emit('fieldPointerdown', $event)"
      @pointermove="$emit('fieldPointermove', $event)"
      @pointerup="$emit('fieldPointerup', $event)"
      @pointercancel="$emit('fieldPointercancel', $event)"
      @pointerleave="$emit('fieldPointerleave', $event)"
      @contextmenu.prevent>
      <!-- 道（レーン）
           ・--next        … 1回で動ける「となりのレーン」（行き先の目印をうすく出す）
           ・--destination … マウスを乗せたレーンを押したときの動く先（目印がはっきりする）
           ・--flash       … 押したレーン・動いた先のレーンが一瞬光る
           ※ 枝・こもれび・こうちゃんは pointer-events: none なので、上に重なっていても押せる -->
      <div
        v-for="lane in secretPathLanes"
        :key="`lane-${lane}`"
        class="secret-path-lane"
        :class="{
          'secret-path-lane--current': lane === playerLane,
          'secret-path-lane--next': Math.abs(lane - playerLane) === 1,
          'secret-path-lane--destination': lane === hoverDestination,
          'secret-path-lane--flash': lane === flashLane,
        }"
        :style="{ left: `${(lane / 3) * 100}%` }">
        <span class="secret-path-lane__target" :style="{ top: `${secretPathPlayerY}%` }">{{ playerLane > lane ? '←' : '→' }}</span>
      </div>

      <!-- 自己ベストの線（近づくと上から下りてきて、こうちゃんの所を通りすぎた瞬間が記録の更新） -->
      <div v-if="bestLineTop !== null" class="secret-path-bestline" :class="{ 'secret-path-bestline--passed': isDistanceRecord }" :style="{ top: `${bestLineTop}%` }">
        <span class="secret-path-bestline__label">🏁 じこベスト {{ bestDistance }}m</span>
      </div>

      <span
        v-for="item in items"
        :key="item.id"
        class="secret-path-item"
        :class="[`secret-path-item--${item.kind}`, { 'secret-path-item--hit': item.hit }]"
        :style="{ left: getSecretPathLaneLeft(item.lane), top: `${item.y}%` }">
        <SecretPathIcon :kind="item.kind" />
      </span>

      <div class="secret-path-player" :style="{ left: getSecretPathLaneLeft(playerLane), top: `${secretPathPlayerY}%` }">
        <!-- 枝に当たったとき：「いたっ！」と、減ったものがあれば「-1」（key で、続けて当たっても出なおす） -->
        <span v-if="isBumped" :key="bumpId" class="secret-path-player__bump">
          いたっ！
          <span v-if="bumpPenalty === 'sunlight'" class="secret-path-player__minus"><SecretPathIcon kind="sunlight" /> -1</span>
          <span v-else-if="bumpPenalty === 'life'" class="secret-path-player__minus">❤️ -1</span>
        </span>
        <!-- こもれびを取ったとき：「+1」（本編）「+5m」（どこまで行ける？） -->
        <span v-if="isSparkling" :key="sparkleId" class="secret-path-player__plus"><SecretPathIcon kind="sunlight" /> {{ sparkleLabel }}</span>
        <!-- はやく進んでいるあいだの風の跡（後ろ＝もう通りすぎた所なので、よけるじゃまにならない） -->
        <span v-if="isBoosting" class="secret-path-player__trail" :class="{ 'secret-path-player__trail--combo': isComboActive }"></span>
        <!-- こうちゃんの絵
             3枚とも はじめから置いておき、いま見せる1枚だけを出す（v-show）
             はじめて読みこむと、読みこむまでの一瞬、こうちゃんが消えてしまうため -->
        <span
          class="secret-path-player__face"
          :class="{
            'secret-path-player__face--boosting': isBoosting,
            'secret-path-player__face--bumped': isBumped,
            'secret-path-player__face--sparkle': isSparkling,
          }">
          <img
            v-for="visual in playerVisuals"
            v-show="visual === playerVisual"
            :key="visual"
            class="secret-path-player__image"
            :src="secretPathPlayerImages[visual]"
            alt=""
            decoding="async"
            draggable="false" />
        </span>
      </div>

      <!-- カウントダウン「3」「2」「1」と「スタート！」（key で、数字が変わるたびに ぽんっと出なおす） -->
      <span v-if="countdownNumber !== null" :key="`countdown-${countdownNumber}`" class="secret-path-countdown">
        {{ countdownNumber }}
      </span>
      <span v-else-if="isStartCueVisible" key="countdown-start" class="secret-path-countdown secret-path-countdown--start">スタート！</span>
    </div>
  </article>
</template>

<!-- カードそのものの形と伸びかたは、使う側のページのCSS（いちばん外の article には、親の scoped CSS も届く） -->
<style scoped src="~/assets/css/game/secret-path-field.css"></style>
