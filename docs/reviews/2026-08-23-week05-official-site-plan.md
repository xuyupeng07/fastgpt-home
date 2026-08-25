# FastGPT Week05 官网任务优先级与实施方案

## 状态与范围

本文分析 `/Users/longnv/bin/repo/fastgpt-data/Week05/` 的交付物，定义需要进入
FastGPT 自有域名的五项工作、优先级、实施边界和验收合同。本文只交付方案；产品源码、
部署配置、生产数据和线上状态均保持原样。

- 仓库基线：`96380ab69828771decefcba75fba21e1a58e8403`
- 证据日期：2026-08-23（Asia/Shanghai）
- ChatGPT Pro 对话：<https://chatgpt.com/c/6a8aac9a-0590-83e8-94cb-a78173618f62>
- 外部最终共识：`FINAL_CONSENSUS: AGREED_AFTER_COUNT_CORRECTION`
- 当前源码基线：FAQ 1,400 个身份，其中 1,195 个已有 Meta；Guide 8 组、16 篇；
  技术中心 1,122 个身份；技术导入权威记录 454 篇。

## 优先级结论

优先级按四个因素排序：现有访问与链接权益、影响范围、当前故障严重度、实施证据完整度。
P0 恢复现有资产，P1 完成现有页面质量和高意图内容，P2 扩大高风险内容规模。

| 顺位 | 级别 | 官网任务 | 主要结果 | 责任边界 |
|---:|---|---|---|---|
| 1 | P0 | Solutions 子站内容身份与抓取恢复 | 全量可索引页 terminal-200 self-canonical；robots、sitemap 正常；纯文本投影 noindex | Solutions owner repo 与生产 ingress |
| 2 | P0 | FAQ 历史 URL 恢复 | 1,288 个 host-aware source URL 单跳 301 到 terminal canonical 200 | `fastgpt-home`、CN Nginx、IO Worker |
| 3 | P1 | FAQ Meta 补齐 | 1,195 条保持稳定，新增 205 条，最终 1,400/1,400，fallback 0 | `fastgpt-home` |
| 4 | P1 | 五组双语 Guide | 新增 5 个 slug、10 篇文章，registry 8→13 | `fastgpt-home` |
| 5 | P2 | 888 篇技术候选治理与分批发布 | 逐条裁决，发布数量由 accepted ledger 与风险门禁导出 | `fastgpt-home` |

两项 P0 并行启动。Solutions 的影响面覆盖整个子域，因此占据同级第一；FAQ 具备完整工作簿和
当前仓库实现证据，可立即进入实现准备。Solutions 的第一步是取得 owner repo 并验证 ingress 与
`basePath`，FAQ 的第一步是固化 alias authority。

## 范围裁决

### 进入官网队列

- `存量修复-补Meta第3批`：FAQ Meta 候选与 1,251 个 IO 历史 URL。
- `外链-已发批次URL勘误`：37 个 CN 历史 URL。
- `深度内容-第3批5篇` 与 `深度内容-英文版5篇`：五组双语 Guide。
- `程序化技术页-第3批`：888 个待治理技术候选。
- Week05 README 与现网探测暴露的 Solutions canonical、robots、sitemap、内容投影问题。

### 站外队列

- 新闻稿第 3 批、国内短外链 300 篇、海外分发 23 件进入第三方渠道发布流程。
- 已发外链的第三方页面更正进入站外运营流程；对应历史目标 URL 的 301 恢复进入官网队列。
- GSC 导出、产品资料、案例授权与站点诊断属于输入或测量证据。

### 当前基线已覆盖

- README 提到的 W4 460 条技术候选已形成上一批 authority：454 accepted、6 denied；
  accepted 由 450 add 与 4 update 组成，当前技术中心共有 1,122 个身份。2026-08-23 生产探测中，
  `https://fastgpt.cn/tech-center/search-index.json` 返回 200 且含 1,122 项，代表性详情页返回 200。
  本次不重复建立内容导入任务。
