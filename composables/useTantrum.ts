/* ============================================================
   いやいや（かんしゃく）まわりの判定と、対応したときの結果

   ■ ここがやること
     ・いやいやが起きるかどうかの抽選（checkTantrum）と、理由えらび（chooseTantrumReason）
     ・いやいやの激しさ（レベル）の上げ下げ
     ・4つの対応（だっこ・おやつ・お話・待つ）の結果と、ナイス対応の判定・ボーナス

   ■ ここがやらないこと
     ・通常の場所の行動・とつぜんのできごと・スコア・BGMの切りかえ条件・画面の切りかえ・キーボード操作
     ・音・時間・GAME OVER などの共通の処理そのもの（親からもらった関数を呼ぶだけ）

   ■ ステータスは、親からもらった ref（childEnergy など）をその場で増減する
     （ゲームのバランス（増減の数・抽選の順番・乱数を呼ぶ回数）を変えないことを優先したため）

   ■ いやいやの中だけで使う状態（理由・激しさ・直前の対応・ナイス対応など）は、ここが持ち主
     isTantrum と tantrumCount は、BGMやスコアからも見るので、持ち主は composables/useGameState.ts
   ============================================================ */

import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import { snackTantrumFits, tantrumLevelInfo, tantrumReasonInfo } from '~/data/tantrum';
import type { SnackId, Snack, TantrumAction, TantrumLevel, TantrumReason, TantrumSnackFit } from '~/types/game';

/* ============================================================
   最初の状態（初期値）

   入れものを作るときと、resetTantrumState() で戻すときの両方が、ここの値を見る（初期値を変えるときは、ここだけ直す）
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

  /* ===== いやいやの状態（ゲーム全体で共有しているぶんだけ受けとる） ===== */
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

  /* ===== おやつ（バッグの中身） ===== */
  findSnackInBag: (snackId: SnackId) => Snack | undefined;
  removeSnackFromBag: (snackId: SnackId) => void;

  /* ===== 共通の処理 ===== */
  startStatusChanges: () => void;
  saveStatusChanges: () => void;
  fixAllStatus: () => void;
  checkGameOver: () => void;

  /* ===== 音 ===== */
  playTantrumSound: () => void;
  stopParkBgm: () => void;
  stopSecretBgm: () => void;
  playTantrumBgmSoon: () => void;
};

