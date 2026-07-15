#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const fileArg = process.argv[2] ?? "firebase-service-account.json";
const filePath = path.resolve(process.cwd(), fileArg);

if (!fs.existsSync(filePath)) {
  console.error(`找不到 Firebase service account 檔案：${filePath}`);
  console.error("用法：node scripts/firebase-service-account-to-env.mjs path/to/service-account.json");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const json = JSON.parse(raw);

const projectId = String(json.project_id ?? "").trim();
const clientEmail = String(json.client_email ?? "").trim();
const privateKey = String(json.private_key ?? "").replace(/\n/g, "\\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("service account JSON 缺少 project_id、client_email 或 private_key。");
  process.exit(1);
}

console.log("FIREBASE_PROJECT_ID=" + projectId);
console.log("FIREBASE_CLIENT_EMAIL=" + clientEmail);
console.log('FIREBASE_PRIVATE_KEY="' + privateKey + '"');
