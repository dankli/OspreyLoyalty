package com.ospreyloyalty.partners.purchases;

import com.ospreyloyalty.partners.catalogue.PartnerCatalogue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.ospreyloyalty.partners.SecurityConfig;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PurchasesController.class)
@Import(SecurityConfig.class)
class PurchasesControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean OutboxWriter outbox;
    @MockitoBean ServiceTokenProvider tokenProvider;

    @BeforeEach
    void resetRates() {
        PartnerCatalogue.reset();
    }

    @Test
    void purchase_writes_one_outbox_entry_with_the_partner_rate() throws Exception {
        mvc.perform(post("/partners/cardco/purchases").contentType(APPLICATION_JSON)
                .content("{\"memberId\":\"demo-erik\",\"amount\":40000}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.idempotencyKey").isNotEmpty());

        ArgumentCaptor<EarnEvent> event = ArgumentCaptor.forClass(EarnEvent.class);
        verify(outbox, times(1)).write(event.capture());
        assertThat(event.getValue().rate()).isEqualTo(0.5);
        assertThat(event.getValue().amount().multiply(java.math.BigDecimal.valueOf(event.getValue().rate())).intValue())
            .isEqualTo(20_000);
        assertThat(event.getValue().memberId()).isEqualTo("demo-erik");
    }

    @Test
    void duplicate_demo_writes_two_outbox_entries_for_the_same_event() throws Exception {
        mvc.perform(post("/partners/cardco/purchases/duplicate-demo").contentType(APPLICATION_JSON)
                .content("{\"memberId\":\"demo-erik\",\"amount\":40000}"))
            .andExpect(status().isAccepted());

        ArgumentCaptor<EarnEvent> events = ArgumentCaptor.forClass(EarnEvent.class);
        verify(outbox, times(2)).write(events.capture());
        assertThat(events.getAllValues()).hasSize(2);
        assertThat(events.getAllValues().get(0).idempotencyKey())
            .isEqualTo(events.getAllValues().get(1).idempotencyKey());
        assertThat(events.getAllValues().get(0))
            .usingRecursiveComparison()
            .isEqualTo(events.getAllValues().get(1));
    }

    @Test
    void unknown_partner_is_a_400() throws Exception {
        mvc.perform(post("/partners/nope/purchases").contentType(APPLICATION_JSON)
                .content("{\"memberId\":\"demo-erik\",\"amount\":100}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void non_positive_amount_is_a_400() throws Exception {
        mvc.perform(post("/partners/cardco/purchases").contentType(APPLICATION_JSON)
                .content("{\"memberId\":\"demo-erik\",\"amount\":0}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void validation_error_is_localized_by_accept_language() throws Exception {
        mvc.perform(post("/partners/nope/purchases").contentType(APPLICATION_JSON)
                .header("Accept-Language", "sv-SE,sv;q=0.9,en;q=0.8")
                .content("{\"memberId\":\"demo-erik\",\"amount\":100}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Okänd partner: nope"));
    }

    @Test
    void validation_error_defaults_to_english_without_accept_language() throws Exception {
        mvc.perform(post("/partners/nope/purchases").contentType(APPLICATION_JSON)
                .content("{\"memberId\":\"demo-erik\",\"amount\":100}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Unknown partner: nope"));
    }

    @Test
    void purchase_stamps_the_service_token_on_the_event() throws Exception {
        when(tokenProvider.mint()).thenReturn("service-token-xyz");
        mvc.perform(post("/partners/cardco/purchases").contentType(APPLICATION_JSON)
                .content("{\"memberId\":\"demo-erik\",\"amount\":40000}"))
            .andExpect(status().isAccepted());

        ArgumentCaptor<EarnEvent> event = ArgumentCaptor.forClass(EarnEvent.class);
        verify(outbox).write(event.capture());
        assertThat(event.getValue().authToken()).isEqualTo("service-token-xyz");
    }

    @Test
    void earn_event_carries_the_correlation_id_from_the_request() throws Exception {
        mvc.perform(post("/partners/cardco/purchases").contentType(APPLICATION_JSON)
                .header("X-Correlation-Id", "corr-earn-1")
                .content("{\"memberId\":\"demo-erik\",\"amount\":1000}"))
            .andExpect(status().isAccepted());

        ArgumentCaptor<EarnEvent> event = ArgumentCaptor.forClass(EarnEvent.class);
        verify(outbox).write(event.capture());
        assertThat(event.getValue().correlationId()).isEqualTo("corr-earn-1");
    }

    @Test
    void purchase_after_rate_update_carries_the_new_rate() throws Exception {
        PartnerCatalogue.updateRate("cardco", 0.9);
        mvc.perform(post("/partners/cardco/purchases").contentType(APPLICATION_JSON)
                .content("{\"memberId\":\"demo-erik\",\"amount\":1000}"))
            .andExpect(status().isAccepted());

        ArgumentCaptor<EarnEvent> event = ArgumentCaptor.forClass(EarnEvent.class);
        verify(outbox).write(event.capture());
        assertThat(event.getValue().rate()).isEqualTo(0.9);
    }
}
