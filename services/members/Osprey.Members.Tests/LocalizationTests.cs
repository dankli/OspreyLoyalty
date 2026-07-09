using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class LocalizationTests
{
    [Theory]
    [InlineData(null, "en")]
    [InlineData("", "en")]
    [InlineData("sv", "sv")]
    [InlineData("sv-SE", "sv")]
    [InlineData("sv-SE,sv;q=0.9,en;q=0.8", "sv")]
    [InlineData("es-ES", "es")]
    [InlineData("de", "de")]
    [InlineData("it-IT", "it")]
    [InlineData("fr-FR", "en")] // unsupported → English fallback
    [InlineData("fr,sv;q=0.5", "sv")] // first supported tag wins
    public void Culture_picks_the_best_supported_language(string? header, string expected)
    {
        Assert.Equal(expected, Messages.Culture(header));
    }

    [Fact]
    public void English_renders_the_original_wording_verbatim()
    {
        Assert.Equal("Name is required.", Messages.Localize("name_required", "en"));
        Assert.Equal("Member id is required and at most 64 characters.",
            Messages.Localize("member_id_invalid", "en"));
        Assert.Equal("Idempotency key must be 8-100 characters.",
            Messages.Localize("idempotency_key", "en", 8, 100));
    }

    [Fact]
    public void Other_languages_translate_and_still_interpolate_args()
    {
        Assert.Equal("Namn är obligatoriskt.", Messages.Localize("name_required", "sv"));
        Assert.Equal("Sidan måste vara mellan 0 och 100000.", Messages.Localize("list_page", "sv", 100_000));
        Assert.Equal("El nombre es obligatorio.", Messages.Localize("name_required", "es"));
        Assert.Equal("Name ist erforderlich.", Messages.Localize("name_required", "de"));
        Assert.Equal("Il nome è obbligatorio.", Messages.Localize("name_required", "it"));
    }

    [Fact]
    public void Missing_key_or_culture_falls_back_to_english()
    {
        Assert.Equal("Name is required.", Messages.Localize("name_required", "fr")); // unknown culture
        Assert.Equal("unknown_key", Messages.Localize("unknown_key", "sv")); // unknown key → key echoed
    }

    [Fact]
    public void Fail_carries_the_key_and_renders_english_by_default()
    {
        var ex = Messages.Fail("name_too_long", 200);
        Assert.Equal("name_too_long", ex.Data[Messages.KeyData]);
        Assert.Equal("Name must be at most 200 characters.", ex.Message);
        // Exact type — a subclass would break the validation tests' Assert.Throws<ArgumentException>.
        Assert.IsType<ArgumentException>(ex);
    }
}
