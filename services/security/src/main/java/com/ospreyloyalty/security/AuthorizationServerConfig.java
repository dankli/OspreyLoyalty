package com.ospreyloyalty.security;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.oidc.OidcScopes;
import org.springframework.security.oauth2.core.oidc.endpoint.OidcParameterNames;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.authorization.client.InMemoryRegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.config.annotation.web.configuration.OAuth2AuthorizationServerConfiguration;
import org.springframework.security.oauth2.server.authorization.config.annotation.web.configurers.OAuth2AuthorizationServerConfigurer;
import org.springframework.security.oauth2.server.authorization.settings.AuthorizationServerSettings;
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings;
import org.springframework.security.oauth2.server.authorization.settings.TokenSettings;
import org.springframework.security.oauth2.server.authorization.token.JwtEncodingContext;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenCustomizer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.util.matcher.MediaTypeRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * OAuth2/OIDC endpoints, registered clients, the signing key and the token shape.
 * Access tokens carry {@code roles} (from the user's ROLE_* authorities, stripped of
 * the prefix) and an {@code aud} covering every resource server, so one token is
 * accepted fleet-wide under zero-trust.
 */
@Configuration
public class AuthorizationServerConfig {

	@Bean
	@Order(1)
	public SecurityFilterChain authorizationServerSecurityFilterChain(HttpSecurity http) throws Exception {
		OAuth2AuthorizationServerConfigurer authorizationServerConfigurer =
				OAuth2AuthorizationServerConfigurer.authorizationServer();
		http
				.securityMatcher(authorizationServerConfigurer.getEndpointsMatcher())
				// The browser SPAs fetch the discovery document, JWKS and the token endpoint via
				// XHR (oidc-client-ts), so those cross-origin requests need CORS. /oauth2/authorize
				// is a full-page redirect and needs none.
				.cors(Customizer.withDefaults())
				.with(authorizationServerConfigurer, (server) -> server.oidc(Customizer.withDefaults()))
				.authorizeHttpRequests((authorize) -> authorize.anyRequest().authenticated())
				.exceptionHandling((exceptions) -> exceptions.defaultAuthenticationEntryPointFor(
						new LoginUrlAuthenticationEntryPoint("/login"),
						new MediaTypeRequestMatcher(MediaType.TEXT_HTML)));
		return http.build();
	}

	@Bean
	public RegisteredClientRepository registeredClientRepository(
			@Value("${osprey.oidc.member-portal-redirect:http://localhost:5173/callback}") String memberRedirect,
			@Value("${osprey.oidc.admin-portal-redirect:http://localhost:5174/callback}") String adminRedirect,
			@Value("${osprey.oidc.shell-redirect:http://localhost:5170/callback}") String shellRedirect,
			@Value("${osprey.oidc.member-portal-post-logout:http://localhost:5173}") String memberPostLogout,
			@Value("${osprey.oidc.admin-portal-post-logout:http://localhost:5174}") String adminPostLogout,
			@Value("${osprey.oidc.shell-post-logout:http://localhost:5170}") String shellPostLogout,
			@Value("${osprey.oidc.partners-secret:{noop}partners-secret}") String partnersSecret) {

		TokenSettings tokenSettings = TokenSettings.builder()
				.accessTokenTimeToLive(Duration.ofMinutes(30))
				.refreshTokenTimeToLive(Duration.ofHours(8))
				.build();

		ClientSettings publicPkce = ClientSettings.builder()
				.requireAuthorizationConsent(false)
				.requireProofKey(true)
				.build();

		// Browser SPAs: public clients, authorization code + PKCE, no secret.
		RegisteredClient memberPortal = RegisteredClient.withId(UUID.randomUUID().toString())
				.clientId("member-portal")
				.clientAuthenticationMethod(ClientAuthenticationMethod.NONE)
				.authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
				.authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
				.redirectUri(memberRedirect)
				.redirectUri(shellRedirect)
				.postLogoutRedirectUri(memberPostLogout)
				.postLogoutRedirectUri(shellPostLogout)
				.scope(OidcScopes.OPENID)
				.scope(OidcScopes.PROFILE)
				.scope("member")
				.clientSettings(publicPkce)
				.tokenSettings(tokenSettings)
				.build();

		RegisteredClient adminPortal = RegisteredClient.withId(UUID.randomUUID().toString())
				.clientId("admin-portal")
				.clientAuthenticationMethod(ClientAuthenticationMethod.NONE)
				.authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
				.authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
				.redirectUri(adminRedirect)
				.redirectUri(shellRedirect)
				.postLogoutRedirectUri(adminPostLogout)
				.postLogoutRedirectUri(shellPostLogout)
				.scope(OidcScopes.OPENID)
				.scope(OidcScopes.PROFILE)
				.scope("member")
				.scope("admin")
				.clientSettings(publicPkce)
				.tokenSettings(tokenSettings)
				.build();

		// Service-to-service (the partners -> members RabbitMQ hop): confidential
		// client, client-credentials grant.
		RegisteredClient partnersService = RegisteredClient.withId(UUID.randomUUID().toString())
				.clientId("partners-service")
				.clientSecret(partnersSecret)
				.clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
				.authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
				.scope("member")
				.tokenSettings(tokenSettings)
				.build();

		return new InMemoryRegisteredClientRepository(memberPortal, adminPortal, partnersService);
	}

