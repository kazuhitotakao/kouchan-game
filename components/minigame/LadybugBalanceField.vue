<script setup lang="ts">
/* ============================================================
   ミニゲーム「てんとう虫バランス」のフィールド（見た目だけ）

   ・切り株の上に、横向きの枝がのっている（まん中を支点に、左右へ傾く）
   ・てんとう虫は枝の上にいるので、枝といっしょに傾く（枝の箱の中に置いている）
   ・上の HUD … ステージ番号と残り時間
   ・まん中の大きな文字 … カウントダウン・クリア・おしまい

   動き・判定は composables/useLadybugBalanceGame.ts。ここは受けとった値を絵にするだけ
   ============================================================ */

import { computed } from 'vue';

import { ladybugBalanceMotion } from '~/data/ladybugBalance';
import type { LadybugBalanceBug, LadybugBalancePhase } from '~/composables/useLadybugBalanceGame';

const props = defineProps<{
  phase: LadybugBalancePhase;
  stageNumber: number;
  tilt: number;
  branchLength: number;
  ladybugs: LadybugBalanceBug[];
  remainingMs: number;
  totalMs: number;
  countdownNumber: number | null;
  isStartCueVisible: boolean;
  windDir: 0 | -1 | 1;
  windWarningDir: 0 | -1 | 1;
}>();

/* 残り時間（「5.2」。0.1秒きざみで切り上げる。0 になるまで「0.0」を出さない） */
const remainingText = computed(() => (Math.ceil(props.remainingMs / 100) / 10).toFixed(1));

/* 残り時間のバー（1 → 0） */
const remainingRatio = computed(() => (props.totalMs > 0 ? props.remainingMs / props.totalMs : 0));

/* 枝の長さ（フィールドの幅に対する割合。いちばん長い枝で 86%） */
const branchWidth = computed(() => `${86 * props.branchLength}%`);

/* てんとう虫1匹ぶんの見た目の値
   left    … 枝の左はし 0% 〜 右はし 100%
   nervous … はしに近いほど 0 → 1（羽を少し開く・あわてる） */
const bugViews = computed(() =>
  props.ladybugs.map((bug) => {
    const ratio = Math.abs(bug.x) / props.branchLength;
    const { nervousFrom, flyAt } = ladybugBalanceMotion;
    const nervous = Math.min(1, Math.max(0, (ratio - nervousFrom) / (flyAt - nervousFrom)));

    return {
      id: bug.id,
      left: `${50 + (bug.x / props.branchLength) * 50}%`,
      facing: bug.walkDir,
      nervous,
      isNervous: nervous > 0,
      isFlying: bug.isFlying,
      // 気まぐれな動き（遊んでいる最中だけ見せる）
      isWindingUp: props.phase === 'playing' && bug.action === 'windup',
      isDashing: props.phase === 'playing' && bug.action === 'dash',
      isHopping: props.phase === 'playing' && bug.isHopping,
    };
  }),
);

/* 風のすじ（数と、出てくる高さ・おくれ） */
const windStreaks = [
  { top: '18%', delay: '0s', width: '28%' },
  { top: '34%', delay: '0.25s', width: '20%' },
  { top: '48%', delay: '0.1s', width: '34%' },
  { top: '64%', delay: '0.4s', width: '24%' },
];
</script>

