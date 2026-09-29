/* ============================================================
   ゲームが終わったあとの結果（リザルト・GAME OVER・S+の曲の解放）の状態

   ゲーム本編（pages/index.vue）にあった
   「ゴールしたあと・GAME OVERになったあとの画面に出すもの」の入れものと、
   そこへ入れるところだけを取り出してある

   ■ ここがやること
     ・総合スコアと内訳を作って持っておく（calculateFinalScore()）
     ・ランク・見出し・文章を決めて持っておく（judgeResult()）
     ・S+ランクなら、うた入りBGMを解放して、お知らせを出すか決める（unlockSPlusSongIfEarned()）
     ・A／Sランクなら、まだ解放していない人に「S+に なにかあるみたい」のヒントを出す（isSPlusSongHintVisible）
     ・GAME OVER画面に出す文章の入れものを持つ（入れるのは pages/index.vue の checkGameOver()）
     ・ここで持っている状態を、まとめて最初に戻す（resetGameResult()）

   ■ ここがやらないこと
     ・点数・ランク・文章の計算は composables/useScore.ts のまま
       （配点・境界値・エンディングの文章は、ぜんぶあちらにある。こちらへは書き写していない）
     ・S+の曲の解放判定と localStorage の読み書きは utils/sPlusSong.ts のまま
     ・GAME OVERの条件判定・BGM・画面の切りかえは pages/index.vue の checkGameOver() のまま
       ここは gameOverTitle / gameOverMessage の入れものを持つだけ
     ・ゴールへ向かう流れ（goToGoal()）も pages/index.vue のまま
       呼ぶ順番（judgeResult() → unlockSPlusSongIfEarned()）も、今までどおりあちらが決める
     ・1回の行動ごとの結果（resultMessage・statusChanges・見つけたもの・
       ちょっとしたできごと）は、ここには入れない。今までどおり pages/index.vue のもの

   ■ 計算のしかた・数字・文章・呼ぶ順番は、いっさい変えていない
     pages/index.vue にあったときと同じものを、同じ順番で呼んでいる

   ■ 初期値の置き場所は、このファイルの「最初の状態（初期値）」1か所だけ
     ref を作るときと、resetGameResult() で戻すときの両方がそこを見るので、
     同じ値を2か所に書いておく必要がない（composables/useGameState.ts と同じ考えかた）
   ============================================================ */

