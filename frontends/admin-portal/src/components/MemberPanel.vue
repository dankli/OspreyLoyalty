<script setup lang="ts">
import { computed, ref } from "vue";
import {
  adjustPoints,
  findMemberByEmail,
  getTransactions,
  setPandion,
  type MemberProfile,
  type Transaction,
} from "../api";

const email = ref("");
const profile = ref<MemberProfile | null>(null);
const transactions = ref<Transaction[]>([]);
const lookupError = ref("");

const adjustmentPoints = ref<number | null>(null);
const adjustmentReason = ref("");
const adjustmentError = ref("");

const pandionError = ref("");
const busy = ref(false);

const isPandion = computed(() => profile.value?.tier === "PANDION");

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

async function refresh() {
  const found = await findMemberByEmail(email.value.trim());
  profile.value = found;
  transactions.value = (await getTransactions(found.id)).items;
}

async function lookUp() {
  lookupError.value = "";
  adjustmentError.value = "";
  pandionError.value = "";
  busy.value = true;
  try {
    await refresh();
  } catch (e) {
    profile.value = null;
    transactions.value = [];
    lookupError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function submitAdjustment() {
  if (!profile.value || adjustmentPoints.value == null || !adjustmentReason.value.trim()) return;
  adjustmentError.value = "";
  busy.value = true;
  try {
    await adjustPoints(profile.value.id, adjustmentPoints.value, adjustmentReason.value.trim());
    adjustmentPoints.value = null;
    adjustmentReason.value = "";
    await refresh();
  } catch (e) {
    adjustmentError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function togglePandion() {
  if (!profile.value) return;
  const invited = !isPandion.value;
  const prompt = invited
    ? `Grant a PANDION invitation to ${profile.value.name}?`
    : `Revoke the PANDION invitation for ${profile.value.name}?`;
  if (!confirm(prompt)) return;
  pandionError.value = "";
  busy.value = true;
  try {
    profile.value = await setPandion(profile.value.id, invited);
  } catch (e) {
    pandionError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <h2>Member lookup</h2>

    <form class="lookup-form" @submit.prevent="lookUp">
      <input
        v-model="email"
        type="email"
        aria-label="Member email"
        placeholder="member@example.com"
        required
      />
      <button type="submit" aria-label="Look up" :disabled="busy">Look up</button>
    </form>
    <p v-if="lookupError" class="error-text">{{ lookupError }}</p>

    <template v-if="profile">
      <div class="profile-card">
        <div class="profile-head">
          <strong>{{ profile.name }}</strong>
          <span class="tier-badge" :class="{ pandion: isPandion }">{{ profile.tier }}</span>
        </div>
        <p class="muted">{{ profile.email }} · joined {{ new Date(profile.joinedAtUtc).toLocaleDateString() }}</p>
        <dl class="balances">
          <div><dt>Spendable</dt><dd>{{ profile.spendablePoints }}</dd></div>
          <div><dt>Qualifying</dt><dd>{{ profile.qualifyingPoints }}</dd></div>
          <div v-if="profile.pointsToNextTier != null">
            <dt>To next tier</dt><dd>{{ profile.pointsToNextTier }}</dd>
          </div>
        </dl>
      </div>

      <h3>Transactions</h3>
      <table class="transactions">
        <thead>
          <tr><th>When</th><th>Type</th><th>Points</th><th>Source</th></tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.id">
            <td>{{ new Date(tx.occurredAtUtc).toLocaleDateString() }}</td>
            <td><span class="type-badge">{{ tx.type }}</span></td>
            <td :class="tx.points >= 0 ? 'positive' : 'negative'">{{ tx.points }}</td>
            <td>{{ tx.source }}</td>
          </tr>
        </tbody>
      </table>

      <h3>Adjust points</h3>
      <form class="adjustment-form" @submit.prevent="submitAdjustment">
        <input
          v-model.number="adjustmentPoints"
          type="number"
          aria-label="Adjustment points"
          placeholder="Points (negative to deduct)"
          required
        />
        <input
          v-model="adjustmentReason"
          type="text"
          aria-label="Adjustment reason"
          placeholder="Reason"
          required
        />
        <button type="submit" :disabled="busy">Apply adjustment</button>
      </form>
      <p v-if="adjustmentError" class="error-text">{{ adjustmentError }}</p>

      <h3>PANDION</h3>
      <button class="pandion-toggle" :disabled="busy" @click="togglePandion">
        {{ isPandion ? "Revoke PANDION invitation" : "Grant PANDION invitation" }}
      </button>
      <p v-if="pandionError" class="error-text">{{ pandionError }}</p>
    </template>
  </section>
</template>
