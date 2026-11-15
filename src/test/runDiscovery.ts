import { runIntegration } from "./runIntegration";

void runIntegration(false, true).catch(error => { console.error(error); process.exitCode = 1; });
