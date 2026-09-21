<script setup lang="ts">
/* ============================================================
   「どうする？」のコマンド欄（選択肢のならんだ枠）

   ■ このコンポーネントは「選択肢を出して、押されたことを親へ伝えるだけ」
     行動の中身（遊ぶ・休憩する・おやつを食べる・いやいやへの対応など）は、
     ぜんぶ親（pages/index.vue）の関数がやる
     ここでは @select や @care のように「押された」と伝えるだけで、
     ステータス・時間・ゲームの進行はさわらない

   ■ キーボード操作も親のまま
     いま何番目が選ばれているか（selectedIndex など）は親が持っていて、
     ここは v-model で受け取って「選ばれている見た目」にするだけ
     ↑↓キーやEnterの処理は、今までどおり pages/index.vue にある
     （マウスを乗せたとき・フォーカスが来たときだけ、番号の更新を親へお願いする）

   ■ 場面によって中身がちがう（variant で見分ける）
     place       … 通常の場所6か所
                   ☕ ひとやすみ のサブメニュー ＋ その場所の遊び2つ ＋ 休憩・おやつ ＋ 場所選びにもどる
     tantrum     … いやいやタイム（お話・だっこ・おやつ・待つ、おやつバッグ）
     suddenEvent … とつぜんのできごと（選択肢3つ）
   ============================================================ */

import type { Snack } from '~/types/game';

withDefaults(
  defineProps<{
    /* どの場面のコマンド欄か（上の説明を参照） */
    variant: 'place' | 'tantrum' | 'suddenEvent';

    /* その場面ならではの選択肢（place は2つ、suddenEvent は3つ、tantrum は使わない）
       押されたときは、何番目かを @select で親へ伝える */
    commands?: { label: string }[];

    /* 結果の文章（出ているあいだは、コマンドのかわりに「次へ進む」だけを出す） */
    resultMessage: string;

    /* 結果が出たあとに出す、次へ進むコマンドの文字 */
    nextPlaceCommandLabel: string;

    /* 横ならびにするときのCSSクラス（3択・4択のとき。通常の場所では使わない） */
    gridClass?: string[] | null;

    /* 「← もどる」の直後、マウスを動かすまでマウスで押せなくする */
    pointerPaused: boolean;

    /* バッグに残っているおやつと、その残り個数 */
    selectedSnacks?: Snack[];
    snackLeft?: number;

    /* おやつバッグを開いているか・「← もどる」が何番目か */
    isSnackMenuVisible?: boolean;
    snackMenuBackIndex?: number;

    /* ===== 通常の場所（place）で使うもの ===== */
    isCareMenuVisible?: boolean;
    isCareResultBackVisible?: boolean;
    careMenuCommandIndex?: number;
    leavePlaceCommandIndex?: number;

    /* ===== いやいやタイム（tantrum）で使うもの ===== */
    isTantrumUnsolved?: boolean;
    talkCommandIndex?: number;
    hugCommandIndex?: number;
    snackCommandIndex?: number;
    waitCommandIndex?: number;
    waitCommandLabel?: string;
  }>(),
  {
    commands: () => [],
    selectedSnacks: () => [],
    gridClass: null,
    snackLeft: 0,
    isSnackMenuVisible: false,
    snackMenuBackIndex: 0,
    isCareMenuVisible: false,
    isCareResultBackVisible: false,
    careMenuCommandIndex: 0,
    leavePlaceCommandIndex: 0,
    isTantrumUnsolved: false,
    talkCommandIndex: 0,
    hugCommandIndex: 0,
    snackCommandIndex: 0,
    waitCommandIndex: 0,
    waitCommandLabel: '',
  },
);

/* いま選ばれている番号（親が持っているものを、そのまま借りてくる）
   メインコマンド・☕ ひとやすみ の中・おやつバッグの中で、それぞれ別の番号を使う */
const selectedIndex = defineModel<number>('selectedIndex', { required: true });
const careIndex = defineModel<number>('careIndex', { default: 0 });
const snackIndex = defineModel<number>('snackIndex', { default: 0 });

/* 押されたことを親へ伝えるだけの合図（中身の処理は、ぜんぶ親の関数） */
defineEmits<{
  /* その場面ならではの選択肢（何番目が押されたか） */
  select: [index: number];

  /* どの場所でも同じコマンド */
  care: [];
  leave: [];
  back: [];
  next: [];

  /* ☕ ひとやすみ／おやつバッグ */
  takeBreak: [];
  openSnackMenu: [];
  closeSnackMenu: [];
  eatSnack: [snackId: Snack['id']];

  /* いやいやタイムの対応 */
  talk: [];
  hug: [];
  wait: [];
}>();
</script>

