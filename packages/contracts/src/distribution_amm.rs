use alloy_primitives::{I256, U256, Address};
use alloy_sol_types::sol;
use stylus_sdk::prelude::*;
use alloc::vec::Vec;
use alloc::vec;

extern crate alloc;

use crate::interfaces::{IERC20, ILpToken};
use crate::math_core::{normal_cdf, safe_to_u256, wad_mul, wad_div, sqrt_wad};

#[inline(always)] fn wad() -> I256 { I256::try_from(1_000_000_000_000_000_000i128).unwrap() }

// Default virtual stake (in WAD) backing the owner-seeded μ/σ when no explicit
// prior_weight has been set. ~100 units of conviction: large enough that a single
// small bet can't yank the curve, small enough that real demand visibly moves it.
#[inline(always)] fn default_prior_weight() -> I256 { I256::try_from(100_000_000_000_000_000_000i128).unwrap() }

sol! {
    event CurveUpdated(uint256 indexed new_mu, uint256 indexed new_sigma);
    event LiquidityAdded(address indexed provider, uint256 amount_wad);
    event LiquidityRemoved(address indexed provider, uint256 amount_wad);
    event WinningsClaimed(address indexed user, uint256 amount_wad);
    event MarketResolved(uint256 indexed winning_id);
    event FeeDistributed(uint256 amount_wad);
    event TradesStarted();
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
        address lp_token_address;
        int256 acc_fee_per_share;
        mapping(address => int256) reward_debt;
        bool is_resolved;
        uint256 winning_token_id;
        
        bool trades_started;
        uint256 resolution_time;
        uint256 proposed_winning_id;

        mapping(uint256 => int256) token_liabilities;

        // C5: Reentrancy guard
        bool locked;

        // ── Stake-weighted curve (bettors move μ/σ, LPs do not) ──────────────
        // The curve is a stake-weighted distribution of strike prices. Every bet
        // contributes (weight = net stake, x = strike) so μ/σ track demand.
        // Liquidity deposits are pure collateral and never touch these.
        //   μ      = Σ(wᵢ·xᵢ)   / Σwᵢ
        //   E[x²]  = Σ(wᵢ·xᵢ²)  / Σwᵢ
        //   σ      = sqrt(E[x²] − μ²), floored at sigma_min
        // The owner's initial set_distribution seeds a `prior_weight` of virtual
        // stake at the declared μ/σ so the first real bet can't swing the curve
        // to a single point.
        int256 acc_stake_weight;    // Σ wᵢ           (WAD)
        int256 acc_weighted_x;      // Σ wad_mul(wᵢ, xᵢ)
        int256 acc_weighted_x_sq;   // Σ wad_mul(wᵢ, xᵢ²)
        int256 prior_weight;        // virtual stake backing the seeded μ/σ
    }
}

pub enum Error {
    VarianceTooLow,
    UsdcTransferFailed,
    Unauthorized,
    InsufficientLiquidity,
    Overflow,
    LpTokenCallFailed,
    Reentrancy,
    TradesAlreadyStarted,
    NegativeValue,
}

