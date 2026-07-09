package com.ospreyloyalty.partners.purchases;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Mints the service token partners stamps on each {@link EarnEvent} so members can authenticate the
 * RabbitMQ leg of zero-trust (ADR-0007). Opt-in via {@code osprey.auth.enabled}. Two modes:
 *
 * <ul>
 *   <li><b>Real (RS256):</b> when a token endpoint is configured, fetch a client-credentials token
 *       from the identity service (the {@code partners-service} client) and cache it until it nears
 *       expiry. members validates it via JWKS. This is the production shape.</li>
 *   <li><b>Demo/test (HS256):</b> when only a shared secret is configured, sign an HS256 token with
 *       that secret (the same key members validates in test). No live IdP needed.</li>
 * </ul>
 *
 * Off, or with neither configured, {@code mint()} returns {@code null} and members ignores the field.
 */
@Component
public class ServiceTokenProvider {

    /** Seam over the token endpoint so the client-credentials path is unit-testable without HTTP. */
    public interface Tokens {
        Token fetch(String tokenEndpoint, String clientId, String clientSecret, String scope);
    }

    /** A fetched access token and its lifetime in seconds. */
    public record Token(String accessToken, long expiresInSeconds) {}

    private final boolean enabled;
    private final String secret;
    private final String issuer;
    private final String audience;
    private final String tokenEndpoint;
    private final String clientId;
    private final String clientSecret;
    private final Tokens tokens;

    // Cached client-credentials token; refreshed a little before it expires. Guarded by `this`.
    private String cachedToken;
    private Instant cachedExpiry;

    @Autowired
    public ServiceTokenProvider(
        @Value("${osprey.auth.enabled:false}") boolean enabled,
        @Value("${osprey.auth.service-token.secret:}") String secret,
        @Value("${osprey.auth.service-token.issuer:http://localhost:9000}") String issuer,
        @Value("${osprey.auth.service-token.audience:osprey-members}") String audience,
        @Value("${osprey.auth.service-token.token-endpoint:}") String tokenEndpoint,
        @Value("${osprey.auth.service-token.client-id:partners-service}") String clientId,
        @Value("${osprey.auth.service-token.client-secret:}") String clientSecret,
        Tokens tokens) {
        this.enabled = enabled;
        this.secret = secret;
        this.issuer = issuer;
        this.audience = audience;
        this.tokenEndpoint = tokenEndpoint;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.tokens = tokens;
    }

    /** A token targeting members, or {@code null} when auth is off / nothing is configured. */
    public String mint() {
        if (!enabled) {
            return null;
        }
        if (tokenEndpoint != null && !tokenEndpoint.isBlank()) {
            return clientCredentialsToken();
        }
        if (secret != null && !secret.isBlank()) {
            return hs256Token();
        }
        return null;
    }

    /** Real path: a cached RS256 client-credentials token from the identity service. */
    private synchronized String clientCredentialsToken() {
        // Refresh 30s before expiry so an in-flight publish never carries an about-to-die token.
        if (cachedToken != null && cachedExpiry != null && Instant.now().isBefore(cachedExpiry.minusSeconds(30))) {
            return cachedToken;
        }
        Token token = tokens.fetch(tokenEndpoint, clientId, clientSecret, "member");
        cachedToken = token.accessToken();
        cachedExpiry = Instant.now().plusSeconds(token.expiresInSeconds());
        return cachedToken;
    }

    /** Demo/test path: a locally-signed HS256 token (>= 256-bit secret required). */
    private String hs256Token() {
        try {
            Instant now = Instant.now();
            JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject("partners-service")
                .issuer(issuer)
                .audience(audience)
                .claim("roles", List.of("service"))
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(120))) // short-lived; a redelivery re-mints
                .build();
            SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
            jwt.sign(new MACSigner(secret.getBytes(StandardCharsets.UTF_8)));
            return jwt.serialize();
        } catch (JOSEException ex) {
            throw new IllegalStateException("Unable to mint service token", ex);
        }
    }
}
