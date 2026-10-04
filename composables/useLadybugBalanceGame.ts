/* ============================================================
   ミニゲーム「てんとう虫バランス」の「状態を持つ側」

   ■ ここがやること
     ・遊んでいる最中に変わる状態（枝の傾き・てんとう虫の位置・風・ゲームの時計）を持つ
     ・requestAnimationFrame の1コマごとの処理（傾ける・歩かせる・風を吹かせる・はしに着いたかを見る）
     ・左右の操作（画面のボタンの長押し・← → キー）

   ■ ここがやらないこと
     ・画面に出すもの（枝・てんとう虫の絵）は components/minigame/LadybugBalanceField.vue
     ・ステージの選択・開放の保存・音の中身は、ページ（pages/minigame/ladybug-balance.vue）
       音は options でもらった関数を呼ぶだけ

   ■ 数字は data/ladybugBalance.ts
   ============================================================ */

import { computed, onMounted, onUnmounted, ref } from 'vue';

import { ladybugBalanceMaxFrameMs, ladybugBalanceMotion, ladybugBalanceStages, ladybugBalanceTilt, ladybugBalanceTiming } from '~/data/ladybugBalance';
import type { LadybugBalanceStage } from '~/data/ladybugBalance';

/* いまの進み具合
   ready    … はじまる前（ステージをえらぶ）
   playing  … 遊んでいる最中（カウントダウンもふくむ。ゲームの時計がマイナスのあいだがカウントダウン）
   flyaway  … てんとう虫が はしに着いて、飛んでいく演出の最中（すぐに failed になる）
   cleared  … 時間までたえた
   failed   … 飛んでいってしまった */
export type LadybugBalancePhase = 'ready' | 'playing' | 'flyaway' | 'cleared' | 'failed';

/* 左（-1）・右（1） */
export type LadybugBalanceSide = -1 | 1;

/* てんとう虫1匹ぶん
   x        … 枝のまん中からの位置（右がプラス。単位は data/ladybugBalance.ts の説明のとおり）
   velocity … いまの速さ（右がプラス）
   walkDir  … 自分で歩いている向き（顔の向きにも使う）
   turnAt   … 次に向きを変える時刻（ゲームの時計）
   isFlying … 飛んでいく最中か
   action      … 気まぐれな動き（walk ＝ ふつうに歩いている、windup ＝ 小走りの前のうずうず、dash ＝ 小走り）
   actionUntil … windup・dash を終える時刻（ゲームの時計）
   nextQuirkAt … 次に気まぐれな動きをする時刻（ゲームの時計。しないステージは Infinity）
   hopUntil    … 急に向きを変えて跳ねているのを、いつまで見せるか（ゲームの時計）
   isHopping   … 跳ねている最中か（画面用。hopUntil から毎コマ決める） */
export type LadybugBalanceBug = {
  id: number;
  x: number;
  velocity: number;
  walkDir: LadybugBalanceSide;
  turnAt: number;
  isFlying: boolean;
  action: 'walk' | 'windup' | 'dash';
  actionUntil: number;
  nextQuirkAt: number;
  hopUntil: number;
  isHopping: boolean;
};

export type UseLadybugBalanceGameOptions = {
  /* ===== 音（useAudio.ts） ===== */
  playCountdownSound: (delay?: number) => void;
  playCountdownStartSound: () => void;

  /* ===== 終わったとき（ページが、記録の保存と音・BGM を受けもつ） ===== */
  onFlyAway: () => void;
  onCleared: (stageIndex: number) => void;
  onFailed: () => void;
};

/* [短い, 長い] のあいだの、ばらばらな数 */
function randomBetween([min, max]: readonly [number, number]) {
  return min + Math.random() * (max - min);
}

function randomSide(): LadybugBalanceSide {
  return Math.random() < 0.5 ? -1 : 1;
}

const degToRad = Math.PI / 180;

