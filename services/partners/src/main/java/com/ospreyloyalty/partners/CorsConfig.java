package com.ospreyloyalty.partners;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Wide-open CORS for the demo: the admin portal calls this service directly from the browser
 * (GET /partners, PUT /partners/{id}/rate). Mirrors the members service — see the README
 * "CORS is wide open" note. In production these admin surfaces would sit behind OIDC instead.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins("*")
                .allowedMethods("*")
                .allowedHeaders("*");
    }
}
