
// src/tools.ts
import { LlamaModel, LlamaContext, LlamaChatSession } from "node-llama-cpp";
import FHIR from 'fhir-kit-client';
import sqlite3 from 'sqlite3';

// Initialize SQLite and FHIR clients
const db = new sqlite3.Database('/content/clinical-mcp/mimiciii_demo.db');
const fhirClient = new FHIR({ baseUrl: 'https://hapi.fhir.org/baseR4' });

// Initialize TinyLlama model
let session: LlamaChatSession;
try {
    const model = new LlamaModel({
        modelPath: "/path/to/tinyllama-1.1b-chat-v1.0.gguf" // Update with actual path to GGUF file
    });
    const context = new LlamaContext({ model, nCtx: 2048 }); // Match notebook's 2048 context length
    session = new LlamaChatSession({ context });
} catch (e) {
    console.error("Failed to initialize TinyLlama model:", e);
    throw e;
}

// Tool 1: Get Summary from Local MIMIC-III Database
export async function getSummaryFromDB({ patientId }: { patientId: string }): Promise<any> {
    return new Promise((resolve) => {
        const sql = "SELECT TEXT FROM NOTEEVENTS WHERE SUBJECT_ID = ? AND CATEGORY = 'Discharge summary' LIMIT 1";
        db.get(sql, [patientId], async (err, row: { TEXT: string } | undefined) => {
            if (err || !row) {
                return resolve({ summary: `No discharge summary found for patient ID ${patientId} in the local DB.` });
            }
            try {
                console.log(`[Local LLM] Summarizing note from DB for patient ${patientId}...`);
                const prompt = `<|system|>You are a clinical AI assistant specializing in summarizing patient notes accurately and concisely.<|assistant|>Summarize the following clinical discharge note into a concise paragraph: \n\n${row.TEXT}`;
                const result = await session.prompt(prompt, { maxTokens: 100, temperature: 0.3 });
                resolve({ source: 'SQLite (MIMIC-III)', patientId, ai_summary: result });
            } catch (e) {
                resolve({ summary: "Failed to generate AI summary from DB note." });
            }
        });
    });
}

// Tool 2: Get ENHANCED Summary from Live FHIR Server
export async function getSummaryFromFHIR({ patientId }: { patientId: string }): Promise<any> {
    try {
        console.log(`[FHIR] Searching for patient with ID: ${patientId}`);
        // Fetch patient demographics
        const patient = await fhirClient.read({ resourceType: 'Patient', id: patientId });

        // Fetch patient's active conditions
        const conditions = await fhirClient.search({
            resourceType: 'Condition',
            searchParams: { patient: patientId, clinical_status: 'active' }
        });

        // Fetch recent lab observations
        const observations = await fhirClient.search({
            resourceType: 'Observation',
            searchParams: { patient: patientId, _sort: '-date', _count: '5' }
        });

        // Build clinical context
        let clinicalText = `Patient: ${patient.name[0].given.join(' ')} ${patient.name[0].family}, born ${patient.birthDate}.\n\n`;
        clinicalText += "Active Conditions:\n";
        if (conditions.entry && conditions.entry.length > 0) {
            conditions.entry.forEach((entry: any) => {
                clinicalText += `- ${entry.resource.code.text}\n`;
            });
        } else {
            clinicalText += "- No active conditions found.\n";
        }

        clinicalText += "\nRecent Observations:\n";
        if (observations.entry && observations.entry.length > 0) {
            observations.entry.forEach((entry: any) => {
                const obs = entry.resource;
                if (obs.valueQuantity) {
                    clinicalText += `- ${obs.code.text}: ${obs.valueQuantity.value.toFixed(2)} ${obs.valueQuantity.unit} on ${obs.effectiveDateTime}\n`;
                } else if (obs.valueCodeableConcept) {
                    clinicalText += `- ${obs.code.text}: ${obs.valueCodeableConcept.text}\n`;
                }
            });
        } else {
            clinicalText += "- No recent observations found.\n";
        }

        // Summarize with local LLM
        console.log(`[Local LLM] Summarizing enhanced data from FHIR for patient ${patientId}...`);
        const prompt = `<|system|>You are a clinical AI assistant specializing in summarizing patient notes accurately and concisely.<|assistant|>Summarize the following clinical data into a concise, one-paragraph clinical summary: \n\n${clinicalText}`;
        const result = await session.prompt(prompt, { maxTokens: 100, temperature: 0.3 });
        return {
            source: 'FHIR',
            patientId: patient.id,
            patientName: `${patient.name[0].given.join(' ')} ${patient.name[0].family}`,
            ai_summary: result
        };
    } catch (error) {
        return { summary: `Patient with ID '${patientId}' not found or an error occurred on the FHIR server.` };
    }
}

// Tool 3: Search Guidelines (Unchanged)
export async function searchGuidelines({ topic }: { topic: string }): Promise<any> {
    const mockGuidelines = [{ guidelineId: "GUID-HTN-01", topic: "hypertension", title: "2024 ACC/AHA Guideline for the Management of Hypertension" }];
    const searchTopic = topic.toLowerCase();
    const results = mockGuidelines.filter(g => g.topic.includes(searchTopic));
    return results.length > 0 ? results : { error: `No guidelines found for topic '${topic}'.` };
}
