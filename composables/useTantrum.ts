/* ============================================================
   いやいや（かんしゃく）まわりの判定と、対応したときの結果

   ゲーム本編（pages/index.vue）にあった処理を、そのまま移してある

   ■ ここがやること
     ・いやいやが起きるかどうかの抽選（checkTantrum）
     ・いやいやの理由えらび（chooseTantrumReason）
     ・いやいやの激しさ（レベル）の上げ下げ
     ・4つの対応（だっこ・おやつ・お話・待つ）の結果を決める
     ・ナイス対応かどうかの判定と、そのボーナス

   ■ ここがやらないこと
     ・通常の場所の行動・とつぜんのできごと・スコア・ランク・リザルト
     ・BGMの切りかえ条件・画面の切りかえ・キーボード操作
     ・音を鳴らす、時間を進める、GAME OVERを調べる、といった共通の処理そのもの
       （どれも親からもらった関数を呼ぶだけで、中身は pages/index.vue のまま）

   ■ ステータスの書きかえについて
     だっこ・おやつ・お話・待つ の結果は、今までどおり
     親からもらった ref（childEnergy など）をその場で増減している
     「増減のまとまりを返して、親が反映する」形には作り変えていない
     ゲームのバランス（増減の数・抽選の順番・乱数を呼ぶ回数）を
     1つも変えないことを優先したため

   ■ いやいやの中だけで使う状態（理由・激しさ・直前の対応・ナイス対応・
     いやいやが始まったときの文章）は、ここが自分で持っている
     書きかえるのもこのファイルの中だけなので、持ち主と書き手をそろえてある
     画面に出すものは、下の return から渡している

   ■ 初期値の置き場所は、このファイルの「最初の状態（初期値）」1か所だけ
     ref を作るときと、resetTantrumState() で戻すときの両方がそこを見るので、
     同じ値を2か所に書いておく必要がない（composables/useGameState.ts と同じ考えかた）

   ■ いやいや中かどうか（isTantrum）と、いやいやが起きた回数（tantrumCount）は、
     今までどおり受けとった ref をそのまま使う
     こちらはBGMの切りかえ（useAudio）や最後のスコア（useScore）からも見るので、
     composables/useGameState.ts が持ち主になっている
   ============================================================ */

import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import { snackTantrumFits, tantrumLevelInfo, tantrumReasonInfo } from '~/data/tantrum';
import type { SnackId, Snack, TantrumAction, TantrumLevel, TantrumReason, TantrumSnackFit } from '~/types/game';

/* ============================================================
   最初の状態（初期値）

   ・useTantrum() を呼んで、入れものを作るとき
   ・いやいやの記録を空に戻すとき（resetTantrumState()）

   の両方が、ここに書いた値を見る
   初期値を変えたいときは、この場所だけを直せばよい

   ※ ここにあるのは、このファイルが持ち主の状態だけ
     いやいや中かどうか（isTantrum）と、いやいやが起きた回数（tantrumCount）の初期値は、
     持ち主の composables/useGameState.ts のほうにある
   ============================================================ */
const initialTantrumReason: TantrumReason | null = null; // いまのいやいやの理由（null = いやいやしていない）
const initialTantrumLevel: TantrumLevel = 1; // いやいやの激しさ（1 = ぐずぐず）
const initialLastTantrumAction: TantrumAction | null = null; // 直前に選んだ対応
const initialRepeatedTantrumActionCount: number = 0; // 同じ対応を続けている回数
const initialHasNiceTantrumResponse: boolean = false; // このいやいやで、もうナイス対応のボーナスをもらったか
const initialNiceTantrumResponseText: string = ''; // 「✨ ナイス対応！」に出す文章
const initialTantrumText: string = ''; // いやいやが始まったときの文章

