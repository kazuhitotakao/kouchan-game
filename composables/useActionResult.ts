/* ============================================================
   通常の行動1回ぶんの結果（画面に出すためのメモ）

   ゲーム本編（pages/index.vue）にあった
   「公園で1回行動したときに、結果カードと上部ステータスへ出すもの」の
   入れものだけを取り出してある

   ■ ここがやること
     ・結果の文章・今回の変化・行動前の控え・見つけたもの・
       ちょっとしたできごと・休憩／おやつの結果かどうか、を持つ
     ・行動が終わったあとの変化量を作る（saveStatusChanges()）
     ・「今回の変化」の表示データを組み立てる（changeGroups）
     ・そのぜんぶを最初の状態へ戻す（resetActionResult()）

   ■ ここがやらないこと
     ・行動の中身（ステータスの増減・時間・アイテム取得・ちょっとしたできごとの抽選）は、
       ぜんぶ pages/index.vue のまま
       ここが持っているのは入れものだけで、入れるのは今までどおりあちら
       （resultMessage.value = ... のように、受けとった ref へ直接書きかえる）
     ・行動をはじめる共通の入口 startStatusChanges() も pages/index.vue のまま
       決定音・サブメニューを閉じる・いやいやの表示を消す、も同じ場所で行うため
     ・表示データの組み立てかたは utils/changeGroups.ts の buildChangeGroups() のまま
     ・ゲーム終了時の結果（スコア・ランク・GAME OVER）は composables/useGameResult.ts

   ■ 書きかえかた・計算式・消すタイミングは、いっさい変えていない
     pages/index.vue にあったときと同じものを、同じ順番で動かしている

   ■ 初期値の置き場所は、このファイルの「最初の状態（初期値）」1か所だけ
     ref を作るときと、resetActionResult() で戻すときの両方がそこを見るので、
     同じ値を2か所に書いておく必要がない（composables/useGameState.ts と同じ考えかた）
   ============================================================ */

import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import { buildChangeGroups } from '~/utils/changeGroups';
import type { StatusSnapshot } from '~/utils/changeGroups';
import type { RandomEventEffect, StatusChanges } from '~/types/game';

/* ============================================================
   最初の状態（初期値）

   ・useActionResult() を呼んで、入れものを作るとき
   ・「もう一度あそぶ」で最初に戻すとき（resetActionResult()）

   の両方が、ここに書いた値を見る
   初期値を変えたいときは、この場所だけを直せばよい

   ※ 配列（見つけたもの・ちょっとしたできごとの増減）は、ここに置いていない
     同じ配列を使いまわすと、戻したはずの中身が前の行動とつながってしまうので、
     作るときも戻すときも、毎回からっぽの配列を作りなおす

   ※ 行動前の控え（statusBefore）も、中身のあるオブジェクトなので同じ理由で
     createInitialStatusBefore() が毎回新しいものを作る
     （同じオブジェクトを使いまわすと、戻したはずの控えが前の行動とつながってしまう）
   ============================================================ */
const initialResultMessage: string = ''; // 結果の文章
const initialStatusChanges: StatusChanges | null = null; // 今回の変化（null = まだ結果がない）
const initialIsCareActionResult: boolean = false; // いま出ている結果が、休憩・おやつのものか
const initialRandomEventText: string = ''; // ちょっとしたできごとの文章

/* 行動する前のステータスの控え（最初はぜんぶ0）
   pages/index.vue の ref 生成時と resetGame() に、同じ形が2つ書いてあったものをまとめたもの */
function createInitialStatusBefore(): StatusSnapshot {
  return {
    childEnergy: 0,
    childMood: 0,
    outingPoint: 0,
    parentEnergy: 0,
    parentCalm: 0,
    minutes: 0,
  };
}

export type UseActionResultOptions = {
  /* ===== 行動したあとの、いまのステータス（持ち主は composables/useGameState.ts） =====
     変化量の計算と「今回の変化」の表示に使うので、値ではなく ref のまま受けとる */
  childEnergy: Ref<number>;
  childMood: Ref<number>;
  outingPoint: Ref<number>;
  parentEnergy: Ref<number>;
  parentCalm: Ref<number>;

  /* ===== ゲーム内の時間 =====
     currentMinutes … 変化量（何分たったか）の計算に使う
     currentTime    … 「今回の変化」に出す時刻の表示に使う */
  currentMinutes: ComputedRef<number>;
  currentTime: Ref<string>;
};

