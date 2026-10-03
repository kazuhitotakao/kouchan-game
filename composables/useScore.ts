/* ============================================================
   総合スコアとランクの計算

   ゴールしたときの状態を受けとって、スコアと内訳・ランク・見出し・文章を返すだけ
   （ゲームの状態は書きかえない。S+の曲の解放は useGameResult.ts と utils/sPlusSong.ts）
   ============================================================ */

import type { ScoreBreakdownItem } from '~/types/game';

/* スコアを出すために必要な、ゴールしたときの状態 */
export type ScoreInput = {
  /* 基本点になるおでかけポイント */
  outingPoint: number;

  /* こもれびの広場（秘密の場所）を探検したか */
  hasVisitedSecretSpot: boolean;

  collectedItemCount: number;

  /* 帰ってきた時間（分。09:00 なら 540） */
  currentMinutes: number;

  /* ゴールしたときのステータス */
  parentEnergy: number;
  childMood: number;
  childEnergy: number;
  parentCalm: number;

  tantrumCount: number;

  /* 0〜100に収める処理（pages/index.vue のものを渡してもらう。ここにも書くと、直すところが2か所になるため） */
  keepInRange: (value: number) => number;
};

export type ScoreResult = {
  /* 0〜100に収めたあとの総合スコア */
  totalScore: number;

  /* 「何で何点もらったか」の1行ずつ（リザルト画面にそのまま並べる） */
  breakdown: ScoreBreakdownItem[];
};

/* 総合スコア（0〜100点）と、その内訳を作る（加点・減点を1項目ずつ内訳に足して、全部たして、0〜100に収める） */
export function calculateScore(input: ScoreInput): ScoreResult {
  const breakdown: ScoreBreakdownItem[] = [];

  // 基本点：おでかけポイントは、そのまま点数になる（0点でも「スコアの土台」と分かるように、いつも表示する）
  breakdown.push({ label: 'おでかけポイント', points: input.outingPoint });

  // 秘密の場所ボーナス
  if (input.hasVisitedSecretSpot) {
    breakdown.push({ label: '秘密の場所発見', points: 10 });
  }

  // 見つけたものボーナス：1種類につき +2点
  const itemPoints = input.collectedItemCount * 2;

  if (itemPoints > 0) {
    breakdown.push({ label: '見つけたもの', points: itemPoints });
  }

  /* 帰宅時間ボーナス（出口まで10分歩いたあとの時間で判定する）
     11:45まで +8 ／ 12:00まで +4 ／ 12:00を過ぎた -10
     ※ 11:45 にしているのは、6か所ぜんぶ回ると、いやいや や できごと の時間で必ずはみ出して、
       +8点が「ぜったいに取れないボーナス」になっていたため */
  if (input.currentMinutes <= 11 * 60 + 45) {
    breakdown.push({ label: '余裕をもって帰宅', points: 8 });
  } else if (input.currentMinutes <= 12 * 60) {
    breakdown.push({ label: '時間内に帰宅', points: 4 });
  } else {
    breakdown.push({ label: '時間オーバー', points: -10 });
  }

  // 親の体力ボーナス：50以上 +5 ／ 30〜49 +3
  if (input.parentEnergy >= 50) {
    breakdown.push({ label: '親の体力', points: 5 });
  } else if (input.parentEnergy >= 30) {
    breakdown.push({ label: '親の体力', points: 3 });
  }

  // こうちゃんの機嫌ボーナス：70以上 +5 ／ 50〜69 +3
  if (input.childMood >= 70) {
    breakdown.push({ label: 'こうちゃんの機嫌', points: 5 });
  } else if (input.childMood >= 50) {
    breakdown.push({ label: 'こうちゃんの機嫌', points: 3 });
  }

  // こうちゃんの体力ボーナス：30以上 +3
  if (input.childEnergy >= 30) {
    breakdown.push({ label: 'こうちゃんの体力', points: 3 });
  }

  // 親の余裕ボーナス：70以上 +3（「余裕を残したまま帰れた」ごほうび）
  if (input.parentCalm >= 70) {
    breakdown.push({ label: '親の余裕', points: 3 });
  }

  // いやいや減点：1回につき -2点
  if (input.tantrumCount > 0) {
    breakdown.push({ label: 'いやいや', points: input.tantrumCount * -2 });
  }

  let total = 0;

  for (const item of breakdown) {
    total += item.points;
  }

  // 0〜100に収める（ここで丸めるので、内訳の単純合計と totalScore がずれることがある）
  return { totalScore: input.keepInRange(total), breakdown };
}

