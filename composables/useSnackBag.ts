/* ============================================================
   きょうのおやつ（公園へ持っていくおやつ ＝ バッグの中身）

   ■ ここがやること
     ・バッグの中身（selectedSnackIds）と、そこから決まる表示用の値（中身の本体・残り個数・いっぱいか・出発できるか）
     ・名札からおやつをさがす／バッグにあるか確かめる／バッグから出す／空に戻す

   ■ ここがやらないこと
     ・おやつ選択画面の操作（画面の進行とつながっているので pages/index.vue。selectedSnackIds を直接書きかえる）
     ・おやつを食べる行動そのもの（pages/index.vue と useTantrum.ts。どちらも findSnackInBag() / removeSnackFromBag() を呼ぶだけ）

   ■ selectedSnackIds は、ゲーム開始前は「持っていくおやつ」、ゲーム中は「バッグに残っているおやつ」
     どちらも同じ配列で、食べるたびに名札が消えていく（['gummy', 'senbei'] → ['senbei'] → []）
     別の配列に写さないので、バッグの中身が2か所でずれることがない（残り個数も、この配列の長さそのもの）
   ============================================================ */

import { computed, ref } from 'vue';

import { maxSnackCount, snacks } from '~/data/snacks';
import type { Snack, SnackId } from '~/types/game';

export function useSnackBag() {
  /* 今日バッグに入れたおやつ（選んだ順。名札だけで、中身は snacks のほうが持っている）
     ※ 同じおやつは1個まで
     ※ localStorage には保存しない（その1プレイだけのもの）
     ※ 空に戻すのは、もう一度あそぶときと、A画面へ戻るときだけ（出発しても書きかえないので、そのまま公園へ持ちこまれる） */
  const selectedSnackIds = ref<SnackId[]>([]);

  /* 名札（'gummy' など）から、おやつの中身をさがす（見つからなければ undefined） */
  function findSnack(snackId: SnackId) {
    return snacks.find((snack) => snack.id === snackId);
  }

  /* 選んだおやつの中身（名札 → 本体。食べたおやつは、ここからも自動で消える）
     「snack is Snack」は、undefined を取りのぞいたあとは、もう undefined ではないと TypeScript に伝える書きかた */
  const selectedSnacks = computed(() => selectedSnackIds.value.map((id) => findSnack(id)).filter((snack): snack is Snack => snack !== undefined));

  /* おやつの残り個数（数を別に持たないので、「バッグは空なのに残り1個」のようなずれが起きない）
     ※ computed なので書きかえられない（減らすときは removeSnackFromBag()） */
  const snackLeft = computed(() => selectedSnackIds.value.length);

  /* バッグがいっぱいか（いっぱいのときは、まだ選んでいないおやつのカードを押せなくする） */
  const isSnackBagFull = computed(() => selectedSnackIds.value.length >= maxSnackCount);

  /* 公園へ出発できるか（ちょうど2種類そろっているか） */
  const canStartWithSnacks = computed(() => selectedSnackIds.value.length === maxSnackCount);

  /* そのおやつが、いまバッグに入っているか */
  function isSnackSelected(snackId: SnackId) {
    return selectedSnackIds.value.includes(snackId);
  }

  /* バッグの中にあるおやつの中身を返す（入っていなければ undefined。ここではまだバッグから消さない）
     画面にはバッグにあるおやつしか出していないが、持っていないおやつで回復しないように、ここでも確かめる */
  function findSnackInBag(snackId: SnackId) {
    if (!isSnackSelected(snackId)) {
      return undefined;
    }

    return findSnack(snackId);
  }

  /* おやつをバッグから出す
     ゲーム中は、ステータスの計算がぜんぶ終わってから呼ぶ（先に呼ぶと、途中で何かあったときに「おやつだけ減った」ことになるため） */
  function removeSnackFromBag(snackId: SnackId) {
    selectedSnackIds.value = selectedSnackIds.value.filter((id) => id !== snackId);
  }

  /* バッグを空に戻す（もう一度あそぶとき・A画面へ戻るとき） */
  function resetSnackBag() {
    selectedSnackIds.value = [];
  }

  return {
    /* ===== バッグの中身（おやつ選択画面から直接 出し入れする） ===== */
    selectedSnackIds,

    /* ===== 中身から決まる表示用の値 ===== */
    selectedSnacks,
    snackLeft,
    isSnackBagFull,
    canStartWithSnacks,

    /* ===== さがす・確かめる・取り出す ===== */
    isSnackSelected,
    findSnackInBag,
    removeSnackFromBag,

    resetSnackBag,
  };
}
