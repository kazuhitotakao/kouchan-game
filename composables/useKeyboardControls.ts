/* ============================================================
   キーボード操作をまとめた場所

   ゲーム本編（pages/index.vue）にあったキーボードの処理を、そのまま移してある

   ■ ここがやること
     ・押されたキーを見て、どの画面の操作かを振り分ける
     ・選んでいる番号（selectedCommandIndex など）を動かす
     ・ボタンへフォーカスを当てる・文章の画面をスクロールする
     ・Enter / Space のときは、親からもらった runSelectedCommand() を呼ぶ

   ■ ここがやらないこと
     ゲームの中身は、ぜんぶ親（pages/index.vue）に残してある
     「どの番号で、どの遊びの関数を呼ぶか」を決める runSelectedCommand() も親のまま
     （すべり台の遊びなども、今までどおり pages/index.vue の runPlaceAction() が実行する）

     ステータス・時間・いやいや・おやつ・BGM・効果音も、いっさいさわらない

   ■ 受けとるもの（options）
     いま使っている ref・computed・関数を、そのまま渡してもらう
     新しく状態を作って二重に持つことはしない
     （たとえば selectedCommandIndex は、親が持っている ref をそのまま動かす）

   ■ キーの受付
     画面が表示されたときに window へ登録し、消えるときに外す（onMounted / onUnmounted）
   ============================================================ */

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import type { GameEvent } from '~/types/game';

export type UseKeyboardControlsOptions = {
  /* ===== いまどの画面か ===== */
  titleEntered: Ref<boolean>;
  gameStarted: Ref<boolean>;
  isSnackSelectionOpen: Ref<boolean>;
  isHowToPlayOpen: Ref<boolean>;
  isScreenChanging: Ref<boolean>;
  currentEvent: Ref<GameEvent>;
  resultMessage: Ref<string>;

  /* ===== いま選んでいる番号（親の ref をそのまま動かす） ===== */
  selectedCommandIndex: Ref<number>;
  selectedSnackMenuIndex: Ref<number>;
  selectedGoalConfirmIndex: Ref<number>;

  /* ===== 画面の状態（見るだけ） ===== */
  /* 「どうする？」が たて1列にならんで ↑↓ で選ぶ画面か（通常の場所6か所と、ひとやすみ） */
  isPlaceMenuScene: ComputedRef<boolean>;
  isSnackMenuVisible: ComputedRef<boolean>;
  snackMenuBackIndex: ComputedRef<number>;
  commandCount: ComputedRef<number>;
  goalCommandIndex: ComputedRef<number>;
  isGoalConfirmVisible: ComputedRef<boolean>;
  isSecretPathPlaying: ComputedRef<boolean>;

  /* ===== フォーカスを当てるためのボタン・入力欄 ===== */
  startButtonRef: Ref<HTMLButtonElement | null>;
  soundtrackButtonRef: Ref<HTMLButtonElement | null>;
  minigameButtonRef: Ref<HTMLButtonElement | null>;
  selectSnacksButtonRef: Ref<HTMLButtonElement | null>;
  howToPlayButtonRef: Ref<HTMLButtonElement | null>;
  backToBootButtonRef: Ref<HTMLButtonElement | null>;
  howToBackButtonRef: Ref<HTMLButtonElement | null>;
  snackSelectionRef: Ref<HTMLElement | null>;

  /* サウンドのボタンとスライダーは SoundControl の中にあるので、親が computed で借りている */
  soundToggleButtonRef: ComputedRef<HTMLButtonElement | null>;
  soundVolumeSliderRef: ComputedRef<HTMLInputElement | null>;

  /* ===== 押されたときに親へお願いすること ===== */

  /* Enter / Space で、いま選んでいるコマンドを実行する
     どの番号がどの遊びかを決めるのは親の仕事（ゲームの中身は親に残してある） */
  runSelectedCommand: () => void;

  /* 画面の開け閉め */
  enterTitle: () => void;
  openSnackSelection: () => void;
  closeSnackSelection: () => void;
  closeHowToPlay: () => void;
  closeSnackMenu: () => void;
  closeGoalConfirm: () => void;
  confirmGoToGoal: () => void;

  /* そのほか */
  focusFirstSnackOption: () => void | Promise<void>;
  pauseCommandPointer: () => void;
  handleSecretPathKeydown: (event: KeyboardEvent) => void;
};

