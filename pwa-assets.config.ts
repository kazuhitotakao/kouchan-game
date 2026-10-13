/* ============================================================
   アプリのアイコンを、元の絵1枚から作る設定（@vite-pwa/assets-generator）

   元の絵 … public/icons/app-icon.png（1024 × 1024。背景は色でぬってあり、大事なものは中央の直径 820px の円の中）
   作りかた … npm run generate-icons（絵を差しかえたら、もう一度これを実行する）
   作ったファイルは、元の絵と同じ public/icons/ に入る（場所は変えられない）

     pwa-192x192.png・pwa-512x512.png … ホーム画面のアイコン（manifest → nuxt.config.ts）
                                       512 は、ロック画面・車の画面の曲の画像にも使う（→ utils/mediaSession.ts）
     maskable-icon-512x512.png       … Android が丸や角丸に切りぬく用（manifest → nuxt.config.ts）
     apple-touch-icon-180x180.png    … iPhone のホーム画面のアイコン（<link> → nuxt.config.ts）
     favicon.ico                     … ブラウザのタブ（<link> → nuxt.config.ts）

   ■ padding: 0 にしている理由
     この道具は、ふつうは絵のまわりに余白を足して、白などでぬる
     元の絵は、もう背景をぬってあり、切りぬかれても大丈夫な位置に描いてあるので、余白は足さずにそのまま縮める
   ============================================================ */
import { defineConfig } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  images: ['public/icons/app-icon.png'],

  preset: {
    transparent: {
      sizes: [192, 512],
      favicons: [[48, 'favicon.ico']],
      padding: 0,
    },

    maskable: {
      sizes: [512],
      padding: 0,
    },

    apple: {
      sizes: [180],
      padding: 0,
    },
  },
});