- README 提到的 W4 16 篇深度内容已形成 8 个中英 Guide 身份；2026-08-23 对 8 个 slug 的 CN/IO
  共 16 个生产 URL 全量探测均返回 200。本次五组新内容沿用该架构。
- README 提到的四组 `/compare` 双语 hreflang 已由 `getCompareAlternates()`、详情页 metadata
  与 `verify:i18n-seo` 覆盖；2026-08-23 对 4 个 slug 的 CN/IO 共 8 个生产 URL 全量探测均返回
  200，并同时输出 `en`、`zh-CN`、`x-default`。本次保留回归门禁，不重复立项。

## P0-1：Solutions 子站内容身份与抓取恢复

### 已确认事实

- `https://solutions.fastgpt.cn/` 返回 308 到 `/customers`。
- `/customers` 返回 200，当前 canonical 指向会 308 的根路径。
- 抽样分类页与案例页返回 200，当前 canonical 省略 `/customers` 后指向 404。
- `/robots.txt` 与 `/sitemap.xml` 返回 404 HTML。
- 本次页面捕获发现 17 个分类链接与 89 个案例链接。
- `/customers/solution/<slug>/markdown` 返回 200 `text/plain`。
- `fastgpt-home` 只保存该子站链接；Solutions 路由、响应头与 ingress 实现位于 owner repo。

### 目标合同

1. 保留当前公开可达的 `/customers` 路由族作为最小迁移基线；owner repo 在实施前验证
   `basePath`、内容库存储和 ingress 转发。
2. 根页 canonical 固定为 `https://solutions.fastgpt.cn/customers`。
3. 分类页与案例页 self-canonical 到带 `/customers` 前缀的当前 terminal 200 URL。
4. 页面路由、站内导航和 sitemap 共用一个权威内容清单。
5. sitemap 只包含权威清单中可索引的根页、分类页和案例页。当前 107 个可见路由作为
   捕获基线，最终数量由 owner repo 的权威清单导出。
6. 纯文本投影携带 `X-Robots-Tag: noindex, nofollow`，并从 sitemap 与站内发现入口移除。
7. robots 在 noindex 被搜索引擎观察期间保持投影 URL 可抓取。后续 crawl-budget 数据可以
   触发独立的 robots 决策。

Google 官方文档说明，爬虫需要访问 URL 才能读取 `X-Robots-Tag` 中的 `noindex`：
<https://developers.google.com/search/docs/crawling-indexing/block-indexing>。

### 实施步骤

1. 定位 Solutions owner repo、部署清单、ingress/CDN 配置和生产内容权威清单。
2. 生成一次 owner-repo 路由清单，标记 indexable page、内部投影、资产和系统路径。
3. 统一 metadata、页面路由、导航和 sitemap 的 URL 构造逻辑。
4. 在应用或 ingress 层提供根级 `/robots.txt` 与 `/sitemap.xml`。
5. 为纯文本投影设置 HTTP 响应头，并保持其业务访问行为。
6. 在 preview 环境完成全量 HTTP 与页面 SEO 图验证，再发布到生产。

### 验收、发布与回滚

- robots：200、`text/plain`、包含生产 sitemap 的绝对 URL。
- sitemap：200、XML content type、URL 唯一、同 host、全部 terminal 200、全部 self-canonical。
- 集合：sitemap 集合等于权威内容清单中的 indexable 集合。
- 页面：canonical、Open Graph URL、结构化数据和站内链接使用同一 URL。
- 投影：全量匹配 `/customers/solution/*/markdown` 的响应携带 `noindex, nofollow`。
- 回滚：保留上一版应用镜像与 ingress 配置；metadata、robots、sitemap 和响应头作为一个发布单元。
- 监测：404/5xx、canonical mismatch、sitemap fetch、Google URL Inspection、Search Console 索引趋势。

## P0-2：FAQ 历史 URL 恢复

### 数据合同

- IO：1,251 个唯一 source URL，指向 1,250 个唯一 terminal target；720 个为大小写修复，
  531 个为 slug 重建。
