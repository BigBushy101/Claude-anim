// Every piece of floating text in the film. All are real papers, articles or
// quotes; `url`/`note` are for verification and are never rendered.
// Placement: x = markerX(anchor) + dx (world-fixed, so the group walks past it).

export const CARDS = [
  // --- 2017-2020: the GPT lineage -------------------------------------------
  { kind: 'paper', kicker: 'Paper · 2017', title: 'Attention Is All You Need', source: 'Vaswani et al. · Google · arXiv:1706.03762',
    t0: 5.5, t1: 12.5, dx: 4, y: 5.0, z: -5, w: 9 },
  { kind: 'paper', kicker: 'Paper · 2018 · GPT-1', title: 'Improving Language Understanding by Generative Pre-Training', source: 'Radford, Narasimhan, Salimans, Sutskever · OpenAI',
    t0: 8, t1: 15.5, dx: 10, y: 7.7, z: -6, w: 10.5 },
  { kind: 'paper', kicker: 'Paper · 2019 · GPT-2', title: 'Language Models are Unsupervised Multitask Learners', source: 'Radford, Wu, Child, Luan, Amodei, Sutskever · OpenAI',
    t0: 11.5, t1: 18, dx: 6, y: 5.0, z: -5.5, w: 10.5 },
  // Optional extra (real headline, Guardian, 14 Feb 2019 — confirm wording before enabling):
  // 'New AI fake text generator may be too dangerous to release, say creators'
  { kind: 'paper', kicker: 'Paper · 2020 · GPT-3', title: 'Language Models are Few-Shot Learners', source: 'Brown et al. · OpenAI · arXiv:2005.14165',
    t0: 16, t1: 23, dx: 4, y: 7.7, z: -5, w: 9.5 },

  // --- Wall 1: "just parrots" -------------------------------------------------
  { kind: 'paper', kicker: 'Paper · 2021 · FAccT', title: 'On the Dangers of Stochastic Parrots: Can Language Models Be Too Big?', source: 'Bender, Gebru, McMillan-Major, Shmitchell',
    t0: 19, t1: 26.5, dx: -9, y: 5.0, z: -4, w: 10.5 },
  { kind: 'news', kicker: 'Essay · Nautilus · Mar 2022', title: 'Deep Learning Is Hitting a Wall', source: 'Gary Marcus · Nautilus',
    t0: 23, t1: 30, dx: -3, y: 7.7, z: -4, w: 9.5 },
  { kind: 'paper', kicker: 'Paper · 2022', title: 'Chain-of-Thought Prompting Elicits Reasoning in Large Language Models', source: 'Wei et al. · Google · arXiv:2201.11903',
    t0: 31, t1: 38, dx: 8, y: 7.7, z: -6, w: 10.5 },

  // --- Wall 2: scaling --------------------------------------------------------
  { kind: 'paper', kicker: 'Paper · 2023 · GPT-4', title: 'Sparks of Artificial General Intelligence: Early experiments with GPT-4', source: 'Bubeck et al. · Microsoft Research · arXiv:2303.12712',
    t0: 34, t1: 41, dx: 6, y: 4.8, z: -5, w: 10.5 },
  { kind: 'report', kicker: 'Open letter · Mar 2023', title: 'Pause Giant AI Experiments: An Open Letter', source: 'Future of Life Institute',
    t0: 37.5, t1: 44.5, dx: 10, y: 7.7, z: -6, w: 10 },
  { kind: 'paper', kicker: 'Paper · 2022 · Claude', title: 'Constitutional AI: Harmlessness from AI Feedback', source: 'Bai et al. · Anthropic · arXiv:2212.08073',
    t0: 41, t1: 48, dx: 4, y: 4.8, z: -5, w: 10 },
  { kind: 'paper', kicker: 'Paper · 2020', title: 'Scaling Laws for Neural Language Models', source: 'Kaplan et al. · OpenAI · arXiv:2001.08361',
    t0: 44.5, t1: 51, dx: -3, y: 7.7, z: -4, w: 9.5 },
  { kind: 'paper', kicker: 'Paper · 2022 · Chinchilla', title: 'Training Compute-Optimal Large Language Models', source: 'Hoffmann et al. · DeepMind · arXiv:2203.15556',
    t0: 47, t1: 53.5, dx: -9, y: 4.8, z: -4, w: 9.5 },

  // --- Wall 3: out of data ----------------------------------------------------
  { kind: 'paper', kicker: 'Paper · Epoch AI · 2022 / 2024', title: 'Will we run out of data? Limits of LLM scaling based on human-generated data', source: 'Villalobos et al. · arXiv:2211.04325',
    t0: 58, t1: 66, dx: 8, y: 5.8, z: -6, w: 11,
    note: 'Verified against arXiv listing; v1 (Oct 2022) used an earlier subtitle, this is the current title' },
  { kind: 'news', kicker: 'Headline · Bloomberg · Nov 2024', title: 'OpenAI, Google and Anthropic Are Struggling to Build More Advanced AI', source: 'Bloomberg',
    t0: 68, t1: 76, dx: -14, y: 4.8, z: -4, w: 10.5 },
  { kind: 'news', kicker: 'Headline · Reuters · Nov 2024', title: 'OpenAI and others seek new path to smarter AI as current methods hit limitations', source: 'Reuters',
    note: 'Verified via syndicated copies (11 Nov 2024); some copies carry the later variant "OpenAI and rivals seek new path…"',
    t0: 71, t1: 79, dx: -9, y: 7.7, z: -4, w: 10.5 },
  { kind: 'quote', kicker: 'Keynote · NeurIPS · Dec 2024', title: '“Pre-training as we know it will unquestionably end.”', source: 'Ilya Sutskever',
    t0: 75, t1: 82, dx: -5, y: 4.8, z: -5, w: 8 },

  // --- Wall 4: can't reason ---------------------------------------------------
  { kind: 'paper', kicker: 'Paper · 2025 · DeepSeek', title: 'DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning', source: 'DeepSeek-AI · arXiv:2501.12948',
    t0: 83, t1: 93, dx: 9, y: 5.6, z: -6, w: 11 },
  { kind: 'paper', kicker: 'Paper · Apple · 2025', title: 'The Illusion of Thinking: Understanding the Strengths and Limitations of Reasoning Models via the Lens of Problem Complexity', source: 'Shojaee et al. · Apple',
    t0: 92, t1: 101, dx: -4, y: 7.6, z: -4.5, w: 12 },
  { kind: 'news', kicker: 'Announcement · Google DeepMind · Jul 2025', title: 'Advanced version of Gemini with Deep Think officially achieves gold-medal standard at the International Mathematical Olympiad', source: 'Google DeepMind · IMO 2025',
    t0: 103.5, t1: 115, dx: 6, y: 7.7, z: -6, w: 12,
    note: 'OpenAI announced a gold-level IMO result in the same week — confirm which headline to show' },

  // --- Wall 5: benchmarks -----------------------------------------------------
  { kind: 'paper', kicker: 'Benchmark · 2025', title: 'Humanity’s Last Exam', source: 'Center for AI Safety & Scale AI · arXiv:2501.14249',
    t0: 108.5, t1: 120, dx: 10, y: 4.8, z: -5, w: 9 },
  { kind: 'news', kicker: 'Report · ARC Prize · Dec 2024', title: 'OpenAI o3 Breakthrough High Score on ARC-AGI-Pub', source: 'ARC Prize',
    t0: 115, t1: 124, dx: 4, y: 7.7, z: -5, w: 10.5 },

  // --- The last wall ----------------------------------------------------------
  { kind: 'quote', kicker: 'I. J. Good · 1965', title: '“…the first ultraintelligent machine is the last invention that man need ever make, provided that the machine is docile enough to tell us how to keep it under control.”', source: 'Speculations Concerning the First Ultraintelligent Machine',
    t0: 134, t1: 147, dx: 10, y: 8.6, z: -6, w: 13 },
  { kind: 'report', kicker: 'Report · 2025', title: 'AI 2027', source: 'Kokotajlo, Alexander, Larsen, Lifland, Dean',
    t0: 140, t1: 151, dx: 8, y: 5.0, z: -6, w: 7 },
  { kind: 'paper', kicker: 'Paper · 2025', title: 'Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents', source: 'Zhang et al. · Sakana AI · UBC',
    t0: 152, t1: 161, dx: -9, y: 12, z: -9, w: 12 },
  { kind: 'paper', kicker: 'Paper · 2025', title: 'AlphaEvolve: A coding agent for scientific and algorithmic discovery', source: 'Google DeepMind',
    t0: 162, t1: 171, dx: -10, y: 14, z: -9, w: 12 },
];
