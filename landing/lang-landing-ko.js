// Landing page — Korean
(function() {
  var existing = I18N.langs['ko'] || {};
  existing.landing = {
    meta_title: '64 Pad Explorer — 64패드 컨트롤러용 무료 음악 이론 도구',
    meta_description: '64패드 그리드에서 스케일, 코드, 보이싱, MIDI를 시각화. 무료, 브라우저 기반, 계정 불필요. Ableton Push, Launchpad Pro 및 모든 64패드 컨트롤러 지원. 9개 언어.',

    hero_badge: '무료',
    hero_headline: '<span>패드</span>에서 음악 이론을 보세요',
    hero_sub: '스케일, 코드, 보이싱, MIDI — 64패드 그리드에서 시각화. 브라우저만 있으면 됩니다.',
    hero_cta: '무료로 시작',
    trust_free: '무료',
    trust_no_account: '계정 불필요',
    trust_browser: '브라우저만',
    trust_languages: '9개 언어',

    persona_title: '당신의 음악 제작 방식에 맞게',
    tab_beatmaker: '비트메이커',
    tab_guitarist: '기타리스트',
    tab_push_user: 'Push 사용자',

    persona_beatmaker_pain: '"리듬은 칠 수 있지만 패드로 코드는 못 쳐요."',
    persona_beatmaker_solution: '3단계로 코드를 만드세요. 메모리 슬롯에 저장하고 실시간으로 연주. DAW에 MIDI로 내보내기.',
    persona_beatmaker_feat1: '메모리 슬롯 — 코드를 즉시 저장하고 불러오기',
    persona_beatmaker_feat2: '코드 감지 — 패드를 치면 어떤 코드인지 표시',
    persona_beatmaker_feat3: '41가지 코드 타입, 텐션, 오밋, 슬래시 코드 지원',
    persona_beatmaker_feat4: '퍼폼 모드 — 16패드로 코드 진행을 라이브 연주',

    persona_guitarist_pain: '"기타 보이싱이 패드로 변환이 안 돼요."',
    persona_guitarist_solution: '프렛보드에서 코드를 입력하면 64패드 그리드에 자동 매핑. Drop 2, Drop 3, Shell 보이싱으로 새로운 보이싱을 발견하세요.',
    persona_guitarist_feat1: '기타 프렛보드 입력 — 줄을 클릭해서 코드 입력',
    persona_guitarist_feat2: 'Drop 2 / Drop 3 / Shell 보이싱 — 기타리스트에게 익숙한 보이싱',
    persona_guitarist_feat3: '프렛보드 입력에서 자동 코드 감지',
    persona_guitarist_feat4: 'Available Scale — 코드에 맞는 스케일 역방향 검색',

    persona_push_user_pain: '"Push는 Ableton Live 안에서만 작동해요."',
    persona_push_user_solution: 'Push를 MIDI로 연결하고 64패드 그리드에서 스케일, 코드, 이론을 직접 확인. 어떤 DAW에서든 작동합니다. Push Universal Translator 곧 출시.',
    persona_push_user_feat1: 'MIDI 입출력 — 모든 64패드 컨트롤러 연결',
    persona_push_user_feat2: 'Push 시리얼 MIDI 출력 지원',
    persona_push_user_feat3: '크로매틱 4도 레이아웃 (Push와 동일)',
    persona_push_user_feat4: 'Push 3 스타일 벨로시티 감도 조절',

    features_title: '주요 기능',
    card_theory_title: '이론 엔진',
    card_theory_desc: '31스케일 x 12키. 다이어토닉 코드. Available Scale 역방향 검색. 전조 분석을 위한 피벗 코드.',
    card_voicing_title: '보이싱 도구',
    card_voicing_desc: 'Drop 2 / Drop 3, Shell 보이싱 (1-3-7, 1-7-3), 전위, Omit 5, Rootless. 보이싱 박스에서 여러 핑거링 옵션.',
    card_sound_title: '사운드 & 퍼포먼스',
    card_sound_desc: '내장 오르간과 일렉트릭 피아노 (Rhodes 샘플러). 이펙트. 퍼폼 모드로 라이브 코드 진행 연주. 외부 음원 불필요.',
    card_midi_title: 'MIDI & 연동',
    card_midi_desc: 'WebMIDI 입출력. MIDI 파일 내보내기. Push 3 옥타브 동기화. 벨로시티 감도 조절. 모든 MIDI 패드 컨트롤러와 호환.',
    card_access_title: '접근성 & 개인정보',
    card_access_desc: 'Okabe-Ito 색상 팔레트 (색각 이상 배려). 모든 데이터는 브라우저에 저장 (localStorage). 추적 없음, 클라우드 없음.',
    card_free_title: '완전 무료',
    card_free_desc: '모든 기능 무료. 계정 불필요. 체험 기간 없음. 광고 없음. 데이터 수집 없음. 브라우저를 열고 바로 탐색하세요.',

    demo_title: '실제 화면',
    demo_scale_caption: '스케일 모드 — C 메이저를 64패드 그리드에 표시',
    demo_chord_caption: '코드 모드 — Dm7 보이싱 옵션',
    demo_input_caption: '인풋 모드 — 실시간 코드 감지',
    demo_perform_caption: '퍼폼 모드 — 코드 진행 라이브 연주',

    diff_title: '무엇이 다른가',
    diff_only_title: '브라우저 기반 유일한 64패드 이론 도구',
    diff_only_desc: '브라우저의 64패드 그리드에서 음악 이론 시각화, 코드 감지, 사운드를 결합한 도구는 다른 곳에 없습니다. 직접 경쟁자 제로.',
    diff_rhodes_title: '무료 Rhodes 벨로시티 레이어',
    diff_rhodes_desc: '벨로시티 레이어가 포함된 실제 Rhodes Mark I 샘플. 이것을 무료로 제공하는 유일한 브라우저 앱.',
    diff_push_title: 'Push Universal Translator (곧 출시)',
    diff_push_desc: 'Push의 시리얼 프로토콜을 표준 4도 레이아웃으로 변환하는 세계 최초의 MIDI Effect 플러그인 — Ableton Live뿐만 아니라 모든 DAW에서.',

    cta_bottom_title: '탐색할 준비가 되셨나요?',
    cta_primary: '무료로 시작',
    cta_guide: '가이드 읽기',
    cta_desktop: '데스크톱 버전 곧 출시',

    footer_hps: 'HPS (Hardcore Pad Style)',
    footer_blog: '블로그',
  };
  I18N.langs['ko'] = existing;
})();