- CN：37 个唯一 source URL，指向 30 个唯一 terminal target；包含 CN→CN 与 CN→IO。
- 总计：1,288 个唯一 `{sourceHost, sourcePath}`。
- 每个 source 只有一个 target；多个 source 可以汇聚到同一 target。
- target 必须存在于内容身份注册表，并直接返回 canonical 200。
- 重定向保留原 query string，跳转次数为 1。

### 架构方案

建立独立的 host-aware `URL Alias Authority`：

```text
sourceHost + sourcePath
  -> targetHost + targetPath
  + evidenceSource
  + workbookSheet
  + worksheetRow
  + reason
  + disposition
```

FAQ route registry 继续管理内容身份、canonical slug 与 locale owner。Alias Authority 管理历史访问
身份，并分别投影为 CN Nginx map 与 IO Cloudflare Worker 数据。ADR 0012 记录独立 authority、
many-to-one、terminal-target 与 host 边界，当前状态为 `proposed`；实现评审通过后转为 `accepted`。
Query 不进入 alias 身份且原样附加到终态 target；fragment 不进入 HTTP 请求或 authority。

Nginx `map` 的普通字符串键采用忽略大小写匹配。含大写字母的 source path 使用 `~^...$`
区分大小写的精确正则，并对路径做正则转义。生成器同时把小写 canonical path 放入冲突集，
保证 uppercase source 301 与 lowercase canonical 200。Nginx 官方说明：
<https://nginx.org/en/docs/http/ngx_http_map_module.html>。

### 实施步骤

1. 从两份 Week05 勘误表生成规范化 alias ledger，保存工作簿、sheet、worksheet row 与 SHA-256。
2. 校验 source 唯一性、target 内容身份、target owner、生产 200、链、环和自跳转。
3. 生成 CN/IO 边缘产物，统一 URL encoding、trailing slash、query 传递和 status 语义。
4. 先发布 case-only aliases，再发布 rebuilt-slug aliases；每批使用同一全量回归集合。
5. 生产发布后对 1,288 个 source 发送单次请求，校验 301 Location、terminal 200 与单跳。
6. 在真实 Nginx 容器和 Worker preview 中执行 HTTP 合同测试，验证大小写、query 和跨 host 行为。

### 必跑门禁

- `npm run verify:faq-routes`
- `npm run verify:faq-redirects -- --source`
- `npm run verify:faq-seo-graph`
- CN/IO 构建后的 `npm run verify:faq-redirects`
- CN/IO 构建后的 `npm run verify:i18n-seo`
- 合同测试覆盖 host 唯一、跨域 owner、many-to-one、source-to-many、target 存在、无链、无环、
  query 保留、大小写和 trailing slash。

发布产物携带 alias authority SHA-256 与 source 计数。回滚点包含上一版 Nginx map 与 Worker 数据。
监测项包含 alias 命中率、404 率、链式跳转、GSC 抓取与外链恢复。

## P1-1：FAQ Meta 补齐

### 规范化算术

Week05 工作表有 1,407 个 Meta 候选。最终内容主表保持 1,400 个 FAQ identity：

```text
1,407 candidates
- 1 no-page disposition
- 6 duplicate collapses
= 1,400 identities

1,195 preserved metadata records
+ 205 additions
= 1,400 mapped records, 0 fallback
```

语义重映射改变目标 identity，候选总数保持不变。台账同时记录 `worksheetRow` 与 `businessNo`：

| 决策 | worksheetRow | businessNo | 结果 |
|---|---:|---:|---|
| 企业培训语义修正 | 122 | 149 | 映射到 `how-ai-platforms-improve-corporate-training` |
| 无页面候选 | 1197 | 1628 | 进入无页面 backlog |
| competitor marketing 选择 | 881 | 1171 | 采用该候选，合并 businessNo 1194 |
| maintainability 选择 | 1223 | 1665 | 采用该候选，合并 businessNo 1797 |
| prompt engineering 选择 | 759 | 980 | 采用该候选，合并 businessNo 832 |