impl From<Error> for Vec<u8> {
    fn from(e: Error) -> Self {
        match e {
            Error::VarianceTooLow => b"VarianceTooLow".to_vec(),
            Error::UsdcTransferFailed => b"UsdcTransferFailed".to_vec(),
            Error::Unauthorized => b"Unauthorized".to_vec(),
            Error::InsufficientLiquidity => b"InsufficientLiquidity".to_vec(),
            Error::Overflow => b"Overflow".to_vec(),
            Error::LpTokenCallFailed => b"LpTokenCallFailed".to_vec(),
            Error::Reentrancy => b"Reentrancy".to_vec(),
            Error::TradesAlreadyStarted => b"TradesAlreadyStarted".to_vec(),
            Error::NegativeValue => b"NegativeValue".to_vec(),
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

    pub fn owner(&self) -> Result<Address, Vec<u8>> { Ok(self.owner.get()) }
    pub fn available_liquidity(&self) -> Result<I256, Vec<u8>> { Ok(self.available_liquidity.get()) }
    pub fn acc_fee_per_share(&self) -> Result<I256, Vec<u8>> { Ok(self.acc_fee_per_share.get()) }
    pub fn reward_debt(&self, user: Address) -> Result<I256, Vec<u8>> { Ok(self.reward_debt.getter(user).get()) }
    pub fn is_resolved(&self) -> Result<bool, Vec<u8>> { Ok(self.is_resolved.get()) }
    pub fn winning_token_id(&self) -> Result<U256, Vec<u8>> { Ok(self.winning_token_id.get()) }
    pub fn global_mu(&self) -> Result<I256, Vec<u8>> { Ok(self.global_mu.get()) }
    pub fn global_sigma(&self) -> Result<I256, Vec<u8>> { Ok(self.global_sigma.get()) }
    pub fn prior_weight(&self) -> Result<I256, Vec<u8>> { Ok(self.prior_weight.get()) }
    pub fn acc_stake_weight(&self) -> Result<I256, Vec<u8>> { Ok(self.acc_stake_weight.get()) }

    /// Owner-only, pre-trading: how much virtual stake the seeded μ/σ carries.
    /// Higher = the initial belief resists demand more; lower = bets move μ faster.
    pub fn set_prior_weight(&mut self, weight: I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        if self.trades_started.get() { return Err(Error::TradesAlreadyStarted.into()); }
        if weight <= I256::ZERO { return Err(Error::NegativeValue.into()); }
        self.prior_weight.set(weight);
        Ok(())
    }

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

    pub fn set_lp_token(&mut self, addr: Address) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.lp_token_address.set(addr);
        Ok(())
    }

    pub fn lp_token(&self) -> Result<Address, Vec<u8>> { Ok(self.lp_token_address.get()) }

    // M4: Validate sigma_min > 0
    pub fn set_sigma_min(&mut self, min: I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        if min <= I256::ZERO { return Err(Error::VarianceTooLow.into()); }
        self.sigma_min.set(min);
        Ok(())
    }

    pub fn set_distribution(&mut self, mu: I256, sigma: I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        // H2: Clear error when trades have started
        if self.trades_started.get() { return Err(Error::TradesAlreadyStarted.into()); }
        if sigma <= self.sigma_min.get() { return Err(Error::VarianceTooLow.into()); }
        self.global_mu.set(mu);
        self.global_sigma.set(sigma);

        // Seed the stake-weighted accumulators with `prior_weight` of virtual stake
        // at this μ/σ. Reconstructing μ/σ from the accumulators reproduces these
        // exactly: E[x²] = μ² + σ². Real bets then pull the curve away from here.
        let pw = if self.prior_weight.get() <= I256::ZERO { default_prior_weight() } else { self.prior_weight.get() };
        let ex2 = wad_mul(mu, mu) + wad_mul(sigma, sigma);
        self.acc_stake_weight.set(pw);
        self.acc_weighted_x.set(wad_mul(pw, mu));
        self.acc_weighted_x_sq.set(wad_mul(pw, ex2));

        self.vm().log(CurveUpdated { new_mu: safe_to_u256(mu), new_sigma: safe_to_u256(sigma) });
        Ok(())
    }

    pub fn get_price_for_x(&self, x: I256, is_yes: bool) -> Result<I256, Vec<u8>> {
        let mu = self.global_mu.get();
        let sigma = self.global_sigma.get();
        let cdf = normal_cdf(x, mu, sigma);
        if is_yes { Ok(wad() - cdf) } else { Ok(cdf) }
    }

    // NOTE: fee_amount is in WAD (1e18). The corresponding USDC (1e6) was already
    // transferred to this contract by the router before this call. The 1e12 scaling
    // difference is intentional; sweep_dust() recovers any rounding remainder.
    //
    // H1 fix reverted: MasterChef pattern requires totalShares as denominator,
    // not available_liquidity which diverges as fees accumulate and trades lock capital.
    pub fn distribute_fee(&mut self, fee_amount: U256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.router_address.get() { return Err(Error::Unauthorized.into()); }
        
        let lp_token = ILpToken::new(self.lp_token_address.get());
        let total_supply_u256 = lp_token.total_supply(self.vm(), Call::new()).map_err(|_| Error::LpTokenCallFailed)?;
        let total_shares = I256::try_from(total_supply_u256).map_err(|_| Error::Overflow)?;

        if total_shares > I256::ZERO {
            let fee_i256 = I256::try_from(fee_amount).map_err(|_| Error::Overflow)?;
            let current_acc = self.acc_fee_per_share.get();
            // MasterChef: accumulator increment = fee / totalShares
            let inc = (fee_i256 * wad()) / total_shares;
            self.acc_fee_per_share.set(current_acc + inc);
            // Track fee in available_liquidity for USDC accounting
            self.available_liquidity.set(self.available_liquidity.get() + fee_i256);
            self.vm().log(FeeDistributed { amount_wad: fee_amount });
        }
        Ok(())
    }

    // H5: Fixed WAD→USDC conversion (was missing / 1e12)
    // C5: Reentrancy guarded
    pub fn claim_fees(&mut self) -> Result<(), Vec<u8>> {
        if self.locked.get() { return Err(Error::Reentrancy.into()); }
        self.locked.set(true);
        let res = self.claim_fees_internal();
        self.locked.set(false);
        res
    }

    // Liquidity is pure collateral and does NOT move the curve — only bettors do.
    // `target_mu`/`target_sigma` are accepted for ABI back-compat but ignored: LPs
    // always provide at the current μ/σ. This is the core anti-manipulation rule —
    // capital with no position at risk can never shift the market's belief.
    // M6: Round-up USDC transfer. C5: Reentrancy guarded.
    pub fn add_liquidity(&mut self, amount_wad: U256, _target_mu: I256, _target_sigma: I256) -> Result<(), Vec<u8>> {
        if self.locked.get() { return Err(Error::Reentrancy.into()); }
        self.locked.set(true);
        let res = self.add_liquidity_internal(amount_wad);
        self.locked.set(false);
        res
    }

    // H3: Fixed solvency check
    // C5: Reentrancy guarded
    pub fn remove_liquidity(&mut self, shares_to_remove: U256) -> Result<(), Vec<u8>> {
        if self.locked.get() { return Err(Error::Reentrancy.into()); }
        self.locked.set(true);
        let res = self.remove_liquidity_internal(shares_to_remove);
        self.locked.set(false);
        res
    }

    pub fn underwrite_trade(&mut self, token_id: U256, target_x: I256, premium_wad: U256, max_liability_wad: U256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.router_address.get() { return Err(Error::Unauthorized.into()); }
        if !self.trades_started.get() {
            self.trades_started.set(true);
            self.vm().log(TradesStarted {});
        }
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

        // Stake-weighted curve update: this bet contributes (weight = net stake,
        // x = strike) so μ/σ track aggregate demand. The router already priced this
        // trade against the *pre-update* curve, so updating here is pre-update pricing.
        // Only bets reach this path — LP deposits never call underwrite_trade — which
        // is exactly why liquidity cannot move the curve.
        let weight = premium_i256;
        if weight > I256::ZERO {
            let x_sq = wad_mul(target_x, target_x);
            self.acc_stake_weight.set(self.acc_stake_weight.get() + weight);
            self.acc_weighted_x.set(self.acc_weighted_x.get() + wad_mul(weight, target_x));
            self.acc_weighted_x_sq.set(self.acc_weighted_x_sq.get() + wad_mul(weight, x_sq));
            self.recompute_curve();
        }

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

    // C5: Reentrancy guarded
    pub fn payout_winnings(&mut self, user: Address, token_id: U256, amount_wad: U256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.router_address.get() { return Err(Error::Unauthorized.into()); }
        if self.locked.get() { return Err(Error::Reentrancy.into()); }
        self.locked.set(true);
        let res = self.payout_winnings_internal(user, token_id, amount_wad);
        self.locked.set(false);
        res
    }

    /// Release collateral for a losing token position back to available_liquidity.
    /// Called by the router after verifying the position lost.
    pub fn release_collateral(&mut self, token_id: U256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.router_address.get() { return Err(Error::Unauthorized.into()); }
        
        let liability = self.token_liabilities.getter(token_id).get();
        if liability <= I256::ZERO { return Ok(()); }
        
        self.token_liabilities.setter(token_id).set(I256::ZERO);
        self.locked_collateral.set(self.locked_collateral.get() - liability);
        self.available_liquidity.set(self.available_liquidity.get() + liability);
        
        Ok(())
    }

    // M5: Capped sweep_dust
    // C5: Reentrancy guarded
    pub fn sweep_dust(&mut self) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        if self.locked.get() { return Err(Error::Reentrancy.into()); }
        self.locked.set(true);
        let res = self.sweep_dust_internal();
        self.locked.set(false);
        res
    }
}

impl DistributionAmm {
    /// Recompute μ/σ from the stake-weighted accumulators and emit CurveUpdated.
    /// Called after every bet. σ is floored at sigma_min so the CDF stays well-defined.
    fn recompute_curve(&mut self) {
        let total_weight = self.acc_stake_weight.get();
        if total_weight <= I256::ZERO { return; }

        let mu = wad_div(self.acc_weighted_x.get(), total_weight);
        let ex2 = wad_div(self.acc_weighted_x_sq.get(), total_weight);
        let variance = ex2 - wad_mul(mu, mu);

        let mut sigma = if variance > I256::ZERO { sqrt_wad(variance) } else { I256::ZERO };
        let sigma_floor = self.sigma_min.get();
        if sigma < sigma_floor { sigma = sigma_floor; }

        self.global_mu.set(mu);
        self.global_sigma.set(sigma);
        self.vm().log(CurveUpdated { new_mu: safe_to_u256(mu), new_sigma: safe_to_u256(sigma) });
    }

