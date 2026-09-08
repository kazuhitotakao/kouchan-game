<script setup lang="ts">
import { computed, ref } from 'vue';

const gameTitle: string = 'こうちゃんといっしょ！';

const gameStarted = ref(false);

/* 今いる場所を管理する型
   parkEntrance = 公園入口
   slide        = すべり台
   sandbox      = 砂場
   acornArea    = どんぐりの木
   pond         = 池
   hill         = 丘
   secretSpot   = 秘密の場所
   tantrum      = いやいや中（なだめる場面）
   goal         = ゴール（公園の出口）
*/
type GameEvent = 'parkEntrance' | 'slide' | 'sandbox' | 'acornArea' | 'pond' | 'hill' | 'secretSpot' | 'tantrum' | 'goal';

/* 現在いる場所
   最初は「公園入口」からスタート
*/
const currentEvent = ref<GameEvent>('parkEntrance');

/* ゲームのステータス */
const childEnergy = ref(100); // こうちゃんの体力
const childMood = ref(80); // こうちゃんの機嫌
const outingPoint = ref(0); // おでかけポイント
const parentEnergy = ref(100); // 親の体力
const parentStress = ref(0); // 親のイライラ度
const currentTime = ref('09:00'); // 時間

/* 探検済みの場所
   その場所で1つ行動すると、ここに追加される
   ※ 公園入口・いやいや中・ゴールは入れない
*/
const visitedPlaces = ref<GameEvent[]>([]);

/* 公園で見つけたもの
   同じものは1つしか入らない
*/
const collectedItems = ref<string[]>([]);

/* いやいや中かどうか */
const isTantrum = ref(false);

/* いやいやが起きた回数（記録用） */
const tantrumCount = ref(0);

/* おやつの残り回数（今日持ってきた分だけ） */
const snackLeft = ref(2);

/* 結果メッセージ */
const resultMessage = ref('');

/* ゴールしたときのランクと判定メッセージ */
const endingRank = ref('');
const endingTitle = ref('');
const endingMessage = ref('');

/* 今の時間を「分」に直したもの
   09:00 なら 540、12:00 なら 720 になる
*/
const currentMinutes = computed(() => {
  const [hour, minute] = currentTime.value.split(':').map(Number);

  return hour * 60 + minute;
});

/* お昼（12:00）を過ぎたかどうか */
const isTimeOver = computed(() => currentMinutes.value >= 12 * 60);

/* そろそろお昼（11:30以降）かどうか */
const isAlmostNoon = computed(() => currentMinutes.value >= 11 * 60 + 30 && !isTimeOver.value);

/* 秘密の場所へ行ける条件
   ・おでかけポイントが20以上
   ・見つけたものが3種類以上
   の両方を満たすと解放される
*/
const canEnterSecretSpot = computed(() => outingPoint.value >= 20 && collectedItems.value.length >= 3);

/* 時間を進める共通処理 */
function addMinutes(minutes: number) {
  const [hour, minute] = currentTime.value.split(':').map(Number);

  const totalMinutes = hour * 60 + minute + minutes;

  const newHour = Math.floor(totalMinutes / 60);
  const newMinute = totalMinutes % 60;

  currentTime.value = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}

/* 数値を0〜100の範囲に収める */
function keepInRange(value: number) {
  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
}

/* ステータスがおかしな値にならないようにそろえる
   ※ おでかけポイントは点数なので100を超えてよい
*/
function fixAllStatus() {
  childEnergy.value = keepInRange(childEnergy.value);
  childMood.value = keepInRange(childMood.value);
  parentEnergy.value = keepInRange(parentEnergy.value);
  parentStress.value = keepInRange(parentStress.value);
}

/* その場所を探検済みかどうか */
function isVisited(place: GameEvent) {
  return visitedPlaces.value.includes(place);
}

/* おでかけポイントを加える
   はじめての場所なら そのままのポイント
   2回目以降の場所なら 1ポイントだけ
*/
function addOutingPoint(place: GameEvent, point: number) {
  if (isVisited(place)) {
    outingPoint.value += 1;
    return;
  }

  outingPoint.value += point;
}

/* 探検済みの場所に追加する（すでに入っていれば何もしない） */
function addVisitedPlace(place: GameEvent) {
  if (isVisited(place)) {
    return;
  }

  visitedPlaces.value.push(place);
}

/* 見つけたものを追加する（同じものは増えない） */
function addCollectedItem(itemName: string) {
  if (collectedItems.value.includes(itemName)) {
    return;
  }

  collectedItems.value.push(itemName);

  resultMessage.value += `\n「${itemName}」を見つけました！`;
}

/* ランダムイベント
   5回に1回くらい（20%）だけ起こる
*/
function runRandomEvent() {
  if (Math.random() >= 0.2) {
    return;
  }

  const eventNumber = Math.floor(Math.random() * 4);

  if (eventNumber === 0) {
    outingPoint.value += 5;
    resultMessage.value += '\n\nそのとき、四つ葉のクローバーを見つけました！\nおでかけポイント +5';
    return;
  }

  if (eventNumber === 1) {
    parentEnergy.value -= 5;
    resultMessage.value += '\n\nこうちゃんが急に「だっこ！」と言い出しました。\n親の体力 -5';
    return;
  }

  if (eventNumber === 2) {
    childMood.value += 5;
    resultMessage.value += '\n\n木の上にきれいな鳥を見つけました！\nこうちゃんの機嫌 +5';
    return;
  }

  parentStress.value += 4;
  resultMessage.value += '\n\nこうちゃんが転びそうになってヒヤッとしました。\n親のイライラ度 +4';
}

