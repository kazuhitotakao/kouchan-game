<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

const gameTitle: string = 'こうちゃんの大冒険';

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

   ここから下は「突然イベント」の画面
   通常行動のあとに20%で起こる、専用画面つきの出来事
   emergencySiren = 救急車のサイレンが聞こえる
   ladybug        = テントウムシを見つける
   dog            = 犬が近づいてくる
   fallDown       = こうちゃんがころぶ
   fountain       = 噴水が突然出る
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
  | 'goal'
  | 'gameOver'
  | 'emergencySiren'
  | 'ladybug'
  | 'dog'
  | 'fallDown'
  | 'fountain';

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
const childMood = ref(55); // こうちゃんの機嫌（ぐずりだすライン50のすぐ上からスタート）
const outingPoint = ref(0); // おでかけポイント
const parentEnergy = ref(100); // 親の体力
const parentCalm = ref(100); // 親の余裕（100 = とても余裕がある、0 = GAME OVER）
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

/* ランダムイベントで動いたステータス1つぶんの型
   label     … 「おでかけポイント」などの項目名
   text      … 「+5」「-8」の形にした増減
   className … 増減の色（changeClass() が返すクラス名）
*/
type RandomEventEffect = {
  label: string;
  text: string;
  className: string;
};

/* 今回の行動で起きたランダムイベント（演出用）
   ・randomEventText    … 何が起きたかの文章
   ・randomEventEffects … そのハプニングだけのステータス増減

   前は結果メッセージの文章に「おでかけポイント +5」と書き足していたが、
   それだと地の文にまぎれて見のがされてしまうので、
   文章と増減を分けて持ち、画面では専用の枠に出す

   ※ ステータスの数字そのものは、今までどおり outingPoint などを直接動かしている
     ここに入れるのは「画面に出すためのメモ」だけ
   ※ 行動をはじめるたびに空へ戻すので、直前の1回ぶんだけが入っている
*/
const randomEventText = ref('');
const randomEventEffects = ref<RandomEventEffect[]>([]);

/* 今回の行動でいやいやが始まったときの文章（演出用）

   結果メッセージに書き足すと、あとから画面に足した
   「アイテム発見」「ハプニング」の表示より前に出てしまい、
   起きた順（行動 → アイテム → ハプニング → いやいや）と食いちがう
   そこで文章だけここに持ち、画面のいちばん下に出す
*/
const tantrumText = ref('');

/* いやいやが起きた回数（記録用） */
const tantrumCount = ref(0);

/* おやつの残り回数（今日持ってきた分だけ） */
const snackLeft = ref(2);

/* 突然イベントが起きる確率
   0.2 ＝ 20%（5回に1回くらい）
   ここの数字だけを書きかえれば、起きやすさを変えられる
   例）0.15 なら15%、0.25 なら25%
*/
const suddenEventChance = 0.2;

/* 次に起こす予定の突然イベント（予定表）

   null                    … 予定なし
   'emergencySiren' など   … 次の「次へ」で、その突然イベント画面へ移動する

   ※ 通常行動が終わった瞬間に画面を切り替えてしまうと、
     せっかくの結果メッセージと「今回の変化」が読まれる前に消えてしまう
     そこで、いったんここへ書いておいて、
     プレイヤーが結果を確認して「次へ」を押したときに移動する
     （いやいや（isTantrum）とまったく同じ考え方）
*/
const pendingSuddenEvent = ref<GameEvent | null>(null);

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
  parentCalm: number;
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
  parentCalm: 0,
  minutes: 0,
});

/* ゴールしたときのランクと判定メッセージ */
const endingRank = ref('');
const endingTitle = ref('');
const endingMessage = ref('');

/* 今回のプレイの総合スコア（0〜100点）
   ゴールしたときに calculateFinalScore() で計算して入れる
   まだゴールしていないときは0
*/
const finalScore = ref(0);

/* スコア内訳の1行ぶんの型
   label  … 「おでかけポイント」などの項目名
   points … その項目でもらった点数（マイナスもある）
*/
type ScoreBreakdownItem = {
  label: string;
  points: number;
};

/* スコアの内訳
   「何で何点もらったのか」を1行ずつためておいて、結果画面に並べる
   ゴールするたびに calculateFinalScore() の中で空に戻す
*/
const scoreBreakdown = ref<ScoreBreakdownItem[]>([]);

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

/* いま「いやいやが続いている状態」かどうか
   ・いやいやタイムの画面にいる（currentEvent === 'tantrum'）
   ・まだ isTantrum が true（＝なだめられていない）

   「少し待ってみる」に失敗したときは、結果メッセージを出したまま
   この状態になるので、そのままもう一度コマンドを選べるようにする
   ※ GAME OVERになったときは currentEvent が 'gameOver' に変わるため、
     ここは自動的に false になり、GAME OVER画面のほうが優先される
*/
const isTantrumUnsolved = computed(() => currentEvent.value === 'tantrum' && isTantrum.value);

/* いま画面に出ているコマンドの数
   ↑↓キーで動ける範囲（0 〜 commandCount - 1）を決めるために使う
*/
const commandCount = computed(() => {
  // 公園入口は「行き先6か所 ＋ ゴール」で7つ
  // 秘密の場所がまだ見つかっていないときは、その行が画面に無いので6つ
  if (currentEvent.value === 'parkEntrance') {
    return canEnterSecretSpot.value ? 7 : 6;
  }

  // いやいやが続いているあいだは、おやつが残っていれば3つ、食べきっていれば2つ
  // 「少し待ってみる」に失敗して結果メッセージが出ているときも、
  // いやいやはまだ終わっていないので、この3つ（2つ）から選び直す
  // ※ 下の「結果表示中は1つ」より先に判定するのがポイント
  if (isTantrumUnsolved.value) {
    return snackLeft.value > 0 ? 3 : 2;
  }

  // 結果表示中は「次の場所を選ぶ」の1つだけ
  if (resultMessage.value) {
    return 1;
  }

  // 突然イベント「こうちゃんがころんだ」だけは、
  // おやつが残っていれば4つ、食べきっていれば3つになる
  // （4番目の「おやつで気をそらす」が画面から消えるため）
  if (currentEvent.value === 'fallDown') {
    return snackLeft.value > 0 ? 4 : 3;
  }

  // それ以外の場所は「行動2つ ＋ べつの場所へ行く」で3つ
  // 突然イベント（救急車・テントウムシ・犬・噴水）も選択肢が3つなので、ここに当てはまる
  return 3;
});

/* いやいやタイムの「少し待ってみる」が何番目になるか
   おやつが残っていれば3番目（＝2）
   おやつが0個で「おやつをあげる」が画面から消えているときは、
   1つくり上がって2番目（＝1）になる
*/
const waitCommandIndex = computed(() => (snackLeft.value > 0 ? 2 : 1));

/* いやいやタイムの「待つ」コマンドに出す文字
   1回目は「少し待ってみる」
   待つことに失敗して2回目以降になったときは「もう少し待ってみる」

   いやいやが続いたまま結果メッセージが出ている＝待つことに失敗した直後、
   という意味なので、新しい ref を増やさなくても区別できる
*/
const waitCommandLabel = computed(() => (isTantrumUnsolved.value && resultMessage.value ? 'もう少し待ってみる' : '少し待ってみる'));

/* 結果カードの下に出す「次へ進む」コマンドの文字
   いやいやが起きているときは、次の場所ではなく
   まず こうちゃん をなだめる場面へ進むので、文言だけ変える
   突然イベントの予定があるときも、この先で何か起きることが伝わる文言にする
   （押したときに呼ぶ goToNextPlace() は、どの場合も今までと同じ）
*/
const nextPlaceCommandLabel = computed(() => {
  // いやいやが最優先（goToNextPlace() の分けかたと同じ順番にそろえてある）
  if (isTantrum.value) {
    return 'こうちゃんのところへ行く';
  }

  // 突然イベントの予定があるとき
  if (pendingSuddenEvent.value !== null) {
    return 'なにか起こりそう…';
  }

  return '次の場所を選ぶ';
});

/* 公園入口の「公園の出口へ向かう（ゴール）」が何番目になるか
   秘密の場所が出ていれば7番目（＝6）
   まだ出ていないときは、その行が画面に無いので1つくり上がって6番目（＝5）
*/
const goalCommandIndex = computed(() => (canEnterSecretSpot.value ? 6 : 5));

/* ===== ゲージのしきい値（目もり） =====
   ゲームのルールで使っている数字を、ここに名前を付けてまとめておく
   ・ゲージの上に線（目もり）を出すときの位置
   ・ルールの判定（いやいや発生・危険な状態）
   の両方で同じ定数を使うので、あとから数字を変えても線とルールがずれない
*/

/* こうちゃんの体力：これを下回ると「いやいや」が起きるようになる
   （71以上あるうちは元気いっぱいなので、いやいやは起こらない）
*/
const fussEnergyLine = 71;

/* こうちゃんの機嫌：これ以下だと「いやいや」が起きやすくなる */
const fussMoodLine = 50;

/* こうちゃん・親の体力：これ以下はあぶない（GAME OVERが近い） */
const dangerEnergyLine = 20;

/* 親の余裕：これ以下はあぶない（0でGAME OVER） */
const dangerCalmLine = 20;

/* ===== 危険な状態かどうか（GAME OVERが近いかどうかの目安） =====
   ここが true になったゲージは、上部ステータスで目立つ見た目にする
*/

/* 親の体力が20以下 → あと1〜2回の行動で限界 */
const isParentEnergyDanger = computed(() => parentEnergy.value <= dangerEnergyLine);

/* 親の余裕が20以下 → あと少しで0 */
const isParentCalmDanger = computed(() => parentCalm.value <= dangerCalmLine);

/* こうちゃんの体力が20以下 → 電池切れが近い */
const isChildEnergyDanger = computed(() => childEnergy.value <= dangerEnergyLine);

/* いま「リザルト画面」にいるかどうか
   ・ゴール（総合スコアとランクの発表）
   ・GAME OVER
   どちらも遊びが終わったあとの画面なので、
   上部ステータスの忠告（あぶないよ／そろそろお昼だよ）は出さない
*/
const isResultScene = computed(() => currentEvent.value === 'goal' || currentEvent.value === 'gameOver');

