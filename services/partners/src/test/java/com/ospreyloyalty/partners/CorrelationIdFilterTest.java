package com.ospreyloyalty.partners;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class CorrelationIdFilterTest {

    @Test
    void echoes_an_incoming_id_and_exposes_it_to_mdc() throws Exception {
        var filter = new CorrelationIdFilter();
        var request = new MockHttpServletRequest();
        request.addHeader("X-Correlation-Id", "corr-42");
        var response = new MockHttpServletResponse();
        final String[] seenInChain = new String[1];
        FilterChain chain = (req, res) -> seenInChain[0] = MDC.get("correlationId");

        filter.doFilter(request, response, chain);

        assertThat(response.getHeader("X-Correlation-Id")).isEqualTo("corr-42");
        assertThat(seenInChain[0]).isEqualTo("corr-42");
        assertThat(MDC.get("correlationId")).isNull(); // cleaned up after the request
    }

    @Test
    void generates_an_id_when_none_arrives() throws Exception {
        var filter = new CorrelationIdFilter();
        var response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest(), response, (req, res) -> {});
        assertThat(response.getHeader("X-Correlation-Id")).isNotBlank();
    }
}
