use alloy_primitives::I256;

const WAD_I128: i128 = 1_000_000_000_000_000_000;
const WAD: I256 = I256::from(WAD_I128);
const HALF_WAD: I256 = I256::from(500_000_000_000_000_000i128);
const NEG_HALF_WAD: I256 = I256::from(-500_000_000_000_000_000i128);
const SQRT_2_WAD: I256 = I256::from(1_414_213_562_373_095_048i128);
const SQRT_2PI_WAD: I256 = I256::from(2_506_628_274_631_000_502i128);

const ERF_P_WAD: I256 = I256::from(327_591_100_000_000_000i128);
const ERF_A1_WAD: I256 = I256::from(254_829_592_000_000_000i128);
const ERF_A2_WAD: I256 = I256::from(-284_496_736_000_000_000i128);
const ERF_A3_WAD: I256 = I256::from(1_421_413_741_000_000_000i128);
const ERF_A4_WAD: I256 = I256::from(-1_453_152_027_000_000_000i128);
const ERF_A5_WAD: I256 = I256::from(1_061_405_429_000_000_000i128);

const MIN_EXP_WAD: I256 = I256::from(-20_000_000_000_000_000_000i128);
const EXP_SERIES_TERMS: u32 = 18;

pub fn gaussian_pdf(x: I256, mu: I256, sigma: I256) -> I256 {
    if sigma <= I256::ZERO {
        return I256::ZERO;
    }

    let z = wad_div(x - mu, sigma);
    let z2 = wad_mul(z, z);
    let exponent = wad_mul(z2, NEG_HALF_WAD);
    let exp_val = exp_wad(exponent);

    let denom = wad_mul(sigma, SQRT_2PI_WAD);
    if denom == I256::ZERO {
        return I256::ZERO;
    }

    let inv_denom = wad_div(WAD, denom);
    let pdf = wad_mul(inv_denom, exp_val);
    clamp_unit(pdf)
}

pub fn gaussian_cdf(x: I256, mu: I256, sigma: I256) -> I256 {
    if sigma <= I256::ZERO {
        return I256::ZERO;
    }

    let z = wad_div(x - mu, sigma);
    let z = wad_div(z, SQRT_2_WAD);
    let erf = erf_approx(z);
    let cdf = (WAD + erf) / I256::from(2i128);
    clamp_unit(cdf)
}

fn erf_approx(x: I256) -> I256 {
    if x == I256::ZERO {
        return I256::ZERO;
    }

    let sign_negative = x < I256::ZERO;
    let x = abs_i256(x);

    let t = wad_div(WAD, WAD + wad_mul(ERF_P_WAD, x));
    let t2 = wad_mul(t, t);
    let t3 = wad_mul(t2, t);
    let t4 = wad_mul(t3, t);
    let t5 = wad_mul(t4, t);

    let poly = wad_mul(ERF_A1_WAD, t)
        + wad_mul(ERF_A2_WAD, t2)
        + wad_mul(ERF_A3_WAD, t3)
        + wad_mul(ERF_A4_WAD, t4)
        + wad_mul(ERF_A5_WAD, t5);

    let exp_term = exp_wad(-wad_mul(x, x));
    let mut erf = WAD - wad_mul(poly, exp_term);
    erf = clamp_unit(erf);

    if sign_negative {
        -erf
    } else {
        erf
    }
}

fn exp_wad(x: I256) -> I256 {
    if x <= MIN_EXP_WAD {
        return I256::ZERO;
    }

    let mut term = WAD;
    let mut sum = WAD;

    for n in 1..=EXP_SERIES_TERMS {
        term = wad_mul(term, x);
        term = term / I256::from(n as i128);
        sum += term;
    }

    if sum < I256::ZERO {
        I256::ZERO
    } else {
        sum
    }
}

fn wad_mul(a: I256, b: I256) -> I256 {
    (a * b) / WAD
}

fn wad_div(a: I256, b: I256) -> I256 {
    if b == I256::ZERO {
        return I256::ZERO;
    }
    (a * WAD) / b
}

fn abs_i256(x: I256) -> I256 {
    if x < I256::ZERO {
        -x
    } else {
        x
    }
}

fn clamp_unit(x: I256) -> I256 {
    if x < I256::ZERO {
        I256::ZERO
    } else if x > WAD {
        WAD
    } else {
        x
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy_primitives::U256;

    fn assert_approx(actual: I256, expected: I256, tolerance: I256) {
        let diff = if actual > expected {
            actual - expected
        } else {
            expected - actual
        };
        assert!(
            diff <= tolerance,
            "diff {:?} exceeds tolerance {:?}",
            diff,
            tolerance
        );
    }

    #[test]
    fn pdf_at_mean_unit_sigma() {
        let pdf = gaussian_pdf(I256::ZERO, I256::ZERO, WAD);
        let expected = I256::from(398_942_280_000_000_000i128);
        let tolerance = I256::from(6_000_000_000_000_000i128);
        assert_approx(pdf, expected, tolerance);
    }

    #[test]
    fn cdf_at_mean() {
        let cdf = gaussian_cdf(I256::ZERO, I256::ZERO, WAD);
        let expected = HALF_WAD;
        let tolerance = I256::from(2_000_000_000_000_000i128);
        assert_approx(cdf, expected, tolerance);
    }

    #[test]
    fn cdf_one_sigma() {
        let x = WAD;
        let cdf = gaussian_cdf(x, I256::ZERO, WAD);
        let expected = I256::from(841_344_746_000_000_000i128);
        let tolerance = I256::from(7_000_000_000_000_000i128);
        assert_approx(cdf, expected, tolerance);
    }

    #[test]
    fn u256_wad_sanity() {
        let wad_u = U256::from(WAD_I128 as u128);
        assert_eq!(wad_u, U256::from(1_000_000_000_000_000_000u128));
    }
}
