use alloy_primitives::{I256, U256, Address};
use alloy_sol_types::sol;
use stylus_sdk::prelude::*;
use alloc::vec::Vec;

extern crate alloc;

use crate::interfaces::IERC20;
use crate::math_core::gaussian_cdf;

#[inline(always)] fn wad() -> I256 { I256::try_from(1_000_000_000_000_000_000i128).unwrap() }

sol_interface! {
    interface IDistributionAmm {
        function globalMu() external view returns (int256);
        function globalSigma() external view returns (int256);
        function distributeFee(uint256 fee_amount) external;
        function payoutWinnings(address user, uint256 token_id, uint256 amount_wad) external;
        function underwriteTrade(uint256 token_id, uint256 premium_wad, uint256 max_liability_wad) external;
        function resolveMarket(uint256 winning_id) external;
    }
}

sol! {
    event TradeExecuted(address indexed user, uint256 target_price, bool is_yes);
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
}

sol_storage! {
    #[entrypoint]
    pub struct BinaryRouter {
        address owner;
        address amm_address;
        address usdc_token;
        mapping(address => mapping(uint256 => uint256)) staker_balances;
    }
}

pub enum Error {
    AmmCallFailed,
    UsdcTransferFailed,
    Unauthorized,
}

impl From<Error> for Vec<u8> {
    fn from(e: Error) -> Self {
        match e {
            Error::AmmCallFailed => b"AmmCallFailed".to_vec(),
            Error::UsdcTransferFailed => b"UsdcTransferFailed".to_vec(),
            Error::Unauthorized => b"Unauthorized".to_vec(),
        }
    }
}

#[public]
impl BinaryRouter {
    pub fn initialize(&mut self, owner: Address) -> Result<(), Vec<u8>> {
        if self.owner.get() != Address::ZERO { return Err(b"Already initialized".to_vec()); }
        self.owner.set(owner);
        Ok(())
    }

