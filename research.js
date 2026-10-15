/* research.js — Rootling's research library (v11, Daniel 2026-10-15:
 * "the pet acts like a real scientist and researched-backed data on
 * neurodivergent symptoms, treatments, and how the user can be best
 * assisted").
 *
 * HOW THE PET USES THIS, HONESTLY:
 *   - This is a reading library, written in plain words, with the real
 *     source for every claim. The pet quotes it like a careful scientist:
 *     what the research says, how strong the evidence is, and where it
 *     came from.
 *   - It never diagnoses and never tells the person what they "have."
 *     Treatments are described as information to talk over with a doctor
 *     or therapist — the pet does not deliver or recommend medical care.
 *   - Evidence strength words: "Strong" (national guidelines or several
 *     large reviews agree), "Good" (meta-analysis of trials, moderate
 *     effect), "Some" (small or early studies), "Early" (lived-experience
 *     research or ideas still being tested).
 *   - Crisis support is not modelled here. The 988 surface in the
 *     safety system always wins.
 */
(function (root) {
  'use strict';

  var S = {
    nice_adhd: { name: 'NICE guideline NG87 — ADHD', url: 'https://www.nice.org.uk/guidance/ng87/chapter/Recommendations' },
    nimh_adhd: { name: 'NIMH — ADHD', url: 'https://www.nimh.nih.gov/health/topics/attention-deficit-hyperactivity-disorder-adhd' },
    cdc_adhd: { name: 'CDC — ADHD treatment and managing symptoms', url: 'https://www.cdc.gov/adhd/about/index.html' },
    nice_autism_adult: { name: 'NICE guideline CG142 — autism in adults', url: 'https://www.nice.org.uk/guidance/cg142/chapter/Recommendations' },
    cdc_autism: { name: 'CDC — autism treatment and intervention', url: 'https://www.cdc.gov/autism/treatment/index.html' },
    nimh_autism: { name: 'NIMH — autism spectrum disorder', url: 'https://www.nimh.nih.gov/health/topics/autism-spectrum-disorders-asd' },
    raymaker: { name: 'Raymaker et al., 2020 — Defining autistic burnout (Autism in Adulthood)', url: 'https://pdxscholar.library.pdx.edu/socwork_fac/378/' },
    nice_gad: { name: 'NICE guideline CG113 — anxiety and panic', url: 'https://www.nice.org.uk/guidance/cg113/chapter/Recommendations' },
    nimh_anx: { name: 'NIMH — anxiety disorders', url: 'https://www.nimh.nih.gov/health/topics/anxiety-disorders' },
    nice_dep: { name: 'NICE guideline NG222 — depression in adults', url: 'https://www.nice.org.uk/guidance/ng222/chapter/Recommendations' },
    nice_ptsd: { name: 'NICE guideline NG116 — PTSD', url: 'https://www.nice.org.uk/guidance/ng116/chapter/Recommendations' },
    aasm: { name: 'AASM patient guide — non-medicine insomnia treatment', url: 'https://aasm.org/wp-content/uploads/2021/08/Behavioral-and-Psychological-Treatments-for-Insomnia-Patient-Guide.pdf' },
    breath: { name: 'Fincham et al., 2023 — breathwork meta-analysis (Scientific Reports)', url: 'https://pubmed.ncbi.nlm.nih.gov/36624160/' },
    move: { name: 'Singh et al., 2023 — physical activity umbrella review (BJSM)', url: 'https://blogs.bmj.com/bjsm/2023/06/05/from-alternative-to-mainstay-the-overwhelming-evidence-supporting-physical-activity-as-a-treatment-for-anxiety-and-depression/' },
    noise: { name: 'White/pink noise and ADHD meta-analysis, 2024 (JAACAP)', url: 'https://pubmed.ncbi.nlm.nih.gov/38428577/' },
    ii: { name: 'Gollwitzer & Sheeran, 2006 — implementation intentions meta-analysis', url: 'https://www.socmot.uni-konstanz.de/publications/implementation-intentions-and-goal-achievement-meta-analysis-effects-and-processes' }
  };

  /* action ids are handled by assistant.js (buttons under a topic). */
  var TOPICS = [
    {
      id: 'adhd', title: 'Attention and ADHD',
      keywords: ['adhd', 'add', 'attention', 'focus', 'distract', 'hyperactiv', 'impulsiv', 'fidget', 'restless', 'forget', 'forgetful', 'scatter'],
      plain: 'ADHD is a difference in how the brain handles attention, activity, and impulses. Many people find it hard to stay on one thing, stay organized, wait, or sit still. It starts in childhood and often continues into adult life.',
      common: ['Hard to start or finish tasks', 'Losing track of time and things', 'Mind jumping to new ideas', 'Feeling restless', 'Doing things before thinking them through', 'Big feelings that come fast'],
      helps: [
        { text: 'Changes to your space: less noise, better light, headphones, fewer distractions.', strength: 'Strong', src: 'nice_adhd' },
        { text: 'Short work blocks with movement breaks in between.', strength: 'Strong', src: 'nice_adhd' },
        { text: 'Getting spoken requests in writing too, so you do not have to hold them in your head.', strength: 'Strong', src: 'nice_adhd' },
        { text: 'Daily movement, enough sleep, regular meals, and less screen time make symptoms easier to handle.', strength: 'Good', src: 'cdc_adhd' },
        { text: 'White or pink background noise gave a small boost on attention tasks for people with ADHD, but it made people without ADHD do a little worse. Try it and keep it only if it helps you.', strength: 'Some', src: 'noise' }
      ],
      pro: ['Medicine (for adults, guidelines list methylphenidate or lisdexamfetamine first)', 'Therapy built for ADHD, which may include CBT', 'Regular check-ins with a clinician'],
      proSrc: ['nice_adhd', 'nimh_adhd'],
      pet: [{ label: 'Start a short focus block', action: 'timer:15' }, { label: 'Break a task into steps', action: 'ask:I can\u2019t start' }, { label: 'Play background noise', action: 'noise' }],
      sources: ['nice_adhd', 'nimh_adhd', 'cdc_adhd', 'noise']
    },
    {
      id: 'autism', title: 'Autism',
      keywords: ['autism', 'autistic', 'asd', 'asperger', 'spectrum', 'masking', 'stim', 'stimming', 'routine', 'change', 'literal', 'social'],
      plain: 'Autism is a difference in how a person communicates, connects with others, learns, and takes in the world through the senses. It is a spectrum — every autistic person is different, and needs can change over a lifetime.',
      common: ['Liking routines and knowing what comes next', 'Sounds, lights, smells, or touch feeling too strong (or too weak)', 'Social rules feeling unclear or tiring', 'Deep focus on things you love', 'Needing time alone to recover'],
      helps: [
        { text: 'Adjusting the space: more personal room, less fluorescent light, quieter rooms, earplugs or ear defenders, calm colors.', strength: 'Strong', src: 'nice_autism_adult' },
        { text: 'Visual supports — labels, words, or symbols that show what to expect.', strength: 'Strong', src: 'nice_autism_adult' },
        { text: 'Taking regular breaks when a place cannot be changed.', strength: 'Strong', src: 'nice_autism_adult' },
        { text: 'Getting the right support early in life helps health and well-being over the long term.', strength: 'Good', src: 'nimh_autism' }
      ],
      pro: ['Speech and language therapy (talking, signs, pictures, or a device)', 'Occupational therapy for everyday skills and sensory needs', 'Support for anxiety or low mood, which often come along with autism'],
      proSrc: ['cdc_autism', 'nimh_autism'],
      pet: [{ label: 'Show me today in order', action: 'ask:plan my day' }, { label: 'Quiet steps for too much noise', action: 'ask:it is too loud' }, { label: 'Words ready to use', action: 'nav:support' }],
      sources: ['nice_autism_adult', 'cdc_autism', 'nimh_autism']
    },
    {
      id: 'anxiety', title: 'Anxiety and worry',
      keywords: ['anxiety', 'anxious', 'worry', 'worried', 'panic', 'nervous', 'scared', 'fear', 'afraid', 'racing'],
      plain: 'Anxiety is your body\u2019s alarm system. Everyone feels it. It becomes a problem when the alarm does not switch off, shows up in many places, or keeps you from doing things you care about.',
      common: ['Worry that will not stop', 'Racing heart, tight chest, upset stomach', 'Avoiding places or people', 'Trouble sleeping', 'Feeling on edge'],
      helps: [
        { text: 'Slow, controlled breathing lowered stress and anxiety across many trials (a small-to-medium effect).', strength: 'Good', src: 'breath' },
        { text: 'Physical activity lowered anxiety about as much as other common treatments in a large review of reviews. Harder effort helped more.', strength: 'Strong', src: 'move' },
        { text: 'Learning how anxiety works, then self-help based on CBT, is the first step guidelines suggest.', strength: 'Strong', src: 'nice_gad' }
      ],
      pro: ['Cognitive behavioural therapy (CBT) or applied relaxation with a trained therapist', 'Medicine, chosen with a doctor', 'Guided self-help programs'],
      proSrc: ['nice_gad', 'nimh_anx'],
      pet: [{ label: 'Breathe with me', action: 'breathe' }, { label: 'Grounding: 5 things', action: 'ground' }, { label: 'A short walk', action: 'ask:remind me to take a walk in 5 minutes' }],
      sources: ['nice_gad', 'nimh_anx', 'breath', 'move']
    },
    {
      id: 'lowmood', title: 'Low mood',
      keywords: ['depress', 'sad', 'down', 'low', 'empty', 'hopeless', 'unmotivated', 'numb', 'lonely', 'cry'],
      plain: 'Low mood can make everything feel heavy and slow. When it lasts most days for weeks, a doctor may call it depression. It is common and it can get better.',
      common: ['Not enjoying things you used to', 'Low energy', 'Sleeping too much or too little', 'Pulling away from people', 'Being very hard on yourself'],
      helps: [
        { text: 'Doing small, planned, good-for-you activities (behavioural activation) is a first-line option.', strength: 'Strong', src: 'nice_dep' },
        { text: 'Moving your body lowered depression symptoms in a large review of reviews.', strength: 'Strong', src: 'move' },
        { text: 'Guided self-help is the lightest first option guidelines suggest trying.', strength: 'Strong', src: 'nice_dep' }
      ],
      pro: ['Guided self-help with a practitioner', 'Group or one-to-one CBT or behavioural activation', 'Medicine, only if you prefer it after talking it through'],
      proSrc: ['nice_dep'],
      pet: [{ label: 'One small win', action: 'ask:give me one small win' }, { label: 'Text someone safe', action: 'nav:support' }],
      sources: ['nice_dep', 'move']
    },
    {
      id: 'trauma', title: 'Trauma and PTSD',
      keywords: ['ptsd', 'trauma', 'flashback', 'nightmare', 'trigger', 'triggered', 'hypervigil'],
      plain: 'After something frightening, the mind can stay on high alert. Memories may come back suddenly, sleep can be hard, and some places or sounds can feel unsafe.',
      common: ['Memories or flashbacks that pop up', 'Bad dreams', 'Always feeling on guard', 'Avoiding reminders'],
      helps: [
        { text: 'Trauma-focused CBT with a trained therapist is the main recommended treatment. It also teaches ways to handle flashbacks and make a safety plan.', strength: 'Strong', src: 'nice_ptsd' },
        { text: 'Slow breathing can help calm the body in the moment.', strength: 'Good', src: 'breath' }
      ],
      pro: ['Trauma-focused CBT (for example, cognitive processing therapy or prolonged exposure)', 'EMDR, offered by trained therapists'],
      proSrc: ['nice_ptsd'],
      pet: [{ label: 'Grounding now', action: 'ground' }, { label: 'Breathe with me', action: 'breathe' }],
      sources: ['nice_ptsd', 'breath']
    },
    {
      id: 'sleep', title: 'Sleep',
      keywords: ['sleep', 'insomnia', 'tired at night', 'awake', 'bedtime', 'nap', 'cant sleep', 'can\u2019t sleep'],
      plain: 'Trouble sleeping is very common with ADHD, autism, anxiety, and low mood. Poor sleep then makes focus and feelings harder the next day.',
      common: ['Mind too busy to fall asleep', 'Waking up in the night', 'Body clock running late'],
      helps: [
        { text: 'CBT for insomnia (CBT-I) is the treatment most people with long-term insomnia should get. It usually takes 4 to 8 sessions with a trained provider.', strength: 'Strong', src: 'aasm' },
        { text: 'A steady wind-down routine and the same wake-up time help your body clock.', strength: 'Good', src: 'aasm' }
      ],
      pro: ['CBT-I with a trained provider', 'A sleep check if you snore, stop breathing, or feel sleepy all day'],
      proSrc: ['aasm'],
      pet: [{ label: 'Remind me to wind down', action: 'ask:remind me to start winding down at 9:30 pm' }, { label: 'Breathe with me', action: 'breathe' }],
      sources: ['aasm']
    },
    {
      id: 'starting', title: 'Starting and finishing tasks',
      keywords: ['procrastinat', 'start', 'stuck', 'motivation', 'executive', 'task', 'paralysis', 'overwhelm', 'to do', 'todo', 'chores'],
      plain: 'Getting started is often the hardest part — not because you are lazy, but because the brain needs a clear first step and a cue to begin.',
      common: ['Knowing what to do but not being able to begin', 'Big tasks feeling like one huge wall', 'Starting many things and finishing few'],
      helps: [
        { text: '"When-then" plans ("When I finish lunch, then I will open the email") helped people reach their goals much more often across 94 studies.', strength: 'Good', src: 'ii' },
        { text: 'Shorter work periods with breaks, and written steps, are recommended changes for ADHD.', strength: 'Strong', src: 'nice_adhd' }
      ],
      pro: ['Coaching or ADHD-focused therapy for planning skills'],
      proSrc: ['nice_adhd'],
      pet: [{ label: 'Break it into tiny steps', action: 'ask:I can\u2019t start' }, { label: 'Just 5 minutes', action: 'timer:5' }],
      sources: ['ii', 'nice_adhd']
    },
    {
      id: 'sensory', title: 'Sensory overload, meltdowns, and shutdowns',
      keywords: ['sensory', 'overstimulat', 'too loud', 'loud', 'bright', 'noise', 'meltdown', 'shutdown', 'overload', 'itchy', 'crowd'],
      plain: 'When the senses get too much input, the brain can hit its limit. That can look like a meltdown (big reaction) or a shutdown (going quiet and still). Both are the body protecting itself, not bad behavior.',
      common: ['Noise or light feeling painful', 'Needing to leave right now', 'Losing words for a while', 'Feeling wiped out after'],
      helps: [
        { text: 'Lower the input: quieter space, earplugs or ear defenders, softer light, more personal space.', strength: 'Strong', src: 'nice_autism_adult' },
        { text: 'Take breaks when the space cannot be changed.', strength: 'Strong', src: 'nice_autism_adult' }
      ],
      pro: ['Occupational therapy for a personal sensory plan'],
      proSrc: ['cdc_autism'],
      pet: [{ label: 'Quiet steps now', action: 'ask:it is too loud' }, { label: 'Leave quietly', action: 'pause' }],
      sources: ['nice_autism_adult', 'cdc_autism']
    },
    {
      id: 'burnout', title: 'Burnout and running on empty',
      keywords: ['burnout', 'burned out', 'burnt out', 'exhausted', 'no energy', 'drained', 'wiped'],
      plain: 'Autistic adults describe burnout as long-lasting exhaustion, losing skills you usually have, and less tolerance for input, after a long time of pushing through life demands without enough support.',
      common: ['Deep tiredness that rest does not fix fast', 'Skills you usually have becoming harder', 'Less patience for noise and people'],
      helps: [
        { text: 'People in the study said reducing demands, resting, time alone, and being accepted (not masking) helped recovery.', strength: 'Early', src: 'raymaker' },
        { text: 'Gentle movement can lift mood and energy.', strength: 'Strong', src: 'move' }
      ],
      pro: ['A doctor visit to check sleep, iron, thyroid, and mood', 'Workplace or school adjustments'],
      proSrc: ['raymaker'],
      pet: [{ label: 'Make today a small-ask day', action: 'ask:I am exhausted' }],
      sources: ['raymaker', 'move']
    },
    {
      id: 'feelings', title: 'Big feelings and rejection',
      keywords: ['rejection', 'rsd', 'angry', 'anger', 'emotional', 'feelings', 'upset', 'frustrat', 'criticism', 'mad'],
      plain: 'Many neurodivergent people feel emotions fast and strong. "Rejection sensitive dysphoria" is a popular name for intense pain after feeling rejected — it is not an official diagnosis, and research on it is still early.',
      common: ['Feelings that come on fast and big', 'Taking criticism very hard', 'Replaying a moment over and over'],
      helps: [
        { text: 'Slow breathing calms the body\u2019s stress response.', strength: 'Good', src: 'breath' },
        { text: 'Moving your body helps feelings settle.', strength: 'Strong', src: 'move' }
      ],
      pro: ['Therapy that teaches emotion skills (for example, CBT)'],
      proSrc: ['nice_adhd'],
      pet: [{ label: 'Breathe with me', action: 'breathe' }, { label: 'Park the thought', action: 'ask:park this thought' }],
      sources: ['breath', 'move']
    }
  ];

  function norm(s) { return String(s || '').toLowerCase().replace(/[\u2019']/g, '\u2019').replace(/\s+/g, ' ').trim(); }

  /* Score topics by keyword hits. Returns best topics, highest first. */
  function search(query, limit) {
    var q = ' ' + norm(query).replace(/\u2019/g, '') + ' ';
    var out = [];
    for (var i = 0; i < TOPICS.length; i++) {
      var t = TOPICS[i], score = 0;
      if (q.indexOf(norm(t.title)) !== -1) score += 5;
      for (var k = 0; k < t.keywords.length; k++) {
        var kw = t.keywords[k].replace(/\u2019/g, '');
        if (kw.length <= 3) { if (new RegExp('\\b' + kw + '\\b').test(q)) score += 3; }
        else if (q.indexOf(kw) !== -1) score += 2;
      }
      if (score > 0) out.push({ topic: t, score: score });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 3).map(function (x) { return x.topic; });
  }
  function byId(id) { for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i]; return null; }
  function source(id) { return S[id] || null; }

  /* A short plain-text digest for the optional AI brain's system prompt. */
  function digest() {
    return TOPICS.map(function (t) {
      return '## ' + t.title + '\n' + t.plain + '\nWhat helps: ' + t.helps.map(function (h) {
        return h.text + ' [' + h.strength + '; ' + (S[h.src] ? S[h.src].name : '') + ']';
      }).join(' ') + '\nTalk with a professional about: ' + t.pro.join('; ') + '.';
    }).join('\n\n');
  }

  var api = { TOPICS: TOPICS, SOURCES: S, search: search, byId: byId, source: source, digest: digest };
  root.ROOTLING_RESEARCH = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
