<p align="center">
  <img src="_icon.png" alt="好律狮法律技能包图标" width="128" height="128">
</p>

<h1 align="center">好律狮法律技能包</h1>

<p align="center">面向 AI Agent 的中文法律服务技能</p>

<p align="center">
  <a href="https://github.com/mtcto/haolvshi-legal-skill/actions/workflows/test.yml"><img src="https://github.com/mtcto/haolvshi-legal-skill/actions/workflows/test.yml/badge.svg?branch=main" alt="自动化测试"></a>
  <a href="https://github.com/mtcto/haolvshi-legal-skill/blob/main/LICENSE"><img src="https://img.shields.io/badge/许可证-MIT-22c55e?style=flat-square" alt="MIT 许可证"></a>
  <img src="https://img.shields.io/badge/版本-1.7-2563eb?style=flat-square" alt="版本 1.7">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 20 或更高版本">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AI%20Agent-%E6%8A%80%E8%83%BD-7c3aed?style=flat-square" alt="AI Agent 技能">
  <img src="https://img.shields.io/badge/Agent%20Skills-%E6%B3%95%E5%BE%8B%E6%8A%80%E8%83%BD-7c3aed?style=flat-square" alt="Agent Skills 法律技能">
  <img src="https://img.shields.io/badge/%E6%B3%95%E5%BE%8B%20AI-%E6%B3%95%E5%BE%8B%E6%9C%8D%E5%8A%A1-0f766e?style=flat-square" alt="法律 AI 法律服务">
  <img src="https://img.shields.io/badge/%E5%90%88%E5%90%8C%E5%AE%A1%E6%A0%B8-%E6%99%BA%E8%83%BD%E5%AE%A1%E6%A0%B8-b45309?style=flat-square" alt="智能合同审核">
  <img src="https://img.shields.io/badge/%E6%B3%95%E5%BE%8B%E6%96%87%E4%B9%A6-%E8%B5%B7%E8%AF%89%E7%8A%B6%2F%E7%AD%94%E8%BE%A9%E7%8A%B6-475569?style=flat-square" alt="法律文书生成">
  <img src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87%E6%B3%95%E5%BE%8B%E6%9C%8D%E5%8A%A1-%E5%BC%80%E6%BA%90-dc2626?style=flat-square" alt="中文法律服务开源">
</p>

用户可以用自然语言提出法律问题、上传案件材料或合同，技能会引导补充必要事实，并通过好律狮服务生成法律咨询报告、赔偿计算报告、合同审核报告或 Word 法律文书。

本仓库只包含可公开分发的技能源码、运行脚本、编排规范、示例模板和测试。官网、宣传页面、宣传素材、服务器配置、构建产物和内部发布脚本均不在本仓库中。

当前技能包版本为 `1.7`。

## 能力范围

| 能力 | 适用场景 | 结果 |
| --- | --- | --- |
| 法律咨询报告 | 离婚、劳动、交通事故、合同纠纷等法律问题 | 在线法律咨询报告 |
| 法律计算器 | 交通事故、工伤、劳动争议等赔偿或费用估算 | 在线法律计算报告 |
| 智能合同审核 | 上传合同并说明我方是甲方还是乙方 | 在线合同审核报告 |
| 起诉状生成 | 根据案情和材料整理起诉请求、事实与理由 | Word 起诉状 |
| 答辩状生成 | 根据对方请求、案情和我方意见整理答辩文书 | Word 答辩状 |

技能支持多轮问答、结构化表单、文件材料识别、多个当事人、任务恢复和结果链接交付。

## 快速开始

### 作为 Agent Skill 使用

本仓库根目录就是技能目录，包含 `SKILL.md`。将仓库目录导入支持 Agent Skills 的人工智能工具即可：

```bash
git clone git@github.com:mtcto/haolvshi-legal-skill.git
```

也可以从好律狮提供的压缩包安装：

