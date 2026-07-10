FROM maven:3-eclipse-temurin-26 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /src/target/*.jar app.jar
# Run as a non-root user (UID 10001 — avoids the base image's existing uid 1000 `ubuntu`).
# The jar is world-readable; the JVM only needs a writable /tmp, which the k8s manifest
# supplies as an emptyDir under readOnlyRootFilesystem.
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app app
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
