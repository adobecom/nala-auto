// Dataset menu groups come from the backend (server/workflowSites.js
// SITE_GROUPS + user-added CUSTOM), so the header search, sidebar, home page
// and Run Console all list the same sites. The static SITE_GROUPS copy is
// only a fallback while /lab/sites is unreachable.
import { useEffect, useState } from 'react';
import { SITE_GROUPS } from './sites';
import { CUSTOM_DATASETS_EVENT } from './customDatasets';

const fallback = (custom = []) => ({ ...SITE_GROUPS, CUSTOM: custom });

export async function fetchSiteGroups() {
  try {
    const res = await fetch('/lab/sites', { cache: 'no-store' });
    if (!res.ok) return fallback();
    const { sites, groups } = await res.json();
    if (groups && typeof groups === 'object') return groups;
    return fallback(Array.isArray(sites) ? sites : []);
  } catch {
    return fallback();
  }
}

// Drops empty groups (CUSTOM is usually empty) so menus don't render a bare heading.
export function useSiteGroups() {
  const [groups, setGroups] = useState(() => fallback());
  useEffect(() => {
    let alive = true;
    const refresh = () => fetchSiteGroups().then((g) => { if (alive) setGroups(g); });
    refresh();
    window.addEventListener(CUSTOM_DATASETS_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(CUSTOM_DATASETS_EVENT, refresh);
    };
  }, []);
  return Object.fromEntries(Object.entries(groups).filter(([, sites]) => sites?.length));
}
