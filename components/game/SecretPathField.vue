<script setup lang="ts">
/* ============================================================
   秘密の小道の「遊んでいる最中のカード」（HUD ＋ 3レーンのフィールド）

   ゲーム本編（pages/index.vue）の小道と、
   ミニゲームのページ（pages/minigame/secret-path.vue）の「どこまで行ける？」の両方で使う

   ■ このコンポーネントは「受け取った値を表示するだけ」
     流れてくるもの・当たり判定・操作の受けつけは、ぜんぶ composables/useSecretPathGame.ts
     フィールドを押した・動かした・はなしたことは、そのまま親へ知らせる（emit）ので、
     親が useSecretPathGame() の handleSecretPathPointer〜 へつなぐ

   ■ HUD の右上と真ん中は、遊びかたで出すものがちがう
     ・本編の小道         … 「［こもれびの絵］こもれび 3 / 5」と「あと 12秒」（timeLeft を渡す）
     ・どこまで行ける？   … 「［こもれびの絵］こもれび 8」「❤❤🤍」「123m」（lives・distance を渡す）
                             加速しているあいだは、距離の右上に「⏩ ×2 → ×3」の札と、次の段までのゲージ
                             （boostTotalMultiplier・nextBoostMultiplier・comboProgress を渡す）
                             自己ベスト（bestDistance）を渡すと、HUD の下の「自己ベストまでのバー」と、
                             フィールドの「自己ベストの線」も出す
                             （こえた瞬間の「🎉 じこベスト更新！」は、使う側のページがフィールドの外に出す）

   ■ 枝・こもれびの絵（前は 🌿・✨ の絵文字）は components/game/SecretPathIcon.vue
     フィールドを流れてくるものだけでなく、HUD・自己ベスト・「+1」「-1」の札の中の こもれびも、同じ絵を出す

   ■ 見た目は assets/css/game/secret-path-field.css
   ============================================================ */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import SecretPathIcon from '~/components/game/SecretPathIcon.vue';
import { getSecretPathLaneLeft } from '~/composables/useSecretPath';
import { secretPathBoostMultiplier, secretPathLanes, secretPathPlayerImages, secretPathPlayerY } from '~/data/secretPath';
import type { SecretPathPlayerVisual } from '~/data/secretPath';
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

  /* 枝に当たった直後か・そのときに「いたっ！」の下に出す、減ったもの・出しなおすための番号
     bumpPenalty … 何が1つ減ったか（減ったものが無いときは null。「いたっ！」だけを出す）
                   ・sunlight … こもれび（本編の小道）。「［こもれびの絵］-1」を出す
                   ・life     … ❤（どこまで行ける？）。「❤️ -1」を出す
                   ※ 前は「✨ -1」「❤️ -1」の文字をそのまま受け取っていたが、こもれびを絵にしたので、何が減ったかだけを受け取る */
  isBumped: boolean;
  bumpPenalty: 'sunlight' | 'life' | null;
  bumpId: number;

  /* こもれびを取った直後か・そのときに こうちゃんの上に出す文字・出しなおすための番号
     sparkleLabel … こもれびの絵の右に出す文字
                    本編の小道は「+1」（集めた数が1つ増える）、
                    「どこまで行ける？」は「+5m」（集めた数のほかに、進んだ距離にもボーナスが付く）
                    （こもれびの絵は、この部品が文字の左に出す。前は「✨ +1」のように絵文字ごと受け取っていた） */
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

  /* いまのプレイで、自己ベストをこえているか（「どこまで行ける？」だけ。こえているあいだ、HUD を金色にする） */
  isDistanceRecord?: boolean;
  isSunlightRecord?: boolean;

  /* 自己ベスト（はじめる前の記録）と、フィールドの高さ1つぶんが何メートルか（どれも「どこまで行ける？」だけ）
     bestDistance が 0 より大きいとき、HUD の下の「自己ベストまでのバー」と、フィールドの「自己ベストの線」を出す
     （まだ記録が無い、はじめてのプレイでは渡さない・0 を渡す） */
  bestDistance?: number;
  bestSunlight?: number;
  metersPerField?: number;

  /* はやく進んでいるか
     「⏩ 2x」と、こうちゃんの後ろの風の跡を出す・こうちゃんを小きざみにはずませる・
     レーンの区切りの点線を下へ流す・フィールドのふちを光らせる */
  isBoosting: boolean;

  /* 加速中に、進んだ距離が ふだんの何倍で数えられているか（「どこまで行ける？」だけ。1 ＝ 加速していない）
     加速そのもので ×2、加速コンボが付くと 合わせて ×3 → ×4 → ×6（→ composables/useSecretPathGame.ts）
     渡すと、距離の右上の札が「⏩ ×2」になり、コンボが付いているあいだは金色になる */
  boostTotalMultiplier?: number;

  /* 次の段まで届いたときの合計倍率（いちばん上の段まで届いたら null）と、次の段までの進み具合（0〜1。どちらも「どこまで行ける？」だけ）
     札に「→ ×3」と出し、その下のゲージをためて見せる
     （どこで倍率が上がるのかが見えないと、加速をどこまで続けるかを決められないため） */
  nextBoostMultiplier?: number | null;
  comboProgress?: number;

  /* いまのレベル（「どこまで行ける？」だけ。進んだ距離で上がる）
     渡すと、距離の丸の中に「Lv.3」を出し、上がった瞬間に距離の丸を金色に光らせる */
  level?: number;
}>();