其余三组重复保留已有 W4 批次：businessNo 728 合并 785、1202 合并 1373、894 合并 993。
593 个“无线上页面”问题进入独立内容发现 backlog，本次 Meta 导入不会创建这些页面。

### 实施方案与验收

1. 复用现有 metadata 生成器、route identity 解析、长度清洗、authored digest 与原子写入。
2. 新增最小 decision ledger，记录语义重映射、无页面项与六组重复裁决。
3. 以当前 1,195 条 artifact 为已批准 base，只合并缺失的 205 条。
4. provenance 保存 W4 base 与 W5 workbook 的文件名、sheet、SHA-256 和新增计数。
5. 对现有 1,195 条逐记录比较稳定序列化字节或 digest，防止 base 漂移。

门禁：

- `node scripts/generate-faq-metadata.js --check`
- `npm run verify:faq-metadata`
- `npm run verify:faq-routes`
- `npm run verify:faq-seo-graph`
- CN/IO HTML metadata 与 FAQ SEO graph 验证

Done 条件：1,407 个候选都有 disposition；1,400 个 HTML 页全部使用已批准 Meta；fallback 0；
现有 1,195 条 base digest 保持稳定。

## P1-2：五组双语 Guide

### 路由与内容决定

全部复用当前 `/guide/{slug}` 架构，中英两版共享 slug 与事实集：

| slug | group | schema |
|---|---|---|
| `poc-30-day-design` | decision | Article + BreadcrumbList；满足顺序可执行步骤门禁时增加 HowTo |
| `database-qa-integration-guide` | implementation | Article + BreadcrumbList；满足顺序可执行步骤门禁时增加 HowTo |
| `scheduled-report-automation` | implementation | Article + BreadcrumbList；满足顺序可执行步骤门禁时增加 HowTo |
| `finance-research-retrieval` | industry | Article + BreadcrumbList |
| `finance-daily-report-automation` | industry | Article + BreadcrumbList |

CN 提供 zh-CN canonical，IO 提供 en canonical，x-default 指向 IO。Registry 从 8 增至 13，
两个 Site Variant 各输出 13 个 Guide detail route。

### 实施步骤

1. 清除交付注释中的签发、排期、供应商流程、旧 `/tutorial/` 建议和内部 provenance。
2. 校验客户名称、金融数字、能力边界和案例授权；正文保留公开事实与必要 caveat。
3. 重写被截断的英文 title/description；当前 validator 硬上限作为合同，50–60/140–160 作为编辑目标。
4. 把 Mermaid 建议转为正文步骤、表格或已批准资产；截图需要持久 URL、授权和 alt 证据。
5. 只保留可解析到 terminal 200 的站内链接。
6. 写入 10 个 Markdown 文件，更新 registry metadata/hash/schema/asset policy 与 policy `entryCount=13`。

门禁：`verify:guide-content`、两个 Guide regression、CN/IO `verify:guide-export`、
`verify:i18n-seo`，并覆盖 canonical、hreflang、OG URL、schema、sitemap、目录锚点、资产和内链。

## P2：888 篇技术候选治理与分批发布

### 入口规则

888 是候选数。当前工作簿只有 `上线清单` 与 `说明与纪律`；现有 importer 需要 accepted、denied
与纪律三类权威数据。先生成治理后的 normalized delivery 与 decision ledger，再进入 importer。

治理期间允许 `needs-evidence`/`deferred` 作为临时 triage 状态。批次 authority 关闭前，每条临时
状态必须转成 accepted 或 denied，最终守恒式为 `accepted + denied = 888`。每个发布 wave 只消费
accepted 项；历史 triage 与最终决定均保留可追溯记录。

每条 accepted 继续裁决为 add 或 update，满足
`week05AddCount + week05UpdateCount = week05AcceptedCount`。当前方案没有 delete 操作，因此
最终页面数满足 `expectedResultingPageCount = 1122 + week05AddCount`。

