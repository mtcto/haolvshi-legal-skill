#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient } from './api-client.mjs';
import { loadConfig } from './config.mjs';
import { normalizeError, SkillError } from './errors.mjs';
import { StateStore } from './state-store.mjs';
import {
  generateQuestionReport,
  questionCatalog,
  questionResume,
  questionSelectionInteraction,
  replyQuestion,
  startQuestion
} from './question-workflow.mjs';
import { resumeContract, reviewContract } from './contract-workflow.mjs';
import {
  extractPleading,
  generatePleading,
  pleadingCatalog,
  pleadingResume,
  startPleading,
  updatePleading
} from './pleading-workflow.mjs';
import {
  attachCaseContext,
  materialExtractionRequired,
  prepareCaseMaterials,
  publicCaseContext,
  queryWithCaseContext
} from './case-materials.mjs';
import {
  currentTaskEvidencePolicy,
  prependCurrentTaskEvidenceInstruction
} from './evidence-policy.mjs';

const CAPABILITY_ALIASES = new Map([
  ['consultation', 'consultation'],
  ['法律咨询', 'consultation'],
  ['法律咨询报告', 'consultation'],
  ['calculator', 'calculator'],
  ['法律计算器', 'calculator'],
  ['contract', 'contract'],
  ['合同审核', 'contract'],
  ['智能合同审核', 'contract'],
  ['complaint', 'complaint'],
  ['起诉状', 'complaint'],
  ['defense', 'defense'],
  ['答辩状', 'defense']
]);

function normalizeCapability(input) {
  const value = input?.capability;
  if (!value) return input;
  return { ...input, capability: CAPABILITY_ALIASES.get(String(value)) || value };
}

// 交互结构同时服务于多种宿主。默认命令行调用只需要保留执行下一步的
// 唯一表示，避免低能力模型在每轮阅读 fields、choices、JSON Schema 和
// renderPlan 等重复载荷。传入 {"verbose":true} 可取得完整兼容载荷。
const COMPACT_INTERACTION_KEYS = [
  'type',
  'title',
  'description',
  'step',
  'steps',
  'fields',
  'submitLabel',
  'summary',
  'view',
  'presentation',
  'caseContext',
  'evidenceScope',
  'native',
  'suggestedChoices',
  'optionManifest',
  'textFallback',
  'sequence',
  'followUp'
];

function compactInteraction(interaction) {
  if (!interaction || typeof interaction !== 'object') return interaction;
  return Object.fromEntries(
    COMPACT_INTERACTION_KEYS
      .filter(key => interaction[key] !== undefined)
      .map(key => [key, interaction[key]])
  );
}

function compactResult(result, input) {
  if (!result?.interaction || input.verbose === true) return result;
  const interaction = compactInteraction(result.interaction);
  const data = result.data && interaction.caseContext && result.data.caseContext
    ? (() => {
        const { caseContext, ...rest } = result.data;
        return rest;
      })()
    : result.data;
  return { ...result, interaction, ...(data ? { data } : {}) };
}

