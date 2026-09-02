---
name: haolvshi-legal-skill
display_name: 好律狮法律技能包
display_name_en: HaoLvShi Legal Skill
description: "好律狮法律技能包。只要用户提出具体法律问题、要求计算赔偿或费用、审核合同、生成起诉状或生成答辩状，就应使用本技能调用好律狮专业法律服务接口完成流程；典型表达包括“离婚财产如何分割”“帮我审核这份合同”“生成离婚起诉状”“帮我写答辩状”“交通事故能赔多少钱”。支持多轮问答、结构化表单、附件上传、多个当事人、在线报告查看和法律文书直接下载。"
description_zh: "基于好律狮法律服务接口的专业法律技能，支持法律咨询报告、赔偿计算、智能合同审核、起诉状生成与答辩状生成。一句话提出问题，技能会引导补充关键事实，并交付在线报告或 Word 文书。"
description_en: "Professional legal workflows via HaoLvShi APIs for consultation reports, compensation calculators, contract review, complaints and answers. One sentence starts a guided flow that delivers an online report or a Word document."
compatibility: "需要网络访问、临时文件读写和 shell 或 PowerShell 执行能力；技能会自动检查并准备 Node.js 运行环境。"
license: MIT-0
metadata:
  version: "1.8"
  homepage: https://skills.ai.lvpin100.com
  display_name: 好律狮法律技能包
  description_zh: "基于好律狮法律服务接口的专业法律技能，支持法律咨询报告、赔偿计算、智能合同审核、起诉状生成与答辩状生成。一句话提出问题，技能会引导补充关键事实，并交付在线报告或 Word 文书。"
---

# 好律狮法律技能包

## 工作原则

1. 首次调用前先执行“运行环境准备”。不要仅因用户未安装 Node.js 而停止；环境脚本会自动检查并在缺少时安装技能专用运行环境。
2. 根据用户真实目的选择一项能力：法律咨询报告、法律计算器、智能合同审核、起诉状生成、答辩状生成。
3. 调用脚本取得线上项目、题目、模板和结果。不要自行虚构项目编号、问题节点、计算结果或法律文书模板。
4. 用户上传案件文件时先读 `references/case-materials.md` 并完成材料识别；不得静默忽略附件。所有需要用户输入的步骤都先读 `references/interaction.md`，再处理脚本返回的 `prompt` 和 `interaction`。保留 `sessionId`，后续调用都使用同一个任务编号。
5. 五类能力统一执行“当前任务证据边界”：只能使用当前任务/当前线程内的用户消息、当前任务上传或粘贴的材料、当前 `sessionId` 已保存的答案，以及当前任务内较新的明确更正。禁止读取、搜索、引用或推断 WorkBuddy/宿主的全局记忆、长期记忆、用户画像、其他任务、其他线程、旧案例、旧报告、示例、评测、交接文档、测试记录或日志；禁止把这些内容写入 `query`、`content`、`caseContext`、`answers`、`patches`、合同立场、项目或模板选择。当前任务信息不足时必须向用户提问。
6. 调用 `catalog`、`question-start`、`pleading-start` 时，`query` 必须忠实保留当前任务中用户本次表达，不得用记忆扩写；调用 `pleading-extract` 时，`content` 只能汇总当前任务消息。恢复流程只能复用与当前任务明确对应的原 `sessionId`，不得加载其他任务编号。
7. 每次取得 `interaction`，先用当前任务内用户陈述、当前任务材料、当前 `sessionId` 回答和当前任务最新更正匹配 `fields[0]`。只有直接、明确、唯一匹配时才按字段 `key` 调用 `question-reply`；没有匹配就立即向用户提问，不猜测或默认选择。
8. 非必填且为空的姓名、电话、手机号、身份证号、证件号码等敏感字段由脚本保留空值并直接跳过；居住地、实际居住地、户籍地、住所地等地区字段不得跳过，因为它们会影响政策、地方法规或计算标准。重复记录中的姓名也不得跳过。
9. 确需提问时直接调用 `interaction.native.batches[0]` 的原生组件，不先解释，不打印 `interaction`。脚本已把普通填空题组装成与后端普通选择题相同的标准 `single_select`，并写入 2 至 4 个建议选项；宿主不得再次生成候选、改写题目或把它降级成文本输入。用户选择后，脚本会把金额、数字、日期等显示标签转换回后端值。
10. 多填题和追加题由脚本拆成小题；每轮只处理 `interaction.fields[0]`。用户回答后继续调用 `question-reply` 获取下一小题，全部子字段回答完成前不得向后端提交父题；全部完成后脚本一次提交完整节点。
11. 渲染选择题时按 `optionManifest` 核对选项数量、顺序和完整标签。原生组件确实不可用时才使用完整 `textFallback`，不得截断、合并、缩写或重排选项。
12. 文本降级中的选项统一从 `1` 开始编号。用户回复数字时按当前显示顺序解析；用户回复选项文字时按文字解析。使用原生控件时优先把选中的 `answer` 或标签映射回字段 `key`。
13. 后端节点和值由脚本保管，不要让用户看到或修改原始节点、内部字段键和中间 JSON。
14. 文书生成前展示完整摘要并核对当事人、请求或答辩意见、事实理由；合同审核前确认用户在当前任务中代表甲方还是乙方。文书字段已经由当前任务消息或材料可靠填写时，不逐字段要求用户重复确认。
15. 最终回复中的摘要、结论、计算依据、风险意见和法律依据只能忠实来自本次已生成的报告或文书，以及其中已经列明的法规、案例和其他依据。生成结果后不得再调用网页搜索、法律数据库检索、联网查询或其他外部查询工具，不得自行补充报告之外的法规、案例、观点或结论；若模型常识或外部信息与报告不同，以报告为准。随后原样输出 `links[0].markdown`，不得调用浏览器、网页打开、预览、导航或自动点击工具。链接名称固定与能力对应：`法律咨询报告`、`法律计算报告`、`合同审核报告`、`起诉状（Word）`、`答辩状（Word）`。

