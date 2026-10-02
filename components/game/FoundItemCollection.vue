<script setup lang="ts">
/* ============================================================
   リザルト画面の「見つけたもの」（図鑑のような6つのマス）

   ゴールしたあとのリザルトと、GAME OVER の両方で使う（pages/index.vue の「見つけたもの」のカードの中身）

   ■ 出しかた
     ・見つかるもの6種類（data/places.ts の placeItems）を、いつも同じ順にマスへならべる（3列 × 2段）
     ・見つけたもの … 大きな丸いメダルに、そのものの絵（data/places.ts の itemImages）と名前
     ・まだのもの   … 点線の丸に「？」。名前も「？？？」にして、何が見つかるかは言わない
                      （あといくつ見つかるものがあるかだけを伝えて、次も探したくなるようにする）
     ・6つぜんぶ見つけたら、メダルを金色に光らせて「コンプリート！」と出す
     ・リザルトが出たら、見つけたメダルが1つずつ順に、ぽんっと出てくる（動きを減らす設定のときは出さない）

   ■ 読み上げ
     メダルの絵・「？」は飾りなので読ませない（名前の文字を読む）
     まだのマスは「？？？」と読まれても分からないので、かわりに「まだ見つけていないもの」と読ませる
   ============================================================ */

import { computed } from 'vue';

import { itemImages, placeItems } from '~/data/places';
import { splitItemName } from '~/utils/itemName';

const props = defineProps<{
  /* これまでに見つけたものの名前（見つけた順） */
  collectedItems: string[];
}>();

/* 6つのマス（placeItems の順。すべり台 → 砂場 → どんぐりの木 → 池 → 芝生広場 → こもれびの広場）
   foundOrder … 見つけたもののうち、何番目のマスか（ぽんっと出てくる順。まだのマスは -1） */
const slots = computed(() => {
  let foundCount = 0;

  return Object.values(placeItems).map((name) => {
    const isFound = props.collectedItems.includes(name);

    return {
      name,
      isFound,
      image: itemImages[name] ?? null,
      foundOrder: isFound ? foundCount++ : -1,
    };
  });
});

/* 6つぜんぶ見つけたか */
const isComplete = computed(() => slots.value.every((slot) => slot.isFound));
</script>

<template>
  <div class="found-collection" :class="{ 'found-collection--complete': isComplete }">
    <ul class="found-collection__list">
      <li
        v-for="slot in slots"
        :key="slot.name"
        class="found-collection__slot"
        :class="slot.isFound ? 'found-collection__slot--found' : 'found-collection__slot--empty'"
        :style="slot.isFound ? { '--found-order': slot.foundOrder } : undefined">
        <!-- メダル（見つけたものは絵。絵が登録されていないものは 🔍、まだのものは「？」） -->
        <span class="found-collection__medal" aria-hidden="true">
          <template v-if="slot.isFound">
            <img v-if="slot.image" class="found-collection__image" :src="slot.image" alt="" decoding="async" />
            <template v-else>🔍</template>
          </template>
          <template v-else>？</template>
        </span>

        <!-- 名前は「ちいさな」「松ぼっくり」のように分けて ならべ、折り返すのは そのあいだ だけにする（→ utils/itemName.ts） -->
        <span v-if="slot.isFound" class="found-collection__name">
          <span v-for="part in splitItemName(slot.name)" :key="part" class="found-collection__namePart">{{ part }}</span>
        </span>
        <template v-else>
          <span class="found-collection__name" aria-hidden="true">？？？</span>
          <span class="found-collection__srOnly">まだ見つけていないもの</span>
        </template>
      </li>
    </ul>

    <p v-if="isComplete" class="found-collection__complete">コンプリート！</p>
  </div>
</template>

<style scoped>
/* 6つのマス（3列 × 2段。スマホ幅でも3列のまま） */
.found-collection__list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 8px;
  margin: 0;
  padding: 4px 0 0;
  list-style: none;
}

/* position: relative … 中の読み上げ用の文字（.found-collection__srOnly。position: absolute）の基準を、このマスにする
   無いと、基準がページ全体（body）になって、文字がリザルトの中央エリア（スクロールする箱）の外へ はみ出し、
   ページ全体まで たてにスクロールしてしまう（中央エリアのスクロールと二重になる） */
.found-collection__slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
  text-align: center;
}

/* メダル（丸）

   ■ 大きさ … PC 72px・スマホ 60px（→ 下の @media (max-width: 700px)）
   ■ 見つけたもの … クリーム色の丸に、金色のふち。下に うすい影を付けて、メダルのように少し浮かせる */
.found-collection__medal {
  --medal-size: 72px;

  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--medal-size);
  height: var(--medal-size);
  border-radius: 50%;
  font-size: calc(var(--medal-size) * 0.4);
  font-weight: 700;
  line-height: 1;
}

/* ・overflow: hidden … 絵（四角い画像）を、メダルの丸の形に切りぬく
   ・isolation: isolate … 絵の白を multiply でなじませる相手を、メダル自身のクリーム色だけにする
     （これが無いと、ぽんっと出てくる動き（transform）のあいだ、なじませる相手が無くなって、
       画像の白い四角が丸の外に見えてしまう）
   ・box-shadow（下の影・コンプリートの光）は、overflow: hidden でも切れない（わくの外に描かれるため） */
