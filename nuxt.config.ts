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
       * アプリを起動したときに最初に開くURL
       */
      start_url: '/',

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
