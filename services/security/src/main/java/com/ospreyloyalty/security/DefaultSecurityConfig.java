package com.ospreyloyalty.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

/**
 * The form-login chain that authenticates end users before the authorization-code
 * flow issues a token. Demo users only; {@code demo-ada/erik/yusra} mirror the seeded
 * members (so the JWT {@code sub} is the member id) and {@code admin} carries ADMIN.
 */
@Configuration
@EnableWebSecurity
public class DefaultSecurityConfig {

	@Bean
	@Order(2)
	public SecurityFilterChain defaultSecurityFilterChain(HttpSecurity http,
			@Value("${osprey.app-url:http://localhost:5170}") String appUrl) throws Exception {
		http
				.authorizeHttpRequests((authorize) -> authorize
						.requestMatchers("/actuator/**", "/health").permitAll()
						// A 404 (e.g. Chrome's background /.well-known/appspecific DevTools probe, or any
						// stray path) forwards to /error. If /error isn't permitted, that ERROR dispatch is
						// itself denied → redirect to /login AND the stray URL gets saved as the post-login
						// target, so login lands on a 404 whitelabel instead of resuming the OAuth flow.
						// Permitting both keeps 404s as clean 404s and never pollutes the saved request.
						.requestMatchers("/error", "/.well-known/appspecific/**").permitAll()
						.anyRequest().authenticated())
				// In the OIDC flow the saved /oauth2/authorize request is resumed after login. Only a
				// direct visit to /login has no saved request — send that to the app (which then logs
				// in silently via the now-established session) instead of a dead-end 404 on "/".
				.formLogin((form) -> form.loginPage("/login").defaultSuccessUrl(appUrl, false).permitAll());
		return http.build();
	}

	@Bean
	public UserDetailsService userDetailsService() {
		UserDetails ada = User.withUsername("demo-ada").password("{noop}password").roles("MEMBER").build();
		UserDetails erik = User.withUsername("demo-erik").password("{noop}password").roles("MEMBER").build();
		UserDetails yusra = User.withUsername("demo-yusra").password("{noop}password").roles("MEMBER").build();
		UserDetails admin = User.withUsername("admin").password("{noop}admin").roles("ADMIN", "MEMBER").build();
		return new InMemoryUserDetailsManager(ada, erik, yusra, admin);
	}
}
