/* ============================================================
   秘密の小道（こもれびの広場へ続くミニゲーム）の「状態を持つ側」

   ゲーム本編（pages/index.vue）にあった、秘密の小道の
   「遊んでいる最中に変わるもの」と「動かすところ」を、そのまま移してある

   ■ ここがやること
     ・ミニゲームの中だけで意味を持つ状態（進み具合・レーン・流れてくるもの・
       木漏れ日の数・ゲームの時計・演出の残り時間など）を持つ
     ・requestAnimationFrame の1コマごとの処理（出す・動かす・当たりを見る・片づける）
     ・キー操作とポインター操作（クリック・タップ・ドラッグ・フリック・長押し）
     ・小道専用のイベント（keyup / blur / visibilitychange）の登録と解除
     ・はじまる前の状態に戻す resetSecretPathGame()

   ■ ここがやらないこと
     ・計算と判定は composables/useSecretPath.ts のまま
       （予定表づくり・結果の文章・ボーナス・しきい値えらび）
       同じ計算をこちらに書き写してはいない
     ・ゲーム全体で共有する状態は持たない
       （currentEvent・outingPoint・hasDiscoveredSecretSpot・statusChanges・
         selectedCommandIndex は composables/useGameState.ts と pages/index.vue のもの。
         ここでは options で受けとった ref をそのまま読み書きする）
     ・場所の移動そのもの（goToPlace()）・公園入口のカーソル合わせ（restoreEntranceCursor()）・
       音を鳴らす中身（composables/useAudio.ts）は、どれも options でもらった関数を呼ぶだけ
     ・公園入口の「細い道の先」（goToSecretArea()）は、
       小道へ入るか広場へ入るかを決めるゲーム全体の分かれ道なので pages/index.vue のまま

   ■ ゲームの中身は、いっさい変えていない
     区切りの数字・当たり判定の幅・演出の長さ・キーとポインターの受けつけかた・
     乱数を使う順番・音を鳴らすタイミングは、移す前とまったく同じ

   ■ 設定の数字は data/secretPath.ts、型は types/game.ts のものをそのまま使う
   ============================================================ */

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';

import { buildSecretPathSpawnQueue, getSecretPathBonusPoint, getSecretPathResultText, getSecretPathSwipeThreshold } from '~/composables/useSecretPath';
import {
  secretPathBoostMultiplier,
  secretPathBumpEffectDuration,
  secretPathDuration,
  secretPathHoldBoostDelay,
  secretPathLeaveGuard,
  secretPathPlayerY,
  secretPathRemoveY,
  secretPathSparkleDuration,
  secretPathSpawnY,
  secretPathSpeed,
  secretPathTapFlashDuration,
} from '~/data/secretPath';
import type { GameEvent, SecretPathItem, SecretPathLane, SecretPathPhase, SecretPathSpawn, StatusChanges } from '~/types/game';

export type UseSecretPathGameOptions = {
  /* ===== ゲーム全体の状態（持ち主は composables/useGameState.ts と pages/index.vue） ===== */
  gameStarted: Ref<boolean>;
  currentEvent: Ref<GameEvent>;
  outingPoint: Ref<number>;
  hasDiscoveredSecretSpot: Ref<boolean>;
  statusChanges: Ref<StatusChanges | null>;
  selectedCommandIndex: Ref<number>;

  /* ===== ゲーム全体の画面まわり（中身は pages/index.vue のまま） ===== */
  goToPlace: (place: GameEvent) => void;
  restoreEntranceCursor: () => void;

  /* ===== 音（中身は composables/useAudio.ts のまま。同じところで同じものを鳴らす） ===== */
  playDecisionSound: () => void;
  playItemSound: () => void;
  playSunlightSound: () => void;
  playBranchBumpSound: () => void;
};

