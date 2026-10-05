<script setup lang="ts">
/* ============================================================
   「どうする？」のコマンド欄（選択肢のならんだ枠）

   ・選択肢を出して、押されたことを親へ伝えるだけ（行動の中身は、ぜんぶ親の pages/index.vue）
   ・選ばれている番号は親が持っていて、v-model で受け取る（キー操作は useKeyboardControls.ts）

   ■ 場面によって中身がちがう（variant）
     place       … 通常の場所6か所（その場所の遊び2つ ＋ 場所選びにもどる）
     rest        … ひとやすみ（きゅうけいする ＋ おやつにする ＋ 場所選びにもどる）
     tantrum     … いやいやタイム（お話・だっこ・おやつ・待つ）
     suddenEvent … とつぜんのできごと（選択肢3つ）
   ============================================================ */

import { snackBagImage } from '~/data/snacks';
import type { SceneVariant, Snack } from '~/types/game';

withDefaults(
  defineProps<{
    /* どの場面のコマンド欄か（上の説明を参照） */
    variant: SceneVariant;

    /* その場面ならではの選択肢（place は2つ、suddenEvent は3つ、rest・tantrum は使わない）
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

    /* ===== 通常の場所（place）・ひとやすみ（rest）で使うもの ===== */
    /* 「← 場所選びにもどる」が何番目か */
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
    leavePlaceCommandIndex: 0,
    isTantrumUnsolved: false,
    talkCommandIndex: 0,
    hugCommandIndex: 0,
    snackCommandIndex: 0,
    waitCommandIndex: 0,
    waitCommandLabel: '',
  },
);

/* いま選ばれている番号（メインコマンドとおやつバッグで、別の番号を使う） */
const selectedIndex = defineModel<number>('selectedIndex', { required: true });
const snackIndex = defineModel<number>('snackIndex', { default: 0 });

