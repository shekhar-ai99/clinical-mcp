// src/tools.ts
import sqlite3 from 'sqlite3';
import { HfInference } from "@huggingface/inference";

// --- Initialize Clients ---

// For Colab, use the absolute path to your database file
const db = new sqlite3.Database('/content/mimiciii_demo.db');

// Initialize the Hugging Face client with your token.
// IMPORTANT: Replace "YOUR_HF_TOKEN" with your actual token.
const hf = new HfInference("YOUR_HF_TOKEN");


// --- Type Definitions ---

type PatientSummaryParams = { patientId: string | number };

// This type represents a row from the NOTEEVENTS table in the MIMIC-III demo DB
type NoteEventRow = {
  CATEGORY: string;
  DESCRIPTION: string;
  TEXT: string;
};

// --- Tool Functions ---

export async function getPatientSummary({ patientId }: PatientSummaryParams): Promise<any> {
  return new Promise((resolve, reject) => {
    // We query the NOTEEVENTS table to get clinical notes for the patient.
    const sql = "SELECT CATEGORY, DESCRIPTION, TEXT FROM NOTEEVENTS WHERE SUBJECT_ID = ? AND CATEGORY = 'Discharge summary' LIMIT 1";
    
    db.get(sql, [patientId], async (err: Error | null, row: NoteEventRow | undefined) => {
      if (err) {
        console.error("Database Error:", err);
        return reject(err);
      }
      if (!row) {
        return resolve({ summary: "No discharge summary found for this patient." });
      }

      // We found a clinical note, now we send it to the Hugging Face API.
      try {
        console.log(`[HF] Calling API to summarize notes for patient ${patientId}...`);
        const summaryResult = await hf.summarization({
            model: 'facebook/bart-large-cnn',
            inputs: row.TEXT, // The clinical note text from the database
        });

        // Resolve with the AI-generated summary and some original data for context.
        resolve({
          patientId: patientId,
          noteCategory: row.CATEGORY,
          ai_summary: summaryResult.summary_text
        });

      } catch (hfError) {
        console.error("Hugging Face API Error:", hfError);
        // If the API fails, we still return a useful message.
        resolve({ summary: "Found patient notes, but failed to generate AI summary." });
      }
    });
  });
}

export async function searchGuidelines(topic: string): Promise<any> {
  // This function remains unchanged.
  const mockGuidelines = [
    {
      guidelineId: "GUID-HTN-01",
      topic: "hypertension",
      title: "2024 ACC/AHA Guideline for the Management of Hypertension",
    }
  ];
  const searchTopic = topic.toLowerCase();
  const results = mockGuidelines.filter(g => g.topic.includes(searchTopic));
  return results.length > 0 ? results : { error: `No guidelines found for topic '${topic}'.` };
}
