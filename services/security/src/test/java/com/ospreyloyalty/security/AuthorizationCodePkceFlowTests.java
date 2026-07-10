package com.ospreyloyalty.security;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriComponentsBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Drives the full authorization-code + PKCE flow for the public {@code member-portal} SPA
 * client end to end through the real endpoints — {@code /oauth2/authorize} then
 * {@code /oauth2/token} — with no mocks. The end user is supplied by an authenticated
 * principal (as the browser would after form login), a real {@code code_challenge}/
 * {@code code_verifier} pair is generated, and the returned code is redeemed for a signed
 * access token that is verified against the live JWKS via the server's own decoder.
 *
 * <p>Also asserts that PKCE is actually enforced: the same code cannot be redeemed with a
 * wrong {@code code_verifier}, and a public client cannot start the flow without a
 * {@code code_challenge} at all.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AuthorizationCodePkceFlowTests {

	@Autowired
	MockMvc mvc;

	@Autowired
	JwtDecoder jwtDecoder; // the server's own decoder, wired to the live JWKS

	private final ObjectMapper json = new ObjectMapper();

	// A fixed, high-entropy PKCE verifier and its S256 challenge (RFC 7636).
	private static final String CODE_VERIFIER =
			"osprey-test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz-ABC";
	private static final String CODE_CHALLENGE = s256(CODE_VERIFIER);

	@Test
	void member_portal_completes_authorization_code_pkce_and_receives_a_signed_access_token() throws Exception {
		String code = authorize(CODE_CHALLENGE);

		MvcResult tokenResult = mvc.perform(post("/oauth2/token")
				.param("grant_type", "authorization_code")
				.param("code", code)
				.param("client_id", "member-portal")
				.param("redirect_uri", "http://localhost:5173/callback")
				.param("code_verifier", CODE_VERIFIER))
			.andExpect(status().isOk())
			.andReturn();

		JsonNode body = json.readTree(tokenResult.getResponse().getContentAsString());
		assertThat(body.get("token_type").asText()).isEqualTo("Bearer");
		String accessToken = body.get("access_token").asText();

		// It verifies against the server's live JWKS (signature + issuer + exp) via the app's own
		// decoder, carries the member id as the subject and the fleet-wide resource audience, and
		// surfaces the demo user's MEMBER role as the lowercase "member" role claim.
		Jwt decoded = jwtDecoder.decode(accessToken);
		assertThat(decoded.getSubject()).isEqualTo("demo-ada");
		assertThat(decoded.getIssuer().toString()).isEqualTo("http://localhost:9000");
		assertThat(decoded.getAudience())
				.containsExactlyInAnyOrder(
						"osprey-members", "osprey-partners", "osprey-gateway", "osprey-points-engine");
		assertThat(decoded.getClaimAsStringList("roles")).containsExactly("member");

		// The id token is minted alongside the access token for the OIDC flow.
		assertThat(body.hasNonNull("id_token")).isTrue();
	}

	@Test
	void redeeming_the_code_with_a_wrong_code_verifier_is_rejected() throws Exception {
		String code = authorize(CODE_CHALLENGE);

		mvc.perform(post("/oauth2/token")
				.param("grant_type", "authorization_code")
				.param("code", code)
				.param("client_id", "member-portal")
				.param("redirect_uri", "http://localhost:5173/callback")
				.param("code_verifier", "the-wrong-verifier-that-does-not-match-the-challenge-xyz"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void the_authorize_endpoint_rejects_a_public_client_without_pkce() throws Exception {
		// requireProofKey(true) on the public client means the authorization request must carry a
		// code_challenge. Without one the server refuses to issue a code (it redirects back to the
		// client's redirect_uri with an error= instead of a code=).
		MvcResult result = mvc.perform(get("/oauth2/authorize")
				.queryParam("response_type", "code")
				.queryParam("client_id", "member-portal")
				.queryParam("redirect_uri", "http://localhost:5173/callback")
				.queryParam("scope", "openid member")
				.with(user("demo-ada").roles("MEMBER")))
			.andReturn();

		String location = result.getResponse().getHeader("Location");
		assertThat(location).as("authorize should redirect somewhere").isNotNull();
		assertThat(location).doesNotContain("code=");
		assertThat(location).contains("error=");
	}

	/**
	 * Performs the {@code /oauth2/authorize} leg with an authenticated member and the given PKCE
	 * challenge, then extracts the authorization {@code code} from the redirect back to the SPA.
	 */
	private String authorize(String codeChallenge) throws Exception {
		MvcResult authResult = mvc.perform(get("/oauth2/authorize")
				.queryParam("response_type", "code")
				.queryParam("client_id", "member-portal")
				.queryParam("redirect_uri", "http://localhost:5173/callback")
				.queryParam("scope", "openid member")
				.queryParam("code_challenge", codeChallenge)
				.queryParam("code_challenge_method", "S256")
				.with(user("demo-ada").roles("MEMBER")))
			.andExpect(status().is3xxRedirection())
			.andReturn();

		String location = authResult.getResponse().getHeader("Location");
		assertThat(location).as("authorize should redirect back to the SPA with a code").isNotNull();
		assertThat(location).startsWith("http://localhost:5173/callback");

		URI redirect = UriComponentsBuilder.fromUriString(location).build().toUri();
		String code = UriComponentsBuilder.fromUri(redirect).build()
				.getQueryParams().getFirst("code");
		assertThat(code).as("redirect %s should carry an authorization code", location).isNotBlank();
		return code;
	}

	private static String s256(String verifier) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
					.digest(verifier.getBytes(StandardCharsets.US_ASCII));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
		}
		catch (Exception ex) {
			throw new IllegalStateException("Unable to compute S256 code challenge", ex);
		}
	}
}
