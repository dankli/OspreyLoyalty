package com.ospreyloyalty.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jwt.SignedJWT;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The crown jewel: exercise the real {@code /oauth2/token} endpoint end to end for the
 * {@code client_credentials} grant. This drives the {@code RegisteredClientRepository},
 * the {@code tokenCustomizer}, the {@code jwkSource} signing key and the {@code JwtDecoder}
 * through the actual HTTP call path — no mocks. The wire secret is {@code partners-secret}
 * (the {@code {noop}} prefix is only the storage encoding).
 */
@SpringBootTest
@AutoConfigureMockMvc
class TokenIssuanceTests {

	private static final String PARTNERS_BASIC =
			"Basic " + java.util.Base64.getEncoder()
					.encodeToString("partners-service:partners-secret".getBytes());

	@Autowired
	MockMvc mvc;

	@Autowired
	JwtDecoder jwtDecoder; // the server's own decoder, wired to the live JWKS

	private final ObjectMapper json = new ObjectMapper();

	@Test
	void client_credentials_issues_an_access_token_for_the_partners_service() throws Exception {
		mvc.perform(post("/oauth2/token")
				.header("Authorization", PARTNERS_BASIC)
				.param("grant_type", "client_credentials")
				.param("scope", "member"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.access_token").exists())
			.andExpect(jsonPath("$.token_type").value("Bearer"));
	}

	@Test
	void the_issued_access_token_carries_the_fleet_wide_audience_and_verifies_against_jwks() throws Exception {
		String accessToken = obtainAccessToken();

		// (1) It is a real, well-formed JWT.
		SignedJWT parsed = SignedJWT.parse(accessToken);
		assertThat(parsed.getJWTClaimsSet().getAudience())
				.containsExactlyInAnyOrder(
						"osprey-members", "osprey-partners", "osprey-gateway", "osprey-points-engine");

		// (2) It verifies against the server's live JWKS via the app's own decoder
		//     (signature + issuer + exp all validated here — throws if any fail).
		Jwt decoded = jwtDecoder.decode(accessToken);
		assertThat(decoded.getAudience())
				.containsExactlyInAnyOrder(
						"osprey-members", "osprey-partners", "osprey-gateway", "osprey-points-engine");
		assertThat(decoded.getIssuer().toString()).isEqualTo("http://localhost:9000");
	}

	@Test
	void a_client_credentials_token_has_no_user_roles() throws Exception {
		// No user principal in client_credentials, so the roles claim (if present) must be empty.
		Jwt decoded = jwtDecoder.decode(obtainAccessToken());
		java.util.List<String> roles = decoded.getClaimAsStringList("roles");
		assertThat(roles == null || roles.isEmpty())
				.as("client_credentials token should carry no user roles, was %s", roles)
				.isTrue();
	}

	@Test
	void the_token_endpoint_rejects_a_wrong_client_secret() throws Exception {
		String badBasic = "Basic " + java.util.Base64.getEncoder()
				.encodeToString("partners-service:not-the-secret".getBytes());

		mvc.perform(post("/oauth2/token")
				.header("Authorization", badBasic)
				.param("grant_type", "client_credentials")
				.param("scope", "member"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void the_token_endpoint_rejects_a_missing_client_credential() throws Exception {
		// With no client authentication the request is anonymous: the server refuses to issue
		// a token. It does not return 200 and no access_token is minted. (The exact rejection is
		// a redirect to the login entry point rather than a bare 401, but either way: not issued.)
		MvcResult result = mvc.perform(post("/oauth2/token")
				.param("grant_type", "client_credentials")
				.param("scope", "member"))
			.andReturn();

		int status = result.getResponse().getStatus();
		assertThat(status).isNotEqualTo(200);
		assertThat(result.getResponse().getContentAsString()).doesNotContain("access_token");
	}

	private String obtainAccessToken() throws Exception {
		MvcResult result = mvc.perform(post("/oauth2/token")
				.header("Authorization", PARTNERS_BASIC)
				.param("grant_type", "client_credentials")
				.param("scope", "member"))
			.andExpect(status().isOk())
			.andReturn();
		JsonNode body = json.readTree(result.getResponse().getContentAsString());
		return body.get("access_token").asText();
	}
}
