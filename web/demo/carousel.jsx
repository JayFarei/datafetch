/* eslint-disable react/no-unknown-property */
/* global React */

// ─── SHARED PRIMITIVES ────────────────────────────────────────────
const { useState, useEffect, useRef, useMemo } = React;

// ─── TREE — clickable file rows ──────────────────────────────────
function TreeLn({ display, path, tag, dim, bright, active, fresh, isNew, isOpen, isDir, onOpen }) {
  const clickable = !!onOpen && !!path;
  const cls = [
    'ln',
    bright || isOpen ? 'bright' : '',
    isOpen ? 'is-open' : (active ? 'active' : ''),
    fresh ? 'fresh' : '',
    clickable ? 'clickable' : '',
    isDir ? 'is-dir' : '',
  ].filter(Boolean).join(' ');
  const handle = clickable ? () => onOpen(path) : undefined;
  return (
    <div
      className={cls}
      onClick={handle}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle(); } } : undefined}
    >
      <span className="path">{display}</span>
      {isOpen && <span className="open-dot">●</span>}
      {tag && <span className={'tag' + (isNew ? ' new' : '')}>{isNew ? '+ new' : tag}</span>}
    </div>
  );
}

// Builds the tree's children. `activeSet` is the union of all focused paths
// up through the current beat (so files light up as the script touches them).
function buildTree({ activeSet, newPaths, showHelpers, dfd, resultBright, resultTag, openFile, onOpen }) {
  const A = activeSet;
  const NP = new Set(newPaths || []);
  const isOpen = (p) => openFile === p;
  const isActive = (p) => A.has(p);

  return (
    <React.Fragment>
      <TreeLn display="├ AGENTS.md" path="AGENTS.md" tag="core" dim={!isActive('AGENTS.md')} active={isActive('AGENTS.md')} bright={isActive('AGENTS.md')} isOpen={isOpen('AGENTS.md')} onOpen={onOpen} />
      <TreeLn display="├ df.d.ts"   path="df.d.ts"   tag={dfd || 'types'} dim={!isActive('df.d.ts')} active={isActive('df.d.ts')} bright={isActive('df.d.ts')} isOpen={isOpen('df.d.ts')} onOpen={onOpen} />
      <TreeLn display="├ db/"       isDir tag="immutable" active={isActive('db/')} bright={isActive('db/')} />
      <TreeLn display="│   ├ vendors.ts"     path="db/vendors.ts"     active={isActive('db/vendors.ts')}     bright={isActive('db/vendors.ts')}     isOpen={isOpen('db/vendors.ts')}     onOpen={onOpen} />
      <TreeLn display="│   ├ incidents.ts"   path="db/incidents.ts"   active={isActive('db/incidents.ts')}   bright={isActive('db/incidents.ts')}   isOpen={isOpen('db/incidents.ts')}   onOpen={onOpen} />
      <TreeLn display="│   ├ contracts.ts"   path="db/contracts.ts"   active={isActive('db/contracts.ts')}   bright={isActive('db/contracts.ts')}   isOpen={isOpen('db/contracts.ts')}   onOpen={onOpen} />
      <TreeLn display="│   ├ disclosures.ts" path="db/disclosures.ts" active={isActive('db/disclosures.ts')} bright={isActive('db/disclosures.ts')} isOpen={isOpen('db/disclosures.ts')} onOpen={onOpen} />
      <TreeLn display="│   └ filings.ts"     path="db/filings.ts"     active={isActive('db/filings.ts')}     bright={isActive('db/filings.ts')}     isOpen={isOpen('db/filings.ts')}     onOpen={onOpen} />
      <TreeLn display="├ lib/"                isDir tag={showHelpers ? 'tenant · v1' : 'tenant · empty'} dim={!showHelpers && !isActive('lib/')} active={isActive('lib/')} bright={(showHelpers && !isActive('lib/')) || isActive('lib/')} />
      {showHelpers && (
        <React.Fragment>
          <TreeLn display="│   ├ assessVendorRisk.ts"
                  path="lib/assessVendorRisk.ts"
                  tag={NP.has('lib/assessVendorRisk.ts') ? 'new' : 'helper'}
                  isNew={NP.has('lib/assessVendorRisk.ts')}
                  fresh={NP.has('lib/assessVendorRisk.ts')}
                  active={isActive('lib/assessVendorRisk.ts')}
                  bright
                  isOpen={isOpen('lib/assessVendorRisk.ts')}
                  onOpen={onOpen} />
          <TreeLn display="│   ├ explainVendorRisk.ts"
                  path="lib/explainVendorRisk.ts"
                  tag={NP.has('lib/explainVendorRisk.ts') ? 'new' : 'helper'}
                  isNew={NP.has('lib/explainVendorRisk.ts')}
                  fresh={NP.has('lib/explainVendorRisk.ts')}
                  bright
                  isOpen={isOpen('lib/explainVendorRisk.ts')}
                  onOpen={onOpen} />
          <TreeLn display="│   └ compareVendorRisk.ts"
                  path="lib/compareVendorRisk.ts"
                  tag={NP.has('lib/compareVendorRisk.ts') ? 'new' : 'helper'}
                  isNew={NP.has('lib/compareVendorRisk.ts')}
                  fresh={NP.has('lib/compareVendorRisk.ts')}
                  bright
                  isOpen={isOpen('lib/compareVendorRisk.ts')}
                  onOpen={onOpen} />
        </React.Fragment>
      )}
      <TreeLn display="├ scripts/" isDir />
      <TreeLn display="│   ├ scratch.ts" path="scripts/scratch.ts" active={isActive('scripts/scratch.ts')} bright={isActive('scripts/scratch.ts')} isOpen={isOpen('scripts/scratch.ts')} onOpen={onOpen} />
      <TreeLn display="│   └ answer.ts" path="scripts/answer.ts"  tag="this intent" active={isActive('scripts/answer.ts')} bright={isActive('scripts/answer.ts')} isOpen={isOpen('scripts/answer.ts')} onOpen={onOpen} />
      <TreeLn display="└ result/" path="result/" tag={resultTag || 'sealed'} dim={!resultBright} bright={resultBright || isActive('result/')} active={isActive('result/')} isOpen={isOpen('result/')} onOpen={onOpen} />
    </React.Fragment>
  );
}

