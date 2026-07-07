//! HTTP API for the points engine.
//!
//! One POST endpoint over the pure [`osprey_points_engine::points`] core,
//! plus `/health` and fleet-standard `X-Correlation-Id` handling.

use std::time::Instant;

use axum::Router;
use axum::body::Body;
use axum::extract::Json;
use axum::extract::rejection::JsonRejection;
use axum::http::{HeaderValue, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use osprey_points_engine::{Promotion, points};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::json;

const CORRELATION_HEADER: &str = "x-correlation-id";

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

/// Builds the points-engine router: `POST /calculate`, `GET /health`,
/// and correlation-id middleware around everything.
pub fn router() -> Router {
    Router::new()
        .route("/calculate", post(calculate))
        .route("/health", get(health))
        .layer(middleware::from_fn(correlation))
}

/// `POST /calculate` — 200 `{"points": n}` on success; 400 `{"error": msg}`
/// for malformed JSON or a [`osprey_points_engine::CalcError`].
async fn calculate(payload: Result<Json<CalculateRequest>, JsonRejection>) -> Response {
    let Json(request) = match payload {
        Ok(json) => json,
        Err(rejection) => return error_response(rejection.body_text()),
    };
    match points(request.amount, request.rate, &request.promotions) {
        Ok(points) => (StatusCode::OK, Json(json!({ "points": points }))).into_response(),
        Err(err) => error_response(err.to_string()),
    }
}

fn error_response(message: String) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": message }))).into_response()
}

/// `GET /health` — liveness probe.
async fn health() -> Response {
    (StatusCode::OK, Json(json!({ "status": "ok" }))).into_response()
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

    tracing::info!(
        method = %method,
        path = %path,
        status = response.status().as_u16(),
        duration_ms = started.elapsed().as_secs_f64() * 1000.0,
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
    use axum::body::Body;
    use axum::http::{Request, StatusCode, header::CONTENT_TYPE};
    use http_body_util::BodyExt;
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
}
