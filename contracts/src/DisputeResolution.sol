// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "./SituationVault.sol";
abstract contract DisputeResolution is SituationVault {
    function sendCheck() external nonReentrant returns (uint64 id) {
        _participant();
        _ongoing();
        if (v.currentCheckId != 0) revert InFlight();
        id = ++checkSeq;
        CheckView storage c = checks[id];
        c.id = id;
        c.status = CheckStatus.WAITING;
        c.requester = msg.sender;
        c.respondent = _other(msg.sender);
        c.sentAt = uint64(block.timestamp);
        c.deadline = c.sentAt + ghostWindow;
        c.claimDeadline = c.deadline + 7 days;
        v.currentCheckId = id;
        emit CheckSent(id, msg.sender, c.deadline, c.claimDeadline);
    }
    function respond(uint64 id) external nonReentrant {
        _currentCheck(id);
        CheckView storage c = checks[id];
        if (msg.sender != c.respondent) revert Unauthorized();
        if (v.state == Lifecycle.DISPUTED) {
            _before(disputes[v.currentDisputeId].voteDeadline);
            if (c.status != CheckStatus.CLAIMED) revert InvalidState();
        } else {
            _ongoing();
            if (c.status != CheckStatus.WAITING) revert InvalidState();
        }
        if (block.timestamp <= c.deadline) {
            if (c.respondedAt != 0) revert AlreadyDone();
            c.respondedAt = uint64(block.timestamp);
            c.status = CheckStatus.RESPONDED;
            v.currentCheckId = 0;
            emit Responded(id, c.respondedAt, false);
            emit CheckClosed(id, c.status);
        } else {
            if (c.lateRespondedAt != 0) revert AlreadyDone();
            c.lateRespondedAt = uint64(block.timestamp);
            emit Responded(id, c.lateRespondedAt, true);
        }
    }
    function withdrawCheck(uint64 id) external nonReentrant {
        _ongoing();
        _currentCheck(id);
        CheckView storage c = checks[id];
        if (msg.sender != c.requester) revert Unauthorized();
        if (c.status != CheckStatus.WAITING) revert InvalidState();
        c.status = CheckStatus.WITHDRAWN;
        v.currentCheckId = 0;
        emit CheckClosed(id, c.status);
    }
    function expireCheck(uint64 id) external nonReentrant {
        _ongoing();
        _currentCheck(id);
        CheckView storage c = checks[id];
        if (c.status != CheckStatus.WAITING) revert InvalidState();
        _after(c.claimDeadline);
        c.status = CheckStatus.EXPIRED;
        v.currentCheckId = 0;
        emit CheckClosed(id, c.status);
    }
    function openDispute(
        uint64 checkId
    ) external nonReentrant returns (uint64 id) {
        _ongoing();
        _currentCheck(checkId);
        CheckView storage c = checks[checkId];
        if (msg.sender != c.requester) revert Unauthorized();
        if (c.status != CheckStatus.WAITING || c.respondedAt != 0)
            revert InvalidState();
        _after(c.deadline);
        _before(c.claimDeadline);
        id = ++disputeSeq;
        DisputeView storage d = disputes[id];
        d.id = id;
        d.checkId = checkId;
        d.status = DisputeStatus.APPEAL;
        d.claimant = c.requester;
        d.respondent = c.respondent;
        d.openedAt = uint64(block.timestamp);
        d.appealDeadline = d.openedAt + 48 hours;
        d.voteDeadline = d.appealDeadline + 72 hours;
        c.status = CheckStatus.CLAIMED;
        c.disputeId = id;
        v.currentDisputeId = id;
        v.state = Lifecycle.DISPUTED;
        v.endRequestId = 0;
        v.endRequester = address(0);
        emit DisputeOpened(id, checkId, d.appealDeadline, d.voteDeadline);
    }
    function registerEvidence(
        uint64 id,
        bytes32 commitment
    ) external nonReentrant {
        uint256 i = _participant();
        _currentDispute(id);
        DisputeView storage d = disputes[id];
        if (d.status != DisputeStatus.APPEAL) revert InvalidState();
        _before(d.appealDeadline);
        if (commitment == bytes32(0) || evidenceUsed[commitment])
            revert InvalidEvidence();
        if (d.evidenceCounts[i] >= 10) revert EvidenceLimit();
        uint8 index = d.evidenceCounts[i]++;
        evidenceUsed[commitment] = true;
        evidence[id][msg.sender].push(commitment);
        emit EvidenceRegistered(id, msg.sender, index, commitment);
    }
    function startVoting(uint64 id) external nonReentrant {
        _participant();
        _currentDispute(id);
        DisputeView storage d = disputes[id];
        if (d.status != DisputeStatus.APPEAL) revert InvalidState();
        _after(d.appealDeadline);
        _before(d.voteDeadline);
        d.status = DisputeStatus.VOTING;
        d.wasEscalated = true;
        emit VotingStarted(id);
    }
    function vote(uint64 id, bool breach) external nonReentrant {
        uint256 i = _supervisor();
        _currentDispute(id);
        DisputeView storage d = disputes[id];
        if (d.status != DisputeStatus.VOTING) revert InvalidState();
        _before(d.voteDeadline);
        if (!v.supervisorsAccepted[i]) revert Unauthorized();
        if (d.votes[i] != 0) revert AlreadyDone();
        d.votes[i] = breach ? 1 : 2;
        if (breach) d.yesCount++;
        else d.noCount++;
        emit VoteCast(id, msg.sender, breach);
        if (d.yesCount == 2) {
            d.status = DisputeStatus.UPHELD;
            emit DisputeResolved(id, d.status);
            _allocate(
                d.respondent == participantA
                    ? TerminationReason.BREACH_A
                    : TerminationReason.BREACH_B
            );
        } else if (d.noCount == 2) {
            d.status = DisputeStatus.REJECTED;
            emit DisputeResolved(id, d.status);
            _allocate(TerminationReason.REJECTED);
        }
    }
    function proposeResolution(
        uint64 id,
        ResolutionMode mode
    ) external nonReentrant returns (uint64 requestId) {
        _participant();
        _currentDispute(id);
        DisputeView storage d = disputes[id];
        _before(d.voteDeadline);
        requestId = ++resolutionSeq;
        d.resolutionId = requestId;
        d.resolutionProposer = msg.sender;
        d.resolutionMode = mode;
        emit ResolutionProposed(id, requestId, msg.sender, mode);
    }
    function confirmResolution(
        uint64 id,
        uint64 requestId
    ) external nonReentrant {
        _participant();
        _currentDispute(id);
        DisputeView storage d = disputes[id];
        _before(d.voteDeadline);
        if (requestId == 0 || requestId != d.resolutionId) revert StaleId();
        if (msg.sender == d.resolutionProposer) revert Unauthorized();
        if (d.resolutionMode == ResolutionMode.RESUME) {
            d.status = DisputeStatus.RESUMED;
            v.state = Lifecycle.ACTIVE;
            v.currentCheckId = 0;
            v.currentDisputeId = 0;
            emit DisputeResolved(id, d.status);
        } else {
            d.status = DisputeStatus.MUTUAL_END;
            emit DisputeResolved(id, d.status);
            _allocate(TerminationReason.MUTUAL_END);
        }
    }
    function finalizeTimeout(uint64 id) external nonReentrant {
        _currentDispute(id);
        DisputeView storage d = disputes[id];
        _after(d.voteDeadline);
        d.status = DisputeStatus.TIMED_OUT;
        emit DisputeResolved(id, d.status);
        _allocate(TerminationReason.TIMED_OUT);
    }
}
