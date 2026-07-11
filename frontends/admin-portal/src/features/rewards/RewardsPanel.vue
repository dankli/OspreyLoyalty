<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { createReward, deleteReward, getRewards, updateReward, type Reward } from "./api";

const { t } = useI18n();

interface Row extends Reward {
  saved: boolean;
  error: string;
}

const rows = ref<Row[]>([]);
const loadError = ref("");
const formError = ref("");

const newId = ref("");
const newName = ref("");
const newCost = ref(10000);

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

async function refresh() {
  rows.value = (await getRewards()).map((r) => ({ ...r, saved: false, error: "" }));
}

onMounted(async () => {
  try {
    await refresh();
  } catch (e) {
    loadError.value = errorMessage(e);
  }
});

async function save(row: Row) {
  row.saved = false;
  row.error = "";
  try {
    await updateReward(row.id, row.name, row.cost);
    row.saved = true;
    setTimeout(() => {
      row.saved = false;
    }, 2500);
  } catch (e) {
    row.error = errorMessage(e);
  }
}

async function create() {
  formError.value = "";
  try {
    await createReward({ id: newId.value, name: newName.value, cost: newCost.value });
    newId.value = "";
    newName.value = "";
    await refresh();
  } catch (e) {
    formError.value = errorMessage(e);
  }
}

async function remove(row: Row) {
  if (!window.confirm(t("rewardsAdmin.deletePrompt", { name: row.name }))) return;
  formError.value = "";
  try {
    await deleteReward(row.id);
    await refresh();
  } catch (e) {
    formError.value = errorMessage(e);
  }
}
</script>

<template>
  <section class="panel">
    <h2>{{ $t("rewardsAdmin.title") }}</h2>
    <p v-if="loadError" class="error-text">{{ loadError }}</p>
    <ul class="rate-list">
      <li v-for="row in rows" :key="row.id" class="rate-row">
        <code class="reward-id">{{ row.id }}</code>
        <input v-model="row.name" :aria-label="$t('rewardsAdmin.nameFor', { id: row.id })" />
        <input
          v-model.number="row.cost"
          type="number"
          step="500"
          min="1"
          :aria-label="$t('rewardsAdmin.costFor', { id: row.id })"
        />
        <button @click="save(row)">{{ $t("rewardsAdmin.save") }}</button>
        <button class="danger" @click="remove(row)">{{ $t("rewardsAdmin.delete") }}</button>
        <span v-if="row.saved" class="flash">{{ $t("rewardsAdmin.saved") }}</span>
        <span v-if="row.error" class="error-text">{{ row.error }}</span>
      </li>
    </ul>
    <form class="reward-form" @submit.prevent="create">
      <input v-model="newId" :placeholder="$t('rewardsAdmin.idPlaceholder')" :aria-label="$t('rewardsAdmin.id')" required />
      <input v-model="newName" :placeholder="$t('rewardsAdmin.namePlaceholder')" :aria-label="$t('rewardsAdmin.name')" required />
      <input v-model.number="newCost" type="number" step="500" min="1" :aria-label="$t('rewardsAdmin.cost')" />
      <button type="submit">{{ $t("rewardsAdmin.create") }}</button>
      <span v-if="formError" class="error-text">{{ formError }}</span>
    </form>
  </section>
</template>

<style scoped>
.reward-id {
  min-width: 9rem;
  opacity: 0.75;
}

.reward-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  margin-top: 0.75rem;
}
</style>
