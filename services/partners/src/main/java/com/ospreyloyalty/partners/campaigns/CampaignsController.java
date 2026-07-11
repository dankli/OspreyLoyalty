package com.ospreyloyalty.partners.campaigns;

import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
public class CampaignsController {

    @GetMapping("/campaigns")
    public List<Campaign> campaigns() {
        return CampaignStore.all();
    }

    public record CampaignRequest(String partnerId, String name, Double multiplier, Instant startsAtUtc, Instant endsAtUtc) {}

    @PostMapping("/campaigns")
    @ResponseStatus(HttpStatus.CREATED)
    public Campaign create(@RequestBody CampaignRequest request) {
        double multiplier = request.multiplier() == null ? 0 : request.multiplier();
        return CampaignStore.create(request.partnerId(), request.name(), multiplier,
            request.startsAtUtc(), request.endsAtUtc());
    }

    @DeleteMapping("/campaigns/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        CampaignStore.delete(id);
    }
}
