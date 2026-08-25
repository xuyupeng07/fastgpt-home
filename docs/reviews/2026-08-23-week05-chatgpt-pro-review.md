# ChatGPT Pro：FastGPT Week05 官网任务最终独立评审

- 对话：<https://chatgpt.com/c/6a8aac9a-0590-83e8-94cb-a78173618f62>
- 捕获时间：2026-08-23（Asia/Shanghai）
- 原始响应状态：`FINAL_CONSENSUS: AGREED`
- 最终纠错状态：`FINAL_CONSENSUS: AGREED_AFTER_COUNT_CORRECTION`
- 保存方式：ChatGPT 页面最终响应的完整可见文本；下文保留原始措辞。
- Codex 独立勘误：第 9.1 节旧批次计数应为 454 accepted、6 denied；454 accepted 的操作分布为
  450 add、4 update。ChatGPT Pro 已重新核对两份权威文件并确认该勘误。

---

## ChatGPT Pro 原始响应

FastGPT Week05 官网任务最终独立评审与实施方案
1. 最终结论

评审对象

原始评审包：fastgpt-week05-pro-review-96380ab.zip

恢复评审包：fastgpt-week05-pro-recovery-96380ab.zip

仓库基线：96380ab69828771decefcba75fba21e1a58e8403

附件完整性

附件	独立核验结果
原始评审包	大小 6,167,632 bytes，与上传记录一致 ；通过 sha256sum 得到 90eeca5b5178e63007cefe50e8c99c7fcc7d5cb84969888d0a52e660290f67f6；unzip -t 无错误
恢复评审包	大小 382,937 bytes，与上传记录一致 ；通过 sha256sum 得到 ad14cecd64ab56ab7333d0b4d97f7c686c2eeb7593e3478c4c724088cd583fb4；unzip -t 无错误

【交付物事实】两个附件的字节大小、SHA-256 和 ZIP 结构均已在本轮独立核验。
【交付物事实】本报告遵循 恢复包/REVIEW_REQUEST.md:5-7,31-43 的最终响应契约。
【实时探测】所有现网状态均来自附件中记录的 2026-08-23 探测结果；本轮未重新访问生产环境，也不把这些记录表述为当前仍然成立。
【推断】Codex 修订后的五项任务框架可以达成共识，但优先级语义、FAQ 行号口径、Solutions 基路径、凭证样例、危险命令和发布波次仍需以下工程性修正。

总体裁决

Solutions 子站统一故障应定为 P0-A，覆盖 canonical/basePath、根路径 robots、根路径 sitemap 和 Markdown 投影的 X-Robots-Tag，不能继续作为 P2 文档问题处理。

FAQ 旧 URL alias 定为 P0-B；与 Solutions 同属 P0，可并行推进。由于 owner repo 缺失，FAQ alias 是当前更具实施就绪度的 P0。

FAQ Meta 205 条补齐定为 P1-A；它不是旧 URL 修复的附属副作用，应独立验证和回滚。

五组双语 Guide 定为 P1-B，正式路由使用 /guide/{slug}；不得沿用交付稿中的 /tutorial/。

888 条技术页降为 P2，必须先完成逐条治理、证据、安全和危险操作裁决，不得按“888 页待上线”直接导入。

保留 /customers 仅是本次 P0 的临时公开路由契约，不是永久架构结论。

Markdown 投影必须先返回可被爬虫读取的 X-Robots-Tag，随后才可评估 robots 屏蔽；不得先 Disallow 再期待 noindex 生效。

2. 证据标签与评审边界
标签	本报告中的含义
【源码事实】	可由附件内 repo/ 的实际源码、配置或脚本直接确认
【交付物事实】	可由工作簿、Markdown、ADR、扫描报告、清单或测试记录确认
【实时探测】	附件记录的 2026-08-23 HTTP 探测，不代表本轮重新探测
【推断】	在源码和交付物基础上的工程判断、风险判断或优先级判断
【上线后验证】	只有在 owner repo 实施、预览部署或生产部署后才能证明的状态

【交付物事实】Solutions 实际 owner repo 未包含在两份附件中，见：

恢复包/REVIEW_REQUEST.md:17-18

恢复包/PACKET_MANIFEST.md:15-18

因此，本报告可以确定 Solutions 的 HTTP 契约、测试矩阵和实施边界，但不能声称已经验证其 App Router、basePath、中间件、反向代理或 CDN 的具体实现。

【交付物事实】恢复包的安全扫描是范围受限扫描，见 恢复包/PACKET_MANIFEST.md:20-25。
【推断】任何“未扫描到”只能解释为本次扫描范围内未命中，不能解释为整个 888 条数据无安全问题。

3. Week05 范围裁决
Week05 工作项	范围裁决	官方站点责任
新闻稿发布	站外分发	不在本轮代码实施范围
国内短外链 300 条	站外获链	不在本轮代码实施范围
已发布外链 URL 勘误	分为站外链接替换和站内 alias 两部分	站内 alias 属于 P0-B
FAQ Meta 第三批	官方站点数据和页面元信息	P1-A
海外分发 23 个渠道	站外分发	不在本轮代码实施范围
中文深度内容 5 篇	官方站点 Guide 内容	P1-B
英文深度内容 5 篇	官方站点 Guide 内容	P1-B
技术页候选 888 条	官方站点候选数据，不等于获准页面	P2
Solutions README/SEO 问题	官方 Solutions 子站基础设施	P0-A，但由 Solutions owner repo 实施
GSC、产品资料、客户案例授权	输入和上线后衡量材料	分别是 SEO、产品、法务/案例 owner 的依赖

【推断】Codex 最初的四项优先级需要四处实质修正：

Solutions：P2 → P0-A

FAQ 旧 URL：维持 P0，但从 FAQ Meta 中拆分为独立基础设施任务

FAQ Meta：从混合 P0 中拆为 P1-A

技术页：P1 → P2

