#!/usr/bin/env node

import { build } from "vite";

process.env.SEMOGTW_PUBLIC_BUILD = "1";
await build();
await import("../../scripts/check-public-web-bundle.mjs");
