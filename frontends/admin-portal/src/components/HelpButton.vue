<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const open = ref(false);

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <button type="button" class="help-trigger" :aria-label="$t('help.open')" @click="open = true">?</button>
  <!-- Teleport to body so the fixed overlay escapes the header's stacking context and sits above content. -->
  <Teleport to="body">
    <div v-if="open" class="help-overlay" @click="open = false">
      <div class="help-dialog" role="dialog" aria-modal="true" :aria-label="$t('help.title')" @click.stop>
        <h2>{{ $t("help.title") }}</h2>
        <section><h3>{{ $t("help.lookupHeading") }}</h3><p>{{ $t("help.lookupBody") }}</p></section>
        <section><h3>{{ $t("help.adjustHeading") }}</h3><p>{{ $t("help.adjustBody") }}</p></section>
        <section><h3>{{ $t("help.ospreyHeading") }}</h3><p>{{ $t("help.ospreyBody") }}</p></section>
        <section><h3>{{ $t("help.ratesHeading") }}</h3><p>{{ $t("help.ratesBody") }}</p></section>
        <button type="button" class="help-close" @click="open = false">{{ $t("help.close") }}</button>
      </div>
    </div>
  </Teleport>
</template>
