import * as fs from 'fs';

/**
 * Reads and parses abis_execution_details.json from the workspace root.
 * @param filePath Optional custom file path.
 * @returns Parsed JSON object or null if error.
 */
export function writeAbisExecutionDetails(detailsJson: any, filePath = 'abis_execution_details.json'): void {
  fs.writeFileSync(filePath, JSON.stringify(detailsJson, null, 2));
}

export function readAbisExecutionDetails(filePath = 'abis_execution_details.json'): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error reading abis_execution_details.json:', err);
    return null;
  }
}
