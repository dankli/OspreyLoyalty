package com.ospreyloyalty.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The custom {@link LoginController} page. Rendered by MockMvc through the real
 * security chain (the page is permitted, so no redirect). Asserts the CSRF field,
 * the demo-user buttons, and the error/logout notices.
 */
@SpringBootTest
@AutoConfigureMockMvc
class LoginControllerTests {

	@Autowired
	MockMvc mvc;

	@Test
	void the_login_page_renders_with_a_csrf_field_and_the_demo_users() throws Exception {
		mvc.perform(get("/login"))
			.andExpect(status().isOk())
			// CSRF hidden field is present (Spring's default parameter name).
			.andExpect(content().string(org.hamcrest.Matchers.containsString("name=\"_csrf\"")))
			.andExpect(content().string(org.hamcrest.Matchers.containsString("type=\"hidden\"")))
			// All four demo users are listed on the form.
			.andExpect(content().string(org.hamcrest.Matchers.containsString("demo-ada")))
			.andExpect(content().string(org.hamcrest.Matchers.containsString("demo-erik")))
			.andExpect(content().string(org.hamcrest.Matchers.containsString("demo-yusra")))
			.andExpect(content().string(org.hamcrest.Matchers.containsString("admin")))
			// No error/logout notice on a plain load.
			.andExpect(content().string(org.hamcrest.Matchers.not(
					org.hamcrest.Matchers.containsString("Invalid username or password."))))
			.andExpect(content().string(org.hamcrest.Matchers.not(
					org.hamcrest.Matchers.containsString("You have been signed out."))));
	}

	@Test
	void the_login_page_shows_the_invalid_credentials_notice_on_error() throws Exception {
		mvc.perform(get("/login").param("error", ""))
			.andExpect(status().isOk())
			.andExpect(content().string(org.hamcrest.Matchers.containsString("Invalid username or password.")))
			.andExpect(content().string(org.hamcrest.Matchers.not(
					org.hamcrest.Matchers.containsString("You have been signed out."))));
	}

	@Test
	void the_login_page_shows_the_signed_out_notice_on_logout() throws Exception {
		mvc.perform(get("/login").param("logout", ""))
			.andExpect(status().isOk())
			.andExpect(content().string(org.hamcrest.Matchers.containsString("You have been signed out.")))
			.andExpect(content().string(org.hamcrest.Matchers.not(
					org.hamcrest.Matchers.containsString("Invalid username or password."))));
	}
}
