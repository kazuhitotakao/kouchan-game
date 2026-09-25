// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: {
    enabled: true,
  },

  app: {
    /*
     * ページを行き来するとき（/ ⇄ /soundtrack）のフェード
     *
     * name … 使うCSSの名前
     *         app.vue に書いてある .page-fade-〜 が使われる
     *
     * mode: 'out-in'
     *   … 前のページが消えきってから、次のページを出す
     *      （2ページが重ならないので、画面がガタッと動かない）
     */
    pageTransition: {
      name: 'page-fade',
      mode: 'out-in',
    },

    head: {
      /*
       * viewport-fit=cover … iPhone で、画面のはし（ノッチ・ホームインジケーターのまわり）まで描く
       *   そのうえで、ゲームの枠の内がわに env(safe-area-inset-〜) ぶんの余白をとって、
       *   ボタンや文字がそこへ入らないようにしている（→ assets/css/game/base.css の .game）
       *   前半の2つは、Nuxt がもともと入れている値と同じ
       */
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',

      meta: [
        /*
         * 古い iPhone（iOS 16.3 まで）は manifest の display を読まないので、
         * ホーム画面から起動したときに standalone 表示にするための目印
         * （新しい iPhone・Android は manifest の display: 'standalone' を使う）
         */
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },

        /*
         * iPhone で「ホーム画面に追加」したときの、アイコンの下の名前
         * （このサイトには <title> が無いので、書いておかないと名前がサイトのアドレスになってしまう）
         */
        { name: 'apple-mobile-web-app-title', content: 'こうちゃんの大冒険' },
      ],
    },
  },

  /*
   * NuxtでPWAを使うためのモジュール
   */
  modules: ['@vite-pwa/nuxt'],

  /*
   * PWAの設定
   *
   * ホーム画面に追加したとき、
   * 普通のWebサイトではなくアプリっぽく起動できるようにする
   */
  pwa: {
    /*
     * 新しいバージョンが公開されたら、
     * PWA側も自動的に更新する
     */
    registerType: 'autoUpdate',

    /*
     * スマホにインストールしたときの
     * アプリ名・アイコン・表示方法など
     */
    manifest: {
      name: 'こうちゃんの大冒険',

      /*
       * ホーム画面など、表示スペースが狭い場所で使われる名前
       */
      short_name: 'こうちゃんの大冒険',

      description: 'こうちゃんと公園を探検するゲーム',

      /*
       * アプリの言葉（書かないと 'en' になる）
       */
      lang: 'ja',

      /*
       * アプリを起動したときに最初に開くURL
       */
      start_url: '/',

      /*
       * アプリとして開くURLの範囲（サイト全体。/soundtrack もアプリの中で開く）
       */
      scope: '/',

      /*
       * ブラウザのアドレスバーなどを表示せず、
       * アプリのように表示する
       */
      display: 'standalone',

      background_color: '#ffffff',

      theme_color: '#ffffff',
    },
  },
});
