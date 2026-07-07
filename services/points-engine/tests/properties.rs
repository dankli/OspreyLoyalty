//! Property-based invariants for the points calculation.
//!
//! All strategies build `Decimal` values from integers so every generated
//! input is exact (no float noise) and inside the documented bounds.

use osprey_points_engine::{Promotion, points};
use proptest::prelude::*;
use rust_decimal::Decimal;

/// Amounts in (0, 1_000_000], generated as cents: 1..=100_000_000 scaled by 100.
fn amount_strategy() -> impl Strategy<Value = Decimal> {
    (1i64..=100_000_000).prop_map(|cents| Decimal::new(cents, 2))
}

/// Rates in (0, 10], generated as hundredths: 1..=1000 scaled by 100.
fn rate_strategy() -> impl Strategy<Value = Decimal> {
    (1i64..=1000).prop_map(|hundredths| Decimal::new(hundredths, 2))
}

/// Multipliers in (0, 10], generated as hundredths: 1..=1000 scaled by 100.
fn multiplier_strategy() -> impl Strategy<Value = Decimal> {
    (1i64..=1000).prop_map(|hundredths| Decimal::new(hundredths, 2))
}

/// Zero to five valid promotions.
fn promotions_strategy() -> impl Strategy<Value = Vec<Promotion>> {
    proptest::collection::vec(
        multiplier_strategy().prop_map(|multiplier| Promotion { multiplier }),
        0..=5,
    )
}

proptest! {
    #[test]
    fn points_are_never_negative(
        amount in amount_strategy(),
        rate in rate_strategy(),
        promotions in promotions_strategy(),
    ) {
        let p = points(amount, rate, &promotions).expect("inputs are within bounds");
        prop_assert!(p >= 0);
    }

    #[test]
    fn points_are_monotonic_in_amount(
        a in amount_strategy(),
        b in amount_strategy(),
        rate in rate_strategy(),
        promotions in promotions_strategy(),
    ) {
        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
        let p_lo = points(lo, rate, &promotions).expect("inputs are within bounds");
        let p_hi = points(hi, rate, &promotions).expect("inputs are within bounds");
        prop_assert!(p_lo <= p_hi);
    }

    #[test]
    fn floor_bound_holds(
        amount in amount_strategy(),
        rate in rate_strategy(),
        promotions in promotions_strategy(),
    ) {
        let p = points(amount, rate, &promotions).expect("inputs are within bounds");
        let product = promotions
            .iter()
            .fold(amount * rate, |acc, promo| acc * promo.multiplier);
        prop_assert!(Decimal::from(p) <= product);
        prop_assert!(product < Decimal::from(p + 1));
    }

    #[test]
    fn identity_multiplier_changes_nothing(
        amount in amount_strategy(),
        rate in rate_strategy(),
        promotions in proptest::collection::vec(
            multiplier_strategy().prop_map(|multiplier| Promotion { multiplier }),
            0..=4,
        ),
    ) {
        let without = points(amount, rate, &promotions).expect("inputs are within bounds");
        let mut with_identity = promotions.clone();
        with_identity.push(Promotion { multiplier: Decimal::ONE });
        let with = points(amount, rate, &with_identity).expect("inputs are within bounds");
        prop_assert_eq!(without, with);
    }

    #[test]
    fn promotion_order_is_irrelevant(
        amount in amount_strategy(),
        rate in rate_strategy(),
        promotions in promotions_strategy(),
    ) {
        let forward = points(amount, rate, &promotions).expect("inputs are within bounds");
        let mut reversed = promotions.clone();
        reversed.reverse();
        let backward = points(amount, rate, &reversed).expect("inputs are within bounds");
        prop_assert_eq!(forward, backward);
    }

    #[test]
    fn no_promotions_matches_the_members_formula(
        amount in amount_strategy(),
        rate in rate_strategy(),
    ) {
        // Parity contract with ApplyEarn.PointsFor in
        // services/members/Osprey.Members/Features/ApplyEarn/ApplyEarn.Core.cs:
        // floor(amountSpent * partnerRate).
        let p = points(amount, rate, &[]).expect("inputs are within bounds");
        let expected = (amount * rate).floor();
        prop_assert_eq!(Decimal::from(p), expected);
    }
}
