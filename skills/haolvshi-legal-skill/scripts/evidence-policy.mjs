export const CURRENT_TASK_EVIDENCE_INSTRUCTION = '证据边界：本技能的五类能力只能使用当前任务/当前对话线程内的用户消息、用户在当前任务上传或粘贴的材料、当前 sessionId 已保存的答案，以及当前任务内较新的明确更正。禁止读取、搜索、引用或推断 WorkBuddy/宿主的全局记忆、长期记忆、用户画像、其他任务、其他线程、旧案例、旧报告、示例、评测、交接文档、测试记录或日志；也禁止把这些内容写入 query、content、caseContext、answers、patches、合同立场、项目或模板选择。当前任务信息不足时必须向用户提问。';

const ALLOWED_SOURCES = [
  'current_task_user_messages',
  'current_task_user_materials',
  'current_session_saved_answers',
  'current_task_explicit_corrections'
];

const FORBIDDEN_SOURCES = [
  'persistent_or_global_memory',
  'memory_tools_or_memory_search',
  'user_profile_or_persona_memory',
  'other_tasks',
  'other_threads_or_conversations',
  'old_cases_or_reports_not_supplied_in_current_task',
  'skill_examples',
  'evaluation_cases',
  'handoff_documents',
  'test_records_or_logs'
];

export function currentTaskEvidencePolicy(sessionId = null) {
  return {
    mode: 'current_task_only',
    scope: 'current_task_thread',
    sessionId: sessionId || null,
    allowedSources: [...ALLOWED_SOURCES],
    forbiddenSources: [...FORBIDDEN_SOURCES],
    globalMemoryAllowed: false,
    memoryToolAllowed: false,
    crossTaskMemoryAllowed: false,
    otherConversationHistoryAllowed: false,
    userProfileMemoryAllowed: false,
    examplesAreEvidence: false,
    currentUserMessageMustRemainLiteral: true,
    currentUserQueryMustNotBeExpandedWithMemory: true,
    reuseSavedAnswersOnlyForExactSessionId: true,
    onMissingCurrentTaskEvidence: 'ask_user'
  };
}

export function prependCurrentTaskEvidenceInstruction(prompt = '') {
  const text = String(prompt || '').trim();
  return text ? `${CURRENT_TASK_EVIDENCE_INSTRUCTION}\n\n${text}` : CURRENT_TASK_EVIDENCE_INSTRUCTION;
}
