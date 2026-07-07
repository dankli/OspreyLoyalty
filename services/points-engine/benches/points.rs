// Measured on 2026-07-07: ~36 ns (no promos), ~202 ns (5 promos) — the ADR-0006 claim, quantified.

//! Criterion benchmark for the hot path: [`osprey_points_engine::points`].

use std::hint::black_box;

use criterion::{Criterion, criterion_group, criterion_main};
use osprey_points_engine::{Promotion, points};
use rust_decimal::Decimal;

fn bench_points(c: &mut Criterion) {
    let amount = Decimal::new(40_000, 0);
    let rate = Decimal::new(5, 1); // 0.5
    let no_promotions: [Promotion; 0] = [];
    let five_promotions: Vec<Promotion> = (0..5)
        .map(|_| Promotion {
            multiplier: Decimal::new(15, 1), // 1.5
        })
        .collect();

    c.bench_function("points/no_promotions", |b| {
        b.iter(|| {
            points(
                black_box(amount),
                black_box(rate),
                black_box(&no_promotions),
            )
        });
    });
    c.bench_function("points/five_promotions", |b| {
        b.iter(|| {
            points(
                black_box(amount),
                black_box(rate),
                black_box(&five_promotions),
            )
        });
    });
}

criterion_group!(benches, bench_points);
criterion_main!(benches);
