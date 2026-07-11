using System.Globalization;

// ReSharper disable once CheckNamespace
namespace Osprey.Members.Features;

/// <summary>
/// Tiny in-process catalog for localized validation errors (sv/en/es/de/it). A key maps to
/// a composite format string per culture; args fill the {0}/{1} placeholders. English is the
/// fallback and matches the original hard-coded strings verbatim, so existing tests and the
/// Auth:Enabled=false path are unchanged. Validation stays pure by returning the key as a
/// <see cref="ValidationError"/> value; the endpoint pipeline picks the culture from
/// Accept-Language and renders it there (see <c>ValidationError.ToBadRequest</c>).
/// </summary>
public static class Messages
{
    public static readonly string[] Supported = ["en", "sv", "es", "de", "it"];

    private static readonly Dictionary<string, Dictionary<string, string>> Catalog = new()
    {
        ["en"] = new()
        {
            ["name_required"] = "Name is required.",
            ["name_too_long"] = "Name must be at most {0} characters.",
            ["email_invalid"] = "Email must be a valid address.",
            ["email_too_long"] = "Email must be at most {0} characters.",
            ["member_id_invalid"] = "Member id is required and at most 64 characters.",
            ["reward_id_invalid"] = "Reward id is required and at most 64 characters.",
            ["partner_id_invalid"] = "Partner id is required and at most 64 characters.",
            ["idempotency_key"] = "Idempotency key must be {0}-{1} characters.",
            ["adjust_points_zero"] = "Adjustment points must not be zero.",
            ["adjust_magnitude"] = "Adjustment magnitude must be at most {0} points.",
            ["adjust_reason"] = "Reason is required and at most {0} characters.",
            ["earn_amount"] = "Amount must be positive and at most {0}.",
            ["earn_rate"] = "Rate must be positive and at most {0}.",
            ["list_page"] = "Page must be between 0 and {0}.",
            ["trip_airport_invalid"] = "Airport codes must be three uppercase letters (IATA).",
            ["trip_points_invalid"] = "Trip points must be positive and at most {0}.",
        },
        ["sv"] = new()
        {
            ["name_required"] = "Namn är obligatoriskt.",
            ["name_too_long"] = "Namnet får vara högst {0} tecken.",
            ["email_invalid"] = "E-postadressen måste vara giltig.",
            ["email_too_long"] = "E-postadressen får vara högst {0} tecken.",
            ["member_id_invalid"] = "Medlems-id är obligatoriskt och högst 64 tecken.",
            ["reward_id_invalid"] = "Belönings-id är obligatoriskt och högst 64 tecken.",
            ["partner_id_invalid"] = "Partner-id är obligatoriskt och högst 64 tecken.",
            ["idempotency_key"] = "Idempotensnyckeln måste vara {0}-{1} tecken.",
            ["adjust_points_zero"] = "Justeringspoängen får inte vara noll.",
            ["adjust_magnitude"] = "Justeringens storlek får vara högst {0} poäng.",
            ["adjust_reason"] = "En anledning är obligatorisk och högst {0} tecken.",
            ["earn_amount"] = "Beloppet måste vara positivt och högst {0}.",
            ["earn_rate"] = "Kursen måste vara positiv och högst {0}.",
            ["list_page"] = "Sidan måste vara mellan 0 och {0}.",
            ["trip_airport_invalid"] = "Flygplatskoder måste vara tre versaler (IATA).",
            ["trip_points_invalid"] = "Resans poäng måste vara positiva och högst {0}.",
        },
        ["es"] = new()
        {
            ["name_required"] = "El nombre es obligatorio.",
            ["name_too_long"] = "El nombre debe tener como máximo {0} caracteres.",
            ["email_invalid"] = "El correo electrónico debe ser una dirección válida.",
            ["email_too_long"] = "El correo electrónico debe tener como máximo {0} caracteres.",
            ["member_id_invalid"] = "El id de miembro es obligatorio y debe tener como máximo 64 caracteres.",
            ["reward_id_invalid"] = "El id de recompensa es obligatorio y debe tener como máximo 64 caracteres.",
            ["partner_id_invalid"] = "El id de socio es obligatorio y debe tener como máximo 64 caracteres.",
            ["idempotency_key"] = "La clave de idempotencia debe tener entre {0} y {1} caracteres.",
            ["adjust_points_zero"] = "Los puntos de ajuste no pueden ser cero.",
            ["adjust_magnitude"] = "La magnitud del ajuste debe ser como máximo {0} puntos.",
            ["adjust_reason"] = "El motivo es obligatorio y debe tener como máximo {0} caracteres.",
            ["earn_amount"] = "El importe debe ser positivo y como máximo {0}.",
            ["earn_rate"] = "La tasa debe ser positiva y como máximo {0}.",
            ["list_page"] = "La página debe estar entre 0 y {0}.",
            ["trip_airport_invalid"] = "Los códigos de aeropuerto deben ser tres letras mayúsculas (IATA).",
            ["trip_points_invalid"] = "Los puntos del viaje deben ser positivos y como máximo {0}.",
        },
        ["de"] = new()
        {
            ["name_required"] = "Name ist erforderlich.",
            ["name_too_long"] = "Der Name darf höchstens {0} Zeichen lang sein.",
            ["email_invalid"] = "Die E-Mail-Adresse muss gültig sein.",
            ["email_too_long"] = "Die E-Mail-Adresse darf höchstens {0} Zeichen lang sein.",
            ["member_id_invalid"] = "Die Mitglieds-ID ist erforderlich und darf höchstens 64 Zeichen lang sein.",
            ["reward_id_invalid"] = "Die Prämien-ID ist erforderlich und darf höchstens 64 Zeichen lang sein.",
            ["partner_id_invalid"] = "Die Partner-ID ist erforderlich und darf höchstens 64 Zeichen lang sein.",
            ["idempotency_key"] = "Der Idempotenzschlüssel muss {0}-{1} Zeichen lang sein.",
            ["adjust_points_zero"] = "Die Anpassungspunkte dürfen nicht null sein.",
            ["adjust_magnitude"] = "Der Betrag der Anpassung darf höchstens {0} Punkte betragen.",
            ["adjust_reason"] = "Ein Grund ist erforderlich und darf höchstens {0} Zeichen lang sein.",
            ["earn_amount"] = "Der Betrag muss positiv sein und höchstens {0} betragen.",
            ["earn_rate"] = "Die Rate muss positiv sein und höchstens {0} betragen.",
            ["list_page"] = "Die Seite muss zwischen 0 und {0} liegen.",
            ["trip_airport_invalid"] = "Flughafencodes müssen aus drei Großbuchstaben bestehen (IATA).",
            ["trip_points_invalid"] = "Die Reisepunkte müssen positiv sein und höchstens {0} betragen.",
        },
        ["it"] = new()
        {
            ["name_required"] = "Il nome è obbligatorio.",
            ["name_too_long"] = "Il nome deve contenere al massimo {0} caratteri.",
            ["email_invalid"] = "L'email deve essere un indirizzo valido.",
            ["email_too_long"] = "L'email deve contenere al massimo {0} caratteri.",
            ["member_id_invalid"] = "L'id del membro è obbligatorio e può contenere al massimo 64 caratteri.",
            ["reward_id_invalid"] = "L'id del premio è obbligatorio e può contenere al massimo 64 caratteri.",
            ["partner_id_invalid"] = "L'id del partner è obbligatorio e può contenere al massimo 64 caratteri.",
            ["idempotency_key"] = "La chiave di idempotenza deve contenere da {0} a {1} caratteri.",
            ["adjust_points_zero"] = "I punti di rettifica non possono essere zero.",
            ["adjust_magnitude"] = "L'entità della rettifica deve essere al massimo {0} punti.",
            ["adjust_reason"] = "Il motivo è obbligatorio e può contenere al massimo {0} caratteri.",
            ["earn_amount"] = "L'importo deve essere positivo e al massimo {0}.",
            ["earn_rate"] = "Il tasso deve essere positivo e al massimo {0}.",
            ["list_page"] = "La pagina deve essere compresa tra 0 e {0}.",
            ["trip_airport_invalid"] = "I codici aeroportuali devono essere tre lettere maiuscole (IATA).",
            ["trip_points_invalid"] = "I punti del viaggio devono essere positivi e al massimo {0}.",
        },
    };

    /// <summary>Picks the best supported language from an Accept-Language header; defaults to en.</summary>
    public static string Culture(string? acceptLanguage)
    {
        if (string.IsNullOrWhiteSpace(acceptLanguage))
            return "en";
        // "sv-SE,sv;q=0.9,en;q=0.8" — honour order, match on the primary subtag (q-weights
        // are already roughly ordered by clients; good enough for validation messages).
        foreach (var part in acceptLanguage.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var tag = part.Split(';')[0].Trim();
            if (tag.Length == 0)
                continue;
            var primary = tag.Split('-')[0].ToLowerInvariant();
            if (Array.IndexOf(Supported, primary) >= 0)
                return primary;
        }
        return "en";
    }

    /// <summary>Renders a key in the given culture, falling back to English for missing keys/cultures.</summary>
    public static string Localize(string key, string culture, params object[] args)
    {
        var lang = Catalog.TryGetValue(culture, out var c) ? c : Catalog["en"];
        var fmt = lang.TryGetValue(key, out var v) ? v
            : Catalog["en"].TryGetValue(key, out var en) ? en
            : key;
        return args is { Length: > 0 }
            ? string.Format(CultureInfo.GetCultureInfo(culture), fmt, args)
            : fmt;
    }
}
