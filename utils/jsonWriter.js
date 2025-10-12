/**
 * Reads and parses abis_execution_details.json from the workspace root.
 * @param {string} [filePath='abis_execution_details.json'] - Optional custom file path.
 * @returns {object|null} Parsed JSON object or null if error.
 */

const fs = require('fs');

function writeAbisExecutionDetails(detailsJson, filePath = 'abis_execution_details.json') {
  fs.writeFileSync(filePath, JSON.stringify(detailsJson, null, 2));
}

function readAbisExecutionDetails(filePath = 'abis_execution_details.json') {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('Error reading abis_execution_details.json:', err);
    return null;
  }
}

module.exports = { writeAbisExecutionDetails, readAbisExecutionDetails };
