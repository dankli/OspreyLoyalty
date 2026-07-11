<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { createCampaign, deleteCampaign, getCampaigns, type Campaign } from "./api";
import { getPartners, type Partner } from "../partners/api";

const { t } = useI18n();

const campaigns = ref<Campaign[]>([]);
const partners = ref<Partner[]>([]);
const loadError = ref("");
const formError = ref("");
const created = ref(false);

const name = ref("");
const partnerId = ref("");
const multiplier = ref(2);
const startsAt = ref("");
const endsAt = ref("");

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

async function refresh() {
  campaigns.value = await getCampaigns();
}

onMounted(async () => {
  try {
    partners.value = await getPartners();
    partnerId.value = partners.value[0]?.id ?? "";
    await refresh();
  } catch (e) {
    loadError.value = errorMessage(e);
  }
});

async function create() {
  formError.value = "";
  created.value = false;
  try {
    // datetime-local values are timezone-less; treat them as the admin's local time.
    await createCampaign({
      partnerId: partnerId.value,
      name: name.value,
      multiplier: multiplier.value,
      startsAtUtc: new Date(startsAt.value).toISOString(),
      endsAtUtc: new Date(endsAt.value).toISOString(),
    });
    name.value = "";
    created.value = true;
    setTimeout(() => {
      created.value = false;
    }, 2500);
    await refresh();
  } catch (e) {
    formError.value = errorMessage(e);
  }
}

async function remove(campaign: Campaign) {
  if (!window.confirm(t("campaigns.deletePrompt", { name: campaign.name }))) return;
  formError.value = "";
  try {
    await deleteCampaign(campaign.id);
    await refresh();
  } catch (e) {
    formError.value = errorMessage(e);
  }
}

function window_(campaign: Campaign): string {
  const locale = navigator.language;
  return `${new Date(campaign.startsAtUtc).toLocaleDateString(locale)} – ${new Date(campaign.endsAtUtc).toLocaleDateString(locale)}`;
}
</script>

<template>
  <section class="panel">
    <h2>{{ $t("campaigns.title") }}</h2>
    <p v-if="loadError" class="error-text">{{ loadError }}</p>

    <p v-if="campaigns.length === 0" class="empty">{{ $t("campaigns.empty") }}</p>
    <table v-else class="campaign-table">
      <thead>
        <tr>
          <th>{{ $t("campaigns.name") }}</th>
          <th>{{ $t("campaigns.partner") }}</th>
          <th>{{ $t("campaigns.multiplier") }}</th>
          <th>{{ $t("campaigns.colWindow") }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="campaign in campaigns" :key="campaign.id">
          <td>{{ campaign.name }}</td>
          <td>{{ campaign.partnerId }}</td>
          <td>×{{ campaign.multiplier }}</td>
          <td>{{ window_(campaign) }}</td>
          <td>
            <button class="danger" @click="remove(campaign)">{{ $t("campaigns.delete") }}</button>
          </td>
        </tr>
      </tbody>
    </table>

    <form class="campaign-form" @submit.prevent="create">
      <input v-model="name" :placeholder="$t('campaigns.namePlaceholder')" :aria-label="$t('campaigns.name')" required />
      <select v-model="partnerId" :aria-label="$t('campaigns.partnerAria')">
        <option v-for="partner in partners" :key="partner.id" :value="partner.id">{{ partner.name }}</option>
      </select>
      <input
        v-model.number="multiplier"
        type="number"
        step="0.1"
        min="1.1"
        max="5"
        :aria-label="$t('campaigns.multiplierAria')"
      />
      <label>
        {{ $t("campaigns.starts") }}
        <input v-model="startsAt" type="datetime-local" required />
      </label>
      <label>
        {{ $t("campaigns.ends") }}
        <input v-model="endsAt" type="datetime-local" required />
      </label>
      <button type="submit">{{ $t("campaigns.create") }}</button>
      <span v-if="created" class="flash">{{ $t("campaigns.created") }}</span>
      <span v-if="formError" class="error-text">{{ formError }}</span>
    </form>
  </section>
</template>

<style scoped>
.campaign-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

.campaign-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}

.campaign-form label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}

.empty {
  opacity: 0.7;
}
</style>