export type UseTantrumOptions = {
  /* ===== こうちゃんと親のステータス（そのまま増減する） ===== */
  childEnergy: Ref<number>;
  childMood: Ref<number>;
  parentEnergy: Ref<number>;
  parentCalm: Ref<number>;
  outingPoint: Ref<number>;

  /* ===== いやいやの状態（ゲーム全体で共有しているぶんだけ受けとる） =====
     理由・激しさ・直前の対応・ナイス対応・いやいやが始まったときの文章は、このファイルの中で持っている */
  isTantrum: Ref<boolean>;
  tantrumCount: Ref<number>;

  /* ナイス対応のボーナス（1回のいやいやにつき1回だけ） */
  niceTantrumBonusOutingPoint: number;
  niceTantrumBonusParentCalm: number;

  /* ===== 画面まわり ===== */
  resultMessage: Ref<string>;
  selectedCommandIndex: Ref<number>;
  showTantrumAlert: () => void;

  /* ===== 時間と、ぐずりだす目もり ===== */
  currentMinutes: ComputedRef<number>;
  fussEnergyLine: number;
  fussMoodLine: number;
  addMinutes: (minutes: number) => void;

  /* ===== おやつ（バッグの中身。中身は composables/useSnackBag.ts） ===== */
  findSnackInBag: (snackId: SnackId) => Snack | undefined;
  removeSnackFromBag: (snackId: SnackId) => void;

  /* ===== 共通の処理 =====
     startStatusChanges()・fixAllStatus()・checkGameOver() は pages/index.vue、
     saveStatusChanges() は composables/useActionResult.ts のもの */
  startStatusChanges: () => void;
  saveStatusChanges: () => void;
  fixAllStatus: () => void;
  checkGameOver: () => void;

  /* ===== 音（鳴らす中身は pages/index.vue のまま） ===== */
  playTantrumSound: () => void;
  stopParkBgm: () => void;
  stopSecretBgm: () => void;
};

