package com.ospreyloyalty.partners.catalogue;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CatalogueController {

    @GetMapping("/partners")
    public List<Partner> partners() {
        return PartnerCatalogue.ALL;
    }
}
