import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';
import Header from '../components/Header';
import { bcReportBase, resultsHref, styleFor, useBcSummary } from '../lib/labRuns';

const POLL_MS = 15000;

const VERDICT = {
  pass: { label: 'Looks good', tone: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' },
  review: { label: 'Needs review', tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200' },
  fail: { label: 'Failed', tone: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200' },
  running: { label: 'Running…', tone: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200' },
};
const RANK = { fail: 4, running: 3, review: 2, pass: 1 };
const worst = (list) => list.filter(Boolean).reduce((acc, v) => ((RANK[v] || 0) > (RANK[acc] || 0) ? v : acc), 'pass');

async function api(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function useTheme() {
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);
  const toggle = () => setIsDarkMode((value) => {
    localStorage.setItem('theme', value ? 'light' : 'dark');
    return !value;
  });
  return [isDarkMode, toggle];
}

const prLabel = (pr) => `${pr.owner}/${pr.repo}#${pr.number}`;

function Section({ title, hint, checked, onChange, disabled, children }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <label className={`flex items-start gap-2 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
        <input type="checkbox" className="mt-1" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <span className="font-medium">{title}</span>
          {hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
        </span>
      </label>
      {children && <div className="mt-2 pl-6 text-xs">{children}</div>}
    </div>
  );
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  hint: PropTypes.string,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  children: PropTypes.node,
};

const UrlList = ({ lines }) => (
  <ul className="max-h-40 space-y-0.5 overflow-auto font-mono text-[11px] text-gray-600 dark:text-gray-300">
    {lines.map((line) => <li key={line} className="break-all">{line}</li>)}
  </ul>
);

UrlList.propTypes = { lines: PropTypes.arrayOf(PropTypes.string).isRequired };

function PlanView({ data, onStart, starting }) {
  const { pr, plan } = data;
  const [pick, setPick] = useState(() => ({
    testUrls: plan.testUrls.recommended,
    blocks: plan.blocks.recommended,
    bc: plan.bc.recommended,
    datasets: [...(plan.datasets.suggested || (plan.datasets.recommended ? plan.datasets.names : []))],
  }));
  const toggleDataset = (name, on) => setPick((p) => ({
    ...p,
    datasets: on ? [...new Set([...p.datasets, name])] : p.datasets.filter((d) => d !== name),
  }));
  const nothing = !(pick.testUrls && plan.testUrls.lines.length) && !(pick.blocks && plan.blocks.lines.length)
    && !(pick.bc && plan.bc.url) && !pick.datasets.length;
  const { changes } = plan;

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div>
        <a href={pr.htmlUrl} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{prLabel(pr)} · {pr.title}</a>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {pr.author} · branch <code>{pr.branch}</code> · {pr.state}
          {pr.milolibs && <> · B side uses <code>{pr.milolibs}</code></>}
          {!pr.isMilo && pr.branchHost && <> · compares <code>{pr.mainHost}</code> vs <code>{pr.branchHost}</code></>}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {changes.files} files · blocks: {changes.blocks.join(', ') || 'none'} · shared: {changes.shared.length}
          {changes.bc && ' · Brand Concierge'}
        </p>
      </div>

      <Section
        title={`PR test URLs (${plan.testUrls.lines.length})`}
        hint="From the PR description. Before/After pairs are compared directly; other URLs run with and without the branch."
        checked={pick.testUrls && plan.testUrls.lines.length > 0}
        disabled={!plan.testUrls.lines.length}
        onChange={(v) => setPick((p) => ({ ...p, testUrls: v }))}
      >
        {plan.testUrls.lines.length > 0 && <UrlList lines={plan.testUrls.lines} />}
      </Section>

      <Section
        title={`Changed blocks (${plan.blocks.lines.length} pages)`}
        hint="A quick run of the dataset pages that match a changed block. Not needed when that dataset runs in full below."
        checked={pick.blocks && plan.blocks.lines.length > 0}
        disabled={!plan.blocks.lines.length}
        onChange={(v) => setPick((p) => ({ ...p, blocks: v }))}
      >
        {plan.blocks.lines.length > 0 && <UrlList lines={plan.blocks.lines} />}
        {plan.blocks.uncovered.length > 0 && (
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            No test page for: {plan.blocks.uncovered.join(', ')}. Add rows to a dataset to cover them.
          </p>
        )}
      </Section>

      <Section
        title="Full datasets"
        hint={plan.datasets.available ? `Picked because ${plan.datasets.reason}. Runs with the PR's milolibs and compares against each dataset's baseline.` : `Not available: ${plan.datasets.reason}.`}
        checked={pick.datasets.length > 0}
        disabled={!plan.datasets.available}
        onChange={(v) => setPick((p) => ({ ...p, datasets: v ? [...(plan.datasets.suggested?.length ? plan.datasets.suggested : plan.datasets.names)] : [] }))}
      >
        {plan.datasets.available && (
          <div className="flex flex-wrap gap-3">
            {[...plan.datasets.names, ...plan.datasets.extra].map((name) => (
              <label key={name} className="flex items-center gap-1">
                <input type="checkbox" checked={pick.datasets.includes(name)} onChange={(e) => toggleDataset(name, e.target.checked)} />
                {name}
                {plan.datasets.covering?.includes(name) && <span className="text-emerald-600 dark:text-emerald-400">(covers changed blocks)</span>}
                {plan.datasets.extra.includes(name) && <span className="text-gray-400">(consumer)</span>}
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Brand Concierge agent"
        hint={plan.bc.url ? plan.bc.url : 'Only offered when BC files change and the PR has a test URL.'}
        checked={pick.bc && Boolean(plan.bc.url)}
        disabled={!plan.bc.url}
        onChange={(v) => setPick((p) => ({ ...p, bc: v }))}
      />

      {plan.notes.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">
          {plan.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      <button
        type="button"
        disabled={nothing || starting}
        onClick={() => onStart(pick)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {starting ? 'Starting…' : 'Run checks'}
      </button>
    </div>
  );
}

PlanView.propTypes = {
  data: PropTypes.shape({ pr: PropTypes.object.isRequired, plan: PropTypes.object.isRequired }).isRequired,
  onStart: PropTypes.func.isRequired,
  starting: PropTypes.bool.isRequired,
};

const bcVerdict = (run, summary) => {
  if (run.verdict !== null || run.runKind !== 'bc' || !run.done) return run.verdict;
  if (!summary) return 'running';
  return /^pass/i.test(summary.status) ? 'pass' : 'review';
};

function RunCard({ run, onVerdict }) {
  const bcSummary = useBcSummary(run.runKind === 'bc' && run.mode === 'live' ? run : null);
  const verdict = bcVerdict(run, bcSummary);
  useEffect(() => { onVerdict(run.runId, verdict); }, [run.runId, verdict, onVerdict]);
  const style = styleFor(verdict);
  const href = resultsHref(run);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
          <span className="font-medium">{run.label}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{style.label} · {run.status}</span>
        </div>
        <div className="flex gap-3 text-xs">
          {href && <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">Results</a>}
          {run.htmlUrl && <a href={run.htmlUrl} target="_blank" rel="noreferrer" className="text-gray-500 hover:underline">GitHub run</a>}
        </div>
      </div>
      {(run.note || bcSummary) && (
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
          {bcSummary ? `BC agent ${bcSummary.status} ${bcSummary.passed ?? ''}/${bcSummary.total ?? ''}` : run.note}
          {run.runKind === 'bc' && run.done && run.mode === 'live' && (
            <> · <a href={`${bcReportBase(run.runId)}/report.html`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">report</a></>
          )}
        </p>
      )}
      {run.pages?.length > 0 && (
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-gray-500 dark:text-gray-400">
            <tr><th className="py-1 pr-2">Page</th><th className="py-1 pr-2">Diff</th><th className="py-1">Detail</th></tr>
          </thead>
          <tbody>
            {run.pages.map((p) => (
              <tr key={p.key} className="border-t border-gray-100 dark:border-gray-800">
                <td className="max-w-md truncate py-1 pr-2 font-mono" title={p.urls || p.key}>{p.urls || p.key}</td>
                <td className="py-1 pr-2">{p.diffPct == null ? '—' : `${p.diffPct.toFixed(1)}%`}</td>
                <td className="py-1 text-gray-500 dark:text-gray-400">
                  {p.error || (p.status ? `${p.status}${p.refDiffPct != null ? ` (baseline ${p.refDiffPct.toFixed(1)}%)` : ''}` : '')}
                  {p.heightDelta ? ` height ${p.heightDelta > 0 ? '+' : ''}${p.heightDelta}px` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

RunCard.propTypes = {
  run: PropTypes.shape({
    runId: PropTypes.string.isRequired,
    label: PropTypes.string,
    runKind: PropTypes.string,
    mode: PropTypes.string,
    status: PropTypes.string,
    done: PropTypes.bool,
    verdict: PropTypes.string,
    note: PropTypes.string,
    htmlUrl: PropTypes.string,
    pages: PropTypes.arrayOf(PropTypes.object),
  }).isRequired,
  onVerdict: PropTypes.func.isRequired,
};

function CheckView({ id }) {
  const [check, setCheck] = useState(null);
  const [error, setError] = useState('');
  const [bcVerdicts, setBcVerdicts] = useState({});
  const onVerdict = useCallback((runId, v) => setBcVerdicts((m) => (m[runId] === v ? m : { ...m, [runId]: v })), []);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = async () => {
      try {
        const body = await api(`/lab/pr-checks/${encodeURIComponent(id)}`);
        if (cancelled) return;
        setCheck(body);
        setError('');
        if (body.runs.some((r) => r.verdict === 'running' || (r.runKind === 'bc' && !r.done))) timer = setTimeout(load, POLL_MS);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);

  const verdict = useMemo(() => {
    if (!check) return null;
    return worst([check.verdict, ...check.runs.map((r) => bcVerdicts[r.runId] ?? r.verdict)]);
  }, [check, bcVerdicts]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!check) return <p className="text-sm text-gray-500">Loading…</p>;
  const { pr, plan } = check;
  const v = VERDICT[verdict] || VERDICT.running;
  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${v.tone}`}>
        <div className="text-xs uppercase tracking-wide opacity-70">Verdict</div>
        <div className="text-xl font-semibold">{v.label}</div>
        <a href={pr.htmlUrl} target="_blank" rel="noreferrer" className="text-sm hover:underline">{prLabel(pr)} · {pr.title}</a>
        <p className="text-xs opacity-80">
          branch <code>{pr.branch}</code>{pr.milolibs && <> · <code>{pr.milolibs}</code></>} · started {new Date(check.createdAt).toLocaleString()}
        </p>
      </div>
      {plan.blocks.uncovered.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Not covered — no test page for changed block{plan.blocks.uncovered.length > 1 ? 's' : ''}: <b>{plan.blocks.uncovered.join(', ')}</b>. Check these by hand.
        </p>
      )}
      {check.errors?.length > 0 && (
        <ul className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {check.errors.map((e) => <li key={e.label}>{e.label}: {e.error}</li>)}
        </ul>
      )}
      {check.runs.map((run) => <RunCard key={run.runId} run={run} onVerdict={onVerdict} />)}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Quick runs flag pages whose A/B diff is over 1% or whose height moved more than 40px. Dataset runs flag pages that changed vs. the accepted baseline (flaky pages ignored). Open Results to inspect or ask the AI judge.
      </p>
    </div>
  );
}

CheckView.propTypes = { id: PropTypes.string.isRequired };

export default function PrCheckPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isDarkMode, toggleTheme] = useTheme();
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [url, setUrl] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (id) return;
    api('/lab/pr-checks').then((b) => setRecent(b.checks || [])).catch(() => {});
  }, [id]);

  const preview = async (e) => {
    e.preventDefault();
    setBusy('plan');
    setError('');
    setPlan(null);
    try {
      setPlan(await api('/lab/pr-checks/plan', { method: 'POST', body: JSON.stringify({ url }) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const start = async (pick) => {
    setBusy('start');
    setError('');
    try {
      const check = await api('/lab/pr-checks', { method: 'POST', body: JSON.stringify({ url, ...pick }) });
      navigate(`/pr/${check.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={`${isDarkMode ? 'bg-black text-gray-100' : 'bg-gray-50 text-gray-900'} min-h-screen`}>
      <Header isDarkMode={isDarkMode} handleThemeToggle={toggleTheme} activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
      <Breadcrumb
        items={id ? [{ label: 'PR check', link: '/pr' }, { label: id }] : [{ label: 'PR check' }]}
        isDarkMode={isDarkMode}
        activeMenu={activeMenu}
      />
      <main className="container mx-auto max-w-4xl space-y-5 p-4">
        <div>
          <h1 className="text-2xl font-semibold">PR check</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Paste a PR link. nala-auto reads the branch and changed files, runs the visual checks that cover it and rolls them up into one verdict.
            {' '}<Link to="/help#pr-check" className="text-blue-600 hover:underline dark:text-blue-400">How it works</Link>
          </p>
        </div>

        {id ? <CheckView id={id} /> : (
          <>
            <form onSubmit={preview} className="flex flex-wrap gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/adobecom/milo/pull/1234"
                className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
              <button type="submit" disabled={!url.trim() || busy === 'plan'} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900">
                {busy === 'plan' ? 'Reading PR…' : 'Plan checks'}
              </button>
            </form>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            {plan && <PlanView key={`${plan.pr.number}-${plan.pr.headSha}`} data={plan} onStart={start} starting={busy === 'start'} />}
            {recent.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold">Recent PR checks</h2>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white text-sm dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
                  {recent.map((c) => (
                    <li key={c.id}>
                      <Link to={`/pr/${c.id}`} className="flex justify-between gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <span className="truncate">{prLabel(c.pr)} · {c.pr.title}</span>
                        <span className="shrink-0 text-xs text-gray-500">{c.runs} run{c.runs === 1 ? '' : 's'} · {new Date(c.createdAt).toLocaleString()}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
