package com.ospreyloyalty.partners.catalogue;

import java.util.List;
import java.util.Optional;

/** In-memory reference data — three partners is the whole universe of this demo. */
public final class PartnerCatalogue {

    public static final List<Partner> ALL = List.of(
        new Partner("cardco", "CardCo", 0.5),
        new Partner("stayinn", "StayInn", 2.0),
        new Partner("wheelsgo", "WheelsGo", 1.5));

    public static Optional<Partner> byId(String id) {
        return ALL.stream().filter(p -> p.id().equals(id)).findFirst();
    }

    private PartnerCatalogue() {}
}
