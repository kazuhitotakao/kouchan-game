<script setup lang="ts">
/* ============================================================
   行動したあとに出る「結果」カード

   計算ずみの結果を表示するだけ（計算や判定は、ぜんぶ親の pages/index.vue）

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
// 中の絵が表示できるようになってから、箱ごと出す目印（→ utils/imagePreload.ts）
import { vRevealWithImages } from '~/utils/imagePreload';

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

  /* はじめて解放したミニゲームの名前（「🎮 ミニゲーム解放！」を出す。出さないときは書かないか null） */
  unlockedMinigameTitle?: string | null;
}>();

/* アイテムごとの、こうちゃんのひとこと（「★ アイテム発見！」の名前の下に出す）
   キーは placeItems を使うので、アイテム名を変えても、ここは直さなくてよい
*/
const itemReactions: Record<string, string> = {
  [placeItems.slide]: '「みてみて！」まつぼっくりを見せてくれました。',
  [placeItems.sandbox]: '「つるつるしてる！」何度もさわっています。',
  [placeItems.acornArea]: '「大きいのあった〜！」うれしそうに見せてくれました。',
  [placeItems.pond]: '「きらきら！」光にかざして見ています。',
  [placeItems.grassArea]: '「おはな！」大事そうに持っています。',
  [placeItems.secretSpot]: '「これなに？」くるくる回して見ています。',
};

/* アイテムの名前から、こうちゃんのひとことを取り出す（無ければ空文字。その行は出ない） */
function itemReaction(itemName: string) {
  return itemReactions[itemName] ?? '';
}
</script>

<template>
  <!-- とつぜんのできごとのカードは、いやいや中でも揺らさない -->
  <article class="result-card" :class="{ 'result-card--tantrum': variant !== 'suddenEvent' && isTantrum }">
    <h3 class="result-card__title">結果</h3>

    <!-- ここから下が、高さが足りないときにスクロールする部分（「結果」バッジは外なので切れない） -->
    <div class="result-card__body">
      <!-- ※ 「いやいや発生！」の帯は置かない（発生した瞬間に画面いっぱいで知らせているので、2回言うことになる） -->

      <!-- いやいやタイムで、まだいやいやが続いているときだけ -->
      <p v-if="variant === 'tantrum' && isTantrum" class="result-alert">まだ いやいや は続いています…</p>

      <p class="result-card__text">{{ resultMessage }}</p>

      <!-- ナイス対応（いやいやの理由に合った対応をしたときだけ。数字は実際に足している値） -->
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

      <!-- アイテム発見（新しく見つけたものがあるときだけ。とつぜんのできごとでは出さない）

           ［大きな絵］ ★ アイテム発見！
                        名前
                        こうちゃんのひとこと

           起きた順（行動 → アイテム → いやいや）で読めるよう、結果の文のあとに置く
           絵が登録されていないものは 🔍 を出す -->
      <section v-if="variant !== 'suddenEvent' && foundItemsThisAction.length > 0" v-reveal-with-images class="found-flash" aria-label="アイテム発見">
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
            <!-- 名前は「ちいさな」「松ぼっくり」のように分けて、そのあいだでだけ折り返す -->
            <p class="found-flash__name">
              <span v-for="part in splitItemName(item)" :key="part" class="found-flash__namePart">{{ part }}</span>
            </p>
            <p v-if="itemReaction(item)" class="found-flash__reaction">{{ itemReaction(item) }}</p>
          </div>
        </div>
      </section>

      <!-- いやいやが始まったときの文（起きた順で読めるよう、いちばん最後） -->
      <p v-if="tantrumText" class="tantrum-line">{{ tantrumText }}</p>

      <!-- ミニゲームを、はじめて解放したときだけ（いまはテントウムシのできごとだけ。秘密の小道の結果と同じ枠） -->
      <div v-if="unlockedMinigameTitle" class="event-flash event-flash--minigame" role="status">
        <p class="event-flash__label">🎮 ミニゲーム解放！</p>

        <p class="event-flash__text"><span class="event-flash__phrase">「{{ unlockedMinigameTitle }}」が</span><span class="event-flash__phrase">あそべるようになりました！</span></p>

        <p class="event-flash__note"><span class="event-flash__phrase">はじめの画面の「🎮 ミニゲーム」から</span><span class="event-flash__phrase">あそべます</span></p>
      </div>

      <!-- 今回の行動で、どのステータスがどれだけ変わったか（スマホ幅では、上部ステータスで見られるので CSS で消す） -->
      <div v-if="statusChanges" class="change-box">
        <p class="change-box__title">今回の変化（合計）</p>

        <!-- こうちゃん／親／おでかけ の3つに分けて横に並べる -->
        <div class="change-groups">
          <section v-for="group in changeGroups" :key="group.name" class="change-group" :class="group.groupClass">
            <p class="change-group__name">{{ group.name }}</p>

            <ul class="change-list">
              <li v-for="row in group.rows" :key="row.label" class="change-item">
                <span class="change-item__label">{{ row.label }}</span>

                <!-- 行動前 → 行動後（「いまいくつか」がすぐ分かるよう、行動後を大きく） -->
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

<!-- 見た目は result-card.css だけ（game.css をまるごと読むと、使わないCSSまで二重に出力されるため）
     ナイス対応の枠は、app.vue が読みこむ event-flash.css にある -->
<style scoped src="~/assets/css/game/result-card.css"></style>
