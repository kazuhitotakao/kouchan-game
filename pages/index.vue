<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

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
   gameOver     = ゲームオーバー（限界をむかえて途中で終わった）
*/
type GameEvent = 'parkEntrance' | 'slide' | 'sandbox' | 'acornArea' | 'pond' | 'hill' | 'secretSpot' | 'tantrum' | 'goal' | 'gameOver';

/* 現在いる場所
   最初は「公園入口」からスタート
*/
const currentEvent = ref<GameEvent>('parkEntrance');

/* いま選んでいるコマンドの番号（キーボード操作用）
   0 = 1番目、1 = 2番目、2 = 3番目 という意味

   ↑↓キーでこの数字を動かし、Enter / Space でその番号のコマンドを実行する
   別の場所へ移動したときや、新しいコマンド画面になったときは 0 に戻して、
   いつも一番上のコマンドが選ばれている状態からはじめる
*/
const selectedCommandIndex = ref(0);

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

/* 今回の行動で新しく見つけたもの
   結果カードに「★ アイテム発見！」を出すためだけに使う（演出用）
   行動をはじめるたびに空にするので、直前の1回ぶんだけが入っている
   ※ 見つけたものの本体は collectedItems のままで、取得のルールは変えていない
*/
const foundItemsThisAction = ref<string[]>([]);

/* いやいやが起きた回数（記録用） */
const tantrumCount = ref(0);

/* おやつの残り回数（今日持ってきた分だけ） */
const snackLeft = ref(2);

/* 結果メッセージ */
const resultMessage = ref('');

/* 今回の行動で、どのステータスがどれだけ変わったかをまとめた型
   すべて「増えた分・減った分」の数で、-15 なら15減った という意味
   minutes は かかった時間（分）
*/
type StatusChanges = {
  childEnergy: number;
  childMood: number;
  outingPoint: number;
  parentEnergy: number;
  parentStress: number;
  minutes: number;
};

/* 今回の行動による変化
   null は「まだ今回の行動結果がない」という意味
   場所を移動したら null に戻して、前の変化が残らないようにする
*/
const statusChanges = ref<StatusChanges | null>(null);

/* 行動する前のステータスを、いったん控えておく箱
   行動が終わったあとに「今の値 － 行動前の値」で変化量を計算する

   ※ GAME OVER画面で「親の体力 10 → 0」のように行動前の値も出したいので、
     ふつうの変数ではなく ref にして、画面からも読めるようにしている
*/
const statusBefore = ref({
  childEnergy: 0,
  childMood: 0,
  outingPoint: 0,
  parentEnergy: 0,
  parentStress: 0,
  minutes: 0,
});

/* ゴールしたときのランクと判定メッセージ */
const endingRank = ref('');
const endingTitle = ref('');
const endingMessage = ref('');

/* GAME OVERになった理由（GAME OVER画面に出す文章）
   まだGAME OVERになっていないときは、どちらも空っぽ
*/
const gameOverTitle = ref('');
const gameOverMessage = ref('');

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

/* ===== キーボード操作（「どうする？」コマンドボックス）用の計算 ===== */

/* いま ↑↓←→ でコマンドを「選ぶ」画面かどうか

   ・タイトル画面（ゲーム開始前）… ボタンは「公園へ行く」の1つだけ
   ・ゴール／GAME OVER画面        … ボタンは「もう一度あそぶ」の1つだけ

   この2つはえらぶものが無いので false にする
   （false の画面では矢印キーをそのままにして、ページのスクロールをじゃましない。
     ただし Enter / Space だけは、その1つのボタンを押す代わりに使える）
*/
const isCommandKeyboardActive = computed(() => {
  // ゲーム開始前（タイトル画面）
  if (!gameStarted.value) {
    return false;
  }

  // ゴール・GAME OVER画面
  if (currentEvent.value === 'goal' || currentEvent.value === 'gameOver') {
    return false;
  }

  return true;
});

/* いま画面に出ているコマンドの数
   ↑↓キーで動ける範囲（0 〜 commandCount - 1）を決めるために使う
*/
const commandCount = computed(() => {
  // 公園入口は「行き先6か所 ＋ ゴール」で7つ
  // 秘密の場所がまだ見つかっていないときは、その行が画面に無いので6つ
  if (currentEvent.value === 'parkEntrance') {
    return canEnterSecretSpot.value ? 7 : 6;
  }

  // 結果表示中は「次の場所を選ぶ」の1つだけ
  if (resultMessage.value) {
    return 1;
  }

  // いやいやタイムは、おやつが残っていれば3つ、食べきっていれば2つ
  if (currentEvent.value === 'tantrum') {
    return snackLeft.value > 0 ? 3 : 2;
  }

  // それ以外の場所は「行動2つ ＋ べつの場所へ行く」で3つ
  return 3;
});

/* いやいやタイムの「少し待ってみる」が何番目になるか
   おやつが残っていれば3番目（＝2）
   おやつが0個で「おやつをあげる」が画面から消えているときは、
   1つくり上がって2番目（＝1）になる
*/
const waitCommandIndex = computed(() => (snackLeft.value > 0 ? 2 : 1));

/* 公園入口の「公園の出口へ向かう（ゴール）」が何番目になるか
   秘密の場所が出ていれば7番目（＝6）
   まだ出ていないときは、その行が画面に無いので1つくり上がって6番目（＝5）
*/
const goalCommandIndex = computed(() => (canEnterSecretSpot.value ? 6 : 5));

/* ===== 危険な状態かどうか（GAME OVERが近いかどうかの目安） =====
   ここが true になったゲージは、上部ステータスで目立つ見た目にする
*/

/* 親の体力が20以下 → あと1〜2回の行動で限界 */
const isParentEnergyDanger = computed(() => parentEnergy.value <= 20);

/* 親のイライラ度が80以上 → あと少しで100 */
const isParentStressDanger = computed(() => parentStress.value >= 80);

/* こうちゃんの体力が20以下 → 電池切れが近い */
const isChildEnergyDanger = computed(() => childEnergy.value <= 20);

/* 上部ステータスに出す警告メッセージ
   危険なものだけを配列に入れて、画面ではこれを上から順番に表示する
*/
const dangerWarnings = computed(() => {
  const warnings: string[] = [];

  if (isParentEnergyDanger.value) {
    warnings.push('⚠ 親の体力が残りわずかです');
  }

  if (isParentStressDanger.value) {
    warnings.push('⚠ 親のイライラが限界に近づいています');
  }

  if (isChildEnergyDanger.value) {
    warnings.push('⚠ こうちゃんもかなり疲れています');
  }

  return warnings;
});

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

/* 行動をはじめる前に呼ぶ
   「今のステータス」を控えておくだけの処理
*/
function startStatusChanges() {
  // 演出用：前の行動で見つけたものの表示が残らないように空へ戻す
  foundItemsThisAction.value = [];

  statusBefore.value = {
    childEnergy: childEnergy.value,
    childMood: childMood.value,
    outingPoint: outingPoint.value,
    parentEnergy: parentEnergy.value,
    parentStress: parentStress.value,
    minutes: currentMinutes.value,
  };
}

/* 行動の中身がぜんぶ終わったあとに呼ぶ
   「今の値 － 行動前の値」で、今回の変化量を作る

   この計算は行動につき1回だけ行うので、
   ・ランダムイベントの分
   ・いやいや発生の分
   ・再訪でポイントが1に減った分
   もぜんぶ合計された数になる

   ※ 必ず fixAllStatus()（0〜100に丸める処理）より前に呼ぶこと
     たとえば 親の体力が0のときに だっこ をすると、
     丸めたあとでは 0 のままなので「-15」が消えてしまう
     丸める前に計算することで、その行動にかかったコストがきちんと出る
*/
function saveStatusChanges() {
  statusChanges.value = {
    childEnergy: childEnergy.value - statusBefore.value.childEnergy,
    childMood: childMood.value - statusBefore.value.childMood,
    outingPoint: outingPoint.value - statusBefore.value.outingPoint,
    parentEnergy: parentEnergy.value - statusBefore.value.parentEnergy,
    parentStress: parentStress.value - statusBefore.value.parentStress,
    minutes: currentMinutes.value - statusBefore.value.minutes,
  };
}

