// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  app: {
    /* ページを行き来するとき（/ ⇄ /soundtrack）のフェード

       name … 使うCSSの名前。app.vue に書いてある .page-fade-〜 が使われる
       mode: 'out-in' … 前のページが消えきってから、次のページを出す
                        （2ページが重ならないので、画面がガタッと動かない） */
    pageTransition: { name: 'page-fade', mode: 'out-in' }
  }
})
