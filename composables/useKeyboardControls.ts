/* ============================================================
   キーボード操作をまとめた場所

   ■ ここがやること
     ・押されたキーを見て、どの画面の操作かを振り分ける
     ・選んでいる番号（selectedCommandIndex など）を動かす
     ・ボタンへフォーカスを当てる・文章の画面をスクロールする
     ・Enter / Space のときは、親からもらった runSelectedCommand() を呼ぶ

   ■ ここがやらないこと
     ゲームの中身（どの番号で、どの遊びの関数を呼ぶか・ステータス・音など）は、ぜんぶ親（pages/index.vue）のまま

   ■ 受けとるもの（options）
     親の ref・computed・関数を、そのまま渡してもらう（新しく状態を作って二重に持たない）
   ============================================================ */

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import { parkMapMoves, parkMapReturnMoves, parkMapStartPlace } from '~/data/parkMap';
import type { ParkMapDirection, ParkMapSpot } from '~/data/parkMap';
import type { GameEvent } from '~/types/game';

export type UseKeyboardControlsOptions = {
  /* ===== いまどの画面か ===== */
  titleEntered: Ref<boolean>;
  gameStarted: Ref<boolean>;
  isSnackSelectionOpen: Ref<boolean>;
  isHowToPlayOpen: Ref<boolean>;
  isRecordsOpen: Ref<boolean>;
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

  /* 公園入口で、その場所へ入るコマンドが何番か（出ていないときは null）。地図の上の矢印キーの移動先を調べるのに使う */
  getPlaceSelectionIndex: (place: GameEvent) => number | null;
  isSecretPathPlaying: ComputedRef<boolean>;

  /* ===== フォーカスを当てるためのボタン・入力欄 ===== */
  startButtonRef: Ref<HTMLButtonElement | null>;
  /* A画面の「つづきから」（保存があるときだけ。無いときは null） */
  continueButtonRef: Ref<HTMLButtonElement | null>;
  soundtrackButtonRef: Ref<HTMLButtonElement | null>;
  minigameButtonRef: Ref<HTMLButtonElement | null>;
  selectSnacksButtonRef: Ref<HTMLButtonElement | null>;
  howToPlayButtonRef: Ref<HTMLButtonElement | null>;
  backToBootButtonRef: Ref<HTMLButtonElement | null>;
  /* B画面の「🏆 ハイスコア」の札（記録があるときだけ。無いときは null） */
  recordsButtonRef: Ref<HTMLButtonElement | null>;
  howToBackButtonRef: Ref<HTMLButtonElement | null>;
  recordsBackButtonRef: Ref<HTMLButtonElement | null>;
  snackSelectionRef: Ref<HTMLElement | null>;

  /* サウンドのボタンとスライダーは SoundControl の中にあるので、親が computed で借りている */
  soundToggleButtonRef: ComputedRef<HTMLButtonElement | null>;
  soundVolumeSliderRef: ComputedRef<HTMLInputElement | null>;

  /* ===== 押されたときに親へお願いすること ===== */

  /* Enter / Space で、いま選んでいるコマンドを実行する */
  runSelectedCommand: () => void;

  /* 画面の開け閉め */
  enterTitle: () => void;
  /* A画面の「つづきから」（保存してあった公園の地図から再開する） */
  resumePlay: () => void;
  openSnackSelection: () => void;
  closeSnackSelection: () => void;
  closeHowToPlay: () => void;
  closeRecords: () => void;
  closeSnackMenu: () => void;

  /* 「公園の出口へ向かう？」をやめる（決定音も鳴らす） */
  cancelGoalConfirm: () => void;
  confirmGoToGoal: () => void;

  /* そのほか */
  focusFirstSnackOption: () => void | Promise<void>;
  pauseCommandPointer: () => void;
  handleSecretPathKeydown: (event: KeyboardEvent) => void;
};

