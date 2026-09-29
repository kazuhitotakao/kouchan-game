<script setup lang="ts">
/* ============================================================
   画像の置き場所（まだ画像が無いときは「NO IMAGE」の仮の枠を出す）

   イラストを入れる前に、置き場所と大きさを画面で確かめるための部品
   ・src を渡したとき   … その画像を、枠いっぱいに出す（はみ出したぶんは切る。object-fit: cover）
   ・src が無いとき     … 灰色の点線の枠に「NO IMAGE」と、何の絵が入るか（label）を出す
   本番の画像ができたら、使っている側で src を渡すだけで入れかわる

   ■ 大きさ
     縦横比（ratio）だけをこの部品で決める
     幅・高さの上限（max-width / max-height）は、置き場所ごとにちがうので、使う側の CSS で決める
     （使う側の scoped CSS は、この部品のいちばん外の要素には届く）

   ■ 読み上げ
     どの置き場所の絵も、となりの文字（場所の名前など）と同じことを表す飾りなので、
     仮の枠は aria-hidden にして読ませない
     画像を入れたときも、alt を渡さなければ空（＝飾りとして読みとばす）にする
   ============================================================ */

withDefaults(
  defineProps<{
    /* 縦横比（CSS の aspect-ratio の書きかた。例：'16 / 9'、'3 / 1'） */
    ratio: string;

    /* 仮の枠に出す、何の絵が入るかの名前（例：「すべり台」） */
    label?: string;

    /* 本番の画像のパス（例：'/images/places/slide.webp'）。無いあいだは仮の枠を出す */
    src?: string;

    /* 画像の説明（読み上げ用）。飾りの絵なら空のままでよい */
    alt?: string;
  }>(),
  { label: '', src: '', alt: '' },
);
</script>

<template>
  <!-- いちばん外は span（CSS で block にする）
       ボタン（<button>）の中にも置けるようにするため（button の中に div は置けない） -->
  <span class="no-image" :class="{ 'no-image--empty': !src }" :style="{ aspectRatio: ratio }">
    <img v-if="src" class="no-image__img" :src="src" :alt="alt" />

    <span v-else class="no-image__placeholder" aria-hidden="true">
      <span class="no-image__text">NO IMAGE</span>
      <span v-if="label" class="no-image__label">{{ label }}</span>
    </span>
  </span>
</template>

<style scoped>
/* 枠（縦横比は :style の aspect-ratio で決まる）

   width: 100% … 置き場所の幅いっぱいに広げる（上限は使う側の max-width / max-height）
   overflow: hidden … 角を丸めた外へ画像がはみ出さないように */
.no-image {
  box-sizing: border-box;
  display: block;
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 10px;

  /* 枠の幅に合わせて、中の文字の出しかたを変えられるようにする（→ 下の @container） */
  container-type: inline-size;
}

/* 仮の枠のときだけ、点線のふちと灰色の下地を付ける */
.no-image--empty {
  border: 2px dashed #b8c3d3;
  background: repeating-linear-gradient(-45deg, #eef2f7 0 12px, #e6ebf2 12px 24px);
}

.no-image__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 「NO IMAGE」と名前を、枠のまん中に縦にならべる */
.no-image__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  color: #8793a6;
  line-height: 1.3;
  text-align: center;
}

.no-image__text {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.no-image__label {
  font-size: 12px;
}

/* 小さい枠（幅 130px 以下）では、名前まで入りきらないので「NO IMAGE」だけにする */
@container (max-width: 130px) {
  .no-image__text {
    font-size: 11px;
    letter-spacing: 0.06em;
  }

  .no-image__label {
    display: none;
  }
}
</style>
