package com.ospreyloyalty.partners;

import java.util.Map;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Expected failures become clean 400s; everything else stays a 500 (exceptions on the edges). */
@RestControllerAdvice
public class ApiErrorHandler {

    private final MessageSource messages;

    public ApiErrorHandler(MessageSource messages) {
        this.messages = messages;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> badRequest(IllegalArgumentException ex) {
        // Keyed failures resolve to the caller's Accept-Language (LocaleContextHolder is
        // populated by the default AcceptHeaderLocaleResolver); the super message is the
        // English fallback for anything unkeyed or missing from the catalog.
        String message = ex instanceof LocalizedBadRequest le
            ? messages.getMessage(le.code(), le.args(), le.getMessage(), LocaleContextHolder.getLocale())
            : ex.getMessage();
        return Map.of("error", message);
    }
}
