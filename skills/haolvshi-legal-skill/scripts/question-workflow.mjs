import { SkillError } from './errors.mjs';
import {
  applyAnswersToNodes,
  nextUnresolvedInteraction,
  normalizeQuestionNodes,
  onlyAutoSkippableFieldsRemain,
  parseMaybeJson,
  plainText,
  unansweredFields,
  withInteractionRendering
} from './interaction-normalizer.mjs';
import { buildQuestionReportHtml, reportSummary } from './report-builder.mjs';
import {
  capabilityResultLink,
  questionReportUrl,
  resultGroundingPolicy
} from './report-links.mjs';
import {
  attachCaseContext,
  materialExtractionRequired,
  prepareCaseMaterials,
  publicCaseContext,
  queryWithCaseContext
} from './case-materials.mjs';

const CAPABILITY_MODULE = {
  consultation: 2,
  calculator: 1
};

const CAPABILITY_TYPE = {
  consultation: 2,
  calculator: 1
};

const QUESTION_INTERACTION_PROMPT = '只处理 interaction.fields[0]：当前任务有唯一答案就调用 question-reply；否则直接呈现 native.batches[0]，不猜测、不解释、不重建选项。脚本会处理格式、追加题和多填题。';

const FOLLOW_UP_INTERACTION_PROMPT = '只处理当前追加题：有唯一当前任务答案就提交，否则呈现 native.batches[0]；全部追加题完成前不要请求下一题。';

function questionInteractionPrompt() {
  return QUESTION_INTERACTION_PROMPT;
}

function nextQuestionInteraction(interaction) {
  const next = nextUnresolvedInteraction(interaction);
  if (next) return next;
  if (!interaction) return null;
  const visibleFields = (interaction.fields || []).filter(field => {
    const empty = field.value === undefined
      || field.value === null
      || (typeof field.value === 'string' && field.value.trim() === '');
    return !(empty && (field.displayOnly || field.skipIfOptionalSensitive));
  });
  return visibleFields.length
    ? withInteractionRendering({ ...interaction, fields: visibleFields })
    : null;
}

function compactText(value) {
  return String(value || '').toLowerCase().replace(/[\s，。！？、,.!?：:；;（）()《》【】\[\]>/\\_-]/g, '');
}

function grams(value) {
  const text = compactText(value);
  const values = new Set();
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= text.length - size; index += 1) {
      values.add(text.slice(index, index + size));
    }
  }
  return values;
}

function scoreCandidate(candidate, query) {
  if (!query) return 1;
  const target = compactText(query);
  const name = compactText(candidate.name);
  const parentName = compactText(candidate.parentName || candidate.category);
  const alias = compactText(candidate.alias);
  const categoryNames = compactText((candidate.categories || []).map(category => category.name || category.title || '').join(''));
  const path = compactText(candidate.displayName || [...(candidate.path || []), candidate.name].join(''));
  if (name === target) return 30_000;
  if (path === target) return 29_000;
  let score = 0;
  if (name && (name.includes(target) || target.includes(name))) score += 12_000 + Math.min(name.length, target.length) * 20;
  if (parentName && target.includes(parentName)) score += 8_000 + parentName.length * 20;
  if (path && (path.includes(target) || target.includes(path))) score += 6_000 + Math.min(path.length, target.length) * 10;
  if (alias && (alias.includes(target) || target.includes(alias))) score += 4_000;
  if (categoryNames && (categoryNames.includes(target) || target.includes(categoryNames))) score += 2_000;
  const weightedSources = [[name, 5], [parentName, 3], [path, 2], [alias, 2], [categoryNames, 1]];
  const queryGrams = grams(target);
  for (const [source, weight] of weightedSources) {
    if (!source) continue;
    for (const gram of queryGrams) if (source.includes(gram)) score += gram.length ** 2 * weight;
  }
  return score;
}

export function rankCatalog(items, query, limit = 8) {
  return items
    .map(item => ({ ...item, _score: scoreCandidate(item, query) }))
    .filter(item => !query || item._score > 0)
    .sort((a, b) => b._score - a._score || String(a.name).localeCompare(String(b.name), 'zh-CN'))
    .slice(0, limit)
    .map(({ _score, ...item }) => item);
}

