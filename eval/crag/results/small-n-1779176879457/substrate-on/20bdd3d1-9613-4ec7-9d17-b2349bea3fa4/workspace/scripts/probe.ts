// Probe sandbox — `pnpm datafetch:run scripts/probe.ts`. Edit freely.
const pages = await df.db.cragWeb.search("EDIT ME", { limit: 3 });
console.log(pages.map((p) => p.pageName));
return df.answer({ status: "answered", value: "probe", evidence: [], derivation: "probe" });
