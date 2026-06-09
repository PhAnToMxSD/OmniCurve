extern crate alloc;

use alloy_primitives::{I256, U256, Address, FixedBytes};
use alloy_sol_types::sol;
use stylus_sdk::prelude::*;
use alloc::vec;
use alloc::vec::Vec;

use crate::interfaces::IERC20;
use crate::math_core::{normal_cdf, safe_to_u256};

#[inline(always)] fn wad() -> I256 { I256::try_from(1_000_000_000_000_000_000i128).unwrap() }

sol_interface! {
    interface IDistributionAmm {
        function globalMu() external view returns (int256);
        function globalSigma() external view returns (int256);
        function distributeFee(uint256 fee_amount) external;
        function payoutWinnings(address user, uint256 token_id, uint256 amount_wad) external;
        function underwriteTrade(uint256 token_id, int256 target_x, uint256 premium_wad, uint256 max_liability_wad) external;
        function releaseCollateral(uint256 token_id) external;
    }
}

sol! {
    event TradeExecuted(address indexed user, uint256 token_id, int256 target_price, bool is_yes, uint256 tokens_minted);
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event MarketResolved(int256 final_price);
    event WinningsClaimed(address indexed user, uint256 token_id, uint256 amount);
    event URI(string value, uint256 indexed id);
}

sol_storage! {
    #[entrypoint]
    pub struct BinaryRouter {
        address owner;
        address pending_owner;
        address amm_address;
        address usdc_token;
        bool locked;

        // H4+M1: Per-threshold token accounting
        // token_id = keccak256(market_id, target_x, is_yes)
        mapping(address => mapping(uint256 => uint256)) staker_balances;

        // Market identity — set by factory at initialization
        uint256 market_id;

        // H6: Market resolution — pull-based claiming
        int256 final_price;
        bool market_resolved;

        // M1: ERC-1155 operator approvals
        mapping(address => mapping(address => bool)) operator_approvals;

        // Track total supply per token_id for ERC-1155
        mapping(uint256 => uint256) token_supplies;
    }
}

pub enum Error {
    AmmCallFailed,
    UsdcTransferFailed,
    Unauthorized,
    Reentrancy,
    NotResolved,
    NotWinner,
    NoTokens,
    InsufficientBalance,
    ZeroAmount,
    TransferToZero,
}