/* 押されたことを親へ伝えるだけの合図（中身の処理は、ぜんぶ親の関数） */
defineEmits<{
  /* その場面ならではの選択肢（何番目が押されたか） */
  select: [index: number];

  /* どの場所でも同じコマンド */
  leave: [];
  next: [];

  /* ひとやすみ（休憩する）／おやつバッグ */
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
  <!-- メインコマンド（枠の中に選択肢を縦に並べる）
       command-box--pointer-paused … 公園入口へ戻ってきた直後などに、マウスを動かすまでマウスで押せなくする -->
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

        <!-- ここから下は「どこでも同じコマンド」という区切り（種類がちがうことを、ひとめで分かるように）
             ※ ただの見出しなので、↑↓キーの番号には数えない -->
        <p class="command-box__divider">そのほか</p>

        <!-- 「← 場所選びにもどる」（よく使うので、見た目は上の行動とまったく同じ） -->
        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === leavePlaceCommandIndex }"
          @click="$emit('leave')"
          @mouseenter="selectedIndex = leavePlaceCommandIndex"
          @focus="selectedIndex = leavePlaceCommandIndex">
          <span class="command-box__text">← 場所選びにもどる</span>
        </button>
      </template>

      <!-- 結果が出たあと（「次の場所を選ぶ」の1つだけ） -->
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

    <!-- ============ ひとやすみ（ベンチ） ============
         休憩とおやつは「どこでも同じ、親子の状態を整える行動」なので、ここにまとめている
         「← 場所選びにもどる」の番号はおやつの有無で変わるので leavePlaceCommandIndex を見る -->
    <template v-else-if="variant === 'rest'">
      <!-- おやつバッグ（同じ枠の中身を入れかえて出す。バッグに残っているおやつだけをならべる） -->
      <template v-if="isSnackMenuVisible">
        <p class="command-box__label snack-menu__label">
          <span class="snack-menu__labelIcon">
            <img class="snack-menu__labelImage" :src="snackBagImage" alt="" decoding="async" />
          </span>
          どのおやつにする？
        </p>

        <button
          v-for="(snack, index) in selectedSnacks"
          :key="snack.id"
          class="command-box__item snack-menu__item"
          :class="{ 'command-box__item--selected': snackIndex === index }"
          @click="$emit('eatSnack', snack.id)"
          @mouseenter="snackIndex = index"
          @focus="snackIndex = index">
          <!-- おやつの絵（となりに名前があるので、「グミ グミ」と2回読まれないよう alt は空） -->
          <span class="snack-menu__icon">
            <img class="snack-menu__image" :src="snack.image" alt="" decoding="async" />
          </span>
          <span class="snack-menu__name">{{ snack.name }}</span>
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

      <!-- まだ選んでいないとき -->
      <template v-else-if="!resultMessage">
        <p class="command-box__label">どうする？</p>

        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === 0 }"
          @click="$emit('takeBreak')"
          @mouseenter="selectedIndex = 0"
          @focus="selectedIndex = 0">
          <span class="command-box__text">きゅうけいする</span>
        </button>

        <!-- バッグにおやつが残っているときだけ出す（いやいやタイムと同じバッグ） -->
        <button
          v-if="snackLeft > 0"
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === 1 }"
          @click="$emit('openSnackMenu')"
          @mouseenter="selectedIndex = 1"
          @focus="selectedIndex = 1">
          <span class="command-box__text">おやつにする</span>
          <span class="command-box__badge">残り{{ snackLeft }}個</span>
        </button>

        <p v-else class="command-box__note">おやつは、もうぜんぶ食べてしまいました…</p>

        <!-- 通常の場所と同じく、「そのほか」の区切りの下に「← 場所選びにもどる」を置く -->
        <p class="command-box__divider">そのほか</p>

        <button
          class="command-box__item"
          :class="{ 'command-box__item--selected': selectedIndex === leavePlaceCommandIndex }"
          @click="$emit('leave')"
          @mouseenter="selectedIndex = leavePlaceCommandIndex"
          @focus="selectedIndex = leavePlaceCommandIndex">
          <span class="command-box__text">← 場所選びにもどる</span>
        </button>
      </template>

      <!-- 休憩・おやつの結果のあと（「次の場所を選ぶ」の1つだけ） -->
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

    <!-- ============ いやいやタイム ============ -->
    <template v-else-if="variant === 'tantrum'">
      <!-- おやつバッグ（ひとやすみと同じ形） -->
      <template v-if="isSnackMenuVisible">
        <p class="command-box__label snack-menu__label">
          <span class="snack-menu__labelIcon">
            <img class="snack-menu__labelImage" :src="snackBagImage" alt="" decoding="async" />
          </span>
          どのおやつをあげる？
        </p>

        <button
          v-for="(snack, index) in selectedSnacks"
          :key="snack.id"
          class="command-box__item snack-menu__item"
          :class="{ 'command-box__item--selected': snackIndex === index }"
          @click="$emit('eatSnack', snack.id)"
          @mouseenter="snackIndex = index"
          @focus="snackIndex = index">
          <!-- おやつの絵（となりに名前があるので、「グミ グミ」と2回読まれないよう alt は空） -->
          <span class="snack-menu__icon">
            <img class="snack-menu__image" :src="snack.image" alt="" decoding="async" />
          </span>
          <span class="snack-menu__name">{{ snack.name }}</span>
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
          <span class="command-box__text">おやつをあげる</span>
          <span class="command-box__badge">残り{{ snackLeft }}個</span>
        </button>

        <p v-else class="command-box__note">おやつは、もうぜんぶ食べてしまいました…</p>

        <!-- 少し待ってみる（番号はおやつの有無で変わるので waitCommandIndex を見る） -->
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

<!-- 見た目は command-box.css だけ（game.css をまるごと読むと、使わないCSSまで二重に出力されるため）
     共通の .command-box 〜 は、app.vue が読みこむ command-shared.css にある -->
<style scoped src="~/assets/css/game/command-box.css"></style>
