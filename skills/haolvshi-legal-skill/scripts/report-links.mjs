function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeRouteBase(value) {
  const route = String(value || '').trim();
  if (!route || route === '/') return '';
  return `/${route.replace(/^\/+|\/+$/g, '')}`;
}

function frontendBase(config) {
  const siteBase = trimTrailingSlash(config.siteBase);
  const routeBase = normalizeRouteBase(config.siteRouteBase);
  return routeBase && !siteBase.endsWith(routeBase)
    ? `${siteBase}${routeBase}`
    : siteBase;
}

function queryString(values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  return query.toString();
}

export function questionReportUrl(config, recordId) {
  const query = queryString({ appId: config.appId, device_type: config.deviceType });
  return `${frontendBase(config)}/g/r/${encodeURIComponent(recordId)}?${query}`;
}

export function contractReportUrl(config, pvId) {
  const query = queryString({ id: pvId, appId: config.appId, device_type: config.deviceType });
  return `${frontendBase(config)}/contract_review/detail?${query}`;
}

export function pleadingDownloadUrl(config, recordId, extension = 'docx') {
  const query = queryString({ appId: config.appId, deviceType: config.deviceType });
  const safeExtension = String(extension || 'docx').replace(/^\.+/, '').toLowerCase();
  return `${trimTrailingSlash(config.apiBase)}/indictment/download/${encodeURIComponent(recordId)}.${encodeURIComponent(safeExtension)}?${query}`;
}

export const RESULT_LINK_LABELS = Object.freeze({
  consultation: '法律咨询报告',
  calculator: '法律计算报告',
  contract: '合同审核报告',
  complaint: '起诉状（Word）',
  defense: '答辩状（Word）'
});

export const RESULT_GROUNDING_POLICY = Object.freeze({
  sourceOfTruth: 'generated_result_only',
  allowedSources: Object.freeze([
    'generated_report_or_document_content',
    'laws_cases_and_authorities_embedded_in_that_result'
  ]),
  reportContentControls: true,
  externalSearchAllowed: false,
  externalLookupAllowed: false,
  supplementalLegalResearchAllowed: false,
  addAuthoritiesNotInResultAllowed: false
});

export function resultGroundingPolicy(capability) {
  if (!RESULT_LINK_LABELS[capability]) throw new TypeError(`未知结果能力：${capability}`);
  return {
    ...RESULT_GROUNDING_POLICY,
    allowedSources: [...RESULT_GROUNDING_POLICY.allowedSources],
    capability,
    instruction: '最终总结、结论和法律依据只能来自已生成的报告或文书，以及其中已经列明的法规、案例和其他依据；不得再搜索、查询或补充外部内容。'
  };
}

function markdownLink(label, url) {
  const safeLabel = String(label || '').replace(/([\[\]])/g, '\\$1');
  return `[${safeLabel}](${String(url || '')})`;
}

function passiveLink(type, url, label, extra = {}) {
  return {
    type,
    label,
    url,
    markdown: markdownLink(label, url),
    autoOpen: false,
    openBehavior: 'user_click_only',
    ...extra
  };
}

export function onlineReportLink(url, label = '在线报告') {
  return passiveLink('online_report', url, label);
}

export function downloadFileLink(url, label = '下载文件', format = 'docx') {
  return passiveLink('download', url, label, { format });
}

export function capabilityResultLink(capability, url) {
  const label = RESULT_LINK_LABELS[capability];
  if (!label) throw new TypeError(`未知结果链接能力：${capability}`);
  return ['complaint', 'defense'].includes(capability)
    ? downloadFileLink(url, label)
    : onlineReportLink(url, label);
}