    // H5: Fixed — now divides by 1e12 before USDC transfer
    fn claim_fees_internal(&mut self) -> Result<(), Vec<u8>> {
        let user = self.vm().msg_sender();
        
        let lp_token = ILpToken::new(self.lp_token_address.get());
        let shares_u256 = lp_token.balance_of(self.vm(), Call::new(), user).map_err(|_| Error::LpTokenCallFailed)?;
        let shares = I256::try_from(shares_u256).map_err(|_| Error::Overflow)?;

        if shares > I256::ZERO {
            let pending = (shares * self.acc_fee_per_share.get()) / wad() - self.reward_debt.getter(user).get();
            if pending > I256::ZERO {
                self.available_liquidity.set(self.available_liquidity.get() - pending);
                let mut reward_debt = self.reward_debt.setter(user);
                reward_debt.set((shares * self.acc_fee_per_share.get()) / wad());

                // H5: Convert WAD to USDC (divide by 1e12)
                // C4: Use safe_to_u256 instead of into_raw()
                let pending_u256 = safe_to_u256(pending);
                let pending_usdc = pending_u256 / U256::from(1_000_000_000_000u128);
                
                if pending_usdc > U256::ZERO {
                    let usdc = IERC20::new(self.usdc_token.get());
                    let config = Call::new_mutating(&mut *self);
                    if !usdc.transfer(self.vm(), config, user, pending_usdc).map_err(|_| Error::UsdcTransferFailed)? {
                        return Err(Error::UsdcTransferFailed.into());
                    }
                }
            }
        }
        Ok(())
    }