export function useSecretPathGame(options: UseSecretPathGameOptions) {
  /* 受けとったものを、今までと同じ名前で使えるようにしておく
     （こうすると、pages/index.vue にあったときのコードをそのまま動かせる） */
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
  } = options;

  /* いまの進み具合（小道へ入るたびに ready から始める） */
  const secretPathPhase = ref<SecretPathPhase>('ready');

  /* こうちゃんのレーン（はじめは、まん中） */
  const secretPathPlayerLane = ref<SecretPathLane>(1);

  /* いまフィールドに出ている枝と木漏れ日 */
  const secretPathItems = ref<SecretPathItem[]>([]);

  /* 集めた木漏れ日の数 */
  const secretPathSunlightCount = ref(0);

  /* 小道をぬけたときにもらった木漏れ日ボーナス（結果カードに「+3」と出すため。0 = なし） */
  const secretPathBonusPoint = ref(0);

  /* 始まってから何ミリ秒たったか（ゲームの時計）

     タブを切りかえているあいだは requestAnimationFrame が止まるので、この時計も止まる
     （戻ってきたときに、いきなり何秒も進んでしまわない） */
  const secretPathElapsed = ref(0);

  /* 「いたっ！」を出しておくのは、ゲームの時計が何ミリ秒になるまでか（0 = 出していない） */
  const secretPathBumpUntil = ref(0);

  /* 直前に枝に当たったとき、木漏れ日が本当に1つ減ったか

     0個のときに当たっても減らない（0のまま）ので、そのときは「✨ -1」を出さない
     （数が変わっていないのに「-1」と出ると、何が起きたか分かりにくくなるため） */
  const secretPathBumpLost = ref(false);

  /* 「いたっ！」の番号
     続けて枝に当たったときに、ふきだしを最初から出しなおすための key */
  const secretPathBumpId = ref(0);

  /* 道（レーン）をクリック・タップしたときに光らせるレーンと、ゲームの時計が何ミリ秒になるまで光らせるか
     （見た目だけ。指で押したときは「マウスを乗せる」が無いので、押したことをこれで伝える） */
  const secretPathTapLane = ref<SecretPathLane | null>(null);
  const secretPathTapUntil = ref(0);

  /* マウスを乗せているレーン（乗せていないときは null）
     マウスのときだけ使う（指で押したときは「乗せる」が無いので、ここは変えない） */
  const secretPathHoverLane = ref<SecretPathLane | null>(null);

  /* 「✨ +1」を出しておくのは、ゲームの時計が何ミリ秒になるまでか */
  const secretPathSparkleUntil = ref(0);

  /* 「✨ +1」の番号
     続けて木漏れ日を取ったときに、ふわっと上がる動きを最初からやりなおすための key */
  const secretPathSparkleId = ref(0);

  /* 遊んでいる最中のカード（スマホ幅で、遊びはじめに画面の上へスクロールするための目印） */
  const secretPathPlayRef = ref<HTMLElement | null>(null);

  /* ここから下は画面に出さない入れもの（ref にしなくてよい） */
  let secretPathFrameId: number | null = null; // requestAnimationFrame の予約番号
  let secretPathLastTimestamp: number | null = null; // 前のコマの時刻
  let secretPathSpawnQueue: SecretPathSpawn[] = []; // まだ出していない予定（時間の早い順）
  let secretPathNextItemId = 0;
  let secretPathFinishedAt = 0; // 結果が出た時刻（performance.now()）

  /* フィールドを押しているポインター（マウス・指・ペン）の一時的な状態
     はなしたとき・キャンセルされたとき・リセットや終了のときに、releaseSecretPathPointer() でまとめて戻す */
  let secretPathPointerId: number | null = null; // 押しているポインターの番号（押していないときは null）
  let secretPathPointerField: HTMLElement | null = null; // pointer capture をしているフィールド
  let secretPathPointerDownLane: SecretPathLane | null = null; // 押しはじめたレーン（短いタップのときに使う）
  let secretPathPointerLastX = 0; // 横の移動を数えはじめた位置（1レーン動くたびに、そこから数えなおす）
  let secretPathPointerDragged = false; // 押しているあいだに、横へ動かして1レーン動いたか（タップとして動かさない）
  let secretPathPointerHeld = false; // 長押しになったか（タップとして動かさない）
  let secretPathHoldTimer: ReturnType<typeof setTimeout> | null = null; // 長押しを待つ予約

  /* はやく進んでいるか（キーと、フィールドの長押しを別々に持つ）
     片方をはなしても、もう片方を押しているあいだは はやいまま */
  const isSecretPathKeyBoosting = ref(false);
  const isSecretPathPointerBoosting = ref(false);

  /* いま「小道で遊んでいる最中」かどうか
     キー操作・道のクリック／タップ・1コマごとの処理は、どれもこれを見てから動く */
  const isSecretPathPlaying = computed(() => currentEvent.value === 'secretPath' && secretPathPhase.value === 'playing');

  /* いま はやく進んでいるか（HUDの「⏩ 1.5x」と、1コマごとの時計の進め方に使う）
     遊んでいる最中でなければ、かならず false（結果の画面に「⏩ 1.5x」が残らない） */
  const isSecretPathBoosting = computed(() => isSecretPathPlaying.value && (isSecretPathKeyBoosting.value || isSecretPathPointerBoosting.value));

  /* 枝に当たった直後かどうか（「いたっ！」を出しているあいだ。見た目だけで、動きは止めない） */
  const isSecretPathBumped = computed(() => isSecretPathPlaying.value && secretPathElapsed.value < secretPathBumpUntil.value);

  /* 木漏れ日を取った直後かどうか（「✨ +1」と光を出しているあいだ） */
  const isSecretPathSparkling = computed(() => isSecretPathPlaying.value && secretPathElapsed.value < secretPathSparkleUntil.value);

  /* いま光らせているレーン（道をクリック・タップした直後だけ。それ以外は null） */
  const secretPathFlashLane = computed(() => (isSecretPathPlaying.value && secretPathElapsed.value < secretPathTapUntil.value ? secretPathTapLane.value : null));

  /* マウスを乗せているレーンを押したときに、こうちゃんが動く先のレーン

     押したレーンの方向へ1レーンだけ動くので、遠いレーンに乗せているときは「まん中」が動く先になる
     乗せていない・いまいるレーンに乗せているときは null（目印をはっきりさせない） */
  const secretPathHoverDestination = computed(() => {
    const hoverLane = secretPathHoverLane.value;
    const currentLane = secretPathPlayerLane.value;

    if (!isSecretPathPlaying.value || hoverLane === null || hoverLane === currentLane) {
      return null;
    }

    return hoverLane < currentLane ? currentLane - 1 : currentLane + 1;
  });

  /* 残り時間（秒）。「あと 12秒」のように出す */
  const secretPathTimeLeft = computed(() => Math.max(0, Math.ceil((secretPathDuration - secretPathElapsed.value) / 1000)));

  /* 集めた木漏れ日の数に合わせた、結果の文章 */
  const secretPathResultText = computed(() => getSecretPathResultText(secretPathSunlightCount.value));

  /* requestAnimationFrame のループを止める（予約が無ければ何もしない） */
  function stopSecretPathLoop() {
    if (secretPathFrameId !== null) {
      cancelAnimationFrame(secretPathFrameId);
      secretPathFrameId = null;
    }

    secretPathLastTimestamp = null;
  }

  /* 秘密の小道を、はじまる前の状態に戻す

     ループ・流れてくるもの・木漏れ日の数・こうちゃんの位置・時計を、まとめて片づける
     （hasDiscoveredSecretSpot はここでは戻さない。戻すのは resetGame() だけ） */
  function resetSecretPathGame() {
    stopSecretPathLoop();
    releaseSecretPathControls();

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
  }

  /* 「小道へ進む」（ミニゲームを始める）

     押すまでは何も動かないので、プレイヤーは説明を読んでから始められる */
  function startSecretPathGame() {
    if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'ready') {
      return;
    }

    // 決定音「ポン♪」
    playDecisionSound();

    resetSecretPathGame();
    secretPathSpawnQueue = buildSecretPathSpawnQueue();
    secretPathPhase.value = 'playing';

    secretPathFrameId = requestAnimationFrame(runSecretPathFrame);

    scrollSecretPathIntoView();
  }

  /* スマホ幅のときだけ、遊ぶカードを画面のいちばん上へスクロールする

     スマホ幅ではページ全体がスクロールするので、
     フィールドと下の案内がいっしょに見える位置へ合わせておく
     （パソコンでは中央エリアの中に収まるので、何もしない） */
  async function scrollSecretPathIntoView() {
    if (!import.meta.client || !window.matchMedia('(max-width: 700px)').matches) {
      return;
    }

    // カードが画面に出るのを待ってから
    await nextTick();

    secretPathPlayRef.value?.scrollIntoView({ block: 'start' });
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

    /* 前のコマからの時間

       50ミリ秒より長くあいたときは、50ミリ秒ぶんだけ進める
       処理が重くなったときなどに、枝がこうちゃんを「すり抜けて」しまわないようにするため */
    const delta = secretPathLastTimestamp === null ? 0 : Math.min(Math.max(timestamp - secretPathLastTimestamp, 0), 50);

    secretPathLastTimestamp = timestamp;

    /* はやく進んでいるあいだは、ゲームの時計そのものを1.5倍で進める
       出てくるタイミング・流れる速さ・残り時間・「いたっ！」などの長さが、ぜんぶ同じ時計でそろって速くなる
       （1コマで進むのは最大 50 × 1.5 = 75ミリ秒。枝が進むのは4.5%で、当たり判定の幅10%より小さいので すり抜けない） */
    advanceSecretPath(isSecretPathBoosting.value ? delta * secretPathBoostMultiplier : delta);

    // 時間切れで終わっていなければ、次のコマを予約する
    if (isSecretPathPlaying.value) {
      secretPathFrameId = requestAnimationFrame(runSecretPathFrame);
    }
  }

  /* ゲームの時計を delta ミリ秒進めて、出す・動かす・当たりを見る・片づける */
  function advanceSecretPath(delta: number) {
    const elapsed = Math.min(secretPathElapsed.value + delta, secretPathDuration);

    secretPathElapsed.value = elapsed;

    // ① 予定の時間になったものを、フィールドのいちばん上に出す
    let nextSpawn = secretPathSpawnQueue[0];

    while (nextSpawn && nextSpawn.at <= elapsed) {
      secretPathSpawnQueue.shift();
      secretPathNextItemId += 1;
      secretPathItems.value.push({ id: secretPathNextItemId, kind: nextSpawn.kind, lane: nextSpawn.lane, y: secretPathSpawnY, hit: false });
      nextSpawn = secretPathSpawnQueue[0];
    }

    // ② ぜんぶ下へ進めて、こうちゃんに当たったかを見る
    const distance = (secretPathSpeed * delta) / 1000;
    let needsCleanup = false;

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

      // ③ 木漏れ日：こうちゃんに重なったら取る（枝より少しゆるめに見る）
      if (item.kind === 'sunlight' && offset >= -10 && offset <= 6) {
        item.hit = true;
        needsCleanup = true;

        secretPathSunlightCount.value += 1;
        secretPathSparkleUntil.value = elapsed + secretPathSparkleDuration;
        secretPathSparkleId.value += 1;

        // 「✨ +1」と「いたっ！」は同じ場所（こうちゃんの上）に出るので、
        // 重なって読めなくならないように、あとから起きたほうだけを出す
        secretPathBumpUntil.value = 0;

        playSunlightSound();
        continue;
      }

      // ④ 枝：こうちゃんの所まで来たら当たる → 集めた木漏れ日を1つ減らす（0より下にはしない）
      //    ・本編のステータス（体力・機嫌・余裕）には、いっさいさわらない（小道の中だけのペナルティ）
      //    ・枝1本につき1回だけ（item.hit）なので、同じ枝で何度も減ることはない
      //    ・当たったあとも、左右にはそのまま動ける
      if (item.kind === 'branch' && offset >= -7 && offset <= 3) {
        item.hit = true;

        const hasSunlightToLose = secretPathSunlightCount.value > 0;

        secretPathSunlightCount.value = Math.max(0, secretPathSunlightCount.value - 1);
        secretPathBumpLost.value = hasSunlightToLose;
        secretPathBumpUntil.value = elapsed + secretPathBumpEffectDuration;
        secretPathBumpId.value += 1;

        // 木漏れ日を取った直後の「✨ +1」が残っていたら消す（「いたっ！」と重ならないように、あとから起きたほうだけを出す）
        secretPathSparkleUntil.value = 0;

        playBranchBumpSound();
      }
    }

    // ⑤ 下へ出ていったものと、取った木漏れ日を片づける
    if (needsCleanup) {
      secretPathItems.value = secretPathItems.value.filter((item) => item.y <= secretPathRemoveY && !(item.kind === 'sunlight' && item.hit));
    }

    // ⑥ 15秒たったら、おしまい
    if (elapsed >= secretPathDuration) {
      finishSecretPathGame();
    }
  }

  /* 時間切れ（小道をぬけた）

     ここで「こもれびの広場を見つけた」ことになる
     このあと同じプレイのあいだは、ミニゲームをくり返さない */
  function finishSecretPathGame() {
    stopSecretPathLoop();
    releaseSecretPathControls();

    secretPathPhase.value = 'finished';
    secretPathItems.value = [];
    secretPathSpawnQueue = [];
    secretPathBumpUntil.value = 0;
    secretPathBumpLost.value = false;
    secretPathSparkleUntil.value = 0;
    secretPathFinishedAt = performance.now();

    /* 木漏れ日ボーナス

       ・addOutingPoint() ではなく、そのまま足す
         （「2回目の場所は半分」は場所の探検のためのルールで、小道は場所ではないため）
       ・上部ステータスの「おでかけポイント」の横にも +3 と出るように、今回の変化にも入れておく
         ほかのステータスと時間は動かしていないので 0 のまま（上部には何も出ない）
         statusChanges は、広場へ入るとき goToPlace() の中で null に戻る
       ・時間切れは1回の小道につき1回だけなので、ボーナスが二重に入ることはない */
    const bonusPoint = getSecretPathBonusPoint(secretPathSunlightCount.value);

    secretPathBonusPoint.value = bonusPoint;

    if (bonusPoint > 0) {
      outingPoint.value += bonusPoint;
      statusChanges.value = { childEnergy: 0, childMood: 0, outingPoint: bonusPoint, parentEnergy: 0, parentCalm: 0, minutes: 0 };
    }

    hasDiscoveredSecretSpot.value = true;

    // 「先へ進む」だけの画面になるので、選択中のコマンドを一番上（0）に戻す
    selectedCommandIndex.value = 0;

    // 「木々のすき間から、まぶしい光が…」に合わせて、キラリン♪
    playItemSound();
  }

  /* 「先へ進む」（こもれびの広場へ）

     BGMの入れかえ（公園BGMを止める → こもれびの広場BGM）は、goToPlace() の中のまま
     ＝ 広場へ着いたこの瞬間に「こもれびの奥で」が始まる */
  function enterSecretSpotFromPath() {
    if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'finished') {
      return;
    }

    if (performance.now() - secretPathFinishedAt < secretPathLeaveGuard) {
      return;
    }

    goToPlace('secretSpot');

    /* 小道の状態は、画面が変わってから片づける
       <Transition> で消えていく小道の画面は、もう描きなおされないので、
       フェードアウトの途中で結果の文章が変わって見えることはない */
    resetSecretPathGame();
  }

  /* 「← 場所選びにもどる」（はじまる前だけ。公園入口の「どこへ行く？」へ戻る）

     小道に入らずに引き返すだけなので、何も変えない
     ・時間・親子のステータス・おでかけポイント・アイテム・visitedPlaces は、そのまま
     ・hasDiscoveredSecretSpot も false のまま
       → あとでもう一度「細い道の先」を選ぶと、また ready 画面から始まる
     ・BGMは公園BGMのまま（goToPlace() がBGMを入れかえるのは secretSpot のときだけ）
     ・小道の状態は、画面が変わってから片づける（enterSecretSpotFromPath() と同じ）
     ・カーソルは「細い道の先」に合わせる（restoreEntranceCursor()。小道へ入るときに lastSelectedPlace が secretPath になっている） */
  function leaveSecretPathToEntrance() {
    if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'ready') {
      return;
    }

    goToPlace('parkEntrance');
    resetSecretPathGame();
    restoreEntranceCursor();
  }

  /* こうちゃんを左（-1）か右（+1）へ、1レーンだけ動かす

     ・遊んでいる最中でなければ動かさない
     ・枝に当たった直後も、ふつうに動ける（枝のペナルティは木漏れ日 -1 だけ）
     ・左はしでさらに左、右はしでさらに右は、その場のまま */
  function moveSecretPathPlayer(direction: -1 | 1) {
    if (!isSecretPathPlaying.value) {
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

  /* はやく進む・ポインターを押している状態を、ぜんぶ元に戻す

     キーをはなしたこと（keyup）や、指をはなしたこと（pointerup）が届かないときでも、
     はやいまま・押したままの扱いが残らないように、次のときにかならず呼ぶ
     ・時間が終わったとき（finishSecretPathGame()）
     ・リセットしたとき（resetSecretPathGame()）
     ・ウィンドウからフォーカスが外れた・タブが見えなくなったとき
     ・ページから離れたとき（onUnmounted）
     ・なにかの理由で「小道で遊んでいる最中」ではなくなったとき（runSecretPathFrame()） */
  function releaseSecretPathControls() {
    isSecretPathKeyBoosting.value = false;
    releaseSecretPathPointer();
  }

  /* ポインター（マウス・指・ペン）を押している状態だけを、元に戻す */
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
    secretPathPointerLastX = 0;
    secretPathPointerDragged = false;
    secretPathPointerHeld = false;
    isSecretPathPointerBoosting.value = false;
  }

  /* フィールドのポインター操作（マウス・指・ペンを Pointer Events でまとめて受け取る）

     ■ 短く押す（クリック・タップ）
       押したレーンの方向へ、1レーンだけ動く（← → キーと同じ「1回で1レーン」）
       左はしで右はしのレーンを押すと まん中へ、もう1回押すと右はしへ
       （いっきに2レーン動けると、まん中のレーンの枝をすり抜けられて、道を押す操作だけ有利になるため）
       長押し・ドラッグと見分けるため、動かすのは はなしたとき（pointerup）

     ■ 押したまま横へ動かす（しきい値をこえるたびに1レーン）
       しきい値はマウスと指で分けてある（→ getSecretPathSwipeThreshold）
       ・マウス             … ドラッグ。70pxこえるたびに1レーンずつ動く（左はし → まん中 → 右はし）
       ・指・ペン           … フリック。32pxで1レーン。1回押すあいだに1レーンだけ（大きくはらっても、まん中で止まる）
       ・長押しになったあと … 指・ペンでも、スライドでこえるたびに1レーンずつ動ける
       長押しになる前に横へ動いたら、長押しの判定はやめる（フリック・ドラッグとして扱う）

     ■ 長押し（secretPathHoldBoostDelay だけ押しつづける）
       はなすまで、はやく進む（ゲームの時計が1.5倍）

     ※ setPointerCapture … 押したままフィールドの外へ出ても、pointerup / pointercancel を受け取るため
     ※ 最初に押したポインターだけで操作する（2本目の指は使わない） */
  function handleSecretPathPointerDown(event: PointerEvent) {
    // 右クリックなど、遊んでいる最中以外では動かさない
    if (event.button !== 0 || !isSecretPathPlaying.value) {
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
    secretPathPointerDownLane = getSecretPathLaneAt(field, event.clientX, event.clientY);
    secretPathPointerLastX = event.clientX;

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
    // マウスを乗せているレーン（動く先の目印をはっきりさせるため。指には「乗せる」が無いので、マウスのときだけ）
    if (event.pointerType === 'mouse') {
      secretPathHoverLane.value = getSecretPathLaneAt(event.currentTarget as HTMLElement, event.clientX, event.clientY);
    }

    if (event.pointerId !== secretPathPointerId || !isSecretPathPlaying.value) {
      return;
    }

    swipeSecretPathPlayer(event);
  }

  function handleSecretPathPointerUp(event: PointerEvent) {
    if (event.pointerId !== secretPathPointerId) {
      return;
    }

    if (isSecretPathPlaying.value) {
      // pointermove が届く前に はなした、すばやいフリックも拾う
      swipeSecretPathPlayer(event);

      // 横へ動かさず、長押しにもならなかった → 短いクリック・タップ
      if (!secretPathPointerDragged && !secretPathPointerHeld) {
        tapSecretPathLane(secretPathPointerDownLane);
      }
    }

    releaseSecretPathPointer();
  }

  /* キャンセルされたとき（ブラウザがジェスチャーを引き取った など）は、動かさずに元へ戻すだけ */
  function handleSecretPathPointerCancel(event: PointerEvent) {
    if (event.pointerId !== secretPathPointerId) {
      return;
    }

    releaseSecretPathPointer();
  }

  function handleSecretPathPointerLeave(event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      secretPathHoverLane.value = null;
    }
  }

  /* 押したまま横へ、しきい値より大きく動いていたら、その方向へ1レーンだけ動かす */
  function swipeSecretPathPlayer(event: PointerEvent) {
    const distance = event.clientX - secretPathPointerLastX;

    if (Math.abs(distance) < getSecretPathSwipeThreshold(event.pointerType)) {
      return;
    }

    // 指・ペンのフリックは、1回押すあいだに1レーンだけ（長押しになったあとのスライドと、マウスのドラッグは何度でも）
    const canMoveAgain = event.pointerType === 'mouse' || secretPathPointerHeld;

    if (secretPathPointerDragged && !canMoveAgain) {
      return;
    }

    // 長押しになる前に横へ動いたら、長押しにはしない
    if (secretPathHoldTimer !== null) {
      clearTimeout(secretPathHoldTimer);
      secretPathHoldTimer = null;
    }

    secretPathPointerDragged = true;
    secretPathPointerLastX = event.clientX;

    const laneBefore = secretPathPlayerLane.value;

    moveSecretPathPlayer(distance < 0 ? -1 : 1);

    // 動いた先のレーンを一瞬光らせる（はしで動けなかったときは光らせない）
    if (secretPathPlayerLane.value !== laneBefore) {
      secretPathTapLane.value = secretPathPlayerLane.value;
      secretPathTapUntil.value = secretPathElapsed.value + secretPathTapFlashDuration;
    }
  }

  /* 短く押したレーンの方向へ、1レーンだけ動かす（いまいるレーンを押したときは、何もしない・光らせもしない）
     押したレーンを一瞬光らせて、どこを押したかが目で分かるようにする */
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

     ・← / A … 左へ1レーン
     ・→ / D … 右へ1レーン
     ・↑ / Space … 押しているあいだだけ、はやく進む（はなすと handleSecretPathKeyup() で元の速さに戻る）
     ・↓ / Enter … 何もしない（ページのスクロールや、ボタンの押しまちがいを止めるだけ）
     ・それ以外（Tab など）… ブラウザのふつうの動きにまかせる

     ※ ← → は押しっぱなし（event.repeat）では続けて動かさない（1回押すと1レーン）
     ※ ↑ は押しっぱなしで何度届いても、はやいままでよい
     ※ Space は押しっぱなし（event.repeat）では、はやく進みはじめない
       「小道へ進む」を Space で押したまま離さないと、はじまった瞬間から
       はやく進んでしまうため。押しなおせば、はやく進む
     ※ はじまる前・終わったあとは、ここへは来ない（ふつうのコマンド操作に戻る） */
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

  /* 小道の外でも受け取らないと困るできごとを、ここで登録する（片づけも同じ場所で）

     ・keyup            … ↑ / Space をはなしたら、はやく進むのをやめる
     ・blur             … ウィンドウからフォーカスが外れたら、はやい・押している状態を戻す
     ・visibilitychange … タブが見えなくなったら、同じように戻す

     pages/index.vue の onMounted / onUnmounted にあったものを、そのまま持ってきている
     （イベントの種類・対象・登録するタイミングは、どれも変えていない）

     ※ ↑↓←→ などの、ふつうのコマンド操作のキーは composables/useKeyboardControls.ts のまま
       遊んでいる最中のキーは、あちらから handleSecretPathKeydown() が呼ばれる */
  onMounted(() => {
    window.addEventListener('keyup', handleSecretPathKeyup);
    window.addEventListener('blur', handleSecretPathWindowBlur);
    document.addEventListener('visibilitychange', handleSecretPathVisibilityChange);
  });

  onUnmounted(() => {
    window.removeEventListener('keyup', handleSecretPathKeyup);
    window.removeEventListener('blur', handleSecretPathWindowBlur);
    document.removeEventListener('visibilitychange', handleSecretPathVisibilityChange);

    // requestAnimationFrame も止めておく
    // はやく進む・押している状態と、長押しを待つ予約も片づける
    stopSecretPathLoop();
    releaseSecretPathControls();
  });

  /* 返すのは、画面（template）・コマンドの数え方・キーボード操作から使うものだけ
     ゲームの時計・演出の残り時間・ポインターの一時的な状態などは、ここの中だけで完結する */
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
    secretPathPlayRef,

    /* ===== 画面に出す、計算した状態 ===== */
    isSecretPathPlaying,
    isSecretPathBoosting,
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
