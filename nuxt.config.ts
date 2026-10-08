// https://nuxt.com/docs/api/configuration/nuxt-config

/*
 * ゲームの名前と説明（タブの名前・共有したときのカード・ホーム画面に追加したときの名前に使う）
 * ※ 画面の中に出す題名は data/game.ts の gameTitle（名前を変えるときは、両方そろえること）
 */
const gameName = 'こうちゃんの大冒険';
const gameDescription = 'こうちゃんと公園を探検するゲーム';

/*
 * 画面のいちばん上の色（本編・サウンドトラック・ミニゲームの背景のいちばん上と、app.vue の時計の欄の帯の色）
 * スマホのブラウザの上のほうの色（theme-color）と、ホーム画面のアプリの色（manifest の theme_color）を、これにそろえる
 */
const themeColor = '#d6f0fb';

/*
 * pages/ の中のページの URL（下の hooks で集めて、ビルドのときに HTML を作っておくページとして渡す）
 */
const pagePaths = new Set<string>();

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
       * ページの言葉（読み上げ・翻訳のすすめ・文字の形の選びかたに使われる。書かないと、言葉の決まっていないページになる）
       */
      htmlAttrs: {
        lang: 'ja',
      },

      /*
       * ブラウザのタブ・履歴・ブックマークに出る名前（書かないと、アドレスがそのまま出る）
       */
      title: gameName,

      /*
       * viewport-fit=cover … iPhone で、画面のはし（ノッチのまわり）まで描く
       *   ボタンや文字は、枠の内がわの env(safe-area-inset-〜) の余白でよけている
       */
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',

      meta: [
        /*
         * ページの説明（検索結果や、共有したときのカードに出る）
         */
        { name: 'description', content: gameDescription },

        /*
         * スマホのブラウザの上のほう（アドレスバー・時計の欄）の色
         */
        { name: 'theme-color', content: themeColor },

        /*
         * LINE・X などでアドレスを共有したときの、カードの中身（OGP）
         * ※ カードの絵（og:image）は、キービジュアルができたら足す
         */
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: gameName },
        { property: 'og:description', content: gameDescription },
        { property: 'og:locale', content: 'ja_JP' },
        { name: 'twitter:card', content: 'summary' },

        /*
         * 古い iPhone（iOS 16.3 まで）は manifest の display を読まないので、
         * ホーム画面から起動したときに standalone 表示にするための目印
         */
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },

        /*
         * iPhone で「ホーム画面に追加」したときの名前（書かないと <title> が使われる。どちらも同じ名前にしてある）
         */
        { name: 'apple-mobile-web-app-title', content: gameName },
      ],
    },
  },

  /*
   * どのページも、ビルドするときに HTML を作っておく（prerender）
   *
   * ・このゲームのページには、開くたびにサーバーで作る中身が無い（記録や設定は、ぜんぶブラウザの中で読む）
   * ・作っておかないと、開くたびに Vercel の米国東部のサーバーで HTML を作るので、日本から開くと待たされる
   *   作っておけば、画像と同じように、近くの（日本の）サーバーからそのまま返せる
   * ・作るページは pages/ の中から集める（ページを増やしても、ここは直さなくてよい）
   *   ※ routeRules の '/**': { prerender: true } でも書けるはずだが、いまの Nuxt（3.21）では
   *     どのページも対象にならなかった（Nuxt の不具合）ので、この形にしている
   */
  hooks: {
    /* pages/ のページの一覧ができたとき、URL を控えておく */
    'pages:resolved'(pages) {
      pagePaths.clear();

      for (const page of pages) {
        // [id] のような、URL の一部が変わるページは、前もって作れないのではぶく
        if (!page.path.includes(':')) {
          pagePaths.add(page.path);
        }
      }
    },

    /* ビルドのときに HTML を作っておくページへ、控えておいたページをぜんぶ足す */
    'prerender:routes'({ routes }) {
      for (const path of pagePaths) {
        routes.add(path);
      }
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
      name: gameName,

      short_name: gameName,

      description: gameDescription,

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

      /*
       * ホーム画面のアプリの色（Android の時計の欄や、アプリを切りかえる画面に出る。上の themeColor）
       */
      theme_color: themeColor,
    },
  },
});
