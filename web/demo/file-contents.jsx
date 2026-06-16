/* global React */
// ─── FILE CONTENTS ──────────────────────────────────────────────
// Each file's content is rendered into the editor pane when the
// user clicks the file in the tree. Files that vary across slides
// (scripts/answer.ts, df.d.ts) accept the slide index.
// ─────────────────────────────────────────────────────────────────

// Shorthand colour tags for syntax-highlighted code blocks.
const K  = (p) => <span className="kw" {...p} />;
const I  = (p) => <span className="id" {...p} />;
const S  = (p) => <span className="st" {...p} />;
const FN = (p) => <span className="fn" {...p} />;
const C  = (p) => <span className="cm" {...p} />;
const O  = (p) => <span className="ok" {...p} />;
const N  = (p) => <span className="nm" {...p} />;
const P  = (p) => <span className="pn" {...p} />;
const G  = ({ n }) => <span className="gut">{n}</span>;

// ─── AGENTS.md ──────────────────────────────────────────────────
function AgentsMd() {
  return (
    <div className="code">
<C># vendor-risk workspace</C>{'\n'}
<C>> tenant: acme-procurement</C>{'\n'}
<C>> dataset: vendors</C>{'\n'}
<C>> opened:  2026-05-04 · q2</C>{'\n'}
{'\n'}
<K>intent</K>{'\n'}
{'  '}assess vendor risk from filings, sanctions,{'\n'}
{'  '}incidents, contracts, and disclosures.{'\n'}
{'\n'}
<K>primitives</K>{'\n'}
{'  '}<I>df.db.vendors</I>{'\n'}
{'  '}<I>df.db.incidents</I>{'\n'}
{'  '}<I>df.db.contracts</I>{'\n'}
{'  '}<I>df.db.disclosures</I>{'\n'}
{'  '}<I>df.db.filings</I>{'\n'}
{'\n'}
<K>rules</K>{'\n'}
{'  '}- every commit seals one <I>df.answer</I>(…){'\n'}
{'  '}{'  '}with evidence + derivation.{'\n'}
{'  '}- stable shape across <O>≥ 3</O> trajectories{'\n'}
{'  '}{'  '}is a promote candidate.{'\n'}
{'  '}- helpers never lose source. always inspectable.{'\n'}
{'\n'}
<C># nothing here is magic. it is just code.</C>
    </div>
  );
}

// ─── df.d.ts — v0 (pre-crystallisation) ─────────────────────────
function DfdV0() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/df.d.ts — generated</C>{'\n'}
<G n="2" /><C>// v0 · only db primitives. lib is empty.</C>{'\n'}
<G n="3" />{'\n'}
<G n="4" /><K>declare namespace</K> <I>df</I>.<I>db</I> {'{'}{'\n'}
<G n="5" />  <FN>vendors</FN>.<N>search</N>(q: <K>string</K>, opt?: <N>Opt</N>): <O>Promise</O>{'<'}<N>Row</N>[]{'>'};{'\n'}
<G n="6" />  <FN>vendors</FN>.<N>findExact</N>(k: <N>Key</N>, n: <K>number</K>): <O>Promise</O>{'<'}<N>Row</N>[]{'>'};{'\n'}
<G n="7" />  <FN>incidents</FN>.<N>search</N>(q: <K>string</K>, opt?: <N>Opt</N>): <O>Promise</O>{'<'}<N>Row</N>[]{'>'};{'\n'}
<G n="8" />  <FN>contracts</FN>.<N>search</N>(q: <K>string</K>, opt?: <N>Opt</N>): <O>Promise</O>{'<'}<N>Row</N>[]{'>'};{'\n'}
<G n="9" />  <FN>disclosures</FN>.<N>search</N>(q: <K>string</K>, opt?: <N>Opt</N>): <O>Promise</O>{'<'}<N>Row</N>[]{'>'};{'\n'}
<G n="10" />  <FN>filings</FN>.<N>search</N>(q: <K>string</K>, opt?: <N>Opt</N>): <O>Promise</O>{'<'}<N>Row</N>[]{'>'};{'\n'}
<G n="11" />{'}'}{'\n'}
<G n="12" />{'\n'}
<G n="13" /><K>declare namespace</K> <I>df</I>.<I>lib</I> {'{'}{'\n'}
<G n="14" />  <C>// (empty — nothing crystallised yet)</C>{'\n'}
<G n="15" />  <FN>rankVendorRisk</FN>(<P>input</P>: <N>RankInput</N>): <O>Promise</O>{'<'}<N>Result</N>{'<'}<K>unknown</K>{'>>'};{'\n'}
<G n="16" />  <FN>explainVendorRisk</FN>(<P>input</P>: <N>ExplainInput</N>): <O>Promise</O>{'<'}<N>Result</N>{'<'}<K>unknown</K>{'>>'};{'\n'}
<G n="17" />{'}'}{'\n'}
<G n="18" />{'\n'}
<G n="19" /><K>declare function</K> <I>df</I>.<FN>answer</FN>(<P>a</P>: <N>Answer</N>): <K>never</K>;
    </div>
  );
}

