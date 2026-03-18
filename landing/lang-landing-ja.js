// Landing page — Japanese (blog extension tone)
(function() {
  var existing = I18N.langs['ja'] || {};
  existing.landing = {
    meta_title: '64 Pad Explorer — 64パッドでスケール・コード・ボイシングを可視化（無料）',
    meta_description: 'ブラウザだけで動く、唯一の64パッド音楽理論ツール。コード判定、ボイシング生成、Rhodes音源、MIDI書き出し。全機能無料、アカウント不要。Push、Launchpad Pro対応。',

    // Hero
    hero_badge: '全機能無料・アカウント不要',
    hero_headline: '<span>パッド</span>でコードを弾こう',
    hero_sub: 'リズムは叩ける。次はハーモニー。64パッドグリッド上でスケール・コード・ボイシングが見える。音も鳴る。MIDIも書き出せる。ブラウザだけで、全部できる。',
    hero_cta: 'アプリを開く（無料）',
    trust_free: '全機能無料',
    trust_no_account: 'アカウント不要',
    trust_browser: 'ブラウザだけで動く',
    trust_languages: '9言語対応',

    // Persona section
    persona_title: '何ができるのか',
    tab_beatmaker: 'ビートメイカー',
    tab_guitarist: 'ギタリスト',
    tab_push_user: 'Pushユーザー',

    // Beatmaker persona
    persona_beatmaker_pain: '「ビートは作れる。でもパッドでコードは弾けない。」',
    persona_beatmaker_solution: 'ルートを選んで、コードタイプを選んで、テンションを足す。これだけで64パッドグリッド上に「どこを押さえればいいか」が見える。気に入ったボイシングは256スロット（16バンク×16スロット）に保存。Performモードに切り替えれば16パッドでコード進行をリアルタイム演奏。そのままMIDIファイルとしてDAWに書き出せる。',
    persona_beatmaker_feat1: '今叩いた音、何のコード？ — パッドを自由に叩くだけでリアルタイム判定。複数候補を重み付きで表示。理論を知らなくてもコードがわかる',
    persona_beatmaker_feat2: 'キャプチャーモード：コードを弾いたら自動で次のスロットに保存。流れを止めずにプログレッションを組める',
    persona_beatmaker_feat3: 'その場で音が鳴る — Rhodesのベロシティレイヤー音源とオルガンプリセット内蔵。エフェクト付き。外部音源は要らない',
    persona_beatmaker_feat4: 'そのコードに何のスケールが使える？ — Available Scaleパネルが「どの音が合うか」を教えてくれる。弾きながら理論を覚えられる',

    // Guitarist persona
    persona_guitarist_pain: '「ギターのDrop 2やShell voicingは分かる。でもパッドでは何もできない。」',
    persona_guitarist_solution: 'フレットボードをクリックすると、そのコードが64パッドグリッドに自動マッピングされる。コード名も判定。逆に、コードを選べばDrop 2、Drop 3、Shell 1-3-7、Shell 1-7-3が一発で生成される。カーソルキーで転回形とポジションをめくるだけ — 全パターンをゼロコストで探索できる。4度配列だからギターと同じで、同じフォームがどのキーでも使える。',
    persona_guitarist_feat1: 'ギターでは転回形のポジションが広がって大変。パッドなら矢印キー1つで全転回形・全ポジションが見える',
    persona_guitarist_feat2: 'パッド、ギター、ベース、ピアノ、五線譜 — 5つの楽器で同時に表示。どれかを変えれば他も連動する',
    persona_guitarist_feat3: 'セオリーエンジンはii7とiii7の違いを知っている。同じm7でもハーモニック・ファンクションによってテンション候補が変わる',
    persona_guitarist_feat4: 'アヴォイドノートは薄く表示 — 消さない。モーダルインターチェンジやアウトプレイングは正当な選択だから。ツールは判断材料を出す、決めるのはプレイヤー',

    // Push User persona
    persona_push_user_pain: '「PushはAbleton Liveでしか使えない。20万円のMIDIコントローラーなのに。」',
    persona_push_user_solution: 'PushをMIDI接続すると、使い慣れた4度クロマチック配列のままで理論の可視化、コード判定、ボイシングツール、音源が全部使える。どのDAWでも、ブラウザが開いていれば動く。そして近日公開のPush Universal Translatorプラグインは、PushのシリアルプロトコルをDAW問わず標準4度出力に変換する — 世界初。',
    persona_push_user_feat1: 'Push 3のオクターブボタンがアプリと連動。画面と手元が常に一致',
    persona_push_user_feat2: 'ベロシティ感度を4パラメータ（Threshold, Drive, Compand, Range）で調整。リアルタイムでカーブが見える。Push以外のMIDIコントローラーでも使える',
    persona_push_user_feat3: 'Scaler、ChordCat、キーボードセッションからMIDIファイルをインポート → パッドでどう弾くか見える。理論→演奏も、演奏→理論も、双方向で行き来できる',
    persona_push_user_feat4: 'Push Universal Translator（近日公開）：Pushのシリアルプロトコルを標準4度に変換するMIDI Effectプラグイン。Logic、FL Studio、Bitwig — どのDAWでもPushが使える',

    // Feature cards
    features_title: '中身を見る',

    card_theory_title: 'あらゆるスケール、あらゆるコード、あらゆるポジション',
    card_theory_desc: '31スケール×12キー。ダイアトニックバーからコードを選ぶか、41種のコードタイプから手動で組み立てる。テンションツリーはハーモニック・ファンクションによって動的に変化 — 同じDm7でもiiの時とiiiの時で選択肢が違う。Available Scale逆引きで、そのコードに合うスケールを実用性順に表示。ピボットコード分析で転調先を探す。',

    card_voicing_title: '実践的なボイシングを探索できる',
    card_voicing_desc: 'Drop 2、Drop 3、Shell 1-3-7、Shell 1-7-3、Omit 5、Rootless、転回形 — ワンクリックで全部生成。カーソルキーで手の届く範囲を考慮したポジションを次々めくれる。教科書に載っているだけのボイシングではなく、実際の演奏で使われるボイシングが出てくる。',

    card_sound_title: 'ブラウザの中にRhodesがいる',
    card_sound_desc: '1977年製Rhodes Mark Iの実機サンプル、ベロシティレイヤー付き。強く叩けば音量だけでなく音色が変わる。調べた限り、ブラウザアプリでこれをやっているのはここだけ。VirtualPiano.euはGM音源でベロシティレイヤーなし。他のRhodes（V8、Keyzone Classic、DSK RhodeZ）はダウンロード＋DAWが必要。これはブラウザで無料。パッドがなくても、MIDIキーボードでRhodesを弾くためだけに開く価値がある。',

    card_midi_title: 'あらゆるコントローラーとつながる',
    card_midi_desc: 'WebMIDIであらゆるMIDIパッドコントローラーが使える。コード進行をMIDIファイルで書き出してDAWにドロップ。ベロシティカーブ、表示設定、メモリースロット — 全部ブラウザに保存。アカウントもクラウドもない。データは自分のもの。',

    card_access_title: 'どこからでも入れる',
    card_access_desc: 'パッドがなくても画面クリックで使える。MIDIキーボードでもいい。ギタリストならフレットボード入力。理論から入りたければスケールとコードを選ぶ。全部の入力が連携する — 理論でコードを選んでからMIDIでノートを足す、パッドで弾いてからAvailable Scaleで分析する。どの入口からでも、同じ場所にたどり着く。',

    card_free_title: 'これが全部、無料',
    card_free_desc: '機能制限の体験版ではない。フリーミアムの入口でもない。このページに書いてある全機能が、今すぐブラウザで、アカウントなし、支払いなし、広告なし、データ収集なしで使える。ショートカット全系統、256メモリースロット、MIDI入出力、9言語、オフライン対応。無料。',

    // Demo
    demo_title: '画面を見る',
    demo_scale_caption: 'C Majorスケール — ルート(オレンジ)、スケール音(ブルー)、特性音(イエロー)',
    demo_chord_caption: 'Dm7のDrop 2ボイシング — 複数のフィンガリングポジションを表示',
    demo_input_caption: 'パッドを自由に叩く → コード名をリアルタイム判定。複数候補を重み付きで表示',
    demo_perform_caption: 'メモリースロット → Performモード。16パッドでコード進行をライブ演奏',

    // Differentiators
    diff_title: 'なぜ他にないのか',
    diff_only_title: '競合ゼロ',
    diff_only_desc: '調べた。ブラウザでもデスクトップでもプラグインでも、64パッドグリッド上で音楽理論の可視化・リアルタイムコード判定・ボイシング生成・マルチ楽器表示・演奏可能な音源を統合したツールは他にない。近いものすらない。',
    diff_rhodes_title: 'ベロシティレイヤー付きRhodes、ブラウザで無料はここだけ',
    diff_rhodes_desc: 'VirtualPiano.euはGM音源 — ベロシティレイヤーなし。他のRhodes（V8、Keyzone Classic、DSK RhodeZ）はダウンロード＋DAWが必要。パッドを使わない人でも、MIDIキーボードでRhodesを鳴らすためだけに開く価値がある。',
    diff_push_title: 'Push Universal Translator — 世界初',
    diff_push_desc: 'Pushのシリアルプロトコルを標準クロマチック4度出力に変換するMIDI Effectプラグイン（開発中）。Logic Pro、FL Studio、Bitwig、Studio One — MIDI Effectプラグインを受け付けるDAWならどこでもPushが使える。誰もこれを作っていない。',
    diff_theory_title: 'プログラマーではなく、ミュージシャンが作った',
    diff_theory_desc: 'テンション階層、ボイシングロジック、Available Scaleのソート順 — 全部、プロのジャズ/ファンクギタリストが自分の演奏経験から設計した。ギターを教え、Abletonの記事を日本で一番書き、毎日このボイシングで演奏している人間のフィールドナレッジがソフトウェアになったもの。教科書から引っ張ってきた理論ではない。',

    // CTA bottom
    cta_bottom_title: '無料。ブラウザで動く。試すだけ。',
    cta_primary: '64 Pad Explorerを開く',
    cta_guide: '使い方ガイド',
    cta_desktop: 'デスクトップ版 近日公開',

    // Footer
    footer_hps: 'HPS (Hardcore Pad Style)',
    footer_blog: 'ブログ',
  };
  I18N.langs['ja'] = existing;
})();
