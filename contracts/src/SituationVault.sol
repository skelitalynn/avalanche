// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "./SituationState.sol";
abstract contract SituationVault is SituationState {
    function deposit() external nonReentrant {
        uint256 i = _participant();
        _state(Lifecycle.FUNDING);
        _before(v.fundingDeadline);
        if (v.funded[i]) revert AlreadyDone();
        if (
            !v.supervisorsAccepted[0] ||
            !v.supervisorsAccepted[1] ||
            !v.supervisorsAccepted[2]
        ) revert SupervisorsNotReady();
        uint256 total = recoveryAmount + bondAmount;
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        v.funded[i] = true;
        _transfer(
            abi.encodeCall(
                IERC20.transferFrom,
                (msg.sender, address(this), total)
            )
        );
        if (IERC20(token).balanceOf(address(this)) != beforeBalance + total)
            revert TokenTransferFailed();
        emit Deposited(msg.sender, recoveryAmount, bondAmount);
        if (v.funded[0] && v.funded[1]) {
            v.state = Lifecycle.ACTIVE;
            v.activatedAt = uint64(block.timestamp);
            emit Activated(v.activatedAt);
        }
    }
    function _allocate(TerminationReason reason) internal {
        if (
            v.state == Lifecycle.SETTLING ||
            v.state == Lifecycle.ENDED ||
            v.state == Lifecycle.CANCELLED
        ) revert InvalidState();
        uint256 total = recoveryAmount + bondAmount;
        v.entitlement = [v.funded[0] ? total : 0, v.funded[1] ? total : 0];
        if (reason == TerminationReason.BREACH_A) {
            v.entitlement[0] = recoveryAmount;
            v.entitlement[1] = recoveryAmount + 2 * bondAmount;
        }
        if (reason == TerminationReason.BREACH_B) {
            v.entitlement[1] = recoveryAmount;
            v.entitlement[0] = recoveryAmount + 2 * bondAmount;
        }
        v.state = Lifecycle.SETTLING;
        v.terminationReason = reason;
        v.terminatedAt = uint64(block.timestamp);
        v.endRequestId = 0;
        v.endRequester = address(0);
        if (
            v.currentCheckId != 0 &&
            checks[v.currentCheckId].status == CheckStatus.WAITING
        ) {
            checks[v.currentCheckId].status = CheckStatus.WITHDRAWN;
            emit CheckClosed(v.currentCheckId, CheckStatus.WITHDRAWN);
            v.currentCheckId = 0;
        }
        emit SettlementAllocated(
            reason,
            v.entitlement[0],
            v.entitlement[1],
            v.terminatedAt
        );
        _attempt(participantA, 0);
        _attempt(participantB, 1);
        _complete();
    }
    function executePayout(address payee) external {
        if (msg.sender != address(this)) revert Unauthorized();
        _state(Lifecycle.SETTLING);
        uint256 i;
        if (payee == participantA) i = 0;
        else if (payee == participantB) i = 1;
        else revert InvalidAddress();
        uint256 amount = v.entitlement[i] - v.paid[i];
        if (amount == 0) revert AlreadyDone();
        v.paid[i] += amount;
        uint256 beforeBalance = IERC20(token).balanceOf(payee);
        _transfer(abi.encodeCall(IERC20.transfer, (payee, amount)));
        if (IERC20(token).balanceOf(payee) != beforeBalance + amount)
            revert TokenTransferFailed();
    }
    function _attempt(address payee, uint256 i) internal returns (bool) {
        uint256 amount = v.entitlement[i] - v.paid[i];
        if (amount == 0) return true;
        try this.executePayout(payee) {
            emit PayoutSucceeded(payee, amount);
            return true;
        } catch {
            emit PayoutFailed(payee, amount);
            return false;
        }
    }
    function _complete() internal {
        if (v.paid[0] == v.entitlement[0] && v.paid[1] == v.entitlement[1]) {
            v.state =
                v.activatedAt == 0 ? Lifecycle.CANCELLED : Lifecycle.ENDED;
            v.settlementCompletedAt = uint64(block.timestamp);
            emit SettlementCompleted(v.state, v.settlementCompletedAt);
        }
    }
    function retryPayout(address payee) external nonReentrant returns (bool) {
        _state(Lifecycle.SETTLING);
        uint256 i;
        if (payee == participantA) i = 0;
        else if (payee == participantB) i = 1;
        else revert InvalidAddress();
        if (v.paid[i] == v.entitlement[i]) revert AlreadyDone();
        bool result = _attempt(payee, i);
        _complete();
        return result;
    }
}