/* 変化量を「+5」「-10」「0」の形の文字にする */
function formatChange(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

/* 変化が「良い」「悪い」「変化なし」のどれかを判定して、CSSのクラス名を返す

   ※ 単純に プラス＝良い ではないので注意
     ・親のイライラ度は、ふえるほど悪い（逆になる）
     ・時間は、どの行動でも必ずふえるので色はつけない
*/
function changeClass(statusName: string, value: number) {
  // 時間は良い・悪いで見ないので、いつも「変化なし」の色にする
  if (statusName === 'minutes') {
    return 'change--neutral';
  }

  if (value === 0) {
    return 'change--neutral';
  }

  // 親のイライラ度だけは、ふえると悪い変化
  if (statusName === 'parentStress') {
    return value > 0 ? 'change--bad' : 'change--good';
  }

  // それ以外（体力・機嫌・ポイント）は、ふえると良い変化
  return value > 0 ? 'change--good' : 'change--bad';
}

/* 中央の「今回の変化」に並べる6項目
   表示する名前・数字・色のクラス名をまとめておく
*/
const changeRows = computed(() => {
  const changes = statusChanges.value;

  // まだ今回の行動結果がないときは、からっぽにする
  if (changes === null) {
    return [];
  }

  return [
    { label: 'こうちゃんの体力', text: formatChange(changes.childEnergy), className: changeClass('childEnergy', changes.childEnergy) },
    { label: 'こうちゃんの機嫌', text: formatChange(changes.childMood), className: changeClass('childMood', changes.childMood) },
    { label: 'おでかけポイント', text: formatChange(changes.outingPoint), className: changeClass('outingPoint', changes.outingPoint) },
    { label: '親の体力', text: formatChange(changes.parentEnergy), className: changeClass('parentEnergy', changes.parentEnergy) },
    { label: '親のイライラ度', text: formatChange(changes.parentStress), className: changeClass('parentStress', changes.parentStress) },
    { label: 'かかった時間', text: `${formatChange(changes.minutes)}分`, className: changeClass('minutes', changes.minutes) },
  ];
});

/* GAME OVER画面に出す「最後の行動」の内訳
   中央の changeRows とちがって「行動前 → 行動後」も一緒に出すので、
   親の体力 10 → 0（-15） のように、なぜ限界になったのかが分かる
*/
const lastActionRows = computed(() => {
  const changes = statusChanges.value;

  // 直前の行動の結果がないときは、からっぽにする
  if (changes === null) {
    return [];
  }

  const before = statusBefore.value;

  return [
    { label: 'こうちゃんの体力', before: before.childEnergy, after: childEnergy.value, text: formatChange(changes.childEnergy), className: changeClass('childEnergy', changes.childEnergy) },
    { label: 'こうちゃんの機嫌', before: before.childMood, after: childMood.value, text: formatChange(changes.childMood), className: changeClass('childMood', changes.childMood) },
    { label: 'おでかけポイント', before: before.outingPoint, after: outingPoint.value, text: formatChange(changes.outingPoint), className: changeClass('outingPoint', changes.outingPoint) },
    { label: '親の体力', before: before.parentEnergy, after: parentEnergy.value, text: formatChange(changes.parentEnergy), className: changeClass('parentEnergy', changes.parentEnergy) },
    { label: '親のイライラ度', before: before.parentStress, after: parentStress.value, text: formatChange(changes.parentStress), className: changeClass('parentStress', changes.parentStress) },
  ];
});

/* その場所を探検済みかどうか */
function isVisited(place: GameEvent) {
  return visitedPlaces.value.includes(place);
}

/* おでかけポイントを加える
   はじめての場所なら そのままのポイント
   2回目以降の場所なら 半分のポイント（小数点以下は切り捨て、最低1点）

   ※ 公園は6か所しかないので、2回目が1点しかもらえないと
     「全部まわったら、あとは帰るだけ」になってしまう
     半分もらえるようにすることで、体力が減ってきたときに
     「もう1か所あそぶ？ それとも帰る？」と迷えるようにしている
*/
function addOutingPoint(place: GameEvent, point: number) {
  if (isVisited(place)) {
    const halfPoint = Math.floor(point / 2);

    outingPoint.value += halfPoint < 1 ? 1 : halfPoint;
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

  // 演出用：この行動で新しく見つけたものとして覚えておく
  foundItemsThisAction.value.push(itemName);

  resultMessage.value += `\n「${itemName}」を見つけました！`;
}

/* ランダムイベント
   5回に1回くらい（20%）だけ起こる
   ※ ここに書く数字は「このハプニングだけの増減」
     中央の「今回の変化（合計）」は行動ぜんぶを足した数なので、
     たとえば 休む -10 ＋ ヒヤッ +10 なら 合計は 0 になる
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
    parentEnergy.value -= 8;
    resultMessage.value += '\n\nこうちゃんが急に「だっこ！」と言い出しました。\n親の体力 -8';
    return;
  }

  if (eventNumber === 2) {
    childMood.value += 5;
    resultMessage.value += '\n\n木の上にきれいな鳥を見つけました！\nこうちゃんの機嫌 +5';
    return;
  }

  parentStress.value += 10;
  resultMessage.value += '\n\nこうちゃんが転びそうになってヒヤッとしました。\n親のイライラ度 +10';
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
  parentStress.value += 12;

  resultMessage.value += '\n\nそのあと、こうちゃんが「いやー！」とほっぺをぷうっとふくらませて、その場にぺたんと座りこんでしまいました…';
}

/* GAME OVER判定
   ステータスが変わる行動のあとに、必ず最後に呼ぶ

   上から順番に見て、あてはまった時点でGAME OVERが決まる
   ① 親の体力が0以下      → 親がもう動けない
   ② 親のイライラ度が100以上 → 親の心の余裕がなくなった
   ③ こうちゃんの体力が0以下 → 強制帰宅エンド（だっこで帰る）

   ※ 必ず fixAllStatus()（0〜100に丸める処理）のあとに呼ぶこと
     内部で -5 のようなマイナスになっていても、0に丸めてから判定する

   ※ GAME OVERになったら currentEvent を 'gameOver' にする
     これで画面がすぐGAME OVER画面に切り替わり、続きは遊べなくなる
*/
function checkGameOver() {
  // すでにGAME OVERになっているときは、理由を上書きしない
  if (currentEvent.value === 'gameOver') {
    return;
  }

  // ① 親の体力が0以下
  if (parentEnergy.value <= 0) {
    gameOverTitle.value = '親の体力が限界！';
    gameOverMessage.value = 'もうこれ以上は動けません……。こうちゃんを連れて、公園から撤退しました。';
    currentEvent.value = 'gameOver';
    return;
  }

  // ② 親のイライラ度が100以上
  if (parentStress.value >= 100) {
    gameOverTitle.value = 'イライラ限界！';
    gameOverMessage.value = '親の心の余裕がなくなってしまいました。今日はここで公園探検を終了します。';
    currentEvent.value = 'gameOver';
    return;
  }

  // ③ こうちゃんの体力が0以下（強制帰宅エンド）
  if (childEnergy.value <= 0) {
    gameOverTitle.value = 'こうちゃん電池切れ！';
    gameOverMessage.value = 'たくさん遊んで、こうちゃんはもうクタクタ。だっこで公園をあとにしました。';
    currentEvent.value = 'gameOver';
    return;
  }
}

/* 場所で1つ行動したあとの共通処理
   ① その場所を探検済みにする
   ② たまにランダムイベントが起こる
   ③ いやいやが始まるか判定する
   ④ 今回の変化量を記録する（ランダムイベントといやいやの分もふくむ）
   ⑤ ステータスを0〜100に収める
   ⑥ GAME OVERになっていないか判定する
   ※ いやいやをなだめる行動では呼ばない（ランダムイベントを起こさないため）

   ⑥をいちばん最後に置いているので、
   ランダムイベントの「だっこ！」で親の体力が0になった場合も、
   いやいや発生でイライラ度が100になった場合も、まとめてGAME OVERになる
*/
function finishPlayAction(place: GameEvent) {
  addVisitedPlace(place);
  runRandomEvent();
  checkTantrum();
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ゲーム開始 */
function startGame() {
  gameStarted.value = true;

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* 場所を移動する
   移動すると前の結果メッセージと変化量の表示は消す
*/
function goToPlace(place: GameEvent) {
  resultMessage.value = '';
  statusChanges.value = null;
  currentEvent.value = place;

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* 次の場所を選びに行く
   ① いやいや中なら、まずはなだめる場面へ
   ② 12:00を過ぎていたら、もう探検は続けられないのでゴールへ
*/
function goToNextPlace() {
  // GAME OVER後にうっかり別の画面へ動いてしまわないようにする
  if (currentEvent.value === 'gameOver') {
    return;
  }

  resultMessage.value = '';
  statusChanges.value = null;

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;

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
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 18;
  childMood.value += 6;
  addOutingPoint('slide', 6);
  parentEnergy.value -= 17;
  parentStress.value += 6;
  addMinutes(25);

  resultMessage.value = 'こうちゃんと一緒にすべりました。大喜びです！';

  addCollectedItem('赤い葉っぱ');
  finishPlayAction('slide');
}

/* ② 下で見守る */
function watchSlide() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 12;
  childMood.value += 2;
  addOutingPoint('slide', 4);
  parentEnergy.value -= 4;
  parentStress.value += 2;
  addMinutes(15);

  resultMessage.value = '下から見守りました。こうちゃんは楽しそうにすべっています。';

  finishPlayAction('slide');
}

/* ===== 砂場 ===== */

/* ① 一緒に大きな山を作る */
function playSandbox() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 13;
  childMood.value += 5;
  addOutingPoint('sandbox', 6);
  parentEnergy.value -= 14;
  parentStress.value += 5;
  addMinutes(25);

  resultMessage.value = '一緒に大きな山を作りました。こうちゃんは夢中です！';

  addCollectedItem('きれいな石');
  finishPlayAction('sandbox');
}

/* ② ベンチから見守る */
function watchFromBench() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 10;
  childMood.value += 2;
  addOutingPoint('sandbox', 4);
  parentEnergy.value += 4;
  parentStress.value += 2;
  addMinutes(20);

  resultMessage.value = 'ベンチから見守りました。こうちゃんは楽しそうに遊んでいます。';

  finishPlayAction('sandbox');
}

/* ===== どんぐりの木 ===== */

/* ① 一緒にどんぐりを拾う */
function collectAcorns() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 11;
  childMood.value += 6;
  addOutingPoint('acornArea', 8);
  parentEnergy.value -= 12;
  parentStress.value += 4;
  addMinutes(20);

  resultMessage.value = 'こうちゃんは夢中でどんぐりを拾っています！';

  addCollectedItem('大きなどんぐり');
  finishPlayAction('acornArea');
}

/* ② 木かげで少し休む */
function takeBreak() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value += 12;
  childMood.value -= 6;
  addOutingPoint('acornArea', 1);
  parentEnergy.value += 14;
  parentStress.value -= 10;
  addMinutes(20);

  resultMessage.value = '木かげで少し休みました。親の体力が回復しました。';

  finishPlayAction('acornArea');
}

