use alloy_primitives::{Address, I256, U256};
use alloy_sol_types::sol;
use stylus_sdk::prelude::*;
use alloc::vec::Vec;

extern crate alloc;

sol_interface! {
    interface IDistributionAmm {
        function tradeDistribution(int256 target_mu, int256 target_sigma) external;
        function globalMu() external view returns (int256);
        function globalSigma() external view returns (int256);
    }
}

sol! {
    event TradeExecuted(address indexed user, uint256 target_price, bool is_yes);
}

sol_storage! {
    #[entrypoint]
    pub struct BinaryRouter {
        address amm_address;
    }
}

pub enum Error {
    AmmCallFailed,
}

impl From<Error> for Vec<u8> {
    fn from(e: Error) -> Self {
        match e {
            Error::AmmCallFailed => b"AmmCallFailed".to_vec(),
        }
    }
}

#[public]
impl BinaryRouter {
    pub fn set_amm_address(&mut self, addr: Address) {
        self.amm_address.set(addr);
    }

    pub fn get_binary_odds(&self, _target_price: I256) -> Result<I256, Vec<u8>> {
        // Return 50% odds
        Ok(I256::try_from(50i128).unwrap())
    }

    pub fn buy_yes(&mut self, target_price: I256) -> Result<(), Vec<u8>> {
        // Mock buy execution
        self.vm().log(TradeExecuted {
            user: self.vm().msg_sender(),
            target_price: to_u256(target_price),
            is_yes: true,
        });
        Ok(())
    }
}

#[inline(always)]
fn to_u256(value: I256) -> U256 {
    value.into_raw()
}
