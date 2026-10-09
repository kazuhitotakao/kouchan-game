/* ============================================================
   ゲームが終わったあとの結果（リザルト・GAME OVER・S+の曲の解放）の状態

   ■ ここがやること
     ・総合スコアと内訳・ランク・見出し・文章を決めて持っておく（judgeResult()）
     ・S+ランクなら、うた入りBGMを解放して、お知らせを出すか決める（unlockSPlusSongIfEarned()）
     ・A／Sランクで まだ解放していない人に、「S+に なにかあるみたい」のヒントを出す（isSPlusSongHintVisible）
     ・GAME OVER画面に出す文章の入れものを持つ（入れるのは pages/index.vue の checkGameOver()）
     ・ゴール・GAME OVER のたびに記録を残して、ハイスコアと直近の記録を持っておく（recordGameResult()）

   ■ ここがやらないこと
     ・点数・ランク・文章の計算（composables/useScore.ts）
     ・S+の曲の解放判定と localStorage の読み書き（utils/sPlusSong.ts）
     ・ハイスコアの決めかたと、記録の localStorage の読み書き（utils/gameRecords.ts）
     ・GAME OVERの判定・ゴールへ向かう流れと、関数を呼ぶ順番（pages/index.vue）
   ============================================================ */

import { computed, onMounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import { calculateScore, judgeEnding } from '~/composables/useScore';
import { fussMoodLine, playedALotLine, totalPlaceCount } from '~/data/game';
import { addGameRecord, loadGameRecords } from '~/utils/gameRecords';
import { formatMinutesToTime } from '~/utils/gameTime';
import { judgeSPlusSongUnlock, loadHasUnlockedSPlusSong, saveSPlusSongUnlocked, shouldShowSPlusSongHint } from '~/utils/sPlusSong';
import { markNewSoundtrackTrack } from '~/utils/soundtrackNew';
import type { GameEvent, GameRecord, GameRecordResult, ScoreBreakdownItem } from '~/types/game';

/* ============================================================
   最初の状態（初期値）

   入れものを作るときと、resetGameResult() で戻すときの両方が、ここの値を見る
   ※ スコアの内訳は、ここに置かない（同じ配列を使いまわすと、前のプレイとつながってしまうので、毎回作りなおす）
   ============================================================ */
const initialFinalScore: number = 0; // 今回のプレイの総合スコア（0〜100点）
const initialEndingRank: string = ''; // ゴールしたときのランク名
const initialEndingTitle: string = ''; // ゴールしたときの見出し
const initialEndingMessage: string = ''; // ゴールしたときの文章
const initialGameOverTitle: string = ''; // GAME OVERになった理由の見出し
const initialGameOverMessage: string = ''; // GAME OVERになった理由の文章
const initialHasUnlockedSPlusSong: boolean = false; // うた入りBGMを、このブラウザで解放済みか
const initialIsSPlusSongNewlyUnlocked: boolean = false; // 今回のゴールで、はじめて解放したか
const initialIsHighScoreUpdated: boolean = false; // 今回のゴールで、ハイスコアを更新したか

export type UseGameResultOptions = {
  /* ===== ゴールしたときのステータス（ゴールした瞬間の値を読みたいので、ref のまま受けとる） ===== */
  childEnergy: Ref<number>;
  childMood: Ref<number>;
  parentEnergy: Ref<number>;
  parentCalm: Ref<number>;
  outingPoint: Ref<number>;
  currentMinutes: ComputedRef<number>;

  /* ===== ゲームの進みぐあい ===== */
  tantrumCount: Ref<number>;
  visitedPlaces: Ref<GameEvent[]>;
  playCount: Ref<number>;
  collectedItems: Ref<string[]>;

  /* 0〜100に収める処理（pages/index.vue のものを渡してもらう。ここにも書くと、直すところが2か所になるため） */
  keepInRange: (value: number) => number;
};

export function useGameResult(options: UseGameResultOptions) {
  const { childEnergy, childMood, parentEnergy, parentCalm, outingPoint, currentMinutes, tantrumCount, visitedPlaces, playCount, collectedItems, keepInRange } = options;

  const endingRank = ref(initialEndingRank);
  const endingTitle = ref(initialEndingTitle);
  const endingMessage = ref(initialEndingMessage);

  /* S+ランク限定の「うた入りエンディングBGM」を、このブラウザで解放済みか（localStorage にも保存する）
     ※ ゲームのステータスではなく「実績」なので、もう一度あそぶときも戻さない */
  const hasUnlockedSPlusSong = ref(initialHasUnlockedSPlusSong);

  /* 今回のゴールで、このブラウザではじめて解放したか（true のときだけ「✨ 新しい曲が追加されました！」を出す） */
  const isSPlusSongNewlyUnlocked = ref(initialIsSPlusSongNewlyUnlocked);

  /* リザルト画面に「🔒 S+ランクを とると、なにかあるみたい…」のヒントを出すか（どのランクで出すかは shouldShowSPlusSongHint()）

     本編だけで遊んでいる人には、S+ランクがあること自体が見えないので、「あと少し」が伝わるA／Sのときに知らせる
     ランクと解放済みかどうかから毎回決まるだけなので computed（リザルト画面から出ると、自然に消える） */
  const isSPlusSongHintVisible = computed(() => shouldShowSPlusSongHint(endingRank.value, hasUnlockedSPlusSong.value));

  /* 今回のプレイの総合スコア（0〜100点。まだゴールしていないときは0） */
  const finalScore = ref(initialFinalScore);

  /* スコアの内訳（「何で何点もらったのか」を1行ずつ） */
  const scoreBreakdown = ref<ScoreBreakdownItem[]>([]);

  /* GAME OVERになった理由（入れるのは pages/index.vue の checkGameOver()。ここは入れものを持つだけ） */
  const gameOverTitle = ref(initialGameOverTitle);
  const gameOverMessage = ref(initialGameOverMessage);

  /* ===== これまでの記録（localStorage にも保存する。読み書きは utils/gameRecords.ts） =====
     ※ ハイスコアと直近の記録は、ゲームのステータスではなく「実績」なので、もう一度あそぶときも戻さない */

  /* ハイスコアのプレイ（まだゴールしたことがないときは null。B画面とリザルト画面に出す） */
  const highScoreRecord = ref<GameRecord | null>(null);

  /* 直近の記録（新しい順。GAME OVER も入る） */
  const recentRecords = ref<GameRecord[]>([]);

  /* 今回のプレイの記録（直近の記録で「今回」の印を付ける。まだ終わっていないときは null）
     null でないあいだは、このプレイの記録はもう残してある（recordGameResult() が2回目を残さない目印にもなる） */
  const currentRecord = ref<GameRecord | null>(null);

  /* 今回のゴールで、前のハイスコアをこえたか（true のときだけ「🏆 ハイスコア更新！」を出す。はじめての記録では false） */
  const isHighScoreUpdated = ref(initialIsHighScoreUpdated);

  /* 今回より前のハイスコアと、今回の1つ前の記録（リザルト画面の「ハイスコア 88点 ／ 前回 72点」に使う） */
  const previousHighScoreRecord = ref<GameRecord | null>(null);
  const previousRecord = ref<GameRecord | null>(null);

  /* 総合スコアと、その内訳を作る（計算は useScore.ts の calculateScore()。ここは答えを入れるだけ） */
  function calculateFinalScore() {
    const { totalScore, breakdown } = calculateScore({
      outingPoint: outingPoint.value,
      hasVisitedSecretSpot: visitedPlaces.value.includes('secretSpot'),
      collectedItemCount: collectedItems.value.length,
      currentMinutes: currentMinutes.value,
      parentEnergy: parentEnergy.value,
      childMood: childMood.value,
      childEnergy: childEnergy.value,
      parentCalm: parentCalm.value,
      tantrumCount: tantrumCount.value,
      keepInRange,
    });

    scoreBreakdown.value = breakdown;
    finalScore.value = totalScore;
  }

  /* ゴールしたときの成績（ランク・見出し・文章）を決める（決めるのは useScore.ts の judgeEnding()）
     総合スコアは、特殊エンドでも表示するので、いちばん先に計算する
     ※ GAME OVERのときは呼ばれない */
  function judgeResult() {
    calculateFinalScore();

    const { rank, title, message } = judgeEnding({
      totalScore: finalScore.value,
      tantrumCount: tantrumCount.value,
      childEnergy: childEnergy.value,
      childMood: childMood.value,
      parentEnergy: parentEnergy.value,
      parentCalm: parentCalm.value,
      currentMinutes: currentMinutes.value,
      visitedPlaceCount: visitedPlaces.value.length,
      playCount: playCount.value,
      fussMoodLine,
      totalPlaceCount,
      playedALotLine,
    });

    endingRank.value = rank;
    endingTitle.value = title;
    endingMessage.value = message;
  }

  /* S+ランクになったら、うた入りエンディングBGMをサウンドトラックに解放する（judgeResult() のあとに呼ぶ）
     このブラウザではじめてなら、お知らせを出して保存する（曲そのものは、S+ランクなら毎回流す） */
  function unlockSPlusSongIfEarned() {
    // 前のゴールのお知らせが残らないように、まず消しておく
    isSPlusSongNewlyUnlocked.value = false;

    const result = judgeSPlusSongUnlock(endingRank.value, hasUnlockedSPlusSong.value);

    if (result === 'none') {
      return;
    }

    hasUnlockedSPlusSong.value = true;

    if (result === 'newlyUnlocked') {
      isSPlusSongNewlyUnlocked.value = true;
      saveSPlusSongUnlocked();

      // サウンドトラックの曲のカードと、A画面の「♪ サウンドトラック」に NEW を出す
      markNewSoundtrackTrack('s-plus');
    }
  }

  /* 今回のプレイの記録を残す（ハイスコアを更新したかも、ここで決まる）

     ・ゴールは judgeResult() のあと、GAME OVER は理由の文を入れたあとに呼ぶ（点数・ランク・見出しを、そのまま記録に入れるため）
     ・リザルト画面のままアプリを閉じても残るよう、「もう一度あそぶ」まで待たずに、終わった時点で保存する
     ・1回のプレイで1回だけ（いまの流れでは2回は来ないが、同じプレイを2件残さないための保険） */
  function recordGameResult(result: GameRecordResult) {
    if (currentRecord.value !== null) {
      return;
    }

    const isGoal = result === 'goal';

    const record: GameRecord = {
      playedAt: Date.now(),
      result,
      score: isGoal ? finalScore.value : null,
      rank: isGoal ? endingRank.value : null,
      title: isGoal ? endingTitle.value : gameOverTitle.value,
      returnTime: formatMinutesToTime(currentMinutes.value),
      childEnergy: childEnergy.value,
      childMood: childMood.value,
      parentEnergy: parentEnergy.value,
      parentCalm: parentCalm.value,
      outingPoint: outingPoint.value,
      tantrumCount: tantrumCount.value,
      visitedPlaceCount: visitedPlaces.value.length,
      playCount: playCount.value,
      collectedItemCount: collectedItems.value.length,
    };

    const saved = addGameRecord(record);

    currentRecord.value = record;
    highScoreRecord.value = saved.best;
    recentRecords.value = saved.recent;
    isHighScoreUpdated.value = saved.isHighScoreUpdated;
    previousHighScoreRecord.value = saved.previousBest;
    previousRecord.value = saved.previousRecord;
  }

  /* ここで持っている状態を、最初の状態へ戻す（もう一度あそぶとき）
     ※ hasUnlockedSPlusSong・ハイスコア・直近の記録は戻さない（実績なので） */
  function resetGameResult() {
    endingRank.value = initialEndingRank;
    endingTitle.value = initialEndingTitle;
    endingMessage.value = initialEndingMessage;

    isSPlusSongNewlyUnlocked.value = initialIsSPlusSongNewlyUnlocked;

    finalScore.value = initialFinalScore;
    scoreBreakdown.value = [];

    gameOverTitle.value = initialGameOverTitle;
    gameOverMessage.value = initialGameOverMessage;

    // 次のプレイは、まだ記録を残していない状態から
    currentRecord.value = null;
    isHighScoreUpdated.value = initialIsHighScoreUpdated;
    previousHighScoreRecord.value = null;
    previousRecord.value = null;
  }

  /* 前に解放しているか・これまでの記録を思い出す（サーバー側では localStorage を読めないので、onMounted で読む） */
  onMounted(() => {
    hasUnlockedSPlusSong.value = loadHasUnlockedSPlusSong();

    const { best, recent } = loadGameRecords();

    highScoreRecord.value = best;
    recentRecords.value = recent;
  });

  return {
    /* ===== ゴールしたときの成績（画面に出す） ===== */
    finalScore,
    scoreBreakdown,
    endingRank,
    endingTitle,
    endingMessage,

    /* ===== GAME OVER画面に出す文章（入れるのは checkGameOver()） ===== */
    gameOverTitle,
    gameOverMessage,

    /* ===== S+ランク限定のうた入りBGM ===== */
    hasUnlockedSPlusSong,
    isSPlusSongNewlyUnlocked,
    isSPlusSongHintVisible,

    /* ===== これまでの記録（ハイスコアと直近の記録） ===== */
    highScoreRecord,
    recentRecords,
    currentRecord,
    isHighScoreUpdated,
    previousHighScoreRecord,
    previousRecord,

    /* ===== ゴールしたときに呼ぶ（順番は goToGoal() が決める） ===== */
    judgeResult,
    unlockSPlusSongIfEarned,

    /* ===== ゴール・GAME OVERのときに呼ぶ ===== */
    recordGameResult,

    resetGameResult,
  };
}
