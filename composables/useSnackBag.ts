/* ============================================================
   きょうのおやつ（公園へ持っていくおやつ ＝ バッグの中身）

   ゲーム本編（pages/index.vue）にあった
   「おやつ袋の中身と、その出し入れ」だけを取り出してある

   ■ ここがやること
     ・バッグの中身（selectedSnackIds）を持つ
     ・中身から決まる表示用の値を作る（中身の本体・残り個数・いっぱいか・出発できるか）
     ・名札からおやつの中身をさがす／バッグに入っているか確かめる／バッグから出す
     ・バッグを空に戻す（resetSnackBag()）

   ■ ここがやらないこと
     ・おやつ選択画面の開け閉めと、カードを押したときの出し入れ
       （openSnackSelection()・closeSnackSelection()・toggleSnackSelection()・
         confirmSnacksAndStartGame()）は、画面の進行とつながっているので pages/index.vue のまま
       あちらは、ここから受けとった selectedSnackIds を今までどおり直接書きかえる
     ・おやつを食べる行動そのもの（ステータスの増減・時間・結果の文章）も pages/index.vue のまま
       いやいや中におやつを使うところは composables/useTantrum.ts のまま
       どちらも findSnackInBag() / removeSnackFromBag() を呼ぶだけ

   ■ selectedSnackIds の2つの顔

     ゲーム開始前 … 「公園へ持っていくおやつ」
     ゲーム中     … 「いまバッグに残っているおやつ」

     どちらも同じ配列で、食べるたびにそのおやつの名札が消えていく
       出発したとき   ['gummy', 'senbei']
       グミを食べた   ['senbei']
       せんべいも食べた []

     「残りのおやつ」を別の配列に写したりはしないので、
     バッグの中身が2か所でずれることがない
     おやつの残り個数（snackLeft）も、この配列の長さそのもの

   ■ 出し入れのしかたは、いっさい変えていない
     同じおやつは1個まで・食べたら名札を消す・最大2個、という決まりもそのまま

   ■ おやつの中身（名前・絵文字・回復量）と最大の数は data/snacks.ts のものをそのまま使う
     同じおやつ一覧を、ここへ書き写してはいない

   ■ 外からもらうものは無い（options なし）
     おやつ袋は data/snacks.ts のデータだけで完結するので、
     ほかの composable やゲームの状態を受けとる必要がない
   ============================================================ */

import { computed, ref } from 'vue';

import { maxSnackCount, snacks } from '~/data/snacks';
import type { Snack, SnackId } from '~/types/game';

export function useSnackBag() {
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
     見つからなかったときは undefined になる

     ※ このファイルの中だけで使う（selectedSnacks と findSnackInBag から） */
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

  /* バッグを空に戻す

     呼ぶところは2か所
     ・もう一度あそぶ／はじめの画面へ戻る（pages/index.vue の resetGame()）
     ・A画面（起動画面）へ戻る（pages/index.vue の goBackToBoot()）

     ※ ゲーム中におやつを食べて減るのは removeSnackFromBag() のほう
       こちらへまとめてはいない（食べるのは、ふつうのゲームの進みかたなので）

     ※ からっぽの配列を作りなおして入れかえる
       （前と同じ配列を使いまわして中身だけ消す、というやりかたはしない） */
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

    /* ===== バッグを空に戻す ===== */
    resetSnackBag,
  };
}