async function readInput(argv) {
  const fileIndex = argv.indexOf('--input');
  if (fileIndex >= 0) {
    const filePath = argv[fileIndex + 1];
    if (!filePath) throw new SkillError('INPUT_FILE_REQUIRED', '--input 后需要提供 JSON 文件路径');
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  }
  const jsonIndex = argv.indexOf('--json');
  if (jsonIndex >= 0) {
    const text = argv[jsonIndex + 1];
    if (!text) throw new SkillError('INPUT_JSON_REQUIRED', '--json 后需要提供 JSON 内容');
    return JSON.parse(text);
  }
  if (process.stdin.isTTY) return {};
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

async function catalog({ api, config, input }) {
  const materials = await prepareCaseMaterials(input);
  if (materials.unresolvedFiles.length) {
    return materialExtractionRequired({
      capability: input.capability || 'case_materials',
      unresolvedFiles: materials.unresolvedFiles
    });
  }
  const caseContext = publicCaseContext(materials);
  const query = queryWithCaseContext(input.query, materials);
  let candidates;
  if (['consultation', 'calculator'].includes(input.capability)) {
    candidates = await questionCatalog(api, config, input.capability, query, input.limit);
  } else if (['complaint', 'defense'].includes(input.capability)) {
    candidates = await pleadingCatalog(api, config, input.capability, query, input.limit);
  } else {
    throw new SkillError('CAPABILITY_INVALID', 'catalog 支持法律咨询、法律计算器、起诉状和答辩状');
  }
  return {
    ok: true,
    capability: input.capability,
    stage: 'catalog',
    prompt: candidates.length
      ? '请仅结合当前任务内用户陈述和材料匹配项目或模板；只有存在直接、明确、唯一的依据时才能自动选择。禁止使用全局记忆、其他任务、其他线程、旧案例或示例补充 query 或选择项目。没有匹配或仍有实质歧义时必须把完整候选项交给用户，不得自动选择“不清楚”“其他”或任意默认项目。法律咨询和计算器项目要同时参考父级领域与具体项目名称。提问时必须调用兼容原生选择组件，渲染前后核对 interaction.optionManifest 的预期选项数，全部候选项须按原顺序和完整标签显示；数量不符、截断或遗漏时不得让用户作答，必须更换能完整承载的原生组件，或在原生表单/输入组件内完整列出全部编号候选项。只有确认没有任何兼容原生组件后才展示完整 textFallback。'
      : '没有找到匹配项目，请调整关键词。',
    interaction: candidates.length && ['consultation', 'calculator'].includes(input.capability)
      ? attachCaseContext(questionSelectionInteraction(candidates), caseContext)
      : null,
    data: { candidates, caseContext }
  };
}

async function extractCaseMaterials({ input }) {
  const materials = await prepareCaseMaterials(input);
  if (materials.unresolvedFiles.length) {
    return materialExtractionRequired({
      capability: input.capability || 'case_materials',
      unresolvedFiles: materials.unresolvedFiles
    });
  }
  return {
    ok: true,
    capability: input.capability || 'case_materials',
    stage: 'materials_ready',
    prompt: '当前任务的案件材料已经提取。只把 data.caseContext 用于本次任务的项目或模板选择及字段作答；禁止与全局记忆、其他任务、其他线程、旧案例或示例合并，也不要向用户复述材料全文。',
    data: { caseContext: publicCaseContext(materials) }
  };
}

async function health({ api, config }) {
  const [appDetail, consultations, calculators, complaints, defenses] = await Promise.all([
    api.get(`/app/detailByAppId/${config.appId}`, {
      query: { appId: config.appId, deviceType: config.deviceType }
    }),
    questionCatalog(api, config, 'consultation', '', 1),
    questionCatalog(api, config, 'calculator', '', 1),
    pleadingCatalog(api, config, 'complaint', '', 1),
    pleadingCatalog(api, config, 'defense', '', 1)
  ]);
  let siteConfig = {};
  try {
    siteConfig = typeof appDetail?.config === 'string'
      ? JSON.parse(appDetail.config || '{}')
      : appDetail?.config || {};
  } catch {
    siteConfig = {};
  }
  const contractConfig = siteConfig?.llm?.contract;
  const contractConfigured = Boolean(
    contractConfig
    && typeof contractConfig === 'object'
    && typeof contractConfig.apiKey === 'string'
    && contractConfig.apiKey.trim()
  );
  return {
    ok: true,
    stage: 'healthy',
    prompt: contractConfigured
      ? '技能服务目录访问正常，站点合同审核配置已就绪。'
      : '技能服务目录访问正常，但未检测到完整的站点合同审核配置。',
    data: {
      apiBase: config.apiBase,
      appId: config.appId,
      consultation: consultations.length > 0,
      calculator: calculators.length > 0,
      complaint: complaints.length > 0,
      defense: defenses.length > 0,
      contract: contractConfigured,
      contractCheck: contractConfigured
        ? '已检测到 llm.contract 配置；健康检查不会返回密钥，也不会发起实际合同审核。'
        : '未检测到包含有效 apiKey 的 llm.contract 配置。'
    }
  };
}

async function resume({ api, config, store, input }) {
  const state = await store.load(input.sessionId);
  if (['consultation', 'calculator'].includes(state.capability)) return questionResume(state, config);
  if (state.capability === 'contract') return resumeContract({ api, config, store, state });
  if (['complaint', 'defense'].includes(state.capability)) return pleadingResume(state, config);
  throw new SkillError('SESSION_CAPABILITY_INVALID', '任务状态中的能力类型无法识别');
}

async function cleanup({ store, input }) {
  if (input.sessionId) {
    await store.remove(input.sessionId);
    return { ok: true, stage: 'cleaned', prompt: '指定任务数据已经清理。', data: { sessionId: input.sessionId } };
  }
  const removed = await store.cleanup();
  return { ok: true, stage: 'cleaned', prompt: '过期任务数据已经清理。', data: { removed } };
}

export async function runCommand(command, rawInput = {}, dependencies = {}) {
  const input = normalizeCapability(rawInput || {});
  const config = dependencies.config || loadConfig();
  const api = dependencies.api || new ApiClient(config);
  const store = dependencies.store || new StateStore(config);

  const context = { api, config, store, input };
  const handlers = {
    health,
    'case-materials': extractCaseMaterials,
    catalog,
    'question-start': startQuestion,
    'question-reply': replyQuestion,
    'question-report': generateQuestionReport,
    'contract-review': reviewContract,
    'pleading-start': startPleading,
    'pleading-extract': extractPleading,
    'pleading-update': updatePleading,
    'pleading-generate': generatePleading,
    resume,
    cleanup
  };
  const handler = handlers[command];
  if (!handler) {
    throw new SkillError('COMMAND_NOT_FOUND', `未知命令：${command || '空'}`, {
      details: { commands: Object.keys(handlers) }
    });
  }
  const result = await handler(context);
  if (!result || typeof result !== 'object') return result;
  return compactResult({
    ...result,
    prompt: prependCurrentTaskEvidenceInstruction(result.prompt),
    evidencePolicy: currentTaskEvidencePolicy(result.sessionId || input.sessionId || null)
  }, input);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  try {
    const input = await readInput(argv.slice(1));
    const result = await runCommand(command, input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const normalized = normalizeError(error);
    process.stdout.write(`${JSON.stringify({ ok: false, stage: 'error', error: normalized }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

async function sameEntryFile(entry) {
  if (!entry) return false;
  const [modulePath, entryPath] = await Promise.all([
    fs.realpath(fileURLToPath(import.meta.url)),
    fs.realpath(path.resolve(entry)).catch(() => path.resolve(entry))
  ]);
  return modulePath === entryPath;
}

const invokedAsScript = await sameEntryFile(process.argv[1]);
if (invokedAsScript) await main();
