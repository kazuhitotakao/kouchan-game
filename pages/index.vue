<script setup lang="ts">
import { ref } from 'vue';

const gameTitle: string = 'こうちゃんの1日';

const gameStarted = ref(false);

/* ★ゲームのステータス */
const childMood = ref(80); // こうちゃんの機嫌
const childEnergy = ref(100); // こうちゃんの体力
const parentEnergy = ref(100); // 親の体力
const parentStress = ref(0); // 親のイライラ度
const outingPoint = ref(0); // おでかけポイント
const currentTime = ref('09:00'); // 時間

function startGame() {
  gameStarted.value = true;
}
</script>

<template>
  <main>
    <!-- ゲーム開始前 -->
    <div v-if="!gameStarted">
      <h1>{{ gameTitle }}</h1>

      <p>こうちゃんと楽しい1日を過ごそう！</p>

      <button @click="startGame">ゲームスタート</button>
    </div>

    <!-- ゲーム開始後 -->
    <div v-else>
      <h2>公園へ行こう！</h2>

      <p>こうちゃんと公園にやってきました。</p>
      <h3>ステータス</h3>

      <p>こうちゃんの機嫌：{{ childMood }}</p>
      <p>こうちゃんの体力：{{ childEnergy }}</p>
      <p>親の体力：{{ parentEnergy }}</p>
      <p>親のイライラ度：{{ parentStress }}</p>
      <p>おでかけポイント：{{ outingPoint }}</p>
      <p>時間：{{ currentTime }}</p>
    </div>
  </main>
</template>
