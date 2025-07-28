// src/tools.ts
import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('mimiciii_demo.db');
// --- Mock Data ---
const mockPatients = {
    "PID-001": {
        patientId: "PID-001",
        name: "John Doe",
        dateOfBirth: "1985-04-12",
        lastVisitDate: "2025-07-15",
        activeConditions: ["Hypertension", "Type 2 Diabetes"],
    },
    "PID-002": {
        patientId: "PID-002",
        name: "Jane Smith",
        dateOfBirth: "1992-09-23",
        lastVisitDate: "2025-06-20",
        activeConditions: ["Asthma"],
    }
};

const mockGuidelines = [
    {
        guidelineId: "GUID-HTN-01",
        topic: "hypertension",
        title: "2024 ACC/AHA Guideline for the Management of Hypertension",
        source: "American College of Cardiology / American Heart Association",
    },
    {
        guidelineId: "GUID-DM2-01",
        topic: "diabetes type 2",
        title: "Standards of Care in Diabetes—2025",
        source: "American Diabetes Association (ADA)",
    }
];


export async function getPatientSummary({ patientId }) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM patients WHERE SUBJECT_ID = ?", [patientId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve({ summary: "Patient not found." });
      // Simple summary example
      resolve({
        summary: `Patient ID: ${row.SUBJECT_ID}\nGender: ${row.GENDER}\nDOB: ${row.DOB}\nDOD: ${row.DOD}\nExpired: ${row.EXPIRE_FLAG}`
      });
    });
  });
}

// --- Tool Functions ---
//export async function getPatientSummary(patientId: string): Promise<any> {
 //   console.log(`[Tools] Searching for patient summary: ${patientId}`);
 //   const patient = mockPatients[patientId as keyof typeof mockPatients];
 //   return patient || { error: `Patient with ID '${patientId}' not found.` };
//}

export async function searchGuidelines(topic: string): Promise<any> {
    console.log(`[Tools] Searching for guidelines on topic: ${topic}`);
    const searchTopic = topic.toLowerCase();
    const results = mockGuidelines.filter(g => g.topic.includes(searchTopic));
    return results.length > 0 ? results : { error: `No guidelines found for topic '${topic}'.`};
}
