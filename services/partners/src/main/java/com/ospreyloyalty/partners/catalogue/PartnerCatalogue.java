package com.ospreyloyalty.partners.catalogue;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory reference data — three partners is the whole universe of this demo.
 * Rates are mutable (admin portal edits them) and per-instance: a restart restores
 * the defaults, which is fine for a demo and stated in the README.
 */
public final class PartnerCatalogue {

    private static final List<Partner> DEFAULTS = List.of(
        new Partner("cardco", "CardCo", 0.5),
        new Partner("stayinn", "StayInn", 2.0),
        new Partner("wheelsgo", "WheelsGo", 1.5));

    private static final Map<String, Partner> current = new ConcurrentHashMap<>();

    static {
        reset();
    }

    public static List<Partner> all() {
        return current.values().stream().sorted(Comparator.comparing(Partner::id)).toList();
    }

    public static Optional<Partner> byId(String id) {
        return Optional.ofNullable(current.get(id));
    }

    public static Partner updateRate(String id, double rate) {
        if (rate <= 0 || rate > 10)
            throw new IllegalArgumentException("rate must be positive and at most 10.");
        Partner updated = byId(id)
            .map(p -> new Partner(p.id(), p.name(), rate))
            .orElseThrow(() -> new IllegalArgumentException("Unknown partner: " + id));
        current.put(id, updated);
        return updated;
    }

    /** Test hook: restores default rates so test order never matters. */
    public static void reset() {
        current.clear();
        DEFAULTS.forEach(p -> current.put(p.id(), p));
    }

    private PartnerCatalogue() {}
}
