/* ============================================================
   秘密の小道（こもれびの広場へ続くミニゲーム）の「状態を持つ側」

   ■ ここがやること
     ・遊んでいる最中に変わる状態（レーン・流れてくるもの・こもれびの数・ゲームの時計など）を持つ
     ・requestAnimationFrame の1コマごとの処理（出す・動かす・当たりを見る・片づける）
     ・キー操作とポインター操作（クリック・タップ・ドラッグ・フリック・長押し）

   ■ ここがやらないこと
     ・計算と判定は composables/useSecretPath.ts（同じ計算をこちらに書き写さない）
     ・ゲーム全体の状態（currentEvent・outingPoint など）は持たず、options の ref を読み書きする
     ・場所の移動・音を鳴らす中身なども、options でもらった関数を呼ぶだけ

   ■ 2つの遊びかた（options.mode）
     ・story   … ゲーム本編の小道（pages/index.vue）
     ・endless … ミニゲームの「どこまで行ける？」（pages/minigame/secret-path.vue）
                 フィールド・操作・当たり判定は story と同じで、ちがうのは次のところだけ
                 ・時間では終わらず、枝に secretPathEndlessLives 回当たったら終わる（こもれびは減らない）
                 ・行の予定を、遊びながら1行ずつ作る
                 ・進んだ距離でレベルが上がり、速さ・行の間隔・枝2本の割合がきびしくなる
                 ・進んだ距離を数え、こもれび1つで +5m のボーナス
                 ・加速コンボ：枝に当たらずに加速を続けると、距離を多めに数える（合計で ×3 → ×4 → ×6）
                 ・本編の状態（おでかけポイントなど）にはさわらない

   ■ 設定の数字は data/secretPath.ts（endless だけの数字は data/secretPathEndless.ts）
   ============================================================ */

import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';

import {
  buildSecretPathEndlessRow,
  buildSecretPathSpawnQueue,
  getSecretPathBonusPoint,
  getSecretPathEndlessLevel,
  getSecretPathEndlessNextRowAt,
  getSecretPathEndlessSpeed,
  getSecretPathResultText,
  getSecretPathSwipeThreshold,
} from '~/composables/useSecretPath';
import {
  secretPathBoostMultiplier,
  secretPathBumpEffectDuration,
  secretPathCountdownDuration,
  secretPathCountdownLeadIn,
  secretPathDuration,
  secretPathHoldBoostDelay,
  secretPathLeaveGuard,
  secretPathPlayerY,
  secretPathRemoveY,
  secretPathSparkleDuration,
  secretPathSpawnY,
  secretPathSpeed,
  secretPathStartCueDuration,
  secretPathTapFlashDuration,
} from '~/data/secretPath';
import {
  secretPathEndlessBoostComboTiers,
  secretPathEndlessFirstRowAt,
  secretPathEndlessGameOverDelay,
  secretPathEndlessLives,
  secretPathEndlessMetersPerField,
  secretPathEndlessStepMs,
  secretPathEndlessSunlightBonusMeters,
} from '~/data/secretPathEndless';
import type { GameEvent, SecretPathItem, SecretPathLane, SecretPathMode, SecretPathPhase, SecretPathSpawn, StatusChanges } from '~/types/game';

export type UseSecretPathGameOptions = {
  /* 遊びかた（書かなければ story） */
  mode?: SecretPathMode;

  /* ===== ゲーム全体の状態（持ち主は useGameState.ts と pages/index.vue） ===== */
  gameStarted: Ref<boolean>;
  currentEvent: Ref<GameEvent>;
  outingPoint: Ref<number>;
  hasDiscoveredSecretSpot: Ref<boolean>;
  statusChanges: Ref<StatusChanges | null>;
  selectedCommandIndex: Ref<number>;

  /* ===== ゲーム全体の画面まわり（pages/index.vue） ===== */
  goToPlace: (place: GameEvent) => void;
  restoreEntranceCursor: () => void;

  /* ===== 音（useAudio.ts） ===== */
  playDecisionSound: () => void;
  playItemSound: () => void;
  playSunlightSound: () => void;
  playBranchBumpSound: () => void;
  playCountdownSound: (delay?: number) => void;
  playCountdownStartSound: () => void;
};