### 强制审查集

- 四个当前 identity 冲突直接进入 denial：
  `fastgpt-plugin-s3-connection-refused`、`fastgpt-private-deployment-error`、
  `fastgpt-private-deployment-troubleshooting`、`fastgpt-troubleshooting-guide`。
- issues #4023/#4031：#4031 合并到 #4023 候选身份；#4023 补齐根因与修复证据后再裁决。
- issues #1108/#1109：先合并证据，不预选 winner；证据仍不足时两条均进入 denial。
- 七组高相似候选按症状、根因、适用版本和验证结果逐组裁决：#5481/#5483、#2204/#396、
  #1499/#1572、#3214/#981、#3546/#3765、#1662/#2425、#1782/#1863。
- 当前预审：#5483 合并到 #5481 候选，#5481 继续补证；#2204 在验证端点与版本后裁决，
  #396 进入 denial；#1499/#1572 取得正式版本证据后分别裁决；#3214/#981、#3546/#3765
  保留不同候选身份并重写差异化标题；#1662/#2425 分开裁决，#2425 需要 DBA 级改写、备份与恢复
  设计；#1782/#1863 进入 denial。相似度只触发复核，最终决定依据错误指纹、根因、环境和修复动作。

### 安全与可操作性

- 扫描 JWT、Bearer、token/query、云 key、私钥头和 `sk-` 形态。
- 每个 credential-shaped 值记录 `redacted-secret`、`approved-synthetic-placeholder` 或
  `needs-review`；accepted 集合中 `needs-review` 必须为 0。
- 两个含 FastGPT 长密钥形态的候选缺少合成证据，进入 deferred 并在所有评审产物中脱敏：
  `fastgpt-api-error-troubleshooting`、`fastgpt-chat-completions-error`。
- 至少 11 篇进入 operation-risk 台账：

| 风险 | 文件 | 裁决要求 |
|---|---|---|
| D0 | `fastgpt-master-build-copy-error`、`fastgpt-docker-deploy-ui-unavailable`、`fastgpt-docker-port-fix`、`wsl-fastgpt-deployment-troubleshooting`、`fastgpt-private-mysql-start-fail` | 默认 denial；完成非破坏性诊断、备份、恢复与影响说明后重新评审 |
| D1 | `fastgpt-build-discrepancy-server`、`fastgpt-docker-build-tiktoken-error`、`fastgpt-pnpm-dev-usememo-error`、`fastgpt-pg-hostname-resolve-error` | 限定工作目录和资源范围，提供低风险前置步骤、影响与回滚 |
| D2 | `fastgpt-local-start-heat-update-path-error`、`fastgpt-private-blank-page-troubleshooting` | 只允许可再生缓存，精确限定目录并说明重建行为 |

- 全量 operation-risk 扫描覆盖 `down -v`、持久卷/数据库目录清空、全局 prune、锁文件删除、
  递归权限变更、密钥文件删除、容器/数据卷删除和 Docker network 删除。

一条技术候选进入 accepted 需要同时满足：来源能支持根因与修复、错误指纹和适用版本明确、
修复验证可执行、credential `needs-review` 为 0、D0/D1 风险已裁决、canonical 身份唯一、与当前
1,122 页无冲突、标题和正文完整。

### 权威、发布与验收

1. 生成 888 项 normalized delivery 与最终 decision ledger。
2. 扩展现有累积 authority，保留上一批 `454 accepted + 6 denied`，其中 accepted 含
   `450 add + 4 update`。
3. 复用当前 normalization、citation、identity、manifest、ledger 和原子写入能力。
4. Week05 accepted 逐条归类为 add 或 update；add 全部满足净新增身份检查，update 必须命中既有
   identity。最终技术中心计数为 `1122 + week05AddCount`。
5. Wave 0 发布 0 篇，完成 dry run、全量 disposition、冲突、安全、危险命令、生成物与回滚验证。
6. Wave 1 发布 25–50 篇证据最强、风险最低的 accepted 页面；审核容量和全部门禁充足时扩展，
   总量上限 100 篇。后续 wave 每波上限 200 篇，按风险、主题和证据等级分组。
