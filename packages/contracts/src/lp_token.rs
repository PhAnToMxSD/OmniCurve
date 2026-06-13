extern crate alloc;

use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;
use stylus_sdk::prelude::*;

sol! {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

sol_storage! {
    #[entrypoint]
    pub struct LpToken {
        address owner;
        address pending_owner;
        string name;
        string symbol;
        uint256 total_supply;
        mapping(address => uint256) balances;
        mapping(address => mapping(address => uint256)) allowances;
    }
}

pub enum Error {
    Unauthorized,
    InsufficientBalance,
    InsufficientAllowance,
    Overflow,
}

impl From<Error> for Vec<u8> {
    fn from(err: Error) -> Vec<u8> {
        match err {
            Error::Unauthorized => b"Unauthorized".to_vec(),
            Error::InsufficientBalance => b"InsufficientBalance".to_vec(),
            Error::InsufficientAllowance => b"InsufficientAllowance".to_vec(),
            Error::Overflow => b"Overflow".to_vec(),
        }
    }
}

#[public]
impl LpToken {
    pub fn initialize(&mut self, owner: Address, name: String, symbol: String) -> Result<(), Vec<u8>> {
        if self.owner.get() != Address::ZERO {
            return Err(Error::Unauthorized.into());
        }
        self.owner.set(owner);
        self.name.set_str(&name);
        self.symbol.set_str(&symbol);
        Ok(())
    }

    pub fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), Vec<u8>> {
        if self.owner.get() != self.vm().msg_sender() {
            return Err(Error::Unauthorized.into());
        }
        self.pending_owner.set(new_owner);
        Ok(())
    }

    pub fn accept_ownership(&mut self) -> Result<(), Vec<u8>> {
        if self.pending_owner.get() != self.vm().msg_sender() {
            return Err(Error::Unauthorized.into());
        }
        self.owner.set(self.pending_owner.get());
        self.pending_owner.set(Address::ZERO);
        Ok(())
    }

    pub fn name(&self) -> Result<String, Vec<u8>> {
        Ok(self.name.get_string())
    }

    pub fn symbol(&self) -> Result<String, Vec<u8>> {
        Ok(self.symbol.get_string())
    }

    pub fn decimals(&self) -> Result<u8, Vec<u8>> {
        Ok(18)
    }

    pub fn total_supply(&self) -> Result<U256, Vec<u8>> {
        Ok(self.total_supply.get())
    }

    pub fn balance_of(&self, account: Address) -> Result<U256, Vec<u8>> {
        Ok(self.balances.getter(account).get())
    }

    pub fn allowance(&self, owner: Address, spender: Address) -> Result<U256, Vec<u8>> {
        Ok(self.allowances.getter(owner).getter(spender).get())
    }

    pub fn transfer(&mut self, _to: Address, _amount: U256) -> Result<bool, Vec<u8>> {
        Err(Error::Unauthorized.into())
    }

    pub fn approve(&mut self, spender: Address, amount: U256) -> Result<bool, Vec<u8>> {
        let owner = self.vm().msg_sender();
        self.allowances.setter(owner).setter(spender).set(amount);
        self.vm().log(Approval { owner, spender, value: amount });
        Ok(true)
    }

    pub fn transfer_from(&mut self, _from: Address, _to: Address, _amount: U256) -> Result<bool, Vec<u8>> {
        Err(Error::Unauthorized.into())
    }

    pub fn mint(&mut self, to: Address, amount: U256) -> Result<(), Vec<u8>> {
        if self.owner.get() != self.vm().msg_sender() {
            return Err(Error::Unauthorized.into());
        }
        let current_supply = self.total_supply.get();
        let new_supply = current_supply.checked_add(amount).ok_or(Error::Overflow)?;
        self.total_supply.set(new_supply);

        let mut balance_slot = self.balances.setter(to);
        let new_balance = balance_slot.get().checked_add(amount).ok_or(Error::Overflow)?;
        balance_slot.set(new_balance);

        self.vm().log(Transfer { from: Address::ZERO, to, value: amount });
        Ok(())
    }

    pub fn burn(&mut self, from: Address, amount: U256) -> Result<(), Vec<u8>> {
        if self.owner.get() != self.vm().msg_sender() {
            return Err(Error::Unauthorized.into());
        }
        let current_supply = self.total_supply.get();
        if current_supply < amount {
            return Err(Error::InsufficientBalance.into());
        }
        self.total_supply.set(current_supply - amount);

        let mut balance_slot = self.balances.setter(from);
        let current_balance = balance_slot.get();
        if current_balance < amount {
            return Err(Error::InsufficientBalance.into());
        }
        balance_slot.set(current_balance - amount);

        self.vm().log(Transfer { from, to: Address::ZERO, value: amount });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use stylus_sdk::testing::*;

    fn addr(n: u8) -> Address { Address::from([n; 20]) }

    /// Build an initialized token owned by `owner`. The caller during init is set
    /// to `owner` so subsequent owner-gated calls can reuse the same sender.
    fn setup(vm: &TestVM, owner: Address) -> LpToken {
        let mut token = LpToken::from(vm);
        vm.set_sender(owner);
        token.initialize(owner, String::from("OmniCurve LP"), String::from("OCLP")).unwrap();
        token
    }

    // ── Initialization ────────────────────────────────────────────────

    #[test]
    fn initialize_sets_metadata_and_owner() {
        let vm = TestVM::default();
        let owner = addr(1);
        let token = setup(&vm, owner);
        assert_eq!(token.name().unwrap(), "OmniCurve LP");
        assert_eq!(token.symbol().unwrap(), "OCLP");
        assert_eq!(token.decimals().unwrap(), 18);
        assert_eq!(token.total_supply().unwrap(), U256::ZERO);
    }

    #[test]
    fn initialize_twice_reverts() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        let err = token
            .initialize(addr(2), String::from("x"), String::from("y"))
            .unwrap_err();
        assert_eq!(err, b"Unauthorized".to_vec());
    }

    // ── Two-step ownership transfer ───────────────────────────────────

    #[test]
    fn ownership_transfer_is_two_step() {
        let vm = TestVM::default();
        let owner = addr(1);
        let new_owner = addr(2);
        let mut token = setup(&vm, owner);

        // Step 1: current owner proposes.
        vm.set_sender(owner);
        token.transfer_ownership(new_owner).unwrap();

        // Until accepted, the old owner still controls minting.
        vm.set_sender(owner);
        token.mint(owner, U256::from(1u8)).unwrap();

        // Step 2: pending owner accepts.
        vm.set_sender(new_owner);
        token.accept_ownership().unwrap();

        // Now the new owner can mint and the old one cannot.
        vm.set_sender(new_owner);
        token.mint(new_owner, U256::from(1u8)).unwrap();
        vm.set_sender(owner);
        assert_eq!(token.mint(owner, U256::from(1u8)).unwrap_err(), b"Unauthorized".to_vec());
    }

    #[test]
    fn transfer_ownership_only_owner() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        vm.set_sender(addr(9));
        assert_eq!(token.transfer_ownership(addr(9)).unwrap_err(), b"Unauthorized".to_vec());
    }

    #[test]
    fn accept_ownership_only_pending() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        vm.set_sender(owner);
        token.transfer_ownership(addr(2)).unwrap();
        // A non-pending address cannot accept.
        vm.set_sender(addr(3));
        assert_eq!(token.accept_ownership().unwrap_err(), b"Unauthorized".to_vec());
    }

    // ── Mint / burn (owner-gated) ─────────────────────────────────────

    #[test]
    fn mint_updates_supply_and_balance() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        let user = addr(5);
        vm.set_sender(owner);
        token.mint(user, U256::from(1000u64)).unwrap();
        assert_eq!(token.total_supply().unwrap(), U256::from(1000u64));
        assert_eq!(token.balance_of(user).unwrap(), U256::from(1000u64));
    }

    #[test]
    fn mint_only_owner() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        vm.set_sender(addr(7));
        assert_eq!(token.mint(addr(7), U256::from(1u8)).unwrap_err(), b"Unauthorized".to_vec());
    }

    #[test]
    fn mint_overflow_reverts() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        let user = addr(5);
        vm.set_sender(owner);
        token.mint(user, U256::MAX).unwrap();
        // A second mint of any nonzero amount overflows total_supply.
        assert_eq!(token.mint(user, U256::from(1u8)).unwrap_err(), b"Overflow".to_vec());
    }

    #[test]
    fn burn_updates_supply_and_balance() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        let user = addr(5);
        vm.set_sender(owner);
        token.mint(user, U256::from(1000u64)).unwrap();
        token.burn(user, U256::from(400u64)).unwrap();
        assert_eq!(token.total_supply().unwrap(), U256::from(600u64));
        assert_eq!(token.balance_of(user).unwrap(), U256::from(600u64));
    }

    #[test]
    fn burn_only_owner() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        vm.set_sender(owner);
        token.mint(addr(5), U256::from(10u64)).unwrap();
        vm.set_sender(addr(7));
        assert_eq!(token.burn(addr(5), U256::from(1u8)).unwrap_err(), b"Unauthorized".to_vec());
    }

    #[test]
    fn burn_more_than_supply_reverts() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        vm.set_sender(owner);
        token.mint(addr(5), U256::from(10u64)).unwrap();
        assert_eq!(token.burn(addr(5), U256::from(11u64)).unwrap_err(), b"InsufficientBalance".to_vec());
    }

    #[test]
    fn burn_more_than_balance_reverts() {
        // Supply covers the amount, but the targeted account's balance does not.
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        vm.set_sender(owner);
        token.mint(addr(5), U256::from(10u64)).unwrap();
        token.mint(addr(6), U256::from(10u64)).unwrap();
        // total_supply == 20, but addr(6) only holds 10.
        assert_eq!(token.burn(addr(6), U256::from(11u64)).unwrap_err(), b"InsufficientBalance".to_vec());
    }

    // ── Non-transferable behaviour (ERC-20 surface) ───────────────────

    #[test]
    fn transfer_always_reverts() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        vm.set_sender(owner);
        token.mint(owner, U256::from(100u64)).unwrap();
        assert_eq!(token.transfer(addr(2), U256::from(1u8)).unwrap_err(), b"Unauthorized".to_vec());
    }

    #[test]
    fn transfer_from_always_reverts() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        vm.set_sender(owner);
        assert_eq!(
            token.transfer_from(owner, addr(2), U256::from(1u8)).unwrap_err(),
            b"Unauthorized".to_vec()
        );
    }

    #[test]
    fn approve_sets_allowance() {
        let vm = TestVM::default();
        let owner = addr(1);
        let mut token = setup(&vm, owner);
        let spender = addr(4);
        vm.set_sender(owner);
        assert!(token.approve(spender, U256::from(777u64)).unwrap());
        assert_eq!(token.allowance(owner, spender).unwrap(), U256::from(777u64));
    }
}


