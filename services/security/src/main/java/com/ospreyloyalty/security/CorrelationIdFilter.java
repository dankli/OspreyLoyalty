package com.ospreyloyalty.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Accept-or-generate X-Correlation-Id, expose it to logging via MDC, echo it back.
 * Mirrors the other services so a login flow is traceable end to end.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(CorrelationIdFilter.class);

	public static final String HEADER = "X-Correlation-Id";
	public static final String MDC_KEY = "correlationId";

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String correlationId = request.getHeader(HEADER);
		if (correlationId == null || correlationId.isBlank())
			correlationId = UUID.randomUUID().toString().replace("-", "");
		response.setHeader(HEADER, correlationId);
		MDC.put(MDC_KEY, correlationId);
		long startedNanos = System.nanoTime();
		try {
			chain.doFilter(request, response);
		} finally {
			long elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000;
			log.info("{} {} => {} in {}ms",
					request.getMethod(), request.getRequestURI(), response.getStatus(), elapsedMs);
			MDC.remove(MDC_KEY);
		}
	}
}