// ─── df.d.ts — v1 (post-crystallisation) ────────────────────────
function DfdV1() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/df.d.ts — regenerated</C>{'\n'}
<G n="2" /><C>// v1 · promoted 3 helpers from acme-procurement.</C>{'\n'}
<G n="3" />{'\n'}
<G n="4" /><K>declare namespace</K> <I>df</I>.<I>db</I> {'{'} <C>/* …unchanged… */</C> {'}'}{'\n'}
<G n="5" />{'\n'}
<G n="6" /><K>declare namespace</K> <I>df</I>.<I>lib</I> {'{'}{'\n'}
<G n="7" />{'\n'}
<G n="8" /><span style={{color:'var(--hl-ok)',fontWeight:700}}>+ </span><FN>assessVendorRisk</FN>(<P>input</P>: {'{'}{'\n'}
<G n="9" /><span style={{color:'var(--hl-ok)',fontWeight:700}}>+ </span>   intent: <K>string</K>;{'\n'}
<G n="10" /><span style={{color:'var(--hl-ok)',fontWeight:700}}>+ </span>   vendors?: <K>unknown</K>[];{'\n'}
<G n="11" /><span style={{color:'var(--hl-ok)',fontWeight:700}}>+ </span>   dimension?: <S>"security"</S> | <S>"legal"</S>{'\n'}
<G n="12" /><span style={{color:'var(--hl-ok)',fontWeight:700}}>+ </span>              | <S>"operational"</S> | <S>"financial"</S>;{'\n'}
<G n="13" /><span style={{color:'var(--hl-ok)',fontWeight:700}}>+ </span>   limit?: <K>number</K>;{'\n'}
<G n="14" /><span style={{color:'var(--hl-ok)',fontWeight:700}}>+ </span> {'}'}): <O>Promise</O>{'<'}<N>Result</N>{'<'}<K>unknown</K>{'>>'};{'\n'}
<G n="15" />{'\n'}
<G n="16" /><span style={{color:'var(--hl-ok)',fontWeight:700}}>+ </span><FN>explainVendorRisk</FN>(<P>input</P>: <N>ExplainInput</N>): <O>Promise</O>{'<'}<N>Result</N>{'<'}<K>unknown</K>{'>>'};{'\n'}
<G n="17" /><span style={{color:'var(--hl-ok)',fontWeight:700}}>+ </span><FN>compareVendorRisk</FN>(<P>input</P>: <N>CompareInput</N>): <O>Promise</O>{'<'}<N>Result</N>{'<'}<K>unknown</K>{'>>'};{'\n'}
<G n="18" />{'\n'}
<G n="19" />  <C>// retained from v0 (cold-composition helpers)</C>{'\n'}
<G n="20" />  <FN>rankVendorRisk</FN>(<P>input</P>: <N>RankInput</N>): <O>Promise</O>{'<'}<N>Result</N>{'<'}<K>unknown</K>{'>>'};{'\n'}
<G n="21" />{'}'}{'\n'}
<G n="22" />{'\n'}
<G n="23" /><K>declare function</K> <I>df</I>.<FN>answer</FN>(<P>a</P>: <N>Answer</N>): <K>never</K>;
    </div>
  );
}

