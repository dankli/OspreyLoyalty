package com.ospreyloyalty.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test for {@link CorrelationIdFilter} — mirrors the partners service's equivalent test.
 * Drives the real filter (no Spring context) via the servlet mocks.
 */
class CorrelationIdFilterTest {

	@Test
	void echoes_an_incoming_id_and_exposes_it_to_mdc() throws Exception {
		var filter = new CorrelationIdFilter();
		var request = new MockHttpServletRequest();
		request.addHeader(CorrelationIdFilter.HEADER, "corr-42");
		var response = new MockHttpServletResponse();
		final String[] seenInChain = new String[1];
		FilterChain chain = (req, res) -> seenInChain[0] = MDC.get(CorrelationIdFilter.MDC_KEY);

		filter.doFilter(request, response, chain);

		assertThat(response.getHeader(CorrelationIdFilter.HEADER)).isEqualTo("corr-42");
		assertThat(seenInChain[0]).isEqualTo("corr-42");
		assertThat(MDC.get(CorrelationIdFilter.MDC_KEY)).isNull(); // cleaned up after the request
	}

	@Test
	void generates_an_id_when_none_arrives() throws Exception {
		var filter = new CorrelationIdFilter();
		var response = new MockHttpServletResponse();

		filter.doFilter(new MockHttpServletRequest(), response, (req, res) -> {});

		assertThat(response.getHeader(CorrelationIdFilter.HEADER)).isNotBlank();
	}

	@Test
	void generates_an_id_when_a_blank_one_arrives() throws Exception {
		var filter = new CorrelationIdFilter();
		var request = new MockHttpServletRequest();
		request.addHeader(CorrelationIdFilter.HEADER, "   ");
		var response = new MockHttpServletResponse();
		final String[] seenInChain = new String[1];
		FilterChain chain = (req, res) -> seenInChain[0] = MDC.get(CorrelationIdFilter.MDC_KEY);

		filter.doFilter(request, response, chain);

		assertThat(response.getHeader(CorrelationIdFilter.HEADER)).isNotBlank();
		assertThat(response.getHeader(CorrelationIdFilter.HEADER).trim()).isNotEmpty();
		assertThat(seenInChain[0]).isEqualTo(response.getHeader(CorrelationIdFilter.HEADER));
	}
}
