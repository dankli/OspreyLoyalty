<script setup lang="ts">
// Deliberately small: two panels stacked on one page, no router.
// Admin flows here are member lookup/adjustments and partner rates.
import MemberPanel from "./components/MemberPanel.vue";
import RatesPanel from "./components/RatesPanel.vue";
</script>

<template>
  <header class="site-header">
    <h1>Osprey Loyalty — Admin</h1>
  </header>
  <main class="admin-main">
    <MemberPanel />
    <RatesPanel />
  </main>
</template>