/* 上部ステータスに出す警告メッセージ
   危険なものだけを配列に入れて、画面ではこれを上から順番に表示する
*/
const dangerWarnings = computed(() => {
  const warnings: string[] = [];

  if (isParentEnergyDanger.value) {
    warnings.push('⚠ 親の体力が残りわずかです');
  }

  if (isParentCalmDanger.value) {
    warnings.push('⚠ 親の余裕が残りわずかです');
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
  parentCalm.value = keepInRange(parentCalm.value);
}

/* 行動をはじめる前に呼ぶ
   「今のステータス」を控えておくだけの処理
*/
function startStatusChanges() {
  // 演出用：前の行動で見つけたものの表示が残らないように空へ戻す
  foundItemsThisAction.value = [];

  // 演出用：前の行動のハプニング表示も空へ戻す
  randomEventText.value = '';
  randomEventEffects.value = [];

  // 演出用：前の行動のいやいや文も空へ戻す
  tantrumText.value = '';

  statusBefore.value = {
    childEnergy: childEnergy.value,
    childMood: childMood.value,
    outingPoint: outingPoint.value,
    parentEnergy: parentEnergy.value,
    parentCalm: parentCalm.value,
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
    parentCalm: parentCalm.value - statusBefore.value.parentCalm,
    minutes: currentMinutes.value - statusBefore.value.minutes,
  };
}

/* 変化量を「+5」「-10」「0」の形の文字にする */
function formatChange(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

/* 「分」で持っている時間を「09:25」の形の文字にする

   statusBefore.minutes には 09:00 が 540（＝9×60）のように
   分だけの数で入っているので、そのままだと画面に出せない
   60で割った答えが「時」、60で割ったあまりが「分」になる

   padStart(2, '0') は「2けたに足りないぶんを0でうめる」という意味
   （9 → 09）。addMinutes() の中の書きかたとそろえてある
*/
function formatMinutesToTime(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/* 時計の文字から、先頭の「0」を取る（09:25 → 9:25）

   結果カードの「時間」は 9:25 のほうがすっと読めるので、ここだけ0を外す
   ※ 上部ステータスの時計は 09:25 のままにしてある
     こちらはいつも同じ幅で並んでいたほうが、時間の進みが見やすいため
*/
function removeLeadingZero(time: string) {
  // '0' ではじまっているときだけ、1文字目を取りのぞく
  if (time.startsWith('0')) {
    return time.slice(1);
  }

  return time;
}

/* 変化が「良い」「悪い」「変化なし」のどれかを判定して、CSSのクラス名を返す

   ステータスは4つとも「100に近いほど良い・0に近いほど危ない」でそろえてあるので、
   判定はとてもシンプルになる
     ・プラス（ふえた） → 良い変化
     ・マイナス（減った） → 悪い変化
   ※ 時間だけは、どの行動でも必ずふえるので色はつけない
*/
function changeClass(statusName: string, value: number) {
  // 時間は良い・悪いで見ないので、いつも「変化なし」の色にする
  if (statusName === 'minutes') {
    return 'change--neutral';
  }

  if (value === 0) {
    return 'change--neutral';
  }

  // 体力・機嫌・ポイント・親の余裕は、どれも ふえると良い変化
  return value > 0 ? 'change--good' : 'change--bad';
}

/* 中央の「今回の変化」に並べる6項目

   1行につき、次の4つを持たせている
   ・label      … 「こうちゃんの体力」などの項目名
   ・before     … 行動する前の値（statusBefore に控えてあるもの）
   ・after      … 行動したあとの値（いま画面に出ている現在値そのもの）
   ・changeText … 「+6」「-18」の形にした増減
   ・className  … 増減の色（良い・悪い・変化なし）

   before と after を並べて出すことで、
   「-18 減った」だけでなく「残り82になった」まで一目で分かるようにする

   ※ after には fixAllStatus() で0〜100に丸めたあとの現在値を使う
     たとえば 親の体力が 10 のときに 17 使うと、内部の計算では -7 になるが、
     画面のステータスは 0 なので「10 → 0（-17）」と出る
     （増減の -17 は statusChanges にそのまま残っているので、ここは変えない）

   ※ この computed は表示を作るだけで、ゲームの値は書きかえない
*/
const changeRows = computed(() => {
  const changes = statusChanges.value;

  // まだ今回の行動結果がないときは、からっぽにする
  if (changes === null) {
    return [];
  }

  // 毎回 statusBefore.value と書かなくてよいように、行動前の控えを取り出しておく
  const before = statusBefore.value;

  return [
    {
      label: 'こうちゃんの体力',
      before: String(before.childEnergy),
      after: String(childEnergy.value),
      changeText: formatChange(changes.childEnergy),
      className: changeClass('childEnergy', changes.childEnergy),
    },
    {
      label: 'こうちゃんの機嫌',
      before: String(before.childMood),
      after: String(childMood.value),
      changeText: formatChange(changes.childMood),
      className: changeClass('childMood', changes.childMood),
    },
    {
      label: 'おでかけポイント',
      before: String(before.outingPoint),
      after: String(outingPoint.value),
      changeText: formatChange(changes.outingPoint),
      className: changeClass('outingPoint', changes.outingPoint),
    },
    {
      label: '親の体力',
      before: String(before.parentEnergy),
      after: String(parentEnergy.value),
      changeText: formatChange(changes.parentEnergy),
      className: changeClass('parentEnergy', changes.parentEnergy),
    },
    {
      label: '親の余裕',
      before: String(before.parentCalm),
      after: String(parentCalm.value),
      changeText: formatChange(changes.parentCalm),
      className: changeClass('parentCalm', changes.parentCalm),
    },
    {
      // 時間だけは数ではなく時計の形で出す
      // before は「分」で控えてあるので formatMinutesToTime() で 09:00 の形に直し、
      // after は画面の時計と同じ currentTime をそのまま使う
      label: '時間',
      before: removeLeadingZero(formatMinutesToTime(before.minutes)),
      after: removeLeadingZero(currentTime.value),
      changeText: `${formatChange(changes.minutes)}分`,
      className: changeClass('minutes', changes.minutes),
    },
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
    { label: '親の余裕', before: before.parentCalm, after: parentCalm.value, text: formatChange(changes.parentCalm), className: changeClass('parentCalm', changes.parentCalm) },
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
  // 「〜を見つけました！」の文は、この foundItemsThisAction をもとに
  // 画面のほうで組み立てる（アイテムの名前だけ色をつけて目立たせるため）
  foundItemsThisAction.value.push(itemName);
}

/* ランダムイベント（通常行動中に起きる、小さなハプニング）
   5回に1回くらい（20%）だけ起こり、8種類の中から1つが選ばれる

   ※ ここに書く数字は「このハプニングだけの増減」
     中央の「今回の変化（合計）」は行動ぜんぶを足した数なので、
     たとえば 休む -10 ＋ 急に走り出す +10 なら 合計は 0 になる

   ※ どのイベントでも addMinutes() は呼ばない
     「通常行動をしている、その最中に起きたこと」という扱いなので、
     時間は通常行動のぶんだけ進む

   ※ 専用画面へ移動する「突然イベント」とは別物
     こちらは結果カードに文章とステータス変化が少し足されるだけ
*/
/* ランダムイベントで動いたステータスを、画面に出す形で1つ控える

   label    … 画面に出す項目名（「おでかけポイント」など）
   statName … 中の名前（changeClass() に渡して色を決めるのに使う）
   amount   … その増減（5 なら +5、-8 なら -8）

   ※ ステータスそのものは、呼ぶ前に outingPoint.value += 5 のように動かしてある
     この関数は「画面に出す用のメモを1行足す」だけ
*/
function addRandomEventEffect(label: string, statName: string, amount: number) {
  randomEventEffects.value.push({
    label,
    text: formatChange(amount),
    className: changeClass(statName, amount),
  });
}

function runRandomEvent() {
  // ① まず「そもそも起こるか？」の抽選（20%）
  //   0.2以上（＝80%）なら、何もしないでここで終わり
  if (Math.random() >= 0.2) {
    return;
  }

  // ② 起こると決まったので、8種類の中から1つ選ぶ
  //   Math.random() * 8 で「0以上8未満の小数」を作り、
  //   Math.floor() で小数点以下を切り捨てて 0〜7 の整数にする
  //   8つの区間はどれも同じ幅なので、8種類が同じ確率で出る
  const eventNumber = Math.floor(Math.random() * 8);

  /* --- 良いイベント --- */

  // ① 四つ葉のクローバー
  //   ※ addOutingPoint() ではなく直接足している
  //     addOutingPoint() は「2回目の場所は半分」という場所のためのルールで、
  //     ハプニングは場所の探検ではないため、半減の対象にしない
  if (eventNumber === 0) {
    outingPoint.value += 5;
    randomEventText.value = 'そのとき、四つ葉のクローバーを見つけました！';
    addRandomEventEffect('おでかけポイント', 'outingPoint', 5);
    return;
  }

  // ② 急に「だっこ！」
  if (eventNumber === 1) {
    parentEnergy.value -= 8;
    randomEventText.value = 'こうちゃんが急に「だっこ！」と言い出しました。';
    addRandomEventEffect('親の体力', 'parentEnergy', -8);
    return;
  }

  // ③ きれいな鳥
  if (eventNumber === 2) {
    childMood.value += 5;
    randomEventText.value = '木の上にきれいな鳥を見つけました！';
    addRandomEventEffect('こうちゃんの機嫌', 'childMood', 5);
    return;
  }

  // ④ 急に走り出してヒヤッ
  if (eventNumber === 3) {
    parentCalm.value -= 10;
    randomEventText.value = 'こうちゃんが急に走り出してヒヤッとしました！';
    addRandomEventEffect('親の余裕', 'parentCalm', -10);
    return;
  }

  // ⑤ ちょうちょ
  if (eventNumber === 4) {
    childMood.value += 4;
    randomEventText.value = '目の前をちょうちょがひらひら飛んでいきました。こうちゃんはうれしそうに追いかけています！';
    addRandomEventEffect('こうちゃんの機嫌', 'childMood', 4);
    return;
  }

  // ⑥ ベンチでひと休み
  if (eventNumber === 5) {
    parentEnergy.value += 5;
    randomEventText.value = 'ちょうど空いているベンチを見つけて、少しひと休みできました。';
    addRandomEventEffect('親の体力', 'parentEnergy', 5);
    return;
  }

  // ⑦ 靴がぽろっと脱げる
  if (eventNumber === 6) {
    parentCalm.value -= 4;
    randomEventText.value = 'こうちゃんが走っていると、片方の靴がぽろっと脱げてしまいました。ちょっと待って、履きなおします。';
    addRandomEventEffect('親の余裕', 'parentCalm', -4);
    return;
  }

  // ⑧ 水たまりで大はしゃぎ（良い面と悪い面の両方があるイベント）
  //   ここまでの7つに当てはまらなかった＝eventNumber が 7 のとき
  //   2つステータスが動くので、しるしも2つ並べる
  childMood.value += 5;
  parentCalm.value -= 3;
  randomEventText.value = 'こうちゃんが水たまりを見つけて大はしゃぎ！楽しそうだけど、親はちょっとヒヤヒヤです。';
  addRandomEventEffect('こうちゃんの機嫌', 'childMood', 5);
  addRandomEventEffect('親の余裕', 'parentCalm', -3);
}

/* 疲れたり、おなかがすいたりすると、だんだん機嫌もわるくなる

   機嫌が下がる理由は2つあり、両方かさなることもある
   ① 遊びつかれてきた … 体力が「ぐずりだすライン（71）」より下 → 機嫌 -4
   ② おなかがすいてきた … 11:00をすぎた                        → 機嫌 -3

   これが無いと、遊ぶ行動はどれも機嫌がふえるだけなので、
   機嫌はすぐ100に張りついて「見るだけの数字」になってしまう

   ②（時間）を入れているのは、控えめに遊ぶと体力がほとんど減らず、
   ①だけでは機嫌がまったく下がらなくなってしまうため
   お昼が近づけば、元気に遊んでいても だんだんぐずってくる、というルールにしている

   下がる力があることで、
   「もう1か所あそぶ？ 休む？ おやつを使う？ そろそろ帰る？」を
   最後まで考えられる数字になる

   ※ いやいやをなだめる行動と突然イベントでは呼ばれない
     （どちらも finishPlayAction() を通らないため）
     なだめている最中にさらに機嫌が下がると、立て直せなくなってしまう
*/
function dropMoodWhenTired() {
  // ① 遊びつかれてきた
  if (childEnergy.value < fussEnergyLine) {
    childMood.value -= 4;
  }

  // ② お昼が近づいて、おなかがすいてきた
  if (currentMinutes.value >= 11 * 60) {
    childMood.value -= 3;
  }
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

  // 体力が71以上あるうちは元気いっぱいなので、いやいやは起こらない
  // ただし11:00をすぎたら、まだ元気でも
  // 「おなかすいた」「まだ帰りたくない」でぐずることがある
  // ※ これが無いと、控えめに遊んで体力を減らさないだけで
  //   いやいやを最後まで完全に避けられてしまう
  if (childEnergy.value >= fussEnergyLine && currentMinutes.value < 11 * 60) {
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
  } else if (childMood.value <= fussMoodLine) {
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
  parentCalm.value -= 12;

  tantrumText.value = 'そのあと、こうちゃんが「いやー！」とほっぺをぷうっとふくらませて、その場にぺたんと座りこんでしまいました…';
}

/* GAME OVER判定
   ステータスが変わる行動のあとに、必ず最後に呼ぶ

   上から順番に見て、あてはまった時点でGAME OVERが決まる
   ① 親の体力が0以下      → 親がもう動けない
   ② 親の余裕が0以下       → 親の心の余裕がなくなった
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

  // ② 親の余裕が0以下
  if (parentCalm.value <= 0) {
    gameOverTitle.value = '親の余裕がなくなった！';
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

/* 突然イベントの抽選

   ① 20%（suddenEventChance）で発生するか決める
   ② 発生したら、5種類の中からランダムで1つ選ぶ
   ③ currentEvent はここでは変えず、pendingSuddenEvent（予定表）に書くだけ

   ③がいちばん大事なところ
   ここで画面を切り替えてしまうと、いま終わったばかりの行動の
   結果メッセージと「今回の変化」が、読まれる前に消えてしまう
   実際に画面が切り替わるのは、プレイヤーが「次へ」を押して
   goToNextPlace() が呼ばれたとき
*/
function checkSuddenEvent() {
  // 0以上1未満のランダムな数を出して、0.2より小さければ発生（＝20%）
  // 逆に0.2以上なら、今回は何も起こらないのでここで終わり（＝80%）
  if (Math.random() >= suddenEventChance) {
    return;
  }

  // 0・1・2・3・4 のどれかをランダムに作って、5種類から1つ選ぶ
  const eventNumber = Math.floor(Math.random() * 5);

  if (eventNumber === 0) {
    pendingSuddenEvent.value = 'emergencySiren';
    return;
  }

  if (eventNumber === 1) {
    pendingSuddenEvent.value = 'ladybug';
    return;
  }

  if (eventNumber === 2) {
    pendingSuddenEvent.value = 'dog';
    return;
  }

  if (eventNumber === 3) {
    pendingSuddenEvent.value = 'fallDown';
    return;
  }

  pendingSuddenEvent.value = 'fountain';
}

/* 場所で1つ行動したあとの共通処理
   ① その場所を探検済みにする
   ② たまにランダムイベントが起こる
   ③ 疲れていたら、機嫌が少し下がる
   ④ いやいやが始まるか判定する
   ⑤ 今回の変化量を記録する（ランダムイベントと機嫌ダウン、いやいやの分もふくむ）
   ⑥ ステータスを0〜100に収める
   ⑦ GAME OVERになっていないか判定する
   ⑧ 突然イベントが起きるか抽選する（起きるなら予定表に書くだけ）
   ※ いやいやをなだめる行動では呼ばない（ランダムイベントを起こさないため）
   ※ 突然イベントの行動でも呼ばない（突然イベントが連続で起きないようにするため）

   ⑦を⑥の次に置いているので、
   ランダムイベントの「だっこ！」で親の体力が0になった場合も、
   いやいや発生で親の余裕が0になった場合も、まとめてGAME OVERになる

   ③がいやいや判定より前にあるのもポイント
   下がったあとの機嫌でいやいやを判定するので、
   「疲れて機嫌もわるい」ときほど、ちゃんといやいやが起きやすくなる
*/
function finishPlayAction(place: GameEvent) {
  addVisitedPlace(place);
  runRandomEvent();
  dropMoodWhenTired();
  checkTantrum();
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  /* ⑧ 突然イベントの抽選（いちばん最後）

     つぎの3つのときは抽選しない
     ・GAME OVERになった  … もう続きが無いので
     ・いやいやが発生した  … まず こうちゃん をなだめるほうが先
     ・12:00を過ぎた      … このあとはゴールへ向かうだけ

     当たっても、この場では画面を切り替えない
     pendingSuddenEvent（予定表）に書いておくだけなので、
     いま出ている結果カードはそのまま読める
  */
  if (currentEvent.value !== 'gameOver' && !isTantrum.value && !isTimeOver.value) {
    checkSuddenEvent();
  }

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

   上から順番に見て、あてはまった時点で行き先が決まる
   ① GAME OVER中なら、どこへも動かさない
   ② いやいや中なら、まずはなだめる場面へ
   ③ 12:00を過ぎていたら、もう探検は続けられないのでゴールへ
   ④ 突然イベントの予定があれば、その専用画面へ
   ⑤ 何もなければ、いつもどおり公園入口へ

   ④が③より下にあるのがポイント
   お昼を過ぎているのに突然イベントを始めてしまうと、
   「12:00までに帰る」というルールが崩れてしまう
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

  // 突然イベントの予定があれば、その画面へ移動する
  // 移動したら予定表は空（null）に戻す
  // ※ ここで戻しておかないと、突然イベントが終わったあとに
  //   もう一度おなじ画面へ入ってしまう
  if (pendingSuddenEvent.value !== null) {
    currentEvent.value = pendingSuddenEvent.value;
    pendingSuddenEvent.value = null;
    return;
  }

  currentEvent.value = 'parkEntrance';
}

/* ============================================================
   場所での行動（6か所 × 2コマンド）

   親の2つのステータスは、減る理由をわけてある
   ・親の体力 … 体をどれだけ使ったか（走る・だっこする・立ちっぱなし）
   ・親の余裕 … どれだけヒヤッとしたか（水辺・高い所・見失いそう）

   そのため、同じ「よく遊ぶ」コマンドでも場所によって中身がちがう
   ・池を近くで見る   … 体力 -13 ／ 余裕 -14（水があるので、いちばん気が張る）
   ・丘を走ってのぼる … 体力 -17 ／ 余裕 -11（体力もいちばん使い、見失いそうでもある）
   ・どんぐりを拾う   … 体力 -10 ／ 余裕  -3（しゃがんで拾うだけなので穏やか）

   こうすると
   「体力は残っているけれど、余裕がないから池はやめておこう」
   「余裕はあるから、静かなどんぐりの木で点をかせごう」
   のように、2つの数字を見くらべて場所を選べるようになる
   ============================================================ */

/* ===== すべり台 ===== */

/* ① 一緒にすべる */
function playSlide() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 18;
  childMood.value += 6;
  addOutingPoint('slide', 6);
  parentEnergy.value -= 14;
  parentCalm.value -= 9;
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
  parentCalm.value -= 2;
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
  parentEnergy.value -= 12;
  parentCalm.value -= 4;
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
  parentEnergy.value += 2;
  parentCalm.value -= 2;
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
  parentEnergy.value -= 10;
  parentCalm.value -= 3;
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
  parentCalm.value += 10;
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
  parentEnergy.value -= 13;
  parentCalm.value -= 14;
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
  parentCalm.value -= 2;
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
  parentEnergy.value -= 17;
  parentCalm.value -= 11;
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
  parentCalm.value -= 4;
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
  parentEnergy.value -= 14;
  parentCalm.value -= 4;
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
  parentEnergy.value += 4;
  parentCalm.value += 6;
  addMinutes(20);

  resultMessage.value = '二人でならんで景色をながめました。とても穏やかな時間です。';

  finishPlayAction('secretSpot');
}

/* ===== いやいや中（なだめる場面） ===== */

/* ① だっこしてなだめる

   いやいや対応の中では、いちばん確実に落ち着かせられる方法
   ただし親の体力を16も使ううえ、公園で泣かれているあいだの
   気持ちの消耗まではゼロにならないので、親の余裕は少し減る
*/
function hugChild() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value += 12;
  childMood.value += 15;
  parentEnergy.value -= 16;
  parentCalm.value -= 5;
  addMinutes(10);

  isTantrum.value = false;

  resultMessage.value = 'ぎゅっとだっこすると、しばらく足をぱたぱたさせていましたが、そのうち肩にことんと頭をあずけてきました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // だっこは親の体力を16も使うので、残りが少ないとここでGAME OVERになる
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
  // いやいや対応の中では、いちばん軽く済む方法（親の余裕は3しか減らない）
  // そのかわり、おやつは1日2個しか持ってきていない
  parentCalm.value -= 3;
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

/* ③ 少し待ってみる
   だっこ・おやつとちがって、これだけは失敗することがある
   ・50%（0.5）… 落ち着いて、いやいや終了
   ・50%       … まだ落ち着かないので、いやいやが続く

   成功しても失敗しても、下のステータスの増減と時間（15分）は毎回発生する
   ＝「もう一度待つか、だっこするか、おやつを使うか」を考える場面になる

   いやいや対応の3つは、どれも親の余裕が減る
   何で払うかがちがうだけ
   ・だっこ … 親の体力 -16 ／ 親の余裕 -5（確実に終わる）
   ・おやつ … おやつ -1   ／ 親の余裕 -3（いちばん軽いが、1日2個まで）
   ・待つ   … 親の体力 +2 ／ 親の余裕 -18（体力は減らないが、50%で失敗する）
*/
function waitCalmly() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 4;
  childMood.value -= 6;
  parentEnergy.value += 2;
  // 泣いている横で待つのがいちばんこたえる
  // 体力は使わないが、そのぶん親の余裕で払う（失敗すればもう一度払う）
  parentCalm.value -= 18;
  addMinutes(15);

  // 0以上1未満のランダムな数を出して、0.5より小さければ成功（＝50%）
  const calmSuccess = Math.random() < 0.5;

  if (calmSuccess) {
    // 落ち着いてくれたので、いやいや終了
    isTantrum.value = false;

    resultMessage.value = 'となりで静かに待っていると、泣き声が少しずつ小さくなりました。こうちゃんはようやく落ち着いたようです。';
  } else {
    // 失敗したときは isTantrum を true のままにしておく（false にはしない）
    // ここでは checkTantrum() を呼ばない
    // 新しいいやいやが起きたのではなく、同じいやいやが続いているだけなので、
    // tantrumCount も増やさない
    resultMessage.value = 'しばらく待ってみましたが、こうちゃんはまだ気持ちがおさまらないようです……。';
  }

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // 待つのは親の余裕が18減るので、残りが少ないとここでGAME OVERになる
  // ※ GAME OVERになると currentEvent が 'gameOver' に変わるので、
  //   いやいやが続いていてもGAME OVER画面のほうが優先される
  checkGameOver();

  // 失敗したときも、すぐ次のコマンドを選べるように一番上（0＝だっこ）へ戻す
  selectedCommandIndex.value = 0;
}

/* ============================================================
   突然イベント（通常行動のあと、20%で起こる出来事）

   通常の場所の行動とちがうところ
   ・finishPlayAction() を呼ばない
     → runRandomEvent() / checkTantrum() / checkSuddenEvent() が動かないので、
       突然イベントから続けて突然イベントが起きることはない
     → visitedPlaces（探検した場所）にも入らない
   ・そのかわり、どの行動も次の4つは必ず行う
     ① startStatusChanges()  行動前のステータスを控える（いちばん最初）
     ② saveStatusChanges()   「今回の変化」を作る（0〜100に丸める前）
     ③ fixAllStatus()        ステータスを0〜100に収める
     ④ checkGameOver()       限界をむかえていないか判定する

   ※ おでかけポイントは addOutingPoint() ではなく、そのまま足している
     addOutingPoint() は「2回目の場所は半分」というルールの関数で、
     突然イベントは「場所」ではないため
   ============================================================ */

/* ===== 突然イベント：救急車のサイレン ===== */

/* ① 立ち止まって救急車を探す */
function lookForAmbulance() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 8;
  outingPoint.value += 3;
  parentEnergy.value -= 2;
  addMinutes(10);

  resultMessage.value = 'しばらく探していると、道路の向こうを救急車が走っていきました。こうちゃんは「いた！」と大喜びです！';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② 音を聞きながら少し待つ */
function listenToSiren() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 4;
  addMinutes(5);

  resultMessage.value = '二人で耳をすませていると、ピーポーの音がだんだん遠ざかっていきました。こうちゃんは最後まで「ピーポー」とまねをしています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ 先へ進む（ステータスも時間も変わらない） */
function walkOnFromSiren() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  resultMessage.value = '「またこんど見ようね」と声をかけて、先へ進みました。こうちゃんは何度か後ろをふりかえっています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== 突然イベント：テントウムシ ===== */

/* ① 一緒にじっくり観察する */
function watchLadybug() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 7;
  outingPoint.value += 4;
  addMinutes(10);

  resultMessage.value = '二人でしゃがんで、じっくり見つめました。こうちゃんは「 てちてち歩いている、かわいい 」と満足げです。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② 手に乗せてみる */
function holdLadybug() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 9;
  outingPoint.value += 5;
  addMinutes(10);

  resultMessage.value = 'そっと指を近づけると、テントウムシが乗ってきました。こうちゃんは手を上にあげ、テントウムシを飛ばそうとしています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ そっと見送る */
function seeOffLadybug() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 3;
  addMinutes(5);

  resultMessage.value = 'しばらく見ていると、テントウムシはぱっと羽を広げて飛んでいきました。こうちゃんは「ばいばい」と手をふっています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== 突然イベント：犬が近づいてくる ===== */

/* ① 近くで見る */
function watchDogClose() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 6;
  outingPoint.value += 3;
  parentCalm.value -= 3;
  addMinutes(10);

  resultMessage.value = '飼い主さんに聞いてから、近くで見せてもらいました。こうちゃんは大喜びですが、急に手を出さないか見ているのは少しどきどきします。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② 親の後ろから見る */
function watchDogBehindParent() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 3;
  parentEnergy.value -= 2;
  addMinutes(5);

  resultMessage.value = 'こうちゃんは親の足のうしろに、そっとかくれました。ときどき顔だけ出して、犬をじっと見つめています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ 少し離れる */
function keepDistanceFromDog() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  addMinutes(5);

  resultMessage.value = '手をつないで、少しだけ道のはしへよけました。犬はしっぽをふりながら、そのまま通りすぎていきました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== 突然イベント：こうちゃんがころんだ =====

   ※ このイベントからは checkTantrum() を呼ばない
     「ころぶ → 選ぶ → 結果」だけの、シンプルな流れにしている

   ※ ころんだ直後は、こうちゃんの機嫌が下がっている
     下の4つに書いてある数字は「ころんだ分」も入れた合計なので、
     じょうずになだめても、機嫌はころぶ前より少し上がるくらいで止まる
     （おやつ +5 ／ だっこ +3 ／ 痛いの痛いの +1 ／ 見守る -4）

   ※ 目の前で子どもがころぶと、どうしてもヒヤッとする
     そのため、どれを選んでも親の余裕は減る
     何で払うかがちがうだけで、いやいや対応とまったく同じ考えかた
     ・だっこ       … 親の体力 -10 ／ 親の余裕 -3
     ・見守る       … 親の体力 +1  ／ 親の余裕 -8（体力は減らないが、いちばん心にくる）
     ・痛いの痛いの … 親の体力 -3  ／ 親の余裕 -5
     ・おやつ       … おやつ -1    ／ 親の余裕 -2（いちばん軽いが、1日2個まで）
*/

/* ① すぐにだっこする */
function hugAfterFall() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 3;
  childEnergy.value += 3;
  parentEnergy.value -= 10;
  parentCalm.value -= 3;
  addMinutes(10);

  resultMessage.value = 'すぐにかけよってぎゅっとだっこすると、こうちゃんはほっとした顔になりました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // だっこは親の体力を10使うので、残りが少ないとここでGAME OVERになる
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② 「大丈夫？」と見守る */
function watchAfterFall() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value -= 4;
  parentEnergy.value += 1;
  parentCalm.value -= 8;
  addMinutes(5);

  resultMessage.value = '「大丈夫？」と声をかけて待っていると、こうちゃんは自分でよいしょと立ち上がりました。ひざの砂をぱんぱんとはらっていますが、口はへの字のままです。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ 痛いの痛いのとんでいけ〜

   だっこ（親の体力-10）ほど親の力を使わずに、
   見守る（機嫌-4）よりも こうちゃん の気持ちを立てなおせる、
   ちょうど真ん中の選択肢
   声をかけて、痛いのを空へ投げるまねをするだけなので、おやつも減らない
*/
function blowPainAway() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 1;
  childEnergy.value += 2;
  parentEnergy.value -= 3;
  parentCalm.value -= 5;
  addMinutes(5);

  resultMessage.value =
    'ひざをそっとなでながら「いたいの いたいの とんでいけ〜！」と、遠くの空へ投げるまねをしました。こうちゃんは飛んでいったほうをじっと見上げて、「とんでった」とにっこりしました。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ④ おやつで気をそらす
   おやつが1個以上あるときだけ、画面にこのコマンドが出る
*/
function giveSnackAfterFall() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 5;
  childEnergy.value += 8;
  parentEnergy.value -= 2;
  parentCalm.value -= 2;
  addMinutes(5);

  snackLeft.value -= 1;

  resultMessage.value = 'おやつをそっと見せると、こうちゃんの目がぱっと変わりました。ころんだことは、もうすっかり忘れているようです。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== 突然イベント：噴水が突然出る ===== */

/* ① 近くまで見に行く */
function goCloseToFountain() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 9;
  childEnergy.value -= 7;
  outingPoint.value += 5;
  parentEnergy.value -= 5;
  addMinutes(10);

  resultMessage.value = '手をつないで噴水のすぐそばまで行きました。こうちゃんは水しぶきに向かって、きゃーっと走りまわっています！';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② 少し離れて見る */
function watchFountainFar() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childMood.value += 5;
  outingPoint.value += 2;
  addMinutes(5);

  resultMessage.value = '少し離れた場所から、二人でながめました。水の音を聞きながら、こうちゃんは指をさして笑っています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ 先へ進む（ステータスも時間も変わらない） */
function walkOnFromFountain() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  resultMessage.value = '「またあとでね」と手をつないで、そのまま先へ進みました。うしろで噴水の音がしています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ===== ゴール ===== */

/* 今回のプレイの総合スコアを計算する

   この関数は「点数を数えるだけ」で、ランクの判定はしない
   （ランクを決めるのは judgeResult() の役目）

   やっていること
   ① scoreBreakdown を空にする（前回の結果を消す）
   ② 加点・減点を1項目ずつ計算して scoreBreakdown に push する
   ③ scoreBreakdown の points を全部たす
   ④ 0〜100に収めて finalScore に入れる

   ※ 0点の項目は、結果画面がごちゃごちゃしないように push しない
*/
function calculateFinalScore() {
  // ① 前回のプレイの内訳が残らないように、まず空っぽに戻す
  scoreBreakdown.value = [];

  // ② 基本点：おでかけポイントは、そのまま点数になる
  //   （0点でも「ここがスコアの土台」と分かるように、いつも表示する）
  scoreBreakdown.value.push({ label: 'おでかけポイント', points: outingPoint.value });

  // ③ 秘密の場所ボーナス：探検できていれば +10点
  if (isVisited('secretSpot')) {
    scoreBreakdown.value.push({ label: '秘密の場所発見', points: 10 });
  }

  // ④ 見つけたものボーナス：1種類につき +2点
  const itemPoints = collectedItems.value.length * 2;

  if (itemPoints > 0) {
    scoreBreakdown.value.push({ label: '見つけたもの', points: itemPoints });
  }

  // ⑤ 帰宅時間ボーナス
  //   goToGoal() で出口まで10分歩いたあとの時間で判定される
  //   ・11:45まで      → +8点
  //   ・11:46〜12:00   → +4点
  //   ・12:00を過ぎた  → -10点
  //   ※ 11:45 にしているのは、6か所ぜんぶ回ると
  //     いやいや や 突然イベント の時間で必ずはみ出してしまい、
  //     +8点が「ぜったいに取れないボーナス」になっていたため
  if (currentMinutes.value <= 11 * 60 + 45) {
    scoreBreakdown.value.push({ label: '余裕をもって帰宅', points: 8 });
  } else if (currentMinutes.value <= 12 * 60) {
    scoreBreakdown.value.push({ label: '時間内に帰宅', points: 4 });
  } else {
    scoreBreakdown.value.push({ label: '時間オーバー', points: -10 });
  }

  // ⑥ 親の体力ボーナス：50以上で+5点、30〜49で+3点、29以下は0点
  if (parentEnergy.value >= 50) {
    scoreBreakdown.value.push({ label: '親の体力', points: 5 });
  } else if (parentEnergy.value >= 30) {
    scoreBreakdown.value.push({ label: '親の体力', points: 3 });
  }

  // ⑦ こうちゃんの機嫌ボーナス：70以上で+5点、50〜69で+3点、49以下は0点
  if (childMood.value >= 70) {
    scoreBreakdown.value.push({ label: 'こうちゃんの機嫌', points: 5 });
  } else if (childMood.value >= 50) {
    scoreBreakdown.value.push({ label: 'こうちゃんの機嫌', points: 3 });
  }

  // ⑧ こうちゃんの体力ボーナス：30以上なら+3点
  if (childEnergy.value >= 30) {
    scoreBreakdown.value.push({ label: 'こうちゃんの体力', points: 3 });
  }

  // ⑨ 親の余裕ボーナス：親の余裕が70以上なら+3点
  //   「余裕を残したまま帰れた」ごほうび
  if (parentCalm.value >= 70) {
    scoreBreakdown.value.push({ label: '親の余裕', points: 3 });
  }

  // ⑩ いやいや減点：1回につき -2点
  if (tantrumCount.value > 0) {
    scoreBreakdown.value.push({ label: 'いやいや', points: tantrumCount.value * -2 });
  }

  // ⑪ 内訳の点数を全部たす
  let total = 0;

  for (const item of scoreBreakdown.value) {
    total += item.points;
  }

  // ⑫ 0〜100に収める（100を超えたら100、0未満なら0）
  //   ※ ここで丸めるので、内訳の単純合計と finalScore がずれることがある
  finalScore.value = keepInRange(total);
}

/* へとへとで帰ってきたかどうかを判定する

   スコアが低くなる理由は、大きく分けて2つある
   ① 遊びすぎて、こうちゃんも親もクタクタになった
   ② ほとんど遊ばずに、すぐ帰ってきた

   点数はどちらも同じくらい低くなるけれど、
   ①に「まだまだ元気だね」と言うのも、
   ②に「遊びすぎたね」と言うのもおかしいので、ここで見分けて文章を変える

   ※ 使っている数字は、calculateFinalScore() のボーナスの基準とそろえている
     （＝「ボーナスをもらえなかった項目が1つでもあれば、疲れて帰ってきた」）
*/
function isWornOut() {
  // 親かこうちゃんの体力が減っている
  if (parentEnergy.value < 50 || childEnergy.value < 30) {
    return true;
  }

  // こうちゃんの機嫌がよくない
  if (childMood.value < 50) {
    return true;
  }

  // 親の余裕が少なくなっている
  if (parentCalm.value < 70) {
    return true;
  }

  // いやいやが1回でも起きた
  if (tantrumCount.value > 0) {
    return true;
  }

  // お昼を過ぎてしまった
  if (currentMinutes.value > 12 * 60) {
    return true;
  }

  // どれにも当てはまらない＝二人とも元気なまま帰ってきた
  return false;
}

/* 結果のランクを判定する

   上から順番に見て、あてはまった時点で決まる
   ① 総合スコアを計算する（特殊エンドでもスコアは表示するので、いちばん先に呼ぶ）
   ② いやいや3回以上 → 特殊エンド（通常ランクより優先）
   ③ 総合スコアで S+ / S / A / B / C / D を決める

   ※ CランクとDランクだけは、同じ点数でも
     「遊びすぎて疲れた」のか「あまり遊ばずに帰った」のかで文章を変える
     （コマンドを1つ選んで出口へ行くだけでもCランクになるので、
       いつも「遊びすぎた」と出すと話が合わなくなるため）

   ※ GAME OVERのときは goToGoal() が先に return するので、この関数は呼ばれない
*/
function judgeResult() {
  // ① まずスコアを計算する（ランク判定はこのあと）
  calculateFinalScore();

  // ② 特殊エンド（スコアよりも優先される。通常ランクは表示しない）
  if (tantrumCount.value >= 3) {
    endingRank.value = '特殊エンド';
    endingTitle.value = 'いやいや大爆発！';
    endingMessage.value = 'いやいやが' + tantrumCount.value + '回もありました。ほっぺをふくらませたこうちゃんをだっこして、いっしょにおうちへ帰ります。それはそれで、わすれられない1日になりました。';
    return;
  }

  // ③ ここから下は、総合スコアだけでランクが決まる（点数の高いほうから順に見ていく）

  // 92〜100点
  if (finalScore.value >= 92) {
    endingRank.value = 'S+ランク';
    endingTitle.value = '伝説の公園大冒険！';
    endingMessage.value = 'たくさん探検して、こうちゃんも親も大満足！ずっとわすれられない大冒険になりました！';
    return;
  }

  // 84〜91点
  if (finalScore.value >= 84) {
    endingRank.value = 'Sランク';
    endingTitle.value = '公園探検マスター！';
    endingMessage.value = 'たくさんの場所を探検して、楽しい思い出をいっぱい作れました！';
    return;
  }

  // 70〜83点
  if (finalScore.value >= 70) {
    endingRank.value = 'Aランク';
    endingTitle.value = '最高のおでかけ！';
    endingMessage.value = 'いろいろな場所を回って、こうちゃんも楽しそう。とてもいいおでかけになりました！';
    return;
  }

  // 55〜69点
  if (finalScore.value >= 55) {
    endingRank.value = 'Bランク';
    endingTitle.value = '楽しい公園探検！';
    endingMessage.value = '楽しく公園を探検できました。次はちがう場所にも行ってみよう！';
    return;
  }

  // 38〜54点
  if (finalScore.value >= 38) {
    endingRank.value = 'Cランク';

    // 遊びすぎて疲れたとき
    if (isWornOut()) {
      endingTitle.value = 'ちょっと遊びすぎた！';
      endingMessage.value = 'ちょっと疲れたけれど、それも今日の思い出。次はもう少し余裕をもって探検してみよう！';
      return;
    }

    // まだまだ元気なのに帰ってきたとき
    endingTitle.value = 'あっさり公園さんぽ';
    endingMessage.value = '二人ともまだまだ元気なまま、おうちへ帰ってきました。次はもう少し公園の中を探検してみよう！';
    return;
  }

  // 0〜37点
  endingRank.value = 'Dランク';

  // 遊びすぎて疲れたとき
  if (isWornOut()) {
    endingTitle.value = '今日は大変だった……';
    endingMessage.value = '今日はちょっと大変な公園探検でした。次は無理せず、休みながら遊んでみよう！';
    return;
  }

  // 公園に来たばかりで帰ってきたとき
  endingTitle.value = 'ちょっとだけ公園';
  endingMessage.value = '公園に着いたばかりなのに、もう帰り道。こうちゃんはまだ遊びたそうです。次はもっと探検してみよう！';
}

/* ゴールへ向かう（判定して結果画面へ） */
function goToGoal() {
  // GAME OVERになったときは、S+〜Dランクの判定はしない
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
  childMood.value = 55;
  outingPoint.value = 0;
  parentEnergy.value = 100;
  parentCalm.value = 100;
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

  // 前回の総合スコアと内訳が残らないように、0と空の配列に戻す
  finalScore.value = 0;
  scoreBreakdown.value = [];

  // 演出用に控えていたものも空に戻す
  foundItemsThisAction.value = [];
  randomEventText.value = '';
  randomEventEffects.value = [];
  tantrumText.value = '';

  // 今回追加したGAME OVER用のstateも空に戻す
  gameOverTitle.value = '';
  gameOverMessage.value = '';

  // 突然イベントの予定も空に戻す
  // ※ 戻しておかないと、前回のプレイの予定が
  //   次のゲームの1回目の行動のあとに出てきてしまう
  pendingSuddenEvent.value = null;

  // 行動前の控えも0に戻しておく（前回の記録が残らないようにする）
  statusBefore.value = {
    childEnergy: 0,
    childMood: 0,
    outingPoint: 0,
    parentEnergy: 0,
    parentCalm: 0,
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
  // ただし「少し待ってみる」に失敗していやいやが続いているときは、
  // 画面に出ているのは いやいや のコマンドなので、ここでは進めない
  if (resultMessage.value && !isTantrumUnsolved.value) {
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

    /* ここから下は突然イベント */

    /* 救急車のサイレン
       0 立ち止まって救急車を探す／1 音を聞きながら少し待つ／2 先へ進む */
    case 'emergencySiren':
      if (index === 0) {
        lookForAmbulance();
      } else if (index === 1) {
        listenToSiren();
      } else if (index === 2) {
        walkOnFromSiren();
      }
      break;

    /* テントウムシ
       0 一緒にじっくり観察する／1 手に乗せてみる／2 そっと見送る */
    case 'ladybug':
      if (index === 0) {
        watchLadybug();
      } else if (index === 1) {
        holdLadybug();
      } else if (index === 2) {
        seeOffLadybug();
      }
      break;

    /* 犬が近づいてきた
       0 近くで見る／1 親の後ろから見る／2 少し離れる */
    case 'dog':
      if (index === 0) {
        watchDogClose();
      } else if (index === 1) {
        watchDogBehindParent();
      } else if (index === 2) {
        keepDistanceFromDog();
      }
      break;

    /* こうちゃんがころんだ
       0 すぐにだっこする／1 「大丈夫？」と見守る
       2 痛いの痛いのとんでいけ〜／3 おやつで気をそらす

       ※ おやつのコマンドはいちばん下（3番目）なので、
         おやつが0個のときは画面に無いだけで、番号のくり上がりは起きない
         それでも念のため、snackLeft を見てから実行する
    */
    case 'fallDown':
      if (index === 0) {
        hugAfterFall();
      } else if (index === 1) {
        watchAfterFall();
      } else if (index === 2) {
        blowPainAway();
      } else if (index === 3 && snackLeft.value > 0) {
        giveSnackAfterFall();
      }
      break;

    /* 噴水が出た
       0 近くまで見に行く／1 少し離れて見る／2 先へ進む */
    case 'fountain':
      if (index === 0) {
        goCloseToFountain();
      } else if (index === 1) {
        watchFountainFar();
      } else if (index === 2) {
        walkOnFromFountain();
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
        <h1 class="title-card__name">{{ gameTitle }}</h1>

        <div class="title-card__rule">
          <p>
            冒険の舞台は9時から12時の公園です！      
          </p>
          
          <p>
            どんな出会い、冒険があるかな。
            <br />
            たくさん探索してみよう！
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

            <!-- 直前の行動でかかった時間（結果を表示している間だけ出す）
                 出たり消えたりしても幅が変わらないように、
                 外側の span で置き場所（幅）をいつも確保しておく -->
            <span class="status-clock__change">
              <span v-if="statusChanges && statusChanges.minutes !== 0" class="status-change">{{ formatChange(statusChanges.minutes) }}分</span>
            </span>
          </span>
        </div>

        <ul class="status-list">
          <li class="status-item" :class="{ 'status-item--danger': isChildEnergyDanger }">
            <span class="status-item__label">
              <span v-if="isChildEnergyDanger" class="status-item__alert">⚠</span>
              こうちゃんの体力
            </span>
            <span class="status-item__value">{{ childEnergy }}</span>
            <span v-if="statusChanges && statusChanges.childEnergy !== 0" class="status-change" :class="changeClass('childEnergy', statusChanges.childEnergy)">
              {{ formatChange(statusChanges.childEnergy) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-energy" :style="{ width: childEnergy + '%' }"></span>

              <!-- 目もり：ここを下回ると こうちゃん がぐずりだす（体力71） -->
              <span class="gauge__mark gauge__mark--fuss" :style="{ left: fussEnergyLine + '%' }" title="ここより下がると、こうちゃんがぐずりだします（体力71）"></span>

              <!-- 目もり：あぶないライン（体力20以下で電池切れが近い） -->
              <span class="gauge__mark gauge__mark--danger" :style="{ left: dangerEnergyLine + '%' }" title="ここより下は電池切れが近いです（体力20）"></span>
            </span>
          </li>

          <li class="status-item">
            <span class="status-item__label">こうちゃんの機嫌</span>
            <span class="status-item__value">{{ childMood }}</span>
            <span v-if="statusChanges && statusChanges.childMood !== 0" class="status-change" :class="changeClass('childMood', statusChanges.childMood)">
              {{ formatChange(statusChanges.childMood) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--child-mood" :style="{ width: childMood + '%' }"></span>

              <!-- 目もり：ここより下だと ぐずりやすくなる（機嫌50） -->
              <span class="gauge__mark gauge__mark--fuss" :style="{ left: fussMoodLine + '%' }" title="ここより下だと、いやいやが起きやすくなります（機嫌50）"></span>
            </span>
          </li>

          <li class="status-item" :class="{ 'status-item--danger': isParentEnergyDanger }">
            <span class="status-item__label">
              <span v-if="isParentEnergyDanger" class="status-item__alert">⚠</span>
              親の体力
            </span>
            <span class="status-item__value">{{ parentEnergy }}</span>
            <span v-if="statusChanges && statusChanges.parentEnergy !== 0" class="status-change" :class="changeClass('parentEnergy', statusChanges.parentEnergy)">
              {{ formatChange(statusChanges.parentEnergy) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--parent-energy" :style="{ width: parentEnergy + '%' }"></span>

              <!-- 目もり：あぶないライン（親の体力20以下） -->
              <span class="gauge__mark gauge__mark--danger" :style="{ left: dangerEnergyLine + '%' }" title="ここより下はあと1〜2回の行動で限界です（親の体力20）"></span>
            </span>
          </li>

          <li class="status-item" :class="{ 'status-item--danger': isParentCalmDanger }">
            <span class="status-item__label">
              <span v-if="isParentCalmDanger" class="status-item__alert">⚠</span>
              親の余裕
            </span>
            <span class="status-item__value">{{ parentCalm }}</span>
            <span v-if="statusChanges && statusChanges.parentCalm !== 0" class="status-change" :class="changeClass('parentCalm', statusChanges.parentCalm)">
              {{ formatChange(statusChanges.parentCalm) }}
            </span>
            <span class="gauge">
              <span class="gauge__fill gauge__fill--parent-calm" :style="{ width: parentCalm + '%' }"></span>

              <!-- 目もり：あぶないライン（親の余裕20以下／0でGAME OVER） -->
              <span class="gauge__mark gauge__mark--danger" :style="{ left: dangerCalmLine + '%' }" title="ここより左はあぶないです（親の余裕20以下で危険／0でGAME OVER）"></span>
            </span>
          </li>
        </ul>

        <!-- ゲージの目もりの説明 -->
        <p class="gauge-legend">
          <span class="gauge-legend__item">
            <span class="gauge-legend__mark gauge-legend__mark--fuss"></span>
            ぐずりだすライン
          </span>

          <span class="gauge-legend__item">
            <span class="gauge-legend__mark gauge-legend__mark--danger"></span>
            あぶないライン
          </span>
        </p>

        <div class="status-pills">
          <span class="pill pill--point">
            おでかけポイント
            <b>{{ outingPoint }}</b>
            <span class="pill__change">
              <span v-if="statusChanges && statusChanges.outingPoint !== 0" class="status-change" :class="changeClass('outingPoint', statusChanges.outingPoint)">
                {{ formatChange(statusChanges.outingPoint) }}
              </span>
            </span>
          </span>

          <span class="pill pill--snack">
            おやつ残り
            <b>{{ snackLeft }}</b>

            <!-- 「個」も、上のおでかけポイントの増減表示と同じ幅の置き場所に入れる
                 こうすると、2つの数字が上下でぴったり同じ位置にそろう -->
            <span class="pill__unit">個</span>
          </span>
        </div>

        <div class="status-found">
          <span class="status-found__label">見つけたもの</span>

          <span v-if="collectedItems.length === 0" class="status-found__empty">なにが見つかるかな？</span>

          <ul v-else class="status-found__list">
            <li v-for="item in collectedItems" :key="item" class="status-found__item">{{ item }}</li>
          </ul>
        </div>

        <!-- 危険な状態の警告（GAME OVERになる前の合図）
             リザルト画面では、もう気をつけようがないので出さない -->
        <ul v-if="dangerWarnings.length > 0 && !isResultScene" class="status-warnings">
          <li v-for="warning in dangerWarnings" :key="warning" class="status-warnings__item">{{ warning }}</li>
        </ul>

        <!-- そろそろお昼のお知らせ（こちらもリザルト画面では出さない） -->
        <p v-if="isAlmostNoon && !isResultScene" class="status-notice">そろそろお昼の時間です。公園の出口へ向かいましょう。</p>
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
        <div v-if="currentEvent === 'parkEntrance'" class="scene" key="parkEntrance">
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
        <div v-else-if="currentEvent === 'slide'" class="scene" key="slide">
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

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
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

                <button
                  class="command-box__item command-box__item--sub"
                  :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }"
                  @click="goToNextPlace"
                  @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 砂場 -->
        <div v-else-if="currentEvent === 'sandbox'" class="scene" key="sandbox">
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

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
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

                <button
                  class="command-box__item command-box__item--sub"
                  :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }"
                  @click="goToNextPlace"
                  @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- どんぐりの木 -->
        <div v-else-if="currentEvent === 'acornArea'" class="scene" key="acornArea">
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

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
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

                <button
                  class="command-box__item command-box__item--sub"
                  :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }"
                  @click="goToNextPlace"
                  @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 池 -->
        <div v-else-if="currentEvent === 'pond'" class="scene" key="pond">
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

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
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

                <button
                  class="command-box__item command-box__item--sub"
                  :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }"
                  @click="goToNextPlace"
                  @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 丘 -->
        <div v-else-if="currentEvent === 'hill'" class="scene" key="hill">
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

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
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

                <button
                  class="command-box__item command-box__item--sub"
                  :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }"
                  @click="goToNextPlace"
                  @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 秘密の場所 -->
        <div v-else-if="currentEvent === 'secretSpot'" class="scene" key="secretSpot">
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

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
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

                <button
                  class="command-box__item command-box__item--sub"
                  :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }"
                  @click="goToNextPlace"
                  @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">べつの場所へ行く</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- いやいや中 -->
        <div v-else-if="currentEvent === 'tantrum'" class="scene" key="tantrum">
          <section class="stage">
            <article class="place-card place-card--tantrum">
              <h2 class="place-card__title">いやいやタイム！</h2>

              <p class="place-card__text">
                こうちゃんがほっぺをふくらませて、その場にぺたんと座りこんでしまいました。 なにを言っても「いや！」のいってんばりですが、ときどきこちらをちらっと見ています。
              </p>
            </article>

            <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
              <h3 class="result-card__title">結果</h3>

              <!-- いやいやが起きたときだけ出す（カードも軽く左右に揺れる） -->
              <!-- 待つことに失敗して、まだいやいやが続いているときに出す -->
              <p v-if="isTantrum" class="result-alert">まだ いやいや は続いています…</p>

              <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
              <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                <span class="found-flash__label">★ アイテム発見！</span>
                <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
              </p>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
            <nav class="command-box">
              <!-- いやいやが続いているあいだは、結果が出ていてもコマンドを出しつづける -->
              <template v-if="isTantrumUnsolved">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="hugChild" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">だっこしてなだめる</span>
                </button>

                <button v-if="snackLeft > 0" class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="giveSnack" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">おやつをあげる</span>
                  <span class="command-box__badge">残り{{ snackLeft }}個</span>
                </button>

                <p v-else class="command-box__note">おやつは、もうぜんぶ食べてしまいました…</p>

                <button
                  class="command-box__item"
                  :class="{ 'command-box__item--selected': selectedCommandIndex === waitCommandIndex }"
                  @click="waitCalmly"
                  @mouseenter="selectedCommandIndex = waitCommandIndex">
                  <span class="command-box__text">{{ waitCommandLabel }}</span>
                </button>
              </template>

              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 突然イベント：救急車のサイレン！ -->
        <div v-else-if="currentEvent === 'emergencySiren'" class="scene" key="emergencySiren">
          <section class="stage">
            <article class="place-card place-card--sudden">
              <p class="place-card__flash">突然イベント！</p>

              <h2 class="place-card__title">🚑 救急車のサイレン！</h2>

              <p class="place-card__text">遠くからピーポーピーポーと音が聞こえてきました。こうちゃんは「きゅうきゅうしゃ！」と目を輝かせています。</p>
            </article>

            <!-- 選んだあとの結果（通常の場所とおなじ形） -->
            <article v-if="resultMessage" class="result-card">
              <h3 class="result-card__title">結果</h3>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
            <nav class="command-box">
              <!-- まだ選んでいないとき -->
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="lookForAmbulance" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">立ち止まって救急車を探す</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="listenToSiren" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">音を聞きながら少し待つ</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="walkOnFromSiren" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">先へ進む</span>
                </button>
              </template>

              <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 突然イベント：テントウムシ発見！ -->
        <div v-else-if="currentEvent === 'ladybug'" class="scene" key="ladybug">
          <section class="stage">
            <article class="place-card place-card--sudden">
              <p class="place-card__flash">突然イベント！</p>

              <h2 class="place-card__title">🐞 テントウムシ発見！</h2>

              <p class="place-card__text">葉っぱの上にテントウムシがいました。こうちゃんは「てんとうむし！」とうれしそうにしゃがみこみました。</p>
            </article>

            <!-- 選んだあとの結果（通常の場所とおなじ形） -->
            <article v-if="resultMessage" class="result-card">
              <h3 class="result-card__title">結果</h3>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
            <nav class="command-box">
              <!-- まだ選んでいないとき -->
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="watchLadybug" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">一緒にじっくり観察する</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="holdLadybug" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">手に乗せてみる</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="seeOffLadybug" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">そっと見送る</span>
                </button>
              </template>

              <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 突然イベント：犬が近づいてきた！ -->
        <div v-else-if="currentEvent === 'dog'" class="scene" key="dog">
          <section class="stage">
            <article class="place-card place-card--sudden">
              <p class="place-card__flash">突然イベント！</p>

              <h2 class="place-card__title">🐕 犬が近づいてきた！</h2>

              <p class="place-card__text">散歩中の犬が、しっぽをふりながら近づいてきました。こうちゃんは気になっているようです。</p>
            </article>

            <!-- 選んだあとの結果（通常の場所とおなじ形） -->
            <article v-if="resultMessage" class="result-card">
              <h3 class="result-card__title">結果</h3>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
            <nav class="command-box">
              <!-- まだ選んでいないとき -->
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="watchDogClose" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">近くで見る</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="watchDogBehindParent" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">親の後ろから見る</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="keepDistanceFromDog" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">少し離れる</span>
                </button>
              </template>

              <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 突然イベント：こうちゃんがころんだ！ -->
        <div v-else-if="currentEvent === 'fallDown'" class="scene" key="fallDown">
          <section class="stage">
            <article class="place-card place-card--sudden">
              <p class="place-card__flash">突然イベント！</p>

              <h2 class="place-card__title">💦 こうちゃんがころんだ！</h2>

              <p class="place-card__text">走っていたこうちゃんがつまずいてころんでしまいました。少しびっくりした顔でこちらを見ています。</p>
            </article>

            <!-- 選んだあとの結果（通常の場所とおなじ形） -->
            <article v-if="resultMessage" class="result-card">
              <h3 class="result-card__title">結果</h3>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
            <nav class="command-box">
              <!-- まだ選んでいないとき -->
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="hugAfterFall" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">すぐにだっこする</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="watchAfterFall" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">「大丈夫？」と見守る</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="blowPainAway" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">痛いの痛いのとんでいけ〜</span>
                </button>

                <button
                  v-if="snackLeft > 0"
                  class="command-box__item"
                  :class="{ 'command-box__item--selected': selectedCommandIndex === 3 }"
                  @click="giveSnackAfterFall"
                  @mouseenter="selectedCommandIndex = 3">
                  <span class="command-box__text">おやつで気をそらす</span>
                  <span class="command-box__badge">残り{{ snackLeft }}個</span>
                </button>
              </template>

              <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- 突然イベント：噴水が出た！ -->
        <div v-else-if="currentEvent === 'fountain'" class="scene" key="fountain">
          <section class="stage">
            <article class="place-card place-card--sudden">
              <p class="place-card__flash">突然イベント！</p>

              <h2 class="place-card__title">⛲ 噴水が出た！</h2>

              <p class="place-card__text">突然、噴水から勢いよく水が飛び出しました。こうちゃんは「わあ！」と大喜びです。</p>
            </article>

            <!-- 選んだあとの結果（通常の場所とおなじ形） -->
            <article v-if="resultMessage" class="result-card">
              <h3 class="result-card__title">結果</h3>

              <p class="result-card__text">{{ resultMessage }}</p>

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

              <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
              <div v-if="statusChanges" class="change-box">
                <p class="change-box__title">今回の変化（合計）</p>

                <ul class="change-list">
                  <li v-for="row in changeRows" :key="row.label" class="change-item">
                    <span class="change-item__label">{{ row.label }}</span>

                    <!-- 行動前 → 行動後
                         「いまいくつになったか」がすぐ分かるように、
                         行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                    <span class="change-item__flow">
                      <span class="change-item__before">{{ row.before }}</span>
                      <span class="change-item__arrow">→</span>
                      <span class="change-item__after">{{ row.after }}</span>
                    </span>
                    <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
                  </li>
                </ul>
              </div>
            </article>

            <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
            <nav class="command-box">
              <!-- まだ選んでいないとき -->
              <template v-if="!resultMessage">
                <p class="command-box__label">どうする？</p>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goCloseToFountain" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">近くまで見に行く</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="watchFountainFar" @mouseenter="selectedCommandIndex = 1">
                  <span class="command-box__text">少し離れて見る</span>
                </button>

                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="walkOnFromFountain" @mouseenter="selectedCommandIndex = 2">
                  <span class="command-box__text">先へ進む</span>
                </button>
              </template>

              <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
              <template v-else>
                <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0">
                  <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                </button>
              </template>
            </nav>
          </section>
        </div>

        <!-- ゴール -->
        <div v-else-if="currentEvent === 'goal'" class="scene" key="goal">
          <section class="stage">
            <article class="place-card">
              <h2 class="place-card__title">公園の出口</h2>

              <p class="place-card__text">たくさん探検しました。そろそろ公園から帰る時間です。</p>
            </article>

            <!-- 総合スコア ＋ ランク ＋ 結果メッセージ
                 SランクとS+ランクのときだけ、カードがきらきら光る -->
            <article class="ending-card" :class="{ 'ending-card--s': endingRank === 'Sランク' || endingRank === 'S+ランク' }">
              <!-- 総合スコア（0〜100点） -->
              <p class="ending-card__score-label">総合スコア</p>

              <p class="ending-card__score">
                <span class="ending-card__score-value">{{ finalScore }}</span>
                <span class="ending-card__score-max">/ 100</span>
              </p>

              <p class="ending-card__rank">{{ endingRank }}</p>

              <h3 class="ending-card__title">{{ endingTitle }}</h3>

              <p class="ending-card__text">{{ endingMessage }}</p>
            </article>

            <!-- スコア内訳（何で何点もらったか）
                 プラスは緑・マイナスは赤にしたいので、
                 数字の形は formatChange()、色は changeClass() を使いまわしている -->
            <article class="score-card">
              <h3 class="score-card__title">スコア内訳</h3>

              <ul class="score-list">
                <li v-for="row in scoreBreakdown" :key="row.label" class="score-item">
                  <span class="score-item__label">{{ row.label }}</span>
                  <span class="score-item__value" :class="changeClass('score', row.points)">{{ formatChange(row.points) }}</span>
                </li>
              </ul>
            </article>

            <!-- 横並びにする2枚のカード（記録／見つけたもの） -->
            <div class="record-grid">
              <article class="record-card">
                <h3 class="record-card__title">今日の記録</h3>

                <ul class="record-list">
                  <li class="record-item">
                    <span>おでかけポイント</span>
                    <b>{{ outingPoint }}</b>
                  </li>
                  <li class="record-item">
                    <span>親の体力</span>
                    <b>{{ parentEnergy }}</b>
                  </li>
                  <li class="record-item">
                    <span>こうちゃんの機嫌</span>
                    <b>{{ childMood }}</b>
                  </li>
                  <li class="record-item">
                    <span>こうちゃんの体力</span>
                    <b>{{ childEnergy }}</b>
                  </li>
                  <li class="record-item">
                    <span>いやいや発生</span>
                    <b>{{ tantrumCount }}回</b>
                  </li>
                  <li class="record-item">
                    <span>探検した場所の数</span>
                    <b>{{ visitedPlaces.length }}か所</b>
                  </li>
                  <li class="record-item">
                    <span>帰った時間</span>
                    <b>{{ currentTime }}</b>
                  </li>
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
             自分で出口へ帰ったときとちがい、S+〜Dランクの判定はしない -->
        <div v-else-if="currentEvent === 'gameOver'" class="scene scene--gameover" key="gameOver">
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

              <!-- 見つけたものの文
                   アイテムの名前だけ、色をつけて文の中でも目立つようにする -->
              <p v-for="item in foundItemsThisAction" :key="item" class="found-line">「<b class="found-line__name">{{ item }}</b>」を見つけました！</p>

              <!-- 行動の最中に起きた小さなハプニング（ランダムイベント）
                   地の文にまぎれないように、専用の枠と
                   色つきのしるし（おでかけポイント +5 など）で出す -->
              <div v-if="randomEventText" class="event-flash">
                <p class="event-flash__label">ハプニング！</p>

                <p class="event-flash__text">{{ randomEventText }}</p>

                <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                  <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                    <span class="event-flash__item-label">{{ effect.label }}</span>
                    <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                  </li>
                </ul>
              </div>

              <!-- いやいやが始まったときの文
                   起きた順（行動 → アイテム → ハプニング → いやいや）で
                   読めるように、いちばん最後に置く -->
              <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

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
                  <li class="record-item">
                    <span>おでかけポイント</span>
                    <b>{{ outingPoint }}</b>
                  </li>
                  <li class="record-item">
                    <span>親の体力</span>
                    <b>{{ parentEnergy }}</b>
                  </li>
                  <li class="record-item">
                    <span>親の余裕</span>
                    <b>{{ parentCalm }}</b>
                  </li>
                  <li class="record-item">
                    <span>こうちゃんの機嫌</span>
                    <b>{{ childMood }}</b>
                  </li>
                  <li class="record-item">
                    <span>こうちゃんの体力</span>
                    <b>{{ childEnergy }}</b>
                  </li>
                  <li class="record-item">
                    <span>いやいや発生</span>
                    <b>{{ tantrumCount }}回</b>
                  </li>
                  <li class="record-item">
                    <span>探検した場所の数</span>
                    <b>{{ visitedPlaces.length }}か所</b>
                  </li>
                  <li class="record-item">
                    <span>帰宅時刻</span>
                    <b>{{ currentTime }}</b>
                  </li>
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
  /* 色の設定（ふんわりしたパステル配色）
     こい色は使わず、クレヨンで塗ったような やわらかい色でそろえている
     ※ 上部ステータスの文字は白なので、下地の色は
       白い文字が読める明るさ（コントラスト4.5以上）までにとどめている
  */
  --navy: #2a768f; /* ふかいそらいろ（上部バー・見出し） */
  --navy-deep: #226981;
  --navy-line: #86c6dd;
  --paper: #fffdf9; /* カードの紙 */
  --ink: #4e5860; /* 文字（まっ黒ではなく、やわらかい すみあお） */
  --ink-soft: #8d949b;
  --gold: #ffd166; /* パステルの黄色 */
  --child-energy: #96dfc4; /* ミント */
  --child-mood: #ffd98f; /* バターイエロー */
  --parent-energy: #93cff5; /* そらいろ */
  --parent-calm: #ffa3a3; /* さんご（親の余裕ゲージと、いやいや関連の表示に使う） */

  /* ゲージの目もり（しきい値）の色
     ゲージの中身（緑・オレンジ・青・赤）のどれに重なっても見えるように、
     2本の線は「色」も「太さ」も変えてある
     ・ぐずりだすライン … 白（まわりを黒く縁取り）
     ・あぶないライン   … 黒（まわりを白く縁取り・少し太い）
     白と黒は明るさが正反対なので、どのゲージの上でも見分けやすい
     縁取りをおたがい逆の色にしてあるので、下地が明るくても暗くても消えない
  */
  --line-fuss: #ffffff;
  --line-danger: #000000;

  /* 増減表示の色（中央カード用と、暗い上部ステータス用） */
  --good: #2f9e63;
  --bad: #d55a4b;
  --good-light: #b9f2cd;
  --bad-light: #ffc6bd;

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
  background: linear-gradient(180deg, #d6f0fb 0%, #e8f6ee 45%, #fffdf2 100%);
  color: var(--ink);
  font-family:
    system-ui,
    -apple-system,
    'Hiragino Kaku Gothic ProN',
    'Yu Gothic',
    Meiryo,
    sans-serif;
  font-size: 16px;
  line-height: 1.7;
  box-shadow: 0 0 60px rgb(42 118 143 / 35%);
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

/* タイトル画面の説明（どんなゲームかを伝えるいちばん大事な文章）
   ここを読んでもらってから「公園へ行く」を押してほしいので、
   本文より大きめの文字にして、行のすき間もゆったりとる
*/
.title-card__rule {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 26px;
  padding: 24px 26px;
  border-radius: 14px;
  background: #f2f6fb;
  color: var(--ink);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.9;
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
    'legend legend legend'
    'found found found'
    'warning warning warning'
    'notice notice notice';
  grid-template-columns: auto minmax(0, 1fr) auto;
  /* 文字を大きくしたぶん、列のすき間と左右の余白を少しつめて場所を作る */
  gap: 10px 20px;
  align-items: center;
  padding: 12px 24px 14px;
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
  gap: 2px;
  padding-right: 18px;
  border-right: 1px solid var(--navy-line);
}

.status-area__title {
  color: #eef9ff;
  /* clamp(いちばん小さいとき, 画面幅に合わせた大きさ, いちばん大きいとき)
     画面が広いほど大きく、せまい画面でも小さくなりすぎないようにする書き方
     1.15vw ＝ 画面の横幅の1.15%（1280pxの画面なら約14.7px） */
  font-size: clamp(14px, 1.15vw, 17px);
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.status-clock {
  color: var(--gold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.status-clock__now {
  font-size: clamp(30px, 2.3vw, 36px);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.status-clock__limit {
  color: #daeffb;
  font-size: clamp(13px, 1vw, 15px);
}

/* 時間の増減（+20分）を置く場所
   中身が出ても消えても幅が変わらないように、いつも同じ幅を空けておく
   ここが伸び縮みすると、右にあるゲージやポイントの位置までずれてしまう
   （時間は増えるだけなので「+25分」が入る幅にしてある）
*/
.status-clock__change {
  display: inline-block;
  width: 52px;
  text-align: left;
}

.status-clock .status-change {
  margin-left: 8px;
}

/* ステータス4項目（横1列） */
.status-list {
  display: grid;
  grid-area: gauges;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.status-item {
  display: grid;
  /* 上から3段に分けて置く
     1段目 … ラベル（横はばいっぱい）
     2段目 … 現在値 ／ 直前の増減
     3段目 … ゲージ（横はばいっぱい）
     ラベルを独立した行にすることで、文字を大きくしても
     「こうちゃんの体力」が「こうちゃんの…」と切れなくなる */
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  column-gap: 8px;
}

.status-item__label {
  grid-column: 1 / -1;
  overflow: hidden;
  color: #eaf7ff;
  font-size: clamp(13px, 1.05vw, 15px);
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-item__value {
  /* 100 → 98 → 9 とけた数が変わっても右の増減表示が動かないように、
     数字3けたぶん（3ch）の幅をいつも確保しておく */
  min-width: 3ch;
  font-size: clamp(20px, 1.7vw, 24px);
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
  font-size: clamp(13px, 1vw, 15px);
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
  color: #daeffb;
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
  color: #ffd2c9;
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
  /* 目もり（.gauge__mark）を上に重ねるので、位置の基準にする */
  position: relative;
  display: block;
  grid-column: 1 / -1;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(16 52 70 / 26%);
}

/* ゲージのしきい値を示す縦線（目もり）
   left にしきい値の数字（％）を入れて、その位置に立てる
   ゲージの伸び縮みとは関係なく、いつも同じ場所にある
*/
.gauge__mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  /* 線の中心をしきい値の位置に合わせる（左に半分ずらす） */
  margin-left: -1.5px;
  border-radius: 1px;
}

/* ぐずりだすライン（水色・細め）
   まわりを暗く縁取りして、明るいゲージの上でもはっきり見えるようにする
*/
.gauge__mark--fuss {
  background: var(--line-fuss);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 80%);
}

/* あぶないライン（黒・太め）
   暗い下地に重なっても消えないように、まわりを白く縁取る
*/
.gauge__mark--danger {
  width: 4px;
  margin-left: -2px;
  background: var(--line-danger);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 90%);
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

.gauge__fill--parent-calm {
  background: var(--parent-calm);
}

/* ゲージの目もりの説明（ゲージの下に1行だけ） */
.gauge-legend {
  display: flex;
  grid-area: legend;
  flex-wrap: wrap;
  gap: 2px 16px;
  margin: 0;
  color: #daeffb;
  font-size: clamp(11.5px, 0.9vw, 13px);
  line-height: 1.4;
}

.gauge-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* 説明の前に置く、ゲージの目もりと同じ見た目の小さな線 */
.gauge-legend__mark {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 1px;
}

.gauge-legend__mark--fuss {
  background: var(--line-fuss);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 80%);
}

.gauge-legend__mark--danger {
  width: 4px;
  background: var(--line-danger);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 90%);
}

/* おでかけポイント・おやつ残り（右端に縦積み） */
.status-pills {
  display: flex;
  grid-area: pills;
  flex-direction: column;
  gap: 6px;
  padding-left: 18px;
  border-left: 1px solid var(--navy-line);
}

.pill {
  padding: 4px 14px;
  border: 1px solid var(--navy-line);
  border-radius: 8px;
  background: rgb(255 255 255 / 8%);
  font-size: clamp(13px, 1.05vw, 15px);
  text-align: right;
  white-space: nowrap;
}

.pill b {
  /* こちらも数字2けたぶんの幅を確保して、けたが増えてもずれないようにする */
  display: inline-block;
  min-width: 2ch;
  margin-left: 6px;
  font-size: clamp(19px, 1.5vw, 22px);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.pill--point b {
  color: var(--gold);
}

/* 数字の右がわの置き場所（おでかけポイントの増減 と おやつの「個」）

   ・増減（+5など）は出たり消えたりするので、いつも同じ幅を空けておく
   ・「個」も同じ幅にそろえる
     ピルは右寄せなので、右がわの幅が同じなら
     2つの数字（ポイントとおやつ）が上下でぴったり同じ位置に並ぶ
*/
.pill__change,
.pill__unit {
  display: inline-block;
  width: 34px;
  text-align: left;
}

/* 「個」は数字にくっつきすぎるので、少しあける
   増減表示（+5 など）の margin-left と同じ 6px にそろえている

   ※ padding ではなく text-indent を使う
     text-indent は「文字を右へずらす」だけで枠の幅（34px）は変わらないので、
     上下2つの数字の位置がそろったままになる
*/
.pill__unit {
  text-indent: 6px;
}

.pill .status-change {
  margin-left: 6px;
}

.pill--snack b {
  color: #ffe1b0;
}

/* 見つけたもの（横1列のチップ） */
.status-found {
  display: flex;
  grid-area: found;
  align-items: center;
  gap: 12px;
  max-height: 64px;
  overflow-y: auto;
  padding: 7px 14px;
  border-radius: 8px;
  background: rgb(16 52 70 / 20%);
}

.status-found__label {
  flex: none;
  color: #eaf7ff;
  font-size: clamp(13px, 1.05vw, 15px);
  white-space: nowrap;
}

.status-found__empty {
  color: #bfe2f0;
  font-size: clamp(13px, 1vw, 15px);
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
  padding: 3px 12px;
  border-radius: 999px;
  background: #fff3cf;
  color: #7a5410;
  font-size: clamp(13px, 1.05vw, 15px);
  line-height: 1.6;
}

/* 危険な状態の警告（親の体力・親の余裕・こうちゃんの体力） */
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
  font-size: clamp(13.5px, 1.1vw, 16px);
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
  font-size: clamp(13.5px, 1.1vw, 16px);
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
  border-color: #e6dbfa;
  border-left-color: #8f6ad4;
  background: #f9f4ff;
}

.place-card--secret .place-card__title,
.place-card--secret .place-card__subtitle {
  color: #7f5cc8;
}

/* いやいや中 */
.place-card--tantrum {
  border-color: #f7d3cd;
  border-left-color: var(--parent-calm);
  background: #fff5f3;
}

.place-card--tantrum .place-card__title {
  color: #c9412f;
}

/* 突然イベント（急に起きた出来事のカード）
   ふだんの場所は紺色の線だが、こちらは金色にして
   「いつもと違うことが起きた」と分かるようにしている
*/
.place-card--sudden {
  border-color: #f6dfae;
  border-left-color: var(--gold);
  background: #fffaec;
}

.place-card--sudden .place-card__title {
  color: #8a5a00;
}

/* 「突然イベント！」の帯
   アイテム発見の帯と同じ動き（found-in）で、ふわっと出す
*/
.place-card__flash {
  display: inline-block;
  margin: 0 0 8px;
  padding: 2px 14px;
  border-radius: 999px;
  background: var(--gold);
  color: #4a3208;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  animation: found-in 0.4s ease-out 0.15s backwards;
}

/* 結果メッセージのボックス */
.result-card {
  position: relative;
  animation: result-in 0.3s ease-out;
  padding: 26px 28px 22px;
  border: 2px dashed #f2dcae;
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
  border-top: 1px dashed #f2dcae;
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

/* 1枚のカードの中を、上下2段に分ける

     こうちゃんの体力      ← 1段目：ラベル（横はばいっぱい）
     100 → 82      -18    ← 2段目：左に「前 → 後」、右に増減

   flex から grid に変えているのは、
   「ラベルだけ1行まるごと使う」という置きかたが grid のほうが書きやすいため
*/
.change-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  column-gap: 8px;
  padding: 4px 12px 5px;
  border: 1px solid #f7ead0;
  border-radius: 8px;
  background: #fff;
  line-height: 1.6;
}

.change-item__label {
  /* 1 / -1 ＝ 左はしから右はしまで（＝1行まるごと使う） */
  grid-column: 1 / -1;
  overflow: hidden;
  color: var(--ink-soft);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 「100 → 82」の部分をならべる入れもの
   中の3つ（前・矢印・後）を、たての中心ではなく
   文字の下ラインでそろえる（baseline）と、大きさがちがってもきれいに並ぶ

   tabular-nums ＝ 数字の幅をぜんぶ同じにする書きかた
   100 でも 82 でも幅が変わらないので、6枚のカードがガタガタしない
*/
.change-item__flow {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 行動前の値（100）
   「もう終わった値」なので、小さく・うすい色にして一歩下がってもらう
*/
.change-item__before {
  color: var(--ink-soft);
  font-size: 12.5px;
}

/* 矢印
   数字ではないので、いちばんうすくする
*/
.change-item__arrow {
  color: var(--ink-soft);
  font-size: 11px;
}

/* 行動後の値（82）＝ いま何点なのか
   このカードでいちばん知りたい数字なので、
   大きく・濃い紺色（見出しと同じ色）にして目立たせる

   ※ 良い・悪いの色は付けない
     色で意味を伝えるのは、となりの増減（+6 / -18）の役目
*/
.change-item__after {
  color: var(--navy);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.2;
}

.change-item__value {
  /* 右はしにそろえる（grid では flex: none ではなく justify-self を使う） */
  justify-self: end;
  /* 出たときに、上部ステータスの増減と同じ小さなポップをする
     ※ 動きを減らす設定（prefers-reduced-motion）のときは、
       ページ下のまとめて止める指定でここも自動的に止まる */
  animation: status-pop 0.35s ease-out;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 良い変化・悪い変化・変化なし の色分け
   ※ ステータスは4つとも「ふえると良い」でそろえてあるので、判定は changeClass() にまかせている
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

/* 総合スコア（エンディングカードのいちばん上に大きく出す） */
.ending-card__score-label {
  margin: 0 0 2px;
  color: #a07a2a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.ending-card__score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  margin: 0 0 14px;
}

.ending-card__score-value {
  color: #8a5a00;
  font-size: 48px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.ending-card__score-max {
  color: #b08a3c;
  font-size: 16px;
  font-weight: 700;
}

/* スコア内訳（何で何点もらったかの一覧） */
.score-card {
  padding: 18px 22px;
  border: 2px solid #f0e0bd;
  border-radius: 14px;
  background: var(--paper);
}

.score-card__title {
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 2px solid #f6eeda;
  color: var(--navy);
  font-size: 15px;
}

.score-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.score-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px dotted #ece2cd;
  font-size: 14px;
}

.score-item:last-child {
  border-bottom: none;
}

.score-item__value {
  flex: none;
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* プラスは緑・マイナスは赤（changeClass() が付けるクラス名にあわせている） */
.score-item__value.change--good {
  color: var(--good);
}

.score-item__value.change--bad {
  color: var(--bad);
}

.score-item__value.change--neutral {
  color: var(--ink-soft);
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
  border-bottom: 1px dotted #f0e7d8;
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
  border: 1px solid #f5e2be;
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
  transition:
    opacity 0.24s ease-out,
    transform 0.24s ease-out;
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
  background: var(--parent-calm);
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
  border: 1px solid #f5e2be;
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

/* 「〜を見つけました！」の文
   アイテムの名前だけ、うすい黄色の下じきを敷いて
   地の文の中でもすぐ目に入るようにする
*/
.found-line {
  margin: 10px 0 0;
  font-size: 15.5px;
}

.found-line__name {
  padding: 1px 8px;
  border-radius: 6px;
  background: #fff1c9;
  color: #7a5410;
}

/* 行動の最中に起きた小さなハプニング（ランダムイベント）

   前は結果の文章のうしろに、そのまま文字で書き足していたので、
   「おでかけポイント +5」が地の文にまぎれて気づきにくかった
   ・専用の枠（左に太い線）
   ・「ハプニング！」の帯
   ・ステータスの増減は、色つきのしるし
   の3つで、ひと目で分かるようにしている
*/
.event-flash {
  margin: 12px 0 0;
  padding: 12px 16px 14px;
  border: 1px solid #cfe3ef;
  border-left: 5px solid var(--navy-line);
  border-radius: 10px;
  background: #f2f9fc;
  /* アイテムの帯と同じ動きで、少し遅れてふわっと出す */
  animation: found-in 0.4s ease-out 0.25s backwards;
}

.event-flash__label {
  display: inline-block;
  margin: 0 0 6px;
  padding: 1px 12px;
  border-radius: 999px;
  background: var(--navy);
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.event-flash__text {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.7;
}

/* ステータスの増減のしるし（おでかけポイント +5 など） */
.event-flash__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.event-flash__item {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 14px;
  border: 1px solid #d8e7ef;
  border-radius: 999px;
  background: #fff;
}

.event-flash__item-label {
  color: var(--ink-soft);
  font-size: 12.5px;
}

/* 増減の数字（色は結果カードの「今回の変化」と同じ考えかた）
   ※ 良い・悪いの判定は changeClass() にまかせている
*/
.event-flash__item-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.event-flash__item-value.change--good {
  color: var(--good);
}

.event-flash__item-value.change--bad {
  color: var(--bad);
}

.event-flash__item-value.change--neutral {
  color: var(--ink-soft);
}

/* いやいやが始まったときの文
   結果カードのいちばん下に置き、
   いやいやの色（さんご）の線をつけて、ここで場面が変わることを伝える
*/
.tantrum-line {
  margin: 12px 0 0;
  padding: 10px 14px;
  border-left: 5px solid var(--parent-calm);
  border-radius: 6px;
  background: #fff5f3;
  color: #a33a29;
  font-size: 14.5px;
  line-height: 1.7;
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
  color: #dcf0f9;
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
  color: #b8dfef;
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
  color: #dcf0f9;
  font-size: 12px;
  letter-spacing: 0.1em;
}

.command__note {
  grid-column: 1 / -1;
  margin: 0;
  padding: 9px 14px;
  border: 1px dashed var(--navy-line);
  border-radius: 10px;
  color: #b8dfef;
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
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
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
  border-color: #e8b23c;
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
  border-color: #7f5cc8;
  background: linear-gradient(180deg, #bd9bef 0%, #8f6ad4 100%);
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
  border-color: #e8b23c;
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
    font-size: clamp(24px, 1.9vw, 30px);
  }

  /* 文字は大きいままにしたいので、いちばん大きいときの値だけ少し下げる */
  .status-item__value {
    font-size: clamp(18px, 1.5vw, 21px);
  }

  .pill b {
    font-size: clamp(17px, 1.35vw, 20px);
  }

  .status-found {
    max-height: 52px;
  }

  /* 高さが足りないので、目もりの説明は隠す
     （目もりの線そのものは残り、マウスを乗せると説明が出る） */
  .gauge-legend {
    display: none;
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

  /* ハプニングの枠も、背の低い画面では少しつめる */
  .event-flash {
    margin-top: 10px;
    padding: 10px 14px 11px;
  }

  .event-flash__text {
    font-size: 14px;
  }

  /* 「前 → 後」で1行ふえたので、背の低い画面では余白と文字を少しつめて
     上部ステータス〜下部コマンドが一画面に収まるようにする */
  .change-item {
    padding: 2px 10px 3px;
  }

  .change-item__before {
    font-size: 12px;
  }

  .change-item__after {
    font-size: 17px;
  }

  .change-item__value {
    font-size: 14px;
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
      'legend legend'
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
    font-size: 24px;
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

  /* 説明文は大きいままにしたいが、スマホの画面幅に収まる大きさへ少し下げる */
  .title-card__rule {
    gap: 12px;
    padding: 18px 18px;
    font-size: 16.5px;
    line-height: 1.8;
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