function normalizedProject(item, nameById) {
  const parentName = item.onlineProjectParentName
    || nameById.get(String(item.parentId || ''))
    || '';
  const name = item.name || item.onlineProjectName || '';
  const path = [parentName, name].filter(Boolean);
  return {
    id: item.appOnlineId || item.id || item.projectId,
    projectId: item.projectId || null,
    appOnlineId: item.appOnlineId || null,
    sourceProjectId: item.id || null,
    parentId: item.parentId || null,
    parentName,
    name,
    category: parentName,
    path,
    displayName: path.join(' > '),
    alias: item.alias || '',
    categories: Array.isArray(item.categories)
      ? item.categories.map(category => ({ id: category.id || null, name: category.name || category.title || '' }))
      : [],
    module: item.module,
    price: item.price ?? null
  };
}

export async function questionCatalog(api, config, capability, query, limit) {
  const module = CAPABILITY_MODULE[capability];
  if (!module) throw new SkillError('CAPABILITY_INVALID', '能力应为 consultation 或 calculator');
  const items = await api.get(`/app/projects/${config.appId}`, {
    query: { appId: config.appId, m: module }
  });
  const source = Array.isArray(items) ? items : [];
  const nameById = new Map(source.map(item => [
    String(item.id || ''),
    item.name || item.onlineProjectName || ''
  ]));
  const normalized = source.map(item => normalizedProject(item, nameById));
  const actionable = normalized.filter(item => item.projectId && item.appOnlineId);
  return rankCatalog(actionable.length ? actionable : normalized.filter(item => item.id), query, limit);
}

function questionResponse(raw, title) {
  const parsed = parseMaybeJson(raw) || {};
  const nodes = parsed.node || parsed.answer || [];
  const normalizedNodes = Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
  const finished = Number(parsed.status) === 0 && normalizedNodes.length === 0;
  return {
    parsed,
    nodes: normalizedNodes,
    finished,
    interaction: finished ? null : normalizeQuestionNodes(nodes, {
        form: false,
        title,
        description: parsed.msg || parsed.remark || ''
      })
  };
}

function optionId(option) {
  return String(option?.id ?? option?.code ?? option?.value ?? '');
}

function selectedOption(node, option) {
  if (option?.value === true) return true;
  const selected = Array.isArray(node?.value) ? node.value : [node?.value];
  return selected
    .filter(value => value !== undefined && value !== null && value !== '')
    .some(value => String(value) === optionId(option));
}

function selectedFollowUpsForNode(node, nodePath) {
  const descriptors = [];
  const children = Array.isArray(node?.children) ? node.children : [];
  children.forEach((option, optionIndex) => {
    if (!selectedOption(node, option)) return;
    const add = Array.isArray(option?.add) ? option.add : [];
    add.forEach((followUp, addIndex) => {
      if (!followUp || typeof followUp !== 'object') return;
      descriptors.push({
        path: [...nodePath, 'children', optionIndex, 'add', addIndex],
        parentQuestion: plainText(node?.title || node?.name || ''),
        selectedOption: plainText(option?.title || option?.name || option?.label || ''),
        mode: followUp?.config?.addType === 'follow' ? 'inline' : 'dialog'
      });
    });
  });
  return descriptors;
}

function selectedFollowUpsForNodes(nodes) {
  const source = Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
  return source.flatMap((node, index) => selectedFollowUpsForNode(node, [index]));
}

function valueAtPath(root, path) {
  return path.reduce((current, part) => current?.[part], root);
}

function setValueAtPath(root, path, value) {
  if (!path.length) throw new SkillError('FOLLOW_UP_PATH_INVALID', '追加题路径不正确');
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    current = current?.[path[index]];
    if (!current) throw new SkillError('FOLLOW_UP_PATH_INVALID', '没有找到当前追加题，请重新开始本题');
  }
  current[path[path.length - 1]] = value;
}

function followUpInteraction(state) {
  const descriptor = state.followUpQueue?.[state.followUpIndex];
  const node = descriptor ? valueAtPath(state.pendingAnswerNodes, descriptor.path) : null;
  if (!descriptor || !node) {
    throw new SkillError('FOLLOW_UP_STATE_INVALID', '追加题状态不完整，请重新开始本题');
  }
  const context = descriptor.selectedOption
    ? `当前主选项为“${descriptor.selectedOption}”。${FOLLOW_UP_INTERACTION_PROMPT}`
    : FOLLOW_UP_INTERACTION_PROMPT;
  const normalized = normalizeQuestionNodes([node], {
    form: false,
    title: plainText(node?.title || '请回答追加题'),
    description: context
  });
  // 一般追加题只暴露下一个未回答字段；若整题只剩可自动跳过的敏感字段，
  // 则保留完整标准化结果，供 continueFollowUpQueue 识别并直接跳过。
  const next = nextQuestionInteraction(normalized) || normalized;
  const interaction = attachCaseContext({
    ...next,
    kind: 'follow_up',
    followUp: {
      current: state.followUpIndex + 1,
      total: state.followUpQueue.length,
      parentQuestion: descriptor.parentQuestion,
      selectedOption: descriptor.selectedOption,
      mode: descriptor.mode
    }
  }, state.caseContext);
  return {
    descriptor,
    node,
    interaction
  };
}