/* いやいや判定
   「こうちゃんの体力」「こうちゃんの機嫌」「今の時間」から
   いやいやが起きる確率を計算して、その確率で発生させる
   ※ 体力が71以上のときは、いやいやは起こらない
*/
function checkTantrum() {
  // すでにいやいや中のときは、もう一度判定しない
  if (isTantrum.value) {
    return;
  }

  // 体力が71以上あるうちは元気いっぱいなので、
  // 機嫌や時間に関係なく いやいや は起こらない
  if (childEnergy.value >= 71) {
    return;
  }

  // いやいやが起きる確率
  // 0 なら 0%、0.5 なら 50%、1 なら 100% という意味
  let tantrumChance = 0;

  // ① こうちゃんの体力
  //    疲れているほど、いやいやが起きやすくなる
  if (childEnergy.value <= 30) {
    tantrumChance += 0.6; // +60%
  } else if (childEnergy.value <= 50) {
    tantrumChance += 0.35; // +35%
  } else {
    tantrumChance += 0.1; // +10%（51〜70のとき）
  }

  // ② こうちゃんの機嫌
  //    機嫌が悪いほど、いやいやが起きやすくなる
  if (childMood.value <= 30) {
    tantrumChance += 0.2; // +20%
  } else if (childMood.value <= 50) {
    tantrumChance += 0.1; // +10%
  }
  // 機嫌が51以上のときは、機嫌による上乗せなし

  // ③ 今の時間
  //    11:00をすぎると、おなかもすいて眠くなり、いやいやが起きやすくなる
  if (currentMinutes.value >= 11 * 60) {
    tantrumChance += 0.1; // +10%
  }

  // 0以上1未満のランダムな数を出して、確率の中に入ったら いやいや発生
  const randomNumber = Math.random();

  if (randomNumber >= tantrumChance) {
    return;
  }

  isTantrum.value = true;
  tantrumCount.value += 1;

  childMood.value -= 15;
  parentStress.value += 6;

  resultMessage.value += '\n\nそのあと、こうちゃんが「いやー！」とほっぺをぷうっとふくらませて、その場にぺたんと座りこんでしまいました…';
}

/* 場所で1つ行動したあとの共通処理
   ① その場所を探検済みにする
   ② たまにランダムイベントが起こる
   ③ いやいやが始まるか判定する
   ④ ステータスを0〜100に収める
   ※ いやいやをなだめる行動では呼ばない（ランダムイベントを起こさないため）
*/
function finishPlayAction(place: GameEvent) {
  addVisitedPlace(place);
  runRandomEvent();
  checkTantrum();
  fixAllStatus();
}

/* ゲーム開始 */
function startGame() {
  gameStarted.value = true;
}

/* 場所を移動する
   移動すると前の結果メッセージは消す
*/
function goToPlace(place: GameEvent) {
  resultMessage.value = '';
  currentEvent.value = place;
}

/* 次の場所を選びに行く
   ① いやいや中なら、まずはなだめる場面へ
   ② 12:00を過ぎていたら、もう探検は続けられないのでゴールへ
*/
function goToNextPlace() {
  resultMessage.value = '';

  if (isTantrum.value) {
    currentEvent.value = 'tantrum';
    return;
  }

  if (isTimeOver.value) {
    goToGoal();
    return;
  }

  currentEvent.value = 'parkEntrance';
}

/* ===== すべり台 ===== */

/* ① 一緒にすべる */
function playSlide() {
  childEnergy.value -= 15;
  childMood.value += 5;
  addOutingPoint('slide', 6);
  parentEnergy.value -= 10;
  parentStress.value += 3;
  addMinutes(25);

  resultMessage.value = 'こうちゃんと一緒にすべりました。大喜びです！';

  addCollectedItem('赤い葉っぱ');
  finishPlayAction('slide');
}

/* ② 下で見守る */
function watchSlide() {
  childEnergy.value -= 10;
  childMood.value += 4;
  addOutingPoint('slide', 3);
  parentEnergy.value -= 3;
  parentStress.value += 1;
  addMinutes(15);

  resultMessage.value = '下から見守りました。こうちゃんは楽しそうにすべっています。';

  finishPlayAction('slide');
}

/* ===== 砂場 ===== */

/* ① 一緒に大きな山を作る */
function playSandbox() {
  childEnergy.value -= 10;
  childMood.value += 4;
  addOutingPoint('sandbox', 6);
  parentEnergy.value -= 7;
  parentStress.value += 2;
  addMinutes(25);

  resultMessage.value = '一緒に大きな山を作りました。こうちゃんは夢中です！';

  addCollectedItem('きれいな石');
  finishPlayAction('sandbox');
}

/* ② ベンチから見守る */
function watchFromBench() {
  childEnergy.value -= 8;
  childMood.value += 4;
  addOutingPoint('sandbox', 3);
  parentEnergy.value += 3;
  parentStress.value += 1;
  addMinutes(20);

  resultMessage.value = 'ベンチから見守りました。こうちゃんは楽しそうに遊んでいます。';

  finishPlayAction('sandbox');
}

/* ===== どんぐりの木 ===== */

/* ① 一緒にどんぐりを拾う */
function collectAcorns() {
  childEnergy.value -= 8;
  childMood.value += 6;
  addOutingPoint('acornArea', 8);
  parentEnergy.value -= 5;
  parentStress.value += 2;
  addMinutes(20);

  resultMessage.value = 'こうちゃんは夢中でどんぐりを拾っています！';

  addCollectedItem('大きなどんぐり');
  finishPlayAction('acornArea');
}

/* ② 木かげで少し休む */
function takeBreak() {
  childEnergy.value += 10;
  childMood.value -= 3;
  addOutingPoint('acornArea', 1);
  parentEnergy.value += 12;
  parentStress.value -= 6;
  addMinutes(20);

  resultMessage.value = '木かげで少し休みました。親の体力が回復しました。';

  finishPlayAction('acornArea');
}

/* ===== 池 ===== */

/* ① 白鳥を近くで見る */
function watchSwansClose() {
  childEnergy.value -= 8;
  childMood.value += 7;
  addOutingPoint('pond', 9);
  parentEnergy.value -= 8;
  parentStress.value += 6;
  addMinutes(20);

  resultMessage.value = '白鳥を近くで見ました。こうちゃんは大興奮です！';

  addCollectedItem('白い羽');
  finishPlayAction('pond');
}

/* ② 少し離れて見る */
function watchSwansFar() {
  childEnergy.value -= 5;
  childMood.value += 4;
  addOutingPoint('pond', 4);
  parentEnergy.value -= 2;
  parentStress.value += 1;
  addMinutes(15);

  resultMessage.value = '少し離れて白鳥を見ました。落ち着いてながめられました。';

  addCollectedItem('白い羽');
  finishPlayAction('pond');
}

/* ===== 丘 ===== */

/* ① 走って丘をのぼる */
function runUpHill() {
  childEnergy.value -= 20;
  childMood.value += 7;
  addOutingPoint('hill', 11);
  parentEnergy.value -= 12;
  parentStress.value += 3;
  addMinutes(25);

  resultMessage.value = '丘のてっぺんまで走ってのぼりました。公園全体が見わたせます！';

  addCollectedItem('黄色い花');
  finishPlayAction('hill');
}

