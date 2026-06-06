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
    event MarketResolved(uint256 indexed winning_id);
    event FeeDistributed(uint256 amount_wad);
}

sol_storage! {
    #[entrypoint]
    pub struct DistributionAmm {
        address owner;
        address pending_owner;
        int256 global_mu;
        int256 global_sigma;
        int256 sigma_min;
        int256 available_liquidity;
        int256 locked_collateral;
        address usdc_token;
        address router_address;
        int256 acc_fee_per_share;
        int256 total_shares;
        mapping(address => int256) shares;
        mapping(address => int256) reward_debt;
        bool is_resolved;
        uint256 winning_token_id;
        
        bool trades_started;
        uint256 resolution_time;
        uint256 proposed_winning_id;

        mapping(uint256 => int256) token_liabilities;
    }
}

pub enum Error {
    VarianceTooLow,
    UsdcTransferFailed,
    Unauthorized,
    InsufficientLiquidity,
    Overflow,
}

impl From<Error> for Vec<u8> {
    fn from(e: Error) -> Self {
        match e {
            Error::VarianceTooLow => b"VarianceTooLow".to_vec(),
            Error::UsdcTransferFailed => b"UsdcTransferFailed".to_vec(),
            Error::Unauthorized => b"Unauthorized".to_vec(),
            Error::InsufficientLiquidity => b"InsufficientLiquidity".to_vec(),
            Error::Overflow => b"Overflow".to_vec(),
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

    pub fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.pending_owner.set(new_owner);
        Ok(())
    }

    pub fn accept_ownership(&mut self) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.pending_owner.get() { return Err(Error::Unauthorized.into()); }
        self.owner.set(self.pending_owner.get());
        self.pending_owner.set(Address::ZERO);
        Ok(())
    }

    pub fn global_mu(&self) -> Result<I256, Vec<u8>> { Ok(self.global_mu.get()) }
    pub fn global_sigma(&self) -> Result<I256, Vec<u8>> { Ok(self.global_sigma.get()) }

