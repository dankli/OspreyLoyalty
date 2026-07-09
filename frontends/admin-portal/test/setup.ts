import { config } from "@vue/test-utils";
import i18n from "../src/i18n";

// Install the i18n plugin globally so every mounted component resolves $t (default locale: en).
config.global.plugins = [i18n];