<template>
  <div class="lb-field" :class="[`lb-field--${phase}`, { 'lb-field--windy': windDir !== 0 }]">
    <!-- HUD（ステージ番号と残り時間） -->
    <div class="lb-hud">
      <span class="lb-hud__stage">ステージ {{ stageNumber }}</span>
      <span class="lb-hud__time" :class="{ 'lb-hud__time--low': remainingMs <= 3000 && phase === 'playing' && countdownNumber === null }">
        <span class="lb-hud__timeLabel">のこり</span>
        <b class="lb-hud__timeValue">{{ remainingText }}</b>
        <span class="lb-hud__timeUnit">びょう</span>
      </span>
      <span class="lb-hud__bar" aria-hidden="true">
        <span class="lb-hud__barFill" :style="{ transform: `scaleX(${remainingRatio})` }" />
      </span>
    </div>

    <!-- 風（もうすぐ吹く知らせ ／ 吹いているあいだの、すじ） -->
    <p v-if="windWarningDir !== 0" class="lb-wind-label lb-wind-label--warning" aria-live="polite">
      💨 かぜがくる！ {{ windWarningDir === 1 ? '→' : '←' }}
    </p>
    <p v-else-if="windDir !== 0" class="lb-wind-label">💨 びゅーっ {{ windDir === 1 ? '→' : '←' }}</p>
    <div v-if="windDir !== 0" class="lb-wind" :class="{ 'lb-wind--left': windDir === -1 }" aria-hidden="true">
      <span v-for="(streak, index) in windStreaks" :key="index" class="lb-wind__streak" :style="{ top: streak.top, width: streak.width, animationDelay: streak.delay }" />
    </div>

    <!-- 地面と切り株（枝の支点） -->
    <div class="lb-ground" aria-hidden="true" />
    <div class="lb-stump" aria-hidden="true" />

    <!-- 枝（まん中を中心に回す）。てんとう虫は枝の上にのせる -->
    <div class="lb-branch" :style="{ width: branchWidth, transform: `translate(-50%, -50%) rotate(${tilt}deg)` }" aria-hidden="true">
      <span class="lb-branch__leaf lb-branch__leaf--left" />
      <span class="lb-branch__leaf lb-branch__leaf--right" />
      <span class="lb-branch__twig" />

      <div
        v-for="bug in bugViews"
        :key="bug.id"
        class="lb-bug"
        :class="{
          'lb-bug--nervous': bug.isNervous,
          'lb-bug--flying': bug.isFlying,
          'lb-bug--still': phase !== 'playing' && !bug.isFlying,
          'lb-bug--windup': bug.isWindingUp,
          'lb-bug--dash': bug.isDashing,
          'lb-bug--hop': bug.isHopping,
        }"
        :style="{ left: bug.left, '--wing-open': bug.isFlying ? 1 : bug.nervous * 0.6, '--fly-dir': bug.facing }">
        <!-- 小走りの前の「！」（金色）／ あわてているときの「！」（赤） -->
        <span v-if="bug.isWindingUp" class="lb-bug__alert lb-bug__alert--dash">！</span>
        <span v-else-if="bug.nervous > 0.45 && !bug.isFlying" class="lb-bug__alert">！</span>

        <div class="lb-bug__fly">
          <!-- 顔の向き（絵は右向き。左へ歩いているときは左右を入れかえる） -->
          <div class="lb-bug__face" :style="{ transform: `scaleX(${bug.facing})` }">
            <!-- 小走りの勢いの線（からだのうしろ。顔の向きといっしょに入れかわる） -->
            <span v-if="bug.isDashing" class="lb-bug__dash" aria-hidden="true">
              <span class="lb-bug__dashLine" />
              <span class="lb-bug__dashLine" />
              <span class="lb-bug__dashLine" />
            </span>
            <svg class="lb-bug__svg" viewBox="0 0 64 46" xmlns="http://www.w3.org/2000/svg">
              <!-- あし -->
              <g class="lb-bug__legs" stroke="#2b2b2b" stroke-width="2.4" stroke-linecap="round">
                <line class="lb-bug__leg lb-bug__leg--a" x1="20" y1="36" x2="16" y2="44" />
                <line class="lb-bug__leg lb-bug__leg--b" x1="30" y1="37" x2="30" y2="45" />
                <line class="lb-bug__leg lb-bug__leg--a" x1="40" y1="36" x2="44" y2="44" />
              </g>

              <!-- おなか（からの下の黒いところ） -->
              <ellipse cx="31" cy="33" rx="20" ry="6" fill="#2b2b2b" />

              <!-- うすい羽（からを開くと見える） -->
              <g class="lb-bug__wing">
                <ellipse cx="22" cy="16" rx="18" ry="7" fill="rgb(205 228 250 / 92%)" stroke="#7f9fbf" stroke-width="1" />
              </g>

              <!-- から（赤くて黒い点。前のほうを支点に、うしろが持ち上がって開く） -->
              <g class="lb-bug__shell">
                <path d="M9 34 A22 21 0 0 1 53 34 Z" fill="#e2393a" stroke="#a51f22" stroke-width="1.5" />
                <circle cx="22" cy="22" r="3.6" fill="#2b2b2b" />
                <circle cx="35" cy="18" r="3.2" fill="#2b2b2b" />
                <circle cx="44" cy="28" r="3" fill="#2b2b2b" />
                <circle cx="17" cy="30" r="2.6" fill="#2b2b2b" />
                <circle cx="30" cy="29" r="2.8" fill="#2b2b2b" />
                <path d="M18 17 Q26 11 34 12" fill="none" stroke="rgb(255 255 255 / 55%)" stroke-width="2.4" stroke-linecap="round" />
              </g>

              <!-- 頭・目・しょっかく -->
              <path d="M55 22 Q59 14 62 12" fill="none" stroke="#2b2b2b" stroke-width="1.6" stroke-linecap="round" />
              <circle cx="55" cy="30" r="7.5" fill="#2b2b2b" />
              <circle cx="57.5" cy="28" r="2.2" fill="#fff" />
              <circle cx="58.2" cy="28.2" r="1" fill="#2b2b2b" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- まん中の大きな文字（カウントダウン → スタート！／クリア／おしまい） -->
    <p v-if="countdownNumber !== null" :key="`count-${countdownNumber}`" class="lb-cue lb-cue--count" aria-live="assertive">{{ countdownNumber }}</p>
    <p v-else-if="isStartCueVisible" class="lb-cue lb-cue--start">スタート！</p>
    <p v-else-if="phase === 'cleared'" class="lb-cue lb-cue--cleared">クリア！</p>
    <p v-else-if="phase === 'failed'" class="lb-cue lb-cue--failed">とんでいっちゃった…</p>
  </div>
