<script setup lang="ts">
import { ref } from 'vue';

const gameTitle: string = 'こうちゃんといっしょ！';

const gameStarted = ref(false);

/* 今いるゲームイベントを管理する型
   parkArrival  = 公園に到着した場面
   parkMorePlay = 公園でもっと遊びたい場面
*/
type GameEvent = 'parkArrival' | 'parkMorePlay';

/* 現在のイベント
   最初は「公園に到着した場面」からスタート
*/
const currentEvent = ref<GameEvent>('parkArrival');

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

/* ① 一緒にすべり台で遊ぶ */
function playSlide() {
  childEnergy.value -= 15;
  childMood.value += 10;
  outingPoint.value += 5;
  parentEnergy.value -= 10;
  parentStress.value += 2;
  addMinutes(30);

  resultMessage.value = 'こうちゃんは大喜びです！';
}

/* ② 砂場で遊ぶ */
function playSandbox() {
  childEnergy.value -= 10;
  childMood.value += 8;
  outingPoint.value += 5;
  parentEnergy.value -= 5;
  parentStress.value += 1;
  addMinutes(30);

  resultMessage.value = 'こうちゃんは夢中で砂遊びをしています！';
}

/* ③ ベンチから見守る */
function watchFromBench() {
  childEnergy.value -= 10;
  childMood.value += 5;
  outingPoint.value += 3;
  parentEnergy.value -= 2;
  parentStress.value += 0;
  addMinutes(30);

  resultMessage.value = 'こうちゃんは楽しそうに遊んでいます。';
}

/* 次のイベントへ進む */
function goToNextEvent() {
  resultMessage.value = '';
  currentEvent.value = 'parkMorePlay';
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
      <h3>ステータス</h3>

      <p>こうちゃんの体力：{{ childEnergy }}</p>
      <p>こうちゃんの機嫌：{{ childMood }}</p>
      <p>おでかけポイント：{{ outingPoint }}</p>
      <p>親の体力：{{ parentEnergy }}</p>
      <p>親のイライラ度：{{ parentStress }}</p>
      <p>時間：{{ currentTime }}</p>

      <!-- 公園に到着した場面 -->
      <div v-if="currentEvent === 'parkArrival'">
        <h2>公園！</h2>

        <p>こうちゃんと公園にやってきました。</p>

        <!-- 結果がまだ無いとき -->
        <div v-if="!resultMessage">
          <h3>どうする？</h3>
          <!-- ★ 3択に変更 -->
          <button @click="playSlide">一緒にすべり台で遊ぶ</button>

          <button @click="playSandbox">砂場で遊ぶ</button>

          <button @click="watchFromBench">ベンチから見守る</button>
        </div>

        <!-- 結果が出たあと -->
        <div v-else>
          <h3>結果</h3>
          <p>{{ resultMessage }}</p>
          <button @click="goToNextEvent">次へ</button>
        </div>
      </div>
      <!-- 公園でもっと遊びたいイベント -->
      <div v-else-if="currentEvent === 'parkMorePlay'">
        <h2>まだ遊びたい！</h2>

        <p>しばらく遊んだこうちゃんが、 「パパ、もっと遊ぼう！」と言っています。</p>

        <h3>どうする？</h3>

        <button>一緒にどんぐりを拾う</button>

        <button>少し休んでから遊ぶ</button>

        <button>そろそろ帰ろうと伝える</button>
      </div>
    </div>
  </main>
</template>
