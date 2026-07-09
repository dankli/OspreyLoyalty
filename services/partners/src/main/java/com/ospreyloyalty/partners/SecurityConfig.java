package com.ospreyloyalty.partners;

import java.util.Collection;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.config.Customizer;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Zero-trust JWT validation, opt-in via {@code osprey.auth.enabled} so the existing
 * tests and local dev stay open while compose/prod turn it on. When on, every request
 * needs a valid token and changing a partner rate needs the ADMIN role. JWKS is fetched
 * from the identity service (jwk-set-uri); the {@code roles} claim maps to ROLE_*.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

	@Bean
	public SecurityFilterChain filterChain(HttpSecurity http,
			@Value("${osprey.auth.enabled:false}") boolean authEnabled) throws Exception {
		// CORS must live in the security chain: its CorsFilter runs before authentication and answers
		// the (credential-less) OPTIONS preflight, which anyRequest().authenticated() would otherwise
		// reject with a 401 that carries no CORS headers (the admin portal calls this API cross-origin).
		http.csrf((csrf) -> csrf.disable())
				.cors(Customizer.withDefaults());
		if (authEnabled) {
			http.authorizeHttpRequests((authorize) -> authorize
							.requestMatchers("/health", "/actuator/**").permitAll()
							.requestMatchers(HttpMethod.PUT, "/partners/*/rate").hasRole("ADMIN")
							.anyRequest().authenticated())
					.oauth2ResourceServer((oauth2) -> oauth2
							.jwt((jwt) -> jwt.jwtAuthenticationConverter(rolesConverter())));
		} else {
			http.authorizeHttpRequests((authorize) -> authorize.anyRequest().permitAll());
		}
		return http.build();
	}

	/** Wide-open CORS for the demo (the admin portal calls this API directly from the browser). */
	@Bean
	CorsConfigurationSource corsConfigurationSource() {
		CorsConfiguration config = new CorsConfiguration();
		// setAllowedOrigins("*") — not setAllowedOriginPatterns — so the response header is a literal
		// "*" rather than the reflected request origin. Credentials are off, so "*" is valid, and it
		// preserves the original CorsConfig's wide-open semantics the admin portal relies on.
		config.setAllowedOrigins(List.of("*"));
		config.setAllowedMethods(List.of("*"));
		config.setAllowedHeaders(List.of("*"));
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", config);
		return source;
	}

	private static JwtAuthenticationConverter rolesConverter() {
		JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
		converter.setJwtGrantedAuthoritiesConverter((jwt) -> {
			Object roles = jwt.getClaim("roles");
			if (roles instanceof Collection<?> collection) {
				return collection.stream()
						.map(Object::toString)
						.map((role) -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()))
						.toList();
			}
			return List.of();
		});
		return converter;
	}
}