impl From<Error> for Vec<u8> {
    fn from(e: Error) -> Self {
        match e {
            Error::AmmCallFailed => b"AmmCallFailed".to_vec(),
            Error::UsdcTransferFailed => b"UsdcTransferFailed".to_vec(),
            Error::Unauthorized => b"Unauthorized".to_vec(),
            Error::Reentrancy => b"Reentrancy".to_vec(),
            Error::NotResolved => b"MarketNotResolved".to_vec(),
            Error::NotWinner => b"PositionDidNotWin".to_vec(),
            Error::NoTokens => b"NoWinningTokens".to_vec(),
            Error::InsufficientBalance => b"InsufficientBalance".to_vec(),
            Error::ZeroAmount => b"ZeroAmount".to_vec(),
            Error::TransferToZero => b"TransferToZeroAddress".to_vec(),
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

    /// Set the market ID — called by factory during creation.
    pub fn set_market_id(&mut self, id: U256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        self.market_id.set(id);
        Ok(())
    }

    pub fn get_market_id(&self) -> Result<U256, Vec<u8>> {
        Ok(self.market_id.get())
    }

    pub fn get_amm_address(&self) -> Result<Address, Vec<u8>> {
        Ok(self.amm_address.get())
    }

    // ─── ERC-1155 Interface ────────────────────────────────────────────

    /// ERC-1155: Get balance of a specific token for an account
    pub fn balance_of(&self, account: Address, id: U256) -> Result<U256, Vec<u8>> {
        Ok(self.staker_balances.getter(account).get(id))
    }

    /// ERC-1155: Get balances of multiple (account, id) pairs
    pub fn balance_of_batch(&self, accounts: Vec<Address>, ids: Vec<U256>) -> Result<Vec<U256>, Vec<u8>> {
        if accounts.len() != ids.len() { return Err(b"Length mismatch".to_vec()); }
        let mut results = Vec::with_capacity(accounts.len());
        for i in 0..accounts.len() {
            results.push(self.staker_balances.getter(accounts[i]).get(ids[i]));
        }
        Ok(results)
    }

    /// ERC-1155: Set approval for an operator to manage all of caller's tokens
    pub fn set_approval_for_all(&mut self, operator: Address, approved: bool) -> Result<(), Vec<u8>> {
        let caller = self.vm().msg_sender();
        if caller == operator { return Err(b"Self approval".to_vec()); }
        self.operator_approvals.setter(caller).setter(operator).set(approved);
        self.vm().log(ApprovalForAll { account: caller, operator, approved });
        Ok(())
    }

    /// ERC-1155: Check if operator is approved for all of owner's tokens
    pub fn is_approved_for_all(&self, account: Address, operator: Address) -> Result<bool, Vec<u8>> {
        Ok(self.operator_approvals.getter(account).get(operator))
    }

    /// ERC-1155: Transfer tokens from one address to another
    pub fn safe_transfer_from(
        &mut self,
        from: Address,
        to: Address,
        id: U256,
        amount: U256,
        _data: Vec<u8>,
    ) -> Result<(), Vec<u8>> {
        if to == Address::ZERO { return Err(Error::TransferToZero.into()); }
        let caller = self.vm().msg_sender();
        if caller != from && !self.operator_approvals.getter(from).get(caller) {
            return Err(Error::Unauthorized.into());
        }

        let from_balance = self.staker_balances.getter(from).get(id);
        if from_balance < amount { return Err(Error::InsufficientBalance.into()); }

        self.staker_balances.setter(from).setter(id).set(from_balance - amount);
        let to_balance = self.staker_balances.getter(to).get(id);
        self.staker_balances.setter(to).setter(id).set(to_balance + amount);

        self.vm().log(TransferSingle { operator: caller, from, to, id, value: amount });
        Ok(())
    }

    /// ERC-1155: supportsInterface — returns true for ERC-1155 (0xd9b67a26) and ERC-165 (0x01ffc9a7)
    pub fn supports_interface(&self, interface_id: FixedBytes<4>) -> Result<bool, Vec<u8>> {
        let erc1155_id: [u8; 4] = [0xd9, 0xb6, 0x7a, 0x26];
        let erc165_id: [u8; 4] = [0x01, 0xff, 0xc9, 0xa7];
        let id_bytes: [u8; 4] = interface_id.into();
        Ok(id_bytes == erc1155_id || id_bytes == erc165_id)
    }

    // ─── Trading Functions ─────────────────────────────────────────────

    /// C3: User inputs USDC stake amount (6 decimals). Platform computes tokens.
    /// C2: Fee is 1% of stake_amount.
    /// H4+M1: Token ID is keccak256(market_id, target_x, is_yes).
    pub fn buy_yes(&mut self, target_price: I256, stake_usdc: U256) -> Result<(), Vec<u8>> {
        if stake_usdc == U256::ZERO { return Err(Error::ZeroAmount.into()); }
        if self.locked.get() { return Err(Error::Reentrancy.into()); }
        self.locked.set(true);
        let res = self.buy_internal(target_price, stake_usdc, true);
        self.locked.set(false);
        res
    }

    /// C3: User inputs USDC stake amount (6 decimals). Platform computes tokens.
    pub fn buy_no(&mut self, target_price: I256, stake_usdc: U256) -> Result<(), Vec<u8>> {
        if stake_usdc == U256::ZERO { return Err(Error::ZeroAmount.into()); }
        if self.locked.get() { return Err(Error::Reentrancy.into()); }
        self.locked.set(true);
        let res = self.buy_internal(target_price, stake_usdc, false);
        self.locked.set(false);
        res
    }

    // ─── Settlement (H6 — pull-based) ──────────────────────────────────

    /// Owner sets the final price when the market closes.
    /// No on-chain resolution — users claim individually via claim_winnings.
    pub fn set_final_price(&mut self, price: I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }
        if self.market_resolved.get() { return Err(b"Already resolved".to_vec()); }
        self.final_price.set(price);
        self.market_resolved.set(true);
        self.vm().log(MarketResolved { final_price: price });
        Ok(())
    }

    /// H4: Pull-based claim_winnings. User specifies their target_x and direction.
    /// The contract checks if their position won, recreates their token_id,
    /// burns the tokens, and pays 1 USDC per token.
    pub fn claim_winnings(&mut self, target_x: I256, is_yes: bool) -> Result<(), Vec<u8>> {
        if self.locked.get() { return Err(Error::Reentrancy.into()); }
        self.locked.set(true);
        let res = self.claim_winnings_internal(target_x, is_yes);
        self.locked.set(false);
        res
    }

    /// Query: is a position resolved and is the market resolved
    pub fn is_market_resolved(&self) -> Result<bool, Vec<u8>> {
        Ok(self.market_resolved.get())
    }

    pub fn get_final_price(&self) -> Result<I256, Vec<u8>> {
        Ok(self.final_price.get())
    }

    /// Permissionless: release collateral locked for a losing position.
    /// Anyone can call this after resolution to free LP capital.
    pub fn release_losing_collateral(&mut self, target_x: I256, is_yes: bool) -> Result<(), Vec<u8>> {
        if !self.market_resolved.get() { return Err(Error::NotResolved.into()); }
        let final_price = self.final_price.get();
        
        let is_winner = if is_yes { final_price >= target_x } else { final_price < target_x };
        if is_winner { return Err(b"Position is winning".to_vec()); }
        
        let token_id = self.derive_token_id(target_x, is_yes);
        
        let amm = IDistributionAmm::new(self.amm_address.get());
        let config = Call::new_mutating(&mut *self);
        amm.release_collateral(self.vm(), config, token_id).map_err(|_| Error::AmmCallFailed)?;
        
        Ok(())
    }

    /// Helper: compute the token_id for a given target and direction
    pub fn compute_token_id(&self, target_x: I256, is_yes: bool) -> Result<U256, Vec<u8>> {
        Ok(self.derive_token_id(target_x, is_yes))
    }
}

impl BinaryRouter {
    /// Derive a unique ERC-1155 token_id from (market_id, target_x, is_yes)
    /// using keccak256 hash.
    fn derive_token_id(&self, target_x: I256, is_yes: bool) -> U256 {
        let market_id = self.market_id.get();
        // Pack: market_id (32 bytes) + target_x (32 bytes) + is_yes (1 byte)
        let mut data = [0u8; 65];
        let market_bytes: [u8; 32] = market_id.to_be_bytes();
        data[0..32].copy_from_slice(&market_bytes);
        let target_bytes: [u8; 32] = U256::from(target_x.into_raw()).to_be_bytes();
        data[32..64].copy_from_slice(&target_bytes);
        data[64] = if is_yes { 1 } else { 0 };
        
        let hash = stylus_sdk::crypto::keccak(data);
        U256::from_be_bytes(hash.0)
    }