/* ② ゆっくり歩いてのぼる */
function walkUpHill() {
  childEnergy.value -= 10;
  childMood.value += 4;
  addOutingPoint('hill', 6);
  parentEnergy.value -= 6;
  parentStress.value += 2;
  addMinutes(20);

  resultMessage.value = 'ゆっくり歩いてのぼりました。途中の花を見つけて楽しめました。';

  addCollectedItem('黄色い花');
  finishPlayAction('hill');
}

/* ===== 秘密の場所 ===== */

/* ① 秘密基地で遊ぶ */
function playSecretBase() {
  childEnergy.value -= 12;
  childMood.value += 10;
  addOutingPoint('secretSpot', 15);
  parentEnergy.value -= 8;
  parentStress.value += 1;
  addMinutes(25);

  resultMessage.value = '木のトンネルの奥は秘密基地でした。こうちゃんは目をかがやかせています！';

  addCollectedItem('ふしぎな形の枝');
  finishPlayAction('secretSpot');
}

/* ② 二人で景色をながめる */
function enjoySecretView() {
  childEnergy.value += 5;
  childMood.value += 5;
  addOutingPoint('secretSpot', 9);
  parentEnergy.value += 3;
  parentStress.value -= 6;
  addMinutes(20);

  resultMessage.value = '二人でならんで景色をながめました。とても穏やかな時間です。';

  finishPlayAction('secretSpot');
}

/* ===== いやいや中（なだめる場面） ===== */

/* ① だっこしてなだめる */
function hugChild() {
  childEnergy.value += 12;
  childMood.value += 15;
  parentEnergy.value -= 15;
  parentStress.value -= 8;
  addMinutes(10);

  isTantrum.value = false;

  resultMessage.value = 'ぎゅっとだっこすると、しばらく足をぱたぱたさせていましたが、そのうち肩にことんと頭をあずけてきました。';

  fixAllStatus();
}

/* ② おやつをあげる */
function giveSnack() {
  childEnergy.value += 25;
  childMood.value += 8;
  outingPoint.value += 2;
  parentEnergy.value -= 4;
  parentStress.value -= 3;
  addMinutes(10);

  snackLeft.value -= 1;
  isTantrum.value = false;

  resultMessage.value = 'おやつをそっと見せると、涙のたまった目で「……たべる」。ほっぺをふくらませたまま、もぐもぐ食べ始めました。';

  fixAllStatus();
}

/* ③ 少し待ってみる */
function waitCalmly() {
  childEnergy.value -= 5;
  childMood.value -= 2;
  parentEnergy.value += 2;
  parentStress.value += 8;
  addMinutes(15);

  isTantrum.value = false;

  resultMessage.value = 'となりにしゃがんで待ちました。ときどきこちらをちらっと見ながら、泣き声は少しずつ小さくなっていきます。まだ少しだけごきげんななめです。';

  fixAllStatus();
}

/* ===== ゴール ===== */

/* 結果のランクを判定する
   上から順番に見て、あてはまった時点で決まる
   ① いやいや3回以上          → 特殊エンド（通常ランクより優先）
   ② Sランクの条件をすべて満たす
   ③ Aランクの条件をすべて満たす
   ④ 親の体力が20未満、または12:00を過ぎた → Cランク
   ⑤ それ以外                 → Bランク
*/
function judgeResult() {
  const isBackInTime = currentMinutes.value <= 12 * 60;
  const isSecretVisited = isVisited('secretSpot');

  // ① 特殊エンド
  if (tantrumCount.value >= 3) {
    endingRank.value = '特殊エンド';
    endingTitle.value = 'いやいや大爆発！';
    endingMessage.value = 'いやいやが' + tantrumCount.value + '回もありました。ほっぺをふくらませたこうちゃんをだっこして、いっしょにおうちへ帰ります。それはそれで、わすれられない1日になりました。';
    return;
  }

  // ② Sランク
  if (outingPoint.value >= 50 && parentEnergy.value >= 40 && childMood.value >= 50 && isSecretVisited && isBackInTime) {
    endingRank.value = 'Sランク';
    endingTitle.value = '公園探検マスター！';
    endingMessage.value = '秘密の場所まで見つけて、時間ぴったりに帰ってこられました。こうちゃんも親も大満足の完ぺきな1日です！';
    return;
  }

  // ③ Aランク
  if (outingPoint.value >= 30 && parentEnergy.value >= 20 && childMood.value >= 30 && isBackInTime) {
    endingRank.value = 'Aランク';
    endingTitle.value = '最高のおでかけ！';
    endingMessage.value = 'いろいろな場所を回って、お昼までにちゃんと帰ってこられました。「またこようね！」';
    return;
  }

  // ④ Cランク
  if (parentEnergy.value < 20 || !isBackInTime) {
    endingRank.value = 'Cランク';
    endingTitle.value = '親はヘトヘト……';

    if (!isBackInTime) {
      endingMessage.value = 'お昼を大きく過ぎてしまいました。お腹はぺこぺこ、親はもうクタクタです。次はもっと早めに帰ろう！';
      return;
    }

    endingMessage.value = '遊びすぎて親の体力が空っぽです。木かげで休んだり、だっこを減らしたりして体力を残そう！';
    return;
  }

  // ⑤ Bランク
  endingRank.value = 'Bランク';
  endingTitle.value = '楽しい公園探検！';
  endingMessage.value = 'ひととおり遊べました。もう少しいろいろな場所を回れば、もっと良い結果になりそうです。';
}

/* ゴールへ向かう（判定して結果画面へ） */
function goToGoal() {
  resultMessage.value = '';
  addMinutes(10);
  judgeResult();
  currentEvent.value = 'goal';
}

/* もう一度あそぶ */
function resetGame() {
  childEnergy.value = 100;
  childMood.value = 80;
  outingPoint.value = 0;
  parentEnergy.value = 100;
  parentStress.value = 0;
  currentTime.value = '09:00';

  visitedPlaces.value = [];
  collectedItems.value = [];

  isTantrum.value = false;
  tantrumCount.value = 0;
  snackLeft.value = 2;

  resultMessage.value = '';
  endingRank.value = '';
  endingTitle.value = '';
  endingMessage.value = '';

  currentEvent.value = 'parkEntrance';
  gameStarted.value = false;
}
</script>

