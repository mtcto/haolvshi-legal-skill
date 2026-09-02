# 法律计算器流程

## 处理上传案件材料

用户在当前任务上传事故认定书、病历、鉴定意见、医疗票据、工资证明或其他文件时，先读 `references/case-materials.md`。调用 `case-materials`，或把当前任务的 `filePaths` 和宿主生成的 `extractedTexts` 直接传给 `catalog`、`question-start`。材料会保存在当前任务的 `interaction.caseContext`，用于自动回答地区、责任、年龄、伤残等级、金额、期限、收入等题目。`query` 必须忠实使用当前任务中用户的本次表达，禁止用全局记忆、其他任务、其他线程、旧案例或示例扩写。

材料中没有明确数值时不得自行估算；多个票据或材料数值冲突时先让用户确认。脚本返回 `stage=needs_material_extraction` 时必须先读取未解析文件，不得静默跳过。

## 选择计算器

将以下数据传给 `catalog`：

```json
{"capability":"calculator","query":"交通事故赔偿"}
```

技能调用 `/app/projects/{appId}` 时固定传 `m=1`。目录和项目编号都以接口返回为准；结合 `parentName`、`name` 和 `displayName` 选择项目，不选择仅用于分组且没有 `projectId` 的父级节点。

## 开始逐题计算

```json
{
  "capability":"calculator",
  "projectId":"从目录取得的 id",
  "query":"用户原始问题",
  "filePaths":["/绝对路径/病历.pdf","/绝对路径/医疗票据.png"],
  "extractedTexts":[
    {"filePath":"/绝对路径/病历.pdf","text":"从病历忠实提取的诊疗信息"},
    {"filePath":"/绝对路径/医疗票据.png","text":"票据识别出的项目和金额"}
  ]
}
```

传给 `question-start`。脚本与法律咨询报告统一调用 `/question/answer`，每次只取得当前一道题，不再调用 `/question/form`，也不在大模型侧维护计算表单分页。题目返回后只用当前任务消息、当前任务材料、当前 `sessionId` 已保存答案和当前任务更正尝试自动回答；只有没有可靠答案时才展示给用户。

## 逐题回答

先按 `references/interaction.md` 匹配当前任务证据。例如用户在当前任务已明确“对方全责、医疗费四万元”，对应题目出现时直接提交现有选项或规范化数值。禁止读取或使用全局记忆、其他任务、其他线程、旧案例或示例。当前 `fields[0]` 在当前任务中没有唯一匹配时，直接调用 `interaction.native.batches[0]`；普通填空题已由脚本转换为带 2 至 4 个建议选项的标准 `single_select`，宿主不得再次生成候选。多填题每轮只处理一个字段，全部回答完成前不提交后端。非必填空姓名、电话、手机号、身份证号、证件号码由脚本跳过；居住地、户籍地等地区字段必须保留。渲染时按 `optionManifest` 核对选项完整性。

用户回答当前一道题后，将字段传给 `question-reply`：

```json
{
  "sessionId":"任务编号",
  "answers":{
    "字段键":"字段值"
  }
}
```

没有追加题时，脚本会把当前答案提交给 `/question/answer` 并返回下一题；继续只用当前任务证据自动作答。若所选选项包含追加题，脚本先返回 `stage=needs_follow_up`，仍先尝试用当前任务证据回答新的追加题，确实缺少答案时才一次显示一道；继续使用同一 `sessionId` 调用 `question-reply`。追加题全部完成前不会调用后端，完成后脚本才把主答案和各追加答案放回完整父题节点并一次提交。

重复此过程，直到 `stage=ready_for_report`。如果返回 `needs_input`，先再次用当前任务证据匹配 `data.missing` 指明的所有未回答内容，仍缺失时按 `interaction.renderPlan.units` 逐项询问；影响计算的普通非必填字段不能跳过，只有非必填空敏感字段可由脚本直接跳过，居住地和户籍地等地区字段除外。如果返回 `needs_follow_up`，同样先尝试用当前任务证据回答当前追加题。每轮最多向用户展示一道未解决题，不一次性展开后端题目或当前选项下的多道追加题。

## 计算和报告

`stage=ready_for_report` 后调用 `question-report`。

最终展示总额、分项金额、计算依据、关键参数，并原样输出 `links[0].markdown`，固定显示为 `[法律计算报告](链接地址)`。上述内容只能来自本次计算报告及报告中已经列出的法规和依据；不得在报告生成后搜索网页、查询法律数据库或补充报告外的计算规则、法规、案例或结论。不得自动打开、预览或导航到报告页面；用户主动点击后在网页中自行决定是否下载离线报告。
