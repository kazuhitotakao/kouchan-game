/* ============================================================
   画像の先読みと、「画像がそろってから まとめて出す」しくみ

   ■ 困っていたこと
     スマホなどで、まだ読みこんでいない画像のある画面へ進むと、
     ボタンや文字が先に出て、画像だけがあとから ぱっと出ていた
     （公園入口なら、白い地図の上にボタンだけが浮かんで見え、あとから地図の絵が出る）

   ■ 直しかた（2つを組み合わせる）
     ① 先読み（preloadImages / preloadGameImages）
        はじめの画面を開いたときに、この先で使う画像を、うしろで先に読みこんでおく
        画面へ進むころには読みこみが終わっているので、ふつうは ぜんぶ同時に出る
     ② まとめて出す（v-reveal-with-images）
        回線がおそくて、先読みが間に合わなかったときのための しくみ
        箱の中の画像が ぜんぶ表示できるようになるまで、箱ごと見えなくしておき、
        そろったら、箱ごと ふわっと出す
   ============================================================ */

import type { Directive } from 'vue';

import { minigames } from '~/data/minigames';
import { parkMapImages } from '~/data/parkMap';
import { itemImages } from '~/data/places';
import { secretPathItemImages, secretPathPlayerImages } from '~/data/secretPath';
import { snackBagImage, snacks } from '~/data/snacks';

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

/* 本編（pages/index.vue）で使う画像を、出てくる順に先読みする

   回線がおそいときに、すぐ次に出る画像から先に届くよう、3回に分けて読む
   1. おやつ選択画面（おやつ6つ・おやつバッグ）と、公園入口の地図
   2. 見つけたもの（結果カード・上のステータス・結果画面で出る）
   3. 秘密の小道（ミニゲーム）の絵
   地図は、いまの画面の幅で出るほう1枚だけ読む（<picture> の <source media> と同じ幅で選ぶ） */
export async function preloadGameImages(): Promise<void> {
  if (!import.meta.client) return;

  const isSp = window.matchMedia(`(max-width: ${parkMapImages.spMaxWidth}px)`).matches;
  const parkMapImage = isSp ? parkMapImages.sp : parkMapImages.pc;

  await preloadImages([...snacks.map((snack) => snack.image), snackBagImage, parkMapImage]);
  await preloadImages(Object.values(itemImages));
  await preloadSecretPathImages();
}

/* 秘密の小道（ミニゲーム）で使う絵を先読みする

   こうちゃんの絵は、枝に当たったとき・こもれびを取ったときに入れかわるので、
   3枚とも先に読んでおかないと、はじめて入れかわったときに一瞬 絵が消えてしまう */
export function preloadSecretPathImages(): Promise<void> {
  const iconImages = minigames.flatMap((minigame) => (minigame.iconImage ? [minigame.iconImage] : []));

  return preloadImages([...iconImages, ...Object.values(secretPathItemImages), ...Object.values(secretPathPlayerImages)]);
}

/* 箱がふわっと出る長さ（場面の切り替え .scene-enter-active と同じ 0.24秒） */
const revealDuration = 240;

/* 画像がそろうのを待つ、いちばん長い時間
   回線がとてもおそいときや、画像が読めないときでも、ボタンが いつまでも出てこないことがないように、
   この時間がたったら、画像を待たずに出す */
const revealTimeout = 3000;

/* ============================================================
   v-reveal-with-images

   この目印を付けた箱は、中の画像（<img>）が ぜんぶ表示できるようになってから、箱ごと出る
   画像がもう読みおわっているとき（先読みが間に合ったとき）は、何もしない（すぐ出る）

   ・見えなくするのは opacity: 0（visibility: hidden にはしない）
     画面が出たときに、ボタンへフォーカスを当てているところがあるため
     （visibility: hidden の中のボタンには、フォーカスが当たらない）
   ・見えないあいだは pointer-events: none で、見えないボタンを押せないようにする
   ・待つのは、箱が出てきたとき（mounted）の画像だけ
     あとから増える画像（見つけたものが増えたときなど）は、先読みしてあるので待たない
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
