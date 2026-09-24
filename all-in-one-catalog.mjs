// What SYC-AI (All in One) offers besides the engines themselves: the
// specialized sessions behind the yellow "+", the skills it can put into a
// project, and the ideas shown around the professional-account cards.
// Plain data, so the page, the server and the tests all read one list.

// Specialized sessions: a role, a way of working and a first step. The brief
// goes to each engine the first time it joins the session; the whole template
// can also be downloaded as an AGENTS.md to use in any terminal agent.
export const TEMPLATES = Object.freeze([
  {
    id: 'website', icon: 'globe', category: 'build',
    title: 'Website builder',
    blurb: 'A clean website or landing page in your project folder, ready to publish.',
    brief: 'You build websites for people who may not be programmers. Use plain HTML, CSS and a little JavaScript unless the user asks for a framework. Keep everything in this project folder. After each change, say which file to open to see it, and how to publish it (for example GitHub Pages or Netlify). Mobile first, fast, accessible.',
    starter: 'Build me a one-page website for my business. Ask me three short questions first.',
    routes: { plan: 'claude', build: 'codex' },
  },
  {
    id: 'bugfix', icon: 'bug', category: 'build',
    title: 'Bug fixer',
    blurb: 'Finds the cause, fixes it, and proves the fix with a test.',
    brief: 'You fix bugs. First reproduce the problem, then find the root cause, then make the smallest fix, then prove it with a test or a run. Never hide an error. Report: cause, fix, proof.',
    starter: 'Something is broken. Here is the error and what I did before it happened:',
    routes: { plan: 'claude', build: 'codex' },
  },
  {
    id: 'review', icon: 'eye', category: 'build',
    title: 'Code reviewer',
    blurb: 'Reads your code and ranks real problems first. Changes nothing.',
    brief: 'You review code and change nothing. Read the project, then list real problems ranked by severity: what breaks, how to trigger it, how to fix it. Skip style nitpicks unless asked.',
    starter: 'Review this project and tell me the three most important problems.',
    routes: { plan: 'claude', build: 'claude' },
    permissions: 'read',
  },
  {
    id: 'research', icon: 'search', category: 'think',
    title: 'Research assistant',
    blurb: 'Searches, compares and summarizes, with the sources listed.',
    brief: 'You research topics for the user. Search the web when you can, compare sources, and separate facts from opinions. Always end with the list of sources you used. Save longer results as Markdown files in this folder.',
    starter: 'Research this topic and give me a one-page summary with sources:',
    routes: { plan: 'claude', build: 'claude' },
  },
  {
    id: 'writer', icon: 'pen', category: 'think',
    title: 'Writer and translator',
    blurb: 'Posts, emails, CVs and documents, in six languages.',
    brief: 'You write and translate. Match the tone the user wants, keep it clear and short, and keep names and numbers exact. Translate between English, Chinese, Spanish, Arabic, Russian and Persian. Save long documents as files in this folder.',
    starter: 'Write this for me (tone, length and language are below):',
    routes: { plan: 'claude', build: 'claude', quick: 'claude' },
  },
  {
    id: 'data', icon: 'chart', category: 'think',
    title: 'Data analyst',
    blurb: 'Reads spreadsheets and CSV files, finds what matters, draws the chart.',
    brief: 'You analyse data files the user puts in this folder (CSV, Excel, JSON). Check the data first (rows, missing values), then answer the question with numbers, and save charts as PNG files. Explain findings in plain words.',
    starter: 'I put a file in the project folder. Tell me what stands out in it.',
    routes: { plan: 'claude', build: 'codex' },
  },
  {
    id: 'tutor', icon: 'cap', category: 'learn',
    title: 'Beginner coach',
    blurb: 'Teaches programming step by step, at your pace.',
    brief: 'You teach a beginner. One small step at a time, plain words, no jargon without explaining it. Let the user type the code when possible, check it, and praise real progress. Ask what they want to build.',
    starter: 'I am new to programming. Teach me by building something small with me.',
    routes: { plan: 'claude', build: 'claude', quick: 'claude' },
  },
  {
    id: 'game', icon: 'game', category: 'build',
    title: 'Game maker',
    blurb: 'A small playable game in the browser or Godot, built with you.',
    brief: 'You make small games. Start with the simplest playable version (HTML5 canvas unless the user asks for Godot), then improve it in small steps the user can play after each change. Keep assets simple and free to use.',
    starter: 'Make me a small game I can play in the browser. Here is my idea:',
    routes: { plan: 'claude', build: 'codex' },
  },
]);

