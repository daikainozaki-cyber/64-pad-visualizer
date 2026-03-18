// Landing page — Chinese (Simplified)
(function() {
  var existing = I18N.langs['zh'] || {};
  existing.landing = {
    meta_title: '64 Pad Explorer — 免费64键音乐理论工具',
    meta_description: '在64键网格上可视化音阶、和弦、配置和MIDI。免费、基于浏览器、无需账户。支持Ableton Push、Launchpad Pro等所有64键控制器。9种语言。',

    hero_badge: '免费',
    hero_headline: '在<span>打击垫</span>上看到音乐理论',
    hero_sub: '音阶、和弦、配置和MIDI — 在64键网格上可视化。只需浏览器。',
    hero_cta: '免费试用',
    trust_free: '免费',
    trust_no_account: '无需账户',
    trust_browser: '仅需浏览器',
    trust_languages: '9种语言',

    persona_title: '为你的音乐创作方式而设计',
    tab_beatmaker: '节拍制作人',
    tab_guitarist: '吉他手',
    tab_push_user: 'Push用户',

    persona_beatmaker_pain: '"我能打节奏，但不会在打击垫上弹和弦。"',
    persona_beatmaker_solution: '3步构建和弦。保存到记忆槽。实时回放。导出为MIDI文件到你的DAW。',
    persona_beatmaker_feat1: '记忆槽 — 即时保存和调用和弦',
    persona_beatmaker_feat2: '和弦识别 — 敲击打击垫即可看到和弦名称',
    persona_beatmaker_feat3: '41种和弦类型，支持延伸音、省略音、斜线和弦',
    persona_beatmaker_feat4: '演奏模式 — 用16个打击垫实时演奏和弦进行',

    persona_guitarist_pain: '"我的吉他和弦配置无法转换到打击垫上。"',
    persona_guitarist_solution: '在指板上输入和弦。自动映射到64键网格。通过Drop 2、Drop 3和Shell配置发现新的配置方式。',
    persona_guitarist_feat1: '吉他指板输入 — 点击琴弦输入和弦',
    persona_guitarist_feat2: 'Drop 2 / Drop 3 / Shell配置 — 吉他手熟悉的配置方式',
    persona_guitarist_feat3: '从指板输入自动识别和弦',
    persona_guitarist_feat4: 'Available Scale — 找到适合你和弦的音阶',

    persona_push_user_pain: '"Push只能在Ableton Live中使用。"',
    persona_push_user_solution: '通过MIDI连接Push，直接在64键网格上查看音阶、和弦和理论。适用于任何DAW。Push Universal Translator即将推出。',
    persona_push_user_feat1: 'MIDI输入/输出 — 连接任何64键控制器',
    persona_push_user_feat2: '支持Push串行MIDI输出',
    persona_push_user_feat3: '半音四度布局（与Push相同）',
    persona_push_user_feat4: 'Push 3风格的力度灵敏度控制',

    features_title: '功能亮点',
    card_theory_title: '理论引擎',
    card_theory_desc: '31种音阶 x 12个调。自然音阶和弦。Available Scale反向查找。转调分析的枢纽和弦。',
    card_voicing_title: '配置工具',
    card_voicing_desc: 'Drop 2 / Drop 3、Shell配置 (1-3-7, 1-7-3)、转位、Omit 5、Rootless。配置框提供多种指法选择。',
    card_sound_title: '音色与演奏',
    card_sound_desc: '内置管风琴和电钢琴（Rhodes采样器）。效果器。演奏模式实时播放和弦进行。无需外部音源。',
    card_midi_title: 'MIDI与集成',
    card_midi_desc: 'WebMIDI输入/输出。MIDI文件导出。Push 3八度同步。力度灵敏度控制。兼容任何MIDI打击垫控制器。',
    card_access_title: '无障碍与隐私',
    card_access_desc: 'Okabe-Ito色板（色觉无障碍）。所有数据保存在浏览器中（localStorage）。无追踪、无云端。',
    card_free_title: '完全免费',
    card_free_desc: '全部功能。无需账户。无试用期。无广告。无数据收集。打开浏览器即可开始探索。',

    demo_title: '功能演示',
    demo_scale_caption: '音阶模式 — C大调在64键网格上的显示',
    demo_chord_caption: '和弦模式 — Dm7的配置操作',
    demo_input_caption: '输入模式 — 实时和弦识别',
    demo_perform_caption: '演奏模式 — 实时演奏和弦进行',

    diff_title: '为什么选择64 Pad Explorer',
    diff_only_title: '唯一基于浏览器的64键理论工具',
    diff_only_desc: '没有其他工具能在浏览器中的64键网格上结合音乐理论可视化、和弦识别和音色。零直接竞争。',
    diff_rhodes_title: '免费Rhodes力度层',
    diff_rhodes_desc: '真实Rhodes Mark I采样，带力度层。唯一免费提供此功能的浏览器应用。',
    diff_push_title: 'Push Universal Translator（即将推出）',
    diff_push_desc: '世界首个MIDI Effect插件，将Push的串行协议转换为标准四度布局 — 适用于任何DAW，不仅限于Ableton Live。',

    cta_bottom_title: '准备好探索了吗？',
    cta_primary: '免费试用',
    cta_guide: '阅读指南',
    cta_desktop: '桌面版即将推出',

    footer_hps: 'HPS (Hardcore Pad Style)',
    footer_blog: '博客',
  };
  I18N.langs['zh'] = existing;
})();
