import { runIntegration } from "./runIntegration";

void runIntegration(true).catch(error => { console.error(error); process.exitCode = 1; });