/* 加速コンボの倍率が付いているか（加速だけの ×2 より多く数えられているあいだ。札と、こうちゃんの後ろの風の跡を金色にする） */
const isComboActive = computed(() => (props.boostTotalMultiplier ?? 0) > secretPathBoostMultiplier);

/* 次の段までのゲージの長さ（%）
   1コマごとに書きかわるので、整数に丸めておく（同じ値のあいだは、style を書きかえない） */
const comboGaugeWidth = computed(() => `${Math.round((props.comboProgress ?? 0) * 100)}%`);

/* こうちゃんの見た目（どの絵を出すか → data/secretPath.ts の secretPathPlayerImages）

   ・枝に当たった直後（isBumped）       … hurt（「いたっ！」を出しているあいだ）
   ・こもれびを取った直後（isSparkling） … get（「［こもれびの絵］+1」を出しているあいだ）
   ・それ以外                           … normal

   ■ 切りかえのためのタイマーは持たない
     isBumped・isSparkling は、useSecretPathGame() がゲームの時計で決めている「いたっ！」「+1」を出す長さ（どちらも 600ms）をそのまま使う
     どちらかが起きると、もう片方はその場で終わらせてある（あとから起きたほうだけを出す → useSecretPathGame.ts）ので、
     取った直後に枝に当たっても、古い表示が残ったり、途中で normal に戻ったりしない
     （念のため、両方が同時に true のときは hurt を出す） */
const playerVisual = computed<SecretPathPlayerVisual>(() => {
  if (props.isBumped) {
    return 'hurt';
  }

  return props.isSparkling ? 'get' : 'normal';
});

/* 3枚の絵の名前（template で3枚とも置いておくための ならび） */
const playerVisuals = Object.keys(secretPathPlayerImages) as SecretPathPlayerVisual[];

/* レベルが上がった直後か（距離の丸を金色に光らせているあいだ）

   上がった瞬間に知らせる「⏫ スピードアップ！」は、フィールドの上には出さない
   （枝が流れてくる所にかぶさると、よけるのに見づらいため。使う側のページの、フィールドの外に出す）
   ここでは、HUD の距離の丸を levelUpGlowDuration のあいだ光らせるだけにしている
   （はじめの Lv.1 では光らせない。上がったときだけ） */
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

/* 自己ベストをこえるまで、あと何メートルか（こえたら 0）
   距離は切り捨てた整数でくらべるので、97m の記録なら 98m で更新。97m ちょうどのときは「あと 1m」 */
const metersToBest = computed(() => Math.max(0, (props.bestDistance ?? 0) + 1 - Math.floor(props.distance ?? 0)));

/* フィールドの「自己ベストの線」の位置（フィールドの上から何%か。フィールドの外のときは null）

   こうちゃんの位置（secretPathPlayerY）から、自己ベストをこえる所までの残りの距離ぶんだけ上に置く
   フィールドの高さ1つぶんが metersPerField メートルなので、残り 5m（1つぶん）なら ちょうどフィールドの いちばん上
   枝やこもれびと同じ速さで下りてきて、こうちゃんの所を通りすぎた瞬間が、自己ベストの更新になる

   ※ 線を置くのは「自己ベスト ＋ 1m」の所
     距離は切り捨てた整数でくらべる（97m の記録なら、98m になったら更新）ので、
     97m の所に線を置くと、線を通りすぎてから「更新！」が出るまで、1m ぶん間があいてしまうため */
const bestLineTop = computed(() => {
  if (!hasBestDistance.value || !props.metersPerField) {
    return null;
  }

  const recordDistance = (props.bestDistance ?? 0) + 1;
  const top = secretPathPlayerY - ((recordDistance - (props.distance ?? 0)) / props.metersPerField) * 100;

  return top > -10 && top < 110 ? top : null;
});

