using System.Text.RegularExpressions;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class AdminRewards
{
    public static partial class Validation
    {
        private const int MaxNameLength = 100;
        private const int MaxCost = 1_000_000;

        [GeneratedRegex("^[a-z0-9-]{2,40}$")]
        private static partial Regex IdShape();

        public static ValidationError? CheckCreate(CreateRequest request)
        {
            if (request.Id is null || !IdShape().IsMatch(request.Id))
                return ValidationError.Of("reward_slug_invalid");
            return CheckNameAndCost(request.Name, request.Cost);
        }

        public static ValidationError? CheckUpdate(string id, UpdateRequest request)
        {
            if (id is null || !IdShape().IsMatch(id))
                return ValidationError.Of("reward_slug_invalid");
            return CheckNameAndCost(request.Name, request.Cost);
        }

        private static ValidationError? CheckNameAndCost(string? name, int cost)
        {
            if (string.IsNullOrWhiteSpace(name) || name.Length > MaxNameLength)
                return ValidationError.Of("reward_name_invalid", MaxNameLength);
            if (cost is < 1 or > MaxCost)
                return ValidationError.Of("reward_cost_invalid", MaxCost);
            return null;
        }
    }
}
