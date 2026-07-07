//! Pure points calculation for the Osprey loyalty programme.
//!
//! Everything in this crate is a pure function over [`rust_decimal::Decimal`]
//! values — no I/O, no clocks, no floats. The HTTP API lives in the binary.

use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};

/// Upper bound (inclusive) for the spent amount. Amounts must be in `(0, 1_000_000]`.
pub const MAX_AMOUNT: Decimal = Decimal::from_parts(1_000_000, 0, 0, false, 0);
/// Upper bound (inclusive) for the partner earn rate. Rates must be in `(0, 10]`.
pub const MAX_RATE: Decimal = Decimal::from_parts(10, 0, 0, false, 0);
/// Upper bound (inclusive) for a single promotion multiplier. Multipliers must be in `(0, 10]`.
pub const MAX_MULTIPLIER: Decimal = Decimal::from_parts(10, 0, 0, false, 0);
/// Maximum number of promotions that may apply to a single earn.
pub const MAX_PROMOTIONS: usize = 5;

/// A promotion that scales the earned points by its multiplier.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Promotion {
    /// Multiplier applied to the points product; must be in `(0, 10]`.
    pub multiplier: Decimal,
}

/// Validation failures for [`points`].
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum CalcError {
    /// The amount was outside `(0, 1_000_000]`.
    AmountOutOfRange,
    /// The rate was outside `(0, 10]`.
    RateOutOfRange,
    /// A promotion multiplier was outside `(0, 10]`.
    PromotionOutOfRange,
    /// More than [`MAX_PROMOTIONS`] promotions were supplied.
    TooManyPromotions,
}

impl std::fmt::Display for CalcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CalcError::AmountOutOfRange => {
                write!(f, "amount must be greater than 0 and at most 1,000,000")
            }
            CalcError::RateOutOfRange => {
                write!(f, "rate must be greater than 0 and at most 10")
            }
            CalcError::PromotionOutOfRange => {
                write!(
                    f,
                    "each promotion multiplier must be greater than 0 and at most 10"
                )
            }
            CalcError::TooManyPromotions => {
                write!(f, "at most 5 promotions may apply to a single earn")
            }
        }
    }
}

impl std::error::Error for CalcError {}

/// Calculates loyalty points for a purchase.
///
/// # Formula
///
/// `points = floor(amount × rate × Π promotion multipliers)` as an `i64`.
/// Floor, never round — the airline keeps the fraction.
///
/// # Bounds
///
/// * `amount` ∈ `(0, 1_000_000]`, otherwise [`CalcError::AmountOutOfRange`]
/// * `rate` ∈ `(0, 10]`, otherwise [`CalcError::RateOutOfRange`]
/// * each promotion multiplier ∈ `(0, 10]`, otherwise [`CalcError::PromotionOutOfRange`]
/// * at most [`MAX_PROMOTIONS`] promotions, otherwise [`CalcError::TooManyPromotions`]
///
/// # Parity contract with the members service
///
/// With zero promotions this must equal `ApplyEarn.PointsFor` in
/// `services/members/Osprey.Members/Features/ApplyEarn/ApplyEarn.Core.cs`:
/// `floor(amountSpent * partnerRate)`. Both sides use exact decimal
/// arithmetic; any divergence is a bug in this crate.
pub fn points(amount: Decimal, rate: Decimal, promotions: &[Promotion]) -> Result<i64, CalcError> {
    if amount <= Decimal::ZERO || amount > MAX_AMOUNT {
        return Err(CalcError::AmountOutOfRange);
    }
    if rate <= Decimal::ZERO || rate > MAX_RATE {
        return Err(CalcError::RateOutOfRange);
    }
    if promotions.len() > MAX_PROMOTIONS {
        return Err(CalcError::TooManyPromotions);
    }
    if promotions
        .iter()
        .any(|p| p.multiplier <= Decimal::ZERO || p.multiplier > MAX_MULTIPLIER)
    {
        return Err(CalcError::PromotionOutOfRange);
    }

    let product = promotions
        .iter()
        .fold(amount * rate, |acc, p| acc * p.multiplier);

    Ok(product.floor().to_i64().expect(
        "floored product cannot overflow i64: max is 1e6 * 10 * 10^5 = 1e12, well below i64::MAX",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn promos(multipliers: &[&str]) -> Vec<Promotion> {
        multipliers
            .iter()
            .map(|m| Promotion {
                multiplier: m.parse().expect("test multiplier is a valid decimal"),
            })
            .collect()
    }

    #[test]
    fn zero_promotions_is_plain_floor() {
        assert_eq!(points(dec!(40000), dec!(0.5), &[]), Ok(20_000));
        assert_eq!(points(dec!(999), dec!(0.5), &[]), Ok(499));
    }

    #[test]
    fn promotions_multiply_before_the_floor() {
        assert_eq!(points(dec!(1000), dec!(0.5), &promos(&["2.0"])), Ok(1000));
        assert_eq!(points(dec!(999), dec!(0.5), &promos(&["1.5"])), Ok(749));
    }

    #[test]
    fn bounds_are_enforced() {
        assert_eq!(
            points(dec!(0), dec!(0.5), &[]),
            Err(CalcError::AmountOutOfRange)
        );
        assert_eq!(
            points(dec!(1000001), dec!(0.5), &[]),
            Err(CalcError::AmountOutOfRange)
        );
        assert_eq!(
            points(dec!(100), dec!(11), &[]),
            Err(CalcError::RateOutOfRange)
        );
        assert_eq!(
            points(dec!(100), dec!(0), &[]),
            Err(CalcError::RateOutOfRange)
        );
        assert_eq!(
            points(dec!(100), dec!(0.5), &promos(&["0"])),
            Err(CalcError::PromotionOutOfRange)
        );
        assert_eq!(
            points(
                dec!(100),
                dec!(0.5),
                &promos(&["1.0", "1.0", "1.0", "1.0", "1.0", "1.0"])
            ),
            Err(CalcError::TooManyPromotions)
        );
    }
}
