/* ============================================================
   総合スコアとランクの計算

   ゲーム本編にあった calculateFinalScore() と judgeResult() の
   「計算しているところ」だけを取り出してある
   （その2つ自体は、いま composables/useGameResult.ts にある）

   ■ ここがやること
     ・ゴールしたときの状態を受けとって、スコアと内訳を返す
     ・その点数と、今日あったことから、ランク・見出し・文章を返す

   ■ ここがやらないこと
     ゲームの状態は、いっさい書きかえない（受けとった数を見て、答えを返すだけ）
     音・画面の切りかえはさわらない
     S+の曲の解放は composables/useGameResult.ts と utils/sPlusSong.ts のほう
     （ここは「S+ランク」という答えを返すところまで）

   ■ 配点・境界値・判定の順番は、いっさい変えていない
     数字も文章も、移す前とまったく同じものを使っている
   ============================================================ */

import type { ScoreBreakdownItem } from '~/types/game';

/* スコアを出すために必要な、ゴールしたときの状態 */
export type ScoreInput = {
  /* 基本点になるおでかけポイント */
  outingPoint: number;

  /* こもれびの広場（秘密の場所）を探検したか */
  hasVisitedSecretSpot: boolean;

  /* 見つけたものの数 */
  collectedItemCount: number;

  /* 帰ってきた時間（分。09:00 なら 540） */
  currentMinutes: number;

  /* ゴールしたときのステータス */
  parentEnergy: number;
  childMood: number;
  childEnergy: number;
  parentCalm: number;

  /* いやいやが起きた回数 */
  tantrumCount: number;

  /* 0〜100に収める処理（pages/index.vue の keepInRange() をそのまま渡してもらう）
     同じ「0〜100」をここにも書いてしまうと、直すところが2か所になるため */
  keepInRange: (value: number) => number;
};

export type ScoreResult = {
  /* 0〜100に収めたあとの総合スコア */
  totalScore: number;

  /* 「何で何点もらったか」の1行ずつ（リザルト画面にそのまま並べる） */
  breakdown: ScoreBreakdownItem[];
};

/* 総合スコア（0〜100点）と、その内訳を作る

   ① 加点・減点を1項目ずつ計算して、内訳に足していく
   ② 内訳の点数を全部たす
   ③ 0〜100に収める
*/
export function calculateScore(input: ScoreInput): ScoreResult {
  const breakdown: ScoreBreakdownItem[] = [];

  // ② 基本点：おでかけポイントは、そのまま点数になる
  //   （0点でも「ここがスコアの土台」と分かるように、いつも表示する）
  breakdown.push({ label: 'おでかけポイント', points: input.outingPoint });

  // ③ 秘密の場所ボーナス：探検できていれば +10点
  if (input.hasVisitedSecretSpot) {
    breakdown.push({ label: '秘密の場所発見', points: 10 });
  }

  // ④ 見つけたものボーナス：1種類につき +2点
  const itemPoints = input.collectedItemCount * 2;

  if (itemPoints > 0) {
    breakdown.push({ label: '見つけたもの', points: itemPoints });
  }

  // ⑤ 帰宅時間ボーナス
  //   goToGoal() で出口まで10分歩いたあとの時間で判定される
  //   ・11:45まで      → +8点
  //   ・11:46〜12:00   → +4点
  //   ・12:00を過ぎた  → -10点
  //   ※ 11:45 にしているのは、6か所ぜんぶ回ると
  //     いやいや や とつぜんのできごと の時間で必ずはみ出してしまい、
  //     +8点が「ぜったいに取れないボーナス」になっていたため
  if (input.currentMinutes <= 11 * 60 + 45) {
    breakdown.push({ label: '余裕をもって帰宅', points: 8 });
  } else if (input.currentMinutes <= 12 * 60) {
    breakdown.push({ label: '時間内に帰宅', points: 4 });
  } else {
    breakdown.push({ label: '時間オーバー', points: -10 });
  }

  // ⑥ 親の体力ボーナス：50以上で+5点、30〜49で+3点、29以下は0点
  if (input.parentEnergy >= 50) {
    breakdown.push({ label: '親の体力', points: 5 });
  } else if (input.parentEnergy >= 30) {
    breakdown.push({ label: '親の体力', points: 3 });
  }

  // ⑦ こうちゃんの機嫌ボーナス：70以上で+5点、50〜69で+3点、49以下は0点
  if (input.childMood >= 70) {
    breakdown.push({ label: 'こうちゃんの機嫌', points: 5 });
  } else if (input.childMood >= 50) {
    breakdown.push({ label: 'こうちゃんの機嫌', points: 3 });
  }

  // ⑧ こうちゃんの体力ボーナス：30以上なら+3点
  if (input.childEnergy >= 30) {
    breakdown.push({ label: 'こうちゃんの体力', points: 3 });
  }

  // ⑨ 親の余裕ボーナス：親の余裕が70以上なら+3点
  //   「余裕を残したまま帰れた」ごほうび
  if (input.parentCalm >= 70) {
    breakdown.push({ label: '親の余裕', points: 3 });
  }

  // ⑩ いやいや減点：1回につき -2点
  if (input.tantrumCount > 0) {
    breakdown.push({ label: 'いやいや', points: input.tantrumCount * -2 });
  }

  // ⑪ 内訳の点数を全部たす
  let total = 0;

  for (const item of breakdown) {
    total += item.points;
  }

  // ⑫ 0〜100に収める（100を超えたら100、0未満なら0）
  //   ※ ここで丸めるので、内訳の単純合計と totalScore がずれることがある
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

  /* 目もり（pages/index.vue のものをそのまま渡してもらう） */
  fussMoodLine: number;
  totalPlaceCount: number;
  playedALotLine: number;
};

