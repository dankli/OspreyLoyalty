package com.ospreyloyalty.partners.campaigns;

import com.ospreyloyalty.partners.SecurityConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CampaignsController.class)
@Import(SecurityConfig.class)
class CampaignsControllerTest {

    @Autowired MockMvc mvc;

    @BeforeEach
    void reset() {
        CampaignStore.reset();
    }

    @Test
    void create_list_delete_round_trip() throws Exception {
        String body = """
            {"partnerId":"stayinn","name":"Double points July","multiplier":2.0,
             "startsAtUtc":"2026-07-01T00:00:00Z","endsAtUtc":"2026-08-01T00:00:00Z"}""";

        String id = com.jayway.jsonpath.JsonPath.read(
            mvc.perform(post("/campaigns").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.partnerId").value("stayinn"))
                .andExpect(jsonPath("$.multiplier").value(2.0))
                .andReturn().getResponse().getContentAsString(),
            "$.id");

        mvc.perform(get("/campaigns"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].name").value("Double points July"));

        mvc.perform(delete("/campaigns/" + id)).andExpect(status().isNoContent());
        mvc.perform(get("/campaigns")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void invalid_campaigns_are_localized_400s() throws Exception {
        String badMultiplier = """
            {"partnerId":"stayinn","name":"Too strong","multiplier":9.0,
             "startsAtUtc":"2026-07-01T00:00:00Z","endsAtUtc":"2026-08-01T00:00:00Z"}""";

        mvc.perform(post("/campaigns").contentType(APPLICATION_JSON)
                .header("Accept-Language", "sv")
                .content(badMultiplier))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Kampanjens multiplikator måste vara större än 1 och högst 5."));
    }
}