    /// Unified buy logic for both YES and NO.
    /// C3: User inputs stake_usdc (USDC 6-decimal amount).
    /// C2: 1% fee on stake amount. Tokens = net_stake / price.
    fn buy_internal(&mut self, target_price: I256, stake_usdc: U256, is_yes: bool) -> Result<(), Vec<u8>> {
        let amm = IDistributionAmm::new(self.amm_address.get());
        
        let config_mu = Call::new();
        let mu = amm.global_mu(self.vm(), config_mu).map_err(|_| Error::AmmCallFailed)?;
        
        let config_sigma = Call::new();
        let sigma = amm.global_sigma(self.vm(), config_sigma).map_err(|_| Error::AmmCallFailed)?;
        
        // Compute price from CDF
        let p_no = normal_cdf(target_price, mu, sigma);
        let price = if is_yes { wad() - p_no } else { p_no };
        
        // C4: safe conversion — price should always be in [0, WAD]
        let price_u256 = safe_to_u256(price);
        
        // Require price > 0 to avoid division by zero
        if price_u256 == U256::ZERO { return Err(b"Price is zero".to_vec()); }
        
        // C3: Convert USDC input (6 decimals) to WAD (18 decimals)
        let stake_wad = stake_usdc * U256::from(1_000_000_000_000u128);
        
        // C2: Fee = 1% of stake
        let fee_wad = stake_wad / U256::from(100u64);
        let net_stake_wad = stake_wad - fee_wad;
        
        // Tokens minted = net_stake / price
        // Both are in WAD, so: tokens = net_stake * WAD / price
        let tokens_minted_wad = (net_stake_wad * U256::from(1_000_000_000_000_000_000u128)) / price_u256;
        
        if tokens_minted_wad == U256::ZERO { return Err(b"Zero tokens".to_vec()); }
        
        // Transfer the full stake_usdc from user to AMM
        let usdc = IERC20::new(self.usdc_token.get());
        let user = self.vm().msg_sender();
        
        let config_usdc = Call::new_mutating(&mut *self);
        if !usdc.transfer_from(self.vm(), config_usdc, user, self.amm_address.get(), stake_usdc).map_err(|_| Error::UsdcTransferFailed)? {
            return Err(Error::UsdcTransferFailed.into());
        }

        // H4+M1: Derive unique token_id from (market_id, target_x, is_yes)
        let token_id = self.derive_token_id(target_price, is_yes);
        
        // Distribute fee to LPs
        let config_fee = Call::new_mutating(&mut *self);
        amm.distribute_fee(self.vm(), config_fee, fee_wad).map_err(|_| Error::AmmCallFailed)?;
        
        // Underwrite the trade: premium = net_stake, liability = tokens_minted.
        // target_price (the strike) is passed so the AMM can fold this bet into the
        // stake-weighted curve (weight = net_stake, x = strike). Pricing above used
        // the pre-update μ/σ; the curve shifts only after the trade is underwritten.
        let config_trade = Call::new_mutating(&mut *self);
        amm.underwrite_trade(self.vm(), config_trade, token_id, target_price, net_stake_wad, tokens_minted_wad).map_err(|_| Error::AmmCallFailed)?;

        // Mint tokens to user
        let mut user_balances = self.staker_balances.setter(user);
        let current = user_balances.get(token_id);
        user_balances.setter(token_id).set(current + tokens_minted_wad);

        // Update token supply
        let current_supply = self.token_supplies.getter(token_id).get();
        self.token_supplies.setter(token_id).set(current_supply + tokens_minted_wad);

        // Events
        self.vm().log(TradeExecuted { user, token_id, target_price, is_yes, tokens_minted: tokens_minted_wad });
        self.vm().log(TransferSingle { operator: user, from: Address::ZERO, to: user, id: token_id, value: tokens_minted_wad });
        
        Ok(())
    }