export type EndingResult = {
  /* 'S+ランク' などのランク名（S+の曲の解放は composables/useGameResult.ts が受けもつ） */
  rank: string;
  title: string;
  message: string;
};

/* 遊びつかれて、親かこうちゃんの体力が減っているかどうか（isWornOut() の理由のうち「体力」だけ）

   Cランクの「ちょっと遊びすぎた！」「今日はちょっと大変…」、
   Dランクの「遊びこんでへとへと…」「今日は大変だった……」（あまり遊べないうちに へとへと）は、
   これが true のときだけ出す
   isWornOut() は、機嫌・余裕・いやいや・お昼すぎ でも true になるので、
   それだけで決めると、少ししか遊んでいないのに「遊びすぎた」「へとへと」と出てしまう
   （そのときは「バタバタ」の文章にする。いやいやや、ヒヤッとしたことで疲れた日なので）
   （機嫌は55スタートで、ぐずりだすライン50のすぐ上。少し下がっただけで isWornOut() が true になる）
   体力は遊ぶたびにしっかり減るので、ここが下がっていれば「たくさん遊んで疲れた」と言える */
function isTiredFromPlaying(input: EndingInput) {
  return input.parentEnergy < 50 || input.childEnergy < 30;
}

/* 「つかれて帰ってきた」と言える状態かどうか

   スコアが低くなる理由は、大きく分けて2つある
   ① 遊びすぎて、こうちゃんも親もクタクタになった
   ② ほとんど遊ばずに、すぐ帰ってきた
   点数はどちらも同じくらい低くなるけれど、
   ①に「まだまだ元気だね」と言うのも、
   ②に「遊びすぎたね」と言うのもおかしいので、ここで見分けて文章を変える

   ※ 使っている数字は、calculateScore() のボーナスの基準とそろえている
     （＝「ボーナスをもらえなかった項目が1つでもあれば、疲れて帰ってきた」） */
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

/* ランク・見出し・文章を決める

   上から順番に見て、あてはまった時点で決まる
   ① いやいや3回以上 → 特殊エンド（通常ランクより優先）
   ② 総合スコアで S+ / S / A / B / C / D を決める

   ※ 同じランクでも、実際に何が起きたかで文章を変えている
     画面には「回った場所」「帰った時間」「機嫌」も出ているので、
     文章がそれとくいちがうと、遊んでいる人が混乱してしまうため
     ・Aランク … こうちゃんの機嫌が低いときは「楽しそう」と書かない
                  見出しに「最高」は使わない（上に S・S+ があるので、ランクより上に聞こえてしまう）
     ・Bランク … 時間オーバーか／まだ行っていない場所があるかで書きわける
                  時間オーバーの見出しに「ぎりぎり」は使わない（間に合ったように読めてしまう）
     ・C／Dランク … 「あまり遊べなかった」系の文は、遊んだ回数が少ないときだけ使う
                     （同じ場所でくりかえし遊んだ人に言うと話が合わない）
     ・C／Dランク … 「遊びすぎた」「どっと疲れた」「へとへと」は、体力が減っているときだけ使う（isTiredFromPlaying()）
                     （機嫌・余裕・いやいや・時間だけで疲れた判定になった人に言うと話が合わない）

   ※ GAME OVERのときは goToGoal() が先に return するので、この関数は呼ばれない
*/
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
