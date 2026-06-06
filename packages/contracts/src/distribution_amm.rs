use alloy_primitives::{I256, U256, Address};
use alloy_sol_types::sol;
use stylus_sdk::prelude::*;
use alloc::vec::Vec;

extern crate alloc;

use crate::interfaces::IERC20;
use crate::math_core::gaussian_cdf;

#[inline(always)] fn wad() -> I256 { I256::try_from(1_000_000_000_000_000_000i128).unwrap() }

sol! {
    event CurveUpdated(uint256 indexed new_mu, uint256 indexed new_sigma);
    event LiquidityAdded(address indexed provider, uint256 amount_wad);
    event LiquidityRemoved(address indexed provider, uint256 amount_wad);
    event WinningsClaimed(address indexed user, uint256 amount_wad);
}

sol_storage! {
    #[entrypoint]
    pub struct DistributionAmm {
        address owner;
        int256 global_mu;
        int256 global_sigma;
        int256 sigma_min;
        int256 available_liquidity;
        int256 locked_collateral;
        address usdc_token;
        int256 acc_fee_per_share;
        int256 total_shares;
        mapping(address => int256) shares;
        mapping(address => int256) reward_debt;
        bool is_resolved;
        uint256 winning_token_id;
        
        mapping(uint256 => int256) token_liabilities;
    }
}

pub enum Error {
    VarianceTooLow,
    UsdcTransferFailed,
    Unauthorized,
    InsufficientLiquidity,
}

impl From<Error> for Vec<u8> {
    fn from(e: Error) -> Self {
        match e {
            Error::VarianceTooLow => b"VarianceTooLow".to_vec(),
            Error::UsdcTransferFailed => b"UsdcTransferFailed".to_vec(),
            Error::Unauthorized => b"Unauthorized".to_vec(),
            Error::InsufficientLiquidity => b"InsufficientLiquidity".to_vec(),
        }
    }
}

#[public]
impl DistributionAmm {
    pub fn initialize(&mut self, owner: Address) -> Result<(), Vec<u8>> {
        if self.owner.get() != Address::ZERO { return Err(b"Already initialized".to_vec()); }
        self.owner.set(owner);
        Ok(())
    }

    pub fn global_mu(&self) -> Result<I256, Vec<u8>> { Ok(self.global_mu.get()) }
    pub fn global_sigma(&self) -> Result<I256, Vec<u8>> { Ok(self.global_sigma.get()) }

