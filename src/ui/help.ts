// Help page — explains what mAInifold is and how to use it

export interface HelpCallbacks {
  onBack: () => void;
}

export function createHelpPage(
  container: HTMLElement,
  callbacks: HelpCallbacks,
): HTMLElement {
  const page = document.createElement('div');
  page.id = 'help-page';
  page.className = 'flex flex-col items-center w-full h-full overflow-auto bg-zinc-900 text-zinc-100';

  const content = document.createElement('div');
  content.className = 'max-w-2xl w-full px-6 py-12';

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'text-xs text-zinc-500 hover:text-zinc-300 mb-8 transition-colors';
  backBtn.textContent = '\u2190 Back';
  backBtn.addEventListener('click', callbacks.onBack);
  content.appendChild(backBtn);

  // Title
  const title = document.createElement('h1');
  title.className = 'text-2xl font-bold mb-6';
  title.innerHTML = 'How m<span class="text-blue-400">AI</span>nifold works';
  content.appendChild(title);

  // Sections
  const sections: { heading: string; body: string }[] = [
    {
      heading: 'What is mAInifold?',
      body: 'mAInifold is a browser-based parametric CAD tool powered by <a href="https://github.com/elalish/manifold" class="text-blue-400 hover:underline">manifold-3d</a> (compiled to WebAssembly). You write JavaScript code that constructs 3D geometry using boolean operations (union, subtract, intersect), and the result renders live in the viewport.',
    },
    {
      heading: 'The editor',
      body: 'The left pane is a code editor. Your code receives an <code class="text-emerald-400 bg-zinc-800 px-1 rounded">api</code> object with <code class="text-emerald-400 bg-zinc-800 px-1 rounded">Manifold</code> and <code class="text-emerald-400 bg-zinc-800 px-1 rounded">CrossSection</code> constructors. Your code must <code class="text-emerald-400 bg-zinc-800 px-1 rounded">return</code> a Manifold object. The right pane shows a live 3D viewport, plus isometric views, elevation comparisons, and a version gallery.',
    },
    {
      heading: 'Building geometry',
      body: 'Start with primitives like <code class="text-emerald-400 bg-zinc-800 px-1 rounded">Manifold.cube()</code>, <code class="text-emerald-400 bg-zinc-800 px-1 rounded">Manifold.cylinder()</code>, or <code class="text-emerald-400 bg-zinc-800 px-1 rounded">Manifold.sphere()</code>. Combine them with boolean operations: <code class="text-emerald-400 bg-zinc-800 px-1 rounded">.add()</code> (union), <code class="text-emerald-400 bg-zinc-800 px-1 rounded">.subtract()</code>, <code class="text-emerald-400 bg-zinc-800 px-1 rounded">.intersect()</code>. Apply transforms like <code class="text-emerald-400 bg-zinc-800 px-1 rounded">.translate()</code>, <code class="text-emerald-400 bg-zinc-800 px-1 rounded">.rotate()</code>, and <code class="text-emerald-400 bg-zinc-800 px-1 rounded">.scale()</code>. All transforms return new objects — originals are unchanged.',
    },
    {
      heading: 'Sessions & versions',
      body: 'Sessions track design iterations. Create a session, save versions as you iterate, and compare them side-by-side in the Gallery tab. Each version captures the code, a thumbnail, and geometry stats (volume, dimensions, manifold validity). This makes it easy to experiment and backtrack.',
    },
    {
      heading: 'Exporting',
      body: 'Export your geometry as GLB, STL, OBJ, or 3MF using the Export dropdown in the toolbar. GLB is recommended for most uses.',
    },
    {
      heading: 'AI agent workflow',
      body: 'mAInifold is designed to be driven by AI agents. An agent navigates to the app, writes geometry code, and uses the <code class="text-emerald-400 bg-zinc-800 px-1 rounded">window.mainifold</code> console API to create sessions, run code, validate results, and save versions — all programmatically. The agent can produce a gallery URL for human review. <a href="/mainifold/ai.md" class="text-blue-400 hover:underline">Full agent instructions \u2192</a>',
    },
    {
      heading: 'Quick example',
      body: '<pre class="bg-zinc-800 rounded-lg p-4 text-xs leading-relaxed overflow-x-auto mt-2"><code class="text-zinc-300">const { Manifold } = api;\n\n// Create a box and subtract a cylinder\nconst box = Manifold.cube([20, 20, 10], true);\nconst hole = Manifold.cylinder(12, 4, 4, 32);\n\nreturn box.subtract(hole);</code></pre>',
    },
  ];

  for (const section of sections) {
    const h = document.createElement('h2');
    h.className = 'text-sm font-semibold text-zinc-300 uppercase tracking-wide mt-8 mb-3';
    h.textContent = section.heading;
    content.appendChild(h);

    const p = document.createElement('div');
    p.className = 'text-sm text-zinc-400 leading-relaxed';
    p.innerHTML = section.body;
    content.appendChild(p);
  }

  // Footer with agent link
  const footer = document.createElement('div');
  footer.className = 'mt-12 pt-6 border-t border-zinc-800 text-xs text-zinc-600';
  footer.innerHTML = 'Full AI agent documentation: <a href="/mainifold/ai.md" class="text-zinc-500 hover:text-zinc-300 transition-colors">/ai.md</a>';
  content.appendChild(footer);

  page.appendChild(content);
  container.appendChild(page);
  return page;
}
