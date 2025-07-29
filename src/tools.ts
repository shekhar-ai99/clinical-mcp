// src/tools.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import FHIR from 'fhir-kit-client';
import sqlite3 from 'sqlite3';

// --- Initialize ALL Clients ---

const db = new sqlite3.Database('/content/clinical-mcp/mimiciii_demo.db');
const fhirClient = new FHIR({ baseUrl: 'https://hapi.fhir.org/baseR4' });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY environment variable not set.");
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});


// --- Tool 1: Get Summary from Local MIMIC-III Database ---

export async function getSummaryFromDB({ patientId }: { patientId: string }): Promise<any> {
  return new Promise((resolve) => {
    const sql = "SELECT TEXT FROM NOTEEVENTS WHERE SUBJECT_ID = ? AND CATEGORY = 'Discharge summary' LIMIT 1";
    
    db.get(sql, [patientId], async (err, row: { TEXT: string } | undefined) => {
      if (err || !row) {
        return resolve({ summary: `No discharge summary found for patient ID ${patientId} in the local DB.` });
      }
      try {
        console.log(`[Gemini] Summarizing note from DB for patient ${patientId}...`);
        const prompt = `Summarize the following clinical discharge note into a concise paragraph: \n\n${row.TEXT}`;
        const result = await model.generateContent(prompt);
        resolve({ source: 'SQLite (MIMIC-III)', patientId, ai_summary: result.response.text() });
      } catch (e) {
        resolve({ summary: "Failed to generate AI summary from DB note." });
      }
    });
  });
}

// --- Tool 2: Get ENHANCED Summary from Live FHIR Server ---

export async function getSummaryFromFHIR({ patientId }: { patientId: string }): Promise<any> {
  try {
    console.log(`[FHIR] Searching for patient with ID: ${patientId}`);
    // Step 1: Fetch patient demographics
    const patient = await fhirClient.read({ resourceType: 'Patient', id: patientId });

    // Step 2: Fetch patient's active conditions (diagnoses)
    const conditions = await fhirClient.search({
      resourceType: 'Condition',
      searchParams: { patient: patientId, clinical_status: 'active' }
    });

    // Step 3: Fetch patient's recent lab observations
    const observations = await fhirClient.search({
      resourceType: 'Observation',
      searchParams: { patient: patientId, _sort: '-date', _count: '5' }
    });

    // Step 4: Build a much richer clinical context for the AI
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
            if (obs.valueQuantity) { // For numeric values like blood pressure
               clinicalText += `- ${obs.code.text}: ${obs.valueQuantity.value.toFixed(2)} ${obs.valueQuantity.unit} on ${obs.effectiveDateTime}\n`;
            } else if (obs.valueCodeableConcept) { // For categorical values like blood type
               clinicalText += `- ${obs.code.text}: ${obs.valueCodeableConcept.text}\n`;
            }
        });
    } else {
        clinicalText += "- No recent observations found.\n";
    }

    // Step 5: Send the enhanced context to Gemini
    console.log(`[Gemini] Summarizing enhanced data from FHIR for patient ${patientId}...`);
    const prompt = `Summarize the following clinical data into a concise, one-paragraph clinical summary: \n\n${clinicalText}`;
    const result = await model.generateContent(prompt);
    
    return {
      source: 'FHIR',
      patientId: patient.id,
      patientName: `${patient.name[0].given.join(' ')} ${patient.name[0].family}`,
      ai_summary: result.response.text()
    };

  } catch (error) {
    return { summary: `Patient with ID '${patientId}' not found or an error occurred on the FHIR server.` };
  }
}

// --- Tool 3: Search Guidelines (Unchanged) ---
export async function searchGuidelines({ topic }: { topic: string }): Promise<any> {
  const mockGuidelines = [{ guidelineId: "GUID-HTN-01", topic: "hypertension", title: "2024 ACC/AHA Guideline for the Management of Hypertension" }];
  const searchTopic = topic.toLowerCase();
  const results = mockGuidelines.filter(g => g.topic.includes(searchTopic));
  return results.length > 0 ? results : { error: `No guidelines found for topic '${topic}'.` };
}