/* ランク・見出し・文章を決めるために必要な、ゴールしたときの状態 */
export type EndingInput = {
  /* calculateScore() で出した総合スコア */
  totalScore: number;

  /* いやいやが起きた回数（3回以上は特殊エンド） */
  tantrumCount: number;

  /* ゴールしたときのステータスと時間 */
  childEnergy: number;
  childMood: number;
  parentEnergy: number;
  parentCalm: number;
  currentMinutes: number;

  /* 回った場所の数・遊んだ回数 */
  visitedPlaceCount: number;
  playCount: number;

  /* 目もり（data/game.ts のものを渡してもらう） */
  fussMoodLine: number;
  totalPlaceCount: number;
  playedALotLine: number;
};

export type EndingResult = {
  /* 'S+ランク' などのランク名 */
  rank: string;
  title: string;
  message: string;
};

/* 遊びつかれて、親かこうちゃんの体力が減っているか（isWornOut() の理由のうち「体力」だけ）

   C／Dランクの「遊びすぎた」「どっと疲れた」「へとへと」は、これが true のときだけ出す
   isWornOut() は機嫌・余裕・いやいや・お昼すぎ でも true になるので、それだけで決めると、
   少ししか遊んでいないのに「遊びすぎた」と出てしまうため（そのときは「バタバタ」の文章にする）
   （機嫌は55スタートなので、少し下がっただけで isWornOut() が true になる）
   体力は遊ぶたびにしっかり減るので、ここが下がっていれば「たくさん遊んで疲れた」と言える */
function isTiredFromPlaying(input: EndingInput) {
  return input.parentEnergy < 50 || input.childEnergy < 30;
}

/* 「つかれて帰ってきた」と言える状態か

   スコアが低くなるのは、①遊びすぎてクタクタ ②ほとんど遊ばずにすぐ帰った、のどちらか
   ①に「まだまだ元気だね」、②に「遊びすぎたね」と言うのはおかしいので、ここで見分けて文章を変える
   ※ 数字は calculateScore() のボーナスの基準とそろえている（ボーナスをもらえなかった項目が1つでもあれば、疲れて帰ってきた） */
function isWornOut(input: EndingInput) {
  if (isTiredFromPlaying(input)) {
    return true;
  }

  if (input.childMood < 50) {
    return true;
  }

  if (input.parentCalm < 70) {
    return true;
  }

  if (input.tantrumCount > 0) {
    return true;
  }

  if (input.currentMinutes > 12 * 60) {
    return true;
  }

  return false;
}

/* ランク・見出し・文章を決める（いやいや3回以上は特殊エンド。それ以外は総合スコアで S+ / S / A / B / C / D）

   同じランクでも、実際に何が起きたかで文章を変える（画面に出ている記録と、文章がくいちがわないように）
   ・Aランク … 機嫌が低いときは「楽しそう」と書かない。見出しに「最高」は使わない（上に S・S+ があるため）
   ・Bランク … 時間オーバーか／まだ行っていない場所があるかで書きわける
                時間オーバーの見出しに「ぎりぎり」は使わない（間に合ったように読めてしまう）
   ・C／Dランク … 「あまり遊べなかった」系は、遊んだ回数が少ないときだけ
                   「遊びすぎた」「へとへと」系は、体力が減っているときだけ（isTiredFromPlaying()） */
