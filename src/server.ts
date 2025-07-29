// src/server.ts
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getSummaryFromDB, getSummaryFromFHIR, searchGuidelines } from "./tools.js";

// --- Import Swagger and YAML libraries ---
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Initialize the MCP Server
const server = new McpServer({
  name: "Clinical-Intelligence-Server",
  version: "1.0.0",
});

// --- Define All Tools (No changes here) ---

server.tool(
  "getSummaryFromDB",
  "Retrieves an AI-generated summary from a patient's clinical notes in the local MIMIC-III database.",
  {
    patientId: z.string().describe("The numeric subject ID for the patient (e.g., '109')"),
  },
  async (params: { patientId: string }) => {
    const result = await getSummaryFromDB(params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "getSummaryFromFHIR",
  "Retrieves an AI-generated summary from a patient's data on a live, public FHIR server.",
  {
    patientId: z.string().describe("The patient's resource ID on the FHIR server (e.g., '1282007')"),
  },
  async (params: { patientId: string }) => {
    const result = await getSummaryFromFHIR(params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "searchGuidelines",
  "Searches for clinical practice guidelines based on a medical topic.",
  {
    topic: z.string().describe("The clinical topic to search for (e.g., 'hypertension')"),
  },
  async (params: { topic: string }) => {
    const result = await searchGuidelines(params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// --- Setup Express and Endpoints ---
const app = express();
app.use(express.json()); 
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

// --- Setup for API Documentation ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const swaggerDocument = yaml.load(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));

// This creates the new /api-docs endpoint
// FIX: We cast swaggerDocument to 'any' to resolve the TypeScript error.
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument as any));


// --- Setup MCP and Health Check Endpoints ---
const setupServer = async () => {
  await server.connect(transport);
  app.post("/mcp", (req: Request, res: Response) => {
    transport.handleRequest(req, res, req.body);
  });
};

app.get("/", (req, res) => res.send("Clinical Intelligence MCP Server is running. Health check OK. API Docs are at /api-docs"));

const PORT = process.env.PORT || 3000;
setupServer()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Clinical Intelligence Server listening on port ${PORT}`);
      console.log(`✅ API Docs available at http://localhost:${PORT}/api-docs`);
    });
  })
  .catch((error) => {
    console.error("❌ Failed to set up the server:", error);
    process.exit(1);
  });
