//! Localization for the points-engine's user-facing validation messages (sv/en/es/de/it).
//!
//! The domain [`CalcError`] Display impl stays English (it is the parity-contract wording and
//! the crate has no notion of a request locale). The HTTP edge maps each variant to a localized
//! string chosen from the caller's `Accept-Language`; the English column is identical to the
//! Display output so existing tests and log lines are unchanged.

use osprey_points_engine::CalcError;

/// Supported languages, in no particular order; anything else falls back to English.
const SUPPORTED: [&str; 5] = ["en", "sv", "es", "de", "it"];

/// Picks the best supported language from an `Accept-Language` header value; defaults to `en`.
pub fn pick_language(accept_language: Option<&str>) -> &'static str {
    let Some(header) = accept_language else {
        return "en";
    };
    for part in header.split(',') {
        let tag = part
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if tag.is_empty() {
            continue;
        }
        let primary = tag.split('-').next().unwrap_or("");
        if let Some(&lang) = SUPPORTED.iter().find(|&&l| l == primary) {
            return lang;
        }
    }
    "en"
}

/// Localizes a [`CalcError`] into the caller's language (English fallback).
pub fn calc_error(err: CalcError, accept_language: Option<&str>) -> String {
    let lang = pick_language(accept_language);
    match (lang, err) {
        // --- Swedish ---
        ("sv", CalcError::AmountOutOfRange) => {
            "beloppet måste vara större än 0 och högst 1,000,000"
        }
        ("sv", CalcError::RateOutOfRange) => "kursen måste vara större än 0 och högst 10",
        ("sv", CalcError::PromotionOutOfRange) => {
            "varje kampanjmultiplikator måste vara större än 0 och högst 10"
        }
        ("sv", CalcError::TooManyPromotions) => "högst 5 kampanjer får gälla en enskild intjäning",
        // --- Spanish ---
        ("es", CalcError::AmountOutOfRange) => {
            "el importe debe ser mayor que 0 y como máximo 1,000,000"
        }
        ("es", CalcError::RateOutOfRange) => "la tasa debe ser mayor que 0 y como máximo 10",
        ("es", CalcError::PromotionOutOfRange) => {
            "cada multiplicador de promoción debe ser mayor que 0 y como máximo 10"
        }
        ("es", CalcError::TooManyPromotions) => {
            "se pueden aplicar como máximo 5 promociones a una sola acumulación"
        }
        // --- German ---
        ("de", CalcError::AmountOutOfRange) => {
            "der Betrag muss größer als 0 und höchstens 1,000,000 sein"
        }
        ("de", CalcError::RateOutOfRange) => "die Rate muss größer als 0 und höchstens 10 sein",
        ("de", CalcError::PromotionOutOfRange) => {
            "jeder Aktionsmultiplikator muss größer als 0 und höchstens 10 sein"
        }
        ("de", CalcError::TooManyPromotions) => {
            "höchstens 5 Aktionen dürfen für eine einzelne Gutschrift gelten"
        }
        // --- Italian ---
        ("it", CalcError::AmountOutOfRange) => {
            "l'importo deve essere maggiore di 0 e al massimo 1,000,000"
        }
        ("it", CalcError::RateOutOfRange) => "il tasso deve essere maggiore di 0 e al massimo 10",
        ("it", CalcError::PromotionOutOfRange) => {
            "ogni moltiplicatore promozionale deve essere maggiore di 0 e al massimo 10"
        }
        ("it", CalcError::TooManyPromotions) => {
            "al massimo 5 promozioni possono essere applicate a una singola maturazione"
        }
        // --- English (default) — must match CalcError's Display output verbatim ---
        (_, err) => return err.to_string(),
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_language_honours_order_and_falls_back() {
        assert_eq!(pick_language(None), "en");
        assert_eq!(pick_language(Some("")), "en");
        assert_eq!(pick_language(Some("sv-SE,sv;q=0.9,en;q=0.8")), "sv");
        assert_eq!(pick_language(Some("es-ES")), "es");
        assert_eq!(pick_language(Some("fr-FR")), "en"); // unsupported
        assert_eq!(pick_language(Some("fr,de;q=0.5")), "de"); // first supported wins
    }

    #[test]
    fn english_matches_display_verbatim() {
        assert_eq!(
            calc_error(CalcError::RateOutOfRange, None),
            CalcError::RateOutOfRange.to_string()
        );
        assert_eq!(
            calc_error(CalcError::AmountOutOfRange, Some("fr")),
            CalcError::AmountOutOfRange.to_string()
        );
    }

    #[test]
    fn translates_by_language() {
        assert_eq!(
            calc_error(CalcError::RateOutOfRange, Some("sv-SE,sv;q=0.9")),
            "kursen måste vara större än 0 och högst 10"
        );
        assert!(calc_error(CalcError::TooManyPromotions, Some("de")).starts_with("höchstens 5"));
    }
}
