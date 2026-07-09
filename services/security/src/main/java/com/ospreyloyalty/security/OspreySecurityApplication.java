package com.ospreyloyalty.security;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Osprey Loyalty identity service — a first-party OIDC/OAuth2 provider built on
 * Spring Authorization Server. Issues the JWTs that every other service validates
 * (see the zero-trust ADR). Demo users and clients are in-memory; the signing key
 * is generated at startup. Production would persist both.
 */
@SpringBootApplication
public class OspreySecurityApplication {

	public static void main(String[] args) {
		SpringApplication.run(OspreySecurityApplication.class, args);
	}
}
