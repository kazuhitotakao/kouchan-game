/* ============================================================
   ゲームで使う型（type）をまとめた場所

   「どんな形のデータか」という決めごとだけ（書きまちがいをエディタが教えてくれるように）
   import type { GameEvent } from '~/types/game'; のように読みこむ（ビルドすると消えるので、重さは増えない）
   ============================================================ */

/* 今いる場所を管理する型
   parkEntrance = 公園入口
   slide        = すべり台
   sandbox      = 砂場
   acornArea    = どんぐりの木
   pond         = 池
   grassArea    = 芝生広場
   secretSpot   = こもれびの広場
   secretPath   = 秘密の小道（こもれびの広場へ続くミニゲーム。そのプレイではじめて広場へ行くときだけ通る）
   restArea     = ひとやすみ（公園入口から入る、休憩・おやつを選ぶベンチ。遊ぶ場所ではない）
   tantrum      = いやいや中（なだめる場面）
   goal         = ゴール（公園の出口）
   gameOver     = ゲームオーバー（限界をむかえて途中で終わった）

   ここから下は「とつぜんのできごと」（通常行動のあとに ときどき起こる、専用画面つきの出来事）
   emergencySiren = 救急車のサイレンが聞こえる
   ladybug        = テントウムシを見つける
   dog            = 犬が近づいてくる
   fallDown       = こうちゃんがころぶ
   fountain       = 噴水が突然出る
*/
export type GameEvent =
  | 'parkEntrance'
  | 'slide'
  | 'sandbox'
  | 'acornArea'
  | 'pond'
  | 'grassArea'
  | 'secretSpot'
  | 'secretPath'
  | 'restArea'
  | 'tantrum'
  | 'goal'
  | 'gameOver'
  | 'emergencySiren'
  | 'ladybug'
  | 'dog'
  | 'fallDown'
  | 'fountain';

/* 結果カード・コマンド欄が、どの場面のものか
   place       … 通常の場所6か所（すべり台・砂場など）
   rest        … ひとやすみ（休憩する・おやつをあげる。CommandBox.vue だけで使う）
   tantrum     … いやいやタイム
   suddenEvent … とつぜんのできごと（救急車・テントウムシなど）
   （CommandBox.vue と ResultCard.vue の variant）
*/
export type SceneVariant = 'place' | 'rest' | 'tantrum' | 'suddenEvent';

/* おやつの名札（決めた文字しか入れられないので、'gumi' のような書きまちがいをエディタが教えてくれる） */
export type SnackId = 'gummy' | 'chocolate' | 'senbei' | 'biscuit' | 'banana' | 'jelly';

/* おやつ1種類ぶんの中身

   id          … 名札（上の SnackId）
   name        … 画面に出す名前（「グミ」）
   icon        … 文字の中にならべる絵文字（「🍇」）
   image       … おやつの絵（/images/snacks/〜）
   energy / mood … 食べたときに回復する、こうちゃんの体力・機嫌
   minutes     … 食べるのにかかる時間（分）

   ※ 数字は data/snacks.ts にしか書かない（あそこを変えれば、表示もゲーム中の効果もいっしょに変わる） */
export type Snack = {
  id: SnackId;
  name: string;
  icon: string;
  image: string;
  energy: number;
  mood: number;
  minutes: number;
};

/* どの場面からおやつバッグを開いたか
   exploring … 公園入口の「ひとやすみ」（ベンチ）→「おやつにする」
   tantrum   … いやいやタイムの「おやつをあげる」
*/
export type SnackUseContext = 'exploring' | 'tantrum';

/* いやいやの理由
   tired        … つかれた
   hungry       … おなかすいた
   frustrated   … うまくできなくて悔しい
   wantMorePlay … まだ遊びたい */
export type TantrumReason = 'tired' | 'hungry' | 'frustrated' | 'wantMorePlay';

/* いやいやの激しさ（いやいやレベル）
     1 … ぐずぐず   （はじまったばかり）
     2 … 大泣き     （対応がずれて、泣き声が大きくなった）
     3 … 大いやいや （地面にごろん。いちばん激しい） */
export type TantrumLevel = 1 | 2 | 3;

/* レベルごとの見出しと様子

   icon  … 見出しの前に出す顔
   title … いやいやタイムのカードの見出し
   scene … こうちゃんの様子（ぐずぐずは理由ごとの様子を出すので null。
           大泣き以上は激しさを見せたいので理由に関係なく同じ文。理由の手がかりはセリフに残る） */
export type TantrumLevelInfo = {
  icon: string;
  title: string;
  scene: string | null;
};

/* 理由ごとに、画面や結果の文章に出すことば

   voices         … こうちゃんのセリフ（レベルごと。どのレベルでも、理由の手がかりはここに残る）
   scene          … ぐずぐず（レベル1）のときの、こうちゃんの様子
   complaint      … 対応がずれていたときの結果の文章に出す、短いさけび
   greatSnackText … ぴったりのおやつをあげたときに足す文 */