<template>
  <!-- サブメニュー「☕ ひとやすみ」（通常の場所だけ）

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
  <Transition v-if="variant === 'place'" name="care-menu" :css="!resultMessage">
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
          :class="{ 'care-menu__item--selected': snackIndex === index }"
          @click="$emit('eatSnack', snack.id)"
          @mouseenter="snackIndex = index"
          @focus="snackIndex = index">
          <span class="snack-menu__name">{{ snack.icon }} {{ snack.name }}</span>
          <span class="care-menu__badge snack-menu__effects">
            <span>体力 +{{ snack.energy }}</span>
            <span>機嫌 +{{ snack.mood }}</span>
            <span>{{ snack.minutes }}分</span>
          </span>
        </button>

        <button
          class="care-menu__item"
          :class="{ 'care-menu__item--selected': snackIndex === snackMenuBackIndex }"
          @click="$emit('closeSnackMenu')"
          @mouseenter="snackIndex = snackMenuBackIndex"
          @focus="snackIndex = snackMenuBackIndex">
          <span class="care-menu__text">← もどる</span>
        </button>
      </template>

      <template v-else>
        <p class="care-menu__label">☕ ひとやすみ</p>

        <button
          class="care-menu__item"
          :class="{ 'care-menu__item--selected': careIndex === 0 }"
          @click="$emit('takeBreak')"
          @mouseenter="careIndex = 0"
          @focus="careIndex = 0">
          <span class="care-menu__text">休憩する</span>
        </button>

        <!-- バッグにおやつが残っているときだけ出す
             押すとおやつバッグが開く（ここではまだ食べない）
             ※ バッグは、いやいやタイムで使うおやつと同じ selectedSnackIds -->
        <button
          v-if="snackLeft > 0"
          class="care-menu__item"
          :class="{ 'care-menu__item--selected': careIndex === 1 }"
          @click="$emit('openSnackMenu')"
          @mouseenter="careIndex = 1"
          @focus="careIndex = 1">
          <span class="care-menu__text">おやつをあげる ＞</span>
          <span class="care-menu__badge">残り{{ snackLeft }}個</span>
        </button>

        <p v-else class="care-menu__note">おやつは、もうぜんぶ食べてしまいました…</p>
      </template>
    </aside>
  </Transition>

  <!-- メインコマンド（枠の中に選択肢を縦に並べる）
       command-box--pointer-paused … 休憩・おやつの「← もどる」の直後、マウスを動かすまでマウスで押せなくする -->
  <nav class="command-box" :class="[gridClass, { 'command-box--pointer-paused': pointerPaused }]">
    <!-- ============ 通常の場所 ============ -->
    <template v-if="variant === 'place'">
      <!-- 結果がまだ無いとき -->
      <template v-if="!resultMessage">
        <p class="command-box__label">どうする？</p>

        <button
          v-for="(command, index) in commands"
          :key="command.label"
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === index }"
          @click="$emit('select', index)"
          @mouseenter="selectedIndex = index"
          @focus="selectedIndex = index">
          <span class="command-box__text">{{ command.label }}</span>
        </button>

        <!-- ここから下は「どこでも同じコマンド」という区切り

             上の2つ … その場所ならではの遊び（すべる・見守る など）
             下の2つ … 休憩・おやつ／← 場所選びにもどる（どの場所でも同じ）

             同じ枠の中にならんでいても種類がちがうので、
             あいだに細い線と小さな見出しを入れて、
             ひとめで「ここからは別のなかま」と分かるようにする

             ※ ボタンではなくただの見出しなので、
               ↑↓キーの番号（selectedIndex）には数えない -->
        <p class="command-box__divider">そのほか</p>

        <!-- サブメニューを開け閉めするコマンド
             aria-expanded は「いま開いているか」を読み上げソフトに伝えるための印 -->
        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === careMenuCommandIndex }"
          :aria-expanded="isCareMenuVisible"
          @click="$emit('care')"
          @mouseenter="selectedIndex = careMenuCommandIndex"
          @focus="selectedIndex = careMenuCommandIndex">
          <span class="command-box__text">休憩・おやつ</span>
        </button>

        <!-- 「← 場所選びにもどる」… この場所では遊ばずに、公園入口の「どこへ行く？」へ戻る
             （サブメニューの「← もどる」＝1つ前のメニューへ戻る、とは役割がちがうので、戻り先まで書いてある）

             よく使うので、サブメニューには入れず、ここに残してある

             よく使うコマンドなので、見た目も上の行動と
             まったく同じ（同じ文字の大きさ・同じ色）にそろえてある -->
        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === leavePlaceCommandIndex }"
          @click="$emit('leave')"
          @mouseenter="selectedIndex = leavePlaceCommandIndex"
          @focus="selectedIndex = leavePlaceCommandIndex">
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
          :class="{ 'command-box__item--selected': selectedIndex === 0 }"
          @click="$emit('back')"
          @mouseenter="selectedIndex = 0"
          @focus="selectedIndex = 0">
          <span class="command-box__text">← もどる</span>
        </button>

        <button
          v-else
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === 0 }"
          @click="$emit('next')"
          @mouseenter="selectedIndex = 0"
          @focus="selectedIndex = 0">
          <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
        </button>
      </template>
    </template>

    <!-- ============ いやいやタイム ============ -->
    <template v-else-if="variant === 'tantrum'">
      <!-- おやつバッグ（「おやつをあげる ＞」を押したあと）
           いやいやのコマンドと入れかえて、同じ枠の中に出す
           「← もどる」・Escape で、お話／だっこ／おやつ／待つ に戻る -->
      <template v-if="isSnackMenuVisible">
        <p class="command-box__label">🎒 どのおやつをあげる？</p>

        <button
          v-for="(snack, index) in selectedSnacks"
          :key="snack.id"
          class="command-box__item snack-menu__item"
          :class="{ 'command-box__item--selected': snackIndex === index }"
          @click="$emit('eatSnack', snack.id)"
          @mouseenter="snackIndex = index"
          @focus="snackIndex = index">
          <span class="snack-menu__name">{{ snack.icon }} {{ snack.name }}</span>
          <span class="command-box__badge snack-menu__effects">
            <span>体力 +{{ snack.energy }}</span>
            <span>機嫌 +{{ snack.mood }}</span>
            <span>{{ snack.minutes }}分</span>
          </span>
        </button>

        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': snackIndex === snackMenuBackIndex }"
          @click="$emit('closeSnackMenu')"
          @mouseenter="snackIndex = snackMenuBackIndex"
          @focus="snackIndex = snackMenuBackIndex">
          <span class="command-box__text">← もどる</span>
        </button>
      </template>

      <!-- いやいやが続いているあいだは、結果が出ていてもコマンドを出しつづける -->
      <template v-else-if="isTantrumUnsolved">
        <p class="command-box__label">どうする？</p>

        <!-- お話してみる（いちばん上。いやいやタイムが始まったときは、ここが選ばれている） -->
        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === talkCommandIndex }"
          @click="$emit('talk')"
          @mouseenter="selectedIndex = talkCommandIndex"
          @focus="selectedIndex = talkCommandIndex">
          <span class="command-box__text">お話してみる</span>
        </button>

        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === hugCommandIndex }"
          @click="$emit('hug')"
          @mouseenter="selectedIndex = hugCommandIndex"
          @focus="selectedIndex = hugCommandIndex">
          <span class="command-box__text">だっこする</span>
        </button>

        <!-- バッグにおやつが残っているときだけ出す（押すとおやつバッグが開く） -->
        <button
          v-if="snackLeft > 0"
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === snackCommandIndex }"
          @click="$emit('openSnackMenu')"
          @mouseenter="selectedIndex = snackCommandIndex"
          @focus="selectedIndex = snackCommandIndex">
          <span class="command-box__text">おやつをあげる ＞</span>
          <span class="command-box__badge">残り{{ snackLeft }}個</span>
        </button>

        <p v-else class="command-box__note">おやつは、もうぜんぶ食べてしまいました…</p>

        <!-- 少し待ってみる
             番号はおやつの有無で変わるので waitCommandIndex を見る（おやつあり 3／なし 2） -->
        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === waitCommandIndex }"
          @click="$emit('wait')"
          @mouseenter="selectedIndex = waitCommandIndex"
          @focus="selectedIndex = waitCommandIndex">
          <span class="command-box__text">{{ waitCommandLabel }}</span>
        </button>
      </template>

      <template v-else>
        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === 0 }"
          @click="$emit('next')"
          @mouseenter="selectedIndex = 0"
          @focus="selectedIndex = 0">
          <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
        </button>
      </template>
    </template>

    <!-- ============ とつぜんのできごと ============ -->
    <template v-else>
      <!-- まだ選んでいないとき -->
      <template v-if="!resultMessage">
        <p class="command-box__label">どうする？</p>

        <button
          v-for="(command, index) in commands"
          :key="command.label"
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === index }"
          @click="$emit('select', index)"
          @mouseenter="selectedIndex = index"
          @focus="selectedIndex = index">
          <span class="command-box__text">{{ command.label }}</span>
        </button>
      </template>

      <!-- 選んだあとは「次の場所を選ぶ」の1つだけ -->
      <template v-else>
        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === 0 }"
          @click="$emit('next')"
          @mouseenter="selectedIndex = 0"
          @focus="selectedIndex = 0">
          <span class="command-box__text">{{ nextPlaceCommandLabel }}</span>
        </button>
      </template>
    </template>
  </nav>
</template>

<!-- 見た目は、このコンポーネント専用の assets/css/game/command-box.css だけを読みこむ
     （理由は components/game/StatusBar.vue の <style> の説明と同じ。
       index.vue の scoped CSS は、このコンポーネントの中の要素には届かないため）

     ■ game.css まるごとではなく command-box.css だけにした理由
       game.css を読むと、結果カードやリザルトなど、ここでは使わないCSSまで
       このコンポーネントぶんとして、もう一度ビルド結果に出てしまう

     ※ 「どうする？」のコマンド欄（.command-box 〜）は pages/index.vue の
       秘密の小道でも使うので、app.vue からグローバルに読みこむ
       command-shared.css にある
     ※ command-box.css は game.css からは読みこまない（二重出力になるため） -->
<style scoped src="~/assets/css/game/command-box.css"></style>
