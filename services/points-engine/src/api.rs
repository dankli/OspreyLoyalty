//! HTTP API for the points engine.
//!
//! One POST endpoint over the pure [`osprey_points_engine::points`] core,
//! plus `/health` and fleet-standard `X-Correlation-Id` handling.

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Router;
use axum::body::Body;
use axum::extract::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::header::ACCEPT_LANGUAGE;
use axum::http::{HeaderMap, HeaderValue, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use osprey_points_engine::{Promotion, points};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::json;
use std::sync::LazyLock;

use axum::http::header::CONTENT_TYPE;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use prometheus::{
    Encoder, HistogramVec, IntCounterVec, Registry, TextEncoder, histogram_opts, opts,
};
use tokio::sync::Mutex;

const CORRELATION_HEADER: &str = "x-correlation-id";

// Prometheus registry + HTTP metrics. points-engine was the one backend without a
// scrape endpoint; /metrics closes that gap so it joins the RED dashboard.
static REGISTRY: LazyLock<Registry> = LazyLock::new(Registry::new);
static HTTP_REQUESTS: LazyLock<IntCounterVec> = LazyLock::new(|| {
    let counter = IntCounterVec::new(
        opts!("http_requests_total", "Total HTTP requests"),
        &["method", "path", "status"],
    )
    .expect("valid counter");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("counter registers");
    counter
});
static HTTP_DURATION: LazyLock<HistogramVec> = LazyLock::new(|| {
    let histogram = HistogramVec::new(
        histogram_opts!(
            "http_request_duration_seconds",
            "HTTP request duration in seconds"
        ),
        &["method", "path", "status"],
    )
    .expect("valid histogram");
    REGISTRY
        .register(Box::new(histogram.clone()))
        .expect("histogram registers");
    histogram
});

/// Request body for `POST /calculate`.
///
/// `amount`, `rate` and each `multiplier` are decimals; both JSON strings
/// (`"40000"`) and plain JSON numbers (`40000`, `0.5`) are accepted —
/// rust_decimal's default `serde` feature deserializes from strings,
/// integers and floats.
#[derive(Debug, Deserialize)]
struct CalculateRequest {
    amount: Decimal,
    rate: Decimal,
    #[serde(default)]
    promotions: Vec<Promotion>,
}

/// Zero-trust config. Opt-in via AUTH_ENABLED so tests and the direct README curls stay open; when
/// on, /calculate needs a valid bearer token. Two modes: an HS256 shared secret (demo/test), or
/// RS256 validated against the identity service's JWKS (AUTH_JWKS_URI), keys cached with a short TTL.
/// This engine sits outside the earn path, so auth here is belt-and-braces (see ADR-0006).
#[derive(Clone)]
pub struct AuthConfig {
    pub enabled: bool,
    pub secret: Option<String>,
    pub jwks_uri: Option<String>,
    jwks_cache: Arc<Mutex<Option<(JwkSet, Instant)>>>,
}

impl AuthConfig {
    #[cfg(test)]
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            secret: None,
            jwks_uri: None,
            jwks_cache: Arc::new(Mutex::new(None)),
        }
    }

    /// Test seam: enabled RS256 mode with a pre-populated JWKS (no network fetch).
    #[cfg(test)]
    pub fn with_jwks(jwks: JwkSet) -> Self {
        Self {
            enabled: true,
            secret: None,
            jwks_uri: Some("http://test/jwks".to_owned()),
            jwks_cache: Arc::new(Mutex::new(Some((jwks, Instant::now())))),
        }
    }

    /// Test seam: enabled HS256 shared-secret mode.
    #[cfg(test)]
    pub fn hs256(secret: &str) -> Self {
        Self {
            enabled: true,
            secret: Some(secret.to_owned()),
            jwks_uri: None,
            jwks_cache: Arc::new(Mutex::new(None)),
        }
    }

    pub fn from_env() -> Self {
        let enabled = std::env::var("AUTH_ENABLED")
            .map(|value| value == "true")
            .unwrap_or(false);
        let secret = std::env::var("AUTH_SECRET").ok();
        let jwks_uri = std::env::var("AUTH_JWKS_URI").ok();
        Self {
            enabled,
            secret,
            jwks_uri,
            jwks_cache: Arc::new(Mutex::new(None)),
        }
    }

    /// The identity service's signing keys, cached for 10 minutes; fetched on a miss.
    async fn jwks(&self) -> Option<JwkSet> {
        const TTL: Duration = Duration::from_secs(600);
        let uri = self.jwks_uri.as_deref()?;
        let mut guard = self.jwks_cache.lock().await;
        if let Some((set, fetched_at)) = guard.as_ref()
            && fetched_at.elapsed() < TTL
        {
            return Some(set.clone());
        }
        let text = reqwest::Client::new()
            .get(uri)
            .send()
            .await
            .ok()?
            .text()
            .await
            .ok()?;
        let set: JwkSet = serde_json::from_str(&text).ok()?;
        *guard = Some((set.clone(), Instant::now()));
        Some(set)
    }
}

