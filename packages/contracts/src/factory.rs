use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;
use stylus_sdk::prelude::*;
use stylus_sdk::deploy::RawDeploy;
use alloc::vec::Vec;

extern crate alloc;

use crate::interfaces::{IProxyAmm, IProxyRouter};

sol! {
    event MarketCreated(uint256 indexed market_id, address amm, address router);
}

sol_storage! {
    #[entrypoint]
    pub struct OmniCurveFactory {
        address owner;
        address pending_owner;
        address amm_implementation;
        address router_implementation;
        uint256 market_count;
        mapping(uint256 => address) amm_proxies;
        mapping(uint256 => address) router_proxies;
    }
}

pub enum Error {
    Unauthorized,
    InitFailed,
    CloneFailed,
}

impl From<Error> for Vec<u8> {
    fn from(e: Error) -> Self {
        match e {
            Error::Unauthorized => b"Unauthorized".to_vec(),
            Error::InitFailed => b"InitFailed".to_vec(),
            Error::CloneFailed => b"CloneFailed".to_vec(),
        }
    }
}

#[public]
impl OmniCurveFactory {
    pub fn initialize(&mut self, owner: Address, amm_impl: Address, router_impl: Address) -> Result<(), Vec<u8>> {
        if self.owner.get() != Address::ZERO { return Err(b"Already initialized".to_vec()); }
        self.owner.set(owner);
        self.amm_implementation.set(amm_impl);
        self.router_implementation.set(router_impl);
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

    pub fn create_market(&mut self, usdc: Address, sigma_min: alloy_primitives::I256) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() { return Err(Error::Unauthorized.into()); }

        let amm_proxy = self.clone_contract(self.amm_implementation.get())?;
        let router_proxy = self.clone_contract(self.router_implementation.get())?;

        let proxy_amm = IProxyAmm::new(amm_proxy);
        let proxy_router = IProxyRouter::new(router_proxy);
        
        let factory_address = self.vm().contract_address();

        let config1 = Call::new_mutating(&mut *self);
        proxy_amm.initialize(self.vm(), config1, factory_address).map_err(|_| Error::InitFailed)?;

        let config2 = Call::new_mutating(&mut *self);
        proxy_router.initialize(self.vm(), config2, factory_address).map_err(|_| Error::InitFailed)?;

        let config3 = Call::new_mutating(&mut *self);
        proxy_router.set_amm_address(self.vm(), config3, amm_proxy).map_err(|_| Error::InitFailed)?;

        let config4 = Call::new_mutating(&mut *self);
        proxy_amm.set_router_address(self.vm(), config4, router_proxy).map_err(|_| Error::InitFailed)?;

        let config5 = Call::new_mutating(&mut *self);
        proxy_amm.set_usdc_token(self.vm(), config5, usdc).map_err(|_| Error::InitFailed)?;

        let config6 = Call::new_mutating(&mut *self);
        proxy_amm.set_sigma_min(self.vm(), config6, sigma_min).map_err(|_| Error::InitFailed)?;

        let creator = self.vm().msg_sender();
        
        let config7 = Call::new_mutating(&mut *self);
        proxy_amm.transfer_ownership(self.vm(), config7, creator).map_err(|_| Error::InitFailed)?;

        let config8 = Call::new_mutating(&mut *self);
        proxy_router.transfer_ownership(self.vm(), config8, creator).map_err(|_| Error::InitFailed)?;

        let current_count = self.market_count.get();
        self.amm_proxies.setter(current_count).set(amm_proxy);
        self.router_proxies.setter(current_count).set(router_proxy);

        self.vm().log(MarketCreated { market_id: current_count, amm: amm_proxy, router: router_proxy });

        let new_count = current_count + U256::from(1);
        self.market_count.set(new_count);

        Ok(())
    }
}

impl OmniCurveFactory {
    fn clone_contract(&self, implementation: Address) -> Result<Address, Vec<u8>> {
        let mut code = Vec::with_capacity(55);
        code.extend_from_slice(&[
            0x3d, 0x60, 0x2d, 0x80, 0x60, 0x0a, 0x3d, 0x39, 0x81, 0xf3,
            0x36, 0x3d, 0x3d, 0x37, 0x3d, 0x3d, 0x3d, 0x36, 0x3d, 0x73,
        ]);
        code.extend_from_slice(implementation.as_slice());
        code.extend_from_slice(&[
            0x5a, 0xf4, 0x3d, 0x82, 0x80, 0x3e, 0x90, 0x3d, 0x91, 0x60, 0x2b, 0x57, 0xfd, 0x5b, 0xf3,
        ]);

        let deployer = RawDeploy::new();
        let deployed_address = unsafe { deployer.deploy(self.vm(), &code, U256::ZERO) }.map_err(|_| Error::CloneFailed)?;
        Ok(deployed_address)
    }
}
