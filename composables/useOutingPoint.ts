/* ============================================================
   おでかけポイントの加算量の計算
   （もらえる分を返すだけ。足すのは pages/index.vue の addOutingPoint()）
   ============================================================ */

/* おでかけポイントを、今回いくつ足すか決める
   はじめての場所なら そのまま、2回目以降なら 半分（切り捨て、最低1点）

   ※ 公園は6か所しかないので、2回目が1点しかもらえないと「全部まわったら、あとは帰るだけ」になってしまう
     半分もらえるようにして、「もう1か所あそぶ？ それとも帰る？」と迷えるようにしている */
export function judgeOutingPoint(point: number, isVisited: boolean) {
  if (isVisited) {
    const halfPoint = Math.floor(point / 2);

    return halfPoint < 1 ? 1 : halfPoint;
  }

  return point;
}