    // M6: Round up USDC transfer.
    // Curve-neutral: liquidity only adds collateral + mints LP shares. μ/σ are
    // untouched here — they are driven exclusively by bettors via underwrite_trade.
    fn add_liquidity_internal(&mut self, amount_wad: U256) -> Result<(), Vec<u8>> {
        self.claim_fees_internal()?;

        let amount_i256 = I256::try_from(amount_wad).map_err(|_| Error::Overflow)?;

        self.available_liquidity.set(self.available_liquidity.get() + amount_i256);

        let user = self.vm().msg_sender();
        let lp_token = ILpToken::new(self.lp_token_address.get());
        
        let config = Call::new_mutating(&mut *self);
        lp_token.mint(self.vm(), config, user, amount_wad).map_err(|_| Error::LpTokenCallFailed)?;

        let shares_u256 = lp_token.balance_of(self.vm(), Call::new(), user).map_err(|_| Error::LpTokenCallFailed)?;
        let new_shares = I256::try_from(shares_u256).map_err(|_| Error::Overflow)?;

        let mut reward_debt = self.reward_debt.setter(user);
        reward_debt.set((new_shares * self.acc_fee_per_share.get()) / wad());

        // M6: Round UP USDC transfer to prevent depositing 0 USDC but getting LP tokens
        let amount_usdc = (amount_wad + U256::from(999_999_999_999u128)) / U256::from(1_000_000_000_000u128);
        let usdc = IERC20::new(self.usdc_token.get());
        let contract_address = self.vm().contract_address();
        
        let config = Call::new_mutating(&mut *self);
        if !usdc.transfer_from(self.vm(), config, user, contract_address, amount_usdc).map_err(|_| Error::UsdcTransferFailed)? {
            return Err(Error::UsdcTransferFailed.into());
        }

        self.vm().log(LiquidityAdded { provider: user, amount_wad });
        Ok(())
    }