export function useTantrum(options: UseTantrumOptions) {
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
    playTantrumBgmSoon,
  } = options;

  /* ============================================================
     いやいやの理由（tired つかれた ／ hungry おなかすいた ／ doItMyself じぶんでやりたい ／ wantMorePlay まだ遊びたい）

     理由によって「効く対応」がちがい、プレイヤーはセリフや様子から理由を考えて対応を選ぶ
     ・「起きるか」（checkTantrum）と「なぜ泣いているか」（chooseTantrumReason）は別の抽選
     ・同じいやいやのあいだは、理由を変えない（「少し待ってみる」に失敗して続いても、そのまま）
     ・画面には理由の名前を出さない（セリフと様子だけ。答えを見せずに考えてもらうため）
     ============================================================ */

  /* いまのいやいやの理由（null … いやいやしていない）
     ※ いやいやが終わった瞬間には null に戻さない（結果の文章を読んでいるあいだも使うため）
       戻すのは、いやいやタイムの画面から出るときと、もう一度あそぶとき（どちらも resetTantrumState()） */
  const tantrumReason = ref(initialTantrumReason);

  /* ============================================================
     いやいやの激しさ（1 ぐずぐず → 2 大泣き → 3 大いやいや）

     ・新しいいやいやは、かならず 1 から始まる
     ・ずれた対応をすると上がり（3 より上にはならない）、合った対応をすると1段落ち着くこともある
     ・いやいやが終わるのは、対応で isTantrum を false にしたときだけ（1 まで下がっても、それだけでは終わらない）
     ※ tantrumCount（起きた回数）とは別もの（レベルが上がっても、同じ1回のいやいや）
     ※ 画面には「Lv2」のような数字は出さない（見出しと様子で伝える）
     ============================================================ */

  const tantrumLevel = ref(initialTantrumLevel);

  /* いまのレベルの見出しと様子 */
  const currentTantrumLevelInfo = computed(() => tantrumLevelInfo[tantrumLevel.value]);

  /* いまのいやいやの理由に合ったことば（理由が決まっていないときは null） */
  const currentTantrumReasonInfo = computed(() => (tantrumReason.value === null ? null : tantrumReasonInfo[tantrumReason.value]));

  /* いやいやタイムのカードに出す、こうちゃんの様子（ぐずぐずは理由ごと、大泣き・大いやいやはレベルごと） */
  const currentTantrumScene = computed(() => currentTantrumLevelInfo.value.scene ?? currentTantrumReasonInfo.value?.scene ?? '');

  /* ============================================================
     同じ対応のくり返し（「同じことを何度もやれば、いつかは勝てる」にならないように、少し効きにくくする）

     ・lastTantrumAction … 直前に選んだ対応（おやつは種類ごとに別の対応としてあつかう）
     ・repeatedTantrumActionCount … 0 = 1回目 ／ 1 = 2回続けた ／ 2 = 3回以上（2より大きくしない）
     ちがう対応を選ぶと 0 に戻る。書きかえるのは registerTantrumAction() の1か所だけ
     ============================================================ */

  const lastTantrumAction = ref(initialLastTantrumAction);
  const repeatedTantrumActionCount = ref(initialRepeatedTantrumActionCount);

  /* ===== ナイス対応（いやいやの理由に合った対応をしたときのごほうび） =====

     ・つかれた           ＋ だっこ（どのレベルでも）
     ・じぶんでやりたい／まだ遊びたい ＋ お話する（大いやいやで1段落ち着くだけのときもふくむ）
     ・じぶんでやりたい   ＋ 少し待ってみる（成功したとき。1段落ち着くだけのときもふくむ）
     ・相性 great のおやつ ＋ そのいやいやの理由（どのレベルでも）
     ボーナスを足すのは applyNiceTantrumResponse() の1か所だけ */

  /* このいやいやで、もうナイス対応のボーナスをもらったか（1回のいやいやにつき1回だけ）
     2回ともボーナスを入れると、わざと長引かせたほうが得になってしまうため */
  const hasNiceTantrumResponse = ref(initialHasNiceTantrumResponse);

  /* 「✨ ナイス対応！」に出す文章（空っぽ … 今回はナイス対応ではない）
     行動をはじめるたび（startStatusChanges()）と、いやいやタイムから出るときに空へ戻す */
  const niceTantrumResponseText = ref(initialNiceTantrumResponseText);

  /* 今回の行動でいやいやが始まったときの文章

     結果メッセージに書き足すと、「アイテム発見」の表示より前に出てしまい、起きた順と食いちがうので、
     文章だけここに持ち、画面のいちばん下に出す（入れるのは checkTantrum() の1か所だけ） */
  const tantrumText = ref(initialTantrumText);

  /* おやつと いやいやの理由の相性

     great  … ぴったり     → どのレベルでも いやいや終了 ＋ ナイス対応
     normal … ふつうに効く → ぐずぐずなら終了、大泣き以上なら1段落ち着くだけ
     weak   … ずれている   → 食べてはくれるが、悪化する
     ※ 相性は画面に出さない（様子とおやつの説明から考えてもらう）
     ※ 理由が決まっていないとき（ふつうは起きない）は normal（どのおやつでも終わる） */
  function getSnackTantrumFit(snackId: SnackId): TantrumSnackFit {
    if (tantrumReason.value === null) {
      return 'normal';
    }

    return snackTantrumFits[snackId][tantrumReason.value];
  }


  /* いやいやの理由を決める（新しいいやいやが起きると決まったあとに、1回だけ呼ぶ）

     ■ 重み付きのくじ引き
       4つの理由に「出やすさ（weight）」を付けて引く（weight が大きいほど出やすいが、0でなければ出ることがある）
     ■ 出やすさ
       tired        … 体力が低いほど出やすい
       hungry       … 11:00をすぎたら出る
       doItMyself   … 機嫌が低いほど出やすい
       wantMorePlay … 11:00をすぎたら出る。元気が残っているほど出やすい
       ※ 11:00より前に「まだ遊びたい」を出さないのは、まだ時間がたっぷりあるのに「まだあそぶー！」とぐずるのは不自然なため
         （そのため 11:00より前は、つかれた か じぶんでやりたい のどちらか） */
  function chooseTantrumReason(): TantrumReason {
    const isAfterEleven = currentMinutes.value >= 11 * 60;

    // ① つかれた
    let tiredWeight = 1;

    if (childEnergy.value <= 30) {
      tiredWeight = 5;
    } else if (childEnergy.value <= 50) {
      tiredWeight = 3;
    }

    // ② おなかすいた
    const hungryWeight = isAfterEleven ? 4 : 0;

    // ③ じぶんでやりたい
    let doItMyselfWeight = 1;

    if (childMood.value <= 30) {
      doItMyselfWeight = 5;
    } else if (childMood.value <= fussMoodLine) {
      doItMyselfWeight = 3;
    }

    // ④ まだ遊びたい
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
      { reason: 'doItMyself', weight: doItMyselfWeight },
      { reason: 'wantMorePlay', weight: wantMorePlayWeight },
    ];

    // くじの本数の合計（つかれた・じぶんでやりたい は最低でも1ずつあるので、0にはならない）
    let totalWeight = 0;

    for (const candidate of candidates) {
      totalWeight += candidate.weight;
    }

    /* 0以上「合計」未満のランダムな数を出して、前から順に見ていく
       その理由の weight より小さければ決まり、大きければ weight のぶんを引いて次へ（weight が 0 の理由は選ばれない） */
    let randomNumber = Math.random() * totalWeight;

    for (const candidate of candidates) {
      if (randomNumber < candidate.weight) {
        return candidate.reason;
      }

      randomNumber -= candidate.weight;
    }

    // 小数の誤差でここまで来たときの念のため（つかれた は、どの時間でも候補に入っている）
    return 'tired';
  }

  /* いやいや判定（体力・機嫌・時間から、いやいやが起きる確率を出して、その確率で発生させる）
     ※ ここで決めるのは「起きるか」だけ。「なぜ泣いているか」は chooseTantrumReason() で別に決める */
  function checkTantrum() {
    // すでにいやいや中のときは、もう一度判定しない
    if (isTantrum.value) {
      return;
    }

    /* 体力が71以上あるうちは、いやいやは起こらない
       ただし11:00をすぎたら、元気でも「おなかすいた」「まだ帰りたくない」でぐずることがある
       （これが無いと、体力を減らさないように遊ぶだけで、いやいやを完全に避けられてしまうため） */
    if (childEnergy.value >= fussEnergyLine && currentMinutes.value < 11 * 60) {
      return;
    }

    // いやいやが起きる確率（0.5 なら 50%）
    let tantrumChance = 0;

    // ① こうちゃんの体力（疲れているほど起きやすい）
    if (childEnergy.value <= 30) {
      tantrumChance += 0.6;
    } else if (childEnergy.value <= 50) {
      tantrumChance += 0.35;
    } else {
      tantrumChance += 0.1; // 51〜70のとき
    }

    // ② こうちゃんの機嫌（悪いほど起きやすい。51以上なら上乗せなし）
    if (childMood.value <= 30) {
      tantrumChance += 0.2;
    } else if (childMood.value <= fussMoodLine) {
      tantrumChance += 0.1;
    }

    // ③ 今の時間（11:00をすぎると、おなかもすいて眠くなる）
    if (currentMinutes.value >= 11 * 60) {
      tantrumChance += 0.1;
    }

    const randomNumber = Math.random();

    if (randomNumber >= tantrumChance) {
      return;
    }

    isTantrum.value = true;
    tantrumCount.value += 1;

    /* 新しいいやいやが起きると決まったので、前のいやいやの記録をまっさらに戻してから、理由を決める（レベルは 1 から）
       ※ 機嫌が -15 される（この下）より前に決める（泣きだす前の様子で、理由を選びたいため） */
    resetTantrumState();
    tantrumReason.value = chooseTantrumReason();

    // 発生音とオーバーレイは、新しいいやいやが始まったこの瞬間だけ（同じいやいやが続くときは、いちばん上で return している）
    playTantrumSound();

    showTantrumAlert();

    /* BGMを、いやいやBGMへ切りかえる（いやいや発生の結果カードを読んでいるあいだから、もう鳴らす）
       ・公園BGM・こもれびの広場BGMを stop（先頭へ戻す）にするのは、公園へ戻るときに曲を「仕切りなおし」にしたいため
       ・どの場所でも起こるので、公園BGMとこもれびの広場BGMの両方を止める（秘密の場所でも特別あつかいしない）
       ・いやいやBGMは、発生音が鳴り終わってから入る（このあと GAME OVER になったときは、checkGameOver() が予約を取り消す） */
    stopParkBgm();
    stopSecretBgm();
    playTantrumBgmSoon();

    childMood.value -= 15;
    parentCalm.value -= 12;

    tantrumText.value = '「いやー！」その場にぺたんと座りこんでしまいました。';
  }

  /* ===== いやいや中（なだめる場面） =====

     1回の対応の結果は、次の3種類のどれか
       ・解決する     … isTantrum を false にする
       ・少し落ち着く … レベルが1段下がる（いやいやは続く）
       ・悪化する     … レベルが1段上がる（大いやいやのままなら、親の余裕が減る）

     ・お話する … じぶんでやりたい・まだ遊びたい なら正解（ナイス対応）。つかれた・おなかすいた には効かず、悪化
     ・だっこ   … 安全策。どのレベルでも必ず解決（はげしいほど親の体力を多く使う）。つかれた なら ナイス対応
     ・おやつ   … 相性しだい（great 解決＋ナイス対応 ／ normal ぐずぐずなら解決 ／ weak 悪化）
     ・待つ     … ギャンブル。成功すれば解決か少し落ち着く、失敗すると悪化。じぶんでやりたい で成功したら ナイス対応

     対応4つは、どれも親の余裕が減る（何で払うかがちがうだけ）
     ・お話する … 親の体力 -2       ／ 親の余裕 -4
     ・だっこ   … 親の体力 -16〜-24 ／ 親の余裕 -5
     ・おやつ   … おやつ -1         ／ 親の余裕 -3（1日2個まで）
     ・待つ     … 親の体力 +2       ／ 親の余裕 -18 */

  /* 大いやいや（レベル3）に上がった瞬間の、親の余裕の追加コスト（上がった1回だけ） */
  const bigTantrumEnterCalmCost = 5;

  /* 大いやいや（レベル3）のまま、さらに対応がずれたときの親の余裕の追加コスト（そのたびに） */
  const bigTantrumFailureCalmCost = 4;

  /* いやいやの状態を「いやいやしていない」に戻す
     （新しいいやいやが始まったとき・いやいやタイムの画面から出るとき・もう一度あそぶとき）
     ※ isTantrum と tantrumCount は戻さない（大事な印とプレイ全体の記録なので、それぞれの場所ではっきり書き分ける） */
  function resetTantrumState() {
    tantrumReason.value = initialTantrumReason;
    tantrumLevel.value = initialTantrumLevel;
    lastTantrumAction.value = initialLastTantrumAction;
    repeatedTantrumActionCount.value = initialRepeatedTantrumActionCount;
    hasNiceTantrumResponse.value = initialHasNiceTantrumResponse;
    niceTantrumResponseText.value = initialNiceTantrumResponseText;
    tantrumText.value = initialTantrumText;
  }

  /* いやいやを1段はげしくする（3 のときは 3 のまま。上げたあとのレベルを返す） */
  function increaseTantrumLevel(): TantrumLevel {
    if (tantrumLevel.value === 1) {
      tantrumLevel.value = 2;
    } else {
      tantrumLevel.value = 3;
    }

    return tantrumLevel.value;
  }

  /* いやいやを amount 段だけ落ち着かせる（1 より下にはならない。1 まで下がっても、いやいやは終わらない） */
  function decreaseTantrumLevel(amount = 1) {
    for (let i = 0; i < amount; i++) {
      if (tantrumLevel.value === 3) {
        tantrumLevel.value = 2;
      } else if (tantrumLevel.value === 2) {
        tantrumLevel.value = 1;
      }
    }
  }

  /* 対応がずれて、いやいやが悪化したときの共通処理（結果の文章のうしろに、悪化したことが分かる一文を足す）

     ・ぐずぐず／大泣き … レベルを1段上げる（大いやいやに上がった瞬間だけ、親の余裕 -5）
     ・大いやいや       … これ以上は上がらない代わりに、親の余裕 -4（「親のほうが少しずつしんどくなる」）
     ※ 呼ぶ前に、resultMessage へ「何をしたか」の文を入れておく
     ※ saveStatusChanges() より前に呼ぶ（追加コストも「今回の変化」に入れるため） */
  function applyTantrumFailurePenalty() {
    if (tantrumLevel.value === 3) {
      parentCalm.value -= bigTantrumFailureCalmCost;
      resultMessage.value += '全身でいやいやしたまま。親もだんだんしんどくなってきました……';
      return;
    }

    /* 戻り値で受け取るのは、TypeScript がすぐ上の if で「ここでは 3 ではない」と覚えたままになり、
       tantrumLevel.value === 3 と書くと「ありえない比較」とエラーにしてしまうため */
    const newLevel = increaseTantrumLevel();

    if (newLevel === 3) {
      parentCalm.value -= bigTantrumEnterCalmCost;
      resultMessage.value += '泣き声がさらに大きく！ 親もちょっと焦ってきます……';
      return;
    }

    resultMessage.value += '泣き声が、さっきより大きくなりました……';
  }

  /* いやいや中に選んだ対応を記録する（どの対応も、startStatusChanges() のすぐあとに呼ぶ）
     直前と同じ対応なら repeatedTantrumActionCount を1増やし（最大2）、ちがう対応なら 0 に戻す */
  function registerTantrumAction(action: TantrumAction) {
    if (lastTantrumAction.value === action) {
      repeatedTantrumActionCount.value = Math.min(repeatedTantrumActionCount.value + 1, 2);
    } else {
      repeatedTantrumActionCount.value = 0;
    }

    lastTantrumAction.value = action;
  }

  /* ナイス対応のボーナスを足す（ボーナスを足すのはここだけ）

     ・1回のいやいやにつき1回だけ（もらったあとは、ボーナスも表示も出さない。表示の「+3」と食いちがうため）
     ※ saveStatusChanges() より前に呼ぶ（ボーナスのぶんも「今回の変化」に入れるため）
     ※ そのあとの fixAllStatus() と checkGameOver() は、呼んだ側でいつもどおり行う */
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

     理由・レベルに関係なく、必ず いやいや は終わる
     ただし親の体力を多く使い（はげしいほど多め）、気持ちの消耗もあるので親の余裕も少し減る
     「つかれた」いやいやなら、どのレベルでも ナイス対応
     ※ 必ず終わるので、同じ対応の連続は関係しないが、記録はほかの対応とそろえて残す */
  function hugChild() {
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
    if (tantrumReason.value === 'tired') {
      resultMessage.value += 'だっこで足も休めて、ほっとしたようです。';
      applyNiceTantrumResponse();
    }

    saveStatusChanges();
    fixAllStatus();

    // だっこは親の体力を多く使うので、残りが少ないとここでGAME OVERになる
    checkGameOver();

    selectedCommandIndex.value = 0;
  }

  /* ② おやつをあげる（おやつバッグで選んだときに呼ばれる）

     ・おやつごとにちがう … こうちゃんの体力・機嫌、かかる時間
     ・どのおやつでも同じ … おでかけポイント +2 ／ 親の体力 -5 ／ 親の余裕 -3
     ・相性 × いまのレベル … great 解決＋ナイス対応 ／ normal ぐずぐずなら解決・大泣き以上なら1段落ち着く ／ weak 悪化
     ※ どの相性でも、おやつは食べたのでバッグから減り、体力・機嫌の回復はそのまま入る
       （おなかや体は回復するが、泣いている気持ちのほうは、おやつではおさまらなかった、という考え方） */
  function giveSnack(snackId: SnackId) {
    // バッグに入っていないおやつなら、何もしない（startStatusChanges() より前に確かめる）
    const snack = findSnackInBag(snackId);

    if (!snack) {
      return;
    }

    startStatusChanges();
    registerTantrumAction(`snack:${snack.id}`);

    childEnergy.value += snack.energy;
    childMood.value += snack.mood;
    addMinutes(snack.minutes);

    outingPoint.value += 2;
    parentEnergy.value -= 5;
    // いやいや対応の中では、いちばん軽く済む（そのかわり、おやつは2個しか無い）
    parentCalm.value -= 3;

    const fit = getSnackTantrumFit(snack.id);

    if (fit === 'great') {
      // ぴったり：どんなにはげしく泣いていても、落ち着いてくれる
      isTantrum.value = false;

      resultMessage.value = `「……たべる」${snack.name}をもぐもぐ。涙が止まってきました。`;

      if (currentTantrumReasonInfo.value) {
        resultMessage.value += currentTantrumReasonInfo.value.greatSnackText;
      }

      applyNiceTantrumResponse();
    } else if (fit === 'normal' && tantrumLevel.value === 1) {
      // ふつう × ぐずぐず：おやつがうれしくて、そのまま落ち着く
      isTantrum.value = false;

      resultMessage.value = `「……たべる」${snack.name}をもぐもぐ。涙が止まってきました。`;
    } else if (fit === 'normal') {
      // ふつう × 大泣き・大いやいや：少し落ち着くが、気持ちまではおさまらない
      decreaseTantrumLevel();

      resultMessage.value = `${snack.name}で泣き声は少し小さく。でも、まだいやいや中です。`;
    } else {
      // ずれている：食べてはくれたが、泣いている理由には合っていない（同じいやいやが続くだけ）
      const complaint = currentTantrumReasonInfo.value?.complaint ?? 'いやー！';

      resultMessage.value = `${snack.name}は食べたけれど「${complaint}」。`;

      applyTantrumFailurePenalty();
    }

    saveStatusChanges();
    fixAllStatus();

    checkGameOver();

    // ステータスの計算がぜんぶ終わってから、食べたおやつをバッグから出す
    removeSnackFromBag(snack.id);

    selectedCommandIndex.value = 0;
  }

  /* ③ お話してみる（親の体力 -2 ／ 親の余裕 -4 ／ 5分 … どの理由・レベルでも同じ）

     ■ じぶんでやりたい／まだ遊びたい … お話が正解（機嫌 +12 ／ ナイス対応）
       ・ぐずぐず・大泣き … 解決
       ・大いやいや       … 泣き声が大きすぎて1回では話がぜんぶ入らないので、1段落ち着くだけ
                             （対応そのものは正しいので、ナイス対応は付ける）
       ・続けてお話したとき … 親の余裕 さらに -2
     ■ つかれた／おなかすいた … 体のほうが限界なので効かない（機嫌 +2 だけ入り、悪化する）
       ・続けてお話したとき … 親の余裕 さらに -3
     ※ いやいやが続いても checkTantrum() は呼ばない（同じいやいやが続いているだけなので） */
  function talkToChild() {
    startStatusChanges();
    registerTantrumAction('talk');

    // 直前もお話だった（同じ話をくり返している）か
    const isRepeatedTalk = repeatedTantrumActionCount.value > 0;

    parentEnergy.value -= 2;
    parentCalm.value -= 4;
    addMinutes(5);

    if (tantrumReason.value === 'doItMyself' || tantrumReason.value === 'wantMorePlay') {
      childMood.value += 12;

      if (isRepeatedTalk) {
        parentCalm.value -= 2;
      }

      const words = tantrumReason.value === 'doItMyself' ? '「自分でやりたかったんだね」' : '「まだ遊びたかったんだね」';

      if (tantrumLevel.value === 3) {
        decreaseTantrumLevel();

        resultMessage.value = `${words}泣き声は少し小さく。でも、まだ涙は止まりません。`;
      } else {
        isTantrum.value = false;

        resultMessage.value =
          tantrumReason.value === 'doItMyself' ? `${words}涙をふいて、落ち着いてきました。` : `${words}「うん…」とうなずいて、落ち着きました。`;
      }

      if (isRepeatedTalk) {
        resultMessage.value += '同じ話のくり返しで、親も少し疲れました。';
      }

      // 1回のいやいやで2回目のときは、applyNiceTantrumResponse() の中で何もしない
      applyNiceTantrumResponse();
    } else {
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

    saveStatusChanges();
    fixAllStatus();

    checkGameOver();

    selectedCommandIndex.value = 0;
  }

  /* 「少し待ってみる」が成功する確率（0.7 なら 70%）

     ① 理由ごとの基本 … じぶんでやりたい 70% ／ まだ遊びたい 55% ／ つかれた 35% ／ おなかすいた 20%
        （手を出さずに見守れば、自分でやってみて気がすむことが多いが、体の疲れや空腹は、待ってもそのまま）
     ② 激しさ        … 大泣き -10 ／ 大いやいや -20
     ③ 待つの連続    … 2回続けた -15 ／ 3回以上 -30
     ④ 0〜100% の中におさめる
     ※ ③を正しく数えるため、registerTantrumAction('wait') のあとに呼ぶ
     ※ %の整数で計算するのは、0.55 - 0.1 のような小数どうしの計算だと、小さな誤差が出ることがあるため */
  function getWaitSuccessChance() {
    // ① 理由が決まっていないとき（ふつうは起きない）は50%
    let chancePercent = 50;

    switch (tantrumReason.value) {
      case 'doItMyself':
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

    // ②
    if (tantrumLevel.value === 2) {
      chancePercent -= 10;
    } else if (tantrumLevel.value === 3) {
      chancePercent -= 20;
    }

    // ③ 直前も「待つ」だったときだけ、くり返しの回数を見る
    const waitRepeatCount = lastTantrumAction.value === 'wait' ? repeatedTantrumActionCount.value : 0;

    if (waitRepeatCount === 1) {
      chancePercent -= 15;
    } else if (waitRepeatCount >= 2) {
      chancePercent -= 30;
    }

    // ④
    chancePercent = Math.min(100, Math.max(0, chancePercent));

    return chancePercent / 100;
  }

  /* ④ 少し待ってみる（ギャンブル）

     ・成功 … ぐずぐずなら解決／大泣き以上なら1段落ち着く
              じぶんでやりたい で成功したら、ナイス対応（1段落ち着くだけでも、見守ったこと自体は良かったので）
     ・失敗 … 悪化する
     成功しても失敗しても、ステータスの増減と時間（15分）は毎回発生する
     ＝「もう一度待つか、ほかの対応を試すか」を考える場面になる */
  function waitCalmly() {
    startStatusChanges();
    registerTantrumAction('wait');

    childEnergy.value -= 4;
    childMood.value -= 6;
    parentEnergy.value += 2;
    // 泣いている横で待つのがいちばんこたえる（体力は使わないが、そのぶん親の余裕で払う）
    parentCalm.value -= 18;
    addMinutes(15);

    // 上で registerTantrumAction('wait') を呼んだあとなので、「待つの連続」も確率に入る
    const calmSuccess = Math.random() < getWaitSuccessChance();
    const isDoItMyself = tantrumReason.value === 'doItMyself';

    if (calmSuccess) {
      if (tantrumLevel.value === 1) {
        isTantrum.value = false;

        resultMessage.value = 'となりで待っていると、自分で涙をふいて落ち着いてきました。';
      } else {
        decreaseTantrumLevel();

        resultMessage.value = '待っていると、泣き声は少し小さく。でも、まだ涙は止まりません。';
      }

      if (isDoItMyself) {
        applyNiceTantrumResponse('そっと見守ったのが、よかったみたい！');
      }
    } else {
      // 失敗：同じいやいやが続いたまま、悪化する（checkTantrum() は呼ばない）
      const complaint = currentTantrumReasonInfo.value?.complaint;

      resultMessage.value = complaint ? `待ってみたけれど「${complaint}」。` : '待ってみたけれど、まだいやいや中です。';

      // 待つを続けると効きにくくなることを、様子として伝える（「別の対応を試したほうがよさそう」と気づけるように）
      if (repeatedTantrumActionCount.value > 0) {
        resultMessage.value += 'このまま待っても、落ち着かなさそう。';
      }

      applyTantrumFailurePenalty();
    }

    saveStatusChanges();
    fixAllStatus();

    // 待つのは親の余裕が18減るので、残りが少ないとここでGAME OVERになる（GAME OVER画面のほうが優先される）
    checkGameOver();

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

    /* ===== 画面に出すもの（読むだけ） =====
       ※ niceTantrumResponseText と tantrumText だけは、pages/index.vue の startStatusChanges() が空へ戻している */
    tantrumLevel,
    currentTantrumLevelInfo,
    currentTantrumReasonInfo,
    currentTantrumScene,
    niceTantrumResponseText,
    tantrumText,
  };
}
