import{defineConfig}from"@playwright/test";
export default defineConfig({timeout:30000,testDir:".",testMatch:"map.spec.ts",use:{baseURL:"http://127.0.0.1:4174"},reporter:"line"});
