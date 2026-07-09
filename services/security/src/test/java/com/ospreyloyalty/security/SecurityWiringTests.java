package com.ospreyloyalty.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Security wiring from {@link DefaultSecurityConfig} and the authorization-server chain.
 * Confirms that operational/error paths stay open, and that a protected authorization-server
 * endpoint requested as HTML redirects an unauthenticated user to the custom /login page
 * (rather than 401 or a whitelabel 404). JWKS + openid-configuration are covered elsewhere.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SecurityWiringTests {

	@Autowired
	MockMvc mvc;

	@Test
	void actuator_health_is_reachable_without_authentication() throws Exception {
		mvc.perform(get("/actuator/health"))
			.andExpect(status().isOk());
	}

	@Test
	void the_error_path_is_permitted_and_not_redirected_to_login() throws Exception {
		// A stray path forwards to /error; it must resolve there, never bounce to /login.
		mvc.perform(get("/error"))
			.andExpect(status().is(org.hamcrest.Matchers.not(302)));
	}

	@Test
	void the_devtools_appspecific_probe_is_permitted_and_not_redirected_to_login() throws Exception {
		var result = mvc.perform(get("/.well-known/appspecific/com.chrome.devtools.json")).andReturn();
		// Permitted: it is handled (404 for the missing resource), not a 302 to /login.
		assertThat(result.getResponse().getStatus()).isNotEqualTo(302);
	}

	@Test
	void an_unauthenticated_html_request_to_a_protected_endpoint_redirects_to_the_login_page() throws Exception {
		// A browser (Accept: text/html) hitting a protected authorization-server endpoint with no
		// session is bounced to the custom /login page by the LoginUrlAuthenticationEntryPoint,
		// so the form-login flow can establish a session. /userinfo requires an authenticated user.
		mvc.perform(get("/userinfo")
				.header(HttpHeaders.ACCEPT, MediaType.TEXT_HTML_VALUE))
			.andExpect(status().is3xxRedirection())
			.andExpect(header().string(HttpHeaders.LOCATION, org.hamcrest.Matchers.containsString("/login")));
	}
}
