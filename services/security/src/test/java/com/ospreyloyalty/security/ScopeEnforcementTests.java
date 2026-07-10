package com.ospreyloyalty.security;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Proves scope enforcement at the token endpoint: a client only ever receives scopes it is
 * registered for. The confidential {@code partners-service} is registered for exactly the
 * {@code member} scope, so it gets {@code member} and nothing else — and asking for a scope it
 * is not registered for ({@code admin}) is refused with {@code invalid_scope}, never silently
 * upgraded. This runs the real {@code /oauth2/token} path with no mocks.
 *
 * <p>The complementary check — that a member-scoped token is <em>rejected</em> when it reaches an
 * admin-only resource — is resource-server enforcement and lives in {@code services/members}
 * (the JWT resource server that reads the {@code scope}/{@code roles} claims). It is out of scope
 * for the identity service, which is only responsible for issuing correctly-scoped tokens.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ScopeEnforcementTests {

	private static final String PARTNERS_BASIC =
			"Basic " + java.util.Base64.getEncoder()
					.encodeToString("partners-service:partners-secret".getBytes());

	@Autowired
	MockMvc mvc;

	@Autowired
	JwtDecoder jwtDecoder; // the server's own decoder, wired to the live JWKS

	private final ObjectMapper json = new ObjectMapper();

	@Test
	void a_client_credentials_token_carries_exactly_the_registered_scope() throws Exception {
		MvcResult result = mvc.perform(post("/oauth2/token")
				.header("Authorization", PARTNERS_BASIC)
				.param("grant_type", "client_credentials")
				.param("scope", "member"))
			.andExpect(status().isOk())
			// The token response echoes the granted scope, and it is exactly "member".
			.andExpect(jsonPath("$.scope").value("member"))
			.andReturn();

		// And the claim baked into the signed JWT agrees: exactly ["member"], nothing more.
		String accessToken = json.readTree(result.getResponse().getContentAsString())
				.get("access_token").asText();
		Jwt decoded = jwtDecoder.decode(accessToken);
		assertThat(decoded.getClaimAsStringList("scope")).containsExactly("member");
	}

	@Test
	void requesting_a_scope_the_client_is_not_registered_for_is_rejected() throws Exception {
		// partners-service is registered for "member" only. Asking for "admin" must be refused
		// with the OAuth2 invalid_scope error — the server must never mint an admin-scoped token
		// for a client that has no claim to it.
		mvc.perform(post("/oauth2/token")
				.header("Authorization", PARTNERS_BASIC)
				.param("grant_type", "client_credentials")
				.param("scope", "admin"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("invalid_scope"));
	}

	@Test
	void a_public_client_cannot_request_a_scope_it_is_not_registered_for() throws Exception {
		// Scope enforcement is not specific to the machine client: the member-portal SPA is
		// registered for openid/profile/member but NOT admin. Starting the authorization-code flow
		// with scope=admin must not yield a code — the server bounces back to the redirect_uri with
		// error=invalid_scope, so the SPA can never obtain an admin-scoped token it has no claim to.
		MvcResult result = mvc.perform(get("/oauth2/authorize")
				.queryParam("response_type", "code")
				.queryParam("client_id", "member-portal")
				.queryParam("redirect_uri", "http://localhost:5173/callback")
				.queryParam("scope", "openid admin")
				.queryParam("code_challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
				.queryParam("code_challenge_method", "S256")
				.with(user("demo-ada").roles("MEMBER")))
			.andReturn();

		String location = result.getResponse().getHeader("Location");
		assertThat(location).as("authorize should redirect back to the SPA").isNotNull();
		assertThat(location).startsWith("http://localhost:5173/callback");
		assertThat(location).doesNotContain("code=");
		assertThat(location).contains("error=invalid_scope");
	}
}
