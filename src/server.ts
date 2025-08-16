import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getSummaryFromDB, getSummaryFromFHIR, searchGuidelines } from "./tools.js";
import swaggerUi from "swagger-ui-express";
import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { JsonObject } from "swagger-ui-express";

const server = new McpServer({
  name: "Clinical-Intelligence-Server",
  version: "1.0.0",
});

// -------- MCP tool registrations --------
server.tool(
  "getSummaryFromDB",
  "Retrieves an AI-generated summary from a patient's clinical notes in the local MIMIC-III database.",
  {
    patientId: z.string().describe("The numeric subject ID for the patient (e.g., '109')")
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
    patientId: z.string().describe("The patient's resource ID on the FHIR server (e.g., '1282007')")
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
    topic: z.string().describe("The clinical topic to search for (e.g., 'hypertension')")
  },
  async (params: { topic: string }) => {
    const result = await searchGuidelines(params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// -------- Express + HTTP transport --------
const app = express();
app.use(express.json());

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try load OpenAPI from dist/ (runtime location). If missing, skip docs.
let swaggerDocument: JsonObject | undefined;
try {
  const openapiPath = path.join(__dirname, "openapi.yaml");
  if (fs.existsSync(openapiPath)) {
    swaggerDocument = yaml.load(fs.readFileSync(openapiPath, "utf8")) as JsonObject;
  } else {
    console.warn("⚠️ openapi.yaml not found in dist/. Skipping /api-docs.");
  }
} catch (e) {
  console.warn("⚠️ Failed to load openapi.yaml. Skipping /api-docs.", e);
}

if (swaggerDocument) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// MCP endpoint
const setupServer = async () => {
  await server.connect(transport);
  app.post("/mcp", async (req: Request, res: Response) => { // Add 'async' here
  await transport.handleRequest(req, res, req.body);      // Add 'await' here
  });
};

// Health check
app.get("/", (_req, res) =>
  res.send("Clinical Intelligence MCP Server is running. Health check OK. API Docs (if available) at /api-docs")
);

// (Optional) Simple REST test routes (handy from Colab without MCP client)
app.post("/tool/getSummaryFromDB", async (req, res) => {
  try {
    const out = await getSummaryFromDB({ patientId: String(req.body?.patientId || "") });
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/tool/getSummaryFromFHIR", async (req, res) => {
  try {
    const out = await getSummaryFromFHIR({ patientId: String(req.body?.patientId || "") });
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/tool/searchGuidelines", async (req, res) => {
  try {
    const out = await searchGuidelines({ topic: String(req.body?.topic || "") });
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

const PORT = process.env.PORT || 3000;
setupServer()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Clinical Intelligence Server listening on port ${PORT}`);
      if (swaggerDocument) {
        console.log(`✅ API Docs available at http://localhost:${PORT}/api-docs`);
      }
    });
  })
  .catch((error) => {
    console.error("❌ Failed to set up the server:", error);
    process.exit(1);
  });
