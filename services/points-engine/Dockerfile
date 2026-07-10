# Pinned to bookworm so the build and runtime stages share a glibc generation.
FROM rust:1-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
# cache the dependency layer: build with a stub main before copying sources
RUN mkdir -p src benches && echo "fn main() {}" > src/main.rs && echo "" > src/lib.rs && echo "fn main() {}" > benches/points.rs \
    && cargo build --release && rm -rf src benches
COPY src ./src
COPY benches ./benches
RUN touch src/main.rs src/lib.rs && cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /src/target/release/osprey-points-engine .
# Run as a non-root user (UID 10001). The statically-laid-out binary is world-executable
# and the service holds no writable state on disk.
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app app
USER app
EXPOSE 8082
ENTRYPOINT ["./osprey-points-engine"]
