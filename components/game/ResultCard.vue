<script setup lang="ts">
/* ============================================================
   行動したあとに出る「結果」カード

   行動の結果の文章・見つけたもの・ナイス対応・
   いやいやが始まったときの文・今回の変化（合計）を出す

   ■ このコンポーネントは「計算ずみの結果を表示するだけ」
     ステータスの変更・結果の文章づくり・アイテムやいやいやの判定などは、
     ぜんぶ親（pages/index.vue）のほうでやって、結果だけを props で受け取る
     ここから親の値を書きかえることはしない

   ■ 場面によって、出すものが少しちがう（variant で見分ける）

                                         place   tantrum   suddenEvent
     カードが揺れる（いやいや中）          ○       ○         ×
     「まだ いやいや は続いています…」    ×       ○         ×
     「★ アイテム発見！」（絵つき）        ○       ○         ×
     「✨ ナイス対応！」                    ×       ○         ×

     place       … 通常の場所6か所（すべり台・砂場など）
     tantrum     … いやいやタイム
     suddenEvent … とつぜんのできごと（救急車・テントウムシなど）
   ============================================================ */

import { itemImages, placeItems } from '~/data/places';
import { splitItemName } from '~/utils/itemName';
import type { ChangeGroup, SceneVariant, StatusChanges } from '~/types/game';
import { formatChange } from '~/utils/statusChange';

defineProps<{
  /* どの場面の結果カードか（上の表を参照） */
  variant: SceneVariant;

  /* 結果の文章 */
  resultMessage: string;

  /* いやいや中かどうか（カードを揺らす・「まだ いやいや は続いています…」を出す） */
  isTantrum: boolean;

  /* 今回の行動で新しく見つけたもの */
  foundItemsThisAction: string[];

  /* いやいやが始まったときの文 */
  tantrumText: string;

  /* 今回の変化（null ＝ まだ結果がないので「今回の変化」の枠は出さない）と、その表示用のまとめ */
  statusChanges: StatusChanges | null;
  changeGroups: ChangeGroup[];

  /* ナイス対応の文と、もらえるボーナスの量（いやいやタイムだけで使う） */
  niceTantrumResponseText?: string;
  niceTantrumBonusOutingPoint?: number;
  niceTantrumBonusParentCalm?: number;
}>();

/* アイテムごとの、こうちゃんのひとこと

   結果カードの「★ アイテム発見！」の絵と名前の下に、1文だけ出す
   見出し（キー）は data/places.ts の placeItems のアイテム名をそのまま使う
   （placeItems の名前を変えても、ここは直さなくてよい。前は名前を ここにも書いていて、変えると ひとことが出なくなっていた）

   ※ 同じ文を画面のほうに何度も書かないように、文章はここだけに置いてある
*/
const itemReactions: Record<string, string> = {
  [placeItems.slide]: '「みてみて！」まつぼっくりを見せてくれました。',
  [placeItems.sandbox]: '「つるつるしてる！」何度もさわっています。',
  [placeItems.acornArea]: '「大きいのあった〜！」うれしそうに見せてくれました。',
  [placeItems.pond]: '「きらきら！」光にかざして見ています。',
  [placeItems.grassArea]: '「おはな！」大事そうに持っています。',
  [placeItems.secretSpot]: '「これなに？」くるくる回して見ています。',
};

/* アイテムの名前から、こうちゃんのひとことを取り出す

   対応表に無い名前のときは空文字を返す
   画面のほうは v-if で見ているので、その行はまるごと出ない
   （あとからひとことの無いアイテムを足しても、空の行が残らないようにするため）
*/
function itemReaction(itemName: string) {
  return itemReactions[itemName] ?? '';
}
</script>