// ─── TRAJECTORY ROW ──────────────────────────────────────────────
function TrajRow({ row, animate }) {
  const cls = ['traj-row', row.kind, row.nested ? 'nested' : '', animate ? 'just-in' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <span className="op">{row.op}</span>
      <span className="call">{row.children}</span>
    </div>
  );
}

// ─── STAT TILE ───────────────────────────────────────────────────
function Stat({ v, sub, k, ok }) {
  return (
    <div className="foot-stat">
      <div className={'v' + (ok ? ' ok' : '')}>{v}{sub && <sub> {sub}</sub>}</div>
      <div className="k">{k}</div>
    </div>
  );
}

// ─── SLIDE BEAT helpers ─────────────────────────────────────────
// Console line helpers. `pr` = prompt; `dim`, `ok`, etc. styled spans.
const T = {
  // a prompt line: "$ command"
  $: (...children) => (
    <div className="t-line">
      <span className="pr">$</span>{' '}
      {children.map((c, i) => <React.Fragment key={i}>{c}</React.Fragment>)}
    </div>
  ),
  // a generic line
  l: (cls, ...children) => (
    <div className={'t-line ' + (cls || '')}>
      {children.map((c, i) => <React.Fragment key={i}>{c}</React.Fragment>)}
    </div>
  ),
};

// ─── SLIDES ──────────────────────────────────────────────────────
// Each slide has a timeline of "beats". A beat = one tick of the script.
// Beats append lines to the console, may focus files, may add traj rows.
// Stats, code in editor, and tree skeleton stay static for the slide.
//
// In manual mode (paused), the slide renders fully (all beats applied).
// In play mode, beats reveal one at a time.

