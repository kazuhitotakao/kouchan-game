<script setup lang="ts">
/* ============================================================
   秘密の小道の「枝」「こもれび」の絵（前は 🌿・✨ の絵文字だったところ）

   フィールドを流れてくる絵と、ルールの説明・HUD・記録などの文の中の絵の、どちらにもこの部品を使う
   ・kind … branch（枝）／sunlight（こもれび）。画像のパスは data/secretPath.ts の secretPathItemImages
   ・alt  … 読み上げで読ませる名前
            文の中で「枝」「こもれび」という言葉のかわりになっているところ（「［枝の絵］をよけて」）では、
            「枝」「こもれび」を渡す
            となりに同じ言葉が書いてあるところ・フィールドの中など、読ませなくてよいところでは渡さない（空 ＝ かざり）

   ■ 大きさは、まわりの文字の大きさ（em）で決まる
     文の中に置けば文字に合った大きさになり、フィールドでは .secret-path-item の font-size で決まる
     大きさを変えたいときは、置き場所の font-size を変える
   ============================================================ */

import { secretPathItemImages } from '~/data/secretPath';
import type { SecretPathItemKind } from '~/types/game';

withDefaults(
  defineProps<{
    kind: SecretPathItemKind;
    alt?: string;
  }>(),
  { alt: '' },
);
</script>

<template>
  <img class="secret-path-icon" :class="`secret-path-icon--${kind}`" :src="secretPathItemImages[kind]" :alt="alt" decoding="async" draggable="false" />
</template>

<style scoped>
/* 絵は、文字と同じ行に置いても文字のまんなかの高さにそろうよう、vertical-align で少し下げる
   （日本語の文字は、ならびの線（baseline）より上に ほぼ 0.88em、下に 0.12em ほど出ているので、文字のまんなかは baseline の 0.38em 上）
   pointer-events: none … フィールドでは、絵の上からでも下の道を押せるようにする（文の中でも、押してどうなるものではない） */
.secret-path-icon {
  display: inline-block;
  flex: none;
  max-width: none;
  pointer-events: none;
  user-select: none;
}

/* 枝（画像は 1536 × 1024 の 3:2）

   絵は横いっぱい（はしから 6%〜96%）、たては 18%〜93% にある
   わくを 2em × 1.1em（絵の形に近い横長）にして、object-fit: cover で横幅に合わせて広げ、上下の透明な余白を切り落とす
   （広げると画像の高さは 約1.33em になるので、0.23em 切る。絵は下寄りなので、object-position で 80% の位置を出す）
   ・枝はななめに細く描いてあるので、文字1つぶん（1em）の高さだと 小さく見える。そのため、ひとまわり大きくしている
   ・vertical-align … 高さ 1.1em のわくのまんなかを、文字のまんなか（0.38em）にそろえる */
.secret-path-icon--branch {
  width: 2em;
  height: 1.1em;
  object-fit: cover;
  object-position: 50% 80%;
  vertical-align: -0.17em;
}

/* こもれび（画像は 1254 × 1254 の正方形）

   光の玉ときらきらは、横 16%〜90%・たて 9%〜80% の所にあり、まわりは透明な余白（測った値）
   そのままだと、わくの大きさのわりに絵が小さく見えるので、transform で 1.34倍に広げて、絵の横幅（74%）を わくの幅にそろえる
   ・わく（1.2em の正方形）の大きさは変わらないので、まわりの文字の並びはずれない
     （広げたぶん はみ出すのは、ほとんど透明な余白と、うすい光のにじみだけ）
   ・絵のまんなかは、画像のまんなかより少し右上（横 52.8%・たて 44.5%）にあるので、
     translate で そのぶん戻して、わくのまんなかに絵のまんなかが来るようにする
     （scale のあとに書いた translate は、広げたあとの大きさで動くので、もとの画像の ずれの量をそのまま書けばよい）
   ・※ 画像を差しかえて、絵の大きさ・位置が変わったときは、この 1.34 と translate を測りなおす
     （前の画像は絵が小さく（横 23%〜80%）、1.75倍にしていた。そのまま新しい画像に使うと、わくから3割はみ出して となりの文字にくっついた）
   ・vertical-align … 高さ 1.2em のわくのまんなかを、文字のまんなか（0.38em）にそろえる
   ・filter … 淡い黄色の絵なので、クリーム色や白の上では ふちがぼやけて見える。こげ茶のうすい影で ふちを少しだけ はっきりさせる
     （transform で広げる前の大きさで付くので、見た目は 0.6px の 1.34倍 ほどになる）
     フィールドの中では、枝・こもれびのほうで別の ふちどりを付けているので、この影は付けない（→ secret-path-field.css の .secret-path-item） */
.secret-path-icon--sunlight {
  width: 1.2em;
  height: 1.2em;
  object-fit: contain;
  transform: scale(1.34) translate(-2.8%, 5.6%);
  vertical-align: -0.22em;
  filter: drop-shadow(0 0 0.6px rgb(170 110 0 / 55%));
}
</style>