// ─── db/*.ts schemas ───────────────────────────────────────────
function VendorsSchema() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/db/vendors.ts — immutable</C>{'\n'}
<G n="2" /><C>// rows · 3,124 · indexed by id, name, tier</C>{'\n'}
<G n="3" />{'\n'}
<G n="4" /><K>export interface</K> <N>Vendor</N> {'{'}{'\n'}
<G n="5" />  id: <K>string</K>;{'\n'}
<G n="6" />  name: <K>string</K>;{'\n'}
<G n="7" />  tier: <S>"strategic"</S> | <S>"tactical"</S> | <S>"tail"</S>;{'\n'}
<G n="8" />  category: <K>string</K>;{'\n'}
<G n="9" />  region: <K>string</K>;{'\n'}
<G n="10" />  active: <K>boolean</K>;{'\n'}
<G n="11" />  spendUSD: <K>number</K>;{'\n'}
<G n="12" />{'}'}{'\n'}
<G n="13" />{'\n'}
<G n="14" /><K>export const</K> <N>search</N>: <FN>SearchFn</FN>{'<'}<N>Vendor</N>{'>'};{'\n'}
<G n="15" /><K>export const</K> <N>findExact</N>: <FN>FindFn</FN>{'<'}<N>Vendor</N>{'>'};{'\n'}
<G n="16" />{'\n'}
<G n="17" /><C>// search() does a small embedding lookup over (name,</C>{'\n'}
<G n="18" /><C>// category, region) and returns ranked rows.</C>{'\n'}
<G n="19" /><C>// findExact() is structured by key — no LLM in the path.</C>
    </div>
  );
}
function IncidentsSchema() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/db/incidents.ts — immutable</C>{'\n'}
<G n="2" /><C>// rows · 18,407 · indexed by vendorId, date, kind</C>{'\n'}
<G n="3" />{'\n'}
<G n="4" /><K>export interface</K> <N>Incident</N> {'{'}{'\n'}
<G n="5" />  id: <K>string</K>;{'\n'}
<G n="6" />  vendorId: <K>string</K>;{'\n'}
<G n="7" />  kind: <S>"security"</S> | <S>"outage"</S> | <S>"litigation"</S>{'\n'}
<G n="8" />      | <S>"sla"</S> | <S>"data"</S>;{'\n'}
<G n="9" />  severity: <K>1</K> | <K>2</K> | <K>3</K> | <K>4</K> | <K>5</K>;{'\n'}
<G n="10" />  date: <K>string</K>;        <C>// ISO-8601</C>{'\n'}
<G n="11" />  source: <K>string</K>;      <C>// "filing" | "press" | "ticket"</C>{'\n'}
<G n="12" />  summary: <K>string</K>;{'\n'}
<G n="13" />  evidence: <N>Citation</N>[];{'\n'}
<G n="14" />{'}'}{'\n'}
<G n="15" />{'\n'}
<G n="16" /><K>export const</K> <N>search</N>: <FN>SearchFn</FN>{'<'}<N>Incident</N>{'>'};
    </div>
  );
}
function ContractsSchema() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/db/contracts.ts — immutable</C>{'\n'}
<G n="2" /><C>// rows · 6,812 · indexed by vendorId, status</C>{'\n'}
<G n="3" />{'\n'}
<G n="4" /><K>export interface</K> <N>Contract</N> {'{'}{'\n'}
<G n="5" />  id: <K>string</K>;{'\n'}
<G n="6" />  vendorId: <K>string</K>;{'\n'}
<G n="7" />  status: <S>"active"</S> | <S>"renewing"</S> | <S>"churned"</S>;{'\n'}
<G n="8" />  startDate: <K>string</K>;{'\n'}
<G n="9" />  endDate: <K>string</K>;{'\n'}
<G n="10" />  obligations: <N>Obligation</N>[];   <C>// sla, security, data</C>{'\n'}
<G n="11" />  termsBlob: <K>string</K>;           <C>// raw clause text</C>{'\n'}
<G n="12" />{'}'}{'\n'}
<G n="13" />{'\n'}
<G n="14" /><K>export const</K> <N>search</N>: <FN>SearchFn</FN>{'<'}<N>Contract</N>{'>'};
    </div>
  );
}
function DisclosuresSchema() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/db/disclosures.ts — immutable</C>{'\n'}
<G n="2" /><C>// rows · 9,055 · indexed by vendorId, year, topic</C>{'\n'}
<G n="3" />{'\n'}
<G n="4" /><K>export interface</K> <N>Disclosure</N> {'{'}{'\n'}
<G n="5" />  id: <K>string</K>;{'\n'}
<G n="6" />  vendorId: <K>string</K>;{'\n'}
<G n="7" />  topic: <S>"climate"</S> | <S>"governance"</S>{'\n'}
<G n="8" />       | <S>"labor"</S> | <S>"supply-chain"</S> | <S>"data"</S>;{'\n'}
<G n="9" />  year: <K>number</K>;{'\n'}
<G n="10" />  body: <K>string</K>;{'\n'}
<G n="11" />  cites: <N>Citation</N>[];{'\n'}
<G n="12" />{'}'}{'\n'}
<G n="13" />{'\n'}
<G n="14" /><K>export const</K> <N>search</N>: <FN>SearchFn</FN>{'<'}<N>Disclosure</N>{'>'};{'\n'}
<G n="15" />{'\n'}
<G n="16" /><C>// climate disclosures cover scope 1/2/3, supply-chain</C>{'\n'}
<G n="17" /><C>// transit risk, flood/heat exposure, water stress.</C>
    </div>
  );
}
function FilingsSchema() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/db/filings.ts — immutable</C>{'\n'}
<G n="2" /><C>// rows · 4,201 · ed-gar, equiv-EU</C>{'\n'}
<G n="3" />{'\n'}
<G n="4" /><K>export interface</K> <N>Filing</N> {'{'}{'\n'}
<G n="5" />  id: <K>string</K>;{'\n'}
<G n="6" />  vendorId: <K>string</K>;{'\n'}
<G n="7" />  kind: <S>"10-K"</S> | <S>"10-Q"</S> | <S>"8-K"</S> | <S>"AR"</S>;{'\n'}
<G n="8" />  date: <K>string</K>;{'\n'}
<G n="9" />  url: <K>string</K>;{'\n'}
<G n="10" />  text: <K>string</K>;{'\n'}
<G n="11" />{'}'}{'\n'}
<G n="12" />{'\n'}
<G n="13" /><K>export const</K> <N>search</N>: <FN>SearchFn</FN>{'<'}<N>Filing</N>{'>'};
    </div>
  );
}

