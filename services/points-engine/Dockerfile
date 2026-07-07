FROM rust:1-slim AS build
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
EXPOSE 8082
ENTRYPOINT ["./osprey-points-engine"]
