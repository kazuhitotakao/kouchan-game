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
type GameEvent =
  | 'parkEntrance'
  | 'slide'
  | 'sandbox'
  | 'acornArea'
  | 'pond'
  | 'hill'
  | 'secretSpot'
  | 'tantrum'
  | 'goal';

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

/* いやいや中かどうか */
const isTantrum = ref(false);

/* いやいやが起きた回数（記録用） */
const tantrumCount = ref(0);

/* おやつの残り回数（今日持ってきた分だけ） */
const snackLeft = ref(2);

/* 結果メッセージ */
const resultMessage = ref('');

/* ゴールしたときの判定メッセージ */
const endingTitle = ref('');
const endingMessage = ref('');

/* 秘密の場所へ行ける条件
   おでかけポイントが20以上になったら解放される
*/
const canEnterSecretSpot = computed(() => outingPoint.value >= 20);

/* 時間を進める共通処理 */
function addMinutes(minutes: number) {
  const [hour, minute] = currentTime.value.split(':').map(Number);

  const totalMinutes = hour * 60 + minute + minutes;

  const newHour = Math.floor(totalMinutes / 60);
  const newMinute = totalMinutes % 60;

  currentTime.value = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}

/* いやいや判定
   こうちゃんの体力が70以下まで減ると、いやいやが始まってしまう
   ※「べつの場所へ行く」はそれ自体がいやいやなので、この判定は呼ばない
*/
function checkTantrum() {
  if (childEnergy.value <= 70) {
    isTantrum.value = true;
    tantrumCount.value += 1;

    childMood.value -= 15;
    parentStress.value += 6;

    resultMessage.value += '\nそのあと、こうちゃんが急に「いやー！」と泣き出して、地面に寝ころんでしまいました…';
  }
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
   いやいや中なら、まずはなだめる場面へ
*/
function goToNextPlace() {
  resultMessage.value = '';

  if (isTantrum.value) {
    currentEvent.value = 'tantrum';
    return;
  }

  currentEvent.value = 'parkEntrance';
}

/* ===== すべり台 ===== */

/* ① 一緒にすべる */
function playSlide() {
  childEnergy.value -= 15;
  childMood.value += 5;
  outingPoint.value += 6;
  parentEnergy.value -= 12;
  parentStress.value += 3;
  addMinutes(30);

  resultMessage.value = 'こうちゃんと一緒にすべりました。大喜びです！';

  checkTantrum();
}

/* ② 下で見守る */
function watchSlide() {
  childEnergy.value -= 10;
  childMood.value += 4;
  outingPoint.value += 3;
  parentEnergy.value -= 3;
  parentStress.value += 1;
  addMinutes(20);

  resultMessage.value = '下から見守りました。こうちゃんは楽しそうにすべっています。';

  checkTantrum();
}

/* ===== 砂場 ===== */

/* ① 一緒に大きな山を作る */
function playSandbox() {
  childEnergy.value -= 10;
  childMood.value += 4;
  outingPoint.value += 6;
  parentEnergy.value -= 8;
  parentStress.value += 2;
  addMinutes(30);

  resultMessage.value = '一緒に大きな山を作りました。こうちゃんは夢中です！';

  checkTantrum();
}

/* ② ベンチから見守る */
function watchFromBench() {
  childEnergy.value -= 8;
  childMood.value += 4;
  outingPoint.value += 3;
  parentEnergy.value += 3;
  parentStress.value += 1;
  addMinutes(25);

  resultMessage.value = 'ベンチから見守りました。こうちゃんは楽しそうに遊んでいます。';

  checkTantrum();
}

/* ===== どんぐりの木 ===== */

/* ① 一緒にどんぐりを拾う */
function collectAcorns() {
  childEnergy.value -= 8;
  childMood.value += 6;
  outingPoint.value += 8;
  parentEnergy.value -= 6;
  parentStress.value += 2;
  addMinutes(20);

  resultMessage.value = 'こうちゃんは夢中でどんぐりを拾っています！';

  checkTantrum();
}

/* ② 木かげで少し休む */
function takeBreak() {
  childEnergy.value += 10;
  childMood.value -= 3;
  outingPoint.value += 1;
  parentEnergy.value += 12;
  parentStress.value -= 6;
  addMinutes(20);

  resultMessage.value = '木かげで少し休みました。親の体力が回復しました。';

  checkTantrum();
}

/* ===== 池 ===== */

/* ① 白鳥を近くで見る */
function watchSwansClose() {
  childEnergy.value -= 8;
  childMood.value += 7;
  outingPoint.value += 9;
  parentEnergy.value -= 10;
  parentStress.value += 6;
  addMinutes(25);

  resultMessage.value = '白鳥を近くで見ました。こうちゃんは大興奮です！';

  checkTantrum();
}

/* ② 少し離れて見る */
function watchSwansFar() {
  childEnergy.value -= 5;
  childMood.value += 4;
  outingPoint.value += 4;
  parentEnergy.value -= 2;
  parentStress.value += 1;
  addMinutes(15);

  resultMessage.value = '少し離れて白鳥を見ました。落ち着いてながめられました。';

  checkTantrum();
}

/* ===== 丘 ===== */

/* ① 走って丘をのぼる */
function runUpHill() {
  childEnergy.value -= 20;
  childMood.value += 7;
  outingPoint.value += 11;
  parentEnergy.value -= 15;
  parentStress.value += 3;
  addMinutes(30);

  resultMessage.value = '丘のてっぺんまで走ってのぼりました。公園全体が見わたせます！';

  checkTantrum();
}

/* ② ゆっくり歩いてのぼる */
function walkUpHill() {
  childEnergy.value -= 10;
  childMood.value += 4;
  outingPoint.value += 6;
  parentEnergy.value -= 6;
  parentStress.value += 2;
  addMinutes(25);

  resultMessage.value = 'ゆっくり歩いてのぼりました。途中の花を見つけて楽しめました。';

  checkTantrum();
}

/* ===== 秘密の場所 ===== */

/* ① 秘密基地で遊ぶ */
function playSecretBase() {
  childEnergy.value -= 12;
  childMood.value += 10;
  outingPoint.value += 15;
  parentEnergy.value -= 10;
  parentStress.value += 1;
  addMinutes(30);

  resultMessage.value = '木のトンネルの奥は秘密基地でした。こうちゃんは目をかがやかせています！';

  checkTantrum();
}

/* ② 二人で景色をながめる */
function enjoySecretView() {
  childEnergy.value += 5;
  childMood.value += 5;
  outingPoint.value += 9;
  parentEnergy.value += 3;
  parentStress.value -= 6;
  addMinutes(20);

  resultMessage.value = '二人でならんで景色をながめました。とても穏やかな時間です。';

  checkTantrum();
}

/* ===== いやいや中（なだめる場面） ===== */

/* ① だっこしてなだめる */
function hugChild() {
  childEnergy.value += 12;
  childMood.value += 15;
  parentEnergy.value -= 15;
  parentStress.value -= 8;
  addMinutes(15);

  isTantrum.value = false;

  resultMessage.value = 'のけぞって暴れられましたが、ぎゅっとだっこしていると、少しずつ落ち着いてきました。腕がしびれています。';
}

/* ② おやつをあげる */
function giveSnack() {
  childEnergy.value += 25;
  childMood.value += 8;
  outingPoint.value += 2;
  parentEnergy.value -= 5;
  parentStress.value -= 3;
  addMinutes(10);

  snackLeft.value -= 1;
  isTantrum.value = false;

  resultMessage.value = 'おやつを見せたとたん、泣き声がぴたりと止まりました。少し負けた気がしますが、元気は戻ってきました。';
}

/* ③ 少し待ってみる */
function waitCalmly() {
  childEnergy.value -= 5;
  childMood.value -= 2;
  parentEnergy.value += 2;
  parentStress.value += 8;
  addMinutes(20);

  isTantrum.value = false;

  resultMessage.value = 'そばで待ちました。泣き声は10分以上続き、通りすがりの人にじっと見られました。こうちゃんの機嫌はもどりきっていません。';
}

/* ===== ゴール ===== */

/* クリア条件を判定する
   ・おでかけポイントが30以上
   ・親の体力が20以上
   ・こうちゃんの機嫌が30以上
*/
function judgeResult() {
  const isPointOk = outingPoint.value >= 30;
  const isParentOk = parentEnergy.value >= 20;
  const isMoodOk = childMood.value >= 30;

  if (isPointOk && isParentOk && isMoodOk) {
    endingTitle.value = 'クリア！';
    endingMessage.value =
      'いやいやもあったけれど、こうちゃんと公園をたっぷり探検できました。「またこようね！」';
    return;
  }

  endingTitle.value = '惜しい！';

  if (!isPointOk) {
    endingMessage.value = 'まだ探検が足りなかったようです。もっといろいろな場所へ行ってみよう！';
    return;
  }

  if (!isParentOk) {
    endingMessage.value =
      '遊びすぎて親がヘトヘトです。木かげで休んだり、待ってみたりして体力を残そう！';
    return;
  }

  endingMessage.value =
    'こうちゃんのいやいやが止まらないまま終わってしまいました。だっこやおやつで機嫌をとりもどそう！';
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

  isTantrum.value = false;
  tantrumCount.value = 0;
  snackLeft.value = 2;

  resultMessage.value = '';
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

      <p>いやいや期のこうちゃんと、公園の中を探検しよう！</p>

      <p>クリア条件：おでかけポイント30以上／親の体力20以上／こうちゃんの機嫌30以上</p>

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
      <p>おやつの残り：{{ snackLeft }}個</p>

      <!-- 公園入口 -->
      <div v-if="currentEvent === 'parkEntrance'">
        <h2>公園入口</h2>

        <p>こうちゃんと公園にやってきました。どこへ探検に行こう？</p>

        <h3>どこへ行く？</h3>

        <button @click="goToPlace('slide')">すべり台へ行く</button>

        <button @click="goToPlace('sandbox')">砂場へ行く</button>

        <button @click="goToPlace('acornArea')">どんぐりの木へ行く</button>

        <button @click="goToPlace('pond')">池へ行く</button>

        <button @click="goToPlace('hill')">丘へ行く</button>

        <!-- 秘密の場所はおでかけポイントが20以上で解放 -->
        <button v-if="canEnterSecretSpot" @click="goToPlace('secretSpot')">
          秘密の場所へ行く
        </button>

        <p v-else>？？？：おでかけポイントが20たまると、行ける場所が増えそうです。</p>

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
        <h2>いやいや！</h2>

        <p>
          こうちゃんが地面に寝ころんで「いやー！」と泣いています。 なにを言っても「いやー！」しか返ってきません。まわりの視線が痛いです。
        </p>

        <div v-if="!resultMessage">
          <h3>どうする？</h3>

          <button @click="hugChild">だっこしてなだめる</button>

          <button v-if="snackLeft > 0" @click="giveSnack">
            おやつをあげる（残り{{ snackLeft }}個）
          </button>

          <p v-else>おやつはもう食べてしまいました…</p>

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

        <h3>{{ endingTitle }}</h3>

        <p>{{ endingMessage }}</p>

        <h3>今日の記録</h3>

        <p>おでかけポイント：{{ outingPoint }}（クリア条件：30以上）</p>
        <p>親の体力：{{ parentEnergy }}（クリア条件：20以上）</p>
        <p>こうちゃんの機嫌：{{ childMood }}（クリア条件：30以上）</p>
        <p>いやいや発生：{{ tantrumCount }}回</p>
        <p>残ったおやつ：{{ snackLeft }}個</p>
        <p>帰った時間：{{ currentTime }}</p>

        <button @click="resetGame">もう一度あそぶ</button>
      </div>
    </div>
  </main>
</template>