<template>
  <main class="game">
    <!-- ============================================================
         タイトル画面（ゲーム開始前）
         ============================================================ -->
    <div v-if="!gameStarted" class="title-screen">
      <div class="title-card">
        <p class="title-card__badge">こうえん たんけん ゲーム</p>

        <h1 class="title-card__name">{{ gameTitle }}</h1>

        <p class="title-card__lead">こうちゃんといっしょに、公園をたんけんしよう！</p>

        <div class="title-card__rule">
          <p>
            タイムリミットはお昼の12:00。
            <br />
            それまでにいろいろな場所をまわって、公園の出口まで帰ってこよう！
          </p>

          <p>
            はじめて行く場所ほど、おでかけポイントをたくさんもらえます。
            <br />
            こうちゃんと親の体力にも気をつけながら、たくさん探検してみよう！
          </p>
        </div>

        <button class="cmd cmd--start" @click="startGame">公園へ行く</button>
      </div>
    </div>

    <!-- ============================================================
         ゲーム画面（上部ステータス／中央イベント／下部コマンド）
         ============================================================ -->
    <div v-else class="game-screen">
      <!-- ==========================================================
           【上部】常時表示のステータスエリア
           ========================================================== -->
      <header class="status-area">
        <div class="status-area__head">
          <span class="status-area__title">{{ gameTitle }}</span>

          <span class="status-clock">
            <span class="status-clock__now">{{ currentTime }}</span>
            <span class="status-clock__limit">／ 12:00</span>
          </span>
        </div>

        <ul class="status-list">
          <li class="status-item">
            <span class="status-item__label">こうちゃんの体力</span>
            <span class="status-item__value">{{ childEnergy }}</span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-energy" :style="{ width: childEnergy + '%' }"></span>
            </span>
          </li>

          <li class="status-item">
            <span class="status-item__label">こうちゃんの機嫌</span>
            <span class="status-item__value">{{ childMood }}</span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-mood" :style="{ width: childMood + '%' }"></span>
            </span>
          </li>

          <li class="status-item">
            <span class="status-item__label">親の体力</span>
            <span class="status-item__value">{{ parentEnergy }}</span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--parent-energy" :style="{ width: parentEnergy + '%' }"></span>
            </span>
          </li>

          <li class="status-item">
            <span class="status-item__label">親のイライラ度</span>
            <span class="status-item__value">{{ parentStress }}</span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--parent-stress" :style="{ width: parentStress + '%' }"></span>
            </span>
          </li>
        </ul>

        <div class="status-pills">
          <span class="pill pill--point">おでかけポイント<b>{{ outingPoint }}</b></span>

          <span class="pill pill--snack">おやつ残り<b>{{ snackLeft }}</b>個</span>
        </div>

        <div class="status-found">
          <span class="status-found__label">見つけたもの</span>

          <span v-if="collectedItems.length === 0" class="status-found__empty">まだなし</span>

          <ul v-else class="status-found__list">
            <li v-for="item in collectedItems" :key="item" class="status-found__item">{{ item }}</li>
          </ul>
        </div>

        <!-- そろそろお昼のお知らせ -->
        <p v-if="isAlmostNoon" class="status-notice">そろそろお昼の時間です。公園の出口へ向かいましょう。</p>
      </header>

      <!-- ==========================================================
           【中央】イベント表示 ＋ 【下部】コマンド欄
           場面ごとに .stage（中央）と .command（下部）を並べる
           ========================================================== -->

      <!-- 公園入口 -->
      <div v-if="currentEvent === 'parkEntrance'" class="scene">
        <section class="stage">
          <article class="place-card">
            <h2 class="place-card__title">公園入口</h2>

            <p class="place-card__text">こうちゃんと公園にやってきました。どこへ探検に行こう？</p>
          </article>

          <!-- 秘密の場所は「ポイント20以上」かつ「見つけたもの3種類以上」で解放 -->
          <article v-if="canEnterSecretSpot" class="place-card place-card--secret">
            <h3 class="place-card__subtitle">？？？</h3>

            <p class="place-card__text">公園の奥に知らない道を見つけた！</p>
          </article>

          <article v-else class="place-card place-card--locked">
            <h3 class="place-card__subtitle">？？？</h3>

            <p class="place-card__text">おでかけポイント20以上 ＋ 見つけたもの3種類で何か起こりそう…</p>

            <p class="place-card__note">今：{{ outingPoint }}ポイント ／ {{ collectedItems.length }}種類</p>
          </article>
        </section>

        <nav class="command">
          <p class="command__label">どこへ行く？</p>

          <button class="cmd" @click="goToPlace('slide')">
            <span class="cmd__text">すべり台へ行く</span>
            <span v-if="isVisited('slide')" class="cmd__badge">探検済み</span>
          </button>

          <button class="cmd" @click="goToPlace('sandbox')">
            <span class="cmd__text">砂場へ行く</span>
            <span v-if="isVisited('sandbox')" class="cmd__badge">探検済み</span>
          </button>

          <button class="cmd" @click="goToPlace('acornArea')">
            <span class="cmd__text">どんぐりの木へ行く</span>
            <span v-if="isVisited('acornArea')" class="cmd__badge">探検済み</span>
          </button>

          <button class="cmd" @click="goToPlace('pond')">
            <span class="cmd__text">池へ行く</span>
            <span v-if="isVisited('pond')" class="cmd__badge">探検済み</span>
          </button>

          <button class="cmd" @click="goToPlace('hill')">
            <span class="cmd__text">丘へ行く</span>
            <span v-if="isVisited('hill')" class="cmd__badge">探検済み</span>
          </button>

          <button v-if="canEnterSecretSpot" class="cmd cmd--secret" @click="goToPlace('secretSpot')">
            <span class="cmd__text">秘密の場所へ行く</span>
            <span v-if="isVisited('secretSpot')" class="cmd__badge">探検済み</span>
          </button>

          <button class="cmd cmd--goal" @click="goToGoal">
            <span class="cmd__text">公園の出口へ向かう（ゴール）</span>
          </button>
        </nav>
      </div>

      <!-- すべり台 -->
      <div v-else-if="currentEvent === 'slide'" class="scene">
        <section class="stage">
          <article class="place-card">
            <h2 class="place-card__title">すべり台</h2>

            <p class="place-card__text">大きなすべり台があります。こうちゃんは階段をのぼりはじめました。</p>
          </article>

          <!-- 結果が出たあと -->
          <article v-if="resultMessage" class="result-card">
            <h3 class="result-card__title">結果</h3>

            <p class="result-card__text">{{ resultMessage }}</p>
          </article>
        </section>

        <nav class="command">
          <!-- 結果がまだ無いとき -->
          <template v-if="!resultMessage">
            <p class="command__label">どうする？</p>

            <button class="cmd" @click="playSlide">
              <span class="cmd__text">一緒にすべる</span>
            </button>

            <button class="cmd" @click="watchSlide">
              <span class="cmd__text">下で見守る</span>
            </button>

            <button class="cmd cmd--sub" @click="goToNextPlace">
              <span class="cmd__text">べつの場所へ行く</span>
            </button>
          </template>

          <template v-else>
            <button class="cmd cmd--next" @click="goToNextPlace">
              <span class="cmd__text">次の場所を選ぶ</span>
            </button>
          </template>
        </nav>
      </div>

      <!-- 砂場 -->
      <div v-else-if="currentEvent === 'sandbox'" class="scene">
        <section class="stage">
          <article class="place-card">
            <h2 class="place-card__title">砂場</h2>

            <p class="place-card__text">こうちゃんはさっそくスコップを手に取りました。</p>
          </article>

          <article v-if="resultMessage" class="result-card">
            <h3 class="result-card__title">結果</h3>

            <p class="result-card__text">{{ resultMessage }}</p>
          </article>
        </section>

        <nav class="command">
          <template v-if="!resultMessage">
            <p class="command__label">どうする？</p>

            <button class="cmd" @click="playSandbox">
              <span class="cmd__text">一緒に大きな山を作る</span>
            </button>

            <button class="cmd" @click="watchFromBench">
              <span class="cmd__text">ベンチから見守る</span>
            </button>

            <button class="cmd cmd--sub" @click="goToNextPlace">
              <span class="cmd__text">べつの場所へ行く</span>
            </button>
          </template>

          <template v-else>
            <button class="cmd cmd--next" @click="goToNextPlace">
              <span class="cmd__text">次の場所を選ぶ</span>
            </button>
          </template>
        </nav>
      </div>

      <!-- どんぐりの木 -->
      <div v-else-if="currentEvent === 'acornArea'" class="scene">
        <section class="stage">
          <article class="place-card">
            <h2 class="place-card__title">どんぐりの木</h2>

            <p class="place-card__text">大きな木の下に、どんぐりがたくさん落ちています。</p>
          </article>

          <article v-if="resultMessage" class="result-card">
            <h3 class="result-card__title">結果</h3>

            <p class="result-card__text">{{ resultMessage }}</p>
          </article>
        </section>

        <nav class="command">
          <template v-if="!resultMessage">
            <p class="command__label">どうする？</p>

            <button class="cmd" @click="collectAcorns">
              <span class="cmd__text">一緒にどんぐりを拾う</span>
            </button>

            <button class="cmd" @click="takeBreak">
              <span class="cmd__text">木かげで少し休む</span>
            </button>

            <button class="cmd cmd--sub" @click="goToNextPlace">
              <span class="cmd__text">べつの場所へ行く</span>
            </button>
          </template>

          <template v-else>
            <button class="cmd cmd--next" @click="goToNextPlace">
              <span class="cmd__text">次の場所を選ぶ</span>
            </button>
          </template>
        </nav>
      </div>

      <!-- 池 -->
      <div v-else-if="currentEvent === 'pond'" class="scene">
        <section class="stage">
          <article class="place-card">
            <h2 class="place-card__title">池</h2>

            <p class="place-card__text">池には白鳥が泳いでいます。こうちゃんは指をさして大はしゃぎです。</p>
          </article>

          <article v-if="resultMessage" class="result-card">
            <h3 class="result-card__title">結果</h3>

            <p class="result-card__text">{{ resultMessage }}</p>
          </article>
        </section>

        <nav class="command">
          <template v-if="!resultMessage">
            <p class="command__label">どうする？</p>

            <button class="cmd" @click="watchSwansClose">
              <span class="cmd__text">白鳥を近くで見る</span>
            </button>

            <button class="cmd" @click="watchSwansFar">
              <span class="cmd__text">少し離れて見る</span>
            </button>

            <button class="cmd cmd--sub" @click="goToNextPlace">
              <span class="cmd__text">べつの場所へ行く</span>
            </button>
          </template>

          <template v-else>
            <button class="cmd cmd--next" @click="goToNextPlace">
              <span class="cmd__text">次の場所を選ぶ</span>
            </button>
          </template>
        </nav>
      </div>

      <!-- 丘 -->
      <div v-else-if="currentEvent === 'hill'" class="scene">
        <section class="stage">
          <article class="place-card">
            <h2 class="place-card__title">丘</h2>

            <p class="place-card__text">ゆるやかな丘があります。てっぺんまでのぼれそうです。</p>
          </article>

          <article v-if="resultMessage" class="result-card">
            <h3 class="result-card__title">結果</h3>

            <p class="result-card__text">{{ resultMessage }}</p>
          </article>
        </section>

        <nav class="command">
          <template v-if="!resultMessage">
            <p class="command__label">どうする？</p>

            <button class="cmd" @click="runUpHill">
              <span class="cmd__text">走って丘をのぼる</span>
            </button>

            <button class="cmd" @click="walkUpHill">
              <span class="cmd__text">ゆっくり歩いてのぼる</span>
            </button>

            <button class="cmd cmd--sub" @click="goToNextPlace">
              <span class="cmd__text">べつの場所へ行く</span>
            </button>
          </template>

          <template v-else>
            <button class="cmd cmd--next" @click="goToNextPlace">
              <span class="cmd__text">次の場所を選ぶ</span>
            </button>
          </template>
        </nav>
      </div>

      <!-- 秘密の場所 -->
      <div v-else-if="currentEvent === 'secretSpot'" class="scene">
        <section class="stage">
          <article class="place-card place-card--secret">
            <h2 class="place-card__title">秘密の場所</h2>

            <p class="place-card__text">しげみのおくに、細い道を見つけました。こうちゃんが手を引いて進みます。</p>
          </article>

          <article v-if="resultMessage" class="result-card">
            <h3 class="result-card__title">結果</h3>

            <p class="result-card__text">{{ resultMessage }}</p>
          </article>
        </section>

        <nav class="command">
          <template v-if="!resultMessage">
            <p class="command__label">どうする？</p>

            <button class="cmd" @click="playSecretBase">
              <span class="cmd__text">秘密基地で遊ぶ</span>
            </button>

            <button class="cmd" @click="enjoySecretView">
              <span class="cmd__text">二人で景色をながめる</span>
            </button>

            <button class="cmd cmd--sub" @click="goToNextPlace">
              <span class="cmd__text">べつの場所へ行く</span>
            </button>
          </template>

          <template v-else>
            <button class="cmd cmd--next" @click="goToNextPlace">
              <span class="cmd__text">次の場所を選ぶ</span>
            </button>
          </template>
        </nav>
      </div>

      <!-- いやいや中 -->
      <div v-else-if="currentEvent === 'tantrum'" class="scene">
        <section class="stage">
          <article class="place-card place-card--tantrum">
            <h2 class="place-card__title">いやいやタイム！</h2>

            <p class="place-card__text">こうちゃんがほっぺをふくらませて、その場にぺたんと座りこんでしまいました。 なにを言っても「いや！」のいってんばりですが、ときどきこちらをちらっと見ています。</p>
          </article>

          <article v-if="resultMessage" class="result-card">
            <h3 class="result-card__title">結果</h3>

            <p class="result-card__text">{{ resultMessage }}</p>
          </article>
        </section>

        <nav class="command">
          <template v-if="!resultMessage">
            <p class="command__label">どうする？</p>

            <button class="cmd" @click="hugChild">
              <span class="cmd__text">だっこしてなだめる</span>
            </button>

            <button v-if="snackLeft > 0" class="cmd" @click="giveSnack">
              <span class="cmd__text">おやつをあげる</span>
              <span class="cmd__badge">残り{{ snackLeft }}個</span>
            </button>

            <p v-else class="command__note">おやつは、もうぜんぶ食べてしまいました…</p>

            <button class="cmd" @click="waitCalmly">
              <span class="cmd__text">少し待ってみる</span>
            </button>
          </template>

          <template v-else>
            <button class="cmd cmd--next" @click="goToNextPlace">
              <span class="cmd__text">次の場所を選ぶ</span>
            </button>
          </template>
        </nav>
      </div>

      <!-- ゴール -->
      <div v-else-if="currentEvent === 'goal'" class="scene">
        <section class="stage">
          <article class="place-card">
            <h2 class="place-card__title">公園の出口</h2>

            <p class="place-card__text">たくさん探検しました。そろそろ公園から帰る時間です。</p>
          </article>

          <article class="ending-card">
            <p class="ending-card__rank">{{ endingRank }}</p>

            <h3 class="ending-card__title">{{ endingTitle }}</h3>

            <p class="ending-card__text">{{ endingMessage }}</p>
          </article>

          <!-- 横並びにする2枚のカード（記録／見つけたもの） -->
          <div class="record-grid">
            <article class="record-card">
              <h3 class="record-card__title">今日の記録</h3>

              <ul class="record-list">
                <li class="record-item"><span>おでかけポイント</span><b>{{ outingPoint }}</b></li>
                <li class="record-item"><span>親の体力</span><b>{{ parentEnergy }}</b></li>
                <li class="record-item"><span>こうちゃんの機嫌</span><b>{{ childMood }}</b></li>
                <li class="record-item"><span>こうちゃんの体力</span><b>{{ childEnergy }}</b></li>
                <li class="record-item"><span>いやいや発生</span><b>{{ tantrumCount }}回</b></li>
                <li class="record-item"><span>探検した場所の数</span><b>{{ visitedPlaces.length }}か所</b></li>
                <li class="record-item"><span>帰った時間</span><b>{{ currentTime }}</b></li>
              </ul>
            </article>

            <article class="record-card">
              <h3 class="record-card__title">見つけたもの</h3>

              <p v-if="collectedItems.length === 0" class="record-card__empty">見つけたもの：なし</p>

              <ul v-else class="found-list">
                <li v-for="item in collectedItems" :key="item" class="found-list__item">{{ item }}</li>
              </ul>
            </article>
          </div>
        </section>

        <nav class="command">
          <button class="cmd cmd--next" @click="resetGame">
            <span class="cmd__text">もう一度あそぶ</span>
          </button>
        </nav>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* ============================================================
   ページ全体の下地
   ゲーム枠の外側は暗くして、ゲーム画面が浮いて見えるようにする
   ============================================================ */