/* ===== 池 ===== */

/* ① 白鳥を近くで見る */
function watchSwansClose() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 11;
  childMood.value += 8;
  addOutingPoint('pond', 9);
  parentEnergy.value -= 16;
  parentStress.value += 10;
  addMinutes(20);

  resultMessage.value = '白鳥を近くで見ました。こうちゃんは大興奮です！';

  addCollectedItem('白い羽');
  finishPlayAction('pond');
}

/* ② 少し離れて見る */
function watchSwansFar() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 6;
  childMood.value += 2;
  addOutingPoint('pond', 5);
  parentEnergy.value -= 3;
  parentStress.value += 2;
  addMinutes(15);

  resultMessage.value = '少し離れて白鳥を見ました。落ち着いてながめられました。';

  addCollectedItem('白い羽');
  finishPlayAction('pond');
}

/* ===== 丘 ===== */

/* ① 走って丘をのぼる */
function runUpHill() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 24;
  childMood.value += 8;
  addOutingPoint('hill', 11);
  parentEnergy.value -= 21;
  parentStress.value += 7;
  addMinutes(25);

  resultMessage.value = '丘のてっぺんまで走ってのぼりました。公園全体が見わたせます！';

  addCollectedItem('黄色い花');
  finishPlayAction('hill');
}

/* ② ゆっくり歩いてのぼる */
function walkUpHill() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 12;
  childMood.value += 3;
  addOutingPoint('hill', 6);
  parentEnergy.value -= 10;
  parentStress.value += 4;
  addMinutes(20);

  resultMessage.value = 'ゆっくり歩いてのぼりました。途中の花を見つけて楽しめました。';

  addCollectedItem('黄色い花');
  finishPlayAction('hill');
}

/* ===== 秘密の場所 ===== */

/* ① 秘密基地で遊ぶ */
function playSecretBase() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 16;
  childMood.value += 10;
  addOutingPoint('secretSpot', 15);
  parentEnergy.value -= 17;
  parentStress.value += 3;
  addMinutes(25);

  resultMessage.value = '木のトンネルの奥は秘密基地でした。こうちゃんは目をかがやかせています！';

  addCollectedItem('ふしぎな形の枝');
  finishPlayAction('secretSpot');
}

/* ② 二人で景色をながめる */
function enjoySecretView() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value += 6;
  childMood.value += 4;
  addOutingPoint('secretSpot', 9);
  parentEnergy.value += 5;
  parentStress.value -= 10;
  addMinutes(20);

  resultMessage.value = '二人でならんで景色をながめました。とても穏やかな時間です。';

  finishPlayAction('secretSpot');
}

/* ===== いやいや中（なだめる場面） ===== */

