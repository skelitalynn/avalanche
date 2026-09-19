// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function decimals() external view returns (uint8);
}
struct CreateParams {
    address participantB;
    address[3] supervisors;
    uint256 recoveryAmount;
    uint256 bondAmount;
    uint32 ghostWindow;
    bytes32 agreementHash;
}
enum Lifecycle {
    INVITED,
    FUNDING,
    ACTIVE,
    ENDING,
    DISPUTED,
    SETTLING,
    ENDED,
    CANCELLED
}
enum CheckStatus {
    NONE,
    WAITING,
    RESPONDED,
    WITHDRAWN,
    EXPIRED,
    CLAIMED
}
enum DisputeStatus {
    NONE,
    APPEAL,
    VOTING,
    UPHELD,
    REJECTED,
    TIMED_OUT,
    RESUMED,
    MUTUAL_END
}
enum ResolutionMode {
    RESUME,
    END_REFUND
}
enum TerminationReason {
    NONE,
    CANCELLED_BY_PARTICIPANT,
    INVITE_EXPIRED,
    FUNDING_EXPIRED,
    MUTUAL_END,
    BREACH_A,
    BREACH_B,
    REJECTED,
    TIMED_OUT
}
struct SituationView {
    Lifecycle state;
    uint64 createdAt;
    uint64 invitationDeadline;
    uint64 signedAtB;
    uint64 fundingDeadline;
    uint64 activatedAt;
    uint64 terminatedAt;
    uint64 settlementCompletedAt;
    bool[3] supervisorsAccepted;
    bool[2] funded;
    uint64 currentCheckId;
    uint64 currentDisputeId;
    uint64 endRequestId;
    address endRequester;
    TerminationReason terminationReason;
    uint256[2] entitlement;
    uint256[2] paid;
}
struct CheckView {
    uint64 id;
    CheckStatus status;
    address requester;
    address respondent;
    uint64 sentAt;
    uint64 deadline;
    uint64 claimDeadline;
    uint64 respondedAt;
    uint64 lateRespondedAt;
    uint64 disputeId;
}
struct DisputeView {
    uint64 id;
    uint64 checkId;
    DisputeStatus status;
    address claimant;
    address respondent;
    uint64 openedAt;
    uint64 appealDeadline;
    uint64 voteDeadline;
    uint8 yesCount;
    uint8 noCount;
    uint8[3] votes;
    uint8[2] evidenceCounts;
    bool wasEscalated;
    uint64 resolutionId;
    address resolutionProposer;
    ResolutionMode resolutionMode;
}
abstract contract SituationState {
    error Unauthorized();
    error InvalidState();
    error DeadlinePassed();
    error TooEarly();
    error HashMismatch();
    error AlreadyDone();
    error InvalidAddress();
    error InvalidTerms();
    error DuplicateAgreement();
    error SupervisorsNotReady();
    error TokenTransferFailed();
    error StaleId();
    error InFlight();
    error InvalidEvidence();
    error EvidenceLimit();
    error NotFound();
    error ReentrantCall();
    event AgreementAccepted(address indexed participant, uint64 signedAt);
    event SupervisorAccepted(address indexed supervisor);
    event Deposited(
        address indexed participant,
        uint256 recovery,
        uint256 bond
    );
    event Activated(uint64 activatedAt);
    event EndRequested(uint64 indexed requestId, address indexed requester);
    event EndWithdrawn(uint64 indexed requestId);
    event CheckSent(
        uint64 indexed checkId,
        address indexed requester,
        uint64 deadline,
        uint64 claimDeadline
    );
    event Responded(uint64 indexed checkId, uint64 respondedAt, bool late);
    event CheckClosed(uint64 indexed checkId, CheckStatus status);
    event DisputeOpened(
        uint64 indexed disputeId,
        uint64 indexed checkId,
        uint64 appealDeadline,
        uint64 voteDeadline
    );
    event EvidenceRegistered(
        uint64 indexed disputeId,
        address indexed owner,
        uint8 index,
        bytes32 commitment
    );
    event VotingStarted(uint64 indexed disputeId);
    event VoteCast(
        uint64 indexed disputeId,
        address indexed supervisor,
        bool breach
    );
    event ResolutionProposed(
        uint64 indexed disputeId,
        uint64 resolutionId,
        address proposer,
        ResolutionMode mode
    );
    event DisputeResolved(uint64 indexed disputeId, DisputeStatus result);
    event SettlementAllocated(
        TerminationReason reason,
        uint256 amountA,
        uint256 amountB,
        uint64 terminatedAt
    );
    event PayoutSucceeded(address indexed payee, uint256 amount);
    event PayoutFailed(address indexed payee, uint256 amount);
    event SettlementCompleted(Lifecycle terminalState, uint64 completedAt);

    address public immutable factory;
    address public immutable token;
    address public immutable participantA;
    address public immutable participantB;
    bytes32 public immutable agreementHash;
    uint256 public immutable recoveryAmount;
    uint256 public immutable bondAmount;
    uint32 public immutable ghostWindow;
    address[3] private panel;
    SituationView internal v;
    mapping(uint64 => CheckView) internal checks;
    mapping(uint64 => DisputeView) internal disputes;
    mapping(uint64 => mapping(address => bytes32[])) internal evidence;
    mapping(bytes32 => bool) internal evidenceUsed;
    uint64 internal checkSeq;
    uint64 internal disputeSeq;
    uint64 internal endSeq;
    uint64 internal resolutionSeq;
    uint256 private entered = 1;
    modifier nonReentrant() {
        if (entered != 1) revert ReentrantCall();
        entered = 2;
        _;
        entered = 1;
    }
    constructor(address asset, address a, CreateParams memory p) {
        factory = msg.sender;
        token = asset;
        participantA = a;
        participantB = p.participantB;
        panel = p.supervisors;
        agreementHash = p.agreementHash;
        recoveryAmount = p.recoveryAmount;
        bondAmount = p.bondAmount;
        ghostWindow = p.ghostWindow;
        v.createdAt = uint64(block.timestamp);
        v.invitationDeadline = uint64(block.timestamp + 7 days);
    }
    function snapshot() external view returns (SituationView memory) {
        return v;
    }
    function supervisors(uint256 index) public view returns (address) {
        if (index >= 3) revert NotFound();
        return panel[index];
    }
    function getCheck(uint64 id) external view returns (CheckView memory) {
        if (id == 0 || id > checkSeq) revert NotFound();
        return checks[id];
    }
    function getDispute(uint64 id) external view returns (DisputeView memory) {
        if (id == 0 || id > disputeSeq) revert NotFound();
        return disputes[id];
    }
    function getEvidence(
        uint64 id,
        address owner,
        uint8 index
    ) external view returns (bytes32) {
        if (index >= evidence[id][owner].length) revert NotFound();
        return evidence[id][owner][index];
    }
    function _participant() internal view returns (uint256) {
        if (msg.sender == participantA) return 0;
        if (msg.sender == participantB) return 1;
        revert Unauthorized();
    }
    function _other(address who) internal view returns (address) {
        return who == participantA ? participantB : participantA;
    }
    function _supervisor() internal view returns (uint256) {
        for (uint256 i; i < 3; i++) if (panel[i] == msg.sender) return i;
        revert Unauthorized();
    }
    function _state(Lifecycle required) internal view {
        if (v.state != required) revert InvalidState();
    }
    function _ongoing() internal view {
        if (v.state != Lifecycle.ACTIVE && v.state != Lifecycle.ENDING)
            revert InvalidState();
    }
    function _before(uint64 end) internal view {
        if (block.timestamp > end) revert DeadlinePassed();
    }
    function _after(uint64 end) internal view {
        if (block.timestamp <= end) revert TooEarly();
    }
    function _currentCheck(uint64 id) internal view {
        if (id == 0 || id != v.currentCheckId) revert StaleId();
    }
    function _currentDispute(uint64 id) internal view {
        _state(Lifecycle.DISPUTED);
        if (id == 0 || id != v.currentDisputeId) revert StaleId();
    }
    function _transfer(bytes memory callData) internal {
        (bool ok, bytes memory result) = token.call(callData);
        if (
            !ok ||
            (result.length != 0 &&
                (result.length != 32 || !abi.decode(result, (bool))))
        ) revert TokenTransferFailed();
    }
}