export function useLadybugBalanceGame(options: UseLadybugBalanceGameOptions) {
  const { playCountdownSound, playCountdownStartSound, onFlyAway, onCleared, onFailed } = options;

  const phase = ref<LadybugBalancePhase>('ready');

  /* 遊んでいるステージ（ladybugBalanceStages の何番目か。0 ＝ ステージ1） */
  const stageIndex = ref(0);
  const stage = computed(() => ladybugBalanceStages[stageIndex.value]!);

  /* ゲームの時計（ミリ秒）。カウントダウンのあいだはマイナス、0 でスタート
     タブを切りかえているあいだは requestAnimationFrame が止まるので、この時計も止まる */
  const elapsed = ref(0);

  /* 枝の傾き（度。右が下がるとプラス）と、傾く速さ（度/秒。画面には出さないので ref にしない） */
  const tilt = ref(0);
  let tiltVelocity = 0;

  const ladybugs = ref<LadybugBalanceBug[]>([]);

  /* 風
     windDir        … いま吹いている向き（0 ＝ 吹いていない。-1 ＝ 左が下がる向き）
     windWarningDir … もうすぐ吹く向き（「かぜがくる！」を出しているあいだだけ。0 ＝ 出していない） */
  const windDir = ref<0 | LadybugBalanceSide>(0);
  const windWarningDir = ref<0 | LadybugBalanceSide>(0);
  let nextWindAt = 0;
  let nextWindDir: LadybugBalanceSide = 1;
  let windEndAt = 0;

  /* 左右を押しているか（画面のボタンとキーは別々に覚える。片方をはなしても、もう片方で押していれば押したまま） */
  const pointerHeld = ref({ left: false, right: false });
  const keyHeld = ref({ left: false, right: false });

  const isLeftHeld = computed(() => pointerHeld.value.left || keyHeld.value.left);
  const isRightHeld = computed(() => pointerHeld.value.right || keyHeld.value.right);

  const isPlaying = computed(() => phase.value === 'playing');

  /* カウントダウンに出す数字（3 → 2 → 1。はじめの間と、始まったあとは null） */
  const countdownNumber = computed(() => getCountdownNumber(elapsed.value));

  /* 残り時間（ミリ秒。カウントダウン中はステージの時間のまま） */
  const remainingMs = computed(() => Math.max(0, stage.value.seconds * 1000 - Math.max(0, elapsed.value)));

  let frameId: number | null = null;
  let lastTimestamp: number | null = null;
  let flyAwayTimer: ReturnType<typeof setTimeout> | null = null;

  /* 結果が出た時刻（performance.now()。結果の画面のボタンを、少しのあいだ受けつけないために使う） */
  let finishedAt = 0;

  function getCountdownNumber(time: number) {
    if (time >= 0 || -time > ladybugBalanceTiming.countdownDuration) {
      return null;
    }

    return Math.min(3, Math.ceil((-time / ladybugBalanceTiming.countdownDuration) * 3));
  }

  function stopLoop() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }

    lastTimestamp = null;
  }

  function cancelFlyAway() {
    if (flyAwayTimer !== null) {
      clearTimeout(flyAwayTimer);
      flyAwayTimer = null;
    }
  }

  function releaseControls() {
    pointerHeld.value = { left: false, right: false };
    keyHeld.value = { left: false, right: false };
  }

  /* てんとう虫を置きなおす（1匹はまん中、2匹は左右に分けて） */
  function createLadybugs(): LadybugBalanceBug[] {
    const { ladybugCount, branchLength, turnInterval, quirks } = stage.value;
    const startXs = ladybugCount === 1 ? [0] : [-0.3 * branchLength, 0.3 * branchLength];

    return startXs.map((x, index) => ({
      id: index,
      x,
      velocity: 0,
      walkDir: randomSide(),
      turnAt: randomBetween(turnInterval),
      isFlying: false,
      action: 'walk' as const,
      actionUntil: 0,
      nextQuirkAt: quirks ? randomBetween(quirks.interval) : Infinity,
      hopUntil: 0,
      isHopping: false,
    }));
  }

  /* えらんだステージを、はじまる前の状態にする */
  function resetGame() {
    stopLoop();
    cancelFlyAway();
    releaseControls();

    phase.value = 'ready';
    elapsed.value = 0;
    tilt.value = 0;
    tiltVelocity = 0;
    ladybugs.value = createLadybugs();
    windDir.value = 0;
    windWarningDir.value = 0;
    nextWindAt = stage.value.wind ? randomBetween(stage.value.wind.interval) : Infinity;
    nextWindDir = randomSide();
    windEndAt = 0;
  }

  /* ステージをえらぶ（はじまる前の画面で、てんとう虫の数などを先に見せるため） */
  function selectStage(index: number) {
    if (phase.value === 'playing' || phase.value === 'flyaway' || !ladybugBalanceStages[index]) {
      return;
    }

    stageIndex.value = index;
    resetGame();
  }

  /* ステージを始める（「3」「2」「1」のあとで動きはじめる） */
  function startGame(index: number) {
    if (phase.value === 'playing' || phase.value === 'flyaway' || !ladybugBalanceStages[index]) {
      return;
    }

    stageIndex.value = index;
    resetGame();

    phase.value = 'playing';
    elapsed.value = -(ladybugBalanceTiming.countdownLeadIn + ladybugBalanceTiming.countdownDuration);

    frameId = requestAnimationFrame(runFrame);
  }

  /* 結果の画面のボタンを受けつけてよいか（終わった瞬間に左右ボタンを押していた指で、押されないように） */
  function canAcceptResultInput() {
    return performance.now() - finishedAt >= ladybugBalanceTiming.resultGuard;
  }

  function runFrame(timestamp: number) {
    frameId = null;

    if (!isPlaying.value) {
      stopLoop();
      return;
    }

    const delta = lastTimestamp === null ? 0 : Math.min(Math.max(timestamp - lastTimestamp, 0), ladybugBalanceMaxFrameMs);

    lastTimestamp = timestamp;

    advance(delta);

    if (isPlaying.value) {
      frameId = requestAnimationFrame(runFrame);
    }
  }

  /* ゲームの時計を delta ミリ秒進める */
  function advance(delta: number) {
    const previousElapsed = elapsed.value;

    elapsed.value += delta;

    // ===== カウントダウン（数字が変わったときに「ピッ」、0 をこえたときに「ピーン♪」） =====
    if (previousElapsed < 0) {
      const previousNumber = getCountdownNumber(previousElapsed);
      const number = getCountdownNumber(elapsed.value);

      if (number !== null && number !== previousNumber) {
        playCountdownSound();
      }

      if (elapsed.value < 0) {
        return;
      }

      playCountdownStartSound();

      // スタートした瞬間からの時間だけを進める（カウントダウンのぶんで、はじめに一気に動かないように）
      delta = elapsed.value;
    }

    const seconds = delta / 1000;

    advanceWind();
    advanceTilt(seconds);
    advanceLadybugs(seconds);

    if (!isPlaying.value) {
      return;
    }

    // ===== 時間までたえたらクリア =====
    if (elapsed.value >= stage.value.seconds * 1000) {
      finish('cleared');
    }
  }

  /* 風の予定（吹く少し前に「かぜがくる！」→ 吹く → やむ → 次の予定） */
  function advanceWind() {
    const { wind } = stage.value;

    if (!wind) {
      return;
    }

    if (windDir.value !== 0) {
      if (elapsed.value >= windEndAt) {
        windDir.value = 0;
        nextWindAt = elapsed.value + randomBetween(wind.interval);
        nextWindDir = randomSide();
      }

      return;
    }

    if (elapsed.value >= nextWindAt) {
      windWarningDir.value = 0;
      windDir.value = nextWindDir;
      windEndAt = elapsed.value + wind.duration;
      return;
    }

    if (elapsed.value >= nextWindAt - ladybugBalanceTiming.windWarning) {
      windWarningDir.value = nextWindDir;
    }
  }

  /* 枝の傾き
     押している … その向きへ速めていく（いきなり傾かない）
     はなした   … ばねのように水平へ戻る
     どちらも、ブレーキ（damping）で ゆれすぎないようにする。風は、その上から押す */
  function advanceTilt(seconds: number) {
    const { maxDeg, pushAccel, returnStiffness, damping } = ladybugBalanceTilt;
    const input = (isRightHeld.value ? 1 : 0) - (isLeftHeld.value ? 1 : 0);

    let accel = input !== 0 ? input * pushAccel : -returnStiffness * tilt.value;

    accel -= damping * tiltVelocity;
    accel += windDir.value * (stage.value.wind?.strength ?? 0);

    tiltVelocity += accel * seconds;

    let next = tilt.value + tiltVelocity * seconds;

    // いちばん傾いたところで止める（そこから先へ行こうとする速さも消す）
    if (Math.abs(next) >= maxDeg) {
      next = Math.sign(next) * maxDeg;

      if (Math.sign(tiltVelocity) === Math.sign(next)) {
        tiltVelocity = 0;
      }
    }

    tilt.value = next;
  }

  /* てんとう虫を歩かせる（自分で歩く速さ ＋ 高いほうへ のぼる速さ。速さは少しずつ変わる）
     本物のてんとう虫と同じく、高いほうへ のぼっていく（てっぺんから飛び立とうとする） */
  function advanceLadybugs(seconds: number) {
    const { walkSpeed, turnInterval, branchLength, quirks } = stage.value;
    const { climbSpeed, turnSlope, response, flyAt, bumpDistance } = ladybugBalanceMotion;

    // 枝の傾きを、-1（左が下がりきった）〜 1（右が下がりきった）にする
    const slope = Math.sin(tilt.value * degToRad) / Math.sin(ladybugBalanceTilt.maxDeg * degToRad);
    const blend = 1 - Math.exp(-response * seconds);

    // 高いほうの向き（右が下がっていれば左）。傾きが小さいあいだは、向きを変えない（null）
    const uphill: LadybugBalanceSide | null = Math.abs(slope) >= turnSlope ? (slope > 0 ? -1 : 1) : null;

    for (const bug of ladybugs.value) {
      if (elapsed.value >= bug.turnAt) {
        bug.walkDir = bug.walkDir === 1 ? -1 : 1;
        bug.turnAt = elapsed.value + randomBetween(turnInterval);
      }

      if (quirks) {
        advanceQuirk(bug, quirks, uphill);
      }

      // しっかり傾いているときは、高いほうへ向きを変える
      if (uphill !== null && bug.walkDir !== uphill) {
        bug.walkDir = uphill;
        bug.turnAt = elapsed.value + randomBetween(turnInterval);
      }

      // 小走りは速く、その前のうずうずは ほとんど立ち止まる（走りだしそうだと見て分かるように）
      let speed = walkSpeed;

      if (quirks && bug.action === 'dash') {
        speed = walkSpeed * quirks.dashMultiplier;
      } else if (bug.action === 'windup') {
        speed = walkSpeed * 0.3;
      }

      const target = bug.walkDir * speed - slope * climbSpeed;

      bug.velocity += (target - bug.velocity) * blend;
      bug.x += bug.velocity * seconds;
    }

    // 2匹が近づいたら、ぶつからないように おたがいに向きを変える
    const [first, second] = ladybugs.value;

    if (first && second) {
      const [left, right] = first.x <= second.x ? [first, second] : [second, first];

      if (right.x - left.x < bumpDistance) {
        if (left.walkDir === 1) {
          left.walkDir = -1;
          left.turnAt = elapsed.value + randomBetween(turnInterval);
        }

        if (right.walkDir === -1) {
          right.walkDir = 1;
          right.turnAt = elapsed.value + randomBetween(turnInterval);
        }
      }
    }

    // はしに着いたてんとう虫は、飛んでいく（いちばん先に着いた1匹だけ）
    const flyingBug = ladybugs.value.find((bug) => Math.abs(bug.x) >= branchLength * flyAt);

    if (flyingBug) {
      flyingBug.x = Math.sign(flyingBug.x) * branchLength * flyAt;
      flyingBug.walkDir = flyingBug.x > 0 ? 1 : -1;
      flyingBug.isFlying = true;
      startFlyAway();
    }
  }

  /* 気まぐれな動き（急に向きを変える ／ うずうず → 小走り → ふつうに戻る） */
  function advanceQuirk(bug: LadybugBalanceBug, quirks: NonNullable<LadybugBalanceStage['quirks']>, uphill: LadybugBalanceSide | null) {
    const now = elapsed.value;

    bug.isHopping = now < bug.hopUntil;

    if (bug.action === 'windup') {
      if (now >= bug.actionUntil) {
        bug.action = 'dash';
        bug.actionUntil = now + quirks.dashDuration;
      }

      return;
    }

    if (bug.action === 'dash') {
      if (now >= bug.actionUntil) {
        bug.action = 'walk';
        bug.nextQuirkAt = now + randomBetween(quirks.interval);
      }

      return;
    }

    if (now < bug.nextQuirkAt) {
      return;
    }

    // 急に向きを変えるのは、枝が水平に近いときだけ（傾いているときは、すぐ高いほうへ向きなおしてしまうため）
    if (uphill === null && Math.random() < 0.5) {
      bug.walkDir = bug.walkDir === 1 ? -1 : 1;
      bug.turnAt = now + randomBetween(stage.value.turnInterval);
      bug.hopUntil = now + ladybugBalanceTiming.hop;
      bug.isHopping = true;
      bug.nextQuirkAt = now + randomBetween(quirks.interval);
      return;
    }

    bug.action = 'windup';
    bug.actionUntil = now + ladybugBalanceTiming.dashWindup;
  }

  /* 飛んでいく演出を見せてから、おしまいにする */
  function startFlyAway() {
    stopLoop();
    releaseControls();

    phase.value = 'flyaway';
    windWarningDir.value = 0;

    onFlyAway();

    flyAwayTimer = setTimeout(() => {
      flyAwayTimer = null;
      finish('failed');
    }, ladybugBalanceTiming.flyAway);
  }

  function finish(result: 'cleared' | 'failed') {
    stopLoop();
    releaseControls();

    phase.value = result;
    windDir.value = 0;

    // 枝は水平にもどす（結果の画面ではフィールドが低くなり、傾いたままだと文字に重なるため。動きは LadybugBalanceField.vue の transition）
    tilt.value = 0;
    tiltVelocity = 0;
    windWarningDir.value = 0;
    finishedAt = performance.now();

    if (result === 'cleared') {
      onCleared(stageIndex.value);
    } else {
      onFailed();
    }
  }

  /* ============================================================
     操作
     ============================================================ */

  function sideKey(side: LadybugBalanceSide) {
    return side === -1 ? 'left' : 'right';
  }

  /* 画面の左右ボタン（押しているあいだだけ傾ける） */
  function pressPointer(side: LadybugBalanceSide) {
    if (!isPlaying.value) {
      return;
    }

    pointerHeld.value = { ...pointerHeld.value, [sideKey(side)]: true };
  }

  function releasePointer(side: LadybugBalanceSide) {
    pointerHeld.value = { ...pointerHeld.value, [sideKey(side)]: false };
  }

  /* ← → キー（A・D でもよい）。遊んでいる最中に、ページの keydown から呼ばれる */
  function getKeySide(event: KeyboardEvent): LadybugBalanceSide | null {
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      return -1;
    }

    if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
      return 1;
    }

    return null;
  }

  function handleGameKeydown(event: KeyboardEvent) {
    // Ctrl + A（ぜんぶ選択）などのショートカットは、じゃましない
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const side = getKeySide(event);

    // 遊んでいる最中は、矢印キー・Space・Enter でスクロールやボタンの押しまちがいが起きないようにする
    if (side !== null || event.key.startsWith('Arrow') || event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
    }

    if (side !== null && isPlaying.value) {
      keyHeld.value = { ...keyHeld.value, [sideKey(side)]: true };
    }
  }

  /* キーをはなしたとき（遊んでいる最中かどうかに関係なく、押していないことにする） */
  function handleKeyup(event: KeyboardEvent) {
    const side = getKeySide(event);

    if (side !== null) {
      keyHeld.value = { ...keyHeld.value, [sideKey(side)]: false };
    }
  }

  /* ウィンドウからフォーカスが外れた・タブが見えなくなったとき
     keyup や pointerup が届かないことがあるので、押している状態を戻しておく */
  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      releaseControls();
    }
  }

  onMounted(() => {
    resetGame();

    window.addEventListener('keyup', handleKeyup);
    window.addEventListener('blur', releaseControls);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onUnmounted(() => {
    stopLoop();
    cancelFlyAway();

    window.removeEventListener('keyup', handleKeyup);
    window.removeEventListener('blur', releaseControls);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  return {
    phase,
    stageIndex,
    stage,
    elapsed,
    tilt,
    ladybugs,
    windDir,
    windWarningDir,
    isLeftHeld,
    isRightHeld,
    isPlaying,
    countdownNumber,
    remainingMs,
    selectStage,
    startGame,
    canAcceptResultInput,
    pressPointer,
    releasePointer,
    handleGameKeydown,
  };
}
