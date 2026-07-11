package com.ospreyloyalty.partners.campaigns;

import com.ospreyloyalty.partners.LocalizedBadRequest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class CampaignStoreTest {

    private static final Instant NOW = Instant.parse("2026-07-11T12:00:00Z");

    @BeforeEach
    void reset() {
        CampaignStore.reset();
    }

    private static Campaign active(String partnerId, double multiplier) {
        return CampaignStore.create(partnerId, "Summer boost", multiplier,
            NOW.minus(1, ChronoUnit.DAYS), NOW.plus(1, ChronoUnit.DAYS));
    }

    @Test
    void an_active_campaign_multiplies_the_partner_rate() {
        active("stayinn", 2.0);

        assertThat(CampaignStore.activeMultiplier("stayinn", NOW)).isEqualTo(2.0);
        assertThat(CampaignStore.activeMultiplier("cardco", NOW)).isEqualTo(1.0); // other partners untouched
    }

    @Test
    void outside_the_window_the_multiplier_is_neutral() {
        CampaignStore.create("stayinn", "Past promo", 2.0,
            NOW.minus(10, ChronoUnit.DAYS), NOW.minus(5, ChronoUnit.DAYS));
        CampaignStore.create("stayinn", "Future promo", 3.0,
            NOW.plus(5, ChronoUnit.DAYS), NOW.plus(10, ChronoUnit.DAYS));

        assertThat(CampaignStore.activeMultiplier("stayinn", NOW)).isEqualTo(1.0);
    }

    @Test
    void overlapping_campaigns_never_stack_the_highest_wins() {
        active("stayinn", 2.0);
        active("stayinn", 3.0);

        assertThat(CampaignStore.activeMultiplier("stayinn", NOW)).isEqualTo(3.0);
    }

    @Test
    void the_window_boundaries_are_start_inclusive_end_exclusive() {
        Campaign campaign = CampaignStore.create("stayinn", "Exact window", 2.0,
            NOW, NOW.plus(1, ChronoUnit.HOURS));

        assertThat(CampaignStore.activeMultiplier("stayinn", campaign.startsAtUtc())).isEqualTo(2.0);
        assertThat(CampaignStore.activeMultiplier("stayinn", campaign.endsAtUtc())).isEqualTo(1.0);
    }

    @Test
    void creation_validates_partner_name_multiplier_and_window() {
        assertThatThrownBy(() -> active("nope", 2.0)).isInstanceOf(LocalizedBadRequest.class);
        assertThatThrownBy(() -> CampaignStore.create("stayinn", " ", 2.0, NOW, NOW.plus(1, ChronoUnit.DAYS)))
            .isInstanceOf(LocalizedBadRequest.class);
        assertThatThrownBy(() -> active("stayinn", 1.0)).isInstanceOf(LocalizedBadRequest.class);
        assertThatThrownBy(() -> active("stayinn", 5.5)).isInstanceOf(LocalizedBadRequest.class);
        assertThatThrownBy(() -> CampaignStore.create("stayinn", "Backwards", 2.0, NOW, NOW))
            .isInstanceOf(LocalizedBadRequest.class);
    }

    @Test
    void delete_removes_the_campaign_and_rejects_unknown_ids() {
        Campaign campaign = active("stayinn", 2.0);

        CampaignStore.delete(campaign.id());

        assertThat(CampaignStore.all()).isEmpty();
        assertThatThrownBy(() -> CampaignStore.delete(campaign.id())).isInstanceOf(LocalizedBadRequest.class);
    }
}
