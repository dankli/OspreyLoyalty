<script setup lang="ts">
import { computed, ref } from "vue";
import {
  adjustPoints,
  findMemberByEmail,
  getTransactions,
  setOsprey,
  type MemberProfile,
  type Transaction,
} from "./api";
import i18n from "../../i18n";

const email = ref("");
const profile = ref<MemberProfile | null>(null);
const transactions = ref<Transaction[]>([]);
const lookupError = ref("");

const adjustmentPoints = ref<number | null>(null);
const adjustmentReason = ref("");
const adjustmentError = ref("");

const ospreyError = ref("");
const busy = ref(false);

// Seeded demo members (see SeedDemoData) — pick one to look it up without typing an email.
const demoMembers = [
  { name: "Ada Lindqvist", email: "ada@example.com" },
  { name: "Erik Boman", email: "erik@example.com" },
  { name: "Yusra Ali", email: "yusra@example.com" },
];

const isOsprey = computed(() => profile.value?.tier === "OSPREY");

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
  ospreyError.value = "";
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

// Quick-pick: selecting a demo member fills the email and runs the same lookup.
async function pickMember(event: Event) {
  const picked = (event.target as HTMLSelectElement).value;
  if (!picked) return;
  email.value = picked;
  await lookUp();
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

async function toggleOsprey() {
  if (!profile.value) return;
  const invited = !isOsprey.value;
  const prompt = invited
    ? i18n.global.t("member.grantPrompt", { name: profile.value.name })
    : i18n.global.t("member.revokePrompt", { name: profile.value.name });
  if (!confirm(prompt)) return;
  ospreyError.value = "";
  busy.value = true;
  try {
    profile.value = await setOsprey(profile.value.id, invited);
  } catch (e) {
    ospreyError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <h2>{{ $t("member.heading") }}</h2>

    <label class="quick-pick">
      {{ $t("member.quickPick") }}
      <select :aria-label="$t('member.quickPickAria')" :disabled="busy" @change="pickMember">
        <option value="">{{ $t("member.selectMember") }}</option>
        <option v-for="m in demoMembers" :key="m.email" :value="m.email">{{ m.name }}</option>
      </select>
    </label>

    <form class="lookup-form" @submit.prevent="lookUp">
      <input
        v-model="email"
        type="email"
        :aria-label="$t('member.emailAria')"
        :placeholder="$t('member.emailPlaceholder')"
        required
      />
      <button type="submit" :aria-label="$t('member.lookUp')" :disabled="busy">{{ $t("member.lookUp") }}</button>
    </form>
    <p v-if="lookupError" class="error-text">{{ lookupError }}</p>

    <template v-if="profile">
      <div class="profile-card">
        <div class="profile-head">
          <strong>{{ profile.name }}</strong>
          <span class="tier-badge" :class="{ osprey: isOsprey }">{{ profile.tier }}</span>
        </div>
        <p class="muted">
          {{ profile.email }} · {{ $t("member.joined") }}
          {{ new Date(profile.joinedAtUtc).toLocaleDateString($i18n.locale) }}
        </p>
        <dl class="balances">
          <div><dt>{{ $t("member.spendable") }}</dt><dd>{{ profile.spendablePoints }}</dd></div>
          <div><dt>{{ $t("member.qualifying") }}</dt><dd>{{ profile.qualifyingPoints }}</dd></div>
          <div v-if="profile.pointsToNextTier != null">
            <dt>{{ $t("member.toNextTier") }}</dt><dd>{{ profile.pointsToNextTier }}</dd>
          </div>
        </dl>
      </div>

      <h3>{{ $t("member.transactions") }}</h3>
      <table class="transactions">
        <thead>
          <tr>
            <th>{{ $t("member.colWhen") }}</th>
            <th>{{ $t("member.colType") }}</th>
            <th>{{ $t("member.colPoints") }}</th>
            <th>{{ $t("member.colSource") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.id">
            <td>{{ new Date(tx.occurredAtUtc).toLocaleDateString($i18n.locale) }}</td>
            <td><span class="type-badge">{{ tx.type }}</span></td>
            <td :class="tx.points >= 0 ? 'positive' : 'negative'">{{ tx.points }}</td>
            <td>{{ tx.source }}</td>
          </tr>
        </tbody>
      </table>

      <h3>{{ $t("member.adjustPoints") }}</h3>
      <form class="adjustment-form" @submit.prevent="submitAdjustment">
        <input
          v-model.number="adjustmentPoints"
          type="number"
          :aria-label="$t('member.adjustPointsAria')"
          :placeholder="$t('member.adjustPointsPlaceholder')"
          required
        />
        <input
          v-model="adjustmentReason"
          type="text"
          :aria-label="$t('member.adjustReasonAria')"
          :placeholder="$t('member.adjustReasonPlaceholder')"
          required
        />
        <button type="submit" :disabled="busy">{{ $t("member.applyAdjustment") }}</button>
      </form>
      <p v-if="adjustmentError" class="error-text">{{ adjustmentError }}</p>

      <h3>{{ $t("member.osprey") }}</h3>
      <button class="osprey-toggle" :disabled="busy" @click="toggleOsprey">
        {{ isOsprey ? $t("member.revokeOsprey") : $t("member.grantOsprey") }}
      </button>
      <p v-if="ospreyError" class="error-text">{{ ospreyError }}</p>
    </template>
  </section>
</template>
