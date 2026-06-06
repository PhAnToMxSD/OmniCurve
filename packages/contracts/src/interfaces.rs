use alloy_sol_types::sol;
use stylus_sdk::prelude::*;

sol_interface! {
    interface IERC20 {
        function transfer(address to, uint256 amount) external returns (bool);
        function transferFrom(address from, address to, uint256 amount) external returns (bool);
        function balanceOf(address account) external view returns (uint256);
    }

    interface IProxyAmm {
        function initialize(address owner) external;
        function setUsdcToken(address token) external;
        function setSigmaMin(int256 min) external;
        function setRouterAddress(address addr) external;
        function transferOwnership(address new_owner) external;
        function acceptOwnership() external;
    }

    interface IProxyRouter {
        function initialize(address owner) external;
        function setAmmAddress(address addr) external;
        function transferOwnership(address new_owner) external;
        function acceptOwnership() external;
    }
}
