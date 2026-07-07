package com.ospreyloyalty.partners.catalogue;

import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
public class CatalogueController {

    @GetMapping("/partners")
    public List<Partner> partners() {
        return PartnerCatalogue.all();
    }

    public record RateUpdate(double rate) {}

    @PutMapping("/partners/{partnerId}/rate")
    public Partner updateRate(@PathVariable String partnerId, @RequestBody RateUpdate request) {
        return PartnerCatalogue.updateRate(partnerId, request.rate());
    }
}
