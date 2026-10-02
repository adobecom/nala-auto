import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import Breadcrumb from '../components/Breadcrumb';
import Header from '../components/Header';

const SHEET_BASE = 'https://milo.adobe.com/drafts/nala/screenshotdiff/data/';

const Code = ({ children }) => (
  <code className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em]">{children}</code>
);
Code.propTypes = { children: PropTypes.node.isRequired };

const Steps = ({ items }) => (
  <ol className="list-decimal space-y-1 pl-5">
    {items.map((step) => <li key={typeof step === 'string' ? step : step.key}>{step}</li>)}
  </ol>
);
Steps.propTypes = { items: PropTypes.arrayOf(PropTypes.node).isRequired };

const Tip = ({ children }) => (
  <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-900">
    {children}
  </div>
);
Tip.propTypes = { children: PropTypes.node.isRequired };

// Each section has an anchor id; the floating "?" button in AppShell deep-links
// to the one matching the current page (see helpAnchorFor in AppShell).
const SECTIONS = [
  {
    id: 'start',
    title: 'Getting started',
    body: (
      <>
        <p>
          Nala Auto runs visual and functional checks for Milo and its consumer sites on
          self-hosted Mac minis (via GitHub Actions) and shows the results here.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Want to check a whole site?</b> → <Link to="/console">Run a dataset</Link>, then open the results.</li>
          <li><b>Just a few URLs?</b> → <Link to="/console?mode=quick">Quick URL check</Link>.</li>
          <li><b>Does a block match the design?</b> → <Link to="/console?mode=figma">Compare with Figma</Link>.</li>
          <li><b>Is a release safe?</b> → <Link to="/releases">Releases</Link>: sign-offs, checks, and a one-click visual diff.</li>
          <li><b>Need a real iPhone browser?</b> → <Link to="/manual-ios">Manual iOS Safari</Link>.</li>
        </ul>
        <Tip>
          Press <kbd className="rounded border px-1">/</kbd> anywhere to jump to a site or page. The
          <b> ✦ Ask</b> button (bottom right) answers questions about recent runs in plain English.
        </Tip>
      </>
    ),
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    body: (
      <>
        <p>The home page shows the latest screenshot-diff and Brand Concierge runs, their pass rate, and every dataset grouped by product (Milo core, consumer, Marketo, custom).</p>
        <p>Click a dataset card to open its latest results. Use <b>+ Add dataset</b> to register a new one — see <a href="#datasets">Datasets</a>.</p>
      </>
    ),
  },
  {
    id: 'console',
    title: 'Run Console',
    body: (
      <>
        <p><Link to="/console">/console</Link> starts runs and tracks them live. Pick a run kind at the top:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Viewport diff</b> — screenshots every page of a dataset on desktop, tablet and mobile, A vs B.</li>
          <li><b>⚡ Quick run</b> — paste a few URLs; no dataset needed.</li>
          <li><b>🎨 Figma compare</b> — one page region vs one Figma frame (see <a href="#figma">below</a>).</li>
          <li><b>Real iOS · Simulator</b> — the same dataset on chosen iOS versions and devices.</li>
        </ul>
        <Steps items={[
          'Choose the run kind and the site (dataset).',
          'Check the dataset preview: page count, wait mode, ignored or invalid rows.',
          <span key="milolibs">Set the query string appended to the B side — usually <Code>?milolibs=stage</Code> or a feature branch like <Code>?milolibs=my-branch--milo--adobecom</Code>.</span>,
          'Press Run. The run card shows queue → running → done; several datasets can run at the same time.',
          'When it finishes, click the run to open the results.',
        ]}
        />
        <p>The dataset dropdown shows how long the last run of each dataset took (<i>milo · last 18m</i>), so you can plan around long runs.</p>
        <p><b>Parallel</b> splits each viewport&apos;s pages across several runners, so big datasets finish sooner. <i>Auto</i> uses about 12 pages per job and only the runners that other runs are not using. Pick ×1 to ×4 to override.</p>
        <p>Recent runs show baseline badges (<i>changed / new / missing / flaky</i>) once scoring finishes — usually within a minute of the run ending.</p>
        <Tip>“Mock mode” in the console means the backend has no GitHub token and runs are simulated. Production is always live.</Tip>
      </>
    ),
  },
  {
    id: 'pr-check',
    title: 'PR check',
    body: (
      <>
        <p>Verify a pull request in one step: paste its link and nala-auto picks and runs the checks that cover it.</p>
        <Steps items={[
          <span key="paste">Open <b>PR check</b>, paste a link such as <Code>https://github.com/adobecom/milo/pull/1234</Code> (or <Code>adobecom/milo#1234</Code>) and click <b>Plan checks</b>.</span>,
          <span key="plan">Review the plan. <b>PR test URLs</b> come from the description (Before/After pairs are compared directly); <b>Changed blocks</b> are dataset pages matching blocks touched by the PR; <b>Full datasets</b> are offered for Milo PRs that change shared code; <b>Brand Concierge</b> is offered when BC files change.</span>,
          <span key="run">Untick what you don&apos;t need and click <b>Run checks</b>. Milo PRs load the branch with <Code>?milolibs=</Code>; consumer-repo PRs compare the <Code>main</Code> preview with the branch preview.</span>,
          <span key="verdict">The check page refreshes until every run finishes and shows one verdict — <b>Looks good</b>, <b>Needs review</b> or <b>Failed</b> — with the flagged pages and links to each report.</span>,
        ]}
        />
        <p>Quick runs are flagged when a page differs by more than 1% or its height moves more than 40px; dataset runs are flagged when a page changed vs. the accepted baseline (flaky pages are ignored). Blocks listed as <b>not covered</b> have no test page — check them by hand or add rows to a dataset.</p>
      </>
    ),
  },
  {
    id: 'quick',
    title: 'Quick URL check',
    body: (
      <>
        <p>Paste one URL per line and choose the viewports. Each URL is screenshotted as-is (A) and with your query string added (B).</p>
        <p>Quick and Figma results are kept for 24 hours; dataset runs keep the newest 3 runs for up to 7 days.</p>
      </>
    ),
  },
  {
    id: 'figma',
    title: 'Compare with Figma',
    body: (
      <Steps items={[
        'Paste the page URL.',
        <span key="link">Paste the Figma link <b>with a node-id</b> (right-click the frame → Copy link to selection).</span>,
        <span key="sel">Give a CSS selector for the matching region, e.g. <Code>.marquee.split</Code> — only that element is captured.</span>,
        'Pick the one viewport the frame was designed for, then Run.',
      ]}
      />
    ),
  },
  {
    id: 'datasets',
    title: 'Datasets (adding and configuring)',
    body: (
      <>
        <p>
          A dataset is a SharePoint sheet published at <Code>{SHEET_BASE}&lt;name&gt;.json</Code>. Every dataset
          uses the same folder; only the name changes.
        </p>
        <Steps items={[
          <span key="create">Create <Code>&lt;name&gt;.xlsx</Code> in the SharePoint data folder (the “📁 Baseline data” link in the console).</span>,
          'Fill rows, then Preview + Publish it in Sidekick.',
          <span key="add">On the Dashboard click <b>+ Add dataset</b> and type the name. It is checked against the live sheet; if it isn’t published yet you’ll see the URL it expected (use “Add anyway” only if you’ll publish shortly).</span>,
        ]}
        />
        <p>Sheet columns:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1 pr-3">Column</th><th className="py-1 pr-3">Example</th><th className="py-1">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr><td className="py-1 pr-3"><Code>key</Code></td><td className="pr-3">accordion</td><td>Name of the page in results.</td></tr>
              <tr><td className="py-1 pr-3"><Code>a</Code></td><td className="pr-3">https://main--milo…/accordion</td><td>Baseline URL.</td></tr>
              <tr><td className="py-1 pr-3"><Code>b</Code></td><td className="pr-3">https://stage--milo…/accordion</td><td>Optional. Compared URL; if empty, A + the run’s query string is used.</td></tr>
              <tr><td className="py-1 pr-3"><Code>waitStrategy</Code></td><td className="pr-3">footer / scroll</td><td>Use <Code>scroll</Code> for pages with lazy-loaded sections.</td></tr>
              <tr><td className="py-1 pr-3"><Code>mask</Code></td><td className="pr-3">.carousel; #promo</td><td>CSS selectors painted over before diffing (rotating or dynamic content).</td></tr>
              <tr><td className="py-1 pr-3"><Code>ignore</Code></td><td className="pr-3">yes</td><td>Temporarily skip a flaky page without deleting the row.</td></tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'results',
    title: 'Reading results',
    body: (
      <>
        <p>Results live at <Code>/imagediff/&lt;site&gt;</Code>. The <b>Run</b> picker at the top switches between saved runs.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Left list</b> — every page × viewport. “Show diffs only” hides identical pages; the browser chips filter by device.</li>
          <li><b>View modes</b> — <i>split</i> (side by side, synced scroll), <i>slider</i>, <i>blink</i> (toggles A/B) and <i>diff</i> (pixel overlay).</li>
          <li><b>🔥 hotspots</b> — jump between the regions that changed.</li>
          <li><b>🤖 AI Judge</b> — asks a vision model whether the diff is a real regression or noise (carousel, timestamps, animations).</li>
          <li>Keyboard: <kbd className="rounded border px-1">←</kbd>/<kbd className="rounded border px-1">→</kbd> previous / next page.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'baseline',
    title: 'Baseline and trend',
    body: (
      <>
        <p>
          Raw diffs compare A vs B in one run. The baseline answers a different question:
          <b> did this page change compared to what we already accepted?</b>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="rounded bg-amber-100 px-1 text-amber-700">changed</span> diff moved since the baseline (or the previous run if none is accepted).</li>
          <li><span className="rounded bg-sky-100 px-1 text-sky-700">new</span> no baseline yet for this page.</li>
          <li><span className="rounded bg-emerald-100 px-1 text-emerald-700">same</span> matches the baseline.</li>
          <li><b>missing</b> was in the baseline, not in this run. <b>flaky</b> diff % keeps jumping over the last 10 runs — consider a <Code>mask</Code> or <Code>waitStrategy</Code>.</li>
        </ul>
        <Steps items={[
          'Open a good run and press “Accept run as baseline” in the bar above the viewer.',
          'For later runs, tick “Changed since baseline” to review only what moved.',
          'If a change is intended, press ✓ Accept on that page (next to AI Judge).',
        ]}
        />
        <p>The sparkline shows the average diff % over recent runs; the small one next to each page shows that page’s history.</p>
      </>
    ),
  },
  {
    id: 'releases',
    title: 'Releases and visual diff for any repo',
    body: (
      <>
        <p><Link to="/releases">/releases</Link> tracks <i>Stage → Main</i> release PRs for Milo and consumer repos: team sign-off labels, failing checks, and the PRs included.</p>
        <p>
          Each repo is mapped to the datasets that cover it (chips in the <b>Visual diff</b> card; click <b>edit</b> to change).
          <b> Run visual diff</b> starts one live run per mapped dataset.
        </p>
        <p>Trigger the same from your repo’s CI:</p>
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{`curl -X POST https://nala-auto.corp.adobe.com/lab/repo-runs \\
  -H 'Content-Type: application/json' \\
  -d '{"repo":"adobecom/da-bacom","milolibs":"?milolibs=stage"}'`}</pre>
      </>
    ),
  },
  {
    id: 'bc',
    title: 'Brand Concierge monitor',
    body: (
      <>
        <p><Link to="/bc-agent">/bc-agent</Link> runs a conversation health check on any page that embeds Brand Concierge: it opens the chat, sends prompts and checks the replies, product cards and links.</p>
        <p>Paste the page URL (e.g. <Code>https://business.stage.adobe.com/?milolibs=stage</Code>) and run. Results include per-check status, screenshots and a full transcript; checks that passed only on retry are marked.</p>
      </>
    ),
  },
  {
    id: 'manual-ios',
    title: 'Manual iOS Safari',
    body: (
      <>
        <p><Link to="/manual-ios">/manual-ios</Link> streams a real iOS Simulator from a Mac mini so you can tap through a page in Safari.</p>
        <p>One shared session is available at a time and it is released automatically after its time limit — press End session when done so others can use it.</p>
      </>
    ),
  },
  {
    id: 'runners',
    title: 'Mac mini runners',
    body: (
      <p><Link to="/runners">/runners</Link> shows each self-hosted runner (busy / idle / offline), queued jobs and recent jobs. If a run sits in “queued” for long, check here whether all runners are busy or offline.</p>
    ),
  },
  {
    id: 'faq',
    title: 'Troubleshooting',
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li><b>“No sheet at …” when adding a dataset</b> — the sheet isn’t published, or the name differs from the file name. Open the URL shown; it must return JSON.</li>
        <li><b>Run stuck in queued</b> — all runners are busy or offline; see <a href="#runners">Runners</a>.</li>
        <li><b>Lots of tiny diffs on the same pages every run</b> — they’ll show as <i>flaky</i>. Add a <Code>mask</Code> for the dynamic area or set <Code>waitStrategy</Code> to <Code>scroll</Code>.</li>
        <li><b>“Run has no saved copy”</b> — that run was pruned (datasets keep 3 runs / 7 days); you’re seeing the latest instead.</li>
        <li><b>Everything shows as “new”</b> — no baseline has been accepted for this site yet.</li>
        <li>Still stuck? Ask in the Milo QA channel, or use <b>✦ Ask</b>.</li>
      </ul>
    ),
  },
];

export default function HelpPage() {
  const location = useLocation();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return undefined;
    // Wait a frame so the header/breadcrumb have laid out before measuring.
    const timer = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);
    return () => clearTimeout(timer);
  }, [location.hash]);

  const handleThemeToggle = () => {
    setIsDarkMode((value) => {
      const next = !value;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const card = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const subtle = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`${isDarkMode ? 'bg-black text-gray-100' : 'bg-gray-50 text-gray-900'} min-h-screen`}>
      <Header
        isDarkMode={isDarkMode}
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      <Breadcrumb items={[{ label: 'Help & guide' }]} isDarkMode={isDarkMode} activeMenu={activeMenu} />
      <div className="container mx-auto flex max-w-6xl gap-6 p-4">
        <nav className="sticky top-4 hidden h-fit w-52 shrink-0 text-sm lg:block" aria-label="Guide contents">
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${subtle}`}>Contents</p>
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`block rounded px-2 py-1 ${location.hash === `#${s.id}` ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200'}`}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">Help &amp; guide</h1>
            <p className={`text-sm ${subtle}`}>How to use each part of Nala Auto. The “?” button on any page opens the matching section.</p>
          </div>
          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className={`scroll-mt-4 space-y-2 rounded-xl border p-4 text-sm leading-relaxed shadow-sm [&_a]:text-indigo-600 [&_a:hover]:underline ${card}`}
            >
              <h2 className="text-lg font-semibold">
                <a href={`#${s.id}`} className="!text-inherit">{s.title}</a>
              </h2>
              {s.body}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