## 运行环境准备

macOS 或 Linux 首次使用时执行：

```bash
sh scripts/bootstrap.sh --ensure
```

Windows 首次使用时执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 -Ensure
```

脚本会优先复用系统中符合要求的 Node.js；缺少或版本低于 20 时，从 Node.js 官方站点下载并校验技能专用的 Node.js 22 运行环境，无需管理员权限。后续统一通过 `run.sh` 或 `run.ps1` 调用，包装脚本仍会进行轻量检查，环境缺失时自动补齐。

## 运行脚本

在本技能目录中执行。macOS 或 Linux：

```bash
sh scripts/run.sh <命令>
```

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 <命令>
```

通过标准输入传入 JSON，避免把案情、合同内容和身份信息写进命令行参数：

```bash
printf '%s' '{"capability":"calculator","query":"交通事故赔偿"}' \
  | sh scripts/run.sh catalog
```

脚本始终返回 JSON。`ok=true` 表示调用成功；`stage` 表示当前流程阶段；`ok=false` 时按 `error.retryable` 和 `references/errors.md` 处理。

## 能力路由

### 法律咨询报告

先读 `references/consultation.md`；用户上传案件材料时同时读 `references/case-materials.md`。

1. 有上传文件时先用 `case-materials` 提取内容；PDF、Word、表格或图片需要宿主阅读时，把结果作为 `extractedTexts` 传入。提取内容同时用于项目选择和后续自动作答。
2. 调用 `catalog`，`capability` 使用 `consultation`。
3. 项目接口固定携带 `m=2`。选择项目时综合材料内容、`parentName` 与 `name`，优先使用 `displayName` 表示的“父级领域 > 具体项目”，不要选择没有 `projectId` 的分类节点。
4. 选择项目后调用 `question-start`，并传入 `filePaths` 与 `extractedTexts`；如果前一步单独调用了 `case-materials`，也可以把返回的 `data.caseContext` 原样作为 `caseContext` 传入。
5. 每取得一道 `interaction`，只匹配当前任务消息、当前任务材料、当前 `sessionId` 回答和 `interaction.caseContext`；唯一匹配时直接调用 `question-reply`，否则立即调用 `interaction.native.batches[0]`。脚本已把普通填空题转换为带 2 至 4 个建议选项的标准 `single_select`，宿主不再生成候选。每轮只处理 `fields[0]`；非必填空敏感字段由脚本跳过，居住地和户籍地等地区字段仍须处理。
6. 若 `question-reply` 返回 `stage=needs_follow_up`，说明当前选项带有追加题。仍只用当前任务证据自动回答追加题；确实缺少答案时才呈现当前 `interaction`。追加题全部完成前不要请求或假设后端下一题，脚本会把主答案和追加答案合并为同一个父题节点后再调用后端。
7. `stage=ready_for_report` 后调用 `question-report`。

### 法律计算器

先读 `references/calculator.md`；用户上传案件材料时同时读 `references/case-materials.md`。

