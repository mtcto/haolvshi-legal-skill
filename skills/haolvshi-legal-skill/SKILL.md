---
name: haolvshi-legal-skill
display_name: 好律狮法律技能包
display_name_en: HaoLvShi Legal Skill
description: "好律狮法律技能包。只要用户提出具体法律问题、要求计算赔偿或费用、审核合同、生成起诉状或生成答辩状，就应使用本技能调用好律狮专业法律服务接口完成流程；典型表达包括“离婚财产如何分割”“帮我审核这份合同”“生成离婚起诉状”“帮我写答辩状”“交通事故能赔多少钱”。支持多轮问答、结构化表单、附件上传、多个当事人、在线报告查看和法律文书直接下载。"
version: "1.9"
description_zh: "基于好律狮法律服务接口的专业法律技能，支持法律咨询报告、赔偿计算、智能合同审核、起诉状生成与答辩状生成。一句话提出问题，技能会引导补充关键事实，并交付在线报告或 Word 文书。"
description_en: "Professional legal workflows via HaoLvShi APIs for consultation reports, compensation calculators, contract review, complaints and answers. One sentence starts a guided flow that delivers an online report or a Word document."
compatibility: "需要网络访问、临时文件读写和 shell 或 PowerShell 执行能力；技能会自动检查并准备 Node.js 运行环境。"
license: MIT-0
metadata:
  version: "1.9"
  homepage: https://skills.ai.lvpin100.com
  display_name: 好律狮法律技能包
  description_zh: "基于好律狮法律服务接口的专业法律技能，支持法律咨询报告、赔偿计算、智能合同审核、起诉状生成与答辩状生成。一句话提出问题，技能会引导补充关键事实，并交付在线报告或 Word 文书。"
---

# 好律狮法律技能包

## 默认快速路径

按下面的顺序直接执行，不要先规划整套流程、复述规则或推演后端节点；脚本会保存状态并返回下一步。

1. 首次调用运行环境准备；之后只用 `run.sh` 或 `run.ps1` 调用命令。
2. 根据用户目的选择一项能力：法律咨询、法律计算器、合同审核、起诉状或答辩状；目的不明确时只问用户要哪一种。
3. 只使用当前任务/当前线程的信息、当前上传材料、同一 `sessionId` 的保存答案和较新的明确更正。不得读取或使用全局记忆、其他任务、旧案例或猜测；缺少事实就提问。
4. 每次只处理脚本返回的 `stage`、`prompt` 和当前 `interaction`。命令默认只返回执行下一步所需的精简交互载荷；保存 `sessionId`，“继续”只能恢复用户明确对应的同一任务。
5. 对当前 `fields[0]` 有直接且唯一依据时，以字段 `key` 调用 `question-reply`；没有唯一依据时立刻呈现 `interaction.native.batches[0]`，不要重新生成选项、解释流程或打印内部 JSON。
6. 脚本会处理普通填空题建议选项、追加题、多填题、非必填空敏感字段和答案格式。每轮只处理当前字段；地区与重复记录姓名仍需用户确认。
7. 最终摘要只能依据本次生成的报告或文书；不再搜索或补充外部法律信息。原样输出 `links[0].markdown`，不自动打开链接。

默认不读取参考文档。只有命中下表情形时才按需读取对应文件，避免每轮重复加载长规则。

| 情形 | 读取 |
| --- | --- |
| 上传或无法读取材料 | `references/case-materials.md` |
| 原生控件不可用、选项过多、追加题或多当事人 | `references/interaction.md`；需要兼容载荷时在原命令输入中加 `"verbose": true` |
| 材料、控件之外的能力异常 | 对应能力参考或 `references/errors.md` |

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

调用 `catalog`（`capability: consultation`），选定返回的具体 `projectId` 后调用 `question-start`；`stage=ready_for_report` 时调用 `question-report`。目录和问答异常才读 `references/consultation.md`。

### 法律计算器

调用 `catalog`（`capability: calculator`），选定返回的具体 `projectId` 后调用 `question-start`；`stage=ready_for_report` 时调用 `question-report`。目录和问答异常才读 `references/calculator.md`。

### 智能合同审核

先确认用户在当前任务中代表甲方或乙方；未知时直接呈现脚本返回的原生单选。确认立场和当前合同文件后调用 `contract-review`。仅在连接中断且脚本给出本任务 `sessionId` 时调用一次 `resume`；不轮询。格式或恢复异常才读 `references/contract-review.md`。

### 起诉状、答辩状

调用 `catalog`（起诉状为 `complaint`，答辩状为 `defense`），选择模板后调用 `pleading-start`，再把当前任务案情和材料传给 `pleading-extract`。按脚本的当前字段页或当事人卡片调用 `pleading-update`；只问没有唯一依据的字段。确认摘要后以 `confirmed: true` 调用 `pleading-generate`。多当事人、材料或字段页异常才读 `references/pleading.md`。

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
