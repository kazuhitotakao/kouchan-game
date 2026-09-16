<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { loadHasUnlockedSPlusSong, saveSPlusSongUnlocked, sPlusSongSrc, sPlusSongTitle } from '~/utils/sPlusSong';

const gameTitle: string = 'こうちゃんの大冒険';

/* 画面は4段階あり、この3つの組み合わせで決まる

   titleEntered  isSnackSelectionOpen  gameStarted   画面
   ---------------------------------------------------------------------
   false         false                 false         起動画面（▶ はじめる）
   true          false                 false         タイトル画面（きょうのおやつを選ぶ）
   true          true                  false         おやつ選択画面（きょうのおやつ）
   true          -                     true          ゲーム画面

   ※ 起動画面をはさんでいるのは、ブラウザの決まりへの対応
     「ユーザーがまだ一度も触っていないページでは音を鳴らせない」ため、
     ページを開いた直後にBGMを鳴らそうとしても止められてしまう
     そこで「▶ はじめる」を1回押してもらい、
     その操作をきっかけにタイトルBGMを鳴らしはじめる

   ※ ゲーム画面の行の isSnackSelectionOpen が「-」なのは、
     公園へ出発したあとも true のまま残しているため
     （選んだおやつはゲーム中もずっと持っているものなので、
       おやつ選択画面を「閉じた」ことにする必要がない）
     gameStarted が true ならゲーム画面、という順番で見分けている

   ※ この表のほかに「あそびかた」画面がある（isHowToPlayOpen）
     B画面から一時的に開く説明書のページで、開いているあいだは
     A画面・B画面・おやつ選択画面より優先して表示する
*/
const titleEntered = ref(false);

const gameStarted = ref(false);

/* おやつ選択画面（B画面とゲーム画面のあいだの準備画面）を開いているかどうか

   B画面の「きょうのおやつを選ぶ」で true になり、ここではまだゲームは始まらない
   （タイトルBGMも鳴ったまま。公園へ出発するのは
     「このおやつで公園へ行く！」を押したとき）
*/
const isSnackSelectionOpen = ref(false);

/* 「あそびかた」画面を開いているかどうか

   B画面の「？ あそびかた」で true、「← ひとつ前の画面へ戻る」・Escape で false になる
   B画面の上に説明書を一時的に広げるだけなので、
   titleEntered・isSnackSelectionOpen・gameStarted はさわらない
   （タイトルBGMも鳴ったまま。止めも、最初から鳴らしなおしもしない）

   ※ 画面の出し分け・キー操作・フォーカスのどれも、
     「!gameStarted && isHowToPlayOpen」を、おやつ選択画面より先に見る
   ※ 読んだかどうかは保存しない（localStorage は使わない）
     必要な人が、必要なときに開くためのページ */
const isHowToPlayOpen = ref(false);

/* ============================================================
   A画面・B画面のボタンを覚えておく箱（キーボード操作用）

   ref="〜" と書いたボタンが、そのままここに入ってくる
   （画面に出ていないときは null）

   この箱を使ってやることは2つ
   ・画面が切りかわったとき、メインのボタンへフォーカスを当てる
   ・↑↓←→ で、ボタンをぐるぐる選べるようにする

   A画面  … はじめる／♪ サウンドトラック／サウンドON・OFF
   B画面  … きょうのおやつを選ぶ／はじめの画面へ戻る／？ あそびかた／サウンドON・OFF
   あそびかた画面 … ← ひとつ前の画面へ戻る／サウンドON・OFF
   ※ サウンドON/OFFは、どの画面でも一度に1つしか画面に出ないので、
     箱は1つだけで足りる（おやつ選択画面・あそびかた画面も同じ箱を使う）
   ============================================================ */
const startButtonRef = ref<HTMLButtonElement | null>(null);
const soundtrackButtonRef = ref<HTMLButtonElement | null>(null);
const selectSnacksButtonRef = ref<HTMLButtonElement | null>(null);
const howToPlayButtonRef = ref<HTMLButtonElement | null>(null); // B画面の「？ あそびかた」
const backToBootButtonRef = ref<HTMLButtonElement | null>(null);
const soundToggleButtonRef = ref<HTMLButtonElement | null>(null);

/* 音量スライダー
   A画面・B画面で Tab を回りこませるときに、いちばん後ろの行き先として使う */
const soundVolumeSliderRef = ref<HTMLInputElement | null>(null);

/* あそびかた画面の「← ひとつ前の画面へ戻る」（上のツールバーの左）
   画面が出おわったときに、ここへフォーカスを当てる */
const howToBackButtonRef = ref<HTMLButtonElement | null>(null);

/* おやつ選択画面のカードまるごと

   ここだけボタン1つずつではなく、入れものをまるごと覚えておく
   おやつは snacks 配列から v-for で作るので、
   あとからおやつが増えても、refを1つずつ増やさなくてすむようにしたい

   この入れものを使ってやることは2つ
   ・画面が出たとき、最初のおやつ（🍇 グミ）へフォーカスを当てる
   ・矢印キーで、中の押せるボタンを見た目どおりに行き来する
     （おやつのカード／出発／戻る／サウンドON/OFF） */
const snackSelectionRef = ref<HTMLElement | null>(null);

/* 今いる場所を管理する型
   parkEntrance = 公園入口
   slide        = すべり台
   sandbox      = 砂場
   acornArea    = どんぐりの木
   pond         = 池
   grassArea    = 芝生広場
   secretSpot   = こもれびの広場
   secretPath   = 秘密の小道（こもれびの広場へ続くミニゲーム。そのプレイではじめて広場へ行くときだけ通る）
   tantrum      = いやいや中（なだめる場面）
   goal         = ゴール（公園の出口）
   gameOver     = ゲームオーバー（限界をむかえて途中で終わった）

   ここから下は「とつぜんのできごと」の画面
   通常行動のあとに20%で起こる、専用画面つきの出来事
   emergencySiren = 救急車のサイレンが聞こえる
   ladybug        = テントウムシを見つける
   dog            = 犬が近づいてくる
   fallDown       = こうちゃんがころぶ
   fountain       = 噴水が突然出る
*/
type GameEvent = 'parkEntrance' | 'slide' | 'sandbox' | 'acornArea' | 'pond' | 'grassArea' | 'secretSpot' | 'secretPath' | 'tantrum' | 'goal' | 'gameOver' | 'emergencySiren' | 'ladybug' | 'dog' | 'fallDown' | 'fountain';

/* 現在いる場所
   最初は「公園入口」からスタート
*/
const currentEvent = ref<GameEvent>('parkEntrance');

/* いま選んでいるコマンドの番号（キーボード操作用）
   0 = 1番目、1 = 2番目、2 = 3番目 という意味

   ↑↓キーでこの数字を動かし、Enter / Space でその番号のコマンドを実行する
   別の場所へ移動したときや、新しいコマンド画面になったときは 0 に戻して、
   いつも一番上のコマンドが選ばれている状態からはじめる
   （例外：公園入口へ戻ってきたときは、最後にいた場所のコマンドに合わせる → restoreEntranceCursor()）
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

/* 場所で遊んだ回数
   その場所で1つ行動するたびに、1ずつ増える（同じ場所で遊んでも増える）

   探検済みの場所（visitedPlaces）は「何か所回ったか」しか分からないので、
   「同じすべり台で5回あそんだ」も「1か所だけ」になってしまう
   結果の文章で「たくさん遊んだ／ほとんど遊べなかった」を見分けるために、
   回った場所の数とは別に、遊んだ回数もここで数えておく
*/
const playCount = ref(0);

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
   ・randomEventEffects … そのできごとだけのステータス増減

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
   「アイテム発見」「ちいさなできごと」の表示より前に出てしまい、
   起きた順（行動 → アイテム → ちいさなできごと → いやいや）と食いちがう
   そこで文章だけここに持ち、画面のいちばん下に出す
*/
const tantrumText = ref('');

/* いやいやが起きた回数（記録用） */
const tantrumCount = ref(0);

/* いやいや発生の演出（画面いっぱいのオーバーレイ）を出しているかどうか

   true のあいだだけ「いやいや発生！」のオーバーレイが画面に重なって出る
   出すのは「新しいいやいやが始まった瞬間」の1回だけで、
   「少し待ってみる」に失敗して同じいやいやが続くときには出さない
*/
const tantrumAlertVisible = ref(false);

/* ============================================================
   きょうのおやつ（公園へ持っていくおやつ ＝ バッグの中身）

   ゲームが始まる前に、6種類から2種類を選んでバッグに入れてもらう
   公園へ出発したあとは、同じバッグから1つずつ取り出して食べる

   ■ selectedSnackIds の2つの顔

     ゲーム開始前 … 「公園へ持っていくおやつ」
     ゲーム中     … 「いまバッグに残っているおやつ」

     どちらも同じ配列で、食べるたびにそのおやつの名札が消えていく
       出発したとき   ['gummy', 'senbei']
       グミを食べた   ['senbei']
       せんべいも食べた []

     「残りのおやつ」を別の配列に写したりはしないので、
     バッグの中身が2か所でずれることがない

   ■ おやつの残り個数（snackLeft）

     バッグの中身の数そのもの（selectedSnackIds.length）
     数を別に持って増やしたり減らしたりはしない
     ＝ おやつを食べて名札が消えれば、残り個数も自動で1つ減る

   ■ ゲーム中にどのおやつを食べるか選ぶメニュー（おやつバッグ）は、
     もう少し下の「サブメニュー ☕ ひとやすみ」のあとにまとめてある
   ============================================================ */

/* おやつの名札（どのおやつかを表す文字）

   'gummy' のように決めた文字しか入れられないようにしておくと、
   'gumi' や 'グミ' のような書きまちがいを、
   ブラウザで動かす前にエディタが赤線で教えてくれる */
type SnackId = 'gummy' | 'chocolate' | 'senbei' | 'biscuit' | 'banana' | 'jelly';

/* おやつ1種類ぶんの中身

   id          … 名札（上の SnackId）
   name        … 画面に出す名前（「グミ」）
   icon        … 画面に出す絵文字（「🍇」）
   energy      … 食べたときに回復する、こうちゃんの体力
   mood        … 食べたときに回復する、こうちゃんの機嫌
   minutes     … 食べるのにかかる時間（分）
   description … どんなおやつかの説明文

   ※ energy / mood / minutes は、ゲーム中におやつを食べたときの
     「こうちゃんの体力・機嫌がどれだけ回復するか」「何分かかるか」としてそのまま使う
     （休憩中の giveSnackWhileExploring() と、いやいやタイムの giveSnack()）

     「グミなら機嫌 +20」のような数字は、この snacks の中にしか書かない
     回復量を変えたくなったら、ここ1か所を書きかえるだけで
     おやつ選択画面の表示も、ゲーム中の効果も、いっしょに変わる */
type Snack = {
  id: SnackId;
  name: string;
  icon: string;
  energy: number;
  mood: number;
  minutes: number;
  description: string;
};

/* おやつの一覧（画面に出る6種類）

   おやつを増やしたいときは、ここへ1件足すだけでよい
   画面のほうは v-for でこの配列をそのまま並べているので、
   HTMLに新しいカードを書き足す必要はない
   （そのぶん SnackId にも名札を1つ足すこと） */
const snacks: Snack[] = [
  {
    id: 'gummy',
    name: 'グミ',
    /* 🍬（CANDY）は見た目が「包み飴」なので、グミには使わない

       絵文字には「グミ」そのものが無いため、
       果汁グミでおなじみのぶどうにして、飴と見まちがえないようにしている
       （ほかの5つ 🍫 🍘 🍪 🍌 🧃 とも色・形がかぶらない）

       ※ ここを変えるだけで、画面のカードもバッグの表示も入れかわる
         （どちらも snacks のこの icon を見ているため） */
    icon: '🍇',
    energy: 5,
    mood: 20,
    minutes: 5,
    description: 'こうちゃんの大好物。機嫌が大きく回復',
  },
  {
    id: 'chocolate',
    name: 'チョコ',
    icon: '🍫',
    energy: 10,
    mood: 14,
    minutes: 5,
    description: '体力と機嫌をバランスよく回復',
  },
  {
    id: 'senbei',
    name: 'せんべい',
    icon: '🍘',
    energy: 18,
    mood: 6,
    minutes: 10,
    description: 'おなかがいっぱいになって体力が回復',
  },
  {
    id: 'biscuit',
    name: 'ビスケット',
    icon: '🍪',
    energy: 12,
    mood: 10,
    minutes: 5,
    description: '体力と機嫌をほどよく回復',
  },
  {
    id: 'banana',
    name: 'バナナ',
    icon: '🍌',
    energy: 24,
    mood: 4,
    minutes: 10,
    description: '体力をしっかり回復',
  },
  {
    id: 'jelly',
    name: 'ゼリー',
    icon: '🧃',
    energy: 7,
    mood: 15,
    minutes: 5,
    description: 'つるんと食べやすく、機嫌が回復',
  },
];

/* バッグに入れられるおやつの数

   「2」を画面や関数のあちこちに書かずに、ここ1か所だけにしておく
   3つ持っていける仕様にしたくなったら、この数字を 3 に変えるだけでよい
   （画面の「2 / 2」も、押せるようになる条件も、ぜんぶここを見ている） */
const maxSnackCount = 2;

/* 今日バッグに入れたおやつ（選んだ順にならぶ）

   入っているのは名札だけで、['gummy', 'senbei'] のような見た目になる
   おやつの中身（名前・絵文字・回復量）は snacks のほうが持っているので、
   ここでは同じ情報を2か所に持たないようにしている

   ゲーム中は「いまバッグに残っているおやつ」として使う
   食べたおやつは removeSnackFromBag() でここから消える

   ※ 同じおやつは1個までなので、['gummy', 'gummy'] にはならない
   ※ localStorage には保存しない（その1プレイだけのもの）
     ページを読みこみ直したら、また空から選びなおす
   ※ 空に戻すのは resetGame()（もう一度あそぶ）と goBackToBoot()（A画面へ戻る）だけ
     startGame() では書きかえないので、選んだおやつがそのまま公園へ持ちこまれる */
const selectedSnackIds = ref<SnackId[]>([]);

/* 名札（'gummy' など）から、おやつの中身（snacks の中の1件）をさがす

   find() は、snacks の中から条件に合う最初の1件を返す
   見つからなかったときは undefined になる */
function findSnack(snackId: SnackId) {
  return snacks.find((snack) => snack.id === snackId);
}

/* 選んだおやつの中身（名札 → snacks の中の本体）

   画面で「🍇 グミ」と絵文字つきで出したいので、名札から本体を引いておく
   おやつ選択画面のバッグ表示と、ゲーム中のおやつバッグの両方で、これを並べる
   （食べたおやつは selectedSnackIds から消えるので、ここからも自動で消える）

   ・map()    … 名札をひとつずつ本体に置きかえる（findSnack() でさがす）
   ・filter() … 見つからなかったぶん（undefined）を取りのぞく

   filter の中の「snack is Snack」は、
   「ここを通りぬけたものは、もう undefined ではない」と
   TypeScriptに伝えるための書きかた
   これがないと、このあと snack.name と書くたびに
   「undefined かもしれない」と言われてしまう */
const selectedSnacks = computed(() => selectedSnackIds.value.map((id) => findSnack(id)).filter((snack): snack is Snack => snack !== undefined));

/* おやつの残り個数（＝バッグに残っているおやつの数）

   selectedSnackIds の長さをそのまま返すだけ
   数を別に持たないので「バッグは空なのに残り1個」のようなずれが起きない

   ※ computed なので snackLeft.value = 2 や snackLeft.value -= 1 は書けない
     減らしたいときは、バッグからおやつを取り出す（removeSnackFromBag()）

   「snackLeft > 0」は「バッグにおやつが1個以上残っている」という意味
   （おやつのコマンドを出すか・コマンドの数・「少し待ってみる」の番号 で使う） */
const snackLeft = computed(() => selectedSnackIds.value.length);

/* バッグがいっぱいかどうか（＝これ以上は選べない）

   いっぱいのときは、まだ選んでいないおやつのカードを押せなくする
   （選んでいるおやつのカードは押せるままにして、解除できるようにする） */
const isSnackBagFull = computed(() => selectedSnackIds.value.length >= maxSnackCount);

/* 公園へ出発できるかどうか（ちょうど2種類そろっているか）

   「このおやつで公園へ行く！」を押せるようにする条件 */
const canStartWithSnacks = computed(() => selectedSnackIds.value.length === maxSnackCount);

/* そのおやつが、いまバッグに入っているかどうか

   おやつ選択画面では、「選択中」の見た目にするかどうかと、
   カードを押せなくするかどうかの、両方で使う
   ゲーム中は「そのおやつをまだ食べていないか」の確認に使う（findSnackInBag()） */
function isSnackSelected(snackId: SnackId) {
  return selectedSnackIds.value.includes(snackId);
}

/* バッグの中にあるおやつの中身を返す（ここではまだバッグから消さない）

   ゲーム中におやつを食べる関数が、いちばん最初にこれを呼ぶ
   ・バッグに入っていない（もう食べた／持ってきていない）おやつ … undefined
   ・バッグに入っているおやつ                                   … そのおやつの中身

   画面にはバッグにあるおやつしか出していないが、
   関数を直接呼ばれても「持っていないおやつで回復する」ことがないように、ここでも確かめる */
function findSnackInBag(snackId: SnackId) {
  if (!isSnackSelected(snackId)) {
    return undefined;
  }

  return findSnack(snackId);
}

/* おやつをバッグから出す（selectedSnackIds から名札を消す）

   同じおやつは1個までなので、同じ名札をぜんぶ消す形で問題ない
   ゲーム中は、ステータスの計算がぜんぶ終わってから呼ぶこと
   （先に呼ぶと、途中で何かあったときに「おやつだけ減った」ことになってしまう） */
function removeSnackFromBag(snackId: SnackId) {
  selectedSnackIds.value = selectedSnackIds.value.filter((id) => id !== snackId);
}

/* ============================================================
   いやいやの理由（こうちゃんは、なぜ泣いているのか）

   いやいやには4つの理由があり、理由によって「効く対応」がちがう
   プレイヤーは、こうちゃんのセリフや様子から理由を考えて、対応を選ぶ

   ■ 「発生するか」と「なぜ泣いているか」は別の抽選

     ① checkTantrum()       … いやいやが「そもそも起きるか」を決める
                               （体力・機嫌・時間から確率を出す。ここは前と同じ）
     ② chooseTantrumReason() … ①で起きると決まったあとで「なぜ泣いているか」を決める

     ①で起きなかったときは、②は呼ばれない（理由も変わらない）

   ■ 同じいやいやのあいだは、理由を変えない

     理由を決めるのは「新しいいやいやが起きた瞬間」の1回だけ
     「少し待ってみる」に失敗して いやいや が続いても、理由はそのまま
     （「おなかすいた」と泣いていたのに、待っていたら急に
       「まだあそぶ」に変わった、ということが起きないようにする）

   ■ 画面には理由の名前（'hungry' や「空腹」）を出さない

     出すのは tantrumReasonInfo のセリフと様子だけ
     答えを見せずに、プレイヤーに考えてもらうため
   ============================================================ */

/* いやいやの理由
   tired        … つかれた
   hungry       … おなかすいた
   frustrated   … うまくできなくて悔しい
   wantMorePlay … まだ遊びたい */
type TantrumReason = 'tired' | 'hungry' | 'frustrated' | 'wantMorePlay';

/* いまのいやいやの理由

   null … いやいやしていない（または、まだ理由が決まっていない）

   ※ だっこ・おやつなどで いやいや が終わった瞬間には null に戻さない
     結果の文章を読んでいるあいだも「何のいやいやだったか」を使うことがあるため
     null に戻すのは、結果を読み終えて いやいやタイムの画面から出るとき（goToNextPlace()）
     と、もう一度あそぶとき（resetGame()） */
const tantrumReason = ref<TantrumReason | null>(null);

/* ============================================================
   いやいやの激しさ（いやいやレベル）

   同じ1回のいやいやでも、対応しだいで激しさが変わる
     1 … ぐずぐず   （はじまったばかり）
     2 … 大泣き     （対応がずれて、泣き声が大きくなった）
     3 … 大いやいや （地面にごろん。いちばん激しい）

   ・新しいいやいやは、かならず 1 から始まる
   ・ずれた対応をすると 1 → 2 → 3 と上がる（3 より上にはならない）
   ・合った対応をすると、1段落ち着くこともある
   ・いやいやが終わるのは、それぞれの対応で isTantrum を false にしたときだけ
     （レベルが 1 まで下がっても、それだけでは終わらない）

   ※ tantrumCount（いやいやが起きた回数）とは別もの
     レベルが 1 → 2 → 3 と上がっても、同じ1回のいやいやなので、回数は増えない

   ※ 画面には「Lv2」のような数字は出さない
     見出しとこうちゃんの様子（ぐずぐず → 大泣き → 大いやいや）で伝える
   ============================================================ */
type TantrumLevel = 1 | 2 | 3;

/* いまのいやいやの激しさ
   いやいやしていないときは 1 のまま（新しいいやいやも 1 から始まる） */
const tantrumLevel = ref<TantrumLevel>(1);

/* レベルごとの見出しと様子

   icon  … 見出しの前に出す顔
   title … いやいやタイムのカードの見出し
   scene … こうちゃんの様子
           ぐずぐず（1）は、理由ごとの様子（tantrumReasonInfo の scene）を出すので null
           大泣き（2）・大いやいや（3）は、泣きかたの激しさそのものを見せたいので理由に関係なく同じ文
           （理由の手がかりは、レベルごとのセリフ voices のほうに残してある） */
type TantrumLevelInfo = {
  icon: string;
  title: string;
  scene: string | null;
};

const tantrumLevelInfo: Record<TantrumLevel, TantrumLevelInfo> = {
  1: { icon: '😫', title: 'いやいやタイム', scene: null },
  2: { icon: '😭', title: 'いやいやタイム！', scene: 'こうちゃんは涙をぽろぽろ流しながら、大きな声で泣いています。' },
  3: { icon: '😭💥', title: '大いやいやタイム！', scene: 'こうちゃんは地面にごろん！ 涙をぽろぽろ流しながら、全身でいやいやしています。' },
};

/* いまのレベルの見出しと様子 */
const currentTantrumLevelInfo = computed(() => tantrumLevelInfo[tantrumLevel.value]);

/* 理由ごとに、画面や結果の文章に出すことば

   voices         … いやいやタイムのカードに出す、こうちゃんのセリフ（レベルごとに3つ）
                    はげしくなるほど、のばす音と「！」が増える
                    どのレベルでも、理由の手がかりはこのセリフに残る
   scene          … ぐずぐず（レベル1）のときの、こうちゃんの様子
                    （大泣き・大いやいやの様子は tantrumLevelInfo のほう）
   complaint      … 対応がずれていたときの結果の文章に出す、短いさけび
                    （相性のわるいおやつをあげたとき／待つに失敗したとき）
   greatSnackText … ぴったりのおやつ（相性 great）をあげたときに足す文 */
type TantrumReasonInfo = {
  voices: Record<TantrumLevel, string>;
  scene: string;
  complaint: string;
  greatSnackText: string;
};

const tantrumReasonInfo: Record<TantrumReason, TantrumReasonInfo> = {
  tired: {
    voices: { 1: 'もうあるけない〜！', 2: 'もうあるけないー！！', 3: 'もうあるけないーーー！！！' },
    scene: 'こうちゃんは、その場にしゃがみこんでいます。',
    complaint: 'つかれたー！',
    greatSnackText: 'ちょっと元気がもどってきたみたいです。',
  },
  hungry: {
    voices: { 1: 'おなかすいた〜！', 2: 'おなかすいたー！！', 3: 'おなかすいたーーー！！！' },
    scene: 'こうちゃんは、おなかを押さえて座りこんでいます。',
    complaint: 'おなかすいたー！',
    greatSnackText: 'おなかも少し満たされたようです。',
  },
  frustrated: {
    voices: { 1: 'なんかちがう〜！', 2: 'なんかちがうー！！', 3: 'ちがうのーーー！！！' },
    scene: 'こうちゃんは、目に涙をためて納得できない様子です。',
    complaint: 'なんかちがうー！',
    greatSnackText: '悔しかった気持ちも、少しやわらいだようです。',
  },
  wantMorePlay: {
    voices: { 1: 'まだあそぶ〜！', 2: 'まだあそぶー！！', 3: 'まだあそぶーーー！！！' },
    scene: 'こうちゃんは、遊具を指さして動こうとしません。',
    complaint: 'まだあそぶー！',
    greatSnackText: 'まだ遊びたい気持ちも、少し切りかわったようです。',
  },
};

/* いまのいやいやの理由に合ったことば（理由が決まっていないときは null） */
const currentTantrumReasonInfo = computed(() => (tantrumReason.value === null ? null : tantrumReasonInfo[tantrumReason.value]));

/* いやいやタイムのカードに出す、こうちゃんの様子
   ぐずぐずのときは理由ごとの様子、大泣き・大いやいやのときはレベルごとの様子 */
const currentTantrumScene = computed(() => currentTantrumLevelInfo.value.scene ?? currentTantrumReasonInfo.value?.scene ?? '');

/* おやつと いやいやの理由の相性

   great  … ぴったり     → どのレベルでも いやいや終了 ＋ ナイス対応
   normal … ふつうに効く → ぐずぐずなら終了、大泣き以上なら1段落ち着くだけ（いやいやは続く）
   weak   … ずれている   → 食べてはくれるが、いやいやは悪化する

   ※ great が大いやいやでも効くのは、「理由にぴったりのおやつ」はそれだけ強い、というルールのため
     normal は「おやつはうれしいけれど、泣いている理由には合っていない」ので、
     はげしく泣いているときは、ひとまず少し落ち着くところまでしか効かない

   ※ おやつ選択画面にもおやつバッグにも、この相性は出さない
     こうちゃんの様子とおやつの説明から、プレイヤーに考えてもらう */
type TantrumSnackFit = 'great' | 'normal' | 'weak';

/* おやつ × いやいやの理由 の相性表

   おやつの回復量（snacks の energy / mood / minutes）とは別のルールなので、
   Snack の型には入れず、ここに表として分けて持つ
   （回復量を変えたいときは snacks、相性を変えたいときはこの表、と見る場所が分かれる）

   読みかた：snackTantrumFits.banana.hungry → バナナは「おなかすいた」に great */
const snackTantrumFits: Record<SnackId, Record<TantrumReason, TantrumSnackFit>> = {
  gummy: { tired: 'weak', hungry: 'normal', frustrated: 'great', wantMorePlay: 'normal' },
  chocolate: { tired: 'normal', hungry: 'normal', frustrated: 'great', wantMorePlay: 'normal' },
  senbei: { tired: 'normal', hungry: 'great', frustrated: 'weak', wantMorePlay: 'weak' },
  biscuit: { tired: 'normal', hungry: 'great', frustrated: 'normal', wantMorePlay: 'weak' },
  banana: { tired: 'great', hungry: 'great', frustrated: 'weak', wantMorePlay: 'weak' },
  jelly: { tired: 'normal', hungry: 'normal', frustrated: 'normal', wantMorePlay: 'normal' },
};

/* いまのいやいやの理由に対して、そのおやつの相性はどうか

   理由が決まっていないとき（ふつうは起きない）は normal にしておく
   ＝ 相性を入れる前と同じく、どのおやつでも いやいや が終わる */
function getSnackTantrumFit(snackId: SnackId): TantrumSnackFit {
  if (tantrumReason.value === null) {
    return 'normal';
  }

  return snackTantrumFits[snackId][tantrumReason.value];
}

/* ============================================================
   いやいや中に選んだ対応の記録（同じ対応のくり返し）

   「同じことを何度もやれば、いつかは勝てる」にならないように、
   直前と同じ対応を続けたときは、少し効きにくくする

   ■ lastTantrumAction … 直前に選んだ対応
     'hug' だっこ／'talk' お話／'wait' 待つ／'snack:gummy' などのおやつ
     おやつは種類ごとに別の対応としてあつかう
     （グミが合わなかったあとに、せんべいへ変えるのは「くり返し」ではない）

   ■ repeatedTantrumActionCount … 同じ対応を何回続けているか
     0 … 1回目（直前とちがう対応）
     1 … 2回続けた
     2 … 3回以上続けた（2より大きくはしない）

   ・ちがう対応を選ぶと 0 に戻る
     （待つ → 待つ → お話 → 待つ なら、最後の待つは、また「1回目」）
   ・書きかえるのは registerTantrumAction() の1か所だけ
   ・新しいいやいやが始まったときと、いやいやタイムから出るときに、まとめて空へ戻す
   ============================================================ */
type TantrumAction = 'hug' | 'talk' | 'wait' | `snack:${SnackId}`;

const lastTantrumAction = ref<TantrumAction | null>(null);
const repeatedTantrumActionCount = ref(0);

/* ===== ナイス対応（いやいやの理由に合った対応をしたときのごほうび） =====

   ナイス対応になるのは次のとき（ボーナスを足すのは applyNiceTantrumResponse() の1か所だけ）
   ・つかれた           ＋ だっこ（どのレベルでも）
   ・悔しい             ＋ お話する（大いやいやで1段落ち着くだけのときもふくむ）
   ・まだ遊びたい       ＋ お話する（同上）
   ・悔しい             ＋ 少し待ってみる（成功したとき。1段落ち着くだけのときもふくむ）
   ・相性 great のおやつ ＋ そのいやいやの理由（どのレベルでも）

   ボーナスがもらえるのは、1回のいやいやにつき1回だけ（hasNiceTantrumResponse で見る） */

/* ナイス対応でもらえるボーナスの量（画面の「おでかけポイント +3」もここを見る） */
const niceTantrumBonusOutingPoint = 3;
const niceTantrumBonusParentCalm = 2;

/* このいやいやで、もうナイス対応のボーナスをもらったかどうか

   ボーナスは1回のいやいやにつき1回だけ
   たとえば「大いやいやで正しいお話 → 大泣きに下がる → もう一度お話で解決」のとき、
   2回ともボーナスを入れると、わざと長引かせたほうが得になってしまうため

   新しいいやいやが始まったときと、いやいやタイムから出るときに false へ戻す */
const hasNiceTantrumResponse = ref(false);

/* ナイス対応の表示に出す文章（演出用）

   空っぽ … 今回の対応はナイス対応ではなかった（結果カードに「✨ ナイス対応！」を出さない）
   行動をはじめるたび（startStatusChanges()）と、いやいやタイムから出るときに空へ戻す */
const niceTantrumResponseText = ref('');

/* とつぜんのできごとが起きる確率
   0.2 ＝ 20%（5回に1回くらい）
   ここの数字だけを書きかえれば、起きやすさを変えられる
   例）0.15 なら15%、0.25 なら25%
*/
const suddenEventChance = 0.2;

/* 次に起こす予定のとつぜんのできごと（予定表）

   null                    … 予定なし
   'emergencySiren' など   … 次の「次へ」で、そのとつぜんのできごと画面へ移動する

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

/* S+ランク限定の「うた入りエンディングBGM」を、このブラウザで解放済みかどうか

   一度でもS+ランクを取ると true になり、localStorage にも保存される
   （保存のしくみは utils/sPlusSong.ts。サウンドトラックのページも同じものを使う）

   ※ 体力や機嫌とちがって「ゲームのステータス」ではなく「実績・解放情報」なので、
     resetGame（もう一度あそぶ／はじめの画面へ戻る）では false に戻さない
     （サウンドの設定 soundEnabled と同じあつかい）
   ※ 前に解放しているかは、onMounted で localStorage から思い出す
*/
const hasUnlockedSPlusSong = ref(false);

/* 今回のゴールで、うた入りBGMを「このブラウザではじめて」解放したかどうか

   true のときだけ、リザルト画面に「✨ サウンドトラックに新しい曲が追加されました！」を出す
   2回目以降のS+では出さない（曲そのものは毎回流す）
   こちらはその1プレイだけの表示なので、resetGame() で false に戻す
*/
const isSPlusSongNewlyUnlocked = ref(false);

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

/* 公園に着いたばかりかどうか

   公園で何かをすると、かならず時計が進む
   逆にいうと、時計が 09:00 のままなら「まだ何もしていない＝着いたばかり」ということ
   （「もう一度あそぶ」で 09:00 に戻したときも、また着いたばかりに戻る）
*/
const isJustArrivedAtPark = computed(() => currentTime.value === '09:00');

/* 公園入口のあいさつ文（3段階で切り替える）

   公園入口には、行動のたびに何度も戻ってくる
   そのため「やってきました」のままだと、2回目からは少しちぐはぐに聞こえる
   そこで、いまがどの場面かで言いかたを変えている

   ① 着いたばかり（時計がまだ09:00） … はじめてのあいさつ
   ② 午前前半のおかえり（〜10:29）   … 入口へもどってきたときの言いかた
   ③ 午前後半（10:30〜）             … お昼が近づいてきたことを伝える

   ③の境目は、公園BGMがBGM2に変わる時刻とわざと同じにしてある
   （shouldUseParkBgm2 を使いまわしているので、境目の数字は1か所だけ）
   曲と文言がいっしょに変わることで、
   「午前前半の章 → 午前後半の章」へ進んだ感じが出る
*/
const parkEntranceText = computed(() => {
  // ① 着いたばかり
  if (isJustArrivedAtPark.value) {
    return 'こうちゃんと公園にやってきました。どこへ探検に行こう？';
  }

  // ③ 午前後半（10:30以降）
  if (shouldUseParkBgm2()) {
    return 'お日さまが高くなってきました。おひるまで、のこりすこし。どこへ探検に行こう？';
  }

  // ② 午前前半で、入口へもどってきたとき
  return '公園入口にもどってきました。つぎはどこへ探検に行く？';
});

/* 秘密の場所へ行ける条件
   ・おでかけポイントが20以上
   ・見つけたものが3種類以上
   の両方を満たすと解放される
*/
const canEnterSecretSpot = computed(() => outingPoint.value >= 20 && collectedItems.value.length >= 3);

/* こもれびの広場（secretSpot）を、このプレイでもう見つけたかどうか

   false … まだ見つけていない
           公園入口の「細い道の先へ行く」を選ぶと、まずミニゲーム「秘密の小道」へ進む
   true  … 秘密の小道を最後まで進んで、広場を見つけた
           同じプレイのあいだは、ミニゲームをもう一度やらずに、そのまま広場へ入る

   ※ visitedPlaces（探検済み）とは別もの
     探検済みになるのは広場で遊んだときなので、
     「広場を見つけたけれど、何もせずに出た」ときは探検済みにならない
     それでもミニゲームをくり返さないように、見つけたことだけを別に覚えておく
   ※ false に戻すのは resetGame()（もう一度あそぶ／はじめの画面へ戻る）だけ
*/
const hasDiscoveredSecretSpot = ref(false);

/* ===== キーボード操作（「どうする？」コマンドボックス）用の計算 ===== */

/* ※ 画面ごとのキー操作の分けかたは handleKeydown() にまとめてある
     ・起動画面（A）・タイトル画面（B） … handleTitleKeydown()（A画面はボタン3つ、B画面は4つを選ぶ）
     ・あそびかた画面                    … handleHowToPlayKeydown()
       （Escape で戻る・←→ で上の2つを行き来。↑↓ はふつうのスクロールのまま）
     ・おやつ選択画面                    … handleSnackSelectionKeydown()
       （Tab と Enter / Space だけのふつうの操作。押しっぱなしを止めるだけ）
     ・ゲーム本編                        … そのまま handleKeydown() の続き
       （ゴール・GAME OVER画面も、ボタン2つを ↑↓ で選ぶ同じしくみで動く） */

/* いま「いやいやが続いている状態」かどうか
   ・いやいやタイムの画面にいる（currentEvent === 'tantrum'）
   ・まだ isTantrum が true（＝なだめられていない）

   対応が効かなかったとき（悪化した）や、少し落ち着いただけのときは、
   結果メッセージを出したままこの状態になるので、そのままもう一度コマンドを選べるようにする
   ※ GAME OVERになったときは currentEvent が 'gameOver' に変わるため、
     ここは自動的に false になり、GAME OVER画面のほうが優先される
*/
const isTantrumUnsolved = computed(() => currentEvent.value === 'tantrum' && isTantrum.value);

/* 公園にある「通常の場所」6か所

   この6か所だけが、その場所ならではの遊びを持っている場所
   （公園入口・いやいやタイム・とつぜんのできごと・ゴール・GAME OVER はふくまない）

   別枠の「ひとやすみ」を出すのは、ここに書いた6か所だけ
   あとから場所が増えたときも、この配列に1行足すだけでそろう
*/
const normalPlaceEvents: GameEvent[] = ['slide', 'sandbox', 'acornArea', 'pond', 'grassArea', 'secretSpot'];

/* いま「通常の場所」にいるかどうか

   includes() は「この配列の中にあるか？」を調べる書きかた
   true なら、その場所ならではの遊びがならんでいて、
   「休憩・おやつ」からサブメニューを開ける画面だという意味
*/
const isNormalPlace = computed(() => normalPlaceEvents.includes(currentEvent.value));

/* ===== 通常の場所のメインコマンドの番号 =====

   通常の場所6か所は、どこでも同じ4つにそろえてある

   0 その場所の行動①
   1 その場所の行動②
   2 休憩・おやつ          ← 押すとサブメニューが開く
   3 ← 場所選びにもどる    ← よく使うので、サブメニューには入れない
                              （この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る）

   ※ 2・3 という数字を直接書かず、名前を付けておく
     画面とキーボード操作の両方で同じ番号を使うので、
     名前にしておけば、あとから順番を変えてもずれない
*/
const careMenuCommandIndex = 2;
const leavePlaceCommandIndex = 3;

/* ===== サブメニュー「☕ ひとやすみ」 =====

   休憩とおやつは、その場所ならではの遊びではなく
   「どこでも同じ、親子の状態を整える行動」なので、
   メインコマンドの中にまぜず、別のメニューにまとめている

   ふだんは閉じていて、「休憩・おやつ」を選んだときだけ開く
*/

/* サブメニューが開いているかどうか（true = 開いている） */
const isCareMenuOpen = ref(false);

/* サブメニューの中で、いま選んでいるコマンドの番号
   0 = 休憩する、1 = おやつをあげる

   メインコマンドの selectedCommandIndex とは別に持っている
   （こうしておくと、サブメニューを閉じたときに
     メイン側の「休憩・おやつ」が選ばれたままになる）
*/
const selectedCareCommandIndex = ref(0);

/* サブメニューを実際に画面に出すかどうか

   次の3つがそろったときだけ出す
   ① 通常の場所6か所にいる
   ② 結果カードが出ていない（まだ行動を選んでいる最中）
   ③ サブメニューを開いている

   画面（v-if）・キーボード操作・Enterの実行 の3か所で同じこれを見るので、
   「画面に無いのにキーだけ効く」ということが起きない
*/
const isCareMenuVisible = computed(() => isNormalPlace.value && !resultMessage.value && isCareMenuOpen.value);

/* サブメニューに出ているコマンドの数
   おやつが残っていれば2つ（休憩・おやつ）、食べきっていれば1つ（休憩だけ）
   ↑↓キーで動ける範囲を決めるのに使う
*/
const careCommandCount = computed(() => (snackLeft.value > 0 ? 2 : 1));

/* サブメニューを開く

   開くときは、いつも一番上（0 = 休憩する）が選ばれた状態からはじめる

   メイン側の選択も「休憩・おやつ」にそろえておく
   こうしておくと、Escapeで閉じたときに
   そのまま「休憩・おやつ」が選ばれた状態に戻る
*/
function openCareMenu() {
  // 決定音「ポン♪」（メニューを開いたことが分かるように）
  playDecisionSound();

  isCareMenuOpen.value = true;
  selectedCareCommandIndex.value = 0;
  selectedCommandIndex.value = careMenuCommandIndex;
}

/* サブメニューを閉じる

   ※ selectedCommandIndex はさわらない
     メイン側の「休憩・おやつ」が選ばれたまま残るようにするため

   ※ おやつバッグ（closeSnackMenu()）もいっしょに閉じる
     ひとやすみを閉じたのに、その中から開いたバッグだけが残る、ということが起きない
     この関数は「行動をはじめたとき・場所を移動したとき・もう一度あそぶ」でも呼ばれるので、
     いやいやタイムで開いたバッグも、そのときにまとめて閉じられる
*/
function closeCareMenu() {
  isCareMenuOpen.value = false;
  selectedCareCommandIndex.value = 0;
  closeSnackMenu();
}

/* 「休憩・おやつ」を押したときの開け閉め
   開いていなければ開く、開いていればもう一度押して閉じる
*/
function toggleCareMenu() {
  if (isCareMenuOpen.value) {
    // 閉じるときは決定音を鳴らさない（開くときだけ鳴らす）
    closeCareMenu();
    return;
  }

  openCareMenu();
}

/* ===== 休憩・おやつのあとの「← もどる」 =====

   通常の場所の「進む／戻る」は、次の3種類に分けてある（文言が混ざらないようにする）

   ① 「次の場所を選ぶ」     … 場所ならではの遊びが終わったので、公園入口の「どこへ行く？」へ進む
   ② 「← 場所選びにもどる」 … まだ何もしていないが、この場所では遊ばずに「どこへ行く？」へ戻る
   ③ 「← もどる」           … いまいる場所や、1つ前のメニューへ戻る
                               （おやつバッグ → ☕ ひとやすみ、休憩・おやつの結果 → いまいる場所）

   休憩・おやつは、その場所で ひと息ついただけで、場所は離れていない
   なので結果カードには①ではなく③を出し、押したら同じ場所の「どうする？」へ戻す
*/

/* いま出ている結果カードが、休憩・おやつの結果かどうか
   finishCareAction() で true、次の行動をはじめたとき（startStatusChanges()）や場所を出たときに false */
const isCareActionResult = ref(false);

/* 休憩・おやつの結果カードに「← もどる」を出すかどうか

   ※ 12:00を過ぎたときだけは出さず、ほかの行動のあとと同じ「次の場所を選ぶ」にする
     休憩で12:00を過ぎたのに場所へ戻れてしまうと、「12:00までに帰る」というルールが崩れるため
     （「次の場所を選ぶ」を押すと、goToNextPlace() が今までどおりゴールへ向かう） */
const isCareResultBackVisible = computed(() => isNormalPlace.value && !!resultMessage.value && isCareActionResult.value && !isTimeOver.value);

/* 休憩・おやつの結果カードの「← もどる」

   結果カードを閉じて、いまいる場所の「どうする？」へ戻すだけ
   ・時間・ステータス・おやつは、休憩・おやつを選んだときに変わり終わっているので、ここでは何も変えない
   ・場所を離れていないので、BGMもさわらない（こもれびの広場なら、こもれびの広場BGMのまま）
   ・カーソルは「休憩・おやつ」に合わせる（おやつバッグの「← もどる」と同じく、選んでいた行へ戻る）
   ・決定音は鳴らさない（ほかの「← もどる」と同じ）
   ・マウスを動かすまで、コマンド枠をマウスで押せないようにする（isCommandPointerPaused を参照） */
function backToPlaceFromCareResult() {
  if (!isCareResultBackVisible.value) {
    return;
  }

  resultMessage.value = '';
  statusChanges.value = null;
  isCareActionResult.value = false;
  selectedCommandIndex.value = careMenuCommandIndex;
  pauseCommandPointer();
}

/* 「← もどる」（休憩・おやつの結果）のあとや、公園入口へ戻ってきた直後だけ、コマンド枠をマウスで押せなくしておくか

   「← もどる」は1つだけのボタンなので枠のいちばん下にあり、押すと枠が上へ4行ぶん伸びる
   するとマウスを動かしていなくても、カーソルの真下に「← 場所選びにもどる」が来てしまい、
   ・選んでいる行が「休憩・おやつ」から勝手に移る（ハイライトが跳ねて見える）
   ・すばやく2回押すと、2回目で場所を出てしまう
   ということが起きる

   そこで、マウスを動かす（またはどこかを押す）までは、枠へのマウス操作を止めておく
   （止めかたは CSS の .command-box--pointer-paused）
   キーボードで「← もどる」を選んだときも、枠の上にマウスが置いてあれば同じことが起きるので止める
   キーボード操作（↑↓・Enter / Space）そのものは、これとは関係なく使える

   ※ 指で操作しているとき（lastPointerType が 'touch'）は止めない
     カーソルが残らないので止める必要がなく、止めると次のタップが効かなくなってしまうため
     （CSS の (hover: hover) で分けないのは、マウスを付けていない環境などで
       マウス操作なのに hover: none と判定されることがあるため）

   ※ 公園入口へ戻ってきたとき（「次の場所を選ぶ」「← 場所選びにもどる」など）も、同じ考えかたで止める（restoreEntranceCursor() を参照）
     最後にいた場所のコマンドにカーソルを合わせても、止まったままのマウスの下に公園入口のボタンが出てくると、
     @mouseenter でカーソルがそのボタンへ上書きされてしまうため
     （公園入口の「どこへ行く？」の枠には .command--pointer-paused を付ける）
   ※ キーボードの ↑↓ で結果などをスクロールしたときと、矢印キーで選んだコマンドを見える位置へスクロールしたときも、同じ理由で止める
     （handleKeydown() の ⓪-3 と revealSelectedCommand() を参照）
     そのため、いやいやタイム・とつぜんのできごと・秘密の小道の「どうする？」と、ゴール／GAME OVER のボタンの枠にも付けている
   ※ 止めたあとは、マウスを動かしたとき（handleWindowPointer()）か、goToPlace() / goToNextPlace() で次の画面へ移るときに戻す */
const isCommandPointerPaused = ref(false);

/* いちばん最後に使われたポインターの種類（'mouse' / 'touch' / 'pen'）
   まだ一度もマウスや指を使っていない（キーボードだけで遊んでいる）ときは ''
   画面には出さないので、ref にはしていない */
let lastPointerType = '';

/* コマンドへのマウス操作を、マウスを動かすまで止める（isCommandPointerPaused を参照）
   指で操作しているときは止めない（カーソルが残らず、止めると次のタップが効かなくなるため） */
function pauseCommandPointer() {
  isCommandPointerPaused.value = lastPointerType !== 'touch';
}

/* window の pointermove / pointerdown を受け取る

   ① いま使っているポインターの種類を覚える（lastPointerType）
   ② コマンド枠へのマウス操作を止めているなら、マウスを動かした・どこかを押したときに戻す

   ※ movementX / movementY が両方 0 の pointermove は、動いたと数えない
     枠の大きさが変わったときに、ブラウザが「カーソルの下が変わった」ことを知らせる
     見かけだけの移動で、止めた意味がなくなってしまうため
   ※ 押したとき（pointerdown）は、動いていなくても戻す
     その1回の押しは、止めている枠には届かないので、場所を出てしまうことはない */
function handleWindowPointer(event: PointerEvent) {
  lastPointerType = event.pointerType;

  if (!isCommandPointerPaused.value) {
    return;
  }

  if (event.type === 'pointermove' && event.movementX === 0 && event.movementY === 0) {
    return;
  }

  isCommandPointerPaused.value = false;
}

/* ===== おやつバッグ（ゲーム中に、どのおやつを食べるか選ぶメニュー） =====

   isSnackSelectionOpen（ゲーム開始前に、持っていくおやつを選ぶ画面）とは別もの
   こちらは公園の中で「バッグに残っているおやつから1つ選んで食べる」ためのメニュー

   おやつを食べる場面は2つあり、どちらも同じバッグ（selectedSnackIds）から選ぶ

     exploring … 通常の場所の「☕ ひとやすみ」→「おやつをあげる ＞」
     tantrum   … いやいやタイムの「おやつをあげる ＞」

   ※ とつぜんのできごと「こうちゃんがころんだ」では、おやつは使わない（バッグも開かない）

   並べるおやつも、↑↓・Enter・Escape の動きも2つとも同じ
   ちがうのは「選んだあとに呼ぶ関数（＝おやつの効果）」だけなので、
   どこから開いたかを snackUseContext に覚えておき、eatSnackFromBag() で呼び分ける
*/

/* どの場面からおやつバッグを開いたか */
type SnackUseContext = 'exploring' | 'tantrum';

/* いまおやつバッグを開いている場面

   null なら「バッグは閉じている」
   開いているかどうかを別の true / false では持たず、これ1つで表す
   （「開いているのに、どの場面か分からない」という食いちがいが起きない） */
const snackUseContext = ref<SnackUseContext | null>(null);

/* おやつバッグの中で、いま選んでいる行の番号（キーボード操作用）

   0 〜 おやつの数-1 … バッグの中のおやつ（selectedSnacks の順）
   おやつの数        … いちばん下の「← もどる」

   selectedCommandIndex（メインコマンド）・selectedCareCommandIndex（ひとやすみ）とは別に持つ
   こうしておくと、もどったときに「おやつをあげる」が選ばれたまま残る */
const selectedSnackMenuIndex = ref(0);

/* 「← もどる」が何番目か（＝バッグに残っているおやつの数） */
const snackMenuBackIndex = computed(() => selectedSnacks.value.length);

/* おやつバッグを実際に画面に出しているかどうか

   isCareMenuVisible と同じ考えかたで、画面（v-if）・キーボード操作・Enterの実行 の
   3か所がこれを見るので、「画面に無いのにキーだけ効く」ということが起きない

   開いた場面のコマンドが、いま画面に出ているときだけ true にする
   ・exploring … ☕ ひとやすみ が出ているとき（バッグは その枠の中に出る）
   ・tantrum   … いやいやが続いているとき（「少し待ってみる」に失敗した直後もふくむ） */
const isSnackMenuVisible = computed(() => {
  if (snackUseContext.value === 'exploring') {
    return isCareMenuVisible.value;
  }

  if (snackUseContext.value === 'tantrum') {
    return isTantrumUnsolved.value;
  }

  return false;
});

/* おやつバッグを開く

   開いたときは、いつもバッグの最初のおやつが選ばれた状態からはじめる
   バッグが空のときは開かない（コマンドも画面に出ていないが、念のため） */
function openSnackMenu(context: SnackUseContext) {
  if (snackLeft.value <= 0) {
    return;
  }

  // 決定音「ポン♪」（ひとやすみを開くときと同じ）
  playDecisionSound();

  snackUseContext.value = context;
  selectedSnackMenuIndex.value = 0;
}

/* おやつバッグを閉じる（「← もどる」・Escape・行動をはじめたとき）

   バッグの中身（selectedSnackIds）はさわらない
   閉じると、開く前のメニューがそのまま出てくる
   ・exploring … ☕ ひとやすみ（「おやつをあげる」が選ばれたまま）
   ・tantrum   … お話／だっこ／おやつ／待つ（「おやつをあげる」が選ばれたまま） */
function closeSnackMenu() {
  snackUseContext.value = null;
  selectedSnackMenuIndex.value = 0;
}

/* バッグの中のおやつを選んだとき（クリック・タップ・Enter / Space の共通の入口）

   開いた場面に合わせて、効果のちがう関数へ振り分けるだけ
   おやつの種類ごとの関数（グミ用・せんべい用…）は作らず、
   どの関数も snackId を受け取って、snacks のデータから効果を読む */
function eatSnackFromBag(snackId: SnackId) {
  // 画面に出ていないバッグから食べることはない（念のため）
  if (!isSnackMenuVisible.value) {
    return;
  }

  if (snackUseContext.value === 'exploring') {
    giveSnackWhileExploring(snackId);
    return;
  }

  if (snackUseContext.value === 'tantrum') {
    giveSnack(snackId);
  }
}

/* いま画面に出ているコマンドの数
   ↑↓・← →キーで動ける範囲（0 〜 commandCount - 1）を決めるために使う
*/
const commandCount = computed(() => {
  /* ゴール・GAME OVER画面は2つ
     0 もう一度あそぶ
     1 ← はじめの画面へ戻る

     ※ いちばん先に見るのが大事
       下の「結果表示中は1つ」にも当てはまってしまうことがあるため */
  if (currentEvent.value === 'goal' || currentEvent.value === 'gameOver') {
    return 2;
  }

  // 公園入口は「行き先6か所 ＋ ゴール」で7つ
  // 秘密の場所がまだ見つかっていないときは、その行が画面に無いので6つ
  if (currentEvent.value === 'parkEntrance') {
    return canEnterSecretSpot.value ? 7 : 6;
  }

  // いやいやが続いているあいだは、おやつが残っていれば4つ、食べきっていれば3つ
  //   おやつあり  0 お話する／1 だっこ／2 おやつ ＞／3 少し待ってみる
  //   おやつなし  0 お話する／1 だっこ／2 少し待ってみる
  // 待つ・お話・おやつが効かずに結果メッセージが出ているときも、
  // いやいやはまだ終わっていないので、この4つ（3つ）から選び直す
  // ※ 下の「結果表示中は1つ」より先に判定するのがポイント
  if (isTantrumUnsolved.value) {
    return snackLeft.value > 0 ? 4 : 3;
  }

  // 結果表示中は1つだけ
  // （ふつうは「次の場所を選ぶ」、休憩・おやつの結果なら「← もどる」）
  if (resultMessage.value) {
    return 1;
  }

  /* 通常の場所6か所は、どこでも同じ4つ

     0 その場所の行動①
     1 その場所の行動②
     2 休憩・おやつ
     3 ← 場所選びにもどる

     ※ サブメニューが開いているあいだのコマンド数は、ここでは数えない
       サブメニュー側は careCommandCount で別に管理している

     ※ すぐ上の「結果表示中は1つ」より後ろに置くのが大事
       結果カードを読んでいるあいだは、メインコマンドも
       「次の場所を選ぶ」（休憩・おやつの結果なら「← もどる」）1つだけになるため
  */
  if (isNormalPlace.value) {
    return 4;
  }

  // 秘密の小道
  //   はじまる前  0 小道へ進む／1 ← 場所選びにもどる
  //   終わったあと 0 先へ進む
  // （遊んでいる最中は ← → を handleSecretPathKeydown() が受け取るので、ここの数は使わない）
  if (currentEvent.value === 'secretPath') {
    return secretPathPhase.value === 'ready' ? 2 : 1;
  }

  // とつぜんのできごと「こうちゃんがころんだ」だけは、選択肢が4つ
  // （おやつは使わないので、おやつの残りに関係なく いつも4つ）
  if (currentEvent.value === 'fallDown') {
    return 4;
  }

  // ここに来るのはとつぜんのできごと（救急車・テントウムシ・犬・噴水）だけ
  // どれも選択肢が3つなので3を返す
  // ※ 通常の場所は、1つ上の isNormalPlace の分岐で返している
  return 3;
});

/* とつぜんのできごと5つ（commandCount のいちばん最後の分岐と、fallDown の分岐に来るなかま） */
const suddenEvents: GameEvent[] = ['emergencySiren', 'ladybug', 'dog', 'fallDown', 'fountain'];

/* 「どうする？」の選択肢を横にならべる画面か（テンプレートの choiceGridClass で使う）

   ・いやいやタイムで、いやいやが続いているあいだ（結果が出ていても、次の対応を選ぶので横ならび）
   ・とつぜんのできごとで、まだ選んでいないとき
   ・秘密の小道の、はじまる前（小道へ進む／← 場所選びにもどる）

   どれも「文章を ↑↓ でスクロールして読みながら、← → で選ぶ」ことがある画面なので、
   見た目も左右にならべて、キーの向きとそろえる
   ボタンが1つだけの画面（結果を読んだあとの「次へ」など）は、今までどおりの形のまま

   ※ おやつバッグを開いているあいだは横にしない
     バッグは今までどおり、たて1列で ↑↓ で選ぶ */
const isChoiceGridVisible = computed(() => {
  if (isSnackMenuVisible.value) {
    return false;
  }

  if (isTantrumUnsolved.value) {
    return true;
  }

  if (currentEvent.value === 'secretPath') {
    return secretPathPhase.value === 'ready';
  }

  return suddenEvents.includes(currentEvent.value) && !resultMessage.value;
});

/* 横ならびにするときに command-box へ付けるクラス
   command-box--choices-〇 … 選択肢の数。列の数を決めるのに使う（CSSの .command-box--choice-grid を参照） */
const choiceGridClass = computed(() => (isChoiceGridVisible.value ? ['command-box--choice-grid', `command-box--choices-${commandCount.value}`] : null));

/* いやいやタイムの4つ（3つ）のコマンドが、それぞれ何番目になるか

   おやつあり  0 お話する／1 だっこ／2 おやつ ＞／3 少し待ってみる
   おやつなし  0 お話する／1 だっこ／2 少し待ってみる

   いやいやタイムが始まったときは、いちばん上の「お話する」が選ばれた状態になる

   おやつが0個で「おやつをあげる」が画面から消えているときは、
   その下の「少し待ってみる」だけが1つくり上がる
   （0〜3 と直接書かずにここを見れば、画面とキーボード操作の番号がずれない）
*/
const talkCommandIndex = 0;
const hugCommandIndex = 1;
const snackCommandIndex = 2;
const waitCommandIndex = computed(() => (snackLeft.value > 0 ? 3 : 2));

/* いやいやタイムの「待つ」コマンドに出す文字
   1回目は「少し待ってみる」
   なにか対応をしたのに、まだいやいやが続いているときは「もう少し待ってみる」

   いやいやが続いたまま結果メッセージが出ている
   ＝ 待つ・お話・おやつ のどれかを試したが、まだおさまっていない直後、
   という意味なので、新しい ref を増やさなくても区別できる
*/
const waitCommandLabel = computed(() => (isTantrumUnsolved.value && resultMessage.value ? 'もう少し待ってみる' : '少し待ってみる'));

/* 結果カードの下に出す「次へ進む」コマンドの文字
   いやいやが起きているときは、次の場所ではなく
   まず こうちゃん をなだめる場面へ進むので、文言だけ変える
   とつぜんのできごとの予定があるときも、この先で何か起きることが伝わる文言にする
   （押したときに呼ぶ goToNextPlace() は、どの場合も今までと同じ）
*/
const nextPlaceCommandLabel = computed(() => {
  // いやいやが最優先（goToNextPlace() の分けかたと同じ順番にそろえてある）
  if (isTantrum.value) {
    return 'こうちゃんのところへ行く';
  }

  // とつぜんのできごとの予定があるとき
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

/* 公園入口の「どこへ行く？」で、それぞれの場所へ入るコマンドが何番目か

   画面（template の parkEntrance）と runSelectedCommand() の parkEntrance の並びと同じ
     0 すべり台／1 砂場／2 どんぐりの木／3 池／4 芝生広場／5 細い道の先へ行く
   ※ こもれびの広場（secretSpot）と秘密の小道（secretPath）は、
     どちらも「細い道の先へ行く」から入るので、同じ5番にしている
   ※ 並びを変えるときは、template・runSelectedCommand()・ここ の3か所をそろえること
*/
const placeSelectionIndexes: Partial<Record<GameEvent, number>> = {
  slide: 0,
  sandbox: 1,
  acornArea: 2,
  pond: 3,
  grassArea: 4,
  secretPath: 5,
  secretSpot: 5,
};

/* 公園入口へ戻ってきたとき、どのコマンドにカーソルを合わせるか（restoreEntranceCursor() で使う）

   その場所へ入るためのコマンドの番号を返す
   公園入口にその行が出ていないとき（場所選びから入る場所ではない・「細い道の先へ行く」が出ていない）は null
   → 呼ぶ側は何もせず、今までどおり先頭（0）のままにする

   ※ 「細い道の先へ行く」は canEnterSecretSpot のときだけ画面に出る
     おでかけポイントもアイテムも減らないので、広場や小道にいるあいだに消えることは無いはずだが、
     出ていないときに5番を返すと、1つくり上がったゴールを選んでしまうので、念のため確かめる */
function getPlaceSelectionIndex(place: GameEvent): number | null {
  const index = placeSelectionIndexes[place];

  if (index === undefined) {
    return null;
  }

  if ((place === 'secretSpot' || place === 'secretPath') && !canEnterSecretSpot.value) {
    return null;
  }

  return index;
}

/* このプレイで、公園入口から最後に入った場所（公園入口へ戻ったときのカーソル位置に使う）

   goToPlace() で、公園入口に行がある場所（placeSelectionIndexes にある場所）へ入るときに書きかえる
   ・とつぜんのできごと・いやいやタイムは goToPlace() を通らない（goToNextPlace() が直接切りかえる）ので、
     途中に入っても上書きされず、そのあと公園入口へ戻ったときに「遊んでいた場所」を選べる
   ・秘密の小道 → こもれびの広場 と進むと secretSpot になるが、どちらも「細い道の先へ行く」なので同じ
   null … このプレイでまだ場所を選んでいない（ゲーム開始直後）。startGame() / resetGame() で null に戻す */
const lastSelectedPlace = ref<GameEvent | null>(null);

/* 公園入口へ戻ってきたときに、最後にいた場所のコマンドへカーソルを合わせる

   呼ぶところ
   ・goToNextPlace() で公園入口へ着いたとき
     （遊んだあとの「次の場所を選ぶ」・何もせず「← 場所選びにもどる」・とつぜんのできごとやいやいやのあと）
   ・leaveSecretPathToEntrance()（秘密の小道の「← 場所選びにもどる」）

   ・まだ場所を選んでいない／その行が画面に出ていないときは何もしない（呼ぶ前に 0 にしてあるので先頭のまま）
   ・マウスで押して戻ってきたときは、止まったままのマウスの下に公園入口のボタンが出てきて、
     @mouseenter でカーソルが上書きされてしまうので、マウスを動かすまで止めておく（pauseCommandPointer()） */
function restoreEntranceCursor() {
  const index = lastSelectedPlace.value === null ? null : getPlaceSelectionIndex(lastSelectedPlace.value);

  if (index === null) {
    return;
  }

  selectedCommandIndex.value = index;
  pauseCommandPointer();
}

/* ===== 「公園の出口へ向かう？」の確認ダイアログ =====

   公園の出口へ向かうと、その日のおでかけはおしまい（結果発表へ進み、公園へは戻れない）
   ボタンを押しまちがえたり、キーを押しすぎたりして、うっかり終わってしまわないように、
   公園入口の「公園の出口へ向かう（ゴール）」を選んだときは、いったん確認をはさむ

   ※ 12:00を過ぎて自動でゴールへ向かうとき（goToNextPlace() → goToGoal()）は確認しない
     時間切れは、プレイヤーが選んだことではないため
*/

/* 確認ダイアログを開いているかどうか */
const isGoalConfirmOpen = ref(false);

/* ダイアログの中で、いま選んでいるボタン
   0 … もう少し遊ぶ（開いたときは、いつもこちら）
   1 … 出口へ向かう */
const selectedGoalConfirmIndex = ref(0);

/* ダイアログを実際に画面に出すかどうか

   開いている印に加えて「ゲーム中で、公園入口にいる」ことも見る
   画面（v-if）・キーボード操作・「出口へ向かう」の実行 の3か所で同じこれを見るので、
   「画面に無いのにキーだけ効く」ということが起きない（isCareMenuVisible と同じ考えかた） */
const isGoalConfirmVisible = computed(() => isGoalConfirmOpen.value && gameStarted.value && currentEvent.value === 'parkEntrance');

/* ダイアログに出す「お昼まで、あとどれくらいか」の文

   まだ遊ぶ時間が残っているかを見て決められるように、残り時間を出しておく
   例）10:40 なら「お昼（12:00）まで、あと1時間20分あります。」 */
const goalConfirmTimeText = computed(() => {
  const minutesLeft = 12 * 60 - currentMinutes.value;

  // ふつうは、12:00を過ぎると自動でゴールへ向かうので、ここへは来ない（念のため）
  if (minutesLeft <= 0) {
    return 'もうお昼の時間です。';
  }

  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;

  let timeLeft = `${minutes}分`;

  if (hours > 0) {
    timeLeft = minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
  }

  return `お昼（12:00）まで、あと${timeLeft}あります。`;
});

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

/* 公園にある場所の数（すべり台・砂場・どんぐり・池・芝生広場・秘密の場所）
   結果の文章で「ぜんぶ回れたか」を見るのに使う */
const totalPlaceCount = 6;

/* 遊んだ回数：これ以上あそんでいたら「たくさん遊んだ」とみなす
   結果の文章を「たくさん遊んだ」と「あまり遊べなかった」で
   書きわけるときの境目に使う
   （1つの場所だけでも、3回あそべば十分たっぷり遊んでいる）
*/
const playedALotLine = 3;

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
    warnings.push('⚠ こうちゃんはかなり疲れています');
  }

  return warnings;
});

/* ============================================================
   効果音（Web Audio API）

   音声ファイル（MP3・WAV）は使わず、ブラウザに最初から入っている
   Web Audio API で、その場で音そのものを作って鳴らす

   使う部品は3つだけ
   ・AudioContext    … 音を作るための「作業台」。これが無いと何も作れない
   ・OscillatorNode  … 音の発生源。「1秒間に何回ふるえるか」を決めると、その高さの音が出る
   ・GainNode        … 音量つまみ。時間に沿って音量を変えられる

   つなぎ方は
   Oscillator（音を出す）→ Gain（音量を調整）→ destination（スピーカー）
   ============================================================ */

/* ゲームの音を鳴らすかどうか（プレイヤーの設定）
   効果音（ポン♪など）と公園BGMの両方をまとめて切り替える
   true  … サウンドON（はじめてのときはこちら）
   false … サウンドOFF

   ※ 体力や機嫌とちがって「ゲームのステータス」ではなく「設定」なので、
     resetGame（もう一度あそぶ）では初期値に戻さない
*/
const soundEnabled = ref(true);

/* サウンドの設定を保存しておく名前（localStorageのキー）
   同じブラウザの他のページと名前がぶつからないよう、ゲーム名を頭に付けている
*/
const soundStorageKey = 'kouchan-game-sound-enabled';

/* 音ぜんぶの大きさ（0〜100の整数。100＝そのままの大きさ）

   ■ 何にかかるか
     BGMにも、決定音などの効果音にも、まとめて同じ割合でかかる
     （曲ごと・効果音ごとの数字は「録音の大きさをそろえる」ためのものなので、そのまま残す）
     実際に鳴らす大きさは、その数字とこれをかけ算して決める（→ getSoundVolume()）

   ■ 0% ＝ ミュート
     0%にすると音が何も出なくなるので、スピーカーのミュートと同じ状態になる
     見た目と中身が食いちがわないように、この2つはいつもセットで動かしている
     ・スライダーを0%にした     … soundEnabled も false にする（アイコンが 🔊× になる）
     ・スライダーを0%から上げた … soundEnabled も true に戻す（音が戻る）
     ・ミュートボタンを押した   … スライダーも 0% ⇄ もとの大きさ に動く
     （切りかえているのは changeSoundVolume() と toggleSound() の2か所だけ）

   ※ サウンドON/OFFと同じ「設定」なので、resetGame（もう一度あそぶ）では戻さない
*/
const soundVolumePercent = ref(100);

/* ミュートする直前の大きさ（ミュートを解除したときに、ここへ戻す）

   ミュートすると音量は0%になるので、そのままだと
   解除したときに「前はどれくらいだったか」が分からなくなってしまう
   0%のときは戻り先にならないので、100%を初期値にしてある
*/
let volumeBeforeMute = 100;

/* 音量を保存しておく名前（localStorageのキー）
   サウンドON/OFF（kouchan-game-sound-enabled）とは別のメモにしてある
   ※ キーの文字は、前に決めたときのまま（-bgm- ）にしてある
     いま使っている人の設定が、名前を変えたせいで消えてしまわないようにするため */
const soundVolumeStorageKey = 'kouchan-game-bgm-volume';

/* もとの大きさに、音量スライダーのぶんをかけた「実際に鳴らす大きさ」を返す

   BGMからも効果音からも、同じこの関数を通す
   例：公園BGM（0.16）で、音量が50%なら → 0.16 × 0.5 ＝ 0.08
   例：決定音（0.06）で、音量が50%なら → 0.06 × 0.5 ＝ 0.03

   volume に入れられるのは 0〜1 の数字だけなので、
   はみ出さないように、下（0）と上（1）でおさえている
*/
function getSoundVolume(baseVolume: number) {
  return Math.min(1, Math.max(0, baseVolume * (soundVolumePercent.value / 100)));
}

/* ミュートボタンを押したとき（サウンドのON/OFFを切り替える）

   0% ＝ ミュートなので、スライダーの位置もいっしょに動かす
   ・ミュートする   … いまの大きさを覚えてから、0%へ
   ・ミュートを解除 … 覚えておいた大きさへ戻す（覚えが0%なら100%）
*/
function toggleSound() {
  // ① まず切り替える（true なら false へ、false なら true へ）
  soundEnabled.value = !soundEnabled.value;

  // ② スライダーの位置も、いまの状態に合わせる
  if (soundEnabled.value) {
    soundVolumePercent.value = volumeBeforeMute > 0 ? volumeBeforeMute : 100;
  } else {
    if (soundVolumePercent.value > 0) {
      volumeBeforeMute = soundVolumePercent.value;
    }

    soundVolumePercent.value = 0;
  }

  // ③ 新しい大きさを、いま鳴っているBGMへ反映して、保存しておく
  applySoundVolume();
  saveSoundVolume();

  // ④ BGMを止める・鳴らしなおす（と、ON/OFFの保存）
  applySoundEnabledChange();
}

/* サウンドのON/OFFが変わったあとの、あと始末

   ミュートボタン（toggleSound）からも、
   スライダーを0%にした・0%から上げたとき（changeSoundVolume）からも呼ばれる

   ここでやること
   ① BGMを止める／鳴らしなおす
       効果音は getAudioContext() が soundEnabled を見てくれるので何もしなくてよいが、
       BGMは「いま鳴っている曲」なので、その場で止める・再開する必要がある

       ONに戻したときは、いまの画面に合う曲「1曲だけ」を再開する
       ・起動画面                  … どれも鳴らさない（まだ何も始まっていない）
       ・タイトル画面              … タイトルBGM
       ・いやいやタイム            … いやいやBGM
       ・いやいや発生の結果を読んでいる最中 … どれも鳴らさない（わざと無音にしている画面）
       ・秘密の場所                … こもれびの広場BGM
       ・公園を探検している最中     … 公園BGM（10:30より前ならBGM1、10:30以降ならBGM2）
       ・ゴール（通常のおしまい）   … リザルトBGM
       ・GAME OVER                 … GAME OVER BGM（ゴールのリザルトBGMとは別の曲）

       止めたところからの続きなので、play〜ではなく resume〜 を使う

       ※ タイトルBGMの条件に titleEntered が要る
         「!gameStarted」だけだと起動画面も当てはまってしまい、
         起動画面でONに戻しただけで曲が鳴りだしてしまう

       ※ ゴールを、いやいや関連より先に置くのが大事
         いやいや対応の途中でお昼になってゴールすると、
         結果画面なのに isTantrum が true のまま残っていることがある
         あとに置くと、そこに当てはまってリザルトBGMが鳴らなくなってしまう

       ※ GAME OVERも、同じ理由で いやいや関連より先に置く
         いやいやタイム中に「少し待ってみる」などで親の余裕が0になると、
         isTantrum が true のままGAME OVER画面になる
         あとに置くと「いやいや発生の結果を読んでいる最中」に当てはまり、
         GAME OVER BGMが鳴らなくなってしまう

       ※ いやいや関連の2つを、公園BGMより先に置くのが大事
         あとにすると「公園を探検している最中」にも当てはまってしまい、
         いやいや画面なのに公園BGMが鳴りだしてしまう

       ※ 「いやいや発生の結果を読んでいる最中」は
         currentEvent がまだ場所（すべり台など）のままで、
         isTantrum だけが true になっている状態
         ここでONに戻しても、わざと作った無音をこわさないように何も鳴らさない

       ※ 秘密の場所を、公園BGMより先に置くのが大事
         秘密の場所も「ゲーム中で、結果画面ではない」に当てはまってしまうので、
         あとに置くと、秘密の場所なのに公園BGMが鳴りだしてしまう
         （そのうえ、あとからこもれびの広場BGMも鳴ると2曲が重なってしまう）

       ※ 秘密の場所から出たあとにONへ戻したときは、
         currentEvent がもう 'secretSpot' ではないので公園BGMのほうへ進む
         こもれびの広場BGMが勝手に鳴りなおすことはない

       ※ サウンドOFFのまま秘密の場所へ入って、そこでONに戻したときは、
         まだ曲を一度も作っていないので、resumeSecretBgm() の中で
         新しく作って先頭から鳴りはじめる（公園BGMは鳴らない）

   ② 次に開いたときのために、ON/OFFを保存する
       localStorage は、ブラウザに小さなメモを残しておける保存場所
       ページを閉じても消えないので、次に開いたときも設定を思い出せる
*/
function applySoundEnabledChange() {
  if (soundEnabled.value) {
    if (titleEntered.value && !gameStarted.value) {
      resumeTitleBgm();
    } else if (gameStarted.value && currentEvent.value === 'goal') {
      resumeResultBgm();
    } else if (gameStarted.value && currentEvent.value === 'gameOver') {
      resumeGameOverBgm();
    } else if (gameStarted.value && currentEvent.value === 'tantrum') {
      resumeTantrumBgm();
    } else if (gameStarted.value && isTantrum.value) {
      // いやいや発生の結果カードを読んでいる最中（わざと無音）なので、何も鳴らさない
    } else if (gameStarted.value && currentEvent.value === 'secretSpot') {
      resumeSecretBgm();
    } else if (gameStarted.value && !isResultScene.value) {
      // 秘密の小道（ミニゲーム）もここ。こもれびの広場へ着くまでは公園BGMのまま
      resumeParkBgm();
    }
  } else {
    // OFFのときは pause() だけ（どこまで再生したかを覚えておく）
    // どの画面でも止まるように、ぜんぶの曲に声をかける
    // （pauseParkBgm() は、公園BGM1・BGM2の両方をまとめて止めてくれる）
    pauseTitleBgm();
    pauseParkBgm();
    pauseSecretBgm();
    pauseTantrumBgm();
    pauseResultBgm();
    pauseGameOverBgm();
  }

  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(soundStorageKey, String(soundEnabled.value));
  } catch {
    // ブラウザの設定で保存できないことがある
    // 保存できなくても、このページを開いているあいだのON/OFFは正常に動く
  }
}

/* 作業台（AudioContext）を入れておく箱

   null は「まだ作っていない」という意味
   AudioContext は作るのが重たいので、1個だけ作って、ずっと使い回す
   ※ ここで new AudioContext() をしないのが大事
     Nuxtはサーバー側でも一度このコードを読むが、
     サーバーには window も AudioContext も無いのでエラーになってしまう
*/
let audioContext: AudioContext | null = null;

/* 作業台を用意して返す（初めて音を鳴らすときだけ作る）

   音が出せないときは null を返すので、
   呼んだ側は「null なら何もしない」だけで済む
*/
function getAudioContext() {
  /* ここが効果音ON/OFFの「関所」

     4種類の音（decision・item・tantrum・goal）は、どれも必ずこの関数を通る
     なので、ここで null を返すだけで、すべての効果音がまとめて止まる
     ゲーム処理のあちこちに if (soundEnabled.value) を書く必要はない

     効果音OFFのときは AudioContext も作らない
     （下の new AudioContext() の行まで、そもそもたどり着かない）
  */
  if (!import.meta.client || !soundEnabled.value) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    /* ブラウザは「ユーザーが操作する前」に音を鳴らすのを止めることがあり、
       そのとき作業台は suspended（お休み中）になっている
       resume() で起こすが、await はしない
       ここでゲームを待たせると、画面の切り替わりが音のせいで遅れてしまう */
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  } catch {
    // 音が使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* 音を1つだけ鳴らす、共通の関数

   frequency … 音の高さ（Hz）。数が大きいほど高い音。440ならピアノの「ラ」
   startTime … いつ鳴らしはじめるか（AudioContextの中の時計の時刻）
   duration  … 音の長さ（秒）
   volume    … 音の大きさ（0〜1）。今回はどれも0.1以下の控えめな値にしている
                （ここへ渡すのは効果音ごとの「もとの大きさ」で、
                  音量スライダーのぶんは、この関数の中でかけ算する）
   type      … 波の形。sine と triangle はどちらも丸くてやさしい音になる
   endFrequency … 指定すると、その高さまで音程がなめらかに変化する（省略可）

   ※ OscillatorNode は「1回鳴らしたら使い捨て」という決まりなので、
     鳴らすたびに新しく作る（作業台だけは使い回す）
*/
function playTone(frequency: number, startTime: number, duration: number, volume: number, type: OscillatorType = 'sine', endFrequency?: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  try {
    const oscillator = context.createOscillator(); // 音の発生源
    const gain = context.createGain(); // 音量つまみ

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // 音程を変化させる指定があるときだけ、なめらかに動かす
    if (endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    }

    /* 効果音の大きさにも、音量スライダーのぶんをかける

       BGMとまったく同じ割合をかけるので、スライダーを下げると
       BGMも効果音も、同じだけ小さくなる
       （効果音ごとの「もとの大きさ」のちがいは、かけ算なのでそのまま残る） */
    const effectVolume = getSoundVolume(volume);

    /* 0（＝ミュート）のときは鳴らさずに終わり

       ふだんは getAudioContext() が soundEnabled を見て止めてくれるが、
       下の exponentialRampToValueAtTime() は 0 を受け取れないので、
       ここでも念のため確かめている */
    if (effectVolume <= 0) {
      return;
    }

    /* 音量の動き（これが無いと、鳴りはじめと鳴り終わりに「ブツッ」と雑音が入る）
       ① ほぼ無音からはじめる
       ② 0.015秒かけて、すっと目的の音量まで上げる
       ③ そのあと、鳴り終わりに向かってゆっくり下げる

       ※ ①と③で 0 を使えないのは、exponentialRampToValueAtTime() が
         0 へ向かう計算をできないため（代わりに「ほぼ0」を使う）
       ※ ①と③の「ほぼ0」を effectVolume からの割合で出しているのが大事
         決まった数字（0.001 など）にすると、音量を下げたときに
         その数字のほうが大きくなってしまい、鳴り終わりで音が上がってしまう
    */
    const nearSilent = effectVolume * 0.02;

    gain.gain.setValueAtTime(nearSilent, startTime);
    gain.gain.exponentialRampToValueAtTime(effectVolume, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(nearSilent, startTime + duration);

    // 発生源 → 音量つまみ → スピーカー の順につなぐ
    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  } catch {
    // 音が鳴らなくても、ゲームは止めない
  }
}

/* ① コマンド決定音「ポン♪」
   700Hzの丸い音を0.09秒だけ。鋭くならないよう triangle にしている
*/
function playDecisionSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  playTone(700, context.currentTime, 0.09, 0.06, 'triangle');
}

/* ② アイテム発見音「キラリン♪」
   ラ → ミ → 高いソ と、明るい音を3つ short に重ねて上っていく

   ※ 決定音と同時に鳴ると聞き取りにくいので、0.06秒だけ後ろにずらす
     ゲーム処理は待たせず、鳴らす時刻だけをずらしているのがポイント
*/
function playItemSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime + 0.06;

  playTone(880, start, 0.12, 0.05, 'sine');
  playTone(1174.7, start + 0.07, 0.12, 0.05, 'sine');
  playTone(1568, start + 0.14, 0.16, 0.05, 'sine');
}

/* ③ いやいや発生音「ポヨヨン……」
   320Hzから170Hzへ、音程をするすると下げてしょんぼり感を出す
   怖い警告音にならないよう、やわらかい triangle を使う

   ※ 決定音・アイテム音のあとに聞こえるよう、0.12秒ずらす
*/
function playTantrumSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  playTone(320, context.currentTime + 0.12, 0.28, 0.07, 'triangle', 170);
}

/* ④ ゴール音「タタターン♪」
   ド → ミ → ソ → 高いド と上がっていく、短い明るいファンファーレ
   最後の「高いド」だけ長めに伸ばして、締めくくりらしくする
*/
function playGoalSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime;

  playTone(523.25, start, 0.14, 0.08, 'triangle'); // ド
  playTone(659.25, start + 0.12, 0.14, 0.08, 'triangle'); // ミ
  playTone(783.99, start + 0.24, 0.14, 0.08, 'triangle'); // ソ
  playTone(1046.5, start + 0.38, 0.42, 0.09, 'triangle'); // 高いド
}

/* ⑤ 木漏れ日を取った音「ピコッ♪」（ミニゲーム「秘密の小道」用）

   アイテム発見音「キラリン♪」を小さくしたような、高い音を2つだけ
   15秒のあいだに何度も鳴るので、キラリン♪より短く・小さくしてある
*/
function playSunlightSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime;

  playTone(1318.5, start, 0.08, 0.04, 'sine'); // 高いミ
  playTone(1760, start + 0.06, 0.12, 0.04, 'sine'); // 高いラ
}

/* ⑥ 枝に当たった音「ぽこっ」（ミニゲーム「秘密の小道」用）

   いやいや発生音と同じ「音程が下がる」形だが、ずっと短くして
   「ちょっとぶつかっただけ」に聞こえるようにしている
*/
function playBranchBumpSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  playTone(300, context.currentTime, 0.12, 0.05, 'triangle', 190);
}

/* ============================================================
   公園のBGM（HTML Audio）

   効果音とBGMで、仕組みをわざと分けている
   ・効果音 … 「ポン♪」のような短い音。決まった形の波を計算して作れるので
              Web Audio API で その場で作る（音声ファイルは不要）
   ・BGM   … 何十秒もある曲。計算では作れないので、
              録音済みの park-bgm.mp3 を再生する

   曲を再生するだけなら、音声ファイルを鳴らす専用の部品
   HTMLAudioElement（new Audio）を使うのがいちばん簡単
   ============================================================ */

/* BGMの音量（0＝無音、1＝そのままの大きさ）

   volume は「もとの音源を何倍にするか」なので、
   同じ数字にしても、録音そのものが大きい曲は大きく聞こえてしまう
   公園BGMがタイトルBGMより大きく聞こえたので、
   耳で聞いてそろうように、曲ごとに数字を分けている
   （音を差しかえたときは、下に並んでいる曲ごとの数字で調整する）

   ※ 効果音（0.05〜0.09あたり）とは仕組みがちがうので、数字の見え方も別もの
     効果音は一瞬だけ鳴るが、BGMはずっと後ろで流れ続けるため、
     大きくしすぎると会話や効果音が聞こえにくくなる
*/

/* タイトルBGMの音量 */
const titleBgmVolume = 0.22;

/* 公園BGMの音量（タイトルBGMより録音が大きいので、少し下げてそろえる） */
const parkBgmVolume = 0.16;

/* 午前後半（10:30以降）の公園BGMの音量

   音源そのものの録音の大きさがちがうので、BGM1とは別の数字にしてある
   （ひとまずBGM1と同じ 0.16 にしてあるが、
     聞きくらべて大きい・小さいと感じたら、ここだけ書きかえればよい） */
const parkBgm2Volume = 0.16;

/* いやいやBGMの音量（ひとまず公園BGMと同じにしてある）
   大きい・小さいと感じたら、ここの数字だけを書きかえれば調整できる */
const tantrumBgmVolume = 0.17;

/* リザルトBGMの音量（ひとまず公園BGMと同じにしてある）
   大きい・小さいと感じたら、ここの数字だけを書きかえれば調整できる */
const resultBgmVolume = 0.17;

/* GAME OVER BGMの音量（ひとまずリザルトBGMと同じ 0.17 にしてある）

   リザルトBGMとは別の曲なので、音源そのものの録音の大きさもちがう
   そのため resultBgmVolume を使いまわさず、専用の数字にしてある
   大きい・小さいと感じたら、ここの数字だけを書きかえれば調整できる
   （例：少し小さくしたいなら 0.15） */
const gameOverBgmVolume = 0.17;

/* こもれびの広場BGMの音量

   音源そのものの録音の大きさがちがうので、公園BGMとは別の数字にしてある
   （ひとまず公園BGMと同じ 0.16 にしてあるが、
     聞きくらべて大きい・小さいと感じたら、ここだけ書きかえればよい） */
const secretBgmVolume = 0.16;

/* 公園BGMを入れておく箱

   null は「まだ作っていない」という意味
   ※ ここで new Audio(...) をしないのが大事
     Nuxtはサーバー側でも一度このコードを読むが、
     サーバーには Audio が無いのでエラーになってしまう
*/
let parkBgm: HTMLAudioElement | null = null;

/* 公園BGMを用意して返す（初めて必要になったときだけ作る）

   ※ ここでは soundEnabled を見ない
     サウンドをOFFにした瞬間は soundEnabled が false になっているが、
     そのとき「鳴っているBGMを止める」ために、この関数が必要になるため
     （ここでnullを返すと、止めたいのに止められなくなってしまう）
*/
function getParkBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!parkBgm) {
      // public/audio/park-bgm.mp3 は、URLでは /audio/park-bgm.mp3 になる
      parkBgm = new Audio('/audio/park-bgm.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      parkBgm.loop = true;

      // volume … 音の大きさ（上の parkBgmVolume で決めている）
      parkBgm.volume = getSoundVolume(parkBgmVolume);
    }

    return parkBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* 午前後半（10:30以降）の公園BGMを入れておく箱

   つくりは上の公園BGM（parkBgm）とまったく同じで、鳴らす曲だけがちがう
   null は「まだ作っていない」という意味
*/
let parkBgm2: HTMLAudioElement | null = null;

/* 午前後半の公園BGMを用意して返す（初めて必要になったときだけ作る）

   ※ getParkBgm() と同じ作りにしてある
     ここでも soundEnabled は見ない
     （OFFにした瞬間に「鳴っている曲を止める」ために必要になるため）
*/
function getParkBgm2() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!parkBgm2) {
      // public/audio/park-bgm2.mp3 は、URLでは /audio/park-bgm2.mp3 になる
      parkBgm2 = new Audio('/audio/park-bgm2.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      parkBgm2.loop = true;

      // volume … 音の大きさ（上の parkBgm2Volume で決めている）
      parkBgm2.volume = getSoundVolume(parkBgm2Volume);
    }

    return parkBgm2;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* 公園BGMが「午前後半の曲」に変わる時刻（分に直したもの）

   10 * 60 + 30 ＝ 630 で、ゲーム内時間の 10:30 のこと
   （currentMinutes と同じ「分」のものさしにそろえてある）
   切り替わる時刻を変えたくなったら、ここの数字だけを書きかえればよい
*/
const parkBgm2StartMinutes = 10 * 60 + 30;

/* いまは「午前後半の曲（BGM2）」を使う時間かどうか

   ゲーム内の時計を見て、10:30を過ぎていたら true（＝BGM2）
   まだ10:30より前なら false（＝BGM1）

   ※ 12:00を過ぎるとゴールで、公園BGMはどちらも鳴らさない
     （goToGoal() で止める）ので、ここでは12:00のことを考えなくてよい
*/
function shouldUseParkBgm2() {
  return currentMinutes.value >= parkBgm2StartMinutes;
}

/* いまの時間に合う公園BGMを返す
   ＝「時計を見て、どちらの曲を使うかを選んでいる」ところ

   09:00〜10:29 … park-bgm.mp3  （午前前半）
   10:30〜      … park-bgm2.mp3 （午前後半）

   曲を選ぶ仕事をこの1か所にまとめてあるので、
   呼ぶ側（playParkBgm など）は、どちらの曲かを気にしなくてよい
*/
function getCurrentParkBgm() {
  return shouldUseParkBgm2() ? getParkBgm2() : getParkBgm();
}

/* いまの時間に合う公園BGMの音量を返す

   曲ごとに録音の大きさがちがうので、
   「どの曲を鳴らすか」と「どの音量で鳴らすか」は、いつもセットで選ぶ
*/
function getCurrentParkBgmVolume() {
  return shouldUseParkBgm2() ? parkBgm2Volume : parkBgmVolume;
}

/* いま鳴らしている公園BGM（鳴らしていないときは null）

   「BGM1・BGM2のどちらを鳴らしているか」を覚えておくための箱
   これがあると、10:30を過ぎたときに
   ・まだBGM1のまま → BGM2へ切り替える
   ・すでにBGM2     → 何もしない（押すたびに曲が頭から鳴りなおさない）
   を見わけられる
*/
let activeParkBgm: HTMLAudioElement | null = null;

/* BGMがフェードインしきるまでの長さ（ミリ秒）
   1000 で1秒かけて、無音から ふだんの音量まで上がる
   タイトルBGMと公園BGMで同じ値を使う */
const bgmFadeInDuration = 1000;

/* フェードインの途中経過を進める係の番号（していないときは null） */
let bgmFadeTimer: ReturnType<typeof setInterval> | null = null;

/* いまフェードインの最中にある曲（していないときは null）
   途中でやめたときに「どの曲の音量を戻すか」が分かるように覚えておく */
let fadingBgm: HTMLAudioElement | null = null;

/* その曲の「曲ごとの音量」（＝どこまで上げたら終わりか、のもとの数字）

   ここに入れるのは、音量スライダーのぶんをかける前の数字
   フェードの途中でスライダーを動かされても追いつけるように、
   実際の大きさは1回ごとに getSoundVolume() で計算しなおす */
let fadingBgmBaseVolume = 0;

/* BGMをフェードインさせる（音量を0から少しずつ上げる）

   HTML Audio には「だんだん大きくする」機能が無いので、
   0.05秒ごとに volume を少しずつ足していって、自分で作る

   いきなり ふだんの音量で始まると唐突に聞こえるので、
   すっと入ってくるようにするための演出

   ※ タイトルBGM・公園BGM・こもれびの広場BGM・いやいやBGM・リザルトBGM・GAME OVER BGMの
     どれにも使える
     2曲が同時に鳴ることはない（切り替えるときは必ず前の曲を止める）ので、
     フェインの係は1つだけ用意しておけば足りる

   bgm          … フェードインさせたい曲
   targetVolume … 上がりきったときの音量（曲ごとにちがう）
*/
function startBgmFadeIn(bgm: HTMLAudioElement, targetVolume: number) {
  // 前のフェードが残っていたら止める（音量の取り合いにならないように）
  cancelBgmFade();

  if (!import.meta.client) {
    return;
  }

  const stepMs = 50; // 何ミリ秒ごとに音量を上げるか
  const totalSteps = Math.ceil(bgmFadeInDuration / stepMs);
  let doneSteps = 0;

  bgm.volume = 0; // まずは無音から
  fadingBgm = bgm;
  fadingBgmBaseVolume = targetVolume;

  bgmFadeTimer = setInterval(() => {
    doneSteps += 1;

    // 進み具合（0 → 1）を、そのまま音量の割合として使う
    const ratio = doneSteps / totalSteps;

    /* 上がりきったときの大きさは、1回ごとに計算しなおす

       こうしておくと、フェードの途中で音量スライダーを
       100% → 30% のように動かしても、その場から新しい大きさに追いつく
       （古い目標をつかんだまま、100%相当まで上がってしまうことがない） */
    const goalVolume = getSoundVolume(fadingBgmBaseVolume);

    try {
      bgm.volume = ratio >= 1 ? goalVolume : goalVolume * ratio;
    } catch {
      // 何もしない
    }

    // ふだんの音量まで上がりきったら終わり
    if (ratio >= 1) {
      cancelBgmFade();
    }
  }, stepMs);
}

/* フェードインを途中でやめる

   ※ やめたあとは volume を ふだんの大きさへ戻しておく
     0.1 まで上がった途中で止めると、次に鳴らすとき小さいままになってしまう
*/
function cancelBgmFade() {
  if (bgmFadeTimer === null) {
    return;
  }

  clearInterval(bgmFadeTimer);
  bgmFadeTimer = null;

  if (fadingBgm) {
    try {
      fadingBgm.volume = getSoundVolume(fadingBgmBaseVolume);
    } catch {
      // 何もしない
    }

    fadingBgm = null;
    fadingBgmBaseVolume = 0;
  }
}

/* 「いまの時間に合う公園BGM」を最初から再生する（ゲームを始めたとき用）

   どちらの曲を鳴らすかは、そのときのゲーム内時間で決まる
   ・10:30より前 … park-bgm.mp3  （BGM1）
   ・10:30以降   … park-bgm2.mp3 （BGM2）

   currentTime は「いま曲のどこを再生しているか」を秒で表したもの
   0 を入れると曲の先頭に戻る
*/
function playParkBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getCurrentParkBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  // 時計を見て、いま鳴らすべき公園BGMを選ぶ
  const bgm = getCurrentParkBgm();

  if (!bgm) {
    return;
  }

  /* BGM1とBGM2が重なって鳴らないように、いったん両方止めてから始める
     （鳴っていない曲に「止めて」と言っても、何も起きないだけなので安全） */
  stopParkBgm();

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    // いま鳴らしている曲として覚えておく（10:30の切り替え判定に使う）
    activeParkBgm = bgm;

    // 無音から少しずつ大きくしていく（音量も、選んだ曲に合わせる）
    startBgmFadeIn(bgm, getCurrentParkBgmVolume());
    // play() は「再生できたかどうか」をあとから知らせる形（Promise）になっている
    // 自動再生をブラウザに止められることがあるので、失敗しても何もしないでおく
    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* 公園BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   1000 で1秒。ここだけ書きかえれば、間の長さを調整できる */
const parkBgmStartDelay = 700;

/* 「あとで鳴らす」の予約票

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを control用に取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let parkBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* 公園BGMを「少し待ってから」最初から鳴らす

   「このおやつで公園へ行く！」を押した瞬間にいきなり曲が始まると、
   決定音「ポン♪」が鳴りはじめの曲にかき消されてしまい、
   タイトルBGMからの切り替わりも唐突に聞こえる
   そこで少しだけ間を空けて、決定音が鳴り終わってから曲を始める

   ※ 待たせるのは「音を鳴らすこと」だけ
     画面の切り替えやゲームの処理は、いつもどおりすぐ進む

   ※ BGM1とBGM2のどちらを鳴らすかは、待ち時間が終わったとき（700ms後）に決まる
     実際に鳴らす playParkBgm() が、そのときの時計を見て選ぶため
     たとえば、いやいやが終わったのが10:40なら、BGM1ではなくBGM2から始まる
*/
function playParkBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelParkBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  parkBgmTimer = setTimeout(() => {
    parkBgmTimer = null;

    /* 待っているあいだに画面が変わっていたら、もう鳴らさない
       （すぐ「もう一度あそぶ」でタイトルへ戻った、
         ゴールやGAME OVERになった、などの場合） */
    if (!gameStarted.value || isResultScene.value) {
      return;
    }

    playParkBgm();
  }, parkBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelParkBgmStart() {
  if (parkBgmTimer === null) {
    return;
  }

  clearTimeout(parkBgmTimer);
  parkBgmTimer = null;
}

/* 公園BGMを「続きから」再生する（サウンドをONに戻したとき用）

   playParkBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす

   ※ ここでも「いまの時間に合う曲」を選びなおす
     10:20でサウンドOFFにして、音を消したまま10:40まで進めてからONに戻したときは、
     BGM1の続きではなく、BGM2を先頭から鳴らす
     （音を消しているあいだに、午前後半に入っているため）
*/
function resumeParkBgm() {
  if (!soundEnabled.value) {
    return;
  }

  // 時計を見て、いま鳴らすべき公園BGMを選ぶ
  const bgm = getCurrentParkBgm();

  if (!bgm) {
    return;
  }

  /* OFFにする前と曲が変わっているときは、「続き」ではなく最初から鳴らす
     （曲を選んで先頭から鳴らす仕事は playParkBgm() にまかせる）

     ※ activeParkBgm が null のとき（その曲をまだ一度も鳴らしていない）も、こちら
     ※ 同じ曲のままのときは下へ進み、止めた位置からそのまま続きが鳴る */
  if (activeParkBgm !== bgm) {
    playParkBgm();
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* 公園BGMを1曲だけ一時停止する（下の pauseParkBgm() の中身）

   まだ作っていない（null＝一度も鳴らしていない）曲には、何もしなくてよい
*/
function pauseOneParkBgm(bgm: HTMLAudioElement | null) {
  if (!bgm) {
    return;
  }

  try {
    bgm.pause();
  } catch {
    // 何もしない
  }
}

/* 公園BGMを一時停止する（どこまで再生したかは覚えたまま）

   pause() は「その場で止める」だけなので、
   もう一度 play() すると、止めたところから続きが鳴る

   ※ BGM1・BGM2の両方に声をかける
     どちらの曲が鳴っている時間帯でも、サウンドOFFで確実に止まるようにするため

   ※ currentTime（どこまで鳴らしたか）はリセットしない
     activeParkBgm も、そのまま覚えておく
     サウンドをONに戻したとき、同じ曲なら止めた位置から続けられるようにするため
*/
function pauseParkBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  // （こうしないと、次に再開したとき小さい音のままになる）
  cancelBgmFade();

  pauseOneParkBgm(parkBgm);
  pauseOneParkBgm(parkBgm2);
}

/* 公園BGMを1曲だけ完全に止める（下の stopParkBgm() の中身）

   まだ作っていない（null＝一度も鳴らしていない）曲には、何もしなくてよい
*/
function stopOneParkBgm(bgm: HTMLAudioElement | null) {
  if (!bgm) {
    return;
  }

  try {
    bgm.pause();
    bgm.currentTime = 0;
  } catch {
    // 何もしない
  }
}

/* 公園BGMを完全に止める（次はまた最初から鳴るようにする）

   pause() で止めるだけだと、次に遊ぶとき曲の途中から始まってしまう
   currentTime = 0 で先頭に戻しておく

   ※ BGM1・BGM2の両方を止める
     ゴール・GAME OVER・もう一度あそぶ・いやいや発生のどれでも、
     そのときどちらの曲が鳴っていても、確実に止まってほしいため
*/
function stopParkBgm() {
  /* 「あとで鳴らす」の予約も取り消す

     ※ かならず曲を止める処理より前に置くこと
       予約だけして、まだ曲を作っていない状態のことがあるため
       （公園へ行った直後にゴールした、など）
       あとに置くと、取り消せずに あとから鳴りだしてしまう */
  cancelParkBgmStart();

  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  stopOneParkBgm(parkBgm);
  stopOneParkBgm(parkBgm2);

  // 「いま鳴らしている曲」も無し（null）に戻す
  activeParkBgm = null;
}

/* 時間に合わせて、公園BGMをBGM1からBGM2へ切り替える

   「次の場所を選ぶ」を押したとき（goToNextPlace）に呼ぶ

   わざと「10:30になった瞬間」ではなく、
   「10:30を過ぎたあと、次の場面へ進むとき」に切り替えている
   結果カードを読んでいる途中で曲が変わると唐突に感じるので、
     午前前半の章 → 行動の結果 → 午前後半の章
   という自然な流れになるようにするため

   やることは3つだけ
   ・まだ10:30より前         → 何もしない（BGM1のまま）
   ・すでにBGM2を鳴らしている → 何もしない（押すたびに頭から鳴りなおさない）
   ・10:30を過ぎたのにBGM1    → BGM1を止めて、少し間を空けてからBGM2へ
*/
function switchParkBgmForCurrentTime() {
  // まだ午前前半（10:30より前）なら、BGM1のままでよい
  if (!shouldUseParkBgm2()) {
    return;
  }

  /* いまBGM1を鳴らしているときだけ、切り替えの出番

     ・activeParkBgm が parkBgm2 … すでに切り替え済みなので何もしない
       （これが無いと「次の場所を選ぶ」を押すたびにBGM2が頭から鳴りなおしてしまう）
     ・activeParkBgm が null     … いま公園BGMは鳴っていない
       （サウンドOFF中、いやいやが終わって playParkBgmSoon() の順番待ち中など）
       この場合は、あとで鳴らすときに時間を見て選びなおされるので、ここでは何もしない */
  if (activeParkBgm !== parkBgm) {
    return;
  }

  /* BGM1を止めて、少し間を空けてからBGM2を最初から鳴らす

     ① stopParkBgm()     … BGM1をその場で止める（いったん無音になる）
     ② playParkBgmSoon() … 700ms待ってから、いまの時間に合う曲＝BGM2を
                           先頭からフェードインで鳴らしはじめる

     ②で playParkBgm() を直接呼ばず「Soon」のほうを使うのがポイント
     ・決定音「ポン♪」が、鳴りはじめの曲にかき消されない
     ・いったん無音をはさむので「章が変わった」感じが出る
     ・ゲームを始めたときや、いやいやが終わって公園へ戻るときと
       まったく同じ聞こえかたにそろう

     ※ ①を先にやるのが大事
       先に止めておかないと、待っている700msのあいだBGM1が鳴り続けて、
       そのあと急にぶつ切りになってしまう

     （今回はこみいったクロスフェードまではせず、ふわっと入ってくれば十分） */
  stopParkBgm();
  playParkBgmSoon();
}

/* ============================================================
   タイトル画面のBGM

   作りは公園BGM（上）とまったく同じで、鳴らす曲と鳴らす場面だけがちがう
   ・タイトルBGM … gameStarted === false のあいだ（タイトル画面）
   ・公園BGM     … 「このおやつで公園へ行く！」を押してから、ゴール／GAME OVERまで

   2曲が同時に鳴らないよう、切り替えるときは
   「前の曲を止めてから、次の曲を鳴らす」の順番にしている
   ============================================================ */

/* タイトルBGMを入れておく箱
   公園BGMと同じく、サーバー側では作れないので null から始める */
let titleBgm: HTMLAudioElement | null = null;

/* タイトルBGMを用意して返す（初めて必要になったときだけ作る）

   ※ 公園BGMと同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ために必要になるため
*/
function getTitleBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!titleBgm) {
      // public/audio/title-bgm.mp3 は、URLでは /audio/title-bgm.mp3 になる
      titleBgm = new Audio('/audio/title-bgm.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      titleBgm.loop = true;

      // volume … 音の大きさ（上の titleBgmVolume で決めている）
      titleBgm.volume = getSoundVolume(titleBgmVolume);
    }

    return titleBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* タイトルBGMを「最初から」再生する
   ページを開いたときと、「もう一度あそぶ」でタイトルに戻ったとき用 */
function playTitleBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getTitleBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getTitleBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    // タイトルBGMはフェードインさせず、そのまま鳴らす
    // （フェードインするのは公園BGMだけ）
    bgm.volume = getSoundVolume(titleBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* タイトルBGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   1000 で1秒。ここだけ書きかえれば、間の長さを調整できる */
const titleBgmStartDelay = 700;

/* 「あとで鳴らす」の予約票（公園BGMのものと同じ仕組み）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let titleBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* タイトルBGMを「少し待ってから」最初から鳴らす

   ボタンを押した瞬間にいきなり曲が始まると唐突に聞こえるので、
   公園BGM（playParkBgmSoon）と同じように、少しだけ間を空ける

   ※ 待たせるのは「音を鳴らすこと」だけ
     画面の切り替えやゲームの処理は、いつもどおりすぐ進む
*/
function playTitleBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelTitleBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  titleBgmTimer = setTimeout(() => {
    titleBgmTimer = null;

    /* 待っているあいだに画面が変わっていたら、もう鳴らさない
       （待ち時間のうちに「このおやつで公園へ行く！」を押して、
         ゲームが始まってしまった場合） */
    if (gameStarted.value) {
      return;
    }

    playTitleBgm();
  }, titleBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelTitleBgmStart() {
  if (titleBgmTimer === null) {
    return;
  }

  clearTimeout(titleBgmTimer);
  titleBgmTimer = null;
}

/* タイトルBGMを「続きから」再生する（サウンドをONに戻したとき用） */
function resumeTitleBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getTitleBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* タイトルBGMを一時停止する（どこまで再生したかは覚えたまま） */
function pauseTitleBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  cancelBgmFade();

  if (!titleBgm) {
    return;
  }

  try {
    titleBgm.pause();
  } catch {
    // 何もしない
  }
}

/* タイトルBGMを完全に止める（次はまた最初から鳴るようにする） */
function stopTitleBgm() {
  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  if (!titleBgm) {
    return;
  }

  try {
    titleBgm.pause();
    titleBgm.currentTime = 0;
  } catch {
    // 何もしない
  }
}

/* ============================================================
   いやいやタイムのBGM

   作りは公園BGM・タイトルBGMとまったく同じで、鳴らす場面だけがちがう
   ・いやいやBGM … いやいやタイムの画面にいるあいだ（currentEvent === 'tantrum'）

   ここでいちばん大事なのは「いつ切り替えるか」

   ① いやいやが発生した瞬間（isTantrum が true になったとき）は、
     公園BGMを stop して「無音」にするだけ（いやいやBGMはまだ鳴らさない）
     プレイヤーはまだ「通常行動の結果」を読んでいる最中なので、
     しんと静かな画面で「たいへんなことが起きた」を伝える

   ② 「こうちゃんのところへ行く」を押して、いやいやタイムの画面へ移った瞬間に切り替える
     （goToNextPlace() の中）

   ③ いやいやが終わっても（isTantrum が false になっても）、その瞬間には止めない
     「ぎゅっとだっこすると……」などの結果を読んでいるあいだ、画面はまだ
     いやいやタイムなので、曲もそのまま流しつづける

   ④ 「次の場所を選ぶ」でいやいやタイムの画面から出るときに止める
     （こちらも goToNextPlace() の中）
   ============================================================ */

/* いやいやBGMを入れておく箱
   ほかの2曲と同じく、サーバー側では作れないので null から始める */
let tantrumBgm: HTMLAudioElement | null = null;

/* いやいやBGMを用意して返す（初めて必要になったときだけ作る）

   ※ ほかの2曲と同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ために必要になるため
*/
function getTantrumBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!tantrumBgm) {
      // public/audio/tantrum-bgm.mp3 は、URLでは /audio/tantrum-bgm.mp3 になる
      tantrumBgm = new Audio('/audio/tantrum-bgm.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      // （いやいやが何回続いても、音が途切れないようにするため）
      tantrumBgm.loop = true;

      // volume … 音の大きさ（上の tantrumBgmVolume で決めている）
      tantrumBgm.volume = getSoundVolume(tantrumBgmVolume);
    }

    return tantrumBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* いやいやBGMを「最初から」再生する（いやいやタイムへ入ったとき用）

   いやいやは1回ごとに独立した場面なので、毎回きちんと曲の頭から始める
   （前のいやいやの途中から鳴りだすと、場面が変わった感じがしない）

   公園BGMと同じくフェードインさせる
   公園BGMを止めた直後に、いきなり別の曲が最大音量で始まると唐突なため
*/
function playTantrumBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getTantrumBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getTantrumBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    /* 無音から少しずつ大きくしていく

       ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は
         公園BGMと共用で問題ない
         2曲が同時に鳴ることはなく、切り替えるときは必ず前の曲を止めており、
         startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
    startBgmFadeIn(bgm, tantrumBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* いやいやBGMを「続きから」再生する（サウンドをONに戻したとき用）

   playTantrumBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす
*/
function resumeTantrumBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getTantrumBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* いやいやBGMを一時停止する（どこまで再生したかは覚えたまま）
   サウンドをOFFにしたときと、ページを離れるときに使う */
function pauseTantrumBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  cancelBgmFade();

  if (!tantrumBgm) {
    return;
  }

  try {
    tantrumBgm.pause();
  } catch {
    // 何もしない
  }
}

/* いやいやBGMを完全に止める（次はまた最初から鳴るようにする）

   いやいやタイムの画面から出るとき・ゴール・GAME OVER・
   「もう一度あそぶ」で使う

   pause() ではなく stop（先頭へ戻す）にしているのは、
   次のいやいやが「前のいやいやの続き」から鳴りださないようにするため
*/
function stopTantrumBgm() {
  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  if (!tantrumBgm) {
    return;
  }

  try {
    tantrumBgm.pause();
    tantrumBgm.currentTime = 0;
  } catch {
    // 何もしない
  }
}

/* ============================================================
   リザルト画面のBGM

   作りは公園BGM・タイトルBGM・いやいやBGMとまったく同じで、
   鳴らす場面だけがちがう
   ・リザルトBGM … 通常ゴールの結果画面にいるあいだ（currentEvent === 'goal'）

   「午前中に親子で公園をたくさん探検して、お昼になったので帰る」という
   おしまいの場面に合う曲を流す

   ※ GAME OVER画面で流すのは、この曲ではない
     GAME OVERは「途中で帰ることになってしまった」場面なので、
     別の専用曲（GAME OVER BGM）を流す（すぐ下の「GAME OVER画面のBGM」を参照）
     ・ゴール（currentEvent === 'goal'）        … リザルトBGM（result-bgm.mp3。S+ランクだけ result-bgm-splus.mp3）
     ・GAME OVER（currentEvent === 'gameOver'） … GAME OVER BGM（game-over-bgm.mp3）

   ※ S+ランクのときだけ、うた入りの曲「きょうの大冒険、おしまい！ ～うた入り～」を流す
     曲がちがうだけで、同じリザルトBGMとしてあつかう
     （入れもの resultBgm も、鳴らす・止める・再開する関数も、ぜんぶ同じものを使う）
     鳴らす前に getResultBgm() が、今回のランクに合わせて src を差しかえる

   ※ ゴール音「タタターン♪」とは重ねない
     goToGoal() で「タタターン♪」を鳴らしたあと、
     少しだけ間を空けてから曲を始める（playResultBgmSoon）
   ============================================================ */

/* リザルトBGMを入れておく箱
   ほかの3曲と同じく、サーバー側では作れないので null から始める */
let resultBgm: HTMLAudioElement | null = null;

/* 通常のリザルトBGMの音源（Sランク以下と、特殊エンドで流す）
   public/audio/result-bgm.mp3 は、URLでは /audio/result-bgm.mp3 になる
   （S+ランク用の sPlusSongSrc は、サウンドトラックと共用なので utils/sPlusSong.ts にある） */
const resultBgmSrc = '/audio/result-bgm.mp3';

/* 今回のランクに合ったリザルトBGMの音源を返す

   S+ランクのときだけ、うた入り
   Sランクもふくめ、それ以外（A〜D・特殊エンド）はぜんぶ通常版 */
function getResultBgmSrc() {
  return endingRank.value === 'S+ランク' ? sPlusSongSrc : resultBgmSrc;
}

/* リザルトBGMを用意して返す（初めて必要になったときだけ作る）

   ※ ほかの3曲と同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ために必要になるため

   ※ 入れもの（Audio）は1つだけ作って使いまわすが、鳴らす曲は今回のランクで変わる
     同じページのまま何回も遊ぶと、「1回目 S+ → 2回目 A → 3回目 S+」のように
     前回とちがう曲が必要になるので、呼ばれるたびに src が今回のランクに合っているかを確かめる
*/
function getResultBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    const src = getResultBgmSrc();

    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!resultBgm) {
      resultBgm = new Audio(src);

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      // （結果をゆっくり読んでいても、曲が途切れないようにするため）
      resultBgm.loop = true;

      // volume … 音の大きさ（上の resultBgmVolume で決めている）
      resultBgm.volume = getSoundVolume(resultBgmVolume);
    } else if (resultBgm.getAttribute('src') !== src) {
      /* 前のゴールとランクがちがって、鳴らす曲が変わるときだけ差しかえる

         ・同じ曲のときは差しかえない
           サウンドをONに戻して「続きから」鳴らすとき（resumeResultBgm）に、先頭へ戻ってしまうため
         ・src を差しかえると再生位置は先頭に戻るが、loop と volume はそのまま残る

         ※ resultBgm.src ではなく getAttribute('src') で比べるのは、
           .src だと「http://〜/audio/result-bgm.mp3」のような長い形で返ってきて、
           同じ曲でも文字が食いちがってしまうため */
      resultBgm.src = src;
    }

    return resultBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* リザルトBGMを「最初から」再生する（ゴールしたとき用）

   公園BGM・いやいやBGMと同じくフェードインさせる
   ゴール音「タタターン♪」のあとに、ふわっと曲が始まるようにするため
*/
function playResultBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getResultBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getResultBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    /* 無音から少しずつ大きくしていく

       ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は
         ほかの3曲と共用で問題ない
         4曲が同時に鳴ることはなく、切り替えるときは必ず前の曲を止めており、
         startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
    startBgmFadeIn(bgm, resultBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* リザルトBGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   1500 で1.5秒。ここだけ書きかえれば、間の長さを調整できる

   ゴール音「タタターン♪」と同時に曲が始まってしまうと
   せっかくのファンファーレが聞こえなくなるので、そのぶんだけ待つ */
const resultBgmStartDelay = 1500;

/* 「あとで鳴らす」の予約票（公園BGM・タイトルBGMのものと同じ仕組み）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let resultBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* リザルトBGMを「少し待ってから」最初から鳴らす

   ※ 待たせるのは「音を鳴らすこと」だけ
     結果画面は、いつもどおりすぐ表示される
*/
function playResultBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelResultBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  resultBgmTimer = setTimeout(() => {
    resultBgmTimer = null;

    /* 待っているあいだに画面が変わっていたら、もう鳴らさない
       （待ち時間のうちに「もう一度あそぶ」を押して、
         タイトル画面へ戻ってしまった場合） */
    if (currentEvent.value !== 'goal') {
      return;
    }

    playResultBgm();
  }, resultBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelResultBgmStart() {
  if (resultBgmTimer === null) {
    return;
  }

  clearTimeout(resultBgmTimer);
  resultBgmTimer = null;
}

/* リザルトBGMを「続きから」再生する（サウンドをONに戻したとき用）

   playResultBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす
*/
function resumeResultBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getResultBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* リザルトBGMを一時停止する（どこまで再生したかは覚えたまま）
   サウンドをOFFにしたときと、ページを離れるときに使う */
function pauseResultBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  // （こうしないと、次に再開したとき小さい音のままになる）
  cancelBgmFade();

  if (!resultBgm) {
    return;
  }

  try {
    resultBgm.pause();
  } catch {
    // 何もしない
  }
}

/* リザルトBGMを完全に止める（次はまた最初から鳴るようにする）
   「もう一度あそぶ」で使う */
function stopResultBgm() {
  /* 「あとで鳴らす」の予約も取り消す

     ※ かならず下の「まだ作っていないなら終わり」より前に置くこと
       ゴール音が鳴っているあいだに「もう一度あそぶ」を押すと、
       予約だけして、まだ曲を作っていない状態のことがあるため
       あとに置くと、取り消せずに タイトル画面で鳴りだしてしまう */
  cancelResultBgmStart();

  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  if (!resultBgm) {
    return;
  }

  try {
    resultBgm.pause();
    resultBgm.currentTime = 0;
  } catch {
    // 何もしない
  }
}

/* ============================================================
   GAME OVER画面のBGM

   作りはリザルトBGM（すぐ上）とまったく同じで、鳴らす場面だけがちがう
   ・GAME OVER BGM … GAME OVER画面にいるあいだ（currentEvent === 'gameOver'）

   ■ なぜGAME OVER画面だけの専用曲にするのか

     おでかけの終わりかたは2つあり、気持ちがまったくちがう
     ・ゴール     … 12時まで遊びきった「きょうの大冒険、おしまい！」 → リザルトBGM
     ・GAME OVER … 途中で限界になって帰る「きょうはここまで。また遊ぼう」 → この曲

     同じ曲を使いまわすと、どちらの終わりかたなのかが音から伝わらなくなる
     そこで、入れもの（gameOverBgm）も関数も音量も、リザルトBGMとはぜんぶ別にしてある
     （リザルトBGMの関数は、GAME OVERを鳴らすためには1つも使わない）

   ■ 鳴るまでの流れ

     ① checkGameOver() で GAME OVER が決まる
        → 画面はその場でGAME OVER画面へ切りかわる
        → それまで鳴っていた曲（公園・秘密の場所・いやいや・リザルト）を止める
     ② playGameOverBgmSoon() で「0.7秒あとに鳴らす」予約をする
     ③ 0.7秒の無音のあと、playGameOverBgm() が曲の先頭からフェードインで鳴らす

   ※ GAME OVER専用の短い効果音は付けていない
     「少し無音 → GAME OVER BGM」という、しずかな切りかわりにしている
   ============================================================ */

/* GAME OVER BGMを入れておく箱

   null は「まだ作っていない」という意味

   ※ ここで new Audio('/audio/game-over-bgm.mp3') と書かないのが大事
     Nuxtは、ページを作るときにサーバー側でも一度このコードを読む
     サーバーには Audio が無いので、ここで作るとエラーになってしまう
     そこで箱だけ用意しておき、ブラウザで必要になったとき
     （getGameOverBgm() が初めて呼ばれたとき）に作る */
let gameOverBgm: HTMLAudioElement | null = null;

/* GAME OVER BGMを用意して返す（初めて必要になったときだけ作る）

   ※ ほかの曲と同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ためにも、この関数が必要になるため
*/
function getGameOverBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!gameOverBgm) {
      // public/audio/game-over-bgm.mp3 は、URLでは /audio/game-over-bgm.mp3 になる
      gameOverBgm = new Audio('/audio/game-over-bgm.mp3');

      /* loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す

         曲は2分ほどあるので、ふつうはその前に「もう一度あそぶ」などを押して止まる
         それでも、記録をゆっくり読んでいたり、画面をそのまま置いておいたりしたときに、
         とちゅうで急に無音にならないように、くり返しておく */
      gameOverBgm.loop = true;

      // volume … 音の大きさ（上の gameOverBgmVolume で決めている）
      gameOverBgm.volume = getSoundVolume(gameOverBgmVolume);
    }

    return gameOverBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* GAME OVER BGMを「最初から」再生する（GAME OVERになったとき用）

   ■ play と resume のちがい
     ・playGameOverBgm()   … currentTime を 0 にして、曲の先頭から鳴らす
                             GAME OVERになるたびに、いつも同じ始まりかたにしたいため
     ・resumeGameOverBgm() … currentTime はさわらず、止めたところの続きから鳴らす
                             サウンドを OFF → ON に戻したとき用

   前の曲が止まったあとに、いきなり曲がいつもの音量で始まると唐突なので、
   ほかのBGMと同じ startBgmFadeIn() で、無音からふわっと大きくしていく
*/
function playGameOverBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getGameOverBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getGameOverBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    /* 無音から少しずつ大きくしていく

       ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は、ほかの曲と共用で問題ない
         2曲が同時に鳴ることはなく（GAME OVERになるときに、前の曲はぜんぶ止めてある）、
         startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
    startBgmFadeIn(bgm, gameOverBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* GAME OVER BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   700 で0.7秒。ここだけ書きかえれば、間の長さを調整できる

   待つ理由は2つ
   ・GAME OVERになる直前の決定音「ポン♪」や、いやいや発生の音などが、
     曲の鳴りはじめと重ならないようにするため
   ・前の曲が止まったあと、いったん「しん」とする間を作るため
     この短い無音があることで、「今日の遊びはここでおしまい」という区切りが伝わる

   ※ 待たせるのは「音」だけ
     GAME OVER画面そのものは、この待ち時間とは関係なく、すぐに表示される */
const gameOverBgmStartDelay = 700;

/* 「あとで鳴らす」の予約票（リザルトBGMのものと同じ仕組み）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let gameOverBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* GAME OVER BGMを「少し待ってから」最初から鳴らす（checkGameOver() から呼ぶ）

   ■ 最初に、前の予約を取り消す理由
     予約が2つ残っていると、0.7秒後に「先頭から鳴らす」が2回はたらき、
     鳴りはじめた曲が頭からやりなおしになってしまう
     先に cancelGameOverBgmStart() で消しておけば、予約はいつも1つだけになる

   ■ 鳴らす直前に、まだGAME OVER画面にいるかを確かめる理由
     0.7秒待っているあいだに「もう一度あそぶ」などを押して、画面が変わっていることがある
     確かめずに鳴らすと、タイトル画面でGAME OVERの曲が流れてしまう
*/
function playGameOverBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelGameOverBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  gameOverBgmTimer = setTimeout(() => {
    gameOverBgmTimer = null;

    // 待っているあいだにGAME OVER画面から出ていたら、もう鳴らさない
    if (currentEvent.value !== 'gameOver') {
      return;
    }

    playGameOverBgm();
  }, gameOverBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelGameOverBgmStart() {
  if (gameOverBgmTimer === null) {
    return;
  }

  clearTimeout(gameOverBgmTimer);
  gameOverBgmTimer = null;
}

/* GAME OVER BGMを「続きから」再生する（サウンドをONに戻したとき用）

   playGameOverBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす

   ※ サウンドOFFのままGAME OVERになり、GAME OVER画面でONに戻したときは、
     まだ曲を一度も作っていない（gameOverBgm が null）
     その場合は getGameOverBgm() がここで初めて作るので、曲の先頭から鳴りはじめる
*/
function resumeGameOverBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getGameOverBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* GAME OVER BGMを一時停止する（どこまで再生したかは覚えたまま）
   サウンドをOFFにしたときと、ページを離れるときに使う

   ■ pause と stop のちがい
     ・pauseGameOverBgm() … その場で止めるだけ。currentTime（どこまで鳴らしたか）は残す
                            → サウンドを ON に戻したとき、止めた位置から続けられる
     ・stopGameOverBgm()  … 止めたうえで、currentTime を 0（曲の先頭）へ戻す
                            → GAME OVER画面から出るとき用。次のGAME OVERでは、また先頭から鳴る
*/
function pauseGameOverBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  // （こうしないと、次に再開したとき小さい音のままになる）
  cancelBgmFade();

  if (!gameOverBgm) {
    return;
  }

  try {
    gameOverBgm.pause();
  } catch {
    // 何もしない
  }
}

/* GAME OVER BGMを完全に止める（次はまた最初から鳴るようにする）
   GAME OVER画面から出るとき（resetGame() ＝ もう一度あそぶ／はじめの画面へ戻る）に使う */
function stopGameOverBgm() {
  /* 「あとで鳴らす」の予約も取り消す

     ※ かならず下の「まだ作っていないなら終わり」より前に置くこと
       GAME OVERになってすぐ（0.7秒待っている最中に）「もう一度あそぶ」を押すと、
       予約だけして、まだ曲を作っていない状態のことがあるため
       あとに置くと、取り消せずに タイトル画面で鳴りだしてしまう */
  cancelGameOverBgmStart();

  // フェードインの途中で止めることもあるので、フェードもやめておく
  cancelBgmFade();

  if (!gameOverBgm) {
    return;
  }

  try {
    gameOverBgm.pause();
    gameOverBgm.currentTime = 0; // 次のGAME OVERでは、また曲の先頭から

    // 音量も、決めてある大きさへ戻しておく
    // （フェードインの途中で止めると、小さい音量のまま残ることがあるため）
    gameOverBgm.volume = getSoundVolume(gameOverBgmVolume);
  } catch {
    // 何もしない
  }
}

/* ============================================================
   こもれびの広場のBGM

   作りは公園BGM・タイトルBGM・いやいやBGM・リザルトBGMとまったく同じで、
   鳴らす場面だけがちがう
   ・こもれびの広場BGM … 秘密の場所にいるあいだ（currentEvent === 'secretSpot'）

   ここだけ曲を変える理由は「特別な場所に来た」と分かるようにするため
   公園入口・すべり台・砂場などは、ぜんぶ同じ公園のつづきなので公園BGMのまま
   秘密の場所は、たくさん遊んだ人だけが入れる特別な場所なので、曲も変える

   ※ 公園BGMとは必ず「入れかえ」にする（重ねない）
     秘密の場所へ入るときは公園BGMを止めてから、
     出るときはこもれびの広場BGMを止めてから、次の曲を鳴らす
     2曲が同時に鳴ると、どちらもにごって聞こえてしまうため

   ※ 秘密の場所を出たら、公園BGM1・BGM2のどちらへ戻るかは時計が決める
     戻る先を park-bgm.mp3 に決め打ちしないこと
     10:40に秘密の場所を出たのに午前前半のBGM1へ戻ると、
     時間帯で曲を変えている仕組み（shouldUseParkBgm2）がこわれてしまう
     曲を選ぶ仕事は playParkBgmSoon() → playParkBgm() にまかせる
   ============================================================ */

/* こもれびの広場BGMを入れておく箱
   ほかの4曲と同じく、サーバー側では作れないので null から始める */
let secretBgm: HTMLAudioElement | null = null;

/* こもれびの広場BGMを用意して返す（初めて必要になったときだけ作る）

   ※ ほかの4曲と同じく、ここでは soundEnabled を見ない
     OFFにした瞬間に「鳴っている曲を止める」ために必要になるため
*/
function getSecretBgm() {
  // サーバー側には Audio が無いので、ここで終わり
  if (!import.meta.client) {
    return null;
  }

  try {
    // まだ無いときだけ作る（2回目からは、この行は通らない）
    if (!secretBgm) {
      // public/audio/secret-bgm.mp3 は、URLでは /audio/secret-bgm.mp3 になる
      secretBgm = new Audio('/audio/secret-bgm.mp3');

      // loop … 曲が最後まで進んだら、自動で最初へ戻ってくり返す
      // （秘密の場所で何回も遊んで長くいても、曲が途切れないようにするため）
      secretBgm.loop = true;

      // volume … 音の大きさ（上の secretBgmVolume で決めている）
      secretBgm.volume = getSoundVolume(secretBgmVolume);
    }

    return secretBgm;
  } catch {
    // BGMが使えない環境でも、ゲームは続けられるようにする
    return null;
  }
}

/* こもれびの広場BGMを「最初から」再生する（秘密の場所へ入ったとき用）

   ※ currentTime = 0 で必ず曲の先頭に戻す
     一度出てからまた秘密の場所へ入ったときも、前回の続きではなく
     頭から鳴らしたいため（入るたびに同じ始まりかたにそろえる）
*/
function playSecretBgm() {
  // サウンドOFFのときは、ここで終わり
  // ※ getSecretBgm() より先に見ることで、OFFのあいだは
  //   mp3の読み込みそのものが起きないようにしている
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getSecretBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.currentTime = 0; // 曲の先頭へ戻す

    /* 無音から少しずつ大きくしていく

       ※ フェードインの係（startBgmFadeIn / cancelBgmFade）は
         ほかの4曲と共用で問題ない
         5曲が同時に鳴ることはなく、切り替えるときは必ず前の曲を止めており、
         startBgmFadeIn() の中で前のフェードを取り消してから始めるため */
    startBgmFadeIn(bgm, secretBgmVolume);

    bgm.play().catch(() => {});
  } catch {
    // BGMが鳴らなくても、ゲームは止めない
  }
}

/* こもれびの広場BGMを鳴らしはじめるまでの待ち時間（ミリ秒）
   700 で0.7秒。ここだけ書きかえれば、間の長さを調整できる

   待つ理由は2つ
   ・「秘密の場所へ行く」の決定音「ポン♪」が、曲の鳴りはじめにかき消されないため
   ・公園BGMが止まったあと、いったん静かな時間を作るため
     この「しん」とする一瞬があることで、
     「いつもの公園から、特別な場所へ入った」という感じが出る
   （公園BGM・タイトルBGMと同じ 700ms にそろえてある） */
const secretBgmStartDelay = 700;

/* 「あとで鳴らす」の予約票（ほかの曲のものと同じ仕組み）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり鳴らさない」と取り消すのに必要）
*/
let secretBgmTimer: ReturnType<typeof setTimeout> | null = null;

/* こもれびの広場BGMを「少し待ってから」最初から鳴らす

   ※ 待たせるのは「音を鳴らすこと」だけ
     秘密の場所の画面は、いつもどおりすぐ表示される
*/
function playSecretBgmSoon() {
  // 前の予約が残っていたら取り消す（二重に鳴らさないため）
  cancelSecretBgmStart();

  // サーバー側では音を鳴らさないので、予約もしない
  if (!import.meta.client) {
    return;
  }

  secretBgmTimer = setTimeout(() => {
    secretBgmTimer = null;

    /* 待っている0.7秒のあいだに画面が変わっていたら、もう鳴らさない
       （秘密の場所を出た、いやいやになった、GAME OVERになった、
         ゴールした、「もう一度あそぶ」でタイトルへ戻った、などの場合）

       まだ秘密の場所にいるときだけ鳴らす、という確かめかたにしてあるので、
       行き先がどこであっても「あとから鳴りだす」ことがない */
    if (currentEvent.value !== 'secretSpot') {
      return;
    }

    playSecretBgm();
  }, secretBgmStartDelay);
}

/* 「あとで鳴らす」の予約を取り消す */
function cancelSecretBgmStart() {
  if (secretBgmTimer === null) {
    return;
  }

  clearTimeout(secretBgmTimer);
  secretBgmTimer = null;
}

/* こもれびの広場BGMを「続きから」再生する（サウンドをONに戻したとき用）

   playSecretBgm() とのちがいは currentTime を 0 に戻さないこと
   OFFにしたところから、そのまま続きを鳴らす

   ※ サウンドOFFのまま秘密の場所へ入って、そこでONに戻したときは、
     まだ曲を一度も作っていない（secretBgm が null）
     その場合は getSecretBgm() が新しく作り、先頭から鳴りはじめる
*/
function resumeSecretBgm() {
  if (!soundEnabled.value) {
    return;
  }

  const bgm = getSecretBgm();

  if (!bgm) {
    return;
  }

  try {
    bgm.play().catch(() => {});
  } catch {
    // 何もしない
  }
}

/* こもれびの広場BGMを一時停止する（どこまで再生したかは覚えたまま）
   サウンドをOFFにしたときと、ページを離れるときに使う

   ※ currentTime（どこまで鳴らしたか）はリセットしない
     サウンドをONに戻したとき、止めた位置から続けられるようにするため
*/
function pauseSecretBgm() {
  // フェードインの途中なら、そこでやめて音量をふだんの大きさへ戻す
  // （こうしないと、次に再開したとき小さい音のままになる）
  cancelBgmFade();

  if (!secretBgm) {
    return;
  }

  try {
    secretBgm.pause();
  } catch {
    // 何もしない
  }
}

/* こもれびの広場BGMを完全に止める（次はまた最初から鳴るようにする）

   秘密の場所から出るとき・いやいや発生・GAME OVER・ゴール・
   「もう一度あそぶ」で使う
*/
function stopSecretBgm() {
  /* 「あとで鳴らす」の予約も取り消す

     ※ かならず下の「まだ作っていないなら終わり」より前に置くこと
       秘密の場所へ入った直後（＝まだ0.7秒待っている最中）に
       すぐ出る・いやいやになる・GAME OVERになることがあり、
       そのときは予約だけして、まだ曲を作っていない状態になっている
       あとに置くと、取り消せずに別の画面で鳴りだしてしまう */
  cancelSecretBgmStart();

  // フェードインの途中で止めることもあるので、音量も戻しておく
  cancelBgmFade();

  if (!secretBgm) {
    return;
  }

  try {
    secretBgm.pause();
    secretBgm.currentTime = 0; // 次に入ったときは、また曲の先頭から
  } catch {
    // 何もしない
  }
}

/* ============================================================
   音量（スライダー）を、実際の音へ反映する

   ここにあるのは3つ
   ・applySoundVolume()  … いま作ってあるBGMの volume を、いまの設定へそろえる
   ・saveSoundVolume()   … 次に開いたときのために localStorage へ残す
   ・changeSoundVolume() … スライダーを動かしたときに呼ばれる（上の2つをまとめて行う）
   ============================================================ */

/* いま作ってある（＝一度でも鳴らした）BGMの音量を、いまの設定へそろえる

   ■ get〜Bgm() を呼ばないのが大事
     呼ぶと、まだ一度も鳴らしていない曲まで new Audio() で作られてしまい、
     音量を変えただけなのに mp3 の読み込みが始まってしまう
     ここでは「もう作ってある曲」だけを、そのまま直す

   ■ pause() も play() も currentTime も、さわらない
     volume だけを変えるので、鳴っている曲は
     止まったり、頭から鳴りなおしたりせず、そのまま大きさだけが変わる

   ■ フェードインの最中の曲だけは、ここでは変えない
     フェードの係（startBgmFadeIn）が 0.05秒ごとに
     いまの設定で計算しなおしているので、そちらにまかせる
     （ここで一気に入れてしまうと、フェードの途中で音が飛んでしまう）
*/
function applySoundVolume() {
  /* 曲と「曲ごとの音量」の組み合わせ
     新しいBGMを足したときは、ここにも1行足す */
  const bgmList: [HTMLAudioElement | null, number][] = [
    [parkBgm, parkBgmVolume],
    [parkBgm2, parkBgm2Volume],
    [titleBgm, titleBgmVolume],
    [tantrumBgm, tantrumBgmVolume],
    [resultBgm, resultBgmVolume],
    [gameOverBgm, gameOverBgmVolume],
    [secretBgm, secretBgmVolume],
  ];

  for (const [bgm, baseVolume] of bgmList) {
    // まだ作っていない曲（null）と、フェードインの最中の曲は、ここでは何もしない
    if (!bgm || bgm === fadingBgm) {
      continue;
    }

    try {
      bgm.volume = getSoundVolume(baseVolume);
    } catch {
      // 何もしない
    }
  }
}

/* 音量を、次に開いたときのために保存しておく */
function saveSoundVolume() {
  // サーバー側には localStorage が無いので、ここで終わり
  if (!import.meta.client) {
    return;
  }

  try {
    localStorage.setItem(soundVolumeStorageKey, String(soundVolumePercent.value));
  } catch {
    // ブラウザの設定で保存できないことがある
    // 保存できなくても、このページを開いているあいだの音量は正常に動く
  }
}

/* 音量のスライダーを動かしたとき

   input type="range" の value は文字で届くので、Number() で数字に直す
   つまみを持って動かしているあいだ（@input）ずっと呼ばれるので、
   動かしている途中から、鳴っている音の大きさが変わっていく

   ■ 0% ＝ ミュートなので、スピーカーの状態もここでそろえる
     ・0%まで下げた     … ミュートにする（アイコンが 🔊× になり、BGMも止まる）
     ・0%から上げた     … ミュートを解除する（いまの画面に合うBGMが鳴りなおす）
     どちらも、ミュートボタンを押したときとまったく同じあと始末をする
     （→ applySoundEnabledChange）

   ※ ここでは toggleSound() は呼ばない
     toggleSound() はスライダーの位置まで動かしてしまうので、
     せっかく動かした値（30%など）が、覚えていた値で上書きされてしまうため
*/
function changeSoundVolume(event: Event) {
  const slider = event.target as HTMLInputElement;
  const percent = Number(slider.value);

  if (!Number.isFinite(percent)) {
    return;
  }

  soundVolumePercent.value = Math.min(100, Math.max(0, Math.round(percent)));

  // 0%より大きいときは、次にミュートを解除したときの戻り先として覚えておく
  if (soundVolumePercent.value > 0) {
    volumeBeforeMute = soundVolumePercent.value;
  }

  /* 0%かどうかで、サウンドのON/OFFが変わるかを見る
     変わるときだけ、BGMの止める・鳴らしなおすところまで行う
     （動かすたびに毎回やると、鳴っている曲が何度も鳴りなおしてしまう） */
  const shouldBeOn = soundVolumePercent.value > 0;
  const soundEnabledChanged = shouldBeOn !== soundEnabled.value;

  if (soundEnabledChanged) {
    soundEnabled.value = shouldBeOn;
  }

  // 先に音量をそろえてから、BGMを鳴らしなおす（小さいはずの曲が一瞬大きく鳴らないように）
  applySoundVolume();
  saveSoundVolume();

  if (soundEnabledChanged) {
    applySoundEnabledChange();
  }
}

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

   ※ 各場所の行動・いやいや対応・とつぜんのできごと・ひとやすみの行動は、
     どれも1行目でこの関数を呼んでいる＝「行動がはじまった瞬間」の共通の入口
     クリックでも Enter / Space でも必ずここを通るので、
     決定音はここで1回だけ鳴らせばよい
     （行動ごとに同じ1行を書き足すより、こちらのほうが見通しがよい）
*/
function startStatusChanges() {
  // 決定音「ポン♪」
  playDecisionSound();

  /* サブメニュー「☕ ひとやすみ」を閉じる

     どの行動を選んでも、ここを通れば必ず閉じるので、
     行動のあとにサブメニューが出しっぱなしになることがない
     （休憩・おやつだけでなく、「一緒にすべる」のような
       場所の行動を選んだときにも閉じる）

     ※ closeCareMenu() の中で、おやつバッグもいっしょに閉じる
       おやつを食べたあとに、バッグが出しっぱなしになることもない
  */
  closeCareMenu();

  // 前の結果が休憩・おやつだったかの印も消す（このあとの行動が休憩・おやつなら、finishCareAction() でまた付く）
  isCareActionResult.value = false;

  // 演出用：前の行動で見つけたものの表示が残らないように空へ戻す
  foundItemsThisAction.value = [];

  // 演出用：前の行動のちいさなできごとの表示も空へ戻す
  randomEventText.value = '';
  randomEventEffects.value = [];

  // 演出用：前の行動のいやいや文も空へ戻す
  tantrumText.value = '';

  // 演出用：前の対応の「✨ ナイス対応！」も空へ戻す
  // （いやいやが続いて対応を選び直したときに、前の表示が残らないようにする）
  niceTantrumResponseText.value = '';

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

/* 中央の「今回の変化」を、誰の情報かで3つのまとまりに分けたもの

   ① こうちゃん … 体力・機嫌
   ② 親         … 体力・余裕
   ③ おでかけ   … ポイント・時間

   「こうちゃんの体力」なのか「親の体力」なのかを探さなくてよいように、
   同じ人のステータスを1つの枠にまとめている
   グループの見出しが名前を言ってくれるので、中のラベルは「体力」だけでよい

   1グループは { name, groupClass, rows } の3つを持つ
   ・name       … 「こうちゃん」などの見出し
   ・groupClass … 枠の色を変えるためのCSSクラス名
   ・rows       … その人のステータス2つ

   rows の1行ぶんは、次の5つ
   ・label      … 「体力」などの項目名
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
const changeGroups = computed(() => {
  const changes = statusChanges.value;

  // まだ今回の行動結果がないときは、からっぽにする
  if (changes === null) {
    return [];
  }

  // 毎回 statusBefore.value と書かなくてよいように、行動前の控えを取り出しておく
  const before = statusBefore.value;

  /* 1行ぶんの表示を作る小さな道具
     同じ書きかたを6回くり返さなくてよくなる

     label      … 画面に出す名前（グループ見出しがあるので「体力」だけでよい）
     statusName … 色を決めるために changeClass() へ渡す中の名前
     beforeValue … 行動する前の値
     afterValue  … 行動したあとの値（0〜100に丸めたあとの、いま画面に出ている値）
     amount      … 今回の増減
  */
  const makeRow = (label: string, statusName: string, beforeValue: number, afterValue: number, amount: number) => ({
    label,
    before: String(beforeValue),
    after: String(afterValue),
    changeText: formatChange(amount),
    className: changeClass(statusName, amount),
  });

  return [
    {
      // 見出しがあるので、中のラベルは「体力」「機嫌」だけでよい
      name: 'こうちゃん',
      groupClass: 'change-group--child',
      rows: [makeRow('体力', 'childEnergy', before.childEnergy, childEnergy.value, changes.childEnergy), makeRow('機嫌', 'childMood', before.childMood, childMood.value, changes.childMood)],
    },
    {
      name: '親',
      groupClass: 'change-group--parent',
      rows: [makeRow('体力', 'parentEnergy', before.parentEnergy, parentEnergy.value, changes.parentEnergy), makeRow('余裕', 'parentCalm', before.parentCalm, parentCalm.value, changes.parentCalm)],
    },
    {
      // こうちゃんでも親でもない「おでかけ全体」の情報
      name: 'おでかけ',
      groupClass: 'change-group--outing',
      rows: [
        makeRow('ポイント', 'outingPoint', before.outingPoint, outingPoint.value, changes.outingPoint),
        {
          // 時間だけは数ではなく時計の形で出すので、makeRow は使わない
          // before は「分」で控えてあるので formatMinutesToTime() で 09:00 の形に直し、
          // after は画面の時計と同じ currentTime をそのまま使う
          label: '時間',
          before: removeLeadingZero(formatMinutesToTime(before.minutes)),
          after: removeLeadingZero(currentTime.value),
          changeText: `${formatChange(changes.minutes)}分`,
          className: changeClass('minutes', changes.minutes),
        },
      ],
    },
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

  // アイテム発見音「キラリン♪」
  // 上の重複チェックを通りぬけた＝本当に新しいものを見つけたときだけ鳴る
  playItemSound();

  // 演出用：この行動で新しく見つけたものとして覚えておく
  // 「〜を見つけました！」の文は、この foundItemsThisAction をもとに
  // 画面のほうで組み立てる（アイテムの名前だけ色をつけて目立たせるため）
  foundItemsThisAction.value.push(itemName);
}

/* アイテムが見つかる場所
   場所で遊ぶ6か所だけ（公園入口・いやいや・とつぜんのできごとなどでは見つからないので、GameEvent 全部にはしない）
*/
type ItemPlace = 'slide' | 'sandbox' | 'acornArea' | 'pond' | 'grassArea' | 'secretSpot';

/* 場所ごとに見つかるもの（1か所に1種類） */
const placeItems: Record<ItemPlace, string> = {
  slide: 'ちいさな松ぼっくり',
  sandbox: 'きれいな石',
  acornArea: '大きなどんぐり',
  pond: '水色のガラス玉',
  grassArea: '黄色い花',
  secretSpot: 'ふしぎな形の枝',
};

/* アイテムごとの、こうちゃんのひとこと

   結果カードの「★ アイテム発見！」「『○○』を見つけました！」の下に、1文だけ出す
   見出し（キー）は placeItems のアイテム名とそろえてあるので、
   placeItems の名前を変えたときは、ここも合わせて変えること

   ※ 同じ文を画面のほうに何度も書かないように、文章はここだけに置いてある
     （結果カードは場所ごとに同じ形のものが並んでいるため）
*/
const itemReactions: Record<string, string> = {
  'ちいさな松ぼっくり': '「みてみて！」こうちゃんは、まつぼっくりを見せてくれました。',
  'きれいな石': '「つるつるしてる！」こうちゃんは、何度もさわっています。',
  '大きなどんぐり': '「大きいのあった〜！」こうちゃんは、うれしそうに見せてくれました。',
  '水色のガラス玉': '「きらきら！」こうちゃんは、光にかざして見ています。',
  '黄色い花': '「おはな！」こうちゃんは、大事そうに持っています。',
  'ふしぎな形の枝': '「これなに？」こうちゃんは、くるくる回して見ています。',
};

/* アイテムの名前から、こうちゃんのひとことを取り出す

   対応表に無い名前のときは空文字を返す
   画面のほうは v-if で見ているので、その行はまるごと出ない
   （あとからひとことの無いアイテムを足しても、空の行が残らないようにするため）
*/
function itemReaction(itemName: string) {
  return itemReactions[itemName] ?? '';
}

/* その場所ではじめて遊んだときに、アイテムが見つかる確率（60%） */
const firstVisitItemFindChance = 0.6;

/* 場所で遊んだときに、その場所のアイテムが見つかるか判定する

   ・どちらの行動を選んでも、条件は同じ
   ・その場所ではじめて遊んだとき … 60%で見つかる
   ・前にその場所で遊んだのに、まだ見つけていないとき … かならず見つかる
     （運がわるくても、2回目でかならず取れるようにするための救済）
   ・もう見つけているとき … 何もしない（抽選もしない）

   ※ かならず finishPlayAction() より前に呼ぶ
     finishPlayAction() の中でその場所が探検済みになるので、
     あとから呼ぶと、はじめての場所でも「2回目」あつかいになってしまう
*/
function tryCollectPlaceItem(place: ItemPlace) {
  const itemName = placeItems[place];

  if (collectedItems.value.includes(itemName)) {
    return;
  }

  // 探検済みなら抽選せずに見つかる（|| なので、そのときは Math.random() も呼ばない）
  const isFound = isVisited(place) || Math.random() < firstVisitItemFindChance;

  if (!isFound) {
    return;
  }

  addCollectedItem(itemName);
}

/* ランダムイベント
   （通常行動中に起きる、ちいさなできごと）

   5回に1回くらい（20%）だけ起こり、
   8種類の中から1つが選ばれる

     1 飛行機を見つける      … こうちゃんの機嫌 +5
     2 急に「だっこ！」      … 親の体力 -5
     3 ねこを見つける        … こうちゃんの機嫌 +5
     4 急に走り出す          … 親の余裕 -6
     5 ちょうちょ            … こうちゃんの機嫌 +4
     6 落ち葉を踏む          … こうちゃんの機嫌 +5
     7 靴に砂が入る          … 親の余裕 -3
     8 水たまりで大はしゃぎ  … こうちゃんの機嫌 +5 ／ 親の余裕 -3

   うれしいことが4つ・親がつかれることが3つ・その両方が1つ（8）という組み合わせ
   どれも小さな数字にしてあるので、出る順番で有利不利が決まってしまうことはない

   ※ ここに書く数字は「このできごとだけの増減」
     中央の「今回の変化（合計）」は行動ぜんぶを足した数なので、
     たとえば 一緒にすべる（親の体力 -14）＋ 急に「だっこ！」（-5）なら
     合計は -19 になる

   ※ どのイベントでも addMinutes() は呼ばない
     「通常行動をしている、その最中に起きたこと」という扱いなので、
     時間は通常行動のぶんだけ進む

   ※ 専用画面へ移動する「とつぜんのできごと」とは別物
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

  // ① 飛行機を見つける
  if (eventNumber === 0) {
    childMood.value += 5;
    randomEventText.value = '「ひこうき！」こうちゃんは、うれしそうに空を見上げています。';
    addRandomEventEffect('こうちゃんの機嫌', 'childMood', 5);
    return;
  }

  // ② 急に「だっこ！」
  if (eventNumber === 1) {
    parentEnergy.value -= 5;
    randomEventText.value = 'こうちゃんが急に「だっこ！」と言い出しました。';
    addRandomEventEffect('親の体力', 'parentEnergy', -5);
    return;
  }

  // ③ ねこを見つける
  if (eventNumber === 2) {
    childMood.value += 5;
    randomEventText.value = '「ねこちゃん！」こうちゃんは、うれしそうに指をさしました。';
    addRandomEventEffect('こうちゃんの機嫌', 'childMood', 5);
    return;
  }

  // ④ 急に走り出す
  if (eventNumber === 3) {
    parentCalm.value -= 6;
    randomEventText.value = 'こうちゃんが急に走り出して、ちょっとヒヤッとしました！';
    addRandomEventEffect('親の余裕', 'parentCalm', -6);
    return;
  }

  // ⑤ ちょうちょ
  if (eventNumber === 4) {
    childMood.value += 4;
    randomEventText.value = '「ちょうちょ！」こうちゃんは、うれしそうに追いかけています。';
    addRandomEventEffect('こうちゃんの機嫌', 'childMood', 4);
    return;
  }

  // ⑥ 落ち葉を踏む
  if (eventNumber === 5) {
    childMood.value += 5;
    randomEventText.value = '「カサカサする！」こうちゃんは、何度も落ち葉を踏んでいます。';
    addRandomEventEffect('こうちゃんの機嫌', 'childMood', 5);
    return;
  }

  // ⑦ 靴に砂が入る
  if (eventNumber === 6) {
    parentCalm.value -= 3;
    randomEventText.value = '「砂はいっちゃった〜」こうちゃんは、くつを見ながら立ち止まりました。';
    addRandomEventEffect('親の余裕', 'parentCalm', -3);
    return;
  }

  // ⑧ 水たまりで大はしゃぎ（良い面と悪い面の両方があるイベント）
  //   ここまでの7つに当てはまらなかった＝eventNumber が 7 のとき
  //   2つステータスが動くので、しるしも2つ並べる
  childMood.value += 5;
  parentCalm.value -= 3;
  randomEventText.value = '「みずたまり！」こうちゃんは、楽しそうにバシャバシャしています。';
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

   ※ いやいやをなだめる行動ととつぜんのできごとでは呼ばれない
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

/* いやいや発生の演出を出しておく時間（ミリ秒）
   1000 で1秒。ここだけ書きかえれば、出ている長さを調整できる */
const tantrumAlertDuration = 2000;

/* 「あとで消す」の予約票（公園BGMの予約票と同じ考え方）

   null は「予約していない」という意味
   setTimeout() は予約すると番号を返してくれるので、それを取っておく
   （あとで「やっぱり消す」と取り消すのに必要）
*/
let tantrumAlertTimer: ReturnType<typeof setTimeout> | null = null;

/* いやいや発生の演出をすぐ消して、予約も取り消す（後始末）

   ・「もう一度あそぶ」でタイトルへ戻るとき
   ・ページから離れるとき
   に呼んで、前の演出やタイマーが残らないようにする
*/
function hideTantrumAlert() {
  tantrumAlertVisible.value = false;

  if (tantrumAlertTimer === null) {
    return;
  }

  clearTimeout(tantrumAlertTimer);
  tantrumAlertTimer = null;
}

/* いやいや発生の演出を出して、約2秒後にひとりでに消す

   ※ 止めるのは「演出」だけで、ゲームの進みは止めない
     結果メッセージやステータスの変化は今までどおりすぐ処理され、
     このオーバーレイが少しのあいだ、上に重なって出るだけ
*/
function showTantrumAlert() {
  // 前の予約が残っていたら取り消す
  // （残したままだと、古いタイマーが新しい演出を途中で消してしまう）
  hideTantrumAlert();

  tantrumAlertVisible.value = true;

  tantrumAlertTimer = setTimeout(() => {
    tantrumAlertTimer = null;
    tantrumAlertVisible.value = false;
  }, tantrumAlertDuration);
}

/* いやいやの理由を決める（新しいいやいやが起きると決まったあとに、1回だけ呼ぶ）

   ※ checkTantrum() の「いやいやが起きる確率」とは別もの
     あちらは「そもそも泣きだすか」、こちらは「泣きだした理由はどれか」を決める

   ■ 重み付きのくじ引き

     4つの理由に「出やすさ（weight）」の数を付けて、くじ引きをする
     たとえば weight が つかれた 5／おなかすいた 4／悔しい 3／まだ遊びたい 2 なら、
     くじは全部で 5 + 4 + 3 + 2 = 14 本
       つかれた     … 14本中 5本（約36%）
       おなかすいた … 14本中 4本（約29%）
       悔しい       … 14本中 3本（約21%）
       まだ遊びたい … 14本中 2本（約14%）
     weight が大きいほど出やすいが、小さくても0でなければ出ることがある
     （同じ状態でも、毎回同じ理由になるわけではない）

   ■ 出やすさの決めかた
     tired        … 体力が低いほど出やすい
     hungry       … 11:00をすぎたら出る（それより前は0＝出ない）
     frustrated   … 機嫌が低いほど出やすい
     wantMorePlay … 11:00をすぎたら出る（それより前は0＝出ない）。元気が残っているほど出やすい

     ※ 11:00より前に「まだ遊びたい」を出さないのは、
       まだ時間がたっぷりあって、だれも「そろそろ帰ろう」と言っていないのに
       「まだあそぶー！」とぐずるのは不自然なため
       お昼が近づいて、帰る時間が気になりだす 11:00 から出るようにしている
       （checkTantrum() も「11:00をすぎたら『おなかすいた』『まだ帰りたくない』で
         ぐずることがある」という考え方になっている）
     ※ そのため 11:00より前のいやいやは、つかれた か 悔しい のどちらかになる
*/
function chooseTantrumReason(): TantrumReason {
  const isAfterEleven = currentMinutes.value >= 11 * 60;

  // ① つかれた：体力が低いほど出やすい
  let tiredWeight = 1;

  if (childEnergy.value <= 30) {
    tiredWeight = 5;
  } else if (childEnergy.value <= 50) {
    tiredWeight = 3;
  }

  // ② おなかすいた：11:00をすぎたら出やすい（それより前は出ない）
  const hungryWeight = isAfterEleven ? 4 : 0;

  // ③ うまくできなくて悔しい：機嫌が低いほど出やすい
  let frustratedWeight = 1;

  if (childMood.value <= 30) {
    frustratedWeight = 5;
  } else if (childMood.value <= fussMoodLine) {
    frustratedWeight = 3;
  }

  // ④ まだ遊びたい：11:00をすぎて、帰る時間が近づいてきたら出る（それより前は出ない）
  //    元気が残っているほど「まだあそぶー！」になりやすい
  let wantMorePlayWeight = 0;

  if (isAfterEleven) {
    wantMorePlayWeight = 2;

    if (childEnergy.value >= 50) {
      wantMorePlayWeight += 2; // まだ元気がある
    }
  }

  const candidates: { reason: TantrumReason; weight: number }[] = [
    { reason: 'tired', weight: tiredWeight },
    { reason: 'hungry', weight: hungryWeight },
    { reason: 'frustrated', weight: frustratedWeight },
    { reason: 'wantMorePlay', weight: wantMorePlayWeight },
  ];

  // くじの本数の合計（つかれた・悔しい は最低でも1ずつあるので、0にはならない）
  let totalWeight = 0;

  for (const candidate of candidates) {
    totalWeight += candidate.weight;
  }

  // 0以上「合計」未満のランダムな数を出して、前から順に見ていく
  // ・その理由の weight より小さければ、その理由に決まり
  // ・大きければ、weight のぶんを引いて次の理由へ
  //   例）合計14で 7.2 が出たら … つかれた(5)より大きい → 引いて 2.2
  //                               → おなかすいた(4)より小さい → おなかすいた に決まり
  // ※ weight が 0 の理由は「小さければ」に当てはまらないので、選ばれない
  let randomNumber = Math.random() * totalWeight;

  for (const candidate of candidates) {
    if (randomNumber < candidate.weight) {
      return candidate.reason;
    }

    randomNumber -= candidate.weight;
  }

  // 小数の計算の誤差でここまで来てしまったときのための念のため（ふつうは通らない）
  // つかれた は、どの時間でも候補に入っている理由なので、これを返しておく
  return 'tired';
}

/* いやいや判定
   「こうちゃんの体力」「こうちゃんの機嫌」「今の時間」から
   いやいやが起きる確率を計算して、その確率で発生させる
   ※ 体力が71以上のときは、いやいやは起こらない
   ※ ここで計算するのは「起きるかどうか」の確率だけ
     起きると決まったあとで、「なぜ泣いているか」を chooseTantrumReason() で別に決める
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

  /* ここまで来た＝新しいいやいやが起きると決まった
     このあとで初めて「なぜ泣いているか」を抽選する（上の確率の計算とは別の抽選）

     ※ いやいや発生で機嫌が -15 される（この関数の下のほう）より前に決める
       泣きだす前の様子（つかれていた・おなかがすいていた…）で理由を選びたいため
     ※ 抽選に外れた（いやいやが起きなかった）ときは、上の return で終わるので
       ここは通らず、tantrumReason も変わらない
     ※ すでにいやいや中のときも、関数のいちばん上で return しているので、
       同じいやいやのあいだに理由が引きなおされることはない */
  // 前のいやいやのレベル・対応の記録・ナイス対応が残らないように、まっさらに戻してから
  // 新しいいやいやの理由を決める（レベルはかならず 1＝ぐずぐず から始まる）
  resetTantrumState();
  tantrumReason.value = chooseTantrumReason();

  // いやいや発生音「ポヨヨン……」
  // 抽選に当たって、新しいいやいやが始まったこの瞬間だけ鳴らす
  // ※「少し待ってみる」に失敗して同じいやいやが続くときは、
  //   関数のいちばん上（isTantrum が true）で return しているので鳴らない
  playTantrumSound();

  // 「いやいや発生！」のオーバーレイを約2秒だけ出す
  // 効果音と同じで、新しいいやいやが始まったこの瞬間だけの演出
  // ※ 見た目だけの追加なので、このあとの処理はいつもどおりすぐ進む
  showTantrumAlert();

  /* BGMを止めて、いやいや発生の結果カードを「無音」にする

     こうちゃんが泣きだした場面なので、
     結果を読んでいるあいだは楽しいBGMを流さず、
     しんと静かにして「たいへんなことが起きた」を伝える

     ※ pause ではなく stop（先頭へ戻す）にしている
       いやいやが終わって公園へ戻るときは、曲の続きからではなく
       また最初から鳴らしたいため
       （いやいやをはさんで場面が変わったので、
         曲も「仕切りなおし」にしたほうが切りかわった感じが出る）

     ※ 公園BGMとこもれびの広場BGMの両方に声をかける
       いやいやは、どの場所で行動しても起こる
       すべり台なら公園BGMが、秘密の場所ならこもれびの広場BGMが鳴っているので、
       「いま鳴っているほう」を調べなくてよいように、両方止めてしまう
       （鳴っていない曲に stop を呼んでも、何も起きないだけなので安全）

       秘密の場所も、いやいやが起きたときだけは特別あつかいしない
       泣きだした場面で楽しい曲が流れつづけると、
       「たいへんなことが起きた」が伝わらなくなってしまうため */
  stopParkBgm();
  stopSecretBgm();

  childMood.value -= 15;
  parentCalm.value -= 12;

  tantrumText.value = 'こうちゃんが「いやー！」と、その場にぺたんと座りこんでしまいました。';
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
     BGMは前の曲を止めてから、少しあとにGAME OVER BGMを鳴らす（playGameOverBgmSoon()）
*/
function checkGameOver() {
  // すでにGAME OVERになっているときは、理由を上書きしない
  if (currentEvent.value === 'gameOver') {
    return;
  }

  /* ※ 下の3つは、あてはまった1つだけが実行されて return する
       （いちばん上に「すでにGAME OVERなら return」もあるので、
        BGMを止める処理が動くのも1回だけ）

     BGMは、それまで鳴っていたかもしれない曲（公園・秘密の場所・いやいや・リザルト）をぜんぶ止める
     いやいやタイム中でも、だっこで親の体力が0になるなどでGAME OVERになるため
     秘密の場所で親の体力が0になることもあり、そのときGAME OVER画面へ移ったあとも
     こもれびの広場BGMが鳴りつづけないようにする
     リザルトBGMはふつうGAME OVERと同時には鳴らないが、
     結果画面の曲どうし（リザルトBGMとGAME OVER BGM）が重ならないように、念のため止めておく
     （鳴っていない曲に stop を呼んでも、何も起きないだけなので安全）

     止めたあとで playGameOverBgmSoon() を呼び、
     少し無音の間をおいてから、GAME OVER画面専用のBGMを鳴らしはじめる
     ・画面は、currentEvent を 'gameOver' にした時点ですぐ切りかわる（待つのは音だけ）
     ・同じ行動のあとに checkGameOver() がもう一度呼ばれても、
       いちばん上の「すでにGAME OVERなら return」で止まるので、予約は1回しかされない
       （playGameOverBgmSoon() の中でも、前の予約を取り消してから予約しなおしている）

     どの理由でも、いやいや発生の演出（hideTantrumAlert）は必ず消す
     いやいやが起きた行動でそのままGAME OVERになることがあり、
     消さないとGAME OVER画面の上に「いやいや発生！」が重なって残ってしまう */

  // ① 親の体力が0以下
  if (parentEnergy.value <= 0) {
    gameOverTitle.value = '親の体力が限界！';
    gameOverMessage.value = 'もうこれ以上は動けません……。こうちゃんを連れて、公園から撤退しました。';
    currentEvent.value = 'gameOver';
    stopParkBgm();
    stopSecretBgm();
    stopTantrumBgm();
    stopResultBgm();
    hideTantrumAlert();

    // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
    // （行動の途中でGAME OVERになるので、前の画面で選んでいた番号が残っている）
    selectedCommandIndex.value = 0;

    // 少し無音の間をおいてから、GAME OVER画面専用のBGMを鳴らす
    playGameOverBgmSoon();
    return;
  }

  // ② 親の余裕が0以下
  if (parentCalm.value <= 0) {
    gameOverTitle.value = '親の余裕がなくなった！';
    gameOverMessage.value = '親の心の余裕がなくなってしまいました。今日はここで公園探検を終了します。';
    currentEvent.value = 'gameOver';
    stopParkBgm();
    stopSecretBgm();
    stopTantrumBgm();
    stopResultBgm();
    hideTantrumAlert();

    // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
    // （行動の途中でGAME OVERになるので、前の画面で選んでいた番号が残っている）
    selectedCommandIndex.value = 0;

    // 少し無音の間をおいてから、GAME OVER画面専用のBGMを鳴らす
    playGameOverBgmSoon();
    return;
  }

  // ③ こうちゃんの体力が0以下（強制帰宅エンド）
  if (childEnergy.value <= 0) {
    gameOverTitle.value = 'こうちゃん電池切れ！';
    gameOverMessage.value = 'たくさん遊んで、こうちゃんはもうクタクタ。だっこで公園をあとにしました。';
    currentEvent.value = 'gameOver';
    stopParkBgm();
    stopSecretBgm();
    stopTantrumBgm();
    stopResultBgm();
    hideTantrumAlert();

    // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
    // （行動の途中でGAME OVERになるので、前の画面で選んでいた番号が残っている）
    selectedCommandIndex.value = 0;

    // 少し無音の間をおいてから、GAME OVER画面専用のBGMを鳴らす
    playGameOverBgmSoon();
    return;
  }
}

/* とつぜんのできごとの抽選

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
   ⑧ とつぜんのできごとが起きるか抽選する（起きるなら予定表に書くだけ）
   ※ いやいやをなだめる行動では呼ばない（ランダムイベントを起こさないため）
   ※ とつぜんのできごとの行動でも呼ばない（とつぜんのできごとが連続で起きないようにするため）

   ⑦を⑥の次に置いているので、
   ランダムイベントの「だっこ！」で親の体力が0になった場合も、
   いやいや発生で親の余裕が0になった場合も、まとめてGAME OVERになる

   ③がいやいや判定より前にあるのもポイント
   下がったあとの機嫌でいやいやを判定するので、
   「疲れて機嫌もわるい」ときほど、ちゃんといやいやが起きやすくなる
*/
function finishPlayAction(place: GameEvent) {
  playCount.value += 1;
  addVisitedPlace(place);
  runRandomEvent();
  dropMoodWhenTired();
  checkTantrum();
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  /* ⑧ とつぜんのできごとの抽選（いちばん最後）

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

/* ============================================================
   画面の切りかえ（A画面 ⇄ B画面 ⇄ ゲーム画面）のフェード

   画面そのものの出し分けは、今までどおり v-if / v-else-if
   そこへ <Transition name="screen-fade" mode="out-in"> をかぶせて、
   「前の画面が短く消える → 次の画面が短く出る」ようにしてある
   （画面のほうは、template の <main class="game"> のすぐ中を見ること）

   ここにあるのは、そのフェードに合わせて必要になった2つの世話だけ

   ① フェード中は、キーの操作を受けつけない（→ isScreenChanging）
   ② 次の画面が出おわったら、フォーカスを当てなおす（→ handleScreenEnterEnd）

   ■ ①が要る理由

     ボタンを押したしゅんかんに、中身（state）はもう次の画面のものになる
     でも目に見えているのは、消えかけの前の画面

     このあいだにEnterを押せてしまうと、
     「はじめる」を押した直後に、見えていないB画面の「きょうのおやつを選ぶ」まで
     続けて押したことになってしまう

     マウスのほうは、消えかけの画面を押せないようにするCSS
     （.screen-fade-leave-active の pointer-events: none）で止めている
     キーは window でまとめて受け取っていて、画面の外の話なので、
     こちらの目じるしで止める

   ■ ②が要る理由

     mode="out-in" では、次の画面はフェードアウトが終わってから作られる
     そのため、ボタンを押した直後に（nextTick で）フォーカスを当てようとしても、
     行き先のボタンはまだ画面に無い
     そこで「次の画面が出おわった」合図（@after-enter）を待ってから当てている
   ============================================================ */

/* いま画面がフェードで切りかわっている最中かどうか

   true になるのは、前の画面が消えているあいだだけ
   （次の画面が出てくるときは、もう押して大丈夫なので false に戻す） */
const isScreenChanging = ref(false);

/* 前の画面が、消えはじめたとき

   el … これから消えていく画面（Vueがわたしてくれる）

   キーの受付を止めるほかに、もう1つだけ世話をしている
   消えていく画面のボタンにフォーカスが残っていると、
   そのボタンはEnterでもう一度押せてしまう（ブラウザのふつうの動き）
   マウスのほうはCSSで押せなくしてあるので、こちらも合わせて外しておく

   外したフォーカスは、次の画面が出おわったときに
   handleScreenEnterEnd() がメインのボタンへ当てなおしてくれる */
function handleScreenLeaveStart(el: Element) {
  isScreenChanging.value = true;

  const active = document.activeElement;

  if (active instanceof HTMLElement && el.contains(active)) {
    active.blur();
  }
}

/* 前の画面が、消えおわったとき（次の画面は、このすぐあとに出てくる） */
function handleScreenLeaveEnd() {
  isScreenChanging.value = false;
}

/* 次の画面が、出おわったとき

   A画面なら「はじめる」、B画面なら「きょうのおやつを選ぶ」、
   あそびかた画面なら「← ひとつ前の画面へ戻る」、
   おやつ選択画面なら最初のおやつ「🍇 グミ」へフォーカスを当てる
   ゲーム画面のときは、focusTitleMainButton() の中で何も起きない
   （getTitleFocusItems() が、ゲーム中は空っぽを返すため）

   ※ あそびかた画面からB画面へ戻ったときは、ほかの画面から戻ったときと同じく
     B画面のメインのボタン「きょうのおやつを選ぶ」へ当てる（いちばん下の focusTitleMainButton()）

   ※ ページを開いた1回目は、ここは通らない（<Transition> は最初の表示では動かないため）
     そのときは onMounted の focusTitleMainButton() が当ててくれる */
function handleScreenEnterEnd() {
  /* ここまで来ればフェードは終わっているので、キーの受付も念のため戻しておく
     （ふつうは、ひとつ上の handleScreenLeaveEnd() でもう戻っている） */
  isScreenChanging.value = false;

  /* あそびかた画面は、おやつ選択画面より先に見る（画面の出し分けと同じ順番）

     縦に長い説明書なので、いちばん上の「← ひとつ前の画面へ戻る」へ当てる
     ここにフォーカスがあれば、そのまま Enter で戻れるし、
     ↑↓ もふつうのスクロールとして使える
     （@after-enter は画面が出おわってから届くので、ボタンはもう画面にある） */
  if (isHowToPlayOpen.value && !gameStarted.value) {
    howToBackButtonRef.value?.focus();
    return;
  }

  /* おやつ選択画面のときだけ、当てる先がボタン3つの並びではなく
     おやつのカードなので、専用の関数にまかせる

     gameStarted もいっしょに見ているのが大事
     isSnackSelectionOpen は公園へ出発したあとも true のまま残るので、
     これだけで見分けると、ゲーム画面が出たあとにも
     もう画面に無いおやつのカードをさがしにいってしまう */
  if (isSnackSelectionOpen.value && !gameStarted.value) {
    focusFirstSnackOption();
    return;
  }

  focusTitleMainButton();
}

/* 起動画面の「▶ はじめる」

   この画面がある理由はただ1つ、タイトルBGMを鳴らすため

   ブラウザには「ユーザーがまだ一度も触っていないページでは
   勝手に音を鳴らしてはいけない」という決まりがある
   ページを開いた直後に鳴らそうとしても止められてしまうので、
   ボタンを1回押してもらい、その操作をきっかけに鳴らしはじめる

   ※ ここでは決定音を鳴らさない
     （曲が鳴りはじめること自体が、押せたことの合図になる）

   曲は少しだけ間を空けてから鳴らしはじめる
   押した瞬間にいきなり始まると唐突に聞こえるため
   （待つのは音だけで、画面の切り替えはこのあとすぐ行う）
*/
function enterTitle() {
  playTitleBgmSoon();

  titleEntered.value = true;

  /* B画面のメインのボタン「きょうのおやつを選ぶ」へのフォーカスは、ここでは当てない

     フェード（mode="out-in"）が終わるまで、B画面はまだ作られていないため
     フェードが終わったときに handleScreenEnterEnd() が当ててくれる
     （キーボードだけでも、そのまま Enter で先へ進める） */
}

/* B画面（タイトル画面）から、A画面（起動画面）へ戻る

   B画面ではタイトルBGMが鳴っているので、戻る前にかならず止める
   （A画面は「まだ音を鳴らしていない」画面なので、鳴ったまま戻ると不自然）
   cancelTitleBgmStart() … 「あとで鳴らす」の予約が残っていても取り消す

   titleEntered を false に戻すと、A画面（起動画面）が表示される
   もう一度「はじめる」を押せば、enterTitle() でまたタイトルBGMが鳴る
*/
function goBackToBoot() {
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  cancelTitleBgmStart();
  stopTitleBgm();

  /* きょうのおやつは、いちばん最初の画面まで戻ったら選びなおしてもらう

     A画面まで戻るのは「最初から始め直す」ことなので、
     前に選んだグミ・せんべいが残っていると、
     次に公園へ行くときに知らないうちに持たされてしまう
     （B画面 ⇄ おやつ選択画面の行き来では、わざと残している） */
  selectedSnackIds.value = [];
  isSnackSelectionOpen.value = false;

  /* あそびかた画面も閉じた状態に戻しておく
     （いまの画面からは開いたままここへ来ることはないが、
       A画面へ戻ったのに、中ではあそびかたが開いたまま、という状態を残さないため） */
  isHowToPlayOpen.value = false;

  /* 画面のほうは、この1行だけで切りかわる（表示用のstateはこれ以外いじらない）
     BGMを止める上の2行も、音を止めるだけで画面の中身にはさわらないので、
     B画面は中身がそろったまま、まるごとフェードアウトしていく */
  titleEntered.value = false;

  /* A画面のメインのボタン「はじめる」へのフォーカスは、
     フェードが終わってから handleScreenEnterEnd() が当てる */
}

/* ゲーム開始（＝公園へ出発する）

   呼ばれるのは、おやつ選択画面の「このおやつで公園へ行く！」からだけ
   （B画面の「きょうのおやつを選ぶ」は、ひとつ手前の openSnackSelection() を呼ぶ）

   ここが「ゲーム開始前」と「ゲーム中」の境目なので、
   BGMの切り替えも gameStarted も、ぜんぶこの1か所でまとめて行う
   おやつ選択画面のために同じ内容をコピーした関数は作らない
*/
function startGame() {
  // 決定音「ポン♪」（おやつ選択画面の「このおやつで公園へ行く！」）
  playDecisionSound();

  /* BGMをタイトル用から公園用へ切り替える

     2曲が重ならないように、かならず
     「タイトルBGMを止める → 公園BGMを鳴らす」の順番にする
     タイトルBGMは stopTitleBgm() で先頭に戻しておくので、
     次にタイトル画面へ戻ったときは、また最初から鳴る

     公園BGMは少しだけ間を空けてから鳴らしはじめる
     すぐ鳴らすと、決定音「ポン♪」が曲にかき消されてしまうため
     （待つのは音だけで、画面の切り替えはこのあとすぐ行う）

     ブラウザは「ユーザーが操作する前」に音を鳴らすのを止めることがある
     ここはプレイヤーが「このおやつで公園へ行く！」を決定した瞬間なので、
     このタイミングで始めるのが確実
  */
  stopTitleBgm();
  playParkBgmSoon();

  gameStarted.value = true;

  // 新しいプレイなので「最後に入った場所」も忘れる（resetGame() でも空にしているが、はじめての公園入口は必ず先頭から）
  lastSelectedPlace.value = null;

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ============================================================
   おやつ選択画面（B画面 → おやつ選択 → ゲーム）

   B画面の「きょうのおやつを選ぶ」を押しても、まだ公園へは出発しない
   あいだに「きょうのおやつ」を選ぶ準備画面をはさんでいる

   ■ ここではBGMをいっさいさわらない

     おやつ選択画面は「ゲーム開始前」の画面なので、
     B画面と同じようにタイトルBGMが鳴ったままでよい
     ・stopTitleBgm()    … 呼ばない
     ・playParkBgmSoon() … 呼ばない
     ・gameStarted       … true にしない

     サウンドON/OFFのほうも、何も直さなくてそのまま動く
     toggleSound() は「titleEntered && !gameStarted なら
     タイトルBGMを再開する」と決めていて、
     おやつ選択画面もその条件にそのまま当てはまるため
   ============================================================ */

/* B画面の「きょうのおやつを選ぶ」

   やることは、おやつ選択画面を開くことだけ
   （公園へ出発するのは、この先の confirmSnacksAndStartGame()） */
function openSnackSelection() {
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  isSnackSelectionOpen.value = true;

  /* 最初のおやつ「🍇 グミ」へのフォーカスは、ここでは当てない

     フェード（mode="out-in"）が終わるまで、おやつのカードはまだ作られていない
     フェードが終わったときに handleScreenEnterEnd() が当ててくれる
     （A→B、B→A のときと、まったく同じ考えかた） */
}

/* おやつ選択画面の「← ひとつ前の画面へ戻る」（B画面へ戻る）

   選んだおやつは、わざと消さずに残しておく
   もう一度「きょうのおやつを選ぶ」を押したときに、
   さっき選んだグミ・せんべいがそのまま入っているようにしたいため
   （ぜんぶ選びなおしになるのは、A画面まで戻ったときだけ）

   タイトルBGMも鳴ったままでよい（ここもまだゲーム開始前の画面） */
function closeSnackSelection() {
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  isSnackSelectionOpen.value = false;

  /* B画面のメインのボタン「きょうのおやつを選ぶ」へのフォーカスは、
     フェードが終わってから handleScreenEnterEnd() が当てる */
}

/* ============================================================
   あそびかた画面（B画面 → あそびかた → B画面）

   B画面の「？ あそびかた」から開く、説明書のページ
   ルールと考えかたは説明するが、攻略の正解（相性表・成功率・解放条件など）は書かない

   ■ 別のページ（route）にはしていない

     /howto のような別ページにすると、ページが作り直されるので
     鳴っているタイトルBGMが止まってしまう（onUnmounted でぜんぶ止めているため）
     同じページの中で v-if を切りかえるだけにして、
     A画面・B画面・おやつ選択画面と同じ screen-fade でフェードさせている

   ■ ここではBGMをいっさいさわらない（おやつ選択画面と同じ）

     ・stopTitleBgm() / playTitleBgmSoon() … 呼ばない
     ・gameStarted / titleEntered          … 変えない
     なので、B画面 → あそびかた → B画面 のあいだ、タイトルBGMは途切れずに流れつづける

     サウンドON/OFFも、何も直さなくてそのまま動く
     toggleSound() は「titleEntered && !gameStarted ならタイトルBGMを再開する」ので、
     あそびかた画面もその条件にそのまま当てはまる
   ============================================================ */

/* B画面の「？ あそびかた」

   やることは、あそびかた画面を開くことだけ
   「← ひとつ前の画面へ戻る」へのフォーカスは、フェードが終わったときに
   handleScreenEnterEnd() が当ててくれる（おやつ選択画面を開くときと同じ） */
function openHowToPlay() {
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  isHowToPlayOpen.value = true;
}

/* あそびかた画面の「← ひとつ前の画面へ戻る」（Escape もここを呼ぶ）

   B画面へ戻るだけ。タイトルBGMは鳴ったままでよい
   B画面のメインのボタンへのフォーカスは、フェードが終わってから handleScreenEnterEnd() が当てる */
function closeHowToPlay() {
  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  isHowToPlayOpen.value = false;
}

/* おやつのカードを押したとき（1回で選ぶ・もう1回で解除）

   ・まだ入れていないおやつ … バッグに入れる
   ・もう入れてあるおやつ   … バッグから出す

   同じおやつを2個入れないようにしているのは、この「入っていたら出す」の形そのもの
   入っているおやつをもう一度押しても、増えるのではなく減る

   ※ バッグがいっぱいのときに、まだ選んでいないおやつを押せないようにするのは
     画面のほう（カードの :disabled）にまかせている
     ここでも念のため、いっぱいのときは追加しないようにしておく

   event … そのカードの click イベント
           キーボードで押したのか、マウス・指で押したのかを見分けるのに使う */
function toggleSnackSelection(snackId: SnackId, event: MouseEvent) {
  // 決定音「ポン♪」（選ぶときも、解除するときも同じ音）
  playDecisionSound();

  if (isSnackSelected(snackId)) {
    // すでに入っているので、バッグから出す（＝選択を解除する）
    removeSnackFromBag(snackId);
    return;
  }

  // いっぱいのときは、これ以上入れない
  if (isSnackBagFull.value) {
    return;
  }

  selectedSnackIds.value.push(snackId);

  /* キーボードで選んで、バッグがいっぱいになった（＝2個目を選んだ）ときは、
     そのまま「このおやつで公園へ行く！」へカーソルを移す
     （あとは Enter / Space を押すだけで出発できる）

     ■ キーボードかどうかの見分けかた
       Enter / Space でボタンを押したときも click イベントが届くが、
       そのときの event.detail は 0 になる（マウスや指で押したときは 1 以上）

     ■ マウス・指で選んだときは動かさない
       マウスの人は、次に押したい場所へ自分でポインタを動かすので、
       カーソルだけが勝手に飛ぶと、かえって分かりにくくなるため

     ※ 解除したとき（上の return）と、1個目を選んだときは動かさない
       まだ出発できないので、続けておやつを選べるようにしておく */
  if (event.detail === 0 && canStartWithSnacks.value) {
    focusSnackGoButton();
  }
}

/* おやつ選択画面の「このおやつで公園へ行く！」

   2種類そろっていることを確かめてから、いつもの startGame() を呼ぶだけ
   （BGMの切り替えも gameStarted も、ぜんぶ startGame() の中のまま）

   ボタン自体も2種類そろうまで押せない（:disabled）ようにしてあるので、
   ここのチェックは念のためのもの
   キーボードやブラウザの機能から、思わぬ形で呼ばれても大丈夫にしておく

   isScreenChanging も見ているのは、フェード中の連打よけ
   押したしゅんかんに gameStarted は true になるが、
   目に見えているのはまだ消えかけのおやつ選択画面
   Enterを押しっぱなしにしたときなどに、
   そこからもう一度このボタンが押されてしまわないようにしている
   （キー操作をまとめて止める handleKeydown() と同じ目じるしを使う） */
function confirmSnacksAndStartGame() {
  if (!canStartWithSnacks.value) {
    return;
  }

  if (isScreenChanging.value) {
    return;
  }

  startGame();
}

/* おやつ選択画面が出おわったとき、最初のおやつ「🍇 グミ」へフォーカスを当てる

   A画面・B画面の focusTitleMainButton() と同じ役目だが、
   当てる先がボタン3つの並びではなく、v-for で作ったカードなので分けてある

   おやつは snacks 配列から作るので、ボタン1つずつに ref は付けていない
   入れもの（snackSelectionRef）の中の、最初の .snack-option を探して当てる
   こうしておけば、おやつが増えても直すところは無い

   :not(:disabled) を付けているのは、押せないカードを飛ばすため

   ふつうは、いちばん先にある 🍇 グミ がそのまま選ばれる
   ただし「チョコとせんべいを選ぶ → ひとつ前の画面へ戻る → もう一度おやつ選択へ」と
   戻ってきたときは、バッグがいっぱいなのでグミは押せない状態になっている
   押せないボタンは focus() してもフォーカスが当たらない（何も起きない）ので、
   そのときは押せるカード（＝もう選んであるチョコ）が選ばれるようにしておく

   ※ nextTick() で画面の書きかえを待つのは、こちらも同じ
   ※ 画面にまだカードが無いときは snackSelectionRef が null なので、
     ?. のおかげで何も起きずに終わる（無理にフォーカスしない） */
async function focusFirstSnackOption() {
  await nextTick();

  const firstSnackButton = snackSelectionRef.value?.querySelector<HTMLButtonElement>('.snack-option:not(:disabled)');

  firstSnackButton?.focus();
}

/* おやつ選択画面の「このおやつで公園へ行く！」へフォーカスを当てる
   （キーボードで2個目のおやつを選んだときに、toggleSnackSelection() から呼ばれる）

   focusFirstSnackOption() と同じく、入れもの（snackSelectionRef）の中から探して当てる

   ※ nextTick() で画面の書きかえを待ってから当てるのが大事
     2個目を選んだ直後は、ボタンにまだ disabled が付いたまま
     押せないボタンは focus() してもフォーカスが当たらないので、
     disabled が外れるのを待ってから当てる
   ※ ボタンが画面の下にかくれていても、focus() が見える位置までスクロールしてくれる */
async function focusSnackGoButton() {
  await nextTick();

  const snackGoButton = snackSelectionRef.value?.querySelector<HTMLButtonElement>('.snack-go:not(:disabled)');

  snackGoButton?.focus();
}

/* もうサウンドトラックのページへ移動しはじめたかどうか（連打よけ） */
let isLeavingPage = false;

/* サウンドトラックのページ（/soundtrack）へ移動する

   このボタンは起動画面（A画面）にある。まだ「はじめる」を押していないので、
   タイトルBGMは鳴っていないし、鳴らす予約（playTitleBgmSoon）もされていない
   ＝ enterTitle() は呼ばない・タイトルBGMも鳴らさない、まま /soundtrack へ移る

   念のため cancelTitleBgmStart() と stopTitleBgm() も呼んでいるが、
   A画面ではどちらも「鳴っていないものを止める」だけの空振り
   （将来ほかの画面からも呼んだときの保険として残してある）
*/
function goToSoundtrack() {
  /* もう移動をはじめているときは、何もしない

     ページが入れかわるときも短いフェードをはさむので、
     押したあとも、しばらくこのA画面が見えている
     そのあいだに続けて押されても、移動のお願いを2回出さないようにする

     ※ 画面に出す数字ではないので、ref ではなくふつうの入れものでよい */
  if (isLeavingPage) {
    return;
  }

  isLeavingPage = true;

  // 決定音「ポン♪」（ほかのボタンと同じ）
  playDecisionSound();

  cancelTitleBgmStart();
  stopTitleBgm();

  /* A画面の表示には、いっさいさわらない
     （タイトルやボタンを先に消さないので、A画面は中身がそろったままフェードアウトする）
     表示の後片づけは、ページが消えたあとにNuxtがやってくれる */
  navigateTo('/soundtrack');
}

/* 場所を移動する
   移動すると前の結果メッセージと変化量の表示は消す

   ※ BGMが変わるのは、秘密の場所へ行くときだけ
     すべり台・砂場・どんぐり・池・芝生広場は、ぜんぶ同じ公園のつづきなので
     公園BGMを鳴らしたままにする（場所を移るたびに曲が鳴りなおすと落ち着かない）
*/
function goToPlace(place: GameEvent) {
  // 決定音「ポン♪」（公園入口から各場所へ移動するとき）
  playDecisionSound();

  // 前の場所で開いたままのサブメニューが残らないように閉じる
  closeCareMenu();

  // 前の画面で止めていたマウス操作も戻す（止めるのは「← もどる」のあとや、公園入口へ戻ってきた直後の画面だけ）
  isCommandPointerPaused.value = false;

  resultMessage.value = '';
  statusChanges.value = null;
  currentEvent.value = place;

  // 公園入口に行がある場所なら、「最後に入った場所」として覚える（公園入口へ戻ったときのカーソル位置に使う）
  if (placeSelectionIndexes[place] !== undefined) {
    lastSelectedPlace.value = place;
  }

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;

  /* 秘密の場所へ入るときだけ、公園BGMからこもれびの広場BGMへ入れかえる

     かならず「公園BGMを止める → こもれびの広場BGMを鳴らす」の順番にする
     先に止めておかないと、待っている0.7秒のあいだ公園BGMが鳴りつづけ、
     2曲が重なってどちらもにごって聞こえてしまう

     stopParkBgm() は公園BGM1・BGM2の両方を止めてくれるので、
     いまどちらの時間帯かを気にしなくてよい

     こもれびの広場BGMは playSecretBgmSoon() で少し間を空けてから鳴らしはじめる
     ・決定音「ポン♪」が、曲の鳴りはじめにかき消されない
     ・いったん静かになるので「特別な場所へ入った」という感じが出る
     （待つのは音だけで、画面はこの上の行ですでに切りかわっている）

     ※ currentEvent を place にしたあとで呼ぶこと
       playSecretBgmSoon() は、鳴らす直前に
       「まだ秘密の場所にいるか」を currentEvent で確かめているため */
  if (place === 'secretSpot') {
    stopParkBgm();
    playSecretBgmSoon();
  }
}

/* 次の場所を選びに行く

   上から順番に見て、あてはまった時点で行き先が決まる
   ① GAME OVER中なら、どこへも動かさない
   ② いやいや中なら、まずはなだめる場面へ
   ③ いやいやが終わった直後なら、いまの時間に合う公園BGMへ戻す
   ④ 12:00を過ぎていたら、もう探検は続けられないのでゴールへ
   ⑤ 秘密の場所から出てきたなら、いまの時間に合う公園BGMへ戻す
   ⑥ 10:30を過ぎているのにBGM1のままなら、午前後半のBGM2へ切り替える
   ⑦ とつぜんのできごとの予定があれば、その専用画面へ
   ⑧ 何もなければ、いつもどおり公園入口へ（カーソルは、最後にいた場所のコマンドに合わせる）

   ⑦が④より下にあるのがポイント
   お昼を過ぎているのにとつぜんのできごとを始めてしまうと、
   「12:00までに帰る」というルールが崩れてしまう

   ⑤⑥も④より下に置くのが大事
   ゴールする直前（＝すぐ公園BGMを止める）のに公園BGMを鳴らしはじめると、
   一瞬だけ鳴って消える不自然な音になってしまう
*/
function goToNextPlace() {
  // GAME OVER後にうっかり別の画面へ動いてしまわないようにする
  if (currentEvent.value === 'gameOver') {
    return;
  }

  /* いま出ようとしている画面が「秘密の場所」だったかを、先に覚えておく

     このあと currentEvent を書きかえてしまうと、
     「さっきまで秘密の場所にいた」ことが分からなくなる
     こもれびの広場BGMを止めるのも、公園BGMへ戻すのも、この印を見て決める

     ※ 「← 場所選びにもどる」でも「次の場所を選ぶ」でも、
       秘密の場所から出る道はこの関数1本だけなので、ここで覚えれば足りる
       （休憩・おやつの結果の「← もどる」は場所を出ないので、この関数を通らない） */
  const leavingSecretSpot = currentEvent.value === 'secretSpot';

  /* 決定音「ポン♪」（次の場所を選ぶ／← 場所選びにもどる／次へ）

     ただし、このあと ④ でゴールへ向かうときは鳴らさない
     ゴールではファンファーレだけを聞かせたいので、決定音を重ねない
     （④に進むのは「いやいや中ではない」かつ「12:00を過ぎている」ときだけ）
  */
  if (isTantrum.value || !isTimeOver.value) {
    playDecisionSound();
  }

  resultMessage.value = '';
  statusChanges.value = null;
  isCareActionResult.value = false;

  // 前の画面で止めていたマウス操作も戻す（止めるのは「← もどる」のあとや、公園入口へ戻ってきた直後の画面だけ）
  isCommandPointerPaused.value = false;

  // サブメニュー「☕ ひとやすみ」も閉じておく
  // （サブメニューを開いたまま「← 場所選びにもどる」を押したときのため）
  closeCareMenu();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;

  /* 秘密の場所から出るので、こもれびの広場BGMを止める

     行き先（いやいやタイム・ゴール・とつぜんのできごと・公園入口）に関わらず、
     秘密の場所の画面を離れる時点で、この曲の出番は終わり
     ここでまとめて止めておくと、行き先ごとに止め忘れることがない

     ※ pause ではなく stop（先頭へ戻す）にしている
       もう一度秘密の場所へ来たときは、前回の続きではなく
       また曲の頭から鳴らしたいため

     ※ 「次に何を鳴らすか」は、このあと行き先が決まってから
       いやいやなら いやいやBGM、公園へ戻るなら時間に合った公園BGM、
       ゴールなら リザルトBGM と、行き先ごとにちがうため */
  if (leavingSecretSpot) {
    stopSecretBgm();
  }

  /* ② いやいや中なら、いやいやタイムの画面へ

     ここでいやいやBGMを先頭から鳴らしはじめる（フェードイン付き）

     公園BGMとこもれびの広場BGMは、いやいやが発生した瞬間（checkTantrum）に
     すでに stop して無音にしてあるので、ここでは止まったまま
     それでも念のためもう一度 stop を呼んでおく
     （いやいやタイムへ来る道はここ1本だが、
       万一どこかで鳴っていても、2曲が重ならないようにするため）

     ※ 秘密の場所で始まったいやいやでも、鳴らすのは いやいやBGM
       いやいやは「こうちゃんが泣いている場面」なので、
       どの場所で起きても同じ曲・同じ聞こえかたにそろえる
  */
  if (isTantrum.value) {
    stopParkBgm();
    stopSecretBgm();
    playTantrumBgm();

    currentEvent.value = 'tantrum';
    return;
  }

  /* ここから下は、いやいやが終わっている（isTantrum が false）とき

     いまいる画面がいやいやタイムなら、この「次の場所を選ぶ」が
     いやいやタイムの終わり＝いやいやBGMの終わり
     （だっこ・おやつ・お話・待つで isTantrum が false になった瞬間ではなく、
       結果の文章を読み終えて画面から出るここで止める）

     ・いやいやBGMは stop（先頭へ戻す）
       次のいやいやは、また曲の頭から始めたいため
     ・公園へ戻るときだけ、公園BGMを「また最初から」鳴らしはじめる
       （続きからではなく頭から）

       鳴らしかたは playParkBgmSoon()＝「このおやつで公園へ行く！」を押したときと同じ
       ・少し間（700ms）を空けてから鳴らしはじめる
         → 決定音「ポン♪」が曲の鳴りはじめにかき消されない
       ・そのあと無音からフェードインする
       こうすると「いやいやが終わって、また公園にもどってきた」という
       感じが、ゲームを始めたときとまったく同じ聞こえかたになる

     ※ 12:00を過ぎているときは公園BGMを鳴らさない
       このあとすぐ下の goToGoal() で止めることになり、
       一瞬だけ鳴って消える不自然な音になってしまうため
       （playParkBgmSoon() の中でも、待っているあいだに
         リザルト画面へ移っていたら鳴らさないようにしてある）
  */
  if (currentEvent.value === 'tantrum') {
    stopTantrumBgm();

    if (!isTimeOver.value) {
      playParkBgmSoon();
    }

    /* いやいやタイムを完全に出るので、いやいやの状態もここでまとめて片づける
       （理由・レベル・対応の記録・ナイス対応。中身は resetTantrumState() を参照）

       だっこ・おやつなどで いやいや が終わった瞬間ではなく、
       結果を読み終えたこのタイミングで戻すのがポイント（いやいやBGMを止めるのと同じ考え方）
       結果を読んでいるあいだは、カードの見出し（大いやいやタイム！など）とセリフをそのまま見せたいため

       ※ このあと同じ処理の中で、currentEvent が次の画面に変わる
         <Transition> で消えていくいやいやタイムの画面は、もう描きなおされないので、
         フェードアウトの途中で見出しやセリフ、「✨ ナイス対応！」だけが変わってガタつくことはない
         （この関数の上で resultMessage を空にしているのと同じ） */
    resetTantrumState();
  }

  if (isTimeOver.value) {
    goToGoal();
    return;
  }

  /* ⑤ 秘密の場所から、ふつうの公園へ戻ってきた

     ここまで来たということは
     ・いやいやではない（上の②で分かれている）
     ・12:00も過ぎていない（すぐ上の④で分かれている）
     ＝ これからも公園の探検が続く、ということ
     なので、こもれびの広場BGMから公園BGMへ戻す

     鳴らしかたは playParkBgmSoon()＝「このおやつで公園へ行く！」を押したときと同じ
     ・こもれびの広場BGMは、この関数の上のほうですでに止めてある
     ・少し間（700ms）を空けてから鳴らしはじめる
       → 決定音「ポン♪」が曲の鳴りはじめにかき消されない
       → いったん静かになるので「秘密の場所から出てきた」感じが出る
     ・そのあと無音からフェードインする

     ※ どちらの公園BGMへ戻るかは、playParkBgmSoon() にまかせる
       ここで park-bgm.mp3 に決め打ちしてはいけない
       実際に鳴らす playParkBgm() が、700ms後にそのときの時計を見て
       ・10:30より前  … park-bgm.mp3  （BGM1）
       ・10:30以降    … park-bgm2.mp3 （BGM2）
       を選んでくれる
       たとえば10:10に秘密の場所へ入って、中で20分遊んで10:30を過ぎていたら、
       出てきたときに鳴るのはBGM1ではなくBGM2になる

     ※ 12:00を過ぎているときは、ここまで来ない（すぐ上の④でゴールへ行く）
       ゴール直前に公園BGMを鳴らすと、
       一瞬だけ鳴って消える不自然な音になってしまうため

     ※ とつぜんのできごとの予定があるときも、ここを通ってよい
       救急車・てんとう虫・犬などは、どれも「ふつうの公園での出来事」なので、
       こもれびの広場BGMのままではなく公園BGMへ戻すのが自然 */
  if (leavingSecretSpot) {
    playParkBgmSoon();
  }

  /* ⑥ 10:30を過ぎていて、まだ午前前半のBGM1を鳴らしているなら、
     ここで午前後半のBGM2へ切り替える

     「10:30になった瞬間」ではなく、この
     「行動の結果を確認して、次へ進むタイミング」で切り替えるのがポイント
     たとえば10:15に20分かかる行動をして10:35になっても、
     結果カードを読んでいるあいだはBGM1のまま
     この「次の場所を選ぶ」を押したところで、BGM2へ変わる

     すでにBGM2になっているときは、中で何もしないで戻ってくるので、
     押すたびに曲が頭から鳴りなおすことはない
     （とつぜんのできごとへ進むときも、ここを通ってからなので公園BGM2が鳴る）

     ※ すぐ上の⑤（秘密の場所から出てきた）を通ったときは、ここは何もしない
       秘密の場所へ入るときに公園BGMを止めてあり、
       「いま鳴らしている公園BGM」（activeParkBgm）が無い状態になっているため
       曲を選ぶのは⑤で予約した playParkBgmSoon() の役目なので、
       ここで二重に鳴らしはじめてしまうことはない */
  switchParkBgmForCurrentTime();

  // とつぜんのできごとの予定があれば、その画面へ移動する
  // 移動したら予定表は空（null）に戻す
  // ※ ここで戻しておかないと、とつぜんのできごとが終わったあとに
  //   もう一度おなじ画面へ入ってしまう
  if (pendingSuddenEvent.value !== null) {
    currentEvent.value = pendingSuddenEvent.value;
    pendingSuddenEvent.value = null;
    return;
  }

  currentEvent.value = 'parkEntrance';

  // 公園入口のカーソルは、最後にいた場所のコマンドに合わせる
  // （遊んだあとの「次の場所を選ぶ」でも、何もせず「← 場所選びにもどる」でも、とつぜんのできごと・いやいやのあとでも同じ）
  restoreEntranceCursor();
}

/* ============================================================
   場所での行動（6か所 × 2コマンド）

   親の2つのステータスは、減る理由をわけてある
   ・親の体力 … 体をどれだけ使ったか（走る・だっこする・立ちっぱなし）
   ・親の余裕 … どれだけヒヤッとしたか（水辺・高い所・見失いそう）

   そのため、同じ「よく遊ぶ」コマンドでも場所によって中身がちがう
   ・池を近くで見る         … 体力 -13 ／ 余裕 -14（水があるので、いちばん気が張る）
   ・芝生広場で追いかけっこ … 体力 -15 ／ 余裕  -8（親もいっしょに走るので、体をいちばん使う）
   ・どんぐりを拾う         … 体力 -10 ／ 余裕  -3（しゃがんで拾うだけなので穏やか）

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

  tryCollectPlaceItem('slide');
  finishPlayAction('slide');
}

/* ② 下で見守る

   「いっしょにすべる」より軽い行動だが、親の余裕はあまり節約できない
   こうちゃんが手の届かない高い所へひとりでのぼっていくので、
   すぐそばで支えられる①よりも、かえって気が張る
   （ころんだときの「見守る」も同じ考えで、親の余裕がいちばん減る）

   そのぶん、親の体力と時間は①よりはっきり少なくすんでいる
*/
function watchSlide() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 12;
  childMood.value += 3;
  addOutingPoint('slide', 5);
  parentEnergy.value -= 8;
  parentCalm.value -= 9;
  addMinutes(15);

  resultMessage.value = '「みててー！」こうちゃんはてっぺんから手をふっています。下でハラハラしながら見守りました。';

  tryCollectPlaceItem('slide');
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

  tryCollectPlaceItem('sandbox');
  finishPlayAction('sandbox');
}

/* ② 砂のトンネルを作る

   山づくり（①）より軽いけれど、親子でいっしょに手を動かす「遊び」
   休むための行動ではないので、親の体力もきちんと減る
   （休みたいときは、別枠の「ひとやすみ」を使う）
*/
function buildSandTunnel() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 8;
  childMood.value += 4;
  addOutingPoint('sandbox', 4);
  parentEnergy.value -= 7;
  parentCalm.value -= 2;
  addMinutes(15);

  resultMessage.value = 'こうちゃんと一緒に砂のトンネルを作りました。向こう側から手が見えると、こうちゃんは大よろこびです！';

  tryCollectPlaceItem('sandbox');
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

  tryCollectPlaceItem('acornArea');
  finishPlayAction('acornArea');
}

/* ② どんぐりをころがして遊ぶ

   前はここに「木かげで少し休む」があったが、
   休む行動は別枠の「ひとやすみ」にまとめたので、
   この場所ならではの遊びに置きかえている
*/
function rollAcorns() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 7;
  childMood.value += 4;
  addOutingPoint('acornArea', 5);
  parentEnergy.value -= 5;
  parentCalm.value -= 2;
  addMinutes(15);

  resultMessage.value = '拾ったどんぐりを坂になった地面からころがして遊びました。こうちゃんは何度も追いかけています！';

  tryCollectPlaceItem('acornArea');
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

  tryCollectPlaceItem('pond');
  finishPlayAction('pond');
}

/* ② コイに餌をあげる */
function feedKoi() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 8;
  childMood.value += 6;
  addOutingPoint('pond', 7);
  parentEnergy.value -= 5;
  parentCalm.value -= 4;
  addMinutes(15);

  resultMessage.value = 'コイに餌をあげました。たくさんのコイが集まってきて、バシャンと水しぶきをたてながら餌を食べています。こうちゃんは大喜びです。';

  tryCollectPlaceItem('pond');
  finishPlayAction('pond');
}

/* ===== 芝生広場 ===== */

/* ① 追いかけっこする */
function playTagOnGrass() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 19;
  childMood.value += 8;
  addOutingPoint('grassArea', 10);
  parentEnergy.value -= 15;
  parentCalm.value -= 8;
  addMinutes(25);

  resultMessage.value = '芝生広場で、こうちゃんと元気いっぱい追いかけっこをしました。こうちゃんは笑いながら走り回っています！';

  tryCollectPlaceItem('grassArea');
  finishPlayAction('grassArea');
}

/* ② シャボン玉で遊ぶ

   軽い行動（②）の中では、いちばん機嫌が上がる遊び
   走り回らないので体力はあまり減らないが、
   ふわふわ飛ぶシャボン玉はこうちゃんのお気に入りなので、
   「体力が残っていないけれど機嫌を上げたい」ときの逃げ道になる
*/
function playWithBubbles() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 9;
  childMood.value += 7;
  addOutingPoint('grassArea', 6);
  parentEnergy.value -= 6;
  parentCalm.value -= 3;
  addMinutes(20);

  resultMessage.value = '芝生の上でシャボン玉を飛ばしました。ふわふわ飛んでいくシャボン玉を、こうちゃんは楽しそうに追いかけています。';

  tryCollectPlaceItem('grassArea');
  finishPlayAction('grassArea');
}

/* ===== こもれびの広場 ===== */

/* ① 木漏れ日の中を探検する */
function exploreSunlight() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 16;
  childMood.value += 10;
  addOutingPoint('secretSpot', 15);
  parentEnergy.value -= 14;
  parentCalm.value -= 4;
  addMinutes(25);

  resultMessage.value = '木漏れ日の中を歩いてみました。足元には小さな花や、きれいな葉っぱが落ちています。こうちゃんは宝物を探すように、夢中であたりを見ています。';

  tryCollectPlaceItem('secretSpot');
  finishPlayAction('secretSpot');
}

/* ② 広場の奥を見てみる

   広場のさらに奥を少し探して、木の根元で「ふしぎな形の枝」を見つける
   （前はここに「二人で景色をながめる」があったが、
     体力も余裕も回復する、ほとんど休憩の行動になっていた
     休む行動は別枠の「ひとやすみ」にまとめたので、
     ここは広場らしい「奥を探してみる」遊びに置きかえている）
*/
function exploreClearingDepths() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  childEnergy.value -= 10;
  childMood.value += 5;
  addOutingPoint('secretSpot', 9);
  parentEnergy.value -= 8;
  parentCalm.value -= 4;
  addMinutes(20);

  resultMessage.value = '広場の奥へ進んでみると、木の根元に変わった形の枝を見つけました。「これなにー？」こうちゃんは不思議そうに拾い上げました。';

  tryCollectPlaceItem('secretSpot');
  finishPlayAction('secretSpot');
}

/* ============================================================
   秘密の小道（こもれびの広場へ続くミニゲーム）

   公園入口の「細い道の先へ行く」を、そのプレイではじめて選んだときだけ通る
   左・まん中・右の3レーンを動いて、上から流れてくる枝をよけながら、木漏れ日を集める

   ■ 流れ（secretPathPhase）
     ready    … 説明と「小道へ進む」「← 場所選びにもどる」ボタン（まだ何も動かない）
                「← 場所選びにもどる」で公園入口の「どこへ行く？」へ戻る（leaveSecretPathToEntrance()）
     playing  … ミニゲーム中（15秒）
     finished … 結果の文章と「先へ進む」ボタン
                「先へ進む」で secretSpot（こもれびの広場）へ入る

   ■ ご褒美として楽しむミニゲーム
     ・枝に当たっても GAME OVER にはならない（集めた木漏れ日が1つ減るだけ。0より下にはならない）
       本編のステータス（体力・機嫌・余裕）にはダメージを与えず、左右にもそのまま動ける
     ・木漏れ日をいくつ取っても、かならず広場へ行ける
     ・親子のステータスと時間は、いっさい変えない
     ・木漏れ日をたくさん集めたときだけ、おでかけポイントを少しだけボーナス（getSecretPathBonusPoint()）
       （集められなくても損はしない。木漏れ日の数で変わるのは、結果の文章とボーナスだけ）

   ■ BGM
     小道のあいだは公園BGMのまま（ここではBGMにさわらない）
     こもれびの広場BGMが始まるのは、広場へ入ったとき（goToPlace('secretSpot') の中）

   ■ 動かしかた
     requestAnimationFrame で、1コマごとに枝と木漏れ日の位置を進める
     位置は「フィールドの高さの何%か」で持っているので、
     画面の大きさが変わっても、こうちゃんの所まで届く時間は同じ

     ※ CSSの animation で動かさないのは、ページ下の「動きを減らす設定」の指定で
       animation がぜんぶ一瞬で終わるようになっていて、遊べなくなってしまうため

     ループが残らないように、次のときにかならず止める
     ・時間が終わったとき（finishSecretPathGame()）
     ・もう一度あそぶ／はじめの画面へ戻る（resetGame() → resetSecretPathGame()）
     ・ページから離れたとき（onUnmounted）
     ・そのほか、なにかの理由で「小道で遊んでいる最中」ではなくなったとき
       （1コマごとに確かめて、ちがえばその場で止まる。
         小道の画面からは GAME OVER・ゴールへ直接は行けないが、万一のときもループは残らない）
   ============================================================ */

/* レーンの番号
   0 = 左、1 = まん中、2 = 右 */
type SecretPathLane = 0 | 1 | 2;

/* ミニゲームの進み具合
   ready    … はじまる前
   playing  … 遊んでいる最中
   finished … 小道をぬけた */
type SecretPathPhase = 'ready' | 'playing' | 'finished';

/* 上から流れてくるものの種類
   branch   … 枝 🌿（よけるもの）
   sunlight … 木漏れ日 ✨（集めるもの） */
type SecretPathItemKind = 'branch' | 'sunlight';

/* 流れてくるもの1つぶん

   id   … v-for の key にするための番号
   kind … 枝か木漏れ日か
   lane … どのレーンを流れてくるか
   y    … フィールドの上から何%の位置にいるか（0 = いちばん上、100 = いちばん下）
   hit  … もう当たった（枝）／取った（木漏れ日）か
          1つにつき1回だけ数えるための印 */
type SecretPathItem = {
  id: number;
  kind: SecretPathItemKind;
  lane: SecretPathLane;
  y: number;
  hit: boolean;
};

/* 「始まってから何ミリ秒たったら、どのレーンに何を出すか」の予定1つぶん */
type SecretPathSpawn = {
  at: number;
  kind: SecretPathItemKind;
  lane: SecretPathLane;
};

const secretPathLanes: SecretPathLane[] = [0, 1, 2];

/* ミニゲームの長さ（ミリ秒）。15000 で15秒 */
const secretPathDuration = 15000;

/* 1プレイで流れてくる木漏れ日の数（「✨ 木漏れ日 3 / 5」の 5）
   下の secretPathSunlightRows の数とそろえること */
const secretPathSunlightTotal = 5;

/* 流れてくる速さ（1秒で、フィールドの高さの何%進むか）
   60 なら、出てきてから こうちゃんの所まで 約1.5秒
   （40・約2.3秒 → 48・約1.9秒 → 60 と、テンポと難しさを上げてきた） */
const secretPathSpeed = 60;

/* こうちゃんの位置（フィールドの上から何%か） */
const secretPathPlayerY = 84;

/* 出てくる位置と、片づける位置（どちらもフィールドの外） */
const secretPathSpawnY = -8;
const secretPathRemoveY = 110;

/* 流れてくる「行」の予定

   600ミリ秒後から、800ミリ秒ごとに16行
   いちばん最後の行（約12.6秒）でも、15秒になる前に こうちゃんの所まで届く
   （行の数や間隔を変えるときは「最後の行の時間 ＋ 届くまでの約1.5秒」が15秒を超えないようにする）

   ・ふつうの行 … 枝を1本。secretPathDoubleBranchChance の割合で2本にして、空いているレーンを1つだけにする
   ・secretPathSunlightRows の行 … 木漏れ日を1つ。secretPathSunlightBranchChance の割合で、べつのレーンに枝もいっしょ
   ・secretPathRowJitter … 行ごとに少しだけ時間をずらして、同じリズムになりすぎないようにする

   どの行も、少なくとも1つのレーンは空いている（3本とも枝の行は作らない）ので、よけられない形にはならない */
const secretPathFirstRowAt = 600;
const secretPathRowInterval = 800;
const secretPathRowCount = 16;
const secretPathRowJitter = 120;
const secretPathSunlightRows = [1, 4, 7, 10, 13];
const secretPathDoubleBranchChance = 0.35;
const secretPathSunlightBranchChance = 0.7;

/* 枝に当たったときの「いたっ！」「✨ -1」を出しておく長さ（ミリ秒）

   見た目だけの長さで、このあいだも左右にはふつうに動ける
   （枝のペナルティは「木漏れ日 -1」だけにして、動きは止めない） */
const secretPathBumpEffectDuration = 600;

/* 道（レーン）をクリック・タップしたとき、押したレーンを光らせておく長さ（ミリ秒） */
const secretPathTapFlashDuration = 200;

/* 「はやく進む」ときの速さ（ゲームの時計を何倍で進めるか）
   ずっと押しっぱなしなら、15秒ぶんが実際には約10秒で終わる
   （早く着けるかわりに、枝や木漏れ日へ反応できる時間も短くなる） */
const secretPathBoostMultiplier = 1.5;

/* フィールドを何ミリ秒押しつづけたら「長押し」（はやく進む）にするか
   押したしゅんかんに はやくならないように、少しだけ待つ */
const secretPathHoldBoostDelay = 250;

/* 押したまま横へ何px動かしたら、1レーン動かすか（マウスのドラッグ・指のフリック共通）
   小さな手ぶれでは動かないようにするため */
const secretPathSwipeThreshold = 32;

/* 木漏れ日を取ったときの「✨ +1」と光を出しておく長さ（ミリ秒） */
const secretPathSparkleDuration = 600;

/* 結果が出てから「先へ進む」を受けつけるまでの待ち時間（ミリ秒）

   時間切れのしゅんかんに道をタップしていた指や、押していたキーで、
   結果を読む前に先へ進んでしまわないようにする */
const secretPathLeaveGuard = 600;

/* 木漏れ日ボーナス（おでかけポイント）

   結果の文章と同じ3段階で、たくさん集めたときだけ少しだけ足す
   ・4〜5個 … +3（いやいやの「ナイス対応」と同じくらい）
   ・2〜3個 … +1
   ・0〜1個 … なし
   量を変えたくなったら、ここの2つだけを書きかえればよい */
const secretPathBonusGreatPoint = 3;
const secretPathBonusGoodPoint = 1;

/* いまの進み具合（小道へ入るたびに ready から始める） */
const secretPathPhase = ref<SecretPathPhase>('ready');

/* こうちゃんのレーン（はじめは、まん中） */
const secretPathPlayerLane = ref<SecretPathLane>(1);

/* いまフィールドに出ている枝と木漏れ日 */
const secretPathItems = ref<SecretPathItem[]>([]);

/* 集めた木漏れ日の数 */
const secretPathSunlightCount = ref(0);

/* 小道をぬけたときにもらった木漏れ日ボーナス（結果カードに「+3」と出すため。0 = なし） */
const secretPathBonusPoint = ref(0);

/* 始まってから何ミリ秒たったか（ゲームの時計）

   タブを切りかえているあいだは requestAnimationFrame が止まるので、この時計も止まる
   （戻ってきたときに、いきなり何秒も進んでしまわない） */
const secretPathElapsed = ref(0);

/* 「いたっ！」を出しておくのは、ゲームの時計が何ミリ秒になるまでか（0 = 出していない） */
const secretPathBumpUntil = ref(0);

/* 直前に枝に当たったとき、木漏れ日が本当に1つ減ったか

   0個のときに当たっても減らない（0のまま）ので、そのときは「✨ -1」を出さない
   （数が変わっていないのに「-1」と出ると、何が起きたか分かりにくくなるため） */
const secretPathBumpLost = ref(false);

/* 「いたっ！」の番号
   続けて枝に当たったときに、ふきだしを最初から出しなおすための key */
const secretPathBumpId = ref(0);

/* 道（レーン）をクリック・タップしたときに光らせるレーンと、ゲームの時計が何ミリ秒になるまで光らせるか
   （見た目だけ。指で押したときは「マウスを乗せる」が無いので、押したことをこれで伝える） */
const secretPathTapLane = ref<SecretPathLane | null>(null);
const secretPathTapUntil = ref(0);

/* マウスを乗せているレーン（乗せていないときは null）
   マウスのときだけ使う（指で押したときは「乗せる」が無いので、ここは変えない） */
const secretPathHoverLane = ref<SecretPathLane | null>(null);

/* 「✨ +1」を出しておくのは、ゲームの時計が何ミリ秒になるまでか */
const secretPathSparkleUntil = ref(0);

/* 「✨ +1」の番号
   続けて木漏れ日を取ったときに、ふわっと上がる動きを最初からやりなおすための key */
const secretPathSparkleId = ref(0);

/* 遊んでいる最中のカード（スマホ幅で、遊びはじめに画面の上へスクロールするための目印） */
const secretPathPlayRef = ref<HTMLElement | null>(null);

/* ここから下は画面に出さない入れもの（ref にしなくてよい） */
let secretPathFrameId: number | null = null; // requestAnimationFrame の予約番号
let secretPathLastTimestamp: number | null = null; // 前のコマの時刻
let secretPathSpawnQueue: SecretPathSpawn[] = []; // まだ出していない予定（時間の早い順）
let secretPathNextItemId = 0;
let secretPathFinishedAt = 0; // 結果が出た時刻（performance.now()）

/* フィールドを押しているポインター（マウス・指・ペン）の一時的な状態
   はなしたとき・キャンセルされたとき・リセットや終了のときに、releaseSecretPathPointer() でまとめて戻す */
let secretPathPointerId: number | null = null; // 押しているポインターの番号（押していないときは null）
let secretPathPointerField: HTMLElement | null = null; // pointer capture をしているフィールド
let secretPathPointerDownLane: SecretPathLane | null = null; // 押しはじめたレーン（短いタップのときに使う）
let secretPathPointerLastX = 0; // 横の移動を数えはじめた位置（1レーン動くたびに、そこから数えなおす）
let secretPathPointerDragged = false; // 押しているあいだに、横へ動かして1レーン動いたか（タップとして動かさない）
let secretPathPointerHeld = false; // 長押しになったか（タップとして動かさない）
let secretPathHoldTimer: ReturnType<typeof setTimeout> | null = null; // 長押しを待つ予約

/* はやく進んでいるか（キーと、フィールドの長押しを別々に持つ）
   片方をはなしても、もう片方を押しているあいだは はやいまま */
const isSecretPathKeyBoosting = ref(false);
const isSecretPathPointerBoosting = ref(false);

/* いま「小道で遊んでいる最中」かどうか
   キー操作・道のクリック／タップ・1コマごとの処理は、どれもこれを見てから動く */
const isSecretPathPlaying = computed(() => currentEvent.value === 'secretPath' && secretPathPhase.value === 'playing');

/* いま はやく進んでいるか（HUDの「⏩ 1.5x」と、1コマごとの時計の進め方に使う）
   遊んでいる最中でなければ、かならず false（結果の画面に「⏩ 1.5x」が残らない） */
const isSecretPathBoosting = computed(() => isSecretPathPlaying.value && (isSecretPathKeyBoosting.value || isSecretPathPointerBoosting.value));

/* 枝に当たった直後かどうか（「いたっ！」を出しているあいだ。見た目だけで、動きは止めない） */
const isSecretPathBumped = computed(() => isSecretPathPlaying.value && secretPathElapsed.value < secretPathBumpUntil.value);

/* 木漏れ日を取った直後かどうか（「✨ +1」と光を出しているあいだ） */
const isSecretPathSparkling = computed(() => isSecretPathPlaying.value && secretPathElapsed.value < secretPathSparkleUntil.value);

/* いま光らせているレーン（道をクリック・タップした直後だけ。それ以外は null） */
const secretPathFlashLane = computed(() => (isSecretPathPlaying.value && secretPathElapsed.value < secretPathTapUntil.value ? secretPathTapLane.value : null));

/* マウスを乗せているレーンを押したときに、こうちゃんが動く先のレーン

   押したレーンの方向へ1レーンだけ動くので、遠いレーンに乗せているときは「まん中」が動く先になる
   乗せていない・いまいるレーンに乗せているときは null（目印をはっきりさせない） */
const secretPathHoverDestination = computed(() => {
  const hoverLane = secretPathHoverLane.value;
  const currentLane = secretPathPlayerLane.value;

  if (!isSecretPathPlaying.value || hoverLane === null || hoverLane === currentLane) {
    return null;
  }

  return hoverLane < currentLane ? currentLane - 1 : currentLane + 1;
});

/* 残り時間（秒）。「あと 12秒」のように出す */
const secretPathTimeLeft = computed(() => Math.max(0, Math.ceil((secretPathDuration - secretPathElapsed.value) / 1000)));

/* 集めた木漏れ日の数に合わせた、結果の文章 */
const secretPathResultText = computed(() => {
  if (secretPathSunlightCount.value >= 4) {
    return '✨ 木漏れ日が道を照らしています！「きらきらー！」こうちゃんはうれしそうに奥へ走っていきます。';
  }

  if (secretPathSunlightCount.value >= 2) {
    return '木漏れ日を追いかけながら、こうちゃんと小道の奥へ進みました！';
  }

  return '木々のあいだをゆっくり進みました。道の奥が少し明るくなっています。';
});

/* 集めた木漏れ日の数から、ボーナスのおでかけポイントを決める（結果の文章と同じ区切り） */
function getSecretPathBonusPoint(sunlightCount: number) {
  if (sunlightCount >= 4) {
    return secretPathBonusGreatPoint;
  }

  if (sunlightCount >= 2) {
    return secretPathBonusGoodPoint;
  }

  return 0;
}

/* レーンの番号を、フィールドの左はしからの位置（%）にする
   0 → 16.7%（左のまん中）、1 → 50%、2 → 83.3%（右のまん中） */
function getSecretPathLaneLeft(lane: SecretPathLane) {
  return `${((lane * 2 + 1) / 6) * 100}%`;
}

/* 公園入口の「細い道の先へ行く」

   ・このプレイで、まだ広場を見つけていない … 秘密の小道（ミニゲーム）へ
   ・もう見つけている                     … 今までどおり、そのまま こもれびの広場へ

   ※ 秘密の小道へ行くときは、BGMは変えない（公園BGMのまま）
     goToPlace() がBGMを入れかえるのは、行き先が secretSpot のときだけ */
function goToSecretArea() {
  if (hasDiscoveredSecretSpot.value) {
    goToPlace('secretSpot');
    return;
  }

  resetSecretPathGame();
  goToPlace('secretPath');
}

/* requestAnimationFrame のループを止める（予約が無ければ何もしない） */
function stopSecretPathLoop() {
  if (secretPathFrameId !== null) {
    cancelAnimationFrame(secretPathFrameId);
    secretPathFrameId = null;
  }

  secretPathLastTimestamp = null;
}

/* 秘密の小道を、はじまる前の状態に戻す

   ループ・流れてくるもの・木漏れ日の数・こうちゃんの位置・時計を、まとめて片づける
   （hasDiscoveredSecretSpot はここでは戻さない。戻すのは resetGame() だけ） */
function resetSecretPathGame() {
  stopSecretPathLoop();
  releaseSecretPathControls();

  secretPathPhase.value = 'ready';
  secretPathPlayerLane.value = 1;
  secretPathItems.value = [];
  secretPathSunlightCount.value = 0;
  secretPathBonusPoint.value = 0;
  secretPathElapsed.value = 0;
  secretPathBumpUntil.value = 0;
  secretPathBumpLost.value = false;
  secretPathSparkleUntil.value = 0;
  secretPathTapLane.value = null;
  secretPathTapUntil.value = 0;
  secretPathHoverLane.value = null;
  secretPathSpawnQueue = [];
  secretPathFinishedAt = 0;
}

/* 候補のレーンから、ランダムに1つ選ぶ */
function pickRandomSecretPathLane(candidates: SecretPathLane[] = secretPathLanes): SecretPathLane {
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 1;
}

/* 1プレイぶんの「何を・いつ・どのレーンに出すか」の予定を作る

   木漏れ日の数（5つ）は毎回同じにして、出てくるレーンだけをランダムにする
   どの行も、少なくとも1つのレーンは空いているので、よけられない形にはならない */
function buildSecretPathSpawnQueue(): SecretPathSpawn[] {
  const queue: SecretPathSpawn[] = [];

  for (let row = 0; row < secretPathRowCount; row++) {
    const at = secretPathFirstRowAt + row * secretPathRowInterval + (Math.random() * 2 - 1) * secretPathRowJitter;

    if (secretPathSunlightRows.includes(row)) {
      const sunlightLane = pickRandomSecretPathLane();

      queue.push({ at, kind: 'sunlight', lane: sunlightLane });

      // たいていは、木漏れ日とはべつのレーンに枝もいっしょに出す（取りに行くとき、よける必要が出てくる）
      if (Math.random() < secretPathSunlightBranchChance) {
        queue.push({ at, kind: 'branch', lane: pickRandomSecretPathLane(secretPathLanes.filter((lane) => lane !== sunlightLane)) });
      }

      continue;
    }

    // ふつうの行は枝を1本。ときどき2本にして、空いているレーンを1つだけにする（3本にはしない）
    const branchLane = pickRandomSecretPathLane();

    queue.push({ at, kind: 'branch', lane: branchLane });

    if (Math.random() < secretPathDoubleBranchChance) {
      queue.push({ at, kind: 'branch', lane: pickRandomSecretPathLane(secretPathLanes.filter((lane) => lane !== branchLane)) });
    }
  }

  return queue.sort((a, b) => a.at - b.at);
}

/* 「小道へ進む」（ミニゲームを始める）

   押すまでは何も動かないので、プレイヤーは説明を読んでから始められる */
function startSecretPathGame() {
  if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'ready') {
    return;
  }

  // 決定音「ポン♪」
  playDecisionSound();

  resetSecretPathGame();
  secretPathSpawnQueue = buildSecretPathSpawnQueue();
  secretPathPhase.value = 'playing';

  secretPathFrameId = requestAnimationFrame(runSecretPathFrame);

  scrollSecretPathIntoView();
}

/* スマホ幅のときだけ、遊ぶカードを画面のいちばん上へスクロールする

   スマホ幅ではページ全体がスクロールするので、
   フィールドと下の案内がいっしょに見える位置へ合わせておく
   （パソコンでは中央エリアの中に収まるので、何もしない） */
async function scrollSecretPathIntoView() {
  if (!import.meta.client || !window.matchMedia('(max-width: 700px)').matches) {
    return;
  }

  // カードが画面に出るのを待ってから
  await nextTick();

  secretPathPlayRef.value?.scrollIntoView({ block: 'start' });
}

/* 1コマぶんの処理（requestAnimationFrame から呼ばれる） */
function runSecretPathFrame(timestamp: number) {
  secretPathFrameId = null;

  // もう小道で遊んでいる最中ではない（リセット・画面が変わった など）ときは、ここで止まる
  if (!gameStarted.value || !isSecretPathPlaying.value) {
    stopSecretPathLoop();
    releaseSecretPathControls();
    return;
  }

  /* 前のコマからの時間

     50ミリ秒より長くあいたときは、50ミリ秒ぶんだけ進める
     処理が重くなったときなどに、枝がこうちゃんを「すり抜けて」しまわないようにするため */
  const delta = secretPathLastTimestamp === null ? 0 : Math.min(Math.max(timestamp - secretPathLastTimestamp, 0), 50);

  secretPathLastTimestamp = timestamp;

  /* はやく進んでいるあいだは、ゲームの時計そのものを1.5倍で進める
     出てくるタイミング・流れる速さ・残り時間・「いたっ！」などの長さが、ぜんぶ同じ時計でそろって速くなる
     （1コマで進むのは最大 50 × 1.5 = 75ミリ秒。枝が進むのは4.5%で、当たり判定の幅10%より小さいので すり抜けない） */
  advanceSecretPath(isSecretPathBoosting.value ? delta * secretPathBoostMultiplier : delta);

  // 時間切れで終わっていなければ、次のコマを予約する
  if (isSecretPathPlaying.value) {
    secretPathFrameId = requestAnimationFrame(runSecretPathFrame);
  }
}

/* ゲームの時計を delta ミリ秒進めて、出す・動かす・当たりを見る・片づける */
function advanceSecretPath(delta: number) {
  const elapsed = Math.min(secretPathElapsed.value + delta, secretPathDuration);

  secretPathElapsed.value = elapsed;

  // ① 予定の時間になったものを、フィールドのいちばん上に出す
  let nextSpawn = secretPathSpawnQueue[0];

  while (nextSpawn && nextSpawn.at <= elapsed) {
    secretPathSpawnQueue.shift();
    secretPathNextItemId += 1;
    secretPathItems.value.push({ id: secretPathNextItemId, kind: nextSpawn.kind, lane: nextSpawn.lane, y: secretPathSpawnY, hit: false });
    nextSpawn = secretPathSpawnQueue[0];
  }

  // ② ぜんぶ下へ進めて、こうちゃんに当たったかを見る
  const distance = (secretPathSpeed * delta) / 1000;
  let needsCleanup = false;

  for (const item of secretPathItems.value) {
    item.y += distance;

    if (item.y > secretPathRemoveY) {
      needsCleanup = true;
      continue;
    }

    // 当たり判定は「同じレーン ＋ こうちゃんの高さのあたりまで来た」だけで見る
    if (item.hit || item.lane !== secretPathPlayerLane.value) {
      continue;
    }

    // マイナス … まだ こうちゃんより上／プラス … こうちゃんより下
    const offset = item.y - secretPathPlayerY;

    // ③ 木漏れ日：こうちゃんに重なったら取る（枝より少しゆるめに見る）
    if (item.kind === 'sunlight' && offset >= -10 && offset <= 6) {
      item.hit = true;
      needsCleanup = true;

      secretPathSunlightCount.value += 1;
      secretPathSparkleUntil.value = elapsed + secretPathSparkleDuration;
      secretPathSparkleId.value += 1;

      // 「✨ +1」と「いたっ！」は同じ場所（こうちゃんの上）に出るので、
      // 重なって読めなくならないように、あとから起きたほうだけを出す
      secretPathBumpUntil.value = 0;

      playSunlightSound();
      continue;
    }

    // ④ 枝：こうちゃんの所まで来たら当たる → 集めた木漏れ日を1つ減らす（0より下にはしない）
    //    ・本編のステータス（体力・機嫌・余裕）には、いっさいさわらない（小道の中だけのペナルティ）
    //    ・枝1本につき1回だけ（item.hit）なので、同じ枝で何度も減ることはない
    //    ・当たったあとも、左右にはそのまま動ける
    if (item.kind === 'branch' && offset >= -7 && offset <= 3) {
      item.hit = true;

      const hasSunlightToLose = secretPathSunlightCount.value > 0;

      secretPathSunlightCount.value = Math.max(0, secretPathSunlightCount.value - 1);
      secretPathBumpLost.value = hasSunlightToLose;
      secretPathBumpUntil.value = elapsed + secretPathBumpEffectDuration;
      secretPathBumpId.value += 1;

      // 木漏れ日を取った直後の「✨ +1」が残っていたら消す（「いたっ！」と重ならないように、あとから起きたほうだけを出す）
      secretPathSparkleUntil.value = 0;

      playBranchBumpSound();
    }
  }

  // ⑤ 下へ出ていったものと、取った木漏れ日を片づける
  if (needsCleanup) {
    secretPathItems.value = secretPathItems.value.filter((item) => item.y <= secretPathRemoveY && !(item.kind === 'sunlight' && item.hit));
  }

  // ⑥ 15秒たったら、おしまい
  if (elapsed >= secretPathDuration) {
    finishSecretPathGame();
  }
}

/* 時間切れ（小道をぬけた）

   ここで「こもれびの広場を見つけた」ことになる
   このあと同じプレイのあいだは、ミニゲームをくり返さない */
function finishSecretPathGame() {
  stopSecretPathLoop();
  releaseSecretPathControls();

  secretPathPhase.value = 'finished';
  secretPathItems.value = [];
  secretPathSpawnQueue = [];
  secretPathBumpUntil.value = 0;
  secretPathBumpLost.value = false;
  secretPathSparkleUntil.value = 0;
  secretPathFinishedAt = performance.now();

  /* 木漏れ日ボーナス

     ・addOutingPoint() ではなく、そのまま足す
       （「2回目の場所は半分」は場所の探検のためのルールで、小道は場所ではないため）
     ・上部ステータスの「おでかけポイント」の横にも +3 と出るように、今回の変化にも入れておく
       ほかのステータスと時間は動かしていないので 0 のまま（上部には何も出ない）
       statusChanges は、広場へ入るとき goToPlace() の中で null に戻る
     ・時間切れは1回の小道につき1回だけなので、ボーナスが二重に入ることはない */
  const bonusPoint = getSecretPathBonusPoint(secretPathSunlightCount.value);

  secretPathBonusPoint.value = bonusPoint;

  if (bonusPoint > 0) {
    outingPoint.value += bonusPoint;
    statusChanges.value = { childEnergy: 0, childMood: 0, outingPoint: bonusPoint, parentEnergy: 0, parentCalm: 0, minutes: 0 };
  }

  hasDiscoveredSecretSpot.value = true;

  // 「先へ進む」だけの画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;

  // 「木々のすき間から、まぶしい光が…」に合わせて、キラリン♪
  playItemSound();
}

/* 「先へ進む」（こもれびの広場へ）

   BGMの入れかえ（公園BGMを止める → こもれびの広場BGM）は、goToPlace() の中のまま
   ＝ 広場へ着いたこの瞬間に「こもれびの奥で」が始まる */
function enterSecretSpotFromPath() {
  if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'finished') {
    return;
  }

  if (performance.now() - secretPathFinishedAt < secretPathLeaveGuard) {
    return;
  }

  goToPlace('secretSpot');

  /* 小道の状態は、画面が変わってから片づける
     <Transition> で消えていく小道の画面は、もう描きなおされないので、
     フェードアウトの途中で結果の文章が変わって見えることはない */
  resetSecretPathGame();
}

/* 「← 場所選びにもどる」（はじまる前だけ。公園入口の「どこへ行く？」へ戻る）

   小道に入らずに引き返すだけなので、何も変えない
   ・時間・親子のステータス・おでかけポイント・アイテム・visitedPlaces は、そのまま
   ・hasDiscoveredSecretSpot も false のまま
     → あとでもう一度「細い道の先へ行く」を選ぶと、また ready 画面から始まる
   ・BGMは公園BGMのまま（goToPlace() がBGMを入れかえるのは secretSpot のときだけ）
   ・小道の状態は、画面が変わってから片づける（enterSecretSpotFromPath() と同じ）
   ・カーソルは「細い道の先へ行く」に合わせる（restoreEntranceCursor()。小道へ入るときに lastSelectedPlace が secretPath になっている） */
function leaveSecretPathToEntrance() {
  if (currentEvent.value !== 'secretPath' || secretPathPhase.value !== 'ready') {
    return;
  }

  goToPlace('parkEntrance');
  resetSecretPathGame();
  restoreEntranceCursor();
}

/* こうちゃんを左（-1）か右（+1）へ、1レーンだけ動かす

   ・遊んでいる最中でなければ動かさない
   ・枝に当たった直後も、ふつうに動ける（枝のペナルティは木漏れ日 -1 だけ）
   ・左はしでさらに左、右はしでさらに右は、その場のまま */
function moveSecretPathPlayer(direction: -1 | 1) {
  if (!isSecretPathPlaying.value) {
    return;
  }

  const nextLane = secretPathPlayerLane.value + direction;

  if (nextLane === 0 || nextLane === 1 || nextLane === 2) {
    secretPathPlayerLane.value = nextLane;
  }
}

/* フィールドの横の位置（clientX）が、どのレーンの上か（フィールドの外なら null） */
function getSecretPathLaneAt(field: HTMLElement, clientX: number, clientY: number): SecretPathLane | null {
  const rect = field.getBoundingClientRect();

  if (rect.width <= 0 || clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) {
    return null;
  }

  const lane = Math.floor(((clientX - rect.left) / rect.width) * 3);

  return lane === 0 || lane === 1 || lane === 2 ? lane : null;
}

/* はやく進む・ポインターを押している状態を、ぜんぶ元に戻す

   キーをはなしたこと（keyup）や、指をはなしたこと（pointerup）が届かないときでも、
   はやいまま・押したままの扱いが残らないように、次のときにかならず呼ぶ
   ・時間が終わったとき（finishSecretPathGame()）
   ・リセットしたとき（resetSecretPathGame()）
   ・ウィンドウからフォーカスが外れた・タブが見えなくなったとき
   ・ページから離れたとき（onUnmounted）
   ・なにかの理由で「小道で遊んでいる最中」ではなくなったとき（runSecretPathFrame()） */
function releaseSecretPathControls() {
  isSecretPathKeyBoosting.value = false;
  releaseSecretPathPointer();
}

/* ポインター（マウス・指・ペン）を押している状態だけを、元に戻す */
function releaseSecretPathPointer() {
  if (secretPathHoldTimer !== null) {
    clearTimeout(secretPathHoldTimer);
    secretPathHoldTimer = null;
  }

  if (secretPathPointerField && secretPathPointerId !== null) {
    try {
      if (secretPathPointerField.hasPointerCapture(secretPathPointerId)) {
        secretPathPointerField.releasePointerCapture(secretPathPointerId);
      }
    } catch {
      // もう押していないポインターのときは、何もしなくてよい
    }
  }

  secretPathPointerId = null;
  secretPathPointerField = null;
  secretPathPointerDownLane = null;
  secretPathPointerLastX = 0;
  secretPathPointerDragged = false;
  secretPathPointerHeld = false;
  isSecretPathPointerBoosting.value = false;
}

/* フィールドのポインター操作（マウス・指・ペンを Pointer Events でまとめて受け取る）

   ■ 短く押す（クリック・タップ）
     押したレーンの方向へ、1レーンだけ動く（← → キーと同じ「1回で1レーン」）
     左はしで右はしのレーンを押すと まん中へ、もう1回押すと右はしへ
     （いっきに2レーン動けると、まん中のレーンの枝をすり抜けられて、道を押す操作だけ有利になるため）
     長押し・ドラッグと見分けるため、動かすのは はなしたとき（pointerup）

   ■ 押したまま横へ動かす（しきい値 secretPathSwipeThreshold をこえるたびに1レーン）
     ・マウス             … ドラッグ。こえるたびに1レーンずつ動く（左はし → まん中 → 右はし）
     ・指・ペン           … フリック。1回押すあいだに1レーンだけ（大きくはらっても、まん中で止まる）
     ・長押しになったあと … 指・ペンでも、スライドでこえるたびに1レーンずつ動ける
     長押しになる前に横へ動いたら、長押しの判定はやめる（フリック・ドラッグとして扱う）

   ■ 長押し（secretPathHoldBoostDelay だけ押しつづける）
     はなすまで、はやく進む（ゲームの時計が1.5倍）

   ※ setPointerCapture … 押したままフィールドの外へ出ても、pointerup / pointercancel を受け取るため
   ※ 最初に押したポインターだけで操作する（2本目の指は使わない） */
function handleSecretPathPointerDown(event: PointerEvent) {
  // 右クリックなど、遊んでいる最中以外では動かさない
  if (event.button !== 0 || !isSecretPathPlaying.value) {
    return;
  }

  // 長押しのメニュー・文字の選択・フォーカス移動を起こさない
  event.preventDefault();

  const field = event.currentTarget as HTMLElement;

  if (secretPathPointerId !== null) {
    // べつの指で まだ押している（capture が続いている）ときは、あとから押したほうを使わない
    if (secretPathPointerId !== event.pointerId && field.hasPointerCapture(secretPathPointerId)) {
      return;
    }

    // はなしたことが届かなかった古い状態は、ここで片づけてから始めなおす
    releaseSecretPathPointer();
  }

  const pointerId = event.pointerId;

  secretPathPointerId = pointerId;
  secretPathPointerField = field;
  secretPathPointerDownLane = getSecretPathLaneAt(field, event.clientX, event.clientY);
  secretPathPointerLastX = event.clientX;

  try {
    field.setPointerCapture(pointerId);
  } catch {
    // capture できなくても、フィールドの中で はなせばふつうに動く
  }

  secretPathHoldTimer = setTimeout(() => {
    secretPathHoldTimer = null;

    if (!isSecretPathPlaying.value || secretPathPointerId !== pointerId) {
      return;
    }

    secretPathPointerHeld = true;
    isSecretPathPointerBoosting.value = true;
  }, secretPathHoldBoostDelay);
}

function handleSecretPathPointerMove(event: PointerEvent) {
  // マウスを乗せているレーン（動く先の目印をはっきりさせるため。指には「乗せる」が無いので、マウスのときだけ）
  if (event.pointerType === 'mouse') {
    secretPathHoverLane.value = getSecretPathLaneAt(event.currentTarget as HTMLElement, event.clientX, event.clientY);
  }

  if (event.pointerId !== secretPathPointerId || !isSecretPathPlaying.value) {
    return;
  }

  swipeSecretPathPlayer(event);
}

function handleSecretPathPointerUp(event: PointerEvent) {
  if (event.pointerId !== secretPathPointerId) {
    return;
  }

  if (isSecretPathPlaying.value) {
    // pointermove が届く前に はなした、すばやいフリックも拾う
    swipeSecretPathPlayer(event);

    // 横へ動かさず、長押しにもならなかった → 短いクリック・タップ
    if (!secretPathPointerDragged && !secretPathPointerHeld) {
      tapSecretPathLane(secretPathPointerDownLane);
    }
  }

  releaseSecretPathPointer();
}

/* キャンセルされたとき（ブラウザがジェスチャーを引き取った など）は、動かさずに元へ戻すだけ */
function handleSecretPathPointerCancel(event: PointerEvent) {
  if (event.pointerId !== secretPathPointerId) {
    return;
  }

  releaseSecretPathPointer();
}

function handleSecretPathPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'mouse') {
    secretPathHoverLane.value = null;
  }
}

/* 押したまま横へ、しきい値より大きく動いていたら、その方向へ1レーンだけ動かす */
function swipeSecretPathPlayer(event: PointerEvent) {
  const distance = event.clientX - secretPathPointerLastX;

  if (Math.abs(distance) < secretPathSwipeThreshold) {
    return;
  }

  // 指・ペンのフリックは、1回押すあいだに1レーンだけ（長押しになったあとのスライドと、マウスのドラッグは何度でも）
  const canMoveAgain = event.pointerType === 'mouse' || secretPathPointerHeld;

  if (secretPathPointerDragged && !canMoveAgain) {
    return;
  }

  // 長押しになる前に横へ動いたら、長押しにはしない
  if (secretPathHoldTimer !== null) {
    clearTimeout(secretPathHoldTimer);
    secretPathHoldTimer = null;
  }

  secretPathPointerDragged = true;
  secretPathPointerLastX = event.clientX;

  const laneBefore = secretPathPlayerLane.value;

  moveSecretPathPlayer(distance < 0 ? -1 : 1);

  // 動いた先のレーンを一瞬光らせる（はしで動けなかったときは光らせない）
  if (secretPathPlayerLane.value !== laneBefore) {
    secretPathTapLane.value = secretPathPlayerLane.value;
    secretPathTapUntil.value = secretPathElapsed.value + secretPathTapFlashDuration;
  }
}

/* 短く押したレーンの方向へ、1レーンだけ動かす（いまいるレーンを押したときは、何もしない・光らせもしない）
   押したレーンを一瞬光らせて、どこを押したかが目で分かるようにする */
function tapSecretPathLane(lane: SecretPathLane | null) {
  const currentLane = secretPathPlayerLane.value;

  if (lane === null || lane === currentLane) {
    return;
  }

  moveSecretPathPlayer(lane < currentLane ? -1 : 1);

  secretPathTapLane.value = lane;
  secretPathTapUntil.value = secretPathElapsed.value + secretPathTapFlashDuration;
}

/* ↑ キーをはなしたとき（window の keyup。遊んでいる最中かどうかに関係なく、はやく進むのをやめる） */
function handleSecretPathKeyup(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') {
    isSecretPathKeyBoosting.value = false;
  }
}

/* ウィンドウからフォーカスが外れた・タブが見えなくなったとき
   keyup や pointerup が届かないことがあるので、はやく進む・押している状態を戻しておく */
function handleSecretPathWindowBlur() {
  releaseSecretPathControls();
}

function handleSecretPathVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    releaseSecretPathControls();
  }
}

/* 小道で遊んでいる最中のキー操作（handleKeydown() から呼ばれる）

   ・← / A … 左へ1レーン
   ・→ / D … 右へ1レーン
   ・↑       … 押しているあいだだけ、はやく進む（はなすと handleSecretPathKeyup() で元の速さに戻る）
   ・↓ / Enter / Space … 何もしない（ページのスクロールや、ボタンの押しまちがいを止めるだけ）
   ・それ以外（Tab など）… ブラウザのふつうの動きにまかせる

   ※ ← → は押しっぱなし（event.repeat）では続けて動かさない（1回押すと1レーン）
   ※ ↑ は押しっぱなしで何度届いても、はやいままでよい
   ※ はじまる前・終わったあとは、ここへは来ない（ふつうのコマンド操作に戻る） */
function handleSecretPathKeydown(event: KeyboardEvent) {
  // Ctrl + A（ぜんぶ選択）などのショートカットは、じゃましない
  const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
  const isLeftKey = event.key === 'ArrowLeft' || (!hasModifier && event.code === 'KeyA');
  const isRightKey = event.key === 'ArrowRight' || (!hasModifier && event.code === 'KeyD');

  if (isLeftKey || isRightKey) {
    event.preventDefault();

    if (event.repeat) {
      return;
    }

    moveSecretPathPlayer(isLeftKey ? -1 : 1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    isSecretPathKeyBoosting.value = true;
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    // サウンドON/OFFのボタンを選んでいるときだけは、ボタン本来の操作にまかせる
    const target = event.target as HTMLElement | null;

    if (target?.closest?.('.sound-toggle')) {
      return;
    }

    event.preventDefault();
  }
}

/* ============================================================
   ひとやすみ（どの場所でも使える共通のケア行動）

   通常の場所では、コマンドを2つの枠に分けている
   ・「どうする？」  … その場所ならではの遊び（すべる・どんぐりを拾う など）
   ・「☕ ひとやすみ」… どの場所でも同じ、親子の状態を整える行動

   いちばん大事なのは finishPlayAction() を呼ばないこと
   あの関数は「その場所で遊んだ」ときの共通処理なので、中で
   ・playCount（遊んだ回数）を増やす
   ・visitedPlaces（探検済みの場所）に追加する
   ・runRandomEvent()（ちいさなできごと）を起こす
   ・checkTantrum()（いやいや抽選）
   ・checkSuddenEvent()（とつぜんのできごと抽選）
   までまとめて行っている

   ひとやすみは遊びではなく休んだだけなので、
   これらが起きてしまうと
   「ベンチに座っただけで、どんぐりの木を探検済みにした」
   「休んだ直後に救急車が来た」
   のようにおかしなことになる

   そこで finishPlayAction() は通さず、
   行動のあとに必ず要る3つだけを finishCareAction() で行う
   ============================================================ */

/* ひとやすみの行動が終わったあとに呼ぶ共通処理

   場所の行動の finishPlayAction() にあたるものだが、中身はずっと少ない
   ① 今回の変化量を記録する（0〜100に丸める前に行うのが大事）
   ② ステータスを0〜100に収める
   ③ 限界をむかえていないか判定する
   ④ 選択中のコマンドを一番上（0）に戻す

   ③を入れてあるのは、休憩やおやつでもステータスが動くため
   （どちらも回復する行動なので、ここでGAME OVERになることは無いはずだが、
     ステータスを動かしたら必ず判定する、という書きかたにそろえておく）
*/
function finishCareAction() {
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 休憩・おやつの結果だという印（結果カードに「次の場所を選ぶ」ではなく「← もどる」を出す）
  isCareActionResult.value = true;

  // 結果カードが出て「← もどる」だけの画面になるので、一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ① 休憩する

   おやつを使わずに、いつでも選べる回復行動
   こうちゃんの体力・親の体力・親の余裕が戻るかわりに、15分かかる
   「まだ遊びたいのに休まされた」ので、こうちゃんの機嫌だけは少し下がる

   ※ おでかけポイントは増えない（遊んでいないので点にはならない）
*/
function takeCommonBreak() {
  // 行動する前のステータスを控えておく
  // ※ 決定音「ポン♪」と、前の行動の演出データのリセットもここで行われる
  startStatusChanges();

  childEnergy.value += 12;
  childMood.value -= 2;
  parentEnergy.value += 12;
  parentCalm.value += 8;
  addMinutes(15);

  resultMessage.value = 'ベンチに座って、親子で少し休憩しました。こうちゃんも少し元気を取り戻したようです。';

  // finishPlayAction() は呼ばない（上の説明のとおり）
  finishCareAction();
}

/* ② おやつをあげる（通常の探検中）

   「☕ ひとやすみ」→「おやつをあげる ＞」→ おやつバッグ で選んだときに呼ばれる
   （引数の snackId が、選んだおやつの名札）

   いやいやタイムの giveSnack() とは別の関数にしている
   あちらは「泣いているこうちゃんを落ち着かせる」ための処理なので、
   いやいやを終わらせる（isTantrum を false にする）までを受け持っている
   こちらは泣いていないときに食べるおやつなので、回復だけを行う

   おやつは、いやいや用と同じバッグ（selectedSnackIds）から取り出す
   ここで1個使えば、そのあといやいやが起きたときに使えるおやつも減る
   ＝「ここで使ってしまって大丈夫か？」を考える場面になる

   ・こうちゃんの体力・機嫌、かかる時間 … 選んだおやつのデータ（snack.energy / mood / minutes）
   ・親の余裕 +2                         … ベンチでひと息つけたぶん（どのおやつでも同じ）
*/
function giveSnackWhileExploring(snackId: SnackId) {
  /* バッグに入っていないおやつなら、何もしないで終わり

     画面にはバッグにあるおやつしか出していないが、
     ここでも確かめることで、万一呼ばれても
     持っていないおやつで回復することがないようにしている

     ※ startStatusChanges() より前に置くのが大事
       あとに置くと、何も起きていないのに決定音が鳴り、
       前の行動の結果表示だけが消えてしまう
  */
  const snack = findSnackInBag(snackId);

  if (!snack) {
    return;
  }

  // 行動する前のステータスを控えておく
  // ※ ここで ☕ ひとやすみ とおやつバッグも閉じる
  startStatusChanges();

  childEnergy.value += snack.energy;
  childMood.value += snack.mood;
  parentCalm.value += 2;
  addMinutes(snack.minutes);

  resultMessage.value = `ベンチに座って${snack.name}を食べました。こうちゃんはうれしそうにもぐもぐしています。`;

  // finishPlayAction() は呼ばない（上の説明のとおり）
  finishCareAction();

  // ステータスの計算がぜんぶ終わってから、食べたおやつをバッグから出す
  removeSnackFromBag(snack.id);
}

/* ===== いやいや中（なだめる場面） =====

   対応は4つ。いやいやの理由（tantrumReason）と激しさ（tantrumLevel）で効きかたがちがう
   1回の対応の結果は、次の3種類のどれか
     ・解決する     … isTantrum を false にする（結果を読んだら、公園へ戻る）
     ・少し落ち着く … レベルが1段下がる（いやいやは続く）
     ・悪化する     … レベルが1段上がる（大いやいやのままなら、親の余裕が減る）

   ※ 並べてある順番は、いやいやタイムの画面に出るコマンドの順番と同じ

   ・お話する … 悔しい・まだ遊びたい なら正解（ナイス対応）
                ぐずぐず・大泣きなら解決、大いやいやなら少し落ち着くだけ
                つかれた・おなかすいた には効かず、悪化
   ・だっこ   … 安全策。どのレベルでも必ず解決（はげしいほど親の体力を多く使う）
                つかれた なら ナイス対応
   ・おやつ   … 相性しだい
                great  … どのレベルでも解決 ＋ ナイス対応
                normal … ぐずぐずなら解決、大泣き以上なら少し落ち着くだけ
                weak   … 悪化
   ・待つ     … ギャンブル。成功すれば解決（ぐずぐず）か少し落ち着く、失敗すると悪化
                成功する確率は 理由 → レベル → 待つの連続 の順に計算する（getWaitSuccessChance()）
                悔しい で成功したら ナイス対応

   同じ対応を続けると効きにくくなる（registerTantrumAction() で数える）
   ナイス対応のボーナスは、1回のいやいやにつき1回だけ（applyNiceTantrumResponse()）
*/

/* 大いやいや（レベル3）に上がった瞬間の、親の余裕の追加コスト（上がった1回だけ） */
const bigTantrumEnterCalmCost = 5;

/* 大いやいや（レベル3）のまま、さらに対応がずれたときの親の余裕の追加コスト（そのたびに） */
const bigTantrumFailureCalmCost = 4;

/* いやいやの状態を「いやいやしていない」に戻す

   戻すもの：理由・レベル・対応の記録・ナイス対応（もらったかどうかと、その表示）
   呼ぶところは3か所
   ・新しいいやいやが始まったとき（checkTantrum()）… 前のいやいやの記録を持ちこさない
   ・いやいやタイムの画面から出るとき（goToNextPlace()）
   ・もう一度あそぶとき（resetGame()）

   ※ isTantrum と tantrumCount はここでは戻さない
     isTantrum は「いやいや中かどうか」を決める大事な印、
     tantrumCount はプレイ全体の記録なので、それぞれの場所ではっきり書き分けている */
function resetTantrumState() {
  tantrumReason.value = null;
  tantrumLevel.value = 1;
  lastTantrumAction.value = null;
  repeatedTantrumActionCount.value = 0;
  hasNiceTantrumResponse.value = false;
  niceTantrumResponseText.value = '';
}

/* いやいやを1段はげしくする（1 → 2 → 3。3 のときは 3 のまま）

   上げたあとのレベルを返す（呼んだ側で「大いやいやになったか」を見るため） */
function increaseTantrumLevel(): TantrumLevel {
  if (tantrumLevel.value === 1) {
    tantrumLevel.value = 2;
  } else {
    tantrumLevel.value = 3;
  }

  return tantrumLevel.value;
}

/* いやいやを amount 段だけ落ち着かせる（3 → 2 → 1。1 より下にはならない）

   ※ 1 まで下がっても、いやいやは終わらない
     終わらせるのは、それぞれの対応で isTantrum を false にしたときだけ */
function decreaseTantrumLevel(amount = 1) {
  for (let i = 0; i < amount; i++) {
    if (tantrumLevel.value === 3) {
      tantrumLevel.value = 2;
    } else if (tantrumLevel.value === 2) {
      tantrumLevel.value = 1;
    }
  }
}

/* 対応がずれて、いやいやが悪化したときの共通処理

   ・ぐずぐず／大泣き … レベルを1段上げる
                         大泣き → 大いやいや に上がった瞬間だけ、親の余裕 -5
   ・大いやいや       … これ以上は上がらない代わりに、親の余裕 -4（そのたびに）
                         「こうちゃんはこれ以上悪化しないが、親のほうが少しずつしんどくなる」

   結果の文章のうしろに「悪化した」ことが分かる一文を足す

   ※ 呼ぶ前に、resultMessage へ「何をしたか」の文を入れておくこと
   ※ saveStatusChanges() より前に呼ぶこと（追加コストも「今回の変化」に入れるため） */
function applyTantrumFailurePenalty() {
  if (tantrumLevel.value === 3) {
    parentCalm.value -= bigTantrumFailureCalmCost;
    resultMessage.value += 'こうちゃんは全身でいやいやしたままです。親のほうも、だんだんしんどくなってきました……。';
    return;
  }

  // 1段上げて、大いやいやに上がったかどうかを見る
  // ※ 戻り値で受け取るのは、TypeScript がすぐ上の if で「ここでは 3 ではない」と覚えたままになり、
  //   tantrumLevel.value === 3 と書くと「ありえない比較」とエラーにしてしまうため
  const newLevel = increaseTantrumLevel();

  if (newLevel === 3) {
    parentCalm.value -= bigTantrumEnterCalmCost;
    resultMessage.value += 'こうちゃんの泣き声がさらに大きくなりました。親もちょっと焦ってきます……。';
    return;
  }

  resultMessage.value += 'こうちゃんの泣き声が、さっきより大きくなってしまいました……。';
}

/* いやいや中に選んだ対応を記録する（どの対応も、startStatusChanges() のすぐあとに呼ぶ）

   直前と同じ対応なら repeatedTantrumActionCount を1増やし（最大2）、
   ちがう対応なら 0 に戻す */
function registerTantrumAction(action: TantrumAction) {
  if (lastTantrumAction.value === action) {
    repeatedTantrumActionCount.value = Math.min(repeatedTantrumActionCount.value + 1, 2);
  } else {
    repeatedTantrumActionCount.value = 0;
  }

  lastTantrumAction.value = action;
}

/* ナイス対応のボーナスを足す（おでかけポイント +3 ／ 親の余裕 +2）

   「こうちゃんの気持ちに合った対応ができた」ごほうび
   ボーナスを足すのはここだけにして、あちこちの関数に += 3 を書かない

   message … 「✨ ナイス対応！」の下に出す文章（省略したら、いつもの文章）

   ■ 1回のいやいやにつき1回だけ
     すでにもらっている（hasNiceTantrumResponse が true）ときは、何もしないで終わる
     ボーナスも「✨ ナイス対応！」の表示も出さない
     （表示には「+3」「+2」のしるしがあるので、足していないのに出すと食いちがうため）

   ※ 必ず saveStatusChanges() より前に呼ぶこと
     前に呼べば、ボーナスのぶんも「今回の変化（合計）」に入る
   ※ そのあとの fixAllStatus() と checkGameOver() は、呼んだ側でいつもどおり行う
     （ボーナスが入っても、GAME OVERの判定は飛ばさない）
*/
function applyNiceTantrumResponse(message = 'こうちゃんの気持ちが分かったみたい！') {
  if (hasNiceTantrumResponse.value) {
    return;
  }

  hasNiceTantrumResponse.value = true;

  outingPoint.value += niceTantrumBonusOutingPoint;
  parentCalm.value += niceTantrumBonusParentCalm;

  niceTantrumResponseText.value = message;
}

/* ① だっこする（安全策）

   いやいや対応の中では、いちばん確実に落ち着かせられる方法
   理由がどれでも、レベルがどれでも、だっこすれば必ず いやいや は終わる
   ただし親の体力を16も使ううえ、公園で泣かれているあいだの
   気持ちの消耗まではゼロにならないので、親の余裕は少し減る

   泣きかたがはげしいほど、落ち着くまでだっこしているのが大変なので、親の体力を多めに使う
   ・ぐずぐず   … 追加なし     （親の体力 -16）
   ・大泣き     … さらに -4   （親の体力 -20）
   ・大いやいや … さらに -8   （親の体力 -24）

   「つかれた」いやいやのときは、どのレベルでも ナイス対応 になる

   ※ 必ず終わる対応なので、同じ対応の連続（効きにくくなる）は関係しない
     記録だけは、ほかの対応とそろえて残しておく
*/
function hugChild() {
  // 行動する前のステータスを控えておく
  startStatusChanges();
  registerTantrumAction('hug');

  childEnergy.value += 12;
  childMood.value += 15;
  parentEnergy.value -= 16;
  parentCalm.value -= 5;
  addMinutes(10);

  // はげしく泣いているほど、だっこで落ち着かせるのに体力を使う
  if (tantrumLevel.value === 2) {
    parentEnergy.value -= 4;
  } else if (tantrumLevel.value === 3) {
    parentEnergy.value -= 8;
  }

  isTantrum.value = false;

  if (tantrumLevel.value === 1) {
    resultMessage.value = 'ぎゅっとだっこすると、こうちゃんは肩にぺたん。少しずつ落ち着いてきました。';
  } else {
    resultMessage.value = '泣いているこうちゃんをぎゅっとだっこ。背中をとんとんすると、少しずつ力がぬけてきました。';
  }

  // 「つかれた」いやいやなら、歩きつかれた足を休ませてあげられた＝ナイス対応
  // ※ saveStatusChanges() より前に呼んで、ボーナスも「今回の変化」に入れる
  if (tantrumReason.value === 'tired') {
    resultMessage.value += 'だっこで足も休めて、ほっとしたようです。';
    applyNiceTantrumResponse();
  }

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // だっこは親の体力を16〜24も使うので、残りが少ないとここでGAME OVERになる
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② おやつをあげる

   「おやつをあげる ＞」→ おやつバッグ で選んだときに呼ばれる
   （引数の snackId が、選んだおやつの名札）

   効果は3つに分けて考える
   ・おやつごとにちがう … こうちゃんの体力・機嫌、かかる時間（snack.energy / mood / minutes）
   ・どのおやつでも同じ … いやいや対応としての効果
                           おでかけポイント +2 ／ 親の体力 -5 ／ 親の余裕 -3
   ・いやいやの理由との相性（getSnackTantrumFit()）× いまのレベル … いやいやがどうなるか
       great  … どのレベルでも解決 ＋ ナイス対応
       normal … ぐずぐずなら解決／大泣き・大いやいやなら1段落ち着くだけ（続く）
       weak   … 悪化する（applyTantrumFailurePenalty()）

   ※ どの相性でも、おやつは食べたのでバッグから減る
   ※ weak でも、おやつそのものの効果（体力・機嫌の回復）はそのまま入る
     こうちゃんは実際に食べているので、おなかや体は回復する
     ただ「まだあそぶー！」のような気持ちのほうは、おやつではおさまらなかった、という考え方
   ※ おやつは種類ごとに別の対応として記録する（グミ → せんべい は「同じ対応のくり返し」ではない）
*/
function giveSnack(snackId: SnackId) {
  // バッグに入っていないおやつなら、何もしないで終わり
  // （giveSnackWhileExploring() と同じ理由で、startStatusChanges() より前に確かめる）
  const snack = findSnackInBag(snackId);

  if (!snack) {
    return;
  }

  // 行動する前のステータスを控えておく
  // ※ ここでおやつバッグも閉じる
  startStatusChanges();
  registerTantrumAction(`snack:${snack.id}`);

  // おやつごとにちがう効果
  childEnergy.value += snack.energy;
  childMood.value += snack.mood;
  addMinutes(snack.minutes);

  // いやいや対応として、どのおやつでも同じ効果
  outingPoint.value += 2;
  parentEnergy.value -= 5;
  // いやいや対応の中では、いちばん軽く済む方法（親の余裕は3しか減らない）
  // そのかわり、おやつはバッグに入れてきた2個しか無い
  parentCalm.value -= 3;

  // いまのいやいやの理由と、このおやつの相性を調べる
  const fit = getSnackTantrumFit(snack.id);

  if (fit === 'great') {
    // ぴったり：どんなにはげしく泣いていても、落ち着いてくれる → 解決 ＋ ナイス対応
    isTantrum.value = false;

    resultMessage.value = `${snack.name}を見せると、「……たべる」。もぐもぐするうちに、こうちゃんの涙が止まってきました。`;

    if (currentTantrumReasonInfo.value) {
      resultMessage.value += currentTantrumReasonInfo.value.greatSnackText;
    }

    // ※ saveStatusChanges() より前に呼んで、ボーナスも「今回の変化」に入れる
    applyNiceTantrumResponse();
  } else if (fit === 'normal' && tantrumLevel.value === 1) {
    // ふつう × ぐずぐず：おやつがうれしくて、そのまま落ち着く → 解決
    isTantrum.value = false;

    resultMessage.value = `${snack.name}を見せると、「……たべる」。もぐもぐするうちに、こうちゃんの涙が止まってきました。`;
  } else if (fit === 'normal') {
    // ふつう × 大泣き・大いやいや：少し落ち着くが、気持ちまではおさまらない → 1段下がって続く
    decreaseTantrumLevel();

    resultMessage.value = `${snack.name}を食べると、泣き声は少し小さくなりました。でも、まだいやいやは続いています。`;
  } else {
    // ずれている：食べてはくれたが、泣いている理由には合っていない → 悪化
    // （同じいやいやが続くだけなので、tantrumCount も tantrumReason も変えない）
    const complaint = currentTantrumReasonInfo.value?.complaint ?? 'いやー！';

    resultMessage.value = `${snack.name}は食べたけれど、「${complaint}」。まだいやいやは続いています。`;

    applyTantrumFailurePenalty();
  }

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // おやつは親の負担が軽い選択だが、念のためここでも判定しておく
  checkGameOver();

  // ステータスの計算がぜんぶ終わってから、食べたおやつをバッグから出す
  removeSnackFromBag(snack.id);

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ③ お話してみる

   泣いているこうちゃんに向き合って、気持ちを言葉にしてあげる
   だっこほど体力は使わないが、向き合うぶん親の余裕は少し使う
   （親の体力 -2 ／ 親の余裕 -4 ／ 5分 … どの理由・レベルでも同じ）

   ■ 悔しい／まだ遊びたい … お話が正解（機嫌 +12 ／ ナイス対応）
     ・ぐずぐず・大泣き … 気持ちを分かってもらえて、解決
     ・大いやいや       … 泣き声が大きすぎて、1回では話がぜんぶ入らない
                           → 大泣きに1段落ち着くだけ（もう一度お話すれば解決できる）
                           対応そのものは正しいので、ナイス対応は付ける
     ・続けてお話したとき … 親の余裕 さらに -2（同じ説明をくり返すのは、親も少し疲れる）

   ■ つかれた／おなかすいた … 体のほうが限界なので、お話では効かない
     ・機嫌 +2 だけ入り、いやいやは悪化する（applyTantrumFailurePenalty()）
     ・続けてお話したとき … 親の余裕 さらに -3（届かない話をくり返して、親もしんどい）

   ※ いやいやが続いても checkTantrum() は呼ばない
     新しいいやいやではなく同じいやいやが続いているだけなので、
     tantrumCount も tantrumReason も変えない
*/
function talkToChild() {
  // 行動する前のステータスを控えておく
  startStatusChanges();
  registerTantrumAction('talk');

  // 直前もお話だった（同じ話をくり返している）かどうか
  const isRepeatedTalk = repeatedTantrumActionCount.value > 0;

  // お話する共通のコスト（どの理由でも同じ）
  parentEnergy.value -= 2;
  parentCalm.value -= 4;
  addMinutes(5);

  if (tantrumReason.value === 'frustrated' || tantrumReason.value === 'wantMorePlay') {
    // お話が正解の理由
    childMood.value += 12;

    if (isRepeatedTalk) {
      parentCalm.value -= 2;
    }

    // 理由に合った声かけ
    const words = tantrumReason.value === 'frustrated' ? '「うまくできなくて悔しかったんだね」' : '「まだ遊びたかったんだね」';

    if (tantrumLevel.value === 3) {
      // 大いやいや：話は聞こえているが、まず少し落ち着くところから → 1段下がって続く
      decreaseTantrumLevel();

      resultMessage.value = `${words}と話すと、こうちゃんの泣き声が少し小さくなりました。まだ涙は止まりません。`;
    } else {
      // ぐずぐず・大泣き：気持ちを分かってもらえて、解決
      isTantrum.value = false;

      resultMessage.value =
        tantrumReason.value === 'frustrated'
          ? `${words}と話すと、こうちゃんは涙をふいて、少しずつ落ち着いてきました。`
          : `${words}と話すと、こうちゃんは「うん…」とうなずいて、少し落ち着きました。`;
    }

    if (isRepeatedTalk) {
      resultMessage.value += '同じ話のくり返しで、親も少し疲れました。';
    }

    // ※ saveStatusChanges() より前に呼んで、ボーナスも「今回の変化」に入れる
    //   （1回のいやいやで2回目のときは、applyNiceTantrumResponse() の中で何もしない）
    applyNiceTantrumResponse();
  } else {
    // つかれた・おなかすいた：お話だけでは気持ちがおさまらない → 悔しさが増して悪化
    childMood.value += 2;

    if (isRepeatedTalk) {
      parentCalm.value -= 3;
    }

    if (tantrumReason.value === 'tired') {
      resultMessage.value = '話しかけてみましたが、「つかれた〜！」。こうちゃんは、まだ動きたくないようです。';
    } else {
      resultMessage.value = '話しかけてみましたが、「おなかすいた〜！」。こうちゃんは、おなかを押さえたままです。';
    }

    if (isRepeatedTalk) {
      resultMessage.value += '同じ話では、もう届かないようです。';
    }

    applyTantrumFailurePenalty();
  }

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // 親の余裕が残り少ないと、お話でもGAME OVERになることがある
  checkGameOver();

  // いやいやが終わっても続いても、一番上（0＝お話する）から選べるように戻す
  selectedCommandIndex.value = 0;
}

/* 「少し待ってみる」が成功する確率（0.7 なら 70%）

   次の順番で計算する（計算は「%」の整数で行い、最後に 0〜1 の小数へ直す）

   ① 理由ごとの基本の成功率
      ・悔しい       … 70%（時間がたつと、自分で気持ちを立てなおせることが多い）
      ・まだ遊びたい … 55%
      ・つかれた     … 35%（待っていても、体の疲れはとれない）
      ・おなかすいた … 20%（待っているあいだも、おなかはすいたまま）
   ② いやいやの激しさ
      ・ぐずぐず   … そのまま
      ・大泣き     … -10
      ・大いやいや … -20
   ③ 待つを続けているか
      ・1回目         … そのまま
      ・2回続けた     … -15
      ・3回以上続けた … -30
   ④ 0〜100% の中におさめる
      例）おなかすいた・大いやいや・3回目 なら 20 - 20 - 30 = -30 → 0%

   ※ ③を正しく数えるため、waitCalmly() の中で registerTantrumAction('wait') のあとに呼ぶこと
   ※ %の整数で足し引きしているのは、0.55 - 0.1 のような小数どうしの計算だと
     0.45000000000000007 のような小さな誤差が出ることがあるため
*/
function getWaitSuccessChance() {
  // ① 理由ごとの基本の成功率（理由が決まっていないとき（ふつうは起きない）は50%）
  let chancePercent = 50;

  switch (tantrumReason.value) {
    case 'frustrated':
      chancePercent = 70;
      break;
    case 'wantMorePlay':
      chancePercent = 55;
      break;
    case 'tired':
      chancePercent = 35;
      break;
    case 'hungry':
      chancePercent = 20;
      break;
  }

  // ② いやいやの激しさ
  if (tantrumLevel.value === 2) {
    chancePercent -= 10;
  } else if (tantrumLevel.value === 3) {
    chancePercent -= 20;
  }

  // ③ 待つを続けているか（直前も「待つ」だったときだけ、くり返しの回数を見る）
  const waitRepeatCount = lastTantrumAction.value === 'wait' ? repeatedTantrumActionCount.value : 0;

  if (waitRepeatCount === 1) {
    chancePercent -= 15;
  } else if (waitRepeatCount >= 2) {
    chancePercent -= 30;
  }

  // ④ 0〜100% におさめる
  chancePercent = Math.min(100, Math.max(0, chancePercent));

  return chancePercent / 100;
}

/* ④ 少し待ってみる（ギャンブル）

   親の体力は少し回復するが、失敗することがある
   成功する確率は getWaitSuccessChance() で決める（理由 → レベル → 待つの連続）

   ・成功 … ぐずぐずなら解決／大泣き・大いやいやなら1段落ち着く（いやいやは続く）
            悔しい で成功したら、自分で気持ちを立てなおせた＝ナイス対応
            （1段落ち着くだけのときも、見守ったこと自体は良かったので、ナイス対応にする）
   ・失敗 … いやいやが悪化する（applyTantrumFailurePenalty()）

   成功しても失敗しても、下のステータスの増減と時間（15分）は毎回発生する
   ＝「もう一度待つか、だっこするか、おやつやお話を試すか」を考える場面になる

   いやいや対応の4つは、どれも親の余裕が減る
   何で払うかがちがうだけ（ずれた対応を続けて大いやいやになるほど、さらに重くなる）
   ・お話する … 親の体力 -2       ／ 親の余裕 -4 （理由が合えば正解、合わないと悪化）
   ・だっこ   … 親の体力 -16〜-24 ／ 親の余裕 -5 （必ず終わる安全策）
   ・おやつ   … おやつ -1         ／ 親の余裕 -3 （相性が合えば効率よく終わる。1日2個まで）
   ・待つ     … 親の体力 +2       ／ 親の余裕 -18（体力は減らないが、失敗すると悪化）
*/
function waitCalmly() {
  // 行動する前のステータスを控えておく
  startStatusChanges();
  registerTantrumAction('wait');

  childEnergy.value -= 4;
  childMood.value -= 6;
  parentEnergy.value += 2;
  // 泣いている横で待つのがいちばんこたえる
  // 体力は使わないが、そのぶん親の余裕で払う（失敗すればもう一度払う）
  parentCalm.value -= 18;
  addMinutes(15);

  // 0以上1未満のランダムな数を出して、成功する確率より小さければ成功
  // 例）悔しい・ぐずぐず・1回目（0.7）なら、0〜0.7未満が出れば成功（＝70%）
  // ※ 上で registerTantrumAction('wait') を呼んだあとなので、「待つの連続」も確率に入る
  const calmSuccess = Math.random() < getWaitSuccessChance();
  const isFrustrated = tantrumReason.value === 'frustrated';

  if (calmSuccess) {
    if (tantrumLevel.value === 1) {
      // ぐずぐず：落ち着いてくれたので、いやいや終了
      isTantrum.value = false;

      resultMessage.value = 'となりで静かに待っていると、こうちゃんは自分で涙をふいて、少しずつ落ち着いてきました。';
    } else {
      // 大泣き・大いやいや：少し落ち着くが、まだ続く → 1段下がる
      decreaseTantrumLevel();

      resultMessage.value = 'しばらく待つと、泣き声が少し小さくなりました。でも、まだ涙は止まりません。';
    }

    // 悔しい気持ちを、こうちゃんが自分で立てなおそうとできた＝ナイス対応（1回のいやいやで1回だけ）
    // ※ saveStatusChanges() より前に呼んで、ボーナスも「今回の変化」に入れる
    if (isFrustrated) {
      applyNiceTantrumResponse('そっと見守ったのが、よかったみたい！');
    }
  } else {
    // 失敗：同じいやいやが続いたまま、悪化する
    // ここでは checkTantrum() を呼ばない（新しいいやいやではないので、tantrumCount も tantrumReason も変えない）
    const complaint = currentTantrumReasonInfo.value?.complaint;

    resultMessage.value = complaint
      ? `しばらく待ってみましたが、こうちゃんは「${complaint}」。まだいやいやしています。`
      : 'しばらく待ってみましたが、こうちゃんはまだいやいやしています。';

    // 待つを続けていると効きにくくなることを、こうちゃんの様子として伝える
    // （「別の対応を試したほうがよさそう」と気づけるようにするための1文）
    if (repeatedTantrumActionCount.value > 0) {
      resultMessage.value += 'このまま待っていても、なかなか落ち着かなさそうです。';
    }

    applyTantrumFailurePenalty();
  }

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // 待つのは親の余裕が18減るので、残りが少ないとここでGAME OVERになる
  // ※ GAME OVERになると currentEvent が 'gameOver' に変わるので、
  //   いやいやが続いていてもGAME OVER画面のほうが優先される
  checkGameOver();

  // 失敗したときも、すぐ次のコマンドを選べるように一番上（0＝お話する）へ戻す
  selectedCommandIndex.value = 0;
}

/* ============================================================
   とつぜんのできごと（通常行動のあと、20%で起こる出来事）

   通常の場所の行動とちがうところ
   ・finishPlayAction() を呼ばない
     → runRandomEvent() / checkTantrum() / checkSuddenEvent() が動かないので、
       とつぜんのできごとから続けてとつぜんのできごとが起きることはない
     → visitedPlaces（探検した場所）にも入らない
   ・そのかわり、どの行動も次の4つは必ず行う
     ① startStatusChanges()  行動前のステータスを控える（いちばん最初）
     ② saveStatusChanges()   「今回の変化」を作る（0〜100に丸める前）
     ③ fixAllStatus()        ステータスを0〜100に収める
     ④ checkGameOver()       限界をむかえていないか判定する

   ※ おでかけポイントは addOutingPoint() ではなく、そのまま足している
     addOutingPoint() は「2回目の場所は半分」というルールの関数で、
     とつぜんのできごとは「場所」ではないため
   ============================================================ */

/* ===== とつぜんのできごと：救急車のサイレン ===== */

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

/* ===== とつぜんのできごと：テントウムシ ===== */

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

/* ===== とつぜんのできごと：犬が近づいてくる ===== */

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

/* ===== とつぜんのできごと：こうちゃんがころんだ =====

   ※ このイベントからは checkTantrum() を呼ばない
     「ころぶ → 選ぶ → 結果」だけの、シンプルな流れにしている

   ※ おやつは使わない（どれを選んでも、バッグのおやつは減らない）
     選択肢はいつも同じ4つで、画面の並び・runSelectedCommand() の番号・下の関数の並びは同じ順番
       0 すぐにだっこする／1 痛いの痛いのとんでいけ〜／2 ベンチで少し休む／3 「大丈夫？」と見守る

   ※ 下の4つに書いてある こうちゃん の数字は、
     「ころんだ分」と「なだめた分」を足したあとの合計

     ころんだ時点で、ひざは痛いし、びっくりして泣きそうになっている
     そこからどれだけ取り返せるかがこのイベントなので、
     じょうずになだめても、ころぶ前より良くはならない
     （＝こうちゃんの数字は、プラスにしない）

     ・体力 … ころべば必ず減る。ベンチでゆっくり休めば、ようやく±0まで戻る
       （ベンチ 0 ／ だっこ -3 ／ 痛いの痛いの -4 ／ 見守る -6）
     ・機嫌 … だっこなら、ころぶ前と同じところまで戻る（±0）
       （だっこ 0 ／ ベンチ -1 ／ 痛いの痛いの -2 ／ 見守る -8）

   ※ 目の前で子どもがころぶと、どうしてもヒヤッとする
     そのため、どれを選んでも親の余裕は減る
     何で払うかがちがうだけで、いやいや対応とまったく同じ考えかた
     ・だっこ       … 親の体力 -10 ／ 親の余裕 -3 ／ 10分（親の体力を大きく使って、しっかり対応）
     ・痛いの痛いの … 親の体力 -3  ／ 親の余裕 -5 ／  5分（バランス型）
     ・ベンチ       … 親の体力 -2  ／ 親の余裕 -1 ／ 15分（時間を多く使って、安全に立て直す）
     ・見守る       … 親の体力 +1  ／ 親の余裕 -8 ／  5分（親の体力は減らないが、こうちゃんの負担がいちばん大きい）

   ※ ベンチは、ステータスだけ見れば4つの中でいちばん安全
     そのかわり15分（4つの中でいちばん長い）かかるのがコスト
     お昼が近いときや、まだ回りたい場所が残っているときは、ほかの対応と見くらべて選ぶ
*/

/* ① すぐにだっこする */
function hugAfterFall() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  // 機嫌は ±0（ころんだ分を、だっこでちょうど取り返した）
  // ＝ここでは childMood をさわらない
  // 体力のほうは、ひざを打ったぶんだけ残る
  childEnergy.value -= 3;
  parentEnergy.value -= 10;
  parentCalm.value -= 3;
  addMinutes(10);

  resultMessage.value = 'すぐにかけよってぎゅっとだっこすると、こうちゃんはほっとした顔になりました。びっくりした気持ちは、ころぶ前と同じところまで戻ったようです。ひざはまだ少しひりひりします。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();

  // だっこは親の体力を10使うので、残りが少ないとここでGAME OVERになる
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ② 痛いの痛いのとんでいけ〜

   だっこ（親の体力-10）ほど親の力を使わずに、
   見守る（機嫌-8）よりも こうちゃん の気持ちを立てなおせる、
   ちょうど真ん中の選択肢（バランス型）
*/
function blowPainAway() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  // だっこほどではないが、ころんだ分をだいぶ取り返せる
  childMood.value -= 2;
  childEnergy.value -= 4;
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

/* ③ ベンチで少し休む

   近くのベンチに座って、ひざの痛みが落ち着くまで待つ
   こうちゃんの体力は±0まで戻り、機嫌も親の体力・余裕もほとんど減らない
   そのかわり、4つの中でいちばん時間がかかる（15分）
   ※ おやつは食べないので、バッグのおやつは減らない
*/
function restOnBenchAfterFall() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  // 体力は、座って休んでちょうど ±0
  // ＝ここでは childEnergy をさわらない
  childMood.value -= 1;
  parentEnergy.value -= 2;
  parentCalm.value -= 1;
  addMinutes(15);

  resultMessage.value = '近くのベンチに座って、こうちゃんと少し休むことにしました。ひざの痛みもだんだん落ち着いてきたようで、こうちゃんはほっとした顔をしています。';

  // 今回の変化量を記録してから、0〜100に丸める
  saveStatusChanges();
  fixAllStatus();
  checkGameOver();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
}

/* ④ 「大丈夫？」と見守る */
function watchAfterFall() {
  // 行動する前のステータスを控えておく
  startStatusChanges();

  // なだめていないので、ころんだ分がほとんどそのまま残る
  childMood.value -= 8;
  childEnergy.value -= 6;
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

/* ===== とつぜんのできごと：噴水が突然出る ===== */

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
  //     いやいや や とつぜんのできごと の時間で必ずはみ出してしまい、
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

/* 遊びつかれて、親かこうちゃんの体力が減っているかどうか（isWornOut() の理由のうち「体力」だけ）

   Cランクの「ちょっと遊びすぎた！」は、これが true のときだけ出す
   isWornOut() は、機嫌・余裕・いやいや・お昼すぎ でも true になるので、
   それだけで決めると、少ししか遊んでいないのに「遊びすぎた」と出てしまう
   （機嫌は55スタートで、ぐずりだすライン50のすぐ上。少し下がっただけで isWornOut() が true になる）
   体力は遊ぶたびにしっかり減るので、ここが下がっていれば「たくさん遊んで疲れた」と言える */
function isTiredFromPlaying() {
  return parentEnergy.value < 50 || childEnergy.value < 30;
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
  if (isTiredFromPlaying()) {
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

   ※ 同じランクでも、実際に何が起きたかで文章を変えている
     画面には「回った場所」「帰った時間」「機嫌」も出ているので、
     文章がそれとくいちがうと、遊んでいる人が混乱してしまうため
     ・Aランク … こうちゃんの機嫌が低いときは「楽しそう」と書かない
     ・Bランク … 時間オーバーか／まだ行っていない場所があるかで書きわける
     ・C／Dランク … 「あまり遊べなかった」系の文は、遊んだ回数が少ないときだけ使う
                     （同じ場所でくりかえし遊んだ人に言うと話が合わない）
     ・Cランク    … 「遊びすぎた」は、体力が減っているときだけ使う（isTiredFromPlaying()）
                     （機嫌・余裕・いやいや・時間だけで疲れた判定になった人に言うと話が合わない）

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

    // こうちゃんの機嫌が下がったまま帰ってきたとき
    // （点数はよくても「こうちゃんも楽しそう」と書くと、
    //   画面に出ている機嫌の数字と食いちがってしまう）
    if (childMood.value < fussMoodLine) {
      endingTitle.value = 'いい探検、でもおつかれ気味';
      endingMessage.value = 'いろいろな場所を回れました！ただ、こうちゃんは最後すこしぐずり気味。次は休みやおやつをはさみながら回ってみよう！';
      return;
    }

    endingTitle.value = '最高のおでかけ！';
    endingMessage.value = 'いろいろな場所を回って、こうちゃんも楽しそう。とてもいいおでかけになりました！';
    return;
  }

  // 55〜69点
  if (finalScore.value >= 55) {
    endingRank.value = 'Bランク';

    // ① お昼をすぎて帰ってきたとき
    //   Bランクのほとんどがこれ
    //   たくさん回れたぶん時間がかかり、時間オーバーで10点ひかれている
    //   ここで「次はちがう場所にも行ってみよう」と書くと、
    //   6か所ぜんぶ回った人にまで探検不足だと言うことになってしまう
    if (currentMinutes.value > 12 * 60) {
      endingTitle.value = '時間ぎりぎり大冒険！';
      endingMessage.value = 'たくさん探検できました！でも、夢中になっているうちにお昼をすぎてしまいました。次はもう少し早めに切りあげてみよう！';
      return;
    }

    // ② 時間内に帰れたけれど、まだ行っていない場所が残っているとき
    if (visitedPlaces.value.length < totalPlaceCount) {
      endingTitle.value = '楽しい公園探検！';
      endingMessage.value = '楽しく公園を探検できました。次はちがう場所にも行ってみよう！';
      return;
    }

    // ③ 時間内に6か所ぜんぶ回れたとき
    endingTitle.value = '公園ぜんぶ制覇！';
    endingMessage.value = '公園をぜんぶ回って、時間内に帰ってこられました！次はこうちゃんの機嫌や、見つけたものの数も気にしてみよう！';
    return;
  }

  // 38〜54点
  if (finalScore.value >= 38) {
    endingRank.value = 'Cランク';

    // 疲れて帰ってきたとき
    if (isWornOut()) {
      // たくさん回ったうえで、遊びつかれて体力が減ったのなら「遊びすぎた」でよい
      if (visitedPlaces.value.length >= 3 && isTiredFromPlaying()) {
        endingTitle.value = 'ちょっと遊びすぎた！';
        endingMessage.value = 'ちょっと疲れたけれど、それも今日の思い出。次はもう少し余裕をもって探検してみよう！';
        return;
      }

      // いろいろ回ったけれど、体力はまだ残っているとき
      // （機嫌が下がった・親の余裕が減った・いやいやが起きた・お昼をすぎた、で疲れた判定になった形）
      // ここで「遊びすぎた」と書くと、そんなに遊んでいない人と話が合わない
      if (visitedPlaces.value.length >= 3) {
        endingTitle.value = 'ちょっとバタバタ探検！';
        endingMessage.value = 'いろいろな場所を回れたけれど、ちょっとバタバタした1日でした。次は機嫌や時間も見ながら、ゆったり回ってみよう！';
        return;
      }

      // 回った場所は少ないけれど、同じ場所でたっぷり遊んだとき
      // （お気に入りの場所を見つけて、そこで遊びこんだ形）
      // ここで「あまり遊べなかった」と書くと、
      // 何回も遊んだ人に「遊べていない」と言うことになってしまう
      if (playCount.value >= playedALotLine) {
        endingTitle.value = 'お気に入りでたっぷり！';
        endingMessage.value = 'お気に入りの場所で、たっぷり遊べました！そのぶん少しおつかれです。次はちがう場所にも行ってみよう！';
        return;
      }

      // あまり遊べていないのに疲れたとき
      // （いやいややちいさなできごとで、先に気持ちや体力を持っていかれた形）
      // ここで「遊びすぎた」と書くと、2回しか遊んでいない人と話が合わない
      endingTitle.value = '今日はちょっと大変…';
      endingMessage.value = 'あまり探検できないうちに、どっと疲れてしまいました。次は元気なうちに、どんどん先へ進んでみよう！';
      return;
    }

    // たっぷり遊んだのに、二人とも元気なまま帰ってきたとき
    // （のんびりしたコマンドばかり選ぶと、疲れないかわりに点も伸びない）
    // ここで「あっさり」と書くと、何回も遊んだ人と話が合わない
    if (playCount.value >= playedALotLine) {
      endingTitle.value = 'のんびりマイペース！';
      endingMessage.value = 'あわてず、のんびり遊びました。二人ともまだまだ元気です！次はもう少し思いきり遊んで、おでかけポイントもためてみよう！';
      return;
    }

    // あまり遊ばないうちに、元気なまま帰ってきたとき
    endingTitle.value = 'あっさり公園さんぽ';
    endingMessage.value = '二人ともまだまだ元気なまま、おうちへ帰ってきました。次はもう少し公園の中を探検してみよう！';
    return;
  }

  // 0〜37点
  endingRank.value = 'Dランク';

  // 疲れて帰ってきたとき
  if (isWornOut()) {
    // たくさん回ったうえで疲れたとき
    if (visitedPlaces.value.length >= 3) {
      endingTitle.value = '今日は大変だった……';
      endingMessage.value = '今日はちょっと大変な公園探検でした。次は無理せず、休みながら遊んでみよう！';
      return;
    }

    // 回った場所は少ないけれど、同じ場所でたっぷり遊んだとき
    // 遊んだ回数は多いので「あまり遊べないうちに」とは書かない
    if (playCount.value >= playedALotLine) {
      endingTitle.value = '遊びこんでへとへと…';
      endingMessage.value = 'お気に入りの場所で遊びこんで、二人ともへとへとになりました。次はいろいろな場所も探検してみよう！';
      return;
    }

    // あまり遊べていないのに疲れたとき
    // 「無理せず休みながら」と書くと、まだ遊んでいない人には合わないので変える
    endingTitle.value = '今日は大変だった……';
    endingMessage.value = 'あまり遊べないうちに、二人ともへとへとになってしまいました。次は元気なうちに探検してみよう！';
    return;
  }

  // たっぷり遊んだのに、二人とも元気なまま帰ってきたとき
  // 遊んだ回数は多いので「着いたばかり」とは書かない
  if (playCount.value >= playedALotLine) {
    endingTitle.value = 'のんびり公園さんぽ';
    endingMessage.value = 'のんびり遊んで、二人ともまだまだ元気なまま帰ってきました。次はもっと思いきり遊んで、おでかけポイントをためてみよう！';
    return;
  }

  // 公園に来たばかりで帰ってきたとき
  endingTitle.value = 'ちょっとだけ公園';
  endingMessage.value = '公園に着いたばかりなのに、もう帰り道。こうちゃんはまだ遊びたそうです。次はもっと探検してみよう！';
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

  if (endingRank.value !== 'S+ランク') {
    return;
  }

  /* もう解放済みなら、お知らせは出さない
     保存場所（localStorage）も読みなおしているのは、
     このページを開いたあとに、別のタブでS+を取っていることもあるため */
  if (hasUnlockedSPlusSong.value || loadHasUnlockedSPlusSong()) {
    hasUnlockedSPlusSong.value = true;

    return;
  }

  // このブラウザで、はじめての解放
  hasUnlockedSPlusSong.value = true;
  isSPlusSongNewlyUnlocked.value = true;
  saveSPlusSongUnlocked();
}

/* ゴールへ向かう（判定して結果画面へ） */
function goToGoal() {
  // GAME OVERになったときは、S+〜Dランクの判定はしない
  if (currentEvent.value === 'gameOver') {
    return;
  }

  /* BGMを止める（ゴールしたので公園での探検は終わり）
     先に止めることで、このあとのファンファーレがBGMに埋もれない

     ※ いやいやBGMも止めておく
       いやいや対応中に12:00を過ぎると、いやいやタイムからそのまま
       ここへ来ることがあるため

     ※ こもれびの広場BGMも止めておく
       秘密の場所で遊んでいるうちに12:00を過ぎることがある
       （11:50に入って20分遊ぶと12:10）
       そのときは、結果カードを読んでいるあいだはこもれびの広場BGMのままにして、
       「次の場所を選ぶ」を押したこのタイミングで止める

       この場合、公園BGMは一瞬も鳴らさない
       goToNextPlace() では「12:00を過ぎていたら公園BGMを鳴らさない」ように
       分かれているので、こもれびの広場BGM → そのままリザルトBGM、となる */
  stopParkBgm();
  stopSecretBgm();
  stopTantrumBgm();

  /* ゴール音「タタターン♪」

     GAME OVERのときは、すぐ上の return でここまで来ないので鳴らない
     また、ゴールでは通常の決定音を鳴らさない（ファンファーレが埋もれないように）
  */
  playGoalSound();

  resultMessage.value = '';
  statusChanges.value = null;
  addMinutes(10);

  // サブメニュー「☕ ひとやすみ」も閉じておく
  // （公園入口からそのままゴールへ向かうこともあるため）
  closeCareMenu();

  // 新しいコマンド画面になるので、選択中のコマンドを一番上（0）に戻す
  selectedCommandIndex.value = 0;
  judgeResult();

  /* S+ランクなら、うた入りエンディングBGMを解放する（はじめてなら、お知らせも出す）
     ランクが決まった直後に呼ぶ（このあと鳴らすリザルトBGMも、同じランクで曲を選ぶ） */
  unlockSPlusSongIfEarned();

  currentEvent.value = 'goal';

  /* リザルトBGMを鳴らしはじめる

     すぐ鳴らすと、上で鳴らしたゴール音「タタターン♪」と重なってしまうので、
     playResultBgmSoon() の中で少しだけ間を空けてから始める
     （待つのは音だけで、結果画面はすぐ表示される）

     ※ currentEvent を 'goal' にしたあとで呼ぶこと
       playResultBgmSoon() は、鳴らす直前に
       「まだ結果画面にいるか」を currentEvent で確かめているため */
  playResultBgmSoon();
}

/* 公園入口の「公園の出口へ向かう（ゴール）」を選んだとき

   すぐにはゴールへ向かわず、「公園の出口へ向かう？」の確認ダイアログを開く
   （クリックでも Enter / Space でも、ここを通る） */
function openGoalConfirm() {
  // 決定音「ポン♪」（押せたことが分かるように。ひとやすみを開くときと同じ）
  playDecisionSound();

  isGoalConfirmOpen.value = true;

  // 開いたときは、いつも「もう少し遊ぶ」を選んだ状態にする
  // Enter を続けて押してしまっても、うっかりおでかけが終わらないようにするため
  selectedGoalConfirmIndex.value = 0;

  // うしろの「どこへ行く？」も「公園の出口へ向かう」を選んだ状態にそろえておく
  // （マウスで押したときも、閉じたあとにどこから開いたかが分かる）
  selectedCommandIndex.value = goalCommandIndex.value;

  // マウスで押したときは、うしろのゴールのボタンにフォーカスが残り、枠が出たままになる
  // ダイアログが手前に出ているのに紛らわしいので、外しておく
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

/* 確認ダイアログを閉じる（「もう少し遊ぶ」・Escape・ダイアログの外のクリック）

   公園入口に戻るだけで、時間もステータスも変わらない
   うしろの「どこへ行く？」は「公園の出口へ向かう」が選ばれたまま */
function closeGoalConfirm() {
  isGoalConfirmOpen.value = false;
  selectedGoalConfirmIndex.value = 0;
}

/* 確認ダイアログの「出口へ向かう」

   ダイアログを閉じてから、いつもの goToGoal() を呼ぶ
   （BGM・ゴール音・結果の判定は、ぜんぶ goToGoal() の中のまま）
   画面にダイアログが出ていないときは、何もしない（念のため） */
function confirmGoToGoal() {
  if (!isGoalConfirmVisible.value) {
    return;
  }

  closeGoalConfirm();
  goToGoal();
}

/* もう一度あそぶ */
function resetGame() {
  // 決定音「ポン♪」
  // ※ AudioContext（作業台）はここでは作り直さない
  //   ページを開いているあいだ、ずっと同じものを使い続ける
  playDecisionSound();

  /* BGMを公園用からタイトル用へ戻す

     startGame() と逆の切り替え
     「公園BGMを止める → タイトルBGMを最初から鳴らす」の順番にする
     公園BGMは先頭に戻しておくので、
     次に「このおやつで公園へ行く！」を押したときにまた最初から鳴る

     タイトルBGMは少しだけ間を空けてから鳴らしはじめる
     すぐ鳴らすと、決定音「ポン♪」が曲にかき消されてしまうため
     （待つのは音だけで、画面の切り替えはこのあとすぐ行う）

     ※ ここは「もう一度あそぶ」を押した直後＝ユーザーが操作したあとなので、
       自動再生を止められることなくタイトルBGMを鳴らせる

     いやいやBGMも stop で先頭に戻しておく
     （pause だと、次のプレイのいやいやが前回の途中から鳴りだしてしまう）

     リザルトBGMも stop で止める
     stopResultBgm() は「あとで鳴らす」の予約も取り消すので、
     ゴール音が鳴っているあいだに「もう一度あそぶ」を押しても、
     あとからタイトル画面でリザルトBGMが鳴りだすことはない

     こもれびの広場BGMも stop で先頭に戻しておく
     GAME OVERになった画面から「もう一度あそぶ」を押すこともあるので、
     再生位置も0に戻して、次に秘密の場所へ入ったときは必ず頭から鳴らす

     GAME OVER BGMも stop で止めて、先頭に戻しておく
     GAME OVER画面から「もう一度あそぶ」を押したときは、ここで曲が止まってからタイトルBGMへ切りかわる
     stopGameOverBgm() は「あとで鳴らす」の予約も取り消すので、
     GAME OVERになってすぐ（0.7秒の待ち時間のうちに）押しても、
     あとからタイトル画面でGAME OVERの曲が鳴りだすことはない */
  stopParkBgm();
  stopSecretBgm();
  stopTantrumBgm();
  stopResultBgm();
  stopGameOverBgm();
  playTitleBgmSoon();

  childEnergy.value = 100;
  childMood.value = 55;
  outingPoint.value = 0;
  parentEnergy.value = 100;
  parentCalm.value = 100;
  currentTime.value = '09:00';

  visitedPlaces.value = [];
  collectedItems.value = [];
  playCount.value = 0;

  // 秘密の小道も「まだ広場を見つけていない」状態に戻す
  // （ミニゲームのループ・流れてくるもの・木漏れ日の数・こうちゃんの位置も、まとめて片づける）
  resetSecretPathGame();
  hasDiscoveredSecretSpot.value = false;

  isTantrum.value = false;
  tantrumCount.value = 0;

  // いやいやの理由・レベル・対応の記録・ナイス対応も「いやいやしていない」状態に戻す
  // （大いやいや中にGAME OVERになったときの様子が、次のプレイに残らないようにする）
  resetTantrumState();

  /* きょうのおやつも、選んでいない状態に戻す

     次のプレイへ前回のグミ・せんべいが残っていると、
     おやつ選択画面を開いたとたんに「2 / 2」になっていて、
     選びなおすつもりが「もう選び終わっている」ことになってしまう

     isSnackSelectionOpen も false に戻しておく
     公園へ出発したあとも true のまま残しているので、
     ここで戻さないと、B画面へ帰ったつもりが
     おやつ選択画面のままになってしまう

     ※ おやつの残り個数（snackLeft）は、バッグの中身の数そのものなので、
       ここでバッグを空にすれば いっしょに0になる（別に戻す必要はない）
       次のプレイでは、おやつ選択画面でまた2つ選んでから出発する

     ※ ゲーム中に開いていたおやつバッグは、このあとの closeCareMenu() で閉じる */
  selectedSnackIds.value = [];
  isSnackSelectionOpen.value = false;

  // あそびかた画面も閉じた状態に戻しておく
  // （もう一度あそぶ・はじめの画面へ戻る のあとに、あそびかたが開いたまま残らないようにする）
  isHowToPlayOpen.value = false;

  // いやいや発生の演出も消しておく
  // （残っていると、タイトル画面の上に前回の「いやいや発生！」が出たままになる）
  hideTantrumAlert();

  // サブメニュー「☕ ひとやすみ」も閉じておく
  // （前回のプレイで開いたままGAME OVERになっていることがあるため）
  closeCareMenu();

  // 「公園の出口へ向かう？」の確認ダイアログも閉じておく（念のため）
  closeGoalConfirm();

  resultMessage.value = '';
  statusChanges.value = null;
  isCareActionResult.value = false;

  // 前回のプレイで最後に入った場所を忘れる（新しいプレイの公園入口は、先頭から選ぶ）
  lastSelectedPlace.value = null;
  isCommandPointerPaused.value = false;

  endingRank.value = '';
  endingTitle.value = '';
  endingMessage.value = '';

  /* うた入りBGMの「新しい曲が追加されました！」のお知らせも消す（その1プレイだけの表示）

     ※ hasUnlockedSPlusSong（解放済みかどうか）と、localStorage の解放情報は、ここでは戻さない
       一度解放した曲は、もう一度あそんでも、はじめの画面へ戻っても、ロックに戻さないため */
  isSPlusSongNewlyUnlocked.value = false;

  // 前回の総合スコアと内訳が残らないように、0と空の配列に戻す
  finalScore.value = 0;
  scoreBreakdown.value = [];

  // 演出用に控えていたものも空に戻す
  foundItemsThisAction.value = [];
  randomEventText.value = '';
  randomEventEffects.value = [];
  tantrumText.value = '';
  // ※ 「✨ ナイス対応！」の表示は、上の resetTantrumState() で空に戻している

  // 今回追加したGAME OVER用のstateも空に戻す
  gameOverTitle.value = '';
  gameOverMessage.value = '';

  // とつぜんのできごとの予定も空に戻す
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

/* ゴール／GAME OVER画面から、A画面（起動画面）へ戻る

   同じ画面にある「もう一度あそぶ」は、B画面（タイトル画面）まで戻って
   すぐ次のおでかけを始められるようにするもの
   こちらは、もう一つ手前のA画面（起動画面）まで戻る
   （A画面には「♪ サウンドトラック」もあるので、曲を聴きにも行ける）

   やることは2つだけ
   ① resetGame()  … 決定音を鳴らして、ゲームの記録をぜんぶ最初の状態に戻す
   ② タイトルBGMを止めて、titleEntered を false にする（＝A画面へ）

   ※ ①の中でタイトルBGMを「少しあとで鳴らす」予約をしているので、
     cancelTitleBgmStart() でかならず取り消すこと
     A画面は「まだ音を鳴らしていない画面」なので、
     戻ったとたんに曲が鳴りだすと不自然になる
     （B画面からA画面へ戻る goBackToBoot() と、まったく同じ後始末）

   ※ リザルトBGM・GAME OVER BGMは、①の resetGame() の中で止めている
     「もう一度あそぶ」と同じ止めかたなので、ここでは同じ処理をくり返さない
*/
function goBackToBootFromResult() {
  /* ここでの変更は、ぜんぶ「まとめて1回」で行われる（await も nextTick も無い）

     resetGame() でゲームの記録が初期値に戻り、そのあと titleEntered も false になるが、
     Vueは同じ処理の中で変えたぶんをまとめて1回だけ描きなおす
     つまり「スコアが0になったリザルト画面」や「B画面」が
     途中でチラッと見えることはなく、リザルト画面 → A画面 と一度に切りかわる

     しかも <Transition> のおかげで、消えかけのリザルト画面は
     もう描きなおされないので、スコアも結果文も見えたままフェードアウトする */
  resetGame();

  cancelTitleBgmStart();
  stopTitleBgm();

  titleEntered.value = false;

  /* A画面のメインのボタン「はじめる」へのフォーカスは、
     フェードが終わってから handleScreenEnterEnd() が当てる（B→Aへ戻るときと同じ） */
}

/* ============================================================
   キーボード操作（各場所の「どうする？」コマンドボックス）

   ・↑        1つ上のコマンドへ移動する
   ・↓        1つ下のコマンドへ移動する
   ・← →      1つ前（左）／次（右）のコマンドへ移動する（横ならびの選択肢や、結果を読む画面）
   ・Enter    選択中のコマンドを実行する
   ・Space    Enterと同じく、選択中のコマンドを実行する

   ※ 結果・リザルトなどの「読む画面」で中身がスクロールするときは、
     ↑↓ はスクロールに使い、コマンドは ← → で選ぶ（handleKeydown() の ⓪-3 と isReadingScene を参照）

   これまでどおりマウスのクリックでも遊べる（クリック操作はそのまま）
   ※ 起動画面・タイトル画面はボタンが1つだけなので、↑↓は使わず
     Enter / Space だけで押せるようにしてある
     （ゴール・GAME OVER画面はボタンが2つ横にならぶので、← → で行き来できる）
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

/* ←：1つ前（左）のコマンドへ移動する

   横にならべた選択肢（いやいやタイム・とつぜんのできごと・秘密の小道・ゴール／GAME OVER）と、
   結果を読む画面で使う
   ↑↓ とちがい、いちばん左（0）では止まって、反対のはしへは回りこまない
   （ボタンが2つの画面で「← は左のボタン、→ は右のボタン」と、押す前から分かるようにするため）
   例）4つあるとき 3 → 2 → 1 → 0 → 0 …
*/
function moveCommandPrevious() {
  selectedCommandIndex.value = Math.max(0, selectedCommandIndex.value - 1);
}

/* →：1つ次（右）のコマンドへ移動する
   いちばん右（コマンド数 - 1）では止まる
   例）3つあるとき 0 → 1 → 2 → 2 …
*/
function moveCommandNext() {
  selectedCommandIndex.value = Math.min(commandCount.value - 1, selectedCommandIndex.value + 1);
}

/* ===== ここから下は、サブメニュー「☕ ひとやすみ」の中の↑↓ =====

   上の2つ（moveCommandUp / moveCommandDown）とまったく同じ考えかたで、
   見ている数が selectedCommandIndex → selectedCareCommandIndex、
   commandCount → careCommandCount に変わるだけ

   おやつが残っていれば2つ（休憩 → おやつ → 休憩 …）でループし、
   食べきっていれば「休憩する」1つだけなので、押しても動かない
*/

/* ↑：サブメニューの1つ上のコマンドへ */
function moveCareCommandUp() {
  // すでに一番上にいるなら、一番下（コマンド数 - 1）へ回りこむ
  if (selectedCareCommandIndex.value <= 0) {
    selectedCareCommandIndex.value = careCommandCount.value - 1;
    return;
  }

  selectedCareCommandIndex.value -= 1;
}

/* ↓：サブメニューの1つ下のコマンドへ */
function moveCareCommandDown() {
  // すでに一番下にいるなら、一番上（0）へ戻る
  if (selectedCareCommandIndex.value >= careCommandCount.value - 1) {
    selectedCareCommandIndex.value = 0;
    return;
  }

  selectedCareCommandIndex.value += 1;
}

/* ===== ここから下は、おやつバッグの中の↑↓ =====

   ひとやすみの↑↓と同じ考えかたで、
   見ている数が selectedSnackMenuIndex、いちばん下が「← もどる」（snackMenuBackIndex）に変わるだけ

   例）バッグにグミ・せんべいがあるとき
     0 グミ → 1 せんべい → 2 ← もどる → 0 グミ …
*/

/* ↑：おやつバッグの1つ上の行へ */
function moveSnackMenuUp() {
  // すでに一番上にいるなら、一番下（← もどる）へ回りこむ
  if (selectedSnackMenuIndex.value <= 0) {
    selectedSnackMenuIndex.value = snackMenuBackIndex.value;
    return;
  }

  selectedSnackMenuIndex.value -= 1;
}

/* ↓：おやつバッグの1つ下の行へ */
function moveSnackMenuDown() {
  // すでに一番下（← もどる）にいるなら、一番上（0）へ戻る
  if (selectedSnackMenuIndex.value >= snackMenuBackIndex.value) {
    selectedSnackMenuIndex.value = 0;
    return;
  }

  selectedSnackMenuIndex.value += 1;
}

/* ===== ここから下は、公園入口（3列にならぶコマンド）のための処理 ===== */

/* 公園入口のコマンドが、いま何列で並んでいるか
   CSSと同じ幅で切り替える
   ・901px以上   … 3列
   ・900px以下   … 2列
   ・700px以下   … 1列
*/
const entranceColumns = ref(3);

/* ゴールの行に入る直前、何列目にいたかを覚えておく箱
   0 = 左はし、1 = まん中、2 = 右はし

   ゴール（公園の出口へ向かう）の行は横はばをまるごと使っていて、
   ほかのコマンドのような「列」を持っていない
   そのため覚えておかないと、↑で戻るときに行き先の
   いちばんうしろへ帰ってしまい、
   「池へ行く」で↓→↑としたのに「芝生広場へ行く」に移動してしまう

   ※ 見た目には出てこない、キーボード操作のためだけのメモ
*/
const entranceColumnBeforeGoal = ref(0);

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

   いちばん上の行（すべり台・砂場・どんぐりの木 など）で↑を押しても、動かない
   いちばん下の「公園の出口へ向かう」へは回りこまない
   （↑を押しすぎたときに、うっかりゴールを選んでしまわないようにするため）

   ゴールの行から↑を押したときは、entranceColumnBeforeGoal に
   覚えておいた列へ戻る（池で↓→↑なら、ちゃんと池へ帰ってくる）

   ※ 「公園の出口へ向かう（ゴール）」だけは、CSSで横1行をまるごと使っている
     （.cmd--goal の grid-column: 1 / -1）ので、列のマス目には入っていない
     そのため、ゴールはいちばん下の1行として別あつかいで計算する

     [すべり台] [砂場] [どんぐり]
     [池]       [芝生] [秘密]
     [───── ゴール ─────]   ← 横いっぱいの1行
*/
function moveEntranceUp() {
  const columns = entranceColumns.value;

  // ゴールの番号は、そのまま「行き先の数」でもある
  // （行き先が 0〜4 の5つなら、ゴールは5番）
  const goalIndex = goalCommandIndex.value;

  // いまゴールの行にいるなら、ゴールへ降りてくる前と同じ列へ戻る
  if (selectedCommandIndex.value === goalIndex) {
    // 行き先のいちばん下の行が、何番から始まるかを求める
    // 例）行き先が5つ・3列なら、いちばん下の行は 3番（池）から
    const lastRowStart = Math.floor((goalIndex - 1) / columns) * columns;

    // その行の、覚えておいた列へ戻る
    const back = lastRowStart + entranceColumnBeforeGoal.value;

    // その列にコマンドが無いとき（いちばん下の行が途中で終わっているとき）は、
    // その行のいちばん右のコマンドへ寄せる
    selectedCommandIndex.value = Math.min(back, goalIndex - 1);
    return;
  }

  // 1行ぶん上へ
  const next = selectedCommandIndex.value - columns;

  // 上にはみ出した＝いちばん上の行にいたので、動かさない
  // （いちばん下の「公園の出口へ向かう」へは回りこまない）
  if (next < 0) {
    return;
  }

  selectedCommandIndex.value = next;
}

/* ↓：公園入口では「1行ぶん（列の数ぶん）」下へ動かす
   行き先のいちばん下の行から↓を押すと、その下にあるゴールへ進む

   ゴール（いちばん下の行）で↓を押しても、動かない
   いちばん上の「すべり台へ行く」へは回りこまない
   （↑でゴールへ回りこまないのと同じく、上下のはしで止まるようにそろえている）
*/
function moveEntranceDown() {
  const columns = entranceColumns.value;
  const goalIndex = goalCommandIndex.value;

  // いまゴールの行にいる＝いちばん下なので、動かさない
  if (selectedCommandIndex.value === goalIndex) {
    return;
  }

  // 1行ぶん下へ
  const next = selectedCommandIndex.value + columns;

  // まっすぐ下にコマンドがあるときは、そこへ動かすだけ
  if (next < goalIndex) {
    selectedCommandIndex.value = next;
    return;
  }

  // ここから下は「まっすぐ下にコマンドが無かった」とき

  // 行き先のいちばん下の行が、何番から始まるかを求める
  // 例）行き先が5つ・3列なら、いちばん下の行は 3番（池）から
  const lastRowStart = Math.floor((goalIndex - 1) / columns) * columns;

  // まだ下に行き先の行が残っているとき
  //   例）行き先が5つ・3列で「どんぐり(2)」にいる場合、
  //      すぐ下の [池][芝生広場] の行には3列目が無い
  //      ここでゴールへ飛ばすと、池・芝生広場の行をまるごと飛びこえてしまうので、
  //      その行のいちばん近いコマンド（芝生広場）へ寄せる
  if (selectedCommandIndex.value < lastRowStart) {
    selectedCommandIndex.value = goalIndex - 1;
    return;
  }

  // いちばん下の行にいたので、その下のゴールへ進む
  // ↑で戻ってきたときに同じ列へ帰れるよう、いまの列を覚えておく
  entranceColumnBeforeGoal.value = selectedCommandIndex.value % columns;
  selectedCommandIndex.value = goalIndex;
}

/* ←：公園入口では1つ前のコマンドへ動かす

   いちばん最初の「すべり台へ行く」で←を押しても、動かない
   いちばん後ろの「公園の出口へ向かう」へは回りこまない
   （↑と同じく、うっかりゴールを選んでしまわないようにするため）

   ※ moveCommandUp() はほかの場所の「どうする？」でも使っているので書きかえず、
     公園入口のためだけに、この関数を分けている */
function moveEntranceLeft() {
  if (selectedCommandIndex.value <= 0) {
    return;
  }

  selectedCommandIndex.value -= 1;
}

/* →：公園入口では1つ次のコマンドへ動かす

   いちばん後ろの「公園の出口へ向かう」で→を押しても、動かない
   いちばん最初の「すべり台へ行く」へは回りこまない
   （↓と同じく、端で止まるようにそろえている
     スマホの1列表示では → と ↓ が同じ向きになるので、動きがちがうと迷うため）

   いちばん後ろの行き先から→でゴールへ進んだときは、
   ↓で進んだときと同じように、いまの列を覚えておく
   （ゴールから↑で戻ったときに、→を押す前のコマンドへ帰れるようにするため）

   ※ moveCommandDown() はほかの場所の「どうする？」でも使っているので書きかえず、
     公園入口のためだけに、この関数を分けている */
function moveEntranceRight() {
  const goalIndex = goalCommandIndex.value;

  if (selectedCommandIndex.value >= goalIndex) {
    return;
  }

  if (selectedCommandIndex.value === goalIndex - 1) {
    entranceColumnBeforeGoal.value = selectedCommandIndex.value % entranceColumns.value;
  }

  selectedCommandIndex.value += 1;
}

/* Enter / Space を押したときに、いま選んでいるコマンドを実行する

   やっていることは「マウスでクリックしたときと同じ関数を呼ぶ」だけ
   今いる場所（currentEvent）と番号（selectedCommandIndex）の組み合わせで、
   どの関数を呼ぶかを決めている
*/
function runSelectedCommand() {
  /* ゴール・GAME OVER画面（ボタンは2つだけ）

     0 もう一度あそぶ        → タイトル画面へ
     1 ← はじめの画面へ戻る  → 起動画面へ

     ※ いちばん先に見るのが大事
       下の「結果表示中は…」にも当てはまってしまうことがあるため */
  if (currentEvent.value === 'goal' || currentEvent.value === 'gameOver') {
    if (selectedCommandIndex.value === 1) {
      goBackToBootFromResult();
      return;
    }

    resetGame();
    return;
  }

  // 結果表示中はコマンドが1つしか出ていないので、それを実行する
  // ただし「少し待ってみる」に失敗していやいやが続いているときは、
  // 画面に出ているのは いやいや のコマンドなので、ここでは進めない
  if (resultMessage.value && !isTantrumUnsolved.value) {
    // 休憩・おやつの結果 … 「← もどる」＝いまいる場所の「どうする？」へ戻る
    if (isCareResultBackVisible.value) {
      backToPlaceFromCareResult();
      return;
    }

    // それ以外の結果 … 「次の場所を選ぶ」
    goToNextPlace();
    return;
  }

  /* おやつバッグが開いているときは、いちばん先にそちらを見る

     ひとやすみの中でバッグを開いているあいだは isCareMenuVisible も true のままなので、
     下のサブメニューの処理より前に置く
     （いやいやタイムのバッグも、ここで受け取る）
  */
  if (isSnackMenuVisible.value) {
    // いちばん下の「← もどる」
    if (selectedSnackMenuIndex.value === snackMenuBackIndex.value) {
      closeSnackMenu();
      return;
    }

    // 選んでいる行のおやつを食べる（開いた場面に合った効果になる）
    const snack = selectedSnacks.value[selectedSnackMenuIndex.value];

    if (snack) {
      eatSnackFromBag(snack.id);
    }

    return;
  }

  /* サブメニュー「☕ ひとやすみ」が開いているときは、そちらを優先する

     開いているあいだ、プレイヤーが見て選んでいるのはサブメニューなので、
     メインコマンド（selectedCommandIndex）のほうは見ない

     ※ isCareMenuVisible を使うのがポイント
       「画面に出ているか」まで見てくれるので、
       結果カードが出ているときなど、見えていないサブメニューが
       うっかり実行されることがない
  */
  if (isCareMenuVisible.value) {
    // 0 休憩する
    if (selectedCareCommandIndex.value === 0) {
      takeCommonBreak();
      return;
    }

    // 1 おやつをあげる ＞（おやつバッグを開くだけで、ここではまだ食べない）
    // バッグが空のときは画面にこのコマンドが無いので、念のため残りも確かめる
    if (selectedCareCommandIndex.value === 1 && snackLeft.value > 0) {
      openSnackMenu('exploring');
      return;
    }

    return;
  }

  // 毎回 .value と書かなくてよいように、番号を取り出しておく
  const index = selectedCommandIndex.value;

  /* 通常の場所6か所で共通の、下2つのコマンドをまとめて受け取る

     2 休憩・おやつ         → サブメニューを開く
     3 ← 場所選びにもどる   → 公園入口の「どこへ行く？」へ（この場所のコマンドを選んだ状態で）

     場所ごとの switch より前に書いておくと、
     下の6か所に同じ2行を書き足さなくてよい
  */
  if (isNormalPlace.value) {
    if (index === careMenuCommandIndex) {
      openCareMenu();
      return;
    }

    if (index === leavePlaceCommandIndex) {
      goToNextPlace();
      return;
    }
  }

  switch (currentEvent.value) {
    /* 公園入口
       0 すべり台／1 砂場／2 どんぐりの木／3 池／4 芝生広場
       5 秘密の場所（見つけているときだけ画面に出る）
       最後 公園の出口へ向かう（ゴール）

       ※ 秘密の場所がまだ出ていないときは、その行が画面に無いので
         ゴールが1つくり上がって5番目になる（goalCommandIndex で見る）
       ※ ゴールは、すぐには向かわず確認ダイアログを開く（クリックしたときと同じ）
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
        goToPlace('grassArea');
      } else if (index === 5 && canEnterSecretSpot.value) {
        // はじめてのときは秘密の小道へ、見つけたあとは そのまま こもれびの広場へ
        goToSecretArea();
      } else if (index === goalCommandIndex.value) {
        openGoalConfirm();
      }
      break;

    /* すべり台
       0 一緒にすべる／1 下で見守る
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'slide':
      if (index === 0) {
        playSlide();
      } else if (index === 1) {
        watchSlide();
      }
      break;

    /* 砂場
       0 一緒に大きな山を作る／1 砂のトンネルを作る
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'sandbox':
      if (index === 0) {
        playSandbox();
      } else if (index === 1) {
        buildSandTunnel();
      }
      break;

    /* どんぐりの木
       0 一緒にどんぐりを拾う／1 どんぐりをころがして遊ぶ
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'acornArea':
      if (index === 0) {
        collectAcorns();
      } else if (index === 1) {
        rollAcorns();
      }
      break;

    /* 池
       0 白鳥を近くで見る／1 コイに餌をあげる
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'pond':
      if (index === 0) {
        watchSwansClose();
      } else if (index === 1) {
        feedKoi();
      }
      break;

    /* 芝生広場
       0 追いかけっこする／1 シャボン玉で遊ぶ
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'grassArea':
      if (index === 0) {
        playTagOnGrass();
      } else if (index === 1) {
        playWithBubbles();
      }
      break;

    /* こもれびの広場
       0 木漏れ日の中を探検する／1 広場の奥を見てみる
       （2 休憩・おやつ／3 ← 場所選びにもどる は、この switch の前で受け取っている） */
    case 'secretSpot':
      if (index === 0) {
        exploreSunlight();
      } else if (index === 1) {
        exploreClearingDepths();
      }
      break;

    /* 秘密の小道
       はじまる前   0 小道へ進む／1 ← 場所選びにもどる（公園入口の「どこへ行く？」へ）
       終わったあと 0 先へ進む
       ※ 遊んでいる最中は、キー操作を handleSecretPathKeydown() が受け取るので、ここへは来ない */
    case 'secretPath':
      if (index === 0 && secretPathPhase.value === 'ready') {
        startSecretPathGame();
      } else if (index === 1 && secretPathPhase.value === 'ready') {
        leaveSecretPathToEntrance();
      } else if (index === 0 && secretPathPhase.value === 'finished') {
        enterSecretSpotFromPath();
      }
      break;

    /* いやいやタイム
       おやつが残っているとき   0 お話する／1 だっこ／2 おやつをあげる ＞／3 少し待ってみる
       おやつが0個のとき       0 お話する／1 だっこ／2 少し待ってみる（おやつの行は画面に無い）

       「おやつをあげる ＞」はおやつバッグを開くだけ
       食べるのは、バッグの中でおやつを選んだとき（上の isSnackMenuVisible の分岐）

       ※ バッグが空のときにバッグを開いてしまわないように、
         必ず snackLeft（バッグの残り）を見てから決める
       ※ 番号は talkCommandIndex などを見る（0〜3 を直接書かない）
         待つ の番号だけはおやつの有無で変わるので、waitCommandIndex は computed
         おやつが0個のときは 2 が「少し待ってみる」になるが、
         おやつの分岐は snackLeft も見ているので、まちがってバッグを開くことはない
    */
    case 'tantrum':
      if (index === talkCommandIndex) {
        talkToChild();
      } else if (index === hugCommandIndex) {
        hugChild();
      } else if (index === snackCommandIndex && snackLeft.value > 0) {
        openSnackMenu('tantrum');
      } else if (index === waitCommandIndex.value) {
        // 「少し待ってみる」は、おやつがあれば4番目（3）、なければ3番目（2）
        waitCalmly();
      }
      break;

    /* ここから下はとつぜんのできごと */

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

    /* こうちゃんがころんだ（おやつは使わないので、いつも4つ）
       0 すぐにだっこする／1 痛いの痛いのとんでいけ〜
       2 ベンチで少し休む／3 「大丈夫？」と見守る
    */
    case 'fallDown':
      if (index === 0) {
        hugAfterFall();
      } else if (index === 1) {
        blowPainAway();
      } else if (index === 2) {
        restOnBenchAfterFall();
      } else if (index === 3) {
        watchAfterFall();
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

/* ============================================================
   起動画面（A）・タイトル画面（B）のキーボード操作

   この2つの画面で操作するものは、A画面が3つ、B画面が4つ
     A … ① はじめる             ② ♪ サウンドトラック ③ サウンドON/OFF
     B … ① きょうのおやつを選ぶ ② はじめの画面へ戻る ③ ？ あそびかた      ④ サウンドON/OFF

   ①がその画面のメインのボタン
   画面が出たときは、いつも①にフォーカスが当たるようにしてある

   ・Tab / Shift+Tab … ブラウザのふつうの移動
                       （はしまで来たら、反対のはしへ回りこませる）
   ・↑ ← ↓ →        … 画面の並びのとおりに動かす、補助の操作
                       （くわしい行き先は moveTitleFocusByArrow() を見ること）
   ・Enter / Space   … 選んでいるボタンを実行する

   ここに書いてあるのはA画面・B画面のことだけで、
   ゲームが始まったあと（gameStarted）の操作には、いっさい関係しない
   ============================================================ */

/* いまの画面で選べるボタンを、選ぶ順番どおりに取り出す

   画面に出ていないボタンは null が入っているので、取りのぞいてから返す
   ゲームが始まったあとは、この操作じたいを使わないので空っぽを返す */
function getTitleFocusItems(): HTMLButtonElement[] {
  if (gameStarted.value) {
    return [];
  }

  /* あそびかた画面のときも空っぽを返す（おやつ選択画面と同じ理由）

     この画面にはA画面・B画面のボタンが出ていないので、
     タイトル側の矢印キー・Tabの回りこみ・メインのボタンへのフォーカスが
     どれも動かないようにしておく
     （あそびかた画面のキー操作は handleHowToPlayKeydown() が受け持つ） */
  if (isHowToPlayOpen.value) {
    return [];
  }

  /* おやつ選択画面のときも空っぽを返す

     この画面にはA画面・B画面のボタン3つが出ていないので、
     並びを返してしまうと「もう画面に無い『きょうのおやつを選ぶ』へ
     フォーカスを動かす」ことになってしまう
     （selectSnacksButtonRef などは画面から消えると null に戻るが、
       消えたあとに参照しないほうが分かりやすい）

     空っぽを返すと、この画面では
     ・moveTitleFocusByArrow() … 何もしない
     ・focusTitleMainButton()  … 何もしない
     ・handleTitleKeydown()    … すぐ return する
     となり、おやつ選択画面のキー操作はブラウザ本来の
     Tab / Shift+Tab ・ Enter / Space だけになる */
  if (isSnackSelectionOpen.value) {
    return [];
  }

  /* 並びは「メイン → 上の行のボタンを左から順に」
     Tabキーで回る順番（HTMLに書いた順番）と同じにしてある */
  const items = titleEntered.value
    ? [selectSnacksButtonRef.value, backToBootButtonRef.value, howToPlayButtonRef.value, soundToggleButtonRef.value] // B画面
    : [startButtonRef.value, soundtrackButtonRef.value, soundToggleButtonRef.value]; // A画面

  return items.filter((item): item is HTMLButtonElement => item !== null);
}

/* ↑↓←→ でフォーカスを動かす

   ■ A画面（ボタン3つ）

     [ ♪ サウンドトラック ]        [ サウンドON/OFF ]

                  [ はじめる ]

     ・↑ ↓ … メインのボタンと、上の行を行き来する
              （メインで↑を押したら、真上にある左のボタンへ）
     ・← → … 上の行の2つを行き来する
              （メインにいるときは、←で左上・→で右上へ）

   ■ B画面（ボタン4つ）

     [ はじめの画面へ戻る ]     [ ？ あそびかた ][ サウンドON/OFF ]

                 [ きょうのおやつを選ぶ ]

     ・↑ ↓ … メインのボタンと、上の行を行き来する（A画面と同じ）
              （メインからは、左上の「はじめの画面へ戻る」へ）
     ・← → … 上の行の3つを、となりへ1つずつ動く
              （はしまで来たら反対のはしへ回りこむ。メインにいるときは、←で左上・→で右上のサウンドへ）

   どちらの画面でも、どのキーもかならずどこかへ動くので、
   ボタンを矢印キーだけで選べる */
function moveTitleFocusByArrow(key: string) {
  const items = getTitleFocusItems();
  const active = document.activeElement;

  // B画面（タイトル画面）
  if (titleEntered.value) {
    // 4つそろっていないときは何もしない（画面の切りかわり中など）
    if (items.length < 4) {
      return;
    }

    // getTitleFocusItems() の並びは「メイン → 上の行を左から（戻る → あそびかた → サウンド）」
    const [mainButton, ...topRow] = items;

    // 上の行の何番目にいるか（上の行にいないときは -1）
    const topIndex = topRow.findIndex((button) => button === active);

    // ↑ ↓：メインのボタン ⇔ 上の行
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      if (active === mainButton) {
        // 左上の「はじめの画面へ戻る」へ（A画面で ♪ サウンドトラック へ行くのと同じ）
        topRow[0].focus();
      } else {
        mainButton.focus();
      }

      return;
    }

    // ←：上の行を1つ左へ（左はしでは右はしへ回りこむ。上の行にいないときは左上へ）
    if (key === 'ArrowLeft') {
      const leftIndex = topIndex === -1 ? 0 : (topIndex - 1 + topRow.length) % topRow.length;
      topRow[leftIndex].focus();
      return;
    }

    // →：上の行を1つ右へ（右はしでは左はしへ回りこむ。上の行にいないときは右上のサウンドへ）
    const rightIndex = topIndex === -1 ? topRow.length - 1 : (topIndex + 1) % topRow.length;
    topRow[rightIndex].focus();
    return;
  }

  // ここから下はA画面（起動画面）

  // 3つそろっていないときは何もしない（画面の切りかわり中など）
  if (items.length < 3) {
    return;
  }

  // getTitleFocusItems() の並びは「メイン → 左上 → 右上」
  const [mainButton, leftButton, soundButton] = items;

  // ↑ ↓：メインのボタン ⇔ 上の行
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (active === mainButton) {
      // 真上にある左のボタンへ（A画面なら ♪ サウンドトラック）
      leftButton.focus();
    } else {
      // 上の行にいるときは、下のメインのボタンへ戻る
      mainButton.focus();
    }

    return;
  }

  // ←：左上のボタンへ（すでに左上にいるときは、反対がわの右上へ回りこむ）
  if (key === 'ArrowLeft') {
    if (active === leftButton) {
      soundButton.focus();
    } else {
      leftButton.focus();
    }

    return;
  }

  // →：右上のサウンドON/OFFへ（すでに右上にいるときは、左上へ回りこむ）
  if (active === soundButton) {
    leftButton.focus();
  } else {
    soundButton.focus();
  }
}

/* その画面のメインのボタン（はじめる／きょうのおやつを選ぶ）へフォーカスを当てる

   画面が切りかわった直後は、新しいボタンがまだ作られていない
   そこで nextTick()（画面の書きかえが終わるのを待つ）をはさんでからフォーカスする */
async function focusTitleMainButton() {
  await nextTick();

  const items = getTitleFocusItems();

  // 先頭が、その画面のメインのボタン
  items[0]?.focus();
}

/* ============================================================
   おやつ選択画面のキーボード操作

   ・↑ ↓ ← → … 画面にならんでいるとおりに、となりのボタンへ動く
   ・Enter / Space … いま選んでいるボタンを押す（選ぶ・解除・決定）
   ・Escape        … B画面へ戻る
   ・Tab / Shift+Tab … ブラウザのふつうの移動（こちらでは何もしない）

   ■ 「いまどこを選んでいるか」は、フォーカスそのもので覚えている

     ゲーム本編は selectedCommandIndex のような番号で選択位置を持っているが、
     この画面ではそれを作っていない

     理由は、番号とフォーカスの2つを持つと、かならずズレるため
     （Tabで動かすとフォーカスだけ動く、矢印で動かすと番号だけ動く…）
     ブラウザのフォーカス1つだけを「いまの居場所」と決めておけば、
     矢印・Tab・マウスのどれで動かしても、ズレようがない

     見た目は、ボタンの :focus-visible（紺色の枠）が知らせてくれる
     これは「いまカーソルがここにある」という意味で、
     「バッグに入れた」ことを表すカードの色の変化とは別物
     （矢印キーで動かしただけでは、selectedSnackIds は変わらない）

   ■ 行き先は「画面のどこにあるか」で決めている

     おやつは、画面の広さによって2列にも1列にもなる
     　パソコン … グミ／チョコ が横にならぶ2列
     　スマホ   … グミ・チョコ・せんべい… とたてに1列

     ここで「2列だから、2つ先が真下」と番号で計算してしまうと、
     スマホで1列になったとたんに、ぜんぶズレてしまう

     そこで getBoundingClientRect()（＝そのボタンが画面のどこにあるか）を
     その場で調べて、押した矢印の向きにあるボタンへ動かしている
     こうすると、CSSの列数を JavaScript 側で知らなくてよい
     画面幅の数字（600px など）をこのファイルへ書き足す必要もない

   ■ Enter / Space は、ここでは実行しない

     おやつのカードも、出発も、戻るも、サウンドも、ぜんぶ button なので、
     フォーカスが当たっていれば、ブラウザが勝手に click してくれる
     ここで toggleSnackSelection() などを呼ぶと、
     ブラウザのclickと合わせて2回動いてしまう
     （1回押しただけで「選ぶ→すぐ解除」になってしまう）

     なので、この関数がEnter / Spaceについてやるのは、
     「押しっぱなしを止める」ことだけ
     （A画面・B画面の handleTitleKeydown() と同じ考えかた）
   ============================================================ */

/* 矢印キーで行き来できるボタンを、ぜんぶ取り出す

   探すのはこの4つ
     .snack-option     … おやつのカード（6枚）
     .snack-go         … このおやつで公園へ行く！
     .title-card__back … ← ひとつ前の画面へ戻る
     .sound-toggle     … サウンドON/OFF

   並び順はここでは気にしなくてよい
   行き先は、このあと画面のどこにあるかで決めるため
   （おやつが7個・8個に増えても、ここは直さなくてよい）

   最後の filter で、押せないボタンを取りのぞいている
   ・バッグがいっぱいのときの、選んでいないおやつ
   ・まだ2個そろっていないときの「このおやつで公園へ行く！」
   押せないボタンは矢印キーでも飛ばしたいので、
   画面に出す条件（disabled）をそのまま使いまわしている
   ＝ 見た目と操作の判定が1か所で済み、食いちがわない */
function getSnackSelectionFocusItems(): HTMLButtonElement[] {
  const container = snackSelectionRef.value;

  if (!container) {
    return [];
  }

  const items = [...container.querySelectorAll<HTMLButtonElement>('.snack-option, .snack-go, .title-card__back, .sound-toggle')];

  return items.filter((item) => !item.disabled);
}

/* 矢印キーの向き */
type SnackArrowDirection = 'up' | 'down' | 'left' | 'right';

/* ボタン1つぶんの「画面のどこにあるか」

   rect … 上下左右のふち（重なっているかを調べるのに使う）
   x, y … まんなかの位置（どれだけ離れているかを測るのに使う）
*/
type SnackNavItem = {
  button: HTMLButtonElement;
  rect: DOMRect;
  x: number;
  y: number;
};

/* 矢印キーでフォーカスを動かす（画面の見た目どおりに）

   やることは3つだけ

   ① いまいるボタンと、ほかのボタンの位置を調べる
   ② 押した矢印の向きにあるものだけに しぼる
   ③ そのなかから、いちばん自然なものを1つ選んで、フォーカスを当てる

   ■ ← → のとき（②のしぼりかた）

     「同じ行にあること」を条件にしている
     同じ行かどうかは、上下のふちが重なっているかで調べる
     （rect.top と rect.bottom を見くらべる）

     こうしておかないと、グミで→を押したときに、
     1つ下の行のビスケットのような、ななめのボタンへ飛んでしまう

   ■ ↑ ↓ のとき（③の選びかた）

     まず「いちばん近い行」を見つけて、そのなかで
     「横の位置がいちばん近いもの」を選ぶ

     たとえばパソコンでグミ（左の列）から↑を押すと、
     上の行にあるのは「← ひとつ前の画面へ戻る」（左はし）と
     「サウンドON/OFF」（右はし）の2つ
     グミは左の列にあるので、横の位置が近い「戻る」が選ばれる
     チョコ（右の列）から↑なら、同じ理由で「サウンド」が選ばれる

     スマホで1列になると、グミの真上には同じように上の行の2つがあり、
     カードが画面いっぱいの幅になるぶん、まんなか寄りになる
     それでも近いほうの「戻る」が選ばれるので、
     列数を気にしなくても自然な動きになる

   ■ 行き先が無いときは、動かない

     たとえば「← ひとつ前の画面へ戻る」で↑を押しても、
     その上にはボタンが無いので、その場に残る
     2個選んでいて、グミの下のせんべいが押せないときも、
     押せるボタンだけを見るので、変なところへは飛ばない

   rowTolerance（12px）は「同じ行とみなす、たての ずれ」の許容
   同じ行のボタンは、まんなかの高さがほぼ同じになるが、
   ボタンの高さがちがうと数pxずれることがあるので、少しだけ余裕を持たせる
   （行と行のあいだは100px以上あるので、12pxで取りちがえることはない） */
function moveSnackSelectionByArrow(direction: SnackArrowDirection) {
  const items = getSnackSelectionFocusItems();

  if (items.length === 0) {
    return;
  }

  // いまフォーカスしているボタンを探す
  const currentButton = items.find((item) => item === document.activeElement);

  /* どこにもフォーカスが無いとき（画面のすきまをクリックしたあとなど）は、
     最初のおやつから始める */
  if (!currentButton) {
    items[0].focus();
    return;
  }

  const toNavItem = (button: HTMLButtonElement): SnackNavItem => {
    const rect = button.getBoundingClientRect();

    return { button, rect, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const current = toNavItem(currentButton);
  const others = items.filter((item) => item !== currentButton).map(toNavItem);

  const rowTolerance = 12;

  // ← → ：同じ行の中で、その向きにあるものだけ
  if (direction === 'left' || direction === 'right') {
    // 上下のふちが重なっている＝同じ行にいる
    const sameRow = others.filter((item) => item.rect.bottom > current.rect.top + 1 && item.rect.top < current.rect.bottom - 1);

    const candidates = sameRow.filter((item) => (direction === 'left' ? item.x < current.x : item.x > current.x));

    focusNearestSnackItem(candidates, current, 'x');
    return;
  }

  // ↑ ↓ ：その向きにあるものだけ
  const candidates = others.filter((item) => (direction === 'up' ? item.y < current.y - rowTolerance : item.y > current.y + rowTolerance));

  if (candidates.length === 0) {
    return;
  }

  /* いちばん近い行だけに しぼる

     いちばん近いボタンまでの たての距離を出して、
     そこから rowTolerance のうちにあるものを「同じ行」とみなす */
  const nearestRowDistance = Math.min(...candidates.map((item) => Math.abs(item.y - current.y)));
  const nearestRow = candidates.filter((item) => Math.abs(item.y - current.y) <= nearestRowDistance + rowTolerance);

  // その行の中で、横の位置がいちばん近いものへ
  focusNearestSnackItem(nearestRow, current, 'x');
}

/* 候補の中から、いちばん近いものへフォーカスを当てる

   axis … 'x' なら横の位置、'y' ならたての位置で近さを測る

   同じ近さのものが2つあったときは、先に見つけたほう（HTMLで先に書いてあるほう）
   を選ぶようにしてある
   たとえば「このおやつで公園へ行く！」は画面の幅いっぱいにあるので、
   ↑を押すと バナナ と ゼリー がまったく同じ近さになる
   そのときは、左にある バナナ へ動く（毎回同じ動きになるので迷わない）

   0.5 を引いて くらべているのが、その「同じ近さ」の判定
   画面の位置は小数で返ってくることがあるので、
   0.5px くらいの差は「同じ」とみなしている */
function focusNearestSnackItem(candidates: SnackNavItem[], current: SnackNavItem, axis: 'x' | 'y') {
  if (candidates.length === 0) {
    return;
  }

  let nearest = candidates[0];

  for (const candidate of candidates) {
    const candidateDistance = Math.abs(candidate[axis] - current[axis]);
    const nearestDistance = Math.abs(nearest[axis] - current[axis]);

    if (candidateDistance < nearestDistance - 0.5) {
      nearest = candidate;
    }
  }

  nearest.button.focus();
}

/* マウスを乗せたおやつへ、キーボードの居場所も移す

   この画面の「いまどこを選んでいるか」はフォーカスそのものなので、
   マウスに合わせるには、そのカードへフォーカスを移せばよい

   preventScroll: true は「フォーカスを当てるときに画面を動かさない」指示
   これが無いと、マウスを乗せただけで画面が少しスクロールすることがある

   ※ 乗せただけでは、おやつは選ばれない（selectedSnackIds は変わらない）
     選ぶのは click と、そのボタンの Enter / Space だけ */
function moveSnackSelectionToHovered(event: MouseEvent) {
  const hovered = event.currentTarget;

  if (hovered instanceof HTMLButtonElement && !hovered.disabled) {
    hovered.focus({ preventScroll: true });
  }
}

/* おやつ選択画面でキーを押したときの処理 */
function handleSnackSelectionKeydown(event: KeyboardEvent) {
  /* ① Escape … B画面へ戻る

     画面のどこにフォーカスがあっても戻れるように、いちばん先に見る
     「← ひとつ前の画面へ戻る」を押したのと、まったく同じ処理にする
     （closeSnackSelection() を呼ぶだけなので、
       選んだおやつは消えないし、ゲームも始まらない） */
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSnackSelection();
    return;
  }

  /* ② ↑ ↓ ← → … 画面のならびどおりに動かす

     矢印キーでページがスクロールしてしまわないように preventDefault() する
     押しっぱなしは止めない（連続で動いてよいので） */
  const arrowDirections: Record<string, SnackArrowDirection> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };

  const direction = arrowDirections[event.key];

  if (direction) {
    event.preventDefault();
    moveSnackSelectionByArrow(direction);
    return;
  }

  // ③ Enter / Space
  const isDecideKey = event.key === 'Enter' || event.key === ' ';

  if (!isDecideKey) {
    // Tab などは、ブラウザのふつうの動きにまかせる
    return;
  }

  /* 押しっぱなし（長押し）のときは、2回目以降をここで止める

     キーには自動リピートがあるので、Enterを押したままにすると
     フォーカスしているボタンが何度も押されてしまう
     ・おやつのカード … 選ぶ／解除がパタパタくり返されてしまう
     ・出発のボタン   … ゲーム開始が二重に走ってしまう

     preventDefault() を呼ぶと、ブラウザは
     このキーでボタンを押すのをやめてくれる */
  if (event.repeat) {
    event.preventDefault();
    return;
  }

  /* ボタンにフォーカスが当たっているときは、ここでは何もしない

     そのボタンを「押す」のはブラウザの仕事なので、
     ここでも toggleSnackSelection() などを呼ぶと、2回動いてしまう

     preventDefault() を呼ばずに return するのが大事
     呼んでしまうと、フォーカスしているボタン自身が押せなくなる */
  if (document.activeElement instanceof HTMLButtonElement) {
    return;
  }

  /* どこにもフォーカスが無いときは、最初のおやつへカーソルを出すだけにする

     ここでいきなり選んでしまうと、
     「どれが選ばれるのか見えないまま決まった」ことになってしまう
     いったんカーソルを出して、もう一度Enterで選んでもらう */
  event.preventDefault();
  focusFirstSnackOption();
}

/* ============================================================
   あそびかた画面のキーボード操作

   ・Escape          … タイトル画面（B画面）へ戻る（「← ひとつ前の画面へ戻る」と同じ closeHowToPlay()）
   ・← →             … 上の「← ひとつ前の画面へ戻る」と「サウンドON/OFF」を行き来する
                       （どちらかにフォーカスがあるときだけ）
   ・↑ ↓             … ここでは何もしない（ブラウザのふつうのスクロールにまかせる）
   ・Tab / Shift+Tab … ブラウザのふつうの移動（おやつ選択画面と同じく、回りこませない）
   ・Enter / Space   … ボタンを押すのはブラウザにまかせる。押しっぱなしを止めるだけ

   ■ 横取りするキーを、できるだけ少なくしている

     この画面は、ほかの画面とちがって「読む」ための縦に長いページ
     ↑↓・Space・PageUp / PageDown・Home / End でふつうにスクロールできるよう、
     preventDefault() するのは、ここで実際に何かをしたキーだけにしてある
   ============================================================ */
function handleHowToPlayKeydown(event: KeyboardEvent) {
  // ① Escape … どこにフォーカスがあってもB画面へ戻る
  if (event.key === 'Escape') {
    event.preventDefault();
    closeHowToPlay();
    return;
  }

  /* ② ← → … 上のツールバーの2つを行き来する

     どちらかのボタンにフォーカスがあるときだけ動かす
     本文を読んでいる途中（ほかの場所にフォーカスがあるとき）に←→で上のボタンへ飛ぶと、
     フォーカスに合わせて画面がいちばん上までスクロールしてしまうため */
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const backButton = howToBackButtonRef.value;
    const soundButton = soundToggleButtonRef.value;
    const active = document.activeElement;

    if (!backButton || !soundButton || (active !== backButton && active !== soundButton)) {
      return;
    }

    event.preventDefault();

    // 2つしかないので、←でも→でも「もう片方」へ動く
    if (active === backButton) {
      soundButton.focus();
    } else {
      backButton.focus();
    }

    return;
  }

  /* ③ Enter / Space … ボタンの押しっぱなし（長押し）だけ止める

     ボタンを押すのはブラウザの仕事なので、ここでは closeHowToPlay() などを呼ばない
     （呼ぶと、ブラウザのclickと合わせて2回動いてしまう）
     押しっぱなしのときは、サウンドON/OFFがパタパタ切りかわらないように止めておく

     ボタンにフォーカスが無いときの Space は止めない（ページを下へスクロールするふつうの動き） */
  if ((event.key === 'Enter' || event.key === ' ') && event.repeat && document.activeElement instanceof HTMLButtonElement) {
    event.preventDefault();
  }
}

/* A画面・B画面でキーを押したときの処理（ゲーム本編とは分けてある） */
function handleTitleKeydown(event: KeyboardEvent) {
  const items = getTitleFocusItems();

  if (items.length === 0) {
    return;
  }

  // ①② ↑ ↓ ← →：画面の並びのとおりにフォーカスを動かす
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    // 矢印キーでページがスクロールしてしまわないようにする
    event.preventDefault();
    moveTitleFocusByArrow(event.key);
    return;
  }

  /* ③ Tab：ふだんはブラウザにまかせる（＝いつもどおりの移動）

     ただし、いちばん後ろのボタンで Tab を押すと、
     フォーカスが画面の外（ブラウザの上のほう）へ出ていってしまう
     そこで、はしに来たときだけ反対のはしへ回りこませる
     こうすると Tab でも3つをぐるぐる回れる */
  if (event.key === 'Tab') {
    const first = items[0];

    /* いちばん後ろは「音量スライダー」

       スライダーはボタンではないので items には入っていないが、
       HTMLではサウンドボタンのすぐ後ろ（＝いちばん最後）に置いてある
       ここで行き先に入れておかないと、サウンドボタンでTabを押したときに
       スライダーを飛びこして、先頭まで戻ってしまう */
    const last = soundVolumeSliderRef.value ?? items[items.length - 1];

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }

    return;
  }

  // ④ Enter / Space：選んでいるボタンを実行する
  const isDecideKey = event.key === 'Enter' || event.key === ' ';

  if (!isDecideKey) {
    return;
  }

  /* 押しっぱなし（長押し）のときは、2回目以降をここで止める

     Enterを押しっぱなしにすると、キーの自動リピートで
     「はじめる」を押す → B画面へ進む → そのまま「きょうのおやつを選ぶ」も押される、
     と続けて進んでしまうため、preventDefault で先へ行かせない */
  if (event.repeat) {
    event.preventDefault();
    return;
  }

  /* ボタンなどにフォーカスが当たっているときは、ここでは何もしない

     そのボタンを「押す」のはブラウザがやってくれるので、
     ここで「はじめる」「きょうのおやつを選ぶ」まで動かしてしまうと、
     1回押しただけで2つのことが起きてしまう
     （例：サウンドON/OFFでSpaceを押すと、切り替えと同時に画面が進んでしまう）

     preventDefault を呼ばずに return するのが大事
     呼んでしまうと、フォーカスしているボタン自身が押せなくなる */
  const active = document.activeElement;

  if (
    active instanceof HTMLButtonElement ||
    active instanceof HTMLAnchorElement ||
    active instanceof HTMLInputElement ||
    active instanceof HTMLSelectElement ||
    active instanceof HTMLTextAreaElement
  ) {
    return;
  }

  /* どこも選んでいない（body など）ときは、
     今までどおり、その画面のメインのボタンを押したことにする */

  // Spaceでページが下にスクロールするのを防ぐ
  event.preventDefault();

  if (!titleEntered.value) {
    enterTitle(); // A画面の「▶ はじめる」
  } else {
    /* B画面の「きょうのおやつを選ぶ」

       押したときと同じで、ここでもゲームは始まらない
       まずおやつ選択画面へ進む（公園へ出発するのは、そのあと） */
    openSnackSelection();
  }
}

/* ============================================================
   読む画面のスクロール（↑↓）

   行動の結果・いやいやタイム・とつぜんのできごと・秘密の小道・ゴール／GAME OVER は、
   文章を「読む」画面なので、中身が画面に収まらないときは
   ↑↓ をスクロールに使い、コマンドは ← → で選ぶ
   （スクロールしない＝画面に収まっているときは、今までどおり ↑↓ でも選べる）

   公園入口と、通常の場所で結果が出る前の「どうする？」は、
   選択肢そのものを選ぶメニューなので、今までどおり ↑↓ で選ぶ
   選んだボタンが画面の外なら、revealSelectedCommand() で見える位置まで動かす

   ※ 見るのは「スクロールできるか」だけで、「いま一番上／一番下か」は見ない
     一番下で ↓ を押しても、とつぜんコマンド選択に切りかわらないようにするため
   ============================================================ */

/* ゲーム画面の入れもの（上部ステータス ＋ いまの場面）
   場面（.scene）をさがすときに、この中だけを見る */
const gameScreenRef = ref<HTMLElement | null>(null);

/* ↑↓ を「読むためのスクロール」に使ってよい画面か

   ✕ 公園入口                   … 行き先を選ぶメニュー
   ✕ 通常の場所で結果が出る前     … 「どうする？」はたて1列のメニュー
   ✕ 秘密の小道で遊んでいる最中   … キー操作は handleSecretPathKeydown() が先に受け取る
   ○ それ以外のゲーム画面
     行動の結果（いやいや発生の結果もふくむ）・いやいやタイム（対応を選ぶ前／続いている結果／おさまった結果）・
     とつぜんのできごと（選ぶ前／結果）・秘密の小道（はじまる前／終わったあと）・ゴール・GAME OVER

   ※ いやいや発生の結果は、まだ currentEvent が 'tantrum' ではなく、通常の場所の結果として出る
     そのため currentEvent ではなく「結果が出ているか」で見分けている
   ※ おやつバッグ・「☕ ひとやすみ」は handleKeydown() でこれより先に受け取るので、
     開いているあいだの ↑↓ はスクロールに取られない */
const isReadingScene = computed(() => {
  if (currentEvent.value === 'parkEntrance' || isSecretPathPlaying.value) {
    return false;
  }

  return !isNormalPlace.value || !!resultMessage.value;
});

/* いま画面に出ている場面（.scene）

   消えかけの前の場面（.scene-leave-active）はふくめない
   ほかの場面の結果カードや .stage を、まちがってスクロールしないようにするため
   （場面の切りかえは mode="out-in" なので、消えかけのあいだは次の場面がまだ無く、null になる） */
function getCurrentSceneElement() {
  return gameScreenRef.value?.querySelector<HTMLElement>(':scope > .scene:not(.scene-leave-active)') ?? null;
}

/* 要素の中身を、その要素の中でスクロールできるか
   overflow-y が auto / scroll で、中身が1pxより多くはみ出しているとき */
function canScrollInside(element: HTMLElement | null): element is HTMLElement {
  if (!element) {
    return false;
  }

  const { overflowY } = getComputedStyle(element);

  if (overflowY !== 'auto' && overflowY !== 'scroll') {
    return false;
  }

  return element.scrollHeight - element.clientHeight > 1;
}

/* スクロールする要素の「見えている高さ」
   ページ全体（document.scrollingElement）は、ウィンドウの高さで見る */
function getScrollViewHeight(element: HTMLElement) {
  return element === document.scrollingElement ? window.innerHeight : element.clientHeight;
}

/* ↑↓ でスクロールできる要素を、先に動かす順に返す（スクロールできないものは入れない）

   1. 結果カードの中身（.result-card__body）
   2. その場面の中央エリア（.stage）
   3. ページ全体（スマホ幅では .stage が伸びて、ページごとスクロールする）

   空っぽなら「スクロールしない画面」＝ ↑↓ は今までどおりコマンドを選ぶ
   ※ 結果カードは場面ごとに1枚ずつあるが、いま出ている場面の中だけをさがすので、
     場面ごとに別々の処理を書かなくてよい */
function getSceneScrollers(scene: HTMLElement) {
  const scrollers: HTMLElement[] = [];

  const resultBody = scene.querySelector<HTMLElement>('.result-card__body');

  if (canScrollInside(resultBody)) {
    scrollers.push(resultBody);
  }

  const stage = scene.querySelector<HTMLElement>('.stage');

  if (canScrollInside(stage)) {
    scrollers.push(stage);
  }

  const page = document.scrollingElement;

  if (page instanceof HTMLElement && page.scrollHeight - window.innerHeight > 1) {
    scrollers.push(page);
  }

  return scrollers;
}

/* ↑↓ を1回押したぶん、スクロールする

   前の候補が、その向きにはもう動けない（いちばん上／下まで来た）ときは、次の候補を動かす
   （結果カードを読みおえたら、そのまま .stage やページの続きへ進める。マウスホイールと同じ動き）
   どれも動けないときは何もしない（コマンド選択には切りかえない）

   ・1回に動かす量 … 見えている高さの2割（60〜120px）
   ・behavior: 'auto' … なめらかスクロールを積み重ねないので、押しっぱなしでも続けて動く */
function scrollSceneByArrow(scrollers: HTMLElement[], direction: 1 | -1) {
  const target = scrollers.find((element) => {
    if (direction < 0) {
      return element.scrollTop > 0;
    }

    return element.scrollTop + getScrollViewHeight(element) < element.scrollHeight - 1;
  });

  if (!target) {
    return;
  }

  const amount = Math.min(120, Math.max(60, Math.round(getScrollViewHeight(target) * 0.2)));

  target.scrollBy({ top: direction * amount, behavior: 'auto' });
}

/* キーボードで選んだコマンドが見えていないときだけ、見える位置までスクロールする

   ・公園入口の「どこへ行く？」のように、選択肢の枠そのものがスクロールする画面
   ・↑↓ で結果を読んでいるうちに、コマンドの枠が画面の外へ出ている画面
   で「キーボードでは選べているのに、何を選んでいるか見えない」状態にしないためのもの

   block: 'nearest' … もう見えているなら動かさない
   ※ 選んでいる印（--selected）が付くのは画面の書きかえのあとなので、nextTick で待つ */
function revealSelectedCommand() {
  // 見える位置へスクロールすると、止まったままのマウスの下に別のボタンが来て、
  // @mouseenter でキーボードの選択が上書きされてしまうので、マウスを動かすまで止めておく（isCommandPointerPaused を参照）
  pauseCommandPointer();

  nextTick(() => {
    const selected = getCurrentSceneElement()?.querySelector<HTMLElement>('.command-box__item--selected, .cmd--selected');

    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

/* キーボードのキーが押されたときの処理

   ここが今回のキーボード操作の入口
   ① キー操作しない画面なら、なにもしないで終わり
   ② ↑↓ならコマンドを動かす（読む画面でスクロールできるときは、スクロールする）
   ③ ← →なら、となりのコマンドへ動かす
   ④ Enter / Space なら、選択中のコマンドを実行する
*/
function handleKeydown(event: KeyboardEvent) {
  /* 画面がフェードで切りかわっている最中は、キーを受けつけない

     見えているのは前の画面なのに、中身（state）はもう次の画面のものになっている
     ここでEnterを押せてしまうと、見えていない次の画面のボタンまで
     続けて押したことになってしまうため
     （例：「はじめる」→ 見えないうちに「きょうのおやつを選ぶ」まで押されてゲームが始まる）

     マウスのほうは、消えかけの画面を押せなくするCSSで止めている
     （.screen-fade-leave-active の pointer-events: none） */
  if (isScreenChanging.value) {
    return;
  }

  /* 音量スライダーを選んでいるあいだは、ゲームのキー操作をしない

     このゲームのキー操作は window 全体で受け取っているため、
     スライダーを選んだまま ← → を押すと
     「音量を変える」と「コマンドを選びなおす」が同時に起きてしまう

     input type="range" は、ブラウザがもともと
     ・← →        … 1目もり（1%）ずつ増やす・減らす
     ・Home / End  … 0% / 100%
     を用意してくれているので、ここでは何もせず、そのままブラウザにまかせる
     Enter / Space はスライダーでは何も起きないキーだが、
     そのまま下へ行くとゲームの「決定」になってしまうので、ここで止めておく

     ※ event.preventDefault() は呼ばない
       呼ぶと、そのブラウザ本来の操作まで止まってしまう
     ※ Tab と Escape は、わざと素通りさせている
       Tab … A画面・B画面の「いちばん後ろまで行ったら先頭へ戻る」を今までどおり動かすため
       Escape … おやつ選択画面・あそびかた画面から、今までどおり戻れるようにするため
     ※ 画面ごとの分岐より前（いちばん上）に置くのが大事
       A画面・B画面・おやつ選択画面・あそびかた画面・ゲーム本編と、
       スライダーはどの画面にも出ているので、ここ1か所でまとめて止められる
  */
  const sliderOwnKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' '];
  const keyTarget = event.target as HTMLElement | null;

  if (sliderOwnKeys.includes(event.key) && keyTarget?.closest?.('.sound-control__slider')) {
    return;
  }

  /* ⓪ あそびかた画面

     おやつ選択画面・A画面・B画面より先に見る（画面の出し分けと同じ順番）
     あとに置くと、あそびかた画面なのに
     画面に無いB画面のボタンを矢印キーで動かそうとしてしまう
     （getTitleFocusItems() も、この画面では空を返すようにしてある）
     ・Escape         … B画面へ戻る
     ・← →            … 上の「戻る」と「サウンド」を行き来する
     ・↑ ↓            … 横取りしない（ふつうのスクロール）
     ・Tab / Enter / Space … ブラウザのふつうの動き */
  if (!gameStarted.value && isHowToPlayOpen.value) {
    handleHowToPlayKeydown(event);
    return;
  }

  /* ⓪ おやつ選択画面

     この画面は、操作するものが「おやつのカード ＋ 出発 ＋ 戻る ＋ サウンド」で、
     A画面・B画面ともゲーム本編ともちがう
     そのため、ここで分けて専用の関数にまかせる
     ・↑ ↓ ← →     … 画面のならびどおりに、となりのボタンへ動く
     ・Enter / Space … 選んでいるボタンを押す（選ぶ・解除・決定）
     ・Escape        … B画面へ戻る
     ・Tab           … ブラウザのふつうの移動

     ※ A画面・B画面の分岐（この下の⓪）より前に置くのが大事
       あとに置くと、おやつ選択画面なのに
       画面に無いB画面のボタンを操作しようとしてしまう
       （getTitleFocusItems() も、この画面では空を返すようにしてある） */
  if (!gameStarted.value && isSnackSelectionOpen.value) {
    handleSnackSelectionKeydown(event);
    return;
  }

  /* ⓪ 起動画面（A）・タイトル画面（B）

     この2画面は、操作するものが「ボタン3つ」だけで、
     ゲーム本編とは考えかたがちがう
     そのため、いちばん最初にここで分けて、専用の関数にまかせる
     （キーの受付は window の1か所のままなので、
       同じようなリスナーが2つに増えることはない） */
  if (!gameStarted.value) {
    handleTitleKeydown(event);
    return;
  }

  /* ここから下は、ゲーム本編（gameStarted === true）だけの処理 */

  /* ⓪-00 秘密の小道（ミニゲーム）で遊んでいる最中

     ← → / A D はミニゲームの操作だけに使い、ふつうのコマンド操作（↑↓・Enter）は動かさない
     はじまる前（小道へ進む／← 場所選びにもどる）と終わったあと（先へ進む）は、ここを通らずに
     いつもどおりのコマンド操作になる（commandCount は はじまる前 2・終わったあと 1） */
  if (isSecretPathPlaying.value) {
    handleSecretPathKeydown(event);
    return;
  }

  /* ⓪-0 「公園の出口へ向かう？」の確認ダイアログが開いているとき

     画面のいちばん手前に出ているので、ほかのどの操作より先に見る
     開いているあいだは、キー操作をぜんぶダイアログで受け取る
     （うしろの「どこへ行く？」のコマンドは動かない）

     ・← ↑           「もう少し遊ぶ」を選ぶ
     ・→ ↓           「出口へ向かう」を選ぶ
                       （スマホ幅では2つのボタンが たてに並ぶので、↑↓でも同じ向きになる）
     ・Tab           2つのボタンを行き来する（うしろの画面へカーソルを逃がさない）
     ・Enter / Space 選んでいるボタンを押す
     ・Escape        閉じる（「もう少し遊ぶ」と同じ）

     ※ 長押し（event.repeat）の Enter / Space は受けつけない
       「公園の出口へ向かう」で Enter を押しっぱなしにしても、
       ダイアログが開いた直後に、そのまま次のボタンまで押されてしまわないようにする
     ※ ここにあるキーだけ preventDefault() する
       それ以外のキー（ブラウザの再読みこみなど）は、じゃましない */
  if (isGoalConfirmVisible.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeGoalConfirm();
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectedGoalConfirmIndex.value = 0;
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      selectedGoalConfirmIndex.value = 1;
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      selectedGoalConfirmIndex.value = selectedGoalConfirmIndex.value === 0 ? 1 : 0;
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();

      if (event.repeat) {
        return;
      }

      if (selectedGoalConfirmIndex.value === 1) {
        confirmGoToGoal();
      } else {
        closeGoalConfirm();
      }
    }

    return;
  }

  /* 画面の中のボタンにフォーカスしているときは、ゲームのキー操作をしない

     このゲームのキー操作は window 全体で受け取っているため、
     音ボタンを選んだ状態で Enter を押すと、
     「音のON/OFF」と「ゲームの決定（次の場所を選ぶ など）」が同時に起きてしまう
     それを防ぐために、ここで抜ける

     ここで抜けるボタン
     ・.sound-toggle … サウンドのON/OFF（上部バーにあるもの）

     ※ event.preventDefault() は呼ばない
       呼ばずに return することで、button本来の Enter / Space による
       クリック動作はブラウザにそのまま任せられる
  */
  const target = event.target as HTMLElement | null;

  if (target?.closest?.('.sound-toggle')) {
    return;
  }

  // Enter と Space は、どちらも同じ「決定」として扱う
  // Space は event.key では ' '（半角スペース1文字）になる
  const isDecideKey = event.key === 'Enter' || event.key === ' ';

  /* ⓪-1 おやつバッグが開いているとき

     いちばん内側のメニューなので、サブメニュー「☕ ひとやすみ」より先に見る
     （ひとやすみの中でバッグを開いているときは、どちらも「開いている」状態のため）

     ・↑↓           バッグの中で選ぶ（いちばん下は「← もどる」）
     ・Enter / Space 選んでいるおやつを食べる（「← もどる」なら戻る）
     ・Escape        1つ前のメニューへ戻る（☕ ひとやすみ／いやいやのコマンド など）
                     ゲームを終えたり、タイトルへ戻ったりはしない

     ※ Enter / Space で preventDefault() を呼ぶのが大事
       フォーカスが当たっているボタンの「本来のクリック」が止まるので、
       1回押しただけで「ここでの実行」と「ボタンのクリック」の2回ぶん
       おやつを食べてしまう、ということが起きない
       （メインコマンド・ひとやすみと同じやりかた）
  */
  if (isSnackMenuVisible.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSnackMenu();
      return;
    }

    if (event.key === 'ArrowUp') {
      // 矢印キーでページが上下にスクロールしてしまわないようにする
      event.preventDefault();
      moveSnackMenuUp();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSnackMenuDown();
      return;
    }

    if (isDecideKey) {
      // Spaceでページが下にスクロールするのを防ぐ（ボタン本来のクリックも、これで止まる）
      event.preventDefault();

      // 押しっぱなし（長押し）で、おやつを続けて食べてしまわないようにする
      if (event.repeat) {
        return;
      }

      runSelectedCommand();
      return;
    }

    // ここまでに当てはまらないキー（←→など）は、何もしないでブラウザにまかせる
    return;
  }

  /* ⓪-2 サブメニュー「☕ ひとやすみ」が開いているとき

     開いているあいだは、キー操作をぜんぶサブメニュー側で受け取る
     （メインコマンドは画面に残っているが、↑↓で動くのはサブメニューの中だけ）

     ・↑↓           サブメニューの中で選ぶ
     ・Enter / Space 選んでいる行を実行する
     ・Escape        サブメニューを閉じる
     ・→             サブメニューはPCでは左側に出るので、右を押すとメインへ戻る

     閉じたあとは、メイン側の「休憩・おやつ」が選ばれたままになる
     （closeCareMenu() は selectedCommandIndex をさわらないため）

     ※ メインコマンドの↑↓（この下の ①②）より前に置くのが大事
       あとに置くと、↑↓がメイン側に取られてしまう
  */
  if (isCareMenuVisible.value) {
    // Escape と → で閉じる
    if (event.key === 'Escape' || event.key === 'ArrowRight') {
      event.preventDefault();
      closeCareMenu();
      return;
    }

    if (event.key === 'ArrowUp') {
      // 矢印キーでページが上下にスクロールしてしまわないようにする
      event.preventDefault();
      moveCareCommandUp();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveCareCommandDown();
      return;
    }

    if (isDecideKey) {
      // Spaceでページが下にスクロールするのを防ぐ
      event.preventDefault();

      // 押しっぱなし（長押し）で同じ行動が何度も走らないようにする
      if (event.repeat) {
        return;
      }

      runSelectedCommand();
      return;
    }

    // ここまでに当てはまらないキー（←など）は、何もしないでブラウザにまかせる
    return;
  }

  // 公園入口だけは、コマンドが横にも並んでいる（3列・2列・1列）ので、
  // ↑↓の動きかたが他の場所とちがう
  const isEntrance = currentEvent.value === 'parkEntrance';

  /* ⓪-3 読む画面で ↑↓ を押したとき（どの画面が「読む画面」かは isReadingScene を参照）

     結果カードの中身・中央エリア・ページのどれかがスクロールできるなら、
     ↑↓ はスクロールだけに使い、コマンドは動かさない（コマンドは この下の ③ の ← → で選ぶ）
     どれもスクロールできない（画面に収まっている）ときは、この下の ①② で今までどおりコマンドを選ぶ

     次の画面を、ここ1か所でまとめて受け取っている（場面ごとに別の処理は書かない）
     ・ゴール／GAME OVER のリザルト
     ・いやいやタイム（対応を選ぶ前・まだ続いている結果・おさまった結果）
     ・行動の結果（いやいや発生の結果もふくむ）
     ・とつぜんのできごと（選ぶ前・結果）／秘密の小道（はじまる前・終わったあと）

     ※ 押しっぱなし（event.repeat）でも止めない。続けてスクロールできるようにするため */
  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && isReadingScene.value) {
    const scene = getCurrentSceneElement();

    // 場面が切りかわっている最中（次の場面がまだ無い）は、何もしない
    // ここでコマンドを動かしてしまうと、次の場面が出たときに選択がずれているため
    if (!scene) {
      event.preventDefault();
      return;
    }

    const scrollers = getSceneScrollers(scene);

    if (scrollers.length > 0) {
      event.preventDefault();
      scrollSceneByArrow(scrollers, event.key === 'ArrowUp' ? -1 : 1);

      // スクロールで止まったままのマウスの下にボタンが来ても、選択が変わらないようにする（isCommandPointerPaused を参照）
      pauseCommandPointer();
      return;
    }
  }

  // ① ↑：1つ上のコマンドへ
  if (event.key === 'ArrowUp') {
    // 矢印キーでページが上下にスクロールしてしまわないようにする
    event.preventDefault();

    if (isEntrance) {
      moveEntranceUp(); // 公園入口は1行ぶん（列の数ぶん）上へ
    } else {
      moveCommandUp(); // たて1列の場所は1つ上へ
    }

    // 選んだコマンドが画面の外（スクロールで隠れたところ）にあれば、見える位置へ
    revealSelectedCommand();
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

    revealSelectedCommand();
    return;
  }

  /* ③ ← →：となりのコマンドへ1つ動かす

     ・公園入口 … 1つ前／次へ（はしで止まる）
     ・読む画面 … 1つ前（左）／次（右）へ
                  横ならびの選択肢（いやいや・とつぜんのできごと・秘密の小道・ゴール／GAME OVER）は、見た目の左右と同じ向きに動く
                  ↑↓ で結果をスクロールしているあいだも、ここでコマンドを選べる
                  ボタンが1つだけの画面では、押しても何も変わらない
     ・通常の場所で結果が出る前 … 「どうする？」はたて1列なので、左右キーは使わない */
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (!isEntrance && !isReadingScene.value) {
      return;
    }

    // 矢印キーでページが左右にスクロールしてしまわないようにする
    event.preventDefault();

    if (isEntrance) {
      if (event.key === 'ArrowLeft') {
        moveEntranceLeft(); // ← は1つ前へ（すべり台からゴールへは回りこまない）
      } else {
        moveEntranceRight(); // → は1つ次へ（ゴールからすべり台へは回りこまない）
      }
    } else if (event.key === 'ArrowLeft') {
      moveCommandPrevious(); // ← は1つ左へ（いちばん左で止まる）
    } else {
      moveCommandNext(); // → は1つ右へ（いちばん右で止まる）
    }

    revealSelectedCommand();
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

  // 秘密の小道：↑ をはなしたら はやく進むのをやめる／フォーカスが外れたら、はやい・押している状態を戻す
  window.addEventListener('keyup', handleSecretPathKeyup);
  window.addEventListener('blur', handleSecretPathWindowBlur);
  document.addEventListener('visibilitychange', handleSecretPathVisibilityChange);

  updateEntranceColumns();
  window.addEventListener('resize', updateEntranceColumns);

  // 休憩・おやつの「← もどる」のあと、マウスを動かしたらコマンド枠へのマウス操作を戻す
  window.addEventListener('pointermove', handleWindowPointer);
  window.addEventListener('pointerdown', handleWindowPointer);

  /* A画面のメインのボタン「はじめる」へフォーカスを当てておく
     ページを開いたときのほか、/soundtrack から戻ってきたときもここを通る
     （このページは、もう一度まっさらに作り直されるため） */
  focusTitleMainButton();

  /* 前回のサウンドの設定を思い出す

     localStorage には文字しか入らないので、'true' / 'false' という
     「文字」で戻ってくる。保存したことが無いときは null になる
     null のときは、最初に決めた true（＝ON）のままにする
  */
  try {
    const savedSoundSetting = localStorage.getItem(soundStorageKey);

    if (savedSoundSetting === 'false') {
      soundEnabled.value = false;
    } else if (savedSoundSetting === 'true') {
      soundEnabled.value = true;
    }
  } catch {
    // 読み込めなくても、初期値のONで普通に遊べる
  }

  /* 前回の音量を思い出す

     localStorage には文字しか入らないので、'70' のような「文字」で戻ってくる
     保存したことが無いときは null になる

     ※ null をそのまま Number() に入れると 0 になってしまうので、
       先に「保存されているか」を見てから数字に直している
     ※ 数字にならない・0未満・100より大きい、のときは
       最初に決めた100%（そのままの大きさ）のままにする
  */
  try {
    const savedSoundVolume = localStorage.getItem(soundVolumeStorageKey);

    if (savedSoundVolume !== null) {
      const percent = Number(savedSoundVolume);

      if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
        soundVolumePercent.value = Math.round(percent);
      }
    }
  } catch {
    // 読み込めなくても、初期値の100%で普通に遊べる
  }

  /* サウンドのON/OFFと音量を、ここでそろえておく（0% ＝ ミュート）

     この2つは別々に保存しているので、
     前に遊んだときの保存がかみ合っていないことがある
     （たとえば「ミュートだが音量は70%」というメモが残っている、など）
     そのままにすると、アイコンは 🔊× なのにスライダーは70%、
     という食いちがった見た目になってしまうので、開いたときに1回そろえる

     ※ ここではBGMを鳴らしたり止めたりしない
       ページを開いた直後は、まだどのBGMも鳴っていないため
  */
  if (!soundEnabled.value) {
    // ミュートで始まるとき … 音量も0%にそろえ、解除したときの戻り先を覚えておく
    if (soundVolumePercent.value > 0) {
      volumeBeforeMute = soundVolumePercent.value;
    }

    soundVolumePercent.value = 0;
  } else if (soundVolumePercent.value === 0) {
    // 0%で始まるとき … 音が出ないので、スピーカーもミュートにそろえる
    soundEnabled.value = false;
  } else {
    // ふつうに音が出る状態 … いまの大きさを、そのまま戻り先にしておく
    volumeBeforeMute = soundVolumePercent.value;
  }

  /* S+ランク限定のうた入りBGMを、前に解放しているかを思い出す
     （サーバー側では localStorage を読めないので、ブラウザで動くここで読む）
     解放済みなら、次にS+を取っても「新しい曲が追加されました！」は出ない */
  hasUnlockedSPlusSong.value = loadHasUnlockedSPlusSong();

  /* ※ ここではBGMを鳴らさない

     ページを開いた直後は、ブラウザの決まりで音を鳴らせない
     タイトルBGMは、起動画面の「▶ はじめる」を押したとき
     （＝ユーザーが操作したとき）に enterTitle() で鳴らしはじめる
  */
});

/* 画面から離れるときは、受付をやめる（後始末） */
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keyup', handleSecretPathKeyup);
  window.removeEventListener('blur', handleSecretPathWindowBlur);
  document.removeEventListener('visibilitychange', handleSecretPathVisibilityChange);
  window.removeEventListener('resize', updateEntranceColumns);
  window.removeEventListener('pointermove', handleWindowPointer);
  window.removeEventListener('pointerdown', handleWindowPointer);

  // 別のページへ移ったあともBGMが鳴り続けないように、ぜんぶの曲を止めておく
  // （pauseParkBgm() は、公園BGM1・BGM2の両方をまとめて止めてくれる）
  pauseTitleBgm();
  pauseParkBgm();
  pauseSecretBgm();
  pauseTantrumBgm();
  pauseResultBgm();
  pauseGameOverBgm();

  // 「あとで鳴らす」の予約と、フェードインの途中経過も止める
  // 残っていると、ページを離れたあとも動きつづけてしまう
  // （GAME OVER BGMの0.7秒の予約が残っていると、別のページで鳴りだしてしまう）
  cancelTitleBgmStart();
  cancelParkBgmStart();
  cancelSecretBgmStart();
  cancelResultBgmStart();
  cancelGameOverBgmStart();
  cancelBgmFade();

  // いやいや発生の演出の「あとで消す」予約も取り消しておく
  hideTantrumAlert();

  // 秘密の小道（ミニゲーム）の requestAnimationFrame も止めておく
  // はやく進む・押している状態と、長押しを待つ予約も片づける
  stopSecretPathLoop();
  releaseSecretPathControls();
});
</script>

<template>
  <main class="game">
    <!-- ============================================================
         画面の切りかえ（A画面 ⇄ B画面 ⇄ あそびかた／おやつ選択 ⇄ ゲーム画面）

         これらの画面はページを移動しているのではなく、
         同じページの中で v-if / v-else-if を切りかえて出し分けている
         そのままだと切りかわった瞬間にパッと入れかわって見えるので、
         Vueの <Transition> で短いフェードをはさんでいる

         mode="out-in" ＝ 前の画面が消えきってから、次の画面を出す
         2枚が同時に出ないので、
         ・カードの位置がずれない
         ・画面が一瞬2つぶんの高さにならない

         うれしいのは、消えていく画面の中身がそのまま残ること
         「もう一度あそぶ」を押すと、中の記録（スコアなど）は
         その場でぜんぶ初期値に戻るが、消えかけの画面はもう作りなおされないので、
         スコアや結果文は見えたままフェードアウトしていく
         （＝「数字が先に0になってから消える」ようには見えない）

         hooks（@before-leave など）でやっていること
         ・フェード中は、キーの操作を受けつけない（→ isScreenChanging）
         ・次の画面が出おわったら、その画面のメインのボタンへフォーカスを当てる
         ============================================================ -->
    <Transition name="screen-fade" mode="out-in" @before-leave="handleScreenLeaveStart" @after-leave="handleScreenLeaveEnd" @after-enter="handleScreenEnterEnd">
      <!-- ============================================================
           あそびかた画面（B画面から開く説明書）

           B画面の「？ あそびかた」で開き、「← ひとつ前の画面へ戻る」・Escape でB画面へ戻る
           開いているあいだは、A画面・B画面・おやつ選択画面より優先して出す
           （そのため、この Transition の中でいちばん先に書いてある。
             キー操作の handleKeydown()・フォーカスの handleScreenEnterEnd() も同じ順番で見ている）

           ■ ルールと考えかたは教える。ただし正解までは教えない

             次のようなものは、わざと書いていない
             ・秘密の場所の名前と、行けるようになる条件
             ・おやつと いやいやの理由 の相性
             ・「少し待ってみる」の成功率、いやいやレベルごとの数字
             ・同じ対応をくり返したときの効きにくさの数字
             ・ナイス対応になる組み合わせ、各行動のステータス増減
             あとから説明を書き足すときも、ここは守ること

           ■ 縦に長いので、.title-screen の縦スクロールでそのまま読む
             （スマホ幅では、ページ全体のスクロールになる）
             ↑↓キーもふつうのスクロールとして使えるよう、キー操作では横取りしない
           ============================================================ -->
      <div v-if="!gameStarted && isHowToPlayOpen" key="how-to-play" class="title-screen">
        <div class="title-card title-card--howto">
          <!-- 上のツールバー（A画面・B画面・おやつ選択画面と同じ .title-card__tools を使う）
               左：タイトル画面（B画面）へ戻る
               右：サウンドON/OFF（ほかの画面と同じ soundEnabled / toggleSound() をそのまま使う）

               ※ この画面は、見た目の順番とHTMLの順番が同じ
                 Tabは「← ひとつ前の画面へ戻る → サウンド → いちばん下の ← ひとつ前の画面へ戻る」と上から順に進む -->
          <div class="title-card__tools">
            <button ref="howToBackButtonRef" type="button" class="title-card__back" @click="closeHowToPlay">← ひとつ前の画面へ戻る</button>

            <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

                 文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
                 何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

                 ・ミュートボタン … 音を出すか、出さないか
                 ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
                 0% ＝ ミュートなので、2つはいつも同じ状態になる
                 （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る） -->
            <div class="sound-control">
              <button
                ref="soundToggleButtonRef"
                type="button"
                class="sound-toggle"
                :aria-pressed="soundEnabled"
                :aria-label="soundEnabled ? 'サウンドをミュート' : 'サウンドをオン'"
                @click="toggleSound">
                <!-- スピーカーは、ONでもOFFでも同じ絵文字のまま
                     OFFのときだけ、右どなりに「×」を出す（🔊×）。スピーカーには重ねない
                     ミュートの絵文字 🔇 のような「斜めの線」だけの表しかたはしていない
                     小さく出すと、音が出ない状態なのかどうかが、ぱっと見では分かりにくいため -->
                <span class="sound-toggle__icon">
                  <!-- ON用（🔊）とOFF用（🔊×）を、同じマスに重ねて置いてある
                       いま使わないほうを見えなくするだけなので、
                       ボタンの幅はいつも長いほう（🔊×）のままで、押しても変わらない -->
                  <span class="sound-toggle__state sound-toggle__state--on">🔊</span>

                  <span class="sound-toggle__state sound-toggle__state--off">
                    <span class="sound-toggle__speaker">🔊</span>
                    <span class="sound-toggle__muteMark">×</span>
                  </span>
                </span>

                <span class="sound-control__tooltip" aria-hidden="true">{{ soundEnabled ? 'サウンドをミュート' : 'サウンドをオン' }}</span>
              </button>

              <!-- 音量のスライダー（BGMも効果音も、まとめて変わる）

                   吹き出しは input の中には置けないので、外側の span でかこって、そこに出している
                   :style で渡している --volume-progress は、レールの「塗ったところ」の境目の位置
                   （サウンドトラックページの音量スライダーと同じ作りかた）

                   0%まで下げるとミュート、そこから上げるとミュート解除になる
                   （スピーカーのアイコンも、いっしょに切りかわる） -->
              <span class="sound-control__sliderWrap">
                <input
                  ref="soundVolumeSliderRef"
                  type="range"
                  class="sound-control__slider"
                  min="0"
                  max="100"
                  step="1"
                  :value="soundVolumePercent"
                  :style="{ '--volume-progress': soundVolumePercent + '%' }"
                  aria-label="音量"
                  :aria-valuetext="soundVolumePercent + 'パーセント'"
                  @input="changeSoundVolume" />

                <span class="sound-control__tooltip" aria-hidden="true">音量 {{ soundVolumePercent }}%</span>
              </span>
            </div>
          </div>

          <h1 class="howto-heading">
            <span class="howto-heading__icon" aria-hidden="true">?</span>
            あそびかた
          </h1>

          <!-- 1. このゲームについて（公園の探検と、操作のしかたも、ここにまとめて書く）

               秘密の場所の名前や、行けるようになる条件は書かない
               「特別な場所もあるみたい」までにとどめる -->
          <section class="howto-section">
            <h2 class="howto-section__title">
              <span class="howto-section__num">1</span>
              こうちゃんと公園を探検しよう
            </h2>

            <ul class="howto-list">
              <li>朝9時から12時まで、公園の場所を選んで探検します。</li>
              <li>選んだ行動によって時間が進み、こうちゃんや親の状態が変わります。</li>
              <li>アイテムを見つけたり、ちょっとした出来事が起きたりすることも。公園には、少し特別な場所もあるみたい。</li>
              <li>12時になるか、公園の出口へ向かうとおしまい。結果発表があります。</li>
            </ul>

            <!-- 操作は「パソコンでもスマホでも遊べる」と分かる最低限だけ書く
                 キーの一覧（Space・← → など）や、場面ごとのくわしい操作は書かない
                 （秘密の小道の操作は、ミニゲームの画面にそのつど案内が出る） -->
            <p class="howto-note">
              <b class="howto-note__title">操作</b>
              画面のコマンドを選んで進めます。パソコンはクリックか矢印キーと Enter、スマホはタップで遊べます。
            </p>
          </section>

          <!-- 2. ステータス

               名前は、ゲーム画面の上部ステータスに出ている言葉にそろえる
               （「親の余裕」など。parentCalm のような中の名前は出さない）
               丸い印の色は、ゲーム画面のそれぞれのゲージと同じ色 -->
          <section class="howto-section">
            <h2 class="howto-section__title">
              <span class="howto-section__num">2</span>
              ステータス
            </h2>

            <dl class="howto-terms">
              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--child-energy"></span>
                  こうちゃんの体力
                </dt>
                <dd>元気に動ける力。少なくなりすぎると、探検を続けにくくなります。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--child-mood"></span>
                  こうちゃんの機嫌
                </dt>
                <dd>どのくらい楽しい気分か。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--parent-energy"></span>
                  親の体力
                </dt>
                <dd>いっしょに遊んだり、だっこしたりすると減ることがあります。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--parent-calm"></span>
                  親の余裕
                </dt>
                <dd>親が落ち着いて対応できているか。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--point"></span>
                  おでかけポイント
                </dt>
                <dd>いろいろ体験すると増えます。結果にも関係します。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>
                  <span class="howto-dot howto-dot--time"></span>
                  時間
                </dt>
                <dd>行動すると進みます。</dd>
              </div>
            </dl>

            <!-- GAME OVER は「こうなると終わることがある」という雰囲気だけ伝える
                 （「○○が0なら」のような判定の一覧にはしない） -->
            <p class="howto-note howto-note--caution">
              <b class="howto-note__title">GAME OVER</b>
              こうちゃんや親が疲れすぎたり、親が落ち着いて対応できなくなったりすると、冒険が途中で終わることがあります。
            </p>
          </section>

          <!-- 3. おやつ

               「どのおやつが、どのいやいやに効くか」は書かない
               おやつの種類と数は、おやつ選択画面と同じ snacks / maxSnackCount を見ている
               （おやつが増えたり、持っていける数が変わったりしても、ここは直さなくてよい） -->
          <section class="howto-section">
            <h2 class="howto-section__title">
              <span class="howto-section__num">3</span>
              おやつ
            </h2>

            <ul class="howto-list">
              <li>出発前に、{{ snacks.length }}種類から{{ maxSnackCount }}つ選んで持っていきます。</li>
              <li>体力が回復しやすいもの、機嫌がよくなりやすいものなど、おやつごとに得意なことが少しちがいます。</li>
              <li>ひとやすみやいやいやタイムで使えます。使うと残りが減ります。</li>
            </ul>
          </section>

          <!-- 4. いやいやタイム

               4つの対応の「しくみ」だけを書く
               理由ごとの正解・おやつの相性・待つの成功率・レベルごとの数字・
               くり返したときの効きにくさの数字・ナイス対応の組み合わせは、どれも書かない
               （対応の名前も、並べる順番も、ゲーム画面のコマンドとそろえてある
                 ＝ お話する → だっこ → おやつ → 待つ。
                 コマンドの順番を変えたときは、ここの並びも合わせて直すこと） -->
          <section class="howto-section">
            <h2 class="howto-section__title">
              <span class="howto-section__num">4</span>
              いやいやタイム
            </h2>

            <p class="howto-text">疲れた・おなかがすいた・うまくできなくて悔しい・まだ遊びたい などの理由で、こうちゃんはいやいやします。理由の答えは画面に出ません。</p>

            <p class="howto-note howto-note--hint">💡 こうちゃんのセリフや様子をよく見て、どうしていやいやしているのか考えてみよう。</p>

            <h3 class="howto-subheading">4つの対応</h3>

            <dl class="howto-terms">
              <div class="howto-terms__row">
                <dt>お話してみる</dt>
                <dd>理由によって、うまくいきやすさが変わります。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>だっこする</dt>
                <dd>落ち着かせやすいけれど、親の体力を使います。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>おやつをあげる</dt>
                <dd>おやつを1つ使います。そのときのこうちゃんとの相性があります。</dd>
              </div>

              <div class="howto-terms__row">
                <dt>少し待ってみる</dt>
                <dd>落ち着くこともあれば、うまくいかないこともあります。</dd>
              </div>
            </dl>

            <ul class="howto-list">
              <li>対応が合わないと、いやいやがもっと強くなることがあります。</li>
              <li>同じ方法ばかり続けるより、別の方法を考えることも大切です。</li>
              <li>気持ちにぴったり合った対応ができると「ナイス対応」になることも。</li>
            </ul>
          </section>

          <!-- 5. ちょっとしたヒント（攻略の答えにはならない、考えかたのヒントだけ） -->
          <section class="howto-section">
            <h2 class="howto-section__title">
              <span class="howto-section__num">5</span>
              ちょっとしたヒント
            </h2>

            <ul class="howto-list">
              <li>時間と体力を見ながら探検しよう。</li>
              <li>おやつは使うと減るので、使いどころも大切。</li>
              <li>いろいろな場所を探検すると、何か見つかるかも？</li>
            </ul>
          </section>

          <!-- いちばん下まで読んだ人が、上までスクロールしなくても戻れるようにする
               （押したときの処理は、上の「← ひとつ前の画面へ戻る」と同じ closeHowToPlay()） -->
          <div class="howto-footer">
            <button type="button" class="title-card__back" @click="closeHowToPlay">← ひとつ前の画面へ戻る</button>
          </div>
        </div>
      </div>

      <!-- ============================================================
           起動画面（いちばん最初の1枚）

           この画面をはさむ理由は、ブラウザの決まりへの対応
           ページを開いた直後は音を鳴らせないので、
           「▶ はじめる」を1回押してもらい、
           その操作をきっかけにタイトルBGMを鳴らしはじめる
           ============================================================ -->
      <div v-else-if="!titleEntered" key="boot" class="title-screen">
        <div class="title-card title-card--boot">
          <!-- ▶ は .cmd--single のCSSがいつも出してくれるので、文字には入れない
               （「きょうのおやつを選ぶ」「もう一度あそぶ」と同じ書き方）

               ※ この画面のメインのボタンなので、HTMLではいちばん先に書いてある
                 Tabキーを押したときに「はじめる → サウンドトラック → サウンド」の
                 順で回れるようにするため（見た目の位置はCSSの order でいちばん下のまま）
               ref … キーボード操作でフォーカスを当てるための目印 -->
          <button ref="startButtonRef" class="cmd cmd--start cmd--single" @click="enterTitle">はじめる</button>

          <!-- 上のツールバー（B画面と同じ .title-card__tools を使う）
               左：サウンドトラック（/soundtrack）への入口
               右：サウンドON/OFF（「はじめる」を押すとタイトルBGMが鳴りだすので、その前に消せるようにしておく） -->
          <div class="title-card__tools">
            <!-- サウンドトラックへの入口（左上）
                 右のサウンドON/OFFと同じ高さ・同じ文字サイズのpillにそろえている
                 （見た目のCSSは .title-card__tools のところにまとめてある）
                 押しても enterTitle() は呼ばず、タイトルBGMも鳴らさずに /soundtrack へ移る

                 ※ Enter/Space を押したときに「はじめる」まで動いてしまわないのは、
                   handleTitleKeydown() が「ボタンにフォーカスがあるときは何もしない」
                   ようにしているため（ボタン側で止める必要はない） -->
            <button ref="soundtrackButtonRef" type="button" class="title-card__soundtrack" @click="goToSoundtrack">♪ サウンドトラック</button>

            <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

                 文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
                 何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

                 ・ミュートボタン … 音を出すか、出さないか
                 ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
                 0% ＝ ミュートなので、2つはいつも同じ状態になる
                 （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る） -->
            <div class="sound-control">
              <button
                ref="soundToggleButtonRef"
                type="button"
                class="sound-toggle"
                :aria-pressed="soundEnabled"
                :aria-label="soundEnabled ? 'サウンドをミュート' : 'サウンドをオン'"
                @click="toggleSound">
                <!-- スピーカーは、ONでもOFFでも同じ絵文字のまま
                     OFFのときだけ、右どなりに「×」を出す（🔊×）。スピーカーには重ねない
                     ミュートの絵文字 🔇 のような「斜めの線」だけの表しかたはしていない
                     小さく出すと、音が出ない状態なのかどうかが、ぱっと見では分かりにくいため -->
                <span class="sound-toggle__icon">
                  <!-- ON用（🔊）とOFF用（🔊×）を、同じマスに重ねて置いてある
                       いま使わないほうを見えなくするだけなので、
                       ボタンの幅はいつも長いほう（🔊×）のままで、押しても変わらない -->
                  <span class="sound-toggle__state sound-toggle__state--on">🔊</span>

                  <span class="sound-toggle__state sound-toggle__state--off">
                    <span class="sound-toggle__speaker">🔊</span>
                    <span class="sound-toggle__muteMark">×</span>
                  </span>
                </span>

                <span class="sound-control__tooltip" aria-hidden="true">{{ soundEnabled ? 'サウンドをミュート' : 'サウンドをオン' }}</span>
              </button>

              <!-- 音量のスライダー（BGMも効果音も、まとめて変わる）

                   吹き出しは input の中には置けないので、外側の span でかこって、そこに出している
                   :style で渡している --volume-progress は、レールの「塗ったところ」の境目の位置
                   （サウンドトラックページの音量スライダーと同じ作りかた）

                   0%まで下げるとミュート、そこから上げるとミュート解除になる
                   （スピーカーのアイコンも、いっしょに切りかわる） -->
              <span class="sound-control__sliderWrap">
                <input
                  ref="soundVolumeSliderRef"
                  type="range"
                  class="sound-control__slider"
                  min="0"
                  max="100"
                  step="1"
                  :value="soundVolumePercent"
                  :style="{ '--volume-progress': soundVolumePercent + '%' }"
                  aria-label="音量"
                  :aria-valuetext="soundVolumePercent + 'パーセント'"
                  @input="changeSoundVolume" />

                <span class="sound-control__tooltip" aria-hidden="true">音量 {{ soundVolumePercent }}%</span>
              </span>
            </div>
          </div>

          <h1 class="title-card__name">{{ gameTitle }}</h1>
        </div>
      </div>

      <!-- ============================================================
           タイトル画面（ゲーム開始前）

           おやつ選択画面を開いているあいだは、こちらは出さない
           （そのため !gameStarted だけでなく
             !isSnackSelectionOpen も条件に入れている）
           ============================================================ -->
      <div v-else-if="!gameStarted && !isSnackSelectionOpen" key="title" class="title-screen">
        <div class="title-card">
          <!-- この画面のメインのボタン
               A画面と同じ理由で、HTMLではいちばん先に書いてある
               （Tabで「きょうのおやつを選ぶ → はじめの画面へ戻る → あそびかた → サウンド」と回れるようにするため。
                 見た目の位置はCSSの order でいちばん下のまま）

               ※ このボタンでは、まだゲームは始まらない
                 先に「きょうのおやつ」を選ぶ画面へ進む（openSnackSelection）
                 公園へ出発する startGame() は、その画面の
                 「このおやつで公園へ行く！」から呼ばれる -->
          <button ref="selectSnacksButtonRef" class="cmd cmd--start cmd--single" @click="openSnackSelection">きょうのおやつを選ぶ</button>

          <!-- 上のツールバー（A画面と同じ .title-card__tools を使う）
               左：はじめの画面（起動画面）へ戻る
               右：？ あそびかた ＋ サウンドON/OFF（「きょうのおやつを選ぶ」を押すと決定音が鳴るので、その前に消せるようにしておく） -->
          <div class="title-card__tools">
            <!-- はじめの画面へ戻る（左上の補助操作）
                 A画面の「♪ サウンドトラック」と同じ場所・同じ大きさで出るので、
                 A→B で切り替えても、左側は文字だけが入れかわって見える

                 ※ Enter/Space で「きょうのおやつを選ぶ」まで動いてしまわないのは、
                   handleTitleKeydown() が「ボタンにフォーカスがあるときは何もしない」
                   ようにしているため（ボタン側で止める必要はない） -->
            <button ref="backToBootButtonRef" type="button" class="title-card__back" @click="goBackToBoot">はじめの画面へ戻る</button>

            <!-- 右上のまとまり（？ あそびかた ＋ サウンドON/OFF）
                 2つを1つの入れものに入れて、いつも右はしに並んで出るようにしている
                 （とても細い画面で下の行へ回りこむときも、2ついっしょに右へ寄る） -->
            <div class="title-card__toolsRight">
              <!-- ？ あそびかた
                   押しても、B画面の上に説明書を開くだけ（openHowToPlay）。タイトルBGMも、選んだおやつもそのまま

                   スマホ幅では「あそびかた」の文字を隠して「?」だけにするので、
                   読み上げ用の名前は aria-label に持たせている
                   （サウンドON/OFFの「サウンド」の文字を隠すのと同じ考えかた） -->
              <button ref="howToPlayButtonRef" type="button" class="title-card__howto" aria-label="あそびかた" @click="openHowToPlay">
                <span class="title-card__howtoIcon" aria-hidden="true">?</span>
                <span class="title-card__howtoText">あそびかた</span>
              </button>

              <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

                   文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
                   何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

                   ・ミュートボタン … 音を出すか、出さないか
                   ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
                   0% ＝ ミュートなので、2つはいつも同じ状態になる
                   （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る） -->
              <div class="sound-control">
                <button
                  ref="soundToggleButtonRef"
                  type="button"
                  class="sound-toggle"
                  :aria-pressed="soundEnabled"
                  :aria-label="soundEnabled ? 'サウンドをミュート' : 'サウンドをオン'"
                  @click="toggleSound">
                  <!-- スピーカーは、ONでもOFFでも同じ絵文字のまま
                       OFFのときだけ、右どなりに「×」を出す（🔊×）。スピーカーには重ねない
                       ミュートの絵文字 🔇 のような「斜めの線」だけの表しかたはしていない
                       小さく出すと、音が出ない状態なのかどうかが、ぱっと見では分かりにくいため -->
                  <span class="sound-toggle__icon">
                    <!-- ON用（🔊）とOFF用（🔊×）を、同じマスに重ねて置いてある
                         いま使わないほうを見えなくするだけなので、
                         ボタンの幅はいつも長いほう（🔊×）のままで、押しても変わらない -->
                    <span class="sound-toggle__state sound-toggle__state--on">🔊</span>

                    <span class="sound-toggle__state sound-toggle__state--off">
                      <span class="sound-toggle__speaker">🔊</span>
                      <span class="sound-toggle__muteMark">×</span>
                    </span>
                  </span>

                  <span class="sound-control__tooltip" aria-hidden="true">{{ soundEnabled ? 'サウンドをミュート' : 'サウンドをオン' }}</span>
                </button>

                <!-- 音量のスライダー（BGMも効果音も、まとめて変わる）

                     吹き出しは input の中には置けないので、外側の span でかこって、そこに出している
                     :style で渡している --volume-progress は、レールの「塗ったところ」の境目の位置
                     （サウンドトラックページの音量スライダーと同じ作りかた）

                     0%まで下げるとミュート、そこから上げるとミュート解除になる
                     （スピーカーのアイコンも、いっしょに切りかわる） -->
                <span class="sound-control__sliderWrap">
                  <input
                    ref="soundVolumeSliderRef"
                    type="range"
                    class="sound-control__slider"
                    min="0"
                    max="100"
                    step="1"
                    :value="soundVolumePercent"
                    :style="{ '--volume-progress': soundVolumePercent + '%' }"
                    aria-label="音量"
                    :aria-valuetext="soundVolumePercent + 'パーセント'"
                    @input="changeSoundVolume" />

                  <span class="sound-control__tooltip" aria-hidden="true">音量 {{ soundVolumePercent }}%</span>
                </span>
              </div>
            </div>
          </div>

          <h1 class="title-card__name">{{ gameTitle }}</h1>

          <div class="title-card__rule">
            <p>冒険の舞台は9時から12時の公園です！</p>

            <p>
              どんな出会い、冒険があるかな。
              <br />
              たくさん探索してみよう！
            </p>
          </div>
        </div>
      </div>

      <!-- ============================================================
           おやつ選択画面（B画面とゲーム画面のあいだの準備画面）

           公園へ持っていくおやつを、6種類から2種類選んでもらう
           まだゲーム開始前なので、タイトルBGMは鳴ったまま
           （公園へ出発するのは「このおやつで公園へ行く！」を押したとき）

           ■ HTMLに書いた順番と、画面に見える順番がちがう

             HTMLの順番 … おやつ6つ → バッグ → 出発 → 上のツールバー
             見える順番 … 上のツールバー → 見出し → 説明 → おやつ6つ
                           → バッグ → 出発

             Tabキーは「HTMLに書いた順番」で動くので、
             最初のおやつから Tab を押すと
             「おやつ → 出発 → 戻る・サウンド」と自然に進む
             見た目の位置は、A画面・B画面と同じように
             CSSの order で並べ直している（.title-card--snack のところ）

           ■ おやつ6種類はベタ書きしない

             v-for で snacks 配列をそのまま並べている
             おやつを増やしたいときは snacks へ1件足すだけで、
             このHTMLはさわらなくてよい
           ============================================================ -->
      <div v-else-if="!gameStarted" key="snack-selection" class="title-screen">
        <!-- ref="snackSelectionRef" … キーボード操作のための目印

             この中にある押せるボタンを、画面のどこにあるかも見ながら探して、
             矢印キーで見た目どおりに行き来させる
             （getSnackSelectionFocusItems() と moveSnackSelectionByArrow() を見ること）

             おやつのカードだけでなくカード全体に付けているのは、
             矢印キーの行き先に「このおやつで公園へ行く！」
             「← ひとつ前の画面へ戻る」「サウンドON/OFF」も入るため -->
        <div ref="snackSelectionRef" class="title-card title-card--snack">
          <!-- おやつのカード6つ -->
          <div class="snack-list">
            <!-- カードまるごとが1つのボタン

                 中に小さな「選ぶ」ボタンを置くより、
                 カードのどこを押しても選べるほうが、
                 マウスでも指でもねらいやすい

                 :disabled … バッグがいっぱいで、まだ選んでいないおやつ
                 選んであるおやつは押せるままにして、
                 もう一度押せば解除できるようにしておく

                 :aria-pressed … 読み上げソフトに「押されている（選択中）」
                 かどうかを伝える（見た目で色が変わるのと同じ意味）

                 @mouseenter … マウスを乗せたカードへ、キーボードの居場所も移す
                 こうしておくと「マウスでチョコまで来て、そこから↓キー」と
                 続けたときに、その下のビスケットへ進む
                 （乗せただけでは選ばない。選ぶのは click と Enter / Space だけ）

                 @click の $event … キーボードで選んだかどうかを見分けるために渡す
                 （キーボードで2個目を選んだら「このおやつで公園へ行く！」へカーソルが移る） -->
            <button
              v-for="snack in snacks"
              :key="snack.id"
              type="button"
              class="snack-option"
              :class="{ 'snack-option--selected': isSnackSelected(snack.id) }"
              :disabled="isSnackBagFull && !isSnackSelected(snack.id)"
              :aria-pressed="isSnackSelected(snack.id)"
              @click="toggleSnackSelection(snack.id, $event)"
              @mouseenter="moveSnackSelectionToHovered">
              <!-- 絵文字と名前は、1行にならべる（「🍇 グミ」の形）

                   たてに積むより1行ぶん背が低くなるので、
                   おやつ6枚をならべてもカードが画面からはみ出しにくい
                   2列にして1枚が横に広くなったぶん、
                   横にならべても のびのび置ける
                   （おやつバッグの「🍇 グミ」とも同じ見た目になる） -->
              <span class="snack-option__head">
                <span class="snack-option__icon">{{ snack.icon }}</span>
                <span class="snack-option__name">{{ snack.name }}</span>
              </span>

              <span class="snack-option__text">{{ snack.description }}</span>

              <!-- おやつごとの回復量（次の実装でそのままゲームに使う数）

                   数字はこれからバランスを調整するので、
                   ここが変わってもカードの形がくずれないようにしている

                   3つを1つずつ span で包んであるのは、折り返しの都合
                   ひとつづきの文章にしてしまうと、カードの幅が足りないときに
                   「体力 +1」「8」のように数字の途中で切れてしまう
                   包んでおけば、切れるのはかならず項目のあいだになる
                   （区切りの「／」は、CSSで項目のうしろに付けている） -->
              <span class="snack-option__effect">
                <span class="snack-option__stat">体力 +{{ snack.energy }}</span>
                <span class="snack-option__stat">機嫌 +{{ snack.mood }}</span>
                <span class="snack-option__stat">{{ snack.minutes }}分</span>
              </span>

              <!-- ※ 「✓ 選択中」の札は置いていない

                   選んでいることは、カードの色と枠の変化だけで伝える
                   （.snack-option--selected … ふちが紺の二重線になり、背景が水色になる）

                   札を出すと、その置き場所のぶんだけカードが縦に大きくなる
                   下の「🎒 おやつバッグ」に、選んだおやつの名前が出るので、
                   何を選んでいるかはそちらでも確かめられる

                   読み上げソフトには、上の :aria-pressed が
                   「押されている（＝選択中）」と伝えている -->
            </button>
          </div>

          <!-- おやつバッグ（いま選んでいる2個が分かるところ） -->
          <div class="snack-bag">
            <p class="snack-bag__head">
              <span class="snack-bag__title">🎒 おやつバッグ</span>

              <!-- 「1 / 2」の数え方も maxSnackCount を見ている
                   （持っていける数を3つに変えても、ここは直さなくてよい） -->
              <span class="snack-bag__count">{{ selectedSnackIds.length }} / {{ maxSnackCount }}</span>
            </p>

            <!-- 選んだおやつの名前をならべる
                 名札（selectedSnackIds）ではなく、絵文字と名前を持っている
                 selectedSnacks のほうを使う -->
            <ul v-if="selectedSnacks.length > 0" class="snack-bag__list">
              <li v-for="snack in selectedSnacks" :key="snack.id" class="snack-bag__item">{{ snack.icon }} {{ snack.name }}</li>
            </ul>

            <p v-else class="snack-bag__empty">まだ選んでいません</p>
          </div>

          <!-- 公園へ出発するボタン（2種類そろうまでは押せない）

               :disabled … canStartWithSnacks が false のあいだ
               （0 / 2 と 1 / 2 では押せず、2 / 2 になって押せるようになる） -->
          <button type="button" class="cmd cmd--start cmd--single snack-go" :disabled="!canStartWithSnacks" @click="confirmSnacksAndStartGame">このおやつで公園へ行く！</button>

          <!-- 上のツールバー（A画面・B画面と同じ .title-card__tools を使う）
               左：タイトル画面（B画面）へ戻る
               右：サウンドON/OFF（まだゲーム開始前なので、A・B画面と同じはたらき）

               ※ HTMLでいちばん後ろに書いてあるのは、Tabの順番をそろえるため
                 見た目の位置は、CSSの order でカードのいちばん上に出る -->
          <div class="title-card__tools">
            <!-- B画面の「はじめの画面へ戻る」と、同じ場所・同じ大きさで出る
                 押しても選んだおやつは消さない（B画面 → もう一度おやつ選択で、
                 さっき選んだおやつがそのまま入っている） -->
            <button type="button" class="title-card__back" @click="closeSnackSelection">← ひとつ前の画面へ戻る</button>

            <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

                 文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
                 何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

                 ・ミュートボタン … 音を出すか、出さないか
                 ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
                 0% ＝ ミュートなので、2つはいつも同じ状態になる
                 （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る） -->
            <div class="sound-control">
              <button
                ref="soundToggleButtonRef"
                type="button"
                class="sound-toggle"
                :aria-pressed="soundEnabled"
                :aria-label="soundEnabled ? 'サウンドをミュート' : 'サウンドをオン'"
                @click="toggleSound">
                <!-- スピーカーは、ONでもOFFでも同じ絵文字のまま
                     OFFのときだけ、右どなりに「×」を出す（🔊×）。スピーカーには重ねない
                     ミュートの絵文字 🔇 のような「斜めの線」だけの表しかたはしていない
                     小さく出すと、音が出ない状態なのかどうかが、ぱっと見では分かりにくいため -->
                <span class="sound-toggle__icon">
                  <!-- ON用（🔊）とOFF用（🔊×）を、同じマスに重ねて置いてある
                       いま使わないほうを見えなくするだけなので、
                       ボタンの幅はいつも長いほう（🔊×）のままで、押しても変わらない -->
                  <span class="sound-toggle__state sound-toggle__state--on">🔊</span>

                  <span class="sound-toggle__state sound-toggle__state--off">
                    <span class="sound-toggle__speaker">🔊</span>
                    <span class="sound-toggle__muteMark">×</span>
                  </span>
                </span>

                <span class="sound-control__tooltip" aria-hidden="true">{{ soundEnabled ? 'サウンドをミュート' : 'サウンドをオン' }}</span>
              </button>

              <!-- 音量のスライダー（BGMも効果音も、まとめて変わる）

                   吹き出しは input の中には置けないので、外側の span でかこって、そこに出している
                   :style で渡している --volume-progress は、レールの「塗ったところ」の境目の位置
                   （サウンドトラックページの音量スライダーと同じ作りかた）

                   0%まで下げるとミュート、そこから上げるとミュート解除になる
                   （スピーカーのアイコンも、いっしょに切りかわる） -->
              <span class="sound-control__sliderWrap">
                <input
                  ref="soundVolumeSliderRef"
                  type="range"
                  class="sound-control__slider"
                  min="0"
                  max="100"
                  step="1"
                  :value="soundVolumePercent"
                  :style="{ '--volume-progress': soundVolumePercent + '%' }"
                  aria-label="音量"
                  :aria-valuetext="soundVolumePercent + 'パーセント'"
                  @input="changeSoundVolume" />

                <span class="sound-control__tooltip" aria-hidden="true">音量 {{ soundVolumePercent }}%</span>
              </span>
            </div>
          </div>

          <h1 class="snack-heading">🍪 きょうのおやつ</h1>

          <p class="snack-lead">
            公園へ持っていくおやつを{{ maxSnackCount }}つ選ぼう！
            <br />
            もう一度押すと、えらびなおせます。
          </p>
        </div>
      </div>

      <!-- ============================================================
           ゲーム画面（上部ステータス／中央イベント／下部コマンド）
           ============================================================ -->
      <!-- game-screen--secret-path … 秘密の小道のあいだだけ付ける
           スマホ幅で、上部ステータスを画面の上に固定しないようにするため（CSSの max-width: 700px を参照） -->
      <div v-else key="game" ref="gameScreenRef" class="game-screen" :class="{ 'game-screen--secret-path': currentEvent === 'secretPath' }">
        <!-- ==========================================================
             【上部】常時表示のステータスエリア
             ========================================================== -->
        <header class="status-area">
          <div class="status-area__head">
            <!-- タイトルと音ボタンを同じ行に並べる
                 新しい行を作らないので、上部ステータスの高さは変わらない -->
            <div class="status-area__titleRow">
              <span class="status-area__title">{{ gameTitle }}</span>

              <!-- サウンドのコントロール（ミュートボタン ＋ 音量スライダー）

                   文字（「サウンド」「ON」「OFF」）は出さず、アイコンとスライダーだけの小さなまとまりにしてある
                   何のボタンかは aria-label（読み上げ用）と、hover / focus のときだけ出る吹き出しで伝える

                   ・ミュートボタン … 音を出すか、出さないか
                   ・スライダー     … 音の大きさ（BGMも効果音も、まとめて同じだけ変わる）
                   0% ＝ ミュートなので、2つはいつも同じ状態になる
                   （0%まで下げるとアイコンが 🔊× になり、上げると音が戻る） -->
              <div class="sound-control sound-control--bar">
                <button
                  type="button"
                  class="sound-toggle sound-toggle--bar"
                  :aria-pressed="soundEnabled"
                  :aria-label="soundEnabled ? 'サウンドをミュート' : 'サウンドをオン'"
                  @click="toggleSound">
                  <!-- スピーカーは、ONでもOFFでも同じ絵文字のまま
                       OFFのときだけ、右どなりに「×」を出す（🔊×）。スピーカーには重ねない
                       ミュートの絵文字 🔇 のような「斜めの線」だけの表しかたはしていない
                       小さく出すと、音が出ない状態なのかどうかが、ぱっと見では分かりにくいため -->
                  <span class="sound-toggle__icon">
                    <!-- ON用（🔊）とOFF用（🔊×）を、同じマスに重ねて置いてある
                         いま使わないほうを見えなくするだけなので、
                         ボタンの幅はいつも長いほう（🔊×）のままで、押しても変わらない -->
                    <span class="sound-toggle__state sound-toggle__state--on">🔊</span>

                    <span class="sound-toggle__state sound-toggle__state--off">
                      <span class="sound-toggle__speaker">🔊</span>
                      <span class="sound-toggle__muteMark">×</span>
                    </span>
                  </span>

                  <span class="sound-control__tooltip" aria-hidden="true">{{ soundEnabled ? 'サウンドをミュート' : 'サウンドをオン' }}</span>
                </button>

                <!-- 音量のスライダー（BGMも効果音も、まとめて変わる）

                     吹き出しは input の中には置けないので、外側の span でかこって、そこに出している
                     :style で渡している --volume-progress は、レールの「塗ったところ」の境目の位置
                     （サウンドトラックページの音量スライダーと同じ作りかた）

                     0%まで下げるとミュート、そこから上げるとミュート解除になる
                     （スピーカーのアイコンも、いっしょに切りかわる） -->
                <span class="sound-control__sliderWrap">
                  <input
                    type="range"
                    class="sound-control__slider"
                    min="0"
                    max="100"
                    step="1"
                    :value="soundVolumePercent"
                    :style="{ '--volume-progress': soundVolumePercent + '%' }"
                    aria-label="音量"
                    :aria-valuetext="soundVolumePercent + 'パーセント'"
                    @input="changeSoundVolume" />

                  <span class="sound-control__tooltip" aria-hidden="true">音量 {{ soundVolumePercent }}%</span>
                </span>
              </div>
            </div>

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

          <!-- ゲージを「こうちゃん」と「親」の2つのまとまりに分ける
               見出し＋うすい背景だけでグループに見せているので、
               増える高さは見出し1行ぶんだけ（1280×720でも一画面に収まる） -->
          <div class="status-groups">
            <section class="status-group status-group--child">
              <p class="status-group__name">こうちゃん</p>

              <ul class="status-list">
                <li class="status-item" :class="{ 'status-item--danger': isChildEnergyDanger }">
                  <span class="status-item__label">
                    <span v-if="isChildEnergyDanger" class="status-item__alert">⚠</span>
                    体力
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
                  <span class="status-item__label">機嫌</span>
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
              </ul>
            </section>

            <section class="status-group status-group--parent">
              <p class="status-group__name">親</p>

              <ul class="status-list">
                <li class="status-item" :class="{ 'status-item--danger': isParentEnergyDanger }">
                  <span class="status-item__label">
                    <span v-if="isParentEnergyDanger" class="status-item__alert">⚠</span>
                    体力
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
                    余裕
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
            </section>
          </div>

          <!-- ゲージの目もりの説明

               並べる順番は、ゲージの上での位置と同じ「左 → 右」にそろえてある
               ・あぶないライン   … 20 のあたり（ゲージの左のほう）
               ・ぐずりだすライン … 71 のあたり（ゲージの右のほう）
               説明の並びとゲージの線の並びが同じなので、
               どちらの線の話をしているのか見つけやすい -->
          <p class="gauge-legend">
            <span class="gauge-legend__item">
              <span class="gauge-legend__mark gauge-legend__mark--danger"></span>
              あぶないライン
            </span>

            <span class="gauge-legend__item">
              <span class="gauge-legend__mark gauge-legend__mark--fuss"></span>
              ぐずりだすライン
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

                <!-- あいさつ文は3段階（着いたばかり／前半のおかえり／午前後半）
                     どの文にするかは、上の parkEntranceText で決めている -->
                <p class="place-card__text">{{ parkEntranceText }}</p>
              </article>

              <!-- 秘密の場所は「ポイント20以上」かつ「見つけたもの3種類以上」で解放 -->
              <article v-if="canEnterSecretSpot" class="place-card place-card--secret">
                <!-- 広場をもう見つけたかどうかで文言を切り替える
                     まだ見つけていない → はじめて見つけたときの案内（この先は秘密の小道）
                     もう見つけた → また行ってみようという案内（そのまま広場へ入る）
                     ※ 探検済み（isVisited）ではなく hasDiscoveredSecretSpot を見る
                       広場を見つけて何もせずに出たときも、もう小道はくり返さないため -->
                <template v-if="hasDiscoveredSecretSpot">
                  <h2 class="place-card__title">こもれびの広場</h2>

                  <p class="place-card__text">こうちゃんは、木々のあいだの細い道を覚えているようです。また行ってみよう！</p>
                </template>

                <template v-else>
                  <h2 class="place-card__title">細い道を見つけた！</h2>

                  <p class="place-card__text">木々のあいだに、細い道があるのを見つけました。この先には何があるのかな？行ってみよう！</p>
                </template>
              </article>
            </section>

            <!-- command--pointer-paused … 公園入口へ戻ってきた直後、マウスを動かすまでマウスで選べなくする
                                           （最後にいた場所に合わせたカーソルが、@mouseenter で上書きされないようにする） -->
            <nav class="command" :class="{ 'command--pointer-paused': isCommandPointerPaused }">
              <p class="command__label">どこへ行く？</p>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="goToPlace('slide')" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                <span class="cmd__text">すべり台へ行く</span>
                <span v-if="isVisited('slide')" class="cmd__badge">探検済み</span>
              </button>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 1 }" @click="goToPlace('sandbox')" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                <span class="cmd__text">砂場へ行く</span>
                <span v-if="isVisited('sandbox')" class="cmd__badge">探検済み</span>
              </button>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 2 }" @click="goToPlace('acornArea')" @mouseenter="selectedCommandIndex = 2" @focus="selectedCommandIndex = 2">
                <span class="cmd__text">どんぐりの木へ行く</span>
                <span v-if="isVisited('acornArea')" class="cmd__badge">探検済み</span>
              </button>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 3 }" @click="goToPlace('pond')" @mouseenter="selectedCommandIndex = 3" @focus="selectedCommandIndex = 3">
                <span class="cmd__text">池へ行く</span>
                <span v-if="isVisited('pond')" class="cmd__badge">探検済み</span>
              </button>

              <button class="cmd" :class="{ 'cmd--selected': selectedCommandIndex === 4 }" @click="goToPlace('grassArea')" @mouseenter="selectedCommandIndex = 4" @focus="selectedCommandIndex = 4">
                <span class="cmd__text">芝生広場へ行く</span>
                <span v-if="isVisited('grassArea')" class="cmd__badge">探検済み</span>
              </button>

              <button
                v-if="canEnterSecretSpot"
                class="cmd cmd--secret"
                :class="{ 'cmd--selected': selectedCommandIndex === 5 }"
                @click="goToSecretArea"
                @mouseenter="selectedCommandIndex = 5"
                @focus="selectedCommandIndex = 5">
                <span class="cmd__text">細い道の先へ行く</span>
                <span v-if="isVisited('secretSpot')" class="cmd__badge">探検済み</span>
              </button>

              <!-- 押しても、すぐにはゴールへ向かわない（「公園の出口へ向かう？」の確認ダイアログが開く） -->
              <button class="cmd cmd--goal" :class="{ 'cmd--selected': selectedCommandIndex === goalCommandIndex }" @click="openGoalConfirm" @mouseenter="selectedCommandIndex = goalCommandIndex" @focus="selectedCommandIndex = goalCommandIndex">
                <span class="cmd__text">公園の出口へ向かう（ゴール）</span>
              </button>
            </nav>
          </div>

          <!-- すべり台 -->
          <div v-else-if="currentEvent === 'slide'" class="scene" key="slide">
            <section class="stage">
              <article class="place-card">
                <h2 class="place-card__title">すべり台</h2>

                <p class="place-card__text">
                  すべり台を見つけると、「すべるー！」とおおはしゃぎ。
                  <br />
                  小さな手で手すりをぎゅっとつかんで、とてとて階段をのぼりはじめました。
                </p>
              </article>

              <!-- 結果が出たあと -->
              <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <!-- ※ 小さな「いやいや発生！」の帯は置かない
                       発生した瞬間は、画面いっぱいのオーバーレイ（.tantrum-alert）で知らせているので、
                       ここにも出すと同じことを2回言うことになる
                       カードが軽く左右に揺れる演出（.result-card--tantrum）と、
                       いちばん下のいやいや文（.tantrum-line）はそのまま残している -->

                  <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
                  <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                    <span class="found-flash__label">★ アイテム発見！</span>
                    <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
                  </p>

                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <!-- サブメニュー「☕ ひとやすみ」

                     休憩とおやつは、その場所ならではの遊びではなく
                     「どこでも同じ、親子の状態を整える行動」なので、
                     メインコマンドにまぜず、こちらにまとめている

                     出るのは「休憩・おやつ」を選んだときだけ
                     （isCareMenuVisible が、通常の場所か・結果カードが出ていないか・
                       開いているか の3つをまとめて見てくれる）

                     :css="!resultMessage"
                     休憩する・おやつ・遊びを選んで結果カードが出るときは、閉じるアニメーションをせずに すぐ消す
                     （フェードのあいだ枠が場所を取ったままだと、先に縮んだ「どうする？」が
                       消え終わった瞬間にガクッと下へずれて、2回に分けてパタパタ動いて見えるため）
                     「休憩・おやつ」をもう一度押す・Escape で閉じるときは、今までどおりフェードする -->
                <Transition name="care-menu" :css="!resultMessage">
                  <aside v-if="isCareMenuVisible" class="care-menu">
                    <!-- おやつバッグ（「おやつをあげる ＞」を押したあと）
                         ☕ ひとやすみ の枠の中身だけを入れかえて、同じ場所に出す
                         並べるのはバッグに残っているおやつ（selectedSnacks）だけで、
                         食べたおやつはバッグから消えるので、ここからも消える -->
                    <template v-if="isSnackMenuVisible">
                      <p class="care-menu__label">🎒 どのおやつにする？</p>

                      <button
                        v-for="(snack, index) in selectedSnacks"
                        :key="snack.id"
                        class="care-menu__item snack-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === index }"
                        @click="eatSnackFromBag(snack.id)"
                        @mouseenter="selectedSnackMenuIndex = index"
                        @focus="selectedSnackMenuIndex = index">
                        <span class="snack-menu__name">{{ snack.icon }} {{ snack.name }}</span>
                        <span class="care-menu__badge snack-menu__effects">
                          <span>体力 +{{ snack.energy }}</span>
                          <span>機嫌 +{{ snack.mood }}</span>
                          <span>{{ snack.minutes }}分</span>
                        </span>
                      </button>

                      <button
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === snackMenuBackIndex }"
                        @click="closeSnackMenu"
                        @mouseenter="selectedSnackMenuIndex = snackMenuBackIndex"
                        @focus="selectedSnackMenuIndex = snackMenuBackIndex">
                        <span class="care-menu__text">← もどる</span>
                      </button>
                    </template>

                    <template v-else>
                      <p class="care-menu__label">☕ ひとやすみ</p>

                      <button class="care-menu__item" :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 0 }" @click="takeCommonBreak" @mouseenter="selectedCareCommandIndex = 0" @focus="selectedCareCommandIndex = 0">
                        <span class="care-menu__text">休憩する</span>
                      </button>

                      <!-- バッグにおやつが残っているときだけ出す
                           押すとおやつバッグが開く（ここではまだ食べない）
                           ※ バッグは、いやいやタイムで使うおやつと同じ selectedSnackIds -->
                      <button
                        v-if="snackLeft > 0"
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 1 }"
                        @click="openSnackMenu('exploring')"
                        @mouseenter="selectedCareCommandIndex = 1"
                        @focus="selectedCareCommandIndex = 1">
                        <span class="care-menu__text">おやつをあげる ＞</span>
                        <span class="care-menu__badge">残り{{ snackLeft }}個</span>
                      </button>

                      <p v-else class="care-menu__note">おやつは、もうぜんぶ食べてしまいました…</p>
                    </template>
                  </aside>
                </Transition>

                <!-- メインコマンド（今までどおり、枠の中に選択肢を縦に並べる）
                     command-box--pointer-paused … 休憩・おやつの「← もどる」の直後、マウスを動かすまでマウスで押せなくする
                                                  （isCommandPointerPaused を参照） -->
                <nav class="command-box" :class="{ 'command-box--pointer-paused': isCommandPointerPaused }">
                  <!-- 結果がまだ無いとき -->
                  <template v-if="!resultMessage">
                    <p class="command-box__label">どうする？</p>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="playSlide" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">一緒にすべる</span>
                    </button>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="watchSlide" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                      <span class="command-box__text">下で見守る</span>
                    </button>

                    <!-- ここから下は「どこでも同じコマンド」という区切り

                         上の2つ … その場所ならではの遊び（すべる・見守る など）
                         下の2つ … 休憩・おやつ／← 場所選びにもどる（どの場所でも同じ）

                         同じ枠の中にならんでいても種類がちがうので、
                         あいだに細い線と小さな見出しを入れて、
                         ひとめで「ここからは別のなかま」と分かるようにする

                         ※ ボタンではなくただの見出しなので、
                           ↑↓キーの番号（selectedCommandIndex）には数えない -->
                    <p class="command-box__divider">そのほか</p>

                    <!-- サブメニューを開け閉めするコマンド
                         aria-expanded は「いま開いているか」を読み上げソフトに伝えるための印 -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === careMenuCommandIndex }"
                      :aria-expanded="isCareMenuVisible"
                      @click="toggleCareMenu"
                      @mouseenter="selectedCommandIndex = careMenuCommandIndex"
                      @focus="selectedCommandIndex = careMenuCommandIndex">
                      <span class="command-box__text">休憩・おやつ</span>
                    </button>

                    <!-- 「← 場所選びにもどる」… この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る
                         （サブメニューの「← もどる」＝1つ前のメニューへ戻る、とは役割がちがうので、戻り先まで書いてある）

                         よく使うので、サブメニューには入れず、ここに残してある

                         よく使うコマンドなので、見た目も上の行動と
                         まったく同じ（同じ文字の大きさ・同じ色）にそろえてある -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === leavePlaceCommandIndex }"
                      @click="goToNextPlace"
                      @mouseenter="selectedCommandIndex = leavePlaceCommandIndex"
                      @focus="selectedCommandIndex = leavePlaceCommandIndex">
                      <span class="command-box__text">← 場所選びにもどる</span>
                    </button>
                  </template>

                  <!-- 結果が出たあと（コマンドは1つだけ）
                       ・休憩・おやつの結果 … 「← もどる」で、この場所の「どうする？」へ戻る（場所は離れない）
                       ・遊びの結果         … 「次の場所を選ぶ」で、公園入口の「どこへ行く？」へ進む
                       ※ 休憩・おやつで12:00を過ぎたときは「次の場所を選ぶ」になる（isCareResultBackVisible を参照） -->
                  <template v-else>
                    <button
                      v-if="isCareResultBackVisible"
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }"
                      @click="backToPlaceFromCareResult"
                      @mouseenter="selectedCommandIndex = 0"
                      @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">← もどる</span>
                    </button>

                    <button v-else class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                    </button>
                  </template>
                </nav>
              </div>
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

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <!-- ※ 小さな「いやいや発生！」の帯は置かない
                       発生した瞬間は、画面いっぱいのオーバーレイ（.tantrum-alert）で知らせているので、
                       ここにも出すと同じことを2回言うことになる
                       カードが軽く左右に揺れる演出（.result-card--tantrum）と、
                       いちばん下のいやいや文（.tantrum-line）はそのまま残している -->

                  <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
                  <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                    <span class="found-flash__label">★ アイテム発見！</span>
                    <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
                  </p>

                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <!-- サブメニュー「☕ ひとやすみ」

                     休憩とおやつは、その場所ならではの遊びではなく
                     「どこでも同じ、親子の状態を整える行動」なので、
                     メインコマンドにまぜず、こちらにまとめている

                     出るのは「休憩・おやつ」を選んだときだけ
                     （isCareMenuVisible が、通常の場所か・結果カードが出ていないか・
                       開いているか の3つをまとめて見てくれる）

                     :css="!resultMessage"
                     休憩する・おやつ・遊びを選んで結果カードが出るときは、閉じるアニメーションをせずに すぐ消す
                     （フェードのあいだ枠が場所を取ったままだと、先に縮んだ「どうする？」が
                       消え終わった瞬間にガクッと下へずれて、2回に分けてパタパタ動いて見えるため）
                     「休憩・おやつ」をもう一度押す・Escape で閉じるときは、今までどおりフェードする -->
                <Transition name="care-menu" :css="!resultMessage">
                  <aside v-if="isCareMenuVisible" class="care-menu">
                    <!-- おやつバッグ（「おやつをあげる ＞」を押したあと）
                         ☕ ひとやすみ の枠の中身だけを入れかえて、同じ場所に出す
                         並べるのはバッグに残っているおやつ（selectedSnacks）だけで、
                         食べたおやつはバッグから消えるので、ここからも消える -->
                    <template v-if="isSnackMenuVisible">
                      <p class="care-menu__label">🎒 どのおやつにする？</p>

                      <button
                        v-for="(snack, index) in selectedSnacks"
                        :key="snack.id"
                        class="care-menu__item snack-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === index }"
                        @click="eatSnackFromBag(snack.id)"
                        @mouseenter="selectedSnackMenuIndex = index"
                        @focus="selectedSnackMenuIndex = index">
                        <span class="snack-menu__name">{{ snack.icon }} {{ snack.name }}</span>
                        <span class="care-menu__badge snack-menu__effects">
                          <span>体力 +{{ snack.energy }}</span>
                          <span>機嫌 +{{ snack.mood }}</span>
                          <span>{{ snack.minutes }}分</span>
                        </span>
                      </button>

                      <button
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === snackMenuBackIndex }"
                        @click="closeSnackMenu"
                        @mouseenter="selectedSnackMenuIndex = snackMenuBackIndex"
                        @focus="selectedSnackMenuIndex = snackMenuBackIndex">
                        <span class="care-menu__text">← もどる</span>
                      </button>
                    </template>

                    <template v-else>
                      <p class="care-menu__label">☕ ひとやすみ</p>

                      <button class="care-menu__item" :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 0 }" @click="takeCommonBreak" @mouseenter="selectedCareCommandIndex = 0" @focus="selectedCareCommandIndex = 0">
                        <span class="care-menu__text">休憩する</span>
                      </button>

                      <!-- バッグにおやつが残っているときだけ出す
                           押すとおやつバッグが開く（ここではまだ食べない）
                           ※ バッグは、いやいやタイムで使うおやつと同じ selectedSnackIds -->
                      <button
                        v-if="snackLeft > 0"
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 1 }"
                        @click="openSnackMenu('exploring')"
                        @mouseenter="selectedCareCommandIndex = 1"
                        @focus="selectedCareCommandIndex = 1">
                        <span class="care-menu__text">おやつをあげる ＞</span>
                        <span class="care-menu__badge">残り{{ snackLeft }}個</span>
                      </button>

                      <p v-else class="care-menu__note">おやつは、もうぜんぶ食べてしまいました…</p>
                    </template>
                  </aside>
                </Transition>

                <!-- メインコマンド（今までどおり、枠の中に選択肢を縦に並べる）
                     command-box--pointer-paused … 休憩・おやつの「← もどる」の直後、マウスを動かすまでマウスで押せなくする
                                                  （isCommandPointerPaused を参照） -->
                <nav class="command-box" :class="{ 'command-box--pointer-paused': isCommandPointerPaused }">
                  <!-- 結果がまだ無いとき -->
                  <template v-if="!resultMessage">
                    <p class="command-box__label">どうする？</p>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="playSandbox" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">一緒に大きな山を作る</span>
                    </button>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="buildSandTunnel" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                      <span class="command-box__text">砂のトンネルを作る</span>
                    </button>

                    <!-- ここから下は「どこでも同じコマンド」という区切り

                         上の2つ … その場所ならではの遊び（すべる・見守る など）
                         下の2つ … 休憩・おやつ／← 場所選びにもどる（どの場所でも同じ）

                         同じ枠の中にならんでいても種類がちがうので、
                         あいだに細い線と小さな見出しを入れて、
                         ひとめで「ここからは別のなかま」と分かるようにする

                         ※ ボタンではなくただの見出しなので、
                           ↑↓キーの番号（selectedCommandIndex）には数えない -->
                    <p class="command-box__divider">そのほか</p>

                    <!-- サブメニューを開け閉めするコマンド
                         aria-expanded は「いま開いているか」を読み上げソフトに伝えるための印 -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === careMenuCommandIndex }"
                      :aria-expanded="isCareMenuVisible"
                      @click="toggleCareMenu"
                      @mouseenter="selectedCommandIndex = careMenuCommandIndex"
                      @focus="selectedCommandIndex = careMenuCommandIndex">
                      <span class="command-box__text">休憩・おやつ</span>
                    </button>

                    <!-- 「← 場所選びにもどる」… この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る
                         （サブメニューの「← もどる」＝1つ前のメニューへ戻る、とは役割がちがうので、戻り先まで書いてある）

                         よく使うので、サブメニューには入れず、ここに残してある

                         よく使うコマンドなので、見た目も上の行動と
                         まったく同じ（同じ文字の大きさ・同じ色）にそろえてある -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === leavePlaceCommandIndex }"
                      @click="goToNextPlace"
                      @mouseenter="selectedCommandIndex = leavePlaceCommandIndex"
                      @focus="selectedCommandIndex = leavePlaceCommandIndex">
                      <span class="command-box__text">← 場所選びにもどる</span>
                    </button>
                  </template>

                  <!-- 結果が出たあと（コマンドは1つだけ）
                       ・休憩・おやつの結果 … 「← もどる」で、この場所の「どうする？」へ戻る（場所は離れない）
                       ・遊びの結果         … 「次の場所を選ぶ」で、公園入口の「どこへ行く？」へ進む
                       ※ 休憩・おやつで12:00を過ぎたときは「次の場所を選ぶ」になる（isCareResultBackVisible を参照） -->
                  <template v-else>
                    <button
                      v-if="isCareResultBackVisible"
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }"
                      @click="backToPlaceFromCareResult"
                      @mouseenter="selectedCommandIndex = 0"
                      @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">← もどる</span>
                    </button>

                    <button v-else class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                    </button>
                  </template>
                </nav>
              </div>
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

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <!-- ※ 小さな「いやいや発生！」の帯は置かない
                       発生した瞬間は、画面いっぱいのオーバーレイ（.tantrum-alert）で知らせているので、
                       ここにも出すと同じことを2回言うことになる
                       カードが軽く左右に揺れる演出（.result-card--tantrum）と、
                       いちばん下のいやいや文（.tantrum-line）はそのまま残している -->

                  <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
                  <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                    <span class="found-flash__label">★ アイテム発見！</span>
                    <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
                  </p>

                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <!-- サブメニュー「☕ ひとやすみ」

                     休憩とおやつは、その場所ならではの遊びではなく
                     「どこでも同じ、親子の状態を整える行動」なので、
                     メインコマンドにまぜず、こちらにまとめている

                     出るのは「休憩・おやつ」を選んだときだけ
                     （isCareMenuVisible が、通常の場所か・結果カードが出ていないか・
                       開いているか の3つをまとめて見てくれる）

                     :css="!resultMessage"
                     休憩する・おやつ・遊びを選んで結果カードが出るときは、閉じるアニメーションをせずに すぐ消す
                     （フェードのあいだ枠が場所を取ったままだと、先に縮んだ「どうする？」が
                       消え終わった瞬間にガクッと下へずれて、2回に分けてパタパタ動いて見えるため）
                     「休憩・おやつ」をもう一度押す・Escape で閉じるときは、今までどおりフェードする -->
                <Transition name="care-menu" :css="!resultMessage">
                  <aside v-if="isCareMenuVisible" class="care-menu">
                    <!-- おやつバッグ（「おやつをあげる ＞」を押したあと）
                         ☕ ひとやすみ の枠の中身だけを入れかえて、同じ場所に出す
                         並べるのはバッグに残っているおやつ（selectedSnacks）だけで、
                         食べたおやつはバッグから消えるので、ここからも消える -->
                    <template v-if="isSnackMenuVisible">
                      <p class="care-menu__label">🎒 どのおやつにする？</p>

                      <button
                        v-for="(snack, index) in selectedSnacks"
                        :key="snack.id"
                        class="care-menu__item snack-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === index }"
                        @click="eatSnackFromBag(snack.id)"
                        @mouseenter="selectedSnackMenuIndex = index"
                        @focus="selectedSnackMenuIndex = index">
                        <span class="snack-menu__name">{{ snack.icon }} {{ snack.name }}</span>
                        <span class="care-menu__badge snack-menu__effects">
                          <span>体力 +{{ snack.energy }}</span>
                          <span>機嫌 +{{ snack.mood }}</span>
                          <span>{{ snack.minutes }}分</span>
                        </span>
                      </button>

                      <button
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === snackMenuBackIndex }"
                        @click="closeSnackMenu"
                        @mouseenter="selectedSnackMenuIndex = snackMenuBackIndex"
                        @focus="selectedSnackMenuIndex = snackMenuBackIndex">
                        <span class="care-menu__text">← もどる</span>
                      </button>
                    </template>

                    <template v-else>
                      <p class="care-menu__label">☕ ひとやすみ</p>

                      <button class="care-menu__item" :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 0 }" @click="takeCommonBreak" @mouseenter="selectedCareCommandIndex = 0" @focus="selectedCareCommandIndex = 0">
                        <span class="care-menu__text">休憩する</span>
                      </button>

                      <!-- バッグにおやつが残っているときだけ出す
                           押すとおやつバッグが開く（ここではまだ食べない）
                           ※ バッグは、いやいやタイムで使うおやつと同じ selectedSnackIds -->
                      <button
                        v-if="snackLeft > 0"
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 1 }"
                        @click="openSnackMenu('exploring')"
                        @mouseenter="selectedCareCommandIndex = 1"
                        @focus="selectedCareCommandIndex = 1">
                        <span class="care-menu__text">おやつをあげる ＞</span>
                        <span class="care-menu__badge">残り{{ snackLeft }}個</span>
                      </button>

                      <p v-else class="care-menu__note">おやつは、もうぜんぶ食べてしまいました…</p>
                    </template>
                  </aside>
                </Transition>

                <!-- メインコマンド（今までどおり、枠の中に選択肢を縦に並べる）
                     command-box--pointer-paused … 休憩・おやつの「← もどる」の直後、マウスを動かすまでマウスで押せなくする
                                                  （isCommandPointerPaused を参照） -->
                <nav class="command-box" :class="{ 'command-box--pointer-paused': isCommandPointerPaused }">
                  <!-- 結果がまだ無いとき -->
                  <template v-if="!resultMessage">
                    <p class="command-box__label">どうする？</p>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="collectAcorns" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">一緒にどんぐりを拾う</span>
                    </button>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="rollAcorns" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                      <span class="command-box__text">どんぐりをころがして遊ぶ</span>
                    </button>

                    <!-- ここから下は「どこでも同じコマンド」という区切り

                         上の2つ … その場所ならではの遊び（すべる・見守る など）
                         下の2つ … 休憩・おやつ／← 場所選びにもどる（どの場所でも同じ）

                         同じ枠の中にならんでいても種類がちがうので、
                         あいだに細い線と小さな見出しを入れて、
                         ひとめで「ここからは別のなかま」と分かるようにする

                         ※ ボタンではなくただの見出しなので、
                           ↑↓キーの番号（selectedCommandIndex）には数えない -->
                    <p class="command-box__divider">そのほか</p>

                    <!-- サブメニューを開け閉めするコマンド
                         aria-expanded は「いま開いているか」を読み上げソフトに伝えるための印 -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === careMenuCommandIndex }"
                      :aria-expanded="isCareMenuVisible"
                      @click="toggleCareMenu"
                      @mouseenter="selectedCommandIndex = careMenuCommandIndex"
                      @focus="selectedCommandIndex = careMenuCommandIndex">
                      <span class="command-box__text">休憩・おやつ</span>
                    </button>

                    <!-- 「← 場所選びにもどる」… この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る
                         （サブメニューの「← もどる」＝1つ前のメニューへ戻る、とは役割がちがうので、戻り先まで書いてある）

                         よく使うので、サブメニューには入れず、ここに残してある

                         よく使うコマンドなので、見た目も上の行動と
                         まったく同じ（同じ文字の大きさ・同じ色）にそろえてある -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === leavePlaceCommandIndex }"
                      @click="goToNextPlace"
                      @mouseenter="selectedCommandIndex = leavePlaceCommandIndex"
                      @focus="selectedCommandIndex = leavePlaceCommandIndex">
                      <span class="command-box__text">← 場所選びにもどる</span>
                    </button>
                  </template>

                  <!-- 結果が出たあと（コマンドは1つだけ）
                       ・休憩・おやつの結果 … 「← もどる」で、この場所の「どうする？」へ戻る（場所は離れない）
                       ・遊びの結果         … 「次の場所を選ぶ」で、公園入口の「どこへ行く？」へ進む
                       ※ 休憩・おやつで12:00を過ぎたときは「次の場所を選ぶ」になる（isCareResultBackVisible を参照） -->
                  <template v-else>
                    <button
                      v-if="isCareResultBackVisible"
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }"
                      @click="backToPlaceFromCareResult"
                      @mouseenter="selectedCommandIndex = 0"
                      @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">← もどる</span>
                    </button>

                    <button v-else class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                    </button>
                  </template>
                </nav>
              </div>
            </section>
          </div>

          <!-- 池 -->
          <div v-else-if="currentEvent === 'pond'" class="scene" key="pond">
            <section class="stage">
              <article class="place-card">
                <h2 class="place-card__title">池</h2>

                <p class="place-card__text">池には白鳥が泳ぎ、コイもたくさん集まっています。こうちゃんは指をさして大はしゃぎです。</p>
              </article>

              <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <!-- ※ 小さな「いやいや発生！」の帯は置かない
                       発生した瞬間は、画面いっぱいのオーバーレイ（.tantrum-alert）で知らせているので、
                       ここにも出すと同じことを2回言うことになる
                       カードが軽く左右に揺れる演出（.result-card--tantrum）と、
                       いちばん下のいやいや文（.tantrum-line）はそのまま残している -->

                  <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
                  <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                    <span class="found-flash__label">★ アイテム発見！</span>
                    <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
                  </p>

                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <!-- サブメニュー「☕ ひとやすみ」

                     休憩とおやつは、その場所ならではの遊びではなく
                     「どこでも同じ、親子の状態を整える行動」なので、
                     メインコマンドにまぜず、こちらにまとめている

                     出るのは「休憩・おやつ」を選んだときだけ
                     （isCareMenuVisible が、通常の場所か・結果カードが出ていないか・
                       開いているか の3つをまとめて見てくれる）

                     :css="!resultMessage"
                     休憩する・おやつ・遊びを選んで結果カードが出るときは、閉じるアニメーションをせずに すぐ消す
                     （フェードのあいだ枠が場所を取ったままだと、先に縮んだ「どうする？」が
                       消え終わった瞬間にガクッと下へずれて、2回に分けてパタパタ動いて見えるため）
                     「休憩・おやつ」をもう一度押す・Escape で閉じるときは、今までどおりフェードする -->
                <Transition name="care-menu" :css="!resultMessage">
                  <aside v-if="isCareMenuVisible" class="care-menu">
                    <!-- おやつバッグ（「おやつをあげる ＞」を押したあと）
                         ☕ ひとやすみ の枠の中身だけを入れかえて、同じ場所に出す
                         並べるのはバッグに残っているおやつ（selectedSnacks）だけで、
                         食べたおやつはバッグから消えるので、ここからも消える -->
                    <template v-if="isSnackMenuVisible">
                      <p class="care-menu__label">🎒 どのおやつにする？</p>

                      <button
                        v-for="(snack, index) in selectedSnacks"
                        :key="snack.id"
                        class="care-menu__item snack-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === index }"
                        @click="eatSnackFromBag(snack.id)"
                        @mouseenter="selectedSnackMenuIndex = index"
                        @focus="selectedSnackMenuIndex = index">
                        <span class="snack-menu__name">{{ snack.icon }} {{ snack.name }}</span>
                        <span class="care-menu__badge snack-menu__effects">
                          <span>体力 +{{ snack.energy }}</span>
                          <span>機嫌 +{{ snack.mood }}</span>
                          <span>{{ snack.minutes }}分</span>
                        </span>
                      </button>

                      <button
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === snackMenuBackIndex }"
                        @click="closeSnackMenu"
                        @mouseenter="selectedSnackMenuIndex = snackMenuBackIndex"
                        @focus="selectedSnackMenuIndex = snackMenuBackIndex">
                        <span class="care-menu__text">← もどる</span>
                      </button>
                    </template>

                    <template v-else>
                      <p class="care-menu__label">☕ ひとやすみ</p>

                      <button class="care-menu__item" :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 0 }" @click="takeCommonBreak" @mouseenter="selectedCareCommandIndex = 0" @focus="selectedCareCommandIndex = 0">
                        <span class="care-menu__text">休憩する</span>
                      </button>

                      <!-- バッグにおやつが残っているときだけ出す
                           押すとおやつバッグが開く（ここではまだ食べない）
                           ※ バッグは、いやいやタイムで使うおやつと同じ selectedSnackIds -->
                      <button
                        v-if="snackLeft > 0"
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 1 }"
                        @click="openSnackMenu('exploring')"
                        @mouseenter="selectedCareCommandIndex = 1"
                        @focus="selectedCareCommandIndex = 1">
                        <span class="care-menu__text">おやつをあげる ＞</span>
                        <span class="care-menu__badge">残り{{ snackLeft }}個</span>
                      </button>

                      <p v-else class="care-menu__note">おやつは、もうぜんぶ食べてしまいました…</p>
                    </template>
                  </aside>
                </Transition>

                <!-- メインコマンド（今までどおり、枠の中に選択肢を縦に並べる）
                     command-box--pointer-paused … 休憩・おやつの「← もどる」の直後、マウスを動かすまでマウスで押せなくする
                                                  （isCommandPointerPaused を参照） -->
                <nav class="command-box" :class="{ 'command-box--pointer-paused': isCommandPointerPaused }">
                  <!-- 結果がまだ無いとき -->
                  <template v-if="!resultMessage">
                    <p class="command-box__label">どうする？</p>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="watchSwansClose" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">白鳥を近くで見る</span>
                    </button>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="feedKoi" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                      <span class="command-box__text">コイに餌をあげる</span>
                    </button>

                    <!-- ここから下は「どこでも同じコマンド」という区切り

                         上の2つ … その場所ならではの遊び（すべる・見守る など）
                         下の2つ … 休憩・おやつ／← 場所選びにもどる（どの場所でも同じ）

                         同じ枠の中にならんでいても種類がちがうので、
                         あいだに細い線と小さな見出しを入れて、
                         ひとめで「ここからは別のなかま」と分かるようにする

                         ※ ボタンではなくただの見出しなので、
                           ↑↓キーの番号（selectedCommandIndex）には数えない -->
                    <p class="command-box__divider">そのほか</p>

                    <!-- サブメニューを開け閉めするコマンド
                         aria-expanded は「いま開いているか」を読み上げソフトに伝えるための印 -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === careMenuCommandIndex }"
                      :aria-expanded="isCareMenuVisible"
                      @click="toggleCareMenu"
                      @mouseenter="selectedCommandIndex = careMenuCommandIndex"
                      @focus="selectedCommandIndex = careMenuCommandIndex">
                      <span class="command-box__text">休憩・おやつ</span>
                    </button>

                    <!-- 「← 場所選びにもどる」… この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る
                         （サブメニューの「← もどる」＝1つ前のメニューへ戻る、とは役割がちがうので、戻り先まで書いてある）

                         よく使うので、サブメニューには入れず、ここに残してある

                         よく使うコマンドなので、見た目も上の行動と
                         まったく同じ（同じ文字の大きさ・同じ色）にそろえてある -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === leavePlaceCommandIndex }"
                      @click="goToNextPlace"
                      @mouseenter="selectedCommandIndex = leavePlaceCommandIndex"
                      @focus="selectedCommandIndex = leavePlaceCommandIndex">
                      <span class="command-box__text">← 場所選びにもどる</span>
                    </button>
                  </template>

                  <!-- 結果が出たあと（コマンドは1つだけ）
                       ・休憩・おやつの結果 … 「← もどる」で、この場所の「どうする？」へ戻る（場所は離れない）
                       ・遊びの結果         … 「次の場所を選ぶ」で、公園入口の「どこへ行く？」へ進む
                       ※ 休憩・おやつで12:00を過ぎたときは「次の場所を選ぶ」になる（isCareResultBackVisible を参照） -->
                  <template v-else>
                    <button
                      v-if="isCareResultBackVisible"
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }"
                      @click="backToPlaceFromCareResult"
                      @mouseenter="selectedCommandIndex = 0"
                      @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">← もどる</span>
                    </button>

                    <button v-else class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                    </button>
                  </template>
                </nav>
              </div>
            </section>
          </div>

          <!-- 芝生広場 -->
          <div v-else-if="currentEvent === 'grassArea'" class="scene" key="grassArea">
            <section class="stage">
              <article class="place-card">
                <h2 class="place-card__title">芝生広場</h2>

                <p class="place-card__text">やわらかい芝生が広がっています。思いきり走り回れそうです。</p>
              </article>

              <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <!-- ※ 小さな「いやいや発生！」の帯は置かない
                       発生した瞬間は、画面いっぱいのオーバーレイ（.tantrum-alert）で知らせているので、
                       ここにも出すと同じことを2回言うことになる
                       カードが軽く左右に揺れる演出（.result-card--tantrum）と、
                       いちばん下のいやいや文（.tantrum-line）はそのまま残している -->

                  <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
                  <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                    <span class="found-flash__label">★ アイテム発見！</span>
                    <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
                  </p>

                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <!-- サブメニュー「☕ ひとやすみ」

                     休憩とおやつは、その場所ならではの遊びではなく
                     「どこでも同じ、親子の状態を整える行動」なので、
                     メインコマンドにまぜず、こちらにまとめている

                     出るのは「休憩・おやつ」を選んだときだけ
                     （isCareMenuVisible が、通常の場所か・結果カードが出ていないか・
                       開いているか の3つをまとめて見てくれる）

                     :css="!resultMessage"
                     休憩する・おやつ・遊びを選んで結果カードが出るときは、閉じるアニメーションをせずに すぐ消す
                     （フェードのあいだ枠が場所を取ったままだと、先に縮んだ「どうする？」が
                       消え終わった瞬間にガクッと下へずれて、2回に分けてパタパタ動いて見えるため）
                     「休憩・おやつ」をもう一度押す・Escape で閉じるときは、今までどおりフェードする -->
                <Transition name="care-menu" :css="!resultMessage">
                  <aside v-if="isCareMenuVisible" class="care-menu">
                    <!-- おやつバッグ（「おやつをあげる ＞」を押したあと）
                         ☕ ひとやすみ の枠の中身だけを入れかえて、同じ場所に出す
                         並べるのはバッグに残っているおやつ（selectedSnacks）だけで、
                         食べたおやつはバッグから消えるので、ここからも消える -->
                    <template v-if="isSnackMenuVisible">
                      <p class="care-menu__label">🎒 どのおやつにする？</p>

                      <button
                        v-for="(snack, index) in selectedSnacks"
                        :key="snack.id"
                        class="care-menu__item snack-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === index }"
                        @click="eatSnackFromBag(snack.id)"
                        @mouseenter="selectedSnackMenuIndex = index"
                        @focus="selectedSnackMenuIndex = index">
                        <span class="snack-menu__name">{{ snack.icon }} {{ snack.name }}</span>
                        <span class="care-menu__badge snack-menu__effects">
                          <span>体力 +{{ snack.energy }}</span>
                          <span>機嫌 +{{ snack.mood }}</span>
                          <span>{{ snack.minutes }}分</span>
                        </span>
                      </button>

                      <button
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === snackMenuBackIndex }"
                        @click="closeSnackMenu"
                        @mouseenter="selectedSnackMenuIndex = snackMenuBackIndex"
                        @focus="selectedSnackMenuIndex = snackMenuBackIndex">
                        <span class="care-menu__text">← もどる</span>
                      </button>
                    </template>

                    <template v-else>
                      <p class="care-menu__label">☕ ひとやすみ</p>

                      <button class="care-menu__item" :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 0 }" @click="takeCommonBreak" @mouseenter="selectedCareCommandIndex = 0" @focus="selectedCareCommandIndex = 0">
                        <span class="care-menu__text">休憩する</span>
                      </button>

                      <!-- バッグにおやつが残っているときだけ出す
                           押すとおやつバッグが開く（ここではまだ食べない）
                           ※ バッグは、いやいやタイムで使うおやつと同じ selectedSnackIds -->
                      <button
                        v-if="snackLeft > 0"
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 1 }"
                        @click="openSnackMenu('exploring')"
                        @mouseenter="selectedCareCommandIndex = 1"
                        @focus="selectedCareCommandIndex = 1">
                        <span class="care-menu__text">おやつをあげる ＞</span>
                        <span class="care-menu__badge">残り{{ snackLeft }}個</span>
                      </button>

                      <p v-else class="care-menu__note">おやつは、もうぜんぶ食べてしまいました…</p>
                    </template>
                  </aside>
                </Transition>

                <!-- メインコマンド（今までどおり、枠の中に選択肢を縦に並べる）
                     command-box--pointer-paused … 休憩・おやつの「← もどる」の直後、マウスを動かすまでマウスで押せなくする
                                                  （isCommandPointerPaused を参照） -->
                <nav class="command-box" :class="{ 'command-box--pointer-paused': isCommandPointerPaused }">
                  <!-- 結果がまだ無いとき -->
                  <template v-if="!resultMessage">
                    <p class="command-box__label">どうする？</p>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="playTagOnGrass" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">追いかけっこする</span>
                    </button>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="playWithBubbles" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                      <span class="command-box__text">シャボン玉で遊ぶ</span>
                    </button>

                    <!-- ここから下は「どこでも同じコマンド」という区切り

                         上の2つ … その場所ならではの遊び（すべる・見守る など）
                         下の2つ … 休憩・おやつ／← 場所選びにもどる（どの場所でも同じ）

                         同じ枠の中にならんでいても種類がちがうので、
                         あいだに細い線と小さな見出しを入れて、
                         ひとめで「ここからは別のなかま」と分かるようにする

                         ※ ボタンではなくただの見出しなので、
                           ↑↓キーの番号（selectedCommandIndex）には数えない -->
                    <p class="command-box__divider">そのほか</p>

                    <!-- サブメニューを開け閉めするコマンド
                         aria-expanded は「いま開いているか」を読み上げソフトに伝えるための印 -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === careMenuCommandIndex }"
                      :aria-expanded="isCareMenuVisible"
                      @click="toggleCareMenu"
                      @mouseenter="selectedCommandIndex = careMenuCommandIndex"
                      @focus="selectedCommandIndex = careMenuCommandIndex">
                      <span class="command-box__text">休憩・おやつ</span>
                    </button>

                    <!-- 「← 場所選びにもどる」… この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る
                         （サブメニューの「← もどる」＝1つ前のメニューへ戻る、とは役割がちがうので、戻り先まで書いてある）

                         よく使うので、サブメニューには入れず、ここに残してある

                         よく使うコマンドなので、見た目も上の行動と
                         まったく同じ（同じ文字の大きさ・同じ色）にそろえてある -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === leavePlaceCommandIndex }"
                      @click="goToNextPlace"
                      @mouseenter="selectedCommandIndex = leavePlaceCommandIndex"
                      @focus="selectedCommandIndex = leavePlaceCommandIndex">
                      <span class="command-box__text">← 場所選びにもどる</span>
                    </button>
                  </template>

                  <!-- 結果が出たあと（コマンドは1つだけ）
                       ・休憩・おやつの結果 … 「← もどる」で、この場所の「どうする？」へ戻る（場所は離れない）
                       ・遊びの結果         … 「次の場所を選ぶ」で、公園入口の「どこへ行く？」へ進む
                       ※ 休憩・おやつで12:00を過ぎたときは「次の場所を選ぶ」になる（isCareResultBackVisible を参照） -->
                  <template v-else>
                    <button
                      v-if="isCareResultBackVisible"
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }"
                      @click="backToPlaceFromCareResult"
                      @mouseenter="selectedCommandIndex = 0"
                      @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">← もどる</span>
                    </button>

                    <button v-else class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                    </button>
                  </template>
                </nav>
              </div>
            </section>
          </div>

          <!-- 秘密の小道（こもれびの広場へ続くミニゲーム）

               そのプレイではじめて「細い道の先へ行く」を選んだときだけ、ここを通る
               secretPathPhase で、中身を3つに切りかえる
               ・ready    … 説明と「小道へ進む」「← 場所選びにもどる」（まだ何も動かない）
               ・playing  … 3レーンのフィールドと「道をクリック・タップして動こう」の案内
               ・finished … 結果の文章と「先へ進む」（押すと こもれびの広場へ） -->
          <div v-else-if="currentEvent === 'secretPath'" class="scene" key="secretPath">
            <!-- stage--secret-path … スマホ幅で、カードとコマンドボックスを横にはみ出させないための目印 -->
            <section class="stage stage--secret-path">
              <!-- はじまる前 -->
              <article v-if="secretPathPhase === 'ready'" class="place-card place-card--secret">
                <h2 class="place-card__title">🌿 秘密の小道</h2>

                <p class="place-card__text">木々のあいだの細い道に、そっと足をふみ入れました。葉っぱのすき間から、光がちらちら差しこんでいます。</p>

                <p class="secret-path-lead">
                  えだをよけながら
                  <br />
                  ✨ こもれびをあつめよう！
                </p>

                <ul class="secret-path-rules">
                  <!-- 操作の説明は、パソコン向け（--pc）とスマホ向け（--touch）を CSS で出し分ける -->
                  <!-- はじめる前に長く読まなくても遊べるよう、操作と目的だけを短く書く
                       文字を大きくしているので、せまい画面でもひと組（「← → / A D：左右に移動」など）の途中では
                       折り返さないよう、span で包んでいる（secret-path-rules__part） -->
                  <li class="secret-path-for-pc">
                    <span class="secret-path-rules__part">← → / A D：左右に移動</span>
                    <span class="secret-path-rules__part">↑長押し：はやく進む</span>
                  </li>
                  <li class="secret-path-for-pc">
                    <span class="secret-path-rules__part">🖱 クリック・ドラッグ：左右に移動</span>
                    <span class="secret-path-rules__part">長押し：はやく進む</span>
                  </li>
                  <li class="secret-path-for-touch">
                    <span class="secret-path-rules__part">👆 タップ・フリック：左右に移動</span>
                    <span class="secret-path-rules__part">長押し：はやく進む</span>
                  </li>
                  <li>
                    <span class="secret-path-rules__part">🌿をよけて✨を集めよう！</span>
                    <span class="secret-path-rules__part">枝に当たると✨が1つへります</span>
                  </li>
                </ul>
              </article>

              <!-- 遊んでいる最中 -->
              <article v-else-if="secretPathPhase === 'playing'" ref="secretPathPlayRef" class="place-card place-card--secret secret-path">
                <div class="secret-path-hud">
                  <span class="secret-path-hud__sunlight" :class="{ 'secret-path-hud__sunlight--sparkle': isSecretPathSparkling, 'secret-path-hud__sunlight--lost': isSecretPathBumped && secretPathBumpLost }" aria-live="polite">
                    ✨ 木漏れ日
                    <!-- key を数にしておくと、取るたびに数字がぽんっと出なおす -->
                    <b :key="secretPathSunlightCount" class="secret-path-hud__count">{{ secretPathSunlightCount }}</b>
                    / {{ secretPathSunlightTotal }}
                  </span>

                  <span class="secret-path-hud__time" :class="{ 'secret-path-hud__time--soon': secretPathTimeLeft <= 3 }">
                    あと {{ secretPathTimeLeft }}秒
                    <!-- はやく進んでいるあいだだけ出す（↑ キー・フィールドの長押し）
                         残り時間の右上に重ねて出すので、出たり消えたりしても HUD の並びは変わらない -->
                    <span v-if="isSecretPathBoosting" class="secret-path-hud__boost">⏩ {{ secretPathBoostMultiplier }}x</span>
                  </span>
                </div>

                <!-- フィールド（左・まん中・右の3レーン）
                     枝と木漏れ日の位置は、JavaScript が1コマごとに top を書きかえて動かしている
                     aria-hidden … 流れてくる絵文字を、ひとつずつ読み上げないようにする -->
                <!-- ポインター操作（クリック・タップ・ドラッグ・フリック・長押し）は、フィールド1か所でまとめて受け取る
                     （handleSecretPathPointerDown() を参照）
                     contextmenu … スマホで長押ししたときのメニューを出さない -->
                <div
                  class="secret-path-field"
                  aria-hidden="true"
                  @pointerdown="handleSecretPathPointerDown"
                  @pointermove="handleSecretPathPointerMove"
                  @pointerup="handleSecretPathPointerUp"
                  @pointercancel="handleSecretPathPointerCancel"
                  @pointerleave="handleSecretPathPointerLeave"
                  @contextmenu.prevent>
                  <!-- 道（レーン）の見た目
                       短くクリック・タップすると、こうちゃんが押したレーンの方向へ1レーン動く
                       ・--next        … 1回で動ける「となりのレーン」。こうちゃんの高さに、うすい点線の丸と矢印（行き先の目印）を出す
                       ・--destination … マウスを乗せたレーンを押したときの動く先。目印がはっきりする
                                         （遠いレーンに乗せたときは、まん中の目印がはっきりする）
                       ・--flash       … 押したレーン・動いた先のレーンが一瞬光る
                       ※ 枝・木漏れ日・こうちゃんは pointer-events: none なので、上に重なっていても押せる -->
                  <div
                    v-for="lane in secretPathLanes"
                    :key="`lane-${lane}`"
                    class="secret-path-lane"
                    :class="{
                      'secret-path-lane--current': lane === secretPathPlayerLane,
                      'secret-path-lane--next': Math.abs(lane - secretPathPlayerLane) === 1,
                      'secret-path-lane--destination': lane === secretPathHoverDestination,
                      'secret-path-lane--flash': lane === secretPathFlashLane,
                    }"
                    :style="{ left: `${(lane / 3) * 100}%` }">
                    <span class="secret-path-lane__target" :style="{ top: `${secretPathPlayerY}%` }">{{ secretPathPlayerLane > lane ? '←' : '→' }}</span>
                  </div>

                  <span
                    v-for="item in secretPathItems"
                    :key="item.id"
                    class="secret-path-item"
                    :class="[`secret-path-item--${item.kind}`, { 'secret-path-item--hit': item.hit }]"
                    :style="{ left: getSecretPathLaneLeft(item.lane), top: `${item.y}%` }">{{ item.kind === 'branch' ? '🌿' : '✨' }}</span>

                  <div class="secret-path-player" :style="{ left: getSecretPathLaneLeft(secretPathPlayerLane), top: `${secretPathPlayerY}%` }">
                    <!-- 枝に当たったとき：「いたっ！」と、木漏れ日が減ったときだけ「✨ -1」
                         key を当たった回数にしておくと、続けて当たったときも出なおす -->
                    <span v-if="isSecretPathBumped" :key="secretPathBumpId" class="secret-path-player__bump">
                      いたっ！
                      <span v-if="secretPathBumpLost" class="secret-path-player__minus">✨ -1</span>
                    </span>
                    <span v-if="isSecretPathSparkling" :key="secretPathSparkleId" class="secret-path-player__plus">✨ +1</span>
                    <span
                      class="secret-path-player__face"
                      :class="{ 'secret-path-player__face--bumped': isSecretPathBumped, 'secret-path-player__face--sparkle': isSecretPathSparkling }">
                      👦
                    </span>
                  </div>
                </div>
              </article>

              <!-- 小道をぬけたあと -->
              <article v-else class="place-card place-card--secret">
                <p class="place-card__flash">小道をぬけた！</p>

                <h2 class="place-card__title">🌿 秘密の小道</h2>

                <p class="secret-path-result">
                  ✨ 木漏れ日
                  <b>{{ secretPathSunlightCount }}</b>
                  / {{ secretPathSunlightTotal }}
                </p>

                <p class="place-card__text">{{ secretPathResultText }}</p>

                <p class="place-card__text secret-path-light">木々のすき間から、まぶしい光が差しこんできました。</p>

                <!-- 木漏れ日ボーナス（2個以上集めたときだけ）
                     見た目は、いやいやタイムの「✨ ナイス対応！」と同じ緑の枠を使う -->
                <div v-if="secretPathBonusPoint > 0" class="event-flash event-flash--nice">
                  <p class="event-flash__label">✨ 木漏れ日ボーナス！</p>

                  <ul class="event-flash__list">
                    <li class="event-flash__item">
                      <span class="event-flash__item-label">おでかけポイント</span>
                      <span class="event-flash__item-value change--good">{{ formatChange(secretPathBonusPoint) }}</span>
                    </li>
                  </ul>
                </div>
              </article>

              <!-- コマンドボックス
                   遊んでいる最中は、コマンドのかわりに操作の案内だけを出す
                   パソコン向け（--pc）とスマホ向け（--touch）を CSS で出し分ける -->
              <nav class="command-box" :class="[choiceGridClass, { 'command-box--pointer-paused': isCommandPointerPaused }]">
                <template v-if="secretPathPhase === 'playing'">
                  <p class="secret-path-guide secret-path-for-pc">
                    <span class="secret-path-guide__item">← → / A D：移動</span>
                    <span class="secret-path-guide__item">↑長押し：加速</span>
                  </p>

                  <p class="secret-path-guide__hint secret-path-for-pc">🖱 クリック・ドラッグ：移動　長押し：加速</p>

                  <p class="secret-path-guide secret-path-for-touch">
                    <span class="secret-path-guide__item">👆 タップ・フリック：移動</span>
                    <span class="secret-path-guide__item">長押し：加速</span>
                  </p>
                </template>

                <!-- はじまる前
                     0 小道へ進む
                     1 ← 場所選びにもどる（公園入口の「どこへ行く？」へ戻る。時間もステータスも変わらない） -->
                <template v-else-if="secretPathPhase === 'ready'">
                  <p class="command-box__label">どうする？</p>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="startSecretPathGame" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">小道へ進む</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="leaveSecretPathToEntrance" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                    <span class="command-box__text">← 場所選びにもどる</span>
                  </button>
                </template>

                <template v-else>
                  <p class="command-box__label">どうする？</p>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="enterSecretSpotFromPath" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">先へ進む</span>
                  </button>
                </template>
              </nav>
            </section>
          </div>

          <!-- 秘密の場所 -->
          <div v-else-if="currentEvent === 'secretSpot'" class="scene" key="secretSpot">
            <section class="stage">
              <article class="place-card place-card--secret">
                <h2 class="place-card__title">こもれびの広場</h2>

                <p class="place-card__text">
                  木々のあいだの細い道を、こうちゃんと葉っぱをかき分けながら進むと、やわらかな木漏れ日が差しこむ小さな広場に出ました。風がそっと吹いて、葉っぱがきらきら揺れています。「きれいー！」こうちゃんは、目をかがやかせています。
                </p>
              </article>

              <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <!-- ※ 小さな「いやいや発生！」の帯は置かない
                       発生した瞬間は、画面いっぱいのオーバーレイ（.tantrum-alert）で知らせているので、
                       ここにも出すと同じことを2回言うことになる
                       カードが軽く左右に揺れる演出（.result-card--tantrum）と、
                       いちばん下のいやいや文（.tantrum-line）はそのまま残している -->

                  <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
                  <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                    <span class="found-flash__label">★ アイテム発見！</span>
                    <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
                  </p>

                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンド欄（サブメニュー ＋ メインコマンド）

                   PCでは [☕ ひとやすみ][どうする？] の横ならび
                   スマホでは横幅が足りないので、たてにならぶ

                   メインコマンドはいつも右はしにあるので、
                   サブメニューを開いても場所が動かない -->
              <div class="command-area">
                <!-- サブメニュー「☕ ひとやすみ」

                     休憩とおやつは、その場所ならではの遊びではなく
                     「どこでも同じ、親子の状態を整える行動」なので、
                     メインコマンドにまぜず、こちらにまとめている

                     出るのは「休憩・おやつ」を選んだときだけ
                     （isCareMenuVisible が、通常の場所か・結果カードが出ていないか・
                       開いているか の3つをまとめて見てくれる）

                     :css="!resultMessage"
                     休憩する・おやつ・遊びを選んで結果カードが出るときは、閉じるアニメーションをせずに すぐ消す
                     （フェードのあいだ枠が場所を取ったままだと、先に縮んだ「どうする？」が
                       消え終わった瞬間にガクッと下へずれて、2回に分けてパタパタ動いて見えるため）
                     「休憩・おやつ」をもう一度押す・Escape で閉じるときは、今までどおりフェードする -->
                <Transition name="care-menu" :css="!resultMessage">
                  <aside v-if="isCareMenuVisible" class="care-menu">
                    <!-- おやつバッグ（「おやつをあげる ＞」を押したあと）
                         ☕ ひとやすみ の枠の中身だけを入れかえて、同じ場所に出す
                         並べるのはバッグに残っているおやつ（selectedSnacks）だけで、
                         食べたおやつはバッグから消えるので、ここからも消える -->
                    <template v-if="isSnackMenuVisible">
                      <p class="care-menu__label">🎒 どのおやつにする？</p>

                      <button
                        v-for="(snack, index) in selectedSnacks"
                        :key="snack.id"
                        class="care-menu__item snack-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === index }"
                        @click="eatSnackFromBag(snack.id)"
                        @mouseenter="selectedSnackMenuIndex = index"
                        @focus="selectedSnackMenuIndex = index">
                        <span class="snack-menu__name">{{ snack.icon }} {{ snack.name }}</span>
                        <span class="care-menu__badge snack-menu__effects">
                          <span>体力 +{{ snack.energy }}</span>
                          <span>機嫌 +{{ snack.mood }}</span>
                          <span>{{ snack.minutes }}分</span>
                        </span>
                      </button>

                      <button
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedSnackMenuIndex === snackMenuBackIndex }"
                        @click="closeSnackMenu"
                        @mouseenter="selectedSnackMenuIndex = snackMenuBackIndex"
                        @focus="selectedSnackMenuIndex = snackMenuBackIndex">
                        <span class="care-menu__text">← もどる</span>
                      </button>
                    </template>

                    <template v-else>
                      <p class="care-menu__label">☕ ひとやすみ</p>

                      <button class="care-menu__item" :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 0 }" @click="takeCommonBreak" @mouseenter="selectedCareCommandIndex = 0" @focus="selectedCareCommandIndex = 0">
                        <span class="care-menu__text">休憩する</span>
                      </button>

                      <!-- バッグにおやつが残っているときだけ出す
                           押すとおやつバッグが開く（ここではまだ食べない）
                           ※ バッグは、いやいやタイムで使うおやつと同じ selectedSnackIds -->
                      <button
                        v-if="snackLeft > 0"
                        class="care-menu__item"
                        :class="{ 'care-menu__item--selected': selectedCareCommandIndex === 1 }"
                        @click="openSnackMenu('exploring')"
                        @mouseenter="selectedCareCommandIndex = 1"
                        @focus="selectedCareCommandIndex = 1">
                        <span class="care-menu__text">おやつをあげる ＞</span>
                        <span class="care-menu__badge">残り{{ snackLeft }}個</span>
                      </button>

                      <p v-else class="care-menu__note">おやつは、もうぜんぶ食べてしまいました…</p>
                    </template>
                  </aside>
                </Transition>

                <!-- メインコマンド（今までどおり、枠の中に選択肢を縦に並べる）
                     command-box--pointer-paused … 休憩・おやつの「← もどる」の直後、マウスを動かすまでマウスで押せなくする
                                                  （isCommandPointerPaused を参照） -->
                <nav class="command-box" :class="{ 'command-box--pointer-paused': isCommandPointerPaused }">
                  <!-- 結果がまだ無いとき -->
                  <template v-if="!resultMessage">
                    <p class="command-box__label">どうする？</p>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="exploreSunlight" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">木漏れ日の中を探検する</span>
                    </button>

                    <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="exploreClearingDepths" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                      <span class="command-box__text">広場の奥を見てみる</span>
                    </button>

                    <!-- ここから下は「どこでも同じコマンド」という区切り

                         上の2つ … その場所ならではの遊び（すべる・見守る など）
                         下の2つ … 休憩・おやつ／← 場所選びにもどる（どの場所でも同じ）

                         同じ枠の中にならんでいても種類がちがうので、
                         あいだに細い線と小さな見出しを入れて、
                         ひとめで「ここからは別のなかま」と分かるようにする

                         ※ ボタンではなくただの見出しなので、
                           ↑↓キーの番号（selectedCommandIndex）には数えない -->
                    <p class="command-box__divider">そのほか</p>

                    <!-- サブメニューを開け閉めするコマンド
                         aria-expanded は「いま開いているか」を読み上げソフトに伝えるための印 -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === careMenuCommandIndex }"
                      :aria-expanded="isCareMenuVisible"
                      @click="toggleCareMenu"
                      @mouseenter="selectedCommandIndex = careMenuCommandIndex"
                      @focus="selectedCommandIndex = careMenuCommandIndex">
                      <span class="command-box__text">休憩・おやつ</span>
                    </button>

                    <!-- 「← 場所選びにもどる」… この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る
                         （サブメニューの「← もどる」＝1つ前のメニューへ戻る、とは役割がちがうので、戻り先まで書いてある）

                         よく使うので、サブメニューには入れず、ここに残してある

                         よく使うコマンドなので、見た目も上の行動と
                         まったく同じ（同じ文字の大きさ・同じ色）にそろえてある -->
                    <button
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === leavePlaceCommandIndex }"
                      @click="goToNextPlace"
                      @mouseenter="selectedCommandIndex = leavePlaceCommandIndex"
                      @focus="selectedCommandIndex = leavePlaceCommandIndex">
                      <span class="command-box__text">← 場所選びにもどる</span>
                    </button>
                  </template>

                  <!-- 結果が出たあと（コマンドは1つだけ）
                       ・休憩・おやつの結果 … 「← もどる」で、この場所の「どうする？」へ戻る（場所は離れない）
                       ・遊びの結果         … 「次の場所を選ぶ」で、公園入口の「どこへ行く？」へ進む
                       ※ 休憩・おやつで12:00を過ぎたときは「次の場所を選ぶ」になる（isCareResultBackVisible を参照） -->
                  <template v-else>
                    <button
                      v-if="isCareResultBackVisible"
                      class="command-box__item"
                      :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }"
                      @click="backToPlaceFromCareResult"
                      @mouseenter="selectedCommandIndex = 0"
                      @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">← もどる</span>
                    </button>

                    <button v-else class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                      <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                    </button>
                  </template>
                </nav>
              </div>
            </section>
          </div>

          <!-- いやいや中 -->
          <div v-else-if="currentEvent === 'tantrum'" class="scene" key="tantrum">
            <section class="stage">
              <!-- いやいやタイムのカード
                   place-card--tantrum        … 赤っぽい見た目（いつも付ける）
                   place-card--tantrum-active … ゆっくりバウンスする動き（いやいや中だけ付ける）
                   place-card--tantrum-big    … 大いやいや（レベル3）の見た目
                                                 いやいや中にこれが付いた瞬間だけ、カードが小さく2回ゆれる

                   見た目と動きでクラスを分けているので、
                   いやいやが終わっても、カードの色はそのままで動きだけが止まる

                   ※ 付け外しの条件は currentEvent ではなく isTantrum
                     だっこ・おやつ・お話・待つで いやいや が終わると、
                     画面は 'tantrum' のままでも isTantrum が false になるので、
                     その瞬間にバウンスが止まる -->
              <article class="place-card place-card--tantrum" :class="{ 'place-card--tantrum-active': isTantrum, 'place-card--tantrum-big': tantrumLevel === 3 }">
                <!-- 見出しは、いやいやの激しさで変わる（数字の「Lv」は出さない）
                     😫 いやいやタイム → 😭 いやいやタイム！ → 😭💥 大いやいやタイム！ -->
                <h2 class="place-card__title">
                  <span class="tantrum-title__icon" aria-hidden="true">{{ currentTantrumLevelInfo.icon }}</span>
                  {{ currentTantrumLevelInfo.title }}
                </h2>

                <!-- いやいやの理由とレベルに合ったセリフと様子
                     理由の名前（'hungry' など）は出さず、様子からプレイヤーに考えてもらう
                     ・セリフ … 理由ごと × レベルごと（はげしいほど声が大きくなる）
                     ・様子   … ぐずぐずは理由ごと、大泣き・大いやいやはレベルごと
                     ※ いやいやが終わって結果を読んでいるあいだも、同じ見出し・セリフのまま残す
                       （片づけるのは、この画面から出るとき＝goToNextPlace()） -->
                <template v-if="currentTantrumReasonInfo">
                  <p class="tantrum-voice">「{{ currentTantrumReasonInfo.voices[tantrumLevel] }}」</p>
                  <p class="place-card__text">{{ currentTantrumScene }}</p>
                </template>

                <!-- 理由が決まっていないとき（ふつうは起きない）は、前からの文章を出す -->
                <p v-else class="place-card__text">
                  こうちゃんがほっぺをふくらませて、その場にぺたんと座りこんでしまいました。 なにを言っても「いや！」のいってんばりですが、ときどきこちらをちらっと見ています。
                </p>
              </article>

              <article v-if="resultMessage" class="result-card" :class="{ 'result-card--tantrum': isTantrum }">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <!-- いやいやが起きたときだけ出す（カードも軽く左右に揺れる） -->
                  <!-- 対応が効かなかった・少し落ち着いただけで、まだいやいやが続いているときに出す -->
                  <p v-if="isTantrum" class="result-alert">まだ いやいや は続いています…</p>

                  <!-- 今回の行動で新しく見つけたものがあるときだけ出す -->
                  <p v-if="foundItemsThisAction.length > 0" class="found-flash">
                    <span class="found-flash__label">★ アイテム発見！</span>
                    <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
                  </p>

                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- ナイス対応（いやいやの理由に合った対応をしたときだけ出す）
                       「ちいさなできごと」と同じ形の枠を使い、色だけ緑に変えて「いいこと」と分かるようにする
                       ボーナスの数字は、実際に足している niceTantrumBonus〜 をそのまま出す -->
                  <div v-if="niceTantrumResponseText" class="event-flash event-flash--nice">
                    <p class="event-flash__label">✨ ナイス対応！</p>

                    <p class="event-flash__text">{{ niceTantrumResponseText }}</p>

                    <ul class="event-flash__list">
                      <li class="event-flash__item">
                        <span class="event-flash__item-label">おでかけポイント</span>
                        <span class="event-flash__item-value change--good">{{ formatChange(niceTantrumBonusOutingPoint) }}</span>
                      </li>
                      <li class="event-flash__item">
                        <span class="event-flash__item-label">親の余裕</span>
                        <span class="event-flash__item-value change--good">{{ formatChange(niceTantrumBonusParentCalm) }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンドボックス（枠の中に選択肢を縦に並べる） -->
              <nav class="command-box" :class="[choiceGridClass, { 'command-box--pointer-paused': isCommandPointerPaused }]">
                <!-- おやつバッグ（「おやつをあげる ＞」を押したあと）
                     いやいやのコマンドと入れかえて、同じ枠の中に出す
                     「← もどる」・Escape で、お話／だっこ／おやつ／待つ に戻る -->
                <template v-if="isSnackMenuVisible">
                  <p class="command-box__label">🎒 どのおやつをあげる？</p>

                  <button
                    v-for="(snack, index) in selectedSnacks"
                    :key="snack.id"
                    class="command-box__item snack-menu__item"
                    :class="{ 'command-box__item--selected': selectedSnackMenuIndex === index }"
                    @click="eatSnackFromBag(snack.id)"
                    @mouseenter="selectedSnackMenuIndex = index"
                    @focus="selectedSnackMenuIndex = index">
                    <span class="snack-menu__name">{{ snack.icon }} {{ snack.name }}</span>
                    <span class="command-box__badge snack-menu__effects">
                      <span>体力 +{{ snack.energy }}</span>
                      <span>機嫌 +{{ snack.mood }}</span>
                      <span>{{ snack.minutes }}分</span>
                    </span>
                  </button>

                  <button
                    class="command-box__item"
                    :class="{ 'command-box__item--selected': selectedSnackMenuIndex === snackMenuBackIndex }"
                    @click="closeSnackMenu"
                    @mouseenter="selectedSnackMenuIndex = snackMenuBackIndex"
                    @focus="selectedSnackMenuIndex = snackMenuBackIndex">
                    <span class="command-box__text">← もどる</span>
                  </button>
                </template>

                <!-- いやいやが続いているあいだは、結果が出ていてもコマンドを出しつづける -->
                <template v-else-if="isTantrumUnsolved">
                  <p class="command-box__label">どうする？</p>

                  <!-- お話してみる（いちばん上。いやいやタイムが始まったときは、ここが選ばれている） -->
                  <button
                    class="command-box__item"
                    :class="{ 'command-box__item--selected': selectedCommandIndex === talkCommandIndex }"
                    @click="talkToChild"
                    @mouseenter="selectedCommandIndex = talkCommandIndex"
                    @focus="selectedCommandIndex = talkCommandIndex">
                    <span class="command-box__text">お話してみる</span>
                  </button>

                  <button
                    class="command-box__item"
                    :class="{ 'command-box__item--selected': selectedCommandIndex === hugCommandIndex }"
                    @click="hugChild"
                    @mouseenter="selectedCommandIndex = hugCommandIndex"
                    @focus="selectedCommandIndex = hugCommandIndex">
                    <span class="command-box__text">だっこする</span>
                  </button>

                  <!-- バッグにおやつが残っているときだけ出す（押すとおやつバッグが開く） -->
                  <button
                    v-if="snackLeft > 0"
                    class="command-box__item"
                    :class="{ 'command-box__item--selected': selectedCommandIndex === snackCommandIndex }"
                    @click="openSnackMenu('tantrum')"
                    @mouseenter="selectedCommandIndex = snackCommandIndex"
                    @focus="selectedCommandIndex = snackCommandIndex">
                    <span class="command-box__text">おやつをあげる ＞</span>
                    <span class="command-box__badge">残り{{ snackLeft }}個</span>
                  </button>

                  <p v-else class="command-box__note">おやつは、もうぜんぶ食べてしまいました…</p>

                  <!-- 少し待ってみる
                       番号はおやつの有無で変わるので waitCommandIndex を見る（おやつあり 3／なし 2） -->
                  <button
                    class="command-box__item"
                    :class="{ 'command-box__item--selected': selectedCommandIndex === waitCommandIndex }"
                    @click="waitCalmly"
                    @mouseenter="selectedCommandIndex = waitCommandIndex"
                    @focus="selectedCommandIndex = waitCommandIndex">
                    <span class="command-box__text">{{ waitCommandLabel }}</span>
                  </button>
                </template>

                <template v-else>
                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                  </button>
                </template>
              </nav>
            </section>
          </div>

          <!-- とつぜんのできごと：救急車のサイレン！ -->
          <div v-else-if="currentEvent === 'emergencySiren'" class="scene" key="emergencySiren">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🚑 救急車のサイレン！</h2>

                <p class="place-card__text">遠くからピーポーピーポーと音が聞こえてきました。こうちゃんは「きゅうきゅうしゃ！」と目を輝かせています。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <article v-if="resultMessage" class="result-card">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <nav class="command-box" :class="[choiceGridClass, { 'command-box--pointer-paused': isCommandPointerPaused }]">
                <!-- まだ選んでいないとき -->
                <template v-if="!resultMessage">
                  <p class="command-box__label">どうする？</p>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="lookForAmbulance" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">立ち止まって救急車を探す</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="listenToSiren" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                    <span class="command-box__text">音を聞きながら少し待つ</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="walkOnFromSiren" @mouseenter="selectedCommandIndex = 2" @focus="selectedCommandIndex = 2">
                    <span class="command-box__text">先へ進む</span>
                  </button>
                </template>

                <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
                <template v-else>
                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                  </button>
                </template>
              </nav>
            </section>
          </div>

          <!-- とつぜんのできごと：テントウムシ発見！ -->
          <div v-else-if="currentEvent === 'ladybug'" class="scene" key="ladybug">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🐞 テントウムシ発見！</h2>

                <p class="place-card__text">葉っぱの上にテントウムシがいました。こうちゃんは「てんとうむし！」とうれしそうにしゃがみこみました。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <article v-if="resultMessage" class="result-card">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <nav class="command-box" :class="[choiceGridClass, { 'command-box--pointer-paused': isCommandPointerPaused }]">
                <!-- まだ選んでいないとき -->
                <template v-if="!resultMessage">
                  <p class="command-box__label">どうする？</p>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="watchLadybug" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">一緒にじっくり観察する</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="holdLadybug" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                    <span class="command-box__text">手に乗せてみる</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="seeOffLadybug" @mouseenter="selectedCommandIndex = 2" @focus="selectedCommandIndex = 2">
                    <span class="command-box__text">そっと見送る</span>
                  </button>
                </template>

                <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
                <template v-else>
                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                  </button>
                </template>
              </nav>
            </section>
          </div>

          <!-- とつぜんのできごと：犬が近づいてきた！ -->
          <div v-else-if="currentEvent === 'dog'" class="scene" key="dog">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">🐕 犬が近づいてきた！</h2>

                <p class="place-card__text">散歩中の犬が、しっぽをふりながら近づいてきました。こうちゃんは気になっているようです。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <article v-if="resultMessage" class="result-card">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <nav class="command-box" :class="[choiceGridClass, { 'command-box--pointer-paused': isCommandPointerPaused }]">
                <!-- まだ選んでいないとき -->
                <template v-if="!resultMessage">
                  <p class="command-box__label">どうする？</p>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="watchDogClose" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">近くで見る</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="watchDogBehindParent" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                    <span class="command-box__text">親の後ろから見る</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="keepDistanceFromDog" @mouseenter="selectedCommandIndex = 2" @focus="selectedCommandIndex = 2">
                    <span class="command-box__text">少し離れる</span>
                  </button>
                </template>

                <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
                <template v-else>
                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                  </button>
                </template>
              </nav>
            </section>
          </div>

          <!-- とつぜんのできごと：こうちゃんがころんだ！ -->
          <div v-else-if="currentEvent === 'fallDown'" class="scene" key="fallDown">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">💦 こうちゃんがころんだ！</h2>

                <p class="place-card__text">走っていたこうちゃんがつまずいてころんでしまいました。少しびっくりした顔でこちらを見ています。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <article v-if="resultMessage" class="result-card">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <nav class="command-box" :class="[choiceGridClass, { 'command-box--pointer-paused': isCommandPointerPaused }]">
                <!-- まだ選んでいないとき（おやつは使わないので、いつも4つ） -->
                <template v-if="!resultMessage">
                  <p class="command-box__label">どうする？</p>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="hugAfterFall" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">すぐにだっこする</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="blowPainAway" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                    <span class="command-box__text">痛いの痛いのとんでいけ〜</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="restOnBenchAfterFall" @mouseenter="selectedCommandIndex = 2" @focus="selectedCommandIndex = 2">
                    <span class="command-box__text">ベンチで少し休む</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 3 }" @click="watchAfterFall" @mouseenter="selectedCommandIndex = 3" @focus="selectedCommandIndex = 3">
                    <span class="command-box__text">「大丈夫？」と見守る</span>
                  </button>
                </template>

                <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
                <template v-else>
                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                  </button>
                </template>
              </nav>
            </section>
          </div>

          <!-- とつぜんのできごと：噴水が出た！ -->
          <div v-else-if="currentEvent === 'fountain'" class="scene" key="fountain">
            <section class="stage">
              <article class="place-card place-card--sudden">
                <p class="place-card__flash">とつぜんのできごと！</p>

                <h2 class="place-card__title">⛲ 噴水が出た！</h2>

                <p class="place-card__text">突然、噴水から勢いよく水が飛び出しました。こうちゃんは「わあ！」と大喜びです。</p>
              </article>

              <!-- 選んだあとの結果（通常の場所とおなじ形） -->
              <article v-if="resultMessage" class="result-card">
                <h3 class="result-card__title">結果</h3>

                <!-- ここから下が、高さが足りないときにスクロールする部分
                     上の「結果」バッジ（h3）は外に置いてあるので、
                     スクロールしても切れずに残る -->
                <div class="result-card__body">
                  <p class="result-card__text">{{ resultMessage }}</p>

                  <!-- 見つけたものの文
                       アイテムの名前だけ、色をつけて文の中でも目立つようにする

                       そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
                       （文章は script の itemReactions にまとめてある）
                       今回の行動で新しく見つけたときだけ出る
                       （foundItemsThisAction には、新しく見つけたものしか入らない） -->
                  <template v-for="item in foundItemsThisAction" :key="item">
                    <p class="found-line">
                      「
                      <b class="found-line__name">{{ item }}</b>
                      」を見つけました！
                    </p>

                    <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
                  </template>

                  <!-- 行動の最中に起きたちいさなできごと（ランダムイベント）
                       地の文にまぎれないように、専用の枠と
                       色つきのしるし（おでかけポイント +5 など）で出す -->
                  <div v-if="randomEventText" class="event-flash">
                    <p class="event-flash__label">ちいさなできごと！</p>

                    <p class="event-flash__text">{{ randomEventText }}</p>

                    <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
                      <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
                        <span class="event-flash__item-label">{{ effect.label }}</span>
                        <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- いやいやが始まったときの文
                       起きた順（行動 → アイテム → ちいさなできごと → いやいや）で
                       読めるように、いちばん最後に置く -->
                  <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

                  <!-- 今回の行動で、どのステータスがどれだけ変わったか -->
                  <div v-if="statusChanges" class="change-box">
                    <p class="change-box__title">今回の変化（合計）</p>

                    <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
                         外側のループでグループ、内側のループでその中の項目を出す -->
                    <div class="change-groups">
                      <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
                        <p class="change-group__name">{{ group.name }}</p>

                        <ul class="change-list">
                          <li v-for="row in group.rows" :key="row.label" class="change-item">
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
                      </section>
                    </div>
                  </div>
                </div>
              </article>

              <!-- コマンドボックス（通常の場所とおなじ見た目を使う） -->
              <nav class="command-box" :class="[choiceGridClass, { 'command-box--pointer-paused': isCommandPointerPaused }]">
                <!-- まだ選んでいないとき -->
                <template v-if="!resultMessage">
                  <p class="command-box__label">どうする？</p>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goCloseToFountain" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">近くまで見に行く</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 1 }" @click="watchFountainFar" @mouseenter="selectedCommandIndex = 1" @focus="selectedCommandIndex = 1">
                    <span class="command-box__text">少し離れて見る</span>
                  </button>

                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 2 }" @click="walkOnFromFountain" @mouseenter="selectedCommandIndex = 2" @focus="selectedCommandIndex = 2">
                    <span class="command-box__text">先へ進む</span>
                  </button>
                </template>

                <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
                <template v-else>
                  <button class="command-box__item" :class="{ 'command-box__item--selected': selectedCommandIndex === 0 }" @click="goToNextPlace" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                    <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
                  </button>
                </template>
              </nav>
            </section>
          </div>

          <!-- ゴール -->
          <div v-else-if="currentEvent === 'goal'" class="scene" key="goal">
            <section class="stage">
              <!-- 総合スコア ＋ ランク ＋ 結果メッセージ
                   SランクとS+ランクのときだけ、カードがきらきら光る -->
              <article class="ending-card" :class="{ 'ending-card--s': endingRank === 'Sランク' || endingRank === 'S+ランク' }">
                <!-- 総合スコア（0〜100点） -->
                <p class="ending-card__score-label">総合スコア</p>

                <p class="ending-card__score">
                  <span class="ending-card__score-value">{{ finalScore }}</span>
                  <span class="ending-card__score-max">/ 100</span>
                </p>

                <!-- 今回のランク
                     結果のいちばん大事なところなので、
                     小さなラベル ＋ 大きなバッジ の2段にして目立たせる -->
                <p class="ending-card__rank-label">今回のランク</p>

                <p class="ending-card__rank">{{ endingRank }}</p>

                <h3 class="ending-card__title">{{ endingTitle }}</h3>

                <p class="ending-card__text">{{ endingMessage }}</p>

                <!-- S+ランクのときだけ出す、うた入りエンディングBGMの小さな表示

                     出すのは、どちらか1つだけ（スコア・ランク・結果の文をじゃましないように）
                     ・このブラウザではじめて解放したとき … 「✨ サウンドトラックに新しい曲が追加されました！」＋ 曲名
                     ・もう解放済みのとき                 … 「♪ 曲名」だけ（いま流れている曲の案内）

                     role="status" … 解放のお知らせが出たことを、読み上げソフトにも伝える -->
                <p v-if="isSPlusSongNewlyUnlocked" class="ending-card__song ending-card__song--new" role="status">
                  <span>✨ サウンドトラックに新しい曲が追加されました！</span>
                  <span>「{{ sPlusSongTitle }}」</span>
                </p>

                <p v-else-if="endingRank === 'S+ランク'" class="ending-card__song">♪ {{ sPlusSongTitle }}</p>
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
                      <span>こうちゃんの体力</span>
                      <b>{{ childEnergy }}</b>
                    </li>

                    <li class="record-item">
                      <span>こうちゃんの機嫌</span>
                      <b>{{ childMood }}</b>
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
                      <span>おでかけポイント</span>
                      <b>{{ outingPoint }}</b>
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
                      <span>遊んだ回数</span>
                      <b>{{ playCount }}回</b>
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

            <!-- ボタンは2つ。左右にならべて ← → で行き来して、
                 Enter / Space で押せる（いま選んでいるほうに「▶」と水色の枠が付く）
                 リザルトがスクロールするときは、↑↓ はスクロールに使う（収まっているときは ↑↓ でも選べる）
                 マウスを乗せたとき・Tabで移動したときも、そのボタンが選ばれた状態になる（@mouseenter / @focus）
                 command--result … スマホ幅でも2つを横にならべる
                 command--pointer-paused … ↑↓・← → でスクロールした直後、マウスを動かすまでマウスで選べなくする
                                           （止まっているカーソルの下にボタンが来て、キーボードの選択が上書きされないようにする） -->
            <nav class="command command--result" :class="{ 'command--pointer-paused': isCommandPointerPaused }">
              <button class="cmd cmd--next" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="resetGame" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                <span class="cmd__text">もう一度あそぶ</span>
              </button>

              <!-- はじめの画面（起動画面）へ戻る

                   主役は上の「もう一度あそぶ」なので、色は控えめにしてある
                   （選ばれたときは、ほかのボタンと同じように「▶」と枠が付く）

                   @keydown.enter.stop / @keydown.space.stop
                   … Tabキーでこのボタンへ移動して Enter（Space）を押したとき、
                     同じキーが window の handleKeydown にも伝わって、
                     「選んでいるコマンド」まで実行されてしまうのを止める
                     矢印キーは止めないので、フォーカスが当たっていても選択やスクロールは動かせる -->
              <button
                class="cmd cmd--sub cmd--back"
                :class="{ 'cmd--selected': selectedCommandIndex === 1 }"
                @click="goBackToBootFromResult"
                @mouseenter="selectedCommandIndex = 1"
                @focus="selectedCommandIndex = 1"
                @keydown.enter.stop
                @keydown.space.stop>
                <span class="cmd__text">はじめの画面へ戻る</span>
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

              <!-- 横並びにする2枚のカード（記録／見つけたもの） -->
              <div class="record-grid">
                <article class="record-card">
                  <h3 class="record-card__title">今日の記録</h3>

                  <ul class="record-list">
                    <li class="record-item">
                      <span>こうちゃんの体力</span>
                      <b>{{ childEnergy }}</b>
                    </li>

                    <li class="record-item">
                      <span>こうちゃんの機嫌</span>
                      <b>{{ childMood }}</b>
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
                      <span>おでかけポイント</span>
                      <b>{{ outingPoint }}</b>
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
                      <span>遊んだ回数</span>
                      <b>{{ playCount }}回</b>
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

            <!-- ボタンは2つ。左右にならべて ← → で行き来して、
                 Enter / Space で押せる（いま選んでいるほうに「▶」と水色の枠が付く）
                 リザルトがスクロールするときは、↑↓ はスクロールに使う（収まっているときは ↑↓ でも選べる）
                 マウスを乗せたとき・Tabで移動したときも、そのボタンが選ばれた状態になる（@mouseenter / @focus）
                 command--result … スマホ幅でも2つを横にならべる
                 command--pointer-paused … ↑↓・← → でスクロールした直後、マウスを動かすまでマウスで選べなくする
                                           （止まっているカーソルの下にボタンが来て、キーボードの選択が上書きされないようにする） -->
            <nav class="command command--result" :class="{ 'command--pointer-paused': isCommandPointerPaused }">
              <button class="cmd cmd--next" :class="{ 'cmd--selected': selectedCommandIndex === 0 }" @click="resetGame" @mouseenter="selectedCommandIndex = 0" @focus="selectedCommandIndex = 0">
                <span class="cmd__text">もう一度あそぶ</span>
              </button>

              <!-- はじめの画面（起動画面）へ戻る

                   主役は上の「もう一度あそぶ」なので、色は控えめにしてある
                   （選ばれたときは、ほかのボタンと同じように「▶」と枠が付く）

                   @keydown.enter.stop / @keydown.space.stop
                   … Tabキーでこのボタンへ移動して Enter（Space）を押したとき、
                     同じキーが window の handleKeydown にも伝わって、
                     「選んでいるコマンド」まで実行されてしまうのを止める
                     矢印キーは止めないので、フォーカスが当たっていても選択やスクロールは動かせる -->
              <button
                class="cmd cmd--sub cmd--back"
                :class="{ 'cmd--selected': selectedCommandIndex === 1 }"
                @click="goBackToBootFromResult"
                @mouseenter="selectedCommandIndex = 1"
                @focus="selectedCommandIndex = 1"
                @keydown.enter.stop
                @keydown.space.stop>
                <span class="cmd__text">はじめの画面へ戻る</span>
              </button>
            </nav>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- ============================================================
         いやいや発生の演出（画面いっぱいのオーバーレイ）

         新しいいやいやが始まった瞬間だけ、2秒ほど画面の上に重ねて出す
         ※ うしろのゲーム画面はそのまま動いているので、
           演出が消えたあとは、いつもの結果カードがそのまま残っている

         ※ ここ（main のいちばん最後）に置いているのは、
           どの画面の上にも同じように重ねて出すため
         ============================================================ -->
    <div v-if="tantrumAlertVisible" class="tantrum-alert">
      <div class="tantrum-alert__content">
        <strong class="tantrum-alert__title">いやいや発生！</strong>
      </div>
    </div>

    <!-- ============================================================
         「公園の出口へ向かう？」の確認ダイアログ

         公園入口で「公園の出口へ向かう（ゴール）」を選んだときだけ出す
         ・もう少し遊ぶ … 閉じて、公園入口に戻る（開いたときは、こちらが選ばれている）
         ・出口へ向かう … ゴールへ（結果発表）

         @click.self … カードの外（うしろの暗いところ）をクリックしたら閉じる
                       .self なので、カードの中をクリックしたときは閉じない
         キーボード操作は handleKeydown() の中で受け取っている（←→↑↓・Tab・Enter / Space・Escape）

         role="alertdialog" と aria-modal="true" は、読み上げソフトに
         「大事な確認のダイアログが、画面の手前に出ている」ことを伝えるためのもの
         ============================================================ -->
    <div v-if="isGoalConfirmVisible" class="goal-confirm" @click.self="closeGoalConfirm">
      <div class="goal-confirm__content" role="alertdialog" aria-modal="true" aria-labelledby="goal-confirm-title" aria-describedby="goal-confirm-text">
        <p id="goal-confirm-title" class="goal-confirm__title">公園の出口へ向かう？</p>

        <p id="goal-confirm-text" class="goal-confirm__text">
          出口へ向かうと、今日のおでかけはおしまいです。
          <br />
          結果発表へ進みます。
        </p>

        <p class="goal-confirm__time">{{ goalConfirmTimeText }}</p>

        <div class="goal-confirm__buttons">
          <button type="button" class="cmd goal-confirm__button" :class="{ 'cmd--selected': selectedGoalConfirmIndex === 0 }" @click="closeGoalConfirm" @mouseenter="selectedGoalConfirmIndex = 0">
            <span class="cmd__text">もう少し遊ぶ</span>
          </button>

          <button
            type="button"
            class="cmd cmd--goal goal-confirm__button"
            :class="{ 'cmd--selected': selectedGoalConfirmIndex === 1 }"
            @click="confirmGoToGoal"
            @mouseenter="selectedGoalConfirmIndex = 1">
            <span class="cmd__text">出口へ向かう</span>
          </button>
        </div>
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

  /* 「いま選んでいるコマンド」を表す水色（シアン）＝ #67e8f9
     ・金色 … ポイント／結果／特別な表示
     ・赤系 … あぶない
     ・緑系 … 良い変化
     とすでに意味が決まっているので、「選択中」だけの専用色として水色を用意する

     ※ 色そのもの（#67e8f9）ではなく「赤 緑 青」の3つの数字で持っておく。
       こう書いておくと rgb(var(--command-selected) / 45%) のように、
       透明度だけを変えながら、枠にも光にも同じ色を使い回せる */
  --command-selected: 103 232 249;
  --child-energy: #96dfc4; /* ミント */
  --child-mood: #ffd98f; /* バターイエロー */
  --parent-energy: #93cff5; /* そらいろ */
  --parent-calm: #ffa3a3; /* さんご（親の余裕ゲージと、いやいや関連の表示に使う） */

  /* 「☕ ひとやすみ」の枠の色（やさしい緑）

     コマンドの枠は2つあり、色で役割を分けている
     ・どうする？（遊ぶ）    … 紺色（--navy / --navy-deep）
     ・ひとやすみ（休む）    … ここの緑

     ゴールのボタン（#59bd7f → #38955f）と同じ緑の系統なので、
     新しい色が1つ増えたようには見えず、画面から浮かない
     文字は白なので、白が読める暗さ（コントラスト4.5以上）にしてある */
  --care: #3c8265;
  --care-deep: #326d55;

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
   画面の切りかえ（A画面 ⇄ B画面 ⇄ ゲーム画面）のフェード

   template の <Transition name="screen-fade" mode="out-in"> と組みで使う
   （名前が screen-fade なので、クラス名も screen-fade-〜 になる）

   ・-leave-active … 消えていくあいだ
   ・-leave-to     … 消えおわったときの見た目（ここへ向かって変化する）
   ・-enter-active … 出てくるあいだ
   ・-enter-from   … 出はじめの見た目（ここから変化してくる）

   動きはごく小さくしてある
   ・opacity（すけ具合）
   ・translateY（ほんの2〜4pxの上下）だけ
   時間も 0.18秒（180ミリ秒）と短くして、
   「ボタンを押してから次の画面まで待たされる」と感じないようにしている

   ※ 動きを減らす設定（prefers-reduced-motion）のときは、
     ページ下のまとめて止める指定でここも自動的に止まる
   ============================================================ */
.screen-fade-enter-active,
.screen-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

/* 出てくるとき：4pxだけ下から、すっと上がりながら現れる */
.screen-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

/* 消えるとき：2pxだけ上へ抜けながら消える */
.screen-fade-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

/* 消えかけの画面は、もう押せないようにする

   mode="out-in" では、押したあとも前の画面がしばらく見えている
   そこを続けて押せてしまうと、同じボタンが2回はたらいてしまうため
   （キーボードのほうは isScreenChanging で止めている） */
.screen-fade-leave-active {
  pointer-events: none;
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

/* min-height は「A画面とB画面でカードの高さをそろえる」ためのもの

   タイトル画面（.title-screen）はカードを上下まんなかに置くので、
   A画面とB画面でカードの高さがちがうと、カードの上のふちの位置もずれる
   → 上部のサウンドON/OFFがA→Bでガクッと動いて見えてしまう

   そこで、中身が多いB画面（説明文つき）でも収まる高さを min-height にしておく
   こうすると2枚のカードは同じ高さになり、上部の操作も同じ場所に出る
   （あまった縦の余白は、name の margin-top: auto と
     開始ボタンの margin-bottom: auto が上下に分けて吸収する）

   ※ このゲームは box-sizing を border-box にしていないので、
     ここの400pxは padding（44px）をふくまない「中身だけ」の高さ
     上部の操作を大きくしてもB画面の中身は400pxに収まるため、
     デスクトップではこの値のままでよい */
/* flex-shrink: 0 は「カードを押しつぶさせない」ための指定

   .title-screen は display: flex ＋ flex-direction: column なので、
   その中のカードは「たてに縮められる側」になる
   flex-shrink は書かないと 1（＝縮んでよい）が既定値なので、
   中身がその画面の高さより高いとき、カードの箱だけが高さぶんまで縮み、
   あふれた中身はカードの下わくをつきぬけて出てしまう

   しかもカードの箱は縮んで収まっているので、
   .title-screen から見ると「あふれていない」ことになり、
   overflow-y: auto があってもスクロールバーが出ない
   結果、はみ出した中身は .game の overflow: hidden に切り落とされ、
   いちばん下にある「このおやつで公園へ行く！」が読めなくなる

   0 にしておくと、カードは中身ぶんの高さを保つ
   そのぶん .title-screen のほうがあふれるので、
   今度はちゃんとスクロールできるようになり、
   ボタンもカードのわくの内側に収まる

   ※ A画面・B画面のカードは中身が少なく、ふだん縮むことはないが、
     とても背の低い画面では同じことが起きるので、まとめてここで防いでおく */
.title-card {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 100%;
  max-width: 620px;
  min-height: 400px;
  padding: 44px 44px;
  border: 3px solid var(--navy);
  border-radius: 20px;
  background: var(--paper);
  box-shadow: 0 12px 0 rgb(35 57 94 / 18%);
  text-align: center;
}

/* カードの中身を、見た目のうえで上から順に並べ直す

   HTMLでは、Tabキーの順番をそろえるために
   メインのボタン（はじめる／きょうのおやつを選ぶ）をいちばん先に書いてある
   そのぶん、見た目の位置はここで元どおりに並べ替える
   （.title-card は display: flex なので、order で順番を決められる）

     1 上のツールバー（サウンドトラック／戻る・サウンドON/OFF）
     2 ゲームのタイトル
     3 説明文（B画面だけ）
     4 メインのボタン */
.title-card__tools {
  order: 1;
}

.title-card__name {
  order: 2;
}

.title-card__rule {
  order: 3;
}

.title-card .cmd--start {
  order: 4;
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
  margin: auto 0 16px;
  color: var(--navy);
  font-size: 36px;
  line-height: 1.35;
}

/* カードを縦に大きくしたぶん、メインの中身（タイトル・説明・開始ボタン）を
   上下の余白で中央寄りに置く。左上のツールバーは上にそのまま残す
   （name の margin-top: auto と、開始ボタンの margin-bottom: auto で上下を均す） */
.title-card .cmd--start {
  margin-bottom: auto;
}

/* キーボードで「はじめる」「きょうのおやつを選ぶ」を選んでいるとき

   ふつうの .cmd のフォーカス枠は金色だが、このボタン自体が金色なので、
   金色どうしでふちが見えなくなってしまう
   ここだけ紺色の太めのふちにして、いま選んでいることがはっきり分かるようにする
   （マウスで押しただけのときは出ない。:focus-visible ＝ キーボード操作のときだけ） */
.title-card .cmd--start:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 3px;
}

/* 起動画面のカードも、タイトル画面と同じ余白・同じ min-height を使う
   （A→B で切り替えたときに、カードの外枠サイズがそろうようにする） */
.title-card--boot .title-card__name {
  margin: auto 0 28px;
}

.title-card__lead {
  margin: 0 0 22px;
  font-size: 17px;
  font-weight: 700;
}

/* タイトル画面の説明（どんなゲームかを伝えるいちばん大事な文章）
   ここを読んでもらってから「きょうのおやつを選ぶ」を押してほしいので、
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
   タイトルカード上部の補助操作（A画面・B画面で共通）

   左：A画面＝「♪ サウンドトラック」 / B画面＝「← はじめの画面へ戻る」
   右：サウンドON/OFF（どちらの画面も同じ）

   A→B へ切り替えたときに上部のボタンがガクッと動いて見えないよう、
   入れ物（.title-card__tools）も中のボタンの大きさも、
   A画面・B画面でまったく同じCSSを使う（画面ごとの調整はしない）

   大きさは「はじめる」「きょうのおやつを選ぶ」より目立たせないが、
   ふつうに読めて押せるくらい（高さ38px・文字15px）にしている
   ============================================================ */

/* 入れ物：カードのいちばん上に、左の補助リンクと右のサウンドON/OFFを分けて置く

   ※ マイナスの余白は「その分だけ外側へはみ出す」という意味
     はみ出す先はカードの内側の余白（padding: 44px）なので、外へは出ない
     下は26pxあけて、タイトルと近づきすぎないようにする */
.title-card__tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -22px -12px 26px;
}

/* 上部に並ぶボタンの大きさ（高さ・文字・左右の余白・アイコンとのすき間）
   左右どちらも同じ値にして、上端・高さ・文字サイズをそろえる

   ※ サウンドのコントロールは、ボタンの中身が文字ではなくアイコンなので、
     padding ではなく、すぐ下の --sound-〜 で大きさをそろえている */
.title-card__soundtrack,
.title-card__back,
.title-card__howto {
  gap: 7px;
  min-height: 38px;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 15px;
  line-height: 1.2;
  white-space: nowrap; /* 「← はじめの画面へ戻る」を2行に折り返させない */
}

/* タイトル画面（A/B・おやつ選択・あそびかた）のサウンドコントロール

   左の補助リンク（min-height: 38px）と高さをそろえて、
   ゲーム画面の上部バーに置くときより ひとまわり大きくする
   （指でも押しやすく、ミュートの「×」もはっきり見える大きさになる） */
.title-card__tools .sound-control {
  --sound-button-size: 38px;
  --sound-icon-size: 20px;
  --sound-slider-width: 110px;
}

/* 左側の補助リンク（A：♪ サウンドトラック / B：← はじめの画面へ戻る）

   2つは同じ種類の「補助ナビゲーション」なので、見た目もそろえる
   ふつうのテキストリンクには見せない（下線なし）、白地に紺文字のpill
*/
.title-card__soundtrack,
.title-card__back,
.title-card__howto {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--navy-line);
  background: rgb(255 255 255 / 55%);
  color: var(--navy);
  font-family: inherit;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}

/* PCでカーソルを当てたときだけ、うすい水色になって少し上へ動く（派手にしない） */
.title-card__soundtrack:hover,
.title-card__back:hover,
.title-card__howto:hover {
  border-color: var(--navy);
  background: #e3f2fb;
  color: var(--navy-deep);
  transform: translateY(-1px);
}

.title-card__soundtrack:active,
.title-card__back:active,
.title-card__howto:active {
  transform: translateY(1px);
}

.title-card__soundtrack:focus-visible,
.title-card__back:focus-visible,
.title-card__howto:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 2px;
}

/* B画面の右上のまとまり（？ あそびかた ＋ サウンドON/OFF）

   左の「はじめの画面へ戻る」とは、.title-card__tools の space-between で左右に分かれる
   この中の2つは、すき間をあけて右はしに並ぶ
   margin-left: auto は、とても細い画面で下の行へ回りこんだときも右へ寄せるため */
.title-card__toolsRight {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* 「？ あそびかた」の「?」を紺色の丸に入れて、説明書のボタンだと分かりやすくする

   「?」を丸のまんなかに置くために、2つだけ気をつけている
   ・letter-spacing: 0 … ボタンの letter-spacing は文字のうしろにすき間を足すので、
                         そのままだと「?」が左へずれて見える
   ・半角の「?」       … 全角の「？」は、フォントによって文字の形が左へ寄っていることがある */
.title-card__howtoIcon {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--navy);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
}

/* ============================================================
   あそびかた画面

   入れものは、ほかのタイトル系の画面と同じ .title-card をそのまま使う
   （紙の色・紺色のふち・角の丸み・上のツールバーがそろうので、
     B画面から切りかわっても、同じカードの中身が入れかわったように見える）

   ちがうのは .title-card--howto で足している次のところだけ
   ① 文章を読む画面なので、横幅を広げて、文字は左ぞろえにする
   ② 縦に長いので、上下の余白は少しつめる
      （収まらないぶんは .title-screen が縦にスクロールしてくれる）
   ============================================================ */

/* box-sizing: border-box にしているのは、横にはみ出さないようにするため

   このゲームは box-sizing を border-box にしていないので、
   ふつうの .title-card は「width: 100% ＋ 左右の余白とふち」の幅になる
   B画面（620px）は画面の余白の中に収まるが、この画面は幅が広い（780px）ので、
   タブレットくらいの幅（768pxなど）では、余白とふちのぶんだけ画面の外へはみ出してしまう

   border-box にすると、余白とふちもふくめて width: 100% ／ max-width: 780px に収まる */
.title-card--howto {
  box-sizing: border-box;
  max-width: 780px;
  padding-top: 32px;
  padding-bottom: 36px;
  text-align: left;
}

/* ほかの画面ではHTMLの順番と見た目の順番がちがうので、.title-card__tools に order: 1 が付いている
   この画面はHTMLの順番のまま上から出したいので、0（ほかの中身と同じ）に戻す
   （1 のままだと、ツールバーが説明のいちばん下へ行ってしまう）

   flex-wrap は、おやつ選択画面と同じく、とても細い画面でのはみ出しよけ */
.title-card--howto .title-card__tools {
  order: 0;
  flex-wrap: wrap;
}

/* 見出し（？ あそびかた） */
.howto-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 0 0 16px;
  color: var(--navy);
  font-size: 28px;
  line-height: 1.35;
}

.howto-heading__icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--navy);
  color: #fff;
  font-size: 20px;
  line-height: 1;
}

/* 項目ひとつぶんのまとまり（B画面の説明文と同じ、うすい青の枠） */
.howto-section {
  margin: 0 0 12px;
  padding: 16px 22px 18px;
  border-radius: 14px;
  background: #f2f6fb;
}

.howto-section > :last-child {
  margin-bottom: 0;
}

/* 見出しの前の番号は、紺色の丸に白い数字 */
.howto-section__title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 8px;
  color: var(--navy);
  font-size: 20px;
  line-height: 1.4;
}

.howto-section__num {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--navy);
  color: #fff;
  font-size: 15px;
  line-height: 1;
}

.howto-subheading {
  margin: 14px 0 6px;
  color: var(--navy);
  font-size: 16px;
  line-height: 1.5;
}

.howto-text {
  margin: 0 0 10px;
  line-height: 1.85;
}

/* 箇条書き（点は、うすい水色の丸） */
.howto-list {
  display: grid;
  gap: 4px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
}

.howto-list li {
  position: relative;
  padding-left: 20px;
  line-height: 1.8;
}

.howto-list li::before {
  position: absolute;
  top: 0.65em;
  left: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--navy-line);
  content: '';
}

/* 名前と説明の一覧（ステータス・いやいやタイムの4つの対応）
   パソコンでは「左に名前・右に説明」の1行、
   スマホ幅では名前の下に説明（ページ下の max-width: 700px） */
.howto-terms {
  display: grid;
  gap: 6px;
  margin: 0 0 10px;
}

.howto-terms__row {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 0 12px;
  padding: 6px 14px;
  border-radius: 10px;
  background: var(--paper);
}

.howto-terms dt {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--navy);
  font-weight: 700;
  line-height: 1.7;
}

.howto-terms dd {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
}

/* ステータス名の前の丸（ゲーム画面のゲージと同じ色） */
.howto-dot {
  flex: none;
  width: 12px;
  height: 12px;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 50%;
}

.howto-dot--child-energy {
  background: var(--child-energy);
}

.howto-dot--child-mood {
  background: var(--child-mood);
}

.howto-dot--parent-energy {
  background: var(--parent-energy);
}

.howto-dot--parent-calm {
  background: var(--parent-calm);
}

.howto-dot--point {
  background: var(--gold);
}

.howto-dot--time {
  background: var(--navy);
}

/* 目立たせたい一文（操作・GAME OVER・基本のヒント）
   左の太い線の色で、どんな話かを分けている
   ・操作   … 箇条書きの点と同じ 水色（modifier なしの、もとの色）
   ・注意   … 親の余裕ゲージと同じ さんご色
   ・ヒント … 金色 */
.howto-note {
  margin: 10px 0 0;
  padding: 10px 14px;
  border-left: 5px solid var(--navy-line);
  border-radius: 10px;
  background: var(--paper);
  font-weight: 700;
  line-height: 1.8;
}

.howto-note__title {
  margin-right: 6px;
  color: var(--navy);
}

.howto-note--caution {
  border-left-color: var(--parent-calm);
}

.howto-note--hint {
  border-left-color: var(--gold);
}

/* いちばん下の「← ひとつ前の画面へ戻る」 */
.howto-footer {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}

/* ============================================================
   おやつ選択画面（きょうのおやつ）

   入れものは、A画面・B画面と同じ .title-card をそのまま使っている
   （紙の色・紺色のふち・角の丸み・上のツールバーの位置がそろうので、
     B画面から切りかわっても、同じカードの中身が入れかわったように見える）

   ちがうのは次の2つだけで、どちらも .title-card--snack で足している
   ① おやつ6つを並べるので、カードの横幅を少し広くする
   ② 中身の順番が増えるので、order を付け直す
   ============================================================ */

/* おやつのカードを3列ならべるぶん、B画面（620px）より広くする
   min-height は .title-card のまま（400px）で足りる
   （中身のほうが高くなるので、実際はそれ以上に伸びる）

   820pxにしてあるのは、1枚のカードの中身の幅を確保するため
   2列だと、1枚のカードで文字に使える幅は
   （820 − カードの余白88 − ふち6 − すき間12）÷ 2 − カードの余白24 − ふち4 ＝ 約329px

   ここに収まってほしいものが2つある
   ・説明文でいちばん長い「こうちゃんの大好物。機嫌が大きく回復」… 約270px
   ・回復量「体力 +18 ／ 機嫌 +6 ／ 10分」                      … 約181px

   どちらも1行で収まるので、カードの中で折り返しが起きない
   （説明文が変な位置で切れていたのは、幅が足りていなかったのが原因）

   ■ 上下の余白だけ、A画面・B画面より小さくしている（44px → 32px）

     A画面・B画面のカードは、タイトルとボタンだけの すいた画面なので、
     44pxのゆったりした余白がちょうどよい
     こちらはおやつ6枚＋バッグ＋ボタンと中身が多いので、
     同じ44pxだとカードだけがどんどん縦に伸びてしまう

     このカードは中身だけで900pxちかくあり、
     ノートパソコンの表示領域（640〜800pxくらい）には収まりきらない
     収まらないぶんは .title-screen が縦にスクロールしてくれるが、
     スクロールしないと「このおやつで公園へ行く！」が見えない画面は使いにくいので、
     見た目をくずさない範囲で、余白を少しずつ削ってある
     （さらに背の低い画面向けの調整は、ページ下の max-height: 800px のところ） */
.title-card--snack {
  max-width: 820px;
  padding-top: 32px;
  padding-bottom: 32px;
}

/* この画面だけ、上のツールバーを折り返せるようにしておく

   「← ひとつ前の画面へ戻る」は、B画面の「はじめの画面へ戻る」より
   2文字ぶん長い。左右のボタンはどちらも折り返さない指定
   （.title-card__back の white-space: nowrap）なので、
   iPhone SE ほどの細い画面（320px）では、
   2つを1行にならべると、はみ出してしまうことがある

   flex-wrap: wrap にしておくと、そういう細い画面では
   サウンドON/OFFが下の行へ回りこむだけで、はみ出さなくなる
   （ふつうの幅では今までどおり1行のままなので、見た目は変わらない） */
.title-card--snack .title-card__tools {
  flex-wrap: wrap;
}

/* カードの中身を、見た目のうえで上から順に並べ直す

   HTMLでは、Tabキーの順番をそろえるために
   「おやつ → バッグ → 出発 → 上のツールバー」の順で書いてある
   そのぶん、見た目の位置はここで並べ替える
   （A画面・B画面の .title-card__tools / __name / __rule と同じやりかた）

     1 上のツールバー（← ひとつ前の画面へ戻る・サウンドON/OFF）… .title-card__tools が持っている
     2 見出し（🍪 きょうのおやつ）
     3 説明（2つ選ぼう！）
     4 おやつ6つ
     5 おやつバッグ
     6 このおやつで公園へ行く！

   ※ .cmd--start の order と margin-bottom は、
     すぐ上の「.title-card .cmd--start」で 4 と auto になっている
     こちらはあとに書いてあるぶん強いので、6 と 0 に上書きされる
     （auto のままだと、出発ボタンがカードの下へ引きはがされてしまう） */
.title-card--snack .snack-heading {
  order: 2;
}

.title-card--snack .snack-lead {
  order: 3;
}

.title-card--snack .snack-list {
  order: 4;
}

.title-card--snack .snack-bag {
  order: 5;
}

.title-card--snack .snack-go {
  order: 6;
  margin-bottom: 0;
}

/* 見出し（🍪 きょうのおやつ）
   ゲームのタイトル（36px）ほど大きくはしない
   この画面の主役はおやつのカードなので、見出しは一段ひかえめにする */
.snack-heading {
  margin: 0 0 10px;
  color: var(--navy);
  font-size: 26px;
  line-height: 1.35;
}

/* 説明（公園へ持っていくおやつを2つ選ぼう！）
   B画面の説明文（.title-card__rule）と同じ考えで、本文より少し大きめ
   ただし枠で囲まずに、見出しのすぐ下にそえるだけにしている */
.snack-lead {
  margin: 0 0 20px;
  color: var(--ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.7;
}

/* おやつ6つの並べ方

   パソコンでは2列×3行

   3列にすると1枚が細くなり、説明文が
   「体力と機嫌をバランスよく回」＋「復」のように
   変な位置で2行に折れてしまう（日本語には単語の区切りが無いため）

   2列なら1枚の文字幅が329pxとれるので、
   いまの6つの説明はぜんぶ1行で収まり、折り返しが起きない
   縦には1行ぶん長くなるが、1枚の背が低くなるので、
   6種類を見比べるのに必要なスクロールの量はほとんど変わらない

   minmax(0, 1fr) の 0 が大事
   ふつうの 1fr は「中身より小さくならない」ので、
   説明文が長いおやつがあると、その列だけ広がって列の幅がそろわなくなる
   0 にしておくと、どの列も同じ幅になる
   （ゲーム画面の .command などでも同じ書き方をしている） */
.snack-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

/* おやつ1つぶんのカード（カードまるごとが1つのボタン）

   ・box-sizing: border-box
     このゲームはふだん border-box にしていないが、ここは付けておく
     grid の列にきっちり収めるため（padding と枠のぶんで列からはみ出さない）

   ・align-items: center ＋ text-align: center
     絵文字・名前・説明を、たてに中央ぞろえでならべる

   色はB画面の「はじめの画面へ戻る」と同じ考えで、
   白い紙＋うすい水色のふち。紺色の文字にして、画面から浮かないようにする */
.snack-option {
  position: relative;
  display: flex;
  box-sizing: border-box;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 14px 12px;
  border: 2px solid var(--navy-line);
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--paper);
  color: var(--navy);
  font-family: inherit;
  line-height: 1.5;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

/* 絵文字と名前の行（「🍇 グミ」）

   align-items: center で、大きい絵文字と小さい名前の
   まんなかの高さをそろえる（名前が下にずり落ちて見えないようにする）

   この行の高さは、背の高いほう＝絵文字の32pxぶんだけ
   たてに積んでいたころ（絵文字32px＋すきま2px＋名前26px＝60px）より
   1枚あたり28pxひくくなる（6枚だとカード全体で80pxちかく変わる） */
.snack-option__head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.snack-option__icon {
  font-size: 27px;
  line-height: 1.2;
}

.snack-option__name {
  font-size: 17px;
  font-weight: 700;
}

/* おやつの説明（「機嫌が大きく回復」など）

   カードの中身はぜんぶ中央ぞろえ（.snack-option の text-align: center のまま）

   ■ 変な位置で改行させないための決め手は、カードの幅のほう

     日本語には英語のような「単語の区切り」が無いので、
     幅が足りないとブラウザはどこででも行を変えてしまう
     3列にしていたときは、1枚の文字幅が206pxしかなく、こう切れていた

       体力と機嫌をバランスよく回 ／ 復     ← 1文字だけ次の行に落ちる
       おなかがいっぱいになって体 ／ 力が回復 ← 「体力」が2つに割れる

     文字を大きくするほど、この切れ方はひどくなる
     そこで2列にして、1枚の文字幅を329pxまで広げた
     いまの6つの説明はいちばん長いもの（18文字＝270px）でも収まるので、
     そもそも改行が起きない＝変な位置で切れようがない
     （列の数は .snack-list のところで決めている）

   ■ text-wrap: balance は、これから先のための保険

     説明を長くしたり、さらに文字を大きくしたときには、
     どうしても2行になることがある
     そのときブラウザに「2行の長さをできるだけそろえて」とお願いしておくと、
     上のような「最後の1文字だけ落ちる」形になりにくい
     （対応していないブラウザでは、ただ無視されるだけなので置いても害はない） */
.snack-option__text {
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
  text-wrap: balance;
}

/* おやつごとの回復量

   おやつを選ぶときにいちばん見くらべたい数字なので、
   説明文と同じ大きさ（15px）まで上げて、はっきり読めるようにしてある

   ・色は紺色（--navy）
     説明文（--ink のグレー）と同じ色・同じ大きさにすると、
     2行が同じ見た目になって、どちらが数字の行か分からなくなる
     紺色は、この画面の「1 / 2」（おやつバッグの数）にも使っている色なので、
     新しい色を増やさずに「ここは数字の行」と分けられる

   ・中央ぞろえ … 上の説明文とちがって「体力 +5 ／ 機嫌 +20 ／ 5分」と
                  区切りのある短い1行なので、まんなかでも読みにくくならない
                  （カードの下のほうに、ぴたっと収まって見える）

   ・margin-top: auto … この行から下（回復量と「✓ 選択中」）を、
                        カードのいちばん下へ押しつける
                        説明文が1行のカードと2行のカードが横にならんでも、
                        回復量と ✓ の高さがそろうので、6種類を見比べやすい
                        （grid の同じ行のカードは、高さがそろえられるため
                          説明文が短いカードには下に余りができる。
                          その余りを、この auto がぜんぶ上に持ってくる） */
.snack-option__effect {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px 8px;
  padding-top: 6px;
  color: var(--navy);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

/* 回復量の1項目（「体力 +18」など）

   white-space: nowrap で、1つの項目の中では絶対に折り返さないようにする
   カードの幅が足りないときは、項目と項目のあいだで行が変わる */
.snack-option__stat {
  white-space: nowrap;
}

/* 項目の区切り「／」

   最後の項目には付けない（うしろに何も続かないため）

   色だけ、数字より うすい水色（--navy-line）に落としてある
   区切りは「ここで切れている」と分かればよいもので、読むものではない
   同じ濃さのままだと「／」まで数字と同じ強さで目に入ってきて、
   かんじんの「体力 +18」が読み取りにくくなる

   ※ 「／」を次の項目の前ではなく、前の項目のうしろに付けるのが大事
     前に付けると、折り返したときに「／」が次の行のあたまに来てしまう
     うしろに付けておけば、「／」はいつも前の項目にくっついたまま残る */
.snack-option__stat:not(:last-child)::after {
  margin-left: 6px;
  color: var(--navy-line);
  content: '／';
}

/* PCでカーソルを当てたとき（押せるカードだけ）
   :not(:disabled) を付けて、押せないカードは動かないようにしている */
.snack-option:not(:disabled):hover {
  border-color: var(--navy);
  background: #f2f9fd;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgb(42 118 143 / 22%);
}

.snack-option:not(:disabled):active {
  border-bottom-width: 2px;
  transform: translateY(2px);
  box-shadow: none;
}

/* いま選んでいるおやつ

   「✓ 選択中」のような札は出さず、カードの見た目だけで伝える
   札を出すと、その置き場所のぶんだけカードが縦に大きくなるため

   そのかわり、2つ重ねてはっきり変える
   ① ふちを紺色にして、内がわにもう1本（inset 2px）重ねた二重線にする
   ② 背景をうすい水色にする

   ①は「色」ではなく「線の太さ」の変化なので、
   色の見分けがつきにくい人にも、選んでいるカードが分かる

   色は上部バーと同じ紺色と、ゲージに使っているそらいろの系統だけ
   新しい原色を足さないので、画面から浮かない

   ※ 何を選んだかは、下の「🎒 おやつバッグ」にも名前で出る */
.snack-option--selected {
  border-color: var(--navy);
  background: #d8ecf9;
  box-shadow: inset 0 0 0 2px var(--navy);
}

.snack-option--selected:not(:disabled):hover {
  background: #d8ecf9;
}

/* 押せないカード（バッグがいっぱいで、まだ選んでいないおやつ）

   うすくして、カーソルも「押せません」の形に変える
   選んであるカードは押せるままなので、
   どれかを解除すれば、またここが押せるようになる */
.snack-option:disabled {
  border-color: #dbe4ee;
  background: #f6f7f9;
  opacity: 55%;
  cursor: not-allowed;
}

.snack-option:focus-visible {
  outline: 3px solid var(--navy);
  outline-offset: 2px;
}

/* おやつバッグ（いま選んでいるおやつを見せるところ）

   B画面の説明文（.title-card__rule）と同じ、うすい青の枠を使う
   「この画面の中のひとまとまり」に見えるので、新しい見た目を増やさずにすむ */
.snack-bag {
  padding: 12px 18px;
  border-radius: 14px;
  background: #f2f6fb;
  text-align: left;
}

.snack-bag__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
}

.snack-bag__title {
  color: var(--navy);
  font-size: 16px;
  font-weight: 700;
}

/* 「0 / 2」「2 / 2」の数
   ここだけ数字を大きくして、あと何個選べるかが目に入るようにする */
.snack-bag__count {
  color: var(--navy);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

/* 選んだおやつの名前（🍇 グミ など）
   list-style: none ＋ padding-left: 0 で、ul の「・」と左の余白を消す

   min-height は「バッグの中身が増えても、高さを変えないため」

   ここは中身が3通りに入れかわる場所
     0個 …「まだ選んでいません」の1行
     1個 … おやつの名前の札1つ
     2個 … おやつの名前の札2つ（横にならぶので、高さは1個のときと同じ）

   何もしないと、文字の行（約24px）と札の行（約34px）で高さがちがうので、
   1つめを選んだしゅんかんにバッグが約10px伸びる
   バッグが伸びると、その下の「このおやつで公園へ行く！」も押し下げられ、
   カード全体がふくらんで、画面がガタッと動いてしまう

   そこで、いちばん高くなる「札の行」の高さを最初から確保しておく
   こうすると 0個 → 1個 → 2個 と選んでも、バッグの高さは変わらない
   （下の .snack-bag__empty にも同じ値を入れてそろえている） */
.snack-bag__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  min-height: 34px;
  margin: 8px 0 0;
  padding-left: 0;
  list-style: none;
}

.snack-bag__item {
  padding: 3px 12px;
  border: 1px solid var(--navy-line);
  border-radius: 999px;
  background: rgb(255 255 255 / 75%);
  color: var(--navy);
  font-size: 15px;
  font-weight: 700;
}

/* まだ1つも選んでいないとき
   「空っぽ」と分かるように、やわらかい色にしておく
   （14px だと読みづらかったので、おやつの札（15px）より少し大きい 16px にしている）

   min-height は、すぐ上の .snack-bag__list と同じ値にそろえてある
   （おやつを選んだしゅんかんにバッグの高さが変わらないようにするため）
   display: flex ＋ align-items: center は、
   その確保した高さの中で、文字をまんなかに置くためのもの */
.snack-bag__empty {
  display: flex;
  align-items: center;
  min-height: 34px;
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 16px;
}

/* 「このおやつで公園へ行く！」

   見た目はB画面の「きょうのおやつを選ぶ」と同じ金色のボタン（.cmd--start）
   上のおやつバッグと近づきすぎないように、すき間だけ足している */
.snack-go {
  margin-top: 14px;
}

/* まだ2種類そろっていないとき（押せない）

   金色のままだと押せそうに見えてしまうので、
   色をぬいて、カーソルも「押せません」の形に変える
   （水色の光も、すでにある .cmd:disabled::after の指定で消える）

   ※ どうすれば押せるようになるかは、
     すぐ上のおやつバッグの「1 / 2」を見れば分かる */
.snack-go:disabled {
  border-color: #d7dde5;
  background: #eef1f5;
  color: var(--ink-soft);
  cursor: not-allowed;
}

/* 押せないあいだは、浮き上がる動きも止める
   （.cmd:hover の transform / box-shadow を打ち消す） */
.snack-go:disabled:hover {
  transform: none;
  box-shadow: none;
}

/* 押せないあいだは、選択カーソル「▶」も出さない
   （.cmd--single:focus::before で出てしまうため） */
.snack-go:disabled::before {
  opacity: 0;
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

/* ゲームタイトルと音ボタンを、同じ1行に並べるための入れもの
   新しい行を増やさないので、上部ステータスの高さは今までと変わらない */
.status-area__titleRow {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ===== サウンドのコントロール（ミュートボタン ＋ 音量スライダー） =====

   [ 🔊  ━━━━●━━ ]  … サウンドON
   [ 🔊× ━━━━●━━ ]  … ミュート（スピーカーの右どなりに「×」が出る。重ねない）

   ■ 枠はひとつ
     ミュートボタンとスライダーは「音の設定」というひとつのまとまりなので、
     丸い枠（pill）も1つだけにして、その中に2つを入れている
     枠を持っているのは .sound-control のほうで、
     中のボタン（.sound-toggle）は自分の枠も背景も持たない

   ■ 文字を出さない
     前は「🔊 サウンド ON / OFF」と文字も出していたが、
     となりに音量スライダーを置くため、アイコンだけの小さなボタンにした
     何のボタンかは、読み上げ用の aria-label と、
     hover / focus のときだけ出る小さな吹き出し（.sound-control__tooltip）で伝える

   ■ 色について
     これは「設定」なので、選択中コマンドの水色発光のようには目立たせない
     ONを緑・OFFを赤にはしない
     （このゲームでは 緑＝良い変化 / 赤＝あぶない という意味が決まっているため、
       音の設定に使うと意味を取りちがえてしまう）
     navy と 水色 だけの、中立的な見た目にしている

   ■ 大きさの決めかた
     下の3つの値（--sound-〜）だけで、ボタンもアイコンもスライダーも決まるようにしてある
     置き場所ごとに変えたいときは、この3つを書きかえるだけでよい
     ・ここ（初期値）        … ゲーム画面の上部バー用（いちばん小さい）
     ・.title-card__tools    … タイトル画面（A/B）・おやつ選択・あそびかた用（ひとまわり大きい）
     ・@media (max-width: 600px) … スマホ用（スライダーだけ短くする）
*/
.sound-control {
  --sound-button-size: 30px;
  --sound-icon-size: 17px;

  /* ゲーム画面の上部バーは、右にゲージやおでかけポイントがならぶので、
     「×」を大きくしたぶんは、スライダーを少し短くして場所を返している
     （タイトル画面のほうは場所に余裕があるので、下の .title-card__tools で長いまま） */
  --sound-slider-width: 80px;

  display: inline-flex;
  box-sizing: border-box;
  flex: none;
  align-items: center;
  gap: calc(var(--sound-icon-size) * 0.18);
  height: var(--sound-button-size);
  padding: 0 calc(var(--sound-icon-size) * 0.42);
  border: 1px solid var(--navy-line);
  border-radius: 999px;
  background: rgb(255 255 255 / 55%);
  color: var(--navy);
}

/* ミュートボタン（枠の中の左がわ・🔊 と × のところ）

   枠と背景は外がわの .sound-control が持っているので、
   ここは「押せるところ」だけを受け持つ（枠なし・背景なし）
   色も枠から受けつぐので、濃い青の上（--bar）でも指定しなおさなくてよい

   ※ クラス名は .sound-toggle のまま
     キーボード操作のよけ方（handleKeydown）や、おやつ選択画面の矢印キーの行き先が
     この名前で探しているので、名前を変えずにそのまま使っている */
.sound-toggle {
  position: relative; /* 吹き出し（.sound-control__tooltip）の置き場所の基準になる */
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 calc(var(--sound-icon-size) * 0.12);
  border: 0;
  border-radius: 999px;
  background: none;
  color: inherit;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition: transform 0.1s ease;
}

/* ※ マウスを乗せたときに、背景の色は変えない

     枠（.sound-control）の中に、色のちがう四角がふっと出ると、
     スライダーと2つに分かれて見えてしまい、ひとつのまとまりに見えなくなる
     マウスが乗っていることは
     ・カーソルの形が変わる（cursor: pointer）
     ・すぐ下に吹き出しが出る（.sound-control__tooltip）
     の2つで、じゅうぶんに分かる

   押した瞬間：ほんの少しだけ沈む（cmdボタンほど大きくは動かさない） */
.sound-toggle:active {
  transform: translateY(1px);
}

/* Tabキーで移動してきたとき、どこにいるかが分かるようにする
   枠のすぐ内がわに出したいので、offset をマイナスにしている
   （外に出すと、外がわの枠と二重の輪になって見えてしまう） */
.sound-toggle:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: -1px;
}

/* スピーカーと「×」を、横にならべる入れもの（🔊×）

   「×」はスピーカーに重ねない
   重ねると、絵文字の上に印が乗って読みにくくなるので、
   見たままの「🔊×」になるように、右どなりに置いている

   ■ 押しても幅が変わらないようにする工夫（ここが大事）
     ON用（🔊）とOFF用（🔊×）を、grid で同じマスに重ねて置いている
     マスの幅は「中身のうち、いちばん広いもの」＝ 🔊× に、ブラウザが自動でそろえてくれる
     いま使わないほうは visibility で見えなくするだけ（場所は残る）なので、
     押しても幅はいつも同じまま
     ＝ となりのスライダーも、上部ステータスのゲージも、1pxも動かない

     前は「🔊× はこれくらいの幅だろう」と数字で決めていた（min-width）が、
     絵文字の幅は使う機械やブラウザでちがうので、
     少しはみ出したときに、ミュートのときだけ右へずれてしまっていた
     ここは数字で決めず、実物に測らせるのが正しい

   ■ ONのとき、右だけ不自然に空いて見えないようにする工夫
     重ねた2つは、どちらも justify-content: center で中身を真ん中にそろえている
     そのため、ONのときの 🔊 はマスの真ん中に出る（右だけが空いて見えない） */
.sound-toggle__icon {
  display: grid;
  font-size: var(--sound-icon-size);
  line-height: 1;
}

/* 重ねて置く2つ（ON用・OFF用） */
.sound-toggle__state {
  display: inline-flex;
  grid-area: 1 / 1; /* 2つとも同じマスに置いて重ねる */
  align-items: center;
  justify-content: center;
  gap: calc(var(--sound-icon-size) * 0.1);
}

/* いま使わないほうを見えなくする（場所はそのまま残る）
   aria-pressed は true = サウンドON、false = サウンドOFF（＝ミュート） */
.sound-toggle[aria-pressed='true'] .sound-toggle__state--off,
.sound-toggle[aria-pressed='false'] .sound-toggle__state--on {
  visibility: hidden;
}

.sound-toggle__speaker {
  line-height: 1;
}

/* ミュートの「×」（サウンドOFFのときだけ見せる）

   ■ 斜めの線だけの表しかたにしない
     ミュートの絵文字 🔇 は「斜めの線」だけなので、小さく出すと
     音が出ない状態なのかどうかが、ぱっと見では分かりにくい
     そこで、スピーカーはONでもOFFでも同じ絵文字のままにしておいて、
     OFFのときだけ、右どなりに「×」を出す（🔊×）

   ■ 見えなくならないようにする工夫
     ・大きさはスピーカーと同じくらい（アイコンの105%）にして、はっきり見せる
       「×」のほうが絵文字より細いので、同じ数字だと小さく見えてしまうため、少し大きめにしてある
     ・太字＋濃い紺色で、うすい下地の上でもはっきり読めるようにしている

   ※ ここを大きくしても、ボタンの幅は「いちばん広い中身」に合わせて自動で決まる
     （→ 上の .sound-toggle__icon）ので、レイアウトはくずれない
     出す・出さないの切りかえも、上の .sound-toggle__state のところでまとめて行っている */
.sound-toggle__muteMark {
  color: var(--navy-deep);
  font-size: calc(var(--sound-icon-size) * 1.05);
  font-weight: 900;
  line-height: 1;
}

/* ===== 音量スライダー =====

   作りかたは、サウンドトラックページの音量スライダー（.st-volume__slider）と同じ
   ・レールとつまみを、ブラウザごとに別々に指定する
   ・左（小さい側）だけ色を変えるために、下地のグラデーションを使う
     境目の位置は、画面から --volume-progress で渡している
   ちがうのは、ゲーム画面にそえる小さなコントロールなので、
   ひとまわり細く・短くしてあることだけ */
.sound-control__sliderWrap {
  position: relative; /* 吹き出しの置き場所の基準。input には吹き出しを付けられないので、外側でかこっている */
  display: inline-flex;
  align-items: center;
  transition: opacity 0.15s ease;
}

/* ※ ミュート中にスライダーを薄くする指定は、置いていない
     0% ＝ ミュートなので、ミュート中のスライダーはいつも左はし（0%）にある
     レールが空なのを見れば、音が出ない状態だとすぐ分かる
     そのうえ薄くすると、さわれないボタンのように見えてしまう */

.sound-control__slider {
  width: var(--sound-slider-width);
  height: 18px;
  margin: 0;
  padding: 0;
  background: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

/* レール（Chrome / Safari / Edge） */
.sound-control__slider::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--navy) var(--volume-progress, 100%), #d7e4f0 var(--volume-progress, 100%));
}

/* つまみ（Chrome / Safari / Edge）
   （つまみ14px − レール5px）÷ 2 ≒ 4.5px ぶん、上へずらして真ん中にそろえる */
.sound-control__slider::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -4.5px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 1px 3px rgb(35 57 94 / 35%);
  -webkit-appearance: none;
  appearance: none;
}

/* レール（Firefox） */
.sound-control__slider::-moz-range-track {
  height: 5px;
  border-radius: 999px;
  background: #d7e4f0;
}

/* 小さい側（Firefox は、はじめから塗り分ける機能がある） */
.sound-control__slider::-moz-range-progress {
  height: 5px;
  border-radius: 999px;
  background: var(--navy);
}

/* つまみ（Firefox） */
.sound-control__slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 1px 3px rgb(35 57 94 / 35%);
}

/* Tabキーで移動してきたとき、どこにいるかが分かるようにする */
.sound-control__slider:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 3px;
}

/* ===== 小さな吹き出し（hover / focus のときだけ出る） =====

   文字を常に出すかわりの案内なので、じゃまにならない大きさにしている
   ・ミュートボタン … 「サウンドをミュート」／「サウンドをオン」
   ・スライダー     … 「音量 70%」

   right: 0 … コントロールはどの画面でも行のいちばん右にあるので、
              右はしをそろえて左へのばす（画面の外へはみ出さない）
   pointer-events: none … 吹き出しが、下のボタンやスライダーの操作をじゃましないようにする
   ※ 読み上げには aria-label / aria-valuetext のほうが使われるので、
     この吹き出しは aria-hidden="true" にしてある（二重に読まれない） */
.sound-control__tooltip {
  position: absolute;
  top: calc(100% + 7px);
  right: 0;
  z-index: 6;
  padding: 5px 11px;
  border: 1px solid rgb(238 249 255 / 55%);
  border-radius: 8px;

  /* すきとおらせず、しっかり濃い紺にする
     うしろの絵（公園の背景・上部バーの青）がすけると、白い文字が読みにくくなるため */
  background: #14384a;
  box-shadow: 0 4px 12px rgb(16 29 44 / 45%);
  color: #fff;

  /* 小さすぎると読めないので、ゲームの本文に近い大きさまで上げている
     （濃い紺に白い文字なので、色の差はじゅうぶんにある） */
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: 0.03em;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.sound-toggle:hover .sound-control__tooltip,
.sound-toggle:focus-visible .sound-control__tooltip,
.sound-control__sliderWrap:hover .sound-control__tooltip,
.sound-control__sliderWrap:focus-within .sound-control__tooltip {
  opacity: 1;
}

/* ===== 上部ステータス内（濃い青の上）に置くとき =====

   枠と色は、外がわの .sound-control--bar が持つ
   中のボタンは color: inherit なので、ここで文字色を指定しなおす必要はない */
.sound-control--bar {
  border-color: rgb(134 198 221 / 70%);
  background: rgb(255 255 255 / 12%);
  color: #eef9ff;
}

/* Tabで移動してきたときの輪だけ、濃い青の上で見えるように明るくする
   （hover で背景を変えないのは、明るい下地のときと同じ） */
.sound-toggle--bar:focus-visible {
  outline-color: #eef9ff;
}

/* 濃い青の上では、ミュートの「×」を明るい色にする
   どちらの置き場所でも、はっきり読めるようにするため */
.sound-control--bar .sound-toggle__muteMark {
  color: #eef9ff;
}

/* スライダーも、濃い青の上で見えるように明るい色にする */
.sound-control--bar .sound-control__slider::-webkit-slider-runnable-track {
  background: linear-gradient(to right, #eef9ff var(--volume-progress, 100%), rgb(255 255 255 / 30%) var(--volume-progress, 100%));
}

.sound-control--bar .sound-control__slider::-webkit-slider-thumb {
  border-color: var(--navy-deep);
  background: #eef9ff;
}

.sound-control--bar .sound-control__slider::-moz-range-track {
  background: rgb(255 255 255 / 30%);
}

.sound-control--bar .sound-control__slider::-moz-range-progress {
  background: #eef9ff;
}

.sound-control--bar .sound-control__slider::-moz-range-thumb {
  border-color: var(--navy-deep);
  background: #eef9ff;
}

.sound-control--bar .sound-control__slider:focus-visible {
  outline-color: #eef9ff;
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

/* 「こうちゃん」と「親」の2つのまとまりを、左右に並べる場所
   PCでは 1fr : 1fr なので、左右がぴったり同じ幅になり、
   ラベル・数字・増減・ゲージの位置が左右対称にそろう */
.status-groups {
  display: grid;
  grid-area: gauges;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 18px;
}

/* ひとつのまとまり（こうちゃん／親）
   カードを重ねると高さが増えてしまうので、
   うすい背景と細い枠だけで「ここまでが同じ人」と分かるようにしている */
.status-group {
  padding: 4px 10px 6px;
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: 8px;
}

/* 人の区別は、うすいベージュ と うすい青 の弱い差だけでつける
   ※ 赤や緑は「増えた・減った」を表す色なので、人の見わけには使わない */
.status-group--child {
  background: rgb(255 240 214 / 14%);
}

.status-group--parent {
  background: rgb(206 232 247 / 16%);
}

/* 「こうちゃん」「親」の見出し

   前は 10.5〜12px で、中の項目ラベル（13〜15px）より小さかった
   見出しのほうが小さいと「まとまりの名前」だと伝わらないので、
   ・文字を大きく（13〜15px）
   ・色を白にしてはっきりさせる
   ・うすい札（チップ）の形にして、数字の行と見た目を分ける
   の3つで目立たせている

   ※ 札にしても、増える高さは数pxだけ
     display: inline-block なので、文字の長さぶんだけ横に広がる
     （「親」の1文字でも、左右の余白で読みやすい大きさになる）
*/
.status-group__name {
  display: inline-block;
  margin: 0 0 3px;
  padding: 1px 12px;
  border-radius: 999px;
  background: rgb(255 255 255 / 20%);
  color: #fff;
  font-size: clamp(13px, 1.05vw, 15px);
  font-weight: 700;
  letter-spacing: 0.1em;
  line-height: 1.5;
}

/* まとまりの中の2項目（横に並べる）
   ここを縦積みにすると上部ステータスの高さが倍になってしまうので、
   PCでは必ず横に2つ並べる */
.status-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  /* 「ぐずりだす／ライン」のように語の途中で折り返らないようにする
     せまいときは、2つの説明のあいだで折り返る */
  white-space: nowrap;
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
  /* 中央エリアの中では、基本的にどのカードも縮ませない
     縮ませてしまうと、場所の説明もコマンドも一緒につぶれてしまうため
     （縮んでよいのは、次の .stage > .result-card だけ） */
  flex: none;
  width: 100%;
  max-width: var(--stage-width);
}

/* 結果カードだけは縮んでよい

   flex: 0 1 auto ＝ 「大きくはならないが、小さくはなってよい」
   場所のカードとコマンドボックスが縮まないので、
   高さが足りないときに縮むのは結果カードだけになる
   → コマンドボックスがいつも画面の中に残る

   ※ セレクタを .stage > .result-card にしているのは、
     すぐ上の .stage > * より強くして、確実に上書きするため
*/
.stage > .result-card {
  flex: 0 1 auto;
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

.place-card__text {
  margin: 0;
  font-size: 17px;
  line-height: 1.8;
}

/* 秘密の場所 */
.place-card--secret {
  border-color: #e6dbfa;
  border-left-color: #8f6ad4;
  background: #f9f4ff;
}

.place-card--secret .place-card__title {
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

/* いやいやが続いているあいだだけ、カードをゆっくり上下にバウンスさせる
   「まだ こうちゃん は いやいや中ですよ」を、ずっと伝えつづけるための動き

   ※ 動きを減らす設定（prefers-reduced-motion）のときは、
     ページ下のまとめて止める指定でここも自動的に止まるので、
     ここに特別な書きたしは要らない */
.place-card--tantrum-active {
  animation: tantrum-bounce 1.2s ease-in-out infinite;
}

/* 大いやいや（レベル3）のカード

   ・枠と背景を少しだけ濃いさんご色に、見出しも少し濃くして「さっきより大変」を伝える
   ・画面ぜんたいを赤くしたり、点滅させたりはしない（子ども向けのかわいさを残す） */
.place-card--tantrum-big {
  border-color: #f2b8ae;
  border-left-color: #f2705f;
  background: #ffefeb;
}

.place-card--tantrum-big .place-card__title {
  color: #b3301f;
}

/* 大いやいやに上がった瞬間だけ、カードを小さく2回ゆらす

   ゆれ（shake：左右に5px・0.4秒）は、「いやいや発生！」の結果カードと同じものを使う
   ゆれが終わる0.8秒後から、いつものゆっくりバウンスに戻る

   ※ アニメーションはクラスが付いた瞬間にだけ始まるので、
     大いやいやのまま次の対応を選んでも、もう一度ゆれることはない（ずっとゆれつづけない）
   ※ いやいやが終わって place-card--tantrum-active が外れたら、動きも止まる
   ※ 動きを減らす設定のときは、ページ下の prefers-reduced-motion の指定で止めている */
.place-card--tantrum-big.place-card--tantrum-active {
  animation:
    shake 0.4s ease-in-out 2,
    tantrum-bounce 1.2s ease-in-out 0.8s infinite;
}

/* 見出しの前の顔（😫 / 😭 / 😭💥） */
.tantrum-title__icon {
  margin-right: 6px;
}

/* いやいやタイムの、こうちゃんのセリフ（「おなかすいた〜！」など）
   様子の文より少し大きく太くして、まずセリフが目に入るようにする
   色は、いやいやタイムの見出しとそろえている */
.tantrum-voice {
  margin: 0 0 4px;
  color: #c9412f;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.6;
}

/* とつぜんのできごと（急に起きた出来事のカード）
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

/* 「とつぜんのできごと！」の帯
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
/* 行動の結果カード

   前は .stage（中央エリア）ぜんぶがスクロールしていたので、
   結果カードが縦に長くなると、いちばん下にあるコマンドボックスが
   画面の外へ押し出されてしまい、スクロールしないと次の行動を選べなかった

   そこで、たてに積む flex にして「中身が多いときだけ縮む」形にしている
   ・display: flex + column … 中の要素をたてに並べる
   ・min-height: 0          … 「中身より小さくなってよい」という意味
                              これが無いと、縮まずに画面を押し広げてしまう

   ※ このカード自体には overflow を付けないこと
     「結果」のバッジ（.result-card__title）は top: -14px で
     カードの上へわざとはみ出しているので、
     ここで overflow を付けるとバッジが途中で切れてしまう

     そこで、バッジ以外の中身を .result-card__body で包み、
     そちらをスクロールさせている（下を参照）
*/
.result-card {
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
  animation: result-in 0.3s ease-out;
  padding: 26px 28px 22px;
  border: 2px dashed #f2dcae;
  border-radius: 14px;
  background: #fffaeb;
}

/* 結果カードの中身（「結果」バッジ以外ぜんぶ）

   高さが足りないときは、ここがまとめてスクロールする
   バッジは この外側（.result-card の直下）にあるので、
   スクロールしても切れずに残る

   ・min-height: 0    … 「中身より小さくなってよい」という意味
   ・overflow-y: auto … はみ出したぶんだけスクロールバーが出る
                        （収まっているときは何も出ない）
*/
.result-card__body {
  min-height: 0;
  overflow-y: auto;
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
  font-size: 17px;
  line-height: 1.8;
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

/* 「今回の変化（合計）」の見出し
   下の こうちゃん／親／おでかけ より小さいとおかしいので、
   こちらも少し大きくしている */
.change-box__title {
  margin: 0 0 8px;
  color: #8a6a1e;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

/* 「今回の変化」を こうちゃん／親／おでかけ の3つに分けて横に並べる場所 */
.change-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

/* ひとつのまとまり */
.change-group {
  padding: 5px 8px 7px;
  border: 1px solid #f0e2c8;
  border-radius: 10px;
}

/* 人の区別は、上部ステータスと同じ うすいベージュ と うすい青 でそろえる
   ※ 赤や緑は増減の色なので、ここでは使わない */
.change-group--child {
  border-color: #efe2c8;
  background: #fffaf0;
}

.change-group--parent {
  border-color: #d9e9f3;
  background: #f5fbff;
}

/* おでかけは人ではないので、中立的な紙の色にする */
.change-group--outing {
  border-color: #e8e0d2;
  background: var(--paper);
}

/* 「こうちゃん」「親」「おでかけ」の見出し

   前は 11.5px で、中の項目ラベル（12px）より小さかった
   見出しのほうが小さいと「まとまりの名前」だと伝わらないので、
   上部ステータスの見出しと同じ考えかたで目立たせている
   ・文字を大きく（11.5px → 13.5px）
   ・うすい札（チップ）の形にして、数字の行と見た目を分ける

   ※ 札の色は3つとも同じ（紺色のうすい札）
     こうちゃん／親／おでかけ の区別は、枠の背景色でついているので、
     見出しの色まで変えると、かえってごちゃごちゃして見えるため
*/
.change-group__name {
  display: inline-block;
  margin: 0 0 5px;
  padding: 1px 10px;
  border-radius: 999px;
  background: rgb(42 118 143 / 13%);
  color: var(--navy);
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.5;
}

/* まとまりの中の項目は、たてに積む（1グループ2つまで） */
.change-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 5px;
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

/* 「今回のランク」の小さなラベル
   総合スコアの「総合スコア」ラベルと、わざと同じ見た目にしてそろえている */
.ending-card__rank-label {
  margin: 0 0 6px;
  color: #a07a2a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

/* ランクのバッジ
   ・min-width で、Dランクでも S+ランクでも同じ大きさに見えるようにする
   ・box-sizing: border-box にしているので、padding をふくめた幅が
     max-width: 100% におさまり、せまい画面でもカードからはみ出さない
   ・色は上部バーと同じ --navy と --gold を使って、画面から浮かないようにする */
.ending-card__rank {
  animation: rank-in 0.5s ease-out 0.12s backwards;
  display: inline-block;
  box-sizing: border-box;
  min-width: 180px;
  max-width: 100%;
  margin: 0 0 14px;
  padding: 10px 26px;
  border: 3px solid var(--gold);
  border-radius: 14px;
  background: var(--navy);
  box-shadow: 0 3px 0 rgb(34 105 129 / 35%);
  color: var(--gold);
  font-size: clamp(30px, 3vw, 36px);
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.25;
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
  font-size: 16.5px;
  line-height: 1.8;
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
  /* ランクのバッジを大きくしたぶん、ここの下の余白は少しつめる
     （カード全体が縦に長くなりすぎないようにするため） */
  margin: 0 0 10px;
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

/* S+ランクのときだけ出す、うた入りエンディングBGMの小さな表示
   主役（スコア・ランク・結果の文）より目立たないよう、結果の文の下に小さな帯で出す
   ・ランクのバッジと同じ rank-in の動きで、少しおくれて、ふわっと出す
   ・せまい画面では「お知らせ」と「曲名」が2行に分かれる（flex-wrap）
     2行になっても形がくずれないよう、角の丸みは まんまるにせず 12px にしている */
.ending-card__song {
  animation: rank-in 0.5s ease-out 0.6s backwards;
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0 6px;
  box-sizing: border-box;
  max-width: 100%;
  margin: 12px 0 0;
  padding: 4px 14px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: rgb(255 255 255 / 60%);
  color: #8a5a00;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
}

/* はじめて解放したときだけ、金色のふちを付けて「ごほうび」だと分かるようにする */
.ending-card__song--new {
  border-color: var(--gold);
  background: #fffaf0;
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
  font-size: 15px;
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
  font-size: 16.5px;
  line-height: 1.8;
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
  font-size: 15px;
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
  font-size: 15px;
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

/* --- いやいや継続中：いやいやタイムのカードをゆっくり上下にバウンスさせる ---

   上の shake とは役割がちがう
   ・shake          … 「いやいや発生！」の“瞬間”の演出（左右に2回だけ揺れて止まる）
   ・tantrum-bounce … 「まだいやいや中ですよ」の“継続”の演出（終わるまでくり返す）

   くり返し動きつづけるので、はねる高さは6pxだけ、
   1.2秒かけてゆっくり1回、にしている
   （速く大きく animation させると、読んでいる文字が目で追えなくなるため）
*/
@keyframes tantrum-bounce {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-6px);
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

/* ============================================================
   いやいや発生の演出（画面いっぱいのオーバーレイ）

   新しいいやいやが始まった瞬間だけ、2秒ほど出して自動で消える
   ・背景は少しだけ暗くするていど（こわい警告画面にはしない）
   ・まるい角とパステルの色で、子ども向けゲームらしい見た目にする

   ※ pointer-events: none を付けているので、
     この演出が出ているあいだも、下のボタンはふつうに押せる
     （ゲームの進みを止めない「見た目だけの演出」にするため）
   ============================================================ */
.tantrum-alert {
  display: grid;
  position: fixed;
  z-index: 1000;
  inset: 0;
  place-items: center;
  padding: 24px;
  animation: tantrum-alert-in 0.2s ease-out;
  background: rgb(16 29 44 / 22%);
  pointer-events: none;
}

/* 中央に出すカード
   結果カードやタイトルカードと同じ「紙の色＋太めのまるい枠」でそろえて、
   いやいや関連の色（--parent-calm ＝ さんご色）で囲む
*/
.tantrum-alert__content {
  max-width: 100%;
  padding: 26px 46px;
  border: 4px solid var(--parent-calm);
  border-radius: 26px;
  animation: tantrum-alert-pop 0.55s ease-out;
  background: var(--paper);
  box-shadow: 0 12px 0 rgb(35 57 94 / 18%);
  text-align: center;
}

/* 「いやいや発生！」…… いちばん目立たせる */
.tantrum-alert__title {
  color: #c9412f;
  font-size: 40px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.06em;
}

/* --- いやいや発生の演出：背景はふわっと出すだけ --- */
@keyframes tantrum-alert-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* --- いやいや発生の演出：中央のカードが「ぽよん」と出る ---

   小さい → 少し大きくなる → ふつうの大きさに戻る、という動き
   あわせて、ほんの少しだけ左右にかたむける
   （画面ぜんぶをゆらす派手な動きは使わない）
*/
@keyframes tantrum-alert-pop {
  0% {
    transform: scale(0.6) rotate(-4deg);
    opacity: 0;
  }

  45% {
    transform: scale(1.12) rotate(3deg);
    opacity: 1;
  }

  70% {
    transform: scale(0.97) rotate(-2deg);
  }

  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

/* ============================================================
   「公園の出口へ向かう？」の確認ダイアログ

   ・見た目は、いやいや発生の演出と同じ「紙の色＋太めのまるい枠」にそろえる
     枠と見出しの色は、「公園の出口へ向かう」のボタンと同じ緑
   ・うしろは少し暗くして、「いまはこのダイアログに答える場面」だと分かるようにする
   ・ボタンは、公園入口のコマンドと同じ .cmd（白）と .cmd--goal（緑）を使う
     選んでいるボタンの見た目（▶ と水色の光）も、そのままそろう

   ※ いやいや発生の演出とちがって pointer-events: none は付けない
     開いているあいだは、うしろのボタンを押せないようにしたいため
   ※ 出てくる動きは、いやいや発生の背景（tantrum-alert-in）と、
     結果カードの浮き上がり（result-in）を使いまわしている
     動きを減らす設定のときは、ページ下のまとめて止める指定で止まる
   ============================================================ */
.goal-confirm {
  display: grid;
  position: fixed;
  z-index: 1100;
  inset: 0;
  place-items: center;
  padding: 24px;
  animation: tantrum-alert-in 0.2s ease-out;
  background: rgb(16 29 44 / 45%);
}

.goal-confirm__content {
  width: min(480px, 100%);
  padding: 26px 28px 24px;
  border: 4px solid #38955f;
  border-radius: 26px;
  animation: result-in 0.25s ease-out;
  background: var(--paper);
  box-shadow: 0 12px 0 rgb(35 57 94 / 18%);
  color: var(--ink);
  text-align: center;
}

/* 「公園の出口へ向かう？」 */
.goal-confirm__title {
  margin: 0 0 10px;
  color: #2f7d4f;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.4;
}

.goal-confirm__text {
  margin: 0;
  font-size: 17px;
  line-height: 1.8;
}

/* 「お昼（12:00）まで、あと○分あります。」の札 */
.goal-confirm__time {
  display: inline-block;
  margin: 12px 0 0;
  padding: 3px 14px;
  border-radius: 999px;
  background: #eef7f1;
  color: #2f7d4f;
  font-size: 14px;
  font-weight: 700;
}

/* ボタン2つ（パソコンでは横にならべる：左「もう少し遊ぶ」・右「出口へ向かう」） */
.goal-confirm__buttons {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.goal-confirm__button .cmd__text {
  text-align: center;
}

/* スマホ幅では、ボタンを たてにならべる（上「もう少し遊ぶ」・下「出口へ向かう」） */
@media (max-width: 700px) {
  .goal-confirm {
    padding: 16px;
  }

  .goal-confirm__content {
    padding: 20px 18px 18px;
    border-radius: 20px;
  }

  .goal-confirm__title {
    font-size: 21px;
  }

  .goal-confirm__text {
    font-size: 16px;
  }

  .goal-confirm__buttons {
    flex-direction: column;
  }
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
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.found-flash__item {
  padding: 1px 12px;
  border-radius: 999px;
  background: var(--gold);
  color: #4a3208;
  font-size: 14px;
  font-weight: 700;
}

/* 「〜を見つけました！」の文
   アイテムの名前だけ、うすい黄色の下じきを敷いて
   地の文の中でもすぐ目に入るようにする
*/
.found-line {
  margin: 10px 0 0;
  font-size: 17px;
  line-height: 1.8;
}

.found-line__name {
  padding: 1px 8px;
  border-radius: 6px;
  background: #fff1c9;
  color: #7a5410;
}

/* アイテムごとの、こうちゃんのひとこと

   すぐ上の「〜を見つけました！」に続く1文なので、
   ・少し小さめ・やわらかい色にして、上の行を主役のままにする
   ・左に細い線を入れて「上の行に付いている文」と分かるようにする
     （線の色は「★ アイテム発見！」の帯のふちと同じ）
*/
.found-reaction {
  margin: 4px 0 0;
  padding-left: 10px;
  border-left: 2px solid #f5e2be;
  color: var(--ink-soft);
  font-size: 16px;
  line-height: 1.8;
}

/* 行動の最中に起きたちいさなできごと（ランダムイベント）

   前は結果の文章のうしろに、そのまま文字で書き足していたので、
   「おでかけポイント +5」が地の文にまぎれて気づきにくかった
   ・専用の枠（左に太い線）
   ・「ちいさなできごと！」の帯
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
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.event-flash__text {
  margin: 0;
  font-size: 17px;
  line-height: 1.8;
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
  font-size: 13px;
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
  font-size: 17px;
  line-height: 1.8;
}

/* ナイス対応の枠（いやいやの理由に合った対応をしたとき）

   形は「ちいさなできごと」（.event-flash）をそのまま使い、色だけ緑に変える
   ・緑 … 「今回の変化」のプラスと同じ系統の色で、良いことが起きたと分かる
   ・アイテム発見（黄色）・ちいさなできごと（水色）・いやいや（さんご）と色がかぶらない
   ※ 帯の背景は --good より少しだけ濃くして、白い文字を読みやすくしている
*/
.event-flash--nice {
  border-color: #cde9d7;
  border-left-color: var(--good);
  background: #f1faf4;
}

.event-flash--nice .event-flash__label {
  background: #26844f;
}

.event-flash--nice .event-flash__item {
  border-color: #d3eadb;
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
/* ランクの登場演出
   バッジが大きくなったので、前の scale(0.6) から広がる動きだと
   はねすぎて見える
   「少し大きい状態から通常サイズにもどる ＋ 少し下からふわっと出る」
   くらいの、おだやかな動きにしている
   ※ 動きを減らす設定（prefers-reduced-motion）のときは、
     ページ下のまとめて止める指定でここも自動的に止まる */
@keyframes rank-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(1.06);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
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
  font-size: 13.5px;
  letter-spacing: 0.1em;
}

/* 選択肢1つぶん
   大きなボタンには見せず、枠の中の「文字の行」に見えるようにする
   左の28pxは、マウスを乗せたときに出る「▶」の場所
*/
/* ============================================================
   【共通】いま選んでいるコマンドを、水色でふわっと光らせる演出

   ねらい
     キーボードで遊んでいるとき「いま Enter を押したら
     どのボタンが実行されるのか」を一目で分かるようにする

   仕組み
     ボタンの上に ::after という「透明な板」を1枚だけ重ねて、
     その板の box-shadow（内側の水色の枠＋外側の水色の光）だけを
     ゆっくり強くしたり弱くしたりする。
     ・板は透明なので、ボタン本来の色（紙／金／紫／緑）はそのまま残る
     ・box-shadow は場所を取らないので、ボタンの幅や配置はズレない
     ・pointer-events: none なので、クリックのじゃまもしない

   対象
     .cmd--selected              … 公園入口などで選んでいるボタン
     .cmd--single                … ボタンが1つだけの画面のボタン（はじめる／きょうのおやつを選ぶ）
     .command-box__item--selected … 各イベントの中で選んでいる行
   ============================================================ */

/* 水色の光の強さを 弱 → 少し強い → 弱 と往復させる
   ※ transform（動き）はここでは一切さわらない。
     hover や :active の translateY / translateX とケンカさせないため

   影は3枚がさねになっている
     1枚目 inset … ボタンのふちの内側に引く水色の線
     2枚目 0 0 0 2px … ボタンのすぐ外に引く水色の線
       ※ 水色は「紺色の下地」の上でいちばんよく見える（コントラスト4.25:1）。
         紙のボタンや金色のボタンは色が明るく、内側の線だけでは見えにくいので、
         紺色の下地に出るこの外側の線が「選択中」の目じるしの主役になる
     3枚目 ぼかし … まわりへ広がる、ふんわりした光 */
@keyframes command-selected-glow {
  0%,
  100% {
    box-shadow:
      inset 0 0 0 2px rgb(var(--command-selected) / 55%),
      0 0 0 2px rgb(var(--command-selected) / 45%),
      0 0 8px 2px rgb(var(--command-selected) / 25%);
  }

  50% {
    box-shadow:
      inset 0 0 0 2px rgb(var(--command-selected) / 95%),
      0 0 0 2px rgb(var(--command-selected) / 90%),
      0 0 16px 3px rgb(var(--command-selected) / 55%);
  }
}

.cmd--selected::after,
.cmd--single::after,
.command-box__item--selected::after,
.care-menu__item--selected::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  content: '';

  /* クリックのじゃまをしない、透明な板にする */
  pointer-events: none;

  /* アニメーションが止まっているときに残る「水色の枠」
     （動きを減らす設定のときは、光の強弱が無くなり、この枠だけが表示される） */
  box-shadow:
    inset 0 0 0 2px rgb(var(--command-selected) / 85%),
    0 0 0 2px rgb(var(--command-selected) / 75%);

  /* 1.4秒かけてゆっくり。点滅ではなく「ふわっと光っている」速さ */
  animation: command-selected-glow 1.4s ease-in-out infinite;
}

/* .cmd は枠（上・左右2px／下だけ4px）を持っているので、
   そのぶん外へ広げて、水色の線をボタンのふちにぴったり重ねる。
   選択中はボタンのふちが水色に変わって見えるが、
   ボタン本体の色（紙・金・紫・緑）はそのまま残る */
.cmd--selected::after,
.cmd--single::after {
  inset: -2px -2px -4px;
}

/* 押している最中は光を止める
   （光が強いままだと「押しこんだ」感じが分からなくなるため） */
.cmd:active::after,
.command-box__item:active::after,
.care-menu__item:active::after {
  animation: none;
}

/* 押せないボタンは光らせない（押せると勘ちがいさせないため）
   ※ いまのゲームに disabled のボタンは無いが、
     あとから増えたときのための保険として書いておく */
.cmd:disabled::after,
.command-box__item:disabled::after,
.care-menu__item:disabled::after {
  display: none;
}

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
  font-size: 17px;
  line-height: 1.6;
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

/* 選択カーソル「▶」（選ばれていない行では見えない）

   top: 50% ＋ translateY(-50%) で、行のたての中央に置く
   ・top: 50%              … 行の高さの半分の位置まで下げる
   ・translateY(-50%)      … そこから自分の高さの半分だけ上へ戻す
   この2つで、文字の大きさが変わっても中央のままになる

   ※ これを書かないと、行が align-items: baseline なので
     カーソルが文字のベースラインに合わせて少し上に出てしまう
*/
.command-box__item::before {
  position: absolute;
  top: 50%;
  left: 9px;
  transform: translateY(-50%);
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
  font-size: 12.5px;
  font-weight: 400;
}

/* おやつを食べきったときのお知らせ */
.command-box__note {
  margin: 0;
  padding: 6px 10px 6px 28px;
  color: #b8dfef;
  font-size: 14px;
  line-height: 1.7;
}

/* 「その場所ならではの遊び」と「どこでも同じコマンド」の区切り

   同じ「どうする？」の枠の中にならんでいても、
   上の2つ（すべる・見守る など）と
   下の2つ（休憩・おやつ／← 場所選びにもどる）は種類がちがう

   そこで、あいだに細い線と「そのほか」という小さな見出しを入れて、
   ひとめで「ここからは別のなかま」と分かるようにしている

   「そのほか」の文字は左寄せにして、上下のコマンドの文字と
   左はしをそろえてある
   ・左の線 … 10px の短いちょこんとした線
   ・左の余白10px ＋ 線10px ＋ すきま8px ＝ 28px
     （コマンドの文字も、カーソル「▶」のぶんだけ左に28px空いている） */
.command-box__divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 10px 4px 10px;
  color: #a9d6e8;
  font-size: 11.5px;
  letter-spacing: 0.08em;

  /* 見出しなので、コマンドとまちがえて押されないようにする
     （もともとボタンではないが、指やマウスの反応も消しておく） */
  pointer-events: none;
}

/* 「そのほか」の左右にのばす細い線

   文字のそばを濃く、外側へいくほど薄くしている
   見出しの下の線（command-box__label の border-bottom）より
   目立たせないための工夫で、区切りだと分かるだけの細さにとどめる */
.command-box__divider::before,
.command-box__divider::after {
  height: 1px;
  content: '';
}

/* 左の線は、のばさずに10pxのまま
   （flex: none なので、あまった幅は右の線だけが受け取る
     ＝「そのほか」の文字が左に寄る） */
.command-box__divider::before {
  flex: none;
  width: 10px;
  background: linear-gradient(90deg, rgb(134 198 221 / 0%) 0%, rgb(134 198 221 / 55%) 100%);
}

/* 右の線が、残りの幅をぜんぶ使って右はしまでのびる */
.command-box__divider::after {
  flex: 1;
  background: linear-gradient(90deg, rgb(134 198 221 / 55%) 0%, rgb(134 198 221 / 0%) 100%);
}

/* ============================================================
   横ならびの選択肢（command-box--choice-grid）

   いやいやタイム（まだ続いているとき）・とつぜんのできごと（選ぶ前）・
   秘密の小道（はじまる前）の「どうする？」だけ、選択肢を横にならべる

   これらの画面は、結果の文章や説明を ↑↓ でスクロールして読むことがあり、
   そのあいだコマンドは ← → で選ぶ
   見た目もキーの向きにそろえて「左右にならんだボタン」にしておく
   （たて1列のままだと、上下にならんでいるのに ← → で動く、というちぐはぐな形になる）

   ・command-box--choices-2 / 3 / 4 … 選択肢の数（commandCount）
     列の数は選択肢の数と同じにして、せまい画面でだけ2列に折り返す（いちばん下の媒体クエリ）
     折り返しても、← → で動く順番は左上から右下へ（0 → 1 → 2 → 3）のまま
   ・おやつバッグを開いているあいだは付けない（バッグは今までどおりたて1列＋↑↓）
   ・通常の場所の「どうする？」（.command-area の中）には付けない

   付け外しは script の choiceGridClass で決めている
   ============================================================ */
.command-box--choice-grid {
  --choice-columns: 2;

  display: grid;
  grid-template-columns: repeat(var(--choice-columns), minmax(0, 1fr));
  gap: 6px 8px;

  /* 右下の380pxの枠ではなく、上のカードと同じくらいの幅で中央に置く
     box-sizing: border-box … width: 100% に padding と border をふくめて、横にはみ出さないようにする */
  box-sizing: border-box;
  align-self: center;
  max-width: var(--stage-width);
}

.command-box--choices-3 {
  --choice-columns: 3;
}

.command-box--choices-4 {
  --choice-columns: 4;
}

/* 見出し「どうする？」と「おやつは、もうぜんぶ食べてしまいました…」は、1行をまるごと使う */
.command-box--choice-grid .command-box__label,
.command-box--choice-grid .command-box__note {
  grid-column: 1 / -1;
}

.command-box--choice-grid .command-box__label {
  margin-bottom: 2px;
}

/* おやつのお知らせは、DOMでは「だっこ」と「待つ」のあいだにあるが、
   横ならびの行を分けてしまわないように、見た目だけいちばん下へ回す
   （ボタンの順番は変わらないので、← → と Tab で動く順番もそのまま） */
.command-box--choice-grid .command-box__note {
  order: 1;
  padding-left: 10px;
}

/* 1マスぶんのボタン
   ・うすい枠で、1つ1つが別のボタンだと分かるようにする
   ・マスに入りきらない文字は、ボタンの中で折り返す
     「おやつをあげる ＞」と「残り2個」が1行に入らないときは、「残り2個」のほうを次の行へ送る
     （文字のほうが先に折り返して「＞」だけが下の行に残る、という形にしない）
   ・選んだときに右へずらす動きは、となりのマスとぶつかるので付けない */
.command-box--choice-grid .command-box__item {
  flex-wrap: wrap;
  align-items: center;
  row-gap: 0;
  width: auto;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 22%);
}

.command-box--choice-grid .command-box__text {
  flex: 1 1 auto;
}

.command-box--choice-grid .command-box__item:hover,
.command-box--choice-grid .command-box__item:focus-visible,
.command-box--choice-grid .command-box__item--selected {
  transform: none;
}

.command-box--choice-grid .command-box__item:active {
  transform: scale(0.98);
}

/* ============================================================
   コマンド欄（サブメニュー ＋ メインコマンド）

   通常の場所6か所だけ、コマンドの枠を2つならべる
   ・どうする？（command-box） … その場所ならではの遊び／紺色
   ・ひとやすみ（care-menu）   … 親子の状態を整える行動／やさしい緑

   PCでは [care-menu][command-box] の横ならび
   スマホでは横幅が足りないので、たてにならぶ（いちばん下の媒体クエリ）

   ※ いやいやタイムととつぜんのできごとでは command-box が1枚だけで、
     この .command-area を通らない
     そのため .command-box 自身の置きかた（align-self / margin-top）は
     そのまま残してあり、ここでは入れものの中だけ上書きしている
   ============================================================ */
.command-area {
  /* .stage の中では「右下」に置く（command-box が1枚だけのときと同じ位置）
     margin-top: auto で、たての余白をぜんぶ上へ寄せている */
  align-self: flex-end;
  margin-top: auto;

  display: flex;

  /* 右はしにそろえる
     こうしておくと、サブメニューが出ても command-box は動かず、
     新しい枠が その左がわ に増えるだけになる */
  justify-content: flex-end;

  /* 2つの枠の上をそろえる（下ではなく上でそろえると、見出しの行が横に並ぶ） */
  align-items: flex-start;

  /* 入りきらない幅のときは、横にはみ出さずに折り返す
     （スマホ幅になる前の、中くらいの幅のための保険） */
  flex-wrap: wrap;

  gap: 14px;

  /* .stage > * の width:100% / max-width:900px をそのまま受けとる */
}

/* 入れものの中に入った command-box は、置きかたを .command-area にゆずる

   ※ margin-top を0に戻すのが大事
     横ならび（flex-direction: row）のままだと、auto のマージンが
     たての余白をぜんぶ吸ってしまい、枠が下へ寄ってしまう
*/
.command-area .command-box {
  flex: 0 1 380px;
  min-width: 0;
  align-self: flex-start;
  margin-top: 0;
}

/* 「どうする？」の中身が入れかわったときに、ふわっと出す

   通常の場所では、結果カードが出る／「← もどる」で消えるたびに、
   「どうする？」の中身（4つのコマンド ⇄ 1つのボタン）が v-if でまるごと入れかわり、枠の高さも一気に変わる
   中身だけを短くフェードインさせて、入れかわりがカクッと見えないようにしている

   ・動かすのは opacity だけ（:active の押しこみの transform とぶつからない）
   ・選択中の光（::after の animation）は別の要素なので、そのまま動く
   ・場所に入ったときにも一度だけ動くが、場面のフェード（0.24秒）より短いので目立たない
   ・動きを減らす設定のときは、ページ下のまとめて止める指定で一瞬になる */
.command-area .command-box > * {
  animation: command-swap-in 0.18s ease-out;
}

@keyframes command-swap-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* 休憩・おやつの「← もどる」のあとや、公園入口へ戻ってきた直後、マウスを動かすまでコマンド枠をマウスで押せなくする
   ・.command-box--pointer-paused … 場所の「どうする？」
   ・.command--pointer-paused     … 公園入口の「どこへ行く？」
   （理由と、指で操作しているときは付けないことは、script の isCommandPointerPaused の説明を参照） */
.command-box--pointer-paused,
.command--pointer-paused {
  pointer-events: none;
}

/* サブメニュー「☕ ひとやすみ」の枠

   「ならべても浮かない」ことを大事にしているので、
   形・角のまるさ・文字の大きさ・選択中の見せかたは command-box とそろえ、
   ちがうのは色（紺色 → やさしい緑）と幅だけにしている
*/
.care-menu {
  /* command-box（380px）より少しせまくして、
     2つならべても1280×720の画面に収まるようにする */
  flex: 0 1 240px;
  min-width: 0;

  /* 見出し1行＋コマンド2行だけなので、command-box より少しだけ浅くする */
  padding: 10px 14px 12px;
  border: 3px solid #fff;
  border-radius: 10px;
  background: linear-gradient(180deg, var(--care) 0%, var(--care-deep) 100%);
  box-shadow: 0 6px 18px rgb(16 29 44 / 40%);
}

/* 「☕ ひとやすみ」の見出し（command-box の「どうする？」と同じ形） */
.care-menu__label {
  margin: 0 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgb(255 255 255 / 38%);
  color: #e6f6ed;
  font-size: 13.5px;
  letter-spacing: 0.1em;
}

/* 選択肢1つぶん
   command-box__item とまったく同じ形にして、
   となりの枠と続いて見えるようにしている
   左の28pxは、選ばれたときに出る「▶」の場所 */
.care-menu__item {
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
  font-size: 17px;
  line-height: 1.6;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

/* クリックしたとき、一瞬押しこまれたように見せる */
.care-menu__item:active {
  transform: translateX(4px) scale(0.98);
}

/* 選択カーソル「▶」（選ばれていない行では見えない）
   たての中央に置く考えかたは command-box__item::before と同じ */
.care-menu__item::before {
  position: absolute;
  top: 50%;
  left: 9px;
  transform: translateY(-50%);
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
.care-menu__item:hover,
.care-menu__item:focus-visible,
.care-menu__item--selected {
  background: rgb(255 255 255 / 14%);
  font-weight: 700;
  transform: translateX(3px);
}

.care-menu__item:hover::before,
.care-menu__item:focus-visible::before,
.care-menu__item--selected::before {
  opacity: 1;
}

.care-menu__item:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: -2px;
}

.care-menu__text {
  flex: 1;
}

/* おやつの残り個数（行の右はしに出す小さな文字） */
.care-menu__badge {
  flex: none;
  color: #ffe2ac;
  font-size: 12.5px;
  font-weight: 400;
}

/* おやつを食べきったときのお知らせ */
.care-menu__note {
  margin: 0;
  padding: 6px 10px 6px 28px;
  color: #cfeadd;
  font-size: 14px;
  line-height: 1.7;
}

/* ============================================================
   おやつバッグ（ゲーム中に、どのおやつを食べるか選ぶメニュー）

   新しい枠は作らず、いま出ている枠の中身だけを入れかえて使う
   ・休憩中               … ☕ ひとやすみ（care-menu）の枠の中
   ・いやいやタイム       … どうする？（command-box）の枠の中

   おやつ1つぶんの行には care-menu__item / command-box__item をそのまま付けているので、
   ▶ カーソル・水色の光・hover・focus-visible の見た目は、ほかのコマンドと同じになる
   ここで足すのは「名前の下に、効果の数字をもう1行出す」ための形だけ
   ============================================================ */

/* おやつ1つぶんの行

   ふつうのコマンドは「文字 … 右はしに残り個数」の横ならびだが、
   おやつは「🍇 グミ」の下に「体力 +5 機嫌 +20 5分」を出したいので、たてならびにする

   うすい線でかこって、ほかのコマンドより少し「カード」らしく見せる
   （線は border ではなく内側の影で引くので、行の大きさは変わらない）
   スマホで指で押しやすいように、カードとカードのあいだも少しあける */
.snack-menu__item {
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  margin-bottom: 6px;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 28%);
}

/* おやつの名前（「🍇 グミ」） */
.snack-menu__name {
  line-height: 1.5;
}

/* 効果の数字（「体力 +5」「機嫌 +20」「5分」）

   色・大きさ・太さは、いっしょに付けた care-menu__badge / command-box__badge
   （「残り2個」の文字）をそのまま使う
   ☕ ひとやすみ の枠はせまいので、3つが入りきらないときは はみ出さずに折り返す */
.snack-menu__effects {
  display: flex;
  flex-wrap: wrap;
  gap: 0 10px;
  line-height: 1.5;
}

/* --- サブメニューの開け閉め（Transition name="care-menu"） ---

   PCでは command-box の左がわに出るので、
   「少し左からすべって出てくる」動きにしている

   場面の切り替え（name="scene"）と同じくらいの軽さ（0.2秒ほど）にして、
   opacity と translateX だけを動かす
   位置やはばは変えていないので、メインコマンドはぴくりとも動かない

   ※ 動きを減らす設定（prefers-reduced-motion）のときは、
     ページ下のまとめて止める指定でここも自動的に止まる
     （transition-duration が 0.01ms になり、ぱっと出てぱっと消える）

   ※ 休憩する・おやつ・遊びを選んで結果カードが出るときは、閉じるアニメーションをしない
     （テンプレート側の <Transition name="care-menu" :css="!resultMessage"> を参照）
*/
.care-menu-enter-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}

.care-menu-leave-active {
  transition:
    opacity 0.15s ease-in,
    transform 0.15s ease-in;
}

.care-menu-enter-from,
.care-menu-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* ============================================================
   秘密の小道（こもれびの広場へ続くミニゲーム）

   こもれびの広場と同じ紫のカード（.place-card--secret）の中に、
   森の小道のフィールドを置く形にしている
   ・フィールド … まん中は土の色、左右のはしは草の色。点線でレーンを3つに分ける
   ・枝 🌿 と 木漏れ日 ✨ … JavaScript が top（上から何%か）を1コマごとに書きかえて動かす
     （CSSの animation で動かすと、動きを減らす設定のときに止まって遊べなくなるため）
   ・遊んでいる最中の操作の案内 … コマンドボックス（紺色の枠）の中に置く
   ============================================================ */

/* はじまる前の「えだをよけながら ✨ こもれびをあつめよう！」 */
.secret-path-lead {
  margin: 14px 0 0;
  padding: 10px 16px;
  border-radius: 12px;
  background: #fff;
  box-shadow: inset 0 0 0 2px #e6dbfa;
  color: #6b4fb0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.6;
  text-align: center;
}

/* 遊びかたの箇条書き（点は、うすい紫の丸） */
.secret-path-rules {
  display: grid;
  gap: 4px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

/* 説明は3行（スマホは2行）だけなので、本文より大きめの文字にして、ぱっと読めるようにする */
.secret-path-rules li {
  position: relative;
  padding-left: 20px;
  font-size: 17px;
  line-height: 1.7;
}

/* 説明のひと組（「← → / A D：左右に移動」など）
   組の途中では折り返さず、入りきらないときは組の切れ目で次の行へ送る */
.secret-path-rules__part {
  display: inline-block;
  margin-right: 1em;
}

.secret-path-rules li::before {
  position: absolute;
  top: 0.62em;
  left: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #bd9bef;
  content: '';
}

/* 遊んでいる最中のカード

   中央エリアの高さに合わせて伸び、あいた高さをフィールドにまわす
   （.stage > * の flex: none を、ここだけ上書きしている）
   max-height は、背の高い画面でフィールドが縦に長くなりすぎないようにするため */
.stage > .secret-path {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  max-height: 640px;
  padding: 14px 18px 18px;
}

/* 木漏れ日の数と残り時間
   padding-top … 残り時間の右上に出す「⏩ 1.5x」のぶん、上を少しあけておく */
.secret-path-hud {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  box-sizing: border-box;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding-top: 8px;
}

.secret-path-hud__sunlight {
  padding: 3px 14px;
  border-radius: 999px;
  background: #fff6e0;
  box-shadow: inset 0 0 0 1px #f5e2be;
  color: #7a5410;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
  transition: box-shadow 0.2s ease;
}

/* 木漏れ日を取った直後だけ、金色にふわっと光る */
.secret-path-hud__sunlight--sparkle {
  box-shadow:
    inset 0 0 0 2px var(--gold),
    0 0 12px 2px rgb(255 209 102 / 70%);
}

/* 枝に当たって木漏れ日が減った直後だけ、さんご色にふわっと光る */
.secret-path-hud__sunlight--lost {
  box-shadow:
    inset 0 0 0 2px var(--parent-calm),
    0 0 12px 2px rgb(255 163 163 / 70%);
}

.secret-path-hud__count {
  display: inline-block;
  min-width: 1ch;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  animation: status-pop 0.35s ease-out;
}

.secret-path-hud__time {
  position: relative;
  padding: 3px 14px;
  border-radius: 999px;
  background: var(--navy);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* のこり3秒からは、さんご色の濃いほうにして「もうすぐ終わり」を伝える */
.secret-path-hud__time--soon {
  background: #c9412f;
}

/* はやく進んでいるあいだの「⏩ 1.5x」（残り時間の右上に、小さく重ねて出す）

   HUD の中に並べると、スマホ幅では出たときに残り時間が次の行へ折り返して、
   フィールドががくっと下へずれてしまうので、position: absolute で並びから外している
   「あと 12秒」の文字に重ならないよう、丸の上のふちに少しだけかかる高さに置く（そのぶん HUD の上をあけている） */
.secret-path-hud__boost {
  position: absolute;
  top: -17px;
  right: -6px;
  padding: 0 7px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: #3f6b3a;
  color: #fff;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

/* フィールド（森の小道）

   ・左右のはし … 濃いめの草
   ・まん中     … 土の道（枝 🌿 の緑・木漏れ日 ✨ の黄色・こうちゃんが、色で埋もれないように茶色にする）
   ・まるい光の模様 … 地面に落ちている木漏れ日（流れてくる ✨ とまちがえないよう、うすめにする）
   ・box-sizing: border-box … 枠のぶんだけカードから横にはみ出さないようにする
   ・touch-action: none … 指でフィールドをさわっても、ページがスクロールしないようにする
   ・-webkit-touch-callout: none … iPhone で長押ししたときのメニューを出さない */
.secret-path-field {
  position: relative;
  flex: 1 1 auto;
  box-sizing: border-box;
  width: 100%;
  max-width: 460px;
  min-height: 220px;
  margin: 0 auto;
  overflow: hidden;
  border: 3px solid #4f7a46;
  border-radius: 18px;
  background:
    radial-gradient(circle at 22% 16%, rgb(255 236 170 / 30%) 0 16px, transparent 44px),
    radial-gradient(circle at 80% 40%, rgb(255 236 170 / 24%) 0 12px, transparent 38px),
    radial-gradient(circle at 36% 66%, rgb(255 236 170 / 20%) 0 14px, transparent 40px),
    linear-gradient(90deg, #4a7a40 0%, #5a8c4c 6%, #7a5a3c 7%, #a67c52 10%, #b08a60 50%, #a67c52 90%, #7a5a3c 93%, #5a8c4c 94%, #4a7a40 100%);
  box-shadow: inset 0 10px 18px rgb(38 58 30 / 35%);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

/* レーンの区切りの点線（左から 1/3 と 2/3 の位置。土の道の上で見えるよう、明るいクリーム色） */
.secret-path-field::before,
.secret-path-field::after {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  width: 3px;
  margin-left: -1.5px;
  background: repeating-linear-gradient(180deg, rgb(255 244 222 / 70%) 0 16px, transparent 16px 34px);
  content: '';
}

.secret-path-field::before {
  left: 33.333%;
}

.secret-path-field::after {
  left: 66.667%;
}

/* 道（レーン）の押せる場所（左・まん中・右の3つ）

   重なりの順番（下から）
   0 … この押せる場所（マウスを乗せたとき・押したときの明るさ）
   1 … レーンの区切りの点線
   2 … 枝・木漏れ日
   3 … こうちゃん */
.secret-path-lane {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 0;
  width: 33.334%;
  cursor: pointer;
  transition: background-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.secret-path-lane--current {
  cursor: default;
}

/* 行き先の目印（こうちゃんの高さに出す、点線の丸と矢印）
   ふだんは出さず、1回で動ける「となりのレーン」（--next）にだけ うすく出して、
   「ここを押すと、こっちへ動ける」ことが分かるようにする */
.secret-path-lane__target {
  position: absolute;
  left: 50%;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 46px;
  height: 46px;
  border: 3px dashed rgb(255 246 228 / 85%);
  border-radius: 50%;
  color: #fff6e4;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  opacity: 0;
  transform: translate(-50%, -50%);
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease;
  pointer-events: none;
}

/* となりのレーン（1回で動ける先）にだけ、目印をうすく出す
   いまいるレーンと、2つ先の遠いレーンには出さない */
.secret-path-lane--next .secret-path-lane__target {
  opacity: 0.5;
}

/* マウスを乗せたレーン（マウスなど、乗せられる端末だけ）は、少し明るくなる */
@media (hover: hover) {
  .secret-path-lane:not(.secret-path-lane--current):hover {
    background: rgb(255 255 255 / 16%);
  }
}

/* マウスを乗せたレーンを押したときの「動く先」の目印は、紺色の丸ではっきり出す
   遠いレーンに乗せているときは、まん中のレーン（1レーン先）の目印がはっきりする */
.secret-path-lane--destination .secret-path-lane__target {
  border-style: solid;
  border-color: var(--navy);
  background: rgb(255 255 255 / 85%);
  color: var(--navy);
  opacity: 1;
}

/* 押した直後のレーン（クリック・タップどちらも）は、木漏れ日の色で一瞬光る */
.secret-path-lane--flash {
  background: rgb(255 241 168 / 40%);
}

/* 流れてくる枝と木漏れ日（left と top は、レーンと y から JavaScript が入れる） */
.secret-path-item {
  position: absolute;
  z-index: 2;
  font-size: 34px;
  line-height: 1;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

/* 枝：うすいクリーム色のふちどりと、下に濃い影をつけて、草や土の色に埋もれないようにする */
.secret-path-item--branch {
  filter: drop-shadow(0 0 1.5px rgb(255 250 232)) drop-shadow(0 0 1px rgb(255 250 232)) drop-shadow(0 2px 2px rgb(40 28 12 / 60%));
}

/* 木漏れ日：こげ茶の細いふちどり ＋ 金色の光で、明るい所でも暗い所でも消えないようにする */
.secret-path-item--sunlight {
  filter: drop-shadow(0 0 1px rgb(110 64 0 / 95%)) drop-shadow(0 0 6px rgb(255 226 110));
}

/* 当たった枝は、うすくして「もう当たらない」ことが分かるようにする */
.secret-path-item--hit {
  opacity: 0.35;
}

/* こうちゃん（レーンを動くときだけ、すっと横へすべる） */
.secret-path-player {
  position: absolute;
  z-index: 3;
  transform: translate(-50%, -50%);
  transition: left 0.1s ease-out;
  pointer-events: none;
}

/* こうちゃん：白いふちどりで、土の道の上でもくっきり見えるようにする */
.secret-path-player__face {
  display: block;
  font-size: 42px;
  line-height: 1;
  filter: drop-shadow(0 0 2px rgb(255 255 255)) drop-shadow(0 3px 1px rgb(40 28 12 / 45%));
}

/* 枝に当たったとき：小さく2回ゆれる（いやいや発生の結果カードと同じ shake） */
.secret-path-player__face--bumped {
  animation: shake 0.25s ease-in-out 2;
}

/* 木漏れ日を取ったとき：金色に光る */
.secret-path-player__face--sparkle {
  filter: drop-shadow(0 0 10px rgb(255 214 90));
}

/* 「いたっ！」のふきだし（木漏れ日が減ったときは、その下に「✨ -1」も並ぶ）

   2行になっても右のレーンでフィールドからはみ出さないように、横ではなくたてに積む */
.secret-path-player__bump {
  position: absolute;
  bottom: 100%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 4px;
  padding: 1px 10px;
  border: 2px solid var(--parent-calm);
  border-radius: 12px;
  background: #fff;
  color: #c9412f;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  transform: translateX(-50%);
  animation: secret-path-pop 0.2s ease-out;
}

/* 「✨ -1」（「いたっ！」の下に出す） */
.secret-path-player__minus {
  color: #c9412f;
  font-size: 13px;
  line-height: 1.2;
}

/* 「✨ +1」（ふわっと上へ上がりながら消える） */
.secret-path-player__plus {
  position: absolute;
  bottom: 100%;
  left: 50%;
  color: #8a5a00;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
  text-shadow:
    0 0 6px #fff,
    0 0 2px #fff;
  transform: translateX(-50%);
  animation: secret-path-plus 0.6s ease-out forwards;
}

@keyframes secret-path-pop {
  from {
    opacity: 0;
    transform: translate(-50%, 6px) scale(0.8);
  }

  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

@keyframes secret-path-plus {
  from {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  to {
    opacity: 0;
    transform: translate(-50%, -26px);
  }
}

/* 遊んでいる最中の操作の案内（「← → / A D：左右に移動」「↑ 長押し：はやく進む」など）
   動かす操作はフィールドとキーだけなので、ここには押すものを置かず、短い案内だけにする */
.secret-path-guide {
  margin: 0;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.5;
}

/* 案内のひとまとまり（せまい画面では、まとまりの切れ目で折り返す） */
.secret-path-guide__item {
  display: inline-block;
  margin: 0 6px;
}

.secret-path-guide__hint {
  margin: 4px 0 0;
  color: #b8dfef;
  font-size: 14px;
  line-height: 1.5;
}

/* パソコン向け（--pc）とスマホ向け（--touch）の説明の出し分け
   ふだんはパソコン向けを出し、指で遊ぶ端末ではスマホ向けだけを出す */
.secret-path-for-touch {
  display: none;
}

@media (hover: none), (pointer: coarse) {
  .secret-path-for-pc {
    display: none;
  }

  .secret-path-for-touch {
    display: block;
  }
}

/* 小道をぬけたあとの「✨ 木漏れ日 4 / 5」 */
.secret-path-result {
  display: inline-block;
  margin: 0 0 8px;
  padding: 2px 14px;
  border-radius: 999px;
  background: #fff6e0;
  box-shadow: inset 0 0 0 1px #f5e2be;
  color: #7a5410;
  font-size: 15px;
  font-weight: 700;
}

.secret-path-result b {
  font-size: 19px;
  font-variant-numeric: tabular-nums;
}

/* 「木々のすき間から、まぶしい光が差しこんできました。」 */
.secret-path-light {
  margin-top: 10px;
  padding: 8px 14px;
  border-left: 4px solid var(--gold);
  border-radius: 6px;
  background: linear-gradient(90deg, rgb(255 241 201 / 90%) 0%, rgb(255 241 201 / 0%) 100%);
  color: #7a5410;
  font-weight: 700;
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
  font-size: 13.5px;
  letter-spacing: 0.1em;
}

.command__note {
  grid-column: 1 / -1;
  margin: 0;
  padding: 9px 14px;
  border: 1px dashed var(--navy-line);
  border-radius: 10px;
  color: #b8dfef;
  font-size: 14px;
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
  font-size: 17px;
  font-weight: 700;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

/* 選択カーソル「▶」（選ばれていないボタンでは見えない）

   ▶ の色は「そのボタンの文字と同じ色」にそろえる
   こうすると、どの色のボタンでも文字と同じ濃さで読めるようになる
   ・白いボタン（すべり台へ行く など）         … 紺色     ← ここで指定
   ・紫のボタン（秘密の場所）                  … 白       ← .cmd--secret::before
   ・緑のボタン（ゴール）                      … 白       ← .cmd--goal::before
   ・金色のボタン（きょうのおやつを選ぶ など） … 濃い茶色 ← .cmd--start / --next::before
   ・うすい青のボタン（はじめの画面へ戻る）    … 白       ← .cmd--back::before

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

/* 選択中は、ボタンの背景にうっすら水色を重ねる

   background（背景色）は書きかえずに、inset の box-shadow で上から薄く塗る。
   ・inset の影は「背景の上・文字の下」に描かれるので、文字は濁らない
   ・background を書きかえないので、金色・紫・緑など
     そのボタンが本来持っている色がそのまま残る
   ・0 0 0 100px は「ボタン全体をおおえるくらい大きく広げる」という意味 */
.cmd--selected,
.cmd--single {
  box-shadow:
    0 4px 12px rgb(0 0 0 / 30%),
    inset 0 0 0 100px rgb(var(--command-selected) / 12%);
}

/* 白い文字のボタン（秘密の場所・ゴール）だけは、水色を重ねない

   背景が明るくなるほど、白い文字は読みにくくなるため。
   この2つは「水色の枠」と「水色の光」だけで選択中を表し、
   紫・緑の下地と白文字のコントラストは今までどおりに保つ */
.cmd--secret.cmd--selected,
.cmd--goal.cmd--selected {
  box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
}

.cmd:hover::before,
.cmd:focus-visible::before,
.cmd--selected::before {
  opacity: 1;
}

/* 「はじめる」「きょうのおやつを選ぶ」の選択カーソル「▶」

   前は「このボタンを Enter で押せますよ」と伝えるために、いつも出していた
   いまはキーボードで上のボタン（♪ サウンドトラック／はじめの画面へ戻る・
   サウンドON/OFF）へも移動できるので、
   ▶ は「いま選んでいるボタン」だけに出す
   （そうしないと、上のボタンを選んでいるのに ▶ が下に出たままになってしまう）

   :focus-visible ではなく :focus を使っているのは、
   画面が出たときに、こちらからこのボタンへフォーカスを当てているため
   キーボードをまだ1回も押していなくても、
   「いまここが選ばれている」と分かるようにしておく

   ※ 浮き上がる動きと、ふんわり光る演出（.cmd--single::after）は今までどおり
*/
.cmd--single:focus::before {
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
  font-size: 12.5px;
  font-weight: 400;
}

/* 控えめなコマンドボタン（紺色の下地になじむ、うすい色）

   主役のボタン（金色・緑・紫）より一段うしろに見えるようにしたいときに使う
   いまは、ゴール／GAME OVER画面の「← はじめの画面へ戻る」で使っている */
.cmd--sub {
  border-color: var(--navy-line);
  background: rgb(255 255 255 / 8%);
  color: #d5e2f5;
  font-size: 16px;
  font-weight: 400;
}

/* はじめの画面へ戻る（ゴール／GAME OVER画面の、2つ目のボタン）

   すぐ上の「もう一度あそぶ」と同じ幅（380px）で、中央にそろえて下に置く
   1 / -1 は「1列目から最後の列まで、ぜんぶ使う」という意味 */
.cmd--back {
  grid-column: 1 / -1;
  justify-self: center;
  max-width: 380px;
}

.cmd--back .cmd__text {
  text-align: center;
}

/* ▶ は、そのままだと紺色なので、紺色の下地に沈んで見えなくなる
   このボタンだけ下地が暗いので、白にしてはっきり見えるようにする
   （文字の #d5e2f5 より少し明るくして、いま選んでいることが分かりやすい） */
.cmd--back::before {
  color: #fff;
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

/* ゴール／GAME OVER画面の2つのボタン（command--result）

   「もう一度あそぶ」と「はじめの画面へ戻る」を、左右にならべる
   リザルトは ↑↓ でスクロールして読むので、ボタンは ← → で選ぶ
   見た目も左右にならべて、キーの向きとそろえている

   ・パソコンでは、1つ380pxまでの幅で中央にそろえる
   ・スマホ幅でも1列にはしない（いちばん下の max-width: 700px を参照）
   ・公園入口の .command には付けないので、そちらの並びは変わらない */
.command--result {
  grid-template-columns: repeat(2, minmax(0, 380px));
  justify-content: center;
}

/* 1行まるごと使って中央に置く指定（.cmd--next / .cmd--back）を、この画面だけ外す */
.command--result .cmd--next,
.command--result .cmd--back {
  grid-column: auto;
  justify-self: stretch;
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
  font-size: 19px;
}

/* 金色のボタン（はじめる・きょうのおやつを選ぶ／もう一度あそぶ）も、文字と同じ濃い茶色にする
   下地が明るいので、▶ は文字と同じ濃い茶色にしないと沈んで見えなくなる
   大きなボタンなので、▶ も少しだけ大きくしてそろえている
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
  /* 上下の余白は、目もりの説明（.gauge-legend）を残す場所をつくるために
     2pxずつつめてある */
  .status-area {
    gap: 6px 24px;
    padding: 6px 28px 8px;
  }

  /* ===== おやつ選択画面（背の低い画面） =====

     おやつ6つ＋バッグ＋出発ボタンとタテに長い画面なので、
     背の低いパソコン（1280×720 など）では余白と絵文字をさらにつめて、
     スクロールする量を減らしている

     ※ ここで指定するのは「ふつうの高さの画面より、さらに小さくする値」だけ
       上下の余白（32px）などは、もうカードのほうで小さくしてあるので、
       同じ値をここへ書き足さない（書いても何も変わらないため）

     ※ 文字そのものは小さくしない
       小さくすると読みにくくなるので、削るのは余白と絵文字だけにしてある
       （それでも収まらないときは、.title-screen が縦にスクロールしてくれる） */

  /* カードの外がわの余白も、上下だけ半分にする（32px → 16px）

     背の低い画面では、この上下64pxがそのままスクロール量になってしまう
     左右は今までどおり24pxのまま（横がせまくなるのは別の問題なので） */
  .title-screen {
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .snack-heading {
    margin-bottom: 8px;
    font-size: 23px;
  }

  .snack-lead {
    margin-bottom: 12px;
  }

  .snack-list {
    gap: 8px;
    margin-bottom: 12px;
  }

  /* 上下の余白は同じ値にしておく（中身が上下中央にそろう） */
  .snack-option {
    padding: 12px 12px;
  }

  .snack-option__icon {
    font-size: 24px;
  }

  .snack-bag {
    padding: 10px 16px;
  }

  .snack-go {
    margin-top: 12px;
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

  /* 高さが足りなくても、目もりの説明は消さない

     前は display: none で丸ごと隠していたが、
     それだと「あぶないライン」「ぐずりだすライン」がどの線のことなのか
     まったく分からなくなってしまう
     （マウスを乗せれば説明は出るが、タッチ操作や小さな窓では出せない）

     そこで「隠す」のではなく「小さくして残す」ようにしている
     ・文字を少し小さくする（それでも11pxは下まわらない）
     ・行の高さ（line-height）をつめる
     ・2つの説明のあいだのすき間を少しせまくする
     ・目もりの見本の線も少し短くする
     これで1行ぶんの高さは約16px → 約13px になる

     増えるぶんの高さは、この下で余白（ステータス欄・ゲージのまとまり・
     中央エリア）を1〜3pxずつつめて取り返しているので、
     1280×720 でも今までとほぼ同じ高さに収まる */
  .gauge-legend {
    gap: 2px 12px;
    font-size: clamp(11px, 0.85vw, 12.5px);
    line-height: 1.25;
  }

  .gauge-legend__mark {
    height: 10px;
  }

  /* 「こうちゃん」「親」の札も少しだけつめる
     （小さくしすぎると見出しに見えなくなるので、ほんの少しだけ） */
  .status-group__name {
    margin-bottom: 2px;
    padding: 0 10px;
    font-size: clamp(12.5px, 1vw, 14px);
  }

  .status-group {
    padding: 2px 9px 4px;
  }

  /* 本文を大きくしたぶんは、カードの余白をつめてかせぐ
     （文字を小さくするより、余白を減らすほうを先にする） */
  .stage {
    gap: 9px;
    padding: 13px 28px 15px;
  }

  .place-card {
    padding: 14px 22px;
  }

  .place-card__title {
    font-size: 22px;
  }

  .result-card {
    padding: 18px 22px 15px;
  }

  .result-card__title {
    margin-bottom: 6px;
  }

  .change-box {
    margin-top: 10px;
    padding-top: 9px;
  }

  /* 「今回の変化」の3つの枠と、その中の項目も少しつめる
     ここを1〜2pxずつ減らすだけで、カード全体では20px以上ちぢむ */
  .change-group {
    padding: 4px 7px 5px;
  }

  /* 見出しの札も少しだけつめる
     （小さくしすぎると見出しに見えなくなるので、ほんの少しだけ） */
  .change-box__title {
    margin-bottom: 6px;
    font-size: 13px;
  }

  .change-group__name {
    margin-bottom: 3px;
    padding: 0 9px;
    font-size: 13px;
  }

  .change-item {
    padding: 2px 10px 3px;
  }

  /* コマンドボックスも少しつめて、選択肢が画面に収まりやすくする */
  .command-box {
    padding: 9px 12px 11px;
  }

  .command-box__item {
    padding: 4px 10px 4px 28px;
    font-size: 16px;
  }

  /* 区切りもつめる（線と文字は残したまま、上下の余白だけ減らす） */
  .command-box__divider {
    margin: 5px 10px 3px;
    font-size: 11px;
  }

  /* サブメニューも同じだけつめる
     ※ PCでは command-box の「横」に出るので、
       サブメニューを開いてもコマンド欄の高さは変わらない
       （高さは、背の高いほうの command-box で決まる） */
  .care-menu {
    padding: 7px 12px 9px;
  }

  .care-menu__label {
    margin-bottom: 6px;
    padding-bottom: 6px;
  }

  .care-menu__item {
    padding: 4px 10px 4px 28px;
    font-size: 16px;
  }

  /* ちいさなできごとの枠も、背の低い画面では少しつめる */
  .event-flash {
    margin-top: 10px;
    padding: 10px 14px 11px;
  }

  /* 本文は 17px → 16px までにとどめる
     高さが足りないぶんは、上の余白（padding・gap）を減らしてかせぐ */
  .place-card__text,
  .result-card__text,
  .found-line,
  .event-flash__text,
  .tantrum-line {
    font-size: 16px;
    line-height: 1.75;
  }

  /* ゴールの結果カードも、たてにつめて1画面におさめる
     ランクのバッジは主役なので、小さくしすぎないように気をつける */
  .ending-card {
    padding: 16px 24px;
  }

  .ending-card__score-value {
    font-size: 40px;
  }

  .ending-card__rank {
    margin-bottom: 10px;
    padding: 8px 22px;
    font-size: clamp(27px, 2.6vw, 31px);
  }

  .ending-card__text,
  .gameover-card__text {
    font-size: 15.5px;
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
    padding: 9px 16px 9px 32px;
    font-size: 16px;
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

  /* 大いやいや（レベル3）のゆれは、完全に止める
     上の指定でも一瞬で終わるが、ゆれる動きそのものを出さないようにしておく
     （見出しの 😭💥 と、濃いめの色は残るので、大いやいやだとは分かる） */
  .place-card--tantrum-big.place-card--tantrum-active {
    animation: none !important;
  }

  /* 選択中の水色の光は、強くなったり弱くなったりするのを完全に止める。
     ただし ▶ ・背景・太字・水色の枠は残るので、
     動きが無くても「いまここを選んでいる」ことは分かる */
  .cmd--selected::after,
  .cmd--single::after,
  .command-box__item--selected::after,
  .care-menu__item--selected::after {
    animation: none !important;
  }

  /* 秘密の小道の「✨ +1」は、消える動きをやめて、出ているあいだはその場に見せておく
     （forwards のまま一瞬で終わると、出たとたんに見えなくなってしまうため）
     ※ 枝と木漏れ日そのものは JavaScript で動かしているので、この設定でも止まらずに遊べる */
  .secret-path-player__plus {
    animation: none !important;
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

  /* 横ならびの選択肢（4つ）は、タブレット幅では 2列 × 2行 に折り返す
     （← → で動く順番は、左上 → 右上 → 左下 → 右下 のまま） */
  .command-box--choices-4 {
    --choice-columns: 2;
  }

  /* 秘密の小道のカードは、padding と border をふくめて中央エリアの幅に収める
     （content-box のままだと、タブレット幅で左右が少しはみ出してしまうため） */
  .stage--secret-path > .place-card {
    box-sizing: border-box;
  }

  /* ※ おやつ（.snack-list）は、パソコンのときからすでに2列なので
       ここでは何もしない（スマホ幅で1列にするのは max-width: 700px のほう） */

  /* 3グループ横並び → 2列（おでかけが下へ折り返す） */
  .change-groups {
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
    font-size: 16px;
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

  /* スマホでは、スライダーだけ少し短くする

     ボタンはそのままの大きさにしておく（小さくすると指で押しにくくなるため）
     [ 🔊 ][━━●━] の形のまま、せまい画面でも横にはみ出さずに収まる
     ※ 読み上げ用の名前（aria-label）は、画面の広さにかかわらず、いつも付いている */
  .sound-control {
    --sound-slider-width: 76px;
  }

  .status-area__titleRow {
    gap: 8px;
  }

  .status-clock__now {
    font-size: 24px;
  }

  .status-list {
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
  }

  /* スマホは画面ごとスクロールできるので、
     背の低い画面向けに小さくした目もりの説明を、読みやすい大きさに戻す
     （このブロックは背の低い画面用の指定より後ろにあるので、こちらが勝つ） */
  .gauge-legend {
    gap: 3px 14px;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .gauge-legend__mark {
    height: 12px;
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
    font-size: 20px;
  }

  /* いやいやタイムのセリフも、見出しに合わせて少し小さくする */
  .tantrum-voice {
    font-size: 18px;
  }

  /* 本文はスマホでも16pxを下まわらないようにする
     （画面がせまいぶん、行間は1.8のままゆったり取る） */
  .place-card__text,
  .result-card__text,
  .found-line,
  .event-flash__text,
  .tantrum-line {
    font-size: 16px;
    line-height: 1.8;
  }

  .ending-card__text,
  .gameover-card__text {
    font-size: 15.5px;
  }

  .result-card {
    padding: 18px 16px 14px;
  }

  /* こうちゃん → 親 → おでかけ の1列に積む */
  .change-groups {
    grid-template-columns: 1fr;
  }

  /* 上部ステータスも、こうちゃん と 親 を上下に積む */
  .status-groups {
    grid-template-columns: 1fr;
  }

  /* スマホでは横にならべると幅が足りないので、たてにならべる
     （上に「☕ ひとやすみ」、下に「どうする？」） */
  .command-area {
    flex-direction: column;
    align-items: stretch;
    align-self: stretch;
    gap: 10px;
  }

  /* たてならびでは、2つの枠を画面の幅いっぱいにそろえる

     ・flex: none
       たてならび（flex-direction: column）では flex の基準が「高さ」になるので、
       横ならび用に付けた 380px / 240px の基準をここで外す

     ・width: auto ＋ align-self: stretch
       width: 100% にはしないのが大事
       このゲームは box-sizing を border-box にしていないため、
       width: 100% だと padding と border のぶんだけ横にはみ出してしまう
       stretch にまかせれば、padding と border をふくめた外枠が
       ちょうど画面の幅に収まり、2つの枠の幅もぴったりそろう
  */
  .command-area .command-box,
  .command-area .care-menu {
    flex: none;
    align-self: stretch;
    width: auto;
    max-width: none;
  }

  /* width: auto … 幅は stretch にまかせる
     width: 100% のままだと、padding と border のぶんだけ画面の右へはみ出してしまう
     （いやいやタイム・とつぜんのできごとの「どうする？」。.command-area の中の枠と同じ考えかた） */
  .command-box {
    align-self: stretch;
    width: auto;
    max-width: none;
  }

  /* 横ならびの選択肢（3つ）は、スマホ幅では2列に折り返す（3つ目は下の行へ）
     たて1列には戻さない（← → で選ぶ向きと、見た目の向きをそろえるため） */
  .command-box--choices-3 {
    --choice-columns: 2;
  }

  .record-grid {
    grid-template-columns: 1fr;
  }

  /* ゴールのランクバッジ
     スマホでは min-width 180px のままだと画面いっぱいになるので、
     少しだけ小さくして左右に余白を残す
     （max-width: 100% と box-sizing のおかげで、はみ出しはしない） */
  .ending-card__rank {
    min-width: 150px;
    padding: 8px 20px;
    font-size: 28px;
  }

  .gameover-card__label {
    font-size: 24px;
  }

  .gameover-card__title {
    font-size: 20px;
  }

  /* せまい画面では説明文の折り返しが増えるぶん、B画面の中身が縦に伸びる
     340pxのままだとB画面だけ min-height を超えてカードが高くなり、
     上下まんなか置きのせいで上部の操作がA画面とずれてしまうので、
     折り返しが増えても収まる高さまで上げておく */
  .title-card {
    min-height: 400px;
    padding: 28px 20px;
  }

  /* せまい画面ではカードの余白そのものが小さくなる（上下28px / 左右20px）ので、
     食い込ませる量も小さくしないと、ボタンがカードの外へ出てしまう
     タイトルとのあいだは20pxだけあける */
  /* flex-wrap は、B画面の右上に「あそびかた」と「サウンド」が2つ並ぶぶんのはみ出しよけ
     320pxくらいのとても細い画面では、右上の2つが下の行へ回りこむ
     （A画面は2つだけなので、1行のまま変わらない） */
  .title-card__tools {
    flex-wrap: wrap;
    gap: 8px;
    margin: -8px -4px 20px;
  }

  /* スマホでは左右2つが1行に収まるよう、文字と余白を少しだけ下げる
     （それでも以前の11.5pxよりは大きいままにして、押しやすさを残す）
     右側のサウンドは [ 🔊 ][━━●━] だけの短いまとまりなので、
     左の長いリンクとぶつからずに収まる */
  .title-card__soundtrack,
  .title-card__back,
  .title-card__howto {
    gap: 6px;
    min-height: 36px;
    padding: 7px 11px;
    font-size: 13.5px;
  }

  /* サウンドのコントロールも、左の補助リンク（min-height: 36px）に高さをそろえる
     スライダーは、せまい画面で横にはみ出さないように少し短くする */
  .title-card__tools .sound-control {
    --sound-button-size: 36px;
    --sound-icon-size: 19px;
    --sound-slider-width: 84px;
  }

  /* B画面の「？ あそびかた」も、スマホでは「?」だけの短い表示にする
     （「サウンド」の文字を隠すのと同じ考えかた。読み上げ用の名前は aria-label にある）
     こうすると、左の「はじめの画面へ戻る」と3つが1行に収まる */
  .title-card__howtoText {
    display: none;
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

  /* ===== あそびかた画面（スマホ幅） =====

     文字の大きさはあまり下げずに、枠の余白と見出しを少しだけ小さくする
     「名前・説明」の一覧は、名前の下に説明を置く形にして折り返しを減らす */
  .howto-heading {
    font-size: 24px;
  }

  .howto-heading__icon {
    width: 32px;
    height: 32px;
    font-size: 18px;
  }

  .howto-section {
    padding: 14px 14px 16px;
  }

  .howto-section__title {
    font-size: 18px;
  }

  .howto-terms__row {
    grid-template-columns: minmax(0, 1fr);
  }

  /* ===== おやつ選択画面（スマホ幅） ===== */

  /* スマホでは1列にする

     考え方はパソコンの2列と同じで、
     「説明文が変な位置で折り返さない幅」を確保するのが目的

     2列のままだと、375pxの画面では1枚の文字幅が約112pxしか残らない
     そうなると
     ・「おなかがいっぱいになって体力が回復」が3行に折り返す
     ・「体力 +18 ／ 機嫌 +6 ／ 10分」も2〜3行に折り返す
     となって、せっかく大きくした文字が読みにくくなってしまう

     1列にすると、文字に使える幅が約257pxになり、
     説明文も回復量もほとんど1行で収まる
     カード1枚の背が低くなるので、6枚ぜんぶ見るのにかかる
     スクロールの量は、2列のときとほとんど変わらない

     ※ 列の幅は minmax(0, 1fr) なので、
       もっと細い画面でもカードが横にはみ出すことはない
       （そこまで細いと説明文は2行になるが、
         text-wrap: balance が長さをそろえてくれる） */
  .snack-list {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }

  /* 1列になって横はゆったりしたので、左右の余白も10pxに戻す
     （文字がカードのふちに近づきすぎないようにする） */
  /* 上下の余白は同じ値にしておく（中身が上下中央にそろう） */
  .snack-option {
    gap: 1px;
    padding: 12px 10px;
    border-radius: 12px;
  }

  .snack-option__icon {
    font-size: 26px;
  }

  .snack-option__name {
    font-size: 15.5px;
  }

  /* 説明文は、せまい画面でも14pxを下まわらないようにする
     1列にしたので、いちばん長い説明（18文字＝252px）も
     文字幅 約257px に1行で収まる */
  .snack-option__text {
    font-size: 14px;
  }

  /* 回復量も、説明文と同じだけ下げる（15px → 14px）
     いちばん長い「体力 +18 ／ 機嫌 +6 ／ 10分」は約188pxなので、
     スマホの文字幅 約257px に1行で収まる */
  .snack-option__effect {
    font-size: 14px;
  }

  /* PCのカーソル用の動きは、指で押す画面では出さない
     （B画面の .cmd:hover を切っているのと同じ考えかた） */
  .snack-option:not(:disabled):hover {
    background: var(--paper);
    transform: none;
    box-shadow: none;
  }

  .snack-option--selected:not(:disabled):hover {
    background: #e3f2fb;
  }

  .snack-heading {
    margin-bottom: 8px;
    font-size: 22px;
  }

  .snack-lead {
    margin-bottom: 16px;
    font-size: 15.5px;
  }

  .snack-bag {
    padding: 12px 14px;
  }

  .snack-bag__title {
    font-size: 15px;
  }

  .snack-bag__count {
    font-size: 17px;
  }

  .snack-bag__item {
    font-size: 14px;
  }

  .snack-go {
    margin-top: 14px;
  }

  .command {
    position: sticky;
    bottom: 0;
    z-index: 1;
    grid-template-columns: 1fr;
    max-height: 62vh;
    padding: 12px 12px calc(14px + env(safe-area-inset-bottom));
  }

  /* ゴール／GAME OVER の2つのボタンは、スマホ幅でも横にならべる
     （← → で選ぶ向きと、見た目の向きをそろえる。長い文字はボタンの中で折り返す） */
  .command--result {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cmd {
    padding: 11px 14px 11px 30px;
    font-size: 16px;
  }

  /* 各場所の「どうする？」「ひとやすみ」も、せまい画面では1つ下のサイズにそろえる */
  .command-box__item,
  .care-menu__item {
    font-size: 16px;
  }

  .cmd:hover {
    transform: none;
    box-shadow: none;
  }

  .cmd--next,
  .cmd--back {
    max-width: none;
  }

  /* ===== 秘密の小道（スマホ幅） =====

     ・上部ステータスを、小道の画面のあいだだけ固定しない（ページといっしょに流れる）
       固定したままだと、画面の半分近くを上部ステータスが使ってしまい、
       フィールドと下の案内が同時に見えなくなるため
     ・遊びはじめたら、カードが画面のいちばん上に来るようにスクロールする（scrollSecretPathIntoView()）
     ・フィールドは、カードと案内がいっしょに画面に収まる高さにする
       （iPhone SE ほどの背の低い画面でも、案内まで見える） */
  .game-screen--secret-path .status-area {
    position: static;
  }

  /* カードとコマンドボックスの幅は、stretch にまかせる

     このゲームは box-sizing を border-box にしていないので、
     .stage > * や .command-box の width: 100% のままだと、
     padding と border のぶんだけ画面の右へはみ出してしまう
     （.command-area の中のコマンドボックスと同じ考えかた） */
  .stage--secret-path > * {
    align-self: stretch;
    width: auto;
  }

  .stage > .secret-path {
    flex: none;
    max-height: none;
    padding: 12px 12px 14px;
    scroll-margin-top: 8px;
  }

  .secret-path-field {
    flex: none;
    height: clamp(240px, calc(100vh - 280px), 400px);
    height: clamp(240px, calc(100dvh - 280px), 400px);
    min-height: 0;
  }

  .secret-path-item {
    font-size: 30px;
  }

  .secret-path-player__face {
    font-size: 38px;
  }

  .secret-path-lead {
    font-size: 17px;
  }

  .secret-path-rules li {
    font-size: 16px;
  }
}
</style>
