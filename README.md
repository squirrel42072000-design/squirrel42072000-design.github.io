# squirrel42072000-design.github.io
Rootling — a cozy self-care pet progressive web app


## v12 — Health, fitness, Google, and more commands (2026-10-15)

- **Body-health research:** COPD, asthma, type 2 diabetes, high blood pressure, heart health and cardiac rehab, back and chronic pain, osteoarthritis, fibromyalgia, migraine, plus OCD and tics. Each topic shows emergency signs first, evidence strength, and real sources (NHLBI, Cochrane, NIDDK, AHA/ACC, ACP, OARSI, EULAR, NICE, AAN, CDC).
- **Smarter answers:** typo-tolerant search, follow-ups ("what about treatments?"), symptom vs. treatment vs. coping questions answered in the right order, live "Find studies on …" (Europe PMC reviews from 2019 on, with the authors' own conclusions), Wikipedia and Wiktionary for general questions, and body emergencies ("I can't breathe", chest pain) routed to 911 first.
- **Fitness (`fitness.js`):** a Move with your pet card on Home; steps (typed in, or counted by the phone's motion sensor during "Walk with me"), active minutes (vigorous counts double), strength days, a 7-day chart, CDC-based goals, research-based step-goal suggestions you accept, and guided workouts (gentle chair, breathing-friendly for COPD/asthma, everyday, stronger, stretch).
- **Pet growth:** walks, workouts, step goals, focus timers, meds/water/journal logs, and helpful answers give the pet growth points (shared with check-ins, up to 30 bonus a day) so it grows through its stages.
- **Real Google connection:** "Connect Gmail + Calendar" uses Google's own sign-in. Unread count and newest emails, read the newest email, search ("emails from Amazon"), save drafts (never sends), read today/tomorrow/this week, and add events you confirm. Needs a Google OAuth Client ID in `config.js` (or pasted in Settings).
- **Everyday commands:** time and date, days until, math, percent, tips, unit conversion, coin/dice/random/choose, jokes and encouragement, stopwatch, shopping lists, meds and water logs, journal, daily repeating reminders, "Friday at 3"-style dates, maps and "near me", translate, define, news, read aloud.

## v11 — Ask your pet (2026-10-15)

Your pet is now a helper you can type or talk to, right on Home.

- **Commands that run on this device:** "Check my email" (opens Gmail, Outlook, Yahoo, iCloud, Proton, or your mail app — pick once), "Write an email to Sam", "Text Mom", "Call Alex", "Plan my day", "Remind me to take my meds at 8", "My one thing today is laundry", "Park: buy milk", "Focus with me for 20 minutes", "I can't start my essay" (tiny steps + a when-then plan), "Breathe with me", grounding, sensory quiet steps, wind-down, rest plans, soft pink noise made on-device, "What's the weather?" (asks before using location), "Look up…", "Play … on Spotify", "Open settings". Nothing is sent by itself — you always press send.
- **Research like a scientist (`research.js`):** plain-language notes on attention/ADHD, autism, anxiety, low mood, trauma, sleep, starting tasks, sensory overload, burnout, and big feelings. Every "what helps" line shows evidence strength (Strong / Good / Some / Early) and links its real source (NICE, NIMH, CDC, AASM, peer-reviewed meta-analyses). Treatments are listed as "things to ask a doctor or therapist about." It never diagnoses.
- **Grows and adapts (on this device):** a Helper level that rises as you work together; it learns which helps you say helped (and leads with those), what you ask for at this time of day (and offers it), your own words ("When I say inbox, I mean check my email"), and whether you like short or longer answers. Ask "What have you learned?" to see it all in plain words, or wipe it.
- **Optional connected helpers (off by default, in Settings):** read-only Gmail + Google Calendar with your own Google Client ID (token kept in memory only), and a smarter AI brain using your own OpenAI-compatible or Anthropic key for open questions, grounded in the research notes and the same guardrails. Keys are stored only on this device and left out of backups.
- **Safety:** crisis words always go to 988 and the Support page first.