Guide 继续为 P1，但应排在 FAQ Meta 之后，或在内容审批资源独立时并行。

4. 最终五项优先级
顺序	等级	工作项	影响	当前实施就绪度	核心 owner
1	P0-A	Solutions canonical/basePath、robots、sitemap、Markdown noindex 统一修复	子站范围、索引污染与 canonical 失效	低：owner repo 缺失	Solutions owner、SRE、SEO
2	P0-B	1,288 个 host-aware FAQ 旧 URL alias	已发外链、大小写 URL、404 和链接权益	高：主仓库和工作簿可用	FastGPT Home 工程、SEO
3	P1-A	FAQ Meta 从 1,195 补齐至 1,400	已存在页面的 SERP 元信息完整性	高	FastGPT Home 工程、内容 owner
4	P1-B	五组双语 Guide，路由 /guide	深度内容、hreflang、站内内容资产	中：需编辑和授权清理	内容、工程、法务/案例 owner
5	P2	888 技术页候选治理和分波发布	长尾覆盖，但安全和准确性风险最高	低	技术内容、工程、安全、产品

【推断】P0-A 和 P0-B 应并行而不是串行。Solutions 严重度更高；FAQ alias 因不依赖缺失的 owner repo，可先进入实际实施。

5. P0-A：Solutions 统一修复
5.1 现状和根因边界

根据 恢复包/LIVE_EVIDENCE_ADDENDUM.md:16-27：

路径类型	2026-08-23 附件记录	结论
/	308 到 /customers	根路径不是终态 HTML
/robots.txt	404 HTML	子站没有有效根 robots
/sitemap.xml	404 HTML	子站没有有效根 sitemap
/customers	200，但 canonical 指向 /	canonical 指向重定向 URL
分类页、案例页	200	当前可访问页面
分类页、案例页 canonical	省略 /customers，对应 URL 404	canonical 指向不存在页面
根页 HTML	可见 17 个分类路由、89 个案例路由	可作为库存交叉检查，不应硬编码
/customers/solution/<slug>/markdown	200 text/plain	存在可索引的文本投影

【实时探测】以上只代表附件记录的 2026-08-23 样本。
【推断】问题不是单一 README 或 sitemap 缺失，而是 公开基路径、canonical、爬虫入口、索引库存和非 HTML 投影之间的契约不一致。

5.2 /customers 决策

裁决：AGREED_WITH_CORRECTION

【推断】本次 P0 应暂时保留 /customers，原因是附件证据只证明带该前缀的页面返回 200，而省略该前缀的 canonical 目标返回 404。直接把页面迁到前缀外会把故障修复扩大成 URL 迁移。

但应把这个决定写成：

/customers 是当前事故修复采用的临时公开基路径契约；它不构成永久信息架构决定。

禁止写成：

/customers 已被证明是 Solutions 的永久正确 basePath。

永久去留必须由 owner repo 后续 ADR 决定，并至少核验实际框架配置、反向代理、内部链接、分析埋点、内容库存及迁移成本。若未来迁移，应作为独立项目实施一跳重定向和索引迁移，不得暗中并入本次 P0。

5.3 P0 目标 HTTP 契约
资源	本次目标
/	保持单跳 308 到 /customers；不作为 canonical，不进入 sitemap
/customers	200 HTML；canonical 自指 /customers
/customers/<category>	200 HTML；canonical 自指完整带前缀 URL
/customers/solution/<slug>	200 HTML；canonical 自指完整带前缀 URL
/robots.txt	根路径 200、text/plain；包含绝对 sitemap 地址
/sitemap.xml	根路径 200、有效 XML；只列可索引终态 HTML
/customers/solution/<slug>/markdown	200 text/plain；返回 X-Robots-Tag: noindex, nofollow；不进入 sitemap

【推断】附件中的 1 + 17 + 89 = 107 可用于对比当前抓取快照，但不得作为代码中的固定数量。最终 sitemap 必须从 owner repo 的正式内容 authority 生成。

5.4 robots 与 X-Robots-Tag 的正确顺序

裁决：AGREED

执行顺序必须是：

先在所有 Markdown 投影响应上稳定返回 X-Robots-Tag: noindex, nofollow。

从 sitemap、HTML 内部导航、结构化数据和其他发现入口中排除这些投影。

在预览环境和生产 HTTP 层核验响应头没有被 CDN、缓存或代理剥离。

上线后通过爬虫日志和搜索平台观察 noindex 的读取与去索引情况。

只有在 noindex 已被读取、且仍有明确 crawl-budget 需求时，才评估为该路径增加 robots Disallow。

【推断】先在 robots 中屏蔽该路径，可能使爬虫无法请求资源并读取响应头，因此不能把“Disallow + X-Robots-Tag”当作无顺序依赖的双保险。

5.5 sitemap 生成规则

Sitemap 只能包含同时满足以下条件的 URL：

同一 Solutions host；

唯一、规范化；

最终返回 200；

text/html；

canonical 自指；

未设置 noindex；

不经过重定向；

属于正式内容 inventory。

必须排除：

/ 这类重定向入口；

Markdown/text/plain 投影；

API、静态资产和内部接口；

404、重定向、noindex 页面；

canonical 指向其他 URL 的页面。

5.6 仓库边界

【源码事实】恢复包中的：

repo/src/app/robots.ts:1-16

repo/src/app/sitemap.ts:1-96

属于主 FastGPT Home，不是 Solutions 子站实现证据。

【源码事实】repo/src/components/home/Navbar.tsx:34-40 只表明主站把 solutions.fastgpt.cn 识别为案例中心链接并用于分析事件，不证明 Solutions 的路由或 SEO 配置。

【推断】禁止为解决 Solutions 问题而直接修改主站 robots.ts、sitemap.ts，除非 Solutions owner repo 或部署架构明确证明这些文件实际控制该 host。

5.7 验证、回滚和监控

预览验证

根路径、/customers、分类、案例和 Markdown 投影逐类验证。