:global(html),
:global(body) {
  margin: 0;
  padding: 0;
  background: #101d2c;
}

/* ============================================================
   ゲーム全体の枠（パソコン向けの横長ウィンドウ）
   高さを画面いっぱいに固定して、ページ自体はスクロールさせない
   ============================================================ */
.game {
  /* 色の設定 */
  --navy: #23395e;
  --navy-deep: #182a47;
  --navy-line: #47679c;
  --paper: #fffdf5;
  --ink: #33455c;
  --ink-soft: #7b8ca1;
  --gold: #ffc043;
  --child-energy: #5ac47a;
  --child-mood: #ffb03a;
  --parent-energy: #4ea8e6;
  --parent-stress: #f2705f;

  /* 各エリアの横幅の基準 */
  --frame: 1180px;
  --stage-width: 900px;

  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--frame);
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  margin: 0 auto;
  background: linear-gradient(180deg, #8ed2f0 0%, #cfe8bf 42%, #f4f7e8 100%);
  color: var(--ink);
  font-family: system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif;
  font-size: 16px;
  line-height: 1.7;
  box-shadow: 0 0 60px rgb(0 0 0 / 55%);
}

.title-screen,
.game-screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

/* ============================================================
   タイトル画面
   ============================================================ */
.title-screen {
  align-items: center;
  justify-content: center;
  justify-content: safe center;
  overflow-y: auto;
  padding: 32px 24px;
}

