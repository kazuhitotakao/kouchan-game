/* ============================================================
   車のステアリング・ロック画面・イヤホンなどの操作を受け取り、曲名を知らせる（Media Session API）

   サウンドトラック（pages/soundtrack.vue）で使う

   ■ ここがやること
     ・「再生」「一時停止」「停止」「前の曲」「次の曲」の操作を受け取って、ページの関数へ渡す
       車のステアリングの ⏮ ⏭、ロック画面・コントロールセンターのボタン、イヤホンのボタンなど
       （車 → Bluetooth → スマホ → ブラウザ → ここ、の順で届く）
     ・いま鳴っている曲の名前などを知らせる
       ロック画面・コントロールセンター・車の画面に出る（出すかどうか・出しかたは、端末や車しだい）
     ・いま鳴っているか・止まっているかを知らせる

   ■ ここがやらないこと
     ・曲を鳴らす・止める・切りかえる、そのもの
       それはページの関数（playNextTrack() など）の仕事で、ここは受け取った操作をそのまま渡すだけ

   ■ 「10秒送り・10秒戻し」（seekforward / seekbackward）は受け取らない
     iPhone は「前の曲・次の曲」と「10秒送り・戻し」のどちらか一方のボタンしか出さず、
     10秒送り・戻しを受け取ると、前の曲・次の曲のボタンが出なくなってしまうため

   ■ Media Session API が無いブラウザでは、何もしない（ページは今までどおり使える）
   ============================================================ */

/* 受け取った操作を渡す先（ページの関数） */
export type MediaSessionHandlers = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  previousTrack: () => void;
  nextTrack: () => void;
};

/* 知らせる曲の情報
   title  … 曲名
   artist … アーティスト名の欄に出す文字
   album  … アルバム名の欄に出す文字 */
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

/* 操作の受付を始める

   返す関数を呼ぶと、受付をやめて、知らせていた曲名なども消す（ページを離れるときの後始末用）
   このサイトはページを移っても同じ画面のまま中身だけ入れかわるので、
   やめておかないと、ほかのページ（ゲーム本編など）でも、車の「次の曲」がサウンドトラックの関数を呼んでしまう */
export function startMediaSession(handlers: MediaSessionHandlers) {
  const mediaSession = getMediaSession();

  if (!mediaSession) {
    return () => {};
  }

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

/* いまの曲の名前などを知らせる（曲を選んでいないときは null で、知らせていたものを消す） */
export function setMediaSessionTrack(track: MediaSessionTrack | null) {
  const mediaSession = getMediaSession();

  if (!mediaSession) {
    return;
  }

  try {
    mediaSession.metadata = track && typeof MediaMetadata !== 'undefined' ? new MediaMetadata(track) : null;
  } catch {
    // 知らせられなくても、曲はふつうに鳴る
  }
}

/* いま鳴っているか・止まっているかを知らせる
   ・playing … 鳴っている
   ・paused  … 曲を選んだまま止まっている（一時停止中）
   ・none    … 曲を選んでいない */
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