/* こえた瞬間に知らせる「🎉 じこベスト更新！」は、フィールドの上には出さない
   （枝が流れてくる所にかぶさると、よけるのに見づらいため。「⏫ スピードアップ！」と同じく、使う側のページの、フィールドの外に出す）
   ここでは、HUD の距離の丸と自己ベストまでのバーを金色にするだけにしている */

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

   このカードは「小道へ進む」「はじめる」を押して、遊びはじめたときに出てくる
   スマホ幅では、本編の小道もミニゲームも、遊んでいる最中は1画面に収まる作りなので、ふつうはスクロールしない
   （→ assets/css/game/responsive.css・pages/minigame/secret-path.vue の .mg-fit）
   フィールドを縮めても収まらない、とても背の低い画面のときだけ、
   フィールドと下の案内がいっしょに見える位置へ合わせる保険として残している
   （パソコンでは中央エリアの中に収まるので、何もしない）

   ※ 前は composables/useSecretPathGame.ts の startSecretPathGame() がやっていたことを、ここへ移した
     カードが画面に出たとき（onMounted）に行うので、出るのを待つ nextTick() はいらない */
onMounted(() => {
  if (!window.matchMedia('(max-width: 700px)').matches) {
    return;
  }

  cardRef.value?.scrollIntoView({ block: 'start' });
});
</script>

