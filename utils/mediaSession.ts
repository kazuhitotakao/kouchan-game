/* ============================================================
   車のステアリング・ロック画面・イヤホンなどの操作を受け取り、曲名を知らせる（Media Session API）

   サウンドトラック（pages/soundtrack.vue）で使う
   ・受け取った操作（再生・一時停止・停止・前の曲・次の曲）は、ページの関数へ渡すだけ（曲を鳴らすのはページの仕事）
   ・いまの曲の名前と、鳴っているか・止まっているかを知らせる（出すかどうか・出しかたは、端末や車しだい）
   ・「10秒送り・戻し」は受け取らない
     iPhone は「前の曲・次の曲」とどちらか一方のボタンしか出さず、受け取ると前の曲・次の曲のボタンが出なくなるため
   ・Media Session API が無いブラウザでは、何もしない
   ============================================================ */

export type MediaSessionHandlers = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  previousTrack: () => void;
  nextTrack: () => void;
};

/* ロック画面・車の画面に出す曲の画像（どの曲もアプリのアイコン。public/icons/app-icon.png から作る → pwa-assets.config.ts） */
const trackArtwork: MediaImage[] = [{ src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' }];

/* 知らせる曲の情報（artist・album は、その欄に出す文字） */
export type MediaSessionTrack = {
  title: string;
  artist: string;
  album: string;
};

/* Media Session を返す（使えないブラウザ・サーバー側では null） */
function getMediaSession() {
  if (!import.meta.client || !('mediaSession' in navigator)) {
    return null;
  }

  return navigator.mediaSession;
}

/* いま操作を受け取っているページの目印（どのページも受け取っていないときは null）

   ページを移るときは、次のページの onMounted が、前のページの onUnmounted より先に呼ばれる
   前のページの後始末で受付をやめると、次のページが始めた受付まで消してしまう
   （パソコン・Android で A画面 → サウンドトラック と進むと、サウンドトラックの「次の曲」などの受付が消えていた）
   そこで、あとから受付を始めたページを「持ち主」として覚え、受付をやめるのは、まだ自分が持ち主のときだけにする */
let handlersOwner: symbol | null = null;

/* 操作の受付を始める

   返す関数を呼ぶと、受付をやめて、知らせていた曲名なども消す（ページを離れるときの後始末用）
   ページを移っても同じ画面のままなので、やめておかないと、ゲーム本編でも車の「次の曲」がサウンドトラックの関数を呼んでしまう
   ※ 次のページがもう受付を始めていたら、何もしない（→ handlersOwner） */
export function startMediaSession(handlers: MediaSessionHandlers) {
  const mediaSession = getMediaSession();

  if (!mediaSession) {
    return () => {};
  }

  const owner = Symbol('mediaSession');

  handlersOwner = owner;

  const actions: [MediaSessionAction, () => void][] = [
    ['play', handlers.play],
    ['pause', handlers.pause],
    ['stop', handlers.stop],
    ['previoustrack', handlers.previousTrack],
    ['nexttrack', handlers.nextTrack],
  ];

  for (const [action, handler] of actions) {
    try {
      mediaSession.setActionHandler(action, () => handler());
    } catch {
      // その操作に対応していないブラウザでは、ほかの操作だけ受け取る
    }
  }

  return () => {
    if (handlersOwner !== owner) {
      return;
    }

    handlersOwner = null;

    for (const [action] of actions) {
      try {
        mediaSession.setActionHandler(action, null);
      } catch {
        // 何もしない
      }
    }

    try {
      mediaSession.metadata = null;
      mediaSession.playbackState = 'none';
    } catch {
      // 何もしない
    }
  };
}

/* いまの曲の名前などを知らせる（null なら、知らせていたものを消す） */
export function setMediaSessionTrack(track: MediaSessionTrack | null) {
  const mediaSession = getMediaSession();

  if (!mediaSession) {
    return;
  }

  try {
    mediaSession.metadata = track && typeof MediaMetadata !== 'undefined' ? new MediaMetadata({ ...track, artwork: trackArtwork }) : null;
  } catch {
    // 知らせられなくても、曲はふつうに鳴る
  }
}

/* いま鳴っているか・止まっているかを知らせる
   playing … 鳴っている ／ paused … 曲を選んだまま止まっている ／ none … 曲を選んでいない */
export function setMediaSessionPlaybackState(state: MediaSessionPlaybackState) {
  const mediaSession = getMediaSession();

  if (!mediaSession) {
    return;
  }

  try {
    mediaSession.playbackState = state;
  } catch {
    // 何もしない
  }
}