    pub fn set_usdc_token(&mut self, token: Address) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.usdc_token.set(token);
        Ok(())
    }

    pub fn set_sigma_min(&mut self, min: I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.sigma_min.set(min);
        Ok(())
    }

    pub fn set_distribution(&mut self, mu: I256, sigma: I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        if sigma <= self.sigma_min.get() { return Err(Error::VarianceTooLow.into()); }
        self.global_mu.set(mu);
        self.global_sigma.set(sigma);
        self.vm().log(CurveUpdated { new_mu: to_u256(mu), new_sigma: to_u256(sigma) });
        Ok(())
    }

    pub fn get_price_for_x(&self, x: I256, is_yes: bool) -> Result<I256, Vec<u8>> {
        let mu = self.global_mu.get();
        let sigma = self.global_sigma.get();
        let cdf = gaussian_cdf(x, mu, sigma);
        if is_yes { Ok(wad() - cdf) } else { Ok(cdf) }
    }

    pub fn distribute_fee(&mut self, fee_amount: U256) -> Result<(), Vec<u8>> {
        let total_shares = self.total_shares.get();
        if total_shares > I256::ZERO {
            let fee_i256 = I256::from_raw(fee_amount.into());
            let current_acc = self.acc_fee_per_share.get();
            let inc = (fee_i256 * wad()) / total_shares;
            self.acc_fee_per_share.set(current_acc + inc);
            self.available_liquidity.set(self.available_liquidity.get() + fee_i256);
        }
        Ok(())
    }

    pub fn claim_fees(&mut self) -> Result<(), Vec<u8>> {
        let user = self.vm().msg_sender();
        let shares = self.shares.getter(user).get();
        if shares > I256::ZERO {
            let pending = (shares * self.acc_fee_per_share.get()) / wad() - self.reward_debt.getter(user).get();
            if pending > I256::ZERO {
                self.available_liquidity.set(self.available_liquidity.get() - pending);
                let mut reward_debt = self.reward_debt.setter(user);
                let current_rd = reward_debt.get();
                reward_debt.set(current_rd + pending);

                let pending_usdc = U256::from(pending.into_raw());
                let usdc = IERC20::new(self.usdc_token.get());
                
                let config = Call::new_mutating(&mut *self);
                if !usdc.transfer(self.vm(), config, user, pending_usdc).map_err(|_| Error::UsdcTransferFailed)? {
                    return Err(Error::UsdcTransferFailed.into());
                }
            }
        }
        Ok(())
    }

    pub fn add_liquidity(&mut self, amount_wad: U256, target_mu: I256, target_sigma: I256) -> Result<(), Vec<u8>> {
        if target_sigma <= self.sigma_min.get() { return Err(Error::VarianceTooLow.into()); }

        let _ = self.claim_fees();

        let amount_i256 = I256::from_raw(amount_wad.into());
        
        let old_liquidity = self.available_liquidity.get();
        if old_liquidity > I256::ZERO {
            let w_old = (old_liquidity * wad()) / (old_liquidity + amount_i256);
            let w_new = wad() - w_old;
            
            let old_mu = self.global_mu.get();
            let new_mu = (old_mu * w_old) / wad() + (target_mu * w_new) / wad();
            self.global_mu.set(new_mu);
            
            let old_sigma = self.global_sigma.get();
            let new_sigma = (old_sigma * w_old) / wad() + (target_sigma * w_new) / wad();
            self.global_sigma.set(new_sigma);
        } else {
            self.global_mu.set(target_mu);
            self.global_sigma.set(target_sigma);
        }

        self.available_liquidity.set(self.available_liquidity.get() + amount_i256);
        self.total_shares.set(self.total_shares.get() + amount_i256);

        let user = self.vm().msg_sender();
        let mut shares = self.shares.setter(user);
        let current_shares = shares.get();
        shares.set(current_shares + amount_i256);

        let mut reward_debt = self.reward_debt.setter(user);
        reward_debt.set((shares.get() * self.acc_fee_per_share.get()) / wad());

        let amount_usdc = amount_wad / U256::from(1_000_000_000_000u128);
        let usdc = IERC20::new(self.usdc_token.get());
        let contract_address = self.vm().contract_address();
        
        let config = Call::new_mutating(&mut *self);
        if !usdc.transfer_from(self.vm(), config, user, contract_address, amount_usdc).map_err(|_| Error::UsdcTransferFailed)? {
            return Err(Error::UsdcTransferFailed.into());
        }

        self.vm().log(LiquidityAdded { provider: user, amount_wad });
        Ok(())
    }

    pub fn remove_liquidity(&mut self, shares_to_remove: U256) -> Result<(), Vec<u8>> {
        let _ = self.claim_fees();

        let shares_i256 = I256::from_raw(shares_to_remove.into());
        let user = self.vm().msg_sender();
        let mut shares = self.shares.setter(user);
        
        if shares.get() < shares_i256 {
            return Err(b"Insufficient shares".to_vec());
        }

        let current_shares = shares.get();
        shares.set(current_shares - shares_i256);
        self.total_shares.set(self.total_shares.get() - shares_i256);
        
        let amount_to_return = shares_i256;
        if self.available_liquidity.get() < amount_to_return {
            return Err(Error::InsufficientLiquidity.into());
        }
        self.available_liquidity.set(self.available_liquidity.get() - amount_to_return);

        let mut reward_debt = self.reward_debt.setter(user);
        reward_debt.set((shares.get() * self.acc_fee_per_share.get()) / wad());

        let amount_usdc = shares_to_remove / U256::from(1_000_000_000_000u128);
        let usdc = IERC20::new(self.usdc_token.get());
        
        let config = Call::new_mutating(&mut *self);
        if !usdc.transfer(self.vm(), config, user, amount_usdc).map_err(|_| Error::UsdcTransferFailed)? {
            return Err(Error::UsdcTransferFailed.into());
        }

        self.vm().log(LiquidityRemoved { provider: user, amount_wad: shares_to_remove });
        Ok(())
    }

    pub fn underwrite_trade(&mut self, token_id: U256, premium_wad: U256, max_liability_wad: U256) -> Result<(), Vec<u8>> {
        let premium_i256 = I256::from_raw(premium_wad.into());
        let liability_i256 = I256::from_raw(max_liability_wad.into());
        
        self.available_liquidity.set(self.available_liquidity.get() + premium_i256);
        
        if self.available_liquidity.get() < liability_i256 {
            return Err(Error::InsufficientLiquidity.into());
        }
        
        self.available_liquidity.set(self.available_liquidity.get() - liability_i256);
        self.locked_collateral.set(self.locked_collateral.get() + liability_i256);
        
        let mut tl = self.token_liabilities.setter(token_id);
        let current_tl = tl.get();
        tl.set(current_tl + liability_i256);
        
        Ok(())
    }

    pub fn resolve_market(&mut self, winning_id: U256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        if self.is_resolved.get() { return Err(b"Already resolved".to_vec()); }

        self.is_resolved.set(true);
        self.winning_token_id.set(winning_id);

        let total_locked = self.locked_collateral.get();
        let winning_liability = self.token_liabilities.getter(winning_id).get();
        
        let release = total_locked - winning_liability;
        self.available_liquidity.set(self.available_liquidity.get() + release);
        self.locked_collateral.set(winning_liability);

        Ok(())
    }

    pub fn payout_winnings(&mut self, user: Address, token_id: U256, amount_wad: U256) -> Result<(), Vec<u8>> {
        if !self.is_resolved.get() { return Err(b"Market not resolved".to_vec()); }
        if token_id != self.winning_token_id.get() { return Err(b"Token did not win".to_vec()); }

        let amount_i256 = I256::from_raw(amount_wad.into());
        if self.locked_collateral.get() < amount_i256 {
            return Err(Error::InsufficientLiquidity.into());
        }

        self.locked_collateral.set(self.locked_collateral.get() - amount_i256);

        let amount_usdc = amount_wad / U256::from(1_000_000_000_000u128);
        let usdc = IERC20::new(self.usdc_token.get());
        
        let config = Call::new_mutating(&mut *self);
        if !usdc.transfer(self.vm(), config, user, amount_usdc).map_err(|_| Error::UsdcTransferFailed)? {
            return Err(Error::UsdcTransferFailed.into());
        }

        self.vm().log(WinningsClaimed { user, amount_wad });
        Ok(())
    }
}

#[inline(always)]
fn to_u256(value: I256) -> U256 { U256::from(value.into_raw()) }
