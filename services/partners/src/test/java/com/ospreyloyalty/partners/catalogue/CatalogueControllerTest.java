package com.ospreyloyalty.partners.catalogue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CatalogueController.class)
class CatalogueControllerTest {

    @Autowired MockMvc mvc;

    @Test
    void catalogue_lists_the_three_partners_with_rates() throws Exception {
        mvc.perform(get("/partners"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(3))
            .andExpect(jsonPath("$[?(@.id=='cardco')].rate").value(0.5))
            .andExpect(jsonPath("$[?(@.id=='stayinn')].rate").value(2.0))
            .andExpect(jsonPath("$[?(@.id=='wheelsgo')].rate").value(1.5));
    }
}
