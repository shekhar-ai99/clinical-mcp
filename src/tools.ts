// src/tools.ts
import sqlite3 from 'sqlite3';
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- Securely Initialize API Key ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  // This is a critical error, so we stop the application from starting.
  throw new Error("GEMINI_API_KEY environment variable not set. Please check your Colab Secrets.");
}

// --- Initialize Clients ---

// For Colab, use the absolute path to your database file
const db = new sqlite3.Database('/content/clinical-mcp/mimiciii_demo.db');

// Initialize the Google Gemini client with the validated API key.
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});


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
        return resolve({ summary: "A database error occurred." });
      }
      if (!row) {
        return resolve({ summary: "No discharge summary found for this patient." });
      }

      // We found a clinical note, now we send it to the Gemini API.
      try {
        console.log(`[Gemini] Calling API to summarize notes for patient ${patientId}...`);
        
        const prompt = `Summarize the following clinical discharge note into a concise paragraph, focusing on the primary diagnosis and treatment plan: \n\n${row.TEXT}`;
        
        const result = await model.generateContent(prompt);
        const response = result.response;
        const summaryText = response.text();

        // Resolve with the AI-generated summary and some original data for context.
        resolve({
          patientId: patientId,
          noteCategory: row.CATEGORY,
          ai_summary: summaryText
        });

      } catch (geminiError) {
        console.error("Gemini API Error:", geminiError);
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
