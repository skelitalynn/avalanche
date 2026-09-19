// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "./SituationAgreement.sol";
contract SituationFactory {
    error InvalidAddress();
    error InvalidTerms();
    error DuplicateAgreement();
    address public immutable token;
    mapping(address => bool) public isSituation;
    mapping(address => mapping(bytes32 => address)) public situationOf;
    event SituationCreated(
        address indexed situation,
        address indexed participantA,
        address indexed participantB,
        bytes32 agreementHash
    );
    constructor(address asset) {
        if (asset.code.length == 0) revert InvalidAddress();
        if (IERC20(asset).decimals() != 6) revert InvalidTerms();
        token = asset;
    }
    function createSituation(
        CreateParams calldata p
    ) external returns (address instance) {
        address[5] memory people = [
            msg.sender,
            p.participantB,
            p.supervisors[0],
            p.supervisors[1],
            p.supervisors[2]
        ];
        for (uint256 i; i < 5; i++) {
            if (people[i] == address(0)) revert InvalidAddress();
            for (uint256 j; j < i; j++)
                if (people[i] == people[j]) revert InvalidAddress();
        }
        if (
            p.recoveryAmount < 10000 ||
            p.recoveryAmount > 1e9 ||
            p.bondAmount < 10000 ||
            p.bondAmount > 1e9 ||
            p.ghostWindow < 1 days ||
            p.ghostWindow > 30 days ||
            p.ghostWindow % 1 days != 0 ||
            p.agreementHash == bytes32(0)
        ) revert InvalidTerms();
        if (situationOf[msg.sender][p.agreementHash] != address(0))
            revert DuplicateAgreement();
        instance = address(new SituationAgreement(token, msg.sender, p));
        isSituation[instance] = true;
        situationOf[msg.sender][p.agreementHash] = instance;
        emit SituationCreated(
            instance,
            msg.sender,
            p.participantB,
            p.agreementHash
        );
    }
}
