/* ============================================================
   画像の先読みと、「画像がそろってから まとめて出す」しくみ

   まだ読みこんでいない画像があると、ボタンや文字が先に出て、画像だけあとから ぱっと出てしまうため
   ① 先読み … はじめの画面を開いたときに、この先で使う画像を読みこんでおく
   ② まとめて出す（v-reveal-with-images）… 先読みが間に合わなかったときは、箱ごと そろってから出す
   ============================================================ */

import type { Directive } from 'vue';

import { suddenEventBannerImages } from '~/data/game';
import { minigames } from '~/data/minigames';
import { parkMapImages } from '~/data/parkMap';
import { itemImages, placeBannerImages } from '~/data/places';
import { secretPathItemImages, secretPathPlayerImages } from '~/data/secretPath';
import { snackBagImage, snacks } from '~/data/snacks';
import { tantrumBannerImages } from '~/data/tantrum';
import type { BannerImage } from '~/types/game';

/* 一度 読みはじめた画像は、ここにおぼえておく
   ・同じ画像を2回読まない（何回呼ばれても、同じ Promise を返す）
   ・Image をここで持ちつづけるので、読みおわった絵がブラウザのメモリから消されにくい */
const loadingImages = new Map<string, { image: HTMLImageElement; ready: Promise<void> }>();

/* 画像を1枚 先読みする（読みこみ ＋ 絵にする準備（decode）まで）
   読みこみに失敗しても、待っている側が止まらないように、エラーにはしない */
function preloadImage(src: string): Promise<void> {
  const loading = loadingImages.get(src);
  if (loading) return loading.ready;

  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  const ready = image.decode().catch(() => {});
  loadingImages.set(src, { image, ready });
  return ready;
}

/* 画像を何枚か まとめて先読みする（ぜんぶ終わったら解決する） */
export async function preloadImages(srcs: readonly string[]): Promise<void> {
  if (!import.meta.client) return;

  await Promise.all(srcs.map(preloadImage));
}

/* 場面の絵（バナー）のうち、絵があるものの画像のパス（まだ仮の枠の場面は入れない） */
function getBannerImageSrcs(banners: Record<string, BannerImage>): string[] {
  return Object.values(banners).flatMap((banner) => ('src' in banner ? [banner.src] : []));
}

/* 本編で使う画像を、出てくる順に3回に分けて先読みする（すぐ次に出る画像から先に届くように）
   ① おやつ選択画面と地図（地図は、いまの画面の幅で出るほう1枚だけ）
   ② 場面の絵（場所・とつぜんのできごと・いやいや）と、見つけたもの
   ③ 秘密の小道
   ※ 場面の絵は、data/ の絵の一覧から集める（一覧に足した絵は、ここを直さなくても先読みされる） */
export async function preloadGameImages(): Promise<void> {
  if (!import.meta.client) return;

  const isSp = window.matchMedia(`(max-width: ${parkMapImages.spMaxWidth}px)`).matches;
  const parkMapImage = isSp ? parkMapImages.sp : parkMapImages.pc;

  await preloadImages([...snacks.map((snack) => snack.image), snackBagImage, parkMapImage]);
  await preloadImages([
    ...getBannerImageSrcs(placeBannerImages),
    ...getBannerImageSrcs(suddenEventBannerImages),
    ...Object.values(tantrumBannerImages),
    ...Object.values(itemImages),
  ]);
  await preloadSecretPathImages();
}

/* 秘密の小道で使う絵を先読みする（こうちゃんの3枚の絵が、はじめて入れかわったときに一瞬消えないように） */
export function preloadSecretPathImages(): Promise<void> {
  const iconImages = minigames.flatMap((minigame) => (minigame.iconImage ? [minigame.iconImage] : []));

  return preloadImages([...iconImages, ...Object.values(secretPathItemImages), ...Object.values(secretPathPlayerImages)]);
}

/* 箱がふわっと出る長さ（場面の切り替え .scene-enter-active と同じ 0.24秒） */
const revealDuration = 240;

/* 画像がそろうのを待つ、いちばん長い時間（ボタンが いつまでも出てこないことがないように） */
const revealTimeout = 3000;

/* ============================================================
   v-reveal-with-images

   中の画像が ぜんぶ表示できるようになってから、箱ごと出す（もう読みおわっていれば、すぐ出る）
   ・opacity: 0 で隠す（visibility: hidden だと、出たときにボタンへフォーカスを当てられないため）
   ・待つのは mounted のときの画像だけ（あとから増える画像は、先読みしてあるので待たない）
   ============================================================ */
export const vRevealWithImages: Directive<HTMLElement> = {
  mounted(el) {
    const images = Array.from(el.querySelectorAll('img'));
    if (images.every((image) => image.complete)) return;

    el.style.opacity = '0';
    el.style.pointerEvents = 'none';

    let isRevealed = false;
    const reveal = () => {
      if (isRevealed) return;
      isRevealed = true;
      el.style.opacity = '';
      el.style.pointerEvents = '';

      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: revealDuration, easing: 'ease-out' });
      }
    };

    Promise.all(images.map((image) => image.decode().catch(() => {}))).then(reveal);
    window.setTimeout(reveal, revealTimeout);
  },
};