.found-collection__slot--found .found-collection__medal {
  overflow: hidden;
  isolation: isolate;
  border: 2px solid #f0cf7a;
  background: radial-gradient(circle at 50% 38%, #fffdf6 0 45%, #fff1c9 100%);
  box-shadow:
    0 3px 0 rgb(180 130 30 / 18%),
    inset 0 0 0 3px rgb(255 255 255 / 70%);
}

/* メダルの絵（data/places.ts の itemImages）

   ・メダルの 9割の大きさにする（絵は画像のまんなかの 7割ほどなので、絵そのものはメダルの丸の内がわに収まる）
   ・画像は透明ではなく、うしろが白でぬってあるので、multiply でメダルのクリーム色になじませる
     （3%明るくして、少し黄みがかった白を まっ白にそろえてから重ねる。おやつ・上部ステータスの絵と同じ）
   ・画像の四すみの白い余白は、multiply でメダルになじむので、丸からはみ出して見えることはない */
.found-collection__image {
  display: block;
  width: 90%;
  height: 90%;
  object-fit: contain;
  mix-blend-mode: multiply;
  filter: brightness(1.03);
}

/* まだ見つけていないマス：点線の灰色の丸に「？」 */
.found-collection__slot--empty .found-collection__medal {
  border: 2px dashed #cfd7e3;
  background: #f4f6fa;
  color: #b3bdcb;
}

/* 名前（長い名前は、言葉の区切りで2行に折り返す。「ちいさな／松ぼっくり」） */
.found-collection__name {
  color: #6a4a10;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

/* 名前の ひとかたまり（「ちいさな」「松ぼっくり」 → utils/itemName.ts の splitItemName()）
   inline-block にすると、かたまりの中では折り返さず、かたまりと かたまりの あいだでだけ折り返す
   max-width: 100% … かたまり1つでも入りきらない、とても せまい所では、かたまりの中でも折り返す（はみ出さない） */
.found-collection__namePart {
  display: inline-block;
  max-width: 100%;
}

.found-collection__slot--empty .found-collection__name {
  color: #a7b1bf;
  letter-spacing: 0.08em;
}

/* 見た目からは消して、読み上げでは読まれる文字（display: none にすると読まれなくなるので、1px に縮めて隠す） */
.found-collection__srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ===== ぽんっと出てくる =====

   リザルトのカードが浮き上がって出てくる（0.3〜0.5秒）のを待ってから、見つけたメダルを1つずつ順に出す
   ・--found-order … 見つけたもののうち何番目か（0, 1, 2 …）。1つにつき 0.12秒ずつ おくらせる
   ・backwards … 出てくる前（おくれているあいだ）は、はじめの見た目（小さく・すけた）のままにしておく */
.found-collection__slot--found .found-collection__medal {
  animation: found-medal-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
  animation-delay: calc(0.5s + var(--found-order, 0) * 0.12s);
}

.found-collection__slot--found .found-collection__name {
  animation: found-name-in 0.3s ease-out backwards;
  animation-delay: calc(0.6s + var(--found-order, 0) * 0.12s);
}

@keyframes found-medal-pop {
  from {
    opacity: 0;
    transform: scale(0.4) rotate(-12deg);
  }

  to {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

@keyframes found-name-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ===== コンプリート（6つぜんぶ見つけたとき） =====

   メダルのふちを濃い金色にして、ゆっくり光らせる
   下に「コンプリート！」の金色の札を出す */
.found-collection--complete .found-collection__slot--found .found-collection__medal {
  border-color: #e0a92e;
  animation:
    found-medal-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards,
    found-medal-glow 2.4s ease-in-out 1.4s infinite;
  animation-delay: calc(0.5s + var(--found-order, 0) * 0.12s), 1.4s;
}

@keyframes found-medal-glow {
  0%,
  100% {
    box-shadow:
      0 3px 0 rgb(180 130 30 / 18%),
      inset 0 0 0 3px rgb(255 255 255 / 70%),
      0 0 0 0 rgb(255 209 102 / 0%);
  }

  50% {
    box-shadow:
      0 3px 0 rgb(180 130 30 / 18%),
      inset 0 0 0 3px rgb(255 255 255 / 70%),
      0 0 12px 3px rgb(255 209 102 / 75%);
  }
}

.found-collection__complete {
  width: fit-content;
  margin: 14px auto 0;
  padding: 4px 18px;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffe08a 0%, #f5bf3c 100%);
  box-shadow: 0 2px 0 rgb(160 110 10 / 30%);
  color: #6a4300;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.1em;
  animation: found-name-in 0.3s ease-out 1.3s backwards;
}

/* スマホ幅：メダルを少し小さくする（3列のまま、名前が2行でも収まるように） */
@media (max-width: 700px) {
  .found-collection__medal {
    --medal-size: 60px;
  }

  .found-collection__name {
    font-size: 12.5px;
  }
}

/* 動きを減らす設定のときは、ぽんっと出す・光らせる動きをやめて、はじめから出しておく */
@media (prefers-reduced-motion: reduce) {
  .found-collection__medal,
  .found-collection__name,
  .found-collection__complete,
  .found-collection--complete .found-collection__slot--found .found-collection__medal {
    animation: none;
  }
}
</style>
