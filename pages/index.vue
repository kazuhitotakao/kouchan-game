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
*/
function checkTantrum() {
  // すでにいやいや中のときは、もう一度判定しない
  if (isTantrum.value) {
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
  } else if (childEnergy.value <= 70) {
    tantrumChance += 0.1; // +10%
  }
  // 体力が71以上のときは、体力による上乗せなし（0%）

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
  <main>
    <!-- ゲーム開始前 -->
    <div v-if="!gameStarted">
      <h1>{{ gameTitle }}</h1>

      <p>こうちゃんといっしょに、公園をたんけんしよう！</p>

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
      <p>時間：{{ currentTime }}（12:00まで）</p>
      <p>おやつの残り：{{ snackLeft }}個</p>

      <!-- そろそろお昼のお知らせ -->
      <p v-if="isAlmostNoon">そろそろお昼の時間です。公園の出口へ向かいましょう。</p>

      <h3>見つけたもの</h3>

      <p v-if="collectedItems.length === 0">見つけたもの：なし</p>

      <ul v-else>
        <li v-for="item in collectedItems" :key="item">{{ item }}</li>
      </ul>

      <!-- 公園入口 -->
      <div v-if="currentEvent === 'parkEntrance'">
        <h2>公園入口</h2>

        <p>こうちゃんと公園にやってきました。どこへ探検に行こう？</p>

        <h3>どこへ行く？</h3>

        <button @click="goToPlace('slide')">
          すべり台へ行く
          <span v-if="isVisited('slide')">✅ 探検済み</span>
        </button>

        <button @click="goToPlace('sandbox')">
          砂場へ行く
          <span v-if="isVisited('sandbox')">✅ 探検済み</span>
        </button>

        <button @click="goToPlace('acornArea')">
          どんぐりの木へ行く
          <span v-if="isVisited('acornArea')">✅ 探検済み</span>
        </button>

        <button @click="goToPlace('pond')">
          池へ行く
          <span v-if="isVisited('pond')">✅ 探検済み</span>
        </button>

        <button @click="goToPlace('hill')">
          丘へ行く
          <span v-if="isVisited('hill')">✅ 探検済み</span>
        </button>

        <!-- 秘密の場所は「ポイント20以上」かつ「見つけたもの3種類以上」で解放 -->
        <div v-if="canEnterSecretSpot">
          <p>公園の奥に知らない道を見つけた！</p>

          <button @click="goToPlace('secretSpot')">
            秘密の場所へ行く
            <span v-if="isVisited('secretSpot')">✅ 探検済み</span>
          </button>
        </div>

        <p v-else>？？？：おでかけポイント20以上 ＋ 見つけたもの3種類で何か起こりそう… （今：{{ outingPoint }}ポイント／{{ collectedItems.length }}種類）</p>

        <button @click="goToGoal">公園の出口へ向かう（ゴール）</button>
      </div>

      <!-- すべり台 -->
      <div v-else-if="currentEvent === 'slide'">
        <h2>すべり台</h2>

        <p>大きなすべり台があります。こうちゃんは階段をのぼりはじめました。</p>

        <!-- 結果がまだ無いとき -->
        <div v-if="!resultMessage">
          <h3>どうする？</h3>

          <button @click="playSlide">一緒にすべる</button>

          <button @click="watchSlide">下で見守る</button>

          <button @click="goToNextPlace">べつの場所へ行く</button>
        </div>

        <!-- 結果が出たあと -->
        <div v-else>
          <h3>結果</h3>

          <p style="white-space: pre-line">{{ resultMessage }}</p>

          <button @click="goToNextPlace">次の場所を選ぶ</button>
        </div>
      </div>

      <!-- 砂場 -->
      <div v-else-if="currentEvent === 'sandbox'">
        <h2>砂場</h2>

        <p>こうちゃんはさっそくスコップを手に取りました。</p>

        <div v-if="!resultMessage">
          <h3>どうする？</h3>

          <button @click="playSandbox">一緒に大きな山を作る</button>

          <button @click="watchFromBench">ベンチから見守る</button>

          <button @click="goToNextPlace">べつの場所へ行く</button>
        </div>

        <div v-else>
          <h3>結果</h3>

          <p style="white-space: pre-line">{{ resultMessage }}</p>

          <button @click="goToNextPlace">次の場所を選ぶ</button>
        </div>
      </div>

      <!-- どんぐりの木 -->
      <div v-else-if="currentEvent === 'acornArea'">
        <h2>どんぐりの木</h2>

        <p>大きな木の下に、どんぐりがたくさん落ちています。</p>

        <div v-if="!resultMessage">
          <h3>どうする？</h3>

          <button @click="collectAcorns">一緒にどんぐりを拾う</button>

          <button @click="takeBreak">木かげで少し休む</button>

          <button @click="goToNextPlace">べつの場所へ行く</button>
        </div>

        <div v-else>
          <h3>結果</h3>

          <p style="white-space: pre-line">{{ resultMessage }}</p>

          <button @click="goToNextPlace">次の場所を選ぶ</button>
        </div>
      </div>

      <!-- 池 -->
      <div v-else-if="currentEvent === 'pond'">
        <h2>池</h2>

        <p>池には白鳥が泳いでいます。こうちゃんは指をさして大はしゃぎです。</p>

        <div v-if="!resultMessage">
          <h3>どうする？</h3>

          <button @click="watchSwansClose">白鳥を近くで見る</button>

          <button @click="watchSwansFar">少し離れて見る</button>

          <button @click="goToNextPlace">べつの場所へ行く</button>
        </div>

        <div v-else>
          <h3>結果</h3>

          <p style="white-space: pre-line">{{ resultMessage }}</p>

          <button @click="goToNextPlace">次の場所を選ぶ</button>
        </div>
      </div>

      <!-- 丘 -->
      <div v-else-if="currentEvent === 'hill'">
        <h2>丘</h2>

        <p>ゆるやかな丘があります。てっぺんまでのぼれそうです。</p>

        <div v-if="!resultMessage">
          <h3>どうする？</h3>

          <button @click="runUpHill">走って丘をのぼる</button>

          <button @click="walkUpHill">ゆっくり歩いてのぼる</button>

          <button @click="goToNextPlace">べつの場所へ行く</button>
        </div>

        <div v-else>
          <h3>結果</h3>

          <p style="white-space: pre-line">{{ resultMessage }}</p>

          <button @click="goToNextPlace">次の場所を選ぶ</button>
        </div>
      </div>

      <!-- 秘密の場所 -->
      <div v-else-if="currentEvent === 'secretSpot'">
        <h2>秘密の場所</h2>

        <p>しげみのおくに、細い道を見つけました。こうちゃんが手を引いて進みます。</p>

        <div v-if="!resultMessage">
          <h3>どうする？</h3>

          <button @click="playSecretBase">秘密基地で遊ぶ</button>

          <button @click="enjoySecretView">二人で景色をながめる</button>

          <button @click="goToNextPlace">べつの場所へ行く</button>
        </div>

        <div v-else>
          <h3>結果</h3>

          <p style="white-space: pre-line">{{ resultMessage }}</p>

          <button @click="goToNextPlace">次の場所を選ぶ</button>
        </div>
      </div>

      <!-- いやいや中 -->
      <div v-else-if="currentEvent === 'tantrum'">
        <h2>いやいやタイム！</h2>

        <p>こうちゃんがほっぺをふくらませて、その場にぺたんと座りこんでしまいました。 なにを言っても「いや！」のいってんばりですが、ときどきこちらをちらっと見ています。</p>

        <div v-if="!resultMessage">
          <h3>どうする？</h3>

          <button @click="hugChild">だっこしてなだめる</button>

          <button v-if="snackLeft > 0" @click="giveSnack">おやつをあげる（残り{{ snackLeft }}個）</button>

          <p v-else>おやつは、もうぜんぶ食べてしまいました…</p>

          <button @click="waitCalmly">少し待ってみる</button>
        </div>

        <div v-else>
          <h3>結果</h3>

          <p style="white-space: pre-line">{{ resultMessage }}</p>

          <button @click="goToNextPlace">次の場所を選ぶ</button>
        </div>
      </div>

      <!-- ゴール -->
      <div v-else-if="currentEvent === 'goal'">
        <h2>公園の出口</h2>

        <p>たくさん探検しました。そろそろ公園から帰る時間です。</p>

        <h3>{{ endingRank }}：{{ endingTitle }}</h3>

        <p>{{ endingMessage }}</p>

        <h3>今日の記録</h3>

        <p>おでかけポイント：{{ outingPoint }}</p>
        <p>親の体力：{{ parentEnergy }}</p>
        <p>こうちゃんの機嫌：{{ childMood }}</p>
        <p>こうちゃんの体力：{{ childEnergy }}</p>
        <p>いやいや発生：{{ tantrumCount }}回</p>
        <p>探検した場所の数：{{ visitedPlaces.length }}か所</p>
        <p>帰った時間：{{ currentTime }}</p>

        <h3>見つけたもの</h3>

        <p v-if="collectedItems.length === 0">見つけたもの：なし</p>

        <ul v-else>
          <li v-for="item in collectedItems" :key="item">{{ item }}</li>
        </ul>

        <button @click="resetGame">もう一度あそぶ</button>
      </div>
    </div>
  </main>
</template>
