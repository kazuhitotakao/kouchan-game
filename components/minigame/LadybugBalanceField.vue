<script setup lang="ts">
/* ============================================================
   ミニゲーム「枝の上のてんとう虫」のフィールド（見た目だけ）

   ・切り株の上に、横向きの枝がのっている（まん中を支点に、左右へ傾く）
   ・てんとう虫は枝の上にいるので、枝といっしょに傾く（枝の箱の中に置いている）
   ・上の HUD … ステージ番号と残り時間（エンドレスは、レベルと たえた時間）
   ・まん中の大きな文字 … カウントダウン・クリア・おしまい
   ・てんとう虫の絵は、種類（ナナホシ・ナミテントウ・幼虫）で かきわける

   動き・判定は composables/useLadybugBalanceGame.ts。ここは受けとった値を絵にするだけ
   ============================================================ */

import { computed, onMounted, onUnmounted, ref } from 'vue';

import { ladybugBalanceKinds, ladybugBalanceMotion, ladybugBalanceTilt } from '~/data/ladybugBalance';
import type { LadybugBalanceKind } from '~/data/ladybugBalance';
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

  /* エンドレスのときだけ（ステージのときは endlessLevel を null にする）
     elapsedMs … たえた時間、endlessProgress … 次のレベルまでの進み具合（0 → 1） */
  endlessLevel: number | null;
  endlessProgress: number;
  elapsedMs: number;

  /* はしに着いてしまった てんとう虫の種類（幼虫なら「落ちちゃった…」） */
  lostKind: LadybugBalanceKind | null;
}>();

/* エンドレスで、たえた時間（「23.4」。0.1秒きざみで切り捨て） */
const elapsedText = computed(() => (Math.floor(Math.max(0, props.elapsedMs) / 100) / 10).toFixed(1));

/* おしまいのときの、まん中の文字（幼虫は飛べないので落ちる） */
const failedCue = computed(() => (props.lostKind === 'larva' ? '落ちちゃった…' : '飛んでいっちゃった…'));

/* 残り時間（「5.2」。0.1秒きざみで切り上げる。0 になるまで「0.0」を出さない） */
const remainingText = computed(() => (Math.ceil(props.remainingMs / 100) / 10).toFixed(1));

/* 残り時間のバー（1 → 0） */
const remainingRatio = computed(() => (props.totalMs > 0 ? props.remainingMs / props.totalMs : 0));

/* 枝の長さ（フィールドの幅に対する割合。いちばん長い枝で 86%） */
const branchWidthPercent = 86;
const branchWidth = computed(() => `${branchWidthPercent * props.branchLength}%`);

