use alloy_primitives::I256;
use stylus_sdk::prelude::*;

use crate::math_core::{gaussian_cdf, gaussian_pdf};

const WAD: I256 = I256::from(1_000_000_000_000_000_000i128);

sol_storage! {
    #[entrypoint]
    pub struct DistributionAmm {
        int256 global_mu;
        int256 global_sigma;
        int256 total_collateral;
        int256 sigma_min;
    }
}

#[derive(SolidityError, Debug)]
pub enum Error {
    VarianceTooLow,
}

#[public]
impl DistributionAmm {
    pub fn trade_distribution(&mut self, target_mu: I256, target_sigma: I256) -> Result<(), Error> {
        let sigma_min = self.sigma_min.get();
        require!(target_sigma >= sigma_min, Error::VarianceTooLow);

        let global_mu = self.global_mu.get();
        let global_sigma = self.global_sigma.get();

        let l2 = l2_distance(target_mu, target_sigma, global_mu, global_sigma);

        let new_mu = global_mu + wad_mul(l2, target_mu - global_mu);
        let new_sigma = global_sigma + wad_mul(l2, target_sigma - global_sigma);

        self.global_mu.set(new_mu);
        self.global_sigma.set(new_sigma);
        self.total_collateral.set(self.total_collateral.get() + l2);

        Ok(())
    }
}

fn l2_distance(target_mu: I256, target_sigma: I256, global_mu: I256, global_sigma: I256) -> I256 {
    let pdf_global = gaussian_pdf(target_mu, global_mu, global_sigma);
    let pdf_user = gaussian_pdf(target_mu, target_mu, target_sigma);
    let cdf_global = gaussian_cdf(target_mu, global_mu, global_sigma);
    let cdf_user = gaussian_cdf(target_mu, target_mu, target_sigma);

    let diff_pdf = abs_i256(pdf_user - pdf_global);
    let diff_cdf = abs_i256(cdf_user - cdf_global);

    let mut l2 = wad_mul(diff_pdf, diff_pdf) + wad_mul(diff_cdf, diff_cdf);
    if l2 > WAD {
        l2 = WAD;
    }
    l2
}

fn wad_mul(a: I256, b: I256) -> I256 {
    (a * b) / WAD
}

fn abs_i256(x: I256) -> I256 {
    if x < I256::ZERO {
        -x
    } else {
        x
    }
}