canonical 必须与最终 200 URL 完全一致。

robots 和 sitemap 验证状态码、Content-Type、语法和绝对 URL。

sitemap 中每个 URL 做终态 200、自指 canonical、index/follow 检查。

Markdown 投影逐条或按 owner inventory 全覆盖验证响应头。

生产验证

【上线后验证】部署后重新执行完整 HTTP 契约；附件中的 2026-08-23 结果不能代替该验证。

回滚

canonical、根 robots、根 sitemap 和 Markdown header 应作为一个 P0 发布单元。

保存前一版路由和元数据配置。

若 canonical 或 sitemap 出现大面积错误，优先回滚整个单元，而不是只撤销一个端点。

已发出的 noindex 应通过恢复正确页面契约处理，不得通过制造 404“回滚”。

监控

canonical 目标非 200 数量；

sitemap URL 与正式内容 inventory 差异；

robots/sitemap 状态码和 Content-Type；

Markdown 投影 header 覆盖率；

搜索平台的重复 canonical、已发现未编入索引、被 noindex 排除等趋势；

爬虫对 text/plain 投影的请求量。

6. P0-B：FAQ 双 host 旧 URL alias
6.1 数据规模
fastgpt.io 工作簿

week05/存量修复-补Meta第3批/FastGPT-存量FAQ补Meta-第3批-全量1407条含URL勘误-V1.0-星触达-20260817.xlsx

工作表：URL勘误-前两批!A1:F1252

1,251 个唯一来源；

1,250 个目标 URL；

720 个大小写修正；

531 个 slug 重建；

存在一组合法 many-to-one：两个不同大小写来源汇聚到同一个小写 canonical。

fastgpt.cn 工作簿

week05/外链-已发批次URL勘误/FastGPT-已发外链目标URL勘误-V1.0-星触达-20260817.xlsx

工作表：需修正-指向404!A1:G38

37 个唯一来源；

30 个目标 URL；

23 个大小写修正；

14 个 slug 重建；

来源 host 均为 fastgpt.cn；

目标中 23 个留在 CN host，14 个跨到 IO host；

7 组由 /zh/faq/... 和 /faq/... 汇聚到同一 IO canonical。

【交付物事实】合并后共有 1,288 个唯一 (sourceHost, sourcePath) alias，所有目标 slug 均存在于当前 1,400 条 FAQ registry。

【实时探测】恢复包/LIVE_EVIDENCE_ADDENDUM.md:5-14 只抽测了四类来源并记录为 404。不能据此声称全部 1,288 个来源在当前生产环境均为 404。

6.2 alias 模型裁决

裁决：AGREED_WITH_CORRECTION

必须建立独立的 URL Alias Authority，不能继续把工作簿 alias 隐式塞入现有页面 registry 推导逻辑。

每条 authority 记录至少应包含：

字段	规则
sourceHost	必填，区分 fastgpt.cn 与 fastgpt.io
sourcePath	必填，不包含 query 或 fragment
targetHost	必填
targetPath	必填，不包含 query 或 fragment
来源证据	工作簿、工作表、Excel 物理行、业务编号或数据哈希
修正类型	case-only、slug-rebuild、cross-host 等
disposition	accepted、denied、merged 或 conflict
备注	many-to-one 原因、历史发布批次等

身份键应是 (sourceHost, normalizedSourcePath)。Query 不属于 alias 身份，收到的 query 必须原样附加到目标。

不变量

一个来源只能有一个目标；

多个来源允许汇聚到一个目标；

禁止自重定向；

禁止环；

禁止重定向链；

目标必须是 registry 所有、终态 200 的 canonical；

CN 来源只部署在 CN edge，IO 来源只部署在 IO edge；

目标可跨 host；

小写 canonical 本身必须继续返回 200，不能被大小写 alias 规则吞掉；

trailing slash 和编码变体必须有明确策略。

6.3 当前源码缺陷

repo/scripts/lib/redirects.js：

76-164：alias 主要从 FAQ route registry 和 legacy source 推导。

142-155：把 many-to-one 视为冲突，无法表达工作簿中的合法汇聚。

195-205：处理 source 冲突及 trailing slash 变体。

207-214：把 FAQ alias 目标统一构造成 fastgpt.io，无法正确表达 CN→CN 与 CN→IO。

294-325：生成 Worker 逻辑。

303-305：包含 query 转移逻辑。

328-353：生成 Nginx 映射。

355-376：用 JavaScript 精确大小写 Map 解析生成物，不能忠实证明实际 Nginx 字符串匹配语义。

repo/scripts/verify-faq-redirects.js：

65-85：同样拒绝 many-to-one。

97-106：只从生成文本检查 query 保留。

111-158：验证解析后的构件，但不等于真实 Nginx 请求行为。

repo/nginx.conf:21-24 使用 $is_args$args 附加 query，这是必要机制，但仍需真实 HTTP 验证。

【推断】当前 JavaScript 构件解析器可能通过，而实际 Nginx 因大小写匹配方式产生不同结果。最终门禁必须加入真实 Nginx 运行时测试，不能只测试生成文本或自建解析器。

6.4 Nginx 和 Worker 投影策略

更安全的 Nginx 方案是：

所有 FAQ alias 都生成锚定、精确、大小写敏感的 path 规则；或至少所有包含大写字母的历史来源都必须使用大小写敏感规则。

小写 canonical 路径作为保留冲突键，任何 alias 不得覆盖它。

生成前按 host 分区。

生成后检查来源唯一、目标合法、无链、无环。

在实际 Nginx 容器中发起 HTTP 请求验证，而不是只解析配置字符串。

Worker 应复用同一份 alias authority，不应另建一套数据推导规则。

6.5 必测矩阵

对全部 1,288 条 alias 执行：

来源请求禁用自动跟随，确认一次返回预期 301 和精确 Location。

跟随一次后确认终态 200。

终态 URL 等于 registry canonical。

不存在第二跳。

原 query 精确保留。