/* フィールドの大きさ（枝を どこまで傾けて描けるかを決めるため） */
const fieldRef = ref<HTMLElement | null>(null);
const fieldSize = ref({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const field = fieldRef.value;

  if (!field) {
    return;
  }

  const update = () => {
    fieldSize.value = { width: field.clientWidth, height: field.clientHeight };
  };

  update();
  resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(field);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

/* いちばん傾いたときに描く角度（度）
   data/ladybugBalance.ts の drawMaxDeg まで傾けたいが、横に広くて背の低いフィールド（PC の低い窓）では、
   高いほうのてんとう虫がフィールドの上から、低いほうの枝の先が下から はみ出してしまうので、収まる角度までにする
   ・上 … 枝の支点（上から 58%）から、枝の先と てんとう虫の絵（「！」まで 約52px）が、フィールドの上に収まる
   ・下 … 枝の支点から、枝の先（太さの半分と影 約10px）が、フィールドの下に収まる
   ただし、ゲームの計算の角度（maxDeg）より小さくはしない（もとの見た目より傾きが小さくならないように） */
const drawMaxDeg = computed(() => {
  const { maxDeg, drawMaxDeg: wantedDeg } = ladybugBalanceTilt;
  const { width, height } = fieldSize.value;
  const halfLength = (width * branchWidthPercent * props.branchLength) / 200;

  if (halfLength <= 0) {
    return wantedDeg;
  }

  const room = Math.min(height * 0.58 - 52, height * 0.42 - 10);
  const fitDeg = (Math.asin(Math.min(1, Math.max(0, room / halfLength))) * 180) / Math.PI;

  return Math.min(wantedDeg, Math.max(maxDeg, fitDeg));
});

/* 画面に描く枝の角度（ゲームの計算の角度を、上の drawMaxDeg まで大きくする。絵だけなので難易度は変わらない） */
const drawTilt = computed(() => (props.tilt * drawMaxDeg.value) / ladybugBalanceTilt.maxDeg);

/* てんとう虫1匹ぶんの見た目の値
   left    … 枝の左はし 0% 〜 右はし 100%
   nervous … はしに近いほど 0 → 1（羽を少し開く・あわてる） */
/* 幼虫が「ぐんぐん登る」見た目になっているか（てんとう虫の id ごと）
   速さが きりの値のあたりを行ったり来たりしても、見た目がちらつかないよう、
   なるのは larvaClimbCueSpeed から、もどるのは その 8割を下回ってから */
const climbingIds = new Set<number>();

const bugViews = computed(() =>
  props.ladybugs.map((bug) => {
    const ratio = Math.abs(bug.x) / props.branchLength;
    const { nervousFrom, flyAt, larvaClimbCueSpeed } = ladybugBalanceMotion;
    const nervous = Math.min(1, Math.max(0, (ratio - nervousFrom) / (flyAt - nervousFrom)));

    const canFly = ladybugBalanceKinds[bug.kind].canFly;

    // 向いている方へ進んでいて（風や傾きで うしろへ流されているときは ちがう）、じゅうぶん速いとき
    const forwardSpeed = bug.velocity * bug.walkDir;
    const isClimbing =
      props.phase === 'playing' &&
      bug.kind === 'larva' &&
      !bug.isLanding &&
      forwardSpeed >= (climbingIds.has(bug.id) ? larvaClimbCueSpeed * 0.8 : larvaClimbCueSpeed);

    if (isClimbing) {
      climbingIds.add(bug.id);
    } else {
      climbingIds.delete(bug.id);
    }

    return {
      id: bug.id,
      kind: bug.kind,
      canFly,
      left: `${50 + (bug.x / props.branchLength) * 50}%`,
      facing: bug.walkDir,
      nervous,
      isNervous: nervous > 0,
      isFlying: bug.isFlying,
      // 気まぐれな動き（遊んでいる最中だけ見せる）
      isWindingUp: props.phase === 'playing' && bug.action === 'windup',
      isDashing: props.phase === 'playing' && bug.action === 'dash',
      isHopping: props.phase === 'playing' && bug.isHopping,
      // 幼虫が傾いた枝を ぐんぐん登っているとき（あしを速く動かし、勢いの線を出す）
      isClimbing,
      // エンドレスで、空から降りてきている最中
      isLanding: props.phase === 'playing' && bug.isLanding,
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
  <div ref="fieldRef" class="lb-field" :class="[`lb-field--${phase}`, { 'lb-field--windy': windDir !== 0 }]">
    <!-- HUD（ステージ番号と残り時間） -->
    <div v-if="endlessLevel === null" class="lb-hud">
      <span class="lb-hud__stage">ステージ {{ stageNumber }}</span>
      <span class="lb-hud__time" :class="{ 'lb-hud__time--low': remainingMs <= 3000 && phase === 'playing' && countdownNumber === null }">
        <span class="lb-hud__timeLabel">残り</span>
        <b class="lb-hud__timeValue">{{ remainingText }}</b>
        <span class="lb-hud__timeUnit">秒</span>
      </span>
      <span class="lb-hud__bar" aria-hidden="true">
        <span class="lb-hud__barFill" :style="{ transform: `scaleX(${remainingRatio})` }" />
      </span>
    </div>

    <!-- HUD（エンドレス：レベルと、たえた時間。バーは次のレベルまで） -->
    <div v-else class="lb-hud">
      <span class="lb-hud__stage lb-hud__stage--endless">⏱ ずっと ここにいて！ Lv.{{ endlessLevel }}</span>
      <span class="lb-hud__time">
        <b class="lb-hud__timeValue">{{ elapsedText }}</b>
        <span class="lb-hud__timeUnit">秒</span>
      </span>
      <span class="lb-hud__bar" aria-hidden="true">
        <span class="lb-hud__barFill lb-hud__barFill--endless" :style="{ transform: `scaleX(${endlessProgress})` }" />
      </span>
    </div>

    <!-- 風（もうすぐ吹く知らせ ／ 吹いているあいだの、すじ） -->
    <p v-if="windWarningDir !== 0" class="lb-wind-label lb-wind-label--warning" aria-live="polite">
      💨 風が来る！ {{ windWarningDir === 1 ? '→' : '←' }}
    </p>
    <p v-else-if="windDir !== 0" class="lb-wind-label">💨 びゅーっ {{ windDir === 1 ? '→' : '←' }}</p>
    <div v-if="windDir !== 0" class="lb-wind" :class="{ 'lb-wind--left': windDir === -1 }" aria-hidden="true">
      <span v-for="(streak, index) in windStreaks" :key="index" class="lb-wind__streak" :style="{ top: streak.top, width: streak.width, animationDelay: streak.delay }" />
    </div>

    <!-- 地面と切り株（枝の支点） -->
    <div class="lb-ground" aria-hidden="true" />
    <div class="lb-stump" aria-hidden="true" />

    <!-- 枝（まん中を中心に回す）。てんとう虫は枝の上にのせる -->
    <div class="lb-branch" :style="{ width: branchWidth, transform: `translate(-50%, -50%) rotate(${drawTilt}deg)` }" aria-hidden="true">
      <span class="lb-branch__leaf lb-branch__leaf--left" />
      <span class="lb-branch__leaf lb-branch__leaf--right" />
      <span class="lb-branch__twig" />

      <div
        v-for="bug in bugViews"
        :key="bug.id"
        class="lb-bug"
        :class="{
          'lb-bug--nervous': bug.isNervous,
          'lb-bug--flying': bug.isFlying && bug.canFly,
          'lb-bug--falling': bug.isFlying && !bug.canFly,
          'lb-bug--landing': bug.isLanding,
          'lb-bug--still': phase !== 'playing' && !bug.isFlying,
          [`lb-bug--${bug.kind}`]: true,
          'lb-bug--windup': bug.isWindingUp,
          'lb-bug--dash': bug.isDashing,
          'lb-bug--hop': bug.isHopping,
          'lb-bug--climb': bug.isClimbing,
        }"
        :style="{ left: bug.left, '--wing-open': bug.isFlying || bug.isLanding ? 1 : bug.nervous * 0.6, '--fly-dir': bug.facing }">
        <!-- 小走りの前の「！」（金色）／ あわてているときの「！」（赤） -->
        <span v-if="bug.isWindingUp" class="lb-bug__alert lb-bug__alert--dash">！</span>
        <span v-else-if="bug.nervous > 0.45 && !bug.isFlying" class="lb-bug__alert">！</span>

        <div class="lb-bug__fly">
          <!-- 顔の向き（絵は右向き。左へ歩いているときは左右を入れかえる） -->
          <div class="lb-bug__face" :style="{ transform: `scaleX(${bug.facing})` }">
            <!-- 小走り・幼虫が ぐんぐん登るときの、勢いの線（からだのうしろ。顔の向きといっしょに入れかわる） -->
            <span v-if="bug.isDashing || bug.isClimbing" class="lb-bug__dash" aria-hidden="true">
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

              <!-- ===== 幼虫（からも羽も無い。細長いからだに、オレンジの点とトゲ） ===== -->
              <g v-if="bug.kind === 'larva'">
                <path d="M6 32 Q7 22 18 21 L46 21 Q53 22 53 30 Q53 37 45 37 L14 37 Q6 37 6 32 Z" fill="#3b3850" stroke="#24222f" stroke-width="1.4" />
                <g stroke="#24222f" stroke-width="1.2">
                  <line x1="16" y1="22" x2="16" y2="36" />
                  <line x1="25" y1="21.5" x2="25" y2="36.5" />
                  <line x1="34" y1="21.5" x2="34" y2="36.5" />
                  <line x1="43" y1="22" x2="43" y2="36" />
                </g>
                <circle cx="20.5" cy="27" r="2.8" fill="#f08a24" />
                <circle cx="29.5" cy="27" r="2.8" fill="#f08a24" />
                <g fill="#24222f">
                  <circle cx="11" cy="23.5" r="1.6" />
                  <circle cx="20.5" cy="20.5" r="1.6" />
                  <circle cx="29.5" cy="20.5" r="1.6" />
                  <circle cx="38.5" cy="20.5" r="1.6" />
                  <circle cx="47" cy="22" r="1.6" />
                </g>
                <circle cx="55" cy="30" r="5.5" fill="#1f1d29" />
                <circle cx="56.8" cy="28.6" r="1.6" fill="#fff" />
              </g>

              <!-- ===== てんとう虫（ナナホシ・ナミテントウ。色だけ ちがう） ===== -->
              <template v-else>
              <!-- おなか（からの下の黒いところ） -->
              <ellipse cx="31" cy="33" rx="20" ry="6" fill="#2b2b2b" />

              <!-- うすい羽（からを開くと見える） -->
              <g class="lb-bug__wing">
                <ellipse cx="22" cy="16" rx="18" ry="7" fill="rgb(205 228 250 / 92%)" stroke="#7f9fbf" stroke-width="1" />
              </g>

              <!-- から（前のほうを支点に、うしろが持ち上がって開く）
                   ナナホシ … 赤に黒い点、ナミテントウ … 黒に赤い紋（2つ） -->
              <g class="lb-bug__shell">
                <template v-if="bug.kind === 'namitentou'">
                  <path d="M9 34 A22 21 0 0 1 53 34 Z" fill="#2b2b2b" stroke="#111" stroke-width="1.5" />
                  <circle cx="23" cy="24" r="5.4" fill="#e2393a" />
                  <circle cx="40" cy="25" r="4.6" fill="#e2393a" />
                </template>
                <template v-else>
                  <path d="M9 34 A22 21 0 0 1 53 34 Z" fill="#e2393a" stroke="#a51f22" stroke-width="1.5" />
                  <circle cx="22" cy="22" r="3.6" fill="#2b2b2b" />
                  <circle cx="35" cy="18" r="3.2" fill="#2b2b2b" />
                  <circle cx="44" cy="28" r="3" fill="#2b2b2b" />
                  <circle cx="17" cy="30" r="2.6" fill="#2b2b2b" />
                  <circle cx="30" cy="29" r="2.8" fill="#2b2b2b" />
                </template>
                <path d="M18 17 Q26 11 34 12" fill="none" stroke="rgb(255 255 255 / 55%)" stroke-width="2.4" stroke-linecap="round" />
              </g>

              <!-- 頭・目・しょっかく（ナミテントウは、頭に白い もようがある） -->
              <path d="M55 22 Q59 14 62 12" fill="none" stroke="#2b2b2b" stroke-width="1.6" stroke-linecap="round" />
              <circle cx="55" cy="30" r="7.5" fill="#2b2b2b" />
              <ellipse v-if="bug.kind === 'namitentou'" cx="52" cy="25.5" rx="3" ry="1.8" fill="#f4f1e8" />
              <circle cx="57.5" cy="28" r="2.2" fill="#fff" />
              <circle cx="58.2" cy="28.2" r="1" fill="#2b2b2b" />
              </template>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- まん中の大きな文字（カウントダウン → スタート！／クリア／おしまい） -->
    <p v-if="countdownNumber !== null" :key="`count-${countdownNumber}`" class="lb-cue lb-cue--count" aria-live="assertive">{{ countdownNumber }}</p>
    <p v-else-if="isStartCueVisible" class="lb-cue lb-cue--start">スタート！</p>
    <p v-else-if="phase === 'cleared'" class="lb-cue lb-cue--cleared">クリア！</p>
    <p v-else-if="phase === 'failed'" class="lb-cue lb-cue--failed">{{ failedCue }}</p>
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
  transition:
    opacity 0.3s ease,
    visibility 0.3s;
}

/* 結果の画面では、HUD を消す
   結果の画面ではフィールドが低くなるので、HUD が2行になる細い画面（スマホのエンドレスなど）では、
   まん中の「飛んでいっちゃった…」「クリア！」と重なってしまうため
   （ステージ・たえた時間・レベルは、下の結果のカードに出ている） */
.lb-field--cleared .lb-hud,
.lb-field--failed .lb-hud {
  opacity: 0;
  visibility: hidden;
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

/* エンドレスの札（金色。ステージの紫と見わけられるように） */
.lb-hud__stage--endless {
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
  color: #4a3208;
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

/* エンドレスの、次のレベルまでのバー（左から のびる） */
.lb-hud__barFill--endless {
  background: linear-gradient(90deg, #f5b83d, var(--gold));
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

/* 幼虫：ふだんは のそのそ（あしも、からだの上下も ゆっくり。ナナホシより遅いのが見て分かるように）
   あわてている・登っているときは、下の .lb-bug--nervous・.lb-bug--climb が上書きする */
.lb-bug--larva .lb-bug__leg {
  animation-duration: 0.6s;
}

.lb-bug--larva .lb-bug__fly {
  animation-duration: 1s;
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

/* 小走り・幼虫が ぐんぐん登るとき：あしをとても速く動かし、からだを少し前へ傾ける */
.lb-bug--dash .lb-bug__leg,
.lb-bug--climb .lb-bug__leg {
  animation-duration: 0.07s;
}

.lb-bug--dash .lb-bug__svg,
.lb-bug--climb .lb-bug__svg {
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

/* 幼虫は飛べないので、はしから ころんと落ちる（長さは flyAway とそろえる） */
.lb-bug--falling .lb-bug__fly {
  animation: lb-bug-fall 1.2s ease-in forwards;
}

.lb-bug--falling .lb-bug__leg {
  animation-duration: 0.07s;
}

@keyframes lb-bug-fall {
  0% {
    transform: translate(0, 0) rotate(0);
  }

  25% {
    transform: translate(calc(var(--fly-dir) * 12px), -8px) rotate(calc(var(--fly-dir) * 30deg));
  }

  100% {
    transform: translate(calc(var(--fly-dir) * 70px), 360px) rotate(calc(var(--fly-dir) * 240deg));
  }
}

/* エンドレスの2匹目：羽を開いて、空から降りてくる（長さは data/ladybugBalance.ts の landing とそろえる） */
.lb-bug--landing .lb-bug__fly {
  animation: lb-bug-land 0.8s ease-out;
}

.lb-bug--landing .lb-bug__wing {
  animation: lb-bug-flap 0.08s linear infinite alternate;
}

.lb-bug--landing .lb-bug__leg {
  animation: none;
}

@keyframes lb-bug-land {
  from {
    transform: translate(calc(var(--fly-dir) * -40px), -300px) rotate(calc(var(--fly-dir) * 12deg));
  }

  to {
    transform: translate(0, 0) rotate(0);
  }
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

/* 「風が来る！」「びゅーっ」（HUD の下） */
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

  .lb-bug--falling .lb-bug__fly {
    animation: lb-bug-fall 1.2s ease-in forwards !important;
  }
}
</style>
