import sqlite3 from 'sqlite3';
//const db = new sqlite3.Database('mimiciii_demo.db');
// For Colab, use the absolute path!
const db = new sqlite3.Database('/content/mimiciii_demo.db');


type PatientSummaryParams = { patientId: string | number };
type PatientRow = {
  ROW_ID: number;
  SUBJECT_ID: number;
  GENDER: string;
  DOB: string;
  DOD: string;
  EXPIRE_FLAG: number;
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

export async function getPatientSummary({ patientId }: PatientSummaryParams): Promise<{ summary: string }> {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM patients WHERE SUBJECT_ID = ?",
      [patientId],
      (err: Error | null, row: PatientRow | undefined) => {
        if (err) return reject(err);
        if (!row) return resolve({ summary: "Patient not found." });
        resolve({
          summary: `Patient ID: ${row.SUBJECT_ID}\nGender: ${row.GENDER}\nDOB: ${row.DOB}\nDOD: ${row.DOD}\nExpired: ${row.EXPIRE_FLAG}`
        });
      }
    );
  });
}

export async function searchGuidelines(topic: string): Promise<any> {
  console.log(`[Tools] Searching for guidelines on topic: ${topic}`);
  const searchTopic = topic.toLowerCase();
  const results = mockGuidelines.filter(g => g.topic.includes(searchTopic));
  return results.length > 0 ? results : { error: `No guidelines found for topic '${topic}'.` };
}