目标无额外 query 或 fragment。

canonical 自身不重定向。

代表性边界测试还应覆盖：

大写来源与小写 canonical；

trailing slash；

百分号编码；

含空格或非 ASCII 字符的编码变体；

CN→CN；

CN→IO；

IO→IO；

合法 many-to-one；

带多个 query 参数及重复参数；

空 query；

与非 FAQ 路由潜在冲突。

6.6 发布与回滚

先在预览环境部署两 host 的独立构件。

完成全部 1,288 条自动化契约检查后再生产发布。

CN 和 IO 可以分开发布，但每个 host 的 authority、Nginx/Worker 构件及验证报告必须原子一致。

保存上一版 edge 构件，回滚时整体替换。

301 可能被浏览器和中间缓存长期保存，因此必须把完整预检放在生产之前；不能依赖“上线后发现问题再迅速回滚”。

7. P1-A：FAQ 1407 → 1400 规范化和 Meta 补齐
7.1 正确计数

来源工作簿：

week05/存量修复-补Meta第3批/FastGPT-存量FAQ补Meta-第3批-全量1407条含URL勘误-V1.0-星触达-20260817.xlsx

主要工作表：

全量可导入-1407条!A1:L1408

URL勘误-前两批!A1:F1252

无线上页面-593条!A1:E594

说明与口径!A1:B11

【交付物事实】

数据行：1,407；

唯一 URL：1,399；

唯一问题：1,401；

当前 FAQ registry：1,400；

当前已有 metadata：1,195；

需新增 metadata：205。

规范化算式：

动作	行数变化	剩余
原始候选	—	1,407
排除一个无现有页面身份的记录	-1	1,406
六组重复各折叠一条	-6	1,400
一条错误映射改指已有正确身份	0	1,400

最终必须满足：

1,400 个 registry 身份；

1,195 个既有 metadata 记录保持内容身份不变；

新增 205 个 metadata；

fallback 为 0。

7.2 Excel 行和业务编号修正

【交付物事实】PLAN_V2.md:132 把 1171 / 1665 / 980 称为“row”，实际这些是工作簿业务编号 no，不是 Excel 物理行。

正确表述为：

项目	Excel 物理行	业务编号 no
Prompt engineering 保留记录	759	980
Competitor marketing 保留记录	881	1171
Maintainability 保留记录	1223	1665

后续 ADR、审计台账和测试失败信息必须同时输出：

sheet 名称；

Excel 物理行；

业务编号；

canonical slug。

禁止只写含糊的“row 1171”。

7.3 一条映射修正和一条排除
映射修正

全量可导入-1407条 Excel 行 122

业务编号 149

问题内容是 corporate training

当前错误指向：how-ai-intelligent-platforms-enhance

应改指：how-ai-platforms-improve-corporate-training

【源码事实】：

repo/src/faq/en.ts:130-136 中前者实际是 customer experience。

repo/src/faq/en.ts:1106-1112 已存在 corporate training 身份。

repo/src/faq/generated-en-metadata.json:7862-7871 是 customer-experience metadata。

repo/src/faq/generated-en-metadata.json:7979-7988 是 corporate-training metadata。

排除记录

Excel 行 1197

业务编号 1628

问题：How to ensure the long-term stable operation of AI Agent

disposition：no-page

不得导入 metadata，也不得因此自动生成新 FAQ 页面。

【源码事实】现有 how-to-ensure-the-long-term 身份对应 maintainability，而不是该问题，见 repo/src/faq/en.ts:9594-9600。

7.4 六组重复裁决
canonical/语义	保留	排除	理由
can-ai-automatically-generate-data-security-reports	Excel 554 / no 728 / W4	Excel 593 / no 785 / W5	保留既有批次权威
what-does-prompt-engineering-mean	Excel 759 / no 980	Excel 629 / no 832	被排除标题截断
zero-shot vs few-shot	Excel 682 / no 894 / W4	Excel 772 / no 993 / W5	保留既有批次权威
competitor marketing	Excel 881 / no 1171	Excel 891 / no 1194	后者 description 以不完整的 “and” 结束
short video script	Excel 896 / no 1202 / W4	Excel 994 / no 1373 / W5	保留既有批次权威
maintainability	Excel 1223 / no 1665	Excel 1295 / no 1797	保留较完整且已选定的记录
7.5 “保持 1,195 条稳定”的正确含义

裁决：AGREED_WITH_CORRECTION

不能把“加入 205 条后整个 JSON 文件字节不变”作为要求，因为记录增加、排序或 provenance 字段都会改变文件字节。

正确不变量是：

现有 1,195 个 contentId 仍存在；

每个既有 contentId 的受保护业务字段深度相等；

或对每条既有记录生成规范化 canonical JSON digest，导入前后 digest 相同；

不以整个文件的 byte-for-byte 相等作为判定。

7.6 实施与验证

最终 authority 应明确记录：

1,407 个原始候选的逐行 disposition；

映射修正；

六个 duplicate loser；

一个 no-page；

1,400 个最终 registry 身份；

205 个新增 metadata；

593 条无线上页面继续留在 backlog，不生成页面。

发布前门禁：

registry 总数严格为 1,400；

metadata 总数严格为 1,400；

原有记录 1,195、新增记录 205；

fallback 0；

无未知 slug；

无重复 contentId、slug 或 canonical；

title/description 长度、完整句、无截断；

canonical、hreflang 和路由一致；

FAQ Meta 发布不改变 FAQ 正文和页面身份。

回滚只移除 205 个新增 metadata，并恢复对应生成物；不得删除页面或回滚 1,195 个既有记录。

8. P1-B：五组双语 Guide
8.1 路由裁决

五个目标 slug：

poc-30-day-design

database-qa-integration-guide

scheduled-report-automation

finance-research-retrieval

finance-daily-report-automation

裁决：统一使用 /guide/{slug}，状态 AGREED_WITH_CORRECTION。

【源码事实】