export function useTantrum(options: UseTantrumOptions) {
  /* 受けとったものを、今までと同じ名前で使えるようにしておく
     （こうすると、pages/index.vue にあったときのコードをそのまま動かせる） */
  const {
    childEnergy,
    childMood,
    parentEnergy,
    parentCalm,
    outingPoint,
    isTantrum,
    tantrumCount,
    niceTantrumBonusOutingPoint,
    niceTantrumBonusParentCalm,
    resultMessage,
    selectedCommandIndex,
    showTantrumAlert,
    currentMinutes,
    fussEnergyLine,
    fussMoodLine,
    addMinutes,
    findSnackInBag,
    removeSnackFromBag,
    startStatusChanges,
    saveStatusChanges,
    fixAllStatus,
    checkGameOver,
    playTantrumSound,
    stopParkBgm,
    stopSecretBgm,
  } = options;

  /* ============================================================
     いやいやの中だけで使う状態

     ここから下の入れものは、このファイルが持ち主
     書きかえるのもこのファイルの中だけで、
     空に戻すのも resetTantrumState() の1か所にまとめてある

     画面に出すもの（激しさ・理由に合ったことば・こうちゃんの様子・
     ナイス対応の文章）は、いちばん下の return から渡している
     ============================================================ */

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

  /* いまのいやいやの理由

     null … いやいやしていない（または、まだ理由が決まっていない）

     ※ だっこ・おやつなどで いやいや が終わった瞬間には null に戻さない
       結果の文章を読んでいるあいだも「何のいやいやだったか」を使うことがあるため
       null に戻すのは、結果を読み終えて いやいやタイムの画面から出るとき（goToNextPlace()）
       と、もう一度あそぶとき（resetGame()）
       ※ どちらも resetTantrumState() を通る */
  const tantrumReason = ref(initialTantrumReason);

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

  /* いまのいやいやの激しさ
     いやいやしていないときは 1 のまま（新しいいやいやも 1 から始まる） */
  const tantrumLevel = ref(initialTantrumLevel);

  /* いまのレベルの見出しと様子 */
  const currentTantrumLevelInfo = computed(() => tantrumLevelInfo[tantrumLevel.value]);

  /* いまのいやいやの理由に合ったことば（理由が決まっていないときは null） */
  const currentTantrumReasonInfo = computed(() => (tantrumReason.value === null ? null : tantrumReasonInfo[tantrumReason.value]));

  /* いやいやタイムのカードに出す、こうちゃんの様子
     ぐずぐずのときは理由ごとの様子、大泣き・大いやいやのときはレベルごとの様子 */
  const currentTantrumScene = computed(() => currentTantrumLevelInfo.value.scene ?? currentTantrumReasonInfo.value?.scene ?? '');

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

  const lastTantrumAction = ref(initialLastTantrumAction);
  const repeatedTantrumActionCount = ref(initialRepeatedTantrumActionCount);

  /* ===== ナイス対応（いやいやの理由に合った対応をしたときのごほうび） =====

     ナイス対応になるのは次のとき（ボーナスを足すのは applyNiceTantrumResponse() の1か所だけ）
     ・つかれた           ＋ だっこ（どのレベルでも）
     ・悔しい             ＋ お話する（大いやいやで1段落ち着くだけのときもふくむ）
     ・まだ遊びたい       ＋ お話する（同上）
     ・悔しい             ＋ 少し待ってみる（成功したとき。1段落ち着くだけのときもふくむ）
     ・相性 great のおやつ ＋ そのいやいやの理由（どのレベルでも）

     ボーナスがもらえるのは、1回のいやいやにつき1回だけ（hasNiceTantrumResponse で見る） */

  /* このいやいやで、もうナイス対応のボーナスをもらったかどうか

     たとえば「大いやいやで正しいお話 → 大泣きに下がる → もう一度お話で解決」のとき、
     2回ともボーナスを入れると、わざと長引かせたほうが得になってしまうため

     新しいいやいやが始まったときと、いやいやタイムから出るときに false へ戻す */
  const hasNiceTantrumResponse = ref(initialHasNiceTantrumResponse);

  /* ナイス対応の表示に出す文章（演出用）

     空っぽ … 今回の対応はナイス対応ではなかった（結果カードに「✨ ナイス対応！」を出さない）
     行動をはじめるたび（pages/index.vue の startStatusChanges()）と、
     いやいやタイムから出るときに空へ戻す */
  const niceTantrumResponseText = ref(initialNiceTantrumResponseText);

  /* 今回の行動でいやいやが始まったときの文章（演出用）

     結果メッセージに書き足すと、あとから画面に足した
     「アイテム発見」「ちょっとしたできごと」の表示より前に出てしまい、
     起きた順（行動 → アイテム → ちょっとしたできごと → いやいや）と食いちがう
     そこで文章だけここに持ち、画面のいちばん下に出す

     入れるのは checkTantrum()（新しいいやいやが始まったとき）の1か所だけ
     空に戻すのは、行動をはじめるたび（pages/index.vue の startStatusChanges()）と、
     resetTantrumState() */
  const tantrumText = ref(initialTantrumText);

  /* おやつと いやいやの理由の相性

     great  … ぴったり     → どのレベルでも いやいや終了 ＋ ナイス対応
     normal … ふつうに効く → ぐずぐずなら終了、大泣き以上なら1段落ち着くだけ（いやいやは続く）
     weak   … ずれている   → 食べてはくれるが、いやいやは悪化する

     ※ great が大いやいやでも効くのは、「理由にぴったりのおやつ」はそれだけ強い、というルールのため
       normal は「おやつはうれしいけれど、泣いている理由には合っていない」ので、
       はげしく泣いているときは、ひとまず少し落ち着くところまでしか効かない

     ※ おやつ選択画面にもおやつバッグにも、この相性は出さない
       こうちゃんの様子とおやつの説明から、プレイヤーに考えてもらう

     理由が決まっていないとき（ふつうは起きない）は normal にしておく
     ＝ 相性を入れる前と同じく、どのおやつでも いやいや が終わる */
  function getSnackTantrumFit(snackId: SnackId): TantrumSnackFit {
    if (tantrumReason.value === null) {
      return 'normal';
    }

    return snackTantrumFits[snackId][tantrumReason.value];
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

    tantrumText.value = '「いやー！」その場にぺたんと座りこんでしまいました。';
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

     戻すもの：理由・レベル・対応の記録・ナイス対応（もらったかどうかと、その表示）・
     いやいやが始まったときの文章
     呼ぶところは3か所
     ・新しいいやいやが始まったとき（checkTantrum()）… 前のいやいやの記録を持ちこさない
     ・いやいやタイムの画面から出るとき（goToNextPlace()）
     ・もう一度あそぶとき（resetGame()）

     ※ isTantrum と tantrumCount はここでは戻さない
       isTantrum は「いやいや中かどうか」を決める大事な印、
       tantrumCount はプレイ全体の記録なので、それぞれの場所ではっきり書き分けている */
  function resetTantrumState() {
    tantrumReason.value = initialTantrumReason;
    tantrumLevel.value = initialTantrumLevel;
    lastTantrumAction.value = initialLastTantrumAction;
    repeatedTantrumActionCount.value = initialRepeatedTantrumActionCount;
    hasNiceTantrumResponse.value = initialHasNiceTantrumResponse;
    niceTantrumResponseText.value = initialNiceTantrumResponseText;
    tantrumText.value = initialTantrumText;
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
      resultMessage.value += '全身でいやいやしたまま。親もだんだんしんどくなってきました……';
      return;
    }

    // 1段上げて、大いやいやに上がったかどうかを見る
    // ※ 戻り値で受け取るのは、TypeScript がすぐ上の if で「ここでは 3 ではない」と覚えたままになり、
    //   tantrumLevel.value === 3 と書くと「ありえない比較」とエラーにしてしまうため
    const newLevel = increaseTantrumLevel();

    if (newLevel === 3) {
      parentCalm.value -= bigTantrumEnterCalmCost;
      resultMessage.value += '泣き声がさらに大きく！ 親もちょっと焦ってきます……';
      return;
    }

    resultMessage.value += '泣き声が、さっきより大きくなりました……';
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
      resultMessage.value = 'ぎゅっとだっこすると、肩にぺたん。落ち着いてきました。';
    } else {
      resultMessage.value = 'ぎゅっとだっこして、背中をとんとん。力がぬけてきました。';
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

     「おやつをあげる」→ おやつバッグ で選んだときに呼ばれる
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

      resultMessage.value = `「……たべる」${snack.name}をもぐもぐ。涙が止まってきました。`;

      if (currentTantrumReasonInfo.value) {
        resultMessage.value += currentTantrumReasonInfo.value.greatSnackText;
      }

      // ※ saveStatusChanges() より前に呼んで、ボーナスも「今回の変化」に入れる
      applyNiceTantrumResponse();
    } else if (fit === 'normal' && tantrumLevel.value === 1) {
      // ふつう × ぐずぐず：おやつがうれしくて、そのまま落ち着く → 解決
      isTantrum.value = false;

      resultMessage.value = `「……たべる」${snack.name}をもぐもぐ。涙が止まってきました。`;
    } else if (fit === 'normal') {
      // ふつう × 大泣き・大いやいや：少し落ち着くが、気持ちまではおさまらない → 1段下がって続く
      decreaseTantrumLevel();

      resultMessage.value = `${snack.name}で泣き声は少し小さく。でも、まだいやいや中です。`;
    } else {
      // ずれている：食べてはくれたが、泣いている理由には合っていない → 悪化
      // （同じいやいやが続くだけなので、tantrumCount も tantrumReason も変えない）
      const complaint = currentTantrumReasonInfo.value?.complaint ?? 'いやー！';

      resultMessage.value = `${snack.name}は食べたけれど「${complaint}」。`;

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

        resultMessage.value = `${words}泣き声は少し小さく。でも、まだ涙は止まりません。`;
      } else {
        // ぐずぐず・大泣き：気持ちを分かってもらえて、解決
        isTantrum.value = false;

        resultMessage.value =
          tantrumReason.value === 'frustrated' ? `${words}涙をふいて、落ち着いてきました。` : `${words}「うん…」とうなずいて、落ち着きました。`;
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
        resultMessage.value = '「つかれた〜！」まだ動きたくないようです。';
      } else {
        resultMessage.value = '「おなかすいた〜！」おなかを押さえたままです。';
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

        resultMessage.value = 'となりで待っていると、自分で涙をふいて落ち着いてきました。';
      } else {
        // 大泣き・大いやいや：少し落ち着くが、まだ続く → 1段下がる
        decreaseTantrumLevel();

        resultMessage.value = '待っていると、泣き声は少し小さく。でも、まだ涙は止まりません。';
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

      resultMessage.value = complaint ? `待ってみたけれど「${complaint}」。` : '待ってみたけれど、まだいやいや中です。';

      // 待つを続けていると効きにくくなることを、こうちゃんの様子として伝える
      // （「別の対応を試したほうがよさそう」と気づけるようにするための1文）
      if (repeatedTantrumActionCount.value > 0) {
        resultMessage.value += 'このまま待っても、落ち着かなさそう。';
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

  return {
    /* いやいやが起きるかを調べる（通常の行動のあとに呼ぶ） */
    checkTantrum,

    /* いやいやの記録を空に戻す（もう一度あそぶとき・いやいやタイムから出るとき） */
    resetTantrumState,

    /* いやいや中の4つの対応 */
    hugChild,
    giveSnack,
    talkToChild,
    waitCalmly,

    /* ===== 画面に出すもの（読むだけ。書きかえるのはこのファイルの中） =====
       ※ niceTantrumResponseText と tantrumText だけは、行動をはじめるたびに
         pages/index.vue の startStatusChanges() が空へ戻している */
    tantrumLevel,
    currentTantrumLevelInfo,
    currentTantrumReasonInfo,
    currentTantrumScene,
    niceTantrumResponseText,
    tantrumText,
  };
}
