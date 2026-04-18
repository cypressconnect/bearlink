(function () {
  'use strict';

  /* ── Knowledge Base ──────────────────────────────────────────── */
  const KB = [
    {
      id: 'greeting',
      patterns: ['hello','hi','hey','howdy','sup','good morning','good afternoon','what\'s up','whats up','hiya','greetings'],
      response: () => "Hey there! I'm Bear Bot, your guide to Bear Link — Bridgeland FBLA's hub. Ask me anything about competitive events, points, resources, or navigating the site!",
      suggestions: ['How do I earn points?', 'What competitive events exist?', 'Where are study resources?']
    },
    {
      id: 'what_is_fbla',
      patterns: ['what is fbla','what does fbla stand for','what is bear link','about fbla','about bear link','tell me about','what is this','who are you','what is this site','what is this website','explain fbla','fbla mean'],
      response: () => "**FBLA** stands for Future Business Leaders of America — a national student organization that prepares students for careers in business and leadership.\n\n**Bear Link** is Bridgeland High School's FBLA chapter hub, established in 2017. We have 250+ active members, 42 state qualifiers, 15 national awards, and have raised $5k+ for our community.",
      suggestions: ['How do I join?', 'What events do you compete in?', 'How are points earned?']
    },
    {
      id: 'join',
      patterns: ['how do i join','how to join','sign up','become a member','membership','enroll','register','get started','joining'],
      response: () => "To join Bear Link, head to the **Resources page** and sign up through **Schoology** or **FBLA Connect**. You can also reach out via our **Discord server** for the latest membership info and announcements!\n\nCheck the Resources page for direct links to all of these.",
      suggestions: ['What is FBLA Connect?', 'What is the Discord?', 'How do I earn points?']
    },
    {
      id: 'competitive_events_general',
      patterns: ['competitive events','what events','event list','fbla events','what can i compete in','what competitions','competition','compete','events available','all events','show events','list events'],
      response: () => "FBLA has a wide range of **competitive events** across several categories:\n\n- **Business & Communication** — Public Speaking, Impromptu Speaking, Business Communications, Parliamentary Procedure\n- **Finance** — Accounting I & II, Business Calculations, Economics, Banking & Financial Systems\n- **Technology** — Coding & Programming, Cybersecurity, Computer Applications, Database Design\n- **Entrepreneurship** — Business Plan, Entrepreneurship, Introduction to Business\n- **Marketing** — Marketing, Sports & Entertainment Management, Retail Management\n- **Healthcare** — Healthcare Administration, Introduction to Healthcare\n\nVisit the **Competitive Events page** to browse everything and find your ideal match!",
      suggestions: ['How does the Event Matchmaker work?', 'How do I practice for events?', 'How do points work?']
    },
    {
      id: 'event_matchmaker',
      patterns: ['matchmaker','event matchmaker','which event','what event suits me','best event for me','find my event','match me','event quiz','quiz','which competition','recommend event','what should i compete'],
      response: () => "The **Event Matchmaker** is a personality-style quiz on the **Competitive Events page** that helps you find the FBLA event that best fits your skills and interests.\n\nJust answer a few questions and it'll suggest the ideal events for you — great if you're new to FBLA or want to explore something different!",
      suggestions: ['How do I practice for events?', 'What events are available?', 'How do I earn points?']
    },
    {
      id: 'practice_quiz',
      patterns: ['practice','practice quiz','quick practice','study','prep','prepare','test prep','practice questions','mock test','drill','flashcard','study for','exam prep','how to prepare'],
      response: () => "The **Quick Practice** tool is on the **Competitive Events page** — it has timed multiple-choice quizzes for **40+ FBLA events**.\n\nPick your event, set the timer, and go! It's the best way to prep for district, state, and national competitions.",
      suggestions: ['Which events have practice quizzes?', 'How does the Event Matchmaker work?', 'Where else can I study?']
    },
    {
      id: 'points_general',
      patterns: ['how do points work','earn points','point system','what are points','points explained','how to get points','accumulate points','points for','why points','what do points do','point value'],
      response: () => "Members earn **points** by participating in FBLA events and activities. Different activities carry different point values — competitions are worth more than regular meetings.\n\n**Point categories include:**\n- Competitive events\n- Chapter meetings\n- Community service\n- Fundraisers\n- Leadership activities\n\nPoints are tracked live on the **Points page** for all members to see.",
      suggestions: ['Where is the leaderboard?', 'How do I view my points?', 'What events give the most points?']
    },
    {
      id: 'leaderboard',
      patterns: ['leaderboard','standings','ranking','who is winning','top members','points page','my rank','my standing','how many points','member rank','point total','who has the most','podium'],
      response: () => "The **Points page** shows the full member leaderboard — including a **top-3 podium** for the highest scorers and a sortable table for everyone else.\n\nYou can filter by grade level, and click any member's name to see their complete event history and point breakdown.",
      suggestions: ['How do I earn more points?', 'How do I view a member profile?', 'What events give points?']
    },
    {
      id: 'member_profile',
      patterns: ['member profile','my profile','view profile','member page','member detail','event history','my events','my points','see my points','individual member','profile page'],
      response: () => "Each member has a **profile page** showing:\n- Total points earned\n- Full event history (event name, category, points, date)\n- Grade and member info\n\nYou can access any member's profile by clicking their name on the **Points leaderboard page**.",
      suggestions: ['How do I earn points?', 'Where is the leaderboard?', 'What is the points system?']
    },
    {
      id: 'resources',
      patterns: ['resources','where can i find','study material','study resources','where do i go','materials','documents','files','google drive','schoology','fbla connect','discord','links','resource page'],
      response: () => "The **Resources page** has everything you need:\n\n- **Schoology** — class materials and assignments\n- **FBLA Connect** — the national FBLA community platform\n- **Discord** — chapter announcements and communication\n- **Google Drive** — shared study docs and chapter files\n\nAll links are on the Resources page in the main navigation.",
      suggestions: ['What is FBLA Connect?', 'What is the Discord for?', 'How do I join?']
    },
    {
      id: 'schoology',
      patterns: ['schoology','class materials','assignments','school portal','lms','learning management'],
      response: () => "**Schoology** is where you'll find class materials, assignments, and chapter documents. The direct link is on the **Resources page**.\n\nIf you don't have access, contact your chapter advisor or an officer.",
      suggestions: ['Where is the Resources page?', 'What else is on the Resources page?']
    },
    {
      id: 'discord',
      patterns: ['discord','discord server','chat','announcements','server','dms','messaging'],
      response: () => "The **Bear Link Discord** is where the chapter communicates day-to-day — event announcements, reminders, and general chat.\n\nThe invite link is on the **Resources page**. Join to stay in the loop!",
      suggestions: ['What is Schoology?', 'What is FBLA Connect?', 'How do I join FBLA?']
    },
    {
      id: 'fbla_connect',
      patterns: ['fbla connect','national platform','national community','fbla network','connect platform'],
      response: () => "**FBLA Connect** is the official national FBLA platform — it's where members connect with FBLA chapters across the country, find resources, and access national-level content.\n\nYou can find the link on the **Resources page**.",
      suggestions: ['What is Schoology?', 'What is the Discord?', 'What competitive events exist?']
    },
    {
      id: 'google_drive',
      patterns: ['google drive','drive','shared folder','shared files','documents','chapter files','notes'],
      response: () => "The **Google Drive** folder has shared chapter documents, study materials, presentation templates, and other resources.\n\nThe link is on the **Resources page**.",
      suggestions: ['What else is on the Resources page?', 'How do I practice for events?']
    },
    {
      id: 'navigation',
      patterns: ['how do i navigate','where is','where can i find the','how to get to','navigate to','go to','find the page','which page','what pages','site map','pages on this site','menu','nav'],
      response: () => "The site has five main sections accessible from the **top navigation bar**:\n\n- **Home** — overview, stats, and timeline\n- **Competitive Events** — browse events, Event Matchmaker, Quick Practice\n- **Resources** — Schoology, FBLA Connect, Discord, Google Drive\n- **Points** — member leaderboard and standings\n- **Admin Login** — for officers and advisors only\n\nThe nav bar is always visible at the top of every page.",
      suggestions: ['What is on the Competitive Events page?', 'What is on the Resources page?', 'How do I earn points?']
    },
    {
      id: 'home_page',
      patterns: ['home page','homepage','home','main page','landing page','front page','start page'],
      response: () => "The **Home page** features:\n- A hero section with the chapter mission\n- Stats: 250+ members, 42 state qualifiers, 15 national awards, $5k+ raised\n- A timeline of chapter events (Winter Mixer, District Leadership Conference, March for Dimes)\n- Quick links to Resources and Competitive Events",
      suggestions: ['What competitive events are there?', 'How do I earn points?', 'Where are the resources?']
    },
    {
      id: 'admin',
      patterns: ['admin','admin panel','dashboard','admin login','officer','manage members','add points','assign points','edit member','delete member','chapter report','admin access'],
      response: () => "The **Admin area** is for officers and advisors only. It includes:\n\n- **Dashboard** — manage member points, view chapter analytics\n- **Assign Event Points** — bulk-assign points to multiple members at once\n- **Member Manager** — edit or delete individual member records\n\nLog in via the **Admin Login** link in the top-right corner of any page.",
      suggestions: ['How does the points system work?', 'What is the leaderboard?']
    },
    {
      id: 'events_timeline',
      patterns: ['upcoming events','events calendar','schedule','what events are coming','winter mixer','district','march for dimes','fundraiser','timeline','chapter events','when is','event dates'],
      response: () => "Recent and upcoming chapter events include:\n\n- **Winter Mixer** — social chapter event\n- **District Leadership Conference** — competitive conference\n- **March for Dimes** — community fundraiser\n\nCheck the **Home page** for the full timeline and any new events added by officers.",
      suggestions: ['How do I earn points from events?', 'What is the District Leadership Conference?', 'How do I join?']
    },
    {
      id: 'accounting',
      patterns: ['accounting','accounting i','accounting ii','financial accounting','bookkeeping'],
      response: () => "**Accounting I & II** are FBLA competitive events focused on financial accounting concepts — journal entries, trial balances, financial statements, and more.\n\nUse **Quick Practice** on the Competitive Events page to prep with timed quiz questions specific to Accounting events.",
      suggestions: ['How do I practice?', 'What other finance events exist?', 'How does the Event Matchmaker work?']
    },
    {
      id: 'public_speaking',
      patterns: ['public speaking','speaking','speech','impromptu','oratory','presentation','communication events','business communications'],
      response: () => "FBLA has several communication-based events:\n\n- **Public Speaking** — prepared speech on a business topic\n- **Impromptu Speaking** — 5 minutes to prepare and deliver a speech on a surprise topic\n- **Business Communications** — written and oral communication skills\n\nAll are great for building confidence and professional skills. Use the **Event Matchmaker** to see if these fit your strengths!",
      suggestions: ['How does the Event Matchmaker work?', 'How do I practice?', 'What other events are there?']
    },
    {
      id: 'coding_tech',
      patterns: ['coding','programming','cybersecurity','cyber','computer','technology','tech events','database','computer applications','software','it','information technology'],
      response: () => "FBLA's technology events include:\n\n- **Coding & Programming** — write and debug code under competition conditions\n- **Cybersecurity** — network security, threats, and defense concepts\n- **Computer Applications** — spreadsheets, word processing, presentations\n- **Database Design & Applications** — relational database design\n\nVisit the **Competitive Events page** and use the **Event Matchmaker** to find the best tech event for you!",
      suggestions: ['How do I practice for tech events?', 'What is the Event Matchmaker?', 'Show me all events']
    },
    {
      id: 'entrepreneurship',
      patterns: ['entrepreneurship','business plan','startup','entrepreneur','business pitch','intro to business','introduction to business'],
      response: () => "Entrepreneurship events are perfect if you love business strategy and innovation:\n\n- **Entrepreneurship** — develop and present a full business concept\n- **Business Plan** — detailed written and oral business plan competition\n- **Introduction to Business** — foundational business knowledge exam\n\nUse the **Event Matchmaker** on the Competitive Events page to see if these match your profile!",
      suggestions: ['How does the Event Matchmaker work?', 'How do I practice?', 'What other events are there?']
    },
    {
      id: 'marketing',
      patterns: ['marketing','sports entertainment','retail','sales','advertising','market research','sports and entertainment'],
      response: () => "FBLA marketing events include:\n\n- **Marketing** — marketing strategy, research, and concepts\n- **Sports & Entertainment Management** — apply business principles to sports/entertainment\n- **Retail Management** — retail business operations and customer service\n\nCheck the Competitive Events page for practice quizzes on these topics!",
      suggestions: ['How do I practice?', 'What is the Event Matchmaker?', 'How do I earn points?']
    },
    {
      id: 'healthcare',
      patterns: ['healthcare','health','medical','hospital','intro to healthcare','introduction to healthcare','healthcare administration'],
      response: () => "FBLA's healthcare events include:\n\n- **Healthcare Administration** — health systems, insurance, and management\n- **Introduction to Healthcare** — foundational healthcare knowledge exam\n\nUse the **Quick Practice** quizzes on the Competitive Events page to prep!",
      suggestions: ['How do I practice?', 'What other events are there?', 'How does the matchmaker work?']
    },
    {
      id: 'stats',
      patterns: ['how many members','member count','how big','size of chapter','how many people','chapter size','250','state qualifiers','national awards','raised','fundraised','stats','statistics','achievements'],
      response: () => "Here are Bear Link's chapter stats:\n\n- **250+** active members\n- **42** state qualifiers\n- **15** national awards\n- **$5,000+** raised for the community\n\nEstablished in 2017 at Bridgeland High School.",
      suggestions: ['How do I join?', 'What competitive events are there?', 'What events has the chapter hosted?']
    },
    {
      id: 'contact',
      patterns: ['contact','email','reach out','get in touch','officer','advisor','teacher','sponsor','contact info','who do i contact','who do i ask'],
      response: () => "For questions about the chapter, your best bets are:\n\n- **Discord** — fastest way to reach officers (link on the Resources page)\n- **Schoology** — message your advisor directly\n- **FBLA Connect** — national-level inquiries\n\nYou can also use the Contact link in the site footer.",
      suggestions: ['Where is the Discord?', 'What is Schoology?', 'How do I join?']
    },
    {
      id: 'fallback',
      patterns: [],
      response: (input) => `I'm not sure about "${input}" specifically, but I can help with:\n\n- **Competitive events** — what's available, how to practice\n- **Points & leaderboard** — how the system works\n- **Resources** — Schoology, Discord, Drive, FBLA Connect\n- **Navigation** — finding any page on the site\n\nTry rephrasing or pick one of the suggestions below!`,
      suggestions: ['What competitive events exist?', 'How do I earn points?', 'Where are the resources?']
    }
  ];

  /* ── Intent Matching Engine ──────────────────────────────────── */
  function tokenize(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s']/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function scoreEntry(entry, tokens, raw) {
    if (entry.id === 'fallback') return -1;

    const rawLower = raw.toLowerCase();

    // Exact phrase match on raw input scores highest
    let score = 0;
    for (const pattern of entry.patterns) {
      if (rawLower.includes(pattern)) {
        score = Math.max(score, pattern.split(' ').length * 10);
      }
    }
    if (score > 0) return score;

    // Token overlap scoring
    const patternTokens = new Set(entry.patterns.flatMap(p => p.split(' ')));
    let overlap = 0;
    for (const tok of tokens) {
      if (patternTokens.has(tok)) overlap++;
    }
    if (overlap > 0) score = overlap * 3;

    // Partial stem matching (first 5 chars)
    if (score === 0) {
      for (const tok of tokens) {
        const stem = tok.slice(0, 5);
        for (const pt of patternTokens) {
          if (pt.length >= 5 && pt.startsWith(stem)) { score += 1; break; }
        }
      }
    }

    return score;
  }

  function findIntent(input) {
    const tokens = tokenize(input);
    let best = null;
    let bestScore = 0;

    for (const entry of KB) {
      if (entry.id === 'fallback') continue;
      const s = scoreEntry(entry, tokens, input);
      if (s > bestScore) { bestScore = s; best = entry; }
    }

    return bestScore >= 1 ? best : KB.find(e => e.id === 'fallback');
  }

  /* ── Widget State ────────────────────────────────────────────── */
  const WELCOME = "Hi! I'm **Bear Bot**, your guide to Bear Link — Bridgeland FBLA's hub. Ask me anything about competitive events, points, resources, or navigating the site!";
  const INIT_SUGGESTIONS = ['How do I earn points?', 'What competitive events exist?', 'Where are study resources?', 'How does the Event Matchmaker work?'];

  let isOpen = false;
  let isTyping = false;

  /* ── Styles ──────────────────────────────────────────────────── */
  const styles = `
    #bearbot-fab {
      position: fixed; bottom: 28px; right: 28px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%;
      background: #001a48; color: #fff; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(0,26,72,.35);
      transition: transform .2s ease, box-shadow .2s ease; outline: none;
    }
    #bearbot-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,26,72,.45); }
    #bearbot-fab .bb-icon {
      font-size: 26px; line-height: 1;
      font-family: 'Material Symbols Outlined', sans-serif;
      font-variation-settings: 'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24;
      transition: transform .25s ease, opacity .25s ease; position: absolute;
    }
    #bearbot-fab .bb-close { opacity: 0; transform: rotate(-90deg) scale(.7); }
    #bearbot-fab.is-open .bb-chat  { opacity: 0; transform: rotate(90deg) scale(.7); }
    #bearbot-fab.is-open .bb-close { opacity: 1; transform: rotate(0) scale(1); }
    #bearbot-badge {
      position: absolute; top: -3px; right: -3px;
      width: 14px; height: 14px; border-radius: 50%;
      background: #a04100; border: 2px solid #fff; display: none;
    }
    #bearbot-panel {
      position: fixed; bottom: 96px; right: 28px; z-index: 9998;
      width: 380px; max-width: calc(100vw - 32px);
      height: 560px; max-height: calc(100vh - 120px);
      border-radius: 20px; background: #fff;
      box-shadow: 0 12px 48px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(.88) translateY(16px); transform-origin: bottom right;
      opacity: 0; pointer-events: none;
      transition: transform .25s cubic-bezier(.34,1.56,.64,1), opacity .2s ease;
    }
    #bearbot-panel.is-open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }
    #bearbot-header {
      background: linear-gradient(135deg,#001a48 0%,#002d72 100%);
      color: #fff; padding: 16px 20px;
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
    }
    #bearbot-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: rgba(255,255,255,.15);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-family: 'Material Symbols Outlined', sans-serif;
      font-variation-settings: 'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24;
      flex-shrink: 0;
    }
    #bearbot-header-info { flex: 1; min-width: 0; }
    #bearbot-header-name { font-family: 'Manrope',sans-serif; font-size: 15px; font-weight: 700; line-height: 1.2; }
    #bearbot-header-sub  { font-size: 11.5px; opacity: .75; margin-top: 1px; font-family: 'Inter',sans-serif; }
    #bearbot-online { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 0 2px rgba(74,222,128,.3); flex-shrink: 0; }
    #bearbot-messages {
      flex: 1; overflow-y: auto; padding: 16px 16px 8px;
      display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth;
    }
    #bearbot-messages::-webkit-scrollbar { width: 4px; }
    #bearbot-messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 99px; }
    .bb-msg { display: flex; gap: 8px; animation: bbFade .2s ease; }
    @keyframes bbFade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    .bb-msg.user { flex-direction: row-reverse; }
    .bb-msg-av {
      width: 28px; height: 28px; border-radius: 50%; background: #e5e8eb;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-family: 'Material Symbols Outlined', sans-serif;
      font-variation-settings: 'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24;
      color: #444651; flex-shrink: 0; margin-top: 2px;
    }
    .bb-msg.user .bb-msg-av {
      background: #a04100; color: #fff; font-size: 12px;
      font-family: 'Inter',sans-serif; font-weight: 700; font-variation-settings: normal;
    }
    .bb-bubble {
      max-width: 80%; padding: 10px 14px; border-radius: 18px;
      font-size: 13.5px; line-height: 1.55; font-family: 'Inter',sans-serif;
      color: #181c1e; background: #f1f4f7; border-bottom-left-radius: 4px;
    }
    .bb-msg.user .bb-bubble {
      background: #001a48; color: #fff;
      border-bottom-left-radius: 18px; border-bottom-right-radius: 4px;
    }
    .bb-bubble p { margin: 0 0 6px; }
    .bb-bubble p:last-child { margin-bottom: 0; }
    .bb-bubble ul { margin: 4px 0; padding-left: 16px; }
    .bb-bubble li { margin-bottom: 3px; }
    .bb-bubble strong { font-weight: 600; }
    .bb-typing { display: flex; gap: 8px; align-items: flex-end; }
    .bb-dots {
      display: flex; align-items: center; gap: 4px;
      background: #f1f4f7; border-radius: 18px; border-bottom-left-radius: 4px;
      padding: 12px 16px;
    }
    .bb-dots span {
      width: 7px; height: 7px; border-radius: 50%; background: #9ca3af;
      animation: bbBounce 1.2s infinite ease-in-out;
    }
    .bb-dots span:nth-child(2) { animation-delay: .2s; }
    .bb-dots span:nth-child(3) { animation-delay: .4s; }
    @keyframes bbBounce { 0%,60%,100% { transform:translateY(0); } 30% { transform:translateY(-5px); } }
    #bearbot-suggestions {
      padding: 0 16px 8px; display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0;
    }
    .bb-chip {
      font-size: 12px; font-family: 'Inter',sans-serif; color: #001a48;
      background: #dae2ff; border: none; border-radius: 99px;
      padding: 5px 12px; cursor: pointer; transition: background .15s; white-space: nowrap;
    }
    .bb-chip:hover { background: #b1c5ff; }
    #bearbot-footer {
      padding: 12px 16px 16px; border-top: 1px solid #e5e8eb;
      display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: #fff;
    }
    #bearbot-input {
      flex: 1; border: 1.5px solid #c4c6d2; border-radius: 99px;
      padding: 9px 16px; font-size: 13.5px; font-family: 'Inter',sans-serif;
      outline: none; color: #181c1e; background: #f7fafd;
      transition: border-color .15s;
    }
    #bearbot-input:focus { border-color: #001a48; background: #fff; }
    #bearbot-input::placeholder { color: #9ca3af; }
    #bearbot-send {
      width: 38px; height: 38px; border-radius: 50%; background: #001a48;
      color: #fff; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      transition: background .15s, transform .1s;
      font-family: 'Material Symbols Outlined', sans-serif;
      font-variation-settings: 'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24; font-size: 20px;
    }
    #bearbot-send:hover { background: #002d72; }
    #bearbot-send:active { transform: scale(.92); }
    #bearbot-poweredby {
      text-align: center; font-size: 10.5px; color: #9ca3af;
      font-family: 'Inter',sans-serif; padding-bottom: 4px; flex-shrink: 0;
    }
    @media (max-width: 440px) {
      #bearbot-panel { right: 12px; bottom: 88px; width: calc(100vw - 24px); }
      #bearbot-fab   { right: 16px; bottom: 20px; }
    }
  `;

  /* ── DOM Init ────────────────────────────────────────────────── */
  function init() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    const fab = document.createElement('button');
    fab.id = 'bearbot-fab';
    fab.setAttribute('aria-label', 'Open Bear Bot chat');
    fab.innerHTML = `
      <span class="bb-icon bb-chat">chat</span>
      <span class="bb-icon bb-close">close</span>
      <span id="bearbot-badge"></span>
    `;

    const panel = document.createElement('div');
    panel.id = 'bearbot-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Bear Bot chat');
    panel.innerHTML = `
      <div id="bearbot-header">
        <div id="bearbot-avatar">smart_toy</div>
        <div id="bearbot-header-info">
          <div id="bearbot-header-name">Bear Bot</div>
          <div id="bearbot-header-sub">Bridgeland FBLA Assistant</div>
        </div>
        <div id="bearbot-online" title="Online"></div>
      </div>
      <div id="bearbot-messages"></div>
      <div id="bearbot-suggestions"></div>
      <div id="bearbot-footer">
        <input id="bearbot-input" type="text" placeholder="Ask me anything…" autocomplete="off" maxlength="300"/>
        <button id="bearbot-send" aria-label="Send">send</button>
      </div>
      <div id="bearbot-poweredby">Bear Link Knowledge Base</div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener('click', togglePanel);
    document.getElementById('bearbot-send').addEventListener('click', handleSend);
    document.getElementById('bearbot-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) togglePanel(); });

    appendMsg('assistant', WELCOME);
    renderChips(INIT_SUGGESTIONS);
  }

  /* ── Panel Toggle ────────────────────────────────────────────── */
  function togglePanel() {
    isOpen = !isOpen;
    document.getElementById('bearbot-fab').classList.toggle('is-open', isOpen);
    document.getElementById('bearbot-panel').classList.toggle('is-open', isOpen);
    document.getElementById('bearbot-badge').style.display = 'none';
    if (isOpen) {
      setTimeout(() => document.getElementById('bearbot-input').focus(), 250);
      scrollBottom();
    }
  }

  /* ── Send ────────────────────────────────────────────────────── */
  function handleSend() {
    const inp = document.getElementById('bearbot-input');
    const text = inp.value.trim();
    if (!text || isTyping) return;
    inp.value = '';
    document.getElementById('bearbot-suggestions').innerHTML = '';
    appendMsg('user', text);
    respond(text);
  }

  function respond(input) {
    isTyping = true;
    const typing = appendTyping();
    setTimeout(() => {
      typing.remove();
      isTyping = false;
      const entry = findIntent(input);
      const reply = entry.response(input);
      appendMsg('assistant', reply);
      if (entry.suggestions) renderChips(entry.suggestions);
      if (!isOpen) document.getElementById('bearbot-badge').style.display = 'block';
    }, 420 + Math.random() * 280);
  }

  /* ── UI Helpers ──────────────────────────────────────────────── */
  function appendMsg(role, text) {
    const container = document.getElementById('bearbot-messages');
    const wrap = document.createElement('div');
    wrap.className = `bb-msg ${role}`;
    const av = document.createElement('div');
    av.className = 'bb-msg-av';
    av.textContent = role === 'assistant' ? 'smart_toy' : 'B';
    const bub = document.createElement('div');
    bub.className = 'bb-bubble';
    bub.innerHTML = md(text);
    if (role === 'assistant') { wrap.appendChild(av); wrap.appendChild(bub); }
    else                      { wrap.appendChild(bub); wrap.appendChild(av); }
    container.appendChild(wrap);
    scrollBottom();
  }

  function appendTyping() {
    const container = document.getElementById('bearbot-messages');
    const el = document.createElement('div');
    el.className = 'bb-typing';
    el.innerHTML = `
      <div class="bb-msg-av">smart_toy</div>
      <div class="bb-dots"><span></span><span></span><span></span></div>
    `;
    container.appendChild(el);
    scrollBottom();
    return el;
  }

  function renderChips(list) {
    const el = document.getElementById('bearbot-suggestions');
    el.innerHTML = '';
    list.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'bb-chip';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        el.innerHTML = '';
        appendMsg('user', label);
        respond(label);
      });
      el.appendChild(btn);
    });
  }

  function scrollBottom() {
    const el = document.getElementById('bearbot-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  /* ── Minimal Markdown ────────────────────────────────────────── */
  function md(text) {
    const esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const lines = esc.split('\n');
    const out = [];
    let inList = false;
    for (const line of lines) {
      if (/^\s*[-*]\s+/.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(line.trim() ? '<p>' + inline(line) + '</p>' : '');
      }
    }
    if (inList) out.push('</ul>');
    return out.filter((l,i,a) => !(l===''&&(i===0||a[i-1]===''||i===a.length-1))).join('');
  }

  function inline(t) {
    return t
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  /* ── Boot ────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