export function useActionResult(options: UseActionResultOptions) {
  /* 受けとったものを、今までと同じ名前で使えるようにしておく
     （こうすると、pages/index.vue にあったときのコードをそのまま動かせる） */
  const { childEnergy, childMood, outingPoint, parentEnergy, parentCalm, currentMinutes, currentTime } = options;

  /* 今回の行動で新しく見つけたもの
     結果カードに「★ アイテム発見！」を出すためだけに使う（演出用）
     行動をはじめるたびに空にするので、直前の1回ぶんだけが入っている
     ※ 見つけたものの本体は collectedItems のままで、取得のルールは変えていない
  */
  const foundItemsThisAction = ref<string[]>([]);

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
  const randomEventText = ref(initialRandomEventText);
  const randomEventEffects = ref<RandomEventEffect[]>([]);

  /* 結果メッセージ */
  const resultMessage = ref(initialResultMessage);

  /* 今回の行動による変化
     null は「まだ今回の行動結果がない」という意味
     場所を移動したら null に戻して、前の変化が残らないようにする
  */
  const statusChanges = ref<StatusChanges | null>(initialStatusChanges);

  /* 行動する前のステータスを、いったん控えておく箱
     行動が終わったあとに「今の値 － 行動前の値」で変化量を計算する

     ※ GAME OVER画面で「親の体力 10 → 0」のように行動前の値も出したいので、
       ふつうの変数ではなく ref にして、画面からも読めるようにしている
     ※ 控えるのは pages/index.vue の startStatusChanges()（行動をはじめる共通の入口）
  */
  const statusBefore = ref(createInitialStatusBefore());

  /* いま出ている結果カードが、休憩・おやつの結果かどうか
     finishCareAction() で true、次の行動をはじめたとき（startStatusChanges()）や場所を出たときに false */
  const isCareActionResult = ref(initialIsCareActionResult);

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

  /* 中央の「今回の変化」を、誰の情報かで3つのまとまりに分けたもの

     表示のならびを組み立てるのは utils/changeGroups.ts の buildChangeGroups()
     ここは、行動する前の値・いまの値・今回の増減を渡すだけ
     （くわしい中身は、あちらのコメントを参照）
  */
  const changeGroups = computed(() =>
    buildChangeGroups({
      changes: statusChanges.value,
      before: statusBefore.value,
      childEnergy: childEnergy.value,
      childMood: childMood.value,
      outingPoint: outingPoint.value,
      parentEnergy: parentEnergy.value,
      parentCalm: parentCalm.value,
      currentTime: currentTime.value,
    }),
  );

  /* ここで持っている状態を、ぜんぶ最初の状態へ戻す（「もう一度あそぶ」用）

     戻すのは、この composable が持っているものだけ
     ゲーム本体の状態・いやいや・秘密の小道・ゲーム終了時の結果・画面の状態・音は、
     今までどおり pages/index.vue の resetGame() が受けもつ

     ※ ゲームの途中で「次の行動へ進むために表示を消す」のは、今までどおり
       startStatusChanges()・goToPlace()・goToNextPlace() などが
       それぞれの場所で行っている（この関数へはまとめていない）

     ※ 配列と行動前の控えは、新しいものを作りなおして入れかえる
       （前と同じものを使いまわして中身だけ消す、というやりかたはしない）
  */
  function resetActionResult() {
    resultMessage.value = initialResultMessage;
    statusChanges.value = initialStatusChanges;
    statusBefore.value = createInitialStatusBefore();
    isCareActionResult.value = initialIsCareActionResult;

    foundItemsThisAction.value = [];
    randomEventText.value = initialRandomEventText;
    randomEventEffects.value = [];
  }

  return {
    /* ===== 結果カードに出すもの ===== */
    resultMessage,
    foundItemsThisAction,
    randomEventText,
    randomEventEffects,
    isCareActionResult,

    /* ===== 今回の変化（上部ステータスと結果カードに出す） ===== */
    statusChanges,
    statusBefore,
    changeGroups,

    /* ===== 行動が終わったあとに呼ぶ（呼ぶ場所は pages/index.vue のまま） ===== */
    saveStatusChanges,

    /* ===== ここで持っている状態を、まとめて最初に戻す ===== */
    resetActionResult,
  };
}