/// Builds the router with auth disabled (used by the existing tests).
#[cfg(test)]
pub fn router() -> Router {
    build_router(AuthConfig::disabled())
}

/// Builds the points-engine router: `POST /calculate` (auth-gated), `GET /health`,
/// `GET /metrics`, and correlation-id middleware around everything.
pub fn build_router(auth: AuthConfig) -> Router {
    let mut calculate_routes = Router::new().route("/calculate", post(calculate));
    if auth.enabled {
        calculate_routes =
            calculate_routes.route_layer(middleware::from_fn_with_state(auth, auth_middleware));
    }
    Router::new()
        .merge(calculate_routes)
        .route("/health", get(health))
        .route("/metrics", get(metrics))
        .layer(middleware::from_fn(correlation))
}

/// Rejects `/calculate` requests without a valid bearer token (401).
async fn auth_middleware(
    State(config): State<AuthConfig>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let token = request
        .headers()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    let authorized = match token {
        Some(token) => authorize(token, &config).await,
        None => false,
    };
    if authorized {
        next.run(request).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "unauthorized" })),
        )
            .into_response()
    }
}

/// Validates a bearer token: HS256 shared-secret mode takes precedence when a secret is set,
/// otherwise RS256 against the identity service's JWKS (matched by the token's `kid`).
async fn authorize(token: &str, config: &AuthConfig) -> bool {
    if let Some(secret) = config.secret.as_deref() {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_aud = false;
        return decode::<serde_json::Value>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &validation,
        )
        .is_ok();
    }

    let Ok(header) = decode_header(token) else {
        return false;
    };
    let Some(kid) = header.kid else {
        return false;
    };
    let Some(jwks) = config.jwks().await else {
        return false;
    };
    let Some(jwk) = jwks.find(&kid) else {
        return false;
    };
    let Ok(key) = DecodingKey::from_jwk(jwk) else {
        return false;
    };
    let mut validation = Validation::new(Algorithm::RS256);
    validation.validate_aud = false;
    decode::<serde_json::Value>(token, &key, &validation).is_ok()
}

/// `POST /calculate` — 200 `{"points": n}` on success; 400 `{"error": msg}`
/// for malformed JSON or a [`osprey_points_engine::CalcError`].
async fn calculate(
    headers: HeaderMap,
    payload: Result<Json<CalculateRequest>, JsonRejection>,
) -> Response {
    let Json(request) = match payload {
        Ok(json) => json,
        Err(rejection) => return error_response(rejection.body_text()),
    };
    match points(request.amount, request.rate, &request.promotions) {
        Ok(points) => (StatusCode::OK, Json(json!({ "points": points }))).into_response(),
        // Localize the domain validation message to the caller's Accept-Language.
        Err(err) => {
            let accept_language = headers.get(ACCEPT_LANGUAGE).and_then(|v| v.to_str().ok());
            error_response(crate::i18n::calc_error(err, accept_language))
        }
    }
}

fn error_response(message: String) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": message }))).into_response()
}

/// `GET /health` — liveness probe.
async fn health() -> Response {
    (StatusCode::OK, Json(json!({ "status": "ok" }))).into_response()
}

/// `GET /metrics` — Prometheus text exposition for scraping.
async fn metrics() -> Response {
    let mut buffer = Vec::new();
    let encoder = TextEncoder::new();
    encoder
        .encode(&REGISTRY.gather(), &mut buffer)
        .expect("metrics encode");
    (
        StatusCode::OK,
        [(CONTENT_TYPE, encoder.format_type())],
        buffer,
    )
        .into_response()
}

