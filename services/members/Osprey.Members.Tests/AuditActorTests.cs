using System.Security.Claims;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Pure-core tests for actor extraction (ADR-0017) — no Mongo, no HttpContext.
/// The sub claim becomes the actor; absence of any principal falls back to the honest
/// "anonymous (auth disabled)" literal rather than inventing a user.
/// </summary>
public sealed class AuditActorTests
{
    [Fact]
    public void Sub_claim_becomes_the_actor()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", "admin-erik")], "test"));
        Assert.Equal("admin-erik", Audit.Caller.Actor(principal));
    }

    [Fact]
    public void Mapped_nameidentifier_claim_becomes_the_actor()
    {
        // JwtBearer maps "sub" to ClaimTypes.NameIdentifier by default — cover that shape too.
        var principal = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "admin-ada")], "test"));
        Assert.Equal("admin-ada", Audit.Caller.Actor(principal));
    }

    [Fact]
    public void No_principal_falls_back_to_the_anonymous_literal()
    {
        Assert.Equal(AuditActions.Anonymous, Audit.Caller.Actor((ClaimsPrincipal?)null));
    }

    [Fact]
    public void Unauthenticated_principal_falls_back_to_the_anonymous_literal()
    {
        // An anonymous request carries a principal with no identity/claims — still anonymous.
        Assert.Equal(AuditActions.Anonymous, Audit.Caller.Actor(new ClaimsPrincipal(new ClaimsIdentity())));
    }
}
