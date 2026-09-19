# 接口与数据约定

状态：T002 接口基线 v1。关联 [001 Spec](features/001-situationship.md)。本文件冻结实现契约，不表示已有 HTTP 服务、编译 ABI 或部署地址；修改下列语义须同步 Spec 和测试。

## 1. 公共类型与协议绑定

- 网络、官方测试 USDC 地址/精度唯一来源为 [生态文档](ecosystem.md)；合约部署时 token 不可变，不能由用户随单指定资产。
- EVM 地址 JSON 采用 `0x` + 40 位十六进制，校验后内部统一小写，展示可用 checksum；地址身份以钱包签名/链上调用者决定，不能信任请求体中的 sender。
- 金额 `uint256` 为 USDC 最小单位，JSON 为十进制数字字符串，不使用浮点；每类 `10000 <= amount <= 1000000000`。金额之外的时间/ID 使用下述限定类型。
- 时间链上 `uint64` Unix 秒，JSON 十进制数字字符串；`uint64` 对象 ID 同样用字符串。0 表示尚未发生/没有当前对象；有效 ID 从 1 递增。枚举 JSON 使用下面大写名称。
- `ghostWindow:uint32` 为 86400–2592000，须为 86400 的整数倍。链下 meetingTarget 为 0–31 整数、confirmationEveryDays 为 1–90 整数。未知字段/超范围/非法编码在 API 边界拒绝，不默默截断。
- `agreementHash` 与证据承诺均为非零 `bytes32`；每段关系按 `(chainId, factoryAddress, situationAddress)` 唯一标识，不接受用户随意提供的合约冒充本项目关系。

完整协议 `AgreementDocument` 字段固定：`version:1, chainId:number, factory:address, nonce:bytes32, participantA:address, participantB:address, supervisors:[address,address,address], recoveryAmount:string, bondAmount:string, ghostWindowSeconds:number, meetingTarget:number, confirmationEveryDays:number, policyVersion:"1", salt:bytes32`。nonce/salt 均客户端密码学随机生成，含正文和 salt 的 JSON 保存在链下。

`agreementHash = keccak256(UTF8(JCS(AgreementDocument)))`；JCS 使用 [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)，字段值不做额外 Unicode 归一化。金额字符串不含前导零，地址先规范小写，双方用相同算法重算；factory、网络、A/B、监督人、金额和 ghostWindow 还须与链上公开字段逐一比较。任何不一致阻止签署，不依赖服务端一句“已校验”。policyVersion 绑定 Spec 第 2 节固定时限/结算规则；首版仅接受版本 1。

A 的 Factory 创建交易和 B 的 `acceptAgreement(agreementHash)` 是两次协议签署。链上用 msg.sender、合约地址、当前状态及摘要校验；不把 SIWE 登录或 ERC-20 approve 当关系签署；不添加代签转账/任意离线签名执行器。交易链 ID/nonce 与对象 ID 分别防跨链重放和旧动作复用。

## 2. 部署与数据布局

部署一个 `SituationFactory(token)`；每次创建部署一个 `SituationAgreement`，包含 `SituationVault` 与 `DisputeResolution` 内部模块。后两者是抽象 Solidity 模块/内部逻辑，不独立部署或持有其他关系的钱。所有业务存储与资金在本关系实例，Factory 只创建和登记。无升级、管理员裁决、换监督人、挪款或修改费率入口。

```solidity
struct CreateParams {
    address participantB;
    address[3] supervisors;
    uint256 recoveryAmount;
    uint256 bondAmount;
    uint32 ghostWindow;
    bytes32 agreementHash;
}
enum Lifecycle { INVITED, FUNDING, ACTIVE, ENDING, DISPUTED, SETTLING, ENDED, CANCELLED }
enum CheckStatus { NONE, WAITING, RESPONDED, WITHDRAWN, EXPIRED, CLAIMED }
enum DisputeStatus { NONE, APPEAL, VOTING, UPHELD, REJECTED, TIMED_OUT, RESUMED, MUTUAL_END }
enum ResolutionMode { RESUME, END_REFUND }
enum TerminationReason { NONE, CANCELLED_BY_PARTICIPANT, INVITE_EXPIRED, FUNDING_EXPIRED,
    MUTUAL_END, BREACH_A, BREACH_B, REJECTED, TIMED_OUT }
```