/* ① だっこしてなだめる */
function hugChild() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value += 12;
  childMood.value += 15;
  parentEnergy.value -= 16;
  parentStress.value -= 10;
  addMinutes(10);

  isTantrum.value = false;

  resultMessage.value = 'ぎゅっとだっこすると、しばらく足をぱたぱたさせていましたが、そのうち肩にことんと頭をあずけてきました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // だっこは親の体力を15も使うので、残りが少ないとここでGAME OVERになる
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② おやつをあげる */
function giveSnack() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value += 22;
  childMood.value += 8;
  outingPoint.value += 2;
  parentEnergy.value -= 5;
  parentStress.value -= 6;
  addMinutes(10);

  snackLeft.value -= 1;
  isTantrum.value = false;

  resultMessage.value = 'おやつをそっと見せると、涙のたまった目で「……たべる」。ほっぺをふくらませたまま、もぐもぐ食べ始めました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // おやつは安全な選択だが、念のためここでも判定しておく
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ 少し待ってみる */
function waitCalmly() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 4;
  childMood.value -= 6;
  parentEnergy.value += 2;
  parentStress.value += 14;
  addMinutes(15);

  isTantrum.value = false;

  resultMessage.value = 'となりにしゃがんで待ちました。ときどきこちらをちらっと見ながら、泣き声は少しずつ小さくなっていきます。まだ少しだけごきげんななめです。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // 待つのはイライラ度が8ふえるので、たまっているとここでGAME OVERになる
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
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
  if (outingPoint.value >= 50 && parentEnergy.value >= 30 && childMood.value >= 50 && isSecretVisited && isBackInTime) {
    endingRank.value = 'Sランク';
    endingTitle.value = '公園探検マスター！';
    endingMessage.value = '秘密の場所まで見つけて、時間ぴったりに帰ってこられました。こうちゃんも親も大満足の完ぺきな1日です！';
    return;
  }

  // ③ Aランク
  if (outingPoint.value >= 30 && parentEnergy.value >= 15 && childMood.value >= 30 && isBackInTime) {
    endingRank.value = 'Aランク';
    endingTitle.value = '最高のおでかけ！';
    endingMessage.value = 'いろいろな場所を回って、お昼までにちゃんと帰ってこられました。「またこようね！」';
    return;
  }

  // ④ Cランク
  if (parentEnergy.value < 15 || !isBackInTime) {
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
  // GAME OVERになったときは、S/A/B/Cランクの判定はしない
  if (currentEvent.value === 'gameOver') {
    return;
  }

  resultMessage.value = '';
  statusChanges.value = null;
  addMinutes(10);

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
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
  statusChanges.value = null;
  endingRank.value = '';
  endingTitle.value = '';
  endingMessage.value = '';

  // 演出用に控えていたものも空に戻す
  foundItemsThisAction.value = [];

  // 今回追加したGAME OVER用のstateも空に戻す
  gameOverTitle.value = '';
  gameOverMessage.value = '';

  // 行動前の控えも0に戻しておく（前回の記録が残らないようにする）
  statusBefore.value = {
    childEnergy: 0,
    childMood: 0,
    outingPoint: 0,
    parentEnergy: 0,
    parentStress: 0,
    minutes: 0,
  };

  currentEvent.value = 'parkEntrance';
  gameStarted.value = false;

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ============================================================
   キーボード操作（各場所の「どうする？」コマンドボックス）

   ・↑        1つ上のコマンドへ移動する
   ・↓        1つ下のコマンドへ移動する
   ・Enter    選択中のコマンドを実行する
   ・Space    Enterと同じく、選択中のコマンドを実行する

   これまでどおりマウスのクリックでも遊べる（クリック操作はそのまま）
   ※ タイトル画面・公園入口・ゴール・GAME OVERは今回の対象外
   ============================================================ */

/* ↑：1つ上のコマンドへ移動する
   一番上（0）でさらに上を押したときは、一番下へ回りこむ
   例）3つあるとき 0 → 2 → 1 → 0 …
*/
function moveCommandUp() {
  // すでに一番上にいるなら、一番下（コマンド数 - 1）へ回りこむ
  if (selectedCommandIndex.value <= 0) {
    selectedCommandIndex.value = commandCount.value - 1;
    return;
  }

  selectedCommandIndex.value -= 1;
}

/* ↓：1つ下のコマンドへ移動する
   一番下でさらに下を押したときは、一番上（0）へ戻る
   例）3つあるとき 0 → 1 → 2 → 0 …
*/
function moveCommandDown() {
  // すでに一番下にいるなら、一番上（0）へ戻る
  if (selectedCommandIndex.value >= commandCount.value - 1) {
    selectedCommandIndex.value = 0;
    return;
  }

  selectedCommandIndex.value += 1;
}

/* ===== ここから下は、公園入口（3列にならぶコマンド）のための処理 ===== */

/* 公園入口のコマンドが、いま何列で並んでいるか
   CSSと同じ幅で切り替える
   ・901px以上   … 3列
   ・900px以下   … 2列
   ・700px以下   … 1列
*/
const entranceColumns = ref(3);

/* いまの画面幅を見て、列の数を updateする
   画面が表示されたときと、幅が変わったときに呼ぶ
*/
function updateEntranceColumns() {
  if (window.matchMedia('(max-width: 700px)').matches) {
    entranceColumns.value = 1;
    return;
  }

  if (window.matchMedia('(max-width: 900px)').matches) {
    entranceColumns.value = 2;
    return;
  }

  entranceColumns.value = 3;
}

/* ↑：公園入口では「1行ぶん（列の数ぶん）」上へ動かす
   例）3列のとき 池(3) の1つ上は すべり台(0)

   ※ 「公園の出口へ向かう（ゴール）」だけは、CSSで横1行をまるごと使っている
     （.cmd--goal の grid-column: 1 / -1）ので、列のマス目には入っていない
     そのため、ゴールはいちばん下の1行として別あつかいで計算する

     [すべり台] [砂場] [どんぐり]
     [池]       [丘]   [秘密]
     [───── ゴール ─────]   ← 横いっぱいの1行
*/
function moveEntranceUp() {
  const columns = entranceColumns.value;

  // ゴールの番号は、そのまま「行き先の数」でもある
  // （行き先が 0〜4 の5つなら、ゴールは5番）
  const goalIndex = goalCommandIndex.value;

  // いまゴールの行にいるなら、そのすぐ上（行き先の一番うしろ）へ
  if (selectedCommandIndex.value === goalIndex) {
    selectedCommandIndex.value = goalIndex - 1;
    return;
  }

  // 1行ぶん上へ
  const next = selectedCommandIndex.value - columns;

  // 上にはみ出した＝いちばん上の行にいたので、いちばん下のゴールへ回りこむ
  if (next < 0) {
    selectedCommandIndex.value = goalIndex;
    return;
  }

  selectedCommandIndex.value = next;
}

/* ↓：公園入口では「1行ぶん（列の数ぶん）」下へ動かす
   行き先のいちばん下の行から↓を押すと、その下にあるゴールへ進む
   ゴールからさらに↓を押すと、いちばん上のコマンドへ戻る
*/
function moveEntranceDown() {
  const columns = entranceColumns.value;
  const goalIndex = goalCommandIndex.value;

  // いまゴールの行にいるなら、いちばん上のコマンドへ戻る
  if (selectedCommandIndex.value === goalIndex) {
    selectedCommandIndex.value = 0;
    return;
  }

  // 1行ぶん下へ
  const next = selectedCommandIndex.value + columns;

  // 行き先の下にはもう行がない＝いちばん下の行にいたので、ゴールへ進む
  if (next >= goalIndex) {
    selectedCommandIndex.value = goalIndex;
    return;
  }

  selectedCommandIndex.value = next;
}

/* Enter / Space を押したときに、いま選んでいるコマンドを実行する

   やっていることは「マウスでクリックしたときと同じ関数を呼ぶ」だけ
   今いる場所（currentEvent）と番号（selectedCommandIndex）の組み合わせで、
   どの関数を呼ぶかを決めている
*/
function runSelectedCommand() {
  // 結果表示中は「次の場所を選ぶ」しか出ていないので、それを実行する
  if (resultMessage.value) {
    goToNextPlace();
    return;
  }

  // 毎回 .value と書かなくてよいように、番号を取り出しておく
  const index = selectedCommandIndex.value;

  switch (currentEvent.value) {
    /* 公園入口
       0 すべり台／1 砂場／2 どんぐりの木／3 池／4 丘
       5 秘密の場所（見つけているときだけ画面に出る）
       最後 公園の出口へ向かう（ゴール）

       ※ 秘密の場所がまだ出ていないときは、その行が画面に無いので
         ゴールが1つくり上がって5番目になる（goalCommandIndex で見る）
    */
    case 'parkEntrance':
      if (index === 0) {
        goToPlace('slide');
      } else if (index === 1) {
        goToPlace('sandbox');
      } else if (index === 2) {
        goToPlace('acornArea');
      } else if (index === 3) {
        goToPlace('pond');
      } else if (index === 4) {
        goToPlace('hill');
      } else if (index === 5 && canEnterSecretSpot.value) {
        goToPlace('secretSpot');
      } else if (index === goalCommandIndex.value) {
        goToGoal();
      }
      break;

    /* すべり台
       0 一緒にすべる／1 下で見守る／2 べつの場所へ行く */
    case 'slide':
      if (index === 0) {
        playSlide();
      } else if (index === 1) {
        watchSlide();
      } else if (index === 2) {
        goToNextPlace();
      }
      break;

    /* 砂場
       0 一緒に大きな山を作る／1 ベンチから見守る／2 べつの場所へ行く */
    case 'sandbox':
      if (index === 0) {
        playSandbox();
      } else if (index === 1) {
        watchFromBench();
      } else if (index === 2) {
        goToNextPlace();
      }
      break;

    /* どんぐりの木
       0 一緒にどんぐりを拾う／1 木かげで少し休む／2 べつの場所へ行く */
    case 'acornArea':
      if (index === 0) {
        collectAcorns();
      } else if (index === 1) {
        takeBreak();
      } else if (index === 2) {
        goToNextPlace();
      }
      break;

    /* 池
       0 白鳥を近くで見る／1 少し離れて見る／2 べつの場所へ行く */
    case 'pond':
      if (index === 0) {
        watchSwansClose();
      } else if (index === 1) {
        watchSwansFar();
      } else if (index === 2) {
        goToNextPlace();
      }
      break;

    /* 丘
       0 走って丘をのぼる／1 ゆっくり歩いてのぼる／2 べつの場所へ行く */
    case 'hill':
      if (index === 0) {
        runUpHill();
      } else if (index === 1) {
        walkUpHill();
      } else if (index === 2) {
        goToNextPlace();
      }
      break;

    /* 秘密の場所
       0 秘密基地で遊ぶ／1 二人で景色をながめる／2 べつの場所へ行く */
    case 'secretSpot':
      if (index === 0) {
        playSecretBase();
      } else if (index === 1) {
        enjoySecretView();
      } else if (index === 2) {
        goToNextPlace();
      }
      break;

    /* いやいやタイム
       おやつが残っているとき   0 だっこ／1 おやつをあげる／2 少し待ってみる
       おやつが0個のとき       0 だっこ／1 少し待ってみる（おやつの行は画面に無い）

       ※ おやつが0個のときに giveSnack() を呼んでしまわないように、
         必ず snackLeft を見てから決める
    */
    case 'tantrum':
      if (index === 0) {
        hugChild();
      } else if (index === 1 && snackLeft.value > 0) {
        giveSnack();
      } else if (index === waitCommandIndex.value) {
        // 「少し待ってみる」は、おやつがあれば3番目（2）、なければ2番目（1）
        waitCalmly();
      }
      break;
  }
}

/* キーボードのキーが押されたときの処理

   ここが今回のキーボード操作の入口
   ① キー操作しない画面なら、なにもしないで終わり
   ② ↑↓ならコマンドを動かす
   ③ Enter / Space なら、選択中のコマンドを実行する
*/
function handleKeydown(event: KeyboardEvent) {
  // Enter と Space は、どちらも同じ「決定」として扱う
  // Space は event.key では ' '（半角スペース1文字）になる
  const isDecideKey = event.key === 'Enter' || event.key === ' ';

  // ⓪ ボタンが1つしかない画面（タイトル・ゴール・GAME OVER）
  //    えらぶものが無いので ↑↓←→ は使わず、Enter / Space だけを受け取る
  //    矢印キーはブラウザにまかせるので、ページのスクロールはじゃましない
  if (!isCommandKeyboardActive.value) {
    if (isDecideKey) {
      // Spaceでページが下にスクロールするのを防ぐ
      event.preventDefault();

      // 押しっぱなしのときは、2回目以降を止める
      if (event.repeat) {
        return;
      }

      if (!gameStarted.value) {
        startGame(); // タイトル画面の「公園へ行く」
      } else {
        resetGame(); // ゴール／GAME OVER画面の「もう一度あそぶ」
      }
    }

    return;
  }

  // 公園入口だけは、コマンドが横にも並んでいる（3列・2列・1列）ので、
  // ↑↓の動きかたが他の場所とちがう
  const isEntrance = currentEvent.value === 'parkEntrance';

  // ① ↑：1つ上のコマンドへ
  if (event.key === 'ArrowUp') {
    // 矢印キーでページが上下にスクロールしてしまわないようにする
    event.preventDefault();

    if (isEntrance) {
      moveEntranceUp(); // 公園入口は1行ぶん（列の数ぶん）上へ
    } else {
      moveCommandUp(); // たて1列の場所は1つ上へ
    }
    return;
  }

  // ② ↓：1つ下のコマンドへ
  if (event.key === 'ArrowDown') {
    event.preventDefault();

    if (isEntrance) {
      moveEntranceDown(); // 公園入口は1行ぶん（列の数ぶん）下へ
    } else {
      moveCommandDown(); // たて1列の場所は1つ下へ
    }
    return;
  }

  // ③ ← →：となりのコマンドへ1つ動かす（公園入口だけ）
  //    各場所の「どうする？」はたて1列なので、左右キーは使わない
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (!isEntrance) {
      return;
    }

    // 矢印キーでページが左右にスクロールしてしまわないようにする
    event.preventDefault();

    // 1つずつ動かすだけなので、たて1列のときの ↑↓ と同じ関数が使える
    if (event.key === 'ArrowLeft') {
      moveCommandUp(); // ← は1つ前へ
    } else {
      moveCommandDown(); // → は1つ次へ
    }
    return;
  }

  // ④ Enter / Space：いま選んでいるコマンドを実行する
  if (isDecideKey) {
    // Spaceでページが下にスクロールするのを防ぐ
    // （フォーカスの当たったボタンが二重に押されるのも、これで防げる）
    event.preventDefault();

    // 押しっぱなし（長押し）のときは、同じ行動が何度も実行されてしまうので、
    // 2回目以降のkeydownはここで止める
    if (event.repeat) {
      return;
    }

    runSelectedCommand();
    return;
  }
}

