package com.ospreyloyalty.partners.purchases;

import java.time.Duration;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Production {@link ServiceTokenProvider.Tokens}: a client-credentials POST to the identity
 * service's token endpoint, Basic-authenticated with the {@code partners-service} client. Bounded
 * connect/read timeouts (2s) so a slow or down IdP fails a purchase fast rather than hanging it.
 */
@Component
class RestClientTokens implements ServiceTokenProvider.Tokens {

    private final RestClient http;

    RestClientTokens(RestClient.Builder builder) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(2));
        this.http = builder.requestFactory(factory).build();
    }

    @Override
    public ServiceTokenProvider.Token fetch(String tokenEndpoint, String clientId, String clientSecret, String scope) {
        Map<?, ?> response = http.post()
            .uri(tokenEndpoint)
            .headers((headers) -> headers.setBasicAuth(clientId, clientSecret))
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body("grant_type=client_credentials&scope=" + scope)
            .retrieve()
            .body(Map.class);
        if (response == null || response.get("access_token") == null) {
            throw new IllegalStateException("Token endpoint returned no access_token");
        }
        long expiresIn = response.get("expires_in") instanceof Number number ? number.longValue() : 300L;
        return new ServiceTokenProvider.Token(response.get("access_token").toString(), expiresIn);
    }
}
