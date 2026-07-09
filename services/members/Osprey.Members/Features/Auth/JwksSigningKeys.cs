using Microsoft.IdentityModel.Tokens;

// ReSharper disable once CheckNamespace
namespace Osprey.Members.Features;

/// <summary>
/// Fetches and caches the identity service's JWKS signing keys from a DIRECT jwks endpoint
/// (e.g. http://security:8080/oauth2/jwks), rather than via OIDC metadata discovery. The reason:
/// the token's issuer is the browser-facing URL (http://localhost:9000), so the discovery
/// document's <c>jwks_uri</c> also points at localhost — unreachable from inside the cluster.
/// Fetching the JWKS directly decouples key retrieval from the issuer, the same way the partners
/// resource server uses a direct <c>jwk-set-uri</c>. Keys are cached with a short TTL.
/// </summary>
public sealed class JwksSigningKeys(string jwksUri, HttpClient? httpClient = null)
{
    private static readonly HttpClient Shared = new() { Timeout = TimeSpan.FromSeconds(5) };
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(10);

    private readonly HttpClient _http = httpClient ?? Shared;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private ICollection<SecurityKey> _keys = [];
    private DateTimeOffset _fetchedAt = DateTimeOffset.MinValue;

    public async Task<ICollection<SecurityKey>> GetAsync(CancellationToken ct)
    {
        if (_keys.Count > 0 && DateTimeOffset.UtcNow - _fetchedAt < Ttl)
            return _keys;

        await _gate.WaitAsync(ct);
        try
        {
            if (_keys.Count > 0 && DateTimeOffset.UtcNow - _fetchedAt < Ttl)
                return _keys;

            var json = await _http.GetStringAsync(jwksUri, ct);
            _keys = new JsonWebKeySet(json).GetSigningKeys();
            _fetchedAt = DateTimeOffset.UtcNow;
            return _keys;
        }
        finally
        {
            _gate.Release();
        }
    }
}
