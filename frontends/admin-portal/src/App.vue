<script setup lang="ts">
// Deliberately small: two panels stacked on one page, no router.
// Admin flows here are member lookup/adjustments and partner rates.
import MemberPanel from "./features/members/MemberPanel.vue";
import RatesPanel from "./features/partners/RatesPanel.vue";
import HelpButton from "./HelpButton.vue";
import { SUPPORTED_LANGUAGES, changeLanguage } from "./i18n";
import { isAdmin } from "./auth";

// Read once at load — auth state changes only across a login/logout redirect (a full reload).
const canAdminister = isAdmin();
</script>

<template>
  <header class="site-header">
    <svg class="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M4.5 15.5c0-6 4.8-10.5 11-10.5 3.8 0 6.8 1.7 8.8 3.9l4.4 1.3-3.3 2.2c-.1 7-5 11.9-11 11.9-6 0-9.9-4.5-9.9-8.8Z"
        fill="#2e2213" stroke="#43331d" stroke-width="1" />
      <path d="M6.5 12.4h12.5" stroke="#140d06" stroke-width="2.6" stroke-linecap="round" opacity=".85" />
      <circle cx="12.6" cy="14.8" r="3.3" fill="#e3ae36" />
      <circle cx="12.6" cy="14.8" r="1.35" fill="#140d06" />
      <path d="M24.4 12.2l5.2 1.9-4.3 2.1" fill="#efe6d3" />
    </svg>
    <div class="titles">
      <span class="eyebrow">{{ $t("app.brand") }}</span>
      <h1>{{ $t("app.admin") }} <em>{{ $t("app.console") }}</em></h1>
    </div>
    <select class="lang-switch" :aria-label="$t('app.language')" :value="$i18n.locale"
      @change="(e) => changeLanguage((e.target as HTMLSelectElement).value)">
      <option v-for="l in SUPPORTED_LANGUAGES" :key="l.code" :value="l.code">{{ l.label }}</option>
    </select>
    <HelpButton />
  </header>
  <main class="admin-main">
    <template v-if="canAdminister">
      <MemberPanel />
      <RatesPanel />
    </template>
    <p v-else class="admin-only">{{ $t("app.adminOnly") }}</p>
  </main>
</template>
