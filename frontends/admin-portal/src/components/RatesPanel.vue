<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getPartners, updateRate } from "../api";

interface Row {
  id: string;
  name: string;
  rate: number;
  saved: boolean;
  error: string;
}

const rows = ref<Row[]>([]);
const loadError = ref("");

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

onMounted(async () => {
  try {
    rows.value = (await getPartners()).map((p) => ({
      id: p.id,
      name: p.name,
      rate: p.rate,
      saved: false,
      error: "",
    }));
  } catch (e) {
    loadError.value = errorMessage(e);
  }
});

async function save(row: Row) {
  row.saved = false;
  row.error = "";
  try {
    const updated = await updateRate(row.id, row.rate);
    row.rate = updated.rate;
    row.saved = true;
    setTimeout(() => {
      row.saved = false;
    }, 2500);
  } catch (e) {
    row.error = errorMessage(e);
  }
}
</script>

<template>
  <section class="panel">
    <h2>{{ $t("rates.title") }}</h2>
    <p v-if="loadError" class="error-text">{{ loadError }}</p>
    <ul class="rate-list">
      <li v-for="row in rows" :key="row.id" class="rate-row">
        <span class="rate-name">{{ row.name }}</span>
        <input
          v-model.number="row.rate"
          type="number"
          step="0.1"
          min="0"
          :aria-label="$t('rates.rateFor', { name: row.name })"
        />
        <button @click="save(row)">{{ $t("rates.save") }}</button>
        <span v-if="row.saved" class="flash">{{ $t("rates.saved") }}</span>
        <span v-if="row.error" class="error-text">{{ row.error }}</span>
      </li>
    </ul>
  </section>
</template>