repo/src/lib/guideSeo.ts:49-70 已把 Guide hub 和详情页定义为 /guide、/guide/{slug}，并从该路径生成 canonical 和 alternates。

repo/src/content/guides/policy.json:1-6 定义 locale、分组、资产状态和 schema 规则，当前 entryCount 为 8。

repo/src/content/guides/registry.ts:169-200 验证精确数量和双语配对。

repo/src/content/guides/registry.ts:205-210 按 registry 查找内容。

repo/src/lib/guideContent.ts:51-103 解析并剥离交付注释，验证 metadata 和哈希。

repo/scripts/verify-guide-export.js:255-270 以 /guide 验证路由。

repo/scripts/verify-guide-export.js:368-386 验证 metadata、canonical 和 hreflang。

repo/scripts/verify-guide-export.js:492-519 验证精确 sitemap 集合。

【交付物事实】本批中文和英文交付注释仍使用 /tutorial/，与当前 route authority 冲突。该字段只能视为交接信息，不能成为路由来源。

发布后 registry 应从 8 增至 13，新增 5 个双语身份、10 个 Markdown 文件。

8.2 内容问题
英文 metadata

【交付物事实】五篇英文候选均存在标题或描述截断、不完整句或质量问题。例如：

POC：标题在 Criti 处截断，description 以 and 结束；

Database：标题在 Com 处截断；

Scheduled：标题在 Implementati 处截断；

Finance daily：标题在 Workflo 处截断；

多篇 description 缺少完整句末或表达过于模板化。

相关候选文件头部约在第 7-8 行。现有验证器要求英文 title 约 50–60 字符、description 约 140–160 字符，见 repo/scripts/verify-guide-content.js:16,179-197。长度只是门禁之一，不能用补空泛词语的方式机械凑数。

交付注释泄漏

【交付物事实】英文稿约第 17-18 行仍包含“fastgpt.cn robots Disallow Googlebot”等过期流程说明。该信息不得渲染到页面，也不得成为当前 robots 决策依据。

Mermaid

POC：中文约第 68 行，英文约第 88 行；

Database：中文约第 51 行，英文约第 69 行；

Scheduled：中文约第 78 行，英文约第 105 行。

【推断】只有在现有 Markdown parser、静态构建、客户端水合、无障碍替代和导出验证均支持 Mermaid 时才可保留。否则应改写为读者可见的步骤、表格或静态图，不得上线原始未渲染 directive。

财务案例权利和事实

finance-research-retrieval、finance-daily-report-automation 的交付注释和正文中包含客户名称、数量指标、成果表述和截图请求，例如：

英文 finance research：交付注释约 12-18 行，正文案例约 112-130 行；

英文 finance daily：交付注释约 12-18 行，正文案例约 88-102 行；

中文 finance daily：交付注释约 12-13 行，正文约 90-96 行。

裁决：source-exception 不是事实或权利豁免。

【源码事实】source-exception 在当前 Guide policy 中属于资产工作流状态。
【推断】它不能替代客户授权、指标来源、截图版权和案例 owner 审批。

发布前必须二选一：

提供可持久审计的来源与授权记录；或

删除客户识别信息、量化成果和未获批截图，并改为不误导的通用场景。

requested-unapproved 资产不得渲染。

8.3 每组 Guide 的发布裁决
Guide 对	内容类型建议	发布门禁
POC 30-day design	Article；确有连续操作步骤时附 HowTo	Mermaid/替代表达、步骤可执行、内部链接终态 200
Database Q&A integration	Article + 适用时 HowTo	数据库权限、连接方式、版本和安全说明准确
Scheduled report automation	Article + 适用时 HowTo	调度、失败恢复、幂等和通知说明完整
Finance research retrieval	行业 Guide/Article	客户、指标和截图授权；无授权则匿名化
Finance daily report automation	行业 Guide/Article	同上；不得把个案指标写成普遍能力

HowTo schema 只能用于正文确实提供顺序明确、读者可执行的步骤，不能为了富媒体结果机械添加。

8.4 原子发布和回滚

每个双语对是一个原子单元：

中英文文件；

registry 条目；

内容哈希；

canonical/hreflang；

hub 列表；

sitemap；

schema；

资产状态。

某一语言未通过时，不得只发布另一语言并生成孤立 hreflang。

五对可按审批进度分批发布，但最终 registry 数量必须为 13。回滚时按双语对整体撤回，不留下 sitemap 或 hub 悬挂链接。

9. P2：888 条技术页治理
9.1 不能直接复用现有 454 页导入模型

工作簿：

week05/程序化技术页-第3批/FastGPT-程序化技术页-第3批上线清单-V1.0-星触达-20260817.xlsx

上线清单!A1:H889

说明与纪律!A1:B11

888 条数据；

888 个唯一 path；

888 个 Markdown；

888 个来源 issue；

类型全部为 troubleshoot。

【源码事实】

repo/src/lib/technical-content-policy.json:2-6 仍固定记录上一批：

总候选 454；

accepted 450；

denied 4；

当前技术页 1,122。

repo/scripts/import-technical-content.js：

18-34 固定旧批次数量；

247-254 只处理长 sk- 形态；

512-553 要求 上线清单、已合并不上线、说明与纪律 三张表，而 Week05 工作簿只有两张；

934-965 固定验证上一批 454/450/4；

967-1006 生成页面、搜索等投影；

1026-1030 执行原子写入。

【推断】不能把常量从 454 改成 888 后直接导入。需要累计式、多批次 authority：

保留旧批次 454 的 accepted/denied 和现有页面；

为 Week05 888 条建立独立逐条 disposition；

每批有独立工作簿哈希、来源、候选数和验收摘要；

全局 registry/search/sitemap 从所有已接受批次汇总；

最终满足 accepted + denied = 888；

新总页数为 1,122 + accepted_unique_count。

accepted_unique_count 不得预先写死为 888。

9.2 四个现有身份冲突