// ─── lib/*.ts (promoted helpers) ────────────────────────────────
function AssessLib() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/lib/acme-procurement/assessVendorRisk.ts</C>{'\n'}
<G n="2" /><C>// promoted 20260518 · from intents a7f3, b021, c4d2</C>{'\n'}
<G n="3" /><K>import</K> * <K>as</K> df <K>from</K> <S>"../../df"</S>;{'\n'}
<G n="4" />{'\n'}
<G n="5" /><K>export async function</K> <FN>assessVendorRisk</FN>(<P>input</P>: {'{'}{'\n'}
<G n="6" />  intent: <K>string</K>;{'\n'}
<G n="7" />  vendors?: <K>unknown</K>[];{'\n'}
<G n="8" />  dimension?: <S>"security"</S>|<S>"legal"</S>|<S>"operational"</S>|<S>"financial"</S>;{'\n'}
<G n="9" />  limit?: <K>number</K>;{'\n'}
<G n="10" />{'}'}) {'{'}{'\n'}
<G n="11" />  <K>const</K> q = <FN>shape</FN>(input);{'\n'}
<G n="12" />  <K>const</K> v = <K>await</K> <I>df</I>.<I>db</I>.<FN>vendors</FN>.<N>search</N>(q.vendorQuery, {'{'} limit: <O>50</O> {'}'});{'\n'}
<G n="13" />  <K>const</K> i = <K>await</K> <I>df</I>.<I>db</I>.<FN>incidents</FN>.<N>search</N>(q.incidentQuery, {'{'} limit: <O>100</O> {'}'});{'\n'}
<G n="14" />  <K>const</K> c = <K>await</K> <I>df</I>.<I>db</I>.<FN>contracts</FN>.<N>search</N>(q.contractQuery, {'{'} limit: <O>50</O> {'}'});{'\n'}
<G n="15" />{'\n'}
<G n="16" />  <K>const</K> ranked = <FN>rank</FN>({'{'} vendors: v, incidents: i, contracts: c, dim: input.dimension {'}'});{'\n'}
<G n="17" />{'\n'}
<G n="18" />  <K>return</K> <I>df</I>.<FN>result</FN>({'{'}{'\n'}
<G n="19" />    topRisks: ranked.<N>slice</N>(<O>0</O>, input.limit ?? <O>10</O>),{'\n'}
<G n="20" />    evidence: ranked.<N>flatMap</N>(r =&gt; r.evidence),{'\n'}
<G n="21" />    derivation: {'{'} operation: <S>"vendor risk ranking"</S> {'}'},{'\n'}
<G n="22" />  {'}'});{'\n'}
<G n="23" />{'}'}
    </div>
  );
}
function ExplainLib() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/lib/acme-procurement/explainVendorRisk.ts</C>{'\n'}
<G n="2" /><C>// promoted 20260518 · single-vendor explanation</C>{'\n'}
<G n="3" /><K>import</K> * <K>as</K> df <K>from</K> <S>"../../df"</S>;{'\n'}
<G n="4" />{'\n'}
<G n="5" /><K>export async function</K> <FN>explainVendorRisk</FN>(<P>input</P>: {'{'}{'\n'}
<G n="6" />  vendor: <N>Vendor</N>;{'\n'}
<G n="7" />  incidents?: <N>Incident</N>[];{'\n'}
<G n="8" />  contracts?: <N>Contract</N>[];{'\n'}
<G n="9" />{'}'}) {'{'}{'\n'}
<G n="10" />  <K>const</K> incidents = input.incidents{'\n'}
<G n="11" />    ?? <K>await</K> <I>df</I>.<I>db</I>.<FN>incidents</FN>.<N>search</N>(input.vendor.name, {'{'} limit: <O>25</O> {'}'});{'\n'}
<G n="12" />  <K>const</K> contracts = input.contracts{'\n'}
<G n="13" />    ?? <K>await</K> <I>df</I>.<I>db</I>.<FN>contracts</FN>.<N>search</N>(input.vendor.name, {'{'} limit: <O>25</O> {'}'});{'\n'}
<G n="14" />{'\n'}
<G n="15" />  <K>const</K> reasons = <FN>extractReasons</FN>(input.vendor, incidents, contracts);{'\n'}
<G n="16" />{'\n'}
<G n="17" />  <K>return</K> <I>df</I>.<FN>result</FN>({'{'}{'\n'}
<G n="18" />    summary: <FN>compose</FN>(input.vendor, reasons),{'\n'}
<G n="19" />    evidence: reasons.<N>flatMap</N>(r =&gt; r.citations),{'\n'}
<G n="20" />  {'}'});{'\n'}
<G n="21" />{'}'}
    </div>
  );
}
function CompareLib() {
  return (
    <div className="code">
<G n="1" /><C>// /mnt/vendors/lib/acme-procurement/compareVendorRisk.ts</C>{'\n'}
<G n="2" /><C>// promoted 20260518 · two-vendor diff on one dimension</C>{'\n'}
<G n="3" /><K>import</K> * <K>as</K> df <K>from</K> <S>"../../df"</S>;{'\n'}
<G n="4" />{'\n'}
<G n="5" /><K>export async function</K> <FN>compareVendorRisk</FN>(<P>input</P>: {'{'}{'\n'}
<G n="6" />  vendors: <N>Vendor</N>[];{'\n'}
<G n="7" />  incidents?: <N>Incident</N>[];{'\n'}
<G n="8" />  contracts?: <N>Contract</N>[];{'\n'}
<G n="9" />  dimension: <S>"security"</S>|<S>"legal"</S>|<S>"operational"</S>|<S>"financial"</S>;{'\n'}
<G n="10" />{'}'}) {'{'}{'\n'}
<G n="11" />  <K>const</K> rows = input.vendors.<N>map</N>(v =&gt; <FN>scoreOne</FN>(v, {'{'}{'\n'}
<G n="12" />    incidents: input.incidents, contracts: input.contracts,{'\n'}
<G n="13" />    dim: input.dimension,{'\n'}
<G n="14" />  {'}'}));{'\n'}
<G n="15" />{'\n'}
<G n="16" />  <K>return</K> <I>df</I>.<FN>result</FN>({'{'}{'\n'}
<G n="17" />    table: rows, winner: <FN>pickWinner</FN>(rows),{'\n'}
<G n="18" />    evidence: rows.<N>flatMap</N>(r =&gt; r.evidence),{'\n'}
<G n="19" />  {'}'});{'\n'}
<G n="20" />{'}'}
    </div>
  );
}

