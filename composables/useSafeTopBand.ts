export type SafeTopBandTone = 'sky' | 'navy';

/*
 * iPhone・iPad のホーム画面アプリで、時計の欄をぬる帯の色。
 *
 * app.vue にある帯はページの外にあるため、ゲーム本編の状態を useState で共有する。
 * 画面のDOMを見て色を決めると、フェード中に古い画面が残っているあいだ切り替わらないので、
 * ゲーム開始・終了の状態と同時に色を変える。
 */
export function useSafeTopBand() {
  return useState<SafeTopBandTone>('safe-top-band-tone', () => 'sky');
}
