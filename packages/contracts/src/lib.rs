#![cfg_attr(not(feature = "export-abi"), no_std)]

pub mod math_core;

pub use math_core::{gaussian_cdf, gaussian_pdf};

#[cfg(test)]
extern crate std;
