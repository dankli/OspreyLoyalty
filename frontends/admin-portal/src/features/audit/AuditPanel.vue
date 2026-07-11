<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getAuditLog, type AuditEntry } from "./api";

const entries = ref<AuditEntry[]>([]);
const page = ref(0);
const hasMore = ref(false);
const loadError = ref("");

async function load(next: number) {
  loadError.value = "";
  try {
    const result = await getAuditLog(next);
    entries.value = result.items;
    page.value = result.page;
    hasMore.value = result.hasMore;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : "Something went wrong";
  }
}

onMounted(() => load(0));

function detailsText(entry: AuditEntry): string {
  return Object.entries(entry.details)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
</script>

<template>
  <section class="panel">
    <h2>{{ $t("audit.title") }}</h2>
    <p v-if="loadError" class="error-text">{{ loadError }}</p>
    <p v-else-if="entries.length === 0" class="empty">{{ $t("audit.empty") }}</p>
    <table v-else class="audit-table">
      <thead>
        <tr>
          <th>{{ $t("audit.when") }}</th>
          <th>{{ $t("audit.actor") }}</th>
          <th>{{ $t("audit.action") }}</th>
          <th>{{ $t("audit.member") }}</th>
          <th>{{ $t("audit.details") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.correlationId + entry.occurredAtUtc">
          <td>{{ new Date(entry.occurredAtUtc).toLocaleString($i18n.locale) }}</td>
          <td>{{ entry.actor }}</td>
          <td><code>{{ entry.action }}</code></td>
          <td>{{ entry.targetMemberId }}</td>
          <td class="details">{{ detailsText(entry) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="pager">
      <button :disabled="page === 0" @click="load(page - 1)">{{ $t("audit.previous") }}</button>
      <button :disabled="!hasMore" @click="load(page + 1)">{{ $t("audit.next") }}</button>
    </div>
  </section>
</template>

<style scoped>
.audit-table {
  width: 100%;
  border-collapse: collapse;
}

.details {
  font-size: 0.85em;
  opacity: 0.8;
}

.pager {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.empty {
  opacity: 0.7;
}
</style>