export function judgeEnding(input: EndingInput): EndingResult {
  if (input.tantrumCount >= 3) {
    return {
      rank: '特殊エンド',
      title: 'いやいや大爆発！',
      message: 'いやいやが' + input.tantrumCount + '回も！ だっこで帰る道も、わすれられない1日に。',
    };
  }

  if (input.totalScore >= 92) {
    return {
      rank: 'S+ランク',
      title: '伝説の公園大冒険！',
      message: 'こうちゃんも親も大満足！ わすれられない大冒険になりました！',
    };
  }

  if (input.totalScore >= 84) {
    return {
      rank: 'Sランク',
      title: '公園探検マスター！',
      message: 'たくさん探検して、楽しい思い出がいっぱい！',
    };
  }

  if (input.totalScore >= 70) {
    if (input.childMood < input.fussMoodLine) {
      return {
        rank: 'Aランク',
        title: 'いい探検、でもおつかれ気味',
        message: '最後はすこしぐずり気味。次は休みやおやつをはさんでみよう！',
      };
    }

    return {
      rank: 'Aランク',
      title: '楽しいおでかけ！',
      message: 'こうちゃんも楽しそう。いいおでかけになりました！',
    };
  }

  if (input.totalScore >= 55) {
    if (input.currentMinutes > 12 * 60) {
      return {
        rank: 'Bランク',
        title: '夢中でお昼すぎ！',
        message: '夢中になって、お昼をすぎちゃった。次は少し早めに帰ってみよう！',
      };
    }

    if (input.visitedPlaceCount < input.totalPlaceCount) {
      return {
        rank: 'Bランク',
        title: '楽しい公園探検！',
        message: '楽しく探検できました。次はちがう場所にも行ってみよう！',
      };
    }

    return {
      rank: 'Bランク',
      title: '公園ぜんぶ制覇！',
      message: 'ぜんぶ回って、時間内に帰れました！ 次は機嫌や見つけたものも気にしてみよう！',
    };
  }

  if (input.totalScore >= 38) {
    if (isWornOut(input)) {
      if (input.visitedPlaceCount >= 3 && isTiredFromPlaying(input)) {
        return {
          rank: 'Cランク',
          title: 'ちょっと遊びすぎた！',
          message: '疲れたけれど、それも思い出。次は余裕をもって探検しよう！',
        };
      }

      if (input.visitedPlaceCount >= 3) {
        return {
          rank: 'Cランク',
          title: 'ちょっとバタバタ探検！',
          message: 'いろいろ回れたけれど、バタバタした1日。次は機嫌や時間も見ながら回ろう！',
        };
      }

      if (input.playCount >= input.playedALotLine) {
        return {
          rank: 'Cランク',
          title: 'お気に入りでたっぷり！',
          message: 'お気に入りの場所でたっぷり！ 次はちがう場所にも行ってみよう！',
        };
      }

      if (isTiredFromPlaying(input)) {
        return {
          rank: 'Cランク',
          title: '今日はちょっと大変…',
          message: 'あまり探検できないうちに、どっと疲れちゃった。次は元気なうちに進もう！',
        };
      }

      return {
        rank: 'Cランク',
        title: 'ちょっとバタバタ公園さんぽ',
        message: 'あまり探検できないうちに、バタバタ。次は機嫌や余裕も見ながら進もう！',
      };
    }

    if (input.playCount >= input.playedALotLine) {
      return {
        rank: 'Cランク',
        title: 'のんびりマイペース！',
        message: '二人ともまだまだ元気！ 次は思いきり遊んで、ポイントもためてみよう！',
      };
    }

    return {
      rank: 'Cランク',
      title: 'あっさり公園さんぽ',
      message: '二人とも元気なまま帰ってきました。次はもっと探検してみよう！',
    };
  }

  if (isWornOut(input)) {
    if (input.visitedPlaceCount >= 3) {
      return {
        rank: 'Dランク',
        title: '今日は大変だった……',
        message: 'ちょっと大変な探検でした。次は休みながら遊んでみよう！',
      };
    }

    if (input.playCount >= input.playedALotLine) {
      if (isTiredFromPlaying(input)) {
        return {
          rank: 'Dランク',
          title: '遊びこんでへとへと…',
          message: 'お気に入りの場所で遊びこんで、へとへと。次はいろいろな場所へ行こう！',
        };
      }

      return {
        rank: 'Dランク',
        title: 'お気に入りでバタバタ…',
        message: 'お気に入りの場所で、ちょっとバタバタ。次はいろいろな場所へ行こう！',
      };
    }

    if (isTiredFromPlaying(input)) {
      return {
        rank: 'Dランク',
        title: '今日は大変だった……',
        message: 'あまり遊べないうちに、へとへと。次は元気なうちに探検しよう！',
      };
    }

    return {
      rank: 'Dランク',
      title: '今日はバタバタだった……',
      message: 'あまり遊べないうちに、バタバタ。次は機嫌や余裕も見ながら探検しよう！',
    };
  }

  if (input.playCount >= input.playedALotLine) {
    return {
      rank: 'Dランク',
      title: 'のんびり公園さんぽ',
      message: 'のんびり遊んで、まだまだ元気。次は思いきり遊んで、ポイントをためよう！',
    };
  }

  return {
    rank: 'Dランク',
    title: 'ちょっとだけ公園',
    message: '着いたばかりなのに、もう帰り道。次はもっと探検してみよう！',
  };
}

/* まとめて使うための入口（好きなほうの形で呼べるようにしてある） */
export function useScore() {
  return { calculateScore, judgeEnding };
}