export function useKeyboardControls(options: UseKeyboardControlsOptions) {
  /* 受けとったものを、今までと同じ名前で使えるようにしておく
     （こうすると、pages/index.vue にあったときのコードをそのまま動かせる） */
  const {
    titleEntered,
    gameStarted,
    isSnackSelectionOpen,
    isHowToPlayOpen,
    isScreenChanging,
    currentEvent,
    resultMessage,
    selectedCommandIndex,
    selectedSnackMenuIndex,
    selectedGoalConfirmIndex,
    isPlaceMenuScene,
    isSnackMenuVisible,
    snackMenuBackIndex,
    commandCount,
    goalCommandIndex,
    isGoalConfirmVisible,
    isSecretPathPlaying,
    startButtonRef,
    soundtrackButtonRef,
    minigameButtonRef,
    selectSnacksButtonRef,
    howToPlayButtonRef,
    backToBootButtonRef,
    howToBackButtonRef,
    snackSelectionRef,
    soundToggleButtonRef,
    soundVolumeSliderRef,
    runSelectedCommand,
    enterTitle,
    openSnackSelection,
    closeSnackSelection,
    closeHowToPlay,
    closeSnackMenu,
    closeGoalConfirm,
    confirmGoToGoal,
    focusFirstSnackOption,
    pauseCommandPointer,
    handleSecretPathKeydown,
  } = options;


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

  /* ===== ここから下は、おやつバッグの中の↑↓ =====

     メインコマンドの↑↓（moveCommandUp / moveCommandDown）と同じ考えかたで、
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
     ・900px以下   … 2列（スマホ幅の700px以下も2列のまま）

     ※ スマホ幅も前は1列だったが、6段たてにならぶと1画面に収まらないので、
       2列にした（assets/css/game/command.css の .command--entrance）
  */
  const entranceColumns = ref(3);

  /* ゴールの行に入る直前、何列目にいたかを覚えておく箱
     0 = 左はし、1 = まん中、2 = 右はし

     ゴール（公園の出口へ向かう）の行は横はばをまるごと使っていて、
     ほかのコマンドのような「列」を持っていない
     そのため覚えておかないと、↑で戻るときに行き先の
     いちばんうしろへ帰ってしまい、
     「池」で↓→↑としたのに「芝生広場」に移動してしまう

     ※ 見た目には出てこない、キーボード操作のためだけのメモ
  */
  const entranceColumnBeforeGoal = ref(0);

  /* いまの画面幅を見て、列の数を updateする
     画面が表示されたときと、幅が変わったときに呼ぶ
  */
  function updateEntranceColumns() {
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
     いちばん上の「すべり台」へは回りこまない
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

     いちばん最初の「すべり台」で←を押しても、動かない
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
     いちばん最初の「すべり台」へは回りこまない
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

  /* ============================================================
     起動画面（A）・タイトル画面（B）のキーボード操作

     この2つの画面で操作するものは、A画面もB画面も4つ
       A … ① はじめる             ② ♪（サウンドトラック）   ③ 🌿 ミニゲーム ④ サウンドON/OFF
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
      : [startButtonRef.value, soundtrackButtonRef.value, minigameButtonRef.value, soundToggleButtonRef.value]; // A画面

    return items.filter((item): item is HTMLButtonElement => item !== null);
  }

  /* ↑↓←→ でフォーカスを動かす

     ■ A画面（ボタン4つ）

       [ ♪ ][ 🌿 ミニゲーム ]        [ サウンドON/OFF ]

                    [ はじめる ]

     ■ B画面（ボタン4つ）

       [ はじめの画面へ戻る ]     [ ？ あそびかた ][ サウンドON/OFF ]

                   [ きょうのおやつを選ぶ ]

     どちらの画面も「下にメインのボタンが1つ、上の行にいくつか」の形なので、同じ動きにしている
       ・↑ ↓ … メインのボタンと、上の行を行き来する
                （メインからは、さっき上の行でいたボタンへ戻る。覚えていないときは左上のボタン（♪／はじめの画面へ戻る）へ）
       ・← → … 上の行を、となりへ1つずつ動く
                （はしまで来たら反対のはしへ回りこむ。メインにいるときは、←で左上・→で右上のサウンドへ）

     どのキーもかならずどこかへ動くので、ボタンを矢印キーだけで選べる

     ※ 前はA画面だけ「上の行は2つ」と決めて書いていたが、
       ミニゲームの入口が増えて上の行が3つになったので、B画面と同じ書きかたにそろえた */
  /* 上の行から ↓ でメインのボタンへ下りたとき、上の行のどのボタンにいたか

     ↑ で上の行へ戻るときに、同じボタンへ戻すために覚えておく
     （サウンドから↓で「はじめる」へ下りたら、↑でサウンドへ戻る。A画面の 🌿 ミニゲーム・B画面の ？ あそびかた も同じ）
     ボタンそのものを覚えているので、A画面⇄B画面で画面が入れかわると、もう画面に無いボタンになる
     そのときは覚えていないのと同じにして、左上のボタンへ戻す */
  let lastTitleTopItem: HTMLButtonElement | null = null;

  function moveTitleFocusByArrow(key: string) {
    const items = getTitleFocusItems();
    const active = document.activeElement;

    // そろっていないときは何もしない（画面の切りかわり中など）
    // どちらの画面も4つ
    if (items.length < 4) {
      return;
    }

    // getTitleFocusItems() の並びは「メイン → 上の行を左から」
    const [mainButton, ...topRow] = items;

    // 上の行の何番目にいるか（上の行にいないときは -1）
    const topIndex = topRow.findIndex((button) => button === active);

    // ↑ ↓：メインのボタン ⇔ 上の行
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      if (active === mainButton) {
        /* 上の行へ戻るときは、さっき上の行でいた場所へ戻る（→ lastTitleTopItem）
           （サウンドから↓で「はじめる」へ来たなら、↑でサウンドへ戻る）
           覚えている場所が無い・この画面には無い（A→Bで画面が変わった など）ときは、
           真上の左上のボタンへ（A画面なら ♪ サウンドトラック、B画面なら はじめの画面へ戻る） */
        const lastTopItem = lastTitleTopItem && topRow.includes(lastTitleTopItem) ? lastTitleTopItem : topRow[0];

        lastTopItem.focus();
      } else {
        // 上の行からメインのボタンへ下りるときに、いまいた場所を覚えておく
        if (topIndex !== -1) {
          lastTitleTopItem = topRow[topIndex];
        }

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
     ※ 通常の場所6か所と ひとやすみ（ベンチ）は、「どうする？」がたて1列なので、↑↓ はコマンドを選ぶのに使う
     ※ おやつバッグは handleKeydown() でこれより先に受け取るので、
       開いているあいだの ↑↓ はスクロールに取られない */
  const isReadingScene = computed(() => {
    if (currentEvent.value === 'parkEntrance' || isSecretPathPlaying.value) {
      return false;
    }

    return !isPlaceMenuScene.value || !!resultMessage.value;
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

       いちばん内側のメニューなので、メインコマンドより先に見る

       ・↑↓           バッグの中で選ぶ（いちばん下は「← もどる」）
       ・Enter / Space 選んでいるおやつを食べる（「← もどる」なら戻る）
       ・Escape        1つ前のメニューへ戻る（ひとやすみ の休憩・おやつ／いやいやのコマンド）
                       ゲームを終えたり、タイトルへ戻ったりはしない

       ※ Enter / Space で preventDefault() を呼ぶのが大事
         フォーカスが当たっているボタンの「本来のクリック」が止まるので、
         1回押しただけで「ここでの実行」と「ボタンのクリック」の2回ぶん
         おやつを食べてしまう、ということが起きない
         （メインコマンドと同じやりかた）
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

  /* 画面が表示されているあいだだけ、キーボードの受付をする
     （pages/index.vue の onMounted / onUnmounted でやっていた登録・解除を、そのまま持ってきた） */
  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  return {
    /* テンプレートで使うもの */
    gameScreenRef,
    moveSnackSelectionToHovered,

    /* pages/index.vue のほかの場所から呼ぶもの */
    updateEntranceColumns,
    focusTitleMainButton,
    handleKeydown,
  };
}