<template>
  <article ref="cardRef" class="place-card place-card--secret secret-path">
    <!-- secret-path-hud--endless … 「どこまで行ける？」の HUD（❤ と距離もならぶので、スマホ幅では「こもれび」の文字を省いて1行に収める） -->
    <div class="secret-path-hud" :class="{ 'secret-path-hud--endless': distance !== undefined }">
      <span
        class="secret-path-hud__sunlight"
        :class="{
          'secret-path-hud__sunlight--sparkle': isSparkling,
          'secret-path-hud__sunlight--lost': isSunlightLost,
          'secret-path-hud__sunlight--record': isSunlightRecord,
        }"
        aria-live="polite">
        <!-- こもれびの絵は、となりに「こもれび」と書いてあるので、読み上げでは読ませない（alt を渡さない）
             絵と文字は同じ行に書く（行を分けると、Vue があいだの空白を消して、絵と文字がくっついてしまうため） -->
        <SecretPathIcon kind="sunlight" /> <span class="secret-path-hud__sunlightLabel">こもれび</span>
        <!-- key を数にしておくと、取るたびに数字がぽんっと出なおす -->
        <b :key="sunlightCount" class="secret-path-hud__count">{{ sunlightCount }}</b>
        <!-- 前のすき間（「3 / 5」の3と/のあいだ）も、この中に書いておく
             （<b> と <template> のあいだの改行は、Vue がまとめて消してしまうため） -->
        <template v-if="sunlightTotal !== undefined"> / {{ sunlightTotal }}</template>
      </span>

      <!-- のこりの ❤（「どこまで行ける？」だけ）
           なくした ❤ は 🤍 にして、はじめにいくつあったかも分かるようにする -->
      <span
        v-if="lives !== undefined && maxLives !== undefined"
        class="secret-path-hud__lives"
        :class="{ 'secret-path-hud__lives--lost': isBumped }"
        :aria-label="`のこり ${lives}`">
        <span v-for="life in maxLives" :key="life" :class="{ 'secret-path-hud__life--empty': life > lives }" aria-hidden="true">
          {{ life > lives ? '🤍' : '❤️' }}
        </span>
      </span>

      <!-- 右上：残り時間（本編の小道）か、進んだ距離（どこまで行ける？）
           はやく進んでいるあいだだけ、右上に「⏩ 2x」を重ねて出す
           （重ねて出すので、出たり消えたりしても HUD の並びは変わらない） -->
      <span v-if="timeLeft !== undefined" class="secret-path-hud__time" :class="{ 'secret-path-hud__time--soon': timeLeft <= 3 }">
        あと {{ timeLeft }}秒
        <span v-if="isBoosting" class="secret-path-hud__boost">⏩ {{ secretPathBoostMultiplier }}x</span>
      </span>

      <!-- 進んだ距離（どこまで行ける？）
           右上の札は「いま、距離が ふだんの何倍で数えられているか」を出す（boostTotalMultiplier）
           ・加速しただけ         … 「⏩ ×2」
           ・加速コンボが付いた   … 金色の「⏩ ×3」「⏩ ×4」「⏩ ×6」（上がるたびに key が変わって、ぽんっと出なおす）
           札の中には、次の段（「→ ×3」／いちばん上まで届いたら「MAX」）と、そこまでのゲージも出す -->
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

    <!-- 自己ベストまでのバー（「どこまで行ける？」で、自己ベストがあるときだけ）
         ・左 … 「🏁 じこベスト 97m ［こもれびの絵］ 8」（こえた記録は金色になる）
         ・まん中 … いまの距離が、自己ベストまでどこまで来たかのバー
         ・右 … 「あと 12m」。こえたら「🎉 更新中！」
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
         枝とこもれびの位置は、JavaScript が1コマごとに top を書きかえて動かしている
         aria-hidden … 流れてくる枝・こもれびを、ひとつずつ読み上げないようにする -->
    <!-- ポインター操作（クリック・タップ・ドラッグ・フリック・長押し）は、フィールド1か所でまとめて受け取り、
         そのまま親へ知らせる（useSecretPathGame() の handleSecretPathPointerDown() を参照）
         ※ 知らせるのは、ブラウザがイベントを届けている最中なので、
           受け取った側の event.currentTarget は、このフィールドのまま
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
      <!-- 道（レーン）の見た目
           短くクリック・タップすると、こうちゃんが押したレーンの方向へ1レーン動く
           ・--next        … 1回で動ける「となりのレーン」。こうちゃんの高さに、うすい点線の丸と矢印（行き先の目印）を出す
           ・--destination … マウスを乗せたレーンを押したときの動く先。目印がはっきりする
                             （遠いレーンに乗せたときは、まん中の目印がはっきりする）
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

      <!-- 自己ベストの線（「どこまで行ける？」だけ）
           自己ベストの距離に近づくと、上から金色の線が下りてくる。こうちゃんの所を通りすぎた瞬間が、記録の更新 -->
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
        <!-- 枝に当たったとき：「いたっ！」と、減ったものがあるときだけ「［こもれびの絵］-1」「❤️ -1」
             key を当たった回数にしておくと、続けて当たったときも出なおす -->
        <span v-if="isBumped" :key="bumpId" class="secret-path-player__bump">
          いたっ！
          <span v-if="bumpPenalty === 'sunlight'" class="secret-path-player__minus"><SecretPathIcon kind="sunlight" /> -1</span>
          <span v-else-if="bumpPenalty === 'life'" class="secret-path-player__minus">❤️ -1</span>
        </span>
        <!-- こもれびを取ったとき：「［こもれびの絵］+1」（本編）「［こもれびの絵］+5m」（どこまで行ける？） -->
        <span v-if="isSparkling" :key="sparkleId" class="secret-path-player__plus"><SecretPathIcon kind="sunlight" /> {{ sparkleLabel }}</span>
        <!-- はやく進んでいるあいだの、風の跡（こうちゃんのすぐ後ろ＝下に、短い線が流れる）
             こうちゃんより後ろは、もう通りすぎた所なので、枝をよけるのに見づらくならない
             加速コンボの倍率が付いたら（「どこまで行ける？」だけ）、HUD の札と同じ金色にする -->
        <span v-if="isBoosting" class="secret-path-player__trail" :class="{ 'secret-path-player__trail--combo': isComboActive }"></span>
        <!-- こうちゃんの絵（前は 👦 の絵文字。見た目の切りかえは playerVisual）
             ・わく（__face）の大きさは固定で、3枚とも その中いっぱいに object-fit: contain で出す（→ secret-path-field.css）
               絵を切りかえても、レーンの上の位置・足もとの高さは変わらない
             ・3枚とも はじめから置いておき、いま見せる1枚だけを出す（v-show）
               当たった・取ったときに はじめて画像を読みこむと、読みこむまでの一瞬、こうちゃんが消えてしまうため
             ・絵は見た目だけ。当たり判定には かかわらない（判定は useSecretPathGame.ts が、レーンと高さだけで見ている） -->
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

      <!-- はじまる前のカウントダウン「3」「2」「1」と、そのあとの「スタート！」
           フィールドのまん中に大きく重ねて出す（pointer-events: none なので、下の道はそのまま押せる）
           key を数字にしておくと、数字が変わるたびに、ぽんっと出なおす -->
      <span v-if="countdownNumber !== null" :key="`countdown-${countdownNumber}`" class="secret-path-countdown">
        {{ countdownNumber }}
      </span>
      <span v-else-if="isStartCueVisible" key="countdown-start" class="secret-path-countdown secret-path-countdown--start">スタート！</span>
    </div>
  </article>
</template>

<!-- 見た目は assets/css/game/secret-path-field.css（HUD・フィールド・こうちゃん・カウントダウン）
     カードそのものの形（.place-card・.place-card--secret）と伸びかた（.stage > .secret-path）は、
     使う側のページのCSSが持っている（いちばん外の article には、親の scoped CSS も届く） -->
<style scoped src="~/assets/css/game/secret-path-field.css"></style>
