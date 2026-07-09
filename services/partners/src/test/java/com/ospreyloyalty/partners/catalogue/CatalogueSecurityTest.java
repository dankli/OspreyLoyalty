package com.ospreyloyalty.partners.catalogue;

import com.ospreyloyalty.partners.SecurityConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Zero-trust behaviour with {@code osprey.auth.enabled=true}. Uses the spring-security-test
 * {@code jwt()} post-processor, so no live identity service or real token is needed — the
 * JwtDecoder is mocked and authorities are supplied directly.
 */
@WebMvcTest(CatalogueController.class)
@Import(SecurityConfig.class)
@TestPropertySource(properties = "osprey.auth.enabled=true")
class CatalogueSecurityTest {

	@Autowired
	MockMvc mvc;

	@MockitoBean
	JwtDecoder jwtDecoder; // the resource-server chain needs the bean; jwt() bypasses decoding

	@BeforeEach
	void resetRates() {
		PartnerCatalogue.reset();
	}

	@Test
	void an_unauthenticated_request_is_401() throws Exception {
		mvc.perform(get("/partners")).andExpect(status().isUnauthorized());
	}

	@Test
	void an_authenticated_member_can_read_but_not_change_rates() throws Exception {
		mvc.perform(get("/partners").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_MEMBER"))))
			.andExpect(status().isOk());
		mvc.perform(put("/partners/cardco/rate")
				.with(jwt().authorities(new SimpleGrantedAuthority("ROLE_MEMBER")))
				.contentType(APPLICATION_JSON).content("{\"rate\":0.8}"))
			.andExpect(status().isForbidden());
	}

	@Test
	void an_admin_can_change_rates() throws Exception {
		mvc.perform(put("/partners/cardco/rate")
				.with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
				.contentType(APPLICATION_JSON).content("{\"rate\":0.8}"))
			.andExpect(status().isOk());
	}
}