.title-card {
  width: 100%;
  max-width: 620px;
  padding: 40px 44px;
  border: 3px solid var(--navy);
  border-radius: 20px;
  background: var(--paper);
  box-shadow: 0 12px 0 rgb(35 57 94 / 18%);
  text-align: center;
}

.title-card__badge {
  display: inline-block;
  margin: 0 0 14px;
  padding: 4px 18px;
  border-radius: 999px;
  background: var(--navy);
  color: #fff;
  font-size: 13px;
  letter-spacing: 0.12em;
}

.title-card__name {
  margin: 0 0 16px;
  color: var(--navy);
  font-size: 36px;
  line-height: 1.35;
}

.title-card__lead {
  margin: 0 0 22px;
  font-size: 17px;
  font-weight: 700;
}

.title-card__rule {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 26px;
  padding: 20px 24px;
  border-radius: 14px;
  background: #f2f6fb;
  font-size: 15px;
  text-align: left;
}

.title-card__rule p {
  margin: 0;
}

/* ============================================================
   【上部】ステータスエリア
   横1列に「時計」「ゲージ4本」「ポイント類」を並べる
   ============================================================ */
.status-area {
  display: grid;
  flex: none;
  grid-template-areas:
    'clock gauges pills'
    'found found found'
    'notice notice notice';
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px 28px;
  align-items: center;
  padding: 12px 28px 14px;
  border-bottom: 3px solid var(--gold);
  background: linear-gradient(180deg, var(--navy) 0%, var(--navy-deep) 100%);
  color: #fff;
  box-shadow: 0 4px 14px rgb(16 29 44 / 45%);
}

