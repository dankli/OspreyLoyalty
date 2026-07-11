package com.ospreyloyalty.partners.campaigns;

import com.ospreyloyalty.partners.LocalizedBadRequest;
import com.ospreyloyalty.partners.catalogue.PartnerCatalogue;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory campaigns, the PartnerCatalogue trade-off applied again: mutable via the
 * admin portal, per-instance, and gone on restart — fine for a demo and stated in the
 * README. A campaign folds into the earn rate at purchase time (the earn-event contract
 * stays untouched); overlapping campaigns never stack — the highest multiplier wins.
 */
public final class CampaignStore {

    private static final int MAX_NAME_LENGTH = 100;
    private static final double MIN_MULTIPLIER_EXCLUSIVE = 1.0;
    private static final double MAX_MULTIPLIER = 5.0;
    private static final int MAX_CAMPAIGNS = 100; // demo bound — an admin typo loop must not grow unbounded

    private static final Map<String, Campaign> current = new ConcurrentHashMap<>();

    public static List<Campaign> all() {
        return current.values().stream().sorted(Comparator.comparing(Campaign::startsAtUtc)).toList();
    }

    public static Campaign create(String partnerId, String name, double multiplier, Instant startsAtUtc, Instant endsAtUtc) {
        PartnerCatalogue.byId(partnerId)
            .orElseThrow(() -> new LocalizedBadRequest("partner.unknown", "Unknown partner: " + partnerId, partnerId));
        if (name == null || name.isBlank() || name.length() > MAX_NAME_LENGTH)
            throw new LocalizedBadRequest("campaign.name.invalid",
                "Campaign name is required and at most " + MAX_NAME_LENGTH + " characters.", MAX_NAME_LENGTH);
        if (multiplier <= MIN_MULTIPLIER_EXCLUSIVE || multiplier > MAX_MULTIPLIER)
            throw new LocalizedBadRequest("campaign.multiplier.invalid",
                "Campaign multiplier must be greater than 1 and at most " + MAX_MULTIPLIER + ".", MAX_MULTIPLIER);
        if (startsAtUtc == null || endsAtUtc == null || !startsAtUtc.isBefore(endsAtUtc))
            throw new LocalizedBadRequest("campaign.window.invalid", "Campaign start must be before its end.");
        if (current.size() >= MAX_CAMPAIGNS)
            throw new LocalizedBadRequest("campaign.limit", "At most " + MAX_CAMPAIGNS + " campaigns.", MAX_CAMPAIGNS);
        Campaign campaign = new Campaign(UUID.randomUUID().toString(), partnerId, name.trim(), multiplier, startsAtUtc, endsAtUtc);
        current.put(campaign.id(), campaign);
        return campaign;
    }

    public static void delete(String id) {
        if (current.remove(id) == null)
            throw new LocalizedBadRequest("campaign.unknown", "Unknown campaign: " + id, id);
    }

    /** The rate factor for a purchase right now: highest active multiplier, or 1.0 without one. */
    public static double activeMultiplier(String partnerId, Instant now) {
        return current.values().stream()
            .filter(c -> c.partnerId().equals(partnerId))
            .filter(c -> !now.isBefore(c.startsAtUtc()) && now.isBefore(c.endsAtUtc()))
            .mapToDouble(Campaign::multiplier)
            .max()
            .orElse(1.0);
    }

    /** Test hook: campaigns never leak between tests. */
    public static void reset() {
        current.clear();
    }

    private CampaignStore() {}
}
