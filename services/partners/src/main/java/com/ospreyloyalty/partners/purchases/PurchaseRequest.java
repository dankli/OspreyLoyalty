package com.ospreyloyalty.partners.purchases;

import java.math.BigDecimal;

public record PurchaseRequest(String memberId, BigDecimal amount) {}