<template>
  <!-- とつぜんのできごとのカードは、いやいや中でも揺らさない -->
  <article class="result-card" :class="{ 'result-card--tantrum': variant !== 'suddenEvent' && isTantrum }">
    <h3 class="result-card__title">結果</h3>

    <!-- ここから下が、高さが足りないときにスクロールする部分
         上の「結果」バッジ（h3）は外に置いてあるので、
         スクロールしても切れずに残る -->
    <div class="result-card__body">
      <!-- ※ 小さな「いやいや発生！」の帯は置かない
           発生した瞬間は、画面いっぱいのオーバーレイ（.tantrum-alert）で知らせているので、
           ここにも出すと同じことを2回言うことになる
           カードが軽く左右に揺れる演出（.result-card--tantrum）と、
           いちばん下のいやいや文（.tantrum-line）はそのまま残している -->

      <!-- いやいやタイムだけ：
           対応が効かなかった・少し落ち着いただけで、まだいやいやが続いているときに出す -->
      <p v-if="variant === 'tantrum' && isTantrum" class="result-alert">まだ いやいや は続いています…</p>

      <p class="result-card__text">{{ resultMessage }}</p>

      <!-- ナイス対応（いやいやタイムで、いやいやの理由に合った対応をしたときだけ出す）
           緑の枠（.event-flash--nice → assets/css/game/event-flash.css）で「いいこと」と分かるようにする
           ボーナスの数字は、実際に足している niceTantrumBonus〜 をそのまま出す -->
      <div v-if="variant === 'tantrum' && niceTantrumResponseText" class="event-flash event-flash--nice">
        <p class="event-flash__label">✨ ナイス対応！</p>

        <p class="event-flash__text">{{ niceTantrumResponseText }}</p>

        <ul class="event-flash__list">
          <li class="event-flash__item">
            <span class="event-flash__item-label">おでかけポイント</span>
            <span class="event-flash__item-value change--good">{{ formatChange(niceTantrumBonusOutingPoint ?? 0) }}</span>
          </li>
          <li class="event-flash__item">
            <span class="event-flash__item-label">親の余裕</span>
            <span class="event-flash__item-value change--good">{{ formatChange(niceTantrumBonusParentCalm ?? 0) }}</span>
          </li>
        </ul>
      </div>

      <!-- アイテム発見（今回の行動で新しく見つけたものがあるときだけ。とつぜんのできごとでは出さない）

           ［そのものの大きな絵］ ★ アイテム発見！
                                  名前
                                  こうちゃんのひとこと（文章は上の script の itemReactions）

           ・絵を左、文字を右の横ならびにして、たてに長くならないようにする（PC・スマホとも）
             「★ アイテム発見！」の見出しも、名前の上（右の列）に入れて、1行ぶん低くしている

           ・絵は data/places.ts の itemImages（上部ステータス・リザルトの「見つけたもの」と同じ絵）
             絵が登録されていないものは、絵のかわりに 🔍 を出す
           ・見つけた瞬間に、絵が小さい所から ふわっと大きくなり、まわりが少し光って、小さなきらきらが出る（1回だけ。→ result-card.css）
           ・foundItemsThisAction には、新しく見つけたものしか入らない（もう持っているものは、2回目以降は見つからない）
             ので、この演出は かならず はじめて見つけたときだけ出る
           ・前は、結果の文の上に「★ アイテム発見！［名前］」の帯、文の下に「『○○』を見つけました！」の行と分かれていた
             絵を主役にして1つにまとめ、起きた順（行動 → アイテム → いやいや）で読めるよう、結果の文のあとに置いている -->
      <section v-if="variant !== 'suddenEvent' && foundItemsThisAction.length > 0" class="found-flash" aria-label="アイテム発見">
        <div v-for="(item, index) in foundItemsThisAction" :key="item" class="found-flash__item">
          <!-- 絵（まわりの光・きらきらは飾りなので、読み上げでは読ませない。名前は下の文字で読む） -->
          <div class="found-flash__visual" aria-hidden="true">
            <span class="found-flash__glow"></span>
            <span class="found-flash__medal">
              <img v-if="itemImages[item]" class="found-flash__image" :src="itemImages[item]" alt="" decoding="async" />
              <template v-else>🔍</template>
            </span>
            <span class="found-flash__sparkle found-flash__sparkle--1"></span>
            <span class="found-flash__sparkle found-flash__sparkle--2"></span>
            <span class="found-flash__sparkle found-flash__sparkle--3"></span>
          </div>

          <div class="found-flash__body">
            <!-- 見出しは、いちばん上の1つにだけ付ける（2つ以上見つけても「★ アイテム発見！」は1回） -->
            <p v-if="index === 0" class="found-flash__label">★ アイテム発見！</p>
            <!-- 名前は「ちいさな」「松ぼっくり」のように分けて ならべ、折り返すのは そのあいだ だけにする（→ utils/itemName.ts） -->
            <p class="found-flash__name">
              <span v-for="part in splitItemName(item)" :key="part" class="found-flash__namePart">{{ part }}</span>
            </p>
            <p v-if="itemReaction(item)" class="found-flash__reaction">{{ itemReaction(item) }}</p>
          </div>
        </div>
      </section>

      <!-- いやいやが始まったときの文
           起きた順（行動 → アイテム → いやいや）で
           読めるように、いちばん最後に置く -->
      <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

      <!-- 今回の行動で、どのステータスがどれだけ変わったか
           ※ スマホ幅では CSS（.result-card .change-box）で出さないようにしている
             数字の変化は、上部ステータスのほうで見られるため -->
      <div v-if="statusChanges" class="change-box">
        <p class="change-box__title">今回の変化（合計）</p>

        <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる
             外側のループでグループ、内側のループでその中の項目を出す -->
        <div class="change-groups">
          <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
            <p class="change-group__name">{{ group.name }}</p>

            <ul class="change-list">
              <li v-for="row in group.rows" :key="row.label" class="change-item">
                <span class="change-item__label">{{ row.label }}</span>

                <!-- 行動前 → 行動後
                     「いまいくつになったか」がすぐ分かるように、
                     行動前は小さく控えめに、行動後は大きく濃い色にしている -->
                <span class="change-item__flow">
                  <span class="change-item__before">{{ row.before }}</span>
                  <span class="change-item__arrow">→</span>
                  <span class="change-item__after">{{ row.after }}</span>
                </span>
                <span class="change-item__value" :class="row.className">{{ row.changeText }}</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </article>
</template>

<!-- 見た目は、このコンポーネント専用の assets/css/game/result-card.css だけを読みこむ
     （理由は components/game/StatusBar.vue の <style> の説明と同じ。
       index.vue の scoped CSS は、このコンポーネントの中の要素には届かないため）

     ■ game.css まるごとではなく result-card.css だけにした理由
       game.css を読むと、リザルトやコマンド欄など、ここでは使わないCSSまで
       このコンポーネントぶんとして、もう一度ビルド結果に出てしまう

     ※ ナイス対応の枠（.event-flash 〜）は pages/index.vue のこもれびボーナスでも使うので、
       app.vue からグローバルに読みこむ event-flash.css にある
     ※ result-card.css は game.css からは読みこまない（二重出力になるため） -->
<style scoped src="~/assets/css/game/result-card.css"></style>
