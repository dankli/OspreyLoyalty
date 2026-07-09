package com.ospreyloyalty.security;

import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.oidc.OidcScopes;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Asserts the registered-client configuration by inspecting the real
 * {@link RegisteredClientRepository} bean. Clients are looked up by {@code clientId}
 * (never by the random UUID {@code id}). This proves the security posture that the
 * rest of the fleet depends on: the browser SPAs are public PKCE clients and the
 * partners service is a confidential client-credentials client.
 */
@SpringBootTest
class RegisteredClientsTests {

	@Autowired
	RegisteredClientRepository clients;

	@Test
	void member_portal_is_a_public_pkce_authorization_code_client() {
		RegisteredClient c = clients.findByClientId("member-portal");
		assertThat(c).isNotNull();

		assertThat(c.getClientAuthenticationMethods()).containsExactly(ClientAuthenticationMethod.NONE);
		assertThat(c.getClientSettings().isRequireProofKey()).isTrue();
		assertThat(c.getAuthorizationGrantTypes())
				.containsExactlyInAnyOrder(AuthorizationGrantType.AUTHORIZATION_CODE, AuthorizationGrantType.REFRESH_TOKEN);
		assertThat(c.getScopes()).containsExactlyInAnyOrder(OidcScopes.OPENID, OidcScopes.PROFILE, "member");
		assertThat(c.getScopes()).doesNotContain("admin");
	}

	@Test
	void admin_portal_is_a_public_pkce_client_that_additionally_holds_the_admin_scope() {
		RegisteredClient c = clients.findByClientId("admin-portal");
		assertThat(c).isNotNull();

		assertThat(c.getClientAuthenticationMethods()).containsExactly(ClientAuthenticationMethod.NONE);
		assertThat(c.getClientSettings().isRequireProofKey()).isTrue();
		assertThat(c.getAuthorizationGrantTypes())
				.containsExactlyInAnyOrder(AuthorizationGrantType.AUTHORIZATION_CODE, AuthorizationGrantType.REFRESH_TOKEN);
		assertThat(c.getScopes()).containsExactlyInAnyOrder(OidcScopes.OPENID, OidcScopes.PROFILE, "member", "admin");
	}

	@Test
	void partners_service_is_a_confidential_client_credentials_client() {
		RegisteredClient c = clients.findByClientId("partners-service");
		assertThat(c).isNotNull();

		assertThat(c.getClientAuthenticationMethods()).containsExactly(ClientAuthenticationMethod.CLIENT_SECRET_BASIC);
		assertThat(c.getAuthorizationGrantTypes()).containsExactly(AuthorizationGrantType.CLIENT_CREDENTIALS);
		assertThat(c.getScopes()).containsExactly("member");
		// No PKCE and no authorization-code grant on a machine client.
		assertThat(c.getClientSettings().isRequireProofKey()).isFalse();
		assertThat(c.getAuthorizationGrantTypes()).doesNotContain(AuthorizationGrantType.AUTHORIZATION_CODE);
	}

	@Test
	void only_the_partners_service_can_use_client_credentials() {
		assertThat(grantsFor("member-portal")).doesNotContain(AuthorizationGrantType.CLIENT_CREDENTIALS);
		assertThat(grantsFor("admin-portal")).doesNotContain(AuthorizationGrantType.CLIENT_CREDENTIALS);
		assertThat(grantsFor("partners-service")).contains(AuthorizationGrantType.CLIENT_CREDENTIALS);
	}

	private Set<AuthorizationGrantType> grantsFor(String clientId) {
		RegisteredClient c = clients.findByClientId(clientId);
		assertThat(c).as("client %s should be registered", clientId).isNotNull();
		return c.getAuthorizationGrantTypes();
	}
}