这四条不得生成新页面，应以 existing-identity-collision 拒绝并保留现有 canonical：

Excel 物理行	序号	Issue	Path
557	556	#5165	fastgpt-plugin-s3-connection-refused
623	622	#3705	fastgpt-private-deployment-error
630	629	#3291	fastgpt-private-deployment-troubleshooting
793	792	#1577	fastgpt-troubleshooting-guide

【交付物事实】Excel 物理行包含表头偏移，后续报告必须同时注明“Excel 行”和工作簿“序号”，不能混用。

9.3 两组完全同标题候选
候选	裁决
Excel 174/175，序号 173/174，Issue #4023/#4031	#4031 合并到 #4023 候选身份；但 #4023 现有内容只推断“切换模型/配置”，缺少验证过的根因和修复来源，仍为 needs-evidence，不得自动接受
Excel 586/821，序号 585/820，Issue #1108/#1109	两条均明确缺少确定原因或标准修复；先合并证据，不预先选择可发布 winner。证据不足时两条均 denied；若后续有正式依据，只允许一个身份

最终 authority 中，被合并记录也必须有明确 disposition，例如 denied: merged-into-candidate，不能从 888 计数中消失。

9.4 七组高相似候选
候选	独立裁决
#5481 / #5483，Excel 850/855	同错误和版本，#5483 合并到 #5481 候选；仍需验证具体配置键和官方修复
#2204 / #396，Excel 104/105	不是重复。#2204 有空 Bearer 的可诊断问题，可在验证端点和版本后接受；#396 缺少实际错误、使用私有 HTTP URL，并含完整 FastGPT-key 形态，拒绝
#1499 / #1572，Excel 568/569	同类错误但环境和拟议修复不同，现有内容可能冲突或推测；取得正式 commit/版本依据前不合并、不发布
#3214 / #981，Excel 604/609	原因不同：datasetProcess 缺陷与浏览器/翻译环境。应保留两个候选身份并改写差异化标题，但都需来源证明
#3546 / #3765，Excel 649/650	场景不同：tool calling 集成与通用模型配置。可保留两个候选，但修复必须有版本和来源支持
#1662 / #2425，Excel 474/647	原因完全不同：图片兼容性与 InnoDB 损坏。#2425 涉及删除数据库目录，必须进行 DBA 级重写、备份和恢复设计，否则拒绝
#1782 / #1863，Excel 361/618	症状不同但均缺少根因和验证过的修复；本批直接拒绝，不能仅凭相似度合并成一篇猜测性页面

【推断】相似度只能触发人工复核，不能自动决定 merge。判断依据应是错误指纹、根因、环境、修复动作和最终 canonical 意图，而不是标题词面接近。

9.5 Credential-shaped 内容
对恢复包安全修正的裁决

恢复包/SECURITY_SCAN_CORRECTION.md:3-23 已纠正原先过度宽泛的安全表述，并确认部分值已脱敏。

状态：AGREED_WITH_CORRECTION。

【交付物事实】恢复包仍至少包含两种不同的完整 FastGPT-key 形态字符串：

week05/程序化技术页-第3批/troubleshoot/fastgpt-api-error-troubleshooting.md:12,25

week05/程序化技术页-第3批/troubleshoot/fastgpt-chat-completions-error.md:12

本报告不复述其值。

【推断】仅凭附件上下文不足以证明这些字符串是合成值。正确状态应是 needs-review，而不是直接归为“synthetic sample”。

其他需要统一处理的样例包括：

fastgpt-custom-key-troubleshooting.md:12,18-19,29

fastgpt-rerank-container-error-restart.md:20,25

fastgpt-speech-recognition-timeout.md:25

fastgpt-third-party-voice-model-error.md:23,30

fastgpt-self-signed-cert-error-fix.md:19

fastgpt-support-completions-api.md:27

fastgpt-upgrade-db-start-troubleshooting.md:14

已出现明确脱敏标记的文件包括：

fastgpt-image-download-failed.md:14

fastgpt-local-image-timeout-fix.md:14

fastgpt-workflow-url-missing-ip-port.md:12

fastgpt-pdf-parse-connection-refused.md:18

凭证台账

每个命中位置必须有以下三种状态之一：

redacted-secret

approved-synthetic-placeholder

needs-review

台账不得保存原始疑似密钥值，只保存：

文件路径；

行号；

形态类型；

masked fingerprint；

裁决；

reviewer；

证据；

替换结果。

允许的公开示例应统一为明显占位符，例如 YOUR_API_KEY、YOUR_ACCESS_TOKEN。发布不变量应表述为：

unresolved 或未经审批的 credential-shaped 值为 0。

不能表述为“任何密钥形态字符都为 0”，否则会误伤必要的安全教学占位符。

扫描规则至少应覆盖：

FastGPT key 形态；

通用 sk- 形态；

Bearer/JWT；

URL query 中的 token、key、secret；

云厂商访问键；

私钥头；

数据库密码和带凭证 DSN；

自定义 header 中的认证值。

现有 importer 只处理长 sk-，明显不足。

9.6 危险和破坏性命令

Codex 只列四个文件是不完整的。至少以下文件必须进入危险操作台账：

文件和位置	操作	风险级别
fastgpt-build-discrepancy-server.md:19	删除 node_modules、.pnpm-store	D1
fastgpt-docker-build-tiktoken-error.md:20,22	builder prune、删除 encoders	D1
fastgpt-master-build-copy-error.md:23,36	Dockerfile 删除文件、docker system prune -a	D0
fastgpt-pnpm-dev-usememo-error.md:18	删除依赖和 lockfile	D1
fastgpt-docker-deploy-ui-unavailable.md:28	docker-compose down -v	D0
fastgpt-docker-port-fix.md:25	docker-compose down -v	D0
fastgpt-pg-hostname-resolve-error.md:29	删除 Docker network	D1
wsl-fastgpt-deployment-troubleshooting.md:25	删除持久化 PostgreSQL/MongoDB 数据目录	D0
fastgpt-private-mysql-start-fail.md:24	清理 MySQL 数据目录	D0
fastgpt-local-start-heat-update-path-error.md:24	删除 .next 缓存	D2
fastgpt-private-blank-page-troubleshooting.md:21	删除临时缓存	D2