7. 每个 wave 执行即时静态产物门禁、72 小时运行门禁和 14 天搜索门禁。72 小时与 14 天数据
   用于发现运行和索引异常；技术结论在发布前由来源证据和 reviewer 证明。

门禁：`verify:technical-content`、technical regression、content hygiene、三变体技术导出、
sitemap 集合、全量 200/canonical、初始 JavaScript 预算。回滚单位为单个 wave；监测 404/5xx、
软 404、爬虫访问、页面性能与 GSC 发现/抓取/索引趋势。

## 全局执行顺序

| 阶段 | 工作 | 放行条件 |
|---|---|---|
| A | 固化所有输入 SHA、decision ledger schema、URL Alias ADR | 数字可重现，所有冲突有 disposition |
| B1 | Solutions owner discovery 与 preview 合同 | owner repo、ingress、权威内容清单已验证 |
| B2 | FAQ Alias Authority 与边缘投影 | 1,288 个 source 合同通过 |
| C1 | FAQ Meta | 1,400 mapped、fallback 0、1,195 base 稳定 |
| C2 | 五组 Guide | registry 13、CN/IO 导出通过 |
| D | 技术候选 Wave 1 与后续 wave | 每批通过即时、72h、14d 门禁 |

## 证据等级与声明边界

1. 源数据：工作簿、Markdown、hash、ledger 与基数。
2. 源码合同：生成器、解析器、注册表与冲突规则。
3. 构建产物：静态 HTML、Nginx map、Worker、robots 与 sitemap。
4. Preview HTTP：可部署产物的真实响应。
5. Production HTTP：已部署域名的状态、Location、响应头与 SEO 图。
6. 搜索引擎：GSC/Bing 的抓取、索引与展现。

每项验收记录实际达到的证据等级。静态导出证明构建产物，Production HTTP 证明部署响应，
搜索引擎结果证明重新抓取后的外部效果。

## grill-with-docs 决策记录

| 决策问题 | 结论 |
|---|---|
| 官网任务的边界 | 改变 FastGPT 自有域名页面、路由、SEO 图或抓取基础设施 |
| P0 排序 | Solutions 影响整个子域；FAQ 恢复 1,288 个已引用历史 URL；两项并行 |
| FAQ 1,407 的实体含义 | Meta 候选集合；网站权威实体为 1,400 个 content identity |
| 历史 URL 模型 | 独立 host-aware Alias Authority，允许 many-to-one，只指向 terminal target |
| Guide 路由 | 复用 `/guide/{slug}`，registry 8→13 |
| 技术页数量 | triage 可暂存 needs-evidence；最终 authority 满足 `accepted + denied = 888`，发布数由 accepted 导出 |
| Solutions base path | `/customers` 是基于当前 terminal 200 路由的最小基线；owner repo 验证是实施门禁 |
| 纯文本索引规则 | 先保持可抓取并返回 `X-Robots-Tag`，crawl-budget 决策后置 |
| 安全扫描表述 | 首包保留两项缺少合成证据的 FastGPT 密钥形态值；评审证据状态需显式标注 unresolved credential shapes |
| Deferred 状态 | 仅作 triage；批次关闭前逐条转成 accepted 或 denied |
| Wave 规模 | Wave 0 为 0；Wave 1 为 25–50、扩展上限 100；后续每波上限 200，均受 readiness 门禁约束 |
| Sitemap 数量 | 由 owner 内容权威清单导出；107 是当前页面捕获基线 |
| 测试声明 | 源码、构建、preview、生产与搜索引擎证据分层记录 |

## 剩余证据缺口

- Solutions owner repo、ingress、`basePath` 与权威内容清单仍待实施阶段读取。
- 888 个技术候选的官方 issue 语义审查仍需完成，accepted 数保持为公式。
- 金融 Guide 的客户名称、数字和截图需要持久授权证据。
- 当前仓库没有独立 E2E runner；静态导出验证是现有 release 流程的一部分。
- Production HTTP 与搜索引擎结果属于部署后的证据，本方案没有执行部署。