/* 画面が表示されたら、キーボードの受付をはじめる
   公園入口の「列の数」は画面幅で変わるので、最初に1回調べて、
   そのあとは幅が変わるたびに調べ直す
*/
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);

  updateEntranceColumns();
  window.addEventListener('resize', updateEntranceColumns);
});

/* 画面から離れるときは、受付をやめる（後始末） */
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', updateEntranceColumns);
});
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
            2回目からは半分になりますが、それでもポイントは増やせます。
            <br />
            こうちゃんと親の体力にも気をつけながら、たくさん探検してみよう！
          </p>
        </div>

        <button class="cmd cmd--start cmd--single" @click="startGame">公園へ行く</button>
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

            <!-- 直前の行動でかかった時間（結果を表示している間だけ出す） -->
            <span v-if="statusChanges && statusChanges.minutes !== 0" class="status-change">{{ formatChange(statusChanges.minutes) }}分</span>
          </span>
        </div>

        <ul class="status-list">
          <li class="status-item" :class="{ 'status-item--danger': isChildEnergyDanger }">
            <span class="status-item__label"><span v-if="isChildEnergyDanger" class="status-item__alert">⚠</span>こうちゃんの体力</span>
            <span class="status-item__value">{{ childEnergy }}</span>
            <span v-if="statusChanges && statusChanges.childEnergy !== 0" class="status-change" :class="changeClass('childEnergy', statusChanges.childEnergy)">{{ formatChange(statusChanges.childEnergy) }}</span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-energy" :style="{ width: childEnergy + '%' }"></span>
            </span>
          </li>

          <li class="status-item">
            <span class="status-item__label">こうちゃんの機嫌</span>
            <span class="status-item__value">{{ childMood }}</span>
            <span v-if="statusChanges && statusChanges.childMood !== 0" class="status-change" :class="changeClass('childMood', statusChanges.childMood)">{{ formatChange(statusChanges.childMood) }}</span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-mood" :style="{ width: childMood + '%' }"></span>
            </span>
          </li>

          <li class="status-item" :class="{ 'status-item--danger': isParentEnergyDanger }">
            <span class="status-item__label"><span v-if="isParentEnergyDanger" class="status-item__alert">⚠</span>親の体力</span>
            <span class="status-item__value">{{ parentEnergy }}</span>
            <span v-if="statusChanges && statusChanges.parentEnergy !== 0" class="status-change" :class="changeClass('parentEnergy', statusChanges.parentEnergy)">{{ formatChange(statusChanges.parentEnergy) }}</span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--parent-energy" :style="{ width: parentEnergy + '%' }"></span>
            </span>
          </li>

          <li class="status-item" :class="{ 'status-item--danger': isParentStressDanger }">
            <span class="status-item__label"><span v-if="isParentStressDanger" class="status-item__alert">⚠</span>親のイライラ度</span>
            <span class="status-item__value">{{ parentStress }}</span>
            <span v-if="statusChanges && statusChanges.parentStress !== 0" class="status-change" :class="changeClass('parentStress', statusChanges.parentStress)">{{ formatChange(statusChanges.parentStress) }}</span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--parent-stress" :style="{ width: parentStress + '%' }"></span>
            </span>
          </li>
        </ul>

        <div class="status-pills">
          <span class="pill pill--point">おでかけポイント<b>{{ outingPoint }}</b><span v-if="statusChanges && statusChanges.outingPoint !== 0" class="status-change" :class="changeClass('outingPoint', statusChanges.outingPoint)">{{ formatChange(statusChanges.outingPoint) }}</span></span>

          <span class="pill pill--snack">おやつ残り<b>{{ snackLeft }}</b>個</span>
        </div>

        <div class="status-found">
          <span class="status-found__label">見つけたもの</span>

          <span v-if="collectedItems.length === 0" class="status-found__empty">まだなし</span>

          <ul v-else class="status-found__list">
            <li v-for="item in collectedItems" :key="item" class="status-found__item">{{ item }}</li>
          </ul>
        </div>

        <!-- 危険な状態の警告（GAME OVERになる前の合図） -->
        <ul v-if="dangerWarnings.length > 0" class="status-warnings">
          <li v-for="warning in dangerWarnings" :key="warning" class="status-warnings__item">{{ warning }}</li>
        </ul>

        <!-- そろそろお昼のお知らせ -->
        <p v-if="isAlmostNoon" class="status-notice">そろそろお昼の時間です。公園の出口へ向かいましょう。</p>
      </header>

      <!-- ==========================================================
           【中央】イベント表示 ＋ 【下部】コマンド欄
           場面ごとに .stage（中央）と .command（下部）を並べる
           ========================================================== -->

      <!-- 場面の切り替え
           前の場面がすっと消えてから、次の場面がふわっと出るようにする
           mode="out-in" ＝ 前が消えきってから次を出す（重ならないので位置がずれない） -->
      <Transition name="scene" mode="out-in">
        <!-- 公園入口 -->
        <div v-if="currentEvent === 'parkEntrance'" class="scene" :key="currentEvent">
          <section class="stage">
            <article class="place-card">
              <h2 class="place-card__title">公園入口</h2>

              <p class="place-card__text">こうちゃんと公園にやってきました。どこへ探検に行こう？</p>
            </article>

            <!-- 秘密の場所は「ポイント20以上」かつ「見つけたもの3種類以上」で解放 -->
            <article v-if="canEnterSecretSpot" class="place-card place-card--secret">
              <h3 class="place-card__subtitle">秘密の場所を発見！</h3>

              <p class="place-card__text">公園の奥に、知らない道を見つけました。行ってみよう！</p>
            </article>
          </section>

          <nav class="command">
            <p class="command__label">どこへ行く？</p>

            <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="goToPlace('slide')" @mouseenter="selectedCommandIndex = 0">
              <span class="cmd__text">すべり台へ行く</span>
              <span v-if="isVisited('slide')" class="cmd__badge">探検済み</span>
            </button>

            <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 1 }" @click="goToPlace('sandbox')" @mouseenter="selectedCommandIndex = 1">
              <span class="cmd__text">砂場へ行く</span>
              <span v-if="isVisited('sandbox')" class="cmd__badge">探検済み</span>
            </button>

            <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 2 }" @click="goToPlace('acornArea')" @mouseenter="selectedCommandIndex = 2">
              <span class="cmd__text">どんぐりの木へ行く</span>
              <span v-if="isVisited('acornArea')" class="cmd__badge">探検済み</span>
            </button>

            <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 3 }" @click="goToPlace('pond')" @mouseenter="selectedCommandIndex = 3">
              <span class="cmd__text">池へ行く</span>
              <span v-if="isVisited('pond')" class="cmd__badge">探検済み</span>
            </button>

            <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 4 }" @click="goToPlace('hill')" @mouseenter="selectedCommandIndex = 4">
              <span class="cmd__text">丘へ行く</span>
              <span v-if="isVisited('hill')" class="cmd__badge">探検済み</span>
            </button>

            <button v-if="canEnterSecretSpot" class="cmd cmd--secret" :class="{ 'cmd--selected': selectedCommandIndex === 5 }" @click="goToPlace('secretSpot')" @mouseenter="selectedCommandIndex = 5">
              <span class="cmd__text">秘密の場所へ行く</span>
              <span v-if="isVisited('secretSpot')" class="cmd__badge">探検済み</span>
            </button>

            <button class="cmd cmd--goal" :class="{ 'cmd--selected': selectedCommandIndex === goalCommandIndex }" @click="goToGoal" @mouseenter="selectedCommandIndex = goalCommandIndex">
              <span class="cmd__text">公園の出口へ向かう（ゴール）</span>
            </button>
          </nav>
        </div>

        <!-- すべり台 -->
        <div v-else-if="currentEvent === 'slide'" class="scene" :key="currentEvent">
          <section class="stage">
            <article class="place-card">
              <h2 class="place-card__title">すべり台</h2>

              <p class="place-card__text">大きなすべり台があります。こうちゃんは階段をのぼりはじめました。</p>
            </article>

            <!-- 結果が出たあと -->
            <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
              <h3 class="result-card__title">結果</h3>

              <!-- いやいやが起きたときだけ出す（カードも軽く左右に揺れる） -->
              <p v-if="isTantrum" class="result-alert">いやいや発生！</p>

              <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
              <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                <span class="found-flash__label">★ アイテム発見！</span>
                <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
              </p>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>
                    <span class="change-item__value" :class="row.className">{{ row.text }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
            <nav class="command-box">
              <!-- 結果がまだ無いとき -->
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="playSlide" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">一緒にすべる</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="watchSlide" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">下で見守る</span>
                </button>

                <button class="command-box__item command-box__item--sub" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">次の場所を選ぶ</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 砂場 -->
        <div v-else-if="currentEvent === 'sandbox'" class="scene" :key="currentEvent">
          <section class="stage">
            <article class="place-card">
              <h2 class="place-card__title">砂場</h2>

              <p class="place-card__text">こうちゃんはさっそくスコップを手に取りました。</p>
            </article>

            <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
              <h3 class="result-card__title">結果</h3>

              <!-- いやいやが起きたときだけ出す（カードも軽く左右に揺れる） -->
              <p v-if="isTantrum" class="result-alert">いやいや発生！</p>

              <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
              <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                <span class="found-flash__label">★ アイテム発見！</span>
                <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
              </p>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>
                    <span class="change-item__value" :class="row.className">{{ row.text }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
            <nav class="command-box">
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="playSandbox" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">一緒に大きな山を作る</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="watchFromBench" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">ベンチから見守る</span>
                </button>

                <button class="command-box__item command-box__item--sub" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">次の場所を選ぶ</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- どんぐりの木 -->
        <div v-else-if="currentEvent === 'acornArea'" class="scene" :key="currentEvent">
          <section class="stage">
            <article class="place-card">
              <h2 class="place-card__title">どんぐりの木</h2>

              <p class="place-card__text">大きな木の下に、どんぐりがたくさん落ちています。</p>
            </article>

            <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
              <h3 class="result-card__title">結果</h3>

              <!-- いやいやが起きたときだけ出す（カードも軽く左右に揺れる） -->
              <p v-if="isTantrum" class="result-alert">いやいや発生！</p>

              <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
              <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                <span class="found-flash__label">★ アイテム発見！</span>
                <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
              </p>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>
                    <span class="change-item__value" :class="row.className">{{ row.text }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
            <nav class="command-box">
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="collectAcorns" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">一緒にどんぐりを拾う</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="takeBreak" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">木かげで少し休む</span>
                </button>

                <button class="command-box__item command-box__item--sub" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">次の場所を選ぶ</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 池 -->
        <div v-else-if="currentEvent === 'pond'" class="scene" :key="currentEvent">
          <section class="stage">
            <article class="place-card">
              <h2 class="place-card__title">池</h2>

              <p class="place-card__text">池には白鳥が泳いでいます。こうちゃんは指をさして大はしゃぎです。</p>
            </article>

            <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
              <h3 class="result-card__title">結果</h3>

              <!-- いやいやが起きたときだけ出す（カードも軽く左右に揺れる） -->
              <p v-if="isTantrum" class="result-alert">いやいや発生！</p>

              <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
              <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                <span class="found-flash__label">★ アイテム発見！</span>
                <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
              </p>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>
                    <span class="change-item__value" :class="row.className">{{ row.text }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
            <nav class="command-box">
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="watchSwansClose" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">白鳥を近くで見る</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="watchSwansFar" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">少し離れて見る</span>
                </button>

                <button class="command-box__item command-box__item--sub" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">次の場所を選ぶ</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 丘 -->
        <div v-else-if="currentEvent === 'hill'" class="scene" :key="currentEvent">
          <section class="stage">
            <article class="place-card">
              <h2 class="place-card__title">丘</h2>

              <p class="place-card__text">ゆるやかな丘があります。てっぺんまでのぼれそうです。</p>
            </article>

            <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
              <h3 class="result-card__title">結果</h3>

              <!-- いやいやが起きたときだけ出す（カードも軽く左右に揺れる） -->
              <p v-if="isTantrum" class="result-alert">いやいや発生！</p>

              <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
              <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                <span class="found-flash__label">★ アイテム発見！</span>
                <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
              </p>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>
                    <span class="change-item__value" :class="row.className">{{ row.text }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
            <nav class="command-box">
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="runUpHill" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">走って丘をのぼる</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="walkUpHill" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">ゆっくり歩いてのぼる</span>
                </button>

                <button class="command-box__item command-box__item--sub" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">次の場所を選ぶ</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 秘密の場所 -->
        <div v-else-if="currentEvent === 'secretSpot'" class="scene" :key="currentEvent">
          <section class="stage">
            <article class="place-card place-card--secret">
              <h2 class="place-card__title">秘密の場所</h2>

              <p class="place-card__text">しげみのおくに、細い道を見つけました。こうちゃんが手を引いて進みます。</p>
            </article>

            <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
              <h3 class="result-card__title">結果</h3>

              <!-- いやいやが起きたときだけ出す（カードも軽く左右に揺れる） -->
              <p v-if="isTantrum" class="result-alert">いやいや発生！</p>

              <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
              <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                <span class="found-flash__label">★ アイテム発見！</span>
                <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
              </p>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>
                    <span class="change-item__value" :class="row.className">{{ row.text }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
            <nav class="command-box">
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="playSecretBase" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">秘密基地で遊ぶ</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="enjoySecretView" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">二人で景色をながめる</span>
                </button>

                <button class="command-box__item command-box__item--sub" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">次の場所を選ぶ</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- いやいや中 -->
        <div v-else-if="currentEvent === 'tantrum'" class="scene" :key="currentEvent">
          <section class="stage">
            <article class="place-card place-card--tantrum">
              <h2 class="place-card__title">いやいやタイム！</h2>

              <p class="place-card__text">こうちゃんがほっぺをふくらませて、その場にぺたんと座りこんでしまいました。 なにを言っても「いや！」のいってんばりですが、ときどきこちらをちらっと見ています。</p>
            </article>

            <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
              <h3 class="result-card__title">結果</h3>

              <!-- いやいやが起きたときだけ出す（カードも軽く左右に揺れる） -->
              <p v-if="isTantrum" class="result-alert">いやいや発生！</p>

              <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
              <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                <span class="found-flash__label">★ アイテム発見！</span>
                <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
              </p>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>
                    <span class="change-item__value" :class="row.className">{{ row.text }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
            <nav class="command-box">
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="hugChild" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">だっこしてなだめる</span>
                </button>

                <button v-if="snackLeft > 0" class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="giveSnack" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">おやつをあげる</span>
                  <span class="command-box__badge">残り{{ snackLeft }}個</span>
                </button>

                <p v-else class="command-box__note">おやつは、もうぜんぶ食べてしまいました…</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === waitCommandIndex }" @click="waitCalmly" @mouseenter="selectedCommandIndex = waitCommandIndex">
                  <span class="command-box__text">少し待ってみる</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">次の場所を選ぶ</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- ゴール -->
        <div v-else-if="currentEvent === 'goal'" class="scene" :key="currentEvent">
          <section class="stage">
            <article class="place-card">
              <h2 class="place-card__title">公園の出口</h2>

              <p class="place-card__text">たくさん探検しました。そろそろ公園から帰る時間です。</p>
            </article>

            <article class="ending-card" :class="{ 'ending-card--s': endingRank === 'Sランク' }">
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
            <button class="cmd cmd--next cmd--single" @click="resetGame">
              <span class="cmd__text">もう一度あそぶ</span>
            </button>
          </nav>
        </div>

        <!-- GAME OVER（限界をむかえて途中で終わったとき）
             自分で出口へ帰ったときとちがい、S/A/B/Cランクの判定はしない -->
        <div v-else-if="currentEvent === 'gameOver'" class="scene scene--gameover" :key="currentEvent">
          <section class="stage">
            <article class="gameover-card">
              <p class="gameover-card__label">GAME OVER</p>

              <h2 class="gameover-card__title">{{ gameOverTitle }}</h2>

              <p class="gameover-card__text">{{ gameOverMessage }}</p>
            </article>

            <!-- 最後に選んだ行動で、何がどれだけ変わったか
                 「親の体力 10 → 0（-15）」のように、限界になった理由が分かる -->
            <article v-if="statusChanges" class="result-card result-card--gameover">
              <h3 class="result-card__title">最後の行動</h3>

              <p class="result-card__text">{{ resultMessage }}</p>

              <div class="change-box">
                <p class="change-box__title">この行動での変化</p>

                <ul class="last-action-list">
                  <li v-for="row in lastActionRows" :key="row.label" class="last-action-item">
                    <span class="last-action-item__label">{{ row.label }}</span>
                    <span class="last-action-item__flow">{{ row.before }} → {{ row.after }}</span>
                    <span class="last-action-item__value" :class="row.className">{{ row.text }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- 横並びにする2枚のカード（記録／見つけたもの） -->
            <div class="record-grid">
              <article class="record-card">
                <h3 class="record-card__title">今日の記録</h3>

                <ul class="record-list">
                  <li class="record-item"><span>おでかけポイント</span><b>{{ outingPoint }}</b></li>
                  <li class="record-item"><span>親の体力</span><b>{{ parentEnergy }}</b></li>
                  <li class="record-item"><span>親のイライラ度</span><b>{{ parentStress }}</b></li>
                  <li class="record-item"><span>こうちゃんの機嫌</span><b>{{ childMood }}</b></li>
                  <li class="record-item"><span>こうちゃんの体力</span><b>{{ childEnergy }}</b></li>
                  <li class="record-item"><span>いやいや発生</span><b>{{ tantrumCount }}回</b></li>
                  <li class="record-item"><span>探検した場所の数</span><b>{{ visitedPlaces.length }}か所</b></li>
                  <li class="record-item"><span>帰宅時刻</span><b>{{ currentTime }}</b></li>
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
            <button class="cmd cmd--next cmd--single" @click="resetGame">
              <span class="cmd__text">もう一度あそぶ</span>
            </button>
          </nav>
        </div>
      </Transition>
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

  /* 増減表示の色（中央カード用と、暗い上部ステータス用） */
  --good: #1f8a4c;
  --bad: #c9412f;
  --good-light: #7fe0a1;
  --bad-light: #ff9d8c;

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
    'warning warning warning'
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

.status-clock .status-change {
  margin-left: 8px;
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
  /* ラベル ／ 現在値 ／ 直前の増減 の3列（ゲージは下段に全幅で置く） */
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  column-gap: 6px;
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

/* 上部ステータスの増減表示
   結果を表示している間だけ、現在値の右側に小さく出す
*/
.status-change {
  /* 出たときに少し大きく見せてから、通常サイズへ戻す
     ※ span のままだと transform が効かないので inline-block にする */
  display: inline-block;
  animation: status-pop 0.35s ease-out;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 暗い背景なので、明るめの色で見分ける */
.status-change.change--good {
  color: var(--good-light);
}

.status-change.change--bad {
  color: var(--bad-light);
}

.status-change.change--neutral {
  color: #b8c9e2;
}

/* 危険な状態のステータス（GAME OVERが近い）
   背景と枠を付けて、ふだんより目立たせる

   ※ padding ではなく box-shadow で背景を外側に広げているので、
     危険になってもゲージの位置や高さはずれない
*/
.status-item--danger {
  border-radius: 6px;
  background: rgb(242 112 95 / 20%);
  box-shadow: 0 0 0 6px rgb(242 112 95 / 20%);
  /* 2.4秒かけてゆっくり明るくなって戻る（チカチカさせない） */
  animation: danger-pulse 2.4s ease-in-out infinite;
}

.status-item--danger .status-item__label {
  color: #ffd6cd;
}

.status-item--danger .status-item__value {
  color: #ff9d8c;
}

/* 危険なゲージは枠を付けて強調する（outline は場所を取らない） */
.status-item--danger .gauge {
  outline: 2px solid #ff9d8c;
  outline-offset: 1px;
}

/* ラベルの前に出す警告アイコン */
.status-item__alert {
  margin-right: 3px;
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
  /* ステータスが変わったとき、パッと変わらず「スーッ」と伸び縮みする */
  transition: width 0.5s ease-out;
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

.pill .status-change {
  margin-left: 6px;
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

/* 危険な状態の警告（親の体力・イライラ度・こうちゃんの体力） */
.status-warnings {
  display: flex;
  grid-area: warning;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.status-warnings__item {
  padding: 2px 12px;
  border: 1px solid #ff9d8c;
  border-radius: 999px;
  background: rgb(242 112 95 / 24%);
  color: #ffd6cd;
  font-size: 12.5px;
  font-weight: 700;
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
  animation: result-in 0.3s ease-out;
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

/* 今回の変化（結果カードの中）
   PCの横幅を活かして3列に並べ、たての高さをおさえる
*/
.change-box {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed #e8c98a;
}

.change-box__title {
  margin: 0 0 8px;
  color: #8a6a1e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.change-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.change-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 12px;
  border: 1px solid #f0e0b8;
  border-radius: 8px;
  background: #fff;
  line-height: 1.6;
}

.change-item__label {
  overflow: hidden;
  color: var(--ink-soft);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-item__value {
  flex: none;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 良い変化・悪い変化・変化なし の色分け
   ※ 親のイライラ度は「ふえると悪い」ので、判定は changeClass() で行っている
*/
.change-item__value.change--good {
  color: var(--good);
}

.change-item__value.change--bad {
  color: var(--bad);
}

.change-item__value.change--neutral {
  color: var(--ink-soft);
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
  animation: rank-in 0.5s ease-out 0.12s backwards;
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

/* GAME OVERのカード（ゴールのエンディングカードと対になる見た目） */
.gameover-card {
  animation: gameover-in 0.5s ease-out;
  padding: 22px 28px;
  border: 3px solid #c9412f;
  border-radius: 14px;
  background: linear-gradient(160deg, #3b2733 0%, #241f2b 100%);
  color: #ffeae5;
  text-align: center;
}

.gameover-card__label {
  /* 少し遅れて、ゆっくり大きく出す（backwards ＝ 待っている間は消えたまま） */
  animation: gameover-label-in 0.55s ease-out 0.15s backwards;
  margin: 0 0 10px;
  color: #ff9d8c;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.24em;
  line-height: 1.2;
}

.gameover-card__title {
  margin: 0 0 10px;
  color: var(--gold);
  font-size: 24px;
  line-height: 1.4;
}

.gameover-card__text {
  max-width: 640px;
  margin: 0 auto;
  font-size: 14.5px;
}

/* GAME OVER画面の「最後の行動」 */
.result-card--gameover {
  border-color: #e8b3a8;
}

.last-action-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.last-action-item {
  /* ラベル ／ 行動前→行動後 ／ 増減 の3列 */
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  column-gap: 10px;
  padding: 3px 0;
  border-bottom: 1px dotted #e5dcc6;
  font-size: 13.5px;
}

.last-action-item__label {
  overflow: hidden;
  color: var(--ink-soft);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.last-action-item__flow {
  color: var(--navy);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.last-action-item__value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.last-action-item__value.change--good {
  color: var(--good);
}

.last-action-item__value.change--bad {
  color: var(--bad);
}

.last-action-item__value.change--neutral {
  color: var(--ink-soft);
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
   演出（アニメーション）
   画像・効果音・外部ライブラリは使わず、
   CSSの animation / transition と VueのTransitionだけで動かす
   ============================================================ */

/* --- 場面の切り替え（Transition name="scene"） ---
   前の場面が0.15秒で消えてから、次の場面が0.24秒でふわっと出る
   合わせて0.4秒ほどなので、テンポは悪くならない
*/
.scene-enter-active {
  transition: opacity 0.24s ease-out, transform 0.24s ease-out;
}

.scene-leave-active {
  transition: opacity 0.15s ease-in;
}

.scene-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.scene-leave-to {
  opacity: 0;
}

/* --- 直前の増減値（-18 や +6）が出るときのポップ --- */
@keyframes status-pop {
  0% {
    opacity: 0;
    transform: scale(1.4);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* --- 結果カードが下から浮き上がる --- */
@keyframes result-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* --- いやいや発生：中央のカードだけを軽く左右に揺らす --- */
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }

  25% {
    transform: translateX(-5px);
  }

  75% {
    transform: translateX(5px);
  }
}

/* いやいやが起きた結果カード
   浮き上がってから、2回だけ小さく揺れる
   ※ .result-card の animation を上書きするので、両方をここに書いている
*/
.result-card--tantrum {
  animation:
    result-in 0.3s ease-out,
    shake 0.4s ease-in-out 0.3s 2;
  border-color: #eba79c;
  background: #fff6f3;
}

/* 「いやいや発生！」の見出し */
.result-alert {
  display: inline-block;
  margin: 0 0 12px;
  padding: 2px 14px;
  border-radius: 999px;
  background: var(--parent-stress);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

/* --- アイテム発見 --- */
@keyframes found-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 「★ アイテム発見！」の帯
   少し遅れて、ふわっと浮き上がりながら出す
*/
.found-flash {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin: 0 0 12px;
  padding: 8px 14px;
  border: 1px solid #ecd6a4;
  border-radius: 10px;
  background: #fff6e0;
  animation: found-in 0.4s ease-out 0.2s backwards;
}

.found-flash__label {
  color: #8a5a00;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.found-flash__item {
  padding: 1px 12px;
  border-radius: 999px;
  background: var(--gold);
  color: #4a3208;
  font-size: 13px;
  font-weight: 700;
}

/* --- 危険なステータスのゆっくりした点滅 --- */
@keyframes danger-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 6px rgb(242 112 95 / 20%);
  }

  50% {
    box-shadow: 0 0 0 6px rgb(242 112 95 / 45%);
  }
}

/* 危険の警告メッセージも、出るときだけふわっと出す */
.status-warnings__item {
  animation: found-in 0.35s ease-out;
}

/* --- GAME OVER --- */
@keyframes gameover-in {
  from {
    opacity: 0;
    transform: scale(0.94);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes gameover-label-in {
  from {
    opacity: 0;
    letter-spacing: 0.6em;
  }

  to {
    opacity: 1;
    letter-spacing: 0.24em;
  }
}

/* GAME OVERの場面だけ、中央エリアの背景を少し暗くする */
.scene--gameover .stage {
  background: rgb(16 29 44 / 10%);
  transition: background 0.5s ease-out;
}

/* --- ゴールのランク表示 --- */
@keyframes rank-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Sランクだけ、金色のふちをゆっくり光らせる */
@keyframes s-glow {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgb(255 192 67 / 25%);
  }

  50% {
    box-shadow: 0 0 0 8px rgb(255 192 67 / 40%);
  }
}

.ending-card--s {
  border-width: 3px;
  animation: s-glow 2.6s ease-in-out infinite;
}

.ending-card--s .ending-card__title {
  font-size: 30px;
}

/* ============================================================
   コマンドボックス（各場所の「どうする？」）
   画面下部のフッターではなく、中央エリアの中に
   「枠の中に選択肢が縦に並ぶ」形で置く

   ※ 公園入口は下の .command（横並びグリッド）のままなので、
     ここのCSSは公園入口には影響しない
   ============================================================ */
.command-box {
  /* 中央エリアの「右下」に置く
     ・align-self: flex-end … .stage の align-items: center を打ち消して右はしへ
     ・margin-top: auto     … たての余白をぜんぶ上に寄せて、自分は下へ
       （flexでは auto のマージンが justify-content より先に効くので、
         場所の説明文は上、コマンドボックスは下、という並びになる）
     ※ 中身があふれるときは余白が0になるので、はみ出したりはしない
  */
  align-self: flex-end;
  margin-top: auto;

  /* .stage > * で幅900pxが指定されているので、ここでせまく上書きする */
  width: 100%;
  max-width: 380px;
  padding: 12px 14px 14px;
  border: 3px solid #fff;
  border-radius: 10px;
  background: linear-gradient(180deg, var(--navy) 0%, var(--navy-deep) 100%);
  box-shadow: 0 6px 18px rgb(16 29 44 / 40%);
}

/* 「どうする？」の見出し */
.command-box__label {
  margin: 0 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--navy-line);
  color: #cfe0f7;
  font-size: 12px;
  letter-spacing: 0.1em;
}

/* 選択肢1つぶん
   大きなボタンには見せず、枠の中の「文字の行」に見えるようにする
   左の28pxは、マウスを乗せたときに出る「▶」の場所
*/
.command-box__item {
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 6px 10px 6px 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #fff;
  font-family: inherit;
  font-size: 15.5px;
  line-height: 1.7;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

/* クリックしたとき、一瞬押しこまれたように見せる */
.command-box__item:active {
  transform: translateX(4px) scale(0.98);
}

/* 選択カーソル「▶」（選ばれていない行では見えない） */
.command-box__item::before {
  position: absolute;
  left: 9px;
  color: var(--gold);
  content: '▶';
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

/* 選んでいる項目の見た目

   ・マウスを乗せた行（:hover）
   ・キーボードの↑↓で選んでいる行（--selected）
   のどちらも、まったく同じ見た目になるようにまとめて指定する
*/
.command-box__item:hover,
.command-box__item:focus-visible,
.command-box__item--selected {
  background: rgb(255 255 255 / 12%);
  font-weight: 700;
  transform: translateX(3px);
}

.command-box__item:hover::before,
.command-box__item:focus-visible::before,
.command-box__item--selected::before {
  opacity: 1;
}

.command-box__item:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: -2px;
}

.command-box__text {
  flex: 1;
}

/* おやつの残り個数など、行の右はしに出す小さな文字 */
.command-box__badge {
  flex: none;
  color: #ffd9a0;
  font-size: 12px;
  font-weight: 400;
}

/* 「べつの場所へ行く」は少し控えめにする */
.command-box__item--sub {
  color: #b9cbe6;
  font-size: 14.5px;
}

/* おやつを食べきったときのお知らせ */
.command-box__note {
  margin: 0;
  padding: 6px 10px 6px 28px;
  color: #9db2d2;
  font-size: 13px;
  line-height: 1.7;
}

/* ============================================================
   【下部】コマンド欄（公園入口・ゴール・GAME OVER）
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

/* 選択カーソル「▶」（選ばれていないボタンでは見えない）

   ▶ の色は「そのボタンの文字と同じ色」にそろえる
   こうすると、どの色のボタンでも文字と同じ濃さで読めるようになる
   ・白いボタン（すべり台へ行く など）… 紺色     ← ここで指定
   ・紫のボタン（秘密の場所）          … 白       ← .cmd--secret::before
   ・緑のボタン（ゴール）              … 白       ← .cmd--goal::before
   ・金色のボタン（公園へ行く など）    … 濃い茶色 ← .cmd--start / --next::before

   ※ 以前は全部このgold（金色）だったが、白い下地では 1.6:1 しかなく、
     緑の下地では 1.4:1 とほとんど見えなかった
*/
.cmd::before {
  position: absolute;
  left: 14px;
  color: var(--navy);
  content: '▶';
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

/* 選んでいるボタンの見た目

   ・マウスを乗せたボタン（:hover）
   ・キーボードの↑↓←→で選んでいるボタン（--selected）
   のどちらも、まったく同じ見た目になるようにまとめて指定する
*/
.cmd:hover,
.cmd--selected {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
}

.cmd:hover::before,
.cmd:focus-visible::before,
.cmd--selected::before {
  opacity: 1;
}

/* ボタンが1つしかない画面（タイトル・ゴール・GAME OVER）
   えらぶものは無いが、Enter / Space で押せることが分かるように、
   選択カーソル「▶」をいつも出しておく
   ※ 浮き上がる動きはマウスを乗せたときだけのままにする
*/
.cmd--single::before {
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

/* 秘密の場所
   大きさと形はほかの場所のボタンとそろえ、ほかの場所の続きに並べる
   目立たせるのは色（紫）だけにする */
.cmd--secret {
  border-color: #6b3fae;
  background: linear-gradient(180deg, #a97ce8 0%, #7a4fc0 100%);
  color: #fff;
}

.cmd--secret .cmd__badge {
  background: rgb(255 255 255 / 25%);
  color: #fff;
}

/* 紫の下地には紺色の▶が沈んでしまうので、文字と同じ白にする */
.cmd--secret::before {
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

/* 緑の下地でも、文字と同じ白にする */
.cmd--goal::before {
  color: #fff;
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

/* 金色のボタン（公園へ行く／もう一度あそぶ）も、文字と同じ濃い茶色にする
   この2つは ▶ をいつも出している（.cmd--single）ので、
   見つけやすいように少しだけ大きくもしている
*/
.cmd--start::before,
.cmd--next::before {
  color: #4a3208;
  font-size: 13px;
}

/* ============================================================
   背の低いパソコン画面（1280×720 など）向けの調整
   「今回の変化」が増えたぶん、余白と文字を少しだけつめて
   上部ステータス〜下部コマンドが一画面に収まるようにする
   ============================================================ */
@media (max-height: 800px) {
  .status-area {
    gap: 6px 24px;
    padding: 8px 28px 10px;
  }

  .status-clock__now {
    font-size: 24px;
  }

  .status-found {
    max-height: 44px;
  }

  .stage {
    gap: 12px;
    padding: 18px 28px 20px;
  }

  .place-card {
    padding: 16px 24px;
  }

  .place-card__title {
    font-size: 22px;
  }

  .result-card {
    padding: 22px 24px 18px;
  }

  .change-box {
    margin-top: 12px;
    padding-top: 10px;
  }

  .command {
    gap: 8px 12px;
    padding: 10px 28px 12px;
  }

  .cmd {
    padding: 10px 16px 10px 32px;
  }
}

/* ============================================================
   動きを減らす設定（OS側の「視差効果を減らす」など）
   アニメーションで気分が悪くなる人のために、演出をほぼ止める
   ※ 見た目や配置は変わらず、動きだけが無くなる
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ============================================================
   画面が狭いとき（タブレット・スマホ）へのフォールバック
   ============================================================ */

/* タブレット幅：コマンドを2列に */
@media (max-width: 900px) {
  .command {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .change-list {
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
      'warning warning'
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

  .change-list {
    grid-template-columns: 1fr;
  }

  .last-action-list {
    grid-template-columns: 1fr;
  }

  .command-box {
    align-self: stretch;
    max-width: none;
  }

  .record-grid {
    grid-template-columns: 1fr;
  }

  .gameover-card__label {
    font-size: 24px;
  }

  .gameover-card__title {
    font-size: 20px;
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