风险定义：

D0：数据卷、数据库目录或全局 Docker 资源删除。默认拒绝；只有重写为非破坏性诊断、备份、恢复及影响说明后才可重新评审。

D1：限定作用域的依赖、锁文件、网络或构建缓存删除。必须先提供低风险步骤，并明确工作目录、前置条件、影响和回滚。

D2：可再生应用缓存。可以保留，但必须限制目录并说明会触发重建。

任何技术页都不得引导读者把破坏性命令作为首选步骤，也不得暗示自动执行。

9.7 每条技术页的接受标准

一条候选只有同时满足以下条件才能 accepted：

来源 issue、正式文档、commit、release note 或 maintainer 说明能支持结论；

有可识别的错误指纹；

环境和适用版本明确；

根因不是从现象臆测；

修复动作与根因对应；

有验证修复是否成功的方法；

不含 unresolved credential-shaped 内容；

不含未裁决的 D0/D1 操作；

canonical 身份唯一；

与既有 1,122 页无重复或冲突；

标题、description、正文不截断；

不把单一用户个案写成普遍产品事实。

Issue URL 本身只证明“有人报告过问题”，不证明候选稿中的根因和解决方案正确。

9.8 分波发布

PLAN_V2.md 中“首波不超过 100、后续不超过 200”只能作为上限，不能作为默认批量。

修正后的方案：

波次	数量	目标
Wave 0	0	完成 dry run、authority、冲突、安全、危险命令、生成物和回滚验证
Wave 1	25–50	只发布证据最强、风险最低、无敏感内容的页面
Wave 1 扩展	最大 100	仅在 reviewer 容量和全部门禁通过时扩展
后续波次	每波最大 200	按风险、主题和证据等级分组，不按工作簿顺序机械切片

72 小时和 14 天观察可用于发现 404、构建、抓取、性能和索引异常，但不能证明技术答案正确。内容正确性必须在发布前由证据和 reviewer 证明。

回滚时必须从 registry、搜索索引、sitemap 和页面输出中原子撤回整波。若页面已经被索引：

有正确替代页时一跳重定向；

明确永久撤销且无替代时使用有意的 410；

不得因 registry 不一致产生意外 404。

10. 跨任务验证矩阵
10.1 已有基线证据

根据 恢复包/BASELINE_TEST_EVIDENCE.md:7-36：

【交付物事实】

依赖安装时未运行生命周期脚本；

基线 source gates 被记录为通过；

当前 FAQ redirect eligible 数量为 0；

FAQ metadata 记录为 1,195 mapped、205 fallback、总计 1,400；

工作树为 clean detached head；

执行环境是大小写不敏感的 APFS；

记录明确要求发布门禁在大小写敏感文件系统中运行。

这些是恢复包记录的基线证据，不是对未来改动的测试结果，也不是本轮新跑出的完整构建证据。

10.2 分层门禁
阶段	必须证明的内容	不得冒充
0. 数据 authority	包哈希、工作表范围、逐行 disposition、文件映射、来源、冲突和安全台账	不代表源码可构建
1. 源码契约	lint、类型、registry、导入器和专项 verifier	不代表页面已渲染
2. 完整构建	CN、IO、预览变体在大小写敏感 FS 上构建；静态导出、canonical、hreflang、schema、sitemap	不代表预览 HTTP 正确
3. 预览 HTTP	状态码、Location、Content-Type、header、HTML metadata、真实 Nginx/Worker 行为	不代表生产正确
4. 生产 HTTP	全量 alias、页面、robots、sitemap、canonical 和 header	不代表已被搜索引擎处理
5. 搜索平台	抓取、canonical 选择、索引、noindex、链接权益和覆盖趋势	不能反推内容技术正确性

明确禁止以下等同：

source-only test = full build；

full build = preview deployment；

preview = production；

production 200 = 已抓取或已索引；

source issue = 已验证解决方案；

2026-08-23 附件探测 = 本轮当前现网状态；

owner repo 缺失 = 已验证 Solutions 实现。

10.3 任务级门禁摘要
任务	数据/源码门禁	构建/HTTP 门禁	搜索门禁
Solutions	owner inventory、路由与 header authority	根 robots/sitemap、canonical、自指 200、Markdown noindex	canonical 和投影去索引趋势
FAQ alias	1,288 authority、无 source-to-many、无链环	真实 Nginx/Worker；每条一跳 301→200、query 保留	404 和旧 URL 抓取趋势
FAQ Meta	1,400 = 1,195 + 205、fallback 0	页面 title/description/canonical/hreflang	重复标题、索引覆盖和展示变化
Guide	registry 13、五个双语对、授权和资产状态	页面、hub、sitemap、schema、hreflang、无孤儿语言	抓取、canonical、内容表现
技术页	888 全量 disposition、安全和危险台账	每波完整构建、页面/搜索/sitemap 原子一致	软 404、重复内容、抓取、撤回页处理
11. Owner 与依赖
责任域	主 owner	硬依赖
Solutions P0	Solutions owner repo 工程、SRE	owner repo、路由 inventory、CDN/代理配置
FAQ alias	FastGPT Home 工程、边缘部署 owner	两份工作簿、双 host 发布权限、真实 Nginx/Worker 环境
FAQ Meta	FastGPT Home 工程、SEO 内容 owner	1,400 identity authority、205 条编辑审批
Guide	内容、FastGPT Home 工程	客户案例授权、资产审批、双语编辑
技术页	技术内容、工程、产品/maintainer	issue 证据、版本和正式修复依据
凭证审核	Security	逐命中台账和 masked review
危险命令	SRE/DBA/Security	影响和恢复方案
发布门禁	Release/SRE	大小写敏感构建环境、预览和生产访问
搜索验证	SEO/Search owner	GSC/Bing 等部署后数据

