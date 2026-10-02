export const BUILTIN_SITES = [
  'bacom', 'bacom-blog', 'cc', 'da-marketo', 'da-marketo-prod', 'dc',
  'express', 'graybox-bacom', 'graybox-cc', 'graybox-dc', 'graybox-upp',
  'homepage', 'uar',
];

export function screenshotSiteInputs(site) {
  return BUILTIN_SITES.includes(site)
    ? { site }
    : { site: 'custom', custom_site: site };
}

// Single source of truth for the dataset menus (header, sidebar, home page)
// and the Run Console picker. Sites outside BUILTIN_SITES still run fine:
// screenshotSiteInputs() sends them as `custom_site`, which the workflow
// loads from drafts/nala/screenshotdiff/data/<name>.json.
export const SITE_GROUPS = {
  MILOCORE: ['milo', 'caas', 'uar', 'feds'],
  CONSUMER: ['sot', 'homepage', 'dc', 'cc', 'bacom', 'bacom-blog', 'express'],
  GRAYBOX: ['graybox-bacom', 'graybox-cc', 'graybox-dc', 'graybox-upp'],
  MARKETO: ['da-marketo', 'da-marketo-prod'],
};

// Groups plus a CUSTOM group for user-added datasets not already listed.
export function siteGroups(customSites = []) {
  const known = new Set(Object.values(SITE_GROUPS).flat());
  return {
    ...Object.fromEntries(Object.entries(SITE_GROUPS).map(([k, v]) => [k, [...v]])),
    CUSTOM: customSites.filter((s) => !known.has(s)),
  };
}

export function allSites(customSites = []) {
  return [...new Set([...BUILTIN_SITES, ...Object.values(siteGroups(customSites)).flat()])];
}
