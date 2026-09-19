// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "./DisputeResolution.sol";
contract SituationAgreement is DisputeResolution {
    constructor(
        address asset,
        address a,
        CreateParams memory p
    ) SituationState(asset, a, p) {}
    function acceptAgreement(bytes32 expectedHash) external nonReentrant {
        if (msg.sender != participantB) revert Unauthorized();
        _state(Lifecycle.INVITED);
        _before(v.invitationDeadline);
        if (expectedHash != agreementHash) revert HashMismatch();
        v.state = Lifecycle.FUNDING;
        v.signedAtB = uint64(block.timestamp);
        v.fundingDeadline = uint64(block.timestamp + 7 days);
        emit AgreementAccepted(msg.sender, v.signedAtB);
    }
    function acceptSupervision(bytes32 expectedHash) external nonReentrant {
        uint256 i = _supervisor();
        if (v.state != Lifecycle.INVITED && v.state != Lifecycle.FUNDING)
            revert InvalidState();
        _before(
            v.state == Lifecycle.INVITED
                ? v.invitationDeadline
                : v.fundingDeadline
        );
        if (expectedHash != agreementHash) revert HashMismatch();
        if (v.supervisorsAccepted[i]) revert AlreadyDone();
        v.supervisorsAccepted[i] = true;
        emit SupervisorAccepted(msg.sender);
    }
    function cancel() external nonReentrant {
        _participant();
        if (v.state != Lifecycle.INVITED && v.state != Lifecycle.FUNDING)
            revert InvalidState();
        _allocate(TerminationReason.CANCELLED_BY_PARTICIPANT);
    }
    function expire() external nonReentrant {
        if (v.state != Lifecycle.INVITED && v.state != Lifecycle.FUNDING)
            revert InvalidState();
        _after(
            v.state == Lifecycle.INVITED
                ? v.invitationDeadline
                : v.fundingDeadline
        );
        _allocate(
            v.state == Lifecycle.INVITED
                ? TerminationReason.INVITE_EXPIRED
                : TerminationReason.FUNDING_EXPIRED
        );
    }
    function requestEnd() external nonReentrant returns (uint64 id) {
        _participant();
        _state(Lifecycle.ACTIVE);
        id = ++endSeq;
        v.endRequestId = id;
        v.endRequester = msg.sender;
        v.state = Lifecycle.ENDING;
        emit EndRequested(id, msg.sender);
    }
    function withdrawEnd(uint64 id) external nonReentrant {
        _state(Lifecycle.ENDING);
        if (id == 0 || id != v.endRequestId) revert StaleId();
        if (msg.sender != v.endRequester) revert Unauthorized();
        v.state = Lifecycle.ACTIVE;
        v.endRequestId = 0;
        v.endRequester = address(0);
        emit EndWithdrawn(id);
    }
    function confirmEnd(uint64 id) external nonReentrant {
        _participant();
        _state(Lifecycle.ENDING);
        if (id == 0 || id != v.endRequestId) revert StaleId();
        if (msg.sender == v.endRequester) revert Unauthorized();
        _allocate(TerminationReason.MUTUAL_END);
    }
}
