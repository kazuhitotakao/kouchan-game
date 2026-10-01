<script setup lang="ts">
/* ============================================================
   行動したあとに出る「結果」カード

   行動の結果の文章・見つけたもの・ちょっとしたできごと・ナイス対応・
   いやいやが始まったときの文・今回の変化（合計）を出す

   ■ このコンポーネントは「計算ずみの結果を表示するだけ」
     ステータスの変更・結果の文章づくり・アイテムやいやいやの判定などは、
     ぜんぶ親（pages/index.vue）のほうでやって、結果だけを props で受け取る
     ここから親の値を書きかえることはしない

   ■ 場面によって、出すものが少しちがう（variant で見分ける）

                                         place   tantrum   suddenEvent
     カードが揺れる（いやいや中）          ○       ○         ×
     「まだ いやいや は続いています…」    ×       ○         ×
     「★ アイテム発見！」                  ○       ○         ×
     「✨ ナイス対応！」                    ×       ○         ×

     place       … 通常の場所6か所（すべり台・砂場など）
     tantrum     … いやいやタイム
     suddenEvent … とつぜんのできごと（救急車・テントウムシなど）
   ============================================================ */

import type { ChangeGroup, RandomEventEffect, SceneVariant, StatusChanges } from '~/types/game';
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

  /* ちょっとしたできごと（ランダムイベント）の文章と、そのぶんの増減 */
  randomEventText: string;
  randomEventEffects: RandomEventEffect[];

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

   結果カードの「★ アイテム発見！」「『○○』を見つけました！」の下に、1文だけ出す
   見出し（キー）は pages/index.vue の placeItems のアイテム名とそろえてあるので、
   placeItems の名前を変えたときは、ここも合わせて変えること

   ※ 同じ文を画面のほうに何度も書かないように、文章はここだけに置いてある
*/
const itemReactions: Record<string, string> = {
  ちいさな松ぼっくり: '「みてみて！」まつぼっくりを見せてくれました。',
  きれいな石: '「つるつるしてる！」何度もさわっています。',
  大きなどんぐり: '「大きいのあった〜！」うれしそうに見せてくれました。',
  水色のガラス玉: '「きらきら！」光にかざして見ています。',
  黄色い花: '「おはな！」大事そうに持っています。',
  ふしぎな形の枝: '「これなに？」くるくる回して見ています。',
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

      <!-- 今回の行動で新しく見つけたものがあるときだけ出す（とつぜんのできごとでは出さない） -->
      <p v-if="variant !== 'suddenEvent' && foundItemsThisAction.length > 0" class="found-flash">
        <span class="found-flash__label">★ アイテム発見！</span>
        <span v-for="item in foundItemsThisAction" :key="item" class="found-flash__item">{{ item }}</span>
      </p>

      <p class="result-card__text">{{ resultMessage }}</p>

      <!-- ナイス対応（いやいやタイムで、いやいやの理由に合った対応をしたときだけ出す）
           「ちょっとしたできごと」と同じ形の枠を使い、色だけ緑に変えて「いいこと」と分かるようにする
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

      <!-- 見つけたものの文
           アイテムの名前だけ、色をつけて文の中でも目立つようにする

           そのすぐ下に、アイテムごとのこうちゃんのひとことを1文そえる
           （文章は上の script の itemReactions にまとめてある）
           今回の行動で新しく見つけたときだけ出る
           （foundItemsThisAction には、新しく見つけたものしか入らない） -->
      <template v-for="item in foundItemsThisAction" :key="item">
        <p class="found-line">
          「
          <b class="found-line__name">{{ item }}</b>
          」を見つけました！
        </p>

        <p v-if="itemReaction(item)" class="found-reaction">{{ itemReaction(item) }}</p>
      </template>

      <!-- 行動の最中に起きたちょっとしたできごと（ランダムイベント）
           地の文にまぎれないように、専用の枠と
           色つきのしるし（おでかけポイント +5 など）で出す -->
      <div v-if="randomEventText" class="event-flash">
        <p class="event-flash__label">ちょっとしたできごと！</p>

        <p class="event-flash__text">{{ randomEventText }}</p>

        <ul v-if="randomEventEffects.length > 0" class="event-flash__list">
          <li v-for="effect in randomEventEffects" :key="effect.label" class="event-flash__item">
            <span class="event-flash__item-label">{{ effect.label }}</span>
            <span class="event-flash__item-value" :class="effect.className">{{ effect.text }}</span>
          </li>
        </ul>
      </div>

      <!-- いやいやが始まったときの文
           起きた順（行動 → アイテム → ちょっとしたできごと → いやいや）で
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

     ※ ちょっとしたできごと（.event-flash 〜）は pages/index.vue でも使うので、
       app.vue からグローバルに読みこむ event-flash.css にある
     ※ result-card.css は game.css からは読みこまない（二重出力になるため） -->
<style scoped src="~/assets/css/game/result-card.css"></style>