枚举数字由上面顺序从 0 固定；新增值只能末尾追加并更新契约版本。以下为各 view 返回结构及其存储语义；字段顺序按每行所列顺序确定，用于 T003 产出共享类型和后续 ABI：

| 类型 | 字段与约束 |
| --- | --- |
| SituationView | `Lifecycle state; uint64 createdAt, invitationDeadline, signedAtB, fundingDeadline, activatedAt, terminatedAt, settlementCompletedAt; bool[3] supervisorsAccepted; bool[2] funded; uint64 currentCheckId, currentDisputeId, endRequestId; address endRequester; TerminationReason terminationReason; uint256[2] entitlement, paid`；数组参与者顺序始终 A/B |
| CheckView | `uint64 id; CheckStatus status; address requester, respondent; uint64 sentAt, deadline, claimDeadline, respondedAt, lateRespondedAt, disputeId`；claimDeadline=deadline+7 天；lateRespondedAt 只记录第一次迟到回应 |
| DisputeView | `uint64 id, checkId; DisputeStatus status; address claimant, respondent; uint64 openedAt, appealDeadline, voteDeadline; uint8 yesCount, noCount; uint8[3] votes; uint8[2] evidenceCounts; bool wasEscalated; uint64 resolutionId; address resolutionProposer; ResolutionMode resolutionMode`；votes 为 0 未投/1 违约/2 否决；wasEscalated 一旦投票阶段开始永不清除 |

所有 immutable 公开字段提供无参 getter：`factory(), token(), participantA(), participantB(), agreementHash(), recoveryAmount(), bondAmount(), ghostWindow()`；`supervisors(uint256 index)` 返回固定名单 index 0–2；`snapshot() returns (SituationView)`、`getCheck(uint64) returns (CheckView)`、`getDispute(uint64) returns (DisputeView)`、`getEvidence(uint64 disputeId,address owner,uint8 index) returns (bytes32)`。

不存在的历史对象/超范围索引报 `NotFound()`，不能伪装成已结束。Factory 提供 `isSituation(address) returns(bool)` 与 `situationOf(address creator,bytes32 agreementHash) returns(address)`；后一查询未创建返回零地址。每个 `(creator,agreementHash)` 只创建一次，不因取消而释放摘要复用。

## 3. 链上写入接口