// Skills a project can carry. Files are pinned to one reviewed commit and
// written into the project folder on the user's device (Claude reads
// .claude/skills; every engine reads the rules in AGENTS.md). Authors are
// named wherever the skill is shown.
export const SKILLS = Object.freeze([
  {
    id: 'caveman', name: 'Caveman', author: 'Julius Brussee', license: 'MIT',
    url: 'https://github.com/JuliusBrussee/caveman',
    repo: 'JuliusBrussee/caveman', commit: '2fd153c67988e980fb0b2455c90832159a6a5a25', path: 'skills/caveman',
    category: 'tokens', builtIn: true,
    blurb: 'Short, exact answers without filler. Its authors measured about 65% fewer output tokens.',
  },
  {
    id: 'token-efficient', name: 'Token-efficient rules', author: 'drona23', license: 'MIT',
    url: 'https://github.com/drona23/claude-token-efficient',
    category: 'tokens', builtIn: true, rulesOnly: true,
    blurb: 'Read before writing, no re-reading, no opening or closing fluff, verify before claiming.',
  },
  {
    id: 'superpowers-brainstorming', name: 'Brainstorming (Superpowers)', author: 'Jesse Vincent (obra)', license: 'MIT',
    url: 'https://github.com/obra/superpowers',
    repo: 'obra/superpowers', commit: '5bf4e78011075bcfc0dc295f0724994cd123ee71', path: 'skills/brainstorming',
    category: 'plan',
    blurb: 'Turns a rough idea into a clear design through a few focused questions before any code.',
  },
  {
    id: 'superpowers-tdd', name: 'Test-driven development (Superpowers)', author: 'Jesse Vincent (obra)', license: 'MIT',
    url: 'https://github.com/obra/superpowers',
    repo: 'obra/superpowers', commit: '5bf4e78011075bcfc0dc295f0724994cd123ee71', path: 'skills/test-driven-development',
    category: 'build',
    blurb: 'Write the failing test first, then the code. Fewer rewrites, fewer wasted turns.',
  },
  {
    id: 'superpowers-debugging', name: 'Systematic debugging (Superpowers)', author: 'Jesse Vincent (obra)', license: 'MIT',
    url: 'https://github.com/obra/superpowers',
    repo: 'obra/superpowers', commit: '5bf4e78011075bcfc0dc295f0724994cd123ee71', path: 'skills/systematic-debugging',
    category: 'build',
    blurb: 'Find the root cause before changing code, in four steps.',
  },
  {
    id: 'context-mode', name: 'context-mode', author: 'Mert Köseoğlu (mksglu)', license: 'Elastic License 2.0',
    url: 'https://github.com/mksglu/context-mode',
    category: 'tokens', soon: true,
    blurb: 'Keeps large tool output out of the conversation. Its authors report 40–70% savings. Arrives after our license review.',
  },
]);

// Connectors with the provider's own sign-in (OAuth), like in Claude and
// ChatGPT. Listed now; each one opens once its official sign-in is wired.
export const CONNECTORS = Object.freeze([
  { id: 'github', name: 'GitHub', blurb: 'Repositories, issues and pull requests.', soon: true },
  { id: 'google-drive', name: 'Google Drive', blurb: 'Read and write your documents.', soon: true },
  { id: 'gmail', name: 'Gmail', blurb: 'Draft and search email.', soon: true },
  { id: 'notion', name: 'Notion', blurb: 'Pages and databases.', soon: true },
  { id: 'telegram', name: 'Telegram', blurb: 'Your own bots and channels.', soon: true },
  { id: 'figma', name: 'Figma', blurb: 'Designs into code.', soon: true },
]);

// The twelve boxes around the professional-account cards: what SYC-AI is
// building next. The panel counts which ones people open (a number per box,
// nothing about the person) so the most wanted one is built first.
export const IDEAS = Object.freeze([
  { id: 'image-studio', icon: 'image', title: 'Personal image studio', blurb: 'Create and edit images with every model you have, in one place.' },
  { id: 'game-config', icon: 'game', title: 'Game-making workshop', blurb: 'A ready setup of tools, skills and templates for building your own games.' },
  { id: 'student-research', icon: 'cap', title: 'Student research desk', blurb: 'Sources, notes, summaries and citations for your papers and projects.' },
  { id: 'finance-agents', icon: 'coins', title: 'Money and finance agents', blurb: 'Budgets, invoices and reports, prepared by agents you approve.' },
  { id: 'telegram-bots', icon: 'send', title: 'Smart Telegram bots', blurb: 'Bots that answer customers and sell for you — with opt-in audiences only, never spam.' },
  { id: 'network-tools', icon: 'shield', title: 'Secure connection tools', blurb: 'Private, fast network setups designed and checked with AI.' },
  { id: 'org-panel', icon: 'building', title: 'Team and company panel', blurb: 'Manage your team’s AI use, and add smart alerts to your own workplace cameras — with consent.' },
  { id: 'free-finder', icon: 'gift', title: 'Free-deal finder', blurb: 'Every day, the free credits, trials and legal discount codes that matter to you.', plus: true },
  { id: 'site-builder', icon: 'globe', title: 'One-click sites and shops', blurb: 'From an idea to a live website or store, published for you.' },
  { id: 'video-studio', icon: 'film', title: 'Short-video studio', blurb: 'Script, voice, subtitles and export for Reels, TikTok and Shorts.' },
  { id: 'docs-assistant', icon: 'doc', title: 'Documents and translation', blurb: 'Contracts, CVs, PDFs and summaries, in six languages.' },
  { id: 'daily-assistant', icon: 'sun', title: 'Daily assistant on your phone', blurb: 'Morning brief, reminders and scheduled tasks, on the phone you already linked.' },
]);