</template>

<style scoped>
/* ============================================================
   フィールド（空 ＋ 地面 ＋ 切り株 ＋ 枝）
   高さはページ側で決める（ここでは いちばん低い高さだけ）
   ============================================================ */
.lb-field {
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  min-height: 220px;
  border: 2px solid #e6dbfa;
  border-radius: 14px;
  background: linear-gradient(180deg, #cdeefc 0%, #e9f8ff 60%, #f4fbf2 100%);
  user-select: none;
  -webkit-user-select: none;
}

/* ===== HUD（上の帯） ===== */
.lb-hud {
  position: absolute;
  top: 10px;
  right: 12px;
  left: 12px;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
}

.lb-hud__stage {
  padding: 2px 12px;
  border-radius: 999px;
  background: #8f6ad4;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.lb-hud__time {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgb(255 255 255 / 85%);
  color: #57389e;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.lb-hud__timeLabel,
.lb-hud__timeUnit {
  font-size: 12.5px;
}

.lb-hud__timeValue {
  font-size: 22px;
  line-height: 1.3;
}

/* のこり3秒からは、赤っぽくして「もうすこし！」を伝える */
.lb-hud__time--low {
  color: #d1495b;
}

/* 残り時間のバー（右から減る） */
.lb-hud__bar {
  flex-basis: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 70%);
}

.lb-hud__barFill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #8f6ad4, #bd9bef);
  transform-origin: left center;
}