下表签名均为 `external`，除显式 returns 外不返回业务数据，结果以事件及 view 确认。所有金额动作 nonReentrant；状态转移前重新读当前状态，状态和截止规则遵循 [Spec 第 10 节](features/001-situationship.md#10-完整状态机)。msg.sender 权限不因前端检查而省略。

| 签名 | 权限与前置条件 | 结果 / 主要事件 | 主要拒绝原因 | AC |
| --- | --- | --- | --- | --- |
| Factory `createSituation(CreateParams p) returns(address)` | msg.sender 为 A；5 地址非零互异，金额/时限合法，摘要未使用 | 部署实例、A 已签，邀请截止=block.timestamp+7 天；SituationCreated | InvalidAddress/InvalidTerms/DuplicateAgreement | AC-001-01、13、14、17 |
| `acceptAgreement(bytes32 expectedHash)` | 指定 B，INVITED，t<=邀请截止，摘要相同 | FUNDING；fundingDeadline=当前时刻+7 天；AgreementAccepted | Unauthorized/InvalidState/DeadlinePassed/HashMismatch | AC-001-01、15 |
| `acceptSupervision(bytes32 expectedHash)` | 指定监督人，INVITED/FUNDING，未过对应截止，尚未接受且摘要相同 | 记接受；SupervisorAccepted；不自动入金/延时 | Unauthorized/AlreadyDone/DeadlinePassed/HashMismatch | AC-001-02、13、15 |
| `deposit()` | A/B，FUNDING、3人接受，t<=入金截止，本人未存，余额和allowance>=R+B | 从 msg.sender 转 R+B，净到账必须完全相等；第二人激活；Deposited/Activated | InvalidState/SupervisorsNotReady/AlreadyDone/DeadlinePassed/TokenTransferFailed | AC-001-02、17 |
| `cancel()` | 任一参与者，INVITED/FUNDING | 原额退款分配；终止原因 CANCELLED_BY_PARTICIPANT | Unauthorized/InvalidState | AC-001-16 |
| `expire()` | 任意地址，INVITED/FUNDING，t>当前阶段截止 | 原额退款，INVITE_EXPIRED/FUNDING_EXPIRED | InvalidState/TooEarly | AC-001-15、16 |
| `requestEnd() returns(uint64)` | 参与者，ACTIVE | 新 endRequestId；ENDING；EndRequested | Unauthorized/InvalidState | AC-001-04、23 |
| `withdrawEnd(uint64 requestId)` | 本次请求发起人，ENDING，同 ID | 清请求回 ACTIVE；EndWithdrawn | Unauthorized/StaleId/InvalidState | AC-001-23 |
| `confirmEnd(uint64 requestId)` | 另一参与者，ENDING，同 ID | 关闭在途确认，MUTUAL_END 分配；终止请求失效 | Unauthorized/StaleId/InvalidState | AC-001-04、09、23 |
| `sendCheck() returns(uint64)` | A/B，ACTIVE/ENDING，无在途 WAITING 确认 | 新 Check，截止=当前时刻+ghostWindow；CheckSent | Unauthorized/InvalidState/InFlight | AC-001-05、19 |
| `respond(uint64 checkId)` | 本次接收方，当前 WAITING 或当前争议的 CLAIMED；未记录对应回应；争议时未过voteDeadline | 截止内 RESPONDED；截止后仅填 lateRespondedAt；Responded | Unauthorized/StaleId/AlreadyDone/InvalidState/DeadlinePassed | AC-001-05、18 |
| `withdrawCheck(uint64 checkId)` | 确认发起方，ACTIVE/ENDING，当前 WAITING | WITHDRAWN、释放占位；CheckClosed | Unauthorized/StaleId/InvalidState | AC-001-19 |
| `expireCheck(uint64 checkId)` | 任意地址，ACTIVE/ENDING，当前 WAITING，t>claimDeadline | EXPIRED、释放占位；CheckClosed | StaleId/InvalidState/TooEarly | AC-001-19 |
| `openDispute(uint64 checkId) returns(uint64)` | 确认发起方，ACTIVE/ENDING，当前 WAITING，deadline<t<=claimDeadline，respondedAt=0 | CLAIMED，DISPUTED/APPEAL，清结束请求；DisputeOpened | Unauthorized/StaleId/InvalidState/TooEarly/DeadlinePassed | AC-001-05、06、18 |
| `registerEvidence(uint64 disputeId,bytes32 commitment)` | 参与者，当前 DISPUTED/APPEAL，t<=appealDeadline，非零/本实例未登记过承诺，每方<10条 | 追加固定哈希索引；EvidenceRegistered | Unauthorized/StaleId/DeadlinePassed/InvalidEvidence/EvidenceLimit | AC-001-26、29 |
| `startVoting(uint64 disputeId)` | 任一参与者，当前 APPEAL，appealDeadline<t<=voteDeadline | VOTING，wasEscalated=true；VotingStarted；不改期限 | Unauthorized/StaleId/TooEarly/DeadlinePassed | AC-001-20 |
| `vote(uint64 disputeId,bool breach)` | 指定监督人，当前 VOTING、未投、t<=voteDeadline | 计票；两票同向触发固定分配；VoteCast/DisputeResolved | Unauthorized/StaleId/AlreadyDone/DeadlinePassed/InvalidState | AC-001-07、08、21 |
| `proposeResolution(uint64 disputeId,ResolutionMode mode) returns(uint64)` | 任一参与者，当前 APPEAL/VOTING，t<=voteDeadline | 新 resolutionId 替换旧提议；ResolutionProposed；不延时 | Unauthorized/StaleId/InvalidState/DeadlinePassed | AC-001-22 |
| `confirmResolution(uint64 disputeId,uint64 resolutionId)` | 提议者之外的另一参与者，当前提议/案件，t<=voteDeadline | RESUME：RESUMED、ACTIVE，清在途指针，保留原activatedAt；END_REFUND：MUTUAL_END 分配；DisputeResolved | Unauthorized/StaleId/InvalidState/DeadlinePassed | AC-001-22、23 |
| `finalizeTimeout(uint64 disputeId)` | 任意地址，当前 APPEAL/VOTING，t>voteDeadline | TIMED_OUT，原额退款；无需先提交监督；DisputeResolved | StaleId/InvalidState/TooEarly | AC-001-20、21 |
| `retryPayout(address payee) returns(bool)` | 任意地址，SETTLING；payee 是固定 A/B、有待付额 | 仅重试剩余权益；成功记 PayoutSucceeded；失败记 PayoutFailed/返回false；全付转终态 | InvalidState/InvalidAddress/AlreadyDone | AC-001-09、24 |

拒绝以 Solidity custom error 实现，上述 error 名均使用无参 `error Name();`，接口错误码稳定。ERC-20 approve 在代币合约完成，spender 是本 Situation 地址，不是 Factory/后端；API 不能代用户做 approve。

### 事件、付款及历史完整性

```solidity
event SituationCreated(address indexed situation,address indexed participantA,address indexed participantB,bytes32 agreementHash);
event AgreementAccepted(address indexed participant,uint64 signedAt);
event SupervisorAccepted(address indexed supervisor);
event Deposited(address indexed participant,uint256 recovery,uint256 bond);
event Activated(uint64 activatedAt);
event EndRequested(uint64 indexed requestId,address indexed requester);
event EndWithdrawn(uint64 indexed requestId);
event CheckSent(uint64 indexed checkId,address indexed requester,uint64 deadline,uint64 claimDeadline);
event Responded(uint64 indexed checkId,uint64 respondedAt,bool late);
event CheckClosed(uint64 indexed checkId,CheckStatus status);
event DisputeOpened(uint64 indexed disputeId,uint64 indexed checkId,uint64 appealDeadline,uint64 voteDeadline);
event EvidenceRegistered(uint64 indexed disputeId,address indexed owner,uint8 index,bytes32 commitment);
event VotingStarted(uint64 indexed disputeId);
event VoteCast(uint64 indexed disputeId,address indexed supervisor,bool breach);
event ResolutionProposed(uint64 indexed disputeId,uint64 resolutionId,address proposer,ResolutionMode mode);
event DisputeResolved(uint64 indexed disputeId,DisputeStatus result);
event SettlementAllocated(TerminationReason reason,uint256 amountA,uint256 amountB,uint64 terminatedAt);
event PayoutSucceeded(address indexed payee,uint256 amount);
event PayoutFailed(address indexed payee,uint256 amount);
event SettlementCompleted(Lifecycle terminalState,uint64 completedAt);
```

`SettlementAllocated` 每个实例最多一次；累计 Deposited 是有效资金总额，额外直接转账不加入权益。计算分配并保存结果后，自动逐方尝试支付，不因一方转账失败导致另一方重付或否定裁决。选用隔离的 self-call：`executePayout(address payee) external` 只允许 `msg.sender == address(this)` 且 SETTLING；按 checks-effects-interactions 先记该方 paid 再安全转账，失败仅回滚子调用，由外层捕获并发 PayoutFailed。外层所有业务入口受重入保护，外部直接调用 self-only 方法报 Unauthorized。成功/失败事件不泄露证据原文，不记录原始代币回滚字符串。外层整笔交易本身若 Gas 不足/回滚，仍按未执行处理，不能声称状态已持久化。

所有分配默认尝试 A/B，零额跳过。支付完成的目标终态由 activatedAt 是否非零决定（ENDED/CANCELLED）；terminationReason、terminatedAt 从分配时起不可变。付款重试只能向原地址，不支持换收款人绕过代币限制。非违约结束将当前未关闭 Check 记 WITHDRAWN；和解恢复的已 CLAIMED Check 保留关联历史，只清在途指针。

## 4. 链下协议、证据与记录

### 最小后端数据

| 实体 | 字段 / 约束 |
| --- | --- |
| AgreementDraft | UUID id、A/B、agreementHash、加密 AgreementDocument、createdAt、expiresAt、可空链上 situationAddress；hash 与 A 唯一；上链后不可变；未上链 7 天清理 |
| Session / Challenge | 哈希会话令牌、钱包地址、chainId、expiresAt；challenge 绑定一次性 nonce、浏览器、domain、URI、issuedAt、expirationTime、address；登录消费 nonce 原子化 |
| Meeting | UUID id、situation、UTC 日期 YYYY-MM-DD、proposer、createdAt、confirmedBy/At；(situation,date) 唯一，重复登记返原对象或 409；确认者只能另一参与者 |
| RelationshipCheck | UUID id、situation、proposer、createdAt、confirmedBy/At；每关系至多一个未完成项；第二人确认以服务器 UTC 时刻记完成 |
| Evidence | UUID id、situation、disputeId、owner、kind(text/image)、私有内容位置、SHA-256 内容摘要、随机 salt、commitment、consentVersion=1、五人 audience、createdAt、链上 registration 位置（未登记可空） |
| Idempotency | (钱包、HTTP方法、路径、Idempotency-Key) 唯一；请求规范摘要和原响应，24h保留；同键不同体拒绝，失败重试不能重复新增业务记录 |

AgreementDocument、记录正文、附件及 evidence salt 加密存储，不放公开静态目录/公共 IPFS。附件使用随机对象名，禁止客户端指定文件路径或服务端抓取任意 URL。身份证明使用 [SIWE / ERC-4361](https://eips.ethereum.org/EIPS/eip-4361)：钱包签登录消息，服务端校验 signer、configured origin/domain/URI、Fuji chainId、一次性 nonce、发行时间及有效期。支持 EOA 签名；已有合约钱包签名按目标链 ERC-1271 校验，无法验证就拒绝，不能退化为仅比较地址。预部署/反事实账户首版不支持，不影响 Core 常规钱包范围。

nonce 至少 16 字节随机，10 分钟有效；消息内容由服务端生成，客户端不能自定域/期限。会话有效 1 小时，HttpOnly、Secure（开发 localhost 例外）、SameSite=Lax Cookie；写接口要求同源 Origin + JSON/明确允许的 multipart，防 CSRF。登出/换账号清 Cookie；后台每次请求以会话地址鉴权，不能仅依赖前端账号选择。

证据承诺：对规范化 UTF-8 文字（不额外裁剪，换行统一 LF）或去 EXIF 重编码后的图片 bytes 计算 SHA-256；`commitment = keccak256(abi.encode(chainId, situationAddress, disputeId, owner, contentSha256, salt))`，salt 为服务端 32 字节随机，随获授权内容返回以供校验。只有匹配本案 owner、链上注册值且可重算一致的材料显示“已登记”；摘要/链校验不匹配为 409，原文不可据此信任。合约仅能验证登记人、窗口和哈希唯一性，不能证明链下内容真实或实施隐私读取；真实性由监督人判断，访问权由服务端执行。

读取权限每次核对已登记 Factory、当前链上关系与案件；RPC 不可用/未同步到确认交易时返回 503，不根据过时缓存新授予权限。接受本次材料但没有 startVoting 的监督人不能读取证据。双方权限持续到删除时刻；监督人的 wasEscalated 历史事实只对对应案件开放，不给完整协议或日常记录权限。

## 5. HTTP API v1

基础路径 `/api/v1`；同源前端与 API。除 config/health、auth challenge/verify 外都要求有效 Session。拒绝未知字段；UUID/地址/数字字符串严格校验；POST 返回 201（新对象）或 200（幂等重放/确认），GET 200，DELETE 204。

成功为 `{data:...}`，失败 `{error:{code,message,requestId}}`。401 未登录，403 角色/Origin 不符，404 对象不存在或无权知道，409 状态/摘要/幂等冲突，410 已清理/明确过期，413 大小超限，415 非支持类型，422 字段非法，429 请求过多，503 链或服务依赖不可用。无关账号优先返回 404，不泄露对象是否存在；已授权对象过期可返 410。日志仅记 requestId/路由/错误码，禁止正文、签名、令牌、盐及完整附件。

所有业务 POST 需要 `Idempotency-Key`（UUID）；认证 challenge/verify 不要求此键，靠 nonce 单次消费。写入在数据库事务内校验关系状态与唯一键；同一请求重复发送返回原结果。链上写操作仅返回调用说明/待核对信息，由钱包自行执行，HTTP 成功不是链上成功。

| 路由 | 输入 | 权限 / 前置条件 | 输出及副作用 | AC |
| --- | --- | --- | --- | --- |
| GET `/health` | 无 | 公开，不暴露配置值 | `{status:"ok"}` 或 503 | AC-001-30 |
| GET `/config` | 无 | 公开，仅已部署白名单 | `{chainId,tokenAddress,tokenDecimals,factoryAddress:null或地址,walletConnectConfigured:boolean,localSessionId?:string}` | AC-001-32 |
| POST `/auth/challenge` | `{address}` | Origin 校验，限速 | `{message,expiresAt}` + 一次性浏览器 challenge Cookie | AC-001-28 |
| POST `/auth/verify` | `{message,signature}` | 同 browser challenge，签名/域/链/时效/nonce全部匹配 | `{address,expiresAt}` + Session Cookie；consume nonce | AC-001-28 |
| DELETE `/auth/session` | 无 | 同源；幂等 | 清理会话与 Cookie | AC-001-28 |
| POST `/agreements` | `{document:AgreementDocument}` | 会话=A，五地址/参数有效；首次签署前准备 | `{id,agreementHash}`；加密保存，修改时创建新版本/新摘要 | AC-001-01、13、14、17 |
| POST `/agreements/:id/link` | `{txHash}` | A；该交易成功回执来自登记 Factory，创建A/摘要/公开字段相符 | `{situationAddress,invitationPath}`；唯一绑定链上关系，不信任客户端自行声称的地址 | AC-001-01、29、30 |
| GET `/agreements/:id` | 无 | A，或链上绑定完成后的指定 B | `{document,agreementHash,situationAddress}`；用户端再重算 | AC-001-01、14、29 |
| GET `/situations` | 可选 `cursor` | 当前钱包 | `{items:[{address,role,state,agreementId}],nextCursor}`；只枚举本人参与/受邀监督关系，不含隐私正文；agreementId为A/B的协议UUID，监督人固定null | AC-001-10、30 |
| GET `/situations/:s` | 无 | A/B | `{chain:SituationView,commitment,meetingCount,relationshipConfirmedAt,nextConfirmationAt,observedBlock}` | AC-001-03、12 |
| GET `/situations/:s/supervision-invitation` | 无 | 受邀监督人 | `{participantA,participantB,supervisors,ghostWindow,recoveryAmount,bondAmount,agreementHash,rolePolicyVersion:1,acceptanceState}`；仅公开字段与职责摘要 | AC-001-13 |
| POST `/situations/:s/meetings` | `{date:"YYYY-MM-DD"}` | A/B，ACTIVE，日期合法 | Meeting；不立即计数 | AC-001-03、25 |
| POST `/situations/:s/meetings/:id/confirm` | `{}` | 另一参与者，ACTIVE | Meeting；原子确认，按见面日期月份计一次 | AC-001-25 |
| POST `/situations/:s/relationship-checks` | `{}` | A/B，ACTIVE，无当前未完成 | RelationshipCheck | AC-001-03、25 |
| POST `/situations/:s/relationship-checks/:id/confirm` | `{}` | 另一参与者，ACTIVE，当前ID | RelationshipCheck；记录服务器确认时刻，计算下次时间 | AC-001-03、25 |
| GET `/situations/:s/records` | `month=YYYY-MM` | A/B；未过保留期限 | `{meetings,relationshipChecks}`，按时间/ID排序，最多100项/页和游标 | AC-001-03、25 |
| GET `/situations/:s/disputes/:d` | 无 | A/B；或本案已进入监督阶段的监督人，未过保留期限 | `{dispute:DisputeView,check:CheckView,evidence:[授权元数据],observedBlock}`；不带其他 commitment | AC-001-06、10、20 |
| POST `/situations/:s/disputes/:d/evidence` | multipart：kind、text或file（二选一）、`consentVersion:1,shareWithCasePanel:true` | 当事人，当前 APPEAL，服务器UTC及最新链时均未过appealDeadline，数量/类型/大小合法 | `{id,commitment,owner,disputeId,normalizedPreview}`；加密存储，前端预览后钱包登记hash；尚未登记仅owner可见 | AC-001-26、29 |
| GET `/situations/:s/disputes/:d/evidence/:id` | 无 | owner 可核对自己的上传；另一方/监督人需链上已登记及相应案件权限 | `{kind,contentSha256,salt,commitment,text或contentPath}`；contentPath 是下面的鉴权路由，不是静态文件URL | AC-001-10、26、29 |
| GET `/situations/:s/disputes/:d/evidence/:id/content` | 无 | 同上，每次重新鉴权 | 解密后的图片流，固定Content-Type与nosniff；不允许公共缓存 | AC-001-10、27 |

所有私有响应 `Cache-Control: no-store`。证据元数据刷新时可用 owner 登记交易成功回执触发重新查询，但不能在 API 直接改链上登记状态。列表仅返回白名单字段。背景清理在每次服务启动及至少每小时执行，按 Spec 的到期访问拒绝/24h内物理清理规则；保留最小非敏感墓碑以返回 410 和展示链上结算，但不得留原文、私有记录或密钥材料。

## 6. 失败和恢复约定

- 链上：每个写入有已知 ID 和状态前提；未知结果先按交易哈希查回执，重读 view 再决定重试，不能自动重发资金交易。
- HTTP：只在成功验证链上对象后绑定/授权；由于暂时读不到回执而失败可重试，不提前展示签署完成。链不可用时私有读返回 503。
- 证据：数据库写入与附件保存需可恢复的暂存标记，失败不生成“已登记”；未登记暂存材料在说明窗口结束后24h内清理，owner到说明截止后只可看到失败状态，不作为已授权案件材料保留。
- 记录确认：以服务端鉴权和事务为准；链状态在数据库事务前核对，记录 `observedBlock`。若链上已结束而尚未被服务观察到，下一次同步将终止时刻之后产生的链下记录标无效，不影响任何资金或完成计数。
- 敏感数据：终止状态由链上最终记录确认；服务停止期间不能服务过期内容，恢复时先处理清理。结束页资金结果可从链上重新获得，无需保留敏感正文。

## 7. 实现与部署记录

实际 ABI 由 T005 编译生成并供前后端共享，不手写另一套不一致 ABI；共享 schema 与枚举在 T003 建立。T013 已整合HTTP实现及编译生成的ABI；首次启动或显式新建会话生成部署记录，普通重启恢复原记录，T019已部署Fuji Factory，清单见下表。

| 网络 / Chain ID | 合约名称 / 地址 | ABI 路径 | 部署交易 / 代码版本 |
| --- | --- | --- | --- |
| 本地 / 31337 | 每个会话生成Factory，重启保留，关系按需创建 | packages/shared/src/abi.ts | .local/current.json 指向本轮deployment.json |
| Fuji / 43113 | SituationFactory `0x91157cb05f702ff708fa7e7aa61ae116b64ff2f7`；关系按需创建 | packages/shared/src/abi.ts | `deployments/fuji.json`，成功交易 `0x95b53b1552fcb46d4c68ea2a640a44466eb212521b517ef9a341612874a8eff2` |

T002 仅冻结上述定义；T003–T006 分别记录实现与应用验收。破坏性接口调整必须改 policyVersion/相关 Spec 并重新部署对应合约，不能对既有已签关系悄悄修改行为。


## 演示前台适配契约（002 / T010）

此层是客户端视图契约，不替代上文真实 HTTP/合约接口：`apps/web/src/data/types.ts` 定义 `DemoState`、`DemoAction`、`SituationService`。`getSnapshot()` 返回稳定引用，`subscribe()` 订阅更新，`dispatch(action)` 异步执行并在校验成功后更新快照；失败抛出用户可见错误，不提前产生成功状态。`src/data/service.ts` 依据环境选择 Mock 或 `httpService.ts`；后者实现 health/config、SIWE Cookie 会话及关系列表/详情读取，尚未具备合约写入时必须拒绝对应动作，视图不得直接导入 fixture 或把 HTTP 200 当链上成功。

本机角色、固定时钟、预设场景、模拟入金/投票均非身份或资金凭证。后续接入真实服务须分别映射私有 HTTP 数据和链上权威状态，并为 `INVITED/FUNDING/ACTIVE/ENDING/DISPUTED/SETTLING/ENDED/CANCELLED`、签名拒绝、交易 pending/revert、部分付款失败增加视图行为。演示中的 `appeal/voting` 为展示用争议子阶段；演示结算直接生成结果，不模拟真实交易已确认。未实现的过期取消、双边争议和解、证据授权/上传不得被当作本适配层的已完成功能。


## T013 本地实现记录

- API实现：`apps/api/src/app.ts`；真实界面：`apps/web/src/live/LiveApp.tsx`；HTTP客户端：`live/api.ts`。沿用 `/api/v1`、Session Cookie、Origin校验与Idempotency-Key；钱包写入通过本地RPC和合约回执确认。
- 共享协议与编译ABI：`packages/shared/src/index.ts`、`abi.ts`（由 `contracts:build` 生成，不手写）；Solidity来源 `contracts/src/`。本地31337/TestUSDC用于集成，Fuji官方测试资产规则不变。
- 部署与私有数据：`.local/current.json` 指向本轮运行目录；目录中的deployment.json记录链、代币、Factory，数据库/加密密钥不进入前台配置或仓库。
- 附件存储实现采用SQLite加密字段而非独立文件目录；GET content路由仍每次鉴权，正文没有公开URL。该变化不改对外字段。
- 本地钱包为开发工具，仅在显式本地构建+回环站点提供，且请求前校验31337与账户；不是Core真机连接证明。接口基线的完整边界验收尚未完成，不将T013视为原32项全部通过。

本机启动的config附带随机 `localSessionId`，不含目录或密钥。客户端只在31337模式下用它隔离不同会话的待确认交易；普通重启和刷新保留哈希，显式新会话清掉旧本地链的哈希，Fuji记录不受此逻辑清理。

T017补齐行为：读取协议时重新核对持久正文摘要并执行30天保留期；不存在的争议返回404，依赖故障仍返回503；不改变已有HTTP字段。前端持久待确认记录增加可选 `situation` 地址，恢复后查询该关系而非依赖当前选中行。
