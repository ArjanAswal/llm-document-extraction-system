#!/usr/bin/env node
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { runPipeline } from "../services/pipeline.js";

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = "invoices";
  let output = "output/extracted_invoices.csv";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) {
      input = argv[++i]!;
    } else if (arg === "--output" && argv[i + 1]) {
      output = argv[++i]!;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npm run extract -- [--input dir] [--output file]

Options:
  --input   Directory containing PDF invoices (default: invoices)
  --output  Output CSV path (default: output/extracted_invoices.csv)
`);
      process.exit(0);
    }
  }

  return { input, output };
}

async function main(): Promise<void> {
  const { input, output } = parseArgs(process.argv.slice(2));

  if (!process.env.GOOGLE_API_KEY) {
    console.error("Error: GOOGLE_API_KEY is not set. Copy .env.example to .env and add your key.");
    process.exit(1);
  }

  const outputDir = path.dirname(output);
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`Extracting from: ${input}`);
  console.log(`Writing to: ${output}`);

  const records = await runPipeline({ inputDir: input, outputPath: output });
  console.log(`Done. Processed ${records.length} invoice(s).`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