/// Accepts or generates an `X-Correlation-Id`, echoes it on the response,
/// and emits one JSON log line per request.
async fn correlation(request: Request<Body>, next: Next) -> Response {
    let started = Instant::now();
    let correlation_id = request
        .headers()
        .get(CORRELATION_HEADER)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string());
    let method = request.method().clone();
    let path = request.uri().path().to_owned();

    let mut response = next.run(request).await;

    let status = response.status().as_u16();
    let elapsed_secs = started.elapsed().as_secs_f64();
    let status_str = status.to_string();
    let labels = [method.as_str(), path.as_str(), status_str.as_str()];
    HTTP_REQUESTS.with_label_values(&labels).inc();
    HTTP_DURATION
        .with_label_values(&labels)
        .observe(elapsed_secs);

    tracing::info!(
        method = %method,
        path = %path,
        status = status,
        duration_ms = elapsed_secs * 1000.0,
        correlation_id = %correlation_id,
        "request handled"
    );
    if let Ok(value) = HeaderValue::from_str(&correlation_id) {
        response.headers_mut().insert(CORRELATION_HEADER, value);
    }
    response
}

#[cfg(test)]
mod tests {
    use super::router;
    use axum::Router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode, header::CONTENT_TYPE};
    use http_body_util::BodyExt;
    use jsonwebtoken::jwk::JwkSet;
    use tower::ServiceExt;

    async fn post_calculate(body: &str) -> (StatusCode, serde_json::Value) {
        let response = router()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/calculate")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(body.to_owned()))
                    .expect("request builds"),
            )
            .await
            .expect("infallible service");
        let status = response.status();
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body reads")
            .to_bytes();
        let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, json)
    }

    #[tokio::test]
    async fn calculate_happy_path() {
        let (status, body) =
            post_calculate(r#"{ "amount": "40000", "rate": "0.5", "promotions": [] }"#).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["points"], 20_000);
    }

    #[tokio::test]
    async fn calculate_accepts_plain_json_numbers() {
        let (status, body) =
            post_calculate(r#"{ "amount": 40000, "rate": 0.5, "promotions": [] }"#).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["points"], 20_000);
    }

    #[tokio::test]
    async fn calculate_with_promotion() {
        let (status, body) = post_calculate(
            r#"{ "amount": "1000", "rate": "0.5", "promotions": [{ "multiplier": "2.0" }] }"#,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["points"], 1_000);
    }

    #[tokio::test]
    async fn out_of_bounds_is_400_with_message() {
        let (status, body) =
            post_calculate(r#"{ "amount": "100", "rate": "11", "promotions": [] }"#).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let message = body["error"].as_str().expect("error message is a string");
        assert!(
            message.contains("rate"),
            "error should mention the rate, got: {message}"
        );
    }

    #[tokio::test]
    async fn out_of_bounds_message_is_localized_by_accept_language() {
        let response = router()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/calculate")
                    .header(CONTENT_TYPE, "application/json")
                    .header("accept-language", "sv-SE,sv;q=0.9,en;q=0.8")
                    .body(Body::from(
                        r#"{ "amount": "100", "rate": "11", "promotions": [] }"#.to_owned(),
                    ))
                    .expect("request builds"),
            )
            .await
            .expect("infallible service");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body reads")
            .to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).expect("json body");
        assert_eq!(json["error"], "kursen måste vara större än 0 och högst 10");
    }

    #[tokio::test]
    async fn malformed_json_is_client_error() {
        let (status, body) = post_calculate(r#"{ "amount": "#).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(
            body["error"].as_str().is_some_and(|m| !m.is_empty()),
            "400 body should carry an error message, got: {body}"
        );
    }

    #[tokio::test]
    async fn health_ok() {
        let response = router()
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .expect("request builds"),
            )
            .await
            .expect("infallible service");
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body reads")
            .to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).expect("health body is json");
        assert_eq!(json["status"], "ok");
    }

    #[tokio::test]
    async fn correlation_id_is_echoed() {
        // Provided header is echoed verbatim.
        let response = router()
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .header("x-correlation-id", "test-corr-123")
                    .body(Body::empty())
                    .expect("request builds"),
            )
            .await
            .expect("infallible service");
        assert_eq!(
            response
                .headers()
                .get("x-correlation-id")
                .and_then(|v| v.to_str().ok()),
            Some("test-corr-123")
        );

        // Absent header gets a generated, non-empty id.
        let response = router()
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .expect("request builds"),
            )
            .await
            .expect("infallible service");
        let generated = response
            .headers()
            .get("x-correlation-id")
            .and_then(|v| v.to_str().ok())
            .expect("generated correlation id present");
        assert!(!generated.is_empty());
    }

    fn hs256_token(secret: &str) -> String {
        use jsonwebtoken::{EncodingKey, Header, encode};
        #[derive(serde::Serialize)]
        struct Claims {
            sub: String,
            exp: usize,
        }
        encode(
            &Header::default(),
            &Claims {
                sub: "demo-ada".into(),
                exp: 9_999_999_999,
            },
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("token encodes")
    }

    #[tokio::test]
    async fn calculate_needs_a_token_when_auth_is_on() {
        let app = super::build_router(super::AuthConfig::hs256("test-secret"));
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/calculate")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{ "amount": "1", "rate": "1" }"#))
                    .expect("request builds"),
            )
            .await
            .expect("infallible service");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn a_valid_token_is_accepted_when_auth_is_on() {
        let app = super::build_router(super::AuthConfig::hs256("test-secret"));
        let token = hs256_token("test-secret");
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/calculate")
                    .header(CONTENT_TYPE, "application/json")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::from(r#"{ "amount": "40000", "rate": "0.5" }"#))
                    .expect("request builds"),
            )
            .await
            .expect("infallible service");
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn health_stays_open_when_auth_is_on() {
        let app = super::build_router(super::AuthConfig::hs256("test-secret"));
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .expect("request builds"),
            )
            .await
            .expect("infallible service");
        assert_eq!(response.status(), StatusCode::OK);
    }

    // --- RS256 / JWKS mode (the real deployment). A fresh RSA keypair is generated at runtime, so
    //     no private key is committed; the JWKS carries the public key, tokens are signed with the
    //     private key. No network — AuthConfig::with_jwks injects the set. ---

    /// Generates a throwaway RSA keypair and returns (signing PEM, JWKS with the public key).
    fn rsa_keypair(kid: &str) -> (String, JwkSet) {
        use base64::Engine;
        use rsa::pkcs8::{EncodePrivateKey, LineEnding};
        use rsa::traits::PublicKeyParts;

        let mut rng = rand::thread_rng();
        let private_key = rsa::RsaPrivateKey::new(&mut rng, 2048).expect("RSA keygen");
        let public_key = private_key.to_public_key();
        let pem = private_key
            .to_pkcs8_pem(LineEnding::LF)
            .expect("PKCS#8 PEM")
            .to_string();
        let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let jwks_json = serde_json::json!({
            "keys": [{
                "kty": "RSA", "use": "sig", "alg": "RS256", "kid": kid,
                "n": b64.encode(public_key.n().to_bytes_be()),
                "e": b64.encode(public_key.e().to_bytes_be()),
            }]
        });
        let jwks = serde_json::from_value(jwks_json).expect("valid JWKS");
        (pem, jwks)
    }

    fn rs256_token(pem: &str, kid: &str) -> String {
        use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
        let key = EncodingKey::from_rsa_pem(pem.as_bytes()).expect("valid RSA PEM");
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(kid.to_owned());
        let claims = serde_json::json!({ "sub": "partners-service", "exp": 9_999_999_999u64 });
        encode(&header, &claims, &key).expect("token encodes")
    }

    async fn post_with_bearer(app: &Router, bearer: Option<&str>) -> StatusCode {
        let mut builder = Request::builder()
            .method("POST")
            .uri("/calculate")
            .header(CONTENT_TYPE, "application/json");
        if let Some(token) = bearer {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        app.clone()
            .oneshot(
                builder
                    .body(Body::from(r#"{ "amount": "40000", "rate": "0.5" }"#))
                    .expect("request builds"),
            )
            .await
            .expect("infallible service")
            .status()
    }

    #[tokio::test]
    async fn rs256_token_matching_the_jwks_is_accepted() {
        let (pem, jwks) = rsa_keypair("test-kid");
        let app = super::build_router(super::AuthConfig::with_jwks(jwks));

        assert_eq!(
            post_with_bearer(&app, Some(&rs256_token(&pem, "test-kid"))).await,
            StatusCode::OK
        );
        assert_eq!(post_with_bearer(&app, None).await, StatusCode::UNAUTHORIZED);
        // A token whose kid is not in the JWKS is rejected.
        assert_eq!(
            post_with_bearer(&app, Some(&rs256_token(&pem, "unknown-kid"))).await,
            StatusCode::UNAUTHORIZED
        );
    }
}
