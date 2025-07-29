// src/server.ts
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
// Import all three of our tool functions
import { getSummaryFromDB, getSummaryFromFHIR, searchGuidelines } from "./tools.js";

// Initialize the MCP Server using the official SDK
const server = new McpServer({
  name: "Clinical-Intelligence-Server",
  version: "1.0.0",
});

// --- Define All Tools ---

// Tool 1: Get summary from the local SQLite database
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

// Tool 2: Get summary from the live, public FHIR server
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

// Tool 3: Search for clinical guidelines
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

// --- Setup Express and the MCP Transport Layer ---
const app = express();
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

const setupServer = async () => {
  await server.connect(transport);
  app.post("/mcp", (req: Request, res: Response) => {
    transport.handleRequest(req, res, req.body);
  });
};

app.get("/", (req, res) => res.send("Clinical Intelligence MCP Server is running."));

const PORT = process.env.PORT || 3000;
setupServer()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Clinical Intelligence Server listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Failed to set up the server:", error);
    process.exit(1);
  });
