package com.ospreyloyalty.partners;

/**
 * A 400-mapped failure that also carries a message code + args so {@link ApiErrorHandler}
 * can resolve it against the {@code messages*.properties} catalog in the caller's locale
 * (Accept-Language). It extends {@link IllegalArgumentException} so the existing
 * "expected failures are 400s" handler and its tests are unchanged; the super message is
 * the English fallback used when no catalog entry matches.
 */
public class LocalizedBadRequest extends IllegalArgumentException {

    private final String code;
    private final transient Object[] args;

    public LocalizedBadRequest(String code, String englishFallback, Object... args) {
        super(englishFallback);
        this.code = code;
        this.args = args;
    }

    public String code() {
        return code;
    }

    public Object[] args() {
        return args;
    }
}
