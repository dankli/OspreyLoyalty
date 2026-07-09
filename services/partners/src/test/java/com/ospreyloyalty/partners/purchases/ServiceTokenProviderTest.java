package com.ospreyloyalty.partners.purchases;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class ServiceTokenProviderTest {

    // A >= 256-bit secret (HS256 requires it) — the same shared key members validates in test.
    private static final String SECRET = "osprey-test-signing-key-long-enough-for-hs256-xx";

    // A Tokens seam that must never be called (HS256 / off paths).
    private static final ServiceTokenProvider.Tokens NEVER =
        (endpoint, id, secret, scope) -> {
            throw new AssertionError("token endpoint must not be called");
        };

    /** Records how often the client-credentials endpoint is hit, to prove caching. */
    private static final class CountingTokens implements ServiceTokenProvider.Tokens {
        int calls;
        private final String token;
        private final long ttlSeconds;

        CountingTokens(String token, long ttlSeconds) {
            this.token = token;
            this.ttlSeconds = ttlSeconds;
        }

        @Override
        public ServiceTokenProvider.Token fetch(String endpoint, String id, String secret, String scope) {
            calls++;
            return new ServiceTokenProvider.Token(token, ttlSeconds);
        }
    }

    private static ServiceTokenProvider provider(
        boolean enabled, String secret, String tokenEndpoint, ServiceTokenProvider.Tokens tokens) {
        return new ServiceTokenProvider(
            enabled, secret, "http://localhost:9000", "osprey-members",
            tokenEndpoint, "partners-service", "partners-secret", tokens);
    }

    @Test
    void mints_nothing_when_auth_is_off() {
        assertThat(provider(false, SECRET, "", NEVER).mint()).isNull();
    }

    @Test
    void mints_nothing_when_neither_endpoint_nor_secret_is_set() {
        assertThat(provider(true, "", "", NEVER).mint()).isNull();
    }

    @Test
    void mints_a_valid_hs256_token_when_only_a_secret_is_set() throws Exception {
        String token = provider(true, SECRET, "", NEVER).mint();

        assertThat(token).isNotNull();
        SignedJWT jwt = SignedJWT.parse(token);
        assertThat(jwt.verify(new MACVerifier(SECRET.getBytes(StandardCharsets.UTF_8)))).isTrue();
        assertThat(jwt.getJWTClaimsSet().getAudience()).containsExactly("osprey-members");
        assertThat(jwt.getJWTClaimsSet().getSubject()).isEqualTo("partners-service");
        assertThat(jwt.getJWTClaimsSet().getStringListClaim("roles")).contains("service");
    }

    @Test
    void fetches_a_client_credentials_token_when_an_endpoint_is_configured() {
        CountingTokens tokens = new CountingTokens("rs256-access-token", 300);

        String token = provider(true, SECRET, "http://security:8080/oauth2/token", tokens).mint();

        assertThat(token).isEqualTo("rs256-access-token"); // endpoint wins over the HS256 secret
        assertThat(tokens.calls).isEqualTo(1);
    }

    @Test
    void caches_the_client_credentials_token_across_calls() {
        CountingTokens tokens = new CountingTokens("rs256-access-token", 300);
        ServiceTokenProvider provider = provider(true, "", "http://security:8080/oauth2/token", tokens);

        provider.mint();
        provider.mint();
        provider.mint();

        assertThat(tokens.calls).isEqualTo(1); // one fetch, then served from cache until near expiry
    }
}