    // H3: Fixed solvency check — available_liquidity - amount >= 0
    fn remove_liquidity_internal(&mut self, shares_to_remove: U256) -> Result<(), Vec<u8>> {
        self.claim_fees_internal()?;

        let shares_i256 = I256::try_from(shares_to_remove).map_err(|_| Error::Overflow)?;
        let user = self.vm().msg_sender();
        
        let amount_to_return = shares_i256;
        // H3: Proper solvency check — remaining available_liquidity must be >= 0
        // (no more arbitrary /10 threshold)
        if self.available_liquidity.get() - amount_to_return < I256::ZERO {
            return Err(Error::InsufficientLiquidity.into());
        }

        let lp_token = ILpToken::new(self.lp_token_address.get());
        let current_shares_u256 = lp_token.balance_of(self.vm(), Call::new(), user).map_err(|_| Error::LpTokenCallFailed)?;
        if current_shares_u256 < shares_to_remove {
            return Err(b"Insufficient shares".to_vec());
        }
        
        let config = Call::new_mutating(&mut *self);
        lp_token.burn(self.vm(), config, user, shares_to_remove).map_err(|_| Error::LpTokenCallFailed)?;
        
        let new_shares_u256 = lp_token.balance_of(self.vm(), Call::new(), user).map_err(|_| Error::LpTokenCallFailed)?;
        let new_shares = I256::try_from(new_shares_u256).map_err(|_| Error::Overflow)?;
        
        self.available_liquidity.set(self.available_liquidity.get() - amount_to_return);

        let mut reward_debt = self.reward_debt.setter(user);
        reward_debt.set((new_shares * self.acc_fee_per_share.get()) / wad());

        let amount_usdc = shares_to_remove / U256::from(1_000_000_000_000u128);
        let usdc = IERC20::new(self.usdc_token.get());
        
        let config = Call::new_mutating(&mut *self);
        if !usdc.transfer(self.vm(), config, user, amount_usdc).map_err(|_| Error::UsdcTransferFailed)? {
            return Err(Error::UsdcTransferFailed.into());
        }

        self.vm().log(LiquidityRemoved { provider: user, amount_wad: shares_to_remove });
        Ok(())
    }

    // Router handles resolution logic (per-threshold). AMM validates against
    // per-token liability and trusts the router (which is the only allowed caller).
    fn payout_winnings_internal(&mut self, user: Address, token_id: U256, amount_wad: U256) -> Result<(), Vec<u8>> {
        let amount_i256 = I256::try_from(amount_wad).map_err(|_| Error::Overflow)?;
        
        // Verify this token has sufficient liability to cover the payout
        let token_liability = self.token_liabilities.getter(token_id).get();
        if token_liability < amount_i256 {
            return Err(Error::InsufficientLiquidity.into());
        }
        
        // Reduce per-token liability and global locked collateral
        self.token_liabilities.setter(token_id).set(token_liability - amount_i256);
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

    // M5: Capped sweep_dust — max 10 USDC
    fn sweep_dust_internal(&mut self) -> Result<(), Vec<u8>> {
        let usdc = IERC20::new(self.usdc_token.get());
        
        let config_bal = Call::new();
        let actual_balance = usdc.balance_of(self.vm(), config_bal, self.vm().contract_address()).map_err(|_| Error::UsdcTransferFailed)?;
        
        let expected_balance_wad = self.available_liquidity.get() + self.locked_collateral.get();
        if expected_balance_wad < I256::ZERO { return Ok(()); }
        
        // C4: safe_to_u256 instead of into_raw()
        let expected_usdc = safe_to_u256(expected_balance_wad) / U256::from(1_000_000_000_000u128);
        if actual_balance > expected_usdc {
            let dust = actual_balance - expected_usdc;
            // M5: Cap sweepable dust at 10 USDC (10_000_000 units) to prevent misuse
            let max_sweep = U256::from(10_000_000u64);
            if dust > U256::from(1_000_000u64) && dust <= max_sweep {
                let config = Call::new_mutating(&mut *self);
                usdc.transfer(self.vm(), config, self.owner.get(), dust).map_err(|_| Error::UsdcTransferFailed)?;
            }
        }
        Ok(())
    }
}