export function useSecretPathGame(options: UseSecretPathGameOptions) {
  /* pages/index.vue にあったときと同じ名前で使えるようにしておく */
  const {
    gameStarted,
    currentEvent,
    outingPoint,
    hasDiscoveredSecretSpot,
    statusChanges,
    selectedCommandIndex,
    goToPlace,
    restoreEntranceCursor,
    playDecisionSound,
    playItemSound,
    playSunlightSound,
    playBranchBumpSound,
    playCountdownSound,
    playCountdownStartSound,
  } = options;

  /* 「どこまで行ける？」として遊ぶか（false ＝ ゲーム本編の小道） */
  const isEndless = options.mode === 'endless';

  /* いまの進み具合（小道へ入るたびに ready から始める） */
  const secretPathPhase = ref<SecretPathPhase>('ready');

  /* こうちゃんのレーン（はじめは、まん中） */
  const secretPathPlayerLane = ref<SecretPathLane>(1);

  /* いまフィールドに出ている枝とこもれび */
  const secretPathItems = ref<SecretPathItem[]>([]);

  /* 集めたこもれびの数 */
  const secretPathSunlightCount = ref(0);

  /* 小道をぬけたときにもらったこもれびボーナス（結果カードに「+3」と出すため。0 = なし） */
  const secretPathBonusPoint = ref(0);

  /* 始まってから何ミリ秒たったか（ゲームの時計）
     タブを切りかえているあいだは requestAnimationFrame が止まるので、この時計も止まる

     カウントダウンもこの時計で数える
     -(secretPathCountdownLeadIn + secretPathCountdownDuration) から始めて、0 になったらスタート
     （はじめの LeadIn のあいだは数字を出さない「間」。予定はどれも 0 より後なので、マイナスのあいだは何も出てこない） */
  const secretPathElapsed = ref(0);

  /* 「いたっ！」を出しておくのは、ゲームの時計が何ミリ秒になるまでか（0 = 出していない） */
  const secretPathBumpUntil = ref(0);

  /* 直前に枝に当たったとき、こもれびが本当に1つ減ったか
     0個のときは減らないので「-1」を出さない（変わっていないのに出ると、分かりにくいため） */
  const secretPathBumpLost = ref(false);

  /* 「いたっ！」の番号（続けて当たったときに、ふきだしを最初から出しなおすための key） */
  const secretPathBumpId = ref(0);

  /* 道をクリック・タップしたときに光らせるレーンと、いつまで光らせるか
     （指には「マウスを乗せる」が無いので、押したことをこれで伝える） */
  const secretPathTapLane = ref<SecretPathLane | null>(null);
  const secretPathTapUntil = ref(0);

  /* マウスを乗せているレーン（マウスのときだけ使う） */
  const secretPathHoverLane = ref<SecretPathLane | null>(null);

  /* 「［こもれびの絵］+1」を出しておくのは、ゲームの時計が何ミリ秒になるまでか */
  const secretPathSparkleUntil = ref(0);

  /* 「［こもれびの絵］+1」の番号（続けて取ったときに、動きを最初からやりなおすための key） */
  const secretPathSparkleId = ref(0);

  /* 「どこまで行ける？」だけで使う、のこりの ❤（枝に当たるたびに1つ減り、0 になったら おしまい） */
  const secretPathLives = ref(secretPathEndlessLives);

  /* 「どこまで行ける？」だけで使う、進んだ距離（メートル。小数のまま持ち、画面に出すときに切り捨てる） */
  const secretPathDistance = ref(0);

  /* 「どこまで行ける？」だけで使う、加速コンボ
     枝に当たらずに加速を続けている長さ（ミリ秒）と、そこから決まる距離の倍率（secretPathEndlessBoostComboTiers） */
  const secretPathBoostComboTime = ref(0);
  const secretPathComboMultiplier = computed(() => {
    if (!isEndless) {
      return 1;
    }

    let multiplier = 1;

    for (const tier of secretPathEndlessBoostComboTiers) {
      if (secretPathBoostComboTime.value >= tier.seconds * 1000) {
        multiplier = tier.multiplier;
      }
    }

    return multiplier;
  });

  /* 「どこまで行ける？」だけで使う、いまのレベル（進んだ距離から決まる。1 ＝ Lv.1） */
  const secretPathLevel = computed(() => (isEndless ? getSecretPathEndlessLevel(secretPathDistance.value) : 1));

  /* ここから下は画面に出さない入れもの（ref にしなくてよい） */
  let secretPathFrameId: number | null = null; // requestAnimationFrame の予約番号
  let secretPathLastTimestamp: number | null = null; // 前のコマの時刻
  let secretPathSpawnQueue: SecretPathSpawn[] = []; // まだ出していない予定（時間の早い順）
  let secretPathNextItemId = 0;
  let secretPathFinishedAt = 0; // 結果が出た時刻（performance.now()）

  /* 「どこまで行ける？」の行の予定を、遊びながら1行ずつ作るための入れもの */
  let secretPathEndlessNextRowAt = 0; // 次の行を出す時刻（ゲームの時計）
  let secretPathEndlessOpenLanes: SecretPathLane[] = [1]; // 前の行で空いていたレーン（はじめは、こうちゃんのスタート位置）

  /* フィールドを押しているポインターの一時的な状態（releaseSecretPathPointer() でまとめて戻す） */
  let secretPathPointerId: number | null = null; // 押しているポインターの番号（押していないときは null）
  let secretPathPointerField: HTMLElement | null = null; // pointer capture をしているフィールド
  let secretPathPointerDownLane: SecretPathLane | null = null; // 押しはじめたレーン（短いタップと、線をこえたかを見るときに使う）
  let secretPathPointerStartX = 0; // 押しはじめた横の位置（はらった長さ・向きを見るときに使う）
  let secretPathPointerDragged = false; // 押しているあいだに横へ動かしたか（タップとしては動かさない）
  let secretPathPointerFollowing = false; // 線をこえて、押しはじめたのとちがうレーンへ入ったか（入ったあとは、指・マウスのいるレーンへついていく）
  let secretPathPointerMovedPlayer = false; // ついていくことで、こうちゃんが動いたか（動いたときは、はなしたときにフリックとして動かさない）
  let secretPathPointerHeld = false; // 長押しになったか（タップとして動かさない）
  let secretPathHoldTimer: ReturnType<typeof setTimeout> | null = null; // 長押しを待つ予約
  let secretPathGameOverTimer: ReturnType<typeof setTimeout> | null = null; // 最後の ❤ をなくしたあと、結果の画面へ移る予約（「どこまで行ける？」だけ）
  let secretPathDragTargetLane: SecretPathLane | null = null; // こうちゃんがついていく先のレーン（ついていっていない・もう着いたときは null。はなしたあとも、着くまでは残す）

  /* はやく進んでいるか（キーと長押しを別々に持つ。片方をはなしても、もう片方を押していれば はやいまま） */
  const isSecretPathKeyBoosting = ref(false);
  const isSecretPathPointerBoosting = ref(false);

  /* いま「小道で遊んでいる最中」か（キー操作・タップ・1コマごとの処理は、どれもこれを見てから動く） */
  const isSecretPathPlaying = computed(() => currentEvent.value === 'secretPath' && secretPathPhase.value === 'playing');

  /* 最後の ❤ をなくして、結果の画面へ移るのを待っているあいだか（「どこまで行ける？」だけ）
     フィールドは出したまま、ループは止め、こうちゃんも動かせない（長さは secretPathEndlessGameOverDelay） */
  const isSecretPathGameOverWaiting = ref(false);

  /* はじまる前のカウントダウン中かどうか（ゲームの時計がまだマイナスのあいだ） */
  const isSecretPathCountingDown = computed(() => isSecretPathPlaying.value && secretPathElapsed.value < 0);

  /* カウントダウンに出す数字（3 → 2 → 1。カウントダウン中でなければ null） */
  const secretPathCountdownNumber = computed(() => (isSecretPathCountingDown.value ? getSecretPathCountdownNumber(secretPathElapsed.value) : null));

  /* 「スタート！」を出しているか（カウントダウンが終わってから secretPathStartCueDuration のあいだ） */
  const isSecretPathStartCueVisible = computed(
    () => isSecretPathPlaying.value && secretPathElapsed.value >= 0 && secretPathElapsed.value < secretPathStartCueDuration,
  );

  /* いま はやく進んでいるか（HUDの「⏩」と、時計の進め方に使う）
     遊んでいる最中でなければ false（結果の画面に残らない）。カウントダウン中も false（スタートしてから はやくなる） */
  const isSecretPathBoosting = computed(
    () =>
      isSecretPathPlaying.value &&
      !isSecretPathCountingDown.value &&
      !isSecretPathGameOverWaiting.value &&
      (isSecretPathKeyBoosting.value || isSecretPathPointerBoosting.value),
  );

  /* ===== 加速の「いま何倍で数えているか」を、画面に出すための値（「どこまで行ける？」だけ） =====
     加速すると時計そのものが2倍で進むので、距離はすでに ×2 で数えられている
     そこへコンボの倍率（×1.5 → ×2 → ×3）が掛かるので、画面には合計の ×3 → ×4 → ×6 を出す
     （前はコンボの倍率だけを出していて、伸びかたと数字が合っていなかった） */

  /* いま、進んだ距離が ふだんの何倍で数えられているか（加速していないときは 1） */
  const secretPathBoostTotalMultiplier = computed(() => (isSecretPathBoosting.value ? secretPathBoostMultiplier * secretPathComboMultiplier.value : 1));

  /* 加速コンボの、次の段（いちばん上まで届いたら undefined）
     tiers は seconds の小さい順なので、最初に見つかったものが次の段 */
  const secretPathNextComboTier = computed(() =>
    isEndless ? secretPathEndlessBoostComboTiers.find((tier) => secretPathBoostComboTime.value < tier.seconds * 1000) : undefined,
  );

  /* 次の段まで届いたときの合計倍率（HUD の札の「→ ×4」。いちばん上まで届いたら null） */
  const secretPathNextBoostMultiplier = computed(() => {
    const nextTier = secretPathNextComboTier.value;

    return nextTier ? secretPathBoostMultiplier * nextTier.multiplier : null;
  });

  /* 次の段までの進み具合（0〜1。HUD の札の下のゲージ）
     どこで倍率が上がるのかが見えないと、加速をどこまで続けるかを決められないため */
  const secretPathComboProgress = computed(() => {
    const nextTier = secretPathNextComboTier.value;

    if (!nextTier) {
      return 1;
    }

    // いまの段（もう届いている、いちばん上の段）の秒数。まだ1つも届いていなければ 0 から数える
    let from = 0;

    for (const tier of secretPathEndlessBoostComboTiers) {
      if (secretPathBoostComboTime.value >= tier.seconds * 1000) {
        from = tier.seconds * 1000;
      }
    }

    const to = nextTier.seconds * 1000;

    return Math.min(1, Math.max(0, (secretPathBoostComboTime.value - from) / (to - from)));
  });

  /* こもれびぶんの距離のボーナス（結果の画面の「+40m」。本編の小道では使わない） */
  const secretPathSunlightBonusMeters = computed(() => (isEndless ? secretPathSunlightCount.value * secretPathEndlessSunlightBonusMeters : 0));

  /* 枝に当たった直後か（「いたっ！」を出しているあいだ。見た目だけで、動きは止めない）
     ※ カウントダウン中は false（「出していない」を 0 で表しているので、時計がマイナスだと出しているように見えるため） */
  const isSecretPathBumped = computed(() => isSecretPathPlaying.value && !isSecretPathCountingDown.value && secretPathElapsed.value < secretPathBumpUntil.value);

  /* こもれびを取った直後か（カウントダウン中は、上と同じ理由で false） */
  const isSecretPathSparkling = computed(
    () => isSecretPathPlaying.value && !isSecretPathCountingDown.value && secretPathElapsed.value < secretPathSparkleUntil.value,
  );

  /* いま光らせているレーン（道をクリック・タップした直後だけ） */
  const secretPathFlashLane = computed(() => (isSecretPathPlaying.value && secretPathElapsed.value < secretPathTapUntil.value ? secretPathTapLane.value : null));

  /* マウスを乗せているレーンを押したときに、こうちゃんが動く先のレーン
     押した方向へ1レーンだけ動くので、遠いレーンに乗せているときは「まん中」が動く先になる */
  const secretPathHoverDestination = computed(() => {
    const hoverLane = secretPathHoverLane.value;
    const currentLane = secretPathPlayerLane.value;

    if (!isSecretPathPlaying.value || hoverLane === null || hoverLane === currentLane) {
      return null;
    }

    const destination = hoverLane < currentLane ? currentLane - 1 : currentLane + 1;

    /* 計算上はかならず 0〜2 だが、TypeScript には「ただの数」に見えて SecretPathLane として渡せないので、確かめてから返す */
    if (destination === 0 || destination === 1 || destination === 2) {
      return destination;
    }

    return null;
  });

  /* 残り時間（秒）。「あと 12秒」のように出す（カウントダウン中は 15秒のまま） */
  const secretPathTimeLeft = computed(() => Math.max(0, Math.ceil((secretPathDuration - Math.max(secretPathElapsed.value, 0)) / 1000)));

  /* 集めたこもれびの数に合わせた、結果の文章 */
  const secretPathResultText = computed(() => getSecretPathResultText(secretPathSunlightCount.value));

  /* カウントダウン中の時計（マイナス）から、出す数字（3 → 2 → 1）を決める
     はじめの「間」（secretPathCountdownLeadIn）のあいだは null
     null → 3 に変わったところで advanceSecretPath() が「3」の音を鳴らすので、音と数字はいつもそろう */
  function getSecretPathCountdownNumber(elapsed: number) {
    if (-elapsed > secretPathCountdownDuration) {
      return null;
    }

    return Math.min(3, Math.ceil((-elapsed / secretPathCountdownDuration) * 3));
  }

  /* requestAnimationFrame のループを止める（予約が無ければ何もしない） */
  function stopSecretPathLoop() {
    if (secretPathFrameId !== null) {
      cancelAnimationFrame(secretPathFrameId);
      secretPathFrameId = null;
    }

    secretPathLastTimestamp = null;
  }

  /* 最後の ❤ をなくしたあとの「結果の画面へ移る予約」を取り消す */
  function cancelSecretPathGameOver() {
    if (secretPathGameOverTimer !== null) {
      clearTimeout(secretPathGameOverTimer);
      secretPathGameOverTimer = null;
    }

    isSecretPathGameOverWaiting.value = false;
  }

  /* 秘密の小道を、はじまる前の状態に戻す
     （hasDiscoveredSecretSpot は戻さない。戻すのは resetGame() だけ） */
  function resetSecretPathGame() {
    stopSecretPathLoop();
    releaseSecretPathControls();
    cancelSecretPathGameOver();

    secretPathPhase.value = 'ready';
    secretPathPlayerLane.value = 1;
    secretPathItems.value = [];
    secretPathSunlightCount.value = 0;
    secretPathBonusPoint.value = 0;
    secretPathElapsed.value = 0;
    secretPathBumpUntil.value = 0;
    secretPathBumpLost.value = false;
    secretPathSparkleUntil.value = 0;
    secretPathTapLane.value = null;
    secretPathTapUntil.value = 0;
    secretPathHoverLane.value = null;
    secretPathSpawnQueue = [];
    secretPathFinishedAt = 0;
    secretPathLives.value = secretPathEndlessLives;
    secretPathDistance.value = 0;
    secretPathBoostComboTime.value = 0;
    secretPathEndlessNextRowAt = secretPathEndlessFirstRowAt;
    secretPathEndlessOpenLanes = [1];
  }

  /* 「小道へ進む」（ミニゲームを始める）
     押すまでは何も動かないので、説明を読んでから始められる。押したあとも「3」「2」「1」のあとで流れはじめる */
  function startSecretPathGame() {
    if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'ready') {
      return;
    }

    playDecisionSound();

    resetSecretPathGame();

    // 「どこまで行ける？」は、行の予定を遊びながら1行ずつ作る（→ advanceSecretPath() の ①）
    secretPathSpawnQueue = isEndless ? [] : buildSecretPathSpawnQueue();
    secretPathPhase.value = 'playing';

    // カウントダウンから始める（決定音と「3」の音が続けて鳴らないよう、少し間をあける）
    secretPathElapsed.value = -(secretPathCountdownLeadIn + secretPathCountdownDuration);

    secretPathFrameId = requestAnimationFrame(runSecretPathFrame);
  }

  /* 「もう一回」（「どこまで行ける？」の結果の画面から、すぐに次を始める）
     終わったしゅんかんに押していた指やキーで、すぐ次が始まらないよう、待ち時間をはさむ
     始めたら true を返す（呼ぶ側は、始めたときだけ曲を入れかえる） */
  function restartSecretPathGame() {
    if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'finished') {
      return false;
    }

    if (performance.now() - secretPathFinishedAt < secretPathLeaveGuard) {
      return false;
    }

    resetSecretPathGame();
    startSecretPathGame();
    return true;
  }

  /* 1コマぶんの処理（requestAnimationFrame から呼ばれる） */
  function runSecretPathFrame(timestamp: number) {
    secretPathFrameId = null;

    // もう小道で遊んでいる最中ではない（リセット・画面が変わった など）ときは、ここで止まる
    if (!gameStarted.value || !isSecretPathPlaying.value) {
      stopSecretPathLoop();
      releaseSecretPathControls();
      return;
    }

    /* 前のコマからの時間（最大50ミリ秒。重くなったときに、枝がこうちゃんを「すり抜けて」しまわないように） */
    const delta = secretPathLastTimestamp === null ? 0 : Math.min(Math.max(timestamp - secretPathLastTimestamp, 0), 50);

    secretPathLastTimestamp = timestamp;

    /* はやく進んでいるあいだは、ゲームの時計そのものを2倍で進める（出るタイミングも残り時間も、ぜんぶそろって速くなる）
       1コマで最大100ミリ秒。枝が進むのは7%で、当たり判定の幅10%より小さいので すり抜けない */
    const gameDelta = isSecretPathBoosting.value ? delta * secretPathBoostMultiplier : delta;

    if (!isEndless) {
      advanceSecretPath(gameDelta);
    } else {
      /* 「どこまで行ける？」は速さが上がるので、一気に進めると枝が当たり判定を「すり抜けて」しまう
         そこで secretPathEndlessStepMs ずつに分けて進めながら当たりを見る（途中で ❤ が 0 になったら、そこでやめる） */
      let remaining = gameDelta;

      while (remaining > 0 && isSecretPathPlaying.value && !isSecretPathGameOverWaiting.value) {
        const step = Math.min(remaining, secretPathEndlessStepMs);

        advanceSecretPath(step);
        remaining -= step;
      }
    }

    // まだ遊んでいれば、ドラッグしている先へ1レーンだけ近づけて、次のコマを予約する
    // （当たりを見たあとに近づけるので、とちゅうのレーンでも、かならず1コマは当たりを見る）
    if (isSecretPathPlaying.value && !isSecretPathGameOverWaiting.value) {
      followSecretPathDragTarget();
      secretPathFrameId = requestAnimationFrame(runSecretPathFrame);
    }
  }

  /* ゲームの時計を delta ミリ秒進めて、出す・動かす・当たりを見る・片づける */
  function advanceSecretPath(delta: number) {
    const previousElapsed = secretPathElapsed.value;

    // 「どこまで行ける？」は時間では終わらないので、15秒で止めない
    const elapsed = isEndless ? previousElapsed + delta : Math.min(previousElapsed + delta, secretPathDuration);

    secretPathElapsed.value = elapsed;

    // ⓪ カウントダウン中は、数字が変わるたびに「ピッ」、0 になったら「ピーン♪」
    if (previousElapsed < 0) {
      if (elapsed >= 0) {
        playCountdownStartSound();
      } else if (getSecretPathCountdownNumber(elapsed) !== getSecretPathCountdownNumber(previousElapsed)) {
        playCountdownSound();
      }
    }

    // ① 予定の時間になったものを、フィールドのいちばん上に出す
    //    「どこまで行ける？」は、ここで行の予定を作ってから出す
    //    （前の行で空いていたレーンを引きつぐので、かならず よけられる並びになる）
    if (isEndless) {
      while (secretPathEndlessNextRowAt <= elapsed) {
        const builtRow = buildSecretPathEndlessRow(secretPathEndlessNextRowAt, secretPathEndlessOpenLanes, secretPathDistance.value);

        secretPathSpawnQueue.push(...builtRow.spawns);
        secretPathEndlessOpenLanes = builtRow.openLanes;
        secretPathEndlessNextRowAt = getSecretPathEndlessNextRowAt(secretPathEndlessNextRowAt, secretPathDistance.value);
      }
    }

    let nextSpawn = secretPathSpawnQueue[0];

    while (nextSpawn && nextSpawn.at <= elapsed) {
      secretPathSpawnQueue.shift();
      secretPathNextItemId += 1;
      secretPathItems.value.push({ id: secretPathNextItemId, kind: nextSpawn.kind, lane: nextSpawn.lane, y: secretPathSpawnY, hit: false });
      nextSpawn = secretPathSpawnQueue[0];
    }

    // ② ぜんぶ下へ進めて、こうちゃんに当たったかを見る
    //    「どこまで行ける？」は、レベルで速さが決まり、進んだ距離も数える
    const speed = isEndless ? getSecretPathEndlessSpeed(secretPathDistance.value) : secretPathSpeed;
    const distance = (speed * delta) / 1000;
    let needsCleanup = false;

    if (isEndless && elapsed > 0) {
      const movedDelta = elapsed - Math.max(previousElapsed, 0);

      /* 加速コンボ：続けた長さを実際の時間で数える（delta は時計の2倍ぶんなので、倍率で割る）。やめたら 0 に戻す */
      secretPathBoostComboTime.value = isSecretPathBoosting.value ? secretPathBoostComboTime.value + delta / secretPathBoostMultiplier : 0;

      // 進んだ距離（加速コンボの倍率ぶん、多めに数える）
      secretPathDistance.value += ((speed * movedDelta) / 1000 / 100) * secretPathEndlessMetersPerField * secretPathComboMultiplier.value;
    }

    for (const item of secretPathItems.value) {
      item.y += distance;

      if (item.y > secretPathRemoveY) {
        needsCleanup = true;
        continue;
      }

      // 当たり判定は「同じレーン ＋ こうちゃんの高さのあたりまで来た」だけで見る
      if (item.hit || item.lane !== secretPathPlayerLane.value) {
        continue;
      }

      // マイナス … まだ こうちゃんより上／プラス … こうちゃんより下
      const offset = item.y - secretPathPlayerY;

      // ③ こもれび：こうちゃんに重なったら取る（枝より少しゆるめに見る）
      if (item.kind === 'sunlight' && offset >= -10 && offset <= 6) {
        item.hit = true;
        needsCleanup = true;

        secretPathSunlightCount.value += 1;

        /* 「どこまで行ける？」の距離ボーナス（取りに行く意味を、記録にも出すため）
           加速コンボの倍率は掛けない（いつ取っても同じ +5m のほうが分かりやすい） */
        if (isEndless) {
          secretPathDistance.value += secretPathEndlessSunlightBonusMeters;
        }

        secretPathSparkleUntil.value = elapsed + secretPathSparkleDuration;
        secretPathSparkleId.value += 1;

        // 「+1」と「いたっ！」は同じ場所に出るので、あとから起きたほうだけを出す
        secretPathBumpUntil.value = 0;

        playSunlightSound();
        continue;
      }

      // ④ 枝：当たったら、こもれびを1つ減らす（「どこまで行ける？」では ❤ を1つ減らす）
      //    本編のステータスにはさわらない。枝1本につき1回だけ（item.hit）
      if (item.kind === 'branch' && offset >= -7 && offset <= 3) {
        item.hit = true;

        if (isEndless) {
          secretPathLives.value = Math.max(0, secretPathLives.value - 1);
          secretPathBumpLost.value = true;

          // 加速コンボは、枝に当たったら最初（×1）に戻る
          secretPathBoostComboTime.value = 0;
        } else {
          const hasSunlightToLose = secretPathSunlightCount.value > 0;

          secretPathSunlightCount.value = Math.max(0, secretPathSunlightCount.value - 1);
          secretPathBumpLost.value = hasSunlightToLose;
        }

        secretPathBumpUntil.value = elapsed + secretPathBumpEffectDuration;
        secretPathBumpId.value += 1;

        // 「+1」が残っていたら消す（あとから起きたほうだけを出す）
        secretPathSparkleUntil.value = 0;

        playBranchBumpSound();
      }
    }

    // ⑤ 下へ出ていったものと、取ったこもれびを片づける
    if (needsCleanup) {
      secretPathItems.value = secretPathItems.value.filter((item) => item.y <= secretPathRemoveY && !(item.kind === 'sunlight' && item.hit));
    }

    // ⑥ 15秒たったら、おしまい（「どこまで行ける？」は、❤ が0になったら。少し間をあけてから結果にする）
    if (isEndless ? secretPathLives.value <= 0 : elapsed >= secretPathDuration) {
      if (isEndless) {
        waitSecretPathGameOver();
      } else {
        finishSecretPathGame();
      }
    }
  }

  /* 最後の ❤ をなくしたとき（「どこまで行ける？」だけ）
     すぐ結果の画面にすると、何に当たって終わったのかが見えないので、
     フィールドをその場で止めて（「いたっ！」の絵のまま）、少し待ってから結果の画面にする */
  function waitSecretPathGameOver() {
    if (isSecretPathGameOverWaiting.value) {
      return;
    }

    stopSecretPathLoop();
    releaseSecretPathControls();
    isSecretPathGameOverWaiting.value = true;

    secretPathGameOverTimer = setTimeout(() => {
      secretPathGameOverTimer = null;
      finishSecretPathGame();
    }, secretPathEndlessGameOverDelay);
  }

  /* 時間切れ（小道をぬけた）。ここで「こもれびの広場を見つけた」ことになる */
  function finishSecretPathGame() {
    stopSecretPathLoop();
    releaseSecretPathControls();
    cancelSecretPathGameOver();

    secretPathPhase.value = 'finished';
    secretPathItems.value = [];
    secretPathSpawnQueue = [];
    secretPathBumpUntil.value = 0;
    secretPathBumpLost.value = false;
    secretPathSparkleUntil.value = 0;
    secretPathFinishedAt = performance.now();

    /* 加速コンボも ここで 0 に戻す
       「もう一回」のときに戻すと、新しいプレイのはじめに「コンボが きれた…」と出てしまうため
       （secret-path.vue の watch(secretPathComboMultiplier) が、始まったあとに受け取るため） */
    secretPathBoostComboTime.value = 0;

    // 結果の画面は「もう一回」などのコマンドだけになるので、選択中のコマンドを一番上（0）に戻す
    selectedCommandIndex.value = 0;

    /* 「どこまで行ける？」は、ここまで（本編の状態にはさわらない。記録の保存と音はページが行う） */
    if (isEndless) {
      return;
    }

    /* こもれびボーナス
       ・addOutingPoint() ではなく、そのまま足す（「2回目の場所は半分」は場所のためのルールで、小道は場所ではないため）
       ・上部ステータスにも +3 と出るよう、今回の変化にも入れる（広場へ入るとき goToPlace() で null に戻る） */
    const bonusPoint = getSecretPathBonusPoint(secretPathSunlightCount.value);

    secretPathBonusPoint.value = bonusPoint;

    if (bonusPoint > 0) {
      outingPoint.value += bonusPoint;
      statusChanges.value = { childEnergy: 0, childMood: 0, outingPoint: bonusPoint, parentEnergy: 0, parentCalm: 0, minutes: 0 };
    }

    hasDiscoveredSecretSpot.value = true;

    // 「木々のすき間から、まぶしい光が…」に合わせて、キラリン♪
    playItemSound();
  }

  /* 「先へ進む」（こもれびの広場へ。BGM は小道から鳴っているので、そのまま続く） */
  function enterSecretSpotFromPath() {
    if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'finished') {
      return;
    }

    if (performance.now() - secretPathFinishedAt < secretPathLeaveGuard) {
      return;
    }

    goToPlace('secretSpot');

    /* 小道の状態は、画面が変わってから片づける（消えていく画面は描きなおされないので、途中で文章が変わって見えない） */
    resetSecretPathGame();
  }

  /* 「← 場所選びにもどる」（はじまる前だけ）
     小道に入らずに引き返すだけなので、時間・ステータスなどは何も変えない（もう一度選ぶと、また ready から始まる）
     カーソルは「秘密の小道」に合わせる */
  function leaveSecretPathToEntrance() {
    if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'ready') {
      return;
    }

    goToPlace('parkEntrance');
    resetSecretPathGame();
    restoreEntranceCursor();
  }

  /* こうちゃんを左（-1）か右（+1）へ、1レーンだけ動かす（はしでは、その場のまま）
     枝に当たった直後も、ふつうに動ける */
  function moveSecretPathPlayer(direction: -1 | 1) {
    // 結果の画面を待っているあいだも動かさない（キー・タップ・ドラッグのどれも、ここを通る）
    if (!isSecretPathPlaying.value || isSecretPathGameOverWaiting.value) {
      return;
    }

    const nextLane = secretPathPlayerLane.value + direction;

    if (nextLane === 0 || nextLane === 1 || nextLane === 2) {
      secretPathPlayerLane.value = nextLane;
    }
  }

  /* フィールドの横の位置（clientX）が、どのレーンの上か（フィールドの外なら null） */
  function getSecretPathLaneAt(field: HTMLElement, clientX: number, clientY: number): SecretPathLane | null {
    const rect = field.getBoundingClientRect();

    if (rect.width <= 0 || clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) {
      return null;
    }

    const lane = Math.floor(((clientX - rect.left) / rect.width) * 3);

    return lane === 0 || lane === 1 || lane === 2 ? lane : null;
  }

  /* フィールドの横の位置（clientX）が、どのレーンの上か（押しているあいだ用）
     押したまま左右の外へ出たときも、いちばん近いはしのレーンとみなす（そのままついていけるように） */
  function getSecretPathLaneAtX(field: HTMLElement, clientX: number): SecretPathLane {
    const rect = field.getBoundingClientRect();

    if (rect.width <= 0) {
      return secretPathPlayerLane.value;
    }

    const lane = Math.floor(((clientX - rect.left) / rect.width) * 3);

    return lane <= 0 ? 0 : lane >= 2 ? 2 : 1;
  }

  /* はやく進む・ポインターを押している状態を、ぜんぶ元に戻す
     keyup や pointerup が届かないときでも、押したままの扱いが残らないように、
     終わった・リセット・フォーカスが外れた・ページを離れた ときなどに、かならず呼ぶ */
  function releaseSecretPathControls() {
    isSecretPathKeyBoosting.value = false;
    secretPathDragTargetLane = null;
    releaseSecretPathPointer();
  }

  /* ポインターを押している状態だけを、元に戻す
     ※ ついていく先のレーン（secretPathDragTargetLane）は消さない
       まだ着いていなければ、このあとのコマで1レーンずつ動かす（まとめて動かすと、とちゅうの枝をすり抜けるため） */
  function releaseSecretPathPointer() {
    if (secretPathHoldTimer !== null) {
      clearTimeout(secretPathHoldTimer);
      secretPathHoldTimer = null;
    }

    if (secretPathPointerField && secretPathPointerId !== null) {
      try {
        if (secretPathPointerField.hasPointerCapture(secretPathPointerId)) {
          secretPathPointerField.releasePointerCapture(secretPathPointerId);
        }
      } catch {
        // もう押していないポインターのときは、何もしなくてよい
      }
    }

    secretPathPointerId = null;
    secretPathPointerField = null;
    secretPathPointerDownLane = null;
    secretPathPointerStartX = 0;
    secretPathPointerDragged = false;
    secretPathPointerFollowing = false;
    secretPathPointerMovedPlayer = false;
    secretPathPointerHeld = false;
    isSecretPathPointerBoosting.value = false;
  }

  /* フィールドのポインター操作（マウス・指・ペンを Pointer Events でまとめて受け取る）

     ■ 短く押す … 押したレーンの方向へ1レーンだけ（はなしたときに動かす）
       いっきに2レーン動けると、まん中の枝をすり抜けられて、この操作だけ有利になるため
     ■ ドラッグ … 点線をこえたら、はなすまで指・マウスのいるレーンへついていく（1コマに1レーンずつ）
     ■ フリック（指・ペンだけ）… 点線をこえなくても、大きく横へはらったら、その向きへ1レーン
     ■ 長押し … はなすまで、はやく進む

     ※ setPointerCapture … 押したままフィールドの外へ出ても、pointerup を受け取るため
     ※ 最初に押したポインターだけで操作する（2本目の指は使わない） */
  function handleSecretPathPointerDown(event: PointerEvent) {
    // 右クリック・遊んでいる最中以外・結果の画面を待っているあいだは、押したことにしない
    if (event.button !== 0 || !isSecretPathPlaying.value || isSecretPathGameOverWaiting.value) {
      return;
    }

    // 長押しのメニュー・文字の選択・フォーカス移動を起こさない
    event.preventDefault();

    const field = event.currentTarget as HTMLElement;

    if (secretPathPointerId !== null) {
      // べつの指で まだ押している（capture が続いている）ときは、あとから押したほうを使わない
      if (secretPathPointerId !== event.pointerId && field.hasPointerCapture(secretPathPointerId)) {
        return;
      }

      // はなしたことが届かなかった古い状態は、ここで片づけてから始めなおす
      releaseSecretPathPointer();
    }

    const pointerId = event.pointerId;

    secretPathPointerId = pointerId;
    secretPathPointerField = field;
    secretPathPointerDownLane = getSecretPathLaneAtX(field, event.clientX);
    secretPathPointerStartX = event.clientX;
    secretPathDragTargetLane = null;

    try {
      field.setPointerCapture(pointerId);
    } catch {
      // capture できなくても、フィールドの中で はなせばふつうに動く
    }

    secretPathHoldTimer = setTimeout(() => {
      secretPathHoldTimer = null;

      if (!isSecretPathPlaying.value || secretPathPointerId !== pointerId) {
        return;
      }

      secretPathPointerHeld = true;
      isSecretPathPointerBoosting.value = true;
    }, secretPathHoldBoostDelay);
  }

  function handleSecretPathPointerMove(event: PointerEvent) {
    // マウスを乗せているレーン（動く先の目印をはっきりさせるため。マウスのときだけ）
    if (event.pointerType === 'mouse') {
      secretPathHoverLane.value = getSecretPathLaneAt(event.currentTarget as HTMLElement, event.clientX, event.clientY);
    }

    if (event.pointerId !== secretPathPointerId || !isSecretPathPlaying.value) {
      return;
    }

    dragSecretPathPlayer(event);
  }

  /* はなしたとき
     ① 動かさず、長押しにもならなかった → タップ（押したレーンの方向へ1レーン）
     ② ついていく先にまだ着いていない → このあとのコマで着くまで動く
     ③ フリックしたが、こうちゃんは動いていない → はらった向きへ1レーン（長押しのあとは動かさない） */
  function handleSecretPathPointerUp(event: PointerEvent) {
    if (event.pointerId !== secretPathPointerId) {
      return;
    }

    if (isSecretPathPlaying.value) {
      // pointermove が届く前に はなしたときのために、はなした位置でも見なおす
      dragSecretPathPlayer(event);

      const currentLane = secretPathPlayerLane.value;
      const distance = event.clientX - secretPathPointerStartX;
      const isFlick = event.pointerType !== 'mouse' && Math.abs(distance) >= getSecretPathSwipeThreshold(event.pointerType);

      const isStillFollowing = secretPathDragTargetLane !== null && secretPathDragTargetLane !== currentLane;

      if (!secretPathPointerDragged && !secretPathPointerHeld) {
        tapSecretPathLane(secretPathPointerDownLane);
      } else if (isFlick && !isStillFollowing && !secretPathPointerHeld && !secretPathPointerMovedPlayer) {
        secretPathDragTargetLane = null;
        stepSecretPathPlayerToward(distance < 0 ? 0 : 2);
      }
    }

    releaseSecretPathPointer();
  }

  /* キャンセルされたとき（ブラウザがジェスチャーを引き取った など）は、動かさずに元へ戻すだけ */
  function handleSecretPathPointerCancel(event: PointerEvent) {
    if (event.pointerId !== secretPathPointerId) {
      return;
    }

    secretPathDragTargetLane = null;
    releaseSecretPathPointer();
  }

  function handleSecretPathPointerLeave(event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      secretPathHoverLane.value = null;
    }
  }

  /* 押したまま動かしたとき（ドラッグ）
     ・大きく動いた・点線をこえた … タップ・長押しとしては扱わない
     ・点線をこえた … ついていく先を決めるだけ（動かすのは followSecretPathDragTarget()） */
  function dragSecretPathPlayer(event: PointerEvent) {
    const field = secretPathPointerField;

    if (!field) {
      return;
    }

    const pointerLane = getSecretPathLaneAtX(field, event.clientX);
    const hasCrossedLine = pointerLane !== secretPathPointerDownLane;
    const hasMovedFar = Math.abs(event.clientX - secretPathPointerStartX) >= getSecretPathSwipeThreshold(event.pointerType);

    if (!secretPathPointerDragged && (hasCrossedLine || hasMovedFar)) {
      secretPathPointerDragged = true;

      // 長押しになる前に横へ動いたら、長押しにはしない
      if (secretPathHoldTimer !== null) {
        clearTimeout(secretPathHoldTimer);
        secretPathHoldTimer = null;
      }
    }

    if (hasCrossedLine) {
      secretPathPointerFollowing = true;
    }

    // 一度こえたあとは、押しはじめたレーンへ戻ったときも、そこへついていく
    if (secretPathPointerFollowing) {
      secretPathDragTargetLane = pointerLane;
    }
  }

  /* ついていく先のレーンへ、1レーンだけ近づける（1コマに1回）
     いっきに動くと、まん中の枝をすり抜けられてしまうため（1コマは約16ミリ秒なので、見た目はほぼ すぐ） */
  function followSecretPathDragTarget() {
    if (secretPathDragTargetLane === null) {
      return;
    }

    // 着いたら終わり（押しているあいだは、指・マウスがまた動けば、新しい行き先が入る）
    if (secretPathDragTargetLane === secretPathPlayerLane.value) {
      if (secretPathPointerId === null) {
        secretPathDragTargetLane = null;
      }

      return;
    }

    stepSecretPathPlayerToward(secretPathDragTargetLane);
    secretPathPointerMovedPlayer = true;
  }

  /* lane の方向へ1レーンだけ動かして、動いた先のレーンを一瞬光らせる（いまいるレーンなら何もしない） */
  function stepSecretPathPlayerToward(lane: SecretPathLane) {
    const laneBefore = secretPathPlayerLane.value;

    if (lane === laneBefore) {
      return;
    }

    moveSecretPathPlayer(lane < laneBefore ? -1 : 1);

    if (secretPathPlayerLane.value !== laneBefore) {
      secretPathTapLane.value = secretPathPlayerLane.value;
      secretPathTapUntil.value = secretPathElapsed.value + secretPathTapFlashDuration;
    }
  }

  /* 短く押したレーンの方向へ、1レーンだけ動かし、押したレーンを一瞬光らせる（いまいるレーンなら何もしない） */
  function tapSecretPathLane(lane: SecretPathLane | null) {
    const currentLane = secretPathPlayerLane.value;

    if (lane === null || lane === currentLane) {
      return;
    }

    moveSecretPathPlayer(lane < currentLane ? -1 : 1);

    secretPathTapLane.value = lane;
    secretPathTapUntil.value = secretPathElapsed.value + secretPathTapFlashDuration;
  }

  /* ↑ / Space キーをはなしたとき（window の keyup。遊んでいる最中かどうかに関係なく、はやく進むのをやめる） */
  function handleSecretPathKeyup(event: KeyboardEvent) {
    if (event.key === 'ArrowUp' || event.key === ' ') {
      isSecretPathKeyBoosting.value = false;
    }
  }

  /* ウィンドウからフォーカスが外れた・タブが見えなくなったとき
     keyup や pointerup が届かないことがあるので、はやく進む・押している状態を戻しておく */
  function handleSecretPathWindowBlur() {
    releaseSecretPathControls();
  }

  function handleSecretPathVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      releaseSecretPathControls();
    }
  }

  /* 小道で遊んでいる最中のキー操作（handleKeydown() から呼ばれる）

     ・← / A … 左へ1レーン、→ / D … 右へ1レーン（押しっぱなしでは続けて動かさない）
     ・↑ / Space … 押しているあいだだけ、はやく進む
     ・↓ / Enter … 何もしない（スクロールや、ボタンの押しまちがいを止めるだけ）

     ※ Space は押しっぱなし（event.repeat）では、はやく進みはじめない
       「小道へ進む」を Space で押したままだと、はじまった瞬間から はやくなってしまうため */
  function handleSecretPathKeydown(event: KeyboardEvent) {
    // Ctrl + A（ぜんぶ選択）などのショートカットは、じゃましない
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
    const isLeftKey = event.key === 'ArrowLeft' || (!hasModifier && event.code === 'KeyA');
    const isRightKey = event.key === 'ArrowRight' || (!hasModifier && event.code === 'KeyD');

    if (isLeftKey || isRightKey) {
      event.preventDefault();

      if (event.repeat) {
        return;
      }

      moveSecretPathPlayer(isLeftKey ? -1 : 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      isSecretPathKeyBoosting.value = true;
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      // サウンドON/OFFのボタンを選んでいるときだけは、ボタン本来の操作にまかせる
      const target = event.target as HTMLElement | null;

      if (target?.closest?.('.sound-toggle')) {
        return;
      }

      event.preventDefault();

      if (event.key === ' ' && !event.repeat) {
        isSecretPathKeyBoosting.value = true;
      }
    }
  }

  /* 小道の外でも受け取らないと困るできごと（keyup・blur・visibilitychange）を登録する
     ※ keydown は useKeyboardControls.ts から handleSecretPathKeydown() が呼ばれる */
  onMounted(() => {
    window.addEventListener('keyup', handleSecretPathKeyup);
    window.addEventListener('blur', handleSecretPathWindowBlur);
    document.addEventListener('visibilitychange', handleSecretPathVisibilityChange);
  });

  onUnmounted(() => {
    window.removeEventListener('keyup', handleSecretPathKeyup);
    window.removeEventListener('blur', handleSecretPathWindowBlur);
    document.removeEventListener('visibilitychange', handleSecretPathVisibilityChange);

    // ループ・押している状態・予約も片づける（ページを離れたあとに結果へ移らないように）
    stopSecretPathLoop();
    releaseSecretPathControls();
    cancelSecretPathGameOver();
  });

  /* 返すのは、画面・コマンド・キーボード操作から使うものだけ */
  return {
    /* ===== 画面に出す状態 ===== */
    secretPathPhase,
    secretPathPlayerLane,
    secretPathItems,
    secretPathSunlightCount,
    secretPathBonusPoint,
    secretPathBumpLost,
    secretPathBumpId,
    secretPathSparkleId,
    secretPathLives, // 「どこまで行ける？」だけ
    secretPathDistance, // 「どこまで行ける？」だけ
    secretPathComboMultiplier, // 「どこまで行ける？」だけ（加速コンボの倍率。1 ＝ コンボなし）
    secretPathBoostTotalMultiplier, // 「どこまで行ける？」だけ（いま距離が ふだんの何倍で数えられているか。1 ＝ 加速していない）
    secretPathNextBoostMultiplier, // 「どこまで行ける？」だけ（次の段まで届いたときの合計倍率。いちばん上まで届いたら null）
    secretPathComboProgress, // 「どこまで行ける？」だけ（次の段までの進み具合。0〜1）
    secretPathSunlightBonusMeters, // 「どこまで行ける？」だけ（集めたこもれびぶんの、進んだ距離のボーナス）
    secretPathLevel, // 「どこまで行ける？」だけ（いまのレベル。1 ＝ Lv.1）

    /* ===== 画面に出す、計算した状態 ===== */
    isSecretPathPlaying,
    isSecretPathBoosting,
    secretPathCountdownNumber,
    isSecretPathStartCueVisible,
    isSecretPathBumped,
    isSecretPathSparkling,
    secretPathFlashLane,
    secretPathHoverDestination,
    secretPathTimeLeft,
    secretPathResultText,

    /* ===== コマンド（はじまる前・終わったあと） ===== */
    startSecretPathGame,
    leaveSecretPathToEntrance,
    enterSecretSpotFromPath,
    restartSecretPathGame, // 「どこまで行ける？」だけ（もう一回）

    /* ===== キー操作（composables/useKeyboardControls.ts から呼ばれる） ===== */
    handleSecretPathKeydown,

    /* ===== フィールドのポインター操作（template から直接つなぐ） ===== */
    handleSecretPathPointerDown,
    handleSecretPathPointerMove,
    handleSecretPathPointerUp,
    handleSecretPathPointerCancel,
    handleSecretPathPointerLeave,

    /* ===== はじまる前の状態に戻す（goToSecretArea() と resetGame() から呼ばれる） ===== */
    resetSecretPathGame,
  };
}