    /// H4: Pull-based claiming. Each user claims for their specific (target_x, direction).
    fn claim_winnings_internal(&mut self, target_x: I256, is_yes: bool) -> Result<(), Vec<u8>> {
        // 1. Ensure market is resolved
        if !self.market_resolved.get() { return Err(Error::NotResolved.into()); }
        let final_price = self.final_price.get();

        // 2. Check if this specific position won
        let is_winner = if is_yes {
            final_price >= target_x
        } else {
            final_price < target_x
        };
        if !is_winner { return Err(Error::NotWinner.into()); }

        // 3. Recreate their specific token_id
        let token_id = self.derive_token_id(target_x, is_yes);
        let user = self.vm().msg_sender();
        let user_balance = self.staker_balances.getter(user).get(token_id);
        if user_balance == U256::ZERO { return Err(Error::NoTokens.into()); }

        // 4. Burn tokens
        self.staker_balances.setter(user).setter(token_id).set(U256::ZERO);
        let current_supply = self.token_supplies.getter(token_id).get();
        self.token_supplies.setter(token_id).set(current_supply - user_balance);

        self.vm().log(TransferSingle { operator: user, from: user, to: Address::ZERO, id: token_id, value: user_balance });

        // 5. Pay 1 USDC per token (convert WAD to USDC 6 decimals)
        let payout_usdc = user_balance / U256::from(1_000_000_000_000u128);
        
        if payout_usdc > U256::ZERO {
            // Pay from AMM via payout_winnings
            let amm = IDistributionAmm::new(self.amm_address.get());
            let config = Call::new_mutating(&mut *self);
            amm.payout_winnings(self.vm(), config, user, token_id, user_balance).map_err(|_| Error::AmmCallFailed)?;
        }

        self.vm().log(WinningsClaimed { user, token_id, amount: user_balance });
        Ok(())
    }
}