    pub fn set_amm_address(&mut self, addr: Address) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.amm_address.set(addr);
        Ok(())
    }

    pub fn set_usdc_token(&mut self, token: Address) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.usdc_token.set(token);
        Ok(())
    }

    pub fn get_balance(&self, user: Address, token_id: U256) -> Result<U256, Vec<u8>> {
        Ok(self.staker_balances.getter(user).get(token_id))
    }

    pub fn settle_by_price(&mut self, final_price: I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        let amm = IDistributionAmm::new(self.amm_address.get());
        
        let config1 = Call::new();
        let global_mu = amm.global_mu(self.vm(), config1).map_err(|_| Error::AmmCallFailed)?;
        
        let winning_id = if final_price > global_mu { U256::from(1) } else { U256::from(2) };
        
        let config2 = Call::new_mutating(&mut *self);
        amm.resolve_market(self.vm(), config2, winning_id).map_err(|_| Error::AmmCallFailed)?;
        
        Ok(())
    }

    pub fn buy_yes(&mut self, target_price: I256, amount_wad: U256) -> Result<(), Vec<u8>> {
        let amm = IDistributionAmm::new(self.amm_address.get());
        
        let config_mu = Call::new();
        let mu = amm.global_mu(self.vm(), config_mu).map_err(|_| Error::AmmCallFailed)?;
        
        let config_sigma = Call::new();
        let sigma = amm.global_sigma(self.vm(), config_sigma).map_err(|_| Error::AmmCallFailed)?;
        
        let p_no = gaussian_cdf(target_price, mu, sigma);
        let p_yes = wad() - p_no;
        
        let price_u256 = U256::from(p_yes.into_raw());
        let raw_cost_wad = (price_u256 * amount_wad) / U256::from(1_000_000_000_000_000_000u128);
        let fee_wad = raw_cost_wad / U256::from(100);
        let total_cost_wad = raw_cost_wad + fee_wad;

        let cost_usdc = (total_cost_wad + U256::from(1_000_000_000_000u64 - 1)) / U256::from(1_000_000_000_000u64);

        let usdc = IERC20::new(self.usdc_token.get());
        let user = self.vm().msg_sender();
        let contract_address = self.vm().contract_address();
        
        let config_usdc = Call::new_mutating(&mut *self);
        if !usdc.transfer_from(self.vm(), config_usdc, user, contract_address, cost_usdc).map_err(|_| Error::UsdcTransferFailed)? {
            return Err(Error::UsdcTransferFailed.into());
        }

        let yes_token_id = U256::from(1);
        
        let config_fee = Call::new_mutating(&mut *self);
        amm.distribute_fee(self.vm(), config_fee, fee_wad).map_err(|_| Error::AmmCallFailed)?;
        
        let config_trade = Call::new_mutating(&mut *self);
        amm.underwrite_trade(self.vm(), config_trade, yes_token_id, raw_cost_wad, amount_wad).map_err(|_| Error::AmmCallFailed)?;

        let mut user_balances = self.staker_balances.setter(user);
        let current = user_balances.get(yes_token_id);
        user_balances.setter(yes_token_id).set(current + amount_wad);

        self.vm().log(TradeExecuted { user, target_price: to_u256(target_price), is_yes: true });
        self.vm().log(TransferSingle { operator: user, from: Address::ZERO, to: user, id: yes_token_id, value: amount_wad });
        Ok(())
    }

    pub fn buy_no(&mut self, target_price: I256, amount_wad: U256) -> Result<(), Vec<u8>> {
        let amm = IDistributionAmm::new(self.amm_address.get());
        
        let config_mu = Call::new();
        let mu = amm.global_mu(self.vm(), config_mu).map_err(|_| Error::AmmCallFailed)?;
        
        let config_sigma = Call::new();
        let sigma = amm.global_sigma(self.vm(), config_sigma).map_err(|_| Error::AmmCallFailed)?;
        
        let p_no = gaussian_cdf(target_price, mu, sigma);
        let price_u256 = U256::from(p_no.into_raw());
        let raw_cost_wad = (price_u256 * amount_wad) / U256::from(1_000_000_000_000_000_000u128);
        let fee_wad = raw_cost_wad / U256::from(100);
        let total_cost_wad = raw_cost_wad + fee_wad;

        let cost_usdc = (total_cost_wad + U256::from(1_000_000_000_000u64 - 1)) / U256::from(1_000_000_000_000u64);

        let usdc = IERC20::new(self.usdc_token.get());
        let user = self.vm().msg_sender();
        let contract_address = self.vm().contract_address();
        
        let config_usdc = Call::new_mutating(&mut *self);
        if !usdc.transfer_from(self.vm(), config_usdc, user, contract_address, cost_usdc).map_err(|_| Error::UsdcTransferFailed)? {
            return Err(Error::UsdcTransferFailed.into());
        }

        let no_token_id = U256::from(2);
        
        let config_fee = Call::new_mutating(&mut *self);
        amm.distribute_fee(self.vm(), config_fee, fee_wad).map_err(|_| Error::AmmCallFailed)?;
        
        let config_trade = Call::new_mutating(&mut *self);
        amm.underwrite_trade(self.vm(), config_trade, no_token_id, raw_cost_wad, amount_wad).map_err(|_| Error::AmmCallFailed)?;

        let mut user_balances = self.staker_balances.setter(user);
        let current = user_balances.get(no_token_id);
        user_balances.setter(no_token_id).set(current + amount_wad);

        self.vm().log(TradeExecuted { user, target_price: to_u256(target_price), is_yes: false });
        self.vm().log(TransferSingle { operator: user, from: Address::ZERO, to: user, id: no_token_id, value: amount_wad });
        Ok(())
    }

    pub fn claim_winnings(&mut self, is_yes: bool, amount_wad: U256) -> Result<(), Vec<u8>> {
        let token_id = if is_yes { U256::from(1) } else { U256::from(2) };
        let user = self.vm().msg_sender();
        let mut user_balances = self.staker_balances.setter(user);
        let current = user_balances.get(token_id);

        if current < amount_wad { return Err(b"Insufficient balance".to_vec()); }
        user_balances.setter(token_id).set(current - amount_wad);

        self.vm().log(TransferSingle { operator: user, from: user, to: Address::ZERO, id: token_id, value: amount_wad });

        let amm = IDistributionAmm::new(self.amm_address.get());
        
        let config = Call::new_mutating(&mut *self);
        amm.payout_winnings(self.vm(), config, user, token_id, amount_wad).map_err(|_| Error::AmmCallFailed)?;

        Ok(())
    }
}

#[inline(always)] fn to_u256(value: I256) -> U256 { U256::from(value.into_raw()) }