    pub fn set_usdc_token(&mut self, token: Address) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.usdc_token.set(token);
        Ok(())
    }

    pub fn set_router_address(&mut self, addr: Address) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.router_address.set(addr);
        Ok(())
    }

    pub fn set_sigma_min(&mut self, min: I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.sigma_min.set(min);
        Ok(())
    }

    pub fn set_distribution(&mut self, mu: I256, sigma: I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        if self.trades_started.get() { return Err(Error::Unauthorized.into()); }
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
        if self.vm().msg_sender() != self.router_address.get() { return Err(Error::Unauthorized.into()); }
        let total_shares = self.total_shares.get();
        if total_shares > I256::ZERO {
            let fee_i256 = I256::try_from(fee_amount).map_err(|_| Error::Overflow)?;
            let current_acc = self.acc_fee_per_share.get();
            let inc = (fee_i256 * wad()) / total_shares;
            self.acc_fee_per_share.set(current_acc + inc);
            self.available_liquidity.set(self.available_liquidity.get() + fee_i256);
            self.vm().log(FeeDistributed { amount_wad: fee_amount });
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
                reward_debt.set((shares * self.acc_fee_per_share.get()) / wad());

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

        let amount_i256 = I256::try_from(amount_wad).map_err(|_| Error::Overflow)?;
        
        let old_liquidity = self.available_liquidity.get();
        if !self.trades_started.get() {
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
        }

        self.available_liquidity.set(self.available_liquidity.get() + amount_i256);
        self.total_shares.set(self.total_shares.get() + amount_i256);

        let user = self.vm().msg_sender();
        let mut shares = self.shares.setter(user);
        let current_shares = shares.get();
        let new_shares = current_shares + amount_i256;
        shares.set(new_shares);

        let mut reward_debt = self.reward_debt.setter(user);
        reward_debt.set((new_shares * self.acc_fee_per_share.get()) / wad());

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

        let shares_i256 = I256::try_from(shares_to_remove).map_err(|_| Error::Overflow)?;
        let user = self.vm().msg_sender();
        let mut shares = self.shares.setter(user);
        
        if shares.get() < shares_i256 {
            return Err(b"Insufficient shares".to_vec());
        }

        let amount_to_return = shares_i256;
        let required_solvency = self.locked_collateral.get() / I256::try_from(10).map_err(|_| Error::Overflow)?;
        if self.available_liquidity.get() - amount_to_return < required_solvency {
            return Err(Error::InsufficientLiquidity.into());
        }

        let current_shares = shares.get();
        shares.set(current_shares - shares_i256);
        self.total_shares.set(self.total_shares.get() - shares_i256);
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
        if self.vm().msg_sender() != self.router_address.get() { return Err(Error::Unauthorized.into()); }
        self.trades_started.set(true);
        let premium_i256 = I256::try_from(premium_wad).map_err(|_| Error::Overflow)?;
        let liability_i256 = I256::try_from(max_liability_wad).map_err(|_| Error::Overflow)?;
        
        let pre_liquidity = self.available_liquidity.get();
        if pre_liquidity < liability_i256 {
            return Err(Error::InsufficientLiquidity.into());
        }
        
        self.available_liquidity.set(pre_liquidity + premium_i256 - liability_i256);
        self.locked_collateral.set(self.locked_collateral.get() + liability_i256);
        
        let mut tl = self.token_liabilities.setter(token_id);
        let current_tl = tl.get();
        tl.set(current_tl + liability_i256);
        
        Ok(())
    }

    pub fn propose_resolution(&mut self, winning_id: U256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.router_address.get() { return Err(Error::Unauthorized.into()); }
        if self.is_resolved.get() { return Err(b"Already resolved".to_vec()); }
        if self.resolution_time.get() > U256::ZERO { return Err(b"Already proposed".to_vec()); }

        self.proposed_winning_id.set(winning_id);
        self.resolution_time.set(U256::from(self.vm().block_timestamp() + 86400));
        Ok(())
    }

    pub fn cancel_resolution(&mut self) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        if self.is_resolved.get() { return Err(b"Already finalised".to_vec()); }
        self.resolution_time.set(U256::ZERO);
        self.proposed_winning_id.set(U256::ZERO);
        Ok(())
    }

    pub fn execute_resolution(&mut self) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        if self.is_resolved.get() { return Err(b"Already resolved".to_vec()); }
        let res_time = self.resolution_time.get();
        if res_time == U256::ZERO || U256::from(self.vm().block_timestamp()) < res_time { 
            return Err(b"Time-lock active".to_vec()); 
        }

        self.is_resolved.set(true);
        let winning_id = self.proposed_winning_id.get();
        self.winning_token_id.set(winning_id);

        let total_locked = self.locked_collateral.get();
        let winning_liability = self.token_liabilities.getter(winning_id).get();
        
        let release = total_locked - winning_liability;
        self.available_liquidity.set(self.available_liquidity.get() + release);
        self.locked_collateral.set(winning_liability);

        self.vm().log(MarketResolved { winning_id });

        Ok(())
    }

    pub fn payout_winnings(&mut self, user: Address, token_id: U256, amount_wad: U256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.router_address.get() { return Err(Error::Unauthorized.into()); }
        if !self.is_resolved.get() { return Err(b"Market not resolved".to_vec()); }
        if token_id != self.winning_token_id.get() { return Err(b"Token did not win".to_vec()); }

        let amount_i256 = I256::try_from(amount_wad).map_err(|_| Error::Overflow)?;
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

    pub fn sweep_dust(&mut self) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        let usdc = IERC20::new(self.usdc_token.get());
        
        let config_bal = Call::new();
        let actual_balance = usdc.balance_of(self.vm(), config_bal, self.vm().contract_address()).map_err(|_| Error::UsdcTransferFailed)?;
        
        let expected_balance_wad = self.available_liquidity.get() + self.locked_collateral.get();
        if expected_balance_wad < I256::ZERO { return Ok(()); }
        
        let expected_usdc = U256::from(expected_balance_wad.into_raw()) / U256::from(1_000_000_000_000u128);
        if actual_balance > expected_usdc {
            let dust = actual_balance - expected_usdc;
            if dust > U256::from(1_000_000) {
                let config = Call::new_mutating(&mut *self);
                usdc.transfer(self.vm(), config, self.owner.get(), dust).map_err(|_| Error::UsdcTransferFailed)?;
            }
        }
        Ok(())
    }
}

#[inline(always)]
fn to_u256(value: I256) -> U256 { U256::from(value.into_raw()) }