	@Bean
	public OAuth2TokenCustomizer<JwtEncodingContext> tokenCustomizer() {
		return (context) -> {
			boolean accessToken = OAuth2TokenType.ACCESS_TOKEN.equals(context.getTokenType());
			boolean idToken = OidcParameterNames.ID_TOKEN.equals(context.getTokenType().getValue());
			if (accessToken || idToken) {
				List<String> roles = context.getPrincipal().getAuthorities().stream()
						.map(GrantedAuthority::getAuthority)
						.filter((authority) -> authority.startsWith("ROLE_"))
						// Lower-case so the claim is ["admin","member"] — what the resource servers and the
						// portals check for literally (partners upper-cases them back to ROLE_* on its side).
						.map((authority) -> authority.substring("ROLE_".length()).toLowerCase(java.util.Locale.ROOT))
						.toList();
				// Roles ride on BOTH tokens: the access token for the resource servers' zero-trust checks,
				// and the id token so the SPA — which reads id-token claims via oidc-client-ts (user.profile)
				// — can gate the admin UI. The resource-server audience belongs only on the access token;
				// the id token's audience is the client id.
				context.getClaims().claim("roles", roles);
				if (accessToken) {
					context.getClaims().audience(
							List.of("osprey-members", "osprey-partners", "osprey-gateway", "osprey-points-engine"));
				}
			}
		};
	}

	@Bean
	public JWKSource<SecurityContext> jwkSource() {
		KeyPair keyPair = generateRsaKey();
		RSAPublicKey publicKey = (RSAPublicKey) keyPair.getPublic();
		RSAPrivateKey privateKey = (RSAPrivateKey) keyPair.getPrivate();
		RSAKey rsaKey = new RSAKey.Builder(publicKey)
				.privateKey(privateKey)
				.keyID(UUID.randomUUID().toString())
				.build();
		return new ImmutableJWKSet<>(new JWKSet(rsaKey));
	}

	private static KeyPair generateRsaKey() {
		try {
			KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
			generator.initialize(2048);
			return generator.generateKeyPair();
		} catch (Exception ex) {
			throw new IllegalStateException("Unable to generate RSA signing key", ex);
		}
	}

	@Bean
	public JwtDecoder jwtDecoder(JWKSource<SecurityContext> jwkSource) {
		return OAuth2AuthorizationServerConfiguration.jwtDecoder(jwkSource);
	}

	@Bean
	public AuthorizationServerSettings authorizationServerSettings(
			@Value("${osprey.oidc.issuer:http://localhost:9000}") String issuer) {
		return AuthorizationServerSettings.builder().issuer(issuer).build();
	}

	/** Allows the browser SPAs (shell + both portals) to reach the OIDC endpoints via XHR. */
	@Bean
	public CorsConfigurationSource corsConfigurationSource(
			@Value("${osprey.cors.allowed-origins:http://localhost:5170,http://localhost:5173,http://localhost:5174}")
			String allowedOrigins) {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
		config.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
		config.setAllowedHeaders(List.of("*"));
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
