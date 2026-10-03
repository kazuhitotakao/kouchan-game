// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: {
    enabled: true,
  },

  app: {
    /*
     * ページを行き来するときのフェード（CSS は app.vue の .page-fade-〜）
     * mode: 'out-in' … 前のページが消えきってから次を出す（2ページが重ならないので、ガタッと動かない）
     */
    pageTransition: {
      name: 'page-fade',
      mode: 'out-in',
    },

    head: {
      /*
       * viewport-fit=cover … iPhone で、画面のはし（ノッチのまわり）まで描く
       *   ボタンや文字は、枠の内がわの env(safe-area-inset-〜) の余白でよけている
       */
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',

      meta: [
        /*
         * 古い iPhone（iOS 16.3 まで）は manifest の display を読まないので、
         * ホーム画面から起動したときに standalone 表示にするための目印
         */
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },

        /*
         * iPhone で「ホーム画面に追加」したときの名前（<title> が無いので、書かないとアドレスになる）
         */
        { name: 'apple-mobile-web-app-title', content: 'こうちゃんの大冒険' },
      ],
    },
  },

  modules: ['@vite-pwa/nuxt'],

  /*
   * PWAの設定（ホーム画面に追加したとき、アプリっぽく起動できるようにする）
   */
  pwa: {
    /*
     * 新しいバージョンが公開されたら、自動的に更新する
     */
    registerType: 'autoUpdate',

    manifest: {
      name: 'こうちゃんの大冒険',

      short_name: 'こうちゃんの大冒険',

      description: 'こうちゃんと公園を探検するゲーム',

      /*
       * アプリの言葉（書かないと 'en' になる）
       */
      lang: 'ja',

      start_url: '/',

      /*
       * アプリとして開くURLの範囲（サイト全体）
       */
      scope: '/',

      display: 'standalone',

      background_color: '#ffffff',

      theme_color: '#ffffff',
    },
  },
});
