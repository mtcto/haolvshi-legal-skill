# 法律咨询报告流程

## 处理上传案件材料

用户在当前任务上传文件时先读 `references/case-materials.md`。调用 `case-materials` 提取内容，或把当前任务的 `filePaths` 与宿主生成的 `extractedTexts` 直接传给 `catalog` 和 `question-start`。材料内容要参与项目选择，并在任务创建后保存在每一道题的 `interaction.caseContext` 中。`query` 必须忠实使用当前任务中用户的本次表达，禁止用全局记忆、其他任务、其他线程、旧案例或示例扩写。

PDF、Word、表格和图片没有 `extractedTexts` 时，脚本会返回 `stage=needs_material_extraction`；先用宿主文件工具读取后重试，不得跳过附件继续问卷。

## 获取项目

```json
{"capability":"consultation","query":"离婚财产"}
```

传给 `catalog`。从 `data.candidates` 中选择最匹配项目；存在实质歧义时让用户确认。

技能调用 `/app/projects/{appId}` 时固定传 `m=2`。返回数据含父子关系，候选项中的 `parentName` 是父级法律领域，`name` 是具体项目，`displayName` 按“父级领域 > 具体项目”组合。选择时同时匹配两级名称，并忽略没有 `projectId` 的分类节点。

## 开始咨询

```json
{
  "capability":"consultation",
  "projectId":"从目录取得的 id",
  "query":"用户原始问题",
  "filePaths":["/绝对路径/判决书.pdf"],
  "extractedTexts":[
    {"filePath":"/绝对路径/判决书.pdf","text":"从判决书忠实提取的案情文字"}
  ]
}
```

传给 `question-start`。保存返回的 `sessionId`。题目通过 `/question/answer` 逐题获取。

## 回答问题

先按 `references/interaction.md` 匹配当前任务证据。当前 `fields[0]` 在当前任务内有直接、明确、唯一答案时立即调用 `question-reply`；禁止读取或使用全局记忆、其他任务、其他线程、旧案例或示例。当前任务内没有匹配时直接调用 `interaction.native.batches[0]`，不先解释。普通填空题已由脚本转换为带 2 至 4 个建议选项的标准 `single_select`，宿主不得再次生成候选。多填题和追加题每轮只处理一个字段，全部回答完后脚本才提交完整父题。非必填空姓名、电话、手机号、身份证号、证件号码由脚本跳过；居住地、户籍地等地区字段必须保留。渲染时按 `optionManifest` 核对选项完整性。

```json
{
  "sessionId":"任务编号",
  "answers":{"字段键":"答案"}
}
```

传给 `question-reply`。连续自动处理当前任务中已有明确答案的新问题，直到遇到确实缺失的字段或 `stage=ready_for_report`。

如果选项包含追加题，`question-reply` 会先返回 `stage=needs_follow_up`，并把追加题放在新的 `interaction` 中。此时仍只用当前任务证据自动回答；无法自动回答时才一题一页呈现。继续使用同一 `sessionId`，不要调用其他命令，也不要自行请求后端下一题。全部追加题完成后，脚本会把答案写回所选选项的 `add` 节点，并将包含主答案与追加答案的完整父题一次提交给 `/question/answer`。

例如“您是男方还是女方？”选择“男方”后触发“您的年龄是多少？”时，第一次 `question-reply` 只保存“男方”并返回年龄题，不调用后端；用户填写年龄后再次调用 `question-reply`，脚本才把性别和年龄一起提交。

咨询题目可能随答案分支变化，因此展示当前主题和后端返回的进度，不承诺固定题目总数。

## 生成报告

```json
{"sessionId":"任务编号"}
```

传给 `question-report`。最终回复包含：

- 核心结论
- 主要法律分析
- 建议采取的行动
- 相关法规和案例
- Markdown 超链接 `links[0].markdown`，固定显示为 `[法律咨询报告](链接地址)`

最终摘要、关键结论、法律分析、行动建议和法规案例只能来自本次报告正文及报告中已经列出的法规和案例。报告生成后不得再搜索网页、查询法律数据库或调用其他外部检索，不得补充报告未包含的法律依据；与模型既有知识冲突时以报告为准。

不得自动打开、预览或导航到报告页面。提示用户主动点击链接查看完整内容，并在网页中自行决定是否下载离线报告。
