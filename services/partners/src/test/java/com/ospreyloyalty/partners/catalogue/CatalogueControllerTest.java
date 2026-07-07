package com.ospreyloyalty.partners.catalogue;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CatalogueController.class)
class CatalogueControllerTest {

    @Autowired MockMvc mvc;

    @BeforeEach
    void resetRates() {
        PartnerCatalogue.reset();
    }

    @Test
    void catalogue_lists_the_three_partners_with_rates() throws Exception {
        mvc.perform(get("/partners"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(3))
            .andExpect(jsonPath("$[?(@.id=='cardco')].rate").value(0.5))
            .andExpect(jsonPath("$[?(@.id=='stayinn')].rate").value(2.0))
            .andExpect(jsonPath("$[?(@.id=='wheelsgo')].rate").value(1.5));
    }

    @Test
    void rate_update_is_reflected_in_the_catalogue() throws Exception {
        mvc.perform(put("/partners/cardco/rate").contentType(APPLICATION_JSON)
                .content("{\"rate\":0.8}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rate").value(0.8));

        mvc.perform(get("/partners"))
            .andExpect(jsonPath("$[?(@.id=='cardco')].rate").value(0.8));
    }

    @Test
    void invalid_rate_is_a_400() throws Exception {
        mvc.perform(put("/partners/cardco/rate").contentType(APPLICATION_JSON)
                .content("{\"rate\":0}"))
            .andExpect(status().isBadRequest());
        mvc.perform(put("/partners/cardco/rate").contentType(APPLICATION_JSON)
                .content("{\"rate\":11}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void unknown_partner_rate_update_is_a_400() throws Exception {
        mvc.perform(put("/partners/nope/rate").contentType(APPLICATION_JSON)
                .content("{\"rate\":1.0}"))
            .andExpect(status().isBadRequest());
    }
}