/* タイトルと時計 */
.status-area__head {
  display: flex;
  grid-area: clock;
  flex-direction: column;
  align-items: flex-start;
  padding-right: 24px;
  border-right: 1px solid var(--navy-line);
}

.status-area__title {
  color: #cfe0f7;
  font-size: 12px;
  white-space: nowrap;
}

.status-clock {
  color: var(--gold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.status-clock__now {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.status-clock__limit {
  color: #a9bedd;
  font-size: 12px;
}

/* ステータス4項目（横1列） */
.status-list {
  display: grid;
  grid-area: gauges;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px 20px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.status-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  column-gap: 8px;
}

.status-item__label {
  overflow: hidden;
  color: #bed2ee;
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-item__value {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.gauge {
  display: block;
  grid-column: 1 / -1;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(0 0 0 / 32%);
}

.gauge__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.gauge__fill--child-energy {
  background: var(--child-energy);
}

.gauge__fill--child-mood {
  background: var(--child-mood);
}

.gauge__fill--parent-energy {
  background: var(--parent-energy);
}

.gauge__fill--parent-stress {
  background: var(--parent-stress);
}

/* おでかけポイント・おやつ残り（右端に縦積み） */
.status-pills {
  display: flex;
  grid-area: pills;
  flex-direction: column;
  gap: 4px;
  padding-left: 24px;
  border-left: 1px solid var(--navy-line);
}

.pill {
  padding: 2px 12px;
  border: 1px solid var(--navy-line);
  border-radius: 8px;
  background: rgb(255 255 255 / 8%);
  font-size: 11px;
  text-align: right;
  white-space: nowrap;
}

.pill b {
  margin-left: 6px;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.pill--point b {
  color: var(--gold);
}

.pill--snack b {
  color: #ffd9a0;
}

/* 見つけたもの（横1列のチップ） */
.status-found {
  display: flex;
  grid-area: found;
  align-items: center;
  gap: 12px;
  max-height: 56px;
  overflow-y: auto;
  padding: 5px 12px;
  border-radius: 8px;
  background: rgb(0 0 0 / 22%);
}

.status-found__label {
  flex: none;
  color: #bed2ee;
  font-size: 11px;
  white-space: nowrap;
}

.status-found__empty {
  color: #8fa4c4;
  font-size: 12px;
}

.status-found__list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.status-found__item {
  padding: 1px 10px;
  border-radius: 999px;
  background: #fef3d6;
  color: #6a4a10;
  font-size: 12px;
  line-height: 1.6;
}

/* そろそろお昼のお知らせ */
.status-notice {
  grid-area: notice;
  margin: 0;
  padding: 5px 12px;
  border-left: 4px solid var(--gold);
  border-radius: 4px;
  background: rgb(255 192 67 / 18%);
  color: #ffe6b0;
  font-size: 12.5px;
  line-height: 1.5;
}

/* ============================================================
   場面のまとまり（中央エリア＋下部コマンド欄）
   ============================================================ */
.scene {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

/* ============================================================
   【中央】イベント表示エリア
   横長でも読みやすいよう、中身は幅を決めて中央寄せにする
   ============================================================ */
.stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  /* 中身が短いときは上下中央、あふれるときは上寄せ（safe） */
  justify-content: center;
  justify-content: safe center;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 28px 32px;
}

.stage > * {
  width: 100%;
  max-width: var(--stage-width);
}

/* 今いる場所のカード */
.place-card {
  padding: 22px 28px;
  border: 2px solid #dbe4ef;
  border-left: 8px solid var(--navy);
  border-radius: 14px;
  background: var(--paper);
  box-shadow: 0 4px 0 rgb(35 57 94 / 12%);
}

.place-card__title {
  margin: 0 0 10px;
  color: var(--navy);
  font-size: 26px;
  line-height: 1.4;
}

.place-card__subtitle {
  margin: 0 0 8px;
  color: var(--navy);
  font-size: 16px;
  letter-spacing: 0.12em;
}

.place-card__text {
  margin: 0;
  font-size: 15.5px;
}

.place-card__note {
  margin: 10px 0 0;
  color: var(--ink-soft);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

/* 秘密の場所 */
.place-card--secret {
  border-color: #d9c8f2;
  border-left-color: #7a4fc0;
  background: #f9f4ff;
}

.place-card--secret .place-card__title,
.place-card--secret .place-card__subtitle {
  color: #6b3fae;
}

/* 未解放のヒント（本編カードより控えめに、少し細く） */
.place-card--locked {
  max-width: 620px;
  padding: 14px 22px;
  border-color: #e2e6ec;
  border-left-color: #b3bfcd;
  background: #f6f8fa;
  color: var(--ink-soft);
  box-shadow: none;
}

.place-card--locked .place-card__subtitle {
  color: #93a2b4;
}

.place-card--locked .place-card__text {
  font-size: 14px;
}

/* いやいや中 */
.place-card--tantrum {
  border-color: #f7d3cd;
  border-left-color: var(--parent-stress);
  background: #fff5f3;
}

.place-card--tantrum .place-card__title {
  color: #c9412f;
}

/* 結果メッセージのボックス */
.result-card {
  position: relative;
  padding: 26px 28px 22px;
  border: 2px dashed #e8c98a;
  border-radius: 14px;
  background: #fffaeb;
}

.result-card__title {
  position: absolute;
  top: -14px;
  left: 20px;
  margin: 0;
  padding: 2px 16px;
  border-radius: 999px;
  background: var(--gold);
  color: #4a3208;
  font-size: 13px;
  letter-spacing: 0.1em;
}

.result-card__text {
  margin: 0;
  font-size: 15.5px;
  white-space: pre-line;
}

/* ゴールのエンディング */
.ending-card {
  padding: 22px 28px;
  border: 2px solid var(--gold);
  border-radius: 14px;
  background: linear-gradient(160deg, #fff7e2 0%, #ffeec4 100%);
  text-align: center;
}

.ending-card__rank {
  display: inline-block;
  margin: 0 0 10px;
  padding: 3px 20px;
  border-radius: 999px;
  background: var(--navy);
  color: var(--gold);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.ending-card__title {
  margin: 0 0 10px;
  color: #8a5a00;
  font-size: 26px;
  line-height: 1.4;
}

.ending-card__text {
  max-width: 640px;
  margin: 0 auto;
  font-size: 14.5px;
}

/* 今日の記録／見つけたもの（2枚を横並び） */
.record-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}

.record-card {
  padding: 18px 22px;
  border: 2px solid #dbe4ef;
  border-radius: 14px;
  background: var(--paper);
}

.record-card__title {
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 2px solid #eef2f7;
  color: var(--navy);
  font-size: 15px;
}

.record-card__empty {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
}

.record-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.record-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px dotted #dfe6ef;
  font-size: 14px;
}

.record-item:last-child {
  border-bottom: none;
}

.record-item b {
  color: var(--navy);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.found-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.found-list__item {
  padding: 3px 14px;
  border: 1px solid #ecd6a4;
  border-radius: 999px;
  background: #fff6e0;
  color: #6a4a10;
  font-size: 13px;
}

/* ============================================================
   【下部】コマンド欄
   横長を活かして、選択肢を2〜3列のグリッドで並べる
   ============================================================ */
.command {
  display: grid;
  flex: none;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 14px;
  align-content: start;
  max-height: 46vh;
  overflow-y: auto;
  padding: 14px 28px 18px;
  border-top: 3px solid var(--gold);
  background: linear-gradient(180deg, var(--navy-deep) 0%, var(--navy) 100%);
  box-shadow: 0 -6px 18px rgb(16 29 44 / 40%);
}

.command__label {
  grid-column: 1 / -1;
  margin: 0;
  color: #cfe0f7;
  font-size: 12px;
  letter-spacing: 0.1em;
}

.command__note {
  grid-column: 1 / -1;
  margin: 0;
  padding: 9px 14px;
  border: 1px dashed var(--navy-line);
  border-radius: 10px;
  color: #9db2d2;
  font-size: 13px;
}

/* コマンドボタン */
.cmd {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 12px 18px 12px 34px;
  border: 2px solid #c8d4e6;
  border-bottom-width: 4px;
  border-radius: 10px;
  background: var(--paper);
  color: var(--navy);
  font-family: inherit;
  font-size: 15.5px;
  font-weight: 700;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

/* 選択カーソル「▶」 */
.cmd::before {
  position: absolute;
  left: 14px;
  color: var(--gold);
  content: '▶';
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.cmd:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
}

.cmd:hover::before,
.cmd:focus-visible::before {
  opacity: 1;
}

.cmd:active {
  border-bottom-width: 2px;
  transform: translateY(2px);
  box-shadow: none;
}

.cmd:focus-visible {
  outline: 3px solid var(--gold);
  outline-offset: 2px;
}

.cmd__text {
  flex: 1;
}

.cmd__badge {
  flex: none;
  padding: 1px 10px;
  border-radius: 999px;
  background: #e7edf6;
  color: #63758d;
  font-size: 11.5px;
  font-weight: 400;
}

/* べつの場所へ行く（控えめ・行末に単独で置く） */
.cmd--sub {
  border-color: var(--navy-line);
  background: rgb(255 255 255 / 8%);
  color: #d5e2f5;
  font-size: 15px;
  font-weight: 400;
}

/* 次の場所を選ぶ／もう一度あそぶ（1つだけなので中央に置く） */
.cmd--next {
  grid-column: 1 / -1;
  justify-self: center;
  max-width: 380px;
  border-color: #e0a521;
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
  color: #4a3208;
}

.cmd--next .cmd__text {
  text-align: center;
}

/* 秘密の場所（1行使って目立たせる） */
.cmd--secret {
  grid-column: 1 / -1;
  border-color: #6b3fae;
  background: linear-gradient(180deg, #a97ce8 0%, #7a4fc0 100%);
  color: #fff;
}

.cmd--secret .cmd__badge {
  background: rgb(255 255 255 / 25%);
  color: #fff;
}

/* ゴールへ向かう（1行使って目立たせる） */
.cmd--goal {
  grid-column: 1 / -1;
  border-color: #2f7d4f;
  background: linear-gradient(180deg, #59bd7f 0%, #38955f 100%);
  color: #fff;
}

.cmd--goal .cmd__text {
  text-align: center;
}

/* はじめる */
.cmd--start {
  justify-content: center;
  padding: 16px 24px;
  border-color: #e0a521;
  background: linear-gradient(180deg, #ffd370 0%, var(--gold) 100%);
  color: #4a3208;
  font-size: 18px;
}

/* ============================================================
   画面が狭いとき（タブレット・スマホ）へのフォールバック
   ============================================================ */

/* タブレット幅：コマンドを2列に */
@media (max-width: 900px) {
  .command {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .status-area {
    gap: 8px 18px;
    padding: 10px 18px 12px;
  }

  .stage {
    padding: 20px 18px 24px;
  }
}

/* スマホ幅：上下に積み直して1列に戻す */
@media (max-width: 700px) {
  .game {
    height: auto;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: visible;
    font-size: 15px;
  }

  /* ステータスとコマンドはスクロールしても画面に残す */
  .status-area {
    position: sticky;
    top: 0;
    z-index: 2;
    grid-template-areas:
      'clock clock'
      'gauges gauges'
      'pills pills'
      'found found'
      'notice notice';
    grid-template-columns: 1fr 1fr;
    padding: 10px 12px 12px;
  }

  .status-area__head {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    width: 100%;
    padding-right: 0;
    border-right: none;
  }

  .status-clock__now {
    font-size: 20px;
  }

  .status-list {
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
  }

  .status-pills {
    flex-direction: row;
    padding-left: 0;
    border-left: none;
  }

  .pill {
    flex: 1;
    text-align: center;
  }

  .stage {
    justify-content: flex-start;
    gap: 12px;
    overflow-y: visible;
    padding: 14px 12px 18px;
  }

  .place-card {
    padding: 14px 16px;
    border-left-width: 6px;
  }

  .place-card__title {
    font-size: 19px;
  }

  .place-card__text,
  .result-card__text {
    font-size: 14px;
  }

  .result-card {
    padding: 18px 16px 14px;
  }

  .record-grid {
    grid-template-columns: 1fr;
  }

  .title-card {
    padding: 24px 20px;
  }

  .title-card__name {
    font-size: 26px;
  }

  .command {
    position: sticky;
    bottom: 0;
    z-index: 1;
    grid-template-columns: 1fr;
    max-height: 62vh;
    padding: 12px 12px calc(14px + env(safe-area-inset-bottom));
  }

  .cmd {
    padding: 11px 14px 11px 30px;
    font-size: 15px;
  }

  .cmd:hover {
    transform: none;
    box-shadow: none;
  }

  .cmd--next {
    max-width: none;
  }
}
</style>