## 独立验收证据

### 数据与源码算术

- FAQ 工作簿：1,407 行、1,399 个唯一 URL、1,401 个唯一问题；IO alias 为 1,251 个 source、
  1,250 个 target；CN alias 为 37 个 source、30 个 target。
- 技术工作簿：888 行、888 个唯一 path、888 个唯一来源、888 个唯一 Markdown 映射。
- 当前仓库：FAQ registry 1,400、metadata 1,195、fallback 205；Guide 8 个 slug/16 篇；
  技术页 1,122 个，上一批 authority 为 454 accepted、6 denied，操作分布为 450 add、4 update。

### 仓库门禁

| 门禁 | 结果 |
|---|---|
| `npm run verify:faq-metadata` | PASS：1,195 mapped、205 fallback、1,400 total |
| `npm run verify:guide-content` | PASS：8 slugs、16 documents |
| `npm run verify:technical-content` | PASS：454 imported pages |
| `npm run verify:release -- --source-only` | PASS：SEO、hygiene、FAQ、技术页、lint、TypeScript、Guide 全部通过 |
| `npm run verify:release-regression` | PASS：19/19 |
| 大小写敏感 APFS `npm run verify:release` | CN 与 IO 的 build、HTML、P0/P1/P2、i18n、FAQ、Guide、技术导出和 cardinality 全部通过 |
| 大小写敏感 APFS `npm run verify:release -- --variant preview` | PASS：`export-verified`、0 failures；Preview Guide sitemap/locale-owner 门禁按仓库合同跳过 |

三变体的 P1 初始 JavaScript 均为 258.9 KiB gzip。一次统一运行在 Preview trace 写入阶段受到
8 GiB 临时卷容量限制；扩容到 12 GiB 后 Preview 独立复跑通过。该环境试验没有修改产品源码。

### 现网只读证据

- 2026-08-23：Solutions 根路径 308 到 `/customers`，`/customers` 返回 200，根 robots 与 sitemap
  返回 404，四类代表性 FAQ 历史 URL 返回 404。
- 2026-08-23：现有 8 个 Guide slug 的 CN/IO 共 16 个 URL 全部 200；4 个 compare slug 的 CN/IO
  共 8 个 URL 全部 200，且都输出 `en`、`zh-CN`、`x-default`。
- 2026-08-23：生产 Technical Center search index 返回 200 且包含 1,122 项，代表性详情页返回 200。

### 评审包完整性与安全

| 包 | 大小 | SHA-256 | 状态 |
|---|---:|---|---|
| `fastgpt-week05-pro-review-96380ab.zip` | 6,167,632 bytes | `90eeca5b5178e63007cefe50e8c99c7fcc7d5cb84969888d0a52e660290f67f6` | 历史评审证据；保留两处无法证明为合成值的 FastGPT key 形态字符串，停止复用和分发 |
| `fastgpt-week05-pro-recovery-96380ab.zip` | 382,937 bytes | `ad14cecd64ab56ab7333d0b4d97f7c686c2eeb7593e3478c4c724088cd583fb4` | 恢复上下文；限定扫描为 0 高风险命中 |
| `fastgpt-week05-pro-review-sanitized-96380ab.zip` | 6,095,185 bytes | `c3e5abccb66b297c8282e4b6136d80fd2fadacc491ee49439cd47c244c6ec577` | 本地全量脱敏替代包；2,194 个归档成员、2,185 个文本成员与 63 个 XLSX XML 成员扫描为 0 高风险命中、0 禁止文件；浏览器附件入口未完成上传，最终勘误使用已上传恢复包中的权威文件核对 |

三个 ZIP 均通过压缩结构校验。源码基线均为
`96380ab69828771decefcba75fba21e1a58e8403`；评审包只承载研究上下文，不代表提交、推送或部署。