import { computed, onMounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import { calculateScore, judgeEnding } from '~/composables/useScore';
import { fussMoodLine, playedALotLine, totalPlaceCount } from '~/data/game';
import { judgeSPlusSongUnlock, loadHasUnlockedSPlusSong, saveSPlusSongUnlocked, shouldShowSPlusSongHint } from '~/utils/sPlusSong';
import type { GameEvent, ScoreBreakdownItem } from '~/types/game';

/* ============================================================
   最初の状態（初期値）

   ・useGameResult() を呼んで、入れものを作るとき
   ・「もう一度あそぶ」で最初に戻すとき（resetGameResult()）

   の両方が、ここに書いた値を見る
   初期値を変えたいときは、この場所だけを直せばよい

   ※ スコアの内訳（scoreBreakdown）は、ここに置いていない
     同じ配列を使いまわすと、戻したはずの中身が前のプレイとつながってしまうので、
     作るときも戻すときも、毎回からっぽの配列を作りなおす
     （composables/useGameState.ts の探検済みの場所・見つけたものと同じ考えかた）
   ============================================================ */
const initialFinalScore: number = 0; // 今回のプレイの総合スコア（0〜100点）
const initialEndingRank: string = ''; // ゴールしたときのランク名
const initialEndingTitle: string = ''; // ゴールしたときの見出し
const initialEndingMessage: string = ''; // ゴールしたときの文章
const initialGameOverTitle: string = ''; // GAME OVERになった理由の見出し
const initialGameOverMessage: string = ''; // GAME OVERになった理由の文章
const initialHasUnlockedSPlusSong: boolean = false; // うた入りBGMを、このブラウザで解放済みか
const initialIsSPlusSongNewlyUnlocked: boolean = false; // 今回のゴールで、はじめて解放したか

export type UseGameResultOptions = {
  /* ===== ゴールしたときのステータス（持ち主は composables/useGameState.ts） =====
     ゴールした瞬間の値を読みたいので、値ではなく ref のまま受けとる */
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

  /* 0〜100に収める処理（pages/index.vue の keepInRange() をそのまま渡してもらう）
     同じ「0〜100」をここにも書いてしまうと、直すところが2か所になるため */
  keepInRange: (value: number) => number;
};

export function useGameResult(options: UseGameResultOptions) {
  /* 受けとったものを、今までと同じ名前で使えるようにしておく
     （こうすると、pages/index.vue にあったときのコードをそのまま動かせる） */
  const { childEnergy, childMood, parentEnergy, parentCalm, outingPoint, currentMinutes, tantrumCount, visitedPlaces, playCount, collectedItems, keepInRange } = options;

  /* ゴールしたときのランクと判定メッセージ */
  const endingRank = ref(initialEndingRank);
  const endingTitle = ref(initialEndingTitle);
  const endingMessage = ref(initialEndingMessage);

  /* S+ランク限定の「うた入りエンディングBGM」を、このブラウザで解放済みかどうか

     一度でもS+ランクを取ると true になり、localStorage にも保存される
     （保存のしくみは utils/sPlusSong.ts。サウンドトラックのページも同じものを使う）

     ※ 体力や機嫌とちがって「ゲームのステータス」ではなく「実績・解放情報」なので、
       resetGameResult（もう一度あそぶ／はじめの画面へ戻る）では false に戻さない
       （サウンドの設定 soundEnabled と同じあつかい）
     ※ 前に解放しているかは、下の onMounted で localStorage から思い出す
  */
  const hasUnlockedSPlusSong = ref(initialHasUnlockedSPlusSong);

  /* 今回のゴールで、うた入りBGMを「このブラウザではじめて」解放したかどうか

     true のときだけ、リザルト画面に「✨ サウンドトラックに新しい曲が追加されました！」を出す
     2回目以降のS+では出さない（曲そのものは毎回流す）
     こちらはその1プレイだけの表示なので、resetGameResult() で false に戻す
  */
  const isSPlusSongNewlyUnlocked = ref(initialIsSPlusSongNewlyUnlocked);

  /* リザルト画面に「🔒 S+ランクを とると、なにかあるみたい…」のヒントを出すかどうか

     A／Sランクで、まだ うた入りBGMを解放していないときだけ true になる
     （どのランクで出すか・なぜAとSだけなのかは utils/sPlusSong.ts の shouldShowSPlusSongHint()）

     ■ なぜヒントを出すのか
       サウンドトラックのページには「🔒 ？？？ / S+ランクで解放」が出ているが、
       本編だけで遊んでいる人には、S+ランクがあること自体が見えない
       A／Sを出した直後は「あと少し」がいちばん伝わる場面なので、そこで知らせる

     ■ ここは ref ではなく computed
       ランクと「解放済みかどうか」から毎回決まるだけの値なので、
       ゴールのたびに入れたり、resetGameResult() で戻したりする必要がない
       （リザルト画面から出ると endingRank が空に戻るので、ヒントも自然に消える）
  */
  const isSPlusSongHintVisible = computed(() => shouldShowSPlusSongHint(endingRank.value, hasUnlockedSPlusSong.value));

  /* 今回のプレイの総合スコア（0〜100点）
     ゴールしたときに calculateFinalScore() で計算して入れる
     まだゴールしていないときは0
  */
  const finalScore = ref(initialFinalScore);

  /* スコアの内訳
     「何で何点もらったのか」を1行ずつためておいて、結果画面に並べる
     ゴールするたびに calculateFinalScore() の中で空に戻す
  */
  const scoreBreakdown = ref<ScoreBreakdownItem[]>([]);

  /* GAME OVERになった理由（GAME OVER画面に出す文章）
     まだGAME OVERになっていないときは、どちらも空っぽ

     ※ 入れるのは pages/index.vue の checkGameOver()（条件判定・BGM・画面の切りかえと同じ場所）
       ここは入れものを持って、resetGameResult() で空に戻すだけ
  */
  const gameOverTitle = ref(initialGameOverTitle);
  const gameOverMessage = ref(initialGameOverMessage);

  /* 総合スコア（0〜100点）と、その内訳を作る

     点数の計算そのものは composables/useScore.ts の calculateScore() にある
     ここは「いまの状態を渡して、返ってきた答えを入れる」だけ
     （配点・ボーナス・減点の数字は、ぜんぶあちらにまとめてある）
  */
  function calculateFinalScore() {
    const { totalScore, breakdown } = calculateScore({
      outingPoint: outingPoint.value,
      // pages/index.vue の isVisited('secretSpot') と同じ（あちらも visitedPlaces に入っているかを見ているだけ）
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

  /* ゴールしたときの成績（ランク・見出し・文章）を決める

     ① 総合スコアを計算する（特殊エンドでもスコアは表示するので、いちばん先に呼ぶ）
     ② ランクと文章は composables/useScore.ts の judgeEnding() が決める
        （いやいや3回以上の特殊エンド、S+ / S / A / B / C / D の境目や、
          同じランクの中での文章の出しわけも、ぜんぶあちらにある）

     ※ GAME OVERのときは goToGoal() が先に return するので、この関数は呼ばれない
     ※ S+の曲の解放（localStorageへの保存）は、このあとの unlockSPlusSongIfEarned() が受けもつ
  */
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

  /* S+ランクになったら、うた入りエンディングBGMをサウンドトラックに解放する

     ・S+ランクでなければ、何もしない（Sランク・特殊エンドなどでは解放しない）
     ・このブラウザではじめての解放なら、リザルト画面に「新しい曲が追加されました！」を出す
     ・すでに解放済みなら、お知らせは出さない
       （うた入りの曲そのものは、解放済みかどうかに関係なく、S+ランクなら毎回流す → getResultBgmSrc）

     ※ 解放したかどうかは、ゲームの記録とは別の「実績」として localStorage に残す
       もう一度あそんでも、ブラウザを閉じても、ロックには戻らない

     ※ judgeResult() でランクが決まったあとに呼ぶこと（→ goToGoal）
  */
  function unlockSPlusSongIfEarned() {
    // 前のゴールのお知らせが残らないように、まず消しておく
    isSPlusSongNewlyUnlocked.value = false;

    // 解放するかどうかの判定は utils/sPlusSong.ts の judgeSPlusSongUnlock()
    const result = judgeSPlusSongUnlock(endingRank.value, hasUnlockedSPlusSong.value);

    // S+ランクではないので、何もしない
    if (result === 'none') {
      return;
    }

    hasUnlockedSPlusSong.value = true;

    // このブラウザで、はじめての解放（お知らせを出して、解放したことを保存する）
    if (result === 'newlyUnlocked') {
      isSPlusSongNewlyUnlocked.value = true;
      saveSPlusSongUnlocked();
    }
  }

  /* ここで持っている状態を、ぜんぶ最初の状態へ戻す（「もう一度あそぶ」用）

     戻すのは、この composable が持っているものだけ
     1回の行動ごとの結果（resultMessage・statusChanges など）・いやいや・秘密の小道・
     画面の状態・音は、今までどおり pages/index.vue の resetGame() が受けもつ

     ※ hasUnlockedSPlusSong だけは、ここでは戻さない
       「ゲームのステータス」ではなく「実績・解放情報」なので、
       もう一度あそんでも、はじめの画面へ戻っても、ロックには戻さないため
       （pages/index.vue の resetGame() にあったときも、戻していなかった）

     ※ スコアの内訳は、からっぽの配列を作りなおして入れかえる
       （前と同じ配列を使いまわして中身だけ消す、というやりかたはしない）
  */
  function resetGameResult() {
    endingRank.value = initialEndingRank;
    endingTitle.value = initialEndingTitle;
    endingMessage.value = initialEndingMessage;

    isSPlusSongNewlyUnlocked.value = initialIsSPlusSongNewlyUnlocked;

    finalScore.value = initialFinalScore;
    scoreBreakdown.value = [];

    gameOverTitle.value = initialGameOverTitle;
    gameOverMessage.value = initialGameOverMessage;
  }

  /* 前に うた入りBGMを解放しているかを思い出す

     （サーバー側では localStorage を読めないので、ブラウザで動く onMounted から読む）
     解放済みなら、次にS+を取っても「新しい曲が追加されました！」は出ない

     ※ pages/index.vue の onMounted にあったものを、そのまま持ってきている
       読む中身（import.meta.client のガードもふくめて）は utils/sPlusSong.ts のまま
  */
  onMounted(() => {
    hasUnlockedSPlusSong.value = loadHasUnlockedSPlusSong();
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

    /* ===== ゴールしたときに呼ぶ（順番は goToGoal() が決める） =====
       ※ calculateFinalScore() は judgeResult() の中から呼ぶので、外へは出していない */
    judgeResult,
    unlockSPlusSongIfEarned,

    /* ===== ここで持っている状態を、まとめて最初に戻す ===== */
    resetGameResult,
  };
}