export function useKeyboardControls(options: UseKeyboardControlsOptions) {
  const {
    titleEntered,
    gameStarted,
    isSnackSelectionOpen,
    isHowToPlayOpen,
    isRecordsOpen,
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
    getPlaceSelectionIndex,
    isSecretPathPlaying,
    startButtonRef,
    continueButtonRef,
    soundtrackButtonRef,
    minigameButtonRef,
    selectSnacksButtonRef,
    howToPlayButtonRef,
    backToBootButtonRef,
    recordsButtonRef,
    howToBackButtonRef,
    recordsBackButtonRef,
    snackSelectionRef,
    soundToggleButtonRef,
    soundVolumeSliderRef,
    runSelectedCommand,
    enterTitle,
    resumePlay,
    openSnackSelection,
    closeSnackSelection,
    closeHowToPlay,
    closeRecords,
    closeSnackMenu,
    cancelGoalConfirm,
    confirmGoToGoal,
    focusFirstSnackOption,
    pauseCommandPointer,
    handleSecretPathKeydown,
  } = options;


  /* ============================================================
     キーボード操作（各場所の「どうする？」コマンドボックス）

     ・↑ ↓   1つ上・下のコマンドへ（はしでは回りこむ）
     ・← →   1つ前（左）・次（右）のコマンドへ（横ならびの選択肢や、結果を読む画面。はしで止まる）
     ・Enter / Space   選択中のコマンドを実行する
     ※ 「読む画面」で中身がスクロールするときは、↑↓ はスクロールに使い、コマンドは ← → で選ぶ
       （handleKeydown() の ⓪-3 と isReadingScene）
     ============================================================ */

  /* ↑：1つ上のコマンドへ（一番上では、一番下へ回りこむ） */
  function moveCommandUp() {
    if (selectedCommandIndex.value <= 0) {
      selectedCommandIndex.value = commandCount.value - 1;
      return;
    }

    selectedCommandIndex.value -= 1;
  }

  /* ↓：1つ下のコマンドへ（一番下では、一番上へ戻る） */
  function moveCommandDown() {
    if (selectedCommandIndex.value >= commandCount.value - 1) {
      selectedCommandIndex.value = 0;
      return;
    }

    selectedCommandIndex.value += 1;
  }

  /* ←：1つ前（左）のコマンドへ（横ならびの選択肢と、結果を読む画面で使う）
     ↑↓ とちがい、はしで止まって回りこまない（ボタンが2つの画面で「← は左、→ は右」と、押す前から分かるように） */
  function moveCommandPrevious() {
    selectedCommandIndex.value = Math.max(0, selectedCommandIndex.value - 1);
  }

  /* →：1つ次（右）のコマンドへ（はしで止まる） */
  function moveCommandNext() {
    selectedCommandIndex.value = Math.min(commandCount.value - 1, selectedCommandIndex.value + 1);
  }

  /* ===== おやつバッグの中の↑↓（メインコマンドと同じ考えかたで、いちばん下が「← もどる」） ===== */

  function moveSnackMenuUp() {
    if (selectedSnackMenuIndex.value <= 0) {
      selectedSnackMenuIndex.value = snackMenuBackIndex.value;
      return;
    }

    selectedSnackMenuIndex.value -= 1;
  }

  function moveSnackMenuDown() {
    if (selectedSnackMenuIndex.value >= snackMenuBackIndex.value) {
      selectedSnackMenuIndex.value = 0;
      return;
    }

    selectedSnackMenuIndex.value += 1;
  }

  /* ===== 公園入口（地図の上にならぶ行き先） ===== */

  /* 地図の上の場所が、いま何番のコマンドか（地図に出ていないときは null。番号は selectedCommandIndex と同じもの） */
  function getParkMapSpotIndex(spot: ParkMapSpot): number | null {
    if (spot === 'goal') {
      return goalCommandIndex.value;
    }

    return getPlaceSelectionIndex(spot);
  }

  /* 地図の上で、矢印キーで動く前にいた場所（「来たほうへ戻る」ために使う → data/parkMap.ts の parkMapReturnMoves）
     マウスで選びなおしたあとなどは古いままのこともあるが、候補に入っていなければ使わないので、ふつうの動きになるだけ */
  let previousMapSpot: ParkMapSpot | null = null;

  /* 公園入口の ↑ ↓ ← →：地図の上で、押した向きにある場所へ動かす

     候補（data/parkMap.ts の parkMapMoves）を前から見て、いま地図に出ている最初の場所へ動く
     parkMapReturnMoves に書いた向きは、候補の中に直前にいた場所があれば、先にそこへ戻る
     どの候補も出ていないときは、動かない（はしで止まる） */
  function moveEntranceOnMap(direction: ParkMapDirection) {
    const spots = Object.keys(parkMapMoves) as ParkMapSpot[];

    const current = spots.find((spot) => getParkMapSpotIndex(spot) === selectedCommandIndex.value);

    // どの場所でもない（番号がずれている）ときは、地図のまん中へ戻す
    if (!current) {
      selectedCommandIndex.value = getPlaceSelectionIndex(parkMapStartPlace) ?? 0;
      return;
    }

    const candidates = parkMapMoves[current][direction] ?? [];
    const returnsToPrevious = parkMapReturnMoves[current]?.includes(direction) ?? false;
    const ordered = returnsToPrevious && previousMapSpot && candidates.includes(previousMapSpot)
      ? [previousMapSpot, ...candidates.filter((spot) => spot !== previousMapSpot)]
      : candidates;

    for (const next of ordered) {
      const nextIndex = getParkMapSpotIndex(next);

      if (nextIndex !== null) {
        previousMapSpot = current;
        selectedCommandIndex.value = nextIndex;
        return;
      }
    }
  }

  /* ============================================================
     起動画面（A）・タイトル画面（B）のキーボード操作（どちらもボタン4つ）

       A … ① はじめる             ② ♪（サウンドトラック）   ③ 🎮 ミニゲーム ④ サウンドON/OFF
       B … ① きょうのおやつを選ぶ ② はじめの画面へ戻る ③ ？ あそびかた      ④ サウンドON/OFF
     ①がその画面のメインのボタンで、画面が出たときは①にフォーカスを当てる
     B画面には、記録があるときだけ「🏆 ハイスコア」の札も出る（メインのボタンのすぐ上。→ getTitleRecordsButton()）
     A画面には、保存があるときだけ「つづきから」も出る（「はじめる」のすぐ上）
       あるときは「つづきから」が①（メインのボタン）になり、「はじめる」は、そのすぐ下のボタンになる（→ getTitleColumn()）

     ・Tab / Shift+Tab … ブラウザのふつうの移動（はしでは反対のはしへ回りこませる）
     ・↑ ← ↓ →        … 画面の並びのとおりに動かす（→ moveTitleFocusByArrow()）
     ・Enter / Space   … 選んでいるボタンを実行する
     ============================================================ */

  /* いまの画面で選べるボタンを、選ぶ順番（＝Tab の順番）どおりに取り出す
     ゲームが始まったあと・あそびかた画面・記録の画面・おやつ選択画面では、空っぽを返す
     （A画面・B画面のボタンが出ていないので、矢印キー・Tab の回りこみ・フォーカスが、どれも動かないようにする）
     ※ B画面の「🏆 ハイスコア」の札は、出たり出なかったりするので、ここには入れない（→ getTitleRecordsButton()） */
  function getTitleFocusItems(): HTMLButtonElement[] {
    if (gameStarted.value) {
      return [];
    }

    if (isHowToPlayOpen.value) {
      return [];
    }

    if (isRecordsOpen.value) {
      return [];
    }

    if (isSnackSelectionOpen.value) {
      return [];
    }

    // 並びは「メイン → 上の行のボタンを左から順に」（A画面のメインは、「つづきから」があればそちら）
    const items = titleEntered.value
      ? [selectSnacksButtonRef.value, backToBootButtonRef.value, howToPlayButtonRef.value, soundToggleButtonRef.value] // B画面
      : [continueButtonRef.value ?? startButtonRef.value, soundtrackButtonRef.value, minigameButtonRef.value, soundToggleButtonRef.value]; // A画面

    return items.filter((item): item is HTMLButtonElement => item !== null);
  }

  /* B画面の「🏆 ハイスコア」の札（A画面と、まだ記録が無いときは null）
     getTitleFocusItems() が空っぽでないとき（A画面・B画面が出ているとき）だけ呼ぶ */
  function getTitleRecordsButton(): HTMLButtonElement | null {
    return titleEntered.value ? recordsButtonRef.value : null;
  }

  /* 上の行より下の、たての並び（見た目の上から順。先頭の null が上の行）
     ・B画面 … 上の行 → 🏆 ハイスコアの札（あるときだけ）→ メイン（きょうのおやつを選ぶ）
     ・A画面 … 上の行 → メイン（つづきから）→ はじめる（「つづきから」が無いときは、上の行 → メイン（はじめる）） */
  function getTitleColumn(mainButton: HTMLButtonElement): (HTMLButtonElement | null)[] {
    const recordsButton = getTitleRecordsButton();

    if (recordsButton) {
      return [null, recordsButton, mainButton];
    }

    if (!titleEntered.value && startButtonRef.value && startButtonRef.value !== mainButton) {
      return [null, mainButton, startButtonRef.value];
    }

    return [null, mainButton];
  }

  /* ↑↓←→ でフォーカスを動かす

     ■ A画面（「つづきから」は、保存があるときだけ）
       [ ♪ ][ 🎮 ミニゲーム ]        [ サウンドON/OFF ]
                   [ つづきから ]
                    [ はじめる ]

     ■ B画面（「🏆 ハイスコア」の札は、記録があるときだけ）
       [ はじめの画面へ戻る ]     [ ？ あそびかた ][ サウンドON/OFF ]
                 [ 🏆 ハイスコア 88点（Sランク） › ]
                   [ きょうのおやつを選ぶ ]

     どちらも「下にボタンが1〜2つ、上の行にいくつか」の形なので、同じ動きにしている
       ・↑ ↓ … たての並び（上の行 → 下のボタン）を1段ずつ動く（はしでは反対のはしへ回りこむ。→ getTitleColumn()）
                下のボタンが1つのときは、メインのボタンと上の行の行き来になる。上の行へ戻るときは、さっき上の行でいたボタンへ戻る
       ・← → … 上の行を、となりへ1つずつ動く（はしでは回りこむ。上の行にいないときは、←で左上・→で右上のサウンドへ） */
  /* 上の行から ↑↓ で出たとき、上の行のどのボタンにいたか（上の行へ戻ってきたとき、同じボタンへ戻すため）
     A画面⇄B画面で入れかわると、もう画面に無いボタンになるので、そのときは左上のボタンへ戻す */
  let lastTitleTopItem: HTMLButtonElement | null = null;

  function moveTitleFocusByArrow(key: string) {
    const items = getTitleFocusItems();
    const active = document.activeElement;

    // そろっていないときは何もしない（画面の切りかわり中など）
    if (items.length < 4) {
      return;
    }

    const [mainButton, ...topRow] = items;

    // 上の行の何番目にいるか（上の行にいないときは -1）
    const topIndex = topRow.findIndex((button) => button === active);

    // ↑ ↓：たての並びを1段ずつ（上の行はまとめて1段。null の段が上の行）
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const column = getTitleColumn(mainButton);

      // いまいる段（上の行・下のボタンのどれでもないとき（何も選んでいないときなど）は -1）
      const currentRow = topIndex !== -1 ? 0 : active instanceof HTMLButtonElement ? column.indexOf(active) : -1;

      if (currentRow === -1) {
        mainButton.focus();
        return;
      }

      // 上の行を出るときに、いまいた場所を覚えておく（戻ってきたとき、同じボタンへ戻すため）
      if (topIndex !== -1) {
        lastTitleTopItem = topRow[topIndex];
      }

      const step = key === 'ArrowDown' ? 1 : -1;
      const nextButton = column[(currentRow + step + column.length) % column.length];

      if (nextButton) {
        nextButton.focus();
        return;
      }

      /* 上の行へ戻るときは、さっき上の行でいた場所へ戻る
         覚えている場所が無い・この画面には無いときは、左上のボタンへ */
      const lastTopItem = lastTitleTopItem && topRow.includes(lastTitleTopItem) ? lastTitleTopItem : topRow[0];

      lastTopItem.focus();
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

  /* その画面のメインのボタンへフォーカスを当てる（画面が切りかわった直後は、まだボタンが無いので nextTick() を待つ） */
  async function focusTitleMainButton() {
    await nextTick();

    const items = getTitleFocusItems();

    items[0]?.focus();
  }

  /* ============================================================
     おやつ選択画面のキーボード操作

     ・↑ ↓ ← →        … 画面にならんでいるとおりに、となりのボタンへ動く
     ・Enter / Space   … いま選んでいるボタンを押す（ボタンを押すのはブラウザにまかせる）
     ・Escape          … B画面へ戻る
     ・Tab / Shift+Tab … ブラウザのふつうの移動

     ■ 「いまどこを選んでいるか」は、番号ではなくフォーカスそのもので覚える
       番号とフォーカスの2つを持つと、Tab・矢印・マウスで動かしたときに かならずズレるため
       （フォーカスの枠は「カーソルがここにある」という意味で、「バッグに入れた」こととは別物）

     ■ 行き先は「画面のどこにあるか」（getBoundingClientRect()）で決める
       おやつの列の数は CSS で決めていて、画面の広さで変わることがある
       番号で「2つ先が真下」と計算すると、列の数が変わったとたんにズレるため

     ■ Enter / Space は、ここでは実行しない
       ぜんぶ button なので、ブラウザが click してくれる。ここでも呼ぶと2回動いてしまう
       （1回押しただけで「選ぶ→すぐ解除」になる）。やるのは押しっぱなしを止めることだけ
     ============================================================ */

  /* 矢印キーで行き来できるボタンを、ぜんぶ取り出す（おやつのカード・出発・戻る・サウンド）

     並び順は気にしなくてよい（行き先は、画面のどこにあるかで決める）
     押せないボタン（disabled）は取りのぞく（見た目と操作の判定が1か所で済み、食いちがわない） */
  function getSnackSelectionFocusItems(): HTMLButtonElement[] {
    const container = snackSelectionRef.value;

    if (!container) {
      return [];
    }

    const items = [...container.querySelectorAll<HTMLButtonElement>('.snack-option, .snack-go, .title-card__back, .sound-toggle')];

    return items.filter((item) => !item.disabled);
  }

  type SnackArrowDirection = 'up' | 'down' | 'left' | 'right';

  /* ボタン1つぶんの「画面のどこにあるか」（rect … 上下左右のふち ／ x, y … まんなかの位置） */
  type SnackNavItem = {
    button: HTMLButtonElement;
    rect: DOMRect;
    x: number;
    y: number;
  };

  /* 矢印キーでフォーカスを動かす（画面の見た目どおりに）

     ・← → … 同じ行（上下のふちが重なっている）にあるものだけを候補にする
              （そうしないと、ななめ下の行のボタンへ飛んでしまうため）
     ・↑ ↓ … いちばん近い行を見つけて、その中で横の位置がいちばん近いものを選ぶ
              （グミから↑なら、左はしの「戻る」。列の数を気にしなくても自然な動きになる）
     ・行き先が無いときは、動かない
     rowTolerance … 「同じ行」とみなす、たてのずれの許容（ボタンの高さのちがいで数pxずれるため。行と行は100px以上離れている） */
  function moveSnackSelectionByArrow(direction: SnackArrowDirection) {
    const items = getSnackSelectionFocusItems();

    if (items.length === 0) {
      return;
    }

    const currentButton = items.find((item) => item === document.activeElement);

    // どこにもフォーカスが無いとき（すきまをクリックしたあとなど）は、最初のおやつから始める
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

    // いちばん近い行だけに しぼる
    const nearestRowDistance = Math.min(...candidates.map((item) => Math.abs(item.y - current.y)));
    const nearestRow = candidates.filter((item) => Math.abs(item.y - current.y) <= nearestRowDistance + rowTolerance);

    focusNearestSnackItem(nearestRow, current, 'x');
  }

  /* 候補の中から、いちばん近いものへフォーカスを当てる（axis … 'x' なら横、'y' ならたての位置で測る）

     同じ近さのものが2つあったときは、HTMLで先に書いてあるほうを選ぶ（毎回同じ動きになるので迷わない）
     画面の位置は小数で返ってくることがあるので、0.5px くらいの差は「同じ」とみなす */
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

  /* マウスを乗せたおやつへ、キーボードの居場所（＝フォーカス）も移す
     preventScroll: true … マウスを乗せただけで画面がスクロールしないように
     ※ 乗せただけでは選ばない（選ぶのは click と Enter / Space だけ） */
  function moveSnackSelectionToHovered(event: MouseEvent) {
    const hovered = event.currentTarget;

    if (hovered instanceof HTMLButtonElement && !hovered.disabled) {
      hovered.focus({ preventScroll: true });
    }
  }

  function handleSnackSelectionKeydown(event: KeyboardEvent) {
    /* ① Escape … B画面へ戻る（どこにフォーカスがあっても戻れるように、いちばん先に見る。選んだおやつは消えない） */
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSnackSelection();
      return;
    }

    /* ② ↑ ↓ ← → … 画面のならびどおりに動かす（ページがスクロールしないように preventDefault。押しっぱなしは止めない） */
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
      return;
    }

    /* 押しっぱなしのときは、2回目以降を止める
       （自動リピートで、選ぶ／解除がパタパタくり返されたり、ゲーム開始が二重に走ったりするため） */
    if (event.repeat) {
      event.preventDefault();
      return;
    }

    /* ボタンにフォーカスがあるときは、何もしない（押すのはブラウザの仕事）
       ※ preventDefault() を呼ばずに return するのが大事（呼ぶと、そのボタン自身が押せなくなる） */
    if (document.activeElement instanceof HTMLButtonElement) {
      return;
    }

    // どこにもフォーカスが無いときは、最初のおやつへカーソルを出すだけ（見えないまま選ばれないように）
    event.preventDefault();
    focusFirstSnackOption();
  }

  /* ============================================================
     あそびかた画面・記録の画面のキーボード操作（どちらも B画面から開く、読むための縦に長い画面なので、同じ操作にする）

     ・Escape        … B画面へ戻る
     ・↑ ↓           … 見出しより下をスクロールする（1回ぶんの量は、ゲーム画面の読む場面と同じ）
                       いちばん下・いちばん上まで来たら、上の「← 戻る」へフォーカスを移す（そのまま Enter で戻れる）
                       とちゅうでは、どのボタンにもフォーカスを置かない（読んでいる途中で Enter を押して、うっかり戻らないように）
                       → scrollReadingScreenByArrow()
     ・← →           … 上の「← 戻る」と「サウンド」を行き来する（どちらかにフォーカスがあるときだけ）
     ・Enter / Space … 押すのはブラウザにまかせる。押しっぱなしを止めるだけ
     読むための縦に長いページなので、preventDefault() するのは、実際に何かをしたキーだけ

     backButton … その画面の上の「← ひとつ前の画面へ戻る」 ／ close … B画面へ戻る関数
     ============================================================ */
  function handleReadingScreenKeydown(event: KeyboardEvent, backButton: HTMLButtonElement | null, close: () => void) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    /* ① ↑ ↓ … スクロールして、いちばん上・いちばん下では「← 戻る」へフォーカスを移す
       押しっぱなしでも止めない（続けてスクロールできるように） */
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const screen = backButton?.closest<HTMLElement>('.title-screen');

      // 画面の切りかわり中などで、まだ画面が出ていないときは何もしない
      if (!backButton || !screen) {
        return;
      }

      event.preventDefault();
      scrollReadingScreenByArrow(screen, backButton, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    /* ② ← → … 上のツールバーの2つを行き来する
       どちらかにフォーカスがあるときだけ（本文を読んでいる途中に上のボタンへ飛ぶと、いちばん上までスクロールしてしまうため） */
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
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

    /* ③ Enter / Space … 押しっぱなしだけ止める（サウンドON/OFFがパタパタ切りかわらないように）
       押すのはブラウザの仕事なので、ここでは呼ばない（呼ぶと2回動く）
       ボタンにフォーカスが無いときの Space は止めない（ページを下へスクロールするふつうの動き） */
    if ((event.key === 'Enter' || event.key === ' ') && event.repeat && document.activeElement instanceof HTMLButtonElement) {
      event.preventDefault();
    }
  }

  /* 読む画面（あそびかた・記録）を ↑↓ で1回ぶんスクロールして、フォーカスを位置に合わせる

     スクロールするのは、見出しより下（.howto-body）だけ（上の「← 戻る」と見出しは動かない → base.css）
     ・いちばん下・いちばん上 … 上の「← 戻る」（topBackButton。いつも見えているので、どちらのはしでもここへ当てる）
     ・とちゅう               … どこにも置かない（いまフォーカスがある、この画面の中のボタンから外す）
     スクロールしない短い画面では、どちらの向きでも上の「戻る」へ当てる
     ※ preventScroll … 見えている「戻る」へ当てるだけなので、フォーカスでスクロール位置を動かさない */
  function scrollReadingScreenByArrow(screen: HTMLElement, topBackButton: HTMLButtonElement, direction: 1 | -1) {
    const scrollers: HTMLElement[] = [];
    const body = screen.querySelector<HTMLElement>('.howto-body');

    if (canScrollInside(body)) {
      scrollers.push(body);
    }

    scrollSceneByArrow(scrollers, direction);

    const isAtTop = scrollers.every((element) => element.scrollTop <= 1);
    const isAtBottom = scrollers.every((element) => element.scrollTop + getScrollViewHeight(element) >= element.scrollHeight - 1);

    if ((direction > 0 && isAtBottom) || (direction < 0 && isAtTop)) {
      topBackButton.focus({ preventScroll: true });
      return;
    }

    const active = document.activeElement;

    if (active instanceof HTMLElement && screen.contains(active)) {
      active.blur();
    }
  }

  /* A画面・B画面でキーを押したときの処理 */
  function handleTitleKeydown(event: KeyboardEvent) {
    const items = getTitleFocusItems();

    if (items.length === 0) {
      return;
    }

    // ①② ↑ ↓ ← →：画面の並びのとおりにフォーカスを動かす（ページがスクロールしないように preventDefault）
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveTitleFocusByArrow(event.key);
      return;
    }

    /* ③ Tab：ふだんはブラウザにまかせる
       いちばん後ろで Tab を押すと、フォーカスが画面の外（ブラウザの上のほう）へ出てしまうので、はしでは反対のはしへ回りこませる */
    if (event.key === 'Tab') {
      const first = items[0];

      /* いちばん後ろ（HTML でいちばん最後にあるもの）
         ・B画面に「🏆 ハイスコア」の札があるときは、その札（カードのいちばん後ろに書いてある）
         ・それ以外は音量スライダー（ボタンではないので items に入っていないが、ツールバーのいちばん最後にある）
           入れておかないと、サウンドボタンで Tab を押したときにスライダーを飛びこしてしまう
         ※ A画面にはスライダーが無いので、そのときはミュートボタンがいちばん後ろ */
      const last = getTitleRecordsButton() ?? soundVolumeSliderRef.value ?? items[items.length - 1];

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

    /* 押しっぱなしのときは、2回目以降を止める
       （「はじめる」→ B画面 → そのまま「きょうのおやつを選ぶ」も押される、と続けて進んでしまうため） */
    if (event.repeat) {
      event.preventDefault();
      return;
    }

    /* ボタンなどにフォーカスがあるときは、何もしない（押すのはブラウザの仕事）
       ここでもメインのボタンを動かすと、1回押しただけで2つのことが起きてしまう
       ※ preventDefault を呼ばずに return するのが大事（呼ぶと、そのボタン自身が押せなくなる） */
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

    // どこも選んでいない（body など）ときは、その画面のメインのボタンを押したことにする（Space のスクロールは止める）
    event.preventDefault();

    // A画面で「つづきから」があるときは、そちらがメインのボタン
    if (!titleEntered.value && continueButtonRef.value) {
      resumePlay();
    } else if (!titleEntered.value) {
      enterTitle();
    } else {
      openSnackSelection();
    }
  }

  /* ============================================================
     読む画面のスクロール（↑↓）

     結果・いやいやタイム・とつぜんのできごと・秘密の小道・ゴール／GAME OVER は「読む」画面なので、
     中身が画面に収まらないときは ↑↓ をスクロールに使い、コマンドは ← → で選ぶ（収まっているときは ↑↓ でも選べる）
     公園入口と、通常の場所で結果が出る前の「どうする？」は、メニューなので ↑↓ で選ぶ
     ※ 見るのは「スクロールできるか」だけ（一番下で ↓ を押しても、とつぜんコマンド選択に切りかわらないように）
     ============================================================ */

  /* ゲーム画面の入れもの（場面（.scene）をさがすときに、この中だけを見る） */
  const gameScreenRef = ref<HTMLElement | null>(null);

  /* ↑↓ を「読むためのスクロール」に使ってよい画面か
     ✕ 公園入口・通常の場所とひとやすみで結果が出る前（たて1列のメニュー）・秘密の小道で遊んでいる最中
     ※ いやいや発生の結果は、まだ currentEvent が 'tantrum' ではないので、「結果が出ているか」で見分ける
     ※ おやつバッグは handleKeydown() でこれより先に受け取るので、開いているあいだの ↑↓ はスクロールに取られない */
  const isReadingScene = computed(() => {
    if (currentEvent.value === 'parkEntrance' || isSecretPathPlaying.value) {
      return false;
    }

    return !isPlaceMenuScene.value || !!resultMessage.value;
  });

  /* いま画面に出ている場面（.scene）
     消えかけの前の場面はふくめない（ほかの場面を、まちがってスクロールしないように） */
  function getCurrentSceneElement() {
    return gameScreenRef.value?.querySelector<HTMLElement>(':scope > .scene:not(.scene-leave-active)') ?? null;
  }

  /* 要素の中身を、その要素の中でスクロールできるか（overflow-y が auto / scroll で、1pxより多くはみ出している） */
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

  /* スクロールする要素の「見えている高さ」（ページ全体は、ウィンドウの高さで見る） */
  function getScrollViewHeight(element: HTMLElement) {
    return element === document.scrollingElement ? window.innerHeight : element.clientHeight;
  }

  /* ↑↓ でスクロールできる要素を、先に動かす順に返す
     結果カードの中身 → その場面の中央エリア（.stage）→ ページ全体（スマホ幅）
     空っぽなら「スクロールしない画面」＝ ↑↓ はコマンドを選ぶ */
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

  /* ↑↓ を1回押したぶん、スクロールする（ゲーム画面の読む場面と、あそびかた・記録の画面で使う）

     前の候補がその向きにもう動けないときは、次の候補を動かす（マウスホイールと同じ動き）
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
     （block: 'nearest' … もう見えているなら動かさない。選んでいる印が付くのは書きかえのあとなので、nextTick で待つ） */
  function revealSelectedCommand() {
    // スクロールすると、止まったままのマウスの下に別のボタンが来て、選択が上書きされるので、マウスを動かすまで止めておく
    pauseCommandPointer();

    nextTick(() => {
      const selected = getCurrentSceneElement()?.querySelector<HTMLElement>('.command-box__item--selected, .cmd--selected');

      selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  /* キーボードのキーが押されたときの処理（キーボード操作の入口） */
  function handleKeydown(event: KeyboardEvent) {
    /* 画面がフェードで切りかわっている最中は、キーを受けつけない
       （見えているのは前の画面なのに中身はもう次の画面なので、見えていないボタンまで押してしまうため） */
    if (isScreenChanging.value) {
      return;
    }

    /* 音量スライダーを選んでいるあいだは、ゲームのキー操作をしない（ブラウザ本来のスライダーの操作にまかせる）
       window 全体で受け取っているので、← → で「音量を変える」と「コマンドを選びなおす」が同時に起きてしまうため
       Enter / Space もここで止める（下へ行くとゲームの「決定」になってしまう）
       ※ preventDefault() は呼ばない（呼ぶと、スライダー本来の操作まで止まる）
       ※ Tab と Escape は素通りさせる（Tab の回りこみと、Escape で戻る操作を、今までどおり動かすため）
       ※ スライダーはどの画面にも出ているので、画面ごとの分岐より前（いちばん上）に置く */
    const sliderOwnKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' '];
    const keyTarget = event.target as HTMLElement | null;

    if (sliderOwnKeys.includes(event.key) && keyTarget?.closest?.('.sound-control__slider')) {
      return;
    }

    /* 画面ごとに、専用の関数へまかせる（画面の出し分けと同じ順番で見る）
       あそびかた画面・記録の画面・おやつ選択画面を、A画面・B画面より先に見るのが大事
       （あとに置くと、画面に無いB画面のボタンを操作しようとしてしまうため） */
    if (!gameStarted.value && isHowToPlayOpen.value) {
      handleReadingScreenKeydown(event, howToBackButtonRef.value, closeHowToPlay);
      return;
    }

    if (!gameStarted.value && isRecordsOpen.value) {
      handleReadingScreenKeydown(event, recordsBackButtonRef.value, closeRecords);
      return;
    }

    if (!gameStarted.value && isSnackSelectionOpen.value) {
      handleSnackSelectionKeydown(event);
      return;
    }

    if (!gameStarted.value) {
      handleTitleKeydown(event);
      return;
    }

    /* ここから下は、ゲーム本編（gameStarted === true）だけの処理 */

    /* ⓪-00 秘密の小道で遊んでいる最中は、ミニゲームの操作だけにする
       （はじまる前と終わったあとは、ここを通らずに、いつもどおりのコマンド操作になる） */
    if (isSecretPathPlaying.value) {
      handleSecretPathKeydown(event);
      return;
    }

    /* ⓪-0 「公園の出口へ向かう？」の確認ダイアログが開いているとき（いちばん手前なので、ほかの操作より先に見る）

       ・← ↑ … 「もう少し遊ぶ」／ → ↓ … 「出口へ向かう」（スマホ幅では たてに並ぶので、↑↓でも同じ向き）
       ・Tab … 2つのボタンを行き来する（うしろの画面へカーソルを逃がさない）
       ・Enter / Space … 選んでいるボタンを押す（押しっぱなしは受けつけない。開いた直後に次のボタンまで押されないように）
       ・Escape … 閉じる
       ※ ここにあるキーだけ preventDefault() する（ブラウザの再読みこみなどは、じゃましない） */
    if (isGoalConfirmVisible.value) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelGoalConfirm();
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
          cancelGoalConfirm();
        }
      }

      return;
    }

    /* 上部バーのサウンドボタン・公園の地図の「中断」にフォーカスしているときは、ゲームのキー操作をしない
       （Enter で「音のON/OFF」や「中断」と、「ゲームの決定」が同時に起きてしまうため）
       ※ preventDefault() は呼ばない（ボタン本来のクリックは、ブラウザにまかせる） */
    const target = event.target as HTMLElement | null;

    if (target?.closest?.('.sound-toggle, .park-map__suspend')) {
      return;
    }

    // Space は event.key では ' '（半角スペース1文字）
    const isDecideKey = event.key === 'Enter' || event.key === ' ';

    /* ⓪-1 おやつバッグが開いているとき（いちばん内側のメニューなので、メインコマンドより先に見る）

       ・↑↓ … バッグの中で選ぶ ／ Enter / Space … 食べる（「← もどる」なら戻る）／ Escape … 1つ前のメニューへ
       ※ Enter / Space で preventDefault() を呼ぶのが大事
         フォーカスの当たったボタンの本来のクリックが止まるので、2回ぶん食べてしまうことがない */
    if (isSnackMenuVisible.value) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSnackMenu();
        return;
      }

      if (event.key === 'ArrowUp') {
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
        event.preventDefault();

        // 押しっぱなしで、おやつを続けて食べてしまわないように
        if (event.repeat) {
          return;
        }

        runSelectedCommand();
        return;
      }

      return;
    }

    // 公園入口は、行き先が地図の上にバラバラに並んでいるので、矢印キーの動きかたがちがう（→ moveEntranceOnMap()）
    const isEntrance = currentEvent.value === 'parkEntrance';

    /* ⓪-3 読む画面で ↑↓ を押したとき（→ isReadingScene）

       どれかがスクロールできるなら、↑↓ はスクロールだけに使う（コマンドは ③ の ← → で選ぶ）
       どれもスクロールできないときは、①② でコマンドを選ぶ
       ※ 押しっぱなしでも止めない（続けてスクロールできるように） */
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && isReadingScene.value) {
      const scene = getCurrentSceneElement();

      // 場面が切りかわっている最中は、何もしない（コマンドを動かすと、次の場面が出たときに選択がずれているため）
      if (!scene) {
        event.preventDefault();
        return;
      }

      const scrollers = getSceneScrollers(scene);

      if (scrollers.length > 0) {
        event.preventDefault();
        scrollSceneByArrow(scrollers, event.key === 'ArrowUp' ? -1 : 1);

        // スクロールで止まったままのマウスの下にボタンが来ても、選択が変わらないように
        pauseCommandPointer();
        return;
      }
    }

    // ① ↑：1つ上のコマンドへ（公園入口は、地図の上で上にある場所へ）
    if (event.key === 'ArrowUp') {
      event.preventDefault();

      if (isEntrance) {
        moveEntranceOnMap('up');
      } else {
        moveCommandUp();
      }

      revealSelectedCommand();
      return;
    }

    // ② ↓：1つ下のコマンドへ
    if (event.key === 'ArrowDown') {
      event.preventDefault();

      if (isEntrance) {
        moveEntranceOnMap('down');
      } else {
        moveCommandDown();
      }

      revealSelectedCommand();
      return;
    }

    /* ③ ← →：となりのコマンドへ
       ・公園入口 … 地図の上で左／右にある場所へ
       ・読む画面 … 1つ前（左）／次（右）へ（横ならびの選択肢は、見た目の左右と同じ向きに動く）
       ・通常の場所で結果が出る前 … たて1列なので、左右キーは使わない */
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (!isEntrance && !isReadingScene.value) {
        return;
      }

      event.preventDefault();

      if (isEntrance) {
        if (event.key === 'ArrowLeft') {
          moveEntranceOnMap('left');
        } else {
          moveEntranceOnMap('right');
        }
      } else if (event.key === 'ArrowLeft') {
        moveCommandPrevious();
      } else {
        moveCommandNext();
      }

      revealSelectedCommand();
      return;
    }

    // ④ Enter / Space：いま選んでいるコマンドを実行する
    if (isDecideKey) {
      // Space のスクロールと、フォーカスの当たったボタンが二重に押されるのを防ぐ
      event.preventDefault();

      // 押しっぱなしで、同じ行動が何度も実行されないように
      if (event.repeat) {
        return;
      }

      runSelectedCommand();
      return;
    }
  }

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
    focusTitleMainButton,
    handleKeydown,
  };
}