1. 有上传文件时先用 `case-materials` 提取病历、票据、事故认定书、工资证明等内容；PDF、Word、表格或图片由宿主阅读后作为 `extractedTexts` 传入。
2. 调用 `catalog`，`capability` 使用 `calculator`。
3. 项目接口固定携带 `m=1`。同时参考材料内容、父级和具体项目名称，选择最贴近用户事项的计算器。
4. 调用 `question-start` 并传入当前任务材料上下文；计算器与法律咨询统一使用 `/question/answer`。每次只匹配当前任务消息、当前任务材料、当前 `sessionId` 回答和 `interaction.caseContext`，唯一匹配时直接调用 `question-reply`；否则直接调用当前 `native.batches[0]`。普通填空题已由脚本转换为带 2 至 4 个建议选项的标准单选题。多填题每轮只处理 `fields[0]`，全部完成后才提交；非必填空敏感字段由脚本跳过，居住地和户籍地等地区字段仍须处理。
5. 只有当前任务证据不足以回答当前题时才一题一页询问用户。若返回 `stage=needs_follow_up`，仍先尝试用当前任务材料回答选项下的追加题；追加题完成前脚本不会调用后端，全部完成后才把主答案与追加答案一起提交并取得下一道题。
6. `stage=ready_for_report` 后调用 `question-report`。

### 智能合同审核

先读 `references/contract-review.md`。

只检查当前任务中用户是否说明本次合同审核立场；禁止从全局记忆、其他任务、其他线程、用户画像、旧合同、旧报告或示例推断甲乙方。如果当前任务尚未说明，必须用宿主原生单选工具询问“您是甲方还是乙方？”。只有确认当前会话没有任何兼容原生组件时，才显示“1. 甲方、2. 乙方”，并允许用户直接回复 `1` 或 `2`。取得回答后，再收集当前任务中用户提供的合同文件并调用 `contract-review`；立场未知时不得上传文件、创建审核记录或发起审核。正常调用会等待 `/contract/audit` 直接返回审核结果，不查询详情接口。只有连接中断并且脚本返回当前任务的可恢复任务编号时，才调用 `resume` 查询一次。

### 起诉状、答辩状

先读 `references/pleading.md`；用户上传案件材料时同时读 `references/case-materials.md`。

1. 调用 `catalog`，起诉状使用 `complaint`，答辩状使用 `defense`。
2. 选择模板后调用 `pleading-start`。
3. 将当前任务/当前线程中用户已经提供的全部案情忠实汇总到 `content`，连同当前任务的 `filePaths`、兼容旧调用的 `imagePaths` 和宿主提取的 `extractedTexts` 调用 `pleading-extract`；文本文件会直接读取，图片由后端识别，PDF、Word和表格先由宿主提取。禁止混入其他任务、其他线程、旧案例或旧文书；当前任务已有案情或材料时不要要求用户重新描述一遍。
4. 使用 `pleading-update` 分步骤处理字段、维护多个当事人。每个步骤、字段页或当事人卡片都只依据当前任务消息、当前任务材料、当前 `sessionId` 提取值和当前任务更正自动填写；当前视图已可靠完成时直接切换下一页或下一步。通过 `focus` 一次只展开一位当事人的卡片，通过 `fieldPage` 切换普通字段页，只向用户询问无法可靠补全的字段。
5. 自动填写不等于虚构或默认：任何当前可填写字段只要在当前任务证据中没有直接、明确、唯一的答案，就必须询问用户；非必填字段也不能由 AI 留空或跳过。进入确认生成步骤后仍须展示完整摘要，由用户一次性确认。
6. 用户确认摘要后调用 `pleading-generate`，并传入 `confirmed=true`；生成完成后只展示 `links[0].markdown`，不得自动打开或预览文书。

## 会话恢复和清理

- 用户要求继续当前任务时，只使用与当前任务明确对应的原 `sessionId`；不得从全局记忆或其他任务猜测、搜索或加载任务编号。
- `resume` 不会重复提交答案、审核或文书生成。
- 完成后可以调用 `cleanup` 删除指定任务材料。
- 技能也会清理超过二十四小时的临时任务。

## 输出要求

- 咨询报告：核心结论、法律分析、行动建议、法规案例和 `[法律咨询报告](链接地址)`。
- 计算结果：总金额、分项金额、计算依据、关键输入和 `[法律计算报告](链接地址)`。
- 合同审核：风险数量、风险等级、重点条款、修改建议和 `[合同审核报告](链接地址)`。
- 起诉状和答辩状：当事人、请求或答辩意见、事实理由摘要，以及 `[起诉状（Word）](链接地址)` 或 `[答辩状（Word）](链接地址)`。
- 上述摘要、结论、金额、风险、建议和法律依据只能从脚本返回的最终报告或文书内容及其内嵌法规、案例中提取；不得在生成后再次搜索、查询或添加外部内容，报告未写明的内容不作补充。
- 最终链接统一使用脚本返回的 `links[0].markdown`，只作为 Markdown 超链接显示。禁止自动打开、预览或导航，也不要用本地文件路径替代用户入口。

## 隐私与安全

- 只把完成当前流程所需的信息发送到好律狮服务接口。
- 不在回复和日志中输出身份证号、合同全文、服务端配置或密钥。
- 用户要求删除本地任务材料时立即调用 `cleanup`。
- 接口返回登录、验证码、付费或配置错误时，直接说明实际限制，不绕过服务端校验。