function followUpResult(state, prompt) {
  const current = followUpInteraction(state);
  return {
    ok: true,
    capability: state.capability,
    stage: 'needs_follow_up',
    sessionId: state.sessionId,
    prompt: prompt || FOLLOW_UP_INTERACTION_PROMPT,
    interaction: current.interaction,
    data: {
      recordId: state.recordId,
      backendRequestPending: true,
      followUp: current.interaction.followUp,
      progress: state.lastResponse?.p ?? null,
      currentCount: state.lastResponse?.curCount ?? null
    }
  };
}

async function submitQuestionAnswer({ api, config, store, state, answeredNodes }) {
  const identity = await store.identity();
  const raw = await api.put('/question/answer', {
    action: 2,
    id: state.recordId,
    answer: answeredNodes,
    appId: config.appId,
    deviceType: config.deviceType
  }, { userId: identity.userId, unwrap: false });
  const response = questionResponse(raw, state.project.displayName || state.project.name);
  state.rawNodes = response.nodes;
  state.lastResponse = response.parsed;
  state.stage = response.finished ? 'ready_for_report' : 'collecting';
  delete state.pendingAnswerNodes;
  delete state.followUpQueue;
  delete state.followUpIndex;
  await store.save(state);

  return {
    ok: true,
    capability: state.capability,
    stage: state.stage,
    sessionId: state.sessionId,
    prompt: response.finished
      ? '信息收集完成，请调用 question-report 生成最终报告。'
      : questionInteractionPrompt(),
    interaction: attachCaseContext(nextQuestionInteraction(response.interaction), state.caseContext),
    data: {
      recordId: state.recordId,
      progress: response.parsed.p ?? null,
      currentCount: response.parsed.curCount ?? null,
      caseContext: publicCaseContext(state.caseContext)
    }
  };
}

async function submitQuestionAnswerAndAdvance({ api, config, store, state, answeredNodes }) {
  let result = await submitQuestionAnswer({ api, config, store, state, answeredNodes });
  let attempts = 0;
  while (state.stage === 'collecting' && attempts < 50) {
    const pending = normalizeQuestionNodes(state.rawNodes, { form: false });
    if (!onlyAutoSkippableFieldsRemain(pending)) break;
    attempts += 1;
    result = await submitQuestionAnswer({
      api,
      config,
      store,
      state,
      answeredNodes: state.rawNodes
    });
  }
  return result;
}

async function continueFollowUpQueue({ api, config, store, state, prompt }) {
  let skipped = 0;
  while (state.followUpIndex < state.followUpQueue.length) {
    const current = followUpInteraction(state);
    if (!onlyAutoSkippableFieldsRemain(current.interaction)) {
      await store.save(state);
      return followUpResult(state, prompt);
    }
    state.followUpIndex += 1;
    skipped += 1;
    if (skipped >= 50) {
      throw new SkillError('FOLLOW_UP_SKIP_LOOP', '追加题自动跳过次数异常，请重新开始本题');
    }
  }

  return submitQuestionAnswerAndAdvance({
    api,
    config,
    store,
    state,
    answeredNodes: state.pendingAnswerNodes
  });
}

