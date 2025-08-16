import { LlamaModel, LlamaContext, LlamaChatSession } from "node-llama-cpp";
import FHIR from "fhir-kit-client";
import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Resolve model path (env > explicit file > first .gguf in models/) ----
function resolveModelPath(): string {
  if (process.env.MODEL_PATH && fs.existsSync(process.env.MODEL_PATH)) {
    return process.env.MODEL_PATH;
  }
  const modelsDir = path.join(__dirname, "..", "models");
  if (!fs.existsSync(modelsDir)) {
    throw new Error(`Models directory not found at: ${modelsDir}`);
  }
  const ggufs = fs.readdirSync(modelsDir).filter(f => f.endsWith(".gguf"));
  if (ggufs.length === 0) {
    throw new Error(`No .gguf model found in ${modelsDir}. Place your model there or set MODEL_PATH.`);
  }
  // Prefer TinyLlama if present, else first gguf
  const tiny = ggufs.find(f => f.toLowerCase().includes("tinyllama")) || ggufs[0];
  return path.join(modelsDir, tiny);
}

const MODEL_PATH = resolveModelPath();

// ---- SQLite (demo DB name: mimiciii_demo.db) ----
const dbPath = path.join(__dirname, "..", "mimiciii_demo.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.warn("⚠️ SQLite open error:", err.message);
  else console.log(`✅ SQLite DB opened: ${dbPath}`);
});

// ---- FHIR client to HAPI public server ----
const fhirClient = new FHIR({ baseUrl: "https://hapi.fhir.org/baseR4" });

// ---- Initialize local LLM session ----
let session: LlamaChatSession;
try {
  const model = new LlamaModel({ modelPath: MODEL_PATH });
  const context = new LlamaContext({ model, contextSize: 2048 }); // << nCtx -> contextSize
  session = new LlamaChatSession({ context });
  console.log(`✅ Local LLM initialized: ${MODEL_PATH}`);
} catch (e) {
  console.error("❌ Failed to initialize local GGUF model:", e);
  throw e;
}

export async function getSummaryFromDB({ patientId }: { patientId: string }): Promise<any> {
  return new Promise((resolve) => {
    const sql = "SELECT TEXT FROM NOTEEVENTS WHERE SUBJECT_ID = ? AND CATEGORY = 'Discharge summary' LIMIT 1";
    db.get(sql, [patientId], async (err, row: { TEXT: string } | undefined) => {
      if (err || !row) {
        return resolve({ summary: `No discharge summary found for patient ID ${patientId} in the local DB.` });
      }
      try {
        console.log(`[Local LLM] Summarizing note from DB for patient ${patientId}...`);
        const prompt =
          "You are a clinical AI assistant. Summarize the following discharge note into a concise, factual paragraph:\n\n" +
          row.TEXT;
        const result = await session.prompt(prompt, { maxTokens: 160, temperature: 0.3 });
        resolve({ source: "SQLite (MIMIC-III)", patientId, ai_summary: result });
      } catch (e) {
        resolve({ summary: "Failed to generate AI summary from DB note." });
      }
    });
  });
}

export async function getSummaryFromFHIR({ patientId }: { patientId: string }): Promise<any> {
  try {
    console.log(`[FHIR] Reading patient: ${patientId}`);
    const patient: any = await fhirClient.read({ resourceType: "Patient", id: patientId }).catch(() => null);
    if (!patient) return { summary: `Patient "${patientId}" not found.` };

    const conditions: any = await fhirClient.search({
      resourceType: "Condition",
      searchParams: { patient: patientId, clinical_status: "active" }
    }).catch(() => null);

    const observations: any = await fhirClient.search({
      resourceType: "Observation",
      searchParams: { patient: patientId, _sort: "-date", _count: "5" }
    }).catch(() => null);

    const given = patient?.name?.[0]?.given?.join(" ") || "Unknown";
    const family = patient?.name?.[0]?.family || "";
    const birth = patient?.birthDate || "Unknown";

    let clinicalText = `Patient: ${given} ${family}, born ${birth}.\n\nActive Conditions:\n`;
    const condEntries = conditions?.entry ?? [];
    if (condEntries.length) {
      for (const entry of condEntries) {
        const text = entry?.resource?.code?.text || entry?.resource?.code?.coding?.[0]?.display || "Condition";
        clinicalText += `- ${text}\n`;
      }
    } else {
      clinicalText += "- No active conditions found.\n";
    }

    clinicalText += "\nRecent Observations:\n";
    const obsEntries = observations?.entry ?? [];
    if (obsEntries.length) {
      for (const entry of obsEntries) {
        const obs = entry?.resource;
        const label = obs?.code?.text || obs?.code?.coding?.[0]?.display || "Observation";
        if (obs?.valueQuantity?.value != null) {
          const val = parseFloat(String(obs.valueQuantity.value));
          const unit = obs?.valueQuantity?.unit || "";
          const dt = obs?.effectiveDateTime || "";
          clinicalText += `- ${label}: ${isNaN(val) ? obs.valueQuantity.value : val.toFixed(2)} ${unit} ${dt ? `on ${dt}` : ""}\n`;
        } else if (obs?.valueCodeableConcept?.text) {
          clinicalText += `- ${label}: ${obs.valueCodeableConcept.text}\n`;
        } else {
          clinicalText += `- ${label}\n`;
        }
      }
    } else {
      clinicalText += "- No recent observations found.\n";
    }

    console.log(`[Local LLM] Summarizing FHIR data for patient ${patientId}...`);
    const prompt =
      "You are a clinical AI assistant. Summarize the following patient record into a concise, single paragraph:\n\n" +
      clinicalText;
    const result = await session.prompt(prompt, { maxTokens: 160, temperature: 0.3 });

    return {
      source: "FHIR",
      patientId: patient.id,
      patientName: `${given} ${family}`.trim(),
      ai_summary: result
    };
  } catch (error) {
    return { summary: `An error occurred while summarizing FHIR data for patient "${patientId}".` };
  }
}

export async function searchGuidelines({ topic }: { topic: string }): Promise<any> {
  // Placeholder. Replace with PubMed/NICE/etc. later.
  const mockGuidelines = [
    {
      guidelineId: "GUID-HTN-01",
      topic: "hypertension",
      title: "2024 ACC/AHA Guideline for the Management of Hypertension"
    }
  ];
  const searchTopic = topic.toLowerCase();
  const results = mockGuidelines.filter((g) => g.topic.includes(searchTopic));
  return results.length > 0 ? results : { error: `No guidelines found for topic "${topic}".` };
}
