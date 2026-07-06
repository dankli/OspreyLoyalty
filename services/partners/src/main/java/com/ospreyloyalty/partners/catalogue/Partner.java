package com.ospreyloyalty.partners.catalogue;

/** Fictional earn partner. Rate = points per currency unit spent (docs/domain.md). */
public record Partner(String id, String name, double rate) {}
