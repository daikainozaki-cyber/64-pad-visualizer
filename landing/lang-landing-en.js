// Landing page — English (fallback)
// Merge into existing lang (app lang files loaded first)
(function() {
  var existing = I18N.langs['en'] || {};
  existing.landing = {
    meta_title: '64 Pad Explorer — Free Music Theory Tool for 64-Pad Controllers',
    meta_description: 'The only browser tool that shows you scales, chords, and voicings on a 64-pad grid with sound. Free, no account. Works with Push, Launchpad Pro, any 64-pad controller. 9 languages.',

    // Hero
    hero_badge: 'Free — All Features, No Account',
    hero_headline: 'Play Chords on Your <span>Pads</span>',
    hero_sub: 'You know the rhythm. Now hear the harmony. 64 Pad Explorer shows you every scale, chord, and voicing on the 64-pad grid — with sound, MIDI, and zero setup.',
    hero_cta: 'Open the App — It\'s Free',
    trust_free: 'All features free',
    trust_no_account: 'No account needed',
    trust_browser: 'Works in your browser',
    trust_languages: '9 languages',

    // Persona section
    persona_title: 'What Can You Do With It?',
    tab_beatmaker: 'Beatmaker',
    tab_guitarist: 'Guitarist',
    tab_push_user: 'Push User',

    // Beatmaker persona
    persona_beatmaker_pain: '"I can make beats all day, but when it comes to chords on pads — I\'m stuck."',
    persona_beatmaker_solution: 'Pick a root, choose a chord type, add tensions if you want. Done — you see exactly where to put your fingers on the 64-pad grid. Save your favorite voicings to 256 memory slots (16 banks x 16 slots). Switch to Perform mode and play your chord progression live on 16 pads. When you like it, export the whole thing as a MIDI file straight into your DAW.',
    persona_beatmaker_feat1: 'Don\'t know what chord you just played? Tap any notes on the pads — real-time detection tells you the chord name, with multiple candidates ranked by likelihood',
    persona_beatmaker_feat2: 'Capture mode: play a chord, it auto-saves to the next slot. Build progressions without stopping',
    persona_beatmaker_feat3: 'Hear it immediately — built-in Rhodes piano with velocity layers and organ presets, plus effects. No external sound source needed',
    persona_beatmaker_feat4: 'See which scales work over your chord. The Available Scale panel shows you exactly what notes sound good — learn theory by playing, not reading',

    // Guitarist persona
    persona_guitarist_pain: '"I know Drop 2 and Shell voicings on guitar. But on pads? Completely lost."',
    persona_guitarist_solution: 'Click notes on the fretboard — the chord appears on the pad grid automatically, and chord detection tells you what you played. Or go the other way: select a chord, and see Drop 2, Drop 3, Shell 1-3-7, Shell 1-7-3 voicings generated instantly. Press cursor keys to flip through inversions and positions — zero cost to explore every possibility. On the fourths layout, just like guitar, the same chord shape works in every key.',
    persona_guitarist_feat1: 'Inversions are hard on guitar because positions spread out. On pads, press one key and you\'re there. Every inversion, every position, instantly',
    persona_guitarist_feat2: 'See your chord on pad, guitar, bass, piano, and staff notation — all at once, all in sync. Change one and the others follow',
    persona_guitarist_feat3: 'The theory engine knows the difference between ii7 and iii7. Tension options change based on harmonic function, not just chord type',
    persona_guitarist_feat4: 'Avoid notes are shown dimmed — not hidden. Because modal interchange and outside playing are real choices. The tool informs, you decide',

    // Push User persona
    persona_push_user_pain: '"My Push is a $1800 MIDI controller that only works in one DAW."',
    persona_push_user_solution: 'Connect your Push via MIDI. See scales and chords on the same fourths-chromatic layout you already know — but now with theory visualization, chord detection, voicing tools, and sound. Works in any browser, alongside any DAW. And the upcoming Push Universal Translator plugin will make Push speak standard fourths in every DAW natively — a world first.',
    persona_push_user_feat1: 'Push 3 octave buttons sync with the app. Your Push and the screen always match',
    persona_push_user_feat2: 'Velocity sensitivity with 4 parameters (Threshold, Drive, Compand, Range) and a real-time curve display. Not just Push — works with any MIDI controller',
    persona_push_user_feat3: 'Import a MIDI file from Scaler, ChordCat, or your keyboard session — see exactly how to play it on pads. Bidirectional: theory to performance, performance to theory',
    persona_push_user_feat4: 'Push Universal Translator (coming soon): a MIDI Effect plugin that converts Push\'s serial protocol to standard fourths. Use Push in Logic, FL Studio, Bitwig — anywhere',

    // Feature cards
    features_title: 'What\'s Inside',

    card_theory_title: 'Every Scale, Every Chord, Every Position',
    card_theory_desc: '31 scales across 12 keys. Select a chord from the diatonic bar or build one manually from 41 chord types with free tension selection. The tension tree changes dynamically based on harmonic function — Dm7 as ii shows different options than Dm7 as iii. Available Scale reverse-lookup shows every scale that fits your chord, sorted by practical usability. Use pivot chord analysis to find modulation targets.',

    card_voicing_title: 'Explore Voicings That Actually Get Used',
    card_voicing_desc: 'Drop 2, Drop 3, Shell 1-3-7, Shell 1-7-3, Omit 5, Rootless, inversions — one click generates them all. Press cursor keys to flip through positions with realistic hand-reach constraints. The voicing box shows multiple fingering options on the pad grid. Not textbook voicings — the kind that actually show up in real performance.',

    card_sound_title: 'A Real Rhodes in Your Browser',
    card_sound_desc: 'A 1977 Rhodes Mark I, sampled with velocity layers. Hit harder and the timbre changes, not just the volume. No other browser app has this — we checked. Plus 4 organ presets and effects (reverb, phaser, flanger, tremolo, filters). Click a pad and hear it. No DAW, no plugin, no download.',

    card_midi_title: 'Connects to Everything',
    card_midi_desc: 'Any MIDI pad controller works via WebMIDI. Export your chord progressions as MIDI files and drop them into your DAW. Your settings (velocity curve, display preferences, memory slots) are saved in your browser — no account, no cloud. You own your data.',

    card_access_title: 'Enter from Anywhere',
    card_access_desc: 'No pad? Click on screen. Have a keyboard? Connect via MIDI. Prefer guitar? Use the fretboard. Want to start from theory? Select a scale and chord. All input methods work together — select a chord from theory, then add notes from MIDI. Every path leads to the same place: understanding.',

    card_free_title: 'All of This is Free',
    card_free_desc: 'Not a limited trial. Not a freemium teaser. Every feature on this page works right now in your browser with no account, no payment, no ads, and no data collection. The full shortcut system, all 256 memory slots, MIDI I/O, all 9 languages, offline mode. Free.',

    // Demo
    demo_title: 'See It in Action',
    demo_scale_caption: 'C Major scale — root (orange), scale notes (blue), characteristic notes (yellow)',
    demo_chord_caption: 'Dm7 with Drop 2 voicing — multiple fingering positions shown',
    demo_input_caption: 'Tap pads freely — chord name detected in real time with multiple candidates',
    demo_perform_caption: 'Memory slots → Perform mode. Play your progression live from 16 pads',

    // Differentiators
    diff_title: 'Why This Doesn\'t Exist Anywhere Else',
    diff_only_title: 'Zero competition',
    diff_only_desc: 'We looked. There is no other tool — browser, desktop, or plugin — that combines music theory visualization, real-time chord detection, voicing generation, multi-instrument display, and playable sound on a 64-pad grid. Nothing comes close.',
    diff_rhodes_title: 'The only free browser Rhodes with velocity layers',
    diff_rhodes_desc: 'VirtualPiano.eu uses General MIDI — no velocity layers. Every other Rhodes (V8, Keyzone Classic, DSK RhodeZ) requires a download and a DAW. This one runs in your browser, with real velocity-layer timbre changes, for free. Even if you don\'t use pads — it\'s worth opening just for this.',
    diff_push_title: 'Push Universal Translator — a world first',
    diff_push_desc: 'An upcoming MIDI Effect plugin that converts Push\'s proprietary serial protocol to standard chromatic fourths output. Use Push in Logic Pro, FL Studio, Bitwig, Studio One — any DAW that accepts MIDI Effect plugins. Nobody else is building this.',
    diff_theory_title: 'Built by a musician, not a programmer',
    diff_theory_desc: 'The tension hierarchy, voicing logic, and Available Scale sorting come from a professional jazz/funk guitarist who has taught guitar, written 1000+ Ableton articles, and performs with these voicings daily. This isn\'t theory pulled from a textbook — it\'s field knowledge encoded into software.',

    // CTA bottom
    cta_bottom_title: 'It\'s free. It\'s in your browser. Just try it.',
    cta_primary: 'Open 64 Pad Explorer',
    cta_guide: 'Read the Guide',
    cta_desktop: 'Desktop Version Coming Soon',

    // Footer
    footer_hps: 'HPS (Hardcore Pad Style)',
    footer_blog: 'Blog',
  };
  I18N.langs['en'] = existing;
})();