async function replyFollowUp({ api, config, store, state, input }) {
  const current = followUpInteraction(state);
  const hasAnswer = Boolean(input.rawAnswer) || Object.keys(input.answers || {}).length > 0;
  if (!hasAnswer && onlyAutoSkippableFieldsRemain(current.interaction)) {
    state.followUpIndex += 1;
    return continueFollowUpQueue({
      api,
      config,
      store,
      state,
      prompt: '当前追加题属于非必填敏感信息，已保留空值并跳过。继续处理下一道追加题。'
    });
  }
  const answers = input.answers || {};
  let answeredNode;
  if (input.rawAnswer) {
    const rawAnswer = structuredClone(input.rawAnswer);
    answeredNode = Array.isArray(rawAnswer) ? rawAnswer[0] : rawAnswer;
  } else if (Object.keys(answers).length > 0) {
    answeredNode = applyAnswersToNodes([current.node], answers)[0];
  } else {
    throw new SkillError('QUESTION_ANSWER_REQUIRED', '请提供当前追加题的答案');
  }

  const answeredInteraction = normalizeQuestionNodes([answeredNode], {
    form: false,
    title: plainText(answeredNode?.title || '请回答追加题')
  });
  const unanswered = unansweredFields(answeredInteraction);
  const missing = unanswered.map(field => field.label);
  setValueAtPath(state.pendingAnswerNodes, current.descriptor.path, answeredNode);
  state.rawNodes = state.pendingAnswerNodes;
  if (missing.length) {
    await store.save(state);
    return followUpResult(state, `当前追加题仍有尚未回答的内容：${missing.join('、')}。无论后端是否标记必填，都必须把这些题目返回给用户本人填写或选择；不得留空、自动跳过或直接提交。`);
  }

  const nested = selectedFollowUpsForNode(answeredNode, current.descriptor.path);
  if (nested.length) {
    state.followUpQueue.splice(state.followUpIndex + 1, 0, ...nested);
  }
  state.followUpIndex += 1;

  if (state.followUpIndex < state.followUpQueue.length) {
    return continueFollowUpQueue({
      api,
      config,
      store,
      state,
      prompt: FOLLOW_UP_INTERACTION_PROMPT
    });
  }

  return continueFollowUpQueue({
    api,
    config,
    store,
    state,
    prompt: FOLLOW_UP_INTERACTION_PROMPT
  });
}

export function questionSelectionInteraction(candidates, title = '请选择最匹配的项目') {
  return withInteractionRendering({
    type: 'question',
    title,
    description: '选择时同时考虑父级领域和具体项目名称。',
    fields: [{
      key: 'projectId',
      label: title,
      type: 'single_select',
      required: true,
      value: '',
      options: candidates.map(candidate => ({
        value: candidate.id,
        label: candidate.displayName || candidate.name,
        description: candidate.parentName || '',
        disabled: false
      }))
    }],
    submitLabel: '确认项目'
  });
}

async function chooseProject(api, config, input) {
  const candidates = await questionCatalog(api, config, input.capability, input.query, 10);
  if (input.projectId) {
    const exact = candidates.find(item => [item.id, item.projectId, item.appOnlineId, item.sourceProjectId].includes(input.projectId));
    if (exact) return { project: exact, candidates };
    const all = await questionCatalog(api, config, input.capability, '', 500);
    const byId = all.find(item => [item.id, item.projectId, item.appOnlineId, item.sourceProjectId].includes(input.projectId));
    if (byId) return { project: byId, candidates: all };
    throw new SkillError('PROJECT_NOT_FOUND', '没有找到指定咨询或计算项目');
  }
  const target = compactText(input.query);
  const exactMatches = target
    ? candidates.filter(item => [item.name, item.displayName].some(value => compactText(value) === target))
    : [];
  if (exactMatches.length === 1) return { project: exactMatches[0], candidates };
  if (candidates.length === 1) return { project: candidates[0], candidates };
  return { project: null, candidates };
}