const SLIDES = [
  // ═══════════════ /00 INIT ═══════════════════════════════════
  {
    stage: '/00', short: 'init',
    eyebrow: '/00 — workspace · cold start',
    title: <>The cold start. <span className="dim">/ Nothing learned yet.</span></>,
    intent: {
      who: 'tenant · day 0',
      body: <>datafetch init <span style={{color:'var(--hl-flag)'}}>--tenant</span> acme-procurement <span style={{color:'var(--hl-flag)'}}>--dataset</span> vendors <span style={{color:'var(--hl-flag)'}}>--intent</span> <span style={{color:'var(--hl-str)'}}>"assess vendor risk"</span></>,
    },
    defaultOpen: 'AGENTS.md',
    treeState: { showHelpers: false, resultTag: 'empty', resultBright: false },
    treeRight: 'v0 · empty lib',
    consoleRight: '/02 mount',
    answerSrc: (
      <div className="code">
<span className="cm">// scripts/answer.ts</span>{'\n'}
<span className="cm">// nothing here yet — the agent</span>{'\n'}
<span className="cm">// will compose the first program</span>{'\n'}
<span className="cm">// in the next step.</span>{'\n'}
{'\n'}
<span className="empty">  ⌁ workspace ready</span>{'\n'}
<span className="empty">  ⌁ df.db typed</span>{'\n'}
<span className="empty">  ⌁ df.lib empty</span>{'\n'}
<span className="empty">  ⌁ awaiting intent…</span>
      </div>
    ),
    trajRight: 'pending',
    stats: [
      { v: '0', sub: 'calls', k: 'trajectory' },
      { v: '—', k: 'cost' },
      { v: '⌁', k: 'init' },
    ],
    beats: [
      {
        lines: <>{T.$(<>datafetch mount</>)}{T.l('dim', '  ok · /mnt/vendors mounted')}</>,
        ms: 700,
      },
      {
        lines: <>{T.$(<>cat AGENTS.md</>)}{T.l('dim', '  intent: assess vendor risk')}</>,
        focus: ['AGENTS.md'], ms: 800,
      },
      {
        lines: <>{T.$(<>ls db</>)}{T.l('dim', '  vendors.ts  incidents.ts  contracts.ts  disclosures.ts  filings.ts')}</>,
        focus: ['db/'], ms: 900,
      },
      {
        lines: <>{T.$(<>ls lib</>)}{T.l('dim', '  (empty · no tenant helpers yet)')}</>,
        focus: ['lib/'], ms: 800,
      },
      {
        lines: <>{T.$(<>datafetch apropos <span className="st">"vendor risk"</span></>)}{T.l('dim', '  0 helpers · 5 db primitives')}</>,
        ms: 1000,
      },
    ],
    holdMs: 1200,
  },

  // ═══════════════ /01 FIND HIGH-RISK ═════════════════════════
  {
    stage: '/01', short: 'find',
    eyebrow: '/01 — intent one · cold composition',
    title: <>Find high-risk vendors.</>,
    intent: { who: 'tenant · prompt', body: 'Which vendors look high risk this quarter?' },
    defaultOpen: 'scripts/answer.ts',
    treeState: { showHelpers: false, resultBright: true, resultTag: '◆ a7f3' },
    treeRight: '2 reads · 1 compute',
    consoleRight: 'exploration',
    answerSrc: (
      <div className="code">
<span className="gut">1</span><span className="kw">const</span> <span className="nm">vendors</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">db</span>.<span className="fn">vendors</span>.<span className="nm">search</span>({'\n'}
<span className="gut">2</span>  <span className="st">"active strategic vendors"</span>, {'{'} limit: <span className="ok">50</span> {'}'});{'\n'}
<span className="gut">3</span>{'\n'}
<span className="gut">4</span><span className="kw">const</span> <span className="nm">incidents</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">db</span>.<span className="fn">incidents</span>.<span className="nm">search</span>({'\n'}
<span className="gut">5</span>  <span className="st">"security breach outage"</span>, {'{'} limit: <span className="ok">100</span> {'}'});{'\n'}
<span className="gut">6</span>{'\n'}
<span className="gut">7</span><span className="kw">const</span> <span className="nm">scored</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">lib</span>.<span className="fn">rankVendorRisk</span>({'{'}{'\n'}
<span className="gut">8</span>  vendors, incidents,{'\n'}
<span className="gut">9</span>  criteria: [<span className="st">"security"</span>, <span className="st">"legal"</span>, <span className="st">"operational"</span>],{'\n'}
<span className="gut">10</span>{'}'});{'\n'}
<span className="gut">11</span>{'\n'}
<span className="gut">12</span><span className="kw">return</span> <span className="id">df</span>.<span className="fn">answer</span>({'{'}{'\n'}
<span className="gut">13</span>  status: <span className="st">"answered"</span>,{'\n'}
<span className="gut">14</span>  value: scored.value.topRisks,{'\n'}
<span className="gut">15</span>  evidence: scored.value.evidence,{'\n'}
<span className="gut">16</span>{'}'});
      </div>
    ),
    trajRight: 'typed cognition',
    stats: [
      { v: '4', sub: 'calls', k: 'trajectory' },
      { v: '3.4', sub: 'k tok', k: 'cost' },
      { v: '◆', sub: 'a7f3', k: 'sealed' },
    ],
    beats: [
      { lines: <>{T.$(<>datafetch apropos <span className="st">"vendor risk"</span></>)}{T.l('dim', '  no tenant helpers · using db primitives')}</>, focus: ['lib/'], ms: 800 },
      { lines: <>{T.$(<>nvim scripts/scratch.ts</>)}</>, focus: ['scripts/scratch.ts'], ms: 700 },
      { lines: <>{T.$(<>datafetch run scripts/scratch.ts</>)}{T.l('dim', '  probing · df.db.vendors')}</>, focus: ['db/vendors.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.vendors</span>.search(<span className="dim">…</span>)</> }, ms: 700 },
      { lines: <>{T.l('dim', '  probing · df.db.incidents')}</>, focus: ['db/vendors.ts', 'db/incidents.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.incidents</span>.search(<span className="dim">…</span>)</> }, ms: 700 },
      { lines: <>{T.l('ok', '  ok · 50 vendors · 100 incidents')}</>, traj: { op: 'comp', kind: 'c', children: <><span className="id">df.lib.rankVendorRisk</span>(<span className="dim">…</span>)</> }, ms: 700 },
      { lines: <>{T.$(<>datafetch seal scripts/answer.ts</>)}</>, focus: ['scripts/answer.ts'], traj: { op: 'write', kind: 'w', children: <><span className="id">df.answer</span>(<span className="dim">…</span>)</> }, ms: 700 },
      { lines: <>{T.l('ok', '  ◆ sealed · a7f3')}</>, focus: ['result/', 'scripts/answer.ts'], ms: 800 },
    ],
    holdMs: 1500,
  },

  // ═══════════════ /02 EXPLAIN ═══════════════════════════════
  {
    stage: '/02', short: 'explain',
    eyebrow: '/02 — intent two · discovery first',
    title: <>Explain one vendor.</>,
    intent: { who: 'tenant · prompt', body: 'Why is Northwind ranked high risk?' },
    defaultOpen: 'scripts/answer.ts',
    treeState: { showHelpers: false, resultBright: true, resultTag: '◆ b021' },
    treeRight: '+ contracts',
    consoleRight: 'discover prior work',
    answerSrc: (
      <div className="code">
<span className="gut">1</span><span className="kw">const</span> <span className="nm">vendor</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">db</span>.<span className="fn">vendors</span>.<span className="nm">findExact</span>({'\n'}
<span className="gut">2</span>  {'{'} name: <span className="st">"Northwind"</span> {'}'}, <span className="ok">1</span>);{'\n'}
<span className="gut">3</span>{'\n'}
<span className="gut">4</span><span className="kw">const</span> <span className="nm">incidents</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">db</span>.<span className="fn">incidents</span>.<span className="nm">search</span>({'\n'}
<span className="gut">5</span>  <span className="st">"Northwind security outage"</span>, {'{'} limit: <span className="ok">25</span> {'}'});{'\n'}
<span className="gut">6</span>{'\n'}
<span className="gut">7</span><span className="kw">const</span> <span className="nm">contracts</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">db</span>.<span className="fn">contracts</span>.<span className="nm">search</span>({'\n'}
<span className="gut">8</span>  <span className="st">"Northwind active obligations"</span>, {'{'} limit: <span className="ok">25</span> {'}'});{'\n'}
<span className="gut">9</span>{'\n'}
<span className="gut">10</span><span className="kw">const</span> <span className="nm">explanation</span> = <span className="kw">await</span>{'\n'}
<span className="gut">11</span>  <span className="id">df</span>.<span className="id">lib</span>.<span className="fn">explainVendorRisk</span>({'{'}{'\n'}
<span className="gut">12</span>    vendor: vendor[<span className="ok">0</span>], incidents, contracts,{'\n'}
<span className="gut">13</span>  {'}'});{'\n'}
<span className="gut">14</span>{'\n'}
<span className="gut">15</span><span className="kw">return</span> <span className="id">df</span>.<span className="fn">answer</span>({'{'}{'\n'}
<span className="gut">16</span>  status: <span className="st">"answered"</span>,{'\n'}
<span className="gut">17</span>  value: explanation.value.summary,{'\n'}
<span className="gut">18</span>  evidence: explanation.value.evidence,{'\n'}
<span className="gut">19</span>{'}'});
      </div>
    ),
    trajRight: '+ contracts read',
    stats: [
      { v: '5', sub: 'calls', k: 'trajectory' },
      { v: '3.9', sub: 'k tok', k: 'cost' },
      { v: '◆', sub: 'b021', k: 'sealed' },
    ],
    beats: [
      { lines: <>{T.$(<>datafetch graph result/HEAD</>)}{T.l('dim', '  vendors → incidents → rank → answer')}</>, focus: ['result/'], ms: 800 },
      { lines: <>{T.$(<>datafetch refs <span className="id">rankVendorRisk</span></>)}{T.l('dim', '  /result/a7f3/source.ts:8')}</>, ms: 700 },
      { lines: <>{T.$(<>datafetch man <span className="id">rankVendorRisk</span></>)}{T.l('dim', '  covers: security · legal · operational')}</>, ms: 800 },
      { lines: <>{T.$(<>nvim scripts/answer.ts</>)}</>, focus: ['scripts/answer.ts'], ms: 600 },
      { lines: <>{T.$(<>datafetch run scripts/answer.ts</>)}{T.l('dim', '  probing · vendors.findExact')}</>, focus: ['db/vendors.ts', 'scripts/answer.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.vendors</span>.findExact(<span className="dim">…</span>)</> }, ms: 600 },
      { lines: <>{T.l('dim', '  probing · incidents.search')}</>, focus: ['db/vendors.ts', 'db/incidents.ts', 'scripts/answer.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.incidents</span>.search(<span className="dim">…</span>)</> }, ms: 600 },
      { lines: <>{T.l('dim', '  probing · contracts.search')}</>, focus: ['db/vendors.ts', 'db/incidents.ts', 'db/contracts.ts', 'scripts/answer.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.contracts</span>.search(<span className="dim">…</span>)</> }, ms: 600 },
      { lines: <>{T.l('ok', '  ok · explanation drafted')}</>, traj: { op: 'comp', kind: 'c', children: <><span className="id">df.lib.explainVendorRisk</span>(<span className="dim">…</span>)</> }, ms: 700 },
      { lines: <>{T.$(<>datafetch seal scripts/answer.ts</>)}{T.l('ok', '  ◆ sealed · b021')}</>, traj: { op: 'write', kind: 'w', children: <><span className="id">df.answer</span>(<span className="dim">…</span>)</> }, ms: 800 },
    ],
    holdMs: 1500,
  },

  // ═══════════════ /03 COMPARE ═══════════════════════════════
  {
    stage: '/03', short: 'compare',
    eyebrow: '/03 — intent three · pattern emerges',
    title: <>Compare two vendors. <span className="dim">/ shape repeats.</span></>,
    intent: { who: 'tenant · prompt', body: 'Compare Northwind and Contoso on operational risk.' },
    defaultOpen: 'scripts/answer.ts',
    treeState: { showHelpers: false, resultBright: true, resultTag: '◆ c4d2' },
    treeRight: 'same vocabulary',
    consoleRight: 'recurring shape',
    answerSrc: (
      <div className="code">
<span className="gut">1</span><span className="kw">const</span> <span className="nm">vendors</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">db</span>.<span className="fn">vendors</span>.<span className="nm">findExact</span>({'\n'}
<span className="gut">2</span>  {'{'} name: [<span className="st">"Northwind"</span>, <span className="st">"Contoso"</span>] {'}'}, <span className="ok">2</span>);{'\n'}
<span className="gut">3</span>{'\n'}
<span className="gut">4</span><span className="kw">const</span> <span className="nm">incidents</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">db</span>.<span className="fn">incidents</span>.<span className="nm">search</span>({'\n'}
<span className="gut">5</span>  <span className="st">"outage SLA breach"</span>, {'{'} limit: <span className="ok">50</span> {'}'});{'\n'}
<span className="gut">6</span>{'\n'}
<span className="gut">7</span><span className="kw">const</span> <span className="nm">contracts</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">db</span>.<span className="fn">contracts</span>.<span className="nm">search</span>({'\n'}
<span className="gut">8</span>  <span className="st">"active SLA"</span>, {'{'} limit: <span className="ok">50</span> {'}'});{'\n'}
<span className="gut">9</span>{'\n'}
<span className="gut">10</span><span className="kw">const</span> <span className="nm">comparison</span> = <span className="kw">await</span>{'\n'}
<span className="gut">11</span>  <span className="id">df</span>.<span className="id">lib</span>.<span className="fn">compareVendorRisk</span>({'{'}{'\n'}
<span className="gut">12</span>    vendors, incidents, contracts,{'\n'}
<span className="gut">13</span>    dimension: <span className="st">"operational"</span>,{'\n'}
<span className="gut">14</span>  {'}'});{'\n'}
<span className="gut">15</span>{'\n'}
<span className="gut">16</span><span className="kw">return</span> <span className="id">df</span>.<span className="fn">answer</span>({'{'}{'\n'}
<span className="gut">17</span>  status: <span className="st">"answered"</span>,{'\n'}
<span className="gut">18</span>  value: comparison.value,{'\n'}
<span className="gut">19</span>  evidence: comparison.value.evidence,{'\n'}
<span className="gut">20</span>{'}'});
      </div>
    ),
    trajRight: '3× same shape',
    stats: [
      { v: '5', sub: 'calls', k: 'trajectory' },
      { v: '4.1', sub: 'k tok', k: 'cost' },
      { v: '◆', sub: 'c4d2', k: 'sealed' },
    ],
    beats: [
      { lines: <>{T.$(<>datafetch symbols</>)}{T.l('dim', '  df.db.vendors     3× used')}{T.l('dim', '  df.db.incidents   3× used')}{T.l('dim', '  df.db.contracts   2× used')}</>, ms: 1000 },
      { lines: <>{T.$(<>datafetch apropos <span className="st">"vendor risk"</span></>)}{T.l('dim', '  3 trajectories share shape')}</>, ms: 800 },
      { lines: <>{T.$(<>nvim scripts/answer.ts</>)}</>, focus: ['scripts/answer.ts'], ms: 600 },
      { lines: <>{T.$(<>datafetch run scripts/answer.ts</>)}</>, focus: ['scripts/answer.ts', 'db/vendors.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.vendors</span>.findExact(<span className="dim">…</span>)</> }, ms: 600 },
      { focus: ['scripts/answer.ts', 'db/vendors.ts', 'db/incidents.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.incidents</span>.search(<span className="dim">…</span>)</> }, ms: 500 },
      { focus: ['scripts/answer.ts', 'db/vendors.ts', 'db/incidents.ts', 'db/contracts.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.contracts</span>.search(<span className="dim">…</span>)</> }, ms: 500 },
      { lines: <>{T.l('ok', '  ok · comparison drafted')}</>, traj: { op: 'comp', kind: 'c', children: <><span className="id">df.lib.compareVendorRisk</span>(<span className="dim">…</span>)</> }, ms: 600 },
      { lines: <>{T.$(<>datafetch seal scripts/answer.ts</>)}{T.l('ok', '  ◆ sealed · c4d2')}</>, traj: { op: 'write', kind: 'w', children: <><span className="id">df.answer</span>(<span className="dim">…</span>)</> }, ms: 700 },
      { lines: <>{T.l('cm', '  observer: shape-stable · candidate for promote')}</>, ms: 1200 },
    ],
    holdMs: 1600,
  },

  // ═══════════════ /⬢ CRYSTALLISATION ═════════════════════════
  {
    stage: '/⬢', short: 'crystallise', isCryst: true,
    eyebrow: '/ ⬢ — crystallisation · /05 optimise',
    title: <>Promote the workflow. <span className="dim">/ <code>df.lib</code> grows.</span></>,
    intent: {
      who: 'provider · auto-promotion',
      fromProvider: true,
      body: 'Three trajectories converged on the same shape. Lifting stable subprograms into the tenant library.',
    },
    defaultOpen: 'df.d.ts',
    treeState: {
      showHelpers: true,
      newPaths: ['lib/assessVendorRisk.ts', 'lib/explainVendorRisk.ts', 'lib/compareVendorRisk.ts'],
      dfd: 'v0 → v1',
    },
    treeRight: '+ 3 helpers',
    consoleRight: 'replay verified',
    answerSrc: (
      <div className="code">
<span className="cm">// scripts/answer.ts — last sealed: c4d2 (compare)</span>{'\n'}
<span className="cm">// crystallisation is a provider-side step.</span>{'\n'}
<span className="cm">// no new intent-level program here.</span>{'\n'}
{'\n'}
<span className="empty">  ⌁ helpers promoted into lib/</span>{'\n'}
<span className="empty">  ⌁ df.d.ts regenerated v0 → v1</span>{'\n'}
<span className="empty">  ⌁ replay verified 3/3</span>{'\n'}
<span className="empty">  ⌁ next intent will warm-reuse</span>
      </div>
    ),
    trajRight: 'no new path — meta',
    stats: [
      { v: '3', sub: 'helpers', k: 'lifted', ok: true },
      { v: '3 / 3', k: 'replay verified', ok: true },
      { v: 'v1', k: 'df.d.ts', ok: true },
    ],
    beats: [
      { lines: <>{T.$(<>datafetch promote <span className="fl">--family</span> vendor-risk</>)}{T.l('dim', '  observed 3 trajectories ≥ shape-stable')}</>, ms: 1000 },
      { lines: <>{T.l('ok', '  ◆ lifted · assessVendorRisk')}</>, focus: ['lib/', 'lib/assessVendorRisk.ts'], traj: { op: 'obs', kind: 'c', children: <><span className="id">df.observe</span>(<span className="st">"vendor-risk"</span>, 3 trajectories)</> }, ms: 700 },
      { lines: <>{T.l('ok', '  ◆ lifted · explainVendorRisk')}</>, focus: ['lib/', 'lib/assessVendorRisk.ts', 'lib/explainVendorRisk.ts'], ms: 600 },
      { lines: <>{T.l('ok', '  ◆ lifted · compareVendorRisk')}</>, focus: ['lib/', 'lib/assessVendorRisk.ts', 'lib/explainVendorRisk.ts', 'lib/compareVendorRisk.ts'], traj: { op: 'lift', kind: 'c', children: <><span className="id">df.promote</span>({'{'}<span className="dim">family: </span><span className="st">"vendor-risk"</span>{'}'})</> }, ms: 700 },
      { lines: <>{T.l('dim', '  replay · 3/3 · evidence preserved')}</>, ms: 700 },
      { lines: <>{T.$(<>datafetch regen df.d.ts</>)}{T.l('ok', '  ok · types updated · v0 → v1')}</>, focus: ['df.d.ts', 'lib/'], traj: { op: 'regen', kind: 'w', children: <><span className="id">df.regenTypes</span>(<span className="dim">df.d.ts · v0 → v1</span>)</> }, ms: 900 },
      { lines: <>{T.$(<>datafetch man <span className="id">assessVendorRisk</span></>)}{T.l('dim', '  intent · dim(security|legal|operational|financial)')}</>, ms: 1000 },
    ],
    holdMs: 1800,
  },

  // ═══════════════ /04 WARM REUSE ═════════════════════════════
  {
    stage: '/04', short: 'reuse',
    eyebrow: '/04 — intent four · warm reuse',
    title: <>Reuse the helper.</>,
    intent: { who: 'tenant · prompt', body: 'Give me the top three vendors most exposed to security risk, with reasons.' },
    defaultOpen: 'scripts/answer.ts',
    treeState: { showHelpers: true },
    treeRight: 'helper does the work',
    consoleRight: 'helper found',
    answerSrc: (
      <div className="code">
<span className="gut">1</span><span className="kw">const</span> <span className="nm">out</span> = <span className="kw">await</span>{'\n'}
<span className="gut">2</span>  <span className="id">df</span>.<span className="id">lib</span>.<span className="fn">assessVendorRisk</span>({'{'}{'\n'}
<span className="gut">3</span>    intent: <span className="st">"top vendors by security risk"</span>,{'\n'}
<span className="gut">4</span>    dimension: <span className="st">"security"</span>,{'\n'}
<span className="gut">5</span>    limit: <span className="ok">3</span>,{'\n'}
<span className="gut">6</span>  {'}'});{'\n'}
<span className="gut">7</span>{'\n'}
<span className="gut">8</span><span className="kw">return</span> <span className="id">df</span>.<span className="fn">answer</span>({'{'}{'\n'}
<span className="gut">9</span>  status: <span className="st">"answered"</span>,{'\n'}
<span className="gut">10</span> value: out.value.topRisks,{'\n'}
<span className="gut">11</span> evidence: out.value.evidence,{'\n'}
<span className="gut">12</span> derivation: {'{'}{'\n'}
<span className="gut">13</span>   operation: <span className="st">"reused tenant workflow"</span>,{'\n'}
<span className="gut">14</span>   helper: <span className="st">"df.lib.assessVendorRisk"</span>,{'\n'}
<span className="gut">15</span> {'}'},{'\n'}
<span className="gut">16</span>{'}'});
      </div>
    ),
    trajRight: 'nested reads inherit',
    stats: [
      { v: '2', sub: 'calls', k: 'visible' },
      { v: '1.2', sub: 'k tok', k: 'cost · ↓ 70%', ok: true },
      { v: '◆', sub: 'd918', k: 'sealed' },
    ],
    beats: [
      { lines: <>{T.$(<>datafetch apropos <span className="st">"security risk"</span></>)}{T.l('ok', '  ◆ df.lib.assessVendorRisk')}{T.l('dim', '     covers: security · legal · operational · financial')}</>, focus: ['lib/', 'lib/assessVendorRisk.ts'], ms: 1000 },
      { lines: <>{T.$(<>datafetch man <span className="id">assessVendorRisk</span></>)}{T.l('dim', '  signature matches · dim: security')}</>, ms: 800 },
      { lines: <>{T.$(<>nvim scripts/answer.ts</>)}{T.l('dim', '  no need to rediscover the workflow')}</>, focus: ['scripts/answer.ts', 'lib/assessVendorRisk.ts'], ms: 800 },
      { lines: <>{T.$(<>datafetch run scripts/answer.ts</>)}</>, traj: { op: 'comp', kind: 'c', children: <><span className="id">df.lib.assessVendorRisk</span>(<span className="dim">…</span>)</> }, ms: 600 },
      { traj: { op: '↳ read', kind: 'r', nested: true, children: <><span className="id">df.db.vendors</span><span className="dim">.search</span></> }, ms: 400 },
      { traj: { op: '↳ read', kind: 'r', nested: true, children: <><span className="id">df.db.incidents</span><span className="dim">.search</span></> }, ms: 400 },
      { traj: { op: '↳ read', kind: 'r', nested: true, children: <><span className="id">df.db.contracts</span><span className="dim">.search</span></> }, ms: 400 },
      { lines: <>{T.l('ok', '  ok · 3 top risks · evidence cited')}</>, traj: { op: 'write', kind: 'w', children: <><span className="id">df.answer</span>(<span className="dim">…</span>)</> }, ms: 600 },
      { lines: <>{T.$(<>datafetch seal scripts/answer.ts</>)}{T.l('ok', '  ◆ sealed · d918 · ↓ 70% tokens vs cold')}</>, ms: 1000 },
    ],
    holdMs: 1500,
  },

  // ═══════════════ /05 COLD FALLBACK ══════════════════════════
  {
    stage: '/05', short: 'cold',
    eyebrow: '/05 — intent five · cold fallback in-family',
    title: <>When the helper doesn't fit.</>,
    intent: { who: 'tenant · prompt', body: 'Which vendors have climate-related supply chain exposure?' },
    defaultOpen: 'scripts/answer.ts',
    treeState: { showHelpers: true },
    treeRight: 'new path · disclosures',
    consoleRight: 'apropos check',
    answerSrc: (
      <div className="code">
<span className="gut">1</span><span className="kw">const</span> <span className="nm">vendors</span> = <span className="kw">await</span> <span className="id">df</span>.<span className="id">db</span>.<span className="fn">vendors</span>.<span className="nm">search</span>({'\n'}
<span className="gut">2</span>  <span className="st">"suppliers manufacturing logistics"</span>,{'\n'}
<span className="gut">3</span>  {'{'} limit: <span className="ok">100</span> {'}'});{'\n'}
<span className="gut">4</span>{'\n'}
<span className="gut">5</span><span className="kw">const</span> <span className="nm">disclosures</span> = <span className="kw">await</span>{'\n'}
<span className="gut">6</span>  <span className="id">df</span>.<span className="id">db</span>.<span className="fn">disclosures</span>.<span className="nm">search</span>({'\n'}
<span className="gut">7</span>    <span className="st">"climate flood heat emissions"</span>,{'\n'}
<span className="gut">8</span>    {'{'} limit: <span className="ok">100</span> {'}'});{'\n'}
<span className="gut">9</span>{'\n'}
<span className="gut">10</span><span className="kw">const</span> <span className="nm">exposure</span> = <span className="kw">await</span>{'\n'}
<span className="gut">11</span>  <span className="id">df</span>.<span className="id">lib</span>.<span className="fn">extractClimateExposure</span>({'{'}{'\n'}
<span className="gut">12</span>    vendors, disclosures,{'\n'}
<span className="gut">13</span>  {'}'});{'\n'}
<span className="gut">14</span>{'\n'}
<span className="gut">15</span><span className="kw">return</span> <span className="id">df</span>.<span className="fn">answer</span>({'{'}{'\n'}
<span className="gut">16</span>  status: <span className="st">"answered"</span>,{'\n'}
<span className="gut">17</span>  value: exposure.value,{'\n'}
<span className="gut">18</span>  evidence: exposure.value.evidence,{'\n'}
<span className="gut">19</span>{'}'});
      </div>
    ),
    trajRight: 'helper not corrupted',
    stats: [
      { v: '4', sub: 'calls', k: 'trajectory' },
      { v: '3.6', sub: 'k tok', k: 'cost' },
      { v: '◆', sub: 'e7a4', k: 'sealed' },
    ],
    beats: [
      { lines: <>{T.$(<>datafetch apropos <span className="st">"climate supply chain"</span></>)}{T.l('dim', '  no helper')}</>, ms: 800 },
      { lines: <>{T.$(<>datafetch apropos <span className="st">"vendor risk"</span></>)}{T.l('ok', '  ◆ assessVendorRisk')}{T.l('dim', '     dim: security|legal|operational|financial')}<div className="t-line"><span className="dim">     climate · </span><span className="err">not covered</span></div></>, focus: ['lib/', 'lib/assessVendorRisk.ts'], ms: 1200 },
      { lines: <>{T.$(<>ls db</>)}{T.l('dim', '  disclosures.ts · usable')}</>, focus: ['db/', 'db/disclosures.ts'], ms: 900 },
      { lines: <>{T.$(<>nvim scripts/answer.ts</>)}{T.l('dim', '  fall back to cold composition')}</>, focus: ['scripts/answer.ts'], ms: 800 },
      { lines: <>{T.$(<>datafetch run scripts/answer.ts</>)}</>, focus: ['scripts/answer.ts', 'db/vendors.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.vendors</span>.search(<span className="dim">…</span>)</> }, ms: 600 },
      { focus: ['scripts/answer.ts', 'db/vendors.ts', 'db/disclosures.ts'], traj: { op: 'read', kind: 'r', children: <><span className="id">df.db.disclosures</span>.search(<span className="dim">…</span>)</> }, ms: 500 },
      { lines: <>{T.l('ok', '  ok · climate exposure extracted')}</>, traj: { op: 'comp', kind: 'c', children: <><span className="id">df.lib.extractClimateExposure</span></> }, ms: 600 },
      { lines: <>{T.$(<>datafetch seal scripts/answer.ts</>)}{T.l('ok', '  ◆ sealed · e7a4')}</>, traj: { op: 'write', kind: 'w', children: <><span className="id">df.answer</span>(<span className="dim">…</span>)</> }, ms: 800 },
    ],
    holdMs: 2000,
  },
];

// ─── EDITOR ───────────────────────────────────────────────────────
function Editor({ path, slideIdx, slide }) {
  const content = window.renderFile(path, slideIdx, slide);
  const tag = window.fileTag(path, slideIdx);
  return (
    <React.Fragment>
      <div className="region-title editor-title">
        <span className="ed-path">
          <span className="ed-mnt">/mnt/vendors/</span>
          <span className="ed-name">{path}</span>
        </span>
        <span className="right">{tag}</span>
      </div>
      <div key={path + '-' + slideIdx} className="editor-body slide-anim">
        {content}
      </div>
    </React.Fragment>
  );
}

// ─── PLAYBACK STATE MACHINE ───────────────────────────────────────
// idx       : current slide index
// beat      : current beat WITHIN slide (0..beats.length-1)
//             when beat === beats.length, slide is fully played → hold then advance
// playing   : auto-advance running
//
// Manual nav cancels playback and snaps to fully-revealed (beat = beats.length-1).
function useScript() {
  const [idx, setIdx] = useState(() => {
    try {
      const u = new URL(window.location.href);
      const q = parseInt(u.searchParams.get('step') || '0', 10);
      if (!isNaN(q) && q >= 0 && q < SLIDES.length) return q;
    } catch (_) {}
    return 0;
  });
  const [beat, setBeat] = useState(SLIDES[0].beats.length); // start fully revealed
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Persist idx to URL
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('step', String(idx));
      history.replaceState(null, '', u.toString());
    } catch (_) {}
  }, [idx]);

  const goSlide = (n, opts = {}) => {
    clearTimer();
    const next = Math.max(0, Math.min(SLIDES.length - 1, n));
    setIdx(next);
    // When manually jumping, snap fully revealed. When auto-advancing, reset to 0.
    setBeat(opts.fromAuto ? 0 : SLIDES[next].beats.length);
    if (!opts.fromAuto) setPlaying(false);
  };

  // Auto-advance: schedule the next beat, or, if at end, hold + advance slide
  useEffect(() => {
    if (!playing) { clearTimer(); return; }
    const slide = SLIDES[idx];
    if (beat < slide.beats.length) {
      const delay = slide.beats[beat].ms || 600;
      timerRef.current = setTimeout(() => {
        setBeat(b => b + 1);
      }, delay);
    } else {
      // hold at end of slide
      const hold = slide.holdMs || 1200;
      timerRef.current = setTimeout(() => {
        if (idx + 1 < SLIDES.length) {
          goSlide(idx + 1, { fromAuto: true });
        } else {
          setPlaying(false); // end of show
        }
      }, hold);
    }
    return clearTimer;
  }, [playing, idx, beat]);

  const play = () => {
    // If at end of last slide, restart from beginning
    if (idx === SLIDES.length - 1 && beat >= SLIDES[idx].beats.length) {
      setIdx(0);
      setBeat(0);
    } else if (beat >= SLIDES[idx].beats.length) {
      // current slide already fully revealed — reset its beat to 0 so it replays
      setBeat(0);
    }
    setPlaying(true);
  };
  const pause = () => { setPlaying(false); clearTimer(); };
  const restart = () => { clearTimer(); setIdx(0); setBeat(0); setPlaying(true); };

  return { idx, beat, playing, goSlide, play, pause, restart };
}

// ─── CAROUSEL ────────────────────────────────────────────────────
function Carousel() {
  const { idx, beat, playing, goSlide, play, pause, restart } = useScript();
  const slide = SLIDES[idx];

  // Open file: defaults to slide's defaultOpen; manual override sticks until slide change
  const [openFile, setOpenFile] = useState(slide.defaultOpen || 'scripts/answer.ts');
  // Track whether the user manually picked a file on this slide
  // — if so, we stop auto-following focus.
  const [manualPick, setManualPick] = useState(false);
  useEffect(() => {
    setOpenFile(slide.defaultOpen || 'scripts/answer.ts');
    setManualPick(false);
  }, [idx]);

  // During play, follow the most recently focused file in each beat
  // (the last entry of the current beat's focus array). Skip if the user
  // has manually opened a file on this slide.
  useEffect(() => {
    if (!playing || manualPick) return;
    if (beat <= 0 || beat > slide.beats.length) return;
    const b = slide.beats[beat - 1];
    if (!b || !b.focus || b.focus.length === 0) return;
    // The slide explicitly names this as the file under the cursor
    // for this beat. Last one wins (most specific).
    const target = b.focus[b.focus.length - 1];
    // Don't open directories — only real files (no trailing '/').
    if (target && !target.endsWith('/')) setOpenFile(target);
  }, [beat, playing, idx]);

  // Autoscroll the terminal to the latest beat.
  const termRef = useRef(null);
  useEffect(() => {
    const el = termRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [beat, idx]);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && e.target.matches && e.target.matches('input,textarea,select')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goSlide(idx + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp')   { e.preventDefault(); goSlide(idx - 1); }
      else if (e.key === ' ')                                  { e.preventDefault(); playing ? pause() : play(); }
      else if (e.key === 'Home')                               { e.preventDefault(); goSlide(0); }
      else if (e.key === 'End')                                { e.preventDefault(); goSlide(SLIDES.length - 1); }
      else if (e.key === 'r' || e.key === 'R')                 { e.preventDefault(); restart(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, playing]);

  // ── Compute revealed state from beats up to `beat` ───────────
  const activeSet = useMemo(() => {
    const s = new Set();
    for (let i = 0; i < beat && i < slide.beats.length; i++) {
      (slide.beats[i].focus || []).forEach(p => s.add(p));
    }
    return s;
  }, [idx, beat]);

  const consoleBeats = slide.beats.slice(0, beat);
  const lastBeatIdx = beat - 1;

  const trajRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < beat && i < slide.beats.length; i++) {
      if (slide.beats[i].traj) rows.push({ b: i, row: slide.beats[i].traj });
    }
    return rows;
  }, [idx, beat]);

  const treeChildren = buildTree({
    ...slide.treeState,
    activeSet,
    openFile,
    onOpen: (p) => { pause(); setManualPick(true); setOpenFile(p); },
  });

  // Progress bar fraction
  const totalSteps = (slide.beats.length || 1) + 1; // beats + hold
  const progressFrac = Math.min(1, beat / Math.max(1, slide.beats.length));

  return (
    <div className="app">
      {/* CHROME */}
      <header className="chrome">
        <span className="brand">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <g fill="currentColor">
              <rect x="0"  y="0"  width="2" height="16"/>
              <rect x="3"  y="2"  width="2" height="12"/>
              <rect x="6"  y="4"  width="2" height="8"/>
              <rect x="9"  y="2"  width="2" height="12"/>
              <rect x="12" y="0"  width="2" height="16"/>
            </g>
          </svg>
          datafetch/ai
        </span>
        <span className="ch-meta"><b>tenant</b> · acme-procurement</span>
        <span className="ch-meta"><b>dataset</b> · vendors</span>
        <span className="ch-meta"><b>family</b> · vendor-risk</span>
        <span className="grow"></span>
        <button id="theme-btn" className="theme-btn" type="button" aria-label="toggle theme">◐ theme</button>
      </header>

      {/* SLIDE HEAD */}
      <section className="s-head">
        <div>
          <div className="s-eye">{slide.eyebrow}</div>
          <h2 className="s-title">{slide.title}</h2>
        </div>
        <div className={'s-intent' + (slide.intent && slide.intent.fromProvider ? ' from-provider' : '')}>
          <span className="who">{slide.intent.who}</span>
          {slide.intent.body}
        </div>
        {/* slide-level progress bar — visible during play */}
        <div className={'s-progress' + (playing ? ' is-playing' : '')}>
          <div className="s-progress-bar" style={{ width: (progressFrac * 100).toFixed(1) + '%' }}></div>
        </div>
      </section>

      {/* STAGE */}
      <section className="stage">
        {slide.banner}

        {/* tree (left) */}
        <div key={'tree-' + idx} className="region region-tree slide-anim">
          <div className="region-title">
            <span><span className="pulse"></span>/mnt/vendors</span>
            <span className="right">{slide.treeRight}</span>
          </div>
          <div className="tree">
            <div className="root">/mnt/vendors/</div>
            {treeChildren}
          </div>
          <div className="tree-hint">
            <span className="dim">click any file to inspect</span>
          </div>
        </div>

        {/* editor (top middle) */}
        <div className="region region-editor">
          <Editor path={openFile} slideIdx={idx} slide={slide} />
        </div>

        {/* console (bottom middle) */}
        <div className="region region-console">
          <div className="region-title">
            <span>console</span>
            <span className="right">{slide.consoleRight}</span>
          </div>
          <div className="term" ref={termRef}>
            {consoleBeats.map((b, i) => (
              <div key={'b-' + idx + '-' + i} className={'t-beat' + (i === lastBeatIdx && playing ? ' just-in' : '')}>
                {b.lines}
              </div>
            ))}
            {playing && beat < slide.beats.length && <span className="cursor"></span>}
          </div>
        </div>

        {/* trajectory (right, full height) */}
        <div className="region region-traj">
          <div className="region-title">
            <span>trajectory</span>
            <span className="right">{slide.trajRight}</span>
          </div>
          <div className="traj">
            {trajRows.length === 0 && (
              <div className="traj-placeholder dim">
                — no calls yet —
              </div>
            )}
            {trajRows.map(({ b, row }, i) => (
              <TrajRow key={'tr-' + idx + '-' + b} row={row} animate={i === trajRows.length - 1 && playing} />
            ))}
          </div>
        </div>
      </section>

      {/* NAV */}
      <nav className="nav-dock">
        <button className="nav-btn nav-play" type="button" onClick={() => playing ? pause() : play()} aria-label={playing ? 'pause' : 'play'}>
          {playing ? <><span className="play-glyph">⏸</span> pause</> : <><span className="play-glyph">▶</span> play</>}
        </button>
        <button className="nav-btn" type="button" onClick={() => goSlide(idx - 1)} disabled={idx === 0}>
          ‹ prev
        </button>
        <div className="nav-track">
          {SLIDES.map((sl, i) => (
            <button
              key={sl.stage}
              type="button"
              className={'nav-step' + (i === idx ? ' is-on' : '') + (sl.isCryst ? ' cryst' : '')}
              onClick={() => goSlide(i)}
            >
              <span className="ns-num">{sl.stage}</span>
              <span className="ns-name">{sl.short}</span>
            </button>
          ))}
        </div>
        <div style={{display:'flex', alignItems:'center', gap: 14}}>
          <span className="nav-count">
            step <b>{String(idx + 1).padStart(2, '0')}</b> / {String(SLIDES.length).padStart(2, '0')}
          </span>
          <span className="nav-keyhint">
            <kbd>space</kbd> play <kbd>←</kbd><kbd>→</kbd>
          </span>
          <button className="nav-btn" type="button" onClick={() => goSlide(idx + 1)} disabled={idx === SLIDES.length - 1}>
            next ›
          </button>
          <button className="nav-btn nav-restart" type="button" onClick={restart} title="restart from /00">
            ↺ restart
          </button>
        </div>
      </nav>
    </div>
  );
}

Object.assign(window, { Carousel });
