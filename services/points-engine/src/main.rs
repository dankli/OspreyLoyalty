//! Points-engine service binary: JSON tracing + axum server on `PORT` (default 8082).

mod api;

use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    // Missing PORT defaults to 8082; a PRESENT but unparsable value is a config
    // error and must fail loudly — no silent fallbacks.
    let port: u16 = match std::env::var("PORT") {
        Ok(value) => value
            .parse()
            .unwrap_or_else(|_| panic!("PORT is set but not a valid port number: {value:?}")),
        Err(_) => 8082,
    };
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|err| panic!("failed to bind {addr}: {err}"));
    tracing::info!(%addr, "points-engine listening");
    axum::serve(listener, api::router())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

/// Drain in-flight requests on SIGINT/SIGTERM instead of dropping them mid-response.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = sigterm.recv() => {},
        }
    }
    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c().await.ok();
    }
}