export type TantrumReasonInfo = {
  voices: Record<TantrumLevel, string>;
  scene: string;
  complaint: string;
  greatSnackText: string;
};

/* おやつと いやいやの理由の相性

   great  … ぴったり     → どのレベルでも いやいや終了 ＋ ナイス対応
   normal … ふつうに効く → ぐずぐずなら終了、大泣き以上なら1段落ち着くだけ（いやいやは続く）
   weak   … ずれている   → 食べてはくれるが、いやいやは悪化する

   ※ 相性は画面には出さない（こうちゃんの様子とおやつの説明から、プレイヤーに考えてもらう） */
export type TantrumSnackFit = 'great' | 'normal' | 'weak';

/* いやいや中に選べる対応（だっこ／お話／待つ／おやつ）
   おやつは種類ごとに別の対応（グミのあとに せんべいへ変えるのは「くり返し」ではない） */
export type TantrumAction = 'hug' | 'talk' | 'wait' | `snack:${SnackId}`;

/* 今回の行動で、どのステータスがどれだけ変わったか（-15 なら15減った。minutes は かかった時間） */
export type StatusChanges = {
  childEnergy: number;
  childMood: number;
  outingPoint: number;
  parentEnergy: number;
  parentCalm: number;
  minutes: number;
};

/* 「今回の変化（合計）」の1グループぶん（こうちゃん／親／おでかけ。ResultCard.vue がそのまま並べる） */
export type ChangeGroup = {
  name: string;
  groupClass: string;
  rows: {
    label: string;
    before: string;
    after: string;
    changeText: string;
    className: string;
  }[];
};

/* スコア内訳の1行ぶん（points はマイナスもある） */
export type ScoreBreakdownItem = {
  label: string;
  points: number;
};

/* アイテムが見つかる場所（遊ぶ6か所だけ） */
export type ItemPlace = 'slide' | 'sandbox' | 'acornArea' | 'pond' | 'grassArea' | 'secretSpot';

/* レーンの番号
   0 = 左、1 = まん中、2 = 右 */
export type SecretPathLane = 0 | 1 | 2;

/* ミニゲームの進み具合
   ready    … はじまる前
   playing  … 遊んでいる最中
   finished … 小道をぬけた */
export type SecretPathPhase = 'ready' | 'playing' | 'finished';

/* 上から流れてくるものの種類
   branch   … 枝（よけるもの）
   sunlight … こもれび（集めるもの） */
export type SecretPathItemKind = 'branch' | 'sunlight';

/* 流れてくるもの1つぶん
   y   … フィールドの上から何%の位置にいるか
   hit … もう当たった／取ったか（1つにつき1回だけ数えるための印） */
export type SecretPathItem = {
  id: number;
  kind: SecretPathItemKind;
  lane: SecretPathLane;
  y: number;
  hit: boolean;
};

/* 「始まってから何ミリ秒たったら、どのレーンに何を出すか」の予定1つぶん */
export type SecretPathSpawn = {
  at: number;
  kind: SecretPathItemKind;
  lane: SecretPathLane;
};

/* 秘密の小道の遊びかた
   story   … ゲーム本編の小道（15秒でぬける。こもれびの数でボーナス）
   endless … ミニゲーム（/minigame/secret-path）の「どこまで行ける？」
             （枝に3回当たるまで続き、進むほど速くなる） */
export type SecretPathMode = 'story' | 'endless';

/* 本編1回ぶんの終わりかた
   goal     … ゴールした（総合スコアとランクが出る）
   gameOver … 途中で GAME OVER になった（総合スコアは出さない） */
export type GameRecordResult = 'goal' | 'gameOver';

/* 本編1回ぶんの記録（ハイスコアと直近の記録に使う。保存のしくみは utils/gameRecords.ts）

   playedAt   … 遊びおわった日時（Date.now() のミリ秒）
   score      … 総合スコア（GAME OVER は null）
   rank       … 'Sランク'・'特殊エンド' など（GAME OVER は null）
   title      … ランクの見出し ／ GAME OVER の理由の見出し
   returnTime … 帰った時間（'11:40'。GAME OVER は、終わった時間）
   ほかは、終わったときのステータスと進みぐあい（リザルト画面の「今日の記録」と同じもの） */
export type GameRecord = {
  playedAt: number;
  result: GameRecordResult;
  score: number | null;
  rank: string | null;
  title: string;
  returnTime: string;
  childEnergy: number;
  childMood: number;
  parentEnergy: number;
  parentCalm: number;
  outingPoint: number;
  tantrumCount: number;
  visitedPlaceCount: number;
  playCount: number;
  collectedItemCount: number;
};
