package com.ospreyloyalty.partners.purchases;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PurchasesController.class)
class PurchasesControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean EarnEventPublisher publisher;

    @Test
    void purchase_emits_one_earn_event_with_the_partner_rate() throws Exception {
        mvc.perform(post("/partners/cardco/purchases").contentType(APPLICATION_JSON)
                .content("{\"memberId\":\"demo-erik\",\"amount\":40000}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.idempotencyKey").isNotEmpty());

        ArgumentCaptor<EarnEvent> event = ArgumentCaptor.forClass(EarnEvent.class);
        verify(publisher, times(1)).publish(event.capture());
        assertThat(event.getValue().rate()).isEqualTo(0.5);
        assertThat(event.getValue().memberId()).isEqualTo("demo-erik");
    }

    @Test
    void duplicate_demo_publishes_the_same_event_twice() throws Exception {
        mvc.perform(post("/partners/cardco/purchases/duplicate-demo").contentType(APPLICATION_JSON)
                .content("{\"memberId\":\"demo-erik\",\"amount\":40000}"))
            .andExpect(status().isAccepted());

        ArgumentCaptor<EarnEvent> events = ArgumentCaptor.forClass(EarnEvent.class);
        verify(publisher, times(2)).publish(events.capture());
        assertThat(events.getAllValues().get(0).idempotencyKey())
            .isEqualTo(events.getAllValues().get(1).idempotencyKey());
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
}