export async function startQuestion({ api, config, store, input }) {
  const capability = input.capability;
  const module = CAPABILITY_MODULE[capability];
  if (!module) throw new SkillError('CAPABILITY_INVALID', '能力应为 consultation 或 calculator');
  const materials = await prepareCaseMaterials(input);
  if (materials.unresolvedFiles.length) {
    return materialExtractionRequired({ capability, unresolvedFiles: materials.unresolvedFiles });
  }
  const caseContext = publicCaseContext({
    ...materials,
    text: [String(input.query || '').trim(), materials.text].filter(Boolean).join('\n')
  });
  const routedInput = { ...input, query: queryWithCaseContext(input.query, materials) };
  const { project, candidates } = await chooseProject(api, config, routedInput);
  if (!project) {
    return {
      ok: true,
      capability,
      stage: 'needs_selection',
      prompt: '只用当前任务内用户原始问题和当前任务材料匹配唯一项目；禁止用全局记忆、其他任务、其他线程、旧案例或示例扩写 query 或补充案情。无法唯一匹配时直接渲染 interaction.native.batches 中的完整项目选项，不得自行默认选择。',
      interaction: attachCaseContext(questionSelectionInteraction(candidates), caseContext),
      data: { candidates, caseContext }
    };
  }

  const identity = await store.identity();
  const type = CAPABILITY_TYPE[capability];
  const projectDetail = await api.get(`/question/project/${project.id}`, {
    query: { appId: config.appId, deviceType: config.deviceType, type },
    userId: identity.userId
  });
  const recordId = await api.get(`/question/getRecordId/${project.id}`, {
    query: {
      appId: config.appId,
      deviceType: config.deviceType,
      type,
      pvId: projectDetail?.pvId
    },
    userId: identity.userId
  });

  const raw = await api.put('/question/answer', {
    action: 1,
    id: recordId,
    appId: config.appId,
    deviceType: config.deviceType
  }, { userId: identity.userId, unwrap: false });
  const response = questionResponse(raw, project.displayName || project.name);
  const state = await store.create({
    capability,
    stage: response.finished ? 'ready_for_report' : 'collecting',
    project,
    projectDetail,
    recordId,
    rawNodes: response.nodes,
    lastResponse: response.parsed,
    caseContext
  });

  if (onlyAutoSkippableFieldsRemain(response.interaction)) {
    return submitQuestionAnswerAndAdvance({
      api,
      config,
      store,
      state,
      answeredNodes: state.rawNodes
    });
  }

  return {
    ok: true,
    capability,
    stage: state.stage,
    sessionId: state.sessionId,
    prompt: response.finished
      ? '信息收集已经完成，可以生成报告。'
      : questionInteractionPrompt(),
    interaction: attachCaseContext(nextQuestionInteraction(response.interaction), caseContext),
    data: {
      project,
      recordId,
      progress: response.parsed.p ?? null,
      currentCount: response.parsed.curCount ?? null,
      caseContext
    }
  };
}

export async function replyQuestion({ api, config, store, input }) {
  const state = await store.load(input.sessionId);
  if (!['consultation', 'calculator'].includes(state.capability)) {
    throw new SkillError('SESSION_CAPABILITY_MISMATCH', '该任务不是咨询或计算器任务');
  }
  if (state.stage === 'ready_for_report' || state.stage === 'completed') {
    throw new SkillError('QUESTION_ALREADY_FINISHED', '信息收集已经完成，请生成报告');
  }
  if (state.stage === 'needs_follow_up') {
    return replyFollowUp({ api, config, store, state, input });
  }
  const current = normalizeQuestionNodes(state.rawNodes, { form: false });
  const answers = input.answers || {};
  let answeredNodes = state.rawNodes;
  if (input.rawAnswer) answeredNodes = input.rawAnswer;
  else if (Object.keys(answers).length > 0) answeredNodes = applyAnswersToNodes(state.rawNodes, answers);
  else {
    throw new SkillError('QUESTION_ANSWER_REQUIRED', '请提供当前问题的答案');
  }
  const answeredInteraction = normalizeQuestionNodes(answeredNodes, { form: false });

  const unanswered = unansweredFields(answeredInteraction);
  const missing = unanswered.map(field => field.label);
  if (missing.length) {
    const remainingInteraction = nextQuestionInteraction(answeredInteraction);
    state.rawNodes = answeredNodes;
    state.stage = 'needs_input';
    await store.save(state);
    return {
      ok: true,
      capability: state.capability,
      stage: 'needs_input',
      sessionId: state.sessionId,
      prompt: `已保存匹配到的答案。${questionInteractionPrompt()}`,
      interaction: attachCaseContext(remainingInteraction, state.caseContext),
      data: {
        missing,
        unanswered,
        expected: current.fields.map(field => field.key),
        caseContext: publicCaseContext(state.caseContext)
      }
    };
  }

  const followUps = selectedFollowUpsForNodes(answeredNodes);
  if (followUps.length) {
    state.pendingAnswerNodes = answeredNodes;
    state.rawNodes = answeredNodes;
    state.followUpQueue = followUps;
    state.followUpIndex = 0;
    state.stage = 'needs_follow_up';
    return continueFollowUpQueue({
      api,
      config,
      store,
      state,
      prompt: FOLLOW_UP_INTERACTION_PROMPT
    });
  }

  return submitQuestionAnswerAndAdvance({ api, config, store, state, answeredNodes });
}