// ─── scripts/scratch.ts (constant — exploratory draft) ─────────
function ScratchTs() {
  return (
    <div className="code">
<G n="1" /><C>// scripts/scratch.ts — exploratory probes</C>{'\n'}
<G n="2" /><C>// the agent edits this freely before sealing answer.ts</C>{'\n'}
<G n="3" />{'\n'}
<G n="4" /><K>const</K> probe1 = <K>await</K> <I>df</I>.<I>db</I>.<FN>vendors</FN>.<N>search</N>(<S>"strategic"</S>, {'{'} limit: <O>10</O> {'}'});{'\n'}
<G n="5" /><N>console</N>.<N>log</N>(probe1.value.<N>slice</N>(<O>0</O>, <O>3</O>));{'\n'}
<G n="6" />{'\n'}
<G n="7" /><K>const</K> probe2 = <K>await</K> <I>df</I>.<I>db</I>.<FN>incidents</FN>.<N>search</N>(<S>"breach"</S>, {'{'} limit: <O>5</O> {'}'});{'\n'}
<G n="8" /><N>console</N>.<N>log</N>(probe2.value);{'\n'}
<G n="9" />{'\n'}
<G n="10" /><C>// once a shape works, copy it into answer.ts and seal.</C>
    </div>
  );
}

