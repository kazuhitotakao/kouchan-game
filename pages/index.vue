<script setup lang="ts">
import { ref } from 'vue';

const gameTitle: string = 'こうちゃんといっしょ！';

const gameStarted = ref(false);

/* ゲームのステータス */
const childEnergy = ref(100); // こうちゃんの体力
const childMood = ref(80); // こうちゃんの機嫌
const outingPoint = ref(0); // おでかけポイント
const parentEnergy = ref(100); // 親の体力
const parentStress = ref(0); // 親のイライラ度
const currentTime = ref('09:00'); // 時間

/* 結果メッセージ */
const resultMessage = ref('');

/* 時間を進める共通処理 */
function addMinutes(minutes: number) {
  const [hour, minute] = currentTime.value.split(':').map(Number);

  const totalMinutes = hour * 60 + minute + minutes;

  const newHour = Math.floor(totalMinutes / 60);
  const newMinute = totalMinutes % 60;

  currentTime.value = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}

/* ゲーム開始 */
function startGame() {
  gameStarted.value = true;
}

/* 公園で一緒に遊ぶ */
function playTogether() {
  childEnergy.value -= 15;
  childMood.value += 10;
  outingPoint.value += 5;
  parentEnergy.value -= 10;
  parentStress.value += 2;
  addMinutes(30);

  resultMessage.value = 'こうちゃんは大喜び！';
}

/* 次のイベントへ進む */
function goToNextEvent() {
  resultMessage.value = '';

  // 次に作るイベントへの切り替え処理を
  // ここに追加していく
}
</script>

<template>
  <main>
    <!-- ゲーム開始前 -->
    <div v-if="!gameStarted">
      <h1>{{ gameTitle }}</h1>

      <p>こうちゃんと楽しい1日を過ごそう！</p>

      <button @click="startGame">公園へ行く</button>
    </div>

    <!-- ゲーム開始後 -->
    <div v-else>
      <h2>公園！</h2>

      <p>こうちゃんと公園にやってきました。</p>
      <h3>ステータス</h3>

      <p>こうちゃんの体力：{{ childEnergy }}</p>
      <p>こうちゃんの機嫌：{{ childMood }}</p>
      <p>おでかけポイント：{{ outingPoint }}</p>
      <p>親の体力：{{ parentEnergy }}</p>
      <p>親のイライラ度：{{ parentStress }}</p>
      <p>時間：{{ currentTime }}</p>

      <!-- 結果がまだ無いとき -->
      <div v-if="!resultMessage">
        <h3>どうする？</h3>
        <button @click="playTogether">一緒に遊ぶ</button>
      </div>

      <!-- 結果が出たあと -->
      <div v-else>
        <h3>結果</h3>
        <p>{{ resultMessage }}</p>
        <button @click="goToNextEvent">次へ</button>
      </div>
    </div>
  </main>
</template>