export async function generateQuestionReport({ api, config, store, input }) {
  const state = await store.load(input.sessionId);
  if (!['consultation', 'calculator'].includes(state.capability)) {
    throw new SkillError('SESSION_CAPABILITY_MISMATCH', '该任务不是咨询或计算器任务');
  }
  if (state.stage !== 'ready_for_report' && input.force !== true) {
    throw new SkillError('QUESTION_NOT_FINISHED', '当前问题尚未回答完毕');
  }
  const identity = await store.identity();
  const reportResponse = parseMaybeJson(await api.put('/question/report', {
    id: state.recordId,
    appId: config.appId,
    deviceType: config.deviceType
  }, { userId: identity.userId, unwrap: false, accept: 'text/plain' }));

  let related = { laws: [], caseList: [] };
  const warnings = [];
  try {
    related = await api.get(`/question/getCasesAndLawArticles/${state.recordId}`, {
      query: { appId: config.appId },
      userId: identity.userId
    }) || related;
  } catch (error) {
    warnings.push(`相关法规和案例获取失败：${error.message}`);
  }

  const title = `${state.project.name}${state.capability === 'calculator' ? '计算报告' : '法律咨询报告'}`;
  const html = buildQuestionReportHtml({ title, reportContent: reportResponse, related });
  try {
    await api.post('/question/saveReport', {
      recordId: state.recordId,
      appId: config.appId,
      html: Buffer.from(html, 'utf8').toString('base64'),
      cover: null
    }, { userId: identity.userId });
  } catch (error) {
    warnings.push(`报告已生成但保存到服务端失败：${error.message}`);
  }

  const reportUrl = questionReportUrl(config, state.recordId);
  state.stage = 'completed';
  state.result = reportResponse;
  state.related = related;
  state.reportUrl = reportUrl;
  state.links = [capabilityResultLink(state.capability, reportUrl)];
  await store.save(state);
  const resultPolicy = resultGroundingPolicy(state.capability);

  return {
    ok: true,
    capability: state.capability,
    stage: 'completed',
    sessionId: state.sessionId,
    prompt: `报告已经生成。最终总结、结论和法律依据只能忠实使用 data.report 及 data.related 中已经写入报告的内容；不得调用网页搜索、法律数据库检索、联网查询或其他外部查询工具，不得补充报告中没有的法规、案例或观点。展示摘要和关键结论后，只输出 links[0].markdown（${state.links[0].markdown}）；禁止调用浏览器、网页打开、预览或导航工具，报告必须由用户点击链接后自行打开。`,
    data: {
      recordId: state.recordId,
      summary: reportSummary(reportResponse),
      report: reportResponse,
      related,
      reportUrl,
      reportLinkMarkdown: state.links[0].markdown
    },
    resultPolicy,
    links: state.links,
    warnings
  };
}

export function questionResume(state, config) {
  const regularQuestion = ['collecting', 'needs_input', 'needs_confirmation'].includes(state.stage);
  const followUp = state.stage === 'needs_follow_up' ? followUpInteraction(state) : null;
  const interaction = followUp?.interaction || (regularQuestion
    ? nextQuestionInteraction(normalizeQuestionNodes(state.rawNodes, {
        form: false,
        title: state.project?.name
      }))
    : null);
  const reportUrl = state.reportUrl || (state.stage === 'completed' && state.recordId
    ? questionReportUrl(config, state.recordId)
    : null);
  const reportLink = reportUrl ? capabilityResultLink(state.capability, reportUrl) : null;
  const resultPolicy = reportLink ? resultGroundingPolicy(state.capability) : null;
  return {
    ok: true,
    capability: state.capability,
    stage: state.stage,
    sessionId: state.sessionId,
    prompt: state.stage === 'needs_follow_up'
      ? FOLLOW_UP_INTERACTION_PROMPT
      : regularQuestion
      ? `任务已经恢复。${questionInteractionPrompt()}`
      : state.stage === 'ready_for_report'
        ? '信息收集已经完成，可以生成报告。'
        : reportLink
          ? `任务已经完成。最终总结只能依据已生成报告及报告内法规、案例和其他依据，不得搜索、查询或补充外部内容；只输出 links[0].markdown（${reportLink.markdown}），禁止自动打开、预览或导航到报告页面。`
          : '任务已经完成。',
    interaction: attachCaseContext(interaction, state.caseContext),
    data: {
      project: state.project,
      recordId: state.recordId,
      summary: state.result ? plainText(JSON.stringify(state.result)).slice(0, 1000) : null,
      reportUrl,
      reportLinkMarkdown: reportLink?.markdown || null,
      backendRequestPending: state.stage === 'needs_follow_up',
      followUp: followUp?.interaction.followUp || null,
      caseContext: publicCaseContext(state.caseContext)
    },
    resultPolicy,
    links: reportLink ? [reportLink] : []
  };
}