// ─── result/ folder placeholder ────────────────────────────────
function ResultPlaceholder({ sealed }) {
  return (
    <div className="code">
<C>// result/ — sealed commits</C>{'\n'}
<C>// one folder per intent, each containing:</C>{'\n'}
<C>//   source.ts    · the answer program</C>{'\n'}
<C>//   trajectory   · typed read/compute/write chain</C>{'\n'}
<C>//   evidence/    · cited rows</C>{'\n'}
<C>//   tests/replay · re-runs deterministically</C>{'\n'}
{'\n'}
{sealed && sealed.map((s, i) => (
  <span key={i}><O>◆ {s}</O>{'\n'}</span>
))}
{(!sealed || sealed.length === 0) && (
  <span className="empty">  ⌁ no sealed commits yet</span>
)}
    </div>
  );
}

// ─── Generic placeholder for empty / not-yet files ─────────────
function EmptyFile({ reason }) {
  return (
    <div className="code">
<span className="empty">  ⌁ {reason}</span>
    </div>
  );
}

// ─── EXPORT: dispatcher ─────────────────────────────────────────
// Returns the JSX content for a given file path at a given slide
// index. Slide-relative content (scripts/answer.ts) is read from
// the slide data, so we don't store it here.
//
// AFTER = the slide index at which crystallisation happens.
const CRYST_IDX = 4;

function renderFile(path, slideIdx, slide) {
  // Slide-bound: scripts/answer.ts
  if (path === 'scripts/answer.ts') return slide.answerSrc || <EmptyFile reason="empty" />;
  if (path === 'scripts/scratch.ts') return <ScratchTs />;

  if (path === 'AGENTS.md') return <AgentsMd />;
  if (path === 'df.d.ts') return slideIdx >= CRYST_IDX ? <DfdV1 /> : <DfdV0 />;

  if (path === 'db/vendors.ts')     return <VendorsSchema />;
  if (path === 'db/incidents.ts')   return <IncidentsSchema />;
  if (path === 'db/contracts.ts')   return <ContractsSchema />;
  if (path === 'db/disclosures.ts') return <DisclosuresSchema />;
  if (path === 'db/filings.ts')     return <FilingsSchema />;

  // lib helpers — only exist after crystallisation
  if (path.startsWith('lib/')) {
    if (slideIdx < CRYST_IDX) {
      return <EmptyFile reason="this helper is not yet promoted. seal three matching trajectories first." />;
    }
    if (path === 'lib/assessVendorRisk.ts')  return <AssessLib />;
    if (path === 'lib/explainVendorRisk.ts') return <ExplainLib />;
    if (path === 'lib/compareVendorRisk.ts') return <CompareLib />;
  }

  // result/ — show sealed list relevant to slide
  if (path === 'result/') {
    const sealed = [];
    if (slideIdx >= 1) sealed.push('a7f3 — find high-risk vendors');
    if (slideIdx >= 2) sealed.push('b021 — explain Northwind');
    if (slideIdx >= 3) sealed.push('c4d2 — compare Northwind/Contoso');
    if (slideIdx >= 5) sealed.push('d918 — top by security (reused)');
    if (slideIdx >= 6) sealed.push('e7a4 — climate exposure (cold)');
    return <ResultPlaceholder sealed={sealed} />;
  }

  return <EmptyFile reason="select a file from the tree" />;
}

// Per-file pill tag shown in the editor header.
function fileTag(path, slideIdx) {
  if (path === 'AGENTS.md') return 'core';
  if (path === 'df.d.ts')   return slideIdx >= CRYST_IDX ? 'types · v1' : 'types · v0';
  if (path.startsWith('db/')) return 'immutable';
  if (path === 'scripts/scratch.ts') return 'scratch';
  if (path === 'scripts/answer.ts')  return 'this intent';
  if (path === 'result/')   return 'sealed';
  if (path.startsWith('lib/')) {
    return slideIdx >= CRYST_IDX ? 'tenant · v1' : '— not yet —';
  }
  return '';
}

Object.assign(window, { renderFile, fileTag, CRYST_IDX });
