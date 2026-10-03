<script setup lang="ts">
/* ============================================================
   秘密の小道の「枝」「こもれび」の絵（フィールドの中と、文の中の両方で使う）
   ・alt … 言葉のかわりになっているところ（「［枝の絵］をよけて」）でだけ渡す（ほかは空 ＝ かざり）
   ・大きさは、まわりの文字の大きさ（em）で決まる（変えたいときは、置き場所の font-size を変える）
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
/* 絵は、文字のまんなか（baseline の 0.38em 上）の高さにそろうよう、下の vertical-align で少し下げる
   pointer-events: none … フィールドでは、絵の上からでも下の道を押せるように */
.secret-path-icon {
  display: inline-block;
  flex: none;
  max-width: none;
  pointer-events: none;
  user-select: none;
}

/* 枝（画像は 3:2。絵は たて 18%〜93% にある）
   横長のわくに cover で広げて、上下の透明な余白を切り落とす（絵は下寄りなので 80% の位置を出す）
   細い絵なので、1em だと小さく見えるため、ひとまわり大きくしている */
.secret-path-icon--branch {
  width: 2em;
  height: 1.1em;
  object-fit: cover;
  object-position: 50% 80%;
  vertical-align: -0.17em;
}

/* こもれび（画像は正方形。絵は 横 16%〜90%・たて 9%〜80% にある）
   ・1.34倍に広げて、絵の横幅を わくの幅にそろえる（わくは変わらないので、まわりの文字はずれない）
   ・絵のまんなかが少し右上にずれているので、translate で戻す
   ※ 画像を差しかえたときは、この 1.34 と translate を測りなおす
   ・filter … 淡い黄色なので、白っぽい所では ふちがぼやける。こげ茶のうすい影で少しだけ はっきりさせる */
.secret-path-icon--sunlight {
  width: 1.2em;
  height: 1.2em;
  object-fit: contain;
  transform: scale(1.34) translate(-2.8%, 5.6%);
  vertical-align: -0.22em;
  filter: drop-shadow(0 0 0.6px rgb(170 110 0 / 55%));
}
</style>
