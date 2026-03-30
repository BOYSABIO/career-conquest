import * as fs from "fs";
import * as path from "path";

interface Application {
  company: string;
  position: string;
  date: string;
  status: "applied" | "reject" | "interview" | "offer";
  link: string;
  category: "company" | "startup";
}

const ROOT = process.env.VAULT_PATH
  ? path.resolve(process.env.VAULT_PATH)
  : path.resolve(__dirname, "../../");
const POSITIONS_DIR = path.join(ROOT, "Applications", "Positions");
const MASTER_LIST = path.join(ROOT, "MASTER_APP_LIST.md");
const OUTPUT_DIR = path.join(__dirname, "..", "public", "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "applications.json");

function parseStatusTag(raw: string): Application["status"] {
  const lower = raw.toLowerCase().replace("#", "").trim();
  if (lower.includes("reject")) return "reject";
  if (lower.includes("interview")) return "interview";
  if (lower.includes("offer")) return "offer";
  return "applied";
}

function parsePositionFile(
  filePath: string
): Omit<Application, "company" | "category"> | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").map((l) => l.trim());

    let date = "";
    let status: Application["status"] = "applied";
    let link = "";

    for (const line of lines) {
      if (line.toLowerCase().startsWith("date:")) {
        date = line.substring(5).trim();
      } else if (line.toLowerCase().startsWith("status:")) {
        status = parseStatusTag(line.substring(7).trim());
      } else if (line.toLowerCase().startsWith("link:")) {
        const linkContent = line.substring(5).trim();
        const urlMatch = linkContent.match(/https?:\/\/[^\s\])]+/);
        link = urlMatch ? urlMatch[0] : linkContent;
      }
    }

    const position = path.basename(filePath, ".md");

    return { position, date, status, link };
  } catch {
    return null;
  }
}

function parseMasterList(): Map<
  string,
  { company: string; category: "company" | "startup"; masterStatus?: string }
> {
  const content = fs.readFileSync(MASTER_LIST, "utf-8");
  const lines = content.split("\n");

  const positionToCompany = new Map<
    string,
    { company: string; category: "company" | "startup"; masterStatus?: string }
  >();

  for (const line of lines) {
    if (!line.includes("[[") || line.includes("---")) continue;

    // First extract all wikilinks before splitting by pipe,
    // since wikilinks like [[path|alias]] contain pipes themselves
    const wikilinks: string[] = [];
    const cleanedLine = line.replace(/\[\[[^\]]*\]\]/g, (match) => {
      const idx = wikilinks.push(match) - 1;
      return `__WIKILINK_${idx}__`;
    });

    const cells = cleanedLine.split("|").map((c) => c.trim());
    if (cells.length < 3) continue;

    const companyCell = cells[1];
    const positionCell = cells[2];

    // Resolve wikilink placeholders back
    const resolveWikilink = (placeholder: string): string => {
      const match = placeholder.match(/__WIKILINK_(\d+)__/);
      return match ? wikilinks[parseInt(match[1])] : placeholder;
    };

    const companyResolved = companyCell.replace(/__WIKILINK_\d+__/g, resolveWikilink);
    const positionResolved = positionCell.replace(/__WIKILINK_\d+__/g, resolveWikilink);

    const companyMatch = companyResolved.match(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/);
    if (!companyMatch) continue;
    const company = companyMatch[1].trim();

    // Get master list status from column 3 if it exists
    const statusCell = cells.length > 3 ? cells[3]?.trim() : undefined;
    const masterStatus = statusCell && statusCell.length > 0 ? statusCell : undefined;

    const positionMatches = positionResolved.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const pm of positionMatches) {
      const posName = pm[1].trim();
      positionToCompany.set(posName, { company, category: "company", masterStatus });
    }
  }

  return positionToCompany;
}

function detectStartups(): Set<string> {
  const startupDir = path.join(ROOT, "Applications", "Startups");
  if (!fs.existsSync(startupDir)) return new Set();
  return new Set(
    fs.readdirSync(startupDir).map((f) => path.basename(f, ".md"))
  );
}

function main() {
  const masterMap = parseMasterList();
  const startups = detectStartups();

  const positionFiles = fs
    .readdirSync(POSITIONS_DIR)
    .filter((f) => f.endsWith(".md"));

  const applications: Application[] = [];

  for (const file of positionFiles) {
    const parsed = parsePositionFile(path.join(POSITIONS_DIR, file));
    if (!parsed) continue;

    const posName = path.basename(file, ".md");
    const mapping = masterMap.get(posName);

    const company = mapping?.company ?? "Unknown";
    const isStartup = startups.has(company);

    // Master list status overrides position file if position file just says "applied"
    let finalStatus = parsed.status;
    if (mapping?.masterStatus && parsed.status === "applied") {
      finalStatus = parseStatusTag(mapping.masterStatus);
    }

    applications.push({
      ...parsed,
      status: finalStatus,
      company,
      category: isStartup ? "startup" : "company",
    });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(applications, null, 2));

  console.log(`Parsed ${applications.length} applications`);
  console.log(`Output: ${OUTPUT_FILE}`);

  const stats = {
    total: applications.length,
    applied: applications.filter((a) => a.status === "applied").length,
    rejected: applications.filter((a) => a.status === "reject").length,
    interview: applications.filter((a) => a.status === "interview").length,
    offer: applications.filter((a) => a.status === "offer").length,
  };
  console.log("Stats:", stats);
}

main();
