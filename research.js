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
    ii: { name: 'Gollwitzer & Sheeran, 2006 — implementation intentions meta-analysis', url: 'https://www.socmot.uni-konstanz.de/publications/implementation-intentions-and-goal-achievement-meta-analysis-effects-and-processes' },
    /* v12 body-health and fitness sources */
    nhlbi_copd: { name: 'NHLBI — COPD treatment', url: 'https://www.nhlbi.nih.gov/health/copd/treatment' },
    cochrane_pr: { name: 'Cochrane review, 2015 — pulmonary rehabilitation for COPD', url: 'https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD003793.pub3/full' },
    cochrane_sm: { name: 'Cochrane review — COPD self-management with action plans', url: 'https://www.cochrane.org/evidence/CD011682_self-management-interventions-including-action-plans-patients-chronic-obstructive-pulmonary-disease' },
    nhlbi_asthma: { name: 'NHLBI — 2020 asthma management guideline updates', url: 'https://www.nhlbi.nih.gov/health-topics/asthma-management-guidelines-2020-updates' },
    dpp: { name: 'NIDDK — Diabetes Prevention Program results', url: 'https://www.niddk.nih.gov/about-niddk/research-areas/diabetes/diabetes-prevention-program-dpp' },
    aha_bp: { name: '2025 AHA/ACC high blood pressure guideline', url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001356' },
    aha_rehab: { name: 'American Heart Association — cardiac rehab', url: 'https://www.heart.org/en/health-topics/cardiac-rehab/cardiac-rehab-faq' },
    acp_back: { name: 'American College of Physicians, 2017 — low back pain guideline', url: 'https://pubmed.ncbi.nlm.nih.gov/28192789/' },
    oarsi: { name: 'OARSI — exercise for knee and hip osteoarthritis', url: 'https://oarsi.org/sites/oarsi/files/images/2022/OARSI%20Exercise%20Implementation%20Recommendations.pdf' },
    eular_fm: { name: 'EULAR, 2016 — fibromyalgia recommendations', url: 'https://ard.bmj.com/content/annrheumdis/early/2016/07/04/annrheumdis-2016-209724.full.pdf' },
    amf: { name: 'American Migraine Foundation — what causes migraine', url: 'https://americanmigrainefoundation.org/resource-library/what-causes-migraine/' },
    nice_ocd: { name: 'NICE guideline CG31 — OCD', url: 'https://www.nice.org.uk/guidance/cg31' },
    aan_tics: { name: 'American Academy of Neurology, 2019 — treating tics', url: 'https://www.aan.com/Guidelines/home/GetGuidelineContent/960' },
    cdc_pa: { name: 'CDC — physical activity for adults', url: 'https://www.cdc.gov/physical-activity-basics/guidelines/adults.html' },
    paluch: { name: 'Paluch et al., 2022 — daily steps and mortality (Lancet Public Health)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9289978/' }
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
    },
    /* ---------------- v12: body health (Daniel 2026-10-15: "other
     * ailments such as COPD") — same rules: information, never a
     * diagnosis, emergencies first. `urgent` lines show on top. -------- */
    {
      id: 'copd', title: 'COPD (lung disease)', kind: 'body',
      keywords: ['copd', 'emphysema', 'bronchitis', 'chronic bronchitis', 'lung disease', 'lungs', 'breathless', 'short of breath', 'shortness of breath', 'inhaler', 'oxygen', 'phlegm', 'mucus', 'pulmonary'],
      plain: 'COPD is a long-term lung disease that makes it hard to breathe out fully. It includes emphysema and chronic bronchitis. It cannot be cured, but treatment can help you breathe easier, do more, and have fewer flare-ups.',
      urgent: 'Call 911 if you cannot catch your breath, cannot speak in full sentences, or your lips or fingertips turn blue or gray.',
      common: ['Short of breath, mostly when moving', 'A cough that lasts, often with mucus', 'Wheezing or a tight chest', 'Getting tired fast', 'Flare-ups, when symptoms suddenly get worse'],
      helps: [
        { text: 'Pulmonary rehab (supervised exercise plus education) eased breathlessness and tiredness, lifted mood, and gave people more control. The gains were bigger than the smallest change people notice.', strength: 'Strong', src: 'cochrane_pr' },
        { text: 'A written action plan for flare-ups improved quality of life and lowered the chance of a lung-related hospital stay (about 31% lower odds).', strength: 'Strong', src: 'cochrane_sm' },
        { text: 'Quitting smoking, taking inhalers the right way, and staying up to date on vaccines are core parts of COPD care.', strength: 'Strong', src: 'nhlbi_copd' }
      ],
      pro: ['Bronchodilator inhalers (short-acting for mild symptoms, long-acting every day for moderate or severe)', 'Inhaled steroids or other anti-inflammatory medicine if flare-ups are frequent', 'A referral to pulmonary rehab', 'Oxygen therapy if your oxygen level is low', 'Help to quit smoking (in the US, 1-800-QUIT-NOW is free)'],
      proSrc: ['nhlbi_copd'],
      pet: [{ label: 'Breathing-friendly workout', action: 'ask:give me a breathing friendly workout' }, { label: 'Remind me to use my inhaler', action: 'ask:remind me to use my inhaler every day at 8 am' }, { label: 'Pursed-lip breathing', action: 'ask:pursed lip breathing' }],
      sources: ['nhlbi_copd', 'cochrane_pr', 'cochrane_sm'],
      study: 'COPD pulmonary rehabilitation self-management'
    },
    {
      id: 'asthma', title: 'Asthma', kind: 'body',
      keywords: ['asthma', 'wheeze', 'wheezing', 'rescue inhaler', 'puffer', 'albuterol', 'tight chest', 'allergy', 'allergies'],
      plain: 'Asthma makes the airways swell and tighten, so breathing can get hard, often with wheezing or coughing. With the right plan, most people can keep it well controlled.',
      urgent: 'Call 911 if your rescue inhaler is not helping, you cannot speak in full sentences, or your lips turn blue or gray.',
      common: ['Wheezing', 'Coughing, often at night', 'Tight chest', 'Symptoms set off by colds, exercise, smoke, or allergies'],
      helps: [
        { text: 'US guidelines (2020) back a written asthma action plan and, for many people 4 and older with moderate to severe asthma, one combined inhaler used both every day and for quick relief (called SMART).', strength: 'Strong', src: 'nhlbi_asthma' }
      ],
      pro: ['Your asthma action plan (green, yellow, red zones)', 'Whether a combined daily-plus-rescue inhaler fits you', 'Checking your inhaler technique', 'Allergy triggers at home'],
      proSrc: ['nhlbi_asthma'],
      pet: [{ label: 'Remind me to take my controller inhaler', action: 'ask:remind me to take my inhaler every day at 8 am' }],
      sources: ['nhlbi_asthma'],
      study: 'asthma self-management action plan'
    },
    {
      id: 'diabetes', title: 'Type 2 diabetes and prediabetes', kind: 'body',
      keywords: ['diabetes', 'diabetic', 'prediabetes', 'blood sugar', 'sugar', 'a1c', 'insulin', 'glucose', 'metformin'],
      plain: 'Type 2 diabetes means the body has trouble using insulin, so blood sugar stays too high. Prediabetes means it is higher than normal but not diabetes yet. Lifestyle changes can make a big difference.',
      urgent: 'Get help right away for very high or very low sugar signs: confusion, fainting, shaking and sweating that does not stop, or vomiting with high sugar.',
      common: ['Feeling thirsty and peeing a lot', 'Feeling tired', 'Blurry vision', 'Cuts that heal slowly', 'Often no signs at all at first'],
      helps: [
        { text: 'In the Diabetes Prevention Program, a lifestyle program (modest weight loss, healthier eating, more activity) cut the chance of getting type 2 diabetes by 58% over about 3 years — and by 71% for people 60 and older.', strength: 'Strong', src: 'dpp' },
        { text: 'Adults do best with at least 150 minutes a week of moderate activity plus 2 days of muscle work.', strength: 'Strong', src: 'cdc_pa' }
      ],
      pro: ['Your A1C goal and how often to check it', 'A diabetes education or prevention program near you', 'Medicines, if needed', 'Yearly eye, foot, and kidney checks'],
      proSrc: ['dpp'],
      pet: [{ label: 'Set a walking goal', action: 'ask:set my step goal to 6000' }, { label: 'Remind me to check my sugar', action: 'ask:remind me to check my blood sugar every day at 8 am' }],
      sources: ['dpp', 'cdc_pa'],
      study: 'type 2 diabetes lifestyle intervention'
    },
    {
      id: 'bloodpressure', title: 'High blood pressure', kind: 'body',
      keywords: ['blood pressure', 'hypertension', 'bp', 'high blood pressure', 'sodium', 'salt'],
      plain: 'High blood pressure means your blood pushes too hard on your blood vessels. It usually has no symptoms, but over time it raises the risk of heart attack and stroke.',
      urgent: 'Call 911 for chest pain, trouble speaking, face drooping, weakness on one side, or a sudden very bad headache.',
      common: ['Often no symptoms at all', 'Found during a check-up'],
      helps: [
        { text: 'The 2025 US guideline strongly recommends these for all adults: a healthy weight, DASH-style eating, less salt (under 2,300 mg a day, ideally 1,500), more potassium, 150+ minutes of moderate activity and 2 days of strength work a week, stress care, and less alcohol.', strength: 'Strong', src: 'aha_bp' }
      ],
      pro: ['Your blood pressure goal', 'Checking at home with a cuff', 'Whether you need medicine'],
      proSrc: ['aha_bp'],
      pet: [{ label: 'Remind me to check my blood pressure', action: 'ask:remind me to check my blood pressure every day at 9 am' }, { label: 'Give me a workout', action: 'ask:give me a workout' }],
      sources: ['aha_bp'],
      study: 'hypertension lifestyle intervention'
    },
    {
      id: 'heart', title: 'Heart health and cardiac rehab', kind: 'body',
      keywords: ['heart', 'heart attack', 'cardiac', 'heart failure', 'stent', 'bypass', 'angina', 'cholesterol'],
      plain: 'After a heart attack, heart surgery, or a heart failure diagnosis, cardiac rehab is a supervised program of exercise, education, and support that helps you recover.',
      urgent: 'Call 911 for chest pain or pressure, pain spreading to the arm, jaw, or back, sudden shortness of breath, or fainting.',
      common: ['Worry about exercising again', 'Getting tired fast', 'Low mood after a heart event'],
      helps: [
        { text: 'Cardiac rehab has proven benefits for recovery and quality of life, but fewer than 20% of people who qualify take part. Ask for a referral.', strength: 'Strong', src: 'aha_rehab' }
      ],
      pro: ['A cardiac rehab referral', 'Which activity is safe for you now', 'Heart medicines and side effects'],
      proSrc: ['aha_rehab'],
      pet: [{ label: 'Gentle chair workout', action: 'ask:give me a gentle workout' }],
      sources: ['aha_rehab'],
      study: 'cardiac rehabilitation outcomes'
    },
    {
      id: 'pain', title: 'Back pain and chronic pain', kind: 'body',
      keywords: ['back pain', 'pain', 'chronic pain', 'sciatica', 'hurts', 'sore', 'ache', 'neck pain'],
      plain: 'Pain that lasts is real and tiring. For most low back pain, gentle movement and non-drug treatments come first.',
      urgent: 'Get care right away for back pain with numbness in the groin, trouble controlling pee or poop, leg weakness, fever, or after a bad fall.',
      common: ['Pain that comes and goes', 'Stiffness', 'Poor sleep because of pain', 'Low mood from pain'],
      helps: [
        { text: 'For low back pain, US physicians are told to try non-drug treatments first — such as heat, massage, exercise, yoga, tai chi, or mindfulness.', strength: 'Strong', src: 'acp_back' }
      ],
      pro: ['Physical therapy', 'Which pain medicines are safe for you', 'Pain programs that teach coping skills'],
      proSrc: ['acp_back'],
      pet: [{ label: 'Stretch with me', action: 'ask:stretch with me' }, { label: 'Heat break reminder', action: 'ask:remind me to take a heat break in 1 hour' }],
      sources: ['acp_back'],
      study: 'chronic low back pain exercise therapy'
    },
    {
      id: 'arthritis', title: 'Arthritis (osteoarthritis)', kind: 'body',
      keywords: ['arthritis', 'osteoarthritis', 'joint', 'joints', 'knee', 'hip', 'stiff joints'],
      plain: 'Osteoarthritis is wear in the joints, most often knees, hips, and hands. It can cause pain and stiffness, but the right exercise usually helps.',
      common: ['Joint pain when moving', 'Morning stiffness', 'Swelling'],
      helps: [
        { text: 'A well-planned exercise program will not make knee or hip osteoarthritis worse, and is a key part of managing it. Have a plan for flare days so you can keep going.', strength: 'Strong', src: 'oarsi' }
      ],
      pro: ['Physical therapy for a personal exercise plan', 'Pain relief options', 'Weight goals if they apply'],
      proSrc: ['oarsi'],
      pet: [{ label: 'Gentle workout', action: 'ask:give me a gentle workout' }],
      sources: ['oarsi'],
      study: 'knee osteoarthritis exercise therapy'
    },
    {
      id: 'fibro', title: 'Fibromyalgia', kind: 'body',
      keywords: ['fibromyalgia', 'fibro', 'widespread pain'],
      plain: 'Fibromyalgia causes pain all over the body, along with tiredness, sleep problems, and trouble thinking clearly ("fibro fog").',
      common: ['Pain in many places', 'Deep tiredness', 'Poor sleep', 'Brain fog'],
      helps: [
        { text: 'Exercise was the only treatment with a "strong for" rating in the European guidelines. Start small — symptoms can feel worse at first, then improve.', strength: 'Strong', src: 'eular_fm' }
      ],
      pro: ['A slow, steady exercise plan', 'Sleep and mood support', 'Medicines for pain or sleep, if needed'],
      proSrc: ['eular_fm'],
      pet: [{ label: 'Gentle workout', action: 'ask:give me a gentle workout' }],
      sources: ['eular_fm'],
      study: 'fibromyalgia exercise'
    },
    {
      id: 'migraine', title: 'Migraine and headaches', kind: 'body',
      keywords: ['migraine', 'headache', 'headaches', 'aura'],
      plain: 'Migraine is a brain condition with strong headaches, often with nausea and sensitivity to light and sound.',
      urgent: 'Call 911 for the worst headache of your life, a headache with weakness, confusion, trouble speaking, or a stiff neck with fever.',
      common: ['Throbbing headache, often one side', 'Light and sound feel too much', 'Nausea'],
      helps: [
        { text: 'Sleep routines, exercise, regular meals, water, stress care, and avoiding your own triggers all affect how often attacks happen. A headache diary helps find triggers.', strength: 'Good', src: 'amf' }
      ],
      pro: ['Medicines to stop attacks and to prevent them', 'Checking for sleep apnea if you snore'],
      proSrc: ['amf'],
      pet: [{ label: 'Remind me to drink water', action: 'ask:remind me to drink water in 1 hour' }, { label: 'Log a headache in my journal', action: 'ask:journal: headache today' }],
      sources: ['amf'],
      study: 'migraine prevention lifestyle'
    },
    {
      id: 'ocd', title: 'OCD', kind: 'neuro',
      keywords: ['ocd', 'obsessive', 'compulsive', 'intrusive thoughts', 'checking', 'rituals'],
      plain: 'OCD means getting unwanted, upsetting thoughts (obsessions) and feeling you must do things to ease them (compulsions), like checking or washing.',
      common: ['Thoughts that pop in and will not leave', 'Checking, counting, or washing again and again', 'Needing things to feel "just right"'],
      helps: [
        { text: 'The main therapy is CBT with exposure and response prevention (ERP), where a therapist helps you face fears step by step without doing the ritual.', strength: 'Strong', src: 'nice_ocd' }
      ],
      pro: ['CBT with ERP', 'Medicine (often an SSRI) for some people'],
      proSrc: ['nice_ocd'],
      pet: [{ label: 'Park the thought', action: 'ask:park this thought' }],
      sources: ['nice_ocd'],
      study: 'OCD exposure response prevention'
    },
    {
      id: 'tics', title: 'Tics and Tourette', kind: 'neuro',
      keywords: ['tic', 'tics', 'tourette', 'tourettes'],
      plain: 'Tics are sudden, repeated movements or sounds. Tourette syndrome means having both kinds for over a year. Tics often get milder with age.',
      common: ['Blinking, shrugging, throat clearing', 'An urge before a tic', 'Tics get worse with stress or tiredness'],
      helps: [
        { text: 'Behavioral therapy for tics (CBIT) reduced tic severity more than education and support alone. Waiting is also okay if tics are not causing problems.', strength: 'Strong', src: 'aan_tics' }
      ],
      pro: ['CBIT with a trained therapist', 'Medicine if tics cause real problems'],
      proSrc: ['aan_tics'],
      pet: [{ label: 'Breathe with me', action: 'breathe' }],
      sources: ['aan_tics'],
      study: 'comprehensive behavioral intervention for tics'
    },
    {
      id: 'fitness', title: 'Exercise, steps, and fitness', kind: 'body',
      keywords: ['exercise', 'fitness', 'steps', 'workout', 'walking', 'walk', 'active', 'activity', 'strength', 'cardio', 'gym', 'weight loss'],
      plain: 'Moving your body helps your heart, lungs, mood, sleep, and focus. Any amount is better than none, and you can break it into small pieces.',
      common: ['Not knowing where to start', 'Low energy', 'Pain or breathing problems that make it scary'],
      helps: [
        { text: 'Adults need at least 150 minutes a week of moderate activity (like brisk walking) plus 2 days of muscle-strengthening work. Small chunks count.', strength: 'Strong', src: 'cdc_pa' },
        { text: 'More daily steps meant lower risk of death, leveling off around 6,000–8,000 steps for adults 60+ and 8,000–10,000 for younger adults. 10,000 is not a magic number.', strength: 'Strong', src: 'paluch' },
        { text: 'Physical activity lowered depression and anxiety in a large review of reviews.', strength: 'Strong', src: 'move' }
      ],
      pro: ['Which activity is safe for you if you have a heart, lung, or joint condition', 'Pulmonary or cardiac rehab, if you qualify'],
      proSrc: ['cdc_pa'],
      pet: [{ label: 'Start a walk with me', action: 'ask:start a walk' }, { label: 'Give me a workout', action: 'ask:give me a workout' }, { label: 'My fitness this week', action: 'ask:my fitness' }],
      sources: ['cdc_pa', 'paluch', 'move'],
      study: 'physical activity health benefits adults'
    }
  ];

  function norm(s) { return String(s || '').toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  /* Edit distance, for typos like "nerurodivergent" or "copd" -> "cope". */
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  var SYNONYMS = {
    neurodivergent: ['adhd', 'autism'], neurodiversity: ['adhd', 'autism'], nd: ['adhd', 'autism'],
    focus: ['adhd'], concentrate: ['adhd'], concentration: ['adhd'],
    lungs: ['copd', 'asthma'], breathing: ['copd', 'asthma'], breath: ['copd', 'asthma'],
    sugar: ['diabetes'], weight: ['fitness', 'diabetes'], heart: ['heart', 'bloodpressure'],
    joints: ['arthritis'], pain: ['pain'], move: ['fitness'], moving: ['fitness'], steps: ['fitness'], running: ['fitness']
  };

  /* Score topics by keyword hits (with typo tolerance). Best first. */
  function search(query, limit) {
    var q = ' ' + norm(query) + ' ';
    var words = q.trim().split(' ').filter(function (w) { return w.length >= 5; });
    var out = [];
    for (var i = 0; i < TOPICS.length; i++) {
      var t = TOPICS[i], score = 0;
      if (q.indexOf(' ' + norm(t.title) + ' ') !== -1) score += 6;
      for (var k = 0; k < t.keywords.length; k++) {
        var kw = norm(t.keywords[k]);
        if (kw.length <= 4) { if (q.indexOf(' ' + kw + ' ') !== -1) score += 3; }
        else if (q.indexOf(kw) !== -1) score += kw.indexOf(' ') !== -1 ? 4 : 2;
        else if (kw.indexOf(' ') === -1 && kw.length >= 6) {
          for (var w = 0; w < words.length; w++) if (lev(words[w], kw) <= (kw.length >= 9 ? 2 : 1)) { score += 1; break; }
        }
      }
      if (score > 0) out.push({ topic: t, score: score });
    }
    /* synonyms only when nothing matched directly */
    if (!out.length) {
      var all = q.trim().split(' ');
      all.forEach(function (w) {
        for (var key in SYNONYMS) {
          if (w === key || (w.length >= 7 && lev(w, key) <= 2)) SYNONYMS[key].forEach(function (id) {
            var t = byId(id); if (t && !out.some(function (x) { return x.topic === t; })) out.push({ topic: t, score: 1 });
          });
        }
      });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 3).map(function (x) { return x.topic; });
  }

  /* What kind of answer does the question want? */
  function questionKind(query) {
    var q = norm(query);
    if (/\b(symptom|symptoms|signs?|feel like|look like|how do i know)\b/.test(q)) return 'symptoms';
    if (/\b(treat|treatment|treatments|therapy|therapies|medicine|medication|meds|cure|doctor|drug)\b/.test(q)) return 'treatments';
    if (/\b(help|cope|deal|manage|tips|what can i do|support|improve|better)\b/.test(q)) return 'helps';
    if (/\b(cause|causes|why)\b/.test(q)) return 'about';
    return 'about';
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

  var api = { TOPICS: TOPICS, SOURCES: S, search: search, byId: byId, source: source, digest: digest, questionKind: questionKind, lev: lev };
  root.ROOTLING_RESEARCH = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
