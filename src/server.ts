// src/server.ts
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getPatientSummary, searchGuidelines } from "./tools.js";

// Initialize the MCP Server using the official SDK
const server = new McpServer({
  name: "Clinical-Intelligence-Server",
  version: "1.0.0",
});

// --- Define Tools using the SDK's `server.tool()` method ---

server.tool(
  "getPatientSummary",
  "Retrieves a clinical summary for a specific patient by their ID.",
  {
    patientId: z.string().describe("The unique identifier for the patient (e.g., PID-001)"),
  },
  async (params: { patientId: string }) => {
    console.log(`[SDK Server] Tool call: getPatientSummary for ID ${params.patientId}`);
    const result = await getPatientSummary({ patientId: params.patientId });

    
    // Return the JSON result as a string with type "text"
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "searchGuidelines",
  "Searches for clinical practice guidelines based on a medical topic.",
  {
    topic: z.string().describe("The clinical topic to search for (e.g., 'hypertension')"),
  },
  async (params: { topic: string }) => {
    console.log(`[SDK Server] Tool call: searchGuidelines for topic ${params.topic}`);
    const result = await searchGuidelines(params.topic);
    
    // Return the JSON result as a string with type "text"
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- Setup Express and the MCP Transport Layer ---
const app = express();
app.use(express.json()); // <-- critical!
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

// Connect the server logic to the transport layer and handle requests
const setupServer = async () => {
  await server.connect(transport);
  app.post("/mcp", (req: Request, res: Response) => {
    transport.handleRequest(req, res, req.body);
  });
};

// Health check endpoint
app.get("/", (req, res) => res.send("Clinical Intelligence MCP Server is running."));

// --- Start the server ---
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
