using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.IdentityModel.Tokens;

// ReSharper disable once CheckNamespace
namespace Osprey.Members.Features;

public static partial class ConsumeEarnEvents
{
    /// <summary>
    /// Validates the service token partners stamps on each <see cref="ApplyEarn.EarnEvent"/> — the
    /// async, RabbitMQ leg of zero-trust (ADR-0007). Symmetric with the HTTP JwtBearer setup in
    /// Program.cs: an HS256 shared key in test/demo, or RS256 keys fetched DIRECTLY from the identity
    /// service's JWKS in the real deployment (see <see cref="JwksSigningKeys"/> for why not metadata
    /// discovery). Consulted only when Auth:Enabled is on; off (the default) waves everything through.
    /// </summary>
    public sealed class EarnTokenValidator
    {
        private readonly bool _enabled;
        private readonly TokenValidationParameters _parameters;
        private readonly Func<CancellationToken, Task<ICollection<SecurityKey>>>? _keyProvider;
        private readonly JwtSecurityTokenHandler _handler = new();

        public EarnTokenValidator(IConfiguration config)
            : this(config, DefaultKeyProvider(config))
        {
        }

        // Test seam: inject the RS256 signing keys directly, no JWKS endpoint needed.
        internal EarnTokenValidator(
            IConfiguration config,
            Func<CancellationToken, Task<ICollection<SecurityKey>>>? keyProvider)
        {
            _enabled = config.GetValue("Auth:Enabled", false);
            _parameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = config["Auth:Issuer"] ?? "http://localhost:9000",
                ValidateAudience = true,
                ValidAudience = config["Auth:Audience"] ?? "osprey-members",
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
            };

            var testKey = config["Auth:TestSigningKey"];
            if (!string.IsNullOrEmpty(testKey))
            {
                // HS256 shared-key mode (test/demo) — a static symmetric key, no fetch.
                _parameters.IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(testKey));
                _keyProvider = null;
            }
            else
            {
                // RS256 mode — signing keys come from the JWKS (injected in tests, fetched in prod).
                _keyProvider = keyProvider;
            }
        }

        private static Func<CancellationToken, Task<ICollection<SecurityKey>>>? DefaultKeyProvider(IConfiguration config)
        {
            if (!string.IsNullOrEmpty(config["Auth:TestSigningKey"]))
                return null;
            var jwks = new JwksSigningKeys(config["Auth:JwksUri"] ?? "http://security:8080/oauth2/jwks");
            return jwks.GetAsync;
        }

        /// <summary>
        /// True when auth is off (nothing to enforce) or the token is a valid, unexpired JWT for
        /// osprey-members. A missing or invalid token when auth is on returns false — the caller
        /// dead-letters that delivery rather than applying an unauthenticated earn.
        /// </summary>
        public async Task<bool> IsValidAsync(string? token, CancellationToken ct)
        {
            if (!_enabled)
                return true;
            if (string.IsNullOrWhiteSpace(token))
                return false;

            var parameters = _parameters.Clone();
            if (_keyProvider is not null)
                parameters.IssuerSigningKeys = await _keyProvider(ct);

            try
            {
                _handler.ValidateToken(token, parameters, out _);
                return true;
            }
            catch (Exception ex) when (ex is SecurityTokenException or ArgumentException)
            {
                return false;
            }
        }
    }
}
