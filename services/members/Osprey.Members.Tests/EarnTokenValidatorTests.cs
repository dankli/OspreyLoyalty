using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// The RabbitMQ leg of zero-trust: members validates the service token partners stamps on each
/// earn event. HS256 shared-key mode (no live IdP), matching the AuthTests pattern.
/// </summary>
public sealed class EarnTokenValidatorTests
{
    private const string TestKey = "osprey-test-signing-key-long-enough-for-hs256-xx";

    private static ConsumeEarnEvents.EarnTokenValidator Validator(bool enabled) =>
        new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:Enabled"] = enabled ? "true" : "false",
            ["Auth:Issuer"] = "http://localhost:9000",
            ["Auth:Audience"] = "osprey-members",
            ["Auth:TestSigningKey"] = TestKey,
        }).Build());

    private static string Token(
        string audience = "osprey-members",
        string issuer = "http://localhost:9000",
        int expiresMinutes = 10,
        string? key = null)
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key ?? TestKey)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: new[] { new Claim("sub", "partners-service"), new Claim("roles", "service") },
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    [Fact]
    public async Task Disabled_waves_everything_through()
    {
        var validator = Validator(enabled: false);
        Assert.True(await validator.IsValidAsync(null, default));
        Assert.True(await validator.IsValidAsync("not-even-a-jwt", default));
    }

    [Fact]
    public async Task Enabled_accepts_a_valid_members_token()
    {
        Assert.True(await Validator(enabled: true).IsValidAsync(Token(), default));
    }

    [Fact]
    public async Task Enabled_rejects_a_missing_token()
    {
        var validator = Validator(enabled: true);
        Assert.False(await validator.IsValidAsync(null, default));
        Assert.False(await validator.IsValidAsync("   ", default));
    }

    [Fact]
    public async Task Enabled_rejects_a_garbage_token()
    {
        Assert.False(await Validator(enabled: true).IsValidAsync("not-a-jwt", default));
    }

    [Fact]
    public async Task Enabled_rejects_a_token_for_a_different_audience()
    {
        Assert.False(await Validator(enabled: true).IsValidAsync(Token(audience: "osprey-partners"), default));
    }

    [Fact]
    public async Task Enabled_rejects_an_expired_token()
    {
        // Well past the 5-minute default clock skew so it is unambiguously expired.
        Assert.False(await Validator(enabled: true).IsValidAsync(Token(expiresMinutes: -60), default));
    }

    [Fact]
    public async Task Enabled_rejects_a_token_signed_with_the_wrong_key()
    {
        Assert.False(await Validator(enabled: true)
            .IsValidAsync(Token(key: "a-totally-different-signing-key-32bytes!!"), default));
    }

    // --- RS256 / JWKS mode (the real deployment): no TestSigningKey, keys injected via the seam ---

    private static IConfiguration Rs256Config() =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:Enabled"] = "true",
            ["Auth:Issuer"] = "http://localhost:9000",
            ["Auth:Audience"] = "osprey-members",
            // deliberately NO Auth:TestSigningKey → RS256 path
        }).Build();

    private static string Rs256Token(RSA rsa)
    {
        var credentials = new SigningCredentials(new RsaSecurityKey(rsa), SecurityAlgorithms.RsaSha256);
        var token = new JwtSecurityToken(
            issuer: "http://localhost:9000",
            audience: "osprey-members",
            claims: new[] { new Claim("sub", "partners-service"), new Claim("roles", "service") },
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    [Fact]
    public async Task Rs256_token_is_accepted_when_its_key_is_in_the_jwks()
    {
        using var rsa = RSA.Create(2048);
        var token = Rs256Token(rsa);
        // The validator sees only the PUBLIC key, exactly as it would from the JWKS.
        var publicKey = new RsaSecurityKey(rsa.ExportParameters(false));
        var validator = new ConsumeEarnEvents.EarnTokenValidator(
            Rs256Config(), _ => Task.FromResult<ICollection<SecurityKey>>(new SecurityKey[] { publicKey }));

        Assert.True(await validator.IsValidAsync(token, default));
    }

    [Fact]
    public async Task Rs256_token_is_rejected_when_the_jwks_has_a_different_key()
    {
        using var signing = RSA.Create(2048);
        using var other = RSA.Create(2048);
        var token = Rs256Token(signing);
        var wrongKey = new RsaSecurityKey(other.ExportParameters(false));
        var validator = new ConsumeEarnEvents.EarnTokenValidator(
            Rs256Config(), _ => Task.FromResult<ICollection<SecurityKey>>(new SecurityKey[] { wrongKey }));

        Assert.False(await validator.IsValidAsync(token, default));
    }
}
