use alloy_primitives::{I256, U256};
use alloy_sol_types::sol;
use stylus_sdk::prelude::*;
use alloc::vec::Vec;

extern crate alloc;

use crate::math_core::{gaussian_cdf, gaussian_pdf, wad_mul, abs_i256};

#[inline(always)] fn wad() -> I256 { I256::try_from(1_000_000_000_000_000_000i128).unwrap() }

sol! {
    event CurveUpdated(uint256 indexed new_mu, uint256 indexed new_sigma);
}

sol_storage! {
    #[entrypoint]
    pub struct DistributionAmm {
        int256 global_mu;
        int256 global_sigma;
        int256 total_collateral;
        int256 sigma_min;
    }
}

pub enum Error {
    VarianceTooLow,
}

impl From<Error> for Vec<u8> {
    fn from(e: Error) -> Self {
        match e {
            Error::VarianceTooLow => b"VarianceTooLow".to_vec(),
        }
    }
}

#[public]
impl DistributionAmm {
    pub fn global_mu(&self) -> Result<I256, Vec<u8>> {
        Ok(self.global_mu.get())
    }

    pub fn global_sigma(&self) -> Result<I256, Vec<u8>> {
        Ok(self.global_sigma.get())
    }

    pub fn trade_distribution(&mut self, target_mu: I256, target_sigma: I256) -> Result<(), Vec<u8>> {
        let sigma_min = self.sigma_min.get();
        if target_sigma < sigma_min {
            return Err(Error::VarianceTooLow.into());
        }

        let global_mu = self.global_mu.get();
        let global_sigma = self.global_sigma.get();

        let l2 = l2_distance(target_mu, target_sigma, global_mu, global_sigma);

        let new_mu = global_mu + wad_mul(l2, target_mu - global_mu);
        let new_sigma = global_sigma + wad_mul(l2, target_sigma - global_sigma);

        self.global_mu.set(new_mu);
        self.global_sigma.set(new_sigma);
        self.total_collateral.set(self.total_collateral.get() + l2);

        self.vm().log(CurveUpdated {
            new_mu: to_u256(new_mu),
            new_sigma: to_u256(new_sigma),
        });

        Ok(())
    }
}

#[inline(always)]
fn to_u256(value: I256) -> U256 {
    value.into_raw()
}

fn l2_distance(target_mu: I256, target_sigma: I256, global_mu: I256, global_sigma: I256) -> I256 {
    let pdf_global = gaussian_pdf(target_mu, global_mu, global_sigma);
    let pdf_user = gaussian_pdf(target_mu, target_mu, target_sigma);
    let cdf_global = gaussian_cdf(target_mu, global_mu, global_sigma);
    let cdf_user = gaussian_cdf(target_mu, target_mu, target_sigma);

    let diff_pdf = abs_i256(pdf_user - pdf_global);
    let diff_cdf = abs_i256(cdf_user - cdf_global);

    let mut l2 = wad_mul(diff_pdf, diff_pdf) + wad_mul(diff_cdf, diff_cdf);
    if l2 > wad() {
        l2 = wad();
    }
    l2
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wad_value(value: i128) -> I256 {
        I256::try_from(value).unwrap()
    }

    #[test]
    fn l2_distance_is_zero_for_identical_distributions() {
        let mu = wad_value(1_000_000_000_000_000_000);
        let sigma = wad_value(2_000_000_000_000_000_000);

        assert_eq!(l2_distance(mu, sigma, mu, sigma), I256::ZERO);
    }

    #[test]
    fn l2_distance_is_bounded_and_grows_with_difference() {
        let mu = I256::ZERO;
        let sigma = wad_value(1_000_000_000_000_000_000);

        let nearby = l2_distance(mu, sigma, mu, sigma + wad_value(250_000_000_000_000_000));
        let far = l2_distance(mu + wad_value(4_000_000_000_000_000_000), sigma, mu, sigma);

        assert!(nearby > I256::ZERO, "Nearby distributions should still have measurable distance");
        assert!(far <= wad_value(1_000_000_000_000_000_000), "Distance should be capped at one wad");
        assert!(far > nearby, "Greater separation should increase the distance");
    }
}
