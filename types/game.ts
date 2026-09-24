/* ============================================================
   ゲームで使う型（type）をまとめた場所

   ここにあるのは「どんな形のデータか」という決めごとだけで、
   実際の値（ref・computed・関数）は pages/index.vue のほうに残してある

   型は、ゲームを動かすためのものではなく、
   書きまちがいをエディタが赤線で教えてくれるようにするためのもの
   （'gummy' を 'gumi' と書いた、機嫌の数字を入れ忘れた、など）

   ■ 使うときは、こう読みこむ
     import type { GameEvent, SnackId } from '~/types/game';

     import のあとに type と書いてあるのは、
     「これは型だけで、ゲームの中身は何も持ってこない」という印
     ビルドすると、この行はまるごと消える（アプリの重さは増えない）
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

   ここから下は「とつぜんのできごと」の画面
   通常行動のあとに20%で起こる、専用画面つきの出来事
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

   CommandBox.vue と ResultCard.vue の variant で、同じものを見ている
*/
export type SceneVariant = 'place' | 'rest' | 'tantrum' | 'suddenEvent';

/* ランダムイベントで動いたステータス1つぶんの型
   label     … 「おでかけポイント」などの項目名
   text      … 「+5」「-8」の形にした増減
   className … 増減の色（changeClass() が返すクラス名）
*/
export type RandomEventEffect = {
  label: string;
  text: string;
  className: string;
};

/* おやつの名札（どのおやつかを表す文字）

   'gummy' のように決めた文字しか入れられないようにしておくと、
   'gumi' や 'グミ' のような書きまちがいを、
   ブラウザで動かす前にエディタが赤線で教えてくれる */
export type SnackId = 'gummy' | 'chocolate' | 'senbei' | 'biscuit' | 'banana' | 'jelly';

/* おやつ1種類ぶんの中身

   id          … 名札（上の SnackId）
   name        … 画面に出す名前（「グミ」）
   icon        … 画面に出す絵文字（「🍇」）
   energy      … 食べたときに回復する、こうちゃんの体力
   mood        … 食べたときに回復する、こうちゃんの機嫌
   minutes     … 食べるのにかかる時間（分）
   description … どんなおやつかの説明文

   ※ energy / mood / minutes は、ゲーム中におやつを食べたときの
     「こうちゃんの体力・機嫌がどれだけ回復するか」「何分かかるか」としてそのまま使う
     （休憩中の giveSnackWhileExploring() と、いやいやタイムの giveSnack()）

     「グミなら機嫌 +20」のような数字は、data/snacks.ts の snacks の中にしか書かない
     回復量を変えたくなったら、あそこ1か所を書きかえるだけで
     おやつ選択画面の表示も、ゲーム中の効果も、いっしょに変わる */
export type Snack = {
  id: SnackId;
  name: string;
  icon: string;
  energy: number;
  mood: number;
  minutes: number;
  description: string;
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
   scene … こうちゃんの様子
           ぐずぐず（1）は、理由ごとの様子（TantrumReasonInfo の scene）を出すので null
           大泣き（2）・大いやいや（3）は、泣きかたの激しさそのものを見せたいので理由に関係なく同じ文
           （理由の手がかりは、レベルごとのセリフ voices のほうに残してある） */
export type TantrumLevelInfo = {
  icon: string;
  title: string;
  scene: string | null;
};

/* 理由ごとに、画面や結果の文章に出すことば

   voices         … いやいやタイムのカードに出す、こうちゃんのセリフ（レベルごとに3つ）
                    はげしくなるほど、のばす音と「！」が増える
                    どのレベルでも、理由の手がかりはこのセリフに残る
   scene          … ぐずぐず（レベル1）のときの、こうちゃんの様子
                    （大泣き・大いやいやの様子は TantrumLevelInfo のほう）
   complaint      … 対応がずれていたときの結果の文章に出す、短いさけび
                    （相性のわるいおやつをあげたとき／待つに失敗したとき）
   greatSnackText … ぴったりのおやつ（相性 great）をあげたときに足す文 */
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

   ※ great が大いやいやでも効くのは、「理由にぴったりのおやつ」はそれだけ強い、というルールのため
     normal は「おやつはうれしいけれど、泣いている理由には合っていない」ので、
     はげしく泣いているときは、ひとまず少し落ち着くところまでしか効かない

   ※ おやつ選択画面にもおやつバッグにも、この相性は出さない
     こうちゃんの様子とおやつの説明から、プレイヤーに考えてもらう */
export type TantrumSnackFit = 'great' | 'normal' | 'weak';

/* いやいや中に選べる対応

   'hug' だっこ／'talk' お話／'wait' 待つ／'snack:gummy' などのおやつ
   おやつは種類ごとに別の対応としてあつかう
   （グミが合わなかったあとに、せんべいへ変えるのは「くり返し」ではない） */
export type TantrumAction = 'hug' | 'talk' | 'wait' | `snack:${SnackId}`;

/* 今回の行動で、どのステータスがどれだけ変わったかをまとめた型
   すべて「増えた分・減った分」の数で、-15 なら15減った という意味
   minutes は かかった時間（分）
*/
export type StatusChanges = {
  childEnergy: number;
  childMood: number;
  outingPoint: number;
  parentEnergy: number;
  parentCalm: number;
  minutes: number;
};

/* 「今回の変化（合計）」の1グループぶん（こうちゃん／親／おでかけ）
   中身は pages/index.vue の changeGroups がつくり、ResultCard.vue がそのまま並べる
   ・name       … 「こうちゃん」などの見出し
   ・groupClass … 枠の色を変えるためのCSSクラス名
   ・rows       … その人のステータスの行（項目名・前・後・増減・増減の色）
*/
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

/* スコア内訳の1行ぶんの型
   label  … 「おでかけポイント」などの項目名
   points … その項目でもらった点数（マイナスもある）
*/
export type ScoreBreakdownItem = {
  label: string;
  points: number;
};

/* アイテムが見つかる場所
   場所で遊ぶ6か所だけ（公園入口・いやいや・とつぜんのできごとなどでは見つからないので、GameEvent 全部にはしない）
*/
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
   branch   … 枝 🌿（よけるもの）
   sunlight … 木漏れ日 ✨（集めるもの） */
export type SecretPathItemKind = 'branch' | 'sunlight';

/* 流れてくるもの1つぶん

   id   … v-for の key にするための番号
   kind … 枝か木漏れ日か
   lane … どのレーンを流れてくるか
   y    … フィールドの上から何%の位置にいるか（0 = いちばん上、100 = いちばん下）
   hit  … もう当たった（枝）／取った（木漏れ日）か
          1つにつき1回だけ数えるための印 */
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