/* ===== 地面と切り株 ===== */
.lb-ground {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 20%;
  background: linear-gradient(180deg, #a8dc8c 0%, #8ccb72 100%);
  border-top: 3px solid #7cbc62;
}

/* 切り株（枝の支点。上のはしが、枝のまん中に重なる） */
.lb-stump {
  position: absolute;
  top: 58%;
  bottom: 14%;
  left: 50%;
  width: 46px;
  border-radius: 10px 10px 4px 4px;
  background: linear-gradient(90deg, #8a5a33 0%, #a9734a 50%, #8a5a33 100%);
  transform: translateX(-50%);
}

/* 切り株の上の年輪（切り口） */
.lb-stump::before {
  position: absolute;
  top: -6px;
  left: 0;
  width: 100%;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, #e5c08f 0 30%, #c9965f 31% 55%, #e5c08f 56% 100%);
  content: '';
}

/* ===== 枝（まん中を中心に回す。transform は script で毎コマ書きかえる） ===== */
.lb-branch {
  position: absolute;
  top: 58%;
  left: 50%;
  z-index: 1;
  height: 16px;
  border-radius: 999px 999px 999px 999px / 60% 60% 999px 999px;
  background: linear-gradient(180deg, #a26b3e 0%, #8a5630 60%, #6e4224 100%);
  box-shadow: 0 3px 0 rgb(80 48 22 / 25%);
  transform-origin: 50% 50%;
}

/* 結果が出たら、枝をゆっくり水平へもどす（遊んでいる最中は毎コマ書きかえるので、transition は付けない） */
.lb-field--cleared .lb-branch,
.lb-field--failed .lb-branch {
  transition: transform 0.6s ease-out;
}

/* 枝の先の葉っぱ */
.lb-branch__leaf {
  position: absolute;
  top: -10px;
  width: 22px;
  height: 14px;
  border-radius: 0 100% 0 100%;
  background: linear-gradient(135deg, #7ccf6a, #4fa64a);
}

.lb-branch__leaf--left {
  left: 6px;
  transform: rotate(-30deg);
}

.lb-branch__leaf--right {
  right: 6px;
  transform: scaleX(-1) rotate(-30deg);
}

/* 枝の下に出た、小さな枝分かれ */
.lb-branch__twig {
  position: absolute;
  top: 10px;
  left: 28%;
  width: 26px;
  height: 6px;
  border-radius: 999px;
  background: #8a5630;
  transform: rotate(28deg);
  transform-origin: left center;
}

/* ===== てんとう虫 =====
   .lb-bug       … 枝の上の位置（left）。下のはしが枝の上に乗る
   .lb-bug__fly  … 飛んでいくときに動かす箱
   .lb-bug__face … 顔の向き（scaleX） */
.lb-bug {
  --bug-size: 58px;

  position: absolute;
  bottom: calc(100% - 3px);
  width: var(--bug-size);
  transform: translateX(-50%);
}

.lb-bug__fly {
  animation: lb-bug-bob 0.5s ease-in-out infinite;
}

.lb-bug__face {
  position: relative; /* 小走りの勢いの線（.lb-bug__dash）の基準 */
  transition: transform 0.18s ease;
}

.lb-bug__svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

/* から（前のほうを支点に、うしろを持ち上げる）と、うすい羽 */
.lb-bug__shell,
.lb-bug__wing {
  transform-box: view-box;
  transform-origin: 50px 30px;
  transition: transform 0.15s ease-out;
}

.lb-bug__shell {
  transform: rotate(calc(var(--wing-open, 0) * 38deg));
}

.lb-bug__wing {
  opacity: min(1, calc(var(--wing-open, 0) * 2.5));
  transform: rotate(calc(var(--wing-open, 0) * 18deg)) scaleY(var(--wing-open, 0));
}

/* 歩いているあいだ、あしを動かす */
.lb-bug__leg {
  transform-box: fill-box;
  transform-origin: top center;
  animation: lb-bug-leg 0.32s ease-in-out infinite alternate;
}

.lb-bug__leg--b {
  animation-direction: alternate-reverse;
}

/* はしに近いとき：小きざみにふるえて、あしも速く動く */
.lb-bug--nervous .lb-bug__fly {
  animation: lb-bug-shiver 0.12s linear infinite;
}

.lb-bug--nervous .lb-bug__leg {
  animation-duration: 0.12s;
}

/* 「！」 */
.lb-bug__alert {
  position: absolute;
  top: -22px;
  left: 50%;
  color: #d1495b;
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
  transform: translateX(-50%);
  animation: lb-bug-alert 0.4s ease-in-out infinite alternate;
}

/* 小走りの前（うずうず）：小きざみにふるえる。「！」は金色 */
.lb-bug--windup .lb-bug__fly {
  animation: lb-bug-shiver 0.08s linear infinite;
}

.lb-bug__alert--dash {
  color: #e0a100;
  text-shadow: 0 0 4px #fff;
}

/* 小走り：あしをとても速く動かし、からだを少し前へかたむける */
.lb-bug--dash .lb-bug__leg {
  animation-duration: 0.07s;
}

.lb-bug--dash .lb-bug__svg {
  transform: rotate(4deg);
}

/* 勢いの線（からだのうしろ ＝ 絵の左がわ） */
.lb-bug__dash {
  position: absolute;
  top: 30%;
  right: 88%;
  display: grid;
  gap: 5px;
  width: 22px;
}

.lb-bug__dashLine {
  display: block;
  height: 3px;
  border-radius: 999px;
  background: rgb(42 118 143 / 55%);
  animation: lb-bug-dash-line 0.25s linear infinite;
}

.lb-bug__dashLine:nth-child(2) {
  width: 70%;
  margin-left: 30%;
  animation-delay: 0.08s;
}

.lb-bug__dashLine:nth-child(3) {
  animation-delay: 0.16s;
}

@keyframes lb-bug-dash-line {
  from {
    opacity: 1;
    transform: translateX(0);
  }

  to {
    opacity: 0;
    transform: translateX(-10px);
  }
}

/* 急に向きを変えたとき：ぴょんと跳ねる（長さは data/ladybugBalance.ts の hop とそろえる） */
.lb-bug--hop .lb-bug__fly {
  animation: lb-bug-hop 0.3s ease-out;
}

@keyframes lb-bug-hop {
  0%,
  100% {
    transform: translateY(0);
  }

  40% {
    transform: translateY(-12px);
  }
}

/* 止まっているとき（クリア・おしまい）は、あしを止めて、ゆっくり上下だけ */
.lb-bug--still .lb-bug__leg {
  animation: none;
}

.lb-bug--still .lb-bug__fly {
  animation: lb-bug-bob 1.2s ease-in-out infinite;
}

/* 飛んでいく（羽をパタパタさせながら、はしの向きの上へ。長さは data/ladybugBalance.ts の flyAway とそろえる） */
.lb-bug--flying .lb-bug__fly {
  animation: lb-bug-fly 1.2s ease-in forwards;
}

.lb-bug--flying .lb-bug__wing {
  animation: lb-bug-flap 0.08s linear infinite alternate;
}

.lb-bug--flying .lb-bug__leg {
  animation: none;
}

@keyframes lb-bug-bob {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-2px);
  }
}

@keyframes lb-bug-leg {
  from {
    transform: rotate(-14deg);
  }

  to {
    transform: rotate(14deg);
  }
}

@keyframes lb-bug-shiver {
  0%,
  100% {
    transform: translate(0, 0);
  }

  25% {
    transform: translate(-1.5px, -1px);
  }

  75% {
    transform: translate(1.5px, -1px);
  }
}

@keyframes lb-bug-alert {
  from {
    transform: translateX(-50%) translateY(0);
  }

  to {
    transform: translateX(-50%) translateY(-3px);
  }
}

@keyframes lb-bug-flap {
  from {
    transform: rotate(10deg) scaleY(1);
  }

  to {
    transform: rotate(30deg) scaleY(0.55);
  }
}

@keyframes lb-bug-fly {
  0% {
    transform: translate(0, 0) rotate(0);
  }

  20% {
    transform: translate(calc(var(--fly-dir) * 4px), -16px) rotate(calc(var(--fly-dir) * -8deg));
  }

  100% {
    transform: translate(calc(var(--fly-dir) * 80px), -380px) rotate(calc(var(--fly-dir) * -16deg));
  }
}

/* ===== 風 ===== */
.lb-wind {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.lb-wind__streak {
  position: absolute;
  left: -40%;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(42 118 143 / 0%), rgb(42 118 143 / 45%));
  animation: lb-wind-right 0.7s linear infinite;
}

/* 空の色に白いすじだと見えにくいので、うすい紺色にしている */
.lb-wind--left .lb-wind__streak {
  background: linear-gradient(270deg, rgb(42 118 143 / 0%), rgb(42 118 143 / 45%));
  animation-name: lb-wind-left;
}

@keyframes lb-wind-right {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(400%);
  }
}

@keyframes lb-wind-left {
  from {
    transform: translateX(450%);
  }

  to {
    transform: translateX(0);
  }
}

/* 「かぜがくる！」「びゅーっ」（HUD の下） */
.lb-wind-label {
  position: absolute;
  top: 66px;
  left: 50%;
  z-index: 3;
  margin: 0;
  padding: 2px 14px;
  border-radius: 999px;
  background: rgb(255 255 255 / 88%);
  color: #2a768f;
  font-size: 15px;
  font-weight: 800;
  white-space: nowrap;
  transform: translateX(-50%);
}

.lb-wind-label--warning {
  background: #fff6e0;
  box-shadow: inset 0 0 0 2px var(--gold);
  color: #8a5a00;
  animation: lb-wind-warning 0.35s ease-in-out infinite alternate;
}

@keyframes lb-wind-warning {
  from {
    transform: translateX(-50%) scale(1);
  }

  to {
    transform: translateX(-50%) scale(1.06);
  }
}

/* ===== まん中の大きな文字 ===== */
.lb-cue {
  position: absolute;
  top: 34%;
  left: 50%;
  z-index: 4;
  margin: 0;
  color: #57389e;
  font-size: 30px;
  font-weight: 900;
  white-space: nowrap;
  text-shadow:
    0 2px 0 #fff,
    0 0 12px rgb(255 255 255 / 90%);
  transform: translate(-50%, -50%);
  animation: lb-cue-in 0.3s ease-out;
}

.lb-cue--count {
  font-size: 64px;
}

.lb-cue--cleared {
  color: #c27c00;
  font-size: 44px;
}

.lb-cue--failed {
  color: #6c7a86;
  font-size: 26px;
}

@keyframes lb-cue-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.7);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* ===== スマホ幅 ===== */
@media (max-width: 700px) {
  .lb-bug {
    --bug-size: 48px;
  }

  .lb-stump {
    width: 38px;
  }

  .lb-branch {
    height: 14px;
  }

  .lb-hud__timeValue {
    font-size: 20px;
  }

  .lb-wind-label {
    top: 60px;
    font-size: 14px;
  }

  .lb-cue--count {
    font-size: 56px;
  }

  .lb-cue--cleared {
    font-size: 38px;
  }

  .lb-cue--failed {
    font-size: 22px;
  }
}

/* 動きを減らす設定のときは、ゆれ・すじなどの くり返しの動きを止める（飛んでいくのは、結果が分かるように残す） */
@media (prefers-reduced-motion: reduce) {
  .lb-bug__fly,
  .lb-bug__leg,
  .lb-bug__alert,
  .lb-wind__streak,
  .lb-bug__dashLine,
  .lb-wind-label--warning,
  .lb-cue {
    animation: none !important;
  }

  .lb-bug--flying .lb-bug__fly {
    animation: lb-bug-fly 1.2s ease-in forwards !important;
  }
}
</style>