```bash
npx skills add https://skills.ai.lvpin100.com/skills/haolvshi-legal-skill/haolvshi-legal-skill.zip --skill haolvshi-legal-skill
```

安装后可以直接提出类似请求：

```text
发生交通事故，帮我计算一下可以获得多少赔偿。
帮我审核这份劳动合同，我方是乙方。
请根据我提供的事实生成一份离婚起诉状。
```

### 验证运行环境

技能首次运行时会检查 Node.js。没有符合要求的 Node.js 时，会下载并校验技能专用运行环境，不要求管理员权限。

macOS 或 Linux：

```bash
sh scripts/bootstrap.sh --ensure
sh scripts/run.sh health
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 -Ensure
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 health
```

`health` 返回 `ok=true` 且五项能力状态正常时，说明本地运行环境和默认服务配置已就绪。健康检查需要网络连接。

## 命令行接口

技能脚本统一返回 JSON。macOS 或 Linux 使用：

```bash
sh scripts/run.sh <命令> [--json '<JSON>' | --input <JSON文件>]
```

Windows 使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 <命令> --json '<JSON>'
```

涉及案情、合同全文或身份信息时，优先通过标准输入或 `--input` 传入，避免把敏感内容写进命令行历史。

### 命令总览

| 命令 | 用途 |
| --- | --- |
| `health` | 检查服务目录、五项能力和合同审核配置 |
| `case-materials` | 识别案件材料并生成可复用的 `caseContext` |
| `catalog` | 查询并排序咨询项目、计算器项目或文书模板 |
| `question-start` | 创建咨询或计算器任务并取得第一题 |
| `question-reply` | 提交当前问题答案并取得下一题或追加题 |
| `question-report` | 生成咨询或计算器报告 |
| `contract-review` | 上传合同并发起审核 |
| `pleading-start` | 创建起诉状或答辩状任务并读取模板 |
| `pleading-extract` | 从当前案情和材料中提取文书要素 |
| `pleading-update` | 更新字段、切换步骤和维护多个当事人 |
| `pleading-generate` | 在用户确认后生成 Word 文书 |
| `resume` | 使用当前任务的 `sessionId` 恢复任务 |
| `cleanup` | 删除指定任务或清理过期任务材料 |

查询法律咨询项目的例子：

```bash
printf '%s' '{"capability":"consultation","query":"离婚财产分割"}' \
  | sh scripts/run.sh catalog
```

使用案件材料查询交通事故计算项目的例子：

```bash
printf '%s' '{"capability":"calculator","query":"交通事故赔偿","filePaths":["/绝对路径/事故认定书.txt"]}' \
  | sh scripts/run.sh catalog
