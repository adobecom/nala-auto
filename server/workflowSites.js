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
