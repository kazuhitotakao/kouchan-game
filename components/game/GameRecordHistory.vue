<script setup lang="ts">
/* ============================================================
   「これまでの記録」（ハイスコアと、直近の記録）

   リザルト・GAME OVER・記録の画面（B画面の札から開く）で使う（表示するだけ。記録を残すのは composables/useGameResult.ts）

   ・いちばん上にハイスコア（まだゴールしたことがないときは出さない。記録の画面では、くわしく別に出すので出さない）
   ・その下に直近の記録を、新しい順に limit 件（リザルト画面では、長くなりすぎないよう保存している件数より少なくする）
   ・今回のプレイには「今回」、ハイスコアのプレイには 🏆 を付ける
   ============================================================ */

import { computed } from 'vue';

import type { GameRecord } from '~/types/game';
import { formatPlayedAt, formatRecordRank, formatRecordScore, getRecordRankTier, isLetterRank } from '~/utils/gameRecords';

const props = withDefaults(
  defineProps<{
    /* ハイスコアのプレイ（まだゴールしたことがないときは null） */
    highScoreRecord: GameRecord | null;

    /* 直近の記録（新しい順） */
    recentRecords: GameRecord[];

    /* 今回のプレイの記録（「今回」の印を付ける。まだ終わっていない・記録の画面では null） */
    currentRecord: GameRecord | null;

    /* 出す直近の記録の数（保存しているのは utils/gameRecords.ts の recentGameRecordLimit 件） */
    limit?: number;

    /* いちばん上のハイスコアの帯を出すか */
    showBest?: boolean;
  }>(),
  { limit: 5, showBest: true },
);

const shownRecords = computed(() => props.recentRecords.slice(0, props.limit));

/* 同じプレイの記録か（保存して読みなおすと別の入れものになるので、遊びおわった日時でくらべる） */
function isSameRecord(record: GameRecord, other: GameRecord | null) {
  return other !== null && record.playedAt === other.playedAt;
}
</script>

<template>
  <div class="record-history">
    <!-- ハイスコア（🏆 ハイスコア 10/5 ……… 88点 [S]）
         ランクは英字だけのバッジ（読み上げは「Sランク」） -->
    <p v-if="showBest && highScoreRecord" class="record-history__best">
      <span class="record-history__bestLabel">
        🏆 ハイスコア
        <span class="record-history__bestDate">{{ formatPlayedAt(highScoreRecord.playedAt) }}</span>
      </span>

      <span class="record-history__result">
        <b class="record-history__score">{{ formatRecordScore(highScoreRecord) }}</b>
        <span
          class="record-history__rank"
          :class="[`record-history__rank--${getRecordRankTier(highScoreRecord.rank ?? '')}`, { 'record-history__rank--text': !isLetterRank(highScoreRecord.rank ?? '') }]"
          role="img"
          :aria-label="highScoreRecord.rank ?? ''">
          {{ formatRecordRank(highScoreRecord.rank ?? '') }}
        </span>
      </span>
    </p>

    <!-- ハイスコアの帯と分けるための見出し（帯を出さないときは、外に見出しがあるので出さない） -->
    <p v-if="showBest" class="record-history__subtitle">直近の記録</p>

    <!-- 1行ずつ（［今回］10/7 14:32 ……… 🏆 72点 [A] ／ GAME OVER） -->
    <ol class="record-history__list">
      <li v-for="(record, index) in shownRecords" :key="`${record.playedAt}-${index}`" class="record-history__item">
        <span class="record-history__when">
          <span v-if="isSameRecord(record, currentRecord)" class="record-history__now">今回</span>
          {{ formatPlayedAt(record.playedAt) }}
        </span>

        <span class="record-history__result">
          <span v-if="isSameRecord(record, highScoreRecord)" class="record-history__bestMark" role="img" aria-label="ハイスコア">🏆</span>

          <template v-if="record.result === 'goal'">
            <b class="record-history__score">{{ formatRecordScore(record) }}</b>
            <span
              class="record-history__rank"
              :class="[`record-history__rank--${getRecordRankTier(record.rank ?? '')}`, { 'record-history__rank--text': !isLetterRank(record.rank ?? '') }]"
              role="img"
              :aria-label="record.rank ?? ''">
              {{ formatRecordRank(record.rank ?? '') }}
            </span>
          </template>

          <span v-else class="record-history__gameOver">{{ formatRecordScore(record) }}</span>
        </span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
/* ハイスコア（金色の帯。リザルトのエンディングカードと同じ色あい） */
.record-history__best {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px 12px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #fff7e2;
  color: #8a5a00;
  font-size: 15px;
  font-weight: 700;
}

.record-history__bestDate {
  margin-left: 4px;
  color: #8a6a20;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.record-history__subtitle {
  margin: 0 0 2px;
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 700;
}

.record-history__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 1行（左に日時、右に点数とランク。せまい画面で入りきらないときは、右を次の行の右はしへ回す） */
.record-history__item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px 12px;
  padding: 4px 0;
  border-bottom: 1px dotted #dfe6ef;
  font-size: 15px;
}

.record-history__item:last-child {
  border-bottom: none;
}

.record-history__when {
  font-variant-numeric: tabular-nums;
}

/* 今回のプレイの札 */
.record-history__now {
  display: inline-block;
  margin-right: 6px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--navy);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.7;
}

.record-history__result {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin-left: auto;
}

.record-history__score {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.record-history__item .record-history__score {
  color: var(--navy);
}

/* ランクのバッジ（英字だけ。記録の画面のハイスコアのバッジと同じ、紺に金の文字）
   min-width … 「S」と「S+」でバッジの幅がそろい、点数の位置がそろう
   line-height … 行の高さが、バッジの無い GAME OVER の行と変わらないくらいにする */
.record-history__rank {
  display: inline-block;
  min-width: 2.2em;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--navy);
  color: var(--gold);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.5;
  text-align: center;
}

/* 英字ではないランク（特殊エンド）は、文字が多いので小さくする */
.record-history__rank--text {
  font-size: 12px;
  font-weight: 700;
}

/* S+ / S … 金の地に茶色の文字（金色は「特別」の色）。うすい縁で、金色の下地の上でもバッジの形が分かるようにする */
.record-history__rank--top {
  background: var(--gold);
  box-shadow: inset 0 0 0 1px #e8b23c;
  color: #7a4b00;
}

/* C / D … ひかえめな灰青（良い回を目立たせるため。赤は GAME OVER の色なので使わない） */
.record-history__rank--low {
  background: #e4ebf1;
  color: var(--navy-deep);
}

.record-history__gameOver {
  color: #c9412f;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
</style>