【推断】Solutions owner repo 是实现硬依赖，但不是方案共识的阻塞项。本次已经确定应满足的公开 HTTP 契约；待 owner repo 提供后，再把契约映射到具体源码符号。

12. 剩余证据缺口

以下事项在实施前或发布前必须补齐，但不构成本报告方案层面的未决分歧：

Solutions owner repo 和部署配置
尚未看到其 App Router、框架 basePath、代理、CDN、robots/sitemap 及 Markdown header 实现。

Solutions 完整内容 inventory
17 个分类和 89 个案例只是附件快照，应与 owner 内容 authority 对账。

888 条技术候选的正式来源证据
工作簿和 issue 链接不足以证明所有根因和修复，需要 issue 内容、maintainer 结论、commit 或文档。

财务 Guide 的案例授权
客户名称、指标和截图缺少可审计授权材料。

大小写敏感环境下的完整构建
基线记录来自大小写不敏感 APFS；发布门禁必须另跑。

真实 Nginx/Worker 行为
当前 JavaScript 构件解析器不能替代实际 HTTP 请求。

生产和搜索平台结果
本轮未部署、未探测，也没有声称完成 GSC/Bing 验证。

全部 1,288 个来源的当前生产状态
附件只提供四类样本，不能把样本扩展为全量现状。

13. 最终决策表
争议项	最终状态	最终决策
Codex 初步四项优先级	AGREED_WITH_CORRECTION	Solutions 升为 P0-A；FAQ alias 为 P0-B；FAQ Meta 为 P1-A；Guide 为 P1-B；技术页降为 P2
五项任务队列	AGREED_WITH_CORRECTION	五项完整，但两个 P0 并行，严重度顺序与实施就绪度顺序分开表达
FAQ 1407→1400	AGREED_WITH_CORRECTION	1 个 no-page、6 个 duplicate loser、1 个计数不变的映射修正；纠正 Excel 行与业务编号混用
FAQ 1,195 稳定性	AGREED_WITH_CORRECTION	使用 per-contentId 深度相等或规范化 digest，不要求整个文件字节不变
双 host alias 模型	AGREED_WITH_CORRECTION	建立独立 host-aware authority；允许 many-to-one；真实 Nginx/Worker HTTP 门禁
五组 Guide 使用 /guide	AGREED_WITH_CORRECTION	接受 /guide/{slug}；剥离 /tutorial/ 交付信息，修复英文 metadata、资产和授权问题
888 技术页治理	AGREED_WITH_CORRECTION	不预设 accepted=888；逐条 accepted/denied；处理身份、重复、证据、安全和危险命令
Credential-shaped 合成样例	AGREED_WITH_CORRECTION	部分完整 FastGPT-key 形态仍为 needs-review，不足以证明合成；发布前必须清零 unresolved
危险删除命令	AGREED_WITH_CORRECTION	不止四处；至少 11 个文件进入 D0/D1/D2 台账，D0 默认拒绝
保留 /customers	AGREED_WITH_CORRECTION	仅作为 P0 临时公开路由契约；不是永久 basePath 结论
Solutions robots 与 X-Robots-Tag 顺序	AGREED	先返回并验证 noindex header，再考虑 robots Disallow
Solutions owner-repo 边界	AGREED	主仓库只能提供外链侧证据，不能替代 Solutions 实现仓库
证据语义	AGREED	明确区分源码、交付物、附件实时探测、推断和上线后验证

【推断】所有方案级关键决策已经闭合。剩余问题均已转化为明确 owner、输入材料和发布门禁，不需要以“永久 basePath 未知”或“最终 accepted 数量未知”为由维持方案争议：前者被限定为独立后续 ADR，后者必须由逐条证据治理产生，而不能预先拍定。

FINAL_CONSENSUS: AGREED

---

## ChatGPT Pro 最终计数纠错回执

- 回执时间：2026-08-24（Asia/Shanghai）
- 核对文件：`repo/src/lib/technical-content-policy.json:2-6`
- 核对文件：`repo/src/content/tech-center/authority/import-manifest.json:3-9`
- 最终状态：`FINAL_CONSENSUS: AGREED_AFTER_COUNT_CORRECTION`

### 独立核对结果

ChatGPT Pro 重新核对后确认以下权威计数：

| 字段 | 准确值 |
|---|---:|
| `expectedPageCount` | 1,122 |
| `expectedAcceptedCount` | 454 |
| `expectedDeniedCount` | 6 |
| `expectedAddCount` | 450 |
| `expectedUpdateCount` | 4 |

`import-manifest.json` 的 `pages` 数组包含 454 项，其中 450 项为 `add`、4 项为 `update`。
准确关系为：

```text
460 decided candidates = 454 accepted + 6 denied
454 accepted = 450 add + 4 update
expected page count = 1,122
```

原报告把裁决维度和操作维度混合，错误地将 450 add 标注为 450 accepted，并将 4 update 标注为
4 denied。修正后的固定契约必须显式写出字段名：454 accepted、6 denied、450 add、4 update、
1,122 total pages。

### 对 Week05 方案的影响

五项优先级、技术候选 P2 定位、逐条证据治理、安全裁决、分波发布和原子回滚维持原裁决。
计数模型更新为：

```text
week05AcceptedCount + week05DeniedCount = 888
week05AddCount + week05UpdateCount = week05AcceptedCount
expectedResultingPageCount = 1122 + week05AddCount
```

最后一个公式以当前批次没有 delete 操作为前提。accepted 中可以包含 update，因此 accepted 数量
不能直接作为新增页面数量。每个批次分别保存候选数、accepted、denied、add、update、结果页面数、
工作簿哈希、manifest、decision ledger 和发布验收摘要；累计投影保留历史 authority。

`FINAL_CONSENSUS: AGREED_AFTER_COUNT_CORRECTION`
