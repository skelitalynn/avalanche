// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
// Local EVM ONLY. Deployment script forbids this asset on Fuji.
contract TestUSDC {
    string public constant name = "Local Test USDC";
    string public constant symbol = "testUSDC";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocked;
    uint256 public fee;
    address public callbackTarget;
    bytes public callbackData;
    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
    }
    function setBlocked(address to, bool value) external {
        blocked[to] = value;
    }
    function setFee(uint256 value) external {
        fee = value;
    }
    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }
    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }
    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool) {
        require(allowance[from][msg.sender] >= value, "allowance");
        allowance[from][msg.sender] -= value;
        _move(from, to, value);
        return true;
    }
    function _move(address from, address to, uint256 value) internal {
        require(!blocked[to], "blocked");
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        balanceOf[to] += value - fee;
        if (callbackTarget != address(0)) {
            (bool ok, ) = callbackTarget.call(callbackData);
            require(!ok, "reentry succeeded");
        }
    }
}
