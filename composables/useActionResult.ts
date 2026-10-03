/* ============================================================
   通常の行動1回ぶんの結果（結果カードと上部ステータスへ出すもの）の入れもの

   ■ ここがやること
     ・結果の文章・今回の変化・行動前の控え・見つけたもの、を持つ
     ・行動が終わったあとの変化量を作る（saveStatusChanges()）
     ・「今回の変化」の表示データを組み立てる（changeGroups。組み立てかたは utils/changeGroups.ts）

   ■ ここがやらないこと
     ・行動の中身と、行動をはじめる共通の入口 startStatusChanges()（pages/index.vue。受けとった ref へ直接書きかえる）
     ・ゲーム終了時の結果（useGameResult.ts）
   ============================================================ */

import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import { buildChangeGroups } from '~/utils/changeGroups';
import type { StatusSnapshot } from '~/utils/changeGroups';
import type { StatusChanges } from '~/types/game';

/* ============================================================
   最初の状態（初期値）

   入れものを作るときと、resetActionResult() で戻すときの両方が、ここの値を見る
   ※ 配列（見つけたもの）と行動前の控えは、ここに置かない
     （同じものを使いまわすと、前の行動とつながってしまうので、毎回作りなおす）
   ============================================================ */
const initialResultMessage: string = ''; // 結果の文章
const initialStatusChanges: StatusChanges | null = null; // 今回の変化（null = まだ結果がない）

/* 行動する前のステータスの控え（最初はぜんぶ0） */
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
  /* ===== 行動したあとの、いまのステータス（変化量の計算と表示に使うので、ref のまま受けとる） ===== */
  childEnergy: Ref<number>;
  childMood: Ref<number>;
  outingPoint: Ref<number>;
  parentEnergy: Ref<number>;
  parentCalm: Ref<number>;

  /* ===== ゲーム内の時間 =====
     currentMinutes … 何分たったかの計算に使う ／ currentTime … 「今回の変化」に出す時刻の表示に使う */
  currentMinutes: ComputedRef<number>;
  currentTime: Ref<string>;
};

export function useActionResult(options: UseActionResultOptions) {
  const { childEnergy, childMood, outingPoint, parentEnergy, parentCalm, currentMinutes, currentTime } = options;

  /* 今回の行動で新しく見つけたもの（結果カードに「★ アイテム発見！」を出すためだけに使う。行動をはじめるたびに空にする） */
  const foundItemsThisAction = ref<string[]>([]);

  const resultMessage = ref(initialResultMessage);

  /* 今回の行動による変化（null … まだ結果がない。場所を移動したら null に戻す） */
  const statusChanges = ref<StatusChanges | null>(initialStatusChanges);

  /* 行動する前のステータスの控え（控えるのは pages/index.vue の startStatusChanges()）
     GAME OVER画面で「親の体力 10 → 0」のように行動前の値も出したいので、画面からも読める ref にしている */
  const statusBefore = ref(createInitialStatusBefore());

  /* 行動の中身がぜんぶ終わったあとに呼ぶ（「今の値 － 行動前の値」で、今回の変化量を作る）

     行動につき1回だけ計算するので、いやいや発生の分なども、ぜんぶ合計された数になる
     ※ 必ず fixAllStatus()（0〜100に丸める処理）より前に呼ぶ
       （親の体力が0のときにだっこすると、丸めたあとでは 0 のままで「-15」が消えてしまうため） */
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

  /* 中央の「今回の変化」を、誰の情報かで3つのまとまりに分けたもの */
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

  /* ここで持っている状態を、最初の状態へ戻す（もう一度あそぶとき）
     ※ ゲームの途中で表示を消すのは、startStatusChanges()・goToPlace()・goToNextPlace() などが、それぞれの場所で行う */
  function resetActionResult() {
    resultMessage.value = initialResultMessage;
    statusChanges.value = initialStatusChanges;
    statusBefore.value = createInitialStatusBefore();

    foundItemsThisAction.value = [];
  }

  return {
    /* ===== 結果カードに出すもの ===== */
    resultMessage,
    foundItemsThisAction,

    /* ===== 今回の変化（上部ステータスと結果カードに出す） ===== */
    statusChanges,
    statusBefore,
    changeGroups,

    /* ===== 行動が終わったあとに呼ぶ ===== */
    saveStatusChanges,

    resetActionResult,
  };
}