```

详细的工作流、字段匹配、附件处理和错误恢复规则见：

- [`SKILL.md`](SKILL.md)：人工智能助手的编排规范
- [`INSTALL.md`](INSTALL.md)：安装、验证、配置和卸载说明
- [`references/consultation.md`](references/consultation.md)：法律咨询流程
- [`references/calculator.md`](references/calculator.md)：法律计算流程
- [`references/contract-review.md`](references/contract-review.md)：合同审核流程
- [`references/pleading.md`](references/pleading.md)：起诉状和答辩状流程
- [`references/case-materials.md`](references/case-materials.md)：案件材料处理规则
- [`references/interaction.md`](references/interaction.md)：交互和字段处理规则
- [`references/errors.md`](references/errors.md)：错误处理规则

## 任务边界与隐私

技能遵循当前任务证据边界：

- 只使用当前对话、当前任务上传或粘贴的材料，以及同一 `sessionId` 保存的答案。
- 不读取或引用宿主的全局记忆、其他任务、其他线程、旧案例、测试记录或日志。
- 信息不足时向用户提问，不使用跨任务内容猜测案情、当事人、金额或法律结论。
- 只向服务接口发送完成当前流程所需的信息。
- 不在回复和日志中输出身份证号、合同全文、服务端配置或密钥。
- 服务返回登录、验证码、付费或配置限制时，直接说明实际限制，不绕过服务端校验。

本地任务状态和文书模板缓存默认保存在系统临时目录，通常保存 24 小时。请不要把包含真实个人信息、合同全文、访问令牌或服务端密钥的文件提交到仓库。

## 服务依赖和配置

默认配置连接好律狮公共服务。技能本身负责编排和参数校验，不包含服务端工作流密钥；如果你有自己的兼容服务，可以通过环境变量覆盖接口和站点地址。

| 环境变量 | 用途 |
| --- | --- |
| `HAOLVSHI_API_BASE` | 接口根地址 |
| `HAOLVSHI_SITE_BASE` | 在线结果页面根地址 |
| `HAOLVSHI_SITE_ROUTE_BASE` | 在线结果页面路由前缀 |
| `HAOLVSHI_APP_ID` | 应用编号 |
| `HAOLVSHI_DEVICE_TYPE` | 设备类型 |
| `HAOLVSHI_STATE_DIR` | 本地任务状态和缓存目录 |
| `HAOLVSHI_REQUEST_TIMEOUT_MS` | 普通接口超时时间，单位为毫秒 |
| `HAOLVSHI_AUDIT_TIMEOUT_MS` | 合同审核超时时间，单位为毫秒 |
| `HAOLVSHI_NODE_MIN_MAJOR` | 可复用 Node.js 的最低主版本 |
| `HAOLVSHI_NODE_RELEASE_LINE` | 自动准备的 Node.js 发布线 |
| `HAOLVSHI_RUNTIME_DIR` | 技能专用 Node.js 运行环境位置 |
| `HAOLVSHI_NODE_BIN` | 指定可复用的 Node.js 可执行文件 |

旧版 `LVPIN_*` 环境变量仍兼容读取，新部署建议使用 `HAOLVSHI_*`。应用编号属于公开配置，不等同于服务端密钥；客户端配置中不要放置任何服务端工作流密钥。

## 开发和测试

开发环境需要 Node.js 20 或更高版本：

```bash
# 检查主入口语法
npm run check

# 运行自动化测试
npm test

# 准备技能运行环境
npm run environment

# 访问真实服务进行健康检查
npm run health
```

`npm test` 使用模拟接口，不需要访问真实业务服务；`npm run health` 会访问真实服务，需要网络连接。提交代码前请至少运行 `npm run check` 和 `npm test`。

## 项目结构

```text
SKILL.md                 人工智能助手的技能编排规则
INSTALL.md               安装、配置和验证说明
scripts/legal-skill.mjs  命令分发入口
scripts/*-workflow.mjs  各项能力的工作流
scripts/case-materials.mjs
                         案件材料识别和上下文复用
references/              面向编排的详细流程规范
tests/                   自动化测试和测试夹具
evals/                   技能评测用例
assets/                  报告模板和技能图标
agents/                  助手展示和默认提示配置
```

## 法律服务免责声明

本项目是人工智能工具与法律服务接口之间的技能编排示例，不构成律师意见、法律意见或对具体案件结果的承诺。报告、计算结果和文书草稿应结合完整事实、最新法律法规及专业人士意见进行核验；在诉讼时效、财产处分、人身安全、刑事风险等重要事项上，请及时咨询具备相应资质的律师或向有权机关确认。

在线服务的可用性、收费、登录要求、数据处理规则和最终结果以服务提供方的实际页面及协议为准。

## 贡献

欢迎提交问题、改进建议和代码贡献。请先阅读：

- [`CONTRIBUTING.md`](CONTRIBUTING.md)：贡献流程和测试要求
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)：社区行为准则
- [`SECURITY.md`](SECURITY.md)：安全问题报告方式

涉及真实案件时，请使用脱敏材料和最小化示例，不要在 Issue 或合并请求中公开个人身份信息、合同全文、令牌或其他敏感数据。

## 许可证

本项目以 [MIT License](LICENSE) 开源。
